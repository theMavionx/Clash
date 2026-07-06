const crypto = require('crypto');
const WebSocket = require('ws');

const DEPLOYMENTS = Object.freeze({
  mainnet: {
    chainId: 'dango-1',
    graphqlUrl: 'https://api-mainnet.dango.zone/graphql',
    wsUrl: 'wss://api-mainnet.dango.zone/graphql',
    perpsContract: '0x90bc84df68d1aa59a857e04ed529e9a26edbea4f',
  },
  testnet: {
    chainId: 'dango-testnet-1',
    graphqlUrl: 'https://api-testnet.dango.zone/graphql',
    wsUrl: 'wss://api-testnet.dango.zone/graphql',
    perpsContract: '0xf6344c5e2792e8f9202c58a2d88fbbde4cd3142f',
  },
});

function asWebSocketUrl(value) {
  return String(value || '')
    .replace(/^http:/i, 'ws:')
    .replace(/^https:/i, 'wss:')
    .replace(/\/+$/, '');
}

const NETWORK = String(process.env.DANGO_NETWORK || process.env.VITE_DANGO_NETWORK || 'mainnet').toLowerCase() === 'testnet'
  ? 'testnet'
  : 'mainnet';
const DEPLOYMENT = DEPLOYMENTS[NETWORK];
const GRAPHQL_URL = String(process.env.DANGO_GRAPHQL_URL || process.env.VITE_DANGO_GRAPHQL_URL || DEPLOYMENT.graphqlUrl).replace(/\/+$/, '');
const GRAPHQL_WS_URL = asWebSocketUrl(process.env.DANGO_GRAPHQL_WS_URL || process.env.DANGO_WS_URL || process.env.VITE_DANGO_WS_URL || DEPLOYMENT.wsUrl);
const REST_BASE = String(process.env.DANGO_REST_URL || process.env.VITE_DANGO_REST_URL || GRAPHQL_URL.replace(/\/graphql$/i, '')).replace(/\/+$/, '');
const NATIVE_WS_URL = asWebSocketUrl(
  process.env.DANGO_NATIVE_WS_URL
  || process.env.DANGO_PERPS_WS_URL
  || GRAPHQL_WS_URL.replace(/\/graphql$/i, '/ws')
);
const CHAIN_ID = String(process.env.DANGO_CHAIN_ID || process.env.VITE_DANGO_CHAIN_ID || DEPLOYMENT.chainId);
const PERPS_CONTRACT = String(process.env.DANGO_PERPS_CONTRACT || process.env.VITE_DANGO_PERPS_CONTRACT || DEPLOYMENT.perpsContract).toLowerCase();
const REQUEST_TIMEOUT_MS = Math.max(1000, Math.min(20_000, Number(process.env.DANGO_HTTP_TIMEOUT_MS || 7000)));
const MARKET_CACHE_MS = Math.max(1000, Math.min(10 * 60_000, Number(process.env.DANGO_MARKET_CACHE_MS || 15_000)));
const EVENT_BACKFILL_LIMIT = Math.max(1, Math.min(500, Number(process.env.DANGO_EVENT_BACKFILL_LIMIT || 100)));
const EVENT_BACKFILL_MAX_PAGES = Math.max(1, Math.min(25, Number(process.env.DANGO_EVENT_BACKFILL_MAX_PAGES || 10)));
const DEFAULT_QUANTITY_STEP = '0.000001';

