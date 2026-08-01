#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { verifyReplay } = require('../../server/combat_session');
const { CANONICAL_GRID_CONFIGS } = require('../../server/combat_defs');

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator >= 0) {
      result[token.slice(2, separator)] = token.slice(separator + 1);
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith('--')) {
      result[key] = value;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturePath = path.resolve(String(args.fixtures || ''));
  const scenarioId = String(args.id || '');
  if (!fixturePath || !fs.existsSync(fixturePath)) {
    throw new Error('--fixtures must point to an existing parity fixture JSON file.');
  }
  const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  if (args['refresh-all']) {
    for (const scenario of fixtureData.scenarios || []) {
      const simulation = simulateScenario(scenario, false);
      scenario.expected = expectedResult(scenario, simulation);
    }
    fixtureData.refreshedAt = new Date().toISOString();
    const outputPath = args.out
      ? path.resolve(String(args.out))
      : path.resolve(
        path.dirname(fixturePath),
        `${path.basename(fixturePath, path.extname(fixturePath))}-refreshed.json`,
      );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(fixtureData, null, 2)}\n`, 'utf8');
    console.log(
      `[PARITY_REFRESH] scenarios=${fixtureData.scenarios?.length || 0} output=${outputPath}`,
    );
    return;
  }
  if (!scenarioId) throw new Error('--id is required unless --refresh-all is used.');
  const scenario = (fixtureData.scenarios || []).find(
    candidate => String(candidate.id || '') === scenarioId,
  );
  if (!scenario) throw new Error(`Scenario ${scenarioId} was not found.`);

  const simulation = simulateScenario(scenario, true);
  const trace = Array.isArray(simulation._trace) ? simulation._trace : [];
  const eventCounts = {};
  for (const event of trace) {
    const kind = String(event?.kind || 'unknown');
    eventCounts[kind] = Number(eventCounts[kind] || 0) + 1;
  }
  const output = {
    fixturePath,
    id: scenario.id,
    baseId: scenario.baseId,
    armyId: scenario.armyId,
    spawnProfile: scenario.spawnProfile,
    tactics: scenario.tactics,
    result: expectedResult(scenario, simulation),
    eventCounts,
    trace,
  };
  const outputPath = args.out
    ? path.resolve(String(args.out))
    : path.resolve(path.dirname(fixturePath), `${scenario.id}-server-trace.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(
    `[PARITY_TRACE] id=${scenario.id} result=${simulation.resolvedResult} `
    + `events=${trace.length} output=${outputPath}`,
  );
}

function simulateScenario(scenario, debugTrace) {
  return verifyReplay({
    defenderBuildings: scenario.buildings,
    actions: scenario.actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: scenario.troopLevels || {},
    serverNftRarities: scenario.attackerNftRarities || {},
    serverShipLevel: Number(scenario.serverShipLevel || 1),
    defenderAltarLevels: scenario.defenderAltarLevels || {},
    debugTrace,
  });
}

function expectedResult(scenario, simulation) {
  return {
    valid: !!simulation.valid,
    reason: String(simulation.reason || ''),
    win: String(simulation.resolvedResult || '').toLowerCase() === 'victory',
    resolvedResult: String(simulation.resolvedResult || ''),
    durationSec: Number(simulation._simTimeSec || 0),
    buildingsDestroyed: Number(simulation.buildingsDestroyed || 0),
    buildingCount: Array.isArray(scenario.buildings) ? scenario.buildings.length : 0,
    townHallHpPct: Number(simulation.townHallHpPct ?? 1),
    troopsSpawned: Number(simulation._deployedTroopsSpawned ?? simulation._troopsSpawned ?? 0),
    troopsAlive: Number(simulation._troopsAlive || 0),
    guardsAlive: Number(simulation._guardsAlive || 0),
    sharkTrapsTriggered: Number(simulation._sharkTrapsTriggered || 0),
    summonsSpawned: Number(simulation._summonsSpawned || 0),
    evolutionChildrenSpawned: Number(simulation._evolutionChildrenSpawned || 0),
    simulationEndReason: String(simulation._simulationEndReason || ''),
    buildingHPs: Array.isArray(simulation._buildingHPs) ? simulation._buildingHPs : [],
    troopEndState: Array.isArray(simulation._troopEndState) ? simulation._troopEndState : [],
    aliveTroopDetails: Array.isArray(simulation._aliveTroopDetails)
      ? simulation._aliveTroopDetails
      : [],
    aliveGuardDetails: Array.isArray(simulation._aliveGuardDetails)
      ? simulation._aliveGuardDetails
      : [],
  };
}

main();
