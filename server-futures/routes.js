const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const pacifica = require('./pacifica');
const avantis = require('./avantis');
const deposit = require('./deposit');
const decibel = require('./decibel');
const gmx = require('./gmx');
const gmxRewards = require('./gmx-rewards-worker');
const phoenixRewards = require('./phoenix-rewards-worker');
const hyperliquid = require('./hyperliquid');
const hyperliquidRewards = require('./hyperliquid-rewards-worker');
const risex = require('./risex');
const nado = require('./nado');
const hibachi = require('./hibachi');
const hotstuff = require('./hotstuff');
const hotstuffRewards = require('./hotstuff-rewards-worker');
const grvt = require('./grvt');
const { createPublicClient, decodeFunctionData, formatUnits, http } = require('viem');
const { base } = require('viem/chains');

const router = express.Router();

const PYTH_BENCHMARKS = 'https://benchmarks.pyth.network/v1/shims/tradingview';
const PYTH_HISTORY_CACHE_TTL_MS = 60_000;
const PYTH_HISTORY_STALE_MS = 15 * 60_000;
const PYTH_HISTORY_MAX_BARS = 720;
const pythHistoryCache = new Map();
const pythHistoryInflight = new Map();
const PHOENIX_API_BASE = process.env.PHOENIX_API_URL || 'https://perp-api.phoenix.trade';
const PHOENIX_PROXY_TIMEOUT_MS = Math.max(1000, Math.min(10_000, Number(process.env.PHOENIX_PROXY_TIMEOUT_MS || 4500)));
const PHOENIX_PROXY_STALE_MS = phoenixProxyDurationEnv('PHOENIX_PROXY_STALE_MS', 24 * 60 * 60_000, 30_000);
const PHOENIX_PROXY_TRADER_STATE_STALE_MS = phoenixProxyDurationEnv('PHOENIX_PROXY_TRADER_STATE_STALE_MS', 45_000, 1000);
const PHOENIX_PROXY_ERROR_COOLDOWN_MS = phoenixProxyDurationEnv('PHOENIX_PROXY_ERROR_COOLDOWN_MS', 15_000, 1000);
const PHOENIX_PROXY_DISK_CACHE_FILE = process.env.PHOENIX_PROXY_CACHE_FILE
  || path.join(path.dirname(process.env.CLASH_FUTURES_DB || path.join(__dirname, 'futures.db')), 'phoenix-proxy-cache.json');
const phoenixProxyCache = new Map();
const phoenixProxyInflight = new Map();
let phoenixProxyDiskCacheLoaded = false;
let phoenixProxyDiskCacheFlushTimer = null;
const basePublicClient = createPublicClient({
  chain: base,
  transport: http(avantis.BASE_RPC),
});

function phoenixProxyDurationEnv(name, fallbackMs, minMs) {
  const n = Number(process.env[name] || fallbackMs);
  return Number.isFinite(n) ? Math.max(minMs, n) : fallbackMs;
}

function phoenixProxyPathname(pathWithQuery) {
  return String(pathWithQuery || '').split('?')[0];
}

function shouldPersistPhoenixProxyCache(cacheKey) {
  return /^GET:\/(?:exchange|v1\/exchange)(?:\/|$)/.test(cacheKey)
    || /^GET:\/v1\/funding\/overview(?:\?|:|$)/.test(cacheKey);
}

function loadPhoenixProxyDiskCache() {
  if (phoenixProxyDiskCacheLoaded) return;
  phoenixProxyDiskCacheLoaded = true;
  try {
    if (!fs.existsSync(PHOENIX_PROXY_DISK_CACHE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(PHOENIX_PROXY_DISK_CACHE_FILE, 'utf8'));
    const entries = parsed && typeof parsed === 'object' ? parsed.entries : null;
    if (!entries || typeof entries !== 'object') return;
    for (const [key, value] of Object.entries(entries)) {
      if (!shouldPersistPhoenixProxyCache(key)) continue;
      if (!value || typeof value !== 'object' || !value.at || !('data' in value)) continue;
      if (value.soft) continue;
      phoenixProxyCache.set(key, value);
    }
  } catch (e) {
    console.warn('[phoenix/proxy] disk cache load failed:', e.message);
  }
}

function schedulePhoenixProxyDiskCacheFlush() {
  if (phoenixProxyDiskCacheFlushTimer) return;
  phoenixProxyDiskCacheFlushTimer = setTimeout(() => {
    phoenixProxyDiskCacheFlushTimer = null;
    try {
      const entries = {};
      for (const [key, value] of phoenixProxyCache) {
        if (shouldPersistPhoenixProxyCache(key)) entries[key] = value;
      }
      fs.mkdirSync(path.dirname(PHOENIX_PROXY_DISK_CACHE_FILE), { recursive: true });
      fs.writeFileSync(PHOENIX_PROXY_DISK_CACHE_FILE, JSON.stringify({ entries }, null, 2));
    } catch (e) {
      console.warn('[phoenix/proxy] disk cache write failed:', e.message);
    }
  }, 1000);
  phoenixProxyDiskCacheFlushTimer.unref?.();
}

function phoenixProxySoftRateLimitData(pathWithQuery) {
  const pathname = phoenixProxyPathname(pathWithQuery);
  if (/^\/(?:exchange|v1\/exchange)(?:\/|$)/.test(pathname)) {
    return {
      markets: [],
      data: [],
      rate_limited: true,
      retryable: true,
      source: 'phoenix_proxy_soft_429',
    };
  }
  if (/^\/v1\/funding\/overview(?:\?|$)/.test(pathWithQuery)) {
    return {
      series: [],
      rate_limited: true,
      retryable: true,
      source: 'phoenix_proxy_soft_429',
    };
  }
  if (/^\/v1\/candles\//.test(pathname)) {
    return {
      candles: [],
      data: [],
      rate_limited: true,
      retryable: true,
      source: 'phoenix_proxy_soft_429',
    };
  }
  if (/^\/v1\/invite\/check\//.test(pathname)) {
    return {
      whitelisted: null,
      rate_limited: true,
      retryable: true,
      source: 'phoenix_proxy_soft_429',
    };
  }
  return null;
}

function normalizePhoenixProxyPath(rawPath) {
  const pathname = phoenixProxyPathname(rawPath);
  if (!pathname.startsWith('/') || pathname.includes('..') || pathname.includes('\\')) {
    throw new Error('invalid Phoenix API path');
  }
  if (!/^\/(?:exchange|v1|trader|invite)(?:\/|$)/.test(pathname)) {
    throw new Error('Phoenix API path is not allowed');
  }
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@/%?-]*$/.test(rawPath)) {
    throw new Error('invalid Phoenix API characters');
  }
  return rawPath;
}

