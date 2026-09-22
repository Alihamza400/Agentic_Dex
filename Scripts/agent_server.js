/**
 * Self-contained Node.js backend for the AI Agent frontend.
 *
 * Replaces the PHP+MySQL backend with direct blockchain reads via ethers.js.
 * Stores agent state (config, decisions, trades) in a local JSON file.
 *
 * Usage:
 *   node Scripts/agent_server.js          # start on port 8000
 *   PORT=3001 node Scripts/agent_server.js  # custom port
 */
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { JsonRpcProvider, Interface, Wallet, parseEther, formatEther } from "ethers";

// ── Paths ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const STATE_DIR = join(PROJECT_ROOT, ".agent_state");
const STATE_FILE = join(STATE_DIR, "state.json");
const DATA_DIR = join(PROJECT_ROOT, "data");
const POOLS_DIR = join(DATA_DIR, "pool_snapshots");
const DECISIONS_DIR = join(DATA_DIR, "agent_decisions");
const MARKET_DIR = join(DATA_DIR, "market_context");

if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(POOLS_DIR)) mkdirSync(POOLS_DIR, { recursive: true });
if (!existsSync(DECISIONS_DIR)) mkdirSync(DECISIONS_DIR, { recursive: true });
if (!existsSync(MARKET_DIR)) mkdirSync(MARKET_DIR, { recursive: true });

// ── Load ABIs + addresses ─────────────────────────────────────────────
function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

const addresses = loadJson(join(PROJECT_ROOT, "frontend/src/contracts/addresses.json"));
const FACTORY_ADDRESS = addresses.DexFactory;
const ROUTER_ADDRESS = addresses.DexRouter;

const FACTORY_ABI = loadJson(join(PROJECT_ROOT, "frontend/src/contracts/DexFactoryABI.json"));
const DEXPAIR_ABI = loadJson(join(PROJECT_ROOT, "frontend/src/contracts/DexPairABI.json"));
const TESTTOKEN_ABI = loadJson(join(PROJECT_ROOT, "frontend/src/contracts/TestTokenABI.json"));
const tokens = loadJson(join(PROJECT_ROOT, "frontend/src/constants/deployedTokens.json"));

// ── Provider + wallet ─────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:7545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("CRITICAL: PRIVATE_KEY environment variable is not set.");
  console.error("Set it in your .env file or export it: export PRIVATE_KEY=0x...");
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);

// ── State persistence (JSON file) ─────────────────────────────────────
function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return loadJson(STATE_FILE);
    } catch {
      /* corrupted state, reset */
    }
  }
  return {
    config: { strategy: "arbitrage", risk_level: "medium", is_active: false },
    decisions: [],
    trades: [],
  };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Persistent pool data ──────────────────────────────────────────────
function savePoolSnapshot(poolData) {
  const blockNumber = poolData.blockNumber;
  const filePath = join(POOLS_DIR, `${blockNumber}.json`);
  // Read existing data and append
  let existing = [];
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      existing = [];
    }
  }
  // Avoid duplicate block numbers
  if (!existing.some((e) => e.blockNumber === blockNumber)) {
    existing.push(poolData);
    // Keep only last 1000 entries to prevent unbounded growth
    existing = existing.slice(-1000);
  }
  writeFileSync(filePath, JSON.stringify(existing, null, 2));
}

function getPoolSnapshots(blockNumber) {
  const filePath = join(POOLS_DIR, `${blockNumber}.json`);
  if (existsSync(filePath)) {
    try {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      return [];
  }
  }
  return [];
}

// ── Blockchain helpers ────────────────────────────────────────────────
const tokenBySymbol = {};
for (const t of tokens) {
  tokenBySymbol[t.symbol] = t;
}

async function getAllPairs() {
  const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
  const length = await factory.allPairsLength();
  const pairs = [];
  for (let i = 0; i < length; i++) {
    pairs.push(await factory.allPairs(i));
  }
  return pairs;
}

async function getPairState(pairAddress) {
  const pair = new Contract(pairAddress, DEXPAIR_ABI, provider);
  try {
    const [r0, r1] = await pair.getReserves();
    const token0 = await pair.token0();
    const token1 = await pair.token1();

    const sym0 = tokenBySymbol[token0.toLowerCase()]?.symbol || token0.slice(0, 8);
    const sym1 = tokenBySymbol[token1.toLowerCase()]?.symbol || token1.slice(0, 8);

    const reserve0 = BigInt(r0.toString());
    const reserve1 = BigInt(r1.toString());
    const spotPrice =
      reserve0 > 0n
        ? ((reserve1 * 10n ** 18n) / reserve0).toString()
        : "0";

    let p0cum = "0",
      p1cum = "0";
    try {
      const twap = await pair.getTWAP();
      p0cum = twap[0].toString();
      p1cum = twap[1].toString();
    } catch {
      /* TWAP not available */
    }

    return {
      pair: pairAddress,
      token0,
      token1,
      token0Symbol: sym0,
      token1Symbol: sym1,
      reserve0: r0.toString(),
      reserve1: r1.toString(),
      spotPrice,
      price0Cumulative: p0cum,
      price1Cumulative: p1cum,
      blockNumber: await provider.getBlockNumber(),
      timestamp: Math.floor(Date.now() / 1000),
      source: "chain",
    };
  } catch (exc) {
    return { pair: pairAddress, error: exc.message, source: "chain" };
  }
}

