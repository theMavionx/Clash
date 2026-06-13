import {
  hasCriticalClientActivity,
  requestClientUpdate,
} from './updateCoordinator';

const ENDPOINT = '/api/client-log';
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'];
const SERVER_LEVELS = new Set(['warn', 'error']);
const BATCH_SIZE = 5;
const FLUSH_DELAY_MS = 1200;
const MAX_QUEUE = 100;
const MAX_BREADCRUMBS = 90;
const CLIENT_MAX_PER_MINUTE = 120;
const FETCH_SNIPPET_MAX = 900;
const PAYLOAD_JSON_MAX = 7600;
const ACTION_STEP_MAX = 12;
const ACTION_RECENT_MAX = 18;
const ACTION_CONTEXT_MAX_AGE_MS = 30 * 60_000;
const FETCH_RECOVERY_WINDOW_MS = 10 * 60_000;
const REDACT_KEY_RE = /(token|secret|private|password|authorization|signature|signedmessage|signed_message|x-token|cookie)/i;
const IMPORTANT_BREADCRUMB_RE = /(Phoenix|phoenix|solana|wallet|rpc|transaction|fetch)/i;
const NOISY_LOG_RE = /^\[load\] stage(1 download|2 signal)/;
const NOISY_SERVER_RE = /^(WalletConnect Core is already initialized|Backpack couldn't override `window\.ethereum`|Mobile Wallet Adapter was registered as a Standard Wallet)/;
const EXTENSION_ERROR_RE = /(chrome-extension:\/\/|moz-extension:\/\/|safari-web-extension:\/\/|Cannot redefine property: ethereum|Invalid property descriptor|tpweb3_|tronlinkParams|Backpack was unable to override window\.ethereum|Attempting to use a disconnected port object)/i;
const NOISY_CLIENT_EVENT_RE = /^(page-load: iframe=|SDK imported, calling ready\(\)|ready\(\) done)/;
const CHUNK_ERROR_RE = /(Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|ChunkLoadError|dynamically imported module)/i;

let installed = false;
let flushing = false;
let timer = null;
let fetchSeq = 0;
let actionSeq = 0;
const queue = [];
const recentAt = [];
const breadcrumbs = [];
const trackedActions = new Map();
const fetchFailures = new Map();
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
  const envBuild = import.meta.env.VITE_BUILD_ID || import.meta.env.VITE_COMMIT_SHA || '';
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
      : (import.meta.env.DEV ? 'dev' : 'unknown');
  } catch {
    runtimeContext.build_id = import.meta.env.DEV ? 'dev' : 'unknown';
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
    .replace(/([?&](?:api[-_]?key|apikey)=)[^&\s"')]+/gi, '$1[redacted]')
    .replace(/(\/v2\/)[A-Za-z0-9_-]{16,}/g, '$1[redacted]')
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
    if (REDACT_KEY_RE.test(key)) {
      out[key] = '[redacted]';
    } else if ((key === 'logs' || key === 'simulation_logs') && Array.isArray(child)) {
      out[key] = child.slice(-80).map((v) => sanitize(v, depth + 1, seen));
    } else if (key === 'err') {
      out[key] = sanitize(child, depth - 1, seen);
    } else {
      out[key] = sanitize(child, depth + 1, seen);
    }
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
    data: sanitize(compactClientEventData(type, data, { forBreadcrumb: true })),
  };
  breadcrumbs.push(crumb);
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  }
  recordActionBreadcrumb(crumb);
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
    const isRenderDiagnostic = type === 'godot.render_diagnostic';
    const eventData = sanitizeDeep(compactClientEventData(type, data));
    addBreadcrumbInternal(type, eventData, level);
    const eventMessage = isRenderDiagnostic
      ? renderDiagnosticMessage(message, eventData)
      : message;
    enqueue(makeEvent(level, [eventMessage], source, opts.stack || '', {
      rawPayload: {
        event: {
          type,
          data: eventData,
        },
      },
      context: opts.context || {},
      minimal: isRenderDiagnostic,
      breadcrumbLimit: isRenderDiagnostic ? 4 : undefined,
    }));
    if (opts.flush || opts.immediate) flushClientLogs();
  } catch { /* noop */ }
}

function renderDiagnosticMessage(message, data = {}) {
  const tag = data?.tag ? ` ${data.tag}` : '';
  const visible = data?.visible_mesh_count ?? '?';
  const total = data?.mesh_count ?? '?';
  const zero = data?.zero_visible_meshes ? ' zero_visible' : '';
  return `${message || 'godot.render_diagnostic'}${tag} meshes ${visible}/${total}${zero}`;
}

