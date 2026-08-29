'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

process.env.HIBACHI_WS_ENABLED = 'false';

const hibachi = require('./hibachi');

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('Hibachi public metadata is single-flight and orders reuse the warmed contract map', async () => {
  hibachi.__testing.resetCaches();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, method: options.method || 'GET' });
    if (value.endsWith('/market/inventory')) {
      return jsonResponse({
        markets: [
          {
            contract: {
              id: 1,
              symbol: 'BTC/USDT-P',
              category: 'CRYPTO',
              stepSize: '0.001',
              tickSize: '0.1',
              initialMarginRate: '0.1',
            },
            info: { markPrice: '100000' },
          },
          {
            contract: {
              id: 2,
              symbol: 'AAPL/USDT-P',
              category: 'EQUITY',
              stepSize: '0.01',
              tickSize: '0.01',
              initialMarginRate: '0.2',
            },
            info: { markPrice: '200' },
          },
          {
            contract: {
              id: 3,
              symbol: 'FARTCOIN/USDT-P',
              category: 'CRYPTO',
              status: 'CLOSED',
              symbolStatus: 'OPEN',
              stepSize: '1',
              tickSize: '0.0001',
              initialMarginRate: '0.1',
            },
            info: { markPrice: null, volume24h: null },
          },
        ],
      });
    }
    if (value.includes('/market/data/prices?symbol=BTC')) {
      return jsonResponse({ symbol: 'BTC/USDT-P', markPrice: '100000' });
    }
    if (value.includes('/market/data/stats?symbol=BTC')) {
      return jsonResponse({ symbol: 'BTC/USDT-P', volume24h: '12345' });
    }
    if (value.includes('/trade/account/info?accountId=7')) {
      return jsonResponse({
        accountCategory: 'CRYPTO',
        balance: '100',
        assets: [{ symbol: 'USDT', quantity: '100' }],
        positions: [],
      });
    }
    if (value.endsWith('/trade/order')) {
      return jsonResponse({ orderId: '123', status: 'OPEN' });
    }
    throw new Error(`Unexpected Hibachi test request: ${value}`);
  };

  try {
    const results = await Promise.all(Array.from({ length: 24 }, () => hibachi.getMarketInfo()));
    assert.equal(results.length, 24);
    assert.equal(calls.filter(call => call.url.endsWith('/market/inventory')).length, 1);
    assert.equal(calls.filter(call => call.url.includes('/market/exchange-info')).length, 0);
    assert.equal(calls.filter(call => call.url.includes('/market/data/')).length, 0);
    assert.equal(calls.filter(call => call.url.includes('symbol=AAPL')).length, 0);
    assert.equal(calls.filter(call => call.url.includes('symbol=FARTCOIN')).length, 0);
    assert.deepEqual(results[0].data.map(row => row.symbol), ['BTC']);

    const publicCallsBeforeOrder = calls.filter(call => call.url.includes('data-api.hibachi.xyz')).length;
    const order = await hibachi.placeOrder(
      { apiKey: 'test-api-key', accountId: 7, privateKey: 'test-hmac-secret' },
      { symbol: 'BTC', side: 'bid', quantity: '0.001', orderType: 'market' },
    );
    assert.equal(order.orderId, '123');
    assert.equal(calls.filter(call => call.url.includes('data-api.hibachi.xyz')).length, publicCallsBeforeOrder);
    assert.equal(calls.filter(call => call.url.endsWith('/trade/order')).length, 1);
  } finally {
    global.fetch = originalFetch;
    hibachi.__testing.resetCaches();
  }
});

