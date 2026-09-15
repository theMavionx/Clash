import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Execute the actual logger recovery functions with the actual update coordinator.
// Only telemetry and browser navigation/storage are substituted; no external requests.
const logger = readFileSync(new URL('./src/lib/clientLogger.js', import.meta.url), 'utf8');
const coordinator = readFileSync(new URL('./src/lib/updateCoordinator.js', import.meta.url), 'utf8');
const recovery = logger.slice(logger.indexOf('function extractChunkUrl('), logger.indexOf('const SW_VERSION_STORAGE_KEY'));
const pattern = logger.match(/^const CHUNK_ERROR_RE = .*;$/m)?.[0];
assert.ok(pattern && recovery);
function fixture() {
  const timers = [], navigations = [], events = [];
  const storage = () => {
    const data = new Map();
    return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  };
  const context = vm.createContext({
    URL, Promise,
    sessionStorage: storage(), localStorage: storage(),
    CustomEvent: class { constructor(type, args) { this.type = type; this.detail = args.detail; } },
    window: {
      location: { href: 'https://fixture.test/', replace: url => navigations.push(url), reload: () => navigations.push('reload') },
      dispatchEvent() {}, setTimeout: fn => timers.push(fn),
    },
    addBreadcrumbInternal() {}, enqueue: event => events.push(event),
    makeEvent: (_level, _args, _source, _stack, extra) => extra,
  });
  vm.runInContext(`${coordinator}\n${pattern}\n${recovery}`.replace(/export function /g, 'function '), context);
  return { context, timers, navigations, events };
}

test('production CSS preload error schedules one boot recovery and records the CSS URL', async () => {
  const f = fixture();
  const error = new Error('Unable to preload CSS for /assets/GameUI-BUuIXdIE.css');
  assert.equal(f.context.isLazyChunkError(error), true);
  const load = f.context.lazyWithClientReload(() => Promise.reject(error), 'GameUI');
  await assert.rejects(load(), /Unable to preload CSS/);
  assert.equal(f.timers.length, 1);
  assert.equal(f.events[0].payload.lazy_chunk.chunk_url, '/assets/GameUI-BUuIXdIE.css');
  f.context.reportLazyChunkError(error, { chunk_name: 'GameUI' });
  assert.equal(f.timers.length, 1, 'repeated boundary reporting must not loop reloads');
  f.timers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.navigations.length, 1);
  assert.match(f.navigations[0], /_clash_update=/);
});

test('CSS errors do not reload during critical activity or after interactive boot', () => {
  for (const state of ['critical', 'busy', 'interactive']) {
    const f = fixture();
    if (state === 'interactive') f.context.markClientInteractive();
    else f.context.setClientActivity(state === 'critical' ? { critical_action: true } : { futures_busy: true });
    f.context.reportLazyChunkError(new Error('Unable to preload CSS for /assets/GameUI.css'));
    assert.equal(f.timers.length, 0);
    assert.equal(f.navigations.length, 0);
    assert.ok(f.context.getPendingClientUpdate(), 'manual/deferred recovery remains available');
  }
});

test('activity becoming critical before scheduled recovery also prevents navigation', async () => {
  const f = fixture();
  f.context.reportLazyChunkError(new Error('Unable to preload CSS for /assets/GameUI.css'));
  f.context.setClientActivity({ critical_action: true });
  f.timers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.navigations.length, 0);
});

test('JavaScript recovery is preserved and ordinary errors do not request reloads', () => {
  const f = fixture();
  for (const message of ['Failed to fetch dynamically imported module: https://fixture.test/assets/App.js', 'Importing a module script failed.', 'ChunkLoadError']) {
    assert.equal(f.context.isLazyChunkError(new Error(message)), true);
  }
  assert.equal(f.context.extractChunkUrl(new Error('Unable to preload CSS for https://fixture.test/assets/App.css?v=1')), 'https://fixture.test/assets/App.css?v=1');
  assert.equal(f.context.extractChunkUrl(new Error('Failed to fetch dynamically imported module: /assets/App.js?v=1')), '/assets/App.js?v=1');
  for (const message of ['User has rejected the request', 'LeverUp request timed out', 'Failed to fetch', 'CSS syntax error']) {
    assert.equal(f.context.isLazyChunkError(new Error(message)), false);
    f.context.reportLazyChunkError(new Error(message));
  }
  assert.equal(f.timers.length, 0);
  assert.equal(f.context.getPendingClientUpdate(), null);
});
