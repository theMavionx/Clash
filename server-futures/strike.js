'use strict';

// Strike Finance venue adapter (https://strikefinance.org), integrated through Strike's
// Builder Codes API under builder code "clashofperps".
//
// Onboarding (builder connect): the browser generates an Ed25519 API wallet key, we relay
// POST /auth/builder/request-signature (code + fee cap forced server-side), the user signs
// the consent message with their EVM wallet (EIP-191), and we relay verify-signature.
// Strike then creates the account if needed, approves our builder with the signed fee cap
// and binds the API wallet to our builder code.
//
// Every private request is signed with that API wallet key:
//   message = `${METHOD}:${PATH(+?query)}:${TIMESTAMP_S}:${NONCE}:${sha256hex(body)}`
//   headers = X-API-Wallet-Public-Key / -Signature / -Timestamp / -Nonce
// Orders carry X-Builder-Fee-Bps (not signed). The browser keeps the key in the encrypted
// credential vault and sends it per request (like Throne/QFEX); it is never persisted or
// logged here.
//
// Docs: https://docs.strikefinance.org/api/builder-codes
//       https://github.com/strike-finance/strike-builder-reference

const crypto = require('crypto');
const BigNumber = require('bignumber.js');
const { ed25519 } = require('@noble/curves/ed25519');

const API_ORIGIN = String(process.env.STRIKE_API_ORIGIN || 'https://api.strikefinance.org').replace(/\/+$/u, '');
const APP_URL = 'https://app.strikefinance.org';
const BUILDER_CODE = String(process.env.STRIKE_BUILDER_CODE || 'clashofperps').trim();
const clampBps = (value, fallback) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
};
// Fee charged per order (X-Builder-Fee-Bps) and the cap the user approves when connecting.
// The cap is higher than the charge so the rate can be tuned without asking users to reconnect.
const BUILDER_FEE_BPS = clampBps(process.env.STRIKE_BUILDER_FEE_BPS, 1);
const APPROVAL_FEE_BPS = Math.max(BUILDER_FEE_BPS, clampBps(process.env.STRIKE_BUILDER_APPROVAL_BPS, 10));
const VERIFIED_SOURCE = 'strike_builder';
const CHAIN = 'ethereum';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const HEX32 = /^[0-9a-f]{64}$/u;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const SYMBOL = /^[A-Z0-9]{1,24}-USD$/u;
const ORDER_ID = /^\d{1,20}$/u;
const TERMINAL_ORDER_STATUS = new Set(['filled', 'canceled', 'cancelled', 'rejected', 'expired']);
const OPEN_ORDER_STATUS = new Set(['pending', 'open', 'untriggered']);
const TPSL_TYPES = new Set(['take_profit', 'take_profit_limit', 'stop', 'stop_limit']);
const DEPOSIT_ASSETS = { USDC: 6, ETH: 18 };
const MIN_TRANSFER_USD = 5;

let fetchImpl = (...args) => fetch(...args);
let databaseOverride = null;
let timeoutMs = Math.max(2000, Math.min(30000, Number(process.env.STRIKE_TIMEOUT_MS) || 12000));
let nowImpl = () => Date.now();
let sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms));
let clockOffsetMs = 0;
let builderFeeDisabledUntil = 0;
const initialized = new WeakSet();
let marketCache = null, marketLoad = null;
const accountCache = new Map();
const snapshotCache = new Map();
const leverageCache = new Map();

function failure(message, status = 400, code = 'STRIKE_ERROR', extra = {}) {
  return Object.assign(new Error(message), { status, code }, extra);
}

