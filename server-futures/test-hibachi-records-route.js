'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'clash-hibachi-record-route-'));
process.env.CLASH_FUTURES_DB = path.join(dir,'test.db');
process.env.NODE_ENV = 'development';
const db = require('./db');
const {recordVerifiedFill} = require('./hibachi-trade-records');

test.after(()=>{db.db.close();fs.rmSync(dir,{recursive:true,force:true});});

test('actual record HTTP handler isolates users, bounds pagination and disables caching', async () => {
  for (const [playerId,accountId] of [['alice','1'],['bob','2']]) recordVerifiedFill(db.db,{
    playerId,accountId,username:playerId,trade:{source:'trades',side:'long',createdAt:'2026-09-16T00:00:00Z',orderId:'8',
      _raw:{id:'9007199254740993',symbol:'BTC/USDT-P',quantity:'0.1',price:'100'}}});
  const source = fs.readFileSync(path.join(__dirname,'routes.js'),'utf8');
  const start = source.indexOf("router.get('/hibachi/trade-records'");
  const end = source.indexOf("router.post('/hibachi/trade-history'",start);
  assert.ok(start>0 && end>start);
  const router = express.Router();
  // Isolate the production route's SQL/serialization from the full wallet stack.
  const auth = (req,res,next)=>{
    if (req.headers['x-token'] !== 'test-alice') return res.sendStatus(401);
    req.playerId='alice'; next();
  };
  new Function('router','auth','db',source.slice(start,end))(router,auth,db);
  const app = express(); app.use(router);
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const url = `http://127.0.0.1:${server.address().port}/hibachi/trade-records`;
  try {
    assert.equal((await fetch(url)).status,401);
    const response = await fetch(url+'?playerId=bob&limit=9000&offset=bad',{headers:{'x-token':'test-alice'}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const data = await response.json();
    assert.equal(data.limit,500); assert.equal(data.offset,0);
    assert.deepEqual(data.records.map(row=>row.username),['alice']);
    assert.equal(data.records[0].trade_id,'9007199254740993');
    assert.equal(data.records[0].volume,'10');
    const next = await fetch(url+'?offset=1',{headers:{'x-token':'test-alice'}});
    assert.equal((await next.json()).records.length,0);
    assert.match(source,/hibachi\.importFillsForPlayer\(req\.playerId, creds, \{\s*limit: req\.body\?\.limit,\s*username: req\.playerName/s);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
