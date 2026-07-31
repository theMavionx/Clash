const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-hermes-jobs-test-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.CLASH_HERMES_JOBS_ENABLED = '0';

const worker = require('./hermes_jobs_worker');
const db = require('./db');
const hermesJobs = require('./hermes_jobs');

(async () => {
  assert.equal(worker.isSqliteBusy(Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' })), true);
  assert.equal(worker.isSqliteBusy(new Error('database is busy')), true);
  assert.equal(worker.isSqliteBusy(new Error('network timeout')), false);

  let attempts = 0;
  const waits = [];
  const warnings = [];
  const result = await worker.withSqliteBusyRetry(() => {
    attempts += 1;
    if (attempts < 3) {
      throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    }
    return 'claimed';
  }, {
    delays: [5, 10, 20],
    sleep: async ms => { waits.push(ms); },
    warn: payload => { warnings.push(payload); },
  });
  assert.equal(result, 'claimed');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [5, 10]);
  assert.deepEqual(warnings.map(row => row.attempt), [1, 2]);

  let nonBusyAttempts = 0;
  await assert.rejects(
    worker.withSqliteBusyRetry(() => {
      nonBusyAttempts += 1;
      throw new Error('invalid job payload');
    }, {
      delays: [1, 1],
      sleep: async () => {},
      warn: () => {},
    }),
    /invalid job payload/,
  );
  assert.equal(nonBusyAttempts, 1, 'non-SQLite failures must not be retried');

  db.db.prepare('INSERT INTO players (id, name, token) VALUES (?, ?, ?)').run(
    'player-1',
    'HermesWorkerTest',
    'hermes-worker-test-token',
  );
  const firstJob = hermesJobs.createJob('player-1', {
    status: 'active',
    instruction: 'Watch BTC without trading.',
  });
  const secondJob = hermesJobs.createJob('player-1', {
    status: 'active',
    instruction: 'Watch ETH without trading.',
  });
  assert.equal(firstJob.ok, true);
  assert.equal(secondJob.ok, true);
  db.db.prepare(`
    UPDATE hermes_jobs
    SET next_run_at = datetime('now'), locked_until = NULL, locked_by = NULL
  `).run();
  const claimed = hermesJobs.claimDueJobs('worker-a', 2);
  assert.equal(claimed.length, 2);
  assert.equal(hermesJobs.claimDueJobs('worker-b', 2).length, 0);
  const lockedRows = db.db.prepare(`
    SELECT COUNT(*) AS count
    FROM hermes_jobs
    WHERE locked_by = 'worker-a' AND locked_until IS NOT NULL
  `).get();
  assert.equal(lockedRows.count, 2, 'the atomic claim must lease the complete returned batch');

  console.log('Hermes jobs atomic claim and SQLite busy retry tests passed');
})().finally(() => {
  try { db.db.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
