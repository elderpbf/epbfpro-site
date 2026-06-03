<?php
// probe-collect.php -- receives diagnostic results from trilha/probe.html and
// appends them to a local NDJSON file so the team reads them without the tester
// copy-pasting. Same-origin (first-party) write, so it's never blocked by iOS
// Safari. Short-lived diagnostic; delete with the rest of the probe when done.
//
//   POST (JSON body)        -> append one result line
//   GET ?read=<READ_KEY>    -> dump all collected results as text

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$READ_KEY = 'epbf-probe-2026';

// Prefer the (non-web-exposed) temp dir; fall back to the site dir.
$candidates = [
    sys_get_temp_dir() . '/pensoia-probe-results.ndjson',
    __DIR__ . '/probe-results-epbf2026.ndjson',
];

function pick_existing($candidates) {
    foreach ($candidates as $f) { if (file_exists($f)) { return $f; } }
    return null;
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

// Read mode.
if ($method === 'GET' && isset($_GET['read'])) {
    if ($_GET['read'] !== $READ_KEY) {
        http_response_code(403);
        echo json_encode(['error' => 'forbidden']);
        exit;
    }
    header('Content-Type: text/plain; charset=utf-8');
    $f = pick_existing($candidates);
    echo $f ? file_get_contents($f) : "(vazio)\n";
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$raw = file_get_contents('php://input');
if (strlen($raw) > 64000) { $raw = substr($raw, 0, 64000); } // size guard
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'bad_json']);
    exit;
}

$entry = [
    'server_ts' => gmdate('c'),
    'ip'        => isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '',
    'run'       => isset($data['run'])     ? substr((string) $data['run'], 0, 40)     : '',
    'ua'        => isset($data['ua'])      ? substr((string) $data['ua'], 0, 400)     : '',
    'origin'    => isset($data['origin'])  ? substr((string) $data['origin'], 0, 100) : '',
    'verdict'   => isset($data['verdict']) ? substr((string) $data['verdict'], 0, 800) : '',
    'log'       => (isset($data['log']) && is_array($data['log'])) ? array_slice($data['log'], 0, 80) : [],
];

$line = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";

$written = false;
foreach ($candidates as $f) {
    if (@file_put_contents($f, $line, FILE_APPEND | LOCK_EX) !== false) { $written = true; break; }
}
if (!$written) {
    http_response_code(500);
    echo json_encode(['error' => 'write_failed']);
    exit;
}

echo json_encode(['ok' => true]);
