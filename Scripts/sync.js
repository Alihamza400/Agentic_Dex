/**
 * Ganache/EVM -> MySQL indexer (Node.js).
 *
 * Same job as Scripts/sync.php but with no PHP/bcmath/gmp dependency:
 *   blocks, transactions, Swap/Mint/Burn/Sync events, pair_snapshots.
 *
 * Usage:
 *   node Scripts/sync.js             # follow the chain forever
 *   node Scripts/sync.js --once      # catch up and exit (used by tests/CI)
 *   node Scripts/sync.js --dry-run   # decode + print events, no database writes
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

import { Interface, JsonRpcProvider } from "ethers";
import mysql from "mysql2/promise";

import { readEnv } from "./env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const POLL_INTERVAL_MS = 3000;
const MAX_BLOCKS_PER_TICK = 200;
const DEFAULT_RPC = "http://127.0.0.1:7545";

const ARTIFACTS = {
  DexPair: "Contracts/DexPair.sol/DexPair.json",
  DexFactory: "Contracts/DexFactory.sol/DexFactory.json",
};

function loadAbi(name) {
  const artifact = join(PROJECT_ROOT, "artifacts", ARTIFACTS[name]);
  if (!existsSync(artifact)) {
    throw new Error(`Missing artifact for ${name}. Run "npx hardhat compile" first.`);
  }
  return JSON.parse(readFileSync(artifact, "utf-8")).abi;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS blocks (
      number     BIGINT PRIMARY KEY,
      hash       VARCHAR(66) UNIQUE,
      timestamp  BIGINT,
      parentHash VARCHAR(66)
    )`,
  `CREATE TABLE IF NOT EXISTS transactions (
      hash         VARCHAR(66) PRIMARY KEY,
      blockNumber  BIGINT,
      from_address VARCHAR(42),
      to_address   VARCHAR(42),
      value        TEXT,
      gasPrice     TEXT,
      status       INT,
      FOREIGN KEY (blockNumber) REFERENCES blocks(number)
    )`,
  `CREATE TABLE IF NOT EXISTS dex_events (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      blockNumber     BIGINT,
      transactionHash VARCHAR(66),
      eventName       VARCHAR(50),
      contractAddress VARCHAR(42),
      data            JSON,
      createdAt       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (blockNumber) REFERENCES blocks(number)
    )`,
  `CREATE TABLE IF NOT EXISTS pair_snapshots (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      blockNumber      BIGINT,
      blockTimestamp   BIGINT,
      pairAddress      VARCHAR(42),
      reserve0         TEXT,
      reserve1         TEXT,
      spotPrice        TEXT,
      price0Cumulative TEXT,
      price1Cumulative TEXT,
      FOREIGN KEY (blockNumber) REFERENCES blocks(number)
    )`,
  `CREATE TABLE IF NOT EXISTS agent_decisions (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      agentName   VARCHAR(50),
      action      VARCHAR(100),
      reason      TEXT,
      confidence  FLOAT,
      contextJSON JSON,
      createdAt   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  `CREATE TABLE IF NOT EXISTS agent_config (
      id INT PRIMARY KEY,
      strategy VARCHAR(50),
      risk_level VARCHAR(20),
      is_active BOOLEAN,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  `CREATE TABLE IF NOT EXISTS agent_trades (
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
      FOREIGN KEY (blockNumber) REFERENCES blocks(number),
      INDEX idx_agent_trades_agent (agentName),
      INDEX idx_agent_trades_hash (txHash)
    )`,
];

const INDEXES = [
  "CREATE INDEX idx_events_name_block ON dex_events (eventName, blockNumber)",
  "CREATE INDEX idx_snapshots_pair ON pair_snapshots (pairAddress, blockNumber)",
];

export async function ensureSchema(conn) {
  for (const statement of SCHEMA) await conn.query(statement);
  for (const statement of INDEXES) {
    try {
      await conn.query(statement);
    } catch {
      /* index already exists */
    }
  }
  await conn.query(
    `INSERT INTO agent_config (id, strategy, risk_level, is_active)
     VALUES (1, 'arbitrage', 'medium', false)
     ON DUPLICATE KEY UPDATE id = id`
  );
}

