#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-th6-balance-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('../db');
const { verifyReplay } = require('../combat_session');
const {
  CANONICAL_GRID_CONFIGS,
  TROOP_STATS,
  DEFENSE_STATS,
  HORROR_EVOLUTION,
  SKELETON_GUARD,
  computeNecromancerSkeletonStats,
} = require('../combat_defs');

function gridToWorld(gridX, gridZ, sizeX, sizeZ, config) {
  const localX = -config.grid_extent_x / 2 + gridX * config.cell_size + sizeX * config.cell_size / 2;
  const localZ = -config.grid_extent_z / 2 + gridZ * config.cell_size + sizeZ * config.cell_size / 2;
  const cos = Math.cos(config.grid_rotation);
  const sin = Math.sin(config.grid_rotation);
  return {
    x: config.grid_center_x + localX * cos + localZ * sin,
    z: config.grid_center_z - localX * sin + localZ * cos,
  };
}

let nextBuildingId = 1;
function building(type, level, gridX, gridZ) {
  const def = gameDb.BUILDING_DEFS[type];
  const clamped = Math.max(1, Math.min(def.hp_levels.length, Number(level) || 1));
  const hp = Number(def.hp_levels[clamped - 1]);
  return {
    id: nextBuildingId++,
    type,
    level: clamped,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: 0,
    hp,
    max_hp: hp,
  };
}

function th6Base() {
  return [
    building('town_hall', 6, 11, 8),
    building('mine', 6, 2, 2),
    building('mine', 6, 7, 2),
    building('mine', 6, 18, 2),
    building('mine', 6, 23, 2),
    building('sawmill', 6, 2, 7),
    building('sawmill', 6, 7, 7),
    building('sawmill', 6, 18, 7),
    building('sawmill', 6, 23, 7),
    building('barn', 6, 11, 3),
    building('storage', 6, 1, 12),
    building('storage', 6, 20, 12),
    building('storage', 6, 11, 17),
    building('tombstone', 5, 6, 11),
    building('tombstone', 5, 17, 11),
    building('tombstone', 5, 11, 13),
    building('archer_tower', 6, 3, 17),
    building('archer_tower', 6, 20, 17),
    building('archer_tower', 6, 11, 21),
    building('turret', 6, 7, 17),
    building('turret', 6, 17, 17),
    building('turret', 6, 12, 24),
    building('mage_tower', 6, 7, 22),
    building('mage_tower', 6, 18, 22),
    building('mortar', 2, 3, 23),
    building('mortar', 2, 22, 23),
    building('shark_trap', 6, 3, 25),
    building('shark_trap', 6, 12, 25),
    building('shark_trap', 6, 22, 25),
  ];
}

function baseForTownHall(townHallLevel) {
  const occurrenceByType = new Map();
  return th6Base()
    .filter((entry) => {
      const occurrence = (occurrenceByType.get(entry.type) || 0) + 1;
      occurrenceByType.set(entry.type, occurrence);
      const limits = gameDb.TH_MAX_COUNT[entry.type] || [1];
      return occurrence <= Number(limits[Math.min(townHallLevel - 1, limits.length - 1)] || 0);
    })
    .map((entry) => {
      const level = gameDb.getBuildingMaxLevelForTownHall(entry.type, townHallLevel);
      const hp = Number(gameDb.BUILDING_DEFS[entry.type].hp_levels[level - 1]);
      return { ...entry, level, hp, max_hp: hp };
    });
}

function attackActions(troops, spawnColumn = null) {
  const attackGrid = CANONICAL_GRID_CONFIGS[2];
  return troops.map((troop, index) => {
    const gridX = spawnColumn == null ? 1 + (index % 25) : Math.max(0, Math.min(26, spawnColumn + (index % 3) - 1));
    const gridZ = spawnColumn == null ? Math.floor(index / 25) : Math.floor(index / 15);
    const point = gridToWorld(gridX, gridZ, 1, 1, attackGrid);
    return {
      type: 'deploy_troop',
      troop,
      troopLevel: 7,
      x: point.x,
      z: point.z,
      t: index * 0.08,
      deploy_index: index,
    };
  });
}

function tacticalActions(defenderBuildings, options = {}) {
  if (!options.tactical) return [];

  const townHall = defenderBuildings.find((entry) => entry.type === 'town_hall');
  const exposedDefenses = defenderBuildings
    .filter((entry) => entry.type === 'mortar' || entry.type === 'mage_tower')
    .slice(0, 3);
  const actions = exposedDefenses.map((entry, index) => ({
    type: 'cannon_fire',
    buildingId: entry.id,
    t: 0.25 + index * 1.05,
  }));
  if (townHall) {
    actions.push({
      type: 'rally_drop',
      buildingId: townHall.id,
      t: 4,
      flight_time: 0,
    });
  }
  return actions;
}

