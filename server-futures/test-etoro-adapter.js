'use strict';

const assert = require('assert');
const etoro = require('./etoro');

const REAL = { apiKey: 'public-real', userKey: 'user-real', environment: 'real' };
const DEMO = { apiKey: 'public-demo', userKey: 'user-demo', environment: 'demo' };

function response(status, payload, extraHeaders = {}) {
  const headers = new Map(Object.entries(extraHeaders).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: key => headers.get(String(key).toLowerCase()) || null },
    text: async () => payload == null ? '' : JSON.stringify(payload),
  };
}

const instrument = {
  instrumentId: 100000,
  displayname: 'Bitcoin',
  internalSymbolFull: 'BTC',
  internalAssetClassName: 'Crypto',
  isCurrentlyTradable: true,
  isExchangeOpen: true,
  pricePrecision: 2,
};

const eligibility = {
  instrumentId: 100000,
  symbol: 'BTC',
  allowOpenPosition: true,
  allowClosePosition: true,
  allowPartialClosePosition: true,
  allowMitOrders: true,
  leverageConfigs: [
    { settlementType: 'marginTrade', direction: 'LONG', leverageValues: [1, 2, 5], minPositionAmount: 50 },
    { settlementType: 'CFD', direction: 'SHORT', leverageValues: [1, 2], minPositionAmount: 50 },
  ],
};

function portfolio() {
  return {
    clientPortfolio: {
      cid: 77,
      credit: 10_000,
      unrealizedPnL: 25,
      positions: [{
        positionId: 9001,
        orderId: 5001,
        instrumentId: 100000,
        isBuy: true,
        amount: 1000,
        initialAmountInDollars: 1000,
        leverage: 2,
        units: 0.02,
        openRate: 50_000,
        pnL: 25,
        stopLossRate: 45_000,
        takeProfitRate: 60_000,
        openDateTime: '2026-08-26T10:00:00Z',
      }],
      ordersForOpen: [{
        orderId: 6001,
        instrumentId: 100000,
        mirrorId: 0,
        amount: 200,
        totalExternalCosts: 10,
        isBuy: true,
        leverage: 1,
      }],
      orders: [{
        orderId: 6002,
        instrumentId: 100000,
        amount: 150,
        isBuy: false,
        leverage: 1,
        rate: 48_000,
      }],
    },
  };
}

