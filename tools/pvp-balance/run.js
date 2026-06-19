#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_MATCHES = 1000;
const DEFAULT_SEED = 42;
const DEFAULT_TARGET_WIN_RATE = 0.55;
const DEFAULT_BAND = 0.03;
const DEFAULT_PROFILE = 'th2-th3';
const DEFAULT_MIN_GROUP_SIZE = 20;
const PROFILE_TH_WEIGHTS = {
  th2: [[2, 1.0]],
  th3: [[3, 1.0]],
  th4: [[4, 1.0]],
  'th2-th3': [[2, 0.50], [3, 0.50]],
  'th2-th4': [[2, 0.34], [3, 0.33], [4, 0.33]],
};
const SHIP_LEVELS_BY_TH = {
  2: [2, 1],
  3: [3, 2, 2],
  4: [4, 4, 3, 3, 2],
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const verbose = !!args.verbose;
const repoRoot = path.resolve(__dirname, '..', '..');
const matches = intArg(args.matches, DEFAULT_MATCHES, 1, 1_000_000);
const seed = intArg(args.seed, DEFAULT_SEED, 1, 0xffffffff);
const targetWinRate = numberArg(args.targetWinrate ?? args['target-winrate'], DEFAULT_TARGET_WIN_RATE, 0, 1);
const band = numberArg(args.band, DEFAULT_BAND, 0.001, 0.5);
const profileName = String(args.profile || DEFAULT_PROFILE).trim().toLowerCase();
const minGroupSize = intArg(args['min-group-size'], DEFAULT_MIN_GROUP_SIZE, 1, 1_000_000);
const reportDir = path.resolve(repoRoot, args['report-dir'] || 'tools/pvp-balance/reports');

const loadLog = console.log;
if (!verbose) console.log = () => {};
const { verifyReplay } = require('../../server/combat_session');
const { BUILDING_DEFS } = require('../../server/db');
const {
  CANONICAL_GRID_CONFIGS,
  MAX_SHIPS,
  TROOPS_PER_SHIP,
} = require('../../server/combat_defs');
const {
  buildBotBaseTemplates,
} = require('../../server/matchmaking_defs');
if (!verbose) console.log = loadLog;

const rng = mulberry32(seed);
const templates = buildBotBaseTemplates().filter((template) => profileAllowsTemplate(profileName, template));
if (templates.length === 0) {
  throw new Error(`No defender templates found for profile "${profileName}".`);
}

const startedAt = Date.now();
const summary = createBucket();
const byTh = new Map();
const byDifficulty = new Map();
const byAttackPolicy = new Map();
const byArmyPolicy = new Map();
const byScenario = new Map();
const samples = [];

for (let i = 0; i < matches; i += 1) {
  const scenario = buildScenario(i, rng, templates, profileName);
  const result = runSimulation(scenario, verbose);
  record(summary, result);
  record(mapBucket(byTh, `TH${scenario.th}`), result);
  record(mapBucket(byDifficulty, scenario.difficulty), result);
  record(mapBucket(byAttackPolicy, scenario.attackPolicy), result);
  record(mapBucket(byArmyPolicy, scenario.armyPolicy), result);
  record(mapBucket(byScenario, scenario.label), result);
  if (samples.length < 12) samples.push(sampleRow(scenario, result));
}

const elapsedMs = Date.now() - startedAt;
const report = buildMarkdownReport({
  matches,
  seed,
  profileName,
  targetWinRate,
  band,
  minGroupSize,
  elapsedMs,
  summary,
  byTh,
  byDifficulty,
  byAttackPolicy,
  byArmyPolicy,
  byScenario,
  samples,
});

fs.mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = path.resolve(args.out || path.join(reportDir, `pvp-balance-${stamp}.md`));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, report, 'utf8');

