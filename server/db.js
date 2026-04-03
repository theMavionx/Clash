const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'clash.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- Schema ----------

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    token      TEXT NOT NULL UNIQUE,
    gold       INTEGER NOT NULL DEFAULT 10000,
    wood       INTEGER NOT NULL DEFAULT 10000,
    ore        INTEGER NOT NULL DEFAULT 10000,
    trophies   INTEGER NOT NULL DEFAULT 0,
    level      INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS buildings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    grid_x      INTEGER NOT NULL,
    grid_z      INTEGER NOT NULL,
    grid_index  INTEGER NOT NULL DEFAULT 0,
    hp          INTEGER NOT NULL,
    max_hp      INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(player_id, grid_x, grid_z, grid_index)
  );

  CREATE TABLE IF NOT EXISTS troop_levels (
    player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    troop_type TEXT NOT NULL,
    level      INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (player_id, troop_type)
  );
`);

// Safe migrations
try { db.exec(`ALTER TABLE buildings ADD COLUMN last_collected_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN wallet TEXT`); } catch {}
try { db.exec(`ALTER TABLE buildings ADD COLUMN has_ship INTEGER NOT NULL DEFAULT 0`); } catch {}
// Shield: protects from attacks after being raided
try { db.exec(`ALTER TABLE players ADD COLUMN shield_until TEXT`); } catch {}
// Attack cooldown: prevent re-attacking same player
try { db.exec(`ALTER TABLE players ADD COLUMN last_attacked_by TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN last_attacked_at TEXT`); } catch {}

// Attack sessions table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attack_sessions (
      id            TEXT PRIMARY KEY,
      attacker_id   TEXT NOT NULL REFERENCES players(id),
      defender_id   TEXT NOT NULL REFERENCES players(id),
      status        TEXT NOT NULL DEFAULT 'active',
      troops_deployed TEXT NOT NULL DEFAULT '{}',
      buildings_destroyed TEXT NOT NULL DEFAULT '[]',
      loot_gold     INTEGER NOT NULL DEFAULT 0,
      loot_wood     INTEGER NOT NULL DEFAULT 0,
      loot_ore      INTEGER NOT NULL DEFAULT 0,
      started_at    TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at      TEXT
    )
  `);
} catch {}

// ---------- Resource Production Definitions ----------

const PRODUCTION_DEFS = {
  mine:    { resource: 'ore',  rate: [10, 18, 30], max: [200, 400, 800] },   // per minute
  sawmill: { resource: 'wood', rate: [12, 22, 35], max: [250, 500, 1000] },
};

// ---------- Prepared Statements ----------

const stmts = {
  // Players
  createPlayer: db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore)
    VALUES (?, ?, ?, 10000, 10000, 10000)
  `),
  getPlayerByToken: db.prepare(`SELECT * FROM players WHERE token = ?`),
  getPlayerByName: db.prepare(`SELECT * FROM players WHERE name = ?`),
  getPlayerByWallet: db.prepare(`SELECT * FROM players WHERE wallet = ?`),
  getPlayerById: db.prepare(`SELECT * FROM players WHERE id = ?`),

  // Find enemy (closest trophies, not self)
  findEnemy: db.prepare(`
    SELECT id, name, trophies, level FROM players
    WHERE id != ?
      AND trophies >= 50
      AND (shield_until IS NULL OR shield_until < datetime('now'))
    ORDER BY ABS(trophies - ?) ASC
    LIMIT 1
  `),

  // Resources
  getResources: db.prepare(`SELECT gold, wood, ore FROM players WHERE id = ?`),
  updateResource: db.prepare(`UPDATE players SET gold = ?, wood = ?, ore = ? WHERE id = ?`),

  // Buildings
  placeBuilding: db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?)
  `),
  getBuildings: db.prepare(`SELECT * FROM buildings WHERE player_id = ?`),
  getBuildingById: db.prepare(`SELECT * FROM buildings WHERE id = ? AND player_id = ?`),
  upgradeBuilding: db.prepare(`
    UPDATE buildings SET level = ?, hp = ?, max_hp = ? WHERE id = ? AND player_id = ?
  `),
  removeBuilding: db.prepare(`DELETE FROM buildings WHERE id = ? AND player_id = ?`),
  updateBuildingHp: db.prepare(`UPDATE buildings SET hp = ? WHERE id = ? AND player_id = ?`),

  // Troop levels
  getTroopLevels: db.prepare(`SELECT troop_type, level FROM troop_levels WHERE player_id = ?`),
  upsertTroopLevel: db.prepare(`
    INSERT INTO troop_levels (player_id, troop_type, level)
    VALUES (?, ?, ?)
    ON CONFLICT(player_id, troop_type) DO UPDATE SET level = excluded.level
  `),

  // Trophies
  updateTrophies: db.prepare(`UPDATE players SET trophies = ? WHERE id = ?`),
  getTrophies: db.prepare(`SELECT trophies FROM players WHERE id = ?`),

  // Production
  updateLastCollected: db.prepare(`UPDATE buildings SET last_collected_at = ? WHERE id = ? AND player_id = ?`),
};

