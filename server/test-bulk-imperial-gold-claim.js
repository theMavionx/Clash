'use strict';

// Actual Express auth/claim route and actual SQLite resource/entitlement writers.
// Only exchange reconciliation is replaced: this test never places/imports live trades.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const bs58 = require('bs58').default || require('bs58');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-bulk-imperial-claim-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.CLASH_FUTURES_DB = path.join(tempDir, 'futures.db');
process.env.NODE_ENV = 'test';
process.env.IMPERIAL_BUILDER_CODE = 'CLASH';
for (const key of ['CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER', 'NFT_OWNERSHIP_DAILY_SYNC',
  'GAME_SHOP_SOLANA_RECONCILE_ENABLED', 'TOURNAMENT_DAILY_POOL_SCHEDULER', 'LUCKY_RAIDER_PAYOUT_WORKER']) {
  process.env[key] = '0';
}
process.env.NFT_SUPPLY_REFRESH_DISABLE = '1';
const nativeInterval = global.setInterval;
global.setInterval = (...args) => { const timer = nativeInterval(...args); timer.unref?.(); return timer; };
const nativeFetch = global.fetch;
global.fetch = (url, options) => {
  if (new URL(String(url)).hostname !== '127.0.0.1') throw new Error(`External network disabled in Gold fixture: ${url}`);
  return nativeFetch(url, options);
};

const futures = require('../server-futures/db');
const recon = require('./trade_reconciliation');
const originalReconcile = recon.reconcileTradesForPlayer;
recon.reconcileTradesForPlayer = async (_player, options) => ({ ok: true, dex: options.dex, skipped: 'isolated_fixture' });
const { router } = require('./routes');
const main = require('./db');
const today = new Date().toISOString().slice(0, 10);
let walletIndex = 1;

function player(dex, suffix, mature = false) {
  const id = `${dex}-${suffix}`, token = `fixture-token-${id}`;
  const wallet = bs58.encode(Buffer.alloc(32, walletIndex++));
  main.db.prepare('INSERT INTO players (id,name,token,dex,wallet,gold,wood,ore) VALUES (?,?,?,?,?,0,0,0)')
    .run(id, id, token, dex, wallet);
  const result = { id, token, wallet, dex };
  link(result, dex);
  if (mature) main.db.prepare(`INSERT INTO trading_rewards
    (player_id,dex,wallet,first_deposit,first_trade,last_daily) VALUES (?,?,?,1,1,?)`).run(id, dex, wallet, today);
  return result;
}

function link(owner, dex) {
  main.db.prepare(`INSERT INTO player_dex_accounts
    (player_id,dex,chain_type,wallet_address,status,metadata_json) VALUES (?,?,'solana',?,'ready','{}')`)
    .run(owner.id, dex, owner.wallet);
}

function fill(owner, id, { notional = 100, side = 'long', executionId = id, duplicate = false } = {}) {
  const proof = owner.dex === 'bulk'
    ? { source: 'bulk_mainnet_signed_order', routed_by_clash: true, builder: { verified: false } }
    : { builderCode: 'CLASH', signature: `submit-${id}`, wallet: owner.wallet, profileIndex: 0,
      executionId, executionSignature: `final-${executionId}`, executionSignatureUnique: true };
  const result = futures.upsertVerifiedTrade(owner.id, {
    symbol: 'BTC', side, orderType: 'market', amount: '1', price: String(notional),
    orderId: `order-${id}`, clientOrderId: `${owner.dex}:${owner.wallet}:0:exec:${id}`,
    status: 'filled', dex: owner.dex, notional_usd: notional,
    verifiedSource: owner.dex === 'bulk' ? 'bulk_clash_signed' : 'imperial_api',
    proofJson: JSON.stringify(proof), createdAt: new Date(Date.now() - 60_000).toISOString(),
  });
  if (duplicate) futures.db.prepare('UPDATE trade_history SET reward_duplicate=1 WHERE client_order_id=?')
    .run(`${owner.dex}:${owner.wallet}:0:exec:${id}`);
  return result;
}

function rewards(owner) {
  return main.db.prepare('SELECT * FROM trading_rewards WHERE player_id=? AND dex=?').get(owner.id, owner.dex);
}

