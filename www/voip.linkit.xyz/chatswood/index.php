<!DOCTYPE html>
<?php
  // Allow from any origin
  if (isset($_SERVER['HTTP_ORIGIN'])) {
      // Decide if the origin in $_SERVER['HTTP_ORIGIN'] is one
      // you want to allow, and if so:
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');    // cache for 1 day
  }
  
  // Access-Control headers are received during OPTIONS requests
  if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
      
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']))
        // may also be using PUT, PATCH, HEAD etc
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
      
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
  
    exit(0);
  }  
  
  if (isset($_GET['action']) and ($_GET['action'] == 'smartdevice'))
  {
    //$.get('https://sequematic.com/trigger-custom-webhook/A263C22047/111903/' + device + '/1');
    //$json = file_get_contents("https://sequematic.com/trigger-custom-webhook/A263C22047/111903/{$_GET['device']}/{$_GET[state]}");
    
    if ($_GET['device'] == "SPOTS" )
    {
      if ($_GET['state'] == 1)
        $json = file_get_contents("http://192.168.192.80:8123/api/webhook/CHURCH_SPOTS_ON");
      else
        $json = file_get_contents("http://192.168.192.80:8123/api/webhook/CHURCH_SPOTS_OFF");
    }
    elseif ($_GET['device'] == "STAGE" )
    {
      if ($_GET['state'] == 1)
        $json = file_get_contents("http://192.168.192.80:8123/api/webhook/CHURCH_STAGE_ON");
      else
        $json = file_get_contents("http://192.168.192.80:8123/api/webhook/CHURCH_STAGE_OFF");
    }
    elseif ($_GET['device'] == "FRONT")
    {
      if ($_GET['state'] == 1)
        $json = file_get_contents("http://192.168.192.80:8123/api/webhook/CHURCH_FRONT_ON");
      else
        $json = file_get_contents("http://192.168.192.80:8123/api/webhook/CHURCH_FRONT_OFF");
    }
    elseif ($_GET['device'] == "LG_LEFT")
    {
      if ($_GET['state'] == 1)
        $json = file_get_contents("http://10.241.143.134:8123/api/webhook/lg-panel-left-power-TnbcwYbTcEuZdSmqKU0Is-FP");
      else
        $json = file_get_contents("http://10.241.143.134:8123/api/webhook/lg-panel-left-power-TnbcwYbTcEuZdSmqKU0Is-FP");
    }
    elseif ($_GET['device'] == "LG_RIGHT")
    {
      if ($_GET['state'] == 1)
        $json = file_get_contents("http://10.241.143.134:8123/api/webhook/lg-panel-right-power-x5veUcCSqeq-q9wiHLBoFKkx");
      else
        $json = file_get_contents("http://10.241.143.134:8123/api/webhook/lg-panel-right-power-x5veUcCSqeq-q9wiHLBoFKkx");
    }    

    die; 
    
    //https://www.youtube.com/watch?v=_oSFbcmB2SQ
    //https://ewelink.cc/ewelink-cube/open-api/
  }

  if (isset($_GET['id']) and ($_GET['id'] == 'shccc'))
  {
    $WebOBS_IP_Addr = 'ws://10.241.57.96:4455';
    $WebOBS_Password = 'XXXXX';

    if (file_exists(".data/settings-shccc.json"))
      $settings = json_decode(file_get_contents(".data/settings-shccc.json"), true);
    else
    {
      $settings = array();
      $settings['preset_start_index'] = 20;
      $settings['preset_admin_index'] = 60;
      $settings['presets'] = array();
   
      $json = json_encode($settings, JSON_FORCE_OBJECT | JSON_PRETTY_PRINT);
      file_put_contents(".data/settings-shccc.json", $json);
    }    
  }   
  else
  {
    //$WebOBS_IP_Addr = 'ws://10.241.57.96:4444';
    $WebOBS_IP_Addr = 'wss://srv-syd05.chatswoodchurch.org:4444';
    $WebOBS_Password = 'XXXXX';
    
    if (file_exists(".data/settings.json"))
      $settings = json_decode(file_get_contents(".data/settings.json"), true);
    else
    {
      $settings = array();
      $settings['preset_start_index'] = 100;
      $settings['preset_admin_index'] = 150;
      $settings['presets'] = array();
   
      $json = json_encode($settings, JSON_FORCE_OBJECT | JSON_PRETTY_PRINT);
      file_put_contents(".data/settings.json", $json);
    }
  }
  
  function GetPresetCamera($preset)
  {
    global $settings;
    
    if (isset($settings['presets'][$preset]))
      return $settings['presets'][$preset]['camera'];
    
    return 1;
  }
  
  function GetPresetLabel($preset)
  {
    global $settings;
    
    if (isset($settings['presets'][$preset]))
      return $settings['presets'][$preset]['label'];
    
    return "Preset";
  }  
  
  function GetPresetTimeout($preset)
  {
    global $settings;
    
    if (isset($settings['presets'][$preset]) && isset($settings['presets'][$preset]['timeout']))
      return $settings['presets'][$preset]['timeout'];
    
    return 10;
  }
