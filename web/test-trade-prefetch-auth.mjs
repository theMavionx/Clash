import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  prefetchDexTradeData,
  clearTradePrefetchCache,
} from './src/lib/tradePrefetch.js';

const calls = [];
const savedFetch = globalThis.fetch;
const savedWindow = globalThis.window;
globalThis.window = {
  location: { origin: 'https://clash.test' },
  fetch: async (url, options) => {
    calls.push({ url: String(url), headers: new Headers(options.headers) });
    return Response.json({ ok: true });
  },
};
globalThis.fetch = (...args) => window.fetch(...args);

test.after(() => {
  globalThis.fetch = savedFetch;
  if (savedWindow === undefined) delete globalThis.window;
  else globalThis.window = savedWindow;
});

async function run(dex, token = null, walletAddress = 'fixture-wallet') {
  clearTradePrefetchCache();
  calls.length = 0;
  const summary = await prefetchDexTradeData({ dex, token, walletAddress, force: true });
  assert.equal(summary.failed, 0);
  assert.ok(calls.some(call => call.url === `/api/futures/markets?dex=${dex}`));
  assert.ok(calls.some(call => call.url === `/api/futures/prices?dex=${dex}`));
  return calls.map(call => call.url);
}

for (const dex of ['flash', 'gmtrade', 'bulk']) {
  test(`${dex}: anonymous prefetch retains public data, never probes protected accounts`, async () => {
    const urls = await run(dex);
    assert.equal(urls.length, 3);
    assert.ok(urls.includes(`/api/futures/${dex}/${dex === 'bulk' ? 'config' : 'health'}`));
    assert.ok(calls.every(call => !call.headers.has('x-token')));
  });
  test(`${dex}: authenticated prefetch includes account reads with token and venue`, async () => {
    const urls = await run(dex, 'fixture-token');
    assert.ok(urls.some(url => url.startsWith(`/api/futures/${dex}/account?`)));
    assert.equal(urls.length, dex === 'bulk' ? 5 : 7);
    assert.ok(calls.every(call => call.headers.get('x-token') === 'fixture-token' && call.headers.get('x-dex') === dex));
    const noWalletUrls = await run(dex, 'fixture-token', '');
    assert.equal(noWalletUrls.length, 3);
  });
}

for (const [dex, privatePath] of [
  ['grvt', '/grvt/config?dex=grvt'],
  ['hotstuff', '/hotstuff/status?dex=hotstuff'],
  ['risex', '/risex/invite-status?dex=risex&account=fixture-wallet'],
  ['decibel', '/decibel/signer'],
]) {
  test(`${dex}: protected prefetch requires authentication, public reads remain available`, async () => {
    assert.ok(!(await run(dex)).includes('/api/futures' + privatePath));
    assert.ok((await run(dex, 'fixture-token')).includes('/api/futures' + privatePath));
  });
}

test('public on-chain account preview is still available without a Clash token', async () => {
  const urls = await run('avantis');
  assert.ok(urls.includes('/api/futures/account?dex=avantis&address=fixture-wallet'));
});

for (const dex of ['lighter', 'rhlighter']) {
  test(`${dex}: config is public; account prefetch waits for login`, async () => {
    assert.equal((await run(dex)).length, 3);
    assert.equal((await run(dex, 'fixture-token')).length, 4);
    assert.ok(calls.some(call => call.url.includes('/account?') && call.headers.get('x-token') === 'fixture-token'));
  });
}

test('imperial: warmup reads only public markets, prices and builder config', async () => {
  const anonymous = await run('imperial');
  assert.equal(anonymous.length, 2);
  const authenticated = await run('imperial', 'fixture-token');
  assert.equal(authenticated.length, 3);
  assert.ok(authenticated.includes('/api/futures/imperial/config'));
  assert.ok(!authenticated.some(url => /\/imperial\/(snapshot|history)/.test(url)));
});

for (const dex of ['monad', 'ondo', 'hibachi']) {
  test(`${dex}: never prefetch unsupported generic endpoints that fall through to Pacifica`, async () => {
    for (const token of [null, 'fixture-token']) {
      const urls = await run(dex, token);
      assert.equal(urls.length, 2);
      assert.ok(urls.every(url => !/\/(account|positions|orders)\?/.test(url)));
    }
  });
}

test('GRVT never prefetches unsupported account route; positions/orders remain authenticated', async () => {
  const anonymous = await run('grvt');
  assert.equal(anonymous.length, 2);
  const authenticated = await run('grvt', 'fixture-token');
  assert.equal(authenticated.length, 5);
  assert.ok(!authenticated.some(url => url.includes('/account?')));
  assert.ok(authenticated.some(url => url.includes('/positions?dex=grvt')));
  assert.ok(authenticated.some(url => url.includes('/orders?dex=grvt')));
});

test('anonymous warmup does not throttle the subsequent authenticated warmup', async () => {
  clearTradePrefetchCache();
  await prefetchDexTradeData({ dex: 'flash', walletAddress: 'fixture-wallet' });
  calls.length = 0;
  const summary = await prefetchDexTradeData({ dex: 'flash', walletAddress: 'fixture-wallet', token: 'new-session' });
  assert.equal(summary.skipped, undefined);
  assert.ok(calls.some(call => call.url.includes('/flash/account?')));
});
