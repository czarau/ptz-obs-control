// https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md

// https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#getsourcescreenshot
// https://ptzoptics.com/wp-content/uploads/2020/11/PTZOptics-HTTP-CGI-Commands-Rev-1_4-8-20.pdf

// GetSpecialInputs

// Globals...
var UpdatingThumbs1 = false;
var UpdatingThumbs2 = false;
var UpdatingThumbs3 = false;
var AdminAccess = false;
//var AdminAccess = true;
var NextAutoSub = 2;
var NextAutoTime = new Date();

var tmrZoomStop = null;
var tmrZoomScrollLastTime = 0;
var obsScenes = null;
  
//var WebOBS_IP_Addr = '10.241.57.96:4444';
//const WebOBS_IP_Addr = '<?php echo $WebOBS_IP_Addr; ?>';
//const WebOBS_Password = '<?php echo $WebOBS_Password; ?>';

//var DP_Scene_Object_Name = 'DP_Stream';
var DP_LRT_Object_Name = 'NDI™ 5 Source (DP Stream)';
var DP_L3RD_Object_Name = 'NDI™ 5 Source (DP Stream L3RD)';

var camera_pos_cam   = [1,   1,   2,   3,   2,   1,   1,   2,   3,   3,   1,   2,   1,   1,   2,   3,   1,   2,   3,   1,   1,   1,   2,   2];

function CameraIp(cam)
{
  /*
  if (cam == 1)
    return '192.168.0.201';
  else if (cam == 2)
    return '192.168.0.202';
  else if (cam == 3)
    return '192.168.0.203';
  */
  if (cam == 1)
    return '10.241.57.96:8806';
  else if (cam == 2)
    return '10.241.57.96:8807';
  else if (cam == 3)
    return '10.241.57.96:8808';
    
  return '';
}

function CameraName(cam)
{
  if (cam == 1)
    return 'CAMERA BACK';
  else if (cam == 2)
    return 'CAMERA LEFT';
  else if (cam == 3)
    return 'CAMERA RIGHT';
  else if (cam == 4)
    return 'DATA PROJECTION';
    
  return '';
}

function CameraFromClass($this)
{
  if ($this.hasClass('cam2'))
    return 2;
  if ($this.hasClass('cam3'))
    return 3;
  if ($this.hasClass('cam4'))
    return 4;

  return 1;
}

function FindLiveCamera()
{
  // Find live camera...
  $livecam = $('.cam_ctl_btn.live.active');
  
  if ($livecam.length == 0)
    return -1;
  
  return CameraFromClass($livecam);
}

function LiveCamera(cam)
{
  $(".cam_ctl_btn.active").removeClass('active');
  $(".camera_pos").removeClass('cam_active');
  $(".camera_no.active").removeClass('active');

  if (cam == 1){
    SetCurrentScene('Camera 1 - Back');
    $(".cam_ctl_btn.cam1").addClass('active');
    $(".camera_pos.cam1").addClass('cam_active');
    $(".camera_pos.cam1 .camera_no").addClass('active');
    $(".cam_ctl.cam1 .camera_no").addClass('active');
  }
  else if (cam == 2){
    SetCurrentScene('Camera 2 - Left');
    $(".cam_ctl_btn.cam2").addClass('active');
    $(".camera_pos.cam2").addClass('cam_active');
    $(".camera_pos.cam2 .camera_no").addClass('active');
    $(".cam_ctl.cam2 .camera_no").addClass('active');
  }
  else if (cam == 3){
    SetCurrentScene('Camera 3 - Right');
    $(".cam_ctl_btn.cam3").addClass('active');
    $(".camera_pos.cam3").addClass('cam_active');
    $(".camera_pos.cam3 .camera_no").addClass('active');
    $(".cam_ctl.cam3 .camera_no").addClass('active');
  }
  else if (cam == 4){
    SetCurrentScene('DP Full Screen');
    $(".cam_ctl_btn.cam4").addClass('active');
    //$(".camera_pos.cam3 .camera_no").addClass('active');
  }
  else if (cam == 5){
    SetCurrentScene('Emergency');
    $(".cam_ctl_btn.cam5").addClass('active');
  }  
  var $prev = $(".camera_pos.livecam");
  
  if ($prev.length != 0)
  {
    if (!$prev.hasClass('cam'+cam))
      $prev.removeClass('livecam');
  }
  
  var $actv_pos = $('.camera_pos.cam'+cam+'.active');
  if ($actv_pos.length != 0)
    $actv_pos.addClass('livecam');
}

