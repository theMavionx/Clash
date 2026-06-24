const DEFAULT_BOT_API_BASE_URL = '';

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function withLeadingSlash(path) {
  const value = String(path || '');
  return value.startsWith('/') ? value : `/${value}`;
}

export function botApiBaseUrl() {
  // Default: same-origin `/api/v1/*` via Clash server proxy (nginx → :4000 → Phantom).
  // Set VITE_BOT_API_BASE_URL only for direct bot debugging (e.g. bot-test.html).
  return trimTrailingSlash(
    import.meta.env.VITE_BOT_API_BASE_URL
      || import.meta.env.VITE_CLASH_BOT_URL
      || import.meta.env.VITE_BOT_API_PROXY
      || DEFAULT_BOT_API_BASE_URL,
  );
}

export function botWsBaseUrl() {
  const configured = import.meta.env.VITE_BOT_WS_BASE_URL
    || import.meta.env.VITE_CLASH_BOT_WS_URL
    || import.meta.env.VITE_BOT_WS_PROXY;
  if (configured) return trimTrailingSlash(configured);

  const apiBase = botApiBaseUrl();
  if (!apiBase) {
    if (typeof window !== 'undefined' && window.location?.host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}`;
    }
    return '';
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
