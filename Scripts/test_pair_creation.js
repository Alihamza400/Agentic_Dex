import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  // Get the deployed factory
  const factoryAddress = "0x20299058bE643AC8ddD77970648d9DEB05479fA7";
  const Factory = await ethers.getContractFactory("DexFactory");
  const factory = await Factory.attach(factoryAddress);

  // Get the deployed tokens
  const Token = await ethers.getContractFactory("TestToken");
  const tokenA = await Token.attach("0x5163b86F8B08a75a5EBCBBeCF881cdcb469d388d"); // USDC
  const tokenB = await Token.attach("0x4217667a4b59A98971F99EF4828Fc4DCc818a558"); // DAI

  console.log("Factory address:", await factory.getAddress());
  console.log("Token A (USDC) address:", await tokenA.getAddress());
  console.log("Token B (DAI) address:", await tokenB.getAddress());

  // Check balances
  const [deployer] = await ethers.getSigners();
  const balanceA = await tokenA.balanceOf(deployer.address);
  const balanceB = await tokenB.balanceOf(deployer.address);
  console.log("Deployer USDC balance:", ethers.formatEther(balanceA));
  console.log("Deployer DAI balance:", ethers.formatEther(balanceB));

  // Check if pair already exists
  const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
  console.log("Current pair address:", pairAddress);

  if (pairAddress === "0x0000000000000000000000000000000000000000") {
    console.log("Attempting to create pair...");

    // Create the pair
    try {
      const tx = await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
      console.log("Transaction sent, hash:", tx.hash);

      const receipt = await tx.wait();
      console.log("Transaction successful!");
      console.log("Gas used:", receipt.gasUsed.toString());

      // Check the new pair address
      const newPairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      console.log("New pair address:", newPairAddress);
    } catch (error) {
      console.error("Error creating pair:", error.message);
    }
  } else {
    console.log("Pair already exists at:", pairAddress);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});