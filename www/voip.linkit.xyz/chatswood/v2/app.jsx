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
  // cuedSceneId follows the same CUE → LIVE two-click model the preset
  // thumbs use. 'back' | 'left' | 'right' | 'data' | null. Only one scene
  // can be cued at any moment. Cueing is cleared when a take happens, on
  // emergency, or when an external OBS scene change is picked up by the
  // poll.
  const [cuedSceneId, setCuedSceneId] = useState(null);
  const LIVE_CAM_NUM = { back: 1, left: 2, right: 3, data: 0 };
  const CAM_NUM_TO_ID = { 1: "back", 2: "left", 3: "right", 0: "data" };
  const SCENE_FOR_ID = {
    back:  'Camera 1 - Back',
    left:  'Camera 2 - Left',
    right: 'Camera 3 - Right',
    data:  'DP Full Screen',
  };
  const SCENE_TO_CAM = {
    'Camera 1 - Back':  'back',
    'Camera 2 - Left':  'left',
    'Camera 3 - Right': 'right',
    'DP Full Screen':   'data',
    'DP & Speaker':     'data',
    'Emergency':        'emergency',
  };
  const liveCamera = LIVE_CAM_NUM[liveCamId];
  // Camera that arrow-key PTZ acts on: prefer the cued camera so operators
  // can frame the next shot before taking it, fall back to live when
  // nothing is cued so basic jog still works.
  const ptzTargetCam = cuedSceneId != null ? LIVE_CAM_NUM[cuedSceneId] : liveCamera;
  // Whether an id names a real "switchable" scene (not emergency, not null).
  // Used to decide whether it's a valid cue target when a scene transitions.
  const isCuableSceneId = (id) => id === 'back' || id === 'left' || id === 'right' || id === 'data';

  // Ref mirror of liveCamId so handlers that outlive a single render —
  // most notably the OBS scene poll, which uses useEffect([]) and
  // therefore captures a mount-time closure — can read the CURRENT live
  // scene, not the one that was live when they were wired up. Without
  // this the outgoing scene was always "back" (mount-time value), so
  // every take cued Cam 1 regardless of what was actually on program.
  const liveCamIdRef = React.useRef(liveCamId);
  useEffect(() => { liveCamIdRef.current = liveCamId; }, [liveCamId]);

  // One helper for every "this scene just went live" transition. Updates
  // liveCam AND cues the OUTGOING scene so the next take naturally
  // ping-pongs back — user's requested "leave the last live scene as
  // queued when switching" behaviour. Emergency is never cued (recovering
  // from it is a different action) and we never cue the one we just took.
  //
  // Dispatches `ls:scene-live` with the new id so listeners (the
  // auto-queue's break-detector, anything else interested in
  // take-regardless-of-source) can react without each path having to
  // call multiple callbacks. Event-driven rather than state-reactive so
  // it doesn't fire inside a React commit with stale state.
  const onTakeSceneLive = (newId) => {
    if (!newId) return;
    const outgoing = liveCamIdRef.current;
    if (outgoing === newId) return; // no transition, leave cue alone
    setLiveCam(newId);
    if (outgoing && isCuableSceneId(outgoing)) {
      setCuedSceneId(outgoing);
    } else {
      setCuedSceneId(null);
    }
    window.dispatchEvent(new CustomEvent('ls:scene-live', { detail: { id: newId } }));
  };

  // Convenience for child components that only have a camera number.
  const onTakeSceneLiveFromNumber = (n) => {
    const id = CAM_NUM_TO_ID[n];
    if (id) onTakeSceneLive(id);
  };

  // Called by PresetGrid when a thumb is armed on camera N. Syncs the
  // scene cue to that camera's scene so the live feed card reflects the
  // same CUE state as the thumb. Passing null clears the cue.
  const setCuedSceneFromNumber = (n) => {
    if (n == null) { setCuedSceneId(null); return; }
    const id = CAM_NUM_TO_ID[n];
    if (id) setCuedSceneId(id);
  };

  // Take the currently cued scene to program. Switches OBS scene and
  // routes through onTakeSceneLive so the outgoing scene becomes the
  // next cue. No-op if nothing is cued.
  const takeCuedScene = () => {
    if (!cuedSceneId) return;
    const scene = SCENE_FOR_ID[cuedSceneId];
    if (window.OBS && scene) window.OBS.switchScene(scene).catch(() => {});
    window.Log?.add('live', `LIVE → ${cuedSceneId.toUpperCase()}`, scene);
    onTakeSceneLive(cuedSceneId);
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
    setCuedSceneId(null);
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
          if (camId === 'emergency') { setQueueRunning(false); setLiveCam(camId); setCuedSceneId(null); return; }
          // Same ping-pong behaviour as in-app takes — the outgoing scene
          // becomes the next cue, so flipping back to the previous shot is
          // one click / key press away.
          onTakeSceneLive(camId);
        })
        .catch(() => {});
    };
    sync();
    const id = setInterval(sync, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Keyboard shortcuts. Kept tight to prevent live-service misfires:
  //
  //   1–4              Cue scene (Back / Left / Right / Data). Pressing
  //                    the same number again takes it live, matching the
  //                    "second click" behaviour on feed cards.
  //   Space            Take the cued scene live. No-op if nothing cued.
  //   Arrow keys       PTZ on the cued camera, or live if no cue.
  //   + / − / = / _    Zoom on the same target.
  //   Shift + Arrow    Fine adjust.
  //   Escape           Close legend / activity panel (accessibility).
  //
  // No other operational shortcuts — audio source, lights, emergency,
  // record, stream, preset recall etc. all remain button-only.
  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack keys typed into inputs (prompt boxes, future form fields).
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;

      if (e.key === "Escape") { setShowLegend(false); setShowActivity(false); return; }

      // Scene cue / take. Matches the feed two-click model.
      const KEY_TO_SCENE = { '1': 'back', '2': 'left', '3': 'right', '4': 'data' };
      if (KEY_TO_SCENE[e.key]) {
        e.preventDefault();
        const target = KEY_TO_SCENE[e.key];
        if (cuedSceneId === target) {
          // Second press → take live, same as clicking a cued card.
          takeCuedScene();
        } else {
          setCuedSceneId(target);
          window.Log?.add('live', `CUE scene → ${target.toUpperCase()}`, SCENE_FOR_ID[target]);
        }
        return;
      }
      if (e.key === ' ') { e.preventDefault(); takeCuedScene(); return; }

      // PTZ target: cued camera wins, falls back to live if nothing cued.
      // data scene (cam 0) has no PTZ — bail.
      if (!ptzTargetCam || ptzTargetCam === 0) return;
      const fine = e.shiftKey ? 0.4 : 1;
      const panSpd  = Math.max(1, Math.min(24, Math.round(rail.ptzSpeed * 2.4 * fine)));
      const zoomSpd = Math.max(1, Math.min(7,  Math.round(rail.ptzSpeed * 0.7 * fine)));
      const pulse = window.pulseCgi;
      if (!pulse) return;

      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); pulse(ptzTargetCam, `up&${panSpd}&${panSpd}`,    'ptzstop'); return;
        case 'ArrowDown':  e.preventDefault(); pulse(ptzTargetCam, `down&${panSpd}&${panSpd}`,  'ptzstop'); return;
        case 'ArrowLeft':  e.preventDefault(); pulse(ptzTargetCam, `left&${panSpd}&${panSpd}`,  'ptzstop'); return;
        case 'ArrowRight': e.preventDefault(); pulse(ptzTargetCam, `right&${panSpd}&${panSpd}`, 'ptzstop'); return;
        case '+':          case '=': e.preventDefault(); pulse(ptzTargetCam, `zoomin&${zoomSpd}`,  'zoomstop'); return;
        case '-':          case '_': e.preventDefault(); pulse(ptzTargetCam, `zoomout&${zoomSpd}`, 'zoomstop'); return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveCamera, ptzTargetCam, cuedSceneId, rail.ptzSpeed]);

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
          onTakeSceneLiveFromNumber={onTakeSceneLiveFromNumber}
          setCuedSceneFromNumber={setCuedSceneFromNumber}
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
          cuedSceneId={cuedSceneId}
          setCuedSceneId={setCuedSceneId}
          takeCuedScene={takeCuedScene}
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
