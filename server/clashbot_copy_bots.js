'use strict';

/**
 * In-game ClashBot copy bots: authenticated write routes that forward to the
 * ClashBot partner API (server-to-server, HMAC signed), so players create,
 * start, monitor, stop and delete LIVE copy bots and connect any exchange
 * ClashBot can execute, without a ClashBot sign-in.
 *
 * Mounted under `/api/v1/copy-bots/*` behind the game's `auth` middleware.
 *
 * Security model
 * - The partner secret (CLASHBOT_PARTNER_SECRET) never leaves this process;
 *   the browser only ever talks to this route with its game token.
 * - Every upstream request is signed (partner signature v2) over partner id,
 *   player id, the player's wallet, the player's client IP, timestamp, a fresh
 *   nonce, method, path and the exact body bytes. ClashBot maps the player to
 *   its own namespace `clash:<playerId>`, so a player only sees their own bots.
 * - The wallet sent along (`x-copy-wallet`) is only the owner ClashBot expects
 *   for wallet-bound venue onboarding; every such flow is still proved by that
 *   wallet's own signature at ClashBot / the venue. The client IP lets ClashBot
 *   apply venue geo rules (Ondo) to the player, not to this server.
 * - Strict allowlists of routes, request fields, config keys and destination
 *   venues; trade-only credential shapes per venue; a key equal to the owner
 *   wallet (main-wallet key) is refused. Keys are never logged or echoed.
 * - Bots are live only.
 */

const crypto = require('node:crypto');
const { clientAddress, createWindow } = require('./http_security');

const DEFAULT_API = 'https://clashbot.fun/copy-api';
const PREFIX = '/v1/partner/clash/copy';
const VENUE_RE = /^[a-z0-9]{2,24}$/;
const SOURCE_ACCOUNT_RE = /^[A-Za-z0-9:_.-]{1,128}$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const APTOS_RE = /^0x[0-9a-fA-F]{64}$/;
const PK_RE = /^0x[0-9a-fA-F]{64}$/;
const B58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ID_RE = /^[1-9][0-9]{0,15}$/;
const CONNECTION_RE = /^[0-9a-f]{32}$/;
const TOKEN_RE = /^[A-Za-z0-9._~:+/=-]{16,1024}$/;
const MAX_CONFIG_BYTES = 8 * 1024;
const MAX_CREDENTIAL_BYTES = 8 * 1024;
const MAX_ONBOARDING_BYTES = 24 * 1024;

/** Every destination ClashBot's production runtime executes (native destinations). */
const LIVE_VENUES = new Set([
  'hyperliquid', 'nado', 'risex', 'bulk', 'gmx', 'arcus', 'qfex', 'phoenix',
  'lighter', 'rhlighter', 'grvt', 'ondo', 'decibel',
]);
/** Venues whose provision credential is a ClashBot onboarding token bound to the owner wallet. */
const TOKEN_VENUES = new Set(['lighter', 'rhlighter', 'grvt', 'ondo']);

/** Venue onboarding routes the player may drive through this server (mirror of ClashBot's partner allowlist). */
const LIGHTER_POSTS = new Set(['api-key/prepare', 'api-key/submit', 'api-key/manual/prepare', 'api-key/manual/submit',
  'onboarding/status', 'onboarding/recovery/prepare', 'onboarding/recovery/submit', 'prepare', 'integrator/prepare', 'integrator/submit']);
const ONBOARDING = {
  lighter: { GET: new Set(['accounts', 'state']), POST: LIGHTER_POSTS },
  rhlighter: { GET: new Set(['accounts', 'state']), POST: LIGHTER_POSTS },
  grvt: { GET: new Set(['config']), POST: new Set(['onboarding/prepare', 'onboarding/authorize', 'onboarding/select']) },
  ondo: { GET: new Set(['config']), POST: new Set(['challenge', 'session']) },
  decibel: { GET: new Set(['setup', 'state']), POST: new Set(['challenge', 'session', 'prepare']) },
  phoenix: { GET: new Set(['onboarding']), POST: new Set(['onboarding/preflight', 'onboarding/activate']) },
  qfex: { GET: new Set(), POST: new Set(['state', 'onboarding/message', 'onboarding/register']) },
};
const ONBOARDING_QUERY_KEYS = ['owner', 'accountIndex', 'authority', 'signature', 'lastValidBlockHeight'];

