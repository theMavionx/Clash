const crypto = require('crypto');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { createReconnectingJsonWebSocket } = require('./reconnecting-json-websocket');

const HIBACHI_API = String(process.env.HIBACHI_API_URL || 'https://api.hibachi.xyz').replace(/\/+$/u, '');
const HIBACHI_DATA_API = String(process.env.HIBACHI_DATA_API_URL || 'https://data-api.hibachi.xyz').replace(/\/+$/u, '');
const HIBACHI_FILL_LOOKBACK_LIMIT = Math.max(10, Math.min(250, Number(process.env.HIBACHI_FILL_LOOKBACK_LIMIT || 100)));
const HIBACHI_MAX_FEES_PERCENT = String(process.env.HIBACHI_MAX_FEES_PERCENT || '0.001');
const HIBACHI_REWARD_MIN_NOTIONAL_USD = Math.max(0, Number(process.env.HIBACHI_REWARD_MIN_NOTIONAL_USD || 10));
const HIBACHI_IP_BLOCKED_MESSAGE = 'Hibachi is not available from your IP address. Try a supported network or IP region.';
const HIBACHI_VISIBLE_MARKET_CATEGORIES = new Set(['crypto']);
const HIBACHI_PRIVATE_READ_CACHE_MS = Math.max(250, Math.min(5_000, Number(process.env.HIBACHI_PRIVATE_READ_CACHE_MS || 2_500)));
const HIBACHI_PRIVATE_READ_STALE_MS = Math.max(1_000, Math.min(60_000, Number(process.env.HIBACHI_PRIVATE_READ_STALE_MS || 30_000)));
const HIBACHI_PRIVATE_READ_MAX_ENTRIES = 500;
const HIBACHI_WS_ENABLED = String(process.env.HIBACHI_WS_ENABLED || 'true').toLowerCase() !== 'false';
const HIBACHI_WS_CONNECT_TIMEOUT_MS = Math.max(1_000, Math.min(10_000, Number(process.env.HIBACHI_WS_CONNECT_TIMEOUT_MS || 4_000)));
const HIBACHI_WS_SNAPSHOT_WAIT_MS = Math.max(250, Math.min(5_000, Number(process.env.HIBACHI_WS_SNAPSHOT_WAIT_MS || 2_000)));
const HIBACHI_WS_SNAPSHOT_MAX_AGE_MS = Math.max(1_000, Math.min(120_000, Number(process.env.HIBACHI_WS_SNAPSHOT_MAX_AGE_MS || 45_000)));
const HIBACHI_WS_IDLE_CLOSE_MS = Math.max(15_000, Math.min(10 * 60_000, Number(process.env.HIBACHI_WS_IDLE_CLOSE_MS || 120_000)));

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function symbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-P$/u, '')
    .replace(/-PERP$/u, '')
    .replace(/\/USDT-P$/u, '')
    .replace(/\/USD[TC]?$/u, '');
}

function normalizeHibachiCategory(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const upper = text.replace(/[\s_-]+/gu, '').toUpperCase();
  if (upper.includes('CRYPTO')) return 'crypto';
  if (upper === 'FX' || upper.includes('FOREX') || upper.startsWith('FX')) return 'fx';
  if (upper.includes('EQUITY') || upper.includes('STOCK')) return 'equity';
  if (upper.includes('COMMOD')) return 'commodity';
  if (upper.includes('INDEX') || upper.includes('INDICES')) return 'index';
  if (upper.includes('ALL') || upper.includes('MULTI') || upper.includes('ANY')) return 'all';
  return upper.toLowerCase();
}

function hibachiDisplayCategory(value) {
  const normalized = normalizeHibachiCategory(value);
  if (!normalized) return '';
  if (normalized === 'fx') return 'Fx';
  if (normalized === 'all') return 'All';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function hibachiContractCategory(contract = {}, info = {}) {
  return normalizeHibachiCategory(
    contract.category
      ?? contract.contractCategory
      ?? contract.contract_category
      ?? contract.assetClass
      ?? contract.asset_class
      ?? info.category
      ?? info.assetClass
      ?? info.asset_class,
  );
}

function hibachiAccountCategory(account = {}) {
  return normalizeHibachiCategory(
    account.accountCategory
      ?? account.account_category
      ?? account.category
      ?? account.accountType
      ?? account.account_type
      ?? account.type
      ?? account.productCategory
      ?? account.product_category
      ?? account.tradingCategory
      ?? account.trading_category
      ?? account.account?.category
      ?? account.account?.accountType
      ?? account.account?.account_type,
  );
}

function hibachiCanTradeCategory(accountCategory, contractCategory) {
  if (!accountCategory || !contractCategory) return true;
  if (accountCategory === 'all' || contractCategory === 'all') return true;
  return accountCategory === contractCategory;
}

function hibachiIsVisibleMarketCategory(category) {
  return HIBACHI_VISIBLE_MARKET_CATEGORIES.has(normalizeHibachiCategory(category));
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.markets)) return payload.markets;
  if (Array.isArray(payload?.futureContracts)) return payload.futureContracts;
  if (Array.isArray(payload?.trades)) return payload.trades;
  if (Array.isArray(payload?.orders)) return payload.orders;
  return [];
}

const privateReadCache = new Map();

function privateReadCacheKey(path, creds = {}) {
  const identity = crypto
    .createHash('sha256')
    .update(`${creds.accountId || ''}:${creds.apiKey || ''}`)
    .digest('hex')
    .slice(0, 24);
  return `${identity}:${path}`;
}

function isRetryableReadError(error) {
  const status = Number(error?.status);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return /rate limited|timeout|timed out|aborted|econn|socket|fetch failed/i.test(String(error?.message || ''));
}

