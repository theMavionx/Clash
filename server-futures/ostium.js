const db = require('./db');
const {
  CancelOrderType,
  OrderType,
  OstiumClient,
} = require('@ostium/builder-sdk');

const OSTIUM_CHAIN_ID = 42161;
const DEFAULT_OSTIUM_BUILDER_ADDRESS = '0xB36402e87a86206D3a114a98B53f31362291fe1B';
const OSTIUM_BUILDER_ADDRESS = String(
  process.env.OSTIUM_BUILDER_ADDRESS
  || process.env.VITE_OSTIUM_BUILDER_ADDRESS
  || DEFAULT_OSTIUM_BUILDER_ADDRESS,
).trim();
const OSTIUM_BUILDER_FEE_BPS = clampBuilderFee(
  process.env.OSTIUM_BUILDER_FEE_BPS
  || process.env.VITE_OSTIUM_BUILDER_FEE_BPS
  || 2,
);
const OSTIUM_FILL_LOOKBACK_LIMIT = Math.max(10, Math.min(250, Number(process.env.OSTIUM_FILL_LOOKBACK_LIMIT || 100)));
const OSTIUM_IMPORT_RETRY_DELAY_MS = Math.max(250, Math.min(5000, Number(process.env.OSTIUM_IMPORT_RETRY_DELAY_MS || 1500)));
const OSTIUM_RPC_URL = String(
  process.env.OSTIUM_ARBITRUM_RPC_URL
  || process.env.ARBITRUM_RPC_URL
  || process.env.ARB_RPC_URL
  || process.env.VITE_OSTIUM_ARBITRUM_RPC_URL
  || process.env.VITE_ARBITRUM_RPC_URL
  || '',
).trim();
const OSTIUM_SUBGRAPH_URL = String(process.env.OSTIUM_SUBGRAPH_URL || '').trim();
const OSTIUM_BUILDER_API_URL = String(process.env.OSTIUM_BUILDER_API_URL || '').trim();

let readClient = null;
let marketCache = { at: 0, rows: [], pairById: new Map() };
let priceCache = { at: 0, rows: [] };
const positionsCache = new Map();
const ordersCache = new Map();
const CACHE_TTL_MS = 15_000;
const STALE_CACHE_TTL_MS = 10 * 60_000;
const FIAT_SYMBOLS = new Set([
  'AUD', 'BRL', 'CAD', 'CHF', 'CNH', 'EUR', 'GBP', 'IDR', 'INR', 'JPY', 'KRW',
  'MXN', 'NZD', 'SEK', 'SGD', 'TRY', 'TWD', 'USD', 'ZAR',
]);

function clampBuilderFee(value) {
  const fee = Number(value);
  if (!Number.isFinite(fee)) return 2;
  return Math.max(0, Math.min(50, fee));
}

function isEvmAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

function normalizeAddress(addr) {
  const s = String(addr || '').trim();
  return isEvmAddress(s) ? s.toLowerCase() : null;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function trimNumber(value, decimals = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(decimals).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
}

function cleanMarketLeg(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-PERP$/u, '')
    .replace(/[/_-]PERP$/u, '')
    .replace(/[^A-Z0-9]/g, '');
}

function isForexCategory(pair) {
  return String(pair?.category || pair?.assetClass || pair?.asset_class || '')
    .toLowerCase()
    .includes('forex');
}

function sideToPanel(side) {
  if (typeof side === 'boolean') return side ? 'bid' : 'ask';
  const s = String(side || '').toLowerCase();
  if (s === 'long' || s === 'buy' || s === 'bid' || s === 'b' || s === 'true') return 'bid';
  if (s === 'short' || s === 'sell' || s === 'ask' || s === 's' || s === 'false') return 'ask';
  const n = Number(side);
  if (Number.isFinite(n)) return n >= 0 ? 'bid' : 'ask';
  return 'bid';
}

function legacySideToPanelForClientOrderId(side) {
  const s = String(side || '').toLowerCase();
  if (s === 'long' || s === 'buy' || s === 'bid' || s === 'true') return 'bid';
  if (s === 'short' || s === 'sell' || s === 'ask' || s === 'false') return 'ask';
  return num(side) >= 0 ? 'bid' : 'ask';
}

