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

function LiveFeedRow({ liveCamId, setLiveCam, overlays, setOverlays, onTake, ptzSpeed }) {
  const cams = [CAM_META.back, CAM_META.left, CAM_META.right, CAM_META.data];
  const menu = useContextMenu();

  const openFeedContext = (e, c) => {
    if (c.isData) return;
    // "Update" iterates all presets stored for this camera, recalls each in
    // turn, waits for arrival, and broadcasts a refresh event the PresetGrid
    // listens for so it can bump each thumb's cache-bust timestamp.
    const items = [
      {
        label: 'Update',
        icon: <Icon name="rotate" size={13}/>,
        onClick: () => {
          const presets = (window.LS_CONFIG?.presets || []);
          const startIndex = window.LS_CONFIG?.presetStartIndex || 100;
          const matches = presets
            .map((p, slot) => ({ p, slot }))
            .filter(x => x.p && String(x.p.camera) === String(c.camera));
          window.Log?.add('camera', `Update thumbs · Cam ${c.camera}`, `${matches.length} presets`);
          matches.forEach((x, i) => {
            setTimeout(() => {
              // Recall the preset through the auth-aware PHP proxy, wait
              // for the camera to arrive, then fire the refresh event
              // (preset-grid's handler snapshots and bumps the thumb).
              const presetId = startIndex + x.slot;
              ptzCmd(c.camera, `poscall&${presetId}`);
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('preset:refresh', {
                  detail: { camera: c.camera, slot: x.slot }
                }));
              }, 5000);
            }, i * 6000);
          });
        },
      },
    ];
    menu.open(e, items);
  };

  return (
    <div className="feed-row">
      {cams.map(c => (
        <LiveFeed
          key={c.id}
          cam={c}
          onAir={liveCamId === c.id}
          ptzSpeed={ptzSpeed}
          onClick={() => {
            setLiveCam(c.id);
            if (window.OBS) window.OBS.switchScene(c.scene).catch(() => {});
            window.Log?.add('live', `LIVE feed → ${c.label}`, c.scene);
          }}
          onContextMenu={(e) => openFeedContext(e, c)}
        />
      ))}
      <OverlayDock overlays={overlays} setOverlays={setOverlays} onTake={onTake}/>
      <ContextMenu state={menu.state} onClose={menu.close} />
    </div>
  );
}

const { useState: useStateLF, useEffect: useEffectLF, useRef: useRefLF } = React;

function LiveFeed({ cam, onAir, onClick, onContextMenu, ptzSpeed }) {
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
  } : undefined;

  return (
    <div
      className={"feed" + (onAir ? " feed-onair" : "")}
      onContextMenu={onContextMenu}
      draggable={cam.camera > 0}
      onDragStart={onDragStart}
    >
      <div className="feed-head">
        <span className="feed-head-left">
          {cam.camera > 0 && (
            <span className={"thumb-num" + (onAir ? " num-live" : "")}>{cam.camera}</span>
          )}
          <span className="feed-title">{cam.label}</span>
        </span>
        {onAir && <span className="feed-live"><span/>LIVE</span>}
        {!onAir && <span className="feed-hint">{cam.hint}</span>}
      </div>
      <button className="feed-img" onClick={onClick}>
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
      {cam.isData && <DataControls />}
    </div>
  );
}

// Each wheel tick fires a brief movement pulse. The PTZOptics CGI has no
// "step" command — only continuous motion + stop — so each tick sends the
// start command and schedules a stop PULSE_MS later. Back-to-back ticks
// reset the stop timer so rapid scrolling feels continuous.
const PULSE_MS = 180;

function makePulser(stopCmd, sendStart) {
  let stopTimer = null;
  return (dir) => {
    sendStart(dir);
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = setTimeout(() => { stopCmd(); stopTimer = null; }, PULSE_MS);
  };
}

