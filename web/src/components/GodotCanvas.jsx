import { useEffect, useRef, useState, memo } from 'react';
import loadingImage from '../assets/f532cb2f-b750-48b6-a3ad-e8f92244ae88.jpg';

const GODOT_FILES = '/godot'; // Path to exported Godot files
const CACHE_BUST = '?v=' + Date.now(); // Force fresh load after deploy

const canvasStyle = {
  width: '100%',
  height: '100%',
  display: 'block',
  outline: 'none',
};

const overlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: '#0a0b1a', // Match App.jsx background
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center', // Center progress block within screen easily
  alignItems: 'center',
  zIndex: 1000,
  transition: 'opacity 0.5s ease',
};

const imgStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover', // Повертаємо повноцінний повноекранний вигляд
  zIndex: -1,
  opacity: 0.9,
};

const progressWrapperStyle = {
  position: 'absolute',
  bottom: '4%', // Ще нижче (було 8%)
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const barContainerStyle = {
  width: '60%',
  maxWidth: '450px',
  height: '28px',
  backgroundColor: '#2e1c10', // Dark wood background
  border: '3px solid #5a3a22', // Thick wood edge
  borderRadius: '8px',
  boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.5)',
  overflow: 'hidden',
  position: 'relative',
};

function GodotCanvas({ onEngineReady }) {
  const canvasRef = useRef(null);
  const loadedRef = useRef(false);
  // Two-stage loading: stage 1 = download engine files (wasm/pck/js), stage 2 = scene init + server data + buildings.
  const [stage, setStage] = useState(1);           // 1 | 2
  const [stageProgress, setStageProgress] = useState(0); // 0-100 within stage
  const [isLoaded, setIsLoaded] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const lastProgressRef = useRef({ value: 0, time: Date.now() });

  // Detect if loading is stuck (same progress for 30s)
  useEffect(() => {
    const id = setInterval(() => {
      const { value, time } = lastProgressRef.current;
      if (!isLoaded && stageProgress === value && Date.now() - time > 30000 && stageProgress > 0 && stageProgress < 100) {
        setStuck(true);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [stageProgress, isLoaded]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Catch unhandled errors for mobile debug
    const errHandler = (e) => setErrorMsg(prev => prev || String(e.message || e.reason || e));
    window.addEventListener('error', errHandler);
    window.addEventListener('unhandledrejection', (e) => errHandler({ message: e.reason }));

    const script = document.createElement('script');
    script.src = `${GODOT_FILES}/Work.js${CACHE_BUST}`;
    script.onload = () => {
      const GODOT = window.Engine || window.Godot;
      if (!GODOT) {
        console.error('Godot engine not found');
        return;
      }

      // Server doesn't send Content-Length for Godot files; real total is ~280MB.
      // We scale by max-observed current so the bar fills smoothly regardless.
      let maxDownload = 280000000;

      // Stage 2: pure linear time-based ramp 0 → 100 over STAGE2_MIN_MS.
      // If Godot signals "buildings loaded" before ramp finishes — we still
      // finish the ramp (otherwise it looks janky). If ramp finishes before
      // buildings loaded — we hold at 99% until the signal.
      const STAGE2_MIN_MS = 1800;
      let stage2StartTime = null;
      let stage2BuildingsDone = false;
      let stage2RafId = null;
      const tickStage2 = () => {
        if (stage2StartTime == null) return;
        const elapsed = Date.now() - stage2StartTime;
        const rampValue = Math.min(100, (elapsed / STAGE2_MIN_MS) * 100);
        // Hold at 99 until buildings confirm, then allow 100.
        const value = (rampValue >= 100 && !stage2BuildingsDone) ? 99 : rampValue;
        setStageProgress(Math.round(value));
        if (value >= 100) {
          setTimeout(() => setIsLoaded(true), 300);
          stage2RafId = null;
          return;
        }
        stage2RafId = requestAnimationFrame(tickStage2);
      };
      const startStage2 = () => {
        if (stage2StartTime != null) return;
        console.log('[load] stage2 ramp starting');
        stage2StartTime = Date.now();
        setStage(2);
        setStageProgress(0);
        stage2RafId = requestAnimationFrame(tickStage2);
      };

      const handleProgress = (current, total) => {
        // If Content-Length arrives, use it directly. Otherwise scale against
        // the highest `current` we've seen (grow maxDownload if needed so %
        // never stalls above 99 while more bytes stream in).
        let pct;
        if (total > 0) {
          pct = Math.round((current / total) * 100);
        } else {
          if (current > maxDownload * 0.99) maxDownload = current / 0.99;
          pct = Math.min(99, Math.round((current / maxDownload) * 100));
        }
        console.log('[load] stage1 download', { current, total, maxDownload, pct });
        setStage(1);
        setStageProgress(pct);
        lastProgressRef.current = { value: pct, time: Date.now() };
      };

      // Godot's stage-2 signals are noisy and fire BEFORE startGame resolves,
      // so we don't use them to drive progress — only log for diagnostics.
      window.godotLoadingProgress = (rawPct) => {
        console.log('[load] stage2 signal (ignored for progress)', { rawPct });
      };

      // Godot signals all buildings placed — mark done; ramp will finish to 100.
      window.godotBuildingsLoaded = () => {
        if (stage2BuildingsDone) return;
        console.log('[load] stage2 complete (godotBuildingsLoaded)');
        stage2BuildingsDone = Date.now();
      };

      const engine = new GODOT({ onProgress: handleProgress });

      // Force canvas to fill parent on mobile
      const resizeCanvas = () => {
        const c = canvasRef.current;
        if (!c) return;
        c.width = window.innerWidth * (window.devicePixelRatio || 1);
        c.height = window.innerHeight * (window.devicePixelRatio || 1);
      };
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      engine.startGame({
        canvas: canvasRef.current,
        executable: `${GODOT_FILES}/Work`,
        args: [],
        canvasResizePolicy: 0,
        onProgress: handleProgress,
      }).then(() => {
        // Download finished → ease stage 1 from current% up to 100 over 500ms,
        // pause 450ms at 100%, then start stage 2.
        console.log('[load] engine.startGame resolved → easing stage 1 → 100');
        resizeCanvas();
        if (onEngineReady) onEngineReady(engine);
        const from = lastProgressRef.current.value;
        const easeStart = Date.now();
        const easeTick = () => {
          const t = Math.min(1, (Date.now() - easeStart) / 500);
          const v = Math.round(from + (100 - from) * t);
          setStageProgress(v);
          if (t < 1) requestAnimationFrame(easeTick);
          else setTimeout(() => startStage2(), 450);
        };
        requestAnimationFrame(easeTick);
      }).catch(err => {
        console.error('Godot start error:', err);
        setErrorMsg(String(err?.message || err));
      });
    };
    document.body.appendChild(script);
  }, []);

  return (
    <>
      {!isLoaded && (
        <div style={overlayStyle}>
          <img src={loadingImage} alt="Loading..." style={imgStyle} />

          {errorMsg && (
            <div style={{ position: 'absolute', top: 20, left: 20, right: 20, zIndex: 10, background: 'rgba(200,0,0,0.9)', color: '#fff', padding: 16, borderRadius: 10, fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all', maxHeight: '40vh', overflow: 'auto' }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Error loading game:</div>
              {errorMsg}
              <div style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>
                Stage {stage}: {stageProgress}% | UA: {navigator.userAgent.slice(0, 80)}
              </div>
              <button onClick={() => window.location.reload()} style={{ marginTop: 10, padding: '8px 20px', background: '#fff', color: '#000', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>Reload</button>
            </div>
          )}

          <div style={progressWrapperStyle}>
            {/* Stage label */}
            <div style={{
              color: '#fff',
              marginBottom: '14px',
              fontFamily: '"Inter", "Segoe UI", sans-serif',
              fontSize: '22px',
              fontWeight: 900,
              textShadow: '0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
              letterSpacing: '1px',
              textAlign: 'center',
            }}>
              {stage === 1 ? 'DOWNLOADING GAME' : 'LOADING WORLD'}
            </div>

            {/* Progress bar */}
            <div style={barContainerStyle}>
              <div
                style={{
                  width: `${stageProgress}%`,
                  height: '100%',
                  background: stage === 1
                    ? 'linear-gradient(to bottom, #ffe066, #e6b800)'
                    : 'linear-gradient(to bottom, #8be3ff, #35a8e0)',
                  borderRight: '2px solid #fff8dc',
                  boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4)',
                  transition: 'width 0.1s linear, background 0.3s ease',
                }}
              />
            </div>

            {/* Percentage */}
            <div style={{
              color: '#fff',
              marginTop: '10px',
              fontFamily: '"Inter", "Segoe UI", sans-serif',
              fontSize: '18px',
              fontWeight: 900,
              textShadow: '0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
              letterSpacing: '1px',
              textAlign: 'center',
            }}>
              {stageProgress}%
            </div>

            {/* Stage indicators — 1 • 2 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, marginTop: 16,
            }}>
              {[1, 2].map(s => (
                <div key={s} style={{
                  width: s === stage ? 28 : 10,
                  height: 10,
                  borderRadius: 5,
                  background: s < stage ? '#8be3ff' : s === stage ? '#ffe066' : 'rgba(255,255,255,0.25)',
                  boxShadow: s === stage ? '0 0 8px rgba(255,224,102,0.8)' : 'none',
                  transition: 'all 0.3s ease',
                }} />
              ))}
            </div>

            {/* Substage hint (stage 2 only) */}
            {stage === 2 && (
              <div style={{
                color: 'rgba(255,255,255,0.75)',
                marginTop: '10px',
                fontFamily: '"Inter", "Segoe UI", sans-serif',
                fontSize: '13px',
                fontWeight: 700,
                textAlign: 'center',
              }}>
                {stageProgress < 30 ? 'Initializing scene…'
                  : stageProgress < 70 ? 'Connecting to server…'
                  : stageProgress < 100 ? 'Placing buildings…'
                  : 'Ready!'}
              </div>
            )}
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        id="godot-canvas"
        tabIndex={0}
        style={canvasStyle}
      />
    </>
  );
}

export default memo(GodotCanvas);
