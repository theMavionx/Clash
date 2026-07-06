export const DECIBEL_ORDER_REST_REMOVAL_GRACE_MS = 20_000;
export const DECIBEL_OPTIMISTIC_ORDER_TTL_MS = 90_000;

export function makeOptimisticDecibelOrder(fields = {}, now = Date.now()) {
  return {
    dex: 'decibel',
    symbol: String(fields.symbol || '').toUpperCase(),
    side: fields.side || 'bid',
    amount: String(fields.amount ?? ''),
    initial_amount: String(fields.initial_amount ?? fields.amount ?? ''),
    price: String(fields.price ?? ''),
    stop_price: fields.stop_price == null ? '' : String(fields.stop_price),
    leverage: null,
    order_type: fields.order_type || 'Limit',
    reduce_only: !!fields.reduce_only,
    is_tpsl: !!fields.is_tpsl,
    trigger_condition: fields.trigger_condition || '',
    order_direction: fields.order_direction || '',
    take_profit: fields.take_profit == null ? null : String(fields.take_profit),
    stop_loss: fields.stop_loss == null ? null : String(fields.stop_loss),
    tif: fields.tif || 'GTC',
    order_id: fields.order_id ? String(fields.order_id) : '',
    market_addr: fields.market_addr || null,
    market_name: fields.market_name || '',
    client_order_id: fields.client_order_id || null,
    _optimistic: true,
    _optimistic_at: now,
    _raw: {
      ...(fields._raw || {}),
      dex: 'decibel',
      optimistic: true,
      optimistic_at: now,
    },
  };
}

export function decibelOrderStateKey(order) {
  if (!order) return '';
  const orderId = String(order.order_id ?? order.orderId ?? order.id ?? '').trim();
  if (orderId) return `id:${orderId}`;
  const clientOrderId = String(order.client_order_id ?? order.clientOrderId ?? '').trim();
  if (clientOrderId) return `client:${clientOrderId}`;
  return [
    order.symbol || order.s || '',
    order.market_addr || order.marketAddr || order.market || '',
    order.side || order.d || order.order_direction || order.orderDirection || '',
    order.order_type || order.orderType || '',
    order.price || order.limit_price || order.limitPrice || '',
    order.stop_price || order.stopPrice || '',
  ].map(v => String(v || '').toLowerCase()).join(':');
}

export function decibelOrdersEquivalentForOptimistic(pending, confirmed, helpers = {}) {
  if (!pending || !confirmed || !pending._optimistic) return false;
  const sameAddress = helpers.sameAddress || ((a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase());
  const tpslKindFromOrder = helpers.tpslKindFromOrder || (() => '');
  const tpslPriceFromOrder = helpers.tpslPriceFromOrder || ((order) => order?.stop_price ?? order?.price);

  const pendingSymbol = String(pending.symbol || '').toUpperCase();
  const confirmedSymbol = String(confirmed.symbol || '').toUpperCase();
  if (pendingSymbol && confirmedSymbol && pendingSymbol !== confirmedSymbol) return false;
  if (
    pending.market_addr
    && confirmed.market_addr
    && !sameAddress(pending.market_addr, confirmed.market_addr)
  ) {
    return false;
  }
  const pendingKind = tpslKindFromOrder(pending) || String(pending.order_type || '').toLowerCase();
  const confirmedKind = tpslKindFromOrder(confirmed) || String(confirmed.order_type || '').toLowerCase();
  if (pendingKind && confirmedKind && pendingKind !== confirmedKind) return false;
  const pendingPrice = Number(tpslPriceFromOrder(pending) ?? pending.price ?? 0);
  const confirmedPrice = Number(tpslPriceFromOrder(confirmed) ?? confirmed.price ?? 0);
  if (pendingPrice > 0 && confirmedPrice > 0) {
    return Math.abs(pendingPrice - confirmedPrice) <= Math.max(0.01, pendingPrice * 0.00001);
  }
  return true;
}

export function mergeDecibelOrderSnapshot({
  previousOrders = [],
  rawOrders = [],
  normalizeOrder,
  source = 'unknown',
  options = {},
  meta = new Map(),
  now = Date.now(),
  helpers = {},
} = {}) {
  const raw = Array.isArray(rawOrders) ? rawOrders : (Array.isArray(rawOrders?.data) ? rawOrders.data : []);
  const normalize = typeof normalizeOrder === 'function' ? normalizeOrder : (order) => order;
  const authoritative = !!options.authoritative || source === 'realtime-orders';
  const mergeOnly = !!options.mergeOnly || source.startsWith('optimistic-');
  const norm = raw.map(normalize);
  const previousByKey = new Map((previousOrders || [])
    .map(order => [decibelOrderStateKey(order), order])
    .filter(([key]) => !!key));
  const incomingKeys = new Set();
  const nextByKey = new Map();

  for (const order of norm) {
    const key = decibelOrderStateKey(order);
    if (!key) continue;
    incomingKeys.add(key);
    const previous = previousByKey.get(key);
    if (order.leverage == null && previous?.leverage != null) {
      order.leverage = previous.leverage;
    }
    nextByKey.set(key, order);
    meta.set(key, {
      ...(meta.get(key) || {}),
      lastSeenAt: now,
      missingSince: 0,
    });
  }

  for (const [key, previous] of previousByKey.entries()) {
    if (incomingKeys.has(key)) continue;
    if (previous?._optimistic && norm.some(order => decibelOrdersEquivalentForOptimistic(previous, order, helpers))) {
      meta.delete(key);
      continue;
    }
    const prevMeta = meta.get(key) || {};
    if (!prevMeta.missingSince) prevMeta.missingSince = now;
    const optimisticAt = Number(previous?._optimistic_at || previous?._raw?.optimistic_at || 0);
    const keepBecauseOptimistic = previous?._optimistic
      && optimisticAt > 0
      && now - optimisticAt < DECIBEL_OPTIMISTIC_ORDER_TTL_MS;
    const keepBecauseRestLag = !authoritative
      && now - prevMeta.missingSince < DECIBEL_ORDER_REST_REMOVAL_GRACE_MS;
    if (mergeOnly || keepBecauseOptimistic || keepBecauseRestLag) {
      nextByKey.set(key, {
        ...previous,
        _stale_in_latest_snapshot: !mergeOnly,
      });
      meta.set(key, prevMeta);
    } else {
      meta.delete(key);
    }
  }

  const orders = Array.from(nextByKey.values());
  return {
    orders,
    raw,
    normalized: norm,
    meta,
    authoritative,
    mergeOnly,
    retainedMissingCount: orders.filter(o => o._stale_in_latest_snapshot).length,
    optimisticCount: orders.filter(o => o._optimistic).length,
  };
}
