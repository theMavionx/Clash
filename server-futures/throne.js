'use strict';

// Throne venue adapter. Throne (https://throne.network) is an Orderly Network broker
// (broker_id "throne"): every order placed on an Orderly account registered under that
// broker is attributed to Throne (fees, King Drop / arena board). This adapter talks to
// Orderly's public REST API and signs private requests with the user's Orderly ed25519
// key, which the browser keeps in the encrypted credential vault and sends per request
// (like QFEX API keys). Credentials are never persisted or logged here.
//
// Docs: https://orderly.network/docs/build-on-omnichain/api-authentication
//       https://orderly.network/docs/build-on-omnichain/user-flows/accounts
//       https://orderly.network/docs/build-on-omnichain/user-flows/wallet-authentication

const crypto = require('crypto');
const BigNumber = require('bignumber.js');
const { ed25519 } = require('@noble/curves/ed25519');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;

const API_ORIGIN = 'https://api.orderly.org';
const BOARD_ORIGIN = 'https://throne-arena.ushouldcashout.workers.dev';
const BROKER_ID = 'throne';
const APP_URL = 'https://throne.network';
const VERIFIED_SOURCE = 'throne_orderly';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ACCOUNT_ID = /^0x[0-9a-f]{64}$/u;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const SYMBOL = /^PERP_[A-Z0-9]{1,24}_USDC$/u;
const TERMINAL_ORDER_STATUS = new Set(['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED']);
// Orderly error codes (https://orderly.network/docs/build-on-omnichain/error-codes).
const ERROR_CODES = {
  '-1001': ['Orderly rejected the request signature. Reconnect Throne.', 401, 'THRONE_UNAUTHORIZED'],
  '-1002': ['The Throne trading key is not authorized (expired, removed or missing scope). Reconnect Throne.', 401, 'THRONE_UNAUTHORIZED'],
  '-1003': ['Orderly rate limit reached. Try again shortly.', 429, 'THRONE_RATE_LIMITED'],
  '-1006': ['Orderly could not find this order or resource.', 404, 'THRONE_NOT_FOUND'],
  '-1101': ['Not enough free collateral on Throne for this order. Deposit USDC on throne.network.', 400, 'THRONE_INSUFFICIENT_MARGIN'],
  '-1607': ['No Throne account exists for this wallet yet.', 404, 'THRONE_ACCOUNT_NOT_FOUND'],
};

let fetchImpl = (...args) => fetch(...args);
let databaseOverride = null;
let timeoutMs = Math.max(2000, Math.min(30000, Number(process.env.THRONE_TIMEOUT_MS) || 12000));
let nowImpl = () => Date.now();
const initialized = new WeakSet();
let marketCache = null, marketLoad = null;
const accountCache = new Map();
const snapshotCache = new Map();

function failure(message, status = 400, code = 'THRONE_ERROR', extra = {}) {
  return Object.assign(new Error(message), { status, code }, extra);
}

