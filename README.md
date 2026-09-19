<div align="center">

# Agentic DEX

### AI-Powered Decentralized Exchange

*Where autonomous AI agents meet decentralized finance*

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?style=for-the-badge&logo=solidity)](https://soliditylang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=for-the-badge&logo=python)](https://www.python.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.27-FFF04D?style=for-the-badge&logo=hardhat)](https://hardhat.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

---

</div>

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [How It Works](#how-it-works)
- [Smart Contracts](#smart-contracts)
- [Frontend](#frontend)
- [AI Agent System](#ai-agent-system)
- [MCP Tools Reference](#mcp-tools-reference)
- [Risk Management](#risk-management)
- [Setup & Installation](#setup--installation)
- [Usage Guide](#usage-guide)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Project Structure](#project-structure)

---

## Overview

**Agentic DEX** is a fully functional decentralized exchange that combines automated market making (AMM) with AI-powered trading agents. Unlike traditional DEXs, it features autonomous agents that observe market conditions, analyze opportunities, and execute trades on-chain using Large Language Models (LLMs) via the Model Context Protocol (MCP).

### Key Differentiators

| Feature | Traditional DEX | Agentic DEX |
|---|---|---|
| Trading | Manual user swaps | AI agents execute autonomously |
| Liquidity | User-provided only | AI-managed + user-provided |
| Arbitrage | Manual MEV bots | LLM-driven opportunity detection |
| Risk | None | Programmatic risk enforcement |
| Decision Audit | None | Every decision recorded on-chain |
| Oracle | Basic price feeds | TWAP oracle with cumulative pricing |

---

## System Architecture

```
+------------------------------------------------------------------+
|                         USER INTERFACES                          |
+------------------------------------------------------------------+
|                                                                  |
|   +------------------+          +---------------------------+    |
|   |   React Frontend |          |   CLI Agent Controller    |    |
|   |   (Vite + Tailwind) |       |   (uv run dex-agent)      |    |
|   |                  |          |                           |    |
|   |  - SwapTokens    |          |  - Continuous loop        |    |
|   |  - AddLiquidity  |          |  - Single-cycle mode      |    |
|   |  - RemoveLiquidity|         |  - Self-test mode         |    |
|   |  - CreatePair    |          |                           |    |
|   |  - PairList      |          +-------------+-------------+    |
|   |  - AIAgentControls|                       |                  |
|   |  - AIAnalytics   |                       |                  |
|   |  - AIRecs        |                       |                  |
|   |  - TokenFaucet   |                       |                  |
|   +--------+---------+                       |                  |
|            |                                 |                  |
+------------------------------------------------------------------+
            |                                 |
            v                                 v
+------------------------------------------------------------------+
|                      MIDDLEWARE LAYER                             |
+------------------------------------------------------------------+
|                                                                  |
|   +-------------------+    +----------------------------------+  |
|   |   Web3Context      |    |    MCP Server (15 Tools)        |  |
|   |   (ethers.js v6)  |    |    stdio protocol               |  |
|   |                   |    |                                  |  |
|   |  - MetaMask       |    |  get_market_context              |  |
|   |  - Auto-reconnect |    |  get_pool_addresses              |  |
|   |  - Chain handling |    |  get_deployed_tokens              |  |
|   |  - Contract calls |    |  get_live_pool_state              |  |
|   +-------------------+    |  get_balances                     |  |
|                            |  execute_trade                    |  |
|   +-------------------+    |  execute_arbitrage                |  |
|   |   PHP Backend API  |    |  manage_liquidity                 |  |
|   |   (api_agent.php)  |    |  approve_token                    |  |
|   |                   |    |  get_recent_swaps                  |  |
|   |  - Agent status   |    |  get_price_trend                   |  |
|   |  - Market data    |    |  get_liquidity_stats               |  |
|   |  - Decisions      |    |  get_risk_metrics                  |  |
|   |  - Config         |    |  search_market_history             |  |
|   +-------------------+    |  record_agent_decision             |  |
|                            +----------------------------------+  |
+------------------------------------------------------------------+
            |                                 |
            v                                 v
+------------------------------------------------------------------+
|                     BLOCKCHAIN LAYER                              |
+------------------------------------------------------------------+
|                                                                  |
|   +-------------------+    +----------------------------------+  |
|   |   DexFactory      |    |    DexRouter                    |  |
|   |                   |    |                                  |  |
|   |  - createPair()   |    |  addLiquidity()                  |  |
|   |  - getPair()      |    |  removeLiquidity()               |  |
|   |  - allPairs()     |    |  swapExactTokensForTokensSingle()|  |
|   +-------------------+    |  swapExactTokensForTokens()      |  |
|                            |  quote()                         |  |
|   +-------------------+    +----------------------------------+  |
|   |   DexPair (x6)    |                                          |
|   |                   |    +----------------------------------+  |
|   |  - swap()         |    |    Test Tokens (6)                |  |
|   |  - addLiquidity() |    |                                  |  |
|   |  - removeLiq()    |    |  USDC  DAI  WBTC                 |  |
|   |  - getReserves()  |    |  WETH  LINK  UNI                 |  |
|   |  - getTWAP()      |    |  (100M supply each)              |  |
|   |  - getSpotPrice() |    +----------------------------------+  |
|   +-------------------+                                          |
|                                                                  |
|   +-------------------+    +----------------------------------+  |
|   |   LPToken (x6)    |    |    Ganache (port 7545)          |  |
|   |   ERC-20 LP tokens |    |    Chain ID: 1337               |  |
|   +-------------------+    +----------------------------------+  |
+------------------------------------------------------------------+
            |
            v
+------------------------------------------------------------------+
|                      AI ORCHESTRATOR                              |
+------------------------------------------------------------------+
|                                                                  |
|   +------------------------------------------------------------+ |
|   |  Dex_Multi_Agent.py (Gemini LLM via OpenRouter)           | |
|   |                                                            | |
|   |   OODA LOOP:                                               | |
|   |                                                            | |
|   |   +-----------+    +----------+    +---------+    +------+ | |
|   |   | OBSERVE   |--->| ORIENT   |--->| DECIDE  |--->| ACT  | | |
|   |   |           |    |          |    |         |    |      | | |
|   |   | Read      |    | Analyze  |    | Strategy|    | Exec | | |
|   |   | pools,    |    | trends,  |    | HOLD /  |    | swap | | |
|   |   | balances, |    | risk,    |    | TRADE / |    | arb  | | |
|   |   | prices    |    | edge     |    | ARB     |    | liq  | | |
|   |   +-----------+    +----------+    +---------+    +------+ | |
|   |                                                            | |
|   |   Risk Enforcement:                                        | |
|   |   - Trade size caps (5%/10%/20% of wallet)                 | |
|   |   - Slippage guards (0.5%/1%/3%)                          | |
|   |   - Circuit breaker (3 failures = halt)                    | |
|   |   - Every decision recorded for audit                     | |
|   +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

---

## How It Works

### End-to-End Flow

```
Step 1: DEPLOYMENT
==================
  npm run deploy:all
       |
       v
  Ganache (port 7545)
       |
       +---> DexFactory deployed
       +---> DexRouter deployed
       +---> 6 Test Tokens deployed (USDC, DAI, WBTC, WETH, LINK, UNI)
       +---> 6 Trading Pairs created
       +---> Initial liquidity seeded (5,000 tokens per side per pair)
       +---> ABIs + addresses written to frontend/src/contracts/
       +---> Token addresses written to frontend/src/constants/deployedTokens.json

Step 2: FRONTEND
================
  npm run frontend
       |
       v
  Vite dev server (port 5173)
       |
       +---> User opens browser
       +---> Clicks "Connect Wallet" (MetaMask)
       +---> MetaMask switches to Ganache (Chain ID 1337)
       +---> Web3Context initializes factory + router contracts
       +---> User can now:
             - Trade (swap tokens)
             - Provide liquidity
             - Create new pairs
             - View pool details
             - Control AI agents

Step 3: AI AGENT
================
  npm run agent
       |
       v
  Orchestrator (every 60 seconds)
       |
       +---> OBSERVE: Read live blockchain state via MCP tools
       |       - get_pool_addresses() -> discover all pairs
       |       - get_market_context() -> reserves, prices, TWAP
       |       - get_balances() -> agent wallet holdings
       |
       +---> ORIENT: Analyze market conditions
       |       - Identify price discrepancies between pairs
       |       - Calculate 0.3% fee impact
       |       - Assess risk level from agent_config
       |
       +---> DECIDE: LLM (Gemini) generates trading decision
       |       - HOLD: no edge detected
       |       - TRADE: single-hop swap opportunity
       |       - ARB: multi-hop arbitrage path found
       |
       +---> ACT: Execute on-chain transactions
               - Auto-approves tokens
               - Sends transaction via Ganache
               - Records decision + trade for audit
               - Updates PnL tracking
```

---

## Smart Contracts

### DexFactory

The factory contract manages trading pairs using deterministic CREATE2 deployment.

```solidity
// Create a new trading pair
function createPair(address tokenA, address tokenB) external returns (address pair);

// Lookup pairs (bidirectional)
mapping(address => mapping(address => address)) public getPair;
address[] public allPairs;
```

**Key Features:**
- Deterministic pair addresses via CREATE2
- Bidirectional pair lookup (A,B and B,A return the same pair)
- Duplicate pair prevention
- Identical token rejection

### DexPair

The core AMM contract implementing constant product market making with TWAP oracle.

```
AMM Formula: x * y = k
Fee: 0.3% (997/1000)

amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
```

**Key Functions:**
| Function | Description |
|---|---|
| `swap(amountIn, tokenIn, to)` | Execute swap with 0.3% fee |
| `addLiquidity(amount0, amount1, to)` | Mint LP tokens proportional to deposit |
| `removeLiquidity(liquidity, to)` | Burn LP tokens, return underlying |
| `getReserves()` | Current reserve balances |
| `getSpotPrice()` | Spot price (reserve ratio) |
| `getTWAP()` | Time-weighted average price accumulators |

**TWAP Oracle:** Updates cumulative prices every block using UQ112x112 fixed-point arithmetic, enabling MEV-resistant price feeds.

### DexRouter

Handles multi-hop swaps and liquidity operations with slippage protection.

| Function | Description |
|---|---|
| `swapExactTokensForTokensSingle()` | Single-hop swap |
| `swapExactTokensForTokens()` | Multi-hop swap (A -> B -> C -> ...) |
| `addLiquidity()` | Add liquidity (auto-creates pair) |
| `removeLiquidity()` | Remove liquidity with slippage guards |
| `quote()` | Off-chain price quote |

### LPToken

ERC-20 compliant liquidity provider tokens with restricted mint/burn (only callable by parent DexPair).

### TestToken

Standard ERC-20 token for testing. Mints full supply to deployer on creation.

---

## Frontend

### Pages & Features

| Route | Component | Features |
|---|---|---|
| `/` | Dashboard | Hero section, TVL stats, AI activity feed, recent trades |
| `/trade` | SwapTokens | Token selector with search, price calculation, approval flow, slippage control |
| `/create-pair` | CreatePair | Select two tokens, validates uniqueness, creates pair on-chain |
| `/liquidity` | LiquidityManagement | Tabbed UI: AddLiquidity / RemoveLiquidity with pool ratio auto-calculation |
| `/pools` | PairList | Browse all pairs, view reserves, LP token info, TWAP data |
| `/ai-agent` | AIAgentControls | Start/stop agent, select strategy, set risk level, view analytics |
| `/ai-analytics` | AIAnalyticsDashboard | Pool stats, swap history, agent decisions with confidence scores |
| `/ai-recommendations` | AIRecommendations | Agent trading recommendations with detailed reasoning |
| `/faucet` | TokenFaucet | Claim 10,000 test tokens, CLI fallback command |

### Web3 Integration

- **MetaMask** connection with auto-reconnect
- **Chain change** detection and page reload
- **Account switching** with contract re-initialization
- **Balance refresh** every 5 seconds

### UI/UX

- Dark gradient theme with glassmorphism
- Framer Motion animations on all components
- Toast notifications for user feedback
- Responsive design (mobile sidebar + desktop sidebar)
- Token logos via CoinGecko CDN

---

## AI Agent System

### Architecture

The AI agent uses the **OODA Loop** (Observe-Orient-Decide-Act) pattern:

1. **Observe**: Reads live blockchain state through 15 MCP tools
2. **Orient**: Analyzes market conditions, trends, and risk metrics
3. **Decide**: Gemini LLM generates trading decisions (HOLD/TRADE/ARB)
4. **Act**: Executes on-chain transactions with programmatic risk enforcement

### Agent Configuration

Stored in MySQL `agent_config` table:

| Field | Values | Default |
|---|---|---|
| `strategy` | `arbitrage`, `liquidity`, `market_making`, `trend_following` | `arbitrage` |
| `risk_level` | `low`, `medium`, `high` | `medium` |
| `is_active` | `0` (inactive), `1` (active) | `1` |

### LLM Integration

- **Model**: Google Gemini 2.5 Flash (via OpenRouter)
- **API**: OpenAI-compatible chat completions
- **Tool Calling**: LLM selects from 13 registered tools
- **Max Rounds**: 2 tool-calling rounds per cycle
- **Cycle Interval**: 60 seconds (configurable)

---

## MCP Tools Reference

### Read Tools (9)

| Tool | Description | Cache |
|---|---|---|
| `get_market_context` | Latest reserves, spot price, TWAP for every pair | 5s |
| `get_pool_addresses` | All trading pairs with token symbols and addresses | 5s |
| `get_deployed_tokens` | Symbol -> address for every tradable token | - |
| `get_live_pool_state` | Live reserves, spot price, TWAP from one pair | None |
| `get_balances` | Agent wallet balances (human-readable) | None |
| `get_recent_swaps` | Last N swap events (DB first, live logs fallback) | None |
| `get_price_trend` | Historical price snapshots for one pair | 5s |
| `get_liquidity_stats` | Mint/Burn totals per pair | 5s |
| `get_risk_metrics` | Price volatility (std dev, min, max, avg) | 5s |

### Write Tools (4)

| Tool | Description |
|---|---|
| `execute_trade` | Single-hop swap on-chain (amount_in in wei) |
| `execute_arbitrage` | Multi-hop swap path on-chain |
| `manage_liquidity` | Add or remove liquidity (ADD/REMOVE) |
| `approve_token` | Grant router allowance for a token |

### Utility Tools (2)

| Tool | Description |
|---|---|
| `search_market_history` | Vector similarity search (Qdrant) |
| `record_agent_decision` | Persist decision to database for audit |

---

## Risk Management

### Programmatic Risk Enforcement

Every trade executed by the AI agent goes through three layers of risk checks:

```
+-------------------+
| Trade Requested   |
+--------+----------+
         |
         v
+-------------------+     +------------------+
| Circuit Breaker   |---->| REJECT if 3+     |
| (3 failures = halt)|     | consecutive fails |
+--------+----------+     +------------------+
         | OK
         v
+-------------------+     +------------------+
| Trade Size Check  |---->| REJECT if exceeds|
| (risk-adjusted %) |     | max % of balance |
+--------+----------+     +------------------+
         | OK
         v
+-------------------+     +------------------+
| Execute + Quote   |---->| REJECT if actual |
| Slippage Check    |     | slippage > max % |
+--------+----------+     +------------------+
         | OK
         v
+-------------------+
| Record Trade      |
| Update PnL        |
+-------------------+
```

### Risk Level Configuration

| Risk Level | Max Trade Size | Max Slippage | Use Case |
|---|---|---|---|
| `low` | 5% of wallet | 0.5% | Conservative, capital preservation |
| `medium` | 10% of wallet | 1.0% | Balanced risk/reward |
| `high` | 20% of wallet | 3.0% | Aggressive, maximum opportunity capture |

### Circuit Breaker

After **3 consecutive on-chain failures**, the agent stops trading entirely until manually restarted. This prevents cascading losses from:
- Network congestion
- Contract bugs
- Market manipulation
- Incorrect price data

---

## Setup & Installation

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Smart contracts & frontend |
| Python | 3.13+ | AI agents & MCP server |
| Ganache | Latest | Local Ethereum node |
| MySQL | 8.0+ | Event indexing (optional) |
| uv | Latest | Python package manager |

### 1. Clone & Install

```bash
git clone https://github.com/Alihamza400/Agentic_Dex.git
cd Agentic_Dex

# Install root dependencies (Hardhat, etc.)
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install Python dependencies
cd Dex_Mcp && uv sync && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Chain
RPC_URL=http://127.0.0.1:7545
PRIVATE_KEY=0xbc9cb91597c456ba71ac42f366417893e4f55d6c2631b479c446314befc854b4

# AI Agent (get from https://openrouter.ai)
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=google/gemini-2.5-flash

# MySQL (optional - agent falls back to live chain reads)
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=
DB_NAME=AI_Autonomus_dex
```

### 3. Start Ganache

Open Ganache and create a workspace with:
- **RPC URL**: `http://127.0.0.1:7545`
- **Chain ID**: `1337`

Or use the Hardhat node:
```bash
npm run chain
```

### 4. Deploy Everything

```bash
npm run deploy:all
```

This single command will:
1. Compile all Solidity contracts
2. Deploy DexFactory and DexRouter
3. Deploy 6 test tokens (USDC, DAI, WBTC, WETH, LINK, UNI)
4. Create 6 trading pairs
5. Seed initial liquidity (5,000 tokens per side)
6. Write ABIs and addresses to the frontend

### 5. Start the Application

```bash
# Terminal 1: Frontend
npm run frontend

# Terminal 2: AI Agent (optional)
npm run agent
```

Open `http://localhost:5173` in your browser.

---

## Usage Guide

### Connecting MetaMask

1. Install MetaMask browser extension
2. Add custom network:
   - **Network Name**: Ganache
   - **RPC URL**: `http://127.0.0.1:7545`
   - **Chain ID**: `1337`
   - **Currency Symbol**: ETH
3. Import account using Ganache's private key
4. Click "Connect Wallet" in the app

### Trading Tokens

1. Navigate to **Trade** page
2. Select input token (e.g., USDC)
3. Select output token (e.g., DAI)
4. Enter amount
5. Review the output amount and price impact
6. Click **Approve** (first time only)
7. Click **Swap**

### Providing Liquidity

1. Navigate to **Liquidity** page
2. Select two tokens
3. Enter amounts (auto-balances to pool ratio)
4. Click **Approve** both tokens
5. Click **Add Liquidity**
6. Receive LP tokens proportional to your share

### Running AI Agents

```bash
# Continuous mode (runs every 60 seconds)
npm run agent

# Single cycle (for testing)
cd Dex_Mcp && uv run dex-agent --once

# Self-test (reads chain data, no LLM calls)
cd Dex_Mcp && uv run dex-agent --self-test
```

### Getting Test Tokens

```bash
# Via CLI
FAUCET_ADDRESS=0xYourAddress npm run faucet

# Via UI
Navigate to Faucet page -> Click "Claim 10,000 of Each Token"
```

---

## API Reference

### Backend API (`api_agent.php`)

| Endpoint | Method | Description |
|---|---|---|
| `?action=get_status` | GET | Agent status, trade count, PnL |
| `?action=set_config` | POST | Update agent strategy/risk/active |
| `?action=get_market` | GET | Pool data from pair_snapshots |
| `?action=get_decisions&limit=20` | GET | Agent decision history |

### MCP Server (stdio)

The MCP server communicates via the Model Context Protocol over stdio:

```python
# Client usage
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

params = StdioServerParameters(
    command="python",
    args=["-m", "dex_mcp.MCP_Server"],
    cwd="/path/to/Dex_Mcp",
)

async with stdio_client(params) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()

        # List available tools
        tools = await session.list_tools()

        # Call a tool
        result = await session.call_tool("get_market_context", {})
```

---

## Database Schema

### Core Tables

```sql
-- Blockchain events indexed from Ganache
CREATE TABLE dex_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    blockNumber BIGINT,
    transactionHash VARCHAR(66),
    contractAddress VARCHAR(42),
    eventName VARCHAR(50),
    data JSON,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pool state snapshots per block
CREATE TABLE pair_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pairAddress VARCHAR(42),
    blockNumber BIGINT,
    blockTimestamp BIGINT,
    reserve0 VARCHAR(78),
    reserve1 VARCHAR(78),
    spotPrice VARCHAR(78),
    price0Cumulative VARCHAR(78),
    price1Cumulative VARCHAR(78)
);

-- AI agent configuration
CREATE TABLE agent_config (
    id INT PRIMARY KEY DEFAULT 1,
    strategy VARCHAR(50) DEFAULT 'arbitrage',
    risk_level VARCHAR(20) DEFAULT 'medium',
    is_active TINYINT DEFAULT 1
);

-- Agent decision audit trail
CREATE TABLE agent_decisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agentName VARCHAR(50),
    action VARCHAR(50),
    reason TEXT,
    confidence FLOAT,
    contextJSON JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent trade tracking with PnL
CREATE TABLE agent_trades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agentName VARCHAR(50),
    txHash VARCHAR(66),
    blockNumber BIGINT,
    action VARCHAR(50),
    tokenIn VARCHAR(42),
    tokenOut VARCHAR(42),
    amountIn TEXT,
    amountOut TEXT,
    quoteAmount TEXT,
    status VARCHAR(20),
    gasUsed BIGINT,
    pnl DECIMAL(38, 18),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Testing

### Smart Contract Tests

```bash
# Run all 16 end-to-end tests
npm test

# Test coverage:
# - Factory: pair creation, duplicate rejection, token sorting
# - Liquidity: add/remove, off-ratio deposits, slippage, deadlines
# - Swaps: single-hop, multi-hop, round-trip arbitrage, fee calculation
# - TWAP Oracle: price accumulation across blocks
```

### MCP Smoke Test

```bash
# Full E2E test with on-chain writes
cd Dex_Mcp && uv run python tests/mcp_smoke.py

# Read-only test (no transactions)
cd Dex_Mcp && uv run python tests/mcp_smoke.py --no-write
```

### Frontend

```bash
# Lint check
npm run lint

# Production build
npm run build
```

---

## Project Structure

```
Agentic_Dex/
├── Contracts/                    # Solidity smart contracts
│   ├── DexFactory.sol            # Pair factory with CREATE2
│   ├── DexPair.sol               # AMM + TWAP oracle
│   ├── DexRouter.sol             # Swap routing + liquidity
│   ├── Token.sol                 # Test ERC-20 token
│   ├── Token/LP_Token.sol        # LP token (ERC-20)
│   └── interfaces/IERC20.sol     # Standard interface
│
├── Test/
│   └── dex.e2e.js                # 16 end-to-end tests
│
├── Scripts/                      # Deployment & utilities
│   ├── deploy.js                 # Deploy Factory + Router
│   ├── deploy_tokens.js          # Deploy 6 test tokens
│   ├── precreate-pairs.js        # Create trading pairs
│   ├── seed-liquidity.js         # Seed initial liquidity
│   ├── faucet.js                 # Token faucet CLI
│   ├── sync.js                   # Blockchain indexer
│   ├── db_init.js                # MySQL schema init
│   ├── api_agent.php             # Backend API
│   ├── pairs.js                  # Pair configuration
│   ├── env.js                    # .env utilities
│   ├── load-tokens.js            # Token loader
│   └── generate-all-abis.js      # ABI generator
│
├── frontend/                     # React frontend
│   ├── src/
│   │   ├── App.jsx               # Routes & layout
│   │   ├── main.jsx              # Entry point
│   │   ├── components/           # 14 UI components
│   │   ├── context/Web3Context.jsx # Wallet + contract state
│   │   ├── api/agentApi.js       # Backend API client
│   │   ├── constants/            # Token list + deployed addresses
│   │   └── contracts/            # ABIs + addresses
│   ├── package.json
│   └── vite.config.js
│
├── Dex_Mcp/                      # AI agent system (Python)
│   ├── src/dex_mcp/
│   │   ├── MCP_Server.py         # 15 MCP tools
│   │   ├── Dex_Multi_Agent.py    # OODA loop orchestrator
│   │   ├── web3.py               # Live blockchain reader
│   │   ├── web3_actions.py       # On-chain writes + risk
│   │   ├── Vector_Store.py       # Qdrant integration
│   │   ├── config.py             # Centralized config
│   │   └── sync_to_vector.py     # Vector sync tool
│   ├── tests/mcp_smoke.py        # MCP smoke test
│   └── pyproject.toml            # Python dependencies
│
├── hardhat.config.js             # Hardhat configuration
├── package.json                  # Root dependencies + scripts
├── .env                          # Environment variables
├── .env.example                  # Environment template
├── CLAUDE.md                     # AI assistant context
└── README.md                     # This file
```

---

## Network Configuration

| Parameter | Value |
|---|---|
| **RPC URL** | `http://127.0.0.1:7545` |
| **Chain ID** | `1337` |
| **Currency** | ETH |
| **Block Time** | Instant (Ganache) |
| **Gas Price** | Variable |

### Deployed Contracts

| Contract | Address |
|---|---|
| DexFactory | `0xf3FBD6F3b228aF6e89Ad65DD810e7fF6bAA60D8b` |
| DexRouter | `0x6CB3EB60e94D74486ce9d298A185380F7194459c` |

### Deployed Tokens

| Token | Address | Supply |
|---|---|---|
| USDC | `0x9a28D3397C6F29549da03d5754bF03414b966Be2` | 100M |
| DAI | `0xf6776879082f3D31B7E5F8D380A07B799beBf18E` | 100M |
| WBTC | `0xc885F63c71B4694fEE304417C55491a9A04bbBBF` | 100M |
| WETH | `0x25DE0D1A6b8f6674f7a34096071FF7b7Fb36a3D3` | 100M |
| LINK | `0xbC4BD22c406169A6Ed936895Bd576BB59ef0fCB4` | 100M |
| UNI | `0x18916217751A64d0718F88F229a8cEB874408A7A` | 100M |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with care for the future of decentralized finance**

*Agentic DEX - Where AI Meets DeFi*

</div>
