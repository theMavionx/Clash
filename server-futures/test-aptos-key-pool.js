'use strict';

const assert = require('assert');
const {
  AptosApiKeyPool,
  isAptosKeyLimitError,
  keyPoolFromEnv,
} = require('./aptos-key-pool');

async function main() {
  let now = 1_000;
  const warnings = [];
  const pool = new AptosApiKeyPool({
    keys: ['primary', 'second', 'third'],
    cooldownMs: 10_000,
    now: () => now,
    logger: { warn: (...args) => warnings.push(args) },
  });

  const attempts = [];
  const first = await pool.run('test-read', async (key) => {
    attempts.push(key);
    if (key === 'primary') {
      const error = new Error('Per organization rate limit exceeded');
      error.status = 429;
      throw error;
    }
    return key;
  });
  assert.strictEqual(first, 'second');
  assert.deepStrictEqual(attempts, ['primary', 'second']);
  assert.strictEqual(warnings.length, 1);
  assert.deepStrictEqual(pool.snapshot().cooling_down.map(row => row.key_index), [1]);

  assert.strictEqual(await pool.run('round-robin', async key => key), 'third');
  assert.strictEqual(await pool.run('skip-cooldown', async key => key), 'second');

  now += 11_000;
  assert.strictEqual(await pool.run('cooldown-expired', async key => key), 'third');

  const publicAttempts = [];
  const publicFallbackPool = new AptosApiKeyPool({
    keys: ['limited'],
    logger: { warn: () => {} },
  });
  const publicResult = await publicFallbackPool.run('public-fallback', async key => {
    publicAttempts.push(key);
    if (key) {
      const error = new Error('MonthlyBudget cap reached');
      error.status = 429;
      throw error;
    }
    return 'public';
  }, { allowPublicFallback: true });
  assert.strictEqual(publicResult, 'public');
  assert.deepStrictEqual(publicAttempts, ['limited', '']);

  const nonRetryable = new Error('bad request');
  nonRetryable.status = 400;
  await assert.rejects(
    () => pool.run('bad-request', async () => { throw nonRetryable; }),
    /bad request/,
  );

  assert.strictEqual(isAptosKeyLimitError({ status: 403 }), true);
  assert.strictEqual(isAptosKeyLimitError(new Error('MonthlyCredit cap reached')), true);
  assert.strictEqual(isAptosKeyLimitError({ status: 500 }), false);

  assert.deepStrictEqual(keyPoolFromEnv({
    DECIBEL_API_KEY: 'one',
    DECIBEL_API_KEYS: 'two,three one',
    APTOS_NODE_API_KEYS: 'four\nfive',
  }), ['one', 'two', 'three']);
  assert.deepStrictEqual(keyPoolFromEnv({
    APTOS_NODE_API_KEY: 'legacy-one',
    APTOS_API_KEYS: 'legacy-two legacy-one',
  }), ['legacy-one', 'legacy-two']);

  console.log('Aptos key pool tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
