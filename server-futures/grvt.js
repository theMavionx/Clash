const GRVT_AUTH_API = String(process.env.GRVT_AUTH_API_URL || 'https://edge.grvt.io').replace(/\/+$/u, '');
const GRVT_MARKET_API = String(process.env.GRVT_MARKET_API_URL || 'https://market-data.grvt.io').replace(/\/+$/u, '');
const GRVT_TRADES_API = String(process.env.GRVT_TRADES_API_URL || 'https://trades.grvt.io').replace(/\/+$/u, '');
const GRVT_BUILDER_ACCOUNT_ID = String(
  process.env.GRVT_BUILDER_ACCOUNT_ID || process.env.VITE_GRVT_BUILDER_ACCOUNT_ID || '',
).trim();
const GRVT_BUILDER_ACCOUNT_HEADER = String(process.env.GRVT_BUILDER_X_ACCOUNT_ID || GRVT_BUILDER_ACCOUNT_ID).trim();
const GRVT_BUILDER_COOKIE = String(process.env.GRVT_BUILDER_COOKIE || '').trim();
const GRVT_BUILDER_API_KEY = String(process.env.GRVT_BUILDER_API_KEY || '').trim();
const GRVT_BUILDER_FEE_BPS = Math.max(0, Number(process.env.GRVT_BUILDER_FEE_BPS || process.env.VITE_GRVT_BUILDER_FEE_BPS || 5));
function normalizeBuilderFeePercent(raw, bps) {
  const text = String(raw || '').trim();
  const n = Number(text);
  if (text && Number.isFinite(n)) {
    const legacyFraction = bps > 0 && Math.abs(n - (bps / 10000)) < 1e-12;
    return String(legacyFraction ? (bps / 100) : n);
  }
  return String(bps / 100);
}
const GRVT_BUILDER_FEE_RATE = normalizeBuilderFeePercent(
  process.env.GRVT_BUILDER_FEE_RATE || process.env.VITE_GRVT_BUILDER_FEE_RATE,
  GRVT_BUILDER_FEE_BPS,
);
const GRVT_FILL_LOOKBACK_LIMIT = Math.max(10, Math.min(1000, Number(process.env.GRVT_FILL_LOOKBACK_LIMIT || 500)));
const GRVT_CHAIN_ID = String(process.env.GRVT_CHAIN_ID || process.env.VITE_GRVT_CHAIN_ID || '325').trim();

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nsToMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  if (n > 1e17) return Math.floor(n / 1e6);
  if (n > 1e14) return Math.floor(n / 1e3);
  return Math.floor(n);
}

function symbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/_USDT?_PERP$/u, '')
    .replace(/_USD_PERP$/u, '')
    .replace(/-PERP$/u, '')
    .replace(/\/USD[TC]?$/u, '');
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.r)) return payload.r;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.positions)) return payload.positions;
  return [];
}

function resultOf(payload) {
  return payload?.result || payload?.r || payload?.data || payload || {};
}

function valueOf(obj, ...keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function decimalFromFixed9(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value).trim();
  if (!text) return '';
  if (text.includes('.')) return text;
  if (!/^-?\d+$/u.test(text)) return text;
  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1) : text;
  if (digits.length <= 9) return text;
  const whole = digits.length > 9 ? digits.slice(0, -9) : '0';
  const frac = digits.length > 9 ? digits.slice(-9) : digits.padStart(9, '0');
  const normalized = `${negative ? '-' : ''}${whole}.${frac}`.replace(/\.?0+$/u, '');
  return normalized === '-0' || normalized === '' ? '0' : normalized;
}

function normalizeTriggerType(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === '1') return 'TAKE_PROFIT';
  if (text === '2') return 'STOP_LOSS';
  return text;
}

function normalizeTickerFundingRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // GRVT ticker docs describe this as centibeeps, while the live full ticker
  // currently returns small percentage-point values such as "0.01".
  // FuturesPanel expects a decimal rate because it displays rate * 100.
  if (Math.abs(n) <= 1) return n / 100;
  return n / 1_000_000;
}

