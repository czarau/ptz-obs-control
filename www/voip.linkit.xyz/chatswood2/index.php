<?php
  // chatswood2 — LiveStream Console
  // React prototype rewrite. Shares settings + backend endpoints with ../chatswood/.

  $dataDir = __DIR__ . '/../chatswood/.data';
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
  <link rel="stylesheet" href="styles.css?v=1"/>
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
      thumbEndpoint:    "../chatswood/control_thumb.php",
      smartEndpoint:    "../chatswood/index.php"
    };
  </script>

  <script src="../chatswood/js/obs-websocket.js"></script>
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin></script>

  <script src="obs-client.js"></script>
  <script type="text/babel" src="thumbs.jsx"></script>
  <script type="text/babel" src="left-rail.jsx"></script>
  <script type="text/babel" src="preset-grid.jsx"></script>
  <script type="text/babel" src="live-feeds.jsx"></script>
  <script type="text/babel" src="topbar.jsx"></script>
  <script type="text/babel" src="app.jsx"></script>
</body>
</html>
