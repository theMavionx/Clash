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
  town_hall: { size: [4, 4], hp_levels: [3500, 6000, 12500, 17000] },
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
    );
  }

  if (th >= 3) {
    buildings.push(
      b('turret', 3, 8, 17),
      b('turret', 3, 19, 12),
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
    b('archer_tower', 4, 4, 4),
    b('archer_tower', 4, 21, 4),
    b('mage_tower', 2, 12, 5),
    b('mage_tower', 2, 12, 20),
    b('turret', 3, 5, 21),
    b('turret', 3, 21, 21),
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
    b('archer_tower', 4, 4, 4),
    b('archer_tower', 4, 21, 4),
    b('mage_tower', 2, 12, 5),
    b('mage_tower', 2, 12, 20),
    b('tombstone', 3, 12, 20),
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
    b('tombstone', 3, 11, 8),
    b('turret', 4, 7, 18),
    b('turret', 4, 18, 18),
    b('mage_tower', 2, 8, 8),
    b('mage_tower', 2, 17, 8),
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
  if (kind === 'knight_archer') return chunkShips(repeatPattern(['knight', 'archer'], slots), ships, slotsPerShip);
  if (kind === 'knight_mage') return chunkShips(repeatPattern(['knight', 'knight', 'mage'], slots), ships, slotsPerShip);
  if (kind === 'demon_solo') return chunkShips([demonToken(level), SLOT_FILLER], 1, slotsPerShip);
  if (kind === 'demon_mixed') return chunkShips(withDemon(level, repeatPattern(['knight', 'archer', 'mage'], slots - 2)), ships, slotsPerShip);
  if (kind === 'standard') return chunkShips(standardMix(slots, options.demonLevel), ships, slotsPerShip);

  throw new Error(`Unknown loadout kind: ${kind}`);
}

function scenarios() {
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
      spawn: 'ring',
      tags: ['matched'],
    },
    {
      name: 'TH3 matched mixed roster',
      defenderTh: 3,
      attackerTh: 3,
      level: 3,
      defense: matchedLayout(3),
      loadouts: scenarioLoadouts('standard', { ships: 4, shipLevel: 3 }),
      spawn: 'ring',
      tags: ['matched'],
    },
    {
      name: 'TH4 matched mixed roster',
      defenderTh: 4,
      attackerTh: 4,
      level: 4,
      defense: matchedLayout(4),
      loadouts: scenarioLoadouts('standard', { ships: 5, shipLevel: 4 }),
      spawn: 'ring',
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
  if (tags.has('matched')) {
    if (victory && summary.simTime < 45 && summary.troopAlivePct > 0.7) {
      warnings.push('matched attack looks like a fast steamroll');
    }
    if (!victory && summary.thHpPct > 0.45) {
      warnings.push('matched attack is struggling to threaten Town Hall');
    }
  }

  if (tags.has('spam') && victory && summary.troopAlivePct > 0.5) {
    warnings.push('single-type Archer spam wins above the target survivor band');
  }
  if (tags.has('burst')) {
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
  if (tags.has('heavy_defense')) {
    if (victory && summary.troopAlivePct > 0.6) {
      warnings.push('heavy defense loses while leaving many attackers alive');
    }
    if (!victory && summary.thHpPct > 0.8) {
      warnings.push('heavy defense may be overly punishing');
    }
  }
  if (tags.has('lower_vs_higher') && victory) {
    warnings.push('lower TH attacker beats higher TH defense');
  }
  if (tags.has('lower_vs_higher') && !victory) {
    const destroyedPct = summary.buildingCount > 0 ? summary.buildingsDestroyed / summary.buildingCount : 0;
    if (summary.troopsSpawned > 0 && summary.troopsAlive === 0 && summary.thHpPct > 0.8 && destroyedPct < 0.25) {
      warnings.push('lower TH attack wipes before meaningful base damage');
    }
  }
  if (tags.has('higher_vs_lower') && !victory) {
    warnings.push('higher TH attacker fails against lower TH defense');
  }
  if (tags.has('higher_vs_lower') && victory && (summary.troopAlivePct > 0.95 || summary.simTime < 20)) {
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

function renderReport(results) {
  const lines = [];
  const victories = results.filter((r) => r.summary.result === 'victory').length;
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

  lines.push('Combat Balance Report');
  lines.push('=====================');
  lines.push('Core roster: Knight, Mage, Archer');
  lines.push('Premium balance deferred: DemonKing');
  lines.push(`Scenarios: ${results.length} | Victories: ${victories} | Defeats: ${results.length - victories} | Warnings: ${totalWarnings}`);
  lines.push(`Simulator: server/combat_session.js verifyReplay (server/db.js blocked and stubbed)`);
  lines.push('');

  results.forEach((entry, index) => {
    const { scenario, summary, warnings } = entry;
    const result = summary.result.toUpperCase();
    const thState = summary.thDestroyed ? 'destroyed' : `${pct(summary.thHpPct)} remaining`;
    const troopState = `${summary.troopsAlive}/${summary.troopsSpawned} alive (${pct(summary.troopAlivePct)})`;
    const buildingState = `${summary.buildingsDestroyed}/${summary.buildingCount}`;

    lines.push(`${String(index + 1).padStart(2, '0')}. ${scenario.name}`);
    lines.push(`    TH: attacker ${scenario.attackerTh} vs defender ${scenario.defenderTh} | Result: ${result} | Sim: ${summary.simTime.toFixed(1)}s`);
    lines.push(`    Town Hall: ${formatHp(summary.thHp)}/${formatHp(summary.thMaxHp)} (${thState}) | Buildings destroyed: ${buildingState}`);
    lines.push(`    Troops: ${troopState} | Casualties: ${formatCasualties(summary.casualties)}`);
    lines.push(`    Warnings: ${warnings.length ? warnings.join('; ') : 'none'}`);
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
  const results = scenarios().map((scenario) => {
    try {
      return runScenario(verifyReplay, scenario);
    } catch (err) {
      return failedScenario(scenario, err);
    }
  });
  process.stdout.write(`${renderReport(results)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`combat_balance_report failed: ${err?.message || err}\n`);
    process.exitCode = 1;
  }
}
