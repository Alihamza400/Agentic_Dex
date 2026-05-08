"""
Gigantic Agentic DEX Orchestrator (Professional Quant Version)
Uses Gemini 2.0 with RAG (Qdrant) and Multi-Hop MCP Tools for professional trading.
Optimized for high accuracy, arbitrage, and comprehensive position management.
"""

import asyncio
import json
import os
import time
import google.generativeai as genai
import nest_asyncio
from dotenv import load_dotenv

# Import MCP tools and Vector Store
from dex_mcp.MCP_Server import (
    _get_market_context,
    _get_recent_swaps,
    _get_price_trend,
    _get_liquidity_stats,
    _get_risk_metrics,
    _record_agent_decision,
    _search_market_history,
    _execute_trade,
    _manage_liquidity,
    _get_balances,
    _execute_arbitrage
)

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Apply nest_asyncio to allow nested event loops (fix for Gemini tool calling)
nest_asyncio.apply()

# ── Sync Tool Wrappers (Gemini SDK compatibility) ────────────────────────────

def run_sync(coro):
    """Helper to run coroutines from synchronous tool calls."""
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)

def get_market_context():
    """Returns the latest reserves, spot price, and TWAP for every pair."""
    return run_sync(_get_market_context())

def get_balances(token_addresses: list[str]):
    """Returns the agent's current token balances."""
    return run_sync(_get_balances(token_addresses))

def execute_arbitrage(path: list[str], amount_in: str):
    """Execute a multi-hop swap for arbitrage capturing."""
    return run_sync(_execute_arbitrage(path, amount_in))

def search_market_history(query: str, limit: int = 5):
    """Search historical market patterns using vector similarity in Qdrant."""
    return run_sync(_search_market_history(query, limit))

def execute_trade(token_in: str, token_out: str, amount_in: str):
    """Execute a token swap on the DEX blockchain. amount_in is in Wei."""
    return run_sync(_execute_trade(token_in, token_out, amount_in))

def manage_liquidity(action: str, token_a: str, token_b: str, amount_a: str = "0", amount_b: str = "0", liquidity: str = "0"):
    """Add or remove liquidity from a trading pair on the blockchain."""
    return run_sync(_manage_liquidity(action, token_a, token_b, amount_a, amount_b, liquidity))

def get_recent_swaps(n: int = 20):
    """Returns the last N swap events with amounts and pair addresses."""
    return run_sync(_get_recent_swaps(n))

def get_risk_metrics(pair_address: str):
    """Returns price volatility (std dev, min, max, avg) for a pair over last 100 blocks."""
    return run_sync(_get_risk_metrics(pair_address))

def get_price_trend(pair_address: str, n: int = 50):
    """Returns historical price snapshots for one pair."""
    return run_sync(_get_price_trend(pair_address, n))

# ── Agent Setup ──────────────────────────────────────────────────────────────

tools = [
    get_market_context,
    get_balances,
    execute_arbitrage,
    search_market_history,
    execute_trade,
    manage_liquidity,
    get_recent_swaps,
    get_risk_metrics,
    get_price_trend
]

model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    tools=tools,
    system_instruction=(
        "You are the 'Senior Quant Orchestrator' of a sophisticated DEX trading system.\n\n"
        "CORE MANDATE:\n"
        "Execute high-fidelity trading strategies including Arbitrage, Trend Following, and Liquidity Mining. "
        "Maintain total capital preservation while extracting maximum value from the market.\n\n"
        "DECISION FRAMEWORK (OODA Loop):\n"
        "1. OBSERVE: Fetch your wallet balances and the global market context.\n"
        "2. ORIENT: Identify price discrepancies between spot and TWAP. If a trend is forming, search historical RAG memory (Qdrant) to see how it played out before.\n"
        "3. DECIDE: Calculate the 'Expected Value' (EV) of a trade. \n"
        "   - ARBITRAGE: If path A->B->C->A yields >0.3% (after 0.3% fee per hop), it is a priority.\n"
        "   - TREND: If spot price deviates significantly from historical vector norms, prepare to trade.\n"
        "   - LIQUIDITY: If a pool is underweight and volatility is low, add liquidity for fee revenue.\n"
        "4. ACT: Execute the tool call with precision. Report the resulting tx_hash.\n\n"
        "RISK PARAMETERS:\n"
        "- Max position size: 10% of total balance per trade.\n"
        "- Slippage limit: 1%.\n"
        "- Never trade during high-volatility spikes (check risk_metrics).\n\n"
        "REPORTING:\n"
        "Produce a 'Gorgeous' analytical summary. Use bullet points and clear technical reasoning."
    )
)

