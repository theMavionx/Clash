#!/usr/bin/env node
/**
 * Dev-only combat balance report.
 *
 * Read-only by design: this script does not import server/db.js, open SQLite,
 * start network services, or write files. It reuses combat_session.js by
 * providing the verifier with the BUILDING_DEFS subset it needs.
 */

'use strict';

const Module = require('module');
const path = require('path');

const {
  CANONICAL_GRID_CONFIG,
  CANONICAL_GRID_CONFIGS,
  TIME_LIMIT_SEC,
  TROOPS_PER_SHIP,
} = require('../combat_defs');

const CORE_ROSTER = ['knight', 'mage', 'archer'];
const PREMIUM_DEFERRED_ROSTER = ['demon_king'];
const ACTIVE_ROSTER = new Set([...CORE_ROSTER, ...PREMIUM_DEFERRED_ROSTER]);
const SLOT_FILLER = '_SLOT_FILLER_';

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [3500, 8000, 16000, 24000] },
  mine: { size: [3, 3], hp_levels: [1200, 2200, 3800, 6000] },
  barn: { size: [4, 3], hp_levels: [2000, 3500, 6000, 9500] },
  port: { size: [4, 3], hp_levels: [1800, 3200, 5500, 8500] },
  sawmill: { size: [3, 3], hp_levels: [1200, 2200, 3800, 6000] },
  turret: { size: [2, 2], hp_levels: [900, 1600, 2800, 4500] },
  tombstone: { size: [3, 3], hp_levels: [1000, 1500, 2000, 2700] },
  storage: { size: [4, 5], hp_levels: [1400, 2500, 4200, 6500] },
  archer_tower: { size: [3, 3], hp_levels: [800, 1500, 2500, 3800, 5600] },
  mage_tower: { size: [3, 3], hp_levels: [700, 1200, 2000] },
};

