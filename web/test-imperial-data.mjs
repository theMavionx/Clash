import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {imperialPosition,imperialLivePosition,imperialMarketUpdate,imperialCloseBps,imperialTradeRows,imperialFundingRows} from './src/lib/imperialData.js';
import {openImperialStream} from './src/lib/imperialStream.js';
const raw={id:'fixture',asset:'BTC',side:'long',profileIndex:0,underwriter:'jupiter',sizeUsd:'70',sizeTokenAmount:'0.00087763',collateralUsd:'3.434131',leverageX:'20.383613787592846',pnlUsd:'-0.1157',pnlPercent:'-3.3528',markPrice:'79744',entryPrice:'79760.284249',liquidationPrice:'76062.84'};

test('reported Phoenix leveraged position uses live venue price and cash capital, not stale API PnL',()=>{
 const position=imperialPosition({...raw,underwriter:'phoenix',sizeUsd:'846.0401',sizeTokenAmount:null,
  entryPrice:'79815.103773',markPrice:'79815.103773',collateralUsd:'4.135005',ownedCollateralUsd:'4.43556',borrowedCollateralUsd:'18.057119',
  maxSizeUsd:'846.0401',feesOwed:'0.318039595',totalFeesUsd:'0.304995',effectiveLeverageX:'190.74',pnlUsd:'-0.623034595',pnlPercent:'-14.046357055253452',
  actions:[{actionType:'increase',sizeDelta:'846.0401',collateralDeposited:'4.44',platformFee:'.00444',jupiterFee:'.296115'}]});
 const quotes=[{symbol:'BTC',price:1,venues:[{venue:'jupiter',price:1,fetchedAtUnixMs:100000},{venue:'phoenix',price:79820,fetchedAtUnixMs:100000}]}];
 const live=imperialLivePosition(position,quotes,100000);
 assert.equal(live.mark_price,79820);assert.equal(live.unrealized_pnl.toFixed(2),'-0.27');assert.equal(live.pnl_pct.toFixed(2),'-6.44');
 assert.equal(live.leverage,190.74);assert.equal(live.amount,position.amount);assert.equal(live.pnl_includes_fees,true);
 assert.equal(imperialLivePosition(position,quotes,160001),position,'stale quotes must not recompute');
 assert.equal(imperialLivePosition(position,[],100000),position);
 assert.equal(imperialPosition({...raw,sizeTokenAmount:null,sizeUsd:100,entryPrice:100,markPrice:200}).amount,1);
 const reduced=imperialLivePosition({...position,side:'ask'},quotes,100000);
 assert.ok(reduced.unrealized_pnl < live.unrealized_pnl);
});

test('Imperial native tp/sl aliases are displayed',()=>{
 const p=imperialPosition({...raw,tpslOrders:[{orderType:'tp',triggerPriceUsd:'81000'},{orderType:'sl',triggerPriceUsd:'79000'}]});
 assert.equal(p.take_profit,81000);assert.equal(p.stop_loss,79000);
});

test('reported 80012 venue versus 79982.02 index explains the PnL gap without changing fees',()=>{
 const position=imperialPosition({...raw,underwriter:'phoenix',sizeUsd:'846.0401',sizeTokenAmount:null,
  entryPrice:'79815.103773',collateralUsd:'4.135005',ownedCollateralUsd:'4.43556',borrowedCollateralUsd:'18.057119',
  maxSizeUsd:'846.0401',feesOwed:'.37',effectiveLeverageX:'190.74',
  actions:[{actionType:'increase',sizeDelta:'846.0401',collateralDeposited:'4.44',platformFee:'.00444',jupiterFee:'.296115'}]});
 // Exact historical fee at screenshot time is unavailable. Hold it fixed:
 // the difference between these two outputs depends only on the quote.
 const now=100000;
 const market={symbol:'BTC',oracle:79982.02,oracle_at:now,
  venues:[{venue:'phoenix',price:79655,fetchedAtUnixMs:1}]};
 const estimate=imperialLivePosition(position,[market],now);
 assert.equal(estimate.live_mark_basis,'index');
 assert.equal(estimate.mark_price,79982.02);
 const native=imperialLivePosition(position,[{...market,
  venues:[{venue:'phoenix',price:80012,fetchedAtUnixMs:now}]}],now);
 assert.equal(native.live_mark_basis,'venue');
 assert.equal(native.mark_price,80012);
 assert.ok(Math.abs((native.unrealized_pnl-estimate.unrealized_pnl)-.317788)<1e-9);
 assert.ok(Math.abs((native.pnl_pct-estimate.pnl_pct)-7.6853111423)<1e-8);
 assert.equal(native.feesOwed,estimate.feesOwed);
 assert.equal(native.amount,estimate.amount);
 assert.equal(native.leverage,estimate.leverage);
});

