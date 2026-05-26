import { useEffect, useRef, useState, memo } from 'react';
import { addClientBreadcrumb, reportClientEvent } from '../lib/clientLogger';
import { readSoundEnabled } from '../lib/soundSettings';
// Loading splash — served from `web/public/splash-bg.png` + splash-logo.png.
// Layered so the logo can be hidden on narrow / portrait screens while the
// background art still fills the viewport. Public-path reference means art
// swaps need no JS rebuild.
const splashBg = '/splash-bg.png';
const splashLogo = '/splash-logo.png?v=splash-art';
const loadingMusicSrc = '/audio/loading_the_game.mp3';
const uiClickSrc = '/audio/UaClick.mp3';
const LOADING_MUSIC_VOLUME = 0.42;
const LOADING_MUSIC_FADE_MS = 1600;

const GODOT_FILES = '/godot'; // Path to exported Godot files
const GODOT_BUILD_TOKEN = String(
  import.meta.env.VITE_BUILD_ID ||
  import.meta.env.VITE_COMMIT_SHA ||
  Date.now()
);
const CACHE_BUST = '?v=' + encodeURIComponent(GODOT_BUILD_TOKEN); // Force fresh load after deploy
const GODOT_RUNTIME_MANIFEST = `${GODOT_FILES}/godot-runtime-manifest.json${CACHE_BUST}`;
const GODOT_DOWNLOAD_FALLBACK_BYTES = 130000000;
const GODOT_CACHE_PREFIXES = [
  'clash-runtime-',
  'clash-godot-',
  'clash-godot-resource-icons-',
  'Clash of Perps-sw-cache-',
];
const GODOT_RUNTIME_RELOAD_KEY = `clash_godot_runtime_reloaded_${GODOT_BUILD_TOKEN}`;
const GODOT_WEBGL_CONTEXT_RELOAD_KEY = `clash_godot_webgl_context_reloaded_at_${GODOT_BUILD_TOKEN}`;
const GODOT_WEBGL_CONTEXT_RELOAD_COOLDOWN_MS = 15000;
const GODOT_WEBGL_CONTEXT_RELOAD_DELAY_MS = 650;
const GODOT_DOWNLOAD_PROGRESS_WEIGHT = 72;
const GODOT_STAGE2_HOLD_PROGRESS = 96;
const GODOT_STAGE2_MIN_MS = 1100;
const GODOT_LOADED_HIDE_DELAY_MS = 120;
const GODOT_ENGINE_READY_EASE_MS = 250;
const APP_TITLE = 'Clash of Perps';
const GODOT_PHASE_PROGRESS = {
  scene_init: 74,
  home_warmup_start: 76,
  home_warmup_assets: 82,
  home_warmup_done: 88,
  home_scene_apply: 92,
  home_ready: 97,
  ready: 100,
};
let godotRuntimeManifestPromise = null;

