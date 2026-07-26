'use strict';

const assert = require('node:assert/strict');

process.env.DECIBEL_API_KEY = 'limited-test-key';
process.env.DECIBEL_API_KEYS = 'healthy-test-key';

const attempts = [];
const originalFetch = global.fetch;

global.fetch = async (url, options = {}) => {
  assert.match(String(url), /\/account_overviews\?/);
  const authorization = options?.headers?.get
    ? options.headers.get('Authorization')
    : options?.headers?.Authorization;
  attempts.push(authorization);

  if (authorization === 'Bearer limited-test-key') {
    return new Response('Blocked due to MonthlyBudget cap.', {
      status: 429,
    });
  }

  if (authorization === 'Bearer healthy-test-key') {
    return Response.json({
      perp_equity_balance: '493.45',
      usdc_cross_withdrawable_balance: '468.15',
      usdc_isolated_withdrawable_balance: '0',
    });
  }

  throw new Error(`Unexpected authorization header: ${authorization}`);
};

async function main() {
  try {
    const { fetchAccountOverview } = require('./decibel');
    const account = await fetchAccountOverview(
      '0x3786fad68f7c802a8b6a0c8f11a8f8a639fb34151f0abed1d7f7a9fb295a5c90',
    );

    assert.deepEqual(attempts, [
      'Bearer limited-test-key',
      'Bearer healthy-test-key',
    ]);
    assert.equal(account?.perp_equity_balance, '493.45');
    assert.equal(account?.usdc_cross_withdrawable_balance, '468.15');
    console.log('Decibel account key failover test passed');
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
