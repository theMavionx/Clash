'use strict';

const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { readTradingDiagnostics } = require('./trading_diagnostics');
const futuresDb = new Database(':memory:');
const mainDb = new Database(':memory:');
const address = process.env.BULK_BUILDER_ADDRESS || 'Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9';

futuresDb.exec(`
  CREATE TABLE trade_history (player_id TEXT, dex TEXT, status TEXT, verified_source TEXT,
    notional_usd REAL, amount TEXT, price TEXT, created_at TEXT, proof_json TEXT,
    id INTEGER PRIMARY KEY, client_order_id TEXT);
  CREATE TABLE bulk_order_builder_proofs (account TEXT, response_json TEXT, created_at TEXT);
  CREATE TABLE imperial_order_proofs (builder_code TEXT, order_pda TEXT, tx_signature TEXT, created_at TEXT);
`);
mainDb.exec(`
  CREATE TABLE trading_rewards (dex TEXT, total_gold INTEGER, pending_gold INTEGER, updated_at TEXT);
  CREATE TABLE trade_claim_results (id INTEGER PRIMARY KEY, dex TEXT, created_at TEXT,
    result TEXT, credited_trade_count INTEGER, credited_volume_usd REAL, total_gold_paid INTEGER);
  INSERT INTO trading_rewards VALUES ('bulk', 125, 25, '2026-09-06 12:00:00');
  INSERT INTO trade_claim_results VALUES (1, 'bulk', '2026-09-06 12:00:00', 'paid', 3, 300, 100);
`);
const insert = futuresDb.prepare("INSERT INTO trade_history (player_id,dex,status,verified_source,notional_usd,amount,price,created_at,proof_json) VALUES ('player', ?, ?, ?, ?, '1', '100', datetime('now'), ?)");
function addBulk(signer, { source = 'bulk_clash_signed', status = 'filled', builder = false, routed = true, volume = 100 } = {}) {
  insert.run('bulk', status, source, volume, JSON.stringify({ source: 'bulk_mainnet_signed_order',
    account: 'owner', order: { signer, signature: 'SECRET_SIGNATURE' }, routed_by_clash: routed,
    builder: { verified: builder, address, fee_bps: 1 } }));
}
addBulk('agent');
addBulk('owner');
addBulk(null);
addBulk('agent', { builder: true, source: 'bulk_builder_signed' });
addBulk('agent', { routed: false, volume: 10000 });
addBulk('agent', { source: 'server', volume: 10000 });
addBulk('agent', { status: 'pending', volume: 10000 });
insert.run('bulk', 'filled', 'bulk_clash_signed', 10000, '{malformed');
futuresDb.prepare('INSERT INTO bulk_order_builder_proofs VALUES (?, ?, datetime(\'now\'))').run('owner',
  JSON.stringify({ clash_verified_signer: 'agent', jwt: 'SECRET_JWT', signature: 'SECRET_SIGNATURE' }));
futuresDb.prepare('INSERT INTO bulk_order_builder_proofs VALUES (?, ?, datetime(\'now\'))').run('owner', '{}');

const bulk = readTradingDiagnostics({ futuresDb, mainDb, dex: 'bulk' });
assert.equal(bulk.executions.status, 'available');
assert.equal(bulk.executions.trades, 4);
assert.equal(bulk.executions.volume_usd, 400, 'zero-builder routed volume must remain visible');
assert.equal(bulk.executions.signer_breakdown.find(row => row.signer_mode === 'one_tap').trades, 2);
assert.equal(bulk.executions.signer_breakdown.find(row => row.signer_mode === 'owner').trades, 1);
assert.equal(bulk.executions.signer_breakdown.find(row => row.signer_mode === 'unknown').trades, 1);
assert.equal(bulk.submissions.orders, 2, 'submission proofs are separate from executions');
assert.equal(bulk.rewards.paid_gold, 100);
assert.equal(bulk.rewards.pending_gold, 25);
assert.equal(bulk.claims.attempts, 1);
assert.equal(bulk.claims.recent[0].total_gold_paid, 100);
assert(!JSON.stringify(bulk).includes('SECRET'));
assert(!JSON.stringify(bulk).includes('proof_json'));

for (const [code, signature, source, status] of [
  ['CLASH', 'signature', 'imperial_api', 'filled'], ['OTHER', 'signature', 'imperial_api', 'filled'],
  ['CLASH', '', 'imperial_api', 'filled'], ['CLASH', 'signature', 'server', 'filled'],
  ['CLASH', 'signature', 'imperial_api', 'pending'],
]) insert.run('imperial', status, source, 200, JSON.stringify({ builderCode: code, signature }));
futuresDb.exec("INSERT INTO imperial_order_proofs VALUES ('CLASH', 'pda', NULL, datetime('now')), ('OTHER', 'pda2', NULL, datetime('now'))");
const imperial = readTradingDiagnostics({ futuresDb, mainDb, dex: 'imperial' });
assert.equal(imperial.executions.trades, 1);
assert.equal(imperial.executions.volume_usd, 200);
assert.equal(imperial.executions.signer_evidence, 'not_recorded');
assert.equal(imperial.submissions.orders, 1);
assert.equal(imperial.rewards.accounts, 0);
assert.equal(imperial.claims.attempts, 0);
assert.match(imperial.claims.note, /does not mean no eligible trades/);

const before = mainDb.prepare('SELECT total_changes() AS count').get().count;
readTradingDiagnostics({ futuresDb, mainDb, dex: 'bulk' });
assert.equal(mainDb.prepare('SELECT total_changes() AS count').get().count, before, 'diagnostics never settle or repair');
const missing = readTradingDiagnostics({ dex: 'bulk' });
assert.equal(missing.executions.status, 'unavailable');
assert.equal(missing.rewards.status, 'unavailable');
mainDb.exec('DROP TABLE trade_claim_results');
const partial = readTradingDiagnostics({ futuresDb, mainDb, dex: 'bulk' });
assert.equal(partial.claims.status, 'unavailable');
assert.equal(partial.rewards.paid_gold, 100, 'missing telemetry must not hide reward ledger');
futuresDb.close();
mainDb.close();
console.log('Trading diagnostics: SQLite proof filters, signer evidence, Gold ledger, missing storage and read-only safety passed.');
