const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isPublicRead } = require('../common/public-read-policy.mjs');
const { HibachiProxyPool } = require('./hibachi-proxy-pool');
const { createPublicReadTransport, installAxiosPublicReads, createPublicReadHandler } = require('./public-read-proxy');
const RPC = 'https://rpc-gel.inkonchain.com/';
const readBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
const readOptions = { method: 'POST', body: readBody, headers: { 'content-type': 'application/json' } };
function transport(fetchImpl, lines = ['127.0.0.1:8001:user:password', '127.0.0.1:8002:user:password'], options = {}) {
  class FakeAgent { constructor(url) { this.url = url; } destroy() {} }
  const pool = new HibachiProxyPool(lines, { ProxyAgentClass: FakeAgent, readAttempts: 2 });
  return createPublicReadTransport({ pool, fetchImpl, ...options });
}
const allowed = [
  ['https://data-api.hibachi.xyz/market/inventory', { method: 'GET', headers: { accept: 'application/json', 'Hibachi-Client': 'ClashOfPerps/1.0' } }],
  [RPC, readOptions],
  ['https://mainnet.base.org', readOptions],
  ['https://api.mainnet-beta.solana.com', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [] }) }],
  ['https://archive.prod.nado.xyz/v1', { method: 'POST', body: '{"candlesticks":{"product_id":38,"granularity":300,"limit":3}}' }],
  ['https://gateway.prod.nado.xyz/v1/query', { method: 'POST', body: '{"type":"symbols"}' }],
  ['https://api.hyperliquid.xyz/info', { method: 'POST', body: '{"type":"allMids"}' }],
  ['https://hermes.pyth.network/v2/price_feeds?query=BTC', {}],
  ['https://api.pacifica.fi/api/v1/info/prices', {}],
  ['https://fullnode.mainnet.aptoslabs.com/v1/transactions/by_version/6591901129', {}],
  ['https://market-data.grvt.io/full/v1/ticker', { method: 'POST', body: '{"instrument":"BTC_USDT_Perp"}' }],
];
for (const [url, options] of allowed) test('allows public read: ' + new URL(url).hostname + new URL(url).pathname, () => {
  assert.equal(isPublicRead(url, options), true);
});

const forbidden = [
  ['http://rpc-gel.inkonchain.com', readOptions], ['https://127.0.0.1', readOptions],
  ['https://rpc-gel.inkonchain.com.evil.test', readOptions], ['https://rpc-gel.inkonchain.com:8443', readOptions],
  ['https://user:secret@rpc-gel.inkonchain.com', readOptions],
  [RPC, { ...readOptions, headers: { 'x-token': 'session' } }],
  [RPC, { ...readOptions, headers: { authorization: 'Bearer secret' } }],
  [RPC + '?api-key=secret', readOptions],
  ['https://base-mainnet.g.alchemy.com/v2/private-key', readOptions],
  [RPC, { method: 'POST', body: '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0x12"]}' }],
  [RPC, { method: 'POST', body: '{"jsonrpc":"2.0","method":"personal_sign","params":[]}' }],
  [RPC, { method: 'POST', body: '[{"jsonrpc":"2.0","method":"eth_chainId"},{"jsonrpc":"2.0","method":"eth_sendTransaction"}]' }],
  ['https://api.mainnet-beta.solana.com', { method: 'POST', body: '{"jsonrpc":"2.0","method":"requestAirdrop","params":[]}' }],
  ['https://gateway.prod.nado.xyz/v1/execute', { method: 'POST', body: '{"place_order":{}}' }],
  ['https://archive.prod.nado.xyz/v1', { method: 'POST', body: '{"matches":{"subaccounts":["private-account"]}}' }],
  ['https://api.hyperliquid.xyz/info', { method: 'POST', body: '{"type":"clearinghouseState","user":"0x123"}' }],
  ['https://api.pacifica.fi/api/v1/positions', {}],
  [RPC, { ...readOptions, body: 'x'.repeat(24001) }],
];
test('denies private/keyed/signed/write/unknown/SSRF/oversized requests', () => {
  for (const [url, options] of forbidden) assert.equal(isPublicRead(url, options), false, url + ' ' + options.body);
});

