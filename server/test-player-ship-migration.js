'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CANONICAL_GRID_CONFIG,
  FREEZE_DROP,
  MAX_PLAYER_SHIP_LEVEL,
  PLAYER_SHIP_LEVELS,
  RAGE_DROP,
  SKELETON_BARREL,
  TROOP_SLOT_COSTS,
  cannonInitialEnergyForShipLevel,
  MEDKIT_ENERGY_COST,
  MEDKIT_UNLOCK_SHIP_LEVEL,
} = require('./combat_defs');

const dbPath = path.join(os.tmpdir(), `clash-player-ship-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');
const { verifyReplay } = require('./combat_session');
const SLOT_FILLER = '_SLOT_FILLER_';
const NON_NFT_TROOPS = [
  'knight',
  'mage',
  'archer',
  'mimic',
  'necromancer',
  'horror',
  'mechanical_dragon',
  'ice_golem',
];

for (const troop of NON_NFT_TROOPS) {
  assert.equal(
    gameDb.TROOP_DEFS[troop]?.buy_cost,
    TROOP_SLOT_COSTS[troop] * 100,
    `${troop} must cost exactly 100 gold per occupied slot`,
  );
}
assert.equal(gameDb.TROOP_DEFS.demon_king?.buy_cost, 0);
assert.equal(gameDb.TROOP_DEFS.fire_dragon?.buy_cost, 0);

const EXPECTED_SHIP_LEVELS = {
  1: { capacity: 3, energy: 4, cost: { gold: 0, wood: 0, ore: 0 } },
  2: { capacity: 12, energy: 6, cost: { gold: 2000, wood: 4000, ore: 3400 } },
  3: { capacity: 27, energy: 8, cost: { gold: 3600, wood: 7200, ore: 6200 } },
  4: { capacity: 36, energy: 10, cost: { gold: 4800, wood: 9600, ore: 8200 } },
  5: { capacity: 45, energy: 12, cost: { gold: 6500, wood: 12800, ore: 11000 } },
  6: { capacity: 45, energy: 14, cost: { gold: 9000, wood: 18000, ore: 15500 } },
  7: { capacity: 45, energy: 16, cost: { gold: 12000, wood: 24000, ore: 21000 } },
  8: { capacity: 45, energy: 18, cost: { gold: 16000, wood: 32000, ore: 28000 } },
  9: { capacity: 45, energy: 20, cost: { gold: 21000, wood: 42000, ore: 36000 } },
  10: { capacity: 45, energy: 22, cost: { gold: 27000, wood: 54000, ore: 46000 } },
};
assert.equal(Object.keys(EXPECTED_SHIP_LEVELS).length, MAX_PLAYER_SHIP_LEVEL);
for (const [level, expected] of Object.entries(EXPECTED_SHIP_LEVELS)) {
  assert.equal(PLAYER_SHIP_LEVELS[level].capacity, expected.capacity);
  assert.equal(PLAYER_SHIP_LEVELS[level].energy, expected.energy);
  assert.deepEqual(PLAYER_SHIP_LEVELS[level].cost, expected.cost);
  assert.equal(cannonInitialEnergyForShipLevel(level), expected.energy);
  assert.equal(gameDb.PLAYER_SHIP_LEVELS[level], PLAYER_SHIP_LEVELS[level]);
  const simulation = verifyReplay({
    defenderBuildings: [],
    actions: [],
    claimedResult: 'defeat',
    gridConfig: CANONICAL_GRID_CONFIG,
    serverTroopLevels: {},
    serverShipLevel: Number(level),
  });
  assert.equal(
    simulation._cannonEnergy,
    expected.energy,
    `server replay must initialize Main Ship level ${level} with authoritative energy`,
  );
}
assert.equal(PLAYER_SHIP_LEVELS[MEDKIT_UNLOCK_SHIP_LEVEL].medkit_unlocked, true);
const medkitReplay = verifyReplay({
  defenderBuildings: [],
  actions: [{ type: 'medkit_drop', t: 0, x: 0, z: 0 }],
  claimedResult: 'defeat',
  gridConfig: CANONICAL_GRID_CONFIG,
  serverTroopLevels: {},
  serverShipLevel: MEDKIT_UNLOCK_SHIP_LEVEL,
});
assert.equal(medkitReplay._medkitEventsAccepted, 1);
assert.equal(medkitReplay._medkitEventsIgnored, 0);
assert.equal(
  medkitReplay._cannonEnergy,
  PLAYER_SHIP_LEVELS[MEDKIT_UNLOCK_SHIP_LEVEL].energy - MEDKIT_ENERGY_COST,
);
const lockedMedkitReplay = verifyReplay({
  defenderBuildings: [],
  actions: [{ type: 'medkit_drop', t: 0, x: 0, z: 0 }],
  claimedResult: 'defeat',
  gridConfig: CANONICAL_GRID_CONFIG,
  serverTroopLevels: {},
  serverShipLevel: MEDKIT_UNLOCK_SHIP_LEVEL - 1,
});
assert.equal(lockedMedkitReplay._medkitEventsAccepted, 0);
assert.equal(lockedMedkitReplay._medkitEventsIgnored, 1);
assert.equal(lockedMedkitReplay._cannonEnergy, PLAYER_SHIP_LEVELS[5].energy);

function packTroops(roots) {
  const packed = [];
  for (const entry of roots) {
    const type = String(entry).split(':', 1)[0]
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase();
    const slotCost = TROOP_SLOT_COSTS[type] || 1;
    packed.push(entry, ...Array(slotCost - 1).fill(SLOT_FILLER));
  }
  return packed;
}

function insertPlayer(id, name) {
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token)
    VALUES (?, ?, ?)
  `).run(id, name, `token-${id}`);
}

