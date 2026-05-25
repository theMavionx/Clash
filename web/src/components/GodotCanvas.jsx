import { useEffect, useRef, useState, memo } from 'react';
import { addClientBreadcrumb, reportClientEvent } from '../lib/clientLogger';
// Loading splash — served from `web/public/splash-bg.png` + splash-logo.png.
// Layered so the logo can be hidden on narrow / portrait screens while the
// background art still fills the viewport. Public-path reference means art
// swaps need no JS rebuild.
const splashBg = '/splash-bg.png';
const splashLogo = '/splash-logo.png?v=splash-art';

const GODOT_FILES = '/godot'; // Path to exported Godot files
const GODOT_BUILD_TOKEN = String(
  import.meta.env.VITE_BUILD_ID ||
  import.meta.env.VITE_COMMIT_SHA ||
  Date.now()
);
const CACHE_BUST = '?v=' + encodeURIComponent(GODOT_BUILD_TOKEN); // Force fresh load after deploy
const GODOT_DOWNLOAD_FALLBACK_BYTES = 130000000;
const GODOT_CACHE_PREFIXES = ['clash-godot-', 'clash-godot-resource-icons-'];
const GODOT_RUNTIME_RELOAD_KEY = `clash_godot_runtime_reloaded_${GODOT_BUILD_TOKEN}`;
const GODOT_WEBGL_CONTEXT_RELOAD_KEY = `clash_godot_webgl_context_reloaded_at_${GODOT_BUILD_TOKEN}`;
const GODOT_WEBGL_CONTEXT_RELOAD_COOLDOWN_MS = 15000;
const GODOT_WEBGL_CONTEXT_RELOAD_DELAY_MS = 650;
const APP_TITLE = 'Clash of Perps';

function keepAppTitle() {
  if (typeof document !== 'undefined' && document.title !== APP_TITLE) {
    document.title = APP_TITLE;
  }
}

function isGodotRuntimeAsset(rawUrl) {
  try {
    const url = new URL(String(rawUrl), window.location.href);
    return url.origin === window.location.origin && /^\/godot\/Work\.(js|wasm|pck)$/.test(url.pathname);
  } catch {
    return false;
  }
}

function withGodotCacheBust(rawUrl) {
  const url = new URL(String(rawUrl), window.location.href);
  url.searchParams.set('v', GODOT_BUILD_TOKEN);
  return url.href;
}

function installGodotFetchCacheBust() {
  if (typeof window.fetch !== 'function') return () => {};

  const originalFetch = window.fetch;
  const boundFetch = originalFetch.bind(window);
  const patchedFetch = (input, init) => {
    try {
      const rawUrl = typeof input === 'string' || input instanceof URL ? input : input?.url;
      if (rawUrl && isGodotRuntimeAsset(rawUrl)) {
        const bustedUrl = withGodotCacheBust(rawUrl);
        const nextInit = { ...(init || {}), cache: 'reload' };
        if (typeof Request !== 'undefined' && input instanceof Request) {
          return boundFetch(new Request(bustedUrl, input), nextInit);
        }
        return boundFetch(bustedUrl, nextInit);
      }
    } catch {
      // Fall through to the original fetch.
    }
    return boundFetch(input, init);
  };

  window.fetch = patchedFetch;
  return () => {
    if (window.fetch === patchedFetch) window.fetch = originalFetch;
  };
}

function clearGodotRuntimeCaches() {
  const tasks = [];

  if (window.caches?.keys) {
    tasks.push(
      window.caches.keys()
        .then((names) => Promise.all(
          names
            .filter((name) => GODOT_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)))
            .map((name) => window.caches.delete(name))
        ))
    );
  }

  if (navigator.serviceWorker?.getRegistrations) {
    tasks.push(
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(
          registrations
            .filter((registration) => {
              const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
              if (!scriptUrl) return false;
              try {
                const url = new URL(scriptUrl);
                return url.origin === window.location.origin && url.pathname === '/sw.js';
              } catch {
                return false;
              }
            })
            .map((registration) => registration.update().catch(() => {}))
        ))
    );
  }

  return Promise.all(tasks.map((task) => task.catch(() => {})));
}

