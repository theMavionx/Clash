'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), Database = require('better-sqlite3');
const { createRuntimeDiagnostics } = require('./runtime_diagnostics');
const { createClientLogIngress, createWindow, rateAddress } = require('./http_security');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');

function database(t) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE client_logs(id INTEGER PRIMARY KEY,player_id,ip,level,source,url,ua,message,stack,payload,created_at DEFAULT (datetime('now')))`);
  t.after(() => db.close()); return db;
}
async function listen(t, app) {
  const server = await new Promise(resolve => { const s = app.listen(0,'127.0.0.1',()=>resolve(s)); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  return 'http://127.0.0.1:' + server.address().port;
}
test('unexpected server errors persist safe references; parser failures keep 400/413, not 500', async t => {
  const db = database(t), app = express(), diagnostics = createRuntimeDiagnostics({ db });
  app.use(diagnostics.middleware); app.use(express.json({ limit: '1kb' }));
  app.get('/explode/:id', () => { throw Error('PRIVATE_KEY_DO_NOT_STORE'); });
  app.post('/input', (_req,res)=>res.json({ ok:true })); app.use(diagnostics.errorHandler);
  const url = await listen(t,app);
  const failure = await fetch(url+'/explode/SECRET?token=PRIVATE');
  assert.equal(failure.status,500);
  const record = db.prepare('SELECT * FROM client_logs').get();
  assert.equal(JSON.parse(record.payload).traceId, failure.headers.get('x-request-id'));
  assert.doesNotMatch(JSON.stringify(record),/PRIVATE|SECRET/);
  assert.equal((await fetch(url+'/input',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"privateKey":"SECRET",'})).status,400);
  assert.equal((await fetch(url+'/input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(2000)})})).status,413);
  assert.equal(db.prepare('SELECT count(*) n FROM client_logs').get().n,3);
  assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM client_logs').all()), /SECRET/);
});
test('diagnostic storage failure cannot fail the response and warning volume is bounded', async t => {
  let warnings=0; const app=express();
  const d=createRuntimeDiagnostics({db:{prepare:()=>({run:()=>{throw Error('disk secret');}})},warn:()=>warnings++});
  app.use(d.middleware); app.get('/bad',(_req,res)=>res.status(503).json({error:'offline'}));
  const url=await listen(t,app);
  for(let i=0;i<3;i++) assert.equal((await fetch(url+'/bad')).status,503);
  assert.equal(warnings,1);
});
test('actual client-log route rejects malformed events and cannot spoof trusted server provenance', async t => {
  const realDb=database(t), router=express.Router(), app=express();
  const source=fs.readFileSync(path.join(__dirname,'routes.js'),'utf8');
  const section=source.slice(source.indexOf('const CLIENT_LOG_WINDOW_MS'),source.indexOf('const FEEDBACK_WINDOW_MS'));
  const mockDb={db:{prepare:sql=>/replay_telemetry|user_feedback/.test(sql)?{}:realDb.prepare(sql),transaction:fn=>realDb.transaction(fn)},authenticatePlayer:()=>null};
  vm.runInNewContext(section,{db:mockDb,router,createWindow,rateAddress,console:{warn(){},error(){}},setInterval:()=>({unref(){}})});
  app.use('/api/client-log',createClientLogIngress()); app.use(express.json({limit:'100kb',inflate:false}));app.use('/api',router);
  const url=await listen(t,app);
  const post=body=>fetch(url+'/api/client-log',{method:'POST',headers:{'Content-Type':'application/json','x-real-ip':'forged'},body:JSON.stringify(body)});
  assert.equal((await post({events:[null]})).status,400);
  assert.equal((await post({events:Array(51).fill({})})).status,400);
  assert.equal((await post({events:[{level:'select sleep(15)',source:'server.http',message:'test'}]})).status,200);
  const row=realDb.prepare('SELECT * FROM client_logs').get();
  assert.equal(row.level,'info');assert.equal(row.source,'client.untrusted');assert.equal(row.ip,'127.0.0.1');
  assert.equal((await post({events:[{message:'x'.repeat(103000)}]})).status,413);
});