function number(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function positive(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }

// ------------------------------------------------------------------ keys and identity

/** Raw 32-byte ed25519 seed from a base58 (optionally `ed25519:`-prefixed) or hex string. */
function decodeSecret(value) {
  const raw = String(value || '').trim().replace(/^ed25519:/u, '');
  let bytes = null;
  if (/^(?:0x)?[0-9a-fA-F]{64}$/u.test(raw)) bytes = Buffer.from(raw.replace(/^0x/u, ''), 'hex');
  else { try { bytes = Buffer.from(bs58.decode(raw)); } catch { bytes = null; } }
  // Some wallets export seed||public (64 bytes); the seed is the first half.
  if (bytes && bytes.length === 64) bytes = bytes.subarray(0, 32);
  return bytes && bytes.length === 32 ? new Uint8Array(bytes) : null;
}

/** `ed25519:<base58 public key>`, the format Orderly expects in `orderly-key`. */
function orderlyKeyFromSecret(secret) {
  const seed = secret instanceof Uint8Array ? secret : decodeSecret(secret);
  if (!seed) throw failure('Invalid Throne trading key secret', 400, 'THRONE_CREDENTIALS');
  return `ed25519:${bs58.encode(ed25519.getPublicKey(seed))}`;
}

/** Orderly account id = keccak256(abi.encode(address, keccak256(bytes(brokerId)))). */
function computeAccountId(address, brokerId = BROKER_ID) {
  const { AbiCoder, keccak256, toUtf8Bytes, getAddress } = require('ethers');
  return keccak256(AbiCoder.defaultAbiCoder().encode(['address', 'bytes32'],
    [getAddress(String(address).toLowerCase()), keccak256(toUtf8Bytes(brokerId))])).toLowerCase();
}

/** Validate browser-supplied credentials; the key must belong to the throne-broker account of the address. */
function credentials(input = {}) {
  const accountId = String(input.accountId || input.account_id || '').trim().toLowerCase();
  const orderlyKey = String(input.orderlyKey || input.orderly_key || '').trim();
  const secretText = String(input.orderlySecret || input.orderly_secret || input.secretKey || '').trim();
  const address = String(input.address || '').trim();
  if (!accountId || !orderlyKey || !secretText || !address) throw failure('Connect Throne first: the Orderly trading key is missing.', 400, 'THRONE_CREDENTIALS');
  if (!ACCOUNT_ID.test(accountId)) throw failure('Invalid Orderly account id', 400, 'THRONE_CREDENTIALS');
  if (!EVM_ADDRESS.test(address)) throw failure('Invalid Throne wallet address', 400, 'THRONE_CREDENTIALS');
  if (orderlyKey.length > 80 || secretText.length > 140) throw failure('Invalid Throne trading key', 400, 'THRONE_CREDENTIALS');
  const seed = decodeSecret(secretText);
  if (!seed) throw failure('Invalid Throne trading key secret', 400, 'THRONE_CREDENTIALS');
  const derived = orderlyKeyFromSecret(seed);
  const normalizedKey = orderlyKey.startsWith('ed25519:') ? orderlyKey : `ed25519:${orderlyKey}`;
  if (derived !== normalizedKey) throw failure('The Throne trading key does not match its secret. Reconnect Throne.', 400, 'THRONE_KEY_MISMATCH');
  if (computeAccountId(address) !== accountId) {
    throw failure('This Orderly account is not registered under the Throne broker for this wallet. Reconnect Throne.', 403, 'THRONE_BROKER_MISMATCH');
  }
  return { accountId, orderlyKey: derived, address: address.toLowerCase(), seed };
}

/**
 * Orderly request signature: ed25519 over `timestamp + METHOD + path(with query) + body`,
 * base64url encoded (api-authentication docs).
 */
function signRequest(creds, method, pathWithQuery, bodyText = '', timestamp = nowImpl()) {
  const message = `${timestamp}${String(method).toUpperCase()}${pathWithQuery}${bodyText || ''}`;
  const signature = Buffer.from(ed25519.sign(new TextEncoder().encode(message), creds.seed)).toString('base64url');
  return { 'orderly-timestamp': String(timestamp), 'orderly-account-id': creds.accountId,
    'orderly-key': creds.orderlyKey, 'orderly-signature': signature };
}

function credentialScope(creds) {
  return crypto.createHash('sha256').update(`throne\0${creds.accountId}\0${creds.orderlyKey}`).digest('hex');
}

// ------------------------------------------------------------------ transport

function mapOrderlyError(httpStatus, body, write) {
  const code = body && body.code != null ? String(body.code) : '';
  const upstream = String(body?.message || '').replace(/[^\x20-\x7E]/gu, '').slice(0, 200);
  if (Object.hasOwn(ERROR_CODES, code)) {
    const [message, status, errorCode] = ERROR_CODES[code];
    return failure(message, status, errorCode, { definiteRejection: true, exchangeCode: code });
  }
  if (httpStatus === 401) return failure('Orderly rejected the Throne trading key.', 401, 'THRONE_UNAUTHORIZED', { definiteRejection: true });
  if (httpStatus === 429) return failure('Orderly rate limit reached. Try again shortly.', 429, 'THRONE_RATE_LIMITED', { definiteRejection: true });
  if (httpStatus >= 500 || !body) {
    return failure('Orderly is unavailable. Refresh the account before retrying.', 502, 'THRONE_UPSTREAM_ERROR', { outcomeUnknown: !!write });
  }
  return failure(`Orderly rejected the request${code ? ` (${code})` : ''}${upstream ? `: ${upstream}` : '.'}`,
    400, write ? 'THRONE_ORDER_REJECTED' : 'THRONE_REJECTED', { definiteRejection: true, exchangeCode: code || null });
}

/** One Orderly REST call. Writes are never retried; an unclear outcome is flagged as unknown. */
async function request(method, path, { creds = null, query = null, body = undefined, origin = API_ORIGIN } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/v1/') || path.includes('..') || path.includes('\\')) throw failure('Invalid Orderly path');
  const url = new URL(path, origin);
  if (url.origin !== origin) throw failure('Orderly origin is not permitted');
  for (const [key, value] of Object.entries(query || {})) if (value != null && value !== '') url.searchParams.set(key, String(value));
  const pathWithQuery = `${url.pathname}${url.search}`;
  const upper = method.toUpperCase();
  const write = upper !== 'GET';
  const bodyText = body === undefined ? '' : JSON.stringify(body);
  const headers = { 'Content-Type': upper === 'POST' || upper === 'PUT' ? 'application/json' : 'application/x-www-form-urlencoded',
    ...(creds ? signRequest(creds, upper, pathWithQuery, bodyText) : {}) };
  let response;
  try {
    response = await fetchImpl(url.toString(), { method: upper, headers, ...(bodyText ? { body: bodyText } : {}),
      signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  } catch {
    throw failure(write ? 'Orderly did not answer in time. Refresh the account before retrying.' : 'Orderly is unavailable or timed out.',
      write ? 504 : 502, write ? 'THRONE_TIMEOUT' : 'THRONE_READ_FAILED', { outcomeUnknown: write });
  }
  let parsed = null;
  try { const text = await response.text(); parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  if (!response.ok || !parsed || parsed.success === false) {
    if (response.ok && parsed && parsed.success === false) throw mapOrderlyError(400, parsed, write);
    console.warn('[throne] upstream rejected', { path: url.pathname, status: response.status, code: parsed?.code ?? null });
    throw mapOrderlyError(response.status, parsed, write);
  }
  return parsed.data !== undefined ? parsed.data : parsed;
}

// ------------------------------------------------------------------ public market data

function baseOf(symbol) { return String(symbol || '').replace(/^PERP_/u, '').replace(/_USDC$/u, ''); }

function normalizeMarket(info = {}, futures = {}) {
  const base = info.display_symbol_name || baseOf(info.symbol);
  const mark = positive(futures.mark_price), index = positive(futures.index_price);
  const open = positive(futures['24h_open']), close = positive(futures['24h_close']);
  const reference = mark ?? close;
  const change = reference != null && open != null ? ((reference - open) / open) * 100 : null;
  const imr = positive(info.base_imr);
  return { symbol: info.symbol, display_symbol: base, name: base, base_asset: base, dex: 'throne',
    max_leverage: imr ? Math.max(1, Math.floor(1 / imr + 1e-9)) : 10,
    min_order_size: String(info.base_min ?? ''), min_quantity: String(info.base_min ?? ''), max_quantity: String(info.base_max ?? ''),
    lot_size: String(info.base_tick ?? ''), tick_size: String(info.quote_tick ?? ''),
    min_price: info.quote_min, max_price: info.quote_max, min_notional_usd: number(info.min_notional),
    price_range: number(info.price_range), price: String(mark ?? close ?? 0), mark_price: String(mark ?? close ?? 0),
    ...(reference != null ? { mark: reference, last_price: close ?? reference } : {}),
    ...(index != null ? { oracle: index, index_price: index } : {}),
    ...(change != null && Number.isFinite(change) ? { price_change_24h: Number(change.toFixed(4)), price_24h_ago: open } : {}),
    ...(futures['24h_high'] != null ? { high_24h: number(futures['24h_high']), low_24h: number(futures['24h_low']) } : {}),
    volume_24h: String(futures['24h_amount'] ?? '0'),
    open_interest_usd: String(number(futures.open_interest) * (mark ?? 0)),
    funding_rate: String(futures.est_funding_rate ?? futures.last_funding_rate ?? '0'),
    last_funding_rate: futures.last_funding_rate ?? null, next_funding_time: futures.next_funding_time ?? null,
    funding_period_hours: number(info.funding_period, 8),
    is_paused: info.status !== 'ACTIVE' || futures.status === 'SUSPENDED', order_types: ['MARKET', 'LIMIT', 'POST_ONLY', 'IOC', 'FOK'] };
}

/** Market metadata (/v1/public/info) joined with live prices (/v1/public/futures); 15 s cache. */
async function getMarkets(options = {}) {
  if (!options.force && marketCache && nowImpl() - marketCache.time < 15000) return marketCache.rows;
  if (marketLoad) return marketLoad;
  marketLoad = (async () => {
    const [info, futures] = await Promise.all([request('GET', '/v1/public/info'), request('GET', '/v1/public/futures')]);
    if (!Array.isArray(info?.rows) || !Array.isArray(futures?.rows)) throw failure('Invalid Orderly market response', 502, 'THRONE_UPSTREAM_ERROR');
    const prices = new Map(futures.rows.map(row => [row.symbol, row]));
    const rows = info.rows.filter(row => SYMBOL.test(String(row.symbol || '')) && prices.has(row.symbol))
      .map(row => normalizeMarket(row, prices.get(row.symbol)))
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

function symbolOf(value) {
  let symbol = String(value || '').trim().toUpperCase();
  if (/^[A-Z0-9]{1,24}$/u.test(symbol)) symbol = `PERP_${symbol}_USDC`;
  if (/^[A-Z0-9]{1,24}[-/]USDC?$/u.test(symbol)) symbol = `PERP_${symbol.split(/[-/]/u)[0]}_USDC`;
  if (!SYMBOL.test(symbol)) throw failure('Invalid Throne market symbol', 400, 'THRONE_SYMBOL');
  return symbol;
}

const RESOLUTIONS = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '12h': '720', '1d': '1D', '1w': '1W' };
const RESOLUTION_SECONDS = { 1: 60, 3: 180, 5: 300, 15: 900, 30: 1800, 60: 3600, 240: 14400, 720: 43200, '1D': 86400, '1W': 604800 };
/** OHLCV from Orderly's public TradingView history endpoint. */
async function getCandles(symbol, options = {}) {
  const requested = String(options.interval || options.resolution || '5m');
  const resolution = RESOLUTIONS[requested] || (Object.values(RESOLUTIONS).includes(requested) ? requested : null);
  if (!resolution) throw failure('Unsupported Throne candle interval', 400, 'THRONE_INTERVAL');
  const limit = Math.max(10, Math.min(1000, Math.floor(Number(options.limit) || 500)));
  const to = Math.floor(Number(options.end) || nowImpl() / 1000);
  const from = Math.floor(Number(options.start) || to - RESOLUTION_SECONDS[resolution] * limit);
  const raw = await request('GET', '/v1/tv/history', { query: { symbol: symbolOf(symbol), resolution, from, to } });
  if (raw?.s === 'no_data') return [];
  if (raw?.s !== 'ok' || !Array.isArray(raw.t)) throw failure('Invalid Orderly candle response', 502, 'THRONE_UPSTREAM_ERROR');
  return raw.t.map((time, i) => ({ time: Number(time), open: number(raw.o[i]), high: number(raw.h[i]),
    low: number(raw.l[i]), close: number(raw.c[i]), volume: number(raw.v[i]) })).slice(-limit);
}

/** Orderly's order book is a private (read-scope) endpoint. */
async function getOrderbook(credsInput, symbol) {
  const creds = await resolveAccount(credsInput);
  const raw = await request('GET', `/v1/orderbook/${symbolOf(symbol)}`, { creds, query: { max_level: 25 } });
  const level = row => [String(row.price), String(row.quantity)];
  return { symbol: symbolOf(symbol), bids: (raw?.bids || []).map(level), asks: (raw?.asks || []).map(level), timestamp: raw?.timestamp ?? null };
}

// ------------------------------------------------------------------ onboarding helpers (public, read-only)

/** Supported signing chains for broker throne, and whether the wallet already has a Throne account. */
async function getOnboardingStatus(address) {
  const raw = String(address || '').trim();
  if (!EVM_ADDRESS.test(raw)) throw failure('A valid EVM wallet address is required.', 400, 'THRONE_WALLET_ADDRESS');
  const expected = computeAccountId(raw);
  let registered = false, accountId = null;
  try {
    const account = await request('GET', '/v1/get_account', { query: { address: raw, broker_id: BROKER_ID } });
    accountId = String(account?.account_id || '').toLowerCase() || null;
    registered = accountId === expected;
  } catch (error) { if (error.code !== 'THRONE_ACCOUNT_NOT_FOUND') throw error; }
  return { address: raw, broker_id: BROKER_ID, registered, account_id: registered ? accountId : null, expected_account_id: expected };
}

let chainCache = null;
/** EVM chain ids Orderly accepts for broker throne (GET /v1/public/chain_info?broker_id=throne). */
async function supportedChains() {
  if (chainCache && nowImpl() - chainCache.time < 3600000) return chainCache.rows;
  const data = await request('GET', '/v1/public/chain_info', { query: { broker_id: BROKER_ID } });
  const rows = (data?.rows || []).filter(row => (row.broker_ids || []).includes(BROKER_ID) && Number(row.chain_id) !== 900900900)
    .map(row => ({ chain_id: Number(row.chain_id), name: row.name, vault_address: row.vault_address }));
  chainCache = { rows, time: nowImpl() };
  return rows;
}

async function getRegistrationNonce() {
  const data = await request('GET', '/v1/registration_nonce');
  const nonce = String(data?.registration_nonce || '');
  if (!/^\d{1,40}$/u.test(nonce)) throw failure('Orderly returned an invalid registration nonce', 502, 'THRONE_UPSTREAM_ERROR');
  return { registration_nonce: nonce, broker_id: BROKER_ID, chains: await supportedChains() };
}

const relayLimiter = new Map();
function limitRelay(playerId, kind) {
  const key = `${kind}:${String(playerId || 'anonymous')}`;
  if (nowImpl() - (relayLimiter.get(key) || 0) < 5000) throw failure('Please wait a few seconds before trying again.', 429, 'THRONE_RATE_LIMITED');
  relayLimiter.set(key, nowImpl());
  if (relayLimiter.size > 2000) relayLimiter.delete(relayLimiter.keys().next().value);
}

/** Common checks for wallet-signed Orderly messages relayed by the server (never signed here). */
async function checkSignedMessage(input, fields) {
  const message = input?.message && typeof input.message === 'object' ? input.message : null;
  const signature = String(input?.signature || '');
  const userAddress = String(input?.userAddress || '');
  if (!message || Object.keys(message).sort().join(',') !== [...fields].sort().join(',')) throw failure('Invalid signed message', 400, 'THRONE_SIGNATURE');
  if (message.brokerId !== BROKER_ID) throw failure('Only the Throne broker is supported', 400, 'THRONE_SIGNATURE');
  if (!/^0x[0-9a-fA-F]{130}$/u.test(signature) || !EVM_ADDRESS.test(userAddress)) throw failure('Invalid wallet signature', 400, 'THRONE_SIGNATURE');
  const chains = await supportedChains();
  if (!chains.some(chain => chain.chain_id === Number(message.chainId))) throw failure('This chain is not supported for Throne registration', 400, 'THRONE_CHAIN');
  if (Math.abs(nowImpl() - Number(message.timestamp)) > 10 * 60000) throw failure('The signed message expired. Sign again.', 400, 'THRONE_SIGNATURE');
  return { message, signature, userAddress };
}

/** Relay the wallet-signed EIP-712 `Registration` (broker throne) to POST /v1/register_account. */
async function registerAccount(input = {}, options = {}) {
  limitRelay(options.playerId, 'register');
  const body = await checkSignedMessage(input, ['brokerId', 'chainId', 'timestamp', 'registrationNonce']);
  if (!/^\d{1,40}$/u.test(String(body.message.registrationNonce))) throw failure('Invalid registration nonce', 400, 'THRONE_SIGNATURE');
  const data = await request('POST', '/v1/register_account', { body });
  const accountId = String(data?.account_id || '').toLowerCase();
  if (accountId !== computeAccountId(body.userAddress)) throw failure('Orderly returned an unexpected account id', 502, 'THRONE_UPSTREAM_ERROR');
  return { account_id: accountId, broker_id: BROKER_ID };
}

/** Relay the wallet-signed EIP-712 `AddOrderlyKey` (scope read,trading, <= 365 days) to POST /v1/orderly_key. */
async function addOrderlyKey(input = {}, options = {}) {
  limitRelay(options.playerId, 'orderly_key');
  const body = await checkSignedMessage(input, ['brokerId', 'chainId', 'orderlyKey', 'scope', 'timestamp', 'expiration']);
  const { message } = body;
  if (message.scope !== 'read,trading') throw failure('The Throne trading key must have scope read,trading', 400, 'THRONE_SIGNATURE');
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/u.test(String(message.orderlyKey))) throw failure('Invalid Orderly key', 400, 'THRONE_SIGNATURE');
  const lifetime = Number(message.expiration) - Number(message.timestamp);
  if (!(lifetime > 0) || lifetime > 365 * 86400000) throw failure('Key expiration must be within 365 days', 400, 'THRONE_SIGNATURE');
  const data = await request('POST', '/v1/orderly_key', { body });
  return { orderly_key: String(data?.orderly_key || message.orderlyKey), account_id: computeAccountId(body.userAddress), broker_id: BROKER_ID };
}

// ------------------------------------------------------------------ persistence (futures SQLite)

function database() {
  const db = databaseOverride || require('./db').db;
  ensureSchema(db);
  return db;
}

function ensureSchema(db = databaseOverride || require('./db').db) {
  if (initialized.has(db)) return db;
  db.exec(`CREATE TABLE IF NOT EXISTS throne_account_claims (
    account_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, address TEXT NOT NULL,
    broker_id TEXT NOT NULL DEFAULT 'throne', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS throne_action_intents (
    account_id TEXT NOT NULL, player_id TEXT NOT NULL, action_id TEXT NOT NULL,
    kind TEXT NOT NULL, payload_hash TEXT NOT NULL, client_order_id TEXT NOT NULL,
    broker_id TEXT NOT NULL DEFAULT 'throne', status TEXT NOT NULL, order_id TEXT,
    result_json TEXT, params_json TEXT, fills_done INTEGER NOT NULL DEFAULT 0,
    filled_quantity TEXT NOT NULL DEFAULT '0', last_checked_at INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(account_id, player_id, action_id));
    CREATE INDEX IF NOT EXISTS throne_action_order ON throne_action_intents(account_id, order_id);
    CREATE INDEX IF NOT EXISTS throne_action_pending_fills ON throne_action_intents(account_id, player_id, fills_done, kind, status);`);
  initialized.add(db);
  return db;
}

function claimAccount(playerId, creds) {
  if (!playerId) throw failure('Player authentication is required', 401, 'THRONE_AUTH');
  const db = database();
  db.prepare('INSERT OR IGNORE INTO throne_account_claims(account_id,player_id,address,broker_id) VALUES (?,?,?,?)')
    .run(creds.accountId, String(playerId), creds.address, BROKER_ID);
  const claim = db.prepare('SELECT player_id FROM throne_account_claims WHERE account_id=?').get(creds.accountId);
  if (claim.player_id !== String(playerId)) throw failure('This Throne account is linked to another player', 409, 'THRONE_ACCOUNT_CLAIMED');
}

/**
 * Verified identity: the account id is the throne-broker id of the address (credentials()),
 * Orderly lists that address+broker as registered (/v1/get_account), and the key
 * authenticates for exactly that account (/v1/client/info). Cached for 60 s.
 */
async function resolveAccount(credsInput) {
  const creds = credsInput?.seed instanceof Uint8Array ? credsInput : credentials(credsInput);
  const key = credentialScope(creds);
  const cached = accountCache.get(key);
  if (cached && nowImpl() - cached.time < 60000) return { ...creds, info: cached.info };
  const [registered, info] = await Promise.all([
    request('GET', '/v1/get_account', { query: { address: creds.address, broker_id: BROKER_ID } }),
    request('GET', '/v1/client/info', { creds }),
  ]);
  if (String(registered?.account_id || '').toLowerCase() !== creds.accountId) {
    throw failure('Orderly does not list this wallet under the Throne broker. Reconnect Throne.', 403, 'THRONE_BROKER_MISMATCH');
  }
  if (String(info?.account_id || '').toLowerCase() !== creds.accountId) {
    throw failure('The Throne trading key belongs to a different account. Reconnect Throne.', 403, 'THRONE_ACCOUNT_MISMATCH');
  }
  if (accountCache.size >= 512) accountCache.delete(accountCache.keys().next().value);
  accountCache.set(key, { info, time: nowImpl() });
  return { ...creds, info };
}

function beginAction(creds, playerId, actionId, kind, params) {
  if (!UUID.test(String(actionId || ''))) throw failure('A stable actionId UUID is required', 400, 'THRONE_ACTION_ID');
  claimAccount(playerId, creds);
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ kind, params })).digest('hex');
  const db = database();
  const inserted = db.prepare(`INSERT OR IGNORE INTO throne_action_intents
    (account_id,player_id,action_id,kind,payload_hash,client_order_id,broker_id,status,params_json)
    VALUES (?,?,?,?,?,?,?,'pending',?)`).run(creds.accountId, String(playerId), actionId, kind, payloadHash,
    params.client_order_id || '', BROKER_ID, JSON.stringify(params));
  const row = db.prepare('SELECT * FROM throne_action_intents WHERE account_id=? AND player_id=? AND action_id=?')
    .get(creds.accountId, String(playerId), actionId);
  if (row.payload_hash !== payloadHash) throw failure('actionId already belongs to a different request', 409, 'THRONE_ACTION_CONFLICT');
  if (!inserted.changes && !['accepted', 'reconciled'].includes(row.status)) {
    throw failure('This action was already attempted. Refresh account and history; do not resend.', 409, `THRONE_ACTION_${row.status.toUpperCase()}`);
  }
  return { row, created: !!inserted.changes };
}

function finishAction(row, status, result) {
  database().prepare(`UPDATE throne_action_intents SET status=?,order_id=?,result_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE account_id=? AND player_id=? AND action_id=?`).run(status, result.order_id != null ? String(result.order_id) : null,
    JSON.stringify(result), row.account_id, row.player_id, row.action_id);
}

/** Record a durable intent, send once, and store Orderly's order id as reward proof. */
async function executeAction(creds, input, options, kind, params, send) {
  const actionId = input.actionId || input.idempotencyKey;
  const intent = beginAction(creds, options.playerId || input.playerId, actionId, kind, params);
  if (!intent.created) return { ...JSON.parse(intent.row.result_json || '{}'), replayed: true };
  try {
    const data = await send();
    const orderId = data?.order_id ?? data?.algo_order_id ?? null;
    const normalized = { success: true, order_id: orderId != null ? String(orderId) : null,
      client_order_id: data?.client_order_id ?? params.client_order_id ?? null, status: data?.status || 'accepted',
      action_id: actionId, account_id: creds.accountId, broker_id: BROKER_ID, broker_attributed: true, raw: data ?? null };
    finishAction(intent.row, 'accepted', normalized);
    snapshotCache.clear();
    return normalized;
  } catch (error) {
    finishAction(intent.row, error.outcomeUnknown ? 'unknown' : 'rejected', { error: error.message, code: error.code || null });
    throw error;
  }
}

// ------------------------------------------------------------------ account snapshot

async function readAllPages(creds, path, query, maximum = 500) {
  const rows = [];
  for (let page = 1; rows.length < maximum; page++) {
    const size = Math.min(500, maximum - rows.length);
    const data = await request('GET', path, { creds, query: { ...query, page, size } });
    const batch = Array.isArray(data?.rows) ? data.rows : [];
    rows.push(...batch);
    const total = number(data?.meta?.total, rows.length);
    if (batch.length < size || rows.length >= total) break;
  }
  return rows;
}

/** TP/SL legs from Orderly algo orders (TP_SL / POSITIONAL_TP_SL roots with TAKE_PROFIT / STOP_LOSS children). */
function algoLegs(algoRows) {
  const legs = [];
  const visit = (row, root) => {
    const type = String(row?.algo_type || '').toUpperCase();
    if (type === 'TAKE_PROFIT' || type === 'STOP_LOSS') {
      const trigger = positive(row.trigger_price);
      if (trigger != null) {
        legs.push({ kind: type, symbol: row.symbol || root.symbol, side: String(row.side || '').toUpperCase(),
          trigger_price: trigger, quantity: number(row.quantity), root_algo_order_id: String(root.algo_order_id ?? row.root_algo_order_id ?? ''),
          root_type: String(root.algo_type || ''), algo_order_id: String(row.algo_order_id ?? ''), is_triggered: row.is_triggered === true || row.is_triggered === 'true' });
      }
    }
    for (const child of Array.isArray(row?.child_orders) ? row.child_orders : []) visit(child, root);
  };
  for (const row of algoRows || []) visit(row, row);
  return legs;
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
  const [holding, positionData, orders, algos, markets] = await Promise.all([
    request('GET', '/v1/client/holding', { creds }),
    request('GET', '/v1/positions', { creds }),
    readAllPages(creds, '/v1/orders', { status: 'INCOMPLETE' }),
    readAllPages(creds, '/v1/algo/orders', { status: 'INCOMPLETE' }),
    getMarkets()]);
  const marketMap = new Map(markets.map(m => [m.symbol, m]));
  const legs = algoLegs(algos).filter(leg => !leg.is_triggered);
  const usdc = (holding?.holding || []).find(row => String(row.token).toUpperCase() === 'USDC');
  const positions = (positionData?.rows || []).filter(p => number(p.position_qty) !== 0).map(p => {
    const qty = number(p.position_qty), long = qty > 0;
    const mark = number(p.mark_price) || number(marketMap.get(p.symbol)?.mark);
    const entry = number(p.average_open_price);
    const closeSide = long ? 'SELL' : 'BUY';
    const tp = legs.find(l => l.symbol === p.symbol && l.kind === 'TAKE_PROFIT' && (!l.side || l.side === closeSide));
    const sl = legs.find(l => l.symbol === p.symbol && l.kind === 'STOP_LOSS' && (!l.side || l.side === closeSide));
    const leverage = number(p.leverage) || null;
    return { symbol: p.symbol, position_id: p.symbol, side: long ? 'bid' : 'ask', amount: String(Math.abs(qty)),
      entry_price: String(entry), mark_price: String(mark), leverage, liquidation_price: positive(p.est_liq_price),
      margin: number(p.margin) || (leverage ? Math.abs(qty * mark) / leverage : null),
      unrealized_pnl: (mark - entry) * qty, unsettled_pnl: number(p.unsettled_pnl), margin_mode: p.margin_mode || 'CROSS',
      funding_fee: number(p.accrued_funding_fee),
      take_profit: tp ? String(tp.trigger_price) : null, stop_loss: sl ? String(sl.trigger_price) : null,
      tp_price: tp?.trigger_price ?? null, sl_price: sl?.trigger_price ?? null,
      tp_order_id: tp?.root_algo_order_id || null, sl_order_id: sl?.root_algo_order_id || null, _raw: p };
  });
  const free = number(positionData?.free_collateral);
  const equity = number(positionData?.account_value ?? positionData?.total_collateral_value);
  const leverage = Object.fromEntries(positions.filter(p => p.leverage).map(p => [p.symbol, p.leverage]));
  return {
    account: { account_id: creds.accountId, address: creds.address, broker_id: BROKER_ID,
      balance: number(usdc?.holding), usdc: number(usdc?.holding), available_to_spend: free, free_collateral: free,
      equity, account_equity: equity, total_collateral_value: number(positionData?.total_collateral_value),
      margin_ratio: positionData?.margin_ratio ?? null, total_margin_used: Math.max(0, number(positionData?.total_collateral_value) - free),
      max_leverage: number(creds.info?.max_leverage) || null, taker_fee_rate: creds.info?.futures_taker_fee_rate ?? creds.info?.taker_fee_rate ?? null,
      maker_fee_rate: creds.info?.futures_maker_fee_rate ?? creds.info?.maker_fee_rate ?? null, currency: 'USDC',
      ...(number(usdc?.holding) <= 0 && free <= 0 ? { empty_account: true } : {}) },
    positions,
    orders: [
      ...orders.map(o => ({ ...o, id: String(o.order_id), order_id: String(o.order_id), symbol: o.symbol,
        side: o.side === 'BUY' ? 'bid' : 'ask', price: String(o.price ?? ''),
        amount: String(new BigNumber(String(o.quantity ?? 0)).minus(String(o.executed_quantity ?? o.total_executed_quantity ?? 0)).toFixed()),
        order_type: String(o.type || '').toLowerCase(), reduce_only: o.reduce_only === true, created_at: o.created_time ? new Date(number(o.created_time)).toISOString() : null })),
      ...legs.map(l => ({ id: l.root_algo_order_id, order_id: l.root_algo_order_id, algo_order_id: l.algo_order_id, symbol: l.symbol,
        side: l.side === 'BUY' ? 'bid' : 'ask', amount: String(l.quantity || ''), price: String(l.trigger_price),
        trigger_price: String(l.trigger_price), stop_price: String(l.trigger_price), reduce_only: true, is_stop: true,
        order_type: l.kind === 'TAKE_PROFIT' ? 'take_profit' : 'stop_loss', algo_type: l.root_type })),
    ],
    leverage, markets,
    prices: markets.map(m => ({ symbol: m.symbol, price: m.price, mark: m.mark, mark_price: m.mark_price,
      ...(m.price_change_24h != null ? { price_change_24h: m.price_change_24h } : {}) })),
  };
}

// ------------------------------------------------------------------ trading

function exactNumber(value, step, minimum, maximum, label) {
  const amount = new BigNumber(String(value ?? ''));
  const increment = new BigNumber(String(step));
  if (!amount.isFinite() || amount.lte(0)) throw failure(`${label} must be positive`, 400, 'THRONE_ORDER_INVALID');
  if (!increment.isFinite() || increment.lte(0)) throw failure(`Throne ${label} precision unavailable`, 502, 'THRONE_UPSTREAM_ERROR');
  if (!amount.mod(increment).eq(0)) throw failure(`${label} must be a multiple of ${step}`, 400, 'THRONE_ORDER_INVALID');
  if (minimum != null && minimum !== '' && amount.lt(minimum)) throw failure(`${label} is below the minimum ${minimum}`, 400, 'THRONE_ORDER_INVALID');
  if (maximum != null && maximum !== '' && Number(maximum) > 0 && amount.gt(maximum)) throw failure(`${label} exceeds ${maximum}`, 400, 'THRONE_ORDER_INVALID');
  return amount.toNumber();
}

/** Round a quantity down to the lot size (UI sends USD-derived sizes). */
function floorToStep(value, step) {
  const amount = new BigNumber(String(value ?? '')), increment = new BigNumber(String(step));
  if (!amount.isFinite() || !increment.isFinite() || increment.lte(0)) return amount;
  return amount.div(increment).integerValue(BigNumber.ROUND_FLOOR).times(increment);
}

async function marketFor(symbol) {
  const market = (await getMarkets()).find(m => m.symbol === symbol);
  if (!market || market.is_paused) throw failure('This Throne market is unavailable', 409, 'THRONE_MARKET_UNAVAILABLE');
  return market;
}

/** Orderly POST /v1/order body; client_order_id is our action UUID (36 chars, Orderly limit). */
async function orderParams(input, actionId) {
  if (!UUID.test(String(actionId || ''))) throw failure('A stable actionId UUID is required', 400, 'THRONE_ACTION_ID');
  const symbol = symbolOf(input.symbol);
  const market = await marketFor(symbol);
  const side = String(input.side || '').toUpperCase();
  if (!['BID', 'ASK', 'BUY', 'SELL', 'LONG', 'SHORT'].includes(side)) throw failure('Invalid order side', 400, 'THRONE_ORDER_INVALID');
  const requestedType = String(input.orderType || input.order_type || 'MARKET').toUpperCase();
  const tif = String(input.timeInForce || input.time_in_force || '').toUpperCase();
  let orderType = requestedType;
  if (requestedType === 'LIMIT' && (tif === 'ALO' || tif === 'POST_ONLY')) orderType = 'POST_ONLY';
  else if (requestedType === 'LIMIT' && (tif === 'IOC' || tif === 'FOK')) orderType = tif;
  if (!['MARKET', 'LIMIT', 'POST_ONLY', 'IOC', 'FOK'].includes(orderType)) throw failure('Unsupported Throne order type', 400, 'THRONE_ORDER_INVALID');
  const quantity = exactNumber(floorToStep(input.quantity ?? input.amount, market.lot_size).toFixed(), market.lot_size,
    market.min_quantity, market.max_quantity, 'Quantity');
  const params = { symbol, client_order_id: String(actionId).toLowerCase(), order_type: orderType,
    side: ['BID', 'BUY', 'LONG'].includes(side) ? 'BUY' : 'SELL', order_quantity: quantity,
    reduce_only: input.reduceOnly === true || input.reduce_only === true };
  if (orderType !== 'MARKET') params.order_price = exactNumber(input.price, market.tick_size, null, null, 'Price');
  const reference = params.order_price ?? positive(market.mark) ?? 0;
  if (!params.reduce_only && reference > 0 && quantity * reference < number(market.min_notional_usd)) {
    throw failure(`Order value is below the Throne minimum of $${market.min_notional_usd}`, 400, 'THRONE_ORDER_INVALID');
  }
  return params;
}

async function readLeverage(creds, symbol) {
  const data = await request('GET', '/v1/client/leverage', { creds, query: { symbol } });
  return number(data?.leverage) || null;
}

/** Per-symbol leverage (POST /v1/client/leverages, single-symbol mode). */
async function setLeverage(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds);
  const symbol = symbolOf(input.symbol);
  const market = await marketFor(symbol);
  const leverage = Number(input.leverage);
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > market.max_leverage) {
    throw failure(`Leverage must be a whole number between 1 and ${market.max_leverage}`, 400, 'THRONE_LEVERAGE_INVALID');
  }
  if (await readLeverage(creds, symbol) === leverage) return { success: true, unchanged: true, symbol, leverage, account_id: creds.accountId };
  await request('POST', '/v1/client/leverages', { creds, body: { symbol, leverage } });
  snapshotCache.clear();
  return { success: true, symbol, leverage, account_id: creds.accountId };
}

