<?php
  // chatswood/v2 — LiveStream Console
  // React prototype rewrite. Shares settings + backend endpoints with parent chatswood/.

  // Cache-buster for all local JS/JSX/CSS assets. Browsers aggressively cache
  // .jsx files (Babel-compiled inline) and without a query string you end up
  // running stale code indefinitely — e.g. a preset-grid missing the
  // goto_abs path keeps firing poscall on a firmware-wiped camera. Bump this
  // whenever you ship a change to any asset in this directory.
  $ASSET_VER = '17';

  $dataDir = __DIR__ . '/../.data';
  $user = (isset($_GET['id']) && $_GET['id'] === 'shccc') ? 'shccc' : 'chatswood';

  if ($user === 'shccc') {
    $WebOBS_IP_Addr  = 'ws://10.241.57.96:4455';
    $WebOBS_Password = 'XXXXX';
    $settingsFile    = "$dataDir/settings-shccc.json";
  } else {
    $WebOBS_IP_Addr  = 'wss://srv-syd05.chatswoodchurch.org:4444';
    $WebOBS_Password = 'XXXXX';
    $settingsFile    = "$dataDir/settings.json";
  }

  $settings = file_exists($settingsFile)
    ? json_decode(file_get_contents($settingsFile), true)
    : ['preset_start_index' => 100, 'preset_admin_index' => 150, 'presets' => []];

  // Default column layout — matches slots 0-23 for categories, 24-31 for
  // the auto queue. Override by adding a "buckets" / "queue_slots" section
  // to .data/settings.json (or settings-shccc.json).
  $defaultBuckets = [
    ['key' => 'speaker',  'title' => 'Speaker',      'slots' => [0, 1, 2, 3],                         'cols' => 1, 'span' => 1],
    ['key' => 'piano',    'title' => 'Piano',        'slots' => [4, 5, 6, 7, 8, 9, 10, 11],           'cols' => 2, 'span' => 2],
    ['key' => 'singers',  'title' => 'Singers',      'slots' => [12, 13, 14, 15],                     'cols' => 1, 'span' => 1],
    ['key' => 'cong',     'title' => 'Congregation', 'slots' => [16, 17, 18, 19],                     'cols' => 1, 'span' => 1],
    ['key' => 'custom',   'title' => 'Custom',       'slots' => [20, 21, 22, 23],                     'cols' => 1, 'span' => 1],
  ];
  $buckets     = $settings['buckets']     ?? $defaultBuckets;
  $queueSlots  = $settings['queue_slots'] ?? [24, 25, 26, 27, 28, 29, 30, 31];
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>LiveStream — Church Broadcast Console</title>
  <meta name="viewport" content="width=1440"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="styles.css?v=<?= $ASSET_VER ?>"/>
</head>
<body>
  <div id="root"></div>

  <script>
    window.LS_CONFIG = {
      user:             <?= json_encode($user) ?>,
      obsAddr:          <?= json_encode($WebOBS_IP_Addr) ?>,
      obsPassword:      <?= json_encode($WebOBS_Password) ?>,
      presetStartIndex: <?= (int)($settings['preset_start_index'] ?? 100) ?>,
      presetAdminIndex: <?= (int)($settings['preset_admin_index'] ?? 150) ?>,
      presets:          <?= json_encode($settings['presets'] ?? []) ?>,
      home:             <?= json_encode($settings['home'] ?? (object)[]) ?>,
      buckets:          <?= json_encode($buckets) ?>,
      queueSlots:       <?= json_encode($queueSlots) ?>,
      thumbEndpoint:    "../control_thumb.php",
      smartEndpoint:    "../index.php",
      webrtcStreams: {
        back:  "https://srv-syd05.chatswoodchurch.org/go2rtc/api/webrtc?src=camera1",
        left:  "https://srv-syd05.chatswoodchurch.org/go2rtc/api/webrtc?src=camera2",
        right: "https://srv-syd05.chatswoodchurch.org/go2rtc/api/webrtc?src=camera3",
        data:  "https://srv-syd05.chatswoodchurch.org/go2rtc/api/webrtc?src=usb_hdmi_720p"
      }
    };
  </script>

  <script src="../js/obs-websocket.js"></script>
  <script src="webrtc-client.js?v=<?= $ASSET_VER ?>"></script>
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin></script>

  <script src="activity-log.js?v=<?= $ASSET_VER ?>"></script>
  <script src="obs-client.js?v=<?= $ASSET_VER ?>"></script>
  <script src="obs-meters.js?v=<?= $ASSET_VER ?>"></script>
  <script src="ptz-state.js?v=<?= $ASSET_VER ?>"></script>
  <script type="text/babel" src="thumbs.jsx?v=<?= $ASSET_VER ?>"></script>
  <script type="text/babel" src="context-menu.jsx?v=<?= $ASSET_VER ?>"></script>
  <script type="text/babel" src="left-rail.jsx?v=<?= $ASSET_VER ?>"></script>
  <script type="text/babel" src="preset-grid.jsx?v=<?= $ASSET_VER ?>"></script>
  <script type="text/babel" src="live-feeds.jsx?v=<?= $ASSET_VER ?>"></script>
  <script type="text/babel" src="topbar.jsx?v=<?= $ASSET_VER ?>"></script>
  <script type="text/babel" src="activity-panel.jsx?v=<?= $ASSET_VER ?>"></script>
  <script type="text/babel" src="app.jsx?v=<?= $ASSET_VER ?>"></script>
</body>
</html>
