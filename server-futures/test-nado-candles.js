const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const BigNumber = require('bignumber.js');
const source = fs.readFileSync(require.resolve('./nado'), 'utf8');
const routes = fs.readFileSync(require.resolve('./routes'), 'utf8');
const now = 1788123000;
const raw = value => new BigNumber(value).times('1e18').toFixed(0);
const marketIds = { BTC: 2, KPEPE: 38, PENGU: 40, KBONK: 56 };
function bar(overrides = {}) {
  return { product_id: 38, granularity: 300, timestamp: String(now),
    open_x18: raw(0.00365), high_x18: raw(0.00368), low_x18: raw(0.00364),
    close_x18: raw(0.00367), ...overrides };
}
function harness(reply = { candlesticks: [bar()] }) {
  const requests = [];
  const module = { exports: {} };
  const client = {
    context: { engineClient: { getSymbols: async () => ({ symbols: Object.fromEntries(
      Object.entries(marketIds).map(([symbol, productId]) => [symbol, { symbol: symbol + '-PERP', productId, type: 1 }]),
    ) }) } },
    market: { getAllMarkets: async () => [], getLatestMarketPrices: async () => ({ marketPrices: [] }) },
  };
  const context = {
    module, exports: module.exports, process: { env: {} }, Buffer, console, AbortSignal,
    require: name => name === '@nadohq/client' ? { createNadoClient: () => client } : require(name),
    fetch: async (url, options) => {
      requests.push({ url, ...options, body: JSON.parse(options.body) });
      const payload = typeof reply === 'function' ? await reply(requests.at(-1), requests.length) : reply;
      return payload instanceof Response ? payload : new Response(JSON.stringify(payload));
    },
  };
  vm.runInNewContext(source, context, { filename: 'nado.js' });
  return { nado: module.exports, requests };
}
const query = { interval: '5m', from: now - 600, to: now + 10 };

test('native KPEPE x18 candles preserve contract units, sort and deduplicate valid bars', async () => {
  const { nado, requests } = harness({ candlesticks: [
    bar(), bar({ close_x18: raw(0.00366) }), bar({ timestamp: String(now - 300) }),
    bar({ product_id: 2 }), bar({ granularity: 60 }), bar({ close_x18: 'NaN' }),
    bar({ high_x18: raw(0.001) }), bar({ timestamp: String(now + 300) }),
  ] });
  const rows = await nado.getCandles('kpepe-perp', { ...query, from: query.from * 1000, to: query.to * 1000 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].time, now - 300);
  assert.equal(rows[1].close, 0.00367);
  assert.equal(requests[0].body.candlesticks.product_id, 38);
  assert.equal(requests[0].body.candlesticks.max_time, now);
  assert.equal(requests[0].body.candlesticks.limit, 3);
  assert.equal(requests[0].method, 'POST');
  assert.ok(requests[0].signal instanceof AbortSignal);
  assert.equal(requests[0].url, 'https://archive.prod.nado.xyz/v1');
});

test('all six chart intervals use documented native granularities', async () => {
  const { nado, requests } = harness({ candlesticks: [] });
  for (const [interval, seconds] of Object.entries({ '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 })) {
    await nado.getCandles('BTC', { interval, from: now - seconds * 5, to: now });
    assert.equal(requests.at(-1).body.candlesticks.granularity, seconds);
    assert.equal(requests.at(-1).body.candlesticks.product_id, 2);
  }
});

test('invalid input and unknown markets fail without an indexer request', async () => {
  const { nado, requests } = harness();
  for (const [symbol, options, status] of [
    ['', query, 400], ['https://evil.test', query, 400], ['BTC', { ...query, interval: '__proto__' }, 400],
    ['BTC', { ...query, from: 'abc' }, 400], ['BTC', { ...query, from: now + 100 }, 400],
    ['BTC', { ...query, from: now - 500 * 300 }, 400], ['NO_SUCH_MARKET', query, 400],
    ['UNKNOWN', query, 404],
  ]) await assert.rejects(nado.getCandles(symbol, options), error => error.status === status);
  assert.equal(requests.length, 0);
});

test('same aligned window is coalesced and cached; market and interval stay isolated', async () => {
  const { nado, requests } = harness({ candlesticks: [] });
  await Promise.all([
    nado.getCandles('BTC', query), nado.getCandles('BTC', { ...query, to: now + 20 }),
  ]);
  await nado.getCandles('BTC', query);
  assert.equal(requests.length, 1);
  await nado.getCandles('PENGU', query);
  await nado.getCandles('BTC', { ...query, interval: '1m' });
  assert.equal(requests.length, 3);
});

test('network failures are not cached, later retry can recover', async () => {
  const { nado, requests } = harness((request, count) => {
    if (count === 1) return new Response('unavailable', { status: 503 });
    return { candlesticks: [bar()] };
  });
  await assert.rejects(nado.getCandles('KPEPE', query), /503/);
  assert.equal((await nado.getCandles('KPEPE', query)).length, 1);
  assert.equal(requests.length, 2);
});

test('genuine empty history stays empty; malformed/wrong-product history is an error', async () => {
  assert.equal((await harness({ candlesticks: [] }).nado.getCandles('KPEPE', query)).length, 0);
  assert.equal((await harness({ candlesticks: [bar({ timestamp: String(now - 86400) })] }).nado.getCandles('KPEPE', query)).length, 0);
  for (const payload of [{ error: 'unavailable' }, { candlesticks: [bar({ product_id: 2 })] },
    { candlesticks: [bar({ low_x18: raw(2) })] }]) {
    await assert.rejects(harness(payload).nado.getCandles('KPEPE', query), error => error.status === 502);
  }
});

test('cache is bounded to 128 windows', async () => {
  const { nado, requests } = harness({ candlesticks: [] });
  for (let i = 0; i < 129; i++) {
    await nado.getCandles('BTC', { ...query, from: query.from - i * 300, to: query.to - i * 300 });
  }
  await nado.getCandles('BTC', query);
  assert.equal(requests.length, 130, 'oldest key must be evicted');
});

test('actual public candles route dispatches Nado and preserves errors/other venue routes', async () => {
  const start = routes.indexOf("router.get('/candles',");
  const end = routes.indexOf("router.get('/pyth/history',", start);
  let handler;
  const calls = [];
  vm.runInNewContext(routes.slice(start, end), {
    router: { get: (path, callback) => { handler = callback; } },
    nado: { getCandles: async (...args) => { calls.push(args); return []; } },
    pacifica: { getCandles: async () => ['pacifica'] },
  });
  const response = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ query: { dex: 'nado', symbol: 'KPEPE', interval: '5m', start_time: String(now - 600), end_time: String(now) } }, response);
  assert.equal(calls[0][0], 'KPEPE');
  assert.equal(response.body.length, 0);
  await handler({ query: { dex: 'pacifica', symbol: 'BTC', interval: '5m', start_time: String(now) } }, response);
  assert.equal(response.body[0], 'pacifica');
});
