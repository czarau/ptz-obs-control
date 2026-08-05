<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$url_base   = 'https://docs.google.com/spreadsheets/d/XXXXXXX/gviz/tq?tqx=out:csv&sheet=';
$url_conf   = $url_base . 'AUTOMATION';
$url_active = '';

function clean_text(?string $value): string {
  $value = trim((string)$value);
  $value = preg_replace('/\s+/u', ' ', $value);
  return trim($value);
}

function parse_sheet_date(string $raw, DateTimeZone $tz): ?DateTimeImmutable {
  $raw = clean_text($raw);
  if ($raw === '') return null;

  $formats = [
    '!j M Y', '!j M y',
    '!d M Y', '!d M y',
    '!j F Y', '!d F Y',
    '!Y-m-d', '!d/m/Y', '!d-m-Y',
  ];
  foreach ($formats as $fmt) {
    $dt = DateTimeImmutable::createFromFormat($fmt, $raw, $tz);
    if ($dt instanceof DateTimeImmutable) {
      $err = DateTimeImmutable::getLastErrors();
      if (($err['warning_count'] ?? 0) === 0 && ($err['error_count'] ?? 0) === 0) {
        return $dt->setTime(0, 0, 0);
      }
    }
  }

  $ts = strtotime($raw);
  if ($ts !== false) {
    return (new DateTimeImmutable('@' . $ts))->setTimezone($tz)->setTime(0, 0, 0);
  }
  return null;
}

function row_value(array $row, int $idx): string {
  return isset($row[$idx]) ? clean_text($row[$idx]) : '';
}

$tz = new DateTimeZone('Australia/Sydney');
$today = new DateTimeImmutable('today', $tz);

if (($handle = fopen($url_conf, 'r')) !== false) {
  while (($row = fgetcsv($handle)) !== false) {
    if (count($row) >= 2 && trim((string)$row[0]) === 'ACTIVE_SHEET') {
      $url_active = $url_base . urlencode((string)$row[1]);
      $active_sheet = clean_text((string)$row[1]);
      break;
    }
  }
  fclose($handle);
}

if ($url_active === '') {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Active sheet not found'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
  exit;
}

$rows = [];
if (($handle = fopen($url_active, 'r')) !== false) {
  $row_num = 0;
  while (($row = fgetcsv($handle)) !== false) {
    $row_num++;
    if ($row_num < 4 || count($row) < 11) continue;

    $date = parse_sheet_date((string)$row[0], $tz);
    if (!$date) continue;

    $rows[] = [
      'date' => $date,
      'date_raw' => clean_text((string)$row[0]),
      'host' => row_value($row, 1),
      'coordinator' => row_value($row, 8),
      'musician' => row_value($row, 9),
      'preacher' => row_value($row, 10),
      'pa' => row_value($row, 11),
      'dp' => row_value($row, 12),
      'stream' => row_value($row, 13),
      'counter' => row_value($row, 14),
    ];
  }
  fclose($handle);
}

if (!$rows) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'No roster rows found'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
  exit;
}

usort($rows, function ($a, $b) {
  return $a['date'] <=> $b['date'];
});

$chosen = null;
foreach ($rows as $row) {
  if ($row['date'] >= $today) {
    $chosen = $row;
    break;
  }
}
if ($chosen === null) {
  $chosen = $rows[count($rows) - 1];
}

$preacher = clean_text($chosen['preacher']);
$date_label = $chosen['date']->format('j M Y');
$stream_title = sprintf('Chatswood Live Stream - %s (%s)', $preacher !== '' ? $preacher : 'TBA', $date_label);

$out = [
  'ok' => true,
  'active_sheet' => $active_sheet ?? '',
  'date' => $chosen['date']->format('Y-m-d'),
  'date_label' => $date_label,
  'preacher' => $preacher,
  'host' => $chosen['host'],
  'coordinator' => $chosen['coordinator'],
  'musician' => $chosen['musician'],
  'pa' => $chosen['pa'],
  'dp' => $chosen['dp'],
  'stream' => $chosen['stream'],
  'counter' => $chosen['counter'],
  'stream_title' => $stream_title,
  'service_label' => trim($preacher . ' · ' . $date_label),
];

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
