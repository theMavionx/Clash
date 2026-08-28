const { createPublicClient, fallback, formatEther, formatUnits, http } = require('viem');
const { base } = require('viem/chains');
const db = require('./db');

const DOMFI_CHAIN_ID = 8453;
const DOMFI_API_BASE = String(
  process.env.DOMFI_API_URL || 'https://api.domination.finance/api/v2',
).replace(/\/+$/u, '');
const DOMFI_REFERRAL_API_BASE = String(
  process.env.DOMFI_REFERRAL_API_URL || 'https://api.domination.finance/api',
).replace(/\/+$/u, '');
const DOMFI_REFERRAL_CODE = String(
  process.env.DOMFI_REFERRAL_CODE || 'CLASHOFPERPS',
).trim().toUpperCase();
const DOMFI_REFERRAL_URL = String(
  process.env.DOMFI_REFERRAL_URL || 'https://app.domination.finance/ref/CLASHOFPERPS',
).trim();
const DOMFI_REGISTRY = '0xe438360464EaDa40b7921C993322bD4dA8881103';
const DOMFI_TRADING = '0x7447cb5350a096364A13bEAf77916dfB35db9445';
const DOMFI_TRADING_STORAGE = '0x608ff95777F419040a3b1E42ed73dD3EFf42Cc24';
const DOMFI_PAIRS_STORAGE = '0x444079DDCaFd4feE3812E2fF79c5F74a1F4f9Be1';
const DOMFI_PAIR_INFOS = '0x256fD248cDc91A6B098eEE2580f313fdCaFa2059';
const DOMFI_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const FETCH_TIMEOUT_MS = Math.max(1_000, Math.min(20_000, Number(process.env.DOMFI_FETCH_TIMEOUT_MS || 8_000)));
const CACHE_TTL_MS = Math.max(1_000, Math.min(60_000, Number(process.env.DOMFI_CACHE_TTL_MS || 10_000)));
const STALE_TTL_MS = Math.max(CACHE_TTL_MS, Math.min(30 * 60_000, Number(process.env.DOMFI_STALE_TTL_MS || 5 * 60_000)));
const IMPORT_LIMIT = Math.max(10, Math.min(250, Number(process.env.DOMFI_IMPORT_LIMIT || 100)));
const WALLET_BALANCE_CACHE_TTL_MS = Math.max(5_000, Math.min(60_000, Number(process.env.DOMFI_WALLET_BALANCE_CACHE_TTL_MS || 15_000)));
const WALLET_BALANCE_STALE_TTL_MS = Math.max(
  WALLET_BALANCE_CACHE_TTL_MS,
  Math.min(10 * 60_000, Number(process.env.DOMFI_WALLET_BALANCE_STALE_TTL_MS || 2 * 60_000)),
);
const WALLET_BALANCE_CACHE_MAX = Math.max(50, Math.min(2_000, Number(process.env.DOMFI_WALLET_BALANCE_CACHE_MAX || 500)));
const RPC_TIMEOUT_MS = Math.max(2_000, Math.min(15_000, Number(process.env.DOMFI_RPC_TIMEOUT_MS || 7_000)));
const WALLET_BALANCE_BUDGET_MS = Math.max(2_000, Math.min(12_000, Number(process.env.DOMFI_WALLET_BALANCE_BUDGET_MS || 6_000)));

const DOMFI_ERC20_BALANCE_ABI = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ type: 'uint256' }],
}];

function splitList(value) {
  return String(value || '')
    .split(/[,\s]+/u)
    .map(entry => entry.trim())
    .filter(Boolean);
}

const baseAlchemyKey = String(process.env.BASE_ALCHEMY_KEY || process.env.ALCHEMY_BASE_API_KEY || '').trim();
const baseAlchemyRpc = baseAlchemyKey
  ? `https://base-mainnet.g.alchemy.com/v2/${encodeURIComponent(baseAlchemyKey)}`
  : '';
