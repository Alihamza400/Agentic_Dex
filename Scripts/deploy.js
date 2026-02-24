import pkg from "hardhat";
const { ethers } = pkg;

import { saveAbi, saveAddress } from"./update-frontend.js";

async function main() {
  console.log("Deploying Factory...");
  const Factory = await ethers.deployContract("DexFactory");
  await Factory.waitForDeployment();
  console.log("Factory deployed at:", Factory.target);

  saveAbi("DexFactory");
  saveAddress("DexFactory", Factory.target);

  console.log("Deploying Router...");
  const Router = await ethers.deployContract("DexRouter", [Factory.target]);
  await Router.waitForDeployment();
  console.log("Router deployed at:", Router.target);

  saveAbi("DexRouter");
  saveAddress("DexRouter", Router.target);

  // Save ABIs for other contracts that may be needed by the frontend
  saveAbi("DexPair");
  saveAbi("LPToken"); // From Token/LP_Token.sol
  saveAbi("TestToken"); // For test tokens

  console.log("Factory deployed with open pair creation enabled.");
}

main();
