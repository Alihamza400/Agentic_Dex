import pkg from "hardhat";
const { ethers } = pkg;

import { readEnv } from "./env.js";
import { loadTokens } from "./load-tokens.js";
import { PAIR_PLAN } from "./pairs.js";

async function main() {
  const env = readEnv();
  const factoryAddress = env.Factory_Address;
  if (!factoryAddress) {
    throw new Error(".env has no Factory_Address. Run \"npm run deploy\" first.");
  }

  const tokens = loadTokens();
  const bySymbol = Object.fromEntries(tokens.map((t) => [t.symbol, t.address]));
  const factory = await ethers.getContractAt("DexFactory", factoryAddress);

  console.log(`Factory: ${factoryAddress}`);
  console.log(`Creating ${PAIR_PLAN.length} pairs...\n`);

  const created = [];
  for (const [symbolA, symbolB] of PAIR_PLAN) {
    const tokenA = bySymbol[symbolA];
    const tokenB = bySymbol[symbolB];
    if (!tokenA || !tokenB) {
      console.warn(`  SKIP ${symbolA}/${symbolB} - token not deployed`);
      continue;
    }

    const existing = await factory.getPair(tokenA, tokenB);
    if (existing !== ethers.ZeroAddress) {
      console.log(`  ${symbolA}/${symbolB} already exists at ${existing}`);
      created.push({ symbolA, symbolB, pair: existing });
      continue;
    }

    const tx = await factory.createPair(tokenA, tokenB);
    const receipt = await tx.wait();
    const pair = await factory.getPair(tokenA, tokenB);
    created.push({ symbolA, symbolB, pair });
    console.log(`  ${symbolA}/${symbolB} created at ${pair} (tx ${receipt.hash.slice(0, 12)}...)`);
  }

  console.log(`\nPairs ready: ${created.length}. Total pairs on-chain: ${await factory.allPairsLength()}`);
  console.log("Next: npm run seed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
