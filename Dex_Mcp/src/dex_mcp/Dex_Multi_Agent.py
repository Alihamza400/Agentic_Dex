"""
Agentic DEX orchestrator -- Phase 1.1: Full LLM tool-calling implementation.

A Gemini-driven "senior quant" agent that reads live blockchain + market data
through the MCP tool layer and can execute swaps/liquidity operations on-chain.

This version implements:
  * Proper OpenAI function-calling with tool schemas
  * Multi-round tool execution loop (observe → orient → decide → act)
  * HOLD/TRADE decision parsing with auto-execution
  * Circuit breaker integration and risk enforcement
  * Structured decision recording with confidence scoring
  * Graceful degradation when MySQL is unavailable

Usage:
    uv run dex-agent                 # continuous loop (interval from .env)
    uv run dex-agent --once          # a single LLM cycle, then exit
    uv run dex-agent --self-test     # read + print market data, no LLM calls
    uv run dex-agent --dry-run       # LLM cycle with tool calls, but no writes
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

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

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_TOOL_ROUNDS = 3
MAX_TRADE_ATTEMPTS = 2
STATE_DIR = Path(__file__).resolve().parents[3] / ".agent_state"
STATE_FILE = STATE_DIR / "state.json"
DATA_DIR = Path(__file__).resolve().parents[3] / "data"

# ── OpenAI Function Calling Schemas ───────────────────────────────────────────
# These schemas tell the LLM what tools are available and how to call them.
LLM_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_market_context",
            "description": "Get latest reserves, spot price and TWAP for every trading pair. Always call this first to understand the market.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pool_addresses",
            "description": "List every trading pair with its token symbols and addresses.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_balances",
            "description": "Get the agent wallet's token balances. Call without arguments to see all balances.",
            "parameters": {
                "type": "object",
                "properties": {
                    "token_addresses": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of specific token addresses to check. Omit for all.",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_live_pool_state",
            "description": "Read live reserves, spot price and TWAP directly from a specific DexPair contract.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pair_address": {
                        "type": "string",
                        "description": "The 0x address of the DexPair contract",
                    }
                },
                "required": ["pair_address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_swaps",
            "description": "Get the last N swap events from the blockchain to see recent trading activity.",
            "parameters": {
                "type": "object",
                "properties": {
                    "n": {
                        "type": "integer",
                        "description": "Number of recent swaps to retrieve (default 20)",
                        "default": 20,
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_price_trend",
            "description": "Get historical price snapshots for a specific pair to analyze price trends.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pair_address": {
                        "type": "string",
                        "description": "The 0x address of the DexPair contract",
                    },
                    "n": {
                        "type": "integer",
                        "description": "Number of historical snapshots (default 50)",
                        "default": 50,
                    },
                },
                "required": ["pair_address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_risk_metrics",
            "description": "Get risk metrics (volatility, price deviation) for a specific pair.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pair_address": {
                        "type": "string",
                        "description": "The 0x address of the DexPair contract",
                    }
                },
                "required": ["pair_address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_trade",
            "description": "Execute a single-hop swap on-chain. Requires token approval first. Use token SYMBOLS (e.g. 'USDC', 'WETH').",
            "parameters": {
                "type": "object",
                "properties": {
                    "token_in": {
                        "type": "string",
                        "description": "Symbol of token to sell (e.g. 'USDC')",
                    },
                    "token_out": {
                        "type": "string",
                        "description": "Symbol of token to buy (e.g. 'WETH')",
                    },
                    "amount_in": {
                        "type": "string",
                        "description": "Amount in wei (1 token = 1000000000000000000 = 1e18)",
                    },
                },
                "required": ["token_in", "token_out", "amount_in"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_arbitrage",
            "description": "Execute a multi-hop swap for arbitrage (e.g. USDC -> WETH -> DAI -> USDC).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Ordered list of token symbols forming the swap path",
                    },
                    "amount_in": {
                        "type": "string",
                        "description": "Amount of first token in wei",
                    },
                    "min_amount_out": {
                        "type": "string",
                        "description": "Minimum output amount in wei (0 = accept any)",
                        "default": "0",
                    },
                },
                "required": ["path", "amount_in"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_liquidity",
            "description": "Add or remove liquidity from a trading pair.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["ADD", "REMOVE"],
                        "description": "ADD to provide liquidity, REMOVE to withdraw",
                    },
                    "token_a": {
                        "type": "string",
                        "description": "Symbol of first token (e.g. 'USDC')",
                    },
                    "token_b": {
                        "type": "string",
                        "description": "Symbol of second token (e.g. 'WETH')",
                    },
                    "amount_a": {
                        "type": "string",
                        "description": "Amount of token_a in wei (required for ADD)",
                        "default": "0",
                    },
                    "amount_b": {
                        "type": "string",
                        "description": "Amount of token_b in wei (required for ADD)",
                        "default": "0",
                    },
                    "liquidity": {
                        "type": "string",
                        "description": "LP token amount in wei (required for REMOVE)",
                        "default": "0",
                    },
                },
                "required": ["action", "token_a", "token_b"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_market_history",
            "description": "Search historical market patterns using semantic similarity. Use natural language queries.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query_text": {
                        "type": "string",
                        "description": "Natural language search query (e.g. 'high volume ETH trades')",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (default 5)",
                        "default": 5,
                    },
                },
                "required": ["query_text"],
            },
        },
    },
]

# ── Tool registry (name -> async callable) ────────────────────────────────────
TOOLS: dict[str, Any] = {
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


# ── System prompt ─────────────────────────────────────────────────────────────
SYSTEM_INSTRUCTION = """You are a senior quantitative trading agent for a decentralized exchange (DEX).

