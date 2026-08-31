'use strict';

const express = require('express');
const {
  TradingCredentialError, createTradingCredentialVault, createTradingCredentialSessionService,
} = require('./trading_credential_vault');

const DEFAULT_ORIGINS = ['https://clashofperps.fun', 'https://www.clashofperps.fun'];

function cookieName(secure) { return secure ? '__Host-clash_vault' : 'clash_vault_dev'; }

/** Reads only the dedicated proof-bound HttpOnly session capability. */
function readTradingCredentialSessionCookie(req, { secure = true } = {}) {
  const name = cookieName(secure), header = String(req.headers?.cookie || '');
  for (const segment of header.split(';')) {
    const index = segment.indexOf('=');
    if (segment.slice(0, index).trim() !== name) continue;
    const value = segment.slice(index + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : '';
  }
  return '';
}

/** Call only after the independent fresh-wallet-proof/owner-anchor check. */
function setTradingCredentialSessionCookie(res, session, { secure = true } = {}) {
  res.cookie(cookieName(secure), session.token, {
    httpOnly: true, secure, sameSite: 'strict', path: '/',
    expires: new Date(session.expiresAt),
  });
}

/** Disconnects this browser capability without deleting any exchange credentials. */
function clearTradingCredentialSessionCookie(res, { secure = true } = {}) {
  res.clearCookie(cookieName(secure), { httpOnly: true, secure, sameSite: 'strict', path: '/' });
}

function errorResponse(res, error) {
  const known = error instanceof TradingCredentialError;
  const status = known ? error.status : 503;
  const body = {
    error: known ? error.message : 'Secure credential storage is unavailable',
    code: known ? error.code : 'VAULT_UNAVAILABLE',
  };
  if (known && error.currentRevision !== undefined) body.currentRevision = error.currentRevision;
  if (known && error.deleted !== undefined) body.deleted = error.deleted;
  return res.status(status).json(body);
}

function invalidAccount(player, req) {
  if (!player?.id) return true;
  const enabled = value => value === true || value === 1 || value === '1';
  const nonPlayer = [player.is_bot, player.isBot, player.is_guest, player.isGuest, player.guest].some(enabled);
  const blocked = [player.banned_at, player.deleted_at, req.agentSession, req.botSession, req.admin].some(Boolean);
  const type = String(player.auth_type || player.type || '').toLowerCase();
  return nonPlayer || blocked || ['guest', 'anonymous'].includes(type);
}

function originAllowed(req, origins, allowLocalOrigins) {
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false;
  const raw = req.headers.origin || req.headers.referer;
  if (!raw) return req.method === 'GET' || req.method === 'HEAD';
  try {
    const url = new URL(String(raw));
    if (origins.has(url.origin)) return true;
    return allowLocalOrigins && ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

function requestGuard(options) {
  const origins = new Set(options.allowedOrigins || DEFAULT_ORIGINS);
  const allowLocal = options.allowLocalOrigins ?? options.secureCookies === false;
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store, private');
    res.set('Pragma', 'no-cache');
    res.set('X-Content-Type-Options', 'nosniff');
    if (!originAllowed(req, origins, allowLocal)) {
      return errorResponse(res, new TradingCredentialError('VAULT_ORIGIN_REQUIRED', 'Use the Clash website to manage credentials', 403));
    }
    const token = req.headers['x-token'];
    if (typeof token !== 'string' || !token || token.length > 1024) {
      return errorResponse(res, new TradingCredentialError('VAULT_AUTH_REQUIRED', 'Player login is required', 401));
    }
    next();
  };
}

function profileGuard(req, res, next) {
  if (invalidAccount(req.player, req)) {
    return errorResponse(res, new TradingCredentialError('VAULT_PLAYER_REQUIRED', 'A valid player account is required', 403));
  }
  next();
}

function rateGuard({ now = Date.now, rateLimits = {} }) {
  const buckets = new Map();
  return (req, res, next) => {
    const stamp = now(), kind = req.path === '/restore' ? 'restore' : req.method === 'GET' ? 'read' : 'write';
    const limit = Number(rateLimits[kind]) || (kind === 'restore' ? 30 : kind === 'read' ? 150 : 320);
    const key = `${req.player.id}:${kind}`, previous = buckets.get(key);
    const bucket = previous?.until > stamp ? previous : { count: 0, until: stamp + 5 * 60_000 };
    bucket.count++; buckets.set(key, bucket);
    if (buckets.size > 5000) for (const [id, value] of buckets) if (value.until <= stamp) buckets.delete(id);
    if (bucket.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - stamp) / 1000))));
      return errorResponse(res, new TradingCredentialError('VAULT_RATE_LIMIT', 'Too many credential requests. Retry shortly.', 429));
    }
    next();
  };
}

function bodyGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new TradingCredentialError('VAULT_INVALID_INPUT', 'A JSON request object is required');
    }
    if (Buffer.byteLength(JSON.stringify(req.body)) > 40 * 1024) {
      throw new TradingCredentialError('VAULT_VALUE_TOO_LARGE', 'Credential request exceeds the size limit', 413);
    }
    next();
  } catch (error) { errorResponse(res, error); }
}

function sessionAuthorization(options, sessions, req) {
  if (options.authorizeVaultSession) return options.authorizeVaultSession(req);
  return sessions.validate({ playerId: req.player.id, authToken: req.headers['x-token'],
    sessionToken: readTradingCredentialSessionCookie(req, { secure: options.secureCookies }) });
}

function endpoint(handler) {
  return async (req, res) => {
    try { await handler(req, res); } catch (error) { errorResponse(res, error); }
  };
}

function secretEndpoint(options, vault, sessions, handler) {
  return endpoint(async (req, res) => {
    if (!vault.keyStatus().configured) throw new TradingCredentialError('VAULT_UNAVAILABLE', 'Secure credential storage is unavailable', 503);
    if (!await sessionAuthorization(options, sessions, req)) {
      throw new TradingCredentialError('VAULT_LOCKED', 'Verify your wallet to unlock saved trading credentials', 403);
    }
    res.json(await handler(req));
  });
}

function mountEndpoints(router, options, vault, sessions) {
  router.get('/', endpoint(async (req, res) => {
    const keyStatus = vault.keyStatus(), session = await sessionAuthorization(options, sessions, req);
    const identity = options.getIdentity ? await options.getIdentity(req.player) : {};
    res.json({ records: vault.manifest(req.player.id), keyStatus,
      identity: { ...identity, playerId: req.player.id },
      unlockWallets: sessions.owners(req.player.id), unlocked: !!session && keyStatus.configured,
      session: session ? { verifiedWallet: session.verifiedWallet, expiresAt: session.expiresAt } : null });
  }));
  router.post('/restore', secretEndpoint(options, vault, sessions, req => ({ records: vault.restore(req.player.id, req.body.ids) })));
  router.put('/:id', secretEndpoint(options, vault, sessions, req => vault.put(req.player.id, { ...req.body, id: req.params.id })));
  router.delete('/:id', secretEndpoint(options, vault, sessions, req => vault.remove(req.player.id, { ...req.body, id: req.params.id })));
  router.post('/session/logout', endpoint(async (req, res) => {
    const token = readTradingCredentialSessionCookie(req, { secure: options.secureCookies });
    sessions.revoke(token, req.player.id);
    clearTradingCredentialSessionCookie(res, { secure: options.secureCookies });
    if (options.onSessionLogout) await options.onSessionLogout(req);
    res.json({ ok: true });
  }));
}

/** Mount at /api/players/trading-credentials after the main real-player auth function exists. */
function createTradingCredentialRouter(input) {
  if (typeof input?.authenticate !== 'function') throw new Error('Vault player authentication middleware is required');
  const options = { secureCookies: true, ...input };
  const vault = options.vault || createTradingCredentialVault(options);
  const sessions = options.sessions || createTradingCredentialSessionService(options);
  const router = express.Router();
  router.use(requestGuard(options), options.authenticate, profileGuard, rateGuard(options));
  router.use(express.json({ limit: '40kb' }), bodyGuard);
  mountEndpoints(router, options, vault, sessions);
  router.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return errorResponse(res, new TradingCredentialError('VAULT_VALUE_TOO_LARGE', 'Credential request exceeds the size limit', 413));
    if (error?.type === 'entity.parse.failed') return errorResponse(res, new TradingCredentialError('VAULT_INVALID_INPUT', 'Invalid JSON request'));
    return errorResponse(res, error);
  });
  return router;
}

module.exports = {
  createTradingCredentialRouter, readTradingCredentialSessionCookie,
  setTradingCredentialSessionCookie, clearTradingCredentialSessionCookie,
};