function loadGodotEngineScript() {
  if (window.Engine || window.Godot) return Promise.resolve();
  if (window.__clashGodotScriptPromise) return window.__clashGodotScriptPromise;

  window.__clashGodotScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-clash-godot-script="true"]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.dataset.clashGodotScript = 'true';
    script.src = `${GODOT_FILES}/Work.js${CACHE_BUST}`;
    script.onload = resolve;
    script.onerror = () => {
      window.__clashGodotScriptPromise = null;
      reject(new Error('Failed to load Godot engine script'));
    };
    document.body.appendChild(script);
  });

  return window.__clashGodotScriptPromise;
}

function getGodotPixelRatio() {
  const raw = window.devicePixelRatio || 1;
  const mem = navigator.deviceMemory || 4;
  const narrow = Math.min(window.innerWidth, window.innerHeight) <= 600;
  const cap = mem <= 4 || narrow ? 1.5 : 2;
  return Math.min(raw, cap);
}

const canvasStyle = {
  width: '100%',
  height: '100%',
  display: 'block',
  outline: 'none',
};

function describeGlobalError(event) {
  const reason = event?.reason;
  const error = event?.error || reason;
  return String(
    event?.message ||
    error?.message ||
    error ||
    event ||
    'Unknown loading error'
  );
}

function isGodotWasmCacheMismatch(errorLike) {
  const error = errorLike?.error || errorLike?.reason || errorLike;
  const text = [
    describeGlobalError(errorLike),
    error?.message,
    error?.stack,
  ].filter(Boolean).join('\n');

  return (
    /WebAssembly\.instantiate/i.test(text)
      && /Import #0/i.test(text)
      && /env/i.test(text)
      && /module is not an object or function/i.test(text)
  ) || /WebAssembly\.Module doesn't parse|Code function's size .* exceeds module's remaining size|wasm streaming compile failed|failed to asynchronously prepare wasm|\/godot\/Work\.(?:wasm|pck).*failed|Work\.(?:wasm|pck).*Failed to fetch/i.test(text);
}

function recoverOnceFromGodotCacheMismatch(errorLike) {
  if (!isGodotWasmCacheMismatch(errorLike)) return false;

  try {
    if (window.sessionStorage?.getItem(GODOT_RUNTIME_RELOAD_KEY)) return false;
    window.sessionStorage?.setItem(GODOT_RUNTIME_RELOAD_KEY, '1');
  } catch {
    // If storage is blocked, still attempt one recovery reload.
  }

  addClientBreadcrumb('godot.cache_mismatch_recover', {
    message: describeGlobalError(errorLike),
  }, 'warning');

  clearGodotRuntimeCaches().finally(() => {
    window.location.reload();
  });
  return true;
}

function reportGodotLoaderIssue(type, errorLike, extra = {}) {
  const error = errorLike?.error || errorLike?.reason || errorLike;
  const message = describeGlobalError(errorLike);
  reportClientEvent(type, {
    message,
    filename: errorLike?.filename || errorLike?.sourceURL || null,
    line: errorLike?.lineno || null,
    column: errorLike?.colno || null,
    user_agent: navigator.userAgent,
    ...extra,
  }, {
    level: 'error',
    source: 'godot.loader',
    message,
    stack: error?.stack || '',
  });
}

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

const bgStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  zIndex: 0,
  opacity: 0.9,
  userSelect: 'none',
  pointerEvents: 'none',
};

const logoStyle = {
  // MUST match App.jsx splashLogo exactly. Both layers show during lazy-load
  // handoff (FarcasterGate splash → GodotCanvas overlay); any style drift
  // makes the logo visibly jump when the second layer mounts.
  position: 'absolute',
  top: '8%',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(95vw, 1100px)',
  height: 'auto',
  objectFit: 'contain',
  zIndex: 0,
  userSelect: 'none',
  pointerEvents: 'none',
  filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.6))',
};

