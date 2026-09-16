'use strict';
const assert = require('node:assert/strict');
const {test,before,after} = require('node:test');
const http = require('node:http');
const {once} = require('node:events');
const {WebSocketServer} = require('ws');
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
let server, wss, hibachi, restReads=0, wsReads=0, pings=0;
before(async()=>{
  server=http.createServer((_req,res)=>{restReads++;res.setHeader('content-type','application/json');res.end('{"orders":[]}');});
  wss=new WebSocketServer({server});
  wss.on('connection',socket=>socket.on('message',raw=>{
    const msg=JSON.parse(String(raw));
    if(msg.method==='orders.status'){wsReads++;socket.send(`{"id":${msg.id},"status":200,"result":{"orders":[{"orderId":9223372036854775807,"symbol":"BTC/USDT-P"}]}}`);}
    if(msg.method==='stream.start')socket.send(JSON.stringify({id:msg.id,status:200,result:{listenKey:'test-lease',accountSnapshot:{balance:'100',positions:[]}}}));
    if(msg.method==='stream.ping'){pings++;socket.send(JSON.stringify({id:msg.id,status:200}));}
  }));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  process.env.HIBACHI_API_URL=`http://127.0.0.1:${server.address().port}`;
  process.env.HIBACHI_WS_ENABLED='true';
  process.env.HIBACHI_PROXY_FILE='';process.env.HIBACHI_PROXIES='';
  hibachi=require('./hibachi');
});
after(async()=>{
  hibachi.__testing.resetCaches();
  for(const socket of wss.clients)socket.terminate();
  await new Promise(resolve=>wss.close(resolve));
  await new Promise(resolve=>server.close(resolve));
});
test('cold read uses REST; warm read uses WS and preserves 64-bit order ID',async()=>{
  const creds={accountId:7,apiKey:'fixture',privateKey:'fixture'};
  assert.deepEqual(await hibachi.getOrders(creds),[]);
  assert.equal(restReads,1);
  await delay(100);
  const orders=await hibachi.getOrders(creds);
  assert.equal(orders[0].order_id,'9223372036854775807');
  assert.equal(wsReads,1);assert.equal(restReads,1);
  await hibachi.getOrders(creds,{forceLive:true});
  assert.equal(restReads,2);
});
test('documented nested position updates handle side flips and close without unrelated loss',()=>{
  const apply=hibachi.__testing.applyAccountStreamMessage;
  const initial={balance:'100',positions:[{symbol:'BTC/USDT-P',direction:'Short',quantity:'1'},{symbol:'ETH/USDT-P',direction:'Long',quantity:'2'}]};
  assert.equal(apply(initial,{event:'order_cancellation',data:{symbol:'BTC/USDT-P'}}),null);
  assert.equal(apply(initial,{status:200}),null);
  const flipped=apply(initial,{event:'position_update',data:{symbol:'BTC/USDT-P',updatedPosition:{direction:'Long',quantity:'3'}}});
  assert.equal(flipped.positions.length,2);assert.equal(flipped.positions[1].quantity,'3');
  const closed=apply(flipped,{event:'position_update',data:{symbol:'BTC/USDT-P',updatedPosition:{direction:'Closed',quantity:'0'}}});
  assert.deepEqual(closed.positions,[initial.positions[1]]);
  assert.equal(apply(initial,{event:'balance_update',data:{updatedCollateralBalance:'111.001'}}).balance,'111.001');
});
test('account stream pings before 10s lease and invalidates disconnected/expired snapshots',async()=>{
  const stream=new hibachi.__testing.HibachiAccountStream({accountId:8,apiKey:'fixture'});
  try {
    assert.equal((await stream.ensureStarted()).balance,'100');
    await delay(5200);assert.ok(pings>=1,'heartbeat must occur within the 10s lease');
    stream.handleMessage({event:'stream_expired'});
    assert.equal(stream.freshSnapshot(),null);
    await delay(1200);
    assert.equal((await stream.ensureStarted()).balance,'100');
    stream.client.socket().terminate();
    await delay(50);assert.equal(stream.freshSnapshot(),null);
  }finally{stream.close();}
});
test('late close from retired socket cannot erase its replacement',async()=>{
  const {createReconnectingJsonWebSocket}=require('./reconnecting-json-websocket');
  const client=createReconnectingJsonWebSocket({url:process.env.HIBACHI_API_URL.replace('http:','ws:'),pingIntervalMs:0});
  try {
    client.connect();await once(client.socket(),'open');
    const old=client.socket();client.close();client.connect();
    const replacement=client.socket();await once(replacement,'open');
    old.emit('close',1000,Buffer.alloc(0));
    assert.equal(client.socket(),replacement);assert.equal(client.readyState(),1);
  }finally{client.close();}
});
