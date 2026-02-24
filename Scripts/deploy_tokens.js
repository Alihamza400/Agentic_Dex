async function main() {
  const Token = await ethers.getContractFactory("TestToken");

  // Deploy popular token equivalents
  const usdc = await Token.deploy(
    "USD Coin",
    "USDC",
    ethers.parseEther("1000000")
  );
  await usdc.waitForDeployment();
  console.log("USDC:", await usdc.getAddress());

  const dai = await Token.deploy(
    "Dai Stablecoin",
    "DAI",
    ethers.parseEther("1000000")
  );
  await dai.waitForDeployment();
  console.log("DAI:", await dai.getAddress());

  const wbtc = await Token.deploy(
    "Wrapped Bitcoin",
    "WBTC",
    ethers.parseEther("1000000")
  );
  await wbtc.waitForDeployment();
  console.log("WBTC:", await wbtc.getAddress());

  const weth = await Token.deploy(
    "Wrapped Ether",
    "WETH",
    ethers.parseEther("1000000")
  );
  await weth.waitForDeployment();
  console.log("WETH:", await weth.getAddress());

  const link = await Token.deploy(
    "Chainlink",
    "LINK",
    ethers.parseEther("1000000")
  );
  await link.waitForDeployment();
  console.log("LINK:", await link.getAddress());

  const uni = await Token.deploy(
    "Uniswap",
    "UNI",
    ethers.parseEther("1000000")
  );
  await uni.waitForDeployment();
  console.log("UNI:", await uni.getAddress());

  console.log("\nUse these addresses to create pairs in your DEX frontend!");
  console.log("Remember to copy the addresses above for pair creation.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
