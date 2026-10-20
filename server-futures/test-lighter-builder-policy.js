// Offline: mocked fetch + injected signerRunner. Never signs or submits a real transaction.
const assert = require('assert');
const {
  lighterSigningChainId,
  lighterAccountTier,
  lighterBuilderSupportedForTier,
  lighterBuilderFields,
  isLighterAccountTierError,
} = require('./lighter-builder-policy');
const { createLighterAdapter } = require('./lighter');

const originalFetch = global.fetch;
const OWNER = '0x1111111111111111111111111111111111111111';
const INTEGRATOR_OWNER = '0xb36402e87a86206d3a114a98b53f31362291fe1b';
const TIERS = { 7: 'standard', 8: 'premium', 9: 'plus', 10: 'premium', 11: 'mystery' };
const fetches = [];
let proxyDown = false;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

global.fetch = async (url, init = {}) => {
  const parsed = new URL(String(url));
  fetches.push({ path: parsed.pathname, query: parsed.search, auth: init.headers?.authorization || '', direct: Boolean(init.dispatcher) });
  if (proxyDown && !init.dispatcher && parsed.pathname === '/api/v1/funding-rates') throw new Error('proxy down');
  if (parsed.pathname === '/api/v1/accountLimits') {
    if (init.headers?.authorization !== 'tok') return json({ code: 20001, message: 'unauthorized' }, 401);
    return json({ code: 200, user_tier_name: TIERS[Number(parsed.searchParams.get('account_index'))] || 'standard' });
  }
  if (parsed.pathname === '/api/v1/account') {
    const index = Number(parsed.searchParams.get('value'));
    return json({ code: 200, accounts: [{ account_index: index, index, l1_address: index === 42 ? INTEGRATOR_OWNER : OWNER }] });
  }
  if (parsed.pathname === '/api/v1/nextNonce') return json({ nonce: 5 });
  if (parsed.pathname === '/api/v1/orderBookDetails') {
    return json({ code: 200, order_book_details: [{ market_id: 1, symbol: 'BTC', status: 'active', market_type: 'perp', supported_size_decimals: 4, supported_price_decimals: 1, last_trade_price: 100000 }] });
  }
  if (parsed.pathname === '/api/v1/funding-rates') return json({ code: 200, funding_rates: [] });
  if (parsed.pathname === '/api/v1/orderBooks') return json({ code: 200, order_books: [{ market_id: 1, symbol: 'BTC', status: 'active', supported_size_decimals: 4, supported_price_decimals: 1 }] });
  throw new Error(`unexpected request ${parsed.pathname}`);
};

function adapter(signerCalls, { api = 'https://rh.test', integratorAccountIndex = 42, refuse21520 = false } = {}) {
  return createLighterAdapter({
    dexId: 'rhlighter', label: 'Robinhood Lighter', api, integratorAccountIndex,
    integratorExpectedOwner: INTEGRATOR_OWNER, builderFeeBps: 1, referralRequired: false,
    signerRunner: async (action, payload) => {
      signerCalls.push({ action, payload });
      if (action === 'auth_token') return { ok: true, auth_token: 'tok' };
      if (action === 'approve_integrator_prepare') return { ok: true, tx_type: 45, tx_info: '{}', tx_hash: '0x', message_to_sign: 'm' };
      if (action === 'create_order' || action === 'create_grouped_orders') {
        if (refuse21520 && payload.integrator_account_index > 0) {
          throw new Error("Lighter signer create_order failed: code=21520 message='integrator fee not allowed'");
        }
        return { ok: true, tx_hash: '0xorder' };
      }
      if (action === 'send_tx') return { ok: true };
      throw new Error(`unexpected signer action ${action}`);
    },
  });
}

const creds = index => ({ accountIndex: index, apiKeyIndex: 4, apiPrivateKey: `0x${'11'.repeat(40)}` });
const order = index => ({ ...creds(index), symbol: 'BTC', side: 'buy', amount: '0.001', orderType: 'limit', price: 100000 });

