'use strict';

const assert = require('node:assert/strict');

process.env.DECIBEL_API_KEY = 'limited-test-key';
process.env.DECIBEL_API_KEYS = 'healthy-test-key';

const attempts = [];
const originalFetch = global.fetch;

global.fetch = async (_url, options = {}) => {
  const authorization = options?.headers?.Authorization || '';
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