function createWebLoadingAudio() {
  if (typeof Audio === 'undefined') {
    return {
      startLoading: () => {},
      stopLoading: () => {},
      playClick: () => {},
      dispose: () => {},
    };
  }

  const loading = new Audio(loadingMusicSrc);
  loading.loop = true;
  loading.preload = 'auto';
  loading.volume = LOADING_MUSIC_VOLUME;

  const clickPool = Array.from({ length: 4 }, () => {
    const audio = new Audio(uiClickSrc);
    audio.preload = 'auto';
    audio.volume = 0.65;
    return audio;
  });
  let clickIdx = 0;
  let loadingWanted = false;
  let disposed = false;
  let unlocked = false;
  let loadingFadeRaf = null;

  const canPlaySound = () => !disposed && readSoundEnabled();

  const tryPlayLoading = () => {
    if (!loadingWanted || !canPlaySound()) return;
    if (loadingFadeRaf) {
      cancelAnimationFrame(loadingFadeRaf);
      loadingFadeRaf = null;
    }
    loading.volume = LOADING_MUSIC_VOLUME;
    const promise = loading.play();
    if (promise?.catch) {
      promise.catch(() => {
        // Browser autoplay lock. The next pointer/key gesture retries.
      });
    }
  };

  const unlock = () => {
    if (disposed || unlocked) return;
    unlocked = true;
    tryPlayLoading();
  };

  const onGesture = () => unlock();
  window.addEventListener('pointerdown', onGesture, { capture: true });
  window.addEventListener('keydown', onGesture, { capture: true });

  return {
    startLoading() {
      loadingWanted = true;
      tryPlayLoading();
    },
    stopLoading(immediate = false) {
      loadingWanted = false;
      if (loadingFadeRaf) {
        cancelAnimationFrame(loadingFadeRaf);
        loadingFadeRaf = null;
      }
      if (immediate || loading.paused || loading.volume <= 0.001) {
        loading.pause();
        loading.currentTime = 0;
        loading.volume = LOADING_MUSIC_VOLUME;
        return;
      }
      const fromVolume = loading.volume;
      const startedAt = performance.now();
      const fade = (now) => {
        if (disposed) return;
        const t = Math.min(1, (now - startedAt) / LOADING_MUSIC_FADE_MS);
        loading.volume = fromVolume * (1 - t);
        if (t < 1) {
          loadingFadeRaf = requestAnimationFrame(fade);
          return;
        }
        loadingFadeRaf = null;
        loading.pause();
        loading.currentTime = 0;
        loading.volume = LOADING_MUSIC_VOLUME;
      };
      loadingFadeRaf = requestAnimationFrame(fade);
    },
    silenceLoadingNow() {
      loadingWanted = false;
      if (loadingFadeRaf) {
        cancelAnimationFrame(loadingFadeRaf);
        loadingFadeRaf = null;
      }
      loading.pause();
      loading.currentTime = 0;
      loading.volume = LOADING_MUSIC_VOLUME;
    },
    playClick() {
      if (!canPlaySound()) return;
      const audio = clickPool[clickIdx % clickPool.length];
      clickIdx += 1;
      try {
        audio.currentTime = 0;
        const promise = audio.play();
        if (promise?.catch) promise.catch(() => {});
      } catch {
        // Ignore blocked or interrupted click playback.
      }
    },
    dispose() {
      disposed = true;
      if (loadingFadeRaf) cancelAnimationFrame(loadingFadeRaf);
      window.removeEventListener('pointerdown', onGesture, { capture: true });
      window.removeEventListener('keydown', onGesture, { capture: true });
      loading.pause();
      loading.src = '';
      for (const audio of clickPool) {
        audio.pause();
        audio.src = '';
      }
    },
  };
}

function shouldPlayWebClick(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-no-web-click-sound="true"]')) return false;
  if (target.closest('button, a, input, select, textarea, [role="button"], [data-click-sound="true"]')) return true;
  return false;
}

function isCrawlerUserAgent(ua = navigator.userAgent || '') {
  return /applebot|googlebot|bingbot|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|slackbot|discordbot|telegrambot|whatsapp|crawler|spider|bot\b/i.test(ua);
}

