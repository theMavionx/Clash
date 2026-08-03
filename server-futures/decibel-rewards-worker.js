// Decibel rewards worker: periodically reconciles every authoritative fill
// into `trade_history`. Regular fills use the immutable exchange trade id as
// their ledger key; bulk market-maker fills are handled by the dedicated bulk
// reconciler. A persisted high-water mark plus overlap makes API outages and
// process restarts catch up instead of silently dropping tournament volume.

const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');
const decibel = require('./decibel');
const decibelBulkRewards = require('./decibel-bulk-rewards');

const POLL_MS = 2 * 60 * 1000; // 2 minutes
// Record every economically non-zero verified fill. Gold farming protection
// lives in the main server's /claim-gold path, which clamps Decibel rewards
// below $10. Keeping this floor low lets position quests count tiny but real
// meme-market fills such as CHIP without paying gold for them.
const MIN_RECORDED_NOTIONAL_USD = 0.000001;
const DECIBEL_EXACT_FILL_PAGE_SIZE = Math.max(
  25,
  Math.min(100, Number(process.env.DECIBEL_EXACT_FILL_PAGE_SIZE || 100))
);
const DECIBEL_EXACT_FILL_MAX_PAGES = Math.max(
  1,
  Math.min(50, Number(process.env.DECIBEL_EXACT_FILL_MAX_PAGES || 20))
);
const DECIBEL_EXACT_FILL_OVERLAP_MS = Math.max(
  60_000,
  Math.min(60 * 60_000, Number(process.env.DECIBEL_EXACT_FILL_OVERLAP_MS || 30 * 60_000))
);
// Per-wallet reconciliation diagnostics are intentionally opt-in. With many
// linked accounts this used to write thousands of large lines per hour and
// grew the PM2 logs into gigabytes without helping normal operations.
const DECIBEL_RECONCILE_DEBUG = String(process.env.DECIBEL_RECONCILE_DEBUG || '0') !== '0';
const DECIBEL_EXACT_FILL_CUTOVER_KEY = 'exact_fill_v2_cutover_ms';
const DECIBEL_EXACT_FILL_CURSOR_PREFIX = 'exact_fill_v2_cursor_ms:';

const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');
const DECIBEL_PACKAGE_MAINNET =
  '0x50ead22afd6ffd9769e3b3d6e0e64a2a350d68e8b102c4e72e33d0b8cfdfdb06';
const DEFAULT_DECIBEL_BUILDER_SUBACCOUNT =
  '0xfa4d46a481f5bc95de01a629ec95b7876e946ebe1e86374284d899ac4366984a';
const LEGACY_DECIBEL_BUILDER_SUBACCOUNTS = [
  // Used by older Decibel delegated orders before the builder subaccount was rotated.
  '0xf375ba6776dd44960e460d58e3f5d0ca645bf5d27210a3f16c6adc6abae78c03',
];
const DECIBEL_BUILDER_CHAIN_UNITS_PER_BPS = 100;
const DECIBEL_ALLOWED_BUILDER_ADDRS = new Set(
  [
    DEFAULT_DECIBEL_BUILDER_SUBACCOUNT,
    process.env.DECIBEL_BUILDER_SUBACCOUNT,
    process.env.DECIBEL_ALLOWED_BUILDER_ADDRS,
    process.env.DECIBEL_LEGACY_BUILDER_SUBACCOUNTS,
    ...LEGACY_DECIBEL_BUILDER_SUBACCOUNTS,
  ]
    .flatMap(v => String(v || '').split(','))
    .map(s => decibel.normalizeAptosAddress(s))
    .filter(Boolean)
);
const aptosTxCache = new Map();

// Per-wallet cache of open trade keys we've already recorded (avoid the
// "same OPEN treated as new every poll" bug). Keyed by lowercase OWNER
// address (master wallet) → Map<key, info>. `info` holds the data we need
// to emit a CLOSE row when the position disappears from the next poll.
const seenOpenTrades = new Map();

// Cache: master wallet → primary subaccount address. Cache only positive
// hits. A player may activate after the worker has already polled them; an
// empty sentinel would skip that user until process restart.
const subaccountByOwner = new Map();
async function resolveSubaccount(ownerAddr) {
  if (subaccountByOwner.has(ownerAddr)) return subaccountByOwner.get(ownerAddr);
  const list = await decibel.fetchUserSubaccounts(ownerAddr);
  const primary = list.find(s => s.is_primary) || list[0] || null;
  const sub = primary ? (primary.subaccount_address || primary.address || '') : '';
  if (sub) subaccountByOwner.set(ownerAddr, sub);
  return sub;
}

function fieldString(row, keys) {
  for (const key of keys) {
    const v = row?.[key];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object') {
      if (Array.isArray(v.vec) && v.vec.length) return String(v.vec[0]);
      if (v.value !== undefined && v.value !== null) return String(v.value);
      if (v.inner !== undefined && v.inner !== null) return String(v.inner);
      continue;
    }
    return String(v);
  }
  return '';
}

function vectorValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.vec) && value.vec.length) return vectorValue(value.vec[0]);
    if (value.order_id !== undefined && value.order_id !== null) return String(value.order_id);
    if (value.builder !== undefined && value.builder !== null) return String(value.builder);
    if (value.fees !== undefined && value.fees !== null) return String(value.fees);
    if (value.inner !== undefined && value.inner !== null) return String(value.inner);
    if (value.value !== undefined && value.value !== null) return String(value.value);
  }
  return String(value);
}

function txVersionFromOrder(row) {
  return fieldString(row, [
    'transaction_version',
    'transactionVersion',
    'transaction_version_open',
    'open_transaction_version',
    'version',
  ]);
}

