const BigNumber = require('bignumber.js');
const { createNadoClient } = require('@nadohq/client');
const { createPublicClient, fallback, http } = require('viem');
const { ink } = require('viem/chains');

const NADO_CHAIN_ENV = 'inkMainnet';
const NADO_SUBACCOUNT_NAME = process.env.NADO_SUBACCOUNT_NAME || 'default';
const NADO_FILL_LOOKBACK_LIMIT = Math.max(10, Math.min(250, Number(process.env.NADO_FILL_LOOKBACK_LIMIT || 100)));
const NADO_RPC_URLS = String(
  process.env.NADO_INK_RPC_URLS
    || process.env.INK_RPC_URLS
    || process.env.INK_RPC_URL
    || 'https://rpc-gel.inkonchain.com,https://rpc-qnd.inkonchain.com,https://ink.drpc.org',
)
  .split(/[,\s]+/u)
  .map(s => s.trim())
  .filter(Boolean);

const PRODUCT_TYPE_PERP = 1;
const QUOTE_PRODUCT_ID = 0;
const PRODUCT_DECIMALS = 18;
const DECIMAL_SCALE = new BigNumber(10).pow(PRODUCT_DECIMALS);
const MARKET_CACHE_TTL_MS = 10_000;

let readClient = null;
let marketsCache = null;

function isEvmAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

function normalizeAddress(addr) {
  const s = String(addr || '').trim().toLowerCase();
  return isEvmAddress(s) ? s : null;
}

function bn(value, fallback = 0) {
  try {
    const x = new BigNumber(value ?? fallback);
    return x.isFinite() ? x : new BigNumber(fallback);
  } catch {
    return new BigNumber(fallback);
  }
}

function rawToDecimal(value, decimals = PRODUCT_DECIMALS) {
  return bn(value).div(new BigNumber(10).pow(decimals));
}

function rawToString(value, decimals = PRODUCT_DECIMALS, fallback = '0') {
  const x = rawToDecimal(value, decimals);
  return x.isFinite() ? x.toFixed() : fallback;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function symbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-PERP$/u, '')
    .replace(/\/USDC$/u, '')
    .replace(/\/USDT$/u, '')
    .replace(/\/USD$/u, '');
}

function getClient() {
  if (readClient) return readClient;
  const publicClient = createPublicClient({
    chain: ink,
    transport: fallback(
      NADO_RPC_URLS.map(url => http(url, { retryCount: 1, retryDelay: 250, timeout: 15_000 })),
      { rank: false, retryCount: 0 },
    ),
  });
  readClient = createNadoClient(NADO_CHAIN_ENV, { publicClient });
  return readClient;
}

function maxLeverage(symbol) {
  const longWeight = num(symbol?.longWeightInitial, 0);
  const shortWeight = num(symbol?.shortWeightInitial, 0);
  const values = [];
  if (longWeight > 0 && longWeight < 1) values.push(1 / (1 - longWeight));
  if (shortWeight > 1) values.push(1 / (shortWeight - 1));
  const lev = values.length ? Math.min(...values) : 25;
  return Math.max(1, Math.min(100, Math.floor(lev + 1e-6)));
}