test('rotates public HTTPS reads, preserves TLS, never sends proxy credentials as target headers', async () => {
  const calls = [];
  const t = transport(async (url, options) => { calls.push({ url, options }); return new Response('{}'); });
  await t.fetch(RPC, readOptions); await t.fetch(RPC, readOptions);
  assert.notEqual(calls[0].options.dispatcher, calls[1].options.dispatcher);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers['proxy-authorization'], undefined);
  assert.equal(t.stats().successes, 2);
  assert.equal(t.stats().inFlight, 0);
});

test('transport failure retries once on a different proxy and then falls back directly', async () => {
  let calls = 0;
  const t = transport(async (url, options) => {
    assert.ok(options.dispatcher);
    if (++calls === 1) throw new Error('tunnel failed');
    return new Response('{}');
  });
  await t.fetch(RPC, readOptions);
  assert.equal(calls, 2); assert.equal(t.stats().transportFailures, 1);
  const fallbackCalls = [];
  const broken = transport(async (url, options) => {
    fallbackCalls.push({ url, proxied: Boolean(options.dispatcher) });
    if (options.dispatcher) throw new Error('password=secret');
    return new Response('{"direct":true}');
  });
  const response = await broken.fetch(RPC, readOptions);
  assert.deepEqual(await response.json(), { direct: true });
  assert.equal(broken.stats().requests, 2);
  assert.equal(broken.stats().directFallbacks, 1);
  assert.equal(broken.stats().directFallbackSuccesses, 1);
  assert.equal(broken.transportFor(response), 'direct-fallback');
  assert.deepEqual(fallbackCalls.map(row => row.proxied), [true, true, false]);
});

test('circuit breaker skips a repeatedly broken proxy pool while preserving direct public reads', async () => {
  const calls = [];
  const broken = transport(async (url, options) => {
    calls.push(Boolean(options.dispatcher));
    if (options.dispatcher) throw new Error('proxy auth failed');
    return new Response('{}');
  }, undefined, { circuitFailureThreshold: 1, circuitCooldownMs: 60_000 });
  await broken.fetch(RPC, readOptions);
  await broken.fetch(RPC, readOptions);
  assert.deepEqual(calls, [true, true, false, false]);
  assert.equal(broken.stats().circuitOpen, true);
  assert.equal(broken.stats().circuitOpens, 1);
  assert.equal(broken.stats().directFallbacks, 2);
});

test('direct fallback can be disabled without changing private-request behavior', async () => {
  const broken = transport(async () => { throw new Error('proxy unavailable'); }, undefined, {
    allowDirectFallback: false,
  });
  await assert.rejects(
    broken.fetch(RPC, readOptions),
    error => error.message === 'Public read proxy transport unavailable',
  );
  assert.equal(broken.stats().directFallbacks, 0);
});

