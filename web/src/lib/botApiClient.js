const DEFAULT_BOT_API_BASE_URL = '';

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function withLeadingSlash(path) {
  const value = String(path || '');
  return value.startsWith('/') ? value : `/${value}`;
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
  const suffix = withLeadingSlash(path);
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
