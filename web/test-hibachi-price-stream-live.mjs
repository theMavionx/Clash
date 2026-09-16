// Explicit opt-in public smoke; actual UI transport, no accounts or orders.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {openHibachiPriceStream,mergeHibachiStreamPrices} from './src/lib/hibachiPriceStream.js';
const require=createRequire(import.meta.url);
const WebSocketImpl=require('../server-futures/node_modules/ws');
const started=performance.now();
let stop, batches=0;
await new Promise((resolve,reject)=>{
  const deadline=setTimeout(()=>{stop?.();reject(new Error('No public marks within 15s'));},15000);
  stop=openHibachiPriceStream({symbols:['BTC/USDT-P'],WebSocketImpl,onPrices:updates=>{
    try {
      const [row]=mergeHibachiStreamPrices([{symbol:'BTC',mark:'0',volume_24h:'fixture'}],updates);
      assert.ok(Number(row.mark)>0);assert.equal(row.mark_source,'websocket');assert.equal(row.volume_24h,'fixture');
      if(++batches===10){clearTimeout(deadline);stop();console.log(JSON.stringify({batches,elapsedMs:Math.round(performance.now()-started),markSource:row.mark_source,credentialFree:true}));resolve();}
    }catch(error){clearTimeout(deadline);stop();reject(error);}
  }});
});