function GotoCamera()
{
  // Dlb Click
/*
  // disabled for now!

  var $this = $(this);
  var cam = CameraFromClass($this);
  $.get('http://' + CameraIp(cam) + '/cgi-bin/ptzctrl.cgi?ptzcmd&poscall&' + $this.attr('pos'));
 
  var $prev = $('.camera_pos.cam'+cam+'.active');
  if ($prev.length != 0)
    $prev.removeClass('active');

  $this.addClass('active');
  
  LiveCamera(cam);
*/
}

function GotoCameraPos()
{
  var cam = CameraFromClass($(this));
  
  if (cam == 1 && UpdatingThumbs1)
    return;
  if (cam == 2 && UpdatingThumbs2)
    return;
  if (cam == 3 && UpdatingThumbs3)
    return;
    
  if ($(this).find('.camera_no.active').length != 0)
    return;
    
  GotoCameraPosEx($(this).attr('pos'));
}

function GotoCameraPosEx(pos, admin = false)
{ 
  if (admin)
    var $this = $(".camera_pos[admin_pos='"+pos+"']");  
  else
    var $this = $(".camera_pos[pos='"+pos+"']");
  var cam = CameraFromClass($this);
   
  // Remove all thumbs refreshing for camera if previously set...
  $thumb = $('.pos_thumb.refresh'+cam);
  if ($thumb.lenth != 0)
    $thumb.removeClass('refresh'+cam);

  $.get('http://' + CameraIp(cam) + '/cgi-bin/ptzctrl.cgi?ptzcmd&poscall&' + pos); //0-89 100-254
  
  if (!$this.hasClass('active'))
  {
    // Clear prevously active position and set this as active...
    var $prev = $('.camera_pos.cam'+cam+'.active');
    
    if ($prev.length != 0)
    {
      $prev.removeClass('active');
      if ($prev.hasClass('livecam') && CameraFromClass($prev) == cam)
      {
        $prev.removeClass('livecam');
        $this.addClass('livecam');  
      }
    } 

    $this.addClass('active');  
    $this.addClass('in_motion');
    $this.attr('dt_active', (new Date()).getTime());  
  }
  else
  {
    // Already active - we now go live...
    LiveCamera(cam);
  }

  // Update thumb...
  $thumb = $this.find(".pos_thumb")
  $thumb.addClass('refresh'+cam);      
  
  setTimeout(function(){
    $thumb = $('.pos_thumb.refresh'+cam);

    if ($thumb.lenth == 0)
      return;
    $thumb.removeClass('refresh'+cam);
    //$thumb.attr("src", "http://" + CameraIp(cam) + "/snapshot.jpg?rand=" + Math.random());
    //$thumb.attr("src", 'http://' + CameraIp(cam) + '/action_snapshot?' + (new Date()).getTime());
    $thumb.attr("src", 'https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=thumb&camera=' + cam + '&id=' + pos + '&ts=' + (new Date()).getTime());
  }, 5000);  
}

function UpdateImages($this)
{
  // Update all camera thumbs...
  var cam = CameraFromClass($this);
  var time = 0;
  
  if (cam == 1)
    UpdatingThumbs1 = true;
  else if (cam == 2)
    UpdatingThumbs2 = true;
  else if (cam == 3)
    UpdatingThumbs3 = true;
    
  // Remove all thumbs refreshing for camera if previously set...
  $thumb = $('.pos_thumb.refresh'+cam);
  if ($thumb.lenth != 0)
    $thumb.removeClass('refresh'+cam);

  $(".cam_ctl_btn.cam" + cam + ".live").addClass('updating').text('UPDATING...');

  $(".camera_pos.cam"+cam).each(function() {
     var $this = $(this);
     setTimeout( function(){ GotoCameraPosEx($this.attr('pos')); }, time);
     time += 6000;
  });
  
  setTimeout(function(){   
    if (cam == 1)
      UpdatingThumbs1 = false;
    else if (cam == 2)
      UpdatingThumbs2 = false;
    else if (cam == 3)
      UpdatingThumbs3 = false;

    $(".cam_ctl_btn.cam" + cam + ".live").removeClass('updating').text(' ' + CameraName(cam));
  }, time);
}