let marketCache = null;
let marketCacheAt = 0;
let priceCache = null;
let priceCacheAt = 0;
const accountResolveCache = new Map();
const ACCOUNT_RESOLVE_CACHE_MS = 60_000;
let nextWsSubscriptionId = 1;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout(promise, ms, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label || 'Dango request'} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchJson(url, options = {}) {
  const res = await withTimeout(fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  }), Number(options.timeoutMs || REQUEST_TIMEOUT_MS), url);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  if (!res.ok) {
    const detail = typeof data === 'string' ? data : (data?.error || data?.message || JSON.stringify(data || {}));
    const err = new Error(`Dango HTTP ${res.status}: ${detail || res.statusText}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function graphqlRequest(query, variables = undefined) {
  const payload = variables === undefined ? { query } : { query, variables };
  const data = await fetchJson(GRAPHQL_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (Array.isArray(data?.errors) && data.errors.length) {
    const err = new Error(data.errors.map(e => e?.message || String(e)).join('; '));
    err.data = data;
    throw err;
  }
  return data?.data;
}

async function restPost(path, body) {
  const suffix = String(path || '').replace(/^\/+/, '');
  return fetchJson(`${REST_BASE}/${suffix}`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

async function queryApp(msg, { contract = PERPS_CONTRACT, height = null } = {}) {
  if (height != null) throw new Error('Dango REST /query does not support historical height');
  const request = { wasm_smart: { contract, msg } };
  const data = await restPost('query', request);
  return data?.wasm_smart ?? data;
}

let appConfigCache = null;
let appConfigCacheAt = 0;
const APP_CONFIG_CACHE_MS = 60_000;

async function queryIndexer(document, variables = undefined) {
  const data = await graphqlRequest(document, variables);
  return data || {};
}

async function queryAppIndexer(request, { height = null } = {}) {
  const data = await queryIndexer(
    `query DangoQueryApp($request: GrugQueryInput!, $height: Int) {
      queryApp(request: $request, height: $height)
    }`,
    { request, ...(height ? { height: Math.floor(Number(height)) } : {}) },
  );
  return data?.queryApp || {};
}

async function fetchAppConfig({ force = false } = {}) {
  if (!force && appConfigCache && Date.now() - appConfigCacheAt < APP_CONFIG_CACHE_MS) return appConfigCache;
  const data = await queryAppIndexer({ app_config: {} });
  const config = data?.app_config || data?.appConfig || null;
  if (!config?.addresses?.account_factory || !config?.addresses?.perps) {
    throw new Error('Dango app config missing account_factory/perps addresses');
  }
  appConfigCache = config;
  appConfigCacheAt = Date.now();
  return config;
}

async function fetchAccountInfo(address) {
  const account = normalizeDangoAddress(address);
  if (!account) throw new Error('Dango account address required');
  const config = await fetchAppConfig();
  const info = await queryApp({ account: { address: account } }, { contract: config.addresses.account_factory }).catch((e) => {
    if (/data not found|not found|no such/i.test(e?.message || '')) return null;
    throw e;
  });
  if (!info || typeof info !== 'object') {
    const err = new Error('Dango account not found. Create or fund this Dango account in the Dango app first.');
    err.status = 404;
    throw err;
  }
  return {
    address: account,
    index: Number(info.index ?? info.account_index ?? info.accountIndex ?? 0),
    owner: Number(info.owner ?? info.user_index ?? info.userIndex ?? 0),
    raw: info,
  };
}

async function fetchAccountSeenNonces(address) {
  const account = normalizeDangoAddress(address);
  if (!account) throw new Error('Dango account address required');
  const nonces = await queryApp({ seen_nonces: {} }, { contract: account }).catch((e) => {
    if (/data not found|not found|no such/i.test(e?.message || '')) return [];
    throw e;
  });
  return Array.isArray(nonces) ? nonces.map(Number).filter(Number.isFinite) : [];
}

function nextNonce(nonces = []) {
  if (!Array.isArray(nonces) || !nonces.length) return 0;
  return Math.max(...nonces.map(Number).filter(Number.isFinite), -1) + 1;
}

function normalizeDangoAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{1,64}$/u.test(raw)) return '';
  return raw;
}

function isDangoAddress(value) {
  return Boolean(normalizeDangoAddress(value));
}

function ethereumKeyHash(address) {
  const addr = normalizeDangoAddress(address);
  if (!addr) return '';
  return crypto.createHash('sha256').update(addr.toLowerCase()).digest('hex').toUpperCase();
}

function num(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') {
    if (value.value !== undefined) return num(value.value, fallback);
    if (value.amount !== undefined) return num(value.amount, fallback);
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstValue(row, keys, fallback = '') {
  for (const key of keys) {
    const v = row?.[key];
    if (v === undefined || v === null || v === '') continue;
    return v;
  }
  return fallback;
}

function symbolFromPairId(pairId) {
  const raw = String(pairId || '').trim().toLowerCase();
  const base = raw
    .replace(/^perp\//, '')
    .replace(/[-_/]?(usd|usdc)$/i, '')
    .toUpperCase();
  return base || String(pairId || '').toUpperCase();
}

function pairIdFromSymbol(symbol) {
  const raw = String(symbol || '').trim();
  if (!raw) return '';
  if (/^perp\//i.test(raw)) return raw.toLowerCase();
  return `perp/${raw.toLowerCase().replace(/[-/](perp|usd|usdc)$/i, '').replace(/(usd|usdc)$/i, '')}usd`;
}

function dangoDisplaySymbol(pairId) {
  return symbolFromPairId(pairId);
}

async function resolveAccountAddress(address) {
  const input = normalizeDangoAddress(address);
  if (!input) return '';
  const cached = accountResolveCache.get(input);
  if (cached && Date.now() - cached.at < ACCOUNT_RESOLVE_CACHE_MS) return cached.account;
  let account = input;
  try {
    const accountData = await graphqlRequest(`query DangoAccountByAddress($address: String!) {
      accounts(address: $address, first: 1) {
        nodes { address accountIndex }
      }
    }`, { address: input });
    const directAccount = normalizeDangoAddress(accountData?.accounts?.nodes?.[0]?.address);
    if (directAccount === input) {
      accountResolveCache.set(input, { account: input, at: Date.now() });
      return input;
    }
    const hash = ethereumKeyHash(input);
    if (hash) {
      const data = await graphqlRequest(`query DangoUsersByEthereumKey($hash: String!) {
        users(publicKeyHash: $hash, first: 1) {
          nodes {
            accounts { accountIndex address }
          }
        }
      }`, { hash });
      const accounts = Array.isArray(data?.users?.nodes?.[0]?.accounts)
        ? data.users.nodes[0].accounts
        : [];
      const sorted = accounts
        .map(row => ({ ...row, address: normalizeDangoAddress(row?.address), accountIndex: Number(row?.accountIndex) }))
        .filter(row => row.address)
        .sort((a, b) => (Number.isFinite(a.accountIndex) ? a.accountIndex : 999999) - (Number.isFinite(b.accountIndex) ? b.accountIndex : 999999));
      if (sorted[0]?.address) account = sorted[0].address;
    }
  } catch (e) {
    console.warn('[dango] account resolver failed:', e.message);
  }
  accountResolveCache.set(input, { account, at: Date.now() });
  return account;
}

function executeMessage(msg, funds = {}) {
  if (!msg || typeof msg !== 'object') throw new Error('Dango contract message object required');
  return {
    execute: {
      contract: PERPS_CONTRACT,
      msg,
      funds: funds && typeof funds === 'object' ? funds : {},
    },
  };
}

function pythSymbolForPair(pairId) {
  const sym = symbolFromPairId(pairId);
  if (!sym) return '';
  return `${sym}USD`;
}

async function fetchStatus() {
  const data = await graphqlRequest(`query DangoStatus {
    queryStatus { chainId block { blockHeight timestamp } }
  }`);
  return data?.queryStatus || null;
}

async function fetchPairParams() {
  const rows = await queryApp({ pair_params: { start_after: null, limit: 500 } });
  return rows && typeof rows === 'object' ? rows : {};
}

async function fetchPairStats() {
  const data = await graphqlRequest(`query DangoAllPerpsPairStats {
    allPerpsPairStats {
      pairId
      currentPrice
      volume24H
      priceChange24H
    }
  }`);
  return Array.isArray(data?.allPerpsPairStats) ? data.allPerpsPairStats : [];
}

function normalizeMarket(pairId, params = {}, stats = {}) {
  const symbol = symbolFromPairId(pairId);
  const price = num(stats.currentPrice ?? stats.current_price ?? stats.price);
  const initialMarginRatio = num(params.initial_margin_ratio, 0);
  const maxLeverage = initialMarginRatio > 0 ? Math.floor((1 / initialMarginRatio) * 100) / 100 : 50;
  const minOrderUsd = num(params.min_order_size, 0);
  return {
    symbol,
    display_symbol: symbol,
    pair_id: pairId,
    pair_index: pairId,
    market_id: pairId,
    pyth_symbol: pythSymbolForPair(pairId),
    price: String(price || ''),
    mark: String(price || ''),
    mark_price: String(price || ''),
    mid: String(price || ''),
    oracle: String(price || ''),
    volume_24h: num(stats.volume24H ?? stats.volume_24h),
    price_change_24h: num(stats.priceChange24H ?? stats.price_change_24h),
    funding_rate: num(params.funding_rate ?? stats.fundingRate ?? stats.funding_rate),
    max_leverage: maxLeverage,
    min_order_size: String(params.min_order_size ?? '0'),
    min_notional_usd: String(minOrderUsd || ''),
    lot_size: DEFAULT_QUANTITY_STEP,
    quantity_step: DEFAULT_QUANTITY_STEP,
    tick_size: String(params.tick_size ?? '0.01'),
    max_market_slippage: String(params.max_market_slippage ?? '0.02'),
    initial_margin_ratio: String(params.initial_margin_ratio ?? ''),
    maintenance_margin_ratio: String(params.maintenance_margin_ratio ?? ''),
    margin_modes: ['cross'],
    isolated_only: false,
    supports_cross_margin: true,
    supports_isolated_margin: false,
    _raw: { pair_id: pairId, params, stats },
  };
}

async function fetchMarkets() {
  if (marketCache && Date.now() - marketCacheAt < MARKET_CACHE_MS) return marketCache;
  const [paramsResult, statsResult] = await Promise.allSettled([
    fetchPairParams(),
    fetchPairStats(),
  ]);
  const params = paramsResult.status === 'fulfilled' ? paramsResult.value : {};
  const statsRows = statsResult.status === 'fulfilled' ? statsResult.value : [];
  const statsByPair = new Map(statsRows.map(row => [String(row?.pairId || row?.pair_id || '').toLowerCase(), row]));
  const pairs = new Set([
    ...Object.keys(params || {}),
    ...statsRows.map(row => row?.pairId || row?.pair_id).filter(Boolean),
  ]);
  const rows = Array.from(pairs)
    .map(pair => normalizeMarket(String(pair).toLowerCase(), params[pair] || params[String(pair).toLowerCase()] || {}, statsByPair.get(String(pair).toLowerCase()) || {}))
    .filter(row => row.symbol)
    .sort((a, b) => {
      const preferred = ['BTC', 'ETH', 'SOL', 'HYPE'];
      const ai = preferred.indexOf(a.symbol);
      const bi = preferred.indexOf(b.symbol);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.symbol.localeCompare(b.symbol);
    });
  marketCache = rows;
  marketCacheAt = Date.now();
  return rows;
}

async function fetchMarketPrices() {
  if (priceCache && Date.now() - priceCacheAt < 5000) return priceCache;
  const markets = await fetchMarkets();
  priceCache = markets.map(m => ({
    symbol: m.symbol,
    pair_id: m.pair_id,
    pair_index: m.pair_id,
    price: m.price,
    mark: m.mark,
    mark_price: m.mark_price,
    mid: m.mid,
    oracle: m.oracle,
    volume_24h: m.volume_24h,
    price_change_24h: m.price_change_24h,
    funding_rate: m.funding_rate,
  }));
  priceCacheAt = Date.now();
  return priceCache;
}

async function marketMap() {
  const rows = await fetchMarkets();
  return new Map(rows.map(m => [String(m.pair_id).toLowerCase(), m]));
}

function normalizeAccountState(address, state = {}) {
  const equity = num(firstValue(state, ['account_margin', 'accountMargin', 'equity', 'account_equity']));
  const available = num(firstValue(state, ['available_margin', 'availableMargin', 'available_to_spend']), equity);
  const margin = num(firstValue(state, ['position_margin', 'positionMargin', 'margin_used', 'total_margin_used']));
  const positions = state?.positions && typeof state.positions === 'object' ? state.positions : {};
  const orders = state?.limit_orders && typeof state.limit_orders === 'object' ? state.limit_orders : {};
  return {
    address,
    balance: String(equity),
    usdc: String(equity),
    account_equity: String(equity),
    available_to_spend: String(Math.max(0, available)),
    available_to_withdraw: String(Math.max(0, available)),
    total_margin_used: String(margin),
    positions_count: Object.keys(positions).length,
    orders_count: Math.max(0, Number(state?.open_order_count ?? Object.values(orders).reduce((count, sideMap) => count + Object.keys(sideMap || {}).length, 0)) || 0),
    _raw: state,
  };
}

async function fetchUserStateExtended(address) {
  const user = await resolveAccountAddress(address);
  if (!user) throw new Error('Dango address required');
  const state = await queryApp({
    user_state_extended: {
      user,
      include_equity: true,
      include_available_margin: true,
      include_maintenance_margin: true,
      include_unrealized_pnl: true,
      include_unrealized_funding: true,
      include_liquidation_price: true,
    },
  });
  return state || {};
}

async function fetchAccount(address) {
  const user = await resolveAccountAddress(address);
  if (!user) throw new Error('Dango address required');
  const state = await fetchUserStateExtended(user).catch((e) => {
    if (/not found|no such|does not exist/i.test(e?.message || '')) return {};
    throw e;
  });
  return normalizeAccountState(user, state);
}

function normalizePosition(pairId, row = {}, market = {}) {
  const size = num(firstValue(row, ['size', 'base_size', 'baseSize']));
  if (!size) return null;
  const amount = Math.abs(size);
  const mark = num(market.mark_price || market.price);
  const entry = num(firstValue(row, ['entry_price', 'entryPrice', 'average_entry_price', 'avgEntryPrice', 'average_price']), mark);
  const notional = amount * (mark || entry || 0);
  const initialMarginRatio = num(market.initial_margin_ratio);
  const inferredLeverage = initialMarginRatio > 0 ? 1 / initialMarginRatio : 1;
  return {
    symbol: symbolFromPairId(pairId),
    pair_id: pairId,
    pair_index: pairId,
    side: size >= 0 ? 'bid' : 'ask',
    direction: size >= 0 ? 'long' : 'short',
    amount: String(amount),
    size: String(size),
    size_usd: notional,
    entry_price: String(entry || ''),
    mark_price: String(mark || ''),
    liquidation_price: firstValue(row, ['liquidation_price', 'liquidationPrice'], null),
    margin: String(num(firstValue(row, ['margin', 'position_margin', 'initial_margin']), initialMarginRatio > 0 ? notional * initialMarginRatio : 0)),
    leverage: String(num(firstValue(row, ['leverage']), inferredLeverage)),
    pnl_usd: String(num(firstValue(row, ['unrealized_pnl', 'unrealizedPnl', 'pnl']))),
    realized_pnl: String(num(firstValue(row, ['realized_pnl', 'realizedPnl']))),
    is_isolated: false,
    market_addr: pairId,
    _raw: row,
  };
}

async function fetchPositions(address) {
  const [state, markets] = await Promise.all([
    fetchUserStateExtended(address).catch((e) => {
      if (/not found|no such|does not exist/i.test(e?.message || '')) return {};
      throw e;
    }),
    marketMap(),
  ]);
  const positions = state?.positions && typeof state.positions === 'object' ? state.positions : {};
  return Object.entries(positions)
    .map(([pairId, row]) => normalizePosition(pairId, row, markets.get(String(pairId).toLowerCase()) || {}))
    .filter(Boolean);
}

function normalizeOpenOrder(pairId, sideKey, priceKey, order = {}, market = {}) {
  const rawSize = num(order?.size ?? order?.base_size ?? order?.remaining_size);
  const side = String(sideKey || order?.side || '').toLowerCase().includes('ask') || rawSize < 0 ? 'ask' : 'bid';
  const amount = Math.abs(rawSize || num(order?.amount));
  const price = num(order?.limit_price ?? order?.limitPrice ?? order?.price ?? priceKey);
  const id = String(order?.order_id ?? order?.orderId ?? order?.id ?? `${pairId}:${side}:${priceKey}`).trim();
  return {
    symbol: symbolFromPairId(pairId),
    pair_id: pairId,
    pair_index: pairId,
    order_id: id,
    client_order_id: String(order?.client_order_id ?? order?.clientOrderId ?? ''),
    side,
    amount: String(amount),
    size: String(rawSize || (side === 'ask' ? -amount : amount)),
    price: String(price || ''),
    trigger_price: null,
    order_type: 'limit',
    type: 'limit',
    status: String(order?.status || 'open'),
    reduce_only: order?.reduce_only === true || order?.reduceOnly === true,
    market_addr: pairId,
    _raw: { pairId, sideKey, priceKey, order, market },
  };
}

function conditionalOrdersFromState(state = {}) {
  const out = [];
  const positions = state?.positions && typeof state.positions === 'object' ? state.positions : {};
  for (const [pairId, position] of Object.entries(positions)) {
    for (const key of ['conditional_order_above', 'conditionalOrderAbove', 'conditional_order_below', 'conditionalOrderBelow']) {
      const order = position?.[key];
      if (!order || typeof order !== 'object') continue;
      const trigger = num(order.trigger_price ?? order.triggerPrice ?? order.price);
      const id = String(order.order_id ?? order.orderId ?? `${pairId}:${key}:${trigger}`).trim();
      const isAbove = /above/i.test(key);
      const closesLong = num(position.size) >= 0;
      const type = closesLong
        ? (isAbove ? 'take_profit' : 'stop_loss')
        : (isAbove ? 'stop_loss' : 'take_profit');
      out.push({
        symbol: symbolFromPairId(pairId),
        pair_id: pairId,
        pair_index: pairId,
        order_id: id,
        side: num(position.size) >= 0 ? 'ask' : 'bid',
        amount: String(Math.abs(num(position.size))),
        price: String((order.limit_price ?? order.limitPrice ?? trigger) || ''),
        trigger_price: String(trigger || ''),
        stop_price: String(trigger || ''),
        order_type: type,
        type,
        status: 'open',
        reduce_only: true,
        market_addr: pairId,
        _raw: { pairId, key, order, position },
      });
    }
  }
  return out;
}

async function fetchOrders(address) {
  const user = await resolveAccountAddress(address);
  if (!user) throw new Error('Dango address required');
  const [ordersResult, stateResult, markets] = await Promise.all([
    queryApp({ orders_by_user: { user } }).catch((e) => {
      if (/not found|no such|does not exist/i.test(e?.message || '')) return {};
      throw e;
    }),
    fetchUserStateExtended(user).catch((e) => {
      if (/not found|no such|does not exist/i.test(e?.message || '')) return {};
      throw e;
    }),
    marketMap(),
  ]);
  const out = [];
  const orders = ordersResult && typeof ordersResult === 'object' ? ordersResult : {};
  for (const [orderId, order] of Object.entries(orders)) {
    if (!order || typeof order !== 'object') continue;
    const pairId = String(order.pair_id || order.pairId || '').toLowerCase();
    if (!pairId) continue;
    out.push(normalizeOpenOrder(pairId, null, order.limit_price, { ...order, order_id: orderId }, markets.get(pairId) || {}));
  }
  out.push(...conditionalOrdersFromState(stateResult || {}));
  return out;
}

function gqlString(value) {
  return JSON.stringify(String(value));
}

function perpsEventsArgs(opts = {}) {
  const args = [];
  const first = Math.max(1, Math.min(500, Number(opts.first || EVENT_BACKFILL_LIMIT)));
  args.push(`first: ${first}`);
  if (opts.after) args.push(`after: ${gqlString(opts.after)}`);
  if (opts.before) args.push(`before: ${gqlString(opts.before)}`);
  if (opts.sortBy) args.push(`sortBy: ${String(opts.sortBy).replace(/[^A-Z_]/g, '')}`);
  if (opts.userAddr || opts.user) args.push(`userAddr: ${gqlString(normalizeDangoAddress(opts.userAddr || opts.user) || opts.userAddr || opts.user)}`);
  if (opts.eventType) args.push(`eventType: ${gqlString(opts.eventType)}`);
  if (opts.pairId) args.push(`pairId: ${gqlString(opts.pairId)}`);
  if (opts.blockHeight != null && Number.isFinite(Number(opts.blockHeight))) args.push(`blockHeight: ${Math.floor(Number(opts.blockHeight))}`);
  return args.join(', ');
}

async function queryPerpsEvents(opts = {}) {
  const args = perpsEventsArgs(opts);
  const data = await graphqlRequest(`query DangoPerpsEvents {
    perpsEvents(${args}) {
      nodes {
        blockHeight
        createdAt
        idx
        eventType
        userAddr
        pairId
        txHash
        data
      }
      pageInfo { hasNextPage endCursor }
    }
  }`);
  return {
    nodes: Array.isArray(data?.perpsEvents?.nodes) ? data.perpsEvents.nodes : [],
    pageInfo: data?.perpsEvents?.pageInfo || {},
  };
}

function eventBlockHeight(batch, event) {
  const n = Number(event?.blockHeight ?? event?.block_height ?? batch?.blockHeight ?? batch?.block_height);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function eventIdx(event) {
  const n = Number(event?.idx ?? event?.eventIdx ?? event?.event_idx ?? event?.index);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function normalizeEventPayload(batch = {}, event = {}) {
  const data = event?.data && typeof event.data === 'object' ? event.data : {};
  return {
    blockHeight: eventBlockHeight(batch, event),
    createdAt: event?.createdAt || event?.created_at || batch?.createdAt || batch?.created_at || null,
    idx: eventIdx(event),
    eventType: String(event?.eventType || event?.event_type || data.eventType || data.event_type || '').trim(),
    user: normalizeDangoAddress(event?.user || event?.userAddr || event?.user_addr || data.user || data.user_addr || data.account || ''),
    pairId: String(event?.pairId || event?.pair_id || data.pair_id || data.pairId || '').trim().toLowerCase(),
    orderId: String(event?.orderId || event?.order_id || data.order_id || data.orderId || '').trim(),
    clientOrderId: String(event?.clientOrderId || event?.client_order_id || data.client_order_id || data.clientOrderId || '').trim(),
    txHash: String(event?.txHash || event?.tx_hash || data.tx_hash || data.txHash || '').trim(),
    data,
    raw: event,
  };
}

function tradeFromPerpsEvent(batch = {}, event = {}) {
  const ev = normalizeEventPayload(batch, event);
  const eventType = ev.eventType.toLowerCase();
  if (eventType !== 'order_filled' && eventType !== 'orderfilled') return null;
  const data = ev.data || {};
  const fillSizeSigned = num(data.fill_size ?? data.fillSize ?? data.size ?? data.base_size);
  const fillSize = Math.abs(fillSizeSigned);
  const fillPrice = num(data.fill_price ?? data.fillPrice ?? data.price ?? data.execution_price);
  const notional = fillSize * fillPrice;
  if (!ev.user || !ev.pairId || !Number.isFinite(notional) || notional <= 0) return null;

  const openingSize = Math.abs(num(data.opening_size ?? data.openingSize));
  const closingSize = Math.abs(num(data.closing_size ?? data.closingSize));
  const pureClose = closingSize > 0 && openingSize <= 0;
  const side = pureClose
    ? (fillSizeSigned >= 0 ? 'close_short' : 'close_long')
    : (fillSizeSigned >= 0 ? 'long' : 'short');
  const clientOrderId = [
    'dango:fill',
    ev.blockHeight || 'unknown-block',
    ev.idx,
    ev.orderId || ev.clientOrderId || ev.txHash || 'event',
    ev.user,
  ].join(':');
  const orderIdNumber = /^\d+$/u.test(ev.orderId) ? Number(ev.orderId) : null;
  return {
    symbol: symbolFromPairId(ev.pairId),
    side,
    orderType: pureClose ? 'close' : (data.is_maker === true || data.isMaker === true ? 'limit' : 'market'),
    amount: String(fillSize),
    price: String(fillPrice),
    orderId: Number.isSafeInteger(orderIdNumber) ? orderIdNumber : null,
    clientOrderId,
    status: 'filled',
    dex: 'dango',
    notional_usd: notional,
    verifiedSource: 'dango_ws',
    pnl: data.realized_pnl ?? data.realizedPnl ?? null,
    fee: data.fee ?? data.trade_fee ?? data.tradeFee ?? null,
    createdAt: ev.createdAt || null,
    proofJson: JSON.stringify({
      source: 'dango_perps_events',
      block_height: ev.blockHeight,
      idx: ev.idx,
      user: ev.user,
      pair_id: ev.pairId,
      order_id: ev.orderId || null,
      client_order_id: ev.clientOrderId || null,
      tx_hash: ev.txHash || null,
      data,
    }),
    _event: ev,
  };
}

async function importRecentFillsForPlayer(playerId, address, addTrade, opts = {}) {
  const user = await resolveAccountAddress(address);
  if (!playerId || !user || typeof addTrade !== 'function') {
    return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'invalid_input' };
  }
  const sinceHeight = Math.max(0, Math.floor(Number(opts.sinceHeight || 0)));
  const limit = Math.max(1, Math.min(500, Number(opts.limit || EVENT_BACKFILL_LIMIT)));
  const maxPages = Math.max(1, Math.min(25, Number(opts.maxPages || EVENT_BACKFILL_MAX_PAGES)));
  let imported = 0;
  let skipped = 0;
  let total = 0;
  let after = opts.after || null;
  for (let page = 0; page < maxPages; page++) {
    const events = await queryPerpsEvents({
      userAddr: user,
      eventType: 'order_filled',
      first: limit,
      sortBy: 'BLOCK_HEIGHT_DESC',
      ...(after ? { after } : {}),
    });
    const nodes = Array.isArray(events.nodes) ? events.nodes : [];
    total += nodes.length;
    let reachedSinceHeight = false;
    for (const event of nodes) {
      const height = eventBlockHeight({}, event);
      if (sinceHeight > 0 && height <= sinceHeight) {
        skipped++;
        reachedSinceHeight = true;
        continue;
      }
      const trade = tradeFromPerpsEvent({}, event);
      if (!trade) {
        skipped++;
        continue;
      }
      try {
        const result = addTrade(playerId, trade);
        if (result?.id) imported++;
        else skipped++;
      } catch (e) {
        skipped++;
        if (!/UNIQUE|constraint/i.test(e?.message || '')) {
          console.warn('[dango] recent fill import failed:', e.message);
        }
      }
    }
    if (reachedSinceHeight || !events.pageInfo?.hasNextPage || !events.pageInfo?.endCursor || !nodes.length) break;
    after = events.pageInfo.endCursor;
  }
  return { ok: true, imported, skipped, total };
}

function snakeTypeValue(value) {
  if (Array.isArray(value)) return value.map(snakeTypeValue);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const snake = key.replace(/[A-Z]/g, ch => `_${ch.toLowerCase()}`);
    out[snake] = snakeTypeValue(item);
  }
  return out;
}

function coinsTypedData(coins) {
  if (!coins || typeof coins !== 'object') return [];
  return Object.keys(coins).map(name => ({ name, type: 'string' }));
}

function executeTypedData(childTypedData = {}, funds = {}, index = 0) {
  const { extraTypes = {}, type = [] } = childTypedData || {};
  return {
    type: [{ name: 'execute', type: `Execute${index}` }],
    extraTypes: {
      [`Execute${index}`]: [
        { name: 'contract', type: 'address' },
        { name: 'msg', type: `ExecuteMessage${index}` },
        { name: 'funds', type: `Funds${index}` },
      ],
      [`ExecuteMessage${index}`]: type,
      [`Funds${index}`]: coinsTypedData(funds),
      ...extraTypes,
    },
  };
}

function composeTxTypedData({ sender, messages, metadata, gasLimit }, childTypedData = {}) {
  const { type = [], extraTypes = {} } = childTypedData || {};
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Message: [
        { name: 'sender', type: 'address' },
        { name: 'data', type: 'Metadata' },
        { name: 'gas_limit', type: 'uint32' },
        { name: 'messages', type: 'TxMessage[]' },
      ],
      Metadata: [
        { name: 'user_index', type: 'uint32' },
        { name: 'chain_id', type: 'string' },
        { name: 'nonce', type: 'uint32' },
        ...(metadata.expiry ? [{ name: 'expiry', type: 'string' }] : []),
      ],
      TxMessage: type,
      ...extraTypes,
    },
    primaryType: 'Message',
    domain: {
      name: 'dango',
      chainId: 1,
      verifyingContract: sender,
    },
    message: {
      sender,
      data: snakeTypeValue(metadata),
      gas_limit: Math.max(1, Math.floor(Number(gasLimit || 0))),
      messages: snakeTypeValue(messages),
    },
  };
}

async function simulateTx(tx) {
  if (!tx || typeof tx !== 'object') throw new Error('Dango tx object required');
  const data = await queryIndexer(
    `query DangoSimulate($tx: UnsignedTx!) {
      simulate(tx: $tx)
    }`,
    { tx },
  );
  const sim = data?.simulate || {};
  const gasUsed = Number(sim.gas_used ?? sim.gasUsed ?? sim.gas_limit ?? sim.gasLimit ?? 0);
  return {
    ...sim,
    gas_used: gasUsed,
    gasUsed,
    gas_limit: Number((sim.gas_limit ?? sim.gasLimit ?? Math.ceil(gasUsed * 1.3)) || 0),
  };
}

async function broadcastTxSync(signedTx) {
  if (!signedTx || typeof signedTx !== 'object') throw new Error('signed Dango tx object required');
  const tx = snakeTypeValue(signedTx);
  const data = await queryIndexer(
    `mutation DangoBroadcastTx($tx: Tx!) {
      broadcastTxSync(tx: $tx)
    }`,
    { tx },
  );
  const result = data?.broadcastTxSync || data;
  const checkResult = result?.check_tx?.result || result?.checkTx?.result;
  const errPayload = checkResult?.Err ?? checkResult?.err ?? null;
  if (errPayload) {
    const err = new Error(typeof errPayload === 'string' ? errPayload : (errPayload.error || JSON.stringify(errPayload)));
    err.status = 400;
    err.data = result;
    throw err;
  }
  return result;
}

async function broadcastSignedTx(signedTx) {
  try {
    return await broadcastTxSync(signedTx);
  } catch (e) {
    if (!/Unknown type|Failed to parse|broadcastTxSync/i.test(e?.message || '')) throw e;
    return restPost('broadcast', signedTx);
  }
}

function normalizeSlippage(value, fallback = '0.010000') {
  let n = Number(value);
  if (!Number.isFinite(n) || n <= 0) n = Number(fallback);
  if (n > 0.05) n /= 100;
  if (!Number.isFinite(n) || n <= 0) n = 0.01;
  return n.toFixed(6);
}

function formatFixed6(value, fieldName = 'amount') {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${fieldName} must be numeric`);
  const text = n.toFixed(6);
  if (Number(text) === 0) throw new Error(`${fieldName} rounds to zero`);
  return text;
}

