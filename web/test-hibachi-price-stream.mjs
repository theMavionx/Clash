import assert from 'node:assert/strict';
import {test} from 'node:test';
import {openHibachiPriceStream,mergeHibachiStreamPrices} from './src/lib/hibachiPriceStream.js';
function fixture(){
  let clock=1000,id=0;const tasks=new Map(),sockets=[],updates=[];
  const timers={setTimeout(fn,ms){tasks.set(++id,{fn,ms,interval:false});return id;},clearTimeout(i){tasks.delete(i);},setInterval(fn,ms){tasks.set(++id,{fn,ms,interval:true});return id;},clearInterval(i){tasks.delete(i);}};
  class Socket{constructor(url){this.url=url;sockets.push(this);}send(raw){this.sent=JSON.parse(raw);}close(){this.onclose?.();}}
  const stop=openHibachiPriceStream({symbols:['BTC/USDT-P'],onPrices:m=>updates.push(m),WebSocketImpl:Socket,timers,now:()=>clock});
  const run=ms=>{for(const [i,t]of [...tasks])if(t.ms===ms){if(!t.interval)tasks.delete(i);t.fn();}};
  return {sockets,updates,stop,run,tasks,setClock:v=>{clock=v;}};
}
test('one public subscription batches latest valid mark without credentials',()=>{
  const f=fixture(),s=f.sockets[0];s.onopen();
  assert.deepEqual(s.sent,{method:'subscribe',parameters:{subscriptions:[{symbol:'BTC/USDT-P',topic:'mark_price'}]}});
  for(const mark of ['123.001','124.002','NaN'])s.onmessage({data:JSON.stringify({symbol:'BTC/USDT-P',topic:'mark_price',data:{markPrice:mark}})});
  s.onmessage({data:'bad json'});f.run(100);
  assert.equal(f.updates.length,1);assert.equal(f.updates[0].get('BTC/USDT-P').mark,'124.002');
  f.stop();assert.equal(f.tasks.size,0);
});
test('stale stream reconnects, resubscribes and ignores retired socket',()=>{
  const f=fixture(),old=f.sockets[0];old.onopen();f.setClock(17000);f.run(5000);f.run(1000);
  assert.equal(f.sockets.length,2);f.sockets[1].onopen();assert.ok(f.sockets[1].sent);
  old.onmessage({data:JSON.stringify({symbol:'BTC/USDT-P',topic:'mark_price',data:{markPrice:'999'}})});
  f.run(100);assert.equal(f.updates.length,0);f.stop();assert.equal(f.tasks.size,0);
});
test('fresh WS overlays slow REST without changing volume or expired prices',()=>{
  const rows=[{symbol:'BTC',mark:'100',volume_24h:'999'}],updates=new Map([['BTC/USDT-P',{mark:'101.123456789',at:1000}]]);
  assert.equal(mergeHibachiStreamPrices(rows,updates,1001)[0].mark,'101.123456789');
  assert.equal(mergeHibachiStreamPrices(rows,updates,1001)[0].volume_24h,'999');
  assert.equal(mergeHibachiStreamPrices(rows,updates,12000)[0].mark,'100');
});