AGENT_INTERVAL_SECONDS = 60 

async def process_agent_loop():
    print(f"\n{'='*20} QUANT CYCLE START {'='*20}")
    
    # Step 0: Read Configuration from DB (Frontend Control)
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM agent_config WHERE id = 1")
                config = await cur.fetchone()
        
        if not config or not config['is_active']:
            print(f"[{time.strftime('%H:%M:%S')}] Agent is INACTIVE in DB. Skipping cycle...")
            return
            
        print(f"[{time.strftime('%H:%M:%S')}] Agent ACTIVE. Strategy: {config['strategy']}, Risk: {config['risk_level']}")
        current_strategy = config['strategy']
        current_risk = config['risk_level']
    except Exception as e:
        print(f"Error reading agent_config: {e}")
        return

    print(f"[{time.strftime('%H:%M:%S')}] Orchestrator gathering data manually...")

    try:
        # Step 1: Pre-fetch data to save API calls
        context = await _get_market_context()
        usdc_addr = "0x2483fCcf791BE94436601dFB8B1761db57bA111D"
        dai_addr = "0x359315adBE8B38C37eD95a9635a780673e1F81cA"
        balances = await asyncio.to_thread(get_balances, [usdc_addr, dai_addr])

        market_data_summary = json.dumps({
            "market_context": context,
            "wallet_balances": balances,
            "tokens": {"USDC": usdc_addr, "DAI": dai_addr},
            "user_commanded_strategy": current_strategy,
            "user_commanded_risk_level": current_risk
        }, indent=2)

        print(f"[{time.strftime('%H:%M:%S')}] Data gathered. Consulting Gemini...")
        
        chat = model.start_chat(enable_automatic_function_calling=True)

        prompt = (
            f"CURRENT MARKET STATE:\n{market_data_summary}\n\n"
            f"REQUIRED STRATEGY: {current_strategy}\n"
            f"RISK TOLERANCE: {current_risk}\n\n"
            "TASK:\n"
            f"1. You MUST follow the {current_strategy} strategy as priority.\n"
            f"2. Adjust your position sizes according to {current_risk} risk.\n"
            "3. Analyze pool health and spot vs TWAP deviation.\n"
            "4. EXECUTE actions using your tools if the strategy yields opportunity.\n"
            "5. Report the result."
        )

        # This will now likely take only 1-2 calls total
        response = await asyncio.to_thread(chat.send_message, prompt)

        print("\n[Senior Quant Log]")
        print(response.text)
        ...
        await _record_agent_decision(
            agent="Quant_Orchestrator",
            action="QUANT_ANALYSIS",
            reason=response.text[:1000],
            confidence=1.0,
            context={"full_log": response.text}
        )
        
    except Exception as e:
        print(f"!!! Loop Error: {e}")

async def main():
    print("="*60)
    print("  GIGANTIC AGENTIC DEX ORCHESTRATOR v3.0 (Quant Grade)  ")
    print("  Initializing AI brain with RAG & Web3 Execution Tools... ")
    print("="*60)
    
    if not os.getenv("GEMINI_API_KEY"):
        print("CRITICAL: GEMINI_API_KEY missing.")
        return

    try:
        while True:
            await process_agent_loop()
            print(f"\n[Cycle Pause] Next sweep in {AGENT_INTERVAL_SECONDS}s...")
            await asyncio.sleep(AGENT_INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nGraceful shutdown.")

if __name__ == "__main__":
    asyncio.run(main())
