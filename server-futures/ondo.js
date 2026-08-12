const crypto = require('crypto');

const ONDO_DEFAULT_BUILDER_CODE = 'clashofperps';
const ONDO_API_URL = String(
  process.env.ONDO_PERPS_API_URL || 'https://api.ondoperps.xyz',
).replace(/\/+$/u, '');
const ONDO_BUILDER_CODE = String(
  process.env.ONDO_PERPS_BUILDER_CODE || ONDO_DEFAULT_BUILDER_CODE,
).trim();
// Clash intentionally charges one builder basis point. Keep this server-side:
// a modified browser must not be able to raise, lower, or replace the fee.
const ONDO_BUILDER_FEE_BPS = 1;
const ONDO_REQUEST_TIMEOUT_MS = Math.max(
  1_000,
  Math.min(20_000, Number(process.env.ONDO_PERPS_REQUEST_TIMEOUT_MS || 8_000)),
);
const MARKET_CACHE_TTL_MS = 15_000;
const SESSION_CACHE_TTL_MS = 30_000;

// Ondo access is unavailable in the United States, Canada and comprehensively
// sanctioned jurisdictions. Keep the mandatory baseline in code so an absent
// environment variable cannot accidentally make production less restrictive.
// `ONDO_RESTRICTED_COUNTRIES_EXTRA` may only extend the list.
const ONDO_RESTRICTED_COUNTRY_CODES = Object.freeze([
  'AS', 'CA', 'CU', 'GU', 'IR', 'KP', 'MP', 'PR', 'SY', 'UM', 'US', 'VI',
]);
const ONDO_RESTRICTED_UA_REGION_CODES = new Set([
  'UA-09', // Luhansk
  'UA-14', // Donetsk
  'UA-23', // Zaporizhzhia
  'UA-40', // Sevastopol
  'UA-43', // Crimea
  'UA-65', // Kherson
]);
const ONDO_RESTRICTED_UA_REGION_NAMES = [
  'crimea', 'donetsk', 'kherson', 'luhansk', 'lugansk', 'sevastopol', 'zaporizhzhia', 'zaporozhye',
];
const ONDO_REGION_BLOCKED_MESSAGE = 'Ondo Perps is not available in your country or IP region.';
const ONDO_REGION_UNAVAILABLE_MESSAGE = 'Unable to verify whether Ondo Perps is available in your region. Please retry.';

let marketsCache = null;
let pricesCache = null;
let marketStatsCache = null;
const sessionOwnerCache = new Map();
const sessionOwnerPending = new Map();

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/u.test(String(value || '').trim());
}

function normalizeAddress(value) {
  const address = String(value || '').trim().toLowerCase();
  return isEvmAddress(address) ? address : null;
}

function normalizeToken(value) {
  const token = String(value || '').trim();
  if (token.length < 20 || token.length > 8_192 || /\s/u.test(token)) {
    throw Object.assign(new Error('Valid Ondo session token required'), { status: 401 });
  }
  return token;
}

function normalizeCountryCode(value) {
  const code = String(Array.isArray(value) ? value[0] : value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(code) ? code : null;
}

function normalizeRegionCode(value, country = null) {
  const raw = String(Array.isArray(value) ? value[0] : value || '').trim().toUpperCase();
  if (!raw || raw.length > 32 || !/^[A-Z0-9-]+$/u.test(raw)) return null;
  if (raw.includes('-') || !country) return raw;
  return `${country}-${raw}`;
}

function requestHeader(req, names) {
  for (const name of names) {
    const raw = req?.headers?.[name] ?? req?.get?.(name);
    const value = String(Array.isArray(raw) ? raw[0] : raw || '').split(',')[0].trim();
    if (value) return value;
  }
  return '';
}

function extraRestrictedCountryCodes() {
  return String(process.env.ONDO_RESTRICTED_COUNTRIES_EXTRA || '')
    .split(',')
    .map(normalizeCountryCode)
    .filter(Boolean);
}

function evaluateRegionAccess({ country = null, regionCode = null, regionName = null } = {}) {
  const normalizedCountry = normalizeCountryCode(country);
  const normalizedRegionCode = normalizeRegionCode(regionCode, normalizedCountry);
  const normalizedRegionName = String(regionName || '').trim().toLowerCase();
  const restrictedCountries = new Set([
    ...ONDO_RESTRICTED_COUNTRY_CODES,
    ...extraRestrictedCountryCodes(),
  ]);
  const restrictedCountry = !!normalizedCountry && restrictedCountries.has(normalizedCountry);
  const restrictedUkraineRegion = normalizedCountry === 'UA' && (
    ONDO_RESTRICTED_UA_REGION_CODES.has(normalizedRegionCode)
    || ONDO_RESTRICTED_UA_REGION_NAMES.some(name => normalizedRegionName.includes(name))
  );
  const blocked = restrictedCountry || restrictedUkraineRegion;
  return {
    allowed: !blocked,
    status: blocked ? 'blocked' : 'allowed',
    country: normalizedCountry,
    regionCode: normalizedRegionCode,
    regionName: normalizedRegionName || null,
    reason: restrictedCountry ? 'restricted_country' : restrictedUkraineRegion ? 'restricted_region' : null,
    message: blocked ? ONDO_REGION_BLOCKED_MESSAGE : null,
  };
}

function regionAccessForRequest(req) {
  const production = process.env.NODE_ENV === 'production';
  // Cloudflare is the production edge. Vercel/CloudFront are accepted only for
  // local/preview deployments; accepting them at the public production origin
  // would let a caller supply a competing country header. A development-only
  // env override makes the blocked UI testable without a production bypass.
  const testCountry = !production
    ? normalizeCountryCode(process.env.ONDO_GEO_TEST_COUNTRY)
    : null;
  const country = testCountry || normalizeCountryCode(requestHeader(req, production
    ? ['cf-ipcountry']
    : ['cf-ipcountry', 'x-vercel-ip-country', 'cloudfront-viewer-country']));
  if (production && (!country || country === 'XX')) {
    return {
      allowed: false,
      status: 'unavailable',
      country: country || null,
      regionCode: null,
      regionName: null,
      reason: 'geo_verification_unavailable',
      message: ONDO_REGION_UNAVAILABLE_MESSAGE,
    };
  }
  const regionCode = requestHeader(req, production
    ? ['cf-region-code']
    : ['cf-region-code', 'x-vercel-ip-country-region', 'cloudfront-viewer-country-region']);
  const regionName = requestHeader(req, ['cf-region']);
  return evaluateRegionAccess({ country, regionCode, regionName });
}

function symbolFromMarket(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-USD\.P$/u, '')
    .replace(/USD\.P$/u, '');
}

