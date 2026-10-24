'use strict';

/**
 * Authenticated, read-only, allowlisted proxy from the game to ClashBot's
 * public copy-trading analytics (leaderboard, venue freshness, trader
 * analysis, execution readiness).
 *
 * Mounted under `/api/v1/copy-trading/*` behind the game's `auth` middleware.
 * Every route is an explicit GET with a fixed upstream path and an allowlist
 * of forwarded query keys, so this can never act as an open proxy. Nothing
 * from the player's request other than those query values is forwarded: no
 * game token, cookies, client IP or bodies.
 *
 * Copy-bot control is NOT proxied here: it goes through the signed partner
 * channel in clashbot_copy_bots.js (`/api/v1/copy-bots/*`).
 *
 * Upstream base: CLASHBOT_COPY_API_URL (default https://clashbot.fun), which
 * serves `/leaderboard-api/*` and `/copy-api/*`.
 */

const { createWindow } = require('./http_security');

const DEFAULT_UPSTREAM = 'https://clashbot.fun';
const MAX_QUERY_VALUE = 200;
const VENUE_RE = /^[a-z0-9]{2,24}$/;
const ACCOUNT_RE = /^[A-Za-z0-9:_.-]{1,128}$/;

const LEADERBOARD_QUERY_KEYS = [
  'window', 'venues', 'sort', 'direction', 'minVolumeUsd', 'minWinRateTrades',
  'winRateMode', 'lastTradeAge', 'minAccountValueUsd', 'maxAccountValueUsd',
  'maxCopyBalanceUsd', 'minPnlUsd', 'maxPnlUsd', 'minRoiPercent', 'maxRoiPercent',
  'minWinRatePercent', 'maxWinRatePercent', 'metricQuality', 'capitalTier',
  'activityLevel', 'traderPattern', 'positionBias', 'copyableOnly', 'evidence',
  'search', 'page', 'limit',
];
const TRADER_IDENTITY_KEYS = ['venue', 'account'];
const TRADER_DETAIL_KEYS = [...TRADER_IDENTITY_KEYS, ...LEADERBOARD_QUERY_KEYS, 'includeSourceSnapshot'];
const TRADE_HISTORY_KEYS = [...TRADER_IDENTITY_KEYS, 'range', 'page', 'limit'];

function cleanQuery(query, keys) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const raw = query?.[key];
    if (raw == null || Array.isArray(raw) || typeof raw === 'object') continue;
    const value = String(raw);
    if (value.length > MAX_QUERY_VALUE) continue;
    params.set(key, value);
  }
  return params;
}

function identityQuery(keys) {
  return (req) => {
    const params = cleanQuery(req.query, keys);
    if (!VENUE_RE.test(params.get('venue') || '') || !ACCOUNT_RE.test(params.get('account') || '')) {
      const error = new Error('A valid trader venue and account are required');
      error.status = 400;
      throw error;
    }
    return params;
  };
}

const ROUTES = [
  {
    path: '/leaderboard', cacheMs: 15_000,
    upstream: '/leaderboard-api/v1/leaderboard',
    query: (req) => cleanQuery(req.query, LEADERBOARD_QUERY_KEYS),
  },
  { path: '/venues/status', cacheMs: 30_000, upstream: '/leaderboard-api/v1/venues/status' },
  { path: '/trader-summary', cacheMs: 30_000, upstream: '/copy-api/v1/trader-summary', query: identityQuery(TRADER_IDENTITY_KEYS) },
  { path: '/trader-source-snapshot', cacheMs: 5_000, upstream: '/copy-api/v1/trader-source-snapshot', query: identityQuery(TRADER_IDENTITY_KEYS) },
  { path: '/trader-daily-analytics', cacheMs: 30_000, upstream: '/copy-api/v1/trader-daily-analytics', query: identityQuery(TRADER_IDENTITY_KEYS) },
  { path: '/trader-details', cacheMs: 10_000, timeoutMs: 25_000, upstream: '/copy-api/v1/trader-details', query: identityQuery(TRADER_DETAIL_KEYS) },
  { path: '/trader-trade-history', cacheMs: 15_000, timeoutMs: 25_000, upstream: '/copy-api/v1/trader-trade-history', query: identityQuery(TRADE_HISTORY_KEYS) },
  { path: '/copy/status', cacheMs: 30_000, upstream: '/copy-api/v1/copy/status' },
];
const ROUTES_BY_PATH = new Map(ROUTES.map((route) => [route.path, route]));

