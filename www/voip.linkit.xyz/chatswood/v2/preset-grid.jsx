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

const { useState: useStatePG, useEffect: useEffectPG, useRef: useRefPG } = React;

// Column layout. Read from settings.json via LS_CONFIG.buckets / queueSlots
// (PHP injects them) so each site can define its own categories and slot
// ranges without editing code. Defaults here are back-compat fallbacks.
const SLOT_BUCKETS = (window.LS_CONFIG && Array.isArray(window.LS_CONFIG.buckets) && window.LS_CONFIG.buckets.length)
  ? window.LS_CONFIG.buckets
  : [
      { key: 'speaker',  title: 'Speaker',      slots: [0, 1, 2, 3],                 cols: 1, span: 1 },
      { key: 'piano',    title: 'Piano',        slots: [4, 5, 6, 7, 8, 9, 10, 11],   cols: 2, span: 2 },
      { key: 'singers',  title: 'Singers',      slots: [12, 13, 14, 15],             cols: 1, span: 1 },
      { key: 'cong',     title: 'Congregation', slots: [16, 17, 18, 19],             cols: 1, span: 1 },
      { key: 'custom',   title: 'Custom',       slots: [20, 21, 22, 23],             cols: 1, span: 1 },
    ];

// Auto queue slot range — separate flat range that doesn't collide with any
// category bucket. Also server-configurable.
const QUEUE_SLOTS = (window.LS_CONFIG && Array.isArray(window.LS_CONFIG.queueSlots) && window.LS_CONFIG.queueSlots.length)
  ? window.LS_CONFIG.queueSlots
  : [24, 25, 26, 27, 28, 29, 30, 31];

const CAM_SCENE = { '1': 'Camera 1 - Back', '2': 'Camera 2 - Left', '3': 'Camera 3 - Right' };
// Same direct-to-camera CGI hosts as live-feeds.jsx / chatswood/control_v2.js
const CAM_BASE_PG = {
  '1': 'https://srv-syd05.chatswoodchurch.org:8806',
  '2': 'https://srv-syd05.chatswoodchurch.org:8807',
  '3': 'https://srv-syd05.chatswoodchurch.org:8808',
};
// Motion marker + thumb refresh are driven by PTZState.settle() — it polls
// the camera's VISCA position until two consecutive reads match, so we find
// out the camera has arrived within ~600ms of it actually stopping. No fixed
// timeout. settle() caps at 8s maxWait internally if the camera never
// stabilises, so we're guaranteed to clear eventually.

function presetFor(slot) {
  const raw = (window.LS_CONFIG?.presets || [])[slot];
  const num = (v) => (v == null || v === '' ? null : Number(v));
  return {
    slot,
    camera:  raw?.camera  || '1',
    label:   raw?.label   || 'Preset',
    timeout: raw?.timeout || 10,
    presetId: (window.LS_CONFIG?.presetStartIndex || 100) + slot,
    // Absolute position — when present, moveCamera drives via goto_abs
    // (VISCA) instead of the onboard preset slot. These become the
    // primary source of truth once the preset has been (re-)saved.
    pan:   num(raw?.pan),
    tilt:  num(raw?.tilt),
    zoom:  num(raw?.zoom),
    focus: num(raw?.focus),
  };
}

function hasAbsPosition(preset) {
  return preset && preset.pan != null && preset.tilt != null;
}

function moveCamera(preset) {
  const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';

  if (hasAbsPosition(preset)) {
    // New path — absolute VISCA position from JSON. Firmware-resilient.
    const params = new URLSearchParams({
      cmd: 'goto_abs',
      camera: String(preset.camera),
      pan:   String(preset.pan),
      tilt:  String(preset.tilt),
    });
    if (preset.zoom  != null) params.set('zoom',  String(preset.zoom));
    if (preset.focus != null) params.set('focus', String(preset.focus));
    window.Log?.add('camera', `Move · Cam ${preset.camera} → ${preset.label}`,
      `abs p=${preset.pan} t=${preset.tilt} z=${preset.zoom ?? '-'} f=${preset.focus ?? '-'}`);
    // Surface any server-side failure to the activity log — otherwise a
    // broken goto_abs looks indistinguishable from a working one.
    fetch(`${endpoint}?${params}`)
      .then(r => r.text())
      .then(body => {
        const trimmed = (body || '').trim();
        let data = null;
        try { data = JSON.parse(trimmed); } catch (_) {}
        if (data && data.error) {
          window.Log?.add('error', `goto_abs failed · Cam ${preset.camera}`,
            `${data.error}${data.stderr ? ' · ' + String(data.stderr).slice(0, 160) : ''}`);
        } else if (!trimmed) {
          window.Log?.add('error', `goto_abs empty response · Cam ${preset.camera}`,
            'PHP/python returned nothing — check cam_control.py stderr');
        } else if (data && Array.isArray(data.steps)) {
          // Per-axis log from cam_control.py. 'COMPLETE' means the camera
          // accepted that axis; anything else (hex bytes, 'ERROR', null) is
          // either a VISCA error (e.g. Command Not Executable on focus
          // while AF is on) or a timeout/unknown response. Flag the bad
          // ones individually so we know which axis to investigate.
          const bad = data.steps.filter(s => s.response !== 'COMPLETE');
          if (bad.length) {
            window.Log?.add('error', `goto_abs partial · Cam ${preset.camera}`,
              bad.map(s => `${s.axis}=${s.response ?? 'null'}`).join(' · '));
          }
        }
      })
      .catch(err => {
        window.Log?.add('error', `goto_abs fetch error · Cam ${preset.camera}`, String(err));
      });
  } else {
    // No abs position stored. The camera-side preset slots were wiped by the
    // 6.3.45 firmware upgrade, so falling back to poscall won't do anything
    // useful. Flag loudly so the operator knows to re-capture the position
    // (right-click → Save Camera X, or drag a live feed onto the thumb).
    // Still fire the legacy poscall for back-compat on sites that haven't
    // migrated — it's a no-op on 6.3.45+.
    const q = encodeURIComponent(`ptzcmd&poscall&${preset.presetId}`);
    fetch(`${endpoint}?cmd=cgi&camera=${preset.camera}&q=${q}`).catch(() => {});
    window.Log?.add(
      'error',
      `No saved position · Cam ${preset.camera} · ${preset.label}`,
      `Right-click → Save Camera ${preset.camera === '1' ? 'Back' : preset.camera === '2' ? 'Left' : 'Right'} to capture.`
    );
  }
}

