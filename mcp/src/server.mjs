import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const game = require('../../server/db.js');
const combat = require('../../server/combat_defs.js');
const { verifyReplay } = require('../../server/combat_session.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.resolve(__dirname, '..', 'AGENT_SKILL.md');
const PORT = Number(process.env.CLASH_MCP_PORT || 4100);
const GAME_API_URL = (process.env.CLASH_GAME_API_URL || 'http://127.0.0.1:4000/api').replace(/\/+$/, '');
const VALID_SHIP_TROOPS = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger'];
const SHIP_TROOP_COST = 100;
const REINFORCE_COST = 50;
const AI_ATTACK_SLOT_COUNT = 5;
const AI_ATTACK_REPLAY_LABEL = 'AI AGENT ATTACK';
const AI_CANNON_TARGET_TYPES = ['turret', 'archer_tower'];
const AI_CANNON_DEFAULT_START_SEC = 4.0;
const AI_CANNON_DEFAULT_STEP_SEC = (combat.CANNON_RELOAD_SEC || 1.0) + 0.1;

function defaultCannonShotTime(index) {
  return AI_CANNON_DEFAULT_START_SEC + index * AI_CANNON_DEFAULT_STEP_SEC;
}

function cannonShotTime(shot, index) {
  const t = Number(shot?.t);
  return Number.isFinite(t) ? t : defaultCannonShotTime(index);
}

function readSkill() {
  try { return fs.readFileSync(SKILL_PATH, 'utf8'); } catch { return ''; }
}

function jsonResult(payload) {
  return {
    content: [
      { type: 'text', text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function toolError(message, extra = {}) {
  return { ...jsonResult({ error: message, ...extra, ok: false }), isError: true };
}

function extractAgentKey(req) {
  const auth = String(req.headers.authorization || '');
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  return String(req.headers['x-ai-agent-key'] || '').trim();
}

function agentAuth(req, res, next) {
  const rawKey = extractAgentKey(req);
  const session = game.authenticateAiAgentKey(rawKey);
  if (!session) return res.status(401).json({ error: 'Invalid or missing AI agent key' });
  req.agentSession = session;
  req.agentKey = rawKey;
  next();
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeBuilding(building) {
  return {
    ...building,
    ship_troops: parseJsonArray(building.ship_troops),
    ship_troops_template: parseJsonArray(building.ship_troops_template),
    footprint: game.BUILDING_DEFS[building.type]?.size || [1, 1],
  };
}

function getTownHallLevel(buildings) {
  return buildings.find((b) => b.type === 'town_hall')?.level || 1;
}

function defaultGridFor(type) {
  return type === 'port' ? 1 : 0;
}

function agentCanUseGrid(type, gridIndex) {
  if (Number(gridIndex) === 2) return type === 'flag';
  return type === 'port' ? Number(gridIndex) === 1 : Number(gridIndex) === 0;
}

function prioritizeAgentBuildSlots(type, gridIndex, slots, limit) {
  if (Number(gridIndex) !== 0 || type === 'port') return slots.slice(0, limit);
  const bodySlots = slots.filter((slot) => Number(slot.grid_z) >= 4);
  const edgeSlots = slots.filter((slot) => Number(slot.grid_z) < 4);
  return [...bodySlots, ...edgeSlots].slice(0, limit);
}

function normalizeTroopType(value) {
  const type = String(value || '').trim().toLowerCase();
  return game.TROOP_DEFS[type] ? type : null;
}

function normalizeShipTroop(value) {
  const lower = String(value || '').trim().toLowerCase();
  return VALID_SHIP_TROOPS.find((name) => name.toLowerCase() === lower) || null;
}

function shipPayload(portId, extra = {}) {
  const port = game.db.prepare('SELECT * FROM buildings WHERE id = ?').get(portId);
  const shipTroops = parseJsonArray(port?.ship_troops);
  const shipTemplate = parseJsonArray(port?.ship_troops_template);
  return {
    port_id: portId,
    ship_troops: shipTroops,
    ship_troops_template: shipTemplate,
    ship_level: port?.level || extra.ship_level || 1,
    ship_capacity: (port?.level || extra.ship_level || 1) * 3,
    ...extra,
  };
}

function normalize2(x, z) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

// Actual landing-line endpoints captured from Godot's AttackSystem log:
// "Ship 1/5 sailing to: (...)". Use these as the authoritative AI ship
// stop segment instead of re-deriving it from exported transforms, which can
// drift between editor/export/runtime coordinate spaces.
const AI_ATTACK_LANDING_A = { x: -2.24423, z: 1.775085 };
const AI_ATTACK_LANDING_B = { x: -0.140565, z: 4.027834 };
const AI_ATTACK_LINE_VECTOR = {
  x: AI_ATTACK_LANDING_B.x - AI_ATTACK_LANDING_A.x,
  z: AI_ATTACK_LANDING_B.z - AI_ATTACK_LANDING_A.z,
};
const AI_ATTACK_LINE_LENGTH = Math.hypot(AI_ATTACK_LINE_VECTOR.x, AI_ATTACK_LINE_VECTOR.z);
const AI_ATTACK_LINE_DIR = normalize2(AI_ATTACK_LINE_VECTOR.x, AI_ATTACK_LINE_VECTOR.z);

function roundedPoint(point) {
  return {
    x: Number(point.x.toFixed(4)),
    z: Number(point.z.toFixed(4)),
  };
}

function buildAttackLineInfo() {
  return {
    from: roundedPoint(AI_ATTACK_LANDING_A),
    to: roundedPoint(AI_ATTACK_LANDING_B),
    length: Number(AI_ATTACK_LINE_LENGTH.toFixed(4)),
    direction: roundedPoint(AI_ATTACK_LINE_DIR),
    slot_formula: 'slot i: lerp(from, to, i / 4), i = 0..4',
  };
}

function buildAttackSlots() {
  return Array.from({ length: AI_ATTACK_SLOT_COUNT }, (_unused, index) => {
    const t = AI_ATTACK_SLOT_COUNT === 1
      ? 0
      : index / (AI_ATTACK_SLOT_COUNT - 1);
    const stop = {
      x: AI_ATTACK_LANDING_A.x + AI_ATTACK_LINE_VECTOR.x * t,
      z: AI_ATTACK_LANDING_A.z + AI_ATTACK_LINE_VECTOR.z * t,
    };
    return {
      slot: index,
      t: Number(t.toFixed(4)),
      spawn_x: Number(stop.x.toFixed(4)),
      spawn_z: Number(stop.z.toFixed(4)),
      stop_x: Number(stop.x.toFixed(4)),
      stop_z: Number(stop.z.toFixed(4)),
    };
  });
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildTroopSpawnPoints(slot, troopCount) {
  const count = Math.max(0, Math.floor(Number(troopCount) || 0));
  if (count <= 0) return [];
  const spacing = 0.055;
  const baseScalar = clampNumber(Number(slot.t || 0) * AI_ATTACK_LINE_LENGTH, 0, AI_ATTACK_LINE_LENGTH);
  const isLeftEdge = Number(slot.slot) <= 0;
  const isRightEdge = Number(slot.slot) >= AI_ATTACK_SLOT_COUNT - 1;
  return Array.from({ length: count }, (_unused, index) => {
    let offset = (index - (count - 1) * 0.5) * spacing;
    if (isLeftEdge) offset = index * spacing;
    if (isRightEdge) offset = -index * spacing;
    const scalar = clampNumber(baseScalar + offset, 0, AI_ATTACK_LINE_LENGTH);
    return {
      x: Number((AI_ATTACK_LANDING_A.x + AI_ATTACK_LINE_DIR.x * scalar).toFixed(4)),
      z: Number((AI_ATTACK_LANDING_A.z + AI_ATTACK_LINE_DIR.z * scalar).toFixed(4)),
    };
  });
}

function defaultAttackSlotIndexes(count) {
  const patterns = {
    1: [2],
    2: [0, 4],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
  };
  return patterns[Math.max(1, Math.min(AI_ATTACK_SLOT_COUNT, count))];
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
    x: gc.grid_center_x + localX * cosR - localZ * sinR,
    z: gc.grid_center_z + localX * sinR + localZ * cosR,
  };
}

function buildingWorldPosition(building) {
  const def = game.BUILDING_DEFS[building.type] || { size: [1, 1] };
  const gridIndex = Number(building.grid_index || 0);
  const grid = combat.CANONICAL_GRID_CONFIGS?.[gridIndex] || combat.CANONICAL_GRID_CONFIGS?.[0];
  return gridToWorld(building.grid_x, building.grid_z, def.size?.[0] || 1, def.size?.[1] || 1, grid);
}

function getFleet(playerId) {
  return game.db
    .prepare(`
      SELECT id, level, ship_troops, ship_troops_template
      FROM buildings
      WHERE player_id = ? AND type = 'port' AND has_ship = 1
      ORDER BY id ASC
    `)
    .all(playerId)
    .map((port) => ({
      port_id: port.id,
      level: port.level,
      troops: parseJsonArray(port.ship_troops).filter((troop) => VALID_SHIP_TROOPS.includes(troop)),
      template: parseJsonArray(port.ship_troops_template).filter((troop) => VALID_SHIP_TROOPS.includes(troop)),
    }))
    .filter((ship) => ship.troops.length > 0)
    .slice(0, combat.MAX_SHIPS)
    .map((ship, ship_index) => ({ ship_index, ...ship }));
}

function troopLevelsForAction(playerId, troops) {
  const rows = game.getTroopLevels(playerId);
  const levels = {};
  for (const row of rows) {
    const canonical = VALID_SHIP_TROOPS.find((name) => name.toLowerCase() === String(row.troop_type).toLowerCase());
    if (canonical && troops.includes(canonical)) levels[canonical] = row.level;
  }
  return levels;
}

function normalizeTargetName(value) {
  const target = String(value || '').trim().toLowerCase();
  if (!target || target === 'auto') return 'town_hall';
  if (target === 'th') return 'town_hall';
  if (target === 'defense_tower' || target === 'defense_towers') return 'strongest_defense';
  return target;
}

function resolveBuildingTarget(selector = {}, defenderBuildings = []) {
  const byId = Number(selector.building_id ?? selector.id);
  if (Number.isInteger(byId) && byId > 0) {
    const found = defenderBuildings.find((b) => Number(b.id) === byId);
    if (found) return found;
    return null;
  }

  const targetType = normalizeTargetName(selector.target_type || selector.target);
  if (targetType === 'strongest_defense') {
    const defenses = defenderBuildings.filter((b) => AI_CANNON_TARGET_TYPES.includes(b.type));
    return defenses.sort((a, b) => (b.level - a.level) || (b.hp - a.hp) || (a.id - b.id))[0] || null;
  }
  if (targetType === 'weakest_defense') {
    const defenses = defenderBuildings.filter((b) => AI_CANNON_TARGET_TYPES.includes(b.type));
    return defenses.sort((a, b) => (a.hp - b.hp) || (b.level - a.level) || (a.id - b.id))[0] || null;
  }

  return defenderBuildings
    .filter((b) => b.type === targetType)
    .sort((a, b) => (b.level - a.level) || (b.hp - a.hp) || (a.id - b.id))[0] || null;
}

function isAiCannonTarget(building) {
  return !!building && AI_CANNON_TARGET_TYPES.includes(building.type);
}

function resolveWorldPoint(selector = {}, defenderBuildings = []) {
  const x = Number(selector.x);
  const z = Number(selector.z);
  if (Number.isFinite(x) && Number.isFinite(z)) return { x, z };
  const building = resolveBuildingTarget(selector, defenderBuildings);
  return building ? buildingWorldPosition(building) : null;
}

function normalizeAiShipsPlan(rawShips, fleet) {
  const slots = buildAttackSlots();
  const usedSlots = new Set();
  const usedShips = new Set();
  const requested = Array.isArray(rawShips) && rawShips.length > 0
    ? rawShips
    : defaultAttackSlotIndexes(fleet.length).map((slot, index) => ({ ship_index: index, slot }));

  const plan = [];
  for (let i = 0; i < requested.length; i++) {
    const row = requested[i] || {};
    const shipIndex = Number.isInteger(Number(row.ship_index)) ? Number(row.ship_index) : i;
    const slotIndex = Number(row.slot);
    if (!Number.isInteger(shipIndex) || shipIndex < 0 || shipIndex >= fleet.length) {
      return { error: `Invalid ship_index ${row.ship_index}; fleet has ${fleet.length} loaded ship(s)` };
    }
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= AI_ATTACK_SLOT_COUNT) {
      return { error: `Invalid slot ${row.slot}; use 0-${AI_ATTACK_SLOT_COUNT - 1}` };
    }
    if (usedShips.has(shipIndex)) return { error: `Ship ${shipIndex} used more than once` };
    if (usedSlots.has(slotIndex)) return { error: `Attack slot ${slotIndex} used more than once` };
    usedShips.add(shipIndex);
    usedSlots.add(slotIndex);
    plan.push({
      shipIndex,
      slot: slots[slotIndex],
      t: Number.isFinite(Number(row.t)) ? Math.max(0, Number(row.t)) : 0.2 + i * 0.45,
    });
  }
  return { plan };
}

function validateAiAttackEnergy(cannonShots = [], rallyMarker = null) {
  let energy = combat.CANNON_INITIAL_ENERGY;
  let shotNumber = 0;
  const sorted = [
    ...cannonShots.map((shot, index) => ({ kind: 'shot', t: cannonShotTime(shot, index) })),
    ...(rallyMarker ? [{ kind: 'rally', t: Number(rallyMarker.t ?? 5.0) }] : []),
  ].sort((a, b) => a.t - b.t);
  let rallyCount = 0;
  let lastShotT = -Infinity;
  for (const item of sorted) {
    if (item.kind === 'shot') {
      const reload = combat.CANNON_RELOAD_SEC || 1.0;
      if (item.t + 0.0001 < lastShotT + reload) {
        return { ok: false, error: `Cannon shots must be at least ${reload}s apart` };
      }
      lastShotT = item.t;
    }
    const cost = item.kind === 'shot'
      ? combat.cannonShotCost(++shotNumber)
      : ++rallyCount;
    if (energy < cost) return { ok: false, error: `Not enough cannon energy for ${item.kind} at t=${item.t}` };
    energy -= cost;
  }
  return { ok: true };
}

function normalizeCasualtyName(name) {
  return VALID_SHIP_TROOPS.find((troop) => troop.toLowerCase() === String(name || '').toLowerCase()) || String(name || '');
}

function applyAiCasualties(playerId, casualties) {
  if (!casualties || typeof casualties !== 'object') return;
  const remaining = {};
  for (const [name, count] of Object.entries(casualties)) {
    const normalized = normalizeCasualtyName(name);
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n > 0) remaining[normalized] = (remaining[normalized] || 0) + n;
  }
  if (Object.keys(remaining).length === 0) return;

  const ports = game.db
    .prepare('SELECT id, ship_troops FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1 ORDER BY id ASC')
    .all(playerId, 'port');
  for (const port of ports) {
    const troops = parseJsonArray(port.ship_troops);
    const filtered = [];
    for (const troop of troops) {
      const normalized = normalizeCasualtyName(troop);
      if (remaining[normalized] > 0) remaining[normalized]--;
      else filtered.push(troop);
    }
    if (filtered.length !== troops.length) {
      game.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(JSON.stringify(filtered), port.id);
    }
  }
}

function replayDuration(actions, verification) {
  const times = actions
    .map((action) => Number(action.t))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const maxAction = times.length ? Math.max(...times) : 0;
  const simTime = Number(verification?._simTimeSec || 0);
  return Math.max(maxAction, simTime, 8);
}

async function notifyAgentAction(agentKey, action, payload) {
  if (!agentKey || !action) return;
  try {
    await fetch(`${GAME_API_URL}/agent-events/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentKey}`,
      },
      body: JSON.stringify({ action, payload }),
    });
  } catch (error) {
    console.warn('[mcp] agent event notify failed:', error?.message || error);
  }
}

function buildCatalog(playerId) {
  const state = game.getFullPlayerState(playerId);
  const buildings = (state?.buildings || []).map(normalizeBuilding);
  const thLevel = getTownHallLevel(buildings);
  const counts = {};
  for (const b of buildings) counts[b.type] = (counts[b.type] || 0) + 1;

  const buildingsCatalog = {};
  for (const [type, def] of Object.entries(game.BUILDING_DEFS)) {
    const limits = game.TH_MAX_COUNT[type] || [];
    const maxAtTownHall = limits[Math.min(thLevel - 1, Math.max(0, limits.length - 1))] ?? def.max_count ?? null;
      buildingsCatalog[type] = {
      type,
      size: def.size,
      max_level: def.max_level,
      hp_levels: def.hp_levels,
      cost: def.cost || {},
      upgrade_cost: def.upgrade_cost || null,
      unlock_town_hall_level: game.TH_UNLOCK[type] || 1,
      max_at_current_town_hall: maxAtTownHall,
      placed: counts[type] || 0,
      default_grid_index: defaultGridFor(type),
      grid_rule: type === 'port'
        ? 'port only on grid_index 1'
        : 'base buildings only on main island grid_index 0; grid_index 2 is attack/deployment space',
    };
  }

  return {
    town_hall_level: thLevel,
    buildings: buildingsCatalog,
    troops: game.TROOP_DEFS,
    grids: game.GRID_SPECS,
    town_hall_upgrade_requires: game.TH_UPGRADE_REQUIRES,
  };
}

function buildBaseState(playerId, includeCatalog = true) {
  const state = game.getFullPlayerState(playerId);
  if (!state) return null;
  const buildings = (state.buildings || []).map(normalizeBuilding);
  const ships = buildings
    .filter((b) => b.type === 'port' && b.has_ship)
    .map((b) => ({
      port_id: b.id,
      port_level: b.level,
      capacity: b.level * 3,
      troops: b.ship_troops,
      template: b.ship_troops_template,
      open_slots: Math.max(0, b.level * 3 - b.ship_troops.length),
      grid_x: b.grid_x,
      grid_z: b.grid_z,
      grid_index: b.grid_index,
    }));

  const result = {
    player: {
      id: state.id,
      name: state.name,
      dex: state.dex,
      wallet: state.wallet,
      trophies: state.trophies,
      level: state.level,
    },
    resources: game.getResources(playerId),
    resource_caps: state.resource_caps,
    buildings,
    ships,
    troop_levels: state.troop_levels,
    production: game.getProductionStatus(playerId),
  };
  if (includeCatalog) result.catalog = buildCatalog(playerId);
  return result;
}

function loadShipTroop(playerId, portId, troopName) {
  return game.db.transaction(() => {
    const building = game.db
      .prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?')
      .get(portId, playerId);
    if (!building) return { error: 'Port not found' };
    if (building.type !== 'port' || !building.has_ship) return { error: 'No ship at this port' };

    const shipTroops = parseJsonArray(building.ship_troops);
    const capacity = building.level * 3;
    if (shipTroops.length >= capacity) return { error: 'Ship is full', capacity };
    if (!game.canAfford(playerId, SHIP_TROOP_COST, 0, 0)) {
      return { error: 'Not enough gold', cost: { gold: SHIP_TROOP_COST } };
    }

    game.subtractResources(playerId, SHIP_TROOP_COST, 0, 0);
    shipTroops.push(troopName);
    const troopsJson = JSON.stringify(shipTroops);
    game.db
      .prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?')
      .run(troopsJson, troopsJson, portId);
    return {
      success: true,
      port_id: portId,
      ship_troops: shipTroops,
      ship_level: building.level,
      ship_capacity: capacity,
      resources: game.getResources(playerId),
    };
  })();
}

function unloadShipTroops(playerId, portId) {
  const building = game.db
    .prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?')
    .get(portId, playerId);
  if (!building) return { error: 'Port not found' };
  if (building.type !== 'port') return { error: 'Building is not a port' };
  game.db
    .prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?')
    .run('[]', '[]', portId);
  return { success: true, port_id: portId, ship_troops: [] };
}

function swapShipTroop(playerId, portId, slot, troopName) {
  return game.db.transaction(() => {
    const building = game.db
      .prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?')
      .get(portId, playerId);
    if (!building) return { error: 'Port not found' };
    if (building.type !== 'port' || !building.has_ship) return { error: 'No ship at this port' };

    const shipTroops = parseJsonArray(building.ship_troops);
    if (slot < 0 || slot >= shipTroops.length) return { error: 'Invalid slot' };
    if (!game.canAfford(playerId, SHIP_TROOP_COST, 0, 0)) {
      return { error: 'Not enough gold', cost: { gold: SHIP_TROOP_COST } };
    }

    game.subtractResources(playerId, SHIP_TROOP_COST, 0, 0);
    shipTroops[slot] = troopName;
    game.db
      .prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?')
      .run(JSON.stringify(shipTroops), portId);
    return {
      success: true,
      port_id: portId,
      slot,
      troop_name: troopName,
      ship_troops: shipTroops,
      ship_level: building.level,
      ship_capacity: building.level * 3,
      resources: game.getResources(playerId),
    };
  })();
}

function reinforceShips(playerId) {
  return game.db.transaction(() => {
    const ports = game.db
      .prepare('SELECT * FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1')
      .all(playerId, 'port');

    let totalToRestore = 0;
    const shipsToRestore = [];
    for (const port of ports) {
      const current = parseJsonArray(port.ship_troops);
      const template = parseJsonArray(port.ship_troops_template);
      if (!template.length) continue;
      const currentCounts = {};
      for (const troop of current) currentCounts[troop] = (currentCounts[troop] || 0) + 1;
      const toAdd = [];
      for (const troop of template) {
        if (currentCounts[troop] > 0) currentCounts[troop]--;
        else toAdd.push(troop);
      }
      if (toAdd.length > 0) {
        totalToRestore += toAdd.length;
        shipsToRestore.push({ port, current, toAdd });
      }
    }

    if (totalToRestore === 0) return { success: true, cost: 0, restored: 0, ships: [], resources: game.getResources(playerId) };
    const totalCost = totalToRestore * REINFORCE_COST;
    if (!game.canAfford(playerId, totalCost, 0, 0)) {
      return { error: `Not enough gold (need ${totalCost})`, cost: { gold: totalCost } };
    }

    game.subtractResources(playerId, totalCost, 0, 0);
    const resultShips = [];
    for (const { port, current, toAdd } of shipsToRestore) {
      const capacity = port.level * 3;
      const restored = [...current, ...toAdd.slice(0, Math.max(0, capacity - current.length))];
      game.db
        .prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?')
        .run(JSON.stringify(restored), port.id);
      resultShips.push({ id: port.id, port_id: port.id, ship_troops: restored, ship_level: port.level, ship_capacity: capacity });
    }

    return { success: true, cost: totalCost, restored: totalToRestore, ships: resultShips, resources: game.getResources(playerId) };
  })();
}

function registerTools(server, session, agentKey) {
  const playerId = session.player.id;

  server.registerResource(
    'clash_agent_skill',
    'clash://agent/skill',
    {
      title: 'Clash AI Agent Skill',
      description: 'Operational instructions for AI agents playing Clash of Perps.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readSkill() }],
    })
  );

  server.registerTool(
    'get_base_state',
    {
      title: 'Get Base State',
      description: 'Inspect player resources, buildings, ships, troop levels, production, and optional catalog.',
      inputSchema: {
        include_catalog: z.boolean().optional(),
      },
    },
    async ({ include_catalog = true }) => jsonResult(buildBaseState(playerId, include_catalog))
  );

  server.registerTool(
    'get_building_catalog',
    {
      title: 'Get Building Catalog',
      description: 'List building definitions, costs, footprints, unlocks, troop definitions, and grid rules.',
    },
    async () => jsonResult(buildCatalog(playerId))
  );

  server.registerTool(
    'get_attack_slots',
    {
      title: 'Get Attack Slots',
      description: 'Return the 5 stable AI ship landing slots and the currently loaded fleet.',
    },
    async () => jsonResult({
      attack_line: buildAttackLineInfo(),
      slots: buildAttackSlots(),
      fleet: getFleet(playerId),
      rules: {
        max_slots: AI_ATTACK_SLOT_COUNT,
        max_ships: combat.MAX_SHIPS,
        cannon_initial_energy: combat.CANNON_INITIAL_ENERGY,
        cannon_shot_cost: 'shot number: 1, 2, 3...',
        cannon_reload_sec: combat.CANNON_RELOAD_SEC,
        cannon_damage_timing: 'damage applies on cannonball impact, not at launch',
        cannon_targets: 'AI cannon shots should target defensive towers only: turret or archer_tower',
        rally_marker_cost: 'marker number: 1, 2, 3...',
        request_shape: {
          ships: [{ ship_index: 0, slot: 0, t: 0.2 }],
          cannon_shots: [{ target_type: 'strongest_defense', t: 4.0 }, { target_type: 'weakest_defense', t: 5.1 }],
        },
      },
    })
  );

  server.registerTool(
    'execute_ai_attack_plan',
    {
      title: 'Execute AI Attack Plan',
      description: 'Find an enemy, validate one full AI attack plan, settle victory/defeat, store replay, and broadcast AI AGENT ATTACK replay to open browsers.',
      inputSchema: {
        ships: z.array(z.object({
          ship_index: z.number().int().min(0).max(4).optional(),
          slot: z.number().int().min(0).max(4),
          t: z.number().min(0).max(60).optional(),
        })).min(1).max(5).optional(),
        cannon_shots: z.array(z.object({
          t: z.number().min(0).max(120).optional(),
          building_id: z.number().int().positive().optional(),
          target_type: z.string().optional(),
          target: z.string().optional(),
        })).max(4).optional(),
        rally_marker: z.object({
          t: z.number().min(0).max(120).optional(),
          building_id: z.number().int().positive().optional(),
          target_type: z.string().optional(),
          target: z.string().optional(),
          x: z.number().optional(),
          z: z.number().optional(),
          flight_time: z.number().min(0).max(8).optional(),
        }).optional(),
      },
    },
    async ({ ships = [], cannon_shots = [], rally_marker = null }) => {
      const fleet = getFleet(playerId);
      if (fleet.length === 0) return toolError('No loaded ships. Buy ships and load troops first.');

      const shipsPlan = normalizeAiShipsPlan(ships, fleet);
      if (shipsPlan.error) return toolError(shipsPlan.error, { fleet, slots: buildAttackSlots() });
      const energyCheck = validateAiAttackEnergy(cannon_shots, rally_marker);
      if (!energyCheck.ok) return toolError(energyCheck.error);

      const enemy = game.findEnemy(playerId);
      if (enemy.error) return toolError(enemy.error, enemy);

      const defenderBuildings = game.getPlayerBuildings(enemy.id);
      if (!defenderBuildings.length) {
        game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
        return toolError('Enemy has no buildings');
      }

      const actions = [{
        type: 'battle_start',
        battle_session_id: enemy.battle_session_id,
        grid_config: combat.CANONICAL_GRID_CONFIG,
        grid_configs: combat.CANONICAL_GRID_CONFIGS,
        ai_agent: true,
      }];

      for (const planned of shipsPlan.plan) {
        const ship = fleet[planned.shipIndex];
        const troopSpawns = buildTroopSpawnPoints(planned.slot, ship.troops.length);
        actions.push({
          t: planned.t,
          type: 'place_ship',
          x: planned.slot.spawn_x,
          z: planned.slot.spawn_z,
          troop_x: planned.slot.spawn_x,
          troop_z: planned.slot.spawn_z,
          stop_x: planned.slot.stop_x,
          stop_z: planned.slot.stop_z,
          slot: planned.slot.slot,
          shipLevel: ship.level,
          port_id: ship.port_id,
          troops: ship.troops,
          troop_spawns: troopSpawns,
          troopLevels: troopLevelsForAction(playerId, ship.troops),
        });
      }

      for (let i = 0; i < cannon_shots.length; i++) {
        const shot = cannon_shots[i] || {};
        const target = resolveBuildingTarget(shot, defenderBuildings);
        if (!target) {
          game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
          return toolError(`Cannon target not found for shot ${i + 1}`);
        }
        if (!isAiCannonTarget(target)) {
          game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
          return toolError(`AI cannon shots must target defensive towers only (turret or archer_tower), not ${target.type}`);
        }
        actions.push({
          t: cannonShotTime(shot, i),
          type: 'cannon_fire',
          buildingId: target.id,
        });
      }

      if (rally_marker) {
        const hasExplicitPoint = Number.isFinite(Number(rally_marker.x)) && Number.isFinite(Number(rally_marker.z));
        const rallyBuilding = hasExplicitPoint ? null : resolveBuildingTarget(rally_marker, defenderBuildings);
        const point = hasExplicitPoint
          ? resolveWorldPoint(rally_marker, defenderBuildings)
          : (rallyBuilding ? buildingWorldPosition(rallyBuilding) : null);
        if (!point) {
          game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
          return toolError('Rally marker target not found');
        }
        actions.push({
          t: Number.isFinite(Number(rally_marker.t)) ? Number(rally_marker.t) : 5.0,
          type: 'rally_drop',
          ...(rallyBuilding ? { buildingId: rallyBuilding.id } : {}),
          x: Number(point.x.toFixed(4)),
          z: Number(point.z.toFixed(4)),
          flight_time: Number.isFinite(Number(rally_marker.flight_time)) ? Number(rally_marker.flight_time) : 0.8,
        });
      }

      const gameActions = actions.filter((action) => action.type !== 'battle_start');
      const troopLevelRows = game.getTroopLevels(playerId);
      const serverTroopLevels = {};
      for (const row of troopLevelRows) serverTroopLevels[row.troop_type] = row.level;

      const victoryCheck = verifyReplay({
        defenderBuildings,
        actions: gameActions,
        claimedResult: 'victory',
        gridConfig: combat.CANONICAL_GRID_CONFIG,
        gridConfigs: combat.CANONICAL_GRID_CONFIGS,
        serverTroopLevels,
      });
      const finalResult = victoryCheck.valid ? 'victory' : 'defeat';
      const verification = victoryCheck.valid
        ? victoryCheck
        : verifyReplay({
            defenderBuildings,
            actions: gameActions,
            claimedResult: 'defeat',
            gridConfig: combat.CANONICAL_GRID_CONFIG,
            gridConfigs: combat.CANONICAL_GRID_CONFIGS,
            serverTroopLevels,
          });
      if (!verification.valid) {
        game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
        game.storeReplay(playerId, enemy.id, actions, defenderBuildings, finalResult, 'rejected', verification.reason, null, verification);
        return toolError('AI attack rejected by replay verification', { reason: verification.reason });
      }

      const duration = replayDuration(actions, verification);
      actions.push({ type: 'battle_end', t: duration, result: finalResult });

      let battleResult;
      if (finalResult === 'victory') {
        battleResult = game.battleVictory(playerId, enemy.id, enemy.battle_session_id);
        if (battleResult.error) {
          game.storeReplay(playerId, enemy.id, actions, defenderBuildings, finalResult, 'error', battleResult.error, null, verification);
          return toolError(battleResult.error, battleResult);
        }
        game.storeReplay(playerId, enemy.id, actions, defenderBuildings, finalResult, 'accepted', verification.reason, battleResult.loot, verification);
      } else {
        battleResult = game.battleDefeat(playerId, enemy.id, enemy.battle_session_id);
        game.storeReplay(playerId, enemy.id, actions, defenderBuildings, finalResult, 'accepted', verification.reason, null, verification);
      }
      applyAiCasualties(playerId, verification.casualties);

      const livePayload = {
        replay_data: actions,
        buildings_snapshot: defenderBuildings,
        attacker_name: session.player.name || 'AI Agent',
        replay_label: AI_ATTACK_REPLAY_LABEL,
        duration,
        result: finalResult,
        enemy: {
          id: enemy.id,
          name: enemy.name,
          trophies: enemy.trophies,
          level: enemy.level,
        },
        battle: battleResult,
        verification: {
          reason: verification.reason,
          townHallHpPct: verification.townHallHpPct,
          buildingsDestroyed: verification.buildingsDestroyed,
          casualties: verification.casualties || {},
        },
        slots_used: shipsPlan.plan.map((row) => ({
          ship_index: row.shipIndex,
          slot: row.slot.slot,
          spawn_x: row.slot.spawn_x,
          spawn_z: row.slot.spawn_z,
          stop_x: row.slot.stop_x,
          stop_z: row.slot.stop_z,
        })),
        resources: game.getResources(playerId),
      };
      await notifyAgentAction(agentKey, 'ai_attack_replay', livePayload);
      return jsonResult({ success: true, ...livePayload });
    }
  );

  server.registerTool(
    'find_build_slots',
    {
      title: 'Find Build Slots',
      description: 'Find valid open cells before placing a building.',
      inputSchema: {
        type: z.string(),
        grid_index: z.number().int().min(0).max(2).optional(),
        limit: z.number().int().min(1).max(300).optional(),
      },
    },
    async ({ type, grid_index, limit = 20 }) => {
      const buildingType = String(type || '').trim();
      if (!game.BUILDING_DEFS[buildingType]) return toolError(`Unknown building type: ${type}`);
      const resolvedGrid = grid_index ?? defaultGridFor(buildingType);
      if (!agentCanUseGrid(buildingType, resolvedGrid)) {
        return toolError(`${buildingType} must use grid_index ${defaultGridFor(buildingType)}; grid_index 2 is attack/deployment space`);
      }
      const searchLimit = Number(resolvedGrid) === 0 && buildingType !== 'port' ? Math.max(limit, 250) : limit;
      const slots = prioritizeAgentBuildSlots(
        buildingType,
        resolvedGrid,
        game.findOpenBuildingSlots(playerId, buildingType, resolvedGrid, searchLimit),
        limit
      );
      return jsonResult({ type: buildingType, grid_index: resolvedGrid, slots });
    }
  );

  server.registerTool(
    'place_building',
    {
      title: 'Place Building',
      description: 'Place a building on grid 0 or a port on grid 1.',
      inputSchema: {
        type: z.string(),
        grid_x: z.number().int(),
        grid_z: z.number().int(),
        grid_index: z.number().int().min(0).max(2).optional(),
      },
    },
    async ({ type, grid_x, grid_z, grid_index }) => {
      const buildingType = String(type || '').trim();
      if (!game.BUILDING_DEFS[buildingType]) return toolError(`Unknown building type: ${type}`);
      const resolvedGrid = grid_index ?? defaultGridFor(buildingType);
      if (!agentCanUseGrid(buildingType, resolvedGrid)) {
        return toolError(`${buildingType} must use grid_index ${defaultGridFor(buildingType)}; grid_index 2 is attack/deployment space`);
      }
      const result = game.placeBuilding(playerId, buildingType, grid_x, grid_z, resolvedGrid);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'place_building', { building: result, resources: result.resources });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'upgrade_building',
    {
      title: 'Upgrade Building',
      description: 'Upgrade one owned building by id.',
      inputSchema: {
        building_id: z.number().int().positive(),
      },
    },
    async ({ building_id }) => {
      const result = game.upgradeBuilding(playerId, building_id);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'upgrade_building', { building_id, ...result });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'move_building',
    {
      title: 'Move Building',
      description: 'Move one owned building to another open grid position. Ports with docked ships cannot be moved.',
      inputSchema: {
        building_id: z.number().int().positive(),
        grid_x: z.number().int(),
        grid_z: z.number().int(),
        grid_index: z.number().int().min(0).max(2).optional(),
      },
    },
    async ({ building_id, grid_x, grid_z, grid_index }) => {
      const result = game.moveBuilding(playerId, building_id, grid_x, grid_z, grid_index ?? null);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'move_building', { building_id, ...result });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'remove_building',
    {
      title: 'Remove Building',
      description: 'Remove one owned building by id.',
      inputSchema: {
        building_id: z.number().int().positive(),
      },
    },
    async ({ building_id }) => {
      const result = game.removeBuilding(playerId, building_id);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'remove_building', { building_id, ...result, resources: game.getResources(playerId) });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'collect_resources',
    {
      title: 'Collect Resources',
      description: 'Collect one production building or all production buildings when building_id is omitted.',
      inputSchema: {
        building_id: z.number().int().positive().optional(),
      },
    },
    async ({ building_id }) => {
      const productionTypes = new Set(['mine', 'sawmill']);
      const targets = building_id
        ? game.getPlayerBuildings(playerId).filter((b) => b.id === building_id)
        : game.getPlayerBuildings(playerId).filter((b) => productionTypes.has(b.type));
      const results = targets.map((b) => ({ building_id: b.id, type: b.type, result: game.collectResources(playerId, b.id) }));
      const resources = game.getResources(playerId);
      const payload = { success: true, results, resources };
      if (results.some((row) => !row.result?.error)) {
        await notifyAgentAction(agentKey, 'collect_resources', payload);
      }
      return jsonResult(payload);
    }
  );

  server.registerTool(
    'buy_ship',
    {
      title: 'Buy Ship',
      description: 'Buy a ship at an owned port.',
      inputSchema: {
        port_id: z.number().int().positive(),
      },
    },
    async ({ port_id }) => {
      const result = game.buyShip(playerId, port_id);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'buy_ship', { port_id, ...shipPayload(port_id, result) });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'load_ship_troop',
    {
      title: 'Load Ship Troop',
      description: 'Load one troop into a ship at a port. Costs 100 gold.',
      inputSchema: {
        port_id: z.number().int().positive(),
        troop_name: z.string(),
      },
    },
    async ({ port_id, troop_name }) => {
      const normalized = normalizeShipTroop(troop_name);
      if (!normalized) return toolError(`Invalid troop_name. Use one of: ${VALID_SHIP_TROOPS.join(', ')}`);
      const result = loadShipTroop(playerId, port_id, normalized);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'load_ship_troop', { port_id, troop_name: normalized, ...result });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'unload_ship_troops',
    {
      title: 'Unload Ship Troops',
      description: 'Remove all troops from a ship loadout at a port.',
      inputSchema: {
        port_id: z.number().int().positive(),
      },
    },
    async ({ port_id }) => {
      const result = unloadShipTroops(playerId, port_id);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'unload_ship_troops', { port_id, ...shipPayload(port_id, result) });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'swap_ship_troop',
    {
      title: 'Swap Ship Troop',
      description: 'Replace one troop slot on a ship. Costs 100 gold and does not change the reinforcement template.',
      inputSchema: {
        port_id: z.number().int().positive(),
        slot: z.number().int().min(0),
        troop_name: z.string(),
      },
    },
    async ({ port_id, slot, troop_name }) => {
      const normalized = normalizeShipTroop(troop_name);
      if (!normalized) return toolError(`Invalid troop_name. Use one of: ${VALID_SHIP_TROOPS.join(', ')}`);
      const result = swapShipTroop(playerId, port_id, slot, normalized);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'swap_ship_troop', { port_id, ...result });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'reinforce_ships',
    {
      title: 'Reinforce Ships',
      description: 'Restore missing troops from each ship template after battle. Costs 50 gold per restored troop.',
    },
    async () => {
      const result = reinforceShips(playerId);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'reinforce_ships', result);
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'upgrade_troop',
    {
      title: 'Upgrade Troop',
      description: 'Upgrade a troop type: knight, mage, barbarian, archer, or ranger.',
      inputSchema: {
        troop_type: z.string(),
      },
    },
    async ({ troop_type }) => {
      const normalized = normalizeTroopType(troop_type);
      if (!normalized) return toolError('Invalid troop_type. Use knight, mage, barbarian, archer, or ranger.');
      const result = game.upgradeTroop(playerId, normalized);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'upgrade_troop', { troop_type: normalized, ...result });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );
}

function createServer(session, agentKey) {
  const server = new McpServer({
    name: 'clash-of-perps-ai',
    version: '0.1.0',
  });
  registerTools(server, session, agentKey);
  return server;
}

const app = express();
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return cb(null, true);
    if (origin === 'https://clashofperps.fun' || origin === 'https://www.clashofperps.fun') return cb(null, true);
    return cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'clash-ai-mcp' });
});

app.get('/skill', (_req, res) => {
  res.type('text/markdown').send(readSkill());
});

app.all('/mcp', agentAuth, async (req, res) => {
  const mcpServer = createServer(req.agentSession, req.agentKey);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close().catch(() => {});
    mcpServer.close().catch(() => {});
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[mcp] request failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP request failed' });
    }
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Clash AI MCP running on http://127.0.0.1:${PORT}/mcp`);
});