function phoenixProxyCacheTtl(pathname, method) {
  if (method !== 'GET') return 0;
  if (/^\/exchange(?:\/|$)/.test(pathname) || /^\/v1\/exchange(?:\/|$)/.test(pathname)) return 12 * 60 * 60_000;
  if (/^\/v1\/view\/orderbook\//.test(pathname)) return 1200;
  if (/^\/v1\/candles\//.test(pathname)) return 30_000;
  if (/^\/v1\/funding\/overview(?:\?|$)/.test(pathname)) return 20_000;
  if (/^\/v1\/invite\/check\//.test(pathname)) return 60_000;
  if (/^\/trader\/[^/]+\/(?:trades-history|funding-history)(?:\?|$)/.test(pathname)) return 20_000;
  if (/^\/trader\/[^/]+\/state(?:\?|$)/.test(pathname) || /^\/v1\/trader\/state\//.test(pathname)) return 0;
  return 15_000;
}

function isPhoenixTraderStatePath(pathWithQuery) {
  const pathname = phoenixProxyPathname(pathWithQuery);
  return /^\/trader\/[^/]+\/state$/.test(pathname)
    || /^\/v1\/trader\/state\/[^/]+$/.test(pathname);
}

function phoenixProxyStaleMs(pathWithQuery, method) {
  if (method !== 'GET') return 0;
  if (isPhoenixTraderStatePath(pathWithQuery)) return PHOENIX_PROXY_TRADER_STATE_STALE_MS;
  return phoenixProxyCacheTtl(pathWithQuery, method) > 0 ? PHOENIX_PROXY_STALE_MS : 0;
}

async function fetchPhoenixProxy(pathWithQuery, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body;
  const headers = {
    accept: 'application/json',
    'user-agent': 'ClashOfPerps/1.0 phoenix-proxy',
  };
  if (method !== 'GET' && body !== undefined) headers['content-type'] = 'application/json';

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), PHOENIX_PROXY_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${PHOENIX_API_BASE}${pathWithQuery}`, {
      method,
      signal: ctrl.signal,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!upstream.ok) {
      const detail = typeof data === 'string' ? data : (data?.error || data?.message || text);
      const err = new Error(`Phoenix API ${upstream.status}: ${detail || 'request failed'}`);
      err.status = upstream.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function handlePhoenixApiProxy(req, res, pathWithQuery) {
  let cleanPath;
  try {
    cleanPath = normalizePhoenixProxyPath(pathWithQuery);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) {
    return res.status(405).json({ error: 'method not allowed' });
  }

  loadPhoenixProxyDiskCache();
  const ttl = phoenixProxyCacheTtl(cleanPath, method);
  const staleMs = phoenixProxyStaleMs(cleanPath, method);
  const cacheKey = `${method}:${cleanPath}:${method === 'GET' ? '' : JSON.stringify(req.body || {})}`;
  const now = Date.now();
  const cached = (ttl > 0 || staleMs > 0) ? phoenixProxyCache.get(cacheKey) : null;
  const freshMs = cached?.soft ? PHOENIX_PROXY_ERROR_COOLDOWN_MS : ttl;
  if (ttl > 0 && cached && now - cached.at < freshMs) {
    res.set('Cache-Control', `public, max-age=${Math.max(1, Math.floor(freshMs / 1000))}`);
    res.set('X-Phoenix-Proxy-Cache', 'hit');
    return res.json(cached.data);
  }

  try {
    let pending = phoenixProxyInflight.get(cacheKey);
    if (!pending) {
      pending = fetchPhoenixProxy(cleanPath, { method, body: req.body }).finally(() => {
        phoenixProxyInflight.delete(cacheKey);
      });
      phoenixProxyInflight.set(cacheKey, pending);
    }
    const data = await pending;
    if (ttl > 0 || staleMs > 0) {
      phoenixProxyCache.set(cacheKey, { at: now, data });
      if (shouldPersistPhoenixProxyCache(cacheKey)) schedulePhoenixProxyDiskCacheFlush();
      if (phoenixProxyCache.size > 750) {
        const cutoff = Date.now() - PHOENIX_PROXY_STALE_MS;
        for (const [key, value] of phoenixProxyCache) {
          if (value.at < cutoff) phoenixProxyCache.delete(key);
        }
      }
    }
    res.set('Cache-Control', ttl > 0 ? `public, max-age=${Math.max(1, Math.floor(ttl / 1000))}` : 'no-store');
    res.set('X-Phoenix-Proxy-Cache', cached ? 'refresh' : 'miss');
    return res.json(data);
  } catch (e) {
    if (cached && !cached.soft && staleMs > 0 && now - cached.at < staleMs) {
      console.warn('[phoenix/proxy] upstream failed, serving stale:', e.message);
      res.set('Cache-Control', ttl > 0 ? 'public, max-age=3' : 'no-store');
      res.set('X-Phoenix-Proxy-Cache', 'stale');
      res.set('X-Phoenix-Proxy-Stale-Age', String(Math.max(0, now - cached.at)));
      return res.json(cached.data);
    }
    if (method === 'GET' && e.status === 429) {
      const data = phoenixProxySoftRateLimitData(cleanPath);
      if (data) {
        phoenixProxyCache.set(cacheKey, { at: now, data, soft: true });
        res.set('Cache-Control', `public, max-age=${Math.max(1, Math.floor(PHOENIX_PROXY_ERROR_COOLDOWN_MS / 1000))}`);
        res.set('X-Phoenix-Proxy-Cache', 'soft-429');
        return res.json(data);
      }
    }
    const status = e.name === 'AbortError' ? 504 : (e.status === 429 ? 503 : 502);
    console.warn('[phoenix/proxy] failed:', cleanPath, e.message);
    res.set('Cache-Control', ttl > 0 ? 'public, max-age=3' : 'no-store');
    res.set('X-Phoenix-Proxy-Cache', 'error');
    return res.status(status).json({
      error: status === 504 ? 'Phoenix API timeout' : (status === 503 ? 'Phoenix API temporarily unavailable' : 'Phoenix API request failed'),
      detail: e.message,
    });
  }
}

function pythResolutionSeconds(resolution) {
  const r = String(resolution || '').trim();
  if (r === '1') return 60;
  if (r === '5') return 5 * 60;
  if (r === '15') return 15 * 60;
  if (r === '60') return 60 * 60;
  if (r === '240') return 4 * 60 * 60;
  if (r === 'D' || r === '1D') return 24 * 60 * 60;
  return 60;
}

function normalizePythHistoryQuery(query) {
  const symbol = String(query.symbol || '').trim();
  const resolution = String(query.resolution || '').trim();
  const from = Math.floor(Number(query.from));
  const to = Math.floor(Number(query.to));
  if (!symbol || symbol.length > 96 || !/^[A-Za-z0-9._/-]+$/.test(symbol)) {
    throw new Error('valid symbol required');
  }
  if (!/^(1|5|15|60|240|D|1D)$/.test(resolution)) {
    throw new Error('valid resolution required');
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= from) {
    throw new Error('valid from/to required');
  }
  const maxSpan = 370 * 24 * 60 * 60;
  if (to - from > maxSpan) {
    throw new Error('history window too large');
  }
  const bucket = pythResolutionSeconds(resolution);
  let bucketedFrom = Math.floor(from / bucket) * bucket;
  let bucketedTo = Math.floor(to / bucket) * bucket;
  if (bucketedTo <= bucketedFrom) bucketedTo = bucketedFrom + bucket;
  const maxBucketedSpan = bucket * PYTH_HISTORY_MAX_BARS;
  if (bucketedTo - bucketedFrom > maxBucketedSpan) {
    bucketedFrom = bucketedTo - maxBucketedSpan;
  }
  return {
    symbol,
    resolution,
    from: bucketedFrom,
    to: bucketedTo,
  };
}

async function fetchPythHistory(query) {
  const params = new URLSearchParams({
    symbol: query.symbol,
    resolution: query.resolution,
    from: String(query.from),
    to: String(query.to),
  });
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const upstream = await fetch(`${PYTH_BENCHMARKS}/history?${params.toString()}`, {
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'ClashOfPerps/1.0 pyth-history-proxy',
      },
    });
    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!upstream.ok) {
      const detail = data?.errmsg || data?.error || text || `HTTP ${upstream.status}`;
      const err = new Error(`Pyth benchmarks ${upstream.status}: ${detail}`);
      err.status = upstream.status;
      throw err;
    }
    return data || { s: 'error', errmsg: 'empty Pyth response' };
  } finally {
    clearTimeout(timeout);
  }
}

// Record every verified Decibel fill that is economically non-zero. Gold
// payouts are still clamped in the main server's /claim-gold path ($10 floor);
// this lower floor keeps quests/audits from missing tiny meme-market fills
// like CHIP where a valid position task can use <$1 notional per open.
const DECIBEL_MIN_RECORDED_NOTIONAL_USD = 0.000001;
const DECIBEL_MAX_REWARD_NOTIONAL_USD = 10_000_000;
const DEFAULT_DECIBEL_TP_LIMIT_BUFFER_BPS = 35;
const DEFAULT_DECIBEL_TP_MIN_LIMIT_TICKS = 5;
const DEFAULT_DECIBEL_SL_LIMIT_BUFFER_BPS = 500;
const DEFAULT_DECIBEL_SL_MIN_LIMIT_TICKS = 50;
const DECIBEL_TP_LIMIT_BUFFER_BPS_RAW = Number(
  process.env.DECIBEL_TP_LIMIT_BUFFER_BPS
  || process.env.DECIBEL_TPSL_LIMIT_BUFFER_BPS
  || DEFAULT_DECIBEL_TP_LIMIT_BUFFER_BPS
);
const DECIBEL_TP_LIMIT_BUFFER_BPS = Number.isFinite(DECIBEL_TP_LIMIT_BUFFER_BPS_RAW)
  && DECIBEL_TP_LIMIT_BUFFER_BPS_RAW > 0
  ? DECIBEL_TP_LIMIT_BUFFER_BPS_RAW
  : DEFAULT_DECIBEL_TP_LIMIT_BUFFER_BPS;
const DECIBEL_TP_MIN_LIMIT_TICKS_RAW = Number(
  process.env.DECIBEL_TP_MIN_LIMIT_TICKS
  || process.env.DECIBEL_TPSL_MIN_LIMIT_TICKS
  || DEFAULT_DECIBEL_TP_MIN_LIMIT_TICKS
);
const DECIBEL_TP_MIN_LIMIT_TICKS = Number.isFinite(DECIBEL_TP_MIN_LIMIT_TICKS_RAW)
  && DECIBEL_TP_MIN_LIMIT_TICKS_RAW > 0
  ? DECIBEL_TP_MIN_LIMIT_TICKS_RAW
  : DEFAULT_DECIBEL_TP_MIN_LIMIT_TICKS;
const DECIBEL_SL_LIMIT_BUFFER_BPS_RAW = Number(
  process.env.DECIBEL_SL_LIMIT_BUFFER_BPS || DEFAULT_DECIBEL_SL_LIMIT_BUFFER_BPS
);
const DECIBEL_SL_LIMIT_BUFFER_BPS = Number.isFinite(DECIBEL_SL_LIMIT_BUFFER_BPS_RAW)
  && DECIBEL_SL_LIMIT_BUFFER_BPS_RAW > 0
  ? DECIBEL_SL_LIMIT_BUFFER_BPS_RAW
  : DEFAULT_DECIBEL_SL_LIMIT_BUFFER_BPS;
const DECIBEL_SL_MIN_LIMIT_TICKS_RAW = Number(
  process.env.DECIBEL_SL_MIN_LIMIT_TICKS || DEFAULT_DECIBEL_SL_MIN_LIMIT_TICKS
);
const DECIBEL_SL_MIN_LIMIT_TICKS = Number.isFinite(DECIBEL_SL_MIN_LIMIT_TICKS_RAW)
  && DECIBEL_SL_MIN_LIMIT_TICKS_RAW > 0
  ? DECIBEL_SL_MIN_LIMIT_TICKS_RAW
  : DEFAULT_DECIBEL_SL_MIN_LIMIT_TICKS;
// 5 bps = 0.05%. Must match web/src/lib/decibel.js BUILDER_FEE_BPS — the
// signed order's builderFee field is validated against this exact value
// (see assertBuilderFeeAllowed below). Env override allowed for staging.
const DEFAULT_DECIBEL_BUILDER_FEE_BPS = 5;
const DECIBEL_BUILDER_FEE_BPS_RAW = Number(process.env.DECIBEL_BUILDER_FEE_BPS || DEFAULT_DECIBEL_BUILDER_FEE_BPS);
const DECIBEL_BUILDER_FEE_BPS = Number.isFinite(DECIBEL_BUILDER_FEE_BPS_RAW) && DECIBEL_BUILDER_FEE_BPS_RAW > 0
  ? DECIBEL_BUILDER_FEE_BPS_RAW
  : DEFAULT_DECIBEL_BUILDER_FEE_BPS;
const DEFAULT_DECIBEL_BUILDER_SUBACCOUNT =
  '0xfa4d46a481f5bc95de01a629ec95b7876e946ebe1e86374284d899ac4366984a';
const DECIBEL_ALLOWED_BUILDER_ADDRS = new Set(
  String(process.env.DECIBEL_ALLOWED_BUILDER_ADDRS || process.env.DECIBEL_BUILDER_SUBACCOUNT || DEFAULT_DECIBEL_BUILDER_SUBACCOUNT)
    .split(',')
    .map(s => normalizeAptosAddress(s))
    .filter(Boolean)
);

const PERPL_API_BASE = process.env.PERPL_API_BASE || 'https://app.perpl.xyz/api/v1';
const PERPL_FILL_LOOKBACK = Math.max(10, Math.min(250, Number(process.env.PERPL_FILL_LOOKBACK || 100)));
const PERPL_MARKETS_FALLBACK = {
  1: { symbol: 'BTC', price_decimals: 1, size_decimals: 5 },
  10: { symbol: 'MON', price_decimals: 6, size_decimals: 0 },
  20: { symbol: 'ETH', price_decimals: 2, size_decimals: 3 },
  30: { symbol: 'SOL', price_decimals: 2, size_decimals: 3 },
};
let perplContextCache = { at: 0, markets: PERPL_MARKETS_FALLBACK };

function normalizeEvmAddress(addr) {
  const s = String(addr || '').trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(s) ? s : null;
}

function perplRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.fills)) return payload.fills;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function getPerplMarkets() {
  if (Date.now() - perplContextCache.at < 60_000 && perplContextCache.markets) {
    return perplContextCache.markets;
  }
  try {
    const r = await fetch(`${PERPL_API_BASE}/pub/context`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const out = {};
    for (const m of perplRows(j?.markets || j)) {
      const id = Number(m?.id ?? m?.market_id ?? m?.mkt);
      if (!Number.isFinite(id)) continue;
      const cfg = m?.config || m;
      const state = m?.state || {};
      const priceDecimals = Number(cfg?.price_decimals ?? PERPL_MARKETS_FALLBACK[id]?.price_decimals ?? 1);
      const markWire = Number(state?.mrk ?? state?.lst ?? state?.mid ?? state?.ask ?? state?.bid ?? 0);
      out[id] = {
        symbol: String(m?.name || m?.symbol || PERPL_MARKETS_FALLBACK[id]?.symbol || `MKT${id}`).toUpperCase(),
        price_decimals: priceDecimals,
        size_decimals: Number(cfg?.size_decimals ?? PERPL_MARKETS_FALLBACK[id]?.size_decimals ?? 5),
        mark: Number.isFinite(markWire) && markWire > 0 ? markWire / 10 ** priceDecimals : null,
      };
    }
    if (Object.keys(out).length) {
      perplContextCache = { at: Date.now(), markets: out };
      return out;
    }
  } catch (e) {
    console.warn('[perpl] context cache refresh failed:', e.message);
  }
  return perplContextCache.markets || PERPL_MARKETS_FALLBACK;
}

async function perplAuthedGet(path, { cookie, authNonce }) {
  const r = await fetch(`${PERPL_API_BASE}${path}`, {
    headers: {
      accept: 'application/json',
      cookie,
      'x-auth-nonce': authNonce,
      origin: 'https://app.perpl.xyz',
      referer: 'https://app.perpl.xyz/',
    },
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = typeof data === 'string' ? data : (data?.error || data?.message || text);
    throw new Error(`Perpl ${path} ${r.status}: ${msg || 'request failed'}`);
  }
  return data;
}

function perplFillTime(fill) {
  const raw = fill?.at?.t ?? fill?.created_at ?? fill?.timestamp ?? fill?.time ?? fill?.ts;
  const n = Number(raw);
  if (Number.isFinite(n)) return n > 1e12 ? new Date(n).toISOString() : new Date(n * 1000).toISOString();
  const d = new Date(raw || 0);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function perplOrderTypeLabel(t, reduceOnly = false) {
  const n = Number(t);
  if (n === 1 || n === 2) return 'market';
  if (n === 3 || n === 4 || reduceOnly) return 'close';
  return 'trade';
}

function perplSideFromOrderType(t, rawSize = 0, reduceOnly = false) {
  const n = Number(t);
  const isClose = n === 3 || n === 4 || reduceOnly;
  const isLong = n === 1 || n === 3 || (n !== 2 && n !== 4 && Number(rawSize) > 0);
  if (isClose) return isLong ? 'close_long' : 'close_short';
  return isLong ? 'long' : 'short';
}

function perplNumericId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function normalizePerplFill(fill, markets) {
  const marketId = Number(fill?.mkt ?? fill?.market_id ?? fill?.market);
  const market = markets[marketId] || PERPL_MARKETS_FALLBACK[marketId];
  if (!market) return null;
  const price = Number(fill?.p ?? fill?.price ?? 0) / 10 ** Number(market.price_decimals || 1);
  const rawSize = Number(fill?.s ?? fill?.size ?? fill?.fs ?? 0);
  const amount = Math.abs(rawSize) / 10 ** Number(market.size_decimals || 5);
  const sideType = Number(fill?.t ?? fill?.type ?? fill?.ot);
  const isClose = sideType === 3 || sideType === 4 || fill?.ro === true || fill?.reduce_only === true;
  const side = perplSideFromOrderType(sideType, rawSize, isClose);
  const notional = price * amount;
  if (!Number.isFinite(notional) || notional <= 0 || notional > 10_000_000) return null;
  const orderId = perplNumericId(fill?.oid ?? fill?.order_id);
  const id = String(orderId ?? fill?.fid ?? fill?.id ?? fill?.rq ?? `${marketId}:${rawSize}:${fill?.p}:${fill?.at?.t || ''}`);
  const fee = Number(fill?.f ?? fill?.fee ?? 0) / 1e6;
  const pnl = fill?.pnl ?? fill?.realized_pnl;
  return {
    symbol: market.symbol,
    side,
    orderType: perplOrderTypeLabel(sideType, isClose),
    amount: String(amount),
    price: String(price),
    orderId,
    clientOrderId: `perpl:${id}`,
    status: 'filled',
    dex: 'monad',
    notional_usd: notional,
    verifiedSource: 'perpl_api',
    pnl: Number.isFinite(Number(pnl)) ? String(Number(pnl) / 1e6) : null,
    fee,
    createdAt: perplFillTime(fill),
  };
}

// ---------- Auth Middleware ----------
// Validates x-token by reading the main game server's SQLite DB directly.
// Both services run on the same host so cross-SQLite-file reads are cheap
// and avoid an HTTP round-trip per futures request. Read-only, no writes.
const Database = require('better-sqlite3');

const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');
let mainDb = null;
let playerByTokenStmt = null;
function ensureMainDb() {
  if (mainDb) return;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
    // Also pull the player's saved DEX — used to reject client-header spoof.
    playerByTokenStmt = mainDb.prepare('SELECT id, name, wallet, dex FROM players WHERE token = ?');
  } catch (e) {
    console.error('[futures] Failed to open main DB at', MAIN_DB_PATH, e.message);
  }
}

function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Missing x-token header' });
  ensureMainDb();
  if (!mainDb) return res.status(503).json({ error: 'Auth DB unavailable' });
  let player = null;
  try { player = playerByTokenStmt.get(token); } catch (e) { /* swallow */ }
  if (!player) return res.status(401).json({ error: 'Invalid token' });
  req.playerId = player.id;
  req.playerName = player.name;
  req.playerWallet = player.wallet;

  // Trust the SERVER-stored dex, not whatever the client asks for. The client
  // header/query is still useful as a best-effort sanity check: if it explicitly
  // asks for the wrong dex, reject so the UI can prompt the user to /set-dex.
  const SUPPORTED_DEXES = new Set(['avantis', 'pacifica', 'decibel', 'gmx', 'monad', 'phoenix', 'hyperliquid', 'risex', 'nado', 'hibachi', 'hotstuff', 'grvt']);
  const storedDex = SUPPORTED_DEXES.has(player.dex) ? player.dex : 'pacifica';
  const askedDex = (req.query.dex || req.headers['x-dex'] || storedDex).toLowerCase();
  const normalizedAsked = SUPPORTED_DEXES.has(askedDex) ? askedDex : 'pacifica';
  if (normalizedAsked !== storedDex) {
    return res.status(409).json({
      error: `Account is registered for '${storedDex}'. Switch DEX in your profile before calling ${normalizedAsked} endpoints.`,
      stored_dex: storedDex,
      requested_dex: normalizedAsked,
    });
  }
  req.dex = storedDex;
  next();
}

// ==================== WALLET ====================

// Get or create custodial wallet for player
router.post('/wallet', auth, (req, res) => {
  try {
    if (req.dex === 'avantis' || req.dex === 'gmx' || req.dex === 'monad' || req.dex === 'phoenix' || req.dex === 'hyperliquid' || req.dex === 'risex' || req.dex === 'nado' || req.dex === 'hibachi' || req.dex === 'hotstuff' || req.dex === 'grvt') {
      return res.status(410).json({
        error: `${req.dex} is self-custody. Connect the chain wallet in the client instead.`,
      });
    }
    const isAvantis = req.dex === 'avantis';
    const generateFn = isAvantis ? avantis.generateWallet : pacifica.generateWallet;
    const chain = isAvantis ? 'base' : 'solana';

    const { wallet, created } = db.getOrCreateWallet(
      req.playerId,
      req.playerName,
      generateFn,
      req.dex,
      chain
    );
    res.json({
      public_key: wallet.public_key,
      dex: req.dex,
      chain: wallet.chain,
      created,
    });
  } catch (e) {
    console.error('Wallet creation error:', e);
    res.status(500).json({ error: 'Failed to create wallet' });
  }
});

// Get wallet info (public key only — never expose secret)
router.get('/wallet', auth, (req, res) => {
  if (req.dex === 'avantis' || req.dex === 'gmx' || req.dex === 'monad' || req.dex === 'phoenix' || req.dex === 'hyperliquid' || req.dex === 'risex' || req.dex === 'nado' || req.dex === 'hibachi' || req.dex === 'hotstuff' || req.dex === 'grvt') {
    return res.status(410).json({
      error: `${req.dex} is self-custody. Connect the chain wallet in the client instead.`,
    });
  }
  const wallet = db.getWallet(req.playerId, req.dex);
  if (!wallet) return res.status(404).json({ error: 'No wallet found. Call POST /wallet first.' });
  res.json({ public_key: wallet.public_key, dex: req.dex, chain: wallet.chain });
});

// ==================== ACCOUNT INFO ====================

// Get account info (balance, equity, etc.)
// Avantis is now non-custodial: the client passes ?address=<user's wallet>
// and we proxy Avantis Core API by that address (public data). Pacifica
// remains custodial → uses token auth to look up the server-held keypair.
router.get('/account', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    if (dex === 'avantis') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required (0x...)' });
      }
      const info = await avantis.getAccountInfoByAddress(address);
      return res.json(info);
    }
    if (dex === 'gmx') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required (0x...)' });
      }
      const info = await gmx.getAccountByAddress(address);
      return res.json(info);
    }
    if (dex === 'hyperliquid') {
      const address = String(req.query.address || '').trim();
      if (!hyperliquid.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required (0x...)' });
      }
      const info = await hyperliquid.getAccountByAddress(address);
      return res.json(info);
    }
    if (dex === 'risex') {
      const address = String(req.query.address || '').trim();
      if (!risex.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required (0x...)' });
      }
      const info = await risex.getAccountByAddress(address);
      return res.json(info);
    }
    if (dex === 'nado') {
      const address = String(req.query.address || '').trim();
      if (!nado.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required (0x...)' });
      }
      const info = await nado.getAccountByAddress(address);
      return res.json(info);
    }
    if (dex === 'hotstuff') {
      const address = String(req.query.address || '').trim();
      if (!hotstuff.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required (0x...)' });
      }
      const info = await hotstuff.getAccountByAddress(address);
      return res.json(info);
    }
    // Pacifica (custodial) — keep legacy auth-gated flow.
    return authGate(req, res, async () => {
      const wallet = db.getWallet(req.playerId, 'pacifica');
      if (!wallet) return res.status(404).json({ error: 'No wallet' });
      const info = await pacifica.getAccountInfo(wallet.secret_key);
      res.json(info);
    });
  } catch (e) {
    console.error('Account info error:', e);
    res.status(500).json({ error: 'Failed to get account info' });
  }
});

// Gate helper so we can run `auth` middleware inline for Pacifica-only paths
// without turning this whole handler into middleware spaghetti.
function authGate(req, res, next) {
  return auth(req, res, (err) => { if (err) return; next(); });
}

function normalizeAptosAddress(addr) {
  return decibel.normalizeAptosAddress(addr);
}

function ensureDecibel(req, res) {
  if (req.dex !== 'decibel') {
    res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to decibel before calling Decibel endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'decibel',
    });
    return false;
  }
  return true;
}

async function requireDecibelOwnerAndSubaccount(req, res) {
  if (!ensureDecibel(req, res)) return null;
  const owner = normalizeAptosAddress(req.body?.owner || req.query?.owner || req.playerWallet);
  const playerWallet = normalizeAptosAddress(req.playerWallet);
  if (!owner || !playerWallet || owner !== playerWallet) {
    res.status(403).json({ error: 'owner must match the wallet registered to this game account' });
    return null;
  }
  const subaccount = normalizeAptosAddress(
    req.body?.subaccountAddr || req.body?.subaccount || req.query?.subaccountAddr || req.query?.subaccount
  );
  if (!subaccount) {
    res.status(400).json({ error: 'subaccountAddr required' });
    return null;
  }
  const primary = normalizeAptosAddress(await decibel.getPrimarySubaccountAddr(owner));
  if (subaccount !== primary) {
    res.status(400).json({ error: 'subaccountAddr does not match the registered wallet primary Decibel subaccount' });
    return null;
  }
  return { owner, subaccount };
}

function requireDecibelBuilderFee(req, res) {
  const builderAddr = normalizeAptosAddress(req.body?.builderAddr);
  const builderFee = Number(req.body?.builderFee);
  if (!builderAddr) {
    res.status(400).json({ error: 'builderAddr required for Decibel order fee routing' });
    return null;
  }
  if (!Number.isFinite(builderFee) || builderFee !== DECIBEL_BUILDER_FEE_BPS) {
    res.status(400).json({ error: `builderFee must be ${DECIBEL_BUILDER_FEE_BPS} bps` });
    return null;
  }
  if (DECIBEL_ALLOWED_BUILDER_ADDRS.size > 0 && !DECIBEL_ALLOWED_BUILDER_ADDRS.has(builderAddr)) {
    res.status(400).json({ error: 'builderAddr is not an approved Clash builder subaccount' });
    return null;
  }
  return { builderAddr, builderFee: DECIBEL_BUILDER_FEE_BPS };
}

function decibelFieldString(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object') {
      if (Array.isArray(value.vec) && value.vec.length) return String(value.vec[0]);
      if (value.value !== undefined && value.value !== null) return String(value.value);
      if (value.inner !== undefined && value.inner !== null) return String(value.inner);
      continue;
    }
    return String(value);
  }
  return '';
}

function decibelFillSymbol(fill, fallback = '') {
  const direct = decibelFieldString(fill, ['marketName', 'market_name', 'symbol']);
  if (direct) return (direct.split(/[-/]/)[0] || direct).toUpperCase();
  return String(fallback || decibel.symbolFromMarket(fill) || 'UNKNOWN').toUpperCase();
}

function decibelFillSide(fill, fallback = '') {
  const action = decibelFieldString(fill, ['action', 'trade_action', 'order_action']).toLowerCase();
  if (action.includes('closeshort') || (action.includes('close') && action.includes('short'))) return 'close_short';
  if (action.includes('closelong') || (action.includes('close') && action.includes('long'))) return 'close_long';
  if (action.includes('openshort') || (action.includes('open') && action.includes('short'))) return 'short';
  if (action.includes('openlong') || (action.includes('open') && action.includes('long'))) return 'long';
  const side = decibelFieldString(fill, ['side', 'order_side', 'direction', 'order_direction']).toLowerCase();
  if (side.includes('short') || side.includes('sell') || side.includes('ask')) return 'short';
  if (side.includes('long') || side.includes('buy') || side.includes('bid')) return 'long';
  return fallback || (Number(fill?.size ?? 0) < 0 ? 'short' : 'long');
}

function decibelFillNotional(fill) {
  const price = Number(fill?.price ?? fill?.fill_price ?? fill?.avg_price ?? 0);
  const size = Math.abs(Number(fill?.size ?? fill?.filled_size ?? fill?.base_size ?? 0));
  return Number.isFinite(price) && Number.isFinite(size) ? price * size : 0;
}

function decibelFillPnl(fill) {
  const raw = Number(fill?.realized_pnl_amount ?? fill?.realized_pnl ?? fill?.realised_pnl ?? fill?.pnl);
  return Number.isFinite(raw) ? raw : null;
}

async function fetchDecibelFillsForOrder(subaccount, orderPayload, txResult, attempts = 12) {
  const clientOrderId = String(orderPayload?.clientOrderId || '').toLowerCase();
  const resultOrderId = String(txResult?.orderId || txResult?.order_id || '').toLowerCase();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = await decibel.fetchTradeHistory(subaccount, { limit: 100, sortDir: 'DESC' });
    const matches = (Array.isArray(rows) ? rows : []).filter((fill) => {
      const fillClientId = decibelFieldString(fill, ['client_order_id', 'clientOrderId', 'clientOrderID']).toLowerCase();
      const fillOrderId = decibelFieldString(fill, ['order_id', 'orderId', 'orderID']).toLowerCase();
      return (clientOrderId && fillClientId === clientOrderId)
        || (resultOrderId && fillOrderId === resultOrderId);
    });
    if (matches.length) return matches;
    await new Promise(resolve => setTimeout(resolve, 750 + attempt * 350));
  }
  return [];
}

async function recordDecibelActualFills(playerId, subaccount, orderPayload, txResult, orderType, sideFallback) {
  const fills = await fetchDecibelFillsForOrder(subaccount, orderPayload, txResult);
  if (!fills.length) return { inserted: 0, rows: 0, volume_usd: 0, reason: 'no_actual_fills' };

  const grouped = new Map();
  for (const fill of fills) {
    const notional = decibelFillNotional(fill);
    if (!Number.isFinite(notional) || notional < DECIBEL_MIN_RECORDED_NOTIONAL_USD) continue;
    const side = decibelFillSide(fill, sideFallback);
    const key = side;
    const current = grouped.get(key) || {
      fills: [],
      side,
      symbol: decibelFillSymbol(fill, orderPayload?.symbol),
      amount: 0,
      notional: 0,
      weightedPrice: 0,
      fee: 0,
      pnl: 0,
      hasPnl: false,
    };
    const size = Math.abs(Number(fill?.size ?? fill?.filled_size ?? fill?.base_size ?? 0));
    const price = Number(fill?.price ?? fill?.fill_price ?? fill?.avg_price ?? 0);
    current.amount += Number.isFinite(size) ? size : 0;
    current.notional += notional;
    current.weightedPrice += Number.isFinite(price) && Number.isFinite(size) ? price * size : 0;
    const fee = Number(fill?.fee_amount ?? fill?.fee ?? 0);
    if (Number.isFinite(fee)) current.fee += fee;
    const pnl = decibelFillPnl(fill);
    if (pnl != null) {
      current.pnl += pnl;
      current.hasPnl = true;
    }
    current.fills.push(fill);
    grouped.set(key, current);
  }

  let inserted = 0;
  let volume = 0;
  for (const row of grouped.values()) {
    if (row.notional > DECIBEL_MAX_REWARD_NOTIONAL_USD) {
      console.log(`[decibel] actual fill row skipped: notional ${row.notional.toFixed(6)} outside recorded range`);
      continue;
    }
    const avgPrice = row.amount > 0 ? row.weightedPrice / row.amount : 0;
    const clientOrderId = `decibel:fill:${orderPayload.clientOrderId}:${row.side}`;
    const info = db.addTrade(playerId, {
      symbol: row.symbol,
      side: row.side,
      orderType: String(row.side || '').startsWith('close_') ? 'close' : orderType,
      amount: String(row.amount),
      price: Number.isFinite(avgPrice) && avgPrice > 0 ? String(avgPrice) : null,
      orderId: txResult?.transactionHash || txResult?.hash || txResult?.orderId || null,
      clientOrderId,
      status: 'filled',
      dex: 'decibel',
      notional_usd: row.notional,
      verifiedSource: 'decibel_fill',
      pnl: row.hasPnl ? row.pnl : null,
      fee: row.fee,
      proofJson: JSON.stringify({
        source: 'decibel_trade_history',
        builder: orderPayload.builderAddr,
        builder_fee_bps: orderPayload.builderFee,
        subaccount,
        original_client_order_id: orderPayload.clientOrderId,
        transaction_hash: txResult?.transactionHash || txResult?.hash || null,
        fill_count: row.fills.length,
        fills: row.fills,
      }),
    });
    inserted += info.changes || 0;
    volume += row.notional;
  }
  return { inserted, rows: grouped.size, volume_usd: volume };
}

function decibelRoundToTick(price, tickSize) {
  const p = Number(price);
  const t = Number(tickSize);
  if (!Number.isFinite(p)) return p;
  if (!Number.isFinite(t) || t <= 0) return Math.max(1, Math.round(p));
  if (Number.isSafeInteger(p) && Number.isSafeInteger(t)) {
    return Math.max(t, Number((BigInt(p) / BigInt(t)) * BigInt(t)));
  }
  return Math.max(t, Math.floor(p / t) * t);
}

function decibelBufferedTpslLimit(triggerPrice, tickSize, isLong, kind = 'tp') {
  const tick = Math.max(1, Number(tickSize) || 1);
  const trigger = decibelRoundToTick(triggerPrice, tick);
  const isStopLoss = kind === 'sl';
  const bufferBps = isStopLoss ? DECIBEL_SL_LIMIT_BUFFER_BPS : DECIBEL_TP_LIMIT_BUFFER_BPS;
  const minTicks = isStopLoss ? DECIBEL_SL_MIN_LIMIT_TICKS : DECIBEL_TP_MIN_LIMIT_TICKS;
  const pctBuffer = Math.ceil(trigger * bufferBps / 10000);
  const minBuffer = tick * minTicks;
  const buffer = Math.max(minBuffer, pctBuffer);
  return decibelRoundToTick(isLong ? trigger - buffer : trigger + buffer, tick);
}

function decibelSameAddress(a, b) {
  const aa = normalizeAptosAddress(a);
  const bb = normalizeAptosAddress(b);
  return aa && bb && aa === bb;
}

function decibelMarketSizeToChainUnits(sizeHuman, market) {
  const n = Math.abs(Number(sizeHuman));
  if (!Number.isFinite(n) || n <= 0) return null;
  const decimals = Number(market?.sz_decimals ?? market?.szDecimals ?? 6);
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18) return null;
  let raw = BigInt(Math.round(n * Math.pow(10, decimals)));
  const lot = market?.lot_size ?? market?.lotSize;
  if (lot != null) {
    const lotN = BigInt(Math.max(0, Math.round(Number(lot))));
    if (lotN > 0n) raw = (raw / lotN) * lotN;
  }
  const min = market?.min_size ?? market?.minSize;
  if (min != null) {
    const minN = BigInt(Math.max(0, Math.round(Number(min))));
    if (minN > 0n && raw < minN) return null;
  }
  return raw > 0n ? raw : null;
}

function findDecibelMarketByAddress(markets, marketAddr) {
  return (Array.isArray(markets) ? markets : []).find(m => (
    decibelSameAddress(m?.market_addr || m?.marketAddr || m?.market, marketAddr)
  )) || null;
}

async function sanitizeDecibelTpslBody(body, subaccountAddr) {
  const next = { ...(body || {}) };
  const marketAddr = next.marketAddr || next.market_addr;
  if (!marketAddr) return next;
  let positions = [];
  try {
    positions = await decibel.fetchAccountPositions(subaccountAddr);
  } catch {
    return next;
  }
  const position = positions.find(p => decibelSameAddress(p?.market || p?.market_addr, marketAddr));
  const size = Number(position?.size);
  if (!position || !Number.isFinite(size) || size === 0) return next;
  const isLong = size > 0;
  const tickSize = next.tickSize ?? next.tick_size ?? 1;
  if (next.fullPosition !== false) {
    try {
      const markets = await decibel.fetchMarkets();
      const market = findDecibelMarketByAddress(markets, marketAddr) || {
        sz_decimals: next.szDecimals ?? next.sz_decimals,
        lot_size: next.lotSize ?? next.lot_size,
        min_size: next.minSize ?? next.min_size,
      };
      const currentSize = decibelMarketSizeToChainUnits(size, market);
      if (currentSize != null) {
        if (next.tpTriggerPrice != null || next.tpLimitPrice != null || next.tpSize != null) {
          next.tpSize = currentSize;
        }
        if (next.slTriggerPrice != null || next.slLimitPrice != null || next.slSize != null) {
          next.slSize = currentSize;
        }
      }
    } catch {}
  }
  if (next.tpTriggerPrice != null) {
    const trigger = Number(next.tpTriggerPrice);
    if (Number.isFinite(trigger)) {
      next.tpLimitPrice = decibelBufferedTpslLimit(trigger, tickSize, isLong, 'tp');
    }
  }
  if (next.slTriggerPrice != null) {
    const trigger = Number(next.slTriggerPrice);
    if (Number.isFinite(trigger)) {
      next.slLimitPrice = decibelBufferedTpslLimit(trigger, tickSize, isLong, 'sl');
    }
  }
  return next;
}

// ==================== DECIBEL SERVER-SIDE SIGNER ====================

router.get('/decibel/signer', auth, async (req, res) => {
  try {
    if (!ensureDecibel(req, res)) return;
    const info = await decibel.getServerSignerInfo();
    res.json(info);
  } catch (e) {
    console.error('[decibel] signer error:', e);
    res.status(500).json({ error: e.message || 'Decibel server signer unavailable' });
  }
});

router.get('/decibel/positions', auth, async (req, res) => {
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const positions = await decibel.fetchAccountPositions(verified.subaccount);
    res.json(positions);
  } catch (e) {
    console.error('[decibel] positions read error:', e);
    res.status(500).json({ error: e.message || 'Failed to read Decibel positions' });
  }
});

router.get('/decibel/orders', auth, async (req, res) => {
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 50)));
    const orders = await decibel.fetchOpenOrders(verified.subaccount, { limit });
    res.json(orders);
  } catch (e) {
    console.error('[decibel] open orders read error:', e);
    res.status(500).json({ error: e.message || 'Failed to read Decibel open orders' });
  }
});

router.post('/decibel/orders/place', auth, async (req, res) => {
  const startedAt = Date.now();
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const builder = requireDecibelBuilderFee(req, res);
    if (!builder) return;
    const clientOrderId = decibel.normalizeClientOrderId(req.body?.clientOrderId)
      || decibel.newClientOrderId();
    const orderPayload = {
      ...req.body,
      ...builder,
      clientOrderId,
      subaccountAddr: verified.subaccount,
    };
    const result = await decibel.placeOrder(orderPayload);
    if (result?.success === false) {
      return res.status(400).json({ ...result, clientOrderId: orderPayload.clientOrderId });
    }
    const rawTif = String(orderPayload.timeInForce ?? orderPayload.time_in_force ?? '').toLowerCase();
    const orderType = String(orderPayload.order_type || orderPayload.orderType || '').toLowerCase() === 'market'
      || rawTif === 'ioc'
      || rawTif === '2'
      ? 'market'
      : 'limit';
    const side = orderPayload.isReduceOnly
      ? (orderPayload.isBuy ? 'short' : 'long')
      : (orderPayload.isBuy ? 'long' : 'short');
    const verification = await decibel.waitForPlacedOrderEffect({
      subaccountAddr: verified.subaccount,
      marketName: orderPayload.marketName,
      marketAddr: orderPayload.marketAddr || orderPayload.market_addr,
      symbol: orderPayload.symbol,
      side,
      clientOrderId: orderPayload.clientOrderId,
      orderType,
      reduceOnly: !!orderPayload.isReduceOnly,
      txResult: result,
      attempts: 6,
      delayMs: 900,
    });
    if (!verification.verified) {
      return res.status(409).json({
        success: false,
        error: verification.reason || 'Decibel order was submitted, but no matching position or open order was verified.',
        clientOrderId: orderPayload.clientOrderId,
        transactionHash: result.transactionHash || result.hash || null,
        result,
        verification,
      });
    }
    console.log('[decibel] order placed', {
      player: req.playerId,
      market: orderPayload.marketName,
      reduceOnly: !!orderPayload.isReduceOnly,
      orderType,
      verification: verification.effect,
      verifyAttempts: verification.attempts,
      total_ms: Date.now() - startedAt,
      tx_ms: result?.timings?.total_ms,
      tx_wait_ms: result?.timings?.wait_ms,
    });
    let fillRecord = { inserted: 0, rows: 0, volume_usd: 0 };
    const shouldRecordImmediateFills = result?.success !== false
      && verification.effect !== 'open_order'
      && verification.effect !== 'tx_event_open_order';
    if (shouldRecordImmediateFills) {
      fillRecord = { inserted: 0, rows: 0, volume_usd: 0, reason: 'queued_actual_fill_import' };
      setTimeout(() => {
        recordDecibelActualFills(
          req.playerId,
          verified.subaccount,
          orderPayload,
          result,
          orderType,
          side,
        ).then((recorded) => {
          if (!recorded?.inserted && recorded?.reason) {
            console.log(`[decibel] actual fill row skipped: ${recorded.reason} client=${orderPayload.clientOrderId}`);
          }
        }).catch((e) => {
          console.warn('[decibel] actual fill row skipped:', e.message);
        });
      }, 0);
    } else if (result?.success !== false) {
      fillRecord = { inserted: 0, rows: 0, volume_usd: 0, reason: 'open_order_waiting_for_fill' };
    }
    res.json({ ...result, clientOrderId: orderPayload.clientOrderId, verified: true, verification, fillRecord });
  } catch (e) {
    console.error('[decibel] place order error:', e);
    res.status(500).json({ error: e.message || 'Failed to place Decibel order' });
  }
});

router.post('/decibel/orders/cancel', auth, async (req, res) => {
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const result = await decibel.cancelOrder({
      ...req.body,
      subaccountAddr: verified.subaccount,
    });
    if (result?.success === false) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('[decibel] cancel order error:', e);
    res.status(500).json({ error: e.message || 'Failed to cancel Decibel order' });
  }
});

router.post('/decibel/tpsl', auth, async (req, res) => {
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const body = await sanitizeDecibelTpslBody(req.body || {}, verified.subaccount);
    const hasTp = body.tpTriggerPrice != null || body.tpLimitPrice != null || body.tpSize != null;
    const hasSl = body.slTriggerPrice != null || body.slLimitPrice != null || body.slSize != null;
    const tpOrderId = body.tpOrderId || body.tp_order_id;
    const slOrderId = body.slOrderId || body.sl_order_id;
    const base = {
      ...body,
      subaccountAddr: verified.subaccount,
    };
    const results = [];
    if (hasTp && tpOrderId) {
      results.push({
        leg: 'tp',
        ...(await decibel.updateTpOrderForPosition({
          ...base,
          prevOrderId: tpOrderId,
        })),
      });
    }
    if (hasSl && slOrderId) {
      results.push({
        leg: 'sl',
        ...(await decibel.updateSlOrderForPosition({
          ...base,
          prevOrderId: slOrderId,
        })),
      });
    }
    const placePayload = {
      ...base,
      ...(hasTp && !tpOrderId ? {
        tpTriggerPrice: body.tpTriggerPrice,
        tpLimitPrice: body.tpLimitPrice,
        tpSize: body.tpSize,
      } : {
        tpTriggerPrice: undefined,
        tpLimitPrice: undefined,
        tpSize: undefined,
      }),
      ...(hasSl && !slOrderId ? {
        slTriggerPrice: body.slTriggerPrice,
        slLimitPrice: body.slLimitPrice,
        slSize: body.slSize,
      } : {
        slTriggerPrice: undefined,
        slLimitPrice: undefined,
        slSize: undefined,
      }),
    };
    if ((hasTp && !tpOrderId) || (hasSl && !slOrderId)) {
      results.push({
        leg: hasTp && !tpOrderId && hasSl && !slOrderId ? 'tp_sl' : (hasTp && !tpOrderId ? 'tp' : 'sl'),
        ...(await decibel.placeTpSlOrderForPosition(placePayload)),
      });
    }
    const failed = results.find(r => r?.success === false);
    if (failed) return res.status(400).json({ success: false, results, error: failed.error || 'Decibel TP/SL failed' });
    const hashes = results.map(r => r.transactionHash || r.hash).filter(Boolean);
    res.json({
      success: true,
      results,
      transactionHash: hashes[hashes.length - 1] || null,
      hash: hashes[hashes.length - 1] || null,
    });
  } catch (e) {
    console.error('[decibel] TP/SL error:', e);
    res.status(500).json({ error: e.message || 'Failed to update Decibel TP/SL' });
  }
});

router.post('/decibel/leverage', auth, async (req, res) => {
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const result = await decibel.configureUserSettingsForMarket({
      ...req.body,
      subaccountAddr: verified.subaccount,
    });
    if (result?.success === false) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('[decibel] leverage error:', e);
    res.status(500).json({ error: e.message || 'Failed to update Decibel leverage' });
  }
});

// ==================== MARKET DATA ====================

router.get('/markets', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    const info = dex === 'avantis' ? await avantis.getMarketInfo()
      : dex === 'gmx' ? await gmx.getMarketInfo()
      : dex === 'hyperliquid' ? await hyperliquid.getMarketInfo()
      : dex === 'risex' ? await risex.getMarketInfo()
      : dex === 'nado' ? await nado.getMarketInfo()
      : dex === 'hibachi' ? await hibachi.getMarketInfo()
      : dex === 'hotstuff' ? await hotstuff.getMarketInfo()
      : dex === 'grvt' ? await grvt.getMarketInfo()
      : await pacifica.getMarketInfo();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get market info' });
  }
});

router.get('/prices', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    const prices = dex === 'avantis' ? await avantis.getPrices()
      : dex === 'gmx' ? await gmx.getPrices()
      : dex === 'hyperliquid' ? await hyperliquid.getPrices()
      : dex === 'risex' ? await risex.getPrices()
      : dex === 'nado' ? await nado.getPrices()
      : dex === 'hibachi' ? await hibachi.getPrices()
      : dex === 'hotstuff' ? await hotstuff.getPrices()
      : dex === 'grvt' ? await grvt.getPrices()
      : await pacifica.getPrices();
    res.json(prices);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get prices' });
  }
});

router.get('/orderbook', async (req, res) => {
  const { symbol, agg_level } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const book = await pacifica.getOrderbook(symbol, agg_level);
    res.json(book);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get orderbook' });
  }
});

router.get('/candles', async (req, res) => {
  const { symbol, interval, start_time, end_time } = req.query;
  if (!symbol || !interval || !start_time) {
    return res.status(400).json({ error: 'symbol, interval, start_time required' });
  }
  try {
    const candles = await pacifica.getCandles(symbol, interval, start_time, end_time);
    res.json(candles);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get candles' });
  }
});

router.get('/pyth/history', async (req, res) => {
  let query;
  try {
    query = normalizePythHistoryQuery(req.query);
  } catch (e) {
    return res.status(400).json({ s: 'error', error: e.message });
  }

  const key = `${query.symbol}|${query.resolution}|${query.from}|${query.to}`;
  const now = Date.now();
  const cached = pythHistoryCache.get(key);
  if (cached && now - cached.at < PYTH_HISTORY_CACHE_TTL_MS) {
    res.set('Cache-Control', 'public, max-age=15');
    res.set('X-Pyth-Cache', 'hit');
    return res.json(cached.data);
  }

  try {
    let pending = pythHistoryInflight.get(key);
    if (!pending) {
      pending = fetchPythHistory(query).finally(() => {
        pythHistoryInflight.delete(key);
      });
      pythHistoryInflight.set(key, pending);
    }
    const data = await pending;
    pythHistoryCache.set(key, { at: now, data });
    if (pythHistoryCache.size > 500) {
      const cutoff = Date.now() - PYTH_HISTORY_STALE_MS;
      for (const [cacheKey, value] of pythHistoryCache) {
        if (value.at < cutoff) pythHistoryCache.delete(cacheKey);
      }
    }
    res.set('Cache-Control', 'public, max-age=15');
    res.set('X-Pyth-Cache', cached ? 'refresh' : 'miss');
    return res.json(data);
  } catch (e) {
    if (cached && now - cached.at < PYTH_HISTORY_STALE_MS) {
      console.warn('[pyth/history] upstream failed, serving stale:', e.message);
      res.set('Cache-Control', 'public, max-age=5');
      res.set('X-Pyth-Cache', 'stale');
      return res.json(cached.data);
    }
    console.warn('[pyth/history] failed:', e.message);
    const data = {
      s: 'error',
      error: 'Failed to load Pyth history',
      errmsg: e.message,
    };
    pythHistoryCache.set(key, { at: now, data });
    res.set('Cache-Control', 'public, max-age=10');
    res.set('X-Pyth-Cache', 'error');
    if (e.status === 429) res.set('Retry-After', '10');
    return res.json(data);
  }
});

router.all(/^\/phoenix\/api\/(.+)$/, async (req, res) => {
  const suffix = req.params?.[0] || '';
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return handlePhoenixApiProxy(req, res, `/${suffix}${query}`);
});

router.get('/trades', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const trades = await pacifica.getRecentTrades(symbol);
    res.json(trades);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get trades' });
  }
});

// ==================== POSITIONS ====================

router.get('/positions', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    if (dex === 'avantis') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const positions = await avantis.getPositionsByAddress(address);
      return res.json(positions);
    }
    if (dex === 'gmx') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const positions = await gmx.getPositionsByAddress(address);
      return res.json(positions);
    }
    if (dex === 'hyperliquid') {
      const address = String(req.query.address || '').trim();
      if (!hyperliquid.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const positions = await hyperliquid.getPositionsByAddress(address);
      return res.json(positions);
    }
    if (dex === 'risex') {
      const address = String(req.query.address || '').trim();
      if (!risex.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const positions = await risex.getPositionsByAddress(address);
      return res.json(positions);
    }
    if (dex === 'nado') {
      const address = String(req.query.address || '').trim();
      if (!nado.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const positions = await nado.getPositionsByAddress(address);
      return res.json(positions);
    }
    if (dex === 'hotstuff') {
      const address = String(req.query.address || '').trim();
      if (!hotstuff.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const positions = await hotstuff.getPositionsByAddress(address);
      return res.json(positions);
    }
    if (dex === 'grvt') {
      return res.status(400).json({ error: 'GRVT positions require /grvt/positions with session credentials' });
    }
    return authGate(req, res, async () => {
      const wallet = db.getWallet(req.playerId, 'pacifica');
      if (!wallet) return res.status(404).json({ error: 'No wallet' });
      const positions = await pacifica.getPositions(wallet.secret_key);
      res.json(positions);
    });
  } catch (e) {
    console.error('Positions error:', e);
    res.status(500).json({ error: 'Failed to get positions' });
  }
});

// ==================== ORDERS ====================

router.get('/orders', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    if (dex === 'avantis') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const orders = await avantis.getOpenOrdersByAddress(address);
      return res.json(orders);
    }
    if (dex === 'gmx') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const orders = await gmx.getOrdersByAddress(address);
      return res.json(orders);
    }
    if (dex === 'hyperliquid') {
      const address = String(req.query.address || '').trim();
      if (!hyperliquid.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const orders = await hyperliquid.getOrdersByAddress(address);
      return res.json(orders);
    }
    if (dex === 'risex') {
      const address = String(req.query.address || '').trim();
      if (!risex.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const orders = await risex.getOrdersByAddress(address);
      return res.json(orders);
    }
    if (dex === 'nado') {
      const address = String(req.query.address || '').trim();
      if (!nado.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const orders = await nado.getOrdersByAddress(address);
      return res.json(orders);
    }
    if (dex === 'hotstuff') {
      const address = String(req.query.address || '').trim();
      if (!hotstuff.isEvmAddress(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const orders = await hotstuff.getOrdersByAddress(address);
      return res.json(orders);
    }
    if (dex === 'grvt') {
      return res.status(400).json({ error: 'GRVT orders require /grvt/orders with session credentials' });
    }
    return authGate(req, res, async () => {
      const wallet = db.getWallet(req.playerId, 'pacifica');
      if (!wallet) return res.status(404).json({ error: 'No wallet' });
      const orders = await pacifica.getOpenOrders(wallet.secret_key);
      res.json(orders);
    });
  } catch (e) {
    console.error('Orders error:', e);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Reject self-custody writes on legacy Pacifica server endpoints. These
// venues sign in the browser or use their dedicated route groups.
const CLIENT_SIGNED_DEXES = new Set(['avantis', 'decibel', 'gmx', 'monad', 'phoenix', 'hyperliquid', 'risex', 'nado', 'hibachi', 'hotstuff', 'grvt']);

function avantisMigratedGuard(req, res, next) {
  if (CLIENT_SIGNED_DEXES.has(req.dex)) {
    return res.status(410).json({
      error: `${req.dex} is self-custody. Update your client - trades are signed in the user wallet.`,
      migrated: true,
    });
  }
  next();
}

// Create market order (LONG/SHORT) — Pacifica only; Avantis returns 410.
router.post('/orders/market', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, side, amount, slippage_percent, reduce_only } = req.body;
    if (!symbol || !side || !amount) {
      return res.status(400).json({ error: 'symbol, side, amount required' });
    }

    const clientOrderId = uuidv4();
    const result = await pacifica.createMarketOrder(wallet.secret_key, {
      symbol, side, amount,
      slippagePercent: slippage_percent || '0.5',
      reduceOnly: reduce_only || false,
      clientOrderId,
    });

    db.addTrade(req.playerId, {
      symbol, side, orderType: 'market',
      amount: String(amount),
      orderId: result.order_id || result.tx_hash,
      clientOrderId,
      status: result.error ? 'failed' : 'filled',
      dex: 'pacifica',
      notional_usd: Number(amount),
    });

    res.json(result);
  } catch (e) {
    console.error('Market order error:', e);
    res.status(500).json({ error: e.message || 'Failed to create market order' });
  }
});

// Create limit order — Pacifica only; Avantis returns 410.
router.post('/orders/limit', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, side, price, amount, tif, reduce_only } = req.body;
    if (!symbol || !side || !price || !amount) {
      return res.status(400).json({ error: 'symbol, side, price, amount required' });
    }

    const clientOrderId = uuidv4();
    const result = await pacifica.createLimitOrder(wallet.secret_key, {
      symbol, side, price, amount,
      tif: tif || 'GTC',
      reduceOnly: reduce_only || false,
      clientOrderId,
    });

    db.addTrade(req.playerId, {
      symbol, side, orderType: 'limit',
      amount: String(amount),
      price: String(price),
      orderId: result.order_id || result.tx_hash,
      clientOrderId,
      status: result.error ? 'failed' : 'open',
      dex: 'pacifica',
      notional_usd: Number(amount),
    });

    res.json(result);
  } catch (e) {
    console.error('Limit order error:', e);
    res.status(500).json({ error: e.message || 'Failed to create limit order' });
  }
});

// Cancel order — Pacifica only; Avantis cancels client-side.
router.post('/orders/cancel', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, 'pacifica');
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, order_id, client_order_id } = req.body;
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    if (!order_id && !client_order_id) return res.status(400).json({ error: 'order_id or client_order_id required' });
    const result = await pacifica.cancelOrder(wallet.secret_key, {
      symbol,
      orderId: order_id,
      clientOrderId: client_order_id,
    });

    res.json(result);
  } catch (e) {
    console.error('Cancel order error:', e);
    res.status(500).json({ error: e.message || 'Failed to cancel order' });
  }
});

// Cancel all orders (Pacifica only; Avantis doesn't support cancel-all natively)
router.post('/orders/cancel-all', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    if (req.dex === 'avantis') {
      return res.status(400).json({ error: 'cancel-all not supported for Avantis. Cancel orders individually.' });
    }

    const { symbol, all_symbols } = req.body;
    const result = await pacifica.cancelAllOrders(wallet.secret_key, {
      symbol,
      allSymbols: all_symbols !== false,
    });

    res.json(result);
  } catch (e) {
    console.error('Cancel all orders error:', e);
    res.status(500).json({ error: 'Failed to cancel orders' });
  }
});

// ==================== CLOSE POSITION (Avantis) ====================

// Avantis positions close client-side now. Kept as 410 for old clients.
router.post('/positions/close', auth, avantisMigratedGuard, (req, res) => {
  res.status(400).json({ error: 'Pacifica uses /orders/market with reduce_only=true.' });
});

// ==================== LEVERAGE ====================

router.post('/leverage', auth, avantisMigratedGuard, async (req, res) => {
  if (req.dex === 'avantis') {
    return res.status(400).json({ error: 'Avantis does not support changing leverage on open positions. Set leverage when opening the trade.' });
  }
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, leverage } = req.body;
    if (!symbol || !leverage) return res.status(400).json({ error: 'symbol, leverage required' });

    const result = await pacifica.updateLeverage(wallet.secret_key, { symbol, leverage });
    res.json(result);
  } catch (e) {
    console.error('Leverage error:', e);
    res.status(500).json({ error: 'Failed to update leverage' });
  }
});

// ==================== TP/SL ====================

router.post('/tpsl', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, 'pacifica');
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    // Pacifica TP/SL (Avantis handled client-side)
    const { symbol, side, take_profit, stop_loss } = req.body;
    if (!symbol || !side) return res.status(400).json({ error: 'symbol, side required' });

    const payload = { symbol, side, builder_code: 'clashofperps' };
    if (take_profit) payload.take_profit = take_profit;
    if (stop_loss) payload.stop_loss = stop_loss;

    const body = pacifica.buildSignedRequest('set_position_tpsl', payload, wallet.secret_key);
    const result = await fetch('https://api.pacifica.fi/api/v1/positions/tpsl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

    res.json(result);
  } catch (e) {
    console.error('TP/SL error:', e);
    res.status(500).json({ error: e.message || 'Failed to set TP/SL' });
  }
});

// ==================== WITHDRAW ====================

router.post('/withdraw', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, 'pacifica');
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { amount } = req.body;
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'amount required' });
    }

    const result = await pacifica.withdraw(wallet.secret_key, { amount: parseFloat(amount) });
    balanceCache.delete(`${req.playerId}:pacifica`);
    res.json(result);
  } catch (e) {
    console.error('Withdraw error:', e);
    const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Withdrawal failed';
    res.status(500).json({ error: String(msg).slice(0, 300) });
  }
});

// ==================== TRADE HISTORY ====================

router.get('/history', auth, (req, res) => {
  const trades = db.getTrades(req.playerId);
  res.json(trades);
});

router.post('/monad/report-fill', auth, async (req, res) => {
  try {
    if (req.dex !== 'monad') {
      return res.status(409).json({
        error: `Account is registered for '${req.dex}'. Switch DEX to monad before reporting Perpl fills.`,
      });
    }
    const wallet = normalizeEvmAddress(req.body?.wallet || req.playerWallet);
    const playerWallet = normalizeEvmAddress(req.playerWallet);
    if (!wallet) return res.status(400).json({ error: 'wallet required (0x...)' });
    if (playerWallet && wallet !== playerWallet) {
      return res.status(409).json({ error: 'wallet does not match player account' });
    }

    const order = req.body?.order || {};
    const marketId = Number(order?.mkt ?? order?.market_id ?? order?.market);
    const orderType = Number(order?.t ?? order?.type);
    const rq = Number(order?.rq ?? order?.request_id);
    const orderId = perplNumericId(order?.oid ?? order?.order_id ?? order?.id);
    const status = Number(order?.st ?? order?.status);
    const statusReason = Number(order?.sr ?? order?.status_reason ?? order?.statusReason);
    const filledWire = Math.abs(Number(order?.fs ?? order?.filled_size ?? order?.filledSize ?? order?.s ?? order?.size ?? 0));
    if (!Number.isFinite(marketId) || !Number.isFinite(orderType) || !orderId || filledWire <= 0) {
      return res.status(400).json({ error: 'invalid Perpl fill report' });
    }
    if (status !== 4 && ![16, 22, 43].includes(statusReason)) {
      return res.status(400).json({ error: 'Perpl order is not filled', status, status_reason: statusReason });
    }
    // Perpl request ids are seeded from Date.now(). Keep the fallback instant,
    // but reject stale/fabricated reports from old tabs.
    if (!Number.isFinite(rq) || Math.abs(Date.now() - rq) > 2 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'stale Perpl request id' });
    }

    const markets = await getPerplMarkets();
    const market = markets[marketId] || PERPL_MARKETS_FALLBACK[marketId];
    if (!market) return res.status(400).json({ error: 'unknown Perpl market' });

    const priceDecimals = Number(market.price_decimals || 1);
    const sizeDecimals = Number(market.size_decimals || 5);
    const fallbackMark = Number(req.body?.mark ?? req.body?.price ?? 0);
    const price = Number(market.mark) > 0
      ? Number(market.mark)
      : (Number.isFinite(fallbackMark) && fallbackMark > 0 ? fallbackMark : 0);
    const amount = filledWire / 10 ** sizeDecimals;
    const notional = amount * price;
    if (!Number.isFinite(notional) || notional < 10 || notional > 10_000_000) {
      return res.status(400).json({ error: 'Perpl fill notional outside reward bounds', notional });
    }

    const clientOrderId = `perpl:${orderId || rq}`;
    const existing = db.db.prepare(`
      SELECT id FROM trade_history
      WHERE dex = 'monad' AND (
        client_order_id = ?
        OR (? IS NOT NULL AND order_id = ?)
      )
      LIMIT 1
    `).get(clientOrderId, orderId, orderId);
    if (existing) {
      return res.json({ ok: true, imported: false, duplicate: true, trade_id: existing.id, notional_usd: notional });
    }

    const row = {
      symbol: market.symbol,
      side: perplSideFromOrderType(orderType, order?.s ?? order?.size ?? 0),
      orderType: perplOrderTypeLabel(orderType),
      amount: String(amount),
      price: String(price),
      orderId,
      clientOrderId,
      status: 'filled',
      dex: 'monad',
      notional_usd: notional,
      verifiedSource: 'perpl_ws',
      pnl: null,
    };
    const inserted = db.addTrade(req.playerId, row);
    console.log(`[perpl] ws fill report imported player=${req.playerName} rq=${rq} oid=${orderId || '-'} ${row.symbol} ${row.side} $${notional.toFixed(2)}`);
    res.json({ ok: true, imported: true, trade_id: inserted.id, notional_usd: notional, symbol: row.symbol, side: row.side });
  } catch (e) {
    console.warn('[perpl] ws fill report failed:', e.message);
    res.status(502).json({ error: 'Failed to record Perpl fill', detail: e.message });
  }
});

// ==================== TRADE REPORT (non-custodial: Avantis, Decibel) ====================
// Client reports are accepted for backwards-compatible UI flow. Browser-only
// payloads are not rewardable; market opens on Avantis are immediately
// re-read from Core API and recorded as `verified_source='worker'`. Everything
// else is picked up by the per-DEX rewards workers.
const TRADE_REPORT_DEXES = new Set(['avantis', 'decibel']);

function avantisCollateralUsd(row) {
  const raw = row?.collateral ?? row?.trade?.positionSizeUSDC ?? row?.positionSizeUSDC ?? row?.trade?.initialPosToken;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 10000 ? n / 1e6 : n;
}

function avantisLeverage(row) {
  const n = Number(row?.leverage ?? row?.trade?.leverage ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n > 10000 ? n / 1e10 : n;
}

function avantisBool(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return false;
}

function avantisOpenedAt(row) {
  const n = Number(row?.openedAt ?? row?.opened_at ?? row?.trade?.openedAt ?? row?.trade?.opened_at ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function avantisLifecycleTradeKey(kind, address, pairIdx, tradeIdx, openedAt, fallback = '') {
  const base = `avantis:${kind}:${address}:${pairIdx}:${tradeIdx}`;
  if (openedAt) return `${base}:${openedAt}`;
  const suffix = String(fallback || '')
    .toLowerCase()
    .replace(/^0x/, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 32);
  return suffix ? `${base}:${suffix}` : base;
}

const AVANTIS_CLOSE_VERIFY_ABI = [
  {
    name: 'closeTradeMarket',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'index', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'delegatedAction',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'trader', type: 'address' },
      { name: 'call_data', type: 'bytes' },
    ],
    outputs: [{ type: 'bytes' }],
  },
];

function decodeAvantisCloseCall(input, expectedTrader) {
  const decoded = decodeFunctionData({ abi: AVANTIS_CLOSE_VERIFY_ABI, data: input });
  if (decoded.functionName === 'closeTradeMarket') {
    return { args: decoded.args, delegated: false };
  }
  if (decoded.functionName === 'delegatedAction') {
    const [trader, callData] = decoded.args || [];
    if (String(trader || '').toLowerCase() !== String(expectedTrader || '').toLowerCase()) {
      throw new Error('delegated close trader mismatch');
    }
    const inner = decodeFunctionData({ abi: AVANTIS_CLOSE_VERIFY_ABI, data: callData });
    if (inner.functionName !== 'closeTradeMarket') {
      throw new Error('delegated action is not closeTradeMarket');
    }
    return { args: inner.args, delegated: true };
  }
  throw new Error('transaction is not an Avantis close');
}

function avantisOpenSuffix(openClientOrderId, address, pairIdx, tradeIdx) {
  const prefix = avantisLifecycleTradeKey('open', address, pairIdx, tradeIdx, 0);
  const raw = String(openClientOrderId || '');
  if (!raw.startsWith(`${prefix}:`)) return '';
  return raw.slice(prefix.length + 1).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);
}

function avantisCreatedAtSeconds(createdAt) {
  if (!createdAt) return 0;
  const ms = Date.parse(`${String(createdAt).replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function avantisLegacyOpenRecordedForLifecycle(playerId, legacyKey, openedAt) {
  if (!openedAt) return false;
  try {
    const row = db.db.prepare(
      `SELECT created_at
         FROM trade_history
        WHERE player_id = ?
          AND dex = 'avantis'
          AND client_order_id = ?
        LIMIT 1`
    ).get(playerId, legacyKey);
    const created = avantisCreatedAtSeconds(row?.created_at);
    return created > 0 && created >= openedAt - 300;
  } catch {
    return false;
  }
}

async function recordVerifiedAvantisClose(req, body) {
  try {
    const orderType = String(body.order_type || '').toLowerCase();
    const side = String(body.side || '').toLowerCase();
    if (orderType !== 'close' && !side.includes('close')) return false;
    const dedup = String(body.dedup_key || '').trim();
    const m = dedup.match(/^avantis:close:(0x[0-9a-fA-F]{40}):(\d+):(\d+)(?::([A-Za-z0-9_.-]+))?$/);
    if (!m) return false;
    const address = String(body.address || '').trim().toLowerCase();
    const dedupAddress = m[1].toLowerCase();
    if (address !== dedupAddress) return false;
    const txHash = String(body.tx_hash || '').trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return false;

    const receipt = await basePublicClient.getTransactionReceipt({ hash: txHash });
    if (receipt?.status !== 'success') return false;
    const tx = await basePublicClient.getTransaction({ hash: txHash });
    if (String(tx?.to || '').toLowerCase() !== String(avantis.TRADING_ADDRESS).toLowerCase()) return false;

    const pairIdx = Number(m[2]);
    const tradeIdx = Number(m[3]);
    const closeCall = decodeAvantisCloseCall(tx.input, address);
    if (!closeCall.delegated && String(tx?.from || '').toLowerCase() !== address) return false;
    const decodedArgs = closeCall.args;
    const decodedPairIdx = Number(decodedArgs?.[0]);
    const decodedTradeIdx = Number(decodedArgs?.[1]);
    if (decodedPairIdx !== pairIdx || decodedTradeIdx !== tradeIdx) return false;

    const closedCollateral = Number(formatUnits(decodedArgs?.[2] || 0n, 6));
    if (!Number.isFinite(closedCollateral) || closedCollateral <= 0) return false;

    const openPrefix = avantisLifecycleTradeKey('open', address, pairIdx, tradeIdx, 0);
    const open = db.db.prepare(`
      SELECT symbol, side, amount, notional_usd, client_order_id
        FROM trade_history
       WHERE player_id = ?
         AND dex = 'avantis'
         AND status = 'filled'
         AND verified_source = 'worker'
         AND side IN ('long', 'short')
         AND (client_order_id = ? OR client_order_id LIKE ?)
       ORDER BY id DESC
       LIMIT 1
    `).get(req.playerId, openPrefix, `${openPrefix}:%`);
    if (!open) return false;

    const openCollateral = Number(open.amount);
    const openNotional = Number(open.notional_usd);
    const leverage = openCollateral > 0 ? openNotional / openCollateral : Number(body.leverage || 1);
    if (!Number.isFinite(leverage) || leverage <= 0) return false;
    if (openCollateral > 0 && closedCollateral > openCollateral * 1.05) return false;

    const notional = closedCollateral * leverage;
    if (!Number.isFinite(notional) || notional < 0.01 || notional > 10_000_000) return false;
    const closeSide = String(open.side || '').toLowerCase() === 'short' ? 'close_short' : 'close_long';
    const openSuffix = avantisOpenSuffix(open.client_order_id, address, pairIdx, tradeIdx);
    const txSuffix = txHash.toLowerCase().replace(/^0x/, '').slice(0, 32);
    const recordKey = `${avantisLifecycleTradeKey('close', address, pairIdx, tradeIdx, 0)}:${openSuffix ? `${openSuffix}-${txSuffix}` : txSuffix}`;
    const existing = db.db.prepare(`
      SELECT id FROM trade_history
       WHERE player_id = ? AND dex = 'avantis'
         AND (client_order_id = ? OR order_id = ?)
       LIMIT 1
    `).get(req.playerId, recordKey, txHash);
    if (existing) return true;

    db.addTrade(req.playerId, {
      symbol: String(open.symbol || body.symbol || '').toUpperCase(),
      side: closeSide,
      orderType: 'close',
      amount: String(closedCollateral),
      orderId: txHash,
      clientOrderId: recordKey,
      status: 'filled',
      dex: 'avantis',
      notional_usd: notional,
      verifiedSource: 'worker',
    });
    return true;
  } catch (e) {
    console.warn('[trade-report] verified Avantis close failed:', e?.message || e);
    return false;
  }
}

async function recordVerifiedAvantisOpen(req, body) {
  const orderType = String(body.order_type || 'market').toLowerCase();
  if (orderType !== 'market') return false;
  const dedup = String(body.dedup_key || '').trim();
  const m = dedup.match(/^avantis:open:(0x[0-9a-fA-F]{40}):(\d+):(\d+)(?::([A-Za-z0-9_.-]+))?$/);
  if (!m) return false;
  const address = String(body.address || '').trim().toLowerCase();
  const dedupAddress = m[1].toLowerCase();
  if (address !== dedupAddress) return false;
  const pairIdx = Number(m[2]);
  const tradeIdx = Number(m[3]);
  let hit = null;
  for (let i = 0; i < 6 && !hit; i++) {
    const positions = await avantis.getPositionsByAddress(address);
    hit = positions.find(p =>
      Number(p?.pairIndex ?? p?.pair_index ?? p?.trade?.pairIndex) === pairIdx
      && Number(p?.index ?? p?.trade?.index) === tradeIdx
    );
    if (!hit) await new Promise(r => setTimeout(r, 1000));
  }
  if (!hit) return false;
  const collateral = avantisCollateralUsd(hit);
  const lev = avantisLeverage(hit);
  const notional = collateral * lev;
  if (!Number.isFinite(notional) || notional < 50 || notional > 10_000_000) return false;
  const side = avantisBool(hit.buy ?? hit.trade?.buy) ? 'long' : 'short';
  const openedAt = avantisOpenedAt(hit);
  const legacyKey = avantisLifecycleTradeKey('open', address, pairIdx, tradeIdx, 0);
  const recordKey = avantisLifecycleTradeKey('open', address, pairIdx, tradeIdx, openedAt, body.tx_hash || m[4] || dedup);
  if (avantisLegacyOpenRecordedForLifecycle(req.playerId, legacyKey, openedAt)) {
    return true;
  }
  let symbol = String(body.symbol || '').toUpperCase();
  try {
    const { indexMap } = await avantis.getPairsMap();
    const p = indexMap?.[pairIdx];
    if (p?.from) {
      const from = String(p.from).toUpperCase();
      const to = String(p.to || 'USD').toUpperCase();
      symbol = from === 'USD' && to && to !== 'USD' ? `${from}${to}` : from;
    }
  } catch {}
  db.addTrade(req.playerId, {
    symbol,
    side,
    orderType: 'market',
    amount: String(collateral),
    orderId: recordKey,
    clientOrderId: recordKey,
    status: 'filled',
    dex: 'avantis',
    notional_usd: notional,
    verifiedSource: 'worker',
  });
  return true;
}

router.post('/monad/import-fills', auth, async (req, res) => {
  try {
    if (req.dex !== 'monad') {
      return res.status(409).json({
        error: `Account is registered for '${req.dex}'. Switch DEX to monad before importing Perpl fills.`,
      });
    }
    const wallet = normalizeEvmAddress(req.body?.wallet || req.playerWallet);
    const playerWallet = normalizeEvmAddress(req.playerWallet);
    if (!wallet) return res.status(400).json({ error: 'wallet required (0x...)' });
    if (playerWallet && wallet !== playerWallet) {
      return res.status(409).json({ error: 'wallet does not match player account' });
    }
    const authNonce = String(req.body?.auth_nonce || req.headers['x-auth-nonce'] || '').trim();
    if (!authNonce) return res.status(401).json({ error: 'Missing Perpl auth nonce' });
    const cookie = String(req.headers.cookie || '');
    if (!cookie) return res.status(401).json({ error: 'Missing Perpl auth cookie' });

    const markets = await getPerplMarkets();
    const payload = await perplAuthedGet(`/trading/fills?count=${PERPL_FILL_LOOKBACK}`, { cookie, authNonce });
    const rows = perplRows(payload);
    let imported = 0;
    let skipped = 0;
    for (const fill of rows) {
      const row = normalizePerplFill(fill, markets);
      if (!row) { skipped++; continue; }
      try {
        if (row.orderId) {
          const existing = db.db.prepare("SELECT id FROM trade_history WHERE dex = 'monad' AND order_id = ? LIMIT 1").get(row.orderId);
          if (existing) { skipped++; continue; }
        }
        const r = db.addTrade(req.playerId, row);
        if (r?.id) imported++;
      } catch (e) {
        skipped++;
        if (!/UNIQUE|constraint/i.test(e.message || '')) {
          console.warn('[perpl] fill import skipped:', e.message);
        }
      }
    }
    res.json({ ok: true, imported, skipped, total: rows.length });
  } catch (e) {
    console.warn('[perpl] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import Perpl fills', detail: e.message });
  }
});

router.post('/phoenix/import-fills', auth, async (req, res) => {
  try {
    if (req.dex !== 'phoenix') {
      return res.status(409).json({
        error: `Account is registered for '${req.dex}'. Switch DEX to phoenix before importing Phoenix fills.`,
      });
    }
    const wallet = String(req.body?.wallet || req.playerWallet || '').trim();
    const playerWallet = String(req.playerWallet || '').trim();
    if (!phoenixRewards.isSolanaWallet(wallet)) {
      return res.status(400).json({ error: 'wallet required (Solana pubkey)' });
    }
    if (phoenixRewards.isSolanaWallet(playerWallet) && wallet !== playerWallet) {
      return res.status(409).json({ error: 'wallet does not match player account' });
    }

    const txHash = String(req.body?.tx_hash || req.body?.signature || req.body?.hash || '').trim();
    if (txHash) {
      const result = await phoenixRewards.importTransactionForPlayer(req.playerId, wallet, req.body || {});
      if (result.imported > 0) {
        console.log(`[phoenix] imported tx reward for player=${req.playerName} wallet=${wallet.slice(0, 8)}... tx=${txHash.slice(0, 8)}...`);
      }
      return res.json(result);
    }

    const historyReason = String(req.body?.reason || req.body?.history_reason || '').trim().toLowerCase();
    const allowHistoryImport = process.env.PHOENIX_ALLOW_HISTORY_IMPORT === '1'
      || historyReason === 'limit_order_fill_check'
      || historyReason === 'manual_backfill';
    // The previous implementation fetched /trader/{wallet}/trades-history on
    // every claim/poll. That endpoint is now intentionally not called from
    // generic wallet-only imports because it rate-limits the whole server.
    // Limit orders can fill later without a fresh wallet tx, so the client is
    // allowed to request a narrow fill-history check right after placing one.
    if (!allowHistoryImport) {
      return res.json({
        ok: true,
        imported: 0,
        skipped: 0,
        total: 0,
        reason: 'tx_signature_required',
        tx_import_required: true,
      });
    }

    const requestedTxCheckLimit = Number(req.body?.tx_check_limit ?? req.body?.txCheckLimit);
    const txCheckLimit = historyReason === 'limit_order_fill_check'
      ? (Number.isFinite(requestedTxCheckLimit) ? Math.max(1, Math.min(200, requestedTxCheckLimit)) : 200)
      : undefined;
    const result = await phoenixRewards.importFillsForPlayer(req.playerId, wallet, {
      limit: historyReason === 'limit_order_fill_check' ? 200 : 100,
      timeoutMs: PHOENIX_PROXY_TIMEOUT_MS,
      cacheTtlMs: 20_000,
      txCheckLimit,
      limitOrderSignature: req.body?.limit_order_signature || req.body?.limitOrderSignature,
      symbol: req.body?.symbol,
      placementTtlMs: req.body?.placement_ttl_ms || req.body?.placementTtlMs,
    });
    if (result.imported > 0) {
      console.log(`[phoenix] imported ${result.imported} fill(s) for player=${req.playerName} wallet=${wallet.slice(0, 8)}...`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[phoenix] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import Phoenix fills', detail: e.message });
  }
});

router.post('/gmx/import-fills', auth, async (req, res) => {
  try {
    if (req.dex !== 'gmx') {
      return res.status(409).json({
        error: `Account is registered for '${req.dex}'. Switch DEX to gmx before importing GMX fills.`,
      });
    }
    const wallet = normalizeEvmAddress(req.body?.wallet || req.playerWallet);
    const playerWallet = normalizeEvmAddress(req.playerWallet);
    if (!wallet) return res.status(400).json({ error: 'wallet required (0x...)' });
    if (playerWallet && wallet !== playerWallet) {
      return res.status(409).json({ error: 'wallet does not match player account' });
    }

    const result = await gmxRewards.importTradesForPlayer(req.playerId, wallet, {
      lookbackSeconds: req.body?.lookback_seconds,
      attempts: req.body?.attempts,
      delayMs: req.body?.delay_ms,
    });
    if (result.imported > 0) {
      console.log(`[gmx] imported ${result.imported} fill(s) for player=${req.playerName} wallet=${wallet.slice(0, 10)}...`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[gmx] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import GMX fills', detail: e.message });
  }
});

router.post('/hyperliquid/import-fills', auth, async (req, res) => {
  try {
    if (req.dex !== 'hyperliquid') {
      return res.status(409).json({
        error: `Account is registered for '${req.dex}'. Switch DEX to hyperliquid before importing Hyperliquid fills.`,
      });
    }
    const wallet = normalizeEvmAddress(req.body?.wallet || req.playerWallet);
    const playerWallet = normalizeEvmAddress(req.playerWallet);
    if (!wallet) return res.status(400).json({ error: 'wallet required (0x...)' });
    if (playerWallet && wallet !== playerWallet) {
      return res.status(409).json({ error: 'wallet does not match player account' });
    }

    const result = await hyperliquidRewards.importFillsForPlayer(req.playerId, wallet, {
      lookbackSeconds: req.body?.lookback_seconds,
      attempts: req.body?.attempts,
      delayMs: req.body?.delay_ms,
    });
    if (result.imported > 0) {
      console.log(`[hyperliquid] imported ${result.imported} fill(s) for player=${req.playerName} wallet=${wallet.slice(0, 10)}...`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[hyperliquid] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import Hyperliquid fills', detail: e.message });
  }
});

function requireRisexOwner(req, res) {
  if (req.dex !== 'risex') {
    res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to risex before calling RISEx endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'risex',
    });
    return null;
  }
  const account = risex.normalizeAddress(req.body?.account || req.query?.account || req.playerWallet);
  const playerWallet = risex.normalizeAddress(req.playerWallet);
  if (!account) {
    res.status(400).json({ error: 'account required (0x...)' });
    return null;
  }
  if (playerWallet && account !== playerWallet) {
    res.status(403).json({ error: 'account must match the wallet registered to this game account' });
    return null;
  }
  return { account };
}

router.get('/risex/system-config', auth, async (req, res) => {
  try {
    if (req.dex !== 'risex') return res.status(409).json({ error: `Account is registered for '${req.dex}'. Switch DEX to risex.` });
    res.json(await risex.getSystemConfig());
  } catch (e) {
    console.warn('[risex] system-config failed:', e.message);
    res.status(502).json({ error: 'Failed to load RISEx system config', detail: e.message });
  }
});

router.get('/risex/eip712-domain', auth, async (req, res) => {
  try {
    if (req.dex !== 'risex') return res.status(409).json({ error: `Account is registered for '${req.dex}'. Switch DEX to risex.` });
    res.json(await risex.getEip712Domain());
  } catch (e) {
    console.warn('[risex] eip712-domain failed:', e.message);
    res.status(502).json({ error: 'Failed to load RISEx EIP-712 domain', detail: e.message });
  }
});

router.get('/risex/nonce-state', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    res.json(await risex.getNonceState(verified.account));
  } catch (e) {
    console.warn('[risex] nonce-state failed:', e.message);
    res.status(502).json({ error: 'Failed to load RISEx nonce state', detail: e.message });
  }
});

router.get('/risex/signers', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    res.json(await risex.getSigners(verified.account));
  } catch (e) {
    console.warn('[risex] signers failed:', e.message);
    res.status(502).json({ error: 'Failed to load RISEx signers', detail: e.message });
  }
});

router.get('/risex/session-key-status', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const signer = risex.normalizeAddress(req.query?.signer || req.body?.signer);
    if (!signer) return res.status(400).json({ error: 'signer required (0x...)' });
    res.json(await risex.getSessionKeyStatus(verified.account, signer));
  } catch (e) {
    console.warn('[risex] session-key-status failed:', e.message);
    res.status(502).json({ error: 'Failed to verify RISEx signer', detail: e.message });
  }
});

router.get('/risex/invite-status', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    res.json(await risex.getInviteStatus(verified.account));
  } catch (e) {
    console.warn('[risex] invite-status failed:', e.message);
    res.status(502).json({ error: 'Failed to load RISEx invite status', detail: e.message });
  }
});

