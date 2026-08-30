import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPublicReadFetch } from './src/lib/publicReadFetch.js';
import axios from 'axios';
import { installAxiosPublicReads } from '../common/public-read-policy.mjs';
const rpc = 'https://rpc-gel.inkonchain.com';
const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
test('browser public RPC uses same-origin relay, preserves abort, no proxy credentials', async () => {
  const calls = [];
  const fetch = createPublicReadFetch(async (...args) => { calls.push(args); return new Response('{}'); });
  const controller = new AbortController();
  await fetch(rpc, { method: 'POST', body, signal: controller.signal });
  assert.equal(calls[0][0], '/api/futures/public-read');
  assert.equal(calls[0][1].signal, controller.signal);
  assert.equal(calls[0][1].credentials, 'omit');
  assert.deepEqual(JSON.parse(calls[0][1].body), { url: rpc, method: 'POST', body });
});
test('browser private, signed, keyed, same-origin and websocket-related traffic is untouched', async () => {
  const calls = [];
  const fetch = createPublicReadFetch(async (...args) => { calls.push(args); return new Response('{}'); });
  for (const [url, options] of [
    ['/api/futures/candles?dex=nado', {}],
    [rpc, { method: 'POST', body: '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0xsigned"]}' }],
    [rpc, { method: 'POST', body, headers: { authorization: 'secret' } }],
    ['https://base-mainnet.g.alchemy.com/v2/private-key', { method: 'POST', body }],
    ['wss://gateway.prod.nado.xyz', {}],
  ]) { await fetch(url, options); assert.equal(calls.at(-1)[0], url); assert.equal(calls.at(-1)[1], options); }
});
test('public Pyth history goes through server and returns original upstream status', async () => {
  const fetch = createPublicReadFetch(async url => {
    assert.equal(url, '/api/futures/public-read');
    return new Response('{}', { status: 404 });
  });
  assert.equal((await fetch('https://benchmarks.pyth.network/v1/shims/tradingview/history?symbol=Crypto.BTC/USD')).status, 404);
});
test('browser Axios SDK public calls use the same relay; private SDK calls stay untouched', async () => {
  const original = axios.defaults.adapter;
  let privateCalls = 0;
  axios.defaults.adapter = async config => { privateCalls++; return { data: '{}', status: 200, statusText: 'OK', headers: {}, config }; };
  const relayCalls = [];
  const fetch = createPublicReadFetch(async (url, options) => {
    relayCalls.push({ url, options });
    return new Response('{"symbols":{}}');
  });
  const restore = installAxiosPublicReads(axios, { fetch });
  try {
    const sdk = axios.create({ baseURL: 'https://gateway.prod.nado.xyz/v1' });
    const result = await sdk.post('/query', { type: 'symbols' });
    assert.deepEqual(result.data, { symbols: {} });
    assert.equal(relayCalls[0].url, '/api/futures/public-read');
    assert.equal(JSON.parse(relayCalls[0].options.body).url, 'https://gateway.prod.nado.xyz/v1/query');
    await sdk.post('/execute', { place_order: {} });
    assert.equal(privateCalls, 1);
    assert.equal(relayCalls.length, 1);
  } finally { restore(); axios.defaults.adapter = original; }
});
