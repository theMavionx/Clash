const got = require('got');

const ASTER_API_BASE = String(process.env.ASTER_API_URL || 'https://fapi.asterdex.com').replace(/\/+$/u, '');
const ASTER_API_TIMEOUT_MS = Math.max(2_000, Math.min(20_000, Number(process.env.ASTER_API_TIMEOUT_MS || 8_000)));
const ASTER_BUILDER_ADDRESS = normalizeAddress(process.env.ASTER_BUILDER_ADDRESS || process.env.ASTER_BUILDER_CODE || '');
const ASTER_DEFAULT_BUILDER_FEE_RATE = '0.00001';
const configuredFeeRate = String(process.env.ASTER_BUILDER_FEE_RATE || ASTER_DEFAULT_BUILDER_FEE_RATE).trim();
const ASTER_BUILDER_FEE_RATE = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/u.test(configuredFeeRate)
  && Number(configuredFeeRate) >= 0
  && Number(configuredFeeRate) <= 0.01
  ? configuredFeeRate
  : ASTER_DEFAULT_BUILDER_FEE_RATE;
const ASTER_BUILDER_NAME = String(process.env.ASTER_BUILDER_NAME || 'clashofperps').trim().slice(0, 64) || 'clashofperps';

const MARKET_CACHE_MS = 30_000;
const PRICE_CACHE_MS = 2_000;
const DEPTH_CACHE_MS = 1_500;
const KLINE_CACHE_MS = 15_000;
let marketCache = { at: 0, rows: [] };
let priceCache = { at: 0, rows: [] };
const depthCache = new Map();
const klineCache = new Map();

const SIGNED_ENDPOINTS = new Map([
  ['GET /fapi/v3/agent', { management: false }],
  ['GET /fapi/v3/builder', { management: false }],
  ['GET /fapi/v3/balance', { management: false }],
  ['GET /fapi/v3/accountWithJoinMargin', { management: false }],
  ['GET /fapi/v3/positionRisk', { management: false }],
  ['GET /fapi/v3/openOrders', { management: false }],
  ['GET /fapi/v3/userTrades', { management: false }],
  ['GET /fapi/v3/income', { management: false }],
  ['GET /fapi/v3/commissionRate', { management: false }],
  ['GET /fapi/v3/positionSide/dual', { management: false }],
  ['POST /fapi/v3/approveAgent', { management: true }],
  ['POST /fapi/v3/approveBuilder', { management: true }],
  ['DELETE /fapi/v3/agent', { management: true }],
  ['DELETE /fapi/v3/builder', { management: true }],
  ['POST /fapi/v3/order', { management: false, order: true }],
  ['DELETE /fapi/v3/order', { management: false }],
  ['POST /fapi/v3/leverage', { management: false }],
  ['POST /fapi/v3/marginType', { management: false }],
]);