function orderKeys(row) {
  const keys = new Set();
  const orderId = fieldString(row, [
    'order_id', 'orderId', 'orderID',
    'oid', 'order_index', 'orderIndex', 'order_idx', 'orderIdx',
  ]);
  const clientOrderId = fieldString(row, [
    'client_order_id', 'clientOrderId', 'clientOrderID',
    'client_id', 'clientId', 'client_oid', 'clientOid', 'cloid',
  ]);
  if (orderId) keys.add(`order:${orderId.toLowerCase()}`);
  if (clientOrderId) keys.add(`client:${clientOrderId.toLowerCase()}`);
  return keys;
}

function boolish(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function orderText(row) {
  return [
    'order_type', 'orderType', 'type',
    'trigger_type', 'triggerType',
    'trigger_condition', 'triggerCondition',
    'trigger_price', 'triggerPrice',
    'take_profit', 'takeProfit',
    'stop_loss', 'stopLoss',
    'reduce_only', 'reduceOnly', 'is_reduce_only', 'isReduceOnly',
    'source', 'reason', 'category',
    'action', 'trade_action', 'order_action',
    'time_in_force', 'timeInForce', 'tif',
  ].map((key) => fieldString(row, [key]).toLowerCase()).filter(Boolean).join(' ');
}

function isTriggerOrTpSlOrder(row) {
  const text = orderText(row);
  if (/\b(tp|sl|tpsl)\b/.test(text)) return true;
  if (text.includes('takeprofit') || text.includes('take_profit') || text.includes('take profit')) return true;
  if (text.includes('stoploss') || text.includes('stop_loss') || text.includes('stop loss')) return true;
  if (text.includes('trigger') || text.includes('conditional')) return true;
  if (boolish(row?.reduce_only ?? row?.reduceOnly ?? row?.is_reduce_only ?? row?.isReduceOnly)
    && (fieldString(row, ['trigger_price', 'triggerPrice']) || text.includes('close'))) {
    return true;
  }
  return false;
}

function decibelOrderDebugKind(row) {
  const type = fieldString(row, ['order_type', 'orderType', 'type']) || 'unknown';
  const tif = fieldString(row, ['time_in_force', 'timeInForce', 'tif']);
  const status = fieldString(row, ['status', 'order_status', 'orderStatus', 'state']);
  const trigger = isTriggerOrTpSlOrder(row) ? 'trigger/tpsl' : '';
  return [type, tif, status, trigger].filter(Boolean).join('|').toLowerCase();
}

function countKinds(rows, limit = 8) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = decibelOrderDebugKind(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([kind, count]) => ({ kind, count }));
}

function shortAddr(addr) {
  const s = String(addr || '');
  return s.length > 16 ? `${s.slice(0, 10)}...${s.slice(-6)}` : s;
}

function proofForOrderKey(key, store = db) {
  const raw = String(key || '');
  if (raw.startsWith('order:')) {
    return store.getDecibelOrderProof({ orderId: raw.slice('order:'.length) });
  }
  if (raw.startsWith('client:')) {
    return store.getDecibelOrderProof({ clientOrderId: raw.slice('client:'.length) });
  }
  return null;
}

function isAllowedStoredOrderProof(proof, subAddr) {
  if (!proof) return false;
  const proofSubaccount = decibel.normalizeAptosAddress(proof.subaccount || '');
  const wantedSubaccount = decibel.normalizeAptosAddress(subAddr);
  const builderAddr = decibel.normalizeAptosAddress(proof.builder_addr || '');
  return proofSubaccount === wantedSubaccount
    && DECIBEL_ALLOWED_BUILDER_ADDRS.has(builderAddr)
    && Number(proof.builder_fee_bps) > 0;
}