async function post(base, endpoint, body = {}, headers = {}, apiMode = 'full') {
  const r = await fetch(`${base}/${apiMode}/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = typeof data === 'string' ? data : (data?.message || data?.error || text);
    throw new Error(`GRVT ${endpoint} ${r.status}: ${msg || 'request failed'}`);
  }
  return data;
}

async function tradePost(endpoint, fullBody = {}, liteBody = fullBody, headers = {}) {
  try {
    return await post(GRVT_TRADES_API, endpoint, liteBody, headers, 'lite');
  } catch (liteError) {
    try {
      return await post(GRVT_TRADES_API, endpoint, fullBody, headers, 'full');
    } catch {
      throw liteError;
    }
  }
}

async function authPost(endpoint, body = {}, headers = {}) {
  const r = await fetch(`${GRVT_AUTH_API}/${endpoint.replace(/^\/+/u, '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'rm=true;', ...headers },
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = typeof data === 'string' ? data : (data?.message || data?.error || text);
    throw new Error(`GRVT auth ${endpoint} ${r.status}: ${msg || 'request failed'}`);
  }
  return { data, headers: r.headers };
}

function setCookieValues(headers) {
  const values = [];
  if (typeof headers.getSetCookie === 'function') {
    values.push(...headers.getSetCookie());
  }
  const raw = headers.get('set-cookie');
  if (raw) values.push(raw);
  return values;
}

function extractGravityCookie(headers) {
  for (const raw of setCookieValues(headers)) {
    const part = String(raw || '').split(';')[0].trim();
    if (/^gravity=/i.test(part)) return part;
  }
  return null;
}

function authHeaders(creds) {
  const cookie = String(creds?.cookie || creds?.grvt_cookie || '').trim();
  const accountId = String(creds?.accountId || creds?.account_id || '').trim();
  if (!cookie) throw new Error('GRVT session cookie required');
  if (!accountId) throw new Error('GRVT account id required');
  return { Cookie: cookie, 'X-Grvt-Account-Id': accountId };
}

function credentials(input = {}) {
  const apiKey = String(input.apiKey || input.api_key || '').trim();
  const cookie = String(input.cookie || input.grvt_cookie || '').trim();
  const accountId = String(input.accountId || input.account_id || '').trim();
  const subAccountId = String(input.subAccountId || input.sub_account_id || '').trim();
  if (!apiKey && !cookie) throw new Error('GRVT API key or session cookie required');
  if (!apiKey && !accountId) throw new Error('GRVT account id required');
  return { apiKey, cookie, accountId, subAccountId };
}

const apiKeySessions = new Map();

async function apiKeyAuthHeaders(apiKey, fallbackAccountHeader = '') {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('GRVT API key required');
  const cached = apiKeySessions.get(key);
  if (cached?.cookie && cached?.accountHeader && Date.now() < cached.expiresAt) {
    return {
      Cookie: cached.cookie,
      'X-Grvt-Account-Id': cached.accountHeader,
      subAccountId: cached.subAccountId || '',
      fundingAccountAddress: cached.fundingAccountAddress || '',
    };
  }
  const login = await authPost('/auth/api_key/login', { api_key: key });
  const cookie = extractGravityCookie(login.headers);
  const accountHeader = String(login.headers.get('x-grvt-account-id') || fallbackAccountHeader || '').trim();
  const subAccountId = String(login.data?.sub_account_id || '').trim();
  const fundingAccountAddress = String(login.data?.funding_account_address || '').trim();
  if (!cookie) throw new Error('GRVT API key login did not return gravity cookie');
  if (!accountHeader) throw new Error('GRVT API key login did not return x-grvt-account-id');
  apiKeySessions.set(key, {
    cookie,
    accountHeader,
    subAccountId,
    fundingAccountAddress,
    expiresAt: Date.now() + 23 * 60 * 60_000,
  });
  return { Cookie: cookie, 'X-Grvt-Account-Id': accountHeader, subAccountId, fundingAccountAddress };
}

async function resolveCreds(credsInput) {
  const creds = credentials(credsInput);
  if (creds.apiKey) {
    const session = await apiKeyAuthHeaders(creds.apiKey, creds.accountId);
    const subAccountId = session.subAccountId || creds.subAccountId;
    if (!subAccountId) throw new Error('GRVT API key login did not return sub_account_id; enter your GRVT trading account ID');
    return {
      ...creds,
      cookie: session.Cookie,
      accountId: session['X-Grvt-Account-Id'],
      subAccountId,
      fundingAccountAddress: session.fundingAccountAddress || '',
    };
  }
  if (!creds.subAccountId) throw new Error('GRVT sub account id required');
  return creds;
}

let instrumentsCache = { at: 0, rows: null };
async function getInstruments() {
  if (instrumentsCache.rows && Date.now() - instrumentsCache.at < 30_000) return instrumentsCache.rows;
  const payload = await post(GRVT_MARKET_API, 'all_instruments', { is_active: true });
  const list = rows(payload)
    .filter(i => String(i?.kind || '').toUpperCase() === 'PERPETUAL' || /_Perp$/i.test(String(i?.instrument || '')));
  instrumentsCache = { at: Date.now(), rows: list };
  return list;
}

async function ticker(instrument) {
  try {
    return (await post(GRVT_MARKET_API, 'ticker', { instrument }))?.result || null;
  } catch {
    return null;
  }
}

async function getMarketInfo() {
  const instruments = await getInstruments();
  const tickers = await Promise.all(instruments.slice(0, 120).map(i => ticker(i.instrument)));
  const data = instruments.slice(0, 120).map((i, idx) => {
    const t = tickers[idx] || {};
    const mark = num(t.mark_price || t.markPrice || t.last_price || t.index_price);
    const open24h = num(t.open_price || t.openPrice || t.price_24h_ago || t.price24hAgo);
    const changePct = num(t.change_24h || t.price_change_24h || t.priceChange24h, NaN);
    const yesterday = open24h > 0
      ? open24h
      : (mark && Number.isFinite(changePct) ? mark / (1 + changePct / 100) : 0);
    const base = symbolOf(i.instrument);
    return {
      symbol: base,
      base,
      pair: `${base}/${i.quote || 'USDT'}`,
      market_name: i.instrument,
      pair_index: idx,
      lot_size: String(i.min_size || ''),
      tick_size: String(i.tick_size || ''),
      min_order_size: String(i.min_size || ''),
      min_notional_usd: Number(i.min_notional || 0),
      max_leverage: 50,
      mark,
      mid: mark,
      oracle: num(t.index_price, mark),
      yesterday_price: yesterday,
      price_change_24h: mark && yesterday > 0 ? ((mark - yesterday) / yesterday) * 100 : 0,
      high_24h: num(t.high_price),
      low_24h: num(t.low_price),
      open_interest: num(t.open_interest),
      volume_24h: num(t.volume_24h),
      funding_rate: normalizeTickerFundingRate(t.funding_rate ?? t.fr2),
      funding_interval_hours: Number(t.funding_interval_hours || t.fi || 0) || null,
      next_funding_time: t.next_funding_time || t.nf || null,
      _grvt: { instrument: i.instrument, raw: i, ticker: t },
      _raw: i,
    };
  }).filter(m => m.symbol);
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
      funding_interval_hours: m.funding_interval_hours || null,
      next_funding_time: m.next_funding_time || null,
    })),
  };
}

