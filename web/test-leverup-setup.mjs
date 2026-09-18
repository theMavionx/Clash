import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./src/hooks/useLeverup.js',import.meta.url),'utf8');
function fixture({saveFails=false,staleLatest=false,approvalReverts=false,rpcFails=false,missingStored=false,initialAllowance=0n,initialAuth=false,approvedAmount=9n}={}) {
 const writes=[],reads=[],events=[];let saved=missingStored?null:{address:'agent'},auth=initialAuth,allowance=initialAllowance,error;
 const client={readContract:async p=>{reads.push(p);if(rpcFails&&auth)throw Error('RPC unavailable');if(p.functionName==='getAgentByName')return 'zero';if(p.functionName==='getAgentAuth')return {agent:'agent',permissions:auth?1n:0n};return staleLatest&&p.blockNumber==null?0n:allowance;},
  waitForTransactionReceipt:async({hash})=>({status:approvalReverts&&hash==='approve'?'reverted':'success',blockNumber:hash==='approve'?102n:101n})};
 const c=vm.createContext({useCallback:f=>f,walletAddr:'wallet',walletMismatch:false,signerRef:{current:null},feeTokenStatesRef:{current:{}},logLeverupSetup:(...v)=>events.push(v),leverupFailureKind:()=> 'test',
 captureCredentialOperation:()=>({}),assertCredentialOperation:()=>{},setLoading(){},setActivationStep(){},setError:v=>error=v,setOneTapTrading(){},setSetupVerified(){},
 readLeverupAgent:()=>saved,createAndStoreLeverupAgent:async(w,o)=>{assert.equal(o.awaitPersistence,true);if(saveFails)throw Error('Storage unavailable');saved={address:'agent'};return saved;},
 getPublicClient:()=>client,getWalletClient:()=>({writeContract:async p=>{writes.push(p);if(p.functionName==='authorizeAgent')auth=true;if(p.functionName==='approve')allowance=approvedAmount;return p.functionName;}}),ensureChain:async()=>{},fetchAccount:async()=>{},
 isLeverupAgentAuthorized:a=>a.permissions===1n,maxLeverupApproval:()=>9n,LEVERUP_CHAIN_ID:143,LEVERUP_DIAMOND:'diamond',LEVERUP_USDC:'usdc',LEVERUP_AUTH_ABI:[],LEVERUP_ERC20_ABI:[],LEVERUP_AGENT_NAME:'name',LEVERUP_ZERO_ADDRESS:'zero',LEVERUP_CURRENT_PERMISSION_MASK:1n});
 vm.runInContext(source.slice(source.indexOf('  const verifyOneTap ='),source.indexOf('  const disableOneTap ='))+'\nglobalThis.activate=activate;',c);
 return {run:()=>c.activate(),reads,writes,events,get error(){return error;}};
}
test('post-approval verification reads receipt block, not lagging latest RPC state',async()=>{
 const f=fixture({staleLatest:true});assert.equal((await f.run()).success,true);
 assert.deepEqual(f.reads.slice(-2).map(p=>p.blockNumber),[102n,102n]);assert.equal(f.writes.length,2);
});
test('failed durable signer save stops before any onchain authorization',async()=>{
 const f=fixture({missingStored:true,saveFails:true});assert.match((await f.run()).error,/Storage unavailable/);assert.equal(f.writes.length,0);
});
test('reverted approval never enables trading',async()=>{
 const f=fixture({approvalReverts:true});assert.match((await f.run()).error,/USDC approval failed/);
});
test('RPC failure preserves actual failure rather than falsely blaming signer',async()=>{
 const f=fixture({rpcFails:true});assert.match((await f.run()).error,/RPC unavailable/);
});
test('actual signer adapter propagates durable write failure when setup awaits persistence',async()=>{
 const lib=readFileSync(new URL('./src/lib/leverupV2.js',import.meta.url),'utf8');
 const c=vm.createContext({window:{},captureCredentialScope:()=>({}),assertCredentialScope(){},generatePrivateKey:()=> 'test-only',privateKeyToAccount:()=>({address:'agent'}),leverupStorageKey:()=> 'test-key',writeEncryptedCredential:()=>Promise.reject(Error('Disk unavailable'))});
 vm.runInContext(lib.slice(lib.indexOf('export function createAndStoreLeverupAgent'),lib.indexOf('export function clearLeverupAgent')).replace('export function','function')+'\nglobalThis.create=createAndStoreLeverupAgent;',c);
 await assert.rejects(c.create('wallet',{awaitPersistence:true}),/Disk unavailable/);
});
test('finite existing USDC cap completes setup without forcing unlimited approval',async()=>{
 const f=fixture({initialAuth:true,initialAllowance:18193803n});assert.equal((await f.run()).success,true);assert.equal(f.writes.length,0);
 assert.ok(f.events.some(([event,data])=>event==='verification'&&data.allowance_ready===true));
});
test('wallet-adjusted finite approval succeeds, zero approval fails closed with diagnostics',async()=>{
 const finite=fixture({approvedAmount:2n});assert.equal((await finite.run()).success,true);
 const zero=fixture({approvedAmount:0n});assert.match((await zero.run()).error,/allowance is not confirmed/);
 assert.ok(zero.events.some(([event,,failed])=>event==='failed'&&failed));
});
test('diagnostic allowlist drops credentials, signatures and raw RPC errors',()=>{
 const text=readFileSync(new URL('./src/lib/leverupDiagnostics.js',import.meta.url),'utf8');const events=[];
 const c=vm.createContext({reportClientEvent:(...args)=>events.push(args)});
 vm.runInContext(text.replace(/^import .*;\r?\n/m,'').replaceAll('export function','function')+'\nglobalThis.log=logLeverupSetup;',c);
 c.log('failed',{attempt:'a',allowance_raw:18n,privateKey:'SECRET',signature:'SIGNATURE',token:'TOKEN',request:{secret:'SECRET'}},true);
 const output=JSON.stringify(events);assert.doesNotMatch(output,/SECRET|SIGNATURE|TOKEN/);assert.match(output,/allowance_raw/);assert.equal(events[0][2].immediate,true);
});
test('per-order check re-reads wallet-adjusted approval and rejects insufficient cap before submission',async()=>{
 for(const cap of [5n,10n]) {
  const c=vm.createContext({useCallback:f=>f,captureCredentialOperation:()=>({}),assertCredentialOperation(){},walletAddr:'wallet',walletMismatch:false,
   getPublicClient:()=>({readContract:async p=>p.functionName==='balanceOf'?100n:p.blockNumber?cap:0n,waitForTransactionReceipt:async()=>({status:'success',blockNumber:123n})}),
   getWalletClient:()=>({writeContract:async()=> 'hash'}),ensureChain:async()=>{},setActivationStep(){},logLeverupSetup(){},maxLeverupApproval:()=>99n,
   collateralToken:'token',collateralSymbol:'USDC',LEVERUP_CHAIN_ID:143,LEVERUP_ERC20_ABI:[],LEVERUP_DIAMOND:'diamond',feeTokenStatesRef:{current:{}}});
  vm.runInContext(source.slice(source.indexOf('  const ensureCollateralAllowance ='),source.indexOf('  const placeMarketOrder ='))+'\nglobalThis.ensure=ensureCollateralAllowance;',c);
  if(cap<10n)await assert.rejects(c.ensure(10n),/below the required/);else await c.ensure(10n);
 }
});