function compactClientEventData(type, data = {}, opts = {}) {
  if (type !== 'godot.render_diagnostic' || !data || typeof data !== 'object') return data;
  const meshes = Array.isArray(data.meshes) ? data.meshes : [];
  const particles = Array.isArray(data.particles) ? data.particles : [];
  const sampleLimit = opts.forBreadcrumb ? 2 : 6;
  return {
    tag: data.tag || null,
    root_name: data.root_name || null,
    root_class: data.root_class || null,
    root_visible: data.root_visible ?? null,
    child_count: data.child_count ?? null,
    mesh_count: data.mesh_count ?? null,
    visible_mesh_count: data.visible_mesh_count ?? null,
    particle_count: data.particle_count ?? null,
    visible_particle_count: data.visible_particle_count ?? null,
    zero_visible_meshes: Number(data.mesh_count || 0) > 0 && Number(data.visible_mesh_count || 0) === 0,
    extra: data.extra || null,
    mesh_samples: meshes.slice(0, sampleLimit).map((m) => ({
      name: m?.name || null,
      visible: m?.visible ?? null,
      mesh_class: m?.mesh_class || null,
      surface_count: m?.surface_count ?? null,
      aabb_size: m?.aabb_size || null,
      extra_cull_margin: m?.extra_cull_margin ?? null,
      lod_bias: m?.lod_bias ?? null,
      ignore_occlusion_culling: m?.ignore_occlusion_culling ?? null,
      materials: Array.isArray(m?.materials)
        ? m.materials.slice(0, 3).map((mat) => ({
          source: mat?.source || null,
          class: mat?.class || null,
          path: mat?.path || null,
          shader: mat?.shader || null,
          transparency: mat?.transparency ?? null,
          cull_mode: mat?.cull_mode ?? null,
          shading_mode: mat?.shading_mode ?? null,
          albedo_texture: compactTextureDiagnostic(mat?.albedo_texture),
          emission_texture: compactTextureDiagnostic(mat?.emission_texture),
        }))
        : [],
    })),
    particle_samples: particles.slice(0, sampleLimit).map((p) => ({
      name: p?.name || null,
      class: p?.class || null,
      visible: p?.visible ?? null,
      emitting: p?.emitting ?? null,
      amount: p?.amount ?? null,
    })),
  };
}

function compactTextureDiagnostic(texture) {
  if (!texture || typeof texture !== 'object') return null;
  return {
    class: texture.class || null,
    path: texture.path || null,
    width: texture.width ?? null,
    height: texture.height ?? null,
  };
}

export function flushClientLogs() {
  try {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    flush();
  } catch { /* noop */ }
}

function isImportantBreadcrumb(crumb) {
  if (!crumb) return false;
  if (crumb.level === 'warn' || crumb.level === 'error') return true;
  return IMPORTANT_BREADCRUMB_RE.test(`${crumb.type || ''} ${JSON.stringify(crumb.data || {})}`);
}

function compactBreadcrumbsForPayload(list, max) {
  const all = Array.isArray(list) ? list : [];
  const important = all.filter(isImportantBreadcrumb).slice(-Math.ceil(max / 2));
  const recent = all.slice(-max);
  const merged = [];
  for (const crumb of [...important, ...recent]) {
    if (!merged.includes(crumb)) merged.push(crumb);
  }
  return merged.slice(-max);
}

function classifyActionStatus(type, level) {
  const t = String(type || '').toLowerCase();
  if (!t || !/[._-]/.test(t)) return null;
  if (/(?:^|[._-])(start|begin|init|requested|connect_start|register_start)$/.test(t)) return 'started';
  if (/(?:^|[._-])(submitted|sent|pending)$/.test(t)) return 'submitted';
  if (/(?:^|[._-])(success|succeeded|confirmed|complete|completed|done|ready|landed)$/.test(t)) return 'succeeded';
  if (/(?:^|[._-])(failed|fail|error|timeout|rejected|denied|expired_without_status)$/.test(t)) return 'failed';
  if (level === 'error' && /(wallet|auth|nft|shop|bridge|order|trade|solana|phoenix|decibel|risex|nado|hyperliquid|agent)/i.test(t)) return 'failed';
  return null;
}

function actionKeyFromType(type, status) {
  const suffixes = {
    started: /([._-])(?:start|begin|init|requested|connect_start|register_start)$/i,
    submitted: /([._-])(?:submitted|sent|pending)$/i,
    succeeded: /([._-])(?:success|succeeded|confirmed|complete|completed|done|ready|landed)$/i,
    failed: /([._-])(?:failed|fail|error|timeout|rejected|denied|expired_without_status)$/i,
  };
  const re = suffixes[status];
  const key = String(type || '').replace(re || /$/, '');
  return truncate(key || type || 'client.action', 96);
}

