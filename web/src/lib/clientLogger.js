const ENDPOINT = '/api/client-log';
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'];
const SERVER_LEVELS = new Set(['warn', 'error']);
const BATCH_SIZE = 5;
const FLUSH_DELAY_MS = 1200;
const MAX_QUEUE = 100;
const MAX_BREADCRUMBS = 30;
const CLIENT_MAX_PER_MINUTE = 120;
const FETCH_SNIPPET_MAX = 900;
const REDACT_KEY_RE = /(token|secret|private|password|authorization|signature|signedmessage|signed_message|x-token|cookie)/i;
const NOISY_LOG_RE = /^\[load\] stage(1 download|2 signal)/;
const NOISY_SERVER_RE = /^(WalletConnect Core is already initialized|Backpack couldn't override `window\.ethereum`)/;
const CHUNK_ERROR_RE = /(Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|ChunkLoadError|dynamically imported module)/i;

let installed = false;
let flushing = false;
let timer = null;
let fetchSeq = 0;
const queue = [];
const recentAt = [];
const breadcrumbs = [];
const original = {};
const runtimeContext = {
  session_id: null,
  build_id: null,
  sw_version: null,
};
let appContext = {};

function nowMinuteOk() {
  const now = Date.now();
  while (recentAt.length && recentAt[0] < now - 60_000) recentAt.shift();
  if (recentAt.length >= CLIENT_MAX_PER_MINUTE) return false;
  recentAt.push(now);
  return true;
}

function truncate(s, max) {
  return String(s == null ? '' : s).slice(0, max);
}

function makeId(prefix) {
  try {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function getSessionId() {
  if (runtimeContext.session_id) return runtimeContext.session_id;
  try {
    const key = 'clash_client_session_id';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = makeId('sess');
      sessionStorage.setItem(key, id);
    }
    runtimeContext.session_id = id;
    return id;
  } catch {
    runtimeContext.session_id = runtimeContext.session_id || makeId('sess');
    return runtimeContext.session_id;
  }
}

function getRoute() {
  try {
    return `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
  } catch {
    return '/';
  }
}

function getBuildId() {
  if (runtimeContext.build_id) return runtimeContext.build_id;
  const env = import.meta.env || {};
  const envBuild = env.VITE_BUILD_ID || env.VITE_COMMIT_SHA || '';
  if (envBuild) {
    runtimeContext.build_id = envBuild;
    return envBuild;
  }
  try {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const indexScript = scripts.find(s => /\/assets\/index-[^/]+\.js/.test(s.src))
      || scripts.find(s => /\/src\/main\.jsx/.test(s.src));
    runtimeContext.build_id = indexScript
      ? (indexScript.src.split('/').pop() || '').replace(/\.js(\?.*)?$/, '')
      : (env.DEV ? 'dev' : 'unknown');
  } catch {
    runtimeContext.build_id = env.DEV ? 'dev' : 'unknown';
  }
  return runtimeContext.build_id;
}

function maskAddress(addr) {
  if (!addr || typeof addr !== 'string') return null;
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function redactText(value) {
  return String(value)
    .replace(/0x[a-fA-F0-9]{32,64}/g, (m) => maskAddress(m))
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,48}\b/g, (m) => maskAddress(m));
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'string') return truncate(redactText(value), 1200);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message, 1200),
      stack: truncate(value.stack || '', 3000),
    };
  }
  if (depth >= 3) return '[Object]';
  if (typeof value !== 'object') return truncate(redactText(value), 1200);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((v) => sanitize(v, depth + 1, seen));
  }
  const out = {};
  for (const [key, child] of Object.entries(value).slice(0, 28)) {
    out[key] = REDACT_KEY_RE.test(key) ? '[redacted]' : sanitize(child, depth + 1, seen);
  }
  return out;
}

function sanitizeDeep(value) {
  return sanitize(value, -2);
}

function argToText(arg) {
  if (typeof arg === 'string') return redactText(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try { return JSON.stringify(sanitize(arg)); } catch { return String(arg); }
}

function currentContext(extra = {}) {
  return {
    session_id: getSessionId(),
    client_ts: new Date().toISOString(),
    build_id: getBuildId(),
    sw_version: runtimeContext.sw_version || null,
    route: getRoute(),
    selected_dex: appContext.selected_dex || appContext.dex || readStorage('clash_dex') || null,
    futures_mode: appContext.futures_mode || null,
    wallet_adapter: appContext.wallet_adapter || null,
    wallet_browser: appContext.wallet_browser || detectWalletBrowser(),
    privy_logged_in: !!appContext.privy_logged_in,
    has_privy_solana_wallet: !!appContext.has_privy_solana_wallet,
    wallet_address: maskAddress(appContext.wallet_address || ''),
    player_id: appContext.player_id || null,
    ...extra,
  };
}

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function detectWalletBrowser() {
  const ua = navigator.userAgent || '';
  if (/Phantom\/ios/i.test(ua)) return 'phantom_ios';
  if (/Phantom\/android/i.test(ua)) return 'phantom_android';
  if (/OKX-Wallet/i.test(ua)) return 'okx_wallet';
  if (/BNC\//i.test(ua)) return 'binance_wallet';
  if (/MetaMaskMobile/i.test(ua)) return 'metamask_mobile';
  if (/Backpack/i.test(ua)) return 'backpack';
  return null;
}

function addBreadcrumbInternal(type, data = {}, level = 'info') {
  if (!type) return;
  const crumb = {
    ts: new Date().toISOString(),
    t: Math.round(performance.now()),
    level,
    type: truncate(type, 80),
    route: getRoute(),
    data: sanitize(data),
  };
  breadcrumbs.push(crumb);
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  }
}

export function addClientBreadcrumb(type, data = {}, level = 'info') {
  try { addBreadcrumbInternal(type, data, level); } catch { /* noop */ }
}

export function setClientLogContext(next = {}) {
  try {
    appContext = { ...appContext, ...sanitize(next) };
  } catch { /* noop */ }
}

export function reportClientEvent(type, data = {}, opts = {}) {
  try {
    const level = opts.level || 'info';
    const source = opts.source || 'client.event';
    const message = opts.message || type || 'client.event';
    const eventData = sanitizeDeep(data);
    addBreadcrumbInternal(type, data, level);
    enqueue(makeEvent(level, [message], source, opts.stack || '', {
      rawPayload: {
        event: {
          type,
          data: eventData,
        },
      },
      context: opts.context || {},
    }));
  } catch { /* noop */ }
}

function payloadString(payload) {
  try { return truncate(JSON.stringify(payload), 7600); } catch { return null; }
}

function scheduleFlush() {
  if (timer || flushing) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

function shouldStoreEvent(event) {
  if (!event?.message || NOISY_LOG_RE.test(event.message)) return false;
  if (NOISY_SERVER_RE.test(event.message)) return false;
  return true;
}

function enqueue(event) {
  if (!shouldStoreEvent(event)) return;
  if (!nowMinuteOk()) return;
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (queue.length >= BATCH_SIZE) flush();
  else scheduleFlush();
}

function makeEvent(level, args, source, stack, extra = {}) {
  const safeArgs = args.map((arg) => sanitize(arg));
  const payload = {
    args: safeArgs,
    context: currentContext(extra.context || {}),
    breadcrumbs: breadcrumbs.slice(-MAX_BREADCRUMBS),
    ...(extra.rawPayload || sanitize(extra.payload || {})),
  };
  return {
    level,
    source,
    message: truncate(args.map(argToText).join(' '), 1800),
    stack: truncate(stack || '', 3500),
    payload: payloadString(payload),
    ua: navigator.userAgent,
    url: location.href,
  };
}

function tokenHeader() {
  try {
    return window._playerToken ? { 'x-token': window._playerToken } : {};
  } catch {
    return {};
  }
}

function flush() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const events = queue.splice(0, BATCH_SIZE);
  const body = JSON.stringify({ events });
  const fetchImpl = original.fetch || window.fetch.bind(window);
  fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...tokenHeader() },
    body,
    keepalive: body.length < 60_000,
  }).catch(() => {}).finally(() => {
    flushing = false;
    if (queue.length) scheduleFlush();
  });
}

function patchConsole(level) {
  original[level] = console[level]?.bind(console) || console.log.bind(console);
  console[level] = (...args) => {
    try {
      const message = truncate(args.map(argToText).join(' '), 500);
      if (!NOISY_LOG_RE.test(message)) {
        addBreadcrumbInternal(`console.${level}`, { message }, level);
      }
      if (SERVER_LEVELS.has(level)) {
        enqueue(makeEvent(level, args, `console.${level}`));
      }
    } catch {}
    original[level](...args);
  };
}

function describeFetch(input, init) {
  const req = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const rawUrl = req?.url || (typeof input === 'string' ? input : String(input?.url || input || ''));
  let urlObj = null;
  try { urlObj = new URL(rawUrl, location.href); } catch {}
  const method = String(init?.method || req?.method || 'GET').toUpperCase();
  const sameOrigin = !urlObj || urlObj.origin === location.origin;
  const path = redactText(urlObj ? (sameOrigin ? `${urlObj.pathname}${urlObj.search}` : urlObj.href) : rawUrl);
  return { method, path, url: urlObj?.href || rawUrl };
}

function shouldIgnoreFetch(path) {
  return !path || path.includes('/api/client-log');
}

function readResponseSnippet(response) {
  const type = response.headers?.get?.('content-type') || '';
  if (type && !/(json|text|javascript|xml|html|plain)/i.test(type)) {
    return Promise.resolve(`[${type || 'binary'} response omitted]`);
  }
  return response.clone().text()
    .then(text => truncate(redactText(text.replace(/\s+/g, ' ')), FETCH_SNIPPET_MAX))
    .catch(() => '');
}

function patchFetch() {
  if (!window.fetch || original.fetch) return;
  original.fetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const [input, init] = args;
    const req = describeFetch(input, init);
    const requestId = `req_${++fetchSeq}_${Date.now().toString(36)}`;
    const started = performance.now();
    return original.fetch(...args).then((response) => {
      const duration_ms = Math.round(performance.now() - started);
      if (!shouldIgnoreFetch(req.path) && response.status >= 400) {
        const base = {
          request_id: requestId,
          method: req.method,
          path: req.path,
          status: response.status,
          duration_ms,
        };
        addBreadcrumbInternal('fetch.http_error', base, response.status >= 500 ? 'error' : 'warn');
        readResponseSnippet(response).then((snippet) => {
          enqueue(makeEvent(response.status >= 500 ? 'error' : 'warn', [
            `fetch ${req.method} ${req.path} -> ${response.status}`,
          ], 'fetch', '', {
            payload: { fetch: { ...base, response_snippet: snippet } },
          }));
        });
      }
      return response;
    }).catch((err) => {
      const duration_ms = Math.round(performance.now() - started);
      if (!shouldIgnoreFetch(req.path)) {
        const data = {
          request_id: requestId,
          method: req.method,
          path: req.path,
          duration_ms,
          error: err?.message || String(err),
        };
        addBreadcrumbInternal('fetch.network_error', data, 'error');
        enqueue(makeEvent('error', [
          `fetch ${req.method} ${req.path} failed: ${data.error}`,
        ], 'fetch', err?.stack, {
          payload: { fetch: data },
        }));
      }
      throw err;
    });
  };
}

function patchHistory() {
  const markRoute = (type) => {
    setTimeout(() => addBreadcrumbInternal(type, { route: getRoute() }), 0);
  };
  for (const name of ['pushState', 'replaceState']) {
    const fn = history[name];
    if (typeof fn !== 'function') continue;
    history[name] = function patchedHistory(...args) {
      const out = fn.apply(this, args);
      markRoute(`route.${name}`);
      return out;
    };
  }
  window.addEventListener('popstate', () => markRoute('route.popstate'));
}

function extractChunkUrl(error) {
  const text = `${error?.message || ''}\n${error?.stack || ''}`;
  const match = text.match(/https?:\/\/[^\s)'"]+\.js[^\s)'"]*/i)
    || text.match(/\/assets\/[^\s)'"]+\.js[^\s)'"]*/i);
  return match ? match[0] : null;
}

export function isLazyChunkError(error) {
  return CHUNK_ERROR_RE.test(String(error?.message || error || ''));
}

export function reportLazyChunkError(error, details = {}) {
  const chunkUrl = details.chunk_url || extractChunkUrl(error);
  const chunkName = details.chunk_name || chunkUrl || 'unknown';
  addBreadcrumbInternal('lazy_chunk.error', {
    chunk_name: chunkName,
    chunk_url: chunkUrl,
    message: error?.message || String(error),
  }, 'error');
  enqueue(makeEvent('onerror', [error], 'lazy.chunk', error?.stack, {
    payload: {
      lazy_chunk: {
        chunk_name: chunkName,
        chunk_url: chunkUrl,
        reload_once: true,
      },
    },
  }));

  if (!isLazyChunkError(error)) return false;
  try {
    const key = `clash_lazy_reload_${getBuildId()}_${String(chunkName).replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80)}`;
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
    setTimeout(() => location.reload(), 120);
    return true;
  } catch {
    setTimeout(() => location.reload(), 120);
    return true;
  }
}

export function lazyWithClientReload(importer, chunkName) {
  return () => importer().catch((error) => {
    const reloading = reportLazyChunkError(error, { chunk_name: chunkName });
    if (reloading) return new Promise(() => {});
    throw error;
  });
}

function loadServiceWorkerVersion() {
  if (!('serviceWorker' in navigator)) return;
  const fetchImpl = original.fetch || window.fetch?.bind(window);
  if (!fetchImpl) return;
  fetchImpl(`/sw.js?client_log=${Date.now()}`, { cache: 'no-store' })
    .then(r => r.ok ? r.text() : '')
    .then(text => {
      const m = text.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
      if (m?.[1]) runtimeContext.sw_version = m[1];
    })
    .catch(() => {});
}

export function installClientLogger() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  getSessionId();
  getBuildId();
  for (const level of LEVELS) patchConsole(level);
  patchFetch();
  patchHistory();
  loadServiceWorkerVersion();

  window.__clashLogBreadcrumb = addClientBreadcrumb;
  window.__clashSetLogContext = setClientLogContext;
  window.__clashReportLazyChunkError = reportLazyChunkError;

  window.addEventListener('error', (event) => {
    enqueue(makeEvent('onerror', [event.error || event.message], 'window.error', event.error?.stack, {
      payload: {
        window_error: {
          filename: event.filename || null,
          lineno: event.lineno || null,
          colno: event.colno || null,
        },
      },
    }));
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    enqueue(makeEvent('unhandledrejection', [reason], 'window.unhandledrejection', reason?.stack));
  });
  window.addEventListener('pagehide', flush);
  addBreadcrumbInternal('app.logger_installed', { build_id: getBuildId() });
}
