import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const start = source.indexOf('const renderTradeControls');
const controls = source.slice(start, source.indexOf('// ==================== BOTTOM PANEL', start));
const fragments = [
  controls.match(/<div className="futures-ticket-topbar">[\s\S]*?(?=\n\s*\{orderType === 'limit')/)[0],
  controls.match(/<button type="button" className="futures-order-ticket__submit"[\s\S]*?<\/button>/)[0],
];
const code = (await transformWithOxc(`globalThis.result = <>${fragments.join('')}</>`, 'ticket.jsx', { jsx: { runtime: 'classic' } })).code;
const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
function render(state) {
  const calls = [];
  const context = { React, ...state, leverage: 10, showLeverage: false, S: {},
    tradeButtonBusy: false, tradeButtonBlocked: false, tradeButtonPendingLabel: 'Submitting',
    clearTradeFeedback() {}, setShowLeverage() {},
    setOrderType(value) { state.orderType = value; },
    setOpenTpslPreviewSide(value) { state.openTpslPreviewSide = value; },
    handleTrade(side) { calls.push({ side, orderType: state.orderType }); },
  };
  vm.runInNewContext(code, context);
  const buttons = [];
  function walk(node) { if (!node || typeof node !== 'object') return; if (node.type === 'button') buttons.push(node); node.children?.flat(Infinity).forEach(walk); }
  walk(context.result);
  return { buttons, calls };
}
for (const orderType of ['market', 'limit']) for (const side of ['bid', 'ask']) {
  test(`${orderType} ${side}: selection does not submit; single submit dispatches selected side`, () => {
    const state = { orderType: 'market', openTpslPreviewSide: 'bid' };
    let view = render(state);
    view.buttons.find(b => b.children.includes(orderType === 'market' ? 'Market' : 'Limit')).props.onClick();
    view.buttons.find(b => b.children.includes(side === 'bid' ? 'Buy / Long' : 'Sell / Short')).props.onClick();
    assert.equal(view.calls.length, 0);
    assert.deepEqual(state, { orderType, openTpslPreviewSide: side });
    view = render(state);
    const submits = view.buttons.filter(b => b.props.className === 'futures-order-ticket__submit');
    assert.equal(submits.length, 1);
    submits[0].props.onClick();
    assert.deepEqual(view.calls, [{ side, orderType }]);
  });
}
test('leverage presets removed, numeric control retained and submit safety unchanged', () => {
  assert.doesNotMatch(controls, /S\.levPreset/);
  assert.match(controls, /aria-label="Leverage multiplier"/);
  assert.match(controls, /disabled=\{tradeButtonBusy \|\| tradeButtonBlocked\}/);
  assert.match(source, /side: openTpslPreviewSide === 'ask' \? 'short' : 'long'/);
});

const leverageStart = source.indexOf('const handleLeverageChange = useCallback(');
const leverageEnd = source.indexOf('\n\n  // Synchronous double-click guard', leverageStart);
const leverageCode = `${source.slice(leverageStart, leverageEnd)}\nglobalThis.handler = handleLeverageChange;`;
for (const dex of ['hibachi', 'decibel']) {
  test(`${dex}: actual leverage handler ignores invalid drafts before state/API side effects`, () => {
    const calls = [];
    const context = { dex, maxLev: 50, symbol: 'BTC', currentMarket: {}, positions: [], pacAgent: null,
      useCallback: fn => fn, levTimerRef: { current: null },
      clearTradeFeedback: () => calls.push('feedback'), setLeverage: v => calls.push(['state', v]),
      setLeverageApi: (...args) => calls.push(['api', ...args]),
      setTimeout: fn => { calls.push('timer'); fn(); return 1; }, clearTimeout() {},
    };
    vm.runInNewContext(leverageCode, context);
    for (const value of ['', ' ', 0, '0', -5, '-5', NaN, Infinity, 'invalid', undefined, null]) {
      context.handler(value);
      assert.equal(calls.length, 0, `Invalid draft ${String(value)} produced side effects`);
    }
    for (const [value, expected] of [['1', 1], ['2.5', 2.5], ['50', 50], ['500', 50]]) {
      calls.length = 0;
      context.handler(value);
      assert.ok(calls.some(call => call[0] === 'state' && call[1] === expected));
      assert.ok(calls.some(call => call[0] === 'api' && call[1] === 'BTC' && call[2] === expected));
    }
  });
}
