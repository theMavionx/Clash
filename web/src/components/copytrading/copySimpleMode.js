// ClashBot simple-mode copy settings and the budget projection shown before starting a bot.
import { CHART_DAY_MS } from './dailyChartEvidence';

/**
 * ClashBot simple-mode config (CopyTradingSetupModal initialSetup + simpleCopyRiskPreset,
 * egorble/copy-trading src/copyTrading/riskPresets.ts): smart sizing at 100% of the
 * trader's proportion, the whole budget as the cap, ClashBot defaults for the rest.
 */
export function simpleCopyConfig(budgetUsd, base = {}) {
  const allocationUsd = Number(budgetUsd);
  return {
    proportionalMultiplier: 0.1, fixedMarginUsd: 50, portfolioPercent: 2, fixedLeverage: 3,
    takeProfitEnabled: false, takeProfitPercent: 30, stopLossEnabled: false, stopLossPercent: 15,
    traderStopEnabled: false, traderStopPercent: 20, dailyLossEnabled: false, dailyLossPercent: 7.5,
    consecutiveLossLimit: 4, cooldownHours: 12, maxSignalAgeSeconds: 60,
    ...base,
    sizeMode: 'smart', smartScalePercent: 100, allocationUsd, reservePercent: 0, minMarginUsd: 0,
    maxMarginUsd: Math.min(allocationUsd, 10_000_000), maxDailyMarginUsd: allocationUsd, maxDailyMarginEnabled: false,
    maxAssetMarginUsd: allocationUsd, maxOpenPositionsEnabled: false, maxOpenPositions: 8,
    leverageMode: 'follow_capped', leverageCap: 10, assetMode: 'all', assets: [], direction: 'both',
    maxWorseEntryPercent: 0.5, maxSlippagePercent: 0.5, processingWindowEnabled: true,
    orderStyle: 'always_taker', makerFallbackPolicy: 'taker', makerRestSeconds: 120,
    copyPositionAdds: true, copyPartialCloses: true, closeOnReverse: true, skipExistingPositions: true,
    skipUnsupportedMarkets: true, minimumOrderPolicy: 'skip', maxMinimumOrderOversizePercent: 0,
    allowLateEntryIfPriceUnchanged: false, stopBehavior: 'manual',
    editorPreferences: { setupMode: 'simple', simpleBalancePercent: 100, simpleRiskScaleOverrideEnabled: false, simplePositionLimitOverrideEnabled: false },
  };
}

/**
 * What `budget` would have made following the trader over the last `days`:
 * ClashBot's smart sizing scales every position by budget / trader equity, so
 * each verified daily PnL is scaled the same way. Losses are capped at the
 * budget. Days without published evidence are skipped (and flagged).
 */
export function projectCopyOutcome({ points, equityUsd, budgetUsd, days, now }) {
  const budget = Number(budgetUsd);
  if (!(equityUsd > 0) || !(budget > 0)) return null;
  const today = Math.floor(now / CHART_DAY_MS) * CHART_DAY_MS;
  const start = today - (days - 1) * CHART_DAY_MS;
  const byDay = new Map();
  for (const point of points || []) {
    if (Number.isSafeInteger(point?.timestamp) && point.timestamp >= start && point.timestamp <= now
      && typeof point.dailyPnlUsd === 'number' && Number.isFinite(point.dailyPnlUsd)) byDay.set(point.timestamp, point.dailyPnlUsd);
  }
  if (byDay.size === 0) return null;
  const ratio = budget / equityUsd;
  let total = 0;
  const series = [];
  for (const [timestamp, pnl] of [...byDay].sort(([a], [b]) => a - b)) {
    total = Math.max(-budget, total + pnl * ratio);
    series.push({ timestamp, value: total });
  }
  return { pnlUsd: total, percent: (total / budget) * 100, series, coveredDays: byDay.size, days, partial: byDay.size < days };
}
