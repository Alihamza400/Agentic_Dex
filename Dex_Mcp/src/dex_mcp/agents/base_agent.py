"""
Base Agent class for the multi-agent system.

Provides the OODA (Observe → Orient → Decide → Act) loop framework
that all specialized agents extend.
"""

from __future__ import annotations

import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from dex_mcp.MCP_Server import (
    _get_balances,
    _get_live_pool_state,
    _get_market_context,
    _get_pools_for_agent,
    _record_agent_decision,
    _record_agent_trade,
)


class AgentStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"


class AgentAction(str, Enum):
    HOLD = "HOLD"
    TRADE = "TRADE"
    ADD_LIQUIDITY = "ADD_LIQUIDITY"
    REMOVE_LIQUIDITY = "REMOVE_LIQUIDITY"
    ALERT = "ALERT"


@dataclass
class Observation:
    """Data collected during the Observe phase."""
    market_context: list[dict] = field(default_factory=list)
    pools: list[dict] = field(default_factory=list)
    balances: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    raw_data: dict = field(default_factory=dict)


@dataclass
class Decision:
    """Output of the Decide phase."""
    action: AgentAction
    reason: str
    confidence: float  # 0.0 to 1.0
    params: dict = field(default_factory=dict)
    risk_score: float = 0.0  # 0.0 (low risk) to 1.0 (high risk)


@dataclass
class ExecutionResult:
    """Result of the Act phase."""
    success: bool
    action: AgentAction
    details: dict = field(default_factory=dict)
    error: str | None = None


