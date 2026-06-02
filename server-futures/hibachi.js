const crypto = require('crypto');

const HIBACHI_API = String(process.env.HIBACHI_API_URL || 'https://api.hibachi.xyz').replace(/\/+$/u, '');
const HIBACHI_DATA_API = String(process.env.HIBACHI_DATA_API_URL || 'https://data-api.hibachi.xyz').replace(/\/+$/u, '');
const HIBACHI_FILL_LOOKBACK_LIMIT = Math.max(10, Math.min(250, Number(process.env.HIBACHI_FILL_LOOKBACK_LIMIT || 100)));
const HIBACHI_MAX_FEES_PERCENT = String(process.env.HIBACHI_MAX_FEES_PERCENT || '0.001');
const HIBACHI_REWARD_MIN_NOTIONAL_USD = Math.max(0, Number(process.env.HIBACHI_REWARD_MIN_NOTIONAL_USD || 10));

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

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.markets)) return payload.markets;
  if (Array.isArray(payload?.futureContracts)) return payload.futureContracts;
  if (Array.isArray(payload?.trades)) return payload.trades;
  if (Array.isArray(payload?.orders)) return payload.orders;
  return [];
}

async function request(base, method, path, { apiKey, body } = {}) {
  const headers = {
    accept: 'application/json',
    'hibachi-client': 'ClashOfPerps/1.0',
  };
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (apiKey) headers.authorization = apiKey;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(`${base}${path}`, { method, headers, body: payload, signal: ctrl.signal });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const detail = typeof data === 'string' ? data : (data?.message || data?.error || text);
      throw new Error(`Hibachi ${path} ${r.status}: ${detail || 'request failed'}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function credentials(input = {}) {
  const apiKey = String(input.apiKey || input.api_key || '').trim();
  const accountId = Number(input.accountId || input.account_id);
  const privateKey = String(input.privateKey || input.private_key || '').trim();
  if (!apiKey) throw new Error('Hibachi API key required');
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error('Hibachi account id required');
  if (!privateKey) throw new Error('Hibachi HMAC private key required');
  if (/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('Hibachi wallet ECDSA private keys are not accepted by this proxy. Use a Hibachi API HMAC key.');
  }
  return { apiKey, accountId, privateKey };
}

function hmacSign(privateKey, payload) {
  return crypto.createHmac('sha256', privateKey).update(payload).digest('hex');
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
async function getInventory() {
  if (inventoryCache.payload && Date.now() - inventoryCache.at < 20_000) return inventoryCache.payload;
  const payload = await request(HIBACHI_DATA_API, 'GET', '/market/inventory');
  inventoryCache = { at: Date.now(), payload };
  return payload;
}

async function contractMap() {
  const inv = await getInventory();
  const list = rows(inv?.markets).map(m => m.contract || m).filter(Boolean);
  return new Map(list.map(c => [String(c.symbol || '').toUpperCase(), c]));
}

async function getMarketInfo() {
  const inv = await getInventory();
  const data = rows(inv?.markets).map((m) => {
    const c = m.contract || m;
    const info = m.info || {};
    const symbol = symbolOf(c.symbol || info.symbol);
    const mark = num(info.markPrice || info.priceLatest || c.markPrice);
    const initialMarginRate = num(c.initialMarginRate, 0.1);
    return {
      symbol,
      base: symbol,
      pair: `${symbol}/USDT`,
      market_name: c.symbol || `${symbol}/USDT-P`,
      market_id: Number(c.id),
      pair_index: Number(c.id),
      lot_size: String(c.stepSize || c.minOrderSize || ''),
      tick_size: String(c.tickSize || ''),
      min_order_size: String(c.minOrderSize || ''),
      min_notional_usd: Number(c.minNotional || 0),
      max_leverage: initialMarginRate > 0 ? Math.max(1, Math.floor(1 / initialMarginRate)) : 10,
      mark,
      mid: mark,
      oracle: mark,
      yesterday_price: num(info.price24hAgo),
      open_interest: 0,
      volume_24h: 0,
      funding_rate: 0,
      _hibachi: { contract: c, info },
      _raw: m,
    };
  }).filter(m => m.symbol && Number.isFinite(m.market_id));
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
    })),
  };
}

async function authedGet(path, creds) {
  return request(HIBACHI_API, 'GET', path, { apiKey: creds.apiKey });
}

async function authedSend(method, path, body, creds) {
  return request(HIBACHI_API, method, path, { apiKey: creds.apiKey, body });
}

async function getAccount(credsInput) {
  const creds = credentials(credsInput);
  const j = await authedGet('/trade/account/info', creds);
  return {
    balance: String(j?.balance ?? 0),
    usdc: String(j?.balance ?? 0),
    account_equity: String(j?.balance ?? 0),
    available_to_spend: String(j?.balance ?? 0),
    available_to_withdraw: String(j?.maximalWithdraw ?? j?.balance ?? 0),
    total_margin_used: String(num(j?.totalPositionNotional) + num(j?.totalOrderNotional)),
    positions_count: Array.isArray(j?.positions) ? j.positions.length : 0,
    orders_count: 0,
    maker_fee: num(j?.tradeMakerFeeRate),
    taker_fee: num(j?.tradeTakerFeeRate),
    _raw: j,
  };
}

async function getPositions(credsInput) {
  const creds = credentials(credsInput);
  const j = await authedGet('/trade/account/info', creds);
  return rows(j?.positions).map(p => {
    const amount = Math.abs(num(p.quantity));
    if (!p?.symbol || amount <= 0) return null;
    const side = String(p.direction || '').toUpperCase().includes('SHORT') ? 'ask' : 'bid';
    return {
      symbol: symbolOf(p.symbol),
      side,
      amount: String(amount),
      size_usd: num(p.notionalValue),
      entry_price: String(p.openPrice || ''),
      mark_price: String(p.markPrice || ''),
      liquidation_price: null,
      margin: '',
      leverage: '1',
      pnl_usd: String(num(p.unrealizedTradingPnl) + num(p.unrealizedFundingPnl)),
      pnl_pct: 0,
      pair_index: null,
      trade_index: null,
      is_isolated: false,
      _raw: p,
    };
  }).filter(Boolean);
}

async function getOrders(credsInput) {
  const creds = credentials(credsInput);
  const j = await authedGet('/trade/orders', creds);
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
  const side = String(args.side || '').toLowerCase();
  const hibachiSide = side === 'ask' || side === 'short' || side === 'sell' ? 'ASK' : 'BID';
  const quantity = decimalText(args.quantity || args.amount || 0);
  if (!(num(quantity) > 0)) throw new Error('Order quantity required');
  const orderType = String(args.orderType || 'market').toUpperCase() === 'LIMIT' ? 'LIMIT' : 'MARKET';
  const price = orderType === 'LIMIT' ? decimalText(args.price) : null;
  const nonce = Math.floor(Number(process.hrtime.bigint() / 1000n));
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
    signature: hmacSign(creds.privateKey, payload),
    ...(price != null ? { price } : {}),
    ...(args.reduceOnly ? { orderFlags: 'REDUCE_ONLY' } : {}),
  };
  return authedSend('POST', '/trade/order', body, creds);
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
    signature: hmacSign(creds.privateKey, buf),
    ...(id != null ? { orderId: String(id) } : { nonce: String(n) }),
  };
  return authedSend('DELETE', '/trade/order', body, creds);
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
  const j = await authedGet('/trade/account/trades', creds);
  return rows(j?.trades || j)
    .slice(0, Math.max(1, Math.min(250, Number(limit) || HIBACHI_FILL_LOOKBACK_LIMIT)))
    .map(t => normalizeTrade(creds.accountId, t))
    .filter(Boolean);
}

async function importFillsForPlayer(playerId, credsInput, opts = {}) {
  const creds = credentials(credsInput);
  const db = require('./db');
  const fills = await getAccountTradeHistory(creds, opts).catch(() => []);
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
  credentials,
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
