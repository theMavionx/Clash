'use strict';
// Throne partner quest verifier against an isolated database and a stubbed
// Throne API. Run: node test-throne-quest.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'throne-quest-'));
process.env.CLASH_MAIN_DB = path.join(dir, 'clash.db');
process.env.CLASH_FUTURES_DB = path.join(dir, 'futures.db');
const WALLET_A = '0x' + 'a'.repeat(40);
const WALLET_B = '0x' + 'b'.repeat(40);
const WALLET_T = '0x' + 'c'.repeat(40); // bound to the player's Throne account (futures.db)
{
  const futures = new Database(process.env.CLASH_FUTURES_DB);
  futures.exec(`CREATE TABLE throne_account_claims (account_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, address TEXT NOT NULL,
    broker_id TEXT NOT NULL DEFAULT 'throne', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  futures.prepare(`INSERT INTO throne_account_claims (account_id, player_id, address) VALUES ('0x01', 'p1', ?)`).run(WALLET_T);
  futures.prepare(`INSERT INTO throne_account_claims (account_id, player_id, address) VALUES ('0x02', 'p2', ?)`).run('0x' + 'd'.repeat(40));
  futures.close();
}
const tasks = require('./tasks');
const db = require('./db');

function status(overrides = {}) {
  return {
    traded: 0, floorUsd: 20000,
    flags: { hasSide: 0, traded: 0, named: 0, checkedIn: 0, qualified: 0, pass: 0 },
    ...overrides,
  };
}

function fakeFetch(byWallet, calls) {
  return async (url) => {
    const wallet = new URL(url).searchParams.get('wallet');
    calls.push(url);
    if (!(wallet in byWallet)) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => byWallet[wallet] };
  };
}

async function run() {
  assert.ok(tasks.VALID_TYPES.includes('throne_quest'));
  db.db.prepare(`INSERT INTO players (id, name, token, wallet) VALUES ('p1', 'ThroneTester', 'tok-p1', ?)`).run(WALLET_A);
  db.db.prepare(`INSERT INTO player_wallets (player_id, chain_type, address, is_primary) VALUES ('p1', 'evm', ?, 0)`).run(WALLET_B);
  const player = db.db.prepare(`SELECT * FROM players WHERE id = 'p1'`).get();
  const task = (params, id) => ({ id, type: 'throne_quest', params: JSON.stringify(params) });

  // The snapshot records lifetime `traded` per wallet at quest start, including the
  // Throne-bound address from throne_account_claims (and only this player's).
  let calls = [];
  const snap = await tasks.buildSnapshot(player, task({ min_volume: 1000 }, 1), {
    fetchImpl: fakeFetch({ [WALLET_A]: status({ traded: 5000 }), [WALLET_B]: status({ traded: 100 }), [WALLET_T]: status({ traded: 40000 }) }, calls),
  });
  assert.deepEqual(snap.throne_traded_start, { [WALLET_T]: 40000, [WALLET_A]: 5000, [WALLET_B]: 100 });
  assert.ok(calls[0].includes(`wallet=${WALLET_T}`), 'Throne-bound wallet is checked first');
  assert.ok(calls[0].includes('min=1000'), 'min threshold is forwarded to Throne');

  // Progress is volume since quest start, not lifetime volume.
  let result = await tasks.verifyTask(player, task({ min_volume: 1000 }, 1), snap, {
    fetchImpl: fakeFetch({ [WALLET_A]: status({ traded: 5400 }), [WALLET_B]: status({ traded: 100 }), [WALLET_T]: status({ traded: 40000, flags: { pass: 1 } }) }, []),
  });
  assert.equal(result.completed, false);
  assert.equal(result.progress_value, 400);
  assert.equal(result.target_value, 1000);

  // Lifetime volume above the minimum with the flag set does not complete without new volume.
  result = await tasks.verifyTask(player, task({ min_volume: 1000, require: 'pass' }, 1), snap, {
    fetchImpl: fakeFetch({ [WALLET_T]: status({ traded: 40500, flags: { pass: 1 } }) }, []),
  });
  assert.equal(result.completed, false);
  assert.equal(result.progress_value, 500);

  // The Throne-bound wallet trades enough after start: completed with that wallet.
  result = await tasks.verifyTask(player, task({ min_volume: 1000, require: 'pass' }, 1), snap, {
    fetchImpl: fakeFetch({ [WALLET_A]: status({ traded: 5000 }), [WALLET_T]: status({ traded: 41200, flags: { pass: 1, traded: 1 } }) }, []),
  });
  assert.equal(result.completed, true);
  assert.equal(result.throne_wallet, WALLET_T);
  assert.equal(result.progress_value, 1200);

  // Flag set but below the minimum since start: not completed.
  result = await tasks.verifyTask(player, task({ min_volume: 5000, require: 'traded' }, 3), { throne_traded_start: { [WALLET_A]: 0 } }, {
    fetchImpl: fakeFetch({ [WALLET_A]: status({ traded: 900, flags: { traded: 1 } }), [WALLET_B]: status() }, []),
  });
  assert.equal(result.completed, false);

  // Unknown flag falls back to 'pass'; Throne outage never completes.
  result = await tasks.verifyTask(player, task({ require: 'bogus' }, 4), {}, { fetchImpl: fakeFetch({}, []) });
  assert.deepEqual([result.completed, result.progress_value], [false, 0]);

  // A wallet without a start value (e.g. Throne was down at start) is baselined on first
  // sight, persisted to the player's task snapshot, and only counts volume after that.
  db.db.prepare(`INSERT INTO tasks (id, title, type, params, active) VALUES (5, 'Throne', 'throne_quest', ?, 1)`).run(JSON.stringify({ require: 'qualified' }));
  db.db.prepare(`INSERT INTO player_tasks (player_id, task_id, snapshot) VALUES ('p1', 5, '{}')`).run();
  result = await tasks.verifyTask(player, task({ require: 'qualified' }, 5), {}, {
    fetchImpl: fakeFetch({ [WALLET_T]: status({ traded: 21000, flags: { qualified: 1 } }) }, []),
  });
  assert.equal(result.completed, false, 'cannot complete in the check that sets the baseline');
  assert.equal(result.target_value, 20000, 'without a minimum, the Throne floor is shown as the target');
  const stored = JSON.parse(db.db.prepare(`SELECT snapshot FROM player_tasks WHERE player_id = 'p1' AND task_id = 5`).get().snapshot);
  assert.deepEqual(stored.throne_traded_start, { [WALLET_T]: 21000 });
  result = await tasks.verifyTask(player, task({ require: 'qualified' }, 5), stored, {
    fetchImpl: fakeFetch({ [WALLET_T]: status({ traded: 21000, flags: { qualified: 1 } }) }, []),
  });
  assert.equal(result.completed, true);
  assert.equal(result.progress_value, 0);

  console.log('Throne quest verifier tests passed.');
}

run()
  .then(() => {
    db.db.close();
    // tasks.js keeps its read-only futures.db handle open; Windows refuses to delete it then.
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }
  })
  .catch(error => { console.error(error); process.exit(1); });
