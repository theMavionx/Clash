// Port of ClashBot copy/main src/copyTrading/leaderboardPreferences.ts and
// exactAccountSearch.ts (filter state, applied-filter chips, validation,
// exact-account lookups and persisted UI preferences).

const FILTER_LABELS = {
  lastTradeAge: {
    '5m': 'Trade within 5m', '30m': 'Trade within 30m', '1h': 'Trade within 1h',
    '3h': 'Trade within 3h', '6h': 'Trade within 6h', '12h': 'Trade within 12h',
    '24h+': 'Last trade 24h+ ago',
  },
  metricQuality: {
    ready: 'Ready metrics', native: 'Native metrics', calculated: 'Verified calculations',
    partial: 'Partial history', estimated: 'Estimated', collecting: 'Still collecting', unavailable: 'Unavailable upstream',
  },
  capitalTier: { whale: 'Whale', shark: 'Shark', dolphin: 'Dolphin', fish: 'Fish', shrimp: 'Shrimp' },
  activityLevel: {
    very_high: 'Very high activity', high: 'High activity', active: 'Active trader',
    regular: 'Regular trader', occasional: 'Occasional trader',
  },
  traderPattern: {
    automation_like: 'Automation-like', discretionary_like: 'Likely discretionary', mixed: 'Mixed pattern',
  },
  positionBias: {
    long: 'Long biased', short: 'Short biased', balanced: 'Balanced book', flat: 'Currently flat',
  },
};

