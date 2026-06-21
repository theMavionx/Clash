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
  (process.env.KATANA_PERPS_REFERRAL_CODE || process.env.KATANA_PERPS_ACCESS_CODE || 'CLASHOFPERPS').trim();
const KATANA_BUILDER_CODE =
  (process.env.KATANA_PERPS_BUILDER_CODE || process.env.KATANA_BUILDER_CODE || 'B:Px8lQrCA').trim();
const REQUEST_TIMEOUT_MS = Math.max(1000, Math.min(15_000, Number(process.env.KATANA_PERPS_TIMEOUT_MS || 5000)));
const PUBLIC_CACHE_TTL_MS = Math.max(1000, Math.min(60_000, Number(process.env.KATANA_PERPS_PUBLIC_CACHE_TTL_MS || 10_000)));
const PUBLIC_STALE_TTL_MS = Math.max(PUBLIC_CACHE_TTL_MS, Math.min(900_000, Number(process.env.KATANA_PERPS_PUBLIC_STALE_TTL_MS || 300_000)));
const publicCache = new Map();
const KATANA_DEBUG = process.env.KATANA_DEBUG === '1';

function redact(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 10) return `${text.slice(0, 2)}...${text.slice(-2)}`;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function logKatana(label, payload = undefined) {
  if (!KATANA_DEBUG) return;
  try {
    if (payload === undefined) console.log(`[katana] ${label}`);
    else console.log(`[katana] ${label}`, payload);
  } catch {}
}

function errorInfo(e) {
  return {
    name: e?.name,
    message: e?.message,
    status: e?.status || e?.statusCode || e?.response?.status,
    code: e?.code,
    response: e?.response?.data,
    stack: e?.stack,
  };
}

function jsonSafe(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value;
}