async function getAccount(credsInput) {
  const creds = await resolveCreds(credsInput);
  const headers = authHeaders(creds);
  const payload = await tradePost('account_summary', {
    sub_account_id: creds.subAccountId,
  }, {
    sa: creds.subAccountId,
  }, headers);
  let funding = null;
  try {
    const fundingPayload = await tradePost('funding_account_summary', {}, {}, headers);
    funding = fundingPayload?.result || fundingPayload || null;
  } catch (e) {
    try {
      const aggregatedPayload = await tradePost('aggregated_account_summary', {}, {}, headers);
      funding = resultOf(aggregatedPayload);
    } catch {
      console.warn('[grvt] funding summary failed:', e.message);
    }
  }
  const r = resultOf(payload);
  const fundingSpotBalances = rows(funding?.spot_balances || funding?.spotBalances || funding?.sb);
  const fundingUsdt = fundingSpotBalances.find(b => String(valueOf(b, 'currency', 'c') || '').toUpperCase() === 'USDT') || null;
  const fundingUsdc = fundingSpotBalances.find(b => String(valueOf(b, 'currency', 'c') || '').toUpperCase() === 'USDC') || null;
  const fundingBalance = num(valueOf(fundingUsdt, 'balance', 'b') ?? valueOf(fundingUsdc, 'balance', 'b'));
  const fundingCurrency = fundingUsdt ? 'USDT' : (fundingUsdc ? 'USDC' : '');
  const spotBalances = rows(r.spot_balances || r.spotBalances || r.sb);
  const usdt = spotBalances.find(b => String(valueOf(b, 'currency', 'c') || '').toUpperCase() === 'USDT') || null;
  const usdc = spotBalances.find(b => String(valueOf(b, 'currency', 'c') || '').toUpperCase() === 'USDC') || null;
  const spotBalance = valueOf(usdt, 'balance', 'b') ?? valueOf(usdc, 'balance', 'b');
  const equity = valueOf(r, 'account_equity', 'total_account_value', 'total_equity', 'equity', 'te', 'total_cross_equity', 'tc', 'margin_balance', 'mb', 'balance') ?? spotBalance;
  const available = valueOf(r, 'available_balance', 'available_to_spend', 'available_to_withdraw', 'ab', 'total_sub_account_available_balance', 'available') ?? spotBalance;
  const initialMargin = valueOf(r, 'total_initial_margin', 'initial_margin', 'im');
  const maintenanceMargin = valueOf(r, 'maintenance_margin', 'mm');
  return {
    balance: String(equity || 0),
    usdc: String(available || 0),
    account_equity: String(equity || 0),
    available_to_spend: String(available || 0),
    available_to_withdraw: String(available || 0),
    total_margin_used: String(initialMargin || maintenanceMargin || 0),
    funding_balance: String(fundingBalance),
    funding_currency: fundingCurrency,
    funding_total_equity: String(valueOf(funding, 'total_equity', 'te') || 0),
    funding_spot_balances: fundingSpotBalances,
    positions_count: rows(r.positions).length,
    _raw: r,
    _funding_raw: funding,
  };
}

