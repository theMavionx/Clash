'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const tradeRecon = require('./trade_reconciliation');
const db = new Database(':memory:');
db.exec(`CREATE TABLE trade_history (
  id INTEGER PRIMARY KEY, player_id TEXT, dex TEXT, status TEXT, verified_source TEXT,
  client_order_id TEXT, proof_json TEXT, notional_usd REAL, created_at TEXT,
  symbol TEXT, side TEXT, amount TEXT, price TEXT, fee TEXT, order_id TEXT);
  CREATE INDEX idx_trade_history_player_dex ON trade_history(player_id,dex,id);`);
const insert = db.prepare(`INSERT INTO trade_history VALUES
  (@id,@player,@dex,@status,@source,@client,@proof,100,@created,'SOL','long','1','100','0.01',NULL)`);
const code = String(process.env.IMPERIAL_BUILDER_CODE || 'CLASH').toUpperCase();
let nextId = 1;
function add(overrides = {}) {
  const id = nextId++;
  const { wallet = 'wallet', profile = 0, action = `action-${id}`, signature = `execution-${id}`,
    legacy = false, rawTx = false, unique = false, proof: supplied, ...row } = overrides;
  const proof = supplied ?? { builderCode: code, signature: 'submit',
    ...(legacy ? { execution: { id: action, [rawTx ? 'txSignature' : 'tx2Signature']: signature } }
      : { wallet, profileIndex: profile, executionId: action, executionSignature: signature,
        executionSignatureUnique: unique }) };
  insert.run({ id, player: 'player', dex: 'imperial', status: 'filled', source: 'imperial_api',
    client: `imperial:${wallet}:${profile}:submit:${id}`, created: '2026-09-05 12:00:00',
    ...row, proof: typeof proof === 'string' ? proof : JSON.stringify(proof) });
  return id;
}
const predicate = tradeRecon.verifiedSourceClauseForDex('imperial');
const eligible = (extra = '', ...params) => db.prepare(`SELECT id FROM trade_history
  WHERE dex='imperial' AND status='filled' AND ${predicate} ${extra} ORDER BY id`)
  .all(...params).map(row => row.id);
const has = (id) => eligible('AND id = ?', id).includes(id);

// Array order changed: preserve the earliest imported row, even across cursors/windows.
const original = add({ legacy: true, action: 'stable-open', signature: 'final-open' });
const shifted = add({ legacy: true, action: 'stable-open', signature: 'final-open', created: '2026-09-06 12:00:00' });
const canonical = add({ action: 'stable-open', signature: 'final-open' });
assert(has(original)); assert(!has(shifted)); assert(!has(canonical));
assert.deepEqual(eligible('AND id > ?', original), []);
assert.deepEqual(eligible("AND created_at >= '2026-09-06'"), []);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM trade_history').get().n, 3, 'no row rewrites/deletions');

// Distinct accounts, profiles, owners and action IDs remain independent.
for (const change of [{ wallet: 'other' }, { profile: 1 }, { player: 'other-player' }, { action: 'other-open' }]) {
  assert(has(add({ action: 'stable-open', signature: 'final-open', ...change })));
}
// Wrong/incomplete predecessors cannot suppress a later eligible fill.
for (const change of [{ source: 'server' }, { status: 'pending' },
  { proof: { builderCode: 'OTHER', signature: 'submit', executionId: 'blocked', wallet: 'wallet', profileIndex: 0 } },
  { proof: '{malformed' }]) {
  const action = `valid-${nextId}`;
  const bad = add({ action, ...change });
  const good = add({ action });
  assert(!has(bad)); assert(has(good));
}
const wrongBuilder = add({ proof: { builderCode: 'OTHER', signature: 'submit',
  wallet: 'wallet', profileIndex: 0, executionId: 'builder-check', executionSignature: 'builder-final' } });
assert(!has(wrongBuilder));
assert(has(add({ action: 'builder-check', signature: 'builder-final' })));

// Missing IDs require provider single-execution attestation for signature dedup.
const noId = add({ legacy: true, action: null, signature: 'single-final', rawTx: true });
const attested = add({ action: null, signature: 'single-final', unique: true });
assert(has(noId)); assert(!has(attested));
const unprovenA = add({ action: null, signature: 'unproven-final' });
const unprovenB = add({ action: null, signature: 'unproven-final' });
assert(has(unprovenA)); assert(has(unprovenB), 'do not invent identity from a submission or unproven signature');
const submittedA = add({ action: null, signature: null, unique: true });
const submittedB = add({ action: null, signature: null, unique: true });
assert(has(submittedA)); assert(has(submittedB), 'same submit signature is never the execution key');

// An ID-less row cannot bridge two distinct actions sharing a final transaction.
const ambiguous = add({ action: null, signature: 'multi-final', unique: true });
const firstAction = add({ action: 'multi-A', signature: 'multi-final' });
const secondAction = add({ action: 'multi-B', signature: 'multi-final' });
assert(!has(ambiguous)); assert(has(firstAction)); assert(has(secondAction));
assert(!has(add({ action: 'multi-A', signature: 'multi-final' })));

// Repeated claim/volume/referral consumers observe the same canonical records.
const before = db.prepare('SELECT total_changes() AS n').get().n;
const expected = eligible();
assert.deepEqual(eligible(), expected);
assert.equal(db.prepare('SELECT total_changes() AS n').get().n, before);
const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM trade_history WHERE ${predicate}`).all();
assert(plan.some(row => /imperial_earlier.*idx_trade_history_player_dex/.test(row.detail)), 'predecessor uses scoped ID index');

// Execute the actual protected referral selector, not a copied approximation.
const routeSource = fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8');
const start = routeSource.indexOf('function futuresRowsForReferralSync(');
const end = routeSource.indexOf('\nfunction syncExactReferralFuturesEarnings(', start);
assert(start >= 0 && end > start);
const untouchedVenue = add({ dex: 'grvt', source: 'grvt_builder' });
const snapshot = db.serialize();
function FixtureSqlite() { return new Database(snapshot); }
const referralRows = vm.runInNewContext(`${routeSource.slice(start, end)}\nfuturesRowsForReferralSync();`, {
  fs: { existsSync: () => true }, path, __dirname,
  process: { env: { CLASH_FUTURES_DB: 'fixture.sqlite' } }, tradeRecon,
  require(name) { assert.equal(name, 'better-sqlite3'); return FixtureSqlite; },
});
assert.deepEqual(Array.from(referralRows, row => row.id).sort((a,b) => a-b), [...expected, untouchedVenue],
  'referral selector must apply the same CLASH proof + execution dedup as Gold/tournaments');
db.close();
console.log('Imperial execution eligibility: canonical legacy/new IDs, cursors, scopes, signatures, ambiguity, index and actual referral SQL passed.');
