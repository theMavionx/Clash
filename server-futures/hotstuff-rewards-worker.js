const Database = require('better-sqlite3');
const path = require('path');
const hotstuff = require('./hotstuff');

const POLL_MS = Number(process.env.HOTSTUFF_REWARDS_POLL_MS || 2 * 60 * 1000);
const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');

async function importFillsForPlayer(playerId, wallet, opts = {}) {
  return hotstuff.importFillsForPlayer(playerId, wallet, opts);
}

async function pollOnce(mainDb) {
  const rows = mainDb.prepare(
    `SELECT id, wallet FROM players WHERE dex='hotstuff' AND wallet IS NOT NULL AND wallet != ''`
  ).all();
  if (!rows.length) return 0;
  let inserted = 0;
  for (const row of rows) {
    const wallet = String(row.wallet || '').trim();
    if (!hotstuff.isEvmAddress(wallet)) continue;
    try {
      const result = await importFillsForPlayer(row.id, wallet);
      inserted += result.imported || 0;
    } catch (e) {
      console.warn(`[hotstuff-rewards-worker] fill fetch failed for ${wallet.slice(0, 10)}:`, e.message);
    }
  }
  return inserted;
}

function start() {
  let mainDb;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.error('[hotstuff-rewards-worker] Cannot open main DB:', e.message, '- worker disabled.');
    return;
  }
  const tick = async () => {
    try {
      const n = await pollOnce(mainDb);
      if (n > 0) console.log(`[hotstuff-rewards-worker] Recorded ${n} Hotstuff trade row(s)`);
    } catch (e) {
      console.error('[hotstuff-rewards-worker] tick failed:', e?.message || e);
    }
  };
  tick();
  const iv = setInterval(tick, POLL_MS);
  iv.unref?.();
  console.log(`[hotstuff-rewards-worker] started (polling every ${POLL_MS / 1000}s)`);
}

module.exports = {
  start,
  pollOnce,
  importFillsForPlayer,
};