async function getPositions(credsInput) {
  const creds = await resolveCreds(credsInput);
  const payload = await post(GRVT_TRADES_API, 'positions', {
    sub_account_id: creds.subAccountId,
    kind: ['PERPETUAL'],
  }, authHeaders(creds));
  return rows(payload).map(p => {
    const size = Math.abs(num(p.size || p.quantity));
    if (!p?.instrument || size <= 0) return null;
    const isLong = num(p.size || p.quantity) >= 0;
    const marginType = String(p.margin_type || p.mt || '').toUpperCase();
    const notional = num(valueOf(p, 'notional', 'position_value', 'pv'));
    const leverage = num(valueOf(p, 'leverage', 'l'));
    const isolatedMargin = valueOf(p, 'isolated_balance', 'isolated_im', 'ib', 'ii');
    const derivedMargin = notional > 0 && leverage > 0 ? String(notional / leverage) : '';
    const rawPnlPct = valueOf(p, 'pnl_pct', 'return_on_equity', 'roe');
    return {
      symbol: symbolOf(p.instrument),
      side: isLong ? 'bid' : 'ask',
      amount: String(size),
      size_usd: notional,
      entry_price: String(p.entry_price || p.average_entry_price || ''),
      mark_price: String(p.mark_price || ''),
      liquidation_price: p.liquidation_price || null,
      margin: String(isolatedMargin || derivedMargin || ''),
      leverage: String(leverage || ''),
      pnl_usd: String(p.unrealized_pnl || p.pnl || ''),
      ...(rawPnlPct != null ? { pnl_pct: String(rawPnlPct) } : {}),
      pair_index: null,
      trade_index: null,
      is_isolated: marginType === 'ISOLATED',
      margin_type: marginType || '',
      _raw: p,
    };
  }).filter(Boolean);
}

async function getInitialLeverage(credsInput) {
  const creds = await resolveCreds(credsInput);
  const payload = await tradePost('get_all_initial_leverage', {
    sub_account_id: creds.subAccountId,
  }, {
    sa: creds.subAccountId,
  }, authHeaders(creds));
  return rows(payload).map(row => ({
    instrument: String(row.instrument || row.i || '').trim(),
    symbol: symbolOf(row.instrument || row.i),
    leverage: String(row.leverage || row.l || ''),
    min_leverage: String(row.min_leverage || row.ml || ''),
    max_leverage: String(row.max_leverage || row.ml1 || ''),
    margin_type: String(row.margin_type || row.mt || '').toUpperCase(),
    _raw: row,
  })).filter(row => row.instrument);
}

async function getOrders(credsInput) {
  const creds = await resolveCreds(credsInput);
  const payload = await post(GRVT_TRADES_API, 'open_orders', {
    sub_account_id: creds.subAccountId,
    kind: ['PERPETUAL'],
  }, authHeaders(creds));
  return rows(payload).map(o => {
    const leg = Array.isArray(o.legs) ? o.legs[0] : o;
    const metadata = o.metadata || o.m || {};
    const trigger = metadata.trigger || metadata.t || {};
    const tpsl = trigger.tpsl || trigger.t || {};
    const triggerType = normalizeTriggerType(trigger.trigger_type || trigger.tt);
    const triggerPrice = decimalFromFixed9(tpsl.trigger_price || tpsl.tp);
    const limitPrice = decimalFromFixed9(leg?.limit_price || leg?.lp || o.limit_price || o.lp);
    const size = leg?.size || leg?.s || o.size || o.s || '';
    const isBuyingAsset = leg?.is_buying_asset ?? leg?.ib ?? o.is_buying_asset ?? o.ib;
    const isTriggerOrder = triggerType === 'TAKE_PROFIT' || triggerType === 'STOP_LOSS';
    return {
      symbol: symbolOf(leg?.instrument || leg?.i || o.instrument || o.i),
      side: isBuyingAsset === false ? 'ask' : 'bid',
      amount: String(size),
      initial_amount: String(size),
      price: String(limitPrice),
      stop_price: triggerPrice || null,
      trigger_price: triggerPrice || null,
      trigger_type: triggerType || null,
      take_profit_price: triggerType === 'TAKE_PROFIT' ? triggerPrice : null,
      stop_loss_price: triggerType === 'STOP_LOSS' ? triggerPrice : null,
      is_trigger_order: isTriggerOrder,
      order_id: o.order_id || o.oi,
      order_type: (o.is_market ?? o.im) ? 'market' : 'limit',
      tif: o.time_in_force || o.ti || null,
      reduce_only: !!(o.reduce_only ?? o.ro),
      pair_index: null,
      trade_index: null,
      client_order_id: metadata.client_order_id || metadata.co || o.client_order_id || o.co || null,
      _raw: o,
    };
  });
}

async function getAccountTradeHistory(credsInput, opts = {}) {
  const creds = await resolveCreds(credsInput);
  const payload = await post(GRVT_TRADES_API, 'fill_history', {
    sub_account_id: creds.subAccountId,
    kind: ['PERPETUAL'],
    limit: Math.max(1, Math.min(1000, Number(opts.limit) || GRVT_FILL_LOOKBACK_LIMIT)),
    ...(opts.base ? { base: Array.isArray(opts.base) ? opts.base : [String(opts.base)] } : {}),
    ...(opts.quote ? { quote: Array.isArray(opts.quote) ? opts.quote : [String(opts.quote)] } : {}),
    ...(opts.start_time ? { start_time: String(opts.start_time) } : {}),
    ...(opts.end_time ? { end_time: String(opts.end_time) } : {}),
    ...(opts.cursor ? { cursor: String(opts.cursor) } : {}),
  }, authHeaders(creds));
  return rows(payload).map(fill => ({
    ...fill,
    _dex: 'grvt',
    id: fill.trade_id || `${fill.event_time || ''}:${fill.instrument || ''}:${fill.size || ''}:${fill.price || ''}`,
    symbol: symbolOf(fill.instrument),
    side: fill.is_buyer ? 'open_long' : 'open_short',
    action: fill.is_buyer ? 'open_long' : 'open_short',
    amount: String(Math.abs(num(fill.size))),
    price: String(fill.price || ''),
    fee: Math.abs(num(fill.fee)),
    created_at: nsToMs(fill.event_time),
    realized_pnl_amount: fill.realized_pnl,
  }));
}

