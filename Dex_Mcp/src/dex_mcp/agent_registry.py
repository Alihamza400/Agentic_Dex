"""
Agent Registry - Manages all trading agents and coordinates their execution.

Provides a central coordinator for the multi-agent system.
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

from dex_mcp.agents.arbitrage_agent import ArbitrageAgent
from dex_mcp.agents.liquidity_agent import LiquidityAgent
from dex_mcp.agents.risk_agent import RiskAgent
from dex_mcp.agents.sniper_agent import SniperAgent
from dex_mcp.agents.base_agent import AgentStatus


class AgentRegistry:
    """Central registry for all trading agents.

    Responsibilities:
    1. Initialize and configure all agents
    2. Coordinate agent execution cycles
    3. Manage agent lifecycle (start, stop, pause)
    4. Provide unified status and metrics
    """

    def __init__(self, risk_level: str = "medium"):
        self.risk_level = risk_level
        self.agents: dict[str, Any] = {}
        self.running = False
        self.cycle_count = 0

        # State directory
        self.state_dir = Path(__file__).resolve().parents[3] / ".agent_state"
        self.state_dir.mkdir(parents=True, exist_ok=True)

        # Initialize agents
        self._initialize_agents()

    def _initialize_agents(self) -> None:
        """Initialize all trading agents."""
        self.agents = {
            "arbitrage": ArbitrageAgent(risk_level=self.risk_level),
            "liquidity": LiquidityAgent(risk_level=self.risk_level),
            "risk": RiskAgent(risk_level="high"),
            "sniper": SniperAgent(risk_level=self.risk_level),
        }

        print(f"[AgentRegistry] Initialized {len(self.agents)} agents")

    async def start(self) -> None:
        """Start all agents and begin execution cycles."""
        self.running = True
        print("[AgentRegistry] Starting agent system...")

        # Activate all agents
        for agent in self.agents.values():
            agent.status = AgentStatus.ACTIVE

        # Start the main execution loop
        await self._execution_loop()

    async def stop(self) -> None:
        """Stop all agents."""
        self.running = False
        for agent in self.agents.values():
            agent.status = AgentStatus.STOPPED
        print("[AgentRegistry] All agents stopped")

    async def pause(self) -> None:
        """Pause all agents."""
        for agent in self.agents.values():
            agent.status = AgentStatus.PAUSED
        print("[AgentRegistry] All agents paused")

    async def resume(self) -> None:
        """Resume all agents."""
        for agent in self.agents.values():
            if agent.status == AgentStatus.PAUSED:
                agent.status = AgentStatus.ACTIVE
        print("[AgentRegistry] All agents resumed")

    async def _execution_loop(self) -> None:
        """Main execution loop that coordinates all agents."""
        while self.running:
            self.cycle_count += 1
            print(f"\n[AgentRegistry] === Cycle {self.cycle_count} ===")

            # Execute Risk Agent first (monitoring)
            risk_agent = self.agents.get("risk")
            if risk_agent and risk_agent.status == AgentStatus.ACTIVE:
                result = await risk_agent.run_cycle()
                if result and not result.success:
                    print(f"[AgentRegistry] Risk agent detected issues: {result.error}")

            # Execute other agents in priority order
            agent_order = ["arbitrage", "liquidity", "sniper"]
            for agent_name in agent_order:
                agent = self.agents.get(agent_name)
                if agent and agent.status == AgentStatus.ACTIVE:
                    result = await agent.run_cycle()
                    if result:
                        status = "SUCCESS" if result.success else "FAILED"
                        print(f"[AgentRegistry] {agent_name}: {status}")

            # Save global state
            self._save_global_state()

            # Wait before next cycle
            await asyncio.sleep(60)

    def _save_global_state(self) -> None:
        """Save global agent system state."""
        state = {
            "cycle_count": self.cycle_count,
            "running": self.running,
            "agents": {
                name: {
                    "status": agent.status.value,
                    "consecutive_failures": agent.consecutive_failures,
                    "last_action_time": agent.last_action_time,
                }
                for name, agent in self.agents.items()
            },
            "timestamp": time.time(),
        }

        state_file = self.state_dir / "agent_registry_state.json"
        try:
            state_file.write_text(json.dumps(state, indent=2))
        except Exception:
            pass

    def get_status(self) -> dict:
        """Get status of all agents."""
        return {
            "running": self.running,
            "cycle_count": self.cycle_count,
            "agents": {
                name: {
                    "status": agent.status.value,
                    "consecutive_failures": agent.consecutive_failures,
                    "last_action_time": agent.last_action_time,
                }
                for name, agent in self.agents.items()
            },
        }

    def get_agent(self, name: str) -> Any:
        """Get a specific agent by name."""
        return self.agents.get(name)

    def configure_agent(self, name: str, config: dict) -> bool:
        """Configure a specific agent."""
        agent = self.agents.get(name)
        if not agent:
            return False

        if "risk_level" in config:
            agent.risk_level = config["risk_level"]
        if "max_position_pct" in config:
            agent.max_position_pct = config["max_position_pct"]
        if "cooldown_seconds" in config:
            agent.cooldown_seconds = config["cooldown_seconds"]

        return True


# Global registry instance
_registry: AgentRegistry | None = None


def get_registry(risk_level: str = "medium") -> AgentRegistry:
    """Get or create the global agent registry."""
    global _registry
    if _registry is None:
        _registry = AgentRegistry(risk_level=risk_level)
    return _registry
