'use strict';
// Throne partner quest verifier against an isolated database and a stubbed
// Throne API. Run: node test-throne-quest.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'throne-quest-'));
process.env.CLASH_MAIN_DB = path.join(dir, 'clash.db');
const tasks = require('./tasks');
const db = require('./db');

const WALLET_A = '0x' + 'a'.repeat(40);
const WALLET_B = '0x' + 'b'.repeat(40);

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

  // Not yet passing: progress reflects traded volume toward the minimum.
  let calls = [];
  let result = await tasks.verifyTask(player, task({ min_volume: 1000 }, 1), {}, {
    fetchImpl: fakeFetch({ [WALLET_A]: status({ traded: 400 }), [WALLET_B]: status({ traded: 100 }) }, calls),
  });
  assert.equal(result.completed, false);
  assert.equal(result.progress_value, 400);
  assert.equal(result.target_value, 1000);
  assert.ok(calls[0].includes('min=1000'), 'min threshold is forwarded to Throne');

  // Second linked wallet passes: completed with the passing wallet.
  calls = [];
  result = await tasks.verifyTask(player, task({ min_volume: 1000, require: 'pass' }, 2), {}, {
    fetchImpl: fakeFetch({
      [WALLET_A]: status({ traded: 50 }),
      [WALLET_B]: status({ traded: 2500, flags: { pass: 1, traded: 1 } }),
    }, calls),
  });
  assert.equal(result.completed, true);
  assert.equal(result.throne_wallet, WALLET_B);

  // Flag set but below the minimum volume: not completed.
  result = await tasks.verifyTask(player, task({ min_volume: 5000, require: 'traded' }, 3), {}, {
    fetchImpl: fakeFetch({ [WALLET_A]: status({ traded: 900, flags: { traded: 1 } }), [WALLET_B]: status() }, []),
  });
  assert.equal(result.completed, false);

  // Unknown flag falls back to 'pass'; Throne outage never completes.
  result = await tasks.verifyTask(player, task({ require: 'bogus' }, 4), {}, {
    fetchImpl: fakeFetch({}, []),
  });
  assert.deepEqual([result.completed, result.progress_value], [false, 0]);

  // Without a minimum, the Throne floor is shown as the target.
  result = await tasks.verifyTask(player, task({ require: 'qualified' }, 5), {}, {
    fetchImpl: fakeFetch({ [WALLET_A]: status({ traded: 21000, flags: { qualified: 1 } }) }, []),
  });
  assert.equal(result.completed, true);
  assert.equal(result.target_value, 20000);

  console.log('Throne quest verifier tests passed.');
}

run()
  .then(() => { db.db.close(); fs.rmSync(dir, { recursive: true, force: true }); })
  .catch(error => { console.error(error); process.exit(1); });
