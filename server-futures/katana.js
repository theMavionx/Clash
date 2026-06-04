// Katana Perps integration.
//
// Source of truth:
//   - Official SDK: @katanaperps/katana-perps-sdk
//   - REST docs: https://api-docs-v1-perps.katana.network
//   - SDK docs: https://sdk-js-docs-v1-perps.katana.network
//
// Private trading is per-user:
//   1. Browser stores the user's Katana API key/secret encrypted locally.
//   2. Browser wallet signs Katana EIP-712 typed data.
//   3. Server receives credentials only per request and submits the signed body
//      with Katana HMAC/API auth. No Katana user keys are persisted server-side.

const { v1: uuidv1 } = require('uuid');

const KATANA_REST_API =
  (process.env.KATANA_PERPS_API_URL || 'https://api-perps.katana.network/v1').replace(/\/+$/, '');
const KATANA_APP_URL =
  (process.env.KATANA_PERPS_APP_URL || 'https://perps.katana.network').replace(/\/+$/, '');
const KATANA_ACCESS_CODE =
  (process.env.KATANA_PERPS_REFERRAL_CODE || process.env.KATANA_PERPS_ACCESS_CODE || '914TO2TD').trim();
const REQUEST_TIMEOUT_MS = Math.max(1000, Math.min(15_000, Number(process.env.KATANA_PERPS_TIMEOUT_MS || 5000)));
const PUBLIC_CACHE_TTL_MS = Math.max(1000, Math.min(60_000, Number(process.env.KATANA_PERPS_PUBLIC_CACHE_TTL_MS || 10_000)));
const PUBLIC_STALE_TTL_MS = Math.max(PUBLIC_CACHE_TTL_MS, Math.min(900_000, Number(process.env.KATANA_PERPS_PUBLIC_STALE_TTL_MS || 300_000)));
const publicCache = new Map();

function sdk() {
  return require('@katanaperps/katana-perps-sdk');
}

function boolEnv(value) {
  return /^(1|true|yes)$/iu.test(String(value || '').trim());
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function isValidAccessCode(code) {
  const value = normalizeCode(code);
  return /^[A-Z0-9]{4,32}$/u.test(value);
}

function referralUrl(code = KATANA_ACCESS_CODE) {
  const value = normalizeCode(code);
  return value ? `${KATANA_APP_URL}/r/${encodeURIComponent(value)}` : KATANA_APP_URL;
}

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/u.test(String(value || '').trim());
}

function configStatus() {
  return {
    sdk: '@katanaperps/katana-perps-sdk',
    sdk_version: '2.0.0',
    api_url: KATANA_REST_API,
    app_url: KATANA_APP_URL,
    sandbox: boolEnv(process.env.KATANA_PERPS_SANDBOX),
    account_configured: false,
    trading_configured: false,
    credential_mode: 'per_user_api_key_secret_browser_eip712',
    required_user_fields: ['api_key', 'api_secret'],
    required_wallet: true,
    server_private_key_required: false,
    missing_env: [],
  };
}

function credentialStatus(creds) {
  const normalized = credentials(creds, { allowMissing: true });
  const missing = [];
  if (!normalized.apiKey) missing.push('api_key');
  if (!normalized.apiSecret) missing.push('api_secret');
  if (!normalized.wallet) missing.push('wallet');
  return {
    has_credentials: missing.length === 0,
    account_configured: missing.length === 0,
    trading_configured: missing.length === 0,
    wallet: normalized.wallet || '',
    missing_fields: missing,
    updated_at: creds?.updatedAt || null,
  };
}

function credentials(input = {}, options = {}) {
  const apiKey = String(input.apiKey || input.api_key || '').trim();
  const apiSecret = String(input.apiSecret || input.api_secret || '').trim();
  const wallet = String(input.wallet || input.account || '').trim();
  if (!options.allowMissing) {
    if (!apiKey) throw Object.assign(new Error('Katana API key required'), { status: 400 });
    if (!apiSecret) throw Object.assign(new Error('Katana API secret required'), { status: 400 });
    if (!isEvmAddress(wallet)) throw Object.assign(new Error('Katana wallet address required'), { status: 400 });
  }
  return { apiKey, apiSecret, wallet, updatedAt: input.updatedAt || null };
}

