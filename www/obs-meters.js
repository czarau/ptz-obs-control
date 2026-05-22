// OBS audio level bus. Opens a SEPARATE long-lived OBS-WebSocket connection
// (obs-client.js opens/closes per call; that pattern is wrong for a
// streaming event). Subscribes to InputVolumeMeters, which OBS only emits
// when the client explicitly opts into the "high-volume" event category.
//
// Shape of each InputVolumeMeters event:
//   { inputs: [
//       { inputName: "...",
//         inputLevelsMul: [ [mag, peak, input], ... ]   one tuple per channel
//       }, ...
//   ] }
//
// We reduce the per-channel tuples to a single {mag, peak, input} per input
// (max across channels), hold peak for a short decay so the bar-top stays
// visible, and notify React subscribers at most 20 Hz.

(function () {
  const PEAK_HOLD_MS = 900;   // how long a peak bar-top "sticks" before decay
  const PEAK_DECAY   = 0.12;  // falloff per 50ms tick after hold elapses
  const THROTTLE_MS  = 50;    // UI re-render cap (20 Hz)
  const RECONNECT_MS = 4000;  // wait after a drop before retry

  /** inputName -> { mag, peak, input, heldPeak, heldPeakTs, ts } */
  const levels = {};
  const subs = new Set();

  let obs = null;
  let connected = false;
  let reconnectTimer = null;

  let throttleTimer = null;
  let dirty = false;

  function notify() { subs.forEach(fn => { try { fn(); } catch (_) {} }); }

  function scheduleNotify() {
    dirty = true;
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      if (dirty) { dirty = false; notify(); }
    }, THROTTLE_MS);
  }

  // Peak decay loop — once the peak-hold window expires, walk the held
  // bar-top down so it visually settles toward silence even between events.
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    Object.keys(levels).forEach(name => {
      const l = levels[name];
      if (!l) return;
      if (l.heldPeak != null && now - l.heldPeakTs > PEAK_HOLD_MS) {
        const next = Math.max(l.peak || 0, l.heldPeak - PEAK_DECAY);
        if (next !== l.heldPeak) { l.heldPeak = next; changed = true; }
      }
    });
    if (changed) scheduleNotify();
  }, 50);

  function handleEvent(data) {
    const now = Date.now();
    (data.inputs || []).forEach(input => {
      const channels = input.inputLevelsMul || [];
      let mag = 0, peak = 0, inp = 0;
      channels.forEach(lvls => {
        mag  = Math.max(mag,  lvls[0] || 0);
        peak = Math.max(peak, lvls[1] || 0);
        inp  = Math.max(inp,  lvls[2] || 0);
      });
      const prev = levels[input.inputName];
      const heldPeak = prev && prev.heldPeak != null && prev.heldPeak > peak
        ? prev.heldPeak
        : peak;
      const heldPeakTs = heldPeak > (prev?.heldPeak || 0) || !prev
        ? now
        : prev.heldPeakTs;
      levels[input.inputName] = { mag, peak, input: inp, heldPeak, heldPeakTs, ts: now };
    });
    scheduleNotify();
  }

  function connect() {
    if (obs) return;
    const cfg = window.LS_CONFIG || {};
    if (!cfg.obsAddr || typeof OBSWebSocket === 'undefined') return;

    obs = new OBSWebSocket();

    // Event subscription bitfield:
    //   All (defaults) = 1023
    //   InputVolumeMeters = 65536
    // We need the OR of both to keep default events AND receive meter data.
    const eventSubscriptions = 1023 | 65536;

    obs.connect(cfg.obsAddr, cfg.obsPassword, { eventSubscriptions })
      .then(() => {
        connected = true;
        obs.on('InputVolumeMeters', handleEvent);
        obs.on('ConnectionClosed',  scheduleReconnect);
        obs.on('ConnectionError',   scheduleReconnect);
      })
      .catch(() => { obs = null; scheduleReconnect(); });
  }

  function scheduleReconnect() {
    connected = false;
    if (obs) { try { obs.disconnect(); } catch (_) {} obs = null; }
    if (reconnectTimer || subs.size === 0) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (subs.size > 0) connect();
    }, RECONNECT_MS);
  }

  function disconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (obs) { try { obs.disconnect(); } catch (_) {} obs = null; }
    connected = false;
  }

  function subscribe(fn) {
    subs.add(fn);
    if (subs.size === 1) connect();
    return () => {
      subs.delete(fn);
      if (subs.size === 0) disconnect();
    };
  }

  window.OBSMeters = {
    subscribe,
    get: (name) => levels[name] || null,
    getAll: () => levels,
    get connected() { return connected; },
  };
})();
