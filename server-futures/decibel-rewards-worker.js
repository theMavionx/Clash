// Decibel rewards worker — periodic polling of Decibel REST for all
// registered Decibel traders. Detects newly-opened and newly-closed
// positions and writes verified rows into `trade_history` so /claim-gold
// can credit gold by volume.
//
// Mirrors the avantis-rewards-worker contract:
//   • read-only by public address (Aptos master wallet stored in
//     players.wallet for dex='decibel')
//   • computes notional from Decibel's signed human `size` × `entry_price`
//   • emits two trade rows per position lifecycle (open + close) with
//     deterministic dedup keys: `decibel:open:<addr>:<market>:<side>` and
//     `decibel:close:<addr>:<market>:<side>`. UNIQUE partial index in
//     futures.db dedupes against client-side reportTrade.
//
// Polling cadence: 2 minutes — same as Avantis. Slightly faster than
// Decibel's indexer ingest time (~30 s) so we don't miss flash-closed
// positions, but slow enough not to hammer their public API.

const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');
const decibel = require('./decibel');

const POLL_MS = 2 * 60 * 1000; // 2 minutes
// Record every economically non-zero verified fill. Gold farming protection
// lives in the main server's /claim-gold path, which clamps Decibel rewards
// below $10. Keeping this floor low lets position quests count tiny but real
// meme-market fills such as CHIP without paying gold for them.
const MIN_RECORDED_NOTIONAL_USD = 0.000001;
const DECIBEL_LIMIT_FILL_LOOKBACK = Math.max(
  50,
  Math.min(500, Number(process.env.DECIBEL_LIMIT_FILL_LOOKBACK || 250))
);
const DECIBEL_RECONCILE_DEBUG = String(process.env.DECIBEL_RECONCILE_DEBUG || '1') !== '0';

const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');
const APTOS_FULLNODE = process.env.APTOS_FULLNODE_URL
  || 'https://fullnode.mainnet.aptoslabs.com/v1';
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

function proofForOrderKey(key) {
  const raw = String(key || '');
  if (raw.startsWith('order:')) {
    return db.getDecibelOrderProof({ orderId: raw.slice('order:'.length) });
  }
  if (raw.startsWith('client:')) {
    return db.getDecibelOrderProof({ clientOrderId: raw.slice('client:'.length) });
  }
  return null;
}

async function fetchAptosTxByVersion(version) {
  const raw = String(version || '').trim();
  if (!/^\d+$/.test(raw)) return null;
  if (aptosTxCache.has(raw)) return aptosTxCache.get(raw);
  const url = `${APTOS_FULLNODE.replace(/\/$/, '')}/transactions/by_version/${raw}`;
  const headers = process.env.DECIBEL_API_KEY
    ? { accept: 'application/json', Authorization: `Bearer ${process.env.DECIBEL_API_KEY}` }
    : { accept: 'application/json' };
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`Aptos tx ${raw} failed: ${r.status}`);
  const tx = await r.json();
  if (aptosTxCache.size > 500) aptosTxCache.clear();
  aptosTxCache.set(raw, tx);
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

async function proofFromOrderTx(playerId, subAddr, order, marketMap) {
  const version = txVersionFromOrder(order);
  if (!version) return null;
  const tx = await fetchAptosTxByVersion(version);
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
  db.recordDecibelOrderProof({
    playerId,
    subaccount: subAddr,
    orderId: orderId || null,
    clientOrderId: orderClientId || null,
    symbol: symbolFromFill(order, marketMap),
    side: sideFromFill(order),
    orderType: isTriggerOrTpSlOrder(order) ? 'trigger' : 'limit',
    marketName: fieldString(market || order, ['market_name', 'marketName', 'symbol']) || null,
    marketAddr: txMarket || orderMarket || null,
    builderAddr,
    builderFeeBps,
    txHash: tx?.hash || null,
    proofJson,
  });
  return db.getDecibelOrderProof({ orderId, clientOrderId: orderClientId }) || {
    id: null,
    builder_addr: builderAddr,
    builder_fee_bps: builderFeeBps,
    tx_hash: tx?.hash || null,
    proof_json: proofJson,
    order_id: orderId || null,
    client_order_id: orderClientId || null,
  };
}

