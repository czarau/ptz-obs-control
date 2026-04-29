// Bottom row: live feeds for each camera + data projection, each with
// a PTZ joystick pad. Right-side dock shows audio meters + stream health +
// TAKE button. Meters/health are static placeholders in v1.

const CAM_META = {
  back:  { id: 'back',  camera: 1, label: 'Camera Back',      scene: 'Camera 1 - Back',  hint: 'PTZ · Back gallery' },
  left:  { id: 'left',  camera: 2, label: 'Camera Left',      scene: 'Camera 2 - Left',  hint: 'PTZ · Stage left' },
  right: { id: 'right', camera: 3, label: 'Camera Right',     scene: 'Camera 3 - Right', hint: 'PTZ · Stage right' },
  data:  { id: 'data',  camera: 0, label: 'Data Projection',  scene: 'DP Full Screen',   hint: 'HDMI · Projector out', isData: true },
};

// Base URLs for direct-to-camera PTZ CGI commands (same hosts the existing
// chatswood/control_v2.js uses).
const CAM_BASE = {
  1: 'https://srv-syd05.chatswoodchurch.org:8806',
  2: 'https://srv-syd05.chatswoodchurch.org:8807',
  3: 'https://srv-syd05.chatswoodchurch.org:8808',
};

// Grab the current frame from a camera's live WebRTC <video>, encode JPEG,
// and POST it to ?cmd=save_thumb so the server-side thumbs/{id}.jpg cache
// is updated. Instant (no camera round-trip, no await needed). Resolves to
// true when stored, false if no frame was available so the caller can fall
// back to a server-side action_snapshot.
window.capturePresetThumb = function (camera, slot) {
  try {
    const video = (window.LIVE_VIDEOS || {})[camera];
    if (!video || !video.videoWidth) return Promise.resolve(false);
    const presetId = (window.LS_CONFIG?.presetStartIndex || 100) + Number(slot);
    const w = 480;
    const h = Math.round(w * video.videoHeight / video.videoWidth) || 270;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    return new Promise(resolve => {
      canvas.toBlob(blob => {
        if (!blob) { resolve(false); return; }
        const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
        fetch(`${endpoint}?cmd=save_thumb&id=${presetId}`, { method: 'POST', body: blob })
          .then(r => resolve(r.ok))
          .catch(() => resolve(false));
      }, 'image/jpeg', 0.85);
    });
  } catch (_) { return Promise.resolve(false); }
};

// Shared brief-pulse helper for keyboard shortcuts and per-arrow wheel.
// Goes through the PHP proxy so digest-auth is handled server-side.
const _pulseTimers = {};
function pulseCgi(camera, startQ, stopQ, ms) {
  if (!camera || camera < 1 || camera > 3) return;
  const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
  fetch(`${endpoint}?cmd=cgi&camera=${camera}&q=${encodeURIComponent('ptzcmd&' + startQ)}`).catch(() => {});
  const key = `${camera}:${stopQ}`;
  if (_pulseTimers[key]) clearTimeout(_pulseTimers[key]);
  _pulseTimers[key] = setTimeout(() => {
    fetch(`${endpoint}?cmd=cgi&camera=${camera}&q=${encodeURIComponent('ptzcmd&' + stopQ)}`).catch(() => {});
    _pulseTimers[key] = null;
  }, ms || 180);
  if (stopQ === 'ptzstop') {
    window.dispatchEvent(new CustomEvent('ptz:manual-move', { detail: { camera } }));
  }
}
window.pulseCgi = pulseCgi;

// All camera CGI calls go through control_thumb.php?cmd=cgi on the server,
// which handles the digest-auth that PTZOptics firmware 6.3.45+ requires.
// Browser can't easily do digest auth cross-origin, so this is the cleanest
// path and lets us keep one credential cache in PHP.
function ptzCmd(camera, query) {
  if (!camera || camera < 1 || camera > 3) return;
  const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
  const q = encodeURIComponent('ptzcmd&' + query);
  fetch(`${endpoint}?cmd=cgi&camera=${camera}&q=${q}`).catch(() => {});
  // Any manual jog (pan/tilt/zoom/focus movement) invalidates the "at-position"
  // marker for this camera. Preset recalls (poscall) and stops are not manual
  // — they either set or don't disturb the CUE state.
  const isManual = /^(left|right|up|down|leftup|rightup|leftdown|rightdown|zoomin|zoomout|focusin|focusout)\b/i.test(query);
  if (isManual) {
    window.dispatchEvent(new CustomEvent('ptz:manual-move', { detail: { camera } }));
  }
}

