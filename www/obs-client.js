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
    church: {
      label: 'Church Mix',
      source: 'Audio - Church Mix (Main)',
      deviceLabel: 'SQ 1&2',
      deviceId: '{0.0.1.00000000}.{fa59d403-3809-4b68-8015-12f0627133ba}',
    },
    video: {
      label: 'Video Mix',
      source: 'Audio - Video Mix (Aux 5)',
      deviceLabel: 'SQ 5&6',
      deviceId: '{0.0.1.00000000}.{d36dfa1d-f4ab-402f-901f-64e4b8c80d16}',
    },
    backup: {
      label: 'Video Mix (Backup)',
      source: 'Audio - Video Mix (Aux 5 Analogue)',
      deviceLabel: '2- USB Audio CODEC',
      deviceId: '{0.0.1.00000000}.{adf12f0f-7422-423a-9fe9-4d51ca3d845b}',
    },
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
    // Switch program scene. When durationMs is supplied, set the current
    // transition's duration first (in the same session) so the operator's
    // dissolve-speed slider takes effect on this take. Wrapped in catch so a
    // non-configurable transition (e.g. Cut) doesn't block the scene change.
    switchScene(name, durationMs) {
      return withSession(obs => {
        const setDur = (durationMs != null)
          ? obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: Math.round(durationMs) }).catch(() => {})
          : Promise.resolve();
        return setDur.then(() => obs.call('SetCurrentProgramScene', { sceneName: name }));
      });
    },

    currentScene() {
      return call('GetCurrentProgramScene').then(d => d.currentProgramSceneName);
    },

    // Current scene-transition duration in ms (for initialising the
    // dissolve-speed slider so it reflects OBS's actual setting on load).
    transitionDuration() {
      return call('GetCurrentSceneTransition').then(d => d.transitionDuration);
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

    getStreamServiceSettings() {
      return call('GetStreamServiceSettings');
    },

    getRosterStreamTitle() {
      return fetch('roster-current.php', { cache: 'no-store' })
        .then(r => {
          if (!r.ok) throw new Error('Failed to load roster title');
          return r.json();
        })
        .then(d => d && d.stream_title ? String(d.stream_title) : '');
    },

    notifyLiveSite(event, details = {}) {
      return fetch('live-site-event.php', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          video_id: details.video_id || null,
          title: details.title || null,
        }),
      })
        .then(async response => {
          let data = null;
          try { data = await response.json(); } catch (_) {}
          if (!response.ok || !data || !data.ok) {
            throw new Error((data && data.error) || `HTTP ${response.status}`);
          }
          window.Log?.add('broadcast', event === 'live'
            ? 'Live website switched on'
            : 'Live website holding finished broadcast for one hour');
          return data;
        })
        .catch(err => {
          // Never block OBS start/stop if the public website is temporarily unavailable.
          window.Log?.add('broadcast', `Live website event failed: ${err.message || err}`);
          return null;
        });
    },

    startStreamWithRosterTitle() {
      return this.getRosterStreamTitle()
        .catch(() => '')
        .then(title => {
          if (title) {
            window.LS_STREAM_TITLE = title;
            window.dispatchEvent(new CustomEvent('ls:stream-title', { detail: { title } }));
            window.Log?.add('broadcast', `Stream title → ${title}`);
          }
          return fetch('youtube-prepare-stream.php', { cache: 'no-store' })
            .then(async r => {
              let data = null;
              try { data = await r.json(); } catch (_) {}
              if (!r.ok || !data || !data.ok) {
                const err = new Error((data && (data.error || (data.details && data.details.body))) || 'broadcast title/stream prep failed');
                if (data && data.auth_url) err.authUrl = data.auth_url;
                throw err;
              }
              if (data.title) {
                window.Log?.add('broadcast', `YouTube title updated → ${data.title}`);
              }
              if (data.broadcast_id && data.stream_id) {
                window.Log?.add('broadcast', `YouTube broadcast bound → ${data.broadcast_id} / ${data.stream_id}`);
              }
              return data;
            })
            .catch(err => {
              window.Log?.add('broadcast', `YouTube stream prep failed: ${err.message || err}`);
              if (err && err.authUrl) {
                window.Log?.add('broadcast', 'YouTube authorization required; opening Google sign-in');
                sessionStorage.setItem('ls_resume_stream_after_youtube_auth', '1');
                window.location.assign(err.authUrl);
                return new Promise(() => {});
              }
              throw err;
            })
            // The original ARSYS workflow bypasses OBS's YouTube account
            // broadcast manager by using a stream-key profile plus rtmp_custom.
            // Merely setting rtmp_custom is not enough while OBS still has a
            // YouTube Auth.Type loaded: OBS blocks StartStream before output setup.
            .then(data => call('SetCurrentProfile', { profileName: 'Untitled' })
              .then(() => {
                window.Log?.add('broadcast', 'OBS profile switched to stream-key mode');
                return data;
              }))
            .then(data => call('SetStreamServiceSettings', {
              streamServiceType: 'rtmp_custom',
              streamServiceSettings: { server: data.server, key: data.key },
            }).then(() => data))
            .then(data => call('StartStream').then(() => data))
            .then(data => this.notifyLiveSite('live', {
              video_id: data.broadcast_id,
              title: data.title || title,
            }));
        });
    },

    applyCurrentStreamServiceSettings() {
      return call('GetStreamServiceSettings').then(d => {
        if (!d || !d.streamServiceSettings) {
          throw new Error('OBS did not return stream service settings');
        }
        return call('SetStreamServiceSettings', {
          streamServiceType: d.streamServiceType,
          streamServiceSettings: d.streamServiceSettings,
        });
      });
    },

    startStream() {
      return this.startStreamWithRosterTitle();
    },

    stopStream() {
      return call('StopStream').then(() => this.notifyLiveSite('stopped'));
    },

    toggleStream() {
      return this.streamStatus().then(active => {
        if (active) return this.stopStream();
        return this.startStreamWithRosterTitle();
      });
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
                obs.call('GetSceneItemId', { sceneName: scene.sceneName, sourceName: source.source })
                  .then(r => obs.call('SetSceneItemEnabled', {
                    sceneName: scene.sceneName,
                    sceneItemId: r.sceneItemId,
                    sceneItemEnabled: source.source === wanted.source,
                  }))
                  .catch(() => {}) // source not in this scene — ignore
              );
            });
          });
          return Promise.all(ops);
        })
      );
    },

    repairAudioDevices() {
      // Re-apply the desired WASAPI device IDs if OBS starts up with a source
      // pointing at the wrong device or the device was unplugged and later returns.
      return withSession(async obs => {
        const report = [];
        for (const [kind, cfg] of Object.entries(AUDIO)) {
          try {
            const cur = await obs.call('GetInputSettings', { inputName: cfg.source });
            const currentId = cur?.inputSettings?.device_id ?? cur?.inputSettings?.deviceId ?? null;
            if (currentId !== cfg.deviceId) {
              await obs.call('SetInputSettings', {
                inputName: cfg.source,
                inputSettings: { device_id: cfg.deviceId },
                overlay: false,
              });
              report.push({ kind, source: cfg.source, deviceId: cfg.deviceId, changed: true });
            } else {
              report.push({ kind, source: cfg.source, deviceId: cfg.deviceId, changed: false });
            }
          } catch (err) {
            report.push({ kind, source: cfg.source, error: err?.message || String(err) });
          }
        }
        return report;
      });
    },

    currentAudio() {
      // Returns the KEY ('church'|'video'|'backup') of the active source in the
      // current program scene, or null.
      return withSession(obs =>
        obs.call('GetCurrentProgramScene').then(cur => {
          const scene = cur.currentProgramSceneName;
          const entries = Object.entries(AUDIO);
          const probe = ([key, source]) =>
            obs.call('GetSceneItemId', { sceneName: scene, sourceName: source.source })
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

(() => {
  const url = new URL(window.location.href);
  const connected = url.searchParams.get('youtube_connected') === '1';
  const authError = url.searchParams.get('youtube_auth_error');
  if (!connected && !authError) return;

  url.searchParams.delete('youtube_connected');
  url.searchParams.delete('youtube_auth_error');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);

  if (authError) {
    sessionStorage.removeItem('ls_resume_stream_after_youtube_auth');
    window.Log?.add('broadcast', `YouTube authorization failed: ${authError}`);
    return;
  }

  if (sessionStorage.getItem('ls_resume_stream_after_youtube_auth') === '1') {
    sessionStorage.removeItem('ls_resume_stream_after_youtube_auth');
    window.Log?.add('broadcast', 'YouTube connected; resuming stream start');
    window.setTimeout(() => OBS.startStream().catch(err => {
      window.Log?.add('broadcast', `Stream start failed after YouTube authorization: ${err.message || err}`);
    }), 1200);
  }
})();