const DOMFI_BASE_RPC_URLS = Array.from(new Set([
  ...splitList(
    process.env.DOMFI_BASE_RPC_URLS
      || process.env.DOMFI_BASE_RPC_URL
      || process.env.BASE_RPC_URLS
      || process.env.BASE_RPC_URL
      || process.env.VITE_BASE_RPC_URLS
      || process.env.VITE_BASE_RPC_URL,
  ),
  baseAlchemyRpc,
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
].filter(value => /^https?:\/\//iu.test(value))));

function baseRpcTransport() {
  const transports = DOMFI_BASE_RPC_URLS.map(url => http(url, { retryCount: 1, timeout: RPC_TIMEOUT_MS }));
  if (transports.length === 1) return transports[0];
  return fallback(transports, { rank: false, retryCount: 0 });
}

const basePublicClient = createPublicClient({
  chain: base,
  transport: baseRpcTransport(),
});

let marketCache = { at: 0, rows: [] };
let priceCache = { at: 0, rows: [] };
let marketStateCache = { at: 0, byPair: new Map() };
let referralCache = { at: 0, value: null };
const walletBalanceCache = new Map();
const walletBalanceInFlight = new Map();

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

function normalizeAddress(value) {
  const text = String(value || '').trim();
  return isEvmAddress(text) ? text.toLowerCase() : null;
}

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function scaled(value, decimals) {
  return numeric(value) / (10 ** decimals);
}

function trimNumber(value, decimals = 8) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(decimals).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
}

function isoFromUnixMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n > 1e12 ? n : n * 1000).toISOString();
}