async function claim(api, owner) {
  // The real route has a 25ms per-player rate limiter. Do not bypass it in the fixture.
  await new Promise(resolve => setTimeout(resolve, 35));
  const response = await fetch(`${api}/trading/claim-gold`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-token': owner.token, 'x-dex': owner.dex },
    body: JSON.stringify({ dex: owner.dex, wallet: owner.wallet, gold: 999999999, notional_usd: 999999999 }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.dex, owner.dex);
  return data;
}

async function verifyTrading(api, dex) {
  const owner = player(dex, 'fresh');
  assert.equal(fill(owner, 'first').inserted, 1);
  const first = await claim(api, owner);
  assert.equal(first.gold, 1300, '$100 × 0.50 + 500 first deposit + 300 first open + 450 daily');
  assert.equal(first.earned_gold, 1300); assert.equal(first.pending_gold, 0);
  assert.equal(main.getResources(owner.id).gold, first.gold, 'ignore client-provided Gold/notional');
  assert.equal(rewards(owner).total_volume, 100);
  assert.equal((await claim(api, owner)).gold, 0, 'same fill cannot pay twice');
  assert.equal(rewards(owner).total_gold, 1300);
  if (dex === 'imperial') {
    fill(owner, 'legacy-index-shift', { executionId: 'first' });
    assert.equal((await claim(api, owner)).gold, 0, 'same execution above paid cursor cannot pay twice');
    assert.equal(rewards(owner).total_volume, 100);
  }
  fill(owner, 'second', { side: 'close_long' });
  const second = await claim(api, owner);
  assert.equal(second.gold, 50, 'subsequent $100 close receives volume only, no repeated bonuses');
  assert.equal(rewards(owner).total_gold, 1350); assert.equal(rewards(owner).total_volume, 200);
  fill(owner, 'explicit-duplicate', { duplicate: true });
  fill(owner, 'below-floor', { notional: 9 });
  assert.equal((await claim(api, owner)).gold, 0, 'duplicate and below-floor rows cannot mint Gold');
  const history = main.db.prepare('SELECT amount,reason FROM gold_history WHERE player_id=?').all(owner.id);
  assert.equal(history.reduce((sum, row) => sum + row.amount, 0), 1350);
  assert.equal(history.filter(row => row.reason.includes('First trade!')).length, 1);
  assert.equal(history.filter(row => row.reason.includes('First deposit!')).length, 1);
  console.log(`PASS ${dex}: real claim rate, bonuses, body distrust, replay, duplicates and threshold`);
  return owner;
}

async function verifyCapacity(api, dex) {
  const owner = player(dex, 'capped', true), cap = main.getResourceCaps(owner.id).gold;
  main.db.prepare('UPDATE players SET gold=? WHERE id=?').run(cap - 7, owner.id);
  fill(owner, 'cap-fill');
  const first = await claim(api, owner);
  assert.deepEqual([first.gold, first.earned_gold, first.pending_gold], [7, 50, 43]);
  assert.equal(main.getResources(owner.id).gold, cap);
  const full = await claim(api, owner);
  assert.equal(full.gold, 0); assert.equal(full.pending_gold, 43);
  main.subtractResources(owner.id, 20, 0, 0, { sourceType: 'fixture_spend' });
  const partial = await claim(api, owner);
  assert.equal(partial.gold, 20); assert.equal(partial.pending_gold, 23);
  main.subtractResources(owner.id, 30, 0, 0, { sourceType: 'fixture_spend' });
  const final = await claim(api, owner);
  assert.equal(final.gold, 23); assert.equal(final.pending_gold, 0);
  assert.equal((await claim(api, owner)).gold, 0);
  assert.equal(rewards(owner).total_gold, 50, 'releasing reserve must not re-earn/re-boost it');
  assert.equal(rewards(owner).total_volume, 100);
  const released = main.db.prepare(`SELECT SUM(gold_delta) total FROM resource_delta_events
    WHERE player_id=? AND source_type='trade_claim_pending_release'`).get(owner.id).total;
  assert.equal(released, 50, 'all and only earned Gold reached storage');
  assert.equal(main.db.prepare('SELECT COUNT(*) n FROM gold_history WHERE player_id=?').get(owner.id).n, 1);
  console.log(`PASS ${dex}: cap preserves earned entitlement; partial/final release totals exactly 50`);
}

async function run() {
  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const api = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const bulkOwner = await verifyTrading(api, 'bulk');
    await verifyTrading(api, 'imperial');
    await verifyCapacity(api, 'bulk'); await verifyCapacity(api, 'imperial');
    link(bulkOwner, 'imperial'); const crossDex = { ...bulkOwner, dex: 'imperial' };
    fill(crossDex, 'cross-dex-first');
    assert.equal((await claim(api, crossDex)).gold, 500, 'new DEX gets $50 volume + daily 450, not first bonuses again');
    console.log('PASS cross-DEX: first deposit/open bonuses remain once per player');
    console.log('BULK and Imperial actual server Gold claim tests passed.');
  } finally { await new Promise(resolve => server.close(resolve)); }
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  recon.reconcileTradesForPlayer = originalReconcile;
  try { recon.futuresDbReadonly()?.close(); } catch {}
  try { main.db.close(); } catch {} try { futures.db.close(); } catch {}
  // Delete only known fixture files. Private process-lifetime readonly handles can
  // keep files locked on Windows until exit; never widen cleanup to the workspace.
  for (const name of ['clash.db', 'futures.db']) for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(path.join(tempDir, name + suffix)); } catch (error) {
      if (!['ENOENT', 'EBUSY', 'EPERM'].includes(error.code)) console.warn(error.message);
    }
  }
  try { fs.rmdirSync(tempDir); } catch {}
});