// ---------- Building Definitions (mirroring Godot) ----------

const BUILDING_DEFS = {
  town_hall: {
    size: [4, 4], max_level: 3,
    hp_levels: [3500, 6000, 10000],
    cost: { gold: 0, wood: 0, ore: 0 },
    max_count: 1,
  },
  mine: {
    size: [3, 3], max_level: 3,
    hp_levels: [1200, 2200, 3800],
    cost: { gold: 400, wood: 150, ore: 0 },
    max_count: 4,
  },
  barn: {
    size: [2, 3], max_level: 3,
    hp_levels: [2000, 3500, 6000],
    cost: { gold: 200, wood: 200, ore: 100 },
    max_count: 2,
  },
  port: {
    size: [4, 3], max_level: 3,
    hp_levels: [1800, 3200, 5500],
    cost: { gold: 800, wood: 300, ore: 200 },
    max_count: 2,
  },
  sawmill: {
    size: [3, 3], max_level: 3,
    hp_levels: [1200, 2200, 3800],
    cost: { gold: 300, wood: 0, ore: 0 },
    max_count: 4,
  },
  turret: {
    size: [2, 2], max_level: 3,
    hp_levels: [900, 1600, 2800],
    cost: { gold: 600, wood: 350, ore: 200 },
    max_count: 6,
  },
  tombstone: {
    size: [3, 3], max_level: 3,
    hp_levels: [1000, 1500, 2000],
    cost: { gold: 100, wood: 0, ore: 0 },
    max_count: 4,
  },
  storage: {
    size: [4, 5], max_level: 3,
    hp_levels: [1400, 2500, 4200],
    cost: { gold: 350, wood: 200, ore: 0 },
    max_count: 3,
  },
  archer_tower: {
    size: [3, 3], max_level: 3,
    hp_levels: [800, 1500, 2500],
    cost: { gold: 500, wood: 400, ore: 0 },
    max_count: 4,
  },
};

// ---------- Troop Definitions ----------

const TROOP_DEFS = {
  knight:    { max_level: 3, cost: [{ gold: 150, wood: 0, ore: 80 },  { gold: 300, wood: 0, ore: 200 },  { gold: 600, wood: 0, ore: 500 }] },
  mage:      { max_level: 3, cost: [{ gold: 250, wood: 0, ore: 150 }, { gold: 500, wood: 0, ore: 350 },  { gold: 1000, wood: 0, ore: 700 }] },
  barbarian: { max_level: 3, cost: [{ gold: 200, wood: 0, ore: 120 }, { gold: 400, wood: 0, ore: 280 },  { gold: 800, wood: 0, ore: 560 }] },
  archer:    { max_level: 3, cost: [{ gold: 180, wood: 100, ore: 0 }, { gold: 360, wood: 250, ore: 0 },  { gold: 720, wood: 500, ore: 0 }] },
  ranger:    { max_level: 3, cost: [{ gold: 120, wood: 60, ore: 0 },  { gold: 240, wood: 150, ore: 0 },  { gold: 480, wood: 300, ore: 0 }] },
};

