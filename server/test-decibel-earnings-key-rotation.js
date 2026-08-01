'use strict';

const assert = require('node:assert/strict');

// Keep the regression hermetic even when the developer shell already has
// production Aptos credentials. The shared server client intentionally reads
// plural key pools before legacy single-key variables.
for (const name of [
  'APTOS_NODE_API_KEYS',
  'APTOS_API_KEYS',
  'VITE_APTOS_NODE_API_KEYS',
  'APTOS_NODE_API_KEY',
  'APTOS_API_KEY',
  'VITE_APTOS_NODE_API_KEY',
  'DECIBEL_API_KEY',
]) {
  delete process.env[name];
}
process.env.DECIBEL_API_KEYS = 'limited-test-key,healthy-test-key';

const attempts = [];
const originalFetch = global.fetch;

global.fetch = async (_url, options = {}) => {
  const authorization = new Headers(options?.headers || {}).get('Authorization') || '';
  attempts.push(authorization);

  if (authorization === 'Bearer limited-test-key') {
    return {
      ok: false,
      status: 429,
      text: async () => 'Blocked due to MonthlyBudget cap.',
    };
  }

  if (authorization === 'Bearer healthy-test-key') {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        fee_income: '123.45',
        usdc_cross_withdrawable_balance: '67.89',
        realized_pnl: '4.2',
      }),
    };
  }

  throw new Error(`Unexpected authorization header: ${authorization}`);
};

async function main() {
  try {
    const { fetchEarningsDex } = require('./earnings');
    const result = await fetchEarningsDex('decibel', { force: true });

    assert.deepEqual(attempts, [
      'Bearer limited-test-key',
      'Bearer healthy-test-key',
    ]);
    assert.equal(result.row.ok, true);
    assert.equal(result.row.earned_usd, 123.45);
    assert.equal(result.row.withdrawable_usd, 67.89);
    assert.equal(result.row.realized_pnl, 4.2);
    console.log('decibel admin earnings key rotation: ok');
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
