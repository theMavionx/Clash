const assert = require('node:assert/strict');
const test = require('node:test');

const {
  HibachiProxyPool,
  proxySourceLines,
  proxyUrlFromLine,
  createHibachiProxyPool,
} = require('./hibachi-proxy-pool');

class FakeProxyAgent {
  constructor(proxyUrl) {
    this.proxyUrl = proxyUrl;
  }
}

function proxyLines(count = 4) {
  return Array.from({ length: count }, (_, index) => (
    `192.0.2.${index + 1}:${8_000 + index}:user${index}:password${index}`
  ));
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('Hibachi proxy parser accepts authenticated host entries without exposing secrets in stats', () => {
  const parsed = new URL(proxyUrlFromLine('192.0.2.10:8080:proxy-user:p@ss:word'));
  assert.equal(parsed.protocol, 'http:');
  assert.equal(parsed.hostname, '192.0.2.10');
  assert.equal(parsed.port, '8080');
  assert.equal(decodeURIComponent(parsed.username), 'proxy-user');
  assert.equal(decodeURIComponent(parsed.password), 'p@ss:word');

  const pool = new HibachiProxyPool([
    '192.0.2.10:8080:proxy-user:p@ss:word',
    '192.0.2.10:8080:proxy-user:p@ss:word',
    '# ignored',
  ], { ProxyAgentClass: FakeProxyAgent });
  const serialized = JSON.stringify(pool.stats());
  assert.equal(pool.stats().configured, 1);
  assert.doesNotMatch(serialized, /192\.0\.2\.10|proxy-user|p@ss/iu);

  const fromFile = proxySourceLines(
    { HIBACHI_PROXY_FILE: '/run/secrets/hibachi-proxies' },
    { readFileSync: () => '192.0.2.1:8000:user:pass\n192.0.2.2:8001:user:pass\n' },
  );
  assert.equal(fromFile.length, 3);
});

test('Hibachi proxy pool rotates public traffic, keeps account affinity, and cools limited proxies', () => {
  let now = 10_000;
  const pool = new HibachiProxyPool(proxyLines(3), {
    ProxyAgentClass: FakeProxyAgent,
    now: () => now,
    readAttempts: 3,
    rateLimitCooldownMs: 30_000,
  });

  const publicOne = pool.acquire();
  pool.reportSuccess(publicOne);
  pool.release(publicOne);
  const publicTwo = pool.acquire();
  pool.reportSuccess(publicTwo);
  pool.release(publicTwo);
  assert.notEqual(publicOne.index, publicTwo.index);

  const accountOne = pool.acquire({ affinityKey: 'account-7' });
  pool.release(accountOne);
  const accountTwo = pool.acquire({ affinityKey: 'account-7' });
  assert.equal(accountOne.index, accountTwo.index);
  pool.reportRateLimit(accountTwo, 30);
  pool.release(accountTwo);

  const failover = pool.acquire({ affinityKey: 'account-7' });
  assert.notEqual(failover.index, accountTwo.index);
  pool.release(failover);
  assert.equal(pool.stats().cooling, 1);
  assert.equal(pool.stats().rateLimits, 1);

  now += 30_001;
  assert.equal(pool.stats().active, 3);
});

test('public Hibachi reads use shared transport; account GET fails over while order POST never replays', async () => {
  const originalFetch = global.fetch;
  const originalProxies = process.env.HIBACHI_PROXIES;
  const originalWsEnabled = process.env.HIBACHI_WS_ENABLED;
  const modulePath = require.resolve('./hibachi');
  process.env.HIBACHI_PROXIES = proxyLines(4).join(',');
  process.env.HIBACHI_WS_ENABLED = 'false';
  delete require.cache[modulePath];

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/market/inventory')) {
      return jsonResponse({
        markets: [{
          contract: {
            id: 1,
            symbol: 'BTC/USDT-P',
            category: 'CRYPTO',
            status: 'LIVE',
            stepSize: '0.001',
            tickSize: '0.1',
            initialMarginRate: '0.1',
          },
          info: { markPrice: '100000' },
        }],
      });
    }
    if (String(url).includes('/trade/account/info?accountId=7')) {
      const accountCalls = calls.filter(call => call.url.includes('/trade/account/info?accountId=7'));
      if (accountCalls.length === 1) {
        throw Object.assign(new Error('connection interrupted'), {code:'ECONNRESET'});
      }
      return jsonResponse({
        accountCategory: 'CRYPTO',
        balance: '100',
        assets: [{ symbol: 'USDT', quantity: '100' }],
        positions: [],
      });
    }
    if (String(url).endsWith('/trade/order')) {
      return jsonResponse({ title: 'Rate limited', retry_after: 30 }, 429);
    }
    throw new Error(`Unexpected Hibachi proxy integration request: ${url}`);
  };

  try {
    const hibachi = require('./hibachi');
    const markets = await hibachi.getMarketInfo();
    assert.deepEqual(markets.data.map(row => row.symbol), ['BTC']);
    const inventoryCalls = calls.filter(call => call.url.endsWith('/market/inventory'));
    assert.equal(inventoryCalls.length, 1);
    assert.equal(inventoryCalls[0].options.dispatcher, undefined);

    await hibachi.getAccount(
      { apiKey: 'test-api-key', accountId: 7, privateKey: 'test-hmac-secret' },
      { forceLive: true },
    );
    const accountCalls = calls.filter(call => call.url.includes('/trade/account/info?accountId=7'));
    assert.equal(accountCalls.length, 2);
    assert.ok(accountCalls.every(call => call.options.dispatcher));
    assert.notEqual(accountCalls[0].options.dispatcher, accountCalls[1].options.dispatcher);

    await assert.rejects(
      () => hibachi.placeOrder(
        { apiKey: 'test-api-key', accountId: 7, privateKey: 'test-hmac-secret' },
        { symbol: 'BTC', side: 'bid', quantity: '0.001', orderType: 'market' },
      ),
      error => error.code === 'HIBACHI_RATE_LIMITED',
    );
    assert.equal(calls.filter(call => call.url.endsWith('/trade/order')).length, 1);
    const callsBeforeCooldown = calls.length;
    await assert.rejects(() => hibachi.getAccount(
      {apiKey:'different-key',accountId:8,privateKey:'test-hmac-secret'}, {forceLive:true}),
    error=>error.code === 'HIBACHI_RATE_LIMITED');
    assert.equal(calls.length,callsBeforeCooldown,'429 cooldown must not switch proxies or accounts');
    assert.ok(calls.every(call=>call.options.redirect === 'error'),'redirects cannot forward authenticated requests');

    const stats = hibachi.__testing.proxyPoolStats();
    assert.equal(stats.configured, 4);
    assert.equal(stats.rateLimits, 1);
    assert.equal(stats.transportFailures, 1);
    assert.equal(stats.successes, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalProxies === undefined) delete process.env.HIBACHI_PROXIES;
    else process.env.HIBACHI_PROXIES = originalProxies;
    if (originalWsEnabled === undefined) delete process.env.HIBACHI_WS_ENABLED;
    else process.env.HIBACHI_WS_ENABLED = originalWsEnabled;
    delete require.cache[modulePath];
  }
});

