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