(async () => {
  try {
    // Pure decision logic.
    assert.strictEqual(lighterSigningChainId('https://api.rh.lighter.xyz/'), 466324);
    assert.strictEqual(lighterSigningChainId('https://mainnet.zklighter.elliot.ai'), 304);
    assert.strictEqual(lighterSigningChainId('https://unknown.test', null), null);
    assert.strictEqual(lighterAccountTier({ user_tier_name: ' Premium ' }), 'premium');
    assert.strictEqual(lighterAccountTier({ user_tier: 'standard' }), 'standard');
    assert.strictEqual(lighterAccountTier(null), null);
    assert.strictEqual(lighterBuilderSupportedForTier('premium'), true);
    assert.strictEqual(lighterBuilderSupportedForTier('plus'), true);
    assert.strictEqual(lighterBuilderSupportedForTier('standard'), false);
    assert.strictEqual(lighterBuilderSupportedForTier('mystery'), null);
    assert.strictEqual(lighterBuilderSupportedForTier(''), null);
    const profile = { integratorAccountIndex: 42, builderFeeValue: 100 };
    assert.deepStrictEqual(lighterBuilderFields(profile, { builderSupported: false, accountIndex: 7 }),
      { integrator_account_index: 0, integrator_taker_fee: 0, integrator_maker_fee: 0 });
    assert.deepStrictEqual(lighterBuilderFields(profile, { builderSupported: true, accountIndex: 8 }),
      { integrator_account_index: 42, integrator_taker_fee: 100, integrator_maker_fee: 100 });
    assert.deepStrictEqual(lighterBuilderFields(profile, { builderSupported: null, accountIndex: 8 }),
      { integrator_account_index: 42, integrator_taker_fee: 100, integrator_maker_fee: 100 }, 'unknown tier keeps the builder');
    assert.deepStrictEqual(lighterBuilderFields(profile, { builderSupported: true, accountIndex: 42 }),
      { integrator_account_index: 42, integrator_taker_fee: 0, integrator_maker_fee: 0 }, 'integrator account never pays itself');
    assert.strictEqual(isLighterAccountTierError(new Error("code=21520 message='x'")), true);
    assert.strictEqual(isLighterAccountTierError(new Error("code=21120 message='invalid signature'")), false);

    // Signing domain is forwarded to the signer for every action.
    const domainCalls = [];
    const realRh = adapter(domainCalls, { api: 'https://api.rh.lighter.xyz' });
    await realRh.checkCredentials(creds(7)).catch(() => {});
    assert.strictEqual(domainCalls[0]?.payload?.signing_chain_id, 466324);

    // Standard account: approval is skipped (nothing signed), orders carry no builder.
    const stdCalls = [];
    const std = adapter(stdCalls);
    const skipped = await std.prepareIntegratorApproval(creds(7));
    assert.strictEqual(skipped.skipped, true);
    assert.strictEqual(skipped.integrator_required, false);
    assert.strictEqual(skipped.builder_supported, false);
    assert.strictEqual(skipped.account_tier, 'standard');
    assert.ok(!stdCalls.some(c => c.action === 'approve_integrator_prepare'), 'no ApproveIntegrator for regular accounts');
    const submitSkipped = await std.submitIntegratorApproval({ ...creds(7), tx_type: 45, tx_info: '{}' });
    assert.strictEqual(submitSkipped.skipped, true);
    assert.ok(!stdCalls.some(c => c.action === 'send_tx'));
    const stdOrder = await std.createOrder(order(7));
    const stdSigned = stdCalls.find(c => c.action === 'create_order');
    assert.strictEqual(stdSigned.payload.integrator_account_index, 0);
    assert.strictEqual(stdSigned.payload.integrator_taker_fee, 0);
    assert.strictEqual(stdSigned.payload.integrator_maker_fee, 0);
    assert.strictEqual(stdOrder.builder_applied, false);
    const stdAccount = await std.getAccount({ accountIndex: 7 });
    assert.strictEqual(stdAccount.integrator_required, false, 'account read reports cached tier');

    // Regular accounts trade even when the deployment integrator is not configured.
    const noIntegratorCalls = [];
    const noIntegrator = adapter(noIntegratorCalls, { integratorAccountIndex: 0 });
    const noIntegratorOrder = await noIntegrator.createOrder({ ...order(7), authToken: 'tok' });
    assert.strictEqual(noIntegratorOrder.builder_applied, false);

    // Premium / Plus: builder kept, approval prepared as before.
    const premCalls = [];
    const prem = adapter(premCalls);
    const prepared = await prem.prepareIntegratorApproval(creds(8));
    assert.ok(!prepared.skipped);
    assert.strictEqual(premCalls.find(c => c.action === 'approve_integrator_prepare').payload.integrator_account_index, 42);
    const premOrder = await prem.createOrder(order(9));
    const premSigned = premCalls.find(c => c.action === 'create_order');
    assert.strictEqual(premSigned.payload.integrator_account_index, 42);
    assert.strictEqual(premSigned.payload.integrator_taker_fee, 100);
    assert.strictEqual(premOrder.builder_applied, true);
    const premAccount = await prem.getAccount({ accountIndex: 9, authToken: 'tok' });
    assert.strictEqual(premAccount.integrator_required, true);

    // Unknown tier keeps the builder; a 21520 refusal downgrades once and resends without it.
    const refuseCalls = [];
    const refusing = adapter(refuseCalls, { refuse21520: true });
    const downgraded = await refusing.createOrder(order(11));
    const attempts = refuseCalls.filter(c => c.action === 'create_order');
    assert.strictEqual(attempts.length, 2);
    assert.strictEqual(attempts[0].payload.integrator_account_index, 42);
    assert.strictEqual(attempts[1].payload.integrator_account_index, 0);
    assert.strictEqual(downgraded.builder_applied, false);
    await refusing.createOrder(order(11));
    assert.strictEqual(refuseCalls.filter(c => c.action === 'create_order').length, 3, 'downgrade is remembered');

    // Other signer failures are not retried.
    const failCalls = [];
    const failing = createLighterAdapter({
      dexId: 'rhlighter', label: 'Robinhood Lighter', api: 'https://rh.test', integratorAccountIndex: 42,
      integratorExpectedOwner: INTEGRATOR_OWNER, builderFeeBps: 1, referralRequired: false,
      signerRunner: async (action, payload) => {
        failCalls.push({ action, payload });
        if (action === 'auth_token') return { ok: true, auth_token: 'tok' };
        throw new Error("Lighter signer create_order failed: code=21120 message='invalid signature'");
      },
    });
    await assert.rejects(failing.createOrder(order(10)), /21120/);
    assert.strictEqual(failCalls.filter(c => c.action === 'create_order').length, 1);

    // Public reads survive a dead proxy path via one direct read.
    proxyDown = true;
    const before = fetches.length;
    const prices = await adapter([], { api: 'https://rh-fresh.test' }).getMarketInfo();
    assert.ok(Array.isArray(prices));
    assert.ok(fetches.slice(before).some(f => f.path === '/api/v1/funding-rates' && f.direct), 'funding-rates fell back to direct');
    proxyDown = false;

    console.log('Lighter builder applicability, signing-domain and read-fallback tests passed');
  } finally {
    global.fetch = originalFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
