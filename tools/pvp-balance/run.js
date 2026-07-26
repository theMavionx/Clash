#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_SEED = 42;
const DEFAULT_BASE_COUNT = 144;
const DEFAULT_MATCHES = 288;
const DEFAULT_TARGET_WIN_RATE = 0.55;
const DEFAULT_BAND = 0.08;
const DEFAULT_MIN_GROUP_SIZE = 6;
const DEFAULT_PROFILE = 'all';
const ARCHETYPES = [
  'compact-core',
  'defense-ring',
  'layered-rings',
  'split-core',
  'southern-funnel',
  'resource-shield',
  'wide-spread',
  'asymmetric-left',
  'asymmetric-right',
  'trap-lanes',
  'corner-keep',
  'diamond',
];
const BASE_LEVEL_PROFILES = [
  'maxed',
  'mid',
  'rushed-defense',
  'rushed-economy',
  'mixed',
];
const ATTACK_LEVEL_PROFILES = ['low', 'mid', 'maxed', 'mixed'];
const SPAWN_PROFILES = [
  'wide-line',
  'center-push',
  'left-flank',
  'right-flank',
  'dual-flank',
  'staggered-waves',
];
const MATCHUP_OFFSETS = [0, 0, 0, -1, 1];

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = path.resolve(__dirname, '..', '..');
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-balance-lab-'));
const scratchDb = path.join(scratchDir, 'balance.db');
process.env.CLASH_MAIN_DB = scratchDb;

let gameDb = null;
try {
  const loaded = withMutedConsole(!args.verbose, () => {
    const dbModule = require('../../server/db');
    const combatDefs = require('../../server/combat_defs');
    const { verifyReplay } = require('../../server/combat_session');
    return { gameDb: dbModule, combatDefs, verifyReplay };
  });
  gameDb = loaded.gameDb;
  process.exitCode = runBalanceLab({
    repoRoot,
    gameDb: loaded.gameDb,
    combatDefs: loaded.combatDefs,
    verifyReplay: loaded.verifyReplay,
    args,
  });
} finally {
  if (gameDb?.db?.open) gameDb.db.close();
  fs.rmSync(scratchDir, { recursive: true, force: true });
}

function runBalanceLab({ repoRoot: root, gameDb: dbApi, combatDefs, verifyReplay, args: cli }) {
  const seed = intArg(cli.seed, DEFAULT_SEED, 1, 0xffffffff);
  const baseCount = intArg(cli.bases ?? cli['base-count'], DEFAULT_BASE_COUNT, 1, 10_000);
  const targetWinRate = numberArg(
    cli.targetWinrate ?? cli['target-winrate'],
    DEFAULT_TARGET_WIN_RATE,
    0,
    1,
  );
  const band = numberArg(cli.band, DEFAULT_BAND, 0.001, 0.5);
  const minGroupSize = intArg(
    cli['min-group-size'],
    DEFAULT_MIN_GROUP_SIZE,
    1,
    1_000_000,
  );
  const catalogOnly = !!cli['catalog-only'];
  const verbose = !!cli.verbose;
  const exhaustive = !!cli.exhaustive;
  const catalog = discoverCatalog(dbApi, combatDefs);
  const townHalls = resolveTownHallProfile(
    String(cli.profile || DEFAULT_PROFILE),
    catalog.maxTownHall,
  );
  const requestedMatches = catalogOnly
    ? 0
    : intArg(cli.matches, DEFAULT_MATCHES, 1, 1_000_000);
  const maxScenarios = intArg(cli['max-scenarios'], 50_000, 1, 1_000_000);
  const shipCapacity = discoverShipCapacity(dbApi, combatDefs);
  const startedAt = Date.now();

  const bases = generateBaseCatalog({
    count: baseCount,
    seed,
    townHalls,
    catalog,
    dbApi,
    combatDefs,
  });
  const baseValidation = validateBaseCatalog(bases, catalog, dbApi);
  if (baseValidation.errors.length > 0) {
    throw new Error(`Generated base validation failed:\n${baseValidation.errors.join('\n')}`);
  }

  const armiesByTownHall = new Map();
  for (let th = 1; th <= catalog.maxTownHall; th += 1) {
    armiesByTownHall.set(th, generateArmyCatalog(th, catalog, shipCapacity, seed));
  }
  const allArmies = [...armiesByTownHall.values()].flat();
  const scenarioPlan = catalogOnly
    ? []
    : buildScenarioPlan({
      bases,
      armiesByTownHall,
      catalog,
      requestedMatches,
      exhaustive,
      maxScenarios,
      seed,
    });

  const aggregate = createAggregate();
  for (let index = 0; index < scenarioPlan.length; index += 1) {
    const scenario = scenarioPlan[index];
    const result = runScenario(verifyReplay, combatDefs, scenario, verbose);
    recordScenario(aggregate, scenario, result);
    if (verbose && ((index + 1) % 25 === 0 || index + 1 === scenarioPlan.length)) {
      console.log(`[balance] simulated ${index + 1}/${scenarioPlan.length}`);
    }
  }

  const statAudit = auditStats(catalog, combatDefs);
  const coverage = buildCoverage(catalog, bases, scenarioPlan);
  const balanceIssues = analyzeBalance({
    aggregate,
    coverage,
    statAudit,
    targetWinRate,
    band,
    minGroupSize,
  });
  const elapsedMs = Date.now() - startedAt;
  const config = {
    seed,
    profile: String(cli.profile || DEFAULT_PROFILE),
    townHalls,
    requestedBaseCount: baseCount,
    generatedBaseCount: bases.length,
    requestedMatches,
    simulatedMatches: aggregate.overall.count,
    exhaustive,
    shipCapacity,
    targetWinRate,
    band,
    elapsedMs,
  };
  const reportModel = {
    generatedAt: new Date().toISOString(),
    config,
    catalog: serializableCatalog(catalog),
    coverage,
    baseValidation,
    statAudit,
    balanceIssues,
    aggregate: serializeAggregate(aggregate),
    bases,
    armies: allArmies,
  };

  const output = resolveOutputPaths(root, cli);
  fs.mkdirSync(path.dirname(output.markdown), { recursive: true });
  fs.writeFileSync(
    output.markdown,
    buildMarkdownReport(reportModel, minGroupSize),
    'utf8',
  );
  fs.writeFileSync(output.json, `${JSON.stringify(reportModel, null, 2)}\n`, 'utf8');
  if (cli['dump-bases']) {
    const dumpPath = path.resolve(root, String(cli['dump-bases']));
    fs.mkdirSync(path.dirname(dumpPath), { recursive: true });
    fs.writeFileSync(dumpPath, `${JSON.stringify(bases, null, 2)}\n`, 'utf8');
  }

  const winRate = rate(aggregate.overall.wins, aggregate.overall.count);
  const criticalIssues = balanceIssues.filter((issue) => issue.severity === 'critical');
  console.log(`Balance lab: ${bases.length} unique bases, ${allArmies.length} army templates`);
  if (catalogOnly) {
    console.log('Replay simulation: skipped (--catalog-only)');
  } else {
    console.log(
      `Replay simulation: ${aggregate.overall.count} battles, `
      + `${pct(winRate)} attacker wins, ${aggregate.overall.invalid} invalid`,
    );
  }
  console.log(`Content: ${catalog.buildings.length} buildings, ${catalog.troops.length} active troops`);
  console.log(`Report: ${path.relative(root, output.markdown)}`);
  console.log(`Data: ${path.relative(root, output.json)}`);

  if (aggregate.overall.invalid > 0 || criticalIssues.some((issue) => issue.code === 'coverage')) {
    return 2;
  }
  if (cli.strict && criticalIssues.length > 0) return 3;
  return 0;
}