test('Cloudflare 429 is rate limiting, not a Hibachi geo block', async () => {
  hibachi.__testing.resetCaches();
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({
    title: 'Error 1015: You are being rate limited',
    status: 429,
    detail: "You are being rate-limited by the website owner's configuration.",
    error_code: 1015,
    cloudflare_error: true,
    retry_after: 30,
  }, 429);

  try {
    await assert.rejects(
      () => hibachi.getMarketInfo(),
      (error) => {
        assert.equal(error.code, 'HIBACHI_RATE_LIMITED');
        assert.equal(error.status, 429);
        assert.equal(error.retryAfter, 30);
        assert.equal(hibachi.isRateLimitedError(error), true);
        assert.equal(hibachi.isIpBlockedError(error), false);
        assert.doesNotMatch(error.message, /unsupported|IP region|cloudflare/iu);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
    hibachi.__testing.resetCaches();
  }
});

test('read-only Hibachi key produces a structured Trading-permission error', async () => {
  hibachi.__testing.resetCaches();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/market/inventory')) {
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
    if (value.includes('/trade/account/info?accountId=7')) {
      return jsonResponse({
        accountCategory: 'CRYPTO',
        balance: '100',
        assets: [{ symbol: 'USDT', quantity: '100' }],
        positions: [],
      });
    }
    if (value.endsWith('/trade/order')) {
      return jsonResponse({ message: 'Missing required permission: Trading' }, 401);
    }
    throw new Error(`Unexpected Hibachi permission test request: ${value}`);
  };

  try {
    await assert.rejects(
      () => hibachi.placeOrder(
        { apiKey: 'read-only-api-key', accountId: 7, privateKey: 'test-hmac-secret' },
        { symbol: 'BTC', side: 'bid', quantity: '0.001', orderType: 'market' },
      ),
      (error) => {
        assert.equal(error.code, 'HIBACHI_TRADING_PERMISSION_REQUIRED');
        assert.equal(error.status, 401);
        assert.equal(error.detail, 'Missing required permission: Trading');
        assert.equal(hibachi.isTradingPermissionError(error), true);
        assert.match(error.message, /Read-write > Trading/iu);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
    hibachi.__testing.resetCaches();
  }
});

test('Hibachi TP/SL batch orders use the current action schema and tick-aligned prices', async () => {
  hibachi.__testing.resetCaches();
  const originalFetch = global.fetch;
  const submitted = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/market/inventory')) {
      return jsonResponse({
        markets: [{
          contract: {
            id: 1,
            symbol: 'BTC/USDT-P',
            category: 'CRYPTO',
            status: 'LIVE',
            stepSize: '0.001',
            tickSize: '0.1',
            settlementDecimals: 6,
            underlyingDecimals: 8,
            initialMarginRate: '0.1',
          },
          info: { markPrice: '100000' },
        }],
      });
    }
    if (value.includes('/trade/account/info?accountId=7')) {
      return jsonResponse({
        accountCategory: 'CRYPTO',
        balance: '100',
        assets: [{ symbol: 'USDT', quantity: '100' }],
        positions: [],
      });
    }
    if (value.endsWith('/trade/orders')) {
      submitted.push(JSON.parse(options.body));
      return jsonResponse({ orders: [
        { orderId: 'parent', status: 'OPEN' },
        { orderId: 'tp', status: 'OPEN' },
        { orderId: 'sl', status: 'OPEN' },
      ] });
    }
    throw new Error(`Unexpected Hibachi TP/SL batch test request: ${value}`);
  };

  try {
    await hibachi.placeOrder(
      { apiKey: 'test-api-key', accountId: 7, privateKey: 'test-hmac-secret' },
      {
        symbol: 'BTC',
        side: 'bid',
        quantity: '0.001',
        orderType: 'market',
        takeProfit: '100100.06',
        stopLoss: '99899.94',
      },
    );
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].accountId, 7);
    assert.deepEqual(submitted[0].orders.map(order => order.action), ['place', 'place', 'place']);
    assert.deepEqual(submitted[0].orders.slice(1).map(order => order.triggerPrice), ['100100.1', '99899.9']);
    assert.deepEqual(submitted[0].orders.slice(1).map(order => order.orderFlags), ['REDUCE_ONLY', 'REDUCE_ONLY']);
  } finally {
    global.fetch = originalFetch;
    hibachi.__testing.resetCaches();
  }
});

test('standalone Hibachi trigger orders snap generated TP/SL prices to the market tick', async () => {
  hibachi.__testing.resetCaches();
  const originalFetch = global.fetch;
  let submitted = null;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/market/inventory')) {
      return jsonResponse({
        markets: [{
          contract: {
            id: 1,
            symbol: 'BTC/USDT-P',
            category: 'CRYPTO',
            status: 'LIVE',
            stepSize: '0.001',
            tickSize: '0.1',
            settlementDecimals: 6,
            underlyingDecimals: 8,
            initialMarginRate: '0.1',
          },
          info: { markPrice: '79000' },
        }],
      });
    }
    if (value.includes('/trade/account/info?accountId=7')) {
      return jsonResponse({ accountCategory: 'CRYPTO', balance: '100', positions: [] });
    }
    if (value.endsWith('/trade/order')) {
      submitted = JSON.parse(options.body);
      return jsonResponse({ orderId: 'trigger', status: 'OPEN' });
    }
    throw new Error(`Unexpected Hibachi trigger test request: ${value}`);
  };

  try {
    await hibachi.placeOrder(
      { apiKey: 'test-api-key', accountId: 7, privateKey: 'test-hmac-secret' },
      {
        symbol: 'BTC',
        side: 'ask',
        quantity: '0.001',
        orderType: 'market',
        triggerPrice: '79423.87',
        triggerDirection: 'HIGH',
        reduceOnly: true,
      },
    );
    assert.equal(submitted.triggerPrice, '79423.9');
    assert.equal(submitted.orderFlags, 'REDUCE_ONLY');
  } finally {
    global.fetch = originalFetch;
    hibachi.__testing.resetCaches();
  }
});