async function placeOrder(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const params = await orderParams(input, input.actionId || input.idempotencyKey);
  if (input.leverage != null && input.leverage !== '' && !params.reduce_only) {
    // Orderly applies leverage per symbol; align it before the order (not an order itself).
    const wanted = Math.round(Number(input.leverage));
    if (Number.isFinite(wanted) && wanted >= 1 && await readLeverage(creds, params.symbol) !== wanted) {
      await setLeverage(creds, { symbol: params.symbol, leverage: wanted }, options);
    }
  }
  const result = await executeAction(creds, input, options, 'add_order', params,
    () => request('POST', '/v1/order', { creds, body: params }));
  // Optional TP/SL attached by the ticket: a positional TP/SL once the position exists.
  const takeProfit = input.takeProfit ?? input.take_profit, stopLoss = input.stopLoss ?? input.stop_loss;
  if (!result.replayed && !params.reduce_only && ((takeProfit != null && takeProfit !== '') || (stopLoss != null && stopLoss !== ''))) {
    try {
      result.tpsl = await setTpsl(creds, { symbol: params.symbol, actionId: deriveActionId(input.actionId || input.idempotencyKey, 'attach'),
        ...(takeProfit != null && takeProfit !== '' ? { takeProfit } : {}), ...(stopLoss != null && stopLoss !== '' ? { stopLoss } : {}) }, options);
    } catch (error) { result.tpsl_error = error.message; }
  }
  return result;
}

