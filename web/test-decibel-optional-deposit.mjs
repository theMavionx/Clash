import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const panel = readFileSync(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const start = panel.indexOf('async (side) => {', panel.indexOf('const handleTrade = useCallback('));
const end = panel.indexOf('}, [amount, tokenAmount, positionUsdc', start);
assert.ok(start > 0 && end > start, 'Find the real order handler, not a copy of its logic');
const handlerSource = panel.slice(start, end + 1);

async function submit(overrides = {}, side = 'bid') {
  const calls = [];
  const state = {};
  const context = {
    dex: 'decibel',
    amount: '20',
    amountInUsdc: true,
    tokenAmount: '0.0025',
    positionUsdc: 200,
    leverage: 10,
    currentPrice: 80000,
    orderSizingPrice: 80000,
    currentMarket: {},
    orderType: 'market',
    limitPrice: '80000',
    symbol: 'BTC',
    pacBalance: 0,
    balanceCheckPending: false,
    isLighterDex: false,
    tradeInFlight: { current: false },
    levTimerRef: { current: null },
    leverageSettings: {},
    resolveOpenTpslForSide: () => ({ ok: true, hasTpsl: false }),
    setLocalAlert: value => { state.alert = value; },
    setTradeBusy: value => { state.busy = value; },
    setTradePhase: value => { state.phase = value; },
    setSuccessMsg: value => { state.success = value; },
    setAmount: value => { state.amount = value; },
    setSizePct: value => { state.sizePct = value; },
    setLeverageApi: async (...args) => { calls.push(['leverage', ...args]); return { ok: true }; },
    placeMarketOrder: async (...args) => { calls.push(['market', ...args]); return { ok: true }; },
    placeLimitOrder: async (...args) => { calls.push(['limit', ...args]); return { ok: true }; },
    ...overrides,
  };
  await vm.runInNewContext(`(${handlerSource})`, context)(side);
  assert.equal(state.busy, false, 'release busy state after submit/rejection');
  assert.equal(state.phase, null);
  assert.equal(context.tradeInFlight.current, false);
  return { calls, state };
}

test('deposit is not an entry gate; Account funding and activation remain', () => {
  assert.doesNotMatch(panel, /DecibelDepositGate|Deposit USDC to start|DECIBEL DEPOSIT GATE/);
  assert.match(panel, /Browse without a deposit — add USDC in Account when you want to trade/);
  assert.match(panel, /onClick=\{\(\) => setActiveTab\('Account'\)\}/);
  assert.match(panel, /await depositToPacifica\(depositAmt, depositOptions\)/);
  assert.match(panel, /setupVerified !== true \|\| \(hasReferrer !== true && !hasDecibelRiskToManage\)/);
});

test('zero collateral rejects a new market order before leverage/signing', async () => {
  const { calls, state } = await submit();
  assert.deepEqual(calls, []);
  assert.match(state.alert, /\$0\.00 free collateral/);
  assert.match(state.alert, /browse without a deposit/);
  assert.equal(state.success, undefined);
});

test('insufficient collateral rejects a limit short without a wallet call', async () => {
  const { calls, state } = await submit({ orderType: 'limit', pacBalance: 5 }, 'ask');
  assert.deepEqual(calls, []);
  assert.match(state.alert, /\$5\.00 free collateral/);
});

test('an account still loading is not mistaken for an unfunded account', async () => {
  const { calls, state } = await submit({ balanceCheckPending: true });
  assert.deepEqual(calls, []);
  assert.match(state.alert, /still loading/);
  assert.doesNotMatch(state.alert, /deposit/);
});

test('token-denominated size uses the same collateral check', async () => {
  const { calls, state } = await submit({ amountInUsdc: false, pacBalance: 19 });
  assert.deepEqual(calls, []);
  assert.match(state.alert, /free collateral/);
});

for (const orderType of ['market', 'limit']) {
  test(`funded ${orderType} submission keeps leverage and order flow`, async () => {
    const { calls, state } = await submit({ pacBalance: 20, orderType });
    assert.equal(state.alert, null);
    assert.deepEqual(calls.map(call => call[0]), ['leverage', orderType]);
    assert.equal(calls[1][orderType === 'market' ? 3 : 4], '20.000000');
    assert.match(state.success, /BTC (opened|limit placed)/);
    assert.equal(state.amount, '');
  });
}

test('Decibel funding check does not alter other venues', async () => {
  const { calls, state } = await submit({ dex: 'avantis' });
  assert.equal(state.alert, null);
  assert.deepEqual(calls.map(call => call[0]), ['market']);
});