function normalizeAddress(value) {
  const text = String(value || '').trim();
  return /^0x[0-9a-fA-F]{40}$/u.test(text) ? text.toLowerCase() : '';
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function symbolBase(value) {
  return String(value || '').trim().toUpperCase().replace(/USDT$/u, '');
}

function upstreamError(payload, statusCode, fallback) {
  const error = new Error(payload?.msg || payload?.error || fallback || `Aster request failed (${statusCode || 502})`);
  error.status = statusCode >= 400 && statusCode < 500 ? statusCode : 502;
  error.code = payload?.code;
  error.payload = payload;
  return error;
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const target = `${ASTER_API_BASE}${path}${options.rawQuery ? `?${options.rawQuery}` : ''}`;
  const response = await got(target, {
    method,
    searchParams: options.searchParams,
    body: options.body,
    headers: {
      accept: 'application/json',
      'user-agent': 'ClashOfPerps/1.0',
      ...(options.body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    timeout: { request: ASTER_API_TIMEOUT_MS },
    retry: { limit: 1, methods: ['GET'], statusCodes: [408, 429, 500, 502, 503, 504] },
    throwHttpErrors: false,
  });
  let payload;
  try { payload = JSON.parse(response.body || '{}'); } catch { payload = { error: response.body || '' }; }
  if (response.statusCode < 200 || response.statusCode >= 300 || (Number(payload?.code) < 0)) {
    throw upstreamError(payload, response.statusCode, `Aster ${method} ${path} failed`);
  }
  return payload;
}

function filter(row, type) {
  return (Array.isArray(row?.filters) ? row.filters : []).find(item => item?.filterType === type) || {};
}

function normalizeMarket(row) {
  const price = filter(row, 'PRICE_FILTER');
  const lot = filter(row, 'LOT_SIZE');
  const marketLot = filter(row, 'MARKET_LOT_SIZE');
  const minNotional = filter(row, 'MIN_NOTIONAL');
  const initialMarginPercent = num(row?.requiredMarginPercent);
  const maxLeverage = initialMarginPercent > 0 ? Math.max(1, Math.floor(100 / initialMarginPercent)) : 20;
  return {
    dex: 'aster',
    symbol: symbolBase(row?.symbol),
    market: row?.symbol,
    market_addr: row?.symbol,
    aster_symbol: row?.symbol,
    base_asset: row?.baseAsset,
    quote_asset: row?.quoteAsset,
    margin_asset: row?.marginAsset,
    status: row?.status,
    disabled: row?.status !== 'TRADING',
    tick_size: num(price?.tickSize, 0.01),
    lot_size: num(lot?.stepSize, 0.001),
    market_lot_size: num(marketLot?.stepSize, num(lot?.stepSize, 0.001)),
    min_order_size: num(lot?.minQty, 0.001),
    market_min_order_size: num(marketLot?.minQty, num(lot?.minQty, 0.001)),
    max_order_size: num(lot?.maxQty),
    min_notional: num(minNotional?.notional, 5),
    price_decimals: Number(row?.pricePrecision ?? 2),
    quantity_decimals: Number(row?.quantityPrecision ?? 3),
    max_leverage: maxLeverage,
    trigger_protect: num(row?.triggerProtect),
    order_types: Array.isArray(row?.orderTypes) ? row.orderTypes : [],
    time_in_force: Array.isArray(row?.timeInForce) ? row.timeInForce : [],
  };
}

async function getMarketInfo({ force = false } = {}) {
  if (!force && marketCache.rows.length && Date.now() - marketCache.at < MARKET_CACHE_MS) return marketCache.rows;
  const payload = await request('/fapi/v3/exchangeInfo');
  const rows = (Array.isArray(payload?.symbols) ? payload.symbols : [])
    .filter(row => row?.contractType === 'PERPETUAL'
      && row?.quoteAsset === 'USDT'
      && !String(row?.symbol || '').toUpperCase().startsWith('TEST'))
    .map(normalizeMarket)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  marketCache = { at: Date.now(), rows };
  return rows;
}

async function getPrices({ force = false } = {}) {
  if (!force && priceCache.rows.length && Date.now() - priceCache.at < PRICE_CACHE_MS) return priceCache.rows;
  const [marksRaw, tickersRaw, markets] = await Promise.all([
    request('/fapi/v3/premiumIndex'),
    request('/fapi/v3/ticker/24hr'),
    getMarketInfo({ force }),
  ]);
  const allowedMarkets = new Set(markets.map(row => row.aster_symbol));
  const marks = Array.isArray(marksRaw) ? marksRaw : [marksRaw];
  const tickers = new Map((Array.isArray(tickersRaw) ? tickersRaw : [tickersRaw]).map(row => [row?.symbol, row]));
  const rows = marks.filter(row => row?.symbol && allowedMarkets.has(row.symbol)).map((row) => {
    const ticker = tickers.get(row.symbol) || {};
    const mark = num(row?.markPrice || ticker?.lastPrice);
    return {
      dex: 'aster',
      symbol: symbolBase(row.symbol),
      market: row.symbol,
      mark: String(mark),
      mark_price: String(mark),
      mid: String(mark),
      price: String(mark),
      index_price: String(row?.indexPrice || ''),
      funding_rate: String(row?.lastFundingRate || '0'),
      next_funding_time: Number(row?.nextFundingTime || 0),
      price_change_24h: String(ticker?.priceChangePercent || '0'),
      volume_24h: String(ticker?.quoteVolume || '0'),
      high_24h: String(ticker?.highPrice || '0'),
      low_24h: String(ticker?.lowPrice || '0'),
    };
  });
  priceCache = { at: Date.now(), rows };
  return rows;
}

async function getDepth(symbol, limit = 100) {
  const market = String(symbol || '').toUpperCase().endsWith('USDT')
    ? String(symbol).toUpperCase()
    : `${symbolBase(symbol)}USDT`;
  const safeLimit = [5, 10, 20, 50, 100, 500, 1000].includes(Number(limit)) ? Number(limit) : 100;
  const key = `${market}:${safeLimit}`;
  const cached = depthCache.get(key);
  if (cached?.data && Date.now() - cached.at < DEPTH_CACHE_MS) return cached.data;
  if (cached?.pending) return cached.pending;
  const pending = request('/fapi/v3/depth', { searchParams: { symbol: market, limit: safeLimit } })
    .then((data) => {
      depthCache.set(key, { at: Date.now(), data });
      if (depthCache.size > 100) depthCache.delete(depthCache.keys().next().value);
      return data;
    })
    .catch((error) => {
      depthCache.delete(key);
      throw error;
    });
  depthCache.set(key, { at: cached?.at || 0, data: cached?.data, pending });
  return pending;
}

async function getKlines(symbol, interval = '5m', limit = 300) {
  const market = String(symbol || '').toUpperCase().endsWith('USDT')
    ? String(symbol).toUpperCase()
    : `${symbolBase(symbol)}USDT`;
  const allowedIntervals = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']);
  const safeInterval = allowedIntervals.has(String(interval)) ? String(interval) : '5m';
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 300));
  const key = `${market}:${safeInterval}:${safeLimit}`;
  const cached = klineCache.get(key);
  if (cached?.data && Date.now() - cached.at < KLINE_CACHE_MS) return cached.data;
  if (cached?.pending) return cached.pending;
  const pending = request('/fapi/v3/klines', { searchParams: { symbol: market, interval: safeInterval, limit: safeLimit } })
    .then((data) => {
      klineCache.set(key, { at: Date.now(), data });
      if (klineCache.size > 200) klineCache.delete(klineCache.keys().next().value);
      return data;
    })
    .catch((error) => {
      klineCache.delete(key);
      throw error;
    });
  klineCache.set(key, { at: cached?.at || 0, data: cached?.data, pending });
  return pending;
}

function getBuilderConfig() {
  const feeBps = Number((Number(ASTER_BUILDER_FEE_RATE) * 10_000).toFixed(8));
  return {
    configured: Boolean(ASTER_BUILDER_ADDRESS),
    active: Boolean(ASTER_BUILDER_ADDRESS),
    address: ASTER_BUILDER_ADDRESS || null,
    feeRate: ASTER_BUILDER_FEE_RATE,
    feeBps,
    name: ASTER_BUILDER_NAME,
    status: ASTER_BUILDER_ADDRESS ? 'configured' : 'pending_builder_address',
  };
}

function parseSignedPayload(payload) {
  const raw = String(payload || '');
  if (!raw || raw.length > 16_384 || /(?:^|&)signature=/iu.test(raw)) {
    throw Object.assign(new Error('Invalid Aster signed payload'), { status: 400 });
  }
  return { raw, params: new URLSearchParams(raw) };
}

function validateSignedRequest({ method, path, payload, signature, owner }) {
  const upperMethod = String(method || '').toUpperCase();
  const cleanPath = String(path || '').trim();
  const rule = SIGNED_ENDPOINTS.get(`${upperMethod} ${cleanPath}`);
  if (!rule) throw Object.assign(new Error('Aster endpoint is not allowed'), { status: 400 });
  if (!/^0x[0-9a-fA-F]{130}$/u.test(String(signature || ''))) {
    throw Object.assign(new Error('Invalid Aster signature'), { status: 400 });
  }
  const parsed = parseSignedPayload(payload);
  const requestOwner = normalizeAddress(parsed.params.get('user'));
  if (!requestOwner || requestOwner !== normalizeAddress(owner)) {
    throw Object.assign(new Error('Aster request owner does not match the wallet linked to this player'), { status: 403 });
  }
  if (!rule.management && !normalizeAddress(parsed.params.get('signer'))) {
    throw Object.assign(new Error('Aster Agent signer is required'), { status: 400 });
  }
  if (rule.management && String(parsed.params.get('signatureChainId') || '') !== '56') {
    throw Object.assign(new Error('Aster owner management signatureChainId must be 56'), { status: 400 });
  }
  if (cleanPath === '/fapi/v3/approveAgent') {
    if (String(parsed.params.get('canPerpTrade') || '').toLowerCase() !== 'true') {
      throw Object.assign(new Error('Clash Aster Agent must have perpetual trading permission'), { status: 400 });
    }
    if (String(parsed.params.get('canWithdraw') || '').toLowerCase() !== 'false') {
      throw Object.assign(new Error('Clash never authorizes Aster Agent withdrawals'), { status: 400 });
    }
    if (!normalizeAddress(parsed.params.get('agentAddress'))) {
      throw Object.assign(new Error('Valid Aster Agent address is required'), { status: 400 });
    }
  }
  if (cleanPath === '/fapi/v3/approveBuilder' && !ASTER_BUILDER_ADDRESS) {
    throw Object.assign(new Error('Clash Aster builder address is not configured yet'), { status: 503 });
  }
  if (!ASTER_BUILDER_ADDRESS && parsed.params.has('builder')) {
    throw Object.assign(new Error('Aster builder approval is disabled until Clash configures its registered builder address'), { status: 503 });
  }
  if (rule.order) {
    const reduceOnly = String(parsed.params.get('reduceOnly') || '').toLowerCase() === 'true';
    const closePosition = String(parsed.params.get('closePosition') || '').toLowerCase() === 'true';
    if (!reduceOnly && !closePosition) {
      if (!ASTER_BUILDER_ADDRESS) {
        throw Object.assign(new Error('Clash Aster builder address is not configured yet; opening trades are disabled'), { status: 503 });
      }
      if (normalizeAddress(parsed.params.get('builder')) !== ASTER_BUILDER_ADDRESS
        || String(parsed.params.get('feeRate') || '') !== ASTER_BUILDER_FEE_RATE) {
        throw Object.assign(new Error(`Aster opening order must use the configured Clash builder fee rate ${ASTER_BUILDER_FEE_RATE}`), { status: 400 });
      }
    }
  }
  if (ASTER_BUILDER_ADDRESS && (cleanPath === '/fapi/v3/approveAgent' || cleanPath === '/fapi/v3/approveBuilder')) {
    if (normalizeAddress(parsed.params.get('builder')) !== ASTER_BUILDER_ADDRESS
      || String(parsed.params.get('maxFeeRate') || '') !== ASTER_BUILDER_FEE_RATE) {
      throw Object.assign(new Error(`Aster approval must use the configured Clash builder fee rate ${ASTER_BUILDER_FEE_RATE}`), { status: 400 });
    }
  }
  return { method: upperMethod, path: cleanPath, payload: parsed.raw, signature: String(signature) };
}

async function forwardSignedRequest(input, owner) {
  const verified = validateSignedRequest({ ...input, owner });
  const wire = `${verified.payload}&signature=${encodeURIComponent(verified.signature)}`;
  if (verified.method === 'GET') return request(verified.path, { method: 'GET', rawQuery: wire });
  return request(verified.path, { method: verified.method, body: wire });
}

module.exports = {
  ASTER_API_BASE,
  ASTER_BUILDER_FEE_RATE,
  normalizeAddress,
  getBuilderConfig,
  getMarketInfo,
  getPrices,
  getDepth,
  getKlines,
  validateSignedRequest,
  forwardSignedRequest,
};
