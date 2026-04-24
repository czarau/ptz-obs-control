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

function ptzCmd(camera, query) {
  const base = CAM_BASE[camera];
  if (!base) return;
  // no-cors: the cameras don't return CORS headers but accept the request.
  fetch(`${base}/cgi-bin/ptzctrl.cgi?ptzcmd&${query}`, { mode: 'no-cors' }).catch(() => {});
  // Any manual jog (that isn't a stop) invalidates the "at-position" marker
  // for this camera — notify the preset grid so it clears the selected state.
  if (!/stop$/i.test(query)) {
    window.dispatchEvent(new CustomEvent('ptz:manual-move', { detail: { camera } }));
  }
}

function LiveFeedRow({ liveCamId, setLiveCam, overlays, setOverlays, onTake, ptzSpeed }) {
  const cams = [CAM_META.back, CAM_META.left, CAM_META.right, CAM_META.data];
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
        />
      ))}
      <OverlayDock overlays={overlays} setOverlays={setOverlays} onTake={onTake}/>
    </div>
  );
}

const { useEffect: useEffectLF, useRef: useRefLF } = React;

function LiveFeed({ cam, onAir, onClick, ptzSpeed }) {
  const videoRef = useRefLF(null);

  // Spin up a WebRTC peer connection when the element mounts, tear it down on unmount.
  useEffectLF(() => {
    const url = (window.LS_CONFIG?.webrtcStreams || {})[cam.id];
    if (!url || !videoRef.current || !window.startWebRTCPlay) return;
    const pc = window.startWebRTCPlay(videoRef.current, url);
    return () => { try { pc && pc.close(); } catch (_) {} };
  }, [cam.id]);

  return (
    <div className={"feed" + (onAir ? " feed-onair" : "")}>
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

  // Press+release handlers
  const pan = (d) => ({
    onMouseDown: () => start(d),
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: () => start(d),
    onTouchEnd: stop,
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
          <button className="joy-center" aria-label="Home" onClick={() => ptzCmd(camera, 'home')}>
            <span className="joy-center-dot" />
            <span className="joy-center-label">HOME</span>
          </button>
        </div>
      </div>
      <div className="ptzpad-controls">
        <div className="ctrl-group">
          <div className="ctrl-label">ZOOM</div>
          <div className="ctrl-pair">
            <button className="ctrl-btn" aria-label="Zoom wide" {...ctrl(() => zoomStart('wide'), zoomStop)}><ZoomIcon kind="wide"/><em>WIDE</em></button>
            <button className="ctrl-btn" aria-label="Zoom tele" {...ctrl(() => zoomStart('tele'), zoomStop)}><ZoomIcon kind="tele"/><em>TELE</em></button>
          </div>
        </div>
        <div className="ctrl-group">
          <div className="ctrl-label">FOCUS</div>
          <div className="ctrl-pair">
            <button className="ctrl-btn" aria-label="Focus near" {...ctrl(() => focusStart('near'), focusStop)}><FocusIcon kind="near"/><em>NEAR</em></button>
            <button className="ctrl-btn" aria-label="Focus far"  {...ctrl(() => focusStart('far'),  focusStop)}><FocusIcon kind="far"/><em>FAR</em></button>
          </div>
          <button className="ctrl-auto" aria-label="Auto focus" onClick={() => ptzCmd(camera, 'focusauto')}>AUTO</button>
        </div>
      </div>
    </div>
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
  return (
    <div className="data-ctrls">
      <button className="datbtn on"><span className="dot dot-green"/>Overlay</button>
      <button className="datbtn">Lower Third</button>
      <button className="datbtn">Slides</button>
    </div>
  );
}

function OverlayDock({ overlays, setOverlays, onTake }) {
  return (
    <div className="dock">
      <div className="dock-sec">
        <div className="dock-head">Output Meters</div>
        <Meter label="CHURCH MIX" value={0.62} active />
        <Meter label="VIDEO MIX"  value={0.48} />
        <Meter label="BACKUP"     value={0.08} muted />
        <Meter label="MASTER"     value={0.71} master />
      </div>

      <div className="dock-sec">
        <div className="dock-head">Stream Health</div>
        <HealthRow label="Bitrate"  value="—"     unit="kbps"/>
        <HealthRow label="Dropped"  value="—"     unit="frames"/>
        <HealthRow label="Latency"  value="—"     unit="s"/>
        <HealthRow label="Viewers"  value="—"     unit="live"/>
        <HealthRow label="CPU"      value="—"     unit="%"/>
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

function Meter({ label, value, active, muted, master }) {
  const pct = Math.min(1, value);
  const segs = 24;
  return (
    <div className={"meter" + (muted ? " muted" : "") + (master ? " master" : "")}>
      <div className="meter-label">
        <span>{label}</span>
        {active && <span className="meter-badge">ACTIVE</span>}
      </div>
      <div className="meter-bar">
        {Array.from({length: segs}).map((_, i) => {
          const on = i / segs < pct;
          const tone = i / segs < 0.6 ? "g" : i / segs < 0.85 ? "y" : "r";
          return <span key={i} className={`seg seg-${tone}` + (on ? " on" : "")}/>;
        })}
      </div>
      <div className="meter-num">{Math.round(-60 + pct * 60)} dB</div>
    </div>
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
