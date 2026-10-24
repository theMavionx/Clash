export function compactCurrency(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(amount) >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(amount) >= 1_000 ? 1 : 2,
  }).format(amount);
}

export function signedCurrency(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${value > 0 ? '+' : ''}${compactCurrency(value)}`;
}

export function signedPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${value > 0 ? '+' : ''}${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

export function plainPercent(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })}%`;
}

export function usd(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function decimal(value, digits = 6) {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return amount.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function shortAccount(value, head = 7, tail = 5) {
  const text = String(value || '');
  if (text.length <= head + tail + 3) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function relativeTime(timestamp, empty = 'Never') {
  if (!timestamp) return empty;
  const elapsed = Math.max(0, Date.now() - Number(timestamp));
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

export function exactTime(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(Number(timestamp));
}

/** 1e18-scaled USD string (ClashBot stats) → "$1,234.56". */
export function x18Usd(value) {
  if (value == null) return null;
  let amount;
  try {
    amount = BigInt(value);
  } catch {
    return null;
  }
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const cents = (absolute + 5_000_000_000_000_000n) / 10_000_000_000_000_000n;
  const dollars = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (cents % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${dollars}.${fraction}`;
}

export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return '—';
  const value = Number(ms);
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
  return `${Math.round(value / 60_000)}m`;
}

export function missingMetric(quality) {
  if (quality === 'collecting') return 'Collecting';
  if (quality === 'unavailable') return 'N/A';
  if (quality === 'partial') return 'Partial';
  return '—';
}

export function tradePositionLabel(trade) {
  const side = trade?.positionSide === 'long' ? 'long' : trade?.positionSide === 'short' ? 'short' : 'position';
  const effect = trade?.positionEffect;
  if (effect === 'flipped') return `Flipped to ${side}`;
  if (!effect || effect === 'fill') return side[0].toUpperCase() + side.slice(1);
  return `${effect[0].toUpperCase()}${effect.slice(1)} ${side}`;
}
