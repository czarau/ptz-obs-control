<?php
declare(strict_types=1);

function youtube_oauth_config_path(): string
{
    return '/var/lib/XXXXX-live/youtube-oauth.json';
}

function youtube_oauth_refresh_token_path(): string
{
    return '/var/lib/XXXXX-live/youtube_refresh_token.txt';
}

function youtube_oauth_load_json(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $json = json_decode((string) file_get_contents($path), true);
    return is_array($json) ? $json : [];
}

function youtube_oauth_config(): array
{
    $cfg = youtube_oauth_load_json(youtube_oauth_config_path());
    return [
        'client_id' => trim((string) ($cfg['client_id'] ?? '')),
        'client_secret' => trim((string) ($cfg['client_secret'] ?? '')),
    ];
}

function youtube_oauth_state_key(): string
{
    return 'youtube_oauth_state';
}

function youtube_oauth_redirect_uri(): string
{
    return 'https://XXXXX/youtube-auth-callback.php';
}

function youtube_oauth_authorize_url(): string
{
    $cfg = youtube_oauth_config();
    $state = bin2hex(random_bytes(16));
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $_SESSION[youtube_oauth_state_key()] = $state;

    return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'client_id' => $cfg['client_id'],
        'redirect_uri' => youtube_oauth_redirect_uri(),
        'response_type' => 'code',
        'scope' => 'openid email profile https://www.googleapis.com/auth/youtube',
        'state' => $state,
        'access_type' => 'offline',
        'prompt' => 'consent',
        'include_granted_scopes' => 'true',
    ]);
}

function youtube_oauth_verify_state(?string $state): bool
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $expected = (string) ($_SESSION[youtube_oauth_state_key()] ?? '');
    unset($_SESSION[youtube_oauth_state_key()]);
    return $expected !== '' && is_string($state) && hash_equals($expected, $state);
}

function youtube_oauth_http_post_form(string $url, array $data): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($data),
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'],
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return [$status, is_string($body) ? $body : '', $error];
}

function youtube_oauth_store_refresh_token(string $token): bool
{
    $token = trim($token);
    if ($token === '') {
        return false;
    }
    $path = youtube_oauth_refresh_token_path();
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
        return false;
    }
    $ok = file_put_contents($path, $token . "\n", LOCK_EX) !== false;
    if ($ok) {
        @chmod($path, 0600);
    }
    return $ok;
}

function youtube_oauth_read_refresh_token(): string
{
    $path = youtube_oauth_refresh_token_path();
    if (!is_file($path)) {
        return '';
    }
    return trim((string) file_get_contents($path));
}

function youtube_http_json(string $method, string $url, array $params = [], ?array $data = null, ?string $bearer = null): array
{
    $headers = ['Accept: application/json'];
    if ($bearer !== null && $bearer !== '') {
        $headers[] = 'Authorization: Bearer ' . $bearer;
    }
    $body = null;
    if ($data !== null) {
        $body = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';
    }
    $ch = curl_init($url . ($params ? ('?' . http_build_query($params)) : ''));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $res = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$code, is_string($res) ? $res : '', $err];
}

function youtube_get_access_token(): array
{
    $cfg = youtube_oauth_config();
    $refresh = youtube_oauth_read_refresh_token();
    if ($cfg['client_id'] === '' || $cfg['client_secret'] === '') {
        return [false, 'google_client_not_configured', null];
    }
    if ($refresh === '') {
        return [false, 'missing_refresh_token', null];
    }
    [$code, $body, $err] = youtube_http_json('POST', 'https://oauth2.googleapis.com/token', [], [
        'client_id' => $cfg['client_id'],
        'client_secret' => $cfg['client_secret'],
        'refresh_token' => $refresh,
        'grant_type' => 'refresh_token',
    ]);
    if ($code < 200 || $code >= 300) {
        return [false, 'token_refresh_failed', ['code' => $code, 'body' => $body, 'error' => $err]];
    }
    $json = json_decode($body, true);
    $access = is_array($json) ? trim((string) ($json['access_token'] ?? '')) : '';
    if ($access === '') {
        return [false, 'missing_access_token', $json];
    }
    return [true, 'ok', $access];
}
