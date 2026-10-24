'use strict';
// Throne reward flow end to end on isolated DBs with a fake Orderly:
// adapter places an order (intent) -> imports Orderly per-order fills -> Gold claim,
// task progress and tournament credit; foreign/forged fills are never credited; credited once.
// Run: node test-throne-reward-flow.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'throne-reward-'));
process.env.CLASH_MAIN_DB = path.join(temp, 'main.db');
process.env.CLASH_FUTURES_DB = path.join(temp, 'futures.db');
process.env.NODE_ENV = 'test';
process.env.ADMIN_KEY = 'throne-fixture';
for (const key of ['CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER', 'NFT_OWNERSHIP_DAILY_SYNC', 'GAME_SHOP_SOLANA_RECONCILE_ENABLED', 'TOURNAMENT_DAILY_POOL_SCHEDULER', 'LUCKY_RAIDER_PAYOUT_WORKER']) process.env[key] = '0';
process.env.NFT_SUPPLY_REFRESH_DISABLE = '1';
const interval = global.setInterval;
global.setInterval = (...args) => { const t = interval(...args); t.unref?.(); return t; };
const network = global.fetch;
global.fetch = (url, options) => {
  if (new URL(String(url)).hostname !== '127.0.0.1') throw new Error('External network disabled in Throne fixture');
  return network(url, options);
};
const { ed25519 } = require('../server-futures/node_modules/@noble/curves/ed25519');
const bs58m = require('../server-futures/node_modules/bs58'); const bs58 = bs58m.default || bs58m;
const futures = require('../server-futures/db');
const throne = require('../server-futures/throne');
const recon = require('./trade_reconciliation');
recon.reconcileTradesForPlayer = async () => ({ ok: true, skipped: 'fixture' });
const tasks = require('./tasks');
const { router } = require('./routes');
const main = require('./db');

const ADDRESS = '0x38c8af2baf91998349f0b291fad7301af5a6541e';
const ACCOUNT = '0x9ba878b2ff85be6028d9e40a1840f33d4b1f84c8adab5e2725f356bd69434a17';
const SEED = new Uint8Array(32).fill(3);
const CREDS = { accountId: ACCOUNT, orderlyKey: `ed25519:${bs58.encode(ed25519.getPublicKey(SEED))}`, orderlySecret: bs58.encode(SEED), address: ADDRESS };
const ACTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const player = { id: 'throne-test', name: 'Throne test', token: 'throne-test-token', dex: 'throne', wallet: ADDRESS };
const sqlTime = n => new Date(n).toISOString().slice(0, 19).replace('T', ' ');
const fillTime = Date.now() - 60_000;
const ok = data => ({ ok: true, status: 200, text: async () => JSON.stringify({ success: true, data }) });
const fakeOrderly = async (url, init = {}) => {
  const p = new URL(url).pathname; const method = init.method || 'GET';
  if (p === '/v1/public/info') return ok({ rows: [{ symbol: 'PERP_ETH_USDC', status: 'ACTIVE', base_min: 0.001, base_max: 1000, base_tick: 0.001, quote_tick: 0.01, min_notional: 10, base_imr: 0.02 }] });
  if (p === '/v1/public/futures') return ok({ rows: [{ symbol: 'PERP_ETH_USDC', status: 'ACTIVE', mark_price: 2000, index_price: 2000 }] });
  if (p === '/v1/get_account') return ok({ account_id: ACCOUNT });
  if (p === '/v1/client/info') return ok({ account_id: ACCOUNT });
  if (p === '/v1/order' && method === 'POST') return ok({ order_id: 1000, client_order_id: ACTION, order_type: 'MARKET', order_quantity: 0.05 });
  if (p === '/v1/order/1000/trades') return ok({ rows: [
    { id: 501, order_id: 1000, symbol: 'PERP_ETH_USDC', side: 'BUY', executed_price: 2000, executed_quantity: 0.05, executed_timestamp: fillTime, fee: 0.06, realized_pnl: 5 },
    { id: 502, order_id: 7777, symbol: 'PERP_ETH_USDC', side: 'BUY', executed_price: 2000, executed_quantity: 1, executed_timestamp: fillTime, fee: 1, realized_pnl: 0 }] });
  if (p === '/v1/order/1000') return ok({ order_id: 1000, status: 'FILLED' });
  return { ok: false, status: 404, text: async () => JSON.stringify({ success: false, code: -1000 }) };
};