function compactNumber(value, prefix = '', suffix = '') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${prefix}${value}${suffix}`;
  const formatted = new Intl.NumberFormat('en-US', {
    notation: Math.abs(amount) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 2,
  }).format(amount);
  return `${prefix}${formatted}${suffix}`;
}

function rangeLabel(name, minimum, maximum, prefix = '', suffix = '') {
  if (minimum !== '' && maximum !== '') {
    return `${name}: ${compactNumber(minimum, prefix, suffix)}–${compactNumber(maximum, prefix, suffix)}`;
  }
  if (minimum !== '') return `${name}: ${compactNumber(minimum, prefix, suffix)}+`;
  return `${name}: up to ${compactNumber(maximum, prefix, suffix)}`;
}

export function defaultLeaderboardFilters(venues) {
  return {
    venues: [...venues], sort: 'pnlUsd', direction: 'desc', minVolume: '0',
    minWinRateTrades: '0', winRateMode: 'standard', lastTradeAge: 'any',
    minAccountValue: '', maxAccountValue: '', maxCopyBalance: '', minPnl: '', maxPnl: '',
    minRoi: '', maxRoi: '', minWinRate: '', maxWinRate: '', metricQuality: 'any',
    capitalTier: 'any', activityLevel: 'any', traderPattern: 'any',
    positionBias: 'any', copyableOnly: false,
  };
}

export function describeAppliedLeaderboardFilters(value, allVenues, venueName = (venue) => venue) {
  const filters = [];
  if (value.venues.length < allVenues.length) {
    const labels = value.venues.map(venueName);
    const visible = labels.slice(0, 2).join(', ');
    filters.push({
      key: 'venues', section: 'markets',
      label: `Exchanges: ${visible}${labels.length > 2 ? ` +${labels.length - 2}` : ''}`,
    });
  }
  if (value.minVolume !== '0') filters.push({ key: 'volume', section: 'markets', label: `Volume: ${compactNumber(value.minVolume, '$')}+` });
  if (value.minWinRateTrades !== '0') filters.push({ key: 'sample', section: 'markets', label: `Closed trades: ${value.minWinRateTrades}+` });
  if (value.winRateMode !== 'standard') filters.push({ key: 'formula', section: 'metrics', label: 'PnL-weighted win rate' });
  if (value.lastTradeAge !== 'any') filters.push({ key: 'recency', section: 'markets', label: FILTER_LABELS.lastTradeAge[value.lastTradeAge] });
  if (value.minAccountValue !== '' || value.maxAccountValue !== '') filters.push({ key: 'accountValue', section: 'metrics', label: rangeLabel('Account', value.minAccountValue, value.maxAccountValue, '$') });
  if (value.maxCopyBalance !== '') filters.push({ key: 'copyBalance', section: 'metrics', label: `Copy balance: up to ${compactNumber(value.maxCopyBalance, '$')}` });
  if (value.minPnl !== '' || value.maxPnl !== '') filters.push({ key: 'pnl', section: 'metrics', label: rangeLabel('PnL', value.minPnl, value.maxPnl, '$') });
  if (value.minRoi !== '' || value.maxRoi !== '') filters.push({ key: 'roi', section: 'metrics', label: rangeLabel('ROI', value.minRoi, value.maxRoi, '', '%') });
  if (value.minWinRate !== '' || value.maxWinRate !== '') filters.push({ key: 'winRate', section: 'metrics', label: rangeLabel('Win rate', value.minWinRate, value.maxWinRate, '', '%') });
  if (value.metricQuality !== 'any') filters.push({ key: 'quality', section: 'metrics', label: FILTER_LABELS.metricQuality[value.metricQuality] });
  if (value.capitalTier !== 'any') filters.push({ key: 'capital', section: 'profile', label: FILTER_LABELS.capitalTier[value.capitalTier] });
  if (value.activityLevel !== 'any') filters.push({ key: 'activity', section: 'profile', label: FILTER_LABELS.activityLevel[value.activityLevel] });
  if (value.traderPattern !== 'any') filters.push({ key: 'pattern', section: 'profile', label: FILTER_LABELS.traderPattern[value.traderPattern] });
  if (value.positionBias !== 'any') filters.push({ key: 'position', section: 'profile', label: FILTER_LABELS.positionBias[value.positionBias] });
  if (value.copyableOnly) filters.push({ key: 'copyable', section: 'profile', label: 'Copyable only' });
  return filters;
}

export function clearLeaderboardFilter(value, key, allVenues) {
  const next = { ...value, venues: [...value.venues] };
  if (key === 'venues') next.venues = [...allVenues];
  if (key === 'volume') next.minVolume = '0';
  if (key === 'sample') next.minWinRateTrades = '0';
  if (key === 'formula') next.winRateMode = 'standard';
  if (key === 'recency') next.lastTradeAge = 'any';
  if (key === 'accountValue') { next.minAccountValue = ''; next.maxAccountValue = ''; }
  if (key === 'copyBalance') next.maxCopyBalance = '';
  if (key === 'pnl') { next.minPnl = ''; next.maxPnl = ''; }
  if (key === 'roi') { next.minRoi = ''; next.maxRoi = ''; }
  if (key === 'winRate') { next.minWinRate = ''; next.maxWinRate = ''; }
  if (key === 'quality') next.metricQuality = 'any';
  if (key === 'capital') next.capitalTier = 'any';
  if (key === 'activity') next.activityLevel = 'any';
  if (key === 'pattern') next.traderPattern = 'any';
  if (key === 'position') next.positionBias = 'any';
  if (key === 'copyable') next.copyableOnly = false;
  return next;
}

export function validateLeaderboardFilters(value) {
  const errors = [];
  if (value.venues.length === 0) errors.push('Select at least one exchange.');
  const validateRange = (label, minimum, maximum, bounds = {}) => {
    const min = minimum === '' ? null : Number(minimum);
    const max = maximum === '' ? null : Number(maximum);
    if ((min != null && !Number.isFinite(min)) || (max != null && !Number.isFinite(max))) {
      errors.push(`${label} must be a valid number.`);
      return;
    }
    if (min != null && bounds.minimum != null && min < bounds.minimum) errors.push(`${label} cannot be below ${bounds.minimum}.`);
    if (max != null && bounds.minimum != null && max < bounds.minimum) errors.push(`${label} cannot be below ${bounds.minimum}.`);
    if (min != null && bounds.maximum != null && min > bounds.maximum) errors.push(`${label} cannot exceed ${bounds.maximum}.`);
    if (max != null && bounds.maximum != null && max > bounds.maximum) errors.push(`${label} cannot exceed ${bounds.maximum}.`);
    if (min != null && max != null && min > max) errors.push(`${label} minimum cannot exceed its maximum.`);
  };
  validateRange('Account value', value.minAccountValue, value.maxAccountValue, { minimum: 0 });
  validateRange('Maximum copy balance', '', value.maxCopyBalance, { minimum: 0 });
  validateRange('PnL', value.minPnl, value.maxPnl);
  validateRange('ROI', value.minRoi, value.maxRoi);
  validateRange('Win rate', value.minWinRate, value.maxWinRate, { minimum: 0, maximum: 100 });
  return errors;
}

/** Criteria that can hide indexed traders; venue, window and sort are kept. */
export function relaxedLeaderboardFilters(value) {
  return {
    ...value,
    minVolume: '0', minWinRateTrades: '0', winRateMode: 'standard', lastTradeAge: 'any',
    minAccountValue: '', maxAccountValue: '', maxCopyBalance: '', minPnl: '', maxPnl: '', minRoi: '', maxRoi: '',
    minWinRate: '', maxWinRate: '', metricQuality: 'any', capitalTier: 'any',
    activityLevel: 'any', traderPattern: 'any', positionBias: 'any', copyableOnly: false,
  };
}

const EVM_ACCOUNT = /^0x[0-9a-f]{40}$/i;
const APTOS_ACCOUNT = /^0x[0-9a-f]{64}$/i;
const SOLANA_ACCOUNT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const NUMERIC_ACCOUNT = /^\d{1,30}$/;

/** A full account identity is a profile lookup; discovery filters must not hide it. */
export function isExactAccountSearch(value) {
  const search = String(value || '').trim();
  return EVM_ACCOUNT.test(search) || APTOS_ACCOUNT.test(search)
    || SOLANA_ACCOUNT.test(search) || NUMERIC_ACCOUNT.test(search);
}

const EXACT_ACCOUNT_OVERRIDES = {
  venues: '', minVolumeUsd: '', minWinRateTrades: '', lastTradeAge: 'any',
  minAccountValueUsd: '', maxAccountValueUsd: '', maxCopyBalanceUsd: '', minPnlUsd: '', maxPnlUsd: '',
  minRoiPercent: '', maxRoiPercent: '', minWinRatePercent: '', maxWinRatePercent: '',
  metricQuality: 'any', capitalTier: 'any', activityLevel: 'any', traderPattern: 'any',
  positionBias: 'any', copyableOnly: 'false', page: '1',
};

/** Map filter state onto ClashBot's leaderboard query parameter names. */
export function leaderboardQuery(filters, { window, search, page, limit = 25, includeCollecting = false }) {
  const base = {
    window,
    venues: filters.venues.join(','),
    sort: filters.sort,
    direction: filters.direction,
    minVolumeUsd: filters.minVolume,
    minWinRateTrades: filters.minWinRateTrades,
    winRateMode: filters.winRateMode,
    lastTradeAge: filters.lastTradeAge,
    minAccountValueUsd: filters.minAccountValue,
    maxAccountValueUsd: filters.maxAccountValue,
    maxCopyBalanceUsd: filters.maxCopyBalance,
    minPnlUsd: filters.minPnl,
    maxPnlUsd: filters.maxPnl,
    minRoiPercent: filters.minRoi,
    maxRoiPercent: filters.maxRoi,
    minWinRatePercent: filters.minWinRate,
    maxWinRatePercent: filters.maxWinRate,
    metricQuality: filters.metricQuality,
    capitalTier: filters.capitalTier,
    activityLevel: filters.activityLevel,
    traderPattern: filters.traderPattern,
    positionBias: filters.positionBias,
    copyableOnly: String(filters.copyableOnly),
    evidence: includeCollecting ? 'collecting' : 'verified',
    search,
    page: String(page),
    limit: String(limit),
  };
  return isExactAccountSearch(search) ? { ...base, ...EXACT_ACCOUNT_OVERRIDES } : base;
}

const VENUES_WITHOUT_BULK_ACCOUNT_EQUITY = { nado: 'NADO', lighter: 'Lighter', gmx: 'GMX' };

/** Port of clashbot/src/copyTrading/leaderboardEvidence.ts. */
export function capitalCohortEvidenceNote(venues, capitalTier) {
  const tierLabel = FILTER_LABELS.capitalTier[capitalTier];
  if (!tierLabel) return null;
  const missing = venues.map((venue) => VENUES_WITHOUT_BULK_ACCOUNT_EQUITY[venue]).filter(Boolean);
  if (missing.length === 0) return null;
  const list = missing.length === 1
    ? missing[0]
    : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`;
  return `${tierLabel} requires published leaderboard account equity. ${list} do not provide bulk equity in the indexed feed, so they cannot match this filter.`;
}

