'use strict';
// DexScreener dropped the Robinhood CLASH pairs; price() must fall back to
// GeckoTerminal with the same >= $10k liquidity floor.
const assert = require('node:assert/strict');
const shop = require('./robinhood_shop');

const tokenId = `robinhood_${shop.TOKEN.toLowerCase()}`;
const pool = (price, reserve, base = tokenId) => ({
  attributes: { base_token_price_usd: price, reserve_in_usd: reserve },
  relationships: { base_token: { data: { id: base } } },
});

assert.equal(shop.selectGeckoPrice([pool('0.00002', '15711'), pool('0.0002', '0.8')]), '0.00002');
assert.equal(shop.selectGeckoPrice([pool('0.1', '12000'), pool('0.2', '50000')]), '0.2');
assert.throws(() => shop.selectGeckoPrice([pool('0.1', '9999')]), /price unavailable/);
assert.throws(() => shop.selectGeckoPrice([pool('0.1', '50000', 'robinhood_0xother')]), /price unavailable/);
assert.throws(() => shop.selectGeckoPrice([pool('0', '50000')]), /price unavailable/);

(async () => {
  const nativeFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('dexscreener')) return Response.json({ schemaVersion: '1.0.0', pairs: null });
    if (String(url).includes('geckoterminal')) return Response.json({ data: [pool('0.0000244591061', '15711.17')] });
    throw new Error('unexpected request');
  };
  try {
    assert.equal(await shop.price(), '0.0000244591061');
    assert.equal(calls.length, 2);
    assert.equal(await shop.price(), '0.0000244591061');
    assert.equal(calls.length, 2, 'cached for 60s');
  } finally {
    global.fetch = nativeFetch;
  }
  console.log('robinhood price fallback: ok');
})().catch((e) => { console.error(e); process.exit(1); });