function actionMessage(data = {}) {
  return truncate(data.message || data.error || data.reason || data.detail || data.status || '', 500) || null;
}

function serializeAction(action, includeSteps = false) {
  if (!action) return null;
  const out = {
    id: action.id,
    key: action.key,
    status: action.status,
    started_at: action.started_at,
    last_at: action.last_at,
    duration_ms: Math.max(0, action.last_ms - action.started_ms),
    attempts: action.attempts,
    had_error: !!action.had_error,
    recovered_after_error: !!action.recovered_after_error,
    last_error: action.last_error || null,
    last_step: action.steps[action.steps.length - 1] || null,
  };
  if (action.recovered_at) out.recovered_at = action.recovered_at;
  if (includeSteps) out.steps = action.steps.slice(-ACTION_STEP_MAX);
  return out;
}

function pruneTrackedActions(now = Date.now()) {
  for (const [key, action] of trackedActions.entries()) {
    if (now - action.last_ms > ACTION_CONTEXT_MAX_AGE_MS) trackedActions.delete(key);
  }
  for (const [key, failure] of fetchFailures.entries()) {
    if (now - failure.at_ms > FETCH_RECOVERY_WINDOW_MS) fetchFailures.delete(key);
  }
}

function recordActionBreadcrumb(crumb) {
  const status = classifyActionStatus(crumb?.type, crumb?.level);
  if (!status) return;
  const now = Date.now();
  pruneTrackedActions(now);
  const key = actionKeyFromType(crumb.type, status);
  let action = trackedActions.get(key);
  const step = {
    ts: crumb.ts,
    t: crumb.t,
    type: crumb.type,
    status,
    level: crumb.level,
    data: crumb.data || {},
  };
  if (!action || status === 'started') {
    action = {
      id: `act_${++actionSeq}_${now.toString(36)}`,
      key,
      status: status === 'started' ? 'running' : status,
      started_at: crumb.ts,
      started_ms: now,
      last_at: crumb.ts,
      last_ms: now,
      attempts: 1,
      had_error: false,
      recovered_after_error: false,
      recovered_at: null,
      last_error: null,
      steps: [],
    };
    trackedActions.set(key, action);
  } else if (status === 'submitted') {
    action.attempts += 1;
  }

  const wasFailed = action.had_error || action.status === 'failed';
  action.status = status === 'started' ? 'running' : status;
  action.last_at = crumb.ts;
  action.last_ms = now;
  action.steps.push(step);
  if (action.steps.length > ACTION_STEP_MAX) action.steps.splice(0, action.steps.length - ACTION_STEP_MAX);

  if (status === 'failed') {
    action.had_error = true;
    action.last_error = actionMessage(crumb.data) || crumb.type;
  } else if (status === 'succeeded' && wasFailed) {
    action.recovered_after_error = true;
    action.recovered_at = crumb.ts;
    enqueue(makeEvent('info', [`action ${key} recovered after error`], 'action.recovered', '', {
      payload: { action: serializeAction(action, true) },
    }));
  }
}

function actionsForPayload() {
  const now = Date.now();
  pruneTrackedActions(now);
  const actions = Array.from(trackedActions.values())
    .sort((a, b) => b.last_ms - a.last_ms)
    .slice(0, ACTION_RECENT_MAX);
  const active = actions
    .filter((a) => ['running', 'submitted'].includes(a.status))
    .slice(0, 5)
    .map((a) => serializeAction(a));
  const recentFailures = actions
    .filter((a) => a.had_error && !a.recovered_after_error)
    .slice(0, 5)
    .map((a) => serializeAction(a, true));
  const recovered = actions
    .filter((a) => a.recovered_after_error)
    .slice(0, 5)
    .map((a) => serializeAction(a, true));
  const last = actions[0] ? serializeAction(actions[0], true) : null;
  return {
    active,
    recent_failures: recentFailures,
    recovered,
    last,
  };
}