function insertLegacyPort(playerId, index, troops) {
  gameDb.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp,
       has_ship, ship_troops, ship_troops_template)
    VALUES (?, 'port', 3, ?, 0, 1, 100, 100, 1, ?, ?)
  `).run(playerId, index, JSON.stringify(troops), JSON.stringify(troops));
}

try {
  const legacyPlayerId = 'legacy-five-port-player';
  insertPlayer(legacyPlayerId, 'legacy_ship_test');
  const expectedRoots = [];
  for (let portIndex = 0; portIndex < 5; portIndex += 1) {
    const troops = [`Mage:${portIndex + 1}`, 'Archer:1', 'Knight:1'];
    expectedRoots.push(...troops);
    insertLegacyPort(legacyPlayerId, portIndex, troops);
  }
  const expectedTroops = packTroops(expectedRoots);

  const migrated = gameDb.ensurePlayerShip(legacyPlayerId);
  assert.equal(migrated.id, 'main_ship');
  assert.equal(migrated.level, 5);
  assert.equal(migrated.capacity, 45);
  assert.equal(migrated.energy, 12);
  assert.equal(migrated.slot_cost_version, gameDb.TROOP_SLOT_COST_VERSION);
  assert.deepEqual(migrated.troops, expectedTroops);
  assert.deepEqual(migrated.troop_template, expectedTroops);
  assert.ok(migrated.migrated_from_ports_at);

  const migrationRow = gameDb.db.prepare(`
    SELECT migration_json, capacity_override
    FROM player_ships
    WHERE player_id = ?
  `).get(legacyPlayerId);
  const migration = JSON.parse(migrationRow.migration_json);
  assert.equal(migration.source, 'legacy_ports');
  assert.equal(migration.legacy_capacity, 45);
  assert.equal(migration.source_ports.length, 5);
  assert.equal(migrationRow.capacity_override, 0);
  assert.equal(
    gameDb.db.prepare(`SELECT COUNT(*) AS count FROM buildings WHERE player_id = ? AND type = 'port'`).get(legacyPlayerId).count,
    5,
    'legacy rows must remain available for audit/rollback',
  );

  const secondRead = gameDb.ensurePlayerShip(legacyPlayerId);
  assert.deepEqual(secondRead, migrated, 'migration must be idempotent');
  assert.equal(
    gameDb.db.prepare(`SELECT COUNT(*) AS count FROM player_ships WHERE player_id = ?`).get(legacyPlayerId).count,
    1,
  );

  const overCapPlayerId = 'legacy-six-port-player';
  insertPlayer(overCapPlayerId, 'legacy_over_cap_test');
  for (let portIndex = 0; portIndex < 6; portIndex += 1) {
    insertLegacyPort(overCapPlayerId, portIndex, ['Mage:1', 'Archer:1', 'Knight:1']);
  }
  const overCapShip = gameDb.ensurePlayerShip(overCapPlayerId);
  assert.equal(overCapShip.level, 5);
  assert.equal(overCapShip.capacity, 45, 'legacy fleets must respect the authoritative Main Ship cap');
  assert.equal(overCapShip.troops.length, 36);
  assert.equal(
    gameDb.db.prepare('SELECT capacity_override FROM player_ships WHERE player_id = ?').get(overCapPlayerId).capacity_override,
    0,
  );

  const staleV2PlayerId = 'stale-v2-over-cap-player';
  insertPlayer(staleV2PlayerId, 'stale_v2_over_cap');
  gameDb.db.prepare(`
    INSERT INTO player_ships
      (player_id, level, troops, troop_template, capacity_override, migration_json, slot_cost_version)
    VALUES (?, 5, ?, ?, 54, '{}', ?)
  `).run(
    staleV2PlayerId,
    JSON.stringify(Array(46).fill('Knight:1')),
    JSON.stringify(Array(46).fill('Knight:1')),
    gameDb.TROOP_SLOT_COST_VERSION,
  );
  const healedV2Ship = gameDb.ensurePlayerShip(staleV2PlayerId);
  assert.equal(healedV2Ship.capacity, 45);
  assert.equal(healedV2Ship.troops.length, 45);
  assert.equal(gameDb.getResources(staleV2PlayerId).gold, 4100, 'trimmed stale v2 Knight must refund 100 gold');

  const newPlayerId = 'new-single-ship-player';
  insertPlayer(newPlayerId, 'new_ship_test');
  const freshShip = gameDb.ensurePlayerShip(newPlayerId);
  assert.equal(freshShip.level, 1);
  assert.equal(freshShip.capacity, 3);
  assert.equal(freshShip.energy, 4);
  assert.deepEqual(freshShip.troops, []);
  assert.equal(freshShip.slot_cost_version, gameDb.TROOP_SLOT_COST_VERSION);
  assert.equal(freshShip.migrated_from_ports_at, null);

  const upgradePlayerId = 'main-ship-upgrade-player';
  insertPlayer(upgradePlayerId, 'main_ship_upgrade');
  gameDb.db.prepare(`
    UPDATE players SET gold = 500000, wood = 500000, ore = 500000 WHERE id = ?
  `).run(upgradePlayerId);
  gameDb.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 7, 0, 0, 1, 1, 1)
  `).run(upgradePlayerId);
  let expectedResources = { gold: 500000, wood: 500000, ore: 500000 };
  for (let targetLevel = 2; targetLevel <= MAX_PLAYER_SHIP_LEVEL; targetLevel += 1) {
    const expected = EXPECTED_SHIP_LEVELS[targetLevel];
    const upgraded = gameDb.upgradePlayerShip(upgradePlayerId);
    assert.equal(upgraded.success, true);
    assert.equal(upgraded.ship.level, targetLevel);
    assert.equal(upgraded.ship.capacity, expected.capacity);
    assert.equal(upgraded.ship.energy, expected.energy);
    assert.equal(upgraded.ship.medkit_unlocked, targetLevel >= MEDKIT_UNLOCK_SHIP_LEVEL);
    assert.equal(upgraded.ship.freeze_unlocked, targetLevel >= FREEZE_DROP.unlockShipLevel);
    assert.equal(upgraded.ship.rage_unlocked, targetLevel >= RAGE_DROP.unlockShipLevel);
    assert.equal(upgraded.ship.skeleton_barrel_unlocked, targetLevel >= SKELETON_BARREL.unlockShipLevel);
    assert.deepEqual(upgraded.cost, expected.cost);
    for (const resource of ['gold', 'wood', 'ore']) {
      expectedResources[resource] -= expected.cost[resource];
      assert.equal(upgraded.resources[resource], expectedResources[resource]);
    }
  }
  assert.match(gameDb.upgradePlayerShip(upgradePlayerId).error, /max level/);

  const refundPlayerId = 'slot-rebalance-refund-player';
  insertPlayer(refundPlayerId, 'slot_rebalance_refund');
  gameDb.db.prepare(`
    INSERT INTO player_ships
      (player_id, level, troops, troop_template, capacity_override, migration_json, slot_cost_version)
    VALUES (?, 2, ?, ?, 0, '{}', 1)
  `).run(
    refundPlayerId,
    JSON.stringify(['Horror:1', 'Mage:1', 'Knight:1']),
    JSON.stringify(['Horror:1', 'Mage:1', 'Knight:1']),
  );
  const refundedShip = gameDb.ensurePlayerShip(refundPlayerId);
  assert.equal(refundedShip.capacity, 12);
  assert.deepEqual(refundedShip.troops, packTroops(['Mage:1', 'Knight:1']));
  assert.deepEqual(refundedShip.troop_template, packTroops(['Mage:1', 'Knight:1']));
  assert.equal(gameDb.getResources(refundPlayerId).gold, 6000, 'overflow Horror must refund its 2000 gold recruitment cost');
  const refundMigration = JSON.parse(gameDb.db.prepare(
    'SELECT migration_json FROM player_ships WHERE player_id = ?',
  ).get(refundPlayerId).migration_json).slot_cost_migration;
  assert.deepEqual(refundMigration.removed_units, ['horror']);
  assert.equal(refundMigration.refund_gold, 2000);

  const nftPlayerId = 'slot-rebalance-nft-player';
  insertPlayer(nftPlayerId, 'slot_rebalance_nft');
  const dragonEntry = 'FireDragon:solana:dragon-1:Rcommon';
  const demonEntry = 'DemonKing:base:demon-1:Repic';
  gameDb.db.prepare(`
    INSERT INTO player_ships
      (player_id, level, troops, troop_template, capacity_override, migration_json, slot_cost_version)
    VALUES (?, 2, ?, ?, 0, '{}', 1)
  `).run(
    nftPlayerId,
    JSON.stringify([dragonEntry, demonEntry]),
    JSON.stringify([dragonEntry, demonEntry]),
  );
  const nftShip = gameDb.ensurePlayerShip(nftPlayerId);
  assert.deepEqual(nftShip.troops, packTroops([dragonEntry]));
  assert.equal(gameDb.getResources(nftPlayerId).gold, 4000, 'overflow NFT must never be sold for gold');

  console.log('[player-ship-migration] PASS legacy_ports=5 capacity=45 legacy_over_cap=54 capped=45 stale_v2_healed=true slots=36 refund=2000 nft_unloaded=true idempotent=true');
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
