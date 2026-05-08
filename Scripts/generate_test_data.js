import pkg from "hardhat";
const { ethers } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  const factoryAddress = process.env.Factory_Address;
  const routerAddress = process.env.Router_Address;

  const usdcAddress = "0x2483fCcf791BE94436601dFB8B1761db57bA111D";
  const daiAddress = "0x359315adBE8B38C37eD95a9635a780673e1F81cA";

  const Factory = await ethers.getContractAt("DexFactory", factoryAddress);
  const Router = await ethers.getContractAt("DexRouter", routerAddress);
  const USDC = await ethers.getContractAt("TestToken", usdcAddress);
  const DAI = await ethers.getContractAt("TestToken", daiAddress);

  console.log("Checking for pair...");
  let pairAddress = await Factory.getPair(usdcAddress, daiAddress);
  
  if (pairAddress === "0x0000000000000000000000000000000000000000") {
    console.log("Creating pair...");
    const tx = await Factory.createPair(usdcAddress, daiAddress);
    await tx.wait();
    pairAddress = await Factory.getPair(usdcAddress, daiAddress);
  }
  console.log("Pair address:", pairAddress);

  console.log("Approving tokens for router...");
  const amountA = ethers.parseEther("1000");
  const amountB = ethers.parseEther("1000");

  await (await USDC.approve(routerAddress, amountA)).wait();
  await (await DAI.approve(routerAddress, amountB)).wait();

  console.log("Adding liquidity...");
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
  const addLiqTx = await Router.addLiquidity(
    usdcAddress,
    daiAddress,
    amountA,
    amountB,
    deadline
  );
  await addLiqTx.wait();
  console.log("Liquidity added!");

  console.log("Performing a swap...");
  const amountIn = ethers.parseEther("10");
  await (await USDC.approve(routerAddress, amountIn)).wait();
  
  const swapTx = await Router.swapExactTokensForTokensSingle(
    usdcAddress,
    daiAddress,
    amountIn,
    0, // minAmountOut
    deadline
  );
  await swapTx.wait();
  console.log("Swap completed!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
