import pkg from "hardhat";
const { ethers } = pkg;

import { saveAddress, saveAllAbis } from "./update-frontend.js";
import { writeEnv } from "./env.js";

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log(`Deploying to network "${net.name}" (chainId ${net.chainId}) as ${deployer.address}`);

  console.log("Deploying Factory...");
  const Factory = await ethers.deployContract("DexFactory", [deployer.address]);
  await Factory.waitForDeployment();
  const factoryAddress = await Factory.getAddress();
  console.log("Factory deployed at:", factoryAddress);
  saveAddress("DexFactory", factoryAddress);

  console.log("Deploying Router...");
  const Router = await ethers.deployContract("DexRouter", [factoryAddress, deployer.address]);
  await Router.waitForDeployment();
  const routerAddress = await Router.getAddress();
  console.log("Router deployed at:", routerAddress);
  saveAddress("DexRouter", routerAddress);

  // ABIs for every contract the frontend/agents touch
  saveAllAbis();

  // Share the deployment with the indexer + Python agents
  writeEnv({
    Factory_Address: factoryAddress,
    Router_Address: routerAddress,
  });

  console.log(`\nFactory: ${factoryAddress}`);
  console.log(`Router:  ${routerAddress}`);
  console.log('Addresses written to frontend/src/contracts/addresses.json and .env');
  console.log("Next: npm run deploy:tokens && npm run pairs && npm run seed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
