/**
 * The pairs the DEX ships with. The graph is connected
 * (USDC-DAI-WBTC-WETH-LINK-UNI) so the arbitrage agent always has a 3+ hop path.
 */
export const PAIR_PLAN = [
  ["USDC", "DAI"],
  ["DAI", "WBTC"],
  ["WBTC", "WETH"],
  ["WETH", "LINK"],
  ["LINK", "UNI"],
  ["USDC", "WETH"],
];