test('provider failures do not trigger proxy rotation; 429 is respected across the host', async () => {
  for (const status of [401, 403, 404, 500]) {
    let calls = 0;
    const t = transport(async () => { calls++; return new Response('{}', { status }); });
    assert.equal((await t.fetch(RPC, readOptions)).status, status);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const t = transport(async () => { calls++; return new Response('{}', { status: 429, headers: { 'retry-after': '10' } }); });
  await t.fetch(RPC, readOptions);
  assert.equal((await t.fetch(RPC, readOptions)).status, 429);
  assert.equal(calls, 1);
});

test('private requests, caller dispatcher and disabled pool preserve original transport', async () => {
  const calls = [];
  const t = transport(async (input, options) => { calls.push({ input, options }); return new Response('{}'); });
  const privateOptions = { ...readOptions, headers: { authorization: 'secret' } };
  await t.fetch(RPC, privateOptions);
  assert.equal(calls[0].options, privateOptions);
  const explicit = { ...readOptions, dispatcher: {} };
  await t.fetch(RPC, explicit);
  assert.equal(calls[1].options, explicit);
  const disabled = transport(async (url, options) => { assert.equal(options, readOptions); return new Response('{}'); }, []);
  await disabled.fetch(RPC, readOptions);
  assert.equal(t.stats().requests, 0);
});

test('native Request JSON reads are inspected without consuming or changing the caller body', async () => {
  const request = new Request(RPC, readOptions);
  const t = transport(async (url, options) => { assert.equal(options.body, readBody); return new Response('{}'); });
  await t.fetch(request);
  assert.equal(request.bodyUsed, false);
  assert.equal(await request.text(), readBody);
});

test('cancellation does not retry or penalize a proxy', async () => {
  const controller = new AbortController();
  const t = transport(async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(t.fetch(RPC, { ...readOptions, signal: controller.signal }), /Aborted/);
  assert.equal(t.stats().requests, 1);
  assert.equal(t.stats().transportFailures, 0);
});

test('actual Axios fetch adapter uses pool for SDK reads; private calls retain original adapter', async () => {
  const axios = require('axios');
  const original = axios.defaults.adapter;
  let direct = 0;
  axios.defaults.adapter = async config => { direct++; return { data: '{}', status: 200, statusText: 'OK', headers: {}, config }; };
  const t = transport(async () => new Response('{"result":"0xdef1"}'));
  const restore = installAxiosPublicReads(axios, t);
  try {
    const client = axios.create();
    const reply = await client.post(RPC, JSON.parse(readBody));
    assert.equal(reply.data.result, '0xdef1');
    assert.equal(t.stats().requests, 1);
    await client.post('https://gateway.prod.nado.xyz/v1/execute', { place_order: {} });
    assert.equal(direct, 1);
  } finally { restore(); axios.defaults.adapter = original; }
});

function relayResponse() {
  return { code: 200, headers: {}, status(code) { this.code = code; return this; },
    set(key, value) { this.headers[key] = value; return this; },
    json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
}
test('relay refuses arbitrary URLs and writes before any network call', async () => {
  let calls = 0;
  const handler = createPublicReadHandler(transport(async () => { calls++; return new Response('{}'); }));
  for (const [url, options] of forbidden) {
    const res = relayResponse();
    await handler({ body: { url, ...options } }, res);
    // Headers are deliberately not an envelope capability; auth cannot be
    // forwarded. The rest of the operation must still independently be public.
    if (!options.headers) assert.equal(res.code, 400);
  }
  assert.ok(calls <= 2);
});
test('relay passes JSON/status only, marks proxy use and blocks redirect/oversize responses', async () => {
  const handler = createPublicReadHandler(transport(async () => new Response('{"result":7}', { headers: { 'content-type': 'application/json', 'set-cookie': 'secret', authorization: 'secret' } })));
  const res = relayResponse();
  await handler({ body: { url: RPC, method: 'POST', body: readBody } }, res);
  assert.equal(res.body.toString(), '{"result":7}');
  assert.equal(res.headers['X-Clash-Public-Transport'], 'proxy');
  assert.equal(res.headers['set-cookie'], undefined);
  for (const response of [new Response('', { status: 307, headers: { location: 'https://127.0.0.1' } }), new Response('x'.repeat(2 * 1024 * 1024 + 1))]) {
    const fail = relayResponse();
    await createPublicReadHandler(transport(async () => response))({ body: { url: RPC, method: 'POST', body: readBody } }, fail);
    assert.equal(fail.code, 502);
  }
});

test('relay accurately marks a direct fallback after proxy transport failure', async () => {
  const handler = createPublicReadHandler(transport(async (url, options) => {
    if (options.dispatcher) throw new Error('CONNECT 407');
    return new Response('{"result":"0xdef1"}', { headers: { 'content-type': 'application/json' } });
  }));
  const res = relayResponse();
  await handler({ body: { url: RPC, method: 'POST', body: readBody } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['X-Clash-Public-Transport'], 'direct-fallback');
  assert.equal(res.body.toString(), '{"result":"0xdef1"}');
});
