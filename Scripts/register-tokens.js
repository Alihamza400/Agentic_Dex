import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  // Get the deployed factory
  const addresses = JSON.parse(
    require("fs").readFileSync("./frontend/src/contracts/addresses.json", "utf8")
  );

  const factoryAddress = addresses.DexFactory;
  const Factory = await ethers.getContractFactory("DexFactory");
  const factory = await Factory.attach(factoryAddress);

  console.log("Factory address:", factory.target);

  // Define test token addresses to register (these should match the ones from deploy_tokens.js)
  const tokensToRegister = [
    "0x5163b86F8B08a75a5EBCBBeCF881cdcb469d388d", // USDC from test_pair_creation.js
    "0x4217667a4b59A98971F99EF4828Fc4DCc818a558", // DAI from test_pair_creation.js
    // Add more addresses here when you deploy more tokens
  ];

  console.log("Registering tokens in factory registry...");

  for (const tokenAddress of tokensToRegister) {
    try {
      console.log(`Registering token: ${tokenAddress}`);

      // Check if token is already registered by attempting to get its details
      try {
        const [name, symbol, decimals] = await factory.getTokenDetails(tokenAddress);
        console.log(`Token already registered: ${symbol} (${name}), ${decimals} decimals`);
        continue;
      } catch (error) {
        // Token not registered, proceed with registration
      }

      const tx = await factory.registerToken(tokenAddress);
      await tx.wait();

      console.log(`Successfully registered token: ${tokenAddress}`);

      // Get the token details after registration
      const [name, symbol, decimals] = await factory.getTokenDetails(tokenAddress);
      console.log(`Token details: ${name} (${symbol}), ${decimals} decimals`);
    } catch (error) {
      console.error(`Error registering token ${tokenAddress}:`, error.message);
    }
  }

  console.log("Token registration process completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});