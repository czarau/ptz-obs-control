// Preset grid — 5 category columns + Auto Queue column.
// Pulls the flat preset array from window.LS_CONFIG.presets (injected by index.php)
// and buckets slots by range. Each slot stores {camera, label, timeout?} in the
// existing chatswood settings format; absolute preset id = presetStartIndex + slot.

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

function recallPreset(preset) {
  const endpoint = window.LS_CONFIG?.thumbEndpoint || '../chatswood/control_thumb.php';
  // Switch OBS scene to the camera that holds this preset
  if (window.OBS) {
    const sceneName = CAM_SCENE[preset.camera];
    if (sceneName) window.OBS.switchScene(sceneName).catch(() => {});
  }
  // Tell the camera to physically move
  const url = `${endpoint}?cmd=goto&camera=${preset.camera}&val=${preset.presetId}&ts=${Date.now()}`;
  fetch(url, { method: 'GET', mode: 'cors' }).catch(() => {});
}

function ThumbCard({ preset, onAir, selected, compact, onClick, queueBadge }) {
  return (
    <button
      className={"thumb" + (onAir ? " onair" : "") + (selected ? " selected" : "") + (compact ? " compact" : "")}
      onClick={onClick}
    >
      <div className="thumb-img">
        <Thumb presetId={preset.presetId} camera={preset.camera} />
        {onAir && <span className="thumb-livebadge">LIVE</span>}
        {queueBadge != null && <span className="thumb-timer">{queueBadge}s</span>}
      </div>
      <div className="thumb-meta">
        <span className={"thumb-num" + (onAir ? " num-live" : "")}>{preset.camera}</span>
        <span className="thumb-label">{preset.label}</span>
      </div>
    </button>
  );
}

function PresetColumn({ bucket, liveId, setLive }) {
  const presets = bucket.slots.map(presetFor);
  return (
    <div className="pcol" style={{ gridColumn: `span ${bucket.span}` }}>
      <div className="pcol-head">
        <span className="pcol-title">{bucket.title}</span>
      </div>
      <div className="pcol-grid" data-cols={bucket.cols} style={{ gridTemplateColumns: `repeat(${bucket.cols}, 1fr)` }}>
        {presets.map((p) => {
          const id = `${bucket.key}-${p.slot}`;
          return (
            <ThumbCard
              key={id}
              preset={p}
              onAir={liveId === id}
              onClick={() => { setLive(id); recallPreset(p); }}
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

function PresetGrid({ liveId, setLive, queueRunning, setQueueRunning, queueIdx, advanceQueue, showCustom }) {
  const buckets = showCustom ? SLOT_BUCKETS : SLOT_BUCKETS.filter(b => b.key !== 'custom');
  return (
    <div className="preset-grid">
      {buckets.map(b => (
        <PresetColumn key={b.key} bucket={b} liveId={liveId} setLive={setLive} />
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
