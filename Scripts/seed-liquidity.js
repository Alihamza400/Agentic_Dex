import pkg from "hardhat";
const { ethers } = pkg;

import { readEnv } from "./env.js";
import { loadTokens } from "./load-tokens.js";
import { PAIR_PLAN } from "./pairs.js";

const INITIAL_LIQUIDITY = "5000"; // per token, per pair
const DISTRIBUTION = "50000"; // per token, to every unlocked account

/** Minimal JSON-RPC helper - bypasses hardhat-ethers' filtered account list. */
async function rawRpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message ?? "JSON-RPC error");
  return json.result ?? [];
}

async function main() {
  const env = readEnv();
  const routerAddress = env.Router_Address;
  const factoryAddress = env.Factory_Address;
  if (!routerAddress || !factoryAddress) {
    throw new Error(".env has no Router_Address/Factory_Address. Run \"npm run deploy\" first.");
  }

  const [deployer] = await ethers.getSigners();
  const tokens = loadTokens();
  const router = await ethers.getContractAt("DexRouter", routerAddress);
  const factory = await ethers.getContractAt("DexFactory", factoryAddress);

  // Hardhat only exposes the private keys listed in the network config, so the
  // full account list is requested from the node over raw JSON-RPC (Ganache
  // returns the 10 accounts MetaMask imports). SEED_ACCOUNTS adds extras.
  const nodeAccounts = await rawRpc(env.RPC_URL || "http://127.0.0.1:7545", "eth_accounts", []);
  const extraAccounts = (env.SEED_ACCOUNTS || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const recipients = [...new Set([...nodeAccounts, ...extraAccounts])].filter(
    (address) => address.toLowerCase() !== deployer.address.toLowerCase()
  );

  console.log(`Seeding from ${deployer.address}`);
  console.log(`Distributing to ${recipients.length} accounts\n`);

  // 1. Give every unlocked account (MetaMask's imported Ganache accounts) tokens
  console.log("Distributing test tokens...");
  for (const token of tokens) {
    const contract = await ethers.getContractAt("TestToken", token.address);
    const target = ethers.parseUnits(DISTRIBUTION, token.decimals ?? 18);
    for (const address of recipients) {
      const balance = await contract.balanceOf(address);
      if (balance < target) {
        await (await contract.transfer(address, target - balance)).wait();
      }
    }
    console.log(`  ${token.symbol} -> ${recipients.length} accounts`);
  }

  // 2. Approve the router once per token
  console.log("\nApproving router...");
  for (const token of tokens) {
    const contract = await ethers.getContractAt("TestToken", token.address);
    if ((await contract.allowance(deployer.address, routerAddress)) < ethers.MaxUint256 / 2n) {
      await (await contract.approve(routerAddress, ethers.MaxUint256)).wait();
    }
  }

  // 3. Seed every pair that has no reserves yet
  console.log("\nSeeding pools...");
  const amount = ethers.parseUnits(INITIAL_LIQUIDITY, 18);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const bySymbol = Object.fromEntries(tokens.map((t) => [t.symbol, t.address]));

  for (const [symbolA, symbolB] of PAIR_PLAN) {
    const tokenA = bySymbol[symbolA];
    const tokenB = bySymbol[symbolB];
    if (!tokenA || !tokenB) continue;

    const pairAddress = await factory.getPair(tokenA, tokenB);
    if (pairAddress === ethers.ZeroAddress) {
      console.warn(`  SKIP ${symbolA}/${symbolB} - pair not created yet`);
      continue;
    }

    const pair = await ethers.getContractAt("DexPair", pairAddress);
    const [r0, r1] = await pair.getReserves();
    if (r0 > 0n && r1 > 0n) {
      console.log(`  ${symbolA}/${symbolB} already has liquidity (${r0} / ${r1})`);
      continue;
    }

    await (await router.addLiquidity(tokenA, tokenB, amount, amount, deadline)).wait();
    console.log(`  ${symbolA}/${symbolB} seeded with ${INITIAL_LIQUIDITY} of each token`);
  }

  console.log("\nSeeding complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
