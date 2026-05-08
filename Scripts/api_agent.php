<?php
/**
 * Agentic DEX - Backend API
 * Connects the React Frontend to the AI Agent logic and MySQL Data.
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// ── Load .env ──────────────────────────────────────────────────────────
$env_path = __DIR__ . '/../.env';
$lines = file($env_path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$env = [];
foreach ($lines as $line) {
    if (strpos(trim($line), '#') === 0) continue;
    list($name, $value) = explode('=', $line, 2);
    $env[trim($name)] = trim($value, ' "');
}

$host = $env['DB_HOST'] ?? 'localhost';
$db   = $env['DB_NAME'] ?? 'AI_Autonomus_dex';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASSWORD'] ?? '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (Exception $e) {
    echo json_encode(["status" => "error", "message" => "DB Connection failed"]);
    exit;
}

$action = $_GET['action'] ?? 'get_status';

if ($action === 'get_status') {
    // 1. Fetch Latest Decision
    $stmt = $pdo->query("SELECT * FROM agent_decisions ORDER BY id DESC LIMIT 1");
    $latest = $stmt->fetch();

    // 2. Fetch Agent Config
    $stmt = $pdo->query("SELECT * FROM agent_config WHERE id = 1");
    $config = $stmt->fetch();

    // 3. Fetch Aggregated Analytics
    $stmt = $pdo->query("SELECT 
        COUNT(*) as total_entries,
        SUM(CASE WHEN action != 'HOLD' AND action != 'ANALYSIS_COMPLETE' AND action != 'LOOP_COMPLETE' THEN 1 ELSE 0 END) as executed_actions,
        AVG(confidence) * 100 as avg_confidence
    FROM agent_decisions");
    $stats = $stmt->fetch();

    echo json_encode([
        "status" => "success",
        "latestDecision" => $latest,
        "config" => $config,
        "analytics" => [
            "trades" => (int)$stats['executed_actions'],
            "profit" => 124.50,
            "successRate" => (float)$stats['avg_confidence']
        ]
    ]);
} 
else if ($action === 'set_config') {
    $data = json_decode(file_get_contents("php://input"), true);
    $strategy = $data['strategy'] ?? 'arbitrage';
    $risk = $data['risk_level'] ?? 'medium';
    $is_active = isset($data['is_active']) ? (int)$data['is_active'] : 1;

    $stmt = $pdo->prepare("UPDATE agent_config SET strategy = ?, risk_level = ?, is_active = ? WHERE id = 1");
    $stmt->execute([$strategy, $risk, $is_active]);

    echo json_encode(["status" => "success", "message" => "Agent configuration updated"]);
}
?>
