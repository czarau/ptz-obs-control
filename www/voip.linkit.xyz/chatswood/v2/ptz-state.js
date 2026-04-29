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
  //
  // Interval was 600 ms; dropped to 250 ms once goto_abs started blocking on
  // VISCA COMPLETE (camera has physically arrived by the time goto_abs
  // returns), so the first settle query usually already reads a stable
  // value. Minimum detection is now ~one interval + two query round-trips,
  // ≈ 500–700 ms total from the fetch resolving.
  //
  // Heartbeat: while the loop is still running, emits a "Moving · Cam N"
  // log every ~1 s with elapsed wall time, in-flight poll count, and the
  // most recent position read. Helps diagnose slow "Arrived" reports —
  // e.g. is query() itself hanging (poll count not advancing), or are the
  // values genuinely still changing (poll count climbing, p/t/z/f drifting),
  // or is goto_abs holding the camera's VISCA TCP socket so concurrent
  // queries queue server-side?
  function settle(cam, opts) {
    const interval     = (opts && opts.interval)     || 250;
    const maxWait      = (opts && opts.maxWait)      || 5000;
    // If we never observe movement away from the initial reading, assume
    // the click was a no-op (preset is already where the camera is parked)
    // and resolve after this grace period. Without this, "stable" would
    // trip on the very first repeat of the pre-move position, and we'd
    // log "Arrived" before the camera has even started — which is exactly
    // what happened once the PHP VISCA backend cut the goto_abs RTT down
    // from ~200 ms to ~70 ms and exposed the race.
    const noMoveGrace  = (opts && opts.noMoveGrace)  || 1500;

    const start = Date.now();
    let initial = null;       // first poll's position (the "before move" snapshot)
    let last    = null;       // most recent poll
    let movementSeen = false; // have we observed pos != initial yet?
    let queryCount = 0;
    let resolved = false;

    const samePos = (a, b) =>
      !!(a && b && a.pan === b.pan && a.tilt === b.tilt
                 && a.zoom === b.zoom && a.focus === b.focus);

    const heartbeat = setInterval(() => {
      if (resolved) return;
      const elapsed = Date.now() - start;
      const cur = state[cam];
      const moveTag = movementSeen ? 'moving' : 'awaiting move';
      const detail = cur
        ? `${elapsed}ms · ${queryCount} polls · ${moveTag} · p=${cur.pan} t=${cur.tilt} z=${cur.zoom} f=${cur.focus}`
        : `${elapsed}ms · ${queryCount} polls · ${moveTag} · no position yet`;
      window.Log?.add('camera', `Moving · Cam ${cam}`, detail);
    }, 1000);

    const finish = (pos) => {
      if (resolved) return last;       // hard timeout already resolved us
      resolved = true;
      clearInterval(heartbeat);
      return pos;
    };

    // Hard wall-clock deadline. settle()'s inner `Date.now() - start >=
    // maxWait` check only runs AFTER each query() resolves, so a single
    // hung fetch (camera VISCA stalled, server queue contention, etc.)
    // can blow past the cap by tens of seconds — exactly the 23 s
    // "arrived" we saw in the field. This race ensures we give up at the
    // declared maxWait regardless of what's in flight.
    const deadline = new Promise((resolve) => {
      setTimeout(() => {
        if (resolved) return;
        window.Log?.add('error', `settle timeout · Cam ${cam}`,
          `${maxWait}ms cap hit · ${queryCount} polls · last in-flight query never returned`);
        clearInterval(heartbeat);
        resolved = true;
        resolve(last);
      }, maxWait);
    });

    const sample = () => {
      if (resolved) return last;
      queryCount++;
      return query(cam).then(pos => {
        if (resolved) return last;     // hard timeout already won the race
        if (!pos) return finish(null);

        if (initial === null) {
          initial = pos;
        } else if (!samePos(initial, pos)) {
          movementSeen = true;
        }

        const stable  = samePos(last, pos);
        const elapsed = Date.now() - start;

        // Trust "stable" only once we've actually seen the camera move,
        // OR enough time has elapsed that we conclude the move was a
        // no-op (clicked preset == current camera position).
        if (stable && (movementSeen || elapsed >= noMoveGrace)) return finish(pos);

        last = pos;
        if (elapsed >= maxWait) return finish(pos);
        return new Promise(r => setTimeout(r, interval)).then(sample);
      });
    };

    return Promise.race([sample(), deadline]);
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
