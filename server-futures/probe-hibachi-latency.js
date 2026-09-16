'use strict';
// Public, read-only probe. No account, credentials, orders, or proxy secrets.
const WebSocket = require('ws');
const { performance } = require('node:perf_hooks');
async function main() {
  const rest = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    try {
      const res = await fetch('https://data-api.hibachi.xyz/market/data/prices?symbol=BTC%2FUSDT-P', {signal: AbortSignal.timeout(8000)});
      await res.arrayBuffer();
      rest.push({status:res.status, ms:Math.round(performance.now()-start)});
    } catch { rest.push({error:'transport failure', ms:Math.round(performance.now()-start)}); }
  }
  const stream = await new Promise(resolve => {
    const start = performance.now(), gaps = [];
    let openedMs = null, firstMessageMs = null, last = null, messages = 0, done = false;
    const socket = new WebSocket('wss://data-api.hibachi.xyz/ws/market', {handshakeTimeout:8000});
    const finish = error => {
      if (done) return; done = true; clearTimeout(timer); socket.terminate();
      const sorted = gaps.sort((a,b)=>a-b);
      resolve({openedMs, firstMessageMs, messages, gapMedianMs:sorted[Math.floor(sorted.length/2)] ?? null, gapMaxMs:sorted.at(-1) ?? null, ...(error ? {error} : {})});
    };
    const timer = setTimeout(()=>finish(messages ? null : 'no data within 15s'),15000);
    socket.on('open',()=>{openedMs=Math.round(performance.now()-start); socket.send(JSON.stringify({method:'subscribe',parameters:{subscriptions:[{symbol:'BTC/USDT-P',topic:'mark_price'}]}}));});
    socket.on('message',raw=>{
      let msg; try {msg=JSON.parse(String(raw));} catch {return;}
      if (msg.topic !== 'mark_price') return;
      const now=performance.now();
      if (last !== null) gaps.push(Math.round(now-last));
      last=now; firstMessageMs ??= Math.round(now-start); messages++;
      if (messages >= 20) finish();
    });
    socket.on('error',()=>finish('transport failure'));
    socket.on('close',()=>finish(messages ? null : 'closed without data'));
  });
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),rest,stream},null,2));
}
main().catch(()=>{console.error('Probe failed'); process.exitCode=1;});