function actionToOrderType(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('close')) return 'close';
  if (text.includes('limit')) return 'limit';
  if (text.includes('stop')) return 'stop';
  return 'market';
}

function createClientParams(extra = {}) {
  const rpcUrl = normalizeServerRpcUrl(OSTIUM_RPC_URL);
  return {
    ...(rpcUrl ? { rpcUrl } : {}),
    ...(OSTIUM_SUBGRAPH_URL ? { subgraphUrl: OSTIUM_SUBGRAPH_URL } : {}),
    ...(OSTIUM_BUILDER_API_URL ? { builderApiUrl: OSTIUM_BUILDER_API_URL } : {}),
    ...extra,
  };
}

function normalizeServerRpcUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) {
    const origin = String(
      process.env.OSTIUM_RPC_ORIGIN
      || process.env.CLASH_PUBLIC_ORIGIN
      || process.env.PUBLIC_ORIGIN
      || process.env.PUBLIC_URL
      || 'https://clashofperps.fun',
    ).replace(/\/+$/u, '');
    return `${origin}${raw}`;
  }
  return '';
}

function isTransientReadError(error) {
  const text = String(error?.message || error || '');
  const status = Number(error?.status || error?.response?.status || 0);
  return status === 429
    || status === 502
    || status === 503
    || /429|too many requests|rate limit|timeout|fetch failed|econnreset|temporar/i.test(text);
}

function pairSymbolFromFeed(item) {
  const from = cleanMarketLeg(item?.from);
  if (!from) return '';
  const to = cleanMarketLeg(item?.to || item?.quote || item?.pairTo);
  if (to && (isForexCategory(item) || (FIAT_SYMBOLS.has(from) && FIAT_SYMBOLS.has(to)))) {
    return `${from}/${to}`;
  }
  const mapped = {
    CL: 'WTI',
    HG: 'XCU',
    SPX: 'US500',
    NDX: 'US100',
    DJI: 'US30',
    DAX: 'GER40',
    FTSE: 'UK100',
    HSI: 'HK50',
    NIK: 'JP225',
  };
  return mapped[from] || from;
}

