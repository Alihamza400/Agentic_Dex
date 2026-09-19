"""
Agentic DEX orchestrator.

A Gemini-driven "senior quant" agent that reads live blockchain + market data
through the MCP tool layer and can execute swaps/liquidity operations on-chain.

Unlike the previous version this:
  * imports everything it uses (it used to crash every cycle with a NameError),
  * runs a real async tool-calling loop instead of fighting nested event loops,
  * keeps working when MySQL is down by reading the chain directly,
  * reads the agent config (strategy/risk/active) written by the frontend.

Usage:
    uv run dex-agent                 # continuous loop (interval from .env)
    uv run dex-agent --once          # a single LLM cycle, then exit
    uv run dex-agent --self-test     # read + print market data, no LLM calls
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

import aiomysql
from dotenv import load_dotenv

from dex_mcp.config import (
    AGENT_INTERVAL_SECONDS,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
    describe,
    load_tokens,
)
from dex_mcp.MCP_Server import (
    DatabaseUnavailable,
    _execute_arbitrage,
    _execute_trade,
    _get_balances,
    _get_liquidity_stats,
    _get_live_pool_state,
    _get_market_context,
    _get_pools_for_agent,
    _get_price_trend,
    _get_recent_swaps,
    _get_risk_metrics,
    _get_tokens,
    _manage_liquidity,
    _record_agent_decision,
    _search_market_history,
    close_pool,
    get_pool,
)

load_dotenv()

MAX_TOOL_ROUNDS = 2

SYSTEM_INSTRUCTION = """Senior Quant Orchestrator. OODA loop: Observe→Orient→Decide→Act.
Tools: get_pool_addresses, get_market_context, get_balances, execute_trade, execute_arbitrage.
Rules: max 10% wallet per trade, 1% slippage, only trade on clear positive edge after 0.3% fee.
Reply with: DECISION (HOLD/TRADE/ARB), amounts in wei, reasoning."""

# ── Tool registry (name -> async callable) ────────────────────────────────────
TOOLS = {
    "get_market_context": _get_market_context,
    "get_pool_addresses": _get_pools_for_agent,
    "get_deployed_tokens": _get_tokens,
    "get_live_pool_state": _get_live_pool_state,
    "get_balances": _get_balances,
    "get_recent_swaps": _get_recent_swaps,
    "get_price_trend": _get_price_trend,
    "get_liquidity_stats": _get_liquidity_stats,
    "get_risk_metrics": _get_risk_metrics,
    "search_market_history": _search_market_history,
    "execute_trade": _execute_trade,
    "execute_arbitrage": _execute_arbitrage,
    "manage_liquidity": _manage_liquidity,
}

async def call_tool(name: str, args: dict) -> dict | list:
    """Invoke one MCP tool by name, never raising into the agent loop."""
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        result = await tool(**args)
        return result if result is not None else {"result": "ok"}
    except TypeError as exc:
        return {"error": f"Bad arguments for {name}: {exc}"}
    except DatabaseUnavailable as exc:
        return {"error": f"Database unavailable: {exc}"}
    except Exception as exc:  # noqa: BLE001 - tool failures must not kill the loop
        return {"error": f"{type(exc).__name__}: {exc}"}


async def read_agent_config() -> dict:
    """Strategy/risk/active flags set from the frontend; sensible defaults if the DB is down."""
    default = {"strategy": "arbitrage", "risk_level": "medium", "is_active": 1}
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM agent_config WHERE id = 1")
                row = await cur.fetchone()
        if not row:
            return default
        return {**default, **{k: v for k, v in row.items() if v is not None}}
    except Exception as exc:
        print(f"[warn] agent_config unavailable ({exc}); using defaults", file=sys.stderr)
        return default


async def collect_market_data() -> dict:
    """Everything the agent needs, gathered from the MCP tool layer."""
    pools = await call_tool("get_pool_addresses", {})
    balances = await call_tool("get_balances", {})

    # Compact pools: only symbols + spot price + reserves
    compact_pools = []
    for p in (pools if isinstance(pools, list) else []):
        compact_pools.append({
            "pair": p.get("pairAddress", "?"),
            "t0": p.get("token0Symbol", "?"),
            "t1": p.get("token1Symbol", "?"),
            "r0": p.get("reserve0", "0"),
            "r1": p.get("reserve1", "0"),
            "price": p.get("spotPrice", "0"),
        })

    return {
        "pools": compact_pools,
        "wallet_balances": balances,
    }


async def run_llm_cycle(strategy: str, risk: str) -> None:
    """One full LLM-driven decision cycle using OpenAI-compatible API (OpenRouter)."""
    import httpx
    from openai import OpenAI

    client = OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
        http_client=httpx.Client(verify=False),
    )

    data = await collect_market_data()
    prompt = (
        f"{json.dumps(data, default=str)}\n"
        f"Strategy={strategy} Risk={risk}\n"
        "If arbitrage exists, execute it. Otherwise HOLD."
    )

    messages = [
        {"role": "system", "content": SYSTEM_INSTRUCTION},
        {"role": "user", "content": prompt},
    ]

    tool_calls: list[dict] = []
    rounds = 0

    # Minimal tool set to stay within token budget
    openai_tools = [
        {
            "type": "function",
            "function": {
                "name": "get_pool_addresses",
                "description": "List all trading pairs with token symbols and addresses.",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_market_context",
                "description": "Latest reserves, spot price for every pair.",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_balances",
                "description": "Wallet token balances (human-readable).",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "execute_trade",
                "description": "Swap token_in for token_out on-chain. Amounts in wei.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "token_in": {"type": "string"},
                        "token_out": {"type": "string"},
                        "amount_in": {"type": "string"},
                    },
                    "required": ["token_in", "token_out", "amount_in"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "execute_arbitrage",
                "description": "Multi-hop swap path. Amounts in wei.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "array", "items": {"type": "string"}},
                        "amount_in": {"type": "string"},
                        "min_amount_out": {"type": "string"},
                    },
                    "required": ["path", "amount_in"],
                },
            },
        },
    ]

    # Initial LLM call
    response = await asyncio.to_thread(
        lambda: client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=messages,
            tools=openai_tools,
            tool_choice="auto",
            max_tokens=400,
        )
    )

    while response.choices and response.choices[0].message.tool_calls and rounds < MAX_TOOL_ROUNDS:
        rounds += 1
        assistant_msg = response.choices[0].message
        messages.append(assistant_msg)

        for tc in assistant_msg.tool_calls:
            fn_name = tc.function.name
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}

            print(f"  -> tool {fn_name}({json.dumps(args, default=str)[:200]})")
            result = await call_tool(fn_name, args)
            tool_calls.append({"tool": fn_name, "args": args, "result": result})
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, default=str),
            })

        response = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=OPENROUTER_MODEL,
                messages=messages,
                tools=openai_tools,
                tool_choice="auto",
                max_tokens=400,
            )
        )

    try:
        summary = response.choices[0].message.content or "(no text response)"
    except Exception:
        summary = "(the model returned no text - see toolCalls context)"

    print("\n[Senior Quant Log]\n" + summary)

    await _record_agent_decision(
        agent="Quant_Orchestrator",
        action="QUANT_ANALYSIS",
        reason=summary[:4000],
        confidence=1.0,
        context={"strategy": strategy, "risk": risk, "toolCalls": tool_calls},
    )


async def process_agent_loop() -> None:
    config = await read_agent_config()
    if not config.get("is_active"):
        print(f"[{time.strftime('%H:%M:%S')}] Agent INACTIVE in agent_config. Skipping cycle.")
        return

    strategy = config.get("strategy", "arbitrage")
    risk = config.get("risk_level", "medium")
    print(f"[{time.strftime('%H:%M:%S')}] Agent ACTIVE - strategy={strategy} risk={risk}")

    if not OPENROUTER_API_KEY:
        print("CRITICAL: OPENROUTER_API_KEY is not set, cannot run the LLM cycle.")
        return

    try:
        await run_llm_cycle(strategy, risk)
    except Exception as exc:  # noqa: BLE001 - one bad cycle must not kill the agent
        print(f"!!! Cycle error: {type(exc).__name__}: {exc}")


async def self_test() -> int:
    """Exercises the read path the agent depends on - no LLM, no writes."""
    print("=" * 60)
    print("  AGENT SELF-TEST (blockchain data path)")
    print("=" * 60)
    print(describe() + "\n")

    config = await read_agent_config()
    print(f"agent_config: {config}\n")

    data = await collect_market_data()
    pools = data["pools"]
    market = data["market_context"]

    print(f"pools discovered      : {len(pools) if isinstance(pools, list) else 'error'}")
    for pool in pools if isinstance(pools, list) else []:
        print(f"  {pool.get('symbol0')}/{pool.get('symbol1')} {pool.get('pair')}")

    print(f"market snapshots      : {len(market) if isinstance(market, list) else 'error'}")
    if isinstance(market, list) and market:
        print(f"  sample: {json.dumps(market[0], default=str)[:300]}")

    print(f"deployed tokens       : {len(data['tokens']) if isinstance(data['tokens'], dict) else 'error'}")
    print(f"wallet balances       : {json.dumps(data['wallet_balances'], default=str)}")

    if isinstance(pools, list) and pools:
        pair = pools[0].get("pair")
        state = await call_tool("get_live_pool_state", {"pair_address": pair})
        print(f"live pool state       : {json.dumps(state, default=str)[:300]}")
        swaps = await call_tool("get_recent_swaps", {"n": 5})
        print(f"recent swaps          : {len(swaps) if isinstance(swaps, list) else 'error'}")
        risk = await call_tool("get_risk_metrics", {"pair_address": pair})
        print(f"risk metrics          : {json.dumps(risk, default=str)[:200]}")

    ok = isinstance(pools, list) and len(pools) > 0 and isinstance(data["tokens"], dict) and data["tokens"]
    print("\nRESULT:", "PASS - the agent can read live blockchain data" if ok else "FAIL - no pools/tokens found")
    return 0 if ok else 1


async def main_async(once: bool, self_test_mode: bool) -> int:
    if self_test_mode:
        return await self_test()

    print("=" * 60)
    print("  AGENTIC DEX ORCHESTRATOR")
    print("=" * 60)

    if once:
        await process_agent_loop()
        await close_pool()
        return 0

    while True:
        await process_agent_loop()
        print(f"\n[Cycle pause] next sweep in {AGENT_INTERVAL_SECONDS}s...")
        await asyncio.sleep(AGENT_INTERVAL_SECONDS)


def main() -> None:
    parser = argparse.ArgumentParser(description="Agentic DEX AI orchestrator")
    parser.add_argument("--once", action="store_true", help="run a single cycle and exit")
    parser.add_argument("--self-test", action="store_true", help="read + print market data, no LLM")
    parser.add_argument("--interval", type=int, default=None, help="override the cycle interval")
    args = parser.parse_args()

    if args.interval:
        os.environ["AGENT_INTERVAL_SECONDS"] = str(args.interval)

    try:
        code = asyncio.run(main_async(args.once, args.self_test))
    except KeyboardInterrupt:
        print("\nGraceful shutdown.")
        code = 0
    raise SystemExit(code)


if __name__ == "__main__":
    main()