async function fetchAptosTxByVersion(version, client = decibel) {
  const raw = String(version || '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const cacheKey = client === decibel ? raw : null;
  if (cacheKey && aptosTxCache.has(cacheKey)) return aptosTxCache.get(cacheKey);
  const tx = await client.fetchAptosJsonPath(`transactions/by_version/${raw}`);
  if (cacheKey) {
    if (aptosTxCache.size > 500) aptosTxCache.clear();
    aptosTxCache.set(cacheKey, tx);
  }
  return tx;
}

function eventMatchesOrder(tx, order) {
  return Boolean(findMatchingOrderEvent(tx, order) || findMatchingTradeEvent(tx, order, ''));
}

function findMatchingOrderEvent(tx, order) {
  const orderId = fieldString(order, ['order_id', 'orderId', 'orderID']);
  const clientOrderId = fieldString(order, ['client_order_id', 'clientOrderId', 'clientOrderID']);
  for (const event of Array.isArray(tx?.events) ? tx.events : []) {
    const data = event?.data || {};
    const eventOrderId = vectorValue(data.order_id ?? data.orderId ?? data.orderID);
    const eventClientOrderId = vectorValue(data.client_order_id ?? data.clientOrderId ?? data.clientOrderID);
    if (orderId && eventOrderId && String(eventOrderId) === String(orderId)) return event;
    if (clientOrderId && eventClientOrderId && String(eventClientOrderId) === String(clientOrderId)) return event;
  }
  return null;
}

function findMatchingTradeEvent(tx, order, subAddr) {
  const orderId = fieldString(order, ['order_id', 'orderId', 'orderID']);
  const clientOrderId = fieldString(order, ['client_order_id', 'clientOrderId', 'clientOrderID']);
  const wantedSub = decibel.normalizeAptosAddress(subAddr);
  for (const event of Array.isArray(tx?.events) ? tx.events : []) {
    const type = String(event?.type || '');
    if (!type.includes('::perp_positions::TradeEvent')) continue;
    const data = event?.data || {};
    if (wantedSub && decibel.normalizeAptosAddress(data.account || '') !== wantedSub) continue;
    const eventOrderId = vectorValue(data.order_id ?? data.orderId ?? data.orderID);
    const eventClientOrderId = vectorValue(data.client_order_id ?? data.clientOrderId ?? data.clientOrderID);
    if (orderId && eventOrderId && String(eventOrderId) === String(orderId)) return event;
    if (clientOrderId && eventClientOrderId && String(eventClientOrderId) === String(clientOrderId)) return event;
  }
  return null;
}

function builderProofFromTradeEvent(event) {
  const entry = event?.data?.builder_code?.vec?.[0]
    || event?.data?.fee_distribution?.builder_or_referrer_fees?.vec?.[0]
    || null;
  if (!entry) return null;
  const builderAddr = decibel.normalizeAptosAddress(entry.builder || entry.address || '');
  const chainFee = Number(entry.fees);
  if (!builderAddr || !DECIBEL_ALLOWED_BUILDER_ADDRS.has(builderAddr)) return null;
  return {
    builderAddr,
    chainFee: Number.isFinite(chainFee) ? chainFee : null,
    builderFeeBps: Number.isFinite(chainFee) ? chainFee / DECIBEL_BUILDER_CHAIN_UNITS_PER_BPS : 0,
  };
}

function verifyExactFillTradeEvent(tx, fill, subAddr) {
  const fillId = tradeFillId(fill);
  const wantedSubaccount = decibel.normalizeAptosAddress(subAddr);
  const wantedMarket = marketAddress(fill);
  const event = (Array.isArray(tx?.events) ? tx.events : []).find((candidate) => {
    if (!String(candidate?.type || '').includes('::perp_positions::TradeEvent')) return false;
    const data = candidate?.data || {};
    if (String(data.fill_id ?? '') !== fillId) return false;
    if (decibel.normalizeAptosAddress(data.account || '') !== wantedSubaccount) return false;
    const eventMarket = decibel.normalizeAptosAddress(vectorValue(data.market));
    return !wantedMarket || !eventMarket || eventMarket === wantedMarket;
  });
  if (!event) return { verified: false, reason: 'matching_trade_event_missing' };

  const direct = event?.data?.builder_code?.vec?.[0] || null;
  const distributed = event?.data?.fee_distribution?.builder_or_referrer_fees?.vec?.[0] || null;
  const builderAddr = decibel.normalizeAptosAddress(
    direct?.builder || direct?.address || distributed?.builder || distributed?.address || ''
  );
  const chainFee = Number(direct?.fees);
  const distributedFee = Number(distributed?.fees);
  const hasPositiveBuilderFee = (Number.isFinite(chainFee) && chainFee > 0)
    || (Number.isFinite(distributedFee) && distributedFee > 0);
  if (!builderAddr || !DECIBEL_ALLOWED_BUILDER_ADDRS.has(builderAddr)) {
    return { verified: false, reason: 'different_builder', builder_addr: builderAddr || null };
  }
  if (!hasPositiveBuilderFee) {
    return { verified: false, reason: 'builder_fee_missing', builder_addr: builderAddr };
  }
  const eventFee = Number(event?.data?.fee);
  return {
    verified: true,
    builder_addr: builderAddr,
    builder_fee_bps: Number.isFinite(chainFee) && chainFee > 0
      ? chainFee / DECIBEL_BUILDER_CHAIN_UNITS_PER_BPS
      : null,
    builder_distributed_fee: Number.isFinite(distributedFee) ? distributedFee : null,
    fee_usd: Number.isFinite(eventFee) ? eventFee / 1e6 : null,
    tx_hash: String(tx?.hash || '') || null,
  };
}

async function proofFromFillTx(fill, subAddr, client = decibel) {
  const version = fieldString(fill, ['transaction_version', 'transactionVersion']);
  if (!/^\d+$/.test(version)) {
    return { verified: false, retryable: true, reason: 'transaction_version_missing' };
  }
  const tx = await fetchAptosTxByVersion(version, client);
  return verifyExactFillTradeEvent(tx, fill, subAddr);
}

async function proofFromOrderTx(playerId, subAddr, order, marketMap, store = db, client = decibel) {
  const version = txVersionFromOrder(order);
  if (!version) return null;
  const tx = await fetchAptosTxByVersion(version, client);
  const payload = tx?.payload || {};
  const args = Array.isArray(payload.arguments) ? payload.arguments : [];
  const tradeEvent = findMatchingTradeEvent(tx, order, subAddr);
  const tradeEventBuilder = builderProofFromTradeEvent(tradeEvent);
  const isSinglePlace = payload.function === `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::place_order_to_subaccount`;
  const txSubaccount = isSinglePlace
    ? decibel.normalizeAptosAddress(vectorValue(args[0]))
    : decibel.normalizeAptosAddress(tradeEvent?.data?.account || subAddr);
  if (txSubaccount !== decibel.normalizeAptosAddress(subAddr)) return null;
  const txMarket = isSinglePlace
    ? decibel.normalizeAptosAddress(vectorValue(args[1]))
    : decibel.normalizeAptosAddress(vectorValue(tradeEvent?.data?.market));
  const orderMarket = marketAddress(order);
  if (orderMarket && txMarket && orderMarket !== txMarket) return null;
  const orderClientId = fieldString(order, ['client_order_id', 'clientOrderId', 'clientOrderID']);
  const txClientId = isSinglePlace ? vectorValue(args[7]) : vectorValue(tradeEvent?.data?.client_order_id);
  if (orderClientId && txClientId && String(orderClientId) !== String(txClientId)) return null;
  if (!eventMatchesOrder(tx, order)) return null;
  const builderAddr = tradeEventBuilder?.builderAddr
    || decibel.normalizeAptosAddress(vectorValue(args[13]));
  if (!builderAddr || !DECIBEL_ALLOWED_BUILDER_ADDRS.has(builderAddr)) return null;
  const chainFee = tradeEventBuilder?.chainFee ?? Number(vectorValue(args[14]));
  const builderFeeBps = tradeEventBuilder?.builderFeeBps
    ?? (Number.isFinite(chainFee) ? chainFee / DECIBEL_BUILDER_CHAIN_UNITS_PER_BPS : 0);
  const market = txMarket ? marketMap?.get(txMarket.toLowerCase()) : null;
  const orderId = fieldString(order, ['order_id', 'orderId', 'orderID']);
  const proofJson = JSON.stringify({
    source: 'decibel_aptos_order_payload',
    tx_version: version,
    sender: tx?.sender || null,
    builder: builderAddr,
    builder_fee_chain_units: Number.isFinite(chainFee) ? chainFee : null,
    builder_fee_bps: builderFeeBps,
    subaccount: txSubaccount,
    market: txMarket || null,
    order_id: orderId || null,
    client_order_id: orderClientId || null,
  });
  store.recordDecibelOrderProof({
    playerId,
    subaccount: subAddr,
    orderId: orderId || null,
    clientOrderId: orderClientId || null,
    symbol: symbolFromFill(order, marketMap),
    side: sideFromFill(order),
    orderType: rewardOrderType(order, sideFromFill(order)),
    marketName: fieldString(market || order, ['market_name', 'marketName', 'symbol']) || null,
    marketAddr: txMarket || orderMarket || null,
    builderAddr,
    builderFeeBps,
    txHash: tx?.hash || null,
    proofJson,
  });
  return store.getDecibelOrderProof({ orderId, clientOrderId: orderClientId }) || {
    id: null,
    builder_addr: builderAddr,
    builder_fee_bps: builderFeeBps,
    tx_hash: tx?.hash || null,
    proof_json: proofJson,
    order_id: orderId || null,
    client_order_id: orderClientId || null,
  };
}

function isFilledRewardOrder(row) {
  const status = fieldString(row, ['status', 'order_status', 'orderStatus', 'state']).toLowerCase();
  if (!status.includes('fill')) return false;
  const type = fieldString(row, ['order_type', 'orderType', 'type']).toLowerCase();
  if (type.includes('limit') || type.includes('market') || type.includes('ioc')) return true;
  if (isTriggerOrTpSlOrder(row)) return true;
  const tif = fieldString(row, ['time_in_force', 'timeInForce', 'tif']).toLowerCase();
  return tif.includes('good') || tif.includes('gtc');
}

function rewardOrderType(order, side) {
  if (String(side || '').startsWith('close_')) return 'close';
  if (isTriggerOrTpSlOrder(order)) return 'trigger';
  const type = fieldString(order, ['order_type', 'orderType', 'type']).toLowerCase();
  return type.includes('market') || type.includes('ioc') ? 'market' : 'limit';
}

function marketAddress(row) {
  const raw = fieldString(row, ['market', 'market_addr', 'marketAddr', 'market_address']);
  const normalized = decibel.normalizeAptosAddress(raw);
  return normalized && normalized.startsWith('0x') ? normalized : '';
}

async function marketsByAddress(client = decibel) {
  const markets = await client.fetchMarkets();
  const byAddr = new Map();
  for (const market of markets) {
    const addr = marketAddress(market);
    if (addr) byAddr.set(addr.toLowerCase(), market);
  }
  return byAddr;
}

function symbolFromFill(row, marketMap) {
  const direct = fieldString(row, ['marketName', 'market_name', 'symbol']);
  if (direct) return (direct.split(/[-/]/)[0] || direct).toUpperCase();
  const market = marketMap?.get(marketAddress(row).toLowerCase());
  if (market) return decibel.symbolFromMarket({ marketName: market.market_name, symbol: market.symbol });
  return decibel.symbolFromMarket(row);
}

function sideFromFill(row) {
  const action = fieldString(row, ['action', 'trade_action', 'order_action']).toLowerCase();
  if (action.includes('closeshort') || (action.includes('close') && action.includes('short'))) return 'close_short';
  if (action.includes('closelong') || (action.includes('close') && action.includes('long'))) return 'close_long';
  if (action.includes('openshort') || (action.includes('open') && action.includes('short'))) return 'short';
  if (action.includes('openlong') || (action.includes('open') && action.includes('long'))) return 'long';

  const side = fieldString(row, ['side', 'order_side', 'direction', 'order_direction']).toLowerCase();
  if (side.includes('short') || side.includes('sell') || side.includes('ask')) return 'short';
  if (side.includes('long') || side.includes('buy') || side.includes('bid')) return 'long';
  return Number(row?.size ?? 0) < 0 ? 'short' : 'long';
}

function fillPnl(row) {
  const raw = Number(row?.realized_pnl_amount ?? row?.realized_pnl ?? row?.realised_pnl ?? row?.pnl);
  return Number.isFinite(raw) ? raw : 0;
}

function tradeFillId(row) {
  return fieldString(row, ['trade_id', 'tradeId', 'fill_id', 'fillId', 'id']);
}

function tradeFillTimeMs(row) {
  const value = Number(row?.transaction_unix_ms ?? row?.transactionUnixMs ?? row?.unix_ms ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function exactFillCutoverMs(store = db, opts = {}) {
  const explicit = Number(opts.cutoverMs ?? process.env.DECIBEL_EXACT_FILL_CUTOVER_MS);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const stored = Number(store.getDexWorkerState('decibel', DECIBEL_EXACT_FILL_CUTOVER_KEY, 0));
  if (Number.isFinite(stored) && stored > 0) return stored;
  const initialized = Number(opts.nowMs || Date.now());
  store.setDexWorkerState('decibel', DECIBEL_EXACT_FILL_CUTOVER_KEY, String(initialized));
  return initialized;
}

function exactFillCursorKey(subAddr) {
  return `${DECIBEL_EXACT_FILL_CURSOR_PREFIX}${decibel.normalizeAptosAddress(subAddr)}`;
}

function exactFillScanWindow(store, subAddr, opts = {}) {
  const cutoverMs = exactFillCutoverMs(store, opts);
  const cursorMs = Number(store.getDexWorkerState(
    'decibel',
    exactFillCursorKey(subAddr),
    cutoverMs,
  ));
  const safeCursorMs = Number.isFinite(cursorMs) && cursorMs >= cutoverMs ? cursorMs : cutoverMs;
  const overlapMs = Math.max(0, Number(opts.overlapMs ?? DECIBEL_EXACT_FILL_OVERLAP_MS));
  return {
    cutoverMs,
    cursorMs: safeCursorMs,
    scanFromMs: Math.max(cutoverMs, safeCursorMs - overlapMs),
  };
}

async function fetchTradePagesSince(client, subAddr, sinceMs, opts = {}) {
  const pageSize = Math.max(1, Math.min(100, Number(opts.pageSize || DECIBEL_EXACT_FILL_PAGE_SIZE)));
  const maxPages = Math.max(1, Math.min(50, Number(opts.maxPages || DECIBEL_EXACT_FILL_MAX_PAGES)));
  const rows = [];
  let pages = 0;
  let reachedBoundary = false;
  let lastPageWasFull = false;
  let missingTimestamps = 0;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const page = await client.fetchTradeHistory(subAddr, {
      limit: pageSize,
      offset: pageIndex * pageSize,
      sortDir: 'DESC',
      throwOnError: true,
    });
    if (!Array.isArray(page)) throw new Error('Decibel trade_history returned a non-array page');
    pages++;
    if (!page.length) {
      reachedBoundary = true;
      lastPageWasFull = false;
      break;
    }
    lastPageWasFull = page.length === pageSize;
    rows.push(...page);
    const times = page.map(tradeFillTimeMs).filter(Number.isFinite);
    missingTimestamps += page.length - times.length;
    if (page.length < pageSize || (times.length && Math.min(...times) < sinceMs)) {
      reachedBoundary = true;
      break;
    }
  }
  return {
    rows,
    pages,
    missingTimestamps,
    truncated: !reachedBoundary && lastPageWasFull,
  };
}

async function recordRecentLimitFills(playerId, subAddr, opts = {}) {
  const store = opts.tradeDb || db;
  const client = opts.decibelClient || decibel;
  const window = exactFillScanWindow(store, subAddr, opts);
  let orderHistoryFailed = false;
  const [orders, tradePages, marketMap] = await Promise.all([
    client.fetchOrderHistory(subAddr, {
      limit: DECIBEL_EXACT_FILL_PAGE_SIZE,
      sortDir: 'DESC',
      throwOnError: true,
    }).catch((error) => {
      orderHistoryFailed = true;
      if (DECIBEL_RECONCILE_DEBUG) {
        console.warn(`[decibel-reconcile] order history unavailable for ${shortAddr(subAddr)}: ${error?.message || error}`);
      }
      return [];
    }),
    fetchTradePagesSince(client, subAddr, window.scanFromMs, opts),
    marketsByAddress(client),
  ]);
  const trades = tradePages.rows;
  const filledOrders = Array.isArray(orders)
    ? orders.filter((order) => {
      const status = fieldString(order, ['status', 'order_status', 'orderStatus', 'state']).toLowerCase();
      return status.includes('fill');
    })
    : [];
  const rewardOrderKeySet = new Set();
  const rewardOrderByKey = new Map();
  let eligibleOrderCount = 0;
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!isFilledRewardOrder(order)) continue;
    eligibleOrderCount++;
    for (const key of orderKeys(order)) {
      rewardOrderKeySet.add(key);
      if (!rewardOrderByKey.has(key)) rewardOrderByKey.set(key, order);
    }
  }
  let tradeRowsWithKeys = 0;
  let unmatchedTradeRows = 0;
  for (const trade of Array.isArray(trades) ? trades : []) {
    const keys = orderKeys(trade);
    if (!keys.size) continue;
    tradeRowsWithKeys++;
    if (!Array.from(keys).some((key) => rewardOrderKeySet.has(key))) unmatchedTradeRows++;
  }
  const stats = {
    imported: 0,
    updated: 0,
    matched: 0,
    verified: 0,
    unverified: 0,
    orders: Array.isArray(orders) ? orders.length : 0,
    filled_orders: filledOrders.length,
    eligible_orders: eligibleOrderCount,
    eligible_order_keys: rewardOrderKeySet.size,
    trades: Array.isArray(trades) ? trades.length : 0,
    trade_rows_with_keys: tradeRowsWithKeys,
    unmatched_trade_rows: unmatchedTradeRows,
    pages: tradePages.pages,
    truncated: tradePages.truncated,
    cutover_ms: window.cutoverMs,
    cursor_ms: window.cursorMs,
    scan_from_ms: window.scanFromMs,
    before_cutover: 0,
    before_scan_window: 0,
    missing_fill_id: 0,
    missing_fill_time: tradePages.missingTimestamps,
    existing: 0,
    rejected: 0,
    retryable: 0,
    cursor_advanced: false,
    order_history_failed: orderHistoryFailed,
  };

  const proofByKey = new Map();
  const seenFillIds = new Set();
  for (const fill of Array.isArray(trades) ? trades : []) {
    const fillTimeMs = tradeFillTimeMs(fill);
    if (!fillTimeMs) continue;
    if (fillTimeMs < stats.cutover_ms) {
      stats.before_cutover++;
      continue;
    }
    if (fillTimeMs < stats.scan_from_ms) {
      stats.before_scan_window++;
      continue;
    }
    const fillId = tradeFillId(fill);
    if (!fillId) {
      stats.missing_fill_id++;
      continue;
    }
    if (seenFillIds.has(fillId)) continue;
    seenFillIds.add(fillId);
    const price = Number(fill?.price ?? fill?.fill_price ?? fill?.avg_price ?? 0);
    const sizeAbs = Math.abs(Number(fill?.size ?? fill?.filled_size ?? fill?.base_size ?? 0));
    const notional = Number.isFinite(price) && Number.isFinite(sizeAbs) ? price * sizeAbs : 0;
    if (!Number.isFinite(notional) || notional < MIN_RECORDED_NOTIONAL_USD) continue;

    const clientOrderId = `decibel:trade-fill:${fillId}`;
    const existing = store.getTradeByClientOrderId(playerId, 'decibel', clientOrderId);
    if (existing?.verified_source === 'decibel_fill') {
      stats.existing++;
      continue;
    }

    const fillKeys = Array.from(orderKeys(fill));
    let matchingKey = '';
    let proof = null;
    for (const key of fillKeys) {
      const candidate = proofByKey.has(key) ? proofByKey.get(key) : proofForOrderKey(key, store);
      proofByKey.set(key, candidate || null);
      if (isAllowedStoredOrderProof(candidate, subAddr)) {
        matchingKey = key;
        proof = candidate;
        break;
      }
    }
    const orderKey = fillKeys.find((key) => rewardOrderKeySet.has(key)) || '';
    const order = orderKey ? rewardOrderByKey.get(orderKey) || null : null;
    matchingKey ||= orderKey || fillKeys[0] || '';
    // Bulk maker fills also appear in regular trade_history. Only accept a
    // regular fill when it is tied to our stored order proof or a matching
    // non-bulk order-history row; the bulk worker owns all other maker fills.
    if (!proof && !order) continue;

    if (!proof && order) {
      try {
        proof = await proofFromOrderTx(playerId, subAddr, order, marketMap, store, client);
      } catch (e) {
        console.warn(`[decibel-rewards-worker] on-chain proof failed for ${matchingKey}:`, e.message);
      }
    }
    if (proof && !isAllowedStoredOrderProof(proof, subAddr)) proof = null;
    if (!proof) {
      try {
        const fillProof = await proofFromFillTx(fill, subAddr, client);
        if (fillProof.verified) {
          proof = fillProof;
        } else if (fillProof.retryable) {
          stats.retryable++;
          continue;
        } else {
          stats.rejected++;
          continue;
        }
      } catch (error) {
        stats.retryable++;
        console.warn(`[decibel-rewards-worker] fill transaction unavailable trade_id=${fillId}:`, error?.message || error);
        continue;
      }
    }
    stats.matched++;
    if (matchingKey) proofByKey.set(matchingKey, proof);
    const side = sideFromFill(fill);
    const fee = Number(fill?.fee_amount ?? fill?.fee ?? 0);
    const proofJson = JSON.stringify({
      source: 'decibel_trade_fill_v2',
      trade_id: fillId,
      builder: proof.builder_addr,
      builder_fee_bps: proof.builder_fee_bps ?? null,
      builder_distributed_fee: proof.builder_distributed_fee ?? null,
      subaccount: subAddr,
      matched_key: matchingKey || null,
      proof_id: proof.id || null,
      original_client_order_id: proof.client_order_id
        || fieldString(fill, ['client_order_id', 'clientOrderId', 'clientOrderID'])
        || null,
      original_order_id: proof.order_id
        || fieldString(fill, ['order_id', 'orderId', 'orderID'])
        || null,
      order_tx_hash: proof.tx_hash,
      order_proof_json: proof.proof_json || null,
      transaction_version: fieldString(fill, ['transaction_version', 'transactionVersion']) || null,
      transaction_unix_ms: fillTimeMs,
      verification: proof.proof_json ? 'stored_order_proof' : 'aptos_trade_event',
    });
    const r = store.upsertVerifiedTrade(playerId, {
      symbol: symbolFromFill(fill, marketMap),
      side,
      orderType: proof.order_type || (order ? rewardOrderType(order, side) : 'market'),
      amount: String(sizeAbs),
      price: String(price),
      // Decibel order ids exceed SQLite's exact INTEGER range. The canonical
      // string remains in client_order_id/proof_json; do not coerce it to REAL.
      orderId: null,
      clientOrderId,
      status: 'filled',
      dex: 'decibel',
      notional_usd: notional,
      verifiedSource: 'decibel_fill',
      pnl: String(side).startsWith('close_') ? fillPnl(fill) : null,
      fee: Number.isFinite(fee) ? fee : (proof.fee_usd ?? null),
      proofJson,
      createdAt: new Date(fillTimeMs).toISOString(),
    });
    stats.imported += Number(r.inserted || 0);
    stats.updated += Number(r.updated || 0);
    stats.verified++;
  }

  const cursorCanAdvance = !stats.truncated
    && !stats.order_history_failed
    && stats.retryable === 0
    && stats.missing_fill_id === 0
    && stats.missing_fill_time === 0;
  if (cursorCanAdvance) {
    const nowMs = Number(opts.nowMs || Date.now());
    store.setDexWorkerState('decibel', exactFillCursorKey(subAddr), String(nowMs));
    stats.cursor_advanced = true;
  } else {
    console.warn(`[decibel-reconcile] cursor held player=${String(playerId).slice(0, 8)} sub=${shortAddr(subAddr)} truncated=${stats.truncated} order_history_failed=${stats.order_history_failed} retryable=${stats.retryable} missing_fill_id=${stats.missing_fill_id} missing_fill_time=${stats.missing_fill_time}`);
  }
  if (DECIBEL_RECONCILE_DEBUG) {
    console.log(`[decibel-reconcile] player=${playerId} sub=${shortAddr(subAddr)} pages=${stats.pages} truncated=${stats.truncated} orders=${stats.orders} filled_orders=${stats.filled_orders} eligible_orders=${stats.eligible_orders} trades=${stats.trades} matched=${stats.matched} existing=${stats.existing} inserted=${stats.imported} updated=${stats.updated} verified=${stats.verified} rejected=${stats.rejected} retryable=${stats.retryable} cursor_advanced=${stats.cursor_advanced} kinds=${JSON.stringify(countKinds(orders))}`);
  }
  return opts.details ? stats : stats.imported + stats.updated;
}

