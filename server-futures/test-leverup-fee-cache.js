const assert = require('node:assert/strict');
const test = require('node:test');
const leverup = require('./leverup');

test('fee reads share one request, reject failures and never reuse expired configuration', async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let now = originalNow(), calls = 0, fail = true;
  Date.now = () => now;
  global.fetch = async (url, options) => {
    calls++;
    assert.match(url, /\/v2\/trading\/anti-ddos-config$/);
    assert.equal(options.method, undefined);
    if (fail) throw new Error('fixture unavailable');
    return { ok: true, text: async () => JSON.stringify([{ action: 0, enabled: false, antiDdosFee: '0' }]) };
  };
  try {
    const failed = await Promise.allSettled(Array.from({ length: 10 }, () => leverup.getFeeConfig()));
    assert.ok(failed.every(row => row.status === 'rejected'));
    assert.equal(calls, 1);
    fail = false;
    const rows = await Promise.all(Array.from({ length: 10 }, () => leverup.getFeeConfig()));
    assert.equal(calls, 2);
    assert.equal(rows[0][0].antiDdosFee, '0');
    await leverup.getFeeConfig();
    assert.equal(calls, 2);
    now += 31_000;
    fail = true;
    await assert.rejects(leverup.getFeeConfig(), /fixture unavailable/);
    assert.equal(calls, 3, 'expired fees fail closed instead of silently using stale fees');
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
  }
});