function SetCameraPos($this, admin = false, cam = null)
{
  if (cam == null)
    cam = FindLiveCamera();
  var pos = $this.attr('pos');
  
  if (admin)
    pos = $this.attr('admin_pos');
  
  $.get('http://' + CameraIp(cam) + '/cgi-bin/ptzctrl.cgi?ptzcmd&posset&' + pos);
  
  // Update camera number...
  $this.removeClass('cam1');
  $this.removeClass('cam2');
  $this.removeClass('cam3');
  $this.addClass('cam' + cam);
  
  // Save camera number...
  localStorage.setItem("pos_" + pos + "_cam", cam);
  
  // Save label...
  if (admin)
  {
    var lbl = $this.find(".label").text();
    localStorage.setItem("pos_" + pos + "_lbl", lbl);
  }
  
  var $camno = $this.find(".camera_no");
  $camno.text(cam);
  $camno.addClass('active');

  // Update Thumb...
  $thumb = $this.find(".pos_thumb");      
  //$thumb.attr("src", "http://" + CameraIp(cam) + "/snapshot.jpg?rand=" + Math.random());
  //$thumb.attr("src", "http://" + CameraIp(cam) + "/action_snapshot?" + (new Date()).getTime());
  $thumb.attr("src", 'https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=thumb&camera=' + cam + '&id=' + pos + '&ts=' + (new Date()).getTime());
}

function RestoreCameraPos($this)
{
  var cam = FindLiveCamera();
  var pos = $this.attr('admin_pos');
  var preset = $this.attr('preset');
  
  // Update label...
  var lbl = localStorage.getItem("pos_" + pos + "_lbl") || "Preset";
  $this.find(".label").text(lbl);
  localStorage.setItem("pos_" + $this.attr('pos') + "_lbl", lbl);
  
  // Update camera number...
  var cam = localStorage.getItem("pos_" + pos + "_cam");
  
  if (cam !== null)
    cam = 1;
  else
  {
    //Default...
    if (camera_pos_cam[preset] == 2)
      cam = 2;
    else if (camera_pos_cam[preset] == 3)
      cam = 3;
    else
      cam = 1;
  }  
  
  $this.removeClass('cam1');
  $this.removeClass('cam2');
  $this.removeClass('cam3');
  $this.addClass('cam' + cam);  
  
  var $camno = $this.find(".camera_no");
  $camno.text(cam);  
  
  GotoCameraPosEx(pos, true);
  
  setTimeout(function(){
    SetCameraPos($this, false, cam);
  }, 5000);   
}

function GetCurrentScene() {

  const obs = new OBSWebSocket();
  /*
  obs.connect({address: WebOBS_IP_Addr});
  obs.on('ConnectionOpened', () => {
    obs.send('GetCurrentScene').then(data => {
      if (data.name == 'Camera 1 - Back')
        LiveCamera(1);
      else if (data.name == 'Camera 2 - Left')
        LiveCamera(2);
      else if (data.name == 'Camera 3 - Right')
        LiveCamera(3);
      else if (data.name == 'DP Full Screen')
        LiveCamera(4);
    });
  });
  */
  
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
      obs.call('GetCurrentProgramScene').then(data => {
        if (data.currentProgramSceneName == 'Camera 1 - Back')
          LiveCamera(1);
        else if (data.currentProgramSceneName == 'Camera 2 - Left')
          LiveCamera(2);
        else if (data.currentProgramSceneName == 'Camera 3 - Right')
          LiveCamera(3);
        else if (data.currentProgramSceneName == 'DP Full Screen')
          LiveCamera(4);        
      });
    },
    function(error) { console.log('Failed to Connect?'); }
  );   
}

