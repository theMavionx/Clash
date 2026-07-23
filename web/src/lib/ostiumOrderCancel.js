function integerOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function localSlotFromCanonicalId(order) {
  const canonicalId = String(
    order?.canonical_order_id
    ?? order?.canonicalId
    ?? order?._raw?.canonicalId
    ?? order?._raw?.id
    ?? '',
  ).trim();
  const parts = canonicalId.split('_');
  if (parts.length < 3) return null;
  const idx = integerOrNull(parts.at(-1));
  const pairId = integerOrNull(parts.at(-2));
  const expectedPairId = integerOrNull(
    order?.pairId
    ?? order?.pair_id
    ?? order?.pair_index
    ?? order?._raw?.pairId
    ?? order?._raw?.pair_id,
  );
  if (idx == null || idx > 255 || pairId == null) return null;
  if (expectedPairId != null && pairId !== expectedPairId) return null;
  return idx;
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
    ?? order.order_index
    ?? order.orderIndex
    ?? order.i
    ?? order._raw?.idx
    ?? order._raw?.order_index
    ?? localSlotFromCanonicalId(order),
  );
  if (pairId == null || idx == null || idx > 255) return null;
  return { pairId, idx };
}

function ostiumOrderReferenceIds(order, identity) {
  return new Set([
    identity?.idx,
    order?.order_id,
    order?.orderId,
    order?.global_order_id,
    order?.globalOrderId,
    order?.canonical_order_id,
    order?.canonicalId,
    order?.unique_order_id,
    order?.uniqueId,
    order?._raw?.orderId,
    order?._raw?.globalOrderId,
    order?._raw?.canonicalId,
    order?._raw?.uniqueId,
  ].filter(value => value != null && value !== '').map(value => String(value)));
}

export function resolveOstiumCancelTarget(orders, { orderId, pairIndex, symbol } = {}) {
  const candidates = (Array.isArray(orders) ? orders : [])
    .map(order => {
      const identity = ostiumCancelIdentity(order);
      return { order, identity, references: ostiumOrderReferenceIds(order, identity) };
    })
    .filter(candidate => candidate.identity);
  const requestedId = orderId == null || orderId === '' ? '' : String(orderId);
  const requestedPair = integerOrNull(pairIndex);

  if (requestedId) {
    const exact = candidates.filter(candidate => (
      candidate.references.has(requestedId)
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
