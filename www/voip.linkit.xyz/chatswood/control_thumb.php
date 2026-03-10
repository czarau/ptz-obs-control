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

    $ip = GetCameraIP($cam);
    $json = shell_exec("python3.9 \"".__dir__."/python/cam_control.py\" --ip=".escapeshellarg($ip));
    echo $json;
  }
  elseif ($_GET['cmd'] == 'goto')
  {
    // https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=goto&camera=1&val=100
    $cam = $_GET['camera'];
    $val = $_GET['val'];

    if (!is_numeric($cam) || !is_numeric($val))
      die;

    $ip = GetCameraIP($cam);
    $json = shell_exec("python3.9 \"".__dir__."/python/cam_control.py\" --ip=".escapeshellarg($ip)." --cmd=goto --val=".escapeshellarg($val));
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

    $ip = GetCameraIP($cam);
    $json = shell_exec("python3.9 \"".__dir__."/python/cam_control.py\" --ip=".escapeshellarg($ip)." --cmd=goto --val=".escapeshellarg($val));
    echo $json;
  }     
  
?>