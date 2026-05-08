# GEMINI.md - Agentic DEX Project Context

## Project Overview
The **Agentic DEX** is a next-generation decentralized exchange that combines automated AMM (Automated Market Maker) smart contracts with AI-powered trading agents. The system utilizes the **Model Context Protocol (MCP)** to allow Large Language Models (Gemini) to interact directly with blockchain data and execute transactions.

### Architecture
- **Smart Contracts (`Contracts/`)**: A Uniswap V2-inspired AMM with x*y=k mechanics, featuring Time-Weighted Average Price (TWAP) oracles. Deployed using Hardhat on Ganache.
- **Frontend (`frontend/`)**: A modern React + Vite + Tailwind CSS interface for decentralized trading and AI agent monitoring.
- **AI/MCP System (`Dex_Mcp/`)**: A Python-based multi-agent system.
    - **Supervisor**: Orchestrates the analysis and action loop.
    - **Vector Store (Qdrant)**: Stores historical market patterns for RAG (Retrieval-Augmented Generation).
    - **MCP Server**: Exposes tools for reading blockchain data and executing transactions.
- **Data Synchronization**:
    - **PHP Sync (`Scripts/sync.php`)**: Continuously monitors the blockchain and stores events in MySQL.
    - **Vector Sync (`Dex_Mcp/src/dex_mcp/sync_to_vector.py`)**: Migrates historical data from MySQL to Qdrant for AI analysis.

## Building and Running

### 1. Smart Contracts
```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Deploy to Ganache
npx hardhat run Scripts/deploy.js --network ganache
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. AI Agent System
```bash
cd Dex_Mcp
uv sync
# Initialize vector database from MySQL
uv run python -m src.dex_mcp.sync_to_vector
# Launch the Orchestrator
uv run python -m src.dex_mcp.Dex_Multi_Agent
```

### 4. Data Infrastructure
- **MySQL**: Ensure a local MySQL server is running. Use `Scripts/db_init.js` to initialize.
- **Sync Service**:
```bash
php Scripts/sync.php
```

## Development Conventions

### Smart Contracts
- **Security**: Use OpenZeppelin's `Ownable` for access control and `ReentrancyGuard` for state-changing functions.
- **Arithmetic**: Use the `UQ112x112` library for fixed-point math in price calculations.
- **Deployment**: Update `frontend/src/contracts/addresses.json` and ABIs after every deployment using `Scripts/update-frontend.js`.

### AI & Agents
- **Models**: Use `gemini-2.0-flash` for high-speed analysis or `gemini-2.5-flash` for complex reasoning.
- **Tools**: All blockchain interactions must be routed through the MCP server tools to ensure auditability.
- **Risk**: Every trade must be preceded by a call to `get_risk_metrics`.
- **Async Handling**: The Gemini SDK requires `nest_asyncio` when running tool calls within an existing event loop.

### Database Schema
- **Blocks/Transactions**: Tracked for full traceability.
- **Events**: `Sync`, `Swap`, `Mint`, `Burn` events drive the market snapshots.
- **Audit**: All agent decisions are recorded in the `agent_decisions` table for performance review.