async function cancelOrder(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const symbol = symbolOf(input.symbol);
  const orderId = String(input.orderId || input.order_id || '').trim();
  if (!/^\d{1,20}$/u.test(orderId)) throw failure('Orderly order id is required', 400, 'THRONE_ORDER_INVALID');
  const algo = input.algo === true || input.isStop === true;
  return executeAction(creds, input, options, algo ? 'cancel_algo_order' : 'cancel_order', { symbol, order_id: orderId },
    () => request('DELETE', algo ? '/v1/algo/order' : '/v1/order', { creds, query: { order_id: orderId, symbol } })
      .then(data => ({ ...data, order_id: orderId })));
}

async function readPosition(creds, symbol) {
  const data = await request('GET', '/v1/positions', { creds });
  return (data?.rows || []).find(p => p.symbol === symbol && number(p.position_qty) !== 0) || null;
}

/** Close with a reduce-only market order on the opposite side. */
async function closePosition(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const symbol = symbolOf(input.symbol || input.positionId);
  const position = await readPosition(creds, symbol);
  if (!position) throw failure('No Throne position exists for this symbol', 409, 'THRONE_NO_POSITION');
  const size = Math.abs(number(position.position_qty));
  const requested = input.fullClose ? size : (input.quantity ?? input.amount ?? size);
  if (new BigNumber(String(requested)).gt(size)) throw failure('Close quantity exceeds the open position', 400, 'THRONE_ORDER_INVALID');
  const params = await orderParams({ symbol, quantity: requested, side: number(position.position_qty) > 0 ? 'SELL' : 'BUY',
    orderType: 'MARKET', reduceOnly: true }, input.actionId || input.idempotencyKey);
  return executeAction(creds, input, options, 'add_order', params, () => request('POST', '/v1/order', { creds, body: params }));
}