// Focus mode / one-push AF goes through control_thumb.php → VISCA
// (PTZOptics 30X NDI doesn't expose focus mode over the HTTP CGI — only
// movement commands work there). Corresponding server-side handlers are
// cmd=focus_auto / focus_manual / focus_onepush.
function focusCmd(camera, cmd) {
  const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
  fetch(`${endpoint}?cmd=${cmd}&camera=${camera}&ts=${Date.now()}`).catch(() => {});
  window.Log?.add('camera', `Focus ${cmd.replace('focus_', '')} · Cam ${camera}`);
}

function LiveFeedRow({ liveCamId, setLiveCam, cuedSceneId, setCuedSceneId, takeCuedScene, overlays, setOverlays, onTake, ptzSpeed }) {
  const cams = [CAM_META.back, CAM_META.left, CAM_META.right, CAM_META.data];
  const menu = useContextMenu();

  const openFeedContext = (e, c) => {
    if (c.isData) return;
    // "Update" iterates all presets stored for this camera, recalls each
    // in turn, waits for arrival (settle), refreshes the thumb, then moves
    // on. Each step:
    //   1. Dispatch preset:updating → PresetGrid highlights the current
    //      thumb with a CUE badge so operators can see progress in the
    //      grid as the sweep enumerates.
    //   2. Fire goto_abs (preferred, abs values) or poscall (legacy).
    //   3. settle() on VISCA — no fixed wall clock.
    //   4. Dispatch preset:refresh → PresetGrid snapshots the now-
    //      stationary view and bumps the thumb's cache-buster.
    //   5. Log progress `Update i/N · Cam C · Label` so the activity
    //      panel reads like a rundown.
    const items = [
      {
        label: 'Update Presets',
        icon: <Icon name="rotate" size={13}/>,
        onClick: async () => {
          const presets = (window.LS_CONFIG?.presets || []);
          const startIndex = window.LS_CONFIG?.presetStartIndex || 100;
          const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
          const matches = presets
            .map((p, slot) => ({ p, slot }))
            .filter(x => x.p && String(x.p.camera) === String(c.camera));
          const N = matches.length;
          window.Log?.add('camera', `Update thumbs · Cam ${c.camera}`, `${N} presets — sweeping now`);

          for (let i = 0; i < N; i++) {
            const { p, slot } = matches[i];
            const presetId = startIndex + slot;
            const label = p.label || `slot ${slot}`;

            window.Log?.add('camera', `Update ${i + 1}/${N} · Cam ${c.camera}`, label);
            // Tell PresetGrid which thumb is currently being updated so it
            // can show the CUE badge as the cursor walks the grid.
            window.dispatchEvent(new CustomEvent('preset:updating', {
              detail: { camera: c.camera, slot }
            }));

            // Prefer abs position when we have it (firmware-resilient);
            // fall back to legacy poscall for pre-migration presets.
            const hasAbs = p.pan != null && p.tilt != null;
            if (hasAbs) {
              const params = new URLSearchParams({
                cmd: 'goto_abs', camera: String(c.camera),
                pan: String(p.pan), tilt: String(p.tilt),
              });
              if (p.zoom  != null) params.set('zoom',  String(p.zoom));
              if (p.focus != null) params.set('focus', String(p.focus));
              try { await fetch(`${endpoint}?${params}`); } catch (_) {}
            } else {
              ptzCmd(c.camera, `poscall&${presetId}`);
            }

            // Wait for the camera to physically arrive, not a fixed timer.
            await (window.PTZState?.settle(c.camera) || Promise.resolve(null));

            // Refresh the thumb now that the view is stationary. The
            // preset:refresh listener in PresetGrid handles the snapshot
            // (WebRTC-first with server fallback) and cache-bust bump.
            window.dispatchEvent(new CustomEvent('preset:refresh', {
              detail: { camera: c.camera, slot }
            }));

            // Small breather so the refresh snapshot has time to write to
            // disk before the next move starts potentially clobbering the
            // live <video> buffer.
            await new Promise(r => setTimeout(r, 400));
          }

          // Sweep finished — clear the "updating" cursor.
          window.dispatchEvent(new CustomEvent('preset:updating', {
            detail: { camera: c.camera, slot: null }
          }));
          window.Log?.add('camera', `Update complete · Cam ${c.camera}`, `${N} presets refreshed`);
        },
      },
    ];
    menu.open(e, items);
  };

  // Click model mirrors the preset thumbs:
  //   - click a feed that's already on-air → no-op (already live)
  //   - click the currently-cued feed → takes it live
  //   - click any other feed → arms the cue on it (replaces any prior cue,
  //     only one scene can be cued at a time)
  const onFeedClick = (c) => {
    if (liveCamId === c.id) return;
    if (cuedSceneId === c.id) {
      takeCuedScene && takeCuedScene();
      return;
    }
    setCuedSceneId && setCuedSceneId(c.id);
    window.Log?.add('live', `CUE scene → ${c.label}`, c.scene);
  };

  return (
    <div className="feed-row">
      {cams.map(c => (
        <LiveFeed
          key={c.id}
          cam={c}
          onAir={liveCamId === c.id}
          cued={cuedSceneId === c.id}
          ptzSpeed={ptzSpeed}
          onClick={() => onFeedClick(c)}
          onContextMenu={(e) => openFeedContext(e, c)}
        />
      ))}
      <OverlayDock overlays={overlays} setOverlays={setOverlays} onTake={onTake}/>
      <ContextMenu state={menu.state} onClose={menu.close} />
    </div>
  );
}

