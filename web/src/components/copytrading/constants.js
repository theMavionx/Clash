// Venue catalogue and labels mirrored from ClashBot
// (egorble/copy-trading copy/main: src/copyTrading/venueCatalog.ts, CopyTradingPage.tsx).
import { DEX_CONFIG } from '../../contexts/DexContext';

/** Venues intentionally discoverable through ClashBot's public leaderboard UI. */
export const PUBLIC_LEADERBOARD_VENUES = [
  'hyperliquid', 'pacifica', 'decibel', 'nado', 'risex', 'lighter',
  'phoenix', 'gmx', 'reya', 'dydx',
];

/** Public leaderboard identities that may enter ClashBot copy setup. */
export const COPYABLE_SOURCE_VENUES = new Set([
  'nado', 'hyperliquid', 'pacifica', 'decibel', 'risex', 'lighter', 'phoenix', 'hotstuff', 'gmx', 'reya',
]);

/** Destinations ClashBot can execute (or practice) copies on. */
export const COPY_DESTINATION_VENUES = [
  'hyperliquid', 'pacifica', 'decibel', 'nado', 'risex', 'lighter', 'rhlighter',
  'phoenix', 'ondo', 'grvt', 'aster', 'hotstuff', 'katana', 'gmx',
];

export const VENUE_NAMES = {
  reya: 'Reya', dydx: 'dYdX', ostium: 'Ostium', hyperliquid: 'Hyperliquid', pacifica: 'Pacifica',
  decibel: 'Decibel', nado: 'NADO', risex: 'RISEx', lighter: 'Lighter', rhlighter: 'Robinhood Lighter',
  phoenix: 'Phoenix', ondo: 'Ondo Perps', grvt: 'GRVT', aster: 'Aster', hotstuff: 'Hotstuff',
  katana: 'Katana', gmx: 'GMX',
};

const EXTRA_LOGOS = {
  reya: '/copytrading/reya.svg',
  dydx: '/copytrading/dydx.svg',
};

export function venueName(venue) {
  return VENUE_NAMES[venue] || String(venue || '');
}

export function venueLogo(venue) {
  return DEX_CONFIG[venue]?.logo || EXTRA_LOGOS[venue] || '';
}

export const WINDOWS = [
  { value: '1d', label: '1 day', short: '1D' },
  { value: '7d', label: '7 days', short: '7D' },
  { value: '30d', label: '30 days', short: '30D' },
  { value: '90d', label: '90 days', short: '90D' },
  { value: 'all', label: 'All time', short: 'All' },
];

export const WINDOW_LABELS = Object.fromEntries(WINDOWS.map((item) => [item.value, item.label]));

export const SORT_LABELS = {
  copyScore: 'Copy score',
  pnlUsd: 'PnL $',
  roi: 'ROI',
  volume: 'Volume $',
  accountValue: 'Balance',
  trades: 'Trades',
  winRate: 'Win rate',
};

export const CAPITAL_PROFILE_LABELS = {
  whale: ['Whale', '$1M+ published account equity'],
  shark: ['Shark', '$250K-$1M published account equity'],
  dolphin: ['Dolphin', '$50K-$250K published account equity'],
  fish: ['Fish', '$10K-$50K published account equity'],
  shrimp: ['Shrimp', 'Below $10K published account equity'],
};

export const TRADER_DETAIL_RANK_LIMIT = 500;
export const MIN_PUBLISHED_WIN_RATE_TRADES = 2;

/** ClashBot copy app (its wallet sign-in is bound to this origin). */
export const CLASHBOT_COPY_URL = 'https://copy.clashbot.fun/copy-trading';

/** Deep link that opens ClashBot's analysis (with its Copy button) for one trader. */
export function clashbotTraderUrl(venue, account) {
  const url = new URL(CLASHBOT_COPY_URL);
  url.searchParams.set('analysisVenue', venue);
  url.searchParams.set('analysisAccount', account);
  return url.toString();
}
