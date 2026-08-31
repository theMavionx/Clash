const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const express = require('express');
const { createTaskRewardService, legacyTaskRewardLosses } = require('./task_rewards');

function harness() {
  const sql = new Database(':memory:');
  sql.pragma('foreign_keys = ON');
  sql.exec(`
    CREATE TABLE players (id TEXT PRIMARY KEY, gold INTEGER, wood INTEGER, ore INTEGER);
    INSERT INTO players VALUES ('tango',9000,8365,7490), ('other',0,0,0);
    CREATE TABLE resource_delta_events (id INTEGER PRIMARY KEY, player_id TEXT, source_type TEXT,
      related_task_id INTEGER, lost_gold_to_cap INTEGER, lost_wood_to_cap INTEGER, lost_ore_to_cap INTEGER,
      created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE player_tasks (player_id TEXT, task_id INTEGER, snapshot TEXT, claimed_at TEXT,
      progress REAL DEFAULT 1, progress_value REAL DEFAULT 518817, target_value REAL DEFAULT 100000,
      started_at TEXT, PRIMARY KEY(player_id,task_id));
    CREATE TABLE gold_history (player_id TEXT, amount INTEGER, reason TEXT);
    CREATE TABLE task_claim_events (player_id TEXT,task_id INTEGER,result TEXT);
    INSERT INTO player_tasks (player_id,task_id,snapshot) VALUES ('tango',12,'{"start_time":"2026-08-26"}');
  `);
  let caps = { gold: 9000, wood: 9000, ore: 9000 }, fail = false;
  const events = [];
  const getResources = playerId => sql.prepare('SELECT gold,wood,ore FROM players WHERE id=?').get(playerId);
  // Execute the actual existing capped resource writer rather than an alternate
  // test-only payout algorithm. Storage amounts are controlled by the fixture.
  const source = fs.readFileSync(require.resolve('./db'), 'utf8');
  const writer = source.slice(source.indexOf('function addResources('), source.indexOf('\nfunction subtractResources('));
  const cap = source.slice(source.indexOf('function applyResourceDeltaWithCap('), source.indexOf('\nfunction getTownHallLevel('));
  const context = {
    stmts: { getResources: { get: getResources }, updateResource: sql.prepare('UPDATE players SET gold=?,wood=?,ore=? WHERE id=?') },
    getResourceCaps: () => caps,
    recordResourceDeltaEvent: event => { if (fail) throw new Error('injected payout failure'); events.push(event); },
  };
  vm.createContext(context); vm.runInContext(writer + '\n' + cap, context);
  const deps = { db: sql, getResources, getResourceCaps: () => caps, addResources: context.addResources };
  const service = createTaskRewardService(deps);
  return { sql, service, deps, events, getResources,
    caps: value => { caps = value; }, fail: value => { fail = value; },
    set: (gold, wood, ore) => sql.prepare('UPDATE players SET gold=?,wood=?,ore=? WHERE id=?').run(gold,wood,ore,'tango') };
}

test('Tango exact repro: all earned reward conserved between storage and reserve', () => {
  const h = harness();
  try {
    const reward = { gold: 8888, wood: 8888, ore: 8888 };
    const result = h.service.credit('tango',12,reward);
    assert.deepEqual(result.released, { gold: 0, wood: 635, ore: 1510 });
    assert.deepEqual(result.pending, { gold: 8888, wood: 8253, ore: 7378 });
    assert.deepEqual(h.getResources('tango'), { gold:9000,wood:9000,ore:9000 });
    assert.equal(h.events[0].lostWoodToCap, 0);
    assert.deepEqual(h.events[0].metadata.reward_earned,reward);
    const eventCount = h.events.length;
    h.service.settle('tango'); h.service.settle('tango');
    assert.equal(h.events.length,eventCount,'full-storage polls do not produce repeated zero events');
    h.set(0,0,0);
    assert.deepEqual(h.service.settle('tango').released, result.pending);
    assert.deepEqual(h.service.pendingByTask('tango'), {});
    assert.deepEqual(h.service.settle('tango').released, {gold:0,wood:0,ore:0});
  } finally { h.sql.close(); }
});

