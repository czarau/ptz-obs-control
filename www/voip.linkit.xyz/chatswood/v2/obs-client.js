// Thin wrapper around OBSWebSocket v5. Each call opens a fresh connection,
// runs its command(s), and ALWAYS disconnects — previously we connected
// but never disconnected, so every click/poll leaked a websocket and
// OBS eventually stopped accepting new ones ("timeout after a little
// while" in the field). Each poll cycle (scene/record/stream/stats) and
// every user action now opens + closes cleanly.
//
// Also adds a 5s connect timeout so a network blip doesn't leave a
// Promise hung forever on a dead TCP socket.

const OBS = (() => {
  const addr = (window.LS_CONFIG || {}).obsAddr;
  const pwd  = (window.LS_CONFIG || {}).obsPassword;
  const CONNECT_TIMEOUT_MS = 1000;

  function open() {
    const obs = new OBSWebSocket();
    const connect = obs.connect(addr, pwd).then(() => obs);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OBS connect timeout')), CONNECT_TIMEOUT_MS)
    );
    return Promise.race([connect, timeout]);
  }

  // Run `fn(obs)` against a fresh connection and disconnect afterwards
  // whether it resolved or rejected. All higher-level helpers funnel
  // through here so no method can accidentally skip the disconnect.
  function withSession(fn) {
    return open().then(obs => {
      const p = Promise.resolve().then(() => fn(obs));
      return p.finally(() => { try { obs.disconnect(); } catch (_) {} });
    });
  }

  function call(method, args) {
    return withSession(obs => obs.call(method, args));
  }

  const SCENE = {
    back:      'Camera 1 - Back',
    left:      'Camera 2 - Left',
    right:     'Camera 3 - Right',
    data:      'DP Full Screen',
    emergency: 'Emergency',
  };

  const AUDIO = {
    church: 'Audio - Church Mix (Main)',
    video:  'Audio - Video Mix (Aux 5)',
    backup: 'Audio - Video Mix (Aux 5 Analogue)',
  };

  // DP overlay sources, mutually exclusive — shown/hidden on each camera
  // scene (Camera 1/2/3) so the selected one appears regardless of which
  // camera is live. Matches DP_LRT_Object_Name / DP_L3RD_Object_Name in
  // the legacy control_v2.js.
  const OVERLAY = {
    dp:   'DP Computer',
    l3rd: 'NDI™ 5 Source (DP Stream L3RD)',
  };
  const OVERLAY_SCENES = ['Camera 1 - Back', 'Camera 2 - Left', 'Camera 3 - Right'];

  return {
    switchScene(name) {
      return call('SetCurrentProgramScene', { sceneName: name });
    },

    currentScene() {
      return call('GetCurrentProgramScene').then(d => d.currentProgramSceneName);
    },

    toggleRecord() {
      return call('ToggleRecord');
    },

    recordStatus() {
      return call('GetRecordStatus').then(d => d.outputActive);
    },

    // Full record status — outputActive, outputPaused, outputTimecode,
    // outputDuration (ms), outputBytes.
    recordStats() {
      return call('GetRecordStatus');
    },

    toggleStream() {
      return call('ToggleStream');
    },

    streamStatus() {
      return call('GetStreamStatus').then(d => d.outputActive);
    },

    // Full stream status payload — includes outputBytes (for bitrate calc),
    // outputDuration, outputSkippedFrames/outputTotalFrames, outputCongestion.
    streamStats() {
      return call('GetStreamStatus');
    },

    // Runtime stats — cpuUsage (%), memoryUsage (MB), activeFps, etc.
    stats() {
      return call('GetStats');
    },

    // Mirrors SelectAudioSource in control_v2.js: for every scene, toggle
    // visibility of the three audio scene-items so only the selected one is on.
    setAudioSource(kind) {
      const wanted = AUDIO[kind];
      if (!wanted) return Promise.reject(new Error('unknown audio kind: ' + kind));
      return withSession(obs =>
        obs.call('GetSceneList').then(list => {
          const scenes = list.scenes || [];
          const ops = [];
          scenes.forEach(scene => {
            Object.values(AUDIO).forEach(source => {
              ops.push(
                obs.call('GetSceneItemId', { sceneName: scene.sceneName, sourceName: source })
                  .then(r => obs.call('SetSceneItemEnabled', {
                    sceneName: scene.sceneName,
                    sceneItemId: r.sceneItemId,
                    sceneItemEnabled: source === wanted,
                  }))
                  .catch(() => {}) // source not in this scene — ignore
              );
            });
          });
          return Promise.all(ops);
        })
      );
    },

    currentAudio() {
      // Returns the KEY ('church'|'video'|'backup') of the active source in the
      // current program scene, or null.
      return withSession(obs =>
        obs.call('GetCurrentProgramScene').then(cur => {
          const scene = cur.currentProgramSceneName;
          const entries = Object.entries(AUDIO);
          const probe = ([key, source]) =>
            obs.call('GetSceneItemId', { sceneName: scene, sourceName: source })
              .then(r => obs.call('GetSceneItemEnabled', {
                sceneName: scene, sceneItemId: r.sceneItemId,
              }))
              .then(r => r.sceneItemEnabled ? key : null)
              .catch(() => null);
          return Promise.all(entries.map(probe)).then(r => r.find(Boolean) || null);
        })
      );
    },

    // Show `which` overlay on every camera scene and hide the other.
    // `which` = 'dp' | 'l3rd' | null (null = both off).
    setOverlay(which) {
      const targets = {
        [OVERLAY.dp]:   which === 'dp',
        [OVERLAY.l3rd]: which === 'l3rd',
      };
      return withSession(obs => {
        const ops = [];
        OVERLAY_SCENES.forEach(scene => {
          Object.entries(targets).forEach(([source, visible]) => {
            ops.push(
              obs.call('GetSceneItemId', { sceneName: scene, sourceName: source })
                .then(r => obs.call('SetSceneItemEnabled', {
                  sceneName: scene,
                  sceneItemId: r.sceneItemId,
                  sceneItemEnabled: visible,
                }))
                .catch(() => {})
            );
          });
        });
        return Promise.all(ops);
      });
    },

    // Probe which overlay is currently visible on the first camera scene.
    // Returns 'dp' | 'l3rd' | null.
    currentOverlay() {
      return withSession(obs => {
        const scene = OVERLAY_SCENES[0];
        const probe = (source) =>
          obs.call('GetSceneItemId', { sceneName: scene, sourceName: source })
            .then(r => obs.call('GetSceneItemEnabled', {
              sceneName: scene, sceneItemId: r.sceneItemId,
            }))
            .then(r => r.sceneItemEnabled)
            .catch(() => false);
        return Promise.all([probe(OVERLAY.dp), probe(OVERLAY.l3rd)])
          .then(([dp, l3]) => dp ? 'dp' : (l3 ? 'l3rd' : null));
      });
    },

    SCENE, AUDIO, OVERLAY,
  };
})();

window.OBS = OBS;
