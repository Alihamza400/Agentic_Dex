"""
MCP Server for the Agentic DEX.

Exposes tools the AI agents use to (a) read market/blockchain state and
(b) execute real transactions. MySQL (written by Scripts/sync.js) is the fast
path; when the DB is empty or unreachable every read tool falls back to live
chain reads so the agents never operate blind.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import sys
import time
from decimal import Decimal
from functools import wraps
from typing import Any

import aiomysql
from dotenv import load_dotenv
from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from dex_mcp.config import DB_CONFIG, describe
from dex_mcp import web3 as chain
from dex_mcp.Vector_Store import vector_store
from dex_mcp.web3_actions import (
    add_liquidity,
    approve_token,
    execute_multi_hop_swap,
    get_balances,
    get_deployed_tokens,
    remove_liquidity,
    swap_tokens,
)

load_dotenv()


def convert_decimals(obj):
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    if isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return str(obj)
    return obj


# ── In-memory cache (keeps the LLM from spamming the DB) ──────────────────────
_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL = 5  # seconds


def cached(key_fn, ttl: float = CACHE_TTL):
    """
    Cache an async tool result for `ttl` seconds (ttl <= 0 disables caching).

    `key_fn` receives a dict of the bound call arguments, so both positional and
    keyword invocations (the MCP layer always uses keywords) produce one key.
    Tools whose result changes as a consequence of the agent's own actions
    (recent swaps, live reserves, balances) are deliberately uncached.
    """

    def decorator(fn):
        if ttl <= 0:
            return fn

        signature = inspect.signature(fn)

        @wraps(fn)
        async def wrapper(*args, **kwargs):
            bound = signature.bind(*args, **kwargs)
            bound.apply_defaults()
            key = key_fn(bound.arguments)
            now = time.monotonic()
            if key in _cache:
                ts, val = _cache[key]
                if now - ts < ttl:
                    return val
            result = await fn(*args, **kwargs)
            _cache[key] = (now, result)
            return result

        return wrapper

    return decorator


# ── Database ──────────────────────────────────────────────────────────────────
_pool: aiomysql.Pool | None = None


class DatabaseUnavailable(RuntimeError):
    """Raised when MySQL cannot be reached; read tools fall back to the chain."""


async def get_pool() -> aiomysql.Pool:
    global _pool
    if _pool is None:
        try:
            _pool = await asyncio.wait_for(
                aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=5),
                timeout=3.0,
            )
        except (asyncio.TimeoutError, Exception) as exc:
            raise DatabaseUnavailable(f"MySQL unreachable: {exc}") from exc
    return _pool


async def close_pool() -> None:
    """Release MySQL connections so short-lived processes can exit cleanly."""
    global _pool
    if _pool is not None:
        _pool.close()
        await _pool.wait_closed()
        _pool = None


async def query(sql: str, args=()) -> list[dict]:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, args)
                rows = await cur.fetchall()
                return convert_decimals([dict(r) for r in rows])
    except Exception as exc:
        raise DatabaseUnavailable(str(exc)) from exc


async def execute(sql: str, args=()) -> int:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, args)
                return cur.rowcount
    except Exception as exc:
        raise DatabaseUnavailable(str(exc)) from exc


async def try_db(coro, fallback):
    """Await a DB read; on any DB problem, use the live-chain fallback."""
    try:
        result = await coro
        if result:
            return result
    except DatabaseUnavailable:
        pass
    return await fallback()


# ── Read tools ────────────────────────────────────────────────────────────────

@cached(lambda a: "market_context")
async def _get_market_context() -> list[dict]:
    """Latest snapshot per pair (DB), falling back to live reserves."""

    async def live():
        return await asyncio.to_thread(chain.get_all_pool_states)

    rows = await try_db(
        query(
            """
            SELECT ps.*
            FROM pair_snapshots ps
            INNER JOIN (
                SELECT pairAddress, MAX(blockNumber) AS maxBlock
                FROM pair_snapshots
                GROUP BY pairAddress
            ) latest ON ps.pairAddress = latest.pairAddress AND ps.blockNumber = latest.maxBlock
            ORDER BY ps.blockNumber DESC
            """
        ),
        live,
    )
    return [{**row, "dataSource": "db"} if "reserve0" in row else row for row in rows]


@cached(lambda a: "pool_addresses")
async def _get_pools_for_agent() -> list[dict]:
    """Every pair with its two token symbols - the agent's map of the market.
    Reads from DB first (pair_snapshots + dex_events for token info), falls back to live chain."""

    async def live():
        pools = []
        for pair in chain.get_all_pairs():
            token0, token1 = chain.get_pair_tokens(pair)
            pools.append(
                {
                    "pair": pair,
                    "token0": token0,
                    "token1": token1,
                    "symbol0": chain.token_symbol(token0),
                    "symbol1": chain.token_symbol(token1),
                }
            )
        return pools

    async def from_db():
        rows = await query(
            """
            SELECT DISTINCT
                ps.pairAddress AS pair,
                JSON_UNQUOTE(JSON_EXTRACT(de.data, '$.token0')) AS token0,
                JSON_UNQUOTE(JSON_EXTRACT(de.data, '$.token1')) AS token1
            FROM pair_snapshots ps
            LEFT JOIN dex_events de ON de.contractAddress = ps.pairAddress
                AND de.eventName = 'Sync'
            WHERE ps.pairAddress IS NOT NULL
            ORDER BY ps.blockNumber DESC
            """
        )
        if not rows:
            return await live()

        # Enrich with token symbols from chain (fast lookup, cached)
        pools = []
        seen = set()
        for row in rows:
            pair = row.get("pair", "")
            if not pair or pair in seen:
                continue
            seen.add(pair)
            token0 = row.get("token0") or ""
            token1 = row.get("token1") or ""
            # If DB didn't have token addresses, read from chain
            if not token0 or not token1:
                t0, t1 = chain.get_pair_tokens(pair)
                token0, token1 = t0, t1
            pools.append(
                {
                    "pair": pair,
                    "token0": token0,
                    "token1": token1,
                    "symbol0": chain.token_symbol(token0) if token0 else "?",
                    "symbol1": chain.token_symbol(token1) if token1 else "?",
                    "source": "db",
                }
            )
        return pools

    return await try_db(from_db(), live)


@cached(lambda a: f"live_state_{a['pair_address']}", ttl=0)
async def _get_live_pool_state(pair_address: str) -> dict:
    """Live reserves/spot/TWAP read straight from the DexPair contract."""
    return await asyncio.to_thread(chain.get_pool_state, pair_address)


@cached(lambda a: f"recent_swaps_{a['n']}", ttl=0)
async def _get_recent_swaps(n: int = 20) -> list[dict]:
    """Last N swap events (DB first, live logs as fallback)."""

    async def live():
        return await asyncio.to_thread(chain.get_recent_swaps, n)

    rows = await try_db(
        query(
            """
            SELECT blockNumber, transactionHash, contractAddress, data, createdAt
            FROM dex_events
            WHERE eventName = 'Swap'
            ORDER BY blockNumber DESC, id DESC
            LIMIT %s
            """,
            (n,),
        ),
        live,
    )
    return rows if rows else await live()


@cached(lambda a: f"price_trend_{a['pair_address']}_{a['n']}")
async def _get_price_trend(pair_address: str, n: int = 50) -> list[dict]:
    """Historical snapshots for one pair; a single live point if the DB is empty."""

    async def live():
        state = await asyncio.to_thread(chain.get_pool_state, pair_address)
        return [state] if "reserve0" in state else []

    return await try_db(
        query(
            """
            SELECT blockNumber, blockTimestamp, reserve0, reserve1, spotPrice,
                   price0Cumulative, price1Cumulative
            FROM pair_snapshots
            WHERE pairAddress = %s
            ORDER BY blockNumber DESC
            LIMIT %s
            """,
            (pair_address, n),
        ),
        live,
    )


@cached(lambda a: "liquidity_stats")
async def _get_liquidity_stats() -> list[dict]:
    """Aggregated Mint/Burn per pair; live reserves when the DB has no events."""

    async def live():
        pools = await asyncio.to_thread(chain.get_all_pool_states)
        return [
            {
                "pairAddress": p.get("pair"),
                "reserve0": p.get("reserve0"),
                "reserve1": p.get("reserve1"),
                "token0Symbol": p.get("token0Symbol"),
                "token1Symbol": p.get("token1Symbol"),
                "source": "chain",
            }
            for p in pools
            if "reserve0" in p
        ]

    return await try_db(
        query(
            """
            SELECT
                contractAddress AS pairAddress,
                SUM(CASE WHEN eventName='Mint' THEN JSON_EXTRACT(data,'$.liquidity') ELSE 0 END) AS totalMinted,
                SUM(CASE WHEN eventName='Burn' THEN JSON_EXTRACT(data,'$.liquidity') ELSE 0 END) AS totalBurned,
                COUNT(CASE WHEN eventName='Mint' THEN 1 END) AS mintCount,
                COUNT(CASE WHEN eventName='Burn' THEN 1 END) AS burnCount
            FROM dex_events
            WHERE eventName IN ('Mint','Burn')
            GROUP BY contractAddress
            """
        ),
        live,
    )


@cached(lambda a: f"risk_{a['pair_address']}")
async def _get_risk_metrics(pair_address: str) -> dict:
    """Price volatility over recent snapshots; spot/TWAP only when from chain."""

    async def live():
        state = await asyncio.to_thread(chain.get_pool_state, pair_address)
        if "reserve0" not in state:
            return {"error": state.get("error", "pair unavailable"), "source": "chain"}
        return {
            "pairAddress": pair_address,
            "spotPrice": state["spotPrice"],
            "reserve0": state["reserve0"],
            "reserve1": state["reserve1"],
            "sampleCount": 1,
            "note": "Historical volatility needs the indexer (npm run index) to be running.",
            "source": "chain",
        }

    rows = await try_db(
        query(
            """
            SELECT
                STDDEV(CAST(spotPrice AS DECIMAL(40,0))) AS priceStdDev,
                MIN(CAST(spotPrice AS DECIMAL(40,0)))     AS priceMin,
                MAX(CAST(spotPrice AS DECIMAL(40,0)))     AS priceMax,
                AVG(CAST(spotPrice AS DECIMAL(40,0)))     AS priceAvg,
                COUNT(*)                                  AS sampleCount
            FROM (
                SELECT spotPrice FROM pair_snapshots
                WHERE pairAddress = %s
                ORDER BY blockNumber DESC LIMIT 100
            ) recent
            """,
            (pair_address,),
        ),
        live,
    )
    if isinstance(rows, dict):
        return rows
    return rows[0] if rows else await live()


async def _record_agent_decision(
    agent: str, action: str, reason: str, confidence: float, context: dict
) -> str:
    """Persist a decision for auditability. Never fails the agent loop."""
    try:
        await execute(
            """
            INSERT INTO agent_decisions (agentName, action, reason, confidence, contextJSON)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (agent, action, reason, confidence, json.dumps(context, default=str)),
        )
        return "Decision recorded."
    except DatabaseUnavailable as exc:
        # NOTE: stderr only - stdout is the MCP JSON-RPC channel
        print(f"[warn] Could not record decision in MySQL: {exc}", file=sys.stderr)
        return "Decision NOT recorded (database unavailable)."


