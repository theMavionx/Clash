// GRVT leverage: set_initial_leverage is deprecated (GRVT error 2106); leverage changes go
// through the signed set_position_config. No network: fetch is stubbed.
// Run: node test-grvt-position-config.js
const assert = require('node:assert/strict');
const { test } = require('node:test');

const grvt = require('./grvt');

const calls = [];
let leverageRows = [];
const realFetch = global.fetch;

global.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url: String(url), body, headers: init.headers || {} });
  const path = new URL(String(url)).pathname;
  if (path.endsWith('/set_initial_leverage')) {
    return new Response(JSON.stringify({ c: 2106, m: 'This API has been deprecated and can no longer be used to set leverage', s: 400 }), { status: 400 });
  }
  if (path === '/full/v1/get_all_initial_leverage') {
    return Response.json({ results: leverageRows });
  }
  if (path === '/full/v1/set_position_config') {
    return Response.json({ result: { ack: true } });
  }
  return new Response('unexpected', { status: 500 });
};

test.after(() => { global.fetch = realFetch; });

const creds = { cookie: 'gravity=fixture', accountId: 'acct-fixture', subAccountId: '8289849667772468' };
const signature = {
  signer: '0x1267c6181aee40f5ddbd70c56ecf4613117326b5',
  r: '0x0bb90e28853419909c56ddef5bffa602831db7cd768756c6017fb0d81f425284',
  s: '0x78c895387b2bc64e7206fa8257b0a796bf5adc46788ac61efb857718cc82dc5c',
  v: 27,
  expiration: '4102444800000000000',
  nonce: 7003,
  chain_id: '326',
};

function reset(rows = []) {
  calls.length = 0;
  leverageRows = rows;
}

test('set_position_config sends the SDK request shape (full mode)', async () => {
  reset();
  const out = await grvt.setPositionConfig(creds, {
    instrument: 'BTC_USDT_Perp', marginType: 'ISOLATED', leverage: '10', signature,
  });
  assert.equal(out.success, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/full\/v1\/set_position_config$/);
  assert.deepEqual(calls[0].body, {
    sub_account_id: '8289849667772468',
    instrument: 'BTC_USDT_Perp',
    margin_type: 'ISOLATED',
    leverage: '10',
    signature: { ...signature },
  });
  assert.equal(calls[0].headers['X-Grvt-Account-Id'], 'acct-fixture');
});

test('signed set-leverage forwards to set_position_config and never calls set_initial_leverage', async () => {
  reset();
  await grvt.setInitialLeverage(creds, { instrument: 'ETH_USDT_Perp', leverage: '20.50', signature });
  assert.ok(calls.every(c => !c.url.includes('set_initial_leverage')));
  const call = calls.find(c => c.url.endsWith('/set_position_config'));
  assert.equal(call.body.leverage, '20.5');
  assert.equal(call.body.margin_type, 'CROSS');
});

test('unsigned set-leverage succeeds without GRVT write when current leverage covers the order', async () => {
  reset([{ instrument: 'BTC_USDT_Perp', leverage: '20', min_leverage: '1', max_leverage: '50', margin_type: 'CROSS' }]);
  const same = await grvt.setInitialLeverage(creds, { instrument: 'BTC_USDT_Perp', leverage: '20' });
  assert.deepEqual({ success: same.success, applied: same.applied, reason: same.reason }, { success: true, applied: false, reason: 'unchanged' });
  const lower = await grvt.setInitialLeverage(creds, { instrument: 'BTC_USDT_Perp', leverage: '5' });
  assert.equal(lower.reason, 'current_leverage_covers_order');
  assert.ok(calls.every(c => !c.url.includes('set_initial_leverage') && !c.url.includes('set_position_config')));
});

test('unsigned set-leverage above current leverage answers a clear 409', async () => {
  reset([{ instrument: 'BTC_USDT_Perp', leverage: '10', margin_type: 'CROSS' }]);
  await assert.rejects(
    grvt.setInitialLeverage(creds, { instrument: 'BTC_USDT_Perp', leverage: '25' }),
    (e) => e.status === 409 && e.code === 'grvt_signed_position_config_required' && /signed position config/.test(e.message) && /10x/.test(e.message),
  );
  assert.ok(calls.every(c => !c.url.includes('set_initial_leverage')));
});

test('input validation returns 400-class errors', async () => {
  reset();
  await assert.rejects(grvt.setPositionConfig(creds, { instrument: 'BTC_USDT_Perp', marginType: 'PORTFOLIO', leverage: '10', signature }), e => e.status === 400);
  await assert.rejects(grvt.setPositionConfig(creds, { instrument: 'BTC_USDT_Perp', leverage: '1.0000001', signature }), e => e.status === 400);
  await assert.rejects(grvt.setPositionConfig(creds, { instrument: 'BTC_USDT_Perp', leverage: '10' }), e => e.status === 400);
  await assert.rejects(grvt.setInitialLeverage(creds, { leverage: '10' }), e => e.status === 400);
  assert.equal(calls.length, 0);
});
