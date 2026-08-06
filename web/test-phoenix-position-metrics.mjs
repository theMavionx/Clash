import assert from 'node:assert/strict';
import {
  calculatePhoenixGrossPositionPnl,
  calculatePhoenixNetPositionPnl,
  normalizePhoenixSignedQuoteLots,
  phoenixEffectiveTakerFeeRate,
  phoenixMarketMakerFeeRate,
  phoenixMarketTakerFeeRate,
  phoenixPositionDisplayMetrics,
  sumPhoenixGrossPositionPnl,
} from './src/lib/phoenixPositionMetrics.js';

function closeTo(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

const sdkMarket = {
  fees: {
    makerFeeMicro: 50,
    takerFeeMicro: 350,
  },
};
closeTo(phoenixMarketMakerFeeRate(sdkMarket), 0.00005);
closeTo(phoenixMarketTakerFeeRate(sdkMarket), 0.00035);
closeTo(phoenixEffectiveTakerFeeRate({
  market: sdkMarket,
  takerFeeMultiplier: 1,
  builderFeeRate: 0.0001,
}), 0.00045);

assert.equal(normalizePhoenixSignedQuoteLots('30800'), '30800');
assert.equal(normalizePhoenixSignedQuoteLots('-30800'), '-30800');
assert.equal(normalizePhoenixSignedQuoteLots(null), '0');

const flatLong = calculatePhoenixNetPositionPnl({
  side: 'bid',
  amount: 0.1,
  entryPrice: 100,
  markPrice: 100,
  margin: 2,
  feeRate: 0.001,
});
closeTo(flatLong.grossPnlUsd, 0);
closeTo(flatLong.openingFeeUsd, 0.01);
closeTo(flatLong.closingFeeUsd, 0.01);
closeTo(flatLong.netPnlUsd, -0.02);
closeTo(flatLong.pnlPct, -1);

const profitableLong = calculatePhoenixNetPositionPnl({
  side: 'bid',
  amount: 0.1,
  entryPrice: 100,
  markPrice: 110,
  margin: 2,
  feeRate: 0.001,
});
closeTo(profitableLong.grossPnlUsd, 1);
closeTo(profitableLong.totalFeeUsd, 0.021);
closeTo(profitableLong.netPnlUsd, 0.979);
closeTo(profitableLong.pnlPct, 48.95);

const profitableShort = calculatePhoenixNetPositionPnl({
  side: 'ask',
  amount: 0.1,
  entryPrice: 100,
  markPrice: 90,
  margin: 2,
  feeRate: 0.001,
});
closeTo(profitableShort.grossPnlUsd, 1);
closeTo(profitableShort.totalFeeUsd, 0.019);
closeTo(profitableShort.netPnlUsd, 0.981);

const authoritativeGross = calculatePhoenixNetPositionPnl({
  side: 'bid',
  amount: 0.1,
  entryPrice: 100,
  markPrice: 110,
  grossPnlUsd: -2,
  feeRate: 0.001,
});
closeTo(authoritativeGross.grossPnlUsd, -2);
closeTo(authoritativeGross.netPnlUsd, -2.021);

// Entry fees are already deducted from Phoenix collateral. Position cards use
// net PnL, but account equity must only move with gross unrealized PnL.
closeTo(sumPhoenixGrossPositionPnl([
  { pnl_gross_usd: 1, pnl_usd: 0.979 },
  { pnl_gross_usd: -2, pnl_usd: -2.021 },
]), -1);

// Ameer Pirate's live on-chain BTC isolated position. Phoenix reports a 40x
// protocol margin requirement, but its UI shows leverage against current
// isolated equity and ROE against the funded collateral.
const isolatedBtc = phoenixPositionDisplayMetrics({
  isIsolated: true,
  positionValue: 4963.189,
  positionInitialMargin: 124.079725,
  accountCollateral: 509.283663,
  portfolioValue: 474.951863,
  grossPnlUsd: -34.301,
});
closeTo(isolatedBtc.margin, 509.283663);
closeTo(isolatedBtc.leverage, 10.4);
closeTo(isolatedBtc.grossPnlPct, (-34.301 / 509.283663) * 100);
closeTo(isolatedBtc.equityBeforePnl, 509.252863);
closeTo(isolatedBtc.positionInitialMargin, 124.079725);

const crossRiskMargin = phoenixPositionDisplayMetrics({
  positionValue: 1015.9075,
  positionInitialMargin: 101.59075,
  accountCollateral: 690.932429,
  portfolioValue: 673.211674,
  grossPnlUsd: -17.6624,
});
closeTo(crossRiskMargin.margin, 101.59075);
closeTo(crossRiskMargin.leverage, 10);

// Exact Phoenix cost basis comes from the signed virtual quote position, not
// the rounded entry-price label. This remains exact as WS marks move.
closeTo(calculatePhoenixGrossPositionPnl({
  side: 'bid',
  amount: 0.077,
  entryPrice: 64902,
  markPrice: 64457,
  virtualQuotePositionUsd: -4997.49,
}), -34.301);

console.log('Phoenix position fee/PnL regression checks passed.');