async function fetchMarketInfoFresh() {
  const client = getClient();
  const symbolsPayload = await client.context.engineClient.getSymbols({});
  const allMarkets = await client.market.getAllMarkets().catch(() => []);
  const rawSymbols = Object.values(symbolsPayload?.symbols || {})
    .filter(s => Number(s?.type) === PRODUCT_TYPE_PERP && !s?.isolatedOnly);
  const productIds = rawSymbols.map(s => Number(s.productId)).filter(Number.isFinite);
  const pricesPayload = productIds.length
    ? await client.market.getLatestMarketPrices({ productIds }).catch(() => ({ marketPrices: [] }))
    : { marketPrices: [] };
  const priceByProduct = new Map((pricesPayload?.marketPrices || []).map(p => [Number(p.productId), p]));
  const productById = new Map((allMarkets || []).map(m => [Number(m.productId ?? m?.product?.productId), m]));

  return rawSymbols.map((s) => {
    const productId = Number(s.productId);
    const price = priceByProduct.get(productId) || {};
    const product = productById.get(productId)?.product || productById.get(productId) || {};
    const bid = num(price.bid);
    const ask = num(price.ask);
    const mark = bid > 0 && ask > 0 ? (bid + ask) / 2 : num(product.oraclePrice);
    const symbol = symbolOf(s.symbol);
    return {
      symbol,
      base: symbol,
      pair: `${symbol}/USDT`,
      market_name: `${symbol}/USDT`,
      market_id: productId,
      asset_id: productId,
      pair_index: productId,
      lot_size: rawToString(s.sizeIncrement),
      tick_size: String(s.priceIncrement || 0.01),
      min_order_size: rawToString(s.minSize),
      min_notional_usd: rawToString(s.minSize),
      max_leverage: maxLeverage(s),
      mark,
      mid: mark,
      oracle: num(product.oraclePrice, mark),
      bid: bid || mark,
      ask: ask || mark,
      volume_24h: 0,
      open_interest: rawToString(product.openInterest || 0),
      funding_rate: 0,
      isolated_only: !!s.isolatedOnly,
      _nado: {
        productId,
        symbol: s.symbol,
        sizeIncrementRaw: String(s.sizeIncrement || '0'),
        minSizeRaw: String(s.minSize || '0'),
        raw: s,
      },
      _raw: s,
    };
  }).filter(m => m.symbol && Number.isFinite(m.market_id));
}

async function getMarketInfo() {
  const now = Date.now();
  if (marketsCache && now - marketsCache.at < MARKET_CACHE_TTL_MS) return marketsCache.rows;
  const rows = await fetchMarketInfoFresh();
  marketsCache = { at: now, rows };
  return rows;
}

async function marketMap() {
  const markets = await getMarketInfo();
  return new Map(markets.map(m => [Number(m.market_id), m]));
}

async function getPrices() {
  const markets = await getMarketInfo();
  return markets.map(m => ({
    symbol: m.symbol,
    mark: String(m.mark || ''),
    mid: String(m.mid || m.mark || ''),
    oracle: String(m.oracle || m.mark || ''),
    volume_24h: m.volume_24h || 0,
    open_interest: String(m.open_interest || 0),
    funding_rate: m.funding_rate || 0,
  }));
}

function balanceAmount(balance) {
  return rawToDecimal(balance?.amount ?? 0);
}

function healthAmount(value) {
  return rawToDecimal(value ?? 0);
}

async function getSubaccountSummary(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  return getClient().subaccount.getSubaccountSummary({
    subaccountOwner: clean,
    subaccountName: NADO_SUBACCOUNT_NAME,
  });
}

async function getAccountByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  const [summary, byMarket] = await Promise.all([
    getSubaccountSummary(clean).catch((e) => {
      if (/not found|404|does not exist/i.test(e.message || '')) return null;
      throw e;
    }),
    marketMap(),
  ]);
  const balances = Array.isArray(summary?.balances) ? summary.balances : [];
  const quote = balances.find(b => Number(b.productId) === QUOTE_PRODUCT_ID);
  const quoteAmount = balanceAmount(quote);
  const initialHealth = healthAmount(summary?.health?.initial?.health);
  const maintHealth = healthAmount(summary?.health?.maintenance?.health);
  const positionBalances = balances.filter(b => Number(b.type) === PRODUCT_TYPE_PERP && !balanceAmount(b).isZero());
  const perpEquity = positionBalances.reduce((acc, b) => {
    const amount = balanceAmount(b);
    const mark = bn(byMarket.get(Number(b.productId))?.mark || b?.oraclePrice || 0);
    return acc.plus(amount.times(mark).plus(rawToDecimal(b.vQuoteBalance || 0)));
  }, new BigNumber(0));
  const equity = quoteAmount.plus(perpEquity);
  const available = BigNumber.maximum(initialHealth, quoteAmount, new BigNumber(0));
  return {
    exists: !!summary?.exists,
    balance: equity.toFixed(),
    usdc: quoteAmount.toFixed(),
    usdt: quoteAmount.toFixed(),
    account_equity: equity.toFixed(),
    available_to_spend: available.toFixed(),
    available_to_withdraw: quoteAmount.isPositive() ? quoteAmount.toFixed() : '0',
    total_margin_used: BigNumber.maximum(equity.minus(available), 0).toFixed(),
    maintenance_margin: maintHealth.toFixed(),
    positions_count: positionBalances.length,
    orders_count: 0,
    maker_fee: 0.0001,
    taker_fee: 0.00035,
    _raw: summary,
  };
}

