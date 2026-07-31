import assert from 'node:assert/strict';
import {
  createAptosBrowserKeyPool,
  isAptosBrowserKeyLimitError,
} from '../web/src/lib/aptosBrowserKeyPool.js';

let now = 1_000;
const warnings = [];
const attempts = [];
const pool = createAptosBrowserKeyPool(
  ['first', 'second', 'third'],
  {
    now: () => now,
    logger: { warn: (...args) => warnings.push(args) },
  },
);

const firstResult = await pool.run(async key => {
  attempts.push(key);
  if (key === 'first') {
    const error = new Error('Blocked due to MonthlyBudget cap');
    error.status = 429;
    throw error;
  }
  return key;
}, { label: 'NFT owner read', cooldownMs: 10_000 });

assert.equal(firstResult, 'second');
assert.deepEqual(attempts, ['first', 'second']);
assert.equal(warnings.length, 1);
assert.deepEqual(pool.status().cooling_down.map(row => row.key_index), [1]);
assert.equal(await pool.run(async key => key, { label: 'shop receipt' }), 'third');
assert.equal(await pool.run(async key => key, { label: 'marketplace read' }), 'second');

now += 11_000;
assert.equal(await pool.run(async key => key, { label: 'bridge view' }), 'third');
assert.equal(isAptosBrowserKeyLimitError(new Error('organization monthly budget reached')), true);
assert.equal(isAptosBrowserKeyLimitError({ status: 500 }), false);

console.log('Aptos browser key pool verification passed');
