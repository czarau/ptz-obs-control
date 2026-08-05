<?php
declare(strict_types=1);
require __DIR__ . '/youtube-oauth.php';

if (!empty($_GET['purpose']) && $_GET['purpose'] !== 'youtube') {
    http_response_code(400);
    echo 'Unsupported purpose';
    exit;
}

if (isset($_GET['saved']) || isset($_GET['error'])) {
    header('Content-Type: text/html; charset=utf-8');
    $saved = (string) ($_GET['saved'] ?? '');
    $error = (string) ($_GET['error'] ?? '');
    $message = $saved !== ''
        ? 'Google auth worked. The refresh token has been saved.'
        : 'Google auth did not complete.';
    if ($error !== '') {
        $message .= ' Error: ' . htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
    echo '<!doctype html><meta charset="utf-8"><title>YouTube Connect</title>';
    echo '<h1>YouTube Connect</h1>';
    echo '<p>' . htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';
    echo '<p><a href="https://XXXXX/">Return to control</a></p>';
    exit;
}

header('Location: ' . youtube_oauth_authorize_url(), true, 302);
