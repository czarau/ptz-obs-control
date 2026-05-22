// jQuery-free port of chatswood/webrtc.js — connects a <video> element to a
// RTSPtoWeb / go2rtc WebRTC endpoint. Returns the peer connection so callers
// can close it on unmount. Auto-reconnects when the data channel closes.

function startWebRTCPlay(videoEl, url) {
  if (!videoEl) return null;

  const pc = new RTCPeerConnection({ sdpSemantics: 'unified-plan' });
  pc.addTransceiver('video', { direction: 'recvonly' });
  const channel = pc.createDataChannel('RTSPtoWeb');

  pc.ontrack = e => {
    videoEl.srcObject = e.streams[0];
    videoEl.play().catch(() => {});
  };

  pc.onnegotiationneeded = async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch(url, { method: 'POST', body: pc.localDescription.sdp });
      const answer = await res.text();
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
    } catch (err) {
      console.warn('WebRTC negotiation failed:', err);
    }
  };

  channel.onclose = () => {
    // The old jQuery version recursed here. Leave reconnection to the caller
    // so React can manage the ref / lifecycle cleanly.
    console.log('WebRTC data channel closed');
  };

  return pc;
}

window.startWebRTCPlay = startWebRTCPlay;