function takeLive(preset) {
  const sceneName = CAM_SCENE[preset.camera];
  if (window.OBS && sceneName) window.OBS.switchScene(sceneName).catch(() => {});
  window.Log?.add('live', `LIVE · Cam ${preset.camera} · ${preset.label}`, sceneName);
}

// --- Right-click actions ----------------------------------------------------

const PRESET_ACTIONS = {
  endpoint: () => (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php',
  user:     () => (window.LS_CONFIG || {}).user || 'chatswood',

  // Capture camera `cam`'s current pan/tilt/zoom/focus via VISCA and save
  // those absolute values into settings.json (not the camera's onboard
  // preset slot). Immune to firmware preset wipes. When `admin` is true
  // the write goes to the admin default bank instead of the user bank.
  async savePosition(preset, cam, opts = {}) {
    const admin = !!opts.admin;
    const pos = await (window.PTZState?.query(cam) || Promise.resolve(null));
    if (!pos) {
      window.Log?.add('error', `Save · could not read Cam ${cam} position`);
      return;
    }

    const params = new URLSearchParams({
      cmd: 'set_preset',
      user: PRESET_ACTIONS.user(),
      id: String(preset.slot),
      camera: String(cam),
      label: preset.label || 'Preset',
      pan:   String(pos.pan),
      tilt:  String(pos.tilt),
      zoom:  String(pos.zoom),
      focus: String(pos.focus),
      ts: String(Date.now()),
    });
    if (admin) params.set('admin', '1');
    try {
      await fetch(`${PRESET_ACTIONS.endpoint()}?${params}`);
    } catch (_) { /* ignore */ }

    // Update the in-memory LS_CONFIG so the thumb click handler picks up the
    // new abs values without a page reload.
    if (window.LS_CONFIG && Array.isArray(window.LS_CONFIG.presets)) {
      const slot = preset.slot;
      const existing = window.LS_CONFIG.presets[slot] || {};
      window.LS_CONFIG.presets[slot] = {
        ...existing,
        camera: String(cam),
        label: preset.label || existing.label || 'Preset',
        pan:   pos.pan,
        tilt:  pos.tilt,
        zoom:  pos.zoom,
        focus: pos.focus,
      };
    }

    window.Log?.add(
      admin ? 'system' : 'camera',
      `${admin ? 'Save default' : 'Save position'} · Cam ${cam} → ${preset.label}`,
      `p=${pos.pan} t=${pos.tilt} z=${pos.zoom} f=${pos.focus}`
    );
  },

  rename(preset, newLabel) {
    const params = new URLSearchParams({
      cmd: 'set_preset',
      user: PRESET_ACTIONS.user(),
      id: String(preset.slot),
      camera: String(preset.camera),
      label: newLabel,
      ts: String(Date.now()),
    });
    fetch(`${PRESET_ACTIONS.endpoint()}?${params}`).catch(() => {});
    // Keep in-memory config in sync so presetFor() picks up the new label
    // on the next render. The caller must still bump refreshMap (or any
    // other state) to trigger that render — this function doesn't have
    // access to React state setters.
    if (window.LS_CONFIG && Array.isArray(window.LS_CONFIG.presets)) {
      const existing = window.LS_CONFIG.presets[preset.slot] || {};
      window.LS_CONFIG.presets[preset.slot] = { ...existing, label: newLabel };
    }
    window.Log?.add('system', `Rename · ${preset.label} → ${newLabel}`);
  },

  setTimeout(preset, secs) {
    const params = new URLSearchParams({
      cmd: 'set_preset',
      user: PRESET_ACTIONS.user(),
      id: String(preset.slot),
      camera: String(preset.camera),
      timeout: String(secs),
      ts: String(Date.now()),
    });
    fetch(`${PRESET_ACTIONS.endpoint()}?${params}`).catch(() => {});
    // Same in-memory sync as rename — the caller bumps refreshMap to
    // force a re-render so the queue badge shows the new timeout.
    if (window.LS_CONFIG && Array.isArray(window.LS_CONFIG.presets)) {
      const existing = window.LS_CONFIG.presets[preset.slot] || {};
      window.LS_CONFIG.presets[preset.slot] = { ...existing, timeout: String(secs) };
    }
    window.Log?.add('system', `Set timeout · ${preset.label} → ${secs}s`);
  },

  // Flag this preset as the Home position for its camera. The Home button
  // on that camera's PTZ pad will then recall this preset instead of calling
  // the factory home.
  saveAsHome(preset) {
    const cam = Number(preset.camera);
    const params = new URLSearchParams({
      cmd: 'set_home',
      user: PRESET_ACTIONS.user(),
      camera: String(cam),
      slot: String(preset.slot),
      ts: String(Date.now()),
    });
    fetch(`${PRESET_ACTIONS.endpoint()}?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        // Update the in-memory cache so the Home button picks it up immediately.
        if (!window.LS_CONFIG) return;
        if (!window.LS_CONFIG.home || typeof window.LS_CONFIG.home !== 'object') {
          window.LS_CONFIG.home = {};
        }
        window.LS_CONFIG.home[String(cam)] = preset.slot;
        window.Log?.add('system', `Home set · Cam ${cam}`, preset.label || `slot ${preset.slot}`);
      })
      .catch(() => {});
  },

  async getAdminPreset(preset) {
    const url = `${PRESET_ACTIONS.endpoint()}?cmd=get_preset&user=${PRESET_ACTIONS.user()}&admin=1&id=${preset.slot}&ts=${Date.now()}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.json();
    } catch (_) { return null; }
  },

  // Restore the user preset from its admin default. Copies abs pan/tilt/
  // zoom/focus (and camera/label) from the admin bank into the user bank,
  // then drives the camera to that position so the operator can verify.
  // Gracefully handles legacy admin presets that only have camera+label
  // (no position data) by logging a note and skipping the physical move.
  async restoreDefault(preset) {
    const def = await PRESET_ACTIONS.getAdminPreset(preset);
    if (!def || !def.camera) {
      window.Log?.add('error', `Restore · no default for slot ${preset.slot}`);
      return;
    }
    const cam = def.camera;
    const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';

    // 1. Copy admin metadata (including abs position) into the user slot.
    const params = new URLSearchParams({
      cmd: 'set_preset',
      user: PRESET_ACTIONS.user(),
      id: String(preset.slot),
      camera: String(cam),
      label: def.label || preset.label || 'Preset',
      ts: String(Date.now()),
    });
    ['pan', 'tilt', 'zoom', 'focus'].forEach(k => {
      if (def[k] != null) params.set(k, String(def[k]));
    });
    try { await fetch(`${PRESET_ACTIONS.endpoint()}?${params}`); } catch (_) {}

    // Keep in-memory config in sync so the next click hits abs path.
    if (window.LS_CONFIG && Array.isArray(window.LS_CONFIG.presets)) {
      window.LS_CONFIG.presets[preset.slot] = {
        ...(window.LS_CONFIG.presets[preset.slot] || {}),
        camera: String(cam),
        label: def.label || preset.label || 'Preset',
        ...(def.pan   != null ? { pan:   def.pan   } : {}),
        ...(def.tilt  != null ? { tilt:  def.tilt  } : {}),
        ...(def.zoom  != null ? { zoom:  def.zoom  } : {}),
        ...(def.focus != null ? { focus: def.focus } : {}),
      };
    }

    // 2. If the default has abs position data, drive the camera there so
    //    the operator sees the restored view immediately.
    if (def.pan != null && def.tilt != null) {
      const gotoParams = new URLSearchParams({
        cmd: 'goto_abs',
        camera: String(cam),
        pan:   String(def.pan),
        tilt:  String(def.tilt),
      });
      if (def.zoom  != null) gotoParams.set('zoom',  String(def.zoom));
      if (def.focus != null) gotoParams.set('focus', String(def.focus));
      fetch(`${endpoint}?${gotoParams}`).catch(() => {});
    } else {
      window.Log?.add('system', `Restore default · no abs position — metadata only`);
    }

    window.Log?.add('system', `Restore default · Cam ${cam} · ${def.label || preset.label}`);
  },
};

// Custom MIME types for the two drop flavours. Kept distinct so a random
// drag (text, file, tab URL) can never accidentally rewrite a preset.
const MIME_CAMERA = 'application/x-ls-camera';       // live-feed → preset (capture live PTZ)
const MIME_PRESET = 'application/x-ls-preset-slot';  // preset   → preset (copy saved values)

function ThumbCard({ preset, id, onAir, selected, inMotion, liveWarn, refreshTs, compact, onClick, onContextMenu, onDropCamera, onDropPreset, queueBadge }) {
  const [dragOver, setDragOver] = useStatePG(false);

  // Only presets with saved abs values make sense as a drag SOURCE — there's
  // nothing to copy otherwise. Labels stay with the destination on drop.
  const canDrag = hasAbsPosition(preset);

  const onDragStart = (e) => {
    if (!canDrag) { e.preventDefault(); return; }
    e.dataTransfer.setData(MIME_PRESET, JSON.stringify({
      sourceId: id,
      slot: preset.slot,
      presetId: preset.presetId,
      camera: preset.camera,
      pan: preset.pan,
      tilt: preset.tilt,
      zoom: preset.zoom,
      focus: preset.focus,
      label: preset.label,
    }));
    e.dataTransfer.setData('text/plain', preset.label || `slot ${preset.slot}`);
    e.dataTransfer.effectAllowed = 'copy';
    window.Log?.add('camera', `Drag start · ${preset.label}`, 'drop on another thumb to copy');
  };

  // Accept either a live-feed drop (live PTZ → save here) or another thumb
  // drop (copy that preset's saved values here).
  const typesOf = (e) => e.dataTransfer.types;
  const hasCamera = (e) => typesOf(e).includes(MIME_CAMERA);
  const hasPreset = (e) => typesOf(e).includes(MIME_PRESET);
  const acceptsDrop = (e) => hasCamera(e) || hasPreset(e);

  const onDragOver = (e) => {
    if (!acceptsDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    if (!acceptsDrop(e)) return;
    e.preventDefault();
    setDragOver(false);
    if (hasPreset(e)) {
      try {
        const source = JSON.parse(e.dataTransfer.getData(MIME_PRESET));
        if (source && source.sourceId && source.sourceId !== id && onDropPreset) {
          onDropPreset(source);
        }
      } catch (_) { /* bad payload — ignore */ }
      return;
    }
    const cam = parseInt(e.dataTransfer.getData(MIME_CAMERA), 10);
    if (cam >= 1 && cam <= 3 && onDropCamera) onDropCamera(cam);
  };

  return (
    <button
      className={
        "thumb"
        + (onAir ? " onair" : "")
        + (selected ? " selected" : "")
        + (inMotion ? " in-motion" : "")
        + (dragOver ? " drag-over" : "")
        + (compact ? " compact" : "")
      }
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="thumb-img">
        <Thumb presetId={preset.presetId} camera={preset.camera} fresh={!!refreshTs} ts={refreshTs} />
        {onAir && <span className="thumb-livebadge">LIVE</span>}
        {selected && !onAir && <span className="thumb-cuebadge">CUE</span>}
        {queueBadge != null && <span className="thumb-timer">{queueBadge}s</span>}
        {/* Hover warning: this preset's camera is currently on program but
            this isn't the on-air thumb. Clicking would physically move a
            camera that's ON AIR, which will be visible to viewers. CSS
            only shows this on :hover to keep the grid readable. */}
        {liveWarn && !onAir && <span className="thumb-livewarn">LIVE</span>}
      </div>
      <div className="thumb-meta">
        <span className={"thumb-num" + (onAir ? " num-live" : "")}>{preset.camera}</span>
        <span className="thumb-label">{preset.label}</span>
      </div>
    </button>
  );
}

function PresetColumn({ bucket, liveId, liveCameraNum, activeByCam, motionByCam, refreshMap, onThumbClick, onThumbContext, onThumbDrop, onThumbCopy }) {
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
          // Hover "LIVE" warning if this preset's camera is currently on
          // program (and this isn't the already-live thumb). Clicking
          // would move a camera that viewers are watching.
          const liveWarn = liveCameraNum != null
            && Number(p.camera) === Number(liveCameraNum)
            && liveId !== id;
          return (
            <ThumbCard
              key={id}
              id={id}
              preset={p}
              onAir={liveId === id}
              selected={isActive && liveId !== id}
              inMotion={isMotion}
              liveWarn={liveWarn}
              refreshTs={refreshMap[id]}
              onClick={() => onThumbClick(id, p)}
              onContextMenu={(e) => onThumbContext(e, id, p, bucket)}
              onDropCamera={(cam) => onThumbDrop(id, p, cam)}
              onDropPreset={(source) => onThumbCopy(id, p, source)}
            />
          );
        })}
      </div>
    </div>
  );
}

