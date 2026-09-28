'use strict';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { tradingCredentialId } = require('./trading_credential_vault');
const { createHibachiVaultSync, parseCredentials, HIBACHI_STORAGE_KEY } = require('./hibachi_vault_sync');

async function run() {
  assert.deepEqual(parseCredentials('{"apiKey":" k ","accountId":"1","privateKey":"p"}'), { apiKey: 'k', accountId: '1', privateKey: 'p' });
  assert.deepEqual(parseCredentials({ value: { apiKey: 'k', accountId: '1', privateKey: 'p' } }), { apiKey: 'k', accountId: '1', privateKey: 'p' });
  assert.equal(parseCredentials({ apiKey: 'k', accountId: '1' }), null);
  assert.equal(parseCredentials('not json'), null);

  const db = new Database(':memory:');
  db.exec(`CREATE TABLE trading_credential_vault (player_id TEXT, credential_id TEXT, dex TEXT, deleted INTEGER)`);
  const id = tradingCredentialId(HIBACHI_STORAGE_KEY);
  const insert = db.prepare('INSERT INTO trading_credential_vault VALUES (?, ?, ?, ?)');
  insert.run('p-ok', id, 'hibachi', 0);
  insert.run('p-bad', id, 'hibachi', 0);
  insert.run('p-deleted', id, 'hibachi', 1);
  insert.run('p-fail', id, 'hibachi', 0);
  insert.run('p-other', 'other-id', 'lighter', 0);

  const values = {
    'p-ok': JSON.stringify({ apiKey: 'a', accountId: '10', privateKey: 'x' }),
    'p-bad': JSON.stringify({ apiKey: 'a' }),
    'p-fail': JSON.stringify({ apiKey: 'b', accountId: '11', privateKey: 'SECRET_PK_VALUE' }),
  };
  const calls = [];
  const warnings = [];
  const sync = createHibachiVaultSync({
    db,
    vault: { readForPlayer: (playerId, credentialId) => {
      assert.equal(credentialId, id);
      return values[playerId] ? { value: values[playerId] } : null;
    } },
    getPlayer: playerId => ({ id: playerId, name: playerId }),
    reconcile: async (player, opts) => {
      calls.push({ player: player.id, opts });
      if (player.id === 'p-fail') return { ok: false, error: 'Hibachi 401' };
      return { ok: true, imported: 3, updated: 1 };
    },
    log: { log() {}, warn: message => warnings.push(message) },
  });

  assert.deepEqual(sync.playersWithCredentials(), ['p-bad', 'p-fail', 'p-ok']);
  const summary = await sync.runOnce();
  assert.deepEqual(summary, { players: 3, synced: 1, imported: 3, updated: 1, missing: 1, failed: 1 });
  assert.deepEqual(calls.map(call => call.player), ['p-fail', 'p-ok']);
  const okCall = calls.find(call => call.player === 'p-ok').opts;
  assert.equal(okCall.dex, 'hibachi');
  assert.equal(okCall.reason, 'vault_sync');
  assert.deepEqual(okCall.credentials, { apiKey: 'a', accountId: '10', privateKey: 'x' });
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0].includes('SECRET_PK_VALUE'), 'warnings must never include credential values');

  console.log('Hibachi vault sync tests passed.');
}

run().catch(error => { console.error(error); process.exit(1); });
