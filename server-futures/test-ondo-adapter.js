const assert = require('node:assert/strict');
const WebSocket = require('ws');

process.env.ONDO_PERPS_BUILDER_CODE = 'clashofperps';

const ondo = require('./ondo');

function readLiveMarketSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket('wss://api.ondoperps.xyz/ws');
    let mark = null;
    let funding = null;
    let depth = null;
    let pong = false;
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('Ondo markPricesPerps WebSocket timed out'));
    }, 12_000);
    socket.once('open', () => {
      socket.send(JSON.stringify({ op: 'ping', id: 'clash-ondo-adapter-test' }));
      socket.send(JSON.stringify({ op: 'subscribe', channel: 'markPricesPerps', markets: ['BTC-USD.P'] }));
      socket.send(JSON.stringify({ op: 'subscribe', channel: 'fundingRatesPerps', markets: ['BTC-USD.P'] }));
      socket.send(JSON.stringify({ op: 'subscribe', channel: 'depthBooksPerps', markets: ['BTC-USD.P'], depthLevels: '0.01', limit: 5 }));
    });
    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (message?.type === 'pong') pong = true;
      const update = Array.isArray(message?.data) ? message.data.find(row => row?.market === 'BTC-USD.P') : null;
      if (message?.type === 'update' && update) {
        if (message.channel === 'markPricesPerps' && Number(update.markPrice) > 0) mark = Number(update.markPrice);
        if (message.channel === 'fundingRatesPerps' && Number.isFinite(Number(update.rate))) funding = Number(update.rate);
        if (message.channel === 'depthBooksPerps' && Array.isArray(update.bids) && Array.isArray(update.asks)) {
          depth = { bids: update.bids.length, asks: update.asks.length };
        }
      }
      if (!pong || !(mark > 0) || funding == null || !depth) return;
      clearTimeout(timeout);
      socket.close();
      resolve({ mark, funding, pong, depth });
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function main() {
  assert.equal(ondo.ONDO_DEFAULT_BUILDER_CODE, 'clashofperps');
  assert.equal(ondo.ONDO_BUILDER_FEE_BPS, 1);
  assert.equal(ondo.alignOndoDecimal('63899.31', '1', 'trigger price'), '63899');
  assert.equal(ondo.alignOndoDecimal('45.449', '0.01', 'trigger price'), '45.44');
  assert.equal(ondo.evaluateRegionAccess({ country: 'US' }).allowed, false);
  assert.equal(ondo.evaluateRegionAccess({ country: 'ca' }).allowed, false);
  assert.equal(ondo.evaluateRegionAccess({ country: 'IR' }).reason, 'restricted_country');
  assert.equal(ondo.evaluateRegionAccess({ country: 'PR' }).allowed, false, 'US territories must be blocked');
  assert.equal(ondo.evaluateRegionAccess({ country: 'UA', regionCode: '43' }).allowed, false, 'Crimea must be blocked');
  assert.equal(ondo.evaluateRegionAccess({ country: 'UA', regionName: 'Donetsk Oblast' }).allowed, false);
  assert.equal(ondo.evaluateRegionAccess({ country: 'UA', regionCode: 'UA-32' }).allowed, true);
  assert.equal(ondo.evaluateRegionAccess({ country: 'DE' }).allowed, true);
  assert.equal(ondo.evaluateRegionAccess({}).allowed, true, 'missing edge geo must not break local development');
  assert.equal(ondo.regionAccessForRequest({ headers: { 'cf-ipcountry': 'CU' } }).allowed, false);
  assert.equal(ondo.regionAccessForRequest({ headers: { 'x-country-code': 'US' } }).allowed, true, 'untrusted country headers must be ignored');
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(ondo.regionAccessForRequest({ headers: {} }).status, 'unavailable', 'production must fail closed without trusted edge geo');
    assert.equal(ondo.regionAccessForRequest({ headers: { 'cf-ipcountry': 'XX' } }).status, 'unavailable', 'unknown Cloudflare country must fail closed');
    assert.equal(ondo.regionAccessForRequest({ headers: { 'x-vercel-ip-country': 'DE' } }).status, 'unavailable', 'production must ignore non-Cloudflare geo headers');
    assert.equal(ondo.regionAccessForRequest({ headers: { 'cf-ipcountry': 'DE' } }).allowed, true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  assert.deepEqual(ondo.builderConfig(), {
    configured: true,
    code: 'clashofperps',
    feeRateBps: 1,
    source: 'server_env',
  });

  const marketOrder = ondo.buildOrder({
    market: 'BTC',
    side: 'buy',
    type: 'market',
    size: '0.001',
    builderCode: { code: 'attacker', feeRateBps: 10 },
  });
  assert.deepEqual(marketOrder.builderCode, { code: 'clashofperps', feeRateBps: 1 });
  assert.equal(marketOrder.market, 'BTC-USD.P');
  assert.equal(marketOrder.side, 'buy');
  assert.equal(marketOrder.type, 'market');
  assert.equal(marketOrder.size, '0.001');

  const limitOrder = ondo.buildOrder({
    symbol: 'XAG',
    side: 'sell',
    type: 'limit',
    timeInForce: 'GTC',
    price: '45.44',
    size: '0.01',
    takeProfit: '43.00',
    stopLoss: '46.50',
    builder_code: { code: 'attacker', feeRateBps: 10 },
  });
  assert.deepEqual(limitOrder, {
    market: 'XAG-USD.P',
    side: 'sell',
    type: 'limit',
    size: '0.01',
    reduceOnly: false,
    price: '45.44',
    timeInForce: 'GTC',
    postOnly: false,
    takeProfit: { triggerPrice: '43.00' },
    stopLoss: { triggerPrice: '46.50' },
    builderCode: { code: 'clashofperps', feeRateBps: 1 },
  });
  assert.deepEqual(
    ondo.orderIdentityFromResponse({ result: { orderID: 'official-order-1', clientOrderID: 'clash-client-1' } }),
    { orderId: 'official-order-1', clientOrderId: 'clash-client-1' },
  );
  assert.deepEqual(
    ondo.orderIdentityFromResponse({ result: { order: { orderId: 'nested-order-2' } } }, 'fallback-client-2'),
    { orderId: 'nested-order-2', clientOrderId: 'fallback-client-2' },
  );
  assert.throws(() => ondo.buildOrder({
    market: 'XAG', side: 'buy', type: 'limit', price: '45.44', size: '0.01', clientOrderId: 'bad:id',
  }), /client order ID/u);
  assert.throws(() => ondo.buildOrder({
    market: 'XAG', side: 'buy', type: 'limit', price: '45.44', size: '0.01', clientOrderId: 'x'.repeat(65),
  }), /client order ID/u);

  const position = ondo.normalizePosition({
    market: 'BTC-USD.P',
    direction: 'short',
    netQuantity: '-0.5',
    averageEntryPrice: '65000',
    markPrice: '64000',
    liquidationPrice: '70000',
    usedMargin: '3200',
    notionalValue: '32000',
    leverage: '10',
    unrealizedPnl: '500',
  });
  assert.equal(position.symbol, 'BTC');
  assert.equal(position.side, 'ask');
  assert.equal(position.position_side, 'short');
  assert.equal(position.amount, '0.5');
  assert.equal(position.liquidation_price, 70000);

  const account = ondo.normalizeAccount(
    { result: { accountID: 'account-1', identifier: '0x1111111111111111111111111111111111111111' } },
    { result: { walletBalance: '100', marginBalance: '96', availableMargin: '61', withdrawableMargin: '58', usedMargin: '35' } },
  );
  assert.equal(account.account_equity, 96);
  assert.equal(account.available_to_spend, 61);
  assert.equal(account.available_to_withdraw, 58);
  assert.equal(account.total_margin_used, 35);

  const fill = ondo.normalizeFill({
    id: 'fill-1', orderID: 'order-1', clientOrderID: 'clash-client-1', market: 'BTC-USD.P', side: 'buy',
    parentOrderID: 'parent-order-1', size: '0.25', price: '64000', filledCost: '16000', fee: '5.6', isMaker: false,
  });
  assert.equal(fill.notional_usd, 16000);
  assert.equal(fill.fee, 5.6);
  assert.equal(fill.parent_order_id, 'parent-order-1');
  assert.equal(fill.order_id, 'order-1');
  assert.equal(fill.client_order_id, 'clash-client-1');

  const identity = ondo.normalizeSessionIdentity({
    result: {
      accountID: 'account-1',
      identifier: '0x1111111111111111111111111111111111111111',
      termsVersion: 1,
      privacyVersion: 1,
    },
  });
  assert.equal(identity.wallet, '0x1111111111111111111111111111111111111111');
  assert.equal(identity.accountId, 'account-1');
  assert.equal(identity.accountInfo.termsVersion, 1);
  assert.equal(Object.hasOwn(identity, 'account'), false, 'raw account must not overwrite the owner address');

  const originalFetch = global.fetch;
  let invalidateRequest = null;
  try {
    global.fetch = async (url, options = {}) => {
      invalidateRequest = { url: String(url), options };
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    await ondo.invalidateSession('ondo-test-token-that-is-long-enough');
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(invalidateRequest?.url, 'https://api.ondoperps.xyz/v1/auth/invalidate_jwt');
  assert.equal(invalidateRequest?.options?.method, 'GET', 'official invalidate_jwt endpoint is GET');

  let depositRequest = null;
  try {
    global.fetch = async (url, options = {}) => {
      depositRequest = { url: String(url), options };
      return new Response(JSON.stringify({
        success: true,
        result: {
          chain: 'arbitrum',
          accountId: 'account-1',
          symbol: 'USDC',
          address: '0x3333333333333333333333333333333333333333',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const provisioned = await ondo.provisionDepositAddress('ondo-test-token-that-is-long-enough', {
      accountId: 'account-1',
      network: 'ARBITRUM',
    });
    assert.equal(provisioned.result.chain, 'arbitrum');
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(depositRequest?.url, 'https://api.ondoperps.xyz/v1/provision_address');
  assert.equal(depositRequest?.options?.method, 'POST');
  assert.deepEqual(JSON.parse(depositRequest?.options?.body || '{}'), {
    symbol: 'USDC',
    network: 'arbitrum',
    deposit_destination: { id: 'account-1', wallet: 'margin' },
  });
  await assert.rejects(
    () => ondo.provisionDepositAddress('ondo-test-token-that-is-long-enough', { accountId: 'account-1', network: 'base' }),
    /Unsupported Ondo deposit network/u,
  );

  const sessionToken = 'ondo-concurrent-session-token-that-is-long-enough';
  const sessionWallet = '0x2222222222222222222222222222222222222222';
  let sessionReads = 0;
  try {
    global.fetch = async (url) => {
      assert.equal(String(url), 'https://api.ondoperps.xyz/v1/account');
      sessionReads += 1;
      await new Promise(resolve => setTimeout(resolve, 20));
      return new Response(JSON.stringify({
        success: true,
        result: { accountID: 'account-2', identifier: sessionWallet, termsVersion: 1, privacyVersion: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const sessions = await Promise.all([
      ondo.verifySessionOwner(sessionToken, sessionWallet),
      ondo.verifySessionOwner(sessionToken, sessionWallet),
      ondo.verifySessionOwner(sessionToken, sessionWallet),
    ]);
    assert.ok(sessions.every(row => row.wallet === sessionWallet));
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(sessionReads, 1, 'parallel route authorization must share one Ondo /v1/account read');

  const [markets, prices, depth, candles, wsMarket, liveConfig] = await Promise.all([
    ondo.getMarketInfo(),
    ondo.getPrices(),
    ondo.getDepth('BTC', 5),
    ondo.getCandles('BTC', {
      resolution: '5',
      from: Math.floor(Date.now() / 1000) - 60 * 60,
      to: Math.floor(Date.now() / 1000),
    }),
    readLiveMarketSocket(),
    ondo.request('/v1/markets'),
  ]);
  const liveUsdc = liveConfig?.result?.tokenConfig?.find(row => row?.id === 'USDC');
  assert.equal(liveUsdc?.networks?.ethereum?.contractAddress?.toLowerCase(), '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  assert.equal(liveUsdc?.networks?.arbitrum?.contractAddress?.toLowerCase(), '0xaf88d065e77c8cc2239327c5edb3a432268e5831');
  assert.ok(markets.some(row => row.symbol === 'BTC' && row.tick_size && row.lot_size && row.volume_24h > 0 && row.open_interest > 0), 'live BTC market stats missing');
  assert.ok(prices.some(row => row.symbol === 'BTC' && Number(row.mark) > 0), 'live BTC mark missing');
  assert.ok(Array.isArray(depth.bids) && Array.isArray(depth.asks), 'live order book shape invalid');
  assert.ok(candles.length > 0 && candles.every(row => row.time > 0 && row.close > 0), 'live candles missing');
  assert.ok(wsMarket.mark > 0, 'live BTC WebSocket mark missing');
  assert.ok(Number.isFinite(wsMarket.funding), 'live BTC WebSocket funding missing');
  assert.equal(wsMarket.pong, true, 'official Ondo WebSocket heartbeat failed');
  assert.ok(wsMarket.depth.bids > 0 && wsMarket.depth.asks > 0, 'live Ondo depthBooksPerps snapshot missing');

  const submittedTradingRequests = [];
  try {
    global.fetch = async (url, options = {}) => {
      submittedTradingRequests.push({ url: String(url), options });
      return new Response(JSON.stringify({ success: true, result: { orderId: 'aligned-test-order' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    await ondo.setStopOrder('ondo-test-token-that-is-long-enough', {
      market: 'BTC-USD.P',
      positionDirection: 'long',
      type: 'takeProfit',
      triggerPrice: '63899.31',
    });
    await ondo.createOrder('ondo-test-token-that-is-long-enough', {
      market: 'BTC-USD.P',
      side: 'buy',
      type: 'market',
      size: '0.0014',
      takeProfit: '63899.31',
    });
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(submittedTradingRequests.length, 2, 'cached market metadata must avoid an extra request during TP/SL submit');
  assert.deepEqual(JSON.parse(submittedTradingRequests[0]?.options?.body || '{}'), {
    market: 'BTC-USD.P',
    positionDirection: 'long',
    type: 'takeProfit',
    triggerPrice: '63899',
  });
  assert.equal(
    JSON.parse(submittedTradingRequests[1]?.options?.body || '{}')?.takeProfit?.triggerPrice,
    '63899',
    'attached TP must use the same quote-increment alignment',
  );

  console.log(`Ondo adapter PASS: ${markets.length} markets, ${prices.length} marks, REST ${depth.bids.length}/${depth.asks.length} depth, WS ${wsMarket.depth.bids}/${wsMarket.depth.asks} depth, ${candles.length} candles, WS BTC $${wsMarket.mark} funding ${wsMarket.funding}; builder fee locked to 1 bps`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
