# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Agentic DEX (Decentralized Exchange) project that combines smart contracts with AI-powered agents using Model Context Protocol (MCP). The architecture includes:

- **Smart Contracts**: Core DEX functionality with Factory, Pair, Router, and LP token contracts implementing AMM (x*y=k) mechanics with TWAP oracles
- **Frontend**: React-based UI using Vite and Tailwind CSS
- **AI Integration**: Python-based orchestrator agent using Google Gemini API via MCP for automated trading with OODA decision loop
- **Web3 Integration**: Contract interaction layer using ethers.js

## Architecture Structure

### Smart Contracts (`Contracts/`)
- `DexFactory.sol`: Creates and manages trading pairs deterministically using CREATE2
- `DexPair.sol`: Implements AMM (x*y=k) logic with TWAP oracle, liquidity provision, and swap functionality with 0.3% fees
- `DexRouter.sol`: Handles multi-hop swaps and liquidity operations, coordinates with factory
- `Token/LP_Token.sol`: ERC20-compliant liquidity provider tokens with restricted mint/burn
- `interfaces/IERC20.sol`: Standard ERC20 interface
- `DexLiquidity.sol`: Additional liquidity operations

### Frontend (`frontend/`)
- React application using Vite build system and Tailwind CSS
- Contract ABIs and addresses automatically updated after deployment via scripts
- Web3 integration using ethers.js
- UI components for trading, liquidity management, and AI agent controls
- Routing for different DEX functions
- Components organized in `components/`, pages in `pages/`, and contract interactions in `contracts/`

### AI/MCP Integration (`Dex_Mcp/`)
- Python 3.13+ project using uv for dependency management
- Single orchestrator agent (`Dex_Multi_Agent.py`) using Gemini LLM with OODA decision loop
- MCP Server (`MCP_Server.py`) exposes 15 tools for market data and trade execution
- Live blockchain reader (`web3.py`) as fallback when MySQL is empty
- On-chain write functions (`web3_actions.py`) with programmatic risk enforcement:
  - Trade size caps (configurable by risk level: 5%/10%/20% of wallet)
  - Slippage guards (0.5%/1%/3% by risk level)
  - Circuit breaker (stops after 3 consecutive failures)
- Qdrant vector store (`Vector_Store.py`) for market pattern memory
- Agent trade tracking with PnL calculation in `agent_trades` table

## Development Commands

### Smart Contracts
```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Deploy contracts to local network
npx hardhat run Scripts/deploy.js --network ganache

# Run tests
npx hardhat test

# Run specific test file
npx hardhat test Test/<test-file>.js

# Run coverage (if installed)
npx hardhat coverage

# Clean artifacts and cache
npx hardhat clean
```

### Frontend
```bash
# Install dependencies
cd frontend && npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Preview production build locally
npm run preview
```

### AI/MCP System
```bash
# Navigate to Dex_Mcp directory
cd Dex_Mcp

# Install Python dependencies (using uv)
uv sync

# Run the MCP server
uv run dex-mcp

# Run specific Python modules for testing
python -m src.dex_mcp.Dex_Multi_Agent
```

### Contract Deployment and Frontend Integration
```bash
# Deploy contracts and update frontend with new addresses
npx hardhat run Scripts/deploy.js --network ganache

# Update frontend with existing contract addresses
node Scripts/update-frontend.js

# Generate ABIs for all contracts
node Scripts/generate-all-abis.js

# Register tokens for trading
node Scripts/register-tokens.js

# Pre-create trading pairs
node Scripts/precreate-pairs.js
```

### Testing
```bash
# Smart contract tests
npx hardhat test
npx hardhat test Test/test-file.js

# Frontend linting
cd frontend && npm run lint

# Run all tests in CI mode
npm test  # (runs the test script in package.json)
```

## Key Features

- **AMM Implementation**: Constant product market maker (x*y=k) with 0.3% fee structure
- **TWAP Oracle**: Time-weighted average price calculations for accurate pricing and MEV resistance
- **Multi-hop Swaps**: Support for swapping tokens through multiple pairs efficiently
- **Liquidity Operations**: Provisions and withdrawals with LP token economics and fair distribution
- **AI Agents**: Automated trading strategies using LLMs via MCP (Pool Management, Arbitrage, Liquidity, Risk)
- **Oracle Integration**: Price feeds and cumulative price tracking with fixed-point arithmetic (UQ112x112)
- **Deterministic Deployments**: CREATE2 pattern for predictable pair addresses
- **Wallet Integration**: Support for multiple wallet providers (Metamask, WalletConnect, etc.)

## Security Considerations

