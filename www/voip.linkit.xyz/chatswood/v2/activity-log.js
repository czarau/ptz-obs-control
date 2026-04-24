// In-memory activity log. Circular buffer (most-recent-first) with a simple
// pub/sub API so React components can subscribe. Entries are {ts, category,
// message, detail?} — category drives colour coding in the UI.

(function () {
  const MAX_ENTRIES = 300;
  const entries = [];
  const subs = new Set();

  function add(category, message, detail) {
    entries.unshift({
      ts: new Date(),
      category,
      message,
      detail: detail || null,
    });
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    // Notify subscribers on the next microtask so a stray Log.add() from
    // inside a React render/updater won't trigger "Cannot update a
    // component while rendering" warnings.
    Promise.resolve().then(() => {
      subs.forEach(fn => { try { fn(); } catch (_) {} });
    });
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  function getAll()      { return entries; }
  function clear()       { entries.length = 0; subs.forEach(fn => fn()); }

  function toText() {
    return entries.slice().reverse().map(e =>
      `${e.ts.toISOString()} [${e.category}] ${e.message}${e.detail ? ' — ' + e.detail : ''}`
    ).join('\n');
  }

  function download() {
    const blob = new Blob([toText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `livestream-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.Log = { add, subscribe, getAll, clear, toText, download };

  // Surface uncaught errors in the log so operators see them.
  window.addEventListener('error', (e) => add('error', e.message || 'Unknown error'));
  add('system', 'Console opened');
})();
