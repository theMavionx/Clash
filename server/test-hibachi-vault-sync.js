'use strict';
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { tradingCredentialId } = require('./trading_credential_vault');
const {
  createHibachiVaultSync, parseCredentials, parseAccountList,
  HIBACHI_STORAGE_KEY, HIBACHI_ACCOUNTS_STORAGE_KEY,
} = require('./hibachi_vault_sync');

async function run() {
  assert.deepEqual(parseCredentials('{"apiKey":" k ","accountId":"1","privateKey":"p"}'), { apiKey: 'k', accountId: '1', privateKey: 'p' });
  assert.deepEqual(parseCredentials({ value: { apiKey: 'k', accountId: '1', privateKey: 'p' } }), { apiKey: 'k', accountId: '1', privateKey: 'p' });
  assert.equal(parseCredentials({ apiKey: 'k', accountId: '1' }), null);
  assert.equal(parseCredentials('not json'), null);
  assert.deepEqual(parseAccountList({ accounts: [{ apiKey: 'a', accountId: '1', privateKey: 'p' }, { apiKey: 'x' }] }).map(a => a.accountId), ['1']);

  const db = new Database(':memory:');
  db.exec(`CREATE TABLE trading_credential_vault (player_id TEXT, credential_id TEXT, dex TEXT, deleted INTEGER)`);
  const activeId = tradingCredentialId(HIBACHI_STORAGE_KEY);
  const listId = tradingCredentialId(HIBACHI_ACCOUNTS_STORAGE_KEY);
  const insert = db.prepare('INSERT INTO trading_credential_vault VALUES (?, ?, ?, ?)');
  insert.run('p-ok', activeId, 'hibachi', 0);
  insert.run('p-bad', activeId, 'hibachi', 0);
  insert.run('p-deleted', activeId, 'hibachi', 1);
  insert.run('p-fail', activeId, 'hibachi', 0);
  insert.run('p-other', 'other-id', 'lighter', 0);
  insert.run('p-multi', activeId, 'hibachi', 0);
  insert.run('p-multi', listId, 'hibachi', 0);
  insert.run('p-listonly', listId, 'hibachi', 0);

  const values = {
    [`p-ok:${activeId}`]: JSON.stringify({ apiKey: 'a', accountId: '10', privateKey: 'x' }),
    [`p-bad:${activeId}`]: JSON.stringify({ apiKey: 'a' }),
    [`p-fail:${activeId}`]: JSON.stringify({ apiKey: 'b', accountId: '11', privateKey: 'SECRET_PK_VALUE' }),
    // Active main account plus an FX sub-account; the main one is listed twice.
    [`p-multi:${activeId}`]: JSON.stringify({ apiKey: 'm', accountId: '20', privateKey: 'pm' }),
    [`p-multi:${listId}`]: JSON.stringify({ accounts: [
      { apiKey: 'm', accountId: '20', privateKey: 'pm' },
      { apiKey: 'fx', accountId: '21', privateKey: 'pfx' },
    ] }),
    [`p-listonly:${listId}`]: JSON.stringify({ accounts: [{ apiKey: 'l', accountId: '30', privateKey: 'pl' }] }),
  };
  const calls = [];
  const warnings = [];
  const sync = createHibachiVaultSync({
    db,
    vault: { readForPlayer: (playerId, credentialId) => {
      const value = values[`${playerId}:${credentialId}`];
      return value ? { value } : null;
    } },
    getPlayer: playerId => ({ id: playerId, name: playerId }),
    reconcile: async (player, opts) => {
      calls.push({ player: player.id, opts });
      if (player.id === 'p-fail') return { ok: false, error: 'Hibachi 401' };
      return { ok: true, imported: 3, updated: 1 };
    },
    log: { log() {}, warn: message => warnings.push(message) },
  });

  assert.deepEqual(sync.playersWithCredentials(), ['p-bad', 'p-fail', 'p-listonly', 'p-multi', 'p-ok']);
  const summary = await sync.runOnce();
  assert.deepEqual(summary, { players: 5, accounts: 5, synced: 4, imported: 12, updated: 4, missing: 1, failed: 1 });
  assert.deepEqual(calls.map(call => `${call.player}:${call.opts.credentials.accountId}`),
    ['p-fail:11', 'p-listonly:30', 'p-multi:20', 'p-multi:21', 'p-ok:10']);
  const okCall = calls.find(call => call.player === 'p-ok').opts;
  assert.equal(okCall.dex, 'hibachi');
  assert.equal(okCall.reason, 'vault_sync:10');
  assert.deepEqual(okCall.credentials, { apiKey: 'a', accountId: '10', privateKey: 'x' });
  assert.notEqual(calls[2].opts.reason, calls[3].opts.reason, 'sub-accounts need separate reconcile cooldowns');
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0].includes('SECRET_PK_VALUE'), 'warnings must never include credential values');

  console.log('Hibachi vault sync tests passed.');
}

run().catch(error => { console.error(error); process.exit(1); });
