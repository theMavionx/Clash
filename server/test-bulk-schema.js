const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDb = path.join(os.tmpdir(), `clash-bulk-main-schema-${process.pid}-${Date.now()}.sqlite`);
process.env.CLASH_MAIN_DB = tempDb;
process.env.NODE_ENV = 'development';

const mainDb = require('./db');

try {
  const inserted = mainDb.db.prepare(`
    INSERT INTO tournaments (name, dex, start_at)
    VALUES ('Bulk schema check', 'bulk', datetime('now'))
  `).run();
  const row = mainDb.db.prepare('SELECT dex FROM tournaments WHERE id = ?').get(inserted.lastInsertRowid);
  assert.equal(row?.dex, 'bulk');
  console.log('Bulk fresh main DB tournament schema: ok');
} finally {
  try { mainDb.db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${tempDb}${suffix}`;
    try { if (fs.existsSync(candidate)) fs.unlinkSync(candidate); } catch {}
  }
}