const { useState: useStateLF, useEffect: useEffectLF, useRef: useRefLF } = React;

function LiveFeed({ cam, onAir, cued, onClick, onContextMenu, ptzSpeed }) {
  const videoRef = useRefLF(null);

  // Spin up a WebRTC peer connection when the element mounts, tear it down on unmount.
  useEffectLF(() => {
    const url = (window.LS_CONFIG?.webrtcStreams || {})[cam.id];
    if (!url || !videoRef.current || !window.startWebRTCPlay) return;
    const pc = window.startWebRTCPlay(videoRef.current, url);
    return () => { try { pc && pc.close(); } catch (_) {} };
  }, [cam.id]);

  // Expose the <video> so the preset grid can grab a live frame and push it
  // to the server as the outgoing thumb before the camera moves.
  useEffectLF(() => {
    if (!cam.camera || cam.camera === 0) return;
    if (!window.LIVE_VIDEOS) window.LIVE_VIDEOS = {};
    window.LIVE_VIDEOS[cam.camera] = videoRef.current;
    return () => {
      if (window.LIVE_VIDEOS && window.LIVE_VIDEOS[cam.camera] === videoRef.current) {
        delete window.LIVE_VIDEOS[cam.camera];
      }
    };
  }, [cam.camera]);


  const onDragStart = cam.camera > 0 ? (e) => {
    // Carry the camera number so preset thumbs can drop-save its current
    // PTZ values. Use a custom mime so random drops elsewhere ignore it.
    e.dataTransfer.setData('application/x-ls-camera', String(cam.camera));
    e.dataTransfer.setData('text/plain', `Camera ${cam.camera}`);
    e.dataTransfer.effectAllowed = 'copy';
    window.Log?.add('camera', `Drag start · ${cam.label}`, 'drop on a preset thumb to save');
  } : undefined;

  return (
    <div
      className={"feed" + (onAir ? " feed-onair" : "") + (cued && !onAir ? " feed-cue" : "")}
      onContextMenu={onContextMenu}
    >
      <div className="feed-head">
        <span className="feed-head-left">
          {cam.camera > 0 && (
            <span className={"thumb-num" + (onAir ? " num-live" : "") + (cued && !onAir ? " num-cue" : "")}>{cam.camera}</span>
          )}
          <span className="feed-title">{cam.label}</span>
        </span>
        {onAir && <span className="feed-live"><span/>LIVE</span>}
        {cued && !onAir && <span className="feed-cuebadge">CUE</span>}
        {!onAir && !cued && <span className="feed-hint">{cam.hint}</span>}
      </div>
      {/* draggable on feed-img only so ptzpad arrows / zoom / focus buttons
       *  below remain interactive (mousedown there would otherwise start a
       *  drag instead of panning the camera). */}
      <button
        className="feed-img"
        onClick={onClick}
        draggable={cam.camera > 0}
        onDragStart={onDragStart}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noplaybackrate nopictureinpicture noremoteplayback"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }}
        />
        {cam.isData && (
          <div className="feed-data-overlay">
            <div className="feed-data-label">Data Projection</div>
          </div>
        )}
      </button>
      {!cam.isData && <PTZPad camera={cam.camera} ptzSpeed={ptzSpeed} />}
      {cam.isData && <DataControls dataLive={onAir} />}
    </div>
  );
}

// Each wheel tick (re)schedules a stop pulse, but only fires a START command
// when state actually changes (direction OR slow/fast). This matters because
// every ptzCmd fetch triggers a digest-auth handshake server-side (~200-300ms
// per command); the browser caps concurrent fetches at ~6/origin, so if we
// fired a start on every wheel tick a fast scroll burst would queue up 10+
// starts ahead of the eventual stop, which then arrives at the camera
// hundreds of ms after the wheel went quiet — i.e. "panning doesn't stop
// when wheel stops".
//
// Speed model — matches legacy v1 (control_v2.js ~line 980):
//   - one isolated tick of the wheel = slowSpeed (a fine nudge)
//   - rapid scrolling (events <FAST_GAP_MS apart) = fastSpeed (the operator's
//     full slider value)
// Continuous one-direction scroll therefore sends one slow start, one fast
// start as the burst accelerates, then exactly one stop when the wheel goes
// quiet — three commands total, no queue contention.
const PULSE_MS = 160;
const FAST_GAP_MS = 80;