function normalizeAmountText(value, fieldName = 'amount') {
  if (value === null || value === undefined || value === '') throw new Error(`${fieldName} required`);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${fieldName} must be positive`);
  return formatFixed6(n, fieldName);
}

function depositMarginMessage({ amount = null, amountBaseUnits = null, denom = 'bridge/usdc' } = {}) {
  const units = amountBaseUnits != null && amountBaseUnits !== ''
    ? String(amountBaseUnits)
    : String(Math.floor(num(amount) * 1_000_000));
  if (!/^\d+$/u.test(units) || BigInt(units) <= 0n) throw new Error('amount or amountBaseUnits required for Dango deposit');
  return {
    message: {
      trade: {
        deposit: {},
      },
    },
    funds: {
      [String(denom || 'bridge/usdc')]: units,
    },
  };
}

function depositMarginTypedData() {
  return {
    type: [{ name: 'trade', type: 'Trade' }],
    extraTypes: {
      Trade: [{ name: 'deposit', type: 'Deposit' }],
      Deposit: [],
    },
  };
}

function withdrawMarginMessage({ amount } = {}) {
  return {
    trade: {
      withdraw: {
        amount: normalizeAmountText(amount),
      },
    },
  };
}

function withdrawMarginTypedData() {
  return {
    type: [{ name: 'trade', type: 'Trade' }],
    extraTypes: {
      Trade: [{ name: 'withdraw', type: 'Withdraw' }],
      Withdraw: [{ name: 'amount', type: 'string' }],
    },
  };
}

function conditionalSizeForSide(side, size) {
  if (size === null || size === undefined || size === '') return null;
  const signedSize = Math.abs(num(size));
  if (!signedSize) return null;
  const s = String(side || '').toLowerCase();
  const isSell = s === 'short' || s === 'sell' || s === 'ask' || s === 'close_long';
  return formatFixed6(isSell ? -signedSize : signedSize, 'size');
}

function triggerDirectionFromSideAndPrice(side, triggerPrice, referencePrice = null) {
  const explicit = String(side || '').toLowerCase();
  if (explicit === 'above' || explicit === 'below') return explicit;
  const trigger = Number(triggerPrice);
  const reference = Number(referencePrice);
  if (Number.isFinite(trigger) && Number.isFinite(reference) && reference > 0) {
    return trigger >= reference ? 'above' : 'below';
  }
  return explicit === 'short' || explicit === 'ask' || explicit === 'close_short' ? 'below' : 'above';
}

function submitConditionalOrderMessage({
  symbol,
  pairId,
  side,
  size = null,
  triggerPrice,
  maxSlippage = null,
  slippage = null,
  referencePrice = null,
  triggerDirection = null,
} = {}) {
  const pair = pairId || pairIdFromSymbol(symbol);
  if (!pair) throw new Error('pairId/symbol required');
  const trigger = normalizeAmountText(triggerPrice, 'triggerPrice');
  const closeSize = conditionalSizeForSide(side, size);
  if (!closeSize) throw new Error('size required for Dango conditional order');
  const direction = triggerDirection === 'above' || triggerDirection === 'below'
    ? triggerDirection
    : triggerDirectionFromSideAndPrice(side, trigger, referencePrice);
  if (direction !== 'above' && direction !== 'below') throw new Error('triggerDirection must be above or below');
  return {
    trade: {
      submit_conditional_order: {
        pair_id: pair,
        size: closeSize,
        trigger_price: trigger,
        trigger_direction: direction,
        max_slippage: normalizeSlippage(maxSlippage ?? slippage, '0.020000'),
      },
    },
  };
}

function submitConditionalOrderTypedData(includeSize = true) {
  return {
    type: [{ name: 'trade', type: 'Trade' }],
    extraTypes: {
      Trade: [{ name: 'submit_conditional_order', type: 'SubmitConditionalOrder' }],
      SubmitConditionalOrder: [
        { name: 'pair_id', type: 'string' },
        ...(includeSize ? [{ name: 'size', type: 'string' }] : []),
        { name: 'trigger_price', type: 'string' },
        { name: 'trigger_direction', type: 'string' },
        { name: 'max_slippage', type: 'string' },
      ],
    },
  };
}

function cancelConditionalOrderMessage({ symbol, pairId, triggerDirection = null, allForPair = false, all = false } = {}) {
  if (all) {
    return {
      trade: {
        cancel_conditional_order: 'all',
      },
    };
  }
  const pair = pairId || pairIdFromSymbol(symbol);
  if (!pair) throw new Error('pairId/symbol required');
  if (allForPair) {
    return {
      trade: {
        cancel_conditional_order: {
          all_for_pair: { pair_id: pair },
        },
      },
    };
  }
  const direction = String(triggerDirection || '').toLowerCase();
  if (direction !== 'above' && direction !== 'below') throw new Error('triggerDirection must be above or below');
  return {
    trade: {
      cancel_conditional_order: {
        one: {
          pair_id: pair,
          trigger_direction: direction,
        },
      },
    },
  };
}

function cancelConditionalOrderTypedData(request) {
  if (request === 'all') {
    return {
      type: [{ name: 'trade', type: 'Trade' }],
      extraTypes: {
        Trade: [{ name: 'cancel_conditional_order', type: 'CancelConditionalOrder' }],
        CancelConditionalOrder: [],
      },
    };
  }
  if (request?.one) {
    return {
      type: [{ name: 'trade', type: 'Trade' }],
      extraTypes: {
        Trade: [{ name: 'cancel_conditional_order', type: 'CancelConditionalOrder' }],
        CancelConditionalOrder: [{ name: 'one', type: 'One' }],
        One: [
          { name: 'pair_id', type: 'string' },
          { name: 'trigger_direction', type: 'string' },
        ],
      },
    };
  }
  return {
    type: [{ name: 'trade', type: 'Trade' }],
    extraTypes: {
      Trade: [{ name: 'cancel_conditional_order', type: 'CancelConditionalOrder' }],
      CancelConditionalOrder: [{ name: 'all_for_pair', type: 'AllForPair' }],
      AllForPair: [{ name: 'pair_id', type: 'string' }],
    },
  };
}

function submitOrderMessage({
  symbol,
  pairId,
  side,
  size,
  orderKind = 'market',
  price = null,
  reduceOnly = false,
  maxSlippage = null,
  slippage = null,
  timeInForce = 'GTC',
  clientOrderId = null,
  tp = undefined,
  sl = undefined,
}) {
  const pair = pairId || pairIdFromSymbol(symbol);
  const s = String(side || '').toLowerCase();
  const signedSize = Math.abs(num(size));
  if (!pair || !signedSize) throw new Error('pairId/symbol and size required');
  const isSell = s === 'short' || s === 'sell' || s === 'ask' || s === 'close_long';
  const isLimit = String(orderKind || 'market').toLowerCase() === 'limit';
  const tif = String(timeInForce || 'GTC').toUpperCase();
  if (isLimit && (price === null || price === undefined || price === '')) throw new Error('price required for Dango limit order');
  if (isLimit && clientOrderId != null && clientOrderId !== '' && tif === 'IOC') {
    throw new Error('Dango client_order_id is not allowed with IOC time_in_force');
  }
  const kind = isLimit
    ? {
        limit: {
          limit_price: normalizeAmountText(price, 'price'),
          time_in_force: tif,
          ...(clientOrderId != null && clientOrderId !== '' ? { client_order_id: String(clientOrderId) } : {}),
        },
      }
    : {
        market: {
          max_slippage: normalizeSlippage(maxSlippage ?? slippage),
        },
      };
  const submit = {
    pair_id: pair,
    size: formatFixed6(isSell ? -signedSize : signedSize, 'size'),
    kind,
    reduce_only: !!reduceOnly,
  };
  if (tp !== undefined) submit.tp = tp;
  if (sl !== undefined) submit.sl = sl;
  return {
    trade: {
      submit_order: submit,
    },
  };
}

function submitOrderTypedData(message) {
  const submit = message?.trade?.submit_order || {};
  const kind = submit.kind || {};
  const isLimit = !!kind.limit;
  const limitHasClientOrderId = isLimit && kind.limit.client_order_id != null;
  const kindTypedData = isLimit ? {
    kind: [{ name: 'limit', type: 'Limit' }],
    Limit: [
      { name: 'limit_price', type: 'string' },
      { name: 'time_in_force', type: 'string' },
      ...(limitHasClientOrderId ? [{ name: 'client_order_id', type: 'string' }] : []),
    ],
  } : {
    kind: [{ name: 'market', type: 'Market' }],
    Market: [{ name: 'max_slippage', type: 'string' }],
  };
  const childOrderTypeFor = (child) => [
    { name: 'trigger_price', type: 'string' },
    { name: 'max_slippage', type: 'string' },
    ...(child?.size ? [{ name: 'size', type: 'string' }] : []),
  ];
  return {
    type: [{ name: 'trade', type: 'Trade' }],
    extraTypes: {
      Trade: [{ name: 'submit_order', type: 'SubmitOrder' }],
      SubmitOrder: [
        { name: 'pair_id', type: 'string' },
        { name: 'size', type: 'string' },
        { name: 'kind', type: 'Kind' },
        { name: 'reduce_only', type: 'bool' },
        ...(submit.tp ? [{ name: 'tp', type: 'ChildOrderTp' }] : []),
        ...(submit.sl ? [{ name: 'sl', type: 'ChildOrderSl' }] : []),
      ],
      Kind: kindTypedData.kind,
      ...(kindTypedData.Market ? { Market: kindTypedData.Market } : {}),
      ...(kindTypedData.Limit ? { Limit: kindTypedData.Limit } : {}),
      ...(submit.tp ? { ChildOrderTp: childOrderTypeFor(submit.tp) } : {}),
      ...(submit.sl ? { ChildOrderSl: childOrderTypeFor(submit.sl) } : {}),
    },
  };
}

function cancelOrderMessage({ orderId, clientOrderId = null, all = false }) {
  if (!orderId && !clientOrderId && !all) throw new Error('orderId, clientOrderId, or all required');
  let request = 'all';
  if (!all) {
    request = clientOrderId
      ? { one_by_client_order_id: String(clientOrderId) }
      : { one: String(orderId) };
  }
  return {
    trade: {
      cancel_order: request,
    },
  };
}

function cancelOrderTypedData(request) {
  let CancelOrder = [];
  if (request?.one) CancelOrder = [{ name: 'one', type: 'string' }];
  else if (request?.one_by_client_order_id) CancelOrder = [{ name: 'one_by_client_order_id', type: 'string' }];
  return {
    type: [{ name: 'trade', type: 'Trade' }],
    extraTypes: {
      Trade: [{ name: 'cancel_order', type: 'CancelOrder' }],
      CancelOrder,
    },
  };
}

function intentFromAction(action, body = {}) {
  const key = String(action || body.action || '').trim().toLowerCase();
  if (key === 'deposit') {
    const prepared = depositMarginMessage(body);
    return {
      action: key,
      message: prepared.message,
      funds: prepared.funds,
      typedData: depositMarginTypedData(),
    };
  }
  if (key === 'withdraw') {
    const message = withdrawMarginMessage(body);
    return { action: key, message, funds: {}, typedData: withdrawMarginTypedData() };
  }
  if (key === 'place_order' || key === 'order' || key === 'market_order' || key === 'limit_order') {
    const message = submitOrderMessage(body);
    return { action: key, message, funds: {}, typedData: submitOrderTypedData(message) };
  }
  if (key === 'cancel_order' || key === 'cancel') {
    const message = cancelOrderMessage(body);
    const request = message?.trade?.cancel_order;
    return { action: key, message, funds: {}, typedData: cancelOrderTypedData(request) };
  }
  if (key === 'tpsl' || key === 'conditional_order' || key === 'place_tpsl') {
    const message = submitConditionalOrderMessage(body);
    const submit = message?.trade?.submit_conditional_order || {};
    return {
      action: key,
      message,
      funds: {},
      typedData: submitConditionalOrderTypedData(submit.size !== undefined),
    };
  }
  if (key === 'cancel_tpsl' || key === 'cancel_conditional_order') {
    const message = cancelConditionalOrderMessage(body);
    const request = message?.trade?.cancel_conditional_order;
    return {
      action: key,
      message,
      funds: {},
      typedData: cancelConditionalOrderTypedData(request),
    };
  }
  const err = new Error(`Unsupported Dango action: ${action || body.action || ''}`);
  err.status = 400;
  throw err;
}

async function prepareSignedIntent({ account, linkedAccount = '', action, body = {}, gasScale = 1.3 } = {}) {
  const sender = await resolveAccountAddress(account || linkedAccount || body.account);
  if (!sender) throw new Error('Dango account address required');
  const config = await fetchAppConfig();
  const accountInfo = await fetchAccountInfo(sender);
  const seenNonces = await fetchAccountSeenNonces(sender);
  const metadata = {
    chain_id: CHAIN_ID,
    user_index: accountInfo.owner,
    nonce: nextNonce(seenNonces),
  };
  const intent = intentFromAction(action, body);
  const message = executeMessage(intent.message, intent.funds || {});
  const unsignedTx = {
    sender,
    msgs: [message],
    data: metadata,
  };
  const simulation = await simulateTx(unsignedTx);
  const gasUsed = Number(simulation.gas_used ?? simulation.gasUsed ?? 0);
  const gasLimit = Math.max(1, Math.ceil(gasUsed * Math.max(1, Number(gasScale) || 1.3)));
  const executeData = executeTypedData(intent.typedData, intent.funds || {}, 0);
  const signDoc = composeTxTypedData({
    sender,
    messages: [message],
    metadata,
    gasLimit,
  }, executeData);
  return {
    action: intent.action,
    network: NETWORK,
    chain_id: CHAIN_ID,
    linked_account: normalizeDangoAddress(linkedAccount),
    account: sender,
    sender,
    key_hash: linkedAccount ? ethereumKeyHash(linkedAccount) : '',
    perps_contract: config.addresses.perps,
    unsigned_tx: { ...unsignedTx, gasLimit },
    sign_doc: signDoc,
    tx: {
      sender,
      msgs: [message],
      data: metadata,
      gasLimit,
    },
    simulation,
  };
}

function startPerpsEventsSocket({ users = [], since = null, onBatch, onError, onOpen, label = 'dango-ws' } = {}) {
  const cleanUsers = Array.from(new Set((users || []).map(normalizeDangoAddress).filter(Boolean)));
  if (!cleanUsers.length) throw new Error('Dango WebSocket requires at least one user');
  const ws = new WebSocket(NATIVE_WS_URL);
  let closed = false;
  let pingTimer = null;
  const subscriptionId = nextWsSubscriptionId++;
  if (nextWsSubscriptionId > 1_000_000) nextWsSubscriptionId = 1;
  const clearPing = () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  };
  ws.on('open', () => {
    const subscription = {
      type: 'perpsEvents',
      eventTypes: ['order_filled'],
      users: cleanUsers,
    };
    if (since != null && Number.isFinite(Number(since))) subscription.since = Math.max(0, Math.floor(Number(since)));
    ws.send(JSON.stringify({ method: 'subscribe', id: subscriptionId, subscription }));
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ method: 'ping', id: Math.max(1, Math.floor(Date.now())) })); } catch {}
      }
    }, 25_000);
    pingTimer.unref?.();
    onOpen?.({ users: cleanUsers.length, since: subscription.since ?? null, url: NATIVE_WS_URL });
  });
  ws.on('message', (buf) => {
    let payload = null;
    try {
      payload = JSON.parse(buf.toString('utf8'));
    } catch (e) {
      onError?.(e);
      return;
    }
    const type = String(payload?.type || payload?.subscription?.type || payload?.data?.type || '').toLowerCase();
    const data = payload?.data || payload?.result || payload;
    if (type === 'error' || payload?.error) {
      const code = payload?.error?.code || payload?.code || '';
      const message = payload?.error?.message || payload?.message || 'Dango WebSocket error';
      onError?.(new Error(`${code ? `${code}: ` : ''}${message}`), payload);
      return;
    }
    if (type === 'resync' || payload?.resync) {
      onError?.(new Error('Dango WebSocket requested resync'), payload);
      return;
    }
    const events = Array.isArray(data?.events) ? data.events : (Array.isArray(payload?.events) ? payload.events : null);
    if (events) {
      onBatch?.({
        blockHeight: data?.blockHeight ?? payload?.blockHeight,
        createdAt: data?.createdAt ?? payload?.createdAt,
        events,
        raw: payload,
      });
    }
  });
  ws.on('error', (err) => onError?.(err));
  ws.on('close', (code, reason) => {
    clearPing();
    if (!closed) onError?.(new Error(`Dango WebSocket closed ${code}: ${reason || ''}`.trim()));
  });
  return {
    close() {
      closed = true;
      clearPing();
      try { ws.close(); } catch {}
    },
    ws,
    users: cleanUsers,
  };
}

module.exports = {
  NETWORK,
  CHAIN_ID,
  GRAPHQL_URL,
  GRAPHQL_WS_URL,
  REST_BASE,
  NATIVE_WS_URL,
  PERPS_CONTRACT,
  normalizeDangoAddress,
  isDangoAddress,
  ethereumKeyHash,
  resolveAccountAddress,
  fetchAppConfig,
  fetchAccountInfo,
  fetchAccountSeenNonces,
  pairIdFromSymbol,
  symbolFromPairId,
  dangoDisplaySymbol,
  executeMessage,
  depositMarginMessage,
  withdrawMarginMessage,
  submitConditionalOrderMessage,
  cancelConditionalOrderMessage,
  prepareSignedIntent,
  fetchStatus,
  graphqlRequest,
  queryApp,
  queryAppIndexer,
  queryPerpsEvents,
  fetchPairParams,
  fetchPairStats,
  fetchMarkets,
  getMarketInfo: fetchMarkets,
  fetchMarketPrices,
  getPrices: fetchMarketPrices,
  fetchUserStateExtended,
  fetchAccount,
  getAccountByAddress: fetchAccount,
  fetchPositions,
  getPositionsByAddress: fetchPositions,
  fetchOrders,
  getOrdersByAddress: fetchOrders,
  tradeFromPerpsEvent,
  importRecentFillsForPlayer,
  broadcastSignedTx,
  broadcastTxSync,
  simulateTx,
  submitOrderMessage,
  cancelOrderMessage,
  startPerpsEventsSocket,
  sleep,
};