// ---------- Trophy Points per Building (type -> level -> trophies) ----------

const TROPHY_TABLE = {
  town_hall: [50, 120, 250],
  mine:      [10, 25, 50],
  barn:      [10, 25, 50],
  port:      [15, 35, 70],
  sawmill:   [10, 25, 50],
  turret:    [20, 45, 90],
  tombstone: [5, 10, 20],
  storage:      [10, 25, 50],
  archer_tower: [15, 35, 70],
};

// ---------- Helper Functions ----------

function registerPlayer(name) {
  const id = uuidv4();
  const token = uuidv4();
  stmts.createPlayer.run(id, name, token);
  // Init troop levels
  for (const troop of Object.keys(TROOP_DEFS)) {
    stmts.upsertTroopLevel.run(id, troop, 1);
  }
  return { id, name, token };
}

function authenticatePlayer(token) {
  return stmts.getPlayerByToken.get(token);
}

// ---------- Resource Storage Capacity (CoC-style) ----------

// Base capacity from Town Hall (without any Storage buildings)
const TH_BASE_CAPACITY = {
  1: { gold: 5000, wood: 5000, ore: 5000 },
  2: { gold: 10000, wood: 10000, ore: 10000 },
  3: { gold: 20000, wood: 20000, ore: 20000 },
};

// Additional capacity per Storage building per level
const STORAGE_CAPACITY = {
  1: { gold: 15000, wood: 15000, ore: 15000 },
  2: { gold: 35000, wood: 35000, ore: 35000 },
  3: { gold: 75000, wood: 75000, ore: 75000 },
};

function getResourceCaps(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  // Find Town Hall level
  let thLevel = 1;
  for (const b of buildings) {
    if (b.type === 'town_hall') thLevel = b.level;
  }
  const base = TH_BASE_CAPACITY[thLevel] || TH_BASE_CAPACITY[1];
  let maxGold = base.gold;
  let maxWood = base.wood;
  let maxOre = base.ore;
  // Add capacity from each Storage building
  for (const b of buildings) {
    if (b.type === 'storage') {
      const cap = STORAGE_CAPACITY[b.level] || STORAGE_CAPACITY[1];
      maxGold += cap.gold;
      maxWood += cap.wood;
      maxOre += cap.ore;
    }
  }
  return { gold: maxGold, wood: maxWood, ore: maxOre };
}

function getResources(playerId) {
  return stmts.getResources.get(playerId);
}

function addResources(playerId, gold = 0, wood = 0, ore = 0) {
  const current = stmts.getResources.get(playerId);
  if (!current) return null;
  // Cap to storage capacity
  const caps = getResourceCaps(playerId);
  const newGold = Math.min(caps.gold, Math.max(0, current.gold + gold));
  const newWood = Math.min(caps.wood, Math.max(0, current.wood + wood));
  const newOre = Math.min(caps.ore, Math.max(0, current.ore + ore));
  stmts.updateResource.run(newGold, newWood, newOre, playerId);
  return { gold: newGold, wood: newWood, ore: newOre };
}

function subtractResources(playerId, gold = 0, wood = 0, ore = 0) {
  const current = stmts.getResources.get(playerId);
  if (!current) return null;
  if (current.gold < gold || current.wood < wood || current.ore < ore) {
    return { error: 'Not enough resources', current };
  }
  return addResources(playerId, -gold, -wood, -ore);
}

function canAfford(playerId, gold = 0, wood = 0, ore = 0) {
  const current = stmts.getResources.get(playerId);
  if (!current) return false;
  return current.gold >= gold && current.wood >= wood && current.ore >= ore;
}