function makePulser(stopCmd, sendStart, fastSpeed, slowSpeed) {
  let stopTimer = null;
  let lastTick = 0;
  let activeDir = null;
  let activeFast = false;
  return (dir) => {
    const now = Date.now();
    const fast = (now - lastTick) < FAST_GAP_MS;
    lastTick = now;

    // Only re-issue start when state changed. While the camera is already
    // moving in the right direction at the right speed, all we need is to
    // keep pushing the stop timer back.
    if (activeDir !== dir || activeFast !== fast) {
      sendStart(dir, fast ? fastSpeed : slowSpeed);
      activeDir = dir;
      activeFast = fast;
    }

    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      stopCmd();
      stopTimer = null;
      activeDir = null;
      activeFast = false;
    }, PULSE_MS);
  };
}

function PTZPad({ camera, ptzSpeed = 6 }) {
  // Scale 1-10 UI speed → 1-24 camera range (pan/tilt) and 1-7 (zoom/focus)
  const panSpeed  = Math.max(1, Math.min(24, Math.round(ptzSpeed * 2.4)));
  const zoomSpeed = Math.max(1, Math.min(7, Math.round(ptzSpeed * 0.7)));

  // Right-click on the HOME button captures the camera's current pan/tilt/
  // zoom/focus as that camera's home position. Each PTZPad has its own
  // context-menu hook / <ContextMenu> render so the popup anchors to the
  // pad the operator right-clicked. There's no "clear" — overwrite by
  // re-saving from a different position.
  const homeMenu = useContextMenu();

  const saveHomeAbs = async () => {
    const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
    const user = (window.LS_CONFIG || {}).user || 'chatswood';
    const pos = await (window.PTZState?.query(camera) || Promise.resolve(null));
    if (!pos) {
      window.Log?.add('error', `Save Home · could not read Cam ${camera} position`);
      return;
    }
    const params = new URLSearchParams({
      cmd: 'set_home_abs',
      user,
      camera: String(camera),
      pan:   String(pos.pan),
      tilt:  String(pos.tilt),
      zoom:  String(pos.zoom),
      focus: String(pos.focus),
      ts:    String(Date.now()),
    });
    try { await fetch(`${endpoint}?${params}`); } catch (_) {}
    if (!window.LS_CONFIG) window.LS_CONFIG = {};
    if (!window.LS_CONFIG.homeAbs || typeof window.LS_CONFIG.homeAbs !== 'object') {
      window.LS_CONFIG.homeAbs = {};
    }
    window.LS_CONFIG.homeAbs[String(camera)] = {
      pan: pos.pan, tilt: pos.tilt, zoom: pos.zoom, focus: pos.focus,
    };
    window.Log?.add(
      'camera',
      `Save Home · Cam ${camera}`,
      `p=${pos.pan} t=${pos.tilt} z=${pos.zoom} f=${pos.focus}`
    );
  };

  const onHomeContext = (e) => {
    homeMenu.open(e, [
      {
        label: 'Save Home (current position)',
        icon: <Icon name="save" size={13}/>,
        onClick: saveHomeAbs,
      },
    ]);
  };

  // Press-and-hold motion uses the slider speed directly (continuous motion
  // under the user's finger, so they control the duration). The optional
  // `spd` argument is for the wheel pulser, which substitutes its own
  // slow/fast value — see makePulser.
  const start = (direction, spd) => {
    const p = spd ?? panSpeed;
    const s = `${p}&${p}`;
    const map = {
      t: `up&${s}`, b: `down&${s}`, l: `left&${s}`, r: `right&${s}`,
      tl: `leftup&${s}`, tr: `rightup&${s}`, bl: `leftdown&${s}`, br: `rightdown&${s}`,
    };
    if (map[direction]) ptzCmd(camera, map[direction]);
  };
  const stop = () => ptzCmd(camera, 'ptzstop');
  const zoomStart  = (kind, spd) => ptzCmd(camera, `${kind === 'wide' ? 'zoomout' : 'zoomin'}&${spd ?? zoomSpeed}`);
  const zoomStop   = () => ptzCmd(camera, 'zoomstop');
  const focusStart = (kind, spd) => ptzCmd(camera, `${kind === 'near' ? 'focusin' : 'focusout'}&${spd ?? zoomSpeed}`);
  const focusStop  = () => ptzCmd(camera, 'focusstop');

  // Wheel handlers — each tick = one short slow pulse, with a fast-scroll
  // boost when ticks come in close together. Slow-tick speeds are the
  // legacy 1-of-the-range minimum so a single notch is a fine nudge; fast
  // scroll bumps to the user's slider value for big moves.
  const pulseZoom  = React.useMemo(
    () => makePulser(zoomStop, (kind, spd) => zoomStart(kind, spd), zoomSpeed, 1),
    [camera, ptzSpeed]
  );
  const pulseFocus = React.useMemo(
    () => makePulser(focusStop, (kind, spd) => focusStart(kind, spd), zoomSpeed, 1),
    [camera, ptzSpeed]
  );
  const pulsePan   = React.useMemo(
    () => makePulser(stop, (dir, spd) => start(dir, spd), panSpeed, 2),
    [camera, ptzSpeed]
  );

  const onZoomWheel = (e) => {
    e.preventDefault();
    pulseZoom(e.deltaY < 0 ? 'tele' : 'wide');
  };
  const onFocusWheel = (e) => {
    e.preventDefault();
    pulseFocus(e.deltaY < 0 ? 'far' : 'near');
  };

  // Pairs every arrow with its opposite so reverse-scrolling on a button
  // pans the camera the other way (e.g. wheel-down while hovering the UP
  // arrow tilts down). Lets the operator make a pair of fine corrections
  // in opposite directions without moving the cursor between two buttons.
  const PAN_OPPOSITE = {
    t:  'b',  b:  't',
    l:  'r',  r:  'l',
    tl: 'br', br: 'tl',
    tr: 'bl', bl: 'tr',
  };

  // Press+release handlers. Mousewheel pulses the arrow's primary direction
  // when scrolled "forward" (wheel up), and the OPPOSITE direction when
  // scrolled the other way — so wheel-up on UP nudges up, wheel-down on UP
  // nudges down. Same pulser handles both, so fast-scroll boost still works
  // when alternating directions on a single button.
  const pan = (d) => ({
    onMouseDown: () => start(d),
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: () => start(d),
    onTouchEnd: stop,
    onWheel: (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? d : PAN_OPPOSITE[d];
      if (dir) pulsePan(dir);
    },
  });
  const ctrl = (onStart, onEnd) => ({
    onMouseDown: onStart, onMouseUp: onEnd, onMouseLeave: onEnd,
    onTouchStart: onStart, onTouchEnd: onEnd,
  });

  return (
    <div className="ptzpad">
      <div className="ptzpad-joy" aria-label="Pan/Tilt">
        <div className="joy-ring">
          <button className="joy-arrow joy-tl" aria-label="Pan up-left"   {...pan('tl')}><Arrow d="tl"/></button>
          <button className="joy-arrow joy-t"  aria-label="Tilt up"       {...pan('t')}><Arrow d="t"/></button>
          <button className="joy-arrow joy-tr" aria-label="Pan up-right"  {...pan('tr')}><Arrow d="tr"/></button>
          <button className="joy-arrow joy-r"  aria-label="Pan right"     {...pan('r')}><Arrow d="r"/></button>
          <button className="joy-arrow joy-br" aria-label="Pan down-right"{...pan('br')}><Arrow d="br"/></button>
          <button className="joy-arrow joy-b"  aria-label="Tilt down"     {...pan('b')}><Arrow d="b"/></button>
          <button className="joy-arrow joy-bl" aria-label="Pan down-left" {...pan('bl')}><Arrow d="bl"/></button>
          <button className="joy-arrow joy-l"  aria-label="Pan left"      {...pan('l')}><Arrow d="l"/></button>
          {/* HOME + joy arrows — track toggle sits below this ring.
            * Right-click captures the current PTZ position as this camera's
            * home (see saveHomeAbs above). Left-click drives the camera to
            * the saved home_abs position, or to the factory home if no
            * home_abs has been captured yet. */}
          <button
            className="joy-center"
            aria-label="Home"
            onContextMenu={onHomeContext}
            onClick={() => {
              const homeAbs = (window.LS_CONFIG?.homeAbs || {})[String(camera)];
              if (homeAbs && homeAbs.pan != null && homeAbs.tilt != null) {
                const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
                const params = new URLSearchParams({
                  cmd: 'goto_abs',
                  camera: String(camera),
                  pan:   String(homeAbs.pan),
                  tilt:  String(homeAbs.tilt),
                });
                if (homeAbs.zoom  != null) params.set('zoom',  String(homeAbs.zoom));
                if (homeAbs.focus != null) params.set('focus', String(homeAbs.focus));
                fetch(`${endpoint}?${params}`).catch(() => {});
                window.Log?.add('camera', `Home · Cam ${camera}`,
                  `p=${homeAbs.pan} t=${homeAbs.tilt} z=${homeAbs.zoom ?? '—'} f=${homeAbs.focus ?? '—'}`);
              } else {
                ptzCmd(camera, 'home');
                window.Log?.add('camera', `Home · Cam ${camera}`, 'factory home (no saved position)');
              }
            }}
          >
            <span className="joy-center-dot" />
            <span className="joy-center-label">HOME</span>
          </button>
        </div>
      </div>
      {camera === 1 && <FollowFaceToggle camera={camera} />}
      <div className="ptzpad-controls">
        <div className="ctrl-group" onWheel={onZoomWheel}>
          <div className="ctrl-label">ZOOM</div>
          <div className="ctrl-pair">
            <button className="ctrl-btn" aria-label="Zoom tele" {...ctrl(() => zoomStart('tele'), zoomStop)}><ZoomIcon kind="tele"/><em>TELE</em></button>
            <button className="ctrl-btn" aria-label="Zoom wide" {...ctrl(() => zoomStart('wide'), zoomStop)}><ZoomIcon kind="wide"/><em>WIDE</em></button>
          </div>
        </div>
        <div className="ctrl-group" onWheel={onFocusWheel}>
          <div className="ctrl-label">FOCUS</div>
          <div className="ctrl-pair">
            <button className="ctrl-btn" aria-label="Focus near" {...ctrl(() => focusStart('near'), focusStop)}><FocusIcon kind="near"/><em>NEAR</em></button>
            <button className="ctrl-btn" aria-label="Focus far"  {...ctrl(() => focusStart('far'),  focusStop)}><FocusIcon kind="far"/><em>FAR</em></button>
          </div>
          <button className="ctrl-auto" aria-label="Auto focus" onClick={() => focusCmd(camera, 'focus_auto')}>AUTO</button>
        </div>
      </div>
      <ContextMenu state={homeMenu.state} onClose={homeMenu.close} />
    </div>
  );
}

