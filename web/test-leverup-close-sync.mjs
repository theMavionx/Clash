import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./src/hooks/useLeverup.js',import.meta.url),'utf8');
const original={symbol:'BTC',positionHash:'0xabc',qty:2,margin:10,entry_price:100,side:'long'};
function fixture(){
 let rows=[{...original}],calls=0,submit=async()=>({success:true}),stale=false;
 const c=vm.createContext({useCallback:f=>f,walletAddr:'wallet-a',gameToken:'test',walletMismatch:false,positions:rows,
   normalizeSymbol:s=>s,normalizeLongSide:s=>s==='long',num:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,
   closedPositionsRef:{current:new Set()},closingPositionsRef:{current:new Set()},brokerRef:{current:{active:true,brokerId:2}},pricesRef:{current:[]},
   OneClickAction:{MARKET_CLOSE:1,PARTIAL_CLOSE:9},rawQty:v=>BigInt(v)*10n**10n,
   captureCredentialOperation:()=>({}),assertCredentialOperation:()=>{if(stale)throw Error('Account changed');},
   setLoading(){},setError(){},setAccount(){},setWalletUsdc(){},setOrders(){},
   setPositions:v=>{rows=typeof v==='function'?v(rows):v;},
   fetchJson:async path=>path.includes('/positions')?[{...original}]:path.includes('/orders')?[]:{wallet_usdc:1,wallet_lvusd:20},
   submitAction:async(...args)=>{calls++;return submit(...args);}});
 vm.runInContext(source.slice(source.indexOf('function positionKey('),source.indexOf('function validateLeverupOrderRisk'))+
   source.slice(source.indexOf('  const fetchAccount ='),source.indexOf('  const verifyOneTap ='))+
   source.slice(source.indexOf('  const closePosition ='),source.indexOf('  const cancelOrder ='))+
   '\nglobalThis.close=closePosition;globalThis.refresh=fetchAccount;',c);
 return {c,get rows(){return rows},get calls(){return calls},setSubmit:f=>submit=f,setStale:()=>stale=true};
}
test('confirmed full close disappears and stale snapshots / old row callbacks cannot resurrect or reclose it',async()=>{
 const f=fixture();assert.equal((await f.c.close(original)).success,true);
 await f.c.refresh();assert.equal(f.rows.length,0);
 assert.match((await f.c.close(original)).error,/already closed/);assert.equal(f.calls,1);
});
test('double click is blocked synchronously while the first close is pending',async()=>{
 const f=fixture();let resolve;f.setSubmit(()=>new Promise(r=>resolve=r));const first=f.c.close(original);
 assert.match((await f.c.close(original)).error,/already being closed/);assert.equal(f.calls,1);
 assert.equal(f.rows.length,1);resolve({success:true});await first;assert.equal(f.rows.length,0);
});
test('failed close preserves position and allows deliberate retry',async()=>{
 const f=fixture();f.setSubmit(async()=>{throw Error('execution rejected');});
 assert.match((await f.c.close(original)).error,/execution rejected/);assert.equal(f.rows.length,1);
 assert.equal(f.c.closedPositionsRef.current.size,0);assert.equal(f.c.closingPositionsRef.current.size,0);
 f.setSubmit(async()=>({success:true}));assert.equal((await f.c.close(original)).success,true);assert.equal(f.calls,2);
});
test('partial close keeps the position, and failed refresh does not convert success into failure',async()=>{
 const f=fixture();f.c.fetchJson=async()=>{throw Error('RPC down');};
 assert.equal((await f.c.close(original,null,1)).success,true);assert.equal(f.rows.length,1);assert.equal(f.c.closedPositionsRef.current.size,0);
 assert.equal((await f.c.close(original)).success,true);assert.equal(f.rows.length,0);
});
test('a response started before confirmation cannot bring a closed row back',async()=>{
 const f=fixture();let release;const originalFetch=f.c.fetchJson;let first=true;
 f.c.fetchJson=async path=>{if(first&&path.includes('/positions')){first=false;await new Promise(r=>release=r);}return originalFetch(path);};
 const oldRead=f.c.refresh();await f.c.close(original);release();await oldRead;assert.equal(f.rows.length,0);
});
test('tombstones are wallet-scoped and account changes reject late snapshots',async()=>{
 const f=fixture();f.c.closedPositionsRef.current.add('wallet-b:0xabc:0');await f.c.refresh();assert.equal(f.rows.length,1);
 f.setStale();await assert.rejects(f.c.refresh(),/Account changed/);assert.equal(f.rows.length,1);
});
test('a new position with the same hash and a later open timestamp is not hidden',async()=>{
 const f=fixture();await f.c.close(original);
 const read=f.c.fetchJson;f.c.fetchJson=async path=>path.includes('/positions')?[{...original,timestamp:1000}]:read(path);
 await f.c.refresh();assert.equal(f.rows.length,1);assert.equal(f.rows[0].timestamp,1000);
});
