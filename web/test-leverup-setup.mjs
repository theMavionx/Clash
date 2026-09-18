import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./src/hooks/useLeverup.js',import.meta.url),'utf8');
function fixture({saveFails=false,staleLatest=false,approvalReverts=false,rpcFails=false,missingStored=false}={}) {
 const writes=[],reads=[];let saved=missingStored?null:{address:'agent'},auth=false,allowance=0n,error;
 const client={readContract:async p=>{reads.push(p);if(rpcFails&&auth)throw Error('RPC unavailable');if(p.functionName==='getAgentByName')return 'zero';if(p.functionName==='getAgentAuth')return {agent:'agent',permissions:auth?1n:0n};return staleLatest&&p.blockNumber==null?0n:allowance;},
  waitForTransactionReceipt:async({hash})=>({status:approvalReverts&&hash==='approve'?'reverted':'success',blockNumber:hash==='approve'?102n:101n})};
 const c=vm.createContext({useCallback:f=>f,walletAddr:'wallet',walletMismatch:false,signerRef:{current:null},feeTokenStatesRef:{current:{}},
 captureCredentialOperation:()=>({}),assertCredentialOperation:()=>{},setLoading(){},setActivationStep(){},setError:v=>error=v,setOneTapTrading(){},setSetupVerified(){},
 readLeverupAgent:()=>saved,createAndStoreLeverupAgent:async(w,o)=>{assert.equal(o.awaitPersistence,true);if(saveFails)throw Error('Storage unavailable');saved={address:'agent'};return saved;},
 getPublicClient:()=>client,getWalletClient:()=>({writeContract:async p=>{writes.push(p);if(p.functionName==='authorizeAgent')auth=true;if(p.functionName==='approve')allowance=9n;return p.functionName;}}),ensureChain:async()=>{},fetchAccount:async()=>{},
 isLeverupAgentAuthorized:a=>a.permissions===1n,maxLeverupApproval:()=>9n,LEVERUP_CHAIN_ID:143,LEVERUP_DIAMOND:'diamond',LEVERUP_USDC:'usdc',LEVERUP_AUTH_ABI:[],LEVERUP_ERC20_ABI:[],LEVERUP_AGENT_NAME:'name',LEVERUP_ZERO_ADDRESS:'zero',LEVERUP_CURRENT_PERMISSION_MASK:1n});
 vm.runInContext(source.slice(source.indexOf('  const verifyOneTap ='),source.indexOf('  const disableOneTap ='))+'\nglobalThis.activate=activate;',c);
 return {run:()=>c.activate(),reads,writes,get error(){return error;}};
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