function placeBuilding(playerId, type, gridX, gridZ, gridIndex = 0) {
  const def = BUILDING_DEFS[type];
  if (!def) return { error: `Unknown building type: ${type}` };

  // Check max count
  if (def.max_count) {
    const existing = stmts.getBuildings.all(playerId).filter(b => b.type === type);
    if (existing.length >= def.max_count) {
      return { error: `Maximum ${def.max_count} ${type} allowed` };
    }
  }

  // Check resources
  const cost = def.cost;
  if (!canAfford(playerId, cost.gold, cost.wood, cost.ore)) {
    return { error: 'Not enough resources', cost };
  }

  // Deduct resources
  subtractResources(playerId, cost.gold, cost.wood, cost.ore);

  const hp = def.hp_levels[0];
  const info = stmts.placeBuilding.run(playerId, type, gridX, gridZ, gridIndex, hp, hp);
  const trophyResult = recalculateTrophies(playerId);
  return {
    id: info.lastInsertRowid,
    type, level: 1, grid_x: gridX, grid_z: gridZ, grid_index: gridIndex,
    hp, max_hp: hp,
    resources: getResources(playerId),
    trophies: trophyResult.trophies,
  };
}

function upgradeBuilding(playerId, buildingId) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };

  const def = BUILDING_DEFS[building.type];
  if (!def) return { error: 'Unknown building type' };

  if (building.level >= def.max_level) {
    return { error: 'Already at max level' };
  }

  const nextLevel = building.level + 1;
  const costMultiplier = nextLevel;
  const cost = {
    gold: def.cost.gold * costMultiplier,
    wood: def.cost.wood * costMultiplier,
    ore: def.cost.ore * costMultiplier,
  };

  if (!canAfford(playerId, cost.gold, cost.wood, cost.ore)) {
    return { error: 'Not enough resources', cost };
  }

  subtractResources(playerId, cost.gold, cost.wood, cost.ore);

  const newHp = def.hp_levels[nextLevel - 1];
  stmts.upgradeBuilding.run(nextLevel, newHp, newHp, buildingId, playerId);

  const trophyResult = recalculateTrophies(playerId);
  return {
    id: buildingId, type: building.type, level: nextLevel,
    hp: newHp, max_hp: newHp, cost,
    resources: getResources(playerId),
    trophies: trophyResult.trophies,
  };
}

function removeBuilding(playerId, buildingId) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };
  stmts.removeBuilding.run(buildingId, playerId);
  const trophyResult = recalculateTrophies(playerId);
  return { removed: buildingId, type: building.type, trophies: trophyResult.trophies };
}

function getPlayerBuildings(playerId) {
  return stmts.getBuildings.all(playerId);
}

function upgradeTroop(playerId, troopType) {
  const def = TROOP_DEFS[troopType];
  if (!def) return { error: `Unknown troop type: ${troopType}` };

  const levels = stmts.getTroopLevels.all(playerId);
  const current = levels.find(t => t.troop_type === troopType);
  const currentLevel = current ? current.level : 1;

  if (currentLevel >= def.max_level) {
    return { error: 'Already at max level' };
  }

  const cost = def.cost[currentLevel - 1]; // cost to upgrade FROM current level
  if (!canAfford(playerId, cost.gold, cost.wood, cost.ore)) {
    return { error: 'Not enough resources', cost };
  }

  subtractResources(playerId, cost.gold, cost.wood, cost.ore);
  const newLevel = currentLevel + 1;
  stmts.upsertTroopLevel.run(playerId, troopType, newLevel);

  const trophyResult = recalculateTrophies(playerId);
  return {
    troop_type: troopType, level: newLevel, cost,
    resources: getResources(playerId),
    trophies: trophyResult.trophies,
  };
}

function getTroopLevels(playerId) {
  return stmts.getTroopLevels.all(playerId);
}