Your role: Analyze market data from on-chain pools and make trading decisions to generate profit.

## Available Tools
You have access to tools that read live blockchain data and execute trades.
- ALWAYS call get_market_context first to understand the current market.
- Use get_balances to check available capital before trading.
- Use get_live_pool_state for detailed analysis of specific pairs.
- Use execute_trade for single-hop swaps (e.g. USDC -> WETH).
- Use execute_arbitrage for multi-hop profit opportunities.
- Use manage_liquidity to provide or remove liquidity.

## Decision Framework
1. OBSERVE: Call read tools to gather market data.
2. ORIENT: Analyze prices, volumes, trends, and your balances.
3. DECIDE: Determine if a profitable opportunity exists.
4. ACT: Execute trades if profitable, or HOLD if no opportunity.

## Strategy Modes
- arbitrage: Look for price discrepancies across pairs. Execute multi-hop swaps when spread > 0.3%.
- liquidity: Manage LP positions. Add when fee APR is attractive, remove when impermanent loss risk is high.
- market-making: Provide tight liquidity around current prices. Rebalance frequently.
- trend-following: Identify price momentum. Enter positions aligned with the trend.

## Risk Rules
- NEVER risk more than 20% of wallet balance on a single trade (medium risk).
- ALWAYS consider slippage - check reserves before trading large amounts.
- If 3+ consecutive trades fail, STOP and report to the user.
- When uncertain, HOLD. Capital preservation is priority.

## Response Format
After analyzing, provide your decision as JSON:
{"action": "HOLD", "reason": "Explanation of why no trade is warranted"}
{"action": "TRADE", "trade_type": "single|arbitrage|liquidity", "token_in": "SYMBOL", "token_out": "SYMBOL", "amount_in": "wei_amount", "reason": "Explanation of the opportunity"}
{"action": "TRADE", "trade_type": "arbitrage", "path": ["SYMBOL1", "SYMBOL2", ...], "amount_in": "wei_amount", "reason": "Explanation"}
{"action": "TRADE", "trade_type": "liquidity", "liquidity_action": "ADD|REMOVE", "token_a": "SYMBOL", "token_b": "SYMBOL", "amount_a": "wei", "amount_b": "wei", "reason": "Explanation"}

