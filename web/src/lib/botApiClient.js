const DEFAULT_BOT_API_BASE_URL = '';

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function withLeadingSlash(path) {
  const value = String(path || '');
  return value.startsWith('/') ? value : `/${value}`;
}

const BOT_WS_PREFIX = '/api/v1/bot/ws';
const BOT_API_CANONICAL = '/api/v1/bot';

/**
 * Canonical `/api/v1/bot/*` first, then legacy flat `/api/v1/*` (older Clash proxy mounts).
 * Accepts `/portfolio/summary`, `/api/v1/bot/accounts`, or `/api/v1/exchanges`.
 */
export function botApiPathCandidates(path) {
  let suffix = withLeadingSlash(path);
  if (suffix.startsWith(`${BOT_API_CANONICAL}/`)) {
    suffix = suffix.slice(BOT_API_CANONICAL.length);
  } else if (suffix.startsWith('/api/v1/')) {
    suffix = suffix.slice('/api/v1'.length);
  }
  if (!suffix.startsWith('/')) suffix = `/${suffix}`;
  const canonical = `${BOT_API_CANONICAL}${suffix}`;
  const legacy = `/api/v1${suffix}`;
  return canonical === legacy ? [canonical] : [canonical, legacy];
}

/** GET JSON from bot API — tries canonical path, then legacy flat mount. */
export async function fetchBotApiJson(path, token, init = {}) {
  const headers = botAuthHeaders(token, init.headers || {});
  let lastError = null;
  for (const urlPath of botApiPathCandidates(path)) {
    try {
      const r = await fetch(botApiUrl(urlPath), { ...init, headers });
      let body = null;
      try {
        body = await r.json();
      } catch {
        body = null;
      }
      if (r.ok && body?.success !== false && body?.data !== undefined) {
        return { ok: true, data: body.data, body, status: r.status, path: urlPath };
      }
      lastError = body?.error?.message || body?.error?.code || `HTTP ${r.status}`;
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }
  return { ok: false, error: lastError || 'request failed' };
}

/** Clash proxy mounts flat `/api/v1/{portfolio,exchanges,...}` — do not rewrite REST paths. */
function normalizeBotWsPath(path) {
  const suffix = withLeadingSlash(path);
  if (suffix.startsWith(BOT_WS_PREFIX)) {
    return suffix;
  }
  if (suffix === '/ws' || suffix === '/api/v1/bot/ws') {
    return BOT_WS_PREFIX;
  }
  return BOT_WS_PREFIX;
}

function isHttpsPage() {
  return typeof window !== 'undefined' && window.location?.protocol === 'https:';
}

function toHttpUrl(url) {
  const trimmed = trimTrailingSlash(url);
  if (!trimmed) return '';
  if (/^wss:\/\//i.test(trimmed)) return trimmed.replace(/^wss:\/\//i, 'https://');
  if (/^ws:\/\//i.test(trimmed)) return trimmed.replace(/^ws:\/\//i, 'http://');
  return trimmed;
}

function botApiUrlIsMixedContent(url) {
  if (!url || !isHttpsPage()) return false;
  const normalized = toHttpUrl(url);
  return /^http:\/\//i.test(normalized);
}

function botWsUrlIsMixedContent(url) {
  if (!url || !isHttpsPage()) return false;
  const trimmed = trimTrailingSlash(url);
  return /^ws:\/\//i.test(trimmed) || /^http:\/\//i.test(trimmed);
}

function sameOriginWsBaseUrl() {
  if (typeof window === 'undefined' || !window.location?.host) return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

function configuredBotApiBaseUrl() {
  return trimTrailingSlash(
    import.meta.env.VITE_BOT_API_BASE_URL
      || import.meta.env.VITE_CLASH_BOT_URL
      || import.meta.env.VITE_BOT_API_PROXY
      || '',
  );
}

function configuredBotWsBaseUrl() {
  return trimTrailingSlash(
    import.meta.env.VITE_BOT_WS_BASE_URL
      || import.meta.env.VITE_CLASH_BOT_WS_URL
      || import.meta.env.VITE_BOT_WS_PROXY
      || '',
  );
}

export function botApiBaseUrl() {
  // Default: same-origin `/api/v1/*` via Clash server proxy (nginx → :4000 → Phantom).
  // Set VITE_BOT_API_BASE_URL only for direct bot debugging (e.g. bot-test.html).
  const configured = configuredBotApiBaseUrl();
  if (configured && !botApiUrlIsMixedContent(configured)) {
    return configured;
  }
  return DEFAULT_BOT_API_BASE_URL;
}

export function botWsBaseUrl() {
  const configured = configuredBotWsBaseUrl();
  if (configured && !botWsUrlIsMixedContent(configured)) {
    return configured;
  }

  const apiBase = botApiBaseUrl();
  if (!apiBase) {
    return sameOriginWsBaseUrl();
  }
  if (/^https:\/\//i.test(apiBase)) return apiBase.replace(/^https:\/\//i, 'wss://');
  if (/^http:\/\//i.test(apiBase)) return apiBase.replace(/^http:\/\//i, 'ws://');
  return apiBase;
}

export function botApiUrl(path) {
  const base = botApiBaseUrl();
  const suffix = withLeadingSlash(path);
  return base ? `${base}${suffix}` : suffix;
}

export function botWsUrl(path) {
  const base = botWsBaseUrl();
  const suffix = normalizeBotWsPath(path);
  return base ? `${base}${suffix}` : suffix;
}

export function botAuthHeaders(token, extra = {}) {
  const cleanToken = String(token || '').trim();
  return {
    ...(cleanToken ? {
      'x-token': cleanToken,
      Authorization: `Bearer ${cleanToken}`,
    } : {}),
    ...extra,
  };
}
