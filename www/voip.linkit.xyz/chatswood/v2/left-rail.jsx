// Left rail: LIGHTS, AUDIO, BROADCAST, PTZ SPEED.
// Smart-device toggles call ../index.php?action=smartdevice.
// Audio radios + Record/Stream buttons call OBS via window.OBS.

const SMART_ENDPOINT = (window.LS_CONFIG || {}).smartEndpoint || '../index.php';

function smartDevice(device, state) {
  const url = `${SMART_ENDPOINT}?action=smartdevice&device=${device}&state=${state ? 1 : 0}`;
  return fetch(url, { method: 'GET', mode: 'cors' }).catch(() => {});
}

const DEVICE_LABEL = { SPOTS: 'Spots', STAGE: 'Stage', FRONT: 'Front', LG_LEFT: 'TV Left', LG_RIGHT: 'TV Right' };
const AUDIO_LABEL  = { church: 'Church Mix', video: 'Video Mix', backup: 'Video Mix (Backup)' };

function LeftRail({ state, setState, onEmergency, admin, setAdmin }) {
  const toggleDevice = (key, device) => {
    const next = !state[key];
    setState(s => ({ ...s, [key]: next }));
    smartDevice(device, next);
    window.Log?.add('lights', `${DEVICE_LABEL[device] || device} → ${next ? 'ON' : 'OFF'}`);
  };

  const selectAudio = (kind) => {
    if (state.audio === kind) return;
    setState(s => ({ ...s, audio: kind }));
    if (window.OBS) window.OBS.setAudioSource(kind).catch(() => {});
    window.Log?.add('audio', `Audio source → ${AUDIO_LABEL[kind] || kind}`);
  };

  const toggleRecord = () => {
    const next = !state.recording;
    setState(s => ({ ...s, recording: next }));
    if (window.OBS) window.OBS.toggleRecord().catch(() => {});
    window.Log?.add('broadcast', `Recording ${next ? 'started' : 'stopped'}`);
  };

  const toggleStream = () => {
    const next = !state.streaming;
    setState(s => ({ ...s, streaming: next }));
    if (window.OBS) window.OBS.toggleStream().catch(() => {});
    window.Log?.add('broadcast', `Streaming ${next ? 'started' : 'stopped'}`);
  };

  return (
    <aside className="rail">
      <div className="rail-brand">
        <div className="brand-mark" aria-hidden>
          <svg viewBox="0 0 20 20" width="18" height="18"><circle cx="10" cy="10" r="8" fill="none" stroke="#22c55e" strokeWidth="1.5"/><circle cx="10" cy="10" r="3" fill="#22c55e"/></svg>
        </div>
        <div>
          <div className="brand-name">LiveStream</div>
          <div className="brand-sub">Sanctuary · Sunday 10:30</div>
        </div>
      </div>

      <Section title="Lights">
        <Toggle label="Spots"     icon="spot"  on={state.spots}   onClick={() => toggleDevice('spots', 'SPOTS')} />
        <Toggle label="Stage"     icon="stage" on={state.stage}   onClick={() => toggleDevice('stage', 'STAGE')} />
        <Toggle label="Front"     icon="front" on={state.front}   onClick={() => toggleDevice('front', 'FRONT')} />
        <div className="rail-divider" />
        <Toggle label="TV Left"   icon="tv"    on={state.tvLeft}  onClick={() => toggleDevice('tvLeft', 'LG_LEFT')} />
        <Toggle label="TV Right"  icon="tv"    on={state.tvRight} onClick={() => toggleDevice('tvRight', 'LG_RIGHT')} />
      </Section>

      <Section title="Audio Source">
        <Radio label="Church Mix" sub="Sanctuary speakers"    checked={state.audio === "church"} onClick={() => selectAudio('church')} />
        <Radio label="Video Mix"  sub="Default · stream feed" checked={state.audio === "video"}  onClick={() => selectAudio('video')} />
        <Radio label="Video Mix"  sub="Backup · analog"       checked={state.audio === "backup"} onClick={() => selectAudio('backup')} />
      </Section>

      <Section title="Broadcast">
        <BigButton label="Emergency" tone="danger" icon="alert" onClick={onEmergency}/>
        <BigButton label="Record" tone={state.recording ? "active-record" : "default"} icon="rec" sub={state.recording ? "recording" : "stopped"} onClick={toggleRecord}/>
        <BigButton label="Stream" tone={state.streaming ? "active-live" : "default"}   icon="stream" sub={state.streaming ? "LIVE" : "offline"} onClick={toggleStream}/>
      </Section>

      <div className="rail-spacer" />

      <Section title="PTZ Speed">
        <div className="ptz-row">
          <div className="ptz-ticks">
            {Array.from({length: 10}).map((_, i) => (
              <span key={i} className={"ptz-tick" + (i < state.ptzSpeed ? " on" : "")} />
            ))}
          </div>
          <div className="ptz-val">{state.ptzSpeed}<span>/10</span></div>
        </div>
        <input
          type="range" min="1" max="10" step="1" value={state.ptzSpeed}
          onChange={e => setState(s => ({...s, ptzSpeed: +e.target.value}))}
          className="ptz-slider"
        />
      </Section>

      <div className="rail-foot">
        <button
          type="button"
          className={"rail-foot-row op-toggle" + (admin ? " admin" : "")}
          onClick={(e) => {
            if (!e.ctrlKey) return;
            const next = !admin;
            setAdmin && setAdmin(next);
            window.Log?.add('system', `Admin mode ${next ? 'enabled' : 'disabled'}`);
          }}
          title="Ctrl+click to toggle admin mode"
        >
          <span className={"dot " + (admin ? "dot-warn" : "dot-green")} />
          Operator · {window.LS_CONFIG?.user || 'guest'}{admin ? ' · ADMIN' : ''}
        </button>
        <div className="rail-foot-row muted">chatswood2 · prototype</div>
      </div>
    </aside>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="rail-sec">
      <div className="rail-sec-head">
        <span>{title}</span>
        {right}
      </div>
      <div className="rail-sec-body">{children}</div>
    </section>
  );
}

