import assert from 'node:assert/strict';
import { phoenixIsolatedLimitNativeFields } from './src/lib/phoenixOrderRequests.js';

const fields = phoenixIsolatedLimitNativeFields({
  priceInTicks: 6_472_900n,
  numBaseLots: 1081n,
});

assert.deepEqual(fields, {
  priceInTicks: 6_472_900,
  numBaseLots: 1081,
});
assert.equal(Object.hasOwn(fields, 'price'), false);
assert.equal(Object.hasOwn(fields, 'quantity'), false);

assert.throws(
  () => phoenixIsolatedLimitNativeFields({ priceInTicks: 6_472_900n }),
  /Phoenix isolated limit size/,
);
assert.throws(
  () => phoenixIsolatedLimitNativeFields({ priceInTicks: 0n, numBaseLots: 1n }),
  /Phoenix isolated limit price/,
);
assert.throws(
  () => phoenixIsolatedLimitNativeFields({ priceInTicks: 1n, numBaseLots: 0n }),
  /Phoenix isolated limit size/,
);

console.log('Phoenix isolated limit request regression: PASS');
