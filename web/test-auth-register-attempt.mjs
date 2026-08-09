import assert from 'node:assert/strict';
import { createRegisterAttemptManager } from './src/auth/registerAttemptManager.js';

function fakeTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    fire(id) {
      const timer = timers.get(id);
      if (!timer) return false;
      timers.delete(id);
      timer.callback();
      return true;
    },
    first() {
      return timers.entries().next().value || null;
    },
    size() {
      return timers.size;
    },
  };
}

{
  const timers = fakeTimers();
  let timedOut = 0;
  const manager = createRegisterAttemptManager(timers);
  const attempt = manager.begin('avantis:0xabc', 25_000, () => { timedOut += 1; });

  // A React dependency rerender must reuse the in-flight attempt. The old
  // implementation cancelled its effect cleanup here, discarded the Android
  // wallet signature, and also removed the only timeout.
  assert.equal(manager.begin('avantis:0xabc', 25_000, () => {}), null);
  assert.equal(manager.isActive(attempt), true);
  assert.equal(timers.size(), 1);

  const [timerId] = timers.first();
  assert.equal(timers.fire(timerId), true);
  assert.equal(timedOut, 1);
  assert.equal(manager.currentKey(), null);
}

{
  const timers = fakeTimers();
  const manager = createRegisterAttemptManager(timers);
  const oldAttempt = manager.begin('avantis:0xold', 25_000, () => {});
  const newAttempt = manager.begin('avantis:0xnew', 25_000, () => {});

  assert.equal(manager.isActive(oldAttempt), false);
  assert.equal(manager.isActive(newAttempt), true);
  assert.equal(manager.currentKey(), 'avantis:0xnew');
  assert.equal(timers.size(), 1);
  assert.equal(manager.finish(newAttempt), true);
  assert.equal(timers.size(), 0);
}

console.log('auth register attempt lifecycle tests passed');