function builderConfigured() {
  return !!(GRVT_BUILDER_ACCOUNT_ID && GRVT_BUILDER_ACCOUNT_HEADER && (GRVT_BUILDER_COOKIE || GRVT_BUILDER_API_KEY));
}

function getBuilderConfig() {
  return {
    accountId: GRVT_BUILDER_ACCOUNT_ID || null,
    accountHeader: GRVT_BUILDER_ACCOUNT_HEADER || null,
    feeBps: GRVT_BUILDER_FEE_BPS,
    feeRate: GRVT_BUILDER_FEE_RATE,
    authMode: GRVT_BUILDER_COOKIE ? 'cookie' : (GRVT_BUILDER_API_KEY ? 'api_key' : 'missing'),
    configured: builderConfigured(),
  };
}

function normalizeId(value) {
  return String(value || '').trim();
}

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function fillAccountId(fill) {
  return normalizeId(valueOf(
    fill,
    'sub_account_id',
    'sa',
    'off_chain_account_id',
    'oa',
    'account_id',
    'accountId',
  ));
}

function fillBuilderId(fill) {
  return normalizeAddress(valueOf(fill, 'builder', 'builder_account_id', 'builderAccountId', 'b'));
}

function isOurBuilderFill(fill, { trustedBuilderEndpoint = false } = {}) {
  const builder = fillBuilderId(fill);
  if (builder) return builder === normalizeAddress(GRVT_BUILDER_ACCOUNT_ID);
  return trustedBuilderEndpoint;
}

function normalizeSignedOrder(input = {}) {
  const order = input.order || input.o || input;
  if (!order || typeof order !== 'object') throw new Error('GRVT signed order required');
  const signature = order.signature || order.s || {};
  const metadata = order.metadata || order.m || {};
  const legs = Array.isArray(order.legs || order.l) ? (order.legs || order.l) : [];
  if (!String(order.sub_account_id || order.sa || '').trim()) throw new Error('GRVT order missing sub_account_id');
  if (!legs.length) throw new Error('GRVT order missing legs');
  if (!String(signature.r || '').trim() || !String(signature.s || signature.s1 || '').trim()) {
    throw new Error('GRVT order missing signature');
  }
  const builder = String(order.builder || order.b || '').trim();
  if (!builder || builder.toLowerCase() !== GRVT_BUILDER_ACCOUNT_ID.toLowerCase()) {
    throw new Error('GRVT order must include the Clash builder account');
  }
  const builderFee = String(order.builder_fee || order.bf || '').trim();
  if (!builderFee || Number(builderFee) < 0) throw new Error('GRVT order missing builder_fee');
  return {
    order_id: String(order.order_id || order.oi || '0'),
    sub_account_id: String(order.sub_account_id || order.sa),
    is_market: !!(order.is_market ?? order.im),
    time_in_force: String(order.time_in_force || order.ti || '').trim(),
    post_only: !!(order.post_only ?? order.po),
    reduce_only: !!(order.reduce_only ?? order.ro),
    legs: legs.map(leg => ({
      instrument: String(leg.instrument || leg.i || '').trim(),
      size: String(leg.size || leg.s || '').trim(),
      limit_price: String(leg.limit_price ?? leg.lp ?? '0'),
      is_buying_asset: !!(leg.is_buying_asset ?? leg.ib),
    })),
    signature: {
      signer: String(signature.signer || signature.s || '').trim(),
      r: String(signature.r || '').trim(),
      s: String(signature.s || signature.s1 || '').trim(),
      v: Number(signature.v),
      expiration: String(signature.expiration || signature.e || '').trim(),
      nonce: Number(signature.nonce ?? signature.n),
      chain_id: String(signature.chain_id || signature.ci || GRVT_CHAIN_ID),
    },
    metadata: {
      client_order_id: String(metadata.client_order_id || metadata.co || '').trim(),
      ...(metadata.create_time || metadata.ct ? { create_time: String(metadata.create_time || metadata.ct) } : {}),
      ...(metadata.trigger || metadata.t ? { trigger: normalizeTriggerMetadata(metadata.trigger || metadata.t) } : {}),
      ...(metadata.broker || metadata.b ? { broker: metadata.broker || metadata.b } : {}),
    },
    builder,
    builder_fee: builderFee,
  };
}

function normalizeTriggerMetadata(input = {}) {
  const tpsl = input.tpsl || input.t || {};
  const triggerType = String(input.trigger_type || input.tt || '').trim();
  if (!triggerType) throw new Error('GRVT trigger order missing trigger_type');
  return {
    trigger_type: triggerType,
    tpsl: {
      trigger_by: String(tpsl.trigger_by || tpsl.tb || 'LAST').trim(),
      trigger_price: String(tpsl.trigger_price || tpsl.tp || '').trim(),
      close_position: !!(tpsl.close_position ?? tpsl.cp),
      is_split_position: !!(tpsl.is_split_position ?? tpsl.is),
    },
  };
}