async function getBuilderPriceRowsFallback() {
  const base = (OSTIUM_BUILDER_API_URL || 'https://builder.ostium.io').replace(/\/+$/u, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/v1/prices`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Ostium live prices returned ${res.status}`);
    const payload = await res.json();
    const items = Array.isArray(payload?.prices) ? payload.prices : [];
    return items.map((item, index) => {
      const symbol = pairSymbolFromFeed(item);
      const mark = num(item?.mid || item?.ask || item?.bid, 0);
      if (!symbol || mark <= 0) return null;
      return {
        symbol,
        mark: String(mark),
        oracle: String(mark),
        bid: String(num(item?.bid, mark)),
        ask: String(num(item?.ask, mark)),
        volume_24h: 0,
        open_interest: '0',
        pair_index: index,
        fallback_source: 'ostium_builder_prices',
      };
    }).filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

async function getReadClient() {
  if (readClient) return readClient;
  readClient = await OstiumClient.createReadOnly(createClientParams());
  return readClient;
}

async function getBuildClient(traderAddress) {
  const trader = normalizeAddress(traderAddress);
  if (!trader) throw new Error('valid Ostium trader address required');
  return OstiumClient.createSelfAndSelf(createClientParams({
    traderAddress: trader,
    builder: {
      address: OSTIUM_BUILDER_ADDRESS,
      feeBps: OSTIUM_BUILDER_FEE_BPS,
    },
  }));
}

function symbolOf(pair) {
  const raw = String(pair?.pairFrom || pair?.symbol || '')
    .trim()
    .toUpperCase()
    .replace(/-PERP$/u, '');
  const quoted = raw.match(/^([A-Z0-9]+)[/_-]([A-Z0-9]+)$/u);
  const from = quoted ? cleanMarketLeg(quoted[1]) : cleanMarketLeg(raw);
  const to = cleanMarketLeg(pair?.pairTo || pair?.to || pair?.quote || (quoted ? quoted[2] : ''));
  if (!from) return '';
  if (to && (isForexCategory(pair) || (FIAT_SYMBOLS.has(from) && FIAT_SYMBOLS.has(to)))) {
    return `${from}/${to}`;
  }
  return from;
}

function normalizeMarket(pair) {
  const symbol = symbolOf(pair);
  if (!symbol) return null;
  const quote = cleanMarketLeg(pair?.pairTo || pair?.to || pair?.quote) || 'USD';
  const pairName = symbol.includes('/') ? symbol : `${symbol}/${quote}`;
  const mark = num(pair?.midPx || pair?.askPx || pair?.bidPx, 0);
  return {
    symbol,
    display_symbol: symbol,
    base: symbol.split('/')[0],
    quote,
    pair: pairName,
    market_name: pairName,
    market_id: Number(pair?.pairId),
    pair_index: Number(pair?.pairId),
    asset_id: Number(pair?.pairId),
    lot_size: String(pair?.minSz || '0.0001'),
    tick_size: '0.01',
    min_order_size: String(pair?.minSz || '0.0001'),
    min_notional_usd: String(pair?.minNtl || 5),
    max_leverage: num(pair?.maxLeverage, 50),
    overnight_max_leverage: num(pair?.overnightMaxLeverage, 0),
    is_day_trade_required_above: num(pair?.overnightMaxLeverage, 0),
    is_market_open: pair?.isMarketOpen !== false,
    isMarketOpen: pair?.isMarketOpen !== false,
    is_day_trading_closed: pair?.isDayTradingClosed === true,
    isDayTradingClosed: pair?.isDayTradingClosed === true,
    seconds_to_toggle_is_day_trading_closed: num(pair?.secondsToToggleIsDayTradingClosed, 0),
    secondsToToggleIsDayTradingClosed: num(pair?.secondsToToggleIsDayTradingClosed, 0),
    schedule: pair?.schedule || null,
    category: pair?.category || null,
    mark,
    mid: mark,
    oracle: mark,
    bid: num(pair?.bidPx, mark),
    ask: num(pair?.askPx, mark),
    volume_24h: 0,
    open_interest: num(pair?.openInterest, 0),
    buy_open_interest: num(pair?.buyOpenInterest, 0),
    sell_open_interest: num(pair?.sellOpenInterest, 0),
    funding_rate: num(pair?.rolloverRate?.long, 0),
    next_funding_rate: num(pair?.rolloverRate?.short, 0),
    open_fee_bps: num(pair?.openFee, 0),
    close_fee_bps: num(pair?.closeFee, 0),
    builder_fee_bps: OSTIUM_BUILDER_FEE_BPS,
    builder_address: OSTIUM_BUILDER_ADDRESS,
    _raw: pair,
  };
}

async function getPairsFresh() {
  const client = await getReadClient();
  const payload = await client.getPairs();
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  const rows = pairs.map(normalizeMarket).filter(Boolean);
  const pairById = new Map();
  for (const row of rows) pairById.set(String(row.pair_index), row);
  marketCache = { at: Date.now(), rows, pairById };
  return marketCache;
}

async function getMarketContext() {
  if (Date.now() - marketCache.at < CACHE_TTL_MS && marketCache.rows.length) return marketCache;
  try {
    return await getPairsFresh();
  } catch (e) {
    if (marketCache.rows.length && Date.now() - marketCache.at < STALE_CACHE_TTL_MS && isTransientReadError(e)) {
      console.warn('[ostium] using stale market cache after read error:', e.message || e);
      return marketCache;
    }
    throw e;
  }
}

async function getMarketInfo() {
  const context = await getMarketContext();
  return context.rows;
}

async function getPrices() {
  if (Date.now() - priceCache.at < CACHE_TTL_MS && priceCache.rows.length) return priceCache.rows;
  try {
    const [client, context] = await Promise.all([getReadClient(), getMarketContext()]);
    const payload = await client.getAllPrices();
    const prices = payload?.prices && typeof payload.prices === 'object' ? payload.prices : {};
    const rows = Object.entries(prices).map(([pairId, price]) => {
      const market = context.pairById.get(String(pairId));
      if (!market) return null;
      const mark = num(price?.mid || price?.midPx || price?.ask || price?.bid, market.mark);
      return {
        symbol: market.symbol,
        mark: String(mark),
        oracle: String(mark),
        bid: String(num(price?.bid, mark)),
        ask: String(num(price?.ask, mark)),
        volume_24h: 0,
        open_interest: String(market.open_interest || 0),
        pair_index: Number(pairId),
      };
    }).filter(Boolean);
    priceCache = { at: Date.now(), rows };
    return rows;
  } catch (e) {
    if (priceCache.rows.length && Date.now() - priceCache.at < STALE_CACHE_TTL_MS && isTransientReadError(e)) {
      console.warn('[ostium] using stale price cache after read error:', e.message || e);
      return priceCache.rows;
    }
    if (isTransientReadError(e)) {
      const rows = await getBuilderPriceRowsFallback();
      if (rows.length) {
        priceCache = { at: Date.now(), rows };
        return rows;
      }
    }
    throw e;
  }
}

async function getAccountByAddress(address) {
  const account = normalizeAddress(address);
  if (!account) throw new Error('valid EVM address required');
  const client = await getReadClient();
  const [balances, positions, orders] = await Promise.all([
    client.getBalances(account).catch(() => null),
    client.getOpenPositions({ user: account }).catch(() => null),
    client.getOpenOrders({ user: account }).catch(() => []),
  ]);
  const margin = positions?.marginSummary || {};
  const walletUsdc = num(balances?.usdc, 0);
  const accountEquity = Math.max(num(margin.accountValue, 0), walletUsdc);
  return {
    address: account,
    equity: accountEquity,
    account_equity: accountEquity,
    available_to_spend: walletUsdc,
    available_to_withdraw: walletUsdc,
    free_margin: walletUsdc,
    margin_used: num(margin.totalCollateralUsed, 0),
    total_margin_used: num(margin.totalCollateralUsed, 0),
    total_position_notional: num(margin.totalNtlPos, 0),
    unrealized_pnl: num(margin.totalRawPnlUsd, 0),
    usdc_balance: walletUsdc,
    wallet_usdc: walletUsdc,
    eth_balance: num(balances?.eth, 0),
    allowance: balances?.allowance ?? null,
    positions_count: Array.isArray(positions?.pairPositions) ? positions.pairPositions.length : 0,
    orders_count: Array.isArray(orders) ? orders.length : 0,
    chain_id: OSTIUM_CHAIN_ID,
    builder_address: OSTIUM_BUILDER_ADDRESS,
    builder_fee_bps: OSTIUM_BUILDER_FEE_BPS,
  };
}

function normalizePosition(row, marketsById = new Map()) {
  const position = row?.position || row;
  const pairId = position?.pairId ?? row?.pairId;
  const market = marketsById.get(String(pairId));
  const symbol = market?.symbol || symbolOf(position) || `PAIR${pairId}`;
  const sizeUsd = num(position?.ntl || position?.notional || position?.sizeUsd, 0);
  const collateral = num(position?.collateralUsed || position?.collateral || position?.margin, 0);
  const entry = num(position?.entryPx || position?.entryPrice, 0);
  const amount = entry > 0 ? sizeUsd / entry : Math.abs(num(position?.szi || position?.size, 0));
  const side = sideToPanel(position?.side ?? position?.buy);
  const pnlUsd = num(position?.unrealizedPnl || position?.rawPnlUsd || position?.pnl, 0);
  const returnOnEquity = num(position?.returnOnEquity, 0);
  const stableId = [
    'ostium',
    String(symbol || '').toUpperCase(),
    side,
    pairId ?? '',
    position?.idx ?? row?.idx ?? 0,
    position?.pid ?? row?.pid ?? '',
  ].join(':');
  return {
    dex: 'ostium',
    id: stableId,
    position_id: stableId,
    symbol,
    side,
    amount,
    amount_display: trimNumber(amount, 6),
    size_usd: sizeUsd,
    entry_price: entry,
    mark_price: num(position?.midPx || market?.mark, 0),
    liquidation_price: num(position?.liquidationPx || position?.liquidationPrice, 0),
    margin: collateral,
    leverage: num(position?.leverage, collateral > 0 ? sizeUsd / collateral : 0),
    pnl_usd: pnlUsd,
    pnl_source: 'ostium_api',
    pnl_pct: returnOnEquity * 100,
    pnl_pct_source: 'ostium_return_on_equity',
    return_on_equity: returnOnEquity,
    take_profit: position?.tpPx || null,
    stop_loss: position?.slPx || null,
    is_isolated: true,
    raw_side: position?.side ?? position?.buy ?? null,
    pair_index: Number(pairId),
    trade_index: Number(position?.idx ?? row?.idx ?? 0),
    idx: Number(position?.idx ?? row?.idx ?? 0),
    pid: position?.pid ?? row?.pid ?? null,
    _raw: row,
  };
}

async function getPositionsByAddress(address) {
  const account = normalizeAddress(address);
  if (!account) throw new Error('valid EVM address required');
  try {
    const [client, context] = await Promise.all([getReadClient(), getMarketContext()]);
    const payload = await client.getOpenPositions({ user: account });
    const rows = Array.isArray(payload?.pairPositions) ? payload.pairPositions : [];
    const normalized = rows.map(row => normalizePosition(row, context.pairById));
    positionsCache.set(account, { at: Date.now(), rows: normalized });
    return normalized;
  } catch (e) {
    if (isTransientReadError(e)) {
      console.warn('[ostium] positions read degraded:', e.message || e);
      const cached = positionsCache.get(account);
      if (cached && Date.now() - cached.at <= STALE_CACHE_TTL_MS) {
        return cached.rows.map(row => ({ ...row, stale_read: true }));
      }
      return [];
    }
    throw e;
  }
}

function normalizeOrder(order, marketsById = new Map()) {
  const pairId = order?.pairId;
  const market = marketsById.get(String(pairId));
  const symbol = market?.symbol || symbolOf(order) || `PAIR${pairId}`;
  return {
    dex: 'ostium',
    symbol,
    side: sideToPanel(order?.side ?? order?.buy),
    amount: order?.szi || order?.size || null,
    size_usd: num(order?.ntl || order?.notional, 0),
    price: num(order?.limitPx || order?.price || order?.triggerPx, 0),
    take_profit: order?.tpPx || null,
    stop_loss: order?.slPx || null,
    order_id: order?.idx ?? order?.orderId ?? order?.id ?? null,
    idx: order?.idx ?? null,
    pair_index: Number(pairId),
    type: order?.orderType || 'limit',
    order_type: order?.orderType || 'limit',
    tif: 'GTC',
    status: order?.isPending === false ? 'open' : 'pending',
    created_at: order?.timestamp ? Number(order.timestamp) * 1000 : null,
    _raw: order,
  };
}

async function getOrdersByAddress(address) {
  const account = normalizeAddress(address);
  if (!account) throw new Error('valid EVM address required');
  try {
    const [client, context] = await Promise.all([getReadClient(), getMarketContext()]);
    const rows = await client.getOpenOrders({ user: account });
    const normalized = (Array.isArray(rows) ? rows : []).map(row => normalizeOrder(row, context.pairById));
    ordersCache.set(account, { at: Date.now(), rows: normalized });
    return normalized;
  } catch (e) {
    if (isTransientReadError(e)) {
      console.warn('[ostium] orders read degraded:', e.message || e);
      const cached = ordersCache.get(account);
      if (cached && Date.now() - cached.at <= STALE_CACHE_TTL_MS) {
        return cached.rows.map(row => ({ ...row, stale_read: true }));
      }
      return [];
    }
    throw e;
  }
}

function normalizeFillForDb(fill, marketsById = new Map()) {
  const pairId = fill?.pairId;
  const market = marketsById.get(String(pairId));
  const symbol = market?.symbol || symbolOf(fill) || `PAIR${pairId}`;
  const notional = Math.abs(num(fill?.ntl || fill?.notional || fill?.sizeUsd, 0));
  const side = sideToPanel(fill?.side ?? fill?.buy);
  const legacySide = legacySideToPanelForClientOrderId(fill?.side ?? fill?.buy);
  const orderId = fill?.orderId ?? fill?.idx ?? fill?.id ?? null;
  const txHash = fill?.txHash || fill?.initiatedTx || fill?.transactionHash || null;
  const timestampSeconds = Number(fill?.timestamp || fill?.time || fill?.executedAt || 0);
  const createdAt = Number.isFinite(timestampSeconds) && timestampSeconds > 0
    ? new Date(timestampSeconds > 1e12 ? timestampSeconds : timestampSeconds * 1000).toISOString()
    : null;
  return {
    symbol,
    side,
    orderType: actionToOrderType(fill?.action || fill?.orderType),
    amount: String(fill?.szi || fill?.size || ''),
    price: fill?.price || fill?.px || fill?.entryPx || null,
    orderId,
    clientOrderId: txHash
      ? `ostium:${txHash}:${orderId || pairId || 'fill'}:${legacySide}`
      : `ostium:${String(fill?.trader || '').toLowerCase()}:${pairId}:${orderId}:${createdAt || ''}:${legacySide}`,
    status: 'filled',
    dex: 'ostium',
    notional_usd: notional,
    verifiedSource: 'ostium_api',
    pnl: fill?.realizedPnl || fill?.pnl || null,
    fee: fill?.fees?.total || fill?.fee || null,
    proofJson: JSON.stringify({
      source: 'ostium_get_fills',
      builder: fill?.builder || null,
      builder_address: OSTIUM_BUILDER_ADDRESS,
      builder_fee_bps: OSTIUM_BUILDER_FEE_BPS,
      fill,
    }),
    createdAt,
  };
}

async function getAccountTradeHistory(address, opts = {}) {
  const account = normalizeAddress(address);
  if (!account) throw new Error('valid EVM address required');
  const limit = Math.max(1, Math.min(250, Number(opts.limit || OSTIUM_FILL_LOOKBACK_LIMIT)));
  const client = await getReadClient();
  return client.getFills({ user: account, limit });
}

async function importFillsForPlayer(playerId, wallet, opts = {}) {
  const account = normalizeAddress(wallet);
  if (!account) throw new Error('valid EVM address required');
  const attempts = Math.max(1, Math.min(10, Number(opts.attempts || 1)));
  const delayMs = Math.max(250, Math.min(5000, Number(opts.delayMs || opts.delay_ms || OSTIUM_IMPORT_RETRY_DELAY_MS)));
  let lastRows = [];
  let imported = 0;
  let volume = 0;
  let lastError = null;
  const context = await getMarketContext();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let rows;
    try {
      rows = await getAccountTradeHistory(account, { limit: opts.limit || OSTIUM_FILL_LOOKBACK_LIMIT });
      lastError = null;
    } catch (e) {
      lastError = e;
      if (attempt >= attempts - 1) break;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }
    lastRows = Array.isArray(rows) ? rows : [];
    for (const fill of lastRows) {
      const row = normalizeFillForDb(fill, context.pairById);
      if (!Number.isFinite(row.notional_usd) || row.notional_usd <= 0) continue;
      const result = db.addTrade(playerId, row);
      if (result.changes > 0) {
        imported += result.changes;
        volume += row.notional_usd;
      }
    }
    if (imported > 0 || attempt >= attempts - 1) break;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return {
    imported,
    rows: lastRows.length,
    volume_usd: volume,
    wallet: account,
    ok: !lastError,
    warning: lastError ? String(lastError.message || lastError).slice(0, 300) : null,
  };
}

function config() {
  return {
    dex: 'ostium',
    chain_id: OSTIUM_CHAIN_ID,
    builder_address: OSTIUM_BUILDER_ADDRESS,
    builder_fee_bps: OSTIUM_BUILDER_FEE_BPS,
    rpc_configured: !!normalizeServerRpcUrl(OSTIUM_RPC_URL),
    subgraph_configured: !!OSTIUM_SUBGRAPH_URL,
    builder_api_configured: !!OSTIUM_BUILDER_API_URL,
  };
}

module.exports = {
  CancelOrderType,
  OrderType,
  OSTIUM_BUILDER_ADDRESS,
  OSTIUM_BUILDER_FEE_BPS,
  OSTIUM_CHAIN_ID,
  config,
  getBuildClient,
  getMarketInfo,
  getPrices,
  getAccountByAddress,
  getPositionsByAddress,
  getOrdersByAddress,
  getAccountTradeHistory,
  importFillsForPlayer,
  isEvmAddress,
  normalizeAddress,
};
