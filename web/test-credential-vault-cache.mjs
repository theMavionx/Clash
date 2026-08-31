import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { installTradeFetchCache, clearTradePrefetchCache } from './src/lib/tradePrefetch.js';

const previousWindow = globalThis.window;
let request, calls = 0;
globalThis.window = {
  location: { origin: 'https://clash.test' },
  fetch: (...args) => { calls++; return request(...args); },
};
installTradeFetchCache();
after(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const accountUrl = '/api/futures/hibachi/account?address=fixture';

test('vault metadata/secret requests never enter the global trading cache', async () => {
  clearTradePrefetchCache(); calls = 0;
  request = async () => Response.json({ fixture: calls });
  for (const method of ['GET', 'POST']) {
    for (let n = 0; n < 2; n++) {
      await window.fetch('/api/players/trading-credentials' + (method === 'POST' ? '/restore' : ''), { method });
    }
  }
  assert.equal(calls, 4);
});

test('request and response no-store bypass cache without disabling ordinary public caching', async () => {
  clearTradePrefetchCache(); calls = 0;
  request = async () => Response.json({ fixture: calls });
  await window.fetch(accountUrl); await window.fetch(accountUrl);
  assert.equal(calls, 1);
  await window.fetch(accountUrl, { cache: 'no-store' });
  await window.fetch(new Request('https://clash.test' + accountUrl, { cache: 'no-store' }));
  assert.equal(calls, 3);
  clearTradePrefetchCache();
  request = async () => Response.json({ fixture: calls }, { headers: { 'Cache-Control': 'no-store, private' } });
  await window.fetch(accountUrl); await window.fetch(accountUrl);
  assert.equal(calls, 5);
});

test('late previous-key response cannot repopulate cache or evict a newer in-flight request', async () => {
  clearTradePrefetchCache(); calls = 0;
  const old = deferred(), fresh = deferred();
  request = () => calls === 1 ? old.promise : fresh.promise;
  const oldRequest = window.fetch(accountUrl);
  clearTradePrefetchCache();
  const newRequest = window.fetch(accountUrl);
  old.resolve(Response.json({ account: 'old' }));
  assert.equal((await (await oldRequest).json()).account, 'old');
  const joinedNewRequest = window.fetch(accountUrl);
  assert.equal(calls, 2);
  fresh.resolve(Response.json({ account: 'new' }));
  assert.equal((await (await newRequest).json()).account, 'new');
  assert.equal((await (await joinedNewRequest).json()).account, 'new');
  assert.equal((await (await window.fetch(accountUrl)).json()).account, 'new');
  assert.equal(calls, 2);
});
