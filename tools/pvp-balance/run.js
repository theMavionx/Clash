#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { UNIT_ROLE_REGISTRY } = require('./unit_roles');

const DEFAULT_SEED = 42;
const DEFAULT_BASE_COUNT = 144;
const DEFAULT_MATCHES = 288;
const DEFAULT_TARGET_WIN_RATE = 0.55;
const DEFAULT_BAND = 0.08;
const DEFAULT_MIN_GROUP_SIZE = 6;
const DEFAULT_PROFILE = 'all';
const ELITE_MIN_SAMPLES = 3;
const BREAKABILITY_ADAPTIVE_ARMY_LIMIT = 3;
const COUNTER_META_CONFIRMATION_CONTEXTS = 2;
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
  'rear-keep',
  'cannon-screen',
  'crossfire',
  'echelon-left',
  'echelon-right',
  'kill-corridor',
];
const BASE_LEVEL_PROFILES = [
  'maxed',
  'mid',
  'rushed-defense',
  'rushed-economy',
  'mixed',
];
const ARCHETYPE_PROFILE_PHASE = Object.freeze({
  'compact-core': 0,
  'defense-ring': 1,
  'layered-rings': 2,
  'split-core': 3,
  'southern-funnel': 4,
  'resource-shield': 0,
  'wide-spread': 1,
  'asymmetric-left': 2,
  'asymmetric-right': 2,
  'trap-lanes': 3,
  'corner-keep': 4,
  diamond: 0,
  'rear-keep': 1,
  'cannon-screen': 2,
  crossfire: 3,
  'echelon-left': 4,
  'echelon-right': 4,
  'kill-corridor': 0,
});
const ATTACK_LEVEL_PROFILES = ['low', 'mid', 'maxed', 'mixed'];
const SPAWN_FORMATIONS = [
  'wide-line',
  'center-column',
  'left-flank',
  'right-flank',
  'dual-flank',
  'three-lane',
  'diamond',
  'vanguard-wedge',
  'inverted-wedge',
  'edge-sweep',
];
const SPAWN_TIMINGS = ['burst', 'rapid', 'two-waves', 'three-waves', 'drip'];
const DEPLOYMENT_ORDERS = ['roster-order', 'tank-front-support-rear'];
const SPAWN_PROFILES = SPAWN_FORMATIONS.flatMap((formation) => (
  SPAWN_TIMINGS.flatMap((timing) => (
    DEPLOYMENT_ORDERS.map((order) => `${formation}__${timing}__${order}`)
  ))
));
const TACTIC_PROFILES = [
  'none',
  'cannon-focus',
  'cannon-rally',
  'rally-core',
  'freeze-defense',
  'rage-entry',
  'medkit-entry',
  'skeleton-barrel',
  'freeze-rage',
  'freeze-barrel',
  'cannon-medkit',
  'rally-rage',
];
const NFT_RARITIES = ['common', 'epic', 'legendary', 'unrevealed'];
const MATCHUP_OFFSETS = [0, 0, 0, -1, 1];
const DEPLOYMENT_ROLE_BY_TROOP = Object.freeze(Object.fromEntries(
  Object.entries(UNIT_ROLE_REGISTRY).map(([type, contract]) => [
    type,
    contract.role,
  ]),
));

validateSpawnMechanicCatalog();

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
    const { buildBotBaseTemplates } = require('../../server/matchmaking_defs');
    return { gameDb: dbModule, combatDefs, verifyReplay, buildBotBaseTemplates };
  });
  gameDb = loaded.gameDb;
  process.exitCode = runBalanceLab({
    repoRoot,
    gameDb: loaded.gameDb,
    combatDefs: loaded.combatDefs,
    verifyReplay: loaded.verifyReplay,
    buildBotBaseTemplates: loaded.buildBotBaseTemplates,
    args,
  });
} finally {
  if (gameDb?.db?.open) gameDb.db.close();
  try {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  } catch (cleanupError) {
    // On Windows, a failed db module initialization can leave a native
    // SQLite handle alive until process exit. Cleanup must never replace the
    // actual schema/import error with a secondary EPERM.
    if (args.verbose) {
      console.warn(
        `[balance-lab] scratch cleanup deferred: ${cleanupError.message}`,
      );
    }
  }
}