function arrayRows(payload, ...keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

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

function validBuilderCode(code) {
  const value = String(code || '').trim();
  return /^B:[A-Za-z0-9]{8}$/u.test(value) ? value : '';
}

function stripBuilderCode(clientOrderId) {
  return String(clientOrderId || '').trim().replace(/^B:[A-Za-z0-9]{8}/u, '');
}

function katanaClientOrderId(input = {}) {
  const prefix = validBuilderCode(KATANA_BUILDER_CODE);
  const provided = stripBuilderCode(input.clientOrderId || input.client_order_id);
  const fallback = uuidv1().replace(/-/g, '');
  const suffix = String(provided || fallback)
    .replace(/[^\x21-\x7e]/g, '')
    .slice(0, prefix ? 30 : 40);
  return `${prefix}${suffix}`.slice(0, 40);
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
    builder_code_configured: !!validBuilderCode(KATANA_BUILDER_CODE),
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
  logKatana('authenticated client', {
    api_url: KATANA_REST_API,
    sandbox: boolEnv(process.env.KATANA_PERPS_SANDBOX),
    has_api_key: !!creds.apiKey,
    has_api_secret: !!creds.apiSecret,
    wallet: redact(creds.wallet),
    override_base_url: !!process.env.KATANA_PERPS_API_URL,
  });
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
  const rawSide = String(row?.side || row?.positionSide || '').trim().toLowerCase();
  const side = rawSide === 'buy' || rawSide === 'long' || rawSide === 'bid'
    ? 'bid'
    : rawSide === 'sell' || rawSide === 'short' || rawSide === 'ask'
      ? 'ask'
      : qty < 0 ? 'ask' : 'bid';
  return {
    symbol,
    side,
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

function logPositions(label, rows, normalized) {
  logKatana(label, {
    count: Array.isArray(normalized) ? normalized.length : 0,
    rows: (Array.isArray(rows) ? rows : []).slice(0, 10).map((row, index) => ({
      index,
      market: row?.market,
      side: row?.side ?? row?.positionSide,
      quantity: row?.quantity,
      entryPrice: row?.entryPrice,
      markPrice: row?.markPrice,
      liquidationPrice: row?.liquidationPrice,
      unrealizedPnL: row?.unrealizedPnL,
      realizedPnL: row?.realizedPnL,
      marginRequirement: row?.marginRequirement,
      normalized_side: normalized?.[index]?.side,
      normalized_pnl: normalized?.[index]?.unrealized_pnl ?? normalized?.[index]?.pnl,
    })),
  });
}

function normalizeOrder(row) {
  const symbol = baseSymbol(row?.market);
  const type = row?.type;
  const triggerPrice = row?.triggerPrice || row?.trigger_price;
  return {
    symbol,
    side: row?.side === 'sell' ? 'short' : 'long',
    order_id: row?.orderId,
    client_order_id: row?.clientOrderId,
    price: row?.price,
    stop_price: triggerPrice || null,
    trigger_price: triggerPrice || null,
    amount: row?.originalQuantity,
    filled: row?.executedQuantity,
    status: row?.status,
    type,
    order_type: type === 'takeProfitMarket'
      ? 'take_profit'
      : type === 'stopLossMarket'
        ? 'stop_loss'
        : type,
    tif: row?.timeInForce,
    reduce_only: row?.reduceOnly,
    trigger_type: row?.triggerType || row?.trigger_type || null,
    is_trigger: !!triggerPrice || /stopLoss|takeProfit|trailingStop/i.test(String(type || '')),
    market: row?.market,
    pair_index: row?.market,
    trade_index: row?.orderId,
    _raw: row,
  };
}

function valueOf(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function normalizeFill(wallet, fill) {
  const market = valueOf(fill, 'market', 'symbol', 'instrument', 'instrumentName');
  const symbol = baseSymbol(market);
  if (!symbol) return null;
  const quantity = Math.abs(num(valueOf(
    fill,
    'quantity',
    'executedQuantity',
    'baseQuantity',
    'baseQty',
    'size',
    'filledQuantity',
  )));
  const price = Math.abs(num(valueOf(fill, 'price', 'executionPrice', 'avgExecutionPrice', 'fillPrice')));
  const quote = Math.abs(num(valueOf(
    fill,
    'quoteQuantity',
    'quoteQty',
    'notional',
    'notionalUsd',
    'notional_usd',
    'value',
  )));
  const notional = quote || (quantity && price ? quantity * price : 0);
  if (!Number.isFinite(notional) || notional < 10 || notional > 10_000_000) return null;
  const rawSide = String(valueOf(fill, 'side', 'takerSide', 'direction') || '').trim().toLowerCase();
  const reduceOnly = !!valueOf(fill, 'reduceOnly', 'reduce_only');
  const side = reduceOnly
    ? (rawSide === 'sell' || rawSide === 'short' || rawSide === 'ask' ? 'close_long' : 'close_short')
    : (rawSide === 'sell' || rawSide === 'short' || rawSide === 'ask' ? 'short' : 'long');
  const fillId = String(valueOf(fill, 'fillId', 'fill_id', 'tradeId', 'trade_id', 'id', 'executionId') || '').trim();
  const orderId = String(valueOf(fill, 'orderId', 'order_id') || '').trim();
  const clientOrderId = String(valueOf(fill, 'clientOrderId', 'client_order_id') || '').trim();
  const key = `katana:${String(wallet || '').toLowerCase()}:${fillId || orderId || clientOrderId || `${market}:${side}:${quantity}:${price}`}`;
  const timestamp = valueOf(fill, 'createdAt', 'created_at', 'timestamp', 'time', 'filledAt', 'filled_at');
  const tsMs = typeof timestamp === 'number'
    ? (timestamp > 1e12 ? timestamp : timestamp * 1000)
    : Date.parse(String(timestamp || ''));
  return {
    symbol,
    side,
    orderType: reduceOnly ? 'close' : String(valueOf(fill, 'orderType', 'order_type', 'type') || 'market'),
    amount: String(quantity || ''),
    price: String(price || ''),
    orderId: orderId || fillId || null,
    clientOrderId: key,
    status: 'filled',
    dex: 'katana',
    notional_usd: notional,
    verifiedSource: 'katana_api',
    fee: valueOf(fill, 'builderFee', 'builder_fee', 'fee') != null ? String(valueOf(fill, 'builderFee', 'builder_fee', 'fee')) : null,
    proofJson: JSON.stringify({
      source: 'katana_fill_api',
      wallet: String(wallet || '').toLowerCase(),
      fill_id: fillId || null,
      order_id: orderId || null,
      client_order_id: clientOrderId || null,
      raw: fill,
    }),
    createdAt: Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : null,
    _raw: fill,
  };
}

function normalizeSide(side) {
  const value = String(side || '').trim().toLowerCase();
  if (value === 'buy' || value === 'long' || value === 'bid') return 'buy';
  if (value === 'sell' || value === 'short' || value === 'ask') return 'sell';
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
  if (lower === 'takeprofitmarket' || lower === 'take_profit_market' || lower === 'take-profit-market' || lower === 'tp') return OrderType.takeProfitMarket;
  if (lower === 'stoplossmarket' || lower === 'stop_loss_market' || lower === 'stop-loss-market' || lower === 'sl') return OrderType.stopLossMarket;
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

function formatQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const floored = Math.floor((n + 1e-12) * 10_000) / 10_000;
  if (!(floored > 0)) return '';
  return floored.toFixed(8);
}

function decimalPlacesFromStep(value, fallback = 8) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw.includes('e-')) {
    const exp = Number(raw.split('e-')[1]);
    return Number.isFinite(exp) ? Math.max(0, Math.min(8, exp)) : fallback;
  }
  const [, frac = ''] = raw.split('.');
  return Math.max(0, Math.min(8, frac.replace(/0+$/u, '').length));
}

function formatPrice(value, market = null, label = 'Katana price') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw Object.assign(new Error(`${label} required`), { status: 400 });
  }
  const tick = Number(market?.tick_size || market?.tickSize || market?.tick_size_raw || 0);
  const decimals = decimalPlacesFromStep(market?.tick_size || market?.tickSize || market?.tick_size_raw || '0.00000001', 8);
  let rounded = n;
  if (Number.isFinite(tick) && tick > 0) {
    rounded = Math.round(n / tick) * tick;
  }
  const fixed = rounded.toFixed(decimals);
  const [whole, frac = ''] = fixed.split('.');
  return `${whole}.${frac.padEnd(8, '0').slice(0, 8)}`;
}