async function getRecentSwaps(limit = 20) {
  const PAIR_ABI = DEXPAIR_ABI;
  const SWAP_TOPIC =
    "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

  const pairs = await getAllPairs();
  if (!pairs.length) return [];

  const head = await provider.getBlockNumber();
  const from = Math.max(0, head - 5000);

  const swaps = [];
  for (const pairAddr of pairs) {
    try {
      const logs = await provider.getLogs({
        fromBlock: from,
        toBlock: "latest",
        address: pairAddr,
        topics: [SWAP_TOPIC],
      });

      const pairContract = new Contract(pairAddr, PAIR_ABI, provider);
      for (const log of logs.slice(-limit)) {
        try {
          const decoded = pairContract.interface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
          if (!decoded) continue;

          const block = await provider.getBlock(log.blockNumber);
          swaps.push({
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
            contractAddress: log.address,
            eventName: "Swap",
            data: {
              sender: decoded.args.sender,
              amountIn: decoded.args.amountIn?.toString(),
              amountOut: decoded.args.amountOut?.toString(),
            },
            createdAt: block?.timestamp || Math.floor(Date.now() / 1000),
          });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  return swaps.sort((a, b) => b.blockNumber - a.blockNumber).slice(0, limit);
}

// ── Security Configuration ─────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"];

// Rate limiting: simple in-memory implementation
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // per window
const FAUCET_RATE_LIMIT_MAX = 10; // stricter limit for faucet

function checkRateLimit(ip, action) {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }

  const timestamps = rateLimitMap.get(key);
  // Remove old timestamps outside the window
  const validTimestamps = timestamps.filter(t => t > windowStart);
  rateLimitMap.set(key, validTimestamps);

  const maxRequests = action === "faucet" ? FAUCET_RATE_LIMIT_MAX : RATE_LIMIT_MAX_REQUESTS;
  if (validTimestamps.length >= maxRequests) {
    return false;
  }

  validTimestamps.push(now);
  return true;
}

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter(t => t > windowStart);
    if (valid.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, valid);
    }
  }
}, 300_000);

