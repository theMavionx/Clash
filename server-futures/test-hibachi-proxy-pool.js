const assert = require('node:assert/strict');
const test = require('node:test');

const {
  HibachiProxyPool,
  proxySourceLines,
  proxyUrlFromLine,
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

test('Hibachi REST reads fail over after 429 while order POST is never replayed', async () => {
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
      const inventoryCalls = calls.filter(call => call.url.endsWith('/market/inventory'));
      if (inventoryCalls.length === 1) {
        return jsonResponse({
          title: 'Error 1015: You are being rate limited',
          retry_after: 30,
        }, 429);
      }
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
    assert.equal(inventoryCalls.length, 2);
    assert.ok(inventoryCalls.every(call => call.options.dispatcher instanceof FakeProxyAgent === false));
    assert.notEqual(inventoryCalls[0].options.dispatcher, inventoryCalls[1].options.dispatcher);

    await assert.rejects(
      () => hibachi.placeOrder(
        { apiKey: 'test-api-key', accountId: 7, privateKey: 'test-hmac-secret' },
        { symbol: 'BTC', side: 'bid', quantity: '0.001', orderType: 'market' },
      ),
      error => error.code === 'HIBACHI_RATE_LIMITED',
    );
    assert.equal(calls.filter(call => call.url.endsWith('/trade/order')).length, 1);

    const stats = hibachi.__testing.proxyPoolStats();
    assert.equal(stats.configured, 4);
    assert.equal(stats.rateLimits, 2);
    assert.equal(stats.successes, 2);
  } finally {
    global.fetch = originalFetch;
    if (originalProxies === undefined) delete process.env.HIBACHI_PROXIES;
    else process.env.HIBACHI_PROXIES = originalProxies;
    if (originalWsEnabled === undefined) delete process.env.HIBACHI_WS_ENABLED;
    else process.env.HIBACHI_WS_ENABLED = originalWsEnabled;
    delete require.cache[modulePath];
  }
});