async function importRecentLimitFillsForPlayer(playerId, ownerAddr) {
  const addr = String(ownerAddr || '').toLowerCase();
  if (!playerId || !/^0x[0-9a-f]{1,64}$/.test(addr)) {
    return { imported: 0, skipped: 'missing_player_or_aptos_wallet' };
  }
  const subAddr = await resolveSubaccount(addr);
  if (!subAddr) {
    return { imported: 0, skipped: 'missing_decibel_subaccount' };
  }
  const stats = await recordRecentLimitFills(playerId, subAddr, { details: true });
  return { ...stats, subaccount: subAddr };
}

async function importRecentBulkFillsForPlayer(playerId, subaccountAddr, options = {}) {
  const subAddr = decibel.normalizeAptosAddress(subaccountAddr);
  if (!playerId || !/^0x[0-9a-f]{64}$/.test(subAddr)) {
    return { imported: 0, skipped: 'missing_player_or_decibel_subaccount' };
  }
  return decibelBulkRewards.recordRecentBulkFills(playerId, subAddr, options);
}

async function pollOnce(mainDb) {
  const rows = mainDb.prepare(
    `SELECT DISTINCT p.id, COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) AS wallet
       FROM players p
       LEFT JOIN player_dex_accounts pda
         ON pda.player_id = p.id AND pda.dex = 'decibel'
      WHERE (p.dex = 'decibel' OR pda.dex = 'decibel')`
  ).all();
  if (!rows.length) return 0;

  let creditsQueued = 0;
  for (const row of rows) {
    const addr = String(row.wallet || '').toLowerCase();
    // Aptos addresses are "0x" + up to 64 hex. Reject anything that
    // doesn't look like one so a stray Solana / EVM row doesn't waste a
    // round-trip.
    let subAddr = '';
    if (/^0x[0-9a-f]{1,64}$/.test(addr)) {
      // Decibel positions are keyed by SUBACCOUNT address, not master wallet.
      // Resolve a browser-owned Aptos master wallet first. Many MM-bot users
      // authenticate to Clash with an EVM wallet, so this lookup can be empty.
      subAddr = await resolveSubaccount(addr);
    }
    if (!subAddr) {
      // Phantom is authoritative for the bot's Decibel subaccount. The
      // trusted localhost endpoint is tenant-scoped by the Clash player id;
      // no exchange secret is returned or logged here.
      subAddr = await decibelBulkRewards.resolvePhantomDecibelSubaccount(row.id);
    }
    if (!subAddr) continue;
    const trackingAddr = decibel.normalizeAptosAddress(subAddr);
    try {
      const bulk = await decibelBulkRewards.recordRecentBulkFills(row.id, trackingAddr);
      creditsQueued += Number(bulk.imported || 0) + Number(bulk.updated || 0);
      if (bulk.imported || bulk.updated || bulk.rejected) {
        console.log(`[decibel-bulk-reconcile] player=${String(row.id).slice(0, 8)} fetched=${bulk.fetched} eligible=${bulk.eligible} verified=${bulk.verified} inserted=${bulk.imported} updated=${bulk.updated} existing=${bulk.existing} rejected=${bulk.rejected} volume_usd=${bulk.volume_usd}`);
      }
    } catch (e) {
      console.warn(`[decibel-rewards-worker] bulk fill history failed for player=${String(row.id).slice(0, 8)}:`, e.message);
    }
    try {
      creditsQueued += await recordRecentLimitFills(row.id, trackingAddr);
    } catch (e) {
      console.warn(`[decibel-rewards-worker] limit fill history failed for player=${String(row.id).slice(0, 8)}:`, e.message);
    }
    const positions = await decibel.fetchAccountPositions(trackingAddr);
    const currentKeys = new Set(positions.map(decibel.tradeKey));
    const richPrev = seenOpenTrades.get(trackingAddr) instanceof Map
      ? seenOpenTrades.get(trackingAddr)
      : new Map();

    // ── Detect new opens ──
    for (const p of positions) {
      const k = decibel.tradeKey(p);
      if (richPrev.has(k)) continue;

      const collateral = decibel.positionCollateralUsd(p);
      const leverage = decibel.positionLeverage(p);
      const notional = decibel.positionNotionalUsd(p);
      const symbol = decibel.symbolFromMarket(p);
      const isLong = decibel.positionIsLong(p);
      const market = decibel.positionMarket(p);
      const side = isLong ? 'long' : 'short';
      // Entry price + abs size needed at CLOSE time so we can estimate
      // realized PnL = sizeAbs * (mark - entry) signed by side. Without
      // these the PnL column stays NULL and the tournament leaderboard's
      // pnl_usd column is permanently zero for Decibel users.
      const entryPrice = Number(p?.entry_price ?? p?.entryPrice ?? 0);
      const sizeAbs = Math.abs(Number(p?.size ?? 0));

      const openKey = `decibel:open:${trackingAddr}:${market}:${isLong ? 'L' : 'S'}`;
      if (Number.isFinite(notional) && notional >= MIN_RECORDED_NOTIONAL_USD) {
        try {
          db.addTrade(row.id, {
            symbol,
            side,
            orderType: 'market',
            amount: String(collateral),
            orderId: openKey,
            clientOrderId: openKey,
            status: 'filled',
            dex: 'decibel',
            notional_usd: notional,
            verifiedSource: 'worker',
          });
          creditsQueued++;
        } catch (e) {
          if (!String(e.message).includes('UNIQUE')) {
            console.error('[decibel-rewards-worker] add open trade failed:', e.message);
          }
        }
      }
      richPrev.set(k, {
        collateral, leverage, notional, symbol, side,
        market, isLong,
        entryPrice, sizeAbs,
        opened_at: Date.now(),
      });
    }

    // ── Detect closes (positions that vanished since last poll) ──
    // PHANTOM-CLOSE GUARD: if the REST call failed/returned empty AND we
    // had positions last tick, every previously-seen position would be
    // misclassified as closed → fake close rows + double-counted volume.
    // Skip the whole close-detection pass on a likely-dropped poll.
    const pollLooksDropped = positions.length === 0 && richPrev.size > 0;
    if (pollLooksDropped) {
      // Don't mutate richPrev — keep the prior positions as still-open so
      // the next poll can confirm the real state instead of writing a
      // burst of phantom closes.
      seenOpenTrades.set(trackingAddr, richPrev);
      continue;
    }
    for (const k of Array.from(richPrev.keys())) {
      if (currentKeys.has(k)) continue;
      const info = richPrev.get(k);
      richPrev.delete(k);
      if (!info || !Number.isFinite(info.notional) || info.notional < MIN_RECORDED_NOTIONAL_USD) continue;
      const closeKey = `decibel:close:${trackingAddr}:${info.market}:${info.isLong ? 'L' : 'S'}`;
      const closeSide = info.side === 'long' ? 'close_long' : 'close_short';
      // Best-effort PnL estimate: sizeAbs * (mark - entry), signed.
      // Mark is fetched from /api/v1/markets (10-min cached, so this is
      // cheap). The estimate is approximate — actual close fill may
      // diverge by slippage — but it's enough to populate the tournament
      // leaderboard and the per-$10-profit gold pool. For accurate values
      // we'd need to query Decibel's user trade-history endpoint per
      // close, which is a bigger refactor for marginal precision.
      let pnl = null;
      try {
        if (info.entryPrice > 0 && info.sizeAbs > 0) {
          const mark = await decibel.fetchMarketMarkUsd(info.market);
          if (mark > 0) {
            const rawPnl = info.sizeAbs * (mark - info.entryPrice) * (info.isLong ? 1 : -1);
            if (Number.isFinite(rawPnl)) pnl = rawPnl.toFixed(6);
          }
        }
      } catch (e) {
        console.warn(`[decibel-rewards-worker] mark fetch failed for ${info.symbol}:`, e.message);
      }
      try {
        db.addTrade(row.id, {
          symbol: info.symbol,
          side: closeSide,
          orderType: 'close',
          amount: String(info.collateral),
          orderId: closeKey,
          clientOrderId: closeKey,
          status: 'filled',
          dex: 'decibel',
          notional_usd: info.notional,
          verifiedSource: 'worker',
          pnl,
        });
        creditsQueued++;
      } catch (e) {
        if (!String(e.message).includes('UNIQUE')) {
          console.error('[decibel-rewards-worker] addTrade(close) failed:', e.message);
        }
      }
    }

    seenOpenTrades.set(trackingAddr, richPrev);
  }
  return creditsQueued;
}

