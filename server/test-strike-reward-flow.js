'use strict';
// Strike reward flow end to end on isolated DBs with a fake Strike API:
// adapter places an order (intent) -> imports Strike per-order fills of a builder-attributed
// order -> Gold claim, task progress and tournament credit; foreign/forged fills are never
// credited; credited once.
// Run: node test-strike-reward-flow.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'strike-reward-'));
process.env.CLASH_MAIN_DB = path.join(temp, 'main.db');
process.env.CLASH_FUTURES_DB = path.join(temp, 'futures.db');
process.env.NODE_ENV = 'test';
process.env.ADMIN_KEY = 'strike-fixture';
for (const key of ['CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER', 'NFT_OWNERSHIP_DAILY_SYNC', 'GAME_SHOP_SOLANA_RECONCILE_ENABLED', 'TOURNAMENT_DAILY_POOL_SCHEDULER', 'LUCKY_RAIDER_PAYOUT_WORKER']) process.env[key] = '0';
process.env.NFT_SUPPLY_REFRESH_DISABLE = '1';
const interval = global.setInterval;
global.setInterval = (...args) => { const t = interval(...args); t.unref?.(); return t; };
const network = global.fetch;
global.fetch = (url, options) => {
  if (new URL(String(url)).hostname !== '127.0.0.1') throw new Error('External network disabled in Strike fixture');
  return network(url, options);
};
const { ed25519 } = require('../server-futures/node_modules/@noble/curves/ed25519');
const futures = require('../server-futures/db');
const strike = require('../server-futures/strike');
const recon = require('./trade_reconciliation');
recon.reconcileTradesForPlayer = async () => ({ ok: true, skipped: 'fixture' });
const tasks = require('./tasks');
const { router } = require('./routes');
const main = require('./db');

const ADDRESS = '0x38c8af2baf91998349f0b291fad7301af5a6541e';
const ACCOUNT = '0c5b8b1e-2f4a-4c3d-9e8f-7a6b5c4d3e2f';
const PRIVATE = '03'.repeat(32);
const CREDS = { accountId: ACCOUNT, publicKey: Buffer.from(ed25519.getPublicKey(Buffer.from(PRIVATE, 'hex'))).toString('hex'), privateKey: PRIVATE, address: ADDRESS };
const ACTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const player = { id: 'strike-test', name: 'Strike test', token: 'strike-test-token', dex: 'strike', wallet: ADDRESS };
const sqlTime = n => new Date(n).toISOString().slice(0, 19).replace('T', ' ');
const fillTime = Date.now() - 60_000;
const json = (status, data) => ({ ok: status < 300, status, text: async () => JSON.stringify(data) });
let order = null;
const fakeStrike = async (url, init = {}) => {
  const u = new URL(url); const p = u.pathname; const method = init.method || 'GET';
  if (p === '/v2/markets') return json(200, { markets: { 'ETH-USD': { symbol: 'ETH-USD', base_asset: 'ETH', status: 'trading', default_leverage: 10,
    margin_tiers: [{ max_leverage: 50 }], order_tick_price: '0.01', order_market_step_size: '0.001', order_market_min_size: '0.001', order_market_max_size: '500',
    order_limit_step_size: '0.001', order_limit_min_size: '0.001', order_min_notional: '5', mark_price: '2000' } } });
  if (p === '/price/v2/ticker/24hr') return json(200, []);
  if (p === '/v2/account') return json(200, { account_id: ACCOUNT, wallet_balance: '500', available_balance: '400' });
  if (p === '/v2/symbols') return json(200, { symbol_settings: {} });
  if (p === '/v2/order' && method === 'POST') {
    const b = JSON.parse(init.body);
    order = { ID: 1000, ClientOrderID: b.client_order_id, Symbol: b.symbol, Side: b.side, Size: b.size, Filled: b.size, Status: 'filled', Type: 'market',
      Builder: { Code: 'clashofperps', FeeBps: Number(init.headers['X-Builder-Fee-Bps'] || 0) } };
    return json(201, { client_order_id: b.client_order_id, account_id: ACCOUNT, sequence_id: 1 });
  }
  if (p === '/v2/order' && method === 'GET') return order && u.searchParams.get('client_order_id') === order.ClientOrderID ? json(200, order) : json(404, { error: 'order not found' });
  if (p === '/v2/history/fill') return json(200, { fills: [
    { id: 501, trade_id: 1, order_id: 1000, account_id: ACCOUNT, symbol: 'ETH-USD', side: 'buy', role: 'taker', price: '2000', size: '0.05', realized_pnl: '0', fee: '0.06', fee_type: 'commission', timestamp: fillTime },
    { id: 502, trade_id: 2, order_id: 7777, account_id: ACCOUNT, symbol: 'ETH-USD', side: 'buy', role: 'taker', price: '2000', size: '1', realized_pnl: '0', fee: '1', fee_type: 'commission', timestamp: fillTime }] });
  return json(404, { error: 'not found' });
};