?>
<html lang="en">
<head>
<title>Chatswood LiveStream Control</title>

<script language="JavaScript" type="text/javascript" src="js/contextMenu/jquery-3.6.0.min.js"></script>

<link rel="stylesheet" href="js/jquery-ui/jquery-ui.min.css">
<script src="js/jquery-ui/jquery-ui.min.js"></script>

<script src="https://kit.fontawesome.com/c587fcfb76.js" crossorigin="anonymous"></script>

<!-- http://swisnl.github.io/jQuery-contextMenu/ -->
<link href="js/contextMenu/jquery.contextMenu.min.css" rel="stylesheet" type="text/css"/>
<script src="js/contextMenu/jquery.contextMenu.min.js" type="text/javascript"></script>
<script src="js/contextMenu/jquery.ui.position.min.js" type="text/javascript"></script>

<!-- http://www.umediaserver.net/umediaserver/rtsptowebsite.htm 
<script src="http://www.umediaserver.net/umediaserver/webrtcadapter.js"></script>
<script src="http://www.umediaserver.net/umediaserver/unrealwebrtcplayer.js"></script>
-->

<!--
<script src="js/webrtcadapter.js"></script>
<script src="js/unrealwebrtcplayer.js"></script>
-->

<script src="webrtc.js"></script>

<!--script type="text/javascript" src="obs-websocket.js"></script-->
<script type="text/javascript" src="js/obs-websocket.js"></script>
<link href="style_v2.css" rel="stylesheet" type="text/css"/>
</head>
<script type="text/javascript">
//var WebOBS_IP_Addr = '10.241.57.96:4444';

const WebOBS_IP_Addr = '<?php echo $WebOBS_IP_Addr; ?>';
const WebOBS_Password = '<?php echo $WebOBS_Password; ?>';
</script>
<script type="text/javascript" src="control_v2.js"></script>
<body>
<div style="width:1400px; margin:auto; left:0; right:0;">

<div id="admin_access" user="<?php if (isset($_GET['id'])) echo htmlspecialchars($_GET['id'], ENT_QUOTES, 'UTF-8'); else echo "chatswood"; ?>"><i class="fa-solid fa-unlock"></i></div>

