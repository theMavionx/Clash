export const AVANTIS_PRICE_SOURCING = Object.freeze({
  HERMES: 0,
  PRO: 1,
});

const EMPTY_PRICE_PAYLOAD = Object.freeze({
  priceUpdateData: '0x',
  price: 0,
  priceSourcing: null,
  source: null,
  publishTimestampMs: 0,
});

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function publishTimestampMs(row) {
  const rawMs = finitePositive(
    row?.publishTimestampMs
    ?? row?.publish_timestamp_ms
    ?? row?.timestampMs,
  );
  if (rawMs) return rawMs;
  const rawSeconds = finitePositive(
    row?.publishTimestamp
    ?? row?.publish_time
    ?? row?.publishTime,
  );
  return rawSeconds ? rawSeconds * 1000 : 0;
}

function normalizeCandidate(row, source, priceSourcing, { nowMs, maxAgeMs }) {
  if (!row || typeof row !== 'object') return null;
  const price = finitePositive(row.price);
  if (!price) return null;
  const publishedAt = publishTimestampMs(row);
  if (publishedAt && nowMs - publishedAt > maxAgeMs) return null;
  const rawUpdate = String(row.priceUpdateData || row.price_update_data || '0x');
  const priceUpdateData = /^0x[0-9a-f]+$/i.test(rawUpdate) && rawUpdate.length > 2
    ? rawUpdate
    : '0x';
  return {
    priceUpdateData,
    price,
    priceSourcing,
    source,
    publishTimestampMs: publishedAt,
  };
}

// Current Avantis feed-v3 responses commonly use `{ core: null, pro: {...} }`.
// Prefer Pyth Pro, retain legacy Core/Hermes compatibility, and reject
// explicitly stale payloads before they reach an on-chain action.
export function normalizeAvantisPriceUpdateResponse(payload, {
  nowMs = Date.now(),
  maxAgeMs = 60_000,
} = {}) {
  const options = { nowMs, maxAgeMs };
  const candidates = [
    normalizeCandidate(payload?.pro, 'pro', AVANTIS_PRICE_SOURCING.PRO, options),
    normalizeCandidate(payload?.core, 'core', AVANTIS_PRICE_SOURCING.HERMES, options),
  ].filter(Boolean);
  return candidates.find(candidate => candidate.priceUpdateData !== '0x')
    || candidates[0]
    || { ...EMPTY_PRICE_PAYLOAD };
}

export function emptyAvantisPricePayload() {
  return { ...EMPTY_PRICE_PAYLOAD };
}