function authenticatedClient(credsInput) {
  const creds = credentials(credsInput);
  const { RestAuthenticatedClient } = sdk();
  return new RestAuthenticatedClient({
    sandbox: boolEnv(process.env.KATANA_PERPS_SANDBOX),
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
    baseURL: process.env.KATANA_PERPS_API_URL ? KATANA_REST_API : undefined,
  });
}

function nonce() {
  return uuidv1();
}

function walletParam(wallet, creds) {
  const value = String(wallet || creds?.wallet || '').trim();
  if (!isEvmAddress(value)) {
    throw Object.assign(new Error('Katana wallet address required'), { status: 400 });
  }
  return value;
}

async function fetchJson(path, params = undefined) {
  const url = new URL(`${KATANA_REST_API}${path}`);
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'ClashOfPerps/1.0 katana-public',
      },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const detail = typeof data === 'string' ? data : (data?.message || data?.code || text);
      const err = new Error(`Katana Perps API ${response.status}: ${detail || response.statusText}`);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function publicCacheKey(path, params) {
  const entries = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return `${path}?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

async function fetchPublicJson(path, params = undefined, ttlMs = PUBLIC_CACHE_TTL_MS) {
  const key = publicCacheKey(path, params);
  const now = Date.now();
  const cached = publicCache.get(key);
  if (cached?.data && now - cached.at <= ttlMs) return cached.data;
  try {
    const data = await fetchJson(path, params);
    publicCache.set(key, { data, at: now });
    return data;
  } catch (e) {
    if (cached?.data && now - cached.at <= PUBLIC_STALE_TTL_MS) {
      return cached.data;
    }
    throw e;
  }
}

function baseSymbol(market) {
  return String(market || '').split('-')[0].trim().toUpperCase();
}

function marketName(symbolOrMarket) {
  const raw = String(symbolOrMarket || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('-')) return raw;
  return `${raw.replace(/\/?USD[CT]?$/u, '')}-USD`;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMarket(row) {
  const symbol = baseSymbol(row?.market || row?.baseAsset);
  if (!symbol) return null;
  const maxLeverage = row?.maxLeverage ?? row?.maximumLeverage ?? row?.max_leverage ?? 50;
  return {
    symbol,
    base: symbol,
    pair: `${symbol}/USD`,
    market: row.market,
    market_name: row.market,
    lot_size: row.stepSize || row.step_size || '0.0001',
    tick_size: row.tickSize || row.tick_size || '0.01',
    min_order_size: row.minOrderSize || row.minimumOrderSize || '0',
    max_leverage: num(maxLeverage, 50),
    mark: num(row.indexPrice ?? row.markPrice),
    oracle: num(row.indexPrice ?? row.markPrice),
    funding_rate: num(row.currentFundingRate ?? row.lastFundingRate),
    next_funding_rate: num(row.currentFundingRate ?? row.lastFundingRate),
    volume_24h: num(row.quoteVolume ?? row.volume24h),
    open_interest: num(row.openInterest ?? row.open_interest),
    _raw: row,
  };
}

function normalizePrice(row) {
  const symbol = baseSymbol(row?.market);
  if (!symbol) return null;
  return {
    symbol,
    mark: String(row.close ?? row.markPrice ?? row.indexPrice ?? ''),
    oracle: String(row.close ?? row.markPrice ?? row.indexPrice ?? ''),
    yesterday_price: String(row.open ?? ''),
    volume_24h: String(row.quoteVolume ?? row.volume24h ?? 0),
    open_interest: String(row.openInterest ?? row.open_interest ?? 0),
    bid: row.bid,
    ask: row.ask,
    funding_rate: row.currentFundingRate ?? row.lastFundingRate,
    _raw: row,
  };
}

function normalizePosition(row) {
  const symbol = baseSymbol(row?.market);
  const qty = num(row?.quantity);
  return {
    symbol,
    side: qty < 0 ? 'short' : 'long',
    amount: String(Math.abs(qty)),
    quantity: row?.quantity,
    entry_price: row?.entryPrice,
    mark_price: row?.markPrice,
    liquidation_price: row?.liquidationPrice,
    pnl: row?.unrealizedPnL,
    unrealized_pnl: row?.unrealizedPnL,
    realized_pnl: row?.realizedPnL,
    margin: row?.marginRequirement,
    leverage: row?.leverage,
    value: row?.value,
    market: row?.market,
    pair_index: row?.market,
    trade_index: row?.openedByFillId || row?.lastFillId || row?.market,
    _raw: row,
  };
}

function normalizeOrder(row) {
  const symbol = baseSymbol(row?.market);
  return {
    symbol,
    side: row?.side === 'sell' ? 'short' : 'long',
    order_id: row?.orderId,
    client_order_id: row?.clientOrderId,
    price: row?.price,
    amount: row?.originalQuantity,
    filled: row?.executedQuantity,
    status: row?.status,
    type: row?.type,
    tif: row?.timeInForce,
    reduce_only: row?.reduceOnly,
    market: row?.market,
    pair_index: row?.market,
    trade_index: row?.orderId,
    _raw: row,
  };
}

function normalizeSide(side) {
  const value = String(side || '').trim().toLowerCase();
  if (value === 'buy' || value === 'long') return 'buy';
  if (value === 'sell' || value === 'short') return 'sell';
  throw Object.assign(new Error('Katana order side must be long/buy or short/sell'), { status: 400 });
}

function normalizeOrderType(type, isMarket) {
  const { OrderType } = sdk();
  const value = String(type || '').trim();
  if (!value) return isMarket ? OrderType.market : OrderType.limit;
  if (Object.values(OrderType).includes(value)) return value;
  const lower = value.toLowerCase();
  if (lower === 'market') return OrderType.market;
  if (lower === 'limit') return OrderType.limit;
  throw Object.assign(new Error('Unsupported Katana order type'), { status: 400 });
}

function normalizeTif(value) {
  const { TimeInForce, SelfTradePrevention } = sdk();
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'gtc') return { timeInForce: TimeInForce.gtc };
  if (raw === 'gtx' || raw === 'post_only' || raw === 'post-only') return { timeInForce: TimeInForce.gtx };
  if (raw === 'ioc') return { timeInForce: TimeInForce.ioc };
  if (raw === 'fok') return { timeInForce: TimeInForce.fok, selfTradePrevention: SelfTradePrevention.cn };
  throw Object.assign(new Error('Unsupported Katana timeInForce'), { status: 400 });
}

function orderParams(input = {}, creds, options = {}) {
  const { OrderType } = sdk();
  const type = normalizeOrderType(input.type || input.orderType || input.order_type, options.market);
  const params = {
    type,
    side: normalizeSide(input.side),
    nonce: nonce(),
    wallet: walletParam(input.wallet, creds),
    market: marketName(input.market || input.symbol),
    quantity: String(input.quantity || input.amount || ''),
  };
  if (!params.quantity || !(Number(params.quantity) > 0)) {
    throw Object.assign(new Error('Katana order quantity required in base terms'), { status: 400 });
  }
  if (input.clientOrderId || input.client_order_id) params.clientOrderId = String(input.clientOrderId || input.client_order_id).slice(0, 40);
  if (input.reduceOnly !== undefined || input.reduce_only !== undefined) params.reduceOnly = !!(input.reduceOnly ?? input.reduce_only);
  if (type === OrderType.limit) {
    const price = String(input.price || '').trim();
    if (!price || !(Number(price) > 0)) throw Object.assign(new Error('Katana limit order price required'), { status: 400 });
    params.price = price;
    Object.assign(params, normalizeTif(input.timeInForce || input.time_in_force || input.tif || 'gtc'));
  }
  if (input.triggerPrice || input.trigger_price) params.triggerPrice = String(input.triggerPrice || input.trigger_price);
  if (input.triggerType || input.trigger_type) params.triggerType = String(input.triggerType || input.trigger_type).toLowerCase();
  return params;
}

function cancelParams(input = {}, creds) {
  const params = {
    nonce: nonce(),
    wallet: walletParam(input.wallet, creds),
  };
  if (input.market || input.symbol) params.market = marketName(input.market || input.symbol);
  const ids = input.orderIds || input.order_ids || input.orderId || input.order_id || input.clientOrderId || input.client_order_id;
  if (ids) {
    params.orderIds = (Array.isArray(ids) ? ids : [ids]).map(id => {
      const value = String(id);
      if (input.clientOrderId || input.client_order_id) return value.startsWith('client:') ? value : `client:${value}`;
      return value;
    });
  }
  return params;
}

function typedDataPayload(parts) {
  const [domain, types, message] = parts;
  const primaryType = Object.keys(types || {}).find(key => key !== 'EIP712Domain');
  return { domain, types, primaryType, message };
}

async function typedDataFor(credsInput, kind, params) {
  credentials(credsInput);
  const exchange = await getExchange();
  const chainId = exchange?.chainId;
  const exchangeContractAddress = exchange?.exchangeContractAddress;
  if (!chainId || !exchangeContractAddress) {
    throw Object.assign(new Error('Katana exchange contract metadata unavailable'), { status: 502 });
  }
  const katana = sdk();
  if (kind === 'associateWallet') {
    return typedDataPayload(katana.getWalletAssociationSignatureTypedData(params, exchangeContractAddress, chainId, boolEnv(process.env.KATANA_PERPS_SANDBOX)));
  }
  if (kind === 'cancelOrders') {
    return typedDataPayload(katana.getOrderCancellationSignatureTypedData(params, exchangeContractAddress, chainId, boolEnv(process.env.KATANA_PERPS_SANDBOX)));
  }
  return typedDataPayload(katana.getOrderSignatureTypedData(params, exchangeContractAddress, chainId, boolEnv(process.env.KATANA_PERPS_SANDBOX)));
}

async function getHealth() {
  await fetchJson('/ping');
  const time = await fetchJson('/time').catch(() => null);
  return {
    ok: true,
    dex: 'katana',
    api: KATANA_REST_API,
    app: KATANA_APP_URL,
    server_time: time?.serverTime ?? null,
    access_code_configured: !!KATANA_ACCESS_CODE,
    access_code: KATANA_ACCESS_CODE || null,
    referral_url: referralUrl(),
    ...configStatus(),
  };
}

async function getExchange() {
  return fetchPublicJson('/exchange', undefined, 60_000);
}

async function getMarketInfo() {
  const rows = await fetchPublicJson('/markets', undefined, 60_000);
  return (Array.isArray(rows) ? rows : []).map(normalizeMarket).filter(Boolean);
}

async function getPrices() {
  const rows = await fetchPublicJson('/tickers', undefined, 10_000);
  const out = {};
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const price = normalizePrice(row);
    if (price?.symbol) out[price.symbol] = price;
  }
  return out;
}

async function getOrderbook(symbol, limit = 25, level = 2) {
  return fetchPublicJson('/orderbook', {
    market: marketName(symbol || 'BTC'),
    limit: Math.max(1, Math.min(100, Number(limit) || 25)),
    level: level === 1 ? 1 : 2,
  }, 2_000);
}

async function getFundingRates(params = {}) {
  return fetchPublicJson('/fundingRates', params, 30_000);
}

async function getAccount(credsInput, wallet) {
  const creds = credentials(credsInput);
  const client = authenticatedClient(creds);
  const rows = await client.getWallets({
    nonce: nonce(),
    wallet: walletParam(wallet, creds),
    includePositions: true,
  });
  const account = Array.isArray(rows) ? rows[0] : rows;
  if (!account) return null;
  return {
    ...account,
    balance: account.equity,
    usdc: account.availableCollateral,
    available_to_spend: account.availableCollateral,
    free_collateral: account.freeCollateral,
    positions: Array.isArray(account.positions) ? account.positions.map(normalizePosition) : [],
    _raw: account,
  };
}

async function getPositions(credsInput, wallet, params = {}) {
  const creds = credentials(credsInput);
  const client = authenticatedClient(creds);
  const rows = await client.getPositions({
    nonce: nonce(),
    wallet: walletParam(wallet, creds),
    ...(params.market ? { market: marketName(params.market) } : {}),
  });
  return (Array.isArray(rows) ? rows : []).map(normalizePosition);
}

async function getOrders(credsInput, wallet, params = {}) {
  const creds = credentials(credsInput);
  const client = authenticatedClient(creds);
  const query = {
    nonce: nonce(),
    wallet: walletParam(wallet, creds),
    limit: Math.max(1, Math.min(1000, Number(params.limit || 100))),
  };
  if (params.market) query.market = marketName(params.market);
  if (params.closed !== undefined) query.closed = !!params.closed;
  const rows = await client.getOrders(query);
  return (Array.isArray(rows) ? rows : []).map(normalizeOrder);
}

async function getFills(credsInput, wallet, params = {}) {
  const creds = credentials(credsInput);
  const client = authenticatedClient(creds);
  const query = {
    nonce: nonce(),
    wallet: walletParam(wallet, creds),
    limit: Math.max(1, Math.min(1000, Number(params.limit || 100))),
  };
  if (params.market) query.market = marketName(params.market);
  if (params.fromId) query.fromId = String(params.fromId);
  const rows = await client.getFills(query);
  return Array.isArray(rows) ? rows : [];
}

async function prepareAssociateWallet(credsInput, wallet, referralCode = KATANA_ACCESS_CODE) {
  const creds = credentials(credsInput);
  const parameters = {
    nonce: nonce(),
    wallet: walletParam(wallet, creds),
  };
  return {
    endpoint: '/wallets',
    method: 'POST',
    referralCode: normalizeCode(referralCode) || undefined,
    parameters,
    typedData: await typedDataFor(creds, 'associateWallet', parameters),
  };
}

async function submitAssociateWallet(credsInput, body = {}) {
  const client = authenticatedClient(credsInput);
  const parameters = body.parameters || body.params;
  const signature = String(body.signature || '').trim();
  if (!parameters || !signature) throw Object.assign(new Error('Katana association parameters and signature required'), { status: 400 });
  return client.post('/wallets', {
    referralCode: body.referralCode || body.referral_code || undefined,
    parameters,
    signature,
  });
}

async function prepareOrder(credsInput, input = {}) {
  const creds = credentials(credsInput);
  const parameters = orderParams(input, creds, { market: String(input.type || input.orderType || '').toLowerCase() === 'market' });
  return {
    endpoint: '/orders',
    method: 'POST',
    parameters,
    typedData: await typedDataFor(creds, 'createOrder', parameters),
  };
}

async function submitOrder(credsInput, body = {}) {
  const client = authenticatedClient(credsInput);
  const parameters = body.parameters || body.params;
  const signature = String(body.signature || '').trim();
  if (!parameters || !signature) throw Object.assign(new Error('Katana order parameters and signature required'), { status: 400 });
  const result = await client.post('/orders', { parameters, signature });
  return { ...normalizeOrder(result), _raw: result };
}

async function prepareCancelOrders(credsInput, input = {}) {
  const creds = credentials(credsInput);
  const parameters = cancelParams(input, creds);
  return {
    endpoint: '/orders',
    method: 'DELETE',
    parameters,
    typedData: await typedDataFor(creds, 'cancelOrders', parameters),
  };
}

async function submitCancelOrders(credsInput, body = {}) {
  const client = authenticatedClient(credsInput);
  const parameters = body.parameters || body.params;
  const signature = String(body.signature || '').trim();
  if (!parameters || !signature) throw Object.assign(new Error('Katana cancel parameters and signature required'), { status: 400 });
  return client.delete('/orders', { parameters, signature });
}

function checkAccessCode(code = KATANA_ACCESS_CODE) {
  const value = normalizeCode(code);
  return {
    code: value || null,
    configured: !!KATANA_ACCESS_CODE,
    provided: !!value,
    valid_format: isValidAccessCode(value),
    verified_by_katana: false,
    verification_note: 'Katana Perps validates/redeems access codes inside the official wallet connect flow.',
    referral_url: referralUrl(value || KATANA_ACCESS_CODE),
    app_url: KATANA_APP_URL,
  };
}

module.exports = {
  KATANA_REST_API,
  KATANA_APP_URL,
  KATANA_ACCESS_CODE,
  cancelParams,
  checkAccessCode,
  configStatus,
  credentialStatus,
  credentials,
  getAccount,
  getExchange,
  getFills,
  getFundingRates,
  getHealth,
  getMarketInfo,
  getOrderbook,
  getOrders,
  getPositions,
  getPrices,
  isEvmAddress,
  isValidAccessCode,
  marketName,
  normalizeCode,
  orderParams,
  prepareAssociateWallet,
  prepareCancelOrders,
  prepareOrder,
  referralUrl,
  submitAssociateWallet,
  submitCancelOrders,
  submitOrder,
};
