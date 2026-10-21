'use strict';

const crypto = require('crypto');
const WebSocket = require('ws');
const BigNumber = require('bignumber.js');
const API_ORIGIN = 'https://api.qfex.com';
const TRADE_ORIGIN = 'wss://trade.qfex.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ACCEPTED = new Set(['ACK', 'FILLED', 'IOC_PARTIALLY_FILLED', 'IOC_CANCELLED', 'CANCELLED', 'CANCELLED_STP']);
let fetchImpl = (...args) => fetch(...args);
let socketFactory = url => new WebSocket(url, { maxPayload: 4 * 1024 * 1024 });
let databaseOverride = null;
let timeoutMs = Math.max(2000, Math.min(30000, Number(process.env.QFEX_TIMEOUT_MS) || 12000));
let marketCache = null;
const initialized = new WeakSet();
const snapshotCache = new Map();
const socketCounts = new Map();

function failure(message, status = 400, code = 'QFEX_ERROR') {
  return Object.assign(new Error(message), { status, code });
}

/** Validate API credentials without persisting or logging their secret. */
function credentials(input = {}) {
  const publicKey = String(input.publicKey || input.public_key || '').trim();
  const secretKey = String(input.secretKey || input.secret_key || '').trim();
  const accountId = String(input.accountId || input.account_id || '').trim().toLowerCase();
  if (!publicKey || !secretKey || publicKey.length > 512 || secretKey.length > 512) {
    throw failure('QFEX public and secret API keys are required');
  }
  if (accountId && !UUID.test(accountId)) throw failure('Invalid QFEX account UUID');
  return { publicKey, secretKey, accountId };
}

/** Generate the documented nonce:Unix-seconds HMAC using the raw secret. */
function sign(input, nonce = crypto.randomBytes(24).toString('hex'), unixTs = Math.floor(Date.now() / 1000)) {
  const creds = credentials(input);
  return { public_key: creds.publicKey, nonce, unix_ts: unixTs,
    signature: crypto.createHmac('sha256', creds.secretKey).update(`${nonce}:${unixTs}`).digest('hex') };
}

/** REST headers. The primary account is never named: QFEX answers a named primary with 500 "position balance not found". */
function authHeaders(creds) {
  const h = sign(creds);
  return { 'x-qfex-public-key': h.public_key, 'x-qfex-nonce': h.nonce,
    'x-qfex-timestamp': String(h.unix_ts), 'x-qfex-hmac-signature': h.signature,
    ...(creds.accountId && !creds.primary ? { 'x-qfex-requested-account-id': creds.accountId } : {}) };
}

