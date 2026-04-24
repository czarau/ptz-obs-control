// PTZ position cache. Fetches {pan, tilt, zoom, focus} for each camera from
// control_thumb.php?cmd=ptz&camera=N (which shells out to python/cam_control.py
// over VISCA-TCP). Results live in window.PTZState.byCamera[camN] and
// subscribers are notified whenever a camera's values update.
//
// Example reads:
//   window.PTZState.byCamera[1] // → { pan, tilt, zoom, focus, ts } | null
//   window.PTZState.query(2).then(pos => ...)
//   window.PTZState.subscribe(() => ...)

(function () {
  const state = { 1: null, 2: null, 3: null };
  const subs  = new Set();

  function notify() { subs.forEach(fn => { try { fn(); } catch (_) {} }); }

  function endpoint() {
    return (window.LS_CONFIG && window.LS_CONFIG.thumbEndpoint) || '../control_thumb.php';
  }

  // Fetch current position for one camera. Returns a Promise that resolves
  // with {pan, tilt, zoom, focus} or null on failure. Tolerates empty bodies
  // (Python script bailed because the camera was unreachable — common during
  // startup or when a camera is powered down).
  //
  // On failure we log ONCE per (camera, reason) combo per session so a bad
  // camera doesn't spam the activity log, but the first failure is visible
  // for diagnosis.
  const loggedFailures = new Set();
  function logFailure(cam, reason) {
    const key = `${cam}:${reason}`;
    if (loggedFailures.has(key)) return;
    loggedFailures.add(key);
    window.Log?.add('error', `PTZ query failed · Cam ${cam}`, reason);
  }

  function query(cam) {
    const url = `${endpoint()}?cmd=ptz&camera=${cam}&ts=${Date.now()}`;
    return fetch(url, { method: 'GET' })
      .then(r => {
        if (!r.ok) { logFailure(cam, `HTTP ${r.status}`); return ''; }
        return r.text();
      })
      .then(text => {
        if (!text || !text.trim()) {
          logFailure(cam, 'empty response (camera unreachable?)');
          return null;
        }
        try {
          return JSON.parse(text);
        } catch (e) {
          logFailure(cam, `non-JSON response: ${text.slice(0, 80)}`);
          return null;
        }
      })
      .then(data => {
        if (!data || data.pan == null) return null;
        const entry = {
          pan:   data.pan,
          tilt:  data.tilt,
          zoom:  data.zoom,
          focus: data.focus,
          ts:    Date.now(),
        };
        state[cam] = entry;
        notify();
        return entry;
      })
      .catch(err => { logFailure(cam, `fetch error: ${err && err.message || err}`); return null; });
  }

  function queryAll() {
    return Promise.all([1, 2, 3].map(query));
  }

  // Poll until the camera stops moving: query pos, wait, query again, compare.
  // Resolves with the final settled position (or the last sample if we hit the
  // timeout first). Resolves to null if the first query fails.
  function settle(cam, opts) {
    const interval = (opts && opts.interval) || 600;
    const maxWait  = (opts && opts.maxWait)  || 8000;
    const start = Date.now();
    let last = null;

    const sample = () => query(cam).then(pos => {
      if (!pos) return null;
      const stable = last
        && last.pan  === pos.pan
        && last.tilt === pos.tilt
        && last.zoom === pos.zoom
        && last.focus === pos.focus;
      if (stable) return pos;
      last = pos;
      if (Date.now() - start >= maxWait) return pos;
      return new Promise(r => setTimeout(r, interval)).then(sample);
    });

    return sample();
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  window.PTZState = {
    get byCamera() { return state; },
    query,
    queryAll,
    settle,
    subscribe,
  };
})();