router.post('/risex/invite/redeem', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const code = String(req.body?.code || '').trim().toUpperCase();
    const signature = String(req.body?.signature || '').trim();
    if (!code) return res.status(400).json({ error: 'RISEx invite code required' });
    if (!signature) return res.status(400).json({ error: 'RISEx invite signature required' });
    const result = await risex.redeemInvite({
      code,
      address: verified.account,
      signature,
    });
    try { await risex.acceptTerms(verified.account); } catch (termsError) {
      console.warn('[risex] accept terms after invite failed:', termsError.message);
    }
    res.json(result);
  } catch (e) {
    if (/account already exists/i.test(String(e?.message || ''))) {
      const verified = requireRisexOwner(req, res);
      if (!verified) return;
      const invite = await risex.getInviteStatus(verified.account).catch(() => null);
      return res.json({
        ok: true,
        already_exists: true,
        invite,
      });
    }
    console.warn('[risex] invite redeem failed:', e.message);
    res.status(400).json({ error: e.message || 'Failed to redeem RISEx invite code' });
  }
});

router.post('/risex/terms/accept', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    res.json(await risex.acceptTerms(verified.account));
  } catch (e) {
    console.warn('[risex] terms accept failed:', e.message);
    res.status(502).json({ error: 'Failed to accept RISEx terms', detail: e.message });
  }
});