async function run() {
  throne.setTestDependencies({ fetch: fakeOrderly, database: futures.db });
  main.db.prepare('INSERT INTO players(id,name,token,dex,wallet,gold,wood,ore) VALUES (?,?,?,?,?,0,0,0)').run(player.id, player.name, player.token, player.dex, player.wallet);
  await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.05', orderType: 'market', actionId: ACTION }, { playerId: player.id });
  const imported = await throne.importTradesForPlayer(player.id, CREDS, {});
  assert.equal(imported.imported, 1); assert.equal(imported.rejected.foreign_order, 1);
  assert.equal((await throne.importTradesForPlayer(player.id, CREDS, {})).imported, 0, 'a filled order is not re-imported');
  // Forged rows with the right source string but no matching intent, or copied to another player, are ineligible.
  futures.upsertVerifiedTrade(player.id, { symbol: 'PERP_ETH_USDC', side: 'open_long', orderType: 'market', amount: '100', price: '2000', orderId: '9999',
    clientOrderId: `throne:${ACCOUNT}:fill:forged`, dex: 'throne', status: 'filled', notional_usd: 200000, verifiedSource: 'throne_orderly',
    proofJson: JSON.stringify({ account_id: ACCOUNT, broker_id: 'throne', action_id: ACTION, order_id: '9999', fill: { id: 'forged', order_id: 9999, symbol: 'PERP_ETH_USDC', side: 'BUY', executed_price: 2000, executed_quantity: 100 } }) });
  futures.upsertVerifiedTrade('intruder', { symbol: 'PERP_ETH_USDC', side: 'open_long', orderType: 'market', amount: '0.05', price: '2000', orderId: '1000',
    clientOrderId: `throne:${ACCOUNT}:fill:501`, dex: 'throne', status: 'filled', notional_usd: 100, verifiedSource: 'throne_orderly',
    proofJson: JSON.stringify({ account_id: ACCOUNT, broker_id: 'throne', action_id: ACTION, order_id: '1000', fill: { id: 501, order_id: 1000, symbol: 'PERP_ETH_USDC', side: 'BUY', executed_price: 2000, executed_quantity: 0.05 } }) });
  const eligibleFor = id => futures.db.prepare(`SELECT * FROM trade_history WHERE dex='throne' AND player_id=? AND ${recon.verifiedSourceWhereForDex('throne')}`).all(id);
  assert.deepEqual(eligibleFor(player.id).map(r => r.client_order_id), [`throne:${ACCOUNT}:fill:501`]);
  assert.equal(eligibleFor('intruder').length, 0, 'a copied proof for another player is rejected');
  const rows = await tasks.fetchWalletTrades(player, { dex: 'throne' });
  assert.equal(rows.length, 1);
  const task = { id: 1, type: 'volume', params: JSON.stringify({ target_volume: 100 }) };
  const result = await tasks.verifyTask(player, task, { dex: 'throne', trade_id_start: 0, start_time: new Date(Date.now() - 3600000).toISOString() }, { prefetchedTrades: rows });
  assert.equal(result.progress_value, 100);
  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const tr = await fetch(url + '/admin/tournaments', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY },
      body: JSON.stringify({ name: 'Throne fixture', dex: 'throne', dex_scope: 'single', eligible_dexes: ['throne'], start_at: sqlTime(Date.now() - 3600000), end_at: sqlTime(Date.now() + 3600000), sort_by: 'volume_usd', status: 'active' }) });
    const tournament = await tr.json();
    assert.equal(tr.status, 200, JSON.stringify(tournament)); assert.equal(tournament.tournament.dex, 'throne');
    main.db.prepare("INSERT INTO tournament_participants(tournament_id,player_id,joined_at,trophies,gold,trades_count,volume_usd,pnl_usd,team_dex) VALUES (?,?,datetime('now','-30 minutes'),0,0,0,0,0,'throne')").run(tournament.tournament.id, player.id);
    const claim = async () => {
      const r = await fetch(url + '/trading/claim-gold', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': player.token, 'x-dex': 'throne' }, body: JSON.stringify({ dex: 'throne', wallet: player.wallet, gold: 99999999 }) });
      const body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body)); return body;
    };
    const first = await claim();
    assert.ok(first.gold > 0, JSON.stringify(first));
    const totals = main.db.prepare("SELECT total_volume,total_gold FROM trading_rewards WHERE player_id=? AND dex='throne'").get(player.id);
    assert.equal(totals.total_volume, 100);
    assert.equal((await claim()).gold, 0, 'credited once');
    const participant = main.db.prepare('SELECT trades_count,volume_usd FROM tournament_participants WHERE tournament_id=? AND player_id=?').get(tournament.tournament.id, player.id);
    assert.deepEqual(participant, { trades_count: 1, volume_usd: 100 });
    console.log(`Throne Gold (${first.gold}), task, tournament, foreign-fill rejection and repeat-claim flow PASS`);
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  try { recon.futuresDbReadonly()?.close(); } catch {}
  main.db.close(); futures.db.close();
});
