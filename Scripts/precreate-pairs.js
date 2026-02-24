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

  // These would be the addresses from the deployed test tokens
  // We'll use the same addresses as in the test_pair_creation.js script
  const tokenAddresses = {
    USDC: "0x5163b86F8B08a75a5EBCBBeCF881cdcb469d388d", // From test_pair_creation.js
    DAI: "0x4217667a4b59A98971F99EF4828Fc4DCc818a558",  // From test_pair_creation.js
    // Add more as needed based on deployment
    WBTC: "0x0000000000000000000000000000000000000000", // Placeholder
    WETH: "0x0000000000000000000000000000000000000000", // Placeholder
  };

  console.log("Creating main trading pairs...");

  // Create pairs between major tokens
  const pairsToCreate = [
    [tokenAddresses.USDC, tokenAddresses.DAI],
    // Add more pairs as needed
  ];

  for (const [tokenA, tokenB] of pairsToCreate) {
    if (tokenA === "0x0000000000000000000000000000000000000000" ||
        tokenB === "0x0000000000000000000000000000000000000000") {
      console.log(`Skipping pair creation for ${tokenA} - ${tokenB} (placeholder addresses)`);
      continue;
    }

    try {
      console.log(`Creating pair for ${tokenA} and ${tokenB}...`);

      // Check if pair already exists
      const existingPair = await factory.getPair(tokenA, tokenB);
      if (existingPair !== "0x0000000000000000000000000000000000000000") {
        console.log(`Pair already exists at: ${existingPair}`);
        continue;
      }

      const tx = await factory.createPair(tokenA, tokenB);
      const receipt = await tx.wait();

      console.log(`Pair created successfully! Transaction: ${tx.hash}`);

      // Find the PairCreated event to get the new pair address
      const pairCreatedEvent = receipt.logs.find(log => {
        try {
          return factory.interface.parseLog(log)?.name === 'PairCreated';
        } catch {
          return false;
        }
      });

      if (pairCreatedEvent) {
        const parsedEvent = factory.interface.parseLog(pairCreatedEvent);
        const pairAddress = parsedEvent.args.pair;
        console.log(`New pair address: ${pairAddress}`);
      }
    } catch (error) {
      console.error(`Error creating pair for ${tokenA} and ${tokenB}:`, error.message);
    }
  }

  console.log("Pre-created pairs process completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});