test('stale Hibachi market data observes retry-after cooldown after a 429', async () => {
  hibachi.__testing.resetCaches();
  const originalFetch = global.fetch;
  const originalDateNow = Date.now;
  const baseTime = originalDateNow();
  let now = baseTime;
  let rateLimited = false;
  let calls = 0;
  Date.now = () => now;
  global.fetch = async (url) => {
    calls += 1;
    if (rateLimited) {
      return jsonResponse({
        title: 'Error 1015: You are being rate limited',
        status: 429,
        retry_after: 30,
      }, 429);
    }
    const value = String(url);
    if (value.endsWith('/market/inventory')) {
      return jsonResponse({
        markets: [{
          contract: {
            id: 1,
            symbol: 'BTC/USDT-P',
            category: 'CRYPTO',
            stepSize: '0.001',
            tickSize: '0.1',
            initialMarginRate: '0.1',
          },
          info: { markPrice: '100000' },
        }],
      });
    }
    if (value.includes('/market/data/prices')) return jsonResponse({ markPrice: '100000' });
    if (value.includes('/market/data/stats')) return jsonResponse({ volume24h: '12345' });
    throw new Error(`Unexpected Hibachi test request: ${value}`);
  };

  try {
    const warm = await hibachi.getMarketInfo();
    assert.deepEqual(warm.data.map(row => row.symbol), ['BTC']);
    now += 31_000;
    rateLimited = true;
    const stale = await hibachi.getMarketInfo();
    assert.deepEqual(stale.data.map(row => row.symbol), ['BTC']);
    const callsAfterFirst429 = calls;
    const cooled = await hibachi.getMarketInfo();
    assert.deepEqual(cooled.data.map(row => row.symbol), ['BTC']);
    assert.equal(calls, callsAfterFirst429, 'retry-after cooldown still called Hibachi upstream');
  } finally {
    global.fetch = originalFetch;
    Date.now = originalDateNow;
    hibachi.__testing.resetCaches();
  }
});

test('Hibachi order history accepts the current avgFillPrice response field', async () => {
  hibachi.__testing.resetCaches();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes('/trade/account/trades?accountId=7')) {
      return jsonResponse({ trades: [] });
    }
    if (value.includes('/trade/orders/history?accountId=7')) {
      const parsed = new URL(value);
      if (parsed.searchParams.has('cursorOrderId')) return jsonResponse({ hasMore: false, orders: [] });
      return jsonResponse({
        hasMore: false,
        orders: [{
          accountId: 7,
          avgFillPrice: '2900.000000',
          closedAt: 1777811627000,
          filledQuantity: '1.200000000',
          orderId: '596002791293190100',
          orderType: 'MARKET',
          price: null,
          side: 'BID',
          status: 'Filled',
          symbol: 'ETH/USDT-P',
          totalQuantity: '1.200000000',
        }],
      });
    }
    throw new Error(`Unexpected Hibachi history test request: ${value}`);
  };

  try {
    const history = await hibachi.getAccountTradeHistory(
      { apiKey: 'test-api-key', accountId: 7, privateKey: 'test-hmac-secret' },
      { limit: 100 },
    );
    assert.equal(history.length, 1);
    assert.equal(history[0].symbol, 'ETH');
    assert.equal(history[0].price, '2900');
    assert.equal(history[0].amount, '1.2');
    assert.equal(history[0].notional_usd, 3480);
    assert.equal(history[0].source, 'orders_history');
    assert.ok(calls.some(value => value.includes('startTime=')));
    assert.ok(calls.some(value => value.includes('endTime=')));
  } finally {
    global.fetch = originalFetch;
    hibachi.__testing.resetCaches();
  }
});
