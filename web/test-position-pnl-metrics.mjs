import assert from 'node:assert/strict';
import {
  FEE_AWARE_POSITION_DEXES,
  calculateFeeAwarePositionPnl,
  findPositionMarket,
  positionPnlPresentation,
  resolvePositionFeeRates,
} from './src/lib/positionPnlMetrics.js';

function approx(actual, expected, label, epsilon = 1e-9) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= epsilon, `${label}: expected ${expected}, got ${actual}`);
}

const base = {
  position: { symbol: 'BTC', side: 'bid', amount: 2, entry_price: 100, mark_price: 110, margin: 100 },
  grossPnlUsd: 20,
  amount: 2,
  entryPrice: 100,
  markPrice: 110,
  margin: 100,
  positionValueUsd: 220,
};

const venuePnlDexes = [
  'pacifica', 'avantis', 'decibel', 'monad', 'hyperliquid', 'risex', 'nado',
  'ondo', 'hibachi', 'hotstuff', 'grvt', 'katana', 'gmtrade', 'lighter',
  'bulk', 'ostium', 'gmx', 'flash', 'imperial',
];

for (const dex of venuePnlDexes) {
  const result = calculateFeeAwarePositionPnl({
    dex,
    ...base,
    position: {
      ...base.position,
      net_pnl_usd: 10,
      pnl_with_fees_usd: 9,
      opening_fee_usd: 5,
      closing_fee_usd: 6,
      trading_fee_rate: 0.5,
      pnl_includes_fees: true,
    },
  });
  assert.equal(result.feeAdjusted, false, `${dex} must preserve venue uPnL`);
  approx(result.grossPnlUsd, 20, `${dex} gross uPnL`);
  approx(result.netPnlUsd, 20, `${dex} displayed uPnL`);
  approx(result.totalFeeUsd, 0, `${dex} must not apply fees`);
}

const ondoScreenshot = calculateFeeAwarePositionPnl({
  dex: 'ondo',
  position: {
    symbol: 'BTC', side: 'bid', amount: 0.0014, entry_price: 63740,
    mark_price: 63731, margin: 4.46, unrealized_pnl: -0.0126,
  },
  grossPnlUsd: -0.0126,
  amount: 0.0014,
  entryPrice: 63740,
  markPrice: 63731,
  margin: 4.46,
  positionValueUsd: 89.22,
});
approx(ondoScreenshot.netPnlUsd, -0.0126, 'Ondo screenshot uPnL');
approx(ondoScreenshot.pnlPct, (-0.0126 / 4.46) * 100, 'Ondo screenshot ROE');
assert.equal(ondoScreenshot.feeAdjusted, false);

const phoenix = calculateFeeAwarePositionPnl({
  dex: 'phoenix',
  ...base,
  position: {
    ...base.position,
    pnl_usd: 19.6,
    pnl_gross_usd: 20,
    opening_fee_usd: 0.19,
    closing_fee_usd: 0.21,
    trading_fee_usd: 0.4,
    trading_fee_rate: 0.001,
    pnl_includes_fees: true,
  },
});
approx(phoenix.netPnlUsd, 19.6, 'Phoenix keeps adapter net PnL');
approx(phoenix.totalFeeUsd, 0.4, 'Phoenix explicit fees');

const phoenixPresentation = positionPnlPresentation({
  dex: 'phoenix',
  margin: 713.043897,
  netPnlUsd: -42.480472138,
  netPnlPct: -5.9576236914,
  pnlFees: {
    feeAdjusted: true,
    estimated: true,
    grossPnlUsd: -35.2915,
    netPnlUsd: -42.480472138,
    totalFeeUsd: 7.188972138,
  },
});
assert.equal(phoenixPresentation.usesVenueGross, true, 'Phoenix live cards use venue gross PnL');
assert.equal(phoenixPresentation.primaryLabel, '');
approx(phoenixPresentation.primaryPnlUsd, -35.2915, 'Phoenix primary gross PnL');
approx(phoenixPresentation.primaryPnlPct, -4.9494147764, 'Phoenix primary gross ROE');
assert.equal(phoenixPresentation.secondaryLabel, 'Est. after fees');
approx(phoenixPresentation.secondaryNetPnlUsd, -42.480472138, 'Phoenix secondary net PnL');
approx(phoenixPresentation.secondaryNetPnlPct, -5.9576236914, 'Phoenix secondary net ROE');

const risexPresentation = positionPnlPresentation({
  dex: 'risex',
  margin: 100,
  netPnlUsd: 19.6,
  netPnlPct: 19.6,
  pnlFees: phoenix,
});
assert.equal(risexPresentation.usesVenueGross, false, 'other venues keep net PnL primary');
assert.equal(risexPresentation.primaryLabel, '');
approx(risexPresentation.primaryPnlUsd, 19.6, 'other venue primary net PnL');
assert.equal(risexPresentation.secondaryNetPnlUsd, null, 'other venue has no duplicate secondary net');

const market = findPositionMarket([
  { symbol: 'ETH', pair_index: 1 },
  { symbol: 'BTC/USD', pair_index: 2, market_addr: '0xabc' },
], { symbol: 'BTC', market_addr: '0xABC' });
assert.equal(market?.pair_index, 2, 'market lookup should match address case-insensitively');

const lighterRates = resolvePositionFeeRates({ dex: 'lighter', market: { taker_fee: 0 } });
approx(lighterRates.baseOpeningRate, 0, 'live zero fee must not fall through to a nonzero default');
approx(lighterRates.builderRate, 0.0001, 'Lighter integrator fee');

assert.deepEqual(
  [...FEE_AWARE_POSITION_DEXES].sort(),
  ['phoenix'],
  'only Phoenix may use fee-aware open-position PnL',
);

console.log('position PnL metrics: venue uPnL preserved; Phoenix-only fee accounting');
