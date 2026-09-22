"""
Risk Agent - Monitors all agents and enforces risk limits.

Does not trade itself. Watches for anomalous behavior,
circuit breaker triggers, and can pause other agents.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from dex_mcp.agents.base_agent import (
    BaseAgent,
    Observation,
    Decision,
    AgentAction,
    AgentStatus,
)


class RiskAgent(BaseAgent):
    """Specialized agent for risk management and monitoring.

    Responsibilities:
    1. Monitor all agent activities
    2. Detect anomalous trading patterns
    3. Enforce circuit breakers
    4. Can pause other agents when risk is high
    5. Provides risk metrics dashboard
    """

    def __init__(
        self,
        risk_level: str = "high",  # Risk agent operates at high sensitivity
        max_drawdown_pct: float = 10.0,  # Max portfolio drawdown before halt
        max_hourly_trades: int = 50,
    ):
        super().__init__(
            name="RiskAgent",
            risk_level=risk_level,
            max_position_pct=0.0,  # Never trades
            cooldown_seconds=10,   # Monitors frequently
        )
        self.max_drawdown_pct = max_drawdown_pct
        self.max_hourly_trades = max_hourly_trades
        self.hourly_trade_count = 0
        self.hour_start = time.time()
        self.initial_portfolio_value = 0.0
        self.current_portfolio_value = 0.0

    async def orient(self, observation: Observation) -> dict:
        """Analyze risk metrics across the system."""
        # Load all agent states
        agent_states = self._load_all_agent_states()

        # Check for anomalies
        anomalies = []

        # Check hourly trade count
        now = time.time()
        if now - self.hour_start > 3600:
            self.hourly_trade_count = 0
            self.hour_start = now

        if self.hourly_trade_count > self.max_hourly_trades:
            anomalies.append({
                "type": "high_trade_frequency",
                "severity": "high",
                "message": f"Hourly trade count ({self.hourly_trade_count}) exceeds limit ({self.max_hourly_trades})",
            })

        # Check for consecutive failures across agents
        for agent_name, state in agent_states.items():
            failures = state.get("consecutive_failures", 0)
            if failures >= 3:
                anomalies.append({
                    "type": "consecutive_failures",
                    "severity": "critical",
                    "agent": agent_name,
                    "message": f"Agent {agent_name} has {failures} consecutive failures",
                })

        # Check portfolio drawdown
        if self.initial_portfolio_value > 0:
            drawdown = ((self.initial_portfolio_value - self.current_portfolio_value)
                       / self.initial_portfolio_value) * 100
            if drawdown > self.max_drawdown_pct:
                anomalies.append({
                    "type": "max_drawdown",
                    "severity": "critical",
                    "message": f"Portfolio drawdown ({drawdown:.1f}%) exceeds maximum ({self.max_drawdown_pct}%)",
                })

        return {
            "anomalies": anomalies,
            "agent_states": agent_states,
            "hourly_trades": self.hourly_trade_count,
            "portfolio_drawdown": drawdown if self.initial_portfolio_value > 0 else 0,
        }

    async def decide(self, observation: Observation, analysis: dict) -> Decision:
        """Decide whether to alert or pause agents."""
        anomalies = analysis.get("anomalies", [])

        if not anomalies:
            return Decision(
                action=AgentAction.HOLD,
                reason="All risk metrics within acceptable limits",
                confidence=0.9,
            )

        # Check for critical anomalies
        critical = [a for a in anomalies if a["severity"] == "critical"]
        if critical:
            return Decision(
                action=AgentAction.ALERT,
                reason=f"Critical risk detected: {critical[0]['message']}",
                confidence=0.95,
                params={"anomalies": critical, "action": "pause_agents"},
            )

        # High severity anomalies
        high = [a for a in anomalies if a["severity"] == "high"]
        if high:
            return Decision(
                action=AgentAction.ALERT,
                reason=f"High risk detected: {high[0]['message']}",
                confidence=0.85,
                params={"anomalies": high, "action": "alert"},
            )

        return Decision(
            action=AgentAction.HOLD,
            reason=f"Minor anomalies detected: {len(anomalies)} issues",
            confidence=0.7,
        )

    async def act(self, decision: Decision) -> ExecutionResult:
        """Execute risk management actions."""
        if decision.action == AgentAction.HOLD:
            return ExecutionResult(
                success=True,
                action=AgentAction.HOLD,
                details={"reason": decision.reason},
            )

        if decision.action == AgentAction.ALERT:
            # In production, this would:
            # 1. Send alerts via notification system
            # 2. Pause affected agents
            # 3. Log to monitoring system
            params = decision.params
            action_type = params.get("action", "alert")

            if action_type == "pause_agents":
                # Pause all trading agents
                await self._pause_all_agents()
                return ExecutionResult(
                    success=True,
                    action=decision.action,
                    details={"message": "All agents paused due to critical risk"},
                )

            return ExecutionResult(
                success=True,
                action=decision.action,
                details={"message": f"Alert sent: {decision.reason}"},
            )

        return ExecutionResult(
            success=False,
            action=decision.action,
            error="Unknown action",
        )

    def _load_all_agent_states(self) -> dict:
        """Load states of all agents from their state files."""
        state_dir = Path(__file__).resolve().parents[3] / ".agent_state"
        states = {}

        for state_file in state_dir.glob("*_state.json"):
            try:
                agent_name = state_file.stem.replace("_state", "")
                states[agent_name] = json.loads(state_file.read_text())
            except Exception:
                continue

        return states

    async def _pause_all_agents(self) -> None:
        """Pause all trading agents by updating their state files."""
        state_dir = Path(__file__).resolve().parents[3] / ".agent_state"

        for state_file in state_dir.glob("*_state.json"):
            try:
                state = json.loads(state_file.read_text())
                state["status"] = "paused"
                state_file.write_text(json.dumps(state, indent=2))
            except Exception:
                continue

    def get_risk_metrics(self) -> dict:
        """Get current risk metrics for dashboard."""
        drawdown = 0.0
        if self.initial_portfolio_value > 0:
            drawdown = ((self.initial_portfolio_value - self.current_portfolio_value)
                       / self.initial_portfolio_value) * 100

        return {
            "portfolio_drawdown": round(drawdown, 2),
            "hourly_trades": self.hourly_trade_count,
            "max_drawdown_limit": self.max_drawdown_pct,
            "max_hourly_trades": self.max_hourly_trades,
            "risk_level": self.risk_level,
        }
