import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationApi, startMigrationPolling } from './transport.js';
test('explicit WORKER_BUSY retries identical signed bytes or quote idempotency key only', async () => {
  for (const path of ['/submit', '/quote']) {
    const sent = [];
    const result = await migrationApi(path, 'token', { id: 'q', transaction: 'signed', idempotencyKey: 'same' }, {
      wait: async () => {}, fetchImpl: async (_url, options) => {
        sent.push(options.body);
        return sent.length < 3 ? { ok: false, status: 409, json: async () => ({ error: 'WORKER_BUSY' }) } :
          { ok: true, json: async () => ({ ok: true }) };
      },
    });
    assert.equal(result.ok, true); assert.equal(sent.length, 3); assert.equal(new Set(sent).size, 1);
  }
});
test('busy retries are bounded and unknown errors are never auto-replayed', async () => {
  for (const [code, status, count] of [['WORKER_BUSY',409,3], ['MIGRATION_UNAVAILABLE',503,1], ['QUOTE_EXPIRED',409,1]]) {
    let calls = 0;
    await assert.rejects(migrationApi('/submit', 'token', {}, { wait: async () => {}, fetchImpl: async () => {
      calls++; return { ok: false, status, json: async () => ({ error: code }) };
    }}));
    assert.equal(calls, count);
  }
});
test('timeout releases hung write with exactly one request, never an automatic second deposit', async () => {
  let calls=0;
  const fetchImpl=(_url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));};
  await assert.rejects(migrationApi('/submit','private-token',{id:'q1',transaction:'signed'},{fetchImpl,timeoutMs:5}));
  assert.equal(calls,1);
});
test('invalid JSON or scalar success must not become a successful migration', async () => {
  for(const data of [null,[],3]) await assert.rejects(migrationApi('/status',null,undefined,{fetchImpl:async()=>({ok:true,json:async()=>data})}));
  await assert.rejects(migrationApi('/status',null,undefined,{fetchImpl:async()=>({ok:true,json:async()=>{throw Error('html');}})}));
});
test('serial polling recovers after failure and never overlaps or reschedules after stop', async () => {
  const queue=[];let calls=0,errors=0,release;
  const stop=startMigrationPolling(()=>{calls++;if(calls===1)throw Error('offline');return new Promise(resolve=>{release=resolve;});},{onError:()=>errors++,schedule:fn=>{queue.push(fn);return 1;},cancel:()=>{queue.length=0;}});
  await Promise.resolve();assert.equal(errors,1);assert.equal(queue.length,1);
  const run=queue.shift()();await Promise.resolve();assert.equal(calls,2);assert.equal(queue.length,0);
  stop();release();await run;assert.equal(queue.length,0);
});