router.post('/risex/register-signer', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const signer = risex.normalizeAddress(req.body?.signer);
    if (!signer) return res.status(400).json({ error: 'signer required (0x...)' });
    const invite = await risex.getInviteStatus(verified.account).catch(() => null);
    if (invite && invite.has_access === false) {
      return res.status(403).json({ error: 'RISEx invite code required before signer registration', code: 'RISEX_INVITE_REQUIRED', invite });
    }
    try { await risex.acceptTerms(verified.account); } catch (termsError) {
      console.warn('[risex] accept terms before signer registration failed:', termsError.message);
    }
    const result = await risex.registerSigner({ ...req.body, account: verified.account, signer });
    res.json(result);
  } catch (e) {
    console.warn('[risex] register-signer failed:', e.message);
    res.status(502).json({ error: 'Failed to register RISEx signer', detail: e.message });
  }
});

router.post('/risex/orders/place', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const { account: _account, ...payload } = req.body || {};
    const result = await risex.placeOrder(payload);
    res.json(result);
  } catch (e) {
    console.warn('[risex] place order failed:', e.message);
    const message = e.message || 'Failed to place RISEx order';
    const signerRejected = /SignerNotAuthorized|InvalidSignature|NotAuthorized|session key|signer/i.test(message);
    res.status(400).json({
      error: message,
      code: signerRejected ? 'RISEX_SIGNER_NOT_AUTHORIZED' : 'RISEX_ORDER_REJECTED',
      retryable_setup: signerRejected,
    });
  }
});