function payloadString(payload) {
  try {
    const full = JSON.stringify(payload);
    if (full.length <= PAYLOAD_JSON_MAX) return full;

    if (payload?.event?.type === 'godot.render_diagnostic') {
      const renderPayload = {
        args: Array.isArray(payload?.args) ? payload.args.slice(0, 2) : payload?.args,
        context: payload?.context || null,
        event: payload.event,
        breadcrumbs: compactBreadcrumbsForPayload(payload?.breadcrumbs || [], 4),
        payload_compacted: true,
        original_payload_bytes: full.length,
      };
      const renderText = JSON.stringify(renderPayload);
      if (renderText.length <= PAYLOAD_JSON_MAX) return renderText;

      return JSON.stringify({
        context: payload?.context || null,
        event: payload.event,
        payload_compacted: true,
        dropped_breadcrumbs: true,
        original_payload_bytes: full.length,
      });
    }

    const breadcrumbsList = Array.isArray(payload?.breadcrumbs) ? payload.breadcrumbs : [];
    const breadcrumbsCompact = compactBreadcrumbsForPayload(breadcrumbsList, 40);
    const compact = {
      ...payload,
      breadcrumbs: breadcrumbsCompact,
      payload_truncated: true,
      original_payload_bytes: full.length,
      dropped_breadcrumbs: Math.max(0, breadcrumbsList.length - breadcrumbsCompact.length),
    };
    const compactText = JSON.stringify(compact);
    if (compactText.length <= PAYLOAD_JSON_MAX) return compactText;

    const small = {
      args: Array.isArray(payload?.args) ? payload.args.slice(0, 4) : payload?.args,
      context: payload?.context || null,
      event: payload?.event || undefined,
      fetch: payload?.fetch || undefined,
      breadcrumbs: compactBreadcrumbsForPayload(breadcrumbsList, 15),
      payload_truncated: true,
      original_payload_bytes: full.length,
    };
    const smallText = JSON.stringify(small);
    if (smallText.length <= PAYLOAD_JSON_MAX) return smallText;

    return JSON.stringify({
      context: payload?.context || null,
      payload_truncated: true,
      original_payload_bytes: full.length,
    });
  } catch {
    return null;
  }
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
  if (NOISY_CLIENT_EVENT_RE.test(event.message)) return false;
  if (EXTENSION_ERROR_RE.test(event.message) || EXTENSION_ERROR_RE.test(event.stack || '')) return false;
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
  const context = currentContext(extra.context || {});
  const extraPayload = extra.rawPayload || sanitize(extra.payload || {});
  const payload = extra.minimal
    ? {
      args: safeArgs,
      context,
      breadcrumbs: compactBreadcrumbsForPayload(
        breadcrumbs,
        Number.isFinite(extra.breadcrumbLimit) ? extra.breadcrumbLimit : 6,
      ),
      ...extraPayload,
    }
    : {
      args: safeArgs,
      context,
      actions: actionsForPayload(),
      breadcrumbs: breadcrumbs.slice(-MAX_BREADCRUMBS),
      ...extraPayload,
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
  return !path
    || path.includes('/api/client-log')
    || path === 'http://localhost/'
    || /^\/api\/agent-events\/pending(?:\?|$)/.test(path)
    || /\/funding\/overview\?perMarketLimit=2/.test(path);
}

function shouldStoreFetchFailure(path, status) {
  if (status === 400 && /^\/api\/find-enemy(?:\?|$)/.test(path || '')) return false;
  if (status === 400 && /^\/api\/ai-chat\/status(?:\?|$)/.test(path || '')) return false;
  if (status === 404 && /^\/api\/players\/login-wallet(?:\?|$)/.test(path || '')) return false;
  if (status === 429 && /^\/api\/troop-died(?:\?|$)/.test(path || '')) return false;
  if (/\/funding\/overview\?perMarketLimit=2/.test(path || '')) return false;
  return true;
}

function fetchFailureKey(req) {
  return `${req.method} ${req.path || req.url || ''}`;
}

function rememberFetchFailure(req, failure) {
  const key = fetchFailureKey(req);
  if (!key.trim()) return;
  fetchFailures.set(key, {
    ...failure,
    key,
    at_ms: Date.now(),
    at: new Date().toISOString(),
  });
}

function reportFetchRecovery(req, response, requestId, durationMs) {
  const key = fetchFailureKey(req);
  const previous = fetchFailures.get(key);
  if (!previous) return;
  const now = Date.now();
  if (now - previous.at_ms > FETCH_RECOVERY_WINDOW_MS) {
    fetchFailures.delete(key);
    return;
  }
  fetchFailures.delete(key);
  const recovery = {
    request_id: requestId,
    method: req.method,
    path: req.path,
    status: response.status,
    duration_ms: durationMs,
    previous_status: previous.status || null,
    previous_error: previous.error || null,
    previous_request_id: previous.request_id || null,
    recovered_after_ms: now - previous.at_ms,
  };
  addBreadcrumbInternal('fetch.recovered', recovery, 'info');
  enqueue(makeEvent('info', [
    `fetch ${req.method} ${req.path} recovered after ${previous.status || previous.error || 'failure'}`,
  ], 'fetch.recovered', '', {
    payload: { fetch_recovery: recovery },
  }));
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
        const storeFailure = shouldStoreFetchFailure(req.path, response.status);
        const base = {
          request_id: requestId,
          method: req.method,
          path: req.path,
          status: response.status,
          duration_ms,
        };
        rememberFetchFailure(req, base);
        addBreadcrumbInternal(storeFailure ? 'fetch.http_error' : 'fetch.expected_http_status', base, storeFailure ? (response.status >= 500 ? 'error' : 'warn') : 'debug');
        if (storeFailure) {
          readResponseSnippet(response).then((snippet) => {
            enqueue(makeEvent(response.status >= 500 ? 'error' : 'warn', [
              `fetch ${req.method} ${req.path} -> ${response.status}`,
            ], 'fetch', '', {
              payload: { fetch: { ...base, response_snippet: snippet } },
            }));
          });
        }
      } else if (!shouldIgnoreFetch(req.path) && response.status < 400) {
        reportFetchRecovery(req, response, requestId, duration_ms);
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
        rememberFetchFailure(req, { ...data, status: null });
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
  requestClientUpdate({
    reason: hasCriticalClientActivity() ? 'lazy_chunk_deferred' : 'lazy_chunk',
    scope: 'web',
    chunk_name: chunkName,
  });
  return false;
}

export function lazyWithClientReload(importer, chunkName) {
  return () => importer().catch((error) => {
    const reloading = reportLazyChunkError(error, { chunk_name: chunkName });
    if (reloading) return new Promise(() => {});
    throw error;
  });
}

const SW_VERSION_STORAGE_KEY = 'clash_sw_version';

function parseServiceWorkerVersion(text) {
  const m = String(text || '').match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
  return m?.[1] || null;
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage disabled */ }
}

