// Thin wrapper around OBSWebSocket v5. Each call opens a fresh connection
// (matches the pattern in ../control_v2.js). All functions return
// Promises so the React layer can chain UI updates.

const OBS = (() => {
  const addr = (window.LS_CONFIG || {}).obsAddr;
  const pwd  = (window.LS_CONFIG || {}).obsPassword;

  function open() {
    const obs = new OBSWebSocket();
    return obs.connect(addr, pwd).then(() => obs);
  }

  function call(method, args) {
    return open().then(obs => obs.call(method, args));
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

    toggleStream() {
      return call('ToggleStream');
    },

    streamStatus() {
      return call('GetStreamStatus').then(d => d.outputActive);
    },

    // Mirrors SelectAudioSource in control_v2.js: for every scene, toggle
    // visibility of the three audio scene-items so only the selected one is on.
    setAudioSource(kind) {
      const wanted = AUDIO[kind];
      if (!wanted) return Promise.reject(new Error('unknown audio kind: ' + kind));
      return open().then(obs =>
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
      return open().then(obs =>
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
      return open().then(obs => {
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
      return open().then(obs => {
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
