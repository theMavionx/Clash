'use strict';

const assert = require('assert');
const {
  accountMatchesLinkedWallet,
  enrichOstiumFillAccounting,
  fillBelongsToAccount,
  formatRawOstiumFill,
  isFillEligibleSince,
  normalizeFillForDb,
  ostiumFillAccounting,
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
assert.strictEqual(row.pnl, -0.11476897504);
assert.strictEqual(row.fee, 0);
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

const openFill = {
  ...fill,
  oid: '2152715',
  action: 'Open',
  closedPnl: '0',
  fees: {
    opening: '0.25',
    builder: '0.05',
    rollover: '0',
    liquidation: '0',
    priceImpact: '0.01',
  },
};
const openAccounting = ostiumFillAccounting(openFill);
assert.strictEqual(openAccounting.grossPnl, 0);
assert.strictEqual(openAccounting.chargedFee, 0.4);
assert.strictEqual(openAccounting.netPnl, -0.4);
const openRow = normalizeFillForDb(openFill, new Map());
assert.strictEqual(openRow.pnl, -0.4);
assert.strictEqual(openRow.fee, 0.4);
assert.strictEqual(JSON.parse(openRow.proofJson).accounting.version, 'ostium_net_pnl_v1');

const embeddedCloseFill = {
  ...fill,
  closedPnl: '-0.9',
  fees: {
    opening: '0',
    builder: '0',
    rollover: '-0.003',
    liquidation: '0',
    priceImpact: '0.01',
  },
};
const embeddedClose = enrichOstiumFillAccounting(embeddedCloseFill);
assert.strictEqual(embeddedClose.netPnl, '-0.9');
assert.strictEqual(embeddedClose.fee, '0');

const liquidationFill = {
  ...fill,
  action: 'Liquidation',
  closedPnl: '-24',
  fees: { liquidation: '1', builder: '0' },
};
const liquidationAccounting = ostiumFillAccounting(liquidationFill);
assert.strictEqual(liquidationAccounting.chargedFee, 0);
assert.strictEqual(liquidationAccounting.netPnl, -24);
assert.strictEqual(liquidationAccounting.components.liquidationEmbedded, 1);

const rawFullClose = formatRawOstiumFill({
  id: '99',
  tradeID: '7',
  trader: '0x1111111111111111111111111111111111111111',
  pair: { id: '0', from: 'BTC', to: 'USD' },
  orderAction: 'Close',
  orderType: 'Market',
  isBuy: true,
  collateral: '10000000',
  notional: '100000000',
  tradeNotional: '1000000000000000',
  priceAfterImpact: '64000000000000000000000',
  priceImpactP: '0',
  vaultFee: '0',
  devFee: '0',
  oracleFee: '100000',
  rolloverFee: '0',
  liquidationFee: '0',
  builderFee: '0',
  totalProfitPercent: '-1000000',
  amountSentToTrader: '9900000',
  closePercent: '1000000000000000000',
  executedTx: '0xabc',
  executedAt: '1780000000',
});
assert.strictEqual(rawFullClose.closedPnl, '-0.2');
assert.strictEqual(rawFullClose.settlementPnl, '-0.09999999999999964');
const rawFullCloseAccounting = ostiumFillAccounting(rawFullClose);
assert(Math.abs(rawFullCloseAccounting.netPnl - (-0.1)) < 1e-12);
assert(Math.abs(rawFullCloseAccounting.components.closeOracleSettlement - 0.1) < 1e-12);

console.log('ostium fill normalization: ok');