/** Uniswap-style spot price with 18 fixed-point decimals, as a string. */
export function spotPrice(reserveIn, reserveOut) {
  if (reserveIn === 0n) return "0";
  return ((reserveOut * 10n ** 18n) / reserveIn).toString();
}

export function createIndexer({ env = readEnv(), once = false, dryRun = false, logger = console } = {}) {
  const rpcUrl = env.RPC_URL || DEFAULT_RPC;
  const provider = new JsonRpcProvider(rpcUrl);
  const pairInterface = new Interface(loadAbi("DexPair"));
  const factoryInterface = new Interface(loadAbi("DexFactory"));

  const poolConfig = {
    host: env.DB_HOST || "127.0.0.1",
    user: env.DB_USER || "root",
    password: env.DB_PASSWORD || "",
    database: env.DB_NAME || "AI_Autonomus_dex",
    connectionLimit: 5,
  };

  async function openConnection() {
    const conn = await mysql.createConnection(poolConfig);
    await ensureSchema(conn);
    return conn;
  }

  /**
   * Decodes one block into plain records. Pure decoding, no DB access, so
   * `--dry-run` can prove the ABIs/topics line up with what the chain emits.
   */
  async function decodeBlock(block) {
    const records = [{ type: "block", number: block.number, hash: block.hash, timestamp: block.timestamp, parentHash: block.parentHash }];

    for (const txHash of block.transactions) {
      const tx = await provider.getTransaction(txHash);
      if (!tx) continue;
      const receipt = await provider.getTransactionReceipt(txHash);

      records.push({
        type: "transaction",
        hash: tx.hash,
        blockNumber: block.number,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString(),
        gasPrice: tx.gasPrice != null ? tx.gasPrice.toString() : "0",
        status: receipt ? Number(receipt.status) : null,
      });

      if (!receipt) continue;

      for (const log of receipt.logs) {
        // ethers v6 returns null (rather than throwing) for unknown logs
        let parsed = null;
        try {
          parsed = pairInterface.parseLog({ topics: [...log.topics], data: log.data });
          if (!parsed) {
            parsed = factoryInterface.parseLog({ topics: [...log.topics], data: log.data });
          }
        } catch {
          parsed = null;
        }
        if (!parsed) continue; // not one of our contracts

        // ethers v6 Results only expose numeric keys to Object.entries, so the
        // parameter names have to come from the fragment.
        const data = {};
        parsed.fragment.inputs.forEach((input, index) => {
          const value = parsed.args[index];
          data[input.name || String(index)] =
            typeof value === "bigint" ? value.toString() : value;
        });

        const record = {
          type: "event",
          eventName: parsed.name,
          pair: log.address,
          transactionHash: tx.hash,
          blockNumber: block.number,
          blockTimestamp: block.timestamp,
          data,
        };

        if (parsed.name === "Sync") {
          record.snapshot = {
            blockNumber: block.number,
            blockTimestamp: block.timestamp,
            pairAddress: log.address,
            reserve0: data.reserve0,
            reserve1: data.reserve1,
            spotPrice: spotPrice(BigInt(data.reserve0), BigInt(data.reserve1)),
            price0Cumulative: data.price0Cumulative,
            price1Cumulative: data.price1Cumulative,
          };
        }

        records.push(record);
      }
    }

    return records;
  }

  async function writeBlock(conn, records, blockNumber) {
    for (const record of records) {
      if (record.type === "block") {
        await conn.execute(
          "INSERT IGNORE INTO blocks (number, hash, timestamp, parentHash) VALUES (?,?,?,?)",
          [record.number, record.hash, record.timestamp, record.parentHash]
        );
      } else if (record.type === "transaction") {
        await conn.execute(
          `INSERT IGNORE INTO transactions
             (hash, blockNumber, from_address, to_address, value, gasPrice, status)
           VALUES (?,?,?,?,?,?,?)`,
          [record.hash, record.blockNumber, record.from, record.to, record.value, record.gasPrice, record.status]
        );
      } else {
        await conn.execute(
          `INSERT INTO dex_events (blockNumber, transactionHash, eventName, contractAddress, data)
           VALUES (?,?,?,?,?)`,
          [blockNumber, record.transactionHash, record.eventName, record.pair, JSON.stringify(record.data)]
        );
        if (record.snapshot) {
          const s = record.snapshot;
          await conn.execute(
            `INSERT INTO pair_snapshots
               (blockNumber, blockTimestamp, pairAddress, reserve0, reserve1, spotPrice,
                price0Cumulative, price1Cumulative)
             VALUES (?,?,?,?,?,?,?,?)`,
            [s.blockNumber, s.blockTimestamp, s.pairAddress, s.reserve0, s.reserve1, s.spotPrice, s.price0Cumulative, s.price1Cumulative]
          );
        }
      }
    }
  }

  async function latestSyncedBlock(conn) {
    const [rows] = await conn.query("SELECT MAX(number) AS latest FROM blocks");
    return rows[0].latest == null ? 0 : Number(rows[0].latest) + 1;
  }

  /** Spawn the Python vector sync (non-blocking, fire-and-forget). */
  let _vectorSyncRunning = false;
  function triggerVectorSync(snapshotsWritten) {
    if (_vectorSyncRunning || snapshotsWritten === 0) return;
    const dexMcpDir = join(PROJECT_ROOT, "Dex_Mcp");
    if (!existsSync(join(dexMcpDir, "pyproject.toml"))) return;

    _vectorSyncRunning = true;
    try {
      const child = spawn("uv", ["run", "dex-vectors"], {
        cwd: dexMcpDir,
        stdio: "ignore",
        detached: true,
      });
      child.unref();
      child.on("exit", () => { _vectorSyncRunning = false; });
      child.on("error", () => { _vectorSyncRunning = false; });
    } catch {
      _vectorSyncRunning = false;
    }
  }

  async function syncBlock(conn, block) {
    const records = await decodeBlock(block);
    await writeBlock(conn, records, block.number);
    return records;
  }

  /** Catch up to the chain head. Returns the number of blocks processed. */
  async function tick(conn, fromBlock) {
    const head = await provider.getBlockNumber();
    let from = fromBlock ?? (conn ? await latestSyncedBlock(conn) : 0);
    if (from === 0) from = Math.max(0, head - 50);

    let processed = 0;
    let snapshotsWritten = 0;
    while (from <= head && processed < MAX_BLOCKS_PER_TICK) {
      const block = await provider.getBlock(from);
      if (block) {
        const records = conn ? await syncBlock(conn, block) : await decodeBlock(block);
        snapshotsWritten += records.filter((r) => r.snapshot).length;
        if (dryRun) {
          const events = records.filter((r) => r.type === "event");
          logger.log(`block #${from}: ${records.length} records (${events.length} events)`);
          for (const event of events) {
            logger.log(`  [${event.eventName}] ${event.pair} ${JSON.stringify(event.data)}`);
          }
        } else {
          logger.log(`Syncing block #${from}`);
        }
        processed += 1;
      }
      from += 1;
    }
    // Trigger vector sync after writing new snapshots
    if (!dryRun && snapshotsWritten > 0) {
      triggerVectorSync(snapshotsWritten);
    }
    return processed;
  }

  async function run() {
    logger.log(`Indexing ${rpcUrl}` + (dryRun ? " (dry run, no DB writes)" : ` -> ${poolConfig.host}/${poolConfig.database}`));

    let conn = null;
    if (!dryRun) {
      try {
        conn = await openConnection();
      } catch (error) {
        throw new Error(
          `Cannot connect to MySQL at ${poolConfig.host}: ${error.message}\n` +
            "Start MySQL, then run `npm run db:init` (or use `node Scripts/sync.js --dry-run`)."
        );
      }
    }

    let running = true;
    const stop = () => {
      running = false;
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);

    do {
      const processed = await tick(conn);
      if (processed === 0 && !once) logger.log("Waiting for new blocks...");
      if (!once) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    } while (running && !once);

    if (conn) await conn.end();
    logger.log("Indexer stopped.");
  }

  return { run, tick, decodeBlock, ensureSchema, openConnection };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const once = process.argv.includes("--once");
  const dryRun = process.argv.includes("--dry-run");
  createIndexer({ once, dryRun })
    .run()
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
