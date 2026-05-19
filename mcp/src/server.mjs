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
const futuresDb = require('../../server-futures/db.js');
const decibel = require('../../server-futures/decibel.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATHS = [
  process.env.CLASH_MCP_SKILLS_PATH,
  path.resolve(__dirname, '..', 'SKILLS.md'),
  path.resolve(__dirname, '..', 'SKILL.md'),
  path.resolve(__dirname, '..', 'AGENT_SKILL.md'),
].filter(Boolean);
const DECIBEL_SKILL_PATHS = [
  process.env.CLASH_MCP_DECIBEL_SKILL_PATH,
  path.resolve(__dirname, '..', 'DECIBEL_TRADING_SKILL.md'),
  path.resolve(__dirname, '..', '..', '.agents', 'skills', 'clash-decibel-trading', 'SKILL.md'),
].filter(Boolean);
const PORT = Number(process.env.CLASH_MCP_PORT || 4100);
const HOST = process.env.CLASH_MCP_HOST || '0.0.0.0';
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
const AI_ATTACK_MIN_TOTAL_TROOPS = Math.max(1, Math.min(15, Math.floor(Number(process.env.CLASH_MCP_AI_ATTACK_MIN_TOTAL_TROOPS || 3))));
const AI_ATTACK_DEFAULT_LOADOUT = parseDefaultAttackLoadout(process.env.CLASH_MCP_AI_ATTACK_DEFAULT_LOADOUT || 'Mage,Mage,Knight');
const AI_ATTACK_SLOT_COUNT = 5;
const AI_ATTACK_REPLAY_LABEL = 'AI ONLINE BATTLE';
const AI_CANNON_TARGET_TYPES = ['turret', 'archer_tower'];
const AI_CANNON_DEFAULT_START_SEC = 4.0;
const AI_CANNON_DEFAULT_STEP_SEC = (combat.CANNON_RELOAD_SEC || 1.0) + 0.1;
const AI_AUTO_CANNON_MAX_SHOTS = 3;
const AI_AUTO_RALLY_T_SEC = 5.0;
const AI_AUTO_RALLY_FLIGHT_SEC = 0.8;
const BATTLE_DEBUG_TRACE = process.env.CLASH_BATTLE_DEBUG_TRACE !== '0';
const DECIBEL_MIN_REWARD_NOTIONAL_USD = 1;
const DECIBEL_MAX_REWARD_NOTIONAL_USD = 10_000_000;
const DEFAULT_DECIBEL_BUILDER_FEE_BPS = 10;
const DECIBEL_BUILDER_FEE_BPS_RAW = Number(process.env.DECIBEL_BUILDER_FEE_BPS || DEFAULT_DECIBEL_BUILDER_FEE_BPS);
const DECIBEL_BUILDER_FEE_BPS = Number.isFinite(DECIBEL_BUILDER_FEE_BPS_RAW) && DECIBEL_BUILDER_FEE_BPS_RAW > 0
  ? DECIBEL_BUILDER_FEE_BPS_RAW
  : DEFAULT_DECIBEL_BUILDER_FEE_BPS;
const DEFAULT_DECIBEL_BUILDER_SUBACCOUNT =
  '0xfa4d46a481f5bc95de01a629ec95b7876e946ebe1e86374284d899ac4366984a';
const DECIBEL_ALLOWED_BUILDER_ADDRS = new Set(
  String(process.env.DECIBEL_ALLOWED_BUILDER_ADDRS || process.env.DECIBEL_BUILDER_SUBACCOUNT || DEFAULT_DECIBEL_BUILDER_SUBACCOUNT)
    .split(',')
    .map((s) => decibel.normalizeAptosAddress(s))
    .filter(Boolean)
);

function parseDefaultAttackLoadout(value) {
  const parsed = String(value || '')
    .split(',')
    .map((row) => row.trim())
    .map((row) => VALID_SHIP_TROOPS.find((troop) => troop.toLowerCase() === row.toLowerCase()))
    .filter(Boolean);
  return parsed.length ? parsed : ['Mage', 'Mage', 'Knight'];
}

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

