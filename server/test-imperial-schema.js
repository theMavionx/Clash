'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDb = path.join(os.tmpdir(), `clash-imperial-main-schema-${process.pid}-${Date.now()}.sqlite`);
process.env.CLASH_MAIN_DB = tempDb;
process.env.NODE_ENV = 'development';

const mainDb = require('./db');

try {
  const inserted = mainDb.db.prepare(`
    INSERT INTO tournaments (name, dex, start_at)
    VALUES ('Imperial schema check', 'imperial', datetime('now'))
  `).run();
  const row = mainDb.db.prepare('SELECT dex FROM tournaments WHERE id = ?').get(inserted.lastInsertRowid);
  assert.equal(row?.dex, 'imperial');
  console.log('Imperial fresh main DB tournament schema: ok');
} finally {
  try { mainDb.db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${tempDb}${suffix}`;
    try { if (fs.existsSync(candidate)) fs.unlinkSync(candidate); } catch {}
  }
}
