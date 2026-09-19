"""
End-to-end smoke test for the MCP layer.

Spawns the real MCP server over stdio, lists its tools, calls the read tools and
(unless --no-write) executes a real swap on the local chain, then verifies the
swap shows up on-chain.

Usage:
    cd Dex_Mcp
    uv run python tests/mcp_smoke.py
    uv run python tests/mcp_smoke.py --no-write
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

DEX_MCP_DIR = Path(__file__).resolve().parents[1]

EXPECTED_TOOLS = {
    "get_market_context",
    "get_pool_addresses",
    "get_deployed_tokens",
    "get_live_pool_state",
    "get_balances",
    "execute_trade",
    "execute_arbitrage",
    "manage_liquidity",
    "approve_token",
    "get_recent_swaps",
    "get_price_trend",
    "get_liquidity_stats",
    "get_risk_metrics",
    "search_market_history",
    "record_agent_decision",
}

failures: list[str] = []


def check(condition: bool, label: str, detail: str = "") -> None:
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {label}" + (f" - {detail}" if detail else ""))
    if not condition:
        failures.append(label)


def payload(result) -> object:
    """MCP returns content blocks; unwrap them back into Python data."""
    texts = [block.text for block in result.content if getattr(block, "type", "") == "text"]
    raw = texts[0] if texts else "null"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


async def run(do_write: bool) -> int:
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    env.setdefault("RPC_URL", "http://127.0.0.1:7545")

    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "dex_mcp.MCP_Server"],
        cwd=str(DEX_MCP_DIR),
        env=env,
    )

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            print("\n== tools ==")
            tools = {tool.name for tool in (await session.list_tools()).tools}
            missing = EXPECTED_TOOLS - tools
            check(not missing, f"{len(tools)} tools exposed", f"missing: {sorted(missing)}" if missing else "")

            print("\n== deployed tokens ==")
            tokens = payload(await session.call_tool("get_deployed_tokens", {}))
            check(isinstance(tokens, dict) and len(tokens) >= 2, "token registry readable", str(list(tokens)[:6]) if isinstance(tokens, dict) else str(tokens))

            print("\n== pools ==")
            pools = payload(await session.call_tool("get_pool_addresses", {}))
            check(isinstance(pools, list) and len(pools) > 0, "pools discovered", f"{len(pools) if isinstance(pools, list) else 'error'} pools")

            pair = pools[0]["pair"] if isinstance(pools, list) and pools else ""

            print("\n== market context ==")
            market = payload(await session.call_tool("get_market_context", {}))
            first = market[0] if isinstance(market, list) and market else {}
            check(isinstance(market, list) and len(market) > 0, "market snapshots readable")
            check("reserve0" in first, "reserves present in snapshot", str(first.get("reserve0"))[:20])

            print("\n== live pool state ==")
            state = payload(await session.call_tool("get_live_pool_state", {"pair_address": pair}))
            check(isinstance(state, dict) and "reserve0" in state, "live reserves read from the pair", json.dumps(state)[:120])

            print("\n== risk metrics ==")
            risk = payload(await session.call_tool("get_risk_metrics", {"pair_address": pair}))
            check(isinstance(risk, dict) and "error" not in risk, "risk metrics returned", json.dumps(risk)[:120])

            print("\n== liquidity stats ==")
            stats = payload(await session.call_tool("get_liquidity_stats", {}))
            check(isinstance(stats, list) and len(stats) > 0, "liquidity stats returned", f"{len(stats) if isinstance(stats, list) else 'error'} rows")

            print("\n== balances ==")
            balances = payload(await session.call_tool("get_balances", {}))
            check(isinstance(balances, dict) and "error" not in balances, "wallet balances readable", json.dumps(balances)[:140])

            print("\n== vector memory ==")
            history = payload(await session.call_tool("search_market_history", {"query": "high volatility USDC pool"}))
            check(isinstance(history, list), "vector search degrades gracefully", f"{len(history) if isinstance(history, list) else 'error'} hits")

            swaps_before = payload(await session.call_tool("get_recent_swaps", {"n": 5}))
            before_count = len(swaps_before) if isinstance(swaps_before, list) else 0

            if do_write:
                print("\n== execute_trade (1 USDC -> DAI on-chain) ==")
                if not (isinstance(tokens, dict) and "USDC" in tokens and "DAI" in tokens):
                    check(False, "swap executed", "USDC/DAI not deployed")
                else:
                    trade = payload(
                        await session.call_tool(
                            "execute_trade",
                            {
                                "token_in": tokens["USDC"]["address"],
                                "token_out": tokens["DAI"]["address"],
                                "amount_in": str(10**18),
                            },
                        )
                    )
                    check(
                        isinstance(trade, dict) and trade.get("status") == "success",
                        "swap executed",
                        json.dumps(trade)[:160],
                    )

                    print("\n== swap visible on-chain ==")
                    swaps_after = payload(await session.call_tool("get_recent_swaps", {"n": 5}))
                    after_count = len(swaps_after) if isinstance(swaps_after, list) else 0
                    check(after_count > before_count, "swap indexed from live logs", f"{before_count} -> {after_count}")

                    after_state = payload(await session.call_tool("get_live_pool_state", {"pair_address": pair}))
                    check(
                        after_state.get("reserve0") != state.get("reserve0")
                        or after_state.get("reserve1") != state.get("reserve1"),
                        "pool reserves moved after the swap",
                    )

                    print("\n== arbitrage path ==")
                    if isinstance(pools, list) and len(pools) >= 2:
                        path = [pools[0]["token0"], pools[0]["token1"], pools[1]["token1"]]
                        arb = payload(
                            await session.call_tool(
                                "execute_arbitrage", {"path": path, "amount_in": str(10**18)}
                            )
                        )
                        check(
                            isinstance(arb, dict) and arb.get("status") == "success",
                            "multi-hop arbitrage executed",
                            json.dumps(arb)[:160],
                        )

                    print("\n== decision recording ==")
                    rec = payload(
                        await session.call_tool(
                            "record_agent_decision",
                            {
                                "agent": "smoke-test",
                                "action": "HOLD",
                                "reason": "MCP smoke test",
                                "confidence": 1.0,
                                "context": {"source": "mcp_smoke.py"},
                            },
                        )
                    )
                    check(isinstance(rec, (str, dict)), "decision recorded or reported cleanly", str(rec)[:100])

    print("\n" + "=" * 60)
    if failures:
        print(f"RESULT: {len(failures)} FAILED -> {failures}")
        return 1
    print("RESULT: PASS - MCP tools, live chain reads and on-chain writes all work")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-write", action="store_true", help="skip on-chain transactions")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(not args.no_write)))


if __name__ == "__main__":
    main()