function readDecibelSkill() {
  for (const skillPath of DECIBEL_SKILL_PATHS) {
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

const GENERIC_ATTACK_TARGETS = new Set([
  'a', 'an', 'the', 'any', 'all', 'one', 'some',
  'again', 'new', 'another', 'next', 'random', 'fresh', 'different',
  'base', 'bases', 'enemy', 'enemies', 'opponent', 'opponents', 'target',
  'player', 'players', 'user', 'users', 'someone', 'somebody', 'anyone',
  'good', 'best', 'strong', 'stronger', 'hard', 'harder', 'weak', 'weaker',
  'normal', 'easy', 'nearby', 'shield', 'shielded', 'battle', 'fight', 'raid',
  'когось', 'ворога', 'врага', 'базу', 'база', 'гравця', 'игрока',
  'гравець', 'игрок', 'нову', 'новую', 'іншу', 'другую', 'ще', 'снова',
  'знову', 'рандомну', 'случайную',
]);

function normalizeAttackTargetName(value) {
  const candidate = String(value || '')
    .normalize('NFKC')
    .replace(/^@+/, '')
    .replace(/[.,!?;:()[\]{}"'`]+$/g, '')
    .trim();
  if (!candidate) return '';
  const normalized = candidate
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/['`\u2018\u2019\u02bc]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || GENERIC_ATTACK_TARGETS.has(normalized)) return '';
  if (/^(?:base|enemy|player|user|target|opponent|battle|raid)[_-]?\d*$/i.test(candidate)) return '';
  return candidate;
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

function toolResultLogPayload(result) {
  const text = String(result?.content?.[0]?.text || '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text: text.slice(0, 4000) };
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
    let output = null;
    try {
      const result = await handler(args, extra);
      output = toolResultLogPayload(result);
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
        output,
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

function autoBuildPriority(focus = 'balanced') {
  const normalized = String(focus || 'balanced').toLowerCase();
  if (normalized === 'economy') {
    return ['town_hall', 'mine', 'sawmill', 'storage', 'barn', 'port', 'mine', 'sawmill', 'archer_tower', 'tombstone', 'turret'];
  }
  if (normalized === 'defense') {
    return ['town_hall', 'mine', 'sawmill', 'archer_tower', 'barn', 'port', 'tombstone', 'turret', 'storage', 'archer_tower', 'turret'];
  }
  return [
    'town_hall', 'mine', 'sawmill', 'barn', 'port', 'archer_tower',
    'storage', 'mine', 'sawmill', 'tombstone', 'archer_tower',
    'port', 'turret', 'mine', 'sawmill', 'storage', 'barn',
    'archer_tower', 'tombstone', 'turret', 'port',
  ];
}

function buildingCounts(buildings) {
  const counts = {};
  for (const building of buildings || []) counts[building.type] = (counts[building.type] || 0) + 1;
  return counts;
}

function maxForCurrentTownHall(type, townHallLevel) {
  const limits = game.TH_MAX_COUNT[type] || [];
  if (!limits.length) return game.BUILDING_DEFS[type]?.max_count || 0;
  return limits[Math.min(Math.max(Number(townHallLevel) || 1, 1) - 1, limits.length - 1)] || 0;
}

async function autoBuildBase(playerId, agentKey, options = {}) {
  const maxBuildings = Math.max(1, Math.min(12, Math.floor(Number(options.max_buildings) || 6)));
  const focus = String(options.focus || 'balanced').toLowerCase();
  const placed = [];
  const skipped = [];
  const tried = new Set();

  for (const type of autoBuildPriority(focus)) {
    if (placed.length >= maxBuildings) break;
    if (tried.has(`${type}:${placed.length}`)) continue;
    tried.add(`${type}:${placed.length}`);
    if (!game.BUILDING_DEFS[type]) continue;

    const buildings = game.getPlayerBuildings(playerId).map(normalizeBuilding);
    const counts = buildingCounts(buildings);
    const townHallLevel = getTownHallLevel(buildings);
    const maxCount = maxForCurrentTownHall(type, townHallLevel);
    if (maxCount <= 0 || (counts[type] || 0) >= maxCount) {
      skipped.push({ type, reason: maxCount <= 0 ? `unlocks later` : `max ${maxCount} at Town Hall level ${townHallLevel}` });
      continue;
    }

    const cost = game.BUILDING_DEFS[type].cost || {};
    if (!game.canAfford(playerId, cost.gold || 0, cost.wood || 0, cost.ore || 0)) {
      skipped.push({ type, reason: 'not enough resources', cost });
      continue;
    }

    const gridIndex = defaultGridFor(type);
    const searchLimit = gridIndex === 0 ? 300 : 80;
    const slot = prioritizeAgentBuildSlots(
      type,
      gridIndex,
      game.findOpenBuildingSlots(playerId, type, gridIndex, searchLimit),
      1
    )[0];
    if (!slot) {
      skipped.push({ type, reason: 'no valid open slot', grid_index: gridIndex });
      continue;
    }

    const result = game.placeBuilding(playerId, type, slot.grid_x, slot.grid_z, gridIndex);
    if (result.error) {
      skipped.push({ type, reason: result.error, detail: result });
      continue;
    }
    placed.push(result);
    await notifyAgentAction(agentKey, 'place_building', { building: result, resources: result.resources });
  }

  return {
    success: placed.length > 0,
    focus,
    placed,
    skipped,
    resources: game.getResources(playerId),
    base: buildBaseState(playerId, false),
  };
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

function getAttackShips(playerId) {
  return game.db
    .prepare(`
      SELECT id, level, ship_troops, ship_troops_template
      FROM buildings
      WHERE player_id = ? AND type = 'port' AND has_ship = 1
      ORDER BY id ASC
    `)
    .all(playerId)
    .slice(0, combat.MAX_SHIPS)
    .map((port, ship_index) => {
      const troops = parseJsonArray(port.ship_troops).filter((troop) => VALID_SHIP_TROOPS.includes(troop));
      const template = parseJsonArray(port.ship_troops_template).filter((troop) => VALID_SHIP_TROOPS.includes(troop));
      const capacity = Math.max(0, Number(port.level || 1) * 3);
      return {
        ship_index,
        port_id: port.id,
        level: port.level,
        troops,
        template,
        capacity,
        open_slots: Math.max(0, capacity - troops.length),
      };
    });
}

function fleetTroopCount(fleet = []) {
  return fleet.reduce((sum, ship) => sum + (Array.isArray(ship.troops) ? ship.troops.length : 0), 0);
}

function autoPrepareFleetForAttack(playerId, minTotalTroops = AI_ATTACK_MIN_TOTAL_TROOPS) {
  const preparation = {
    min_total_troops: minTotalTroops,
    default_loadout: AI_ATTACK_DEFAULT_LOADOUT,
    total_troops_before: fleetTroopCount(getFleet(playerId)),
    total_troops_after: 0,
    reinforced: null,
    loaded: [],
    blockers: [],
  };

  let fleet = getFleet(playerId);
  let totalTroops = fleetTroopCount(fleet);
  if (totalTroops >= minTotalTroops) {
    preparation.total_troops_after = totalTroops;
    return { success: true, fleet, preparation };
  }

  const reinforced = reinforceShips(playerId);
  if (reinforced?.error) {
    preparation.blockers.push({ step: 'reinforce_ships', error: reinforced.error, cost: reinforced.cost || null });
  } else if (reinforced?.restored > 0) {
    preparation.reinforced = {
      restored: reinforced.restored,
      cost: reinforced.cost,
      ships: reinforced.ships || [],
    };
  }

  fleet = getFleet(playerId);
  totalTroops = fleetTroopCount(fleet);
  let loadIndex = 0;
  while (totalTroops < minTotalTroops) {
    const ship = getAttackShips(playerId).find((candidate) => candidate.open_slots > 0);
    if (!ship) {
      preparation.blockers.push({ step: 'load_ship_troop', error: 'No open ship troop slots' });
      break;
    }

    const troopName = AI_ATTACK_DEFAULT_LOADOUT[loadIndex % AI_ATTACK_DEFAULT_LOADOUT.length] || 'Mage';
    const loaded = loadShipTroop(playerId, ship.port_id, troopName);
    if (loaded?.error) {
      preparation.blockers.push({ step: 'load_ship_troop', port_id: ship.port_id, troop_name: troopName, error: loaded.error, cost: loaded.cost || null });
      break;
    }
    preparation.loaded.push({
      port_id: ship.port_id,
      troop_name: troopName,
      cost: { gold: SHIP_TROOP_COST },
      ship_troops: loaded.ship_troops || [],
    });
    loadIndex += 1;
    fleet = getFleet(playerId);
    totalTroops = fleetTroopCount(fleet);
  }

  preparation.total_troops_after = totalTroops;
  return { success: totalTroops >= minTotalTroops, fleet, preparation };
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

function decibelBuilderFields() {
  const builderAddr = DECIBEL_ALLOWED_BUILDER_ADDRS.values().next().value || '';
  if (!builderAddr) return null;
  return { builderAddr, builderFee: DECIBEL_BUILDER_FEE_BPS };
}

function decibelMarketSymbol(market) {
  const explicit = String(market?.symbol || '').trim();
  if (explicit) return explicit.toUpperCase();
  const name = String(market?.market_name || market?.marketName || market?.name || '').trim();
  return (name.split(/[-/]/)[0] || name || 'UNKNOWN').toUpperCase();
}

function decibelMarketAddress(market) {
  return String(market?.market_addr || market?.market || market?.marketAddr || '').trim();
}

function normalizeDecibelMarket(market, priceRow = null) {
  const symbol = decibelMarketSymbol(market);
  const mark = Number(priceRow?.mark_px ?? priceRow?.mark_price ?? market?.mark_price ?? market?.oracle_price ?? market?.price ?? 0);
  return {
    symbol,
    market_name: String(market?.market_name || market?.marketName || market?.name || `${symbol}-USD`),
    market_addr: decibelMarketAddress(market) || null,
    px_decimals: Number(market?.px_decimals ?? market?.pxDecimals ?? 6),
    sz_decimals: Number(market?.sz_decimals ?? market?.szDecimals ?? 6),
    tick_size: String(market?.tick_size ?? market?.tickSize ?? '0'),
    lot_size: String(market?.lot_size ?? market?.lotSize ?? '0'),
    min_size: String(market?.min_size ?? market?.minSize ?? '0'),
    mark_price: Number.isFinite(mark) && mark > 0 ? mark : null,
  };
}

function marketMatchesSymbol(market, value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  const compact = upper.replace(/[-_/ ]?(?:USD|USDC|PERP)$/i, '');
  const addr = decibel.normalizeAptosAddress(raw);
  const marketAddr = decibelMarketAddress(market);
  const name = String(market?.market_name || market?.marketName || market?.name || '').toUpperCase();
  const symbol = decibelMarketSymbol(market);
  return (
    (marketAddr && decibel.normalizeAptosAddress(marketAddr) === addr)
    || name === upper
    || name.replace(/[-_/ ]/g, '') === upper.replace(/[-_/ ]/g, '')
    || symbol === upper
    || symbol === compact
  );
}

async function getDecibelMarket(symbolOrName) {
  const markets = await decibel.fetchMarkets();
  const market = markets.find((row) => marketMatchesSymbol(row, symbolOrName));
  if (!market) {
    throw new Error(`Unknown Decibel market: ${symbolOrName}`);
  }
  const prices = await decibel.fetchMarketPrices();
  const marketAddr = decibelMarketAddress(market).toLowerCase();
  const priceRow = prices.find((row) => String(row?.market || row?.market_addr || '').toLowerCase() === marketAddr) || null;
  return normalizeDecibelMarket(market, priceRow);
}

async function getDecibelMarketsBySymbols(symbols = []) {
  const wanted = symbols.map((symbol) => String(symbol || '').trim()).filter(Boolean);
  const out = [];
  for (const symbol of wanted) {
    try {
      out.push(await getDecibelMarket(symbol));
    } catch {
      // Some markets may not be listed on the current Decibel deployment.
    }
  }
  return out;
}

function priceToDecibelChainUnits(human, market) {
  const d = Number(market?.px_decimals ?? 6);
  if (!Number.isFinite(d) || d < 0 || d > 18) throw new Error('Invalid Decibel price decimals');
  const n = Number(human);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Price must be greater than zero');
  return Math.max(1, Math.round(n * Math.pow(10, d)));
}

function sizeToDecibelChainUnits(human, market) {
  const d = Number(market?.sz_decimals ?? 6);
  if (!Number.isFinite(d) || d < 0 || d > 18) throw new Error('Invalid Decibel size decimals');
  const n = Number(human);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Size must be greater than zero');
  let raw = BigInt(Math.max(1, Math.round(n * Math.pow(10, d))));
  const lot = market?.lot_size == null ? 0n : BigInt(Math.max(0, Math.round(Number(market.lot_size))));
  if (lot > 0n) raw = (raw / lot) * lot;
  const min = market?.min_size == null ? 0n : BigInt(Math.max(0, Math.round(Number(market.min_size))));
  if (raw <= 0n) throw new Error('Order size is below this market lot size');
  if (min > 0n && raw < min) throw new Error('Order size is below the Decibel minimum for this market');
  return raw;
}

function decibelSizeDecimals(market) {
  const d = Number(market?.sz_decimals ?? 6);
  if (!Number.isFinite(d) || d < 0 || d > 18) throw new Error('Invalid Decibel size decimals');
  return d;
}

function decibelMinSizeBase(market) {
  const min = Number(market?.min_size ?? market?.minSize ?? 0);
  if (!Number.isFinite(min) || min <= 0) return 0;
  return min / Math.pow(10, decibelSizeDecimals(market));
}

function decibelMinOrderInfo(market, executionPrice, leverage = 1) {
  const minSizeBase = decibelMinSizeBase(market);
  const minNotionalUsd = minSizeBase > 0 ? minSizeBase * Number(executionPrice || 0) : 0;
  const lev = Math.max(1, Number(leverage || 1));
  return {
    min_size_base: minSizeBase,
    min_notional_usd: minNotionalUsd,
    min_collateral_usd: minNotionalUsd > 0 ? minNotionalUsd / lev : 0,
  };
}

function formatUsdApprox(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'unknown';
  return `$${n.toFixed(n >= 100 ? 2 : 4).replace(/\.?0+$/, '')}`;
}

function decibelTickSize(market) {
  const tick = Number(market?.tick_size ?? 0);
  return Number.isFinite(tick) && tick > 0 ? tick : 0;
}

function decibelSideIsBuy(side) {
  const value = String(side || '').trim().toLowerCase();
  if (['buy', 'long', 'bid'].includes(value)) return true;
  if (['sell', 'short', 'ask'].includes(value)) return false;
  throw new Error('side must be long/buy or short/sell');
}

function decibelPriceForOrder({ order_type, price, mark_price, side, slippage_pct }) {
  const isMarket = String(order_type || 'market').toLowerCase() === 'market';
  const base = Number(isMarket ? mark_price : price);
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error(isMarket ? 'Decibel mark price unavailable' : 'Limit price is required');
  }
  if (!isMarket) return base;
  const slip = Math.max(0.001, Math.min(50, Number(slippage_pct ?? 0.5))) / 100;
  return decibelSideIsBuy(side) ? base * (1 + slip) : base * (1 - slip);
}

function decibelPositionSymbol(position) {
  return decibel.symbolFromMarket(position);
}

function normalizeDecibelPosition(position) {
  const symbol = decibelPositionSymbol(position);
  const size = Number(position?.size ?? 0);
  const entry = Number(position?.entry_price ?? position?.entryPrice ?? 0);
  const isLong = decibel.positionIsLong(position);
  return {
    symbol,
    side: isLong ? 'long' : 'short',
    size: Math.abs(size),
    entry_price: Number.isFinite(entry) ? entry : null,
    leverage: decibel.positionLeverage(position),
    notional_usd: decibel.positionNotionalUsd(position),
    collateral_usd: decibel.positionCollateralUsd(position),
    market_addr: String(position?.market || position?.market_addr || position?.marketAddr || ''),
    market_name: position?.marketName || position?.market_name || null,
    liquidation_price: position?.liquidation_price ?? position?.liq_price ?? position?.liquidationPrice ?? null,
    unrealized_pnl: position?.unrealized_pnl ?? position?.pnl ?? position?.unrealizedPnl ?? null,
    tp_order_id: position?.tp_order_id ?? position?.tpOrderId ?? null,
    sl_order_id: position?.sl_order_id ?? position?.slOrderId ?? null,
    raw: position,
  };
}

function estimateDecibelClosePnl(position, closeSize, exitPrice) {
  const normalized = position?.symbol ? position : normalizeDecibelPosition(position);
  const size = Number(closeSize);
  const entry = Number(normalized.entry_price);
  const exit = Number(exitPrice);
  if (!(size > 0) || !(entry > 0) || !(exit > 0)) return null;

  const direction = normalized.side === 'short' ? -1 : 1;
  const pnlUsd = (exit - entry) * size * direction;
  const closedEntryNotional = size * entry;
  const closedExitNotional = size * exit;
  const totalSize = Number(normalized.size);
  const sizeRatio = totalSize > 0 ? Math.min(1, size / totalSize) : 1;
  const collateral = Number(normalized.collateral_usd);
  const closedCollateral = collateral > 0
    ? collateral * sizeRatio
    : closedEntryNotional / Math.max(1, Number(normalized.leverage || 1));
  const pnlPct = closedCollateral > 0 ? (pnlUsd / closedCollateral) * 100 : null;
  const priceMovePct = normalized.side === 'short'
    ? ((entry - exit) / entry) * 100
    : ((exit - entry) / entry) * 100;

  return {
    realized_pnl_usd_estimate: Number(pnlUsd.toFixed(6)),
    realized_pnl_pct_estimate: pnlPct == null ? null : Number(pnlPct.toFixed(4)),
    price_move_pct: Number(priceMovePct.toFixed(4)),
    entry_price: entry,
    exit_price: exit,
    closed_size_base: size,
    closed_entry_notional_usd: Number(closedEntryNotional.toFixed(6)),
    closed_exit_notional_usd: Number(closedExitNotional.toFixed(6)),
    closed_collateral_usd: Number(closedCollateral.toFixed(6)),
    method: 'entry_exit_estimate',
  };
}

const decibelSessionCache = new Map();
const DECIBEL_SESSION_CACHE_MS = 60_000;

async function requireDecibelSession(session, requestedSubaccount = '') {
  if (session?.player?.dex !== 'decibel') {
    return {
      ok: false,
      error: `Decibel trading is only available for accounts registered on Decibel. Current account DEX: ${session?.player?.dex || 'unknown'}.`,
    };
  }
  const owner = decibel.normalizeAptosAddress(session?.player?.wallet || '');
  if (!owner || !String(owner).startsWith('0x')) {
    return { ok: false, error: 'No Aptos wallet is registered for this Decibel player.' };
  }
  const cacheKey = owner.toLowerCase();
  const cached = decibelSessionCache.get(cacheKey);
  const requested = requestedSubaccount ? decibel.normalizeAptosAddress(requestedSubaccount) : '';
  if (cached && Date.now() - cached.at < DECIBEL_SESSION_CACHE_MS) {
    if (requested && requested !== cached.value.subaccount) {
      return { ok: false, error: 'subaccountAddr must match the registered wallet primary Decibel subaccount.' };
    }
    return cached.value;
  }
  const primary = decibel.normalizeAptosAddress(await decibel.getPrimarySubaccountAddr(owner));
  if (requested && requested !== primary) {
    return { ok: false, error: 'subaccountAddr must match the registered wallet primary Decibel subaccount.' };
  }
  const subaccounts = await decibel.fetchUserSubaccounts(owner);
  const value = {
    ok: true,
    owner,
    subaccount: primary,
    subaccounts,
  };
  decibelSessionCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

function maybeRecordDecibelReward(playerId, orderPayload, result, verifiedSource = 'server') {
  try {
    const reward = decibel.rewardInfoFromPlaceOrder(orderPayload, result);
    if (!reward.rewardable) return null;
    const n = Number(reward.notional_usd);
    if (!Number.isFinite(n) || n < DECIBEL_MIN_REWARD_NOTIONAL_USD || n > DECIBEL_MAX_REWARD_NOTIONAL_USD) {
      console.log(`[mcp.decibel] reward skipped: notional ${Number.isFinite(n) ? n.toFixed(4) : String(n)} outside reward range`);
      return null;
    }
    return futuresDb.addTrade(playerId, {
      symbol: reward.symbol,
      side: reward.side,
      orderType: reward.orderType,
      amount: String(reward.amount),
      price: String(reward.price),
      orderId: reward.txHash || result.orderId || null,
      clientOrderId: reward.clientOrderId,
      status: 'filled',
      dex: 'decibel',
      notional_usd: n,
      verifiedSource,
    });
  } catch (error) {
    console.warn('[mcp.decibel] reward row skipped:', error?.message || error);
    return null;
  }
}

async function placeDecibelOrderForAgent(session, playerId, args, options = {}) {
  try {
    const account = options.account || await requireDecibelSession(session, args?.subaccountAddr || args?.subaccount || '');
    if (!account.ok) return { error: account.error };
    const builder = decibelBuilderFields();
    if (!builder) return { error: 'Decibel builder fee routing is not configured.' };

    let market = await getDecibelMarket(args.symbol || args.market || args.marketName);
    const orderType = String(args.order_type || args.orderType || 'market').toLowerCase();
    const side = String(args.side || '').trim().toLowerCase();
    const isBuy = decibelSideIsBuy(side);
    let markPrice = Number(market.mark_price || await decibel.fetchMarketMarkUsd(market.market_addr));
    let executionPrice = decibelPriceForOrder({
      order_type: orderType,
      price: args.price,
      mark_price: markPrice,
      side,
      slippage_pct: args.slippage_pct ?? args.slippagePct,
    });
    const leverage = Math.max(1, Math.min(50, Number(args.leverage || args.rewardLeverage || 1)));
    let collateralUsd = Number(args.collateral_usd ?? args.collateralUsd ?? args.amount_usd ?? args.amount ?? 0);
    let collateralSource = null;
    const collateralPct = Number(args.collateral_pct ?? args.collateralPct ?? args.balance_percent ?? args.balancePercent ?? 0);
    let walletUsdcBalance = null;
    if (!(collateralUsd > 0) && Number.isFinite(collateralPct) && collateralPct > 0) {
      walletUsdcBalance = await decibel.fetchUsdcBalance(account.owner);
      collateralUsd = walletUsdcBalance * (Math.max(0.01, Math.min(100, collateralPct)) / 100);
      collateralSource = {
        type: 'wallet_usdc_percent',
        percent: Math.max(0.01, Math.min(100, collateralPct)),
        wallet_usdc_balance: walletUsdcBalance,
      };
    }
    let sizeBase = Number(args.size_base ?? args.size ?? 0) > 0
      ? Number(args.size_base ?? args.size)
      : Number(args.notional_usd ?? args.notionalUsd ?? 0) > 0
        ? Number(args.notional_usd ?? args.notionalUsd) / executionPrice
        : collateralUsd > 0
          ? (collateralUsd * leverage) / executionPrice
          : 0;
    if (!(sizeBase > 0)) {
      return { error: 'Order requires size, notional_usd, or collateral_usd.' };
    }
    const autonomousDefault = !!args.autonomous_default || !!args.autonomousDefault || !!args.auto_adjust_min_size || !!args.autoAdjustMinSize;
    const explicitSize = Number(args.size_base ?? args.size ?? args.notional_usd ?? args.notionalUsd ?? args.collateral_usd ?? args.collateralUsd ?? args.amount_usd ?? args.amount ?? 0) > 0;
    let autonomousAdjustment = null;

    const ensureMinOrderSize = async () => {
      const minInfo = decibelMinOrderInfo(market, executionPrice, leverage);
      if (!(minInfo.min_size_base > 0) || sizeBase >= minInfo.min_size_base) return true;
      if (!autonomousDefault || explicitSize) {
        return {
          error: `Decibel minimum for ${market.symbol} is about ${formatUsdApprox(minInfo.min_notional_usd)} notional (${formatUsdApprox(minInfo.min_collateral_usd)} collateral at ${leverage}x). Need: Specify a larger amount or percentage of your USDC balance.`,
          minimum_order: {
            symbol: market.symbol,
            min_size_base: minInfo.min_size_base,
            min_notional_usd: minInfo.min_notional_usd,
            min_collateral_usd: minInfo.min_collateral_usd,
            leverage,
          },
        };
      }
      if (walletUsdcBalance == null) walletUsdcBalance = await decibel.fetchUsdcBalance(account.owner);
      if (walletUsdcBalance >= minInfo.min_collateral_usd) {
        const oldSizeBase = sizeBase;
        const oldCollateralUsd = collateralUsd;
        sizeBase = minInfo.min_size_base;
        collateralUsd = minInfo.min_collateral_usd;
        collateralSource = {
          ...(collateralSource || {}),
          type: collateralSource?.type || 'autonomous_minimum_adjustment',
          wallet_usdc_balance: walletUsdcBalance,
          adjusted_to_decibel_minimum: true,
          requested_size_base: oldSizeBase,
          requested_collateral_usd: oldCollateralUsd,
          min_notional_usd: minInfo.min_notional_usd,
          min_collateral_usd: minInfo.min_collateral_usd,
        };
        autonomousAdjustment = {
          reason: 'selected_minimum_valid_size',
          symbol: market.symbol,
          min_notional_usd: minInfo.min_notional_usd,
          min_collateral_usd: minInfo.min_collateral_usd,
          wallet_usdc_balance: walletUsdcBalance,
        };
        return true;
      }

      const alternatives = await getDecibelMarketsBySymbols(['DOGE', 'SOL', 'APT', 'ETH', 'BTC']);
      let best = null;
      for (const candidate of alternatives) {
        const candidateMark = Number(candidate.mark_price || await decibel.fetchMarketMarkUsd(candidate.market_addr));
        if (!(candidateMark > 0)) continue;
        const candidateExecution = decibelPriceForOrder({
          order_type: orderType,
          price: args.price,
          mark_price: candidateMark,
          side,
          slippage_pct: args.slippage_pct ?? args.slippagePct,
        });
        const candidateMin = decibelMinOrderInfo(candidate, candidateExecution, leverage);
        if (!(candidateMin.min_collateral_usd > 0)) continue;
        if (candidateMin.min_collateral_usd <= walletUsdcBalance && (!best || candidateMin.min_collateral_usd < best.min.min_collateral_usd)) {
          best = { market: candidate, markPrice: candidateMark, executionPrice: candidateExecution, min: candidateMin };
        }
      }
      if (best) {
        const previousSymbol = market.symbol;
        market = best.market;
        markPrice = best.markPrice;
        executionPrice = best.executionPrice;
        sizeBase = best.min.min_size_base;
        collateralUsd = best.min.min_collateral_usd;
        collateralSource = {
          type: 'autonomous_affordable_market_selection',
          wallet_usdc_balance: walletUsdcBalance,
          requested_symbol: previousSymbol,
          selected_symbol: market.symbol,
          min_notional_usd: best.min.min_notional_usd,
          min_collateral_usd: best.min.min_collateral_usd,
        };
        autonomousAdjustment = {
          reason: 'selected_affordable_market_minimum',
          requested_symbol: previousSymbol,
          symbol: market.symbol,
          min_notional_usd: best.min.min_notional_usd,
          min_collateral_usd: best.min.min_collateral_usd,
          wallet_usdc_balance: walletUsdcBalance,
        };
        return true;
      }
      return {
        error: `Decibel minimum for ${market.symbol} is about ${formatUsdApprox(minInfo.min_notional_usd)} notional (${formatUsdApprox(minInfo.min_collateral_usd)} collateral at ${leverage}x), but available USDC is about ${formatUsdApprox(walletUsdcBalance)}. Need: Add more USDC or choose a smaller-minimum market.`,
        minimum_order: {
          symbol: market.symbol,
          min_size_base: minInfo.min_size_base,
          min_notional_usd: minInfo.min_notional_usd,
          min_collateral_usd: minInfo.min_collateral_usd,
          wallet_usdc_balance: walletUsdcBalance,
          leverage,
        },
      };
    };

    const minCheck = await ensureMinOrderSize();
    if (minCheck !== true) return minCheck;

    const clientOrderId = decibel.normalizeClientOrderId(args.client_order_id || args.clientOrderId)
      || decibel.newClientOrderId();
    const isMarket = orderType === 'market';
    const orderPayload = {
      marketName: market.market_name,
      price: priceToDecibelChainUnits(executionPrice, market),
      size: sizeToDecibelChainUnits(sizeBase, market).toString(),
      isBuy,
      timeInForce: isMarket ? 'ioc' : 'gtc',
      isReduceOnly: !!options.reduceOnly || !!args.reduce_only || !!args.reduceOnly,
      clientOrderId,
      subaccountAddr: account.subaccount,
      tickSize: decibelTickSize(market),
      pxDecimals: market.px_decimals,
      szDecimals: market.sz_decimals,
      rewardSymbol: market.symbol,
      rewardOrderType: options.rewardOrderType || (isMarket ? 'market' : 'limit'),
      rewardLeverage: leverage,
      rewardNotionalUsd: sizeBase * executionPrice,
      ...builder,
    };
    let leverageResult = null;
    if (!orderPayload.isReduceOnly && Number(args.leverage || args.rewardLeverage || 0) > 0) {
      leverageResult = await decibel.configureUserSettingsForMarket({
        marketAddr: market.market_addr,
        subaccountAddr: account.subaccount,
        userLeverage: leverage,
      });
      if (leverageResult?.success === false) {
        return { error: leverageResult.error || 'Decibel leverage update failed', leverageResult, orderPayload };
      }
    }
    const result = await decibel.placeOrder(orderPayload);
    if (result?.success === false) return { error: result.error || 'Decibel order failed', result, orderPayload };
    const order = {
      symbol: market.symbol,
      market_name: market.market_name,
      side: isBuy ? 'long' : 'short',
      order_type: orderType,
      reduce_only: orderPayload.isReduceOnly,
      size_base: sizeBase,
      execution_price: executionPrice,
      mark_price: markPrice || null,
      notional_usd: sizeBase * executionPrice,
      collateral_usd: collateralUsd > 0 ? collateralUsd : (sizeBase * executionPrice) / leverage,
      collateral_source: collateralSource,
      autonomous_adjustment: autonomousAdjustment,
      leverage,
      builderAddr: builder.builderAddr,
      builderFee: builder.builderFee,
    };
    const verification = orderPayload.isReduceOnly
      ? { verified: true, effect: 'reduce_only_tx_confirmed' }
      : await decibel.waitForPlacedOrderEffect({
        subaccountAddr: account.subaccount,
        marketName: market.market_name,
        marketAddr: market.market_addr,
        symbol: market.symbol,
        side: order.side,
        clientOrderId,
        orderType,
        reduceOnly: false,
        txResult: result,
        attempts: 6,
        delayMs: 900,
      });
    if (!verification.verified) {
      return {
        error: verification.reason || 'Decibel order was submitted, but no matching position or open order was verified.',
        result: { ...result, clientOrderId },
        order,
        verification,
        orderPayload,
      };
    }
    const reward = maybeRecordDecibelReward(playerId, orderPayload, result, 'server');
    return {
      success: true,
      verified: true,
      verification,
      result: { ...result, clientOrderId },
      order,
      leverage_result: leverageResult,
      reward,
    };
  } catch (error) {
    return { error: error?.message || String(error || 'Decibel order failed') };
  }
}

async function runDecibelPlaceOrderAction(session, playerId, agentKey, args) {
  const placed = await placeDecibelOrderForAgent(session, playerId, args);
  if (placed.error) return { ok: false, error: placed.error, ...placed };
  await notifyAgentAction(agentKey, 'decibel_place_order', placed);
  return { ok: true, ...placed };
}

async function runDecibelClosePositionAction(session, playerId, agentKey, args = {}) {
  const account = await requireDecibelSession(session);
  if (!account.ok) return { ok: false, error: account.error };
  const symbol = String(args.symbol || '').trim();

  const positions = await decibel.fetchAccountPositions(account.subaccount);
  const openPositions = positions.filter((row) => Math.abs(Number(row?.size ?? 0)) > 0);
  const position = symbol
    ? openPositions.find((row) => decibelPositionSymbol(row) === symbol.toUpperCase())
      || openPositions.find((row) => marketMatchesSymbol(row, symbol))
    : openPositions.length === 1
      ? openPositions[0]
      : null;
  if (!position) {
    if (!symbol && openPositions.length > 1) {
      const choices = openPositions
        .map((row) => {
          const p = normalizeDecibelPosition(row);
          return `${p.symbol} ${p.side}`;
        })
        .join(', ');
      return { ok: false, error: `Multiple open Decibel positions found: ${choices}. Need: Specify which symbol to close.` };
    }
    return { ok: false, error: symbol ? `No open Decibel position found for ${symbol}` : 'No open Decibel position found to close.' };
  }

  const normalized = normalizeDecibelPosition(position);
  const closeSize = Number(args.size_base ?? args.size ?? 0) > 0
    ? Number(args.size_base ?? args.size)
    : normalized.size * (Math.max(1, Math.min(100, Number(args.percent || 100))) / 100);
  if (!(closeSize > 0)) return { ok: false, error: 'Close size must be greater than zero' };

  const closingLong = normalized.side === 'long';
  const orderArgs = {
    symbol: normalized.symbol,
    side: closingLong ? 'sell' : 'buy',
    order_type: 'market',
    size_base: Math.min(closeSize, normalized.size),
    slippage_pct: args.slippage_pct ?? 1,
    client_order_id: args.client_order_id,
    reduce_only: true,
  };
  const placed = await placeDecibelOrderForAgent(session, playerId, orderArgs, {
    reduceOnly: true,
    rewardOrderType: 'close',
    account,
  });
  if (placed.error) return { ok: false, error: placed.error, ...placed, closed_position: normalized };
  const closedSize = Math.min(closeSize, normalized.size);
  const closePnl = estimateDecibelClosePnl(normalized, closedSize, placed?.order?.execution_price);
  const remainingSize = Math.max(0, normalized.size - closedSize);
  const output = {
    ok: true,
    ...placed,
    closed_position: normalized,
    close_result: {
      symbol: normalized.symbol,
      side: normalized.side,
      requested_percent: Math.max(1, Math.min(100, Number(args.percent || 100))),
      closed_size_base: closedSize,
      remaining_size_base: Number(remainingSize.toFixed(8)),
      remaining_notional_usd: Number((remainingSize * Number(placed?.order?.execution_price || normalized.entry_price || 0)).toFixed(6)),
      ...closePnl,
      settlement_note: closePnl
        ? 'PnL is estimated from entry and execution price; final exchange settlement may update slightly.'
        : 'Final PnL settlement is not available yet.',
    },
  };
  await notifyAgentAction(agentKey, 'decibel_close_position', output);
  return output;
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
        minimum_loaded_troops_before_attack: AI_ATTACK_MIN_TOTAL_TROOPS,
        default_attack_loadout: AI_ATTACK_DEFAULT_LOADOUT,
        fleet_preparation: 'execute_ai_attack_plan auto-reinforces ships and loads default troops before reserving cooldown; if fewer than the minimum troops remain loaded, it rejects the battle.',
        cannon_initial_energy: combat.CANNON_INITIAL_ENERGY,
        cannon_shot_cost: 'shot number: 1, 2, 3...',
        cannon_reload_sec: combat.CANNON_RELOAD_SEC,
        cannon_damage_timing: 'damage applies on cannonball impact, not at launch',
        cannon_targets: 'AI cannon shots should target defensive towers only: turret or archer_tower',
        rally_marker_cost: 'marker number: 1, 2, 3...',
        auto_tactics: 'By default execute_ai_attack_plan analyzes the enemy base, chooses focused-or-split landing slots, fires cannon shots at high-threat defenses, and drops one rally marker on a nearby non-defense priority target when useful. Pass auto_tactics:false for a fully manual plan.',
        request_shape: {
          target_player_name: 'optional exact player name for targeted attacks, e.g. egor4042007',
          target_player_name_rule: 'omit this field for generic requests like attack a base, attack again, new base, random enemy, or battle again',
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
        target_player_name: z.string().min(1).max(80).optional(),
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
    async ({ target_player_name = '', ships = [], auto_tactics = true, cannon_shots = [], rally_marker = null }) => {
      const targetName = normalizeAttackTargetName(target_player_name);
      if (targetName && typeof game.inspectEnemyByName === 'function') {
        const targetPreview = game.inspectEnemyByName(playerId, targetName);
        if (targetPreview.error) return toolError(targetPreview.error, targetPreview);
      }

      const fleetPrep = autoPrepareFleetForAttack(playerId);
      let fleet = fleetPrep.fleet;
      if (fleet.length === 0) return toolError('No loaded ships. Buy ships and load troops first.');
      if (!fleetPrep.success) {
        return toolError(`Need at least ${AI_ATTACK_MIN_TOTAL_TROOPS} loaded troops before launching an AI battle.`, {
          fleet_preparation: fleetPrep.preparation,
          fleet,
        });
      }

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

      const enemy = targetName
        ? game.findEnemyByName(playerId, targetName)
        : game.findEnemy(playerId);
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
        fleet_preparation: fleetPrep.preparation,
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
    'auto_build_base',
    {
      title: 'Auto Build Base',
      description: 'Autonomously choose useful missing affordable buildings, pick the correct grid, find valid slots, place them, and return blockers. Use for broad requests like build my base or arrange everything.',
      inputSchema: {
        focus: z.enum(['balanced', 'economy', 'defense']).optional(),
        max_buildings: z.number().int().min(1).max(12).optional(),
      },
    },
    async ({ focus = 'balanced', max_buildings = 6 }) => {
      const result = await autoBuildBase(playerId, agentKey, { focus, max_buildings });
      if (!result.success) return toolError('No affordable/valid buildings could be placed', result);
      return jsonResult(result);
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

  server.registerTool(
    'decibel_get_account',
    {
      title: 'Decibel Account',
      description: 'Read the authenticated player Decibel account, primary subaccount, overview, positions, open orders, and builder routing. Use before trading or when the player asks for account/positions/balance.',
      inputSchema: {
        include_orders: z.boolean().optional(),
        include_history: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ include_orders = true, include_history = false, limit = 10 }) => {
      const account = await requireDecibelSession(session);
      if (!account.ok) return toolError(account.error);
      const [overview, positions, openOrders, orderHistory, tradeHistory, signer] = await Promise.all([
        decibel.fetchAccountOverview(account.subaccount, { includePerformance: true }),
        decibel.fetchAccountPositions(account.subaccount),
        include_orders ? decibel.fetchOpenOrders(account.subaccount, { limit }) : Promise.resolve([]),
        include_history ? decibel.fetchOrderHistory(account.subaccount, { limit }) : Promise.resolve([]),
        include_history ? decibel.fetchTradeHistory(account.subaccount, { limit }) : Promise.resolve([]),
        decibel.getServerSignerInfo().catch((error) => ({ error: error?.message || String(error) })),
      ]);
      return jsonResult({
        success: true,
        dex: 'decibel',
        owner: account.owner,
        primary_subaccount: account.subaccount,
        subaccounts: account.subaccounts,
        builder: decibelBuilderFields(),
        signer,
        overview,
        positions: positions.map(normalizeDecibelPosition),
        open_orders: openOrders,
        order_history: orderHistory,
        trade_history: tradeHistory,
      });
    }
  );

  server.registerTool(
    'decibel_get_markets',
    {
      title: 'Decibel Markets',
      description: 'List Decibel markets with mark prices and chain formatting metadata.',
      inputSchema: {
        symbols: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ symbols = [], limit = 40 }) => {
      const account = await requireDecibelSession(session);
      if (!account.ok) return toolError(account.error);
      const [markets, prices] = await Promise.all([decibel.fetchMarkets(), decibel.fetchMarketPrices()]);
      const priceByMarket = new Map(prices.map((row) => [String(row?.market || row?.market_addr || '').toLowerCase(), row]));
      const requested = (symbols || []).map((s) => String(s).trim()).filter(Boolean);
      const filtered = requested.length
        ? markets.filter((market) => requested.some((symbol) => marketMatchesSymbol(market, symbol)))
        : markets;
      return jsonResult({
        success: true,
        markets: filtered.slice(0, limit).map((market) => normalizeDecibelMarket(
          market,
          priceByMarket.get(decibelMarketAddress(market).toLowerCase()) || null
        )),
        total_markets: markets.length,
      });
    }
  );

  server.registerTool(
    'decibel_get_positions',
    {
      title: 'Decibel Positions',
      description: 'Read current Decibel open positions and optionally open orders/history.',
      inputSchema: {
        include_orders: z.boolean().optional(),
        include_history: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ include_orders = true, include_history = false, limit = 10 }) => {
      const account = await requireDecibelSession(session);
      if (!account.ok) return toolError(account.error);
      const [positions, openOrders, orderHistory, tradeHistory] = await Promise.all([
        decibel.fetchAccountPositions(account.subaccount),
        include_orders ? decibel.fetchOpenOrders(account.subaccount, { limit }) : Promise.resolve([]),
        include_history ? decibel.fetchOrderHistory(account.subaccount, { limit }) : Promise.resolve([]),
        include_history ? decibel.fetchTradeHistory(account.subaccount, { limit }) : Promise.resolve([]),
      ]);
      return jsonResult({
        success: true,
        primary_subaccount: account.subaccount,
        positions: positions.map(normalizeDecibelPosition),
        open_orders: openOrders,
        order_history: orderHistory,
        trade_history: tradeHistory,
      });
    }
  );

  server.registerTool(
    'decibel_place_order',
    {
      title: 'Decibel Place Order',
      description: 'Open a Decibel market/limit long or short using the Clash server signer and mandatory builder fee routing. Requires clear symbol, side, and size/notional/collateral.',
      inputSchema: {
        symbol: z.string(),
        side: z.enum(['long', 'short', 'buy', 'sell', 'bid', 'ask']),
        order_type: z.enum(['market', 'limit']).optional(),
        price: z.number().positive().optional(),
        size: z.number().positive().optional(),
        size_base: z.number().positive().optional(),
        collateral_usd: z.number().positive().optional(),
        collateral_pct: z.number().positive().max(100).optional(),
        notional_usd: z.number().positive().optional(),
        leverage: z.number().positive().max(50).optional(),
        slippage_pct: z.number().positive().max(50).optional(),
        client_order_id: z.string().optional(),
      },
    },
    async (args) => {
      const placed = await runDecibelPlaceOrderAction(session, playerId, agentKey, args);
      if (!placed.ok) return toolError(placed.error, placed);
      return jsonResult(placed);
    }
  );

  server.registerTool(
    'decibel_close_position',
    {
      title: 'Decibel Close Position',
      description: 'Close or partially close one Decibel position with a reduce-only market order. If symbol is omitted, closes the only open position or returns a blocker listing open symbols.',
      inputSchema: {
        symbol: z.string().optional(),
        size: z.number().positive().optional(),
        size_base: z.number().positive().optional(),
        percent: z.number().positive().max(100).optional(),
        slippage_pct: z.number().positive().max(50).optional(),
        client_order_id: z.string().optional(),
      },
    },
    async ({ symbol, size, size_base, percent, slippage_pct, client_order_id }) => {
      const placed = await runDecibelClosePositionAction(session, playerId, agentKey, {
        symbol,
        size,
        size_base,
        percent,
        slippage_pct,
        client_order_id,
      });
      if (!placed.ok) return toolError(placed.error, placed);
      return jsonResult(placed);
    }
  );

  server.registerTool(
    'decibel_cancel_order',
    {
      title: 'Decibel Cancel Order',
      description: 'Cancel a Decibel open order by order id and market symbol/name.',
      inputSchema: {
        symbol: z.string(),
        order_id: z.string(),
      },
    },
    async ({ symbol, order_id }) => {
      const account = await requireDecibelSession(session);
      if (!account.ok) return toolError(account.error);
      const market = await getDecibelMarket(symbol);
      const result = await decibel.cancelOrder({
        orderId: order_id,
        marketName: market.market_name,
        subaccountAddr: account.subaccount,
      });
      if (result?.success === false) return toolError(result.error || 'Decibel cancel failed', result);
      await notifyAgentAction(agentKey, 'decibel_cancel_order', { result, symbol: market.symbol, order_id });
      return jsonResult({ success: true, result, symbol: market.symbol, market_name: market.market_name, order_id });
    }
  );

  server.registerTool(
    'decibel_set_leverage',
    {
      title: 'Decibel Set Leverage',
      description: 'Configure Decibel cross-margin leverage for a market before opening a position.',
      inputSchema: {
        symbol: z.string(),
        leverage: z.number().positive().max(50),
      },
    },
    async ({ symbol, leverage }) => {
      const account = await requireDecibelSession(session);
      if (!account.ok) return toolError(account.error);
      const market = await getDecibelMarket(symbol);
      const result = await decibel.configureUserSettingsForMarket({
        marketAddr: market.market_addr,
        subaccountAddr: account.subaccount,
        userLeverage: Math.max(1, Math.min(50, Number(leverage) || 1)),
      });
      if (result?.success === false) return toolError(result.error || 'Decibel leverage update failed', result);
      await notifyAgentAction(agentKey, 'decibel_set_leverage', { result, symbol: market.symbol, leverage });
      return jsonResult({ success: true, result, symbol: market.symbol, leverage });
    }
  );

  server.registerTool(
    'decibel_set_tpsl',
    {
      title: 'Decibel Set TP/SL',
      description: 'Set or update take-profit and/or stop-loss orders for an existing Decibel position.',
      inputSchema: {
        symbol: z.string(),
        take_profit: z.number().positive().optional(),
        stop_loss: z.number().positive().optional(),
        size: z.number().positive().optional(),
        size_base: z.number().positive().optional(),
      },
    },
    async ({ symbol, take_profit, stop_loss, size, size_base }) => {
      const account = await requireDecibelSession(session);
      if (!account.ok) return toolError(account.error);
      if (!(Number(take_profit) > 0) && !(Number(stop_loss) > 0)) {
        return toolError('Provide take_profit, stop_loss, or both.');
      }
      const market = await getDecibelMarket(symbol);
      const positions = await decibel.fetchAccountPositions(account.subaccount);
      const position = positions.find((row) => decibelPositionSymbol(row) === market.symbol)
        || positions.find((row) => marketMatchesSymbol(row, symbol));
      if (!position) return toolError(`No open Decibel position found for ${symbol}`);
      const normalized = normalizeDecibelPosition(position);
      const isLong = normalized.side === 'long';
      const sizeHuman = Number(size_base ?? size ?? normalized.size);
      const chainSize = sizeToDecibelChainUnits(Math.min(sizeHuman, normalized.size), market).toString();
      const tick = decibelTickSize(market);
      const leg = {};
      if (Number(take_profit) > 0) {
        const trigger = priceToDecibelChainUnits(take_profit, market);
        const limit = Math.max(1, trigger + (isLong ? Math.max(1, tick) : -Math.max(1, tick)));
        Object.assign(leg, {
          tpOrderId: normalized.tp_order_id || undefined,
          tpTriggerPrice: trigger,
          tpLimitPrice: limit,
          tpSize: chainSize,
        });
      }
      if (Number(stop_loss) > 0) {
        const trigger = priceToDecibelChainUnits(stop_loss, market);
        const limit = Math.max(1, trigger + (isLong ? -Math.max(1, tick) : Math.max(1, tick)));
        Object.assign(leg, {
          slOrderId: normalized.sl_order_id || undefined,
          slTriggerPrice: trigger,
          slLimitPrice: limit,
          slSize: chainSize,
        });
      }
      const base = {
        marketAddr: market.market_addr,
        subaccountAddr: account.subaccount,
        tickSize: tick,
        ...leg,
      };
      const results = [];
      if (base.tpTriggerPrice && base.tpOrderId) {
        results.push({ leg: 'tp', ...(await decibel.updateTpOrderForPosition({ ...base, prevOrderId: base.tpOrderId })) });
      }
      if (base.slTriggerPrice && base.slOrderId) {
        results.push({ leg: 'sl', ...(await decibel.updateSlOrderForPosition({ ...base, prevOrderId: base.slOrderId })) });
      }
      if ((base.tpTriggerPrice && !base.tpOrderId) || (base.slTriggerPrice && !base.slOrderId)) {
        results.push({ leg: 'tp_sl', ...(await decibel.placeTpSlOrderForPosition({
          ...base,
          ...(base.tpOrderId ? { tpTriggerPrice: undefined, tpLimitPrice: undefined, tpSize: undefined } : {}),
          ...(base.slOrderId ? { slTriggerPrice: undefined, slLimitPrice: undefined, slSize: undefined } : {}),
        })) });
      }
      const failed = results.find((row) => row?.success === false);
      if (failed) return toolError(failed.error || 'Decibel TP/SL failed', { results });
      const payload = { success: true, symbol: market.symbol, position: normalized, results };
      await notifyAgentAction(agentKey, 'decibel_set_tpsl', payload);
      return jsonResult(payload);
    }
  );
}

function createServer(session, agentKey, reqMeta = {}) {
  const server = new McpServer({
    name: 'clash-of-perps-ai',
    version: '0.1.0',
  });
  registerTools(server, session, agentKey, reqMeta);
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
    decibel_skill: `${PUBLIC_URL}/decibel-skills.md`,
  });
});

app.get('/skill', (_req, res) => {
  res.type('text/markdown').send(readSkill());
});

app.get('/skills.md', (_req, res) => {
  res.type('text/markdown').send(readSkill());
});

app.get('/decibel-skills.md', (_req, res) => {
  res.type('text/markdown').send(readDecibelSkill());
});

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json(protectedResourceMetadata(req));
});

async function handleFastDecibelAction(req, res, tool, runner) {
  const startedAt = Date.now();
  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const playerId = req.agentSession?.player?.id || null;
  const aiKeyId = req.agentSession?.key?.id || null;
  const aiKeyPrefix = req.agentSession?.key?.key_prefix || null;
  try {
    const output = await runner(input);
    const status = output?.ok === false || output?.error ? 'error' : 'ok';
    game.logMcpEvent({
      playerId,
      aiKeyId,
      aiKeyPrefix,
      tool,
      status,
      durationMs: Date.now() - startedAt,
      error: output?.error || null,
      input,
      output,
      metadata: { transport: 'fast-rest' },
      ...requestLogMeta(req),
    });
    if (status !== 'ok') return res.status(400).json(output);
    return res.json(output);
  } catch (error) {
    const output = { ok: false, error: error?.message || String(error || 'Decibel action failed') };
    game.logMcpEvent({
      playerId,
      aiKeyId,
      aiKeyPrefix,
      tool,
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: output.error,
      input,
      output,
      metadata: { transport: 'fast-rest' },
      ...requestLogMeta(req),
    });
    return res.status(500).json(output);
  }
}

app.post('/fast/decibel/place-order', rateLimit, agentAuth, async (req, res) => {
  await handleFastDecibelAction(req, res, 'decibel_place_order', (input) => (
    runDecibelPlaceOrderAction(
      req.agentSession,
      req.agentSession.player.id,
      req.agentKey,
      input
    )
  ));
});

app.post('/fast/decibel/close-position', rateLimit, agentAuth, async (req, res) => {
  await handleFastDecibelAction(req, res, 'decibel_close_position', (input) => (
    runDecibelClosePositionAction(
      req.agentSession,
      req.agentSession.player.id,
      req.agentKey,
      input
    )
  ));
});

app.all('/mcp', rateLimit, agentAuth, async (req, res) => {
  const mcpServer = createServer(req.agentSession, req.agentKey, requestLogMeta(req));
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
    game.logMcpEvent({
      playerId: req.agentSession?.player?.id || null,
      aiKeyId: req.agentSession?.key?.id || null,
      aiKeyPrefix: req.agentSession?.key?.key_prefix || null,
      tool: 'mcp_http',
      status: 'http_error',
      error: error?.message || String(error),
      ...requestLogMeta(req),
    });
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP request failed' });
    }
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Clash AI MCP running on http://${HOST}:${PORT}/mcp`);
  console.log(`Public MCP endpoint: ${PUBLIC_URL}/mcp`);
});
