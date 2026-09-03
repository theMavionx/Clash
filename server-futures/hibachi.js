const crypto = require('crypto');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { createReconnectingJsonWebSocket } = require('./reconnecting-json-websocket');
const { createHibachiProxyPool } = require('./hibachi-proxy-pool');

const HIBACHI_API = String(process.env.HIBACHI_API_URL || 'https://api.hibachi.xyz').replace(/\/+$/u, '');
const HIBACHI_DATA_API = String(process.env.HIBACHI_DATA_API_URL || 'https://data-api.hibachi.xyz').replace(/\/+$/u, '');
const HIBACHI_FILL_BACKFILL_MAX = Math.max(250, Math.min(5_000, Number(process.env.HIBACHI_FILL_BACKFILL_MAX || 5_000)));
const HIBACHI_FILL_LOOKBACK_LIMIT = Math.max(10, Math.min(HIBACHI_FILL_BACKFILL_MAX, Number(process.env.HIBACHI_FILL_LOOKBACK_LIMIT || 100)));
const HIBACHI_FILL_LOOKBACK_MS = Math.max(
  60_000,
  Math.min(30 * 24 * 60 * 60 * 1000, Number(process.env.HIBACHI_FILL_LOOKBACK_MS || 7 * 24 * 60 * 60 * 1000)),
);
const HIBACHI_TRADES_PAGE_SIZE = 100;
const HIBACHI_MAX_FEES_PERCENT = String(process.env.HIBACHI_MAX_FEES_PERCENT || '0.001');
const HIBACHI_IP_BLOCKED_MESSAGE = 'Hibachi is not available from your IP address. Try a supported network or IP region.';
const HIBACHI_RATE_LIMITED_MESSAGE = 'Hibachi is temporarily rate-limiting requests. Wait a few seconds, then try again.';
const HIBACHI_TRADING_PERMISSION_REQUIRED_MESSAGE = 'This Hibachi API key is read-only. In Hibachi, create or edit the key and enable Read-write > Trading (Withdraws and Transfers are not required), then use EDIT API in Clash.';
const HIBACHI_VISIBLE_MARKET_CATEGORIES = new Set(['crypto']);
const HIBACHI_PUBLIC_MARKET_CACHE_MS = Math.max(5_000, Math.min(5 * 60_000, Number(process.env.HIBACHI_PUBLIC_MARKET_CACHE_MS || 30_000)));
const HIBACHI_PUBLIC_MARKET_STALE_MS = Math.max(HIBACHI_PUBLIC_MARKET_CACHE_MS, Math.min(60 * 60_000, Number(process.env.HIBACHI_PUBLIC_MARKET_STALE_MS || 5 * 60_000)));
const HIBACHI_EXCHANGE_INFO_CACHE_MS = Math.max(60_000, Math.min(24 * 60 * 60_000, Number(process.env.HIBACHI_EXCHANGE_INFO_CACHE_MS || 10 * 60_000)));
const HIBACHI_EXCHANGE_INFO_STALE_MS = Math.max(HIBACHI_EXCHANGE_INFO_CACHE_MS, Math.min(7 * 24 * 60 * 60_000, Number(process.env.HIBACHI_EXCHANGE_INFO_STALE_MS || 24 * 60 * 60_000)));
const HIBACHI_PRIVATE_READ_CACHE_MS = Math.max(250, Math.min(5_000, Number(process.env.HIBACHI_PRIVATE_READ_CACHE_MS || 2_500)));
const HIBACHI_PRIVATE_READ_STALE_MS = Math.max(1_000, Math.min(60_000, Number(process.env.HIBACHI_PRIVATE_READ_STALE_MS || 30_000)));
const HIBACHI_PRIVATE_READ_MAX_ENTRIES = 500;
const HIBACHI_REST_RATE_LIMIT_WINDOW_MS = Math.max(1_000, Math.min(60_000, Number(process.env.HIBACHI_REST_RATE_LIMIT_WINDOW_MS || 10_000)));
const HIBACHI_REST_RATE_LIMIT_MAX = Math.max(10, Math.min(1_000, Number(process.env.HIBACHI_REST_RATE_LIMIT_MAX || 280)));
const HIBACHI_REST_RATE_LIMIT_QUEUE_MAX = Math.max(10, Math.min(5_000, Number(process.env.HIBACHI_REST_RATE_LIMIT_QUEUE_MAX || 1_000)));
const HIBACHI_REST_RATE_LIMIT_WAIT_MS = Math.max(1_000, Math.min(60_000, Number(process.env.HIBACHI_REST_RATE_LIMIT_WAIT_MS || 12_000)));
const HIBACHI_WS_ENABLED = String(process.env.HIBACHI_WS_ENABLED || 'true').toLowerCase() !== 'false';
const HIBACHI_ACCOUNT_INFO_REST_FIRST = String(process.env.HIBACHI_ACCOUNT_INFO_REST_FIRST || 'true').toLowerCase() !== 'false';
const HIBACHI_WS_CONNECT_TIMEOUT_MS = Math.max(1_000, Math.min(10_000, Number(process.env.HIBACHI_WS_CONNECT_TIMEOUT_MS || 4_000)));
const HIBACHI_WS_SNAPSHOT_WAIT_MS = Math.max(250, Math.min(5_000, Number(process.env.HIBACHI_WS_SNAPSHOT_WAIT_MS || 2_000)));
const HIBACHI_WS_SNAPSHOT_MAX_AGE_MS = Math.max(1_000, Math.min(120_000, Number(process.env.HIBACHI_WS_SNAPSHOT_MAX_AGE_MS || 45_000)));
const HIBACHI_WS_IDLE_CLOSE_MS = Math.max(15_000, Math.min(10 * 60_000, Number(process.env.HIBACHI_WS_IDLE_CLOSE_MS || 120_000)));
const hibachiProxyPool = createHibachiProxyPool();

if (hibachiProxyPool.configured) {
  const stats = hibachiProxyPool.stats();
  console.log(`[hibachi] REST proxy pool configured: ${stats.configured} proxies, ${stats.readAttempts} read attempts, direct fallback ${stats.directFallback ? 'enabled' : 'disabled'}`);
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// JSON.parse rounds integer literals above Number.MAX_SAFE_INTEGER. Hibachi
// uses u64 identifiers for trades/orders, so two adjacent ids can otherwise
// collapse to the same JavaScript number and one fill is silently discarded.
// Preserve every unsafe integer literal as its exact decimal string before
// handing the payload to JSON.parse; numeric prices/quantities remain numbers.
function parseHibachiJson(text) {
  const source = String(text ?? '');
  if (!source) return null;
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      out += source.slice(start, index);
      continue;
    }
    if (char === '-' || /\d/u.test(char)) {
      const match = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
      if (match) {
        const token = match[0];
        const integerToken = !/[.eE]/u.test(token);
        let unsafeInteger = false;
        if (integerToken) {
          try {
            const exact = BigInt(token);
            unsafeInteger = exact > BigInt(Number.MAX_SAFE_INTEGER)
              || exact < BigInt(Number.MIN_SAFE_INTEGER);
          } catch {}
        }
        out += unsafeInteger ? JSON.stringify(token) : token;
        index += token.length;
        continue;
      }
    }
    out += char;
    index += 1;
  }
  return JSON.parse(out);
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