function SetCurrentScene(scenename) {

  const obs = new OBSWebSocket();
  /*
  obs.connect({address: WebOBS_IP_Addr});
  obs.on('ConnectionOpened', () => {
    obs.send('SetCurrentScene', {
               'scene-name': scenename
    });
  });*/
  
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
      obs.call('SetCurrentProgramScene', {'sceneName': scenename});
    },
    function(error) { console.log('Failed to Connect?'); }
  );  
  
}

function GetSceneList(func) {

  const obs = new OBSWebSocket();
  /*
  obs.connect({address: WebOBS_IP_Addr});
  obs.on('ConnectionOpened', () => {
    obs.send('SetCurrentScene', {
               'scene-name': scenename
    });
  });*/
  
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
      obs.call('GetSceneList').then(data => {
        func(data);
        //obsScenes = data.scenes;
        //alert('scene: ' + obsScenes[1].sceneName);
        });
    },
    function(error) { console.log('Failed to Connect?'); }
  );  
  
}

function ReApplyCurrentScene() {

  const obs = new OBSWebSocket();
  /*
  obs.connect({address: WebOBS_IP_Addr});
  obs.on('ConnectionOpened', () => {
    obs.send('GetCurrentScene').then(data => {
      SetCurrentScene(data.name);
    });
  });
  */
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
      obs.call('GetCurrentProgramScene').then(data => {
        SetCurrentScene(data.currentProgramSceneName);
      });
    },
    function(error) { console.log('Failed to Connect?'); }
  );    
}

function SetSceneItemVisible(scenename, itemname, isvisible) {
  
  const obs = new OBSWebSocket();
  /*
  obs.connect({address: WebOBS_IP_Addr});
  obs.on('ConnectionOpened', () => {
    obs.send('SetSceneItemProperties', {
               'scene-name': scenename,
               'item': itemname,
               'visible': isvisible
    });
  });
  */
  
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
    
      obs.call('GetSceneItemId', {
        'sceneName': scenename,
        'sourceName': itemname,
        }).then(data => {
          obs.call('SetSceneItemEnabled', {
            'sceneName': scenename,
            'sceneItemId': data.sceneItemId,
            'sceneItemEnabled': isvisible
          });
        }, 
        function(error){
          //console.log('Item does not exist?');
        });
    },
    function(error) { console.log('Failed to Connect?'); }
  );    
}

function IsAudioSourceEnabled(AudioName, func)
{
  const obs = new OBSWebSocket();
  var scene = '';
  
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
      obs.call('GetCurrentProgramScene').then(data => {
        scene = data.currentProgramSceneName;
        obs.call('GetSceneItemId', {
          'sceneName': data.currentProgramSceneName,
          'sourceName': AudioName,
          }).then(data => {
            //console.log('Audio: ' + scene + ' ' + data.sceneItemId);
            
            obs.call('GetSceneItemEnabled', {
              'sceneName': scene,
              'sceneItemId': data.sceneItemId
            }).then(data => {
              func(data.sceneItemEnabled);
            });
          }, 
          function(error){
            //console.log('Item does not exist?');
          });        
      });
    },
    function(error) { console.log('Failed to Connect?'); }
  );  
}

function GetAudioSource()
{
  IsAudioSourceEnabled('Audio - Video Mix (Aux 5)', 
    function(IsEnabled){
      if (IsEnabled) {
        console.log('Audio - Video Mix (Aux 5)');
        $("#dev_audio_aux5").addClass('live');
        $("#dev_audio_main").removeClass('live');
        $("#dev_audio_analogue").removeClass('live');
      }
  });
  IsAudioSourceEnabled('Audio - Video Mix (Aux 5 Analogue)', 
    function(IsEnabled){
      if (IsEnabled) {
        console.log('Audio - Video Mix (Aux 5 Analogue)');
        $("#dev_audio_aux5").removeClass('live');
        $("#dev_audio_main").removeClass('live');
        $("#dev_audio_analogue").addClass('live');
      }
  });
  IsAudioSourceEnabled('Audio - Church Mix (Main)', 
    function(IsEnabled){
      if (IsEnabled) {
        console.log('Audio - Church Mix (Main)');
        $("#dev_audio_aux5").removeClass('live');
        $("#dev_audio_main").addClass('live');
        $("#dev_audio_analogue").removeClass('live');
      }
  });  
}

