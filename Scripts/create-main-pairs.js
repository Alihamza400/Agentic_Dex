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

  // Define main tokens to create pairs between
  // These would typically be major tokens like WETH, USDC, DAI, WBTC, LINK, UNI, etc.
  const tokenAddresses = {
    // Placeholder addresses - in a real scenario these would be actual deployed token addresses
    WETH: "0x67e45d921ba7ac69fa38D4064711da3bf599b028", // Replace with actual WETH address
    USDC: " 0xe216Bd07251b69F2328a7A5f525348f9cdbf6338", // Replace with actual USDC address
    DAI: " 0xe10106e6FB793d52Fc91B1A1045112813863142a",  // Replace with actual DAI address
    WBTC: "   0x9a59e5F6E905791cB87633b7cd416257FF20800D", // Replace with actual WBTC address
    LINK: "   0x1BCB6AB76CDd9A593b73Ef3fE72cac28F4f73175", // Replace with actual LINK address
    UNI: " 0x27B9e704cf55BDbB8C07B63b851d675B91c7d24A",  // Replace with actual UNI address
  };

  // Read deployed test token addresses from a file if available
  try {
    const testTokens = JSON.parse(
      require("fs").readFileSync("./test-tokens.json", "utf8")
    );

    // Update with actual test token addresses if available
    Object.assign(tokenAddresses, testTokens);
  } catch (e) {
    console.log("Test token addresses file not found, using placeholder addresses");
  }

  console.log("Creating main trading pairs...");

  // Create pairs between major tokens
  const pairsToCreate = [
    [tokenAddresses.WETH, tokenAddresses.USDC],
    [tokenAddresses.WETH, tokenAddresses.DAI],
    [tokenAddresses.USDC, tokenAddresses.DAI],
    [tokenAddresses.WETH, tokenAddresses.WBTC],
    [tokenAddresses.LINK, tokenAddresses.WETH],
    [tokenAddresses.UNI, tokenAddresses.WETH],
    [tokenAddresses.USDC, tokenAddresses.WBTC],
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

  console.log("Main pairs creation process completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});