async def _record_agent_trade(
    agent: str,
    action: str,
    tx_hash: str,
    block_number: int,
    token_in: str,
    token_out: str,
    amount_in: str,
    amount_out: str,
    quote_amount: str = "",
    status: str = "success",
    gas_used: int = 0,
    pnl: float = 0.0,
) -> str:
    """Record an on-chain trade executed by the agent for PnL tracking."""
    try:
        await execute(
            """
            INSERT INTO agent_trades
                (agentName, txHash, blockNumber, action, tokenIn, tokenOut,
                 amountIn, amountOut, quoteAmount, status, gasUsed, pnl)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (agent, tx_hash, block_number, action, token_in, token_out,
             amount_in, amount_out, quote_amount, status, gas_used, pnl),
        )
        return "Trade recorded."
    except DatabaseUnavailable as exc:
        print(f"[warn] Could not record trade in MySQL: {exc}", file=sys.stderr)
        return "Trade NOT recorded (database unavailable)."


async def _get_pnl_summary(agent: str = "Quant_Orchestrator") -> dict:
    """Get PnL summary for the agent: total trades, wins, losses, total PnL, win rate."""

    async def live():
        return {
            "totalTrades": 0,
            "winningTrades": 0,
            "losingTrades": 0,
            "totalPnl": 0.0,
            "winRate": 0.0,
            "avgPnl": 0.0,
            "bestTrade": 0.0,
            "worstTrade": 0.0,
            "note": "No database available. Run npm run index to enable PnL tracking.",
        }

    try:
        rows = await try_db(
            query(
                """
                SELECT
                    COUNT(*) AS totalTrades,
                    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS winningTrades,
                    SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) AS losingTrades,
                    SUM(CASE WHEN status = 'success' THEN pnl ELSE 0 END) AS totalPnl,
                    AVG(CASE WHEN status = 'success' THEN pnl END) AS avgPnl,
                    MAX(CASE WHEN status = 'success' THEN pnl END) AS bestTrade,
                    MIN(CASE WHEN status = 'success' THEN pnl END) AS worstTrade
                FROM agent_trades
                WHERE agentName = %s AND status = 'success'
                """,
                (agent,),
            ),
            live,
        )
    except DatabaseUnavailable:
        return await live()

    if isinstance(rows, dict):
        return rows
    return rows[0] if rows else await live()


async def _search_market_history(query_text: str, limit: int = 5) -> list[dict]:
    """Vector search over historical market patterns (Qdrant)."""
    return await asyncio.to_thread(vector_store.search_history, query_text, limit)


async def _get_tokens() -> dict:
    """Symbol -> address for every deployed token the agent can trade."""
    return get_deployed_tokens()


# ── Write tools ───────────────────────────────────────────────────────────────

def _amount(value: str | int) -> int:
    """Accept plain wei (str/int) - rejects anything non-numeric early."""
    return int(Decimal(str(value)))


async def _execute_trade(token_in: str, token_out: str, amount_in: str) -> dict:
    try:
        return await asyncio.to_thread(swap_tokens, token_in, token_out, _amount(amount_in))
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _execute_arbitrage(path: list[str], amount_in: str, min_amount_out: str = "0") -> dict:
    try:
        return await asyncio.to_thread(
            execute_multi_hop_swap, path, _amount(amount_in), _amount(min_amount_out)
        )
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _manage_liquidity(
    action: str,
    token_a: str,
    token_b: str,
    amount_a: str = "0",
    amount_b: str = "0",
    liquidity: str = "0",
) -> dict:
    try:
        if action == "ADD":
            return await asyncio.to_thread(
                add_liquidity, token_a, token_b, _amount(amount_a), _amount(amount_b)
            )
        if action == "REMOVE":
            return await asyncio.to_thread(remove_liquidity, token_a, token_b, _amount(liquidity))
        return {"status": "error", "message": f"Invalid action: {action}"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


async def _get_balances(token_addresses: list[str] | None = None) -> dict:
    return await asyncio.to_thread(get_balances, token_addresses)


async def _approve(token_address: str, amount: str) -> dict:
    from dex_mcp.config import ROUTER_ADDRESS

    return await asyncio.to_thread(approve_token, token_address, ROUTER_ADDRESS, _amount(amount))


# ── MCP tool schema ───────────────────────────────────────────────────────────
server = Server("dex-mcp")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="get_market_context",
            description="Latest reserves, spot price and TWAP for every pair. Always call this first.",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="get_pool_addresses",
            description="List every trading pair with its token symbols and addresses.",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="get_deployed_tokens",
            description="Symbol -> address for every tradable token. Use these addresses in trade calls.",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="get_live_pool_state",
            description="Read reserves, spot price and TWAP directly from one DexPair contract.",
            inputSchema={
                "type": "object",
                "properties": {"pair_address": {"type": "string", "description": "0x DexPair address"}},
                "required": ["pair_address"],
            },
        ),
        types.Tool(
            name="get_balances",
            description=(
                "The agent wallet's balances. `token_addresses` is optional: omit it to get every "
                "deployed token. Values are human-readable (ETH/token units)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "token_addresses": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of 0x token addresses",
                    }
                },
                "required": [],
            },
        ),
        types.Tool(
            name="execute_trade",
            description="Swap token_in for token_out on-chain. amount_in must be in wei (1 token = 1e18).",
            inputSchema={
                "type": "object",
                "properties": {
                    "token_in": {"type": "string"},
                    "token_out": {"type": "string"},
                    "amount_in": {"type": "string", "description": "wei, as a string"},
                },
                "required": ["token_in", "token_out", "amount_in"],
            },
        ),
        types.Tool(
            name="execute_arbitrage",
            description="Multi-hop swap (e.g. USDC -> DAI -> WETH -> USDC) to capture a price gap. amount_in is in wei.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {"type": "array", "items": {"type": "string"}},
                    "amount_in": {"type": "string"},
                    "min_amount_out": {"type": "string", "description": "Minimum acceptable output in wei"},
                },
                "required": ["path", "amount_in"],
            },
        ),
        types.Tool(
            name="manage_liquidity",
            description="Add or remove liquidity. Amounts are in wei.",
            inputSchema={
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["ADD", "REMOVE"]},
                    "token_a": {"type": "string"},
                    "token_b": {"type": "string"},
                    "amount_a": {"type": "string"},
                    "amount_b": {"type": "string"},
                    "liquidity": {"type": "string", "description": "LP tokens to burn for REMOVE"},
                },
                "required": ["action", "token_a", "token_b"],
            },
        ),
        types.Tool(
            name="approve_token",
            description="Grant the router an allowance for a token (in wei). Swaps approve automatically.",
            inputSchema={
                "type": "object",
                "properties": {
                    "token_address": {"type": "string"},
                    "amount": {"type": "string"},
                },
                "required": ["token_address", "amount"],
            },
        ),
        types.Tool(
            name="get_recent_swaps",
            description="The last N swaps with amounts and pair addresses (DB, live logs as fallback).",
            inputSchema={
                "type": "object",
                "properties": {"n": {"type": "integer", "default": 20}},
                "required": [],
            },
        ),
        types.Tool(
            name="get_price_trend",
            description="Historical price snapshots for one pair - use to detect trends and momentum.",
            inputSchema={
                "type": "object",
                "properties": {
                    "pair_address": {"type": "string"},
                    "n": {"type": "integer", "default": 50},
                },
                "required": ["pair_address"],
            },
        ),
        types.Tool(
            name="get_liquidity_stats",
            description="Mint/Burn totals per pair, or live reserves when no events are indexed.",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="get_risk_metrics",
            description="Price volatility (std dev, min, max, avg) for a pair over the last 100 snapshots.",
            inputSchema={
                "type": "object",
                "properties": {"pair_address": {"type": "string"}},
                "required": ["pair_address"],
            },
        ),
        types.Tool(
            name="search_market_history",
            description="Vector similarity search over historical market patterns (Qdrant).",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="record_agent_decision",
            description="Write the final decision to the database for auditability.",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent": {"type": "string"},
                    "action": {"type": "string"},
                    "reason": {"type": "string"},
                    "confidence": {"type": "number"},
                    "context": {"type": "object"},
                },
                "required": ["agent", "action", "reason", "confidence", "context"],
            },
        ),
        types.Tool(
            name="get_pnl_summary",
            description="Get profit/loss summary for agent trades: total trades, wins, losses, win rate, total PnL.",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent": {
                        "type": "string",
                        "description": "Agent name (default: Quant_Orchestrator)",
                        "default": "Quant_Orchestrator",
                    }
                },
                "required": [],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    handlers = {
        "get_market_context": lambda a: _get_market_context(),
        "get_pool_addresses": lambda a: _get_pools_for_agent(),
        "get_deployed_tokens": lambda a: _get_tokens(),
        "get_live_pool_state": lambda a: _get_live_pool_state(a["pair_address"]),
        "get_balances": lambda a: _get_balances(a.get("token_addresses")),
        "execute_trade": lambda a: _execute_trade(a["token_in"], a["token_out"], a["amount_in"]),
        "execute_arbitrage": lambda a: _execute_arbitrage(
            a["path"], a["amount_in"], a.get("min_amount_out", "0")
        ),
        "manage_liquidity": lambda a: _manage_liquidity(
            a["action"],
            a["token_a"],
            a["token_b"],
            a.get("amount_a", "0"),
            a.get("amount_b", "0"),
            a.get("liquidity", "0"),
        ),
        "approve_token": lambda a: _approve(a["token_address"], a["amount"]),
        "get_recent_swaps": lambda a: _get_recent_swaps(a.get("n", 20)),
        "get_price_trend": lambda a: _get_price_trend(a["pair_address"], a.get("n", 50)),
        "get_liquidity_stats": lambda a: _get_liquidity_stats(),
        "get_risk_metrics": lambda a: _get_risk_metrics(a["pair_address"]),
        "search_market_history": lambda a: _search_market_history(a["query"], a.get("limit", 5)),
        "record_agent_decision": lambda a: _record_agent_decision(
            a["agent"], a["action"], a["reason"], a["confidence"], a.get("context", {})
        ),
        "get_pnl_summary": lambda a: _get_pnl_summary(a.get("agent", "Quant_Orchestrator")),
    }

    handler = handlers.get(name)
    if handler is None:
        return [types.TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]

    try:
        result = await handler(arguments)
    except Exception as exc:
        result = {"error": str(exc)}

    return [types.TextContent(type="text", text=json.dumps(result, default=str, indent=2))]


async def main():
    # Diagnostics go to stderr: stdout carries the MCP protocol frames.
    print(describe(), file=sys.stderr, flush=True)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
