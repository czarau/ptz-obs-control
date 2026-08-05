<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function relay_reply(int $statusCode, array $payload): never
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    relay_reply(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
    relay_reply(400, ['ok' => false, 'error' => 'invalid_json']);
}

$event = (string) ($input['event'] ?? '');
if (!in_array($event, ['live', 'stopped', 'probe'], true)) {
    relay_reply(400, ['ok' => false, 'error' => 'invalid_event']);
}

$videoId = isset($input['video_id']) ? trim((string) $input['video_id']) : null;
$title = isset($input['title']) ? trim((string) $input['title']) : null;
if ($videoId !== null && !preg_match('/^[A-Za-z0-9_-]{6,32}$/', $videoId)) {
    relay_reply(400, ['ok' => false, 'error' => 'invalid_video_id']);
}
if ($title !== null && (function_exists('mb_strlen') ? mb_strlen($title) : strlen($title)) > 200) {
    relay_reply(400, ['ok' => false, 'error' => 'title_too_long']);
}

$secretPath = '/var/lib/chatswood-live/live-push-secret';
$secret = is_readable($secretPath) ? trim((string) file_get_contents($secretPath)) : '';
if ($secret === '') {
    relay_reply(500, ['ok' => false, 'error' => 'push_not_configured']);
}

$payload = [
    'event' => $event,
    'video_id' => $videoId,
    'title' => $title,
    'sent_at' => gmdate('c'),
];
$body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($body === false) {
    relay_reply(500, ['ok' => false, 'error' => 'encode_failed']);
}

$timestamp = (string) time();
$signature = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
$ch = curl_init('https://XXXXX/control-live-event.php');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'X-Live-Timestamp: ' . $timestamp,
        'X-Live-Signature: ' . $signature,
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 12,
]);
$responseBody = curl_exec($ch);
$httpCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($responseBody === false || $httpCode < 200 || $httpCode >= 300) {
    relay_reply(502, [
        'ok' => false,
        'error' => 'live_site_rejected_event',
        'upstream_status' => $httpCode,
        'details' => $curlError !== '' ? $curlError : null,
    ]);
}

$upstream = json_decode((string) $responseBody, true);
relay_reply(200, is_array($upstream) ? $upstream : ['ok' => true, 'event' => $event]);
