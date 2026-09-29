'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qfex-reward-'));
process.env.CLASH_MAIN_DB = path.join(temp, 'main.db');
process.env.CLASH_FUTURES_DB = path.join(temp, 'futures.db');
process.env.NODE_ENV = 'test';
process.env.ADMIN_KEY = 'qfex-fixture';
for (const key of ['CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER', 'NFT_OWNERSHIP_DAILY_SYNC', 'GAME_SHOP_SOLANA_RECONCILE_ENABLED', 'TOURNAMENT_DAILY_POOL_SCHEDULER', 'LUCKY_RAIDER_PAYOUT_WORKER']) process.env[key] = '0';
process.env.NFT_SUPPLY_REFRESH_DISABLE = '1';
const interval = global.setInterval;
global.setInterval = (...args) => { const t = interval(...args); t.unref?.(); return t; };
const network = global.fetch;
global.fetch = (url, options) => {
  if (new URL(String(url)).hostname !== '127.0.0.1') throw new Error('External network disabled in QFEX fixture');
  return network(url, options);
};
const futures = require('../server-futures/db');
require('../server-futures/qfex').ensureSchema();
const recon = require('./trade_reconciliation');
recon.reconcileTradesForPlayer = async () => ({ok:true,skipped:'fixture'});
const tasks = require('./tasks');
const { router } = require('./routes');
const main = require('./db');
const player = {id:'qfex-test',name:'QFEX test',token:'qfex-test-token',dex:'qfex',wallet:'11111111111111111111111111111111'};
const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const action = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const builder = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const order = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const sqlTime = n => new Date(n).toISOString().slice(0,19).replace('T',' ');

async function run() {
  main.db.prepare('INSERT INTO players(id,name,token,dex,wallet,gold,wood,ore) VALUES (?,?,?,?,?,0,0,0)').run(player.id,player.name,player.token,player.dex,player.wallet);
  futures.db.prepare('INSERT INTO qfex_account_claims(account_id,player_id) VALUES (?,?)').run(account,player.id);
  futures.db.prepare("INSERT INTO qfex_action_intents(account_id,player_id,action_id,kind,payload_hash,client_order_id,builder_code,status,order_id,result_json) VALUES (?,?,?,'add_order','hash','client',?,'accepted',?,'{}')").run(account,player.id,action,builder,order);
  futures.db.prepare('UPDATE qfex_action_intents SET params_json=? WHERE action_id=?').run(JSON.stringify({symbol:'BTC-USD',side:'BUY',reduce_only:false}),action);
  const executionTime = Math.floor(Date.now()/1000)-120;
  const fill = {symbol:'BTC-USD',side:'open_long',orderType:'market',amount:'1',price:'100',orderId:order,
    clientOrderId:`qfex:${account}:fill:valid`,dex:'qfex',status:'filled',notional_usd:100,verifiedSource:'qfex_builder_api',pnl:'5',
    proofJson:JSON.stringify({account_id:account,action_id:action,builder_code:builder,
      fill:{id:'valid',order_id:order,symbol:'BTC-USD',quantity:1,price:100,side:'BUY'},
      execution:{trade_id:'valid',order_id:order,symbol:'BTC-USD',quantity:1,price:100,timestamp:executionTime}}),
    createdAt:new Date(executionTime*1000).toISOString()};
  assert.equal(futures.upsertVerifiedTrade(player.id,fill).inserted,1);
  assert.equal(futures.upsertVerifiedTrade(player.id,fill).inserted,0);
  futures.upsertVerifiedTrade(player.id,{...fill,clientOrderId:'qfex:forged',notional_usd:1000000});
  const eligible = futures.db.prepare(`SELECT * FROM trade_history WHERE dex='qfex' AND ${recon.verifiedSourceWhereForDex('qfex')}`).all();
  assert.equal(eligible.length,1,'source string alone cannot prove a fill');
  const rows = await tasks.fetchWalletTrades(player,{dex:'qfex'});
  assert.equal(rows.length,1);
  const task = {id:1,type:'volume',params:JSON.stringify({target_volume:100})};
  const result = await tasks.verifyTask(player,task,{dex:'qfex',trade_id_start:0,start_time:new Date(Date.now()-3600000).toISOString()},{prefetchedTrades:rows});
  assert.equal(result.progress_value,100);
  const late = await tasks.verifyTask(player,task,{dex:'qfex',trade_id_start:0,start_time:new Date().toISOString()},{prefetchedTrades:rows});
  assert.equal(late.progress_value,0,'pre-task executions imported later must not count');
  const app = express(); app.use(express.json()); app.use('/api',router);
  const server = await new Promise(resolve => { const s = app.listen(0,'127.0.0.1',()=>resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const tournamentResponse = await fetch(url+'/admin/tournaments',{method:'POST',headers:{'content-type':'application/json','x-admin-key':process.env.ADMIN_KEY},body:JSON.stringify({name:'QFEX fixture',dex:'qfex',dex_scope:'single',eligible_dexes:['qfex'],start_at:sqlTime(Date.now()-3600000),end_at:sqlTime(Date.now()+3600000),sort_by:'volume_usd',status:'active'})});
    const tournament = await tournamentResponse.json();
    assert.equal(tournamentResponse.status,200,JSON.stringify(tournament));
    assert.equal(tournament.tournament.dex,'qfex');
    main.db.prepare("INSERT INTO tournament_participants(tournament_id,player_id,joined_at,trophies,gold,trades_count,volume_usd,pnl_usd,team_dex) VALUES (?,?,datetime('now','-30 minutes'),0,0,0,0,0,'qfex')").run(tournament.tournament.id,player.id);
    const claim = async () => {
      const r = await fetch(url+'/trading/claim-gold',{method:'POST',headers:{'content-type':'application/json','x-token':player.token,'x-dex':'qfex'},body:JSON.stringify({dex:'qfex',wallet:player.wallet,gold:99999999,notional_usd:99999999})});
      const body = await r.json(); assert.equal(r.status,200,JSON.stringify(body)); return body;
    };
    assert.equal((await claim()).gold,1300);
    const totals = main.db.prepare("SELECT total_volume,total_gold FROM trading_rewards WHERE player_id=? AND dex='qfex'").get(player.id);
    assert.deepEqual(totals,{total_volume:100,total_gold:1300});
    assert.equal((await claim()).gold,0);
    const participant = main.db.prepare('SELECT gold,trades_count,volume_usd,pnl_usd FROM tournament_participants WHERE tournament_id=? AND player_id=?').get(tournament.tournament.id,player.id);
    assert.deepEqual(participant,{gold:1300,trades_count:1,volume_usd:100,pnl_usd:5});
    console.log('QFEX Gold, task, tournament and repeat-claim flow PASS');
  } finally { await new Promise(resolve=>server.close(resolve)); }
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  try { recon.futuresDbReadonly()?.close(); } catch {}
  main.db.close(); futures.db.close();
  // Keep the isolated fixture directory on failure for diagnosis; no workspace data is touched.
});
