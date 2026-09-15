const assert = require('node:assert/strict');
const test = require('node:test');
const { HibachiProxyPool } = require('./hibachi-proxy-pool');
const { createLeverupTransport } = require('./leverup-transport');

const url = 'https://service.leverup.xyz/v1/pairs';
function fixture(fetchImpl, env = {}, count = 3) {
  class FakeProxy { constructor(value) { this.value = value; } }
  const pool = new HibachiProxyPool(Array.from({ length: count }, (_, i) => `proxy${i}.test:8080:user:password`), { ProxyAgentClass: FakeProxy });
  return createLeverupTransport({ pool, fetchImpl, env });
}
const ok = () => new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });

test('independent commands distribute across every proxy without duplicating payloads', async () => {
  const seen = new Set();
  const t = fixture(async (_url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.body, 'signed-payload');
    seen.add(options.dispatcher.value);
    return ok();
  }, {}, 99);
  for (let i = 0; i < 99; i++) await t.request(url, { method: 'POST', body: 'signed-payload' });
  assert.equal(seen.size, 99);
  assert.equal(t.stats().requests, 99);
  assert.equal(t.stats().retries, 0);
  assert.equal(t.stats().inFlight, 0);
});

test('safe reads fail over once to another proxy and release all leases', async () => {
  const seen = [];
  const t = fixture(async (_url, options) => {
    seen.push(options.dispatcher.value);
    if (seen.length === 1) throw new Error('secret proxy credentials');
    return ok();
  });
  assert.equal((await t.request(url, {}, { readOnly: true })).response.status, 200);
  assert.equal(new Set(seen).size, 2);
  assert.equal(t.stats().transportFailures, 1);
  assert.equal(t.stats().retries, 1);
  assert.equal(t.stats().inFlight, 0);
});

test('unknown signed submission is never retried or sent direct', async () => {
  let calls = 0;
  const t = fixture(async () => { calls++; throw new Error('secret credentials'); });
  await assert.rejects(t.request(url, { method: 'POST', body: 'signature' }), error => {
    assert.equal(error.code, 'LEVERUP_SUBMISSION_UNKNOWN');
    assert.equal(error.status, 504);
    assert.doesNotMatch(error.message, /secret credentials/);
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(t.stats().uncertainSubmissions, 1);
});

test('read body timeout retries within total budget, signed body timeout does not', async () => {
  for (const readOnly of [true, false]) {
    let calls = 0;
    const t = fixture(async (_url, options) => {
      calls++;
      if (calls > 1) return ok();
      return { ok: true, status: 200, text: () => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true });
      }) };
    }, { LEVERUP_REQUEST_TIMEOUT_MS: 1000 });
    if (readOnly) assert.equal((await t.request(url, {}, { readOnly })).response.status, 200);
    else await assert.rejects(t.request(url, { method: 'POST' }), { code: 'LEVERUP_SUBMISSION_UNKNOWN' });
    assert.equal(calls, readOnly ? 2 : 1);
    assert.equal(t.stats().inFlight, 0);
  }
});

test('HTTP failures are returned once; 429/403 cool down the whole provider', async () => {
  for (const status of [401, 403, 429, 500, 302]) {
    let calls = 0;
    const t = fixture(async () => { calls++; return new Response('failure', { status, headers: { 'retry-after': '60' } }); });
    assert.equal((await t.request(url, {}, { readOnly: true })).response.status, status);
    assert.equal(calls, 1);
    if (status === 403 || status === 429) {
      await assert.rejects(t.request(url, {}, { readOnly: true }), { code: 'LEVERUP_PROVIDER_COOLDOWN' });
      assert.equal(calls, 1);
    }
    assert.equal(t.stats().retries, 0);
  }
});

test('bounds concurrency and recovers capacity when requests finish', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const t = fixture(async () => { await gate; return ok(); }, { LEVERUP_PROXY_MAX_CONCURRENT: 2 });
  const first = t.request(url), second = t.request(url);
  await assert.rejects(t.request(url), { code: 'LEVERUP_TRANSPORT_BUSY' });
  assert.equal(t.stats().inFlight, 2);
  release();
  await Promise.all([first, second]);
  await t.request(url);
  assert.equal(t.stats().inFlight, 0);
});

