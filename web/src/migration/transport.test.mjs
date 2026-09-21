import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationApi, startMigrationPolling } from './transport.js';
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