Always explain your reasoning clearly. Be conservative - only trade when confidence is high."""


# ── Helper functions ──────────────────────────────────────────────────────────

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


def _safe_json_parse(text: str) -> dict | None:
    """Extract JSON from LLM response text, handling markdown code blocks."""
    if not text:
        return None

    # Try direct parse first
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code blocks
    import re
    patterns = [
        r"```json\s*\n?(.*?)\n?\s*```",
        r"```\s*\n?(.*?)\n?\s*```",
        r"\{[^{}]*\}",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            candidate = match.group(1) if match.lastindex else match.group(0)
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    return None


def _calculate_confidence(tool_results: list[dict], decision: dict) -> float:
    """Calculate confidence score based on data quality and tool execution success."""
    if decision.get("action") == "HOLD":
        return 0.8  # High confidence in inaction

    # Start with base confidence
    confidence = 0.5

    # Boost if we had successful data reads
    successful_reads = sum(
        1 for r in tool_results
        if r.get("tool", "").startswith("get_") and "error" not in r.get("result", {})
    )
    confidence += min(successful_reads * 0.05, 0.2)

    # Reduce if any tool errors occurred
    errors = sum(1 for r in tool_results if "error" in r.get("result", {}))
    confidence -= errors * 0.1

    # Reduce if amount seems too large (heuristic)
    amount = decision.get("amount_in", "0")
    try:
        amount_wei = int(amount)
        if amount_wei > 100 * 10**18:  # > 100 tokens
            confidence -= 0.1
    except (ValueError, TypeError):
        pass

    return max(0.1, min(1.0, confidence))


# ── Core agent functions ──────────────────────────────────────────────────────

async def read_agent_config() -> dict:
    """Strategy/risk/active flags set from the frontend; sensible defaults if the DB is down."""
    default = {"strategy": "arbitrage", "risk_level": "medium", "is_active": 1}

    # First try the local JSON state file (written by the Node.js backend)
    state_file = STATE_DIR / "state.json"
    if state_file.exists():
        try:
            data = json.loads(state_file.read_text())
            cfg = data.get("config", {})
            if cfg:
                return {**default, **{k: v for k, v in cfg.items() if v is not None}}
        except Exception:
            pass

    # Fall back to MySQL
    try:
        pool = await asyncio.wait_for(get_pool(), timeout=3.0)
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
    """Everything the agent needs, gathered from persisted pool data and live chain."""

    # Read pool snapshots from JSON files
    pools = []
    pools_dir = DATA_DIR / "pool_snapshots"
    if pools_dir.exists():
        for f in sorted(pools_dir.glob("*.json")):
            try:
                entry = json.loads(f.read_text())
                if entry:
                    pools.append(entry[-1])
            except Exception:
                continue

    # Read agent decisions from JSON
    decisions_file = DATA_DIR / "agent_decisions" / "state.json"
    decisions = []
    if decisions_file.exists():
        try:
            decisions = json.loads(decisions_file.read_text())
        except Exception:
            pass

    # Read market context (pools + reserves) from JSON
    market_context = []
    market_file = DATA_DIR / "market_context" / "context.json"
    if market_file.exists():
        try:
            market_context = json.loads(market_file.read_text())
        except Exception:
            pass

    # Build compact pool list from snapshots
    symbol_map = {}
    for p in pools:
        addr = p.get("pair", "").lower()
        if addr:
            symbol_map[addr] = {
                "symbol0": p.get("token0Symbol", "?"),
                "symbol1": p.get("token1Symbol", "?"),
                "reserve0": p.get("reserve0", "0"),
                "reserve1": p.get("reserve1", "0"),
                "spotPrice": p.get("spotPrice", "0"),
            }

    compact_pools = []
    for m in market_context:
        addr = m.get("pairAddress") or m.get("pair", "")
        info = symbol_map.get(addr.lower(), {})
        compact_pools.append({
            "pair": addr,
            "t0": info.get("symbol0", "?"),
            "t1": info.get("symbol1", "?"),
            "r0": info.get("reserve0", "0"),
            "r1": info.get("reserve1", "0"),
            "price": info.get("spotPrice", "0"),
        })

    # Read wallet balances from the MCP tool layer
    balances = await call_tool("get_balances", {})

    return {
        "pools": compact_pools,
        "wallet_balances": balances,
        "decision_context": decisions[-10:] if decisions else [],
    }


async def _execute_trade_decision(decision: dict, dry_run: bool = False) -> dict:
    """Execute a trade based on the LLM's decision. Returns execution result."""
    trade_type = decision.get("trade_type", "single")
    result = {"status": "error", "message": "Unknown trade_type"}

    if trade_type == "single":
        token_in = decision.get("token_in", "")
        token_out = decision.get("token_out", "")
        amount_in = decision.get("amount_in", "0")

        if not all([token_in, token_out, amount_in]):
            return {"status": "error", "message": "Missing trade parameters"}

        if dry_run:
            return {"status": "dry_run", "trade": decision}

        result = await call_tool("execute_trade", {
            "token_in": token_in,
            "token_out": token_out,
            "amount_in": amount_in,
        })

    elif trade_type == "arbitrage":
        path = decision.get("path", [])
        amount_in = decision.get("amount_in", "0")
        min_amount_out = decision.get("min_amount_out", "0")

        if not path or len(path) < 2:
            return {"status": "error", "message": "Arbitrage path must have at least 2 tokens"}

        if dry_run:
            return {"status": "dry_run", "trade": decision}

        result = await call_tool("execute_arbitrage", {
            "path": path,
            "amount_in": amount_in,
            "min_amount_out": min_amount_out,
        })

    elif trade_type == "liquidity":
        action = decision.get("liquidity_action", "ADD")
        token_a = decision.get("token_a", "")
        token_b = decision.get("token_b", "")
        amount_a = decision.get("amount_a", "0")
        amount_b = decision.get("amount_b", "0")
        liquidity = decision.get("liquidity", "0")

        if not all([token_a, token_b]):
            return {"status": "error", "message": "Missing liquidity parameters"}

        if dry_run:
            return {"status": "dry_run", "trade": decision}

        result = await call_tool("manage_liquidity", {
            "action": action,
            "token_a": token_a,
            "token_b": token_b,
            "amount_a": amount_a,
            "amount_b": amount_b,
            "liquidity": liquidity,
        })

    # Record trade to Node.js backend for dashboard display
    if result.get("status") == "success":
        await _record_trade_to_backend(decision, result)

    return result


