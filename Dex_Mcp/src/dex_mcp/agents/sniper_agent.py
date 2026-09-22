"""
Sniper Agent - Provides initial liquidity to new pairs.

Watches for new pair creation events and provides liquidity
to promising new trading pairs early.
"""

from __future__ import annotations

import time
from dex_mcp.agents.base_agent import (
    BaseAgent,
    Observation,
    Decision,
    AgentAction,
)


class SniperAgent(BaseAgent):
    """Specialized agent for new pair liquidity provision.

    Strategy:
    1. Monitor for new pair creation events
    2. Evaluate token quality and pair potential
    3. Provide initial liquidity at favorable ratios
    4. Manage positions based on early trading activity
    """

    def __init__(
        self,
        risk_level: str = "medium",
        min_liquidity_usd: float = 100.0,  # Minimum liquidity to provide
        max_position_pct: float = 0.05,    # Max 5% of wallet per position
    ):
        super().__init__(
            name="SniperAgent",
            risk_level=risk_level,
            max_position_pct=max_position_pct,
            cooldown_seconds=60,
        )
        self.min_liquidity_usd = min_liquidity_usd
        self.known_pairs: set[str] = set()

    async def observe(self) -> Observation:
        """Collect market data and detect new pairs."""
        observation = await super().observe()

        # Track known pairs
        current_pairs = {p.get("pair", "") for p in observation.pools}
        new_pairs = current_pairs - self.known_pairs
        self.known_pairs = current_pairs

        observation.raw_data["new_pairs"] = list(new_pairs)
        return observation

    async def orient(self, observation: Observation) -> dict:
        """Analyze new pairs for liquidity opportunities."""
        new_pairs = observation.raw_data.get("new_pairs", [])

        opportunities = []
        for pair_address in new_pairs:
            # Find pool info
            pool_info = None
            for pool in observation.pools:
                if pool.get("pair", "") == pair_address:
                    pool_info = pool
                    break

            if not pool_info:
                continue

            t0 = pool_info.get("t0", "")
            t1 = pool_info.get("t1", "")
            r0 = float(pool_info.get("r0", "0") or "0")
            r1 = float(pool_info.get("r1", "0") or "0")

            # Evaluate pair quality
            score = 0.0

            # Prefer established tokens
            known_tokens = {"USDC", "DAI", "WBTC", "WETH", "LINK", "UNI"}
            if t0 in known_tokens or t1 in known_tokens:
                score += 0.3

            # Prefer balanced reserves
            if r0 > 0 and r1 > 0:
                ratio = min(r0, r1) / max(r0, r1)
                score += ratio * 0.3

            # Prefer higher total reserves (more interest)
            total_reserves = r0 + r1
            if total_reserves > 1000:
                score += 0.2
            elif total_reserves > 100:
                score += 0.1

            if score > 0.3:  # Minimum threshold
                opportunities.append({
                    "pair": pair_address,
                    "token0": t0,
                    "token1": t1,
                    "score": score,
                    "reserves": {"r0": r0, "r1": r1},
                })

        # Sort by score
        opportunities.sort(key=lambda x: x["score"], reverse=True)

        return {
            "opportunities": opportunities[:3],
            "new_pairs_count": len(new_pairs),
        }

    async def decide(self, observation: Observation, analysis: dict) -> Decision:
        """Decide whether to provide liquidity to a new pair."""
        opportunities = analysis.get("opportunities", [])

        if not opportunities:
            return Decision(
                action=AgentAction.HOLD,
                reason="No promising new pairs detected",
                confidence=0.8,
            )

        best = opportunities[0]
        score = best["score"]

        # Calculate position size based on risk level
        risk_multipliers = {"low": 0.01, "medium": 0.03, "high": 0.05}
        position_pct = risk_multipliers.get(self.risk_level, 0.03)

        # Fixed amounts for now
        amount_a = "1000000000000000000"  # 1 token (1e18)
        amount_b = "1000000000000000000"  # 1 token (1e18)

        confidence = min(0.8, 0.4 + score)

        return Decision(
            action=AgentAction.ADD_LIQUIDITY,
            reason=f"Providing liquidity to new pair {best['token0']}/{best['token1']} (score: {score:.2f})",
            confidence=confidence,
            params={
                "token_a": best["token0"],
                "token_b": best["token1"],
                "amount_a": amount_a,
                "amount_b": amount_b,
            },
            risk_score=1.0 - score,
        )

    async def act(self, decision: Decision) -> ExecutionResult:
        """Execute liquidity provision."""
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
