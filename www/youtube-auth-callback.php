<?php
declare(strict_types=1);
require __DIR__ . '/youtube-oauth.php';

$control = 'https://XXXXX/';

if (!empty($_GET['error'])) {
    header('Location: ' . $control . '?youtube_auth_error=denied', true, 302);
    exit;
}
if (!youtube_oauth_verify_state($_GET['state'] ?? null)) {
    header('Location: ' . $control . '?youtube_auth_error=state', true, 302);
    exit;
}

$code = (string) ($_GET['code'] ?? '');
if ($code === '') {
    header('Location: ' . $control . '?youtube_auth_error=missing_code', true, 302);
    exit;
}

$cfg = youtube_oauth_config();
[$status, $body, $err] = youtube_oauth_http_post_form('https://oauth2.googleapis.com/token', [
    'code' => $code,
    'client_id' => $cfg['client_id'],
    'client_secret' => $cfg['client_secret'],
    'redirect_uri' => youtube_oauth_redirect_uri(),
    'grant_type' => 'authorization_code',
]);
if ($status < 200 || $status >= 300) {
    header('Location: ' . $control . '?youtube_auth_error=token_exchange', true, 302);
    exit;
}
$json = json_decode($body, true);
$refresh = is_array($json) ? trim((string) ($json['refresh_token'] ?? '')) : '';
if ($refresh === '') {
    $existing = youtube_oauth_read_refresh_token();
    if ($existing !== '') {
        header('Location: ' . $control . '?youtube_connected=1', true, 302);
        exit;
    }
    header('Location: ' . $control . '?youtube_auth_error=missing_refresh_token', true, 302);
    exit;
}
if (!youtube_oauth_store_refresh_token($refresh)) {
    header('Location: ' . $control . '?youtube_auth_error=save_failed', true, 302);
    exit;
}
header('Location: ' . $control . '?youtube_connected=1', true, 302);
