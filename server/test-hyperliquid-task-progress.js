const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-hyperliquid-task-test-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.CLASH_FUTURES_DB = path.join(tempDir, 'futures.db');

const tasks = require('./tasks');
const mainDb = require('./db');

(async () => {
  const result = await tasks.verifyTask(
    { id: 'player-1', name: 'TramoJx', dex: 'hyperliquid' },
    {
      id: 7,
      type: 'positions',
      repeatable: 0,
      params: JSON.stringify({
        symbol: 'CHIP',
        side: 'short',
        target_positions: 1,
        count_close: false,
      }),
    },
    {
      dex: 'hyperliquid',
      start_time: '2026-07-21T12:53:07.585Z',
      trade_id_start: 0,
    },
    {
      prefetchedTrades: [
        {
          history_id: 1,
          dex: 'hyperliquid',
          symbol: 'CHIP',
          side: 'short',
          order_id: 456,
          client_order_id: 'hyperliquid:test:123',
          created_at: '2026-07-21T12:54:15.938Z',
        },
        {
          history_id: 2,
          dex: 'hyperliquid',
          symbol: 'CHIP',
          side: 'close_short',
          order_id: 457,
          client_order_id: 'hyperliquid:test:124',
          created_at: '2026-07-21T12:56:16.050Z',
        },
      ],
    },
  );

  assert.equal(result.progress_value, 1);
  assert.equal(result.target_value, 1);
  assert.equal(result.completed, true);
  console.log('Hyperliquid CHIP task progress test passed');
})().finally(() => {
  try { mainDb.db.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