function SelectAudioSource()
{
  if (!$(this).hasClass('live'))
  {
    $(this).addClass('live');
    
    if ($(this).attr('id') == 'dev_audio_aux5')
    {
      $("#dev_audio_main").removeClass('live');
      $("#dev_audio_analogue").removeClass('live');
      
      GetSceneList(function(data){
        data.scenes.forEach(
          function(scene){
            console.log('Setting audio source for Scene: ' + scene.sceneName);
            SetSceneItemVisible(scene.sceneName, 'Audio - Video Mix (Aux 5)', true);
            SetSceneItemVisible(scene.sceneName, 'Audio - Video Mix (Aux 5 Analogue)', false);
            SetSceneItemVisible(scene.sceneName, 'Audio - Church Mix (Main)', false);
          });
      });
    }
    else if ($(this).attr('id') == 'dev_audio_main')
    {
      $("#dev_audio_aux5").removeClass('live');
      $("#dev_audio_analogue").removeClass('live');

      GetSceneList(function(data){
        data.scenes.forEach(
          function(scene){
            console.log('Setting audio source for Scene: ' + scene.sceneName);
            SetSceneItemVisible(scene.sceneName, 'Audio - Video Mix (Aux 5)', false);
            SetSceneItemVisible(scene.sceneName, 'Audio - Video Mix (Aux 5 Analogue)', false);
            SetSceneItemVisible(scene.sceneName, 'Audio - Church Mix (Main)', true);
          });
      });
    }
    else if ($(this).attr('id') == 'dev_audio_analogue')
    {
      $("#dev_audio_aux5").removeClass('live');
      $("#dev_audio_main").removeClass('live');

      GetSceneList(function(data){
        data.scenes.forEach(
          function(scene){
            console.log('Setting audio source for Scene: ' + scene.sceneName);
            SetSceneItemVisible(scene.sceneName, 'Audio - Video Mix (Aux 5)', false);
            SetSceneItemVisible(scene.sceneName, 'Audio - Video Mix (Aux 5 Analogue)', true);
            SetSceneItemVisible(scene.sceneName, 'Audio - Church Mix (Main)', false);
          });
      });
    }
  }
}

function GetRecordingStatus()
{
  const obs = new OBSWebSocket();
  
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
      obs.call('GetRecordStatus').then(status => {
        if (status.outputActive)
          $('#obs_record').addClass('live');
        else
          $('#obs_record').removeClass('live');
      });
    },
    function(error) { console.log('Failed to Connect?'); }
  );  
}

function ToggleRecording() {
  
  const obs = new OBSWebSocket();
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
      obs.call('ToggleRecord');
      
      setTimeout( function(){
        GetRecordingStatus();
      }, 1000);
    },
    function(error) { console.log('Failed to Connect?'); }
  );    
  
}

function GetStreamingStatus()
{
  const obs = new OBSWebSocket();
  
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
      obs.call('GetStreamStatus').then(status => {
        if (status.outputActive)
          $('#obs_stream').addClass('live');
        else
          $('#obs_stream').removeClass('live');
      });
    },
    function(error) { console.log('Failed to Connect?'); }
  );  
}

function ToggleStreaming() {
  
  const obs = new OBSWebSocket();
  
  obs.connect(WebOBS_IP_Addr, WebOBS_Password).then(
    function(conn_status) {   
      obs.call('ToggleStream');
      
      setTimeout( function(){
        GetStreamingStatus();
      }, 5000);
    },
    function(error) { console.log('Failed to Connect?'); }
  );    
  
}