function repeated(pattern, count) {
  return Array.from({ length: count }, (_, index) => pattern[index % pattern.length]);
}

function runScenario(name, troops, options = {}) {
  const levels = {
    Knight: 7,
    Mage: 7,
    Archer: 7,
    Mimic: 7,
    Necromancer: 7,
    Horror: 7,
    MechanicalDragon: 7,
    IceGolem: 7,
    DemonKing: 7,
    FireDragon: 7,
  };
  const originalLog = console.log;
  console.log = () => {};
  let result;
  try {
    const defenderBuildings = baseForTownHall(options.townHallLevel || 6);
    result = verifyReplay({
      defenderBuildings,
      actions: [
        ...attackActions(troops, options.spawnColumn),
        ...tacticalActions(defenderBuildings, options),
      ],
      claimedResult: 'defeat',
      gridConfigs: CANONICAL_GRID_CONFIGS,
      serverTroopLevels: levels,
      serverNftRarities: { demon_king: 'common', fire_dragon: 'common' },
    });
  } finally {
    console.log = originalLog;
  }
  return {
    name,
    slotCost: troops.reduce((sum, troop) => {
      if (troop === 'MechanicalDragon' || troop === 'IceGolem') return sum + 4;
      if (troop === 'Horror') return sum + 3;
      if (troop === 'Necromancer' || troop === 'DemonKing' || troop === 'FireDragon') return sum + 2;
      return sum + 1;
    }, 0),
    deployed: troops.length,
    result: result.resolvedResult,
    thHpPct: Number((result.townHallHpPct * 100).toFixed(1)),
    buildingsDestroyed: result.buildingsDestroyed,
    troopsAlive: result._troopsAlive,
    simTime: result._simTimeSec,
    trapsTriggered: result._sharkTrapsTriggered,
    townHallLevel: options.townHallLevel || 6,
    spawnColumn: options.spawnColumn,
    tactical: !!options.tactical,
  };
}

