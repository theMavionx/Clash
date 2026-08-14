const got = require('got');
const { privateKeyToAccount } = require('viem/accounts');

const ASTER_API_BASE = String(process.env.ASTER_API_URL || 'https://fapi.asterdex.com').replace(/\/+$/u, '');
const ASTER_API_TIMEOUT_MS = Math.max(2_000, Math.min(20_000, Number(process.env.ASTER_API_TIMEOUT_MS || 8_000)));
const ASTER_BUILDER_ADDRESS = normalizeAddress(process.env.ASTER_BUILDER_ADDRESS || process.env.ASTER_BUILDER_CODE || '');
// Aster expresses builder fees as a decimal fraction: 0.0001 = 1 basis point.
const ASTER_DEFAULT_BUILDER_FEE_RATE = '0.0001';
const configuredFeeRate = String(process.env.ASTER_BUILDER_FEE_RATE || ASTER_DEFAULT_BUILDER_FEE_RATE).trim();
const ASTER_BUILDER_FEE_RATE = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/u.test(configuredFeeRate)
  && Number(configuredFeeRate) >= 0
  && Number(configuredFeeRate) <= 0.01
  ? configuredFeeRate
  : ASTER_DEFAULT_BUILDER_FEE_RATE;
const ASTER_BUILDER_NAME = String(process.env.ASTER_BUILDER_NAME || 'clashofperps').trim().slice(0, 64) || 'clashofperps';
const ASTER_BUILDER_SIGNER_PRIVATE_KEY = normalizePrivateKey(process.env.ASTER_BUILDER_SIGNER_PRIVATE_KEY || '');
const ASTER_BUILDER_SIGNER_ADDRESS = normalizeAddress(process.env.ASTER_BUILDER_SIGNER_ADDRESS || '');
const ASTER_MESSAGE_DOMAIN = Object.freeze({
  name: 'AsterSignTransaction',
  version: '1',
  chainId: 1666,
  verifyingContract: '0x0000000000000000000000000000000000000000',
});
const ASTER_MESSAGE_TYPES = Object.freeze({
  Message: Object.freeze([{ name: 'msg', type: 'string' }]),
});

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

function normalizePrivateKey(value) {
  const text = String(value || '').trim();
  if (/^0x[0-9a-fA-F]{64}$/u.test(text)) return text;
  if (/^[0-9a-fA-F]{64}$/u.test(text)) return `0x${text}`;
  return '';
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
    tracking: getBuilderTrackingConfig(),
  };
}

function getBuilderSignerAccount() {
  if (!ASTER_BUILDER_SIGNER_PRIVATE_KEY) return null;
  try {
    const account = privateKeyToAccount(ASTER_BUILDER_SIGNER_PRIVATE_KEY);
    if (ASTER_BUILDER_SIGNER_ADDRESS
      && normalizeAddress(account.address) !== ASTER_BUILDER_SIGNER_ADDRESS) {
      return null;
    }
    return account;
  } catch {
    return null;
  }
}

function getBuilderTrackingConfig() {
  const signer = getBuilderSignerAccount();
  return {
    orderProofs: Boolean(ASTER_BUILDER_ADDRESS),
    userTradeReconciliation: Boolean(ASTER_BUILDER_ADDRESS),
    exactBuilderFeed: Boolean(ASTER_BUILDER_ADDRESS && signer),
    exactBuilderFeedWindowDays: 30,
    signerAddress: signer ? normalizeAddress(signer.address) : (ASTER_BUILDER_SIGNER_ADDRESS || null),
    status: !ASTER_BUILDER_ADDRESS
      ? 'pending_builder_address'
      : signer
        ? 'exact_feed_ready'
        : 'order_proof_tracking_ready',
  };
}

function parseSignedPayload(payload) {
  const raw = String(payload || '');
  if (!raw || raw.length > 16_384 || /(?:^|&)signature=/iu.test(raw)) {
    throw Object.assign(new Error('Invalid Aster signed payload'), { status: 400 });
  }
  return { raw, params: new URLSearchParams(raw) };
}