function ToggleSmart() {

  if ($(this).hasClass('ifft_event'))
  {
    ifft_key = 'cBWAVJ1ke_n7cILbTeupOS';
    event = $(this).attr('eventname');
    
    if (!$(this).hasClass('live'))
    {
      $.get('https://maker.ifttt.com/trigger/' + event + '/with/key/' + ifft_key + '?value1=value1&value2=value2&value3=value3');
      $(this).addClass('live');
    }
    else
    {
      $.get('https://maker.ifttt.com/trigger/' + event + '/with/key/' + ifft_key + '?value1=value1&value2=value2&value3=value3');
      $(this).removeClass('live');
    }  
  
    return;
  }
  

  device = $(this).attr('device');
  
  if (!$(this).hasClass('live'))
  {
    //$.get('https://sequematic.com/trigger-custom-webhook/81B2670AF8/100047/' + device + '/1');
    $.get('https://voip.linkit.xyz/chatswood/control.php?action=smartdevice&device=' + device + '&state=1');
    
    $(this).addClass('live');
  }
  else
  {
    //$.get('https://sequematic.com/trigger-custom-webhook/81B2670AF8/100047/' + device + '/0');
    $.get('https://voip.linkit.xyz/chatswood/control.php?action=smartdevice&device=' + device + '&state=0');

    $(this).removeClass('live');
  }
}

function GetSceneImage() {
  
  const obs = new OBSWebSocket();
  obs.connect(WebOBS_IP_Addr, WebOBS_Password);
  obs.on('ConnectionOpened', () => { 
    obs.send('GetSourceScreenshot', {'sourceName': 'DP'}).then(imageData => {
      //decode(imageData);
    });
  });
}

