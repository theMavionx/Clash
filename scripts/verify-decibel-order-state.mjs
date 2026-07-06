import assert from 'node:assert/strict';
import {
  decibelOrderStateKey,
  makeOptimisticDecibelOrder,
  mergeDecibelOrderSnapshot,
} from '../web/src/lib/decibelOrderState.js';

const MARKET = '0xabc';

function kind(order) {
  if (order.take_profit != null) return 'tp';
  if (order.stop_loss != null) return 'sl';
  return String(order.order_type || '').toLowerCase();
}

function price(order) {
  return order.take_profit ?? order.stop_loss ?? order.stop_price ?? order.price;
}

function merge(previousOrders, rawOrders, source, meta, now, options = {}) {
  return mergeDecibelOrderSnapshot({
    previousOrders,
    rawOrders,
    normalizeOrder: order => order,
    source,
    options,
    meta,
    now,
    helpers: {
      sameAddress: (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase(),
      tpslKindFromOrder: kind,
      tpslPriceFromOrder: price,
    },
  });
}

{
  const meta = new Map();
  const pending = makeOptimisticDecibelOrder({
    symbol: 'ETH',
    side: 'ask',
    amount: 0.004,
    price: 1790,
    order_type: 'Limit',
    order_direction: 'Open Short',
    market_addr: MARKET,
    market_name: 'ETH-USD',
    client_order_id: 'clash-limit-1',
  }, 1_000);

  let state = merge([], [pending], 'optimistic-limit', meta, 1_000, { mergeOnly: true });
  assert.equal(state.orders.length, 1, 'optimistic limit should appear immediately');
  assert.equal(state.orders[0]._optimistic, true, 'optimistic limit should be marked pending');

  state = merge(state.orders, [], 'fetchOrders:server', meta, 2_000);
  assert.equal(state.orders.length, 1, 'early empty REST snapshot must not erase pending limit');
  assert.equal(state.retainedMissingCount, 1, 'early empty REST snapshot should be tracked as retained missing');

  state = merge(state.orders, [{
    dex: 'decibel',
    symbol: 'ETH',
    side: 'ask',
    amount: '0.004',
    price: '1790',
    order_type: 'Limit',
    order_direction: 'Open Short',
    market_addr: MARKET,
    market_name: 'ETH-USD',
    order_id: '0x5e0e16',
  }], 'fetchOrders:server', meta, 3_000);
  assert.equal(state.orders.length, 1, 'confirmed limit should replace pending limit, not duplicate it');
  assert.equal(state.orders[0]._optimistic, undefined, 'confirmed limit should not remain optimistic');
  assert.equal(decibelOrderStateKey(state.orders[0]), 'id:0x5e0e16', 'confirmed limit should use real order id key');

  state = merge(state.orders, [], 'realtime-orders', meta, 4_000);
  assert.equal(state.orders.length, 0, 'authoritative realtime empty snapshot should clear confirmed order');
}

{
  const meta = new Map();
  const confirmed = {
    dex: 'decibel',
    symbol: 'BTC',
    side: 'bid',
    amount: '0.001',
    price: '62000',
    order_type: 'Limit',
    order_direction: 'Open Long',
    market_addr: MARKET,
    order_id: '0xlimit',
  };

  let state = merge([], [confirmed], 'fetchOrders:server', meta, 10_000);
  state = merge(state.orders, [], 'fetchOrders:server', meta, 11_000);
  assert.equal(state.orders.length, 1, 'first missing REST snapshot should retain confirmed order during grace');
  state = merge(state.orders, [], 'fetchOrders:server', meta, 32_001);
  assert.equal(state.orders.length, 0, 'stable missing REST snapshots should eventually remove order');
}

{
  const meta = new Map();
  const pendingTp = makeOptimisticDecibelOrder({
    symbol: 'BTC',
    side: 'ask',
    amount: 0.001,
    price: 60422,
    stop_price: 60422,
    order_type: 'Trigger',
    reduce_only: true,
    is_tpsl: true,
    order_direction: 'Close Long',
    take_profit: 60422,
    market_addr: MARKET,
    market_name: 'BTC-USD',
  }, 20_000);

  let state = merge([], [pendingTp], 'optimistic-tpsl', meta, 20_000, { mergeOnly: true });
  state = merge(state.orders, [{
    dex: 'decibel',
    symbol: 'BTC',
    side: 'ask',
    amount: '0.001',
    price: '60422',
    stop_price: '60422',
    order_type: 'Trigger',
    reduce_only: true,
    is_tpsl: true,
    order_direction: 'Close Long',
    take_profit: '60422',
    market_addr: MARKET,
    order_id: '0xtp',
  }], 'tpsl-ordersAfter', meta, 20_500);
  assert.equal(state.orders.length, 1, 'confirmed TP should replace pending TP, not duplicate it');
  assert.equal(decibelOrderStateKey(state.orders[0]), 'id:0xtp', 'confirmed TP should use real order id key');
}

console.log('Decibel order state verification passed');