/** Perform a single REST read; trading requests are never retried automatically. */
async function request(path, creds = null, query = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw failure('QFEX REST requests require an exchange-relative path');
  }
  const url = new URL(path, API_ORIGIN);
  if (url.origin !== API_ORIGIN) throw failure('QFEX REST origin is not permitted');
  for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, String(value));
  let response;
  try {
    response = await fetchImpl(url.toString(), { headers: creds ? authHeaders({ ...credentials(creds), primary: creds.primary === true }) : {},
      signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  } catch { throw failure('QFEX read unavailable or timed out', 502, 'QFEX_READ_FAILED'); }
  // Read text once so non-JSON upstream pages (Cloudflare/WAF/5xx HTML) can be diagnosed.
  let text = '';
  let body = null;
  if (typeof response.text === 'function') {
    text = await response.text().catch(() => '');
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  } else body = await response.json().catch(() => null);
  if (!response.ok) {
    const contentType = String(response.headers?.get?.('content-type') || '');
    const snippet = text.replace(/\s+/g, ' ').slice(0, 300);
    // Never include request headers/credentials here, only the upstream response.
    console.warn('[qfex] upstream rejected', { path, status: response.status, contentType, html: /<html|<!doctype/i.test(snippet), snippet });
    if (response.status === 401) throw failure('QFEX rejected the API key or signature', 401, 'QFEX_UNAUTHORIZED');
    if (response.status === 403) throw failure('QFEX denied access. Check the API key permissions (view orders, positions and balance) and account scope.', 403, 'QFEX_FORBIDDEN');
    if (response.status === 404) throw failure('QFEX endpoint not found', 404, 'QFEX_NOT_FOUND');
    // A new, never-funded QFEX account has no balance snapshot yet.
    if (response.status === 500 && /position balance not found/i.test(String(body?.detail || ''))) throw failure('QFEX account has no balance yet', 409, 'QFEX_NO_BALANCE');
    if (response.status === 429) throw failure('QFEX rate limit reached. Try again shortly.', 429, 'QFEX_RATE_LIMITED');
    if (!body) throw failure(`QFEX returned an unexpected non-JSON response (${response.status}). Try again shortly.`, 502, 'QFEX_UPSTREAM_ERROR');
    throw failure(`QFEX read rejected (${response.status})`, 502, 'QFEX_UPSTREAM_REJECTED');
  }
  if (!body || typeof body !== 'object') {
    console.warn('[qfex] invalid upstream body', { path, status: response.status, snippet: text.replace(/\s+/g, ' ').slice(0, 300) });
    throw failure('Invalid QFEX response', 502, 'QFEX_UPSTREAM_ERROR');
  }
  return body;
}

/**
 * Positions + balance. QFEX answers 500 "position balance not found" for an account that
 * has never been funded; that is an empty account, not an outage (pilotbot treats it the
 * same way). A legacy record naming the primary account as a subaccount is retried unnamed.
 */
async function readPositions(creds) {
  const empty = () => ({ balance: {}, positions: [], empty_account: true });
  try {
    return await request('/user/positions', creds);
  } catch (error) {
    if (error?.code !== 'QFEX_NO_BALANCE') throw error;
    if (!creds?.accountId || creds.primary) return empty();
    return request('/user/positions', { ...creds, primary: true }).catch(retry => {
      if (retry?.code === 'QFEX_NO_BALANCE') return empty();
      throw retry;
    });
  }
}

function builderCode() {
  const code = String(process.env.QFEX_BUILDER_CODE || '').trim();
  if (code && !UUID.test(code)) throw failure('QFEX builder configuration is invalid', 503);
  return code || null;
}

/** Builder-account API key allowed to register wallet users (`register_user`). */
function builderCredentials() {
  const publicKey = String(process.env.QFEX_BUILDER_PUBLIC_KEY || '').trim();
  const secretKey = String(process.env.QFEX_BUILDER_SECRET_KEY || '').trim();
  return publicKey && secretKey ? { publicKey, secretKey, accountId: '' } : null;
}

function walletRegistrationReady() {
  try { return !!(builderCode() && builderCredentials()); } catch { return false; }
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const walletRegistrations = new Map();

/** Fetch the exact wallet message QFEX wants signed; the builder code is server-side only. */
async function getWalletMessage(address) {
  const code = builderCode();
  if (!code || !builderCredentials()) throw failure('QFEX wallet registration is not configured yet.', 503, 'QFEX_WALLET_UNAVAILABLE');
  const raw = String(address || '').trim();
  if (!EVM_ADDRESS.test(raw)) throw failure('A valid EVM wallet address is required.', 400, 'QFEX_WALLET_ADDRESS');
  // SIWE requires the EIP-55 checksummed address; lowercase can resolve to a new QFEX user.
  const wallet = require('ethers').getAddress(raw.toLowerCase());
  const url = new URL('/builder/web3/message', API_ORIGIN);
  url.searchParams.set('address', wallet);
  url.searchParams.set('builder_code', code);
  let response;
  try {
    response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  } catch { throw failure('QFEX is unavailable. Try again shortly.', 502, 'QFEX_READ_FAILED'); }
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.message !== 'string' || body.message.length > 2000) {
    console.warn('[qfex] wallet message rejected', { status: response.status });
    throw failure('QFEX could not prepare the wallet message.', 502, 'QFEX_WALLET_MESSAGE');
  }
  return { message: body.message, address: wallet, expires_in_seconds: 600 };
}

/**
 * Exchange a signed wallet message for a trading-only API key on the user's main account.
 * Each success replaces the user's previous builder key, so attempts are rate limited.
 */
async function registerWalletKey(input = {}, options = {}) {
  const code = builderCode();
  const builder = builderCredentials();
  if (!code || !builder) throw failure('QFEX wallet registration is not configured yet.', 503, 'QFEX_WALLET_UNAVAILABLE');
  const message = typeof input.message === 'string' ? input.message : '';
  const signature = String(input.signature || '').trim();
  if (!message || message.length > 2000 || !message.includes(code) || !/^0x[0-9a-fA-F]{130,1000}$/u.test(signature)) {
    throw failure('Invalid wallet message or signature. Request a new message and sign again.', 400, 'QFEX_WALLET_SIGNATURE');
  }
  const limiterKey = String(options.playerId || 'anonymous');
  const last = walletRegistrations.get(limiterKey) || 0;
  if (Date.now() - last < 15000) throw failure('Please wait a few seconds before trying again.', 429, 'QFEX_RATE_LIMITED');
  walletRegistrations.set(limiterKey, Date.now());
  if (walletRegistrations.size > 1000) walletRegistrations.delete(walletRegistrations.keys().next().value);
  let response;
  try {
    response = await fetchImpl(new URL('/builder/web3/api-key', API_ORIGIN).toString(), {
      method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(builder) },
      body: JSON.stringify({ message, signature }), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  } catch { throw failure('QFEX is unavailable. Try again shortly.', 502, 'QFEX_READ_FAILED'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // Status and QFEX's problem detail only; never the request body or any key material.
    console.warn('[qfex] wallet registration rejected', { status: response.status, detail: String(body?.detail || body?.title || '').slice(0, 160) });
    if (response.status === 403) throw failure('Wallet registration is not enabled for this builder yet.', 503, 'QFEX_WALLET_UNAVAILABLE');
    if (response.status === 400 || response.status === 401 || response.status === 422) {
      throw failure('QFEX rejected the signature. Request a new message and sign again. New QFEX accounts may need to finish onboarding first.', 422, 'QFEX_WALLET_SIGNATURE');
    }
    throw failure('QFEX could not create the trading key. Try again shortly.', 502, 'QFEX_WALLET_REGISTER');
  }
  const accountId = String(body?.account_id || '').toLowerCase();
  if (!UUID.test(accountId) || !body?.public_key || !body?.secret_key) {
    throw failure('QFEX returned an incomplete trading key.', 502, 'QFEX_WALLET_REGISTER');
  }
  // Bind the issued key to the account QFEX named, so later requests never have to trust a
  // browser-supplied account id or list accounts with a key that cannot list them.
  try {
    database().prepare(`INSERT INTO qfex_wallet_keys(key_hash,account_id,player_id) VALUES (?,?,?)
      ON CONFLICT(key_hash) DO UPDATE SET account_id=excluded.account_id,player_id=excluded.player_id`)
      .run(keyHash(String(body.public_key)), accountId, options.playerId ? String(options.playerId) : null);
  } catch (error) { console.warn('[qfex] wallet key binding not stored', { code: String(error?.code || 'error').slice(0, 40) }); }
  accountCache.clear();
  return { public_key: String(body.public_key), secret_key: String(body.secret_key), account_id: accountId };
}

/** Report configuration without exposing API secrets. */
function configStatus() {
  return { ok: true, dex: 'qfex', api_origin: API_ORIGIN, app_url: 'https://qfex.com',
    authentication: 'api_keys', wallet_registration: walletRegistrationReady(),
    builder_configured: !!builderCode(), reward_eligible: !!builderCode(),
    attribution_note: builderCode() ? 'Clash session builder attribution enabled.' : 'Builder code pending; trading available, Gold rewards unavailable.' };
}

function number(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }

/** Normalize exchange reference data and live prices for the trading UI. */
function normalizeMarket(raw, contract = {}) {
  return { ...raw, symbol: raw.symbol, display_symbol: raw.symbol, name: raw.base_asset,
    dex: 'qfex', max_leverage: number(raw.default_max_leverage, 1),
    min_order_size: raw.min_quantity, min_quantity: raw.min_quantity,
    min_notional_usd: number(raw.min_quantity) * number(contract.last_price),
    price: String(contract.last_price || contract.index_price || '0'),
    mark_price: String(contract.index_price || contract.last_price || '0'),
    volume_24h: String(contract.target_volume || '0'), funding_rate: String(contract.funding_rate || '0'),
    is_paused: raw.status !== 'ACTIVE', tick_size: raw.tick_size, lot_size: raw.lot_size };
}

/** Read mandatory trading precision and contract metadata. */
async function getMarkets(options = {}) {
  if (!options.force && marketCache && Date.now() - marketCache.time < 15000) return marketCache.rows;
  const [refs, contracts] = await Promise.all([request('/refdata'), request('/md/contracts')]);
  if (!Array.isArray(refs.data) || !Array.isArray(contracts.data)) throw failure('Invalid QFEX market response', 502);
  const prices = new Map(contracts.data.map(row => [row.ticker_id, row]));
  const rows = refs.data.map(row => normalizeMarket(row, prices.get(row.symbol)));
  marketCache = { rows, time: Date.now() };
  return rows;
}

/** Return current normalized prices. */
async function getPrices() {
  return (await getMarkets({ force: true })).map(m => ({ symbol: m.symbol, price: m.price,
    mark_price: m.mark_price, oracle_price: m.mark_price, funding_rate: m.funding_rate,
    volume_24h: m.volume_24h, change_24h: number(m.price_change_24h) }));
}

function symbolOf(value) {
  const symbol = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/u.test(symbol)) throw failure('Invalid QFEX market symbol');
  return symbol;
}

/** Read the real exchange order book. */
async function getOrderbook(symbol) {
  const raw = await request(`/md/orderbook/${encodeURIComponent(symbolOf(symbol))}`);
  return { symbol: raw.ticker_id, bids: raw.bids || [], asks: raw.asks || [], timestamp: raw.timestamp };
}

/** Read exchange candles for a bounded time range. */
async function getCandles(symbol, options = {}) {
  const intervals = { '1m': '1MIN', '5m': '5MINS', '15m': '15MINS', '30m': '30MINS', '1h': '1HOUR', '4h': '4HOURS', '1d': '1DAY' };
  const requested = String(options.resolution || options.interval || '1HOUR');
  const resolution = intervals[requested] || requested;
  if (!Object.values(intervals).includes(resolution)) throw failure('Unsupported QFEX candle interval');
  const end = new Date(options.end || options.toISO || Date.now());
  const start = new Date(options.start || options.fromISO || end.getTime() - 7 * 86400000);
  if (!Number.isFinite(end.getTime()) || !Number.isFinite(start.getTime()) || start >= end) throw failure('Invalid candle time range');
  const raw = await request(`/candles/${encodeURIComponent(symbolOf(symbol))}`,
    null, { resolution, fromISO: start.toISOString(), toISO: end.toISOString() });
  return (raw.candles || []).map(c => ({ time: Math.floor(Date.parse(c.startedAt) / 1000),
    open: number(c.open), high: number(c.high), low: number(c.low), close: number(c.close), volume: number(c.baseTokenVolume) }));
}

const accountCache = new Map();
const keyHash = publicKey => crypto.createHash('sha256').update(`qfex-key\0${publicKey}`).digest('hex');

/** Account a wallet-registered key was issued for, recorded server-side at registration. */
function boundAccount(publicKey) {
  try {
    return database().prepare('SELECT account_id FROM qfex_wallet_keys WHERE key_hash=?').get(keyHash(publicKey))?.account_id || null;
  } catch { return null; }
}

/**
 * Resolve the real account identity; credential fingerprints cannot claim rewards.
 * GET /user/public-accounts does not exist on QFEX (only PUT /user/public-accounts/{id};
 * production answers a plain-text 404), so it is never called. Evidence, in order:
 *  1. wallet-registered key: the account QFEX returned from /builder/web3/api-key. That key
 *     belongs to the user's primary account, which (as in pilotbot) is never named;
 *  2. GET /user/subaccounts/equity, which lists the key's accounts with is_master;
 *  3. legacy keys that cannot list accounts: a positions read naming the account.
 */
async function resolveAccount(credsInput) {
  const creds = credentials(credsInput);
  const cacheKey = credentialScope(creds);
  const cached = accountCache.get(cacheKey);
  if (cached && Date.now() - cached.time < 60000) return { ...creds, accountId: cached.accountId, primary: cached.primary };
  const remember = (accountId, primary) => {
    if (accountCache.size >= 512) accountCache.delete(accountCache.keys().next().value);
    accountCache.set(cacheKey, { accountId, primary, time: Date.now() });
    return { ...creds, accountId, primary };
  };
  const bound = boundAccount(creds.publicKey);
  if (bound) {
    if (creds.accountId && creds.accountId !== bound) throw failure('This QFEX key belongs to a different account. Reconnect QFEX.', 403, 'QFEX_ACCOUNT_MISMATCH');
    return remember(bound, true);
  }
  let result;
  try {
    result = await request('/user/subaccounts/equity', { ...creds, primary: true });
  } catch (error) {
    const unlisted = ['QFEX_FORBIDDEN', 'QFEX_NOT_FOUND'].includes(error?.code);
    if (unlisted && !UUID.test(creds.accountId)) {
      throw failure('QFEX could not identify the account for this key. Reconnect QFEX with your wallet, or add the account ID.', 403, 'QFEX_ACCOUNT_UNRESOLVED');
    }
    if (!unlisted) throw error;
    // QFEX rejects a requested account the key does not own, so a positions read
    // naming that account proves ownership.
    try { await request('/user/positions', creds); }
    catch (proof) { if (proof?.code !== 'QFEX_NO_BALANCE') throw proof; }
    return remember(creds.accountId, false);
  }
  const accounts = Array.isArray(result?.accounts) ? result.accounts : Array.isArray(result?.data) ? result.data : [];
  const account = accounts.find(a => creds.accountId ? String(a.account_id).toLowerCase() === creds.accountId : a.is_master === true);
  if (!account || !UUID.test(String(account.account_id))) throw failure('QFEX account identity could not be verified', 403, 'QFEX_ACCOUNT_UNRESOLVED');
  return remember(String(account.account_id).toLowerCase(), account.is_master === true);
}

function database() {
  const db = databaseOverride || require('./db').db;
  ensureSchema(db);
  return db;
}

/** Initialize durable proof tables on the owning futures SQLite connection. */
function ensureSchema(db = databaseOverride || require('./db').db) {
  if (initialized.has(db)) return db;
  db.exec(`CREATE TABLE IF NOT EXISTS qfex_account_claims (
    account_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS qfex_action_intents (
    account_id TEXT NOT NULL, player_id TEXT NOT NULL, action_id TEXT NOT NULL,
    kind TEXT NOT NULL, payload_hash TEXT NOT NULL, client_order_id TEXT NOT NULL,
    builder_code TEXT, status TEXT NOT NULL, order_id TEXT, result_json TEXT, params_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(account_id, player_id, action_id));
    CREATE INDEX IF NOT EXISTS qfex_action_order ON qfex_action_intents(account_id, player_id, order_id);
    CREATE TABLE IF NOT EXISTS qfex_wallet_keys (
    key_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, player_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  if (!db.prepare('PRAGMA table_info(qfex_action_intents)').all().some(c => c.name === 'params_json')) {
    db.exec('ALTER TABLE qfex_action_intents ADD COLUMN params_json TEXT');
  }
  initialized.add(db);
  return db;
}

function claimAccount(playerId, accountId) {
  if (!playerId) throw failure('Player authentication is required', 401);
  const db = database();
  db.prepare('INSERT OR IGNORE INTO qfex_account_claims(account_id,player_id) VALUES (?,?)').run(accountId, String(playerId));
  const claim = db.prepare('SELECT player_id FROM qfex_account_claims WHERE account_id=?').get(accountId);
  if (claim.player_id !== String(playerId)) throw failure('This QFEX account is linked to another player', 409);
}

function beginAction(creds, playerId, actionId, kind, params) {
  if (!UUID.test(String(actionId || ''))) throw failure('A stable actionId UUID is required');
  claimAccount(playerId, creds.accountId);
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ kind, params })).digest('hex');
  const db = database();
  const inserted = db.prepare(`INSERT OR IGNORE INTO qfex_action_intents
    (account_id,player_id,action_id,kind,payload_hash,client_order_id,builder_code,status,params_json)
    VALUES (?,?,?,?,?,?,?,'pending',?)`).run(creds.accountId, String(playerId), actionId, kind,
    payloadHash, params.client_order_id || '', builderCode(), JSON.stringify(params));
  const row = db.prepare('SELECT * FROM qfex_action_intents WHERE account_id=? AND player_id=? AND action_id=?')
    .get(creds.accountId, String(playerId), actionId);
  if (row.payload_hash !== payloadHash) throw failure('actionId already belongs to a different request', 409, 'QFEX_ACTION_CONFLICT');
  if (!inserted.changes && !['accepted', 'reconciled'].includes(row.status)) {
    throw failure('This action was already attempted. Refresh account and history; do not resend.', 409, `QFEX_ACTION_${row.status.toUpperCase()}`);
  }
  return { row, created: !!inserted.changes };
}

function finishAction(row, status, result) {
  database().prepare(`UPDATE qfex_action_intents SET status=?,order_id=?,result_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE account_id=? AND player_id=? AND action_id=?`).run(status, result.order_id || null,
    JSON.stringify(result), row.account_id, row.player_id, row.action_id);
}

const PROTOCOL_ERRORS = {
  RateLimited: ['QFEX rate limited this connection. Try again in a few seconds.', 429, 'QFEX_RATE_LIMITED'],
  PermissionDenied: ['This QFEX key is not allowed to trade. Reconnect QFEX, or use a key with the Execute orders permission.', 403, 'QFEX_PERMISSION_DENIED'],
  KycRequired: ['QFEX requires identity verification (KYC) before this account can trade. Complete it on qfex.com.', 403, 'QFEX_KYC_REQUIRED'],
  TncRequired: ['QFEX requires you to accept its terms before trading. Accept them on qfex.com.', 403, 'QFEX_TERMS_REQUIRED'],
  InvalidJSONFormat: ['QFEX could not read the order request. Nothing was placed.', 400, 'QFEX_ORDER_INVALID'],
  InvalidParameter: ['QFEX rejected an order parameter. Nothing was placed.', 400, 'QFEX_ORDER_INVALID'],
  InvalidOrder: ['QFEX rejected the order. Nothing was placed.', 400, 'QFEX_ORDER_INVALID'],
  InvalidOrderId: ['QFEX does not know this order.', 404, 'QFEX_ORDER_NOT_FOUND'],
  ServerError: ['QFEX reported an internal error (ServerError). Refresh the account before trying again.', 503, 'QFEX_SERVER_ERROR'],
};

/** Protocol `err` frame to a coded, readable failure. Only ServerError leaves a write uncertain. */
function protocolFailure(err = {}) {
  const code = String(err.error_code || err.code || '');
  const [message, status, errorCode] = Object.hasOwn(PROTOCOL_ERRORS, code) ? PROTOCOL_ERRORS[code]
    : [`QFEX rejected the request${/^[A-Za-z]{3,40}$/u.test(code) ? ` (${code})` : ''}.`, 400, 'QFEX_REJECTED'];
  return Object.assign(failure(message, status, errorCode), { definiteRejection: code !== 'ServerError', exchangeCode: code || null });
}

const REJECTIONS = {
  FAILED_MARGIN_CHECK: 'Not enough available margin on QFEX for this order.',
  INVALID_TICK_SIZE_PRECISION_PRICE: 'The price does not match the QFEX tick size.',
  INVALID_TICK_SIZE_PRECISION_QUANTITY: 'The quantity does not match the QFEX lot size.',
  QUANTITY_LESS_THAN_MIN_QUANTITY: 'The quantity is below the QFEX market minimum.',
  REJECTED_LESS_THAN_MIN_NOTIONAL: 'The order value is below the QFEX market minimum.',
  REJECTED_GREATER_THAN_MAX_PRICE_BAND: 'The price is above the current QFEX price band. Use a lower price.',
  REJECTED_LESS_THAN_MIN_PRICE_BAND: 'The price is below the current QFEX price band. Use a higher price.',
  REJECTED_MARKET_CLOSED: 'QFEX is not accepting orders in this market right now.',
  USER_IN_LIQUIDATION: 'This QFEX account is being liquidated and cannot place orders.',
  REJECTED_TOO_MANY_OPEN_ORDERS: 'This QFEX account has too many open orders.',
  REJECTED_OPEN_INTEREST_LIMIT: 'The QFEX open-interest limit for this market blocks a larger position.',
  REJECTED_TOTAL_OPEN_INTEREST_LIMIT: 'The QFEX total open-interest limit for this market has been reached.',
  RATE_LIMITED: 'QFEX rate limited this account. Try again in a few seconds.',
  BAD_SYMBOL: 'QFEX does not recognize this market.',
  INVALID_TIME_IN_FORCE: 'QFEX does not allow this time in force for the order type.',
  INVALID_CLIENT_ORDER_ID: 'QFEX rejected the order reference.',
  INVALID_TAKE_PROFIT_PRICE: 'QFEX rejected the take-profit price.',
  INVALID_TAKEPROFIT_PRICE: 'QFEX rejected the take-profit price.',
  INVALID_STOP_LOSS_PRICE: 'QFEX rejected the stop-loss price.',
  INVALID_STOPLOSS_PRICE: 'QFEX rejected the stop-loss price.',
  NO_SUCH_ORDER: 'QFEX has no open order with this ID.',
};

function responseFor(message, type, params) {
  // Docs: {user_trades, count}; production: {user_trades_response: [...] | {user_trades, count}}.
  if (type === 'get_user_trades') {
    const reply = message.user_trades_response ?? message;
    const rows = Array.isArray(reply) ? reply : reply?.user_trades;
    if (Array.isArray(rows)) return { data: rows, count: reply?.count ?? message.count };
  }
  if (type === 'get_user_orders') return message.all_orders_response;
  if (type === 'get_user_leverage') return message.user_leverage_response;
  if (type === 'get_available_leverage_levels') return message.available_leverage_levels_response;
  if (type === 'set_user_leverage') return message.ack_response === true ? { success: true } : null;
  const order = message.order_response;
  if (!order || order.symbol !== params.symbol) return null;
  if (params.client_order_id && order.client_order_id !== params.client_order_id) return null;
  if (type === 'cancel_order' && (order.order_id !== params.order_id || order.status === 'ACK')) return null;
  if (!ACCEPTED.has(order.status)) {
    const status = /^[A-Z0-9_]{1,80}$/u.test(String(order.status)) ? order.status : 'UNKNOWN_STATUS';
    const text = REJECTIONS[status] || 'QFEX rejected the order. Check the account balance, market and order size.';
    throw Object.assign(failure(`${text} (${status})`, status === 'RATE_LIMITED' ? 429 : 400, 'QFEX_ORDER_REJECTED'),
      { definiteRejection: true, exchangeCode: status });
  }
  return order;
}

/** Authenticate, subscribe, and execute one correlated command with no reconnect/retry. */
function credentialScope(creds) {
  return crypto.createHash('sha256').update(`${creds.publicKey}\0${creds.secretKey}\0${creds.accountId || ''}`).digest('hex');
}

function tradeCommand(creds, type, params, options = {}) {
  const key = credentialScope(creds);
  const count = socketCounts.get(key) || 0;
  if (count >= 4) return Promise.reject(failure('Too many concurrent QFEX requests', 429));
  socketCounts.set(key, count + 1);
  return runTradeCommand(creds, type, params, options).finally(() => {
    const remaining = (socketCounts.get(key) || 1) - 1;
    if (remaining) socketCounts.set(key, remaining); else socketCounts.delete(key);
  });
}

function runTradeCommand(creds, type, params, options = {}) {
  return new Promise((resolve, reject) => {
    let sent = false, settled = false, authenticated = false, opened = false;
    const seen = []; // message shapes only (no payload), for timeout diagnostics
    const ws = socketFactory(`${TRADE_ORIGIN}?api_key=${encodeURIComponent(creds.publicKey)}`);
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) error.outcomeUnknown = sent && !error.definiteRejection;
      ws.close(); error ? reject(error) : resolve(result);
    };
    const sendCommand = () => {
      if (sent) return;
      sent = true;
      ws.send(JSON.stringify({ type, params }), error => { if (error) finish(failure('QFEX command delivery uncertain', 502)); });
    };
    const timer = setTimeout(() => {
      console.warn('[qfex] trade socket timeout', { command: type, opened, authenticated, sent, seen: seen.slice(0, 8) });
      finish(failure('QFEX timed out; refresh account before another action', 504, 'QFEX_TIMEOUT'));
    }, timeoutMs);
    // The primary account is selected by omitting account_id (QFEX auth docs; pilotbot qfexAuthMessage).
    ws.on('open', () => { opened = true; ws.send(JSON.stringify({ type: 'auth', params: { hmac: sign(creds),
      ...(creds.accountId && !creds.primary ? { account_id: creds.accountId } : {}),
      ...(options.builderCode ? { builder_code: options.builderCode } : {}) } })); });
    ws.on('unexpected-response', (_request, response) => {
      const denied = response.statusCode === 401 || response.statusCode === 403;
      console.warn('[qfex] trade socket handshake rejected', { command: type, status: response.statusCode });
      finish(failure(denied ? 'QFEX rejected the API key for trading. Check that it has the Execute orders permission and the right account.'
        : 'QFEX connection failed', denied ? 401 : 502, 'QFEX_TRADE_REJECTED'));
    });
    ws.on('error', error => { console.warn('[qfex] trade socket error', { command: type, message: String(error?.message || '').slice(0, 120) }); finish(failure('QFEX connection failed', 502)); });
    ws.on('close', () => finish(failure('QFEX connection closed before confirmation', 502)));
    ws.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString());
        seen.push(message.type || Object.keys(message).filter(key => key !== '$schema').join('+').slice(0, 60));
        // Both documented forms: {err:{error_code,...}} and flat {type:'Err', error_code}.
        const err = message.err && typeof message.err === 'object' ? message.err
          : (/^err(or)?$/iu.test(String(message.type || '')) || message.error_code ? message : null);
        if (err) {
          if (err.error_code === 'AlreadyAuthenticated') return;
          const error = protocolFailure(err);
          // Code only: never the echoed request.
          console.warn('[qfex] trade socket error frame', { command: type, error_code: error.exchangeCode, sent });
          return finish(error);
        }
        // Docs show {type:'auth',result:'success'}; production replies {type:'authenticated'}.
        if (!message.type && Object.hasOwn(message, 'authenticated')) {
          const value = message.authenticated;
          console.warn('[qfex] trade socket auth reply', { value_type: typeof value, value: typeof value === 'object' ? Object.keys(value || {}).slice(0, 8) : value });
          if (value === false || value?.success === false || value?.error) return finish(failure('QFEX authentication rejected', 401));
          message.type = 'authenticated';
        }
        if (message.type === 'auth' || message.type === 'authenticated') {
          if (message.type === 'auth' && message.result !== 'success') return finish(failure('QFEX authentication rejected', 401));
          if (message.success === false || message.error) return finish(failure('QFEX authentication rejected', 401));
          if (authenticated) return; authenticated = true;
          if (type === 'add_order' || type === 'cancel_order') ws.send(JSON.stringify({ type: 'subscribe', params: { channels: ['order_responses'] } }));
          else sendCommand();
        } else if (authenticated && message.subscribed === 'order_responses') sendCommand();
        else if (sent) { const result = responseFor(message, type, params); if (result != null) finish(null, result); }
      } catch (error) { finish(error); }
    });
  });
}

/** Return account positions, balances, orders, and available leverage settings. */
async function getAccountSnapshot(credsInput, options = {}) {
  const key = `${String(options.playerId || '')}:${credentialScope(credentials(credsInput))}`;
  const existing = snapshotCache.get(key);
  if (existing && (existing.pending || Date.now() - existing.time < 2000)) return existing.promise;
  if (snapshotCache.size >= 128) {
    const evict = [...snapshotCache].find(([, entry]) => !entry.pending);
    if (!evict) throw failure('QFEX account reads are busy', 429);
    snapshotCache.delete(evict[0]);
  }
  const entry = { time: Date.now(), pending: true };
  entry.promise = loadAccountSnapshot(credsInput, options).then(result => {
    entry.pending = false; entry.time = Date.now(); return result;
  }, error => { snapshotCache.delete(key); throw error; });
  snapshotCache.set(key, entry);
  return entry.promise;
}

async function loadAccountSnapshot(credsInput, options) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds.accountId);
  const [raw, orderResult, leverage, availableLeverage, markets] = await Promise.all([
    readPositions(creds), tradeCommand(creds, 'get_user_orders', { limit: 1000, offset: 0 }),
    tradeCommand(creds, 'get_user_leverage', { limit: 1000, offset: 0 }),
    tradeCommand(creds, 'get_available_leverage_levels', { limit: 1000, offset: 0 }), getMarkets()]);
  const balance = raw.balance || {};
  const positions = (raw.positions || []).filter(p => number(p.position) !== 0).map(p => ({
    symbol: p.symbol, position_id: p.symbol, side: number(p.position) > 0 ? 'bid' : 'ask',
    amount: String(Math.abs(number(p.position))), entry_price: String(p.average_price),
    leverage: p.leverage, margin: Math.abs(number(p.position) * number(p.average_price)) / Math.max(1, number(p.leverage, 1)), unrealized_pnl: p.unrealised_pnl,
    realised_pnl: p.realised_pnl, _raw: p }));
  const equity = number(balance.available_balance) + number(balance.order_margin) + number(balance.position_margin);
  return { account: { account_id: creds.accountId, balance: number(balance.available_balance),
    usdc: number(balance.available_balance), available_to_spend: number(balance.available_balance),
    equity, account_equity: equity, total_margin_used: number(balance.position_margin), currency: 'USD',
    ...(raw.empty_account ? { empty_account: true } : {}) },
    positions, orders: (orderResult.orders || []).map(o => ({ ...o, id: o.order_id,
      side: o.side === 'BUY' ? 'bid' : 'ask', amount: String(o.quantity_remaining), order_type: o.type.toLowerCase() })),
    twaps: orderResult.twaps || [], leverage, available_leverage: availableLeverage,
    orders_truncated: (orderResult.orders || []).length >= 1000, markets,
    prices: markets.map(m => ({ symbol: m.symbol, price: m.price, mark_price: m.mark_price })) };
}

function exactNumber(value, step, minimum, maximum, label) {
  const amount = new BigNumber(String(value ?? ''));
  const increment = new BigNumber(String(step));
  if (!amount.isFinite() || amount.lte(0)) throw failure(`${label} must be positive`);
  if (!increment.isFinite() || increment.lte(0)) throw failure(`QFEX ${label} precision unavailable`, 502);
  if (!amount.mod(increment).eq(0)) throw failure(`${label} must be a multiple of ${step}`);
  if (minimum != null && amount.lt(minimum)) throw failure(`${label} is below ${minimum}`);
  if (maximum != null && amount.gt(maximum)) throw failure(`${label} exceeds ${maximum}`);
  const result = amount.toNumber();
  if (!Number.isFinite(result) || !new BigNumber(String(result)).eq(amount)) throw failure(`${label} exceeds safe exchange JSON precision`);
  return result;
}

async function orderParams(input, actionId) {
  const symbol = symbolOf(input.symbol);
  const market = (await getMarkets({ force: true })).find(m => m.symbol === symbol);
  if (!market || market.is_paused) throw failure('QFEX market is unavailable', 409);
  const side = String(input.side || '').toUpperCase();
  if (!['BID', 'ASK', 'BUY', 'SELL', 'LONG', 'SHORT'].includes(side)) throw failure('Invalid order side');
  const type = String(input.orderType || input.order_type || 'MARKET').toUpperCase();
  if (!['MARKET', 'LIMIT', 'ALO'].includes(type) || !market.order_types.includes(type)) throw failure('Unsupported QFEX order type');
  const tif = String(input.timeInForce || input.time_in_force || (type === 'MARKET' ? 'IOC' : 'GTC')).toUpperCase();
  if (!market.order_time_in_force.includes(tif)) throw failure('Unsupported QFEX time in force');
  const takeProfit = input.takeProfit ?? input.take_profit ?? input.tp;
  const stopLoss = input.stopLoss ?? input.stop_loss ?? input.sl;
  // Same shape as pilotbot's buildAddOrder: reduce_only is a JSON boolean (the integer 0/1
  // is answered with err InvalidJSONFormat), a market order carries no price, and unused
  // TP/SL fields are omitted instead of sent as 0.
  const params = { symbol, side: ['BID', 'BUY', 'LONG'].includes(side) ? 'BUY' : 'SELL', order_type: type,
    order_time_in_force: tif, quantity: exactNumber(input.quantity ?? input.amount,
      market.lot_size, market.min_quantity, market.max_quantity, 'Quantity'),
    reduce_only: input.reduceOnly === true || input.reduce_only === true, client_order_id: actionId };
  if (type !== 'MARKET') params.price = exactNumber(input.price, market.tick_size, market.min_price, market.max_price, 'Price');
  if (takeProfit != null && Number(takeProfit) !== 0) params.take_profit = exactNumber(takeProfit, market.tick_size, 0, null, 'Take profit');
  if (stopLoss != null && Number(stopLoss) !== 0) params.stop_loss = exactNumber(stopLoss, market.tick_size, 0, null, 'Stop loss');
  return params;
}

async function executeAction(creds, input, options, type, params) {
  const actionId = input.actionId || input.idempotencyKey;
  const intent = beginAction(creds, options.playerId || input.playerId, actionId, type, params);
  if (!intent.created) return { ...JSON.parse(intent.row.result_json), replayed: true };
  let exchangeAccepted = false;
  try {
    const result = await tradeCommand(creds, type, params, { builderCode: intent.row.builder_code });
    exchangeAccepted = true;
    const normalized = { success: true, ...result, order_id: result.order_id || null,
      action_id: actionId, account_id: creds.accountId, status: result.status || 'accepted',
      builder_attributed: !!intent.row.builder_code };
    finishAction(intent.row, 'accepted', normalized);
    snapshotCache.clear();
    return normalized;
  } catch (error) {
    error.outcomeUnknown = exchangeAccepted || !!error.outcomeUnknown;
    finishAction(intent.row, error.outcomeUnknown ? 'unknown' : 'rejected', { error: error.message });
    throw error;
  }
}

function findAction(creds, playerId, actionId) {
  if (!UUID.test(String(actionId || ''))) throw failure('Invalid action UUID');
  claimAccount(playerId, creds.accountId);
  const row = database().prepare('SELECT * FROM qfex_action_intents WHERE account_id=? AND player_id=? AND action_id=?')
    .get(creds.accountId, String(playerId), actionId);
  if (!row) throw Object.assign(failure('QFEX action not found', 404, 'QFEX_ACTION_NOT_FOUND'),
    { account_id: creds.accountId });
  return row;
}

/** Inspect/reconcile an ambiguous command using reads only; never resubmit it. */
async function getActionStatus(credsInput, actionId, options = {}) {
  const creds = await resolveAccount(credsInput);
  const row = findAction(creds, options.playerId, actionId);
  if (['unknown', 'pending'].includes(row.status) && row.kind === 'add_order') {
    return reconcileOrder(creds, row);
  }
  if (['unknown', 'pending'].includes(row.status)) return reconcileState(creds, row);
  return { action_id: actionId, account_id: creds.accountId, status: row.status,
    result: row.result_json ? JSON.parse(row.result_json) : null, can_resubmit: false };
}

async function reconcileState(creds, row) {
  const params = JSON.parse(row.params_json || '{}');
  const response = { action_id: row.action_id, account_id: creds.accountId, status: 'unknown', can_resubmit: false };
  let confirmed = false, state = null, truncated = false;
  if (row.kind === 'set_user_leverage') {
    const levels = await tradeCommand(creds, 'get_user_leverage', { limit: 1000, offset: 0 });
    state = levels.find(level => level.symbol === params.symbol && Number(level.leverage) === params.leverage);
    confirmed = !!state;
  } else if (row.kind === 'cancel_order') {
    const history = await scanPages(page => request('/user/historic-orders', creds, { ...page, symbol: params.symbol }), 1000);
    truncated = history.hasMore;
    state = history.rows.find(order => order.order_id === params.order_id && order.symbol === params.symbol);
    confirmed = state?.terminal_status === 'CANCELLED';
  }
  if (!confirmed) return { ...response, truncated };
  const result = { success: true, action_id: row.action_id, account_id: creds.accountId,
    status: 'state_confirmed', reconciled: true, builder_attributed: false, observed_state: state,
    order_id: row.kind === 'cancel_order' ? params.order_id : null };
  finishAction(row, 'reconciled', result);
  return { ...response, status: 'reconciled', result };
}

async function reconcileOrder(creds, row) {
  const params = JSON.parse(row.params_json || '{}');
  const [history, open] = await Promise.all([
    request('/user/historic-orders', creds, { symbol: params.symbol, client_order_id: row.client_order_id, limit: 2 }),
    tradeCommand(creds, 'get_user_orders', { symbol: params.symbol, limit: 1000, offset: 0 })]);
  const matches = new Map([...(history.data || []), ...(open.orders || [])]
    .filter(o => o.client_order_id === row.client_order_id).map(o => [o.order_id, o]));
  const response = { action_id: row.action_id, account_id: creds.accountId, status: 'unknown', can_resubmit: false };
  if (number(history.count) > 1 || matches.size > 1) return { ...response, status: 'manual_review', reason: 'Multiple orders share this client ID' };
  if (matches.size !== 1) return response;
  const order = [...matches.values()][0];
  const exact = order.symbol === params.symbol && order.side === params.side && order.type === params.order_type
    && new BigNumber(order.quantity).eq(params.quantity)
    && (params.order_type === 'MARKET' || new BigNumber(order.price).eq(params.price));
  if (!exact || !UUID.test(order.order_id)) return { ...response, status: 'manual_review', reason: 'Order parameters do not match the intent' };
  const result = { success: true, order_id: order.order_id, status: order.terminal_status || order.status,
    action_id: row.action_id, account_id: creds.accountId, reconciled: true, builder_attributed: false };
  finishAction(row, 'reconciled', result);
  return { ...response, status: 'reconciled', result };
}

/** Submit a precision-checked, durably deduplicated order; amount is base quantity. */
async function placeOrder(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const params = await orderParams(input, input.actionId || input.idempotencyKey);
  if (input.leverage != null) {
    const current = await tradeCommand(creds, 'get_user_leverage', { limit: 1000, offset: 0 });
    const setting = current.find(row => row.symbol === params.symbol);
    if (!setting || number(setting.leverage) !== Number(input.leverage)) {
      throw failure('Set the requested QFEX leverage before submitting the order', 409, 'QFEX_LEVERAGE_MISMATCH');
    }
  }
  return executeAction(creds, input, options, 'add_order', params);
}

/** Cancel exactly one exchange order, never all client-ID matches. */
async function cancelOrder(credsInput, input = {}, options = {}) {
  const orderId = String(input.orderId || input.order_id || '');
  if (!UUID.test(orderId)) throw failure('QFEX exchange order UUID is required');
  return executeAction(await resolveAccount(credsInput), input, options, 'cancel_order', {
    symbol: symbolOf(input.symbol), order_id: orderId, cancel_order_id_type: 'order_id' });
}

/** Close with an opposite reduce-only market order correlated by a unique client ID. */
async function closePosition(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const symbol = symbolOf(input.symbol || input.positionId);
  const raw = await readPositions(creds);
  const position = (raw.positions || []).find(p => p.symbol === symbol && number(p.position) !== 0);
  if (!position) throw failure('No QFEX position exists for this symbol', 409);
  const quantity = input.quantity ?? input.amount ?? Math.abs(number(position.position));
  if (new BigNumber(quantity).gt(Math.abs(number(position.position)))) throw failure('Close quantity exceeds the open position');
  const params = await orderParams({ symbol, quantity, side: number(position.position) > 0 ? 'SELL' : 'BUY',
    orderType: 'MARKET', reduceOnly: true }, input.actionId || input.idempotencyKey);
  return executeAction(creds, input, options, 'add_order', params);
}

/** Change leverage using the exchange's allowed levels; open exposure is rejected. */
async function setLeverage(credsInput, input = {}, options = {}) {
  const creds = await resolveAccount(credsInput);
  const symbol = symbolOf(input.symbol);
  const leverage = Number(input.leverage);
  const levels = await tradeCommand(creds, 'get_available_leverage_levels', { limit: 1000, offset: 0 });
  if (!Number.isFinite(leverage) || !levels.some(l => l.symbol === symbol && Number(l.leverage) === leverage)) {
    throw failure('The requested QFEX leverage is not available');
  }
  return executeAction(creds, input, options, 'set_user_leverage', { symbol, leverage });
}

/** Read verified fills; each exchange fill ID remains distinct. */
async function getTradeHistory(credsInput, options = {}) {
  const creds = await resolveAccount(credsInput);
  if (options.playerId) claimAccount(options.playerId, creds.accountId);
  return (await readHistory(creds, options)).trades;
}

async function scanPages(readPage, maximum, offset = 0) {
  const rows = [];
  let hasMore = false;
  while (rows.length < maximum) {
    const limit = Math.min(100, maximum - rows.length);
    const page = await readPage({ limit, offset });
    if (page?.data === null && page.count != null && Number(page.count) === 0) page.data = [];
    if (!Array.isArray(page.data)) throw failure('Invalid QFEX history page', 502);
    rows.push(...page.data.slice(0, limit));
    offset += page.data.length;
    const knownCount = Number.isFinite(Number(page.count)) && page.count != null;
    hasMore = knownCount ? Number(page.count) > offset : page.data.length >= limit;
    if (!page.data.length || !hasMore) break;
  }
  return { rows, hasMore };
}

/** One REST fill page; an account QFEX has no balance record for has no fills yet. */
function readFills(creds, query) {
  return request('/user/trade', creds, query).catch(error => {
    if (error?.code === 'QFEX_NO_BALANCE') return { data: [], count: 0 };
    throw error;
  });
}

/**
 * Fills come from REST GET /user/trade only, as in pilotbot. The Trade-WS get_user_trades
 * feed returned no rows in production, so requiring it left every fill unmatched, and its
 * extra socket per page caused the import timeouts.
 */
async function readHistory(creds, options = {}, scan = false) {
  const maximum = Math.max(1, Math.min(1000, Math.floor(Number(options.limit) || (scan ? 1000 : 100))));
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const raw = await scanPages(page => readFills(creds, { ...page, start: options.start, end: options.end, symbol: options.symbol }), maximum, offset);
  return { trades: raw.rows.map(normalizeTrade), scanned_rest: raw.rows.length, has_more: raw.hasMore, truncated: raw.hasMore };
}

function normalizeTrade(t) {
  const timestamp = number(t.order_timestamp);
  return { id: t.id, order_id: t.order_id, symbol: t.symbol,
    side: t.side === 'BUY' ? 'open_long' : 'open_short', amount: String(t.quantity), price: String(t.price),
    notional_usd: new BigNumber(t.quantity).abs().times(t.price).toNumber(), pnl: t.realised_pnl_change,
    fee: t.fee, created_at: timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null,
    timestamp_kind: 'order', _raw: t };
}

/** Import only server-origin builder-attributed fills into the reward ledger. */
async function importTradesForPlayer(playerId, credsInput, options = {}) {
  const creds = await resolveAccount(credsInput);
  claimAccount(playerId, creds.accountId);
  const maximum = Math.max(1, Math.min(1000, Math.floor(Number(options.limit) || 1000)));
  const result = await require('./qfex-history-sync').syncHistory({ db: database(), accountId: creds.accountId, maximum,
    readRest: page => readFills(creds, page),
    consume: entries => importVerifiedHistory(playerId, creds, entries.map(t => normalizeTrade(t.raw)), options) });
  return { ok: true, account_id: creds.accountId, ...result,
    builder_configured: !!builderCode(), reward_eligible: !!builderCode() };
}

function importVerifiedHistory(playerId, creds, trades, options) {
  const ledger = options.ledger || require('./db');
  let imported = 0, updated = 0, skipped = 0;
  const rejectedIds = [];
  const seen = new Set();
  for (const trade of trades) {
    if (!trade.id || seen.has(trade.id)) continue;
    seen.add(trade.id);
    const proof = database().prepare(`SELECT * FROM qfex_action_intents
      WHERE account_id=? AND player_id=? AND order_id=? AND kind='add_order' AND status='accepted'`)
      .get(creds.accountId, String(playerId), trade.order_id);
    // Proof = our own accepted add_order intent (sent on a builder-coded connection, its order_id
    // taken from QFEX's own order_response) + QFEX's REST fill of exactly that order.
    if (!proof?.builder_code || !UUID.test(proof.builder_code)) { skipped++; rejectedIds.push(trade.id); continue; }
    if (!(trade.notional_usd > 0) || !Number.isFinite(trade.notional_usd)) { skipped++; rejectedIds.push(trade.id); continue; }
    const params = JSON.parse(proof.params_json || '{}');
    if (params.symbol !== trade.symbol || params.side !== trade._raw.side) { skipped++; rejectedIds.push(trade.id); continue; }
    // A single fill can never exceed the order it belongs to.
    if (!(Number(params.quantity) > 0) || new BigNumber(trade.amount).abs().gt(params.quantity)) { skipped++; rejectedIds.push(trade.id); continue; }
    const side = params.reduce_only ? (params.side === 'SELL' ? 'close_long' : 'close_short') : trade.side;
    const result = ledger.upsertVerifiedTrade(playerId, { symbol: trade.symbol, side,
      amount: trade.amount, price: trade.price, orderId: trade.order_id,
      clientOrderId: `qfex:${creds.accountId}:fill:${trade.id}`, dex: 'qfex', status: 'filled',
      orderType: String(trade._raw.order_type).toLowerCase(), notional_usd: trade.notional_usd,
      verifiedSource: 'qfex_builder_api', pnl: trade.pnl, fee: trade.fee, createdAt: trade.created_at,
      proofJson: JSON.stringify({ account_id: creds.accountId, builder_code: proof.builder_code,
        action_id: proof.action_id, order_id: proof.order_id, params, fill: trade._raw }) });
    imported += Number(result.inserted || 0); updated += Number(result.updated || 0);
  }
  return { imported, updated, skipped, total: seen.size, rejected_ids: rejectedIds };
}

/** Inject deterministic transports and an isolated SQLite database for adapter tests. */
function setTestDependencies(options = {}) {
  fetchImpl = options.fetch || ((...args) => fetch(...args));
  socketFactory = options.socketFactory || (url => new WebSocket(url, { maxPayload: 4 * 1024 * 1024 }));
  databaseOverride = options.database || null;
  timeoutMs = options.timeoutMs || 12000; marketCache = null; snapshotCache.clear(); socketCounts.clear(); accountCache.clear();
}

module.exports = { getWalletMessage, registerWalletKey, credentials, sign, configStatus, request, normalizeMarket, getMarkets, getPrices,
  getOrderbook, getCandles, resolveAccount, getAccountSnapshot, getTradeHistory, placeOrder,
  cancelOrder, closePosition, setLeverage, importTradesForPlayer, setTestDependencies, exactNumber, ensureSchema, getActionStatus };