function number(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function positive(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
const present = value => value != null && value !== '' && Number(value) !== 0;

// ------------------------------------------------------------------ keys and identity

function hexToBytes(hex) { return new Uint8Array(Buffer.from(hex, 'hex')); }

function publicKeyFromPrivate(privateKey) {
  const raw = String(privateKey || '').trim().toLowerCase().replace(/^0x/u, '');
  if (!HEX32.test(raw)) throw failure('Invalid Strike trading key', 400, 'STRIKE_CREDENTIALS');
  return Buffer.from(ed25519.getPublicKey(hexToBytes(raw))).toString('hex');
}

/** Validate browser-supplied credentials: the public key must derive from the private key. */
function credentials(input = {}) {
  const accountId = String(input.accountId || input.account_id || '').trim().toLowerCase();
  const publicKey = String(input.publicKey || input.public_key || '').trim().toLowerCase().replace(/^0x/u, '');
  const privateKey = String(input.privateKey || input.private_key || '').trim().toLowerCase().replace(/^0x/u, '');
  const address = String(input.address || '').trim();
  if (!accountId || !publicKey || !privateKey || !address) throw failure('Connect Strike first: the trading key is missing.', 400, 'STRIKE_CREDENTIALS');
  if (!UUID.test(accountId)) throw failure('Invalid Strike account id', 400, 'STRIKE_CREDENTIALS');
  if (!EVM_ADDRESS.test(address)) throw failure('Invalid Strike wallet address', 400, 'STRIKE_CREDENTIALS');
  if (!HEX32.test(publicKey) || !HEX32.test(privateKey)) throw failure('Invalid Strike trading key', 400, 'STRIKE_CREDENTIALS');
  if (publicKeyFromPrivate(privateKey) !== publicKey) throw failure('The Strike trading key does not match its secret. Reconnect Strike.', 400, 'STRIKE_KEY_MISMATCH');
  return { accountId, publicKey, address, seed: hexToBytes(privateKey) };
}

function credentialScope(creds) {
  return crypto.createHash('sha256').update(`strike\0${creds.accountId}\0${creds.publicKey}`).digest('hex');
}

/** API wallet auth headers (services/api/middleware/api_wallet.go in Strike's reference). */
function signRequest(creds, method, pathWithQuery, bodyText = '', timestampMs = nowImpl() + clockOffsetMs, nonce = crypto.randomUUID()) {
  // The timestamp must not be in the future: floor to seconds and step back one second.
  const timestamp = String(Math.floor(timestampMs / 1000) - 1);
  const bodyHash = crypto.createHash('sha256').update(bodyText || '').digest('hex');
  const message = `${String(method).toUpperCase()}:${pathWithQuery}:${timestamp}:${nonce}:${bodyHash}`;
  const signature = Buffer.from(ed25519.sign(new TextEncoder().encode(message), creds.seed)).toString('hex');
  return { 'X-API-Wallet-Public-Key': creds.publicKey, 'X-API-Wallet-Signature': signature,
    'X-API-Wallet-Timestamp': timestamp, 'X-API-Wallet-Nonce': nonce };
}

// ------------------------------------------------------------------ transport

function sanitize(text) { return String(text || '').replace(/[^\x20-\x7E]/gu, '').slice(0, 200); }

/** Large int64 ids (order/fill ids) are kept as strings so JSON.parse never rounds them. */
function parseJson(text) {
  if (!text) return null;
  return JSON.parse(text.replace(/"(ID|id|order_id|trade_id|sequence_id|position_id)"\s*:\s*(\d{16,})/gu, '"$1":"$2"'));
}

function mapStrikeError(httpStatus, body, write) {
  const upstream = sanitize(body?.error || body?.msg || body?.message);
  if (httpStatus === 401) {
    return failure(`Strike rejected the trading key${upstream ? ` (${upstream})` : ''}. Reconnect Strike.`, 401, 'STRIKE_UNAUTHORIZED', { definiteRejection: true, upstream });
  }
  if (httpStatus === 429) return failure('Strike rate limit reached. Try again shortly.', 429, 'STRIKE_RATE_LIMITED', { definiteRejection: true });
  if (httpStatus === 404) return failure(upstream ? `Strike: ${upstream}` : 'Strike could not find this resource.', 404, 'STRIKE_NOT_FOUND', { definiteRejection: true, upstream });
  if (httpStatus === 403) return failure(upstream ? `Strike: ${upstream}` : 'Strike denied access to this account.', 403, 'STRIKE_FORBIDDEN', { definiteRejection: true, upstream });
  if (httpStatus >= 500 || !body) {
    return failure('Strike is unavailable. Refresh the account before retrying.', 502, 'STRIKE_UPSTREAM_ERROR', { outcomeUnknown: !!write });
  }
  if (/insufficient|not enough|margin/iu.test(upstream)) {
    return failure(`Not enough available balance on Strike for this order (${upstream}). Deposit on Strike first.`, 400, 'STRIKE_INSUFFICIENT_MARGIN', { definiteRejection: true, upstream });
  }
  return failure(`Strike rejected the request${upstream ? `: ${upstream}` : '.'}`, 400, write ? 'STRIKE_ORDER_REJECTED' : 'STRIKE_REJECTED', { definiteRejection: true, upstream });
}

async function syncClock() {
  try {
    const response = await fetchImpl(`${API_ORIGIN}/v2/time`, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    const data = parseJson(await response.text());
    const server = Number(data?.serverTime);
    if (Number.isFinite(server) && server > 0) clockOffsetMs = server - nowImpl();
  } catch { /* keep the previous offset */ }
}

/**
 * One Strike REST call. Writes are not retried, except when Strike's auth middleware
 * rejected the signature (nothing ran server-side): that is retried once with a fresh
 * timestamp and nonce, after re-reading Strike's clock when the timestamp was the cause.
 */
async function request(method, path, { creds = null, query = null, body = undefined, rawBody = null, headers: extra = null, attempt = 0 } = {}) {
  if (typeof path !== 'string' || !/^\/(v2|auth|price)\//u.test(path) || path.includes('..') || path.includes('\\')) throw failure('Invalid Strike path');
  const url = new URL(path, API_ORIGIN);
  if (url.origin !== API_ORIGIN) throw failure('Strike origin is not permitted');
  for (const [key, value] of Object.entries(query || {})) if (value != null && value !== '') url.searchParams.set(key, String(value));
  const pathWithQuery = `${url.pathname}${url.search}`;
  const upper = method.toUpperCase();
  const write = upper !== 'GET';
  const bodyText = rawBody != null ? String(rawBody) : body === undefined ? '' : JSON.stringify(body);
  const headers = { ...(bodyText ? { 'Content-Type': 'application/json' } : {}), ...(extra || {}),
    ...(creds ? signRequest(creds, upper, pathWithQuery, bodyText) : {}) };
  let response;
  try {
    response = await fetchImpl(url.toString(), { method: upper, headers, ...(bodyText ? { body: bodyText } : {}),
      signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  } catch {
    throw failure(write ? 'Strike did not answer in time. Refresh the account before retrying.' : 'Strike is unavailable or timed out.',
      write ? 504 : 502, write ? 'STRIKE_TIMEOUT' : 'STRIKE_READ_FAILED', { outcomeUnknown: write });
  }
  let parsed = null;
  try { parsed = parseJson(await response.text()); } catch { parsed = null; }
  if (!response.ok) {
    const upstream = sanitize(parsed?.error);
    if (creds && response.status === 401 && attempt === 0 && /authentication failed|timestamp|expired signature/iu.test(upstream) && !/revoked/iu.test(upstream)) {
      if (/timestamp/iu.test(upstream)) await syncClock();
      return request(method, path, { creds, query, body, rawBody, headers: extra, attempt: 1 });
    }
    console.warn('[strike] upstream rejected', { path: url.pathname, status: response.status, error: upstream || null,
      query: [...url.searchParams.keys()].join(',') || null });
    throw mapStrikeError(response.status, parsed, write);
  }
  return parsed;
}

// ------------------------------------------------------------------ public market data

function baseOf(symbol) { return String(symbol || '').replace(/-USD$/u, ''); }

function symbolOf(value) {
  let symbol = String(value || '').trim().toUpperCase();
  if (/^[A-Z0-9]{1,24}$/u.test(symbol)) symbol = `${symbol}-USD`;
  if (/^[A-Z0-9]{1,24}[-/_]USDC?$/u.test(symbol)) symbol = `${symbol.split(/[-/_]/u)[0]}-USD`;
  if (!SYMBOL.test(symbol)) throw failure('Invalid Strike market symbol', 400, 'STRIKE_SYMBOL');
  return symbol;
}

function normalizeMarket(m = {}, ticker = null) {
  const base = m.base_asset || baseOf(m.symbol);
  const mark = positive(m.mark_price), index = positive(m.index_price), last = positive(m.last_price);
  const tiers = Array.isArray(m.margin_tiers) ? m.margin_tiers : [];
  const maxLeverage = Math.max(1, Math.floor(number(tiers[0]?.max_leverage, number(m.default_leverage, 10))));
  const change = ticker && Number.isFinite(Number(ticker.priceChangePercent)) ? Number(Number(ticker.priceChangePercent).toFixed(4)) : null;
  return { symbol: m.symbol, display_symbol: base, name: m.name || base, base_asset: base, dex: 'strike',
    max_leverage: maxLeverage, default_leverage: number(m.default_leverage, maxLeverage),
    min_order_size: String(m.order_market_min_size ?? ''), min_quantity: String(m.order_market_min_size ?? ''),
    max_quantity: String(m.order_market_max_size ?? ''), lot_size: String(m.order_market_step_size ?? ''),
    limit_lot_size: String(m.order_limit_step_size ?? m.order_market_step_size ?? ''),
    limit_min_quantity: String(m.order_limit_min_size ?? m.order_market_min_size ?? ''),
    limit_max_quantity: String(m.order_limit_max_size ?? ''),
    tick_size: String(m.order_tick_price ?? ''), min_price: m.order_min_price ?? null, max_price: m.order_max_price ?? null,
    min_notional_usd: number(m.order_min_notional), price_bound: number(m.order_limit_price_bound),
    price: String(mark ?? last ?? 0), mark_price: String(mark ?? last ?? 0),
    ...(mark != null ? { mark, last_price: last ?? mark } : {}),
    ...(index != null ? { oracle: index, index_price: index } : {}),
    ...(change != null ? { price_change_24h: change, price_24h_ago: number(ticker.openPrice) || null } : {}),
    ...(ticker ? { high_24h: number(ticker.highPrice), low_24h: number(ticker.lowPrice) } : {}),
    volume_24h: String(ticker?.quoteVolume ?? '0'),
    funding_rate: String(m.funding_rate ?? '0'), next_funding_time: m.next_funding_time ?? null, funding_period_hours: 1,
    bid: positive(m.bid1_price), ask: positive(m.ask1_price),
    asset_class: m.asset_class || null, tags: Array.isArray(m.tags) ? m.tags : [], category: m.category || null,
    reduce_only_market: m.reduce_only === true,
    is_paused: m.status !== 'trading', status: m.status || null, order_types: ['MARKET', 'LIMIT', 'POST_ONLY', 'IOC'] };
}

/** /v2/markets joined with the 24 h tickers of the price service; 10 s cache. */
async function getMarkets(options = {}) {
  if (!options.force && marketCache && nowImpl() - marketCache.time < 10000) return marketCache.rows;
  if (marketLoad) return marketLoad;
  marketLoad = (async () => {
    const [data, tickers] = await Promise.all([request('GET', '/v2/markets'),
      request('GET', '/price/v2/ticker/24hr').catch(() => [])]);
    const markets = data?.markets && typeof data.markets === 'object' ? Object.values(data.markets) : null;
    if (!markets) throw failure('Invalid Strike market response', 502, 'STRIKE_UPSTREAM_ERROR');
    const bySymbol = new Map((Array.isArray(tickers) ? tickers : []).map(t => [t.symbol, t]));
    const rows = markets.filter(m => SYMBOL.test(String(m?.symbol || '')) && m.status !== 'close')
      .map(m => normalizeMarket(m, bySymbol.get(m.symbol)))
      .sort((a, b) => number(b.volume_24h) - number(a.volume_24h));
    marketCache = { rows, time: nowImpl() };
    return rows;
  })().finally(() => { marketLoad = null; });
  return marketLoad;
}

async function getPrices() {
  return (await getMarkets()).map(m => ({ symbol: m.symbol, price: m.price, mark: m.mark, mark_price: m.mark_price,
    oracle_price: m.index_price ?? m.mark_price, funding_rate: m.funding_rate, volume_24h: m.volume_24h,
    ...(m.price_change_24h != null ? { change_24h: m.price_change_24h } : {}) }));
}

const INTERVALS = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']);
const INTERVAL_ALIASES = { 1: '1m', 3: '3m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 120: '2h', 240: '4h', 360: '6h', 480: '8h', 720: '12h', '1D': '1d', D: '1d', '1W': '1w', W: '1w' };
const INTERVAL_SECONDS = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '8h': 28800, '12h': 43200, '1d': 86400, '3d': 259200, '1w': 604800, '1M': 2592000 };

/** OHLCV (Binance-style rows) from the price service; times in seconds for the terminal. */
async function getCandles(symbol, options = {}) {
  const requested = String(options.interval || options.resolution || '5m');
  const interval = INTERVALS.has(requested) ? requested : INTERVAL_ALIASES[requested];
  if (!interval) throw failure('Unsupported Strike candle interval', 400, 'STRIKE_INTERVAL');
  const limit = Math.max(10, Math.min(1500, Math.floor(Number(options.limit) || 500)));
  const endSec = Math.floor(Number(options.end) || nowImpl() / 1000);
  const startSec = Math.floor(Number(options.start) || endSec - INTERVAL_SECONDS[interval] * limit);
  const rows = await request('GET', '/price/v2/klines', { query: { symbol: symbolOf(symbol), interval, limit,
    startTime: startSec * 1000, endTime: endSec * 1000, priceType: 'last' } });
  if (!Array.isArray(rows)) throw failure('Invalid Strike candle response', 502, 'STRIKE_UPSTREAM_ERROR');
  return rows.filter(Array.isArray).map(r => ({ time: Math.floor(number(r[0]) / 1000), open: number(r[1]), high: number(r[2]),
    low: number(r[3]), close: number(r[4]), volume: number(r[5]) })).slice(-limit);
}

/** Public order book (price service depth). */
async function getOrderbook(symbol) {
  const sym = symbolOf(symbol);
  const raw = await request('GET', '/price/v2/depth', { query: { symbol: sym, limit: 25 } });
  const level = row => [String(row[0]), String(row[1])];
  return { symbol: sym, bids: (raw?.bids || []).filter(Array.isArray).map(level), asks: (raw?.asks || []).filter(Array.isArray).map(level),
    timestamp: raw?.E ?? raw?.T ?? null };
}

// ------------------------------------------------------------------ builder connect (relayed, never signed here)

const relayLimiter = new Map();
function limitRelay(playerId, kind, gapMs = 3000) {
  const key = `${kind}:${String(playerId || 'anonymous')}`;
  if (nowImpl() - (relayLimiter.get(key) || 0) < gapMs) throw failure('Please wait a few seconds before trying again.', 429, 'STRIKE_RATE_LIMITED');
  relayLimiter.set(key, nowImpl());
  if (relayLimiter.size > 2000) relayLimiter.delete(relayLimiter.keys().next().value);
}

/**
 * Step 1 of builder connect. The builder code and the approved fee cap are fixed here so a
 * client cannot connect users to another builder or ask for a different fee.
 */
async function requestConnectSignature(input = {}, options = {}) {
  limitRelay(options.playerId, 'connect');
  const address = String(input.address || '').trim();
  const publicKey = String(input.publicKey || input.public_key || '').trim().toLowerCase().replace(/^0x/u, '');
  if (!EVM_ADDRESS.test(address)) throw failure('Connect an EVM wallet to use Strike.', 400, 'STRIKE_WALLET_ADDRESS');
  if (!HEX32.test(publicKey)) throw failure('Invalid Strike API wallet key', 400, 'STRIKE_CONNECT');
  const data = await request('POST', '/auth/builder/request-signature', { body: { address, chain: CHAIN, code: BUILDER_CODE,
    fee_share_bps: APPROVAL_FEE_BPS, public_key: publicKey } });
  const message = String(data?.message_to_sign || '');
  const nonce = String(data?.nonce || '');
  if (!UUID.test(nonce) || !message) throw failure('Strike returned an invalid connect challenge', 502, 'STRIKE_UPSTREAM_ERROR');
  // The consent text must name our builder, this wallet and this key; anything else is refused.
  if (!message.includes(`"${BUILDER_CODE}"`) || !message.toLowerCase().includes(publicKey) || !message.toLowerCase().includes(address.toLowerCase())) {
    throw failure('Strike returned an unexpected connect message', 502, 'STRIKE_UPSTREAM_ERROR');
  }
  return { nonce, message_to_sign: message, builder_code: BUILDER_CODE, fee_share_bps: APPROVAL_FEE_BPS, chain: CHAIN };
}

/** Step 2: relay the wallet signature; Strike creates the account and the API wallet. */
async function verifyConnectSignature(input = {}, options = {}) {
  limitRelay(options.playerId, 'verify', 1000);
  const nonce = String(input.nonce || '').trim();
  const signature = String(input.walletSignature || input.wallet_signature || '').trim();
  if (!UUID.test(nonce)) throw failure('Invalid Strike connect nonce', 400, 'STRIKE_CONNECT');
  if (!/^(0x)?[0-9a-fA-F]{130}$/u.test(signature)) throw failure('Invalid wallet signature', 400, 'STRIKE_SIGNATURE');
  const data = await request('POST', '/auth/builder/verify-signature', { body: { nonce, wallet_signature: signature } });
  const accountId = String(data?.account_id || '').toLowerCase();
  if (!UUID.test(accountId)) throw failure('Strike did not return an account', 502, 'STRIKE_UPSTREAM_ERROR');
  if (String(data?.builder_code || '') !== BUILDER_CODE) throw failure('Strike connected an unexpected builder', 502, 'STRIKE_UPSTREAM_ERROR');
  return { account_id: accountId, builder_code: BUILDER_CODE, fee_share_bps: number(data?.fee_share_bps, APPROVAL_FEE_BPS),
    api_wallet_public_key: String(data?.api_wallet_public_key || '').toLowerCase(),
    api_wallet_expired_at: data?.api_wallet_expired_at || null, referral: data?.referral?.status || null };
}

// ------------------------------------------------------------------ persistence (futures SQLite)

function database() {
  const db = databaseOverride || require('./db').db;
  ensureSchema(db);
  return db;
}

function ensureSchema(db = databaseOverride || require('./db').db) {
  if (initialized.has(db)) return db;
  db.exec(`CREATE TABLE IF NOT EXISTS strike_account_claims (
    account_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, address TEXT NOT NULL,
    builder_code TEXT NOT NULL DEFAULT 'clashofperps', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS strike_action_intents (
    account_id TEXT NOT NULL, player_id TEXT NOT NULL, action_id TEXT NOT NULL,
    kind TEXT NOT NULL, payload_hash TEXT NOT NULL, client_order_id TEXT NOT NULL,
    builder_code TEXT NOT NULL DEFAULT 'clashofperps', builder_fee_bps INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL, order_id TEXT, order_status TEXT, order_builder_code TEXT,
    result_json TEXT, params_json TEXT, fills_done INTEGER NOT NULL DEFAULT 0,
    filled_quantity TEXT NOT NULL DEFAULT '0', last_checked_at INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(account_id, player_id, action_id));
    CREATE INDEX IF NOT EXISTS strike_action_order ON strike_action_intents(account_id, order_id);
    CREATE INDEX IF NOT EXISTS strike_action_pending_fills ON strike_action_intents(account_id, player_id, fills_done, kind, status);`);
  initialized.add(db);
  return db;
}

function claimAccount(playerId, creds) {
  if (!playerId) throw failure('Player authentication is required', 401, 'STRIKE_AUTH');
  const db = database();
  db.prepare('INSERT OR IGNORE INTO strike_account_claims(account_id,player_id,address,builder_code) VALUES (?,?,?,?)')
    .run(creds.accountId, String(playerId), creds.address.toLowerCase(), BUILDER_CODE);
  const claim = db.prepare('SELECT player_id FROM strike_account_claims WHERE account_id=?').get(creds.accountId);
  if (claim.player_id !== String(playerId)) throw failure('This Strike account is linked to another player', 409, 'STRIKE_ACCOUNT_CLAIMED');
}

/** Public wallet lookup; Strike may store the checksummed or lower-case form. */
async function accountIdForAddress(address) {
  const forms = [...new Set([address, address.toLowerCase()])];
  let lastError = null;
  for (const form of forms) {
    try {
      const data = await request('GET', '/v2/account', { query: { blockchain: CHAIN, blockchain_address: form } });
      return String(data?.account_id || '').toLowerCase() || null;
    } catch (error) {
      lastError = error;
      if (error.code !== 'STRIKE_NOT_FOUND') throw error;
    }
  }
  if (lastError?.code === 'STRIKE_NOT_FOUND') return null;
  throw lastError;
}

/**
 * Verified identity: the API wallet authenticates for exactly the claimed account
 * (signed GET /v2/account) and Strike's public lookup maps the wallet address to that
 * account. Cached for 60 s.
 */
async function resolveAccount(credsInput) {
  const creds = credsInput?.seed instanceof Uint8Array ? credsInput : credentials(credsInput);
  const key = credentialScope(creds);
  const cached = accountCache.get(key);
  if (cached && nowImpl() - cached.time < 60000) return { ...creds, info: cached.info };
  const [owner, info] = await Promise.all([accountIdForAddress(creds.address), request('GET', '/v2/account', { creds })]);
  if (String(info?.account_id || '').toLowerCase() !== creds.accountId) {
    throw failure('The Strike trading key belongs to a different account. Reconnect Strike.', 403, 'STRIKE_ACCOUNT_MISMATCH');
  }
  if (owner !== creds.accountId) {
    throw failure('Strike does not list this wallet for the connected account. Reconnect Strike.', 403, 'STRIKE_WALLET_MISMATCH');
  }
  if (accountCache.size >= 512) accountCache.delete(accountCache.keys().next().value);
  accountCache.set(key, { info, time: nowImpl() });
  return { ...creds, info };
}

function beginAction(creds, playerId, actionId, kind, params, feeBps = 0) {
  if (!UUID.test(String(actionId || ''))) throw failure('A stable actionId UUID is required', 400, 'STRIKE_ACTION_ID');
  claimAccount(playerId, creds);
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ kind, params })).digest('hex');
  const db = database();
  const inserted = db.prepare(`INSERT OR IGNORE INTO strike_action_intents
    (account_id,player_id,action_id,kind,payload_hash,client_order_id,builder_code,builder_fee_bps,status,params_json)
    VALUES (?,?,?,?,?,?,?,?,'pending',?)`).run(creds.accountId, String(playerId), actionId, kind, payloadHash,
    params.client_order_id || '', BUILDER_CODE, feeBps, JSON.stringify(params));
  const row = db.prepare('SELECT * FROM strike_action_intents WHERE account_id=? AND player_id=? AND action_id=?')
    .get(creds.accountId, String(playerId), actionId);
  if (row.payload_hash !== payloadHash) throw failure('actionId already belongs to a different request', 409, 'STRIKE_ACTION_CONFLICT');
  if (!inserted.changes && !['accepted', 'reconciled'].includes(row.status)) {
    throw failure('This action was already attempted. Refresh account and history; do not resend.', 409, `STRIKE_ACTION_${row.status.toUpperCase()}`);
  }
  return { row, created: !!inserted.changes };
}

function finishAction(row, status, result) {
  database().prepare(`UPDATE strike_action_intents SET status=?,order_id=COALESCE(?,order_id),result_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE account_id=? AND player_id=? AND action_id=?`).run(status, result.order_id != null ? String(result.order_id) : null,
    JSON.stringify(result), row.account_id, row.player_id, row.action_id);
}

function recordOrder(row, order) {
  database().prepare(`UPDATE strike_action_intents SET order_id=COALESCE(?,order_id), order_status=?, order_builder_code=?,
    updated_at=CURRENT_TIMESTAMP WHERE account_id=? AND player_id=? AND action_id=?`).run(order?.ID != null ? String(order.ID) : null,
    String(order?.Status || '').toLowerCase() || null, order?.Builder?.Code ?? null, row.account_id, row.player_id, row.action_id);
}

/** Record a durable intent, send once, and keep Strike's ids as reward proof. */
async function executeAction(creds, input, options, kind, params, send, feeBps = 0) {
  const actionId = input.actionId || input.idempotencyKey;
  const intent = beginAction(creds, options.playerId || input.playerId, actionId, kind, params, feeBps);
  if (!intent.created) return { ...JSON.parse(intent.row.result_json || '{}'), replayed: true };
  try {
    const data = await send();
    const orderId = data?.order_id ?? null;
    const normalized = { success: true, order_id: orderId != null ? String(orderId) : null,
      client_order_id: data?.client_order_id ?? data?.primary_client_order_id ?? params.client_order_id ?? null,
      status: data?.status || 'accepted', action_id: actionId, account_id: creds.accountId,
      builder_code: BUILDER_CODE, builder_fee_bps: feeBps, sequence_id: data?.sequence_id ?? null };
    finishAction(intent.row, 'accepted', normalized);
    snapshotCache.clear();
    return { ...normalized, _row: intent.row };
  } catch (error) {
    finishAction(intent.row, error.outcomeUnknown ? 'unknown' : 'rejected', { error: error.message, code: error.code || null });
    throw error;
  }
}

function deriveActionId(actionId, step) {
  const hex = crypto.createHash('sha256').update(`strike-step\0${actionId}\0${step}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ------------------------------------------------------------------ account snapshot

function orderSide(side) { return String(side || '').toLowerCase() === 'buy' ? 'bid' : 'ask'; }

function remaining(order) {
  const left = new BigNumber(String(order.Size ?? 0)).minus(String(order.Filled ?? 0));
  return left.isFinite() ? left.toFixed() : String(order.Size ?? '');
}

function normalizeOrder(o) {
  const type = String(o.Type || '').toLowerCase();
  const isStop = TPSL_TYPES.has(type);
  const trigger = positive(o.StopPrice);
  return { id: String(o.ID), order_id: String(o.ID), client_order_id: o.ClientOrderID || null, symbol: o.Symbol,
    side: orderSide(o.Side), price: String(isStop ? (o.StopPrice ?? '') : (o.Price ?? '')), amount: remaining(o),
    order_type: type === 'stop' ? 'stop_loss' : type, raw_type: type, status: String(o.Status || '').toLowerCase(),
    reduce_only: o.ReduceOnly === true, close_position: o.ClosePosition === true, time_in_force: o.TimeInForce || null,
    ...(isStop ? { is_stop: true, trigger_price: trigger != null ? String(trigger) : null, stop_price: trigger != null ? String(trigger) : null } : {}),
    ...(o.Strategy?.ID ? { strategy_id: o.Strategy.ID, strategy_primary: o.Strategy.IsPrimary === true } : {}),
    builder_code: o.Builder?.Code ?? null,
    created_at: number(o.CreateTimestamp) > 0 ? new Date(number(o.CreateTimestamp)).toISOString() : null };
}

/** TP/SL legs of open positions: reduce-only take_profit / stop (and their limit variants) orders. */
function tpslLegs(orders) {
  return orders.filter(o => o.is_stop && (o.reduce_only || o.close_position) && OPEN_ORDER_STATUS.has(o.status) && !(o.strategy_id && !o.strategy_primary && o.status === 'pending'))
    .map(o => ({ kind: o.raw_type.startsWith('take_profit') ? 'TAKE_PROFIT' : 'STOP_LOSS', symbol: o.symbol,
      close_side: o.side, trigger_price: number(o.trigger_price), order_id: o.order_id, quantity: number(o.amount) }));
}

async function readLeverageMap(creds, accountInfo = null) {
  const hit = leverageCache.get(creds.accountId);
  if (hit && nowImpl() - hit.time < 30000) return hit.map;
  let settings = null;
  try { settings = (await request('GET', '/v2/symbols', { creds }))?.symbol_settings; } catch { settings = null; }
  settings = settings || accountInfo?.symbol_settings || creds.info?.symbol_settings || {};
  const map = {};
  for (const [symbol, row] of Object.entries(settings || {})) {
    const value = number(row?.leverage);
    if (SYMBOL.test(symbol) && value > 0) map[symbol] = value;
  }
  if (leverageCache.size >= 512) leverageCache.delete(leverageCache.keys().next().value);
  leverageCache.set(creds.accountId, { map, time: nowImpl() });
  return map;
}

async function getAccountSnapshot(credsInput, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds);
  const key = `${String(options.playerId || '')}:${credentialScope(creds)}`;
  const hit = snapshotCache.get(key);
  if (hit && (hit.pending || (!options.force && nowImpl() - hit.time < 4000))) return hit.promise;
  if (snapshotCache.size >= 128) snapshotCache.delete(snapshotCache.keys().next().value);
  const entry = { time: nowImpl(), pending: true };
  entry.promise = loadAccountSnapshot(creds).then(result => { entry.pending = false; entry.time = nowImpl(); return result; },
    error => { snapshotCache.delete(key); throw error; });
  snapshotCache.set(key, entry);
  return entry.promise;
}

async function loadAccountSnapshot(creds) {
  const [info, positionData, orderData, markets] = await Promise.all([
    request('GET', '/v2/account', { creds }),
    request('GET', '/v2/positions', { creds }),
    request('GET', '/v2/openOrders', { creds }),
    getMarkets()]);
  const leverageSettings = await readLeverageMap(creds, info).catch(() => ({}));
  const marketMap = new Map(markets.map(m => [m.symbol, m]));
  const orders = (Array.isArray(orderData?.orders) ? orderData.orders : []).map(normalizeOrder);
  const legs = tpslLegs(orders);
  const positions = (Array.isArray(positionData?.positions) ? positionData.positions : []).filter(p => number(p.size) !== 0).map(p => {
    const qty = number(p.size), long = qty > 0;
    const market = marketMap.get(p.symbol);
    const mark = number(market?.mark) || number(p.entry_price);
    const entry = number(p.entry_price);
    const closeSide = long ? 'ask' : 'bid';
    const tp = legs.find(l => l.symbol === p.symbol && l.kind === 'TAKE_PROFIT' && l.close_side === closeSide);
    const sl = legs.find(l => l.symbol === p.symbol && l.kind === 'STOP_LOSS' && l.close_side === closeSide);
    const leverage = number(p.leverage) || null;
    const isolated = String(p.margin_mode || '').toLowerCase() === 'isolated';
    return { symbol: p.symbol, position_id: String(p.id ?? p.symbol), side: long ? 'bid' : 'ask', amount: String(Math.abs(qty)),
      entry_price: String(entry), mark_price: String(mark), leverage, liquidation_price: positive(p.liquidation_price),
      margin: isolated && positive(p.iso_balance) ? number(p.iso_balance) : (leverage ? Math.abs(qty * mark) / leverage : null),
      unrealized_pnl: number(p.upnl, (mark - entry) * qty), margin_mode: isolated ? 'ISOLATED' : 'CROSS',
      funding_fee: number(p.accumulated_funding_fees),
      take_profit: tp ? String(tp.trigger_price) : null, stop_loss: sl ? String(sl.trigger_price) : null,
      tp_price: tp?.trigger_price ?? null, sl_price: sl?.trigger_price ?? null,
      tp_order_id: tp?.order_id || null, sl_order_id: sl?.order_id || null, _raw: p };
  });
  const leverage = { ...leverageSettings, ...Object.fromEntries(positions.filter(p => p.leverage).map(p => [p.symbol, p.leverage])) };
  const wallet = number(info?.wallet_balance), available = number(info?.available_balance), equity = number(info?.margin_balance, wallet);
  return {
    account: { account_id: creds.accountId, address: creds.address, builder_code: BUILDER_CODE,
      balance: wallet, wallet_balance: wallet, available_to_spend: available, free_collateral: available,
      equity, account_equity: equity, unrealized_pnl: number(info?.unrealized_pnl),
      total_margin_used: number(info?.total_margin), maintenance_margin: number(info?.maintenance_margin), currency: 'USD',
      builder_fee_bps: BUILDER_FEE_BPS, ...(wallet <= 0 && available <= 0 ? { empty_account: true } : {}) },
    positions, orders, leverage, markets,
    prices: markets.map(m => ({ symbol: m.symbol, price: m.price, mark: m.mark, mark_price: m.mark_price,
      ...(m.price_change_24h != null ? { price_change_24h: m.price_change_24h } : {}) })),
  };
}

// ------------------------------------------------------------------ trading

function decimal(value) { return new BigNumber(String(value ?? '')); }

function exactNumber(value, step, minimum, maximum, label) {
  const amount = decimal(value), increment = decimal(step);
  if (!amount.isFinite() || amount.lte(0)) throw failure(`${label} must be positive`, 400, 'STRIKE_ORDER_INVALID');
  if (!increment.isFinite() || increment.lte(0)) throw failure(`Strike ${label} precision unavailable`, 502, 'STRIKE_UPSTREAM_ERROR');
  if (!amount.mod(increment).eq(0)) throw failure(`${label} must be a multiple of ${step}`, 400, 'STRIKE_ORDER_INVALID');
  if (minimum != null && minimum !== '' && amount.lt(minimum)) throw failure(`${label} is below the Strike minimum ${minimum}`, 400, 'STRIKE_ORDER_INVALID');
  if (maximum != null && maximum !== '' && Number(maximum) > 0 && amount.gt(maximum)) throw failure(`${label} exceeds the Strike maximum ${maximum}`, 400, 'STRIKE_ORDER_INVALID');
  return amount.toFixed();
}

/** Round a quantity down to the lot size (the UI sends USD-derived sizes). */
function floorToStep(value, step) {
  const amount = decimal(value), increment = decimal(step);
  if (!amount.isFinite() || !increment.isFinite() || increment.lte(0)) return amount;
  return amount.div(increment).integerValue(BigNumber.ROUND_FLOOR).times(increment);
}

async function marketFor(symbol) {
  const market = (await getMarkets()).find(m => m.symbol === symbol);
  if (!market || market.is_paused) throw failure('This Strike market is not trading right now', 409, 'STRIKE_MARKET_UNAVAILABLE');
  return market;
}

/** Strike POST /v2/order body; client_order_id is our action UUID. */
async function orderParams(input, actionId) {
  if (!UUID.test(String(actionId || ''))) throw failure('A stable actionId UUID is required', 400, 'STRIKE_ACTION_ID');
  const symbol = symbolOf(input.symbol);
  const market = await marketFor(symbol);
  const rawSide = String(input.side || '').toUpperCase();
  if (!['BID', 'ASK', 'BUY', 'SELL', 'LONG', 'SHORT'].includes(rawSide)) throw failure('Invalid order side', 400, 'STRIKE_ORDER_INVALID');
  const side = ['BID', 'BUY', 'LONG'].includes(rawSide) ? 'buy' : 'sell';
  const requested = String(input.orderType || input.order_type || 'MARKET').toUpperCase();
  if (!['MARKET', 'LIMIT'].includes(requested)) throw failure('Unsupported Strike order type', 400, 'STRIKE_ORDER_INVALID');
  const type = requested.toLowerCase();
  const reduceOnly = input.reduceOnly === true || input.reduce_only === true;
  const limit = type === 'limit';
  const step = limit ? market.limit_lot_size : market.lot_size;
  const size = exactNumber(floorToStep(input.quantity ?? input.amount, step).toFixed(), step,
    limit ? market.limit_min_quantity : market.min_quantity, limit ? market.limit_max_quantity : market.max_quantity, 'Size');
  const params = { client_order_id: String(actionId).toLowerCase(), symbol, side, type, size, reduce_only: reduceOnly };
  if (limit) {
    params.price = exactNumber(input.price, market.tick_size, market.min_price, market.max_price, 'Price');
    const tif = String(input.timeInForce || input.time_in_force || 'GTC').toUpperCase();
    params.time_in_force = tif === 'ALO' || tif === 'POST_ONLY' ? 'ALO' : tif === 'IOC' || tif === 'FOK' ? 'IOC' : 'GTC';
  }
  if (input.closePosition === true) params.close_position = true;
  const reference = number(params.price) || positive(market.mark) || 0;
  if (!reduceOnly && reference > 0 && number(size) * reference < number(market.min_notional_usd)) {
    throw failure(`Order value is below the Strike minimum of $${market.min_notional_usd}`, 400, 'STRIKE_ORDER_INVALID');
  }
  return { params, market };
}

function checkLeverage(market, value) {
  const leverage = Number(value);
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > market.max_leverage) {
    throw failure(`Leverage must be a whole number between 1 and ${market.max_leverage}`, 400, 'STRIKE_LEVERAGE_INVALID');
  }
  return leverage;
}

async function writeLeverage(creds, symbol, leverage) {
  const data = await request('POST', '/v2/leverage', { creds, body: { symbol, leverage } });
  const hit = leverageCache.get(creds.accountId);
  if (hit) hit.map[symbol] = number(data?.leverage, leverage);
  snapshotCache.clear();
  return data;
}

async function setLeverage(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds);
  const symbol = symbolOf(input.symbol);
  const leverage = checkLeverage(await marketFor(symbol), input.leverage);
  const current = (await readLeverageMap(creds).catch(() => ({})))[symbol];
  if (current === leverage) return { success: true, unchanged: true, symbol, leverage, account_id: creds.accountId };
  await writeLeverage(creds, symbol, leverage);
  return { success: true, symbol, leverage, account_id: creds.accountId };
}

/** Builder fee header for an order; the fee is charged on fill, never on placement. */
function builderFeeHeaders() {
  return BUILDER_FEE_BPS > 0 && nowImpl() >= builderFeeDisabledUntil ? { 'X-Builder-Fee-Bps': String(BUILDER_FEE_BPS) } : null;
}

/**
 * POST an order with our builder fee. Strike rejects (HTTP 400, order not placed) a fee above
 * the user's approved cap or our registered builder fee; in that case the order is sent once
 * more with no fee header, so trading never breaks on a fee misconfiguration. Fills are still
 * attributed to our builder code.
 */
async function postOrder(creds, path, body) {
  const headers = builderFeeHeaders();
  try {
    return { data: await request('POST', path, { creds, body, headers }), feeBps: headers ? BUILDER_FEE_BPS : 0 };
  } catch (error) {
    if (!headers || error.status !== 400 || !/builder/iu.test(String(error.upstream || ''))) throw error;
    console.warn('[strike] builder fee rejected; retrying without fee header', { error: error.upstream });
    builderFeeDisabledUntil = nowImpl() + 10 * 60 * 1000;
    return { data: await request('POST', path, { creds, body }), feeBps: 0 };
  }
}

function tpslLeg(kind, price, size, clientOrderId) {
  return { client_order_id: clientOrderId, type: kind === 'TAKE_PROFIT' ? 'take_profit' : 'stop', size, stop_price: price, working_type: 'mark_price' };
}

/** Validate TP/SL against a reference price (limit price, or mark for market entries). */
function ticketLegs(params, market, takeProfit, stopLoss) {
  const long = params.side === 'buy';
  const reference = number(params.price) || number(market.mark);
  const legs = {};
  if (present(takeProfit)) {
    const price = exactNumber(takeProfit, market.tick_size, null, null, 'Take profit');
    if (reference > 0 && (long ? number(price) <= reference : number(price) >= reference)) {
      throw failure(`Take profit must be ${long ? 'above' : 'below'} ${params.price ? 'the limit price' : 'the current price'} (${reference}).`, 400, 'STRIKE_TPSL_INVALID');
    }
    legs.tp = price;
  }
  if (present(stopLoss)) {
    const price = exactNumber(stopLoss, market.tick_size, null, null, 'Stop loss');
    if (reference > 0 && (long ? number(price) >= reference : number(price) <= reference)) {
      throw failure(`Stop loss must be ${long ? 'below' : 'above'} ${params.price ? 'the limit price' : 'the current price'} (${reference}).`, 400, 'STRIKE_TPSL_INVALID');
    }
    legs.sl = price;
  }
  return legs;
}

/** Strike orders are asynchronous: read the order back by client id to learn its id/outcome. */
const ORDER_READBACK_DELAYS_MS = [250, 500, 1000];
async function readOrderByClientId(creds, symbol, clientOrderId) {
  try { return await request('GET', '/v2/order', { creds, query: { symbol, client_order_id: clientOrderId } }); }
  catch (error) { if (error.code === 'STRIKE_NOT_FOUND') return null; throw error; }
}

async function confirmPlacement(creds, result, symbol) {
  const row = result._row;
  delete result._row;
  if (!row || !result.client_order_id) return result;
  for (const delay of ORDER_READBACK_DELAYS_MS) {
    await sleepImpl(delay);
    let order = null;
    try { order = await readOrderByClientId(creds, symbol, result.client_order_id); } catch { break; }
    if (!order) continue;
    recordOrder(row, order);
    result.order_id = String(order.ID);
    result.order_status = String(order.Status || '').toLowerCase();
    if (result.order_status === 'rejected') {
      const reason = sanitize(order.CloseReason) || 'rejected by the matching engine';
      finishAction(row, 'rejected', { ...result, error: reason });
      throw failure(`Strike rejected the order: ${reason.replace(/_/gu, ' ')}`, 400, 'STRIKE_ORDER_REJECTED', { definiteRejection: true });
    }
    finishAction(row, 'accepted', result);
    if (result.order_status !== 'pending') break;
  }
  return result;
}

async function placeOrder(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const actionId = input.actionId || input.idempotencyKey;
  const { params, market } = await orderParams(input, actionId);
  const takeProfit = input.takeProfit ?? input.take_profit, stopLoss = input.stopLoss ?? input.stop_loss;
  const wantsTpsl = !params.reduce_only && (present(takeProfit) || present(stopLoss));
  const legs = wantsTpsl ? ticketLegs(params, market, takeProfit, stopLoss) : null;
  if (input.leverage != null && input.leverage !== '' && !params.reduce_only) {
    // Leverage is a per-symbol account setting on Strike; align it before the order.
    const wanted = Math.round(Number(input.leverage));
    if (Number.isFinite(wanted) && wanted >= 1) {
      const current = (await readLeverageMap(creds).catch(() => ({})))[params.symbol];
      if (current !== wanted) {
        if (options.playerId) claimAccount(options.playerId, creds);
        await writeLeverage(creds, params.symbol, checkLeverage(market, wanted));
      }
    }
  }
  let result;
  if (legs) {
    // Entry + TP/SL in one strategy order: legs are placed once the entry fills and
    // one-cancels-other afterwards.
    const body = { strategy_id: deriveActionId(actionId, 'strategy'), ...params,
      ...(legs.tp ? { tp_order: tpslLeg('TAKE_PROFIT', legs.tp, params.size, deriveActionId(actionId, 'tp')) } : {}),
      ...(legs.sl ? { sl_order: tpslLeg('STOP_LOSS', legs.sl, params.size, deriveActionId(actionId, 'sl')) } : {}) };
    delete body.reduce_only;
    let feeBps = 0;
    result = await executeAction(creds, input, options, 'strategy_order', body, async () => {
      const sent = await postOrder(creds, '/v2/order/strategy', body); feeBps = sent.feeBps; return sent.data;
    }, BUILDER_FEE_BPS);
    if (feeBps !== BUILDER_FEE_BPS && result._row) database().prepare('UPDATE strike_action_intents SET builder_fee_bps=? WHERE account_id=? AND player_id=? AND action_id=?')
      .run(feeBps, result._row.account_id, result._row.player_id, result._row.action_id);
    result.tpsl = { attached: 'strategy', take_profit: legs.tp || null, stop_loss: legs.sl || null };
  } else {
    let feeBps = 0;
    result = await executeAction(creds, input, options, 'add_order', params, async () => {
      const sent = await postOrder(creds, '/v2/order', params); feeBps = sent.feeBps; return sent.data;
    }, BUILDER_FEE_BPS);
    if (feeBps !== BUILDER_FEE_BPS && result._row) database().prepare('UPDATE strike_action_intents SET builder_fee_bps=? WHERE account_id=? AND player_id=? AND action_id=?')
      .run(feeBps, result._row.account_id, result._row.player_id, result._row.action_id);
  }
  if (result.replayed) { delete result._row; return result; }
  return confirmPlacement(creds, result, params.symbol);
}

async function cancelOrder(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const symbol = symbolOf(input.symbol);
  const orderId = String(input.orderId || input.order_id || '').trim();
  if (!ORDER_ID.test(orderId)) throw failure('Strike order id is required', 400, 'STRIKE_ORDER_INVALID');
  const result = await executeAction(creds, input, options, 'cancel_order', { symbol, order_id: orderId },
    () => request('DELETE', '/v2/order/cancel', { creds, rawBody: `{"order_id":${orderId},"symbol":${JSON.stringify(symbol)}}` })
      .then(data => ({ ...data, order_id: orderId })));
  delete result._row;
  return result;
}

async function readPosition(creds, symbol) {
  const data = await request('GET', '/v2/positions', { creds, query: { symbol } });
  return (data?.positions || []).find(p => p.symbol === symbol && number(p.size) !== 0) || null;
}

/** Close with a reduce-only market order on the opposite side (close_position for a full close). */
async function closePosition(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const symbol = symbolOf(input.symbol || input.positionId);
  const position = await readPosition(creds, symbol);
  if (!position) throw failure('No Strike position exists for this symbol', 409, 'STRIKE_NO_POSITION');
  const size = Math.abs(number(position.size));
  const full = input.fullClose === true;
  const requested = full ? size : (input.quantity ?? input.amount ?? size);
  if (decimal(requested).gt(size)) throw failure('Close quantity exceeds the open position', 400, 'STRIKE_ORDER_INVALID');
  const { params } = await orderParams({ symbol, quantity: full ? String(position.size).replace(/^-/u, '') : requested,
    side: number(position.size) > 0 ? 'SELL' : 'BUY', orderType: 'MARKET', reduceOnly: true, closePosition: full },
  input.actionId || input.idempotencyKey);
  let feeBps = 0;
  const result = await executeAction(creds, input, options, 'add_order', params, async () => {
    const sent = await postOrder(creds, '/v2/order', params); feeBps = sent.feeBps; return sent.data;
  }, BUILDER_FEE_BPS);
  if (feeBps !== BUILDER_FEE_BPS && result._row) database().prepare('UPDATE strike_action_intents SET builder_fee_bps=? WHERE account_id=? AND player_id=? AND action_id=?')
    .run(feeBps, result._row.account_id, result._row.player_id, result._row.action_id);
  if (result.replayed) { delete result._row; return result; }
  return confirmPlacement(creds, result, symbol);
}

/**
 * Set, replace or clear position TP/SL: reduce-only take_profit / stop market orders with
 * close_position. Existing legs are cancelled and the merged legs placed; an omitted leg
 * keeps its current trigger.
 */
async function setTpsl(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const actionId = String(input.actionId || input.idempotencyKey || '');
  if (!UUID.test(actionId)) throw failure('A stable actionId UUID is required', 400, 'STRIKE_ACTION_ID');
  const symbol = symbolOf(input.symbol || input.positionId);
  const [position, orderData, market] = await Promise.all([readPosition(creds, symbol),
    request('GET', '/v2/openOrders', { creds, query: { symbol } }), marketFor(symbol)]);
  if (!position) throw failure('No Strike position exists for this symbol', 409, 'STRIKE_NO_POSITION');
  const qty = number(position.size), long = qty > 0, closeSide = long ? 'ask' : 'bid';
  const entry = number(position.entry_price), mark = number(market.mark) || entry;
  const legs = tpslLegs((orderData?.orders || []).map(normalizeOrder)).filter(l => l.symbol === symbol && l.close_side === closeSide);
  const current = { TAKE_PROFIT: legs.find(l => l.kind === 'TAKE_PROFIT')?.trigger_price ?? null,
    STOP_LOSS: legs.find(l => l.kind === 'STOP_LOSS')?.trigger_price ?? null };
  const wanted = { ...current };
  let mentioned = false;
  for (const [kind, keys] of [['TAKE_PROFIT', ['takeProfit', 'take_profit', 'tp']], ['STOP_LOSS', ['stopLoss', 'stop_loss', 'sl']]]) {
    const key = keys.find(name => Object.hasOwn(input, name));
    if (key === undefined) continue;
    mentioned = true;
    const value = input[key];
    if (value == null || value === '' || Number(value) === 0) { wanted[kind] = null; continue; }
    const price = number(exactNumber(value, market.tick_size, null, null, kind === 'TAKE_PROFIT' ? 'Take profit' : 'Stop loss'));
    const reference = entry > 0 ? entry : mark;
    if (kind === 'TAKE_PROFIT' && (long ? price <= reference : price >= reference)) {
      throw failure(`Take profit must be ${long ? 'above' : 'below'} the entry price (${reference}).`, 400, 'STRIKE_TPSL_INVALID');
    }
    if (kind === 'STOP_LOSS' && (long ? price >= mark : price <= mark)) {
      throw failure(`Stop loss must be ${long ? 'below' : 'above'} the current price (${mark}).`, 400, 'STRIKE_TPSL_INVALID');
    }
    wanted[kind] = price;
  }
  if (!mentioned) throw failure('Enter a take-profit or stop-loss price', 400, 'STRIKE_TPSL_INVALID');
  if (wanted.TAKE_PROFIT === current.TAKE_PROFIT && wanted.STOP_LOSS === current.STOP_LOSS) {
    return { success: true, unchanged: true, symbol, account_id: creds.accountId, action_id: actionId };
  }
  let step = 0;
  for (const leg of legs) {
    const done = await executeAction(creds, { actionId: deriveActionId(actionId, ++step) }, options, 'cancel_order', { symbol, order_id: leg.order_id },
      () => request('DELETE', '/v2/order/cancel', { creds, rawBody: `{"order_id":${leg.order_id},"symbol":${JSON.stringify(symbol)}}` })
        .then(data => ({ ...data, order_id: leg.order_id })));
    delete done._row;
  }
  const size = String(position.size).replace(/^-/u, '');
  const placed = [];
  for (const [kind, price] of [['TAKE_PROFIT', wanted.TAKE_PROFIT], ['STOP_LOSS', wanted.STOP_LOSS]]) {
    if (price == null) continue;
    const legId = deriveActionId(actionId, ++step);
    const body = { ...tpslLeg(kind, String(price), size, legId), symbol, side: long ? 'sell' : 'buy', reduce_only: true, close_position: true };
    const done = await executeAction(creds, { actionId: legId }, options, 'tpsl_order', body,
      async () => (await postOrder(creds, '/v2/order', body)).data, BUILDER_FEE_BPS);
    delete done._row;
    placed.push(done);
  }
  snapshotCache.clear();
  return { success: true, symbol, account_id: creds.accountId, action_id: actionId,
    take_profit: wanted.TAKE_PROFIT, stop_loss: wanted.STOP_LOSS, orders: placed };
}

// ------------------------------------------------------------------ action recovery

const ORDER_KINDS = new Set(['add_order', 'strategy_order', 'tpsl_order']);

/** Reconcile one pending/unknown intent with Strike. Read-only: nothing is ever resent. */
async function reconcileIntent(creds, row) {
  const params = JSON.parse(row.params_json || '{}');
  const done = (status, result) => { finishAction(row, status, result); return { status, result }; };
  const base = { action_id: row.action_id, account_id: creds.accountId, builder_code: BUILDER_CODE, reconciled: true };
  if (ORDER_KINDS.has(row.kind)) {
    if (!row.client_order_id) return { status: 'unknown' };
    const found = await readOrderByClientId(creds, params.symbol, row.client_order_id);
    if (!found) return { status: 'unknown' };
    recordOrder(row, found);
    const exact = found.Symbol === params.symbol && String(found.Side).toLowerCase() === params.side && decimal(found.Size).eq(String(params.size));
    if (!exact) return { status: 'manual_review', reason: 'Order parameters do not match the intent' };
    if (String(found.Status).toLowerCase() === 'rejected') return done('rejected', { error: sanitize(found.CloseReason) || 'rejected', code: 'STRIKE_ORDER_REJECTED' });
    return done('reconciled', { ...base, success: true, order_id: String(found.ID), status: String(found.Status || '').toLowerCase() });
  }
  if (row.kind === 'cancel_order') {
    let found = null;
    try { found = await request('GET', '/v2/order', { creds, query: { symbol: params.symbol, order_id: params.order_id } }); }
    catch (error) { if (error.code !== 'STRIKE_NOT_FOUND') throw error; }
    const state = String(found?.Status || '').toLowerCase();
    if (found && !state) return { status: 'unknown' };
    if (OPEN_ORDER_STATUS.has(state)) {
      return done('rejected', { error: 'The order is still open; the cancel did not take effect. You can cancel it again.',
        code: 'STRIKE_CANCEL_NOT_APPLIED', order_status: state });
    }
    return done('reconciled', { ...base, success: true, order_id: String(params.order_id), status: state || 'not_found' });
  }
  return { status: row.status };
}

async function getActionStatus(credsInput, actionId, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (!UUID.test(String(actionId || ''))) throw failure('Invalid action UUID', 400, 'STRIKE_ACTION_ID');
  claimAccount(options.playerId, creds);
  const select = database().prepare('SELECT * FROM strike_action_intents WHERE account_id=? AND player_id=? AND action_id=?');
  const row = select.get(creds.accountId, String(options.playerId), actionId);
  const response = { action_id: actionId, account_id: creds.accountId, status: row?.status, can_resubmit: false };
  if (!row) {
    // Composite actions (TP/SL replace: cancels + places) record each step under a derived id.
    const steps = [1, 2, 3, 4].map(step => select.get(creds.accountId, String(options.playerId), deriveActionId(actionId, step))).filter(Boolean);
    if (!steps.length) throw failure('Strike action not found', 404, 'STRIKE_ACTION_NOT_FOUND', { account_id: creds.accountId });
    const states = [];
    for (const step of steps) {
      states.push(['unknown', 'pending'].includes(step.status) ? await reconcileIntent(creds, step)
        : { status: step.status, result: step.result_json ? JSON.parse(step.result_json) : null });
    }
    const status = ['manual_review', 'unknown', 'pending', 'rejected'].find(s => states.some(state => state.status === s)) || 'reconciled';
    const reason = states.find(state => state.reason)?.reason;
    return { ...response, status, ...(reason ? { reason } : {}),
      steps: states.map((state, i) => ({ kind: steps[i].kind, status: state.status })), result: { steps: states.map(state => state.result ?? null) } };
  }
  if (!['unknown', 'pending'].includes(row.status)) return { ...response, result: row.result_json ? JSON.parse(row.result_json) : null };
  return { ...response, ...(await reconcileIntent(creds, row)) };
}

// ------------------------------------------------------------------ history and reward proof

function normalizeFill(f) {
  const qty = number(f.size), price = number(f.price), ts = number(f.timestamp);
  const closing = f.close_price != null || f.entry_price != null;
  const buy = String(f.side).toLowerCase() === 'buy';
  return { id: String(f.id), trade_id: String(f.trade_id ?? ''), order_id: String(f.order_id), symbol: f.symbol,
    side: closing ? (buy ? 'close_short' : 'close_long') : (buy ? 'open_long' : 'open_short'),
    amount: String(Math.abs(qty)), price: String(price), notional_usd: Math.abs(qty) * price,
    pnl: f.realized_pnl ?? null, fee: f.fee ?? null, fee_type: f.fee_type ?? null, is_maker: f.role === 'maker',
    auto_close_type: f.auto_close_type || null, created_at: ts > 0 ? new Date(ts).toISOString() : null, _raw: f };
}

async function getTradeHistory(credsInput, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds);
  const limit = Math.max(1, Math.min(500, Math.floor(Number(options.limit) || 100)));
  const data = await request('GET', '/v2/history/fill', { creds, query: { limit, ...(options.symbol ? { symbol: symbolOf(options.symbol) } : {}) } });
  return (Array.isArray(data?.fills) ? data.fills : []).map(normalizeFill);
}

/**
 * Reward proof: a fill is credited only if it belongs to an order we placed ourselves
 * (accepted/reconciled add_order or strategy_order intent), Strike reports that order with
 * our builder code (GET /v2/order -> Builder.Code), and the fill comes from Strike's
 * per-order fill feed with the same symbol and side and a size that never exceeds the
 * order size. Fills of orders placed elsewhere are never looked up.
 */
function verifyFill(intent, params, fill, alreadyFilled) {
  if (fill.order_id !== String(intent.order_id)) return 'foreign_order';
  if (fill.symbol !== params.symbol || String(fill._raw.side).toLowerCase() !== params.side) return 'mismatch';
  const qty = decimal(fill.amount);
  if (!qty.isFinite() || qty.lte(0) || !(number(fill.price) > 0)) return 'invalid';
  if (qty.gt(params.size) || alreadyFilled.plus(qty).gt(decimal(params.size).times(1.000001))) return 'oversize';
  return null;
}

async function importTradesForPlayer(playerId, credsInput, options = {}) {
  const creds = await resolveAccount(credsInput);
  claimAccount(playerId, creds);
  const db = database();
  const ledger = options.ledger || require('./db');
  const maxOrders = Math.max(1, Math.min(40, Math.floor(Number(options.maxOrders) || 25)));
  const since = new Date(nowImpl() - 30 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const intents = db.prepare(`SELECT * FROM strike_action_intents
    WHERE account_id=? AND player_id=? AND kind IN ('add_order','strategy_order') AND status IN ('accepted','reconciled')
      AND fills_done=0 AND builder_code=? AND created_at >= ?
    ORDER BY last_checked_at ASC, created_at ASC LIMIT ?`).all(creds.accountId, String(playerId), BUILDER_CODE, since, maxOrders);
  let imported = 0, updated = 0, skipped = 0, total = 0, checked = 0;
  const rejected = {};
  const markDone = (intent, done, filled = '0') => db.prepare(`UPDATE strike_action_intents SET fills_done=?, filled_quantity=?, last_checked_at=?
    WHERE account_id=? AND player_id=? AND action_id=?`).run(done ? 1 : 0, filled, nowImpl(), intent.account_id, intent.player_id, intent.action_id);
  for (const intent of intents) {
    const params = JSON.parse(intent.params_json || '{}');
    checked++;
    const order = await readOrderByClientId(creds, params.symbol, intent.client_order_id);
    if (!order) {
      // Never sequenced (or long expired): stop checking after an hour.
      const age = nowImpl() - Date.parse(`${String(intent.created_at).replace(' ', 'T')}Z`);
      markDone(intent, Number.isFinite(age) && age > 3600000);
      continue;
    }
    recordOrder(intent, order);
    const orderId = String(order.ID);
    const status = String(order.Status || '').toLowerCase();
    if (order.Builder?.Code !== BUILDER_CODE) {
      skipped++; rejected.not_attributed = (rejected.not_attributed || 0) + 1;
      markDone(intent, true);
      continue;
    }
    const fills = await request('GET', '/v2/history/fill', { creds, query: { order_id: orderId, symbol: params.symbol, limit: 1000 } });
    let filled = new BigNumber(0);
    const seen = new Set();
    const proofIntent = { ...intent, order_id: orderId };
    for (const raw of (Array.isArray(fills?.fills) ? fills.fills : [])) {
      const fill = normalizeFill(raw);
      if (seen.has(fill.id)) continue;
      seen.add(fill.id); total++;
      const reason = verifyFill(proofIntent, params, fill, filled);
      if (reason) { skipped++; rejected[reason] = (rejected[reason] || 0) + 1; continue; }
      filled = filled.plus(fill.amount);
      const side = params.reduce_only ? (params.side === 'sell' ? 'close_long' : 'close_short') : (params.side === 'buy' ? 'open_long' : 'open_short');
      const result = ledger.upsertVerifiedTrade(playerId, { symbol: fill.symbol, side, amount: fill.amount, price: fill.price,
        orderId, clientOrderId: `strike:${creds.accountId}:fill:${fill.id}`, dex: 'strike', status: 'filled',
        orderType: String(params.type || 'market').toLowerCase(), notional_usd: fill.notional_usd,
        verifiedSource: VERIFIED_SOURCE, pnl: fill.pnl, fee: fill.fee, createdAt: fill.created_at,
        proofJson: JSON.stringify({ account_id: creds.accountId, address: creds.address.toLowerCase(), builder_code: BUILDER_CODE,
          order_builder_code: order.Builder?.Code ?? null, builder_fee_bps: order.Builder?.FeeBps ?? null,
          action_id: intent.action_id, order_id: orderId, client_order_id: intent.client_order_id, params, fill: raw }) });
      imported += Number(result.inserted || 0); updated += Number(result.updated || 0);
    }
    markDone(intent, TERMINAL_ORDER_STATUS.has(status), filled.toFixed());
  }
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM strike_action_intents WHERE account_id=? AND player_id=?
    AND kind IN ('add_order','strategy_order') AND status IN ('accepted','reconciled') AND fills_done=0`).get(creds.accountId, String(playerId)).n;
  return { ok: true, account_id: creds.accountId, builder_code: BUILDER_CODE, imported, updated, skipped, total, checked,
    rejected, has_more: pending > checked, pending_orders: pending, reward_eligible: true };
}

// ------------------------------------------------------------------ deposits and withdrawals (Ethereum)

function smallestUnits(amount, decimals) {
  const value = decimal(amount);
  if (!value.isFinite() || value.lte(0)) throw failure('Enter a positive amount', 400, 'STRIKE_TRANSFER_INVALID');
  const units = value.times(new BigNumber(10).pow(decimals));
  if (!units.isInteger()) throw failure(`Use at most ${decimals} decimals`, 400, 'STRIKE_TRANSFER_INVALID');
  return units.toFixed(0);
}

function evmTx(tx, address) {
  if (!tx || typeof tx !== 'object') return null;
  const from = String(tx.from || '');
  if (from && from.toLowerCase() !== address.toLowerCase()) throw failure('Strike built a deposit for another wallet', 502, 'STRIKE_UPSTREAM_ERROR');
  if (!EVM_ADDRESS.test(String(tx.to || ''))) throw failure('Strike returned an invalid deposit transaction', 502, 'STRIKE_UPSTREAM_ERROR');
  return { from: address, to: String(tx.to), data: /^0x[0-9a-fA-F]*$/u.test(String(tx.data || '0x')) ? String(tx.data || '0x') : '0x',
    value: /^0x[0-9a-fA-F]+$/u.test(String(tx.value || '')) ? String(tx.value) : '0x0',
    ...(/^0x[0-9a-fA-F]+$/u.test(String(tx.gas || '')) ? { gas: String(tx.gas) } : {}) };
}

/** Quote + unsigned Ethereum transaction(s) for a USDC/ETH deposit from the connected wallet. */
async function prepareDeposit(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds);
  limitRelay(options.playerId, 'deposit', 2000);
  const asset = String(input.asset || 'USDC').toUpperCase();
  if (!Object.hasOwn(DEPOSIT_ASSETS, asset)) throw failure('Strike deposits from EVM support USDC or ETH on Ethereum', 400, 'STRIKE_TRANSFER_INVALID');
  const quote = await request('POST', '/v2/deposit/quote', { creds, body: { blockchain: CHAIN, asset_symbol: asset,
    asset_amount: smallestUnits(input.amount, DEPOSIT_ASSETS[asset]) } });
  const requestId = String(quote?.request_id || '');
  if (!requestId) throw failure('Strike did not return a deposit quote', 502, 'STRIKE_UPSTREAM_ERROR');
  if (number(quote?.quote?.usd_value) > 0 && number(quote.quote.usd_value) < MIN_TRANSFER_USD) {
    throw failure(`The minimum Strike deposit is $${MIN_TRANSFER_USD}`, 400, 'STRIKE_TRANSFER_INVALID');
  }
  const built = await request('POST', '/v2/deposit/build-tx', { creds, body: { request_id: requestId, user_address: creds.address } });
  if (built?.format !== 'evm_tx_params') throw failure('Strike returned a non-EVM deposit transaction', 502, 'STRIKE_UPSTREAM_ERROR');
  return { request_id: requestId, asset, usd_value: quote?.quote?.usd_value ?? null, expires_at: built?.expires_at ?? quote?.quote?.expiration_at ?? null,
    confirmations: quote?.confirmations_required ?? quote?.quote?.confirmations ?? null, chain_id: 1,
    approval_tx: evmTx(built.approval_tx, creds.address), tx: evmTx(built.unsigned_tx, creds.address) };
}

async function confirmDeposit(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds);
  const requestId = String(input.requestId || input.request_id || '').trim();
  const txHash = String(input.txHash || input.tx_hash || '').trim();
  if (!requestId || requestId.length > 128) throw failure('Invalid deposit request', 400, 'STRIKE_TRANSFER_INVALID');
  if (!/^0x[0-9a-fA-F]{64}$/u.test(txHash)) throw failure('Invalid transaction hash', 400, 'STRIKE_TRANSFER_INVALID');
  const data = await request('POST', '/v2/deposit', { creds, body: { request_id: requestId, tx_hash: txHash } });
  snapshotCache.clear();
  return { success: true, request_id: requestId, tx_hash: txHash, status: data?.status || 'pending', message: sanitize(data?.message) || null };
}

/** Withdraw quote; Strike locks the recipient to the connected wallet. */
async function prepareWithdraw(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds);
  limitRelay(options.playerId, 'withdraw', 2000);
  const usd = decimal(input.amount ?? input.usdValue ?? input.usd_value);
  if (!usd.isFinite() || usd.lt(MIN_TRANSFER_USD)) throw failure(`The minimum Strike withdrawal is $${MIN_TRANSFER_USD}`, 400, 'STRIKE_TRANSFER_INVALID');
  const asset = String(input.asset || 'USDC').toUpperCase();
  if (!Object.hasOwn(DEPOSIT_ASSETS, asset)) throw failure('Withdraw USDC or ETH to Ethereum', 400, 'STRIKE_TRANSFER_INVALID');
  const data = await request('POST', '/v2/withdraw/quote', { creds, body: { usd_value: usd.toFixed(2, BigNumber.ROUND_DOWN), blockchain: CHAIN, asset } });
  const withdrawId = String(data?.withdraw_id || '');
  const message = String(data?.message_to_sign || '');
  if (!withdrawId || !message) throw failure('Strike did not return a withdrawal quote', 502, 'STRIKE_UPSTREAM_ERROR');
  return { withdraw_id: withdrawId, fee: data?.fee ?? null, message_to_sign: message, asset, usd_value: usd.toFixed(2, BigNumber.ROUND_DOWN) };
}