test('room increases, spends, multiple quests and persisted reserve keep exact independent amounts', () => {
  const h = harness();
  try {
    h.set(12000,9000,9000); // grandfathered balance above the current cap must not shrink
    h.service.credit('tango',12,{gold:8888,wood:8888,ore:8888});
    h.service.credit('tango',16,{gold:0,wood:500,ore:500});
    assert.equal(h.getResources('tango').gold,12000);
    h.caps({gold:15000,wood:15000,ore:15000});
    const restarted = createTaskRewardService(h.deps);
    assert.deepEqual(restarted.settle('tango').released,{gold:3000,wood:6000,ore:6000});
    assert.deepEqual(h.getResources('other'),{gold:0,wood:0,ore:0});
    h.set(0,0,0);
    assert.deepEqual(restarted.settle('tango').released,{gold:5888,wood:3388,ore:3388});
    assert.deepEqual(restarted.pendingByTask('tango'),{});
  } finally { h.sql.close(); }
});

test('reward and reserve changes roll back together on failure, including a caller claim transaction', () => {
  const h = harness();
  try {
    h.fail(true);
    assert.throws(()=>h.sql.transaction(()=> {
      h.service.credit('tango',12,{gold:8888,wood:8888,ore:8888});
      h.sql.prepare("UPDATE player_tasks SET claimed_at=datetime('now') WHERE player_id='tango'").run();
    })(),/injected payout failure/);
    assert.deepEqual(h.getResources('tango'),{gold:9000,wood:8365,ore:7490});
    assert.deepEqual(h.service.pendingByTask('tango'),{});
    assert.equal(h.sql.prepare("SELECT claimed_at FROM player_tasks WHERE player_id='tango'").get().claimed_at,null);
    for(const reward of [{wood:-1},{ore:NaN},{gold:Infinity},{gold:0.5},{wood:Number.MAX_SAFE_INTEGER+1}]) {
      assert.throws(()=>h.service.credit('tango',12,reward),/Invalid quest reward/);
    }
    assert.throws(()=>h.service.credit('missing',12,{wood:1}),/FOREIGN KEY/);
  } finally { h.sql.close(); }
});

test('historical repair reserves only exact audited losses once; it never replays already paid resources', () => {
  const h = harness();
  try {
    const insert=h.sql.prepare('INSERT INTO resource_delta_events (id,player_id,source_type,related_task_id,lost_gold_to_cap,lost_wood_to_cap,lost_ore_to_cap) VALUES (?,?,?,?,?,?,?)');
    insert.run(394359,'tango','task_claim',3,100,0,0);
    insert.run(396257,'tango','task_claim',12,8888,8253,7378);
    insert.run(396258,'tango','task_claim',16,0,500,500);
    insert.run(396261,'tango','task_claim',3,0,0,100);
    insert.run(396329,'tango','task_claim',6,1000,1700,5000);
    insert.run(396330,'other','task_claim',12,99999,99999,99999);
    insert.run(396331,'tango','production_collect',null,0,10,10);
    insert.run(400000,'tango','task_claim',6,500,500,500);
    assert.equal(legacyTaskRewardLosses(h.sql,'tango',396335).length,5);
    const result=h.service.recoverLegacy('tango',396335,'owner-authorized Tango quest repair');
    assert.deepEqual(result.recovered,{gold:9988,wood:10453,ore:12978});
    assert.deepEqual(result.source_event_ids,[394359,396257,396258,396261,396329]);
    assert.deepEqual(h.getResources('tango'),{gold:9000,wood:8365,ore:7490},'repair queues, does not bypass storage');
    assert.deepEqual(h.service.recoverLegacy('tango',396335,'retry').recovered,{gold:0,wood:0,ore:0});
    assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM task_reward_recoveries').get().n,5);
    h.set(0,0,0); h.caps({gold:50000,wood:50000,ore:50000});
    assert.deepEqual(h.service.settle('tango').released,result.recovered);
    assert.deepEqual(h.service.settle('tango').released,{gold:0,wood:0,ore:0});
    assert.throws(()=>legacyTaskRewardLosses(h.sql,'tango',Infinity),/audit event boundary/);
  } finally { h.sql.close(); }
});

