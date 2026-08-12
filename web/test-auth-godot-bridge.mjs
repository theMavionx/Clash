import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  dispatchGodotRegister,
  waitForGodotBridge,
} from './src/auth/godotRegisterBridge.js';

class FakeBridgeWindow extends EventTarget {
  constructor(bridge = null) {
    super();
    this.godotBridge = bridge;
  }

  ready(bridge = () => {}) {
    this.godotBridge = bridge;
    this.dispatchEvent(new Event('clash-godot-bridge-ready'));
  }
}

test('register dispatch waits for Godot without losing its payload', async () => {
  const bridgeWindow = new FakeBridgeWindow();
  const payload = { name: 'Captain', wallet: '0xabc' };
  const calls = [];
  const pending = dispatchGodotRegister({
    bridgeWindow,
    payload,
    timeoutMs: 250,
    pollIntervalMs: 5,
    sendToGodot(action, data) {
      calls.push({ action, data });
      return !!bridgeWindow.godotBridge;
    },
  });

  setTimeout(() => bridgeWindow.ready(), 10);
  assert.equal(await pending, true);
  assert.deepEqual(calls, [{ action: 'register', data: payload }]);
});

test('cancelled auth attempt never dispatches a stale registration', async () => {
  const bridgeWindow = new FakeBridgeWindow();
  let active = true;
  let calls = 0;
  const pending = dispatchGodotRegister({
    bridgeWindow,
    payload: { name: 'Old wallet' },
    timeoutMs: 250,
    pollIntervalMs: 5,
    isActive: () => active,
    sendToGodot() {
      calls += 1;
      return true;
    },
  });

  active = false;
  bridgeWindow.dispatchEvent(new Event('clash-godot-bridge-ready'));
  assert.equal(await pending, false);
  assert.equal(calls, 0);
});

test('bridge timeout is recoverable and does not demand a reload', async () => {
  const bridgeWindow = new FakeBridgeWindow();
  await assert.rejects(
    waitForGodotBridge({ bridgeWindow, timeoutMs: 15, pollIntervalMs: 2 }),
    /still loading\. Wait a moment and try again/u,
  );
});

test('auth flow only auto-registers while Godot shows registration', async () => {
  const source = await fs.readFile(new URL('./src/auth/useAuthFlow.js', import.meta.url), 'utf8');
  assert.match(source, /useEffect\(\(\) => \{\s*if \(!showRegister\) return;\s*\/\/ Gate on readyForRegister/u);
  assert.doesNotMatch(source, /Game bridge is not ready\. Reload the page and try again\./u);
});
