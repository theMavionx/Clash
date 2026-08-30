import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('./src/components/GodotCanvas.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
function failureCallback(type) {
  const marker = source.indexOf("addClientBreadcrumb('" + type + "'");
  const start = source.lastIndexOf('.catch(err => {', marker) + '.catch('.length;
  const end = source.indexOf('\n      });', marker);
  assert.ok(marker > 0 && start > 0 && end > marker);
  return source.slice(start, end) + '\n}';
}
function failedStartup(type, overrides = {}) {
  const state = { messages: [], reports: [], restored: 0 };
  const context = {
    disposed: false,
    recoverOnceFromGodotCacheMismatch: () => false,
    restoreGodotFetch: () => { state.restored++; },
    addClientBreadcrumb: () => {},
    reportGodotLoaderIssue: name => state.reports.push(name),
    setLoadingError: message => state.messages.push(message),
    lastProgressRef: { current: { value: 49 } },
    stageStateRef: { current: 1 }, isLoadedStateRef: { current: false },
    console: { error: () => {} },
    ...overrides,
  };
  vm.runInNewContext('(' + failureCallback(type) + ')', context)(new Error('network error'));
  return state;
}

for (const type of ['godot.start_error', 'godot.script_load_error']) {
  test(type + ': actual rejection handler restores fetch, logs and exposes recovery', () => {
    const state = failedStartup(type);
    assert.equal(state.restored, 1);
    assert.deepEqual(state.reports, [type]);
    assert.equal(state.messages.length, 1);
    assert.match(state.messages[0], /connection.*try again/i);
    assert.doesNotMatch(state.messages[0], /stack|network error/);
  });
  test(type + ': unmounted and cache-reload paths do not flash a stale error', () => {
    assert.equal(failedStartup(type, { disposed: true }).messages.length, 0);
    assert.equal(failedStartup(type, { recoverOnceFromGodotCacheMismatch: () => true }).messages.length, 0);
  });
}

const { code } = await transformWithOxc(source.slice(source.indexOf('const overlayStyle ='))
  .replace('export default memo(GodotCanvas);', ''), 'godot-canvas.jsx', { jsx: { runtime: 'classic' } });
function render({ error = '', loaded = false, webglReloading = false } = {}) {
  let stateIndex = 0;
  let reloads = 0;
  const states = [1, 49, loaded, false, webglReloading, error, false, 'Loading'];
  const component = vm.runInNewContext(code + '\nGodotCanvas;', {
    React, useState: () => [states[stateIndex++], () => {}],
    useEffect: () => {}, useRef: value => ({ current: value }),
    DEFAULT_LOADING_DETAIL: 'Loading',
    splashBg: '/splash-bg.png', splashLogo: '/splash-logo.png', canvasStyle: {},
    window: { location: { reload: () => { reloads++; } } },
  });
  const tree = component({});
  return { tree, markup: renderToStaticMarkup(tree), reloads: () => reloads };
}
function descendants(node) {
  return React.isValidElement(node)
    ? [node, ...React.Children.toArray(node.props.children).flatMap(descendants)] : [];
}

function scriptHarness() {
  const start = source.indexOf('function loadGodotEngineScript()');
  const end = source.indexOf('\nfunction ', start + 1);
  const scripts = [];
  const context = {
    window: {}, GODOT_FILES: '/godot', CACHE_BUST: '?v=fixture',
    reportGodotAssetError: () => {},
    document: {
      querySelector: () => scripts.find(script => !script.removed) || null,
      createElement: () => ({ dataset: {}, remove() { this.removed = true; } }),
      body: { appendChild: script => scripts.push(script) },
    },
  };
  const load = vm.runInNewContext(source.slice(start, end) + '\nloadGodotEngineScript;', context);
  return { load, scripts, context };
}

test('script retry appends a fresh DOM element and succeeds after first network failure', async () => {
  const { load, scripts } = scriptHarness();
  const promise = load();
  assert.equal(load(), promise, 'Concurrent callers share the same load');
  scripts[0].onerror();
  assert.equal(scripts.length, 2);
  assert.notEqual(scripts[0], scripts[1]);
  assert.equal(scripts[0].removed, true);
  assert.match(scripts[1].src, /retry=/);
  scripts[1].onload();
  await promise;
});

test('second script failure rejects and clears stale DOM/promise for a later retry', async () => {
  const { load, scripts, context } = scriptHarness();
  const promise = load();
  const rejected = assert.rejects(promise, /Work.js failed to load/);
  scripts[0].onerror();
  scripts[1].onerror();
  await rejected;
  assert.equal(scripts.length, 2, 'Only one automatic retry');
  assert.ok(scripts.every(script => script.removed));
  assert.equal(context.window.__clashGodotScriptPromise, null);
  const next = load();
  assert.equal(scripts.length, 3);
  scripts[2].onload();
  await next;
});

test('startup failure renders a readable alert and a real retry button, not false progress', () => {
  const view = render({ error: failedStartup('godot.start_error').messages[0] });
  assert.match(view.markup, /role="alert"/);
  assert.match(view.markup, /UNABLE TO LOAD GAME/);
  assert.doesNotMatch(view.markup, /49%/);
  const button = descendants(view.tree).find(node => node.type === 'button');
  assert.equal(button.props.children, 'Retry loading game');
  assert.ok(button.props.style.minHeight >= 44);
  button.props.onClick();
  assert.equal(view.reloads(), 1);
});

test('normal loading and successful startup retain their previous UI', () => {
  const loading = render();
  assert.match(loading.markup, /49%/);
  assert.doesNotMatch(loading.markup, /role="alert"|Retry loading game/);
  const ready = render({ loaded: true });
  assert.doesNotMatch(ready.markup, /data-clash-godot-loading/);
  assert.match(ready.markup, /visibility:visible/);
});

test('repeated WebGL failure remains manually recoverable after automatic reload cooldown', () => {
  const view = render({ loaded: true, webglReloading: true, error: 'Graphics stopped again. Close other tabs and retry loading the game.' });
  assert.match(view.markup, /Retry loading game/);
  assert.match(view.markup, /visibility:hidden/);
  assert.doesNotMatch(view.markup, /Restoring graphics|Reloading after WebGL/);
  const start = source.indexOf('if (!shouldReload) {');
  const end = source.indexOf('\n      window.setTimeout', start);
  const messages = [];
  vm.runInNewContext('(function () {' + source.slice(start, end) + '})()', {
    shouldReload: false, reportClientEvent: () => {}, payload: {},
    setLoadingError: message => messages.push(message),
  });
  assert.match(messages[0], /Graphics stopped again/);
});