function marketName(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (/-USD\.P$/u.test(raw)) return raw;
  return `${symbolFromMarket(raw)}-USD.P`;
}

function safeId(value, label = 'identifier') {
  const id = String(value || '').trim();
  if (!id || id.length > 128 || !/^[A-Za-z0-9_=:+.-]+$/u.test(id)) {
    throw Object.assign(new Error(`Valid Ondo ${label} required`), { status: 400 });
  }
  return id;
}

function clientOrderIdText(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/u.test(id)) {
    throw Object.assign(new Error('Valid Ondo client order ID required'), { status: 400 });
  }
  return id;
}

function decimalText(value, label, { allowZero = false } = {}) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/u.test(text)) {
    throw Object.assign(new Error(`Valid Ondo ${label} required`), { status: 400 });
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw Object.assign(new Error(`Ondo ${label} must be ${allowZero ? 'non-negative' : 'positive'}`), { status: 400 });
  }
  return text;
}

function decimalScale(value, label) {
  const text = decimalText(value, label);
  const [whole, fraction = ''] = text.split('.');
  return {
    digits: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
}

function decimalFromInteger(value, scale) {
  const padded = value.toString().padStart(scale + 1, '0');
  if (scale === 0) return padded;
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function alignOndoDecimal(value, increment, label = 'price') {
  const input = decimalScale(value, label);
  const step = decimalScale(increment, `${label} increment`);
  const scale = Math.max(input.scale, step.scale);
  const inputInteger = input.digits * (10n ** BigInt(scale - input.scale));
  const stepInteger = step.digits * (10n ** BigInt(scale - step.scale));
  const aligned = (inputInteger / stepInteger) * stepInteger;
  if (aligned <= 0n) {
    throw Object.assign(new Error(`Ondo ${label} is below increment ${increment}`), { status: 400 });
  }
  return decimalFromInteger(aligned, scale);
}

function queryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function request(path, { method = 'GET', token = null, query = null, body = undefined } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ONDO_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${ONDO_API_URL}${path}${queryString(query)}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${normalizeToken(token)}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text.slice(0, 500) }; }
    if (!response.ok || payload?.success === false) {
      if (response.status === 401 && token) evictSessionToken(token);
      const error = new Error(payload?.error || payload?.message || `Ondo API HTTP ${response.status}`);
      error.status = response.status || 502;
      error.code = payload?.error_code || payload?.code || null;
      error.upstream = payload;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('Ondo API request timed out'), { status: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function builderConfig() {
  const configured = ONDO_BUILDER_CODE === ONDO_DEFAULT_BUILDER_CODE
    && ONDO_BUILDER_FEE_BPS === 1;
  return {
    configured,
    code: configured ? ONDO_BUILDER_CODE : null,
    feeRateBps: ONDO_BUILDER_FEE_BPS,
    source: process.env.ONDO_PERPS_BUILDER_CODE ? 'server_env' : 'clash_default',
  };
}

function addBuilderCode(order) {
  const config = builderConfig();
  if (!config.configured) {
    throw Object.assign(new Error('Exact Clash Ondo builder routing is unavailable'), {
      status: 503,
      code: 'ONDO_BUILDER_UNAVAILABLE',
    });
  }
  const clean = { ...(order || {}) };
  delete clean.builderCode;
  delete clean.builder_code;
  clean.builderCode = {
    code: config.code,
    feeRateBps: config.feeRateBps,
  };
  return clean;
}

function orderIdentityFromResponse(payload, fallbackClientOrderId = null) {
  const result = payload?.result;
  const data = payload?.data;
  const candidates = [
    payload,
    result,
    data,
    payload?.order,
    result?.order,
    data?.order,
    Array.isArray(payload?.orders) ? payload.orders[0] : null,
    Array.isArray(result?.orders) ? result.orders[0] : null,
    Array.isArray(data?.orders) ? data.orders[0] : null,
    Array.isArray(result) ? result[0] : null,
    Array.isArray(data) ? data[0] : null,
  ].filter(row => row && typeof row === 'object');
  let orderId = '';
  let clientOrderId = String(fallbackClientOrderId || '').trim();
  for (const row of candidates) {
    if (!orderId) {
      orderId = String(row.orderId ?? row.orderID ?? row.order_id ?? '').trim();
    }
    if (!clientOrderId) {
      clientOrderId = String(row.clientOrderId ?? row.clientOrderID ?? row.client_order_id ?? '').trim();
    }
  }
  return { orderId: orderId || null, clientOrderId: clientOrderId || null };
}

function maxLeverage(row) {
  const brackets = Array.isArray(row?.marginInfo) ? row.marginInfo : [];
  const values = brackets.map(item => num(item?.maxLeverage)).filter(value => value > 0);
  return values.length ? Math.max(...values) : Math.max(1, num(row?.defaultLeverage, 10));
}

function normalizeMarket(row, markRow = null, volumeRow = null, openInterestRow = null) {
  const market = marketName(row?.market);
  const symbol = symbolFromMarket(market);
  const mark = num(markRow?.markPrice ?? markRow?.price);
  const minSize = num(row?.baseIncrement);
  return {
    dex: 'ondo',
    symbol,
    base: symbol,
    pair: `${symbol}/USD`,
    market_name: market,
    market_id: market,
    asset_id: market,
    pair_index: market,
    display_name: row?.displayName || `${symbol}USD`,
    long_name: row?.longName || symbol,
    tick_size: String(row?.quoteIncrement || '0.01'),
    lot_size: String(row?.baseIncrement || '0.0001'),
    min_order_size: String(row?.baseIncrement || '0.0001'),
    min_notional_usd: minSize > 0 && mark > 0 ? String(minSize * mark) : '0',
    max_leverage: maxLeverage(row),
    default_leverage: Math.max(1, num(row?.defaultLeverage, 10)),
    max_position_size: String(row?.maxPositionBaseSize || ''),
    maker_fee: num(row?.makerFee, 0.00015),
    taker_fee: num(row?.takerFee, 0.00035),
    mark,
    mid: mark,
    oracle: num(markRow?.oraclePrice, mark),
    bid: mark,
    ask: mark,
    volume_24h: num(volumeRow?.quoteVolume),
    volume: num(volumeRow?.quoteVolume),
    base_volume_24h: num(volumeRow?.volume),
    open_interest: num(openInterestRow?.notionalValue),
    open_interest_usd: num(openInterestRow?.notionalValue),
    open_interest_base: num(openInterestRow?.openInterest),
    disabled: row?.disabled === true,
    tags: Array.isArray(row?.tags) ? row.tags : [],
    logo_url: row?.logoUrl || null,
    schedule: row?.schedule || null,
    _ondo: { market, raw: row, mark: markRow },
    _raw: row,
  };
}

async function getRawMarkets() {
  const now = Date.now();
  if (marketsCache && now - marketsCache.at < MARKET_CACHE_TTL_MS) return marketsCache.payload;
  const payload = await request('/v1/markets');
  marketsCache = { at: now, payload };
  return payload;
}

async function getQuoteIncrement(value) {
  const market = marketName(value);
  const payload = await getRawMarkets();
  const rows = payload?.result?.perps?.tradingPairs;
  const row = (Array.isArray(rows) ? rows : []).find(item => marketName(item?.market) === market);
  const increment = row?.quoteIncrement;
  if (!increment || num(increment) <= 0) {
    throw Object.assign(new Error(`Ondo quote increment unavailable for ${market}`), { status: 502 });
  }
  return String(increment);
}

async function alignOrderTriggerPrices(input = {}) {
  const takeProfit = input.takeProfit ?? input.take_profit;
  const stopLoss = input.stopLoss ?? input.stop_loss;
  if (!(num(takeProfit) > 0) && !(num(stopLoss) > 0)) return input;
  const increment = await getQuoteIncrement(input.market || input.symbol);
  return {
    ...input,
    ...(num(takeProfit) > 0 ? { takeProfit: alignOndoDecimal(takeProfit, increment, 'take profit') } : {}),
    ...(num(stopLoss) > 0 ? { stopLoss: alignOndoDecimal(stopLoss, increment, 'stop loss') } : {}),
  };
}

async function getRawPrices() {
  const now = Date.now();
  if (pricesCache && now - pricesCache.at < MARKET_CACHE_TTL_MS) return pricesCache.payload;
  const payload = await request('/v1/perps/mark_prices');
  pricesCache = { at: now, payload };
  return payload;
}

async function getRawMarketStats() {
  const now = Date.now();
  if (marketStatsCache && now - marketStatsCache.at < MARKET_CACHE_TTL_MS) return marketStatsCache.payload;
  const [volumeResult, openInterestResult] = await Promise.allSettled([
    request('/v1/perps/volume'),
    request('/v1/perps/open_interest'),
  ]);
  const volume = volumeResult.status === 'fulfilled' ? volumeResult.value : { result: [] };
  const openInterest = openInterestResult.status === 'fulfilled' ? openInterestResult.value : { result: [] };
  const payload = { volume, openInterest };
  marketStatsCache = { at: now, payload };
  return payload;
}

async function getMarketInfo() {
  const [marketPayload, pricePayload, statsPayload] = await Promise.all([getRawMarkets(), getRawPrices(), getRawMarketStats()]);
  const rows = marketPayload?.result?.perps?.tradingPairs;
  const marks = pricePayload?.result || {};
  const volumes = new Map((statsPayload?.volume?.result || []).map(row => [marketName(row?.market), row]));
  const openInterest = new Map((statsPayload?.openInterest?.result || []).map(row => [marketName(row?.market), row]));
  return (Array.isArray(rows) ? rows : [])
    .map(row => normalizeMarket(row, marks[row?.market] || null, volumes.get(marketName(row?.market)), openInterest.get(marketName(row?.market))))
    .filter(row => row.symbol && row.market_name && !row.disabled);
}

async function getPrices() {
  const payload = await getRawPrices();
  return Object.values(payload?.result || {}).map((row) => ({
    dex: 'ondo',
    symbol: symbolFromMarket(row?.market),
    market: marketName(row?.market),
    mark: String(row?.markPrice || row?.price || ''),
    mid: String(row?.markPrice || row?.price || ''),
    oracle: String(row?.oraclePrice || row?.markPrice || row?.price || ''),
    bid: String(row?.markPrice || row?.price || ''),
    ask: String(row?.markPrice || row?.price || ''),
    updated_at: row?.lastUpdatedTime || null,
    _raw: row,
  })).filter(row => row.symbol && num(row.mark) > 0);
}

async function requestLoginChallenge(walletAddress) {
  const wallet = normalizeAddress(walletAddress);
  if (!wallet) throw Object.assign(new Error('Valid EVM wallet required for Ondo login'), { status: 400 });
  const body = { walletAddress: wallet, chainId: '1' };
  // Builder guide v1.0.3 moved builderCode to get_challenge. The current
  // public OpenAPI schema is lagging behind the guide, so keep it optional.
  if (ONDO_BUILDER_CODE) body.builderCode = ONDO_BUILDER_CODE;
  return request('/v1/auth/erc-4361/login/get_challenge', { method: 'POST', body });
}

async function completeLoginChallenge({ id, signature }) {
  return request('/v1/auth/erc-4361/login/complete_challenge', {
    method: 'POST',
    body: {
      id: safeId(id, 'challenge ID'),
      signature: signatureText(signature),
      source: 'clash-of-perps',
    },
  });
}

async function invalidateSession(token) {
  // The official REST specification exposes invalidate_jwt as GET. Keep this
  // behind the adapter so a route cannot accidentally drift to POST again.
  try {
    return await request('/v1/auth/invalidate_jwt', { token });
  } finally {
    evictSessionToken(token);
  }
}

function signatureText(signature) {
  const value = String(signature || '').trim();
  if (!/^0x[0-9a-fA-F]{130}$/u.test(value) && !/^[0-9a-fA-F]{130}$/u.test(value)) {
    throw Object.assign(new Error('Valid Ondo wallet signature required'), { status: 400 });
  }
  return value;
}

async function getAddressBook(token) {
  return request('/v1/wallet/address_book', { token });
}

async function requestAddressBookChallenge(token, { walletAddress, withdrawalAddress }) {
  const wallet = normalizeAddress(walletAddress);
  const destination = normalizeAddress(withdrawalAddress);
  if (!wallet || !destination) throw Object.assign(new Error('Valid Ethereum withdrawal address required'), { status: 400 });
  return request('/v1/auth/erc-4361/address_book/get_challenge', {
    method: 'POST', token, body: { walletAddress: wallet, chainId: '1', withdrawalAddress: destination },
  });
}

async function completeAddressBookChallenge(token, { id, signature, addressLabel = 'Clash wallet' }) {
  return request('/v1/auth/erc-4361/address_book/complete_challenge', {
    method: 'POST',
    token,
    body: {
      id: safeId(id, 'address-book challenge ID'),
      signature: signatureText(signature),
      addressLabel: String(addressLabel || 'Clash wallet').trim().slice(0, 64),
    },
  });
}

function sessionCacheKey(token) {
  return crypto.createHash('sha256').update(normalizeToken(token)).digest('hex');
}

function evictSessionToken(token) {
  try {
    const key = sessionCacheKey(token);
    sessionOwnerCache.delete(key);
    sessionOwnerPending.delete(key);
  } catch {
    // Invalid tokens were never cached.
  }
}

function normalizeSessionIdentity(payload) {
  const accountInfo = payload?.result || payload || {};
  const wallet = normalizeAddress(accountInfo?.identifier);
  if (!wallet) throw Object.assign(new Error('Ondo account did not return its wallet identifier'), { status: 502 });
  return {
    wallet,
    accountId: String(accountInfo?.accountID || accountInfo?.accountId || '') || null,
    // Do not call this field `account`: the authenticated Clash routes reserve
    // that name for the normalized EVM owner address used in proof keys.
    accountInfo,
  };
}

async function verifySessionOwner(token, expectedWallet = null) {
  const key = sessionCacheKey(token);
  const expected = expectedWallet ? normalizeAddress(expectedWallet) : null;
  if (expectedWallet && !expected) throw Object.assign(new Error('Valid Ondo wallet required'), { status: 400 });
  const cached = sessionOwnerCache.get(key);
  if (cached && Date.now() - cached.at < SESSION_CACHE_TTL_MS) {
    if (expected && cached.wallet !== expected) throw Object.assign(new Error('Ondo session wallet mismatch'), { status: 403 });
    return cached;
  }
  let pending = sessionOwnerPending.get(key);
  if (!pending) {
    pending = (async () => {
      const payload = await request('/v1/account', { token });
      const identity = normalizeSessionIdentity(payload);
      const resolved = { at: Date.now(), ...identity };
      sessionOwnerCache.set(key, resolved);
      if (sessionOwnerCache.size > 1_000) {
        for (const [cacheKey, value] of sessionOwnerCache) {
          if (Date.now() - value.at >= SESSION_CACHE_TTL_MS) sessionOwnerCache.delete(cacheKey);
        }
      }
      return resolved;
    })();
    sessionOwnerPending.set(key, pending);
    pending.finally(() => {
      if (sessionOwnerPending.get(key) === pending) sessionOwnerPending.delete(key);
    }).catch(() => {});
  }
  const resolved = await pending;
  const { wallet } = resolved;
  if (expected && wallet !== expected) throw Object.assign(new Error('Ondo session wallet mismatch'), { status: 403 });
  return resolved;
}

function normalizeAccount(accountPayload, balancePayload, positions = [], orders = []) {
  const rawAccount = accountPayload?.result || accountPayload || {};
  const balance = balancePayload?.result || balancePayload || {};
  return {
    dex: 'ondo',
    exists: !!(rawAccount?.accountID || rawAccount?.accountId),
    account_id: String(rawAccount?.accountID || rawAccount?.accountId || ''),
    wallet: rawAccount?.identifier || null,
    account_state: rawAccount?.accountState || null,
    terms_version: num(rawAccount?.termsVersion),
    privacy_version: num(rawAccount?.privacyVersion),
    balance: num(balance?.walletBalance),
    equity: num(balance?.marginBalance),
    account_equity: num(balance?.marginBalance),
    available: num(balance?.availableMargin),
    available_margin: num(balance?.availableMargin),
    available_to_spend: num(balance?.availableMargin),
    free_margin: num(balance?.availableMargin),
    available_to_withdraw: num(balance?.withdrawableMargin),
    margin_balance: num(balance?.marginBalance),
    used_margin: num(balance?.usedMargin),
    margin_used: num(balance?.usedMargin),
    total_margin_used: num(balance?.usedMargin),
    maintenance_margin: num(balance?.totalMaintenanceMargin ?? balance?.maintenanceMarginRequirement),
    unrealized_pnl: num(balance?.unrealizedPnl),
    realized_pnl: num(balance?.realizedPnl),
    total_pnl: num(balance?.totalPnL),
    total_trading_fees: num(balance?.totalTradingFees),
    total_funding: num(balance?.totalFundingPayments),
    margin_ratio: num(balance?.marginRatio),
    leverage: num(balance?.leverage),
    positions_count: Array.isArray(positions) ? positions.length : 0,
    orders_count: Array.isArray(orders) ? orders.length : 0,
    maker_fee: 0.00015,
    taker_fee: 0.00035,
    _raw: { account: rawAccount, balance },
  };
}

function normalizePosition(row) {
  const symbol = symbolFromMarket(row?.market);
  const amount = Math.abs(num(row?.netQuantity));
  const direction = String(row?.direction || '').toLowerCase();
  return {
    dex: 'ondo',
    symbol,
    market: marketName(row?.market),
    pair_index: marketName(row?.market),
    // Clash's shared position UI uses bid/ask for the open direction.
    // Preserve Ondo's long/short string separately for API-specific logic.
    side: direction === 'short' ? 'ask' : 'bid',
    direction,
    position_side: direction === 'short' ? 'short' : 'long',
    amount: String(amount),
    size: String(amount),
    entry_price: num(row?.averageEntryPrice),
    average_entry_price: num(row?.averageEntryPrice),
    mark_price: num(row?.markPrice),
    liquidation_price: num(row?.liquidationPrice),
    bankruptcy_price: num(row?.bankruptcyPrice),
    margin: num(row?.usedMargin),
    used_margin: num(row?.usedMargin),
    maintenance_margin: num(row?.maintenanceMargin),
    notional_usd: num(row?.notionalValue),
    position_value: num(row?.notionalValue),
    leverage: num(row?.leverage),
    unrealized_pnl: num(row?.unrealizedPnl),
    pnl: num(row?.unrealizedPnl),
    return_on_equity: num(row?.returnOnEquity),
    funding: num(row?.netFundingSinceNeutral),
    take_profit: row?.takeProfitTriggerPrice != null ? num(row.takeProfitTriggerPrice) : null,
    stop_loss: row?.stopLossTriggerPrice != null ? num(row.stopLossTriggerPrice) : null,
    _raw: row,
  };
}

function normalizeOrder(row) {
  const remaining = Math.max(0, num(row?.size) - num(row?.filledSize));
  const type = String(row?.type || 'limit');
  return {
    dex: 'ondo',
    symbol: symbolFromMarket(row?.market),
    market: marketName(row?.market),
    pair_index: marketName(row?.market),
    order_id: row?.orderId ?? row?.orderID ?? row?.order_id ?? null,
    client_order_id: row?.clientOrderId ?? row?.clientOrderID ?? row?.client_order_id ?? null,
    side: String(row?.side || '').toLowerCase(),
    amount: String(remaining || num(row?.size)),
    initial_amount: String(row?.size || ''),
    filled_amount: String(row?.filledSize || '0'),
    price: String(row?.price || '0'),
    trigger_price: row?.triggerPrice != null ? String(row.triggerPrice) : null,
    stop_price: row?.triggerPrice != null ? String(row.triggerPrice) : null,
    order_type: row?.stopOrderType || type,
    tif: row?.timeInForce || null,
    reduce_only: row?.reduceOnly === true || row?.closePosition === true,
    status: row?.status || 'open',
    created_at: row?.createdAt || null,
    fee: num(row?.fee),
    filled_cost: num(row?.filledCost),
    _raw: row,
  };
}

function normalizeFill(row) {
  const size = num(row?.size);
  const price = num(row?.price);
  return {
    dex: 'ondo',
    fill_id: row?.id ?? row?.fillId ?? row?.fillID ?? row?.fill_id ?? null,
    order_id: row?.orderId ?? row?.orderID ?? row?.order_id ?? null,
    parent_order_id: row?.parentOrderID ?? row?.parentOrderId ?? row?.parent_order_id ?? null,
    client_order_id: row?.clientOrderId ?? row?.clientOrderID ?? row?.client_order_id ?? null,
    symbol: symbolFromMarket(row?.market),
    market: marketName(row?.market),
    side: String(row?.side || '').toLowerCase(),
    direction: row?.direction || null,
    amount: String(row?.size || ''),
    size: String(row?.size || ''),
    price: String(row?.price || ''),
    notional_usd: num(row?.filledCost, size * price),
    fee: num(row?.fee),
    fee_rebate: num(row?.feeRebate),
    pnl: num(row?.pnl),
    is_maker: row?.isMaker === true,
    created_at: row?.time || null,
    _raw: row,
  };
}

async function getAccount(token, knownAccountInfo = null) {
  const [account, balance] = await Promise.all([
    knownAccountInfo ? Promise.resolve({ result: knownAccountInfo }) : request('/v1/account', { token }),
    request('/v1/perps/balance', { token }),
  ]);
  // Positions and orders are fetched by their dedicated routes in the same
  // client refresh and merged there. Repeating both here doubled private API
  // traffic and made a single UI refresh fan out into redundant Ondo calls.
  return normalizeAccount(account, balance);
}

async function getPositions(token) {
  const payload = await request('/v1/perps/positions', { token });
  return (payload?.result || []).map(normalizePosition).filter(row => row.symbol && num(row.amount) > 0 && row.direction !== 'neutral');
}

async function getOrders(token, query = {}) {
  const payload = await request('/v1/perps/orders', {
    token,
    query: { status: query.status || 'open', market: query.market ? marketName(query.market) : undefined, limit: query.limit || 1000 },
  });
  return (payload?.result || []).map(normalizeOrder).filter(row => row.order_id);
}

async function getFills(token, query = {}) {
  const payload = await request('/v1/perps/fills', {
    token,
    query: {
      market: query.market ? marketName(query.market) : undefined,
      limit: Math.max(1, Math.min(1000, num(query.limit, 250))),
      cursor: query.cursor,
      startTime: query.startTime,
      endTime: query.endTime,
    },
  });
  return {
    rows: (payload?.result || []).map(normalizeFill).filter(row => row.fill_id && row.order_id),
    pageInfo: payload?.pageInfo || null,
  };
}

async function getFundingFees(token, query = {}) {
  const payload = await request('/v1/perps/funding_fees', {
    token,
    query: {
      market: query.market ? marketName(query.market) : undefined,
      limit: Math.max(1, Math.min(1000, num(query.limit, 250))),
      cursor: query.cursor,
      startTime: query.startTime,
      endTime: query.endTime,
    },
  });
  return {
    rows: (payload?.result || []).map(row => ({
      dex: 'ondo',
      id: `${row?.market || ''}:${row?.time || ''}:${row?.amount || ''}`,
      symbol: symbolFromMarket(row?.market),
      market: marketName(row?.market),
      side: String(row?.positionDirection || '').toLowerCase() === 'short' ? 'ask' : 'bid',
      payout: num(row?.amount),
      rate: num(row?.rate),
      amount: Math.abs(num(row?.positionSize)),
      mark_price: num(row?.markPrice),
      payer: row?.payer || null,
      created_at: row?.time || null,
      _raw: row,
    })).filter(row => row.symbol && row.created_at),
    pageInfo: payload?.pageInfo || null,
  };
}

async function importFillsForPlayer(playerId, account, token, options = {}) {
  const owner = normalizeAddress(account);
  if (!owner) throw Object.assign(new Error('Valid Ondo account wallet required'), { status: 400 });
  if (!builderConfig().configured) {
    return { imported: 0, updated: 0, scanned: 0, eligible: 0, builder_configured: false };
  }
  const db = require('./db');
  const pageCap = Math.max(1, Math.min(10, num(options.pageCap, 4)));
  const pageLimit = Math.max(1, Math.min(1000, num(options.limit, 250)));
  let cursor = null;
  let scanned = 0;
  let eligible = 0;
  let imported = 0;
  let updated = 0;
  for (let page = 0; page < pageCap; page += 1) {
    const batch = await getFills(token, { limit: pageLimit, cursor });
    scanned += batch.rows.length;
    for (const fill of batch.rows) {
      const proof = db.getOndoBuilderOrder(fill.order_id, playerId, owner)
        || (fill.parent_order_id ? db.getOndoBuilderOrder(fill.parent_order_id, playerId, owner) : null)
        || (fill.client_order_id ? db.getOndoBuilderOrderByClient(fill.client_order_id, playerId, owner) : null);
      if (!proof || proof.builder_code !== ONDO_BUILDER_CODE || Number(proof.builder_fee_bps) !== ONDO_BUILDER_FEE_BPS) continue;
      eligible += 1;
      const clientOrderId = `ondo:fill:${owner}:${fill.fill_id}`;
      const result = db.upsertVerifiedTrade(playerId, {
        symbol: fill.symbol,
        side: fill.direction || fill.side,
        orderType: 'fill',
        amount: fill.amount,
        price: fill.price,
        orderId: fill.order_id,
        clientOrderId,
        status: 'filled',
        dex: 'ondo',
        notional_usd: fill.notional_usd,
        verifiedSource: 'ondo_builder_fill',
        pnl: fill.pnl,
        fee: fill.fee,
        proofJson: JSON.stringify({
          venue: 'ondo',
          account: owner,
          fill_id: fill.fill_id,
          order_id: fill.order_id,
          parent_order_id: fill.parent_order_id,
          builder_order_id: proof.order_id,
          builder_code: proof.builder_code,
          builder_fee_bps: Number(proof.builder_fee_bps),
          fill: fill._raw,
        }),
        createdAt: fill.created_at,
      });
      imported += Number(result?.inserted || 0);
      updated += Number(result?.updated || 0);
    }
    const next = String(batch.pageInfo?.nextCursor || '').trim();
    // nextCursor is authoritative. Ondo may return fewer than the requested
    // limit while still providing another page, so row count must not stop the
    // scan or high-frequency accounts can permanently miss builder fills.
    if (!next || next === cursor) break;
    cursor = next;
  }
  return {
    imported,
    updated,
    scanned,
    eligible,
    builder_configured: true,
    builder_fee_bps: ONDO_BUILDER_FEE_BPS,
  };
}

function buildOrder(input = {}) {
  const side = String(input.side || '').toLowerCase();
  if (!['buy', 'sell'].includes(side)) throw Object.assign(new Error('Ondo side must be buy or sell'), { status: 400 });
  const type = String(input.type || 'market').toLowerCase();
  if (!['market', 'limit'].includes(type)) throw Object.assign(new Error('Ondo order type must be market or limit'), { status: 400 });
  const body = {
    market: marketName(input.market || input.symbol),
    side,
    type,
    size: decimalText(input.size ?? input.amount, 'order size'),
    reduceOnly: input.reduceOnly === true || input.reduce_only === true,
  };
  if (!body.market) throw Object.assign(new Error('Ondo market required'), { status: 400 });
  if (type === 'limit') {
    body.price = decimalText(input.price, 'limit price');
    body.timeInForce = ['GTC', 'IOC'].includes(String(input.timeInForce || input.tif || '').toUpperCase())
      ? String(input.timeInForce || input.tif).toUpperCase()
      : 'GTC';
    body.postOnly = input.postOnly === true || input.post_only === true;
  }
  if (input.clientOrderId || input.client_order_id) body.clientOrderId = clientOrderIdText(input.clientOrderId || input.client_order_id);
  const takeProfit = input.takeProfit ?? input.take_profit;
  const stopLoss = input.stopLoss ?? input.stop_loss;
  if (num(takeProfit) > 0) body.takeProfit = { triggerPrice: decimalText(takeProfit, 'take profit') };
  if (num(stopLoss) > 0) body.stopLoss = { triggerPrice: decimalText(stopLoss, 'stop loss') };
  return addBuilderCode(body);
}

async function createOrder(token, input) {
  const suppliedClientOrderId = input?.clientOrderId || input?.client_order_id;
  const withIdentity = suppliedClientOrderId ? input : {
    ...input,
    clientOrderId: `clash-server-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`,
  };
  const body = buildOrder(await alignOrderTriggerPrices(withIdentity));
  const response = await request('/v1/perps/orders', { method: 'POST', token, body });
  return { response, request: body, builder: builderConfig() };
}

async function cancelOrder(token, orderId) {
  return request(`/v1/perps/orders/${encodeURIComponent(safeId(orderId, 'order ID'))}`, { method: 'DELETE', token });
}

async function setLeverage(token, { market, symbol, leverage }) {
  const value = Math.floor(num(leverage));
  if (value < 1 || value > 100) throw Object.assign(new Error('Ondo leverage must be between 1 and 100'), { status: 400 });
  return request('/v1/perps/leverage', {
    method: 'POST', token, body: { market: marketName(market || symbol), leverage: String(value) },
  });
}

async function setStopOrder(token, { market, symbol, positionDirection, side, type, triggerPrice }) {
  const direction = String(positionDirection || side || '').toLowerCase();
  if (!['long', 'short'].includes(direction)) throw Object.assign(new Error('Ondo position direction required'), { status: 400 });
  if (!['stopLoss', 'takeProfit'].includes(type)) throw Object.assign(new Error('Ondo stop order type required'), { status: 400 });
  const selectedMarket = marketName(market || symbol);
  const quoteIncrement = await getQuoteIncrement(selectedMarket);
  return request('/v1/perps/stop_order', {
    method: 'POST',
    token,
    body: {
      market: selectedMarket,
      positionDirection: direction,
      type,
      triggerPrice: alignOndoDecimal(triggerPrice, quoteIncrement, 'trigger price'),
    },
  });
}

async function removeStopOrder(token, { market, symbol, type = null }) {
  return request('/v1/perps/stop_order', {
    method: 'DELETE', token, query: { market: marketName(market || symbol), type },
  });
}

async function provisionDepositAddress(token, { accountId, network = 'ethereum' }) {
  const selected = String(network || '').toLowerCase();
  if (!['ethereum', 'arbitrum', 'solana', 'avalanche'].includes(selected)) {
    throw Object.assign(new Error('Unsupported Ondo deposit network'), { status: 400 });
  }
  return request('/v1/provision_address', {
    method: 'POST',
    token,
    body: {
      symbol: 'USDC',
      network: selected,
      deposit_destination: { id: safeId(accountId, 'account ID'), wallet: 'margin' },
    },
  });
}

async function withdraw(token, { accountId, amount, address, network = 'ethereum', customerWithdrawalId }) {
  const destination = String(address || '').trim();
  const selected = String(network || '').toLowerCase();
  if (selected === 'ethereum' && !isEvmAddress(destination)) throw Object.assign(new Error('Valid Ethereum withdrawal address required'), { status: 400 });
  if (!['ethereum', 'solana', 'avalanche'].includes(selected)) throw Object.assign(new Error('Unsupported Ondo withdrawal network'), { status: 400 });
  return request('/v1/withdraw', {
    method: 'POST',
    token,
    body: {
      customer_withdrawal_id: safeId(customerWithdrawalId || `clash-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`, 'withdrawal ID'),
      symbol: 'USDC',
      network: selected,
      amount: decimalText(amount, 'withdrawal amount'),
      address: destination,
      from: { id: safeId(accountId, 'account ID'), wallet: 'margin' },
    },
  });
}

async function getDepth(market, depth = 25) {
  const payload = await request('/v1/perps/depth', {
    query: { market: marketName(market), depth: Math.max(1, Math.min(100, num(depth, 25))) },
  });
  const row = payload?.result || {};
  return {
    symbol: symbolFromMarket(row.market || market),
    market: marketName(row.market || market),
    timestamp: row.time || null,
    bids: Array.isArray(row.bids) ? row.bids.map(level => ({ price: String(level?.[0] || ''), size: String(level?.[1] || '') })) : [],
    asks: Array.isArray(row.asks) ? row.asks.map(level => ({ price: String(level?.[0] || ''), size: String(level?.[1] || '') })) : [],
    _raw: row,
  };
}

async function getCandles(market, { resolution = '5', from, to } = {}) {
  const now = Math.floor(Date.now() / 1000);
  // `/v1/perps/candles` requires a user JWT. Charts must also work before
  // SIWE, so use Ondo's public TradingView UDF history endpoint and normalize
  // its parallel arrays into Clash's shared candle shape.
  const payload = await request('/v1/perps/history', {
    query: {
      // Ondo UDF history uses `BTCUSD.P` while trading endpoints use
      // `BTC-USD.P`.
      symbol: `${symbolFromMarket(market)}USD.P`,
      resolution: String(resolution || '5'),
      from: num(from, now - 24 * 60 * 60),
      to: num(to, now),
    },
  });
  const row = payload?.result || payload || {};
  const times = Array.isArray(row.t) ? row.t : [];
  return times.map((time, index) => ({
    time: Math.floor(num(time)),
    open: num(row.o?.[index]),
    high: num(row.h?.[index]),
    low: num(row.l?.[index]),
    close: num(row.c?.[index]),
    volume: num(row.v?.[index]),
  })).filter(candle => candle.time > 0 && candle.close > 0);
}

module.exports = {
  ONDO_API_URL,
  ONDO_DEFAULT_BUILDER_CODE,
  ONDO_BUILDER_CODE,
  ONDO_BUILDER_FEE_BPS,
  ONDO_REGION_BLOCKED_MESSAGE,
  ONDO_REGION_UNAVAILABLE_MESSAGE,
  ONDO_RESTRICTED_COUNTRY_CODES,
  addBuilderCode,
  alignOndoDecimal,
  builderConfig,
  buildOrder,
  cancelOrder,
  completeAddressBookChallenge,
  completeLoginChallenge,
  createOrder,
  evaluateRegionAccess,
  getAccount,
  getAddressBook,
  getCandles,
  getDepth,
  getFills,
  getFundingFees,
  getMarketInfo,
  getOrders,
  getPositions,
  getPrices,
  importFillsForPlayer,
  invalidateSession,
  isEvmAddress,
  marketName,
  normalizeAddress,
  normalizeAccount,
  normalizeFill,
  normalizeMarket,
  normalizeOrder,
  normalizePosition,
  normalizeSessionIdentity,
  normalizeToken,
  orderIdentityFromResponse,
  provisionDepositAddress,
  regionAccessForRequest,
  removeStopOrder,
  request,
  requestAddressBookChallenge,
  requestLoginChallenge,
  setLeverage,
  setStopOrder,
  verifySessionOwner,
  withdraw,
};