function isFilledLimitOrder(row) {
  const status = fieldString(row, ['status', 'order_status', 'orderStatus', 'state']).toLowerCase();
  if (status && !status.includes('fill')) return false;
  const type = fieldString(row, ['order_type', 'orderType', 'type']).toLowerCase();
  const isTriggerOrTpSl = isTriggerOrTpSlOrder(row);
  if ((type.includes('market') || type.includes('ioc')) && !isTriggerOrTpSl) return false;
  if (type.includes('limit')) return true;
  if (isTriggerOrTpSl) return true;
  const tif = fieldString(row, ['time_in_force', 'timeInForce', 'tif']).toLowerCase();
  return tif.includes('good') || tif.includes('gtc');
}

function marketAddress(row) {
  const raw = fieldString(row, ['market', 'market_addr', 'marketAddr', 'market_address']);
  const normalized = decibel.normalizeAptosAddress(raw);
  return normalized && normalized.startsWith('0x') ? normalized : '';
}

async function marketsByAddress() {
  const markets = await decibel.fetchMarkets();
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

function aggregateLimitFills(trades, limitOrderKeySet, limitOrderByKey, marketMap) {
  const groups = new Map();
  for (const fill of Array.isArray(trades) ? trades : []) {
    const keys = orderKeys(fill);
    const matchingKey = Array.from(keys).find(k => limitOrderKeySet.has(k));
    if (!matchingKey) continue;

    const price = Number(fill?.price ?? fill?.fill_price ?? fill?.avg_price ?? 0);
    const sizeAbs = Math.abs(Number(fill?.size ?? fill?.filled_size ?? fill?.base_size ?? 0));
    const notional = Number.isFinite(price) && Number.isFinite(sizeAbs) ? price * sizeAbs : 0;
    if (!Number.isFinite(notional) || notional < MIN_RECORDED_NOTIONAL_USD) continue;

    const side = sideFromFill(fill);
    const key = `${matchingKey}:${side}`;
    const current = groups.get(key) || {
      key,
      proofKey: matchingKey,
      order: limitOrderByKey?.get(matchingKey) || null,
      symbol: symbolFromFill(fill, marketMap),
      side,
      orderId: fieldString(fill, ['order_id', 'orderId', 'orderID']) || matchingKey,
      clientOrderId: `decibel:limit-fill:${matchingKey}:${side}`,
      sizeAbs: 0,
      notional: 0,
      weightedPrice: 0,
      pnl: 0,
      fee: 0,
    };
    current.sizeAbs += sizeAbs;
    current.notional += notional;
    current.weightedPrice += price * sizeAbs;
    current.pnl += fillPnl(fill);
    const fee = Number(fill?.fee_amount ?? fill?.fee ?? 0);
    if (Number.isFinite(fee)) current.fee += fee;
    groups.set(key, current);
  }
  return Array.from(groups.values()).filter(g => g.notional >= MIN_RECORDED_NOTIONAL_USD);
}

async function recordRecentLimitFills(playerId, subAddr, opts = {}) {
  const [orders, trades, marketMap] = await Promise.all([
    decibel.fetchOrderHistory(subAddr, { limit: DECIBEL_LIMIT_FILL_LOOKBACK, sortDir: 'DESC' }),
    decibel.fetchTradeHistory(subAddr, { limit: DECIBEL_LIMIT_FILL_LOOKBACK, sortDir: 'DESC' }),
    marketsByAddress(),
  ]);
  const filledOrders = Array.isArray(orders)
    ? orders.filter((order) => {
      const status = fieldString(order, ['status', 'order_status', 'orderStatus', 'state']).toLowerCase();
      return !status || status.includes('fill');
    })
    : [];
  const limitOrderKeySet = new Set();
  const limitOrderByKey = new Map();
  let eligibleOrderCount = 0;
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!isFilledLimitOrder(order)) continue;
    eligibleOrderCount++;
    for (const key of orderKeys(order)) {
      limitOrderKeySet.add(key);
      if (!limitOrderByKey.has(key)) limitOrderByKey.set(key, order);
    }
  }
  let tradeRowsWithKeys = 0;
  let unmatchedTradeRows = 0;
  for (const trade of Array.isArray(trades) ? trades : []) {
    const keys = orderKeys(trade);
    if (!keys.size) continue;
    tradeRowsWithKeys++;
    if (!Array.from(keys).some((key) => limitOrderKeySet.has(key))) unmatchedTradeRows++;
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
    eligible_order_keys: limitOrderKeySet.size,
    trades: Array.isArray(trades) ? trades.length : 0,
    trade_rows_with_keys: tradeRowsWithKeys,
    unmatched_trade_rows: unmatchedTradeRows,
    lookback: DECIBEL_LIMIT_FILL_LOOKBACK,
  };
  if (!limitOrderKeySet.size) {
    if (DECIBEL_RECONCILE_DEBUG) {
      console.log(`[decibel-reconcile] player=${playerId} sub=${shortAddr(subAddr)} no eligible filled limit/tpsl orders orders=${stats.orders} filled_orders=${stats.filled_orders} trades=${stats.trades} trade_rows_with_keys=${stats.trade_rows_with_keys} kinds=${JSON.stringify(countKinds(orders))}`);
    }
    return opts.details ? stats : 0;
  }

  const aggregatedFills = aggregateLimitFills(trades, limitOrderKeySet, limitOrderByKey, marketMap);
  stats.matched = aggregatedFills.length;
  for (const fill of aggregatedFills) {
    const avgPrice = fill.sizeAbs > 0 ? fill.weightedPrice / fill.sizeAbs : 0;
    const isClose = String(fill.side || '').startsWith('close_');
    let proof = proofForOrderKey(fill.proofKey);
    if (!proof && fill.order) {
      try {
        proof = await proofFromOrderTx(playerId, subAddr, fill.order, marketMap);
      } catch (e) {
        console.warn(`[decibel-rewards-worker] on-chain proof failed for ${fill.proofKey}:`, e.message);
      }
    }
    const proofJson = proof ? JSON.stringify({
      source: 'decibel_trade_history_reconciliation',
      builder: proof.builder_addr,
      builder_fee_bps: proof.builder_fee_bps,
      subaccount: subAddr,
      matched_key: fill.proofKey,
      proof_id: proof.id || null,
      original_client_order_id: proof.client_order_id,
      original_order_id: proof.order_id,
      order_tx_hash: proof.tx_hash,
      order_proof_json: proof.proof_json || null,
    }) : null;
    const r = db.addTrade(playerId, {
      symbol: fill.symbol,
      side: fill.side,
      orderType: isClose ? 'close' : 'limit',
      amount: String(fill.sizeAbs),
      price: Number.isFinite(avgPrice) && avgPrice > 0 ? String(avgPrice) : null,
      orderId: fill.orderId,
      clientOrderId: fill.clientOrderId,
      status: 'filled',
      dex: 'decibel',
      notional_usd: fill.notional,
      verifiedSource: proof ? 'decibel_fill' : 'worker',
      pnl: isClose && Number.isFinite(fill.pnl) ? fill.pnl : null,
      fee: fill.fee,
      proofJson,
    });
    stats.imported += r.changes || 0;
    if (proof) {
      stats.verified++;
      const upgrade = db.upgradeDecibelWorkerTradeByClient({
        clientOrderId: fill.clientOrderId,
        proofJson,
        fee: fill.fee,
      });
      stats.updated += upgrade.changes || 0;
    } else {
      stats.unverified++;
    }
  }
  if (DECIBEL_RECONCILE_DEBUG) {
    console.log(`[decibel-reconcile] player=${playerId} sub=${shortAddr(subAddr)} orders=${stats.orders} filled_orders=${stats.filled_orders} eligible_orders=${stats.eligible_orders} eligible_order_keys=${stats.eligible_order_keys} trades=${stats.trades} trade_rows_with_keys=${stats.trade_rows_with_keys} unmatched_trade_rows=${stats.unmatched_trade_rows} matched=${stats.matched} inserted=${stats.imported} updated=${stats.updated} verified=${stats.verified} unverified=${stats.unverified} kinds=${JSON.stringify(countKinds(orders))}`);
  }
  return opts.details ? stats : stats.imported;
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

