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
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueIdx, setQueueIdx] = useState(0);
  const [cueIdx, setCueIdx] = useState(0);
  const [showLegend, setShowLegend] = useState(false);

  const advanceQueue = () => setQueueIdx(i => (i + 1) % 8);

  const onEmergency = () => {
    if (window.OBS) window.OBS.switchScene(window.OBS.SCENE.emergency).catch(() => {});
  };

  const onTake = () => {
    // TAKE = commit selected live camera to program. The live feed click
    // already switches scenes; TAKE is a no-op for now until a preview/program
    // split is wired up.
  };

  // Poll OBS record/stream status so UI reflects actual state.
  useEffect(() => {
    if (!window.OBS) return;
    let alive = true;
    const sync = () => {
      Promise.all([window.OBS.recordStatus(), window.OBS.streamStatus()])
        .then(([rec, str]) => {
          if (!alive) return;
          setRail(s => ({ ...s, recording: !!rec, streaming: !!str }));
        })
        .catch(() => {});
    };
    sync();
    const id = setInterval(sync, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setShowLegend(false); return; }
      if (e.key === "?") { setShowLegend(v => !v); return; }
      if (e.key === "`") { setShowLegend(v => !v); return; }
      if (e.key === " ") { e.preventDefault(); onTake(); return; }
      if (e.key.toLowerCase() === "n") { advanceQueue(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); onEmergency(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (window.OBS) window.OBS.toggleRecord().catch(() => {});
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        if (window.OBS) window.OBS.toggleStream().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <LeftRail state={rail} setState={setRail} onEmergency={onEmergency} />
      <TopBar cueIdx={cueIdx} setCueIdx={setCueIdx} showLegend={showLegend} setShowLegend={setShowLegend} />
      <main className="main">
        <PresetGrid
          liveId={liveId}
          setLive={setLive}
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
