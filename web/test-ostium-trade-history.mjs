import assert from 'node:assert/strict';
import { normalizeOstiumTrade } from './src/lib/ostiumTradeHistory.js';

const close = normalizeOstiumTrade({
  pairTo: 'USD',
  pairFrom: 'BTC',
  pairId: '0',
  oid: '2152910',
  pid: '2152909',
  trader: '0x881a2d488d5ca174a8854d2894f07bd36b2e349e',
  side: 'B',
  action: 'Close',
  type: 'Market',
  px: '64064.10043885021',
  szi: '0.034206357426054324',
  fees: {
    opening: '0',
    rollover: '0.000099',
    liquidation: '0',
    builder: '0',
    priceImpact: '0.019397095044407973',
  },
  closedPnl: '-0.460580903216',
  hash: '0xabc',
  timestamp: 1783786105,
});

assert.equal(close.symbol, 'BTC');
assert.equal(close.side, 'close_long');
assert.equal(close.price, 64064.10043885021);
assert.equal(close.amount, 0.034206357426054324);
assert.equal(close.fee, 0.000099);
assert.equal(close.realized_pnl_amount, -0.460580903216);
assert.equal(close.created_at, 1783786105);

const openShort = normalizeOstiumTrade({
  pairId: '7',
  side: 'S',
  action: 'Open',
  px: '12.5',
  szi: '4',
  timestamp: 1783786200,
}, [{ pair_index: 7, symbol: 'TSLA' }]);
assert.equal(openShort.symbol, 'TSLA');
assert.equal(openShort.side, 'open_short');

assert.equal(normalizeOstiumTrade({
  pairFrom: 'BTC',
  action: 'RemoveCollateral',
  side: 'B',
  px: '64000',
  szi: '0',
}), null);
assert.equal(normalizeOstiumTrade({ action: 'Open' }), null);
console.log('ostium trade history normalization: ok');