class BaseAgent(ABC):
    """Abstract base class for all trading agents.

    Implements the OODA loop pattern:
    1. Observe: Collect market data
    2. Orient: Analyze and identify opportunities
    3. Decide: Choose an action
    4. Act: Execute the action on-chain
    """

    def __init__(
        self,
        name: str,
        risk_level: str = "medium",
        max_position_pct: float = 0.10,
        cooldown_seconds: int = 60,
    ):
        self.name = name
        self.risk_level = risk_level
        self.max_position_pct = max_position_pct
        self.cooldown_seconds = cooldown_seconds
        self.status = AgentStatus.ACTIVE
        self.last_action_time: float = 0
        self.consecutive_failures: int = 0
        self.max_consecutive_failures: int = 3
        self.trade_history: list[dict] = []

        # State directory for persistence
        self.state_dir = Path(__file__).resolve().parents[3] / ".agent_state"
        self.state_dir.mkdir(parents=True, exist_ok=True)

    @property
    def state_file(self) -> Path:
        return self.state_dir / f"{self.name.lower().replace(' ', '_')}_state.json"

    def _load_state(self) -> dict:
        if self.state_file.exists():
            try:
                return json.loads(self.state_file.read_text())
            except Exception:
                pass
        return {"status": "active", "trades": [], "stats": {}}

    def _save_state(self, state: dict) -> None:
        try:
            self.state_file.write_text(json.dumps(state, indent=2))
        except Exception:
            pass

    # ── OODA Loop ────────────────────────────────────────────────────────

    async def observe(self) -> Observation:
        """Phase 1: Collect market data from MCP tools."""
        market_context = await _get_market_context()
        pools = await _get_pools_for_agent()
        balances = await _get_balances()

        return Observation(
            market_context=market_context,
            pools=pools,
            balances=balances,
            timestamp=time.time(),
            raw_data={
                "market_context": market_context,
                "pools": pools,
                "balances": balances,
            },
        )

    @abstractmethod
    async def orient(self, observation: Observation) -> dict:
        """Phase 2: Analyze observation and identify opportunities.

        Subclasses must implement this to provide agent-specific analysis.
        Returns a dict of analysis results.
        """
        ...

    @abstractmethod
    async def decide(self, observation: Observation, analysis: dict) -> Decision:
        """Phase 3: Choose an action based on analysis.

        Subclasses must implement this to provide agent-specific decisions.
        """
        ...

    async def act(self, decision: Decision) -> ExecutionResult:
        """Phase 4: Execute the chosen action.

        This base implementation handles common patterns.
        Subclasses can override for custom execution logic.
        """
        from dex_mcp.MCP_Server import (
            _execute_arbitrage,
            _execute_trade,
            _manage_liquidity,
        )

        if decision.action == AgentAction.HOLD:
            return ExecutionResult(
                success=True,
                action=AgentAction.HOLD,
                details={"reason": "Holding position"},
            )

        if decision.action == AgentAction.TRADE:
            token_in = decision.params.get("token_in", "")
            token_out = decision.params.get("token_out", "")
            amount_in = decision.params.get("amount_in", "0")

            if not all([token_in, token_out, amount_in]):
                return ExecutionResult(
                    success=False,
                    action=decision.action,
                    error="Missing trade parameters",
                )

            result = await _execute_trade(token_in, token_out, amount_in)
            return ExecutionResult(
                success=result.get("status") == "success",
                action=decision.action,
                details=result,
                error=result.get("message") if result.get("status") == "error" else None,
            )

        if decision.action == AgentAction.ADD_LIQUIDITY:
            result = await _manage_liquidity(
                action="ADD",
                token_a=decision.params.get("token_a", ""),
                token_b=decision.params.get("token_b", ""),
                amount_a=decision.params.get("amount_a", "0"),
                amount_b=decision.params.get("amount_b", "0"),
            )
            return ExecutionResult(
                success=result.get("status") == "success",
                action=decision.action,
                details=result,
                error=result.get("message") if result.get("status") == "error" else None,
            )

        if decision.action == AgentAction.REMOVE_LIQUIDITY:
            result = await _manage_liquidity(
                action="REMOVE",
                token_a=decision.params.get("token_a", ""),
                token_b=decision.params.get("token_b", ""),
                liquidity=decision.params.get("liquidity", "0"),
            )
            return ExecutionResult(
                success=result.get("status") == "success",
                action=decision.action,
                details=result,
                error=result.get("message") if result.get("status") == "error" else None,
            )

        return ExecutionResult(
            success=False,
            action=decision.action,
            error=f"Unknown action: {decision.action}",
        )

    async def run_cycle(self) -> ExecutionResult | None:
        """Execute one full OODA cycle."""
        if self.status != AgentStatus.ACTIVE:
            return None

        # Cooldown check
        if time.time() - self.last_action_time < self.cooldown_seconds:
            return None

        # Circuit breaker check
        if self.consecutive_failures >= self.max_consecutive_failures:
            self.status = AgentStatus.ERROR
            print(f"[{self.name}] Circuit breaker tripped after {self.consecutive_failures} failures")
            return None

        try:
            # Observe
            observation = await self.observe()

            # Orient
            analysis = await self.orient(observation)

            # Decide
            decision = await self.decide(observation, analysis)

            # Act
            result = await self.act(decision)

            # Record decision
            await _record_agent_decision(
                agent=self.name,
                action=decision.action.value,
                reason=decision.reason,
                confidence=decision.confidence,
                context={
                    "risk_score": decision.risk_score,
                    "params": decision.params,
                    "result_success": result.success if result else False,
                },
            )

            # Update state
            if result and result.success:
                self.consecutive_failures = 0
                self.last_action_time = time.time()
            else:
                self.consecutive_failures += 1

            return result

        except Exception as exc:
            self.consecutive_failures += 1
            print(f"[{self.name}] Cycle error: {exc}")
            return ExecutionResult(
                success=False,
                action=AgentAction.HOLD,
                error=str(exc),
            )

    def get_stats(self) -> dict:
        """Get agent statistics."""
        return {
            "name": self.name,
            "status": self.status.value,
            "consecutive_failures": self.consecutive_failures,
            "last_action_time": self.last_action_time,
            "trade_count": len(self.trade_history),
        }