function reloadForFreshServiceWorker(version, reason) {
  try {
    const key = `clash_sw_reload_${String(version || reason || 'unknown').replace(/[^a-z0-9_-]+/gi, '_')}`;
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
  } catch { /* storage disabled */ }
  addBreadcrumbInternal('service_worker.update_available', {
    version,
    reason,
    deferred: hasCriticalClientActivity(),
  }, 'warn');
  requestClientUpdate({
    reason,
    version,
    scope: 'runtime',
  });
}

function handleServiceWorkerVersion(version, reason) {
  if (!version) return;
  const previous = readStorage(SW_VERSION_STORAGE_KEY);
  runtimeContext.sw_version = version;
  writeStorage(SW_VERSION_STORAGE_KEY, version);
  if (previous && previous !== version && navigator.serviceWorker?.controller) {
    reloadForFreshServiceWorker(version, reason);
  }
}

function loadServiceWorkerVersion(reason = 'fetch') {
  if (!('serviceWorker' in navigator)) return;
  const fetchImpl = original.fetch || window.fetch?.bind(window);
  if (!fetchImpl) return;
  fetchImpl(`/sw.js?client_log=${Date.now()}`, { cache: 'no-store' })
    .then(r => r.ok ? r.text() : '')
    .then(text => {
      handleServiceWorkerVersion(parseServiceWorkerVersion(text), reason);
    })
    .catch(() => {});
}

function installServiceWorkerFreshnessGuard() {
  if (!('serviceWorker' in navigator)) return;
  let hadController = !!navigator.serviceWorker.controller;

  const ensureRegistration = () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .catch(() => null);

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event?.data?.type !== 'CLASH_SW_ACTIVATED') return;
    handleServiceWorkerVersion(event.data.version, 'activated_message');
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    const knownVersion = runtimeContext.sw_version || readStorage(SW_VERSION_STORAGE_KEY);
    requestClientUpdate({
      reason: 'controllerchange',
      version: knownVersion,
      scope: 'runtime',
    });
    addBreadcrumbInternal('service_worker.controllerchange_deferred', { version: knownVersion }, 'warn');
  });

  const requestUpdate = () => {
    ensureRegistration()
      .then((registration) => registration?.update?.())
      .catch(() => {});
    loadServiceWorkerVersion('poll');
  };
  requestUpdate();
  window.addEventListener('focus', requestUpdate);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestUpdate();
  });
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
  installServiceWorkerFreshnessGuard();

  window.__clashLogBreadcrumb = addClientBreadcrumb;
  window.__clashReportClientEvent = reportClientEvent;
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