function deriveActionId(actionId, step) {
  const hex = crypto.createHash('sha256').update(`throne-step\0${actionId}\0${step}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Set, replace or clear position TP/SL. Orderly keeps them as one POSITIONAL_TP_SL algo
 * order (children TAKE_PROFIT / STOP_LOSS, type CLOSE_POSITION, reduce_only). We cancel the
 * existing one and place the merged legs; an omitted leg keeps its current trigger.
 */
async function setTpsl(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const actionId = String(input.actionId || input.idempotencyKey || '');
  if (!UUID.test(actionId)) throw failure('A stable actionId UUID is required', 400, 'THRONE_ACTION_ID');
  const symbol = symbolOf(input.symbol || input.positionId);
  const [position, algos, market] = await Promise.all([readPosition(creds, symbol),
    readAllPages(creds, '/v1/algo/orders', { status: 'INCOMPLETE', symbol }), marketFor(symbol)]);
  if (!position) throw failure('No Throne position exists for this symbol', 409, 'THRONE_NO_POSITION');
  const long = number(position.position_qty) > 0, closeSide = long ? 'SELL' : 'BUY';
  const entry = number(position.average_open_price), mark = number(position.mark_price) || number(market.mark) || entry;
  const legs = algoLegs(algos).filter(l => l.symbol === symbol && !l.is_triggered);
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
    const price = exactNumber(value, market.tick_size, null, null, kind === 'TAKE_PROFIT' ? 'Take profit' : 'Stop loss');
    const reference = entry > 0 ? entry : mark;
    if (kind === 'TAKE_PROFIT' && (long ? price <= reference : price >= reference)) {
      throw failure(`Take profit must be ${long ? 'above' : 'below'} the entry price (${reference}).`, 400, 'THRONE_TPSL_INVALID');
    }
    if (kind === 'STOP_LOSS' && (long ? price >= mark : price <= mark)) {
      throw failure(`Stop loss must be ${long ? 'below' : 'above'} the current price (${mark}).`, 400, 'THRONE_TPSL_INVALID');
    }
    wanted[kind] = price;
  }
  if (!mentioned) throw failure('Enter a take-profit or stop-loss price', 400, 'THRONE_TPSL_INVALID');
  if (wanted.TAKE_PROFIT === current.TAKE_PROFIT && wanted.STOP_LOSS === current.STOP_LOSS) {
    return { success: true, unchanged: true, symbol, account_id: creds.accountId, action_id: actionId };
  }
  let step = 0;
  const roots = [...new Set(legs.map(l => l.root_algo_order_id).filter(Boolean))];
  for (const root of roots) {
    await executeAction(creds, { actionId: deriveActionId(actionId, ++step) }, options, 'cancel_algo_order', { symbol, order_id: root },
      () => request('DELETE', '/v1/algo/order', { creds, query: { order_id: root, symbol } }).then(data => ({ ...data, order_id: root })));
  }
  let placed = null;
  const children = [['TAKE_PROFIT', wanted.TAKE_PROFIT], ['STOP_LOSS', wanted.STOP_LOSS]].filter(([, price]) => price != null)
    .map(([algoType, price]) => ({ symbol, algo_type: algoType, side: closeSide, type: 'CLOSE_POSITION', trigger_price: price, reduce_only: true }));
  if (children.length) {
    const legId = deriveActionId(actionId, ++step);
    const body = { symbol, algo_type: 'POSITIONAL_TP_SL', trigger_price_type: 'MARK_PRICE', client_order_id: legId, child_orders: children };
    placed = await executeAction(creds, { actionId: legId }, options, 'algo_order', body, () => request('POST', '/v1/algo/order', { creds, body }));
  }
  snapshotCache.clear();
  return { success: true, symbol, account_id: creds.accountId, action_id: actionId,
    take_profit: wanted.TAKE_PROFIT, stop_loss: wanted.STOP_LOSS, algo_order: placed };
}

// ------------------------------------------------------------------ action recovery

async function getActionStatus(credsInput, actionId, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (!UUID.test(String(actionId || ''))) throw failure('Invalid action UUID', 400, 'THRONE_ACTION_ID');
  claimAccount(options.playerId, creds);
  const row = database().prepare('SELECT * FROM throne_action_intents WHERE account_id=? AND player_id=? AND action_id=?')
    .get(creds.accountId, String(options.playerId), actionId);
  if (!row) throw failure('Throne action not found', 404, 'THRONE_ACTION_NOT_FOUND', { account_id: creds.accountId });
  const response = { action_id: actionId, account_id: creds.accountId, status: row.status, can_resubmit: false };
  if (!['unknown', 'pending'].includes(row.status) || row.kind !== 'add_order') {
    return { ...response, result: row.result_json ? JSON.parse(row.result_json) : null };
  }
  // Orderly indexes orders by our client_order_id (= action UUID): read it, never resend.
  let order = null;
  try { order = await request('GET', `/v1/client/order/${encodeURIComponent(row.client_order_id)}`, { creds }); }
  catch (error) { if (error.code !== 'THRONE_NOT_FOUND') throw error; }
  if (!order?.order_id) return { ...response, status: 'unknown' };
  const params = JSON.parse(row.params_json || '{}');
  const exact = order.symbol === params.symbol && order.side === params.side
    && new BigNumber(String(order.quantity)).eq(params.order_quantity);
  if (!exact) return { ...response, status: 'manual_review', reason: 'Order parameters do not match the intent' };
  const result = { success: true, order_id: String(order.order_id), status: order.status, action_id: actionId,
    account_id: creds.accountId, broker_id: BROKER_ID, reconciled: true, broker_attributed: true };
  finishAction(row, 'reconciled', result);
  return { ...response, status: 'reconciled', result };
}

// ------------------------------------------------------------------ history and reward proof

function normalizeTrade(t) {
  const qty = number(t.executed_quantity), price = number(t.executed_price);
  const ts = number(t.executed_timestamp);
  return { id: String(t.id), order_id: String(t.order_id), symbol: t.symbol, side: t.side === 'BUY' ? 'open_long' : 'open_short',
    amount: String(Math.abs(qty)), price: String(price), notional_usd: Math.abs(qty) * price, pnl: t.realized_pnl ?? null,
    fee: t.fee ?? null, fee_asset: t.fee_asset ?? null, is_maker: t.is_maker === 1 || t.is_maker === true,
    created_at: ts > 0 ? new Date(ts).toISOString() : null, _raw: t };
}

async function getTradeHistory(credsInput, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds);
  const size = Math.max(1, Math.min(500, Math.floor(Number(options.limit) || 100)));
  const query = { size, page: 1, ...(options.symbol ? { symbol: symbolOf(options.symbol) } : {}) };
  const data = await request('GET', '/v1/trades', { creds, query });
  return (data?.rows || []).map(normalizeTrade);
}

/**
 * Reward proof (same model as QFEX): a fill is credited only if it belongs to an order we
 * placed ourselves (accepted/reconciled add_order intent carrying Orderly's order_id) on an
 * account registered under broker `throne`, read from Orderly's per-order trade feed
 * (GET /v1/order/{order_id}/trades), with the same symbol and side and a size that never
 * exceeds the order quantity. Fills of orders placed elsewhere are never looked up.
 */
function verifyFill(intent, params, trade, alreadyFilled) {
  if (trade.order_id !== String(intent.order_id)) return 'foreign_order';
  if (trade.symbol !== params.symbol || trade._raw.side !== params.side) return 'mismatch';
  const qty = new BigNumber(trade.amount);
  if (!qty.isFinite() || qty.lte(0) || !(number(trade.price) > 0)) return 'invalid';
  if (qty.gt(params.order_quantity) || alreadyFilled.plus(qty).gt(new BigNumber(params.order_quantity).times(1.000001))) return 'oversize';
  return null;
}

async function importTradesForPlayer(playerId, credsInput, options = {}) {
  const creds = await resolveAccount(credsInput);
  claimAccount(playerId, creds);
  const db = database();
  const ledger = options.ledger || require('./db');
  const maxOrders = Math.max(1, Math.min(40, Math.floor(Number(options.maxOrders) || 25)));
  const since = new Date(nowImpl() - 30 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const intents = db.prepare(`SELECT * FROM throne_action_intents
    WHERE account_id=? AND player_id=? AND kind='add_order' AND status IN ('accepted','reconciled')
      AND order_id IS NOT NULL AND fills_done=0 AND broker_id='throne' AND created_at >= ?
    ORDER BY last_checked_at ASC, created_at ASC LIMIT ?`).all(creds.accountId, String(playerId), since, maxOrders);
  let imported = 0, updated = 0, skipped = 0, total = 0, checked = 0;
  const rejected = {};
  for (const intent of intents) {
    const params = JSON.parse(intent.params_json || '{}');
    const [fills, order] = await Promise.all([
      request('GET', `/v1/order/${encodeURIComponent(intent.order_id)}/trades`, { creds }),
      request('GET', `/v1/order/${encodeURIComponent(intent.order_id)}`, { creds }).catch(() => null)]);
    checked++;
    let filled = new BigNumber(0);
    const seen = new Set();
    for (const raw of (Array.isArray(fills?.rows) ? fills.rows : Array.isArray(fills) ? fills : [])) {
      const trade = normalizeTrade(raw);
      if (seen.has(trade.id)) continue;
      seen.add(trade.id); total++;
      const reason = verifyFill(intent, params, trade, filled);
      if (reason) { skipped++; rejected[reason] = (rejected[reason] || 0) + 1; continue; }
      filled = filled.plus(trade.amount);
      const side = params.reduce_only ? (params.side === 'SELL' ? 'close_long' : 'close_short') : trade.side;
      const result = ledger.upsertVerifiedTrade(playerId, { symbol: trade.symbol, side, amount: trade.amount, price: trade.price,
        orderId: trade.order_id, clientOrderId: `throne:${creds.accountId}:fill:${trade.id}`, dex: 'throne', status: 'filled',
        orderType: String(params.order_type || 'market').toLowerCase(), notional_usd: trade.notional_usd,
        verifiedSource: VERIFIED_SOURCE, pnl: trade.pnl, fee: trade.fee, createdAt: trade.created_at,
        proofJson: JSON.stringify({ account_id: creds.accountId, address: creds.address, broker_id: BROKER_ID,
          action_id: intent.action_id, order_id: String(intent.order_id), params, fill: trade._raw }) });
      imported += Number(result.inserted || 0); updated += Number(result.updated || 0);
    }
    const terminal = TERMINAL_ORDER_STATUS.has(String(order?.status || '').toUpperCase());
    db.prepare(`UPDATE throne_action_intents SET fills_done=?, filled_quantity=?, last_checked_at=?
      WHERE account_id=? AND player_id=? AND action_id=?`).run(terminal ? 1 : 0, filled.toFixed(), nowImpl(),
      intent.account_id, intent.player_id, intent.action_id);
  }
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM throne_action_intents WHERE account_id=? AND player_id=?
    AND kind='add_order' AND status IN ('accepted','reconciled') AND order_id IS NOT NULL AND fills_done=0`).get(creds.accountId, String(playerId)).n;
  return { ok: true, account_id: creds.accountId, broker_id: BROKER_ID, imported, updated, skipped, total, checked,
    rejected, has_more: pending > checked, pending_orders: pending, reward_eligible: true };
}

