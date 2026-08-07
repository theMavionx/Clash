const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `clash-log-ai-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
process.env.CLASH_LOG_AI_MODEL = 'test/provider-model';

const analyzer = require('./log_ai_analyzer');
const db = require('./db');

async function main() {
  const insert = db.db.prepare(`
    INSERT INTO client_logs (level, source, message, created_at)
    VALUES (?, ?, ?, ?)
  `);
  insert.run('error', 'fetch', 'fetch POST /rpc/solana -> 429', '2026-08-07 10:00:00');
  insert.run('error', 'fetch', 'fetch POST /rpc/solana -> 429', '2026-08-07 10:01:00');
  insert.run('error', 'godot.render', 'ERROR: Parameter "material" is null.', '2026-08-07 10:02:00');
  insert.run('warn', 'console.warn', 'AudioContext was not allowed to start', '2026-08-07 10:03:00');
  insert.run('warn', 'console.warn', 'Bulk API 500: HTTP 500', '2026-08-07 10:04:00');

  const counts = analyzer.collectSourceCounts(
    '2026-08-07 00:00:00',
    '2026-08-08 00:00:00',
    [],
  );
  assert.equal(counts.client_errors, 3);
  assert.equal(counts.client_warnings, 2);

  let providerCalls = 0;
  const report = await analyzer.runLogAiAnalysis({
    windowStart: '2026-08-07T00:00:00.000Z',
    windowEnd: '2026-08-08T00:00:00.000Z',
    limit: 1,
    callProvider: async () => {
      providerCalls += 1;
      throw new Error('This request requires more credits; can only afford 58 tokens.');
    },
  });

  assert.equal(providerCalls, 1, 'credit exhaustion must not fan out across the model chain');
  assert.equal(report.status, 'ok');
  assert.equal(report.model, 'local/incident-cluster-v1');
  assert.equal(report.source_counts.client_errors, 3, 'full SQL count must not be capped by evidence limit');
  assert.equal(report.source_counts.client_warnings, 2);
  assert.equal(report.report_json.analyzer.mode, 'local_fallback');
  assert.match(report.report_markdown, /Clash Daily Operations Report/);
  assert.match(report.error, /more credits/);

  console.log('log AI analyzer fallback tests passed');
}

main().finally(() => {
  try { db.db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(`${dbPath}${suffix}`); } catch {}
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
