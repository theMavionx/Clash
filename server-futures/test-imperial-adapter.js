'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const imperial = require('./imperial');

const WALLET = '11111111111111111111111111111111';

for (const orderType of ['market', 'limit']) {
  for (const [inputSide, canonicalSide, wireSide] of [['bid', 'long', 0], ['ask', 'short', 1]]) {
    test(`Imperial ${orderType} ${inputSide} uses the pinned Jupiter route and correct side`, async () => {
      let posted;
      let routed;
      const fetchImpl = async (url, options = {}) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/mobile/builder/summary')) return response(200, { active: true });
        if (parsed.pathname.endsWith('/route')) {
          routed = Object.fromEntries(parsed.searchParams);
          return response(200, { venue: 'jupiter', maxLeverage: 250 });
        }
        if (parsed.pathname.endsWith('/mobile/orders/preflight')) return response(200, { ok: true });
        if (parsed.pathname.endsWith('/mobile/orders')) {
          posted = JSON.parse(options.body);
          return response(200, { orderPda: 'fixture-order' });
        }
        throw new Error(`Unexpected request ${url}`);
      };
      await imperial.placeOrder({ owner: WALLET, jwt: 'fixture', playerId: 'p1', fetchImpl,
        body: { symbol: 'SOL', side: inputSide, notionalUsd: 100, leverage: 10, marketPrice: 100,
          price: 90, orderType, pinnedUnderwriter: 0, excludedVenues: 'flash,gmtrade' } });
      assert.equal(routed.side, canonicalSide);
      assert.equal(routed.stickyVenue, 'jupiter');
      assert.equal(routed.excludedVenues, 'flash,gmtrade');
      assert.equal(posted.side, wireSide);
      assert.equal(posted.underwriter, 0);
      assert.equal(posted.orderType, orderType === 'market' ? 0 : 1);
      assert.equal(posted.sizeUsd, 100_000_000);
      assert.equal(posted.collateralAmount, 10_000_000);
      assert.equal(posted.loanAmountUsd, undefined);
      assert.equal(posted.builderCode, 'CLASH');
    });
  }
}

test('Imperial automatic loan comes from fresh quote without a boost flag', async () => {
  let posted;
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true });
    if (path.endsWith('/route')) return response(200, { venue: 'phoenix', maxLeverage: 24.78, clamped: false, loanSplit: { loanAmountUsd: 2.75 } });
    if (path.endsWith('/mobile/orders/preflight')) return response(200, { ok: true });
    if (path.endsWith('/mobile/orders')) { posted = JSON.parse(options.body); return response(200, { orderPda: 'fixture' }); }
    throw new Error(path);
  };
  await imperial.placeOrder({ owner: WALLET, jwt: 'fixture', fetchImpl, body: {
    symbol: 'SOL', side: 'bid', notionalUsd: 100, leverage: 50, marketPrice: 100, loanAmountUsd: 999999,
  } });
  assert.equal(posted.loanAmountUsd, 2_750_000);
  assert.equal(posted.collateralAmount, 2_000_000);
});

test('Imperial refuses venue substitution and clamped leverage before submission', async () => {
  for (const route of [{ venue: 'phoenix' }, { venue: 'jupiter', clamped: true, clampedMaxLeverage: 10 }]) {
    const fetchImpl = async url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true });
      if (path.endsWith('/route')) return response(200, route);
      assert.fail('Must stop before preflight/submission');
    };
    await assert.rejects(imperial.placeOrder({ owner: WALLET, jwt: 'fixture', fetchImpl,
      body: { symbol: 'SOL', side: 'ask', amount: 100, leverage: 50, pinnedUnderwriter: 0 } }), /selected venue|Lower leverage/);
  }
});

test('Imperial clearing exclusions is explicit and invalid directions fail before requests', async () => {
  await imperial.getRoute({ symbol: 'SOL', side: 'bid', notional: 100, excludedVenues: '' }, async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('side'), 'long');
    assert.equal(params.get('excludedVenues'), '');
    assert.equal(params.has('stickyVenue'), false);
    return response(200, {});
  });
  await assert.rejects(imperial.placeOrder({ owner: WALLET, body: { side: 'oops' },
    fetchImpl: () => assert.fail('Invalid input must not reach Imperial') }), /side must/);
});

function response(status, data) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) };
}

