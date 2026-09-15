import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { decodeAbiParameters, encodeErrorResult, formatUnits } from 'viem';
import { buildLeverupOpenAmounts, leverupUnits, leverupActionError } from './src/lib/leverupOrderAmounts.js';
import { buildLeverupActionData, OneClickAction, LEVERUP_ACTION_DATA_TYPES, LEVERUP_USDC, LEVERUP_LVUSD } from './src/lib/leverupV2.js';

const source = process.env.LEVERUP_TEST_BASELINE
  ? execFileSync('git', ['show', 'HEAD:web/src/components/basic/BasicTradeFlow.jsx'], { encoding: 'utf8' })
  : readFileSync(new URL('./src/components/basic/BasicTradeFlow.jsx', import.meta.url), 'utf8');
const callback = source.slice(source.indexOf('  const handleConfirm = useCallback('), source.indexOf('\n  const stepIdx'));
const sizing = source.slice(source.indexOf('function pacificaQtyFromMargin'), source.indexOf('function pacificaUsableMargin'));
const trader = '0x39B36f1EDF2eF5a6f2e02991b3a85Fb356eB5005';

function basicFixture({ dex = 'leverup', direction = 'long', margin = 10, leverage = 20, price = 100000, response = { success: true } } = {}) {
  const calls = [], errors = [], tabs = [];
  const context = vm.createContext({
    dex, pickedDir: direction, pickedToken: { symbol: 'BTC', lot_size: 1e-10 },
    pickedAmount: margin, pickedLev: leverage, livePrice: price, tradeBalance: 100,
    submittedRef: { current: false }, useCallback: fn => fn,
    setSubmitting() {}, setErrorMsg: error => errors.push(error),
    setActiveTab: tab => tabs.push(tab), setStep() {}, setPickedToken() {},
    setPickedDir() {}, setPickedAmount() {}, setPickedLev() {},
    placeMarketOrder: async (...args) => { calls.push(args); return response; },
    setLeverageApi: undefined, setMarginMode: undefined, marginModes: {}, leverageSettings: {},
    pacAgent: true, bindAgent: undefined, takerFeeRate: 0.0004,
    PACIFICA_MIN_NOTIONAL_USD: 10, PACIFICA_MARKET_SLIPPAGE_RATE: 0.005,
    PACIFICA_DEFAULT_TAKER_FEE_RATE: 0.0004, PACIFICA_FEE_BUFFER_RATE: 0.0001,
  });
  vm.runInContext(`${sizing}\n${callback}\nglobalThis.confirm = handleConfirm;`, context);
  return { context, calls, errors, tabs };
}

test('actual Basic confirmation preserves USDC margin and leverage for LeverUp longs and shorts', async () => {
  for (const direction of ['long', 'short']) {
    const f = basicFixture({ direction });
    await f.context.confirm();
    assert.deepEqual(Array.from(f.calls[0]), ['BTC', direction, 10, '0.5', 20]);
    const [, side, margin, slippage, leverage] = f.calls[0];
    const amounts = buildLeverupOpenAmounts({ margin, leverage, price: '100000', feeRate: '0.0004', slippage, isLong: side === 'long' });
    const data = buildLeverupActionData(OneClickAction.MARKET_OPEN, trader,
      [trader, side === 'long', LEVERUP_USDC, LEVERUP_LVUSD, amounts.amountIn, amounts.qty, amounts.price, 0n, 0n, 2, 0n]);
    const decoded = decodeAbiParameters(LEVERUP_ACTION_DATA_TYPES[0].map(type => ({ type })), data);
    assert.equal(decoded[4], 10_080_000n);
    assert.equal(decoded[5], 20_000_000n); // $200 / $100k = 0.002 BTC, not BTC reinterpreted as USDC
    assert.equal(decoded[6], BigInt(side === 'long' ? 100500 : 99500) * 10n ** 18n);
    assert.equal(decoded[9], 2);
    assert.equal(decoded[10], 0n);
    assert.deepEqual(f.tabs, ['Positions']);
  }
});

test('Basic rejection stays on confirmation and allows a deliberate retry', async () => {
  const f = basicFixture({ response: { error: 'test rejection' } });
  await f.context.confirm();
  assert.equal(f.context.submittedRef.current, false);
  assert.equal(f.tabs.length, 0);
  assert.equal(f.errors.at(-1), 'test rejection');
  await f.context.confirm();
  assert.equal(f.calls.length, 2);
});

