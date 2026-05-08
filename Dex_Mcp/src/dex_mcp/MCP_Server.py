"""
MCP Server for Agentic DEX
Exposes tools for AI agents to query real blockchain data from MySQL and Qdrant,
and execute actions on the blockchain.
"""

import asyncio
import json
import os
import time
from functools import wraps
from typing import Any

import aiomysql
from decimal import Decimal
from dotenv import load_dotenv
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

from dex_mcp.Vector_Store import vector_store
from dex_mcp.web3_actions import (
    swap_tokens, add_liquidity, remove_liquidity, 
    approve_token, get_balances, execute_multi_hop_swap
)

load_dotenv()

def convert_decimals(obj):
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return str(obj)
    return obj

# ── Database Config ───────────────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "user":     os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "db":       os.getenv("DB_NAME"),
    "autocommit": True,
}

# ── In-memory Cache (NFR: Speed) ──────────────────────────────────────────────
_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL = 5  # seconds


def cached(key_fn):
    """Decorator that caches async function results for CACHE_TTL seconds."""
    def decorator(fn):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            key = key_fn(*args, **kwargs)
            now = time.monotonic()
            if key in _cache:
                ts, val = _cache[key]
                if now - ts < CACHE_TTL:
                    return val
            result = await fn(*args, **kwargs)
            _cache[key] = (now, result)
            return result
        return wrapper
    return decorator


# ── Database Pool ─────────────────────────────────────────────────────────────
_pool: aiomysql.Pool | None = None


async def get_pool() -> aiomysql.Pool:
    global _pool
    if _pool is None:
        _pool = await aiomysql.create_pool(**DB_CONFIG, minsize=2, maxsize=5)
    return _pool


async def query(sql: str, args=()) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, args)
            rows = await cur.fetchall()
            return convert_decimals([dict(r) for r in rows])


async def execute(sql: str, args=()) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, args)
            return cur.rowcount


# ── MCP Tools (Read) ─────────────────────────────────────────────────────────

@cached(lambda n=10: f"market_context")
async def _get_market_context() -> list[dict]:
    """Latest snapshot per pair – used by all agents as baseline context."""
    rows = await query("""
        SELECT ps.*
        FROM pair_snapshots ps
        INNER JOIN (
            SELECT pairAddress, MAX(blockNumber) AS maxBlock
            FROM pair_snapshots
            GROUP BY pairAddress
        ) latest ON ps.pairAddress = latest.pairAddress AND ps.blockNumber = latest.maxBlock
        ORDER BY ps.blockNumber DESC
    """)
    return [dict(r) for r in rows]


@cached(lambda n=20: f"recent_swaps_{n}")
async def _get_recent_swaps(n: int = 20) -> list[dict]:
    """Last N swap events."""
    rows = await query("""
        SELECT blockNumber, transactionHash, contractAddress, data, createdAt
        FROM dex_events
        WHERE eventName = 'Swap'
        ORDER BY blockNumber DESC
        LIMIT %s
    """, (n,))
    return [dict(r) for r in rows]


@cached(lambda pair, n=50: f"price_trend_{pair}_{n}")
async def _get_price_trend(pair_address: str, n: int = 50) -> list[dict]:
    """Historical price snapshots for one pair over last N blocks."""
    rows = await query("""
        SELECT blockNumber, blockTimestamp, reserve0, reserve1, spotPrice,
               price0Cumulative, price1Cumulative
        FROM pair_snapshots
        WHERE pairAddress = %s
        ORDER BY blockNumber DESC
        LIMIT %s
    """, (pair_address, n))
    return [dict(r) for r in rows]


@cached(lambda: "liquidity_stats")
async def _get_liquidity_stats() -> list[dict]:
    """Aggregate Mint and Burn events per pair."""
    rows = await query("""
        SELECT
            contractAddress AS pairAddress,
            SUM(CASE WHEN eventName='Mint' THEN JSON_EXTRACT(data,'$.liquidity') ELSE 0 END) AS totalMinted,
            SUM(CASE WHEN eventName='Burn' THEN JSON_EXTRACT(data,'$.liquidity') ELSE 0 END) AS totalBurned,
            COUNT(CASE WHEN eventName='Mint' THEN 1 END) AS mintCount,
            COUNT(CASE WHEN eventName='Burn' THEN 1 END) AS burnCount
        FROM dex_events
        WHERE eventName IN ('Mint','Burn')
        GROUP BY contractAddress
    """)
    return [dict(r) for r in rows]