test('Imperial routes server-side, preflights, injects CLASH and includes quoted boost only', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, body });
    if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true, feeBps: 1 });
    if (path.endsWith('/route')) return response(200, { underwriter: 'phoenix', markPrice: 100, loanSplit: { loanAmountUsd: 25 } });
    if (path.endsWith('/mobile/orders/preflight')) return response(200, { ok: true });
    if (path.endsWith('/mobile/orders')) return response(200, { orderPda: 'order-1', signature: 'sig-1' });
    throw new Error(`unexpected ${path}`);
  };
  const proofs = [];
  const result = await imperial.placeOrder({
    playerId: 'p1', owner: WALLET, jwt: 'jwt', fetchImpl,
    db: { recordImperialOrderProof: proof => proofs.push(proof) },
    body: { symbol: 'SOL', side: 'long', amount: 1000, leverage: 20, profileIndex: 2, boost: true, builderCode: 'EVIL' },
  });
  const preflightIndex = calls.findIndex(call => call.path.endsWith('/mobile/orders/preflight'));
  const orderIndex = calls.findIndex(call => call.path.endsWith('/mobile/orders'));
  assert.ok(preflightIndex >= 0 && orderIndex > preflightIndex);
  assert.equal(calls[orderIndex].body.builderCode, 'CLASH');
  assert.equal(calls[orderIndex].body.underwriter, 2);
  assert.equal(calls[orderIndex].body.marketPrice, 100_000_000);
  assert.equal(calls[orderIndex].body.loanAmountUsd, 25_000_000);
  assert.equal(calls[orderIndex].body.collateralAmount, 50_000_000);
  assert.equal(proofs[0].builderCode, 'CLASH');
  assert.equal(proofs[0].requestJson._clashBuilderFeeBps, 1);
  assert.equal(result.underlyingVenue, 'phoenix');
});

test('Imperial close derives venue, side and profile from the authoritative position', async () => {
  const bodies = [];
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true });
    if (path.endsWith('/positions')) return response(200, { dataList: [{ id: 'position-1', asset: 'BTC', side: 'short', profileIndex: 4, underwriter: 'gmtrade', positionPda: 'pda-1', markPrice: 50_000 }] });
    if (path.endsWith('/mobile/orders/preflight')) return response(200, { ok: true });
    if (path.endsWith('/mobile/orders')) { bodies.push(JSON.parse(options.body)); return response(200, { signature: 'close-sig' }); }
    throw new Error(`unexpected ${path}`);
  };
  await imperial.closePosition({ playerId: 'p1', owner: WALLET, jwt: 'jwt', positionId: 'position-1', body: { underwriter: 0, side: 'long' }, fetchImpl, db: { recordImperialOrderProof() {} } });
  assert.equal(bodies[0].underwriter, 3);
  assert.equal(bodies[0].side, 1);
  assert.equal(bodies[0].profileIndex, 4);
  assert.equal(bodies[0].action, 1);
  assert.equal(bodies[0].closeBps, 10_000);
  assert.equal(bodies[0].builderCode, 'CLASH');
  assert.equal(bodies[0].marketPrice, 50_000_000_000_000);
});

test('Imperial keeps risk-reducing close available while CLASH activation is pending', async () => {
  let submitted = null;
  let proofs = 0;
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/mobile/builder/summary')) return response(404, { detail: 'Unknown builder code' });
    if (path.endsWith('/positions')) return response(200, { dataList: [{ id: 'position-1', asset: 'SOL', side: 'long', profileIndex: 0, underwriter: 'phoenix', markPrice: 100 }] });
    if (path.endsWith('/mobile/orders/preflight')) return response(200, { ok: true });
    if (path.endsWith('/mobile/orders')) { submitted = JSON.parse(options.body); return response(200, { signature: 'close-sig' }); }
    throw new Error(`unexpected ${path}`);
  };
  const result = await imperial.closePosition({
    playerId: 'p1', owner: WALLET, jwt: 'jwt', positionId: 'position-1', body: {}, fetchImpl,
    db: { recordImperialOrderProof() { proofs += 1; } },
  });
  assert.equal(submitted.action, 1);
  assert.equal(submitted.builderCode, undefined);
  assert.equal(result.builderAttributionSkipped, true);
  assert.equal(proofs, 0);
});

