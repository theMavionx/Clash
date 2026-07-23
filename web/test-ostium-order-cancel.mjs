import assert from 'node:assert/strict';
import {
  ostiumCancelIdentity,
  ostiumOrderMatchesTarget,
  resolveOstiumCancelTarget,
} from './src/lib/ostiumOrderCancel.js';

const orders = [
  { symbol: 'BTC', pair_index: 0, order_id: 0, idx: 0 },
  { symbol: 'BTC', pair_index: 0, order_id: 1, idx: 1 },
  { pairFrom: 'ETH', pairId: '1', idx: 0 },
];
const currentOrder = {
  symbol: 'BTC',
  pair_index: 0,
  order_id: 0,
  idx: 0,
  global_order_id: '2157020',
  canonical_order_id: '0x39b36f1edf2ef5a6f2e02991b3a85fb356eb5005_0_0',
};

assert.deepEqual(ostiumCancelIdentity(orders[0]), { pairId: 0, idx: 0 });
assert.equal(resolveOstiumCancelTarget(orders, { orderId: 0, pairIndex: 0 }).idx, 0);
assert.equal(resolveOstiumCancelTarget(orders, { orderId: 1, pairIndex: 0 }).idx, 1);
assert.equal(resolveOstiumCancelTarget(orders, { pairIndex: 0, symbol: 'BTC' }), null);
assert.equal(resolveOstiumCancelTarget(orders, { pairIndex: 1, symbol: 'ETH' }).idx, 0);
assert.equal(resolveOstiumCancelTarget(orders, { orderId: 7, pairIndex: 0 }), null);
assert.equal(ostiumOrderMatchesTarget(orders[1], { pairId: 0, idx: 1 }), true);
assert.equal(ostiumOrderMatchesTarget(orders[0], { pairId: 0, idx: 1 }), false);
assert.equal(resolveOstiumCancelTarget([currentOrder], { orderId: 2157020, pairIndex: 0 }).idx, 0);
assert.deepEqual(
  ostiumCancelIdentity({
    pairId: '0',
    orderId: '2157020',
    canonicalId: '0x39b36f1edf2ef5a6f2e02991b3a85fb356eb5005_0_0',
  }),
  { pairId: 0, idx: 0 },
);
assert.equal(ostiumCancelIdentity({ pairId: '0', orderId: '2157020' }), null);
console.log('ostium cancel target resolution: ok');
