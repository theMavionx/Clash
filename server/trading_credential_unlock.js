'use strict';

const crypto = require('node:crypto');
const express = require('express');
const nacl = require('tweetnacl');
const bs58 = require('bs58').default || require('bs58');
const { TradingCredentialError } = require('./trading_credential_vault');
const {
  readTradingCredentialSessionCookie, setTradingCredentialSessionCookie,
} = require('./trading_credential_routes');

const PURPOSE = 'unlock-trading-credentials';
const DEFAULT_ORIGINS = ['https://clashofperps.fun', 'https://www.clashofperps.fun'];
const CHALLENGE_TTL_MS = 2 * 60_000;
const MAX_PENDING = 5000;
const MAX_BUCKETS = 10_000;
const WINDOW_MS = 5 * 60_000;

function fail(code, message, status = 403) { throw new TradingCredentialError(code, message, status); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function canonicalUnlockWallet(value) {
  if (typeof value !== 'string' || value.length > 128) return null;
  const wallet = value.trim();
  if (/^0x[0-9a-f]{40}$/iu.test(wallet)) return { wallet: wallet.toLowerCase(), chain: 'evm' };
  if (/^0x[0-9a-f]{1,64}$/iu.test(wallet)) {
    return { wallet: `0x${wallet.slice(2).padStart(64, '0').toLowerCase()}`, chain: 'aptos' };
  }
  try {
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(wallet) && bs58.decode(wallet).length === 32) {
      return { wallet, chain: 'solana' };
    }
  } catch { /* invalid base58 */ }
  return null;
}

function validPlayer(player, req) {
  const enabled = value => value === true || value === 1 || value === '1';
  return typeof player?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(player.id)
    && !player.banned_at && !player.deleted_at && !enabled(player.is_bot) && !enabled(player.isBot)
    && !enabled(player.is_guest) && !enabled(player.isGuest) && !enabled(player.guest)
    && !['guest', 'anonymous'].includes(String(player.auth_type || player.type || '').toLowerCase())
    && !req.agentSession && !req.botSession && !req.admin;
}

function exactOrigin(req, options) {
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return '';
  const raw = req.headers.origin;
  if (typeof raw !== 'string' || raw.length > 512) return '';
  try {
    const url = new URL(raw);
    if (url.origin !== raw || !['http:', 'https:'].includes(url.protocol)) return '';
    if (options.origins.has(raw)) return raw;
    if (options.allowLocalOrigins && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return raw;
  } catch { /* absent, opaque, or malformed origin */ }
  return '';
}

function unlockMessage(challenge) {
  return [
    'Clash trading credential vault',
    'Version: 1',
    `Action: ${PURPOSE}`,
    `Origin: ${challenge.origin}`,
    `Player: ${challenge.playerId}`,
    `Wallet: ${challenge.wallet}`,
    `Chain: ${challenge.chain}`,
    `Nonce: ${challenge.challengeId}`,
    `Issued At: ${challenge.issuedAt}`,
    `Expires At: ${challenge.expiresAt}`,
    'Authorize this browser to access your saved trading credentials. This does not submit a transaction.',
  ].join('\n');
}

function aptosFullMessage(challenge) {
  return `APTOS\nmessage: ${challenge.message}\nnonce: ${challenge.nonce}`;
}

function exactHexBytes(value, length, allowLengthPrefix = false) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/iu.test(value)) return null;
  let bytes = Buffer.from(value.slice(2), 'hex');
  if (allowLengthPrefix && bytes.length === length + 1 && bytes[0] === length) bytes = bytes.subarray(1);
  return bytes.length === length ? bytes : null;
}

function solanaSignature(value) {
  const hex = exactHexBytes(value, 64);
  if (hex) return hex;
  if (typeof value !== 'string' || value.length > 90) return null;
  if (/^[A-Za-z0-9+/]{86}==$/u.test(value)) {
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length === 64 && bytes.toString('base64') === value) return bytes;
  }
  try {
    const bytes = bs58.decode(value);
    return bytes.length === 64 ? bytes : null;
  } catch { return null; }
}

/** No account-404 fallback: a current on-chain key is required even for an original key. */
async function lookupAptosAuthenticationKey(wallet) {
  const { aptosFullnodeUrl, fetchWithAptosKeys } = require('./aptos_api');
  const response = await fetchWithAptosKeys(
    `${aptosFullnodeUrl()}/accounts/${encodeURIComponent(wallet)}`,
    { signal: AbortSignal.timeout(7000), cache: 'no-store', redirect: 'error' },
    { label: 'Credential wallet key verification', allowPublicFallback: true },
  );
  if (!response.ok) throw new Error('Aptos account verification unavailable');
  const account = await response.json();
  return account?.authentication_key;
}

