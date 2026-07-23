const assert = require('node:assert/strict');
const {
  canonicalLimitIdentity,
  localLimitIndex,
} = require('./ostiumLimitOrder');

const currentLimit = {
  id: '0x39b36f1edf2ef5a6f2e02991b3a85fb356eb5005_0_0',
  orderId: '2157020',
  pair: { id: '0' },
};

assert.deepEqual(canonicalLimitIdentity(currentLimit), { pairId: 0, idx: 0 });
assert.equal(localLimitIndex(currentLimit), 0);
assert.equal(localLimitIndex({ pair: { id: '0' }, orderId: '2157020' }), null);
assert.equal(localLimitIndex({ pair: { id: '0' }, orderId: '7' }), 7);
assert.equal(localLimitIndex({
  id: '0x39b36f1edf2ef5a6f2e02991b3a85fb356eb5005_1_3',
  pair: { id: '0' },
}), null);
console.log('ostium local limit index: ok');