router.post('/risex/orders/cancel', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const { account: _account, ...payload } = req.body || {};
    const result = await risex.cancelOrder(payload);
    res.json(result);
  } catch (e) {
    console.warn('[risex] cancel order failed:', e.message);
    res.status(400).json({ error: e.message || 'Failed to cancel RISEx order' });
  }
});

router.post('/risex/deposit', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    res.status(410).json({
      error: 'RISEx /v1/account/deposit is a test-token faucet flow and is not used in production. Use /risex/bridge/address, transfer USDC to that address, then call /risex/bridge/process.',
      code: 'RISEX_BRIDGE_REQUIRED',
    });
  } catch (e) {
    console.warn('[risex] deprecated deposit route failed:', e.message);
    res.status(502).json({ error: 'Failed to handle RISEx deposit request', detail: e.message });
  }
});

router.get('/risex/bridge/source-balance', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const sourceChainId = req.query?.source_chain_id || req.query?.sourceChainId;
    res.json(await risex.getBridgeSourceUsdcBalance(verified.account, { sourceChainId }));
  } catch (e) {
    console.warn('[risex] bridge source balance failed:', e.message);
    res.status(502).json({ error: 'Failed to read RISEx bridge source USDC balance', detail: e.message });
  }
});

router.post('/risex/bridge/address', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const invite = await risex.getInviteStatus(verified.account).catch(() => null);
    if (invite && invite.has_access === false) {
      return res.status(403).json({ error: 'RISEx invite code required before deposit', code: 'RISEX_INVITE_REQUIRED', invite });
    }
    try { await risex.acceptTerms(verified.account); } catch (termsError) {
      console.warn('[risex] accept terms before bridge address failed:', termsError.message);
    }
    const sourceChainId = req.body?.source_chain_id || req.body?.sourceChainId || req.query?.source_chain_id || req.query?.sourceChainId;
    res.json(await risex.getBridgeDepositAddress({
      account: verified.account,
      sourceChainId,
    }));
  } catch (e) {
    console.warn('[risex] bridge address failed:', e.message);
    res.status(502).json({ error: 'Failed to create RISEx bridge deposit address', detail: e.message });
  }
});