<div class="camera_presets" style="margin:auto; left:0; right:0; text-align:center;">
  <div class="preset_column" style="display:inline-block; width:160px;">
    <div class="preset_title">Speaker</div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(0); ?>" preset=0 pos="<?php echo $settings['preset_start_index']+0; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(0); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(1); ?>" preset=1 pos="<?php echo $settings['preset_start_index']+1; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(1); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(2); ?>" preset=2 pos="<?php echo $settings['preset_start_index']+2; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(2); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(3); ?>" preset=3 pos="<?php echo $settings['preset_start_index']+3; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(3); ?></div></div>
  </div>
  
  <div class="preset_column" style="display:inline-block; width:320px;">
    <div class="preset_title">Piano</div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(4); ?>" preset=4 pos="<?php echo $settings['preset_start_index']+4; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(4); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(5); ?>" preset=5 pos="<?php echo $settings['preset_start_index']+5; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(5); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(6); ?>" preset=6 pos="<?php echo $settings['preset_start_index']+6; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(6); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(7); ?>" preset=7 pos="<?php echo $settings['preset_start_index']+7; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(7); ?></div></div>

    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(8); ?>" preset=8 pos="<?php echo $settings['preset_start_index']+8; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(8); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(9); ?>" preset=9 pos="<?php echo $settings['preset_start_index']+9; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(9); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(10); ?>" preset=10 pos="<?php echo $settings['preset_start_index']+10; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(10); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(11); ?>" preset=11 pos="<?php echo $settings['preset_start_index']+11; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(11); ?></div></div>
  </div>
  
  <div class="preset_column" style="display:inline-block; width:160px;">
    <div class="preset_title">Singers</div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(12); ?>" preset=12 pos="<?php echo $settings['preset_start_index']+12; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(12); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(13); ?>" preset=13 pos="<?php echo $settings['preset_start_index']+13; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(13); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(14); ?>" preset=14 pos="<?php echo $settings['preset_start_index']+14; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(14); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(15); ?>" preset=15 pos="<?php echo $settings['preset_start_index']+15; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(15); ?></div></div>
  </div>
  
  <div class="preset_column" style="display:inline-block; width:160px;">
    <div class="preset_title">Congregation</div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(16); ?>" preset=16 pos="<?php echo $settings['preset_start_index']+16; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(16); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(17); ?>" preset=17 pos="<?php echo $settings['preset_start_index']+17; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(17); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(18); ?>" preset=18 pos="<?php echo $settings['preset_start_index']+18; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(18); ?></div></div>
    <div class="camera_pos admin_access cam<?php echo GetPresetCamera(19); ?>" preset=19 pos="<?php echo $settings['preset_start_index']+19; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(19); ?></div></div>
  </div>
  
  <div class="preset_column" style="display:inline-block; width:160px;">
    <div class="preset_title">Custom</div>
    <div class="camera_pos user_access cam<?php echo GetPresetCamera(20); ?>" preset=20 pos="<?php echo $settings['preset_start_index']+20; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(20); ?></div></div>
    <div class="camera_pos user_access cam<?php echo GetPresetCamera(21); ?>" preset=21 pos="<?php echo $settings['preset_start_index']+21; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(21); ?></div></div>
    <div class="camera_pos user_access cam<?php echo GetPresetCamera(22); ?>" preset=22 pos="<?php echo $settings['preset_start_index']+22; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(22); ?></div></div>
    <div class="camera_pos user_access cam<?php echo GetPresetCamera(23); ?>" preset=23 pos="<?php echo $settings['preset_start_index']+23; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(23); ?></div></div>
  </div>
  
  <div class="preset_column" style="display:inline-block; width:320px;">
    <div class="preset_title">Auto Queue <div id="camera_auto" class="control_btn" style="display: inline-block; width: 60px;"><i class="fa-solid fa-repeat">A</i></div></div>
    <div class="camera_pos admin_access auto_queue cam<?php echo GetPresetCamera(24); ?>" preset=24 pos="<?php echo $settings['preset_start_index']+24; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(24); ?></div><div class="timeout"><?php echo GetPresetTimeout(24); ?></div></div>
    <div class="camera_pos admin_access auto_queue cam<?php echo GetPresetCamera(25); ?>" preset=25 pos="<?php echo $settings['preset_start_index']+25; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(25); ?></div><div class="timeout"><?php echo GetPresetTimeout(25); ?></div></div>
    <div class="camera_pos admin_access auto_queue cam<?php echo GetPresetCamera(26); ?>" preset=26 pos="<?php echo $settings['preset_start_index']+26; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(26); ?></div><div class="timeout"><?php echo GetPresetTimeout(26); ?></div></div>
    <div class="camera_pos admin_access auto_queue cam<?php echo GetPresetCamera(27); ?>" preset=27 pos="<?php echo $settings['preset_start_index']+27; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(27); ?></div><div class="timeout"><?php echo GetPresetTimeout(27); ?></div></div>
                                                                                                                                          
    <div class="camera_pos admin_access auto_queue cam<?php echo GetPresetCamera(28); ?>" preset=28 pos="<?php echo $settings['preset_start_index']+28; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(28); ?></div><div class="timeout"><?php echo GetPresetTimeout(28); ?></div></div>
    <div class="camera_pos admin_access auto_queue cam<?php echo GetPresetCamera(29); ?>" preset=29 pos="<?php echo $settings['preset_start_index']+29; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(29); ?></div><div class="timeout"><?php echo GetPresetTimeout(29); ?></div></div>
    <div class="camera_pos admin_access auto_queue cam<?php echo GetPresetCamera(30); ?>" preset=30 pos="<?php echo $settings['preset_start_index']+30; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(30); ?></div><div class="timeout"><?php echo GetPresetTimeout(30); ?></div></div>
    <div class="camera_pos admin_access auto_queue cam<?php echo GetPresetCamera(31); ?>" preset=31 pos="<?php echo $settings['preset_start_index']+31; ?>"><img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label"><?php echo GetPresetLabel(31); ?></div><div class="timeout"><?php echo GetPresetTimeout(31); ?></div></div>
  </div>  
