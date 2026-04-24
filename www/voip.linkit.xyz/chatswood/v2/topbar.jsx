// Top bar: service cue list (static agenda for now), shortcut legend, live clock.
const { useState: useStateTB, useEffect: useEffectTB } = React;

function TopBar({ cueIdx, setCueIdx, showLegend, setShowLegend, showActivity, setShowActivity }) {
  const cues = [
    { t: "11:15", label: "Welcome",        who: "Sarah K." },
    { t: "11:20", label: "Announcements",  who: "Sarah K." },
    { t: "11:30", label: "Opening Songs",  who: "Worship" },
    { t: "11:45", label: "Prayer",         who: "Pastor M." },
    { t: "11:50", label: "Worship",        who: "Worship" },
    { t: "12:00", label: "Sermon",         who: "Pastor M." },
    { t: "12:30", label: "Closing Song",   who: "Worship" },
    { t: "12:35", label: "Closing Prayer", who: "Pastor M." },
  ];

  const [now, setNow] = useStateTB(() => new Date());
  useEffectTB(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clockTime = now.toLocaleTimeString('en-AU', { hour12: false });

  const today = now.toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="service-chip">
          <span className="dot dot-green pulse" />
          <div>
            <div className="service-name">Church Service</div>
            <div className="service-meta">{today}</div>
          </div>
        </div>
      </div>

      <div className="cue-list">
        {cues.map((c, i) => (
          <button
            key={i}
            className={"cue" + (i === cueIdx ? " cue-now" : "") + (i < cueIdx ? " cue-past" : "")}
            onClick={() => setCueIdx(i)}
          >
            <span className="cue-t">{c.t}</span>
            <span className="cue-label">{c.label}</span>
            <span className="cue-who">{c.who}</span>
            {i === cueIdx && <span className="cue-now-badge">NOW</span>}
          </button>
        ))}
      </div>

      <div className="topbar-right">
        <ActivityToggle open={showActivity} onClick={() => setShowActivity(v => !v)} />
        <button className="legend-btn" onClick={() => setShowLegend(v => !v)}>
          <span>Shortcuts</span>
        </button>
        <div className="clock">
          <span className="clock-time">{clockTime}</span>
          <span className="clock-label">local</span>
        </div>
      </div>
    </div>
  );
}

function ShortcutLegend({ onClose }) {
  // Deliberately minimal. Operational shortcuts (audio / lights / record /
  // stream / emergency / presets) are button-only to prevent live-service
  // misfires. The scene-cue flow is the only operational keyboard path.
  const groups = [
    { title: "Scene cue", items: [
      ["1 – 4", "Cue Back / Left / Right / Data"],
      ["Same key again", "Take cued scene live"],
      ["Space", "Take cued scene live"],
    ]},
    { title: "PTZ", items: [
      ["Arrow keys", "Pan / tilt (cued camera, or live if none)"],
      ["+ / −", "Zoom in / out"],
      ["Shift + Arrow", "Fine adjust"],
    ]},
  ];
  return (
    <div className="legend-overlay" onClick={onClose}>
      <div className="legend" onClick={e => e.stopPropagation()}>
        <div className="legend-head">
          <div>
            <div className="legend-title">Keyboard Shortcuts</div>
            <div className="legend-sub">For fast live operation</div>
          </div>
          <button className="legend-close" onClick={onClose}>Close · Esc</button>
        </div>
        <div className="legend-grid">
          {groups.map((g, i) => (
            <div key={i} className="legend-group">
              <div className="legend-group-title">{g.title}</div>
              {g.items.map(([k, v], j) => (
                <div key={j} className="legend-row">
                  <span className="legend-key">{k.split(" ").map((p, pi) => /^[a-zA-Z0-9⌘⇧⌥⌃.`/+\-?]$/.test(p) || p.length <= 4 ? <kbd key={pi}>{p}</kbd> : <em key={pi}>{p}</em>)}</span>
                  <span className="legend-desc">{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TopBar, ShortcutLegend });