router.post('/risex/bridge/process', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const invite = await risex.getInviteStatus(verified.account).catch(() => null);
    if (invite && invite.has_access === false) {
      return res.status(403).json({ error: 'RISEx invite code required before deposit', code: 'RISEX_INVITE_REQUIRED', invite });
    }
    try { await risex.acceptTerms(verified.account); } catch (termsError) {
      console.warn('[risex] accept terms before bridge process failed:', termsError.message);
    }
    const sourceChainId = req.body?.source_chain_id || req.body?.sourceChainId || req.query?.source_chain_id || req.query?.sourceChainId;
    const txHash = req.body?.tx_hash || req.body?.txHash || req.body?.userTransferTxHash;
    res.json(await risex.processBridgeDeposit({
      account: verified.account,
      sourceChainId,
      txHash,
    }));
  } catch (e) {
    const message = e.message || 'Failed to process RISEx bridge deposit';
    if (/\/process 404|Bridge API error:\s*404|POST \/process 404|404:\s*Bridge API error/i.test(message)) {
      console.warn('[risex] bridge process deferred:', message);
      return res.status(202).json({
        ok: false,
        deferred: true,
        status: 'pending_index',
        detail: message,
      });
    }
    console.warn('[risex] bridge process failed:', e.message);
    res.status(502).json({ error: 'Failed to process RISEx bridge deposit', detail: message });
  }
});