function discoverCatalog(dbApi, combatDefs) {
  const maxTownHall = Math.max(
    1,
    Number(dbApi.BUILDING_DEFS?.town_hall?.max_level) || 1,
    ...Object.values(dbApi.TH_MAX_COUNT || {})
      .filter(Array.isArray)
      .map((levels) => levels.length),
    ...Object.values(dbApi.TH_MAX_LEVEL || {})
      .filter(Array.isArray)
      .map((levels) => levels.length),
  );
  const blockedOnMainGrid = new Set(dbApi.GRID_SPECS?.[0]?.blocked || []);
  const allowedOnMainGrid = Array.isArray(dbApi.GRID_SPECS?.[0]?.allowed)
    ? new Set(dbApi.GRID_SPECS[0].allowed)
    : null;
  const warnings = [];
  const buildings = Object.entries(dbApi.BUILDING_DEFS || {})
    .filter(([type]) => !blockedOnMainGrid.has(type))
    .filter(([type]) => !allowedOnMainGrid || allowedOnMainGrid.has(type))
    .map(([type, def]) => {
      const size = Array.isArray(def.size) ? def.size.map(Number) : [2, 2];
      if (size.length !== 2 || size.some((value) => !Number.isFinite(value) || value <= 0)) {
        warnings.push(`Building ${type} has an invalid size and cannot be generated.`);
      }
      return {
        type,
        size,
        maxLevel: Math.max(1, Number(def.max_level) || 1),
        maxCount: Math.max(0, Number(def.max_count) || 0),
        unlockTownHall: Math.max(1, Number(dbApi.TH_UNLOCK?.[type]) || 1),
        requiresPurchase: !!def.requires_purchase,
        role: buildingRole(type, combatDefs),
      };
    })
    .filter((building) => building.size.length === 2 && building.size.every(Number.isFinite))
    .sort((a, b) => a.type.localeCompare(b.type));

  const activeTypes = new Set(
    Array.isArray(dbApi.ACTIVE_TROOP_TYPES)
      ? dbApi.ACTIVE_TROOP_TYPES
      : Object.keys(dbApi.TROOP_DEFS || {}),
  );
  const verifierTypes = new Set(combatDefs.VALID_TROOP_TYPES || []);
  const troops = [...activeTypes]
    .filter((type) => {
      const hasStats = !!combatDefs.TROOP_STATS?.[type];
      const verifierAccepts = verifierTypes.has(type);
      if (!hasStats) warnings.push(`Active troop ${type} has no server combat stats.`);
      if (!verifierAccepts) warnings.push(`Active troop ${type} is rejected by replay verification.`);
      return hasStats && verifierAccepts;
    })
    .map((type) => {
      const def = dbApi.TROOP_DEFS?.[type] || {};
      const stats = combatDefs.TROOP_STATS[type] || {};
      const levelKeys = Object.keys(stats).map(Number).filter(Number.isFinite);
      const maxLevel = Math.max(1, Number(def.max_level) || 1, ...levelKeys);
      const topStats = stats[maxLevel] || stats[Math.max(...levelKeys)] || {};
      return {
        type,
        slotCost: Math.max(1, Number(def.slot_cost) || 1),
        unlockTownHall: Math.max(1, Number(def.min_town_hall_level) || 1),
        maxLevel,
        maxHp: Math.max(1, Number(topStats.hp) || 1),
        directDps: round(
          Number(topStats.damage) / Math.max(0.01, Number(topStats.atkSpeed) || 1),
          3,
        ),
        melee: !!topStats.melee,
        ranged: !topStats.melee && Number(topStats.range) > 0,
        flying: !!topStats.flying,
        trapImmune: !!topStats.trapImmune,
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type));

  for (const type of verifierTypes) {
    if (!activeTypes.has(type)) continue;
    if (!troops.some((troop) => troop.type === type)) {
      warnings.push(`Verifier troop ${type} is active but absent from the generated catalog.`);
    }
  }
  return { maxTownHall, buildings, troops, warnings };
}

function buildingRole(type, combatDefs) {
  if (type === 'town_hall') return 'core';
  if (type === 'shark_trap') return 'trap';
  if (combatDefs.DEFENSE_STATS?.[type] || type === 'tombstone') return 'defense';
  if (['mine', 'sawmill', 'barn', 'storage'].includes(type)) return 'economy';
  if (type === 'altar') return 'support';
  return 'utility';
}

function discoverShipCapacity(dbApi, combatDefs) {
  const capacities = Object.values(dbApi.PLAYER_SHIP_LEVELS || {})
    .map((entry) => Number(entry?.capacity))
    .filter((value) => Number.isFinite(value) && value > 0);
  return Math.max(
    1,
    Number(combatDefs.MAX_TROOPS) || 0,
    Number(combatDefs.MAX_SHIPS || 0) * Number(combatDefs.TROOPS_PER_SHIP || 0),
    ...capacities,
  );
}

function resolveTownHallProfile(rawProfile, maxTownHall) {
  const profile = String(rawProfile || 'all').trim().toLowerCase();
  if (profile === 'all') {
    return Array.from({ length: maxTownHall }, (_, index) => index + 1);
  }
  const single = profile.match(/^th(\d+)$/);
  if (single) {
    const th = clampInt(Number(single[1]), 1, maxTownHall);
    return [th];
  }
  const rangeMatch = profile.match(/^th(\d+)-th(\d+)$/);
  if (rangeMatch) {
    const from = clampInt(Number(rangeMatch[1]), 1, maxTownHall);
    const to = clampInt(Number(rangeMatch[2]), 1, maxTownHall);
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    return Array.from({ length: high - low + 1 }, (_, index) => low + index);
  }
  throw new Error(`Unsupported profile "${rawProfile}". Use all, thN, or thN-thN.`);
}

function generateBaseCatalog({ count, seed, townHalls, catalog, dbApi, combatDefs }) {
  const bases = [];
  const signatures = new Set();
  const maxAttempts = Math.max(count * 80, 1_000);
  let attempt = 0;
  while (bases.length < count && attempt < maxAttempts) {
    const th = townHalls[attempt % townHalls.length];
    const archetype = ARCHETYPES[attempt % ARCHETYPES.length];
    const levelProfile = BASE_LEVEL_PROFILES[
      Math.floor(attempt / ARCHETYPES.length) % BASE_LEVEL_PROFILES.length
    ];
    const base = generateBase({
      th,
      archetype,
      levelProfile,
      variation: attempt,
      seed: hash32(seed, th, attempt),
      catalog,
      dbApi,
      combatDefs,
    });
    const signature = baseSignature(base);
    if (!signatures.has(signature)) {
      signatures.add(signature);
      base.id = `th${th}-${archetype}-${String(bases.length + 1).padStart(3, '0')}`;
      bases.push(base);
    }
    attempt += 1;
  }
  if (bases.length < count) {
    throw new Error(`Could only generate ${bases.length}/${count} unique valid bases.`);
  }
  return bases;
}

function generateBase({
  th,
  archetype,
  levelProfile,
  variation,
  seed,
  catalog,
  dbApi,
  combatDefs,
}) {
  const grid = dbApi.GRID_SPECS?.[0] || { width: 29, height: 27 };
  const width = Math.max(1, Number(grid.width) || 29);
  const height = Math.max(1, Number(grid.height) || 27);
  const inventory = buildBaseInventory({
    th,
    variation,
    levelProfile,
    catalog,
    dbApi,
    combatDefs,
  });
  const occupancy = Array.from({ length: height }, () => Array(width).fill(false));
  const placed = [];
  const context = archetypeContext(archetype, width, height, seed);

  for (let itemIndex = 0; itemIndex < inventory.length; itemIndex += 1) {
    const item = inventory[itemIndex];
    let selected = findBestPlacement({
      item,
      itemIndex,
      placed,
      occupancy,
      width,
      height,
      context,
      seed,
      gap: 1,
    });
    if (!selected) {
      selected = findBestPlacement({
        item,
        itemIndex,
        placed,
        occupancy,
        width,
        height,
        context,
        seed,
        gap: 0,
      });
    }
    if (!selected) {
      throw new Error(
        `No valid placement for ${item.type} on TH${th} ${archetype} variation ${variation}`,
      );
    }
    markOccupied(occupancy, selected.x, selected.z, item.size[0], item.size[1]);
    placed.push({
      id: placed.length + 1,
      type: item.type,
      level: item.level,
      grid_x: selected.x,
      grid_z: selected.z,
      grid_index: 0,
      hp: item.hp,
      max_hp: item.hp,
      role: item.role,
      size: [...item.size],
    });
  }
  return {
    id: '',
    townHall: th,
    archetype,
    levelProfile,
    variation,
    buildings: placed,
    metrics: baseGeometryMetrics(placed, width, height),
  };
}

function buildBaseInventory({ th, variation, levelProfile, catalog, dbApi, combatDefs }) {
  const items = [];
  for (const building of catalog.buildings) {
    if (building.unlockTownHall > th) continue;
    if (building.requiresPurchase && variation % 3 !== 0) continue;
    const count = maxBuildingCountAtTownHall(building, th, dbApi);
    for (let occurrence = 0; occurrence < count; occurrence += 1) {
      const level = buildingLevelForProfile({
        building,
        th,
        levelProfile,
        occurrence,
        variation,
        dbApi,
      });
      const hpLevels = dbApi.BUILDING_DEFS[building.type]?.hp_levels || [1];
      const hp = Math.max(1, Number(hpLevels[level - 1]) || Number(hpLevels[0]) || 1);
      items.push({
        ...building,
        level,
        hp,
        occurrence,
        priority: placementPriority(building.role, levelProfile),
      });
    }
  }
  return items.sort((a, b) => (
    a.priority - b.priority
    || Number(combatDefs.DEFENSE_STATS?.[b.type] != null)
      - Number(combatDefs.DEFENSE_STATS?.[a.type] != null)
    || b.size[0] * b.size[1] - a.size[0] * a.size[1]
    || a.type.localeCompare(b.type)
    || a.occurrence - b.occurrence
  ));
}

function maxBuildingCountAtTownHall(building, th, dbApi) {
  if (building.type === 'town_hall') return 1;
  const configured = dbApi.TH_MAX_COUNT?.[building.type];
  if (Array.isArray(configured) && configured.length > 0) {
    const index = Math.min(configured.length - 1, Math.max(0, th - 1));
    return Math.max(0, Number(configured[index]) || 0);
  }
  return building.unlockTownHall <= th ? building.maxCount : 0;
}

function buildingLevelForProfile({
  building,
  th,
  levelProfile,
  occurrence,
  variation,
  dbApi,
}) {
  if (building.type === 'town_hall') return th;
  const maxLevel = Math.max(
    1,
    Math.min(
      building.maxLevel,
      Number(dbApi.getBuildingMaxLevelForTownHall(building.type, th)) || 1,
    ),
  );
  if (levelProfile === 'maxed') return maxLevel;
  if (levelProfile === 'mid') return Math.max(1, Math.ceil(maxLevel * 0.65));
  if (levelProfile === 'rushed-defense') {
    return building.role === 'defense' || building.role === 'trap'
      ? maxLevel
      : Math.max(1, Math.ceil(maxLevel * 0.4));
  }
  if (levelProfile === 'rushed-economy') {
    return building.role === 'economy' || building.role === 'support'
      ? maxLevel
      : Math.max(1, Math.ceil(maxLevel * 0.4));
  }
  const roll = noise01(variation, occurrence, hashString(building.type));
  return 1 + Math.floor(roll * maxLevel);
}

function placementPriority(role, levelProfile) {
  if (role === 'core') return 0;
  if (levelProfile === 'rushed-economy' && role === 'economy') return 1;
  if (role === 'defense') return 2;
  if (role === 'support') return 3;
  if (role === 'economy') return 4;
  if (role === 'utility') return 5;
  if (role === 'trap') return 6;
  return 7;
}

function archetypeContext(archetype, width, height, seed) {
  const centerX = width / 2;
  const centerZ = height / 2;
  const jitterX = Math.round((noise01(seed, 11, 19) - 0.5) * 4);
  const jitterZ = Math.round((noise01(seed, 23, 29) - 0.5) * 4);
  const context = {
    archetype,
    centerX,
    centerZ,
    coreX: centerX + jitterX,
    coreZ: centerZ - 2 + jitterZ,
    defenseRadius: Math.min(width, height) * 0.20,
    economyRadius: Math.min(width, height) * 0.36,
  };
  if (archetype === 'southern-funnel') {
    context.coreZ = height * 0.36;
    context.defenseRadius = height * 0.28;
  } else if (archetype === 'asymmetric-left') {
    context.coreX = width * 0.34;
  } else if (archetype === 'asymmetric-right') {
    context.coreX = width * 0.66;
  } else if (archetype === 'corner-keep') {
    context.coreX = width * (noise01(seed, 3, 5) > 0.5 ? 0.30 : 0.70);
    context.coreZ = height * 0.30;
  } else if (archetype === 'split-core') {
    context.coreZ = height * 0.40;
  }
  return context;
}

function findBestPlacement({
  item,
  itemIndex,
  placed,
  occupancy,
  width,
  height,
  context,
  seed,
  gap,
}) {
  const [sizeX, sizeZ] = item.size;
  const margin = 1;
  let best = null;
  for (let z = margin; z <= height - sizeZ - margin; z += 1) {
    for (let x = margin; x <= width - sizeX - margin; x += 1) {
      if (!canPlace(occupancy, x, z, sizeX, sizeZ, gap)) continue;
      const score = placementScore({
        item,
        itemIndex,
        x,
        z,
        sizeX,
        sizeZ,
        placed,
        width,
        height,
        context,
        seed,
      });
      if (!best || score < best.score) best = { x, z, score };
    }
  }
  return best;
}

function placementScore({
  item,
  itemIndex,
  x,
  z,
  sizeX,
  sizeZ,
  placed,
  width,
  height,
  context,
  seed,
}) {
  const cx = x + sizeX / 2;
  const cz = z + sizeZ / 2;
  const dx = cx - context.coreX;
  const dz = cz - context.coreZ;
  const coreDistance = Math.hypot(dx, dz);
  const centerDistance = Math.hypot(cx - width / 2, cz - height / 2);
  const townHall = placed.find((building) => building.type === 'town_hall');
  const thDistance = townHall
    ? Math.hypot(
      cx - (townHall.grid_x + (townHall.size?.[0] || 4) / 2),
      cz - (townHall.grid_z + (townHall.size?.[1] || 4) / 2),
    )
    : coreDistance;
  const peers = placed.filter((building) => building.role === item.role);
  const nearestPeer = peers.length > 0
    ? Math.min(...peers.map((building) => Math.hypot(
      cx - (building.grid_x + (building.size?.[0] || 2) / 2),
      cz - (building.grid_z + (building.size?.[1] || 2) / 2),
    )))
    : Math.min(width, height);
  const edgeDistance = Math.min(cx, width - cx, cz, height - cz);
  const noise = noise01(seed, itemIndex * 97 + x, z * 193 + hashString(item.type));
  let score = noise * 2.25;

  if (item.role === 'core') {
    return coreDistance * 10 + noise;
  }
  if (item.role === 'trap') {
    const targetZ = context.archetype === 'trap-lanes' ? height * 0.78 : height * 0.66;
    const laneX = width * (0.20 + ((item.occurrence + 1) / 5) * 0.60);
    score += Math.abs(cz - targetZ) * 5 + Math.abs(cx - laneX) * 1.2;
    return score;
  }

  if (context.archetype === 'compact-core') {
    score += coreDistance * (item.role === 'defense' ? 4.5 : 2.7);
  } else if (context.archetype === 'defense-ring') {
    const radius = item.role === 'defense' ? context.defenseRadius : context.economyRadius;
    score += Math.abs(coreDistance - radius) * 5;
  } else if (context.archetype === 'layered-rings') {
    const radius = item.role === 'defense'
      ? context.defenseRadius
      : item.role === 'economy' ? context.economyRadius : context.defenseRadius * 0.55;
    score += Math.abs(coreDistance - radius) * 4.5;
  } else if (context.archetype === 'split-core') {
    const left = Math.hypot(cx - width * 0.32, cz - height * 0.42);
    const right = Math.hypot(cx - width * 0.68, cz - height * 0.42);
    score += Math.min(left, right) * (item.role === 'defense' ? 4 : 2);
  } else if (context.archetype === 'southern-funnel') {
    if (item.role === 'defense') {
      score += Math.abs(cz - height * 0.66) * 4 + Math.abs(cx - width / 2) * 0.5;
    } else {
      score += coreDistance * 2;
    }
  } else if (context.archetype === 'resource-shield') {
    const radius = item.role === 'economy'
      ? context.defenseRadius * 0.75
      : item.role === 'defense' ? context.defenseRadius * 1.35 : context.economyRadius;
    score += Math.abs(thDistance - radius) * 4;
  } else if (context.archetype === 'wide-spread') {
    score -= nearestPeer * 4.2;
    score -= edgeDistance * 0.3;
  } else if (context.archetype.startsWith('asymmetric')) {
    score += coreDistance * (item.role === 'defense' ? 3.8 : 1.7);
    score -= nearestPeer * 0.7;
  } else if (context.archetype === 'trap-lanes') {
    if (item.role === 'defense') {
      score += Math.abs(cz - height * 0.58) * 3.5;
    } else {
      score += Math.abs(coreDistance - context.economyRadius) * 2.5;
    }
  } else if (context.archetype === 'corner-keep') {
    score += coreDistance * (item.role === 'defense' ? 4 : 2);
  } else if (context.archetype === 'diamond') {
    const diamond = Math.abs(cx - width / 2) + Math.abs(cz - height / 2);
    const target = item.role === 'defense' ? 7 : 12;
    score += Math.abs(diamond - target) * 3.2;
  }
  if (item.role === 'defense') score += thDistance * 0.30;
  if (item.role === 'economy') score -= thDistance * 0.12;
  score -= nearestPeer * 0.18;
  score += centerDistance * 0.02;
  return score;
}

function canPlace(occupancy, x, z, sizeX, sizeZ, gap) {
  const height = occupancy.length;
  const width = occupancy[0]?.length || 0;
  const minX = Math.max(0, x - gap);
  const minZ = Math.max(0, z - gap);
  const maxX = Math.min(width, x + sizeX + gap);
  const maxZ = Math.min(height, z + sizeZ + gap);
  for (let row = minZ; row < maxZ; row += 1) {
    for (let col = minX; col < maxX; col += 1) {
      if (occupancy[row][col]) return false;
    }
  }
  return true;
}

function markOccupied(occupancy, x, z, sizeX, sizeZ) {
  for (let row = z; row < z + sizeZ; row += 1) {
    for (let col = x; col < x + sizeX; col += 1) {
      occupancy[row][col] = true;
    }
  }
}

function baseGeometryMetrics(buildings, width, height) {
  const centers = buildings.map((building) => {
    const size = building.size || [2, 2];
    return {
      x: building.grid_x + size[0] / 2,
      z: building.grid_z + size[1] / 2,
    };
  });
  const meanX = avg(centers.reduce((sum, point) => sum + point.x, 0), centers.length);
  const meanZ = avg(centers.reduce((sum, point) => sum + point.z, 0), centers.length);
  const spread = avg(
    centers.reduce((sum, point) => sum + Math.hypot(point.x - meanX, point.z - meanZ), 0),
    centers.length,
  );
  return {
    buildingCount: buildings.length,
    defenseCount: buildings.filter((building) => building.role === 'defense').length,
    trapCount: buildings.filter((building) => building.role === 'trap').length,
    normalizedSpread: round(spread / Math.min(width, height), 4),
  };
}

function baseSignature(base) {
  return base.buildings
    .map((building) => (
      `${building.type}:${building.level}:${building.grid_x}:${building.grid_z}`
    ))
    .sort()
    .join('|');
}

function validateBaseCatalog(bases, catalog, dbApi) {
  const errors = [];
  const warnings = [...catalog.warnings];
  const signatures = new Set();
  for (const base of bases) {
    const signature = baseSignature(base);
    if (signatures.has(signature)) errors.push(`${base.id}: duplicate layout`);
    signatures.add(signature);
    const grid = dbApi.GRID_SPECS?.[0] || { width: 29, height: 27 };
    const occupancy = Array.from(
      { length: Number(grid.height) || 27 },
      () => Array(Number(grid.width) || 29).fill(null),
    );
    let townHallCount = 0;
    for (const building of base.buildings) {
      const def = dbApi.BUILDING_DEFS?.[building.type];
      if (!def) {
        errors.push(`${base.id}: unknown building ${building.type}`);
        continue;
      }
      if (building.type === 'town_hall') townHallCount += 1;
      const size = def.size || [2, 2];
      if (
        building.grid_x < 0
        || building.grid_z < 0
        || building.grid_x + size[0] > occupancy[0].length
        || building.grid_z + size[1] > occupancy.length
      ) {
        errors.push(`${base.id}: ${building.type} is outside the build grid`);
        continue;
      }
      for (let z = building.grid_z; z < building.grid_z + size[1]; z += 1) {
        for (let x = building.grid_x; x < building.grid_x + size[0]; x += 1) {
          if (occupancy[z][x] != null) {
            errors.push(
              `${base.id}: ${building.type} overlaps building ${occupancy[z][x]}`,
            );
          }
          occupancy[z][x] = building.id;
        }
      }
      const cap = Number(dbApi.getBuildingMaxLevelForTownHall(building.type, base.townHall));
      if (building.level < 1 || building.level > cap) {
        errors.push(`${base.id}: ${building.type} level ${building.level} exceeds TH cap ${cap}`);
      }
    }
    if (townHallCount !== 1) errors.push(`${base.id}: expected one Town Hall, got ${townHallCount}`);
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings: [...new Set(warnings)],
    uniqueLayouts: signatures.size,
  };
}

function generateArmyCatalog(townHall, catalog, capacity, seed) {
  const available = catalog.troops.filter((troop) => troop.unlockTownHall <= townHall);
  if (available.length === 0) {
    throw new Error(`No troops are available at TH${townHall}.`);
  }
  const recipes = [];
  for (const troop of available) {
    recipes.push(createArmy(
      townHall,
      `pure-${troop.type}`,
      [troop.type],
      available,
      capacity,
    ));
  }
  const melee = available.filter((troop) => troop.melee).map((troop) => troop.type);
  const ranged = available.filter((troop) => troop.ranged).map((troop) => troop.type);
  const flying = available.filter((troop) => troop.flying).map((troop) => troop.type);
  const tanks = [...available]
    .sort((a, b) => troopDurabilityScore(b, catalog) - troopDurabilityScore(a, catalog))
    .slice(0, Math.max(1, Math.ceil(available.length / 3)))
    .map((troop) => troop.type);
  const trapRunners = available.filter((troop) => troop.trapImmune).map((troop) => troop.type);
  const support = available
    .filter((troop) => /necromancer|mage/.test(troop.type))
    .map((troop) => troop.type);
  const patterns = [
    ['balanced', interleave(melee, ranged, available.map((troop) => troop.type))],
    ['frontline-ranged', interleave(tanks, ranged, ranged)],
    ['melee-pressure', melee],
    ['ranged-pressure', ranged],
    ['air-pressure', flying],
    ['support-mix', interleave(tanks, support, ranged)],
    ['trap-runner-mix', interleave(trapRunners, melee, ranged)],
  ];
  for (const [name, pattern] of patterns) {
    if (pattern.length === 0) continue;
    recipes.push(createArmy(townHall, name, pattern, available, capacity));
  }
  for (let variant = 0; variant < 6; variant += 1) {
    const rng = mulberry32(hash32(seed, townHall, variant));
    const shuffled = [...available]
      .sort(() => rng() - 0.5)
      .map((troop) => troop.type);
    recipes.push(createArmy(
      townHall,
      `random-${variant + 1}`,
      shuffled,
      available,
      capacity,
    ));
  }
  const unique = new Map();
  for (const army of recipes) {
    if (army.units.length === 0) continue;
    const signature = army.units.join(',');
    if (!unique.has(signature)) unique.set(signature, army);
  }
  return [...unique.values()];
}

function createArmy(townHall, name, pattern, available, capacity) {
  const byType = new Map(available.map((troop) => [troop.type, troop]));
  const normalizedPattern = pattern.filter((type) => byType.has(type));
  const units = [];
  let slotsUsed = 0;
  let cursor = 0;
  let misses = 0;
  const maxIterations = capacity * Math.max(4, normalizedPattern.length * 3);
  while (slotsUsed < capacity && cursor < maxIterations && normalizedPattern.length > 0) {
    const type = normalizedPattern[cursor % normalizedPattern.length];
    const cost = byType.get(type).slotCost;
    if (slotsUsed + cost <= capacity) {
      units.push(type);
      slotsUsed += cost;
      misses = 0;
    } else {
      misses += 1;
      if (misses >= normalizedPattern.length) break;
    }
    cursor += 1;
  }
  return {
    id: `th${townHall}-${name}`,
    townHall,
    name,
    units,
    slotsUsed,
    capacity,
    utilization: round(slotsUsed / capacity, 4),
  };
}

function troopDurabilityScore(troop, catalog) {
  const full = catalog.troops.find((entry) => entry.type === troop.type) || troop;
  return (Number(full.maxHp) / Math.max(1, Number(full.slotCost) || 1))
    * (full.melee ? 1.2 : 1)
    * (full.flying ? 1.05 : 1);
}

function interleave(...lists) {
  const filtered = lists.filter((list) => Array.isArray(list) && list.length > 0);
  if (filtered.length === 0) return [];
  const maxLength = Math.max(...filtered.map((list) => list.length));
  const result = [];
  for (let index = 0; index < maxLength; index += 1) {
    for (const list of filtered) result.push(list[index % list.length]);
  }
  return result;
}

function buildScenarioPlan({
  bases,
  armiesByTownHall,
  catalog,
  requestedMatches,
  exhaustive,
  maxScenarios,
  seed,
}) {
  const scenarios = [];
  if (exhaustive) {
    outer:
    for (const base of bases) {
      for (const offset of [-1, 0, 1]) {
        const attackerTh = clampInt(base.townHall + offset, 1, catalog.maxTownHall);
        for (const army of armiesByTownHall.get(attackerTh) || []) {
          for (const spawnProfile of SPAWN_PROFILES) {
            scenarios.push(makeScenario({
              index: scenarios.length,
              base,
              attackerTh,
              army,
              spawnProfile,
              levelProfile: ATTACK_LEVEL_PROFILES[
                scenarios.length % ATTACK_LEVEL_PROFILES.length
              ],
              tactics: scenarios.length % 5 === 0 ? 'cannon-rally' : 'none',
              catalog,
              seed,
            }));
            if (scenarios.length >= maxScenarios) break outer;
          }
        }
      }
    }
    return scenarios;
  }
  const sampledBases = shuffledCopy(bases, hash32(seed, 0x42415345));

  for (
    let troopIndex = 0;
    troopIndex < catalog.troops.length && scenarios.length < requestedMatches;
    troopIndex += 1
  ) {
    const troop = catalog.troops[troopIndex];
    const attackerTh = clampInt(troop.unlockTownHall, 1, catalog.maxTownHall);
    const basePool = bases.filter((candidate) => candidate.townHall === attackerTh);
    const base = (basePool.length > 0 ? basePool : bases)[troopIndex % Math.max(1, basePool.length || bases.length)];
    const armies = armiesByTownHall.get(attackerTh) || [];
    const army = armies.find((candidate) => candidate.name === `pure-${troop.type}`)
      || armies[0];
    scenarios.push(makeScenario({
      index: scenarios.length,
      base,
      attackerTh,
      army,
      spawnProfile: SPAWN_PROFILES[troopIndex % SPAWN_PROFILES.length],
      levelProfile: ATTACK_LEVEL_PROFILES[troopIndex % ATTACK_LEVEL_PROFILES.length],
      tactics: troopIndex % 5 === 0 ? 'cannon-rally' : 'none',
      catalog,
      seed,
    }));
  }

  while (scenarios.length < requestedMatches) {
    const index = scenarios.length;
    const sampledIndex = index - Math.min(catalog.troops.length, requestedMatches);
    const base = sampledBases[sampledIndex % sampledBases.length];
    const attackerTh = clampInt(
      base.townHall + MATCHUP_OFFSETS[sampledIndex % MATCHUP_OFFSETS.length],
      1,
      catalog.maxTownHall,
    );
    const armies = armiesByTownHall.get(attackerTh) || [];
    const cycle = Math.floor(sampledIndex / bases.length);
    const army = armies[(index * 7 + cycle * 5) % armies.length];
    scenarios.push(makeScenario({
      index,
      base,
      attackerTh,
      army,
      spawnProfile: SPAWN_PROFILES[(index + cycle) % SPAWN_PROFILES.length],
      levelProfile: ATTACK_LEVEL_PROFILES[
        (Math.floor(index / 2) + cycle) % ATTACK_LEVEL_PROFILES.length
      ],
      tactics: index % 5 === 0 ? 'cannon-rally' : 'none',
      catalog,
      seed,
    }));
  }
  return scenarios;
}

function makeScenario({
  index,
  base,
  attackerTh,
  army,
  spawnProfile,
  levelProfile,
  tactics,
  catalog,
  seed,
}) {
  const troopLevels = {};
  for (const troop of catalog.troops) {
    troopLevels[troop.type] = attackLevelForProfile({
      troop,
      attackerTh,
      levelProfile,
      seed: hash32(seed, index, hashString(troop.type)),
    });
  }
  return {
    id: `battle-${String(index + 1).padStart(5, '0')}`,
    index,
    defenderTownHall: base.townHall,
    attackerTownHall: attackerTh,
    matchup: `TH${attackerTh}->TH${base.townHall}`,
    base,
    army,
    spawnProfile,
    levelProfile,
    tactics,
    troopLevels,
  };
}

function attackLevelForProfile({ troop, attackerTh, levelProfile, seed }) {
  const unlockedMax = Math.max(1, Math.min(troop.maxLevel, attackerTh + 1));
  if (levelProfile === 'low') return Math.max(1, unlockedMax - 2);
  if (levelProfile === 'mid') return Math.max(1, Math.ceil(unlockedMax * 0.65));
  if (levelProfile === 'maxed') return unlockedMax;
  return 1 + Math.floor(noise01(seed, attackerTh, troop.slotCost) * unlockedMax);
}

function runScenario(verifyReplay, combatDefs, scenario, verbose) {
  const actions = buildAttackActions(scenario, combatDefs);
  const simulation = withMutedConsole(!verbose, () => verifyReplay({
    defenderBuildings: scenario.base.buildings,
    actions,
    claimedResult: 'defeat',
    gridConfigs: combatDefs.CANONICAL_GRID_CONFIGS,
    serverTroopLevels: scenario.troopLevels,
    serverNftRarities: {},
    debugTrace: false,
  }));
  return {
    valid: !!simulation.valid,
    reason: String(simulation.reason || ''),
    win: String(simulation.resolvedResult || '').toLowerCase() === 'victory',
    resolvedResult: String(simulation.resolvedResult || ''),
    durationSec: Number(simulation._simTimeSec || 0),
    buildingsDestroyed: Number(simulation.buildingsDestroyed || 0),
    buildingCount: scenario.base.buildings.length,
    townHallHpPct: Number(simulation.townHallHpPct ?? 1),
    troopsSpawned: Number(simulation._deployedTroopsSpawned ?? simulation._troopsSpawned ?? 0),
    troopsAlive: Number(simulation._troopsAlive || 0),
    guardsAlive: Number(simulation._guardsAlive || 0),
    sharkTrapsTriggered: Number(simulation._sharkTrapsTriggered || 0),
    summonsSpawned: Number(simulation._summonsSpawned || 0),
    evolutionChildrenSpawned: Number(simulation._evolutionChildrenSpawned || 0),
  };
}

function buildAttackActions(scenario, combatDefs) {
  const attackGrid = combatDefs.CANONICAL_GRID_CONFIGS?.[2];
  if (!attackGrid) throw new Error('Attack grid 2 is missing from canonical combat config.');
  const units = scenario.army.units;
  const actions = [];
  for (let index = 0; index < units.length; index += 1) {
    const cell = spawnCellForProfile(
      scenario.spawnProfile,
      index,
      units.length,
      attackGrid,
    );
    const point = gridToWorld(cell.x, cell.z, 1, 1, attackGrid);
    actions.push({
      type: 'deploy_troop',
      troop: units[index],
      troopLevel: scenario.troopLevels[units[index]] || 1,
      x: point.x,
      z: point.z,
      t: spawnTimeForProfile(scenario.spawnProfile, index),
      deploy_index: index,
    });
  }
  if (scenario.tactics === 'cannon-rally') {
    const highValue = scenario.base.buildings
      .filter((building) => ['mortar', 'mage_tower', 'town_hall'].includes(building.type))
      .slice(0, 3);
    highValue.forEach((building, index) => {
      actions.push({
        type: 'cannon_fire',
        buildingId: building.id,
        t: 0.25 + index * 1.05,
      });
    });
    const townHall = scenario.base.buildings.find((building) => building.type === 'town_hall');
    if (townHall) {
      actions.push({
        type: 'rally_drop',
        buildingId: townHall.id,
        t: 4,
        flight_time: 0,
      });
    }
  }
  return actions.sort((a, b) => Number(a.t || 0) - Number(b.t || 0));
}

function spawnCellForProfile(profile, index, count, grid) {
  const width = Math.max(1, Math.trunc(Number(grid.grid_width) || 27));
  const height = Math.max(1, Math.trunc(Number(grid.grid_height) || 5));
  const safeX = (value) => clampInt(value, 0, width - 1);
  const safeZ = (value) => clampInt(value, 0, height - 1);
  if (profile === 'center-push') {
    return {
      x: safeX(Math.floor(width / 2) + (index % 5) - 2),
      z: safeZ(Math.floor(index / 15)),
    };
  }
  if (profile === 'left-flank') {
    return {
      x: safeX(2 + (index % Math.max(2, Math.floor(width * 0.25)))),
      z: safeZ(Math.floor(index / 12)),
    };
  }
  if (profile === 'right-flank') {
    return {
      x: safeX(width - 3 - (index % Math.max(2, Math.floor(width * 0.25)))),
      z: safeZ(Math.floor(index / 12)),
    };
  }
  if (profile === 'dual-flank') {
    const left = index % 2 === 0;
    const lane = Math.floor(index / 2) % Math.max(2, Math.floor(width * 0.20));
    return {
      x: safeX(left ? 2 + lane : width - 3 - lane),
      z: safeZ(Math.floor(index / 18)),
    };
  }
  if (profile === 'staggered-waves') {
    const perWave = Math.max(1, Math.ceil(count / 3));
    const withinWave = index % perWave;
    return {
      x: safeX(1 + Math.floor((withinWave + 0.5) * (width - 2) / perWave)),
      z: safeZ(Math.floor(index / perWave)),
    };
  }
  return {
    x: safeX(1 + Math.floor((index + 0.5) * (width - 2) / Math.max(1, count))),
    z: safeZ(index % 2),
  };
}

function spawnTimeForProfile(profile, index) {
  if (profile === 'staggered-waves') {
    return round(Math.floor(index / 8) * 0.7 + (index % 8) * 0.08, 3);
  }
  return round(index * 0.08, 3);
}

function gridToWorld(gridX, gridZ, sizeX, sizeZ, config) {
  const localX = (
    -config.grid_extent_x / 2
    + gridX * config.cell_size
    + sizeX * config.cell_size / 2
  );
  const localZ = (
    -config.grid_extent_z / 2
    + gridZ * config.cell_size
    + sizeZ * config.cell_size / 2
  );
  const cos = Math.cos(config.grid_rotation);
  const sin = Math.sin(config.grid_rotation);
  return {
    x: config.grid_center_x + localX * cos + localZ * sin,
    z: config.grid_center_z - localX * sin + localZ * cos,
  };
}

function createAggregate() {
  return {
    overall: createBucket(),
    byMatchup: new Map(),
    byDefenderTownHall: new Map(),
    byAttackerTownHall: new Map(),
    byBaseArchetype: new Map(),
    byBaseLevelProfile: new Map(),
    byArmy: new Map(),
    bySpawnProfile: new Map(),
    byAttackLevelProfile: new Map(),
    byTroop: new Map(),
    byBase: new Map(),
    samples: [],
  };
}

function createBucket() {
  return {
    count: 0,
    wins: 0,
    invalid: 0,
    durationSec: 0,
    buildingsDestroyed: 0,
    buildingCount: 0,
    townHallHpPct: 0,
    troopsSpawned: 0,
    troopsAlive: 0,
    guardsAlive: 0,
    sharkTrapsTriggered: 0,
    summonsSpawned: 0,
    evolutionChildrenSpawned: 0,
  };
}

function recordScenario(aggregate, scenario, result) {
  recordBucket(aggregate.overall, result);
  recordBucket(mapBucket(aggregate.byMatchup, scenario.matchup), result);
  recordBucket(
    mapBucket(aggregate.byDefenderTownHall, `TH${scenario.defenderTownHall}`),
    result,
  );
  recordBucket(
    mapBucket(aggregate.byAttackerTownHall, `TH${scenario.attackerTownHall}`),
    result,
  );
  recordBucket(mapBucket(aggregate.byBaseArchetype, scenario.base.archetype), result);
  recordBucket(mapBucket(aggregate.byBaseLevelProfile, scenario.base.levelProfile), result);
  recordBucket(mapBucket(aggregate.byArmy, scenario.army.name), result);
  recordBucket(mapBucket(aggregate.bySpawnProfile, scenario.spawnProfile), result);
  recordBucket(mapBucket(aggregate.byAttackLevelProfile, scenario.levelProfile), result);
  recordBucket(mapBucket(aggregate.byBase, scenario.base.id), result);
  for (const troopType of new Set(scenario.army.units)) {
    recordBucket(mapBucket(aggregate.byTroop, troopType), result);
  }
  if (aggregate.samples.length < 20) {
    aggregate.samples.push({
      id: scenario.id,
      matchup: scenario.matchup,
      base: scenario.base.id,
      army: scenario.army.name,
      spawnProfile: scenario.spawnProfile,
      attackLevelProfile: scenario.levelProfile,
      result,
    });
  }
}

function recordBucket(bucket, result) {
  bucket.count += 1;
  if (result.win) bucket.wins += 1;
  if (!result.valid) bucket.invalid += 1;
  for (const key of [
    'durationSec',
    'buildingsDestroyed',
    'buildingCount',
    'townHallHpPct',
    'troopsSpawned',
    'troopsAlive',
    'guardsAlive',
    'sharkTrapsTriggered',
    'summonsSpawned',
    'evolutionChildrenSpawned',
  ]) {
    bucket[key] += Number(result[key] || 0);
  }
}

function mapBucket(map, key) {
  if (!map.has(key)) map.set(key, createBucket());
  return map.get(key);
}

function auditStats(catalog, combatDefs) {
  const issues = [];
  const troopRows = [];
  for (const troop of catalog.troops) {
    const levels = combatDefs.TROOP_STATS?.[troop.type] || {};
    let previous = null;
    for (const level of Object.keys(levels).map(Number).sort((a, b) => a - b)) {
      const stats = levels[level];
      for (const field of ['hp', 'damage', 'atkSpeed', 'moveSpeed', 'range']) {
        if (!Number.isFinite(Number(stats[field])) || Number(stats[field]) < 0) {
          issues.push({
            severity: 'critical',
            code: 'invalid-troop-stat',
            message: `${troop.type} L${level} has invalid ${field}: ${stats[field]}`,
          });
        }
      }
      if (previous && Number(stats.hp) < Number(previous.hp)) {
        issues.push({
          severity: 'warning',
          code: 'troop-progression',
          message: `${troop.type} HP decreases from L${level - 1} to L${level}.`,
        });
      }
      if (previous && Number(stats.damage) < Number(previous.damage)) {
        issues.push({
          severity: 'warning',
          code: 'troop-progression',
          message: `${troop.type} damage decreases from L${level - 1} to L${level}.`,
        });
      }
      previous = stats;
    }
    const maxStats = levels[troop.maxLevel] || levels[Math.max(...Object.keys(levels).map(Number))];
    const directDps = Number(maxStats.damage) / Math.max(0.01, Number(maxStats.atkSpeed));
    troopRows.push({
      type: troop.type,
      level: troop.maxLevel,
      slots: troop.slotCost,
      hp: Number(maxStats.hp),
      directDps: round(directDps, 2),
      hpPerSlot: round(Number(maxStats.hp) / troop.slotCost, 2),
      directDpsPerSlot: round(directDps / troop.slotCost, 2),
      notes: maxStats.chainJumps
        ? `chain x${Number(maxStats.chainJumps) + 1}`
        : maxStats.defensePriority ? 'defense priority'
          : maxStats.trapImmune ? 'trap immune'
            : '',
    });
  }
  const dpsMedian = median(troopRows.map((row) => row.directDpsPerSlot));
  const hpMedian = median(troopRows.map((row) => row.hpPerSlot));
  for (const row of troopRows) {
    if (dpsMedian > 0 && row.directDpsPerSlot > dpsMedian * 2.25) {
      issues.push({
        severity: 'warning',
        code: 'troop-dps-outlier',
        message: `${row.type} direct DPS/slot is ${round(row.directDpsPerSlot / dpsMedian, 2)}x median.`,
      });
    }
    if (hpMedian > 0 && row.hpPerSlot > hpMedian * 2.5) {
      issues.push({
        severity: 'warning',
        code: 'troop-hp-outlier',
        message: `${row.type} HP/slot is ${round(row.hpPerSlot / hpMedian, 2)}x median.`,
      });
    }
  }

  const defenseRows = [];
  for (const [type, levels] of Object.entries(combatDefs.DEFENSE_STATS || {})) {
    for (const level of Object.keys(levels).map(Number).sort((a, b) => a - b)) {
      const stats = levels[level];
      const damage = Number(stats.maxDamage ?? stats.damage ?? stats.baseDamage ?? 0);
      const cadence = Number(stats.tickRate ?? stats.fireRate ?? 1);
      defenseRows.push({
        type,
        level,
        peakDps: round(damage / Math.max(0.01, cadence), 2),
        range: Number(stats.detectRange || 0),
      });
    }
  }
  return { troopRows, defenseRows, issues };
}

function buildCoverage(catalog, bases, scenarios) {
  const generatedBuildings = new Set();
  const generatedTownHalls = new Set();
  for (const base of bases) {
    generatedTownHalls.add(base.townHall);
    for (const building of base.buildings) generatedBuildings.add(building.type);
  }
  const simulatedTroops = new Set();
  const simulatedBases = new Set();
  for (const scenario of scenarios) {
    simulatedBases.add(scenario.base.id);
    for (const troop of scenario.army.units) simulatedTroops.add(troop);
  }
  const maxGeneratedTownHall = Math.max(1, ...generatedTownHalls);
  const maxSimulatedAttackerTownHall = scenarios.length > 0
    ? Math.max(...scenarios.map((scenario) => scenario.attackerTownHall))
    : maxGeneratedTownHall;
  const expectedBuildings = catalog.buildings
    .filter((building) => building.unlockTownHall <= maxGeneratedTownHall)
    .map((building) => building.type);
  const expectedTroops = catalog.troops
    .filter((troop) => troop.unlockTownHall <= maxSimulatedAttackerTownHall)
    .map((troop) => troop.type);
  return {
    expectedBuildings,
    generatedBuildings: [...generatedBuildings].sort(),
    missingBuildings: expectedBuildings
      .filter((type) => !generatedBuildings.has(type)),
    expectedTroops,
    simulatedTroops: [...simulatedTroops].sort(),
    missingTroops: scenarios.length === 0
      ? []
      : expectedTroops
        .filter((type) => !simulatedTroops.has(type)),
    generatedTownHalls: [...generatedTownHalls].sort((a, b) => a - b),
    generatedBases: bases.length,
    simulatedBases: simulatedBases.size,
  };
}

function analyzeBalance({
  aggregate,
  coverage,
  statAudit,
  targetWinRate,
  band,
  minGroupSize,
}) {
  const issues = [...statAudit.issues];
  if (coverage.missingBuildings.length > 0 || coverage.missingTroops.length > 0) {
    issues.push({
      severity: 'critical',
      code: 'coverage',
      message: `Missing content coverage. Buildings: ${coverage.missingBuildings.join(', ') || 'none'}; troops: ${coverage.missingTroops.join(', ') || 'none'}.`,
    });
  }
  if (aggregate.overall.invalid > 0) {
    issues.push({
      severity: 'critical',
      code: 'invalid-replay',
      message: `${aggregate.overall.invalid}/${aggregate.overall.count} generated replays were invalid.`,
    });
  }
  if (aggregate.overall.count === 0) return issues;

  const overallRate = rate(aggregate.overall.wins, aggregate.overall.count);
  if (Math.abs(overallRate - targetWinRate) > band) {
    issues.push({
      severity: 'warning',
      code: 'overall-win-rate',
      message: `Overall attacker win rate ${pct(overallRate)} is outside ${pct(targetWinRate)} +/- ${pct(band)}.`,
    });
  }
  collectBucketOutliers(
    issues,
    'matchup',
    aggregate.byMatchup,
    targetWinRate,
    band,
    minGroupSize,
  );
  collectBucketOutliers(
    issues,
    'base-archetype',
    aggregate.byBaseArchetype,
    overallRate,
    Math.max(0.12, band),
    minGroupSize,
  );
  collectBucketOutliers(
    issues,
    'army',
    aggregate.byArmy,
    overallRate,
    Math.max(0.15, band),
    minGroupSize,
  );
  collectBucketOutliers(
    issues,
    'troop',
    aggregate.byTroop,
    overallRate,
    Math.max(0.15, band),
    minGroupSize,
  );
  for (const [baseId, bucket] of aggregate.byBase) {
    if (bucket.count < 2) continue;
    const winRate = rate(bucket.wins, bucket.count);
    if (winRate === 0 || winRate === 1) {
      issues.push({
        severity: 'info',
        code: winRate === 0 ? 'unbeaten-base' : 'fragile-base',
        message: `${baseId} has ${pct(winRate)} attacker wins across ${bucket.count} samples.`,
      });
    }
  }
  return issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function collectBucketOutliers(issues, kind, map, expected, allowedBand, minGroupSize) {
  for (const [name, bucket] of map) {
    if (bucket.count < minGroupSize) continue;
    const actual = rate(bucket.wins, bucket.count);
    if (Math.abs(actual - expected) <= allowedBand) continue;
    issues.push({
      severity: 'warning',
      code: `${kind}-outlier`,
      message: `${kind} ${name} has ${pct(actual)} attacker wins across ${bucket.count} samples (reference ${pct(expected)}).`,
    });
  }
}

function serializeAggregate(aggregate) {
  return {
    overall: aggregate.overall,
    byMatchup: mapToObject(aggregate.byMatchup),
    byDefenderTownHall: mapToObject(aggregate.byDefenderTownHall),
    byAttackerTownHall: mapToObject(aggregate.byAttackerTownHall),
    byBaseArchetype: mapToObject(aggregate.byBaseArchetype),
    byBaseLevelProfile: mapToObject(aggregate.byBaseLevelProfile),
    byArmy: mapToObject(aggregate.byArmy),
    bySpawnProfile: mapToObject(aggregate.bySpawnProfile),
    byAttackLevelProfile: mapToObject(aggregate.byAttackLevelProfile),
    byTroop: mapToObject(aggregate.byTroop),
    byBase: mapToObject(aggregate.byBase),
    samples: aggregate.samples,
  };
}

function serializableCatalog(catalog) {
  return {
    maxTownHall: catalog.maxTownHall,
    buildings: catalog.buildings,
    troops: catalog.troops,
    warnings: catalog.warnings,
  };
}

function buildMarkdownReport(model, minGroupSize) {
  const { config, catalog, coverage, statAudit, balanceIssues, aggregate } = model;
  const overall = aggregate.overall;
  const lines = [];
  lines.push('# Clash Full-Game Balance Lab');
  lines.push('');
  lines.push(`**Generated:** ${model.generatedAt}`);
  lines.push(`**Seed:** ${config.seed}`);
  lines.push(`**Town Halls:** ${config.townHalls.map((th) => `TH${th}`).join(', ')}`);
  lines.push(`**Unique generated bases:** ${config.generatedBaseCount}`);
  lines.push(`**Replay simulations:** ${config.simulatedMatches}`);
  lines.push(`**Ship capacity used:** ${config.shipCapacity} slots`);
  lines.push(`**Elapsed:** ${(config.elapsedMs / 1000).toFixed(1)}s`);
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('- Uses the production `server/combat_session.js` replay simulator.');
  lines.push('- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.');
  lines.push('- Uses a temporary SQLite database and never reads or writes production player data.');
  lines.push(`- Generates deterministic layouts across ${ARCHETYPES.length} logical base archetypes and ${BASE_LEVEL_PROFILES.length} progression profiles.`);
  lines.push('- Samples base, army, level, matchup, deployment, cannon, and rally dimensions without requiring a full Cartesian run.');
  lines.push('- Reusing the same seed makes before/after balance comparisons reproducible.');
  lines.push('');
  lines.push('## Content Discovery');
  lines.push('');
  lines.push(`- Buildings: ${catalog.buildings.map((entry) => entry.type).join(', ')}`);
  lines.push(`- Active troops: ${catalog.troops.map((entry) => entry.type).join(', ')}`);
  lines.push(`- Building coverage: ${coverage.generatedBuildings.length}/${coverage.expectedBuildings.length}`);
  lines.push(`- Troop simulation coverage: ${coverage.simulatedTroops.length}/${coverage.expectedTroops.length}`);
  lines.push(`- Bases exercised: ${coverage.simulatedBases}/${coverage.generatedBases}`);
  if (catalog.warnings.length > 0) {
    lines.push('');
    lines.push('Catalog warnings:');
    for (const warning of catalog.warnings) lines.push(`- ${warning}`);
  }
  lines.push('');
  lines.push('## Overall Health');
  lines.push('');
  if (overall.count === 0) {
    lines.push('Catalog-only run: replay simulation was skipped.');
  } else {
    lines.push('| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |');
    lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|');
    lines.push(overallMarkdownRow(overall));
  }
  lines.push('');
  appendBucketSection(lines, 'Town Hall Matchups', aggregate.byMatchup, minGroupSize);
  appendBucketSection(lines, 'Base Archetypes', aggregate.byBaseArchetype, minGroupSize);
  appendBucketSection(lines, 'Base Progression Profiles', aggregate.byBaseLevelProfile, minGroupSize);
  appendBucketSection(lines, 'Army Policies', aggregate.byArmy, minGroupSize);
  appendBucketSection(lines, 'Spawn Policies', aggregate.bySpawnProfile, minGroupSize);
  appendBucketSection(lines, 'Attack Level Profiles', aggregate.byAttackLevelProfile, minGroupSize);
  appendBucketSection(lines, 'Troop Presence', aggregate.byTroop, minGroupSize);
  lines.push('## Max-Level Troop Efficiency');
  lines.push('');
  lines.push('| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---|');
  for (const row of [...statAudit.troopRows].sort(
    (a, b) => b.directDpsPerSlot - a.directDpsPerSlot,
  )) {
    lines.push(
      `| ${escapeMd(row.type)} | ${row.level} | ${row.slots} | ${formatNumber(row.hp)} `
      + `| ${formatNumber(row.directDps)} | ${formatNumber(row.hpPerSlot)} `
      + `| ${formatNumber(row.directDpsPerSlot)} | ${escapeMd(row.notes)} |`,
    );
  }
  lines.push('');
  lines.push('Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.');
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (balanceIssues.length === 0) {
    lines.push('No structural, coverage, replay, or sampled balance issues were detected.');
  } else {
    for (const issue of balanceIssues.slice(0, 80)) {
      lines.push(`- **${issue.severity.toUpperCase()} / ${issue.code}:** ${issue.message}`);
    }
    if (balanceIssues.length > 80) {
      lines.push(`- ${balanceIssues.length - 80} additional findings are available in the JSON report.`);
    }
  }
  lines.push('');
  lines.push('## Recommended Workflow');
  lines.push('');
  lines.push('1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.');
  lines.push('2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.');
  lines.push('3. Re-run the same seed before and after tuning and compare the JSON buckets.');
  lines.push('4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.');
  lines.push('5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function appendBucketSection(lines, title, rawBuckets, minGroupSize) {
  const entries = Object.entries(rawBuckets || {})
    .filter(([, bucket]) => bucket.count >= Math.min(minGroupSize, 2))
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  if (entries.length === 0) return;
  lines.push(`## ${title}`);
  lines.push('');
  lines.push('| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const [name, bucket] of entries) {
    lines.push(
      `| ${escapeMd(name)} | ${bucket.count} | ${bucket.wins} `
      + `| ${pct(rate(bucket.wins, bucket.count))} | ${bucket.invalid} `
      + `| ${avg(bucket.durationSec, bucket.count).toFixed(1)}s `
      + `| ${pct(rate(bucket.buildingsDestroyed, bucket.buildingCount))} `
      + `| ${pct(avg(bucket.townHallHpPct, bucket.count))} |`,
    );
  }
  lines.push('');
}

function overallMarkdownRow(bucket) {
  return (
    `| ${bucket.count} | ${bucket.wins} | ${pct(rate(bucket.wins, bucket.count))} `
    + `| ${bucket.invalid} | ${avg(bucket.durationSec, bucket.count).toFixed(1)}s `
    + `| ${pct(rate(bucket.buildingsDestroyed, bucket.buildingCount))} `
    + `| ${pct(avg(bucket.townHallHpPct, bucket.count))} `
    + `| ${pct(rate(bucket.troopsAlive, bucket.troopsSpawned))} |`
  );
}

function resolveOutputPaths(root, cli) {
  const reportDir = path.resolve(root, String(cli['report-dir'] || 'tools/pvp-balance/reports'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const markdown = path.resolve(
    root,
    String(cli.out || path.join(reportDir, `full-game-balance-${stamp}.md`)),
  );
  const parsed = path.parse(markdown);
  const json = path.resolve(
    root,
    String(cli.json || path.join(parsed.dir, `${parsed.name}.json`)),
  );
  return { markdown, json };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator >= 0) {
      parsed[token.slice(2, separator)] = token.slice(separator + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function printHelp() {
  console.log(`
Clash Full-Game Balance Lab

Usage:
  node tools/pvp-balance/run.js [options]

Core options:
  --bases <n>              Unique logical bases to generate. Default: ${DEFAULT_BASE_COUNT}
  --matches <n>            Replay simulations for sampled mode. Default: ${DEFAULT_MATCHES}
  --seed <n>               Deterministic random seed. Default: ${DEFAULT_SEED}
  --profile <range>        all, thN, or thN-thN. Default: ${DEFAULT_PROFILE}
  --catalog-only           Generate and validate content/bases without replay simulation.
  --exhaustive             Traverse base x matchup x army x deployment combinations.
  --max-scenarios <n>      Safety cap for exhaustive mode. Default: 50000

Analysis options:
  --target-winrate <rate>  Expected attacker win rate. Default: ${DEFAULT_TARGET_WIN_RATE}
  --band <rate>            Allowed +/- win-rate band. Default: ${DEFAULT_BAND}
  --min-group-size <n>     Samples required before flagging a group. Default: ${DEFAULT_MIN_GROUP_SIZE}
  --strict                 Return non-zero when critical balance findings exist.

Output options:
  --out <path>             Markdown report path.
  --json <path>            JSON report path.
  --report-dir <path>      Default report directory.
  --dump-bases <path>      Also write only generated base layouts as JSON.
  --verbose                Show replay verifier logs and progress.
  --help                   Show this help.

Examples:
  npm run pvp:balance -- --catalog-only --bases 144
  npm run pvp:balance -- --bases 144 --matches 300 --seed 42
  npm run pvp:balance -- --profile th5-th6 --matches 500
`);
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function withMutedConsole(muted, callback) {
  if (!muted) return callback();
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return callback();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hash32(...values) {
  let hash = 2166136261;
  for (const value of values) {
    hash ^= Number(value) >>> 0;
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

function noise01(...values) {
  return hash32(...values) / 0xffffffff;
}

function mulberry32(seedValue) {
  let state = seedValue >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledCopy(values, seedValue) {
  const result = [...values];
  const random = mulberry32(seedValue);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function intArg(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function numberArg(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampInt(value, min, max) {
  const number = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : min;
  return Math.max(min, Math.min(max, number));
}

function rate(part, total) {
  return Number(total) > 0 ? Number(part) / Number(total) : 0;
}

function avg(sum, count) {
  return Number(count) > 0 ? Number(sum) / Number(count) : 0;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function severityRank(severity) {
  return { critical: 0, warning: 1, info: 2 }[severity] ?? 3;
}