/** Config fields a player may set (ClashBot copy risk config, minus pool/operator-only switches). */
const CONFIG_KEYS = new Set([
  'sizeMode', 'smartScalePercent', 'proportionalMultiplier', 'fixedMarginUsd', 'portfolioPercent', 'allocationUsd',
  'reservePercent', 'minMarginUsd', 'maxMarginUsd', 'maxDailyMarginUsd', 'maxDailyMarginEnabled', 'maxAssetMarginUsd',
  'maxOpenPositionsEnabled', 'maxOpenPositions', 'leverageMode', 'leverageCap', 'fixedLeverage',
  'takeProfitEnabled', 'takeProfitPercent', 'stopLossEnabled', 'stopLossPercent', 'traderStopEnabled', 'traderStopPercent',
  'dailyLossEnabled', 'dailyLossPercent', 'consecutiveLossLimit', 'cooldownHours', 'assetMode', 'assets', 'direction',
  'maxWorseEntryPercent', 'maxSlippagePercent', 'processingWindowEnabled', 'maxSignalAgeSeconds', 'copyPositionAdds',
  'copyPartialCloses', 'closeOnReverse', 'skipExistingPositions', 'skipUnsupportedMarkets', 'minimumOrderPolicy',
  'maxMinimumOrderOversizePercent', 'allowLateEntryIfPriceUnchanged', 'orderStyle', 'makerFallbackPolicy',
  'makerRestSeconds', 'editorPreferences', 'stopBehavior', 'closeOnly', 'mirrorTraderTpsl', 'catchUpOpensSeconds',
  'copyExistingAdds', 'joinOpenPositions', 'latencyFirst', 'marginHandling', 'maxAutoTopUpUsd',
  'liquidationTolerancePercent', 'marginTopUpFailure', 'sourceLiquidationStop',
]);
const EDITOR_KEYS = new Set(['setupMode', 'simpleBalancePercent', 'simpleRiskScaleOverrideEnabled', 'simplePositionLimitOverrideEnabled']);

class InputError extends Error {
  constructor(message, status = 400, code = 'COPY_BOT_INVALID_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(`${label} must be an object`);
  return value;
}

function cleanConfig(raw) {
  const config = plainObject(raw, 'config');
  if (Buffer.byteLength(JSON.stringify(config)) > MAX_CONFIG_BYTES) throw new InputError('config is too large');
  const out = {};
  for (const [key, value] of Object.entries(config)) {
    if (!CONFIG_KEYS.has(key)) throw new InputError(`config.${key} is not allowed`);
    if (key === 'assets') {
      if (!Array.isArray(value) || value.length > 200 || value.some((item) => typeof item !== 'string' || item.length > 32)) {
        throw new InputError('config.assets must be a list of symbols');
      }
      out[key] = value;
    } else if (key === 'editorPreferences') {
      const editor = plainObject(value, 'config.editorPreferences');
      for (const [name, item] of Object.entries(editor)) {
        if (!EDITOR_KEYS.has(name) || !['string', 'number', 'boolean'].includes(typeof item)) throw new InputError('config.editorPreferences is invalid');
      }
      out[key] = editor;
    } else if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new InputError(`config.${key} must be finite`);
      if (typeof value === 'string' && value.length > 64) throw new InputError(`config.${key} is too long`);
      out[key] = value;
    } else {
      throw new InputError(`config.${key} has an invalid type`);
    }
  }
  return out;
}

function liveOnly(value) {
  if (value !== undefined && value !== 'live') throw new InputError('In-game copy bots are live only');
  return 'live';
}

function lowerEvm(value, label) {
  const text = String(value || '').trim();
  if (!EVM_RE.test(text)) throw new InputError(`${label} must be an EVM address`);
  return text.toLowerCase();
}