function collectResources(playerId, buildingId) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };

  const prod = PRODUCTION_DEFS[building.type];
  if (!prod) return { error: 'This building does not produce resources' };

  const now = new Date();
  const lastCollected = building.last_collected_at ? new Date(building.last_collected_at + 'Z') : new Date(building.created_at + 'Z');
  const elapsedMinutes = (now - lastCollected) / 60000;

  if (elapsedMinutes < 0.1) return { error: 'Nothing to collect yet' };

  const lvlIdx = Math.min(building.level - 1, prod.rate.length - 1);
  const ratePerMin = prod.rate[lvlIdx];
  const maxStored = prod.max[lvlIdx];
  const produced = Math.min(Math.floor(ratePerMin * elapsedMinutes), maxStored);

  if (produced <= 0) return { error: 'Nothing to collect yet' };

  // Add resources
  const addObj = { gold: 0, wood: 0, ore: 0 };
  addObj[prod.resource] = produced;
  addResources(playerId, addObj.gold, addObj.wood, addObj.ore);

  // Update last_collected_at
  stmts.updateLastCollected.run(now.toISOString().replace('T', ' ').split('.')[0], buildingId, playerId);

  return {
    collected: produced,
    resource: prod.resource,
    building_id: buildingId,
    resources: getResources(playerId),
  };
}

function getProductionStatus(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  const now = new Date();
  const result = [];
  for (const b of buildings) {
    const prod = PRODUCTION_DEFS[b.type];
    if (!prod) continue;
    const lastCollected = b.last_collected_at ? new Date(b.last_collected_at + 'Z') : new Date(b.created_at + 'Z');
    const elapsedMinutes = (now - lastCollected) / 60000;
    const lvlIdx = Math.min(b.level - 1, prod.rate.length - 1);
    const ratePerMin = prod.rate[lvlIdx];
    const maxStored = prod.max[lvlIdx];
    const stored = Math.min(Math.floor(ratePerMin * elapsedMinutes), maxStored);
    result.push({
      building_id: b.id,
      type: b.type,
      resource: prod.resource,
      stored,
      max: maxStored,
      rate_per_min: ratePerMin,
    });
  }
  return result;
}

function findEnemy(playerId) {
  const player = stmts.getPlayerById.get(playerId);
  if (!player) return { error: 'Player not found' };
  const enemy = stmts.findEnemy.get(playerId, player.trophies);
  if (!enemy) return { error: 'No enemies found' };
  // Repair enemy buildings before attack (buildings auto-rebuild like in CoC)
  repairAllBuildings(enemy.id);
  const buildings = stmts.getBuildings.all(enemy.id);
  const resources = getResources(enemy.id);
  return {
    id: enemy.id,
    name: enemy.name,
    trophies: enemy.trophies,
    level: enemy.level,
    buildings,
    resources,
  };
}

function recalculateTrophies(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  let total = 0;
  for (const b of buildings) {
    const table = TROPHY_TABLE[b.type];
    if (table && b.level >= 1 && b.level <= table.length) {
      total += table[b.level - 1];
    }
  }
  // Add troop level trophies (5 per troop level above 1)
  const troops = stmts.getTroopLevels.all(playerId);
  for (const t of troops) {
    if (t.level > 1) {
      total += (t.level - 1) * 5;
    }
  }
  stmts.updateTrophies.run(total, playerId);
  return { trophies: total };
}

function getTrophies(playerId) {
  const row = stmts.getTrophies.get(playerId);
  return row ? row.trophies : 0;
}

function getFullPlayerState(playerId) {
  const player = stmts.getPlayerById.get(playerId);
  if (!player) return null;
  // Auto-repair buildings on login (like Clash of Clans)
  repairAllBuildings(playerId);
  const { token, ...safe } = player;
  return {
    ...safe,
    buildings: getPlayerBuildings(playerId),
    troop_levels: getTroopLevels(playerId),
    resource_caps: getResourceCaps(playerId),
  };
}

function repairAllBuildings(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  for (const b of buildings) {
    if (b.hp < b.max_hp) {
      db.prepare('UPDATE buildings SET hp = max_hp WHERE id = ? AND player_id = ?').run(b.id, playerId);
    }
  }
}

const SHIP_COST_GOLD = 500;

