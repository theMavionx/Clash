// Read-only Solana simulation. No signing or broadcast method is used.
// Wire layout and PDAs transcribed from Imperial's public PassthroughClient,
// chunks 16ow2xm6a2j2j.js (createOrderIx) and 0n.3fxycnnhg8.js.
const assert = require('node:assert/strict');
const imperial = require('./imperial');
const req = require;
const {Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram} = req('@solana/web3.js');
const {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,TOKEN_PROGRAM_ID} = req('@solana/spl-token');
async function main() {
  if (process.env.IMPERIAL_TPSL_SIMULATE !== '1') {
    console.log('Skipped: set IMPERIAL_TPSL_SIMULATE=1 for explicit read-only mainnet simulation.');
    return;
  }
  const c = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const owner = new PublicKey('4Ze3bbJbmBjAUutV3LT1XUmqZG67fAR5PUr7vkXUgU2g');
  const program = new PublicKey('pASsDHVUtgG5uomQ29SVMv1sQxon4Gi6g5bJV7KKqZ8');
  const settings = new PublicKey('5cRBwzfnwuBGm4EviXmC6WJGtTRbs2jJHUCLH5bpXZ6r');
  const mint = new PublicKey('So11111111111111111111111111111111111111112');
  const [user] = PublicKey.findProgramAddressSync([Buffer.from('user'),owner.toBuffer()],program);
  const [profile] = PublicKey.findProgramAddressSync([Buffer.from('profile'),owner.toBuffer(),Buffer.from([0])],program);
  const account = await c.getAccountInfo(user);
  const counter = account.data.subarray(40,48);
  const [order,bump] = PublicKey.findProgramAddressSync([Buffer.from('order'),profile.toBuffer(),counter],program);
  const orderAta = getAssociatedTokenAddressSync(mint,order,true);
  const profileAta = getAssociatedTokenAddressSync(mint,profile,true);
  const markets = await (await fetch('https://api.imperial.space/api/v1/phoenix/markets')).json();
  const market = markets.find(m=>m.symbol==='SOL');
  console.log({profile:profile.toBase58(),counter:counter.readBigUInt64LE().toString(),subaccountIndex:market.subaccountIndex});
  const payloads=[];
  const response = body => ({ok:true,status:200,text:async()=>JSON.stringify(body)});
  await imperial.setPositionTpsl({owner:owner.toBase58(),jwt:'unused-local-fixture',positionId:'fixture',body:{takeProfit:106.67,stopLoss:104.57},fetchImpl:async(url,options={})=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/mobile/builder/summary'))return response({active:true,feeBps:10});
    if(path.endsWith('/positions'))return response({dataList:[{id:'fixture',asset:'SOL',side:'long',underwriter:'phoenix',profileIndex:0,sizeUsd:'52.915'}]});
    if(path.endsWith('/preflight'))return response({ok:true});
    assert.ok(path.endsWith('/mobile/orders'));
    payloads.push(JSON.parse(options.body));
    return response({success:true,orderPda:`fixture-${payloads.length}`});
  }});
  assert.equal(payloads.length,2);
  const latest = await c.getLatestBlockhash();
  for (const payload of [{...payloads[0],orderType:5},...payloads]) {
    const type=payload.orderType;
    assert.equal(payload.builderCode,'CLASH'); // API attribution is preserved.
    const data = Buffer.alloc(73);
    data[0]=3; mint.toBuffer().copy(data,1);
    data[33]=payload.side;data[34]=type;data[35]=payload.action;data[36]=payload.triggerCondition;data[37]=bump;data[38]=payload.profileIndex;
    data.writeBigUInt64LE(BigInt(payload.sizeUsd),41);data.writeBigUInt64LE(BigInt(payload.collateralAmount),49);
    data.writeUInt16LE(payload.slippageBps,57);data[59]=payload.underwriter;data[60]=market.subaccountIndex;
    data.writeUInt16LE(payload.closeBps,61);data.writeBigUInt64LE(BigInt(payload.triggerPrice),65);
    const keys=[settings,user,order,orderAta,owner,profile,profileAta,mint,SystemProgram.programId,TOKEN_PROGRAM_ID].map((pubkey,i)=>({pubkey,isSigner:i===4,isWritable:i>=1&&i<=6}));
    const ix = new TransactionInstruction({programId:program,keys,data});
    const setup = createAssociatedTokenAccountIdempotentInstruction(owner,orderAta,order,mint);
    const tx = new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:latest.blockhash,instructions:[setup,ix]}).compileToV0Message());
    const result = await c.simulateTransaction(tx,{sigVerify:false,replaceRecentBlockhash:true});
    if(type===5){
      assert.equal(result.value.err?.InstructionError?.[1]?.Custom,25);
      assert.ok(result.value.logs.some(line=>line.includes('PrivateTpSl must have trigger_price = 0')));
    }else{
      assert.equal(type,2);
      assert.equal(result.value.err,null);
      assert.ok(result.value.logs.some(line=>line.includes('Order created')));
    }
    console.log(JSON.stringify({type,triggerCondition:payload.triggerCondition,slot:result.context.slot,error:result.value.err,programLogs:result.value.logs.filter(line=>line.startsWith('Program log:'))}));
  }
  assert.equal(await c.getAccountInfo(order),null,'Simulation must not create a real order');
  assert.equal((await c.getAccountInfo(user)).data.readBigUInt64LE(40),counter.readBigUInt64LE(),'Simulation must not advance the live order counter');
  console.log('PASS: legacy Custom25 reproduced; actual adapter TP and SL pass simulation; live order and counter unchanged. No signatures, broadcast, fees or live protection.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