async function run() {
  const calls = [];
  etoro.setFetchImplForTests(async (url, options = {}) => {
    const parsed = new URL(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: parsed.pathname, query: parsed.searchParams, method: options.method || 'GET', headers: options.headers, body });
    assert.equal(options.headers['x-user-key'], REAL.userKey);
    assert.ok(!parsed.pathname.includes('/demo'), 'Never call a Demo endpoint');
    assert.match(options.headers['x-request-id'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);

    if (parsed.pathname === '/api/v1/market-data/search') return response(200, { instruments: [instrument] });
    if (parsed.pathname.endsWith('/eligibility')) return response(200, { eligibilities: [eligibility] });
    if (parsed.pathname.endsWith('/pnl')) return response(200, portfolio());
    if (parsed.pathname === '/api/v1/market-data/instruments/rates') {
      return response(200, { rates: [{ instrumentId: 100000, bid: 51_000, ask: 51_100, lastExecution: 51_050 }] });
    }
    if (parsed.pathname.includes('/history/candles/')) {
      return response(200, { candles: [{ instrumentId: 100000, candles: [{
        fromDate: '2026-08-27T12:00:00Z', open: 50_000, high: 51_500, low: 49_900, close: 51_000, volume: 12,
      }] }] });
    }
    if (parsed.pathname.endsWith('/trade/history')) {
      return response(200, [{
        positionId: 8001, orderId: 4001, instrumentId: 100000, isBuy: false,
        leverage: 2, openRate: 50_000, closeRate: 49_000, investment: 250,
        fees: 1.25, units: 0.01, netProfit: 8.75,
        openTimestamp: '2026-08-25T10:00:00Z', closeTimestamp: '2026-08-26T10:00:00Z',
      }]);
    }
    if (options.method === 'POST' && parsed.pathname.endsWith('/orders')) {
      return response(200, { orderId: 12345, referenceId: options.headers['x-request-id'] });
    }
    if (parsed.pathname.endsWith('/orders:lookup')) {
      return response(200, {
        orderId: 12345,
        status: { id: 3, name: 'Filled', errorCode: 0, errorMessage: null },
        positionExecutions: [{ positionId: 91234 }],
      });
    }
    if (options.method === 'DELETE' && parsed.pathname.includes('/orders/')) return response(200, { token: 'cancelled' });
    if (options.method === 'POST' && parsed.pathname.includes('/market-close-orders/positions/')) return response(200, { token: 'closed' });
    if (options.method === 'PATCH' && parsed.pathname.includes('/positions/')) return response(200, { operationId: 'updated' });
    throw new Error(`Unhandled mock request: ${options.method || 'GET'} ${parsed.pathname}`);
  });

  const snapshot = await etoro.getAccountSnapshot(REAL, { force: true });
  assert.equal(snapshot.markets.length, 1);
  assert.equal(snapshot.markets[0].symbol, 'BTC');
  assert.deepEqual(snapshot.markets[0].leverage_values, [1, 2, 5]);
  assert.equal(snapshot.markets[0].tick_size, '0.01');
  assert.equal(snapshot.positions[0].unrealized_pnl, '25');
  assert.equal(snapshot.account.available_to_spend, 9650);
  assert.equal(snapshot.account.account_equity, 11035);
  assert.ok(calls.some(call => call.path === '/api/v1/trading/info/real/pnl'));
  assert.ok(calls.some(call => call.path === '/api/v2/trading/info/eligibility'));

  await assert.rejects(
    etoro.placeOrder(REAL, { symbol: 'BTC', side: 'bid', amount: 100, leverage: 2, orderType: 'market' }),
    /requires a stop-loss/u,
  );

  const marketResult = await etoro.placeOrder(REAL, {
    symbol: 'BTC', side: 'bid', amount: 100, leverage: 2, orderType: 'market', stopLoss: 45_000, takeProfit: 60_000,
  });
  assert.equal(marketResult.order_id, '12345');
  assert.equal(marketResult.status, 'filled');
  assert.deepEqual(marketResult.position_ids, ['91234']);
  const marketCall = calls.findLast(call => call.method === 'POST' && call.path === '/api/v2/trading/execution/orders');
  assert.deepEqual(marketCall.body, {
    action: 'open', transaction: 'buy', instrumentId: 100000, settlementType: 'marginTrade', orderType: 'mkt',
    leverage: 2, amount: 100, orderCurrency: 'usd', stopLossRate: 45_000, stopLossType: 'fixed', takeProfitRate: 60_000,
  });

  await etoro.placeOrder(REAL, {
    symbol: 'BTC', side: 'ask', amount: 100, leverage: 1, orderType: 'limit', price: 49_000, stopLoss: 52_000,
  });
  const limitCall = calls.findLast(call => call.method === 'POST' && call.path === '/api/v2/trading/execution/orders');
  assert.equal(limitCall.body.transaction, 'sellShort');
  assert.equal(limitCall.body.orderType, 'mit');
  assert.equal(limitCall.body.triggerRate, 49_000);
  assert.equal(calls.filter(call => call.path.endsWith('/orders:lookup')).length, 1);

  await etoro.cancelOrder(REAL, 12345);
  assert.ok(calls.some(call => call.method === 'DELETE' && call.path === '/api/v2/trading/execution/orders/12345'));

  await etoro.closePosition(REAL, 9001, { fullClose: true, instrumentId: 100000 });
  const closeCall = calls.findLast(call => call.path.endsWith('/market-close-orders/positions/9001'));
  assert.deepEqual(closeCall.body, { UnitsToDeduct: null });

  await etoro.updatePosition(REAL, 9001, { stopLoss: 46_000, clearTakeProfit: true });
  const patchCall = calls.findLast(call => call.method === 'PATCH');
  assert.deepEqual(patchCall.body, { stopLossRate: 46_000, stopLossType: 'fixed', clearTakeProfit: true });

  const history = await etoro.getTradeHistory(REAL, { minDate: '2026-08-01', limit: 50 });
  assert.equal(history[0].side, 'open_short');
  assert.equal(history[0].notional_usd, 500);
  assert.equal(history[0].pnl, 8.75);

  const candles = await etoro.getCandles(REAL, 'BTC', { interval: '5m', limit: 10 });
  assert.deepEqual(candles[0], { time: 1787832000, open: 50000, high: 51500, low: 49900, close: 51000, volume: 12 });

  assert.deepEqual(etoro.configStatus().environments, ['real']);
  assert.equal(etoro.credentialStatus(DEMO).has_credentials, false);
  const beforeRejectedCalls = calls.length;
  for (const environment of ['demo', 'DEMO', 'paper', '', undefined]) {
    const invalid = { ...DEMO, environment };
    assert.throws(() => etoro.credentials(invalid), /Only eToro Real/u);
    for (const operation of [
      () => etoro.getAccountSnapshot(invalid, { force: true }),
      () => etoro.placeOrder(invalid, { symbol: 'BTC', side: 'bid', amount: 100, leverage: 1 }),
      () => etoro.cancelOrder(invalid, 12345),
      () => etoro.closePosition(invalid, 9001, { fullClose: true }),
      () => etoro.updatePosition(invalid, 9001, { stopLoss: 46000 }),
      () => etoro.getTradeHistory(invalid),
      () => etoro.getCandles(invalid, 'BTC'),
      () => etoro.importTradesForPlayer('player-1', invalid),
    ]) {
      await assert.rejects(operation, error => error.status === 400 && /Only eToro Real/u.test(error.message));
    }
  }
  assert.equal(calls.length, beforeRejectedCalls, 'Rejected credentials must never make upstream requests or become Real');

  const persisted = [];
  const dbPath = require.resolve('./db');
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      upsertVerifiedTrade(playerId, trade) {
        persisted.push({ playerId, trade });
        return { inserted: 1, updated: 0, changes: 1 };
      },
    },
  };
  const imported = await etoro.importTradesForPlayer('player-1', REAL, { limit: 50 });
  assert.equal(imported.total, 2);
  assert.equal(imported.imported, 2);
  assert.deepEqual(persisted.map(row => row.trade.clientOrderId).sort(), [
    'etoro:real:position:8001',
    'etoro:real:position:9001',
  ]);
  assert.ok(persisted.every(row => row.trade.verifiedSource === 'etoro_api'));
  delete require.cache[dbPath];

  etoro.setFetchImplForTests(async (_url, options = {}) => response(429, { detail: 'slow down' }, { 'retry-after': '12' }));
  await assert.rejects(async () => {
    try {
      await etoro.request('/api/v1/market-data/search', REAL);
    } catch (error) {
      assert.equal(error.status, 429);
      assert.equal(error.retryAfter, '12');
      assert.match(error.message, /rate limit/u);
      throw error;
    }
  });

  etoro.setFetchImplForTests(null);
  console.log('eToro adapter contract tests passed');
}

run().catch(error => {
  etoro.setFetchImplForTests(null);
  console.error(error);
  process.exitCode = 1;
});