function orderResponseIdentity(response, requestParams) {
  const candidates = [
    response,
    response?.data,
    response?.result,
    response?.response,
    response?.data?.data,
    response?.data?.result,
  ].filter(value => value && typeof value === 'object' && !Array.isArray(value));
  let orderId = '';
  let clientOrderId = String(requestParams?.get('newClientOrderId') || '').trim();
  for (const candidate of candidates) {
    orderId ||= String(candidate.orderId ?? candidate.orderID ?? candidate.id ?? '').trim();
    clientOrderId ||= String(candidate.clientOrderId ?? candidate.clientOrderID ?? '').trim();
  }
  return { orderId, clientOrderId };
}

function builderOrderProofFromRequest({ method, path, payload, response, owner }) {
  if (String(method || '').toUpperCase() !== 'POST' || String(path || '') !== '/fapi/v3/order') return null;
  const parsed = parseSignedPayload(payload);
  const requestOwner = normalizeAddress(parsed.params.get('user'));
  const signer = normalizeAddress(parsed.params.get('signer'));
  const builderAddress = normalizeAddress(parsed.params.get('builder'));
  const builderFeeRate = String(parsed.params.get('feeRate') || '').trim();
  if (!requestOwner || requestOwner !== normalizeAddress(owner) || !signer) return null;
  if (!ASTER_BUILDER_ADDRESS || builderAddress !== ASTER_BUILDER_ADDRESS
    || builderFeeRate !== ASTER_BUILDER_FEE_RATE) return null;
  const identity = orderResponseIdentity(response, parsed.params);
  const proofOrderId = identity.orderId || (identity.clientOrderId ? `client:${identity.clientOrderId}` : '');
  if (!proofOrderId) return null;
  return {
    orderId: proofOrderId,
    upstreamOrderId: identity.orderId || null,
    clientOrderId: identity.clientOrderId || null,
    account: requestOwner,
    signer,
    symbol: String(parsed.params.get('symbol') || '').trim().toUpperCase(),
    side: String(parsed.params.get('side') || '').trim().toUpperCase(),
    orderType: String(parsed.params.get('type') || '').trim().toUpperCase(),
    reduceOnly: String(parsed.params.get('reduceOnly') || '').toLowerCase() === 'true'
      || String(parsed.params.get('closePosition') || '').toLowerCase() === 'true',
    builderAddress,
    builderFeeRate,
    builderFeeBps: Number((Number(builderFeeRate) * 10_000).toFixed(8)),
    request: Object.fromEntries(parsed.params.entries()),
    response,
  };
}

function rowsFromUserTradesPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function tradeTimestampIso(row) {
  const value = Number(row?.time ?? row?.insertTime ?? row?.updateTime ?? row?.timestamp);
  if (!(value > 0)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function importUserTradesForPlayer({ db, playerId, account, payload }) {
  if (!db || !playerId || !normalizeAddress(account)) {
    return { scanned: 0, eligible: 0, imported: 0, updated: 0 };
  }
  const owner = normalizeAddress(account);
  const rows = rowsFromUserTradesPayload(payload);
  let eligible = 0;
  let imported = 0;
  let updated = 0;
  for (const row of rows) {
    const tradeId = String(row?.id ?? row?.tradeId ?? '').trim();
    const orderId = String(row?.orderId ?? row?.orderID ?? '').trim();
    const clientOrderId = String(row?.clientOrderId ?? row?.clientOrderID ?? '').trim();
    if (!tradeId || (!orderId && !clientOrderId)) continue;
    const orderProof = (orderId
      ? db.getAsterBuilderOrder(orderId, playerId, owner)
      : null) || (clientOrderId
      ? db.getAsterBuilderOrderByClient(clientOrderId, playerId, owner)
      : null);
    if (!orderProof
      || normalizeAddress(orderProof.builder_address) !== ASTER_BUILDER_ADDRESS
      || String(orderProof.builder_fee_rate || '') !== ASTER_BUILDER_FEE_RATE) continue;
    eligible += 1;
    const price = String(row?.price ?? row?.avgPrice ?? '0');
    const amount = String(row?.qty ?? row?.quantity ?? row?.executedQty ?? '0');
    const notional = num(row?.quoteQty ?? row?.totalQuota ?? row?.cumQuote, Math.abs(num(price) * num(amount)));
    const exactBuilderFee = row?.builderFee == null || row?.builderFee === '' ? null : String(row.builderFee);
    const result = db.upsertVerifiedTrade(playerId, {
      symbol: symbolBase(row?.symbol || orderProof.symbol),
      side: String(row?.side || orderProof.side).toUpperCase() === 'BUY' ? 'bid' : 'ask',
      orderType: String(orderProof.order_type || 'fill').toLowerCase(),
      amount,
      price,
      orderId: orderId || orderProof.order_id,
      clientOrderId: `aster:fill:${owner}:${tradeId}`,
      status: 'filled',
      dex: 'aster',
      notional_usd: Math.abs(notional),
      verifiedSource: 'aster_builder_fill',
      fee: exactBuilderFee,
      proofJson: JSON.stringify({
        source: 'aster_user_trade_order_proof',
        venue: 'aster',
        fill_id: tradeId,
        builder_order_id: orderProof.order_id,
        builder_address: orderProof.builder_address,
        builder_fee_rate: orderProof.builder_fee_rate,
        builder_fee_bps: orderProof.builder_fee_bps,
        exact_builder_fee: exactBuilderFee,
        fill: row,
      }),
      createdAt: tradeTimestampIso(row),
    });
    imported += Number(result?.inserted || 0);
    updated += Number(result?.updated || 0);
  }
  return { scanned: rows.length, eligible, imported, updated };
}

let lastBuilderNonce = 0n;
function nextBuilderNonce() {
  const candidate = BigInt(Date.now()) * 1000n;
  lastBuilderNonce = candidate > lastBuilderNonce ? candidate : lastBuilderNonce + 1n;
  return lastBuilderNonce.toString();
}

async function buildBuilderTradesSignedQuery(entries = []) {
  if (!ASTER_BUILDER_ADDRESS) throw new Error('Aster builder address is not configured');
  const account = getBuilderSignerAccount();
  if (!account) throw new Error('Aster builder signer credential is not configured');
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') params.append(String(key), String(value));
  }
  params.append('nonce', nextBuilderNonce());
  params.append('signer', normalizeAddress(account.address));
  const payload = params.toString();
  const signature = await account.signTypedData({
    domain: ASTER_MESSAGE_DOMAIN,
    types: ASTER_MESSAGE_TYPES,
    primaryType: 'Message',
    message: { msg: payload },
  });
  return { payload, signature, signer: normalizeAddress(account.address) };
}

async function fetchBuilderTrades({ startTime = null, endTime = null, limit = 1000, pageCap = 50 } = {}) {
  const now = Date.now();
  const safeStart = Math.max(now - (30 * 24 * 60 * 60 * 1000), Number(startTime) || 0);
  const safeEnd = Math.max(safeStart, Math.min(now, Number(endTime) || now));
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 1000));
  const safePageCap = Math.max(1, Math.min(100, Number(pageCap) || 50));
  const rows = [];
  let total = 0;
  for (let page = 1; page <= safePageCap; page += 1) {
    const signed = await buildBuilderTradesSignedQuery([
      ['startTime', safeStart],
      ['endTime', safeEnd],
      ['page', page],
      ['limit', safeLimit],
    ]);
    const payload = await request('/fapi/v3/builder/userTrades', {
      method: 'GET',
      rawQuery: `${signed.payload}&signature=${encodeURIComponent(signed.signature)}`,
    });
    const pageRows = rowsFromUserTradesPayload(payload);
    rows.push(...pageRows);
    total = Math.max(total, Number(payload?.total) || rows.length);
    if (!payload?.hasMore || pageRows.length < safeLimit) break;
  }
  return { rows, total, startTime: safeStart, endTime: safeEnd };
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
  getBuilderTrackingConfig,
  builderOrderProofFromRequest,
  importUserTradesForPlayer,
  buildBuilderTradesSignedQuery,
  fetchBuilderTrades,
  getMarketInfo,
  getPrices,
  getDepth,
  getKlines,
  validateSignedRequest,
  forwardSignedRequest,
};
