// Trader row helpers ported from clashbot/src/CopyTradingPage.tsx.
import { MIN_PUBLISHED_WIN_RATE_TRADES } from './constants';

export function traderKey(trader) {
  return `${trader.venue}:${trader.account}`;
}

export function enforceMinimumWinRateSample(trader) {
  const publishWinRate = trader.winRateTradesCount != null
    && trader.winRateTradesCount >= MIN_PUBLISHED_WIN_RATE_TRADES;
  const publishExchangeWinRate = trader.exchangeWinRateTradesCount != null
    && trader.exchangeWinRateTradesCount >= MIN_PUBLISHED_WIN_RATE_TRADES;
  if (publishWinRate && (trader.exchangeWinRatePercent == null || publishExchangeWinRate)) return trader;
  return {
    ...trader,
    ...(publishWinRate ? {} : {
      winRatePercent: null,
      standardWinRatePercent: null,
      pnlWeightedWinRatePercent: null,
      winRateGrossProfitUsd: null,
      winRateGrossLossUsd: null,
      winRateQuality: 'collecting',
      winRateWinsCount: null,
      winRateLossesCount: null,
      winRateBreakevenCount: null,
      winRateFillsCount: null,
    }),
    ...(publishExchangeWinRate ? {} : { exchangeWinRatePercent: null }),
  };
}

export function isRankedTrader(trader) {
  if (trader.quality === 'collecting') return false;
  return [trader.pnlUsd, trader.roiPercent, trader.volumeUsd, trader.winRatePercent].some((metric) => metric != null);
}

export function traderFromIdentity(venue, account) {
  return {
    rank: 0, venue, account, ownerAddress: null, displayName: null, avatarUrl: null,
    pnlUsd: null, roiPercent: null, volumeUsd: null, accountValueUsd: null,
    tradesCount: null, winRatePercent: null, winRateQuality: 'unavailable', winRateTradesCount: null,
    quality: 'collecting', pnlQuality: 'collecting', roiQuality: 'unavailable',
  };
}

export function traderFromSummary(summary) {
  const metric = summary?.metric || {};
  return enforceMinimumWinRateSample({
    ...traderFromIdentity(summary.venue, summary.account),
    ownerAddress: summary.ownerAddress ?? null,
    displayName: summary.displayName ?? null,
    avatarUrl: summary.avatarUrl ?? null,
    pnlUsd: metric.pnlUsd ?? null,
    roiPercent: metric.roiPercent ?? null,
    volumeUsd: metric.volumeUsd ?? null,
    accountValueUsd: metric.accountValueUsd ?? null,
    tradesCount: metric.tradesCount ?? null,
    winRatePercent: metric.winRatePercent ?? null,
    winRateQuality: metric.winRateQuality ?? 'unavailable',
    winRateTradesCount: metric.winRateTradesCount ?? null,
    quality: metric.quality ?? 'collecting',
    pnlQuality: metric.pnlQuality ?? 'collecting',
    roiQuality: metric.roiQuality ?? 'unavailable',
    copyScore: metric.copyScore ?? null,
    copyScoreDetails: metric.copyScoreDetails ?? null,
    minimumCopyBalanceUsd: metric.minimumCopyBalanceUsd ?? null,
    capitalTier: metric.capitalTier ?? null,
    traderPattern: metric.traderPattern ?? null,
    traderPatternConfidence: metric.traderPatternConfidence ?? null,
    positionBias: metric.positionBias ?? null,
  });
}

/** "Waiting for … sync" / "Synced 5m ago" from venue status rows. */
export function selectedVenueFreshness(statuses, venues, venueName) {
  const byVenue = new Map(statuses.map((status) => [status.venue, status]));
  const pending = venues.filter((venue) => Number(byVenue.get(venue)?.last_success_at || 0) <= 0);
  if (pending.length > 0) {
    return pending.length === 1
      ? `Waiting for ${venueName(pending[0])} first sync`
      : `Waiting for ${pending.length} exchanges to sync`;
  }
  let oldest = null;
  for (const venue of venues) {
    const timestamp = Number(byVenue.get(venue)?.last_success_at);
    if (!oldest || timestamp < oldest.timestamp) oldest = { venue, timestamp };
  }
  if (!oldest?.timestamp) return 'Waiting for first sync';
  const minutes = Math.max(0, Math.round((Date.now() - oldest.timestamp) / 60_000));
  const synced = minutes < 2 ? 'Synced just now'
    : minutes < 60 ? `Synced ${minutes}m ago`
      : `Synced ${Math.floor(minutes / 60)}h ago`;
  return venues.length > 1 ? `Oldest source: ${venueName(oldest.venue)} · ${synced}` : synced;
}