function timestampMs(value) {
  const n = num(value, NaN);
  if (Number.isFinite(n) && n > 0) {
    // Hibachi endpoints have returned seconds and milliseconds. Accept
    // micro/nanoseconds defensively so an upstream precision change cannot
    // produce an invalid SQLite tournament timestamp.
    if (n > 1e17) return Math.floor(n / 1e6);
    if (n > 1e14) return Math.floor(n / 1e3);
    return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
  }
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function timestampIso(value) {
  const ms = timestampMs(value);
  if (ms == null) return null;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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

function hibachiIsLiveContract(contract = {}) {
  const status = String(firstPresent(
    contract.status,
    contract.marketStatus,
    contract.market_status,
    contract.symbolStatus,
    contract.symbol_status,
  ) || '').trim().toUpperCase();
  if (!status) return true;
  return ['LIVE', 'OPEN', 'ACTIVE', 'TRADING'].includes(status);
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

function firstPresent(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
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

function deletePrivateReadCache(path, creds = {}) {
  privateReadCache.delete(privateReadCacheKey(path, creds));
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
let lastHibachiNonce = 0;

function hibachiNonce() {
  const nowMicros = Math.floor(Date.now() * 1000);
  lastHibachiNonce = Math.max(nowMicros, lastHibachiNonce + 1);
  return lastHibachiNonce;
}

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
    balance: firstPresent(snapshot.balance, snapshot.accountBalance, snapshot.account_balance, snapshot.accountEquity, snapshot.account_equity, snapshot.equity, 0),
    maximalWithdraw: firstPresent(
      snapshot.maximalWithdraw,
      snapshot.maximal_withdraw,
      snapshot.availableToWithdraw,
      snapshot.available_to_withdraw,
      snapshot.availableToSpend,
      snapshot.available_to_spend,
      snapshot.availableBalance,
      snapshot.available_balance,
      snapshot.freeCollateral,
      snapshot.free_collateral,
    ),
    positions,
  };
}

function positionKey(position = {}) {
  const symbol = symbolOf(positionSymbol(position));
  const side = positionSide(position) === 'ask' ? 'short' : 'long';
  return `${symbol}:${side}`;
}

function positionSymbol(position = {}) {
  return position.symbol
    ?? position.market
    ?? position.marketSymbol
    ?? position.market_symbol
    ?? position.contractSymbol
    ?? position.contract_symbol
    ?? position.contract?.symbol
    ?? position.info?.symbol
    ?? '';
}

function positionQuantity(position = {}) {
  return Math.abs(num(
    position.quantity
      ?? position.amount
      ?? position.size
      ?? position.positionSize
      ?? position.position_size
      ?? position.openQuantity
      ?? position.open_quantity
      ?? position.netQuantity
      ?? position.net_quantity
      ?? position.contractQuantity
      ?? position.contract_quantity,
  ));
}

function positionSide(position = {}) {
  const text = String(
    position.direction
      ?? position.side
      ?? position.positionSide
      ?? position.position_side
      ?? position.orderSide
      ?? position.order_side
      ?? '',
  ).trim().toUpperCase();
  if (/(SHORT|ASK|SELL)/u.test(text)) return 'ask';
  if (/(LONG|BID|BUY)/u.test(text)) return 'bid';
  const signed = num(
    position.signedQuantity
      ?? position.signed_quantity
      ?? position.netQuantity
      ?? position.net_quantity
      ?? position.quantity,
    NaN,
  );
  return Number.isFinite(signed) && signed < 0 ? 'ask' : 'bid';
}

function positionNotional(position = {}) {
  return num(
    position.notionalValue
      ?? position.notional
      ?? position.positionNotional
      ?? position.position_notional
      ?? position.value
      ?? position.usdValue
      ?? position.usd_value,
  );
}

function positionEntryNotional(position = {}) {
  return num(
    position.entryNotional
      ?? position.entry_notional
      ?? position.openNotional
      ?? position.open_notional
      ?? position.initialNotional
      ?? position.initial_notional,
  );
}

function positionEntryPrice(position = {}) {
  const explicit = num(
    position.openPrice
      ?? position.open_price
      ?? position.entryPrice
      ?? position.entry_price
      ?? position.averageEntryPrice
      ?? position.average_entry_price
      ?? position.avgEntryPrice
      ?? position.avg_entry_price,
  );
  if (explicit > 0) return explicit;
  const entryNotional = positionEntryNotional(position);
  const amount = positionQuantity(position);
  return entryNotional > 0 && amount > 0 ? entryNotional / amount : 0;
}

function positionMarkPrice(position = {}) {
  const explicit = num(
    position.markPrice
      ?? position.mark_price
      ?? position.marketPrice
      ?? position.market_price
      ?? position.oraclePrice
      ?? position.oracle_price
      ?? position.indexPrice
      ?? position.index_price,
  );
  if (explicit > 0) return explicit;
  const notional = positionNotional(position);
  const amount = positionQuantity(position);
  return notional > 0 && amount > 0 ? notional / amount : 0;
}

function explicitPositionPnl(position = {}) {
  // Hibachi's UI position PnL is the trading PnL. Funding is shown separately
  // and should not flip or dampen the card PnL value.
  const trading = position.unrealizedTradingPnl ?? position.unrealized_trading_pnl;
  if (trading !== undefined && trading !== null && trading !== '') return num(trading);

  const direct = position.pnl_usd
    ?? position.pnlUsd
    ?? position.pnl
    ?? position.unrealizedPnl
    ?? position.unrealized_pnl
    ?? position.unrealisedPnl
    ?? position.unrealised_pnl
    ?? position.uPnl;
  if (direct !== undefined && direct !== null && direct !== '') return num(direct);

  return null;
}

function hasExplicitPositionPnl(position = {}) {
  return explicitPositionPnl(position) !== null;
}

function derivedPositionPnl(position = {}, amount = positionQuantity(position), side = positionSide(position)) {
  const notional = positionNotional(position);
  const entryNotional = positionEntryNotional(position);
  if (notional > 0 && entryNotional > 0) {
    const direction = side === 'ask' ? -1 : 1;
    return (notional - entryNotional) * direction;
  }
  const entry = positionEntryPrice(position);
  const mark = positionMarkPrice(position);
  if (!(entry > 0) || !(mark > 0) || !(amount > 0)) return null;
  const direction = side === 'ask' ? -1 : 1;
  return (mark - entry) * amount * direction;
}

function positionPnl(position = {}, amount = positionQuantity(position), side = positionSide(position)) {
  const explicit = explicitPositionPnl(position);
  if (explicit !== null) return explicit;
  return derivedPositionPnl(position, amount, side) ?? 0;
}

function explicitPositionPnlPct(position = {}) {
  const direct = position.pnl_pct
    ?? position.pnlPct
    ?? position.pnlPercent
    ?? position.pnl_percent
    ?? position.pnlPercentage
    ?? position.pnl_percentage
    ?? position.unrealizedPnlPct
    ?? position.unrealized_pnl_pct
    ?? position.unrealizedPnlPercent
    ?? position.unrealized_pnl_percent
    ?? position.unrealizedPnlPercentage
    ?? position.unrealized_pnl_percentage;
  if (direct !== undefined && direct !== null && direct !== '') {
    const value = num(direct, NaN);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function priceDerivedPositionPnlPct(
  position = {},
  {
    side = positionSide(position),
    margin = positionMargin(position),
    notional = positionNotional(position),
    leverage = num(position.leverage ?? position.positionLeverage ?? position.initialLeverage),
  } = {},
) {
  const entry = positionEntryPrice(position);
  const mark = positionMarkPrice(position);
  if (!(entry > 0) || !(mark > 0)) return null;
  const direction = side === 'ask' ? -1 : 1;
  const effectiveLeverage = leverage > 0 ? leverage : (margin > 0 && notional > 0 ? notional / margin : 1);
  return ((mark - entry) / entry) * 100 * direction * Math.max(1, effectiveLeverage || 1);
}

function positionPnlPct(position = {}, opts = {}) {
  const pnlUsd = Number(opts.pnlUsd);
  const margin = Number(opts.margin);
  // Hibachi UI reports position PnL percent against allocated margin, not
  // against notional/raw price movement. Prefer that formula whenever both
  // values are known, even if the payload also includes a raw percent field.
  if (Number.isFinite(pnlUsd) && margin > 0) return (pnlUsd / margin) * 100;
  const explicit = explicitPositionPnlPct(position);
  if (explicit != null) return explicit;
  const derived = priceDerivedPositionPnlPct(position, opts);
  if (derived != null) return derived;
  return margin > 0 && Number.isFinite(pnlUsd) ? (pnlUsd / margin) * 100 : null;
}

function mergePositionUpdate(positions, update) {
  const next = Array.isArray(positions) ? positions.slice() : [];
  const key = positionKey(update);
  const quantity = positionQuantity(update);
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
    next.balance = firstPresent(data.balance, data.accountBalance, data.account_balance, data.accountEquity, data.account_equity, data.equity, next.balance);
    next.maximalWithdraw = firstPresent(
      data.maximalWithdraw,
      data.maximal_withdraw,
      data.availableToWithdraw,
      data.available_to_withdraw,
      data.availableToSpend,
      data.available_to_spend,
      data.availableBalance,
      data.available_balance,
      data.freeCollateral,
      data.free_collateral,
      next.maximalWithdraw,
    );
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

  markStale({ clearSnapshot = false } = {}) {
    this.snapshotAt = 0;
    if (clearSnapshot) {
      this.snapshot = null;
      this.resolveWaiters(null);
    }
  }

  replaceSnapshot(snapshot) {
    if (!snapshot) return;
    this.snapshot = normalizeWsAccountSnapshot(snapshot);
    this.snapshotAt = Date.now();
    this.resolveWaiters(this.snapshot);
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

const restRateGate = {
  timestamps: [],
  queue: [],
  timer: null,
};

function pruneRestRateGate(now = Date.now()) {
  const cutoff = now - HIBACHI_REST_RATE_LIMIT_WINDOW_MS;
  while (restRateGate.timestamps.length && restRateGate.timestamps[0] <= cutoff) {
    restRateGate.timestamps.shift();
  }
}

function nextRestRateGateDelay(now = Date.now()) {
  pruneRestRateGate(now);
  if (restRateGate.timestamps.length < HIBACHI_REST_RATE_LIMIT_MAX) return 0;
  const oldest = restRateGate.timestamps[0] || now;
  return Math.max(25, oldest + HIBACHI_REST_RATE_LIMIT_WINDOW_MS - now + 5);
}

function scheduleRestRateGateDrain(delayMs = 0) {
  if (restRateGate.timer) return;
  restRateGate.timer = setTimeout(() => {
    restRateGate.timer = null;
    drainRestRateGate();
  }, Math.max(0, delayMs));
  if (restRateGate.timer.unref) restRateGate.timer.unref();
}

function drainRestRateGate() {
  const now = Date.now();
  pruneRestRateGate(now);
  while (
    restRateGate.queue.length
    && restRateGate.timestamps.length < HIBACHI_REST_RATE_LIMIT_MAX
  ) {
    const item = restRateGate.queue.shift();
    clearTimeout(item.timeout);
    restRateGate.timestamps.push(Date.now());
    item.resolve();
  }
  if (restRateGate.queue.length) scheduleRestRateGateDrain(nextRestRateGateDelay());
}

async function acquireRestRateSlot(path = '') {
  const now = Date.now();
  pruneRestRateGate(now);
  if (restRateGate.timestamps.length < HIBACHI_REST_RATE_LIMIT_MAX) {
    restRateGate.timestamps.push(now);
    return;
  }
  if (restRateGate.queue.length >= HIBACHI_REST_RATE_LIMIT_QUEUE_MAX) {
    const err = new Error('Hibachi REST queue is full; retry shortly.');
    err.status = 429;
    err.path = path;
    err.localRateLimited = true;
    throw err;
  }
  await new Promise((resolve, reject) => {
    const item = {
      resolve,
      reject,
      timeout: null,
    };
    item.timeout = setTimeout(() => {
      const index = restRateGate.queue.indexOf(item);
      if (index >= 0) restRateGate.queue.splice(index, 1);
      const err = new Error('Hibachi REST queue timed out; retry shortly.');
      err.status = 429;
      err.path = path;
      err.localRateLimited = true;
      reject(err);
    }, HIBACHI_REST_RATE_LIMIT_WAIT_MS);
    if (item.timeout.unref) item.timeout.unref();
    restRateGate.queue.push(item);
    scheduleRestRateGateDrain(nextRestRateGateDelay());
  });
}

function proxyAffinityKey(apiKey, accountId) {
  if (!apiKey && !accountId) return '';
  return crypto
    .createHash('sha256')
    .update(`${accountId || ''}:${apiKey || ''}`)
    .digest('hex');
}

function isProxyTransportError(error) {
  if (Number(error?.status) === 407) return true;
  const code = String(error?.cause?.code || error?.code || '');
  if (/^(?:ECONN|EHOST|ENET|ETIMEDOUT|UND_ERR_)/u.test(code)) return true;
  return /fetch failed|network|socket|connect|proxy|tunnel|timed out|aborted/iu.test(String(error?.message || ''));
}

function shouldRetryHibachiRead(error, method, lease) {
  if (!lease || !['GET', 'HEAD'].includes(method)) return false;
  return isRateLimitedError(error) || isIpBlockedError(error) || isProxyTransportError(error);
}

async function request(base, method, path, { apiKey, accountId, body } = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
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
  // Public market reads belong to the shared allowlisted transport, which owns
  // proxy rotation, its circuit breaker, and the server-direct fallback. Keep
  // this dedicated pool only for account-bound traffic so affinity is stable
  // and authenticated/signed requests can never inherit the public fallback.
  const useAccountProxy = hibachiProxyPool.configured && Boolean(apiKey || accountId);
  const maxAttempts = normalizedMethod === 'GET' && useAccountProxy
    ? Math.min(hibachiProxyPool.readAttempts, hibachiProxyPool.stats().configured)
    : 1;
  const excluded = new Set();
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await acquireRestRateSlot(path);
    let lease = null;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12_000);
    try {
      if (useAccountProxy) {
        lease = hibachiProxyPool.acquire({
          affinityKey: proxyAffinityKey(apiKey, accountId),
          excluded,
        });
      }
      const requestOptions = {
        method: normalizedMethod,
        headers,
        body: payload,
        signal: ctrl.signal,
      };
      if (lease?.dispatcher) requestOptions.dispatcher = lease.dispatcher;
      const r = await fetch(`${base}${path}`, requestOptions);
      const text = await r.text();
      let data = null;
      try { data = text ? parseHibachiJson(text) : null; } catch { data = text; }
      if (!r.ok) {
        const errorText = typeof data === 'string'
          ? data
          : [data?.title, data?.detail, data?.message, data?.error, text].filter(Boolean).join(' ');
        if (r.status === 429) {
          const headerRetryAfter = Number(r.headers.get('retry-after'));
          const bodyRetryAfter = Number(data?.retry_after ?? data?.retryAfter);
          const retryAfter = Number.isFinite(headerRetryAfter) && headerRetryAfter > 0
            ? headerRetryAfter
            : (Number.isFinite(bodyRetryAfter) && bodyRetryAfter > 0 ? bodyRetryAfter : null);
          const err = new Error(retryAfter
            ? `Hibachi is temporarily rate-limiting requests. Retry in ${Math.ceil(retryAfter)} seconds.`
            : HIBACHI_RATE_LIMITED_MESSAGE);
          err.code = 'HIBACHI_RATE_LIMITED';
          err.status = 429;
          err.path = path;
          err.retryAfter = retryAfter;
          throw err;
        }
        const explicitGeoBlock = r.status === 451
          || Number(data?.error_code) === 1009
          || /(?:country|region|jurisdiction|geographic|geo-location|ip address).{0,80}(?:unsupported|restricted|blocked|prohibited|not available)|(?:unsupported|restricted|blocked|prohibited|not available).{0,80}(?:country|region|jurisdiction|geographic|geo-location|ip address)/iu.test(errorText);
        if ((r.status === 403 || r.status === 451) && explicitGeoBlock) {
          const err = new Error(HIBACHI_IP_BLOCKED_MESSAGE);
          err.code = 'HIBACHI_IP_BLOCKED';
          err.status = r.status;
          err.path = path;
          throw err;
        }
        const detail = typeof data === 'string' ? data : (data?.message || data?.error || data?.detail || text);
        if (r.status === 401 && /missing required permission\s*:\s*trading/iu.test(String(detail || errorText))) {
          const err = new Error(HIBACHI_TRADING_PERMISSION_REQUIRED_MESSAGE);
          err.code = 'HIBACHI_TRADING_PERMISSION_REQUIRED';
          err.status = 401;
          err.path = path;
          err.detail = detail || 'Missing required permission: Trading';
          throw err;
        }
        const err = new Error(`Hibachi ${path} ${r.status}: ${detail || 'request failed'}`);
        err.status = r.status;
        err.path = path;
        throw err;
      }
      hibachiProxyPool.reportSuccess(lease);
      return data;
    } catch (error) {
      lastError = error;
      if (lease) {
        if (isRateLimitedError(error)) hibachiProxyPool.reportRateLimit(lease, error.retryAfter);
        else if (isIpBlockedError(error)) hibachiProxyPool.reportGeoBlock(lease);
        else if (isProxyTransportError(error)) hibachiProxyPool.reportTransportFailure(lease);
        else hibachiProxyPool.reportSuccess(lease);
        excluded.add(lease.index);
      }
      if (!shouldRetryHibachiRead(error, normalizedMethod, lease) || attempt + 1 >= maxAttempts) throw error;
    } finally {
      clearTimeout(timeout);
      hibachiProxyPool.release(lease);
    }
  }
  throw lastError || new Error(`Hibachi ${path} request failed`);
}

function isIpBlockedError(error) {
  return error?.code === 'HIBACHI_IP_BLOCKED';
}

function isRateLimitedError(error) {
  return error?.code === 'HIBACHI_RATE_LIMITED' || Number(error?.status) === 429;
}

function isTradingPermissionError(error) {
  if (error?.code === 'HIBACHI_TRADING_PERMISSION_REQUIRED') return true;
  const text = [error?.detail, error?.message, error?.error].filter(Boolean).join(' ');
  return Number(error?.status) === 401 && /missing required permission\s*:\s*trading/iu.test(text);
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

function scaledDecimalInteger(value, scale) {
  const text = decimalText(value);
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const padded = `${fraction}${'0'.repeat(scale)}`.slice(0, scale);
  const integer = BigInt(whole || '0') * (10n ** BigInt(scale)) + BigInt(padded || '0');
  return negative ? -integer : integer;
}

function scaledIntegerText(value, scale) {
  const negative = value < 0n;
  const unsigned = negative ? -value : value;
  if (scale === 0) return `${negative ? '-' : ''}${unsigned}`;
  const padded = unsigned.toString().padStart(scale + 1, '0');
  const whole = padded.slice(0, -scale) || '0';
  const fraction = padded.slice(-scale).replace(/0+$/u, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function roundPriceToTick(price, tickSize) {
  if (tickSize == null || tickSize === '') return decimalText(price);
  const priceText = decimalText(price);
  const tickText = decimalText(tickSize);
  const scale = Math.max(decimalPlaces(priceText), decimalPlaces(tickText));
  const priceInteger = scaledDecimalInteger(priceText, scale);
  const tickInteger = scaledDecimalInteger(tickText, scale);
  if (priceInteger <= 0n) throw new Error('Hibachi price must be positive');
  if (tickInteger <= 0n) throw new Error(`Invalid Hibachi tick size ${tickSize}`);
  const steps = (priceInteger + (tickInteger / 2n)) / tickInteger;
  return scaledIntegerText(steps * tickInteger, scale);
}

function checkTickSize(price, tickSize) {
  if (tickSize == null || tickSize === '') return;
  const priceText = decimalText(price);
  const tickText = decimalText(tickSize);
  const scale = Math.max(decimalPlaces(priceText), decimalPlaces(tickText));
  const tickInteger = scaledDecimalInteger(tickText, scale);
  if (tickInteger <= 0n || scaledDecimalInteger(priceText, scale) % tickInteger !== 0n) {
    throw new Error(`Invalid Hibachi price increment: ${price} is not aligned to tick size ${tickSize}`);
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

function normalizeParentOrder(args = {}) {
  const raw = firstPresent(args.parentOrder, args.parent_order);
  if (raw && typeof raw === 'object') {
    const nonce = firstPresent(raw.nonce, raw.parentNonce, raw.parent_nonce);
    if (nonce != null) return { nonce: String(nonce) };
    const orderId = firstPresent(raw.orderId, raw.order_id, raw.id);
    if (orderId != null) return { orderId: String(orderId) };
  }
  const nonce = firstPresent(args.parentNonce, args.parent_nonce);
  if (nonce != null) return { nonce: String(nonce) };
  const orderId = firstPresent(args.parentOrderId, args.parent_order_id);
  if (orderId != null) return { orderId: String(orderId) };
  return null;
}

function positionMargin(position = {}, context = {}) {
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

  const accountMargin = num(context.accountMargin, 0);
  const totalBasis = num(context.totalBasis, 0);
  const positionBasis = positionEntryNotional(position) || positionNotional(position);
  if (accountMargin > 0 && totalBasis > 0 && positionBasis > 0) {
    return accountMargin * (positionBasis / totalBasis);
  }

  const notional = positionNotional(position);
  const leverage = num(position.leverage ?? position.positionLeverage ?? position.initialLeverage);
  return notional > 0 && leverage > 0 ? notional / leverage : 0;
}

function hibachiPositionInitialMargin(position = {}, { fallbackMargin = 0, leverage = 0 } = {}) {
  const direct = num(
    position.margin
      ?? position.positionMargin
      ?? position.initialMargin
      ?? position.openMargin
      ?? position.collateral
      ?? position.usedMargin
      ?? position.marginUsed,
  );
  if (direct > 0) return direct;
  const entryNotional = positionEntryNotional(position);
  const effectiveLeverage = num(leverage);
  if (entryNotional > 0 && effectiveLeverage > 0) {
    return entryNotional / effectiveLeverage;
  }
  return num(fallbackMargin, 0);
}

function accountEquity(account = {}) {
  return Math.max(0, num(firstPresent(
    account.balance,
    account.accountBalance,
    account.account_balance,
    account.accountEquity,
    account.account_equity,
    account.equity,
    account.usdc,
    0,
  )));
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

  const equity = accountEquity(account);
  const rawWithdrawable = firstPresent(
    account.maximalWithdraw,
    account.maximal_withdraw,
    account.availableToWithdraw,
    account.available_to_withdraw,
    account.availableToSpend,
    account.available_to_spend,
    account.availableBalance,
    account.available_balance,
    account.freeCollateral,
    account.free_collateral,
  );
  const hasWithdrawable = rawWithdrawable !== undefined && rawWithdrawable !== null && rawWithdrawable !== '';
  const withdrawable = num(rawWithdrawable);
  if (hasWithdrawable && equity > 0 && withdrawable >= 0 && equity >= withdrawable) {
    return equity - withdrawable;
  }

  const positions = rows(account.positions);
  const positionSum = positions.reduce((sum, p) => sum + positionMargin(p), 0);
  return positionSum > 0 ? positionSum : 0;
}

function accountFreeCollateral(account = {}) {
  const explicitFree = firstPresent(
    account.maximalWithdraw,
    account.maximal_withdraw,
    account.availableToWithdraw,
    account.available_to_withdraw,
    account.availableToSpend,
    account.available_to_spend,
    account.availableBalance,
    account.available_balance,
    account.freeCollateral,
    account.free_collateral,
  );
  if (explicitFree !== undefined) return Math.max(0, num(explicitFree));

  const equity = accountEquity(account);
  const marginUsed = accountMarginUsed(account);
  if (equity > 0 && marginUsed > 0) return Math.max(0, equity - marginUsed);
  return equity;
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

function signedOrderRequest(creds, {
  nonce,
  contract,
  symbol,
  quantity,
  hibachiSide,
  price = null,
  triggerPrice = null,
  triggerDirection = null,
  parentOrder = null,
  orderFlags = null,
  maxFeesPercent,
}) {
  const payload = orderSignaturePayload({ nonce, contract, quantity, side: hibachiSide, price, maxFeesPercent });
  return {
    nonce,
    symbol,
    quantity,
    orderType: price != null ? 'LIMIT' : 'MARKET',
    side: hibachiSide,
    maxFeesPercent,
    signature: signPayload(creds.privateKey, payload),
    ...(price != null ? { price } : {}),
    ...(triggerPrice != null ? { triggerPrice, triggerDirection } : {}),
    ...(parentOrder ? { parentOrder } : {}),
    ...(orderFlags ? { orderFlags } : {}),
  };
}

function attachedTpslLegs(args = {}, parentSide) {
  const takeProfit = firstPresent(args.takeProfit, args.take_profit, args.tp);
  const stopLoss = firstPresent(args.stopLoss, args.stop_loss, args.sl);
  const legs = [];
  const closeSide = parentSide === 'ASK' ? 'BID' : 'ASK';
  if (num(takeProfit) > 0) {
    legs.push({
      kind: 'tp',
      side: closeSide,
      triggerPrice: decimalText(takeProfit),
      triggerDirection: parentSide === 'ASK' ? 'LOW' : 'HIGH',
    });
  }
  if (num(stopLoss) > 0) {
    legs.push({
      kind: 'sl',
      side: closeSide,
      triggerPrice: decimalText(stopLoss),
      triggerDirection: parentSide === 'BID' ? 'LOW' : 'HIGH',
    });
  }
  return legs;
}

function batchOrderRows(result = {}) {
  return rows(result?.orders || result?.data?.orders || result?.result?.orders || []);
}

function batchOrderStatus(row = {}) {
  return String(firstPresent(row.status, row.orderStatus, row.order_status, row.error, row.message, '')).toLowerCase();
}

function decorateBatchOrderResult(result, parentNonce) {
  const orders = batchOrderRows(result);
  const parent = orders[0] || null;
  const children = orders.slice(1);
  const childError = children.find(row => /reject|cancel|fail|error/u.test(batchOrderStatus(row)));
  return {
    ...(result && typeof result === 'object' ? result : { result }),
    orderId: firstPresent(parent?.orderId, parent?.order_id, parent?.id, result?.orderId, result?.order_id),
    status: firstPresent(parent?.status, parent?.orderStatus, parent?.order_status, result?.status),
    _clash_nonce: String(parentNonce),
    _clash_batch: true,
    _clash_parent_order: parent,
    _clash_child_orders: children,
    ...(childError ? { _clash_tpsl_warning: firstPresent(childError.error, childError.message, childError.status, 'Hibachi TP/SL child order was not accepted') } : {}),
  };
}

const inventoryCache = { at: 0, payload: null, promise: null, retryAt: 0 };
const exchangeInfoCache = { at: 0, payload: null, promise: null, retryAt: 0 };
const contractMapCache = { at: 0, payload: null };
const marketDataCache = new Map();

async function cachedPublicRead(cache, label, loader, { ttlMs, staleMs }) {
  const now = Date.now();
  if (cache.payload != null && now - cache.at < ttlMs) return cache.payload;
  if (cache.payload != null && cache.retryAt > now) return cache.payload;
  if (cache.promise) return cache.promise;
  const promise = Promise.resolve()
    .then(loader)
    .then((payload) => {
      cache.payload = payload;
      cache.at = Date.now();
      cache.promise = null;
      cache.retryAt = 0;
      return payload;
    }, (error) => {
      cache.promise = null;
      if (
        cache.payload != null
        && cache.at
        && Date.now() - cache.at < staleMs
        && isRetryableReadError(error)
      ) {
        const retryAfterMs = Number(error?.retryAfter) > 0
          ? Number(error.retryAfter) * 1000
          : 30_000;
        cache.retryAt = Date.now() + Math.max(1_000, Math.min(5 * 60_000, retryAfterMs));
        console.warn(`[hibachi] using stale public ${label}: ${error.message}`);
        return cache.payload;
      }
      throw error;
    });
  cache.promise = promise;
  return promise;
}

function contractsFromInventory(payload) {
  return rows(payload?.markets).map(market => market?.contract || market).filter(Boolean);
}

function contractsFromExchangeInfo(payload) {
  return rows(payload?.futureContracts).filter(Boolean);
}

function rememberContracts(contracts) {
  const next = new Map(
    (Array.isArray(contracts) ? contracts : [])
      .filter(contract => contract?.symbol)
      .map(contract => [String(contract.symbol).toUpperCase(), contract]),
  );
  if (next.size > 0) {
    contractMapCache.payload = next;
    contractMapCache.at = Date.now();
  }
  return next;
}

async function getInventory() {
  const payload = await cachedPublicRead(
    inventoryCache,
    'inventory',
    () => request(HIBACHI_DATA_API, 'GET', '/market/inventory'),
    { ttlMs: HIBACHI_PUBLIC_MARKET_CACHE_MS, staleMs: HIBACHI_PUBLIC_MARKET_STALE_MS },
  );
  rememberContracts(contractsFromInventory(payload));
  return payload;
}

async function getExchangeInfo() {
  const payload = await cachedPublicRead(
    exchangeInfoCache,
    'exchange info',
    () => request(HIBACHI_DATA_API, 'GET', '/market/exchange-info'),
    { ttlMs: HIBACHI_EXCHANGE_INFO_CACHE_MS, staleMs: HIBACHI_EXCHANGE_INFO_STALE_MS },
  );
  rememberContracts(contractsFromExchangeInfo(payload));
  return payload;
}

async function getMarketData(symbol) {
  const key = String(symbol || '').trim();
  if (!key) return { price: {}, stats: {} };
  let cache = marketDataCache.get(key);
  if (!cache) {
    cache = { at: 0, payload: null, promise: null, retryAt: 0 };
    marketDataCache.set(key, cache);
  }
  return cachedPublicRead(cache, `market data for ${key}`, async () => {
    const [priceResult, statsResult] = await Promise.allSettled([
      request(HIBACHI_DATA_API, 'GET', `/market/data/prices?symbol=${encodeURIComponent(key)}`),
      request(HIBACHI_DATA_API, 'GET', `/market/data/stats?symbol=${encodeURIComponent(key)}`),
    ]);
    if (priceResult.status === 'rejected' && statsResult.status === 'rejected') {
      throw priceResult.reason || statsResult.reason;
    }
    return {
      price: priceResult.status === 'fulfilled' ? (priceResult.value || {}) : {},
      stats: statsResult.status === 'fulfilled' ? (statsResult.value || {}) : {},
    };
  }, { ttlMs: HIBACHI_PUBLIC_MARKET_CACHE_MS, staleMs: HIBACHI_PUBLIC_MARKET_STALE_MS });
}

async function contractMap() {
  if (contractMapCache.payload?.size) {
    if (Date.now() - contractMapCache.at >= HIBACHI_EXCHANGE_INFO_CACHE_MS) {
      getExchangeInfo().catch(error => {
        console.warn(`[hibachi] background contract metadata refresh failed: ${error.message}`);
      });
    }
    return contractMapCache.payload;
  }
  let list = contractsFromExchangeInfo(exchangeInfoCache.payload);
  if (!list.length) list = contractsFromInventory(inventoryCache.payload);
  if (list.length) return rememberContracts(list);
  try {
    const exchange = await getExchangeInfo();
    list = contractsFromExchangeInfo(exchange);
  } catch {}
  if (!list.length) {
    const inv = await getInventory();
    list = contractsFromInventory(inv);
  }
  return rememberContracts(list);
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
  const visibleMarkets = markets.filter((m) => {
    const contract = m?.contract || m;
    return hibachiIsLiveContract(contract)
      && hibachiIsVisibleMarketCategory(hibachiContractCategory(contract, m?.info || {}));
  });
  const enriched = await Promise.all(visibleMarkets.map(async (m) => {
    const c = m.contract || m;
    const info = m.info || {};
    const hasInventoryPrice = num(
      info.markPrice
      ?? info.priceLatest
      ?? info.spotPrice
      ?? info.bestBidPrice
      ?? info.bestAskPrice,
    ) > 0;
    const marketData = hasInventoryPrice
      ? { price: {}, stats: {} }
      : await getMarketData(c.symbol || info.symbol);
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
      open_interest: num(info.openInterestQuantity || statsInfo.openInterestQuantity),
      volume_24h: num(info.volume24h || statsInfo.volume24h),
      funding_rate: num(
        info.estimatedFundingRate
        ?? priceInfo.estimatedFundingRate
        ?? priceInfo.fundingRateEstimation?.estimatedFundingRate,
      ),
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
  return request(HIBACHI_API, 'GET', path, { apiKey: creds.apiKey, accountId: creds.accountId });
}

async function cachedAuthedGet(path, creds, opts = {}) {
  const ttlMs = Math.max(0, Number(opts.ttlMs ?? HIBACHI_PRIVATE_READ_CACHE_MS));
  const staleMs = Math.max(ttlMs, Number(opts.staleMs ?? HIBACHI_PRIVATE_READ_STALE_MS));
  const bypassCache = Boolean(opts.forceLive || opts.bypassCache);
  const allowStale = opts.allowStale !== false;
  const key = privateReadCacheKey(path, creds);
  const now = Date.now();
  const cached = privateReadCache.get(key);
  if (!bypassCache && cached?.payload !== undefined && now - cached.at < ttlMs) return cached.payload;
  if (!bypassCache && cached?.promise) return cached.promise;

  const promise = authedGet(path, creds).then((payload) => {
    privateReadCache.set(key, { payload, at: Date.now() });
    prunePrivateReadCache();
    return payload;
  }, (error) => {
    const latest = privateReadCache.get(key) || cached;
    if (
      allowStale
      && isRetryableReadError(error)
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
  return request(HIBACHI_API, method, path, { apiKey: creds.apiKey, accountId: creds.accountId, body });
}

function accountInfoPath(creds) {
  return `/trade/account/info?accountId=${encodeURIComponent(creds.accountId)}`;
}

function ordersPath(creds) {
  return `/trade/orders?accountId=${encodeURIComponent(creds.accountId)}`;
}

function tradesPath(creds, { page = 0 } = {}) {
  const params = new URLSearchParams({
    accountId: String(creds.accountId),
    page: String(Math.max(0, Math.floor(Number(page) || 0))),
  });
  return `/trade/account/trades?${params.toString()}`;
}

function ordersHistoryPath(creds, { startTime, endTime, cursorOrderId } = {}) {
  const params = new URLSearchParams({
    accountId: String(creds.accountId),
  });
  if (startTime != null) params.set('startTime', String(Math.floor(Number(startTime))));
  if (endTime != null) params.set('endTime', String(Math.floor(Number(endTime))));
  if (cursorOrderId != null && cursorOrderId !== '') params.set('cursorOrderId', String(cursorOrderId));
  return `/trade/orders/history?${params.toString()}`;
}

function orderIdentifier(order = {}) {
  const value = firstPresent(
    order.orderId,
    order.order_id,
    order.id,
    order.clientOrderId,
    order.client_order_id,
    order.nonce,
  );
  return value == null ? '' : String(value);
}

function rawOrderStatus(order = {}) {
  return String(firstPresent(
    order.status,
    order.orderStatus,
    order.order_status,
    order.state,
    order.orderState,
    order.order_state,
    '',
  )).toLowerCase();
}

function invalidatePrivateReadsAfterMutation(creds) {
  deletePrivateReadCache(accountInfoPath(creds), creds);
  deletePrivateReadCache(ordersPath(creds), creds);
  deletePrivateReadCache(tradesPath(creds), creds);
}

async function getAccountInfo(creds, opts = {}) {
  const forceLive = Boolean(opts.forceLive || opts.force_live);
  const readRest = async () => {
    const payload = await cachedAuthedGet(accountInfoPath(creds), creds, forceLive
      ? { forceLive: true, allowStale: opts.allowStale !== false && opts.allow_stale !== false, ttlMs: 0 }
      : {});
    if (HIBACHI_WS_ENABLED) {
      const hasPositions = rows(payload?.positions).length > 0;
      if (hasPositions || opts.acceptEmptySnapshot || opts.accept_empty_snapshot) {
        accountStream(creds).replaceSnapshot(payload);
      }
    }
    return payload;
  };

  if (forceLive || HIBACHI_ACCOUNT_INFO_REST_FIRST) {
    try {
      return await readRest();
    } catch (e) {
      if (forceLive || !HIBACHI_WS_ENABLED) throw e;
      try {
        const snapshot = await accountStream(creds).ensureStarted();
        if (snapshot) {
          logHibachiWs('account_fallback_ws', creds, { message: e.message || String(e) });
          return snapshot;
        }
      } catch (wsError) {
        logHibachiWs('account_ws_failed_after_rest', creds, { message: wsError.message || String(wsError) });
      }
      throw e;
    }
  }

  if (!forceLive && HIBACHI_WS_ENABLED) {
    try {
      const snapshot = await accountStream(creds).ensureStarted();
      if (snapshot) return snapshot;
      logHibachiWs('account_fallback_rest', creds, { message: 'snapshot unavailable' });
    } catch (e) {
      logHibachiWs('account_fallback_rest', creds, { message: e.message || String(e) });
    }
  }
  return readRest();
}

function formatAccount(j = {}) {
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
  const equity = accountEquity(j);
  const freeCollateral = accountFreeCollateral(j);
  const accountCategory = hibachiAccountCategory(j);
  return {
    balance: String(freeCollateral),
    usdc: String(freeCollateral),
    account_equity: String(equity),
    raw_balance: String(equity),
    available_to_spend: String(freeCollateral),
    available_to_withdraw: String(freeCollateral),
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

function formatPositionsFromAccountInfo(j = {}) {
  const positionRows = rows(j?.positions);
  const accountMargin = accountMarginUsed(j);
  const totalBasis = positionRows.reduce((sum, p) => {
    const basis = positionEntryNotional(p) || positionNotional(p);
    return sum + (basis > 0 ? basis : 0);
  }, 0);

  return positionRows.map(p => {
    const amount = positionQuantity(p);
    const rawSymbol = positionSymbol(p);
    if (!rawSymbol || amount <= 0) return null;
    const side = positionSide(p);
    const notional = positionNotional(p);
    const rawLeverage = num(p.leverage ?? p.positionLeverage ?? p.initialLeverage);
    const allocatedMargin = positionMargin(p, { accountMargin, totalBasis });
    const leverage = rawLeverage > 0
      ? rawLeverage
      : (allocatedMargin > 0 && notional > 0 ? Math.round((notional / allocatedMargin) * 10) / 10 : 0);
    const margin = hibachiPositionInitialMargin(p, { fallbackMargin: allocatedMargin, leverage });
    const entryPrice = positionEntryPrice(p);
    const markPrice = positionMarkPrice(p);
    const pnlUsd = positionPnl(p, amount, side);
    const pnlPct = positionPnlPct(p, { pnlUsd, margin, notional, leverage, amount, side });
    return {
      symbol: symbolOf(rawSymbol),
      side,
      amount: String(amount),
      size_usd: notional,
      entry_price: entryPrice > 0 ? String(entryPrice) : '',
      mark_price: markPrice > 0 ? String(markPrice) : '',
      liquidation_price: null,
      margin: margin > 0 ? String(margin) : '',
      leverage: leverage > 0 ? String(leverage) : '',
      pnl_usd: String(pnlUsd),
      pnl_pct: pnlPct,
      pnl_source: hasExplicitPositionPnl(p) ? 'hibachi_api' : 'derived_fallback',
      source: 'hibachi',
      unrealized_trading_pnl: p.unrealizedTradingPnl ?? p.unrealized_trading_pnl ?? null,
      unrealized_funding_pnl: p.unrealizedFundingPnl ?? p.unrealized_funding_pnl ?? null,
      entry_notional: positionEntryNotional(p) || null,
      notional_value: notional || null,
      pair_index: null,
      trade_index: null,
      is_isolated: false,
      _raw: p,
    };
  }).filter(Boolean);
}

async function getAccount(credsInput, opts = {}) {
  const creds = credentials(credsInput);
  const j = await getAccountInfo(creds, opts);
  return formatAccount(j);
}

async function getPositions(credsInput, opts = {}) {
  const creds = credentials(credsInput);
  const j = await getAccountInfo(creds, opts);
  return formatPositionsFromAccountInfo(j);
}

function formatOrders(payload) {
  return rows(payload?.orders || payload).map(o => ({
    symbol: symbolOf(o.symbol),
    side: String(o.side || '').toUpperCase() === 'ASK' ? 'ask' : 'bid',
    amount: String(o.availableQuantity || o.totalQuantity || ''),
    initial_amount: String(o.totalQuantity || o.availableQuantity || ''),
    price: String(o.triggerPrice || o.price || ''),
    stop_price: o.triggerPrice ? String(o.triggerPrice) : null,
    order_id: o.orderId,
    status: rawOrderStatus(o) || 'open',
    order_type: String(o.orderType || '').toLowerCase(),
    tif: null,
    reduce_only: String(o.orderFlags || '').includes('REDUCE_ONLY'),
    pair_index: Number(o.contractId),
    trade_index: null,
    client_order_id: null,
    _raw: o,
  }));
}

async function getOrders(credsInput, opts = {}) {
  const creds = credentials(credsInput);
  let j = null;
  const forceLive = Boolean(opts.forceLive || opts.force_live);
  if (!forceLive && HIBACHI_WS_ENABLED) {
    try {
      const response = await tradeStream(creds).rpc('orders.status');
      j = response?.result || response;
    } catch (e) {
      logHibachiWs('orders_fallback_rest', creds, { message: e.message || String(e) });
    }
  }
  if (j == null) {
    j = await cachedAuthedGet(ordersPath(creds), creds, forceLive
      ? { forceLive: true, allowStale: opts.allowStale !== false && opts.allow_stale !== false, ttlMs: 0 }
      : {});
  }
  return formatOrders(j);
}

async function getSnapshot(credsInput, opts = {}) {
  const creds = credentials(credsInput);
  const results = await Promise.allSettled([
    getAccountInfo(creds, opts),
    getOrders(creds, opts),
  ]);
  const [accountResult, ordersResult] = results;
  if (accountResult.status === 'rejected') throw accountResult.reason;
  const rawAccount = accountResult.value || {};
  const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
  if (ordersResult.status === 'rejected' && !isRetryableReadError(ordersResult.reason)) {
    throw ordersResult.reason;
  }
  return {
    account: formatAccount(rawAccount),
    positions: formatPositionsFromAccountInfo(rawAccount),
    orders,
    partial: ordersResult.status === 'rejected',
    warnings: ordersResult.status === 'rejected'
      ? [{ source: 'orders', message: ordersResult.reason?.message || 'Hibachi orders unavailable', status: ordersResult.reason?.status || null }]
      : [],
  };
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
    ? roundPriceToTick(args.triggerPrice ?? args.trigger_price, contract.tickSize)
    : null;
  if (triggerPrice != null) checkTickSize(triggerPrice, contract.tickSize);
  const triggerDirection = normalizeTriggerDirection(args.triggerDirection || args.trigger_direction);
  if (triggerPrice != null && !triggerDirection) {
    throw new Error('Hibachi triggerDirection must be HIGH or LOW for trigger orders');
  }
  const orderFlags = normalizeOrderFlags(args);
  const parentOrder = normalizeParentOrder(args);
  const nonce = hibachiNonce();
  const maxFeesPercent = decimalText(args.maxFeesPercent || HIBACHI_MAX_FEES_PERCENT);
  const parentBody = signedOrderRequest(creds, {
    nonce,
    contract,
    symbol,
    quantity,
    hibachiSide,
    price,
    triggerPrice,
    triggerDirection,
    parentOrder,
    orderFlags,
    maxFeesPercent,
  });
  parentBody.orderType = orderType;
  const tpslLegs = triggerPrice == null && (args.attachedTpsl || args.attached_tpsl || args.takeProfit || args.take_profit || args.tp || args.stopLoss || args.stop_loss || args.sl)
    ? attachedTpslLegs(args, hibachiSide)
    : [];
  tpslLegs.forEach((leg) => {
    leg.triggerPrice = roundPriceToTick(leg.triggerPrice, contract.tickSize);
  });
  tpslLegs.forEach(leg => checkTickSize(leg.triggerPrice, contract.tickSize));
  let result;
  if (tpslLegs.length) {
    const orders = [{ ...parentBody, action: 'place' }];
    tpslLegs.forEach((leg, index) => {
      orders.push({ ...signedOrderRequest(creds, {
        nonce: nonce + index + 1,
        contract,
        symbol,
        quantity,
        hibachiSide: leg.side,
        triggerPrice: leg.triggerPrice,
        triggerDirection: leg.triggerDirection,
        parentOrder: { nonce: String(nonce) },
        orderFlags: 'REDUCE_ONLY',
        maxFeesPercent,
      }), action: 'place' });
    });
    result = decorateBatchOrderResult(await authedSend('POST', '/trade/orders', {
      accountId: creds.accountId,
      orders,
    }, creds), nonce);
  } else {
    result = await authedSend('POST', '/trade/order', {
      accountId: creds.accountId,
      ...parentBody,
    }, creds);
  }
  invalidatePrivateReadsAfterMutation(creds);
  accountStream(creds).markStale({ clearSnapshot: true });
  return result && typeof result === 'object'
    ? { ...result, _clash_nonce: String(nonce) }
    : result;
}

async function getOrderStatus(credsInput, { orderId, nonce, startTime, endTime } = {}) {
  const creds = credentials(credsInput);
  const wanted = String(firstPresent(orderId, nonce, '')).trim();
  if (!wanted) throw new Error('Hibachi orderId or nonce required');

  const openOrders = await getOrders(creds, { forceLive: true });
  const open = openOrders.find(o => String(o.order_id || '') === wanted || String(o._raw?.nonce || '') === wanted);
  if (open) {
    return {
      found: true,
      status: 'open',
      order_id: String(open.order_id || wanted),
      source: 'open_orders',
      order: open,
    };
  }

  const endMs = Number.isFinite(Number(endTime)) ? Number(endTime) : Date.now() + 30_000;
  const startMs = Number.isFinite(Number(startTime)) ? Number(startTime) : endMs - 10 * 60_000;
  const j = await cachedAuthedGet(ordersHistoryPath(creds, { startTime: startMs, endTime: endMs }), creds, {
    forceLive: true,
    allowStale: false,
    ttlMs: 0,
  });
  const history = rows(j?.orders || j);
  const terminal = history.find(o => orderIdentifier(o) === wanted || String(o?.nonce || '') === wanted);
  if (!terminal) {
    return { found: false, status: 'not_found', order_id: wanted, source: 'orders_history' };
  }

  const rawStatus = rawOrderStatus(terminal);
  const status = /reject/u.test(rawStatus)
    ? 'rejected'
    : /cancel/u.test(rawStatus)
      ? 'cancelled'
      : /fill/u.test(rawStatus)
        ? 'filled'
        : (rawStatus || 'terminal');
  return {
    found: true,
    status,
    raw_status: rawStatus,
    order_id: orderIdentifier(terminal) || wanted,
    source: 'orders_history',
    reason: firstPresent(terminal.reason, terminal.rejectReason, terminal.reject_reason, terminal.message, terminal.error, null),
    order: terminal,
  };
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
  invalidatePrivateReadsAfterMutation(creds);
  accountStream(creds).markStale({ clearSnapshot: true });
  return result;
}

function normalizeTrade(accountId, trade) {
  const notional = Math.abs(num(trade.price) * num(trade.quantity));
  // Store every positive exchange fill for exact account/tournament volume.
  // The main rewards service applies its own $10 anti-spam threshold when
  // awarding gold; filtering here made legitimate partial fills disappear
  // from the leaderboard as well.
  if (!trade?.symbol || !Number.isFinite(notional) || notional <= 0 || notional > 10_000_000) return null;
  const sideText = String(trade.side || '').toUpperCase();
  const side = sideText === 'ASK' || sideText === 'SELL' ? 'short' : 'long';
  const id = trade.id ?? trade.tradeId ?? `${trade.bidOrderId || ''}:${trade.askOrderId || ''}:${trade.timestamp || ''}`;
  const orderId = String(trade.bidAccountId) === String(accountId) ? trade.bidOrderId : trade.askOrderId;
  const createdAt = timestampIso(trade.timestamp);
  return {
    symbol: symbolOf(trade.symbol),
    side,
    orderType: String(trade.orderType || '').toLowerCase() || 'market',
    amount: String(Math.abs(num(trade.quantity))),
    price: String(trade.price || ''),
    orderId: orderId == null ? null : String(orderId),
    clientOrderId: `hibachi:${accountId}:${id}`,
    status: 'filled',
    dex: 'hibachi',
    notional_usd: notional,
    verifiedSource: 'hibachi_api',
    pnl: trade.realizedPnl != null ? String(trade.realizedPnl) : null,
    fee: trade.fee != null ? String(trade.fee) : null,
    createdAt,
    created_at: createdAt,
    source: 'trades',
    _raw: trade,
  };
}

function normalizeOrderHistoryTrade(accountId, order) {
  const status = String(order?.status || order?.orderStatus || order?.order_status || '').toLowerCase();
  const filledLike = /filled/u.test(status);
  const rejectedLike = /rejected/u.test(status);
  const quantity = Math.abs(num(
    order?.filledQuantity
      ?? order?.filled_quantity
      ?? order?.executedQuantity
      ?? order?.executed_quantity
      ?? order?.matchedQuantity
      ?? order?.matched_quantity
      ?? (filledLike ? (order?.quantity ?? order?.totalQuantity ?? order?.total_quantity) : null),
  ));
  if (!(quantity > 0) || rejectedLike) return null;

  const symbol = order?.symbol ?? order?.marketSymbol ?? order?.market_symbol ?? order?.contract?.symbol;
  const price = num(
    order?.avgFillPrice
      ?? order?.avg_fill_price
      ?? order?.averagePrice
      ?? order?.average_price
      ?? order?.avgPrice
      ?? order?.avg_price
      ?? order?.executedPrice
      ?? order?.executed_price
      ?? order?.fillPrice
      ?? order?.fill_price
      ?? order?.price,
    NaN,
  );
  const providedNotional = num(
    order?.notional
      ?? order?.notionalUsd
      ?? order?.notional_usd
      ?? order?.executedNotional
      ?? order?.executed_notional
      ?? order?.filledNotional
      ?? order?.filled_notional,
    NaN,
  );
  const notional = Number.isFinite(providedNotional) && providedNotional > 0
    ? Math.abs(providedNotional)
    : Math.abs(price * quantity);
  if (!symbol || !Number.isFinite(notional) || notional <= 0 || notional > 10_000_000) return null;

  const sideText = String(order?.side || order?.orderSide || order?.order_side || '').toUpperCase();
  const side = /ASK|SELL|SHORT/u.test(sideText) ? 'short' : 'long';
  const id = order?.orderId
    ?? order?.order_id
    ?? order?.id
    ?? order?.clientOrderId
    ?? order?.client_order_id
    ?? order?.nonce
    ?? `${symbol}:${side}:${timestampMs(order?.closedAt ?? order?.closeTime ?? order?.timestamp) || Date.now()}:${quantity}:${price}`;
  const createdAt = timestampIso(order?.closedAt ?? order?.closed_at ?? order?.closeTime ?? order?.close_time ?? order?.updatedAt ?? order?.updated_at ?? order?.timestamp ?? order?.createdAt ?? order?.created_at);
  return {
    symbol: symbolOf(symbol),
    side,
    orderType: String(order?.orderType || order?.order_type || '').toLowerCase() || 'market',
    amount: String(quantity),
    price: Number.isFinite(price) ? String(price) : '',
    orderId: String(id),
    clientOrderId: `hibachi:${accountId}:${id}`,
    status: filledLike ? 'filled' : (status || 'filled'),
    dex: 'hibachi',
    notional_usd: notional,
    verifiedSource: 'hibachi_api',
    pnl: order?.realizedPnl != null ? String(order.realizedPnl) : (order?.realized_pnl != null ? String(order.realized_pnl) : null),
    fee: order?.fee != null ? String(order.fee) : (order?.totalFee != null ? String(order.totalFee) : null),
    createdAt,
    created_at: createdAt,
    source: 'orders_history',
    rewardDuplicate: 1,
    _raw: order,
  };
}

function dedupeTradeRows(list) {
  const seenExecutions = new Set();
  const executionOrders = new Set();
  const executions = [];
  const aggregates = [];
  for (const row of Array.isArray(list) ? list : []) {
    if (!row) continue;
    if (row.source === 'trades') {
      const key = row.clientOrderId
        ? `client:${row.clientOrderId}`
        : `shape:${row.symbol}:${row.side}:${row.created_at}:${row.amount}:${row.price}`;
      if (seenExecutions.has(key)) continue;
      seenExecutions.add(key);
      if (row.orderId != null && row.orderId !== '') executionOrders.add(String(row.orderId));
      executions.push(row);
    } else {
      aggregates.push(row);
    }
  }
  const seenAggregateOrders = new Set();
  const fallbackAggregates = aggregates.filter((row) => {
    const orderId = row.orderId == null ? '' : String(row.orderId);
    if (orderId && (executionOrders.has(orderId) || seenAggregateOrders.has(orderId))) return false;
    if (orderId) seenAggregateOrders.add(orderId);
    return true;
  });
  return [...executions, ...fallbackAggregates];
}

async function getAccountExecutionHistory(credsInput, {
  limit = HIBACHI_FILL_LOOKBACK_LIMIT,
  startTime,
  endTime,
} = {}) {
  const creds = credentials(credsInput);
  const max = Math.max(1, Math.min(HIBACHI_FILL_BACKFILL_MAX, Number(limit) || HIBACHI_FILL_LOOKBACK_LIMIT));
  const endMs = Number.isFinite(Number(endTime)) ? Number(endTime) : Date.now();
  const startMs = Number.isFinite(Number(startTime)) ? Number(startTime) : endMs - HIBACHI_FILL_LOOKBACK_MS;
  const out = [];
  const pageSignatures = new Set();
  const maxPages = Math.min(100, Math.max(1, Math.ceil(max / HIBACHI_TRADES_PAGE_SIZE)));

  for (let page = 0; page < maxPages && out.length < max; page += 1) {
    const j = await cachedAuthedGet(tradesPath(creds, { page }), creds, {
      ttlMs: 1_500,
      staleMs: 15_000,
    });
    const pageRows = rows(j?.trades || j);
    if (!pageRows.length) break;
    const signature = pageRows
      .slice(0, 3)
      .map((trade) => String(
        trade?.id
        ?? trade?.tradeId
        ?? `${trade?.bidOrderId || ''}:${trade?.askOrderId || ''}:${trade?.timestamp || ''}`,
      ))
      .join(':');
    if (pageSignatures.has(signature)) break;
    pageSignatures.add(signature);

    const normalized = pageRows
      .map((trade) => normalizeTrade(creds.accountId, trade))
      .filter(Boolean)
      .filter((trade) => {
        const at = timestampMs(trade.created_at);
        return at == null || (at >= startMs && at <= endMs);
      });
    out.push(...normalized);

    const pageTimes = pageRows.map((trade) => timestampMs(trade?.timestamp)).filter(Number.isFinite);
    if (pageTimes.length && Math.max(...pageTimes) < startMs) break;
    if (pageRows.length < HIBACHI_TRADES_PAGE_SIZE) break;
  }
  return dedupeTradeRows(out).slice(0, max);
}

async function getAccountOrderHistory(credsInput, {
  limit = HIBACHI_FILL_LOOKBACK_LIMIT,
  startTime,
  endTime,
} = {}) {
  const creds = credentials(credsInput);
  const max = Math.max(1, Math.min(HIBACHI_FILL_BACKFILL_MAX, Number(limit) || HIBACHI_FILL_LOOKBACK_LIMIT));
  const endMs = Number.isFinite(Number(endTime)) ? Number(endTime) : Date.now();
  const startMs = Number.isFinite(Number(startTime)) ? Number(startTime) : endMs - HIBACHI_FILL_LOOKBACK_MS;
  const out = [];
  let cursorOrderId = null;
  // The account-trades endpoint exposes only a short recent window.  Walk the
  // order-history cursor far enough to reconstruct a full seven-day volume
  // window when the caller explicitly requests a catch-up, while keeping a
  // hard request/row bound for rate-limit safety.
  const maxPages = Math.min(100, Math.max(4, Math.ceil(max / 50) + 2));
  for (let page = 0; page < maxPages && out.length < max; page++) {
    const path = ordersHistoryPath(creds, { startTime: startMs, endTime: endMs, cursorOrderId });
    const j = await cachedAuthedGet(path, creds, {
      ttlMs: 1_500,
      staleMs: 15_000,
    });
    const pageRows = rows(j?.orders || j);
    if (!pageRows.length) break;
    out.push(...pageRows.map(t => normalizeOrderHistoryTrade(creds.accountId, t)).filter(Boolean));
    const last = pageRows[pageRows.length - 1];
    const nextCursor = last?.orderId ?? last?.order_id ?? last?.id;
    if (!nextCursor || String(nextCursor) === String(cursorOrderId)) break;
    cursorOrderId = nextCursor;
  }
  return out.slice(0, max);
}

async function getAccountTradeHistory(credsInput, {
  limit = HIBACHI_FILL_LOOKBACK_LIMIT,
  startTime,
  endTime,
  requireExecutions = false,
} = {}) {
  const creds = credentials(credsInput);
  const max = Math.max(1, Math.min(HIBACHI_FILL_BACKFILL_MAX, Number(limit) || HIBACHI_FILL_LOOKBACK_LIMIT));
  const [tradesResult, ordersResult] = await Promise.allSettled([
    getAccountExecutionHistory(creds, { limit: max, startTime, endTime }),
    getAccountOrderHistory(creds, { limit: max, startTime, endTime }),
  ]);

  if (tradesResult.status === 'rejected' && (requireExecutions || ordersResult.status === 'rejected')) {
    throw tradesResult.reason || ordersResult.reason;
  }
  const combined = [
    ...(tradesResult.status === 'fulfilled' ? tradesResult.value : []),
    ...(ordersResult.status === 'fulfilled' ? ordersResult.value : []),
  ];
  return dedupeTradeRows(combined).slice(0, max);
}

function normalizedHibachiAccountId(accountId) {
  const value = String(accountId ?? '').trim();
  if (!/^\d+$/u.test(value)) throw new Error('Valid Hibachi accountId required for trade attribution');
  return value;
}

function resolveHibachiAccountOwner(dbModule, requestedPlayerId, accountId) {
  const normalizedAccountId = normalizedHibachiAccountId(accountId);
  const normalizedPlayerId = String(requestedPlayerId || '').trim();
  if (!normalizedPlayerId) throw new Error('Player id required for Hibachi trade attribution');

  const linked = dbModule.db.prepare(`
    SELECT account_id, player_id, linked_at, last_verified_at
    FROM hibachi_account_links
    WHERE account_id = ?
  `).get(normalizedAccountId);

  let ownerId = linked?.player_id || null;
  if (!ownerId) {
    const owners = dbModule.db.prepare(`
      SELECT DISTINCT player_id
      FROM trade_history
      WHERE dex = 'hibachi'
        AND client_order_id LIKE ?
      ORDER BY player_id
    `).all(`hibachi:${normalizedAccountId}:%`).map(row => String(row.player_id));
    if (owners.length > 1) {
      const error = new Error('This Hibachi account has trade history assigned to multiple Clash profiles. Contact support before syncing it again.');
      error.status = 409;
      error.code = 'HIBACHI_ACCOUNT_OWNER_CONFLICT';
      throw error;
    }
    ownerId = owners[0] || normalizedPlayerId;
    dbModule.db.prepare(`
      INSERT INTO hibachi_account_links (account_id, player_id, source)
      VALUES (?, ?, 'hibachi_api')
      ON CONFLICT(account_id) DO NOTHING
    `).run(normalizedAccountId, ownerId);
    ownerId = String(dbModule.db.prepare(`
      SELECT player_id FROM hibachi_account_links WHERE account_id = ?
    `).get(normalizedAccountId)?.player_id || ownerId);
  }

  if (ownerId !== normalizedPlayerId) {
    const error = new Error('This Hibachi trading account is already linked to another Clash profile. Open the original profile or ask support to merge the accounts.');
    error.status = 409;
    error.code = 'HIBACHI_ACCOUNT_LINKED';
    error.accountId = normalizedAccountId;
    error.ownerPlayerId = ownerId;
    throw error;
  }

  dbModule.db.prepare(`
    UPDATE hibachi_account_links
    SET last_verified_at = datetime('now')
    WHERE account_id = ? AND player_id = ?
  `).run(normalizedAccountId, normalizedPlayerId);
  return { accountId: normalizedAccountId, playerId: normalizedPlayerId };
}

function importNormalizedFillsForPlayer(playerId, accountId, fills, dbModule = require('./db')) {
  let owner;
  try {
    owner = resolveHibachiAccountOwner(dbModule, playerId, accountId);
  } catch (e) {
    return {
      ok: false,
      imported: 0,
      updated: 0,
      adopted: 0,
      skipped: Array.isArray(fills) ? fills.length : 0,
      total: Array.isArray(fills) ? fills.length : 0,
      status: e.status || 409,
      code: e.code || 'HIBACHI_ACCOUNT_LINK_FAILED',
      retryable: false,
      error: e.message,
      attribution: 'hibachi_api_no_builder_code',
    };
  }
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  // Volume is credited exclusively from execution rows. Order-history rows
  // are aggregates and are kept only as a read/display fallback; importing
  // both representations is what previously doubled some tournament volume.
  const orderedFills = [...(Array.isArray(fills) ? fills : [])].sort((a, b) => {
    const priority = row => row?.source === 'trades' ? 0 : 1;
    return priority(a) - priority(b);
  });
  for (const trade of orderedFills) {
    try {
      if (trade?.source !== 'trades') {
        skipped++;
        continue;
      }
      const before = dbModule.db.prepare(`
        SELECT id, player_id FROM trade_history
        WHERE dex = 'hibachi'
          AND client_order_id = ?
        LIMIT 1
      `).get(trade.clientOrderId);
      if (before && String(before.player_id) !== owner.playerId) {
        console.warn(`[hibachi] refused to reassign verified trade ${trade.clientOrderId} from ${before.player_id} to ${owner.playerId}`);
        skipped++;
        continue;
      }
      const r = dbModule.upsertVerifiedTrade(owner.playerId, trade);
      if (r?.inserted) imported += r.inserted;
      else if (r?.updated) updated += r.updated;
      else skipped++;
    } catch (e) {
      skipped++;
      if (!/UNIQUE|constraint/i.test(e.message || '')) {
        console.warn('[hibachi] addTrade failed:', e.message);
      }
    }
  }
  return {
    ok: true,
    imported,
    updated,
    adopted: 0,
    skipped,
    total: Array.isArray(fills) ? fills.length : 0,
    accountId: owner.accountId,
    attribution: 'hibachi_api_no_builder_code',
  };
}

async function importFillsForPlayer(playerId, credsInput, opts = {}) {
  const creds = credentials(credsInput);
  let fills = [];
  try {
    fills = await getAccountTradeHistory(creds, { ...opts, requireExecutions: true });
  } catch (e) {
    console.warn('[hibachi] trade history import read failed:', e.message);
    return {
      ok: false,
      imported: 0,
      updated: 0,
      adopted: 0,
      skipped: 0,
      total: 0,
      status: e.status || null,
      retryable: isRetryableReadError(e),
      error: e.message || 'Hibachi trade history unavailable',
      attribution: 'hibachi_api_no_builder_code',
    };
  }
  return importNormalizedFillsForPlayer(playerId, creds.accountId, fills);
}

function resetCachesForTests() {
  for (const cache of [inventoryCache, exchangeInfoCache, contractMapCache]) {
    cache.at = 0;
    cache.payload = null;
    if ('promise' in cache) cache.promise = null;
    if ('retryAt' in cache) cache.retryAt = 0;
  }
  marketDataCache.clear();
  privateReadCache.clear();
  restRateGate.timestamps.length = 0;
  restRateGate.queue.length = 0;
  if (restRateGate.timer) clearTimeout(restRateGate.timer);
  restRateGate.timer = null;
  hibachiProxyPool.resetForTests();
}

module.exports = {
  HIBACHI_API,
  HIBACHI_DATA_API,
  HIBACHI_IP_BLOCKED_MESSAGE,
  HIBACHI_RATE_LIMITED_MESSAGE,
  HIBACHI_TRADING_PERMISSION_REQUIRED_MESSAGE,
  credentials,
  isIpBlockedError,
  isRateLimitedError,
  isTradingPermissionError,
  getMarketInfo,
  getPrices,
  getSnapshot,
  getAccount,
  getPositions,
  getOrders,
  getOrderStatus,
  placeOrder,
  cancelOrder,
  getAccountTradeHistory,
  importFillsForPlayer,
  __testing: {
    resetCaches: resetCachesForTests,
    proxyPoolStats: () => hibachiProxyPool.stats(),
    normalizeTrade,
    normalizeOrderHistoryTrade,
    parseHibachiJson,
    tradesPath,
    dedupeTradeRows,
    importNormalizedFillsForPlayer,
    resolveHibachiAccountOwner,
  },
};
