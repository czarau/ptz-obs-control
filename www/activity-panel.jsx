// Collapsible activity log — slide-in drawer from the right edge. Subscribes
// to window.Log (activity-log.js) and re-renders on new entries.

const { useState: useStateAP, useEffect: useEffectAP } = React;

function useLogEntries() {
  const [version, setVersion] = useStateAP(0);
  useEffectAP(() => window.Log?.subscribe(() => setVersion(v => v + 1)), []);
  return window.Log?.getAll() || [];
}

const CAT_COLOUR = {
  camera:    '#60a5fa',
  live:      '#22c55e',
  audio:     '#c084fc',
  lights:    '#f59e0b',
  broadcast: '#ef4444',
  emergency: '#ef4444',
  system:    '#6a6a72',
  error:     '#ef4444',
};

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtTime(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }

function ActivityPanel({ open, onClose }) {
  const entries = useLogEntries();
  return (
    <div className={"activity-panel" + (open ? " open" : "")} aria-hidden={!open}>
      <div className="activity-head">
        <div className="activity-title">Activity Log</div>
        <div className="activity-actions">
          <button className="activity-btn" onClick={() => window.Log?.download()} title="Download log">Export</button>
          <button className="activity-btn" onClick={() => window.Log?.clear()} title="Clear log">Clear</button>
          <button className="activity-btn activity-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>
      </div>
      <div className="activity-body">
        {entries.length === 0 && <div className="activity-empty">No activity yet.</div>}
        {entries.map((e, i) => (
          <div key={i} className="activity-row">
            <span className="activity-ts">{fmtTime(e.ts)}</span>
            <span className="activity-cat" style={{ color: CAT_COLOUR[e.category] || '#a0a0a8' }}>
              {e.category}
            </span>
            <span className="activity-msg">
              {e.message}
              {e.detail && <em className="activity-detail"> · {e.detail}</em>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Small badge button for the topbar that shows unread-count since last open.
function ActivityToggle({ open, onClick }) {
  const entries = useLogEntries();
  const recent = entries.length;
  return (
    <button className="legend-btn activity-toggle" onClick={onClick} title="Activity log">
      <Icon name="log" size={12}/>
      <span>Log</span>
      {recent > 0 && <span className="activity-badge">{recent > 99 ? '99+' : recent}</span>}
    </button>
  );
}

Object.assign(window, { ActivityPanel, ActivityToggle });
