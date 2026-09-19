/**
 * Exports contract ABIs and addresses from Hardhat artifacts into the frontend.
 *
 * NOTE: Hardhat artifacts live under `artifacts/Contracts/...` because the
 * sources directory is `Contracts/` (capital C). Paths are resolved from the
 * project root so the scripts work regardless of the shell's cwd.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const FRONTEND_CONTRACTS = join(PROJECT_ROOT, "frontend", "src", "contracts");
const FRONTEND_CONSTANTS = join(PROJECT_ROOT, "frontend", "src", "constants");

/** contract name -> path relative to the artifacts dir */
const ARTIFACT_PATHS = {
  DexFactory: "Contracts/DexFactory.sol/DexFactory.json",
  DexRouter: "Contracts/DexRouter.sol/DexRouter.json",
  DexPair: "Contracts/DexPair.sol/DexPair.json",
  UQ112x112: "Contracts/DexPair.sol/UQ112x112.json",
  LPToken: "Contracts/Token/LP_Token.sol/LPToken.json",
  TestToken: "Contracts/Token.sol/TestToken.json",
};

export function saveAbi(contractName) {
  const relative = ARTIFACT_PATHS[contractName] ?? `Contracts/${contractName}.sol/${contractName}.json`;
  const artifactPath = join(PROJECT_ROOT, "artifacts", relative);

  if (!existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found for ${contractName} at ${artifactPath}. Run "npx hardhat compile" first.`
    );
  }

  mkdirSync(FRONTEND_CONTRACTS, { recursive: true });
  const abi = JSON.parse(readFileSync(artifactPath, "utf-8")).abi;
  writeFileSync(join(FRONTEND_CONTRACTS, `${contractName}ABI.json`), JSON.stringify(abi, null, 2));
  console.log(`  ABI saved: ${contractName}`);
}

export function saveAllAbis() {
  for (const name of ["DexFactory", "DexRouter", "DexPair", "LPToken", "TestToken"]) saveAbi(name);
}

export function saveAddress(contractName, address) {
  const addressesPath = join(FRONTEND_CONTRACTS, "addresses.json");

  let addresses = {};
  if (existsSync(addressesPath)) {
    try {
      addresses = JSON.parse(readFileSync(addressesPath, "utf-8"));
    } catch {
      addresses = {};
    }
  }

  addresses[contractName] = address;
  mkdirSync(FRONTEND_CONTRACTS, { recursive: true });
  writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log(`  Address saved: ${contractName} -> ${address}`);
}

/**
 * Writes the deployed test-token list consumed by frontend/src/constants/tokens.js
 */
export function saveTokens(tokens) {
  mkdirSync(FRONTEND_CONSTANTS, { recursive: true });
  writeFileSync(
    join(FRONTEND_CONSTANTS, "deployedTokens.json"),
    JSON.stringify(tokens, null, 2)
  );
  console.log(`  ${tokens.length} token addresses saved to src/constants/deployedTokens.json`);
}