async function pollOnce(mainDb) {
  const rows = mainDb.prepare(
    `SELECT DISTINCT p.id, COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) AS wallet
       FROM players p
       LEFT JOIN player_dex_accounts pda
         ON pda.player_id = p.id AND pda.dex = 'decibel'
      WHERE (p.dex = 'decibel' OR pda.dex = 'decibel')
        AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) IS NOT NULL
        AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) != ''`
  ).all();
  if (!rows.length) return 0;

  let creditsQueued = 0;
  for (const row of rows) {
    const addr = String(row.wallet).toLowerCase();
    // Aptos addresses are "0x" + up to 64 hex. Reject anything that
    // doesn't look like one so a stray Solana / EVM row doesn't waste a
    // round-trip.
    if (!/^0x[0-9a-f]{1,64}$/.test(addr)) continue;

    // Decibel positions are keyed by SUBACCOUNT address, not master wallet.
    // Resolve once (cached), then fetch positions for that subaccount.
    // If the player hasn't created a subaccount yet (no Activate step run),
    // skip cleanly until they have one.
    const subAddr = await resolveSubaccount(addr);
    if (!subAddr) continue;
    try {
      creditsQueued += await recordRecentLimitFills(row.id, subAddr);
    } catch (e) {
      console.warn(`[decibel-rewards-worker] limit fill history failed for ${addr.slice(0, 10)}:`, e.message);
    }
    const positions = await decibel.fetchAccountPositions(subAddr);
    const currentKeys = new Set(positions.map(decibel.tradeKey));
    const richPrev = seenOpenTrades.get(addr) instanceof Map
      ? seenOpenTrades.get(addr)
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

      const openKey = `decibel:open:${addr}:${market}:${isLong ? 'L' : 'S'}`;
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
      seenOpenTrades.set(addr, richPrev);
      continue;
    }
    for (const k of Array.from(richPrev.keys())) {
      if (currentKeys.has(k)) continue;
      const info = richPrev.get(k);
      richPrev.delete(k);
      if (!info || !Number.isFinite(info.notional) || info.notional < MIN_RECORDED_NOTIONAL_USD) continue;
      const closeKey = `decibel:close:${addr}:${info.market}:${info.isLong ? 'L' : 'S'}`;
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

    seenOpenTrades.set(addr, richPrev);
  }
  return creditsQueued;
}

function start() {
  let mainDb;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.error('[decibel-rewards-worker] Cannot open main DB:', e.message, '— worker disabled.');
    return;
  }

  const tick = async () => {
    try {
      const n = await pollOnce(mainDb);
      if (n > 0) console.log(`[decibel-rewards-worker] Recorded ${n} Decibel trade row(s)`);
    } catch (e) {
      console.error('[decibel-rewards-worker] tick failed:', e?.message || e);
    }
  };

  // Stagger first run by 30 s so we don't pile on the Avantis worker's
  // initial burst. After that, fire every POLL_MS.
  setTimeout(tick, 30_000);
  setInterval(tick, POLL_MS);
  console.log(`[decibel-rewards-worker] started, polling every ${POLL_MS / 1000} s`);
}

module.exports = { start, pollOnce, importRecentLimitFillsForPlayer };
