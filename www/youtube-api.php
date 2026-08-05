<?php
declare(strict_types=1);
require_once __DIR__ . '/youtube-oauth.php';

function youtube_auth_start_url(): string
{
    return 'https://XXXXX/youtube-auth-start.php';
}

function youtube_list_broadcasts(): array
{
    [$ok, $status, $tokenOrInfo] = youtube_get_access_token();
    if (!$ok) {
        return ['ok' => false, 'error' => $status, 'details' => $tokenOrInfo, 'auth_url' => youtube_auth_start_url()];
    }
    $token = $tokenOrInfo;
    [$code, $body, $err] = youtube_http_json('GET', 'https://www.googleapis.com/youtube/v3/liveBroadcasts', [
        'part' => 'id,snippet,status,contentDetails',
        'mine' => 'true',
        'maxResults' => 50,
    ], null, $token);
    if ($code < 200 || $code >= 300) {
        return ['ok' => false, 'error' => 'broadcast_list_failed', 'details' => ['code' => $code, 'body' => $body, 'error' => $err], 'auth_url' => youtube_auth_start_url()];
    }
    $json = json_decode($body, true);
    return ['ok' => true, 'items' => is_array($json['items'] ?? null) ? $json['items'] : []];
}

function youtube_list_streams(?string $streamId = null): array
{
    [$ok, $status, $tokenOrInfo] = youtube_get_access_token();
    if (!$ok) {
        return ['ok' => false, 'error' => $status, 'details' => $tokenOrInfo, 'auth_url' => youtube_auth_start_url()];
    }
    $token = $tokenOrInfo;
    $params = [
        'part' => 'id,snippet,cdn,status,contentDetails',
        'mine' => 'true',
        'maxResults' => 50,
    ];
    if ($streamId !== null && $streamId !== '') {
        $params = [
            'part' => 'id,snippet,cdn,status,contentDetails',
            'id' => $streamId,
        ];
    }
    [$code, $body, $err] = youtube_http_json('GET', 'https://www.googleapis.com/youtube/v3/liveStreams', $params, null, $token);
    if ($code < 200 || $code >= 300) {
        return ['ok' => false, 'error' => 'stream_list_failed', 'details' => ['code' => $code, 'body' => $body, 'error' => $err], 'auth_url' => youtube_auth_start_url()];
    }
    $json = json_decode($body, true);
    return ['ok' => true, 'items' => is_array($json['items'] ?? null) ? $json['items'] : []];
}

function youtube_pick_broadcast(array $items): ?array
{
    $candidates = [];
    foreach ($items as $item) {
        $title = (string) ($item['snippet']['title'] ?? '');
        $status = (string) ($item['status']['lifeCycleStatus'] ?? '');
        if ($title === '') {
            continue;
        }
        if (str_starts_with($title, 'Chatswood Live Stream')) {
            $candidates[] = $item;
        } elseif (in_array($status, ['created', 'ready', 'testing', 'live'], true)) {
            $candidates[] = $item;
        }
    }
    if (!$candidates) {
        return null;
    }
    usort($candidates, static function ($a, $b): int {
        return strcmp((string) ($b['snippet']['publishedAt'] ?? ''), (string) ($a['snippet']['publishedAt'] ?? ''));
    });
    return $candidates[0];
}

function youtube_pick_stream(array $items): ?array
{
    if (!$items) {
        return null;
    }
    $candidates = [];
    foreach ($items as $item) {
        $ing = is_array($item['cdn']['ingestionInfo'] ?? null) ? $item['cdn']['ingestionInfo'] : [];
        if (trim((string) ($ing['ingestionAddress'] ?? '')) === '' || trim((string) ($ing['streamName'] ?? '')) === '') {
            continue;
        }
        $candidates[] = $item;
    }
    if (!$candidates) {
        return null;
    }
    usort($candidates, static function ($a, $b): int {
        $aDefault = !empty($a['snippet']['isDefaultStream']);
        $bDefault = !empty($b['snippet']['isDefaultStream']);
        if ($aDefault !== $bDefault) {
            return $aDefault ? -1 : 1;
        }
        return strcmp((string) ($b['snippet']['publishedAt'] ?? ''), (string) ($a['snippet']['publishedAt'] ?? ''));
    });
    return $candidates[0];
}

function youtube_bind_broadcast_to_stream(string $broadcastId, string $streamId): array
{
    [$ok, $status, $tokenOrInfo] = youtube_get_access_token();
    if (!$ok) {
        return ['ok' => false, 'error' => $status, 'details' => $tokenOrInfo, 'auth_url' => youtube_auth_start_url()];
    }
    $token = $tokenOrInfo;
    [$code, $body, $err] = youtube_http_json('POST', 'https://www.googleapis.com/youtube/v3/liveBroadcasts/bind', [
        'part' => 'id,contentDetails,status',
        'id' => $broadcastId,
        'streamId' => $streamId,
    ], null, $token);
    if ($code < 200 || $code >= 300) {
        return ['ok' => false, 'error' => 'broadcast_bind_failed', 'details' => ['code' => $code, 'body' => $body, 'error' => $err], 'auth_url' => youtube_auth_start_url()];
    }
    $json = json_decode($body, true);
    return ['ok' => true, 'broadcast' => is_array($json) ? $json : []];
}

