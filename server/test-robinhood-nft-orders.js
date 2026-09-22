'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DB = require('better-sqlite3');
const { createNftOrders } = require('./robinhood_nft_orders');
const { TOKEN } = require('./robinhood_shop');
const buyer='0x'+'11'.repeat(20), treasury='0x'+'22'.repeat(20), recipient='SolanaRecipient';
const tx='0x'+'aa'.repeat(32), transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic=a=>'0x'+a.slice(2).padStart(64,'0');
function fixture() {
  const db=new DB(':memory:');
  const state={now:1000,head:113,final:90,logs:[],receipt:null,reserved:0,released:0,completed:0,deliveries:0,finalReads:0,failFinal:false,failDelivery:false};
  const block=n=>({number:'0x'+n.toString(16),hash:'block'+n,timestamp:'0x'+(1000+(n-100)*10).toString(16)});
  const deps={db,now:()=>state.now,prepare:async()=>({treasury,amount:'10000000000000000000000'}),
    reserve:()=>{state.reserved++;return 'reservation-'+state.reserved;},release:()=>state.released++,complete:()=>state.completed++,
    rpc:async(method,params)=>{
      if(method==='eth_chainId')return '0x1237';
      if(method==='eth_blockNumber')return '0x64';
      if(method==='eth_getLogs')return state.logs;
      if(method==='eth_getTransactionReceipt')return state.receipt;
      if(method==='eth_getBlockByNumber'){
        if(params[0]==='finalized'){state.finalReads++;if(state.failFinal)throw Error('finalized RPC down');return block(state.final);}
        return block(params[0]==='latest'?state.head:Number(params[0]));
      }
      throw Error('Unexpected RPC '+method);
    },deliver:async(row,persist)=>{
      state.deliveries++;
      if(!row.signed_tx){persist({asset:'asset-'+row.id,signature:'sig-'+row.id,raw:'signed',lastValidBlockHeight:500});if(state.failDelivery)throw Error('send response lost');return {confirmed:false};}
      return {confirmed:true,asset:row.asset,signature:row.delivery_tx};
    }};
  const service=createNftOrders(deps);
  function pay(order){state.logs=[{address:TOKEN,topics:[transfer,topic(buyer),topic(treasury)],data:'0x'+BigInt(order.amount).toString(16),transactionHash:tx,blockHash:'block101'}];state.receipt={status:'0x1',from:buyer,blockNumber:'0x65',blockHash:'block101'};}
  return {state,db,deps,service,pay};
}
test('canonical included payment delivers once without finalized RPC and survives restart/send timeout',async()=>{
  const f=fixture();const o=await f.service.quote('player',buyer,recipient);f.pay(o);f.state.failDelivery=true;f.state.failFinal=true;
  await f.service.process(o.id);assert.equal(f.service.get(o.id).state,'delivering');assert.ok(f.service.get(o.id).signed_tx);
  const restart=createNftOrders(f.deps);await restart.process(o.id);await restart.process(o.id);
  assert.equal(restart.get(o.id).state,'delivered');assert.equal(f.state.completed,1);assert.equal(f.state.finalReads,0);assert.equal(f.state.reserved,1);
});
test('same player quote reuses order and preserves pinned recipient',async()=>{
  const f=fixture();const a=await f.service.quote('p',buyer,recipient);const b=await f.service.quote('p',buyer,'other');
  assert.equal(a.id,b.id);assert.equal(b.recipient,recipient);assert.equal(f.state.reserved,1);
});
test('wrong sender, token, amount, failed receipt and orphan cannot mint',async()=>{
  for(const mutate of [f=>f.state.receipt.from=treasury,f=>f.state.logs[0].address=treasury,
    f=>f.state.logs[0].data='0x1',f=>f.state.receipt.status='0x0',f=>f.state.receipt.blockHash='orphan']){
    const f=fixture();const o=await f.service.quote('p',buyer,recipient);f.pay(o);mutate(f);await f.service.process(o.id);
    assert.equal(f.state.deliveries,0);assert.equal(f.state.released,0);
  }
});
test('included but shallow payment is pinned, not offered again, then advances',async()=>{
  const f=fixture();const o=await f.service.quote('p',buyer,recipient);f.pay(o);f.state.head=102;
  await f.service.process(o.id);assert.equal(f.service.get(o.id).state,'confirming');assert.equal(f.state.deliveries,0);
  f.state.head=113;await f.service.process(o.id);assert.equal(f.service.get(o.id).state,'delivering');
});
test('only complete finalized no-payment proof releases reservation',async()=>{
  const f=fixture();const o=await f.service.quote('p',buyer,recipient);f.state.now=3000;f.state.head=250;f.state.final=250;f.state.failFinal=true;
  await f.service.process(o.id);assert.equal(f.state.released,0);assert.equal(f.service.get(o.id).state,'awaiting_payment');
  f.state.failFinal=false;await f.service.process(o.id);assert.equal(f.state.released,1);assert.equal(f.service.get(o.id).state,'expired');
});
test('worker lease prevents duplicate concurrent delivery',async()=>{
  const f=fixture();const o=await f.service.quote('p',buyer,recipient);f.pay(o);
  await Promise.all([f.service.process(o.id),f.service.process(o.id)]);assert.equal(f.state.deliveries,1);
});
test('stale worker cannot complete or clear the next workers lease',async()=>{
  const f=fixture();const o=await f.service.quote('p',buyer,recipient);f.pay(o);
  let finish, entered;
  const started=new Promise(resolve=>entered=resolve);
  f.deps.deliver=async()=>{entered();return new Promise(resolve=>finish=resolve);};
  const service=createNftOrders(f.deps);
  const first=service.process(o.id);await started;
  f.db.prepare('UPDATE robinhood_nft_orders SET lease_token=?,lease_until=? WHERE id=?').run('next-worker',9999,o.id);
  finish({confirmed:true,asset:'asset',signature:'signature'});await first;
  assert.equal(f.state.completed,0);assert.equal(service.get(o.id).lease_token,'next-worker');
  assert.equal(service.get(o.id).lease_until,9999);
});
test('another player cannot reserve the same pending wallet',async()=>{
  const f=fixture();await f.service.quote('p',buyer,recipient);
  await assert.rejects(f.service.quote('other-player',buyer,recipient),/already has/);
  assert.equal(f.state.reserved,1);
});