test('Pacifica still receives base quantity, not USDC margin', async () => {
  const f = basicFixture({ dex: 'pacifica' });
  await f.context.confirm();
  assert.equal(f.calls[0].length, 4);
  assert.equal(f.calls[0][1], 'bid');
  assert.ok(Number(f.calls[0][2]) > 0 && Number(f.calls[0][2]) < 0.002);
});

test('decimal sizing floors quantities, preserves price digits and rounds fees up', () => {
  assert.equal(leverupUnits('1.000000000000000001', 18), 1000000000000000001n);
  assert.equal(leverupUnits('1e-10', 10), 1n);
  assert.equal(leverupUnits('1.23456789019', 10), 12345678901n);
  const a = buildLeverupOpenAmounts({ margin: '1.000001', leverage: '3', price: '7.000000000000000001', feeRate: '0.0004' });
  assert.equal(a.qty, 4285718571n);
  assert.equal(a.amountIn, 1001202n);
  assert.equal(a.price, 7000000000000000001n);
  assert.equal(formatUnits(a.openFee, 6), '0.001201');
  for (const bad of ['NaN', 'Infinity', '-1', '', '1e999']) assert.throws(() => leverupUnits(bad, 6));
  assert.throws(() => buildLeverupOpenAmounts({ margin: '0.0000001', leverage: 1, price: 1 }));
  assert.throws(() => buildLeverupOpenAmounts({ margin: 1, leverage: 1, price: 1, slippage: 100 }));
});

test('production revert payload is decoded without exposing hex to the user', () => {
  const reason = encodeErrorResult({ abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string' }] }], errorName: 'Error', args: ['TradingCheckerFacet: Position is too small'] });
  assert.match(leverupActionError({ reason }), /Increase the USDC margin or leverage/);
  assert.match(leverupActionError({ skipped: true, skipReason: 'FEE' }), /balance and token approval/);
  assert.ok(!leverupActionError({ reason: '0xdeadbeef' }).includes('0x'));
});

test('actual LeverUp hook market and limit callbacks build expected action fields', async () => {
  const hook = readFileSync(new URL('./src/hooks/useLeverup.js', import.meta.url), 'utf8');
  const calls = [];
  const context = vm.createContext({
    buildLeverupOpenAmounts, leverupUnits, formatUnits, OneClickAction,
    LEVERUP_USDC, LEVERUP_LVUSD,
    rawPrice: value => leverupUnits(value, 18),
    num: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    normalizeLongSide: side => ['long', 'bid', 'buy'].includes(side),
    validateLeverupOrderRisk() {}, setLoading() {}, setError() {},
    useCallback: fn => fn, walletUsdc: '100', brokerRef: { current: { active: true, brokerId: 2 } },
    findMarket: () => ({ symbol: 'BTC', pairBase: trader, open_fee_rate: '0.0004' }),
    findPrice: () => 100000,
    submitAction: async (...args) => { calls.push(args); return { success: true }; },
  });
  const methods = hook.slice(hook.indexOf('  const placeMarketOrder ='), hook.indexOf('  const closePosition ='));
  vm.runInContext(`${methods}\nglobalThis.market = placeMarketOrder; globalThis.limit = placeLimitOrder;`, context);
  assert.equal((await context.market('BTC', 'long', '10', '0.5', 20)).success, true);
  assert.equal(calls[0][1][4], 10080000n);
  assert.equal(calls[0][1][5], 20000000n);
  assert.equal((await context.limit('BTC', 'short', '100000.000000000001', '10', 'GTC', 20, { stopLoss: 110000, takeProfit: 90000 })).success, true);
  const fields = calls[1][1];
  assert.equal(fields[1], false);
  assert.equal(fields[6], 100000000000000001000000n);
  assert.equal(fields[7], 110000n * 10n ** 18n);
  assert.equal(fields[8], 90000n * 10n ** 18n);
  assert.equal(fields[9], 2);
  assert.equal(fields[10], 0n);
  assert.match((await context.market('BTC', 'long', '101', '0.5', 20)).error, /USDC/);
  assert.equal(calls.length, 2, 'insufficient collateral fails before signing');
});
