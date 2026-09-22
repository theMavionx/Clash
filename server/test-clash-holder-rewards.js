"use strict";

const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createClashHolderRewardsService, holdingUsdMicros, goldForUsdMicros } = require('./clash_holder_rewards');

const walletA = '0x1111111111111111111111111111111111111111';
const walletB = '0x2222222222222222222222222222222222222222';
const tokenWei = amount => (BigInt(amount) * 10n ** 18n).toString();

assert.equal(holdingUsdMicros(tokenWei(250000), '0.0002'), 50_000_000);
assert.equal(holdingUsdMicros(tokenWei(250000), '0.0001995'), 49_875_000);
assert.equal(goldForUsdMicros(49_999_999), 0);
assert.equal(goldForUsdMicros(50_000_000), 1000);
assert.equal(goldForUsdMicros(99_999_999), 1000);
assert.equal(goldForUsdMicros(100_000_000), 5000);
assert.equal(goldForUsdMicros(499_999_999), 5000);
assert.equal(goldForUsdMicros(500_000_000), 10000);

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE players (id TEXT PRIMARY KEY, gold INTEGER NOT NULL, wood INTEGER NOT NULL,
    ore INTEGER NOT NULL, is_bot INTEGER NOT NULL DEFAULT 0, last_activity_at TEXT);
  INSERT INTO players (id,gold,wood,ore) VALUES ('p1',4000,0,0),('p2',0,0,0);
  CREATE TABLE clash_holder_wallets (player_id TEXT PRIMARY KEY, wallet TEXT NOT NULL UNIQUE,
    verified_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE clash_holder_observations (id INTEGER PRIMARY KEY, player_id TEXT, wallet TEXT,
    observed_day_utc TEXT, sample_bucket INTEGER, balance_wei TEXT, price_pico TEXT,
    usd_micros INTEGER, block_number INTEGER, observed_at TEXT,
    UNIQUE(wallet,observed_day_utc,sample_bucket));
  CREATE TABLE clash_holder_daily_rewards (id INTEGER PRIMARY KEY, player_id TEXT, wallet TEXT,
    reward_day_utc TEXT, minimum_usd_micros INTEGER, sample_count INTEGER,
    reward_gold INTEGER, claimed_gold INTEGER NOT NULL DEFAULT 0, status TEXT,
    claimed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id,reward_day_utc), UNIQUE(wallet,reward_day_utc));
  CREATE TABLE clash_holder_snapshot_events (id INTEGER PRIMARY KEY, player_id TEXT, wallet TEXT,
    observed_day_utc TEXT, sample_bucket INTEGER, result TEXT, error TEXT, block_number INTEGER);
  CREATE TABLE resource_delta_events (player_id TEXT, source_type TEXT, gold_delta INTEGER,
    wood_delta INTEGER, ore_delta INTEGER, gold_before INTEGER, wood_before INTEGER,
    ore_before INTEGER, gold_after INTEGER, wood_after INTEGER, ore_after INTEGER,
    gold_cap_before INTEGER, wood_cap_before INTEGER, ore_cap_before INTEGER,
    gold_cap_after INTEGER, wood_cap_after INTEGER, ore_cap_after INTEGER,
    lost_gold_to_cap INTEGER, lost_wood_to_cap INTEGER, lost_ore_to_cap INTEGER,
    metadata_json TEXT);
