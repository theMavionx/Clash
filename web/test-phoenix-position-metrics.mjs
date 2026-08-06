import assert from 'node:assert/strict';
import {
  calculatePhoenixNetPositionPnl,
  phoenixEffectiveTakerFeeRate,
  phoenixMarketMakerFeeRate,
  phoenixMarketTakerFeeRate,
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

console.log('Phoenix position fee/PnL regression checks passed.');