function loadVerifierWithoutDb() {
  const combatSessionPath = path.resolve(__dirname, '..', 'combat_session.js');
  const dbPath = path.resolve(__dirname, '..', 'db.js');
  const originalLoad = Module._load;

  Module._load = function guardedLoad(request, parent, isMain) {
    const parentPath = parent?.filename ? path.resolve(parent.filename) : '';
    if (parentPath === combatSessionPath && request === './db') {
      return { BUILDING_DEFS };
    }

    if (request === './db' || request === '../db' || /[/\\]db(?:\.js)?$/.test(request)) {
      let resolved = null;
      try {
        resolved = path.resolve(Module._resolveFilename(request, parent));
      } catch {
        resolved = null;
      }
      if (resolved === dbPath) {
        throw new Error(`Blocked import of ${dbPath}`);
      }
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { verifyReplay } = require('../combat_session');
    if (require.cache[dbPath]) {
      throw new Error('server/db.js was unexpectedly loaded');
    }
    return verifyReplay;
  } finally {
    Module._load = originalLoad;
  }
}

function clampLevel(type, level) {
  const def = BUILDING_DEFS[type];
  const max = def?.hp_levels?.length || 1;
  return Math.max(1, Math.min(max, Number(level) || 1));
}

function buildingFactory() {
  let nextId = 1;
  return function building(type, level, gridX, gridZ, gridIndex = 0) {
    const def = BUILDING_DEFS[type];
    if (!def) throw new Error(`Unknown building type: ${type}`);
    const clampedLevel = clampLevel(type, level);
    const maxHp = def.hp_levels[clampedLevel - 1] || def.hp_levels[0];
    return {
      id: `${type}_${nextId++}`,
      type,
      level: clampedLevel,
      grid_x: gridX,
      grid_z: gridZ,
      grid_index: gridIndex,
      hp: maxHp,
      max_hp: maxHp,
    };
  };
}

function gridToWorld(gridX, gridZ, sizeX = 1, sizeZ = 1, gc = CANONICAL_GRID_CONFIG) {
  const halfX = gc.grid_extent_x / 2;
  const halfZ = gc.grid_extent_z / 2;
  const cs = gc.cell_size;
  const localX = -halfX + gridX * cs + (sizeX * cs) / 2;
  const localZ = -halfZ + gridZ * cs + (sizeZ * cs) / 2;
  const cosR = Math.cos(gc.grid_rotation);
  const sinR = Math.sin(gc.grid_rotation);
  return {
    x: gc.grid_center_x + localX * cosR + localZ * sinR,
    z: gc.grid_center_z - localX * sinR + localZ * cosR,
  };
}

function spawnPoint(gridX, gridZ) {
  return gridToWorld(gridX, gridZ, 1, 1);
}

const SPAWN_PROFILES = {
  south: [
    spawnPoint(9, 29),
    spawnPoint(12, 29),
    spawnPoint(15, 29),
    spawnPoint(18, 28),
    spawnPoint(6, 28),
  ],
  north: [
    spawnPoint(9, -2),
    spawnPoint(12, -2),
    spawnPoint(15, -2),
    spawnPoint(18, -1),
    spawnPoint(6, -1),
  ],
  west: [
    spawnPoint(-2, 9),
    spawnPoint(-2, 12),
    spawnPoint(-2, 15),
    spawnPoint(-1, 18),
    spawnPoint(-1, 6),
  ],
  east: [
    spawnPoint(29, 9),
    spawnPoint(29, 12),
    spawnPoint(29, 15),
    spawnPoint(28, 18),
    spawnPoint(28, 6),
  ],
  ring: [
    spawnPoint(12, 29),
    spawnPoint(-2, 12),
    spawnPoint(27, 15),
    spawnPoint(12, -2),
    spawnPoint(17, 28),
  ],
};

function repeatPattern(pattern, count) {
  const troops = [];
  for (let i = 0; i < count; i++) {
    troops.push(pattern[i % pattern.length]);
  }
  return troops;
}

function demonToken(level) {
  return `demon_king:L${Math.max(1, Math.min(3, Number(level) || 1))}`;
}

function withDemon(level, rest) {
  return [demonToken(level), SLOT_FILLER, ...rest];
}

function chunkShips(tokens, maxShips = 5, slotsPerShip = TROOPS_PER_SHIP) {
  const chunks = [];
  for (let i = 0; i < tokens.length && chunks.length < maxShips; i += slotsPerShip) {
    chunks.push(tokens.slice(i, i + slotsPerShip));
  }
  return chunks;
}

function troopSpawns(base, count, shipIndex) {
  const spread = 0.045;
  return Array.from({ length: count }, (_, i) => {
    const offset = i - (count - 1) / 2;
    return {
      x: base.x + offset * spread,
      z: base.z + (shipIndex % 2 === 0 ? spread : -spread) * 0.5,
    };
  });
}

function shipActions(loadouts, profileName = 'south') {
  const profile = SPAWN_PROFILES[profileName] || SPAWN_PROFILES.south;
  return loadouts.map((troops, index) => {
    const base = profile[index % profile.length];
    return {
      type: 'place_ship',
      t: index * 0.35,
      ship_index: index,
      troop_x: base.x,
      troop_z: base.z,
      x: base.x,
      z: base.z,
      troops,
      troop_spawns: troopSpawns(base, troops.length, index),
    };
  });
}

function troopLevels(level) {
  const clamped = Math.max(1, Math.min(4, Number(level) || 1));
  return {
    knight: clamped,
    mage: clamped,
    archer: clamped,
    Knight: clamped,
    Mage: clamped,
    Archer: clamped,
  };
}

function validateRoster(name, loadouts) {
  for (const troop of loadouts.flat()) {
    if (troop === SLOT_FILLER) continue;
    const type = String(troop).split(':')[0];
    if (!ACTIVE_ROSTER.has(type)) {
      throw new Error(`${name} includes retired or unknown troop type: ${troop}`);
    }
  }
}

function matchedLayout(th) {
  const b = buildingFactory();
  const level = Math.max(1, Math.min(4, th));
  const buildings = [
    b('town_hall', level, 11, 11),
    b('mine', level, 7, 11),
    b('sawmill', level, 16, 11),
    b('barn', level, 11, 7),
    b('port', level, 11, 16),
  ];

  if (th >= 2) {
    buildings.push(
      b('storage', Math.min(level, 2), 4, 13),
      b('tombstone', Math.min(level, 2), 17, 7),
      b('archer_tower', Math.min(level, 2), 17, 16),
      b('archer_tower', Math.min(level, 2), 6, 6),
    );
  }

  if (th >= 3) {
    buildings.push(
      b('turret', 3, 8, 17),
      b('turret', 3, 19, 12),
      b('turret', 3, 12, 20),
      b('tombstone', 3, 5, 7),
      b('archer_tower', 3, 14, 5),
    );
  }

  if (th >= 4) {
    buildings.push(
      b('storage', 3, 21, 6),
      b('storage', 3, 2, 6),
      b('turret', 4, 7, 5),
      b('turret', 4, 18, 19),
      b('archer_tower', 4, 21, 15),
      b('mage_tower', 3, 8, 10),
      b('mage_tower', 3, 16, 10),
      b('tombstone', 3, 3, 19),
    );
  }

  return buildings;
}

function tombstoneHeavyLayout() {
  const b = buildingFactory();
  return [
    b('town_hall', 4, 11, 11),
    b('barn', 4, 11, 7),
    b('port', 4, 11, 16),
    b('storage', 4, 4, 13),
    b('storage', 4, 18, 13),
    b('tombstone', 4, 7, 7),
    b('tombstone', 4, 17, 7),
    b('tombstone', 4, 7, 18),
    b('tombstone', 4, 17, 18),
    b('archer_tower', 5, 4, 4),
    b('archer_tower', 5, 21, 4),
    b('mage_tower', 3, 12, 5),
    b('mage_tower', 3, 12, 20),
    b('turret', 4, 5, 21),
    b('turret', 4, 21, 21),
  ];
}

function turretHeavyLayout() {
  const b = buildingFactory();
  return [
    b('town_hall', 4, 11, 11),
    b('barn', 4, 11, 7),
    b('storage', 4, 4, 13),
    b('storage', 4, 18, 13),
    b('turret', 4, 8, 8),
    b('turret', 4, 16, 8),
    b('turret', 4, 8, 16),
    b('turret', 4, 16, 16),
    b('turret', 4, 5, 20),
    b('turret', 4, 21, 20),
    b('archer_tower', 5, 4, 4),
    b('archer_tower', 5, 21, 4),
    b('mage_tower', 3, 12, 5),
    b('mage_tower', 3, 12, 20),
    b('tombstone', 4, 12, 20),
  ];
}

function archerBacklineLayout() {
  const b = buildingFactory();
  return [
    b('town_hall', 4, 11, 12),
    b('barn', 4, 10, 17),
    b('port', 4, 15, 17),
    b('mine', 4, 7, 14),
    b('sawmill', 4, 18, 14),
    b('storage', 4, 4, 10),
    b('storage', 4, 19, 10),
    b('tombstone', 4, 11, 8),
    b('turret', 4, 7, 18),
    b('turret', 4, 18, 18),
    b('mage_tower', 3, 8, 8),
    b('mage_tower', 3, 17, 8),
    b('archer_tower', 5, 5, 4),
    b('archer_tower', 5, 12, 3),
    b('archer_tower', 5, 19, 4),
  ];
}

function standardMix(total, demonLevel = null) {
  const normalPattern = ['knight', 'archer', 'mage', 'knight', 'archer', 'mage'];
  const normalCount = demonLevel ? Math.max(0, total - 2) : total;
  const normals = repeatPattern(normalPattern, normalCount);
  return demonLevel ? withDemon(demonLevel, normals) : normals;
}

function scenarioLoadouts(kind, options = {}) {
  const ships = options.ships || 5;
  const shipLevel = Math.max(1, Math.min(4, Number(options.shipLevel || options.attackerTh || options.level || 1)));
  const slotsPerShip = Math.max(1, Math.min(TROOPS_PER_SHIP, shipLevel * 3));
  const slots = ships * slotsPerShip;
  const level = options.level || 1;

  if (kind === 'archer_spam') return chunkShips(repeatPattern(['archer'], slots), ships, slotsPerShip);
  if (kind === 'mage_burst') return chunkShips(repeatPattern(['mage'], slots), ships, slotsPerShip);
  if (kind === 'archer_heavy') return chunkShips(repeatPattern(['knight', 'archer', 'archer', 'mage'], slots), ships, slotsPerShip);
  if (kind === 'mage_heavy') return chunkShips(repeatPattern(['knight', 'mage', 'mage', 'archer'], slots), ships, slotsPerShip);
  if (kind === 'knight_archer') return chunkShips(repeatPattern(['knight', 'archer'], slots), ships, slotsPerShip);
  if (kind === 'knight_mage') return chunkShips(repeatPattern(['knight', 'knight', 'mage'], slots), ships, slotsPerShip);
  if (kind === 'demon_solo') return chunkShips([demonToken(level), SLOT_FILLER], 1, slotsPerShip);
  if (kind === 'demon_mixed') return chunkShips(withDemon(level, repeatPattern(['knight', 'archer', 'mage'], slots - 2)), ships, slotsPerShip);
  if (kind === 'standard') return chunkShips(standardMix(slots, options.demonLevel), ships, slotsPerShip);

  throw new Error(`Unknown loadout kind: ${kind}`);
}

function smokeScenarios() {
  return [
    {
      name: 'TH1 matched mixed roster',
      defenderTh: 1,
      attackerTh: 1,
      level: 1,
      defense: matchedLayout(1),
      loadouts: scenarioLoadouts('standard', { ships: 1, shipLevel: 1 }),
      spawn: 'south',
      tags: ['matched'],
    },
    {
      name: 'TH2 matched mixed roster',
      defenderTh: 2,
      attackerTh: 2,
      level: 2,
      defense: matchedLayout(2),
      loadouts: scenarioLoadouts('standard', { ships: 2, shipLevel: 2 }),
      spawn: 'south',
      tags: ['matched'],
    },
    {
      name: 'TH3 matched mixed roster',
      defenderTh: 3,
      attackerTh: 3,
      level: 3,
      defense: matchedLayout(3),
      loadouts: scenarioLoadouts('standard', { ships: 4, shipLevel: 3 }),
      spawn: 'south',
      tags: ['matched'],
    },
    {
      name: 'TH4 matched mixed roster',
      defenderTh: 4,
      attackerTh: 4,
      level: 4,
      defense: matchedLayout(4),
      loadouts: scenarioLoadouts('standard', { ships: 5, shipLevel: 4 }),
      spawn: 'north',
      tags: ['matched'],
    },
    {
      name: 'All Archer spam into TH3',
      defenderTh: 3,
      attackerTh: 3,
      level: 3,
      defense: matchedLayout(3),
      loadouts: scenarioLoadouts('archer_spam', { ships: 5, shipLevel: 3 }),
      spawn: 'south',
      tags: ['spam'],
    },
    {
      name: 'All Mage burst into TH3',
      defenderTh: 3,
      attackerTh: 3,
      level: 3,
      defense: matchedLayout(3),
      loadouts: scenarioLoadouts('mage_burst', { ships: 5, shipLevel: 3 }),
      spawn: 'south',
      tags: ['burst'],
    },
    {
      name: 'Knight + Archer shield line into TH3',
      defenderTh: 3,
      attackerTh: 3,
      level: 3,
      defense: matchedLayout(3),
      loadouts: scenarioLoadouts('knight_archer', { ships: 5, shipLevel: 3 }),
      spawn: 'ring',
      tags: ['composition'],
    },
    {
      name: 'Knight + Mage push into TH3',
      defenderTh: 3,
      attackerTh: 3,
      level: 3,
      defense: matchedLayout(3),
      loadouts: scenarioLoadouts('knight_mage', { ships: 5, shipLevel: 3 }),
      spawn: 'ring',
      tags: ['composition'],
    },
    {
      name: 'Premium holdout: DemonKing solo into TH2',
      defenderTh: 2,
      attackerTh: 4,
      level: 3,
      defense: matchedLayout(2),
      loadouts: scenarioLoadouts('demon_solo', { level: 3 }),
      spawn: 'south',
      tags: ['premium_deferred', 'demon_solo'],
    },
    {
      name: 'Premium holdout: DemonKing + mixed roster into TH4',
      defenderTh: 4,
      attackerTh: 4,
      level: 4,
      defense: matchedLayout(4),
      loadouts: scenarioLoadouts('demon_mixed', { ships: 5, shipLevel: 4, level: 3 }),
      spawn: 'ring',
      tags: ['premium_deferred', 'demon', 'composition'],
    },
    {
      name: 'Tombstone-heavy TH4 defense',
      defenderTh: 4,
      attackerTh: 4,
      level: 4,
      defense: tombstoneHeavyLayout(),
      loadouts: scenarioLoadouts('standard', { ships: 5, shipLevel: 4 }),
      spawn: 'ring',
      tags: ['heavy_defense', 'tombstone'],
    },
    {
      name: 'Turret-heavy TH4 defense',
      defenderTh: 4,
      attackerTh: 4,
      level: 4,
      defense: turretHeavyLayout(),
      loadouts: scenarioLoadouts('standard', { ships: 5, shipLevel: 4 }),
      spawn: 'ring',
      tags: ['heavy_defense', 'turret'],
    },
    {
      name: 'Archer Tower backline TH4 defense',
      defenderTh: 4,
      attackerTh: 4,
      level: 4,
      defense: archerBacklineLayout(),
      loadouts: scenarioLoadouts('knight_mage', { ships: 5, shipLevel: 4 }),
      spawn: 'south',
      tags: ['heavy_defense', 'archer_backline'],
    },
    {
      name: 'Lower TH2 attack into TH4 defense',
      defenderTh: 4,
      attackerTh: 2,
      level: 2,
      defense: matchedLayout(4),
      loadouts: scenarioLoadouts('standard', { ships: 2, shipLevel: 2 }),
      spawn: 'ring',
      tags: ['lower_vs_higher'],
    },
    {
      name: 'Higher TH4 attack into TH2 defense',
      defenderTh: 2,
      attackerTh: 4,
      level: 4,
      defense: matchedLayout(2),
      loadouts: scenarioLoadouts('standard', { ships: 5, shipLevel: 4 }),
      spawn: 'ring',
      tags: ['higher_vs_lower'],
    },
  ];
}

const BUCKET_TARGETS = {
  same_th_mixed: { label: '55-70%', winMin: 0.55, winMax: 0.70 },
  spam: { label: '30-50%, median survivors <=50%', winMin: 0.30, winMax: 0.50, maxMedianSurvivors: 0.50 },
  strong_comp: { label: '70-80%', winMin: 0.70, winMax: 0.80 },
  lower_vs_higher: { label: '5-25%', winMin: 0.05, winMax: 0.25 },
  higher_vs_lower: { label: '80-95%', winMin: 0.80, winMax: 0.95 },
  heavy_defense: { label: '25-55%, median survivors <=60%', winMin: 0.25, winMax: 0.55, maxMedianSurvivors: 0.60 },
};

const TIER_SLICE_TARGETS = {
  same_th_mixed: { label: '4-6/8 wins', minWins: 4, maxWins: 6 },
  spam: { label: '2-4/8 wins, median survivors <=50%', minWins: 2, maxWins: 4, maxMedianSurvivors: 0.50, costlyWinSoftFail: true, costlyWinMedianSurvivors: 0.30 },
  strong_comp: { label: '5-7/8 wins', minWins: 5, maxWins: 7 },
};

const LOWER_GAP_TARGETS = {
  one_tier_down: { label: '1-3 wins', minWins: 1, maxWins: 3 },
  two_plus_down: { label: '0 wins acceptable', minWins: 0, maxWins: 0 },
};

const HIGHER_GAP_TARGETS = {
  one_tier_up: { label: '10-11/12 wins', minWins: 10, maxWins: 11 },
  two_plus_up: { label: '7-8/8 wins', minWins: 7, maxWins: 8 },
};

const HEAVY_LAYOUT_TARGET = {
  label: '3-6/10 wins, median survivors <=60%',
  minWins: 3,
  maxWins: 6,
  maxMedianSurvivors: 0.60,
  costlyWinSoftFail: true,
};

const EXPECTED_BUCKET_COUNTS = {
  same_th_mixed: 24,
  spam: 24,
  strong_comp: 24,
  lower_vs_higher: 20,
  higher_vs_lower: 20,
  heavy_defense: 30,
};

const SHIPS_BY_TH = { 1: 1, 2: 2, 3: 4, 4: 5 };
const BATCH_SPAWNS = ['south', 'north', 'west', 'ring'];
const HEAVY_SPAWNS = ['south', 'north', 'west', 'east', 'ring'];
const DEFENSE_BUILDING_TYPES = new Set(['turret', 'archer_tower', 'mage_tower', 'tombstone']);

function clampGrid(value) {
  return Math.max(1, Math.min(23, Math.round(Number(value) || 1)));
}

function layoutClone(buildings) {
  return buildings.map((building) => ({ ...building }));
}

function transformAroundCore(buildings, amount) {
  const centerX = 11;
  const centerZ = 11;
  return buildings.map((building) => ({
    ...building,
    grid_x: clampGrid(centerX + (Number(building.grid_x) - centerX) * amount),
    grid_z: clampGrid(centerZ + (Number(building.grid_z) - centerZ) * amount),
  }));
}

function matchedLayoutVariant(th, variant = 'standard') {
  const buildings = layoutClone(matchedLayout(th));

  if (variant === 'standard') return buildings;
  if (variant === 'compact') return transformAroundCore(buildings, 0.7);
  if (variant === 'spread') return transformAroundCore(buildings, 1.25);

  if (variant === 'anti_south') {
    return buildings.map((building) => {
      if (DEFENSE_BUILDING_TYPES.has(building.type)) {
        return { ...building, grid_z: clampGrid(Number(building.grid_z) + 4) };
      }
      if (building.type === 'town_hall') {
        return { ...building, grid_z: clampGrid(Number(building.grid_z) - 1) };
      }
      return building;
    });
  }

  if (variant === 'exposed_th') {
    return buildings.map((building) => {
      if (building.type === 'town_hall') {
        return { ...building, grid_x: 11, grid_z: clampGrid(Number(building.grid_z) + 5) };
      }
      if (DEFENSE_BUILDING_TYPES.has(building.type)) {
        return { ...building, grid_z: clampGrid(Number(building.grid_z) - 3) };
      }
      return building;
    });
  }

  throw new Error(`Unknown matched layout variant: ${variant}`);
}

function defenseLayout(defenderTh, layoutVariant) {
  if (layoutVariant === 'tombstone_heavy') return tombstoneHeavyLayout();
  if (layoutVariant === 'turret_heavy') return turretHeavyLayout();
  if (layoutVariant === 'archer_backline') return archerBacklineLayout();
  return matchedLayoutVariant(defenderTh, layoutVariant || 'standard');
}

function loadoutOptions(attackerTh, loadoutKind) {
  const th = Math.max(1, Math.min(4, Number(attackerTh) || 1));
  return {
    ships: SHIPS_BY_TH[th] || 1,
    shipLevel: th,
    level: th,
    loadoutKind,
  };
}

function scenarioTags(bucket, loadoutKind, layoutVariant) {
  const tags = [bucket];
  if (bucket === 'same_th_mixed') tags.push('matched');
  if (bucket === 'spam') tags.push(loadoutKind === 'mage_burst' ? 'burst' : 'spam');
  if (bucket === 'strong_comp') tags.push('composition');
  if (bucket === 'lower_vs_higher') tags.push('lower_vs_higher');
  if (bucket === 'higher_vs_lower') tags.push('higher_vs_lower');
  if (bucket === 'heavy_defense') tags.push('heavy_defense', layoutVariant);
  return tags;
}

function makeBatchScenario({ bucket, defenderTh, attackerTh, layoutVariant = 'standard', loadoutKind = 'standard', spawn = 'south' }) {
  const opts = loadoutOptions(attackerTh, loadoutKind);
  const layoutLabel = String(layoutVariant).replace(/_/g, '-');
  const armyLabel = String(loadoutKind).replace(/_/g, '-');
  return {
    name: `${bucket} | A${attackerTh} vs D${defenderTh} | ${armyLabel} | ${layoutLabel} | ${spawn}`,
    bucket,
    defenderTh,
    attackerTh,
    layoutVariant,
    loadoutKind,
    level: attackerTh,
    defense: defenseLayout(defenderTh, layoutVariant),
    loadouts: scenarioLoadouts(loadoutKind, opts),
    spawn,
    tags: scenarioTags(bucket, loadoutKind, layoutVariant),
  };
}

function sameThMixedCases() {
  const cases = [];
  for (const th of [2, 3, 4]) {
    for (const spawn of BATCH_SPAWNS) {
      for (const layoutVariant of ['standard', 'anti_south']) {
        cases.push(makeBatchScenario({
          bucket: 'same_th_mixed',
          defenderTh: th,
          attackerTh: th,
          layoutVariant,
          loadoutKind: 'standard',
          spawn,
        }));
      }
    }
  }
  return cases;
}

function spamCases() {
  const cases = [];
  const layoutBySpawn = { south: 'anti_south', north: 'standard', west: 'compact', ring: 'spread' };
  for (const th of [2, 3, 4]) {
    for (const spawn of BATCH_SPAWNS) {
      for (const loadoutKind of ['archer_spam', 'mage_burst']) {
        cases.push(makeBatchScenario({
          bucket: 'spam',
          defenderTh: th,
          attackerTh: th,
          layoutVariant: layoutBySpawn[spawn] || 'standard',
          loadoutKind,
          spawn,
        }));
      }
    }
  }
  return cases;
}

function strongCompCases() {
  const cases = [];
  const layoutBySpawn = { south: 'standard', north: 'standard', west: 'spread', ring: 'anti_south' };
  for (const th of [2, 3, 4]) {
    for (const spawn of BATCH_SPAWNS) {
      for (const loadoutKind of ['knight_archer', 'knight_mage']) {
        cases.push(makeBatchScenario({
          bucket: 'strong_comp',
          defenderTh: th,
          attackerTh: th,
          layoutVariant: layoutBySpawn[spawn] || 'standard',
          loadoutKind,
          spawn,
        }));
      }
    }
  }
  return cases;
}

function lowerVsHigherCases() {
  const pairs = [
    [1, 2],
    [1, 3],
    [2, 3],
    [2, 4],
    [3, 4],
  ];
  const cases = [];
  for (const [attackerTh, defenderTh] of pairs) {
    for (const spawn of BATCH_SPAWNS) {
      cases.push(makeBatchScenario({
        bucket: 'lower_vs_higher',
        defenderTh,
        attackerTh,
        layoutVariant: spawn === 'ring' ? 'compact' : 'standard',
        loadoutKind: 'standard',
        spawn,
      }));
    }
  }
  return cases;
}

function higherVsLowerCases() {
  const pairs = [
    [2, 1],
    [3, 1],
    [3, 2],
    [4, 2],
    [4, 3],
  ];
  const cases = [];
  for (const [attackerTh, defenderTh] of pairs) {
    for (const spawn of BATCH_SPAWNS) {
      cases.push(makeBatchScenario({
        bucket: 'higher_vs_lower',
        defenderTh,
        attackerTh,
        layoutVariant: spawn === 'south' ? 'exposed_th' : 'standard',
        loadoutKind: 'standard',
        spawn,
      }));
    }
  }
  return cases;
}

function heavyDefenseCases() {
  const cases = [];
  for (const layoutVariant of ['tombstone_heavy', 'turret_heavy', 'archer_backline']) {
    for (const spawn of HEAVY_SPAWNS) {
      for (const loadoutKind of ['standard', 'knight_mage']) {
        cases.push(makeBatchScenario({
          bucket: 'heavy_defense',
          defenderTh: 4,
          attackerTh: 4,
          layoutVariant,
          loadoutKind,
          spawn,
        }));
      }
    }
  }
  return cases;
}

function assertExpectedBucketCounts(cases) {
  const counts = new Map();
  for (const scenario of cases) {
    counts.set(scenario.bucket, (counts.get(scenario.bucket) || 0) + 1);
  }
  for (const [bucket, expected] of Object.entries(EXPECTED_BUCKET_COUNTS)) {
    const actual = counts.get(bucket) || 0;
    if (actual !== expected) {
      throw new Error(`Bucket ${bucket} expected ${expected} cases, got ${actual}`);
    }
  }
}

function batchScenarios() {
  const cases = [
    ...sameThMixedCases(),
    ...spamCases(),
    ...strongCompCases(),
    ...lowerVsHigherCases(),
    ...higherVsLowerCases(),
    ...heavyDefenseCases(),
  ];
  assertExpectedBucketCounts(cases);
  const bucketCounts = new Map();
  return cases.map((scenario, index) => {
    const bucketIndex = (bucketCounts.get(scenario.bucket) || 0) + 1;
    bucketCounts.set(scenario.bucket, bucketIndex);
    return {
      ...scenario,
      caseId: `${scenario.bucket}-${String(bucketIndex).padStart(2, '0')}`,
      matrixIndex: index + 1,
    };
  });
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function formatHp(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
}

function summarize(result) {
  const buildingHps = Array.isArray(result._buildingHPs) ? result._buildingHPs : [];
  const troopEndState = Array.isArray(result._troopEndState) ? result._troopEndState : [];
  const th = buildingHps.find((b) => b.type === 'town_hall');
  const destroyed = buildingHps.filter((b) => Number(b.hp) <= 0).length;
  const alive = troopEndState.filter((t) => Number(t.hp) > 0).length;
  const spawned = troopEndState.length;
  const alivePct = spawned > 0 ? alive / spawned : 0;

  return {
    result: result.resolvedResult || 'unknown',
    valid: result.valid === true,
    reason: result.reason || 'No verifier reason',
    simTime: Number(result._simTimeSec) || 0,
    thHp: th ? Math.max(0, Number(th.hp) || 0) : 0,
    thMaxHp: th ? Number(th.maxHp) || 0 : 0,
    thHpPct: th && Number(th.maxHp) > 0 ? Math.max(0, Number(th.hp) || 0) / Number(th.maxHp) : 0,
    thDestroyed: !!result.townHallDestroyed,
    buildingsDestroyed: destroyed,
    buildingCount: buildingHps.length,
    buildingDestroyPct: buildingHps.length > 0 ? destroyed / buildingHps.length : 0,
    troopsAlive: alive,
    troopsSpawned: spawned,
    troopAlivePct: alivePct,
    casualties: result.casualties || {},
  };
}

function warningsFor(scenario, summary) {
  const warnings = [];
  const victory = summary.result === 'victory';
  const tags = new Set(scenario.tags || []);
  const bucket = scenario.bucket || '';
  const loadoutKind = scenario.loadoutKind || '';
  const isArcherSpam = (bucket === 'spam' && loadoutKind === 'archer_spam') || (!bucket && tags.has('spam'));
  const isMageBurst = (bucket === 'spam' && loadoutKind === 'mage_burst') || (!bucket && tags.has('burst'));
  const isMatched = bucket === 'same_th_mixed' || tags.has('matched');
  const isHeavyDefense = bucket === 'heavy_defense' || tags.has('heavy_defense');
  const isLowerVsHigher = bucket === 'lower_vs_higher' || tags.has('lower_vs_higher');
  const isHigherVsLower = bucket === 'higher_vs_lower' || tags.has('higher_vs_lower');

  if (tags.has('premium_deferred')) {
    return warnings;
  }

  if (!summary.valid) {
    warnings.push(`verifier rejected replay (${summary.reason})`);
  }
  if (summary.simTime >= TIME_LIMIT_SEC - 1) {
    warnings.push('battle reached the time limit');
  }
  if (summary.troopsSpawned === 0) {
    warnings.push('no troops spawned');
  }
  if (isMatched) {
    if (victory && summary.simTime < 45 && summary.troopAlivePct > 0.7) {
      warnings.push('matched attack looks like a fast steamroll');
    }
    if (!victory && summary.thHpPct > 0.45) {
      warnings.push('matched attack is struggling to threaten Town Hall');
    }
  }

  if (isArcherSpam && victory && summary.troopAlivePct > 0.5) {
    warnings.push('single-type Archer spam wins above the target survivor band');
  }
  if (isMageBurst) {
    if (victory && summary.troopAlivePct > 0.5) {
      warnings.push('single-type Mage burst wins above the target survivor band');
    }
    if (!victory && summary.thHpPct > 0.75) {
      warnings.push('Mage burst fails before meaningful Town Hall damage');
    }
  }
  if (tags.has('demon_solo')) {
    if (victory) {
      warnings.push('DemonKing solo can defeat this base');
    } else if (summary.thHpPct > 0.9) {
      warnings.push('DemonKing solo barely dents Town Hall');
    }
  }
  if (isHeavyDefense) {
    if (victory && summary.troopAlivePct > 0.6) {
      warnings.push('heavy defense loses while leaving many attackers alive');
    }
    if (!victory && summary.thHpPct > 0.8) {
      warnings.push('heavy defense may be overly punishing');
    }
  }
  if (isLowerVsHigher && victory) {
    warnings.push('lower TH attacker beats higher TH defense');
  }
  if (isLowerVsHigher && !victory) {
    const destroyedPct = summary.buildingCount > 0 ? summary.buildingsDestroyed / summary.buildingCount : 0;
    if (summary.troopsSpawned > 0 && summary.troopsAlive === 0 && summary.thHpPct > 0.8 && destroyedPct < 0.25) {
      warnings.push('lower TH attack wipes before meaningful base damage');
    }
  }
  if (isHigherVsLower && !victory) {
    warnings.push('higher TH attacker fails against lower TH defense');
  }
  if (isHigherVsLower && victory && (summary.troopAlivePct > 0.95 || summary.simTime < 20)) {
    warnings.push('higher TH attack steamrolls lower TH without real losses');
  }

  return warnings;
}

function formatCasualties(casualties) {
  const entries = Object.entries(casualties || {}).filter(([, count]) => count > 0);
  if (entries.length === 0) return 'none';
  return entries.map(([name, count]) => `${name} x${count}`).join(', ');
}

function runScenario(verifyReplay, scenario) {
  validateRoster(scenario.name, scenario.loadouts);
  const actions = shipActions(scenario.loadouts, scenario.spawn);
  const originalLog = console.log;
  let result;

  try {
    console.log = () => {};
    result = verifyReplay({
      defenderBuildings: scenario.defense,
      actions,
      claimedResult: 'defeat',
      gridConfig: CANONICAL_GRID_CONFIG,
      gridConfigs: CANONICAL_GRID_CONFIGS,
      serverTroopLevels: troopLevels(scenario.level),
      defenderAltarLevels: {},
      debugTrace: false,
    });
  } finally {
    console.log = originalLog;
  }

  const summary = summarize(result || {});
  return {
    scenario,
    summary,
    warnings: warningsFor(scenario, summary),
  };
}

function failedScenario(scenario, err) {
  return {
    scenario,
    summary: {
      result: 'error',
      valid: false,
      reason: err?.message || String(err),
      simTime: 0,
      thHp: 0,
      thMaxHp: 0,
      thHpPct: 0,
      thDestroyed: false,
      buildingsDestroyed: 0,
      buildingCount: scenario.defense?.length || 0,
      troopsAlive: 0,
      troopsSpawned: 0,
      troopAlivePct: 0,
      casualties: {},
    },
    warnings: [`scenario failed: ${err?.message || err}`],
  };
}

function median(values) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function pp(value) {
  const n = Math.round((Number(value) || 0) * 100);
  return `${n >= 0 ? '+' : ''}${n}pp`;
}

function bucketBandMiss(target, winRate) {
  if (!target) return { amount: 0, direction: 'none' };
  if (winRate < target.winMin) return { amount: target.winMin - winRate, direction: 'low' };
  if (winRate > target.winMax) return { amount: winRate - target.winMax, direction: 'high' };
  return { amount: 0, direction: 'none' };
}

function bucketEdgeDistance(target, winRate) {
  if (!target || winRate < target.winMin || winRate > target.winMax) return Infinity;
  return Math.min(winRate - target.winMin, target.winMax - winRate);
}

function bucketHasCostlyWins(bucket, medianSurvivors) {
  return (bucket === 'spam' || bucket === 'heavy_defense') && medianSurvivors <= 0.25;
}

function verdictRank(status) {
  if (status === 'FAIL') return 3;
  if (status === 'WARN') return 2;
  if (status === 'PASS') return 1;
  return 0;
}

function summarizeEntries(entries) {
  const cases = entries.length;
  const wins = entries.filter((entry) => entry.summary.result === 'victory').length;
  const invalid = entries.filter((entry) => !entry.summary.valid || entry.summary.result === 'error').length;
  const warnings = entries.reduce((sum, entry) => sum + entry.warnings.length, 0);
  const winRate = cases > 0 ? wins / cases : 0;
  return {
    cases,
    wins,
    defeats: cases - wins,
    invalid,
    warnings,
    warningRate: cases > 0 ? warnings / cases : 0,
    winRate,
    medianSurvivors: median(entries.map((entry) => entry.summary.troopAlivePct)),
    medianSimTime: median(entries.map((entry) => entry.summary.simTime)),
    medianThDamage: median(entries.map((entry) => 1 - entry.summary.thHpPct)),
    medianBuildingDestroyPct: median(entries.map((entry) => entry.summary.buildingDestroyPct)),
  };
}

function aggregateBuckets(results) {
  const groups = new Map();
  for (const entry of results) {
    const bucket = entry.scenario.bucket || 'unbucketed';
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(entry);
  }

  return Object.keys(BUCKET_TARGETS).map((bucket) => {
    const entries = groups.get(bucket) || [];
    const target = BUCKET_TARGETS[bucket];
    const stats = summarizeEntries(entries);
    const { cases, wins, invalid, warnings, winRate, medianSurvivors } = stats;
    const miss = bucketBandMiss(target, winRate);
    const edgeDistance = bucketEdgeDistance(target, winRate);
    const warnReasons = [];
    const failReasons = [];

    if (cases < 5) warnReasons.push(`low sample n=${cases}`);
    if (invalid > 0) failReasons.push(`${invalid} invalid/error cases`);

    if (miss.amount > 0) {
      const msg = `${miss.direction} by ${pp(miss.amount)}`;
      if (miss.direction === 'high' && bucketHasCostlyWins(bucket, medianSurvivors)) {
        warnReasons.push(`${msg}, but wins are costly`);
      } else if (miss.amount > 0.050001) {
        failReasons.push(msg);
      } else {
        warnReasons.push(msg);
      }
    } else if (edgeDistance <= 0.05) {
      warnReasons.push(`near ${edgeDistance === winRate - target.winMin ? 'low' : 'high'} edge`);
    }

    if (target.maxMedianSurvivors != null && medianSurvivors > target.maxMedianSurvivors) {
      const over = medianSurvivors - target.maxMedianSurvivors;
      const msg = `median survivors high by ${pp(over)}`;
      if (over > 0.10 || (bucket === 'spam' && winRate > target.winMax)) failReasons.push(msg);
      else warnReasons.push(msg);
    }

    const status = failReasons.length ? 'FAIL' : (warnReasons.length || warnings > cases * 0.25 ? 'WARN' : 'PASS');

    return {
      bucket,
      target,
      cases,
      wins,
      defeats: cases - wins,
      invalid,
      warnings,
      warningRate: stats.warningRate,
      winRate,
      medianSurvivors,
      medianSimTime: stats.medianSimTime,
      medianThDamage: stats.medianThDamage,
      medianBuildingDestroyPct: stats.medianBuildingDestroyPct,
      miss,
      status,
      reasons: [...failReasons, ...warnReasons],
    };
  });
}

function sliceStatus(stats, target) {
  const warnReasons = [];
  const failReasons = [];

  if (stats.cases === 0) {
    failReasons.push('no cases');
  }
  if (stats.invalid > 0) {
    failReasons.push(`${stats.invalid} invalid/error cases`);
  }

  if (target && stats.cases > 0) {
    if (stats.wins < target.minWins) {
      const miss = target.minWins - stats.wins;
      const reason = `low by ${miss} win${miss === 1 ? '' : 's'}`;
      if (miss > 1) failReasons.push(reason);
      else warnReasons.push(reason);
    }
    if (stats.wins > target.maxWins) {
      const miss = stats.wins - target.maxWins;
      const reason = `high by ${miss} win${miss === 1 ? '' : 's'}`;
      const costlyWinLimit = target.costlyWinMedianSurvivors ?? 0.25;
      if (target.costlyWinSoftFail && stats.medianSurvivors <= costlyWinLimit) {
        warnReasons.push(`${reason}, but wins are costly`);
      } else if (miss > 1) {
        failReasons.push(reason);
      } else {
        warnReasons.push(reason);
      }
    }
    if (target.maxMedianSurvivors != null && stats.medianSurvivors > target.maxMedianSurvivors) {
      const over = stats.medianSurvivors - target.maxMedianSurvivors;
      const reason = `median survivors high by ${pp(over)}`;
      if (over > 0.10) failReasons.push(reason);
      else warnReasons.push(reason);
    }
  }

  if (!failReasons.length && !warnReasons.length && stats.warnings > stats.cases * 0.25) {
    warnReasons.push('scenario warning rate high');
  }

  return {
    status: failReasons.length ? 'FAIL' : (warnReasons.length ? 'WARN' : 'PASS'),
    reasons: [...failReasons, ...warnReasons],
  };
}

function pushSliceSummary(summaries, title, key, entries, target) {
  const stats = summarizeEntries(entries);
  const verdict = sliceStatus(stats, target);
  summaries.push({
    title,
    key,
    target,
    ...stats,
    status: verdict.status,
    reasons: verdict.reasons,
  });
}

function aggregateSlices(results) {
  const summaries = [];

  for (const bucket of Object.keys(TIER_SLICE_TARGETS)) {
    for (const defenderTh of [2, 3, 4]) {
      pushSliceSummary(
        summaries,
        `${bucket}_by_th`,
        `DTH${defenderTh}`,
        results.filter((entry) => entry.scenario.bucket === bucket && Number(entry.scenario.defenderTh) === defenderTh),
        TIER_SLICE_TARGETS[bucket],
      );
    }
  }

  pushSliceSummary(
    summaries,
    'lower_vs_higher_by_gap',
    'one_tier_down',
    results.filter((entry) => entry.scenario.bucket === 'lower_vs_higher' && Number(entry.scenario.defenderTh) - Number(entry.scenario.attackerTh) === 1),
    LOWER_GAP_TARGETS.one_tier_down,
  );
  pushSliceSummary(
    summaries,
    'lower_vs_higher_by_gap',
    'two_plus_down',
    results.filter((entry) => entry.scenario.bucket === 'lower_vs_higher' && Number(entry.scenario.defenderTh) - Number(entry.scenario.attackerTh) >= 2),
    LOWER_GAP_TARGETS.two_plus_down,
  );

  pushSliceSummary(
    summaries,
    'higher_vs_lower_by_gap',
    'one_tier_up',
    results.filter((entry) => entry.scenario.bucket === 'higher_vs_lower' && Number(entry.scenario.attackerTh) - Number(entry.scenario.defenderTh) === 1),
    HIGHER_GAP_TARGETS.one_tier_up,
  );
  pushSliceSummary(
    summaries,
    'higher_vs_lower_by_gap',
    'two_plus_up',
    results.filter((entry) => entry.scenario.bucket === 'higher_vs_lower' && Number(entry.scenario.attackerTh) - Number(entry.scenario.defenderTh) >= 2),
    HIGHER_GAP_TARGETS.two_plus_up,
  );

  for (const layoutVariant of ['tombstone_heavy', 'turret_heavy', 'archer_backline']) {
    pushSliceSummary(
      summaries,
      'heavy_defense_by_layout',
      String(layoutVariant).replace(/_/g, '-'),
      results.filter((entry) => entry.scenario.bucket === 'heavy_defense' && entry.scenario.layoutVariant === layoutVariant),
      HEAVY_LAYOUT_TARGET,
    );
  }

  return summaries;
}

function scenarioRiskScore(entry) {
  const { scenario, summary, warnings } = entry;
  const target = BUCKET_TARGETS[scenario.bucket];
  let score = warnings.length * 10;
  if (!summary.valid || summary.result === 'error') score += 1000;
  if (target) {
    if (scenario.bucket === 'spam' && summary.result === 'victory') score += Math.max(0, summary.troopAlivePct - 0.5) * 100;
    if (scenario.bucket === 'heavy_defense' && summary.result === 'victory') score += Math.max(0, summary.troopAlivePct - 0.6) * 100;
    if (scenario.bucket === 'lower_vs_higher' && summary.result === 'victory') score += 100;
    if (scenario.bucket === 'lower_vs_higher' && summary.result !== 'victory') {
      score += Math.max(0, summary.thHpPct - 0.8) * 40;
      score += Math.max(0, 0.25 - summary.buildingDestroyPct) * 40;
    }
    if (scenario.bucket === 'higher_vs_lower' && summary.result === 'victory') {
      score += Math.max(0, summary.troopAlivePct - 0.95) * 60;
      score += Math.max(0, 20 - summary.simTime) / 20 * 30;
    }
  }
  return score;
}

function worstScenarioEntries(results, limit = 15) {
  return results
    .map((entry) => ({ entry, score: scenarioRiskScore(entry) }))
    .filter(({ entry, score }) => score > 0 || entry.warnings.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

function renderScenarioBlock(entry, index) {
  const { scenario, summary, warnings } = entry;
  const result = summary.result.toUpperCase();
  const thState = summary.thDestroyed ? 'destroyed' : `${pct(summary.thHpPct)} remaining`;
  const troopState = `${summary.troopsAlive}/${summary.troopsSpawned} alive (${pct(summary.troopAlivePct)})`;
  const buildingState = `${summary.buildingsDestroyed}/${summary.buildingCount}`;
  const prefix = index == null ? '-' : `${String(index + 1).padStart(2, '0')}.`;
  return [
    `${prefix} ${scenario.name}`,
    `    Bucket: ${scenario.bucket || 'none'} | TH: attacker ${scenario.attackerTh} vs defender ${scenario.defenderTh} | Result: ${result} | Sim: ${summary.simTime.toFixed(1)}s`,
    `    Town Hall: ${formatHp(summary.thHp)}/${formatHp(summary.thMaxHp)} (${thState}) | Buildings destroyed: ${buildingState}`,
    `    Troops: ${troopState} | Casualties: ${formatCasualties(summary.casualties)}`,
    `    Warnings: ${warnings.length ? warnings.join('; ') : 'none'}`,
  ];
}

function renderReport(results, options = {}) {
  const lines = [];
  const victories = results.filter((r) => r.summary.result === 'victory').length;
  const invalid = results.filter((r) => !r.summary.valid || r.summary.result === 'error').length;
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const isBatch = options.mode === 'batch';

  lines.push(isBatch ? 'Combat Balance Batch Report' : 'Combat Balance Report');
  lines.push('=====================');
  lines.push('Core roster: Knight, Mage, Archer');
  lines.push('Premium balance deferred: DemonKing');
  lines.push(`Scenarios: ${results.length} | Victories: ${victories} | Defeats: ${results.length - victories} | Invalid: ${invalid} | Warnings: ${totalWarnings}`);
  lines.push(`Simulator: server/combat_session.js verifyReplay (server/db.js blocked and stubbed)`);
  lines.push('');

  if (isBatch) {
    const bucketSummaries = aggregateBuckets(results);
    const sliceSummaries = aggregateSlices(results);
    const worstBuckets = bucketSummaries.filter((summary) => summary.status !== 'PASS');
    const worstSlices = sliceSummaries.filter((summary) => summary.status !== 'PASS');
    const overallStatus = [...bucketSummaries, ...sliceSummaries].reduce((status, summary) => (
      verdictRank(summary.status) > verdictRank(status) ? summary.status : status
    ), 'PASS');

    lines.push(`Overall Verdict: ${overallStatus}`);
    if (worstBuckets.length) {
      lines.push(`Open Buckets: ${worstBuckets.map((summary) => `${summary.bucket}=${summary.status}`).join(', ')}`);
    }
    if (worstSlices.length) {
      lines.push(`Open Slices: ${worstSlices.map((summary) => `${summary.title}/${summary.key}=${summary.status}`).join(', ')}`);
    }
    lines.push('');
    lines.push('Bucket Summary');
    lines.push('--------------');
    for (const summary of bucketSummaries) {
      const missText = summary.miss.amount > 0 ? ` | ${summary.miss.direction} ${pp(summary.miss.amount)}` : '';
      const reasonText = summary.reasons.length ? ` | ${summary.reasons.join('; ')}` : '';
      lines.push(`${summary.status.padEnd(4)} ${summary.bucket.padEnd(17)} target ${summary.target.label.padEnd(30)} ${String(summary.wins).padStart(2, ' ')}/${String(summary.cases).padEnd(2, ' ')} wins (${pct(summary.winRate).padStart(4, ' ')}) | median alive ${pct(summary.medianSurvivors).padStart(4, ' ')} | median TH dmg ${pct(summary.medianThDamage).padStart(4, ' ')} | median time ${summary.medianSimTime.toFixed(1)}s${missText}${reasonText}`);
    }

    lines.push('');
    lines.push('Tier/Layout Breakdown');
    lines.push('---------------------');
    for (const summary of sliceSummaries) {
      const reasonText = summary.reasons.length ? ` | ${summary.reasons.join('; ')}` : '';
      lines.push(`${summary.status.padEnd(4)} ${summary.title.padEnd(25)} ${summary.key.padEnd(15)} target ${summary.target.label.padEnd(36)} ${String(summary.wins).padStart(2, ' ')}/${String(summary.cases).padEnd(2, ' ')} wins (${pct(summary.winRate).padStart(4, ' ')}) | median alive ${pct(summary.medianSurvivors).padStart(4, ' ')} | median TH dmg ${pct(summary.medianThDamage).padStart(4, ' ')}${reasonText}`);
    }

    const worst = worstScenarioEntries(results);
    lines.push('');
    lines.push('Worst Cases');
    lines.push('-----------');
    if (worst.length) {
      worst.forEach((entry) => {
        lines.push(...renderScenarioBlock(entry, null));
        lines.push('');
      });
    } else {
      lines.push('No scenario-level warnings.');
      lines.push('');
    }

    if (!options.includeDetails) {
      lines.push('Run with --details to print every generated scenario.');
      lines.push('Run with --smoke for the old 15-scenario smoke report.');
      return lines.join('\n');
    }

    lines.push('Scenario Details');
    lines.push('----------------');
  }

  results.forEach((entry, index) => {
    lines.push(...renderScenarioBlock(entry, index));
    lines.push('');
  });

  if (totalWarnings > 0) {
    lines.push('Warning Summary');
    lines.push('---------------');
    for (const entry of results) {
      for (const warning of entry.warnings) {
        lines.push(`- ${entry.scenario.name}: ${warning}`);
      }
    }
  }

  return lines.join('\n');
}

function main() {
  const verifyReplay = loadVerifierWithoutDb();
  const args = new Set(process.argv.slice(2));
  const mode = args.has('--smoke') ? 'smoke' : 'batch';
  const includeDetails = args.has('--details') || mode === 'smoke';
  const selectedScenarios = mode === 'smoke' ? smokeScenarios() : batchScenarios();
  const results = selectedScenarios.map((scenario) => {
    try {
      return runScenario(verifyReplay, scenario);
    } catch (err) {
      return failedScenario(scenario, err);
    }
  });
  process.stdout.write(`${renderReport(results, { mode, includeDetails })}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`combat_balance_report failed: ${err?.message || err}\n`);
    process.exitCode = 1;
  }
}