function PTZPad({ camera, ptzSpeed = 6 }) {
  // Scale 1-10 UI speed → 1-24 camera range (pan/tilt) and 1-7 (zoom/focus)
  const panSpeed  = Math.max(1, Math.min(24, Math.round(ptzSpeed * 2.4)));
  const zoomSpeed = Math.max(1, Math.min(7, Math.round(ptzSpeed * 0.7)));

  const start = (direction) => {
    const s = `${panSpeed}&${panSpeed}`;
    const map = {
      t: `up&${s}`, b: `down&${s}`, l: `left&${s}`, r: `right&${s}`,
      tl: `leftup&${s}`, tr: `rightup&${s}`, bl: `leftdown&${s}`, br: `rightdown&${s}`,
    };
    if (map[direction]) ptzCmd(camera, map[direction]);
  };
  const stop = () => ptzCmd(camera, 'ptzstop');
  const zoomStart = (kind) => ptzCmd(camera, `${kind === 'wide' ? 'zoomout' : 'zoomin'}&${zoomSpeed}`);
  const zoomStop  = () => ptzCmd(camera, 'zoomstop');
  const focusStart = (kind) => ptzCmd(camera, `${kind === 'near' ? 'focusin' : 'focusout'}&${zoomSpeed}`);
  const focusStop  = () => ptzCmd(camera, 'focusstop');

  // Wheel handlers — each tick = one short pulse. Use useMemo-style closures
  // so the stop timers persist across renders.
  const pulseZoom  = React.useMemo(() => makePulser(zoomStop,  (kind) => zoomStart(kind)),  [camera, ptzSpeed]);
  const pulseFocus = React.useMemo(() => makePulser(focusStop, (kind) => focusStart(kind)), [camera, ptzSpeed]);
  const pulsePan   = React.useMemo(() => makePulser(stop,      (dir)  => start(dir)),       [camera, ptzSpeed]);

  const onZoomWheel = (e) => {
    e.preventDefault();
    pulseZoom(e.deltaY < 0 ? 'tele' : 'wide');
  };
  const onFocusWheel = (e) => {
    e.preventDefault();
    pulseFocus(e.deltaY < 0 ? 'far' : 'near');
  };

  // Press+release handlers. Mousewheel pulses the same direction as the
  // arrow you're hovering over (one tick = one brief pulse), so wheel over
  // the UP arrow nudges the camera up, wheel over LEFT pans left, etc.
  const pan = (d) => ({
    onMouseDown: () => start(d),
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: () => start(d),
    onTouchEnd: stop,
    onWheel: (e) => { e.preventDefault(); pulsePan(d); },
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
          {/* HOME + joy arrows — track toggle sits below this ring */}
          <button className="joy-center" aria-label="Home" onClick={() => {
            // If the user has flagged a preset as this camera's Home via the
            // preset context menu, recall that preset. Otherwise fall back to
            // the camera's factory home.
            const home = (window.LS_CONFIG?.home || {})[String(camera)];
            if (home != null) {
              // Prefer the abs position saved with the preset — survives
              // firmware wipes. Fall back to the camera's onboard slot
              // recall if the preset hasn't been re-saved yet.
              const raw = (window.LS_CONFIG?.presets || [])[Number(home)];
              const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
              if (raw && raw.pan != null && raw.tilt != null) {
                const params = new URLSearchParams({
                  cmd: 'goto_abs',
                  camera: String(camera),
                  pan:   String(raw.pan),
                  tilt:  String(raw.tilt),
                });
                if (raw.zoom  != null) params.set('zoom',  String(raw.zoom));
                if (raw.focus != null) params.set('focus', String(raw.focus));
                fetch(`${endpoint}?${params}`).catch(() => {});
              } else {
                const presetId = (window.LS_CONFIG?.presetStartIndex || 100) + Number(home);
                ptzCmd(camera, `poscall&${presetId}`);
              }
              window.Log?.add('camera', `Home · Cam ${camera}`, `slot ${home}`);
            } else {
              ptzCmd(camera, 'home');
            }
          }}>
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
            <button className="ctrl-btn" aria-label="Zoom wide" {...ctrl(() => zoomStart('wide'), zoomStop)}><ZoomIcon kind="wide"/><em>WIDE</em></button>
            <button className="ctrl-btn" aria-label="Zoom tele" {...ctrl(() => zoomStart('tele'), zoomStop)}><ZoomIcon kind="tele"/><em>TELE</em></button>
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

function DataControls() {
  const [overlay, setOverlayState] = useStateLF(null); // 'dp' | 'l3rd' | null
  const [slides, setSlides] = useStateLF(false);

  // Sync with OBS on mount + every 5s so external changes are reflected.
  useEffectLF(() => {
    if (!window.OBS) return;
    let alive = true;
    const sync = () => {
      window.OBS.currentOverlay().then(kind => { if (alive) setOverlayState(kind); }).catch(() => {});
      window.OBS.currentScene().then(scene => { if (alive) setSlides(scene === 'DP & Speaker'); }).catch(() => {});
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

  // Slides flips the Data Projection live scene between "DP Full Screen"
  // (the default, just the slides) and "DP & Speaker" (composite scene
  // that keeps a speaker shot next to the slides).
  const toggleSlides = () => {
    const next = !slides;
    setSlides(next); // optimistic
    const target = next ? 'DP & Speaker' : 'DP Full Screen';
    if (window.OBS) window.OBS.switchScene(target).catch(() => {});
    window.Log?.add('live', `Slides ${next ? 'ON' : 'OFF'} → ${target}`);
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