function privateKey(value, label) {
  const text = String(value || '').trim();
  if (!PK_RE.test(text)) throw new InputError(`${label} is invalid`);
  return text;
}

function onlyKeys(object, keys, label) {
  for (const key of Object.keys(object)) if (!keys.includes(key)) throw new InputError(`${label}.${key} is not allowed`);
}

function shortText(value, label, max = 256) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) throw new InputError(`${label} is invalid`);
  return value;
}

function scalars(object, label) {
  for (const [key, value] of Object.entries(object)) {
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new InputError(`${label}.${key} has an invalid type`);
    if (typeof value === 'string' && value.length > 512) throw new InputError(`${label}.${key} is too long`);
  }
}

/**
 * Trade-only credential shapes accepted per venue (ClashBot validateTradingCredential
 * and its venue verifiers). ClashBot re-verifies everything at the venue.
 */
function cleanCredential(venue, destinationAccount, raw) {
  const value = plainObject(raw, 'credential');
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_CREDENTIAL_BYTES) throw new InputError('credential is too large');
  if (TOKEN_VENUES.has(venue)) {
    onlyKeys(value, ['onboardingToken'], 'credential');
    if (!TOKEN_RE.test(String(value.onboardingToken || ''))) throw new InputError('Exchange authorisation token is invalid');
    return { onboardingToken: value.onboardingToken };
  }
  switch (venue) {
    case 'hyperliquid': {
      onlyKeys(value, ['privateKey', 'address', 'validUntil'], 'credential');
      const address = lowerEvm(value.address, 'Hyperliquid agent address');
      if (address === destinationAccount) throw new InputError('Use a Hyperliquid API (agent) wallet, never the main wallet key');
      const validUntil = Number(value.validUntil);
      if (!Number.isSafeInteger(validUntil) || validUntil <= Date.now() + 60_000) throw new InputError('Hyperliquid agent authorisation has expired');
      return { privateKey: privateKey(value.privateKey, 'Hyperliquid agent key'), address, validUntil };
    }
    case 'nado': {
      onlyKeys(value, ['privateKey', 'signerAddress', 'subaccountName'], 'credential');
      const signerAddress = lowerEvm(value.signerAddress, 'NADO linked signer');
      if (signerAddress === destinationAccount) throw new InputError('Use the NADO linked signer, never the main wallet key');
      if (value.subaccountName != null && value.subaccountName !== 'default') throw new InputError('NADO subaccount must be default');
      return { privateKey: privateKey(value.privateKey, 'NADO linked signer key'), signerAddress, subaccountName: 'default' };
    }
    case 'risex': {
      onlyKeys(value, ['privateKey', 'expiresAt', 'builderFeeMaxHundredthBps'], 'credential');
      const expiresAt = Number(value.expiresAt);
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new InputError('RISEx session expiry is invalid');
      const out = { privateKey: privateKey(value.privateKey, 'RISEx session key'), expiresAt };
      if (value.builderFeeMaxHundredthBps != null) {
        const fee = Number(value.builderFeeMaxHundredthBps);
        if (!Number.isInteger(fee) || fee < 100 || fee > 10_000) throw new InputError('RISEx builder fee is invalid');
        out.builderFeeMaxHundredthBps = fee;
      }
      return out;
    }
    case 'bulk': {
      onlyKeys(value, ['schema', 'owner', 'agentPublicKey', 'privateKey', 'onboardingProvenance'], 'credential');
      const owner = String(value.owner || '').trim();
      const agent = String(value.agentPublicKey || '').trim();
      if (!B58_RE.test(owner) || owner !== destinationAccount) throw new InputError('BULK owner must be the destination account');
      if (!B58_RE.test(agent) || agent === owner) throw new InputError('Use the BULK agent wallet, never the main wallet key');
      return {
        schema: 'bulk.agent.v1', owner, agentPublicKey: agent,
        privateKey: privateKey(value.privateKey, 'BULK agent key'),
        onboardingProvenance: 'wallet-signed-agent-wallet-v1',
      };
    }
    case 'gmx': {
      onlyKeys(value, ['owner', 'subaccount', 'privateKey', 'approval', 'chainId', 'referralCode', 'uiFeeReceiver', 'maxUiFeeBps'], 'credential');
      const owner = lowerEvm(value.owner, 'GMX wallet');
      const subaccount = lowerEvm(value.subaccount, 'GMX one-click subaccount');
      if (owner !== destinationAccount) throw new InputError('GMX wallet must be the destination account');
      if (subaccount === owner) throw new InputError('Use a GMX one-click subaccount, never the main wallet key');
      if (Number(value.chainId) !== 42161) throw new InputError('GMX credential must be for Arbitrum');
      const approval = plainObject(value.approval, 'credential.approval');
      scalars(approval, 'credential.approval');
      const maxUiFeeBps = Number(value.maxUiFeeBps);
      if (!Number.isFinite(maxUiFeeBps) || maxUiFeeBps < 0 || maxUiFeeBps > 2) throw new InputError('GMX UI fee is invalid');
      return {
        owner, subaccount, privateKey: privateKey(value.privateKey, 'GMX subaccount key'), approval, chainId: 42161,
        referralCode: shortText(value.referralCode, 'GMX referral code', 64), uiFeeReceiver: lowerEvm(value.uiFeeReceiver, 'GMX UI fee receiver'), maxUiFeeBps,
      };
    }
    case 'arcus': {
      onlyKeys(value, ['schema', 'owner', 'accountIndex', 'publicKey', 'privateKey', 'validUntil', 'apiWalletName', 'onboardingProvenance'], 'credential');
      const owner = lowerEvm(value.owner, 'Arcus wallet');
      if (owner !== destinationAccount) throw new InputError('Arcus wallet must be the destination account');
      const accountIndex = Number(value.accountIndex);
      if (!Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex > 9) throw new InputError('Arcus subaccount is invalid');
      if (!/^[0-9a-f]{64}$/i.test(String(value.publicKey || ''))) throw new InputError('Arcus API key is invalid');
      const validUntil = Number(value.validUntil);
      if (!Number.isSafeInteger(validUntil) || validUntil <= Date.now()) throw new InputError('Arcus API key has expired');
      return {
        schema: 'arcus.apikey.v1', owner, accountIndex, publicKey: String(value.publicKey).toLowerCase(),
        privateKey: privateKey(value.privateKey, 'Arcus API key seed'), validUntil,
        apiWalletName: shortText(value.apiWalletName, 'Arcus API key name', 64), onboardingProvenance: 'wallet-signed-eip712-trade-key-v1',
      };
    }
    case 'qfex': {
      onlyKeys(value, ['schema', 'owner', 'apiKey', 'privateKey', 'subaccountId', 'accountId', 'provenance'], 'credential');
      const owner = lowerEvm(value.owner, 'QFEX wallet');
      if (owner !== destinationAccount) throw new InputError('QFEX wallet must be the destination account');
      if (!/^qfex_pub_\S{4,300}$/.test(String(value.apiKey || ''))) throw new InputError('QFEX API key is invalid');
      if (!/^qfex_secret_\S{4,500}$/.test(String(value.privateKey || ''))) throw new InputError('QFEX API secret is invalid');
      const out = { schema: 'qfex.apikey.v1', owner, apiKey: value.apiKey, privateKey: value.privateKey, provenance: value.provenance === 'wallet-registration' ? 'wallet-registration' : 'api-key' };
      for (const key of ['subaccountId', 'accountId']) {
        if (value[key] != null) out[key] = shortText(value[key], `QFEX ${key}`, 64);
      }
      return out;
    }
    case 'phoenix': {
      onlyKeys(value, ['version', 'owner', 'publicKey', 'secretKey', 'createdAt', 'derivation', 'referralCode', 'referralAccepted',
        'referralAcceptedAt', 'tradingAccessObserved', 'tradingAccessObservedAt', 'builderRoutingEnabled', 'executionMode',
        'positionAuthorityApproved', 'positionAuthorityApprovedAt', 'positionAuthorityDelegationSignature'], 'credential');
      scalars(value, 'credential');
      const owner = String(value.owner || '');
      const agent = String(value.publicKey || '');
      if (!B58_RE.test(owner) || owner !== destinationAccount) throw new InputError('Phoenix wallet must be the destination account');
      if (!B58_RE.test(agent) || agent === owner) throw new InputError('Use a Phoenix delegated position authority, never the main wallet key');
      if (value.executionMode !== 'position_authority' || value.positionAuthorityApproved !== true) {
        throw new InputError('Phoenix needs a delegated position authority');
      }
      if (value.builderRoutingEnabled !== false) throw new InputError('Phoenix builder routing must be disabled');
      if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(String(value.secretKey || ''))) throw new InputError('Phoenix authority key is invalid');
      return { ...value };
    }
    case 'decibel': {
      onlyKeys(value, ['token', 'expiresAt'], 'credential');
      if (!TOKEN_RE.test(String(value.token || ''))) throw new InputError('Decibel authorisation session is invalid');
      return { token: value.token, ...(value.expiresAt == null ? {} : { expiresAt: Number(value.expiresAt) }) };
    }
    default:
      throw new InputError(`${venue} is not available for in-game copy bots`, 400, 'COPY_BOT_VENUE_UNSUPPORTED');
  }
}

