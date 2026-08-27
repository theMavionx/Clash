const crypto = require('crypto');

const ETORO_API_ORIGIN = String(
  process.env.ETORO_API_ORIGIN || 'https://public-api.etoro.com',
).replace(/\/+$/u, '');
const ETORO_BUILDERS_URL = 'https://builders.etoro.com/';
const ETORO_APP_URL = 'https://www.etoro.com/portfolio';
const REQUEST_TIMEOUT_MS = Math.max(2_000, Math.min(30_000, Number(process.env.ETORO_FETCH_TIMEOUT_MS || 12_000)));
const MARKET_CACHE_TTL_MS = Math.max(30_000, Math.min(15 * 60_000, Number(process.env.ETORO_MARKET_CACHE_TTL_MS || 5 * 60_000)));
const HISTORY_DAYS = Math.max(1, Math.min(364, Number(process.env.ETORO_HISTORY_DAYS || 90)));

let fetchImpl = (...args) => fetch(...args);
const marketCache = new Map();

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function firstNumber(...values) {
  for (const value of values) {
    const result = Number(value);
    if (Number.isFinite(result)) return result;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const result = String(value ?? '').trim();
    if (result) return result;
  }
  return '';
}

function rows(payload, ...keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function apiError(message, status = 502, payload = null, headers = null) {
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  const retryAfter = headers?.get?.('retry-after');
  if (retryAfter) error.retryAfter = retryAfter;
  return error;
}

function credentials(input = {}) {
  const apiKey = firstText(input.apiKey, input.api_key);
  const userKey = firstText(input.userKey, input.user_key);
  const rawEnvironment = firstText(input.environment, input.env, 'demo').toLowerCase();
  const environment = rawEnvironment === 'real' ? 'real' : rawEnvironment === 'demo' ? 'demo' : '';
  if (!apiKey || !userKey) {
    throw apiError('eToro API key and user key are required', 400);
  }
  if (!environment) throw apiError('eToro environment must be real or demo', 400);
  return { apiKey, userKey, environment };
}

function credentialFingerprint(input) {
  const creds = credentials(input);
  return crypto
    .createHash('sha256')
    .update(`etoro:${creds.environment}:${creds.apiKey}\u0000${creds.userKey}`)
    .digest('hex')
    .slice(0, 24);
}

function credentialStatus(input = null) {
  let creds = null;
  try { creds = credentials(input || {}); } catch {}
  return {
    has_credentials: !!creds,
    environment: creds?.environment || null,
    browser_storage_only: true,
    oauth_configured: !!(process.env.ETORO_OAUTH_CLIENT_ID && process.env.ETORO_OAUTH_CLIENT_SECRET),
  };
}

function environmentSegment(input) {
  return credentials(input).environment === 'demo' ? '/demo' : '';
}

function accountEnvironmentSegment(input) {
  return credentials(input).environment === 'demo' ? '/demo' : '/real';
}

function extractUpstreamMessage(payload, status) {
  const detail = payload?.detail || payload?.title || payload?.message
    || payload?.error_description || payload?.error?.message || payload?.error;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    return payload.errors.map(item => firstText(item?.message, item?.detail, item)).filter(Boolean).join('; ');
  }
  return `eToro API request failed (${status})`;
}

