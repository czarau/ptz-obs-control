// Preset grid — 5 category columns + Auto Queue column.
// Pulls the flat preset array from window.LS_CONFIG.presets (injected by index.php)
// and buckets slots by range. Each slot stores {camera, label, timeout?} in the
// existing chatswood settings format; absolute preset id = presetStartIndex + slot.
//
// Click model (matches original PHP UI):
//   1st click  → send the camera physically to that preset, flash border while moving
//   2nd click  → switch OBS scene to that camera (go LIVE)
//   If a click moves a camera that's currently on-air, the LIVE badge
//   transfers to the new preset automatically since the program feed just
//   moved with the camera.

const { useState: useStatePG, useEffect: useEffectPG } = React;

const SLOT_BUCKETS = [
  { key: 'speaker',  title: 'Speaker',      slots: [0, 1, 2, 3],                        cols: 1, span: 1 },
  { key: 'piano',    title: 'Piano',        slots: [4, 5, 6, 7, 8, 9, 10, 11],          cols: 2, span: 2 },
  { key: 'singers',  title: 'Singers',      slots: [12, 13, 14, 15],                    cols: 1, span: 1 },
  { key: 'cong',     title: 'Congregation', slots: [16, 17, 18, 19],                    cols: 1, span: 1 },
  { key: 'custom',   title: 'Custom',       slots: [20, 21, 22, 23],                    cols: 1, span: 1 },
];

// Static queue placeholder — full auto-queue logic ported later.
const AUTO_QUEUE = [
  { label: "Lecturn · Speaker", slot: 0, t: 40 },
  { label: "Wide · Piano",      slot: 4, t: 25 },
  { label: "Piano · Keys",      slot: 6, t: 18 },
  { label: "Choir · Front",     slot: 12, t: 12 },
  { label: "Congregation",      slot: 16, t: 30 },
  { label: "Lecturn · Speaker", slot: 0, t: 20 },
  { label: "Singers · Wide",    slot: 15, t: 15 },
  { label: "Cong · Back",       slot: 19, t: 22 },
];

const CAM_SCENE = { '1': 'Camera 1 - Back', '2': 'Camera 2 - Left', '3': 'Camera 3 - Right' };
// Same direct-to-camera CGI hosts as live-feeds.jsx / chatswood/control_v2.js
const CAM_BASE_PG = {
  '1': 'https://srv-syd05.chatswoodchurch.org:8806',
  '2': 'https://srv-syd05.chatswoodchurch.org:8807',
  '3': 'https://srv-syd05.chatswoodchurch.org:8808',
};
const MOTION_MS = 5000; // border flashes for this long after goto; thumb refreshes on completion

function presetFor(slot) {
  const raw = (window.LS_CONFIG?.presets || [])[slot];
  return {
    slot,
    camera: raw?.camera || '1',
    label:  raw?.label  || 'Preset',
    timeout: raw?.timeout || 10,
    presetId: (window.LS_CONFIG?.presetStartIndex || 100) + slot,
  };
}

function moveCamera(preset) {
  // Same call shape as the legacy chatswood UI:
  //   https://srv-syd05...:880N/cgi-bin/ptzctrl.cgi?ptzcmd&poscall&<presetId>
  const base = CAM_BASE_PG[preset.camera];
  if (base) {
    fetch(`${base}/cgi-bin/ptzctrl.cgi?ptzcmd&poscall&${preset.presetId}`, { mode: 'no-cors' }).catch(() => {});
  }
  window.Log?.add('camera', `Move · Cam ${preset.camera} → ${preset.label}`, `preset ${preset.presetId}`);
}

function takeLive(preset) {
  const sceneName = CAM_SCENE[preset.camera];
  if (window.OBS && sceneName) window.OBS.switchScene(sceneName).catch(() => {});
  window.Log?.add('live', `LIVE · Cam ${preset.camera} · ${preset.label}`, sceneName);
}

function ThumbCard({ preset, onAir, selected, inMotion, refreshTs, compact, onClick, queueBadge }) {
  return (
    <button
      className={
        "thumb"
        + (onAir ? " onair" : "")
        + (selected ? " selected" : "")
        + (inMotion ? " in-motion" : "")
        + (compact ? " compact" : "")
      }
      onClick={onClick}
    >
      <div className="thumb-img">
        <Thumb presetId={preset.presetId} camera={preset.camera} fresh={!!refreshTs} ts={refreshTs} />
        {onAir && <span className="thumb-livebadge">LIVE</span>}
        {selected && !onAir && <span className="thumb-cuebadge">CUE</span>}
        {queueBadge != null && <span className="thumb-timer">{queueBadge}s</span>}
      </div>
      <div className="thumb-meta">
        <span className={"thumb-num" + (onAir ? " num-live" : "")}>{preset.camera}</span>
        <span className="thumb-label">{preset.label}</span>
      </div>
    </button>
  );
}