</div>

<div class="smart_devices">LIGHTS
<div id="dev_spots" class="control_btn smart_device" device="SPOTS"><i class="fa-solid fa-lightbulb"></i> SPOTS </div>
<div id="dev_stage" class="control_btn smart_device" device="STAGE"><i class="fa-solid fa-lightbulb"></i> STAGE</div>
<div id="dev_front" class="control_btn smart_device" device="FRONT"><i class="fa-solid fa-lightbulb"></i> FRONT</div>

<!--div id="dev_tv_left" class="control_btn smart_device ifft_event" eventname="church_tv_left_on"><i class="fa-solid fa-tv"></i> TV LEFT</div-->
<!--div id="dev_tv_right" class="control_btn smart_device ifft_event" eventname="church_tv_right_on"><i class="fa-solid fa-tv"></i> TV RIGHT</div-->

<div id="dev_tv_left" class="control_btn smart_device" device="LG_LEFT"><i class="fa-solid fa-tv"></i> TV LEFT</div>
<div id="dev_tv_right" class="control_btn smart_device" device="LG_RIGHT"><i class="fa-solid fa-tv"></i> TV RIGHT</div>
</div>

<div class="audio_selection">AUDIO SOURCE
<div id="dev_audio_aux5" class="audio_select control_btn"><i class="fa-solid fa-sliders"></i> VIDEO MIX<br><div class="subtitle">Default</div></div>
<div id="dev_audio_main" class="audio_select control_btn"><i class="fa-solid fa-volume-high"></i> CHURCH MIX<br><div class="subtitle">Basic</div></div>
<div id="dev_audio_analogue" class="audio_select control_btn"><i class="fa-solid fa-volume-xmark"></i> VIDEO MIX<br><div class="subtitle">Backup Analogue</div></div>
</div>

<div class="obs_control">
<div id="obs_emergency" class="control_btn cam_ctl_btn cam5" mov="LIVE"><i class="fa-solid fa-truck-medical"></i> EMERGENCY</div>
<div id="obs_record" class="control_btn"><i class="fa-solid fa-floppy-disk"></i> RECORD</div>
<div id="obs_stream" class="control_btn"><i class="fa-brands fa-youtube"></i> STREAM</div>
<!--div id="camera_auto" class="control_btn"><i class="fa-solid fa-repeat"></i> AUTO SWITCH</div-->
<div id="camera_slider">PTZ SPEED<br><div id="slider"></div></div>
</div>

<br>