function start() {
  const exactFillCutover = exactFillCutoverMs(db);
  let mainDb;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.error('[decibel-rewards-worker] Cannot open main DB:', e.message, '— worker disabled.');
    return;
  }

  let tickInFlight = false;
  const tick = async () => {
    if (tickInFlight) {
      if (DECIBEL_RECONCILE_DEBUG) {
        console.warn('[decibel-rewards-worker] skipped overlapping tick');
      }
      return;
    }
    tickInFlight = true;
    try {
      const n = await pollOnce(mainDb);
      if (n > 0) console.log(`[decibel-rewards-worker] Recorded ${n} Decibel trade row(s)`);
    } catch (e) {
      console.error('[decibel-rewards-worker] tick failed:', e?.message || e);
    } finally {
      tickInFlight = false;
    }
  };

  // Stagger first run by 30 s so we don't pile on the Avantis worker's
  // initial burst. After that, fire every POLL_MS.
  setTimeout(tick, 30_000);
  setInterval(tick, POLL_MS);
  console.log(`[decibel-rewards-worker] started, polling every ${POLL_MS / 1000} s, exact-fill cutover=${new Date(exactFillCutover).toISOString()}`);
}

module.exports = {
  start,
  pollOnce,
  importRecentLimitFillsForPlayer,
  importRecentBulkFillsForPlayer,
  __test: {
    isFilledRewardOrder,
    rewardOrderType,
    orderKeys,
    tradeFillId,
    tradeFillTimeMs,
    exactFillCutoverMs,
    recordRecentLimitFills,
  },
};