test('proxy concurrency is bounded and busy routes do not trigger direct fallback', () => {
  const pool = new HibachiProxyPool(proxyLines(2), {ProxyAgentClass:FakeProxyAgent,maxInFlightPerProxy:1,maxInFlight:2,allowDirectFallback:true});
  const a = pool.acquire({affinityKey:'one'});
  const b = pool.acquire({affinityKey:'one'});
  assert.notEqual(a.index,b.index);
  assert.throws(()=>pool.acquire(),error=>error.code === 'HIBACHI_PROXY_POOL_BUSY');
  pool.release(a);
  const c = pool.acquire();
  assert.equal(c.index,a.index);
  pool.release(c); pool.release(b);
  assert.equal(pool.stats().inFlight,0);
});

test('account pool only admits successful routes from a fresh opt-in health report', () => {
  const base = new HibachiProxyPool(proxyLines(2), {ProxyAgentClass:FakeProxyAgent});
  const report = {checkedAt:new Date().toISOString(),results:[
    {proxyId:base.entries[0].id,market:{ok:true},accountOrigin:{ok:true}},
    {proxyId:base.entries[1].id,market:{ok:true},accountOrigin:{ok:false,status:401}},
  ]};
  const make = () => createHibachiProxyPool({env:{HIBACHI_PROXY_HEALTH_FILE:'test-report'},proxyLines:proxyLines(2),ProxyAgentClass:FakeProxyAgent,fsImpl:{readFileSync:()=>JSON.stringify(report)}});
  assert.equal(make().stats().configured,1);
  report.checkedAt = '2000-01-01T00:00:00Z';
  assert.throws(make,/stale/);
});

test('Retry-After supports seconds and HTTP dates', () => {
  const {retryAfterSeconds} = require('./hibachi').__testing;
  assert.equal(retryAfterSeconds('120',null,0),120);
  assert.equal(retryAfterSeconds('Thu, 01 Jan 1970 00:01:00 GMT',null,0),60);
  assert.equal(retryAfterSeconds(null,45,0),45);
  assert.equal(retryAfterSeconds('invalid',null,0),30);
});

test('account transport retries share one deadline and regional 401 is not retried on another route', async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  const originalProxies = process.env.HIBACHI_PROXIES;
  const originalWs = process.env.HIBACHI_WS_ENABLED;
  const modulePath = require.resolve('./hibachi');
  process.env.HIBACHI_PROXIES = proxyLines(2).join(',');
  process.env.HIBACHI_WS_ENABLED = 'false';
  delete require.cache[modulePath];
  const hibachi = require('./hibachi');
  const creds = {apiKey:'test-read-key',accountId:'123',privateKey:'test-secret'};
  try {
    let now = originalNow();
    Date.now = ()=>now;
    let calls = 0;
    global.fetch = async ()=>{calls++;now+=13000;throw Object.assign(new Error('socket failed'),{code:'ECONNRESET'});};
    await assert.rejects(()=>hibachi.getAccount(creds,{forceLive:true}),error=>error.code === 'HIBACHI_TIMEOUT');
    assert.equal(calls,1,'expired total budget must not start a fresh timeout on another proxy');
    Date.now = originalNow;
    hibachi.__testing.resetCaches();
    calls=0;
    global.fetch = async ()=>{calls++;return jsonResponse({errorCode:6,message:'Cannot access Hibachi from XX.'},401);};
    await assert.rejects(()=>hibachi.getAccount(creds,{forceLive:true}),error=>error.code === 'HIBACHI_IP_BLOCKED');
    await assert.rejects(()=>hibachi.getAccount({...creds,accountId:'456'},{forceLive:true}),error=>error.code === 'HIBACHI_IP_BLOCKED');
    assert.equal(calls,1,'regional policy refusal must not rotate routes');
  } finally {
    Date.now=originalNow; global.fetch=originalFetch; hibachi.__testing.resetCaches();
    if(originalProxies === undefined) delete process.env.HIBACHI_PROXIES; else process.env.HIBACHI_PROXIES=originalProxies;
    if(originalWs === undefined) delete process.env.HIBACHI_WS_ENABLED; else process.env.HIBACHI_WS_ENABLED=originalWs;
    delete require.cache[modulePath];
  }
});