<div class="cam_ctrls">
  <div class="cam_ctl cam1">
    <div class="cam_container">
      <div class="cam_ctl_btn cam1 live camera" mov="LIVE"><div class="camera_no">1</div> CAMERA</div>
      <!--img id="preview_cam_1" class="cam_ctl_btn preview cam1" mov="LIVE" width="300px" src="http://192.168.0.201/action_snapshot?" data-online="true"/-->
      <video style="background-color:black" id="vid_cam1" class="cam_ctl_btn preview cam1" mov="LIVE" width="300" height="169" autoplay playsinline muted></video>
      <div class="cam_container_ctrls">
        <div class="cam_ctl_btn cam1 ptz mov_fi" mov="FI"></div>
        <div class="cam_ctl_btn cam1 ptz mov_fo" mov="FO"></div>
        <div class="cam_container_ptz">
          <div class="cam_ctl_btn cam1 ptz mov_u" mov="U"></div>
          <div class="cam_ctl_btn cam1 ptz mov_l" mov="L"></div>
          <div class="cam_ctl_btn cam1 ptz mov_f" mov="F"></div>
          <div class="cam_ctl_btn cam1 ptz mov_r" mov="R"></div>
          <div class="cam_ctl_btn cam1 ptz mov_d" mov="D"></div>
        </div>
        <div class="cam_ctl_btn cam1 ptz mov_zi" mov="ZI"></div>
        <div class="cam_ctl_btn cam1 ptz mov_zo" mov="ZO"></div>
      </div>
    </div>
  </div>

  <div style="display: inline-block; width:5px;">&nbsp;</div>

  <div class="cam_ctl cam2">
    <div class="cam_container">
      <div class="cam_ctl_btn cam2 live camera" mov="LIVE"><div class="camera_no">2</div> CAMERA</div>
      <!--img id="preview_cam_2" class="cam_ctl_btn preview cam2" mov="LIVE" width="300px" src="http://192.168.0.202/action_snapshot?" data-online="true"/-->
      <video style="background-color:black" id="vid_cam2" class="cam_ctl_btn preview cam2" mov="LIVE" width="300" height="169" autoplay playsinline muted></video>
      <div class="cam_container_ctrls">
        <div class="cam_ctl_btn cam2 ptz mov_fi" mov="FI"></div>
        <div class="cam_ctl_btn cam2 ptz mov_fo" mov="FO"></div>
        <div class="cam_container_ptz">
          <div class="cam_ctl_btn cam2 ptz mov_u" mov="U"></div>
          <div class="cam_ctl_btn cam2 ptz mov_l" mov="L"></div>
          <div class="cam_ctl_btn cam2 ptz mov_r" mov="R"></div>
          <div class="cam_ctl_btn cam2 ptz mov_d" mov="D"></div>
        </div>
        <div class="cam_ctl_btn cam2 ptz mov_zi" mov="ZI"></div>
        <div class="cam_ctl_btn cam2 ptz mov_zo" mov="ZO"></div>
      </div>
    </div>
  </div>

  <div style="display: inline-block; width:5px;">&nbsp;</div>

  <div class="cam_ctl cam3">
    <div class="cam_container">
      <div class="cam_ctl_btn cam3 live camera" mov="LIVE"><div class="camera_no">3</div> CAMERA</div>
      <!--img id="preview_cam_3" class="cam_ctl_btn preview cam3" mov="LIVE" width="300px" src="http://192.168.0.203/action_snapshot?" data-online="true"/-->
      <video style="background-color:black" id="vid_cam3" class="cam_ctl_btn preview cam3" mov="LIVE" width="300" height="169" autoplay playsinline muted></video>
      <div class="cam_container_ctrls">
        <div class="cam_ctl_btn cam3 ptz mov_fi" mov="FI"></div>
        <div class="cam_ctl_btn cam3 ptz mov_fo" mov="FO"></div>
        <div class="cam_container_ptz">
          <div class="cam_ctl_btn cam3 ptz mov_u" mov="U"></div>
          <div class="cam_ctl_btn cam3 ptz mov_l" mov="L"></div>
          <div class="cam_ctl_btn cam3 ptz mov_r" mov="R"></div>
          <div class="cam_ctl_btn cam3 ptz mov_d" mov="D"></div>
        </div>
        <div class="cam_ctl_btn cam3 ptz mov_zi" mov="ZI"></div>
        <div class="cam_ctl_btn cam3 ptz mov_zo" mov="ZO"></div>
      </div>
    </div>
  </div>

  <div style="display: inline-block; width:5px;">&nbsp;</div>

  <div class="cam_ctl cam4">
    <div class="cam_container">
      <div class="cam_ctl_btn cam4 live" mov="LIVE">CAMERA</div>
      <!--img class="cam_ctl_btn cam4 live pos_thumb" style="bottom: 0;" src="cam_1_1.jpg" mov="LIVE" width="300px"/-->
      <video style="background-color:black" id="vid_cam4" class="cam_ctl_btn preview cam4" mov="LIVE" width="300" height="169" autoplay playsinline muted></video>
      <div class="cam_container_ctrls">
        <div class="cam_ctl_btn cam4 overlay overlay_lrt" mov="OVERLAY">OVERLAY</div>
        <div class="cam_ctl_btn cam4 overlay overlay_l3rd" mov="OVERLAY_L3RD">LOWER THIRD</div>
      </div>
    </div>
  </div>
