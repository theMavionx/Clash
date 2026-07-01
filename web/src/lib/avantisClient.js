import { CORE_API } from './avantisContract';

export const AVANTIS_SOCKET_API = String(
  import.meta.env.VITE_AVANTIS_SOCKET_API_URL
  || 'https://socket-api-pub.avantisfi.com/socket-api/v1/data',
).trim();

const REQUEST_TIMEOUT_MS = 8_000;
const MARKETS_CACHE_TTL_MS = 60_000;
const USER_DATA_CACHE_TTL_MS = 2_500;

let marketsCache = { at: 0, data: null };
const userDataCache = new Map();

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

async function fetchJson(url, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const message = data?.error || data?.message || text || `HTTP ${res.status}`;
      throw new Error(message);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function normalizePairInfos(payload) {
  const raw = [];
  const pairInfos = payload?.data?.pairInfos || payload?.pairInfos || null;
  if (pairInfos && typeof pairInfos === 'object' && !Array.isArray(pairInfos)) {
    for (const [idxStr, pair] of Object.entries(pairInfos)) {
      const index = Number(idxStr);
      const from = String(pair?.from || '').toUpperCase();
      const to = String(pair?.to || 'USD').toUpperCase();
      if (!from || !Number.isFinite(index)) continue;
      raw.push({
        index,
        from,
        to,
        symbol: `${from}/${to}`,
        ...pair,
      });
    }
    return raw.sort((a, b) => Number(a.index) - Number(b.index));
  }

  const list = Array.isArray(payload?.pairs)
    ? payload.pairs
    : Array.isArray(payload?.data?.pairs)
      ? payload.data.pairs
      : [];
  return list.map((pair, index) => {
    const from = String(pair?.from || pair?.base || '').toUpperCase();
    const to = String(pair?.to || pair?.quote || 'USD').toUpperCase();
    return {
      index: Number(pair?.index ?? index),
      from,
      to,
      symbol: from && to ? `${from}/${to}` : String(pair?.symbol || '').toUpperCase(),
      ...pair,
    };
  }).filter(pair => pair.from || pair.symbol);
}

export async function fetchAvantisMarketsDirect({ force = false } = {}) {
  const now = Date.now();
  if (!force && marketsCache.data && now - marketsCache.at < MARKETS_CACHE_TTL_MS) {
    return marketsCache.data;
  }
  const payload = await fetchJson(AVANTIS_SOCKET_API);
  const pairs = normalizePairInfos(payload);
  const data = { pairs, count: pairs.length, source: 'avantis_socket_api' };
  marketsCache = { at: now, data };
  return data;
}

export async function fetchAvantisUserDataDirect(address, { force = false } = {}) {
  const wallet = String(address || '').trim();
  if (!isEvmAddress(wallet)) throw new Error('Invalid Avantis wallet address');
  const key = wallet.toLowerCase();
  const now = Date.now();
  const cached = userDataCache.get(key);
  if (!force && cached && now - cached.at < USER_DATA_CACHE_TTL_MS) return cached.data;

  const url = `${CORE_API}/user-data?trader=${encodeURIComponent(wallet)}`;
  const data = await fetchJson(url);
  const normalized = {
    ...(data && typeof data === 'object' ? data : {}),
    positions: Array.isArray(data?.positions) ? data.positions : [],
    limitOrders: Array.isArray(data?.limitOrders) ? data.limitOrders : [],
  };
  userDataCache.set(key, { at: now, data: normalized });
  if (userDataCache.size > 40) {
    const entries = Array.from(userDataCache.entries()).slice(-25);
    userDataCache.clear();
    entries.forEach(([cacheKey, value]) => userDataCache.set(cacheKey, value));
  }
  return normalized;
}
