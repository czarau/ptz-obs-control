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
const MOTION_MS = 5000; // border flashes for this long after goto; thumb refreshes on completion

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
    fetch(`${endpoint}?${params}`).catch(() => {});
    window.Log?.add('camera', `Move · Cam ${preset.camera} → ${preset.label}`,
      `abs p=${preset.pan} t=${preset.tilt} z=${preset.zoom ?? '-'} f=${preset.focus ?? '-'}`);
  } else {
    // Legacy fallback — camera-side preset slot. Only hit if a preset
    // hasn't been re-saved since the migration to abs positions (or on
    // new sites that still use onboard slots).
    const q = encodeURIComponent(`ptzcmd&poscall&${preset.presetId}`);
    fetch(`${endpoint}?cmd=cgi&camera=${preset.camera}&q=${q}`).catch(() => {});
    window.Log?.add('camera', `Move · Cam ${preset.camera} → ${preset.label}`,
      `slot ${preset.presetId} (legacy)`);
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

function ThumbCard({ preset, onAir, selected, inMotion, refreshTs, compact, onClick, onContextMenu, onDropCamera, queueBadge }) {
  const [dragOver, setDragOver] = useStatePG(false);

  // Accept drops that carry a camera number (set by LiveFeed's onDragStart).
  const acceptsDrop = (e) => e.dataTransfer.types.includes('application/x-ls-camera');
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
    const cam = parseInt(e.dataTransfer.getData('application/x-ls-camera'), 10);
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
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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

function PresetColumn({ bucket, liveId, activeByCam, motionByCam, refreshMap, onThumbClick, onThumbContext, onThumbDrop }) {
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
              onContextMenu={(e) => onThumbContext(e, id, p, bucket)}
              onDropCamera={(cam) => onThumbDrop(id, p, cam)}
            />
          );
        })}
      </div>
    </div>
  );
}

const QUEUE_BUCKET = { key: 'queue', title: 'Queue', slots: QUEUE_SLOTS, cols: 2, span: 2 };