test('market WS respects upstream timestamps, including stale snapshots and out-of-order frames',()=>{
 const initial=[{symbol:'BTC',volume_24h:123,open_interest:456,venues:[]}];
 const event={type:'mark_price_update',symbol:'BTC',venue:'index',price:79820,fetched_at_unix_ms:100000};
 assert.equal(imperialMarketUpdate(initial,{...event,fetched_at_unix_ms:1},100000),initial);
 const live=imperialMarketUpdate(initial,event,100001);
 assert.equal(live[0].oracle,79820);assert.equal(live[0].oracle_at,100000);assert.equal(live[0].volume_24h,123);
 assert.equal(imperialMarketUpdate(live,{...event,fetched_at_unix_ms:99999},100001),live);
 const row=imperialPosition({...raw,underwriter:'phoenix',feesOwed:0,actions:[]});
 assert.equal(imperialLivePosition(row,live,100001).live_mark_basis,'index');
 assert.equal(imperialLivePosition(row,live,160001),row);
});

test('snapshot price rows do not shadow the live market funding rate',()=>{
 const source=readFileSync(new URL('./src/hooks/useImperial.js',import.meta.url),'utf8');
 assert.match(source,/delete priceRow\.funding_rate/);
 assert.match(source,/return \{\.\.\.priceRow, venues:/);
});
test('Imperial live decimals, margin, return and venue identity are preserved',()=>{
 const p=imperialPosition(raw);
 assert.equal(p.leverage,20.383613787592846);assert.equal(p.margin,3.434131);assert.equal(p.pnl_pct,-3.3528);
 assert.equal(p.unrealized_pnl,-0.1157);assert.equal(p.is_isolated,true);assert.equal(p.pair_index,0);
 assert.equal(p.amount,0.00087763);assert.equal(p.size_usd,70);assert.equal(p.mark_price,79744);
 assert.equal(p.liquidation_price,76062.84);
});
test('Imperial own liquidation overrides venue price; cross leg does not invent one',()=>{
 assert.equal(imperialPosition({...raw,ourLiquidationPriceUsd:'77000'}).liquidation_price,77000);
 const p=imperialPosition({...raw,directVenue:{marginMode:'unified',positionInitialMarginUsd:'1'}});
 assert.equal(p.is_isolated,false);assert.equal(p.liquidation_price,null);assert.equal(p.margin,1);
});
test('Imperial partial close uses requested fraction, never silently all',()=>{
 const p=imperialPosition(raw);
 assert.equal(imperialCloseBps([p],p.trade_index,p.amount/4,false),2500);
 assert.equal(imperialCloseBps([p],p.trade_index,p.amount,true),10000);
 assert.throws(()=>imperialCloseBps([],p.trade_index,p.amount/4,false),/Refresh/);
});
test('native executions, not order intent, populate history and micro-USD funding',()=>{
 const lifecycle={...raw,actions:[{id:'a',status:'converted',tx2Signature:'settled',tx2Timestamp:1788637758,sizeDelta:'70',sizeDeltaTokens:'.00087763',orderSizeUsd:'100',actionType:'increase',entryPrice:'79760.28'},{status:'pending',sizeDelta:'200'}]};
 const rows=imperialTradeRows([lifecycle]);assert.equal(rows.length,1);assert.equal(rows[0].notional_usd,70);assert.equal(rows[0].created_at,1788637758000);
 assert.equal(imperialFundingRows([{amount:'49000',eventAt:1788637758}])[0].payout,-.049);
 assert.equal(imperialFundingRows([{amount:'-1000',eventAt:1788637758}])[0].payout,.001);
 assert.equal(imperialPosition({...raw,tpslOrders:[{orderType:'take_profit',triggerPriceUsd:'81000'}]}).take_profit,81000);
});
test('wallet stream subscribes, rejects out-of-order frames, accepts empty state and cleans up',()=>{
 let socket;const received=[],statuses=[];const intervals=new Set();
 const timers={setInterval(fn){intervals.add(fn);return fn},clearInterval(fn){intervals.delete(fn)},setTimeout(){},clearTimeout(){}};
 class FakeSocket{constructor(url){socket=this;this.url=url;this.sent=[];this.readyState=1}send(m){this.sent.push(JSON.parse(m))}close(){this.closed=true}}
 const stop=openImperialStream({url:'wss://api.imperial.space/ws',subscriptions:[{type:'subscribe',wallet:'fixture',positionState:true}],WebSocketImpl:FakeSocket,timers,onMessage:m=>received.push(m),onStatus:s=>statuses.push(s)});
 socket.onopen();assert.equal(socket.sent[0].positionState,true);assert.equal(socket.sent[0].jwt,undefined);
 for(const seq of [2,1,2,3])socket.onmessage({data:JSON.stringify({type:'position_state',seq,positions:seq===3?[]:[raw]})});
 assert.deepEqual(received.map(m=>m.seq),[2,3]);assert.deepEqual(received[1].positions,[]);
 assert.equal(statuses.at(-1),'live');stop();assert.equal(socket.closed,true);assert.equal(intervals.size,0);
});

test('completed Imperial market close appears in History only with execution proof',()=>{
 const close={id:'closed-action',status:'completed',actionType:'decrease',tx2Signature:'fixture-execution',
  tx2Timestamp:1788690628,sizeDelta:'-846.0401',sizeDeltaTokens:'0.01060000',entryPrice:'80023'};
 const rows=imperialTradeRows([{...raw,actions:[close,{...close,id:'pending',status:'pending'},
  {...close,id:'no-proof',tx2Signature:null},{...close,id:'failed',status:'failed'}]}]);
 assert.equal(rows.length,1);assert.equal(rows[0].side,'close_long');
 assert.equal(rows[0].notional_usd,846.0401);assert.equal(rows[0].amount,.0106);
 assert.equal(rows[0].price,80023);assert.equal(rows[0].created_at,1788690628000);
});
test('stream reconnect resets sequence and stop cancels backoff',()=>{
 const sockets=[], received=[];let pending;
 const timers={setInterval(){},clearInterval(){},setTimeout(fn){pending=fn;return fn},clearTimeout(fn){if(pending===fn)pending=null}};
 class Socket{constructor(){sockets.push(this);this.readyState=1}send(){}close(){this.onclose?.()}}
 const stop=openImperialStream({url:'wss://fixture',subscriptions:[],WebSocketImpl:Socket,timers,onMessage:m=>received.push(m.seq)});
 sockets[0].onopen();sockets[0].onmessage({data:JSON.stringify({type:'position_state',seq:9})});sockets[0].close();
 pending();sockets[1].onopen();sockets[1].onmessage({data:JSON.stringify({type:'position_state',seq:1})});
 assert.deepEqual(received,[9,1]);assert.equal(sockets[0].onmessage,null);
 sockets[1].close();stop();assert.equal(pending,null);
});