function prunePrivateReadCache(now = Date.now()) {
  if (privateReadCache.size <= HIBACHI_PRIVATE_READ_MAX_ENTRIES) return;
  for (const [key, entry] of privateReadCache) {
    if (privateReadCache.size <= HIBACHI_PRIVATE_READ_MAX_ENTRIES) break;
    if (!entry?.promise && (!entry?.at || now - entry.at > HIBACHI_PRIVATE_READ_STALE_MS)) {
      privateReadCache.delete(key);
    }
  }
  for (const [key, entry] of privateReadCache) {
    if (privateReadCache.size <= HIBACHI_PRIVATE_READ_MAX_ENTRIES) break;
    if (!entry?.promise) privateReadCache.delete(key);
  }
}

const accountStreams = new Map();
const tradeStreams = new Map();

function hibachiWsUrl(path, creds) {
  const base = HIBACHI_API.replace(/^http:/iu, 'ws:').replace(/^https:/iu, 'wss:');
  const params = new URLSearchParams({
    accountId: String(creds.accountId),
    hibachiClient: 'ClashOfPerps/1.0',
  });
  return `${base}${path}?${params.toString()}`;
}

function wait(ms, value = null) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

function accountStreamKey(creds) {
  return privateReadCacheKey('__ws_account__', creds);
}

function tradeStreamKey(creds) {
  return privateReadCacheKey('__ws_trade__', creds);
}

function fullAccountSnapshot(payload) {
  return payload?.result?.accountSnapshot
    || payload?.accountSnapshot
    || payload?.account_snapshot
    || payload?.data?.accountSnapshot
    || payload?.data?.account_snapshot
    || null;
}

function normalizeWsAccountSnapshot(snapshot = {}) {
  const positions = rows(snapshot.positions || snapshot.position || snapshot.account_positions);
  return {
    ...snapshot,
    accountId: snapshot.accountId ?? snapshot.account_id,
    account_id: snapshot.account_id ?? snapshot.accountId,
    balance: snapshot.balance ?? snapshot.accountBalance ?? snapshot.account_balance ?? 0,
    maximalWithdraw: snapshot.maximalWithdraw ?? snapshot.maximal_withdraw ?? snapshot.balance ?? 0,
    positions,
  };
}

function positionKey(position = {}) {
  const symbol = symbolOf(position.symbol || position.market || position.marketSymbol);
  const direction = String(position.direction || position.side || '').toUpperCase();
  const side = direction.includes('SHORT') || direction === 'ASK' || direction === 'SELL' ? 'short' : 'long';
  return `${symbol}:${side}`;
}

function mergePositionUpdate(positions, update) {
  const next = Array.isArray(positions) ? positions.slice() : [];
  const key = positionKey(update);
  const quantity = Math.abs(num(update?.quantity ?? update?.amount ?? update?.size));
  const index = next.findIndex(item => positionKey(item) === key);
  if (quantity <= 0) {
    if (index >= 0) next.splice(index, 1);
    return next;
  }
  if (index >= 0) next[index] = { ...next[index], ...update };
  else next.push(update);
  return next;
}

function applyAccountStreamMessage(snapshot, message) {
  const full = fullAccountSnapshot(message);
  if (full) return normalizeWsAccountSnapshot(full);

  const next = snapshot ? { ...snapshot, positions: rows(snapshot.positions).slice() } : null;
  if (!next) return null;

  const topic = String(message?.topic || message?.event || message?.type || '').toLowerCase();
  const data = message?.data || message?.result || message?.params || message;
  if (/balance/.test(topic) || data?.balance != null || data?.accountBalance != null || data?.account_balance != null) {
    next.balance = data.balance ?? data.accountBalance ?? data.account_balance ?? next.balance;
    next.maximalWithdraw = data.maximalWithdraw ?? data.maximal_withdraw ?? next.maximalWithdraw ?? next.balance;
  }
  if (/position/.test(topic) || data?.position || data?.positions || data?.symbol) {
    const updates = rows(data?.positions || data?.position || data);
    if (updates.length > 0) {
      for (const update of updates) next.positions = mergePositionUpdate(next.positions, update);
    }
  }
  return next;
}