router.get('/risex/bridge/status', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    res.json(await risex.getBridgeStatus(req.query?.jobId || req.query?.job_id));
  } catch (e) {
    console.warn('[risex] bridge status failed:', e.message);
    res.status(502).json({ error: 'Failed to load RISEx bridge status', detail: e.message });
  }
});

router.get('/risex/bridge/history', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    res.json(await risex.getBridgeHistory(verified.account, {
      limit: req.query?.limit,
      offset: req.query?.offset,
    }));
  } catch (e) {
    console.warn('[risex] bridge history failed:', e.message);
    res.status(502).json({ error: 'Failed to load RISEx bridge history', detail: e.message });
  }
});

router.get('/risex/transfer-history', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    res.json(await risex.getTransferHistory(verified.account, {
      type: req.query?.type,
      limit: req.query?.limit,
      page: req.query?.page,
    }));
  } catch (e) {
    console.warn('[risex] transfer-history failed:', e.message);
    res.status(502).json({ error: 'Failed to load RISEx transfer history', detail: e.message });
  }
});

router.post('/risex/import-fills', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const result = await risex.importFillsForPlayer(req.playerId, verified.account, {
      attempts: req.body?.attempts,
      delayMs: req.body?.delay_ms,
      limit: req.body?.limit,
    });
    if (result.imported > 0) {
      console.log(`[risex] imported ${result.imported} fill(s) for player=${req.playerName} wallet=${verified.account.slice(0, 10)}...`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[risex] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import RISEx fills', detail: e.message });
  }
});

router.get('/risex/trade-history', auth, async (req, res) => {
  try {
    const verified = requireRisexOwner(req, res);
    if (!verified) return;
    const rows = await risex.getAccountTradeHistory(verified.account, {
      marketId: req.query?.market_id,
      limit: req.query?.limit,
    });
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    console.warn('[risex] trade-history failed:', e.message);
    res.status(502).json({ error: 'Failed to load RISEx trade history', detail: e.message });
  }
});

function requireNadoOwner(req, res) {
  if (req.dex !== 'nado') {
    res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to nado before calling Nado endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'nado',
    });
    return null;
  }
  const account = nado.normalizeAddress(req.body?.account || req.query?.account || req.playerWallet);
  const playerWallet = nado.normalizeAddress(req.playerWallet);
  if (!account) {
    res.status(400).json({ error: 'account required (0x...)' });
    return null;
  }
  if (playerWallet && account !== playerWallet) {
    res.status(403).json({ error: 'account must match the wallet registered to this game account' });
    return null;
  }
  return { account };
}

router.post('/nado/import-fills', auth, async (req, res) => {
  try {
    const verified = requireNadoOwner(req, res);
    if (!verified) return;
    const result = await nado.importFillsForPlayer(req.playerId, verified.account, {
      attempts: req.body?.attempts,
      delayMs: req.body?.delay_ms,
      limit: req.body?.limit,
    });
    if (result.imported > 0) {
      console.log(`[nado] imported ${result.imported} fill(s) for player=${req.playerName} wallet=${verified.account.slice(0, 10)}...`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[nado] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import Nado fills', detail: e.message });
  }
});

router.get('/nado/trade-history', auth, async (req, res) => {
  try {
    const verified = requireNadoOwner(req, res);
    if (!verified) return;
    const rows = await nado.getAccountTradeHistory(verified.account, {
      limit: req.query?.limit,
    });
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    console.warn('[nado] trade-history failed:', e.message);
    res.status(502).json({ error: 'Failed to load Nado trade history', detail: e.message });
  }
});

function hibachiCredsFromReq(req) {
  return hibachi.credentials({
    apiKey: req.body?.api_key || req.body?.apiKey || req.headers['x-hibachi-api-key'],
    accountId: req.body?.account_id || req.body?.accountId || req.headers['x-hibachi-account-id'],
    privateKey: req.body?.private_key || req.body?.privateKey || req.headers['x-hibachi-private-key'],
  });
}

function requireHibachiOwner(req, res) {
  if (req.dex !== 'hibachi') {
    res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to hibachi before calling Hibachi endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'hibachi',
    });
    return null;
  }
  try {
    return hibachiCredsFromReq(req);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Hibachi credentials required' });
    return null;
  }
}

router.post('/hibachi/account', auth, async (req, res) => {
  try {
    const creds = requireHibachiOwner(req, res);
    if (!creds) return;
    res.json(await hibachi.getAccount(creds));
  } catch (e) {
    console.warn('[hibachi] account failed:', e.message);
    res.status(502).json({ error: 'Failed to load Hibachi account', detail: e.message });
  }
});

router.post('/hibachi/positions', auth, async (req, res) => {
  try {
    const creds = requireHibachiOwner(req, res);
    if (!creds) return;
    res.json(await hibachi.getPositions(creds));
  } catch (e) {
    console.warn('[hibachi] positions failed:', e.message);
    res.status(502).json({ error: 'Failed to load Hibachi positions', detail: e.message });
  }
});

router.post('/hibachi/orders', auth, async (req, res) => {
  try {
    const creds = requireHibachiOwner(req, res);
    if (!creds) return;
    res.json(await hibachi.getOrders(creds));
  } catch (e) {
    console.warn('[hibachi] orders failed:', e.message);
    res.status(502).json({ error: 'Failed to load Hibachi orders', detail: e.message });
  }
});

router.post('/hibachi/order', auth, async (req, res) => {
  try {
    const creds = requireHibachiOwner(req, res);
    if (!creds) return;
    res.json(await hibachi.placeOrder(creds, req.body || {}));
  } catch (e) {
    console.warn('[hibachi] order failed:', e.message);
    res.status(400).json({ error: e.message || 'Failed to place Hibachi order' });
  }
});

router.post('/hibachi/order/cancel', auth, async (req, res) => {
  try {
    const creds = requireHibachiOwner(req, res);
    if (!creds) return;
    res.json(await hibachi.cancelOrder(creds, req.body || {}));
  } catch (e) {
    console.warn('[hibachi] cancel failed:', e.message);
    res.status(400).json({ error: e.message || 'Failed to cancel Hibachi order' });
  }
});

router.post('/hibachi/import-fills', auth, async (req, res) => {
  try {
    const creds = requireHibachiOwner(req, res);
    if (!creds) return;
    const result = await hibachi.importFillsForPlayer(req.playerId, creds, {
      limit: req.body?.limit,
    });
    if (result.imported > 0) {
      console.log(`[hibachi] imported ${result.imported} fill(s) for player=${req.playerName} account=${creds.accountId}`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[hibachi] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import Hibachi fills', detail: e.message });
  }
});

router.post('/hibachi/trade-history', auth, async (req, res) => {
  try {
    const creds = requireHibachiOwner(req, res);
    if (!creds) return;
    const rows = await hibachi.getAccountTradeHistory(creds, {
      limit: req.body?.limit,
    });
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    console.warn('[hibachi] trade-history failed:', e.message);
    res.status(502).json({ error: 'Failed to load Hibachi trade history', detail: e.message });
  }
});

function requireHotstuffOwner(req, res) {
  if (req.dex !== 'hotstuff') {
    res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to hotstuff before calling Hotstuff endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'hotstuff',
    });
    return null;
  }
  const account = hotstuff.normalizeAddress(req.body?.account || req.query?.account || req.playerWallet);
  const playerWallet = hotstuff.normalizeAddress(req.playerWallet);
  if (!account) {
    res.status(400).json({ error: 'account required (0x...)' });
    return null;
  }
  if (playerWallet && account !== playerWallet) {
    res.status(403).json({ error: 'account must match the wallet registered to this game account' });
    return null;
  }
  return { account };
}

router.post('/hotstuff/import-fills', auth, async (req, res) => {
  try {
    const verified = requireHotstuffOwner(req, res);
    if (!verified) return;
    const result = await hotstuffRewards.importFillsForPlayer(req.playerId, verified.account, {
      limit: req.body?.limit,
    });
    if (result.imported > 0) {
      console.log(`[hotstuff] imported ${result.imported} fill(s) for player=${req.playerName} wallet=${verified.account.slice(0, 10)}...`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[hotstuff] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import Hotstuff fills', detail: e.message });
  }
});

router.get('/hotstuff/status', auth, async (_req, res) => {
  try {
    res.json(await hotstuff.getHotstuffConfigStatus());
  } catch (e) {
    console.warn('[hotstuff] status failed:', e.message);
    res.status(502).json({ error: 'Failed to load Hotstuff status', detail: e.message });
  }
});

router.get('/hotstuff/trade-history', auth, async (req, res) => {
  try {
    const verified = requireHotstuffOwner(req, res);
    if (!verified) return;
    const rows = await hotstuff.getAccountTradeHistory(verified.account, {
      limit: req.query?.limit,
    });
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    console.warn('[hotstuff] trade-history failed:', e.message);
    res.status(502).json({ error: 'Failed to load Hotstuff trade history', detail: e.message });
  }
});

function grvtCredsFromReq(req) {
  const saved = db.getGrvtCredentials(req.playerId) || {};
  return grvt.credentials({
    apiKey: req.body?.api_key || req.body?.apiKey || req.headers['x-grvt-api-key'] || saved.apiKey,
    cookie: req.body?.cookie || req.body?.grvt_cookie || req.headers['x-grvt-cookie'],
    accountId: req.body?.account_id || req.body?.accountId || req.headers['x-grvt-account-id'],
    subAccountId: req.body?.sub_account_id || req.body?.subAccountId || req.headers['x-grvt-sub-account-id'] || saved.subAccountId,
  });
}

function grvtSymbolFromInstrument(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/_USDT?_PERP$/u, '')
    .replace(/_USD_PERP$/u, '')
    .replace(/-PERP$/u, '')
    .replace(/\/USD[TC]?$/u, '');
}

function requireGrvtOwner(req, res) {
  if (req.dex !== 'grvt') {
    res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to grvt before calling GRVT endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'grvt',
    });
    return null;
  }
  try {
    return grvtCredsFromReq(req);
  } catch (e) {
    res.status(400).json({ error: e.message || 'GRVT credentials required' });
    return null;
  }
}

router.get('/grvt/credentials', auth, async (req, res) => {
  if (req.dex !== 'grvt') {
    return res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to grvt before calling GRVT endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'grvt',
    });
  }
  try {
    let creds = db.getGrvtCredentials(req.playerId);
    if (!creds?.apiKey) return res.json({ has_credentials: false });
    if (!creds.subAccountId || !creds.fundingAccountAddress) {
      const resolved = await grvt.resolveCreds(creds);
      creds = db.saveGrvtCredentials(req.playerId, {
        apiKey: creds.apiKey,
        subAccountId: resolved.subAccountId,
        fundingAccountAddress: resolved.fundingAccountAddress || creds.fundingAccountAddress || '',
      });
    }
    res.json({
      has_credentials: true,
      api_key: creds.apiKey,
      sub_account_id: creds.subAccountId || '',
      funding_account_address: creds.fundingAccountAddress || '',
      updated_at: creds.updatedAt || null,
    });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to restore GRVT credentials' });
  }
});

router.post('/grvt/credentials', auth, async (req, res) => {
  if (req.dex !== 'grvt') {
    return res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to grvt before calling GRVT endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'grvt',
    });
  }
  try {
    const existing = db.getGrvtCredentials(req.playerId) || {};
    const apiKey = String(req.body?.api_key || req.body?.apiKey || '').trim();
    const subAccountId = String(
      req.body?.sub_account_id
      || req.body?.subAccountId
      || existing.subAccountId
      || ''
    ).trim();
    const fundingAccountAddress = String(
      req.body?.funding_account_address
      || req.body?.fundingAccountAddress
      || existing.fundingAccountAddress
      || ''
    ).trim();
    if (!apiKey) return res.status(400).json({ error: 'GRVT API key required' });
    const incoming = {
      apiKey,
      subAccountId,
    };
    const resolved = await grvt.resolveCreds(incoming);
    const saved = db.saveGrvtCredentials(req.playerId, {
      apiKey,
      subAccountId: resolved.subAccountId || subAccountId,
      fundingAccountAddress: resolved.fundingAccountAddress || fundingAccountAddress,
    });
    res.json({
      success: true,
      has_credentials: true,
      sub_account_id: saved?.subAccountId || '',
      funding_account_address: saved?.fundingAccountAddress || '',
      updated_at: saved?.updatedAt || null,
    });
  } catch (e) {
    const msg = e.message || 'Failed to save GRVT credentials';
    if (/sub[_ ]?account/i.test(msg)) {
      return res.json({
        success: false,
        needs_sub_account_id: true,
        error: 'GRVT could not auto-detect a trading account from this API key. Create the key from the funded GRVT trading account and save it again.',
        detail: msg,
      });
    }
    res.status(400).json({ error: msg });
  }
});

