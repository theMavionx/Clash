import assert from 'node:assert/strict';
import {
  _test,
  normalizeExchangeBalanceSnapshot,
  reportExchangeBalanceSnapshots,
} from './src/lib/exchangeBalanceTelemetry.js';

assert.equal(normalizeExchangeBalanceSnapshot({ dex: 'unknown', balance_usd: 10 }), null);
assert.equal(normalizeExchangeBalanceSnapshot({ dex: 'ostium' }), null);
assert.deepEqual(
  normalizeExchangeBalanceSnapshot({
    exchange: 'OSTIUM',
    equity_usd: '12.50',
    available_margin_usd: '10.25',
    wallet_address: ' 0xabc ',
    source: 'MM Bot Portfolio',
  }),
  {
    dex: 'ostium',
    balance_usd: 12.5,
    available_usd: 10.25,
    wallet_address: '0xabc',
    source: 'mm_bot_portfolio',
  },
);

const requests = [];
globalThis.window = { _playerToken: 'player-a-token' };
globalThis.fetch = async (url, options) => {
  requests.push({ url, options, body: JSON.parse(options.body) });
  return { ok: true, status: 200 };
};

_test.reset();
const row = { dex: 'ostium', balance_usd: 100, available_usd: 80 };
await reportExchangeBalanceSnapshots(row, { now: 1_000_000 });
await reportExchangeBalanceSnapshots(row, { now: 1_030_000 });
assert.equal(requests.length, 1, 'minimum report interval should suppress duplicate renders');

await reportExchangeBalanceSnapshots({ ...row, balance_usd: 101 }, { now: 1_061_000 });
assert.equal(requests.length, 2, 'material balance changes should report after the minimum interval');

await reportExchangeBalanceSnapshots({ ...row, balance_usd: 101 }, { now: 1_180_000 });
assert.equal(requests.length, 2, 'unchanged balances should wait for the refresh interval');
await reportExchangeBalanceSnapshots({ ...row, balance_usd: 101 }, { now: 1_962_000 });
assert.equal(requests.length, 3, 'unchanged balances should periodically refresh freshness');

window._playerToken = 'player-b-token';
await reportExchangeBalanceSnapshots({ ...row, balance_usd: 101 }, { now: 1_963_000 });
assert.equal(requests.length, 4, 'a new authenticated player must not inherit the previous throttle');
assert.equal(requests[0].url, '/api/exchange-balances/snapshot');
assert.equal(requests[0].options.headers['x-token'], 'player-a-token');
assert.equal(requests[0].body.snapshots[0].dex, 'ostium');

console.log('exchange balance telemetry tests passed');
