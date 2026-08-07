const assert = require('assert');
const Database = require('better-sqlite3');
const {
  normalizeSnapshot,
  recordExchangeBalanceSnapshots,
  readExchangeBalanceMetrics,
} = require('./exchange_balance_metrics');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    dex TEXT,
    wallet TEXT
  );
  CREATE TABLE player_dex_accounts (
    player_id TEXT NOT NULL,
    dex TEXT NOT NULL,
    wallet_address TEXT,
    PRIMARY KEY (player_id, dex)
  );
  INSERT INTO players (id, name, dex, wallet) VALUES
    ('p1', 'Alice', 'ostium', '0xalice'),
    ('p2', 'Bob', 'ostium', '0xbob'),
    ('p3', 'Old user', 'decibel', '0xold');
  INSERT INTO player_dex_accounts (player_id, dex, wallet_address) VALUES
    ('p1', 'pacifica', 'AliceSolanaWallet');
`);

assert.equal(normalizeSnapshot({ dex: 'unknown', balance_usd: 1 }), null);
assert.equal(normalizeSnapshot({ dex: 'ostium' }), null);
assert.equal(normalizeSnapshot({ dex: 'ostium', balance_usd: -5 }).balanceUsd, 0);

recordExchangeBalanceSnapshots(db, 'p3', {
  dex: 'decibel', balance_usd: 500, available_usd: 450,
}, { now: '2026-07-01T10:00:00.000Z' });
recordExchangeBalanceSnapshots(db, 'p1', {
  dex: 'ostium', balance_usd: 100, available_usd: 80,
}, { now: '2026-08-07T12:01:00.000Z' });
recordExchangeBalanceSnapshots(db, 'p1', {
  dex: 'ostium', balance_usd: 120, available_usd: 90,
}, { now: '2026-08-07T12:34:00.000Z' });
const deduped = recordExchangeBalanceSnapshots(db, 'p1', [
  { dex: 'pacifica', balance_usd: 5, available_usd: 5 },
  { dex: 'pacifica', balance_usd: 0, available_usd: 0 },
], { now: '2026-08-07T12:35:00.000Z' });
assert.equal(deduped.stored, 1, 'a batch must write each exchange only once');
recordExchangeBalanceSnapshots(db, 'p2', {
  dex: 'ostium', balance_usd: 300, available_usd: 250,
}, { now: '2026-08-07T11:00:00.000Z' });

const sameHourSnapshots = db.prepare(`
  SELECT COUNT(*) AS count
  FROM exchange_balance_snapshots
  WHERE player_id = 'p1' AND dex = 'ostium'
`).get().count;
assert.equal(sameHourSnapshots, 1, 'same-hour snapshots must be upserted');

const metrics = readExchangeBalanceMetrics(db, {
  days: 30,
  now: '2026-08-07T13:00:00.000Z',
});
assert.deepEqual(metrics.summary, {
  tracked_accounts: 3,
  tracked_players: 2,
  positive_accounts: 2,
  positive_players: 2,
  fresh_24h_accounts: 3,
  total_positive_balance_usd: 420,
  average_positive_account_usd: 210,
  average_positive_player_usd: 210,
});

const ostium = metrics.by_dex.find((row) => row.dex === 'ostium');
assert.equal(ostium.tracked_accounts, 2);
assert.equal(ostium.positive_accounts, 2);
assert.equal(ostium.total_positive_balance_usd, 420);
assert.equal(ostium.average_positive_balance_usd, 210);
assert.equal(ostium.max_balance_usd, 300);

const pacifica = metrics.by_dex.find((row) => row.dex === 'pacifica');
assert.equal(pacifica.tracked_accounts, 1);
assert.equal(pacifica.positive_accounts, 0);
assert.equal(pacifica.average_positive_balance_usd, 0);

const alice = metrics.by_player.find((row) => row.player_id === 'p1');
assert.equal(alice.total_balance_usd, 120);
assert.equal(alice.total_available_usd, 90);
assert.equal(alice.positive_dexes, 1);
assert.equal(metrics.accounts.find((row) => row.dex === 'pacifica').wallet_address, 'AliceSolanaWallet');
assert.equal(metrics.accounts.some((row) => row.player_id === 'p3'), false, 'old latest rows must respect max age');

db.close();
console.log('exchange balance metrics tests passed');