test('Imperial rewards import only exact fills linked to persisted Clash order proofs', async () => {
  const writes = [];
  const db = {
    listImperialOrderProofs: () => [{
      player_id: 'p1', wallet: WALLET, profile_index: 0, order_pda: 'order-1',
      tx_signature: null, symbol: 'SOL', side: 'long', order_type: 'limit',
      builder_code: 'CLASH', underwriter: 2, created_at: '2026-09-02T00:00:00Z',
      request_json: JSON.stringify({ _clashBuilderFeeBps: 1 }),
    }],
    upsertVerifiedTrade: (_playerId, row) => { writes.push(row); return { inserted: 1, updated: 0 }; },
  };
  const fetchImpl = async url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/order-history/order-1')) return response(200, {
      status: 'filled', fills: [{ txSignature: 'fill-sig', sizeUsd: 1250, price: 145.2, status: 'filled', timestamp: '2026-09-02T00:01:00Z' }],
    });
    throw new Error(`unexpected ${path}`);
  };
  const result = await imperial.importTradesForPlayer({ playerId: 'p1', owner: WALLET, jwt: 'jwt', db, fetchImpl });
  assert.equal(result.imported, 1);
  assert.equal(writes[0].verifiedSource, 'imperial_api');
  assert.equal(writes[0].notional_usd, 1250);
  assert.match(writes[0].clientOrderId, /^imperial:/);
  assert.equal(JSON.parse(writes[0].proofJson).builderCode, 'CLASH');
  assert.equal(JSON.parse(writes[0].proofJson).builderFeeBps, 1);
});

test('Imperial builder failure is fail-closed before order preflight', async () => {
  let orderCalls = 0;
  const fetchImpl = async url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/mobile/builder/summary')) return response(404, { detail: 'Unknown builder code' });
    orderCalls += 1;
    return response(200, {});
  };
  await assert.rejects(() => imperial.placeOrder({ playerId: 'p1', owner: WALLET, jwt: 'jwt', body: { symbol: 'SOL', side: 'long', amount: 100, leverage: 2 }, fetchImpl }), /not active/i);
  assert.equal(orderCalls, 0);
});

test('Imperial snapshot follows the documented read query names and native USDC units', async () => {
  const queries = new Map();
  const fetchImpl = async url => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    queries.set(path, Object.fromEntries(parsed.searchParams));
    if (path.endsWith('/mobile/balances')) return response(200, { profiles: [{ profileIndex: 0, usdc: 12_500_000 }] });
    if (path.endsWith('/mobile/v2/balance')) return response(200, { profiles: [{ profileIndex: 0, availableUsdc: 7_500_000 }] });
    if (path.endsWith('/positions')) return response(200, { dataList: [] });
    if (path.endsWith('/orders')) return response(200, { jupiterOrders: [], passthroughOrders: [] });
    if (path.endsWith('/trades')) return response(200, { dataList: [] });
    if (path.endsWith('/mark-prices')) return response(200, { rows: [{ symbol: 'SOL', phoenix: { price: 150, source: 'test' } }] });
    if (path.endsWith('/funding-rates')) return response(200, { rows: [{ symbol: 'SOL', phoenix: { longFundingRatePerHourPercent: 0.01 } }] });
    if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true });
    if (path.endsWith('/mobile/partner/registration')) return response(200, { registered: false });
    throw new Error(`unexpected ${path}`);
  };
  const snapshot = await imperial.snapshot('jwt', WALLET, 0, fetchImpl);
  assert.equal(snapshot.account.balance, 20);
  assert.equal(snapshot.account.profile_usdc, 12.5);
  assert.equal(snapshot.account.flash_v2_available_usdc, 7.5);
  assert.equal(snapshot.marks[0].price, 150);
  assert.equal(snapshot.funding[0].fundingRate, 0.0001);
  for (const suffix of ['/positions', '/orders', '/trades']) {
    const [path] = [...queries.keys()].filter(key => key.endsWith(suffix));
    assert.equal(queries.get(path).walletAddress, WALLET);
    assert.equal(queries.get(path).wallet, undefined);
  }
});

test('Imperial submits entry plus TP/SL as one native batch with CLASH on every leg', async () => {
  let batchBody = null;
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true });
    if (path.endsWith('/route')) return response(200, { underwriter: 'phoenix', markPrice: 100, loanSplit: { loanAmountUsd: 0 } });
    if (path.endsWith('/mobile/orders/preflight')) return response(200, { ok: true });
    if (path.endsWith('/mobile/orders/batch')) {
      batchBody = JSON.parse(options.body);
      return response(200, { entry: { success: true, signature: 'entry-sig' }, closeOrders: [{ success: true, orderPda: 'tp' }, { success: true, orderPda: 'sl' }] });
    }
    throw new Error(`unexpected ${path}`);
  };
  const proofs = [];
  const result = await imperial.placeOrder({
    playerId: 'p1', owner: WALLET, jwt: 'jwt', fetchImpl,
    db: { recordImperialOrderProof: proof => proofs.push(proof) },
    body: { symbol: 'SOL', side: 'long', amount: 100, leverage: 2, takeProfit: 120, stopLoss: 90 },
  });
  assert.equal(batchBody.entry.builderCode, 'CLASH');
  assert.equal(batchBody.entry.marketPrice, 100_000_000);
  assert.equal(batchBody.closeOrders.length, 2);
  assert.ok(batchBody.closeOrders.every(order => order.builderCode === 'CLASH' && order.action === 1 && order.closeBps === 10_000 && order.marketPrice === 0));
  assert.equal(proofs.length, 3);
  assert.equal(result.attachedTpsl, true);
});