function toLiteOrder(order) {
  return {
    oi: order.order_id || '0',
    sa: order.sub_account_id,
    im: order.is_market,
    ti: order.time_in_force,
    po: order.post_only,
    ro: order.reduce_only,
    l: order.legs.map(leg => ({
      i: leg.instrument,
      s: leg.size,
      lp: leg.limit_price,
      ib: leg.is_buying_asset,
    })),
    s: {
      s: order.signature.signer,
      r: order.signature.r,
      s1: order.signature.s,
      v: order.signature.v,
      e: order.signature.expiration,
      n: order.signature.nonce,
      ci: order.signature.chain_id || GRVT_CHAIN_ID,
    },
    m: {
      co: order.metadata.client_order_id,
      ...(order.metadata.create_time ? { ct: order.metadata.create_time } : {}),
      ...(order.metadata.trigger ? { t: {
        tt: order.metadata.trigger.trigger_type,
        t: {
          tb: order.metadata.trigger.tpsl.trigger_by,
          tp: order.metadata.trigger.tpsl.trigger_price,
          cp: order.metadata.trigger.tpsl.close_position,
          is: order.metadata.trigger.tpsl.is_split_position,
        },
      } } : {}),
      ...(order.metadata.broker ? { b: order.metadata.broker } : {}),
    },
    b: order.builder,
    bf: order.builder_fee,
  };
}

async function submitSignedOrder(credsInput, signedOrderInput) {
  if (!builderConfigured()) throw new Error('GRVT builder account is not configured');
  const creds = await resolveCreds(credsInput);
  const order = normalizeSignedOrder(signedOrderInput);
  if (String(order.sub_account_id) !== String(creds.subAccountId)) {
    throw new Error('GRVT signed order subaccount does not match saved credentials');
  }
  const headers = authHeaders(creds);
  const payload = await tradePost('create_order', { order }, { o: toLiteOrder(order) }, headers);
  const result = resultOf(payload);
  return {
    success: true,
    order_id: result.order_id || result.oi || order.order_id || null,
    client_order_id: order.metadata.client_order_id,
    status: result.state?.status || result.s1?.s || result.status || 'pending',
    result,
  };
}

async function setInitialLeverage(credsInput, opts = {}) {
  const creds = await resolveCreds(credsInput);
  const instrument = String(opts.instrument || opts.i || '').trim();
  const leverage = String(opts.leverage || opts.l || '').trim();
  if (!instrument) throw new Error('GRVT instrument required');
  if (!leverage || !Number.isFinite(Number(leverage)) || Number(leverage) <= 0) {
    throw new Error('GRVT leverage required');
  }
  const full = {
    sub_account_id: creds.subAccountId,
    instrument,
    leverage,
  };
  const lite = {
    sa: creds.subAccountId,
    i: instrument,
    l: leverage,
  };
  const payload = await tradePost('set_initial_leverage', full, lite, authHeaders(creds));
  const result = resultOf(payload);
  return { success: !!(result.success ?? result.s ?? true), result };
}

async function setPositionConfig(credsInput, opts = {}) {
  const creds = await resolveCreds(credsInput);
  const instrument = String(opts.instrument || opts.i || '').trim();
  const marginType = String(opts.marginType || opts.margin_type || opts.mt || 'CROSS').trim().toUpperCase();
  const leverage = String(opts.leverage || opts.l || '').trim();
  const sig = opts.signature || {};
  if (!instrument) throw new Error('GRVT instrument required');
  if (!['CROSS', 'ISOLATED'].includes(marginType)) throw new Error('GRVT margin_type must be CROSS or ISOLATED');
  if (!leverage || !Number.isFinite(Number(leverage)) || Number(leverage) <= 0) {
    throw new Error('GRVT leverage required');
  }
  const signature = {
    signer: String(sig.signer || sig.s || '').trim(),
    r: String(sig.r || '').trim(),
    s: String(sig.s || sig.s1 || '').trim(),
    v: Number(sig.v),
    expiration: String(sig.expiration || sig.e || '').trim(),
    nonce: Number(sig.nonce ?? sig.n),
    chain_id: String(sig.chain_id || sig.ci || GRVT_CHAIN_ID),
  };
  if (!signature.signer || !signature.r || !signature.s || !signature.expiration || !Number.isFinite(signature.nonce)) {
    throw new Error('GRVT position config signature required');
  }
  const full = {
    sub_account_id: creds.subAccountId,
    instrument,
    margin_type: marginType,
    leverage,
    signature,
  };
  const lite = {
    sa: creds.subAccountId,
    i: instrument,
    mt: marginType,
    l: leverage,
    s: {
      s: signature.signer,
      r: signature.r,
      s1: signature.s,
      v: signature.v,
      e: signature.expiration,
      n: signature.nonce,
      ci: signature.chain_id || GRVT_CHAIN_ID,
    },
  };
  let payload;
  try {
    payload = await post(GRVT_TRADES_API, 'set_position_config', full, authHeaders(creds), 'full');
  } catch (fullError) {
    try {
      payload = await post(GRVT_TRADES_API, 'set_position_config', lite, authHeaders(creds), 'lite');
    } catch {
      throw fullError;
    }
  }
  const result = resultOf(payload);
  return { success: !!(result.ack ?? result.a ?? true), ack: result.ack ?? result.a ?? true, result };
}

