import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { Client } from '../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const TOP_UP_RESOURCES = !process.argv.includes('--no-top-up');
const TEST_RESOURCES = 500000;

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function freePort() {
  return 4600 + Math.floor(Math.random() * 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseToolPayload(result) {
  const text = result?.content?.find((item) => item?.type === 'text')?.text || '';
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function defaultGridFor(type) {
  return type === 'port' ? 1 : 0;
}

function pickSlot(game, playerId, type, preferredLimit = 300) {
  const grid = defaultGridFor(type);
  const slots = game.findOpenBuildingSlots(playerId, type, grid, preferredLimit);
  if (grid !== 0 || type === 'port') return slots[0] || null;
  return slots.find((slot) => Number(slot.grid_z) >= 4) || slots[0] || null;
}

function placeFirstOpen(game, playerId, type) {
  const slot = pickSlot(game, playerId, type);
  if (!slot) return { error: `no slot for ${type}` };
  return game.placeBuilding(playerId, type, slot.grid_x, slot.grid_z, defaultGridFor(type));
}

function setResources(game, playerId, gold = 50000, wood = 50000, ore = 50000) {
  game.db.prepare('UPDATE players SET gold = ?, wood = ?, ore = ? WHERE id = ?').run(gold, wood, ore, playerId);
}

function setShipLoadout(game, portId, troops) {
  const encoded = JSON.stringify(troops);
  game.db.prepare('UPDATE buildings SET has_ship = 1, ship_troops = ?, ship_troops_template = ? WHERE id = ?')
    .run(encoded, encoded, portId);
}

function setTownHallLevel(game, playerId, level) {
  const def = game.BUILDING_DEFS.town_hall;
  const maxHp = def.hp_levels[Math.max(0, Math.min(def.hp_levels.length - 1, level - 1))];
  game.db.prepare('UPDATE buildings SET level = ?, hp = ?, max_hp = ? WHERE player_id = ? AND type = ?')
    .run(level, maxHp, maxHp, playerId, 'town_hall');
}

function playerBuildings(game, playerId, type = '') {
  const rows = game.getPlayerBuildings(playerId);
  return type ? rows.filter((row) => row.type === type) : rows;
}

function shipTroopCount(port) {
  try {
    const parsed = JSON.parse(port?.ship_troops || '[]');
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function findPortForBuy(game, playerId) {
  return playerBuildings(game, playerId, 'port').find((port) => !Number(port.has_ship)) || null;
}

function findPortWithRoom(game, playerId) {
  return playerBuildings(game, playerId, 'port')
    .filter((port) => Number(port.has_ship) && shipTroopCount(port) < 3)
    .sort((a, b) => shipTroopCount(a) - shipTroopCount(b))[0] || null;
}

function findLoadedPort(game, playerId) {
  return playerBuildings(game, playerId, 'port')
    .filter((port) => Number(port.has_ship) && shipTroopCount(port) > 0)
    .sort((a, b) => shipTroopCount(b) - shipTroopCount(a))[0] || null;
}

function createPlayerBase(game, name, { attacker = false, strong = false } = {}) {
  const player = game.registerPlayer(`${name}_${Date.now()}_${Math.floor(Math.random() * 100000)}`);
  setResources(game, player.id, 80000, 80000, 80000);

  for (const type of ['town_hall', 'mine', 'sawmill', 'barn', 'port', 'archer_tower']) {
    placeFirstOpen(game, player.id, type);
  }
  if (attacker) setTownHallLevel(game, player.id, 3);

  const port = playerBuildings(game, player.id, 'port')[0];
  if (port) setShipLoadout(game, port.id, attacker ? ['Mage', 'Mage', 'Knight'] : []);

  if (strong) {
    setTownHallLevel(game, player.id, 3);
    for (const type of ['storage', 'tombstone', 'archer_tower', 'mine', 'sawmill']) {
      placeFirstOpen(game, player.id, type);
    }
  }

  game.db.prepare('UPDATE players SET shield_until = NULL, last_attacked_by = NULL, last_attacked_at = NULL WHERE id = ?')
    .run(player.id);
  return player;
}

async function waitForHealth(port, child) {
  const url = `http://127.0.0.1:${port}/health`;
  const started = Date.now();
  let last = null;
  while (Date.now() - started < 15000) {
    if (child.exitCode != null) throw new Error(`MCP server exited with ${child.exitCode}`);
    try {
      const res = await fetch(url);
      if (res.ok) return true;
      last = new Error(`HTTP ${res.status}`);
    } catch (err) {
      last = err;
    }
    await sleep(200);
  }
  throw last || new Error('MCP health timeout');
}

async function main() {
  const stamp = nowStamp();
  const tmpDir = path.join(repoRoot, '.tmp', 'ai-agent-mcp-sim');
  await fsp.mkdir(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, `sim-${stamp}.db`);
  process.env.CLASH_MAIN_DB = dbPath;

  const game = require('../server/db.js');
  const attacker = createPlayerBase(game, 'mcp_attacker', { attacker: true });
  for (let i = 0; i < 6; i += 1) createPlayerBase(game, `mcp_defender_${i}`, { strong: i % 2 === 0 });
  const keyResult = game.createAiAgentKey(attacker.id, 'MCP Simulation');
  if (keyResult.error) throw new Error(keyResult.error);

  const port = freePort();
  const serverEnv = {
    ...process.env,
    CLASH_MAIN_DB: dbPath,
    CLASH_MCP_HOST: '127.0.0.1',
    CLASH_MCP_PORT: String(port),
    CLASH_MCP_RATE_LIMIT: '10000',
    CLASH_MCP_AI_ATTACK_COOLDOWN_MS: '0',
    CLASH_GAME_API_URL: 'http://127.0.0.1:9/api',
    CLASH_BATTLE_DEBUG_TRACE: '0',
  };
  const child = spawn(process.execPath, ['mcp/src/server.mjs'], {
    cwd: repoRoot,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const childLogs = [];
  child.stdout.on('data', (chunk) => childLogs.push(String(chunk)));
  child.stderr.on('data', (chunk) => childLogs.push(String(chunk)));

  let client;
  try {
    await waitForHealth(port, child);
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${keyResult.key}`,
          'User-Agent': 'clash-ai-agent-mcp-simulation/1.0',
        },
      },
    });
    client = new Client({ name: 'clash-ai-agent-mcp-simulation', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);

    async function callTool(name, args = {}, timeout = 120000) {
      const started = performance.now();
      const result = await client.callTool({ name, arguments: args }, undefined, { timeout });
      const durationMs = Math.round(performance.now() - started);
      return {
        tool: name,
        args,
        durationMs,
        isError: !!result?.isError,
        payload: parseToolPayload(result),
      };
    }

    const cases = [];
    const addCase = (message, run) => cases.push({ message, run });

    addCase('inspect my base', () => callTool('get_base_state', { include_catalog: false }));
    addCase('show building catalog', () => callTool('get_building_catalog'));
    addCase('find port slots', () => callTool('find_build_slots', { type: 'port', limit: 5 }));
    addCase('find archer tower slots', () => callTool('find_build_slots', { type: 'archer_tower', limit: 5 }));
    addCase('find barn slots', () => callTool('find_build_slots', { type: 'barn', limit: 5 }));
    addCase('collect resources', () => callTool('collect_resources', {}));
    addCase('collect resources again', () => callTool('collect_resources', {}));
    addCase('auto build balanced base', () => callTool('auto_build_base', { focus: 'balanced', max_buildings: 4 }));
    addCase('auto build economy base', () => callTool('auto_build_base', { focus: 'economy', max_buildings: 4 }));
    addCase('auto build defense base', () => callTool('auto_build_base', { focus: 'defense', max_buildings: 4 }));

    const specificBuilds = ['mine', 'sawmill', 'barn', 'port', 'archer_tower', 'storage', 'tombstone', 'turret'];
    for (const type of specificBuilds) {
      addCase(`place ${type}`, async () => {
        const slotResult = await callTool('find_build_slots', { type, limit: 1 });
        const slot = slotResult.payload?.slots?.[0];
        if (!slot) return { ...slotResult, synthetic_blocker: `no slot for ${type}` };
        return callTool('place_building', { type, grid_x: slot.grid_x, grid_z: slot.grid_z, grid_index: slot.grid_index });
      });
    }

    const upgradeTypes = ['mine', 'sawmill', 'barn', 'port', 'archer_tower', 'town_hall', 'storage', 'tombstone'];
    for (const type of upgradeTypes) {
      addCase(`upgrade ${type}`, () => {
        const building = playerBuildings(game, attacker.id, type)[0];
        if (!building) return Promise.resolve({ tool: 'upgrade_building', args: { type }, durationMs: 0, isError: true, payload: { error: `no ${type}` } });
        return callTool('upgrade_building', { building_id: building.id });
      });
    }

    addCase('show attack slots', () => callTool('get_attack_slots'));
    addCase('reinforce ships', () => callTool('reinforce_ships'));
    addCase('buy ship', () => {
      const portBuilding = findPortForBuy(game, attacker.id) || playerBuildings(game, attacker.id, 'port')[0];
      return callTool('buy_ship', { port_id: portBuilding?.id || 0 });
    });
    for (const troop of ['Mage', 'Knight', 'Archer', 'Ranger', 'Barbarian']) {
      addCase(`load ${troop}`, () => {
        const portBuilding = findPortWithRoom(game, attacker.id) || playerBuildings(game, attacker.id, 'port')[0];
        return callTool('load_ship_troop', { port_id: portBuilding?.id || 0, troop_name: troop });
      });
    }
    for (const troop of ['mage', 'knight', 'archer', 'ranger', 'barbarian']) {
      addCase(`upgrade troop ${troop}`, () => callTool('upgrade_troop', { troop_type: troop }));
    }

    addCase('attack someone with auto tactics', () => callTool('execute_ai_attack_plan', { auto_tactics: true }, 180000));
    addCase('inspect base after attack', () => callTool('get_base_state', { include_catalog: false }));
    addCase('reinforce ships after battle', () => callTool('reinforce_ships'));
    addCase('second attack with auto tactics', () => callTool('execute_ai_attack_plan', { auto_tactics: true }, 180000));
    addCase('swap first loaded ship troop', () => {
      const portBuilding = findLoadedPort(game, attacker.id);
      return callTool('swap_ship_troop', { port_id: portBuilding?.id || 0, slot: 0, troop_name: 'Mage' });
    });
    addCase('move first mine', async () => {
      const building = playerBuildings(game, attacker.id, 'mine')[0];
      const slotResult = await callTool('find_build_slots', { type: 'mine', limit: 1 });
      const slot = slotResult.payload?.slots?.[0];
      if (!building || !slot) return { ...slotResult, synthetic_blocker: 'no mine move target' };
      return callTool('move_building', { building_id: building.id, grid_x: slot.grid_x, grid_z: slot.grid_z, grid_index: slot.grid_index });
    });
    addCase('unload one loaded ship', () => {
      const portBuilding = findLoadedPort(game, attacker.id);
      return callTool('unload_ship_troops', { port_id: portBuilding?.id || 0 });
    });
    addCase('remove one extra tombstone', () => {
      const building = playerBuildings(game, attacker.id, 'tombstone')[1] || playerBuildings(game, attacker.id, 'tombstone')[0];
      return callTool('remove_building', { building_id: building?.id || 0 });
    });

    const readVariants = [
      ['base state with catalog', 'get_base_state', { include_catalog: true }],
      ['catalog again', 'get_building_catalog', {}],
      ['slots mine', 'find_build_slots', { type: 'mine', limit: 3 }],
      ['slots sawmill', 'find_build_slots', { type: 'sawmill', limit: 3 }],
      ['slots port grid auto', 'find_build_slots', { type: 'port', limit: 3 }],
      ['collect resources final', 'collect_resources', {}],
    ];
    for (const [message, tool, args] of readVariants) addCase(message, () => callTool(tool, args));

    const selected = cases.slice(0, 50);
    const results = [];
    for (let i = 0; i < selected.length; i += 1) {
      const testCase = selected[i];
      const started = performance.now();
      try {
        if (TOP_UP_RESOURCES) setResources(game, attacker.id, TEST_RESOURCES, TEST_RESOURCES, TEST_RESOURCES);
        const step = await testCase.run();
        const durationMs = step.durationMs ?? Math.round(performance.now() - started);
        results.push({
          index: i + 1,
          message: testCase.message,
          ok: !step.isError && !step.payload?.error,
          durationMs,
          tool: step.tool,
          error: step.payload?.error || step.synthetic_blocker || '',
          summary: summarizePayload(step.payload),
        });
      } catch (err) {
        results.push({
          index: i + 1,
          message: testCase.message,
          ok: false,
          durationMs: Math.round(performance.now() - started),
          tool: 'exception',
          error: err?.message || String(err),
          summary: '',
        });
      }
    }

    const durations = results.map((row) => row.durationMs);
    const okCount = results.filter((row) => row.ok).length;
    const report = {
      generated_at: new Date().toISOString(),
      db_path: dbPath,
      player: { id: attacker.id, name: attacker.name },
      top_up_resources: TOP_UP_RESOURCES,
      requests: results.length,
      ok: okCount,
      failed_or_blocked: results.length - okCount,
      duration_ms: {
        avg: Math.round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length)),
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        max: Math.max(...durations),
      },
      slowest: [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, 8),
      failures: results.filter((row) => !row.ok),
      results,
      server_logs: childLogs.join('').split(/\r?\n/).filter(Boolean).slice(-80),
    };

    const outPath = path.join(tmpDir, `result-${stamp}.json`);
    await fsp.writeFile(outPath, JSON.stringify(report, null, 2));
    printReport(report, outPath);
  } finally {
    try { await client?.close?.(); } catch {}
    child.kill('SIGTERM');
    await sleep(300);
    if (child.exitCode == null) child.kill('SIGKILL');
  }
}

function summarizePayload(payload = {}) {
  if (payload.error) return payload.error;
  if (payload.resources && payload.placed) {
    return `placed=${payload.placed.length} skipped=${payload.skipped?.length || 0}`;
  }
  if (payload.results) {
    const collected = payload.results
      .filter((row) => !row.result?.error)
      .map((row) => `${row.type}:${row.result?.collected || 0}`)
      .join(',');
    return collected || 'nothing collected';
  }
  if (payload.slots) return `slots=${payload.slots.length}`;
  if (Array.isArray(payload.buildings)) return `buildings=${payload.buildings.length}`;
  if (payload.buildings && typeof payload.buildings === 'object') return `catalog=${Object.keys(payload.buildings).length}`;
  if (payload.buildingsCatalog) return `catalog=${Object.keys(payload.buildingsCatalog).length}`;
  if (payload.success && payload.result) return `battle=${payload.result} duration=${payload.duration}`;
  if (payload.success) return 'success';
  if (payload.type && payload.id) return `${payload.type}#${payload.id}`;
  if (payload.troop_type) return `${payload.troop_type} lvl ${payload.level}`;
  return Object.keys(payload).slice(0, 5).join(',');
}

function printReport(report, outPath) {
  console.log(`AI Agent MCP simulation: ${report.ok}/${report.requests} ok, ${report.failed_or_blocked} blocked/error`);
  console.log(`Latency ms: avg=${report.duration_ms.avg} p50=${report.duration_ms.p50} p95=${report.duration_ms.p95} max=${report.duration_ms.max}`);
  console.log(`Report: ${outPath}`);
  console.log('');
  console.log('Slowest:');
  for (const row of report.slowest) {
    console.log(`${String(row.index).padStart(2, '0')} ${row.durationMs}ms ${row.tool} | ${row.message} | ${row.error || row.summary}`);
  }
  if (report.failures.length) {
    console.log('');
    console.log('Blocked/errors:');
    for (const row of report.failures.slice(0, 20)) {
      console.log(`${String(row.index).padStart(2, '0')} ${row.tool} | ${row.message} | ${row.error || row.summary}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
