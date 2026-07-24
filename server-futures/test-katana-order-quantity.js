const assert = require('node:assert/strict');
const { formatQuantity, orderParams } = require('./katana');

const btcMarket = {
  lot_size: '0.00010000',
  taker_order_minimum: '0.00050000',
};

assert.equal(
  formatQuantity('0.0004', btcMarket, { reduceOnly: true }),
  '0.00050000',
  'subminimum reduce-only closes must use Katana takerOrderMinimum',
);

assert.equal(
  formatQuantity('0.0004', btcMarket),
  '0.00040000',
  'normal orders must retain a valid requested market step',
);

assert.equal(
  formatQuantity('0.00127', btcMarket, { reduceOnly: true }),
  '0.00120000',
  'order quantities must floor to the market step size',
);

assert.equal(
  formatQuantity('0.0000079', {
    lot_size: '0.00000100',
    taker_order_minimum: '0.00000500',
  }, { reduceOnly: true }),
  '0.00000700',
  'markets with smaller step sizes must keep their supported precision',
);

assert.equal(formatQuantity('0', btcMarket, { reduceOnly: true }), '');

const closeParams = orderParams({
  symbol: 'BTC',
  side: 'sell',
  quantity: '0.0004',
  type: 'market',
  reduceOnly: true,
}, {
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  wallet: '0x1111111111111111111111111111111111111111',
}, {
  market: true,
  marketMeta: btcMarket,
});

assert.equal(closeParams.quantity, '0.00050000');
assert.equal(closeParams.reduceOnly, true);

console.log('Katana order quantity tests passed');
