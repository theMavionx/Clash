'use strict';

const assert = require('node:assert/strict');
const {
  PRICE_SOURCING,
  normalizeAvantisPriceUpdateResponse,
} = require('./avantis-price-payload');

const nowMs = 1_900_000_000_000;
const core = {
  price_update_data: '0xc0ffee',
  price: 1_900,
  publish_time: (nowMs - 2_000) / 1000,
};
const pro = {
  priceUpdateData: '0xabcdef',
  price: 1_901,
  publishTimestampMs: nowMs - 500,
};

const currentShape = normalizeAvantisPriceUpdateResponse({ core: null, pro }, { nowMs });
assert.equal(currentShape.source, 'pro');
assert.equal(currentShape.priceSourcing, PRICE_SOURCING.PRO);
assert.equal(currentShape.priceUpdateData, '0xabcdef');

const legacyFallback = normalizeAvantisPriceUpdateResponse({ core, pro: null }, { nowMs });
assert.equal(legacyFallback.source, 'core');
assert.equal(legacyFallback.priceSourcing, PRICE_SOURCING.HERMES);
assert.equal(legacyFallback.priceUpdateData, '0xc0ffee');

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

console.log('Avantis server price payload regression checks passed.');
