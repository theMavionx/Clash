import { bulkPositionId } from './bulkTrading.js';

const finite = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

/** Native uPnL is authoritative. BULK's position return is unleveraged;
 * margin ROI is a different metric and must not replace it in shared UI. */
export function normalizeBulkPosition(position) {
  const signedSize = finite(position.size) ?? 0;
  const amount = Math.abs(signedSize);
  const symbol = String(position.symbol || position.coin || '').toUpperCase().replace(/[-/](USD|USDC|PERP)$/i, '');
  const entry = finite(position.price ?? position.entryPrice);
  const mark = finite(position.fairPrice ?? position.fair_price);
  const pnl = finite(position.unrealizedPnl ?? position.unrealized_pnl)
    ?? (entry != null && mark != null ? signedSize * (mark - entry) : null);
  const entryNotional = entry > 0 ? amount * entry : null;
  return {
    ...position, dex: 'bulk', source: 'bulk', pnl_source: 'bulk_api', symbol,
    side: signedSize >= 0 ? 'bid' : 'ask', amount, size: amount,
    entry_price: entry, mark_price: mark, unrealized_pnl: pnl,
    entry_notional: entryNotional,
    pnl_pct: entryNotional > 0 && pnl != null ? pnl / entryNotional * 100 : null,
    pnl_percentage_basis: 'entry_notional',
    liquidation_price: finite(position.liquidationPrice ?? position.liquidation_price),
    is_isolated: position.iso === true,
    trade_index: bulkPositionId(position),
  };
}

function normalizeLevel(level, index) {
  const price = Array.isArray(level)
    ? level[0]
    : level?.px ?? level?.price ?? level?.p;
  const amount = Array.isArray(level)
    ? level[1]
    : level?.sz ?? level?.size ?? level?.amount ?? level?.a;
  return {
    price: Number(price),
    amount: Number(amount),
    count: Array.isArray(level) ? index + 1 : Number(level?.n ?? level?.count ?? index + 1),
  };
}

function normalizeLevels(levels) {
  return (Array.isArray(levels) ? levels : [])
    .slice(0, 12)
    .map(normalizeLevel)
    .filter(level => Number.isFinite(level.price) && Number.isFinite(level.amount));
}

/** Normalize both the live v0.1.2 `levels: [bids, asks]` snapshot and the
 * named `bids`/`asks` shape used by a few beta API builds. */
export function normalizeBulkOrderBook(payload) {
  const data = payload?.data || payload || {};
  const splitLevels = Array.isArray(data.levels) ? data.levels : [];
  return {
    bids: normalizeLevels(data.bids ?? splitLevels[0]),
    asks: normalizeLevels(data.asks ?? splitLevels[1]),
  };
}
