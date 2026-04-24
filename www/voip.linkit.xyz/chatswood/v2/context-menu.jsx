// Lightweight right-click menu — no jQuery dependency. The old UI used
// jQuery-contextMenu; this is the React port.
//
// Usage:
//   const menu = useContextMenu();
//   <div onContextMenu={e => menu.open(e, items)} />
//   <ContextMenu state={menu.state} onClose={menu.close} />
//
// `items` is a list of { label, icon?, disabled?, separator?, onClick }.

const { useState: useStateCM, useEffect: useEffectCM, useRef: useRefCM } = React;

function ContextMenu({ state, onClose }) {
  const ref = useRefCM(null);

  useEffectCM(() => {
    if (!state.open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    // Delay binding so the triggering click doesn't immediately close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [state.open, onClose]);

  if (!state.open) return null;

  // Clamp menu inside viewport.
  const maxX = window.innerWidth  - 240;
  const maxY = window.innerHeight - 32 * (state.items || []).length - 12;
  const left = Math.min(state.x, maxX);
  const top  = Math.min(state.y, maxY);

  return (
    <div className="ctxmenu" ref={ref} style={{ left, top }} onClick={e => e.stopPropagation()}>
      {(state.items || []).map((item, i) => {
        if (item.separator) return <div key={i} className="ctxmenu-sep" />;
        return (
          <button
            key={i}
            className={"ctxmenu-item" + (item.disabled ? " disabled" : "")}
            disabled={!!item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              // Defer so the menu closes before the action's own prompts open.
              setTimeout(() => item.onClick && item.onClick(), 0);
            }}
          >
            {item.icon && <span className="ctxmenu-icon" aria-hidden>{item.icon}</span>}
            <span className="ctxmenu-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function useContextMenu() {
  const [state, setState] = useStateCM({ open: false, x: 0, y: 0, items: [] });
  const open = (e, items) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ open: true, x: e.clientX, y: e.clientY, items });
  };
  const close = () => setState(s => (s.open ? { ...s, open: false } : s));
  return { state, open, close };
}

Object.assign(window, { ContextMenu, useContextMenu });
