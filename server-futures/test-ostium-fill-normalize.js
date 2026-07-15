'use strict';

const assert = require('assert');
const {
  accountMatchesLinkedWallet,
  fillBelongsToAccount,
  isFillEligibleSince,
  normalizeFillForDb,
} = require('./ostium');

const fill = {
  pairId: '0',
  pairFrom: 'BTC',
  pairTo: 'USD',
  oid: '2152716',
  pid: '2152715',
  trader: '0x6737b9e75bf306af3113123477e861a7eda49181',
  side: 'B',
  action: 'Close',
  type: 'Market',
  px: '64115.87930870453',
  szi: '0.001795268883249983',
  ntl: '115.12',
  closedPnl: '-0.11476897504',
  hash: '0xb1466e5ad0e33617500de93a344d3d0976f3d8c05a0bb9b4c989e4d2b8355ad4',
  timestamp: 1783773073,
};

const row = normalizeFillForDb(fill, new Map());
assert.strictEqual(row.orderId, '2152716');
assert.strictEqual(row.pnl, '-0.11476897504');
assert.strictEqual(row.notional_usd, 115.12);
assert.strictEqual(row.createdAt, '2026-07-11T12:31:13.000Z');
assert.strictEqual(
  row.clientOrderId,
  'ostium:0xb1466e5ad0e33617500de93a344d3d0976f3d8c05a0bb9b4c989e4d2b8355ad4:2152716:bid',
);
assert.strictEqual(isFillEligibleSince(row.createdAt, '2026-07-11 12:31:12'), true);
assert.strictEqual(isFillEligibleSince(row.createdAt, '2026-07-11 12:31:13'), true);
assert.strictEqual(isFillEligibleSince(row.createdAt, '2026-07-11 12:31:14'), false);
assert.strictEqual(
  accountMatchesLinkedWallet(
    '0xE2723c1A95692096b4F967eB928F5cC55f098Db5',
    '0xe2723c1a95692096b4f967eb928f5cc55f098db5',
  ),
  true,
);
assert.strictEqual(
  accountMatchesLinkedWallet(
    '0xe2723c1a95692096b4f967eb928f5cc55f098db5',
    '0xb36402e87a86206d3a114a98b53f31362291fe1b',
  ),
  false,
);
assert.strictEqual(fillBelongsToAccount(fill, fill.trader.toUpperCase().replace('0X', '0x')), true);
assert.strictEqual(
  fillBelongsToAccount(fill, '0xb36402e87a86206d3a114a98b53f31362291fe1b'),
  false,
);

console.log('ostium fill normalization: ok');