async function cancelOrder(credsInput, opts = {}) {
  const creds = await resolveCreds(credsInput);
  const orderId = String(opts.orderId || opts.order_id || '').trim();
  const clientOrderId = String(opts.clientOrderId || opts.client_order_id || '').trim();
  if (!orderId && !clientOrderId) throw new Error('GRVT order_id or client_order_id required');
  const full = {
    sub_account_id: creds.subAccountId,
    ...(orderId ? { order_id: orderId } : {}),
    ...(clientOrderId ? { client_order_id: clientOrderId } : {}),
    time_to_live_ms: String(opts.timeToLiveMs || opts.time_to_live_ms || 500),
  };
  const lite = {
    sa: creds.subAccountId,
    ...(orderId ? { oi: orderId } : {}),
    ...(clientOrderId ? { co: clientOrderId } : {}),
    tt: String(opts.timeToLiveMs || opts.time_to_live_ms || 500),
  };
  const payload = await tradePost('cancel_order', full, lite, authHeaders(creds));
  const result = resultOf(payload);
  return { success: true, ack: result.ack ?? result.a ?? true, result };
}

async function authorizeBuilder(input = {}) {
  if (!GRVT_BUILDER_ACCOUNT_ID) throw new Error('GRVT builder account is not configured');
  const mainAccountId = String(input.mainAccountId || input.main_account_id || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(mainAccountId)) throw new Error('GRVT funding account address required');
  const sig = input.signature || {};
  const body = {
    main_account_id: mainAccountId,
    builder_account_id: GRVT_BUILDER_ACCOUNT_ID,
    max_futures_fee_rate: String(input.maxFuturesFeeRate || input.max_futures_fee_rate || GRVT_BUILDER_FEE_RATE),
    max_spot_fee_rate: String(input.maxSpotFeeRate || input.max_spot_fee_rate || GRVT_BUILDER_FEE_RATE),
    signature: {
      signer: String(sig.signer || sig.s || '').trim(),
      r: String(sig.r || '').trim(),
      s: String(sig.s || sig.s1 || '').trim(),
      v: Number(sig.v),
      expiration: String(sig.expiration || sig.e || '').trim(),
      nonce: Number(sig.nonce ?? sig.n),
      chain_id: String(sig.chain_id || sig.ci || GRVT_CHAIN_ID),
    },
  };
  const { data } = await authPost('/auth/builder/authorize', body);
  return { success: true, result: data || null };
}

let builderSession = { cookie: '', accountHeader: '', expiresAt: 0 };

async function getBuilderAuthHeaders() {
  if (GRVT_BUILDER_COOKIE) {
    return { Cookie: GRVT_BUILDER_COOKIE, 'X-Grvt-Account-Id': GRVT_BUILDER_ACCOUNT_HEADER };
  }
  if (!GRVT_BUILDER_API_KEY) {
    throw new Error('GRVT builder auth requires GRVT_BUILDER_API_KEY or GRVT_BUILDER_COOKIE');
  }
  if (
    builderSession.cookie
    && Date.now() < builderSession.expiresAt
    && (builderSession.accountHeader || GRVT_BUILDER_ACCOUNT_HEADER)
  ) {
    return {
      Cookie: builderSession.cookie,
      'X-Grvt-Account-Id': builderSession.accountHeader || GRVT_BUILDER_ACCOUNT_HEADER,
    };
  }
  const login = await authPost('/auth/api_key/login', { api_key: GRVT_BUILDER_API_KEY });
  const cookie = extractGravityCookie(login.headers);
  const accountHeader = String(login.headers.get('x-grvt-account-id') || GRVT_BUILDER_ACCOUNT_HEADER || '').trim();
  if (!cookie) throw new Error('GRVT API key login did not return gravity cookie');
  if (!accountHeader) throw new Error('GRVT API key login did not return x-grvt-account-id');
  builderSession = {
    cookie,
    accountHeader,
    expiresAt: Date.now() + 23 * 60 * 60_000,
  };
  return { Cookie: cookie, 'X-Grvt-Account-Id': accountHeader };
}