const STORAGE_KEY = 'clash.copytrading.leaderboard.v1';
const ENUMS = {
  view: ['leaderboard', 'bots'],
  window: ['1d', '7d', '30d', '90d', 'all'],
  sort: ['copyScore', 'pnlUsd', 'roi', 'volume', 'accountValue', 'trades', 'winRate'],
  direction: ['asc', 'desc'],
  winRateMode: ['standard', 'pnlWeighted'],
  lastTradeAge: ['any', '5m', '30m', '1h', '3h', '6h', '12h', '24h+'],
  metricQuality: ['any', 'ready', 'native', 'calculated', 'partial', 'estimated', 'collecting', 'unavailable'],
  capitalTier: ['any', 'whale', 'shark', 'dolphin', 'fish', 'shrimp'],
  activityLevel: ['any', 'very_high', 'high', 'active', 'regular', 'occasional'],
  traderPattern: ['any', 'automation_like', 'discretionary_like', 'mixed'],
  positionBias: ['any', 'long', 'short', 'balanced', 'flat'],
};
const NUMERIC_KEYS = [
  'minVolume', 'minWinRateTrades', 'minAccountValue', 'maxAccountValue', 'maxCopyBalance', 'minPnl', 'maxPnl',
  'minRoi', 'maxRoi', 'minWinRate', 'maxWinRate',
];