test('caller cancellation prevents retry; pre-aborted calls send nothing', async () => {
  let calls = 0;
  const controller = new AbortController();
  const t = fixture(async () => { calls++; controller.abort(); throw new DOMException('aborted', 'AbortError'); });
  await assert.rejects(t.request(url, { signal: controller.signal }, { readOnly: true }), { name: 'AbortError' });
  await assert.rejects(t.request(url, { signal: controller.signal }, { readOnly: true }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('exhausted proxy reads redact causes and do not fall back direct', async () => {
  let calls = 0;
  const t = fixture(async (_url, options) => {
    assert.ok(options.dispatcher);
    calls++;
    throw new Error('http://user:password@proxy.test');
  });
  await assert.rejects(t.request(url, {}, { readOnly: true }), { code: 'LEVERUP_PROXY_UNAVAILABLE' });
  assert.equal(calls, 2);
  assert.equal(t.stats().inFlight, 0);
});

test('local unconfigured mode remains direct and uses one attempt', async () => {
  let calls = 0;
  const t = fixture(async (_url, options) => { calls++; assert.equal(options.dispatcher, undefined); return ok(); }, {}, 0);
  await t.request(url, {}, { readOnly: true });
  assert.equal(calls, 1);
});

test('invalid timeout and concurrency configuration use bounded defaults', () => {
  const t = fixture(async () => ok(), { LEVERUP_REQUEST_TIMEOUT_MS: 'NaN', LEVERUP_PROXY_MAX_CONCURRENT: 'NaN' });
  assert.equal(t.stats().maxConcurrent, 16);
});

test('real HTTP CONNECT proxies carry parallel requests and recover a broken tunnel', async () => {
  const http = require('node:http'), net = require('node:net');
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const close = server => new Promise(resolve => server.close(resolve));
  let received = 0, connects = 0;
  const target = http.createServer((_req, res) => { received++; res.end('{"ok":true}'); });
  const broken = http.createServer();
  broken.on('connect', (_req, socket) => socket.destroy());
  const proxy = http.createServer();
  const sockets = new Set();
  proxy.on('connect', (req, socket, head) => {
    connects++;
    assert.equal(req.headers['proxy-authorization'], 'Basic ' + Buffer.from('user:password').toString('base64'));
    const upstream = net.connect(target.address().port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket); socket.pipe(upstream);
    });
    for (const s of [socket, upstream]) { sockets.add(s); s.on('error', () => s.destroy()); s.on('close', () => sockets.delete(s)); }
  });
  let transport;
  try {
    await Promise.all([listen(target), listen(broken), listen(proxy)]);
    transport = createLeverupTransport({ env: {
      LEVERUP_PROXIES: [broken, proxy].map(s => `127.0.0.1:${s.address().port}:user:password`).join('\n'),
    } });
    const targetUrl = `http://127.0.0.1:${target.address().port}/fixture`;
    const first = await transport.request(targetUrl, {}, { readOnly: true });
    assert.equal(first.text, '{"ok":true}');
    await Promise.all(Array.from({ length: 8 }, () => transport.request(targetUrl, {}, { readOnly: true })));
    assert.equal(received, 9);
    assert.ok(connects > 0);
    assert.equal(transport.stats().retries, 1);
    assert.equal(transport.stats().inFlight, 0);
  } finally {
    await transport?.close();
    for (const socket of sockets) socket.destroy();
    await Promise.all([close(target), close(broken), close(proxy)]);
  }
});

test('adapter routes fee/status and oracle POST reads through pool, but never retries intent POST', async () => {
  const previousEnv = process.env.LEVERUP_PROXIES, previousFetch = global.fetch;
  process.env.LEVERUP_PROXIES = 'fixture0.test:8080:user:password\nfixture1.test:8080:user:password\nfixture2.test:8080:user:password';
  const leverup = require('./leverup');
  try {
    let calls = 0;
    global.fetch = async (requestUrl, options) => {
      assert.ok(options.dispatcher);
      calls++;
      if (requestUrl.endsWith('/anti-ddos-config')) return new Response('[{"action":0,"enabled":false,"antiDdosFee":"0"}]');
      return ok();
    };
    await leverup.getFeeConfig();
    await leverup.getIntentStatus('0x' + '1'.repeat(64));
    assert.equal(calls, 2);
    calls = 0;
    global.fetch = async (_url, options) => {
      assert.ok(options.dispatcher);
      calls++;
      if (calls === 1) throw new Error('fixture network failure');
      return ok();
    };
    await leverup.__test.request('https://service.leverup.xyz', '/v1/oracle/price/pairs/latest', { method: 'POST', body: '{}' });
    assert.equal(calls, 2);
    calls = 0;
    global.fetch = async () => { calls++; throw new Error('fixture network failure'); };
    await assert.rejects(leverup.__test.request('https://oneclick-01-keeper.leverup.xyz', '/v2/trading/submit-intent?blockchain=MONAD', {
      method: 'POST', body: '{}',
    }), { code: 'LEVERUP_SUBMISSION_UNKNOWN' });
    assert.equal(calls, 1);
  } finally {
    global.fetch = previousFetch;
    if (previousEnv === undefined) delete process.env.LEVERUP_PROXIES;
    else process.env.LEVERUP_PROXIES = previousEnv;
  }
});
