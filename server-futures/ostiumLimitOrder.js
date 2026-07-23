function nonNegativeInteger(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function canonicalLimitIdentity(raw = {}) {
  const canonicalId = String(raw?.id || raw?.canonicalId || '').trim();
  const parts = canonicalId.split('_');
  if (parts.length < 3) return null;

  const idx = nonNegativeInteger(parts.at(-1));
  const pairId = nonNegativeInteger(parts.at(-2));
  const expectedPairId = nonNegativeInteger(raw?.pair?.id ?? raw?.pairId ?? raw?.pair_id);
  if (idx == null || idx > 255 || pairId == null) return null;
  if (expectedPairId != null && pairId !== expectedPairId) return null;
  return { pairId, idx };
}

function localLimitIndex(raw = {}) {
  const canonical = canonicalLimitIdentity(raw);
  if (canonical) return canonical.idx;

  // Older Ostium subgraph versions exposed the local slot in orderId.
  // Current versions expose a global order id there, so only accept values
  // that can actually fit the contract's uint8 limit-order index.
  const legacy = nonNegativeInteger(raw?.idx ?? raw?.orderIndex ?? raw?.order_index ?? raw?.orderId);
  return legacy != null && legacy <= 255 ? legacy : null;
}

module.exports = {
  canonicalLimitIdentity,
  localLimitIndex,
};