/** Returns validated stored preferences or null. Never throws. */
export function readLeaderboardPreferences(allowedVenues) {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const source = JSON.parse(raw);
    if (!source || typeof source !== 'object' || source.version !== 1) return null;
    const allowed = new Set(allowedVenues);
    const venues = Array.isArray(source.venues)
      ? [...new Set(source.venues.filter((venue) => typeof venue === 'string' && allowed.has(venue)))]
      : [];
    if (venues.length === 0) return null;
    const out = { venues };
    for (const [key, values] of Object.entries(ENUMS)) {
      if (!values.includes(source[key])) return null;
      out[key] = source[key];
    }
    for (const key of NUMERIC_KEYS) {
      const value = source[key] ?? (key === 'maxCopyBalance' ? '' : undefined);
      if (typeof value !== 'string' || value.length > 64 || (value !== '' && !Number.isFinite(Number(value)))) return null;
      out[key] = value;
    }
    if (typeof source.copyableOnly !== 'boolean') return null;
    out.copyableOnly = source.copyableOnly;
    out.search = typeof source.search === 'string' && source.search.length <= 200 ? source.search : '';
    out.includeCollecting = source.includeCollecting === true;
    return out;
  } catch {
    return null;
  }
}

export function writeLeaderboardPreferences(preferences) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...preferences }));
  } catch {
    // Storage may be unavailable (private mode / quota); the UI still works.
  }
}
