import assert from 'node:assert/strict';
import {
  decibelOrderStateKey,
  makeOptimisticDecibelOrder,
  mergeDecibelOrderSnapshot,
  removeDecibelTpslOrdersForClosedPosition,
  tpslKindFromOrder,
  tpslPriceFromOrder,
} from '../web/src/lib/decibelOrderState.js';

const MARKET = '0xabc';

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
      tpslKindFromOrder,
      tpslPriceFromOrder,
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
    amount: 0.0149,
    price: 64828,
    stop_price: 64828,
    order_type: 'Trigger',
    reduce_only: true,
    is_tpsl: true,
    order_direction: 'Close Long',
    take_profit: 64828,
    market_addr: MARKET,
    market_name: 'BTC-USD',
  }, 20_000);
  const pendingSl = makeOptimisticDecibelOrder({
    symbol: 'BTC',
    side: 'ask',
    amount: 0.0149,
    price: 63544,
    stop_price: 63544,
    order_type: 'Trigger',
    reduce_only: true,
    is_tpsl: true,
    order_direction: 'Close Long',
    stop_loss: 63544,
    market_addr: MARKET,
    market_name: 'BTC-USD',
  }, 20_000);

  let state = merge([], [pendingTp, pendingSl], 'optimistic-tpsl', meta, 20_000, { mergeOnly: true });
  state = merge(state.orders, [{
    dex: 'decibel',
    symbol: 'BTC',
    side: 'ask',
    amount: '0.0149',
    price: '64601.1',
    stop_price: '64828',
    order_type: 'Take Profit Limit',
    reduce_only: true,
    is_tpsl: true,
    trigger_condition: 'Price above 64828',
    order_direction: 'Close Long',
    take_profit: '64828',
    market_addr: MARKET,
    order_id: '0xtp',
  }, {
    dex: 'decibel',
    symbol: 'BTC',
    side: 'ask',
    amount: '0.0149',
    price: '60366.8',
    stop_price: '63544',
    order_type: 'Stop Limit',
    reduce_only: true,
    is_tpsl: true,
    trigger_condition: 'Price below 63544',
    order_direction: 'Close Long',
    stop_loss: '63544',
    market_addr: MARKET,
    order_id: '0xsl',
  }], 'tpsl-ordersAfter', meta, 20_500);
  assert.equal(state.orders.length, 2, 'confirmed TP/SL should replace both optimistic rows without duplicates');
  assert.deepEqual(
    state.orders.map(decibelOrderStateKey).sort(),
    ['id:0xsl', 'id:0xtp'],
    'confirmed TP/SL should use their real order id keys',
  );
  assert.equal(state.optimisticCount, 0, 'no optimistic TP/SL should remain after confirmed snapshot');
}

{
  const meta = new Map();
  const pendingTp = makeOptimisticDecibelOrder({
    symbol: 'BTC',
    side: 'ask',
    amount: 0.01,
    price: 65000,
    stop_price: 65000,
    order_type: 'Trigger',
    reduce_only: true,
    is_tpsl: true,
    order_direction: 'Close Long',
    take_profit: 65000,
    market_addr: MARKET,
  }, 30_000);
  let state = merge([], [pendingTp], 'optimistic-tpsl', meta, 30_000, { mergeOnly: true });
  state = merge(state.orders, [{
    dex: 'decibel',
    symbol: 'BTC',
    side: 'ask',
    amount: '0.02',
    price: '64772.5',
    stop_price: '65000',
    order_type: 'Take Profit Limit',
    reduce_only: true,
    is_tpsl: true,
    trigger_condition: 'Price above 65000',
    order_direction: 'Close Long',
    take_profit: '65000',
    market_addr: MARKET,
    order_id: '0xdifferent-size',
  }], 'fetchOrders:server', meta, 30_500);
  assert.equal(state.orders.length, 2, 'same trigger with a different size must not hide a distinct TP order');
  assert.equal(state.optimisticCount, 1, 'different-size optimistic TP should remain pending');
}

{
  const staleClosedPositionOrders = [
    makeOptimisticDecibelOrder({
      symbol: 'BTC',
      side: 'ask',
      amount: 0.0149,
      price: 64282,
      stop_price: 64282,
      order_type: 'Take Profit Limit',
      reduce_only: true,
      is_tpsl: true,
      order_direction: 'Close Long',
      take_profit: 64282,
      market_addr: MARKET,
    }),
    {
      dex: 'decibel',
      symbol: 'BTC',
      side: 'ask',
      amount: '0.0149',
      price: '64090',
      stop_price: '64090',
      order_type: 'Stop Limit',
      reduce_only: true,
      is_tpsl: true,
      order_direction: 'Close Long',
      stop_loss: '64090',
      market_addr: MARKET,
      order_id: '0xclosed-sl',
    },
    {
      dex: 'decibel',
      symbol: 'ETH',
      side: 'ask',
      amount: '1',
      price: '4000',
      order_type: 'Take Profit Limit',
      reduce_only: true,
      is_tpsl: true,
      order_direction: 'Close Long',
      take_profit: '4000',
      market_addr: '0xdef',
      order_id: '0xother-market',
    },
    {
      dex: 'decibel',
      symbol: 'BTC',
      side: 'bid',
      amount: '0.5',
      price: '60000',
      order_type: 'Stop Limit',
      reduce_only: true,
      is_tpsl: true,
      order_direction: 'Close Short',
      stop_loss: '60000',
      market_addr: '0xother-btc-market',
      order_id: '0xother-btc-position',
    },
  ];
  const pruned = removeDecibelTpslOrdersForClosedPosition(
    staleClosedPositionOrders,
    { symbol: 'BTC', marketAddr: MARKET, closingLong: true },
    {
      sameAddress: (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase(),
      tpslKindFromOrder,
    },
  );
  assert.equal(pruned.removed.length, 2, 'closing BTC long should remove its confirmed and optimistic TP/SL rows');
  assert.equal(pruned.orders.length, 2, 'orders for other open positions must remain visible');
  assert.deepEqual(
    pruned.orders.map(order => order.order_id).sort(),
    ['0xother-btc-position', '0xother-market'],
    'closing BTC long must preserve ETH and a different BTC market/direction',
  );
}

console.log('Decibel order state verification passed');
