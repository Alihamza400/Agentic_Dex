import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const FRONTEND_DIR = "./frontend/src/contracts/";

// Fix __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function saveAbi(contractName) {
  // Handle special cases where contract name differs from file path structure
  let filePath = `../artifacts/contracts/${contractName}.sol/${contractName}.json`;

  // Special handling for contracts in subdirectories
  if (contractName === "LPToken") {
    // LPToken contract is in Contracts/Token/LP_Token.sol
    filePath = `../artifacts/contracts/Token/LP_Token.sol/${contractName}.json`;
  } else if (contractName === "TestToken") {
    // TestToken contract is in Contracts/Token.sol
    filePath = `../artifacts/contracts/Token.sol/${contractName}.json`;
  }

  const artifactPath = join(__dirname, filePath);

  const abi = JSON.parse(readFileSync(artifactPath, "utf-8")).abi;
  writeFileSync(
    join(FRONTEND_DIR, `${contractName}ABI.json`),
    JSON.stringify(abi, null, 2)
  );

  console.log(`ABI saved: ${contractName}`);
}

export function saveAddress(contractName, address) {
  const addressesPath = join(FRONTEND_DIR, `addresses.json`);

  let addresses = {};
  if (existsSync(addressesPath)) {
    addresses = JSON.parse(readFileSync(addressesPath, "utf-8"));
  }

  addresses[contractName] = address;

  writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log(`Address saved: ${contractName}`);
}
