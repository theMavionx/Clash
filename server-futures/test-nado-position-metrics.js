const assert = require('node:assert/strict');
const BigNumber = require('bignumber.js');
const { __test } = require('./nado');

const SCALE = new BigNumber(10).pow(18);
const raw = value => new BigNumber(value).times(SCALE).toFixed(0);

// Reproduces the reported shape: a small BTC short in a well-funded unified
// account. Account equity is intentionally absent because Nado's per-position
// risk margin comes directly from the balance health contributions.
const mark = 64_106;
const amount = -0.0005;
const entry = 64_122;
const vQuote = Math.abs(amount) * entry;
const unweightedHealth = amount * mark + vQuote;
const initialHealth = amount * mark * 1.05 + vQuote;

const position = __test.normalizePosition({
  productId: 2,
  type: 1,
  symbol: 'BTC-PERP',
  amount: raw(amount),
  vQuoteBalance: raw(vQuote),
  healthContributions: {
    initial: raw(initialHealth),
    unweighted: raw(unweightedHealth),
  },
}, {
  symbol: 'BTC',
  mark,
});

assert.ok(position, 'Nado BTC position should normalize');
assert.equal(position.margin_type, 'cross');
assert.equal(position.is_isolated, false);
assert.equal(position.leverage_source, 'nado_initial_health_margin');
assert.equal(position.leverage, '20.00', 'BTC leverage must come from Nado initial risk margin, not account equity');
assert.ok(Math.abs(Number(position.margin) - 1.60265) < 1e-9, `unexpected risk margin ${position.margin}`);
assert.ok(Math.abs(Number(position.size_usd) - 32.053) < 1e-9, `unexpected notional ${position.size_usd}`);

console.log('Nado position metrics: risk-implied cross leverage PASS');