function destinationAccountFor(venue, raw) {
  const text = String(raw || '').trim();
  if (venue === 'bulk' || venue === 'phoenix') {
    if (!B58_RE.test(text)) throw new InputError('destinationAccount must be your Solana wallet');
    return text;
  }
  if (venue === 'lighter' || venue === 'rhlighter') {
    if (!/^[0-9]{1,16}$/.test(text)) throw new InputError('destinationAccount must be your Lighter account index');
    return text;
  }
  if (venue === 'decibel') {
    if (!APTOS_RE.test(text)) throw new InputError('destinationAccount must be your Aptos wallet');
    return text.toLowerCase();
  }
  return lowerEvm(text, 'destinationAccount');
}

/** Stable partner user id for a game player (ClashBot accepts [A-Za-z0-9_-]{1,64}). */
function partnerUserId(playerId) {
  const id = String(playerId || '');
  if (/^[A-Za-z0-9_-]{1,64}$/.test(id)) return id;
  return `h${crypto.createHash('sha256').update(id, 'utf8').digest('hex').slice(0, 40)}`;
}

function signRequest({ secret, partnerId, user, method, path, rawBody, now, wallet = '', clientIp = '' }) {
  const timestamp = String(now());
  const nonce = crypto.randomBytes(18).toString('base64url');
  const canonical = ['clash-partner-copy-v2', partnerId, user, wallet, clientIp, timestamp, nonce, method.toUpperCase(), path,
    crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex')].join('\n');
  return {
    'x-clash-partner-id': partnerId,
    'x-clash-partner-user': user,
    'x-clash-partner-version': '2',
    ...(wallet ? { 'x-clash-partner-wallet': wallet } : {}),
    ...(clientIp ? { 'x-clash-partner-client-ip': clientIp } : {}),
    'x-clash-partner-timestamp': timestamp,
    'x-clash-partner-nonce': nonce,
    'x-clash-partner-signature': crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex'),
  };
}

function playerClientIp(req) {
  try {
    const ip = clientAddress(req);
    return require('node:net').isIP(ip) ? ip : '';
  } catch {
    return '';
  }
}

function createClashbotCopyBots({
  apiUrl = process.env.CLASHBOT_PARTNER_API_URL || DEFAULT_API,
  secret = process.env.CLASHBOT_PARTNER_SECRET || '',
  partnerId = process.env.CLASHBOT_PARTNER_ID || 'clash-game',
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = 25_000,
  readLimitPerMinute = 180,
  writeLimitPerMinute = 60,
  now = Date.now,
  log = (...args) => console.warn(...args),
  clientIp = playerClientIp,
} = {}) {
  const base = String(apiUrl || DEFAULT_API).trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/?#]+(\/[A-Za-z0-9._~-]+)*$/i.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[A-Za-z0-9._~-]+)*$/i.test(base)) {
    throw new Error('CLASHBOT_PARTNER_API_URL must be an https URL such as https://clashbot.fun/copy-api');
  }
  const configured = typeof secret === 'string' && /^[0-9a-f]{64}$/i.test(secret.trim());
  const key = configured ? secret.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(partnerId)) throw new Error('CLASHBOT_PARTNER_ID is invalid');
  const limit = createWindow({ now });

  async function upstream(user, method, path, body, { wallet = '', ip = '', headers = {} } = {}) {
    const rawBody = body === undefined ? '' : JSON.stringify(body);
    const signed = signRequest({ secret: key, partnerId, user, method, path, rawBody, now, wallet, clientIp: ip });
    const all = { accept: 'application/json', ...headers, ...signed };
    if (rawBody) all['content-type'] = 'application/json';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}${path}`, {
        method, headers: all, body: rawBody || undefined, signal: controller.signal, redirect: 'error',
      });
      const text = await response.text();
      let payload;
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: `ClashBot returned HTTP ${response.status}` }; }
      return { status: response.status, payload };
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      return {
        status: aborted ? 504 : 502,
        payload: {
          error: aborted ? 'ClashBot took too long to respond' : 'ClashBot is unreachable right now',
          code: aborted ? 'COPY_UPSTREAM_TIMEOUT' : 'COPY_UPSTREAM_UNREACHABLE',
          retryable: true,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const send = (res, result) => res.status(result.status).json(result.payload);

  function botId(raw) {
    const id = String(raw || '');
    if (!ID_RE.test(id)) throw new InputError('Bot id is invalid');
    return id;
  }

  function playerWallet(req, required) {
    const raw = req.headers?.['x-copy-wallet'];
    if (raw == null || raw === '') {
      if (required) throw new InputError('Connect your EVM wallet first', 400, 'COPY_BOT_WALLET_REQUIRED');
      return '';
    }
    return lowerEvm(raw, 'x-copy-wallet');
  }

  /** Creates a live bot: provision with a fresh trade-only connection or a saved one. */
  function createBody(body) {
    const input = plainObject(body, 'body');
    const sourceVenue = String(input.sourceVenue || '');
    const destinationVenue = String(input.destinationVenue || '');
    if (!VENUE_RE.test(sourceVenue)) throw new InputError('sourceVenue is invalid');
    if (!LIVE_VENUES.has(destinationVenue)) {
      throw new InputError(`${destinationVenue || 'This exchange'} is not available for in-game copy bots`, 400, 'COPY_BOT_VENUE_UNSUPPORTED');
    }
    const sourceAccount = String(input.sourceAccount || '').trim();
    if (!SOURCE_ACCOUNT_RE.test(sourceAccount)) throw new InputError('sourceAccount is invalid');
    const destinationAccount = destinationAccountFor(destinationVenue, input.destinationAccount);
    const out = {
      sourceVenue, sourceAccount, destinationVenue, destinationAccount,
      executionMode: liveOnly(input.executionMode),
      config: cleanConfig(input.config),
    };
    if (input.connectionId != null) {
      const connectionId = String(input.connectionId);
      if (!CONNECTION_RE.test(connectionId)) throw new InputError('connectionId is invalid');
      if (input.credential != null) throw new InputError('Send either a new connection or a saved connectionId');
      out.reuseCredential = { connectionId, controlToken: '' };
    } else {
      out.credential = cleanCredential(destinationVenue, destinationAccount, input.credential);
    }
    return out;
  }

  /** Owner wallet ClashBot must see for token venues (Lighter's account index is not the wallet). */
  function provisionWallet(req, body) {
    if (body.destinationVenue === 'lighter' || body.destinationVenue === 'rhlighter') return playerWallet(req, true);
    if (body.destinationVenue === 'grvt' || body.destinationVenue === 'ondo') return body.destinationAccount;
    return playerWallet(req, false);
  }

  async function revokeIdle(user, venue, destinationAccount) {
    const result = await upstream(user, 'POST', `${PREFIX}/connections/revoke`, { venue, destinationAccount });
    if (result.status >= 400) log('[clashbot-copy-bots] connection revoke failed:', result.status, result.payload?.code || '');
    return result;
  }

  async function onboarding(req, user, venue, operation) {
    const allowed = ONBOARDING[venue];
    const method = req.method;
    if (!allowed || !(method === 'GET' || method === 'POST') || !allowed[method].has(operation)) return null;
    const params = new URLSearchParams();
    if (method === 'GET') {
      for (const name of ONBOARDING_QUERY_KEYS) {
        const value = req.query?.[name];
        if (typeof value === 'string' && value.length <= 200 && /^[A-Za-z0-9:_.-]*$/.test(value)) params.set(name, value);
      }
    }
    let body;
    if (method === 'POST') {
      body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      if (Buffer.byteLength(JSON.stringify(body)) > MAX_ONBOARDING_BYTES) throw new InputError('Request is too large');
    }
    const headers = {};
    const session = req.headers?.['x-decibel-session'];
    if (venue === 'decibel' && typeof session === 'string' && TOKEN_RE.test(session)) headers['x-decibel-session'] = session;
    const search = [...params.keys()].length ? `?${params}` : '';
    return upstream(user, method, `${PREFIX}/venues/${venue}/${operation}${search}`, body, {
      wallet: playerWallet(req, ['grvt', 'ondo', 'qfex'].includes(venue)), ip: clientIp(req), headers,
    });
  }

  return async function clashbotCopyBots(req, res) {
    res.setHeader('Cache-Control', 'no-store, private');
    const playerId = req.player?.id;
    if (!playerId) return res.status(401).json({ error: 'Authentication required' });
    const path = String(req.path || '/').replace(/\/+$/, '') || '/';
    const method = req.method;
    if (method === 'GET' && path === '/status') {
      return res.json({ configured, liveVenues: [...LIVE_VENUES], executionModes: ['live'] });
    }
    if (!configured) {
      return res.status(503).json({ error: 'In-game copy bots are not configured yet', code: 'COPY_BOTS_NOT_CONFIGURED' });
    }
    const write = method !== 'GET';
    if (!limit(`copy-bots:${write ? 'w' : 'r'}:${playerId}`, write ? writeLimitPerMinute : readLimitPerMinute).ok) {
      return res.status(429).json({ error: 'Too many copy-bot requests. Try again shortly.', code: 'COPY_BOTS_RATE_LIMITED' });
    }
    const user = partnerUserId(playerId);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      let match;
      if (method === 'GET' && path === '/bots') {
        return send(res, await upstream(user, 'GET', `${PREFIX}/subscriptions`));
      }
      if (method === 'POST' && path === '/bots') {
        const payload = createBody(body);
        return send(res, await upstream(user, 'POST', `${PREFIX}/subscriptions/provision`, payload, {
          wallet: provisionWallet(req, payload), ip: clientIp(req),
        }));
      }
      if ((match = /^\/venues\/([a-z0-9]{2,24})\/([a-z/-]{2,48})$/.exec(path))) {
        const result = await onboarding(req, user, match[1], match[2]);
        if (result) return send(res, result);
        return res.status(404).json({ error: 'Not found', code: 'COPY_BOTS_ROUTE_NOT_FOUND' });
      }
      if ((match = /^\/bots\/([^/]+)$/.exec(path))) {
        const id = botId(match[1]);
        if (method === 'PATCH') {
          const revision = body.expectedConfigRevision;
          if (typeof revision !== 'string' || revision.length < 1 || revision.length > 128) throw new InputError('expectedConfigRevision is required');
          return send(res, await upstream(user, 'PATCH', `${PREFIX}/subscriptions/${id}`, {
            executionMode: liveOnly(body.executionMode), config: cleanConfig(body.config), expectedConfigRevision: revision,
          }));
        }
        if (method === 'DELETE') {
          // Read the route first so the saved key can be shredded once no bot uses it.
          const list = await upstream(user, 'GET', `${PREFIX}/subscriptions`);
          const bot = Array.isArray(list.payload?.items) ? list.payload.items.find((item) => String(item.id) === id) : null;
          const result = await upstream(user, 'DELETE', `${PREFIX}/subscriptions/${id}`);
          if (result.status < 400 && bot) await revokeIdle(user, bot.destinationVenue, bot.destinationAccount);
          return send(res, result);
        }
      }
      if ((match = /^\/bots\/([^/]+)\/(status|flatten|close-only)$/.exec(path)) && method === 'POST') {
        const id = botId(match[1]);
        let payload;
        if (match[2] === 'status') {
          if (!['active', 'paused', 'stopped'].includes(body.status)) throw new InputError('status must be active, paused or stopped');
          if (body.force !== undefined && typeof body.force !== 'boolean') throw new InputError('force must be a boolean');
          payload = { status: body.status, ...(body.force === undefined ? {} : { force: body.force }) };
        } else if (match[2] === 'flatten') {
          if (body.then !== undefined && !['paused', 'stopped'].includes(body.then)) throw new InputError('then must be paused or stopped');
          payload = body.then === undefined ? {} : { then: body.then };
        } else {
          if (typeof body.enabled !== 'boolean') throw new InputError('enabled must be a boolean');
          payload = { enabled: body.enabled };
        }
        return send(res, await upstream(user, 'POST', `${PREFIX}/subscriptions/${id}/${match[2]}`, payload));
      }
      if ((match = /^\/bots\/([^/]+)\/(stats|diagnostics)$/.exec(path)) && method === 'GET') {
        const id = botId(match[1]);
        const limitQuery = match[2] === 'diagnostics' && /^[0-9]{1,3}$/.test(String(req.query?.limit || '')) ? `?limit=${req.query.limit}` : '';
        return send(res, await upstream(user, 'GET', `${PREFIX}/subscriptions/${id}/${match[2]}${limitQuery}`));
      }
      if (method === 'POST' && path === '/connections') {
        const venue = String(body.venue || '');
        if (!LIVE_VENUES.has(venue)) throw new InputError('venue is not supported', 400, 'COPY_BOT_VENUE_UNSUPPORTED');
        return send(res, await upstream(user, 'POST', `${PREFIX}/credentials/reusable`, { venue, credentials: [] }));
      }
      if (method === 'POST' && path === '/connections/revoke') {
        const venue = body.venue == null ? null : String(body.venue);
        if (venue != null && !LIVE_VENUES.has(venue)) throw new InputError('venue is not supported', 400, 'COPY_BOT_VENUE_UNSUPPORTED');
        const account = body.destinationAccount == null ? null : destinationAccountFor(venue || 'hyperliquid', body.destinationAccount);
        return send(res, await revokeIdle(user, venue, account));
      }
      return res.status(404).json({ error: 'Not found', code: 'COPY_BOTS_ROUTE_NOT_FOUND' });
    } catch (error) {
      if (error instanceof InputError) return res.status(error.status).json({ error: error.message, code: error.code });
      log('[clashbot-copy-bots] request failed:', error?.message || error);
      return res.status(500).json({ error: 'Copy bot request failed', code: 'COPY_BOTS_FAILED' });
    }
  };
}

function mountClashbotCopyBots(router, { auth, ...options } = {}) {
  if (typeof auth !== 'function') throw new Error('mountClashbotCopyBots requires the game auth middleware');
  router.use('/v1/copy-bots', auth, createClashbotCopyBots(options));
}

module.exports = {
  createClashbotCopyBots,
  mountClashbotCopyBots,
  _internals: { cleanConfig, cleanCredential, destinationAccountFor, partnerUserId, signRequest, LIVE_VENUES, ONBOARDING, PREFIX },
};
