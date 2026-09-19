import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";

// Development-only key (matches the Ganache account documented in CLAUDE.md).
// Override with PRIVATE_KEY in .env for any real network.
const DEV_PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "0xbc9cb91597c456ba71ac42f366417893e4f55d6c2631b479c446314befc854b4";

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:7545";

export default {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./Contracts",
    tests: "./Test",
  },
  networks: {
    // Ganache (the network the frontend/MetaMask setup uses)
    ganache: {
      url: RPC_URL,
      accounts: [DEV_PRIVATE_KEY],
    },
    // Hardhat's own node, usually `npx hardhat node --port 7545`
    localhost: {
      url: RPC_URL,
      accounts: [DEV_PRIVATE_KEY],
    },
  },
};
