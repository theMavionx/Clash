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
const SKILL_PATHS = [
  process.env.CLASH_MCP_SKILLS_PATH,
  path.resolve(__dirname, '..', 'SKILLS.md'),
  path.resolve(__dirname, '..', 'SKILL.md'),
  path.resolve(__dirname, '..', 'AGENT_SKILL.md'),
].filter(Boolean);
const PORT = Number(process.env.CLASH_MCP_PORT || 4100);
const HOST = process.env.CLASH_MCP_HOST || '127.0.0.1';
const PUBLIC_URL = (process.env.CLASH_MCP_PUBLIC_URL || 'https://mcp.clashofperps.fun').replace(/\/+$/, '');
const GAME_API_URL = (process.env.CLASH_GAME_API_URL || 'http://127.0.0.1:4000/api').replace(/\/+$/, '');
const DEFAULT_CORS_ORIGINS = [
  'https://clashofperps.fun',
  'https://www.clashofperps.fun',
  'https://mcp.clashofperps.fun',
];
const CORS_ORIGINS = (process.env.CLASH_MCP_CORS_ORIGINS || DEFAULT_CORS_ORIGINS.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const RATE_LIMIT_WINDOW_MS = Number(process.env.CLASH_MCP_RATE_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.CLASH_MCP_RATE_LIMIT || 180);
const AI_ATTACK_COOLDOWN_MS = Number(process.env.CLASH_MCP_AI_ATTACK_COOLDOWN_MS || 60_000);
const VALID_SHIP_TROOPS = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger'];
const SHIP_TROOP_COST = 100;
const REINFORCE_COST = 50;
const AI_ATTACK_SLOT_COUNT = 5;
const AI_ATTACK_REPLAY_LABEL = 'AI ONLINE BATTLE';
const AI_CANNON_TARGET_TYPES = ['turret', 'archer_tower'];
const AI_CANNON_DEFAULT_START_SEC = 4.0;
const AI_CANNON_DEFAULT_STEP_SEC = (combat.CANNON_RELOAD_SEC || 1.0) + 0.1;
const AI_AUTO_CANNON_MAX_SHOTS = 3;
const AI_AUTO_RALLY_T_SEC = 5.0;
const AI_AUTO_RALLY_FLIGHT_SEC = 0.8;
const BATTLE_DEBUG_TRACE = process.env.CLASH_BATTLE_DEBUG_TRACE !== '0';

function defaultCannonShotTime(index) {
  return AI_CANNON_DEFAULT_START_SEC + index * AI_CANNON_DEFAULT_STEP_SEC;
}

function cannonShotTime(shot, index) {
  const t = Number(shot?.t);
  return Number.isFinite(t) ? t : defaultCannonShotTime(index);
}

function readSkill() {
  for (const skillPath of SKILL_PATHS) {
    try { return fs.readFileSync(skillPath, 'utf8'); } catch {}
  }
  return '';
}

function publicUrlForReq(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const host = req.get('host') || `127.0.0.1:${PORT}`;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function protectedResourceMetadata(req) {
  const base = publicUrlForReq(req);
  return {
    resource: `${base}/mcp`,
    authorization_servers: ['https://clashofperps.fun'],
    scopes_supported: ['clash:agent'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${base}/skills.md`,
    clash_agent_key_issuer: 'https://clashofperps.fun/profile',
    note: 'Phase 1 uses player-generated cop_ai_ bearer keys. Full OAuth can be layered on top of this protected resource metadata later.',
  };
}

const rateBuckets = new Map();
const aiAttackCooldowns = new Map();

function reserveAiAttackCooldown(playerId) {
  if (!Number.isFinite(AI_ATTACK_COOLDOWN_MS) || AI_ATTACK_COOLDOWN_MS <= 0) return { ok: true };
  const now = Date.now();
  const current = aiAttackCooldowns.get(playerId);
  if (current && now < current.until) {
    return {
      ok: false,
      retryAfterMs: current.until - now,
      resetAt: current.until,
    };
  }
  aiAttackCooldowns.set(playerId, {
    startedAt: now,
    until: now + AI_ATTACK_COOLDOWN_MS,
  });
  return { ok: true };
}

function releaseAiAttackCooldown(playerId) {
  aiAttackCooldowns.delete(playerId);
}

function rateLimit(req, res, next) {
  if (!Number.isFinite(RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS <= 0 || !Number.isFinite(RATE_LIMIT_MAX) || RATE_LIMIT_MAX <= 0) {
    return next();
  }
  const now = Date.now();
  const rawKey = extractAgentKey(req);
  const bucketKey = rawKey ? `agent:${rawKey.slice(0, 24)}` : `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
  const bucket = rateBuckets.get(bucketKey) || { resetAt: now + RATE_LIMIT_WINDOW_MS, count: 0 };
  if (now > bucket.resetAt) {
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(bucketKey, bucket);
  res.set('RateLimit-Limit', String(RATE_LIMIT_MAX));
  res.set('RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_MAX - bucket.count)));
  res.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
  if (bucket.count > RATE_LIMIT_MAX) {
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    game.logMcpEvent({
      tool: 'mcp_http',
      status: 'rate_limited',
      error: 'MCP rate limit exceeded',
      metadata: { resetAt: bucket.resetAt, count: bucket.count, limit: RATE_LIMIT_MAX },
      ...requestLogMeta(req),
    });
    return res.status(429).json({ error: 'MCP rate limit exceeded' });
  }
  return next();
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

function requestLogMeta(req) {
  return {
    ip: req?.ip || req?.socket?.remoteAddress || '',
    ua: req?.get?.('user-agent') || '',
  };
}

function toolResultErrorMessage(result) {
  if (!result?.isError) return '';
  const text = String(result?.content?.[0]?.text || '');
  if (!text) return 'Tool returned an error';
  try {
    const parsed = JSON.parse(text);
    return String(parsed.error || parsed.message || text);
  } catch {
    return text.slice(0, 500);
  }
}

function instrumentMcpTools(server, session, reqMeta = {}) {
  const rawRegisterTool = server.registerTool.bind(server);
  const keyInfo = session?.key || {};
  const playerInfo = session?.player || {};
  server.registerTool = (name, config, handler) => rawRegisterTool(name, config, async (args, extra) => {
    const startedAt = Date.now();
    let status = 'ok';
    let error = '';
    try {
      const result = await handler(args, extra);
      if (result?.isError) {
        status = 'error';
        error = toolResultErrorMessage(result);
      }
      return result;
    } catch (err) {
      status = 'exception';
      error = err?.message || String(err);
      throw err;
    } finally {
      game.logMcpEvent({
        playerId: playerInfo.id || null,
        aiKeyId: keyInfo.id || null,
        aiKeyPrefix: keyInfo.key_prefix || null,
        tool: name,
        status,
        durationMs: Date.now() - startedAt,
        error,
        input: args || {},
        ip: reqMeta.ip || '',
        ua: reqMeta.ua || '',
      });
    }
  });
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
  if (!session) {
    const metadataUrl = `${publicUrlForReq(req)}/.well-known/oauth-protected-resource`;
    res.set('WWW-Authenticate', `Bearer realm="clash-ai-mcp", resource_metadata="${metadataUrl}"`);
    game.logMcpEvent({
      tool: 'mcp_auth',
      status: 'auth_error',
      error: 'Invalid or missing AI agent key',
      metadata: { resource_metadata: metadataUrl },
      ...requestLogMeta(req),
    });
    return res.status(401).json({
      error: 'Invalid or missing AI agent key',
      resource_metadata: metadataUrl,
      skill: `${publicUrlForReq(req)}/skills.md`,
    });
  }
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

function dist2(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dz = Number(a.z) - Number(b.z);
  return Math.sqrt(dx * dx + dz * dz);
}

function combatBuildingValue(type) {
  const values = {
    turret: 7.0,
    archer_tower: 6.5,
    tombstone: 5.5,
    storage: 3.2,
    barn: 2.7,
    town_hall: 2.5,
    mine: 2.2,
    sawmill: 2.2,
    port: 1.5,
  };
  return values[type] || 1.0;
}

function landingBuildingValue(type) {
  const values = {
    tombstone: 4.5,
    storage: 3.8,
    barn: 3.3,
    mine: 3.0,
    sawmill: 3.0,
    port: 2.2,
    town_hall: 1.8,
    turret: 1.2,
    archer_tower: 1.2,
  };
  return values[type] || 1.0;
}

function defenseThreatScore(building) {
  const type = building?.type;
  if (!AI_CANNON_TARGET_TYPES.includes(type)) return 0;
  const level = Math.max(1, Math.floor(Number(building.level) || 1));
  const stats = combat.DEFENSE_STATS?.[type]?.[level] || combat.DEFENSE_STATS?.[type]?.[1] || {};
  const damage = Number(stats.damage || 0);
  const fireRate = Math.max(0.1, Number(stats.fireRate || 1));
  return (damage / fireRate) + level * 20 + Math.max(0, Number(building.hp || 0)) / 45;
}

function slotEntryScores(defenderBuildings) {
  const slots = buildAttackSlots();
  const positioned = defenderBuildings.map((building) => ({
    ...building,
    world: buildingWorldPosition(building),
  }));

  return slots.map((slot) => {
    const point = { x: slot.stop_x, z: slot.stop_z };
    let valueScore = 0;
    let threatPenalty = 0;
    let nearestUseful = Infinity;
    for (const building of positioned) {
      const d = dist2(point, building.world);
      const value = landingBuildingValue(building.type);
      valueScore += value / (0.65 + d);
      if (building.type !== 'town_hall' && value >= 2) nearestUseful = Math.min(nearestUseful, d);
      const threat = defenseThreatScore(building);
      if (threat > 0) threatPenalty += threat / (0.45 + d) * 0.032;
    }
    return {
      slot: slot.slot,
      score: valueScore - threatPenalty - (Number.isFinite(nearestUseful) ? nearestUseful * 0.08 : 0),
      valueScore,
      threatPenalty,
      nearestUseful,
    };
  });
}

function contiguousSlotsAround(bestSlot, count, scores) {
  const n = Math.max(1, Math.min(AI_ATTACK_SLOT_COUNT, Math.floor(Number(count) || 1)));
  if (n >= AI_ATTACK_SLOT_COUNT) return [0, 1, 2, 3, 4];
  if (n === 1) return [bestSlot];
  const starts = [];
  for (let start = 0; start <= AI_ATTACK_SLOT_COUNT - n; start++) starts.push(start);
  const bestStart = starts
    .map((start) => {
      const window = Array.from({ length: n }, (_unused, offset) => start + offset);
      const score = window.reduce((sum, slot) => sum + (scores.find((s) => s.slot === slot)?.score || 0), 0)
        - Math.abs((start + (n - 1) / 2) - bestSlot) * 0.35;
      return { start, score };
    })
    .sort((a, b) => b.score - a.score || Math.abs(a.start - bestSlot) - Math.abs(b.start - bestSlot))[0]?.start || 0;
  return Array.from({ length: n }, (_unused, offset) => bestStart + offset);
}

function buildAutoShipPlan(fleet, defenderBuildings) {
  const count = Math.max(1, Math.min(AI_ATTACK_SLOT_COUNT, fleet.length));
  const scores = slotEntryScores(defenderBuildings);
  const bestScore = scores
    .slice()
    .sort((a, b) => b.score - a.score || Math.abs(a.slot - 2) - Math.abs(b.slot - 2))[0] || { slot: 2, score: 0, threatPenalty: 0 };
  const bestSlot = bestScore.slot;
  const highPressure = bestScore.score < -45 || bestScore.threatPenalty > 65;
  const pressurePatterns = {
    1: [bestSlot],
    2: [0, 4],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
  };
  const slots = highPressure
    ? pressurePatterns[count]
    : contiguousSlotsAround(bestSlot, count, scores);
  return {
    ships: slots.map((slot, index) => ({
      ship_index: index,
      slot,
      t: Number((0.2 + index * 0.35).toFixed(2)),
    })),
    analysis: {
      best_slot: bestSlot,
      high_pressure: highPressure,
      slot_scores: scores.map((score) => ({
        slot: score.slot,
        score: Number(score.score.toFixed(3)),
        value: Number(score.valueScore.toFixed(3)),
        threat_penalty: Number(score.threatPenalty.toFixed(3)),
      })),
    },
  };
}

function buildAutoCannonShots(defenderBuildings, shipsPlan, maxShots = AI_AUTO_CANNON_MAX_SHOTS) {
  const slots = buildAttackSlots();
  const usedSlots = (shipsPlan || []).map((row) => slots[Number(row.slot)]).filter(Boolean);
  const entryCenter = usedSlots.length
    ? {
        x: usedSlots.reduce((sum, slot) => sum + slot.stop_x, 0) / usedSlots.length,
        z: usedSlots.reduce((sum, slot) => sum + slot.stop_z, 0) / usedSlots.length,
      }
    : { x: slots[2].stop_x, z: slots[2].stop_z };

  const ranked = defenderBuildings
    .filter((building) => AI_CANNON_TARGET_TYPES.includes(building.type))
    .map((building) => {
      const world = buildingWorldPosition(building);
      const d = dist2(entryCenter, world);
      return {
        building,
        score: defenseThreatScore(building) + Math.max(0, 3.5 - d) * 65,
      };
    })
    .sort((a, b) => b.score - a.score || (b.building.level - a.building.level) || (a.building.id - b.building.id))
    .map((row) => ({ ...row, assignedDamage: 0 }));
  if (ranked.length === 0) return [];

  const shots = [];
  const preferredOrder = [0, 1, 0, 2, 0, 3];
  for (let index = 0; index < maxShots; index++) {
    let target = ranked[preferredOrder[index] ?? index] || ranked[0];
    if (target.assignedDamage >= Number(target.building.hp || target.building.max_hp || 0)) {
      target = ranked.find((row) => row.assignedDamage < Number(row.building.hp || row.building.max_hp || 0)) || target;
    }
    target.assignedDamage += combat.CANNON_DAMAGE;
    shots.push({
      building_id: target.building.id,
      target_type: target.building.type,
      t: Number((AI_CANNON_DEFAULT_START_SEC + index * AI_CANNON_DEFAULT_STEP_SEC).toFixed(2)),
    });
  }
  return shots;
}

function buildAutoRallyMarker(defenderBuildings, shipsPlan, cannonShots) {
  const slots = buildAttackSlots();
  const usedSlots = (shipsPlan || []).map((row) => slots[Number(row.slot)]).filter(Boolean);
  const entryCenter = usedSlots.length
    ? {
        x: usedSlots.reduce((sum, slot) => sum + slot.stop_x, 0) / usedSlots.length,
        z: usedSlots.reduce((sum, slot) => sum + slot.stop_z, 0) / usedSlots.length,
      }
    : { x: slots[2].stop_x, z: slots[2].stop_z };
  const cannonTargetIds = new Set((cannonShots || []).map((shot) => Number(shot.building_id)).filter(Boolean));
  const candidates = defenderBuildings
    .filter((building) => building.type !== 'town_hall')
    .map((building) => {
      const world = buildingWorldPosition(building);
      const d = dist2(entryCenter, world);
      const cannoned = cannonTargetIds.has(Number(building.id));
      const expectedHp = Number(building.hp || building.max_hp || 0) - (cannoned ? combat.CANNON_DAMAGE : 0);
      const value = combatBuildingValue(building.type) + (building.type === 'tombstone' ? 1.5 : 0);
      return {
        building,
        score: value / (0.35 + d) + (building.type === 'tombstone' ? 2.5 : 0),
        expectedHp,
      };
    })
    .filter((row) => row.expectedHp > 0)
    .sort((a, b) => b.score - a.score || (a.building.id - b.building.id));
  const nonDefense = candidates.filter((row) => !AI_CANNON_TARGET_TYPES.includes(row.building.type));
  const target = (nonDefense[0] || candidates[0])?.building;
  if (!target) return null;
  return {
    t: AI_AUTO_RALLY_T_SEC,
    building_id: target.id,
    target_type: target.type,
    flight_time: AI_AUTO_RALLY_FLIGHT_SEC,
  };
}

function buildAutoAttackPlan(fleet, defenderBuildings, options = {}) {
  const ships = buildAutoShipPlan(fleet, defenderBuildings);
  const reserveMarkerEnergy = !!options.reserveMarkerEnergy;
  let cannonShots = buildAutoCannonShots(defenderBuildings, ships.ships, AI_AUTO_CANNON_MAX_SHOTS);
  const rallyMarker = reserveMarkerEnergy ? null : buildAutoRallyMarker(defenderBuildings, ships.ships, cannonShots);
  if (!reserveMarkerEnergy && !rallyMarker) {
    cannonShots = buildAutoCannonShots(defenderBuildings, ships.ships, 4);
  }
  return {
    ships: ships.ships,
    cannon_shots: cannonShots,
    rally_marker: rallyMarker,
    analysis: ships.analysis,
  };
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
    x: gc.grid_center_x + localX * cosR + localZ * sinR,
    z: gc.grid_center_z - localX * sinR + localZ * cosR,
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

function registerTools(server, session, agentKey, reqMeta = {}) {
  instrumentMcpTools(server, session, reqMeta);
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

  server.registerPrompt(
    'clash_agent_onboarding',
    {
      title: 'Clash Agent Onboarding',
      description: 'Load the current Clash of Perps AI playbook before managing a base or launching attacks.',
    },
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: readSkill(),
        },
      }],
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
        auto_tactics: 'By default execute_ai_attack_plan analyzes the enemy base, chooses focused-or-split landing slots, fires cannon shots at high-threat defenses, and drops one rally marker on a nearby non-defense priority target when useful. Pass auto_tactics:false for a fully manual plan.',
        request_shape: {
          auto_tactics: true,
          ships: [{ ship_index: 0, slot: 0, t: 0.2 }],
          cannon_shots: [{ target_type: 'strongest_defense', t: 4.0 }, { target_type: 'weakest_defense', t: 5.1 }],
          rally_marker: { target_type: 'tombstone', t: 5.0, flight_time: 0.8 },
        },
      },
    })
  );

  server.registerTool(
    'execute_ai_attack_plan',
    {
      title: 'Execute AI Attack Plan',
      description: 'Find an enemy, validate one full AI attack plan, settle victory/defeat, store replay, and broadcast a live AI online battle to open browsers. Limited to one MCP battle per player per minute.',
      inputSchema: {
        ships: z.array(z.object({
          ship_index: z.number().int().min(0).max(4).optional(),
          slot: z.number().int().min(0).max(4),
          t: z.number().min(0).max(60).optional(),
        })).min(1).max(5).optional(),
        auto_tactics: z.boolean().optional(),
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
    async ({ ships = [], auto_tactics = true, cannon_shots = [], rally_marker = null }) => {
      const fleet = getFleet(playerId);
      if (fleet.length === 0) return toolError('No loaded ships. Buy ships and load troops first.');

      const cooldown = reserveAiAttackCooldown(playerId);
      if (!cooldown.ok) {
        const retryAfterSeconds = Math.max(1, Math.ceil(cooldown.retryAfterMs / 1000));
        return toolError(`AI battle cooldown active. Wait ${retryAfterSeconds}s before launching another MCP battle.`, {
          retry_after_seconds: retryAfterSeconds,
          reset_at: new Date(cooldown.resetAt).toISOString(),
        });
      }
      const abortAiAttack = (message, extra = {}) => {
        releaseAiAttackCooldown(playerId);
        return toolError(message, extra);
      };

      const enemy = game.findEnemy(playerId);
      if (enemy.error) return abortAiAttack(enemy.error, enemy);

      const defenderBuildings = game.getPlayerBuildings(enemy.id);
      if (!defenderBuildings.length) {
        game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
        return abortAiAttack('Enemy has no buildings');
      }

      const hasShipsInput = Array.isArray(ships) && ships.length > 0;
      const hasCannonInput = Array.isArray(cannon_shots) && cannon_shots.length > 0;
      const hasRallyInput = !!rally_marker;
      const autoPlan = auto_tactics ? buildAutoAttackPlan(fleet, defenderBuildings, { reserveMarkerEnergy: hasRallyInput }) : null;
      const resolvedShips = hasShipsInput ? ships : (autoPlan?.ships || ships);
      const resolvedCannonShots = hasCannonInput ? cannon_shots : (autoPlan?.cannon_shots || cannon_shots);
      const resolvedRallyMarker = hasRallyInput ? rally_marker : (autoPlan?.rally_marker || rally_marker);

      const shipsPlan = normalizeAiShipsPlan(resolvedShips, fleet);
      if (shipsPlan.error) {
        game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
        return abortAiAttack(shipsPlan.error, { fleet, slots: buildAttackSlots() });
      }
      const energyCheck = validateAiAttackEnergy(resolvedCannonShots, resolvedRallyMarker);
      if (!energyCheck.ok) {
        game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
        return abortAiAttack(energyCheck.error);
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
          ship_index: planned.shipIndex,
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

      for (let i = 0; i < resolvedCannonShots.length; i++) {
        const shot = resolvedCannonShots[i] || {};
        const target = resolveBuildingTarget(shot, defenderBuildings);
        if (!target) {
          game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
          return abortAiAttack(`Cannon target not found for shot ${i + 1}`);
        }
        if (!isAiCannonTarget(target)) {
          game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
          return abortAiAttack(`AI cannon shots must target defensive towers only (turret or archer_tower), not ${target.type}`);
        }
        actions.push({
          t: cannonShotTime(shot, i),
          type: 'cannon_fire',
          buildingId: target.id,
        });
      }

      if (resolvedRallyMarker) {
        const rallyBuilding = resolveBuildingTarget(resolvedRallyMarker, defenderBuildings);
        const hasExplicitPoint = Number.isFinite(Number(resolvedRallyMarker.x)) && Number.isFinite(Number(resolvedRallyMarker.z));
        const point = rallyBuilding
          ? buildingWorldPosition(rallyBuilding)
          : (hasExplicitPoint ? resolveWorldPoint(resolvedRallyMarker, defenderBuildings) : null);
        if (!point) {
          game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
          return abortAiAttack('Rally marker target not found');
        }
        actions.push({
          t: Number.isFinite(Number(resolvedRallyMarker.t)) ? Number(resolvedRallyMarker.t) : 5.0,
          type: 'rally_drop',
          ...(rallyBuilding ? { buildingId: rallyBuilding.id } : {}),
          x: Number(point.x.toFixed(4)),
          z: Number(point.z.toFixed(4)),
          flight_time: Number.isFinite(Number(resolvedRallyMarker.flight_time)) ? Number(resolvedRallyMarker.flight_time) : 0.8,
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
        debugTrace: BATTLE_DEBUG_TRACE,
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
            debugTrace: BATTLE_DEBUG_TRACE,
          });
      if (!verification.valid) {
        game.finishBattleSession(enemy.battle_session_id, playerId, enemy.id, 'cancelled');
        game.storeReplay(playerId, enemy.id, actions, defenderBuildings, finalResult, 'rejected', verification.reason, null, verification);
        return abortAiAttack('AI attack rejected by replay verification', { reason: verification.reason });
      }
      if (BATTLE_DEBUG_TRACE) {
        console.log(`[MCP AI ATTACK TRACE] session=${enemy.battle_session_id} enemy=${enemy.id} result=${finalResult} simTime=${verification._simTimeSec || '?'} events=${verification._traceEvents || 0} dropped=${verification._traceDropped || 0}`);
      }

      const duration = replayDuration(actions, verification);
      actions.push({ type: 'battle_end', t: duration, result: finalResult });

      let battleResult;
      if (finalResult === 'victory') {
        battleResult = game.battleVictory(playerId, enemy.id, enemy.battle_session_id);
        if (battleResult.error) {
          game.storeReplay(playerId, enemy.id, actions, defenderBuildings, finalResult, 'error', battleResult.error, null, verification);
          return abortAiAttack(battleResult.error, battleResult);
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
          simTimeSec: verification._simTimeSec,
          traceEvents: verification._traceEvents,
          traceDropped: verification._traceDropped,
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
        strategy: {
          auto_tactics,
          generated: {
            ships: !hasShipsInput,
            cannon_shots: !hasCannonInput,
            rally_marker: !hasRallyInput && !!resolvedRallyMarker,
          },
          plan: {
            ships: resolvedShips,
            cannon_shots: resolvedCannonShots,
            rally_marker: resolvedRallyMarker,
          },
          analysis: autoPlan?.analysis || null,
        },
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
app.set('trust proxy', 1);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return cb(null, true);
    if (CORS_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'clash-ai-mcp',
    transport: 'streamable-http',
    mcp_endpoint: `${PUBLIC_URL}/mcp`,
    skill: `${PUBLIC_URL}/skills.md`,
  });
});

app.get('/skill', (_req, res) => {
  res.type('text/markdown').send(readSkill());
});

app.get('/skills.md', (_req, res) => {
  res.type('text/markdown').send(readSkill());
});

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json(protectedResourceMetadata(req));
});

app.all('/mcp', rateLimit, agentAuth, async (req, res) => {
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

app.listen(PORT, HOST, () => {
  console.log(`Clash AI MCP running on http://${HOST}:${PORT}/mcp`);
  console.log(`Public MCP endpoint: ${PUBLIC_URL}/mcp`);
});