function clampProgress(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function mapGodotLoadingProgress(rawPct, phase = 'godot') {
  const pct = Number(rawPct);
  const key = String(phase || '').trim();
  if (key === 'home_warmup_frames') {
    return clampProgress(Math.round(pct), 82, 88);
  }
  if (Object.prototype.hasOwnProperty.call(GODOT_PHASE_PROGRESS, key)) {
    return GODOT_PHASE_PROGRESS[key];
  }
  if (!Number.isFinite(pct)) return null;

  // Backward compatibility for already-exported Godot builds that still send
  // raw progress numbers below the download budget.
  if (pct >= 100) return 100;
  if (pct >= 96) return 97;
  if (pct >= 82) return 92;
  if (pct >= 74) return 84;
  if (pct >= 68) return 78;
  if (pct >= 62) return 74;
  return clampProgress(Math.round(pct), GODOT_DOWNLOAD_PROGRESS_WEIGHT, 100);
}

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

function godotAssetName(rawUrl) {
  try {
    return new URL(String(rawUrl), window.location.href).pathname.split('/').pop();
  } catch {
    return '';
  }
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function verifiedGodotHeaders(headersLike) {
  const headers = new Headers(headersLike || {});
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('content-range');
  headers.set('x-clash-godot-verified', '1');
  return headers;
}

function loadGodotRuntimeManifest() {
  if (!godotRuntimeManifestPromise) {
    godotRuntimeManifestPromise = fetch(GODOT_RUNTIME_MANIFEST, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return godotRuntimeManifestPromise;
}

async function validateGodotAssetResponse(rawUrl, response) {
  if (!response?.ok) return response;
  const manifest = await loadGodotRuntimeManifest();
  const expected = manifest?.files?.[godotAssetName(rawUrl)];
  if (!expected?.size && !expected?.sha256) return response;

  const buffer = await response.arrayBuffer();
  if (expected.size && buffer.byteLength !== Number(expected.size)) {
    throw new Error(`Godot asset size mismatch for ${godotAssetName(rawUrl)}: ${buffer.byteLength} != ${expected.size}`);
  }
  if (expected.sha256 && window.crypto?.subtle) {
    const actual = bytesToHex(await window.crypto.subtle.digest('SHA-256', buffer));
    if (actual !== String(expected.sha256).toLowerCase()) {
      throw new Error(`Godot asset hash mismatch for ${godotAssetName(rawUrl)}`);
    }
  }

  return new Response(buffer, {
    status: response.status,
    statusText: response.statusText,
    headers: verifiedGodotHeaders(response.headers),
  });
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
  const patchedFetch = async (input, init) => {
    let rawUrl = null;
    try {
      rawUrl = typeof input === 'string' || input instanceof URL ? input : input?.url;
    } catch {
      // Fall through to the original fetch.
    }

    if (rawUrl && isGodotRuntimeAsset(rawUrl)) {
      const bustedUrl = withGodotCacheBust(rawUrl);
      const nextInit = { ...(init || {}), cache: 'reload' };
      if (typeof Request !== 'undefined' && input instanceof Request) {
        const response = await boundFetch(new Request(bustedUrl, input), nextInit);
        return validateGodotAssetResponse(bustedUrl, response);
      }
      const response = await boundFetch(bustedUrl, nextInit);
      return validateGodotAssetResponse(bustedUrl, response);
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

  try {
    navigator.serviceWorker?.controller?.postMessage?.({ type: 'CLASH_CLEAR_GODOT_CACHES' });
  } catch {
    // Best-effort only.
  }

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
                return url.origin === window.location.origin
                  && (url.pathname === '/sw.js' || url.pathname === '/godot/Work.service.worker.js');
              } catch {
                return false;
              }
            })
            .map((registration) => {
              const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || '';
              if (scriptUrl.includes('/godot/Work.service.worker.js')) {
                return registration.unregister().catch(() => {});
              }
              return registration.update().catch(() => {});
            })
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
      reject(new Error('Godot Work.js failed to load'));
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
  ) || /WebAssembly\.Module doesn't parse|Code function's size .* exceeds module's remaining size|wasm streaming compile failed|failed to asynchronously prepare wasm|Godot asset (?:size|hash) mismatch|\/godot\/Work\.(?:js|wasm|pck).*failed|Work\.(?:js|wasm|pck).*(?:Failed to fetch|failed to load)/i.test(text);
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
  // Single visual loader. Internally we still keep the phase for diagnostics,
  // but the player sees one yellow progress bar from download through home ready.
  const [stage, setStage] = useState(1);           // 1 | 2
  const [stageProgress, setStageProgress] = useState(0); // 0-100 total
  const [isLoaded, setIsLoaded] = useState(false);
  const [, setStuck] = useState(false);
  const [webglReloading, setWebglReloading] = useState(false);
  const [godotSkipped, setGodotSkipped] = useState(false);
  const lastProgressRef = useRef({ value: 0, time: 0 });
  const onEngineReadyRef = useRef(onEngineReady);
  const isLoadedStateRef = useRef(false);
  const stageStateRef = useRef(1);
  const stageProgressStateRef = useRef(0);
  const webglReloadStartedRef = useRef(false);
  const webAudioRef = useRef(null);

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
    const webAudio = createWebLoadingAudio();
    webAudioRef.current = webAudio;
    webAudio.startLoading();
    lastProgressRef.current = { value: 0, time: Date.now() };

    if (isCrawlerUserAgent()) {
      webAudio.stopLoading(true);
      webAudio.dispose();
      if (webAudioRef.current === webAudio) webAudioRef.current = null;
      setGodotSkipped(true);
      setIsLoaded(true);
      setStageProgress(100);
      lastProgressRef.current = { value: 100, time: Date.now() };
      addClientBreadcrumb('godot.skip_crawler', { user_agent: navigator.userAgent }, 'info');
      return;
    }

    let disposed = false;
    let engine = null;
    let resizeCanvas = null;
    let stage2RafId = null;
    let easeRafId = null;
    let progressRafId = null;
    let loadedTimeoutId = null;
    let stage2DelayId = null;
    let titleGuardId = null;
    let lastProgressBucket = -1;
    let restoreGodotFetch = null;
    let contextCanvas = null;
    keepAppTitle();
    titleGuardId = window.setInterval(keepAppTitle, 500);

    const webClickHandler = (event) => {
      if (shouldPlayWebClick(event.target)) webAudio.playClick();
    };
    window.addEventListener('pointerdown', webClickHandler, { capture: true });

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

      const setProgressValue = (value) => {
        if (disposed) return;
        const next = Math.max(
          lastProgressRef.current.value || 0,
          clampProgress(Math.round(value))
        );
        setStageProgress((prev) => Math.max(prev, next));
        lastProgressRef.current = { value: next, time: Date.now() };
      };

      const finishLoadingOverlay = () => {
        webAudio.stopLoading();
        if (loadedTimeoutId) clearTimeout(loadedTimeoutId);
        loadedTimeoutId = setTimeout(() => {
          if (!disposed) setIsLoaded(true);
        }, GODOT_LOADED_HIDE_DELAY_MS);
      };

      const animateStageProgress = (target, durationMs = 240, onDone = null) => {
        if (disposed) return;
        const safeTarget = Math.max(
          lastProgressRef.current.value || 0,
          clampProgress(Math.round(target))
        );
        if (progressRafId) cancelAnimationFrame(progressRafId);
        const from = Math.max(
          stageProgressStateRef.current || 0,
          lastProgressRef.current.value || 0
        );
        if (safeTarget <= from || durationMs <= 0) {
          setProgressValue(safeTarget);
          if (onDone) onDone();
          return;
        }
        const startedAt = Date.now();
        const tick = () => {
          if (disposed) return;
          const t = Math.min(1, (Date.now() - startedAt) / durationMs);
          const eased = 1 - Math.pow(1 - t, 3);
          setProgressValue(from + (safeTarget - from) * eased);
          if (t < 1) {
            progressRafId = requestAnimationFrame(tick);
            return;
          }
          progressRafId = null;
          if (onDone) onDone();
        };
        progressRafId = requestAnimationFrame(tick);
      };

      // Stage 2: pure linear time-based ramp 0 → 100 over STAGE2_MIN_MS.
      // If Godot signals "buildings loaded" before ramp finishes — we still
      // finish the ramp (otherwise it looks janky). If ramp finishes before
      // buildings loaded — we hold at 99% until the signal.
      let stage2StartTime = null;
      let stage2BuildingsDone = false;
      let engineReadyDone = false;
      const tickStage2 = () => {
        if (disposed || stage2StartTime == null) return;
        const elapsed = Date.now() - stage2StartTime;
        const target = stage2BuildingsDone ? 100 : GODOT_STAGE2_HOLD_PROGRESS;
        const t = Math.min(1, elapsed / GODOT_STAGE2_MIN_MS);
        const value = GODOT_DOWNLOAD_PROGRESS_WEIGHT + ((target - GODOT_DOWNLOAD_PROGRESS_WEIGHT) * t);
        setProgressValue(value);
        if (stage2BuildingsDone && value >= 100) {
          finishLoadingOverlay();
          stage2RafId = null;
          return;
        }
        if (!stage2BuildingsDone && value >= GODOT_STAGE2_HOLD_PROGRESS) {
          stage2RafId = null;
          return;
        }
        stage2RafId = requestAnimationFrame(tickStage2);
      };
      const startStage2 = () => {
        if (disposed || stage2StartTime != null) return;
        addClientBreadcrumb('godot.stage2_start');
        stage2StartTime = Date.now();
        setStage(2);
        setProgressValue(GODOT_DOWNLOAD_PROGRESS_WEIGHT);
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
        const weightedPct = Math.min(GODOT_DOWNLOAD_PROGRESS_WEIGHT, Math.round(pct * (GODOT_DOWNLOAD_PROGRESS_WEIGHT / 100)));
        const bucket = Math.floor(pct / 25);
        if (bucket !== lastProgressBucket) {
          lastProgressBucket = bucket;
          addClientBreadcrumb('godot.stage1_progress', { pct, total: total || null });
        }
        const nextProgress = Math.max(lastProgressRef.current.value || 0, weightedPct);
        if (nextProgress < 100) setStage(1);
        setProgressValue(nextProgress);
      };

      // Godot's stage-2 signals are noisy and fire BEFORE startGame resolves,
      // so we don't use them to drive progress — only log for diagnostics.
      const godotLoadingProgress = (rawPct, phase = 'godot') => {
        const pct = mapGodotLoadingProgress(rawPct, phase);
        if (!Number.isFinite(pct)) return;
        setStage(2);
        animateStageProgress(pct, pct >= 100 ? 520 : 220, pct >= 100 && engineReadyDone ? finishLoadingOverlay : null);
        addClientBreadcrumb('godot.loading_phase', { pct, raw_pct: rawPct, phase });
      };
      window.godotLoadingProgress = godotLoadingProgress;

      // Godot signals all buildings placed — mark done; ramp will finish to 100.
      const godotBuildingsLoaded = () => {
        if (disposed) return;
        if (stage2BuildingsDone) return;
        addClientBreadcrumb('godot.stage2_complete');
        stage2BuildingsDone = true;
        setStage(2);
        if (!engineReadyDone) return;
        animateStageProgress(100, 520, finishLoadingOverlay);
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
        // Download finished: quickly ease to the download budget, then let
        // Godot scene/server/home-ready signals finish the same yellow bar.
        addClientBreadcrumb('godot.engine_ready');
        engineReadyDone = true;
        if (restoreGodotFetch) {
          restoreGodotFetch();
          restoreGodotFetch = null;
        }
        resizeCanvas();
        if (onEngineReadyRef.current) onEngineReadyRef.current(engine);
        const from = lastProgressRef.current.value;
        const downloadTarget = Math.max(from, GODOT_DOWNLOAD_PROGRESS_WEIGHT);
        const easeStart = Date.now();
        const easeTick = () => {
          if (disposed) return;
          const t = Math.min(1, (Date.now() - easeStart) / GODOT_ENGINE_READY_EASE_MS);
          const v = Math.round(from + (downloadTarget - from) * t);
          setProgressValue(v);
          if (t < 1) easeRafId = requestAnimationFrame(easeTick);
          else {
            setStage(2);
            setProgressValue(GODOT_DOWNLOAD_PROGRESS_WEIGHT);
            if (stage2BuildingsDone) {
              animateStageProgress(100, 520, finishLoadingOverlay);
            } else {
              stage2DelayId = setTimeout(() => startStage2(), 120);
            }
          }
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
      window.removeEventListener('pointerdown', webClickHandler, { capture: true });
      contextCanvas?.removeEventListener('webglcontextlost', handleWebglContextLost, false);
      contextCanvas?.removeEventListener('webglcontextrestored', handleWebglContextRestored, false);
      if (resizeCanvas) window.removeEventListener('resize', resizeCanvas);
      if (stage2RafId) cancelAnimationFrame(stage2RafId);
      if (easeRafId) cancelAnimationFrame(easeRafId);
      if (progressRafId) cancelAnimationFrame(progressRafId);
      if (loadedTimeoutId) clearTimeout(loadedTimeoutId);
      if (stage2DelayId) clearTimeout(stage2DelayId);
      if (titleGuardId) clearInterval(titleGuardId);
      if (window.godotLoadingProgress) window.godotLoadingProgress = null;
      if (window.godotBuildingsLoaded) window.godotBuildingsLoaded = null;
      if (restoreGodotFetch) restoreGodotFetch();
      webAudio.dispose();
      if (webAudioRef.current === webAudio) webAudioRef.current = null;
      try { engine?.requestQuit?.(); } catch { /* best-effort cleanup */ }
    };
  }, []);

  const showLoadingOverlay = !isLoaded || webglReloading;
  const displayedProgress = webglReloading ? 100 : stageProgress;
  const progressLabel = webglReloading
    ? 'RELOADING GAME'
    : 'LOADING GAME';

  if (godotSkipped) {
    return (
      <div style={overlayStyle} aria-label="Clash of Perps">
        <img src={splashBg} alt="" style={bgStyle} />
        <img src={splashLogo} alt="Clash of Perps" style={logoStyle} />
      </div>
    );
  }

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
                  background: 'linear-gradient(to bottom, #ffe066, #e6b800)',
                  borderRight: '2px solid #fff8dc',
                  boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4)',
                  transition: 'width 0.1s linear',
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

            {webglReloading && (
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
