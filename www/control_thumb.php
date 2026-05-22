<?php
  // VISCA-over-TCP class. Replaces the python/cam_control.py shell-out path
  // for cmd=ptz / goto / goto_abs / focus_* / preset_speed below — saves the
  // ~100 ms Python interpreter cold start per call and keeps everything in
  // one language. cam_control.py stays in the repo for reference.
  require_once __DIR__ . '/visca.php';

  // PTZOptics Camera Management Platform (CMP v1) — /cgi-bin/setAutoTracking/{0|1}.
  // The old 10.241.57.96:8811 entry pointed at a no-longer-reachable portproxy;
  // CMP is on the same 192.168.0.0/24 subnet as the cameras and is proxied by
  // the nginx 8810 server block.
  $cmp_url = 'http://192.168.0.139:8810';

  function GetCameraIP($cam)
  {
    //netsh interface portproxy show all
    if ($cam == 2)
      return '10.241.57.202';
    elseif ($cam == 3)
      return '10.241.57.203';
    else
      return '10.241.57.201';
  }

  // VISCA-over-TCP on port 5678 of each camera. Cameras are on the local
  // 192.168.0.0/24 subnet that srv-syd05 is also on (nginx config proxies
  // 192.168.0.201..203 on :80 via listen ports 8806..8808). The old PHP
  // here pointed at 10.241.57.20X which wasn't reachable — hence the
  // "No route to host" errors before.
  function GetCameraVISCA($cam)
  {
    switch ((int)$cam) {
      case 1: return ['192.168.0.201', 5678];
      case 2: return ['192.168.0.202', 5678];
      case 3: return ['192.168.0.203', 5678];
    }
    return null;
  }

  // PTZOptics firmware 6.3.45+ requires digest auth on every /cgi-bin/ and
  // /action_snapshot call. Default factory creds are admin:admin.
  define('CAM_USER', 'admin');
  define('CAM_PASS', 'admin');

  // Curl wrapper with digest auth. Returns [body, http_code].
  function CameraHttpGet($url, $timeout = 5)
  {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPAUTH,       CURLAUTH_DIGEST);
    curl_setopt($ch, CURLOPT_USERPWD,        CAM_USER . ':' . CAM_PASS);
    curl_setopt($ch, CURLOPT_TIMEOUT,        $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$body, $code];
  }

  function GetCameraURL($cam)
  { 
    //netsh interface portproxy show all
    /*
    if ($cam == 2)
      return 'http://10.241.57.202:80';
    else if ($cam == 3)
      return 'http://10.241.57.203:80';
    else
      return 'http://10.241.57.201:80';
   */    

    if ($cam == 2)
      return 'https://srv-syd05.chatswoodchurch.org:8807';
    else if ($cam == 3)
      return 'https://srv-syd05.chatswoodchurch.org:8808';
    else
      return 'https://srv-syd05.chatswoodchurch.org:8806';
  }
  
  if ($_GET['cmd'] == 'init')
  {
    CameraHttpGet(GetCameraURL(1).'/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300');
    CameraHttpGet(GetCameraURL(2).'/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300');
    CameraHttpGet(GetCameraURL(3).'/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300');
  }
  elseif ($_GET['cmd'] == 'thumb')
  {
    // https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=thumb&camera=3&id=0&ts=0
    $cam = $_GET['camera'];
    $id  = $_GET['id'];
    $d   = date_create()->getTimestamp();

    if (!is_numeric($id)) die;

    list($jpg, $code) = CameraHttpGet(GetCameraURL($cam)."/action_snapshot?".$d);

    header('Content-Type: image/jpeg');
    if ($code === 200 && strlen($jpg) > 0) {
      file_put_contents("thumbs/{$id}.jpg", $jpg);
      echo $jpg;
    } else {
      echo file_get_contents("thumbs/_blank.jpg");
    }
  }
  elseif ($_GET['cmd'] == 'copy_thumb')
  {
    // Duplicate a cached thumbnail from one preset slot to another, so a
    // preset-to-preset drag can mirror the source's image instantly without
    // a camera round-trip. Paths are whitelisted to numeric filenames under
    // thumbs/ — never follow attacker-supplied paths.
    //   ?cmd=copy_thumb&from=120&to=105
    $from = $_GET['from'] ?? '';
    $to   = $_GET['to']   ?? '';
    if (!preg_match('/^\d+$/', $from) || !preg_match('/^\d+$/', $to)) {
      http_response_code(400);
      echo json_encode(['error' => 'from/to must be numeric preset IDs']);
      die;
    }
    $src = __DIR__ . "/thumbs/{$from}.jpg";
    $dst = __DIR__ . "/thumbs/{$to}.jpg";
    header('Content-Type: application/json');
    if (!is_file($src)) {
      echo json_encode(['error' => "source thumb {$from}.jpg does not exist"]);
      die;
    }
    if (!@copy($src, $dst)) {
      echo json_encode(['error' => "copy failed: {$from} → {$to}"]);
      die;
    }
    echo json_encode(['ok' => true, 'from' => (int)$from, 'to' => (int)$to]);
  }
  elseif ($_GET['cmd'] == 'cgi')
  {
    // Browser-friendly passthrough for the camera's /cgi-bin/ptzctrl.cgi
    // and similar endpoints. Required since firmware 6.3.45 added digest
    // auth that we can't easily do from the browser directly.
    //   ?cmd=cgi&camera=1&q=ptzcmd&left&10&10
    //   ?cmd=cgi&camera=2&q=ptzcmd&poscall&105
    $cam = (int)$_GET['camera'];
    if ($cam < 1 || $cam > 3) { http_response_code(400); die; }
    $q = isset($_GET['q']) ? (string)$_GET['q'] : '';
    // Pass through any extra query fragments appended after "q" as-is.
    $qs = [];
    foreach ($_GET as $k => $v) {
      if ($k === 'cmd' || $k === 'camera' || $k === 'q' || $k === 'ts') continue;
      // PHP already URL-decoded these — preserve them by re-encoding.
      $qs[] = (is_numeric($k) ? (string)$k : rawurlencode($k))
        . ($v === '' ? '' : '=' . rawurlencode((string)$v));
    }
    $full = GetCameraURL($cam) . '/cgi-bin/ptzctrl.cgi?' . $q
          . (count($qs) ? '&' . implode('&', $qs) : '');
    list($body, $code) = CameraHttpGet($full, 3);
    header('Content-Type: application/json');
    if ($code === 200) echo $body;
    else echo json_encode(['error' => 'camera returned '.$code, 'url' => $full]);
  }
  elseif ($_GET['cmd'] == 'set_preset')
  {
    if ($_GET['user'] == 'shccc')
      $settingsfile = ".data/settings-shccc.json";
    else
      $settingsfile = ".data/settings.json";
    
    $settings = json_decode(file_get_contents($settingsfile), true);
    $preset = array();
    
    if (isset($_GET['admin']) and $_GET['admin'] == 1) 
    {
      if (isset($settings['presets_admin'][$_GET['id']]))
        $preset = $settings['presets_admin'][$_GET['id']];
    }
    else
    {
      if (isset($settings['presets'][$_GET['id']]))
        $preset = $settings['presets'][$_GET['id']];
    }
    
    $preset['camera'] = $_GET['camera'];

    if (isset($_GET['label']))
      $preset['label'] = $_GET['label'];

    if (isset($_GET['timeout']))
      $preset['timeout'] = $_GET['timeout'];

    // Absolute VISCA pan/tilt/zoom/focus values — the preset's position is
    // stored in JSON rather than the camera's onboard preset slot, so firmware
    // wipes / factory resets / cross-camera mirroring don't lose the data.
    foreach (['pan', 'tilt', 'zoom', 'focus'] as $k) {
      if (isset($_GET[$k]) && is_numeric($_GET[$k])) {
        $preset[$k] = (int)$_GET[$k];
      }
    }
    
    if (isset($_GET['admin']) and $_GET['admin'] == 1) 
    {
      $settings['presets_admin'][$_GET['id']] = $preset;
      ksort($settings['presets_admin']);
    }
    else
    {
      $settings['presets'][$_GET['id']] = $preset;
      ksort($settings['presets']);
    }
  
    $json = json_encode($settings, JSON_PRETTY_PRINT);
    file_put_contents($settingsfile, $json); 
  }
  elseif ($_GET['cmd'] == 'get_preset')
  {
    if ($_GET['user'] == 'shccc')
      $settingsfile = ".data/settings-shccc.json";
    else
      $settingsfile = ".data/settings.json";

    $settings = json_decode(file_get_contents($settingsfile), true);
    $preset = array();

    if (isset($_GET['admin']) and $_GET['admin'] == 1)
    {
      if (isset($settings['presets_admin'][$_GET['id']]))
        $preset = $settings['presets_admin'][$_GET['id']];
    }
    else
    {
      if (isset($settings['presets'][$_GET['id']]))
        $preset = $settings['presets'][$_GET['id']];
    }

    echo json_encode($preset);
  }
  elseif ($_GET['cmd'] == 'set_home_abs')
  {
    // Save the camera's current absolute pan/tilt/zoom/focus as that
    // camera's home position. Right-clicking the HOME joystick button
    // captures the current PTZ values and posts them here. The HOME
    // button's onClick reads home_abs and falls back to the factory home
    // CGI when no entry exists.
    //   ?cmd=set_home_abs&user=<id>&camera=<n>&pan=&tilt=&zoom=&focus=
    $settingsfile = ($_GET['user'] == 'shccc')
      ? ".data/settings-shccc.json"
      : ".data/settings.json";

    if (!is_numeric($_GET['camera'])) die;
    $cam = (string)((int)$_GET['camera']);

    $settings = json_decode(file_get_contents($settingsfile), true) ?: [];
    if (!isset($settings['home_abs']) || !is_array($settings['home_abs'])) {
      $settings['home_abs'] = [];
    }
    $entry = $settings['home_abs'][$cam] ?? [];
    foreach (['pan', 'tilt', 'zoom', 'focus'] as $k) {
      if (isset($_GET[$k]) && is_numeric($_GET[$k])) {
        $entry[$k] = (int)$_GET[$k];
      }
    }
    if (!isset($entry['pan']) || !isset($entry['tilt'])) {
      header('Content-Type: application/json');
      http_response_code(400);
      echo json_encode(['error' => 'pan and tilt required']);
      die;
    }
    $settings['home_abs'][$cam] = $entry;

    $json = json_encode($settings, JSON_PRETTY_PRINT);
    file_put_contents($settingsfile, $json);
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'home_abs' => $settings['home_abs']]);
  }
  elseif ($_GET['cmd'] == 'save_thumb')
  {
    // Accept a JPEG body (POST) and store it at thumbs/{id}.jpg. Used by
    // the browser to push an instantly-captured WebRTC video frame into
    // the server-side thumb cache before the camera is sent elsewhere —
    // no camera round-trip, no race with the concurrent move command.
    //   POST /control_thumb.php?cmd=save_thumb&id=<presetId>
    //   body: raw image/jpeg bytes
    $id = $_GET['id'] ?? '';
    if (!is_numeric($id)) { http_response_code(400); die; }
    $body = file_get_contents('php://input');
    if ($body === false || strlen($body) < 500) { http_response_code(400); die; }
    file_put_contents("thumbs/{$id}.jpg", $body);
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'id' => (int)$id, 'bytes' => strlen($body)]);
  }
  elseif ($_GET['cmd'] == 'thumb_cache')
  {
    // https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=thumb_cache&id=100&ts=0

    $id = $_GET['id'];

    if (!is_numeric($id))
      die;

    header('Content-Type: image/jpeg');
    if (!file_exists("thumbs/{$id}.jpg") or filesize("thumbs/{$id}.jpg") == 0)
    {
      $jpg = file_get_contents("thumbs/_blank.jpg");
      echo $jpg;
      exit;
    }

    $jpg = file_get_contents("thumbs/{$id}.jpg");
    echo $jpg;
  }
  elseif ($_GET['cmd'] == 'face')
  {
    // netstat -ano
    // netsh interface portproxy show all
    // netsh interface portproxy add v4tov4 listenport=8811 listenaddress=0.0.0.0 connectport=8810 connectaddress=192.168.0.139 protocol=tcp
    // https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=face&camera=1&pos=0

    $cam = $_GET['camera'];
    $pos = $_GET['pos'];

    if (!is_numeric($cam))
      die;

    if ($pos == 1)
      $json = file_get_contents($cmp_url.'/cgi-bin/setAutoTracking/1');
    else
      $json = file_get_contents($cmp_url.'/cgi-bin/setAutoTracking/0');
    echo $json;
  }
  elseif ($_GET['cmd'] == 'ptz')
  {
    // Inquiry: read pan/tilt/zoom/focus from the camera over VISCA.
    //   ?cmd=ptz&camera=N
    $cam = $_GET['camera'];
    if (!is_numeric($cam)) die;

    header('Content-Type: application/json');
    $visca = GetCameraVISCA($cam);
    if (!$visca) { echo json_encode(['error' => 'unknown camera']); die; }

    echo json_encode(visca_run($visca, function (Visca $v) use ($visca) {
      return ['camera' => $visca[0]] + $v->getAllPositions();
    }));
  }
  elseif ($_GET['cmd'] == 'goto')
  {
    // Recall an onboard preset slot (legacy path — still useful on cameras
    // whose slots haven't been wiped by a firmware upgrade).
    //   ?cmd=goto&camera=N&val=100
    $cam = $_GET['camera'];
    $val = $_GET['val'];
    if (!is_numeric($cam) || !is_numeric($val)) die;

    $visca = GetCameraVISCA($cam);
    if (!$visca) die;

    header('Content-Type: application/json');
    echo json_encode(visca_run($visca, function (Visca $v) use ($val, $visca) {
      $r = $v->recallPreset((int)$val);
      return ['camera' => $visca[0], 'response' => visca_jsonable($r)] + $v->getAllPositions();
    }));
  }
  elseif ($_GET['cmd'] == 'focus_auto' || $_GET['cmd'] == 'focus_manual' || $_GET['cmd'] == 'focus_onepush')
  {
    // Focus mode / one-push AF via VISCA (PTZOptics 30X NDI's HTTP CGI
    // doesn't expose these — only movement commands).
    //   ?cmd=focus_auto&camera=N    — continuous autofocus
    //   ?cmd=focus_manual&camera=N  — manual focus (NEAR/FAR then holds)
    //   ?cmd=focus_onepush&camera=N — one-push AF trigger
    $cam = $_GET['camera'];
    if (!is_numeric($cam)) die;
    $visca = GetCameraVISCA($cam);
    if (!$visca) die;

    $which = $_GET['cmd'];
    header('Content-Type: application/json');
    echo json_encode(visca_run($visca, function (Visca $v) use ($which, $visca) {
      switch ($which) {
        case 'focus_auto':    $r = $v->setFocusAuto();    break;
        case 'focus_manual':  $r = $v->setFocusManual();  break;
        case 'focus_onepush': $r = $v->focusOnePush();    break;
        default:              $r = null;                  break;
      }
      return ['camera' => $visca[0], 'response' => visca_jsonable($r)] + $v->getAllPositions();
    }));
  }
  elseif ($_GET['cmd'] == 'goto_abs')
  {
    // Drive the camera to an absolute pan/tilt/zoom/focus position read
    // from the preset JSON (not an onboard preset slot). Immune to firmware
    // preset wipes. Each axis omitted from the query is left untouched.
    //   ?cmd=goto_abs&camera=N&pan=-107&tilt=36&zoom=7791&focus=974
    //
    // Per-axis responses are returned in `steps` so the JS activity log can
    // pinpoint a rejected axis (e.g. focus-direct with the camera in AF
    // returns ERROR_41 = "Command Not Executable"). Focus mode is queried
    // first, forced to MF for the focus-direct command, then restored to
    // AF if the camera was in AF — same behaviour cam_control.py had.
    $cam = $_GET['camera'];
    if (!is_numeric($cam)) die;
    $visca = GetCameraVISCA($cam);
    if (!$visca) die;

    $axes = [];
    foreach (['pan', 'tilt', 'zoom', 'focus'] as $k) {
      if (isset($_GET[$k]) && preg_match('/^-?\d+$/', $_GET[$k])) {
        $axes[$k] = (int)$_GET[$k];
      }
    }

    header('Content-Type: application/json');
    echo json_encode(visca_run($visca, function (Visca $v) use ($axes, $visca) {
      $steps           = [];
      $response        = null;
      $focusPriorMode  = null;

      if (isset($axes['pan']) && isset($axes['tilt'])) {
        $r = $v->setPanTiltPosition($axes['pan'], $axes['tilt']);
        $steps[] = ['axis' => 'pantilt', 'response' => visca_jsonable($r)];
        $response = $r;
      }
      if (isset($axes['zoom'])) {
        $r = $v->setZoomPosition($axes['zoom']);
        $steps[] = ['axis' => 'zoom', 'response' => visca_jsonable($r)];
        $response = $r;
      }
      if (isset($axes['focus'])) {
        // VISCA 04 48 (Focus Direct) only executes in manual-focus mode.
        // Save the prior mode, force MF for the direct command, restore
        // AF if the camera was in AF — no silent mode-swap. The prior
        // mode is a query result (auto|manual|unknown) and lives at the
        // top level so the "all steps must be COMPLETE" check upstream
        // doesn't flag it as a failure.
        $prior = $v->getFocusMode();
        $focusPriorMode = $prior;

        $r_mf = $v->setFocusManual();
        $steps[] = ['axis' => 'focus_mode_mf', 'response' => visca_jsonable($r_mf)];

        $r = $v->setFocusPosition($axes['focus']);
        $steps[] = ['axis' => 'focus', 'response' => visca_jsonable($r)];
        $response = $r;

        if ($prior === 'auto') {
          $r_af = $v->setFocusAuto();
          $steps[] = ['axis' => 'focus_mode_restore', 'response' => visca_jsonable($r_af)];
        }
      }

      $out = ['camera' => $visca[0]] + $v->getAllPositions();
      if ($response !== null)        $out['response']          = visca_jsonable($response);
      if ($steps)                    $out['steps']             = $steps;
      if ($focusPriorMode !== null)  $out['focus_prior_mode']  = $focusPriorMode;
      return $out;
    }));
  }
  elseif ($_GET['cmd'] == 'preset_speed')
  {
    // Set onboard preset recall speed (1..24).
    //   ?cmd=preset_speed&camera=N&val=18
    $cam = $_GET['camera'];
    $val = $_GET['val'];
    if (!is_numeric($cam) || !is_numeric($val)) die;
    $visca = GetCameraVISCA($cam);
    if (!$visca) die;

    header('Content-Type: application/json');
    echo json_encode(visca_run($visca, function (Visca $v) use ($val, $visca) {
      $r = $v->setPresetSpeed((int)$val);
      return ['camera' => $visca[0], 'response' => visca_jsonable($r)] + $v->getAllPositions();
    }));
  }
  
?>