function normalizePosition(balance, market) {
  const amountRaw = bn(balance?.amount);
  if (amountRaw.isZero()) return null;
  const amount = amountRaw.div(DECIMAL_SCALE);
  const absAmount = amount.abs();
  const symbol = market?.symbol || symbolOf(balance?.symbol);
  if (!symbol || absAmount.isZero()) return null;
  const mark = num(market?.mark || market?.mid || market?.oracle);
  const vQuote = rawToDecimal(balance?.vQuoteBalance || 0);
  const entry = absAmount.gt(0) ? vQuote.abs().div(absAmount) : new BigNumber(mark || 0);
  const notional = absAmount.times(mark || entry);
  const pnl = amount.times(mark || 0).plus(vQuote);
  const maxLev = num(market?.max_leverage, 25);
  const margin = maxLev > 0 ? notional.div(maxLev) : notional;
  return {
    symbol,
    side: amount.isNegative() ? 'ask' : 'bid',
    amount: absAmount.toFixed(),
    size_usd: notional.toFixed(),
    entry_price: entry.toFixed(),
    mark_price: String(mark || entry.toFixed()),
    liquidation_price: null,
    margin: margin.toFixed(),
    leverage: String(maxLev),
    pnl_usd: pnl.toFixed(),
    pnl_pct: margin.gt(0) ? pnl.div(margin).times(100).toNumber() : 0,
    pair_index: Number(balance.productId),
    trade_index: null,
    is_isolated: false,
    _raw: balance,
  };
}

async function getPositionsByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  const [summary, byMarket] = await Promise.all([getSubaccountSummary(clean), marketMap()]);
  const balances = Array.isArray(summary?.balances) ? summary.balances : [];
  return balances
    .filter(b => Number(b.type) === PRODUCT_TYPE_PERP)
    .map(b => normalizePosition(b, byMarket.get(Number(b.productId))))
    .filter(Boolean);
}

function normalizeOpenOrder(order, market) {
  const amountRaw = bn(order?.unfilledAmount ?? order?.totalAmount ?? order?.amount);
  if (amountRaw.isZero()) return null;
  const amount = amountRaw.div(DECIMAL_SCALE);
  const total = bn(order?.totalAmount ?? order?.amount ?? order?.unfilledAmount).abs().div(DECIMAL_SCALE);
  const executionType = String(order?.appendix?.orderExecutionType || 'limit').toLowerCase();
  return {
    symbol: market?.symbol || symbolOf(order?.symbol),
    side: amount.isNegative() ? 'ask' : 'bid',
    amount: amount.abs().toFixed(),
    initial_amount: total.toFixed(),
    price: String(order?.price || ''),
    stop_price: null,
    order_id: order?.digest,
    digest: order?.digest,
    order_type: executionType === 'ioc' ? 'market' : 'limit',
    tif: executionType,
    reduce_only: !!order?.appendix?.reduceOnly,
    pair_index: Number(order?.productId),
    trade_index: null,
    client_order_id: String(order?.nonce || ''),
    created_at: Number(order?.placementTime || 0) * 1000,
    _raw: order,
  };
}

async function getOrdersByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  const markets = await getMarketInfo();
  const productIds = markets.map(m => Number(m.market_id)).filter(Number.isFinite);
  if (!productIds.length) return [];
  const byMarket = new Map(markets.map(m => [Number(m.market_id), m]));
  const payload = await getClient().market.getOpenSubaccountMultiProductOrders({
    subaccountOwner: clean,
    subaccountName: NADO_SUBACCOUNT_NAME,
    productIds,
  }).catch(() => ({ productOrders: [] }));
  const productOrders = Array.isArray(payload?.productOrders) ? payload.productOrders : [];
  return productOrders.flatMap(po => (
    (po?.orders || []).map(o => normalizeOpenOrder(o, byMarket.get(Number(po.productId || o?.productId)))).filter(Boolean)
  ));
}