const winRate = rate(summary.wins, summary.count);
const health = healthLabel(winRate, targetWinRate, band);
console.log(`PvP balance run complete: ${summary.wins}/${summary.count} wins (${pct(winRate)})`);
console.log(`Health: ${health}; target ${pct(targetWinRate)} +/- ${pct(band)}`);
console.log(`Report: ${path.relative(repoRoot, outPath)}`);

function buildScenario(index, rand, candidateTemplates, profile) {
  const th = weightedChoice(rand, PROFILE_TH_WEIGHTS[profile] || PROFILE_TH_WEIGHTS[DEFAULT_PROFILE]);
  const difficulty = weightedChoice(rand, [
    ['easy', 0.25],
    ['normal', 0.50],
    ['hard', 0.25],
  ]);
  const pool = candidateTemplates.filter((template) => template.th === th && template.difficulty === difficulty);
  const template = pool[Math.floor(rand() * pool.length)] || candidateTemplates[Math.floor(rand() * candidateTemplates.length)];
  const attackPolicy = weightedChoice(rand, [
    ['south-spread', 0.45],
    ['nearest-townhall-edge', 0.35],
    ['split-corners', 0.20],
  ]);
  const armyPolicy = weightedChoice(rand, [
    ['balanced', 0.45],
    ['ranged-heavy', 0.30],
    ['melee-heavy', 0.25],
  ]);
  const troopLevel = Math.max(1, Math.min(3, th));
  const fleet = buildFleet(rand, th, troopLevel, armyPolicy);
  const actions = buildActions(rand, {
    index,
    th,
    fleet,
    attackPolicy,
    target: template.buildings.find((building) => building.type === 'town_hall') || template.buildings[0],
  });
  const defenderBuildings = materializeBuildings(template.buildings);
  return {
    index,
    th,
    difficulty,
    attackPolicy,
    armyPolicy,
    troopLevel,
    label: `TH${th} ${difficulty} ${attackPolicy} ${armyPolicy}`,
    template,
    defenderBuildings,
    actions,
    serverTroopLevels: {
      knight: troopLevel,
      mage: troopLevel,
      archer: troopLevel,
      demon_king: Math.min(3, troopLevel),
      fire_dragon: Math.min(3, troopLevel),
    },
  };
}

function runSimulation(scenario, isVerbose) {
  const simArgs = {
    defenderBuildings: scenario.defenderBuildings,
    actions: scenario.actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: scenario.serverTroopLevels,
    debugTrace: false,
  };
  const originalLog = console.log;
  if (!isVerbose) console.log = () => {};
  try {
    const sim = verifyReplay(simArgs);
    const resolvedResult = String(sim.resolvedResult || '').toLowerCase();
    return {
      valid: !!sim.valid,
      win: resolvedResult === 'victory',
      resolvedResult,
      reason: sim.reason || '',
      durationSec: Number(sim._simTimeSec || 0),
      buildingsDestroyed: Number(sim.buildingsDestroyed || 0),
      buildingCount: scenario.defenderBuildings.length,
      townHallHpPct: Number(sim.townHallHpPct ?? 1),
      troopsSpawned: Number(sim._troopsSpawned || 0),
      troopsAlive: Number(sim._troopsAlive || 0),
      guardsAlive: Number(sim._guardsAlive || 0),
      cannonShots: Number(sim._cannonShotsAccepted || 0),
      rallyDrops: Number(sim._rallyDropsUsed || 0),
    };
  } finally {
    if (!isVerbose) console.log = originalLog;
  }
}

function buildFleet(rand, th, troopLevel, armyPolicy) {
  const shipLevels = SHIP_LEVELS_BY_TH[th] || [Math.max(1, Math.min(4, th))];
  return shipLevels.slice(0, MAX_SHIPS).map((shipLevel) => {
    const capacity = Math.min(TROOPS_PER_SHIP, Math.max(1, shipLevel * 3));
    const troops = [];
    while (troops.length < capacity) {
      troops.push(`${pickTroop(rand, armyPolicy)}:L${troopLevel}`);
    }
    return { level: shipLevel, troops };
  });
}