- **Reentrancy Protection**: Implemented using OpenZeppelin's ReentrancyGuard to prevent recursive callback exploits
- **Access Control**: Role-based access control for critical functions using Ownable and custom modifiers
- **Input Validation**: Comprehensive validation of user inputs and contract addresses to prevent invalid operations
- **Slippage Protection**: Built-in slippage controls for swap and liquidity operations to protect users from MEV
- **Flash Loan Resistance**: Mechanisms to mitigate flash loan attacks on price oracles via TWAP
- **Fixed-Point Arithmetic**: Safe math operations using UQ112x112 library to prevent precision loss
- **Contract Upgradeability**: Proxy patterns with transparent upgrade mechanisms for security patches
- **Security Audits**: Regular third-party security audits of smart contracts before mainnet deployment
- **Emergency Pause**: Circuit breaker functionality to pause critical functions during security incidents
- **Agent Risk Enforcement**: Programmatic trade size caps (5%/10%/20% by risk level), slippage guards (0.5%/1%/3%), and circuit breaker (3 consecutive failures) in `web3_actions.py`

## Environment Setup

1. Set up local Ethereum node (Ganache configured in hardhat.config.js at http://127.0.0.1:7545)
2. Configure environment variables in `Dex_Mcp/src/dex_mcp/.env`:
   - `GEMINI_API_KEY`: Google Gemini API key for AI agents
   - `RPC_URL`: Ethereum RPC endpoint (defaults to ganache at http://127.0.0.1:7545)
3. Private key is hardcoded in hardhat.config.js for development: `0xbc9cb91597c456ba71ac42f366417893e4f55d6c2631b479c446314befc854b4`

## Contract Deployment Process

1. Deploy `DexFactory.sol` first
2. Deploy `DexRouter.sol` with factory address as constructor parameter
3. Use deployment scripts to save ABIs and addresses to frontend (`Scripts/deploy.js` and `Scripts/update-frontend.js`)
4. Frontend automatically updates with deployed contract information in `frontend/src/contracts/`
5. Optionally pre-create trading pairs and register tokens using helper scripts

## Testing Approach

The project follows a modular testing approach:
- Unit tests for individual contract functions using Hardhat
- Integration tests for multi-contract interactions
- Frontend integration with deployed contracts
- AI agent behavior testing through MCP protocol
- Manual testing of UI components and user flows

## Database Schema for User and Agent Records

While the core DEX functionality relies on blockchain storage, the following database schema is recommended for storing user connections, agent states, and application data:

### Users Table
```sql
users (
    id UUID PRIMARY KEY,
    username VARCHAR(100) UNIQUE,
    email VARCHAR(255) UNIQUE,
    profile_image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Wallet Connections Table
```sql
wallet_connections (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,
    wallet_type VARCHAR(20), -- 'metamask', 'coinbase', 'walletconnect', 'phantom', etc.
    is_primary BOOLEAN DEFAULT false,
    last_used_at TIMESTAMP,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,

    CONSTRAINT unique_wallet_user UNIQUE (user_id, wallet_address),
    INDEX idx_wallet_address (wallet_address),
    INDEX idx_user_id (user_id)
)
```

### AI Agents Table
```sql
ai_agents (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    agent_type VARCHAR(50) NOT NULL, -- 'arbitrage', 'liquidity', 'risk', 'pool_management'
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'paused', 'terminated'
    config JSONB, -- Agent-specific configuration
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Agent Activities Table
```sql
agent_activities (
    id UUID PRIMARY KEY,
    agent_id UUID REFERENCES ai_agents(id),
    activity_type VARCHAR(50) NOT NULL, -- 'trade', 'liquidity_add', 'liquidity_remove'
    tx_hash VARCHAR(66), -- Blockchain transaction hash
    blockchain_data JSONB, -- Transaction details from blockchain
    profit_loss DECIMAL(20, 8),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### User Balances Table
```sql
user_balances (
    id UUID PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL,
    token_address VARCHAR(42), -- NULL for native currency (ETH)
    balance DECIMAL(38, 18), -- Sufficient precision for token amounts
    usd_value DECIMAL(20, 8), -- Cached USD value
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_wallet_address (wallet_address),
    INDEX idx_token_address (token_address)
)
```

### Agent Trades Table
```sql
agent_trades (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    agentName       VARCHAR(50) NOT NULL,
    txHash          VARCHAR(66),
    blockNumber     BIGINT,
    action          VARCHAR(50) NOT NULL,
    tokenIn         VARCHAR(42),
    tokenOut        VARCHAR(42),
    amountIn        TEXT,
    amountOut       TEXT,
    quoteAmount     TEXT,
    status          VARCHAR(20) DEFAULT 'pending',
    gasUsed         BIGINT,
    pnl             DECIMAL(38, 18) DEFAULT NULL,
    createdAt       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_agent_trades_agent (agentName),
    INDEX idx_agent_trades_hash (txHash)
)
```

This schema enables comprehensive user management, wallet connection tracking, AI agent state persistence, and portfolio analytics while maintaining the decentralized nature of the core DEX functionality.