// Face-tracking toggle. Calls the CMP (PTZOptics Camera Management Platform)
// running on srv-syd05:8810 via the existing control_thumb.php?cmd=face
// wrapper. Local state — the CMP doesn't expose a status endpoint, so toggles
// are optimistic and persist only until the page reloads. Sits compact under
// the joystick ring so it reads as "part of the PTZ".
function FollowFaceToggle({ camera }) {
  const [on, setOn] = useStateLF(false);
  const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';

  const toggle = () => {
    const next = !on;
    setOn(next);
    fetch(`${endpoint}?cmd=face&camera=${camera}&pos=${next ? 1 : 0}&ts=${Date.now()}`).catch(() => {});
    window.Log?.add('camera', `Face tracking ${next ? 'ON' : 'OFF'} · Cam ${camera}`);
  };

  return (
    <button
      className={"ctrl-track" + (on ? " on" : "")}
      aria-pressed={on}
      onClick={toggle}
      title={on ? 'Stop face tracking' : 'Start face tracking'}
    >
      <span className="ctrl-track-dot" />
      <em>{on ? 'TRACKING' : 'FOLLOW FACE'}</em>
    </button>
  );
}

function ZoomIcon({ kind }) {
  const tele = kind === "tele";
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="4"/>
      <path d="M9 9l3 3"/>
      <path d={tele ? "M4 6h4M6 4v4" : "M4 6h4"}/>
    </svg>
  );
}
function FocusIcon({ kind }) {
  const near = kind === "near";
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r={near ? 2.5 : 5}/>
      <circle cx="7" cy="7" r="1" fill="currentColor"/>
    </svg>
  );
}