async function routeHarness(h) {
  const app=express(), router=express.Router();
  const task={id:12,title:'Whale',type:'volume',reward_gold:8888,reward_wood:8888,reward_ore:8888,repeatable:false};
  const snapshotWaiters=[];
  const tasks={
    getTaskById:()=>task,isTaskLive:()=>true,checkTaskEligibility:()=>({ok:true}),
    getPlayerTask:(player,id)=>h.sql.prepare('SELECT * FROM player_tasks WHERE player_id=? AND task_id=?').get(player,id),
    canClaim:pt=>pt.claimed_at?{ok:false,reason:'Already claimed'}:{ok:true},parseParams:value=>JSON.parse(value || '{}'),
    mergeMonotonicTaskProgress:(_pt,result)=>({progress_value:result.progress_value,target_value:result.target_value}),
    buildSnapshot:async()=>{
      // Hold both repeatable requests at the actual handler's async boundary.
      await new Promise(resolve=>{snapshotWaiters.push(resolve);if(snapshotWaiters.length===2)snapshotWaiters.forEach(done=>done());});
      return {next:true};
    },getActiveTasks:()=>[task],
  };
  const context={router,auth:(req,_res,next)=>{req.player={id:'tango',name:'Tango',dex:'hibachi'};next();},
    tasks,taskRewards:h.service,console:{log(){},warn(){}},
    db:{db:h.sql,getResources:h.getResources,recordTaskClaimEvent(){},
      applyTaskNftRewardBoost:(_id,reward)=>({...reward,base:reward}),applyAltarProsperityResourceBonus:(_id,reward)=>reward},
    requestedTaskDexFromHeaders:()=>'',PACIFICA_TASK_PREFETCH_TIMEOUT_MS:1000,TASK_PROGRESS_REFRESH_TIMEOUT_MS:1000,
    TRADE_HISTORY_TASK_TYPES:new Set(['volume']),LIVE_TASK_PROGRESS_DEXES:new Set(),
    logEconomy(){}, prefetchStartedTaskTradesForDex:async()=>({}), maybeRefreshTaskProgress:async(_p,_t,pt)=>pt,
  };
  const source=fs.readFileSync(require.resolve('./routes'),'utf8');
  const claim=source.slice(source.indexOf("router.post('/tasks/:id/claim'"),source.indexOf('// ==================== ELFA'));
  const resources=source.match(/router\.get\('\/resources', auth, \(req, res\) => \{[\s\S]*?\n\}\);/)[0];
  const list=source.slice(source.indexOf("router.get('/tasks',"),source.indexOf('// Start a task (captures baseline snapshot)'));
  vm.createContext(context);vm.runInContext(resources+'\n'+claim+'\n'+list,context);
  app.use(router);
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  return {task,base:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}

test('actual claim/resources/list HTTP routes: capacity, double click, reserve and truthful response', async () => {
  const h=harness(), api=await routeHarness(h);
  try {
    const replies=await Promise.all([1,2].map(()=>fetch(api.base+'/tasks/12/claim',{method:'POST'}).then(async r=>{assert.equal(r.status,200);return r.json();})));
    const first=replies.find(r=>!r.already_claimed);
    assert.deepEqual(first.reward,{gold:0,wood:635,ore:1510});
    assert.deepEqual(first.reward_pending,{gold:8888,wood:8253,ore:7378});
    assert.deepEqual(first.reward_earned,{gold:8888,wood:8888,ore:8888});
    assert.equal(replies.filter(r=>r.already_claimed).length,1);
    assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM gold_history').get().n,1);
    const list=await fetch(api.base+'/tasks').then(r=>r.json());
    assert.deepEqual(list[0].reward_pending,first.reward_pending);
    h.set(0,0,0);
    const balances=await fetch(api.base+'/resources').then(r=>r.json());
    assert.deepEqual(balances,first.reward_pending);
    assert.deepEqual(await fetch(api.base+'/resources').then(r=>r.json()),balances);
    assert.deepEqual((await fetch(api.base+'/tasks').then(r=>r.json()))[0].reward_pending,{gold:0,wood:0,ore:0});
  } finally {await api.close();h.sql.close();}
});

test('repeatable zero-cooldown claim snapshot guard prevents a concurrent cycle from being paid twice', async () => {
  const h=harness(), api=await routeHarness(h);
  try {
    api.task.repeatable=true;
    const replies=await Promise.all([1,2].map(()=>fetch(api.base+'/tasks/12/claim',{method:'POST'}).then(r=>r.json())));
    assert.equal(replies.filter(r=>r.raced).length,1);
    assert.equal(replies.filter(r=>r.auto_restarted).length,1);
    assert.deepEqual(h.service.pendingByTask('tango')[12],{gold:8888,wood:8253,ore:7378});
    assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM gold_history').get().n,1);
  } finally {await api.close();h.sql.close();}
});