function normalizeBuilderFill(fill) {
  const instrument = valueOf(fill, 'instrument', 'i');
  const size = Math.abs(num(valueOf(fill, 'size', 's', 'amount')));
  const price = num(valueOf(fill, 'price', 'p'));
  const fee = num(valueOf(fill, 'fee', 'f', 'builder_fee', 'builderFee'));
  const notional = size * price;
  if (!instrument || !Number.isFinite(notional) || notional < 10 || notional > 10_000_000) return null;
  const event = String(valueOf(fill, 'event_time', 'et', 'created_at', 'timestamp', 'time') || '');
  const account = fillAccountId(fill) || 'unknown';
  const tradeId = normalizeId(valueOf(fill, 'trade_id', 'id'));
  const clientOrderId = normalizeId(valueOf(fill, 'client_order_id', 'co'));
  const orderId = normalizeId(valueOf(fill, 'order_id', 'orderId', 'oid'));
  const builder = fillBuilderId(fill);
  const isBuyer = Boolean(valueOf(fill, 'is_buyer', 'ib'));
  const eventKey = tradeId || clientOrderId || `${event}:${instrument}:${size}:${price}:${isBuyer ? 'b' : 's'}`;
  return {
    symbol: symbolOf(instrument),
    side: isBuyer ? 'long' : 'short',
    orderType: 'builder_fill',
    amount: String(size),
    price: String(price),
    orderId: orderId || `${event}:${account}`,
    clientOrderId: clientOrderId ? `grvt:${account}:${clientOrderId}` : `grvt:${account}:${eventKey}`,
    status: 'filled',
    dex: 'grvt',
    notional_usd: notional,
    verifiedSource: 'grvt_builder',
    pnl: null,
    fee: String(fee),
    proofJson: JSON.stringify({
      source: 'grvt_builder_fill_history',
      builder_account_id: builder || GRVT_BUILDER_ACCOUNT_ID || null,
      sub_account_id: account,
      trade_id: tradeId || null,
      client_order_id: clientOrderId || null,
      order_id: orderId || null,
      event_time: event || null,
      fee: String(fee),
      fill,
    }),
    created_at: nsToMs(event),
    _raw: fill,
  };
}

async function getBuilderFillHistory(opts = {}) {
  if (!builderConfigured()) {
    return { ok: false, reason: 'builder_not_configured', result: [] };
  }
  const headers = await getBuilderAuthHeaders();
  const payload = await post(GRVT_TRADES_API, 'builder_fill_history', {
    limit: Math.max(1, Math.min(1000, Number(opts.limit) || GRVT_FILL_LOOKBACK_LIMIT)),
    ...(opts.start_time ? { start_time: String(opts.start_time) } : {}),
    ...(opts.end_time ? { end_time: String(opts.end_time) } : {}),
    ...(opts.cursor ? { cursor: String(opts.cursor) } : {}),
  }, headers);
  return payload;
}

async function importFillsForPlayer(playerId, accountInput, opts = {}) {
  if (!GRVT_BUILDER_ACCOUNT_ID) {
    return { ok: false, imported: 0, adopted: 0, skipped: 0, total: 0, reason: 'builder_account_not_configured' };
  }
  const db = require('./db');
  const accountCreds = accountInput && typeof accountInput === 'object' ? accountInput : null;
  const target = normalizeId(accountCreds?.subAccountId || accountCreds?.sub_account_id || accountInput);
  if (!target) return { ok: false, imported: 0, adopted: 0, skipped: 0, total: 0, reason: 'sub_account_required' };

  let fills = [];
  let source = 'account_fill_history';
  if (accountCreds) {
    fills = (await getAccountTradeHistory(accountCreds, opts))
      .filter(f => fillAccountId(f) === target && isOurBuilderFill(f));
  } else if (builderConfigured()) {
    source = 'builder_fill_history';
    const payload = await getBuilderFillHistory(opts);
    fills = rows(payload)
      .filter(f => fillAccountId(f) === target && isOurBuilderFill(f, { trustedBuilderEndpoint: true }));
  } else {
    return { ok: false, imported: 0, adopted: 0, skipped: 0, total: 0, reason: 'grvt_credentials_or_builder_auth_required' };
  }
  let imported = 0;
  let adopted = 0;
  let skipped = 0;
  for (const fill of fills) {
    const trade = normalizeBuilderFill(fill);
    if (!trade) { skipped++; continue; }
    try {
      const before = db.db.prepare('SELECT id, player_id FROM trade_history WHERE client_order_id = ? LIMIT 1').get(trade.clientOrderId);
      if (before) {
        db.db.prepare(`
          UPDATE trade_history
          SET fee = COALESCE(NULLIF(fee, ''), ?),
              proof_json = COALESCE(NULLIF(proof_json, ''), ?)
          WHERE id = ? AND dex = 'grvt' AND verified_source = 'grvt_builder'
        `).run(trade.fee || null, trade.proofJson || null, before.id);
        if (before.player_id !== playerId) {
          const moved = db.db.prepare(`
            UPDATE trade_history
            SET player_id = ?
            WHERE id = ? AND dex = 'grvt' AND verified_source = 'grvt_builder'
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
        console.warn('[grvt] addTrade failed:', e.message);
      }
    }
  }
  return { ok: true, imported, adopted, skipped, total: fills.length, source, builder_configured: builderConfigured() };
}

module.exports = {
  credentials,
  resolveCreds,
  getMarketInfo,
  getPrices,
  getAccount,
  getPositions,
  getInitialLeverage,
  getOrders,
  getAccountTradeHistory,
  getBuilderConfig,
  getBuilderFillHistory,
  importFillsForPlayer,
  submitSignedOrder,
  setInitialLeverage,
  setPositionConfig,
  cancelOrder,
  authorizeBuilder,
};