/** Pure EVM/Solana verification; Aptos accepts only native Ed25519 with a fresh current-key lookup. */
async function verifyUnlockProof(challenge, proof, options = {}) {
  if (proof.fullMessage !== undefined && (challenge.chain !== 'aptos' || proof.fullMessage !== aptosFullMessage(challenge))) return false;
  try {
    if (challenge.chain === 'evm') {
      if (typeof proof.signature !== 'string' || !/^0x[0-9a-f]{130}$/iu.test(proof.signature)) return false;
      const { verifyMessage } = require('viem');
      return await verifyMessage({ address: challenge.wallet, message: challenge.message, signature: proof.signature });
    }
    if (challenge.chain === 'solana') {
      const signature = solanaSignature(proof.signature);
      return !!signature && nacl.sign.detached.verify(Buffer.from(challenge.message, 'utf8'), signature, bs58.decode(challenge.wallet));
    }
    if (challenge.chain === 'aptos') {
      const publicKey = exactHexBytes(proof.publicKey, 32, true);
      const signature = exactHexBytes(proof.signature, 64, true);
      if (!publicKey || !signature || !nacl.sign.detached.verify(Buffer.from(aptosFullMessage(challenge), 'utf8'), signature, publicKey)) return false;
      const expectedKey = crypto.createHash('sha3-256').update(publicKey).update(Buffer.from([0])).digest();
      const currentKey = exactHexBytes(await (options.lookupAptosAuthenticationKey || lookupAptosAuthenticationKey)(challenge.wallet), 32);
      return !!currentKey && crypto.timingSafeEqual(expectedKey, currentKey);
    }
  } catch { /* fail closed; never expose provider errors or proof data */ }
  return false;
}

function jsonError(res, error) {
  const known = error instanceof TradingCredentialError;
  return res.status(known ? error.status : 503).json({
    error: known ? error.message : 'Credential wallet verification is unavailable',
    code: known ? error.code : 'VAULT_UNAVAILABLE',
  });
}

function checkBody(req, allowed) {
  if (!req.is('application/json') || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some(key => !allowed.includes(key))) {
    fail('VAULT_INVALID_INPUT', 'A valid JSON unlock request is required', 400);
  }
  // The application may already have parsed JSON with a larger global limit.
  if (Buffer.byteLength(JSON.stringify(req.body)) > 8 * 1024) fail('VAULT_INVALID_INPUT', 'Unlock request is too large', 413);
  for (const [key, limit] of [['signature', 500], ['publicKey', 132], ['fullMessage', 2500]]) {
    if (req.body[key] !== undefined && (typeof req.body[key] !== 'string' || req.body[key].length > limit)) {
      fail('VAULT_INVALID_INPUT', 'Invalid wallet proof format', 400);
    }
  }
}

function authorizeWallet(req, wallet, options) {
  const sessions = options.sessionService;
  const owners = sessions.owners(req.player.id);
  const cookie = readTradingCredentialSessionCookie(req, { secure: options.secureCookies });
  if (owners.some(owner => canonicalUnlockWallet(owner)?.wallet === wallet)) return cookie;
  if (owners.length) {
    if (sessions.validate({ playerId: req.player.id, authToken: req.headers['x-token'], sessionToken: cookie })) return cookie;
    fail('VAULT_WALLET_MISMATCH', 'Unlock with an existing verified credential wallet first');
  }
  if (canonicalUnlockWallet(req.player.wallet)?.wallet !== wallet) {
    fail('VAULT_WALLET_MISMATCH', 'Verify the original player wallet to create the credential vault');
  }
  return cookie;
}

function prune(map, stamp) {
  for (const [key, entry] of map) if (entry.until <= stamp) map.delete(key);
}

