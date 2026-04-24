// LiveStream — main app shell
const { useState, useEffect } = React;

function App() {
  const [rail, setRail] = useState({
    spots: false, stage: false, front: false,
    tvLeft: false, tvRight: false,
    audio: "video",
    recording: false, streaming: false,
    ptzSpeed: 6,
  });

  const [liveId, setLive] = useState(null);
  const [liveCamId, setLiveCam] = useState("back");
  const LIVE_CAM_NUM = { back: 1, left: 2, right: 3, data: 0 };
  const CAM_NUM_TO_ID = { 1: "back", 2: "left", 3: "right", 0: "data" };
  const SCENE_TO_CAM = {
    'Camera 1 - Back':  'back',
    'Camera 2 - Left':  'left',
    'Camera 3 - Right': 'right',
    'DP Full Screen':   'data',
    'DP & Speaker':     'data',
    'Emergency':        'emergency',
  };
  const liveCamera = LIVE_CAM_NUM[liveCamId];
  // Called by child components after they switch OBS scenes so the live-camera
  // marker is updated immediately (without waiting for the next OBS poll).
  const setLiveCamFromNumber = (n) => {
    const id = CAM_NUM_TO_ID[n];
    if (id) setLiveCam(id);
  };
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueIdx, setQueueIdx] = useState(0);
  const [cueIdx, setCueIdx] = useState(0);
  const [showLegend, setShowLegend] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [admin, setAdmin] = useState(false);
  // Keep window.LS_CONFIG.admin in sync so plain-JS action helpers can check it.
  useEffect(() => { if (window.LS_CONFIG) window.LS_CONFIG.admin = admin; }, [admin]);

  const advanceQueue = () => setQueueIdx(i => (i + 1) % 8);

  const onEmergency = () => {
    // Match legacy ShowEmergency(): switch to the Emergency scene AND stop
    // the auto-queue so it doesn't take a preset live while the holding slide
    // is on air. Eagerly set liveCamId to 'emergency' so no preset / feed
    // card shows as LIVE until the next scene change.
    if (window.OBS) window.OBS.switchScene(window.OBS.SCENE.emergency).catch(() => {});
    setQueueRunning(false);
    setLiveCam('emergency');
    window.Log?.add('emergency', 'Emergency cut triggered');
  };

  const onTake = () => {
    // TAKE = commit selected live camera to program. The live feed click
    // already switches scenes; TAKE is a no-op for now until a preview/program
    // split is wired up.
  };

  // Poll OBS record/stream status + stats. We derive start-at-timestamps
  // (now - outputDuration) so any locally-computed "HH:MM:SS" timer can
  // just read Date.now() on every tick — drift-free between polls.
  const [recordStartedAt, setRecordStartedAt] = useState(null);
  const [streamStartedAt, setStreamStartedAt] = useState(null);
  const [streamHealth, setStreamHealth] = useState(null);
  const streamBytesRef = React.useRef({ bytes: 0, ts: 0, kbps: 0 });

  useEffect(() => {
    if (!window.OBS) return;
    let alive = true;
    const sync = () => {
      Promise.all([window.OBS.recordStats(), window.OBS.streamStats(), window.OBS.stats()])
        .then(([rec, str, s]) => {
          if (!alive) return;
          setRail(st => ({ ...st, recording: !!rec.outputActive, streaming: !!str.outputActive }));
          setRecordStartedAt(rec.outputActive ? Date.now() - (rec.outputDuration || 0) : null);
          setStreamStartedAt(str.outputActive ? Date.now() - (str.outputDuration || 0) : null);

          // Bitrate: delta bytes / delta seconds × 8 → bits/s → /1000 kbps.
          const now = Date.now();
          const prev = streamBytesRef.current;
          let kbps = prev.kbps;
          if (str.outputActive && prev.ts && str.outputBytes != null && str.outputBytes >= prev.bytes) {
            const dBytes = str.outputBytes - prev.bytes;
            const dSecs  = (now - prev.ts) / 1000;
            if (dSecs > 0) kbps = Math.round((dBytes * 8 / 1000) / dSecs);
          }
          streamBytesRef.current = {
            bytes: str.outputBytes || 0,
            ts: now,
            kbps: str.outputActive ? kbps : 0,
          };

          setStreamHealth({
            active:       !!str.outputActive,
            bitrateKbps:  str.outputActive ? kbps : null,
            droppedFrames: str.outputSkippedFrames != null ? str.outputSkippedFrames : null,
            totalFrames:  str.outputTotalFrames,
            congestion:   str.outputCongestion,          // 0..1 quality indicator
            cpu:          s && s.cpuUsage != null ? Math.round(s.cpuUsage) : null,
          });
        })
        .catch(() => {});
    };
    sync();
    const id = setInterval(sync, 2500);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // 1 Hz ticker for live duration readouts in Record/Stream buttons.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!recordStartedAt && !streamStartedAt) return;
    const id = setInterval(() => setNowTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [recordStartedAt, streamStartedAt]);

  // Expose stream health on window so OverlayDock can read it without
  // prop-drilling through LiveFeedRow.
  useEffect(() => { window.LS_HEALTH = streamHealth; }, [streamHealth]);

  const fmtDuration = (startedAt) => {
    if (!startedAt) return null;
    const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${m}:${String(s).padStart(2,'0')}`;
  };
  const recordSub = fmtDuration(recordStartedAt);
  const streamSub = fmtDuration(streamStartedAt);

  // Poll OBS current program scene so external scene changes (someone switching
  // in OBS directly, or an auto-queue advance) are reflected in the UI.
  // NOTE: don't run side effects (Log, other setStates) inside a setState
  // updater — React may invoke updaters during render, and triggering a
  // cross-component setState from there produces "Cannot update a component
  // while rendering" warnings. Compare against a ref and run side effects
  // around a plain setState instead.
  const lastSceneCamRef = React.useRef(null);
  useEffect(() => {
    if (!window.OBS) return;
    let alive = true;
    const sync = () => {
      window.OBS.currentScene()
        .then(scene => {
          if (!alive) return;
          const camId = SCENE_TO_CAM[scene];
          if (!camId || lastSceneCamRef.current === camId) return;
          lastSceneCamRef.current = camId;
          window.Log?.add('live', `Scene → ${scene}`, 'external');
          if (camId === 'emergency') setQueueRunning(false);
          setLiveCam(camId);
        })
        .catch(() => {});
    };
    sync();
    const id = setInterval(sync, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Keyboard shortcuts — PTZ only. Arrow keys pulse pan/tilt on the
  // currently-live physical camera; +/− pulse zoom; Shift slows both down
  // for fine adjustments. Escape stays because it's the standard close-
  // modal affordance (legend overlay, activity panel). Operational
  // shortcuts for TAKE / queue / emergency / record / stream / audio /
  // lights / preset recall have all been removed — everything is driven
  // from the UI buttons, which eliminates misfires during live services.
  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack keys typed into inputs (prompt boxes, future form fields).
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;

      if (e.key === "Escape") { setShowLegend(false); setShowActivity(false); return; }

      // PTZ shortcuts act on the currently-live physical camera.
      if (!liveCamera || liveCamera === 0) return;
      const fine = e.shiftKey ? 0.4 : 1;
      const panSpd  = Math.max(1, Math.min(24, Math.round(rail.ptzSpeed * 2.4 * fine)));
      const zoomSpd = Math.max(1, Math.min(7,  Math.round(rail.ptzSpeed * 0.7 * fine)));
      const pulse = window.pulseCgi;
      if (!pulse) return;

      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); pulse(liveCamera, `up&${panSpd}&${panSpd}`,    'ptzstop'); return;
        case 'ArrowDown':  e.preventDefault(); pulse(liveCamera, `down&${panSpd}&${panSpd}`,  'ptzstop'); return;
        case 'ArrowLeft':  e.preventDefault(); pulse(liveCamera, `left&${panSpd}&${panSpd}`,  'ptzstop'); return;
        case 'ArrowRight': e.preventDefault(); pulse(liveCamera, `right&${panSpd}&${panSpd}`, 'ptzstop'); return;
        case '+':          case '=': e.preventDefault(); pulse(liveCamera, `zoomin&${zoomSpd}`,  'zoomstop'); return;
        case '-':          case '_': e.preventDefault(); pulse(liveCamera, `zoomout&${zoomSpd}`, 'zoomstop'); return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveCamera, rail.ptzSpeed]);

  return (
    <div className="app">
      <LeftRail state={rail} setState={setRail} onEmergency={onEmergency} admin={admin} setAdmin={setAdmin} emergencyLive={liveCamId === 'emergency'} recordSub={recordSub} streamSub={streamSub} />
      <TopBar
        cueIdx={cueIdx}
        setCueIdx={setCueIdx}
        showLegend={showLegend}
        setShowLegend={setShowLegend}
        showActivity={showActivity}
        setShowActivity={setShowActivity}
      />
      <main className="main">
        <PresetGrid
          liveId={liveId}
          setLive={setLive}
          liveCamera={liveCamera}
          setLiveCamFromNumber={setLiveCamFromNumber}
          admin={admin}
          queueRunning={queueRunning}
          setQueueRunning={setQueueRunning}
          queueIdx={queueIdx}
          advanceQueue={advanceQueue}
          showCustom={true}
        />
        <LiveFeedRow
          liveCamId={liveCamId}
          setLiveCam={setLiveCam}
          ptzSpeed={rail.ptzSpeed}
          onTake={onTake}
        />
      </main>

      {showLegend && <ShortcutLegend onClose={() => setShowLegend(false)} />}
      <ActivityPanel open={showActivity} onClose={() => setShowActivity(false)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
