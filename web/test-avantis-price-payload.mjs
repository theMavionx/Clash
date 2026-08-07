import assert from 'node:assert/strict';
import {
  AVANTIS_PRICE_SOURCING,
  normalizeAvantisPriceUpdateResponse,
} from './src/lib/avantisPricePayload.js';

const nowMs = 1_900_000_000_000;
const core = {
  priceUpdateData: '0xc0ffee',
  price: 64_000,
  publishTimestampMs: nowMs - 2_000,
};
const pro = {
  priceUpdateData: '0xabcdef',
  price: 64_100,
  publishTimestampMs: nowMs - 500,
};

const currentShape = normalizeAvantisPriceUpdateResponse({ core: null, pro }, { nowMs });
assert.equal(currentShape.source, 'pro');
assert.equal(currentShape.priceSourcing, AVANTIS_PRICE_SOURCING.PRO);
assert.equal(currentShape.price, 64_100);
assert.equal(currentShape.priceUpdateData, '0xabcdef');

const proPreferred = normalizeAvantisPriceUpdateResponse({ core, pro }, { nowMs });
assert.equal(proPreferred.source, 'pro');

const legacyFallback = normalizeAvantisPriceUpdateResponse({ core, pro: null }, { nowMs });
assert.equal(legacyFallback.source, 'core');
assert.equal(legacyFallback.priceSourcing, AVANTIS_PRICE_SOURCING.HERMES);

const staleProFallback = normalizeAvantisPriceUpdateResponse({
  core,
  pro: { ...pro, publishTimestampMs: nowMs - 120_000 },
}, { nowMs, maxAgeMs: 60_000 });
assert.equal(staleProFallback.source, 'core');

const incompleteProFallback = normalizeAvantisPriceUpdateResponse({
  core,
  pro: { ...pro, priceUpdateData: null },
}, { nowMs });
assert.equal(incompleteProFallback.source, 'core');

const empty = normalizeAvantisPriceUpdateResponse({ core: null, pro: null }, { nowMs });
assert.deepEqual(empty, {
  priceUpdateData: '0x',
  price: 0,
  priceSourcing: null,
  source: null,
  publishTimestampMs: 0,
});

console.log('Avantis browser price payload regression checks passed.');
