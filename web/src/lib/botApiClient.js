const DEFAULT_BOT_API_BASE_URL = 'http://62.72.35.202:8080';

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function withLeadingSlash(path) {
  const value = String(path || '');
  return value.startsWith('/') ? value : `/${value}`;
}

export function botApiBaseUrl() {
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
  if (/^https:\/\//i.test(apiBase)) return apiBase.replace(/^https:\/\//i, 'wss://');
  if (/^http:\/\//i.test(apiBase)) return apiBase.replace(/^http:\/\//i, 'ws://');
  return apiBase;
}

export function botApiUrl(path) {
  return `${botApiBaseUrl()}${withLeadingSlash(path)}`;
}

export function botWsUrl(path) {
  return `${botWsBaseUrl()}${withLeadingSlash(path)}`;
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
