'use strict';

// Real claim-gold route + real SQLite writers. Rows are shaped exactly like the
// Lighter importer writes them; no exchange is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-lighter-terminal-claim-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.CLASH_FUTURES_DB = path.join(tempDir, 'futures.db');
process.env.NODE_ENV = 'test';
process.env.RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX = '42';
process.env.RH_LIGHTER_BUILDER_FEE_BPS = '1';
for (const key of ['CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER', 'NFT_OWNERSHIP_DAILY_SYNC',
  'GAME_SHOP_SOLANA_RECONCILE_ENABLED', 'TOURNAMENT_DAILY_POOL_SCHEDULER', 'LUCKY_RAIDER_PAYOUT_WORKER']) {
  process.env[key] = '0';
}
process.env.NFT_SUPPLY_REFRESH_DISABLE = '1';
const nativeInterval = global.setInterval;
global.setInterval = (...args) => { const timer = nativeInterval(...args); timer.unref?.(); return timer; };
const nativeFetch = global.fetch;
global.fetch = (url, options) => {
  if (new URL(String(url)).hostname !== '127.0.0.1') throw new Error(`External network disabled in fixture: ${url}`);
  return nativeFetch(url, options);
};

const futures = require('../server-futures/db');
const recon = require('./trade_reconciliation');
const originalReconcile = recon.reconcileTradesForPlayer;
recon.reconcileTradesForPlayer = async (_player, options) => ({ ok: true, dex: options.dex, skipped: 'isolated_fixture' });
const { router } = require('./routes');
const main = require('./db');
const earnings = require('./earnings');

let walletIndex = 1;
function player(dex, suffix) {
  const id = `${dex}-${suffix}`, token = `fixture-token-${id}`;
  const wallet = `0x${String(walletIndex++).padStart(40, '0')}`;
  main.db.prepare('INSERT INTO players (id,name,token,dex,wallet,gold,wood,ore) VALUES (?,?,?,?,?,0,0,0)')
    .run(id, id, token, dex, wallet);
  main.db.prepare(`INSERT INTO player_dex_accounts
    (player_id,dex,chain_type,wallet_address,status,metadata_json) VALUES (?,?,'evm',?,'ready','{}')`)
    .run(id, dex, wallet);
  return { id, token, wallet, dex };
}

function lighterFill(owner, tradeId, { source, notional = 100, account = 7 } = {}) {
  const terminal = source.endsWith('_terminal');
  // The Lighter importer writes with addTrade (INSERT OR IGNORE on the shared fill key).
  return futures.addTrade(owner.id, {
    symbol: 'BTC', side: 'LONG', orderType: 'fill', amount: '0.001', price: '100000',
    orderId: String(tradeId), clientOrderId: `${owner.dex}:${tradeId}:${account}`,
    status: 'filled', dex: owner.dex, notional_usd: notional, verifiedSource: source,
    fee: terminal ? '0' : '0.01',
    proofJson: JSON.stringify(terminal
      ? { source: `${owner.dex}_server_receipt`, match: 'client_order_index', receipt: { account_index: account } }
      : { integrator_taker_fee_collector_index: 42, integrator_taker_fee: 100 }),
    createdAt: new Date(Date.now() - 120_000).toISOString(),
  });
}

async function claim(api, owner) {
  await new Promise(resolve => setTimeout(resolve, 35));
  const response = await fetch(`${api}/trading/claim-gold`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-token': owner.token, 'x-dex': owner.dex },
    body: JSON.stringify({ dex: owner.dex, wallet: owner.wallet, gold: 999999999, notional_usd: 999999999 }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}

function rewards(owner) {
  return main.db.prepare('SELECT * FROM trading_rewards WHERE player_id=? AND dex=?').get(owner.id, owner.dex);
}

async function run() {
  for (const dex of ['lighter', 'rhlighter']) {
    assert.deepEqual(recon.VERIFIED_SOURCES_BY_DEX[dex], [`${dex}_integrator`, `${dex}_terminal`]);
    assert.match(recon.verifiedSourceWhereForDex(dex), new RegExp(`${dex}_terminal`));
  }
  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const api = `http://127.0.0.1:${server.address().port}/api`;
  try {
    for (const dex of ['rhlighter', 'lighter']) {
      const owner = player(dex, 'standard');
      assert.equal(lighterFill(owner, 1, { source: `${dex}_terminal` }).changes, 1);
      const first = await claim(api, owner);
      assert.ok(first.earned_gold > 0, `${dex} terminal fill earns gold`);
      assert.equal(rewards(owner).total_volume, 100);
      assert.equal((await claim(api, owner)).earned_gold || 0, 0, 'same fill cannot pay twice');
      // Cross-source duplicate: a builder row with the same venue fill key is ignored.
      assert.equal(lighterFill(owner, 1, { source: `${dex}_integrator` }).changes, 0);
      assert.equal((await claim(api, owner)).earned_gold || 0, 0);
      // Builder fills still count as before.
      assert.equal(lighterFill(owner, 2, { source: `${dex}_integrator` }).changes, 1);
      assert.ok((await claim(api, owner)).earned_gold > 0);
      assert.equal(rewards(owner).total_volume, 200);
      console.log(`PASS ${dex}: terminal fill earns gold once; builder duplicate ignored`);
    }

    // Fee revenue: only builder rows feed the revenue estimate.
    const analytics = await earnings.fetchRevenueAnalytics();
    const all = analytics.windows.find(row => row.key === 'all');
    assert.equal(all.dexes.rhlighter.volume_usd, 100, 'terminal volume excluded from RH revenue analytics');
    assert.equal(all.dexes.lighter.volume_usd, 100, 'terminal volume excluded from Lighter revenue analytics');
    console.log('PASS earnings: *_terminal fills carry no builder/integrator revenue');
  } finally { await new Promise(resolve => server.close(resolve)); }
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  recon.reconcileTradesForPlayer = originalReconcile;
  try { recon.futuresDbReadonly()?.close(); } catch {}
  try { main.db.close(); } catch {} try { futures.db.close(); } catch {}
  for (const name of ['clash.db', 'futures.db']) for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(path.join(tempDir, name + suffix)); } catch (error) {
      if (!['ENOENT', 'EBUSY', 'EPERM'].includes(error.code)) console.warn(error.message);
    }
  }
  try { fs.rmdirSync(tempDir); } catch {}
});
