<?php
declare(strict_types=1);
require __DIR__ . '/youtube-api.php';

header('Content-Type: application/json; charset=utf-8');

$result = youtube_prepare_obs_stream();
http_response_code(!empty($result['ok']) ? 200 : 503);
echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