function buyShip(playerId, buildingId) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };
  if (building.type !== 'port') return { error: 'Can only buy ships at ports' };
  if (building.has_ship) return { error: 'Port already has a ship' };
  if (!canAfford(playerId, SHIP_COST_GOLD, 0, 0)) {
    return { error: 'Not enough gold', cost: { gold: SHIP_COST_GOLD } };
  }
  subtractResources(playerId, SHIP_COST_GOLD, 0, 0);
  db.prepare('UPDATE buildings SET has_ship = 1 WHERE id = ? AND player_id = ?').run(buildingId, playerId);
  return { success: true, resources: getResources(playerId) };
}

const LOOT_PERCENT = 0.30;

function getPlayerBuildings(playerId) {
  return stmts.getBuildings.all(playerId);
}

function createAttackSession(sessionId, attackerId, defenderId) {
  db.prepare('INSERT INTO attack_sessions (id, attacker_id, defender_id) VALUES (?, ?, ?)').run(sessionId, attackerId, defenderId);
}

function updateAttackSession(sessionId, status, troopsDeployed, buildingsDestroyed) {
  db.prepare(`
    UPDATE attack_sessions SET status = ?, troops_deployed = ?, buildings_destroyed = ?, ended_at = datetime('now')
    WHERE id = ?
  `).run(status, troopsDeployed, buildingsDestroyed, sessionId);
}

const SHIELD_HOURS = 12; // 12-hour shield after being raided
const ATTACK_COOLDOWN_HOURS = 2; // can't attack same player for 2 hours

function battleVictory(attackerId, defenderId) {
  if (!attackerId || !defenderId) return { error: 'Missing player IDs' };
  if (attackerId === defenderId) return { error: 'Cannot attack yourself' };

  // Check defender has no active shield
  const defender = stmts.getPlayerById.get(defenderId);
  if (!defender) return { error: 'Defender not found' };
  if (defender.shield_until) {
    const shieldEnd = new Date(defender.shield_until + 'Z');
    if (shieldEnd > new Date()) return { error: 'Defender is shielded' };
  }

  // Check cooldown — can't attack same player twice within cooldown
  if (defender.last_attacked_by === attackerId && defender.last_attacked_at) {
    const lastAttack = new Date(defender.last_attacked_at + 'Z');
    const cooldownEnd = new Date(lastAttack.getTime() + ATTACK_COOLDOWN_HOURS * 3600000);
    if (cooldownEnd > new Date()) return { error: 'Already attacked this player recently' };
  }

  // Calculate loot — 30% of defender's resources (floored to whole numbers)
  const lootGold = Math.floor((defender.gold || 0) * LOOT_PERCENT);
  const lootWood = Math.floor((defender.wood || 0) * LOOT_PERCENT);
  const lootOre = Math.floor((defender.ore || 0) * LOOT_PERCENT);

  // Transfer resources
  subtractResources(defenderId, lootGold, lootWood, lootOre);
  addResources(attackerId, lootGold, lootWood, lootOre);

  // Grant shield to defender (12 hours)
  const shieldUntil = new Date(Date.now() + SHIELD_HOURS * 3600000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('UPDATE players SET shield_until = ?, last_attacked_by = ?, last_attacked_at = datetime(\'now\') WHERE id = ?')
    .run(shieldUntil, attackerId, defenderId);

  return {
    success: true,
    loot: { gold: lootGold, wood: lootWood, ore: lootOre },
    attacker_resources: getResources(attackerId),
  };
}

module.exports = {
  db,
  BUILDING_DEFS,
  TROOP_DEFS,
  registerPlayer,
  authenticatePlayer,
  getResources,
  addResources,
  subtractResources,
  placeBuilding,
  upgradeBuilding,
  removeBuilding,
  getPlayerBuildings,
  upgradeTroop,
  getTroopLevels,
  findEnemy,
  collectResources,
  getProductionStatus,
  recalculateTrophies,
  getTrophies,
  getFullPlayerState,
  buyShip,
  battleVictory,
  getPlayerBuildings,
  getResourceCaps,
  createAttackSession,
  updateAttackSession,
  TROPHY_TABLE,
};