function normalizeTriggerType(value) {
  const { TriggerType } = sdk();
  const raw = String(value || '').trim();
  if (!raw) return TriggerType.last;
  if (Object.values(TriggerType || {}).includes(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower === 'last' || lower === 'mark') return TriggerType.last;
  if (lower === 'index' || lower === 'oracle') return TriggerType.index;
  throw Object.assign(new Error('Unsupported Katana trigger type'), { status: 400 });
}

function orderParams(input = {}, creds, options = {}) {
  const { OrderType } = sdk();
  const type = normalizeOrderType(input.type || input.orderType || input.order_type, options.market);
  const marketMeta = options.marketMeta || null;
  const params = {
    type,
    side: normalizeSide(input.side),
    nonce: nonce(),
    wallet: walletParam(input.wallet, creds),
    market: marketName(input.market || input.symbol),
    quantity: formatQuantity(input.quantity || input.amount || ''),
  };
  const delegatedKey = String(input.delegatedKey || input.delegated_key || '').trim();
  if (delegatedKey) {
    if (!isEvmAddress(delegatedKey)) throw Object.assign(new Error('Katana delegated key address is invalid'), { status: 400 });
    params.delegatedKey = delegatedKey;
  }
  if (!params.quantity || !(Number(params.quantity) > 0)) {
    throw Object.assign(new Error('Katana order quantity must be at least 0.0001 base units'), { status: 400 });
  }
  params.clientOrderId = katanaClientOrderId(input);
  if (input.reduceOnly !== undefined || input.reduce_only !== undefined) params.reduceOnly = !!(input.reduceOnly ?? input.reduce_only);
  const isTriggerOrder = type === OrderType.takeProfitMarket
    || type === OrderType.stopLossMarket
    || type === OrderType.takeProfitLimit
    || type === OrderType.stopLossLimit
    || type === OrderType.trailingStopMarket;
  if (type === OrderType.limit || type === OrderType.takeProfitLimit || type === OrderType.stopLossLimit) {
    params.price = formatPrice(input.price, marketMeta, 'Katana limit order price');
    Object.assign(params, normalizeTif(input.timeInForce || input.time_in_force || input.tif || 'gtc'));
  }
  if (isTriggerOrder || input.triggerPrice || input.trigger_price) {
    params.triggerPrice = formatPrice(input.triggerPrice || input.trigger_price, marketMeta, 'Katana trigger order price');
    params.triggerType = normalizeTriggerType(input.triggerType || input.trigger_type || 'last');
    params.reduceOnly = input.reduceOnly !== undefined || input.reduce_only !== undefined
      ? !!(input.reduceOnly ?? input.reduce_only)
      : true;
  }
  logKatana('order params normalized', {
    input: {
      symbol: input.symbol,
      market: input.market,
      side: input.side,
      type: input.type || input.orderType || input.order_type,
      quantity: input.quantity || input.amount,
      price: input.price,
      triggerPrice: input.triggerPrice || input.trigger_price,
      triggerType: input.triggerType || input.trigger_type,
      reduceOnly: input.reduceOnly ?? input.reduce_only,
      notional_usd: input.notional_usd,
    },
    params,
  });
  return params;
}

function cancelParams(input = {}, creds) {
  const ids = input.orderIds || input.order_ids || input.orderId || input.order_id || input.clientOrderId || input.client_order_id;
  const params = {
    nonce: nonce(),
    wallet: walletParam(input.wallet, creds),
  };
  const delegatedKey = String(input.delegatedKey || input.delegated_key || '').trim();
  const orderDelegatedKey = String(input.orderDelegatedKey || input.order_delegated_key || '').trim();
  if (delegatedKey) {
    if (!isEvmAddress(delegatedKey)) throw Object.assign(new Error('Katana delegated key address is invalid'), { status: 400 });
    params.delegatedKey = delegatedKey;
  }
  if (orderDelegatedKey && !ids && !(input.market || input.symbol)) {
    if (!isEvmAddress(orderDelegatedKey)) throw Object.assign(new Error('Katana order delegated key address is invalid'), { status: 400 });
    params.orderDelegatedKey = orderDelegatedKey;
  }
  if (ids) {
    params.orderIds = (Array.isArray(ids) ? ids : [ids]).map(id => {
      const value = String(id);
      if (input.clientOrderId || input.client_order_id) return value.startsWith('client:') ? value : `client:${value}`;
      return value;
    });
  } else if (input.market || input.symbol) {
    params.market = marketName(input.market || input.symbol);
  }
  return params;
}

function typedDataPayload(parts) {
  const [domain, types, message] = parts;
  const primaryType = Object.keys(types || {}).find(key => key !== 'EIP712Domain');
  return jsonSafe({ domain, types, primaryType, message });
}

async function typedDataFor(credsInput, kind, params) {
  credentials(credsInput);
  const exchange = await getExchange();
  const chainId = exchange?.chainId;
  const exchangeContractAddress = exchange?.exchangeContractAddress;
  logKatana('typed data exchange metadata', {
    kind,
    chainId,
    exchangeContractAddress: redact(exchangeContractAddress),
    has_exchange: !!exchange,
    params,
  });
  if (!chainId || !exchangeContractAddress) {
    throw Object.assign(new Error('Katana exchange contract metadata unavailable'), { status: 502 });
  }
  const katana = sdk();
  try {
    const sandbox = boolEnv(process.env.KATANA_PERPS_SANDBOX);
    let payload;
    if (kind === 'associateWallet') {
      payload = typedDataPayload(katana.getWalletAssociationSignatureTypedData(params, exchangeContractAddress, chainId, sandbox));
    } else if (kind === 'delegatedKeyAuthorization') {
      payload = typedDataPayload(katana.getDelegatedKeyAuthorizationSignatureTypedData(params, exchangeContractAddress, chainId, sandbox));
    } else if (kind === 'cancelOrders') {
      payload = typedDataPayload(katana.getOrderCancellationSignatureTypedData(params, exchangeContractAddress, chainId, sandbox));
    } else {
      payload = typedDataPayload(katana.getOrderSignatureTypedData(params, exchangeContractAddress, chainId, sandbox));
    }
    logKatana('typed data created', {
      kind,
      domain: payload?.domain,
      primaryType: payload?.primaryType,
      type_keys: Object.keys(payload?.types || {}),
      message: payload?.message,
    });
    return payload;
  } catch (e) {
    logKatana('typed data failed', errorInfo(e));
    throw e;
  }
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
    positions: (() => {
      const positionRows = Array.isArray(account.positions) ? account.positions : [];
      const normalized = positionRows.map(normalizePosition);
      logPositions('account positions normalized', positionRows, normalized);
      return normalized;
    })(),
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
  const positionRows = Array.isArray(rows) ? rows : [];
  const normalized = positionRows.map(normalizePosition);
  logPositions('positions normalized', positionRows, normalized);
  return normalized;
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
  return arrayRows(rows, 'fills', 'trades', 'executions');
}

async function importFillsForPlayer(playerId, credsInput, opts = {}) {
  const creds = credentials(credsInput);
  const db = require('./db');
  const wallet = walletParam(opts.wallet || creds.wallet, creds);
  const fills = await getFills(creds, wallet, {
    limit: opts.limit || 100,
    market: opts.market,
    fromId: opts.fromId,
  }).catch((e) => {
    logKatana('import fills read failed', errorInfo(e));
    return [];
  });
  let imported = 0;
  let adopted = 0;
  let updated = 0;
  let skipped = 0;
  for (const fill of (Array.isArray(fills) ? fills : [])) {
    const trade = normalizeFill(wallet, fill);
    if (!trade) { skipped++; continue; }
    try {
      const before = db.db.prepare('SELECT id, player_id FROM trade_history WHERE client_order_id = ? LIMIT 1').get(trade.clientOrderId);
      if (before) {
        const info = db.db.prepare(`
          UPDATE trade_history
          SET player_id = ?,
              symbol = COALESCE(NULLIF(?, ''), symbol),
              side = COALESCE(NULLIF(?, ''), side),
              order_type = COALESCE(NULLIF(?, ''), order_type),
              amount = COALESCE(NULLIF(?, ''), amount),
              price = COALESCE(NULLIF(?, ''), price),
              order_id = COALESCE(NULLIF(?, ''), order_id),
              status = 'filled',
              notional_usd = CASE WHEN ? > 0 THEN ? ELSE notional_usd END,
              verified_source = 'katana_api',
              fee = COALESCE(NULLIF(?, ''), fee),
              proof_json = COALESCE(NULLIF(?, ''), proof_json)
          WHERE id = ? AND dex = 'katana'
        `).run(
          playerId,
          trade.symbol,
          trade.side,
          trade.orderType,
          trade.amount,
          trade.price,
          trade.orderId || '',
          trade.notional_usd,
          trade.notional_usd,
          trade.fee || '',
          trade.proofJson || '',
          before.id,
        );
        if (info.changes > 0) {
          updated++;
          if (before.player_id !== playerId) adopted++;
        } else {
          skipped++;
        }
        continue;
      }
      const r = db.addTrade(playerId, trade);
      if (r?.id) imported++;
      else skipped++;
    } catch (e) {
      skipped++;
      if (!/UNIQUE|constraint/i.test(e.message || '')) {
        console.warn('[katana] import fill failed:', e.message);
      }
    }
  }
  return { ok: true, imported, updated, adopted, skipped, total: fills.length };
}

async function getDelegatedKeys(credsInput, wallet) {
  const creds = credentials(credsInput);
  const client = authenticatedClient(creds);
  const rows = await client.getDelegatedKeys({
    nonce: nonce(),
    wallet: walletParam(wallet, creds),
  });
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

function delegatedKeyParams(input = {}, creds) {
  const delegatedKey = String(input.delegatedKey || input.delegated_key || '').trim();
  if (!isEvmAddress(delegatedKey)) {
    throw Object.assign(new Error('Katana delegated key address required'), { status: 400 });
  }
  const params = {
    nonce: nonce(),
    wallet: walletParam(input.wallet, creds),
    delegatedKey,
  };
  const name = String(input.name || input.delegatedName || input.delegated_name || '').trim();
  if (name) params.name = name.slice(0, 64);
  return params;
}

async function prepareDelegatedKey(credsInput, input = {}) {
  const creds = credentials(credsInput);
  const parameters = delegatedKeyParams(input, creds);
  return {
    endpoint: '/delegatedKeys',
    method: 'POST',
    parameters,
    typedData: await typedDataFor(creds, 'delegatedKeyAuthorization', parameters),
  };
}

async function submitDelegatedKey(credsInput, body = {}) {
  const client = authenticatedClient(credsInput);
  const parameters = body.parameters || body.params;
  const signature = String(body.signature || '').trim();
  if (!parameters || !signature) throw Object.assign(new Error('Katana delegated key parameters and signature required'), { status: 400 });
  return client.post('/delegatedKeys', { parameters, signature });
}

async function prepareOrder(credsInput, input = {}) {
  const creds = credentials(credsInput);
  const normalizedMarket = marketName(input.market || input.symbol);
  let marketMeta = null;
  try {
    const markets = await getMarketInfo();
    marketMeta = markets.find(m => String(m.market_name || m.market || '').toUpperCase() === normalizedMarket);
  } catch (e) {
    logKatana('market metadata unavailable for order normalization', {
      market: normalizedMarket,
      error: e?.message || String(e),
    });
  }
  logKatana('prepare order input', {
    wallet: redact(input.wallet || creds.wallet),
    has_api_key: !!creds.apiKey,
    has_api_secret: !!creds.apiSecret,
    input: {
      symbol: input.symbol,
      market: input.market,
      side: input.side,
      quantity: input.quantity,
      amount: input.amount,
      type: input.type,
      orderType: input.orderType,
      price: input.price,
      reduceOnly: input.reduceOnly,
      notional_usd: input.notional_usd,
    },
  });
  const parameters = orderParams(input, creds, {
    market: String(input.type || input.orderType || '').toLowerCase() === 'market',
    marketMeta,
  });
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
  getDelegatedKeys,
  getExchange,
  getFills,
  getFundingRates,
  getHealth,
  importFillsForPlayer,
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
  prepareDelegatedKey,
  prepareOrder,
  referralUrl,
  submitAssociateWallet,
  submitCancelOrders,
  submitDelegatedKey,
  submitOrder,
};