`);

let clock = Date.parse('2026-09-22T00:05:00Z');
let held = tokenWei(500000);
let price = '0.0002';
let rolloverRead = false;
const service = createClashHolderRewardsService({
  db, now: () => clock, getResourceCaps: () => ({ gold: 4500 }),
  readBalance: async () => {
    if (rolloverRead) clock = Date.parse('2026-09-25T00:00:01Z');
    return { balanceWei: held, blockNumber: 12345 };
  },
  readPrice: async () => price,
});

(async () => {
  assert.equal(service.linkWallet({ playerId: 'p1', wallet: walletA.toUpperCase().replace('0X', '0x') }), walletA);
  assert.throws(() => service.linkWallet({ playerId: 'p2', wallet: walletA }), { code: 'WALLET_ALREADY_LINKED' });
  await service.recordObservation({ playerId: 'p1', wallet: walletA }); // $100
  held = tokenWei(250000);
  clock = Date.parse('2026-09-22T00:12:00Z');
  await service.recordObservation({ playerId: 'p1', wallet: walletA }); // same bucket falls to $50
  assert.equal(db.prepare('SELECT usd_micros FROM clash_holder_observations').get().usd_micros, 50_000_000);
  held = tokenWei(2_500_000);
  clock = Date.parse('2026-09-22T08:05:00Z');
  await service.recordObservation({ playerId: 'p1', wallet: walletA }); // $500 later cannot raise daily minimum
  assert.throws(() => service.linkWallet({ playerId: 'p1', wallet: walletB }), { code: 'WALLET_SWITCH_LOCKED' });
  assert.equal(service.status({ playerId: 'p1' }).today.projected_gold, 1000);
  assert.equal(service.status({ playerId: 'p1' }).pending_gold, 0, 'today cannot be claimed early');

  clock = Date.parse('2026-09-23T00:00:01Z');
  assert.equal(service.status({ playerId: 'p1' }).pending_gold, 1000, 'yesterday matures at UTC midnight');
  assert.equal(service.status({ playerId: 'p1' }).claimable_now, 500, 'storage capacity is enforced');
  assert.equal(service.claim({ playerId: 'p1' }).claimed_gold, 500);
  assert.equal(service.status({ playerId: 'p1' }).pending_gold, 500);
  assert.equal(db.prepare('SELECT gold FROM players WHERE id = ?').get('p1').gold, 4500);
  assert.throws(() => service.claim({ playerId: 'p1' }), { code: 'GOLD_STORAGE_FULL' });
  db.prepare('UPDATE players SET gold = 4000 WHERE id = ?').run('p1');
  assert.equal(service.claim({ playerId: 'p1' }).claimed_gold, 500);
  assert.equal(service.status({ playerId: 'p1' }).pending_gold, 0);
  assert.throws(() => service.claim({ playerId: 'p1' }), { code: 'NOTHING_TO_CLAIM' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM resource_delta_events').get().n, 2);
  assert.equal(db.prepare('SELECT SUM(gold_delta) AS total FROM resource_delta_events').get().total, 1000);

  // A newly selected wallet can only begin a new UTC day's observations.
  assert.equal(service.linkWallet({ playerId: 'p1', wallet: walletB }), walletB);
  clock = Date.parse('2026-09-23T12:00:00Z');
  await service.recordObservation({ playerId: 'p1', wallet: walletB });
  clock = Date.parse('2026-09-24T00:01:00Z');
  assert.equal(service.status({ playerId: 'p1' }).pending_gold, 0, 'one sample cannot earn a full-day reward');

  // Scheduler independently rechecks after a user refresh, while a repeated
  // reading never raises the already-recorded minimum in that bucket.
  clock = Date.parse('2026-09-24T01:00:00Z');
  const first = await service.snapshotAllEligiblePlayers();
  const second = await service.snapshotAllEligiblePlayers();
  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal(second.attempted, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM clash_holder_snapshot_events').get().n, 2);
  clock = Date.parse('2026-09-24T23:59:59Z');
  rolloverRead = true;
  const rollover = await service.recordObservation({ playerId: 'p1', wallet: walletB });
  assert.equal(rollover.day, '2026-09-25', 'slow RPC reads must not count towards the previous UTC day');
  db.close();
  console.log('CLASH holder rewards PASS: exact tiers, UTC maturity, minimum holding, wallet lock, storage-safe claims, midnight crossover and snapshot dedupe');
})().catch(error => { console.error(error); process.exitCode = 1; });
