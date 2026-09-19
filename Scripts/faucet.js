/**
 * Token faucet - distributes test tokens to any address.
 *
 * Usage:
 *   npx hardhat run Scripts/faucet.js --network ganache
 *   FAUCET_ADDRESS=0x... npx hardhat run Scripts/faucet.js --network ganache
 *   FAUCET_ADDRESS=0x... FAUCET_AMOUNT=50000 npx hardhat run Scripts/faucet.js --network ganache
 */
import pkg from "hardhat";
const { ethers } = pkg;

import { loadTokens } from "./load-tokens.js";

const DEFAULT_AMOUNT = "10000";

async function main() {
  const toAddress = process.env.FAUCET_ADDRESS;
  if (!toAddress) {
    console.error("Set FAUCET_ADDRESS env var:");
    console.error("  FAUCET_ADDRESS=0x... npx hardhat run Scripts/faucet.js --network ganache");
    process.exit(1);
  }

  const amount = process.env.FAUCET_AMOUNT || DEFAULT_AMOUNT;

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const tokens = loadTokens();

  console.log(`Faucet: sending ${amount} of each token to ${toAddress}`);
  console.log(`From deployer: ${deployer.address}\n`);

  for (const token of tokens) {
    const contract = await ethers.getContractAt("TestToken", token.address);
    const target = ethers.parseUnits(amount, token.decimals ?? 18);
    const balance = await contract.balanceOf(toAddress);

    if (balance >= target) {
      console.log(`  ${token.symbol}: already has ${ethers.formatUnits(balance, 18)} (skipped)`);
      continue;
    }

    const toSend = target - balance;
    const tx = await contract.transfer(toAddress, toSend);
    await tx.wait();
    console.log(`  ${token.symbol}: sent ${ethers.formatUnits(toSend, 18)} (tx: ${tx.hash})`);
  }

  console.log("\nDone! Refresh your wallet to see balances.");
}

main().catch((error) => {
  console.error("Faucet error:", error.message);
  process.exitCode = 1;
});
