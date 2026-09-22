"""
Multi-Agent System for the Agentic DEX.

This module provides specialized trading agents that work together:
- BaseAgent: Abstract base class with common OODA loop logic
- ArbitrageAgent: Finds and executes cross-pair arbitrage opportunities
- LiquidityAgent: Manages LP positions for optimal fee earning
- RiskAgent: Monitors all agents and enforces risk limits
- SniperAgent: Provides initial liquidity to new pairs

Each agent follows the Observe → Orient → Decide → Act cycle
and communicates through a shared state registry.
"""

from dex_mcp.agents.base_agent import BaseAgent
from dex_mcp.agents.arbitrage_agent import ArbitrageAgent
from dex_mcp.agents.liquidity_agent import LiquidityAgent
from dex_mcp.agents.risk_agent import RiskAgent
from dex_mcp.agents.sniper_agent import SniperAgent

__all__ = [
    "BaseAgent",
    "ArbitrageAgent",
    "LiquidityAgent",
    "RiskAgent",
    "SniperAgent",
]