async function run() {
  strike.setTestDependencies({ fetch: fakeStrike, database: futures.db, sleep: async () => {} });
  main.db.prepare('INSERT INTO players(id,name,token,dex,wallet,gold,wood,ore) VALUES (?,?,?,?,?,0,0,0)').run(player.id, player.name, player.token, player.dex, player.wallet);
  await strike.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.05', orderType: 'market', actionId: ACTION }, { playerId: player.id });
  const imported = await strike.importTradesForPlayer(player.id, CREDS, {});
  assert.equal(imported.imported, 1); assert.equal(imported.rejected.foreign_order, 1);
  assert.equal((await strike.importTradesForPlayer(player.id, CREDS, {})).imported, 0, 'a filled order is not re-imported');
  // Forged rows with the right source string but no matching intent, or copied to another player, are ineligible.
  futures.upsertVerifiedTrade(player.id, { symbol: 'ETH-USD', side: 'open_long', orderType: 'market', amount: '100', price: '2000', orderId: '9999',
    clientOrderId: `strike:${ACCOUNT}:fill:forged`, dex: 'strike', status: 'filled', notional_usd: 200000, verifiedSource: 'strike_builder',
    proofJson: JSON.stringify({ account_id: ACCOUNT, builder_code: 'clashofperps', order_builder_code: 'clashofperps', action_id: ACTION, order_id: '9999',
      fill: { id: 'forged', order_id: 9999, symbol: 'ETH-USD', side: 'buy', price: '2000', size: '100' } }) });
  futures.upsertVerifiedTrade('intruder', { symbol: 'ETH-USD', side: 'open_long', orderType: 'market', amount: '0.05', price: '2000', orderId: '1000',
    clientOrderId: `strike:${ACCOUNT}:fill:501`, dex: 'strike', status: 'filled', notional_usd: 100, verifiedSource: 'strike_builder',
    proofJson: JSON.stringify({ account_id: ACCOUNT, builder_code: 'clashofperps', order_builder_code: 'clashofperps', action_id: ACTION, order_id: '1000',
      fill: { id: 501, order_id: 1000, symbol: 'ETH-USD', side: 'buy', price: '2000', size: '0.05' } }) });
  const eligibleFor = id => futures.db.prepare(`SELECT * FROM trade_history WHERE dex='strike' AND player_id=? AND ${recon.verifiedSourceWhereForDex('strike')}`).all(id);
  assert.deepEqual(eligibleFor(player.id).map(r => r.client_order_id), [`strike:${ACCOUNT}:fill:501`]);
  assert.equal(eligibleFor('intruder').length, 0, 'a copied proof for another player is rejected');
  const rows = await tasks.fetchWalletTrades(player, { dex: 'strike' });
  assert.equal(rows.length, 1);
  const task = { id: 1, type: 'volume', params: JSON.stringify({ target_volume: 100 }) };
  const result = await tasks.verifyTask(player, task, { dex: 'strike', trade_id_start: 0, start_time: new Date(Date.now() - 3600000).toISOString() }, { prefetchedTrades: rows });
  assert.equal(result.progress_value, 100);
  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const tr = await fetch(url + '/admin/tournaments', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY },
      body: JSON.stringify({ name: 'Strike fixture', dex: 'strike', dex_scope: 'single', eligible_dexes: ['strike'], start_at: sqlTime(Date.now() - 3600000), end_at: sqlTime(Date.now() + 3600000), sort_by: 'volume_usd', status: 'active' }) });
    const tournament = await tr.json();
    assert.equal(tr.status, 200, JSON.stringify(tournament)); assert.equal(tournament.tournament.dex, 'strike');
    main.db.prepare("INSERT INTO tournament_participants(tournament_id,player_id,joined_at,trophies,gold,trades_count,volume_usd,pnl_usd,team_dex) VALUES (?,?,datetime('now','-30 minutes'),0,0,0,0,0,'strike')").run(tournament.tournament.id, player.id);
    const claim = async () => {
      const r = await fetch(url + '/trading/claim-gold', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': player.token, 'x-dex': 'strike' }, body: JSON.stringify({ dex: 'strike', wallet: player.wallet, gold: 99999999 }) });
      const body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body)); return body;
    };
    const first = await claim();
    assert.ok(first.gold > 0, JSON.stringify(first));
    const totals = main.db.prepare("SELECT total_volume,total_gold FROM trading_rewards WHERE player_id=? AND dex='strike'").get(player.id);
    assert.equal(totals.total_volume, 100);
    assert.equal((await claim()).gold, 0, 'credited once');
    const participant = main.db.prepare('SELECT trades_count,volume_usd FROM tournament_participants WHERE tournament_id=? AND player_id=?').get(tournament.tournament.id, player.id);
    assert.deepEqual(participant, { trades_count: 1, volume_usd: 100 });
    console.log(`Strike Gold (${first.gold}), task, tournament, foreign-fill rejection and repeat-claim flow PASS`);
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  try { recon.futuresDbReadonly()?.close(); } catch {}
  main.db.close(); futures.db.close();
});
