'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMigrationGate } = require('./migration_gate');
test('FIFO hands off ownership without overlaps; background ticks do not accumulate', async () => {
  const events = [], gate = createMigrationGate({ record: e => events.push(e) });
  const first = await gate.acquire('tick');
  let acquired = false;
  const second = gate.acquire('submit').then(release => { acquired = true; return release; });
  assert.equal(await gate.acquire('tick', true), null);
  assert.equal(acquired, false);
  assert.equal(gate.pending, 1);
  first();
  const release = await second;
  first(); // A stale caller must not release the new holder.
  assert.equal(acquired, true);
  assert.equal(await gate.acquire('tick', true), null);
  release();
  (await gate.acquire('quote'))();
  assert.equal(events[0].event, 'operation_queued');
  assert.equal(events[1].event, 'operation_dequeued');
});
test('queue cap and timeout cannot run a cancelled waiter later', async () => {
  const gate = createMigrationGate({ maxPending: 1, waitMs: 5 });
  const release = await gate.acquire('tick');
  const waiting = gate.acquire('quote');
  await assert.rejects(gate.acquire('submit'), /WORKER_BUSY/);
  await assert.rejects(waiting, /WORKER_BUSY/);
  assert.equal(gate.pending, 0);
  release();
  (await gate.acquire('submit'))();
});
test('broken diagnostics do not change queue ownership', async () => {
  const gate = createMigrationGate({ record: () => { throw Error('logger failed'); } });
  const release = await gate.acquire('tick');
  const waiting = gate.acquire('quote');
  release();
  (await waiting)();
});
