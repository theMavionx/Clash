import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {formatUnits} from 'viem';
import {LEVERUP_USDC, LEVERUP_LVUSD, LEVERUP_DIAMOND, LEVERUP_CHAIN_ID, LEVERUP_ERC20_ABI, maxLeverupApproval} from './src/lib/leverupV2.js';
const hook=readFileSync(new URL('./src/hooks/useLeverup.js',import.meta.url),'utf8');

test('actual backend account reader includes lvUSD and preserves atomic balance precision',async()=>{
  const source=readFileSync(new URL('../server-futures/leverup.js',import.meta.url),'utf8');
  const reads=[];
  const context=vm.createContext({LEVERUP_USDC,LEVERUP_LVUSD,LEVERUP_DIAMOND,LEVERUP_CHAIN_ID,ERC20_ABI:[],formatUnits,
    normalizeAddress:x=>x,publicClient:{readContract:async p=>{reads.push(p);return p.functionName==='allowance'?0n:p.address===LEVERUP_USDC?720000n:20000000000000000001n;}}});
  vm.runInContext(source.slice(source.indexOf('async function getAccountByAddress'),source.indexOf('\nfunction normalizePosition'))+'\nglobalThis.read=getAccountByAddress;',context);
  const result=await context.read(LEVERUP_USDC);
  assert.equal(result.wallet_usdc,0.72);
  assert.equal(result.wallet_lvusd_exact,'20.000000000000000001');
  assert.equal(result.free_collateral,20.72);
  assert.ok(reads.some(r=>r.address===LEVERUP_LVUSD));
});

test('actual account enrichment retains lvUSD after close without mislabelling wallet USDC',async()=>{
  let saved,wallet;
  const context=vm.createContext({useCallback:f=>f,walletAddr:LEVERUP_USDC,gameToken:'test',walletMismatch:false,
    pricesRef:{current:[]},num:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,normalizeSymbol:x=>x,normalizeLongSide:()=>true,
    fetchJson:async path=>path.includes('/account')?{wallet_usdc:0.72,wallet_lvusd:20}:[],
    setAccount:v=>saved=v,setWalletUsdc:v=>wallet=v,setPositions(){},setOrders(){}});
  const block=hook.slice(hook.indexOf('  const fetchAccount ='),hook.indexOf('  const verifyOneTap ='));
  vm.runInContext(block+'\nglobalThis.read=fetchAccount;',context);
  await context.read();
  assert.equal(saved.available_to_spend,20.72);
  assert.equal(saved.account_equity,20.72);
  assert.equal(wallet,0.72);
});

test('collateral approval uses selected token; rejection, insufficient balance and account changes cannot proceed',async()=>{
  let allowance=0n,balance=20n*10n**18n,status='success',stale=false,writes=0;
  const context=vm.createContext({useCallback:f=>f,LEVERUP_CHAIN_ID,LEVERUP_DIAMOND,LEVERUP_ERC20_ABI,maxLeverupApproval,
    collateralToken:LEVERUP_LVUSD,collateralSymbol:'lvUSD',walletAddr:LEVERUP_USDC,walletMismatch:false,
    captureCredentialOperation:()=>({}),assertCredentialOperation:()=>{if(stale)throw Error('Account changed');},
    ensureChain:async()=>{},setActivationStep(){},feeTokenStatesRef:{current:{}},
    getPublicClient:()=>({readContract:async p=>p.functionName==='balanceOf'?balance:allowance,waitForTransactionReceipt:async()=>({status})}),
    getWalletClient:()=>({writeContract:async p=>{writes++;assert.equal(p.address,LEVERUP_LVUSD);assert.equal(p.args[0],LEVERUP_DIAMOND);return 'test';}})});
  const block=hook.slice(hook.indexOf('  const ensureCollateralAllowance ='),hook.indexOf('  const placeMarketOrder ='));
  vm.runInContext(block+'\nglobalThis.approve=ensureCollateralAllowance;',context);
  await context.approve(10n*10n**18n);assert.equal(writes,1);
  allowance=maxLeverupApproval();await context.approve(10n*10n**18n);assert.equal(writes,1);
  balance=0n;await assert.rejects(context.approve(1n),/Insufficient lvUSD/);assert.equal(writes,1);
  balance=20n*10n**18n;allowance=0n;status='reverted';await assert.rejects(context.approve(1n),/approval failed/);
  stale=true;await assert.rejects(context.approve(1n),/Account changed/);assert.equal(writes,2);
});
