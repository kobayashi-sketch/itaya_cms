<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$dataDir = __DIR__ . '/data';
$stateFile = $dataDir . '/signage-state.json';
$logFile = $dataDir . '/signage-updates.log';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!is_file($stateFile)) {
        echo '{}';
        exit;
    }
    readfile($stateFile);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

signage_require_admin_post();

$raw = file_get_contents('php://input');
$decoded = json_decode($raw ?: '', true);
if (!is_array($decoded)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to create data directory']);
    exit;
}

$sanitized = signage_sanitize_state($decoded);
$json = json_encode($sanitized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
if ($json === false || file_put_contents($stateFile, $json, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to write state']);
    exit;
}

$logLine = json_encode([
    'time' => date(DATE_ATOM),
    'remoteAddr' => $_SERVER['REMOTE_ADDR'] ?? '',
    'userAgent' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200),
    'events' => count($sanitized['events'] ?? []),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($logLine !== false) {
    file_put_contents($logFile, $logLine . PHP_EOL, FILE_APPEND | LOCK_EX);
}

echo json_encode(['ok' => true]);
