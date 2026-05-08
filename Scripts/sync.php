<?php
/**
 * Ganache → MySQL Synchronization Service (PHP)
 * - Blocks, Transactions
 * - Sync, Swap, Mint, Burn events
 * - pair_snapshots + agent_decisions tables
 */

// ── Load .env ─────────────────────────────────────────────────────────────────
function loadEnv($path) {
    if (!file_exists($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        $parts = explode('=', $line, 2);
        if (count($parts) < 2) continue;
        $_ENV[trim($parts[0])] = trim($parts[1], " \"'");
    }
}
loadEnv(__DIR__ . '/../.env');

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToDec($hex) {
    $hex = ltrim($hex ?? '0', '0x');
    if ($hex === '') return '0';
    if (function_exists('gmp_init')) return gmp_strval(gmp_init($hex, 16));
    $dec = '0';
    foreach (str_split($hex) as $c) {
        $dec = bcmul($dec, '16', 0);
        $dec = bcadd($dec, (string)hexdec($c), 0);
    }
    return $dec;
}

function formatCumulativePrice($raw) {
    $scale = '5192296858534827628530496329220096'; // 2^112
    return function_exists('bcdiv') ? bcdiv((string)$raw, $scale, 6) : $raw;
}

function decodeUint($data, $slot) {
    return hexToDec(substr($data, $slot * 64, 64));
}

function decodeAddr($topic) {
    return '0x' . substr($topic, 26);
}

// ── Event Topics ──────────────────────────────────────────────────────────────
const TOPIC_SYNC = '0x57667601b68e980c00cafc337440398ea05fd2fa1dba792c6864b4718740bee5';
const TOPIC_SWAP = '0x77f92a1b6a1a11de8ca49515ad4c1fad45632dd3442167d74b90b304a3c7a758';
const TOPIC_MINT = '0xb4c03061fb5b7fed76389d5af8f2e0ddb09f8c70d1333abbb62582835e10accb';
const TOPIC_BURN = '0x743033787f4738ff4d6a7225ce2bd0977ee5f86b91a902a58f5e4d0b297b4644';

// ── Config ────────────────────────────────────────────────────────────────────
$dbHost = $_ENV['DB_HOST'] ?? 'localhost';
$dbName = $_ENV['DB_NAME'] ?? '';
$dbUser = $_ENV['DB_USER'] ?? '';
$dbPass = $_ENV['DB_PASSWORD'] ?? '';
$rpcUrl = $_ENV['RPC_URL'] ?? 'http://127.0.0.1:7545/';

if (!$dbUser || !$dbName) die("Error: missing DB_USER or DB_NAME in .env\n");

// ── Boot ──────────────────────────────────────────────────────────────────────
try {
    $pdo = new PDO("mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    echo "Connected to MySQL.\n";
    setupDatabase($pdo);

    $latestBlock = eth_blockNumber($rpcUrl);
    $startBlock  = getLatestSyncedBlock($pdo);
    if ($startBlock === 0) $startBlock = max(0, $latestBlock - 50);

    echo "Initial sync: blocks $startBlock → $latestBlock\n";
    for ($i = $startBlock; $i <= $latestBlock; $i++) syncBlock($pdo, $rpcUrl, $i);

    echo "Listening for new blocks...\n";
    while (true) {
        $latest = eth_blockNumber($rpcUrl);
        while ($startBlock <= $latest) {
            syncBlock($pdo, $rpcUrl, $startBlock++);
        }
        sleep(2);
    }
} catch (Exception $e) {
    die("Fatal error: " . $e->getMessage() . "\n");
}

// ── Schema ────────────────────────────────────────────────────────────────────
function setupDatabase($pdo) {
    echo "Setting up tables...\n";

    $pdo->exec("CREATE TABLE IF NOT EXISTS blocks (
        number     BIGINT PRIMARY KEY,
        hash       VARCHAR(66) UNIQUE,
        timestamp  BIGINT,
        parentHash VARCHAR(66)
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS transactions (
        hash         VARCHAR(66) PRIMARY KEY,
        blockNumber  BIGINT,
        from_address VARCHAR(42),
        to_address   VARCHAR(42),
        value        TEXT,
        gasPrice     TEXT,
        status       INT,
        FOREIGN KEY (blockNumber) REFERENCES blocks(number)
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS dex_events (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        blockNumber     BIGINT,
        transactionHash VARCHAR(66),
        eventName       VARCHAR(50),
        contractAddress VARCHAR(42),
        data            JSON,
        createdAt       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (blockNumber) REFERENCES blocks(number)
    )");
    try { $pdo->exec("CREATE INDEX idx_events_name_block ON dex_events (eventName, blockNumber)"); } catch (Exception $e) {}

    $pdo->exec("CREATE TABLE IF NOT EXISTS pair_snapshots (
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
    )");
    try { $pdo->exec("CREATE INDEX idx_snapshots_pair ON pair_snapshots (pairAddress, blockNumber)"); } catch (Exception $e) {}

    $pdo->exec("CREATE TABLE IF NOT EXISTS agent_decisions (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        agentName   VARCHAR(50),
        action      VARCHAR(100),
        reason      TEXT,
        confidence  FLOAT,
        contextJSON JSON,
        createdAt   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    echo "Tables ready.\n";
}

// ── Block Sync ────────────────────────────────────────────────────────────────
function syncBlock($pdo, $rpcUrl, $blockNumber) {
    echo "Syncing block #$blockNumber...\n";
    $block = eth_getBlockByNumber($rpcUrl, $blockNumber);
    if (!$block) { echo "  Block not found.\n"; return; }

    $blockNum = (int)hexdec($block['number']);
    $blockTs  = (int)hexdec($block['timestamp']);

    // Save block
    try {
        $pdo->prepare("INSERT IGNORE INTO blocks (number, hash, timestamp, parentHash) VALUES (?,?,?,?)")
            ->execute([$blockNum, $block['hash'], $blockTs, $block['parentHash']]);
        echo "  Block #$blockNum saved.\n";
    } catch (Exception $e) {
        echo "  ERROR saving block: " . $e->getMessage() . "\n";
        return;
    }

    if (empty($block['transactions'])) return;

    foreach ($block['transactions'] as $tx) {
        // Handle both hash strings and full tx objects
        if (is_string($tx)) {
            $receipt = eth_getTransactionReceipt($rpcUrl, $tx);
            $txHash = $tx; $txFrom = ''; $txTo = null; $txVal = '0x0'; $txGas = '0x0';
        } else {
            $receipt = eth_getTransactionReceipt($rpcUrl, $tx['hash']);
            $txHash  = $tx['hash'];
            $txFrom  = $tx['from']     ?? '';
            $txTo    = $tx['to']       ?? null;
            $txVal   = $tx['value']    ?? '0x0';
            $txGas   = $tx['gasPrice'] ?? '0x0';
        }

        try {
            $pdo->prepare("INSERT IGNORE INTO transactions (hash, blockNumber, from_address, to_address, value, gasPrice, status) VALUES (?,?,?,?,?,?,?)")
                ->execute([$txHash, $blockNum, $txFrom, $txTo, hexdec($txVal), hexdec($txGas),
                    $receipt ? (int)hexdec($receipt['status'] ?? '0x0') : null]);
        } catch (Exception $e) {
            echo "  ERROR saving tx: " . $e->getMessage() . "\n";
            continue;
        }

        if (!$receipt || !isset($receipt['logs'])) continue;

        foreach ($receipt['logs'] as $log) {
            $topic0  = $log['topics'][0] ?? '';
            $rawData = substr($log['data'], 2);
            $pair    = $log['address'];

            try {
                if ($topic0 === TOPIC_SYNC) {
                    $r0   = decodeUint($rawData, 0);
                    $r1   = decodeUint($rawData, 1);
                    $p0   = decodeUint($rawData, 2);
                    $p1   = decodeUint($rawData, 3);
                    $spot = ($r0 !== '0') ? bcdiv(bcmul($r1, bcpow('10', '18')), $r0, 0) : '0';
                    $ed   = ['reserve0' => $r0, 'reserve1' => $r1,
                             'price0Cumulative' => formatCumulativePrice($p0),
                             'price1Cumulative' => formatCumulativePrice($p1)];
                    $pdo->prepare("INSERT INTO dex_events (blockNumber, transactionHash, eventName, contractAddress, data) VALUES (?,?,?,?,?)")
                        ->execute([$blockNum, $txHash, 'Sync', $pair, json_encode($ed)]);
                    $pdo->prepare("INSERT INTO pair_snapshots (blockNumber, blockTimestamp, pairAddress, reserve0, reserve1, spotPrice, price0Cumulative, price1Cumulative) VALUES (?,?,?,?,?,?,?,?)")
                        ->execute([$blockNum, $blockTs, $pair, $r0, $r1, $spot, $ed['price0Cumulative'], $ed['price1Cumulative']]);
                    echo "  [Sync] Pair={$pair} spot={$spot}\n";

                } elseif ($topic0 === TOPIC_SWAP) {
                    $ed = ['sender' => decodeAddr($log['topics'][1] ?? ''),
                           'amountIn' => decodeUint($rawData, 0), 'amountOut' => decodeUint($rawData, 1)];
                    $pdo->prepare("INSERT INTO dex_events (blockNumber, transactionHash, eventName, contractAddress, data) VALUES (?,?,?,?,?)")
                        ->execute([$blockNum, $txHash, 'Swap', $pair, json_encode($ed)]);
                    echo "  [Swap] Pair={$pair}\n";

                } elseif ($topic0 === TOPIC_MINT) {
                    $ed = ['provider' => decodeAddr($log['topics'][1] ?? ''),
                           'amount0' => decodeUint($rawData, 0), 'amount1' => decodeUint($rawData, 1),
                           'liquidity' => decodeUint($rawData, 2)];
                    $pdo->prepare("INSERT INTO dex_events (blockNumber, transactionHash, eventName, contractAddress, data) VALUES (?,?,?,?,?)")
                        ->execute([$blockNum, $txHash, 'Mint', $pair, json_encode($ed)]);
                    echo "  [Mint] Pair={$pair}\n";

                } elseif ($topic0 === TOPIC_BURN) {
                    $ed = ['provider' => decodeAddr($log['topics'][1] ?? ''),
                           'amount0' => decodeUint($rawData, 0), 'amount1' => decodeUint($rawData, 1),
                           'liquidity' => decodeUint($rawData, 2)];
                    $pdo->prepare("INSERT INTO dex_events (blockNumber, transactionHash, eventName, contractAddress, data) VALUES (?,?,?,?,?)")
                        ->execute([$blockNum, $txHash, 'Burn', $pair, json_encode($ed)]);
                    echo "  [Burn] Pair={$pair}\n";
                }
            } catch (Exception $e) {
                echo "  ERROR parsing log: " . $e->getMessage() . "\n";
            }
        }
    }
}

// ── JSON-RPC Helpers ──────────────────────────────────────────────────────────
function getLatestSyncedBlock($pdo) {
    $row = $pdo->query("SELECT MAX(number) AS latest FROM blocks")->fetch();
    return $row['latest'] ? (int)$row['latest'] + 1 : 0;
}
function eth_blockNumber($url) { return hexdec(jsonRpcCall($url, 'eth_blockNumber', [])['result']); }
function eth_getBlockByNumber($url, $n) { return jsonRpcCall($url, 'eth_getBlockByNumber', ['0x'.dechex($n), true])['result']; }
function eth_getTransactionReceipt($url, $h) { return jsonRpcCall($url, 'eth_getTransactionReceipt', [$h])['result']; }

function jsonRpcCall($url, $method, $params) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS     => json_encode(['jsonrpc'=>'2.0','id'=>1,'method'=>$method,'params'=>$params]),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    ]);
    $res = curl_exec($ch);
    if (curl_errno($ch)) throw new Exception(curl_error($ch));
    curl_close($ch);
    return json_decode($res, true);
}
