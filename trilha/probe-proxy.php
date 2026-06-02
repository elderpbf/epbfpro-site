<?php
// probe-proxy.php -- same-origin forwarder to the Backstage worker, used only
// by the iPhone diagnostic probe (trilha/probe.html). This is candidate fix "B"
// made testable: it makes the API first-party (served from pensoia.com) so iOS
// Safari stops classifying the call as cross-site. Target is hardcoded; this is
// NOT a general open proxy. Safe to delete once the diagnosis is done.

header('Content-Type: application/json; charset=utf-8');
// No-store so Safari/Hostinger never serve a cached probe response.
header('Cache-Control: no-store');

$WORKER = 'https://backstage-api.pensoia.workers.dev';
$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

// Mirror api-client.js: small calls use GET ?payload=, large ones POST raw JSON.
if ($method === 'POST') {
    $url  = $WORKER;
    $body = file_get_contents('php://input');
} else {
    $payload = isset($_GET['payload']) ? $_GET['payload'] : null;
    $url  = $WORKER . ($payload !== null ? ('?payload=' . rawurlencode($payload)) : '');
    $body = null;
}

// Pass through an Authorization header if the page sent one.
$auth = null;
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $k => $v) {
        if (strtolower($k) === 'authorization') { $auth = $v; }
    }
}

// Preferred path: cURL.
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    $hdrs = [];
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $hdrs[] = 'Content-Type: application/json';
    }
    if ($auth) { $hdrs[] = 'Authorization: ' . $auth; }
    if ($hdrs) { curl_setopt($ch, CURLOPT_HTTPHEADER, $hdrs); }
    $resp = curl_exec($ch);
    if ($resp === false) {
        http_response_code(502);
        echo json_encode(['error' => 'proxy_curl_failed', 'detail' => curl_error($ch)]);
        exit;
    }
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    http_response_code($code ? $code : 200);
    echo $resp;
    exit;
}

// Fallback path: file_get_contents (needs allow_url_fopen).
$headers = [];
if ($method === 'POST') { $headers[] = 'Content-Type: application/json'; }
if ($auth) { $headers[] = 'Authorization: ' . $auth; }
$opts = ['http' => [
    'method'        => $method,
    'timeout'       => 15,
    'ignore_errors' => true,
    'header'        => implode("\r\n", $headers),
]];
if ($method === 'POST') { $opts['http']['content'] = $body; }
$resp = @file_get_contents($url, false, stream_context_create($opts));
if ($resp === false) {
    http_response_code(502);
    echo json_encode(['error' => 'proxy_fopen_failed', 'hint' => 'curl + allow_url_fopen both unavailable']);
    exit;
}
echo $resp;