test('Imperial exposes sequential batch partial success when protection legs fail', async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true, feeBps: 10 });
    if (path.endsWith('/route')) return response(200, { underwriter: 'phoenix', markPrice: 100 });
    if (path.endsWith('/mobile/orders/preflight')) return response(200, { ok: true });
    if (path.endsWith('/mobile/orders/batch')) return response(200, {
      entry: { success: true, signature: 'entry-sig' },
      closeOrders: [{ success: false, error: 'TP rejected', errorCode: 'BAD_TRIGGER' }],
    });
    throw new Error(`unexpected ${path}`);
  };
  const result = await imperial.placeOrder({
    playerId: 'p1', owner: WALLET, jwt: 'jwt', fetchImpl,
    db: { recordImperialOrderProof() {} },
    body: { symbol: 'SOL', side: 'long', amount: 100, leverage: 2, takeProfit: 120 },
  });
  assert.equal(result.success, true);
  assert.equal(result.partialSuccess, true);
  assert.match(result.error, /opened the position/i);
  assert.deepEqual(result.closeOrderErrors, [{ error: 'TP rejected', errorCode: 'BAD_TRIGGER' }]);
});

test('Imperial does not submit after a negative preflight verdict', async () => {
  let submitted = false;
  const fetchImpl = async url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true });
    if (path.endsWith('/route')) return response(200, { underwriter: 'phoenix', markPrice: 100 });
    if (path.endsWith('/mobile/orders/preflight')) return response(200, { ok: false, error: 'insufficient margin' });
    if (path.endsWith('/mobile/orders')) submitted = true;
    return response(200, { success: true });
  };
  await assert.rejects(() => imperial.placeOrder({ playerId: 'p1', owner: WALLET, jwt: 'jwt', body: { symbol: 'SOL', side: 'long', amount: 100, leverage: 2 }, fetchImpl }), /insufficient margin/i);
  assert.equal(submitted, false);
});

test('Imperial uses documented stickyVenue and Flash priceExponent contracts', async () => {
  let routeQuery = null;
  let orderBody = null;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true, feeBps: 10 });
    if (path.endsWith('/route')) { routeQuery = Object.fromEntries(parsed.searchParams); return response(200, { venue: 'flash', maxLeverage: 20 }); }
    if (path.endsWith('/flash/markets')) return response(200, [{ symbol: 'SOL', side: 'long', priceExponent: -8 }]);
    if (path.endsWith('/mobile/orders/preflight')) return response(200, { ok: true });
    if (path.endsWith('/mobile/orders')) { orderBody = JSON.parse(options.body); return response(200, { success: true, signature: 'flash-sig' }); }
    throw new Error(`unexpected ${path}`);
  };
  await imperial.placeOrder({
    playerId: 'p1', owner: WALLET, jwt: 'jwt', fetchImpl,
    db: { recordImperialOrderProof() {} },
    body: { symbol: 'SOL', side: 'long', amount: 100, leverage: 2, marketPrice: 64.94, pinnedUnderwriter: 1 },
  });
  assert.equal(routeQuery.stickyVenue, 'flash');
  assert.equal(routeQuery.pinnedUnderwriter, undefined);
  assert.equal(orderBody.underwriter, 1);
  assert.equal(orderBody.marketPrice, 6_494_000_000);
});

test('Imperial limit orders send the OpenAPI-required zero marketPrice', async () => {
  let orderBody = null;
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/mobile/builder/summary')) return response(200, { active: true });
    if (path.endsWith('/route')) return response(200, { venue: 'phoenix', maxLeverage: 20 });
    if (path.endsWith('/mobile/orders/preflight')) return response(200, { ok: true });
    if (path.endsWith('/mobile/orders')) { orderBody = JSON.parse(options.body); return response(200, { success: true, orderPda: 'limit-pda' }); }
    throw new Error(`unexpected ${path}`);
  };
  await imperial.placeOrder({
    playerId: 'p1', owner: WALLET, jwt: 'jwt', fetchImpl,
    db: { recordImperialOrderProof() {} },
    body: { symbol: 'SOL', side: 'short', amount: 100, leverage: 2, orderType: 'limit', price: 120 },
  });
  assert.equal(orderBody.orderType, 1);
  assert.equal(orderBody.marketPrice, 0);
  assert.equal(orderBody.triggerPrice, 120_000_000_000);
});
