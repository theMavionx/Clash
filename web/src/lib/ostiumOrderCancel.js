function integerOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function ostiumCancelIdentity(order) {
  if (!order || typeof order !== 'object') return null;
  const pairId = integerOrNull(
    order.pairId
    ?? order.pair_id
    ?? order.pair_index
    ?? order._raw?.pairId
    ?? order._raw?.pair_index,
  );
  const idx = integerOrNull(
    order.idx
    ?? order.order_id
    ?? order.orderId
    ?? order.i
    ?? order._raw?.idx
    ?? order._raw?.orderId,
  );
  if (pairId == null || idx == null) return null;
  return { pairId, idx };
}

export function resolveOstiumCancelTarget(orders, { orderId, pairIndex, symbol } = {}) {
  const candidates = (Array.isArray(orders) ? orders : [])
    .map(order => ({ order, identity: ostiumCancelIdentity(order) }))
    .filter(candidate => candidate.identity);
  const requestedIdx = integerOrNull(orderId);
  const requestedPair = integerOrNull(pairIndex);

  if (requestedIdx != null) {
    const exact = candidates.filter(candidate => (
      candidate.identity.idx === requestedIdx
      && (requestedPair == null || candidate.identity.pairId === requestedPair)
    ));
    if (exact.length === 1) return { ...exact[0].identity, order: exact[0].order };
    // Never silently replace an explicit order index with another order on the pair.
    return null;
  }

  let scoped = candidates;
  if (requestedPair != null) {
    scoped = scoped.filter(candidate => candidate.identity.pairId === requestedPair);
  }
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (normalizedSymbol) {
    scoped = scoped.filter(candidate => (
      String(candidate.order?.symbol || candidate.order?.pairFrom || '').trim().toUpperCase() === normalizedSymbol
    ));
  }
  return scoped.length === 1 ? { ...scoped[0].identity, order: scoped[0].order } : null;
}

export function ostiumOrderMatchesTarget(order, target) {
  const identity = ostiumCancelIdentity(order);
  return !!identity
    && identity.pairId === Number(target?.pairId)
    && identity.idx === Number(target?.idx);
}
