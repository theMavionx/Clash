// Read-only public API smoke. Never submits preflights, orders or credentials.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {imperialPosition,imperialLivePosition,imperialMarketUpdate} from './src/lib/imperialData.js';
const require=createRequire(import.meta.url), imperial=require('../server-futures/imperial.js');
const markets=await imperial.getMarketInfo();
const btc=markets.find(row=>row.symbol==='BTC');
assert.ok(btc?.price>0);assert.ok(btc?.volume_24h>=0);assert.ok(btc?.open_interest>=0);
console.log(JSON.stringify({symbol:'BTC',oracle:btc.oracle,volume24h:btc.volume_24h,openInterest:btc.open_interest,scope:btc.stats_source}));
const wallet=process.argv[2];
if(wallet){
 const {positions}=await imperial.positionSnapshot(wallet);
 const WebSocket=require('ws');
 const streamed=await new Promise((resolve,reject)=>{
  const socket=new WebSocket('wss://api.imperial.space/ws/market');let rows=markets;
  const timeout=setTimeout(()=>{socket.close();reject(new Error('No fresh BTC index within 15s'));},15000);
  socket.on('open',()=>socket.send(JSON.stringify({type:'subscribe_mark_prices'})));
  socket.on('error',err=>{clearTimeout(timeout);reject(err);});
  socket.on('message',buffer=>{const message=JSON.parse(buffer);rows=imperialMarketUpdate(rows,message);
   if(message.symbol==='BTC'&&message.venue==='index'&&rows.find(row=>row.symbol==='BTC')?.oracle_at){clearTimeout(timeout);socket.close();resolve(rows);}});
 });
 for(const raw of positions){
  const p=imperialPosition(raw),live=imperialLivePosition(p,streamed);
  console.log(JSON.stringify({symbol:p.symbol,venue:p.underwriter,apiMark:p.mark_price,liveMark:live.mark_price,apiPnl:p.unrealized_pnl,livePnl:live.unrealized_pnl,livePct:live.pnl_pct,source:live.pnl_source}));
 }
}
