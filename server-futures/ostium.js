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
  || '',
).trim();
const OSTIUM_SUBGRAPH_URL = String(process.env.OSTIUM_SUBGRAPH_URL || '').trim();
const OSTIUM_BUILDER_API_URL = String(process.env.OSTIUM_BUILDER_API_URL || '').trim();

let readClient = null;
let marketCache = { at: 0, rows: [], pairById: new Map() };
let priceCache = { at: 0, rows: [] };
const CACHE_TTL_MS = 15_000;

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

function sideToPanel(side) {
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
  return {
    ...(OSTIUM_RPC_URL ? { rpcUrl: OSTIUM_RPC_URL } : {}),
    ...(OSTIUM_SUBGRAPH_URL ? { subgraphUrl: OSTIUM_SUBGRAPH_URL } : {}),
    ...(OSTIUM_BUILDER_API_URL ? { builderApiUrl: OSTIUM_BUILDER_API_URL } : {}),
    ...extra,
  };
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
  return String(pair?.pairFrom || pair?.symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\/USD[TC]?$/u, '')
    .replace(/-PERP$/u, '');
}

function normalizeMarket(pair) {
  const symbol = symbolOf(pair);
  if (!symbol) return null;
  const mark = num(pair?.midPx || pair?.askPx || pair?.bidPx, 0);
  return {
    symbol,
    base: symbol,
    pair: `${symbol}/${String(pair?.pairTo || 'USD').toUpperCase()}`,
    market_name: `${symbol}/${String(pair?.pairTo || 'USD').toUpperCase()}`,
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
    is_day_trading_closed: pair?.isDayTradingClosed === true,
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
  return getPairsFresh();
}

async function getMarketInfo() {
  const context = await getMarketContext();
  return context.rows;
}

async function getPrices() {
  if (Date.now() - priceCache.at < CACHE_TTL_MS && priceCache.rows.length) return priceCache.rows;
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
  return {
    address: account,
    equity: num(margin.accountValue, 0),
    available_to_spend: num(margin.totalWithdrawable, 0),
    margin_used: num(margin.totalCollateralUsed, 0),
    total_position_notional: num(margin.totalNtlPos, 0),
    unrealized_pnl: num(margin.totalRawPnlUsd, 0),
    usdc_balance: num(balances?.usdc, 0),
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
  const symbol = symbolOf(position) || market?.symbol || `PAIR${pairId}`;
  const sizeUsd = num(position?.ntl || position?.notional || position?.sizeUsd, 0);
  const collateral = num(position?.collateralUsed || position?.collateral || position?.margin, 0);
  const entry = num(position?.entryPx || position?.entryPrice, 0);
  const amount = entry > 0 ? sizeUsd / entry : Math.abs(num(position?.szi || position?.size, 0));
  return {
    dex: 'ostium',
    symbol,
    side: sideToPanel(position?.side ?? position?.buy),
    amount,
    size_usd: sizeUsd,
    entry_price: entry,
    mark_price: num(position?.midPx || market?.mark, 0),
    liquidation_price: num(position?.liquidationPx || position?.liquidationPrice, 0),
    margin: collateral,
    leverage: num(position?.leverage, collateral > 0 ? sizeUsd / collateral : 0),
    pnl_usd: num(position?.unrealizedPnl || position?.rawPnlUsd || position?.pnl, 0),
    return_on_equity: num(position?.returnOnEquity, 0),
    take_profit: position?.tpPx || null,
    stop_loss: position?.slPx || null,
    is_isolated: true,
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
  const [client, context] = await Promise.all([getReadClient(), getMarketContext()]);
  const payload = await client.getOpenPositions({ user: account });
  const rows = Array.isArray(payload?.pairPositions) ? payload.pairPositions : [];
  return rows.map(row => normalizePosition(row, context.pairById));
}

function normalizeOrder(order, marketsById = new Map()) {
  const pairId = order?.pairId;
  const market = marketsById.get(String(pairId));
  const symbol = symbolOf(order) || market?.symbol || `PAIR${pairId}`;
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
  const [client, context] = await Promise.all([getReadClient(), getMarketContext()]);
  const rows = await client.getOpenOrders({ user: account });
  return (Array.isArray(rows) ? rows : []).map(row => normalizeOrder(row, context.pairById));
}

function normalizeFillForDb(fill, marketsById = new Map()) {
  const pairId = fill?.pairId;
  const market = marketsById.get(String(pairId));
  const symbol = symbolOf(fill) || market?.symbol || `PAIR${pairId}`;
  const notional = Math.abs(num(fill?.ntl || fill?.notional || fill?.sizeUsd, 0));
  const side = sideToPanel(fill?.side ?? fill?.buy);
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
      ? `ostium:${txHash}:${orderId || pairId || 'fill'}:${side}`
      : `ostium:${String(fill?.trader || '').toLowerCase()}:${pairId}:${orderId}:${createdAt || ''}:${side}`,
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
  const context = await getMarketContext();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = await getAccountTradeHistory(account, { limit: opts.limit || OSTIUM_FILL_LOOKBACK_LIMIT });
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
  };
}

function config() {
  return {
    dex: 'ostium',
    chain_id: OSTIUM_CHAIN_ID,
    builder_address: OSTIUM_BUILDER_ADDRESS,
    builder_fee_bps: OSTIUM_BUILDER_FEE_BPS,
    rpc_configured: !!OSTIUM_RPC_URL,
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
