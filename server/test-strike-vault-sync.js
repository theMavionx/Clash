'use strict';
// Strike background vault sync: reads vaulted API wallet keys and reconciles per player.
// Run: node test-strike-vault-sync.js
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { tradingCredentialId } = require('./trading_credential_vault');
const { createStrikeVaultSync, parseStrikeCredentials, STRIKE_STORAGE_KEY } = require('./strike_vault_sync');

async function run() {
  const record = { accountId: '11111111-2222-4333-8444-555555555555', publicKey: 'p'.repeat(64), privateKey: 'k'.repeat(64), address: '0x' + '1'.repeat(40) };
  assert.deepEqual(parseStrikeCredentials(JSON.stringify(record)), record);
  assert.deepEqual(parseStrikeCredentials({ value: JSON.stringify(record) }), record);
  assert.equal(parseStrikeCredentials({ accountId: 'x' }), null);
  assert.equal(parseStrikeCredentials({ accountId: 'x', orderlyKey: 'k', orderlySecret: 's', address: 'a' }), null);
  const db = new Database(':memory:');
  db.exec('CREATE TABLE trading_credential_vault (player_id TEXT, dex TEXT, credential_id TEXT, deleted INTEGER)');
  const id = tradingCredentialId(STRIKE_STORAGE_KEY);
  db.prepare('INSERT INTO trading_credential_vault VALUES (?,?,?,0)').run('p1', 'strike', id);
  db.prepare('INSERT INTO trading_credential_vault VALUES (?,?,?,0)').run('p2', 'strike', id);
  db.prepare('INSERT INTO trading_credential_vault VALUES (?,?,?,1)').run('p3', 'strike', id);
  db.prepare('INSERT INTO trading_credential_vault VALUES (?,?,?,0)').run('p4', 'qfex', tradingCredentialId('clash_qfex_credentials_v1'));
  const calls = [];
  const sync = createStrikeVaultSync({
    db,
    vault: { readForPlayer: playerId => (playerId === 'p1' ? { value: record } : null) },
    getPlayer: playerId => ({ id: playerId, name: playerId }),
    reconcile: async (player, opts) => { calls.push({ player: player.id, opts }); return { ok: true, imported: 2 }; },
    log: { log() {}, warn() {} },
  });
  const summary = await sync.runOnce();
  assert.deepEqual(summary, { players: 2, synced: 1, imported: 2, missing: 1, failed: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.dex, 'strike'); assert.equal(calls[0].opts.reason, 'vault_sync');
  assert.deepEqual(calls[0].opts.credentials, record);
  console.log('Strike vault sync PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