router.delete('/grvt/credentials', auth, (req, res) => {
  if (req.dex !== 'grvt') {
    return res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to grvt before calling GRVT endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'grvt',
    });
  }
  db.deleteGrvtCredentials(req.playerId);
  res.json({ success: true });
});

router.get('/grvt/config', auth, (req, res) => {
  if (req.dex !== 'grvt') {
    return res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to grvt before calling GRVT endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'grvt',
    });
  }
  res.json(grvt.getBuilderConfig());
});

router.post('/grvt/account', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    res.json(await grvt.getAccount(creds));
  } catch (e) {
    console.warn('[grvt] account failed:', e.message);
    res.status(502).json({ error: 'Failed to load GRVT account', detail: e.message });
  }
});

router.post('/grvt/positions', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    res.json(await grvt.getPositions(creds));
  } catch (e) {
    console.warn('[grvt] positions failed:', e.message);
    res.status(502).json({ error: 'Failed to load GRVT positions', detail: e.message });
  }
});

router.post('/grvt/leverage', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    res.json(await grvt.getInitialLeverage(creds));
  } catch (e) {
    console.warn('[grvt] leverage failed:', e.message);
    res.status(502).json({ error: 'Failed to load GRVT leverage config', detail: e.message });
  }
});

router.post('/grvt/orders', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    res.json(await grvt.getOrders(creds));
  } catch (e) {
    console.warn('[grvt] orders failed:', e.message);
    res.status(502).json({ error: 'Failed to load GRVT orders', detail: e.message });
  }
});

router.post('/grvt/create-order', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    const signedOrder = req.body?.order || req.body?.o;
    if (!signedOrder) return res.status(400).json({ error: 'signed GRVT order required' });
    const result = await grvt.submitSignedOrder(creds, signedOrder);
    try {
      const leg = Array.isArray(signedOrder.legs || signedOrder.l) ? (signedOrder.legs || signedOrder.l)[0] : {};
      const metadata = signedOrder.metadata || signedOrder.m || {};
      const notional = Number(req.body?.notional_usd || 0);
      db.addTrade(req.playerId, {
        symbol: grvtSymbolFromInstrument(leg?.instrument || leg?.i || req.body?.symbol),
        side: (leg?.is_buying_asset ?? leg?.ib) ? 'bid' : 'ask',
        orderType: (signedOrder.is_market ?? signedOrder.im) ? 'market' : 'limit',
        amount: String(leg?.size || leg?.s || ''),
        price: String(leg?.limit_price ?? leg?.lp ?? ''),
        orderId: result.order_id || null,
        clientOrderId: result.client_order_id || metadata.client_order_id || metadata.co || null,
        status: result.status || 'pending',
        dex: 'grvt',
        notional_usd: Number.isFinite(notional) && notional > 0 ? notional : 0,
        verifiedSource: 'grvt_signed_order',
        proofJson: JSON.stringify({
          source: 'grvt_eip712_signed_order',
          builder: signedOrder.builder || null,
          builder_fee: signedOrder.builder_fee || null,
          sub_account_id: signedOrder.sub_account_id || null,
          client_order_id: result.client_order_id || metadata.client_order_id || metadata.co || null,
          order_id: result.order_id || null,
          signature: signedOrder.signature || null,
          submitted_result: result || null,
        }),
      });
    } catch (e) {
      console.warn('[grvt] local trade record failed:', e.message);
    }
    res.json(result);
  } catch (e) {
    console.warn('[grvt] create-order failed:', e.message);
    res.status(502).json({ error: 'Failed to create GRVT order', detail: e.message });
  }
});

router.post('/grvt/set-leverage', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    const result = await grvt.setInitialLeverage(creds, {
      instrument: req.body?.instrument || req.body?.i,
      leverage: req.body?.leverage || req.body?.l,
    });
    res.json(result);
  } catch (e) {
    console.warn('[grvt] set-leverage failed:', e.message);
    res.status(502).json({ error: 'Failed to set GRVT leverage', detail: e.message });
  }
});

router.post('/grvt/set-position-config', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    const result = await grvt.setPositionConfig(creds, {
      instrument: req.body?.instrument || req.body?.i,
      marginType: req.body?.margin_type || req.body?.marginType || req.body?.mt,
      leverage: req.body?.leverage || req.body?.l,
      signature: req.body?.signature,
    });
    res.json(result);
  } catch (e) {
    console.warn('[grvt] set-position-config failed:', e.message);
    const status = /set_position_config\s+(\d{3})/i.exec(e.message || '')?.[1];
    res.status(Number(status) || 502).json({ error: 'Failed to set GRVT position config', detail: e.message });
  }
});

router.post('/grvt/authorize-builder', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    const saved = db.getGrvtCredentials(req.playerId) || {};
    const mainAccountId = String(
      req.body?.main_account_id
      || req.body?.mainAccountId
      || saved.fundingAccountAddress
      || ''
    ).trim();
    const result = await grvt.authorizeBuilder({
      mainAccountId,
      signature: req.body?.signature,
      maxFuturesFeeRate: req.body?.max_futures_fee_rate || req.body?.maxFuturesFeeRate,
      maxSpotFeeRate: req.body?.max_spot_fee_rate || req.body?.maxSpotFeeRate,
    });
    res.json(result);
  } catch (e) {
    console.warn('[grvt] authorize-builder failed:', e.message);
    res.status(502).json({ error: 'Failed to authorize GRVT builder', detail: e.message });
  }
});

router.post('/grvt/cancel-order', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    const result = await grvt.cancelOrder(creds, {
      orderId: req.body?.order_id || req.body?.orderId,
      clientOrderId: req.body?.client_order_id || req.body?.clientOrderId,
      timeToLiveMs: req.body?.time_to_live_ms || req.body?.timeToLiveMs,
    });
    res.json(result);
  } catch (e) {
    console.warn('[grvt] cancel-order failed:', e.message);
    res.status(502).json({ error: 'Failed to cancel GRVT order', detail: e.message });
  }
});

router.post('/grvt/trade-history', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    const rows = await grvt.getAccountTradeHistory(creds, {
      limit: req.body?.limit,
      start_time: req.body?.start_time,
      end_time: req.body?.end_time,
      cursor: req.body?.cursor,
      base: req.body?.base,
      quote: req.body?.quote,
    });
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    console.warn('[grvt] trade-history failed:', e.message);
    res.status(502).json({ error: 'Failed to load GRVT trade history', detail: e.message });
  }
});

router.post('/grvt/import-fills', auth, async (req, res) => {
  try {
    const creds = requireGrvtOwner(req, res);
    if (!creds) return;
    const result = await grvt.importFillsForPlayer(req.playerId, creds, {
      limit: req.body?.limit,
      start_time: req.body?.start_time,
      end_time: req.body?.end_time,
      cursor: req.body?.cursor,
    });
    if (result.imported > 0) {
      console.log(`[grvt] imported ${result.imported} builder fill(s) for player=${req.playerName} sub=${creds.subAccountId}`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[grvt] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import GRVT fills', detail: e.message });
  }
});

router.post('/trade-report', auth, async (req, res) => {
  try {
    if (!TRADE_REPORT_DEXES.has(req.dex)) {
      return res.status(400).json({ error: 'trade-report is for self-custody DEXes only' });
    }
    const { tx_hash, symbol, side, amount, leverage, notional_usd } = req.body || {};
    if (!tx_hash || !symbol || !side || !Number.isFinite(Number(amount))) {
      return res.status(400).json({ error: 'tx_hash, symbol, side, amount required' });
    }
    // Always recompute notional from amount×leverage. Ignore the
    // client-supplied `notional_usd` as a gold-inflation vector — previously
    // a crafted payload could claim $10M notional on a $10 trade.
    const amountNum = Number(amount);
    const leverageNum = Number(leverage || 1);
    if (!Number.isFinite(amountNum) || !Number.isFinite(leverageNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'amount / leverage out of range' });
    }
    const computedNotional = amountNum * leverageNum;
    // Reject if the client-supplied notional disagrees with amount×leverage
    // by >5% (rounding/slippage tolerance). Mismatch = tamper attempt.
    if (Number.isFinite(Number(notional_usd)) && Number(notional_usd) > 0) {
      const claimed = Number(notional_usd);
      const drift = Math.abs(claimed - computedNotional) / Math.max(computedNotional, 1);
      if (drift > 0.05) {
        console.warn(`[trade-report] notional drift for player ${req.playerId}: claimed $${claimed.toFixed(2)} vs computed $${computedNotional.toFixed(2)}`);
        return res.status(400).json({ error: 'notional mismatch' });
      }
    }
    const notional = computedNotional;
    if (!Number.isFinite(notional) || notional < 0 || notional > 10_000_000) {
      return res.status(400).json({ error: 'notional out of range' });
    }
    if (req.dex === 'avantis') {
      const address = String(req.body?.address || '').trim();
      const current = String(req.playerWallet || '').trim();
      const needsWallet = !/^0x[0-9a-fA-F]{40}$/.test(current) || /^fc_/i.test(current);
      if (/^0x[0-9a-fA-F]{40}$/.test(address) && needsWallet) {
        let writeDb = null;
        try {
          writeDb = new Database(MAIN_DB_PATH, { fileMustExist: true });
          writeDb.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(address, req.playerId);
          writeDb.prepare('UPDATE trading_rewards SET wallet = ? WHERE player_id = ? AND dex = ?').run(address, req.playerId, 'avantis');
        } catch (e) {
          console.warn('[trade-report] failed to backfill Avantis wallet:', e.message);
        } finally {
          try { writeDb?.close(); } catch {}
        }
      }
    }
    // Do not write rewardable Avantis rows from the browser payload alone.
    // A valid game token proves account ownership, not that tx_hash/amount
    // happened on-chain. Market opens are re-read from Core API; closes are
    // verified from the successful Base transaction calldata + an existing
    // verified open row. The polling worker remains the fallback.
    let verified = false;
    if (req.dex === 'avantis') {
      const tradeKind = String(req.body?.order_type || req.body?.side || '').toLowerCase();
      verified = tradeKind.includes('close')
        ? await recordVerifiedAvantisClose(req, req.body || {})
        : await recordVerifiedAvantisOpen(req, req.body || {});
    }
    res.json({
      ok: true,
      verified,
      credited: false,
      reason: verified
        ? 'Trade verified from Avantis Core API; rewards are ready to claim.'
        : 'Trade report accepted; rewards are credited after worker verification.',
    });
  } catch (e) {
    console.error('Trade report error:', e);
    res.status(500).json({ error: 'Failed to record trade' });
  }
});

// ==================== DEPOSITS ====================

// Get deposit history
router.get('/deposits', auth, (req, res) => {
  const deposits = db.getDeposits(req.playerId);
  res.json(deposits);
});

// Get USDC & native balance on custodial wallet
const balanceCache = new Map();
router.get('/balance', auth, async (req, res) => {
  if (req.dex === 'gmx' || req.dex === 'monad' || req.dex === 'hyperliquid' || req.dex === 'risex' || req.dex === 'nado' || req.dex === 'hibachi') {
    return res.status(410).json({ error: `${req.dex} balances are read directly by the client wallet.` });
  }
  const wallet = db.getWallet(req.playerId, req.dex);
  if (!wallet) return res.status(404).json({ error: 'No wallet' });

  const cacheKey = `${req.playerId}:${req.dex}`;

  // Return cache if fresh (10s)
  const cached = balanceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 10000) {
    return res.json(cached.data);
  }

  let data;
  if (req.dex === 'avantis') {
    let usdc = 0, eth = 0;
    try { usdc = await avantis.getUsdcBalance(wallet.public_key); } catch {}
    try { eth = await avantis.getEthBalance(wallet.public_key); } catch {}
    data = { usdc, eth, public_key: wallet.public_key, chain: 'base', dex: 'avantis' };
  } else {
    let usdc = 0, sol = 0;
    try { usdc = await deposit.getUsdcBalance(wallet.public_key); } catch {}
    try { sol = await deposit.getSolBalance(wallet.public_key); } catch {}
    data = { usdc, sol, public_key: wallet.public_key, chain: 'solana', dex: 'pacifica' };
  }

  balanceCache.set(cacheKey, { data, ts: Date.now() });
  res.json(data);
});

// Deposit USDC from custodial wallet into Pacifica vault (Pacifica only)
router.post('/deposit/pacifica', auth, avantisMigratedGuard, async (req, res) => {
  if (req.dex === 'avantis') {
    return res.status(400).json({ error: 'Avantis does not use a vault deposit. Fund your wallet with USDC on Base directly.' });
  }
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { amount } = req.body;
    if (!amount || parseFloat(amount) < 10) {
      return res.status(400).json({ error: 'Minimum deposit is 10 USDC' });
    }

    // Check USDC balance first
    const usdcBalance = await deposit.getUsdcBalance(wallet.public_key);
    if (usdcBalance < parseFloat(amount)) {
      return res.status(400).json({
        error: `Insufficient USDC. Balance: ${usdcBalance}, requested: ${amount}`,
      });
    }

    // Check SOL for gas
    const solBalance = await deposit.getSolBalance(wallet.public_key);
    if (solBalance < 0.005) {
      return res.status(400).json({
        error: `Need SOL for gas. Balance: ${solBalance} SOL, need at least 0.005`,
      });
    }

    // Execute on-chain deposit
    const result = await deposit.depositToPacifica(wallet.secret_key, parseFloat(amount));

    // Record in DB
    db.addDeposit(req.playerId, result.signature, parseFloat(amount), 'USDC');

    // Auto-activate: claim referral + approve builder code
    try {
      await activateAccount(wallet.secret_key);
    } catch (e) {
      console.log('Auto-activate note:', e.message);
    }

    res.json({
      success: true,
      signature: result.signature,
      amount: result.amount,
    });
  } catch (e) {
    console.error('Pacifica deposit error:', e);
    res.status(500).json({ error: e.message || 'Deposit failed' });
  }
});

// ==================== ACTIVATION ====================

// Claim referral code + approve builder code after first deposit
async function activateAccount(secretKey) {
  // Step 1: Claim referral code (gives access/whitelist to platform)
  const claimBody = pacifica.buildSignedRequest('claim_referral_code', {
    code: 'Vip',
  }, secretKey);

  const claimRes = await fetch('https://api.pacifica.fi/api/v1/referral/user/code/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(claimBody),
  });
  const claimData = await claimRes.json();
  console.log('Referral claim:', claimData.success ? 'OK' : claimData.error);

  // Step 2: Approve builder code (allows fee attribution)
  const approveBody = pacifica.buildSignedRequest('approve_builder_code', {
    builder_code: 'clashofperps',
    max_fee_rate: '0.001',
  }, secretKey);

  const approveRes = await fetch('https://api.pacifica.fi/api/v1/account/builder_codes/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(approveBody),
  });
  const approveData = await approveRes.json();
  console.log('Builder approve:', approveData.success ? 'OK' : approveData.error);

  return { claim: claimData, approve: approveData };
}

// Manual activation endpoint (Pacifica only)
router.post('/activate', auth, avantisMigratedGuard, async (req, res) => {
  if (req.dex === 'avantis') {
    return res.json({ success: true, message: 'No activation needed for Avantis.' });
  }
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const result = await activateAccount(wallet.secret_key);
    res.json(result);
  } catch (e) {
    console.error('Activation error:', e);
    res.status(500).json({ error: e.message || 'Activation failed' });
  }
});

module.exports = router;