@cached(lambda pair: f"risk_{pair}")
async def _get_risk_metrics(pair_address: str) -> dict:
    """Volatility metrics: price std dev and min/max over last 100 snapshots."""
    rows = await query("""
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
    """, (pair_address,))
    return dict(rows[0]) if rows else {}


async def _record_agent_decision(agent: str, action: str, reason: str, confidence: float, context: dict) -> str:
    await execute("""
        INSERT INTO agent_decisions (agentName, action, reason, confidence, contextJSON)
        VALUES (%s, %s, %s, %s, %s)
    """, (agent, action, reason, confidence, json.dumps(context, default=str)))
    return "Decision recorded."


async def _search_market_history(query_text: str, limit: int = 5) -> list[dict]:
    """Perform vector search in Qdrant for historical market patterns."""
    return await asyncio.to_thread(vector_store.search_history, query_text, limit)


# ── MCP Tools (Write) ────────────────────────────────────────────────────────

async def _execute_trade(token_in: str, token_out: str, amount_in: str) -> dict:
    """Execute a token swap on the blockchain."""
    try:
        amt = int(Decimal(amount_in))
        return await asyncio.to_thread(swap_tokens, token_in, token_out, amt)
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def _manage_liquidity(action: str, token_a: str, token_b: str, amount_a: str = "0", amount_b: str = "0", liquidity: str = "0") -> dict:
    """Add or remove liquidity from a pool."""
    try:
        if action == "ADD":
            amt_a = int(Decimal(amount_a))
            amt_b = int(Decimal(amount_b))
            return await asyncio.to_thread(add_liquidity, token_a, token_b, amt_a, amt_b)
        elif action == "REMOVE":
            liq = int(Decimal(liquidity))
            return await asyncio.to_thread(remove_liquidity, token_a, token_b, liq)
        else:
            return {"status": "error", "message": f"Invalid action: {action}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def _get_balances(token_addresses: list[str]) -> dict:
    """Fetch the agent's balance for multiple tokens."""
    return await asyncio.to_thread(get_balances, token_addresses)

async def _execute_arbitrage(path: list[str], amount_in: str) -> dict:
    """Execute a multi-hop swap for arbitrage."""
    try:
        amt = int(Decimal(amount_in))
        return await asyncio.to_thread(execute_multi_hop_swap, path, amt)
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── MCP Server Setup ──────────────────────────────────────────────────────────
server = Server("dex-mcp")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="get_market_context",
            description="Returns the latest reserves, spot price, and TWAP for every pair. Use as baseline before making any decision.",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="get_balances",
            description="Returns the agent's current token balances. Use to know how much you can trade.",
            inputSchema={
                "type": "object",
                "properties": {
                    "token_addresses": {"type": "array", "items": {"type": "string"}, "description": "List of 0x token addresses"}
                },
                "required": ["token_addresses"],
            },
        ),
        types.Tool(
            name="execute_arbitrage",
            description="Execute a multi-hop swap (e.g. A -> B -> C -> A) to capture arbitrage. Requires a path of token addresses and amount in Wei.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {"type": "array", "items": {"type": "string"}, "description": "Sequence of 0x token addresses"},
                    "amount_in": {"type": "string", "description": "Amount to swap in Wei"}
                },
                "required": ["path", "amount_in"],
            },
        ),
        types.Tool(
            name="search_market_history",
            description="Search historical market patterns using vector similarity (Qdrant). Use to see how the market behaved in similar past situations.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural language query, e.g., 'high volatility in USDC pool'"},
                    "limit": {"type": "integer", "description": "Number of historical matches to return", "default": 5}
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="execute_trade",
            description="Execute a swap on the DEX blockchain. Requires token addresses and amount in Wei.",
            inputSchema={
                "type": "object",
                "properties": {
                    "token_in": {"type": "string", "description": "0x address of input token"},
                    "token_out": {"type": "string", "description": "0x address of output token"},
                    "amount_in": {"type": "string", "description": "Amount to swap in Wei (as string)"}
                },
                "required": ["token_in", "token_out", "amount_in"],
            },
        ),
        types.Tool(
            name="manage_liquidity",
            description="Add or remove liquidity from a trading pair on the blockchain.",
            inputSchema={
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["ADD", "REMOVE"]},
                    "token_a": {"type": "string"},
                    "token_b": {"type": "string"},
                    "amount_a": {"type": "string", "description": "For ADD: amount of token A in Wei"},
                    "amount_b": {"type": "string", "description": "For ADD: amount of token B in Wei"},
                    "liquidity": {"type": "string", "description": "For REMOVE: amount of LP tokens in Wei"}
                },
                "required": ["action", "token_a", "token_b"],
            },
        ),
        types.Tool(
            name="get_recent_swaps",
            description="Returns the last N swap events with amounts and pair addresses.",
            inputSchema={
                "type": "object",
                "properties": {"n": {"type": "integer", "description": "Number of swaps to return (default 20)", "default": 20}},
                "required": [],
            },
        ),
        types.Tool(
            name="get_price_trend",
            description="Returns historical price snapshots for one pair. Use to detect trends or momentum.",
            inputSchema={
                "type": "object",
                "properties": {
                    "pair_address": {"type": "string", "description": "0x address of the DexPair contract"},
                    "n": {"type": "integer", "description": "Number of blocks to look back (default 50)", "default": 50},
                },
                "required": ["pair_address"],
            },
        ),
        types.Tool(
            name="get_liquidity_stats",
            description="Returns aggregated Mint/Burn event totals per pair. Use to assess pool depth and activity.",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="get_risk_metrics",
            description="Returns price volatility (std dev, min, max, avg) for a pair over the last 100 blocks. Use before recommending a trade.",
            inputSchema={
                "type": "object",
                "properties": {
                    "pair_address": {"type": "string", "description": "0x address of the DexPair contract"},
                },
                "required": ["pair_address"],
            },
        ),
        types.Tool(
            name="record_agent_decision",
            description="Write this agent's final decision to the database for auditability.",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent":      {"type": "string"},
                    "action":     {"type": "string", "description": "e.g. 'ADD_LIQUIDITY', 'SWAP', 'HOLD', 'ALERT'"},
                    "reason":     {"type": "string"},
                    "confidence": {"type": "number", "description": "0.0 to 1.0"},
                    "context":    {"type": "object", "description": "Key data that drove this decision"},
                },
                "required": ["agent", "action", "reason", "confidence", "context"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    try:
        if name == "get_market_context":
            result = await _get_market_context()
        elif name == "get_balances":
            result = await _get_balances(arguments["token_addresses"])
        elif name == "execute_arbitrage":
            result = await _execute_arbitrage(arguments["path"], arguments["amount_in"])
        elif name == "search_market_history":
            result = await _search_market_history(arguments["query"], arguments.get("limit", 5))
        elif name == "execute_trade":
            result = await _execute_trade(arguments["token_in"], arguments["token_out"], arguments["amount_in"])
        elif name == "manage_liquidity":
            result = await _manage_liquidity(
                arguments["action"], arguments["token_a"], arguments["token_b"],
                arguments.get("amount_a", "0"), arguments.get("amount_b", "0"),
                arguments.get("liquidity", "0")
            )
        elif name == "get_recent_swaps":
            result = await _get_recent_swaps(arguments.get("n", 20))
        elif name == "get_price_trend":
            result = await _get_price_trend(arguments["pair_address"], arguments.get("n", 50))
        elif name == "get_liquidity_stats":
            result = await _get_liquidity_stats()
        elif name == "get_risk_metrics":
            result = await _get_risk_metrics(arguments["pair_address"])
        elif name == "record_agent_decision":
            result = await _record_agent_decision(
                arguments["agent"], arguments["action"],
                arguments["reason"], arguments["confidence"],
                arguments.get("context", {})
            )
        else:
            result = {"error": f"Unknown tool: {name}"}

        return [types.TextContent(type="text", text=json.dumps(result, default=str, indent=2))]

    except Exception as e:
        return [types.TextContent(type="text", text=json.dumps({"error": str(e)}))]


# ── Entry Point ───────────────────────────────────────────────────────────────
async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