function logHibachiWs(kind, creds, details = {}) {
  const account = creds?.accountId || details.accountId || '?';
  const message = details.message || details.status || '';
  const suffix = message ? `: ${message}` : '';
  const meta = Object.entries(details)
    .filter(([key]) => !['message', 'apiKey'].includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  const line = `[hibachi-ws] ${kind} account=${account}${suffix}${meta ? ` ${meta}` : ''}`;
  if (/error|failed|fallback|stale|timeout|closed/i.test(kind)) console.warn(line);
  else console.log(line);
}

class HibachiAccountStream {
  constructor(creds) {
    this.creds = { accountId: creds.accountId, apiKey: creds.apiKey };
    this.messageId = 0;
    this.listenKey = null;
    this.snapshot = null;
    this.snapshotAt = 0;
    this.idleTimer = null;
    this.lastTouch = Date.now();
    this.lastError = null;
    this.waiters = [];
    this.client = createReconnectingJsonWebSocket({
      name: 'hibachi-account',
      getUrl: () => hibachiWsUrl('/ws/account', this.creds),
      headers: () => ({ Authorization: this.creds.apiKey }),
      reconnectMinMs: 1000,
      reconnectMaxMs: 60_000,
      handshakeTimeoutMs: HIBACHI_WS_CONNECT_TIMEOUT_MS,
      pingIntervalMs: 15_000,
      pongTimeoutMs: HIBACHI_WS_CONNECT_TIMEOUT_MS,
      pingMessage: () => {
        if (!this.listenKey) return null;
        return {
          id: this.nextMessageId(),
          method: 'stream.ping',
          params: { accountId: this.creds.accountId, listenKey: this.listenKey },
          timestamp: Math.floor(Date.now() / 1000),
        };
      },
      isPong: msg => msg?.status === 200 && !msg?.result,
      onOpen: (_event, api) => {
        this.listenKey = null;
        api.sendJson({
          id: this.nextMessageId(),
          method: 'stream.start',
          params: { accountId: this.creds.accountId },
          timestamp: Math.floor(Date.now() / 1000),
        });
      },
      onMessage: msg => this.handleMessage(msg),
      onClose: event => {
        this.lastError = new Error(`Hibachi account WS closed ${event?.code || ''} ${event?.reason || ''}`.trim());
      },
      onError: event => {
        this.lastError = event instanceof Error ? event : new Error(event?.message || 'Hibachi account WS error');
      },
      onStatus: status => {
        if (['open', 'reconnecting', 'stale', 'error'].includes(status.status)) {
          logHibachiWs(`account_${status.status}`, this.creds, status);
        }
      },
    });
  }

  freshSnapshot(maxAgeMs = HIBACHI_WS_SNAPSHOT_MAX_AGE_MS) {
    if (!this.snapshot || !this.snapshotAt) return null;
    return Date.now() - this.snapshotAt <= maxAgeMs ? this.snapshot : null;
  }

  markStale() {
    this.snapshotAt = 0;
  }

  touch() {
    this.lastTouch = Date.now();
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (Date.now() - this.lastTouch >= HIBACHI_WS_IDLE_CLOSE_MS) this.close();
    }, HIBACHI_WS_IDLE_CLOSE_MS + 500);
    if (this.idleTimer.unref) this.idleTimer.unref();
  }

  nextMessageId() {
    this.messageId += 1;
    return this.messageId;
  }

  async ensureStarted() {
    this.touch();
    const fresh = this.freshSnapshot();
    if (fresh) return fresh;
    if (!HIBACHI_WS_ENABLED) return null;
    this.client.connect();
    await this.waitForSnapshot(HIBACHI_WS_SNAPSHOT_WAIT_MS);
    const latest = this.freshSnapshot();
    if (!latest && !this.snapshot) this.client.close();
    return latest;
  }

  waitForSnapshot(timeoutMs) {
    const fresh = this.freshSnapshot();
    if (fresh) return Promise.resolve(fresh);
    return new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const index = this.waiters.indexOf(finish);
        if (index >= 0) this.waiters.splice(index, 1);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      this.waiters.push(finish);
    });
  }

  handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    const full = fullAccountSnapshot(message);
    if (full) {
      this.listenKey = message?.result?.listenKey || message?.listenKey || this.listenKey;
      this.snapshot = normalizeWsAccountSnapshot(full);
      this.snapshotAt = Date.now();
      this.resolveWaiters(this.snapshot);
      return;
    }
    const next = applyAccountStreamMessage(this.snapshot, message);
    if (next) {
      this.snapshot = normalizeWsAccountSnapshot(next);
      this.snapshotAt = Date.now();
      this.resolveWaiters(this.snapshot);
    }
  }

  resolveWaiters(value) {
    const waiters = this.waiters.splice(0);
    for (const resolve of waiters) {
      try { resolve(value); } catch {}
    }
  }

  close(clearSnapshot = true) {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.client.close();
    this.listenKey = null;
    this.resolveWaiters(null);
    if (clearSnapshot) {
      this.snapshot = null;
      this.snapshotAt = 0;
    }
  }
}

function accountStream(creds) {
  const key = accountStreamKey(creds);
  let stream = accountStreams.get(key);
  if (!stream) {
    stream = new HibachiAccountStream(creds);
    accountStreams.set(key, stream);
  }
  return stream;
}

class HibachiTradeStream {
  constructor(creds) {
    this.creds = { accountId: creds.accountId, apiKey: creds.apiKey };
    this.messageId = Math.floor(Math.random() * 1_000_000);
    this.pending = new Map();
    this.idleTimer = null;
    this.lastTouch = Date.now();
    this.client = createReconnectingJsonWebSocket({
      name: 'hibachi-trade',
      getUrl: () => hibachiWsUrl('/ws/trade', this.creds),
      headers: () => ({ Authorization: this.creds.apiKey }),
      reconnectMinMs: 1000,
      reconnectMaxMs: 60_000,
      handshakeTimeoutMs: HIBACHI_WS_CONNECT_TIMEOUT_MS,
      pingIntervalMs: 0,
      onMessage: msg => this.handleMessage(msg),
      onClose: event => this.handleClose(new Error(`Hibachi trade WS closed ${event?.code || ''} ${event?.reason || ''}`.trim())),
      onError: event => this.handleClose(event instanceof Error ? event : new Error(event?.message || 'Hibachi trade WS error')),
      onStatus: status => {
        if (['open', 'reconnecting', 'stale', 'error'].includes(status.status)) {
          logHibachiWs(`trade_${status.status}`, this.creds, status);
        }
      },
    });
  }