</div>

<script>

var preset_start_index = <?php echo $settings['preset_start_index']; ?>;
var preset_admin_index = <?php echo $settings['preset_admin_index']; ?>;

function UpdateContextMenu(){
  // https://swisnl.github.io/jQuery-contextMenu/docs/items.html
  $(".camera_pos").unbind("contextmenu");
 
  $.contextMenu({
    selector: '.camera_pos', 
    trigger: 'right',
    callback: function(key, options) {
      var m = "clicked: " + key;
      if (key == 'set_L')
        SetCameraPos($(this));
      else if (key == 'set_1')
        SetCameraPos($(this), false, 1);
      else if (key == 'set_2')
        SetCameraPos($(this), false, 2);
      else if (key == 'set_3')
        SetCameraPos($(this), false, 3);
      else if (key == 'rename')
        RenameCameraPos($(this));
      else if (key == 'timeout')
        SetTimeoutCameraPos($(this));
      else if (key == 'restore')
        RestoreCameraPos($(this));
      else if (key == 'set-default')
        SetCameraPos($(this), true);
    },
    items: {
      "set_L": {name: "Save Live", icon: "fa-regular fa-crosshairs", disabled: function(key, opt){ var livecam = FindLiveCamera(); if (livecam == 1 || livecam == 2 || livecam == 3) return false; else return true; }},
      "sep1": "---------",
      "set_1": {name: "Save Camera Back", icon: "fa-regular fa-crosshairs", disabled: function(key, opt){ return false; }},
      "set_2": {name: "Save Camera Left", icon: "fa-regular fa-crosshairs", disabled: function(key, opt){ return false; }},
      "set_3": {name: "Save Camera Right", icon: "fa-regular fa-crosshairs", disabled: function(key, opt){ return false; }},
      "sep2": "---------",
      "rename": {name: "Rename", icon: "fa-regular fa-edit"},
      "timeout": {name: "Set Timeout", icon: "fa-regular fa-hourglass-start", disabled: function(key, opt){ return !$(this).hasClass('auto_queue'); }},
      "sep3": "---------",
      "restore": {name: "Restore Default", icon: "fa-regular fa-rotate"},       
      "set-default": {name: "Save as Default", icon: "fa-regular fa-save", disabled: function(key, opt){ return !AdminAccess || !$(this).hasClass('active'); }}
    }
  });
}