function PresetColumn({ bucket, liveId, activeByCam, motionByCam, refreshMap, onThumbClick }) {
  const presets = bucket.slots.map(presetFor);
  return (
    <div className="pcol" style={{ gridColumn: `span ${bucket.span}` }}>
      <div className="pcol-head">
        <span className="pcol-title">{bucket.title}</span>
      </div>
      <div className="pcol-grid" data-cols={bucket.cols} style={{ gridTemplateColumns: `repeat(${bucket.cols}, 1fr)` }}>
        {presets.map((p) => {
          const id = `${bucket.key}-${p.slot}`;
          const isActive = activeByCam[p.camera] === id;
          const isMotion = motionByCam[p.camera] === id;
          return (
            <ThumbCard
              key={id}
              preset={p}
              onAir={liveId === id}
              selected={isActive && liveId !== id}
              inMotion={isMotion}
              refreshTs={refreshMap[id]}
              onClick={() => onThumbClick(id, p)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AutoQueueColumn({ items, running, setRunning, liveIdx, advance }) {
  return (
    <div className="pcol pcol-queue" style={{ gridColumn: "span 2" }}>
      <div className="pcol-head pcol-head-queue">
        <span className="pcol-title">Auto Queue</span>
        <div className="queue-actions">
          <button className={"qbtn" + (running ? " on" : "")} onClick={() => setRunning(r => !r)}>
            <Icon name={running ? "pause" : "play"} size={12}/>
            <span>{running ? "Running" : "Paused"}</span>
          </button>
          <button className="qbtn" onClick={advance}><Icon name="swap" size={12}/><span>Skip</span></button>
        </div>
      </div>
      <div className="pcol-grid" data-cols="2" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        {items.map((q, i) => {
          const p = presetFor(q.slot);
          p.label = q.label;
          return (
            <ThumbCard
              key={i}
              preset={p}
              onAir={i === liveIdx}
              selected={i === (liveIdx + 1) % items.length}
              queueBadge={q.t}
              onClick={() => {}}
            />
          );
        })}
      </div>
    </div>
  );
}

function PresetGrid({ liveId, setLive, liveCamera, setLiveCamFromNumber, queueRunning, setQueueRunning, queueIdx, advanceQueue, showCustom }) {
  // Per-camera state: each camera has at most one "at-position" preset (the
  // last one it moved to) and at most one "in-motion" preset.
  const [activeByCam, setActiveByCam] = useStatePG({});
  const [motionByCam, setMotionByCam] = useStatePG({});
  // Thumb-id → timestamp. When set, ThumbCard requests a fresh snapshot.
  const [refreshMap, setRefreshMap] = useStatePG({});

  // Clear the "at-position" marker for a camera whenever it's manually jogged
  // (PTZPad in live-feeds.jsx dispatches this event on pan/tilt/zoom).
  useEffectPG(() => {
    const onManualMove = (e) => {
      const cam = String(e.detail?.camera || '');
      if (!cam) return;
      setActiveByCam(m => (m[cam] == null ? m : { ...m, [cam]: null }));
      setMotionByCam(m => (m[cam] == null ? m : { ...m, [cam]: null }));
    };
    window.addEventListener('ptz:manual-move', onManualMove);
    return () => window.removeEventListener('ptz:manual-move', onManualMove);
  }, []);

  // Whenever the live camera changes (scene switch via feed click, preset take,
  // or external OBS change caught by the poll) OR the at-position marker on
  // the live camera changes, derive liveId: it's whichever preset is armed on
  // the currently-live camera, or null if nothing is armed there.
  useEffectPG(() => {
    const cam = String(liveCamera);
    const id = activeByCam[cam] || null;
    setLive(curr => (curr === id ? curr : id));
  }, [liveCamera, activeByCam]);

  const onThumbClick = (id, preset) => {
    const cam = String(preset.camera);

    // Second click on the preset already armed on this camera → go LIVE
    if (activeByCam[cam] === id) {
      takeLive(preset);
      setLiveCamFromNumber && setLiveCamFromNumber(preset.camera);
      // liveId update happens in the useEffect above when liveCamera changes.
      return;
    }

    // First click → send the camera to this preset
    moveCamera(preset);
    setActiveByCam(m => ({ ...m, [cam]: id }));
    setMotionByCam(m => ({ ...m, [cam]: id }));
    setTimeout(() => {
      setMotionByCam(m => (m[cam] === id ? { ...m, [cam]: null } : m));
      setRefreshMap(m => ({ ...m, [id]: Date.now() }));
    }, MOTION_MS);

    // Poll the camera's pan/tilt/zoom/focus until it stops moving, then log
    // the final coordinates alongside the preset label. `settle()` keeps
    // sampling (~600 ms apart, up to 8 s) until two consecutive reads match.
    window.PTZState?.settle(preset.camera).then(pos => {
      if (pos) {
        window.Log?.add(
          'camera',
          `Arrived · Cam ${preset.camera} · ${preset.label}`,
          `pan=${pos.pan} tilt=${pos.tilt} zoom=${pos.zoom} focus=${pos.focus}`
        );
      } else {
        window.Log?.add('camera', `Arrived · Cam ${preset.camera} · ${preset.label}`);
      }
    });
  };

  const buckets = showCustom ? SLOT_BUCKETS : SLOT_BUCKETS.filter(b => b.key !== 'custom');
  return (
    <div className="preset-grid">
      {buckets.map(b => (
        <PresetColumn
          key={b.key}
          bucket={b}
          liveId={liveId}
          activeByCam={activeByCam}
          motionByCam={motionByCam}
          refreshMap={refreshMap}
          onThumbClick={onThumbClick}
        />
      ))}
      <AutoQueueColumn
        items={AUTO_QUEUE}
        running={queueRunning}
        setRunning={setQueueRunning}
        liveIdx={queueIdx}
        advance={advanceQueue}
      />
    </div>
  );
}

Object.assign(window, { PresetGrid });