async function request(pathname, credsInput, options = {}) {
  const creds = credentials(credsInput);
  const url = new URL(`${ETORO_API_ORIGIN}${pathname}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url.toString(), {
      method: options.method || 'GET',
      headers: {
        accept: 'application/json',
        'x-api-key': creds.apiKey,
        'x-user-key': creds.userKey,
        'x-request-id': crypto.randomUUID(),
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: options.signal || controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text || null; }
    if (!response.ok) {
      const upstream = extractUpstreamMessage(payload, response.status);
      const message = response.status === 401
        ? 'eToro rejected the API key or user key. Use a Read/Write key for the selected Real or Demo environment.'
        : response.status === 403
          ? `eToro denied this operation: ${upstream}`
          : response.status === 429
            ? 'eToro rate limit reached. Wait briefly and retry.'
            : upstream;
      throw apiError(message, response.status, payload, response.headers);
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw apiError('eToro request timed out', 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function symbolFromInstrument(raw = {}) {
  const source = firstText(
    raw.internalSymbolFull,
    raw.internal_symbol_full,
    raw.symbol,
    raw.ticker,
    raw.instrumentDisplaySymbol,
  ).toUpperCase();
  const compact = source
    .replace(/\s+/gu, '')
    .replace(/[_.:/-](USD|USDC|USDT)$/u, '')
    .replace(/(USD|USDC|USDT)$/u, '');
  if (compact && compact.length <= 18) return compact;
  const display = firstText(raw.displayname, raw.displayName, raw.name).toUpperCase().replace(/[^A-Z0-9]/gu, '');
  return display.slice(0, 18);
}

function instrumentId(raw = {}) {
  const value = firstNumber(raw.instrumentId, raw.instrumentID, raw.instrument_id, raw.id);
  return value != null && value >= 0 ? Math.trunc(value) : null;
}

function settlementType(config = {}) {
  return firstText(config.settlementType, config.settlement_type).toLowerCase();
}

function canonicalSettlementType(config = {}) {
  const normalized = settlementType(config);
  if (normalized === 'margintrade') return 'marginTrade';
  if (normalized === 'realfutures') return 'realFutures';
  return normalized;
}

function direction(config = {}) {
  const value = firstText(config.direction, config.side).toLowerCase();
  if (value === 'long' || value === 'buy') return 'long';
  if (value === 'short' || value === 'sell' || value === 'sellshort') return 'short';
  return '';
}

function leverageValues(config = {}) {
  const input = config.leverageValues || config.leverage_values || config.leverages || [];
  return [...new Set((Array.isArray(input) ? input : [input])
    .map(value => Math.trunc(Number(value)))
    .filter(value => Number.isFinite(value) && value >= 1))]
    .sort((a, b) => a - b);
}

function derivativeConfigs(eligibility = {}) {
  const configs = rows(
    eligibility.leverageConfigs || eligibility.leverage_configs || eligibility.configs || [],
  );
  return configs.filter(config => ['cfd', 'margintrade'].includes(settlementType(config)));
}

function normalizeMarket(raw = {}, eligibility = {}) {
  const id = instrumentId(raw) ?? instrumentId(eligibility);
  const symbol = symbolFromInstrument({ ...raw, ...eligibility });
  if (id == null || !symbol) return null;
  const configs = derivativeConfigs(eligibility);
  const openAllowed = eligibility.allowOpenPosition ?? eligibility.allow_open_position ?? true;
  if (!openAllowed || !configs.length) return null;
  const longConfigs = configs.filter(config => direction(config) === 'long');
  const shortConfigs = configs.filter(config => direction(config) === 'short');
  const allLeverages = [...new Set(configs.flatMap(leverageValues))].sort((a, b) => a - b);
  if (!allLeverages.length) allLeverages.push(1);
  const minAmounts = configs
    .map(config => firstNumber(config.minPositionAmount, config.min_position_amount))
    .filter(value => value != null && value > 0);
  const bid = firstNumber(raw.cvtBid, raw.bid, raw.currentBid);
  const ask = firstNumber(raw.cvtAsk, raw.ask, raw.currentAsk);
  const mark = bid != null && ask != null ? (bid + ask) / 2 : (bid ?? ask);
  const assetClass = firstText(raw.internalAssetClassName, raw.assetClass, raw.asset_class, raw.instrumentType);
  return {
    symbol,
    display_symbol: symbol,
    base: symbol,
    pair: `${symbol}/USD`,
    instrument_id: id,
    market_id: id,
    pair_index: id,
    name: firstText(raw.displayname, raw.displayName, raw.name, symbol),
    category: assetClass || 'eToro CFD',
    asset_class: assetClass || 'CFD',
    settlement_type: settlementType(configs[0]),
    settlement_types: [...new Set(configs.map(settlementType))],
    supports_long: longConfigs.length > 0,
    supports_short: shortConfigs.length > 0,
    leverage_values: allLeverages,
    min_leverage: allLeverages[0],
    max_leverage: allLeverages[allLeverages.length - 1],
    min_order_size: '0.00000001',
    lot_size: '0.00000001',
    tick_size: String(
      firstNumber(raw.tickSize)
      ?? (Number.isInteger(Number(raw.pricePrecision))
        ? 10 ** -Math.max(0, Number(raw.pricePrecision))
        : 0.00000001),
    ),
    min_notional_usd: minAmounts.length ? Math.min(...minAmounts) : 0,
    is_paused: raw.isCurrentlyTradable === false || raw.isExchangeOpen === false,
    status: raw.isCurrentlyTradable === false ? 'paused' : 'active',
    mark: mark != null ? String(mark) : null,
    bid: bid != null ? String(bid) : null,
    ask: ask != null ? String(ask) : null,
    eligibility: {
      allow_open: !!openAllowed,
      allow_close: eligibility.allowClosePosition ?? eligibility.allow_close_position ?? true,
      allow_partial_close: eligibility.allowPartialClosePosition ?? eligibility.allow_partial_close_position ?? true,
      allow_mit: eligibility.allowMitOrders ?? eligibility.allow_mit_orders ?? false,
      long: longConfigs,
      short: shortConfigs,
    },
    _raw: raw,
  };
}

async function searchInstruments(creds) {
  const fields = [
    'instrumentId',
    'displayname',
    'internalSymbolFull',
    'instrumentType',
    'internalAssetClassName',
    'isCurrentlyTradable',
    'isBuyEnabled',
    'isExchangeOpen',
    'cvtBid',
    'cvtAsk',
  ].join(',');
  let instruments = [];
  try {
    const filtered = await request('/api/v1/market-data/search', creds, {
      query: { fields, internalAssetClassName: 'Crypto', pageSize: 100, pageNumber: 1 },
    });
    instruments = rows(filtered, 'instruments').filter(raw => {
      const assetClass = firstText(raw.internalAssetClassName, raw.assetClass, raw.instrumentType).toLowerCase();
      return /crypto|digital/u.test(assetClass);
    });
  } catch (error) {
    // Some eToro accounts temporarily reject a projected search filter while
    // the unfiltered search remains available. The fallback below still
    // filters locally, so non-crypto instruments can never reach Clash.
    if (![400, 404, 422].includes(Number(error?.status))) throw error;
  }
  if (!instruments.length) {
    const fallback = await request('/api/v1/market-data/search', creds, {
      query: { fields, pageSize: 100, pageNumber: 1 },
    });
    instruments = rows(fallback, 'instruments').filter(raw => {
      const assetClass = firstText(raw.internalAssetClassName, raw.assetClass, raw.instrumentType).toLowerCase();
      return /crypto|digital/u.test(assetClass);
    });
  }
  const unique = new Map();
  for (const raw of instruments) {
    const id = instrumentId(raw);
    if (id != null) unique.set(id, raw);
  }
  return [...unique.values()];
}

async function getEligibility(creds, ids) {
  const uniqueIds = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!uniqueIds.length) return [];
  const output = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const chunk = uniqueIds.slice(offset, offset + 100);
    const payload = await request(`/api/v2/trading/info${environmentSegment(creds)}/eligibility`, creds, {
      method: 'POST',
      body: { instrumentIds: chunk, currency: 'USD' },
    });
    output.push(...rows(payload, 'eligibilities'));
  }
  return output;
}

async function getMarkets(credsInput, options = {}) {
  const creds = credentials(credsInput);
  const cacheKey = `${creds.environment}:${credentialFingerprint(creds)}`;
  const cached = marketCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.at < MARKET_CACHE_TTL_MS) return cached.rows;
  const instruments = await searchInstruments(creds);
  const eligibilityRows = await getEligibility(creds, instruments.map(instrumentId));
  const eligibilityById = new Map(eligibilityRows.map(row => [instrumentId(row), row]));
  const bySymbol = new Map();
  for (const raw of instruments) {
    const normalized = normalizeMarket(raw, eligibilityById.get(instrumentId(raw)) || {});
    if (!normalized) continue;
    const existing = bySymbol.get(normalized.symbol);
    if (!existing || (existing.is_paused && !normalized.is_paused)) bySymbol.set(normalized.symbol, normalized);
  }
  const normalized = [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (!normalized.length) {
    throw apiError('No eToro crypto CFD or margin-trade instruments are eligible for this account', 403);
  }
  marketCache.set(cacheKey, { at: Date.now(), rows: normalized });
  return normalized;
}

async function getRates(credsInput, marketsInput = null) {
  const creds = credentials(credsInput);
  const markets = marketsInput || await getMarkets(creds);
  const output = [];
  for (let offset = 0; offset < markets.length; offset += 100) {
    const chunk = markets.slice(offset, offset + 100);
    const payload = await request('/api/v1/market-data/instruments/rates', creds, {
      query: { instrumentIds: chunk.map(row => row.instrument_id).join(',') },
    });
    output.push(...rows(payload, 'rates'));
  }
  const marketById = new Map(markets.map(row => [Number(row.instrument_id), row]));
  return output.map(raw => {
    const id = instrumentId(raw);
    const market = marketById.get(id);
    if (!market) return null;
    const bid = firstNumber(raw.bid, raw.cvtBid);
    const ask = firstNumber(raw.ask, raw.cvtAsk);
    const last = firstNumber(raw.lastExecution, raw.last, raw.rate);
    const mark = bid != null && ask != null ? (bid + ask) / 2 : (last ?? bid ?? ask);
    return {
      symbol: market.symbol,
      instrument_id: id,
      bid: bid != null ? String(bid) : null,
      ask: ask != null ? String(ask) : null,
      mark: mark != null ? String(mark) : null,
      price: mark != null ? String(mark) : null,
      last_price: last != null ? String(last) : null,
      timestamp: firstText(raw.date, raw.timestamp) || null,
      _raw: raw,
    };
  }).filter(Boolean);
}

function portfolioPath(creds) {
  return `/api/v1/trading/info${accountEnvironmentSegment(creds)}/pnl`;
}

async function getPortfolio(credsInput) {
  const creds = credentials(credsInput);
  const payload = await request(portfolioPath(creds), creds);
  return payload?.clientPortfolio || payload?.portfolio || payload?.data || payload || {};
}

function normalizePosition(raw, marketById, rateById) {
  const id = instrumentId(raw);
  const market = marketById.get(id);
  if (!market) return null;
  const positionId = firstText(raw.positionID, raw.positionId, raw.position_id, raw.id);
  if (!positionId) return null;
  const isBuy = raw.isBuy === true || String(raw.direction || '').toLowerCase() === 'long';
  const units = Math.abs(numeric(raw.units, raw.amount));
  const entry = firstNumber(raw.openRate, raw.open_rate, raw.entryPrice);
  const rate = rateById.get(id);
  const mark = firstNumber(rate?.mark, isBuy ? rate?.bid : rate?.ask, raw.currentRate, entry);
  const leverage = Math.max(1, numeric(raw.leverage, 1));
  // `amount` is the current USD allocation; `initialAmountInDollars` does not
  // shrink after a partial close and would overstate both margin and rewards.
  const margin = Math.abs(firstNumber(raw.amount, raw.investment, raw.initialAmountInDollars, 0));
  const pnl = firstNumber(
    raw.pnL,
    raw.pnl,
    raw.netProfit,
    raw.profit,
    raw.unrealizedProfit,
    raw.unrealizedPnL?.pnL,
    raw.unrealizedPnL?.pnl,
    0,
  );
  return {
    symbol: market.symbol,
    side: isBuy ? 'bid' : 'ask',
    amount: String(units),
    size: String(units),
    margin: String(margin),
    leverage,
    entry_price: entry != null ? String(entry) : null,
    mark_price: mark != null ? String(mark) : null,
    unrealized_pnl: pnl != null ? String(pnl) : '0',
    pnl: pnl != null ? String(pnl) : '0',
    take_profit_price: firstNumber(raw.takeProfitRate, raw.take_profit_rate),
    stop_loss_price: firstNumber(raw.stopLossRate, raw.stop_loss_rate),
    liquidation_price: firstNumber(raw.liquidationRate, raw.liquidation_rate),
    pair_index: id,
    market_id: id,
    instrument_id: id,
    trade_index: positionId,
    position_id: positionId,
    order_id: firstText(raw.orderID, raw.orderId) || null,
    opened_at: firstText(raw.openDateTime, raw.openTimestamp, raw.createdAt) || null,
    settlement_type_id: firstNumber(raw.settlementTypeID, raw.settlementTypeId),
    _raw: raw,
  };
}

function normalizeOrder(raw, marketById) {
  const id = instrumentId(raw);
  const market = marketById.get(id);
  if (!market) return null;
  const orderId = firstText(raw.orderID, raw.orderId, raw.order_id, raw.id);
  if (!orderId) return null;
  const isBuy = raw.isBuy === true || /buy|long/iu.test(firstText(raw.transaction, raw.direction, raw.side));
  const amount = Math.abs(firstNumber(raw.units, raw.amount, raw.orderAmount, raw.investment, 0));
  return {
    symbol: market.symbol,
    side: isBuy ? 'bid' : 'ask',
    amount: String(amount),
    size: String(amount),
    price: String(firstNumber(raw.triggerRate, raw.orderRate, raw.rate, 0)),
    trigger_price: firstNumber(raw.triggerRate, raw.orderRate),
    leverage: Math.max(1, numeric(raw.leverage, 1)),
    order_type: firstText(raw.orderType, raw.type, 'limit').toLowerCase(),
    status: firstText(raw.status, 'open').toLowerCase(),
    reduce_only: raw.action === 'close' || raw.reduceOnly === true,
    order_id: orderId,
    id: orderId,
    pair_index: id,
    market_id: id,
    instrument_id: id,
    created_at: firstText(raw.createDateTime, raw.createdAt, raw.timestamp) || null,
    _raw: raw,
  };
}

function collectPortfolioOrders(portfolio) {
  const combined = [
    ...rows(portfolio?.orders),
    ...rows(portfolio?.ordersForOpen),
    ...rows(portfolio?.ordersForClose),
  ];
  const unique = new Map();
  for (const order of combined) {
    const key = firstText(order?.orderID, order?.orderId, order?.id);
    if (key) unique.set(key, order);
  }
  return [...unique.values()];
}

function manualOpenOrders(portfolio) {
  return rows(portfolio?.ordersForOpen).filter(order => numeric(order?.mirrorID, order?.mirrorId) === 0);
}

function calculateAvailableCash(portfolio) {
  const credit = numeric(portfolio?.credit);
  const pendingOpen = manualOpenOrders(portfolio)
    .reduce((sum, order) => sum + Math.abs(numeric(order?.amount)), 0);
  const pendingMit = rows(portfolio?.orders)
    .reduce((sum, order) => sum + Math.abs(numeric(order?.amount)), 0);
  return credit - pendingOpen - pendingMit;
}

function calculateTotalInvested(portfolio) {
  const directPositions = rows(portfolio?.positions)
    .reduce((sum, position) => sum + Math.abs(numeric(position?.amount)), 0);
  const mirrors = rows(portfolio?.mirrors).reduce((sum, mirror) => {
    const positions = rows(mirror?.positions)
      .reduce((positionSum, position) => positionSum + Math.abs(numeric(position?.amount)), 0);
    return sum + positions + numeric(mirror?.availableAmount) - numeric(mirror?.closedPositionsNetProfit);
  }, 0);
  const openOrders = manualOpenOrders(portfolio).reduce(
    (sum, order) => sum + Math.abs(numeric(order?.amount)) + Math.abs(numeric(order?.totalExternalCosts)),
    0,
  );
  const mitOrders = rows(portfolio?.orders)
    .reduce((sum, order) => sum + Math.abs(numeric(order?.amount)), 0);
  return directPositions + mirrors + openOrders + mitOrders;
}

function calculateUnrealizedPnl(portfolio) {
  const direct = firstNumber(portfolio?.unrealizedPnL, portfolio?.unrealizedPnl);
  if (direct != null) return direct;
  const positions = rows(portfolio?.positions).reduce((sum, position) => sum + numeric(
    firstNumber(position?.pnL, position?.pnl, position?.unrealizedPnL?.pnL, position?.unrealizedPnL?.pnl),
  ), 0);
  const mirrors = rows(portfolio?.mirrors).reduce((sum, mirror) => sum
    + rows(mirror?.positions).reduce((positionSum, position) => positionSum + numeric(
      firstNumber(position?.pnL, position?.pnl, position?.unrealizedPnL?.pnL, position?.unrealizedPnL?.pnl),
    ), 0)
    + numeric(mirror?.closedPositionsNetProfit), 0);
  return positions + mirrors;
}

async function getAccountSnapshot(credsInput, options = {}) {
  const creds = credentials(credsInput);
  const markets = await getMarkets(creds, options);
  const [portfolio, prices] = await Promise.all([getPortfolio(creds), getRates(creds, markets)]);
  const marketById = new Map(markets.map(row => [Number(row.instrument_id), row]));
  const rateById = new Map(prices.map(row => [Number(row.instrument_id), row]));
  const positions = rows(portfolio.positions).map(row => normalizePosition(row, marketById, rateById)).filter(Boolean);
  const orders = collectPortfolioOrders(portfolio).map(row => normalizeOrder(row, marketById)).filter(Boolean);
  const calculatedCash = calculateAvailableCash(portfolio);
  const cash = firstNumber(
    portfolio.availableCash,
    portfolio.availableToTrade,
    portfolio.availableBalance,
    calculatedCash,
  );
  const directEquity = firstNumber(portfolio.equity, portfolio.totalEquity, portfolio.netWorth);
  const equity = directEquity ?? (numeric(cash) + calculateTotalInvested(portfolio) + calculateUnrealizedPnl(portfolio));
  const upstreamAccountId = firstText(portfolio.cid, portfolio.CID, portfolio.accountId, portfolio.accountID, portfolio.customerId);
  const fingerprint = credentialFingerprint(creds);
  return {
    account: {
      account_id: upstreamAccountId || `etoro_${fingerprint}`,
      account_fingerprint: fingerprint,
      environment: creds.environment,
      balance: numeric(cash),
      usdc: numeric(cash),
      available_to_spend: numeric(cash),
      available_to_withdraw: numeric(cash),
      account_equity: numeric(equity),
      equity: numeric(equity),
      total_margin_used: positions.reduce((sum, row) => sum + numeric(row.margin), 0),
      currency: firstText(portfolio.currency, 'USD'),
    },
    positions,
    orders,
    markets,
    prices,
    environment: creds.environment,
  };
}

function marketFor(markets, symbolOrId) {
  const query = String(symbolOrId ?? '').trim().toUpperCase();
  return markets.find(row => row.symbol === query || String(row.instrument_id) === query) || null;
}

function chooseConfig(market, side, leverage) {
  const wantedDirection = side === 'bid' || side === 'buy' || side === 'long' ? 'long' : 'short';
  const configs = rows(market?.eligibility?.[wantedDirection]);
  const requestedLeverage = Math.max(1, Math.trunc(Number(leverage) || 1));
  const matching = configs.find(config => leverageValues(config).includes(requestedLeverage));
  if (!matching) {
    const allowed = [...new Set(configs.flatMap(leverageValues))].sort((a, b) => a - b);
    if (!configs.length) throw apiError(`eToro does not allow ${wantedDirection} positions on ${market.symbol}`, 400);
    throw apiError(`eToro ${market.symbol} ${wantedDirection} leverage must be one of: ${allowed.map(value => `${value}x`).join(', ')}`, 400);
  }
  return { config: matching, direction: wantedDirection, leverage: requestedLeverage };
}

async function placeOrder(credsInput, input = {}) {
  const creds = credentials(credsInput);
  const markets = await getMarkets(creds);
  const market = marketFor(markets, input.symbol ?? input.instrumentId);
  if (!market) throw apiError(`Unknown or ineligible eToro market: ${input.symbol || input.instrumentId}`, 400);
  if (market.is_paused) throw apiError(`${market.symbol} is not currently tradable on eToro`, 409);
  const selected = chooseConfig(market, String(input.side || '').toLowerCase(), input.leverage);
  const amount = Number(input.amount ?? input.margin ?? input.investment);
  if (!(amount > 0)) throw apiError('eToro order amount must be a positive USD margin amount', 400);
  const minimum = firstNumber(selected.config.minPositionAmount, selected.config.min_position_amount, market.min_notional_usd, 0);
  if (minimum > 0 && amount < minimum) throw apiError(`eToro minimum ${market.symbol} investment is $${minimum}`, 400);
  const orderTypeInput = firstText(input.orderType, input.order_type, input.type, 'market').toLowerCase();
  const isMarket = orderTypeInput === 'market' || orderTypeInput === 'mkt';
  const triggerRate = firstNumber(input.price, input.triggerRate, input.trigger_rate);
  if (!isMarket && !(triggerRate > 0)) throw apiError('eToro limit/MIT order requires a positive trigger price', 400);
  if (!isMarket && market.eligibility?.allow_mit === false) {
    throw apiError(`eToro does not allow MIT orders on ${market.symbol} for this account`, 400);
  }
  const stopLossRate = firstNumber(input.stopLoss, input.stop_loss, input.sl, input.stopLossRate);
  const takeProfitRate = firstNumber(input.takeProfit, input.take_profit, input.tp, input.takeProfitRate);
  if ((selected.leverage > 1 || selected.direction === 'short') && !(stopLossRate > 0)) {
    throw apiError(`eToro requires a stop-loss price for ${selected.direction === 'short' ? 'short' : 'leveraged'} positions. Enable TP/SL and enter Stop Loss.`, 400);
  }
  const payload = {
    action: 'open',
    transaction: selected.direction === 'long' ? 'buy' : 'sellShort',
    instrumentId: market.instrument_id,
    settlementType: canonicalSettlementType(selected.config),
    orderType: isMarket ? 'mkt' : 'mit',
    leverage: selected.leverage,
    amount,
    orderCurrency: 'usd',
    ...(isMarket ? {} : { triggerRate }),
    ...(stopLossRate > 0 ? { stopLossRate, stopLossType: 'fixed' } : {}),
    ...(takeProfitRate > 0 ? { takeProfitRate } : {}),
  };
  const result = await request(`/api/v2/trading/execution${environmentSegment(creds)}/orders`, creds, {
    method: 'POST',
    body: payload,
  });
  const orderId = firstText(result?.orderId, result?.orderID) || null;
  const referenceId = firstText(result?.referenceId, result?.referenceID) || null;
  const execution = isMarket
    ? await waitForOrderResult(creds, orderId ? { orderId } : { referenceId })
    : null;
  return {
    success: true,
    status: [3, 5].includes(Number(execution?.status?.id)) ? 'filled' : 'submitted',
    order_id: orderId,
    reference_id: referenceId,
    token: firstText(result?.token) || null,
    order_status: execution?.status || null,
    position_ids: rows(execution?.positionExecutions)
      .map(row => firstText(row?.positionId, row?.positionID))
      .filter(Boolean),
    symbol: market.symbol,
    pair_index: market.instrument_id,
    leverage: selected.leverage,
    settlement_type: payload.settlementType,
    environment: creds.environment,
  };
}

async function getOrderInfo(credsInput, input = {}) {
  const creds = credentials(credsInput);
  const orderId = firstText(input.orderId, input.order_id);
  const referenceId = firstText(input.referenceId, input.reference_id);
  if ((!orderId && !referenceId) || (orderId && referenceId)) {
    throw apiError('Provide exactly one eToro order id or reference id', 400);
  }
  return request(`/api/v2/trading/info${environmentSegment(creds)}/orders:lookup`, creds, {
    query: orderId ? { orderId } : { referenceId },
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForOrderResult(creds, lookup, options = {}) {
  const delays = Array.isArray(options.delays) ? options.delays : [0, 350, 700, 1_200];
  let latest = null;
  for (const delayMs of delays) {
    if (delayMs > 0) await wait(delayMs);
    try {
      latest = await getOrderInfo(creds, lookup);
    } catch (error) {
      // The async execution record can briefly lag the accepted order response.
      if (Number(error?.status) === 404) continue;
      throw error;
    }
    const statusId = Number(latest?.status?.id);
    if ([3, 5].includes(statusId)) return latest;
    if ([4, 10].includes(statusId)) {
      const reason = firstText(
        latest?.status?.errorMessage,
        latest?.status?.name,
        latest?.status?.errorCode && `code ${latest.status.errorCode}`,
      );
      throw apiError(`eToro rejected the order${reason ? `: ${reason}` : ''}`, 409, latest);
    }
  }
  return latest;
}

async function cancelOrder(credsInput, orderId) {
  const creds = credentials(credsInput);
  const id = firstText(orderId);
  if (!id) throw apiError('eToro order id is required', 400);
  const result = await request(`/api/v2/trading/execution${environmentSegment(creds)}/orders/${encodeURIComponent(id)}`, creds, {
    method: 'DELETE',
  });
  return { success: true, order_id: id, result };
}

async function closePosition(credsInput, positionId, input = {}) {
  const creds = credentials(credsInput);
  const id = firstText(positionId);
  if (!id) throw apiError('eToro position id is required', 400);
  const fullClose = input.fullClose === true || input.full_close === true;
  const units = firstNumber(input.units, input.amount);
  if (!fullClose && !(units > 0)) throw apiError('eToro partial close requires positive units', 400);
  const result = await request(
    `/api/v1/trading/execution${environmentSegment(creds)}/market-close-orders/positions/${encodeURIComponent(id)}`,
    creds,
    { method: 'POST', body: { UnitsToDeduct: fullClose ? null : units } },
  );
  return { success: true, status: 'submitted', position_id: id, result };
}

async function updatePosition(credsInput, positionId, input = {}) {
  const creds = credentials(credsInput);
  const id = firstText(positionId);
  if (!id) throw apiError('eToro position id is required', 400);
  const stopLossRate = firstNumber(input.stopLossRate, input.stop_loss, input.stopLoss, input.sl);
  const takeProfitRate = firstNumber(input.takeProfitRate, input.take_profit, input.takeProfit, input.tp);
  const clearStopLoss = input.clearStopLoss === true || input.clear_stop_loss === true || input.stop_loss === '';
  const clearTakeProfit = input.clearTakeProfit === true || input.clear_take_profit === true || input.take_profit === '';
  if (!(stopLossRate > 0) && !(takeProfitRate > 0) && !clearStopLoss && !clearTakeProfit) {
    throw apiError('Provide a take-profit, stop-loss, or explicit clear flag', 400);
  }
  const result = await request(`/api/v2/trading${environmentSegment(creds)}/positions/${encodeURIComponent(id)}`, creds, {
    method: 'PATCH',
    body: {
      ...(stopLossRate > 0 ? { stopLossRate, stopLossType: 'fixed' } : {}),
      ...(takeProfitRate > 0 ? { takeProfitRate } : {}),
      ...(clearStopLoss ? { clearStopLoss: true } : {}),
      ...(clearTakeProfit ? { clearTakeProfit: true } : {}),
    },
  });
  return { success: true, position_id: id, result };
}

function candleInterval(value) {
  const normalized = String(value || '5m').toLowerCase();
  return ({
    '1': 'OneMinute', '1m': 'OneMinute',
    '5': 'FiveMinutes', '5m': 'FiveMinutes',
    '15': 'FifteenMinutes', '15m': 'FifteenMinutes',
    '30': 'ThirtyMinutes', '30m': 'ThirtyMinutes',
    '60': 'OneHour', '1h': 'OneHour',
    '240': 'FourHours', '4h': 'FourHours',
    '1d': 'OneDay', '1440': 'OneDay',
    '1w': 'OneWeek',
  })[normalized] || 'FiveMinutes';
}

async function getCandles(credsInput, symbol, options = {}) {
  const creds = credentials(credsInput);
  const markets = await getMarkets(creds);
  const market = marketFor(markets, symbol);
  if (!market) throw apiError(`Unknown eToro market: ${symbol}`, 400);
  const count = Math.max(2, Math.min(1000, Number(options.limit || options.count || 500)));
  const interval = candleInterval(options.interval || options.resolution);
  const payload = await request(
    `/api/v1/market-data/instruments/${market.instrument_id}/history/candles/desc/${interval}/${count}`,
    creds,
  );
  const groups = rows(payload, 'candles');
  const source = groups.length === 1 && Array.isArray(groups[0]?.candles) ? groups[0].candles : groups;
  return source.map(raw => {
    const time = new Date(firstText(raw.fromDate, raw.date, raw.timestamp)).getTime();
    return {
      time: Number.isFinite(time) ? Math.floor(time / 1000) : numeric(raw.timestamp),
      open: numeric(raw.open),
      high: numeric(raw.high),
      low: numeric(raw.low),
      close: numeric(raw.close),
      volume: numeric(raw.volume),
    };
  }).filter(row => row.time > 0 && row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0)
    .sort((a, b) => a.time - b.time);
}

function historyPath(creds) {
  return `/api/v1/trading/info/trade${environmentSegment(creds)}/history`;
}

async function getTradeHistory(credsInput, options = {}) {
  const creds = credentials(credsInput);
  const markets = await getMarkets(creds);
  const marketById = new Map(markets.map(row => [Number(row.instrument_id), row]));
  const minDate = options.minDate || new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const payload = await request(historyPath(creds), creds, {
    query: {
      minDate,
      page: Math.max(1, Number(options.page || 1)),
      pageSize: Math.max(1, Math.min(250, Number(options.limit || options.pageSize || 100))),
    },
  });
  return rows(payload, 'trades', 'closedTrades', 'positions').map(raw => {
    const id = instrumentId(raw);
    const market = marketById.get(id);
    if (!market) return null;
    const positionId = firstText(raw.positionId, raw.positionID, raw.position_id, raw.id);
    if (!positionId) return null;
    const isBuy = raw.isBuy === true || String(raw.direction || '').toLowerCase() === 'long';
    const leverage = Math.max(1, numeric(raw.leverage, 1));
    const units = Math.abs(firstNumber(raw.units, raw.amount, 0));
    const openRate = firstNumber(raw.openRate, raw.open_rate, 0);
    const investment = Math.abs(firstNumber(raw.initialInvestment, raw.investment, raw.initialAmountInDollars, 0));
    const notional = investment > 0 ? investment * leverage : units * numeric(openRate);
    return {
      id: positionId,
      position_id: positionId,
      order_id: firstText(raw.orderId, raw.orderID) || null,
      symbol: market.symbol,
      side: isBuy ? 'open_long' : 'open_short',
      action: isBuy ? 'open_long' : 'open_short',
      amount: String(units),
      price: String(firstNumber(raw.closeRate, raw.close_rate, openRate, 0)),
      entry_price: String(openRate),
      leverage,
      notional_usd: notional,
      pnl: firstNumber(raw.netProfit, raw.profit, 0),
      fee: firstNumber(raw.fees, raw.totalFees, 0),
      created_at: firstText(raw.closeTimestamp, raw.closeDateTime, raw.openTimestamp, raw.openDateTime) || null,
      opened_at: firstText(raw.openTimestamp, raw.openDateTime) || null,
      environment: creds.environment,
      _raw: raw,
    };
  }).filter(Boolean);
}

function ledgerTradeFromPosition(position, environment) {
  const margin = Math.abs(numeric(position.margin));
  const leverage = Math.max(1, numeric(position.leverage, 1));
  const entry = numeric(position.entry_price);
  const amount = Math.abs(numeric(position.amount));
  return {
    symbol: position.symbol,
    side: position.side === 'bid' ? 'open_long' : 'open_short',
    orderType: 'market',
    amount: String(amount),
    price: String(entry),
    orderId: position.order_id || position.position_id,
    clientOrderId: `etoro:${environment}:position:${position.position_id}`,
    status: 'filled',
    dex: 'etoro',
    notional_usd: margin > 0 ? margin * leverage : amount * entry,
    verifiedSource: 'etoro_api',
    pnl: position.unrealized_pnl,
    fee: firstNumber(position?._raw?.totalFees, position?._raw?.totalExternalFees, 0),
    proofJson: JSON.stringify({ source: 'etoro_portfolio', environment, position: position._raw }),
    createdAt: position.opened_at,
  };
}

function ledgerTradeFromHistory(trade, environment) {
  return {
    symbol: trade.symbol,
    side: trade.side,
    orderType: 'market',
    amount: String(trade.amount),
    price: String(trade.price),
    orderId: trade.order_id || trade.position_id,
    clientOrderId: `etoro:${environment}:position:${trade.position_id}`,
    status: 'filled',
    dex: 'etoro',
    notional_usd: numeric(trade.notional_usd),
    verifiedSource: 'etoro_api',
    pnl: trade.pnl,
    fee: trade.fee,
    proofJson: JSON.stringify({ source: 'etoro_trade_history', environment, trade: trade._raw }),
    createdAt: trade.opened_at || trade.created_at,
  };
}

async function importTradesForPlayer(playerId, credsInput, options = {}) {
  const creds = credentials(credsInput);
  const db = require('./db');
  const [snapshotResult, historyResult] = await Promise.allSettled([
    getAccountSnapshot(creds),
    getTradeHistory(creds, { limit: options.limit || 100, minDate: options.minDate }),
  ]);
  if (snapshotResult.status === 'rejected' && historyResult.status === 'rejected') throw snapshotResult.reason;
  const openRows = snapshotResult.status === 'fulfilled'
    ? snapshotResult.value.positions.map(position => ledgerTradeFromPosition(position, creds.environment))
    : [];
  const historyRows = historyResult.status === 'fulfilled'
    ? historyResult.value.map(trade => ledgerTradeFromHistory(trade, creds.environment))
    : [];
  const byKey = new Map(openRows.map(trade => [trade.clientOrderId, trade]));
  for (const trade of historyRows) byKey.set(trade.clientOrderId, trade);
  let imported = 0;
  let updated = 0;
  let unchanged = 0;
  for (const trade of byKey.values()) {
    const result = db.upsertVerifiedTrade(playerId, trade);
    imported += Number(result.inserted || 0);
    updated += Number(result.updated || 0);
    if (!result.changes) unchanged += 1;
  }
  return {
    ok: true,
    environment: creds.environment,
    imported,
    updated,
    unchanged,
    total: byKey.size,
    portfolio_error: snapshotResult.status === 'rejected' ? snapshotResult.reason?.message : null,
    history_error: historyResult.status === 'rejected' ? historyResult.reason?.message : null,
  };
}

function configStatus() {
  return {
    ok: true,
    dex: 'etoro',
    api_origin: ETORO_API_ORIGIN,
    builders_url: ETORO_BUILDERS_URL,
    app_url: ETORO_APP_URL,
    authentication: 'browser_api_keys',
    browser_storage_only: true,
    environments: ['demo', 'real'],
    oauth_configured: !!(process.env.ETORO_OAUTH_CLIENT_ID && process.env.ETORO_OAUTH_CLIENT_SECRET),
    referral_configured: false,
    attribution_note: 'eToro App Store attribution requires an approved Clash OAuth application.',
    product_type: 'leveraged_cfd_margin',
  };
}

function setFetchImplForTests(next) {
  fetchImpl = typeof next === 'function' ? next : (...args) => fetch(...args);
  marketCache.clear();
}

module.exports = {
  ETORO_API_ORIGIN,
  ETORO_APP_URL,
  ETORO_BUILDERS_URL,
  cancelOrder,
  closePosition,
  configStatus,
  credentialFingerprint,
  credentialStatus,
  credentials,
  getAccountSnapshot,
  getCandles,
  getEligibility,
  getMarkets,
  getOrderInfo,
  getPortfolio,
  getRates,
  getTradeHistory,
  importTradesForPlayer,
  normalizeMarket,
  placeOrder,
  request,
  setFetchImplForTests,
  updatePosition,
  waitForOrderResult,
};