function Arrow({ d }) {
  const rot = { t: 0, tr: 45, r: 90, br: 135, b: 180, bl: 225, l: 270, tl: 315 }[d] || 0;
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M5 1 L9 6 L6.5 6 L6.5 9 L3.5 9 L3.5 6 L1 6 Z" fill="currentColor"/>
    </svg>
  );
}

function DataControls({ dataLive }) {
  const [overlay, setOverlayState] = useStateLF(null); // 'dp' | 'l3rd' | null
  // Slides is a *sticky preference* — not a live reflection of the current
  // OBS scene. When ON, taking the data feed live switches OBS to the
  // 'DP & Speaker' composite; when OFF, to 'DP Full Screen'. Toggling Slides
  // while data isn't live just updates the preference; the next take of
  // data picks the right scene. (Previously a 5s OBS poll forced this back
  // to false whenever a camera was on program, which meant clicking the
  // data feed always went to 'DP Full Screen' and silently turned Slides
  // off — the bug this replaces.)
  const [slides, setSlidesRaw] = useStateLF(!!window.LS_SLIDES);

  // Mirror to window so app.jsx's takeCuedScene can read the preference
  // when picking which data scene to switch to. (DataControls is buried
  // several layers deep, so a shared global is cheaper than threading
  // state up to App.)
  const setSlides = (v) => {
    window.LS_SLIDES = v;
    setSlidesRaw(v);
  };
  useEffectLF(() => { window.LS_SLIDES = slides; }, []); // initialize on mount

  // Overlay sync still polls OBS — overlays are a true reflection of the
  // current scene's source visibility and have no preference semantics.
  useEffectLF(() => {
    if (!window.OBS) return;
    let alive = true;
    const sync = () => {
      window.OBS.currentOverlay().then(kind => { if (alive) setOverlayState(kind); }).catch(() => {});
    };
    sync();
    const id = setInterval(sync, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const toggleOverlay = (kind) => {
    const next = overlay === kind ? null : kind;
    setOverlayState(next); // optimistic
    if (window.OBS) window.OBS.setOverlay(next).catch(() => {});
    window.Log?.add('live', next ? `Overlay → ${next === 'dp' ? 'DP' : 'Lower Third'}` : 'Overlay off');
  };

  // Slides toggle:
  //   - update the sticky preference always
  //   - switch OBS scene only if data is currently live (otherwise the
  //     preference will be applied next time data is taken)
  const toggleSlides = () => {
    const next = !slides;
    setSlides(next);
    if (dataLive) {
      const target = next ? 'DP & Speaker' : 'DP Full Screen';
      if (window.OBS) window.OBS.switchScene(target).catch(() => {});
      window.Log?.add('live', `Slides ${next ? 'ON' : 'OFF'} → ${target}`);
    } else {
      window.Log?.add('live', `Slides preference ${next ? 'ON' : 'OFF'}`,
        next ? 'next take of data → DP & Speaker' : 'next take of data → DP Full Screen');
    }
  };

  return (
    <div className="data-ctrls">
      <button
        className={"datbtn" + (overlay === 'dp' ? " on" : "")}
        onClick={() => toggleOverlay('dp')}
      >
        {overlay === 'dp' && <span className="dot dot-green"/>}
        Overlay
      </button>
      <button
        className={"datbtn" + (overlay === 'l3rd' ? " on" : "")}
        onClick={() => toggleOverlay('l3rd')}
      >
        {overlay === 'l3rd' && <span className="dot dot-green"/>}
        Lower Third
      </button>
      <button
        className={"datbtn" + (slides ? " on" : "")}
        onClick={toggleSlides}
      >
        {slides && <span className="dot dot-green"/>}
        Slides
      </button>
    </div>
  );
}

// Display-label → OBS input name (matches the three sources the audio-source
// radio in the left rail switches between). MASTER is a computed "max of
// all three" — OBS has no single program-audio bus.
const METER_SOURCES = {
  'CHURCH MIX': 'Audio - Church Mix (Main)',
  'VIDEO MIX':  'Audio - Video Mix (Aux 5)',
  'BACKUP':     'Audio - Video Mix (Aux 5 Analogue)',
};

function OverlayDock({ overlays, setOverlays, onTake }) {
  // Subscribe once for the whole dock; each <Meter> below reads the latest
  // value out of window.OBSMeters at every re-render.
  const [, setMeterTick] = useStateLF(0);
  useEffectLF(() => {
    if (!window.OBSMeters) return;
    return window.OBSMeters.subscribe(() => setMeterTick(t => t + 1));
  }, []);

  // Track which audio source is currently the program audio so the ACTIVE
  // badge can shift between the three source rows.
  const [activeAudio, setActiveAudio] = useStateLF(null);
  useEffectLF(() => {
    if (!window.OBS) return;
    let alive = true;
    const sync = () => {
      window.OBS.currentAudio()
        .then(k => { if (alive) setActiveAudio(k); })
        .catch(() => {});
    };
    sync();
    const id = setInterval(sync, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const lvl = (label) => (window.OBSMeters?.get(METER_SOURCES[label])) || null;
  const lChurch = lvl('CHURCH MIX');
  const lVideo  = lvl('VIDEO MIX');
  const lBackup = lvl('BACKUP');
  // MASTER = max of the three (both instantaneous and held peaks).
  const masterLevel = {
    mag:      Math.max(lChurch?.mag      || 0, lVideo?.mag      || 0, lBackup?.mag      || 0),
    peak:     Math.max(lChurch?.peak     || 0, lVideo?.peak     || 0, lBackup?.peak     || 0),
    heldPeak: Math.max(lChurch?.heldPeak || 0, lVideo?.heldPeak || 0, lBackup?.heldPeak || 0),
  };

  const activeLabelFor = { church: 'CHURCH MIX', video: 'VIDEO MIX', backup: 'BACKUP' }[activeAudio];

  return (
    <div className="dock">
      <div className="dock-sec">
        <div className="dock-head">Output Meters</div>
        <Meter label="CHURCH MIX" level={lChurch}       active={activeLabelFor === 'CHURCH MIX'} />
        <Meter label="VIDEO MIX"  level={lVideo}        active={activeLabelFor === 'VIDEO MIX'} />
        <Meter label="BACKUP"     level={lBackup}       active={activeLabelFor === 'BACKUP'} muted={!lBackup} />
        <Meter label="MASTER"     level={masterLevel}   master />
      </div>

      <div className="dock-sec">
        <div className="dock-head">Stream Health</div>
        <StreamHealth />
      </div>

      <div className="dock-sec dock-take">
        <button className="take-btn" onClick={onTake}>
          <span>TAKE</span>
          <em>Space</em>
        </button>
      </div>
    </div>
  );
}

// Convert linear magnitude (0..1) to dB (-60..0). 0 → -60 (silence floor).
function magToDb(v) {
  if (!v || v <= 0) return -60;
  const db = 20 * Math.log10(v);
  return Math.max(-60, Math.min(0, db));
}
// Map dB (-60..0) to bar fill (0..1). -60 silence, 0 full scale.
const dbToPct = (db) => Math.max(0, Math.min(1, (db + 60) / 60));

function Meter({ label, level, active, muted, master }) {
  const mag      = level?.mag      || 0;
  const heldPeak = level?.heldPeak || level?.peak || 0;

  const magDb      = magToDb(mag);
  const heldPeakDb = magToDb(heldPeak);
  const magPct     = dbToPct(magDb);
  const heldPct    = dbToPct(heldPeakDb);

  const segs = 24;

  return (
    <div className={"meter" + (muted ? " muted" : "") + (master ? " master" : "")}>
      <div className="meter-label">
        <span>{label}</span>
        {active && <span className="meter-badge">ACTIVE</span>}
      </div>
      <div className="meter-bar">
        {Array.from({length: segs}).map((_, i) => {
          const segFrac = i / segs;
          // Broadcast-convention tone thresholds: green to -18 dB, yellow
          // -18 to -6, red above -6. (-18 dB ≈ 70% on a 60dB range.)
          const on = segFrac < magPct;
          const atPeak = !on && Math.abs(segFrac - heldPct) < 1 / segs;
          const tone = segFrac < 0.70 ? "g" : segFrac < 0.90 ? "y" : "r";
          return <span key={i} className={`seg seg-${tone}` + (on ? " on" : "") + (atPeak ? " peak" : "")}/>;
        })}
      </div>
      <div className="meter-num">{mag > 0 ? `${magDb.toFixed(0)} dB` : '-∞ dB'}</div>
    </div>
  );
}

function StreamHealth() {
  // Ticks every second so rows re-read window.LS_HEALTH (populated by the
  // App-level OBS poll). Cheap — this whole block is tiny.
  const [, tick] = useStateLF(0);
  useEffectLF(() => {
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const h = window.LS_HEALTH || {};
  const fmt = (v, d = '—') => (v == null ? d : v);
  // Congestion is 0..1 where lower = healthier; green < 0.3, red > 0.8.
  const good = (k, v) => {
    if (v == null) return false;
    if (k === 'bitrate')  return v > 0;
    if (k === 'dropped')  return v === 0;
    if (k === 'cpu')      return v < 70;
    return false;
  };
  return (
    <>
      <HealthRow label="Bitrate"  value={fmt(h.bitrateKbps)}  unit="kbps"   good={good('bitrate', h.bitrateKbps)} />
      <HealthRow label="Dropped"  value={fmt(h.droppedFrames)} unit="frames" good={good('dropped', h.droppedFrames)} />
      <HealthRow label="Congestion" value={h.congestion != null ? h.congestion.toFixed(2) : '—'} unit="q" good={h.congestion != null && h.congestion < 0.3} />
      <HealthRow label="Frames"   value={fmt(h.totalFrames)}  unit="total" />
      <HealthRow label="CPU"      value={fmt(h.cpu)}          unit="%"      good={good('cpu', h.cpu)} />
    </>
  );
}

function HealthRow({ label, value, unit, good }) {
  return (
    <div className="health">
      <span className="health-label">{label}</span>
      <span className="health-value">
        <b>{value}</b><em>{unit}</em>
        {good && <span className="health-dot"/>}
      </span>
    </div>
  );
}

Object.assign(window, { LiveFeedRow });