function requestError(message, status, payload) {
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const apiError = payload?.error && typeof payload.error === 'object' ? payload.error : null;
      throw requestError(
        apiError?.message || payload?.detail || payload?.error || payload?.message || `DomFi HTTP ${response.status}`,
        response.status,
        payload,
      );
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw requestError('DomFi request timed out', 504, null);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function unwrapData(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
  return payload;
}

async function api(pathname, query = null) {
  const url = new URL(`${DOMFI_API_BASE}${pathname}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const payload = await fetchJson(url.toString());
  if (String(payload?.readiness?.status || '').toLowerCase() === 'unsafe') {
    throw requestError('DomFi read model is unsafe', 503, {
      unsafe_reasons: payload.readiness.unsafe_reasons || [],
      degraded_reasons: payload.readiness.degraded_reasons || [],
    });
  }
  return payload;
}

async function referralApi(pathname, { allowNotFound = false } = {}) {
  try {
    return await fetchJson(`${DOMFI_REFERRAL_API_BASE}${pathname}`);
  } catch (error) {
    if (allowNotFound && Number(error?.status) === 404) return null;
    throw error;
  }
}

function normalizeMarket(raw) {
  const symbol = String(raw?.base_symbol || raw?.price_asset || raw?.symbol || '')
    .replace(/USD$/u, '')
    .toUpperCase();
  if (!symbol || raw?.is_listed === false || raw?.is_done === true) return null;
  const minLeverage = scaled(raw?.constraints?.min_leverage, 2) || 1;
  const maxLeverage = scaled(raw?.constraints?.max_leverage, 2) || 1;
  return {
    symbol,
    base: symbol,
    pair: `${symbol}/USD`,
    pair_index: Number(raw.pair_index),
    market_id: Number(raw.pair_index),
    price_asset: String(raw?.price_asset || symbol),
    lot_size: '0.0001',
    tick_size: '0.0001',
    min_order_size: trimNumber(scaled(raw?.constraints?.min_lev_position, 6), 6),
    min_notional_usd: scaled(raw?.constraints?.min_lev_position, 6),
    max_collateral_usd: scaled(raw?.constraints?.max_allowed_collateral, 6),
    max_slippage_pct: numeric(raw?.constraints?.max_sl_p) / 100,
    min_leverage: minLeverage,
    max_leverage: maxLeverage,
    oracle_fee_usdc: scaled(raw?.oracle_fee_wei, 6),
    is_paused: !!raw?.is_paused,
    status: raw?.is_paused ? 'paused' : 'active',
    contracts: raw?.contracts || {},
    constraints: raw?.constraints || {},
    fees: raw?.fees || {},
    _raw: raw,
  };
}

async function getMarketStates(markets, options = {}) {
  const now = Date.now();
  if (!options.force && marketStateCache.byPair.size && now - marketStateCache.at < 30_000) {
    return marketStateCache.byPair;
  }
  const settled = await Promise.allSettled(markets.map(market => api(`/markets/${market.pair_index}/state`)));
  const byPair = new Map();
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const state = unwrapData(result.value);
    if (state && typeof state === 'object') byPair.set(Number(markets[index].pair_index), state);
  });
  if (byPair.size) marketStateCache = { at: now, byPair };
  return byPair.size ? byPair : marketStateCache.byPair;
}

async function getMarketInfo(options = {}) {
  const now = Date.now();
  if (!options.force && marketCache.rows.length && now - marketCache.at < CACHE_TTL_MS) return marketCache.rows;
  try {
    const payload = await api('/markets');
    const baseRows = (Array.isArray(unwrapData(payload)) ? unwrapData(payload) : [])
      .map(normalizeMarket)
      .filter(Boolean);
    const states = await getMarketStates(baseRows, options);
    const rows = baseRows.map(row => {
      const state = states.get(Number(row.pair_index)) || null;
      return state ? {
        ...row,
        funding_rate: numeric(state.funding_rate_8h),
        next_funding_rate: numeric(state.funding_rate_8h),
        funding_interval_hours: 8,
        volume_24h: numeric(state.volume_24h),
        cumulative_volume: numeric(state.cumulative_volume),
        open_interest: numeric(state.oi_long) + numeric(state.oi_short),
        open_interest_long: numeric(state.oi_long),
        open_interest_short: numeric(state.oi_short),
        _state: state,
      } : row;
    });
    if (!rows.length) throw new Error('DomFi returned no active markets');
    marketCache = { at: now, rows };
    return rows;
  } catch (error) {
    if (marketCache.rows.length && now - marketCache.at < STALE_TTL_MS) {
      return marketCache.rows.map(row => ({ ...row, stale_read: true }));
    }
    throw error;
  }
}

async function getPrices(options = {}) {
  const now = Date.now();
  if (!options.force && priceCache.rows.length && now - priceCache.at < CACHE_TTL_MS) return priceCache.rows;
  try {
    const [headPayload, markets] = await Promise.all([api('/prices/head'), getMarketInfo(options)]);
    const heads = Array.isArray(unwrapData(headPayload)) ? unwrapData(headPayload) : [];
    const headByAsset = new Map(heads.map(row => [String(row?.asset || '').toUpperCase(), row]));
    const rows = markets.map(market => {
      const head = headByAsset.get(String(market.price_asset || market.symbol).toUpperCase()) || {};
      return {
        symbol: market.symbol,
        pair_index: market.pair_index,
        mark: String(head.price || ''),
        oracle: String(head.price || ''),
        price: String(head.price || ''),
        timestamp: Number(head.block_timestamp || 0),
        volume_24h: numeric(market.volume_24h),
        open_interest: numeric(market.open_interest),
        funding_rate: numeric(market.funding_rate),
      };
    });
    priceCache = { at: now, rows };
    return rows;
  } catch (error) {
    if (priceCache.rows.length && now - priceCache.at < STALE_TTL_MS) {
      return priceCache.rows.map(row => ({ ...row, stale_read: true }));
    }
    throw error;
  }
}

function candleInterval(value) {
  const key = String(value || '5m').toLowerCase();
  return ({ '1': '1', '1m': '1', '5': '5', '5m': '5', '15': '15', '15m': '15', '60': '60', '1h': '60', '240': '240', '4h': '240', '1d': '1440', '1440': '1440' })[key] || '5';
}

async function getCandles(symbol, options = {}) {
  const markets = await getMarketInfo();
  const market = markets.find(row => row.symbol === String(symbol || '').toUpperCase());
  if (!market) throw requestError(`Unknown DomFi market: ${symbol}`, 400, null);
  const now = Date.now();
  const from = Number(options.from || options.start_time || now - 12 * 60 * 60_000);
  const to = Number(options.to || options.end_time || now);
  const payload = await api('/prices/candles', {
    asset: market.price_asset,
    pair_index: market.pair_index,
    from: Math.floor(from > 1e12 ? from : from * 1000),
    to: Math.floor(to > 1e12 ? to : to * 1000),
    interval: candleInterval(options.interval || options.resolution),
  });
  return (Array.isArray(unwrapData(payload)) ? unwrapData(payload) : []).map(row => ({
    time: Math.floor(Number(row.open_time || 0) / 1000),
    open: numeric(row.open),
    high: numeric(row.high),
    low: numeric(row.low),
    close: numeric(row.close ?? row.head_price ?? row.open),
  })).filter(row => row.time > 0 && row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0);
}

async function rawPositions(address, options = {}) {
  const wallet = normalizeAddress(address);
  if (!wallet) throw requestError('valid EVM address required', 400, null);
  const payload = await api(`/accounts/${wallet}/positions`, { limit: Math.max(1, Math.min(100, Number(options.limit || 100))) });
  return Array.isArray(unwrapData(payload)) ? unwrapData(payload) : [];
}

async function rawOrders(address, options = {}) {
  const wallet = normalizeAddress(address);
  if (!wallet) throw requestError('valid EVM address required', 400, null);
  const payload = await api(`/accounts/${wallet}/orders`, { limit: Math.max(1, Math.min(100, Number(options.limit || 100))) });
  return Array.isArray(unwrapData(payload)) ? unwrapData(payload) : [];
}

function marketSymbol(pairIndex, markets) {
  return markets.find(row => Number(row.pair_index) === Number(pairIndex))?.symbol || `PAIR-${pairIndex}`;
}

function normalizePosition(raw, markets, prices) {
  if (String(raw?.kind || '') !== 'open_position' || raw?.pair_index == null || raw?.index == null) return null;
  const symbol = marketSymbol(raw.pair_index, markets);
  const entry = scaled(raw.open_price, 18);
  const collateral = scaled(raw.collateral, 6);
  const leverage = scaled(raw.leverage, 2);
  const notional = raw.trade_notional != null ? scaled(raw.trade_notional, 18) : collateral * leverage;
  const amount = entry > 0 ? notional / entry : 0;
  const mark = numeric(prices.find(row => row.symbol === symbol)?.mark, entry);
  const isLong = raw.buy_side === true;
  const pnl = entry > 0 && mark > 0 ? (mark - entry) * amount * (isLong ? 1 : -1) : 0;
  return {
    symbol,
    side: isLong ? 'bid' : 'ask',
    amount: trimNumber(amount, 10),
    size: trimNumber(amount, 10),
    size_usd: notional,
    margin: collateral,
    leverage,
    entry_price: entry,
    mark_price: mark,
    pnl_usd: pnl,
    liquidation_price: null,
    take_profit: scaled(raw.tp, 18) || null,
    stop_loss: scaled(raw.sl, 18) || null,
    pair_index: Number(raw.pair_index),
    trade_index: Number(raw.index),
    trade_id: raw.trade_id == null ? null : String(raw.trade_id),
    is_isolated: true,
    _raw: raw,
  };
}

function normalizePendingOrder(raw, markets) {
  const eventType = String(raw?.event_type || '').toLowerCase();
  const isCancelableOpenLimit = eventType.includes('limit')
    && !/(cancel|execut|timeout|close)/u.test(eventType);
  if (String(raw?.kind || '') === 'open_position' || raw?.pair_index == null || !isCancelableOpenLimit) return null;
  const symbol = marketSymbol(raw.pair_index, markets);
  const collateral = scaled(raw.collateral, 6);
  const leverage = scaled(raw.leverage, 2);
  const targetPrice = scaled(raw.wanted_price ?? raw.open_price, 18);
  const orderId = raw.order_id ?? raw.limit_index ?? '';
  return {
    symbol,
    side: raw.buy_side === true ? 'bid' : 'ask',
    order_id: String(orderId),
    i: String(orderId),
    order_type: eventType.includes('stop') ? 'stop' : 'limit',
    price: targetPrice,
    limit_price: targetPrice,
    amount: targetPrice > 0 ? (collateral * leverage) / targetPrice : 0,
    margin: collateral,
    leverage,
    pair_index: Number(raw.pair_index),
    trade_index: raw.index == null ? null : Number(raw.index),
    limit_index: raw.limit_index == null ? raw.index : Number(raw.limit_index),
    take_profit: scaled(raw.tp, 18) || null,
    stop_loss: scaled(raw.sl, 18) || null,
    status: 'open',
    _raw: raw,
  };
}

async function getPositionsByAddress(address) {
  const [raw, markets, prices] = await Promise.all([rawPositions(address), getMarketInfo(), getPrices()]);
  return raw.map(row => normalizePosition(row, markets, prices)).filter(Boolean);
}

function normalizeOrders(positions, lifecycles, markets) {
  const lifecycleByOrderId = new Map(
    lifecycles
      .filter(row => row?.order_id != null)
      .map(row => [String(row.order_id), row]),
  );
  return positions.map(row => {
    const order = normalizePendingOrder(row, markets);
    if (!order) return null;
    const lifecycle = lifecycleByOrderId.get(order.order_id);
    const lifecycleType = String(lifecycle?.order_type || '').toLowerCase();
    if (lifecycle && (
      !lifecycle.is_pending
      || lifecycle.is_cancelled
      || String(lifecycle.action || '').toLowerCase() !== 'open'
      || (!lifecycleType.includes('limit') && !lifecycle.trigger_order_type)
    )) return null;
    return lifecycle ? {
      ...order,
      status: String(lifecycle.status || 'open'),
      initiated_tx_hash: lifecycle.initiated_tx_hash || row.transaction_hash || null,
      _lifecycle: lifecycle,
    } : order;
  }).filter(Boolean);
}

async function getOrdersByAddress(address) {
  const [positions, lifecycles, markets] = await Promise.all([
    rawPositions(address),
    rawOrders(address),
    getMarketInfo(),
  ]);
  return normalizeOrders(positions, lifecycles, markets);
}

function accountFromPositions(address, positions) {
  const wallet = normalizeAddress(address);
  if (!wallet) throw requestError('valid EVM address required', 400, null);
  return {
    address: wallet,
    account_value: positions.reduce((sum, row) => sum + numeric(row.margin), 0),
    margin_used: positions.reduce((sum, row) => sum + numeric(row.margin), 0),
    unrealized_pnl: positions.reduce((sum, row) => sum + numeric(row.pnl_usd), 0),
  };
}

async function getAccountByAddress(address) {
  const wallet = normalizeAddress(address);
  if (!wallet) throw requestError('valid EVM address required', 400, null);
  const positions = await getPositionsByAddress(wallet);
  return accountFromPositions(wallet, positions);
}

function pruneWalletBalanceCache() {
  while (walletBalanceCache.size > WALLET_BALANCE_CACHE_MAX) {
    const oldestKey = walletBalanceCache.keys().next().value;
    if (!oldestKey) break;
    walletBalanceCache.delete(oldestKey);
  }
}

function serializeWalletBalance(wallet, usdcRaw, ethWei, options = {}) {
  const normalizedUsdc = BigInt(usdcRaw);
  const normalizedEth = BigInt(ethWei);
  return {
    available: true,
    address: wallet,
    usdc_raw: normalizedUsdc.toString(),
    eth_wei: normalizedEth.toString(),
    usdc: Number(formatUnits(normalizedUsdc, 6)),
    eth: Number(formatEther(normalizedEth)),
    source: 'server_base_rpc',
    cache: options.cache || 'miss',
    stale: options.stale === true,
    fetched_at: options.fetchedAt || new Date().toISOString(),
  };
}

async function getWalletBalance(address, options = {}) {
  const wallet = normalizeAddress(address);
  if (!wallet) throw requestError('valid EVM address required', 400, null);
  const now = Date.now();
  const cached = walletBalanceCache.get(wallet);
  if (!options.force && cached && now - cached.at < WALLET_BALANCE_CACHE_TTL_MS) {
    return { ...cached.value, cache: 'hit', stale: false };
  }

  const customClient = options.client || null;
  if (!customClient && walletBalanceInFlight.has(wallet)) return walletBalanceInFlight.get(wallet);
  const client = customClient || basePublicClient;
  const readPromise = (async () => {
    try {
      const [usdcRaw, ethWei] = await Promise.all([
        client.readContract({
          address: DOMFI_USDC,
          abi: DOMFI_ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [wallet],
        }),
        client.getBalance({ address: wallet }),
      ]);
      const value = serializeWalletBalance(wallet, usdcRaw, ethWei);
      walletBalanceCache.delete(wallet);
      walletBalanceCache.set(wallet, { at: Date.now(), value });
      pruneWalletBalanceCache();
      return value;
    } catch (error) {
      if (cached && now - cached.at < WALLET_BALANCE_STALE_TTL_MS) {
        return { ...cached.value, cache: 'stale', stale: true };
      }
      throw error;
    }
  })();

  if (!customClient) walletBalanceInFlight.set(wallet, readPromise);
  try {
    return await readPromise;
  } finally {
    if (!customClient && walletBalanceInFlight.get(wallet) === readPromise) {
      walletBalanceInFlight.delete(wallet);
    }
  }
}

async function getWalletBalanceSafe(address, options = {}) {
  let timeoutId = null;
  try {
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('DomFi server balance read timed out')), WALLET_BALANCE_BUDGET_MS);
    });
    return await Promise.race([getWalletBalance(address, options), timeout]);
  } catch {
    return {
      available: false,
      address: normalizeAddress(address),
      source: 'server_base_rpc',
      cache: 'unavailable',
      stale: false,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function getAccountSnapshot(address) {
  const wallet = normalizeAddress(address);
  if (!wallet) throw requestError('valid EVM address required', 400, null);
  const walletBalancePromise = getWalletBalanceSafe(wallet);
  const [positionRows, lifecycleRows, markets] = await Promise.all([
    rawPositions(wallet),
    rawOrders(wallet),
    getMarketInfo(),
  ]);
  const prices = await getPrices();
  const positions = positionRows.map(row => normalizePosition(row, markets, prices)).filter(Boolean);
  const orders = normalizeOrders(positionRows, lifecycleRows, markets);
  return {
    account: accountFromPositions(wallet, positions),
    positions,
    orders,
    wallet_balance: await walletBalancePromise,
  };
}

async function getRawAccountTrades(address, options = {}) {
  const wallet = normalizeAddress(address);
  if (!wallet) throw requestError('valid EVM address required', 400, null);
  const payload = await api(`/accounts/${wallet}/trades`, { limit: Math.max(1, Math.min(250, Number(options.limit || IMPORT_LIMIT))) });
  return Array.isArray(unwrapData(payload)) ? unwrapData(payload) : [];
}

function normalizeTradeHistory(raw, markets) {
  const symbol = marketSymbol(raw.pair_index, markets);
  const notional = scaled(raw.trade_notional, 18);
  const leverage = scaled(raw.leverage, 2);
  const openPrice = scaled(raw.open_price, 18);
  const closePrice = raw.close_price == null ? null : scaled(raw.close_price, 18);
  const openedAt = isoFromUnixMs(raw.open_timestamp);
  const closedAt = isoFromUnixMs(raw.close_timestamp);
  const direction = raw.buy_side ? 'long' : 'short';
  const isClosed = !!closedAt || (closePrice != null && closePrice > 0) || /clos|sett|liquid/u.test(String(raw.status || '').toLowerCase());
  return {
    trade_id: String(raw.trade_id || ''),
    pair_index: Number(raw.pair_index),
    trade_index: Number(raw.trade_index || 0),
    symbol,
    direction,
    side: `${isClosed ? 'close' : 'open'}_${direction}`,
    action: `${isClosed ? 'close' : 'open'}_${direction}`,
    amount: openPrice > 0 ? notional / openPrice : 0,
    collateral: scaled(raw.collateral, 6),
    leverage,
    notional_usd: notional,
    price: isClosed && closePrice > 0 ? closePrice : openPrice,
    open_price: openPrice,
    close_price: closePrice,
    realized_pnl: raw.realized_pnl_usdc == null ? null : scaled(raw.realized_pnl_usdc, 6),
    realized_pnl_amount: raw.realized_pnl_usdc == null ? null : scaled(raw.realized_pnl_usdc, 6),
    funding_fee: raw.funding_fee == null ? null : scaled(raw.funding_fee, 6),
    status: String(raw.status || ''),
    open_tx_hash: raw.open_tx_hash || null,
    close_tx_hash: raw.close_tx_hash || null,
    opened_at: openedAt,
    closed_at: closedAt,
    created_at: closedAt || openedAt,
    timestamp: Number(raw.timestamp || raw.open_timestamp || 0),
    _raw: raw,
  };
}

async function getAccountTradeHistory(address, options = {}) {
  const [rows, markets] = await Promise.all([getRawAccountTrades(address, options), getMarketInfo()]);
  return rows.map(row => normalizeTradeHistory(row, markets));
}

async function getReferralCode(options = {}) {
  const now = Date.now();
  if (!options.force && referralCache.value && now - referralCache.at < 60_000) return referralCache.value;
  const raw = await referralApi(`/referrals/lookup/${encodeURIComponent(DOMFI_REFERRAL_CODE)}`);
  const value = {
    code_id: String(raw?.code_id ?? ''),
    code: String(raw?.code || DOMFI_REFERRAL_CODE).toUpperCase(),
    created_at: raw?.created_at || null,
  };
  if (!/^\d+$/u.test(value.code_id) || value.code !== DOMFI_REFERRAL_CODE) {
    throw requestError('DomFi Clash referral code lookup mismatch', 502, raw);
  }
  referralCache = { at: now, value };
  return value;
}

async function getReferralBinding(address) {
  const wallet = normalizeAddress(address);
  if (!wallet) throw requestError('valid EVM address required', 400, null);
  const raw = await referralApi(`/referrals/binding/${wallet}`, { allowNotFound: true });
  if (!raw) return null;
  return {
    referee: normalizeAddress(raw.referee) || wallet,
    code: String(raw.code || '').toUpperCase(),
    bound_at: raw.bound_at || null,
  };
}

async function getReferralStatus(address) {
  const [referral, binding] = await Promise.all([getReferralCode(), getReferralBinding(address)]);
  return {
    referral,
    binding,
    attach_on_next_open: binding == null,
    clash_referral: binding?.code === referral.code,
    preserves_existing: binding != null && binding.code !== referral.code,
  };
}

function tradeRowsForImport(wallet, trade) {
  const rows = [];
  const common = {
    symbol: trade.symbol,
    side: trade.direction,
    amount: trade.amount,
    price: trade.open_price,
    orderId: trade.open_tx_hash || trade.trade_id,
    status: 'filled',
    dex: 'domfi',
    notional_usd: trade.notional_usd,
    verifiedSource: 'domfi_api',
    proofJson: JSON.stringify({ wallet, trade: trade._raw, normalized: { trade_id: trade.trade_id, phase: 'open' } }),
    createdAt: trade.opened_at,
  };
  if (trade.opened_at) rows.push({ ...common, orderType: 'market', clientOrderId: `domfi:open:${wallet}:${trade.trade_id}` });
  if (trade.closed_at && trade.close_tx_hash) {
    rows.push({
      ...common,
      side: trade.direction === 'long' ? 'short' : 'long',
      orderType: 'close',
      price: trade.close_price || trade.open_price,
      orderId: trade.close_tx_hash,
      clientOrderId: `domfi:close:${wallet}:${trade.trade_id}`,
      pnl: trade.realized_pnl,
      fee: trade.funding_fee == null ? null : Math.abs(trade.funding_fee),
      proofJson: JSON.stringify({ wallet, trade: trade._raw, normalized: { trade_id: trade.trade_id, phase: 'close' } }),
      createdAt: trade.closed_at,
    });
  }
  return rows;
}

async function importFillsForPlayer(playerId, address, options = {}) {
  const wallet = normalizeAddress(address);
  if (!wallet) throw requestError('valid EVM address required', 400, null);
  const trades = await getAccountTradeHistory(wallet, { limit: options.limit || IMPORT_LIMIT });
  const sinceMs = options.since ? Date.parse(options.since) : 0;
  let imported = 0;
  let updated = 0;
  let volume = 0;
  for (const trade of trades) {
    for (const row of tradeRowsForImport(wallet, trade)) {
      const createdMs = Date.parse(row.createdAt || '');
      if (Number.isFinite(sinceMs) && sinceMs > 0 && (!Number.isFinite(createdMs) || createdMs < sinceMs)) continue;
      if (!(Number(row.notional_usd) > 0)) continue;
      const result = db.upsertVerifiedTrade(playerId, row);
      imported += Number(result.inserted || 0);
      updated += Number(result.updated || 0);
      if (result.inserted > 0) volume += Number(row.notional_usd || 0);
    }
  }
  return { ok: true, wallet, rows: trades.length, imported, updated, volume_usd: volume };
}

function config() {
  return {
    dex: 'domfi',
    chain_id: DOMFI_CHAIN_ID,
    api_base_url: DOMFI_API_BASE,
    referral_code: DOMFI_REFERRAL_CODE,
    referral_url: DOMFI_REFERRAL_URL,
    contracts: {
      registry: DOMFI_REGISTRY,
      trading: DOMFI_TRADING,
      trading_storage: DOMFI_TRADING_STORAGE,
      pairs_storage: DOMFI_PAIRS_STORAGE,
      pair_infos: DOMFI_PAIR_INFOS,
      collateral: DOMFI_USDC,
    },
  };
}

module.exports = {
  DOMFI_API_BASE,
  DOMFI_CHAIN_ID,
  DOMFI_PAIR_INFOS,
  DOMFI_PAIRS_STORAGE,
  DOMFI_REGISTRY,
  DOMFI_REFERRAL_CODE,
  DOMFI_REFERRAL_URL,
  DOMFI_TRADING,
  DOMFI_TRADING_STORAGE,
  DOMFI_USDC,
  api,
  config,
  getAccountByAddress,
  getAccountSnapshot,
  getAccountTradeHistory,
  getCandles,
  getMarketInfo,
  getOrdersByAddress,
  getPositionsByAddress,
  getPrices,
  getReferralBinding,
  getReferralCode,
  getReferralStatus,
  getWalletBalance,
  getWalletBalanceSafe,
  importFillsForPlayer,
  isEvmAddress,
  normalizeAddress,
  normalizeMarket,
  normalizePosition,
  normalizePendingOrder,
  normalizeTradeHistory,
  serializeWalletBalance,
  tradeRowsForImport,
};
