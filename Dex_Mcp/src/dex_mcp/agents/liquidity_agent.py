"""
Liquidity Agent - Manages LP positions for optimal fee earning.

Monitors pool volumes and fee APR, adding/removing liquidity
to maximize returns while minimizing impermanent loss risk.
"""

from __future__ import annotations

import time
from dex_mcp.agents.base_agent import (
    BaseAgent,
    Observation,
    Decision,
    AgentAction,
)


class LiquidityAgent(BaseAgent):
    """Specialized agent for liquidity management.

    Strategy:
    1. Monitor pool volumes and fee generation
    2. Calculate fee APR for each pool
    3. Add liquidity to high-APR pools
    4. Remove liquidity when APR drops or IL risk is high
    """

    def __init__(
        self,
        risk_level: str = "medium",
        min_apr_pct: float = 10.0,  # Minimum APR to add liquidity
        max_il_pct: float = 5.0,    # Max acceptable impermanent loss
    ):
        super().__init__(
            name="LiquidityAgent",
            risk_level=risk_level,
            max_position_pct=0.20,
            cooldown_seconds=300,  # 5 minute cooldown for liquidity ops
        )
        self.min_apr_pct = min_apr_pct
        self.max_il_pct = max_il_pct

    async def orient(self, observation: Observation) -> dict:
        """Analyze pools for liquidity opportunities."""
        pool_analysis = []

        for pool in observation.pools:
            pair = pool.get("pair", "")
            t0 = pool.get("t0", "")
            t1 = pool.get("t1", "")
            r0 = float(pool.get("r0", "0") or "0")
            r1 = float(pool.get("r1", "0") or "0")
            price = float(pool.get("price", "0") or "0")

            if r0 <= 0 or r1 <= 0:
                continue

            # Estimate pool value (simplified)
            total_value = r0 + r1 * price if price > 0 else r0 + r1

            # Estimate APR based on reserve ratio (higher reserves = more stable = lower fees)
            # This is a simplified heuristic
            reserve_ratio = min(r0, r1) / max(r0, r1) if max(r0, r1) > 0 else 0
            estimated_apr = 20 * (1 - reserve_ratio)  # Higher imbalance = higher fees

            # Calculate impermanent loss risk
            # IL increases with price divergence from entry
            il_risk = abs(1 - reserve_ratio) * 100

            pool_analysis.append({
                "pair": pair,
                "token0": t0,
                "token1": t1,
                "reserve0": r0,
                "reserve1": r1,
                "total_value": total_value,
                "estimated_apr": estimated_apr,
                "il_risk": il_risk,
                "reserve_ratio": reserve_ratio,
            })

        # Sort by APR (best first)
        pool_analysis.sort(key=lambda x: x["estimated_apr"], reverse=True)

        return {
            "pools": pool_analysis,
            "total_pools": len(pool_analysis),
        }

    async def decide(self, observation: Observation, analysis: dict) -> Decision:
        """Decide whether to add or remove liquidity."""
        pools = analysis.get("pools", [])

        if not pools:
            return Decision(
                action=AgentAction.HOLD,
                reason="No viable pools for liquidity provision",
                confidence=0.8,
            )

        best_pool = pools[0]
        apr = best_pool["estimated_apr"]
        il_risk = best_pool["il_risk"]

        # Check if APR is attractive enough
        if apr < self.min_apr_pct:
            return Decision(
                action=AgentAction.HOLD,
                reason=f"Best APR ({apr:.1f}%) below threshold ({self.min_apr_pct}%)",
                confidence=0.7,
            )

        # Check if IL risk is acceptable
        if il_risk > self.max_il_pct:
            return Decision(
                action=AgentAction.HOLD,
                reason=f"IL risk ({il_risk:.1f}%) exceeds maximum ({self.max_il_pct}%)",
                confidence=0.7,
            )

        # Calculate position size
        risk_multipliers = {"low": 0.05, "medium": 0.10, "high": 0.20}
        position_pct = risk_multipliers.get(self.risk_level, 0.10)

        # For now, use a fixed amount
        # In production, this would calculate based on wallet balance
        amount_a = "1000000000000000000"  # 1 token (1e18)
        amount_b = "1000000000000000000"  # 1 token (1e18)

        confidence = min(0.85, 0.5 + (apr / 100))

        return Decision(
            action=AgentAction.ADD_LIQUIDITY,
            reason=f"Adding liquidity to {best_pool['token0']}/{best_pool['token1']} (APR: {apr:.1f}%, IL risk: {il_risk:.1f}%)",
            confidence=confidence,
            params={
                "token_a": best_pool["token0"],
                "token_b": best_pool["token1"],
                "amount_a": amount_a,
                "amount_b": amount_b,
            },
            risk_score=il_risk / 100,
        )

    async def act(self, decision: Decision) -> ExecutionResult:
        """Execute liquidity operation."""
        if decision.action == AgentAction.HOLD:
            return ExecutionResult(
                success=True,
                action=AgentAction.HOLD,
                details={"reason": decision.reason},
            )

        from dex_mcp.MCP_Server import _manage_liquidity

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
