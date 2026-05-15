// One-shot: randomly drop shield_until on ~50% of currently-shielded players.
// Used to free up the matchmaker pool when too many bases are sitting under
// the auto-applied 6h post-raid shield. Idempotent in the sense that it only
// touches players whose shield is still live; expired shields are ignored.

const Database = require(
  process.env.BETTER_SQLITE
  || '/opt/clash/current/server/node_modules/better-sqlite3',
);

const dbPath = process.env.DB || '/opt/clash/shared/server/clash.db';
const probability = Math.max(0, Math.min(1, Number(process.env.PROB || 0.5)));

const db = new Database(dbPath);

const shielded = db.prepare(
  "SELECT id, name FROM players WHERE shield_until IS NOT NULL AND shield_until > datetime('now')"
).all();
console.log('[clear-shields] DB:', dbPath, 'prob:', probability);
console.log('[clear-shields] Currently shielded:', shielded.length);

const toClear = shielded.filter(() => Math.random() < probability);
console.log('[clear-shields] Randomly clearing for:', toClear.length);

const upd = db.prepare('UPDATE players SET shield_until = NULL WHERE id = ?');
db.transaction(() => {
  for (const r of toClear) upd.run(r.id);
})();

const remaining = db.prepare(
  "SELECT COUNT(*) AS c FROM players WHERE shield_until IS NOT NULL AND shield_until > datetime('now')"
).get();
console.log('[clear-shields] Shielded remaining:', remaining.c);
db.close();