function runBalanceLab({
  repoRoot: root,
  gameDb: dbApi,
  combatDefs,
  verifyReplay,
  buildBotBaseTemplates,
  args: cli,
}) {
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
  const labOffenseScaleByLevel = Object.fromEntries(
    [5, 6, 7, 8, 9].map((level) => [
      level,
      numberArg(cli[`lab-offense-scale-th${level}`], 1, 0.5, 2.0),
    ]),
  );
  const labOffenseScaleByTroop = Object.fromEntries(
    Object.keys(combatDefs.TROOP_STATS || {})
      .map((type) => [
        type,
        numberArg(
          cli[`lab-offense-scale-${type.replaceAll('_', '-')}`],
          1,
          0.5,
          3.0,
        ),
      ])
      .filter(([, scale]) => scale !== 1),
  );
  const labSlotCostByTroop = Object.fromEntries(
    Object.keys(combatDefs.TROOP_STATS || {})
      .map((type) => [
        type,
        intArg(
          cli[`lab-slot-cost-${type.replaceAll('_', '-')}`],
          Number(dbApi.TROOP_DEFS?.[type]?.slot_cost) || 1,
          1,
          45,
        ),
      ])
      .filter(([type, cost]) => (
        cost !== (Number(dbApi.TROOP_DEFS?.[type]?.slot_cost) || 1)
      )),
  );
  const labDefenseDamageScale = numberArg(
    cli['lab-defense-damage-scale'],
    1,
    0.25,
    1.5,
  );
  const labBuildingHpScale = numberArg(
    cli['lab-building-hp-scale'],
    1,
    0.25,
    1.5,
  );
  const labBuildingHpMinLevel = intArg(
    cli['lab-building-hp-min-level'],
    1,
    1,
    99,
  );
  const labLateDefenseScale = numberArg(
    cli['lab-late-defense-scale'],
    1,
    0.25,
    1.5,
  );
  const labLateDefenseDamageScale = numberArg(
    cli['lab-late-defense-damage-scale'],
    1,
    0.25,
    1.5,
  );
  const labTh7DefenseScale = numberArg(
    cli['lab-th7-defense-scale'],
    1,
    0.5,
    1.5,
  );
  const labMimicRevealAfterAttack = !!cli['lab-mimic-reveal-after-attack'];
  const labMimicTrapDamageScale = numberArg(
    cli['lab-mimic-trap-damage-scale'],
    0,
    0,
    1,
  );
  applyLabOffenseScales(
    combatDefs,
    labOffenseScaleByLevel,
    labOffenseScaleByTroop,
  );
  for (const [type, slotCost] of Object.entries(labSlotCostByTroop)) {
    if (dbApi.TROOP_DEFS?.[type]) {
      dbApi.TROOP_DEFS[type].slot_cost = slotCost;
    }
  }
  applyLabDefenseDamageScale(combatDefs, labDefenseDamageScale);
  applyLabLateDefenseDamageScale(combatDefs, labLateDefenseDamageScale);
  applyLabLateDefenseScale(combatDefs, labLateDefenseScale);
  applyLabTownHallDefenseScale(combatDefs, dbApi, 7, labTh7DefenseScale);
  if (labMimicRevealAfterAttack) {
    for (const stats of Object.values(combatDefs.TROOP_STATS?.mimic || {})) {
      stats.concealmentEndsOnAttack = true;
    }
  }
  if (labMimicTrapDamageScale > 0) {
    for (const stats of Object.values(combatDefs.TROOP_STATS?.mimic || {})) {
      stats.trapImmuneDamageMultiplier = labMimicTrapDamageScale;
    }
  }
  const sameTownHallOnly = !!cli['same-th-only'];
  const attackLevelProfile = resolveAttackLevelProfile(cli['attack-level-profile']);
  const attackPolicyCount = catalogOnly
    ? 0
    : intArg(cli['attack-policies'], 0, 0, 100_000);
  const adversarialRounds = catalogOnly
    ? 0
    : intArg(cli['adversarial-rounds'], 0, 0, 20);
  const adversarialMatchesPerRound = intArg(
    cli['adversarial-matches'],
    500,
    1,
    100_000,
  );
  const breakabilityPoliciesPerTownHall = catalogOnly
    ? 0
    : intArg(cli['breakability-policies'], 0, 0, 50);
  const breakabilityCalibrationBasesPerTownHall = catalogOnly
    ? 0
    : intArg(cli['breakability-calibration-bases'], 5, 1, 25);
  const breakabilityNftRarity = strRarity(
    cli['breakability-rarity'] || 'common',
  );
  const breakabilityCandidatePolicyCount = catalogOnly
    ? 0
    : intArg(
      cli['breakability-candidate-policies'],
      attackPolicyCount,
      0,
      100_000,
    );
  const unitUtilityBasesPerTroop = catalogOnly
    ? 0
    : intArg(cli['unit-utility-bases'], 0, 0, 1_000);
  const requestedUnitUtilityTroops = new Set(
    String(cli['unit-utility-troops'] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const nftRarityProbeBasesPerTroop = catalogOnly
    ? 0
    : intArg(cli['nft-rarity-probe-bases'], 0, 0, 1_000);
  const baseCounterMatches = catalogOnly
    ? 0
    : intArg(cli['base-counter-matches'], 0, 0, 1_000_000);
  const catalog = discoverCatalog(dbApi, combatDefs);
  const unknownUtilityTroops = [...requestedUnitUtilityTroops]
    .filter((type) => !catalog.troops.some((troop) => troop.type === type));
  if (unknownUtilityTroops.length > 0) {
    throw new Error(
      `Unknown --unit-utility-troops values: ${unknownUtilityTroops.join(', ')}`,
    );
  }
  const townHalls = resolveTownHallProfile(
    String(cli.profile || DEFAULT_PROFILE),
    catalog.maxTownHall,
  );
  const requestedMatches = catalogOnly
    ? 0
    : intArg(cli.matches, DEFAULT_MATCHES, 1, 1_000_000);
  const parityFixturePath = cli['dump-parity-fixtures']
    ? path.resolve(root, String(cli['dump-parity-fixtures']))
    : '';
  const parityFixtureCount = intArg(
    cli['parity-fixture-count'],
    0,
    0,
    10_000,
  );
  const maxScenarios = intArg(cli['max-scenarios'], 50_000, 1, 1_000_000);
  const shipCapacities = discoverShipCapacities(dbApi, combatDefs, catalog.maxTownHall);
  const shipCapacity = Math.max(...Object.values(shipCapacities));
  const startedAt = Date.now();

  const baseReportPath = cli['base-report']
    ? path.resolve(root, String(cli['base-report']))
    : '';
  const botTemplateDifficulty = resolveBotTemplateDifficulty(
    cli['bot-template-difficulty'],
  );
  if (baseReportPath && botTemplateDifficulty) {
    throw new Error('--base-report and --bot-template-difficulty cannot be combined.');
  }
  const allowProductionLayout = !!cli['allow-production-layout'] || !!botTemplateDifficulty;
  if (cli['allow-production-layout'] && !baseReportPath && !botTemplateDifficulty) {
    throw new Error(
      '--allow-production-layout requires --base-report or --bot-template-difficulty.',
    );
  }
  const requestedBaseIds = new Set(
    String(cli['base-ids'] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const requestedBaseArchetypes = new Set(
    String(cli['base-archetypes'] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!baseReportPath && !botTemplateDifficulty && requestedBaseIds.size > 0) {
    throw new Error('--base-ids requires --base-report or --bot-template-difficulty.');
  }
  const loadedBases = botTemplateDifficulty
    ? loadMatchmakingBotCatalog({
      templates: buildBotBaseTemplates(),
      townHalls,
      difficulty: botTemplateDifficulty,
      combatDefs,
    })
    : baseReportPath
    ? loadBaseCatalogFromReport({
      reportPath: baseReportPath,
      townHalls,
      requestedBaseIds,
    })
    : generateBaseCatalog({
      count: baseCount,
      seed,
      townHalls,
      catalog,
      dbApi,
      combatDefs,
    });
  const bases = loadedBases.filter((base) => (
    (requestedBaseIds.size === 0 || requestedBaseIds.has(String(base.id || '')))
    && (
      requestedBaseArchetypes.size === 0
      || requestedBaseArchetypes.has(String(base.archetype || ''))
    )
  ));
  if (bases.length === 0) {
    throw new Error('Base catalog is empty after applying report/profile/id filters.');
  }
  const normalizeBaseHp = !!cli['normalize-base-hp'] || !!botTemplateDifficulty;
  if (normalizeBaseHp) normalizeBaseHpToDefinitions(bases, dbApi);
  const baseValidation = validateBaseCatalog(bases, catalog, dbApi, {
    allowProductionLayout,
  });
  if (baseValidation.errors.length > 0) {
    throw new Error(`Generated base validation failed:\n${baseValidation.errors.join('\n')}`);
  }
  applyLabBuildingHpScale(bases, labBuildingHpScale, labBuildingHpMinLevel);

  const armiesByTownHall = new Map();
  for (let th = 1; th <= catalog.maxTownHall; th += 1) {
    armiesByTownHall.set(
      th,
      generateArmyCatalog(th, catalog, shipCapacities[th], seed),
    );
  }
  const allArmies = [...armiesByTownHall.values()].flat();
  const attackPolicies = attackPolicyCount > 0
    ? generateAttackPolicyCatalog({
      count: attackPolicyCount,
      townHalls,
      armiesByTownHall,
      combatDefs,
      seed,
      forcedLevelProfile: attackLevelProfile,
    })
    : [];
  const breakabilityAttackPolicies = (
    breakabilityPoliciesPerTownHall > 0
    && breakabilityCandidatePolicyCount !== attackPolicyCount
  )
    ? generateAttackPolicyCatalog({
      count: breakabilityCandidatePolicyCount,
      townHalls,
      armiesByTownHall,
      combatDefs,
      seed,
      forcedLevelProfile: attackLevelProfile,
    })
    : attackPolicies;
  if (adversarialRounds > 0 && attackPolicies.length === 0) {
    throw new Error('--adversarial-rounds requires --attack-policies.');
  }
  if (breakabilityPoliciesPerTownHall > 0 && breakabilityAttackPolicies.length === 0) {
    throw new Error(
      '--breakability-policies requires --attack-policies or '
      + '--breakability-candidate-policies.',
    );
  }
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
      sameTownHallOnly,
      attackLevelProfile,
      attackPolicies,
    });

  const aggregate = createAggregate();
  const evaluationRecords = [];
  const evolution = [];
  const parityFixtures = [];
  for (let index = 0; index < scenarioPlan.length; index += 1) {
    const scenario = scenarioPlan[index];
    const actions = buildAttackActions(scenario, combatDefs);
    const result = runScenario(
      verifyReplay,
      combatDefs,
      scenario,
      verbose,
      actions,
      !!parityFixturePath,
    );
    recordScenario(aggregate, scenario, result);
    evaluationRecords.push({ scenario, result });
    if (parityFixturePath) {
      const replayActions = [
        {
          type: 'battle_start',
          t: 0,
          battle_session_id: `balance-parity-${scenario.id}`,
        },
        ...actions,
        {
          type: 'battle_end',
          t: result.durationSec,
          result: result.resolvedResult.toLowerCase(),
        },
      ];
      parityFixtures.push({
        id: scenario.id,
        attackerTownHall: scenario.attackerTownHall,
        defenderTownHall: scenario.defenderTownHall,
        matchup: scenario.matchup,
        baseId: scenario.base.id,
        armyId: scenario.army.id,
        spawnProfile: scenario.spawnProfile,
        attackLevelProfile: scenario.levelProfile,
        attackPolicyId: scenario.policyId || '',
        tactics: scenario.tactics,
        attackerNftRarities: scenario.attackerNftRarities || {},
        serverShipLevel: discoverShipLevelForTownHall(
          combatDefs,
          scenario.attackerTownHall,
        ),
        troopLevels: scenario.troopLevels,
        defenderAltarLevels: scenario.defenderAltarLevels || {},
        buildings: scenario.base.buildings,
        actions: replayActions,
        expected: result,
      });
    }
    if (verbose && ((index + 1) % 25 === 0 || index + 1 === scenarioPlan.length)) {
      console.log(`[balance] simulated ${index + 1}/${scenarioPlan.length}`);
    }
  }

  for (let roundIndex = 0; roundIndex < adversarialRounds; roundIndex += 1) {
    const round = roundIndex + 1;
    const elitePolicies = selectEliteAttackPolicies(evaluationRecords, attackPolicies, townHalls);
    const eliteBases = selectEliteBases(evaluationRecords, bases, townHalls);
    const mutatedPolicies = ensureUniquePolicyMutations(
      mutateElitePolicies({
        elitePolicies,
        armiesByTownHall,
        combatDefs,
        seed: hash32(seed, round, 0x41545441),
        round,
        forcedLevelProfile: attackLevelProfile,
      }),
      attackPolicies,
    );
    const mutatedBases = ensureUniqueBaseMutations(
      mutateEliteBases({
      eliteBases,
      seed: hash32(seed, round, 0x44454645),
      round,
      }),
      bases,
    );
    attackPolicies.push(...mutatedPolicies);
    bases.push(...mutatedBases);
    const roundScenarios = buildAdversarialScenarioPlan({
      count: adversarialMatchesPerRound,
      startIndex: scenarioPlan.length,
      policies: [...elitePolicies, ...mutatedPolicies],
      bases: [...eliteBases, ...mutatedBases],
      catalog,
      seed: hash32(seed, round, 0x524f554e),
      round,
    });
    let roundWins = 0;
    for (const scenario of roundScenarios) {
      const actions = buildAttackActions(scenario, combatDefs);
      const result = runScenario(verifyReplay, combatDefs, scenario, verbose, actions);
      recordScenario(aggregate, scenario, result);
      evaluationRecords.push({ scenario, result });
      scenarioPlan.push(scenario);
      if (result.win) roundWins += 1;
    }
    evolution.push({
      round,
      battles: roundScenarios.length,
      attackerWinRate: rate(roundWins, roundScenarios.length),
      elitePolicyIds: elitePolicies.map((policy) => policy.id),
      eliteBaseIds: eliteBases.map((base) => base.id),
      mutatedPolicyIds: mutatedPolicies.map((policy) => policy.id),
      mutatedBaseIds: mutatedBases.map((base) => base.id),
    });
  }

  const breakability = runBreakabilityProbe({
    enabledPoliciesPerTownHall: breakabilityPoliciesPerTownHall,
    calibrationBasesPerTownHall: breakabilityCalibrationBasesPerTownHall,
    nftRarity: breakabilityNftRarity,
    verifyReplay,
    combatDefs,
    evaluationRecords,
    attackPolicies: breakabilityAttackPolicies,
    bases,
    townHalls,
    catalog,
    seed,
    startIndex: scenarioPlan.length,
    verbose,
  });
  const baseCounterMeta = runBaseCounterMetaProbe({
    requestedBattles: baseCounterMatches,
    verifyReplay,
    combatDefs,
    bases,
    armiesByTownHall,
    catalog,
    seed,
    startIndex: scenarioPlan.length + breakability.totalBattles,
    verbose,
  });
  const unitUtility = runUnitUtilityProbe({
    basesPerTroop: unitUtilityBasesPerTroop,
    requestedTroops: requestedUnitUtilityTroops,
    verifyReplay,
    combatDefs,
    bases,
    catalog,
    shipCapacities,
    seed,
    startIndex: (
      scenarioPlan.length
      + breakability.totalBattles
      + baseCounterMeta.totalBattles
    ),
    verbose,
  });
  const nftRarityProbe = runNftRarityProbe({
    basesPerTroop: nftRarityProbeBasesPerTroop,
    verifyReplay,
    combatDefs,
    bases,
    armiesByTownHall,
    catalog,
    seed,
    startIndex: (
      scenarioPlan.length
      + breakability.totalBattles
      + baseCounterMeta.totalBattles
      + unitUtility.totalBattles
    ),
    verbose,
  });

  const finalBaseValidation = adversarialRounds > 0
    ? validateBaseCatalog(bases, catalog, dbApi, { allowProductionLayout })
    : baseValidation;
  if (finalBaseValidation.errors.length > 0) {
    throw new Error(
      `Evolved base validation failed:\n${finalBaseValidation.errors.join('\n')}`,
    );
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
  if (breakability.unbeatenBaseCount > 0) {
    balanceIssues.push({
      severity: 'critical',
      code: 'unbreakable-base-probe',
      message: `${breakability.unbeatenBaseCount}/${breakability.testedBaseCount} bases survived the sampled same-TH policy catalog plus exhaustive spawn/tactic search for up to ${BREAKABILITY_ADAPTIVE_ARMY_LIMIT} closest distinct ordered army templates at ${breakability.nftRarity} rarity.`,
    });
    balanceIssues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }
  if (breakability.untestedBaseCount > 0) {
    balanceIssues.push({
      severity: 'critical',
      code: 'breakability-coverage',
      message: `${breakability.untestedBaseCount}/${breakability.generatedBaseCount} generated bases had no same-TH candidate policy battle.`,
    });
  }
  balanceIssues.push(...analyzeUnitUtilityProbe(unitUtility));
  balanceIssues.push(...analyzeNftRarityProbe(nftRarityProbe));
  balanceIssues.push(...analyzeBaseCounterMetaProbe(baseCounterMeta));
  balanceIssues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const elapsedMs = Date.now() - startedAt;
  const config = {
    seed,
    profile: String(cli.profile || DEFAULT_PROFILE),
    townHalls,
    baseSource: botTemplateDifficulty
      ? `matchmaking-${botTemplateDifficulty}`
      : baseReportPath ? 'report' : 'generated',
    botTemplateDifficulty,
    allowProductionLayout,
    baseReportPath: baseReportPath
      ? path.relative(root, baseReportPath).replaceAll('\\', '/')
      : '',
    requestedBaseIds: [...requestedBaseIds],
    requestedBaseArchetypes: [...requestedBaseArchetypes],
    requestedBaseCount: (baseReportPath || botTemplateDifficulty) ? bases.length : baseCount,
    generatedBaseCount: bases.length,
    requestedMatches,
    simulatedMatches: aggregate.overall.count,
    exhaustive,
    sameTownHallOnly,
    attackLevelProfile: attackLevelProfile || 'mixed-cycle',
    attackPolicyCount: attackPolicies.length,
    capacityFilledArmyCount: allArmies
      .filter((army) => army.name.startsWith('core-') && army.name.endsWith('-filled'))
      .length,
    initialAttackPolicyCount: attackPolicyCount,
    adversarialRounds,
    adversarialMatchesPerRound,
    breakabilityPoliciesPerTownHall,
    breakabilityCalibrationBasesPerTownHall,
    breakabilityNftRarity,
    breakabilityCandidatePolicyCount: breakabilityAttackPolicies.length,
    breakabilityAdaptiveArmyLimit: BREAKABILITY_ADAPTIVE_ARMY_LIMIT,
    breakabilityBattles: breakability.totalBattles,
    breakabilityUnbeatenBases: breakability.unbeatenBaseCount,
    baseCounterMatches,
    baseCounterBattles: baseCounterMeta.totalBattles,
    baseCounterDiscoveryBattles: baseCounterMeta.discoveryBattles,
    baseCounterCounterHoldoutBattles: baseCounterMeta.counterHoldoutBattles,
    baseCounterUniversalHoldoutBattles: baseCounterMeta.universalHoldoutBattles,
    baseCounterHardConfirmationBattles: baseCounterMeta.hardConfirmationBattles,
    unitUtilityBasesPerTroop,
    unitUtilityTroops: [...requestedUnitUtilityTroops],
    unitUtilityBattles: unitUtility.totalBattles,
    nftRarityProbeBasesPerTroop,
    nftRarityProbeBattles: nftRarityProbe.totalBattles,
    spawnMechanicCount: SPAWN_PROFILES.length,
    spawnFormationCount: SPAWN_FORMATIONS.length,
    spawnTimingCount: SPAWN_TIMINGS.length,
    deploymentOrderCount: DEPLOYMENT_ORDERS.length,
    pureUnitMatrixBattles: aggregate.byExperimentCohort.get('pure-unit-matrix')?.count || 0,
    elitePolicyMinSamples: ELITE_MIN_SAMPLES,
    adversarialPairing: 'balanced-latin-square',
    unbeatenNonAdaptiveBases: [...aggregate.byNonAdaptiveBase.values()]
      .filter((bucket) => bucket.count >= minGroupSize && bucket.wins === 0)
      .length,
    labOffenseScaleByLevel,
    labOffenseScaleByTroop,
    labSlotCostByTroop,
    labDefenseDamageScale,
    labBuildingHpScale,
    labBuildingHpMinLevel,
    labLateDefenseScale,
    labLateDefenseDamageScale,
    labTh7DefenseScale,
    labMimicRevealAfterAttack,
    labMimicTrapDamageScale,
    normalizeBaseHp,
    shipCapacity,
    shipCapacities,
    targetWinRate,
    band,
    elapsedMs,
  };
  const reportModel = {
    generatedAt: new Date().toISOString(),
    config,
    catalog: serializableCatalog(catalog),
    coverage,
    baseValidation: finalBaseValidation,
    statAudit,
    balanceIssues,
    aggregate: serializeAggregate(aggregate),
    bases,
    armies: allArmies,
    attackPolicies,
    breakabilityAttackPolicies,
    evolution,
    breakability,
    baseCounterMeta,
    unitUtility,
    nftRarityProbe,
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
  if (parityFixturePath) {
    const selectedParityFixtures = selectParityFixtures(
      parityFixtures,
      parityFixtureCount,
      seed,
    );
    fs.mkdirSync(path.dirname(parityFixturePath), { recursive: true });
    fs.writeFileSync(
      parityFixturePath,
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        seed,
        profile: String(cli.profile || DEFAULT_PROFILE),
        sourceScenarioCount: parityFixtures.length,
        scenarioCount: selectedParityFixtures.length,
        selection: parityFixtureCount > 0 ? 'matchup-outcome-diversity' : 'all',
        scenarios: selectedParityFixtures,
      }, null, 2)}\n`,
      'utf8',
    );
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
    if (breakability.enabled) {
      console.log(
        `Breakability probe: ${breakability.totalBattles} battles, `
        + `${breakability.unbeatenBaseCount} unbeaten, `
        + `${breakability.untestedBaseCount} untested, `
        + `${breakability.invalidOnlyBaseCount} invalid-only, `
        + `${breakability.invalid} invalid`,
      );
    }
    if (unitUtility.enabled) {
      console.log(
        `Unit utility: ${unitUtility.totalBattles} battles `
        + `(${unitUtility.totalPairs} equal-input pairs), `
        + `${unitUtility.invalid} invalid`,
      );
    }
    if (baseCounterMeta.enabled) {
      console.log(
        `Base-counter meta: ${baseCounterMeta.totalBattles} battles, `
        + `${baseCounterMeta.zeroCounterBaseCount} zero-counter bases, `
        + `${pct(baseCounterMeta.diversity?.topCounterShare || 0)} top-family share, `
        + `${baseCounterMeta.invalid} invalid`,
      );
    }
    if (nftRarityProbe.enabled) {
      console.log(
        `NFT rarity probe: ${nftRarityProbe.totalBattles} battles, `
        + `${nftRarityProbe.invalid} invalid`,
      );
    }
  }
  console.log(`Content: ${catalog.buildings.length} buildings, ${catalog.troops.length} active troops`);
  console.log(`Report: ${path.relative(root, output.markdown)}`);
  console.log(`Data: ${path.relative(root, output.json)}`);

  if (
    aggregate.overall.invalid > 0
    || breakability.invalid > 0
    || baseCounterMeta.invalid > 0
    || baseCounterMeta.missingDiscoveryCellCount > 0
    || unitUtility.invalid > 0
    || nftRarityProbe.invalid > 0
    || breakability.untestedBaseCount > 0
    || criticalIssues.some((issue) => issue.code === 'coverage')
  ) {
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

function discoverShipCapacities(dbApi, combatDefs, maxTownHall) {
  const levels = dbApi.PLAYER_SHIP_LEVELS || {};
  const configuredLevels = Object.keys(levels)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const fallback = Math.max(
    1,
    Number(combatDefs.MAX_TROOPS) || 0,
    Number(combatDefs.MAX_SHIPS || 0) * Number(combatDefs.TROOPS_PER_SHIP || 0),
  );
  const capacities = {};
  for (let townHall = 1; townHall <= maxTownHall; townHall += 1) {
    const shipLevel = configuredLevels
      .filter((level) => Math.max(1, Number(levels[level]?.town_hall) || level) <= townHall)
      .at(-1);
    capacities[townHall] = Math.max(
      1,
      Number(levels[shipLevel]?.capacity) || fallback,
    );
  }
  return capacities;
}

function discoverShipLevelForTownHall(combatDefs, townHall) {
  const levels = combatDefs.PLAYER_SHIP_LEVELS || {};
  const configuredLevels = Object.keys(levels)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return configuredLevels
    .filter((level) => Math.max(1, Number(levels[level]?.town_hall) || level) <= townHall)
    .at(-1) || 1;
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

function resolveAttackLevelProfile(rawProfile) {
  if (!rawProfile) return '';
  const normalized = String(rawProfile).trim().toLowerCase();
  if (!ATTACK_LEVEL_PROFILES.includes(normalized)) {
    throw new Error(
      `Unsupported attack level profile "${rawProfile}". Use ${ATTACK_LEVEL_PROFILES.join(', ')}.`,
    );
  }
  return normalized;
}

function resolveBotTemplateDifficulty(rawDifficulty) {
  if (!rawDifficulty) return '';
  const normalized = String(rawDifficulty).trim().toLowerCase();
  if (!['normal', 'hard', 'all'].includes(normalized)) {
    throw new Error(
      `Unsupported bot template difficulty "${rawDifficulty}". Use normal, hard, or all.`,
    );
  }
  return normalized;
}

function applyLabOffenseScales(combatDefs, scaleByLevel, scaleByTroop) {
  combatDefs.setBalanceLabNftStatScales?.(scaleByLevel, scaleByTroop);
  for (const [type, levels] of Object.entries(combatDefs.TROOP_STATS || {})) {
    for (const [rawLevel, stats] of Object.entries(levels || {})) {
      const level = Number(rawLevel);
      const levelScale = Number(scaleByLevel[level] || 1);
      const troopScale = level >= 5 ? Number(scaleByTroop[type] || 1) : 1;
      const scale = levelScale * troopScale;
      if (scale === 1 || !stats) continue;
      stats.hp = Math.max(1, Math.round(Number(stats.hp) * scale));
      stats.damage = Math.max(1, Math.round(Number(stats.damage) * scale));
    }
  }
}

function applyLabDefenseDamageScale(combatDefs, scale) {
  if (scale === 1) return;
  for (const levels of Object.values(combatDefs.DEFENSE_STATS || {})) {
    for (const stats of Object.values(levels || {})) {
      if (!stats) continue;
      for (const field of ['damage', 'baseDamage', 'maxDamage']) {
        if (!Number.isFinite(Number(stats[field]))) continue;
        stats[field] = Math.max(1, Math.round(Number(stats[field]) * scale));
      }
    }
  }
  for (const stats of Object.values(combatDefs.SKELETON_GUARD?.levels || {})) {
    if (!stats) continue;
    stats.damage = Math.max(1, Math.round(Number(stats.damage) * scale));
  }
}

function applyLabBuildingHpScale(bases, scale, minLevel = 1) {
  if (scale === 1) return;
  for (const base of bases || []) {
    for (const building of base?.buildings || []) {
      if (building?.type === 'shark_trap') continue;
      if (Number(building?.level || 1) < minLevel) continue;
      const maxHp = Number(building?.max_hp);
      const hp = Number(building?.hp);
      if (!Number.isFinite(maxHp) || maxHp <= 1) continue;
      const hpRatio = Number.isFinite(hp)
        ? Math.max(0, Math.min(1, hp / maxHp))
        : 1;
      building.max_hp = Math.max(1, Math.round(maxHp * scale));
      building.hp = Math.max(0, Math.round(building.max_hp * hpRatio));
    }
  }
}

function normalizeBaseHpToDefinitions(bases, dbApi) {
  for (const base of bases || []) {
    for (const building of base?.buildings || []) {
      const levels = dbApi.BUILDING_DEFS?.[building?.type]?.hp_levels || [];
      if (levels.length === 0) continue;
      const level = Math.max(1, Math.min(levels.length, Number(building.level) || 1));
      const maxHp = Math.max(1, Number(levels[level - 1]) || 1);
      building.max_hp = maxHp;
      building.hp = maxHp;
    }
  }
}

function applyLabLateDefenseScale(combatDefs, scale) {
  if (scale === 1) return;
  for (const levels of Object.values(combatDefs.DEFENSE_STATS || {})) {
    for (const [rawLevel, stats] of Object.entries(levels || {})) {
      if (Number(rawLevel) < 5 || !stats) continue;
      for (const field of ['damage', 'baseDamage', 'maxDamage']) {
        if (!Number.isFinite(Number(stats[field]))) continue;
        stats[field] = Math.max(1, Math.round(Number(stats[field]) * scale));
      }
    }
  }
  for (const [rawLevel, stats] of Object.entries(
    combatDefs.SKELETON_GUARD?.levels || {},
  )) {
    if (Number(rawLevel) < 5 || !stats) continue;
    stats.hp = Math.max(1, Math.round(Number(stats.hp) * scale));
    stats.damage = Math.max(1, Math.round(Number(stats.damage) * scale));
  }
}

function applyLabLateDefenseDamageScale(combatDefs, scale) {
  if (scale === 1) return;
  for (const levels of Object.values(combatDefs.DEFENSE_STATS || {})) {
    for (const [rawLevel, stats] of Object.entries(levels || {})) {
      if (Number(rawLevel) < 5 || !stats) continue;
      for (const field of ['damage', 'baseDamage', 'maxDamage']) {
        if (!Number.isFinite(Number(stats[field]))) continue;
        stats[field] = Math.max(1, Math.round(Number(stats[field]) * scale));
      }
    }
  }
}

function applyLabTownHallDefenseScale(combatDefs, dbApi, townHall, scale) {
  if (scale === 1) return;
  for (const [type, levels] of Object.entries(combatDefs.DEFENSE_STATS || {})) {
    const caps = dbApi.TH_MAX_LEVEL?.[type] || [];
    const authoredMax = Math.max(
      1,
      ...Object.keys(levels || {}).map(Number).filter(Number.isFinite),
    );
    const level = Array.isArray(caps) && caps.length > 0
      ? Number(caps[Math.min(caps.length - 1, townHall - 1)] || 1)
      : Math.min(townHall, authoredMax);
    const stats = levels?.[level];
    if (!stats) continue;
    for (const field of ['damage', 'baseDamage', 'maxDamage']) {
      if (!Number.isFinite(Number(stats[field]))) continue;
      stats[field] = Math.max(1, Math.round(Number(stats[field]) * scale));
    }
  }
  const tombstoneCaps = dbApi.TH_MAX_LEVEL?.tombstone || [];
  const guardLevel = Array.isArray(tombstoneCaps) && tombstoneCaps.length > 0
    ? Number(tombstoneCaps[Math.min(tombstoneCaps.length - 1, townHall - 1)] || 1)
    : townHall;
  const guard = combatDefs.SKELETON_GUARD?.levels?.[guardLevel];
  if (guard) {
    guard.hp = Math.max(1, Math.round(Number(guard.hp) * scale));
    guard.damage = Math.max(1, Math.round(Number(guard.damage) * scale));
  }
}

function generateBaseCatalog({ count, seed, townHalls, catalog, dbApi, combatDefs }) {
  const bases = [];
  const signatures = new Set();
  const maxAttempts = Math.max(count * 80, 1_000);
  let attempt = 0;
  while (bases.length < count && attempt < maxAttempts) {
    const th = townHalls[attempt % townHalls.length];
    const attemptWithinTownHall = Math.floor(attempt / townHalls.length);
    const archetypeIndex = attemptWithinTownHall % ARCHETYPES.length;
    const archetypeCycle = Math.floor(attemptWithinTownHall / ARCHETYPES.length);
    const archetype = ARCHETYPES[archetypeIndex];
    // Each archetype advances through the progression profiles independently.
    // Mirrored archetypes share a phase, so left/right comparisons never
    // accidentally compare maxed defenses with rushed-economy defenses.
    const profilePhase = ARCHETYPE_PROFILE_PHASE[archetype] || 0;
    const levelProfile = BASE_LEVEL_PROFILES[
      (profilePhase + archetypeCycle) % BASE_LEVEL_PROFILES.length
    ];
    let base = null;
    try {
      base = generateBase({
        th,
        archetype,
        levelProfile,
        variation: attempt,
        seed: hash32(seed, th, attempt),
        catalog,
        dbApi,
        combatDefs,
      });
    } catch (error) {
      if (!String(error?.message || '').startsWith('No valid placement for ')) {
        throw error;
      }
      attempt += 1;
      continue;
    }
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

function loadBaseCatalogFromReport({ reportPath, townHalls, requestedBaseIds }) {
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Base report not found: ${reportPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const reportBases = Array.isArray(parsed) ? parsed : parsed?.bases;
  if (!Array.isArray(reportBases)) {
    throw new Error(`Base report does not contain a bases array: ${reportPath}`);
  }

  const allowedTownHalls = new Set(townHalls.map(Number));
  const requestedIds = new Set(requestedBaseIds || []);
  const bases = reportBases.filter((base) => {
    if (!allowedTownHalls.has(Number(base?.townHall))) return false;
    return requestedIds.size === 0 || requestedIds.has(String(base?.id || ''));
  });

  if (requestedIds.size > 0) {
    const loadedIds = new Set(bases.map((base) => String(base.id)));
    const missingIds = [...requestedIds].filter((id) => !loadedIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(
        `Requested base IDs were not found in ${reportPath}: ${missingIds.join(', ')}`,
      );
    }
  }
  if (bases.length === 0) {
    throw new Error(`No bases from ${reportPath} match the selected profile and IDs.`);
  }

  const seenBaseIds = new Set();
  for (const base of bases) {
    const baseId = String(base?.id ?? '').trim();
    if (!baseId) {
      throw new Error(`Imported base has an empty ID in ${reportPath}.`);
    }
    if (seenBaseIds.has(baseId)) {
      throw new Error(`Imported base ID is duplicated in ${reportPath}: ${baseId}`);
    }
    seenBaseIds.add(baseId);

    const seenBuildingIds = new Set();
    for (const building of base.buildings || []) {
      const buildingId = String(building?.id ?? '').trim();
      if (!buildingId) {
        throw new Error(`Base ${baseId} has a building with an empty ID.`);
      }
      if (seenBuildingIds.has(buildingId)) {
        throw new Error(
          `Base ${baseId} has duplicated building ID ${buildingId}.`,
        );
      }
      seenBuildingIds.add(buildingId);
    }
  }

  return bases;
}

function loadMatchmakingBotCatalog({ templates, townHalls, difficulty, combatDefs }) {
  const allowedTownHalls = new Set(townHalls.map(Number));
  return (templates || [])
    .filter((template) => (
      allowedTownHalls.has(Number(template?.th))
      && (difficulty === 'all' || template?.difficulty === difficulty)
    ))
    .map((template) => ({
      id: String(template.id),
      townHall: Number(template.th),
      archetype: String(template.archetype || 'matchmaking'),
      levelProfile: template.difficulty === 'hard' ? 'maxed' : 'mixed',
      variation: Number(template.variant) || 0,
      difficulty: String(template.difficulty || ''),
      generation: String(template.generation || ''),
      buildings: (template.buildings || []).map((building, index) => ({
        ...building,
        // Ranked bots are materialized into SQLite in template order, where
        // buildings receive integer row IDs. Use the same relative integer
        // ordering in parity fixtures so Godot exercises its production API
        // shape and deterministic target tie-breaking.
        id: index + 1,
        role: buildingRole(building.type, combatDefs),
        hp: 1,
        max_hp: 1,
      })),
    }));
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
      ...(item.type === 'flamethrower' ? {
        facing_step: dbApi.flamethrowerDefaultFacingStep(
          selected.x,
          selected.z,
          0,
        ),
      } : {}),
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
    // Attackers enter from the southern/high-Z shore. Keep the Town Hall in
    // the rear and let each archetype organize its defense screen in front.
    coreZ: height * 0.22 + jitterZ * 0.45,
    defenseFrontZ: height * 0.62,
    defenseRadius: Math.min(width, height) * 0.20,
    economyRadius: Math.min(width, height) * 0.36,
  };
  if (archetype === 'southern-funnel') {
    context.coreZ = height * 0.26;
    context.defenseRadius = height * 0.28;
  } else if (archetype === 'asymmetric-left') {
    context.coreX = width * 0.34;
  } else if (archetype === 'asymmetric-right') {
    context.coreX = width * 0.66;
  } else if (archetype === 'corner-keep') {
    context.coreX = width * (noise01(seed, 3, 5) > 0.5 ? 0.30 : 0.70);
    context.coreZ = height * 0.30;
  } else if (archetype === 'split-core') {
    context.coreZ = height * 0.28;
  } else if (archetype === 'rear-keep') {
    context.coreZ = height * 0.14;
    context.defenseFrontZ = height * 0.52;
  } else if (archetype === 'cannon-screen') {
    context.coreZ = height * 0.18;
    context.defenseFrontZ = height * 0.72;
  } else if (archetype === 'crossfire') {
    context.coreZ = height * 0.20;
    context.defenseFrontZ = height * 0.60;
  } else if (archetype === 'echelon-left' || archetype === 'echelon-right') {
    context.coreZ = height * 0.20;
    context.defenseFrontZ = height * 0.64;
  } else if (archetype === 'kill-corridor') {
    context.coreZ = height * 0.18;
    context.defenseFrontZ = height * 0.67;
  }
  context.coreZ = clampInt(Math.round(context.coreZ), 3, Math.max(3, height - 8));
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
  const townHall = placed.find((building) => building.type === 'town_hall');
  const townHallCenterZ = townHall
    ? townHall.grid_z + (townHall.size?.[1] || 4) / 2
    : null;
  const townHallFrontZ = townHall
    ? townHall.grid_z + (townHall.size?.[1] || 4)
    : null;
  let best = null;
  for (let z = margin; z <= height - sizeZ - margin; z += 1) {
    for (let x = margin; x <= width - sizeX - margin; x += 1) {
      // Attackers enter from high Z. The Town Hall must be the rearmost
      // building and every armed defense must form a clearly separate screen
      // in front of its forward edge.
      if (
        townHallCenterZ != null
        && item.role !== 'core'
        && z + sizeZ / 2 <= townHallCenterZ
      ) {
        continue;
      }
      if (
        townHallFrontZ != null
        && item.role === 'defense'
        && z < townHallFrontZ
      ) {
        continue;
      }
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

  if (item.role === 'defense') {
    score += Math.abs(cz - context.defenseFrontZ) * 1.15;
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
  } else if (context.archetype === 'rear-keep') {
    score += item.role === 'defense'
      ? Math.abs(cz - context.defenseFrontZ) * 3.8 + Math.abs(cx - width / 2) * 0.35
      : coreDistance * 1.8;
  } else if (context.archetype === 'cannon-screen') {
    score += item.role === 'defense'
      ? Math.abs(cz - context.defenseFrontZ) * 5.0 - Math.abs(cx - width / 2) * 0.18
      : coreDistance * 1.6;
  } else if (context.archetype === 'crossfire') {
    const leftPost = Math.hypot(cx - width * 0.28, cz - context.defenseFrontZ);
    const rightPost = Math.hypot(cx - width * 0.72, cz - context.defenseFrontZ);
    score += item.role === 'defense'
      ? Math.min(leftPost, rightPost) * 4.2
      : coreDistance * 1.7;
  } else if (context.archetype === 'echelon-left' || context.archetype === 'echelon-right') {
    const direction = context.archetype === 'echelon-left' ? -1 : 1;
    const diagonalZ = context.defenseFrontZ + direction * (cx - width / 2) * 0.32;
    score += item.role === 'defense'
      ? Math.abs(cz - diagonalZ) * 4.0
      : coreDistance * 1.7;
  } else if (context.archetype === 'kill-corridor') {
    const corridorEdge = width * 0.20;
    const sideDistance = Math.min(
      Math.abs(cx - (width / 2 - corridorEdge)),
      Math.abs(cx - (width / 2 + corridorEdge)),
    );
    score += item.role === 'defense'
      ? sideDistance * 4.0 + Math.abs(cz - context.defenseFrontZ) * 1.8
      : coreDistance * 1.8;
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

function validateBaseCatalog(
  bases,
  catalog,
  dbApi,
  { allowProductionLayout = false } = {},
) {
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
    const townHall = base.buildings.find((building) => building.type === 'town_hall');
    if (townHall && !allowProductionLayout) {
      const townHallCenterZ = townHall.grid_z + (townHall.size?.[1] || 4) / 2;
      const townHallFrontZ = townHall.grid_z + (townHall.size?.[1] || 4);
      for (const building of base.buildings) {
        if (building === townHall) continue;
        const centerZ = building.grid_z + (building.size?.[1] || 2) / 2;
        if (centerZ <= townHallCenterZ) {
          errors.push(`${base.id}: ${building.type} is behind the Town Hall backline`);
        }
        if (building.role === 'defense' && building.grid_z < townHallFrontZ) {
          errors.push(`${base.id}: ${building.type} is not fully in front of the Town Hall`);
        }
      }
    }
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
    const pureArmy = createArmy(
      townHall,
      `pure-${troop.type}`,
      [troop.type],
      available,
      capacity,
    );
    recipes.push(pureArmy);
    if (pureArmy.units.length > 0 && pureArmy.slotsUsed < capacity) {
      recipes.push(createCapacityFilledArmy({
        townHall,
        troop,
        pureArmy,
        available,
        capacity,
      }));
    }
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
    .filter((troop) => UNIT_ROLE_REGISTRY[troop.type]?.role === 'support')
    .map((troop) => troop.type);
  const patterns = [
    ['balanced', interleave(melee, ranged, available.map((troop) => troop.type))],
    ['frontline-ranged', interleave(tanks, ranged, ranged)],
    ['melee-pressure', melee],
    ['ranged-pressure', ranged],
    ['air-pressure', flying],
    ['support-mix', interleave(tanks, support, ranged)],
    ['trap-runner-mix', interleave(trapRunners, melee, ranged)],
    [
      'hero-necro-dragon-mages',
      ['necromancer', 'demon_king', 'fire_dragon', 'mage', 'mage', 'knight'],
    ],
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

function createCapacityFilledArmy({
  townHall,
  troop,
  pureArmy,
  available,
  capacity,
}) {
  const fillerPriority = new Map([
    ['knight', 0],
    ['archer', 1],
  ]);
  const fillers = [...available]
    .filter((candidate) => candidate.type !== troop.type)
    .sort((a, b) => (
      (fillerPriority.get(a.type) ?? 10) - (fillerPriority.get(b.type) ?? 10)
      || Number(a.slotCost) - Number(b.slotCost)
      || a.type.localeCompare(b.type)
    ));
  const units = [...pureArmy.units];
  let slotsUsed = Number(pureArmy.slotsUsed || 0);
  let cursor = 0;
  while (slotsUsed < capacity && fillers.length > 0) {
    const remaining = capacity - slotsUsed;
    let selectedIndex = -1;
    for (let offset = 0; offset < fillers.length; offset += 1) {
      const index = (cursor + offset) % fillers.length;
      if (Number(fillers[index].slotCost) <= remaining) {
        selectedIndex = index;
        break;
      }
    }
    if (selectedIndex < 0) break;
    const filler = fillers[selectedIndex];
    units.push(filler.type);
    slotsUsed += Number(filler.slotCost);
    cursor = (selectedIndex + 1) % fillers.length;
  }
  return {
    id: `th${townHall}-core-${troop.type}-filled`,
    townHall,
    name: `core-${troop.type}-filled`,
    units,
    slotsUsed,
    capacity,
    utilization: round(slotsUsed / capacity, 4),
  };
}


function generateAttackPolicyCatalog({
  count,
  townHalls,
  armiesByTownHall,
  combatDefs,
  seed,
  forcedLevelProfile,
}) {
  const policies = [];
  const dimensionsByTownHall = new Map();
  for (const townHall of townHalls) {
    const armies = armiesByTownHall.get(townHall) || [];
    const availableTactics = availableTacticProfiles(combatDefs, townHall);
    const levelProfiles = forcedLevelProfile
      ? [forcedLevelProfile]
      : ATTACK_LEVEL_PROFILES;
    const combinationCount = armies.length
      * SPAWN_PROFILES.length
      * levelProfiles.length
      * availableTactics.length
      * NFT_RARITIES.length;
    if (combinationCount === 0) {
      throw new Error(`No attack policy combinations are available for TH${townHall}.`);
    }
    dimensionsByTownHall.set(townHall, {
      armies,
      levelProfiles,
      availableTactics,
      combinationCount,
      offset: hash32(seed, townHall, combinationCount) % combinationCount,
      stride: coprimeStride(
        combinationCount,
        hash32(seed, townHall, 0x504f4c49),
      ),
    });
  }
  const cursorByTownHall = new Map(townHalls.map((townHall) => [townHall, 0]));
  while (policies.length < count) {
    let addedThisPass = 0;
    for (const townHall of townHalls) {
      if (policies.length >= count) break;
      const dimensions = dimensionsByTownHall.get(townHall);
      const cursor = cursorByTownHall.get(townHall) || 0;
      if (!dimensions || cursor >= dimensions.combinationCount) continue;
      let ordinal = (
        dimensions.offset
        + cursor * dimensions.stride
      ) % dimensions.combinationCount;
      const spawnProfile = SPAWN_PROFILES[ordinal % SPAWN_PROFILES.length];
      ordinal = Math.floor(ordinal / SPAWN_PROFILES.length);
      const army = dimensions.armies[ordinal % dimensions.armies.length];
      ordinal = Math.floor(ordinal / dimensions.armies.length);
      const levelProfile = dimensions.levelProfiles[
        ordinal % dimensions.levelProfiles.length
      ];
      ordinal = Math.floor(ordinal / dimensions.levelProfiles.length);
      const tactics = dimensions.availableTactics[
        ordinal % dimensions.availableTactics.length
      ];
      ordinal = Math.floor(ordinal / dimensions.availableTactics.length);
      const nftRarity = NFT_RARITIES[ordinal % NFT_RARITIES.length];
      policies.push({
        townHall,
        army,
        spawnProfile,
        levelProfile,
        tactics,
        nftRarity,
        id: `policy-${String(policies.length + 1).padStart(4, '0')}`,
      });
      cursorByTownHall.set(townHall, cursor + 1);
      addedThisPass += 1;
    }
    if (addedThisPass === 0) break;
  }
  if (policies.length < count) {
    throw new Error(`Could only generate ${policies.length}/${count} unique attack policies.`);
  }
  return policies;
}

function availableTacticProfiles(combatDefs, townHall) {
  const shipLevel = discoverShipLevelForTownHall(combatDefs, townHall);
  const shipConfig = combatDefs.PLAYER_SHIP_LEVELS?.[shipLevel] || {};
  const unlocked = {
    medkit: !!shipConfig.medkit_unlocked,
    freeze: !!shipConfig.freeze_unlocked,
    rage: !!shipConfig.rage_unlocked,
    skeletonBarrel: !!shipConfig.skeleton_barrel_unlocked,
  };
  return TACTIC_PROFILES.filter((profile) => {
    if (['medkit-entry', 'cannon-medkit'].includes(profile)) {
      return unlocked.medkit;
    }
    if (profile === 'freeze-defense') return unlocked.freeze;
    if (['rage-entry', 'rally-rage'].includes(profile)) return unlocked.rage;
    if (profile === 'skeleton-barrel') return unlocked.skeletonBarrel;
    if (profile === 'freeze-rage') return unlocked.freeze && unlocked.rage;
    if (profile === 'freeze-barrel') {
      return unlocked.freeze && unlocked.skeletonBarrel;
    }
    return true;
  });
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
  sameTownHallOnly,
  attackLevelProfile,
  attackPolicies = [],
}) {
  const scenarios = [];
  if (attackPolicies.length > 0) {
    const basesByTownHall = new Map();
    for (const base of bases) {
      if (!basesByTownHall.has(base.townHall)) basesByTownHall.set(base.townHall, []);
      basesByTownHall.get(base.townHall).push(base);
    }
    appendPureUnitMatrixScenarios({
      scenarios,
      requestedMatches,
      basesByTownHall,
      armiesByTownHall,
      catalog,
      seed,
    });
    const pureMatrixCount = scenarios.length;
    while (scenarios.length < requestedMatches) {
      const index = scenarios.length;
      const explorationIndex = index - pureMatrixCount;
      const policy = attackPolicies[explorationIndex % attackPolicies.length];
      const basePool = basesByTownHall.get(policy.townHall) || bases;
      const policyCycle = Math.floor(explorationIndex / attackPolicies.length);
      const base = basePool[
        (explorationIndex * 17 + policyCycle * 29 + policy.townHall) % basePool.length
      ];
      scenarios.push(makeScenario({
        index,
        base,
        attackerTh: policy.townHall,
        army: policy.army,
        spawnProfile: policy.spawnProfile,
        levelProfile: policy.levelProfile,
        tactics: policy.tactics,
        policyId: policy.id,
        nftRarity: policy.nftRarity,
        catalog,
        seed,
        experimentCohort: 'policy-exploration',
      }));
    }
    return scenarios;
  }
  if (exhaustive) {
    outer:
    for (const base of bases) {
      for (const offset of sameTownHallOnly ? [0] : [-1, 0, 1]) {
        const attackerTh = clampInt(base.townHall + offset, 1, catalog.maxTownHall);
        for (const army of armiesByTownHall.get(attackerTh) || []) {
          for (const spawnProfile of SPAWN_PROFILES) {
            scenarios.push(makeScenario({
              index: scenarios.length,
              base,
              attackerTh,
              army,
              spawnProfile,
              levelProfile: attackLevelProfile || ATTACK_LEVEL_PROFILES[
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
  const representedTownHalls = [...new Set(bases.map((base) => base.townHall))]
    .sort((a, b) => a - b);

  for (
    let troopIndex = 0;
    troopIndex < catalog.troops.length && scenarios.length < requestedMatches;
    troopIndex += 1
  ) {
    const troop = catalog.troops[troopIndex];
    const attackerTh = sameTownHallOnly
      ? representedTownHalls.find((townHall) => townHall >= troop.unlockTownHall)
        || representedTownHalls.at(-1)
        || clampInt(troop.unlockTownHall, 1, catalog.maxTownHall)
      : clampInt(troop.unlockTownHall, 1, catalog.maxTownHall);
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
      levelProfile: attackLevelProfile
        || ATTACK_LEVEL_PROFILES[troopIndex % ATTACK_LEVEL_PROFILES.length],
      tactics: troopIndex % 5 === 0 ? 'cannon-rally' : 'none',
      catalog,
      seed,
    }));
  }

  while (scenarios.length < requestedMatches) {
    const index = scenarios.length;
    const sampledIndex = index - Math.min(catalog.troops.length, requestedMatches);
    const base = sampledBases[sampledIndex % sampledBases.length];
    const attackerTh = sameTownHallOnly
      ? base.townHall
      : clampInt(
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
      levelProfile: attackLevelProfile || ATTACK_LEVEL_PROFILES[
        (Math.floor(index / 2) + cycle) % ATTACK_LEVEL_PROFILES.length
      ],
      tactics: index % 5 === 0 ? 'cannon-rally' : 'none',
      catalog,
      seed,
    }));
  }
  return scenarios;
}

function eligiblePureArmyMatrix({ basesByTownHall, armiesByTownHall, catalog }) {
  const rows = [];
  const townHalls = [...basesByTownHall.keys()].sort((a, b) => a - b);
  for (const townHall of townHalls) {
    const armies = armiesByTownHall.get(townHall) || [];
    for (const troop of catalog.troops) {
      if (troop.unlockTownHall > townHall) continue;
      const army = armies.find((candidate) => candidate.name === `pure-${troop.type}`);
      if (!army) continue;
      rows.push({ townHall, troop, army });
    }
  }
  return rows;
}

function appendPureUnitMatrixScenarios({
  scenarios,
  requestedMatches,
  basesByTownHall,
  armiesByTownHall,
  catalog,
  seed,
}) {
  const rows = eligiblePureArmyMatrix({
    basesByTownHall,
    armiesByTownHall,
    catalog,
  });
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const { townHall, army } = rows[rowIndex];
    const townHallBases = [...(basesByTownHall.get(townHall) || [])]
      .sort((a, b) => a.id.localeCompare(b.id));
    for (let baseIndex = 0; baseIndex < townHallBases.length; baseIndex += 1) {
      if (scenarios.length >= requestedMatches) return;
      const base = townHallBases[
        (baseIndex + hash32(seed, townHall, rowIndex)) % townHallBases.length
      ];
      const index = scenarios.length;
      scenarios.push(makeScenario({
        index,
        base,
        attackerTh: townHall,
        army,
        spawnProfile: SPAWN_PROFILES[index % SPAWN_PROFILES.length],
        levelProfile: 'maxed',
        tactics: 'none',
        nftRarity: 'common',
        defenderWard: 0,
        experimentCohort: 'pure-unit-matrix',
        catalog,
        seed,
      }));
    }
  }
}

function makeScenario({
  index,
  base,
  attackerTh,
  army,
  spawnProfile,
  levelProfile,
  tactics,
  policyId = '',
  nftRarity = 'common',
  defenderWard = null,
  experimentCohort = 'sampled',
  troopLevelSeed = null,
  catalog,
  seed,
}) {
  const troopLevels = {};
  for (const troop of catalog.troops) {
    troopLevels[troop.type] = attackLevelForProfile({
      troop,
      attackerTh,
      levelProfile,
      seed: troopLevelSeed === null
        ? hash32(seed, index, hashString(troop.type))
        : hash32(troopLevelSeed, hashString(troop.type)),
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
    policyId,
    experimentCohort,
    attackerNftRarities: {
      demon_king: nftRarity,
      fire_dragon: nftRarity,
    },
    defenderAltarLevels: {
      prosperity: 0,
      ward: defenderWard === null
        ? (index + Number(base.variation || 0)) % 4
        : clampInt(defenderWard, 0, 3),
      glory: 0,
    },
    troopLevels,
  };
}

function selectEliteAttackPolicies(
  records,
  policies,
  townHalls,
  perTownHall = 5,
  minSamples = ELITE_MIN_SAMPLES,
) {
  const policyById = new Map(policies.map((policy) => [policy.id, policy]));
  const grouped = groupEvaluationRecords(records, (record) => record.scenario.policyId);
  const selected = [];
  for (const townHall of townHalls) {
    const ranked = [...grouped.entries()]
      .filter(([id, bucket]) => (
        id
        && policyById.get(id)?.townHall === townHall
        && bucket.count >= minSamples
      ))
      .sort((a, b) => (
        attackEvaluationScore(b[1]) - attackEvaluationScore(a[1])
        || a[0].localeCompare(b[0])
      ))
      .slice(0, perTownHall)
      .map(([id]) => policyById.get(id));
    selected.push(...ranked);
  }
  return selected;
}

function selectEliteBases(records, bases, townHalls, perTownHall = 5) {
  const baseById = new Map(bases.map((base) => [base.id, base]));
  const grouped = groupEvaluationRecords(records, (record) => record.scenario.base.id);
  const selected = [];
  for (const townHall of townHalls) {
    const ranked = [...grouped.entries()]
      .filter(([id, bucket]) => baseById.get(id)?.townHall === townHall && bucket.count >= 2)
      .sort((a, b) => (
        defenseEvaluationScore(b[1]) - defenseEvaluationScore(a[1])
        || a[0].localeCompare(b[0])
      ))
      .slice(0, perTownHall)
      .map(([id]) => baseById.get(id));
    selected.push(...ranked);
  }
  return selected;
}

function groupEvaluationRecords(records, keyFor) {
  const grouped = new Map();
  for (const record of records) {
    const key = keyFor(record);
    if (!key) continue;
    if (!grouped.has(key)) {
      grouped.set(key, {
        count: 0,
        wins: 0,
        destruction: 0,
        townHallHp: 0,
      });
    }
    const bucket = grouped.get(key);
    bucket.count += 1;
    bucket.wins += record.result.win ? 1 : 0;
    bucket.destruction += rate(
      record.result.buildingsDestroyed,
      record.result.buildingCount,
    );
    bucket.townHallHp += Number(record.result.townHallHpPct || 0);
  }
  return grouped;
}

function attackEvaluationScore(bucket) {
  return (
    rate(bucket.wins, bucket.count) * 100
    + avg(bucket.destruction, bucket.count) * 15
    - avg(bucket.townHallHp, bucket.count) * 5
  );
}

function defenseEvaluationScore(bucket) {
  return (
    (1 - rate(bucket.wins, bucket.count)) * 100
    + avg(bucket.townHallHp, bucket.count) * 15
    - avg(bucket.destruction, bucket.count) * 5
  );
}

function mutateElitePolicies({
  elitePolicies,
  armiesByTownHall,
  combatDefs,
  seed,
  round,
  forcedLevelProfile,
}) {
  return elitePolicies.map((policy, index) => {
    const armies = armiesByTownHall.get(policy.townHall) || [policy.army];
    const armyIndex = Math.max(0, armies.findIndex((army) => army.id === policy.army.id));
    const tactics = availableTacticProfiles(combatDefs, policy.townHall);
    const tacticIndex = tactics.indexOf(policy.tactics);
    const rarityIndex = NFT_RARITIES.indexOf(policy.nftRarity);
    const mutationDimensions = [
      'army',
      'spawn',
      'tactics',
      'rarity',
    ];
    if (!forcedLevelProfile) mutationDimensions.push('level');
    const mutationDimension = mutationDimensions[
      hash32(seed, round, index) % mutationDimensions.length
    ];
    return {
      id: `${policy.id}-r${round}-m${String(index + 1).padStart(2, '0')}`,
      townHall: policy.townHall,
      army: mutationDimension === 'army'
        ? armies[(armyIndex + round + index + 1) % armies.length]
        : policy.army,
      spawnProfile: mutationDimension === 'spawn'
        ? mutateSpawnProfile(
          policy.spawnProfile,
          hash32(seed, index, round),
          round,
        )
        : policy.spawnProfile,
      levelProfile: mutationDimension === 'level'
        ? forcedLevelProfile || ATTACK_LEVEL_PROFILES[
          (ATTACK_LEVEL_PROFILES.indexOf(policy.levelProfile) + round + 1)
          % ATTACK_LEVEL_PROFILES.length
        ]
        : policy.levelProfile,
      tactics: mutationDimension === 'tactics'
        ? tactics[
          (Math.max(0, tacticIndex) + round + (hash32(seed, index, 7) % 4) + 1)
          % tactics.length
        ]
        : policy.tactics,
      nftRarity: mutationDimension === 'rarity'
        ? NFT_RARITIES[
          (Math.max(0, rarityIndex) + round + 1) % NFT_RARITIES.length
        ]
        : policy.nftRarity,
      parentId: policy.id,
      mutationDimension,
    };
  });
}

function policySignature(policy) {
  return [
    policy.townHall,
    policy.army?.id || '',
    policy.spawnProfile,
    policy.levelProfile,
    policy.tactics,
    policy.nftRarity,
  ].join('|');
}

function ensureUniquePolicyMutations(candidates, existingPolicies) {
  const used = new Set(existingPolicies.map(policySignature));
  return candidates.map((candidate) => {
    let unique = candidate;
    if (used.has(policySignature(unique))) {
      const peers = existingPolicies.filter(
        (policy) => policy.townHall === candidate.townHall,
      );
      const optionsByDimension = {
        army: [...new Map(
          peers.map((policy) => [policy.army.id, policy.army]),
        ).values()],
        spawn: SPAWN_PROFILES,
        level: [...new Set(peers.map((policy) => policy.levelProfile))],
        tactics: [...new Set(peers.map((policy) => policy.tactics))],
        rarity: NFT_RARITIES,
      };
      const propertyByDimension = {
        army: 'army',
        spawn: 'spawnProfile',
        level: 'levelProfile',
        tactics: 'tactics',
        rarity: 'nftRarity',
      };
      const property = propertyByDimension[candidate.mutationDimension];
      const options = optionsByDimension[candidate.mutationDimension] || [];
      for (const option of options) {
        const fallback = { ...candidate, [property]: option };
        if (used.has(policySignature(fallback))) continue;
        unique = fallback;
        break;
      }
    }
    const signature = policySignature(unique);
    if (used.has(signature)) {
      throw new Error(`Could not make policy mutation unique: ${candidate.id}`);
    }
    used.add(signature);
    return unique;
  });
}

function mutateSpawnProfile(profile, seed, round) {
  const current = parseSpawnProfile(profile);
  const dimension = hash32(seed, round, hashString(profile)) % 3;
  const mutateDimension = (values, value, salt) => {
    const currentIndex = Math.max(0, values.indexOf(value));
    const offset = 1 + (hash32(seed, round, salt) % Math.max(1, values.length - 1));
    return values[(currentIndex + offset) % values.length];
  };
  const mutated = {
    ...current,
    formation: dimension === 0
      ? mutateDimension(SPAWN_FORMATIONS, current.formation, 11)
      : current.formation,
    timing: dimension === 1
      ? mutateDimension(SPAWN_TIMINGS, current.timing, 17)
      : current.timing,
    order: dimension === 2
      ? mutateDimension(DEPLOYMENT_ORDERS, current.order, 23)
      : current.order,
  };
  return formatSpawnProfile(mutated);
}

function mutateEliteBases({ eliteBases, seed, round }) {
  return eliteBases.map((base, index) => {
    const mutated = {
      ...base,
      id: `${base.id}-r${round}-m${String(index + 1).padStart(2, '0')}`,
      variation: Number(base.variation || 0) + round * 10_000 + index,
      parentId: base.id,
      buildings: base.buildings.map((building) => ({
        ...building,
        size: [...(building.size || [2, 2])],
      })),
    };
    const defenses = mutated.buildings
      .filter((building) => building.role === 'defense')
      .sort((a, b) => a.grid_z - b.grid_z);
    const shields = mutated.buildings
      .filter((building) => !['defense', 'core', 'trap'].includes(building.role))
      .sort((a, b) => b.grid_z - a.grid_z);
    const start = hash32(seed, round, index);
    for (let offset = 0; offset < defenses.length; offset += 1) {
      const defense = defenses[(start + offset) % defenses.length];
      const shield = shields.find((candidate) => (
        candidate.size[0] === defense.size[0]
        && candidate.size[1] === defense.size[1]
        && candidate.grid_z > defense.grid_z
      ));
      if (!shield) continue;
      [defense.grid_x, shield.grid_x] = [shield.grid_x, defense.grid_x];
      [defense.grid_z, shield.grid_z] = [shield.grid_z, defense.grid_z];
      break;
    }
    if (baseSignature(mutated) === baseSignature(base)) {
      const maxX = Math.max(
        ...mutated.buildings.map(
          (building) => building.grid_x + (building.size?.[0] || 2),
        ),
      );
      const minX = Math.min(...mutated.buildings.map((building) => building.grid_x));
      const shiftX = maxX < 29 ? 1 : minX > 0 ? -1 : 0;
      for (const building of mutated.buildings) building.grid_x += shiftX;
    }
    mutated.metrics = baseGeometryMetrics(mutated.buildings, 29, 27);
    return mutated;
  });
}

function ensureUniqueBaseMutations(candidates, existingBases) {
  const used = new Set(existingBases.map(baseSignature));
  const transforms = [];
  for (const mirrorX of [false, true]) {
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        transforms.push({ mirrorX, dx, dz });
      }
    }
  }
  return candidates.map((candidate) => {
    const sourceBuildings = candidate.buildings.map((building) => ({
      ...building,
      size: [...(building.size || [2, 2])],
    }));
    for (const transform of transforms) {
      const buildings = sourceBuildings.map((building) => {
        const sizeX = building.size[0];
        const mirroredX = transform.mirrorX
          ? 29 - building.grid_x - sizeX
          : building.grid_x;
        return {
          ...building,
          size: [...building.size],
          grid_x: mirroredX + transform.dx,
          grid_z: building.grid_z + transform.dz,
        };
      });
      const inBounds = buildings.every((building) => (
        building.grid_x >= 0
        && building.grid_z >= 0
        && building.grid_x + building.size[0] <= 29
        && building.grid_z + building.size[1] <= 27
      ));
      if (!inBounds) continue;
      const variant = {
        ...candidate,
        buildings,
        metrics: baseGeometryMetrics(buildings, 29, 27),
      };
      const signature = baseSignature(variant);
      if (used.has(signature)) continue;
      used.add(signature);
      return variant;
    }
    throw new Error(`Could not produce a unique in-bounds mutation for ${candidate.id}.`);
  });
}

function buildAdversarialScenarioPlan({
  count,
  startIndex,
  policies,
  bases,
  catalog,
  seed,
  round = 0,
}) {
  const townHalls = [...new Set(policies.map((policy) => policy.townHall))]
    .sort((a, b) => a - b);
  const policiesByTownHall = new Map();
  const basesByTownHall = new Map();
  for (const townHall of townHalls) {
    policiesByTownHall.set(
      townHall,
      policies.filter((policy) => policy.townHall === townHall),
    );
    basesByTownHall.set(
      townHall,
      bases.filter((base) => base.townHall === townHall),
    );
  }
  const scenarios = [];
  const cursorByTownHall = new Map(townHalls.map((townHall) => [townHall, 0]));
  for (let offset = 0; offset < count; offset += 1) {
    const townHall = townHalls[offset % townHalls.length];
    const policyPool = policiesByTownHall.get(townHall) || [];
    const basePool = basesByTownHall.get(townHall) || [];
    if (policyPool.length === 0 || basePool.length === 0) continue;
    const index = startIndex + scenarios.length;
    const pairCount = policyPool.length * basePool.length;
    const localCursor = cursorByTownHall.get(townHall) || 0;
    const policyOffset = hash32(seed, townHall, 29) % policyPool.length;
    const baseOffset = hash32(seed, townHall, 37) % basePool.length;
    const policyIndex = (localCursor + policyOffset) % policyPool.length;
    const cycle = Math.floor(localCursor / policyPool.length);
    const baseIndex = (
      policyIndex
      + cycle
      + baseOffset
    ) % basePool.length;
    cursorByTownHall.set(townHall, localCursor + 1);
    const policy = policyPool[policyIndex];
    const base = basePool[baseIndex];
    scenarios.push(makeScenario({
      index,
      base,
      attackerTh: townHall,
      army: policy.army,
      spawnProfile: policy.spawnProfile,
      levelProfile: policy.levelProfile,
      tactics: policy.tactics,
      policyId: policy.id,
      nftRarity: policy.nftRarity,
      catalog,
      seed,
      experimentCohort: `training-round-${round}`,
    }));
  }
  return scenarios;
}

function runUnitUtilityProbe({
  basesPerTroop,
  requestedTroops,
  verifyReplay,
  combatDefs,
  bases,
  catalog,
  shipCapacities,
  seed,
  startIndex,
  verbose,
}) {
  if (basesPerTroop <= 0 || bases.length === 0) {
    return {
      enabled: false,
      basesPerTroop: 0,
      referenceTownHall: 0,
      totalPairs: 0,
      totalBattles: 0,
      invalid: 0,
      byTroop: {},
      byRole: {},
    };
  }
  const referenceTownHall = Math.max(...bases.map((base) => base.townHall));
  const referenceBases = bases
    .filter((base) => base.townHall === referenceTownHall)
    .sort((a, b) => a.id.localeCompare(b.id));
  const capacity = Number(shipCapacities[referenceTownHall])
    || Math.max(...Object.values(shipCapacities));
  const controlArmy = createStarterReferenceArmy(
    referenceTownHall,
    capacity,
    catalog,
  );
  const byTroop = {};
  let totalBattles = 0;
  let invalid = 0;
  const probeTroops = catalog.troops.filter((troop) => (
    !requestedTroops
    || requestedTroops.size === 0
    || requestedTroops.has(troop.type)
  ));

  for (let troopIndex = 0; troopIndex < probeTroops.length; troopIndex += 1) {
    const troop = probeTroops[troopIndex];
    const selectedBases = selectProbeBases(
      referenceBases,
      basesPerTroop,
      hash32(seed, troopIndex, 0x5554494c),
    );
    const candidateArmy = createUnitUtilityArmy({
      troop,
      townHall: Math.max(referenceTownHall, troop.unlockTownHall),
      capacity,
      catalog,
    });
    const bucket = createPairedUtilityBucket(
      troop,
      candidateArmy,
      controlArmy,
      referenceTownHall,
    );
    for (let pairIndex = 0; pairIndex < selectedBases.length; pairIndex += 1) {
      const base = selectedBases[pairIndex];
      const attackerTh = Math.max(referenceTownHall, troop.unlockTownHall);
      const spawnProfile = SPAWN_PROFILES[
        hash32(seed, troopIndex, pairIndex, 0x53504157) % SPAWN_PROFILES.length
      ];
      const troopLevelSeed = hash32(
        seed,
        hashString(base.id),
        hashString(troop.type),
        0x4c455645,
      );
      const common = {
        base,
        attackerTh,
        spawnProfile,
        levelProfile: 'maxed',
        tactics: 'none',
        nftRarity: 'common',
        defenderWard: 0,
        catalog,
        seed,
        troopLevelSeed,
      };
      const controlScenario = makeScenario({
        ...common,
        index: startIndex + totalBattles,
        army: controlArmy,
        policyId: `utility-${troop.type}-control-${pairIndex + 1}`,
        experimentCohort: 'unit-utility-control',
      });
      const controlResult = runScenario(
        verifyReplay,
        combatDefs,
        controlScenario,
        verbose,
      );
      totalBattles += 1;
      const candidateScenario = makeScenario({
        ...common,
        index: startIndex + totalBattles,
        army: candidateArmy,
        policyId: `utility-${troop.type}-candidate-${pairIndex + 1}`,
        experimentCohort: 'unit-utility-candidate',
      });
      const candidateResult = runScenario(
        verifyReplay,
        combatDefs,
        candidateScenario,
        verbose,
      );
      totalBattles += 1;
      if (!controlResult.valid) invalid += 1;
      if (!candidateResult.valid) invalid += 1;
      recordPairedUtilityResult(bucket, controlResult, candidateResult, base);
    }
    byTroop[troop.type] = finalizePairedUtilityBucket(bucket);
  }

  const byRoleBuckets = new Map();
  for (const row of Object.values(byTroop)) {
    if (!byRoleBuckets.has(row.role)) {
      byRoleBuckets.set(row.role, {
        pairs: 0,
        validPairs: 0,
        controlWins: 0,
        candidateWins: 0,
        gainedWins: 0,
        lostWins: 0,
        destructionDelta: 0,
        townHallHpDelta: 0,
      });
    }
    const role = byRoleBuckets.get(row.role);
    role.pairs += row.pairs;
    role.validPairs += row.validPairs;
    role.controlWins += row.controlWins;
    role.candidateWins += row.candidateWins;
    role.gainedWins += row.gainedWins;
    role.lostWins += row.lostWins;
    role.destructionDelta += row.destructionDelta * row.validPairs;
    role.townHallHpDelta += row.townHallHpDelta * row.validPairs;
  }
  const byRole = Object.fromEntries(
    [...byRoleBuckets.entries()].map(([role, bucket]) => [
      role,
      {
        ...bucket,
        controlWinRate: rate(bucket.controlWins, bucket.validPairs),
        candidateWinRate: rate(bucket.candidateWins, bucket.validPairs),
        winRateDelta: rate(
          bucket.candidateWins - bucket.controlWins,
          bucket.validPairs,
        ),
        destructionDelta: avg(bucket.destructionDelta, bucket.validPairs),
        townHallHpDelta: avg(bucket.townHallHpDelta, bucket.validPairs),
      },
    ]),
  );
  return {
    enabled: true,
    basesPerTroop: Math.min(basesPerTroop, referenceBases.length),
    referenceTownHall,
    referenceBaseCount: referenceBases.length,
    projectedTroops: catalog.troops
      .filter((troop) => (
        probeTroops.includes(troop)
        && troop.unlockTownHall > referenceTownHall
      ))
      .map((troop) => troop.type),
    totalPairs: Object.values(byTroop)
      .reduce((sum, row) => sum + row.pairs, 0),
    totalBattles,
    invalid,
    byTroop,
    byRole,
  };
}

function createStarterReferenceArmy(townHall, capacity, catalog) {
  const available = catalog.troops.filter((troop) => ['knight', 'archer'].includes(troop.type));
  return createArmy(
    townHall,
    'utility-starter-control',
    ['knight', 'archer'],
    available,
    capacity,
  );
}

function createUnitUtilityArmy({ troop, townHall, capacity, catalog }) {
  const byType = new Map(catalog.troops.map((entry) => [entry.type, entry]));
  const slotCost = Math.max(1, Number(troop.slotCost) || 1);
  let copies = Math.max(1, Math.round(15 / slotCost));
  while (copies * slotCost > Math.min(20, capacity)) copies -= 1;
  const units = Array.from({ length: Math.max(1, copies) }, () => troop.type);
  let slotsUsed = units.length * slotCost;
  const filler = ['knight', 'archer'];
  let cursor = 0;
  while (slotsUsed < capacity && cursor < capacity * 4) {
    const type = filler[cursor % filler.length];
    const cost = Number(byType.get(type)?.slotCost || 1);
    if (slotsUsed + cost <= capacity) {
      units.push(type);
      slotsUsed += cost;
    }
    cursor += 1;
  }
  return {
    id: `th${townHall}-utility-${troop.type}`,
    townHall,
    name: `utility-${troop.type}`,
    units,
    slotsUsed,
    capacity,
    utilization: round(slotsUsed / capacity, 4),
    candidateCopies: copies,
    candidateSlots: copies * slotCost,
  };
}

function createPairedUtilityBucket(troop, candidateArmy, controlArmy, referenceTownHall) {
  const roleEntry = UNIT_ROLE_REGISTRY[troop.type] || {};
  return {
    troop: troop.type,
    role: roleEntry.role || 'damage',
    access: roleEntry.access || 'regular',
    mechanics: roleEntry.mechanics || [],
    unlockTownHall: troop.unlockTownHall,
    referenceTownHall,
    slotCost: troop.slotCost,
    candidateCopies: candidateArmy.candidateCopies,
    candidateSlots: candidateArmy.candidateSlots,
    controlArmy: controlArmy.name,
    pairs: 0,
    validPairs: 0,
    invalidPairs: 0,
    controlWins: 0,
    candidateWins: 0,
    gainedWins: 0,
    lostWins: 0,
    destructionDelta: 0,
    townHallHpDelta: 0,
    survivalDelta: 0,
    summonDelta: 0,
    evolutionDelta: 0,
    trapTriggerDelta: 0,
    byArchetype: {},
  };
}

function recordPairedUtilityResult(bucket, control, candidate, base) {
  bucket.pairs += 1;
  if (!control.valid || !candidate.valid) {
    bucket.invalidPairs += 1;
    return;
  }
  bucket.validPairs += 1;
  bucket.controlWins += control.win ? 1 : 0;
  bucket.candidateWins += candidate.win ? 1 : 0;
  if (!control.win && candidate.win) bucket.gainedWins += 1;
  if (control.win && !candidate.win) bucket.lostWins += 1;
  bucket.destructionDelta += (
    rate(candidate.buildingsDestroyed, candidate.buildingCount)
    - rate(control.buildingsDestroyed, control.buildingCount)
  );
  bucket.townHallHpDelta += (
    Number(control.townHallHpPct || 0)
    - Number(candidate.townHallHpPct || 0)
  );
  bucket.survivalDelta += (
    rate(candidate.troopsAlive, candidate.troopsSpawned)
    - rate(control.troopsAlive, control.troopsSpawned)
  );
  bucket.summonDelta += candidate.summonsSpawned - control.summonsSpawned;
  bucket.evolutionDelta += (
    candidate.evolutionChildrenSpawned - control.evolutionChildrenSpawned
  );
  bucket.trapTriggerDelta += (
    candidate.sharkTrapsTriggered - control.sharkTrapsTriggered
  );
  const archetype = base.archetype;
  if (!bucket.byArchetype[archetype]) {
    bucket.byArchetype[archetype] = {
      pairs: 0,
      controlWins: 0,
      candidateWins: 0,
    };
  }
  bucket.byArchetype[archetype].pairs += 1;
  bucket.byArchetype[archetype].controlWins += control.win ? 1 : 0;
  bucket.byArchetype[archetype].candidateWins += candidate.win ? 1 : 0;
}

function finalizePairedUtilityBucket(bucket) {
  const byArchetype = Object.fromEntries(
    Object.entries(bucket.byArchetype).map(([archetype, row]) => [
      archetype,
      {
        ...row,
        controlWinRate: rate(row.controlWins, row.pairs),
        candidateWinRate: rate(row.candidateWins, row.pairs),
        winRateDelta: rate(row.candidateWins - row.controlWins, row.pairs),
      },
    ]),
  );
  return {
    ...bucket,
    projected: bucket.unlockTownHall > bucket.referenceTownHall,
    controlWinRate: rate(bucket.controlWins, bucket.validPairs),
    candidateWinRate: rate(bucket.candidateWins, bucket.validPairs),
    winRateDelta: rate(
      bucket.candidateWins - bucket.controlWins,
      bucket.validPairs,
    ),
    netWinFlips: bucket.gainedWins - bucket.lostWins,
    pairedWinRateInterval90: pairedDeltaInterval(
      bucket.gainedWins,
      bucket.lostWins,
      bucket.validPairs,
      1.6448536269514722,
    ),
    pairedWinRateInterval95: pairedDeltaInterval(
      bucket.gainedWins,
      bucket.lostWins,
      bucket.validPairs,
      1.959963984540054,
    ),
    destructionDelta: avg(bucket.destructionDelta, bucket.validPairs),
    townHallHpDelta: avg(bucket.townHallHpDelta, bucket.validPairs),
    survivalDelta: avg(bucket.survivalDelta, bucket.validPairs),
    summonDelta: avg(bucket.summonDelta, bucket.validPairs),
    evolutionDelta: avg(bucket.evolutionDelta, bucket.validPairs),
    trapTriggerDelta: avg(bucket.trapTriggerDelta, bucket.validPairs),
    byArchetype,
  };
}

function pairedDeltaInterval(gainedWins, lostWins, validPairs, zScore) {
  const count = Math.max(0, Number(validPairs) || 0);
  const gained = Math.max(0, Number(gainedWins) || 0);
  const lost = Math.max(0, Number(lostWins) || 0);
  const delta = rate(gained - lost, count);
  if (count <= 1) {
    return { low: -1, high: 1, delta, standardError: 1 };
  }
  const discordant = gained + lost;
  const variance = Math.max(
    0,
    (discordant - count * delta * delta) / (count - 1),
  );
  const standardError = Math.sqrt(variance / count);
  return {
    low: Math.max(-1, delta - zScore * standardError),
    high: Math.min(1, delta + zScore * standardError),
    delta,
    standardError,
  };
}

function analyzeUnitUtilityProbe(probe) {
  if (!probe?.enabled) return [];
  const issues = [];
  for (const row of Object.values(probe.byTroop || {})) {
    if (row.invalidPairs > 0) {
      issues.push({
        severity: 'critical',
        code: 'unit-utility-invalid-pair',
        message: `${row.troop} has ${row.invalidPairs}/${row.pairs} invalid equal-slot utility pairs.`,
      });
      continue;
    }
    if (row.validPairs < 90) {
      issues.push({
        severity: 'warning',
        code: 'unit-utility-sample-size',
        message: `${row.troop} has only ${row.validPairs} valid utility pairs; at least 90 per holdout seed are required.`,
      });
    }
    const interval = row.pairedWinRateInterval95;
    if (row.projected) {
      if (interval.high < -0.20) {
        issues.push({
          severity: 'critical',
          code: 'projected-unit-grossly-underpowered',
          message: `${row.troop} projected utility is grossly weak versus the TH${probe.referenceTownHall} ceiling: ${pct(row.winRateDelta)} paired delta, 95% CI ${pct(interval.low)} to ${pct(interval.high)}.`,
        });
      } else if (interval.low > 0.20) {
        issues.push({
          severity: 'warning',
          code: 'projected-unit-overtuning',
          message: `${row.troop} projected utility may be overtuned versus the TH${probe.referenceTownHall} ceiling: ${pct(row.winRateDelta)} paired delta, 95% CI ${pct(interval.low)} to ${pct(interval.high)}.`,
        });
      }
      continue;
    }

    const specialized = row.role === 'utility' || row.role === 'support';
    const lowerMargin = specialized ? -0.125 : -0.10;
    const upperMargin = specialized ? 0.15 : (row.access === 'nft' ? 0.15 : 0.10);
    if (interval.high < lowerMargin) {
      issues.push({
        severity: 'critical',
        code: 'underpowered-unit-utility',
        message: `${row.troop} is below its role-aware equal-slot utility floor: ${pct(row.winRateDelta)} paired delta, 95% CI ${pct(interval.low)} to ${pct(interval.high)}.`,
      });
    } else if (interval.low > upperMargin) {
      issues.push({
        severity: row.access === 'nft' ? 'warning' : 'critical',
        code: 'dominant-unit-utility',
        message: `${row.troop} exceeds its role-aware equal-slot utility ceiling: ${pct(row.winRateDelta)} paired delta, 95% CI ${pct(interval.low)} to ${pct(interval.high)}.`,
      });
    } else if (
      row.winRateDelta < lowerMargin
      || row.winRateDelta > upperMargin
    ) {
      issues.push({
        severity: 'warning',
        code: 'unit-utility-inconclusive',
        message: `${row.troop} point estimate ${pct(row.winRateDelta)} is outside its role-aware corridor, but the paired 95% CI ${pct(interval.low)} to ${pct(interval.high)} is inconclusive.`,
      });
    }
  }
  return issues;
}

function runNftRarityProbe({
  basesPerTroop,
  verifyReplay,
  combatDefs,
  bases,
  armiesByTownHall,
  catalog,
  seed,
  startIndex,
  verbose,
}) {
  if (basesPerTroop <= 0 || bases.length === 0) {
    return {
      enabled: false,
      basesPerTroop: 0,
      totalBattles: 0,
      invalid: 0,
      byTroop: {},
    };
  }
  const nftTypes = ['demon_king', 'fire_dragon']
    .filter((type) => catalog.troops.some((troop) => troop.type === type));
  const byTroop = {};
  let totalBattles = 0;
  let invalid = 0;
  for (let troopIndex = 0; troopIndex < nftTypes.length; troopIndex += 1) {
    const troopType = nftTypes[troopIndex];
    const selectedBases = selectProbeBases(
      [...bases].sort((a, b) => a.id.localeCompare(b.id)),
      basesPerTroop,
      hash32(seed, troopIndex, 0x4e465452),
    );
    const bucket = {
      troop: troopType,
      pairs: 0,
      invalidPairs: 0,
      byRarity: Object.fromEntries(
        ['common', 'epic', 'legendary'].map((rarity) => [
          rarity,
          createBucket(),
        ]),
      ),
      versusCommon: {
        epic: { gainedWins: 0, lostWins: 0, validPairs: 0 },
        legendary: { gainedWins: 0, lostWins: 0, validPairs: 0 },
      },
    };
    for (let pairIndex = 0; pairIndex < selectedBases.length; pairIndex += 1) {
      const base = selectedBases[pairIndex];
      const army = (armiesByTownHall.get(base.townHall) || [])
        .find((candidate) => candidate.name === `pure-${troopType}`);
      if (!army) continue;
      const spawnProfile = SPAWN_PROFILES[
        hash32(seed, troopIndex, pairIndex, 0x52415245) % SPAWN_PROFILES.length
      ];
      const troopLevelSeed = hash32(
        seed,
        hashString(base.id),
        hashString(troopType),
        0x4e46544c,
      );
      const results = {};
      for (const rarity of ['common', 'epic', 'legendary']) {
        const scenario = makeScenario({
          index: startIndex + totalBattles,
          base,
          attackerTh: base.townHall,
          army,
          spawnProfile,
          levelProfile: 'maxed',
          tactics: 'none',
          policyId: `rarity-${troopType}-${rarity}-${pairIndex + 1}`,
          nftRarity: rarity,
          defenderWard: 0,
          experimentCohort: 'nft-rarity-probe',
          troopLevelSeed,
          catalog,
          seed,
        });
        const result = runScenario(verifyReplay, combatDefs, scenario, verbose);
        totalBattles += 1;
        if (!result.valid) invalid += 1;
        results[rarity] = result;
        recordBucket(bucket.byRarity[rarity], result);
      }
      bucket.pairs += 1;
      for (const rarity of ['epic', 'legendary']) {
        const common = results.common;
        const rare = results[rarity];
        if (!common.valid || !rare.valid) {
          bucket.invalidPairs += 1;
          continue;
        }
        const pair = bucket.versusCommon[rarity];
        pair.validPairs += 1;
        if (!common.win && rare.win) pair.gainedWins += 1;
        if (common.win && !rare.win) pair.lostWins += 1;
      }
    }
    for (const rarity of ['epic', 'legendary']) {
      const common = bucket.byRarity.common;
      const rare = bucket.byRarity[rarity];
      const pair = bucket.versusCommon[rarity];
      pair.commonWinRate = rate(common.validWins, common.validCount);
      pair.rareWinRate = rate(rare.validWins, rare.validCount);
      pair.winRateDelta = pair.rareWinRate - pair.commonWinRate;
      pair.netWinFlips = pair.gainedWins - pair.lostWins;
      pair.pairedWinRateInterval95 = pairedDeltaInterval(
        pair.gainedWins,
        pair.lostWins,
        pair.validPairs,
        1.959963984540054,
      );
    }
    byTroop[troopType] = bucket;
  }
  return {
    enabled: true,
    basesPerTroop: Math.min(basesPerTroop, bases.length),
    totalBattles,
    invalid,
    byTroop,
  };
}

function analyzeNftRarityProbe(probe) {
  if (!probe?.enabled) return [];
  const issues = [];
  const ceilings = {
    epic: { pass: 0.05, hard: 0.075 },
    legendary: { pass: 0.08, hard: 0.10 },
  };
  for (const row of Object.values(probe.byTroop || {})) {
    if (row.invalidPairs > 0) {
      issues.push({
        severity: 'critical',
        code: 'nft-rarity-invalid-pair',
        message: `${row.troop} has ${row.invalidPairs} invalid paired rarity comparisons.`,
      });
    }
    for (const rarity of ['epic', 'legendary']) {
      const comparison = row.versusCommon?.[rarity];
      if (!comparison || comparison.validPairs === 0) continue;
      const interval = comparison.pairedWinRateInterval95;
      const ceiling = ceilings[rarity];
      if (comparison.lostWins > 0) {
        issues.push({
          severity: comparison.netWinFlips < 0 ? 'critical' : 'warning',
          code: 'nft-rarity-outcome-reversal',
          message: `${row.troop} ${rarity} lost ${comparison.lostWins} deterministic battles won by common, while gaining ${comparison.gainedWins}; stronger stats can alter target timing, so the aggregate paired direction remains authoritative.`,
        });
      }
      if (interval.high < 0) {
        issues.push({
          severity: 'critical',
          code: 'nft-rarity-underperforms-common',
          message: `${row.troop} ${rarity} is statistically weaker than common: ${pct(comparison.winRateDelta)} lift, 95% CI ${pct(interval.low)} to ${pct(interval.high)}.`,
        });
      }
      if (interval.low > ceiling.pass) {
        issues.push({
          severity: 'critical',
          code: 'nft-rarity-pay-to-win',
          message: `${row.troop} ${rarity} exceeds the paired rarity ceiling: ${pct(comparison.winRateDelta)} lift, 95% CI ${pct(interval.low)} to ${pct(interval.high)}.`,
        });
      } else if (
        comparison.winRateDelta > ceiling.pass
        || interval.high > ceiling.hard
      ) {
        issues.push({
          severity: 'warning',
          code: 'nft-rarity-ceiling-inconclusive',
          message: `${row.troop} ${rarity} rarity lift is not yet conclusively inside the authored ceiling: ${pct(comparison.winRateDelta)}, 95% CI ${pct(interval.low)} to ${pct(interval.high)}.`,
        });
      }
    }
  }
  return issues;
}

function runBaseCounterMetaProbe({
  requestedBattles,
  verifyReplay,
  combatDefs,
  bases,
  armiesByTownHall,
  catalog,
  seed,
  startIndex,
  verbose,
}) {
  if (requestedBattles <= 0 || bases.length === 0) {
    return {
      enabled: false,
      requestedBattles: 0,
      totalBattles: 0,
      discoveryBattles: 0,
      counterHoldoutBattles: 0,
      universalHoldoutBattles: 0,
      hardConfirmationBattles: 0,
      invalid: 0,
      testedBaseCount: 0,
      armyCountByTownHall: {},
      availableArmyCountByTownHall: {},
      missingDiscoveryCellCount: 0,
      discoveryZeroCounterBaseCount: 0,
      zeroCounterBaseCount: 0,
      confirmedBreakabilityFailureCount: 0,
      byCell: {},
      byBase: {},
      byArmy: {},
      diversity: {},
      diversityByTownHall: {},
      diversityByLayoutFamily: {},
      diversityByLevelProfile: {},
      universalFamily: '',
    };
  }

  const orderedBases = [...bases].sort((a, b) => a.id.localeCompare(b.id));
  const selectedArmiesByTownHall = new Map();
  const armyCountByTownHall = {};
  const availableArmyCountByTownHall = {};
  for (const townHall of [...new Set(orderedBases.map((base) => base.townHall))]) {
    availableArmyCountByTownHall[`TH${townHall}`] = (
      armiesByTownHall.get(townHall) || []
    ).length;
    const selected = selectBaseCounterMetaArmies(
      armiesByTownHall.get(townHall) || [],
      15,
    );
    if (selected.length < 15) {
      throw new Error(
        `Base-counter meta requires 15 distinct TH${townHall} armies; `
        + `only ${selected.length} are available.`,
      );
    }
    selectedArmiesByTownHall.set(townHall, selected);
    armyCountByTownHall[`TH${townHall}`] = selected.length;
  }

  const requiredDiscoveryBattles = orderedBases.reduce(
    (total, base) => (
      total
      + (selectedArmiesByTownHall.get(base.townHall)?.length || 0)
        * COUNTER_META_CONFIRMATION_CONTEXTS
    ),
    0,
  );
  if (requestedBattles < requiredDiscoveryBattles) {
    throw new Error(
      `--base-counter-matches ${requestedBattles} is too small for the `
      + `${requiredDiscoveryBattles}-battle paired discovery matrix.`,
    );
  }

  const cells = new Map();
  const cellIdsByBase = new Map(orderedBases.map((base) => [base.id, []]));
  let totalBattles = 0;
  let invalid = 0;
  const phaseCounts = {
    discovery: 0,
    counterHoldout: 0,
    universalHoldout: 0,
    hardConfirmation: 0,
  };

  function execute(base, army, phase, contextOrdinal) {
    const context = baseCounterMetaContext({
      combatDefs,
      base,
      seed,
      phase,
      contextOrdinal,
    });
    const scenario = makeScenario({
      index: startIndex + totalBattles,
      base,
      attackerTh: base.townHall,
      army,
      spawnProfile: context.spawnProfile,
      levelProfile: 'maxed',
      tactics: context.tactics,
      policyId: `counter-meta-${phase}-${base.id}-${army.id}-${contextOrdinal}`,
      nftRarity: 'common',
      defenderWard: 0,
      experimentCohort: 'base-counter-meta',
      troopLevelSeed: hash32(
        seed,
        hashString(base.id),
        hashString(army.id),
        0x434d4554,
      ),
      catalog,
      seed,
    });
    const result = runScenario(verifyReplay, combatDefs, scenario, verbose);
    totalBattles += 1;
    phaseCounts[phase] += 1;
    if (!result.valid) invalid += 1;
    const key = `${base.id}|${army.id}`;
    if (!cells.has(key)) {
      cells.set(key, createBaseCounterMetaCell(base, army));
      cellIdsByBase.get(base.id).push(key);
    }
    recordBaseCounterMetaResult(cells.get(key), phase, result, context);
  }

  for (let contextOrdinal = 0; contextOrdinal < COUNTER_META_CONFIRMATION_CONTEXTS; contextOrdinal += 1) {
    for (const base of orderedBases) {
      for (const army of selectedArmiesByTownHall.get(base.townHall) || []) {
        execute(base, army, 'discovery', contextOrdinal);
      }
    }
  }

  const rankedCellsByBase = new Map();
  for (const base of orderedBases) {
    rankedCellsByBase.set(
      base.id,
      rankBaseCounterMetaCells(
        (cellIdsByBase.get(base.id) || []).map((key) => cells.get(key)),
        ['discovery'],
      ),
    );
  }

  const universalFamily = selectUniversalCounterFamily(cells, orderedBases);
  if (!universalFamily) {
    throw new Error(
      'Base-counter meta could not find one comparable army family represented at every Town Hall.',
    );
  }

  for (let rank = 0; rank < 2 && totalBattles < requestedBattles; rank += 1) {
    for (const base of orderedBases) {
      if (totalBattles >= requestedBattles) break;
      const cell = rankedCellsByBase.get(base.id)?.[rank];
      if (cell) execute(base, cell.army, 'counterHoldout', 0);
    }
  }

  for (const base of orderedBases) {
    if (totalBattles >= requestedBattles) break;
    const cell = (cellIdsByBase.get(base.id) || [])
      .map((key) => cells.get(key))
      .find((candidate) => candidate.army.name === universalFamily);
    if (cell) execute(base, cell.army, 'universalHoldout', 0);
  }

  const hardestBases = [...orderedBases].sort((a, b) => {
    const left = averageBaseCounterMetaUtility(rankedCellsByBase.get(a.id)?.[0], ['discovery']);
    const right = averageBaseCounterMetaUtility(rankedCellsByBase.get(b.id)?.[0], ['discovery']);
    return left - right || a.id.localeCompare(b.id);
  });
  let hardCursor = 0;
  while (totalBattles < requestedBattles) {
    const base = hardestBases[hardCursor % hardestBases.length];
    const ranked = rankedCellsByBase.get(base.id) || [];
    const hardRound = Math.floor(hardCursor / hardestBases.length);
    const rank = hardRound === 0
      ? 0
      : 1 + ((hardRound - 1) % Math.max(1, ranked.length - 1));
    const cell = ranked[rank % Math.max(1, ranked.length)];
    if (!cell) break;
    const contextOrdinal = hardRound;
    execute(base, cell.army, 'hardConfirmation', contextOrdinal);
    hardCursor += 1;
  }

  const missingDiscoveryCells = [...cells.values()]
    .filter((cell) => cell.discovery.count !== COUNTER_META_CONFIRMATION_CONTEXTS);
  const byBase = {};
  const armyRows = new Map();
  const topCounterCredits = new Map();
  const creditsByTownHall = new Map();
  const creditsByLayoutFamily = new Map();
  const creditsByLevelProfile = new Map();
  let zeroCounterBaseCount = 0;
  let discoveryZeroCounterBaseCount = 0;
  let confirmedBreakabilityFailureCount = 0;
  let singleCounterBaseCount = 0;
  let twoCounterBaseCount = 0;
  let threeCounterBaseCount = 0;
  let multiFamilyCounterBaseCount = 0;
  let excessivelySoftBaseCount = 0;
  let universalCounterForcingBaseCount = 0;
  let universalRegretSum = 0;
  let universalRegretCount = 0;

  for (const base of orderedBases) {
    const baseCells = (cellIdsByBase.get(base.id) || []).map((key) => cells.get(key));
    const ranked = rankBaseCounterMetaCells(baseCells, ['discovery']);
    const discoveryWinners = ranked.filter((cell) => cell.discovery.validWins > 0);
    const robustDiscoveryWinners = ranked.filter((cell) => (
      cell.discovery.validCount === COUNTER_META_CONFIRMATION_CONTEXTS
      && cell.discovery.validWins === cell.discovery.validCount
    ));
    const allWinners = ranked.filter((cell) => cell.total.validWins > 0);
    const topTwo = ranked.slice(0, 2);
    const topTwoHoldoutWin = topTwo.some((cell) => cell.counterHoldout.validWins > 0);
    const universalCell = baseCells.find((cell) => cell.army.name === universalFamily);
    const universalDiscoveryWin = !!universalCell?.discovery.validWins;
    const bestUtility = averageBaseCounterMetaUtility(ranked[0], ['discovery']);
    const universalUtility = averageBaseCounterMetaUtility(universalCell, ['discovery']);
    const regret = Math.max(0, bestUtility - universalUtility);
    if (Number.isFinite(regret)) {
      universalRegretSum += regret;
      universalRegretCount += 1;
    }
    if (!universalDiscoveryWin && discoveryWinners.length > 0) {
      universalCounterForcingBaseCount += 1;
    }
    if (allWinners.length === 0) zeroCounterBaseCount += 1;
    if (discoveryWinners.length === 0) discoveryZeroCounterBaseCount += 1;
    if (!topTwoHoldoutWin) confirmedBreakabilityFailureCount += 1;
    if (discoveryWinners.length === 1) singleCounterBaseCount += 1;
    if (discoveryWinners.length >= 2) twoCounterBaseCount += 1;
    if (discoveryWinners.length >= 3) threeCounterBaseCount += 1;
    if (new Set(discoveryWinners.map((cell) => cell.armyFamily)).size >= 2) {
      multiFamilyCounterBaseCount += 1;
    }
    if (robustDiscoveryWinners.length >= 12) excessivelySoftBaseCount += 1;

    const nearBestWinners = selectNearBestCounterCells(discoveryWinners, 0.03);
    const credit = nearBestWinners.length > 0 ? 1 / nearBestWinners.length : 0;
    for (const cell of nearBestWinners) {
      addCounterMetaCredit(topCounterCredits, cell.army.name, credit);
      const thKey = `TH${base.townHall}`;
      if (!creditsByTownHall.has(thKey)) creditsByTownHall.set(thKey, new Map());
      addCounterMetaCredit(creditsByTownHall.get(thKey), cell.army.name, credit);
      const layoutKey = `${thKey}|${baseCounterMetaLayoutFamily(base.archetype)}`;
      if (!creditsByLayoutFamily.has(layoutKey)) {
        creditsByLayoutFamily.set(layoutKey, new Map());
      }
      addCounterMetaCredit(
        creditsByLayoutFamily.get(layoutKey),
        cell.army.name,
        credit,
      );
      if (!creditsByLevelProfile.has(base.levelProfile)) {
        creditsByLevelProfile.set(base.levelProfile, new Map());
      }
      addCounterMetaCredit(
        creditsByLevelProfile.get(base.levelProfile),
        cell.army.name,
        credit,
      );
    }

    for (const cell of baseCells) {
      if (!armyRows.has(cell.army.name)) {
        armyRows.set(cell.army.name, {
          family: cell.army.name,
          recipeFamily: cell.armyFamily,
          townHalls: new Set(),
          discoveryBasesTested: 0,
          discoveryBasesWon: 0,
          discoveryBattles: 0,
          discoveryWins: 0,
          discoveryUtility: 0,
          topCounterCredit: 0,
          counterHoldoutBattles: 0,
          counterHoldoutWins: 0,
          universalHoldoutBattles: 0,
          universalHoldoutWins: 0,
        });
      }
      const row = armyRows.get(cell.army.name);
      row.townHalls.add(base.townHall);
      row.discoveryBasesTested += 1;
      if (cell.discovery.validWins > 0) row.discoveryBasesWon += 1;
      row.discoveryBattles += cell.discovery.validCount;
      row.discoveryWins += cell.discovery.validWins;
      row.discoveryUtility += cell.discovery.utilitySum;
      row.counterHoldoutBattles += cell.counterHoldout.validCount;
      row.counterHoldoutWins += cell.counterHoldout.validWins;
      row.universalHoldoutBattles += cell.universalHoldout.validCount;
      row.universalHoldoutWins += cell.universalHoldout.validWins;
    }

    byBase[base.id] = {
      id: base.id,
      townHall: base.townHall,
      archetype: base.archetype,
      layoutFamily: baseCounterMetaLayoutFamily(base.archetype),
      levelProfile: base.levelProfile,
      discoveryArmyCount: baseCells.length,
      discoveryValidBattleCount: baseCells.reduce(
        (sum, cell) => sum + cell.discovery.validCount,
        0,
      ),
      discoveryWinCount: baseCells.reduce(
        (sum, cell) => sum + cell.discovery.validWins,
        0,
      ),
      discoveryWinningArmyCount: discoveryWinners.length,
      robustDiscoveryWinningArmyCount: robustDiscoveryWinners.length,
      discoveryWinningRecipeFamilyCount: new Set(
        discoveryWinners.map((cell) => cell.armyFamily),
      ).size,
      totalWinningArmyCount: allWinners.length,
      topCounter: ranked[0]?.army.name || '',
      runnerUpCounter: ranked[1]?.army.name || '',
      nearBestCounters: nearBestWinners.map((cell) => cell.army.name),
      bestDiscoveryUtility: bestUtility,
      universalFamily,
      universalDiscoveryWin,
      universalDiscoveryUtility: universalUtility,
      universalRegret: regret,
      topTwoHoldoutWin,
    };
  }

  for (const [family, credit] of topCounterCredits) {
    if (armyRows.has(family)) armyRows.get(family).topCounterCredit = credit;
  }
  const totalTopCounterCredit = [...topCounterCredits.values()]
    .reduce((sum, credit) => sum + Number(credit || 0), 0);
  const byArmy = Object.fromEntries(
    [...armyRows.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(
      ([family, row]) => [
        family,
        {
          ...row,
          townHalls: [...row.townHalls].sort((a, b) => a - b),
          discoveryBaseWinRate: rate(
            row.discoveryBasesWon,
            row.discoveryBasesTested,
          ),
          discoveryWinRate: rate(row.discoveryWins, row.discoveryBattles),
          averageDiscoveryUtility: avg(
            row.discoveryUtility,
            row.discoveryBattles,
          ),
          topCounterShare: rate(row.topCounterCredit, totalTopCounterCredit),
          topCounterBaseCoverageShare: rate(
            row.topCounterCredit,
            orderedBases.length,
          ),
          counterHoldoutWinRate: rate(
            row.counterHoldoutWins,
            row.counterHoldoutBattles,
          ),
          universalHoldoutWinRate: rate(
            row.universalHoldoutWins,
            row.universalHoldoutBattles,
          ),
        },
      ],
    ),
  );

  const diversity = counterMetaDiversitySummary(
    topCounterCredits,
    orderedBases.length,
  );
  diversity.singleCounterBaseCount = singleCounterBaseCount;
  diversity.singleCounterBaseRate = rate(singleCounterBaseCount, orderedBases.length);
  diversity.twoCounterBaseCount = twoCounterBaseCount;
  diversity.twoCounterBaseRate = rate(twoCounterBaseCount, orderedBases.length);
  diversity.threeCounterBaseCount = threeCounterBaseCount;
  diversity.threeCounterBaseRate = rate(threeCounterBaseCount, orderedBases.length);
  diversity.multiFamilyCounterBaseCount = multiFamilyCounterBaseCount;
  diversity.multiFamilyCounterBaseRate = rate(
    multiFamilyCounterBaseCount,
    orderedBases.length,
  );
  diversity.excessivelySoftBaseCount = excessivelySoftBaseCount;
  diversity.excessivelySoftBaseRate = rate(
    excessivelySoftBaseCount,
    orderedBases.length,
  );
  diversity.universalCounterForcingBaseCount = universalCounterForcingBaseCount;
  diversity.universalCounterForcingBaseRate = rate(
    universalCounterForcingBaseCount,
    orderedBases.length,
  );
  diversity.meanUniversalRegret = avg(
    universalRegretSum,
    universalRegretCount,
  );

  const diversityByTownHall = Object.fromEntries(
    [...creditsByTownHall.entries()].map(([key, credits]) => [
      key,
      counterMetaDiversitySummary(
        credits,
        orderedBases.filter((base) => `TH${base.townHall}` === key).length,
      ),
    ]),
  );
  const diversityByLayoutFamily = Object.fromEntries(
    [...creditsByLayoutFamily.entries()].map(([key, credits]) => {
      const [thKey, layoutFamily] = key.split('|');
      return [
        key,
        counterMetaDiversitySummary(
          credits,
          orderedBases.filter((base) => (
            `TH${base.townHall}` === thKey
            && baseCounterMetaLayoutFamily(base.archetype) === layoutFamily
          )).length,
        ),
      ];
    }),
  );
  const diversityByLevelProfile = Object.fromEntries(
    [...new Set(orderedBases.map((base) => base.levelProfile))]
      .sort()
      .map((levelProfile) => {
        const rows = Object.values(byBase)
          .filter((base) => base.levelProfile === levelProfile);
        const summary = counterMetaDiversitySummary(
          creditsByLevelProfile.get(levelProfile) || new Map(),
          rows.length,
        );
        const discoveryValidBattleCount = rows.reduce(
          (sum, base) => sum + base.discoveryValidBattleCount,
          0,
        );
        const discoveryWinCount = rows.reduce(
          (sum, base) => sum + base.discoveryWinCount,
          0,
        );
        return [
          levelProfile,
          {
            ...summary,
            discoveryValidBattleCount,
            discoveryWinCount,
            discoveryWinRate: rate(
              discoveryWinCount,
              discoveryValidBattleCount,
            ),
            discoveryZeroCounterBaseCount: rows
              .filter((base) => base.discoveryWinningArmyCount === 0).length,
            totalZeroCounterBaseCount: rows
              .filter((base) => base.totalWinningArmyCount === 0).length,
            twoCounterBaseRate: rate(
              rows.filter((base) => base.discoveryWinningArmyCount >= 2).length,
              rows.length,
            ),
            threeCounterBaseRate: rate(
              rows.filter((base) => base.discoveryWinningArmyCount >= 3).length,
              rows.length,
            ),
            multiFamilyCounterBaseRate: rate(
              rows.filter(
                (base) => base.discoveryWinningRecipeFamilyCount >= 2,
              ).length,
              rows.length,
            ),
            excessivelySoftBaseCount: rows
              .filter((base) => base.robustDiscoveryWinningArmyCount >= 12)
              .length,
            excessivelySoftBaseRate: rate(
              rows.filter(
                (base) => base.robustDiscoveryWinningArmyCount >= 12,
              ).length,
              rows.length,
            ),
          },
        ];
      }),
  );

  return {
    enabled: true,
    requestedBattles,
    totalBattles,
    discoveryBattles: phaseCounts.discovery,
    counterHoldoutBattles: phaseCounts.counterHoldout,
    universalHoldoutBattles: phaseCounts.universalHoldout,
    hardConfirmationBattles: phaseCounts.hardConfirmation,
    invalid,
    testedBaseCount: orderedBases.length,
    armyCountByTownHall,
    availableArmyCountByTownHall,
    discoveryContextsPerCell: COUNTER_META_CONFIRMATION_CONTEXTS,
    expectedDiscoveryCellCount: requiredDiscoveryBattles
      / COUNTER_META_CONFIRMATION_CONTEXTS,
    missingDiscoveryCellCount: missingDiscoveryCells.length,
    discoveryZeroCounterBaseCount,
    zeroCounterBaseCount,
    confirmedBreakabilityFailureCount,
    universalFamily,
    universalDiscoveryBaseWinRate: byArmy[universalFamily]?.discoveryBaseWinRate || 0,
    universalHoldoutWinRate: byArmy[universalFamily]?.universalHoldoutWinRate || 0,
    byCell: Object.fromEntries(
      [...cells.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, cell]) => {
          const serializableCell = { ...cell };
          delete serializableCell.army;
          return [key, serializableCell];
        }),
    ),
    byBase,
    byArmy,
    diversity,
    diversityByTownHall,
    diversityByLayoutFamily,
    diversityByLevelProfile,
  };
}

function selectBaseCounterMetaArmies(armies, limit) {
  const byName = new Map(armies.map((army) => [army.name, army]));
  const selected = [];
  const selectedIds = new Set();
  const add = (army, allowUnderfilled = false) => {
    if (!army || selectedIds.has(army.id) || selected.length >= limit) return;
    if (
      !allowUnderfilled
      && Number(army.slotsUsed || 0) < Number(army.capacity || 0)
    ) return;
    selected.push(army);
    selectedIds.add(army.id);
  };
  for (const army of [...armies]
    .filter((candidate) => candidate.name.startsWith('pure-'))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const troopType = army.name.slice('pure-'.length);
    add(byName.get(`core-${troopType}-filled`) || army);
  }
  for (const name of [
    'balanced',
    'frontline-ranged',
    'melee-pressure',
    'ranged-pressure',
    'air-pressure',
    'support-mix',
    'trap-runner-mix',
    'hero-necro-dragon-mages',
  ]) {
    add(byName.get(name));
  }
  for (const army of [...armies]
    .filter((candidate) => (
      candidate.name.startsWith('core-')
      && candidate.name.endsWith('-filled')
    ))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    add(army);
  }
  for (const army of [...armies].sort((a, b) => (
    Number(b.utilization || 0) - Number(a.utilization || 0)
    || a.name.localeCompare(b.name)
  ))) {
    add(army);
  }
  for (const army of [...armies].sort((a, b) => a.name.localeCompare(b.name))) {
    add(army, true);
  }
  return selected;
}

function baseCounterMetaContext({
  combatDefs,
  base,
  seed,
  phase,
  contextOrdinal,
}) {
  const baseSalt = hashString(base.id);
  const tactics = availableTacticProfiles(combatDefs, base.townHall);
  const contextCount = SPAWN_PROFILES.length * tactics.length;
  const baseOffset = hash32(seed, baseSalt, 0x434f4e54) % contextCount;
  const phaseOffset = {
    discovery: 0,
    counterHoldout: COUNTER_META_CONFIRMATION_CONTEXTS,
    universalHoldout: COUNTER_META_CONFIRMATION_CONTEXTS + 1,
    hardConfirmation: COUNTER_META_CONFIRMATION_CONTEXTS + 2,
  }[phase] ?? 0;
  const spawnProfilesPerFormation = (
    SPAWN_TIMINGS.length * DEPLOYMENT_ORDERS.length
  );
  const contextStride = spawnProfilesPerFormation * tactics.length + 1;
  const contextIndex = (
    baseOffset
    + (
      phaseOffset
      + Math.max(0, Number(contextOrdinal) || 0)
    ) * contextStride
  ) % contextCount;
  return {
    spawnProfile: SPAWN_PROFILES[
      Math.floor(contextIndex / tactics.length) % SPAWN_PROFILES.length
    ],
    tactics: tactics[contextIndex % tactics.length],
  };
}

function createBaseCounterMetaCell(base, army) {
  return {
    baseId: base.id,
    townHall: base.townHall,
    archetype: base.archetype,
    layoutFamily: baseCounterMetaLayoutFamily(base.archetype),
    armyId: army.id,
    armyName: army.name,
    armyFamily: baseCounterMetaArmyFamily(army),
    army,
    discovery: createBaseCounterMetaBucket(),
    counterHoldout: createBaseCounterMetaBucket(),
    universalHoldout: createBaseCounterMetaBucket(),
    hardConfirmation: createBaseCounterMetaBucket(),
    total: createBaseCounterMetaBucket(),
  };
}

function createBaseCounterMetaBucket() {
  return {
    count: 0,
    validCount: 0,
    validWins: 0,
    invalid: 0,
    utilitySum: 0,
    destructionSum: 0,
    townHallDamageSum: 0,
    survivalSum: 0,
    bestAttempt: null,
  };
}

function recordBaseCounterMetaResult(cell, phase, result, context) {
  const phaseBucket = cell[phase];
  recordBaseCounterMetaBucket(phaseBucket, result, context);
  recordBaseCounterMetaBucket(cell.total, result, context);
}

function recordBaseCounterMetaBucket(bucket, result, context) {
  bucket.count += 1;
  if (!result.valid) {
    bucket.invalid += 1;
    return;
  }
  const destruction = rate(result.buildingsDestroyed, result.buildingCount);
  const townHallDamage = 1 - Number(result.townHallHpPct || 0);
  const survival = rate(result.troopsAlive, result.troopsSpawned);
  const utility = (
    (result.win ? 0.50 : 0)
    + destruction * 0.25
    + townHallDamage * 0.20
    + survival * 0.05
  );
  bucket.validCount += 1;
  if (result.win) bucket.validWins += 1;
  bucket.utilitySum += utility;
  bucket.destructionSum += destruction;
  bucket.townHallDamageSum += townHallDamage;
  bucket.survivalSum += survival;
  const attempt = {
    win: !!result.win,
    utility,
    destruction,
    townHallDamage,
    survival,
    townHallHpPct: Number(result.townHallHpPct || 0),
    durationSec: Number(result.durationSec || 0),
    spawnProfile: context.spawnProfile,
    tactics: context.tactics,
  };
  if (
    !bucket.bestAttempt
    || attempt.utility > bucket.bestAttempt.utility
    || (
      attempt.utility === bucket.bestAttempt.utility
      && `${attempt.spawnProfile}|${attempt.tactics}`
        .localeCompare(
          `${bucket.bestAttempt.spawnProfile}|${bucket.bestAttempt.tactics}`,
        ) < 0
    )
  ) {
    bucket.bestAttempt = attempt;
  }
}

function rankBaseCounterMetaCells(cells, phases) {
  return [...cells].sort((a, b) => (
    averageBaseCounterMetaUtility(b, phases)
      - averageBaseCounterMetaUtility(a, phases)
    || baseCounterMetaWinRate(b, phases) - baseCounterMetaWinRate(a, phases)
    || a.army.id.localeCompare(b.army.id)
  ));
}

function averageBaseCounterMetaUtility(cell, phases) {
  if (!cell) return 0;
  const totals = phases.reduce((value, phase) => ({
    utility: value.utility + Number(cell[phase]?.utilitySum || 0),
    count: value.count + Number(cell[phase]?.validCount || 0),
  }), { utility: 0, count: 0 });
  return avg(totals.utility, totals.count);
}

function baseCounterMetaWinRate(cell, phases) {
  if (!cell) return 0;
  const totals = phases.reduce((value, phase) => ({
    wins: value.wins + Number(cell[phase]?.validWins || 0),
    count: value.count + Number(cell[phase]?.validCount || 0),
  }), { wins: 0, count: 0 });
  return rate(totals.wins, totals.count);
}

function selectNearBestCounterCells(winningCells, margin) {
  if (winningCells.length === 0) return [];
  const ranked = rankBaseCounterMetaCells(winningCells, ['discovery']);
  const best = averageBaseCounterMetaUtility(ranked[0], ['discovery']);
  return ranked.filter(
    (cell) => best - averageBaseCounterMetaUtility(cell, ['discovery']) <= margin,
  );
}

function selectUniversalCounterFamily(cells, bases) {
  const rows = new Map();
  for (const cell of cells.values()) {
    if (!rows.has(cell.army.name)) {
      rows.set(cell.army.name, {
        bases: new Set(),
        basesWon: new Set(),
        utility: 0,
        battles: 0,
      });
    }
    const row = rows.get(cell.army.name);
    row.bases.add(cell.baseId);
    if (cell.discovery.validWins > 0) row.basesWon.add(cell.baseId);
    row.utility += cell.discovery.utilitySum;
    row.battles += cell.discovery.validCount;
  }
  return [...rows.entries()]
    .filter(([, row]) => row.bases.size === bases.length)
    .sort((a, b) => (
      b[1].basesWon.size - a[1].basesWon.size
      || avg(b[1].utility, b[1].battles) - avg(a[1].utility, a[1].battles)
      || a[0].localeCompare(b[0])
    ))[0]?.[0] || '';
}

function addCounterMetaCredit(map, key, amount) {
  map.set(key, Number(map.get(key) || 0) + Number(amount || 0));
}

function counterMetaDiversitySummary(credits, baseCount) {
  const creditedBaseCount = [...credits.values()]
    .reduce((sum, credit) => sum + Number(credit || 0), 0);
  const ranked = [...credits.entries()]
    .map(([family, credit]) => ({
      family,
      credit,
      share: rate(credit, creditedBaseCount),
      baseCoverageShare: rate(credit, baseCount),
    }))
    .sort((a, b) => b.credit - a.credit || a.family.localeCompare(b.family));
  const hhi = ranked.reduce((sum, row) => sum + row.share * row.share, 0);
  const entropy = ranked.reduce(
    (sum, row) => (
      row.share > 0 ? sum - row.share * Math.log(row.share) : sum
    ),
    0,
  );
  return {
    baseCount,
    creditedBaseCount,
    creditedBaseRate: rate(creditedBaseCount, baseCount),
    distinctTopCounterFamilies: ranked.length,
    topCounterFamily: ranked[0]?.family || '',
    topCounterShare: ranked[0]?.share || 0,
    topThreeCounterShare: ranked.slice(0, 3)
      .reduce((sum, row) => sum + row.share, 0),
    hhi,
    inverseHhiEffectiveFamilies: hhi > 0 ? 1 / hhi : 0,
    shannonEntropy: entropy,
    normalizedShannonEntropy: ranked.length > 1
      ? entropy / Math.log(ranked.length)
      : 0,
    shannonEffectiveFamilies: Math.exp(entropy),
    rankedFamilies: ranked,
  };
}

function baseCounterMetaArmyFamily(army) {
  const name = String(army?.name || '');
  if (name.startsWith('pure-')) return name;
  const filled = name.match(/^core-(.+)-filled$/);
  if (filled) return `core-${filled[1]}`;
  if (name.includes('trap') || name.includes('mimic')) return 'utility';
  if (name.includes('support') || name.includes('necro')) return 'support';
  if (name.includes('air') || name.includes('dragon')) return 'heavy-air';
  if (name.includes('ranged')) return 'ranged';
  if (name.includes('frontline') || name.includes('melee')) return 'frontline';
  return 'mixed';
}

function baseCounterMetaLayoutFamily(archetype) {
  if (['compact-core', 'defense-ring', 'layered-rings'].includes(archetype)) {
    return 'core-rings';
  }
  if ([
    'asymmetric-left',
    'asymmetric-right',
    'echelon-left',
    'echelon-right',
  ].includes(archetype)) {
    return 'lateral-lanes';
  }
  if ([
    'crossfire',
    'kill-corridor',
    'southern-funnel',
    'trap-lanes',
  ].includes(archetype)) {
    return 'funnel-crossfire';
  }
  if (['diamond', 'split-core', 'wide-spread'].includes(archetype)) {
    return 'distributed-core';
  }
  return 'keep-screen';
}

function analyzeBaseCounterMetaProbe(probe) {
  if (!probe?.enabled) return [];
  const issues = [];
  if (probe.invalid > 0) {
    issues.push({
      severity: 'critical',
      code: 'base-counter-invalid',
      message: `${probe.invalid}/${probe.totalBattles} base-counter meta battles were invalid.`,
    });
  }
  if (probe.missingDiscoveryCellCount > 0) {
    issues.push({
      severity: 'critical',
      code: 'base-counter-matrix-coverage',
      message: `${probe.missingDiscoveryCellCount}/${probe.expectedDiscoveryCellCount} base-army cells lack exactly two discovery contexts.`,
    });
  }
  if (probe.zeroCounterBaseCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-probe-no-win',
      message: `${probe.zeroCounterBaseCount}/${probe.testedBaseCount} layouts have no observed win among the 15 selected compositions and their probe contexts; the separate adaptive breakability gate remains authoritative for counter existence.`,
    });
  }
  if (probe.discoveryZeroCounterBaseCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-discovery-no-win',
      message: `${probe.discoveryZeroCounterBaseCount}/${probe.testedBaseCount} layouts have no win in the paired discovery matrix before any locked holdout.`,
    });
  }
  if (probe.confirmedBreakabilityFailureCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-holdout-failure',
      message: `${probe.confirmedBreakabilityFailureCount}/${probe.testedBaseCount} layouts had neither locked top-two counter win on the unseen holdout deployment.`,
    });
  }
  if (probe.universalDiscoveryBaseWinRate >= 1) {
    issues.push({
      severity: 'critical',
      code: 'base-counter-universal-army',
      message: `${probe.universalFamily} wins against every layout in the paired discovery matrix.`,
    });
  } else if (
    probe.universalHoldoutWinRate > 0.70
    || probe.universalDiscoveryBaseWinRate > 0.85
  ) {
    issues.push({
      severity: 'critical',
      code: 'base-counter-near-universal-army',
      message: `${probe.universalFamily} is too universal: ${pct(probe.universalDiscoveryBaseWinRate)} discovery base coverage and ${pct(probe.universalHoldoutWinRate)} unseen-context wins.`,
    });
  } else if (
    probe.universalHoldoutWinRate > 0.65
    || probe.universalDiscoveryBaseWinRate > 0.80
  ) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-universal-army-pressure',
      message: `${probe.universalFamily} approaches the universal-counter ceiling: ${pct(probe.universalDiscoveryBaseWinRate)} discovery base coverage and ${pct(probe.universalHoldoutWinRate)} unseen-context wins.`,
    });
  }

  const diversity = probe.diversity || {};
  if (diversity.twoCounterBaseRate < 0.95) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-breadth',
      message: `Only ${pct(diversity.twoCounterBaseRate)} of layouts have at least two distinct winning compositions; target is 95%.`,
    });
  }
  if (
    diversity.threeCounterBaseRate < 0.80
    || diversity.multiFamilyCounterBaseRate < 0.80
  ) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-strong-breadth',
      message: `${pct(diversity.threeCounterBaseRate)} of layouts have three winning compositions and ${pct(diversity.multiFamilyCounterBaseRate)} have counters from two recipe families; both targets are 80%.`,
    });
  }
  if (diversity.excessivelySoftBaseRate > 0.10) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-excessively-soft',
      message: `${pct(diversity.excessivelySoftBaseRate)} of layouts lose to at least 12/15 selected compositions in both paired discovery contexts; ceiling is 10%. Review the level-profile strata before combat tuning.`,
    });
  } else if (diversity.excessivelySoftBaseCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-soft-layouts',
      message: `${diversity.excessivelySoftBaseCount} layouts lose to at least 12/15 selected compositions in both paired discovery contexts.`,
    });
  }
  if (
    diversity.topCounterShare > 0.30
    || diversity.topThreeCounterShare > 0.65
    || diversity.inverseHhiEffectiveFamilies < 5
  ) {
    issues.push({
      severity: 'critical',
      code: 'base-counter-meta-concentration',
      message: `Counter concentration is excessive: top-1 ${pct(diversity.topCounterShare)}, top-3 ${pct(diversity.topThreeCounterShare)}, inverse-HHI effective families ${formatNumber(diversity.inverseHhiEffectiveFamilies)}.`,
    });
  } else if (
    diversity.topCounterShare > 0.18
    || diversity.topThreeCounterShare > 0.45
    || diversity.inverseHhiEffectiveFamilies < 8
  ) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-meta-diversity',
      message: `Counter diversity misses the authored target: top-1 ${pct(diversity.topCounterShare)}, top-3 ${pct(diversity.topThreeCounterShare)}, inverse-HHI effective families ${formatNumber(diversity.inverseHhiEffectiveFamilies)}.`,
    });
  }
  if (
    diversity.universalCounterForcingBaseRate < 0.25
    || diversity.meanUniversalRegret < 0.10
  ) {
    issues.push({
      severity: 'warning',
      code: 'base-counter-scouting-value',
      message: `Only ${pct(diversity.universalCounterForcingBaseRate)} of layouts force the universal army to lose while another wins; mean base-specific regret is ${formatNumber(diversity.meanUniversalRegret)}.`,
    });
  }
  for (const [townHall, row] of Object.entries(probe.diversityByTownHall || {})) {
    if (row.topCounterShare > 0.30 || row.distinctTopCounterFamilies < 5) {
      issues.push({
        severity: 'critical',
        code: 'base-counter-town-hall-concentration',
        message: `${townHall} top counter ${row.topCounterFamily} owns ${pct(row.topCounterShare)} of near-best credit across only ${row.distinctTopCounterFamilies} families.`,
      });
    } else if (row.topCounterShare > 0.20 || row.topThreeCounterShare > 0.50) {
      issues.push({
        severity: 'warning',
        code: 'base-counter-town-hall-diversity',
        message: `${townHall} top-1/top-3 near-best concentration is ${pct(row.topCounterShare)}/${pct(row.topThreeCounterShare)}.`,
      });
    }
  }
  return issues;
}

function selectProbeBases(bases, requested, seed) {
  if (bases.length === 0 || requested <= 0) return [];
  const ordered = shuffledCopy(bases, seed);
  return ordered.slice(0, Math.min(requested, ordered.length));
}

function runBreakabilityProbe({
  enabledPoliciesPerTownHall,
  calibrationBasesPerTownHall,
  nftRarity,
  verifyReplay,
  combatDefs,
  evaluationRecords,
  attackPolicies,
  bases,
  townHalls,
  catalog,
  seed,
  startIndex,
  verbose,
}) {
  if (enabledPoliciesPerTownHall <= 0) {
    return {
      enabled: false,
      policiesPerTownHall: 0,
      nftRarity,
      candidatePolicyCount: 0,
      selectedPolicyIdsByTownHall: {},
      calibrationBaseIdsByTownHall: {},
      calibrationBattles: 0,
      battles: 0,
      rescueBattles: 0,
      adaptiveRescueBattles: 0,
      totalBattles: 0,
      invalid: 0,
      generatedBaseCount: 0,
      testedBaseCount: 0,
      untestedBaseCount: 0,
      untestedBases: [],
      invalidOnlyBaseCount: 0,
      invalidOnlyBases: [],
      initialUnbeatenBaseCount: 0,
      rescuedBaseCount: 0,
      focusedRescuedBaseCount: 0,
      adaptiveRescuedBaseCount: 0,
      rescuedBases: [],
      adaptivePolicies: [],
      unbeatenBaseCount: 0,
      unbeatenBases: [],
      byBase: {},
      byPolicy: {},
      calibrationByPolicy: {},
      bestAttemptByBase: {},
      bestAttemptByBaseArmy: {},
    };
  }
  const calibrationBases = selectEliteBases(
    evaluationRecords,
    bases,
    townHalls,
    calibrationBasesPerTownHall,
  );
  const calibrationByPolicy = new Map();
  const candidatePoliciesBySignature = new Map();
  for (const policy of attackPolicies) {
    const signature = breakabilityPolicySignature(policy);
    if (!candidatePoliciesBySignature.has(signature)) {
      candidatePoliciesBySignature.set(signature, policy);
    }
  }
  const candidatePolicies = [...candidatePoliciesBySignature.values()];
  let calibrationBattles = 0;
  let calibrationInvalid = 0;
  for (const base of calibrationBases) {
    const candidates = candidatePolicies.filter(
      (policy) => policy.townHall === base.townHall,
    );
    for (let policyIndex = 0; policyIndex < candidates.length; policyIndex += 1) {
      const policy = candidates[policyIndex];
      const scenario = makeScenario({
        index: startIndex + calibrationBattles,
        base,
        attackerTh: base.townHall,
        army: policy.army,
        spawnProfile: policy.spawnProfile,
        levelProfile: policy.levelProfile,
        tactics: policy.tactics,
        policyId: policy.id,
        nftRarity,
        defenderWard: 0,
        experimentCohort: 'breakability-calibration',
        troopLevelSeed: breakabilityPairSeed(seed, base, policy),
        catalog,
        seed: breakabilityPairSeed(seed, base, policy),
      });
      const result = runScenario(
        verifyReplay,
        combatDefs,
        scenario,
        verbose,
        buildAttackActions(scenario, combatDefs),
      );
      recordBucket(mapBucket(calibrationByPolicy, policy.id), result);
      calibrationBattles += 1;
      if (!result.valid) calibrationInvalid += 1;
    }
  }
  const policyById = new Map(candidatePolicies.map((policy) => [policy.id, policy]));
  const selectedPolicies = townHalls.flatMap((townHall) => (
    [...calibrationByPolicy.entries()]
      .filter(([id, bucket]) => (
        policyById.get(id)?.townHall === townHall
          && bucket.validCount >= Math.min(
          calibrationBasesPerTownHall,
          calibrationBases.filter((base) => base.townHall === townHall).length,
        )
      ))
      .sort((a, b) => (
        breakabilityAttackScore(b[1]) - breakabilityAttackScore(a[1])
        || a[0].localeCompare(b[0])
      ))
      .slice(0, enabledPoliciesPerTownHall)
      .map(([id]) => policyById.get(id))
  ));
  const policiesByTownHall = new Map();
  for (const townHall of townHalls) {
    policiesByTownHall.set(
      townHall,
      selectedPolicies.filter((policy) => policy.townHall === townHall),
    );
  }
  const byBase = new Map();
  const byPolicy = new Map();
  const bestAttemptByBase = new Map();
  const bestAttemptByBaseArmy = new Map();
  let battles = 0;
  let invalid = 0;
  const sortedBases = [...bases].sort((a, b) => a.id.localeCompare(b.id));
  for (const base of sortedBases) {
    const baseBucket = mapBucket(byBase, base.id);
    const policyPool = policiesByTownHall.get(base.townHall) || [];
    for (let policyIndex = 0; policyIndex < policyPool.length; policyIndex += 1) {
      const policy = policyPool[policyIndex];
      const scenario = makeScenario({
        index: startIndex + calibrationBattles + battles,
        base,
        attackerTh: base.townHall,
        army: policy.army,
        spawnProfile: policy.spawnProfile,
        levelProfile: policy.levelProfile,
        tactics: policy.tactics,
        policyId: policy.id,
        nftRarity,
        defenderWard: 0,
        experimentCohort: 'breakability-probe',
        troopLevelSeed: breakabilityPairSeed(seed, base, policy),
        catalog,
        seed: breakabilityPairSeed(seed, base, policy),
      });
      const result = runScenario(
        verifyReplay,
        combatDefs,
        scenario,
        verbose,
        buildAttackActions(scenario, combatDefs),
      );
      recordBucket(baseBucket, result);
      recordBucket(mapBucket(byPolicy, policy.id), result);
      recordBestBreakabilityAttempt(
        bestAttemptByBase,
        base,
        policy,
        result,
        'elite-gate',
      );
      recordBestBreakabilityAttempt(
        bestAttemptByBaseArmy,
        base,
        policy,
        result,
        'elite-gate',
        `${base.id}|${breakabilityArmySignature(policy)}`,
      );
      battles += 1;
      if (!result.valid) invalid += 1;
    }
  }
  const baseById = new Map(bases.map((base) => [base.id, base]));
  const initialUnbeatenBaseEntries = [...byBase.entries()]
    .filter(([, bucket]) => bucket.validWins === 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  let rescueBattles = 0;
  let rescueInvalid = 0;
  const rescuedBases = [];
  for (const [baseId] of initialUnbeatenBaseEntries) {
    const base = baseById.get(baseId);
    if (!base) continue;
    const selectedPolicyIds = new Set(
      (policiesByTownHall.get(base.townHall) || []).map((policy) => policy.id),
    );
    const rescueCandidates = candidatePolicies
      .filter((policy) => (
        policy.townHall === base.townHall
        && !selectedPolicyIds.has(policy.id)
      ))
      .sort((a, b) => (
        breakabilityAttackScore(calibrationByPolicy.get(b.id) || createBucket())
        - breakabilityAttackScore(calibrationByPolicy.get(a.id) || createBucket())
        || a.id.localeCompare(b.id)
      ));
    for (let policyIndex = 0; policyIndex < rescueCandidates.length; policyIndex += 1) {
      const policy = rescueCandidates[policyIndex];
      const scenario = makeScenario({
        index: startIndex + calibrationBattles + battles + rescueBattles,
        base,
        attackerTh: base.townHall,
        army: policy.army,
        spawnProfile: policy.spawnProfile,
        levelProfile: policy.levelProfile,
        tactics: policy.tactics,
        policyId: policy.id,
        nftRarity,
        defenderWard: 0,
        experimentCohort: 'breakability-rescue',
        troopLevelSeed: breakabilityPairSeed(seed, base, policy),
        catalog,
        seed: breakabilityPairSeed(seed, base, policy),
      });
      const result = runScenario(
        verifyReplay,
        combatDefs,
        scenario,
        verbose,
        buildAttackActions(scenario, combatDefs),
      );
      recordBucket(mapBucket(byBase, base.id), result);
      recordBucket(mapBucket(byPolicy, policy.id), result);
      recordBestBreakabilityAttempt(
        bestAttemptByBase,
        base,
        policy,
        result,
        'focused-rescue',
      );
      recordBestBreakabilityAttempt(
        bestAttemptByBaseArmy,
        base,
        policy,
        result,
        'focused-rescue',
        `${base.id}|${breakabilityArmySignature(policy)}`,
      );
      rescueBattles += 1;
      if (!result.valid) rescueInvalid += 1;
      if (result.valid && result.win) {
        rescuedBases.push({
          id: base.id,
          townHall: base.townHall,
          archetype: base.archetype || '',
          levelProfile: base.levelProfile || '',
          policyId: policy.id,
          rescueBattle: policyIndex + 1,
          phase: 'candidate-rescue',
        });
        break;
      }
    }
  }
  let adaptiveRescueBattles = 0;
  let adaptiveRescueInvalid = 0;
  const adaptivePolicies = [];
  const candidateSignatures = new Set(
    candidatePolicies.map((policy) => breakabilityPolicySignature(policy)),
  );
  const candidateUnbeatenBaseIds = [...byBase.entries()]
    .filter(([, bucket]) => bucket.validCount > 0 && bucket.validWins === 0)
    .map(([baseId]) => baseId)
    .sort((a, b) => a.localeCompare(b));
  for (const baseId of candidateUnbeatenBaseIds) {
    const base = baseById.get(baseId);
    if (!base) continue;
    const sourcePolicies = [...bestAttemptByBaseArmy.entries()]
      .filter(([key]) => key.startsWith(`${baseId}|`))
      .map(([, attempt]) => ({
        attempt,
        policy: policyById.get(attempt.policyId),
      }))
      .filter(({ policy }) => !!policy)
      .sort((a, b) => (
        b.attempt.score - a.attempt.score
        || a.attempt.policyId.localeCompare(b.attempt.policyId)
      ))
      .slice(0, BREAKABILITY_ADAPTIVE_ARMY_LIMIT)
      .map(({ policy }) => policy);
    if (sourcePolicies.length === 0) continue;
    let adaptiveAttempt = 0;
    let adaptiveExecutedForBase = 0;
    let resolved = false;
    for (const sourcePolicy of sourcePolicies) {
      const orderedTactics = [
        sourcePolicy.tactics,
        ...availableTacticProfiles(combatDefs, base.townHall)
          .filter((tactics) => tactics !== sourcePolicy.tactics),
      ];
      const sourceSpawnId = sourcePolicy.spawnProfile?.id
        || String(sourcePolicy.spawnProfile || '');
      const orderedSpawns = [
        sourcePolicy.spawnProfile,
        ...SPAWN_PROFILES.filter((spawnProfile) => (
          (spawnProfile?.id || String(spawnProfile || '')) !== sourceSpawnId
        )),
      ];
      const adaptiveTroopLevelSeed = breakabilityPairSeed(
        seed,
        base,
        sourcePolicy,
      );
      for (const tactics of orderedTactics) {
        for (const spawnProfile of orderedSpawns) {
          const policy = {
            id: `adaptive-${base.id}-${String(adaptiveAttempt + 1).padStart(4, '0')}`,
            townHall: base.townHall,
            army: sourcePolicy.army,
            spawnProfile,
            levelProfile: sourcePolicy.levelProfile,
            tactics,
            nftRarity,
          };
          adaptiveAttempt += 1;
          if (candidateSignatures.has(breakabilityPolicySignature(policy))) continue;
          adaptiveExecutedForBase += 1;
          adaptivePolicies.push(policy);
          const scenario = makeScenario({
            index: (
              startIndex
              + calibrationBattles
              + battles
              + rescueBattles
              + adaptiveRescueBattles
            ),
            base,
            attackerTh: base.townHall,
            army: policy.army,
            spawnProfile: policy.spawnProfile,
            levelProfile: policy.levelProfile,
            tactics: policy.tactics,
            policyId: policy.id,
            nftRarity,
            defenderWard: 0,
            experimentCohort: 'breakability-adaptive-rescue',
            troopLevelSeed: adaptiveTroopLevelSeed,
            catalog,
            seed: breakabilityPairSeed(seed, base, policy),
          });
          const result = runScenario(
            verifyReplay,
            combatDefs,
            scenario,
            verbose,
            buildAttackActions(scenario, combatDefs),
          );
          recordBucket(mapBucket(byBase, base.id), result);
          recordBucket(mapBucket(byPolicy, policy.id), result);
          recordBestBreakabilityAttempt(
            bestAttemptByBase,
            base,
            policy,
            result,
            'adaptive-counter-search',
          );
          recordBestBreakabilityAttempt(
            bestAttemptByBaseArmy,
            base,
            policy,
            result,
            'adaptive-counter-search',
            `${base.id}|${breakabilityArmySignature(policy)}`,
          );
          adaptiveRescueBattles += 1;
          if (!result.valid) adaptiveRescueInvalid += 1;
          if (result.valid && result.win) {
            rescuedBases.push({
              id: base.id,
              townHall: base.townHall,
              archetype: base.archetype || '',
              levelProfile: base.levelProfile || '',
              policyId: policy.id,
              rescueBattle: adaptiveExecutedForBase,
              phase: 'adaptive-counter-search',
            });
            resolved = true;
            break;
          }
        }
        if (resolved) break;
      }
      if (resolved) break;
    }
  }
  const unbeatenBases = [...byBase.entries()]
    .filter(([, bucket]) => bucket.validCount > 0 && bucket.validWins === 0)
    .map(([id, bucket]) => {
      const base = baseById.get(id) || {};
      return {
        id,
        townHall: base.townHall || 0,
        archetype: base.archetype || '',
        levelProfile: base.levelProfile || '',
        battles: bucket.count,
        validBattles: bucket.validCount,
      };
    });
  const untestedBases = [...byBase.entries()]
    .filter(([, bucket]) => bucket.count === 0)
    .map(([id]) => {
      const base = baseById.get(id) || {};
      return {
        id,
        townHall: base.townHall || 0,
        archetype: base.archetype || '',
        levelProfile: base.levelProfile || '',
      };
    });
  const invalidOnlyBases = [...byBase.entries()]
    .filter(([, bucket]) => bucket.count > 0 && bucket.validCount === 0)
    .map(([id, bucket]) => {
      const base = baseById.get(id) || {};
      return {
        id,
        townHall: base.townHall || 0,
        archetype: base.archetype || '',
        levelProfile: base.levelProfile || '',
        battles: bucket.count,
      };
    });
  const classifiedInitialBases = (
    rescuedBases.length
    + unbeatenBases.length
    + untestedBases.length
    + invalidOnlyBases.length
  );
  if (classifiedInitialBases !== initialUnbeatenBaseEntries.length) {
    throw new Error(
      'Breakability classification invariant failed: '
      + `${initialUnbeatenBaseEntries.length} initial != `
      + `${rescuedBases.length} rescued + ${unbeatenBases.length} unbeaten + `
      + `${untestedBases.length} untested + ${invalidOnlyBases.length} invalid-only.`,
    );
  }
  return {
    enabled: true,
    policiesPerTownHall: enabledPoliciesPerTownHall,
    nftRarity,
    candidatePolicyCount: candidatePolicies.length,
    selectedPolicyIdsByTownHall: Object.fromEntries(
      [...policiesByTownHall.entries()].map(([townHall, policies]) => [
        `TH${townHall}`,
        policies.map((policy) => policy.id),
      ]),
    ),
    calibrationBaseIdsByTownHall: Object.fromEntries(
      townHalls.map((townHall) => [
        `TH${townHall}`,
        calibrationBases
          .filter((base) => base.townHall === townHall)
          .map((base) => base.id),
      ]),
    ),
    calibrationBattles,
    battles,
    rescueBattles,
    adaptiveRescueBattles,
    totalBattles: (
      calibrationBattles
      + battles
      + rescueBattles
      + adaptiveRescueBattles
    ),
    invalid: (
      calibrationInvalid
      + invalid
      + rescueInvalid
      + adaptiveRescueInvalid
    ),
    generatedBaseCount: bases.length,
    testedBaseCount: bases.length - untestedBases.length - invalidOnlyBases.length,
    untestedBaseCount: untestedBases.length,
    untestedBases,
    invalidOnlyBaseCount: invalidOnlyBases.length,
    invalidOnlyBases,
    initialUnbeatenBaseCount: initialUnbeatenBaseEntries.length,
    rescuedBaseCount: rescuedBases.length,
    focusedRescuedBaseCount: rescuedBases
      .filter((base) => base.phase === 'candidate-rescue')
      .length,
    adaptiveRescuedBaseCount: rescuedBases
      .filter((base) => base.phase === 'adaptive-counter-search')
      .length,
    rescuedBases,
    adaptivePolicies,
    unbeatenBaseCount: unbeatenBases.length,
    unbeatenBases,
    byBase: mapToObject(byBase),
    byPolicy: mapToObject(byPolicy),
    calibrationByPolicy: mapToObject(calibrationByPolicy),
    bestAttemptByBase: mapToObject(bestAttemptByBase),
    bestAttemptByBaseArmy: mapToObject(bestAttemptByBaseArmy),
  };
}

function breakabilityAttackScore(bucket) {
  return (
    rate(bucket.validWins, bucket.validCount) * 100
    + rate(bucket.validBuildingsDestroyed, bucket.validBuildingCount) * 15
    - avg(bucket.validTownHallHpPct, bucket.validCount) * 5
  );
}

function breakabilityArmySignature(policy) {
  return policy.army?.units?.join(',') || policy.army?.id || '';
}

function breakabilityPolicySignature(policy) {
  const spawnProfileId = policy.spawnProfile?.id
    || String(policy.spawnProfile || '');
  return [
    policy.townHall,
    breakabilityArmySignature(policy),
    spawnProfileId,
    policy.levelProfile,
    policy.tactics,
  ].join('|');
}

function breakabilityPairSeed(seed, base, policy) {
  return hash32(
    seed,
    0x42524b4c,
    hashString(base.id),
    hashString(policy.id),
  );
}

function recordBestBreakabilityAttempt(
  bestAttemptByBase,
  base,
  policy,
  result,
  phase,
  key = base.id,
) {
  if (!result.valid) return;
  const destruction = rate(result.buildingsDestroyed, result.buildingCount);
  const townHallHpPct = Number(result.townHallHpPct || 0);
  const troopSurvival = rate(result.troopsAlive, result.troopsSpawned);
  const score = (
    (result.win ? 1_000_000 : 0)
    + (1 - townHallHpPct) * 10_000
    + destruction * 1_000
    + troopSurvival * 100
  );
  const current = bestAttemptByBase.get(key);
  if (
    current
    && (
      current.score > score
      || (current.score === score && current.policyId.localeCompare(policy.id) <= 0)
    )
  ) {
    return;
  }
  bestAttemptByBase.set(key, {
    policyId: policy.id,
    phase,
    score,
    win: !!result.win,
    destruction,
    townHallHpPct,
    troopsAlive: Number(result.troopsAlive || 0),
    troopsSpawned: Number(result.troopsSpawned || 0),
    durationSec: Number(result.durationSec || 0),
  });
}

function attackLevelForProfile({ troop, attackerTh, levelProfile, seed }) {
  const unlockedMax = Math.max(1, Math.min(troop.maxLevel, attackerTh));
  if (levelProfile === 'low') return Math.max(1, unlockedMax - 2);
  if (levelProfile === 'mid') return Math.max(1, Math.ceil(unlockedMax * 0.65));
  if (levelProfile === 'maxed') return unlockedMax;
  return 1 + Math.floor(noise01(seed, attackerTh, troop.slotCost) * unlockedMax);
}

function runScenario(
  verifyReplay,
  combatDefs,
  scenario,
  verbose,
  actions = null,
  includeParityDiagnostics = false,
) {
  const replayActions = actions || buildAttackActions(scenario, combatDefs);
  const simulation = withMutedConsole(!verbose, () => verifyReplay({
    defenderBuildings: scenario.base.buildings,
    actions: replayActions,
    claimedResult: 'defeat',
    gridConfigs: combatDefs.CANONICAL_GRID_CONFIGS,
    serverTroopLevels: scenario.troopLevels,
    serverNftRarities: scenario.attackerNftRarities || {},
    serverShipLevel: discoverShipLevelForTownHall(combatDefs, scenario.attackerTownHall),
    defenderAltarLevels: scenario.defenderAltarLevels || {},
    combatSnapshotVersion: 2,
    combatRulesVersion: combatDefs.FLAMETHROWER_COMBAT_RULES_VERSION,
    debugTrace: false,
  }));
  const parityDiagnostics = includeParityDiagnostics
    ? {
        simulationEndReason: String(simulation._simulationEndReason || ''),
        buildingHPs: Array.isArray(simulation._buildingHPs)
          ? simulation._buildingHPs.map((building) => ({ ...building }))
          : [],
        troopEndState: Array.isArray(simulation._troopEndState)
          ? simulation._troopEndState.map((troop) => ({ ...troop }))
          : [],
        aliveTroopDetails: Array.isArray(simulation._aliveTroopDetails)
          ? simulation._aliveTroopDetails.map((troop) => ({ ...troop }))
          : [],
        aliveGuardDetails: Array.isArray(simulation._aliveGuardDetails)
          ? simulation._aliveGuardDetails.map((guard) => ({ ...guard }))
          : [],
      }
    : {};
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
    ...parityDiagnostics,
  };
}

function buildAttackActions(scenario, combatDefs) {
  const attackGrid = combatDefs.CANONICAL_GRID_CONFIGS?.[2];
  if (!attackGrid) throw new Error('Attack grid 2 is missing from canonical combat config.');
  const deployments = orderUnitsForSpawn(
    scenario.army.units,
    scenario.spawnProfile,
  );
  const shipLevel = discoverShipLevelForTownHall(
    combatDefs,
    scenario.attackerTownHall,
  );
  const actions = [];
  for (let index = 0; index < deployments.length; index += 1) {
    const deployment = deployments[index];
    const cell = spawnCellForProfile(
      scenario.spawnProfile,
      index,
      deployments.length,
      attackGrid,
      deployment,
    );
    const point = gridToWorld(cell.x, cell.z, 1, 1, attackGrid);
    actions.push({
      type: 'deploy_troop',
      troop: ['demon_king', 'fire_dragon'].includes(deployment.type)
        ? `${deployment.type}:R${strRarity(
          scenario.attackerNftRarities?.[deployment.type],
        )}`
        : deployment.type,
      troopLevel: scenario.troopLevels[deployment.type] || 1,
      shipLevel,
      x: point.x,
      z: point.z,
      t: spawnTimeForProfile(
        scenario.spawnProfile,
        index,
        deployments.length,
        deployment,
      ),
      deploy_index: index,
    });
  }
  const highValue = scenario.base.buildings
    .filter((building) => (
      ['mortar', 'mage_tower', 'cannon', 'archer_tower', 'turret', 'town_hall']
        .includes(building.type)
    ))
    .sort((a, b) => (
      ['mortar', 'mage_tower', 'cannon', 'archer_tower', 'turret', 'town_hall']
        .indexOf(a.type)
      - ['mortar', 'mage_tower', 'cannon', 'archer_tower', 'turret', 'town_hall']
        .indexOf(b.type)
    ));
  const townHall = scenario.base.buildings.find((building) => building.type === 'town_hall');
  const mainGrid = combatDefs.CANONICAL_GRID_CONFIGS?.[0];
  const dangerPoint = highValue[0] && mainGrid
    ? gridToWorld(
      highValue[0].grid_x,
      highValue[0].grid_z,
      highValue[0].size?.[0] || 2,
      highValue[0].size?.[1] || 2,
      mainGrid,
    )
    : { x: actions[0]?.x || 0, z: actions[0]?.z || 0 };
  const entryPoint = {
    x: avg(actions.slice(0, 4).reduce((sum, action) => sum + action.x, 0), Math.min(4, actions.length)),
    z: avg(actions.slice(0, 4).reduce((sum, action) => sum + action.z, 0), Math.min(4, actions.length)),
  };

  if (['cannon-focus', 'cannon-rally', 'cannon-medkit'].includes(scenario.tactics)) {
    highValue.slice(0, scenario.tactics === 'cannon-focus' ? 2 : 1)
      .forEach((building, index) => {
      actions.push({
        type: 'cannon_fire',
        buildingId: building.id,
        t: 0.25 + index * 1.05,
      });
    });
  }
  if (['cannon-rally', 'rally-core', 'rally-rage'].includes(scenario.tactics) && townHall) {
    actions.push({
      type: 'rally_drop',
      buildingId: townHall.id,
      t: 3.5,
      flight_time: 0,
    });
  }
  if (['freeze-defense', 'freeze-rage', 'freeze-barrel'].includes(scenario.tactics)) {
    actions.push({ type: 'freeze_drop', ...dangerPoint, t: 0.55 });
  }
  if (['rage-entry', 'freeze-rage', 'rally-rage'].includes(scenario.tactics)) {
    actions.push({ type: 'rage_drop', ...entryPoint, t: 0.65 });
  }
  if (['medkit-entry', 'cannon-medkit'].includes(scenario.tactics)) {
    actions.push({ type: 'medkit_drop', ...entryPoint, t: 1.4 });
  }
  if (['skeleton-barrel', 'freeze-barrel'].includes(scenario.tactics) && highValue[0]) {
    actions.push({
      type: 'skeleton_barrel_fire',
      buildingId: highValue[0].id,
      t: 0.75,
    });
  }
  return actions.sort((a, b) => Number(a.t || 0) - Number(b.t || 0));
}

function parseSpawnProfile(profile) {
  const legacy = {
    'wide-line': {
      formation: 'wide-line',
      timing: 'rapid',
      order: 'roster-order',
      legacyProfile: 'wide-line',
    },
    'center-push': {
      formation: 'center-column',
      timing: 'rapid',
      order: 'roster-order',
      legacyProfile: 'center-push',
    },
    'left-flank': {
      formation: 'left-flank',
      timing: 'rapid',
      order: 'roster-order',
      legacyProfile: 'left-flank',
    },
    'right-flank': {
      formation: 'right-flank',
      timing: 'rapid',
      order: 'roster-order',
      legacyProfile: 'right-flank',
    },
    'dual-flank': {
      formation: 'dual-flank',
      timing: 'rapid',
      order: 'roster-order',
      legacyProfile: 'dual-flank',
    },
    'staggered-waves': {
      formation: 'wide-line',
      timing: 'three-waves',
      order: 'roster-order',
      legacyProfile: 'staggered-waves',
    },
  };
  if (legacy[profile]) return legacy[profile];
  const [formation, timing, order] = String(profile || '').split('__');
  if (
    !SPAWN_FORMATIONS.includes(formation)
    || !SPAWN_TIMINGS.includes(timing)
    || !DEPLOYMENT_ORDERS.includes(order)
  ) {
    throw new Error(`Unknown spawn profile: ${profile}`);
  }
  return { formation, timing, order };
}

function formatSpawnProfile({ formation, timing, order }) {
  return `${formation}__${timing}__${order}`;
}

function validateSpawnMechanicCatalog() {
  if (SPAWN_PROFILES.length !== 100 || new Set(SPAWN_PROFILES).size !== 100) {
    throw new Error(
      `Spawn mechanic catalog must contain exactly 100 unique profiles; got ${SPAWN_PROFILES.length}.`,
    );
  }
  const grid = { grid_width: 27, grid_height: 5 };
  const roster = [
    'mage',
    'archer',
    'knight',
    'demon_king',
    'necromancer',
    'mimic',
    'fire_dragon',
    'pea_shooter',
  ];
  for (const profile of SPAWN_PROFILES) {
    if (formatSpawnProfile(parseSpawnProfile(profile)) !== profile) {
      throw new Error(`Spawn mechanic does not round-trip: ${profile}`);
    }
    for (const count of [1, 8, 23, 45]) {
      const units = Array.from(
        { length: count },
        (_, index) => roster[index % roster.length],
      );
      const deployments = orderUnitsForSpawn(units, profile);
      let previousTime = -Infinity;
      for (let index = 0; index < deployments.length; index += 1) {
        const cell = spawnCellForProfile(
          profile,
          index,
          deployments.length,
          grid,
          deployments[index],
        );
        if (
          cell.x < 0
          || cell.x >= grid.grid_width
          || cell.z < 0
          || cell.z >= grid.grid_height
        ) {
          throw new Error(
            `Spawn mechanic ${profile} emitted out-of-bounds cell ${cell.x},${cell.z}.`,
          );
        }
        const time = spawnTimeForProfile(
          profile,
          index,
          deployments.length,
          deployments[index],
        );
        if (time < previousTime) {
          throw new Error(
            `Spawn mechanic ${profile} reverses deploy order at index ${index}.`,
          );
        }
        previousTime = time;
      }
    }
  }
}

function deploymentRole(type) {
  return DEPLOYMENT_ROLE_BY_TROOP[type] || 'damage';
}

function orderUnitsForSpawn(units, profile) {
  const { order } = parseSpawnProfile(profile);
  const deployments = units.map((type, originalIndex) => ({
    type,
    originalIndex,
    role: deploymentRole(type),
  }));
  if (order === 'tank-front-support-rear') {
    const rolePriority = {
      tank: 0,
      attrition: 0,
      frontline: 1,
      utility: 1,
      damage: 2,
      support: 3,
    };
    deployments.sort((a, b) => (
      (rolePriority[a.role] ?? 2) - (rolePriority[b.role] ?? 2)
      || a.originalIndex - b.originalIndex
    ));
  }
  const roleCounts = new Map();
  for (const deployment of deployments) {
    roleCounts.set(
      deployment.role,
      (roleCounts.get(deployment.role) || 0) + 1,
    );
  }
  const roleCursors = new Map();
  return deployments.map((deployment) => {
    const roleIndex = roleCursors.get(deployment.role) || 0;
    roleCursors.set(deployment.role, roleIndex + 1);
    return {
      ...deployment,
      roleIndex,
      roleCount: roleCounts.get(deployment.role) || 1,
    };
  });
}

function spawnCellForProfile(profile, index, count, grid, deployment = null) {
  const { formation, order, legacyProfile } = parseSpawnProfile(profile);
  const width = Math.max(1, Math.trunc(Number(grid.grid_width) || 27));
  const height = Math.max(1, Math.trunc(Number(grid.grid_height) || 5));
  const safeX = (value) => clampInt(value, 0, width - 1);
  const safeZ = (value) => clampInt(value, 0, height - 1);
  if (legacyProfile === 'center-push') {
    return {
      x: safeX(Math.floor(width / 2) + (index % 5) - 2),
      z: safeZ(Math.floor(index / 15)),
    };
  }
  if (legacyProfile === 'left-flank') {
    return {
      x: safeX(2 + (index % Math.max(2, Math.floor(width * 0.25)))),
      z: safeZ(Math.floor(index / 12)),
    };
  }
  if (legacyProfile === 'right-flank') {
    return {
      x: safeX(width - 3 - (index % Math.max(2, Math.floor(width * 0.25)))),
      z: safeZ(Math.floor(index / 12)),
    };
  }
  if (legacyProfile === 'dual-flank') {
    const left = index % 2 === 0;
    const lane = Math.floor(index / 2) % Math.max(2, Math.floor(width * 0.20));
    return {
      x: safeX(left ? 2 + lane : width - 3 - lane),
      z: safeZ(Math.floor(index / 18)),
    };
  }
  if (legacyProfile === 'staggered-waves') {
    const perWave = Math.max(1, Math.ceil(count / 3));
    const withinWave = index % perWave;
    return {
      x: safeX(1 + Math.floor((withinWave + 0.5) * (width - 2) / perWave)),
      z: safeZ(Math.floor(index / perWave)),
    };
  }
  if (legacyProfile === 'wide-line') {
    return {
      x: safeX(1 + Math.floor((index + 0.5) * (width - 2) / Math.max(1, count))),
      z: safeZ(index % 2),
    };
  }
  const center = Math.floor(width / 2);
  const normalized = (index + 0.5) / Math.max(1, count);
  const flankWidth = Math.max(3, Math.floor(width * 0.28));
  const row = Math.floor(index / Math.max(1, Math.ceil(count / height)));
  const centerOffsets = [0, -1, 1, -2, 2, -3, 3, -4, 4];
  let x = center;
  let z = row;

  if (formation === 'wide-line') {
    x = 1 + Math.floor(normalized * Math.max(1, width - 2));
    z = index % Math.min(2, height);
  } else if (formation === 'center-column') {
    x = center + centerOffsets[index % centerOffsets.length];
    z = Math.floor(index / centerOffsets.length);
  } else if (formation === 'left-flank') {
    x = 1 + (index % flankWidth);
    z = Math.floor(index / flankWidth);
  } else if (formation === 'right-flank') {
    x = width - 2 - (index % flankWidth);
    z = Math.floor(index / flankWidth);
  } else if (formation === 'dual-flank') {
    const lane = Math.floor(index / 2) % flankWidth;
    x = index % 2 === 0 ? 1 + lane : width - 2 - lane;
    z = Math.floor(index / (flankWidth * 2));
  } else if (formation === 'three-lane') {
    const lanes = [
      Math.floor(width * 0.18),
      center,
      Math.floor(width * 0.82),
    ];
    x = lanes[index % lanes.length]
      + (Math.floor(index / lanes.length) % 3) - 1;
    z = Math.floor(index / (lanes.length * 3));
  } else if (formation === 'diamond') {
    const diamondOffsets = [0, -2, 2, -4, 4, -6, 6, -3, 3];
    x = center + diamondOffsets[index % diamondOffsets.length];
    z = Math.floor(index / diamondOffsets.length)
      + (index % diamondOffsets.length === 0 ? 0 : 1);
  } else if (formation === 'vanguard-wedge') {
    const wedgeRow = Math.floor(Math.sqrt(index));
    const rowStart = wedgeRow * wedgeRow;
    x = center + (index - rowStart) - wedgeRow;
    z = wedgeRow;
  } else if (formation === 'inverted-wedge') {
    const reverseIndex = Math.max(0, count - index - 1);
    const wedgeRow = Math.floor(Math.sqrt(reverseIndex));
    const rowStart = wedgeRow * wedgeRow;
    x = center + (reverseIndex - rowStart) - wedgeRow;
    z = Math.max(0, height - 1 - wedgeRow);
  } else if (formation === 'edge-sweep') {
    const inward = Math.floor(index / 2) % Math.max(1, center - 1);
    x = index % 2 === 0 ? 1 + inward : width - 2 - inward;
    z = Math.floor(index / Math.max(2, width - 2));
  }

  if (order === 'tank-front-support-rear' && deployment) {
    const roleDepth = {
      tank: 0,
      attrition: 0,
      frontline: Math.min(1, height - 1),
      utility: Math.min(1, height - 1),
      damage: Math.max(0, height - 2),
      support: height - 1,
    };
    const sameRoleSpread = deployment.roleCount > 1
      ? deployment.roleIndex % 2
      : 0;
    z = (roleDepth[deployment.role] ?? z) + sameRoleSpread;
  }
  return { x: safeX(x), z: safeZ(z) };
}

function spawnTimeForProfile(profile, index, count, deployment = null) {
  const { timing, order, legacyProfile } = parseSpawnProfile(profile);
  if (legacyProfile === 'staggered-waves') {
    return round(Math.floor(index / 8) * 0.7 + (index % 8) * 0.08, 3);
  }
  if (legacyProfile) return round(index * 0.08, 3);
  let time = index * 0.08;
  if (timing === 'burst') {
    time = index * 0.02;
  } else if (timing === 'rapid') {
    time = index * 0.08;
  } else if (timing === 'two-waves') {
    const waveSize = Math.max(1, Math.ceil(count / 2));
    const waveInterval = waveSize * 0.05 + 0.35;
    time = Math.floor(index / waveSize) * waveInterval + (index % waveSize) * 0.05;
  } else if (timing === 'three-waves') {
    const waveSize = Math.max(1, Math.ceil(count / 3));
    const waveInterval = waveSize * 0.05 + 0.35;
    time = Math.floor(index / waveSize) * waveInterval + (index % waveSize) * 0.05;
  } else if (timing === 'drip') {
    time = index * 0.22;
  }
  if (order === 'tank-front-support-rear' && deployment) {
    const roleDelay = {
      tank: 0,
      attrition: 0,
      frontline: 0.12,
      utility: 0.12,
      damage: 0.32,
      support: 0.52,
    };
    time += roleDelay[deployment.role] || 0;
  }
  return round(time, 3);
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
    byAttackPolicy: new Map(),
    bySpawnProfile: new Map(),
    bySpawnProfileTownHall: new Map(),
    bySpawnFormation: new Map(),
    bySpawnTiming: new Map(),
    byDeploymentOrder: new Map(),
    byTactics: new Map(),
    byNftRarity: new Map(),
    byNftTroopRarity: new Map(),
    byDefenderWard: new Map(),
    byAttackLevelProfile: new Map(),
    byExperimentCohort: new Map(),
    byCohortTactics: new Map(),
    byCohortSpawnFormation: new Map(),
    byCohortSpawnTiming: new Map(),
    byCohortDeploymentOrder: new Map(),
    byCohortTownHall: new Map(),
    byCohortTroop: new Map(),
    byCohortTroopTownHall: new Map(),
    byTroop: new Map(),
    byTroopTownHall: new Map(),
    byPureTroop: new Map(),
    byPureTroopTownHall: new Map(),
    byPureTroopBaseArchetype: new Map(),
    byPureTroopTownHallBaseArchetype: new Map(),
    byPureBase: new Map(),
    byNonAdaptiveBase: new Map(),
    byCohortBase: new Map(),
    byBaseArchetypeTownHall: new Map(),
    byArmyBaseArchetype: new Map(),
    byBase: new Map(),
    samples: [],
  };
}

function createBucket() {
  return {
    count: 0,
    wins: 0,
    validCount: 0,
    validWins: 0,
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
    validBuildingsDestroyed: 0,
    validBuildingCount: 0,
    validTownHallHpPct: 0,
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
  recordBucket(
    mapBucket(
      aggregate.byBaseArchetypeTownHall,
      `${scenario.base.archetype}|TH${scenario.defenderTownHall}`,
    ),
    result,
  );
  recordBucket(mapBucket(aggregate.byBaseLevelProfile, scenario.base.levelProfile), result);
  recordBucket(mapBucket(aggregate.byArmy, scenario.army.name), result);
  recordBucket(
    mapBucket(
      aggregate.byArmyBaseArchetype,
      `${scenario.army.name}|${scenario.base.archetype}`,
    ),
    result,
  );
  if (scenario.policyId) {
    recordBucket(mapBucket(aggregate.byAttackPolicy, scenario.policyId), result);
  }
  recordBucket(mapBucket(aggregate.bySpawnProfile, scenario.spawnProfile), result);
  recordBucket(
    mapBucket(
      aggregate.bySpawnProfileTownHall,
      `TH${scenario.attackerTownHall}|${scenario.spawnProfile}`,
    ),
    result,
  );
  const spawn = parseSpawnProfile(scenario.spawnProfile);
  recordBucket(mapBucket(aggregate.bySpawnFormation, spawn.formation), result);
  recordBucket(mapBucket(aggregate.bySpawnTiming, spawn.timing), result);
  recordBucket(mapBucket(aggregate.byDeploymentOrder, spawn.order), result);
  recordBucket(mapBucket(aggregate.byTactics, scenario.tactics), result);
  const nftTypes = [...new Set(scenario.army.units)]
    .filter((type) => ['demon_king', 'fire_dragon'].includes(type));
  for (const nftType of nftTypes) {
    const rarity = strRarity(scenario.attackerNftRarities?.[nftType]);
    recordBucket(mapBucket(aggregate.byNftRarity, rarity), result);
    recordBucket(
      mapBucket(aggregate.byNftTroopRarity, `${nftType}|${rarity}`),
      result,
    );
  }
  recordBucket(
    mapBucket(
      aggregate.byDefenderWard,
      `ward-${Number(scenario.defenderAltarLevels?.ward || 0)}`,
    ),
    result,
  );
  recordBucket(mapBucket(aggregate.byAttackLevelProfile, scenario.levelProfile), result);
  recordBucket(
    mapBucket(
      aggregate.byExperimentCohort,
      scenario.experimentCohort || 'sampled',
    ),
    result,
  );
  const cohort = scenario.experimentCohort || 'sampled';
  recordBucket(
    mapBucket(aggregate.byCohortTactics, `${cohort}|${scenario.tactics}`),
    result,
  );
  recordBucket(
    mapBucket(
      aggregate.byCohortSpawnFormation,
      `${cohort}|${spawn.formation}`,
    ),
    result,
  );
  recordBucket(
    mapBucket(aggregate.byCohortSpawnTiming, `${cohort}|${spawn.timing}`),
    result,
  );
  recordBucket(
    mapBucket(
      aggregate.byCohortDeploymentOrder,
      `${cohort}|${spawn.order}`,
    ),
    result,
  );
  recordBucket(
    mapBucket(
      aggregate.byCohortTownHall,
      `${cohort}|TH${scenario.attackerTownHall}`,
    ),
    result,
  );
  recordBucket(
    mapBucket(aggregate.byCohortBase, `${cohort}|${scenario.base.id}`),
    result,
  );
  if (['pure-unit-matrix', 'policy-exploration'].includes(cohort)) {
    recordBucket(mapBucket(aggregate.byNonAdaptiveBase, scenario.base.id), result);
  }
  recordBucket(mapBucket(aggregate.byBase, scenario.base.id), result);
  const troopTypes = new Set(scenario.army.units);
  for (const troopType of troopTypes) {
    recordBucket(mapBucket(aggregate.byTroop, troopType), result);
    recordBucket(
      mapBucket(aggregate.byCohortTroop, `${cohort}|${troopType}`),
      result,
    );
    recordBucket(
      mapBucket(
        aggregate.byTroopTownHall,
        `${troopType}|TH${scenario.attackerTownHall}`,
      ),
      result,
    );
    recordBucket(
      mapBucket(
        aggregate.byCohortTroopTownHall,
        `${cohort}|${troopType}|TH${scenario.attackerTownHall}`,
      ),
      result,
    );
  }
  if (
    troopTypes.size === 1
    && scenario.experimentCohort === 'pure-unit-matrix'
  ) {
    const troopType = [...troopTypes][0];
    recordBucket(mapBucket(aggregate.byPureTroop, troopType), result);
    recordBucket(
      mapBucket(
        aggregate.byPureTroopTownHall,
        `${troopType}|TH${scenario.attackerTownHall}`,
      ),
      result,
    );
    recordBucket(
      mapBucket(
        aggregate.byPureTroopBaseArchetype,
        `${troopType}|${scenario.base.archetype}`,
      ),
      result,
    );
    recordBucket(
      mapBucket(
        aggregate.byPureTroopTownHallBaseArchetype,
        `${troopType}|TH${scenario.attackerTownHall}|${scenario.base.archetype}`,
      ),
      result,
    );
    recordBucket(mapBucket(aggregate.byPureBase, scenario.base.id), result);
  }
  if (aggregate.samples.length < 20) {
    aggregate.samples.push({
      id: scenario.id,
      matchup: scenario.matchup,
      base: scenario.base.id,
      army: scenario.army.name,
      spawnProfile: scenario.spawnProfile,
      attackLevelProfile: scenario.levelProfile,
      attackPolicyId: scenario.policyId || '',
      tactics: scenario.tactics,
      nftRarity: strRarity(scenario.attackerNftRarities?.demon_king),
      defenderWard: Number(scenario.defenderAltarLevels?.ward || 0),
      result,
    });
  }
}

function recordBucket(bucket, result) {
  bucket.count += 1;
  if (result.win) bucket.wins += 1;
  if (result.valid) {
    bucket.validCount += 1;
    if (result.win) bucket.validWins += 1;
    bucket.validBuildingsDestroyed += Number(result.buildingsDestroyed || 0);
    bucket.validBuildingCount += Number(result.buildingCount || 0);
    bucket.validTownHallHpPct += Number(result.townHallHpPct || 0);
  }
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
  const simulatedSpawnProfiles = new Set();
  const spawnProfilesByTownHall = new Map();
  for (const scenario of scenarios) {
    simulatedBases.add(scenario.base.id);
    simulatedSpawnProfiles.add(scenario.spawnProfile);
    if (!spawnProfilesByTownHall.has(scenario.attackerTownHall)) {
      spawnProfilesByTownHall.set(scenario.attackerTownHall, new Set());
    }
    spawnProfilesByTownHall.get(scenario.attackerTownHall).add(scenario.spawnProfile);
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
    expectedSpawnProfiles: SPAWN_PROFILES,
    simulatedSpawnProfiles: [...simulatedSpawnProfiles].sort(),
    missingSpawnProfiles: scenarios.length === 0
      ? []
      : SPAWN_PROFILES.filter((profile) => !simulatedSpawnProfiles.has(profile)),
    spawnProfilesByTownHall: Object.fromEntries(
      [...spawnProfilesByTownHall.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([townHall, profiles]) => [
          `TH${townHall}`,
          {
            count: profiles.size,
            missing: SPAWN_PROFILES.filter((profile) => !profiles.has(profile)),
          },
        ]),
    ),
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
  if (coverage.missingSpawnProfiles.length > 0) {
    issues.push({
      severity: 'critical',
      code: 'spawn-coverage',
      message: `Missing ${coverage.missingSpawnProfiles.length}/${SPAWN_PROFILES.length} spawn mechanics in simulated coverage.`,
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

  const explorationBucket = aggregate.byExperimentCohort.get('policy-exploration')
    || aggregate.overall;
  const explorationRate = rate(explorationBucket.wins, explorationBucket.count);
  if (Math.abs(explorationRate - targetWinRate) > band) {
    issues.push({
      severity: 'warning',
      code: 'policy-exploration-win-rate',
      message: `Policy-exploration attacker win rate ${pct(explorationRate)} is outside ${pct(targetWinRate)} +/- ${pct(band)} across ${explorationBucket.count} samples. Adaptive training and controlled pure-unit battles are excluded.`,
    });
  }
  const pureTotals = [...aggregate.byPureTroop.values()].reduce(
    (totals, bucket) => ({
      count: totals.count + bucket.count,
      wins: totals.wins + bucket.wins,
    }),
    { count: 0, wins: 0 },
  );
  const pureReference = rate(pureTotals.wins, pureTotals.count);
  collectBucketOutliers(
    issues,
    'pure-troop',
    aggregate.byPureTroop,
    pureReference,
    Math.max(0.15, band),
    minGroupSize,
  );
  for (const [troopType, bucket] of aggregate.byPureTroop) {
    if (bucket.count < Math.max(20, minGroupSize)) continue;
    const winRate = rate(bucket.wins, bucket.count);
    if (winRate >= 0.8 || winRate <= 0.2) {
      issues.push({
        severity: 'warning',
        code: winRate >= 0.8 ? 'degenerate-pure-army' : 'underpowered-pure-army',
        message: `Pure ${troopType} armies have ${pct(winRate)} attacker wins across ${bucket.count} isolated samples.`,
      });
    }
  }
  for (const [key, bucket] of aggregate.byCohortTownHall) {
    if (!key.startsWith('policy-exploration|') || bucket.count < minGroupSize) continue;
    const townHall = Number(key.match(/TH(\d+)/)?.[1] || 0);
    const expectedLow = townHall <= 4 ? 0.60 : targetWinRate - band;
    const expectedHigh = townHall <= 4 ? 0.70 : targetWinRate + band;
    const winRate = rate(bucket.wins, bucket.count);
    if (winRate >= expectedLow && winRate <= expectedHigh) continue;
    issues.push({
      severity: townHall >= 5 ? 'critical' : 'warning',
      code: 'town-hall-target-band',
      message: `${key} has ${pct(winRate)} attacker wins across ${bucket.count} samples; authored target is ${pct(expectedLow)}-${pct(expectedHigh)}.`,
    });
  }
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
  for (const [baseId, bucket] of aggregate.byNonAdaptiveBase) {
    if (bucket.count < minGroupSize || bucket.wins > 0) continue;
    issues.push({
      severity: 'warning',
      code: 'unbeaten-non-adaptive-base',
      message: `${baseId} has 0 attacker wins across ${bucket.count} controlled/policy-exploration samples.`,
    });
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
    byAttackPolicy: mapToObject(aggregate.byAttackPolicy),
    bySpawnProfile: mapToObject(aggregate.bySpawnProfile),
    bySpawnProfileTownHall: mapToObject(aggregate.bySpawnProfileTownHall),
    bySpawnFormation: mapToObject(aggregate.bySpawnFormation),
    bySpawnTiming: mapToObject(aggregate.bySpawnTiming),
    byDeploymentOrder: mapToObject(aggregate.byDeploymentOrder),
    byTactics: mapToObject(aggregate.byTactics),
    byNftRarity: mapToObject(aggregate.byNftRarity),
    byNftTroopRarity: mapToObject(aggregate.byNftTroopRarity),
    byDefenderWard: mapToObject(aggregate.byDefenderWard),
    byAttackLevelProfile: mapToObject(aggregate.byAttackLevelProfile),
    byExperimentCohort: mapToObject(aggregate.byExperimentCohort),
    byCohortTactics: mapToObject(aggregate.byCohortTactics),
    byCohortSpawnFormation: mapToObject(aggregate.byCohortSpawnFormation),
    byCohortSpawnTiming: mapToObject(aggregate.byCohortSpawnTiming),
    byCohortDeploymentOrder: mapToObject(aggregate.byCohortDeploymentOrder),
    byCohortTownHall: mapToObject(aggregate.byCohortTownHall),
    byCohortTroop: mapToObject(aggregate.byCohortTroop),
    byCohortTroopTownHall: mapToObject(aggregate.byCohortTroopTownHall),
    byTroop: mapToObject(aggregate.byTroop),
    byTroopTownHall: mapToObject(aggregate.byTroopTownHall),
    byPureTroop: mapToObject(aggregate.byPureTroop),
    byPureTroopTownHall: mapToObject(aggregate.byPureTroopTownHall),
    byPureTroopBaseArchetype: mapToObject(aggregate.byPureTroopBaseArchetype),
    byPureTroopTownHallBaseArchetype: mapToObject(
      aggregate.byPureTroopTownHallBaseArchetype,
    ),
    byPureBase: mapToObject(aggregate.byPureBase),
    byNonAdaptiveBase: mapToObject(aggregate.byNonAdaptiveBase),
    byCohortBase: mapToObject(aggregate.byCohortBase),
    byBaseArchetypeTownHall: mapToObject(aggregate.byBaseArchetypeTownHall),
    byArmyBaseArchetype: mapToObject(aggregate.byArmyBaseArchetype),
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
  const {
    config,
    catalog,
    coverage,
    statAudit,
    balanceIssues,
    aggregate,
    breakability,
    baseCounterMeta,
    unitUtility,
    nftRarityProbe,
  } = model;
  const overall = aggregate.overall;
  const lines = [];
  lines.push('# Clash Full-Game Balance Lab');
  lines.push('');
  lines.push(`**Generated:** ${model.generatedAt}`);
  lines.push(`**Seed:** ${config.seed}`);
  lines.push(`**Town Halls:** ${config.townHalls.map((th) => `TH${th}`).join(', ')}`);
  lines.push(`**Unique ${config.baseSource === 'report' ? 'loaded' : 'generated'} bases:** ${config.generatedBaseCount}`);
  if (config.baseSource === 'report') {
    lines.push(`**Base report source:** \`${config.baseReportPath}\``);
    lines.push(`**Selected base IDs:** ${config.requestedBaseIds.length > 0 ? config.requestedBaseIds.map(escapeMd).join(', ') : 'all matching profile'}`);
    lines.push(`**Production layout rules:** ${config.allowProductionLayout ? 'exact live placement (backline allowed)' : 'generated-base front-line constraints'}`);
  }
  lines.push(`**Unique attack policies:** ${config.attackPolicyCount}`);
  lines.push(`**Capacity-filled core army templates:** ${config.capacityFilledArmyCount || 0}`);
  lines.push(`**Spawn mechanics:** ${config.spawnMechanicCount} (${config.spawnFormationCount} formations x ${config.spawnTimingCount} timings x ${config.deploymentOrderCount} role orders)`);
  lines.push(`**Controlled pure-unit battles:** ${config.pureUnitMatrixBattles}`);
  lines.push(`**Unbeaten non-adaptive bases (n >= ${minGroupSize}):** ${config.unbeatenNonAdaptiveBases}`);
  lines.push(`**Breakability probe:** ${config.breakabilityBattles} calibration + gate + focused + adaptive rescue battles; ${config.breakabilityUnbeatenBases}/${breakability.testedBaseCount} valid-tested bases unbeaten; ${breakability.untestedBaseCount} untested; ${breakability.invalidOnlyBaseCount} invalid-only`);
  lines.push(`**Adaptive breakability army breadth:** up to ${config.breakabilityAdaptiveArmyLimit || BREAKABILITY_ADAPTIVE_ARMY_LIMIT} closest distinct ordered army templates per unresolved base`);
  lines.push(`**Base-counter response matrix:** ${config.baseCounterBattles || 0} battles; ${baseCounterMeta.testedBaseCount || 0} bases x 15 selected same-TH compositions x ${baseCounterMeta.discoveryContextsPerCell || 0} paired discovery contexts, plus locked holdouts`);
  lines.push(`**Equal-slot unit utility probe:** ${config.unitUtilityBattles} battles`);
  lines.push(`**Paired NFT rarity probe:** ${config.nftRarityProbeBattles} battles`);
  lines.push(`**Lab offense scales:** ${Object.entries(config.labOffenseScaleByLevel || {}).map(([level, scale]) => `L${level}=${scale}x`).join(', ')}`);
  lines.push(`**Lab late-tier troop scales:** ${Object.entries(config.labOffenseScaleByTroop || {}).map(([type, scale]) => `${type}=${scale}x`).join(', ') || 'none'}`);
  lines.push(`**Lab troop slot costs:** ${Object.entries(config.labSlotCostByTroop || {}).map(([type, cost]) => `${type}=${cost}`).join(', ') || 'canonical'}`);
  lines.push(`**Lab defense damage scale:** ${config.labDefenseDamageScale || 1}x`);
  lines.push(`**Lab targetable building HP scale:** ${config.labBuildingHpScale || 1}x from L${config.labBuildingHpMinLevel || 1}`);
  lines.push(`**Lab L5+ defense/guard scale:** ${config.labLateDefenseScale || 1}x`);
  lines.push(`**Lab L5+ defense damage-only scale:** ${config.labLateDefenseDamageScale || 1}x`);
  lines.push(`**Lab TH7 defense/guard scale:** ${config.labTh7DefenseScale || 1}x`);
  lines.push(`**Lab Mimic concealment ends on first attack:** ${config.labMimicRevealAfterAttack ? 'yes' : 'no'}`);
  lines.push(`**Lab Mimic trap damage scale while immune:** ${config.labMimicTrapDamageScale || 0}x`);
  lines.push(`**Imported base HP normalized to current definitions:** ${config.normalizeBaseHp ? 'yes' : 'no'}`);
  lines.push(`**Balance replay simulations:** ${config.simulatedMatches}`);
  lines.push(`**Ship capacity used:** ${config.shipCapacity} slots`);
  lines.push(`**Ship capacity by Town Hall:** ${Object.entries(config.shipCapacities).map(([th, capacity]) => `TH${th}=${capacity}`).join(', ')}`);
  lines.push(`**Matchmaking mode:** ${config.sameTownHallOnly ? 'same Town Hall only' : 'TH -1 / same / TH +1 sample'}`);
  lines.push(`**Elapsed:** ${(config.elapsedMs / 1000).toFixed(1)}s`);
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('- Uses the production `server/combat_session.js` replay simulator.');
  lines.push('- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.');
  lines.push('- Uses a temporary SQLite database and never reads or writes production player data.');
  lines.push(config.baseSource === 'report'
    ? `- Replays the exact validated base catalog from \`${config.baseReportPath}\`; imported base and building IDs must be non-empty and unique.${config.allowProductionLayout ? ' Live backline placement is preserved while grid bounds, overlaps, Town Hall count, and TH level caps remain validated.' : ''}`
    : `- Generates deterministic layouts across ${ARCHETYPES.length} logical base archetypes and ${BASE_LEVEL_PROFILES.length} progression profiles.`);
  lines.push(`- Samples exactly ${SPAWN_PROFILES.length} deterministic spawn mechanics, ${TACTIC_PROFILES.length} tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.`);
  lines.push('- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all represented base archetypes.');
  lines.push('- The base-counter response matrix fixes common rarity, Ward 0, maxed same-TH levels, and paired deployment contexts across 15 capacity-filled representative pure/mixed compositions per base. It ranks compositions by win, destruction, Town Hall damage, and survival, then replays the locked top-two and the strongest universal family on guaranteed distinct contexts. These battles are excluded from population win rate and do not replace the broader adaptive breakability search.');
  lines.push('- The equal-slot utility probe replaces roughly 15-20 starter slots with each candidate role package on identical TH7 reference bases, spawn plans, levels, tactics, rarity, and Ward. TH8-TH10 troops are explicitly projections against the current TH7 defense ceiling.');
  lines.push('- The NFT rarity probe changes only common/epic/legendary rarity on the same pure-NFT army, base, spawn, troop levels, tactics, and Ward.');
  lines.push('- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.');
  lines.push(`- Elite attack policies require at least ${config.elitePolicyMinSamples} exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.`);
  lines.push('- Reusing the same seed makes before/after balance comparisons reproducible.');
  lines.push('');
  lines.push('## Content Discovery');
  lines.push('');
  lines.push(`- Buildings: ${catalog.buildings.map((entry) => entry.type).join(', ')}`);
  lines.push(`- Active troops: ${catalog.troops.map((entry) => entry.type).join(', ')}`);
  lines.push(`- Building coverage: ${coverage.generatedBuildings.length}/${coverage.expectedBuildings.length}`);
  lines.push(`- Troop simulation coverage: ${coverage.simulatedTroops.length}/${coverage.expectedTroops.length}`);
  lines.push(`- Spawn-mechanic coverage: ${coverage.simulatedSpawnProfiles.length}/${coverage.expectedSpawnProfiles.length}`);
  lines.push(`- Spawn coverage by Town Hall: ${Object.entries(coverage.spawnProfilesByTownHall || {}).map(([th, value]) => `${th}=${value.count}/${SPAWN_PROFILES.length}`).join(', ')}`);
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
  if (breakability.enabled) {
    lines.push('## Base Breakability Gate');
    lines.push('');
    lines.push(`Attack policies were first calibrated against the strongest same-TH bases at ${breakability.nftRarity} NFT rarity. Each base was then attacked by up to ${breakability.policiesPerTownHall} best hard-base policies. Bases with no valid elite-gate win were tested against the remaining sampled same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab selected up to ${BREAKABILITY_ADAPTIVE_ARMY_LIMIT} closest distinct ordered army templates and crossed each with every legal spawn mechanic and tactic, stopping at the first valid win. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. Final unbeaten bases exhausted every adaptive combination selected by this method. These probe battles do not affect the reported balance win rate.`);
    lines.push('');
    lines.push(`- Distinct candidate policies after rarity deduplication: ${breakability.candidatePolicyCount}`);
    lines.push(`- Hard-base calibration battles: ${breakability.calibrationBattles}`);
    lines.push(`- Full-catalog gate battles: ${breakability.battles}`);
    lines.push(`- Focused rescue battles: ${breakability.rescueBattles}`);
    lines.push(`- Adaptive counter-search battles: ${breakability.adaptiveRescueBattles}`);
    lines.push(`- Without a valid win after elite gate: ${breakability.initialUnbeatenBaseCount}`);
    lines.push(`- Resolved by remaining sampled policies: ${breakability.focusedRescuedBaseCount || 0}`);
    lines.push(`- Resolved by adaptive counter-search: ${breakability.adaptiveRescuedBaseCount || 0}`);
    lines.push(`- Total breakability battles: ${breakability.totalBattles}`);
    lines.push(`- Invalid: ${breakability.invalid}`);
    lines.push(`- Tested bases: ${breakability.testedBaseCount}/${breakability.generatedBaseCount}`);
    lines.push(`- Untested bases: ${breakability.untestedBaseCount}`);
    lines.push(`- Invalid-only bases: ${breakability.invalidOnlyBaseCount}`);
    lines.push(`- Bases with zero successful attacks after full candidate search: ${breakability.unbeatenBaseCount}`);
    if (breakability.rescuedBases.length > 0) {
      lines.push('');
      lines.push('| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |');
      lines.push('|---|---:|---|---|---|---|---:|');
      for (const base of breakability.rescuedBases) {
        lines.push(`| ${escapeMd(base.id)} | ${base.townHall} | ${escapeMd(base.archetype)} | ${escapeMd(base.levelProfile)} | ${escapeMd(base.policyId)} | ${escapeMd(base.phase || '')} | ${base.rescueBattle} |`);
      }
    }
    if (breakability.unbeatenBases.length > 0) {
      lines.push('');
      lines.push('| Base | TH | Archetype | Progression | Valid Attacks | Closest Policy | TH HP Left | Destruction |');
      lines.push('|---|---:|---|---|---:|---|---:|---:|');
      for (const base of breakability.unbeatenBases) {
        const closest = breakability.bestAttemptByBase?.[base.id] || {};
        lines.push(`| ${escapeMd(base.id)} | ${base.townHall} | ${escapeMd(base.archetype)} | ${escapeMd(base.levelProfile)} | ${base.validBattles} | ${escapeMd(closest.policyId || '')} | ${pct(Number(closest.townHallHpPct || 0))} | ${pct(Number(closest.destruction || 0))} |`);
      }
    }
    if (breakability.untestedBases.length > 0) {
      lines.push('');
      lines.push('| Untested Base | TH | Archetype | Progression |');
      lines.push('|---|---:|---|---|');
      for (const base of breakability.untestedBases) {
        lines.push(`| ${escapeMd(base.id)} | ${base.townHall} | ${escapeMd(base.archetype)} | ${escapeMd(base.levelProfile)} |`);
      }
    }
    if (breakability.invalidOnlyBases.length > 0) {
      lines.push('');
      lines.push('| Invalid-Only Base | TH | Archetype | Progression | Attempts |');
      lines.push('|---|---:|---|---|---:|');
      for (const base of breakability.invalidOnlyBases) {
        lines.push(`| ${escapeMd(base.id)} | ${base.townHall} | ${escapeMd(base.archetype)} | ${escapeMd(base.levelProfile)} | ${base.battles} |`);
      }
    }
    lines.push('');
  }
  appendBaseCounterMetaSection(lines, baseCounterMeta);
  appendUnitUtilitySection(lines, unitUtility);
  appendNftRarityProbeSection(lines, nftRarityProbe);
  appendBucketSection(lines, 'Town Hall Matchups', aggregate.byMatchup, minGroupSize);
  appendBucketSection(lines, 'Base Archetypes', aggregate.byBaseArchetype, minGroupSize);
  appendBucketSection(lines, 'Base Archetypes by Town Hall', aggregate.byBaseArchetypeTownHall, minGroupSize);
  appendBucketSection(lines, 'Base Progression Profiles', aggregate.byBaseLevelProfile, minGroupSize);
  appendBucketSection(lines, 'Experiment Cohorts', aggregate.byExperimentCohort, minGroupSize);
  appendBucketSection(lines, 'Town Halls by Experiment Cohort', aggregate.byCohortTownHall, minGroupSize);
  appendBucketSection(lines, 'Troop Presence by Experiment Cohort', aggregate.byCohortTroop, minGroupSize);
  appendBucketSection(lines, 'Troop Presence by Cohort and Town Hall', aggregate.byCohortTroopTownHall, minGroupSize);
  appendBucketSection(lines, 'Tactics by Experiment Cohort', aggregate.byCohortTactics, minGroupSize);
  appendBucketSection(lines, 'Spawn Formations by Experiment Cohort', aggregate.byCohortSpawnFormation, minGroupSize);
  appendBucketSection(lines, 'Spawn Timings by Experiment Cohort', aggregate.byCohortSpawnTiming, minGroupSize);
  appendBucketSection(lines, 'Deployment Orders by Experiment Cohort', aggregate.byCohortDeploymentOrder, minGroupSize);
  appendBucketSection(lines, 'Army Policies', aggregate.byArmy, minGroupSize);
  appendBucketSection(lines, 'Spawn Policies', aggregate.bySpawnProfile, minGroupSize);
  appendBucketSection(lines, 'Spawn Formations', aggregate.bySpawnFormation, minGroupSize);
  appendBucketSection(lines, 'Spawn Timings', aggregate.bySpawnTiming, minGroupSize);
  appendBucketSection(lines, 'Deployment Role Orders', aggregate.byDeploymentOrder, minGroupSize);
  appendBucketSection(lines, 'Tactical Ability Policies', aggregate.byTactics, minGroupSize);
  appendBucketSection(lines, 'NFT Rarity Boosts', aggregate.byNftRarity, minGroupSize);
  appendBucketSection(lines, 'NFT Troops by Rarity', aggregate.byNftTroopRarity, minGroupSize);
  appendBucketSection(lines, 'Defender Ward Boosts', aggregate.byDefenderWard, minGroupSize);
  appendBucketSection(lines, 'Attack Level Profiles', aggregate.byAttackLevelProfile, minGroupSize);
  appendBucketSection(lines, 'Troop Presence', aggregate.byTroop, minGroupSize);
  appendCharacterSection(lines, 'Controlled Pure-Unit Performance', aggregate.byPureTroop, minGroupSize);
  appendCharacterSection(lines, 'Controlled Pure-Unit Performance by Town Hall', aggregate.byPureTroopTownHall, minGroupSize);
  appendCharacterSection(lines, 'Controlled Pure Units vs Base Archetypes', aggregate.byPureTroopBaseArchetype, minGroupSize);
  appendTopPolicySections(lines, model, minGroupSize);
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

function appendBaseCounterMetaSection(lines, probe) {
  if (!probe?.enabled) return;
  const diversity = probe.diversity || {};
  lines.push('## Base-Counter Response Matrix');
  lines.push('');
  lines.push(
    `The probe compares 15 selected capacity-filled compositions per Town Hall under identical discovery contexts. Selection coverage: ${
      Object.keys(probe.armyCountByTownHall || {}).map(
        (townHall) => `${townHall}=${probe.armyCountByTownHall[townHall]}/${probe.availableArmyCountByTownHall?.[townHall] || probe.armyCountByTownHall[townHall]}`,
      ).join(', ')
    }. `
    + 'Near-best compositions within 0.03 utility share counter credit, so ties do not manufacture a single winner.',
  );
  lines.push('');
  lines.push(`- Discovery matrix: ${probe.discoveryBattles} battles`);
  lines.push(`- Locked top-two counter holdout: ${probe.counterHoldoutBattles} battles`);
  lines.push(`- Universal-family holdout: ${probe.universalHoldoutBattles} battles`);
  lines.push(`- Hard-layout confirmation: ${probe.hardConfirmationBattles} battles`);
  lines.push(`- Invalid battles: ${probe.invalid}`);
  lines.push(`- Bases with no discovery-matrix win: ${probe.discoveryZeroCounterBaseCount}/${probe.testedBaseCount}`);
  lines.push(`- Bases with no observed win in any probe phase: ${probe.zeroCounterBaseCount}/${probe.testedBaseCount}`);
  lines.push(`- Bases where neither locked top-two counter won its holdout: ${probe.confirmedBreakabilityFailureCount}/${probe.testedBaseCount}`);
  lines.push(`- Bases with at least two / three winning compositions: ${pct(diversity.twoCounterBaseRate)} / ${pct(diversity.threeCounterBaseRate)}`);
  lines.push(`- Bases with winning counters from at least two recipe families: ${pct(diversity.multiFamilyCounterBaseRate)}`);
  lines.push(`- Bases losing to at least 12/15 compositions in both discovery contexts: ${pct(diversity.excessivelySoftBaseRate)}`);
  lines.push(`- Top-1 / top-3 near-best counter share: ${pct(diversity.topCounterShare)} / ${pct(diversity.topThreeCounterShare)}`);
  lines.push(`- Counter-family effective count (inverse HHI / Shannon): ${formatNumber(diversity.inverseHhiEffectiveFamilies)} / ${formatNumber(diversity.shannonEffectiveFamilies)}`);
  lines.push(`- Strongest universal family: ${escapeMd(probe.universalFamily)} — ${pct(probe.universalDiscoveryBaseWinRate)} discovery coverage, ${pct(probe.universalHoldoutWinRate)} unseen-context win rate`);
  lines.push(`- Layouts forcing the universal family to lose while another composition wins: ${pct(diversity.universalCounterForcingBaseRate)}; mean universal regret ${formatNumber(diversity.meanUniversalRegret)}`);
  lines.push('');
  lines.push('| Defense Level Profile | Bases | Discovery WR | Discovery Zero-Counter | Total Zero-Counter | 2+ Counters | 3+ Counters | Multi-Family | Robust 12+/15 Losses |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [levelProfile, row] of Object.entries(probe.diversityByLevelProfile || {})
    .sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(
      `| ${escapeMd(levelProfile)} | ${row.baseCount} `
      + `| ${pct(row.discoveryWinRate)} `
      + `| ${row.discoveryZeroCounterBaseCount} `
      + `| ${row.totalZeroCounterBaseCount} `
      + `| ${pct(row.twoCounterBaseRate)} `
      + `| ${pct(row.threeCounterBaseRate)} `
      + `| ${pct(row.multiFamilyCounterBaseRate)} `
      + `| ${pct(row.excessivelySoftBaseRate)} |`,
    );
  }
  lines.push('');
  lines.push('| Town Hall | Credited Bases | Counter Families | Top Counter | Top-1 Share | Top-3 Share | Effective Families |');
  lines.push('|---|---:|---:|---|---:|---:|---:|');
  for (const [townHall, row] of Object.entries(probe.diversityByTownHall || {})
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    lines.push(
      `| ${escapeMd(townHall)} | ${formatNumber(row.creditedBaseCount)} `
      + `| ${row.distinctTopCounterFamilies} | ${escapeMd(row.topCounterFamily)} `
      + `| ${pct(row.topCounterShare)} | ${pct(row.topThreeCounterShare)} `
      + `| ${formatNumber(row.inverseHhiEffectiveFamilies)} |`,
    );
  }
  lines.push('');
  lines.push('| Composition | Recipe Family | TH Coverage | Discovery Base Coverage | Discovery WR | Near-Best Share (Credited Bases) | Locked Holdout | Universal Holdout |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|');
  for (const row of Object.values(probe.byArmy || {})
    .sort((a, b) => (
      b.topCounterShare - a.topCounterShare
      || b.discoveryBaseWinRate - a.discoveryBaseWinRate
      || a.family.localeCompare(b.family)
    ))) {
    const counterHoldout = row.counterHoldoutBattles > 0
      ? `${row.counterHoldoutWins}/${row.counterHoldoutBattles} (${pct(row.counterHoldoutWinRate)})`
      : 'N/A';
    const universalHoldout = row.universalHoldoutBattles > 0
      ? `${row.universalHoldoutWins}/${row.universalHoldoutBattles} (${pct(row.universalHoldoutWinRate)})`
      : 'N/A';
    lines.push(
      `| ${escapeMd(row.family)} | ${escapeMd(row.recipeFamily)} `
      + `| ${row.townHalls.map((townHall) => `TH${townHall}`).join(', ')} `
      + `| ${pct(row.discoveryBaseWinRate)} | ${pct(row.discoveryWinRate)} `
      + `| ${pct(row.topCounterShare)} | ${counterHoldout} `
      + `| ${universalHoldout} |`,
    );
  }
  const problemBases = Object.values(probe.byBase || {})
    .filter((base) => base.totalWinningArmyCount === 0 || !base.topTwoHoldoutWin)
    .sort((a, b) => (
      a.totalWinningArmyCount - b.totalWinningArmyCount
      || a.townHall - b.townHall
      || a.id.localeCompare(b.id)
    ));
  if (problemBases.length > 0) {
    lines.push('');
    lines.push('| Hard Base | TH | Layout | Winners (All Probe Phases) | Discovery Recipe Families | Locked Top-Two Holdout | Best / Runner-up |');
    lines.push('|---|---:|---|---:|---:|---|---|');
    for (const base of problemBases.slice(0, 50)) {
      lines.push(
        `| ${escapeMd(base.id)} | ${base.townHall} `
        + `| ${escapeMd(`${base.archetype} / ${base.levelProfile}`)} `
        + `| ${base.totalWinningArmyCount} | ${base.discoveryWinningRecipeFamilyCount} `
        + `| ${base.topTwoHoldoutWin ? 'win' : 'loss'} `
        + `| ${escapeMd(`${base.topCounter} / ${base.runnerUpCounter}`)} |`,
      );
    }
    if (problemBases.length > 50) {
      lines.push(`| … | | ${problemBases.length - 50} additional hard bases are available in JSON | | | | |`);
    }
  }
  lines.push('');
}

function appendUnitUtilitySection(lines, unitUtility) {
  if (!unitUtility?.enabled) return;
  lines.push('## Equal-Slot Unit Utility');
  lines.push('');
  lines.push(
    `Reference defense: TH${unitUtility.referenceTownHall}. `
    + `Projected future troops: ${unitUtility.projectedTroops.join(', ') || 'none'}.`,
  );
  lines.push('');
  lines.push('| Troop | Role | Access | Unlock | Candidate Package | Pairs | Control WR | Candidate WR | Delta (95% paired CI) | Win Flips | Destruction Delta | TH Damage Delta | Mechanic Signal |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const row of Object.values(unitUtility.byTroop || {})) {
    const mechanicSignal = [
      row.summonDelta ? `summons ${formatSigned(row.summonDelta)}` : '',
      row.evolutionDelta ? `splits ${formatSigned(row.evolutionDelta)}` : '',
      row.trapTriggerDelta ? `traps ${formatSigned(row.trapTriggerDelta)}` : '',
    ].filter(Boolean).join(', ') || '-';
    lines.push(
      `| ${escapeMd(row.troop)}${row.projected ? ' (projected)' : ''} `
      + `| ${escapeMd(row.role)} | ${escapeMd(row.access)} | TH${row.unlockTownHall} `
      + `| ${row.candidateCopies} x / ${row.candidateSlots} slots `
      + `| ${row.validPairs} | ${pct(row.controlWinRate)} `
      + `| ${pct(row.candidateWinRate)} | ${formatSignedPct(row.winRateDelta)} `
      + `(${formatSignedPct(row.pairedWinRateInterval95.low)} to ${formatSignedPct(row.pairedWinRateInterval95.high)}) `
      + `| ${row.gainedWins}-${row.lostWins} `
      + `| ${formatSignedPct(row.destructionDelta)} `
      + `| ${formatSignedPct(row.townHallHpDelta)} `
      + `| ${escapeMd(mechanicSignal)} |`,
    );
  }
  lines.push('');
  lines.push('Positive TH damage delta means the candidate left less Town Hall HP than the equal-slot starter control. A projected result compares the authored TH8-TH10 troop against today\'s TH7 defense ceiling and is not a future-tier win-rate claim.');
  lines.push('');
}

function appendNftRarityProbeSection(lines, probe) {
  if (!probe?.enabled) return;
  lines.push('## Paired NFT Rarity Impact');
  lines.push('');
  lines.push('| Troop | Pairs | Common WR | Epic WR | Epic Delta (95% paired CI) | Legendary WR | Legendary Delta (95% paired CI) |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const row of Object.values(probe.byTroop || {})) {
    const common = row.byRarity.common;
    const epic = row.versusCommon.epic;
    const legendary = row.versusCommon.legendary;
    lines.push(
      `| ${escapeMd(row.troop)} | ${row.pairs} `
      + `| ${pct(rate(common.validWins, common.validCount))} `
      + `| ${pct(epic.rareWinRate)} | ${formatSignedPct(epic.winRateDelta)} `
      + `(${formatSignedPct(epic.pairedWinRateInterval95.low)} to ${formatSignedPct(epic.pairedWinRateInterval95.high)}) `
      + `| ${pct(legendary.rareWinRate)} `
      + `| ${formatSignedPct(legendary.winRateDelta)} `
      + `(${formatSignedPct(legendary.pairedWinRateInterval95.low)} to ${formatSignedPct(legendary.pairedWinRateInterval95.high)}) |`,
    );
  }
  lines.push('');
}

function appendTopPolicySections(lines, model, minGroupSize) {
  const policiesById = new Map(
    (model.attackPolicies || []).map((policy) => [policy.id, policy]),
  );
  const attacks = Object.entries(model.aggregate.byAttackPolicy || {})
    .filter(([, bucket]) => bucket.count >= Math.max(10, minGroupSize))
    .sort((a, b) => (
      wilsonInterval(b[1].wins, b[1].count).low
        - wilsonInterval(a[1].wins, a[1].count).low
      || rate(b[1].buildingsDestroyed, b[1].buildingCount)
        - rate(a[1].buildingsDestroyed, a[1].buildingCount)
      || a[0].localeCompare(b[0])
    ))
    .slice(0, 15);
  if (attacks.length > 0) {
    lines.push('## Best Attack Policies');
    lines.push('');
    lines.push('| Policy | TH | Army | Spawn | Tactics | Rarity | Battles | Win Rate | Destruction |');
    lines.push('|---|---:|---|---|---|---|---:|---:|---:|');
    for (const [id, bucket] of attacks) {
      const policy = policiesById.get(id) || {};
      lines.push(
        `| ${id} | ${policy.townHall || '-'} | ${escapeMd(policy.army?.name || '')} `
        + `| ${escapeMd(policy.spawnProfile || '')} | ${escapeMd(policy.tactics || '')} `
        + `| ${escapeMd(policy.nftRarity || 'common')} | ${bucket.count} `
        + `| ${pct(rate(bucket.wins, bucket.count))} `
        + `| ${pct(rate(bucket.buildingsDestroyed, bucket.buildingCount))} |`,
      );
    }
    lines.push('');
  }

  const bases = Object.entries(model.aggregate.byBase || {})
    .filter(([, bucket]) => bucket.count >= Math.max(10, minGroupSize))
    .sort((a, b) => (
      wilsonInterval(a[1].wins, a[1].count).high
        - wilsonInterval(b[1].wins, b[1].count).high
      || avg(b[1].townHallHpPct, b[1].count) - avg(a[1].townHallHpPct, a[1].count)
      || a[0].localeCompare(b[0])
    ))
    .slice(0, 15);
  if (bases.length > 0) {
    const basesById = new Map((model.bases || []).map((base) => [base.id, base]));
    lines.push('## Strongest Defensive Bases');
    lines.push('');
    lines.push('| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |');
    lines.push('|---|---:|---|---|---:|---:|---:|');
    for (const [id, bucket] of bases) {
      const base = basesById.get(id) || {};
      lines.push(
        `| ${id} | ${base.townHall || '-'} | ${escapeMd(base.archetype || '')} `
        + `| ${escapeMd(base.levelProfile || '')} | ${bucket.count} `
        + `| ${pct(rate(bucket.wins, bucket.count))} `
        + `| ${pct(avg(bucket.townHallHpPct, bucket.count))} |`,
      );
    }
    lines.push('');
  }
  if ((model.evolution || []).length > 0) {
    lines.push('## Adversarial Shield-vs-Sword Rounds');
    lines.push('');
    lines.push('| Round | Battles | Attacker Win Rate | Elite Attacks | Elite Bases | Mutated Attacks | Mutated Bases |');
    lines.push('|---:|---:|---:|---:|---:|---:|---:|');
    for (const round of model.evolution) {
      lines.push(
        `| ${round.round} | ${round.battles} | ${pct(round.attackerWinRate)} `
        + `| ${round.elitePolicyIds.length} | ${round.eliteBaseIds.length} `
        + `| ${round.mutatedPolicyIds.length} | ${round.mutatedBaseIds.length} |`,
      );
    }
    lines.push('');
  }
}

function appendCharacterSection(lines, title, rawBuckets, minGroupSize) {
  const entries = Object.entries(rawBuckets || {})
    .filter(([, bucket]) => bucket.count >= minGroupSize)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return;
  lines.push(`## ${title}`);
  lines.push('');
  lines.push('| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const [name, bucket] of entries) {
    const interval = wilsonInterval(bucket.wins, bucket.count);
    lines.push(
      `| ${escapeMd(name)} | ${bucket.count} `
      + `| ${pct(rate(bucket.wins, bucket.count))} `
      + `| ${pct(interval.low)}-${pct(interval.high)} `
      + `| ${pct(rate(bucket.buildingsDestroyed, bucket.buildingCount))} `
      + `| ${pct(avg(bucket.townHallHpPct, bucket.count))} `
      + `| ${pct(rate(bucket.troopsAlive, bucket.troopsSpawned))} |`,
    );
  }
  lines.push('');
}

function appendBucketSection(lines, title, rawBuckets, minGroupSize) {
  const entries = Object.entries(rawBuckets || {})
    .filter(([, bucket]) => bucket.count >= minGroupSize)
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

function wilsonInterval(successes, total, z = 1.96) {
  if (total <= 0) return { low: 0, high: 0 };
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = (
    z
    * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)
    / denominator
  );
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
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

function selectParityFixtures(fixtures, requestedCount, seed) {
  const limit = Math.max(0, Math.trunc(Number(requestedCount) || 0));
  if (limit === 0 || limit >= fixtures.length) return [...fixtures];

  const groups = new Map();
  for (const fixture of fixtures) {
    const outcome = String(fixture?.expected?.resolvedResult || 'unknown').toLowerCase();
    const key = `${fixture?.matchup || 'unknown'}|${outcome}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fixture);
  }

  const orderedGroups = [...groups.entries()]
    .map(([key, values]) => ({
      key,
      values: shuffledCopy(values, hash32(seed, hashString(key), 0x50415249)),
    }))
    .sort((left, right) => (
      hash32(seed, hashString(left.key)) - hash32(seed, hashString(right.key))
    ));
  const selected = [];
  const selectedIds = new Set();
  const seenBases = new Set();
  const seenArmies = new Set();
  const seenSpawns = new Set();
  const seenTactics = new Set();

  const noveltyScore = (fixture) => {
    const baseId = String(fixture?.baseId || '');
    const armyId = String(fixture?.armyId || '');
    const spawn = String(fixture?.spawnProfile || '');
    const tactics = String(fixture?.tactics || '');
    return (
      (seenBases.has(baseId) ? 0 : 1_000_000)
      + (seenArmies.has(armyId) ? 0 : 100_000)
      + (seenSpawns.has(spawn) ? 0 : 10_000)
      + (seenTactics.has(tactics) ? 0 : 1_000)
      + (hash32(seed, hashString(fixture?.id || '')) % 1_000)
    );
  };

  while (selected.length < limit) {
    let addedThisRound = false;
    for (const group of orderedGroups) {
      let best = null;
      let bestScore = -1;
      for (const fixture of group.values) {
        const fixtureId = String(fixture?.id || '');
        if (selectedIds.has(fixtureId)) continue;
        const score = noveltyScore(fixture);
        if (score > bestScore) {
          best = fixture;
          bestScore = score;
        }
      }
      if (!best) continue;
      selected.push(best);
      selectedIds.add(String(best.id || ''));
      seenBases.add(String(best.baseId || ''));
      seenArmies.add(String(best.armyId || ''));
      seenSpawns.add(String(best.spawnProfile || ''));
      seenTactics.add(String(best.tactics || ''));
      addedThisRound = true;
      if (selected.length >= limit) break;
    }
    if (!addedThisRound) break;
  }

  return selected;
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
  --base-report <path>     Reuse the exact base catalog stored in a JSON balance report.
  --base-ids <csv>         Limit --base-report replay to the listed base IDs.
  --base-archetypes <csv>  Limit imported, generated, or bot-template bases by archetype.
  --bot-template-difficulty <normal|hard|all>
                           Replay the current in-code matchmaking bot pool directly.
  --allow-production-layout
                           Preserve exact live backline placement in a base report while
                           still validating bounds, overlaps, Town Hall count, and level caps.
  --normalize-base-hp      Replace imported HP with current authored values while preserving
                           the exact layout and building levels.
  --matches <n>            Replay simulations for sampled mode. Default: ${DEFAULT_MATCHES}
  --seed <n>               Deterministic random seed. Default: ${DEFAULT_SEED}
  --profile <range>        all, thN, or thN-thN. Default: ${DEFAULT_PROFILE}
  --catalog-only           Generate and validate content/bases without replay simulation.
  --exhaustive             Traverse base x matchup x army x deployment combinations.
  --same-th-only           Simulate only equal Town Hall attacker/defender matchups.
  --attack-level-profile <profile>
                           Force low, mid, maxed, or mixed troop levels in every battle.
  --attack-policies <n>    Generate an exact population of unique army/spawn/tactic/boost policies.
  --lab-offense-scale-th5 <factor>
  --lab-offense-scale-th6 <factor>
  --lab-offense-scale-th7 <factor>
                           Lab-only HP/damage scales for max-level offense search.
  --lab-offense-scale-<troop> <factor>
                           Lab-only L5+ HP/damage scale for one troop type
                           (for example --lab-offense-scale-mage 1.5).
  --lab-slot-cost-<troop> <slots>
                           Lab-only occupied ship slots for army composition
                           search (for example --lab-slot-cost-mage 7).
  --lab-defense-damage-scale <factor>
                           Lab-only damage scale for all defenses in the selected tiers.
  --lab-building-hp-scale <factor>
                           Lab-only HP scale for targetable buildings after catalog
                           validation; shark traps are not changed.
  --lab-building-hp-min-level <n>
                           Minimum building level affected by the lab HP scale.
  --lab-late-defense-scale <factor>
                           Lab-only damage scale for L5+ defenses and HP/damage
                           scale for L5+ Skeleton Guards.
  --lab-late-defense-damage-scale <factor>
                           Lab-only L5+ defense damage scale without changing guards.
  --lab-th7-defense-scale <factor>
                           Lab-only damage scale for defenses at their TH7 cap,
                           plus HP/damage for the TH7 Tombstone guard level.
  --lab-mimic-reveal-after-attack
                           Lab-only: Mimic becomes targetable during later movement
                           after reaching its first attack state.
  --lab-mimic-trap-damage-scale <factor>
                           Lab-only: immune Mimics take this fraction of shark-trap
                           level damage while remaining immune to instant defeat.
  --adversarial-rounds <n> Select and mutate the strongest attacks and bases for N extra rounds.
  --adversarial-matches <n>
                           Battles per shield-vs-sword round. Default: 500.
  --breakability-policies <n>
                           Cross-check every base against the top N same-TH attack policies.
                           Probe battles are reported separately and do not change balance WR.
  --breakability-candidate-policies <n>
                           Generate a separate, larger attack-policy catalog for the
                           breakability gate without changing the main WR population.
  --breakability-calibration-bases <n>
                           Strong bases used to rank base-breaker policies. Default: 5.
  --breakability-rarity <rarity>
                           NFT rarity used by the breakability gate. Default: common.
  --base-counter-matches <n>
                           Run a separate controlled base x selected representative
                           composition response matrix (does not replace breakability).
                           For 300 bases, use 10000 battles (9000 paired discovery,
                           600 locked top-two, 300 universal holdout, 100 hard confirmations).
  --unit-utility-bases <n>
                           Equal-slot paired starter-replacement bases per active troop.
                           Future TH8-TH10 troops use the current TH7 defense ceiling.
  --unit-utility-troops <csv>
                           Limit the utility probe to named troop types.
  --nft-rarity-probe-bases <n>
                           Paired common/epic/legendary bases per NFT troop.
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
  --dump-parity-fixtures <path>
                           Write exact replay inputs and server outcomes for a Godot parity run.
  --parity-fixture-count <n>
                           Deterministically select N diverse parity fixtures from the full
                           simulated population. Zero keeps every fixture. Default: 0.
  --verbose                Show replay verifier logs and progress.
  --help                   Show this help.

Examples:
  npm run pvp:balance -- --catalog-only --bases 144
  npm run pvp:balance -- --bases 144 --matches 300 --seed 42
  npm run pvp:balance -- --profile th5-th6 --matches 500
  npm run pvp:balance -- --profile th1-th7 --same-th-only --bases 300 --attack-policies 500 --matches 3500 --adversarial-rounds 3
  npm run pvp:balance -- --profile th5-th7 --same-th-only --bases 300 --matches 5000 --attack-policies 500 --base-counter-matches 10000
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

function greatestCommonDivisor(a, b) {
  let left = Math.abs(Math.trunc(a));
  let right = Math.abs(Math.trunc(b));
  while (right !== 0) {
    [left, right] = [right, left % right];
  }
  return left;
}

function coprimeStride(total, seed) {
  if (total <= 1) return 1;
  let candidate = 1 + (Math.abs(Math.trunc(seed)) % (total - 1));
  while (greatestCommonDivisor(candidate, total) !== 1) {
    candidate += 1;
    if (candidate >= total) candidate = 1;
  }
  return candidate;
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

function strRarity(value) {
  const normalized = String(value || 'common').trim().toLowerCase();
  return NFT_RARITIES.includes(normalized) ? normalized : 'common';
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

function formatSignedPct(value) {
  const numeric = Number(value || 0) * 100;
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(1)}%`;
}

function formatSigned(value) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}`;
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