function pickTroop(rand, armyPolicy) {
  if (armyPolicy === 'ranged-heavy') {
    return weightedChoice(rand, [
      ['archer', 0.48],
      ['mage', 0.34],
      ['knight', 0.18],
    ]);
  }
  if (armyPolicy === 'melee-heavy') {
    return weightedChoice(rand, [
      ['knight', 0.58],
      ['archer', 0.24],
      ['mage', 0.18],
    ]);
  }
  return weightedChoice(rand, [
    ['knight', 0.38],
    ['archer', 0.34],
    ['mage', 0.28],
  ]);
}

function buildActions(rand, scenario) {
  const actions = [{
    type: 'battle_start',
    battle_session_id: `pvp-balance-${scenario.index}`,
    grid_configs: CANONICAL_GRID_CONFIGS,
    grid_config: CANONICAL_GRID_CONFIGS[0],
  }];
  const spawnCells = spawnCellsForPolicy(rand, scenario.attackPolicy, scenario.target);
  for (let i = 0; i < scenario.fleet.length; i += 1) {
    const ship = scenario.fleet[i];
    const cell = spawnCells[i % spawnCells.length];
    const spawn = gridToWorld(cell.x, cell.z, 1, 1, CANONICAL_GRID_CONFIGS[0]);
    const troopSpawns = ship.troops.map(() => ({
      x: round(spawn.x + (rand() - 0.5) * 0.12, 4),
      z: round(spawn.z + (rand() - 0.5) * 0.12, 4),
    }));
    actions.push({
      t: round(i * 0.45, 3),
      type: 'place_ship',
      x: spawn.x,
      z: spawn.z,
      troop_x: spawn.x,
      troop_z: spawn.z,
      ship_index: i,
      shipLevel: ship.level,
      troops: ship.troops,
      troop_spawns: troopSpawns,
    });
  }
  return actions;
}

function spawnCellsForPolicy(rand, attackPolicy, target) {
  const tx = clampInt(Number(target?.grid_x ?? 11), 0, 26);
  const tz = clampInt(Number(target?.grid_z ?? 11), 0, 26);
  if (attackPolicy === 'nearest-townhall-edge') {
    const distances = [
      { edge: 'north', d: tz },
      { edge: 'south', d: 26 - tz },
      { edge: 'west', d: tx },
      { edge: 'east', d: 26 - tx },
    ].sort((a, b) => a.d - b.d);
    return edgeCells(distances[0].edge, tx, tz);
  }
  if (attackPolicy === 'split-corners') {
    return [
      { x: 2, z: 2 },
      { x: 24, z: 2 },
      { x: 2, z: 24 },
      { x: 24, z: 24 },
      { x: clampInt(8 + Math.floor(rand() * 11), 2, 24), z: 24 },
    ];
  }
  return [
    { x: 5, z: 24 },
    { x: 13, z: 24 },
    { x: 21, z: 24 },
    { x: 9, z: 22 },
    { x: 17, z: 22 },
  ];
}

function edgeCells(edge, tx, tz) {
  if (edge === 'north') {
    return [
      { x: clampInt(tx, 2, 24), z: 2 },
      { x: clampInt(tx - 5, 2, 24), z: 3 },
      { x: clampInt(tx + 5, 2, 24), z: 3 },
    ];
  }
  if (edge === 'west') {
    return [
      { x: 2, z: clampInt(tz, 2, 24) },
      { x: 3, z: clampInt(tz - 5, 2, 24) },
      { x: 3, z: clampInt(tz + 5, 2, 24) },
    ];
  }
  if (edge === 'east') {
    return [
      { x: 24, z: clampInt(tz, 2, 24) },
      { x: 23, z: clampInt(tz - 5, 2, 24) },
      { x: 23, z: clampInt(tz + 5, 2, 24) },
    ];
  }
  return [
    { x: clampInt(tx, 2, 24), z: 24 },
    { x: clampInt(tx - 5, 2, 24), z: 23 },
    { x: clampInt(tx + 5, 2, 24), z: 23 },
  ];
}

