// One-shot migration: insert a town_hall for every player who is missing one.
// Without a town_hall row, findEnemyCandidates skips the account in matchmaking
// and the matchmaker reports "all bases shielded" even when 240+ accounts have
// no shield at all.
//
// Run on the production host:
//   sudo node /opt/clash/current/deploy/seed-town-halls.js
//   (or pass an explicit DB path: DB=/opt/clash/shared/server/clash.db node seed-town-halls.js)
//
// Idempotent — re-running after every player has a town_hall is a no-op.

const path = require('path');

const dbPath =
  process.env.DB
  || process.env.CLASH_DB
  || '/opt/clash/shared/server/clash.db';

const Database = require(
  process.env.BETTER_SQLITE
  || path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'),
);

const TH_HP = 3500;        // BUILDING_DEFS.town_hall.hp_levels[0]
const TH_FOOTPRINT = 4;    // 4x4 cell footprint
const GRID_SIZE = 27;      // canonical main island grid
const SEED_CENTER = 12;    // start near the middle and spiral outward

const db = new Database(dbPath);

const missing = db.prepare(`
  SELECT p.id
  FROM players p
  WHERE NOT EXISTS (
    SELECT 1 FROM buildings b
    WHERE b.player_id = p.id AND b.type = 'town_hall'
  )
`).all();

console.log(`[seed-town-halls] DB: ${dbPath}`);
console.log(`[seed-town-halls] Players missing town_hall: ${missing.length}`);
if (missing.length === 0) {
  console.log('[seed-town-halls] Nothing to do.');
  db.close();
  process.exit(0);
}

const fetchOccupiedCells = db.prepare(
  'SELECT grid_x, grid_z FROM buildings WHERE player_id = ? AND grid_index = 0',
);
const insertBuilding = db.prepare(`
  INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
  VALUES (?, 'town_hall', 1, ?, ?, 0, ?, ?)
`);

function makeSpiral() {
  const order = [];
  const seen = new Set();
  for (let r = 0; r <= GRID_SIZE; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = SEED_CENTER + dx;
        const z = SEED_CENTER + dz;
        if (x < 0 || z < 0) continue;
        if (x + TH_FOOTPRINT > GRID_SIZE || z + TH_FOOTPRINT > GRID_SIZE) continue;
        const key = `${x},${z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        order.push([x, z]);
      }
    }
  }
  return order;
}
const spiral = makeSpiral();

function fits(cells, x, z) {
  for (let dx = 0; dx < TH_FOOTPRINT; dx++) {
    for (let dz = 0; dz < TH_FOOTPRINT; dz++) {
      if (cells.has(`${x + dx},${z + dz}`)) return false;
    }
  }
  return true;
}

const result = db.transaction(() => {
  let seeded = 0;
  let skipped = 0;
  for (const { id } of missing) {
    const occupied = new Set();
    for (const c of fetchOccupiedCells.all(id)) {
      occupied.add(`${c.grid_x},${c.grid_z}`);
    }
    let placed = false;
    for (const [x, z] of spiral) {
      if (!fits(occupied, x, z)) continue;
      try {
        insertBuilding.run(id, x, z, TH_HP, TH_HP);
        seeded++;
        placed = true;
        break;
      } catch {
        // UNIQUE-constraint race or footprint clash with a building under a
        // different grid_index we don't track; fall through and try the next
        // candidate cell.
      }
    }
    if (!placed) skipped++;
  }
  return { missing: missing.length, seeded, skipped };
})();

console.log('[seed-town-halls]', result);
db.close();
