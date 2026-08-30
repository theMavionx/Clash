import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('./src/components/TradingViewWidget.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const { code } = await transformWithOxc(source.replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export default memo(TradingViewWidget);', ''), 'chart.jsx', { jsx: { runtime: 'classic' } });
const bars = [{ time: 1788122700, open: 0.00365, high: 0.00368, low: 0.00364, close: 0.00367 }];
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(fetchImpl = async () => new Response(JSON.stringify(bars))) {
  const states = [], refs = [], effects = [], pending = [], calls = [], writes = [], options = [];
  const intervals = new Map(), timeouts = new Map();
  let stateIndex, refIndex, effectIndex, timerId = 0, tree;
  const series = {
    setData: data => writes.push(JSON.parse(JSON.stringify(data))),
    applyOptions: value => options.push(value),
    createPriceLine: () => ({}), removePriceLine: () => {},
  };
  const chart = { addSeries: () => series, applyOptions: () => {}, remove: () => {},
    timeScale: () => ({ fitContent: () => {} }), priceScale: () => ({ applyOptions: () => {} }) };
  const context = {
    React, console, URLSearchParams, AbortController,
    FUTURES_THEME_DARK: 'dark', useFuturesTheme: () => ({ theme: 'dark' }),
    createChart: () => chart, CandlestickSeries: {}, LineSeries: {},
    ResizeObserver: class { observe() {} disconnect() {} },
    useState: initial => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useRef: initial => refs[refIndex++] ||= { current: initial },
    useEffect: (callback, deps) => {
      const index = effectIndex++;
      if (!effects[index] || deps.some((dep, i) => dep !== effects[index].deps[i])) {
        effects[index]?.cleanup?.();
        effects[index] = { deps };
        pending.push(() => { effects[index].cleanup = callback(); });
      }
    },
    fetch: (url, opts) => { calls.push({ url, opts }); return fetchImpl(url, opts); },
    window: {
      setInterval: callback => { intervals.set(++timerId, callback); return timerId; },
      clearInterval: id => intervals.delete(id),
      setTimeout: callback => { timeouts.set(++timerId, callback); return timerId; },
      clearTimeout: id => timeouts.delete(id),
    },
  };
  const Component = vm.runInNewContext(code + '\nTradingViewWidget;', context);
  let props = { symbol: 'KPEPE', dex: 'nado', currentPrice: 0.00367, priceIncrement: '0.000001', positions: [], orders: [] };
  function render(next = {}) {
    props = { ...props, ...next };
    stateIndex = refIndex = effectIndex = 0;
    tree = Component(props);
    refs[0].current = { clientWidth: 800, clientHeight: 500 };
    pending.splice(0).forEach(effect => effect());
    return tree;
  }
  return { render, calls, writes, options, intervals, timeouts,
    markup: () => renderToStaticMarkup(render()),
    unmount: () => effects.forEach(effect => effect.cleanup?.()),
  };
}
function descendants(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(descendants)] : [];
}

test('Nado uses only same-origin native candles and six-decimal KPEPE price format', async () => {
  const h = harness();
  h.render();
  await flush();
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /^\/api\/futures\/candles\?dex=nado&symbol=KPEPE&interval=5m&/);
  assert.ok(h.calls[0].opts.signal instanceof AbortSignal);
  assert.deepEqual(h.writes.at(-1), bars);
  assert.equal(h.options.at(-1).priceFormat.precision, 6);
  assert.equal(h.options.at(-1).priceFormat.minMove, 0.000001);
  h.unmount();
});

for (const [name, reply, message] of [
  ['network error', () => { throw new Error('CORS/fetch failed'); }, /temporarily unavailable/],
  ['server error', () => new Response('unavailable', { status: 502 }), /temporarily unavailable/],
  ['empty history', () => new Response('[]'), /No Nado trading history/],
]) test(name + ' is visible, has retry and never fabricates flat history/Pyth requests', async () => {
  const h = harness(async () => reply());
  h.render();
  await flush();
  assert.match(h.markup(), message);
  assert.match(h.markup(), /Retry chart/);
  assert.ok(h.writes.every(rows => rows.length === 0));
  assert.equal(h.calls.length, 1);
  h.unmount();
});

test('actual retry button recovers and removes the error', async () => {
  let count = 0;
  const h = harness(async () => ++count === 1 ? new Response('{}', { status: 502 }) : new Response(JSON.stringify(bars)));
  h.render();
  await flush();
  const retry = descendants(h.render()).find(node => node.type === 'button' && node.props.children === 'Retry chart');
  assert.ok(retry);
  retry.props.onClick();
  h.render();
  await flush();
  assert.deepEqual(h.writes.at(-1), bars);
  assert.doesNotMatch(h.markup(), /Retry chart|temporarily unavailable/);
  h.unmount();
});

test('switching token aborts old request; late response cannot paint the new market', async () => {
  let resolveOld;
  const h = harness(async (url) => url.includes('symbol=KPEPE')
    ? new Promise(resolve => { resolveOld = resolve; })
    : new Response(JSON.stringify([{ ...bars[0], close: 78000, high: 78001, low: 77999, open: 78000 }])));
  h.render();
  h.render({ symbol: 'BTC', currentPrice: 78000, priceIncrement: '1' });
  assert.equal(h.calls[0].opts.signal.aborted, true);
  await flush();
  assert.equal(h.options.at(-1).priceFormat.precision, 0);
  resolveOld(new Response(JSON.stringify(bars)));
  await flush();
  assert.equal(h.writes.at(-1)[0].close, 78000);
  h.unmount();
});

test('same-market refresh failure retains valid history, timeframe change clears it', async () => {
  let count = 0;
  const h = harness(async () => ++count === 1 ? new Response(JSON.stringify(bars)) : new Response('{}', { status: 502 }));
  h.render();
  await flush();
  for (const refresh of h.intervals.values()) refresh();
  await flush();
  assert.deepEqual(h.writes.at(-1), bars);
  const timeframe = descendants(h.render()).find(node => node.type === 'button' && node.props.children === '1H');
  timeframe.props.onClick();
  h.render();
  await flush();
  assert.deepEqual(h.writes.at(-1), []);
  assert.match(h.calls.at(-1).url, /interval=1h/);
  h.unmount();
});

test('Nado request timeout aborts and unmount clears all polling/timers', async () => {
  const h = harness(() => new Promise(() => {}));
  h.render();
  for (const timeout of h.timeouts.values()) timeout();
  assert.equal(h.calls[0].opts.signal.aborted, true);
  h.unmount();
  assert.equal(h.timeouts.size, 0);
  assert.equal(h.intervals.size, 0);
});

test('all three panel layouts supply authoritative market price increment', () => {
  const panel = readFileSync(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
  const instances = panel.match(/<TradingViewWidget[^>]+\/>/g);
  assert.equal(instances.length, 3);
  assert.ok(instances.every(instance => instance.includes('priceIncrement={currentMarket?.tick_size}')));
});
