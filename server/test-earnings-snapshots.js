'use strict';

const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const earnings = require('./earnings');

const {
  ensureEarningsSnapshots,
  earningsSnapshotBucket,
  recordEarningsSnapshots,
  readEarningsSnapshotHistory,
} = earnings._test;

function row(earnedUsd, extra = {}) {
  return {
    ok: true,
    earned_usd: earnedUsd,
    currency: 'USDC',
    source: 'snapshot-test',
    source_detail: 'cumulative-test-source',
    model: 'cumulative-test',
    ...extra,
  };
}

function record(db, dex, capturedAt, earnedUsd, extra = {}) {
  return recordEarningsSnapshots(db, { [dex]: row(earnedUsd, extra) }, new Date(capturedAt));
}

function main() {
  const db = new Database(':memory:');
  ensureEarningsSnapshots(db);
  const now = new Date('2026-08-02T12:30:00.000Z');

  assert.equal(earningsSnapshotBucket('2026-08-02T12:59:59.999Z'), '2026-08-02T12:00:00.000Z');

  record(db, 'pacifica', '2026-07-03T12:00:00.000Z', 100);
  record(db, 'pacifica', '2026-07-27T12:00:00.000Z', 104);
  record(db, 'pacifica', '2026-07-30T12:00:00.000Z', 106);
  record(db, 'pacifica', '2026-08-01T11:00:00.000Z', 109);
  record(db, 'pacifica', '2026-08-01T13:00:00.000Z', 110);
  record(db, 'pacifica', '2026-08-02T10:00:00.000Z', 112);
  record(db, 'pacifica', '2026-08-02T11:00:00.000Z', 5); // claim/reset, never negative income
  record(db, 'pacifica', '2026-08-02T12:15:00.000Z', 7);
  record(db, 'pacifica', '2026-08-02T12:25:00.000Z', 8); // same hour replaces the earlier sample

  record(db, 'decibel', '2026-07-31T12:00:00.000Z', 10);
  record(db, 'decibel', '2026-08-02T12:00:00.000Z', 11);

  record(db, 'risex', '2026-07-31T12:00:00.000Z', 0, {
    estimated_fee_usd: 0.1,
    snapshot_value_kind: 'estimate',
    snapshot_cumulative_usd: 0.1,
    exact_unavailable: true,
  });
  record(db, 'risex', '2026-08-02T12:00:00.000Z', 0, {
    estimated_fee_usd: 0.2,
    snapshot_value_kind: 'estimate',
    snapshot_cumulative_usd: 0.2,
    exact_unavailable: true,
  });

  const skipped = recordEarningsSnapshots(db, {
    risex: row(99, { stale: true }),
  }, now);
  assert.equal(skipped.recorded, 0, 'stale provider values must not become snapshots');

  const history = readEarningsSnapshotHistory(db, { days: 30, now });
  const pacifica = history.dexes.pacifica;
  const decibel = history.dexes.decibel;
  const risex = history.dexes.risex;

  assert.equal(pacifica.current_cumulative_usd, 8);
  assert.equal(pacifica.d1.earned_usd, 6);
  assert.equal(pacifica.d7.earned_usd, 15);
  assert.equal(pacifica.d30.earned_usd, 15);
  assert.equal(pacifica.d1.reset_count, 1);
  assert.equal(pacifica.d1.complete, true);
  assert.equal(pacifica.stored_snapshot_count, 8, 'one hourly bucket must contain one latest sample');

  const aug2 = pacifica.daily.find((day) => day.date === '2026-08-02');
  assert.deepEqual(
    {
      earned_usd: aug2.earned_usd,
      snapshot_count: aug2.snapshot_count,
      reset_count: aug2.reset_count,
      closing_cumulative_usd: aug2.closing_cumulative_usd,
    },
    { earned_usd: 5, snapshot_count: 3, reset_count: 1, closing_cumulative_usd: 8 },
  );

  assert.equal(decibel.d1.earned_usd, 1);
  assert.equal(decibel.d7.earned_usd, 1);
  assert.equal(decibel.d30.earned_usd, 1);
  assert.equal(risex.d1.earned_usd, 0.1);
  assert.equal(risex.d30.earned_usd, 0.1);
  assert.equal(risex.d30.value_kind, 'estimate');
  assert.equal(risex.current_cumulative_usd, 0.2);
  assert.equal(history.windows.d1.earned_usd, 7);
  assert.equal(history.windows.d7.earned_usd, 16);
  assert.equal(history.windows.d30.earned_usd, 16);
  assert.equal(history.windows.d1.estimated_usd, 0.1);
  assert.equal(history.windows.d7.estimated_usd, 0.1);
  assert.equal(history.windows.d30.estimated_usd, 0.1);
  assert.equal(history.method, 'positive_delta_of_cumulative_snapshots');
  assert.equal(history.daily.length, 30 * earnings._test.earningsDexOrder().length);

  db.close();
  console.log('EARNINGS_SNAPSHOT_TEST_PASS');
}

main();