function normalizeHistoryOrder(wallet, order, byMarket) {
  const baseFilledRaw = bn(order?.baseFilled);
  if (baseFilledRaw.isZero()) return null;
  const amount = baseFilledRaw.abs().div(DECIMAL_SCALE);
  const quoteFilled = rawToDecimal(order?.quoteFilled || 0).abs();
  const price = bn(order?.price || 0);
  const notional = quoteFilled.gt(0) ? quoteFilled : amount.times(price);
  if (!notional.isFinite() || notional.lt(1) || notional.gt(10_000_000)) return null;
  const market = byMarket.get(Number(order?.productId));
  const signedAmount = bn(order?.amount);
  const closedAmount = bn(order?.closedAmount);
  const isClose = !closedAmount.isZero() || order?.appendix?.reduceOnly === true;
  const side = isClose
    ? (closedAmount.isNegative() || signedAmount.isPositive() ? 'close_short' : 'close_long')
    : (signedAmount.isNegative() ? 'short' : 'long');
  const key = `nado:${String(wallet).toLowerCase()}:${order?.digest || order?.submissionIndex}`;
  return {
    symbol: market?.symbol || symbolOf(order?.symbol),
    side,
    orderType: isClose ? 'close' : 'market',
    amount: amount.toFixed(),
    price: price.toFixed(),
    orderId: order?.digest || order?.submissionIndex || null,
    clientOrderId: key,
    status: 'filled',
    dex: 'nado',
    notional_usd: notional.toNumber(),
    verifiedSource: 'nado_api',
    pnl: order?.realizedPnl != null ? rawToDecimal(order.realizedPnl).toFixed() : null,
    fee: rawToDecimal(order?.totalFee || 0).abs().toFixed(),
    created_at: Number(order?.lastFillTimestamp || order?.firstFillTimestamp || 0) * 1000,
    _raw: order,
  };
}

async function getAccountTradeHistory(address, { limit = NADO_FILL_LOOKBACK_LIMIT } = {}) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('wallet required (0x...)');
  const [orders, byMarket] = await Promise.all([
    getClient().market.getHistoricalOrders({
      subaccounts: [{ subaccountOwner: clean, subaccountName: NADO_SUBACCOUNT_NAME }],
      limit: Math.max(1, Math.min(250, Number(limit) || NADO_FILL_LOOKBACK_LIMIT)),
    }).catch(() => []),
    marketMap(),
  ]);
  return (Array.isArray(orders) ? orders : [])
    .map(o => normalizeHistoryOrder(clean, o, byMarket))
    .filter(Boolean);
}

async function importFillsForPlayer(playerId, wallet, opts = {}) {
  const cleanWallet = normalizeAddress(wallet);
  if (!cleanWallet) return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'invalid_evm_wallet' };
  const db = require('./db');
  const attempts = Math.max(1, Math.min(6, Number(opts.attempts || 1)));
  const delayMs = Math.max(250, Math.min(5000, Number(opts.delayMs || 1500)));
  let fills = [];
  for (let i = 0; i < attempts; i += 1) {
    fills = await getAccountTradeHistory(cleanWallet, { limit: opts.limit || NADO_FILL_LOOKBACK_LIMIT }).catch(() => []);
    if (Array.isArray(fills) && fills.length) break;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  if (!Array.isArray(fills)) fills = [];

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
            WHERE id = ? AND dex = 'nado' AND verified_source = 'nado_api'
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
        console.warn('[nado] addTrade failed:', e.message);
      }
    }
  }
  return { ok: true, imported, adopted, skipped, total: fills.length };
}

module.exports = {
  NADO_CHAIN_ENV,
  NADO_SUBACCOUNT_NAME,
  QUOTE_PRODUCT_ID,
  isEvmAddress,
  normalizeAddress,
  getMarketInfo,
  getPrices,
  getAccountByAddress,
  getPositionsByAddress,
  getOrdersByAddress,
  getAccountTradeHistory,
  importFillsForPlayer,
};
