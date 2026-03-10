<!doctype html>
<html>

<head>
    <title>Camera Monitor</title>
    <script language="JavaScript" type="text/javascript" src="js/contextMenu/jquery-3.6.0.min.js"></script>
    <script src="webrtc.js"></script>
</head>

<body>
    <video id="vid_cam1" width="300" height="169" autoplay playsinline muted></video>    
    <video id="vid_cam2" width="300" height="169" autoplay playsinline muted></video>
    <video id="vid_cam3" width="300" height="169" autoplay playsinline muted></video>
    <video id="vid_cam4" width="300" height="169" autoplay playsinline muted></video>    
    <script>
        
        // Create video
        //const video = document.createElement('video')

$(function(){ 
  startWebRTCPlay('#vid_cam1', 'http://192.168.0.182:8083/stream/d8a30b26-a287-4b7b-b06f-2fd82de34ee3/channel/0/webrtc');
  startWebRTCPlay('#vid_cam2', 'http://192.168.0.182:8083/stream/1c502db8-03d3-47ae-a95f-910551d118fd/channel/0/webrtc');
  startWebRTCPlay('#vid_cam3', 'http://192.168.0.182:8083/stream/52055f06-249c-4b74-8fa2-d69b701fd1b7/channel/0/webrtc');
  startWebRTCPlay('#vid_cam4', 'http://192.168.0.182:8083/stream/ce75e370-03a9-4cd9-b44a-2059103dda93/channel/0/webrtc');
});

</script>
</body>

</html>

