import { getReadClient } from './decibel';

const DECIBEL_REALTIME_WS_ENABLED = !/^(0|false|no|off)$/i.test(
  String(import.meta.env?.VITE_DECIBEL_REALTIME_WS_ENABLED ?? 'true').trim(),
);

const emptySnapshot = {
  status: 'idle',
  prices: [],
  account: null,
  positions: null,
  orders: null,
  orderUpdate: null,
  trades: null,
  pricesAt: 0,
  accountAt: 0,
  positionsAt: 0,
  ordersAt: 0,
  orderUpdateAt: 0,
  tradesAt: 0,
  statusAt: 0,
  error: null,
};

let snapshot = { ...emptySnapshot };
const listeners = new Set();
let priceUnsub = null;
let accountUnsubs = [];
let activeSubaccount = '';
let activeStartToken = 0;

function now() {
  return Date.now();
}

function logRealtime(message, data) {
  try {
    console.log('[Decibel realtime]', message, data || '');
  } catch {
    // noop
  }
}

function emit(patch) {
  snapshot = {
    ...snapshot,
    ...patch,
    statusAt: patch.status ? now() : snapshot.statusAt,
  };
  for (const listener of Array.from(listeners)) {
    try { listener(snapshot); } catch (e) { console.warn('[decibel realtime] listener failed:', e); }
  }
}

function safeUnsub(fn) {
  try { if (typeof fn === 'function') fn(); } catch {}
}

function stopAccountTopics() {
  for (const unsub of accountUnsubs) safeUnsub(unsub);
  accountUnsubs = [];
  activeSubaccount = '';
}

function pushUnsub(fn) {
  if (typeof fn === 'function') accountUnsubs.push(fn);
}

function normalizeSubaccount(value) {
  return String(value || '').trim().toLowerCase();
}

function rowsFromPayload(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.items)) return payload.data.items;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function firstFromPayload(payload, keys = []) {
  if (!payload || typeof payload !== 'object') return payload || null;
  for (const key of keys) {
    const value = payload[key];
    if (value && typeof value === 'object') return value;
  }
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) return payload.data;
  return payload;
}

export function isDecibelRealtimeEnabled() {
  return DECIBEL_REALTIME_WS_ENABLED;
}

export function getDecibelRealtimeSnapshot() {
  return snapshot;
}

export function subscribeDecibelRealtime(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  try { listener(snapshot); } catch {}
  return () => {
    listeners.delete(listener);
  };
}

export async function startDecibelRealtime({ subaccountAddr = '' } = {}) {
  if (!DECIBEL_REALTIME_WS_ENABLED) {
    logRealtime('disabled by env flag');
    emit({ status: 'disabled', error: null });
    return false;
  }

  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    logRealtime('unavailable: missing browser WebSocket');
    emit({ status: 'unavailable', error: 'WebSocket is unavailable in this browser' });
    return false;
  }

  const startToken = ++activeStartToken;
  logRealtime('connecting', { subaccount: normalizeSubaccount(subaccountAddr) });
  emit({ status: 'connecting', error: null });
  let read;
  try {
    read = await getReadClient();
  } catch (e) {
    logRealtime('read client init failed', { error: e?.message || String(e || '') });
    emit({ status: 'error', error: e?.message || String(e || 'Decibel realtime init failed') });
    return false;
  }
  if (startToken !== activeStartToken) return false;

  try {
    if (!priceUnsub && read?.marketPrices?.subscribeAll) {
      logRealtime('subscribe prices');
      priceUnsub = read.marketPrices.subscribeAll((payload) => {
        const rows = rowsFromPayload(payload, ['prices', 'market_prices', 'marketPrices']);
        logRealtime('prices snapshot', { count: rows.length });
        emit({ status: 'open', prices: rows, pricesAt: now(), error: null });
      });
    }

    const nextSub = normalizeSubaccount(subaccountAddr);
    if (nextSub && nextSub !== activeSubaccount) {
      stopAccountTopics();
      activeSubaccount = nextSub;
      if (read?.accountOverview?.subscribeByAddr) {
        logRealtime('subscribe account', { subaccount: nextSub });
        pushUnsub(read.accountOverview.subscribeByAddr(nextSub, (payload) => {
          emit({ status: 'open', account: payload?.account_overview || payload || null, accountAt: now(), error: null });
        }));
      }
      if (read?.userPositions?.subscribeByAddr) {
        logRealtime('subscribe positions', { subaccount: nextSub });
        pushUnsub(read.userPositions.subscribeByAddr(nextSub, (payload) => {
          const positions = rowsFromPayload(payload, ['positions', 'account_positions', 'accountPositions']);
          logRealtime('positions snapshot', { subaccount: nextSub, count: positions.length });
          emit({ status: 'open', positions, positionsAt: now(), error: null });
        }));
      }
      if (read?.userOpenOrders?.subscribeByAddr) {
        logRealtime('subscribe open orders', { subaccount: nextSub });
        pushUnsub(read.userOpenOrders.subscribeByAddr(nextSub, (payload) => {
          const orders = rowsFromPayload(payload, ['orders', 'open_orders', 'openOrders']);
          logRealtime('orders snapshot', { subaccount: nextSub, count: orders.length });
          emit({ status: 'open', orders, ordersAt: now(), error: null });
        }));
      }
      if (read?.userOrderHistory?.subscribeByAddr) {
        logRealtime('subscribe order history', { subaccount: nextSub });
        pushUnsub(read.userOrderHistory.subscribeByAddr(nextSub, (payload) => {
          const order = firstFromPayload(payload, ['order', 'order_update', 'orderUpdate']);
          logRealtime('order history update', { subaccount: nextSub, has_order: !!order });
          emit({ status: 'open', orderUpdate: order, orderUpdateAt: now(), error: null });
        }));
      }
      if (read?.userTradeHistory?.subscribeByAddr) {
        logRealtime('subscribe trade history', { subaccount: nextSub });
        pushUnsub(read.userTradeHistory.subscribeByAddr(nextSub, (payload) => {
          const trades = rowsFromPayload(payload, ['trades', 'trade_history', 'tradeHistory', 'fills']);
          logRealtime('trade history update', { subaccount: nextSub, count: trades.length });
          emit({ status: 'open', trades, tradesAt: now(), error: null });
        }));
      }
    } else if (!nextSub) {
      logRealtime('stop account topics: empty subaccount');
      stopAccountTopics();
    }

    logRealtime('open', { subaccount: nextSub || null });
    emit({ status: 'open', error: null });
    return true;
  } catch (e) {
    logRealtime('subscription failed', { error: e?.message || String(e || '') });
    emit({ status: 'error', error: e?.message || String(e || 'Decibel realtime subscription failed') });
    return false;
  }
}

export function stopDecibelRealtime() {
  logRealtime('stop');
  activeStartToken += 1;
  safeUnsub(priceUnsub);
  priceUnsub = null;
  stopAccountTopics();
  snapshot = { ...emptySnapshot, status: 'closed', statusAt: now() };
  emit({});
}