try {
  const baselineScenarios = [
    runScenario('TH5 baseline', repeated(['Knight', 'Archer', 'Mage'], 45), { townHallLevel: 5 }),
    runScenario('balanced normal roster', repeated(['Knight', 'Archer', 'Mage'], 45)),
    runScenario('frontline-heavy roster', repeated(['Knight', 'Knight', 'Archer', 'Mage'], 45)),
    runScenario('trap-runner roster', repeated(['Mimic', 'Knight', 'Archer', 'Mage'], 45)),
    runScenario('necromancer support roster', [
      ...repeated(['Necromancer'], 6),
      ...repeated(['Knight', 'Archer', 'Mage'], 33),
    ]),
    runScenario('horror attrition squad', repeated(['Horror'], 15)),
    runScenario('three horror vanguard', [
      ...repeated(['Horror'], 3),
      ...repeated(['Knight', 'Archer', 'Mage'], 36),
    ]),
    runScenario('mechanical dragon squad', [...repeated(['MechanicalDragon'], 11), 'Knight']),
    runScenario('ice golem siege squad', [...repeated(['IceGolem'], 11), 'Knight']),
    runScenario('two ice golem vanguard', [
      'IceGolem',
      'IceGolem',
      ...repeated(['Knight', 'Archer', 'Mage'], 37),
    ]),
    runScenario('two common NFT troops', [
      'DemonKing',
      'FireDragon',
      ...repeated(['Knight', 'Archer', 'Mage'], 41),
    ]),
    runScenario(
      'balanced normal roster with support',
      repeated(['Knight', 'Archer', 'Mage'], 45),
      { spawnColumn: 18, tactical: true },
    ),
  ];
  const searchPatterns = {
    allKnights: repeated(['Knight'], 45),
    allArchers: repeated(['Archer'], 45),
    allMages: repeated(['Mage'], 45),
    normalMix: repeated(['Knight', 'Archer', 'Mage'], 45),
    frontlineMix: repeated(['Knight', 'Knight', 'Archer', 'Mage'], 45),
    mimicMix: repeated(['Mimic', 'Knight', 'Archer', 'Mage'], 45),
    necromancerSupport: [...repeated(['Necromancer'], 6), ...repeated(['Knight', 'Archer', 'Mage'], 33)],
    necromancerArmy: [...repeated(['Necromancer'], 22), 'Knight'],
    horrorVanguard: [...repeated(['Horror'], 3), ...repeated(['Knight', 'Archer', 'Mage'], 36)],
    horrorArmy: repeated(['Horror'], 15),
    mechanicalAir: [...repeated(['MechanicalDragon'], 11), 'Knight'],
    mechanicalSiege: [...repeated(['MechanicalDragon'], 8), ...repeated(['Knight', 'Archer', 'Mage'], 13)],
    iceGolemVanguard: [...repeated(['IceGolem'], 2), ...repeated(['Knight', 'Archer', 'Mage'], 37)],
    iceGolemSiege: [...repeated(['IceGolem'], 8), ...repeated(['Knight', 'Archer', 'Mage'], 13)],
    demonFrontline: [...repeated(['DemonKing'], 8), ...repeated(['Archer', 'Mage'], 29)],
    dragonAir: [...repeated(['FireDragon'], 12), ...repeated(['Knight', 'Archer', 'Mage'], 21)],
  };
  const searchedScenarios = [];
  for (const [patternName, troops] of Object.entries(searchPatterns)) {
    for (const spawnColumn of [3, 8, 13, 18, 23]) {
      searchedScenarios.push(runScenario(`${patternName}@${spawnColumn}`, troops, { spawnColumn }));
      searchedScenarios.push(runScenario(
        `${patternName}@${spawnColumn}+support`,
        troops,
        { spawnColumn, tactical: true },
      ));
    }
  }
  const scenarios = [...baselineScenarios, ...searchedScenarios];
  const bestScenarios = [...scenarios]
    .sort((a, b) => (
      Number(b.result === 'victory') - Number(a.result === 'victory')
      || a.thHpPct - b.thHpPct
      || b.buildingsDestroyed - a.buildingsDestroyed
    ))
    .slice(0, 10);
  const bestMechanicalScenario = [...searchedScenarios]
    .filter((scenario) => scenario.name.startsWith('mechanical'))
    .sort((a, b) => (
      Number(b.result === 'victory') - Number(a.result === 'victory')
      || a.thHpPct - b.thHpPct
      || b.buildingsDestroyed - a.buildingsDestroyed
    ))[0] || null;
  const bestIceGolemScenario = [...searchedScenarios]
    .filter((scenario) => scenario.name.startsWith('iceGolem'))
    .sort((a, b) => (
      Number(b.result === 'victory') - Number(a.result === 'victory')
      || a.thHpPct - b.thHpPct
      || b.buildingsDestroyed - a.buildingsDestroyed
    ))[0] || null;
  const bestIceGolemVanguardScenario = [...searchedScenarios]
    .filter((scenario) => scenario.name.startsWith('iceGolemVanguard'))
    .sort((a, b) => (
      Number(b.result === 'victory') - Number(a.result === 'victory')
      || a.thHpPct - b.thHpPct
      || b.buildingsDestroyed - a.buildingsDestroyed
    ))[0] || null;
  const bestHorrorScenario = [...searchedScenarios]
    .filter((scenario) => scenario.name.startsWith('horror'))
    .sort((a, b) => (
      Number(b.result === 'victory') - Number(a.result === 'victory')
      || a.thHpPct - b.thHpPct
      || b.buildingsDestroyed - a.buildingsDestroyed
    ))[0] || null;

  const level6Dps = {
    turret: Number((DEFENSE_STATS.turret[6].damage / DEFENSE_STATS.turret[6].fireRate).toFixed(1)),
    archerTower: Number((DEFENSE_STATS.archer_tower[6].damage / DEFENSE_STATS.archer_tower[6].fireRate).toFixed(1)),
    mageTowerInitial: Number((DEFENSE_STATS.mage_tower[6].baseDamage / DEFENSE_STATS.mage_tower[6].tickRate).toFixed(1)),
    mageTowerMaximum: Number((DEFENSE_STATS.mage_tower[6].maxDamage / DEFENSE_STATS.mage_tower[6].tickRate).toFixed(1)),
    mortar: Number((DEFENSE_STATS.mortar[2].damage / DEFENSE_STATS.mortar[2].fireRate).toFixed(1)),
    skeletonGuard: Number((SKELETON_GUARD.levels[5].damage / SKELETON_GUARD.levels[5].atkSpeed).toFixed(1)),
  };
  const level7AttackDps = Object.fromEntries(
    ['knight', 'archer', 'mage', 'mimic', 'necromancer', 'horror', 'mechanical_dragon', 'ice_golem'].map((type) => [
      type,
      Number((TROOP_STATS[type][7].damage / TROOP_STATS[type][7].atkSpeed).toFixed(1)),
    ]),
  );
  const mechanicalDragon = TROOP_STATS.mechanical_dragon[7];
  const mechanicalPrimaryDps = mechanicalDragon.damage / mechanicalDragon.atkSpeed;
  const mechanicalSecondHit = Math.round(
    mechanicalDragon.damage * mechanicalDragon.chainFalloffBps / 10000,
  );
  const mechanicalThirdHit = Math.round(
    mechanicalSecondHit * mechanicalDragon.chainFalloffBps / 10000,
  );
  const mechanicalDragonDps = {
    slotCost: 4,
    primary: Number(mechanicalPrimaryDps.toFixed(1)),
    primaryPerSlot: Number((mechanicalPrimaryDps / 4).toFixed(1)),
    idealThreeTarget: Number(
      ((mechanicalDragon.damage + mechanicalSecondHit + mechanicalThirdHit)
        / mechanicalDragon.atkSpeed).toFixed(1),
    ),
    idealThreeTargetPerSlot: Number(
      ((mechanicalDragon.damage + mechanicalSecondHit + mechanicalThirdHit)
        / mechanicalDragon.atkSpeed / 4).toFixed(1),
    ),
    chainDamage: [mechanicalDragon.damage, mechanicalSecondHit, mechanicalThirdHit],
  };
  const iceGolem = TROOP_STATS.ice_golem[7];
  const iceGolemDps = {
    slotCost: 4,
    hp: iceGolem.hp,
    hpPerSlot: Number((iceGolem.hp / 4).toFixed(1)),
    primary: Number((iceGolem.damage / iceGolem.atkSpeed).toFixed(1)),
    primaryPerSlot: Number((iceGolem.damage / iceGolem.atkSpeed / 4).toFixed(1)),
    freezeRadius: iceGolem.deathFreezeRadius,
    freezeDuration: iceGolem.deathFreezeDuration,
  };
  const necromancer = TROOP_STATS.necromancer[7];
  const necromancerSkeleton = computeNecromancerSkeletonStats(7);
  const necromancerDps = {
    slotCost: 2,
    hp: necromancer.hp,
    direct: Number((necromancer.damage / necromancer.atkSpeed).toFixed(1)),
    summonedAtCap: Number((necromancerSkeleton.damage / necromancerSkeleton.atkSpeed * 3).toFixed(1)),
    combinedAtCap: Number((
      necromancer.damage / necromancer.atkSpeed
      + necromancerSkeleton.damage / necromancerSkeleton.atkSpeed * 3
    ).toFixed(1)),
  };
  const horrorRoot = HORROR_EVOLUTION.stages[0][7];
  const horrorMedium = HORROR_EVOLUTION.stages[1][7];
  const horrorSmall = HORROR_EVOLUTION.stages[2][7];
  const horrorEvolution = {
    slotCost: 3,
    totalFamilyHp: (
      horrorRoot.hp
      + HORROR_EVOLUTION.childrenPerSplit * horrorMedium.hp
      + HORROR_EVOLUTION.childrenPerSplit ** 2 * horrorSmall.hp
    ),
    phaseDps: [
      horrorRoot.damage / horrorRoot.atkSpeed,
      HORROR_EVOLUTION.childrenPerSplit * horrorMedium.damage / horrorMedium.atkSpeed,
      HORROR_EVOLUTION.childrenPerSplit ** 2 * horrorSmall.damage / horrorSmall.atkSpeed,
    ].map(value => Number(value.toFixed(1))),
  };
  horrorEvolution.hpPerSlot = Number((horrorEvolution.totalFamilyHp / horrorEvolution.slotCost).toFixed(1));
  horrorEvolution.peakPhaseDpsPerSlot = Number((
    Math.max(...horrorEvolution.phaseDps) / horrorEvolution.slotCost
  ).toFixed(1));

  console.log(JSON.stringify({
    shipCapacity: gameDb.PLAYER_SHIP_LEVELS[5].capacity,
    level6Dps,
    level7AttackDps,
    mechanicalDragonDps,
    iceGolemDps,
    necromancerDps,
    horrorEvolution,
    baselineScenarios,
    bestScenarios,
    bestMechanicalScenario,
    bestIceGolemScenario,
    bestIceGolemVanguardScenario,
    bestHorrorScenario,
    searchedScenarioCount: searchedScenarios.length,
    winningScenarioCount: searchedScenarios.filter((scenario) => scenario.result === 'victory').length,
  }, null, 2));

  if (gameDb.PLAYER_SHIP_LEVELS[5].capacity !== 45) process.exitCode = 1;
  if (!searchedScenarios.some((scenario) => scenario.result === 'victory')) process.exitCode = 2;
  if (scenarios.some((scenario) => scenario.slotCost > 45)) process.exitCode = 3;
  if (mechanicalDragonDps.idealThreeTargetPerSlot >= level7AttackDps.mage) process.exitCode = 4;
  if (iceGolemDps.primaryPerSlot >= level7AttackDps.knight) process.exitCode = 5;
  if (horrorEvolution.hpPerSlot > TROOP_STATS.knight[7].hp) process.exitCode = 6;
  if (horrorEvolution.peakPhaseDpsPerSlot >= level7AttackDps.knight) process.exitCode = 7;
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