/**
 * Build the express handler. `fetchImpl` and `now` are injectable for tests.
 */
function createClashbotCopyProxy({
  upstream = process.env.CLASHBOT_COPY_API_URL || DEFAULT_UPSTREAM,
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = Math.max(2_000, Math.min(30_000, Number(process.env.CLASHBOT_COPY_TIMEOUT_MS || 15_000))),
  playerLimitPerMinute = 180,
  now = Date.now,
} = {}) {
  const base = String(upstream || DEFAULT_UPSTREAM).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/?#]+$/i.test(base)) {
    throw new Error('CLASHBOT_COPY_API_URL must be an origin such as https://clashbot.fun');
  }
  const limit = createWindow({ now });
  const cache = new Map();
  const CACHE_MAX = 300;

  function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      cache.delete(key);
      return null;
    }
    return entry;
  }

  function cachePut(key, entry, ttl) {
    if (cache.size >= CACHE_MAX) {
      for (const [oldKey, value] of cache) {
        if (value.expiresAt <= now() || cache.size >= CACHE_MAX) cache.delete(oldKey);
        if (cache.size < CACHE_MAX * 0.8) break;
      }
    }
    cache.set(key, { ...entry, expiresAt: now() + ttl });
  }

  return async function clashbotCopyProxy(req, res) {
    res.setHeader('Cache-Control', 'no-store, private');
    const playerId = req.player?.id;
    if (!playerId) return res.status(401).json({ error: 'Authentication required' });
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Copy trading proxy is read-only', code: 'COPY_PROXY_READ_ONLY' });
    }
    const path = String(req.path || '/').replace(/\/+$/, '') || '/';
    const route = ROUTES_BY_PATH.get(path);
    if (!route) return res.status(404).json({ error: 'Not found', code: 'COPY_PROXY_ROUTE_NOT_ALLOWED' });
    if (!limit(`copy:${playerId}`, playerLimitPerMinute).ok) {
      return res.status(429).json({ error: 'Too many copy-trading requests. Try again shortly.', code: 'COPY_PROXY_RATE_LIMITED' });
    }

    let target;
    try {
      const params = route.query ? route.query(req) : null;
      const search = params && [...params.keys()].length > 0 ? `?${params}` : '';
      target = `${base}${route.upstream}${search}`;
    } catch (error) {
      return res.status(error.status || 400).json({ error: error.message, code: 'COPY_PROXY_INVALID_REQUEST' });
    }

    const cached = cacheGet(target);
    if (cached) {
      res.setHeader('x-clash-copy-cache', 'hit');
      return res.status(cached.status).type('application/json').send(cached.bodyText);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), route.timeoutMs || timeoutMs);
    try {
      const response = await fetchImpl(target, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
      });
      const bodyText = await response.text();
      let safeText = bodyText;
      try {
        JSON.parse(bodyText);
      } catch {
        safeText = JSON.stringify({ error: `ClashBot returned HTTP ${response.status}`, code: 'COPY_UPSTREAM_INVALID_RESPONSE' });
      }
      if (response.ok) cachePut(target, { status: response.status, bodyText: safeText }, route.cacheMs);
      return res.status(response.status).type('application/json').send(safeText);
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      return res.status(aborted ? 504 : 502).json({
        error: aborted ? 'ClashBot took too long to respond' : 'ClashBot is unreachable right now',
        code: aborted ? 'COPY_UPSTREAM_TIMEOUT' : 'COPY_UPSTREAM_UNREACHABLE',
      });
    } finally {
      clearTimeout(timer);
    }
  };
}

function mountClashbotCopyProxy(router, { auth, ...options } = {}) {
  if (typeof auth !== 'function') throw new Error('mountClashbotCopyProxy requires the game auth middleware');
  router.use('/v1/copy-trading', auth, createClashbotCopyProxy(options));
}

module.exports = {
  createClashbotCopyProxy,
  mountClashbotCopyProxy,
  _internals: { cleanQuery, ROUTES },
};
