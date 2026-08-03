import assert from 'node:assert/strict';
import { resolveOrderDisplayMetrics } from './src/lib/orderDisplayMetrics.js';

const price = 64_000;
const cases = [
  ['Pacifica', { amount: '0.01' }, 0.01, 640],
  ['Avantis', { initial_amount: '0.02', margin: '64', notional_usd: '1280', leverage: 20 }, 0.02, 1280],
  ['Decibel', { amount: '0.03' }, 0.03, 1920],
  ['GMX quote-only', { size_usd: 960 }, 0.015, 960],
  ['Hyperliquid', { initial_amount: '0.025' }, 0.025, 1600],
  ['RISEx', { initial_amount: '0.04' }, 0.04, 2560],
  ['Nado', { amount: '0.005' }, 0.005, 320],
  ['Hibachi quantity', { quantity: '0.006' }, 0.006, 384],
  ['Hotstuff size', { size: '0.007' }, 0.007, 448],
  ['GRVT', { initial_amount: '0.008' }, 0.008, 512],
  ['Katana quantity', { quantity: '0.009' }, 0.009, 576],
  ['Lighter', { amount: '0.011' }, 0.011, 704],
  ['Flash', { initial_amount: '0.012', notional_usd: 768 }, 0.012, 768],
  ['GMTrade token amount', { token_amount: '0.013', notional_usd: 832 }, 0.013, 832],
  ['Ostium', { amount: '0.014', size_usd: 896 }, 0.014, 896],
  ['Phoenix normalized', { initial_amount: '0.015' }, 0.015, 960],
  ['Bulk', { amount: '0.016' }, 0.016, 1024],
  ['Perpl', { amount: '0.017' }, 0.017, 1088],
];

for (const [name, order, expectedAmount, expectedNotional] of cases) {
  const result = resolveOrderDisplayMetrics({ order, price, leverage: order.leverage });
  assert.ok(Math.abs(result.baseAmount - expectedAmount) < 1e-10, `${name}: base amount`);
  assert.ok(Math.abs(result.notionalUsd - expectedNotional) < 1e-8, `${name}: notional`);
}

const fullPosition = resolveOrderDisplayMetrics({
  order: { amount: 'Full position', reduce_only: true },
  position: { amount: 0.0149 },
  price: 63_708,
  leverage: 10,
});
assert.equal(fullPosition.baseAmount, 0.0149);
assert.ok(Math.abs(fullPosition.notionalUsd - 949.2492) < 1e-8);
assert.ok(Math.abs(fullPosition.marginUsd - 94.92492) < 1e-8);
assert.equal(fullPosition.fullPosition, false);

const unknownFullPosition = resolveOrderDisplayMetrics({
  order: { amount: 'Full position', reduce_only: true },
  price,
});
assert.equal(unknownFullPosition.baseAmount, null);
assert.equal(unknownFullPosition.fullPosition, true);

const marketClose = resolveOrderDisplayMetrics({
  order: { reduce_only: true },
  position: { amount: 2, size_usd: 6_800, margin: 680 },
});
assert.equal(marketClose.baseAmount, 2);
assert.equal(marketClose.notionalUsd, 6_800);
assert.equal(marketClose.marginUsd, 680);

console.log(`Order display metrics passed for ${cases.length} DEX schemas plus full-position fallbacks`);
