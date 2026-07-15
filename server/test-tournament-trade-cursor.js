'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const { loadIncrementalTournamentTrades } = require('./tournament_trade_sync');

const fdb = new Database(':memory:');
fdb.exec(`
  CREATE TABLE trade_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    dex TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    amount TEXT NOT NULL,
    notional_usd REAL NOT NULL DEFAULT 0,
    pnl TEXT,
    status TEXT NOT NULL,
    verified_source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_trade_history_player_dex ON trade_history(player_id, dex, id);
  CREATE INDEX idx_trade_history_player_dex_updated ON trade_history(player_id, dex, updated_at, id);
`);

const insert = fdb.prepare(`
  INSERT INTO trade_history (
    player_id, dex, symbol, side, amount, notional_usd, pnl,
    status, verified_source, created_at, updated_at
  ) VALUES ('player-a', 'ostium', 'BTC', 'long', '1', ?, ?, ?, ?, ?, ?)
`);
insert.run(50, '0', 'filled', 'ostium_api', '2026-06-30 23:59:00', '2026-06-30 23:59:00.000');
insert.run(100, '0', 'filled', 'ostium_api', '2026-07-02 10:00:00', '2026-07-02 10:00:00.000');
insert.run(200, '0', 'filled', 'ostium_api', '2026-07-03 10:00:00', '2026-07-03 10:00:00.000');
insert.run(999, '0', 'filled', 'client', '2026-07-03 11:00:00', '2026-07-03 11:00:00.000');

const base = {
  fdb,
  playerId: 'player-a',
  dex: 'ostium',
  sourceWhere: "verified_source = 'ostium_api'",
  startAt: '2026-07-01 00:00:00',
  endAt: '2026-07-31 00:00:00',
  pageSize: 1,
};

const bootstrap = loadIncrementalTournamentTrades(base);
assert.deepStrictEqual(bootstrap.rows.map((row) => row.id), [2, 3]);
assert.strictEqual(bootstrap.newRows, 2);
assert.strictEqual(bootstrap.reconciledRows, 0);
assert.strictEqual(bootstrap.cursor.last_trade_id, 3);
assert.strictEqual(bootstrap.cursor.last_updated_at, '2026-07-03 10:00:00.000');

const state = {
  last_trade_id: bootstrap.cursor.last_trade_id,
  last_updated_at: bootstrap.cursor.last_updated_at,
  last_updated_trade_id: bootstrap.cursor.last_updated_trade_id,
};
const unchanged = loadIncrementalTournamentTrades({ ...base, state });
assert.strictEqual(unchanged.rows.length, 0);
assert.strictEqual(unchanged.newRows, 0);
assert.strictEqual(unchanged.reconciledRows, 0);

insert.run(300, '0', 'filled', 'ostium_api', '2026-07-04 10:00:00', '2026-07-04 10:00:00.000');
const withNewFill = loadIncrementalTournamentTrades({ ...base, state });
assert.deepStrictEqual(withNewFill.rows.map((row) => row.id), [5]);
assert.strictEqual(withNewFill.newRows, 1);
assert.strictEqual(withNewFill.cursor.last_trade_id, 5);

const afterNewState = {
  last_trade_id: withNewFill.cursor.last_trade_id,
  last_updated_at: withNewFill.cursor.last_updated_at,
  last_updated_trade_id: withNewFill.cursor.last_updated_trade_id,
};
fdb.prepare(`
  UPDATE trade_history
  SET pnl = '7.5', updated_at = '2026-07-05 09:00:00.000'
  WHERE id = 2
`).run();
const withDelayedPnl = loadIncrementalTournamentTrades({ ...base, state: afterNewState });
assert.deepStrictEqual(withDelayedPnl.rows.map((row) => row.id), [2]);
assert.strictEqual(withDelayedPnl.newRows, 0);
assert.strictEqual(withDelayedPnl.reconciledRows, 1);
assert.strictEqual(withDelayedPnl.rows[0].pnl, '7.5');

// Production historically mixed SQLite timestamps (`YYYY-MM-DD HH:mm:ss`)
// with ISO cursors (`YYYY-MM-DDTHH:mm:ssZ`). Compare them as instants, not text.
const isoCursorState = {
  last_trade_id: withNewFill.cursor.last_trade_id,
  last_updated_at: '2026-07-15T12:30:09.000Z',
  last_updated_trade_id: withNewFill.cursor.last_updated_trade_id,
};
fdb.prepare(`
  UPDATE trade_history
  SET pnl = '8.5', updated_at = '2026-07-15 14:39:56.916'
  WHERE id = 2
`).run();
const withMixedTimestampFormats = loadIncrementalTournamentTrades({ ...base, state: isoCursorState });
assert.deepStrictEqual(withMixedTimestampFormats.rows.map((row) => row.id), [2]);
assert.strictEqual(withMixedTimestampFormats.reconciledRows, 1);
assert.strictEqual(withMixedTimestampFormats.rows[0].pnl, '8.5');

// New rows still obey source eligibility, but an already-credited historical
// row must remain reconcilable even if the current source filter excludes it.
const creditedExceptionState = {
  last_trade_id: 4,
  last_updated_at: '2026-07-15T15:00:00.000Z',
  last_updated_trade_id: 4,
};
fdb.prepare(`
  UPDATE trade_history
  SET pnl = '-2.5', updated_at = '2026-07-15 15:01:00.000'
  WHERE id = 4
`).run();
const creditedException = loadIncrementalTournamentTrades({
  ...base,
  state: creditedExceptionState,
  creditedTradeIds: ['4'],
});
assert.deepStrictEqual(creditedException.rows.map((row) => row.id), [4, 5]);
assert.strictEqual(creditedException.rows.find((row) => row.id === 4).pnl, '-2.5');

// A legacy credit can predate joined_at after an explicit/manual correction.
// Keep its ledger row reconcilable without admitting a new pre-window trade.
const creditedOutsideWindowState = {
  last_trade_id: 5,
  last_updated_at: '2026-07-15T15:01:00.000Z',
  last_updated_trade_id: 5,
};
fdb.prepare(`
  UPDATE trade_history
  SET pnl = '-3.5', updated_at = '2026-07-15 15:02:00.000'
  WHERE id = 1
`).run();
const creditedOutsideWindow = loadIncrementalTournamentTrades({
  ...base,
  state: creditedOutsideWindowState,
  creditedTradeIds: ['1'],
});
assert.deepStrictEqual(creditedOutsideWindow.rows.map((row) => row.id), [1]);
assert.strictEqual(creditedOutsideWindow.rows[0].pnl, '-3.5');

fdb.close();
console.log('tournament trade cursor: ok');