function ManualMoveStop(e)
{
  if (e.which != 1) return false;

  var $this = $(this)
  var cam = CameraFromClass($this);
  var ip = CameraIp(cam);
  var move = $this.attr('mov');

  if (move == 'L' || move == 'R' || move == 'U' || move == 'D'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&ptzstop');}
  else if (move == 'ZI' || move == 'ZO'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&zoomstop');}
  else if (move == 'FI' || move == 'FO'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&focusstop');}
}

function ManualMoveCamera(e)
{
  if (e.which != 1) return false;
  
  var $this = $(this)
  var cam = CameraFromClass($this);
  var ip = CameraIp(cam);
  var move = $this.attr('mov');
  
  if (cam == 1 && UpdatingThumbs1)
    return;
  if (cam == 2 && UpdatingThumbs2)
    return;
  if (cam == 3 && UpdatingThumbs3)
    return;  
  
  // Remove all thumbs refreshing for camera if previously set...
  $thumb = $('.pos_thumb.refresh'+cam);
  if ($thumb.lenth != 0)
    $thumb.removeClass('refresh'+cam);
  
  let panspeed = 1;
  panspeed = $( "#slider" ).slider( "option", "value" ); // 1..24
  
  let tiltspeed = panspeed;  // 1..20
  
  let zoomspeed = 1; // 1 .. 7
  zoomspeed =  Math.round((panspeed / 20) * 7);
  
  if (zoomspeed < 1)
    zoomspeed = 1;
  
  let focusspeed = zoomspeed;

//alert(ip);
//    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&rel&1&1&F670&0');}
//    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&rel&1&1&0990&0');}

  $(".camera_pos.cam" + cam).removeClass('active');
  $(".camera_pos.cam" + cam).removeClass('livecam');

  if (move == 'L'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&left&' + panspeed + '&' + tiltspeed);}
  else if (move == 'R'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&right&' + panspeed + '&' + tiltspeed);}
  else if (move == 'U'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&up&' + panspeed + '&' + tiltspeed);}
  else if (move == 'D'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&down&' + panspeed + '&' + tiltspeed);}
  else if (move == 'ZI'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&zoomin&' + zoomspeed);}
  else if (move == 'ZO'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&zoomout&' + zoomspeed);}
  else if (move == 'FI'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&focusin&' + focusspeed);}
  else if (move == 'FO'){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&focusout&' + focusspeed);}    
  else if (move == 'LIVE'){
    LiveCamera(cam);}
  else if (move == 'F')
  {
    if (!$this.hasClass('f_live'))
    {
      $this.addClass('f_live');
      //$.get('http://192.168.0.139:8810/cgi-bin/setAutoTracking/1');
      $.get('https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=face&camera=1&pos=1');
    }
    else
    {
      $this.removeClass('f_live');
      //$.get('http://192.168.0.139:8810/cgi-bin/setAutoTracking/0');
      $.get('https://voip.linkit.xyz/chatswood/control_thumb.php?cmd=face&camera=1&pos=0');
    }
  } 
  else if (move == 'OVERLAY'){
    if (!$this.hasClass('ol_live'))
    {
      $(".cam_ctl_btn.cam" + cam + ".overlay").removeClass('ol_live');

      SetSceneItemVisible('Camera 1 - Back', DP_LRT_Object_Name, true);
      SetSceneItemVisible('Camera 2 - Left', DP_LRT_Object_Name, true);
      SetSceneItemVisible('Camera 3 - Right', DP_LRT_Object_Name, true);
      
      SetSceneItemVisible('Camera 1 - Back', DP_L3RD_Object_Name, false);
      SetSceneItemVisible('Camera 2 - Left', DP_L3RD_Object_Name, false);
      SetSceneItemVisible('Camera 3 - Right', DP_L3RD_Object_Name, false);
      
      ReApplyCurrentScene();
      $this.addClass('ol_live');
    }
    else
    {
      SetSceneItemVisible('Camera 1 - Back', DP_LRT_Object_Name, false);
      SetSceneItemVisible('Camera 2 - Left', DP_LRT_Object_Name, false);
      SetSceneItemVisible('Camera 3 - Right', DP_LRT_Object_Name, false);
      ReApplyCurrentScene();
      $this.removeClass('ol_live');
    }
  }
  else if (move == 'OVERLAY_L3RD'){
    if (!$this.hasClass('ol_live'))
    {
      $(".cam_ctl_btn.cam" + cam + ".overlay").removeClass('ol_live');
      
      SetSceneItemVisible('Camera 1 - Back', DP_L3RD_Object_Name, true);
      SetSceneItemVisible('Camera 2 - Left', DP_L3RD_Object_Name, true);
      SetSceneItemVisible('Camera 3 - Right', DP_L3RD_Object_Name, true);

      SetSceneItemVisible('Camera 1 - Back', DP_LRT_Object_Name, false);
      SetSceneItemVisible('Camera 2 - Left', DP_LRT_Object_Name, false);
      SetSceneItemVisible('Camera 3 - Right', DP_LRT_Object_Name, false);
      
      ReApplyCurrentScene();
      $this.addClass('ol_live');
    }
    else
    {
      SetSceneItemVisible('Camera 1 - Back', DP_L3RD_Object_Name, false);
      SetSceneItemVisible('Camera 2 - Left', DP_L3RD_Object_Name, false);
      SetSceneItemVisible('Camera 3 - Right', DP_L3RD_Object_Name, false);
      
      ReApplyCurrentScene();
      $this.removeClass('ol_live');
    }
  }
}

function ManualMoveWheel(e)
{
  let $this = $(this);
  
  if (tmrZoomStop !== null) {
    clearTimeout(tmrZoomStop);
    tmrZoomStop = null
  }
  
  let cam = CameraFromClass($this);
  let ip = CameraIp(cam);
  let move = $this.attr('mov');     
  let scroll = e.originalEvent.wheelDelta;
  
  if (cam == 1 && UpdatingThumbs1)
    return;
  if (cam == 2 && UpdatingThumbs2)
    return;
  if (cam == 3 && UpdatingThumbs3)
    return;  
  
  // Remove all thumbs refreshing for camera if previously set...
  $thumb = $('.pos_thumb.refresh'+cam);
  if ($thumb.lenth != 0)
    $thumb.removeClass('refresh'+cam);  
  
  let delayMS = e.timeStamp - tmrZoomScrollLastTime;
  tmrZoomScrollLastTime = e.timeStamp;
  
  let panspeed = 1;
  panspeed = $( "#slider" ).slider( "option", "value" ); // 1..24
  
  let tiltspeed = panspeed;  // 1..20     
   
  let zoomspeed = 1; // 1 .. 7
  zoomspeed =  Math.round((panspeed / 20) * 7);
  
  if (zoomspeed < 1)
    zoomspeed = 1;     

  //console.log('Delay: ' + delayMS);
  if (delayMS < 50) {
    // Fast Scroll...
    zoomspeed = 7;
    panspeed = 10; 
    tiltspeed = 10;      
  }      
  
  if ((move == 'ZI' & scroll > 0) || (move == 'ZO'  & scroll > 0)){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&zoomin&' + zoomspeed);}
  else if ((move == 'ZI' & scroll < 0) || (move == 'ZO'  & scroll < 0)){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&zoomout&' + zoomspeed);}
  else if ((move == 'FI' & scroll > 0) || (move == 'FO'  & scroll > 0)){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&focusin&' + zoomspeed);}
  else if ((move == 'FI' & scroll < 0) || (move == 'FO'  & scroll < 0)){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&focusout&' + zoomspeed);}
  else if ((move == 'L' & scroll < 0) || (move == 'R' & scroll < 0)){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&right&' + panspeed + '&' + tiltspeed);}
  else if ((move == 'L' & scroll > 0) || (move == 'R' & scroll > 0)){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&left&' + panspeed + '&' + tiltspeed);}
  else if ((move == 'D' & scroll < 0) || (move == 'U' & scroll > 0)){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&up&' + panspeed + '&' + tiltspeed);}
  else if ((move == 'D' & scroll > 0) || (move == 'U' & scroll < 0)){
    $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&down&' + panspeed + '&' + tiltspeed);}

  if (move == 'ZI' || move == 'ZO'){
    tmrZoomStop = setTimeout(function(){
      $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&zoomstop');
    }, 500);
  }
  else if (move == 'FI' || move == 'FO'){
    tmrZoomStop = setTimeout(function(){
      $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&focusstop');
    }, 500);
  }
  else if (move == 'L' || move == 'R' || move == 'U' || move == 'D'){
    tmrZoomStop = setTimeout(function(){
      $.get('http://' + ip + '/cgi-bin/ptzctrl.cgi?ptzcmd&ptzstop');
    }, 500);
  }
}
  
function RenameCameraPos($this)
{
  var $label = $this.find(".label");
  var oldvalue = $label.text();
  
  let value = prompt("Please enter a name", oldvalue);
  
  if (value !== oldvalue)
  {
    $label.text(value);
    localStorage.setItem("pos_" + $this.attr('pos') + "_lbl", value);
  }
}

function DoAutoSwitch()
{
  if (!$("#camera_auto").hasClass('live'))
    return;
    
  var cam = FindLiveCamera();

  if (cam == 1)
  {
     LiveCamera(NextAutoSub);
     NextAutoSub++;
     if (NextAutoSub > 3) NextAutoSub = 2;
     NextAutoTime.setTime((new Date()).getTime() + 10000);
     setTimeout( function(){ DoAutoSwitch(); }, 10000);
   }
   else
   {
     LiveCamera(1);
     NextAutoTime.setTime((new Date()).getTime() + 45000);
     setTimeout( function(){ DoAutoSwitch(); }, 45000);
   }    
}

function AutoSwitch()
{
  if ($(this).hasClass('live'))
  {
    $(this).removeClass('live');
    $(this).html('<i class="fa-solid fa-repeat"></i> AUTO SWITCH</div>');
    return;
  }
  
  var cam = FindLiveCamera();
  
  if (cam < 1)
    return;

  NextAutoTime.setTime((new Date()).getTime() + 5000);
  $(this).addClass('live');
  setTimeout( function(){ DoAutoSwitch(); }, 5000);
}
    
function ShowEmergency()
{
  $("#camera_auto").removeClass('live');
  $("#camera_auto").html('<i class="fa-solid fa-repeat"></i> AUTO SWITCH</div>');  

  LiveCamera(5); 
}