const QUEUE_BUCKET = { key: 'queue', title: 'Queue', slots: QUEUE_SLOTS, cols: 2, span: 2 };

function AutoQueueColumn({ running, setRunning, advance, liveId, liveCameraNum, activeByCam, motionByCam, refreshMap, onThumbClick, onThumbContext, onThumbDrop, onThumbCopy, queueLiveIdx, queueTimer }) {
  return (
    <div className="pcol pcol-queue" style={{ gridColumn: "span 2" }}>
      <div className="pcol-head pcol-head-queue">
        <span className="pcol-title">Auto Queue</span>
        <div className="queue-actions">
          <button className={"qbtn" + (running ? " on" : "")} onClick={() => setRunning(r => !r)}>
            <Icon name={running ? "pause" : "play"} size={12}/>
            <span>{running ? "Running" : "Paused"}</span>
          </button>
          <button className="qbtn" onClick={advance}><Icon name="skip" size={12}/><span>Skip</span></button>
        </div>
      </div>
      <div className="pcol-grid" data-cols="2" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        {QUEUE_SLOTS.map((slot, idx) => {
          const p = presetFor(slot);
          const id = `queue-${slot}`;
          const cam = String(p.camera);
          const isActive = activeByCam[cam] === id;
          const isMotion = motionByCam[cam] === id;
          const onAir = liveId === id;
          const liveWarn = liveCameraNum != null
            && Number(p.camera) === Number(liveCameraNum)
            && !onAir;
          // Live item shows a live countdown; others show their stored timeout.
          const badge = (onAir && idx === queueLiveIdx && queueTimer != null)
            ? queueTimer
            : p.timeout;
          return (
            <ThumbCard
              key={slot}
              id={id}
              preset={p}
              onAir={onAir}
              selected={isActive && !onAir}
              inMotion={isMotion}
              liveWarn={liveWarn}
              refreshTs={refreshMap[id]}
              queueBadge={badge}
              onClick={() => onThumbClick(id, p)}
              onContextMenu={(e) => onThumbContext(e, id, p, QUEUE_BUCKET)}
              onDropCamera={(cam) => onThumbDrop(id, p, cam)}
              onDropPreset={(source) => onThumbCopy(id, p, source)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PresetGrid({ liveId, setLive, liveCamera, onTakeSceneLiveFromNumber, setCuedSceneFromNumber, admin, queueRunning, setQueueRunning, queueIdx, advanceQueue, showCustom }) {
  // Per-camera state: each camera has at most one "at-position" preset (the
  // last one it moved to) and at most one "in-motion" preset.
  const [activeByCam, setActiveByCam] = useStatePG({});
  const [motionByCam, setMotionByCam] = useStatePG({});
  // Thumb-id → timestamp. When set, ThumbCard requests a fresh snapshot.
  const [refreshMap, setRefreshMap] = useStatePG({});
  const menu = useContextMenu();
  // Ref mirror of activeByCam so async callbacks (setTimeout, settle.then)
  // can see the latest value without re-registering handlers.
  const activeByCamRef = useRefPG({});
  useEffectPG(() => { activeByCamRef.current = activeByCam; }, [activeByCam]);

  // --- Auto queue runtime ------------------------------------------------
  // queueLiveIdx: index into QUEUE_SLOTS that's currently on-air.
  // queueTimer:   seconds remaining on that item before auto-advance.
  // While running, each tick decrements the timer; on expiry we take the
  // next item live and (if on a different camera) pre-roll the one after it
  // so there's always a CUE queued.
  const [queueLiveIdx, setQueueLiveIdx] = useStatePG(0);
  const [queueTimer, setQueueTimer] = useStatePG(0);
  const queueLiveIdxRef = useRefPG(0);
  const queueTimerRef = useRefPG(0);
  useEffectPG(() => { queueLiveIdxRef.current = queueLiveIdx; }, [queueLiveIdx]);
  useEffectPG(() => { queueTimerRef.current = queueTimer; }, [queueTimer]);

  // Break detector: when the queue takes a scene live, it "claims" that
  // cam id in queueClaimCamIdRef right before triggering the take, so
  // the ls:scene-live listener can distinguish queue-owned takes from
  // operator takeovers. Similarly for the pre-roll arm (queuePreRollIdRef).
  //
  // queueRunningRef exposes queueRunning to the ls:scene-live listener
  // which is installed in a useEffect([]) and can't read props directly
  // from its closure (mount-time value would be stale).
  const CAM_NUM_TO_ID_PG = { 1: 'back', 2: 'left', 3: 'right', 0: 'data' };
  const queueClaimCamIdRef = useRefPG(null);
  const queuePreRollIdRef = useRefPG(null);    // expected "queue-<slot>" on the pre-roll camera
  const queuePreRollCamRef = useRefPG(null);    // string cam number the pre-roll lives on
  const queueRunningRef = useRefPG(false);
  useEffectPG(() => { queueRunningRef.current = queueRunning; }, [queueRunning]);

  const takeQueueItem = (qIdx) => {
    const slot = QUEUE_SLOTS[qIdx];
    if (slot == null) return;
    const preset = presetFor(slot);
    const id = `queue-${slot}`;
    const cam = String(preset.camera);

    // Claim the scene take BEFORE firing it — the ls:scene-live listener
    // reads this ref synchronously when the event fires and clears it
    // when the claim matches. No claim = operator takeover.
    queueClaimCamIdRef.current = CAM_NUM_TO_ID_PG[Number(preset.camera)] || null;

    // Take live on this slot's camera. Routes through the ping-pong
    // helper so the outgoing scene becomes the next cue (operator can
    // flip back to the previous shot in one click).
    takeLive(preset);
    if (onTakeSceneLiveFromNumber) onTakeSceneLiveFromNumber(Number(preset.camera));
    // onTakeSceneLive dispatches ls:scene-live synchronously — the
    // listener runs inside that call and clears the claim on a match.
    // If App's early-return hit (scene was already live), no event
    // fired and the claim is still set; clearing here prevents a later
    // unrelated take from spuriously matching the stale value.
    queueClaimCamIdRef.current = null;
    setActiveByCam(m => ({ ...m, [cam]: id }));
    setQueueLiveIdx(qIdx);
    const t = Number(preset.timeout) || 10;
    setQueueTimer(t);

    // Pre-roll the next queue item's camera — but only if it's a DIFFERENT
    // camera from the one we just took live. Moving the current live camera
    // would yank the program feed off-shot.
    const nextIdx = (qIdx + 1) % QUEUE_SLOTS.length;
    const nextSlot = QUEUE_SLOTS[nextIdx];
    const nextPreset = presetFor(nextSlot);
    const nextId = `queue-${nextSlot}`;
    const nextCam = String(nextPreset.camera);
    if (nextCam && nextCam !== cam) {
      // Record the pre-roll claim so the thumb-arm break detector
      // knows this is the expected armed thumb for nextCam and won't
      // mistake it for an operator steal.
      queuePreRollIdRef.current = nextId;
      queuePreRollCamRef.current = nextCam;
      moveCamera(nextPreset);
      setActiveByCam(m => ({ ...m, [nextCam]: nextId }));
      setMotionByCam(m => ({ ...m, [nextCam]: nextId }));
      // Clear motion + refresh thumb as soon as the camera actually settles,
      // rather than at a fixed 5s wall clock.
      window.PTZState?.settle(nextPreset.camera).then(() => {
        if (activeByCamRef.current[nextCam] !== nextId) return; // superseded
        setMotionByCam(m => (m[nextCam] === nextId ? { ...m, [nextCam]: null } : m));
        const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
        const bump = () => setRefreshMap(m => ({ ...m, [nextId]: Date.now() }));
        const web = window.capturePresetThumb
          ? window.capturePresetThumb(Number(nextPreset.camera), nextPreset.slot)
          : Promise.resolve(false);
        web.then(ok => {
          if (ok) { bump(); return; }
          fetch(`${endpoint}?cmd=thumb&camera=${nextPreset.camera}&id=${nextPreset.presetId}&ts=${Date.now()}`)
            .then(() => bump())
            .catch(() => {});
        });
      });
    } else {
      // No pre-roll this tick (same camera). Clear any prior claim.
      queuePreRollIdRef.current = null;
      queuePreRollCamRef.current = null;
    }

    // Override the ping-pong cue (set by onTakeSceneLive → outgoing cam)
    // with the queue's planned next camera. During a queue run the
    // operator's mental model is "what's next in the rundown", not
    // "what was live last". If there's no pre-roll (next slot is same
    // cam), clear the cue entirely so no stale CUE badge lingers.
    if (setCuedSceneFromNumber) {
      if (nextCam && nextCam !== cam) {
        setCuedSceneFromNumber(Number(nextPreset.camera));
      } else {
        setCuedSceneFromNumber(null);
      }
    }

    window.Log?.add('live', `Queue · take #${qIdx + 1}`, `${preset.label} · ${t}s`);
  };

  const advanceQueueInternal = () => {
    // Skip is a running-queue action. Clicking it while paused shouldn't
    // jump the cue forward without the operator first pressing Running —
    // otherwise you end up "ahead" of yourself when you do resume, and
    // the live scene won't match the item the queue thinks is playing.
    if (!queueRunning) {
      window.Log?.add('live', 'Queue paused', 'Skip ignored — press Running first');
      return;
    }
    const next = (queueLiveIdxRef.current + 1) % QUEUE_SLOTS.length;
    takeQueueItem(next);
  };

  // Tick every second while running. Decrement, and on expiry advance.
  useEffectPG(() => {
    if (!queueRunning) return;
    const id = setInterval(() => {
      if (queueTimerRef.current <= 1) {
        advanceQueueInternal();
      } else {
        setQueueTimer(t => t - 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [queueRunning]);

  // Kick-off / resume logic. Always reset the break-detector claims
  // on any queueRunning transition — a stale claim from a prior run
  // could cause false matches or spurious pauses.
  //
  // Three resume cases:
  //
  //   Fresh start (timer=0): take the current slot. queueLiveIdx
  //     defaults to 0 so this is slot 0 unless someone's moved it.
  //
  //   Paused mid-slot, live focus INTACT (liveCamera still on the
  //     current slot's camera): nothing to do — the tick interval
  //     restarts on queueRunning change and carries the countdown.
  //
  //   Paused mid-slot, live focus LOST (operator took a different
  //     scene while paused): resume by jumping to the first queue
  //     slot whose thumb is armed (the "cued" queue thumb), or if
  //     nothing's armed, restart from slot 0. Matches the operator's
  //     mental model — resuming shouldn't silently keep counting on
  //     a camera that hasn't been on air for minutes.
  useEffectPG(() => {
    queueClaimCamIdRef.current = null;
    queuePreRollIdRef.current = null;
    queuePreRollCamRef.current = null;
    if (!queueRunning) return;

    const curIdx = queueLiveIdxRef.current;
    const curSlot = QUEUE_SLOTS[curIdx];
    const curPre = presetFor(curSlot);
    const expectedCam = Number(curPre.camera);
    const focusIntact = Number(liveCamera) === expectedCam;

    if (queueTimerRef.current === 0) {
      // Fresh start — take from current index.
      takeQueueItem(curIdx);
      return;
    }

    if (focusIntact) {
      // Mid-slot resume, program still on the expected camera — the
      // tick interval picks up where it left off. No take needed.
      window.Log?.add('live', 'Queue resumed', `${curPre.label} · ${queueTimerRef.current}s left`);
      return;
    }

    // Lost focus. Find the first queue slot whose thumb is armed;
    // fall back to slot 0 (the "1st thumb").
    const armedIdx = QUEUE_SLOTS.findIndex(slot => {
      const p = presetFor(slot);
      const cam = String(p.camera);
      return activeByCam[cam] === `queue-${slot}`;
    });
    const startIdx = armedIdx >= 0 ? armedIdx : 0;
    window.Log?.add('live', 'Queue resumed · focus lost', `starting slot ${startIdx + 1}`);
    takeQueueItem(startIdx);
  }, [queueRunning]);

  // Note: a reactive interrupt-detector was attempted here (auto-pause
  // when the operator takes over) but it raced its own trigger state.
  // Effects run inside a render's commit phase with state frozen at
  // that render — takeQueueItem's batched setLiveCam etc. don't flush
  // until the NEXT render, so a naive post-commit detector always saw
  // a mismatch between the cue and the (stale) liveCamera and paused
  // the queue instantly. A grace window masked some cases but not all.
  // Reverted to operator-driven pause: click the Running button when
  // you want to stop the queue. Re-add with event-driven detection
  // (not state reactivity) if this turns out to matter.

  // Snapshot the camera's current view into the given thumb slot. Hybrid:
  //  1. Prefer the instant WebRTC path — grab a frame from the live <video>
  //     and POST it to ?cmd=save_thumb. No camera round-trip, no await
  //     needed by callers for correctness.
  //  2. If no <video> frame is available (stream not loaded / cam 4 / off),
  //     fall back to ?cmd=thumb which pulls a fresh action_snapshot from
  //     the camera server-side with digest auth.
  // Returns a Promise that resolves when the thumb is on disk.
  const snapshotActiveOnCam = (cam) => {
    const currentId = activeByCamRef.current[cam];
    if (!currentId) return Promise.resolve();
    const m = currentId.match(/-(\d+)$/);
    if (!m) return Promise.resolve();
    const slot = parseInt(m[1], 10);
    const presetId = (window.LS_CONFIG?.presetStartIndex || 100) + slot;
    const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
    const bump = () => setRefreshMap(rm => ({ ...rm, [currentId]: Date.now() }));

    const webRTC = window.capturePresetThumb
      ? window.capturePresetThumb(Number(cam), slot)
      : Promise.resolve(false);

    return webRTC.then(ok => {
      if (ok) { bump(); return; }
      // Fallback: ask the server to pull from the camera. Slower, but the
      // only way to capture if the live <video> hasn't buffered a frame.
      return fetch(`${endpoint}?cmd=thumb&camera=${cam}&id=${presetId}&ts=${Date.now()}`)
        .then(() => bump())
        .catch(() => {});
    });
  };

  // Clear the "at-position" marker for a camera whenever it's manually jogged
  // (PTZPad in live-feeds.jsx dispatches this event on pan/tilt/zoom).
  useEffectPG(() => {
    const onManualMove = (e) => {
      const cam = String(e.detail?.camera || '');
      if (!cam) return;
      // Capture the outgoing preset's view before clearing so its thumb
      // reflects what the camera was looking at pre-jog.
      snapshotActiveOnCam(cam);
      setActiveByCam(m => (m[cam] == null ? m : { ...m, [cam]: null }));
      setMotionByCam(m => (m[cam] == null ? m : { ...m, [cam]: null }));
      // Break detection — jogging either the pre-roll OR the currently-
      // live queue camera is a takeover. Pre-roll: the queue's planned
      // next shot is gone. Live cam: the on-air framing is the
      // operator's now, not the queue's expected preset.
      if (queueRunningRef.current) {
        const curSlot = QUEUE_SLOTS[queueLiveIdxRef.current];
        const curPre  = presetFor(curSlot);
        const curCam  = String(curPre.camera);
        if (cam === queuePreRollCamRef.current) {
          setQueueRunning(false);
          window.Log?.add('live', 'Auto-queue paused', `pre-roll Cam ${cam} jogged manually`);
          queuePreRollIdRef.current = null;
          queuePreRollCamRef.current = null;
        } else if (cam === curCam) {
          setQueueRunning(false);
          window.Log?.add('live', 'Auto-queue paused', `live Cam ${cam} jogged manually`);
        }
      }
    };
    // Live-feed "Update" sweep dispatches this per preset as it arrives.
    // Snapshot the camera's current view into thumbs/{presetId}.jpg, then
    // bump the refresh map so the card reloads from the fresh cache.
    const onPresetRefresh = (e) => {
      const slot = e.detail?.slot;
      const cam  = e.detail?.camera;
      if (slot == null || !cam) return;
      const bucket = SLOT_BUCKETS.find(b => b.slots.includes(slot))
        || (QUEUE_SLOTS.includes(slot) ? { key: 'queue' } : null);
      if (!bucket) return;
      const thumbId = `${bucket.key}-${slot}`;
      const presetId = (window.LS_CONFIG?.presetStartIndex || 100) + slot;
      const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
      const bump = () => setRefreshMap(m => ({ ...m, [thumbId]: Date.now() }));
      const web = window.capturePresetThumb
        ? window.capturePresetThumb(Number(cam), slot)
        : Promise.resolve(false);
      web.then(ok => {
        if (ok) { bump(); return; }
        fetch(`${endpoint}?cmd=thumb&camera=${cam}&id=${presetId}&ts=${Date.now()}`)
          .then(() => bump())
          .catch(() => {});
      });
    };
    // Live-feed "Update" sweep fires this before each step so the grid can
    // show a CUE badge on the thumb currently being processed. slot=null
    // clears the cursor when the sweep finishes. Reuses the same
    // activeByCam state the click-to-arm flow uses, so the visual is the
    // same orange border + CUE badge operators already recognise.
    const onPresetUpdating = (e) => {
      const slot = e.detail?.slot;
      const cam  = String(e.detail?.camera || '');
      if (!cam) return;
      if (slot == null) {
        setActiveByCam(m => (m[cam] == null ? m : { ...m, [cam]: null }));
        return;
      }
      const bucket = SLOT_BUCKETS.find(b => b.slots.includes(slot))
        || (QUEUE_SLOTS.includes(slot) ? { key: 'queue' } : null);
      if (!bucket) return;
      const thumbId = `${bucket.key}-${slot}`;
      setActiveByCam(m => ({ ...m, [cam]: thumbId }));
    };
    // Scene-take break detector. Fires on every scene take (queue's own,
    // feed click, preset take, external OBS change). If the take matches
    // the queue's pending claim, it's queue-owned — clear the claim and
    // carry on. Otherwise, if the queue is running, the operator has
    // taken over; pause.
    const onSceneLive = (e) => {
      const newId = e.detail?.id;
      if (!newId) return;
      if (queueClaimCamIdRef.current === newId) {
        queueClaimCamIdRef.current = null;
        return;
      }
      if (queueRunningRef.current) {
        setQueueRunning(false);
        window.Log?.add('live', 'Auto-queue paused', `${newId.toUpperCase()} took live outside queue`);
        queueClaimCamIdRef.current = null;
        queuePreRollIdRef.current = null;
        queuePreRollCamRef.current = null;
      }
    };
    window.addEventListener('ptz:manual-move', onManualMove);
    window.addEventListener('preset:refresh', onPresetRefresh);
    window.addEventListener('preset:updating', onPresetUpdating);
    window.addEventListener('ls:scene-live', onSceneLive);
    return () => {
      window.removeEventListener('ptz:manual-move', onManualMove);
      window.removeEventListener('preset:refresh', onPresetRefresh);
      window.removeEventListener('preset:updating', onPresetUpdating);
      window.removeEventListener('ls:scene-live', onSceneLive);
    };
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

  const onThumbContext = (e, id, preset, bucket) => {
    const isArmed = activeByCam[preset.camera] === id;
    const isQueue = bucket && bucket.key === 'queue';
    // Trigger a thumb refresh for this preset so the card picks up the new snapshot.
    const bumpThumb = () => setRefreshMap(m => ({ ...m, [id]: Date.now() }));

    const ICO = (name) => <Icon name={name} size={13}/>;
    // Save-from-live and per-camera save buttons removed — the drag-drop
    // flow (drag a live feed onto a thumb, or drag one thumb onto another
    // to copy) fully replaces them. Home is kept because it assigns a
    // semantic role to the preset slot that drag-drop can't express.
    const items = [
      {
        label: 'Save as Home',
        icon: ICO('home'),
        onClick: () => PRESET_ACTIONS.saveAsHome(preset),
      },
      { separator: true },
      {
        label: 'Rename',
        icon: ICO('edit'),
        onClick: () => {
          const next = window.prompt('Rename preset', preset.label || '');
          if (next && next !== preset.label) {
            PRESET_ACTIONS.rename(preset, next);
            // Force a re-render so presetFor() is re-read and the new
            // label flows through to ThumbCard's display.
            bumpThumb();
          }
        },
      },
      {
        label: 'Set Timeout',
        icon: ICO('hourglass'),
        disabled: !isQueue,
        onClick: () => {
          const v = window.prompt('Timeout in seconds (5–60)', String(preset.timeout || 10));
          const n = Number(v);
          if (Number.isFinite(n) && n >= 5 && n <= 60) {
            PRESET_ACTIONS.setTimeout(preset, n);
            // Same re-render trigger — the queue badge reads timeout
            // from presetFor() and needs a refresh to reflect the new
            // value without a page reload.
            bumpThumb();
          }
        },
      },
      { separator: true },
      { label: 'Restore Default', icon: ICO('rotate'), onClick: () => { PRESET_ACTIONS.restoreDefault(preset).then(bumpThumb); } },
      {
        label: 'Save as Default',
        icon: ICO('save'),
        disabled: !admin || !isArmed,
        onClick: () => PRESET_ACTIONS.savePosition(preset, Number(preset.camera), { admin: true }),
      },
    ];
    menu.open(e, items);
  };

  // Drop target handler — a live-feed video was dragged onto this preset
  // thumb. Save the dropped camera's current PTZ+focus into this preset
  // AND update the thumbnail image to the current view, so the dropped
  // preset reflects both position and appearance immediately.
  const onThumbDrop = (id, preset, cam) => {
    const label = preset.label || `slot ${preset.slot}`;
    window.Log?.add('camera', `Drop-save · Cam ${cam} → ${label}`, `capturing PTZ + thumb…`);
    const next = { ...preset, label: preset.label || 'Preset' };

    const presetId = (window.LS_CONFIG?.presetStartIndex || 100) + preset.slot;
    const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';

    // Grab the current WebRTC frame fast; fall back to server-side
    // action_snapshot if the video hasn't buffered. The camera isn't
    // going anywhere (drop doesn't move it) so either approach captures
    // the correct view.
    const snap = window.capturePresetThumb
      ? window.capturePresetThumb(Number(cam), preset.slot).then(ok =>
          ok ? true
             : fetch(`${endpoint}?cmd=thumb&camera=${cam}&id=${presetId}&ts=${Date.now()}`)
                 .then(() => true).catch(() => false)
        )
      : fetch(`${endpoint}?cmd=thumb&camera=${cam}&id=${presetId}&ts=${Date.now()}`)
          .then(() => true).catch(() => false);

    // Run PTZ save + thumb capture in parallel, then bump the thumb's
    // cache-buster so the <img> reloads the freshly-written JPEG.
    Promise.all([PRESET_ACTIONS.savePosition(next, cam), snap])
      .then(() => {
        setRefreshMap(m => ({ ...m, [id]: Date.now() + 1 }));
      })
      .catch(err => {
        window.Log?.add('error', `Drop-save failed · Cam ${cam} → ${label}`, String(err));
      });
  };

  // Preset-to-preset copy. Dragging thumb A onto thumb B copies A's saved
  // pan/tilt/zoom/focus (and camera) into B, plus duplicates A's cached
  // thumb image onto B so the dest tile visually matches. The destination's
  // label and timeout are kept intact — operators lay out their grid by
  // role, not by source.
  const onThumbCopy = (destId, destPreset, source) => {
    if (!source || source.pan == null || source.tilt == null) {
      window.Log?.add('error', `Copy failed · source has no saved position`);
      return;
    }
    const destLabel = destPreset.label || `slot ${destPreset.slot}`;
    const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';

    window.Log?.add(
      'camera',
      `Copy · ${source.label || 'preset'} → ${destLabel}`,
      `cam ${source.camera} · p=${source.pan} t=${source.tilt} z=${source.zoom ?? '-'} f=${source.focus ?? '-'}`
    );

    // 1. Persist the copied values into the destination slot.
    const params = new URLSearchParams({
      cmd: 'set_preset',
      user: PRESET_ACTIONS.user(),
      id: String(destPreset.slot),
      camera: String(source.camera),
      label: destPreset.label || 'Preset',
      pan:   String(source.pan),
      tilt:  String(source.tilt),
      ts: String(Date.now()),
    });
    if (source.zoom  != null) params.set('zoom',  String(source.zoom));
    if (source.focus != null) params.set('focus', String(source.focus));
    const save = fetch(`${endpoint}?${params}`)
      .then(() => {
        // Keep in-memory config in sync so the next click hits the abs path.
        if (window.LS_CONFIG && Array.isArray(window.LS_CONFIG.presets)) {
          const existing = window.LS_CONFIG.presets[destPreset.slot] || {};
          window.LS_CONFIG.presets[destPreset.slot] = {
            ...existing,
            camera: String(source.camera),
            pan: source.pan,
            tilt: source.tilt,
            zoom: source.zoom,
            focus: source.focus,
          };
        }
      });

    // 2. Duplicate the source thumbnail on disk onto the dest's presetId.
    //    No camera round-trip needed — the source's cached image is already
    //    the correct view for these coordinates.
    const copyThumb = fetch(
      `${endpoint}?cmd=copy_thumb&from=${source.presetId}&to=${destPreset.presetId}&ts=${Date.now()}`
    ).catch(() => {});

    Promise.all([save, copyThumb])
      .then(() => setRefreshMap(m => ({ ...m, [destId]: Date.now() + 1 })))
      .catch(err => window.Log?.add('error', `Copy failed · ${destLabel}`, String(err)));
  };

  const onThumbClick = async (id, preset) => {
    const cam = String(preset.camera);

    // Second click on the preset already armed on this camera → go LIVE.
    // onTakeSceneLiveFromNumber handles both liveCam update AND the
    // ping-pong cue (outgoing scene becomes the new cue).
    if (activeByCam[cam] === id) {
      takeLive(preset);
      if (onTakeSceneLiveFromNumber) onTakeSceneLiveFromNumber(preset.camera);
      return;
    }

    // Before sending the camera elsewhere, pull a fresh snapshot of what
    // it's currently showing and cache it against the outgoing preset.
    // Awaited so the server gets the snapshot from the camera BEFORE the
    // move command races through. Safe no-op if nothing was armed.
    await snapshotActiveOnCam(cam);

    // First click → send the camera to this preset
    const moveStart = performance.now();
    moveCamera(preset);
    setActiveByCam(m => ({ ...m, [cam]: id }));
    setMotionByCam(m => ({ ...m, [cam]: id }));
    // Cueing a thumb also cues the scene for its camera — "only one cue'd
    // scene at once" is enforced by the single-slot cuedSceneId in App.
    setCuedSceneFromNumber && setCuedSceneFromNumber(preset.camera);

    // Break detection — two flavours, both trip on first-click arming:
    //
    //   a. Pre-roll steal: operator armed a thumb on the pre-rolled
    //      camera that isn't the pre-roll thumb. Queue's planned
    //      next shot is gone.
    //
    //   b. Live-cam re-arm: operator armed a thumb on the queue's
    //      CURRENTLY-LIVE camera. This is subtle because taking the
    //      same-camera thumb doesn't fire an OBS scene change — the
    //      ls:scene-live listener early-returns in App and never
    //      sees the take. But first-click already moves the physical
    //      camera to a different shot than the queue intended, so
    //      it's a real takeover. Detect it here instead.
    if (queueRunningRef.current) {
      // (a) pre-roll
      if (cam === queuePreRollCamRef.current && id !== queuePreRollIdRef.current) {
        setQueueRunning(false);
        window.Log?.add('live', 'Auto-queue paused', `pre-roll on Cam ${cam} re-armed to ${id}`);
        queuePreRollIdRef.current = null;
        queuePreRollCamRef.current = null;
      } else {
        // (b) live-cam — compute the queue's expected thumb on its
        // current live camera and compare. Only fires when queue is
        // actually running AND this click hit the live cam.
        const curSlot = QUEUE_SLOTS[queueLiveIdxRef.current];
        const curPre  = presetFor(curSlot);
        const curCam  = String(curPre.camera);
        const curId   = `queue-${curSlot}`;
        if (cam === curCam && id !== curId) {
          setQueueRunning(false);
          window.Log?.add('live', 'Auto-queue paused', `live Cam ${cam} re-armed to ${id}`);
        }
      }
    }

    // Wait for the camera to actually arrive before touching motion marker /
    // thumb / log. `settle()` polls VISCA every ~250 ms until two consecutive
    // reads match, or 5 s max. Much tighter than the old fixed 5 s timeout —
    // small pans clear in ~0.5 s, slow focus pulls get headroom up to the cap.
    //
    // Staleness guard: if the user clicked another thumb on the same camera
    // (or jogged PTZ) before we arrived, bail — the newer action owns the
    // motion marker and thumb refresh.
    window.PTZState?.settle(preset.camera).then(pos => {
      if (activeByCamRef.current[cam] !== id) return; // superseded

      const elapsedMs = Math.round(performance.now() - moveStart);
      setMotionByCam(m => (m[cam] === id ? { ...m, [cam]: null } : m));

      // Pull a fresh snapshot of the now-stationary view. WebRTC frame first
      // (instant, no camera round-trip), fall back to server action_snapshot
      // if the <video> hasn't buffered. Bump refreshMap only after the file
      // is on disk so the <img> reloads the new frame, not the stale copy.
      const endpoint = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';
      const bump = () => setRefreshMap(m => ({ ...m, [id]: Date.now() }));
      const web = window.capturePresetThumb
        ? window.capturePresetThumb(Number(preset.camera), preset.slot)
        : Promise.resolve(false);
      web.then(ok => {
        if (ok) { bump(); return; }
        fetch(`${endpoint}?cmd=thumb&camera=${preset.camera}&id=${preset.presetId}&ts=${Date.now()}`)
          .then(() => bump())
          .catch(() => {});
      });

      // Log the settled coordinates + total elapsed wall time from click to
      // settle() resolving. Lets us eyeball whether a slow "Arrived" is the
      // camera itself (big pan, long focus pull) vs. the settle loop (too
      // many polls, too slow an interval, network round-trip overhead).
      if (pos) {
        window.Log?.add(
          'camera',
          `Arrived · Cam ${preset.camera} · ${preset.label}`,
          `${elapsedMs}ms · p=${pos.pan} t=${pos.tilt} z=${pos.zoom} f=${pos.focus}`
        );
      } else {
        window.Log?.add('camera', `Arrived · Cam ${preset.camera} · ${preset.label}`, `${elapsedMs}ms`);
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
          liveCameraNum={liveCamera}
          activeByCam={activeByCam}
          motionByCam={motionByCam}
          refreshMap={refreshMap}
          onThumbClick={onThumbClick}
          onThumbContext={onThumbContext}
          onThumbDrop={onThumbDrop}
          onThumbCopy={onThumbCopy}
        />
      ))}
      <AutoQueueColumn
        running={queueRunning}
        setRunning={setQueueRunning}
        advance={advanceQueueInternal}
        liveId={liveId}
        liveCameraNum={liveCamera}
        activeByCam={activeByCam}
        motionByCam={motionByCam}
        refreshMap={refreshMap}
        onThumbClick={onThumbClick}
        onThumbContext={onThumbContext}
        onThumbDrop={onThumbDrop}
        onThumbCopy={onThumbCopy}
        queueLiveIdx={queueLiveIdx}
        queueTimer={queueTimer}
      />
      <ContextMenu state={menu.state} onClose={menu.close} />
    </div>
  );
}

Object.assign(window, { PresetGrid });