function youtube_update_broadcast_title(string $broadcastId, string $title): array
{
    [$ok, $status, $tokenOrInfo] = youtube_get_access_token();
    if (!$ok) {
        return ['ok' => false, 'error' => $status, 'details' => $tokenOrInfo, 'title' => $title, 'auth_url' => youtube_auth_start_url()];
    }
    $token = $tokenOrInfo;
    [$code, $body, $err] = youtube_http_json('GET', 'https://www.googleapis.com/youtube/v3/liveBroadcasts', [
        'part' => 'id,snippet,status,contentDetails',
        'id' => $broadcastId,
    ], null, $token);
    if ($code < 200 || $code >= 300) {
        return ['ok' => false, 'error' => 'broadcast_fetch_failed', 'details' => ['code' => $code, 'body' => $body, 'error' => $err], 'title' => $title, 'auth_url' => youtube_auth_start_url()];
    }
    $json = json_decode($body, true);
    $items = is_array($json['items'] ?? null) ? $json['items'] : [];
    $broadcast = $items[0] ?? null;
    if (!is_array($broadcast)) {
        return ['ok' => false, 'error' => 'broadcast_not_found', 'title' => $title, 'auth_url' => youtube_auth_start_url()];
    }
    $existingSnippet = is_array($broadcast['snippet'] ?? null) ? $broadcast['snippet'] : [];
    $existingSnippet['title'] = $title;
    [$code, $body, $err] = youtube_http_json('PUT', 'https://www.googleapis.com/youtube/v3/liveBroadcasts', [
        'part' => 'snippet',
        'id' => $broadcastId,
    ], [
        'id' => $broadcastId,
        'snippet' => $existingSnippet,
    ], $token);
    if ($code < 200 || $code >= 300) {
        return ['ok' => false, 'error' => 'broadcast_update_failed', 'details' => ['code' => $code, 'body' => $body, 'error' => $err], 'title' => $title, 'auth_url' => youtube_auth_start_url()];
    }
    return ['ok' => true, 'title' => $title, 'broadcast_id' => $broadcastId, 'old_title' => (string) ($broadcast['snippet']['title'] ?? '')];
}

function youtube_sync_roster_title(): array
{
    ob_start();
    include __DIR__ . '/roster-current.php';
    $rosterJson = ob_get_clean();
    $roster = json_decode((string) $rosterJson, true);
    $title = is_array($roster) ? trim((string) ($roster['stream_title'] ?? '')) : '';
    if ($title === '') {
        return ['ok' => false, 'error' => 'missing_roster_title'];
    }

    $list = youtube_list_broadcasts();
    if (empty($list['ok'])) {
        return $list;
    }
    $broadcast = youtube_pick_broadcast($list['items'] ?? []);
    if (!$broadcast) {
        return ['ok' => false, 'error' => 'broadcast_not_found', 'title' => $title, 'auth_url' => youtube_auth_start_url()];
    }

    $update = youtube_update_broadcast_title((string) $broadcast['id'], $title);
    if (empty($update['ok'])) {
        return $update;
    }
    return ['ok' => true, 'title' => $title, 'broadcast_id' => (string) $broadcast['id'], 'old_title' => (string) ($broadcast['snippet']['title'] ?? '')];
}

function youtube_prepare_obs_stream(): array
{
    $titleResult = youtube_sync_roster_title();
    if (empty($titleResult['ok'])) {
        return $titleResult;
    }

    $list = youtube_list_broadcasts();
    if (empty($list['ok'])) {
        return $list;
    }
    $broadcast = youtube_pick_broadcast($list['items'] ?? []);
    if (!$broadcast) {
        return ['ok' => false, 'error' => 'broadcast_not_found', 'auth_url' => youtube_auth_start_url()];
    }

    $broadcastId = (string) ($broadcast['id'] ?? '');
    $boundStreamId = (string) ($broadcast['contentDetails']['boundStreamId'] ?? '');
    $stream = null;

    if ($boundStreamId !== '') {
        $bound = youtube_list_streams($boundStreamId);
        if (!empty($bound['ok']) && !empty($bound['items'][0]) && is_array($bound['items'][0])) {
            $stream = $bound['items'][0];
        }
    }

    if (!is_array($stream)) {
        $streams = youtube_list_streams();
        if (empty($streams['ok'])) {
            return $streams;
        }
        $stream = youtube_pick_stream($streams['items'] ?? []);
        if (!$stream) {
            return ['ok' => false, 'error' => 'stream_not_found', 'title' => $titleResult['title'] ?? '', 'auth_url' => youtube_auth_start_url()];
        }
        $streamId = (string) ($stream['id'] ?? '');
        if ($streamId !== '') {
            $bind = youtube_bind_broadcast_to_stream($broadcastId, $streamId);
            if (empty($bind['ok'])) {
                return $bind + ['title' => $titleResult['title'] ?? '', 'broadcast_id' => $broadcastId, 'stream_id' => $streamId];
            }
        }
    }

    $ing = is_array($stream['cdn']['ingestionInfo'] ?? null) ? $stream['cdn']['ingestionInfo'] : [];
    $server = trim((string) ($ing['ingestionAddress'] ?? ''));
    $key = trim((string) ($ing['streamName'] ?? ''));
    if ($server === '' || $key === '') {
        return ['ok' => false, 'error' => 'missing_ingestion_info', 'title' => $titleResult['title'] ?? '', 'broadcast_id' => $broadcastId, 'stream_id' => (string) ($stream['id'] ?? ''), 'auth_url' => youtube_auth_start_url()];
    }

    return [
        'ok' => true,
        'title' => $titleResult['title'] ?? '',
        'broadcast_id' => $broadcastId,
        'stream_id' => (string) ($stream['id'] ?? ''),
        'server' => $server,
        'key' => $key,
    ];
}