// ------------------------------------------------------------------ Throne arena board (public, read-only)

const boardCache = new Map();
async function readBoard(path, query = {}) {
  const url = new URL(`/api/arena/${path}`, BOARD_ORIGIN);
  for (const [key, value] of Object.entries(query)) if (value != null && value !== '') url.searchParams.set(key, String(value));
  const key = url.toString();
  const hit = boardCache.get(key);
  if (hit && nowImpl() - hit.time < 60000) return hit.data;
  let response;
  try { response = await fetchImpl(key, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' }); }
  catch { throw failure('Throne board is unavailable.', 502, 'THRONE_BOARD_UNAVAILABLE'); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== 'object') throw failure('Throne board is unavailable.', 502, 'THRONE_BOARD_UNAVAILABLE');
  if (boardCache.size > 500) boardCache.delete(boardCache.keys().next().value);
  boardCache.set(key, { data, time: nowImpl() });
  return data;
}

/** Read-only standing for the account card: side, points, volume, season state. */
async function getStanding(address) {
  const raw = String(address || '').trim();
  if (!EVM_ADDRESS.test(raw)) throw failure('A valid EVM wallet address is required.', 400, 'THRONE_WALLET_ADDRESS');
  const wallet = raw.toLowerCase();
  const [quest, side, season] = await Promise.all([
    readBoard('quest', { address: wallet }).catch(() => null),
    readBoard('side', { address: wallet }).catch(() => null),
    readBoard('season').catch(() => null)]);
  const pick = (source, keys) => Object.fromEntries(keys.filter(k => source && source[k] !== undefined).map(k => [k, source[k]]));
  return { address: wallet, app_url: APP_URL,
    quest: quest ? pick(quest, ['season', 'week', 'traded', 'tradedWeek', 'points', 'pointsWeek', 'side', 'hasSide', 'piece', 'rank', 'qualified', 'floorUsd', 'checkins']) : null,
    side: side && !side.error ? side : null,
    season: season ? pick(season, ['season', 'state', 'week', 'weeks', 'opens', 'closes', 'start', 'end', 'counts', 'sideLock']) : null };
}

// ------------------------------------------------------------------ config

function configStatus() {
  return { ok: true, dex: 'throne', api_origin: API_ORIGIN, app_url: APP_URL, broker_id: BROKER_ID,
    authentication: 'orderly_key', deposit_url: APP_URL, reward_eligible: true,
    attribution_note: 'Orders are placed on your Orderly account under broker "throne" and count toward Throne\'s board.' };
}

function setTestDependencies(options = {}) {
  fetchImpl = options.fetch || ((...args) => fetch(...args));
  databaseOverride = options.database || null;
  timeoutMs = options.timeoutMs || 12000;
  nowImpl = options.now || (() => Date.now());
  marketCache = null; marketLoad = null; chainCache = null; relayLimiter.clear(); accountCache.clear(); snapshotCache.clear(); boardCache.clear();
}

module.exports = { API_ORIGIN, BROKER_ID, VERIFIED_SOURCE, credentials, decodeSecret, orderlyKeyFromSecret, computeAccountId,
  signRequest, request, mapOrderlyError, configStatus, normalizeMarket, getMarkets, getPrices, getCandles, getOrderbook,
  getOnboardingStatus, getRegistrationNonce, supportedChains, registerAccount, addOrderlyKey, resolveAccount, getAccountSnapshot, placeOrder, cancelOrder, closePosition, setLeverage, setTpsl,
  getActionStatus, getTradeHistory, importTradesForPlayer, verifyFill, getStanding, ensureSchema, setTestDependencies, symbolOf };