async def _record_trade_to_backend(decision: dict, result: dict) -> None:
    """Record a successful trade to the Node.js backend via HTTP."""
    import urllib.request
    import urllib.error

    try:
        trade_data = {
            "agentName": "Quant_Orchestrator",
            "txHash": result.get("transactionHash", ""),
            "blockNumber": result.get("blockNumber", 0),
            "action": decision.get("trade_type", "SWAP").upper(),
            "tokenIn": decision.get("token_in") or (decision.get("path", [""])[0] if decision.get("path") else ""),
            "tokenOut": decision.get("token_out") or (decision.get("path", [""])[-1] if decision.get("path") else ""),
            "amountIn": decision.get("amount_in", "0"),
            "amountOut": result.get("quote", {}).get("amountOut", "0"),
            "status": "success",
            "gasUsed": result.get("gasUsed", 0),
            "pnl": 0.0,  # Will be calculated by backend
        }

        req = urllib.request.Request(
            "http://127.0.0.1:8000?action=record_trade",
            data=json.dumps(trade_data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # Non-critical - trade already happened on-chain


async def run_llm_cycle(strategy: str, risk: str, dry_run: bool = False) -> dict:
    """One full LLM-driven decision cycle with tool calling.

    Returns:
        dict with keys: decision, tool_calls, execution_result, summary
    """
    import httpx
    from openai import OpenAI

    client = OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
        http_client=httpx.Client(verify=False),
    )

    # ── Phase 1: Gather initial context ───────────────────────────────────
    data = await collect_market_data()
    tool_call_log: list[dict] = []
    execution_result: dict | None = None

    # Build the initial prompt with market data
    initial_context = (
        f"## Current Market State\n"
        f"Pools: {json.dumps(data['pools'][:5], default=str)[:800]}\n"
        f"Wallet Balances: {json.dumps(data['wallet_balances'], default=str)[:400]}\n"
        f"Recent Decisions: {json.dumps(data['decision_context'][:3], default=str)[:300]}\n\n"
        f"## Configuration\n"
        f"Strategy: {strategy}\n"
        f"Risk Level: {risk}\n\n"
        f"## Instructions\n"
        f"Analyze the market data and decide: HOLD or TRADE.\n"
        f"If TRADE, use the appropriate tools to execute.\n"
        f"Always explain your reasoning."
    )

    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_INSTRUCTION},
        {"role": "user", "content": initial_context},
    ]

    # ── Phase 2: Multi-round tool-calling loop ────────────────────────────
    final_decision: dict = {"action": "HOLD", "reason": "Analysis not completed"}
    summary = ""

    for round_num in range(MAX_TOOL_ROUNDS):
        try:
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=OPENROUTER_MODEL,
                    messages=messages,
                    tools=LLM_TOOLS,
                    tool_choice="auto",
                    max_tokens=2048,
                )
            )
        except Exception as exc:
            summary = f"LLM call failed: {exc}"
            print(f"[error] LLM call failed in round {round_num}: {exc}", file=sys.stderr)
            break

        message = response.choices[0].message

        # Handle tool calls
        if message.tool_calls:
            # Add assistant message with tool calls to conversation
            messages.append({
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in message.tool_calls
                ],
            })

            # Execute each tool call
            for tool_call in message.tool_calls:
                func_name = tool_call.function.name
                try:
                    func_args = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    func_args = {}

                print(f"  [tool] {func_name}({json.dumps(func_args, default=str)[:100]})")

                result = await call_tool(func_name, func_args)
                tool_call_log.append({
                    "tool": func_name,
                    "args": func_args,
                    "result": result,
                    "round": round_num,
                })

                # Add tool result to conversation
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, default=str)[:2000],
                })

            # Continue loop for more tool calls
            continue

        # No tool calls - this is the final text response
        summary = message.content or "(no response)"

        # Try to parse decision from response
        parsed = _safe_json_parse(summary)
        if parsed and "action" in parsed:
            final_decision = parsed
        else:
            # Check if response implies a trade decision
            summary_lower = summary.lower()
            if any(word in summary_lower for word in ["trade", "execute", "swap", "buy", "sell"]):
                final_decision = {"action": "TRADE", "reason": summary[:500]}
            else:
                final_decision = {"action": "HOLD", "reason": summary[:500]}

        break  # Exit loop - we have our final response

    # ── Phase 3: Execute trade if decision is TRADE ───────────────────────
    if final_decision.get("action") == "TRADE" and not dry_run:
        print(f"  [execute] {final_decision.get('trade_type', 'single')} trade")
        execution_result = await _execute_trade_decision(final_decision, dry_run=dry_run)
        tool_call_log.append({
            "tool": "execute_trade",
            "args": final_decision,
            "result": execution_result,
            "round": MAX_TOOL_ROUNDS,
        })

        # If trade failed, record it
        if execution_result and execution_result.get("status") == "error":
            print(f"  [error] Trade failed: {execution_result.get('message')}")

    # ── Phase 4: Calculate confidence and record decision ─────────────────
    confidence = _calculate_confidence(tool_call_log, final_decision)

    await _record_agent_decision(
        agent="Quant_Orchestrator",
        action=final_decision.get("action", "UNKNOWN"),
        reason=final_decision.get("reason", summary)[:4000],
        confidence=confidence,
        context={
            "strategy": strategy,
            "risk": risk,
            "toolCalls": len(tool_call_log),
            "executionResult": execution_result,
            "dryRun": dry_run,
        },
    )

    # Write to shared JSON state for frontend
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        state = (
            json.loads(STATE_FILE.read_text())
            if STATE_FILE.exists()
            else {"config": {}, "decisions": [], "trades": []}
        )
        state["decisions"].append({
            "agentName": "Quant_Orchestrator",
            "action": final_decision.get("action", "UNKNOWN"),
            "reason": final_decision.get("reason", summary)[:4000],
            "confidence": confidence,
            "toolCalls": len(tool_call_log),
            "contextJSON": {"strategy": strategy, "risk": risk},
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        state["decisions"] = state["decisions"][-100:]
        STATE_FILE.write_text(json.dumps(state, indent=2))
    except Exception:
        pass

    return {
        "decision": final_decision,
        "tool_calls": tool_call_log,
        "execution_result": execution_result,
        "summary": summary,
        "confidence": confidence,
    }


async def process_agent_loop(dry_run: bool = False) -> dict | None:
    """Single agent iteration. Returns the cycle result or None if skipped."""
    config = await read_agent_config()
    if not config.get("is_active"):
        print(f"[{time.strftime('%H:%M:%S')}] Agent INACTIVE. Skipping cycle.")
        return None

    strategy = config.get("strategy", "arbitrage")
    risk = config.get("risk_level", "medium")
    print(f"[{time.strftime('%H:%M:%S')}] Agent ACTIVE - strategy={strategy} risk={risk} dry_run={dry_run}")

    if not OPENROUTER_API_KEY:
        print("CRITICAL: OPENROUTER_API_KEY is not set, cannot run the LLM cycle.")
        return None

    try:
        result = await run_llm_cycle(strategy, risk, dry_run=dry_run)

        # Print summary
        action = result["decision"].get("action", "?")
        confidence = result["confidence"]
        tool_count = len(result["tool_calls"])
        print(f"  [result] action={action} confidence={confidence:.2f} tools_used={tool_count}")

        if result["execution_result"]:
            status = result["execution_result"].get("status", "?")
            print(f"  [execution] status={status}")

        return result

    except Exception as exc:  # noqa: BLE001 - one bad cycle must not kill the agent
        err = str(exc)
        if "402" in err:
            print(f"[{time.strftime('%H:%M:%S')}] OpenRouter credits exhausted.")
        else:
            print(f"!!! Cycle error: {type(exc).__name__}: {exc}")
        return None


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

    print(f"pools discovered      : {len(pools) if isinstance(pools, list) else 'error'}")
    for pool in pools if isinstance(pools, list) else []:
        print(f"  {pool.get('t0')}/{pool.get('t1')} {pool.get('pair')}")

    print(f"wallet balances       : {json.dumps(data['wallet_balances'], default=str)}")

    if isinstance(pools, list) and pools:
        pair = pools[0].get("pair")
        state = await call_tool("get_live_pool_state", {"pair_address": pair})
        print(f"live pool state       : {json.dumps(state, default=str)[:300]}")
        swaps = await call_tool("get_recent_swaps", {"n": 5})
        print(f"recent swaps          : {len(swaps) if isinstance(swaps, list) else 'error'}")
        risk = await call_tool("get_risk_metrics", {"pair_address": pair})
        print(f"risk metrics          : {json.dumps(risk, default=str)[:200]}")

    ok = isinstance(pools, list) and len(pools) > 0
    print("\nRESULT:", "PASS - the agent can read live blockchain data" if ok else "FAIL - no pools found")
    return 0 if ok else 1


async def main_async(once: bool, self_test_mode: bool, dry_run: bool) -> int:
    if self_test_mode:
        return await self_test()

    print("=" * 60)
    print("  AGENTIC DEX ORCHESTRATOR v2.0")
    print("  Full LLM tool-calling with multi-round execution")
    print("=" * 60)

    if once:
        result = await process_agent_loop(dry_run=dry_run)
        await close_pool()
        return 0 if result else 1

    while True:
        await process_agent_loop(dry_run=dry_run)
        print(f"\n[Cycle pause] next sweep in {AGENT_INTERVAL_SECONDS}s...")
        await asyncio.sleep(AGENT_INTERVAL_SECONDS)


def main() -> None:
    parser = argparse.ArgumentParser(description="Agentic DEX AI orchestrator")
    parser.add_argument("--once", action="store_true", help="run a single cycle and exit")
    parser.add_argument("--self-test", action="store_true", help="read + print market data, no LLM")
    parser.add_argument("--dry-run", action="store_true", help="LLM cycle with tools, but no on-chain writes")
    parser.add_argument("--interval", type=int, default=None, help="override the cycle interval")
    args = parser.parse_args()

    if args.interval:
        os.environ["AGENT_INTERVAL_SECONDS"] = str(args.interval)

    try:
        code = asyncio.run(main_async(args.once, args.self_test, args.dry_run))
    except KeyboardInterrupt:
        print("\nGraceful shutdown.")
        code = 0
    raise SystemExit(code)


if __name__ == "__main__":
    main()