  touch() {
    this.lastTouch = Date.now();
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (Date.now() - this.lastTouch >= HIBACHI_WS_IDLE_CLOSE_MS) this.close();
    }, HIBACHI_WS_IDLE_CLOSE_MS + 500);
    if (this.idleTimer.unref) this.idleTimer.unref();
  }

  nextMessageId() {
    this.messageId += 1;
    return this.messageId;
  }

  async ensureOpen() {
    this.touch();
    if (this.client.readyState() === 1) return true;
    if (!HIBACHI_WS_ENABLED) throw new Error('Hibachi WS disabled');
    this.client.connect();
    const deadline = Date.now() + HIBACHI_WS_CONNECT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.client.readyState() === 1) return true;
      await wait(50);
    }
    this.client.close();
    throw new Error('Hibachi trade WS connect timed out');
  }

  handleMessage(message) {
    if (!message?.id) return;
    const pending = this.pending.get(Number(message.id));
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(Number(message.id));
    if (message.error) {
      const err = new Error(message.error?.message || message.error || 'Hibachi trade WS error');
      err.status = message.status || null;
      pending.reject(err);
      return;
    }
    pending.resolve(message);
  }

  handleClose(error = null) {
    const pending = Array.from(this.pending.values());
    this.pending.clear();
    for (const item of pending) {
      clearTimeout(item.timeout);
      item.reject(error || new Error('Hibachi trade WS closed'));
    }
    this.ws = null;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  async rpc(method, params = {}) {
    await this.ensureOpen();
    const id = this.nextMessageId();
    const payload = { id, method, params: { accountId: this.creds.accountId, ...params } };
    let pendingTimeout = null;
    const response = new Promise((resolve, reject) => {
      pendingTimeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Hibachi trade WS ${method} timed out`));
      }, HIBACHI_WS_CONNECT_TIMEOUT_MS);
      if (pendingTimeout.unref) pendingTimeout.unref();
      this.pending.set(id, { resolve, reject, timeout: pendingTimeout });
    });
    if (!this.client.sendJson(payload)) {
      this.pending.delete(id);
      clearTimeout(pendingTimeout);
      throw new Error('Hibachi trade WS is not open');
    }
    return response;
  }

  close() {
    this.handleClose();
    this.client.close();
  }
}

function tradeStream(creds) {
  const key = tradeStreamKey(creds);
  let stream = tradeStreams.get(key);
  if (!stream) {
    stream = new HibachiTradeStream(creds);
    tradeStreams.set(key, stream);
  }
  return stream;
}

async function request(base, method, path, { apiKey, body } = {}) {
  const headers = {
    accept: 'application/json',
    'Hibachi-Client': 'ClashOfPerps/1.0',
  };
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (apiKey) headers.Authorization = apiKey;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(`${base}${path}`, { method, headers, body: payload, signal: ctrl.signal });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const contentType = String(r.headers.get('content-type') || '');
      const looksLikeEdgeBlock = r.status === 403
        && (contentType.includes('text/html') || /cloudflare|access denied|forbidden/i.test(text || ''));
      if (looksLikeEdgeBlock) {
        const err = new Error(HIBACHI_IP_BLOCKED_MESSAGE);
        err.code = 'HIBACHI_IP_BLOCKED';
        err.status = 403;
        err.path = path;
        throw err;
      }
      const detail = typeof data === 'string' ? data : (data?.message || data?.error || text);
      const err = new Error(`Hibachi ${path} ${r.status}: ${detail || 'request failed'}`);
      err.status = r.status;
      err.path = path;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function isIpBlockedError(error) {
  return error?.code === 'HIBACHI_IP_BLOCKED';
}

function credentials(input = {}) {
  const apiKey = String(input.apiKey || input.api_key || '').trim();
  const accountId = Number(input.accountId || input.account_id);
  const privateKey = String(input.privateKey || input.private_key || '').trim();
  if (!apiKey) throw new Error('Hibachi API key required');
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error('Hibachi account id required');
  if (!privateKey) throw new Error('Hibachi private key required');
  return { apiKey, accountId, privateKey };
}

function signPayload(privateKey, payload) {
  const key = String(privateKey || '').trim();
  const compactKey = key.replace(/\s+/gu, '');
  const hex = compactKey.replace(/^0x/iu, '');
  const looksLikeHexSigner = /^0x/iu.test(compactKey) || /^[0-9a-fA-F]{64}$/.test(hex);
  if (!looksLikeHexSigner) {
    return crypto.createHmac('sha256', key).update(payload).digest('hex');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('Hibachi API private key must be a 32-byte secp256k1 hex key or a Hibachi HMAC key');
  }
  const hash = crypto.createHash('sha256').update(payload).digest();
  const sig = secp256k1.sign(hash, hex, { lowS: true });
  const recoveryId = Number(sig.recovery);
  if (!Number.isInteger(recoveryId) || recoveryId < 0 || recoveryId > 3) {
    throw new Error('Hibachi signer did not produce a valid secp256k1 recovery id');
  }
  const compact = Buffer.from(sig.toCompactRawBytes());
  const signature = Buffer.concat([compact, Buffer.from([recoveryId])]);
  if (signature.length !== 65) {
    throw new Error(`Hibachi signer produced ${signature.length}-byte signature, expected 65 bytes`);
  }
  return signature.toString('hex');
}

function decimalText(value, fallback = '0') {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return String(value).includes('e')
    ? n.toFixed(18).replace(/0+$/u, '').replace(/\.$/u, '')
    : String(value);
}

function toFixedInt(value, decimals) {
  const [whole, frac = ''] = decimalText(value).split('.');
  const padded = `${frac}${'0'.repeat(decimals)}`.slice(0, decimals);
  return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(padded || '0');
}

function decimalPlaces(value) {
  const text = decimalText(value);
  if (!text.includes('.')) return 0;
  return text.split('.')[1].replace(/0+$/u, '').length;
}

function checkTickSize(price, tickSize) {
  if (tickSize == null || tickSize === '') return;
  const allowed = decimalPlaces(tickSize);
  const actual = decimalPlaces(price);
  if (actual > allowed) {
    throw new Error(`Invalid Hibachi price precision: ${price} exceeds tick size ${tickSize}`);
  }
}

function normalizeTriggerDirection(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'HIGH' || text === 'LOW') return text;
  return null;
}

function normalizeOrderFlags(args = {}) {
  const raw = String(args.orderFlags || args.order_flags || '').trim().toUpperCase();
  if (args.reduceOnly || raw === 'REDUCE_ONLY' || raw === 'REDUCEONLY') return 'REDUCE_ONLY';
  if (raw === 'POST_ONLY' || raw === 'IOC') return raw;
  return null;
}

function positionMargin(position = {}) {
  const directMargin = num(
    position.margin
      ?? position.positionMargin
      ?? position.initialMargin
      ?? position.openMargin
      ?? position.collateral
      ?? position.usedMargin
      ?? position.marginUsed,
  );
  if (directMargin > 0) return directMargin;
  const notional = num(position.notionalValue ?? position.notional ?? position.positionNotional);
  const leverage = num(position.leverage ?? position.positionLeverage ?? position.initialLeverage);
  return notional > 0 && leverage > 0 ? notional / leverage : 0;
}

function accountMarginUsed(account = {}) {
  const directMargin = num(
    account.totalMarginUsed
      ?? account.total_margin_used
      ?? account.totalInitialMargin
      ?? account.total_initial_margin
      ?? account.initialMargin
      ?? account.initial_margin
      ?? account.positionMargin
      ?? account.position_margin
      ?? account.marginUsed
      ?? account.margin_used,
  );
  if (directMargin > 0) return directMargin;

  const equity = num(account.balance ?? account.accountEquity ?? account.equity);
  const rawWithdrawable = account.maximalWithdraw ?? account.availableToWithdraw;
  const hasWithdrawable = rawWithdrawable !== undefined && rawWithdrawable !== null && rawWithdrawable !== '';
  const withdrawable = num(rawWithdrawable);
  if (hasWithdrawable && equity > 0 && withdrawable >= 0 && equity >= withdrawable) {
    return equity - withdrawable;
  }

  const positions = rows(account.positions);
  const positionSum = positions.reduce((sum, p) => sum + positionMargin(p), 0);
  return positionSum > 0 ? positionSum : 0;
}

function priceBytes(price, contract) {
  const settlementDecimals = Number(contract?.settlementDecimals ?? contract?.settlement_decimals ?? 6);
  const underlyingDecimals = Number(contract?.underlyingDecimals ?? contract?.underlying_decimals ?? 8);
  const scaled = BigInt(Math.floor(num(price) * (2 ** 32) * (10 ** (settlementDecimals - underlyingDecimals))));
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(scaled >= 0n ? scaled : 0n);
  return buf;
}

function orderSignaturePayload({ nonce, contract, quantity, side, price, maxFeesPercent }) {
  const contractId = Number(contract?.id ?? contract?.contractId);
  const quantityDecimals = Number(contract?.underlyingDecimals ?? contract?.underlying_decimals ?? 8);
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64BE(BigInt(nonce));
  const contractBuf = Buffer.alloc(4);
  contractBuf.writeUInt32BE(contractId);
  const qtyBuf = Buffer.alloc(8);
  qtyBuf.writeBigUInt64BE(toFixedInt(quantity, quantityDecimals));
  const sideBuf = Buffer.alloc(4);
  sideBuf.writeUInt32BE(String(side).toUpperCase() === 'ASK' ? 0 : 1);
  const feeBuf = Buffer.alloc(8);
  feeBuf.writeBigUInt64BE(toFixedInt(maxFeesPercent, 8));
  return price == null
    ? Buffer.concat([nonceBuf, contractBuf, qtyBuf, sideBuf, feeBuf])
    : Buffer.concat([nonceBuf, contractBuf, qtyBuf, sideBuf, priceBytes(price, contract), feeBuf]);
}

let inventoryCache = { at: 0, payload: null };
let exchangeInfoCache = { at: 0, payload: null };
const marketDataCache = new Map();

async function getInventory() {
  if (inventoryCache.payload && Date.now() - inventoryCache.at < 20_000) return inventoryCache.payload;
  const payload = await request(HIBACHI_DATA_API, 'GET', '/market/inventory');
  inventoryCache = { at: Date.now(), payload };
  return payload;
}

async function getExchangeInfo() {
  if (exchangeInfoCache.payload && Date.now() - exchangeInfoCache.at < 20_000) return exchangeInfoCache.payload;
  const payload = await request(HIBACHI_DATA_API, 'GET', '/market/exchange-info');
  exchangeInfoCache = { at: Date.now(), payload };
  return payload;
}

async function getMarketData(symbol) {
  const key = String(symbol || '').trim();
  if (!key) return { price: {}, stats: {} };
  const cached = marketDataCache.get(key);
  if (cached && Date.now() - cached.at < 20_000) return cached.payload;
  const [price, stats] = await Promise.all([
    request(HIBACHI_DATA_API, 'GET', `/market/data/prices?symbol=${encodeURIComponent(key)}`).catch(() => ({})),
    request(HIBACHI_DATA_API, 'GET', `/market/data/stats?symbol=${encodeURIComponent(key)}`).catch(() => ({})),
  ]);
  const payload = { price: price || {}, stats: stats || {} };
  marketDataCache.set(key, { at: Date.now(), payload });
  return payload;
}

async function contractMap() {
  let list = [];
  try {
    const inv = await getInventory();
    list = rows(inv?.markets).map(m => m.contract || m).filter(Boolean);
  } catch {}
  if (!list.length) {
    const exchange = await getExchangeInfo();
    list = rows(exchange?.futureContracts).filter(Boolean);
  }
  return new Map(list.map(c => [String(c.symbol || '').toUpperCase(), c]));
}

async function getMarketInfo() {
  let markets = [];
  try {
    const inv = await getInventory();
    markets = rows(inv?.markets);
  } catch {}
  if (!markets.length) {
    const exchange = await getExchangeInfo();
    markets = rows(exchange?.futureContracts).map(contract => ({ contract, info: {} }));
  }
  const enriched = await Promise.all(markets.map(async (m) => {
    const c = m.contract || m;
    const info = m.info || {};
    const marketData = await getMarketData(c.symbol || info.symbol);
    const priceInfo = marketData.price || {};
    const statsInfo = marketData.stats || {};
    const symbol = symbolOf(c.symbol || info.symbol || priceInfo.symbol);
    const mark = num(info.markPrice || info.priceLatest || priceInfo.markPrice || priceInfo.tradePrice || priceInfo.spotPrice || c.markPrice);
    const initialMarginRate = num(c.initialMarginRate, 0.1);
    const category = hibachiContractCategory(c, info);
    return {
      symbol,
      base: symbol,
      pair: `${symbol}/USDT`,
      market_name: c.symbol || `${symbol}/USDT-P`,
      market_id: Number(c.id),
      pair_index: Number(c.id),
      category,
      market_category: category,
      category_label: hibachiDisplayCategory(category),
      lot_size: String(c.stepSize || c.minOrderSize || ''),
      tick_size: String(c.tickSize || ''),
      min_order_size: String(c.minOrderSize || ''),
      min_notional_usd: Number(c.minNotional || 0),
      max_leverage: initialMarginRate > 0 ? Math.max(1, Math.floor(1 / initialMarginRate)) : 10,
      mark,
      mid: mark,
      oracle: mark,
      yesterday_price: num(info.price24hAgo || priceInfo.price24hAgo),
      open_interest: 0,
      volume_24h: num(statsInfo.volume24h),
      funding_rate: num(priceInfo.fundingRateEstimation?.estimatedFundingRate),
      _hibachi: { contract: c, info, price: priceInfo, stats: statsInfo },
      _raw: m,
    };
  }));
  const data = enriched.filter(m => (
    m.symbol
    && Number.isFinite(m.market_id)
    && hibachiIsVisibleMarketCategory(m.category)
  ));
  return { success: true, data };
}

async function getPrices() {
  const info = await getMarketInfo();
  return {
    success: true,
    data: (info.data || []).map(m => ({
      symbol: m.symbol,
      mark: String(m.mark || ''),
      mid: String(m.mid || m.mark || ''),
      oracle: String(m.oracle || m.mark || ''),
      yesterday_price: String(m.yesterday_price || ''),
      open_interest: String(m.open_interest || 0),
      volume_24h: m.volume_24h || 0,
      funding_rate: m.funding_rate || 0,
      category: m.category || '',
      market_category: m.market_category || m.category || '',
      category_label: m.category_label || hibachiDisplayCategory(m.category),
    })),
  };
}

async function authedGet(path, creds) {
  return request(HIBACHI_API, 'GET', path, { apiKey: creds.apiKey });
}

async function cachedAuthedGet(path, creds, opts = {}) {
  const ttlMs = Math.max(0, Number(opts.ttlMs ?? HIBACHI_PRIVATE_READ_CACHE_MS));
  const staleMs = Math.max(ttlMs, Number(opts.staleMs ?? HIBACHI_PRIVATE_READ_STALE_MS));
  const key = privateReadCacheKey(path, creds);
  const now = Date.now();
  const cached = privateReadCache.get(key);
  if (cached?.payload !== undefined && now - cached.at < ttlMs) return cached.payload;
  if (cached?.promise) return cached.promise;

  const promise = authedGet(path, creds).then((payload) => {
    privateReadCache.set(key, { payload, at: Date.now() });
    prunePrivateReadCache();
    return payload;
  }, (error) => {
    const latest = privateReadCache.get(key) || cached;
    if (
      isRetryableReadError(error)
      && latest?.payload !== undefined
      && latest?.at
      && Date.now() - latest.at < staleMs
    ) {
      console.warn(`[hibachi] using stale private read for ${path}: ${error.message}`);
      privateReadCache.set(key, { payload: latest.payload, at: latest.at });
      return latest.payload;
    }
    if (latest?.payload !== undefined) privateReadCache.set(key, { payload: latest.payload, at: latest.at });
    else privateReadCache.delete(key);
    throw error;
  });
  privateReadCache.set(key, { ...(cached || {}), promise });
  return promise;
}

async function authedSend(method, path, body, creds) {
  return request(HIBACHI_API, method, path, { apiKey: creds.apiKey, body });
}

function accountInfoPath(creds) {
  return `/trade/account/info?accountId=${encodeURIComponent(creds.accountId)}`;
}

async function getAccountInfo(creds) {
  if (HIBACHI_WS_ENABLED) {
    try {
      const snapshot = await accountStream(creds).ensureStarted();
      if (snapshot) return snapshot;
      logHibachiWs('account_fallback_rest', creds, { message: 'snapshot unavailable' });
    } catch (e) {
      logHibachiWs('account_fallback_rest', creds, { message: e.message || String(e) });
    }
  }
  return cachedAuthedGet(accountInfoPath(creds), creds);
}

async function getAccount(credsInput) {
  const creds = credentials(credsInput);
  const j = await getAccountInfo(creds);
  const feeLevel = j?.feeLevel
    ?? j?.fee_level
    ?? j?.feeTier
    ?? j?.fee_tier
    ?? j?.feeTierName
    ?? j?.fee_tier_name
    ?? j?.vipLevel
    ?? j?.vip_level
    ?? null;
  const marginUsed = accountMarginUsed(j);
  const accountCategory = hibachiAccountCategory(j);
  return {
    balance: String(j?.balance ?? 0),
    usdc: String(j?.balance ?? 0),
    account_equity: String(j?.balance ?? 0),
    available_to_spend: String(j?.balance ?? 0),
    available_to_withdraw: String(j?.maximalWithdraw ?? j?.balance ?? 0),
    total_margin_used: String(marginUsed),
    positions_count: Array.isArray(j?.positions) ? j.positions.length : 0,
    orders_count: 0,
    account_category: accountCategory,
    category: accountCategory,
    category_label: hibachiDisplayCategory(accountCategory),
    fee_level: feeLevel,
    maker_fee: num(j?.tradeMakerFeeRate),
    taker_fee: num(j?.tradeTakerFeeRate),
    _raw: j,
  };
}

async function getPositions(credsInput) {
  const creds = credentials(credsInput);
  const j = await getAccountInfo(creds);
  return rows(j?.positions).map(p => {
    const amount = Math.abs(num(p.quantity));
    if (!p?.symbol || amount <= 0) return null;
    const side = String(p.direction || '').toUpperCase().includes('SHORT') ? 'ask' : 'bid';
    const notional = num(p.notionalValue);
    const rawLeverage = num(p.leverage ?? p.positionLeverage ?? p.initialLeverage);
    const margin = positionMargin(p);
    const pnlUsd = num(p.unrealizedTradingPnl) + num(p.unrealizedFundingPnl);
    return {
      symbol: symbolOf(p.symbol),
      side,
      amount: String(amount),
      size_usd: notional,
      entry_price: String(p.openPrice || ''),
      mark_price: String(p.markPrice || ''),
      liquidation_price: null,
      margin: margin > 0 ? String(margin) : '',
      leverage: rawLeverage > 0 ? String(rawLeverage) : '',
      pnl_usd: String(pnlUsd),
      pnl_pct: margin > 0 ? (pnlUsd / margin) * 100 : null,
      pair_index: null,
      trade_index: null,
      is_isolated: false,
      _raw: p,
    };
  }).filter(Boolean);
}

async function getOrders(credsInput) {
  const creds = credentials(credsInput);
  let j = null;
  if (HIBACHI_WS_ENABLED) {
    try {
      const response = await tradeStream(creds).rpc('orders.status');
      j = response?.result || response;
    } catch (e) {
      logHibachiWs('orders_fallback_rest', creds, { message: e.message || String(e) });
    }
  }
  if (j == null) {
    j = await cachedAuthedGet(`/trade/orders?accountId=${encodeURIComponent(creds.accountId)}`, creds);
  }
  return rows(j?.orders || j).map(o => ({
    symbol: symbolOf(o.symbol),
    side: String(o.side || '').toUpperCase() === 'ASK' ? 'ask' : 'bid',
    amount: String(o.availableQuantity || o.totalQuantity || ''),
    initial_amount: String(o.totalQuantity || o.availableQuantity || ''),
    price: String(o.triggerPrice || o.price || ''),
    stop_price: o.triggerPrice ? String(o.triggerPrice) : null,
    order_id: o.orderId,
    order_type: String(o.orderType || '').toLowerCase(),
    tif: null,
    reduce_only: String(o.orderFlags || '').includes('REDUCE_ONLY'),
    pair_index: Number(o.contractId),
    trade_index: null,
    client_order_id: null,
    _raw: o,
  }));
}

async function placeOrder(credsInput, args = {}) {
  const creds = credentials(credsInput);
  const bySymbol = await contractMap();
  const symbol = String(args.symbol || '').toUpperCase().includes('/')
    ? String(args.symbol).toUpperCase()
    : `${symbolOf(args.symbol)}/USDT-P`;
  const contract = bySymbol.get(symbol);
  if (!contract) throw new Error(`No Hibachi market for ${symbol}`);
  const account = await getAccount(creds);
  const accountCategory = hibachiAccountCategory(account?._raw || account);
  const contractCategory = hibachiContractCategory(contract);
  if (!hibachiIsVisibleMarketCategory(contractCategory)) {
    throw new Error(`Hibachi ${hibachiDisplayCategory(contractCategory)} markets are temporarily hidden in Clash. Choose a Crypto market.`);
  }
  if (!hibachiCanTradeCategory(accountCategory, contractCategory)) {
    throw new Error(
      `Hibachi account ${creds.accountId} (${hibachiDisplayCategory(accountCategory)}) cannot trade ${symbol} (${hibachiDisplayCategory(contractCategory)}). Switch to a ${hibachiDisplayCategory(contractCategory)} Hibachi account or choose a ${hibachiDisplayCategory(accountCategory)} market.`,
    );
  }
  const side = String(args.side || '').toLowerCase();
  const hibachiSide = side === 'ask' || side === 'short' || side === 'sell' ? 'ASK' : 'BID';
  const quantity = decimalText(args.quantity || args.amount || 0);
  if (!(num(quantity) > 0)) throw new Error('Order quantity required');
  const orderType = String(args.orderType || 'market').toUpperCase() === 'LIMIT' ? 'LIMIT' : 'MARKET';
  const price = orderType === 'LIMIT' ? decimalText(args.price) : null;
  if (price != null) checkTickSize(price, contract.tickSize);
  const triggerPrice = args.triggerPrice != null || args.trigger_price != null
    ? decimalText(args.triggerPrice ?? args.trigger_price)
    : null;
  if (triggerPrice != null) checkTickSize(triggerPrice, contract.tickSize);
  const triggerDirection = normalizeTriggerDirection(args.triggerDirection || args.trigger_direction);
  if (triggerPrice != null && !triggerDirection) {
    throw new Error('Hibachi triggerDirection must be HIGH or LOW for trigger orders');
  }
  const orderFlags = normalizeOrderFlags(args);
  const nonce = Date.now();
  const maxFeesPercent = decimalText(args.maxFeesPercent || HIBACHI_MAX_FEES_PERCENT);
  const payload = orderSignaturePayload({ nonce, contract, quantity, side: hibachiSide, price, maxFeesPercent });
  const body = {
    accountId: creds.accountId,
    nonce,
    symbol,
    quantity,
    orderType,
    side: hibachiSide,
    maxFeesPercent,
    signature: signPayload(creds.privateKey, payload),
    ...(price != null ? { price } : {}),
    ...(triggerPrice != null ? { triggerPrice, triggerDirection } : {}),
    ...(orderFlags ? { orderFlags } : {}),
  };
  const result = await authedSend('POST', '/trade/order', body, creds);
  accountStream(creds).markStale();
  return result;
}

async function cancelOrder(credsInput, { orderId, nonce } = {}) {
  const creds = credentials(credsInput);
  const id = orderId != null && orderId !== '' ? BigInt(orderId) : null;
  const n = nonce != null && nonce !== '' ? BigInt(nonce) : null;
  if (id == null && n == null) throw new Error('orderId or nonce required');
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(id ?? n);
  const body = {
    accountId: creds.accountId,
    signature: signPayload(creds.privateKey, buf),
    ...(id != null ? { orderId: String(id) } : { nonce: String(n) }),
  };
  const result = await authedSend('DELETE', '/trade/order', body, creds);
  accountStream(creds).markStale();
  return result;
}

function normalizeTrade(accountId, trade) {
  const notional = Math.abs(num(trade.price) * num(trade.quantity));
  if (!trade?.symbol || !Number.isFinite(notional) || notional < HIBACHI_REWARD_MIN_NOTIONAL_USD || notional > 10_000_000) return null;
  const sideText = String(trade.side || '').toUpperCase();
  const side = sideText === 'ASK' || sideText === 'SELL' ? 'short' : 'long';
  const id = trade.id || trade.tradeId || `${trade.bidOrderId || ''}:${trade.askOrderId || ''}:${trade.timestamp || ''}`;
  return {
    symbol: symbolOf(trade.symbol),
    side,
    orderType: String(trade.orderType || '').toLowerCase() || 'market',
    amount: String(Math.abs(num(trade.quantity))),
    price: String(trade.price || ''),
    orderId: trade.bidAccountId === accountId ? trade.bidOrderId : trade.askOrderId,
    clientOrderId: `hibachi:${accountId}:${id}`,
    status: 'filled',
    dex: 'hibachi',
    notional_usd: notional,
    verifiedSource: 'hibachi_api',
    pnl: trade.realizedPnl != null ? String(trade.realizedPnl) : null,
    fee: trade.fee != null ? String(trade.fee) : null,
    created_at: num(trade.timestamp) > 1e12 ? num(trade.timestamp) : num(trade.timestamp) * 1000,
    _raw: trade,
  };
}

async function getAccountTradeHistory(credsInput, { limit = HIBACHI_FILL_LOOKBACK_LIMIT } = {}) {
  const creds = credentials(credsInput);
  const j = await cachedAuthedGet(`/trade/account/trades?accountId=${encodeURIComponent(creds.accountId)}`, creds, {
    ttlMs: 1_500,
    staleMs: 15_000,
  });
  return rows(j?.trades || j)
    .slice(0, Math.max(1, Math.min(250, Number(limit) || HIBACHI_FILL_LOOKBACK_LIMIT)))
    .map(t => normalizeTrade(creds.accountId, t))
    .filter(Boolean);
}

async function importFillsForPlayer(playerId, credsInput, opts = {}) {
  const creds = credentials(credsInput);
  const db = require('./db');
  let fills = [];
  try {
    fills = await getAccountTradeHistory(creds, opts);
  } catch (e) {
    console.warn('[hibachi] trade history import read failed:', e.message);
    return {
      ok: false,
      imported: 0,
      adopted: 0,
      skipped: 0,
      total: 0,
      status: e.status || null,
      retryable: isRetryableReadError(e),
      error: e.message || 'Hibachi trade history unavailable',
      attribution: 'hibachi_api_no_builder_code',
    };
  }
  let imported = 0;
  let adopted = 0;
  let skipped = 0;
  for (const trade of fills) {
    try {
      const before = db.db.prepare('SELECT id, player_id FROM trade_history WHERE client_order_id = ? LIMIT 1').get(trade.clientOrderId);
      if (before) {
        if (before.player_id !== playerId) {
          const moved = db.db.prepare(`
            UPDATE trade_history
            SET player_id = ?
            WHERE id = ? AND dex = 'hibachi' AND verified_source = 'hibachi_api'
          `).run(playerId, before.id);
          if (moved.changes > 0) adopted++;
        }
        skipped++;
        continue;
      }
      const r = db.addTrade(playerId, trade);
      if (r?.id) imported++;
      else skipped++;
    } catch (e) {
      skipped++;
      if (!/UNIQUE|constraint/i.test(e.message || '')) {
        console.warn('[hibachi] addTrade failed:', e.message);
      }
    }
  }
  return { ok: true, imported, adopted, skipped, total: fills.length, attribution: 'hibachi_api_no_builder_code' };
}

module.exports = {
  HIBACHI_API,
  HIBACHI_DATA_API,
  HIBACHI_IP_BLOCKED_MESSAGE,
  credentials,
  isIpBlockedError,
  getMarketInfo,
  getPrices,
  getAccount,
  getPositions,
  getOrders,
  placeOrder,
  cancelOrder,
  getAccountTradeHistory,
  importFillsForPlayer,
};
