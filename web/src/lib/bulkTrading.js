export function bulkPositionId(position) {
  return position.isoPubkey || position.trade_index || `cross:${position.symbol}`;
}

/** Shared UI uses positional arguments; old object callers remain supported. */
export function bulkCloseRequest(positions, symbolOrPosition, side, amount, tradeIndex) {
  const object = symbolOrPosition && typeof symbolOrPosition === 'object' ? symbolOrPosition : null;
  const symbol = object?.symbol || symbolOrPosition;
  const openSide = object?.side || side;
  if (!['bid', 'ask'].includes(openSide)) throw new Error('Bulk position side is unavailable. Refresh positions.');
  const matches = positions.filter(p => p.symbol === symbol && p.side === openSide
    && (!tradeIndex || bulkPositionId(p) === tradeIndex));
  const position = object || (matches.length === 1 ? matches[0] : null);
  if (!position) throw new Error('Bulk position is missing or ambiguous. Refresh positions before closing.');
  const available = Math.abs(Number(position.amount ?? position.size));
  const size = Number(object ? (amount ?? available) : amount);
  if (!Number.isFinite(size) || size <= 0 || !(available > 0) || size > available + 1e-10) {
    throw new Error('Invalid Bulk close amount. Refresh positions and try again.');
  }
  // Truncate UI multiplication dust; never round a partial close above the
  // requested amount. BULK wire amounts have eight decimal places.
  const exactSize = Math.floor(Math.min(size, available) * 1e8 + 1e-7) / 1e8;
  if (!(exactSize > 0)) throw new Error('Bulk close amount is below supported precision.');
  return { kind: 'market', symbol, side: openSide === 'bid' ? 'ask' : 'bid',
    size: exactSize.toFixed(8), reduce_only: true, isolated: position.iso === true || position.is_isolated === true };
}
