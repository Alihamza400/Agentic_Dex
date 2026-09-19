import pkg from "hardhat";
const { ethers } = pkg;

import { saveTokens } from "./update-frontend.js";
import { writeEnv } from "./env.js";

/** The token list the frontend and the agents trade. */
export const TEST_TOKENS = [
  { name: "USD Coin", symbol: "USDC", supply: "100000000" },
  { name: "Dai Stablecoin", symbol: "DAI", supply: "100000000" },
  { name: "Wrapped Bitcoin", symbol: "WBTC", supply: "100000000" },
  { name: "Wrapped Ether", symbol: "WETH", supply: "100000000" },
  { name: "Chainlink", symbol: "LINK", supply: "100000000" },
  { name: "Uniswap", symbol: "UNI", supply: "100000000" },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying test tokens as ${deployer.address}`);

  const tokens = [];
  for (const token of TEST_TOKENS) {
    const contract = await ethers.deployContract("TestToken", [
      token.name,
      token.symbol,
      ethers.parseUnits(token.supply, 18),
    ]);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    tokens.push({ ...token, address, decimals: 18 });
    console.log(`  ${token.symbol.padEnd(5)} ${address}`);
  }

  saveTokens(tokens);

  // The agents read these from .env (see Dex_Mcp/src/dex_mcp/Dex_Multi_Agent.py)
  const envUpdates = {};
  for (const token of tokens) envUpdates[`${token.symbol}_Address`] = token.address;
  writeEnv(envUpdates);

  console.log("\nToken addresses written to frontend/src/constants/deployedTokens.json and .env");
  console.log("Next: npm run pairs && npm run seed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