const progressWrapperStyle = {
  position: 'absolute',
  bottom: '4%', // Ще нижче (було 8%)
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  zIndex: 2,
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
  const [webglReloading, setWebglReloading] = useState(false);
  const lastProgressRef = useRef({ value: 0, time: 0 });
  const onEngineReadyRef = useRef(onEngineReady);
  const isLoadedStateRef = useRef(false);
  const stageStateRef = useRef(1);
  const stageProgressStateRef = useRef(0);
  const webglReloadStartedRef = useRef(false);

  useEffect(() => {
    onEngineReadyRef.current = onEngineReady;
  }, [onEngineReady]);

  useEffect(() => {
    isLoadedStateRef.current = isLoaded;
  }, [isLoaded]);

  useEffect(() => {
    stageStateRef.current = stage;
    stageProgressStateRef.current = stageProgress;
  }, [stage, stageProgress]);

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
    lastProgressRef.current = { value: 0, time: Date.now() };

    let disposed = false;
    let engine = null;
    let resizeCanvas = null;
    let stage2RafId = null;
    let easeRafId = null;
    let loadedTimeoutId = null;
    let stage2DelayId = null;
    let titleGuardId = null;
    let lastProgressBucket = -1;
    let restoreGodotFetch = null;
    let contextCanvas = null;
    keepAppTitle();
    titleGuardId = window.setInterval(keepAppTitle, 500);

    const getWebglContextPayload = (event) => ({
      loaded: isLoadedStateRef.current,
      stage: stageStateRef.current,
      progress: stageProgressStateRef.current,
      last_progress: lastProgressRef.current.value,
      status_message: event?.statusMessage || null,
      visibility_state: document.visibilityState || null,
      canvas_width: canvasRef.current?.width || null,
      canvas_height: canvasRef.current?.height || null,
      pixel_ratio: getGodotPixelRatio(),
    });

    const handleWebglContextLost = (event) => {
      event?.preventDefault?.();
      if (disposed) return;

      const payload = getWebglContextPayload(event);
      addClientBreadcrumb('godot.webgl_context_lost', payload, 'error');
      reportClientEvent('godot.webgl_context_lost', payload, {
        level: 'error',
        source: 'godot.webgl',
        message: 'Godot WebGL context lost',
      });

      if (webglReloadStartedRef.current) return;
      webglReloadStartedRef.current = true;
      setWebglReloading(true);

      let shouldReload = true;
      try {
        const now = Date.now();
        const previous = Number(window.sessionStorage?.getItem(GODOT_WEBGL_CONTEXT_RELOAD_KEY) || 0);
        shouldReload = !previous || now - previous > GODOT_WEBGL_CONTEXT_RELOAD_COOLDOWN_MS;
        if (shouldReload) {
          window.sessionStorage?.setItem(GODOT_WEBGL_CONTEXT_RELOAD_KEY, String(now));
        }
      } catch {
        // If storage is blocked, still attempt one recovery reload.
      }

      if (!shouldReload) {
        reportClientEvent('godot.webgl_context_reload_suppressed', payload, {
          level: 'error',
          source: 'godot.webgl',
          message: 'WebGL context was lost again during reload cooldown',
        });
        return;
      }

      window.setTimeout(() => {
        if (!disposed) window.location.reload();
      }, GODOT_WEBGL_CONTEXT_RELOAD_DELAY_MS);
    };

    const handleWebglContextRestored = (event) => {
      const payload = getWebglContextPayload(event);
      addClientBreadcrumb('godot.webgl_context_restored', payload, 'warning');
      if (!webglReloadStartedRef.current) setWebglReloading(false);
    };

    contextCanvas = canvasRef.current;
    contextCanvas?.addEventListener('webglcontextlost', handleWebglContextLost, false);
    contextCanvas?.addEventListener('webglcontextrestored', handleWebglContextRestored, false);

    // Keep loader errors in client logs without showing debug stacks to players.
    const errHandler = (e) => {
      if (disposed) return;
      if (recoverOnceFromGodotCacheMismatch(e)) return;
      reportGodotLoaderIssue('godot.global_error', e, {
        progress: lastProgressRef.current.value,
        stage: stageStateRef.current,
        loaded: isLoadedStateRef.current,
      });
    };
    const rejectionHandler = (e) => errHandler(e);
    window.addEventListener('error', errHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);

    const startGodot = () => {
      if (disposed) return;
      const GODOT = window.Engine || window.Godot;
      if (!GODOT) {
        addClientBreadcrumb('godot.engine_missing', {}, 'error');
        console.error('Godot engine not found');
        return;
      }
      addClientBreadcrumb('godot.start', {
        pixel_ratio: getGodotPixelRatio(),
        width: window.innerWidth,
        height: window.innerHeight,
      });

      // Server may not send Content-Length for Godot files. Keep this near
      // Work.pck + Work.wasm so the bar does not crawl after PCK trimming.
      // We scale by max-observed current so the bar fills smoothly regardless.
      let maxDownload = GODOT_DOWNLOAD_FALLBACK_BYTES;

      // Stage 2: pure linear time-based ramp 0 → 100 over STAGE2_MIN_MS.
      // If Godot signals "buildings loaded" before ramp finishes — we still
      // finish the ramp (otherwise it looks janky). If ramp finishes before
      // buildings loaded — we hold at 99% until the signal.
      const STAGE2_MIN_MS = 1800;
      let stage2StartTime = null;
      let stage2BuildingsDone = false;
      const tickStage2 = () => {
        if (disposed || stage2StartTime == null) return;
        const elapsed = Date.now() - stage2StartTime;
        const rampValue = Math.min(100, (elapsed / STAGE2_MIN_MS) * 100);
        // Hold at 99 until buildings confirm, then allow 100.
        const value = (rampValue >= 100 && !stage2BuildingsDone) ? 99 : rampValue;
        setStageProgress(Math.round(value));
        if (value >= 100) {
          loadedTimeoutId = setTimeout(() => {
            if (!disposed) setIsLoaded(true);
          }, 300);
          stage2RafId = null;
          return;
        }
        stage2RafId = requestAnimationFrame(tickStage2);
      };
      const startStage2 = () => {
        if (disposed || stage2StartTime != null) return;
        addClientBreadcrumb('godot.stage2_start');
        console.log('[load] stage2 ramp starting');
        stage2StartTime = Date.now();
        setStage(2);
        setStageProgress(0);
        stage2RafId = requestAnimationFrame(tickStage2);
      };

      const handleProgress = (current, total) => {
        if (disposed) return;
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
        const bucket = Math.floor(pct / 25);
        if (bucket !== lastProgressBucket) {
          lastProgressBucket = bucket;
          addClientBreadcrumb('godot.stage1_progress', { pct, total: total || null });
        }
        setStage(1);
        setStageProgress(pct);
        lastProgressRef.current = { value: pct, time: Date.now() };
      };

      // Godot's stage-2 signals are noisy and fire BEFORE startGame resolves,
      // so we don't use them to drive progress — only log for diagnostics.
      const godotLoadingProgress = (rawPct) => {
        console.log('[load] stage2 signal (ignored for progress)', { rawPct });
      };
      window.godotLoadingProgress = godotLoadingProgress;

      // Godot signals all buildings placed — mark done; ramp will finish to 100.
      const godotBuildingsLoaded = () => {
        if (disposed) return;
        if (stage2BuildingsDone) return;
        addClientBreadcrumb('godot.stage2_complete');
        console.log('[load] stage2 complete (godotBuildingsLoaded)');
        stage2BuildingsDone = Date.now();
      };
      window.godotBuildingsLoaded = godotBuildingsLoaded;

      engine = new GODOT({ onProgress: handleProgress });

      // Force canvas to fill parent on mobile
      resizeCanvas = () => {
        if (disposed) return;
        const c = canvasRef.current;
        if (!c) return;
        const ratio = getGodotPixelRatio();
        c.width = Math.round(window.innerWidth * ratio);
        c.height = Math.round(window.innerHeight * ratio);
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
        if (disposed) {
          engine?.requestQuit?.();
          return;
        }
        // Download finished → ease stage 1 from current% up to 100 over 500ms,
        // pause 450ms at 100%, then start stage 2.
        console.log('[load] engine.startGame resolved → easing stage 1 → 100');
        addClientBreadcrumb('godot.engine_ready');
        if (restoreGodotFetch) {
          restoreGodotFetch();
          restoreGodotFetch = null;
        }
        resizeCanvas();
        if (onEngineReadyRef.current) onEngineReadyRef.current(engine);
        const from = lastProgressRef.current.value;
        const easeStart = Date.now();
        const easeTick = () => {
          if (disposed) return;
          const t = Math.min(1, (Date.now() - easeStart) / 500);
          const v = Math.round(from + (100 - from) * t);
          setStageProgress(v);
          if (t < 1) easeRafId = requestAnimationFrame(easeTick);
          else stage2DelayId = setTimeout(() => startStage2(), 450);
        };
        easeRafId = requestAnimationFrame(easeTick);
      }).catch(err => {
        if (disposed) return;
        if (recoverOnceFromGodotCacheMismatch(err)) return;
        if (restoreGodotFetch) {
          restoreGodotFetch();
          restoreGodotFetch = null;
        }
        addClientBreadcrumb('godot.start_error', {
          message: err?.message || String(err || ''),
        }, 'error');
        reportGodotLoaderIssue('godot.start_error', err, {
          progress: lastProgressRef.current.value,
          stage: stageStateRef.current,
          loaded: isLoadedStateRef.current,
        });
        console.error('Godot start error:', err);
      });
    };
    clearGodotRuntimeCaches()
      .then(() => {
        restoreGodotFetch = installGodotFetchCacheBust();
        return loadGodotEngineScript();
      })
      .then(startGodot)
      .catch(err => {
        if (!disposed) {
          if (recoverOnceFromGodotCacheMismatch(err)) return;
          if (restoreGodotFetch) {
            restoreGodotFetch();
            restoreGodotFetch = null;
          }
          addClientBreadcrumb('godot.script_load_error', {
            message: err?.message || String(err || ''),
          }, 'error');
          reportGodotLoaderIssue('godot.script_load_error', err, {
            progress: lastProgressRef.current.value,
            stage: stageStateRef.current,
            loaded: isLoadedStateRef.current,
          });
        }
      });
    return () => {
      disposed = true;
      loadedRef.current = false;
      window.removeEventListener('error', errHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
      contextCanvas?.removeEventListener('webglcontextlost', handleWebglContextLost, false);
      contextCanvas?.removeEventListener('webglcontextrestored', handleWebglContextRestored, false);
      if (resizeCanvas) window.removeEventListener('resize', resizeCanvas);
      if (stage2RafId) cancelAnimationFrame(stage2RafId);
      if (easeRafId) cancelAnimationFrame(easeRafId);
      if (loadedTimeoutId) clearTimeout(loadedTimeoutId);
      if (stage2DelayId) clearTimeout(stage2DelayId);
      if (titleGuardId) clearInterval(titleGuardId);
      if (window.godotLoadingProgress) window.godotLoadingProgress = null;
      if (window.godotBuildingsLoaded) window.godotBuildingsLoaded = null;
      if (restoreGodotFetch) restoreGodotFetch();
      try { engine?.requestQuit?.(); } catch { /* best-effort cleanup */ }
    };
  }, []);

  const showLoadingOverlay = !isLoaded || webglReloading;
  const displayedProgress = webglReloading ? 100 : stageProgress;
  const progressLabel = webglReloading
    ? 'RELOADING GAME'
    : stage === 1 ? 'DOWNLOADING GAME' : 'LOADING WORLD';

  return (
    <>
      {showLoadingOverlay && (
        <div style={overlayStyle} data-clash-godot-loading="true">
          <img src={splashBg} alt="" style={bgStyle} />
          <img src={splashLogo} alt="Clash of Perps" style={logoStyle} className="godot-splash-logo" />
          <style>{`
            @media (max-width: 600px), (orientation: portrait) and (max-width: 800px) {
              .godot-splash-logo { display: none !important; }
            }
          `}</style>

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
              {progressLabel}
            </div>

            {/* Progress bar */}
            <div style={barContainerStyle}>
              <div
                style={{
                  width: `${displayedProgress}%`,
                  height: '100%',
                  background: webglReloading
                    ? 'linear-gradient(to bottom, #8be3ff, #35a8e0)'
                    : stage === 1
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
              {webglReloading ? 'Restoring graphics...' : `${stageProgress}%`}
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
            {webglReloading ? (
              <div style={{
                color: 'rgba(255,255,255,0.75)',
                marginTop: '10px',
                fontFamily: '"Inter", "Segoe UI", sans-serif',
                fontSize: '13px',
                fontWeight: 700,
                textAlign: 'center',
              }}>
                Reloading after WebGL context loss...
              </div>
            ) : stage === 2 && (
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
        style={{ ...canvasStyle, visibility: isLoaded && !webglReloading ? 'visible' : 'hidden' }}
      />
    </>
  );
}

export default memo(GodotCanvas);