async function confirmWithdraw(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds);
  const withdrawId = String(input.withdrawId || input.withdraw_id || '').trim();
  const signature = String(input.walletSignature || input.wallet_signature || '').trim();
  if (!withdrawId || withdrawId.length > 128) throw failure('Invalid withdrawal', 400, 'STRIKE_TRANSFER_INVALID');
  if (!/^(0x)?[0-9a-fA-F]{130}$/u.test(signature)) throw failure('Invalid wallet signature', 400, 'STRIKE_SIGNATURE');
  const data = await request('POST', '/v2/withdraw', { creds, body: { withdraw_id: withdrawId, wallet_signature: signature } });
  snapshotCache.clear();
  return { success: true, withdraw_id: withdrawId, status: data?.status || 'pending' };
}

// ------------------------------------------------------------------ config

function configStatus() {
  return { ok: true, dex: 'strike', api_origin: API_ORIGIN, app_url: APP_URL, builder_code: BUILDER_CODE,
    builder_fee_bps: BUILDER_FEE_BPS, approval_fee_bps: APPROVAL_FEE_BPS, chain: CHAIN,
    authentication: 'api_wallet', deposit_url: APP_URL, deposit_assets: Object.keys(DEPOSIT_ASSETS), min_transfer_usd: MIN_TRANSFER_USD,
    reward_eligible: true, attribution_note: `Orders are placed on your Strike account through builder "${BUILDER_CODE}".` };
}