// ── API handler ───────────────────────────────────────────────────────
function respond(res, payload, statusCode = 200) {
  const origin = res.req?.headers?.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

async function handleRequest(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin || "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    res.writeHead(204, {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }

  // Rate limiting
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const url = new URL(req.url, `http://${req.headers.host}`);
  let action = url.searchParams.get("action") || "get_status";

  if (!checkRateLimit(clientIp, action)) {
    respond(res, { status: "error", message: "Rate limit exceeded. Please try again later." }, 429);
    return;
  }
  const state = loadState();

  // Handle compound actions like "get_decisions&limit=20"
  if (action.includes("&")) {
    const parts = Object.fromEntries(new URLSearchParams(action));
    action = Object.keys(parts)[0];
    for (const [k, v] of Object.entries(parts)) {
      url.searchParams.set(k, v);
    }
  }

  try {
    switch (action) {
      // ── get_status ──────────────────────────────────────────────
      case "get_status": {
        const latestDecision =
          state.decisions.length > 0
            ? state.decisions[state.decisions.length - 1]
            : null;

        const executedActions = state.decisions.filter(
          (d) =>
            !["HOLD", "QUANT_ANALYSIS", "ANALYSIS_COMPLETE", "LOOP_COMPLETE", "CONFIG_UPDATE"].includes(
              d.action
            )
        ).length;

        const successfulTrades = state.trades.filter(
          (t) => t.status === "success"
        ).length;
        const failedTrades = state.trades.filter(
          (t) => t.status === "error"
        ).length;
        const totalGasUsed = state.trades.reduce(
          (sum, t) => sum + (t.gasUsed || 0),
          0
        );

        // Compute real success rate from trades
        const totalTrades = successfulTrades + failedTrades;
        const successRate = totalTrades > 0
          ? Math.round((successfulTrades / totalTrades) * 1000) / 10
          : 0;

        // Compute total profit from PnL
        const totalProfit = state.trades.reduce(
          (sum, t) => sum + (t.pnl || 0),
          0
        );

        respond(res, {
          status: "success",
          latestDecision,
          config: state.config,
          analytics: {
            trades: executedActions || state.trades.length,
            successfulTrades,
            failedTrades,
            decisions: state.decisions.length,
            profit: Math.round(totalProfit * 100) / 100,
            totalGasUsed,
            successRate,
          },
        });
        break;
      }

      // ── set_config ──────────────────────────────────────────────
      case "set_config": {
        const body = await parseBody(req);
        state.config = {
          strategy: body.strategy || state.config.strategy,
          risk_level: body.risk_level || state.config.risk_level,
          is_active: body.is_active !== undefined ? body.is_active : state.config.is_active,
        };
        saveState(state);

        // Record decision
        state.decisions.push({
          agentName: "Frontend",
          action: "CONFIG_UPDATE",
          reason: JSON.stringify(state.config),
          confidence: 1.0,
          contextJSON: state.config,
          createdAt: new Date().toISOString(),
        });
        saveState(state);

        respond(res, {
          status: "success",
          message: "Agent configuration updated",
        });
        break;
      }

      // ── get_market ──────────────────────────────────────────────
      case "get_market": {
        const pairAddresses = await getAllPairs();
        const pools = [];
        for (const addr of pairAddresses) {
          const state = await getPairState(addr);
          pools.push(state);
          // Persist pool snapshot
          savePoolSnapshot(state);
        }

        const recentSwaps = await getRecentSwaps(20);

        respond(res, {
          status: "success",
          pools,
          recentSwaps,
        });
        break;
      }

      // ── get_decisions ───────────────────────────────────────────
      case "get_decisions": {
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit")) || 20));
        respond(res, {
          status: "success",
          decisions: state.decisions.slice(-limit).reverse(),
        });
        break;
      }

      // ── record_trade ───────────────────────────────────────────
      case "record_trade": {
        const body = await parseBody(req);
        const trade = {
          agentName: body.agentName || "Quant_Orchestrator",
          txHash: body.txHash || "",
          blockNumber: body.blockNumber || 0,
          action: body.action || "SWAP",
          tokenIn: body.tokenIn || "",
          tokenOut: body.tokenOut || "",
          amountIn: body.amountIn || "0",
          amountOut: body.amountOut || "0",
          status: body.status || "success",
          gasUsed: body.gasUsed || 0,
          pnl: body.pnl || 0,
          createdAt: new Date().toISOString(),
        };
        state.trades.push(trade);
        // Keep only last 500 trades
        if (state.trades.length > 500) {
          state.trades = state.trades.slice(-500);
        }
        saveState(state);
        respond(res, { status: "success", message: "Trade recorded", trade });
        break;
      }

      // ── get_trades ──────────────────────────────────────────────
      case "get_trades": {
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit")) || 20));
        respond(res, {
          status: "success",
          trades: state.trades.slice(-limit).reverse(),
        });
        break;
      }

      // ── faucet ──────────────────────────────────────────────────
      case "faucet": {
        const body = await parseBody(req);
        const toAddress = body.address;
        if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
          respond(res, { status: "error", message: "Invalid Ethereum address" });
          break;
        }

        // Send 1 ETH from deployer wallet for gas + distribute tokens
        try {
          const tx = await wallet.sendTransaction({
            to: toAddress,
            value: parseEther("1"),
          });
          await tx.wait();

          // Also distribute test tokens
          for (const t of tokens) {
            try {
              const contract = new Contract(t.address, TESTTOKEN_ABI, wallet);
              const amount = parseEther("10000");
              const balance = await contract.balanceOf(wallet.address);
              if (balance >= amount) {
                const transferTx = await contract.transfer(toAddress, amount);
                await transferTx.wait();
              }
            } catch {
              /* skip if token transfer fails */
            }
          }

          respond(res, {
            status: "success",
            message: `Distributed ETH and 10,000 of each token to ${toAddress}`,
          });
        } catch (exc) {
          respond(res, { status: "error", message: exc.message });
        }
        break;
      }

      default:
        respond(res, { status: "error", message: `Unknown action: ${action}` });
    }
  } catch (exc) {
    respond(res, { status: "error", message: exc.message });
  }
}

// ── Start server ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 8000;

// Import Contract properly for Node.js
import { Contract } from "ethers";

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`\n  +------------------------------------------+`);
  console.log(`  |  Agentic DEX Backend API                  |`);
  console.log(`  |  http://127.0.0.1:${PORT}                  |`);
  console.log(`  +------------------------------------------+`);
  console.log(`  |  Factory : ${FACTORY_ADDRESS}`);
  console.log(`  |  Router  : ${ROUTER_ADDRESS}`);
  console.log(`  |  RPC     : ${RPC_URL}`);
  console.log(`  |  Wallet  : ${wallet.address}`);
  console.log(`  |  Tokens  : ${tokens.map((t) => t.symbol).join(", ")}`);
  console.log(`  |  Pairs   : ${addresses.DexFactory ? "loaded" : "missing"}`);
  console.log(`  +------------------------------------------+\n`);
});
