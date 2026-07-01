function defaultPacificaProxyApiUrl() {
  const path = '/api/futures/pacifica/api';
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export const PACIFICA_PROXY_API_URL = defaultPacificaProxyApiUrl();
export const PACIFICA_DIRECT_API_URL =
  import.meta.env.VITE_PACIFICA_DIRECT_API_URL || 'https://api.pacifica.fi/api/v1';
export const PACIFICA_CONFIGURED_BROWSER_API_URL =
  import.meta.env.VITE_PACIFICA_BROWSER_API_URL || '';
export const PACIFICA_API_URL = PACIFICA_DIRECT_API_URL;
export const PACIFICA_WS_URL =
  import.meta.env.VITE_PACIFICA_BROWSER_WS_URL || 'wss://ws.pacifica.fi/ws';

const fetchCache = new Map();
const fetchInflight = new Map();

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizePath(path) {
  const text = String(path || '');
  return text.startsWith('/') ? text : `/${text}`;
}

function pacificaApiUrlKey(value) {
  const url = trimTrailingSlash(value).toLowerCase();
  if (!url) return '';
  if (url.includes('/api/futures/pacifica/api')) return 'proxy';
  return url;
}

function pacificaFetchCacheTtl(path, method) {
  if (String(method || 'GET').toUpperCase() !== 'GET') return 0;
  const pathname = normalizePath(path).split('?')[0];
  if (pathname === '/info') return 12 * 60 * 60_000;
  if (pathname === '/info/prices') return 1_000;
  if (pathname === '/book') return 500;
  if (pathname === '/kline') return 15_000;
  if (pathname === '/trades/history' || pathname === '/funding/history') return 15_000;
  return 0;
}

function clonePacificaData(data) {
  if (data == null || typeof data !== 'object') return data;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

function shouldFallbackPacificaStatus(status) {
  const n = Number(status);
  return !Number.isFinite(n) || n === 408 || n === 425 || n === 429 || n >= 500;
}

function createPacificaHttpError(result) {
  const data = result?.data;
  const msg = data?.error || data?.message || result?.text || `Pacifica API error ${result?.status || ''}`.trim();
  const err = new Error(msg);
  err.status = result?.status || result?.response?.status || null;
  err.data = data;
  err.text = result?.text;
  err.source = result?.source?.name || null;
  err.url = result?.url || null;
  return err;
}

export function pacificaApiEndpointCandidates(options = {}) {
  const includeProxy = options.includeProxy !== false;
  const rows = [
    { name: 'browser', apiUrl: PACIFICA_DIRECT_API_URL },
    PACIFICA_CONFIGURED_BROWSER_API_URL
      ? { name: 'browser-config', apiUrl: PACIFICA_CONFIGURED_BROWSER_API_URL }
      : null,
    includeProxy ? { name: 'proxy', apiUrl: PACIFICA_PROXY_API_URL } : null,
  ].filter(Boolean);
  const seen = new Set();
  return rows.filter(row => {
    const key = pacificaApiUrlKey(row.apiUrl);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchPacificaResponse(source, path, options, onResponse) {
  const url = `${trimTrailingSlash(source.apiUrl)}${normalizePath(path)}`;
  const response = await fetch(url, options);
  try { onResponse?.(response, source); } catch {}
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return {
    response,
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    text,
    data,
    source,
    url,
  };
}

export async function pacificaRequest(path, options = {}) {
  const {
    fallbackOnHttp = true,
    includeProxy = true,
    onResponse,
    ...fetchOptions
  } = options || {};
  const sources = pacificaApiEndpointCandidates({ includeProxy });
  const errors = [];

  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    try {
      const result = await fetchPacificaResponse(source, path, fetchOptions, onResponse);
      if (
        fallbackOnHttp
        && !result.ok
        && shouldFallbackPacificaStatus(result.status)
        && i < sources.length - 1
      ) {
        const err = createPacificaHttpError(result);
        errors.push({
          name: source.name,
          status: result.status,
          message: err.message,
        });
        continue;
      }
      if (errors.length) {
        console.info('[Pacifica] API fallback recovered', {
          path: normalizePath(path),
          source: source.name,
          previous: errors.map(row => `${row.name}: ${row.message}`).slice(0, 2),
        });
      }
      result.previousErrors = errors;
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      errors.push({
        name: source.name,
        status: error?.status || null,
        message: error?.message || String(error),
      });
    }
  }

  const err = new Error(errors.map(row => `${row.name}: ${row.message}`).join(' | ') || `Pacifica API ${path} failed`);
  err.pacificaSources = errors;
  throw err;
}

export async function pacificaFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const hasBody = options.body != null;
  const hasAbortSignal = !!options.signal;
  const ttl = pacificaFetchCacheTtl(path, method);
  const cacheKey = `${method}:${normalizePath(path)}:${hasBody ? String(options.body) : ''}`;
  const now = Date.now();
  const cached = ttl > 0 ? fetchCache.get(cacheKey) : null;
  if (cached && now - cached.at < ttl) return clonePacificaData(cached.data);

  if (!hasAbortSignal && ttl > 0 && fetchInflight.has(cacheKey)) {
    return clonePacificaData(await fetchInflight.get(cacheKey));
  }

  const promise = pacificaRequest(path, options).then(result => {
    if (!result.ok) throw createPacificaHttpError(result);
    if (ttl > 0 && result.data && !result.data.rate_limited) {
      fetchCache.set(cacheKey, { at: Date.now(), data: clonePacificaData(result.data) });
      if (fetchCache.size > 200) {
        const cutoff = Date.now() - 12 * 60 * 60_000;
        for (const [key, value] of fetchCache) {
          if (value.at < cutoff) fetchCache.delete(key);
        }
      }
    }
    return result.data;
  });

  if (!hasAbortSignal && ttl > 0) {
    fetchInflight.set(cacheKey, promise.finally(() => fetchInflight.delete(cacheKey)));
  }

  return clonePacificaData(await promise);
}