function setTestDependencies(options = {}) {
  fetchImpl = options.fetch || ((...args) => fetch(...args));
  databaseOverride = options.database || null;
  timeoutMs = options.timeoutMs || 12000;
  nowImpl = options.now || (() => Date.now());
  sleepImpl = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  clockOffsetMs = 0; builderFeeDisabledUntil = 0;
  marketCache = null; marketLoad = null; relayLimiter.clear(); accountCache.clear(); snapshotCache.clear(); leverageCache.clear();
}

module.exports = { API_ORIGIN, BUILDER_CODE, BUILDER_FEE_BPS, APPROVAL_FEE_BPS, VERIFIED_SOURCE, credentials, publicKeyFromPrivate,
  signRequest, request, mapStrikeError, parseJson, configStatus, normalizeMarket, getMarkets, getPrices, getCandles, getOrderbook,
  requestConnectSignature, verifyConnectSignature, resolveAccount, getAccountSnapshot, placeOrder, cancelOrder, closePosition,
  setLeverage, setTpsl, getActionStatus, getTradeHistory, importTradesForPlayer, verifyFill, normalizeFill, normalizeOrder,
  prepareDeposit, confirmDeposit, prepareWithdraw, confirmWithdraw, ensureSchema, setTestDependencies, symbolOf, deriveActionId };
