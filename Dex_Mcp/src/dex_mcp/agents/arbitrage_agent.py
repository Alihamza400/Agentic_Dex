"""
Arbitrage Agent - Finds and executes cross-pair arbitrage opportunities.

Monitors price differences between pairs and executes multi-hop swaps
when the spread exceeds the configured threshold.
"""

from __future__ import annotations

import time
from dex_mcp.agents.base_agent import (
    BaseAgent,
    Observation,
    Decision,
    AgentAction,
)


class ArbitrageAgent(BaseAgent):
    """Specialized agent for arbitrage trading.

    Strategy:
    1. Monitor all pool prices
    2. Calculate cross-pair price discrepancies
    3. Execute multi-hop swaps when spread > threshold
    4. Track PnL per arbitrage opportunity
    """

    def __init__(
        self,
        risk_level: str = "medium",
        min_spread_pct: float = 0.3,  # Minimum spread to execute (0.3%)
        max_trade_pct: float = 0.05,  # Max 5% of wallet per trade
    ):
        super().__init__(
            name="ArbitrageAgent",
            risk_level=risk_level,
            max_position_pct=max_trade_pct,
            cooldown_seconds=30,
        )
        self.min_spread_pct = min_spread_pct

    async def orient(self, observation: Observation) -> dict:
        """Analyze pool prices for arbitrage opportunities."""
        opportunities = []
        pools = observation.pools

        # Build price map: (token0, token1) -> price
        price_map = {}
        for pool in pools:
            pair = pool.get("pair", "")
            t0 = pool.get("t0", "")
            t1 = pool.get("t1", "")
            price = float(pool.get("price", "0") or "0")

            if price > 0 and t0 and t1:
                price_map[(t0, t1)] = price
                price_map[(t1, t0)] = 1 / price if price != 0 else 0

        # Find triangular arbitrage opportunities
        tokens = set()
        for (t0, t1) in price_map.keys():
            tokens.add(t0)
            tokens.add(t1)

        tokens = list(tokens)
        for i in range(len(tokens)):
            for j in range(len(tokens)):
                if i == j:
                    continue
                for k in range(len(tokens)):
                    if k == i or k == j:
                        continue

                    t1, t2, t3 = tokens[i], tokens[j], tokens[k]

                    # Check if path exists: t1 -> t2 -> t3 -> t1
                    p12 = price_map.get((t1, t2), 0)
                    p23 = price_map.get((t2, t3), 0)
                    p31 = price_map.get((t3, t1), 0)

                    if p12 > 0 and p23 > 0 and p31 > 0:
                        # Calculate effective price after fees (0.3% per hop)
                        effective = p12 * p23 * p31 * (0.997 ** 3)
                        spread_pct = (effective - 1) * 100

                        if spread_pct > self.min_spread_pct:
                            opportunities.append({
                                "path": [t1, t2, t3, t1],
                                "spread_pct": spread_pct,
                                "effective_price": effective,
                            })

        # Sort by spread (best first)
        opportunities.sort(key=lambda x: x["spread_pct"], reverse=True)

        return {
            "opportunities": opportunities[:5],  # Top 5
            "total_opportunities": len(opportunities),
            "price_map_size": len(price_map),
        }

    async def decide(self, observation: Observation, analysis: dict) -> Decision:
        """Decide whether to execute an arbitrage trade."""
        opportunities = analysis.get("opportunities", [])

        if not opportunities:
            return Decision(
                action=AgentAction.HOLD,
                reason="No profitable arbitrage opportunities found",
                confidence=0.8,
            )

        best = opportunities[0]
        spread = best["spread_pct"]
        path = best["path"]

        # Calculate position size based on risk level
        risk_multipliers = {"low": 0.02, "medium": 0.05, "high": 0.10}
        position_pct = risk_multipliers.get(self.risk_level, 0.05)

        # Use a conservative amount (1% of wallet for now)
        # In production, this would read actual balances
        amount_in = "1000000000000000000"  # 1 token (1e18)

        confidence = min(0.9, 0.5 + (spread / 10))

        return Decision(
            action=AgentAction.TRADE,
            reason=f"Arbitrage opportunity: {spread:.2f}% spread via {' -> '.join(path)}",
            confidence=confidence,
            params={
                "trade_type": "arbitrage",
                "path": path,
                "amount_in": amount_in,
                "min_amount_out": "0",
            },
            risk_score=1.0 - confidence,
        )

    async def act(self, decision: Decision) -> ExecutionResult:
        """Execute arbitrage via multi-hop swap."""
        if decision.action == AgentAction.HOLD:
            return ExecutionResult(
                success=True,
                action=AgentAction.HOLD,
                details={"reason": decision.reason},
            )

        from dex_mcp.MCP_Server import _execute_arbitrage

        path = decision.params.get("path", [])
        amount_in = decision.params.get("amount_in", "0")
        min_amount_out = decision.params.get("min_amount_out", "0")

        result = await _execute_arbitrage(path, amount_in, min_amount_out)

        return ExecutionResult(
            success=result.get("status") == "success",
            action=decision.action,
            details=result,
            error=result.get("message") if result.get("status") == "error" else None,
        )
