import { useEffect, useRef, useState, memo } from 'react';
import loadingImage from '../assets/photo_5357292113839723543_y (1) (1) (1).jpg';

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
  const [progress, setProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const lastProgressRef = useRef({ value: 0, time: Date.now() });

  // Detect if loading is stuck (same progress for 30s)
  useEffect(() => {
    const id = setInterval(() => {
      const { value, time } = lastProgressRef.current;
      if (!isLoaded && progress === value && Date.now() - time > 30000 && progress > 0 && progress < 100) {
        setStuck(true);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [progress, isLoaded]);

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

      // Actual PCK + WASM sizes from Work.html — fallback when server omits Content-Length
      const ESTIMATED_TOTAL = 196000000;

      // Stage weights (must sum to 100):
      //  0-80 : WASM + PCK download     (real progress from onProgress)
      //  80   : engine.startGame resolves
      //  88   : Godot scene init + preload scenes (deferred signal)
      //  94   : server responded, placing buildings (signal)
      //  100  : buildings placed → hide overlay (signal)
      const DOWNLOAD_MAX = 80;

      const handleProgress = (current, total) => {
        const pct = total > 0
          ? Math.round((current / total) * DOWNLOAD_MAX)

          : Math.min(DOWNLOAD_MAX - 2, Math.round((current / ESTIMATED_TOTAL) * DOWNLOAD_MAX));
        setProgress(pct);
      };

      // Godot signals intermediate stages via JavaScriptBridge
      window.godotLoadingProgress = (pct) => setProgress(pct);

      // Godot signals all buildings placed — show island, hide overlay
      window.godotBuildingsLoaded = () => {
        setProgress(100);
        setTimeout(() => setIsLoaded(true), 350);
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
        setProgress(prev => Math.max(prev, DOWNLOAD_MAX));
        resizeCanvas();
        if (onEngineReady) onEngineReady(engine);
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
                Progress: {progress}% | UA: {navigator.userAgent.slice(0, 80)}
              </div>
              <button onClick={() => window.location.reload()} style={{ marginTop: 10, padding: '8px 20px', background: '#fff', color: '#000', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>Reload</button>
            </div>
          )}
          
          <div style={progressWrapperStyle}>
            <div style={barContainerStyle}>
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'linear-gradient(to bottom, #ffe066, #e6b800)',
                  borderRight: '2px solid #fff8dc',
                  boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4)',
                  transition: 'width 0.1s linear',
                }}
              />
            </div>
            <div style={{ 
              color: '#fff', 
              marginTop: '12px', 
              fontFamily: '"Inter", "Segoe UI", sans-serif', 
              fontSize: '20px', 
              fontWeight: 900, 
              textShadow: '0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px  1px 0 #000, 1px  1px 0 #000',
              letterSpacing: '1px'
            }}>
              {progress < 80 ? `LOADING ${progress}%` : progress < 88 ? 'INITIALIZING...' : progress < 94 ? 'CONNECTING...' : progress < 100 ? 'PLACING BUILDINGS...' : 'READY!'}
            </div>
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
