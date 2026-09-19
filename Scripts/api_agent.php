<?php
/**
 * Agentic DEX - Backend API
 * Bridges the React frontend to MySQL (written by Scripts/sync.js) and the
 * AI agent state.
 *
 * Serve it with:  npm run api      (php -S 127.0.0.1:8000 -t .)
 * Endpoints:      ?action=get_status | set_config | get_market | get_decisions
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Load .env ──────────────────────────────────────────────────────────
$env_path = __DIR__ . '/../.env';
$env = [];
if (file_exists($env_path)) {
    foreach (file($env_path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        $parts = explode('=', $line, 2);
        if (count($parts) < 2) continue;
        $env[trim($parts[0])] = trim($parts[1], " \"'");
    }
}

$host = $env['DB_HOST'] ?? '127.0.0.1';
$db   = $env['DB_NAME'] ?? 'AI_Autonomus_dex';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASSWORD'] ?? '';

function respond($payload) {
    echo json_encode($payload);
    exit;
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (Exception $e) {
    respond([
        "status" => "error",
        "message" => "DB connection failed. Is MySQL running and is .env correct?",
        "detail" => $e->getMessage(),
    ]);
}

/** Runs a statement, returning [] instead of throwing when a table is missing. */
function safeRows(PDO $pdo, $sql, $params = []) {
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    } catch (Exception $e) {
        return [];
    }
}

/** Decodes the JSON `data` column of a dex_events row. */
function decodeEvent($row) {
    if (isset($row['data']) && is_string($row['data'])) {
        $row['data'] = json_decode($row['data'], true);
    }
    return $row;
}

$action = $_GET['action'] ?? 'get_status';

switch ($action) {
    case 'get_status':
        $latest = safeRows($pdo, "SELECT * FROM agent_decisions ORDER BY id DESC LIMIT 1");
        $config = safeRows($pdo, "SELECT * FROM agent_config WHERE id = 1");
        $stats  = safeRows($pdo, "SELECT
            COUNT(*) as total_entries,
            SUM(CASE WHEN action NOT IN ('HOLD','QUANT_ANALYSIS','ANALYSIS_COMPLETE','LOOP_COMPLETE') THEN 1 ELSE 0 END) as executed_actions,
            AVG(confidence) * 100 as avg_confidence
          FROM agent_decisions");

        $decisions = safeRows($pdo, "SELECT action FROM agent_decisions");
        $executed = 0;
        foreach ($decisions as $d) {
            if (!in_array($d['action'], ['HOLD', 'QUANT_ANALYSIS', 'ANALYSIS_COMPLETE', 'LOOP_COMPLETE'], true)) {
                $executed++;
            }
        }

        // PnL from agent_trades
        $tradeStats = safeRows($pdo, "SELECT
            COUNT(*) as total_trades,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_trades,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed_trades,
            SUM(gasUsed) as total_gas_used
          FROM agent_trades");

        $pnlResult = safeRows($pdo, "SELECT SUM(pnl) as total_pnl FROM agent_trades WHERE pnl IS NOT NULL");
        $totalPnl = $pnlResult[0]['total_pnl'] ?? null;

        respond([
            "status" => "success",
            "latestDecision" => $latest[0] ?? null,
            "config" => $config[0] ?? null,
            "analytics" => [
                "trades" => (int)($tradeStats[0]['total_trades'] ?? $executed),
                "successfulTrades" => (int)($tradeStats[0]['successful_trades'] ?? 0),
                "failedTrades" => (int)($tradeStats[0]['failed_trades'] ?? 0),
                "decisions" => (int)($stats[0]['total_entries'] ?? 0),
                "profit" => $totalPnl,
                "totalGasUsed" => (int)($tradeStats[0]['total_gas_used'] ?? 0),
                "successRate" => isset($stats[0]['avg_confidence']) ? round((float)$stats[0]['avg_confidence'], 1) : 0.0,
            ],
        ]);
        break;

    case 'set_config':
        $data = json_decode(file_get_contents("php://input"), true) ?: [];
        $strategy = $data['strategy'] ?? 'arbitrage';
        $risk = $data['risk_level'] ?? 'medium';
        $is_active = isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1;

        try {
            $stmt = $pdo->prepare(
                "INSERT INTO agent_config (id, strategy, risk_level, is_active) VALUES (1, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE strategy = VALUES(strategy), risk_level = VALUES(risk_level), is_active = VALUES(is_active)"
            );
            $stmt->execute([$strategy, $risk, $is_active]);
            respond(["status" => "success", "message" => "Agent configuration updated"]);
        } catch (Exception $e) {
            respond(["status" => "error", "message" => "Update failed", "detail" => $e->getMessage()]);
        }
        break;

    case 'get_decisions':
        $limit = min(100, max(1, (int)($_GET['limit'] ?? 20)));
        $rows = safeRows($pdo, "SELECT * FROM agent_decisions ORDER BY id DESC LIMIT $limit");
        foreach ($rows as &$row) {
            if (isset($row['contextJSON']) && is_string($row['contextJSON'])) {
                $row['contextJSON'] = json_decode($row['contextJSON'], true);
            }
        }
        respond(["status" => "success", "decisions" => $rows]);
        break;

    case 'get_market':
        // Latest snapshot per pair, written by the indexer
        $pools = safeRows($pdo, "SELECT ps.* FROM pair_snapshots ps
            INNER JOIN (
                SELECT pairAddress, MAX(blockNumber) AS maxBlock
                FROM pair_snapshots GROUP BY pairAddress
            ) latest ON ps.pairAddress = latest.pairAddress AND ps.blockNumber = latest.maxBlock
            ORDER BY ps.blockNumber DESC");

        $swaps = safeRows($pdo, "SELECT blockNumber, transactionHash, contractAddress, data, createdAt
            FROM dex_events WHERE eventName = 'Swap' ORDER BY blockNumber DESC, id DESC LIMIT 20");

        foreach ($swaps as &$swap) $swap = decodeEvent($swap);

        respond([
            "status" => "success",
            "pools" => $pools,
            "recentSwaps" => $swaps,
        ]);
        break;

    case 'faucet':
        // Distribute test tokens using the Node.js faucet script
        $data = json_decode(file_get_contents("php://input"), true) ?: [];
        $toAddress = $data['address'] ?? '';
        if (!$toAddress || !preg_match('/^0x[a-fA-F0-9]{40}$/', $toAddress)) {
            respond(["status" => "error", "message" => "Invalid Ethereum address"]);
        }

        $projectRoot = dirname(__DIR__);
        $cmd = "cd " . escapeshellarg($projectRoot) . " && FAUCET_ADDRESS=" . escapeshellarg($toAddress) . " npx hardhat run Scripts/faucet.js --network ganache 2>&1";
        $output = shell_exec($cmd);

        if (strpos($output, 'Done!') !== false) {
            respond(["status" => "success", "message" => "Tokens distributed to $toAddress"]);
        } else {
            respond(["status" => "error", "message" => "Faucet failed", "output" => $output]);
        }
        break;

    default:
        respond(["status" => "error", "message" => "Unknown action: $action"]);
}