$(function(){
  
  //$(".camera_pos").html('<img class="pos_thumb" src="cam_1_1.jpg"/><div class="camera_no"></div><div class="label">Entry</div>');
  $(".camera_pos").each(function(){
    let pos = $(this).attr('pos');
    let $thumb = $(this).find(".pos_thumb");
    //alert(pos);
    $thumb.attr("src", 'https://srv-syd05.chatswoodchurch.org/control_thumb.php?cmd=thumb_cache&id=' + pos + '&ts=' + (new Date()).getTime());
  });

  $(".camera_pos").click(GotoCameraPos);
  $(".camera_pos").dblclick(GotoCamera);
  
  $(".cam_ctl_btn").mousedown(ManualMoveCamera);
  $(".cam_ctl_btn").mouseup(ManualMoveStop);
  $(".cam_ctl_btn").bind('mousewheel', ManualMoveWheel);

  $(".smart_device").click(ToggleSmart);
  $(".audio_select").click(SelectAudioSource);
  
  $("#obs_emergency").click(ShowEmergency);
  $("#obs_record").click(ToggleRecording);
  $("#obs_stream").click(ToggleStreaming);
  $("#camera_auto").click(AutoSwitch);
  
  $("#admin_access").click(function(e) {
    if (e.ctrlKey) {
      AdminAccess = true;
      $("#admin_access").addClass('live');
    }
    else
    {
      AdminAccess = false;
      $("#admin_access").removeClass('live');
    }
  });
  
  $("#slider").slider();
  $("#slider").slider( "option", "min", 1 );
  $("#slider").slider( "option", "max", 20 );
  $("#slider").slider( "option", "value", 1 );
  
  //Set HTTP Snapshot Resolution... (1920x1080, 960x600, 480x300)
  //$.get('http://' + CameraIp(1) + '/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300');
  //$.get('http://' + CameraIp(2) + '/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300');
  //$.get('http://' + CameraIp(3) + '/cgi-bin/snapshot.cgi?post_snapshot_conf&resolution=480x300');
  $.get('https://srv-syd05.chatswoodchurch.org/control_thumb.php?cmd=init');
  
  /*
  $(".camera_pos").each(function() {
    var pos = parseInt($(this).attr("pos"));
    var preset = parseInt($(this).attr("preset"));
    
    //console.log("Test:" + pos + " " + localStorage.getItem("pos_" + pos + "_lbl"));
    $(this).find(".label").text(localStorage.getItem("pos_" + pos + "_lbl") || "Preset");
    
    var cam = localStorage.getItem("pos_" + pos + "_cam");
    if (cam !== null)
      $(this).addClass('cam' + cam);
    else
    {
      //Default...
      if (camera_pos_cam[preset] == 2)
        $(this).addClass('cam2');
      else if (camera_pos_cam[preset] == 3)
        $(this).addClass('cam3');
      else
        $(this).addClass('cam1');
    }
  });  
  */
  
  $(".camera_pos.cam1 .camera_no").text("1");
  $(".camera_pos.cam2 .camera_no").text("2");
  $(".camera_pos.cam3 .camera_no").text("3");
  
  $(".cam_ctl_btn.cam1.live").text(' ' + CameraName(1));
  $(".cam_ctl_btn.cam2.live").text(' ' + CameraName(2));
  $(".cam_ctl_btn.cam3.live").text(' ' + CameraName(3));
  $(".cam_ctl_btn.cam4.live").text(CameraName(4));
  
  //https://fontawesome.com/icons/crosshairs?s=solid
  
  UpdateContextMenu();

  $.contextMenu({
    selector: '.cam_ctl_btn.live.camera', 
    trigger: 'right',
    callback: function(key, options) {
      var m = "clicked: " + key;
      if (key == 'update')
        UpdateImages($(this));
    },
    items: {
      "update": {name: "Update", icon: "fa-images"},
    }
  });
  
  setInterval(function(){
    //$("#preview_cam_1").attr('src', 'http://192.168.0.201/action_snapshot?' + (new Date()).getTime());
    //$("#preview_cam_2").attr('src', 'http://192.168.0.202/action_snapshot?' + (new Date()).getTime());
    //$("#preview_cam_3").attr('src', 'http://192.168.0.203/action_snapshot?' + (new Date()).getTime());

    $("#camera_auto.live").text("" + Math.trunc((NextAutoTime.getTime() - (new Date()).getTime()) / 1000) + "");
    
    // Find In Motion Positions...
    $(".camera_pos.in_motion").each(function(){
      if ($(this).hasClass("in_motion_flash"))
        $(this).removeClass("in_motion_flash");
      else
        $(this).addClass("in_motion_flash");
      
      if (parseInt($(this).attr('dt_active')) + 5000 < (new Date()).getTime()){
        $(this).removeClass("in_motion");
      }
    });    
    
  }, 500);
  
  GetRecordingStatus();
  GetStreamingStatus();
  GetCurrentScene();
  GetAudioSource();
  
  // ID, Alias, Secure Token, IP, Port, SSL, Use Single Port, tcp/udp
  /*
  webrtcPlayer1 = new UnrealWebRTCPlayer("vid_cam1", "Cam1", "", "10.241.57.96", "5119", false, true, "tcp");
  webrtcPlayer1.Play();
  webrtcPlayer2 = new UnrealWebRTCPlayer("vid_cam2", "Cam2", "", "10.241.57.96", "5119", false, true, "tcp");
  webrtcPlayer1.Play();
  webrtcPlayer3 = new UnrealWebRTCPlayer("vid_cam3", "Cam3", "", "10.241.57.96", "5119", false, true, "tcp");
  webrtcPlayer3.Play();
  webrtcPlayer4 = new UnrealWebRTCPlayer("vid_cam4", "DP_Computer", "", "10.241.57.96", "5119", false, true, "udp");
  webrtcPlayer4.Play();
  */
  
  // https://serverfault.com/questions/1125829/how-to-get-rtsptoweb-to-work-with-with-https
  
  //startWebRTCPlay('#vid_cam1', 'http://10.241.118.196:8083/stream/d8a30b26-a287-4b7b-b06f-2fd82de34ee3/channel/0/webrtc');
  //startWebRTCPlay('#vid_cam2', 'http://10.241.118.196:8083/stream/1c502db8-03d3-47ae-a95f-910551d118fd/channel/0/webrtc');
  //startWebRTCPlay('#vid_cam3', 'http://10.241.118.196:8083/stream/52055f06-249c-4b74-8fa2-d69b701fd1b7/channel/0/webrtc'); 
  //startWebRTCPlay('#vid_cam4', 'http://10.241.118.196:8083/stream/ce75e370-03a9-4cd9-b44a-2059103dda93/channel/0/webrtc');
 
  /*
  startWebRTCPlay('#vid_cam1', 'https://srv-syd05.chatswoodchurch.org:8084/stream/d8a30b26-a287-4b7b-b06f-2fd82de34ee3/channel/0/webrtc');
  startWebRTCPlay('#vid_cam2', 'https://srv-syd05.chatswoodchurch.org:8084/stream/1c502db8-03d3-47ae-a95f-910551d118fd/channel/0/webrtc');
  startWebRTCPlay('#vid_cam3', 'https://srv-syd05.chatswoodchurch.org:8084/stream/52055f06-249c-4b74-8fa2-d69b701fd1b7/channel/0/webrtc'); 
  startWebRTCPlay('#vid_cam4', 'https://srv-syd05.chatswoodchurch.org:8084/stream/ce75e370-03a9-4cd9-b44a-2059103dda93/channel/0/webrtc');
  */
 
  //startWebRTCPlay('#vid_cam1', 'https://srv-syd05.chatswoodchurch.org/stream/d8a30b26-a287-4b7b-b06f-2fd82de34ee3/channel/0/webrtc?uuid=d8a30b26-a287-4b7b-b06f-2fd82de34ee3&channel=0');
  //startWebRTCPlay('#vid_cam2', 'https://srv-syd05.chatswoodchurch.org/stream/1c502db8-03d3-47ae-a95f-910551d118fd/channel/0/webrtc?uuid=1c502db8-03d3-47ae-a95f-910551d118fd&channel=0');
  //startWebRTCPlay('#vid_cam3', 'https://srv-syd05.chatswoodchurch.org/stream/52055f06-249c-4b74-8fa2-d69b701fd1b7/channel/0/webrtc?uuid=52055f06-249c-4b74-8fa2-d69b701fd1b7&channel=0'); 
  //startWebRTCPlay('#vid_cam4', 'https://srv-syd05.chatswoodchurch.org/stream/ce75e370-03a9-4cd9-b44a-2059103dda93/channel/0/webrtc?uuid=ce75e370-03a9-4cd9-b44a-2059103dda93&channel=0');
  
  // USES go2rtc
  startWebRTCPlay('#vid_cam1', 'https://srv-syd05.chatswoodchurch.org/go2rtc/api/webrtc?src=camera1');
  startWebRTCPlay('#vid_cam2', 'https://srv-syd05.chatswoodchurch.org/go2rtc/api/webrtc?src=camera2');
  startWebRTCPlay('#vid_cam3', 'https://srv-syd05.chatswoodchurch.org/go2rtc/api/webrtc?src=camera3');
  startWebRTCPlay('#vid_cam4', 'https://srv-syd05.chatswoodchurch.org/go2rtc/api/webrtc?src=usb_hdmi_720p');

  /*
  $.getJSON( "https://srv-syd05.chatswoodchurch.org/cameras.json")
    .done(function( data ) {
      $.each( data.items, function( i, item ) {
        alert("1");
        //$( "<img>" ).attr( "src", item.media.m ).appendTo( "#images" );
        if ( i === 3 ) {
          return false;
        }
      });
    });
  */


});
</script>

</body>
</html>