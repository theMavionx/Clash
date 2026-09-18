import test from 'node:test';
import assert from 'node:assert/strict';
import {readLeverupCollateral,saveLeverupCollateral} from './src/hooks/useLeverupCollateral.js';
test('explicit selection persists per normalized wallet; invalid values never become collateral',()=>{
 const items=new Map();globalThis.window={localStorage:{getItem:k=>items.get(k),setItem:(k,v)=>items.set(k,v)}};
 const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40);
 assert.equal(readLeverupCollateral(a),'USDC');assert.equal(items.size,0);
 assert.equal(saveLeverupCollateral(a,'lvUSD'),true);assert.equal(readLeverupCollateral(a.toUpperCase()),'lvUSD');
 assert.equal(readLeverupCollateral(b),'USDC');assert.equal(saveLeverupCollateral(a,'BTC'),false);
 assert.equal(saveLeverupCollateral(null,'lvUSD'),false);assert.equal(readLeverupCollateral(a),'lvUSD');
 assert.equal(saveLeverupCollateral(a,'USDC'),true);assert.equal(readLeverupCollateral(a),'USDC');
});
test('denied browser storage retains explicit choice in this session without throwing',()=>{
 const wallet='0x'+'c'.repeat(40);globalThis.window={get localStorage(){throw Error('Storage denied')}};
 assert.equal(readLeverupCollateral(wallet),'USDC');assert.equal(saveLeverupCollateral(wallet,'lvUSD'),true);
 assert.equal(readLeverupCollateral(wallet),'lvUSD');delete globalThis.window;
 assert.equal(readLeverupCollateral('0x'+'d'.repeat(40)),'USDC');
});
test('quota/write failure does not let an older stored choice overwrite the new session choice',()=>{
 const wallet='0x'+'e'.repeat(40);globalThis.window={localStorage:{getItem:()=> 'USDC',setItem:()=>{throw Error('Quota exceeded');}}};
 assert.equal(readLeverupCollateral(wallet),'USDC');saveLeverupCollateral(wallet,'lvUSD');
 assert.equal(readLeverupCollateral(wallet),'lvUSD');delete globalThis.window;
});