function AutoQueueColumn({ running, setRunning, advance, liveId, activeByCam, motionByCam, refreshMap, onThumbClick, onThumbContext, onThumbDrop, queueLiveIdx, queueTimer }) {
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
          // Live item shows a live countdown; others show their stored timeout.
          const badge = (onAir && idx === queueLiveIdx && queueTimer != null)
            ? queueTimer
            : p.timeout;
          return (
            <ThumbCard
              key={slot}
              preset={p}
              onAir={onAir}
              selected={isActive && !onAir}
              inMotion={isMotion}
              refreshTs={refreshMap[id]}
              queueBadge={badge}
              onClick={() => onThumbClick(id, p)}
              onContextMenu={(e) => onThumbContext(e, id, p, QUEUE_BUCKET)}
              onDropCamera={(cam) => onThumbDrop(id, p, cam)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PresetGrid({ liveId, setLive, liveCamera, setLiveCamFromNumber, admin, queueRunning, setQueueRunning, queueIdx, advanceQueue, showCustom }) {
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

  const takeQueueItem = (qIdx) => {
    const slot = QUEUE_SLOTS[qIdx];
    if (slot == null) return;
    const preset = presetFor(slot);
    const id = `queue-${slot}`;
    const cam = String(preset.camera);

    // Take live on this slot's camera.
    takeLive(preset);
    if (setLiveCamFromNumber) setLiveCamFromNumber(Number(preset.camera));
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
      moveCamera(nextPreset);
      setActiveByCam(m => ({ ...m, [nextCam]: nextId }));
      setMotionByCam(m => ({ ...m, [nextCam]: nextId }));
      setTimeout(() => {
        setMotionByCam(m => (m[nextCam] === nextId ? { ...m, [nextCam]: null } : m));
        setRefreshMap(m => ({ ...m, [nextId]: Date.now() }));
      }, MOTION_MS);
    }

    window.Log?.add('live', `Queue · take #${qIdx + 1}`, `${preset.label} · ${t}s`);
  };

  const advanceQueueInternal = () => {
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

  // When the queue is turned on, kick off the first take (unless we're
  // resuming a paused mid-item countdown).
  useEffectPG(() => {
    if (queueRunning && queueTimerRef.current === 0) {
      takeQueueItem(queueLiveIdxRef.current);
    }
  }, [queueRunning]);

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
    window.addEventListener('ptz:manual-move', onManualMove);
    window.addEventListener('preset:refresh', onPresetRefresh);
    return () => {
      window.removeEventListener('ptz:manual-move', onManualMove);
      window.removeEventListener('preset:refresh', onPresetRefresh);
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
    const liveCam = Number(liveCamera) || 0;
    const isArmed = activeByCam[preset.camera] === id;
    const isQueue = bucket && bucket.key === 'queue';
    // Trigger a thumb refresh for this preset so the card picks up the new snapshot.
    const bumpThumb = () => setRefreshMap(m => ({ ...m, [id]: Date.now() }));

    const ICO = (name) => <Icon name={name} size={13}/>;
    const items = [
      {
        label: 'Save Live',
        icon: ICO('crosshairs'),
        disabled: !liveCam,
        onClick: () => {
          PRESET_ACTIONS.savePosition({ ...preset, camera: String(liveCam) }, liveCam);
          setTimeout(bumpThumb, 1500);
        },
      },
      { separator: true },
      { label: 'Save Camera Back',  icon: ICO('crosshairs'), onClick: () => { PRESET_ACTIONS.savePosition(preset, 1); setTimeout(bumpThumb, 1500); } },
      { label: 'Save Camera Left',  icon: ICO('crosshairs'), onClick: () => { PRESET_ACTIONS.savePosition(preset, 2); setTimeout(bumpThumb, 1500); } },
      { label: 'Save Camera Right', icon: ICO('crosshairs'), onClick: () => { PRESET_ACTIONS.savePosition(preset, 3); setTimeout(bumpThumb, 1500); } },
      { separator: true },
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
          if (next && next !== preset.label) PRESET_ACTIONS.rename(preset, next);
        },
      },
      {
        label: 'Set Timeout',
        icon: ICO('hourglass'),
        disabled: !isQueue,
        onClick: () => {
          const v = window.prompt('Timeout in seconds (5–60)', String(preset.timeout || 10));
          const n = Number(v);
          if (Number.isFinite(n) && n >= 5 && n <= 60) PRESET_ACTIONS.setTimeout(preset, n);
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
  // (same action as right-click → Save Camera Back/Left/Right, but via
  // direct-manipulation).
  const onThumbDrop = (id, preset, cam) => {
    const label = preset.label || `slot ${preset.slot}`;
    window.Log?.add('camera', `Drop-save · Cam ${cam} → ${label}`,
      `capturing PTZ…`);
    const next = { ...preset, label: preset.label || 'Preset' };
    PRESET_ACTIONS.savePosition(next, cam)
      .then(() => {
        setRefreshMap(m => ({ ...m, [id]: Date.now() + 1 }));
      })
      .catch(err => {
        window.Log?.add('error', `Drop-save failed · Cam ${cam} → ${label}`, String(err));
      });
  };

  const onThumbClick = async (id, preset) => {
    const cam = String(preset.camera);

    // Second click on the preset already armed on this camera → go LIVE
    if (activeByCam[cam] === id) {
      takeLive(preset);
      setLiveCamFromNumber && setLiveCamFromNumber(preset.camera);
      return;
    }

    // Before sending the camera elsewhere, pull a fresh snapshot of what
    // it's currently showing and cache it against the outgoing preset.
    // Awaited so the server gets the snapshot from the camera BEFORE the
    // move command races through. Safe no-op if nothing was armed.
    await snapshotActiveOnCam(cam);

    // First click → send the camera to this preset
    moveCamera(preset);
    setActiveByCam(m => ({ ...m, [cam]: id }));
    setMotionByCam(m => ({ ...m, [cam]: id }));
    setTimeout(() => {
      // Only act if this preset is still the latest target for the camera.
      // If the user clicked another thumb on the same camera (or jogged PTZ
      // manually) before we arrived, the camera is heading somewhere else
      // now — don't clear the new motion marker and don't refresh this thumb
      // with what would be a transitional / wrong frame.
      let stillValid = false;
      setMotionByCam(m => {
        if (m[cam] !== id) return m;
        stillValid = true;
        return { ...m, [cam]: null };
      });
      if (stillValid) {
        // Pull a fresh snapshot of the camera's NEW position (it's arrived)
        // and write it to the cache. Bump refreshMap only after the file
        // is on disk so the thumb reloads with the new frame, not a stale
        // copy. Try the instant WebRTC path first, fall back to server
        // action_snapshot if no frame is available.
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
      }
    }, MOTION_MS);

    // Poll the camera's pan/tilt/zoom/focus until it stops moving, then log
    // the final coordinates alongside the preset label. `settle()` keeps
    // sampling (~600 ms apart, up to 8 s) until two consecutive reads match.
    // Same staleness guard: if the camera has been redirected since this
    // click, skip the "Arrived" log for this preset.
    window.PTZState?.settle(preset.camera).then(pos => {
      if (activeByCamRef.current[cam] !== id) return; // superseded
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
          onThumbContext={onThumbContext}
          onThumbDrop={onThumbDrop}
        />
      ))}
      <AutoQueueColumn
        running={queueRunning}
        setRunning={setQueueRunning}
        advance={advanceQueueInternal}
        liveId={liveId}
        activeByCam={activeByCam}
        motionByCam={motionByCam}
        refreshMap={refreshMap}
        onThumbClick={onThumbClick}
        onThumbContext={onThumbContext}
        onThumbDrop={onThumbDrop}
        queueLiveIdx={queueLiveIdx}
        queueTimer={queueTimer}
      />
      <ContextMenu state={menu.state} onClose={menu.close} />
    </div>
  );
}

Object.assign(window, { PresetGrid });
