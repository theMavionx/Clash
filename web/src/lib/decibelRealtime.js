import { getReadClient } from './decibel';

const DECIBEL_REALTIME_WS_ENABLED = /^(1|true|yes)$/i.test(
  String(import.meta.env?.VITE_DECIBEL_REALTIME_WS_ENABLED || '').trim(),
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
    emit({ status: 'disabled', error: null });
    return false;
  }

  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    emit({ status: 'unavailable', error: 'WebSocket is unavailable in this browser' });
    return false;
  }

  const startToken = ++activeStartToken;
  emit({ status: 'connecting', error: null });
  let read;
  try {
    read = await getReadClient();
  } catch (e) {
    emit({ status: 'error', error: e?.message || String(e || 'Decibel realtime init failed') });
    return false;
  }
  if (startToken !== activeStartToken) return false;

  try {
    if (!priceUnsub && read?.marketPrices?.subscribeAll) {
      priceUnsub = read.marketPrices.subscribeAll((payload) => {
        const rows = Array.isArray(payload?.prices) ? payload.prices : [];
        emit({ status: 'open', prices: rows, pricesAt: now(), error: null });
      });
    }

    const nextSub = normalizeSubaccount(subaccountAddr);
    if (nextSub && nextSub !== activeSubaccount) {
      stopAccountTopics();
      activeSubaccount = nextSub;
      if (read?.accountOverview?.subscribeByAddr) {
        pushUnsub(read.accountOverview.subscribeByAddr(nextSub, (payload) => {
          emit({ status: 'open', account: payload?.account_overview || payload || null, accountAt: now(), error: null });
        }));
      }
      if (read?.userPositions?.subscribeByAddr) {
        pushUnsub(read.userPositions.subscribeByAddr(nextSub, (payload) => {
          emit({ status: 'open', positions: Array.isArray(payload?.positions) ? payload.positions : [], positionsAt: now(), error: null });
        }));
      }
      if (read?.userOpenOrders?.subscribeByAddr) {
        pushUnsub(read.userOpenOrders.subscribeByAddr(nextSub, (payload) => {
          emit({ status: 'open', orders: Array.isArray(payload?.orders) ? payload.orders : [], ordersAt: now(), error: null });
        }));
      }
      if (read?.userOrderHistory?.subscribeByAddr) {
        pushUnsub(read.userOrderHistory.subscribeByAddr(nextSub, (payload) => {
          emit({ status: 'open', orderUpdate: payload?.order || payload || null, orderUpdateAt: now(), error: null });
        }));
      }
      if (read?.userTradeHistory?.subscribeByAddr) {
        pushUnsub(read.userTradeHistory.subscribeByAddr(nextSub, (payload) => {
          emit({ status: 'open', trades: Array.isArray(payload?.trades) ? payload.trades : [], tradesAt: now(), error: null });
        }));
      }
    } else if (!nextSub) {
      stopAccountTopics();
    }

    emit({ status: 'open', error: null });
    return true;
  } catch (e) {
    emit({ status: 'error', error: e?.message || String(e || 'Decibel realtime subscription failed') });
    return false;
  }
}

export function stopDecibelRealtime() {
  activeStartToken += 1;
  safeUnsub(priceUnsub);
  priceUnsub = null;
  stopAccountTopics();
  snapshot = { ...emptySnapshot, status: 'closed', statusAt: now() };
  emit({});
}
