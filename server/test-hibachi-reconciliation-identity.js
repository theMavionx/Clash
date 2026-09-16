'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./trade_reconciliation'),'utf8');
test('server reconciliation passes trusted player name, never client supplied username',async()=>{
  let args;
  const run=vm.runInNewContext(source.slice(source.indexOf('async function runDexAdapter('),source.indexOf('async function reconcileTradesForPlayer('))+'\nrunDexAdapter',{
    USER_SCOPED_IMPORT_DEXES:new Set(['hibachi']),CREDENTIAL_SCOPED_IMPORT_DEXES:new Set(['hibachi']),
    adapterCredentials:()=>({accountId:7,apiKey:'fixture',privateKey:'fixture'}),
    require:name=>{assert.equal(name,'../server-futures/hibachi');return {importFillsForPlayer:async(...values)=>{args=values;return {ok:true};}};},
  });
  const result=await run({id:'trusted-id',name:'Server Trader'},'hibachi',null,{limit:5000,username:'spoofed',credentials:{username:'spoofed'}});
  assert.equal(result.ok,true);assert.equal(args[0],'trusted-id');
  assert.equal(args[2].username,'Server Trader');assert.equal(args[2].limit,5000);
});
