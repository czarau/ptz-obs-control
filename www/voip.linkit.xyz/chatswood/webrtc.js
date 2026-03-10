// https://github.com/deepch/RTSPtoWeb/blob/master/docs/examples/webrtc/main.js

function startWebRTCPlay (id, url) {
  const video = $(id)[0];
  
  // Create a new WebRTC peer connection, add a transceiver, and create a data channel
  const connection = new RTCPeerConnection({
    //iceServers: [{
    //    urls: ["stun:stun.l.google.com:19302"]
    //}],  
    sdpSemantics: 'unified-plan' })
  connection.addTransceiver('video', { direction: 'recvonly' })
  const channel = connection.createDataChannel('RTSPtoWeb')

  // When a track is received
  connection.ontrack = e => {
    console.log('Received ' + e.streams.length + ' WebRTC track(s)')
    video.srcObject = e.streams[0]
    video.play()
  }

  // When the session negotiation process is to be started
  connection.onnegotiationneeded = async () => {
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    fetch(url, {
      method: 'POST',
      body: new URLSearchParams({ data: btoa(connection.localDescription.sdp) })
    })
      .then(response => response.text())
      .then(data => {
        try {
          connection.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: atob(data) })
          )
        } catch (e) {
            console.warn(e)
        }
      })
  }

  // When the data channel is opened, log a message
  channel.onopen = () => {
    console.log(`${channel.label} data channel opened`)
  }

  // When the data channel is closed, log a message and recursively call startPlay() again
  channel.onclose = () => {
    console.log(`${channel.label} data channel closed`)
    startWebRTCPlay(id, url)
  }

  // When the data channel receives a message, log it
  channel.onmessage = e => console.log(e.data)
}
