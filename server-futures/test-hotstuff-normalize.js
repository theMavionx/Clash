const assert = require('node:assert/strict');
const hotstuff = require('./hotstuff');

const {
  normalizeOrderRow,
  hotstuffRows,
  historyOrderMatchesOpenPosition,
  isActiveHistoryOrder,
  activeHistoryOrders,
} = hotstuff.__test;

function run() {
  assert.deepEqual(hotstuffRows({ data: [{ order_id: 1 }] }), [{ order_id: 1 }]);
  assert.deepEqual(hotstuffRows({ open_orders: [{ order_id: 2 }] }), [{ order_id: 2 }]);
  assert.deepEqual(hotstuffRows({ result: [{ order_id: 3 }] }), [{ order_id: 3 }]);
  assert.deepEqual(hotstuffRows({ rows: [{ order_id: 4 }] }), [{ order_id: 4 }]);

  const tp = normalizeOrderRow({
    order_id: 42,
    instrument_id: 18,
    instrument: 'AAPL-PERP',
    side: 'b',
    limit_price: '0',
    size: '0.2',
    unfilled: '0.2',
    state: 'open',
    cloid: 'clash-hs-123',
    reduce_only: true,
    trigger_px: '220',
    is_market: true,
    tpsl: 'tp',
  }, 'test');

  assert.equal(tp.symbol, 'AAPL');
  assert.equal(tp.side, 'bid');
  assert.equal(tp.order_type, 'tp');
  assert.equal(tp.price, '220');
  assert.equal(tp.trigger_price, '220');
  assert.equal(tp.reduce_only, true);
  assert.equal(tp.client_order_id, 'clash-hs-123');

  const triggerWithoutExplicitTpsl = normalizeOrderRow({
    order_id: 43,
    instrument_id: 19,
    instrument: 'BTC-PERP',
    side: 'SELL',
    size: '0.01',
    reduceOnly: true,
    triggerPx: '70000',
  }, 'test');

  assert.equal(triggerWithoutExplicitTpsl.symbol, 'BTC');
  assert.equal(triggerWithoutExplicitTpsl.side, 'ask');
  assert.equal(triggerWithoutExplicitTpsl.order_type, 'trigger');
  assert.equal(triggerWithoutExplicitTpsl.price, '70000');
  assert.equal(triggerWithoutExplicitTpsl.trigger_price, '70000');
  assert.equal(triggerWithoutExplicitTpsl.reduce_only, true);

  const officialOpenOrderShape = normalizeOrderRow({
    order_id: 44,
    user: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    instrument_id: 1,
    instrument: 'BTC-PERP',
    side: 's',
    position_side: 'BOTH',
    limit_price: '67000',
    size: '0.002',
    unfilled: '0.002',
    state: 'open',
    cloid: 'clash-hs-tpsl',
    tif: 'IOC',
    post_only: false,
    reduce_only: true,
    trigger_px: '67000',
    is_market: true,
    tpsl: 'sl',
    grouping: 'position',
  }, 'official_open_orders');

  assert.equal(officialOpenOrderShape.symbol, 'BTC');
  assert.equal(officialOpenOrderShape.side, 'ask');
  assert.equal(officialOpenOrderShape.order_type, 'sl');
  assert.equal(officialOpenOrderShape.price, '67000');
  assert.equal(officialOpenOrderShape.trigger_price, '67000');
  assert.equal(officialOpenOrderShape.reduce_only, true);
  assert.equal(officialOpenOrderShape.client_order_id, 'clash-hs-tpsl');
  assert.equal(officialOpenOrderShape.source, 'official_open_orders');

  const currentBtcPosition = {
    symbol: 'BTC',
    side: 'bid',
    amount: '0.00157',
    _raw: { size: '0.00157' },
  };
  const btcHistoryTpsl = {
    instrument: 'BTC-PERP',
    side: 's',
    unfilled: '0.00157',
    reduce_only: true,
    trigger_px: '64000',
    tpsl: 'tp',
    state: 'open',
  };
  const triggeredBtcHistoryTpsl = {
    ...btcHistoryTpsl,
    state: 'triggered',
  };
  const cancelledAfterTriggeredBtcHistoryTpsl = {
    ...btcHistoryTpsl,
    cloid: 'same-tpsl',
    state: 'cancelled',
    trigger_px: '0',
    tpsl: '',
    timestamp: '2026-06-04T13:38:22.481Z',
  };
  const triggeredBeforeCancelBtcHistoryTpsl = {
    ...btcHistoryTpsl,
    cloid: 'same-tpsl',
    state: 'triggered',
    timestamp: '2026-06-04T13:09:26.314Z',
  };
  const cancelledBtcHistoryTpsl = {
    ...btcHistoryTpsl,
    state: 'cancelled',
  };
  const staleMetaHistoryTpsl = {
    instrument: 'META-PERP',
    side: 's',
    unfilled: '0.08',
    reduce_only: true,
    trigger_px: '622',
    tpsl: 'tp',
    state: 'triggered',
  };
  assert.equal(historyOrderMatchesOpenPosition(btcHistoryTpsl, [currentBtcPosition]), true);
  assert.equal(historyOrderMatchesOpenPosition(cancelledBtcHistoryTpsl, [currentBtcPosition]), true);
  assert.equal(historyOrderMatchesOpenPosition(staleMetaHistoryTpsl, [currentBtcPosition]), false);
  assert.equal(isActiveHistoryOrder(btcHistoryTpsl, [currentBtcPosition]), true);
  assert.equal(isActiveHistoryOrder(cancelledBtcHistoryTpsl, [currentBtcPosition]), false);
  assert.equal(isActiveHistoryOrder(triggeredBtcHistoryTpsl, [currentBtcPosition]), true);
  assert.equal(isActiveHistoryOrder(staleMetaHistoryTpsl, [currentBtcPosition]), false);
  assert.deepEqual(
    activeHistoryOrders([
      cancelledAfterTriggeredBtcHistoryTpsl,
      triggeredBeforeCancelBtcHistoryTpsl,
    ], [currentBtcPosition]),
    [],
  );
  const activeHistory = normalizeOrderRow(btcHistoryTpsl, 'hotstuff_order_history');
  assert.equal(activeHistory.state, 'open');

console.log('Hotstuff normalization smoke test passed');
}

run();
