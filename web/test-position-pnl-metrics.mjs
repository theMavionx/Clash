import assert from 'node:assert/strict';
import {
  FEE_AWARE_POSITION_DEXES,
  calculateFeeAwarePositionPnl,
  findPositionMarket,
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

const cases = [
  ['pacifica', { account: { taker_fee: 0.0003 } }, 20 - (200 * 0.0005 + 220 * 0.0005)],
  ['avantis', { market: { symbol: 'BTC/USD', openFeeP: 0.045, closeFeeP: 0.04 } }, 20 - (200 * 0.00045 + 220 * 0.0004)],
  ['decibel', { account: { taker_fee: 0.0003 } }, 20 - (200 * 0.0004 + 220 * 0.0004)],
  ['monad', { market: { symbol: 'BTC', _raw: { config: { taker_fee: 690 } } } }, 20 - (200 * 0.00069 + 220 * 0.00069)],
  ['hyperliquid', { account: { taker_fee: 0.00035 } }, 20 - (200 * 0.00045 + 220 * 0.00045)],
  ['risex', { account: { taker_fee: 0.0005 } }, 20 - (200 * 0.0006 + 220 * 0.0006)],
  ['nado', { account: { taker_fee: 0.0003 } }, 20 - (200 * 0.0004 + 220 * 0.0004)],
  ['hibachi', { account: { taker_fee: 0.0004 } }, 20 - (200 * 0.0004 + 220 * 0.0004)],
  ['hotstuff', { account: { taker_fee: 0.0004 } }, 20 - (200 * 0.0005 + 220 * 0.0005)],
  ['grvt', {}, 20 - (200 * 0.00055 + 220 * 0.00055)],
  ['katana', { market: { symbol: 'BTC', _raw: { takerFeeRate: '0.00019' } } }, 20 - (200 * 0.00019 + 220 * 0.00019)],
  ['gmtrade', {}, 20 - (200 * 0.0006 + 220 * 0.0006)],
  ['lighter', { market: { symbol: 'BTC', taker_fee: 0 } }, 20 - (200 * 0.0001 + 220 * 0.0001)],
  ['bulk', {}, 20 - (200 * 0.0001 + 220 * 0.0001)],
  ['ostium', { market: { symbol: 'BTC', open_fee_bps: 6, close_fee_bps: 0, builder_fee_bps: 2 } }, 20 - (200 * 0.0008 + 220 * 0.0002)],
];

for (const [dex, context, expected] of cases) {
  const result = calculateFeeAwarePositionPnl({ dex, ...base, ...context });
  assert.equal(result.feeAdjusted, true, `${dex} should be fee adjusted`);
  approx(result.netPnlUsd, expected, `${dex} net PnL`);
  approx(result.pnlPct, expected, `${dex} net PnL percent`);
}

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

const gmx = calculateFeeAwarePositionPnl({
  dex: 'gmx',
  ...base,
  position: {
    ...base.position,
    pnl_gross_usd: 20,
    pnl_after_pending_fees_usd: 19.8,
    pending_position_fees_usd: 0.2,
    closing_fee_usd: 0.11,
    closing_price_impact_usd: -0.02,
  },
});
approx(gmx.netPnlUsd, 19.57, 'GMX SDK close costs plus opening estimate');
approx(gmx.totalFeeUsd, 0.43, 'GMX total deductions');

const flash = calculateFeeAwarePositionPnl({
  dex: 'flash',
  ...base,
  position: {
    ...base.position,
    pnl_without_fees_usd: 20,
    pnl_with_fees_usd: 19.8,
    flash_position_fees_usd: 0.2,
  },
});
approx(flash.openingFeeUsd, 0.102, 'Flash opening fee estimate');
approx(flash.netPnlUsd, 19.698, 'Flash live exit/borrow plus opening fee');

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
  ['avantis', 'bulk', 'decibel', 'flash', 'gmtrade', 'gmx', 'grvt', 'hibachi', 'hotstuff', 'hyperliquid', 'katana', 'lighter', 'monad', 'nado', 'ostium', 'pacifica', 'phoenix', 'risex'].sort(),
  'every FuturesPanel venue must be covered by fee-aware PnL',
);

console.log(`position PnL metrics: ${FEE_AWARE_POSITION_DEXES.length} venues covered`);
