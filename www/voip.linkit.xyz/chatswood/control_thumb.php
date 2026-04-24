<?php
  $cmp_url = 'http://10.241.57.96:8811';

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
    file_get_contents(GetCameraURL(1).'/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300');
    file_get_contents(GetCameraURL(2).'/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300');
    file_get_contents(GetCameraURL(3).'/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300');
  }
  elseif ($_GET['cmd'] == 'thumb')
  {
    // https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=thumb&camera=3&id=0&ts=0
    // http://10.241.57.96:8806

    $cam = $_GET['camera'];
    $id = $_GET['id'];
    $d = date_create()->getTimestamp();
    
    if (!is_numeric($id))
      die;
    
    $cam_url = GetCameraURL($cam);
    $jpg = file_get_contents($cam_url."/action_snapshot?".$d);
    
    header('Content-Type: image/jpeg');
    if (strlen($jpg) > 0)
    {
      file_put_contents("thumbs/{$id}.jpg", $jpg);
      echo $jpg;
    }
    else
      echo file_get_contents("thumbs/_blank.jpg");
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
    // https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=ptz&camera=3
    $cam = $_GET['camera'];

    if (!is_numeric($cam))
      die;

    header('Content-Type: application/json');
    $visca = GetCameraVISCA($cam);
    if (!$visca) { echo json_encode(['error' => 'unknown camera']); die; }
    $cmd = sprintf(
      "python3.9 %s --ip=%s --port=%s 2>&1",
      escapeshellarg(__dir__."/python/cam_control.py"),
      escapeshellarg($visca[0]),
      escapeshellarg((string)$visca[1])
    );
    $raw = shell_exec($cmd);
    $trimmed = trim($raw ?? '');
    $probe = json_decode($trimmed, true);
    if ($probe !== null) {
      echo $trimmed;
    } else {
      echo json_encode(['error' => 'cam_control.py failed', 'stderr' => $trimmed]);
    }
  }
  elseif ($_GET['cmd'] == 'goto')
  {
    // https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=goto&camera=1&val=100
    $cam = $_GET['camera'];
    $val = $_GET['val'];

    if (!is_numeric($cam) || !is_numeric($val))
      die;

    $visca = GetCameraVISCA($cam);
    if (!$visca) die;
    $json = shell_exec(sprintf(
      "python3.9 %s --ip=%s --port=%s --cmd=goto --val=%s",
      escapeshellarg(__dir__."/python/cam_control.py"),
      escapeshellarg($visca[0]),
      escapeshellarg((string)$visca[1]),
      escapeshellarg($val)
    ));
    echo $json;
  }
  elseif ($_GET['cmd'] == 'focus_auto' || $_GET['cmd'] == 'focus_manual' || $_GET['cmd'] == 'focus_onepush')
  {
    // https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=focus_auto&camera=1
    $cam = $_GET['camera'];
    if (!is_numeric($cam)) die;

    $visca = GetCameraVISCA($cam);
    if (!$visca) die;

    header('Content-Type: application/json');
    $json = shell_exec(sprintf(
      "python3.9 %s --ip=%s --port=%s --cmd=%s 2>&1",
      escapeshellarg(__dir__."/python/cam_control.py"),
      escapeshellarg($visca[0]),
      escapeshellarg((string)$visca[1]),
      escapeshellarg($_GET['cmd'])
    ));
    echo $json;
  }
  elseif ($_GET['cmd'] == 'preset_speed')
  {
    //1..24
    // https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=preset_speed&camera=1&val=18
    $cam = $_GET['camera'];
    $val = $_GET['val'];

    if (!is_numeric($cam) || !is_numeric($val))
      die;

    $visca = GetCameraVISCA($cam);
    if (!$visca) die;
    $json = shell_exec(sprintf(
      "python3.9 %s --ip=%s --port=%s --cmd=preset_speed --val=%s",
      escapeshellarg(__dir__."/python/cam_control.py"),
      escapeshellarg($visca[0]),
      escapeshellarg((string)$visca[1]),
      escapeshellarg($val)
    ));
    echo $json;
  }     
  
?>