function materializeBuildings(buildings) {
  return buildings.map((building, index) => {
    const def = BUILDING_DEFS[building.type] || {};
    const hpLevels = Array.isArray(def.hp_levels) ? def.hp_levels : [1000];
    const level = clampInt(Number(building.level || 1), 1, Math.max(1, hpLevels.length));
    const maxHp = Number(hpLevels[level - 1] || hpLevels[0] || 1000);
    return {
      id: index + 1,
      type: building.type,
      level,
      grid_x: building.grid_x,
      grid_z: building.grid_z,
      grid_index: building.grid_index || 0,
      hp: maxHp,
      max_hp: maxHp,
      has_ship: building.has_ship || 0,
    };
  });
}

function buildMarkdownReport(data) {
  const winRate = rate(data.summary.wins, data.summary.count);
  const health = healthLabel(winRate, data.targetWinRate, data.band);
  const outliers = collectOutliers(data, data.minGroupSize);
  const lines = [];
  lines.push('# PvP Balance MVP Report');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Profile:** ${data.profileName}`);
  lines.push(`**Matches:** ${data.matches}`);
  lines.push(`**Seed:** ${data.seed}`);
  lines.push(`**Target attacker win rate:** ${pct(data.targetWinRate)} +/- ${pct(data.band)}`);
  lines.push(`**Health:** ${health}`);
  lines.push(`**Elapsed:** ${(data.elapsedMs / 1000).toFixed(1)}s`);
  lines.push('');
  lines.push('## Data Sources Analyzed');
  lines.push('- `server/combat_session.js` replay verifier');
  lines.push('- `server/combat_defs.js` troop and defense stats');
  lines.push('- `server/db.js` building HP definitions');
  lines.push('- `server/matchmaking_defs.js` TH2/TH3/TH4 bot base templates');
  lines.push('');
  lines.push('## Overall');
  lines.push('| Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |');
  lines.push('|---:|---:|---:|---:|---:|---:|---:|');
  lines.push(bucketRow(data.summary));
  lines.push('');
  lines.push('## By Town Hall');
  appendGroupTable(lines, data.byTh);
  lines.push('');
  lines.push('## By Difficulty');
  appendGroupTable(lines, data.byDifficulty);
  lines.push('');
  lines.push('## By Attack Policy');
  appendGroupTable(lines, data.byAttackPolicy);
  lines.push('');
  lines.push('## By Army Policy');
  appendGroupTable(lines, data.byArmyPolicy);
  lines.push('');
  lines.push('## Outliers Detected');
  if (outliers.length === 0) {
    lines.push(`No groups with at least ${data.minGroupSize} battles were outside the target band.`);
  } else {
    lines.push('| Group | Battles | Win Rate | Expected | Issue |');
    lines.push('|---|---:|---:|---:|---|');
    for (const outlier of outliers.slice(0, 20)) {
      lines.push(`| ${escapeMd(outlier.name)} | ${outlier.count} | ${pct(outlier.winRate)} | ${pct(data.targetWinRate)} +/- ${pct(data.band)} | ${outlier.issue} |`);
    }
  }
  lines.push('');
  lines.push('## Recommendations');
  lines.push(...recommendations(winRate, data.targetWinRate, data.band, outliers));
  lines.push('');
  lines.push('## Sample Battles');
  lines.push('| # | Scenario | Result | Duration | Buildings Destroyed | TH HP Left | Troops Alive |');
  lines.push('|---:|---|---|---:|---:|---:|---:|');
  for (const sample of data.samples) {
    lines.push(`| ${sample.index} | ${escapeMd(sample.scenario)} | ${sample.result} | ${sample.durationSec.toFixed(1)}s | ${sample.buildingsDestroyed} | ${pct(sample.townHallHpPct)} | ${sample.troopsAlive}/${sample.troopsSpawned} |`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('- This is an MVP balance lab, not a golden deterministic game test.');
  lines.push('- It measures server-side replay simulation outcomes using generated attack actions.');
  lines.push('- It intentionally uses several simple attacker policies; future versions should add smarter deployment, cannon, rally, and real player base sampling.');
  lines.push('- Use the same seed when comparing balance changes so deltas are meaningful.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function recommendations(overallWinRate, targetWinRate, band, outliers) {
  const lines = [];
  if (overallWinRate > targetWinRate + band) {
    lines.push(`- Overall attackers are over target by ${pct(overallWinRate - targetWinRate)}. First check defense HP/damage, bot template strength, and whether generated armies are too full for the intended TH tier.`);
  } else if (overallWinRate < targetWinRate - band) {
    lines.push(`- Overall attackers are under target by ${pct(targetWinRate - overallWinRate)}. First check ship capacity, troop levels, overly dense defense clusters, and Tombstone/Archer Tower pressure.`);
  } else {
    lines.push('- Overall win rate is inside the target band. Focus on outlier TH/difficulty/army-policy groups before changing global numbers.');
  }

  const high = outliers.filter((item) => item.direction === 'high').slice(0, 3);
  const low = outliers.filter((item) => item.direction === 'low').slice(0, 3);
  for (const item of high) {
    lines.push(`- ${item.name} is too attacker-favored (${pct(item.winRate)}). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.`);
  }
  for (const item of low) {
    lines.push(`- ${item.name} is too defender-favored (${pct(item.winRate)}). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.`);
  }
  if (outliers.some((item) => /ranged-heavy/i.test(item.name))) {
    lines.push('- Ranged army outliers appeared; inspect Archer/Mage DPS versus defense target ranges before making broad economy or matchmaking changes.');
  }
  if (outliers.some((item) => /hard/i.test(item.name))) {
    lines.push('- Hard-base outliers appeared; keep them separate from normal matchmaking so recovery tuning does not flatten all PvP challenge.');
  }
  return lines;
}

function collectOutliers(data, minGroupSize) {
  const groups = [
    ...namedBuckets('TH', data.byTh),
    ...namedBuckets('Difficulty', data.byDifficulty),
    ...namedBuckets('Attack', data.byAttackPolicy),
    ...namedBuckets('Army', data.byArmyPolicy),
    ...namedBuckets('Scenario', data.byScenario),
  ];
  return groups
    .filter((item) => item.bucket.count >= minGroupSize)
    .map((item) => {
      const winRate = rate(item.bucket.wins, item.bucket.count);
      const delta = winRate - data.targetWinRate;
      if (Math.abs(delta) <= data.band) return null;
      return {
        name: `${item.kind}: ${item.name}`,
        count: item.bucket.count,
        winRate,
        delta,
        direction: delta > 0 ? 'high' : 'low',
        issue: delta > 0 ? 'attacker-favored' : 'defender-favored',
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function appendGroupTable(lines, map) {
  lines.push('| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const [name, bucket] of [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    lines.push(`| ${escapeMd(name)} | ${bucketRow(bucket).slice(2)}`);
  }
}

function bucketRow(bucket) {
  return `| ${bucket.count} | ${bucket.wins} | ${pct(rate(bucket.wins, bucket.count))} | ${avg(bucket.durationSec, bucket.count).toFixed(1)}s | ${avg(bucket.buildingsDestroyed, bucket.count).toFixed(1)} | ${pct(avg(bucket.townHallHpPct, bucket.count))} | ${pct(rate(bucket.troopsAlive, bucket.troopsSpawned))} |`;
}

function createBucket() {
  return {
    count: 0,
    wins: 0,
    durationSec: 0,
    buildingsDestroyed: 0,
    townHallHpPct: 0,
    troopsSpawned: 0,
    troopsAlive: 0,
  };
}

function record(bucket, result) {
  bucket.count += 1;
  if (result.win) bucket.wins += 1;
  bucket.durationSec += result.durationSec;
  bucket.buildingsDestroyed += result.buildingsDestroyed;
  bucket.townHallHpPct += result.townHallHpPct;
  bucket.troopsSpawned += result.troopsSpawned;
  bucket.troopsAlive += result.troopsAlive;
}

function mapBucket(map, key) {
  if (!map.has(key)) map.set(key, createBucket());
  return map.get(key);
}

function namedBuckets(kind, map) {
  return [...map.entries()].map(([name, bucket]) => ({ kind, name, bucket }));
}

function sampleRow(scenario, result) {
  return {
    index: scenario.index + 1,
    scenario: scenario.label,
    result: result.win ? 'victory' : 'defeat',
    durationSec: result.durationSec,
    buildingsDestroyed: result.buildingsDestroyed,
    townHallHpPct: result.townHallHpPct,
    troopsAlive: result.troopsAlive,
    troopsSpawned: result.troopsSpawned,
  };
}

function profileAllowsTemplate(profile, template) {
  const weights = PROFILE_TH_WEIGHTS[profile];
  if (!weights) throw new Error(`Unsupported profile "${profile}". Use th2, th3, th4, th2-th3, or th2-th4.`);
  const allowedTh = new Set(weights.map((entry) => entry[0]));
  return allowedTh.has(template.th);
}

function gridToWorld(gridX, gridZ, sizeX, sizeZ, gc) {
  const halfX = gc.grid_extent_x / 2.0;
  const halfZ = gc.grid_extent_z / 2.0;
  const cs = gc.cell_size;
  const localX = -halfX + gridX * cs + (sizeX * cs) / 2.0;
  const localZ = -halfZ + gridZ * cs + (sizeZ * cs) / 2.0;
  const cosR = Math.cos(gc.grid_rotation);
  const sinR = Math.sin(gc.grid_rotation);
  return {
    x: round(gc.grid_center_x + localX * cosR + localZ * sinR, 4),
    z: round(gc.grid_center_z - localX * sinR + localZ * cosR, 4),
  };
}

function weightedChoice(rand, entries) {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function mulberry32(seedValue) {
  let t = seedValue >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) {
      parsed[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function printHelp() {
  console.log(`
PvP Balance MVP

Usage:
  node tools/pvp-balance/run.js [options]

Options:
  --matches <n>             Number of battles to simulate. Default: ${DEFAULT_MATCHES}
  --seed <n>                Deterministic RNG seed. Default: ${DEFAULT_SEED}
  --profile <name>          th2, th3, th4, th2-th3, or th2-th4. Default: ${DEFAULT_PROFILE}
  --target-winrate <rate>   Target attacker win rate. Default: ${DEFAULT_TARGET_WIN_RATE}
  --band <rate>             Allowed +/- win-rate band. Default: ${DEFAULT_BAND}
  --out <path>              Markdown report output path.
  --report-dir <path>       Output directory when --out is omitted.
  --min-group-size <n>      Minimum group size for outliers. Default: ${DEFAULT_MIN_GROUP_SIZE}
  --verbose                 Show verifier logs.
  --help                    Show this help.
`);
}

function intArg(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function numberArg(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function rate(part, total) {
  return total > 0 ? part / total : 0;
}

function avg(sum, count) {
  return count > 0 ? sum / count : 0;
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function healthLabel(winRate, target, allowedBand) {
  if (Math.abs(winRate - target) <= allowedBand) return 'HEALTHY';
  if (Math.abs(winRate - target) <= allowedBand * 2) return 'CONCERNS';
  return 'CRITICAL ISSUES';
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}
