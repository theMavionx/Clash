export function siteOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://clashofperps.fun';
}

export function sameOriginRpcUrl(path) {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${siteOrigin()}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

/** Same-origin WebSocket URL helper (http→ws / https→wss). */
export function sameOriginWsUrl(path) {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (/^wss?:\/\//i.test(raw)) return raw;
  if (/^https:\/\//i.test(raw)) return raw.replace(/^https:\/\//i, 'wss://');
  if (/^http:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, 'ws://');
  if (typeof window !== 'undefined' && window.location?.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }
  const http = sameOriginRpcUrl(raw);
  if (/^https:\/\//i.test(http)) return http.replace(/^https:\/\//i, 'wss://');
  if (/^http:\/\//i.test(http)) return http.replace(/^http:\/\//i, 'ws://');
  return http;
}

export function splitRpcUrls(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function envFlag(value, fallback = true) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  return !/^(0|false|no)$/i.test(text);
}

export function uniqueRpcUrls(urls) {
  return urls.filter((url, index, all) => url && all.indexOf(url) === index);
}

export function buildRpcFallbackList({
  publicUrls = [],
  privateUrls = [],
  overrideUrls = [],
  includePublic = true,
  includePrivate = true,
} = {}) {
  return uniqueRpcUrls([
    ...(includePublic ? publicUrls : []),
    ...overrideUrls,
    ...(includePrivate ? privateUrls : []),
  ]);
}
