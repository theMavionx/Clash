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
  TROOP_SLOT_COSTS,
  DEFENSE_STATS,
  HORROR_EVOLUTION,
  WIND_MAGE,
  WINDLING_STATS,
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
    building('harpoon', 1, 12, 20),
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

function troopTypeKey(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function troopSlotCost(name) {
  return TROOP_SLOT_COSTS[troopTypeKey(name)] || 1;
}

function roster(groups) {
  const troops = groups.flatMap(([name, count]) => repeated([name], count));
  const slotCost = troops.reduce((sum, troop) => sum + troopSlotCost(troop), 0);
  if (slotCost !== 45) {
    throw new Error(`TH6 balance roster must occupy exactly 45 slots, got ${slotCost}`);
  }
  return troops;
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
    WindMage: 7,
    PeaShooter: 7,
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
    slotCost: troops.reduce((sum, troop) => sum + troopSlotCost(troop), 0),
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
    runScenario('TH5 baseline', roster([['Mage', 5], ['Knight', 13], ['Archer', 12]]), { townHallLevel: 5 }),
    runScenario('balanced normal roster', roster([['Mage', 5], ['Knight', 13], ['Archer', 12]])),
    runScenario('frontline-heavy roster', roster([['Mage', 4], ['Knight', 18], ['Archer', 11]])),
    runScenario('trap-runner roster', roster([['Mimic', 3], ['Mage', 3], ['Knight', 8], ['Archer', 7]])),
    runScenario('necromancer support roster', roster([['Necromancer', 1], ['Mage', 4], ['Knight', 7], ['Archer', 7]])),
    runScenario('wind mage corridor roster', roster([['WindMage', 3]])),
    runScenario('wind mage mixed roster', roster([['WindMage', 2], ['Mage', 2], ['Knight', 4], ['Archer', 3]])),
    runScenario('pea shooter volley', roster([['PeaShooter', 9]])),
    runScenario('pea shooter mixed roster', roster([['PeaShooter', 6], ['Mage', 2], ['Knight', 3], ['Archer', 4]])),
    runScenario('horror attrition squad', roster([['Horror', 2], ['Archer', 5]])),
    runScenario('horror and ice vanguard', roster([['Horror', 1], ['IceGolem', 2], ['Knight', 3], ['Archer', 2]])),
    runScenario('mechanical dragon squad', roster([['MechanicalDragon', 11], ['Knight', 1]])),
    runScenario('ice golem siege squad', roster([['IceGolem', 4], ['Knight', 5]])),
    runScenario('two ice golem vanguard', roster([['IceGolem', 2], ['Mage', 4], ['Knight', 5], ['Archer', 4]])),
    runScenario('two common NFT troops', roster([
      ['DemonKing', 1],
      ['FireDragon', 1],
      ['Mage', 4],
      ['Knight', 7],
      ['Archer', 7],
    ])),
    runScenario(
      'balanced normal roster with support',
      roster([['Mage', 5], ['Knight', 13], ['Archer', 12]]),
      { spawnColumn: 18, tactical: true },
    ),
  ];
  const searchPatterns = {
    allKnights: roster([['Knight', 45]]),
    allArchers: roster([['Archer', 45]]),
    allMages: roster([['Mage', 11], ['Knight', 1]]),
    normalMix: roster([['Mage', 5], ['Knight', 13], ['Archer', 12]]),
    frontlineMix: roster([['Mage', 4], ['Knight', 18], ['Archer', 11]]),
    mimicMix: roster([['Mimic', 3], ['Mage', 3], ['Knight', 8], ['Archer', 7]]),
    necromancerSupport: roster([['Necromancer', 1], ['Mage', 4], ['Knight', 7], ['Archer', 7]]),
    necromancerArmy: roster([['Necromancer', 3]]),
    windMageCorridor: roster([['WindMage', 3]]),
    windMageMixed: roster([['WindMage', 2], ['Mage', 2], ['Knight', 4], ['Archer', 3]]),
    peaShooterVolley: roster([['PeaShooter', 9]]),
    peaShooterMixed: roster([['PeaShooter', 6], ['Mage', 2], ['Knight', 3], ['Archer', 4]]),
    horrorVanguard: roster([['Horror', 1], ['IceGolem', 1], ['Mage', 2], ['Knight', 4], ['Archer', 3]]),
    horrorArmy: roster([['Horror', 2], ['Archer', 5]]),
    mechanicalAir: roster([['MechanicalDragon', 11], ['Knight', 1]]),
    mechanicalSiege: roster([['MechanicalDragon', 8], ['Mage', 2], ['Knight', 3], ['Archer', 2]]),
    iceGolemVanguard: roster([['IceGolem', 2], ['Mage', 4], ['Knight', 5], ['Archer', 4]]),
    iceGolemSiege: roster([['IceGolem', 4], ['Archer', 5]]),
    demonFrontline: roster([['DemonKing', 9]]),
    dragonAir: roster([['FireDragon', 4], ['Archer', 5]]),
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
  const bestWindMageScenario = [...searchedScenarios]
    .filter((scenario) => scenario.name.startsWith('windMage'))
    .sort((a, b) => (
      Number(b.result === 'victory') - Number(a.result === 'victory')
      || a.thHpPct - b.thHpPct
      || b.buildingsDestroyed - a.buildingsDestroyed
    ))[0] || null;
  const bestPeaShooterScenario = [...searchedScenarios]
    .filter((scenario) => scenario.name.startsWith('peaShooter'))
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
    harpoonImpact: Number((DEFENSE_STATS.harpoon[6].damage / DEFENSE_STATS.harpoon[6].fireRate).toFixed(1)),
    harpoonControlUptimePct: Number((DEFENSE_STATS.harpoon[6].pullDuration / DEFENSE_STATS.harpoon[6].fireRate * 100).toFixed(2)),
    skeletonGuard: Number((SKELETON_GUARD.levels[5].damage / SKELETON_GUARD.levels[5].atkSpeed).toFixed(1)),
  };
  const level7AttackDps = Object.fromEntries(
    ['knight', 'archer', 'mage', 'pea_shooter', 'mimic', 'necromancer', 'wind_mage', 'horror', 'mechanical_dragon', 'ice_golem'].map((type) => [
      type,
      Number((TROOP_STATS[type][7].damage / TROOP_STATS[type][7].atkSpeed).toFixed(1)),
    ]),
  );
  const peaShooter = TROOP_STATS.pea_shooter[7];
  const peaShooterDps = {
    slotCost: TROOP_SLOT_COSTS.pea_shooter,
    hp: peaShooter.hp,
    hpPerSlot: Number((peaShooter.hp / TROOP_SLOT_COSTS.pea_shooter).toFixed(1)),
    burst: Number((peaShooter.damage * 3 / peaShooter.atkSpeed).toFixed(1)),
    burstPerSlot: Number((
      peaShooter.damage * 3 / peaShooter.atkSpeed / TROOP_SLOT_COSTS.pea_shooter
    ).toFixed(1)),
  };
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
    slotCost: TROOP_SLOT_COSTS.ice_golem,
    hp: iceGolem.hp,
    hpPerSlot: Number((iceGolem.hp / TROOP_SLOT_COSTS.ice_golem).toFixed(1)),
    primary: Number((iceGolem.damage / iceGolem.atkSpeed).toFixed(1)),
    primaryPerSlot: Number((
      iceGolem.damage / iceGolem.atkSpeed / TROOP_SLOT_COSTS.ice_golem
    ).toFixed(1)),
    freezeRadius: iceGolem.deathFreezeRadius,
    freezeDuration: iceGolem.deathFreezeDuration,
  };
  const necromancer = TROOP_STATS.necromancer[7];
  const necromancerSkeleton = computeNecromancerSkeletonStats(7);
  const necromancerDps = {
    slotCost: TROOP_SLOT_COSTS.necromancer,
    hp: necromancer.hp,
    direct: Number((necromancer.damage / necromancer.atkSpeed).toFixed(1)),
    summonedAtCap: Number((necromancerSkeleton.damage / necromancerSkeleton.atkSpeed * 3).toFixed(1)),
    combinedAtCap: Number((
      necromancer.damage / necromancer.atkSpeed
      + necromancerSkeleton.damage / necromancerSkeleton.atkSpeed * 3
    ).toFixed(1)),
  };
  const windMage = TROOP_STATS.wind_mage[7];
  const windling = WINDLING_STATS[7];
  const windMageDps = {
    slotCost: TROOP_SLOT_COSTS.wind_mage,
    hp: windMage.hp,
    hpPerSlot: Number((windMage.hp / TROOP_SLOT_COSTS.wind_mage).toFixed(1)),
    primary: Number((windMage.damage / windMage.atkSpeed).toFixed(1)),
    primaryPerSlot: Number((
      windMage.damage / windMage.atkSpeed / TROOP_SLOT_COSTS.wind_mage
    ).toFixed(1)),
    idealFiveTarget: Number((
      windMage.damage
      * (1 + WIND_MAGE.maxSecondaryTargets * WIND_MAGE.secondaryDamageBps / 10000)
      / windMage.atkSpeed
    ).toFixed(1)),
    idealFiveTargetPerSlot: Number((
      windMage.damage
      * (1 + WIND_MAGE.maxSecondaryTargets * WIND_MAGE.secondaryDamageBps / 10000)
      / windMage.atkSpeed
      / TROOP_SLOT_COSTS.wind_mage
    ).toFixed(1)),
    windlingDpsAtCap: Number((
      windling.damage / windling.atkSpeed * WIND_MAGE.maxActiveWindlings
    ).toFixed(1)),
    summonCap: WIND_MAGE.maxActiveWindlings,
  };
  const horrorRoot = HORROR_EVOLUTION.stages[0][7];
  const horrorMedium = HORROR_EVOLUTION.stages[1][7];
  const horrorSmall = HORROR_EVOLUTION.stages[2][7];
  const horrorEvolution = {
    slotCost: TROOP_SLOT_COSTS.horror,
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
    shipCapacity: gameDb.PLAYER_SHIP_LEVELS[6].capacity,
    shipEnergy: gameDb.PLAYER_SHIP_LEVELS[6].energy,
    medkitUnlocked: gameDb.PLAYER_SHIP_LEVELS[6].medkit_unlocked,
    level6Dps,
    level7AttackDps,
    mechanicalDragonDps,
    iceGolemDps,
    necromancerDps,
    windMageDps,
    peaShooterDps,
    horrorEvolution,
    baselineScenarios,
    bestScenarios,
    bestMechanicalScenario,
    bestIceGolemScenario,
    bestIceGolemVanguardScenario,
    bestHorrorScenario,
    bestWindMageScenario,
    bestPeaShooterScenario,
    searchedScenarioCount: searchedScenarios.length,
    winningScenarioCount: searchedScenarios.filter((scenario) => scenario.result === 'victory').length,
  }, null, 2));

  if (
    gameDb.PLAYER_SHIP_LEVELS[6].capacity !== 45
    || gameDb.PLAYER_SHIP_LEVELS[6].energy !== 14
    || !gameDb.PLAYER_SHIP_LEVELS[6].medkit_unlocked
  ) process.exitCode = 1;
  if (!searchedScenarios.some((scenario) => scenario.result === 'victory')) process.exitCode = 2;
  if (scenarios.some((scenario) => scenario.slotCost > 45)) process.exitCode = 3;
  if (
    mechanicalDragonDps.idealThreeTargetPerSlot
      >= level7AttackDps.mage / TROOP_SLOT_COSTS.mage * 1.2
  ) process.exitCode = 4;
  if (iceGolemDps.primaryPerSlot >= level7AttackDps.knight) process.exitCode = 5;
  if (horrorEvolution.hpPerSlot > TROOP_STATS.knight[7].hp) process.exitCode = 6;
  if (horrorEvolution.peakPhaseDpsPerSlot >= level7AttackDps.knight) process.exitCode = 7;
  if (windMageDps.primaryPerSlot >= level7AttackDps.mage / TROOP_SLOT_COSTS.mage) process.exitCode = 8;
  if (windMageDps.idealFiveTargetPerSlot >= mechanicalDragonDps.idealThreeTargetPerSlot * 1.2) process.exitCode = 9;
  if (peaShooterDps.burstPerSlot >= level7AttackDps.archer) process.exitCode = 10;
  if (peaShooterDps.hpPerSlot >= TROOP_STATS.knight[7].hp) process.exitCode = 11;
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