function Icon({ name, size = 14 }) {
  const s = size;
  const stroke = "currentColor";
  const common = { width: s, height: s, viewBox: "0 0 16 16", fill: "none", stroke, strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "spot":   return <svg {...common}><path d="M8 2v3M4 4l2 2M12 4l-2 2"/><circle cx="8" cy="10" r="3"/></svg>;
    case "stage":  return <svg {...common}><rect x="2" y="7" width="12" height="5" rx="0.5"/><path d="M4 7V4M12 7V4"/></svg>;
    case "front":  return <svg {...common}><rect x="3" y="3" width="10" height="10" rx="1"/><path d="M3 8h10M8 3v10"/></svg>;
    case "tv":     return <svg {...common}><rect x="2" y="3" width="12" height="8" rx="1"/><path d="M5 13h6"/></svg>;
    case "alert":  return <svg {...common}><path d="M8 2l6 11H2L8 2z"/><path d="M8 7v3M8 12v.01"/></svg>;
    case "rec":    return <svg {...common}><circle cx="8" cy="8" r="4" fill={stroke}/></svg>;
    case "stream": return <svg {...common}><path d="M3 5a7 7 0 0 1 10 0M5 8a4 4 0 0 1 6 0"/><circle cx="8" cy="11" r="1" fill={stroke}/></svg>;
    case "swap":   return <svg {...common}><path d="M3 5h9l-2-2M13 11H4l2 2"/></svg>;
    case "play":   return <svg {...common}><path d="M5 3l8 5-8 5V3z" fill={stroke}/></svg>;
    case "pause":  return <svg {...common}><rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/></svg>;
    case "skip":   return <svg {...common}><path d="M3 3l7 5-7 5V3z" fill={stroke} stroke="none"/><rect x="11" y="3" width="2" height="10" fill={stroke} stroke="none"/></svg>;
    case "log":    return <svg {...common}><path d="M3 3h10v10H3z"/><path d="M5 6h6M5 8h6M5 10h4"/></svg>;
    case "crosshairs": return <svg {...common}><circle cx="8" cy="8" r="5"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/><circle cx="8" cy="8" r="1" fill={stroke}/></svg>;
    case "edit":   return <svg {...common}><path d="M2 12l1.5-4L11 1l3 3-7.5 7.5L2 12z"/><path d="M9 3l3 3"/></svg>;
    case "hourglass": return <svg {...common}><path d="M4 2h8M4 14h8"/><path d="M4 2c0 3 4 4 4 6s-4 3-4 6"/><path d="M12 2c0 3-4 4-4 6s4 3 4 6"/></svg>;
    case "rotate": return <svg {...common}><path d="M14 8a6 6 0 1 1-2-4.5"/><path d="M14 2v4h-4"/></svg>;
    case "save":   return <svg {...common}><path d="M3 2h8l3 3v9H3V2z"/><path d="M5 2v4h6V2"/><path d="M5 10h6v4H5z"/></svg>;
    default: return null;
  }
}

function Toggle({ label, icon, on, onClick }) {
  return (
    <button className={"toggle" + (on ? " on" : "")} onClick={onClick}>
      <Icon name={icon}/>
      <span>{label}</span>
      <span className="toggle-led" />
    </button>
  );
}

function Radio({ label, sub, checked, onClick }) {
  return (
    <button className={"radio" + (checked ? " on" : "")} onClick={onClick}>
      <span className="radio-dot"><span/></span>
      <span className="radio-label">
        <span>{label}</span>
        <em>{sub}</em>
      </span>
    </button>
  );
}

function BigButton({ label, tone = "default", icon, sub, onClick }) {
  return (
    <button className={"bigbtn bigbtn-" + tone} onClick={onClick}>
      <span className="bigbtn-icon"><Icon name={icon} size={15}/></span>
      <span className="bigbtn-text">
        <span className="bigbtn-label">{label}</span>
        {sub && <span className="bigbtn-sub">{sub}</span>}
      </span>
    </button>
  );
}

Object.assign(window, { LeftRail, Icon });