/** Mount beside the data router at /api/players/trading-credentials, never behind generic :id routes. */
function createTradingCredentialUnlockRouter(input) {
  if (!input?.db?.prepare || typeof input.authenticate !== 'function' || !input.sessionService?.issue
    || !input.sessionService?.validate || !input.sessionService?.owners) throw new Error('Vault unlock dependencies are required');
  const options = {
    now: Date.now, secureCookies: true, allowLocalOrigins: false, ...input,
    origins: new Set(input.allowedOrigins || DEFAULT_ORIGINS),
  };
  const challenges = new Map(), inFlight = new Map(), buckets = new Map();
  const router = express.Router();
  const reloadPlayer = options.db.prepare('SELECT * FROM players WHERE id=? AND token=?');
  // Wire into explicit vault logout; restart also invalidates every pending challenge.
  router.revokePlayerChallenges = playerId => {
    for (const [id, challenge] of challenges) if (challenge.playerId === playerId) challenges.delete(id);
    for (const challenge of inFlight.values()) if (challenge.playerId === playerId) challenge.revoked = true;
  };

  const guard = (req, res, next) => {
    try {
      res.set({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      if (!exactOrigin(req, options)) fail('VAULT_ORIGIN_REQUIRED', 'Use the Clash website to unlock credentials');
      if (typeof req.headers['x-token'] !== 'string' || !req.headers['x-token'] || req.headers['x-token'].length > 1024) {
        fail('VAULT_AUTH_REQUIRED', 'Player login is required', 401);
      }
      next();
    } catch (error) { jsonError(res, error); }
  };
  const rateGuard = (req, res, next) => {
    try {
      if (!validPlayer(req.player, req)) fail('VAULT_PLAYER_REQUIRED', 'A valid player account is required');
      const stamp = options.now();
      prune(buckets, stamp); prune(challenges, stamp);
      for (const [key, limit] of [[`player:${req.player.id}:${req.path}`, req.path === '/challenge' ? 10 : 15], [`ip:${req.ip}`, 80]]) {
        const bucket = buckets.get(key) || { count: 0, until: stamp + WINDOW_MS };
        if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) fail('VAULT_RATE_LIMIT', 'Wallet verification is busy. Retry shortly.', 429);
        bucket.count++; buckets.set(key, bucket);
        if (bucket.count > limit) {
          res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - stamp) / 1000))));
          fail('VAULT_RATE_LIMIT', 'Too many wallet verification requests. Retry shortly.', 429);
        }
      }
      next();
    } catch (error) { jsonError(res, error); }
  };
  const middleware = [guard, options.authenticate, rateGuard, express.json({ limit: '8kb' })];

  router.post('/challenge', ...middleware, (req, res) => {
    try {
      checkBody(req, ['wallet']);
      const target = canonicalUnlockWallet(req.body.wallet);
      if (!target) fail('VAULT_INVALID_WALLET', 'A supported wallet is required', 400);
      authorizeWallet(req, target.wallet, options);
      if (challenges.size + inFlight.size >= MAX_PENDING) fail('VAULT_RATE_LIMIT', 'Wallet verification is busy. Retry shortly.', 429);
      const stamp = options.now(), challengeId = crypto.randomBytes(32).toString('base64url');
      const challenge = {
        ...target, challengeId, nonce: challengeId, playerId: req.player.id,
        authTokenHash: hash(req.headers['x-token']), origin: exactOrigin(req, options),
        issuedAt: new Date(stamp).toISOString(), expiresAt: new Date(stamp + CHALLENGE_TTL_MS).toISOString(),
        until: stamp + CHALLENGE_TTL_MS,
      };
      challenge.message = unlockMessage(challenge);
      challenges.set(challengeId, challenge);
      res.json({ challengeId, nonce: challenge.nonce, wallet: challenge.wallet, chain: challenge.chain,
        message: challenge.message, expiresAt: challenge.expiresAt });
    } catch (error) { jsonError(res, error); }
  });

  router.post('/unlock', ...middleware, async (req, res) => {
    let consumedId;
    try {
      checkBody(req, ['challengeId', 'signature', 'publicKey', 'fullMessage']);
      const id = req.body.challengeId;
      const challenge = typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(id) ? challenges.get(id) : null;
      if (!challenge || challenge.until <= options.now() || challenge.playerId !== req.player.id
        || challenge.authTokenHash !== hash(req.headers['x-token']) || challenge.origin !== exactOrigin(req, options)) {
        fail('VAULT_CHALLENGE_INVALID', 'Wallet verification expired or changed. Request a new challenge.', 401);
      }
      // Consume before the first async operation; concurrent replays can never issue a second session.
      challenges.delete(id);
      consumedId = id; inFlight.set(id, challenge);
      authorizeWallet(req, challenge.wallet, options);
      if (!await verifyUnlockProof(challenge, req.body, options)) fail('VAULT_SIGNATURE_INVALID', 'Wallet signature verification failed', 401);
      if (challenge.revoked || challenge.until <= options.now()) fail('VAULT_CHALLENGE_INVALID', 'Wallet verification expired or was cancelled. Request a new challenge.', 401);
      // Authentication/ownership can change while a wallet-chain read is pending.
      req.player = reloadPlayer.get(challenge.playerId, req.headers['x-token']);
      if (!validPlayer(req.player, req)) fail('VAULT_AUTH_REQUIRED', 'Player login changed. Sign in again.', 401);
      const cookie = authorizeWallet(req, challenge.wallet, options);
      const session = options.sessionService.issue({ playerId: req.player.id, authToken: req.headers['x-token'],
        verifiedWallet: challenge.wallet, existingSessionToken: cookie });
      setTradingCredentialSessionCookie(res, session, { secure: options.secureCookies });
      res.json({ ok: true, unlocked: true, verifiedWallet: session.verifiedWallet, expiresAt: session.expiresAt });
    } catch (error) { jsonError(res, error); }
    finally { if (consumedId) inFlight.delete(consumedId); }
  });
  router.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return jsonError(res, new TradingCredentialError('VAULT_INVALID_INPUT', 'Unlock request is too large', 413));
    if (error?.type === 'entity.parse.failed') return jsonError(res, new TradingCredentialError('VAULT_INVALID_INPUT', 'Invalid JSON unlock request', 400));
    return jsonError(res, error);
  });
  return router;
}

module.exports = { createTradingCredentialUnlockRouter, canonicalUnlockWallet, verifyUnlockProof };
