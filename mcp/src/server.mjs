import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const game = require('../../server/db.js');
const hermesJobs = require('../../server/hermes_jobs.js');
const combat = require('../../server/combat_defs.js');
const { verifyReplay } = require('../../server/combat_session.js');
const futuresDb = require('../../server-futures/db.js');
const avantis = require('../../server-futures/avantis.js');
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
const AVANTIS_SKILL_PATHS = [
  process.env.CLASH_MCP_AVANTIS_SKILL_PATH,
  path.resolve(__dirname, '..', 'AVANTIS_TRADING_SKILL.md'),
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
const VALID_SHIP_TROOPS = ['Knight', 'Mage', 'Archer'];
const VALID_TROOP_UPGRADES = ['knight', 'mage', 'archer', 'demon_king'];
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
function numericPolicyEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  const next = Number.isFinite(value) && value > 0 ? value : fallback;
  return Math.max(min, Math.min(max, next));
}

const AVANTIS_BROWSER_POLICY = Object.freeze({
  max_collateral_usd: numericPolicyEnv('CLASH_AVANTIS_AI_MAX_COLLATERAL_USD', 100, 1, 1000),
  max_leverage: numericPolicyEnv('CLASH_AVANTIS_AI_MAX_LEVERAGE', 50, 1, 1000),
  max_notional_usd: numericPolicyEnv('CLASH_AVANTIS_AI_MAX_NOTIONAL_USD', 1000, 1, 100_000),
  max_slippage_pct: numericPolicyEnv('CLASH_AVANTIS_AI_MAX_SLIPPAGE_PCT', 5, 0.01, 50),
  expires_in_ms: 5 * 60 * 1000,
});
const AVANTIS_MIN_NOTIONAL_USD = 100;
const PYTH_BENCHMARKS_URL = 'https://benchmarks.pyth.network/v1/shims/tradingview';
const BINANCE_KLINES_URL = 'https://api.binance.com/api/v3/klines';
const AVANTIS_MARKET_SCAN_CACHE_MS = 30_000;
let avantisMarketScanCache = { key: '', ts: 0, data: null };
const DEFAULT_DECIBEL_BUILDER_FEE_BPS = 5;
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

function readAvantisSkill() {
  for (const skillPath of AVANTIS_SKILL_PATHS) {
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

function normalizeLoadedTroopName(value) {
  const text = String(value || '').trim();
  const base = text.split(':')[0].toLowerCase();
  if (base === 'demonking' || base === 'demon_king') return 'DemonKing';
  return VALID_SHIP_TROOPS.find((troop) => troop.toLowerCase() === base) || null;
}

function filterActiveLoadedTroops(troops) {
  if (!Array.isArray(troops)) return [];
  const out = [];
  for (const troop of troops) {
    if (String(troop || '') === '_SLOT_FILLER_') {
      if (out.length > 0 && normalizeLoadedTroopName(out[out.length - 1]) === 'DemonKing') out.push('_SLOT_FILLER_');
      continue;
    }
    const normalized = normalizeLoadedTroopName(troop);
    if (!normalized) continue;
    out.push(normalized === 'DemonKing' ? String(troop) : normalized);
  }
  return out;
}

function sanitizeShipLoadoutsForPlayer(playerId) {
  const ports = game.db
    .prepare('SELECT id, ship_troops, ship_troops_template FROM buildings WHERE player_id = ? AND type = ?')
    .all(playerId, 'port');
  let changed = 0;
  for (const port of ports) {
    const current = parseJsonArray(port.ship_troops);
    const template = parseJsonArray(port.ship_troops_template);
    const nextCurrent = filterActiveLoadedTroops(current);
    const nextTemplate = filterActiveLoadedTroops(template);
    if (JSON.stringify(current) === JSON.stringify(nextCurrent) && JSON.stringify(template) === JSON.stringify(nextTemplate)) continue;
    game.db
      .prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?')
      .run(JSON.stringify(nextCurrent), JSON.stringify(nextTemplate), port.id);
    changed += 1;
  }
  return changed;
}

function normalizeBuilding(building) {
  return {
    ...building,
    ship_troops: filterActiveLoadedTroops(parseJsonArray(building.ship_troops)),
    ship_troops_template: filterActiveLoadedTroops(parseJsonArray(building.ship_troops_template)),
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

function normalizeBuildingTypeInput(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const normalized = raw.replace(/[\s-]+/g, '_');
  if (game.BUILDING_DEFS[normalized]) return normalized;
  const compact = normalized.replace(/_/g, '');
  return Object.keys(game.BUILDING_DEFS).find((type) => type.replace(/_/g, '') === compact) || '';
}

function autoUpgradeFocusPriority(focus = 'balanced') {
  const normalized = String(focus || 'balanced').toLowerCase();
  if (normalized === 'economy') return ['mine', 'sawmill', 'storage', 'barn', 'port', 'town_hall'];
  if (normalized === 'defense') return ['mage_tower', 'archer_tower', 'turret', 'tombstone', 'town_hall'];
  if (normalized === 'ports') return ['port'];
  if (normalized === 'town_hall') return ['town_hall'];
  return ['mine', 'sawmill', 'storage', 'barn', 'port', 'archer_tower', 'turret', 'tombstone', 'town_hall'];
}

function autoUpgradeCandidateRows(playerId, options = {}) {
  const focus = String(options.focus || 'balanced').toLowerCase();
  const targetType = normalizeBuildingTypeInput(options.target_type || options.type || '');
  const priority = autoUpgradeFocusPriority(focus);
  const allowedTypes = new Set(priority);
  if (targetType) allowedTypes.add(targetType);
  const priorityIndex = (type) => {
    const idx = priority.indexOf(type);
    return idx === -1 ? priority.length + 1 : idx;
  };

  return game.getPlayerBuildings(playerId)
    .map(normalizeBuilding)
    .filter((building) => {
      const def = game.BUILDING_DEFS[building.type];
      if (!def || Number(building.level || 1) >= Number(def.max_level || 1)) return false;
      if (targetType) return building.type === targetType;
      return allowedTypes.has(building.type);
    })
    .map((building) => ({
      building,
      cost: game.getBuildingUpgradeCost(building.type, building.level),
      priority: priorityIndex(building.type),
    }))
    .sort((a, b) => (
      a.priority - b.priority
      || Number(a.building.level || 1) - Number(b.building.level || 1)
      || Number(a.building.id || 0) - Number(b.building.id || 0)
    ));
}

async function autoUpgradeBuildings(playerId, agentKey, options = {}) {
  const maxUpgrades = Math.max(1, Math.min(20, Math.floor(Number(options.max_upgrades) || 10)));
  const focus = String(options.focus || 'balanced').toLowerCase();
  const targetType = normalizeBuildingTypeInput(options.target_type || options.type || '');
  const upgraded = [];
  const blockers = [];
  const blockedIds = new Set();

  while (upgraded.length < maxUpgrades) {
    const candidates = autoUpgradeCandidateRows(playerId, { focus, target_type: targetType })
      .filter((row) => !blockedIds.has(Number(row.building.id)));
    if (!candidates.length) break;

    let upgradedThisPass = false;
    for (const row of candidates) {
      const buildingId = Number(row.building.id);
      const result = game.upgradeBuilding(playerId, buildingId);
      if (result?.error) {
        blockedIds.add(buildingId);
        blockers.push({
          building_id: buildingId,
          type: row.building.type,
          level: row.building.level,
          next_level: Number(row.building.level || 1) + 1,
          error: result.error,
          cost: result.cost || row.cost,
        });
        continue;
      }
      upgraded.push(result);
      await notifyAgentAction(agentKey, 'upgrade_building', { building_id: buildingId, ...result });
      upgradedThisPass = true;
      break;
    }

    if (!upgradedThisPass) break;
  }

  return {
    success: upgraded.length > 0,
    focus,
    target_type: targetType || null,
    requested_max_upgrades: maxUpgrades,
    upgraded,
    blockers,
    resources: game.getResources(playerId),
    base: buildBaseState(playerId, false),
  };
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
  if (type === 'demonking') return 'demon_king';
  if (!VALID_TROOP_UPGRADES.includes(type)) return null;
  return game.TROOP_DEFS[type] ? type : null;
}

function normalizeShipTroop(value) {
  const lower = String(value || '').trim().toLowerCase();
  return VALID_SHIP_TROOPS.find((name) => name.toLowerCase() === lower) || null;
}

function shipPayload(portId, extra = {}) {
  const port = game.db.prepare('SELECT * FROM buildings WHERE id = ?').get(portId);
  const shipTroops = filterActiveLoadedTroops(parseJsonArray(port?.ship_troops));
  const shipTemplate = filterActiveLoadedTroops(parseJsonArray(port?.ship_troops_template));
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

const AI_ATTACK_GRID = combat.CANONICAL_GRID_CONFIGS?.[2];
if (!AI_ATTACK_GRID) throw new Error('Generated attack grid 2 is unavailable');

function attackGridLocalToWorld(localX, localZ = 0) {
  const angle = Number(AI_ATTACK_GRID.grid_rotation) || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: Number(AI_ATTACK_GRID.grid_center_x) + localX * cos + localZ * sin,
    z: Number(AI_ATTACK_GRID.grid_center_z) - localX * sin + localZ * cos,
  };
}

// Keep AI deployment slots inside the same generated shipPlane bounds used
// by the game and server replay validation. Leaving 10% inset on both ends
// avoids edge rejection after JSON/float rounding.
const AI_ATTACK_HALF_LINE = Number(AI_ATTACK_GRID.grid_extent_x) * 0.4;
const AI_ATTACK_LANDING_A = attackGridLocalToWorld(-AI_ATTACK_HALF_LINE);
const AI_ATTACK_LANDING_B = attackGridLocalToWorld(AI_ATTACK_HALF_LINE);
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
  sanitizeShipLoadoutsForPlayer(playerId);
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
      troops: filterActiveLoadedTroops(parseJsonArray(port.ship_troops)),
      template: filterActiveLoadedTroops(parseJsonArray(port.ship_troops_template)),
    }))
    .filter((ship) => ship.troops.length > 0)
    .slice(0, combat.MAX_SHIPS)
    .map((ship, ship_index) => ({ ship_index, ...ship }));
}

function getAttackShips(playerId) {
  sanitizeShipLoadoutsForPlayer(playerId);
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
      const troops = filterActiveLoadedTroops(parseJsonArray(port.ship_troops));
      const template = filterActiveLoadedTroops(parseJsonArray(port.ship_troops_template));
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

function validateAiAttackEnergy(cannonShots = [], rallyMarker = null, shipLevel = 1) {
  const normalizedShipLevel = Math.max(1, Math.trunc(Number(shipLevel) || 1));
  let energy = combat.cannonInitialEnergyForShipLevel(normalizedShipLevel);
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
      ? combat.cannonShotCost(normalizedShipLevel, ++shotNumber)
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
    troops: Object.fromEntries(VALID_TROOP_UPGRADES.map((troop) => [troop, game.TROOP_DEFS[troop]]).filter(([, def]) => def)),
    grids: game.GRID_SPECS,
    town_hall_upgrade_requires: game.TH_UPGRADE_REQUIRES,
  };
}

function buildBaseState(playerId, includeCatalog = true) {
  sanitizeShipLoadoutsForPlayer(playerId);
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
    sanitizeShipLoadoutsForPlayer(playerId);
    const normalizedTroop = normalizeShipTroop(troopName);
    if (!normalizedTroop) return { error: 'Troop disabled', code: 'TROOP_DISABLED', troop_name: troopName };
    const building = game.db
      .prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?')
      .get(portId, playerId);
    if (!building) return { error: 'Port not found' };
    if (building.type !== 'port' || !building.has_ship) return { error: 'No ship at this port' };

    const shipTroops = filterActiveLoadedTroops(parseJsonArray(building.ship_troops));
    const capacity = building.level * 3;
    if (shipTroops.length >= capacity) return { error: 'Ship is full', capacity };
    if (!game.canAfford(playerId, SHIP_TROOP_COST, 0, 0)) {
      return { error: 'Not enough gold', cost: { gold: SHIP_TROOP_COST } };
    }

    game.subtractResources(playerId, SHIP_TROOP_COST, 0, 0);
    shipTroops.push(normalizedTroop);
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
    sanitizeShipLoadoutsForPlayer(playerId);
    const normalizedTroop = normalizeShipTroop(troopName);
    if (!normalizedTroop) return { error: 'Troop disabled', code: 'TROOP_DISABLED', troop_name: troopName };
    const building = game.db
      .prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?')
      .get(portId, playerId);
    if (!building) return { error: 'Port not found' };
    if (building.type !== 'port' || !building.has_ship) return { error: 'No ship at this port' };

    const shipTroops = filterActiveLoadedTroops(parseJsonArray(building.ship_troops));
    if (slot < 0 || slot >= shipTroops.length) return { error: 'Invalid slot' };
    if (!game.canAfford(playerId, SHIP_TROOP_COST, 0, 0)) {
      return { error: 'Not enough gold', cost: { gold: SHIP_TROOP_COST } };
    }

    game.subtractResources(playerId, SHIP_TROOP_COST, 0, 0);
    shipTroops[slot] = normalizedTroop;
    game.db
      .prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?')
      .run(JSON.stringify(shipTroops), portId);
    return {
      success: true,
      port_id: portId,
      slot,
      troop_name: normalizedTroop,
      ship_troops: shipTroops,
      ship_level: building.level,
      ship_capacity: building.level * 3,
      resources: game.getResources(playerId),
    };
  })();
}

function reinforceShips(playerId) {
  return game.db.transaction(() => {
    sanitizeShipLoadoutsForPlayer(playerId);
    const ports = game.db
      .prepare('SELECT * FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1')
      .all(playerId, 'port');

    let totalToRestore = 0;
    const shipsToRestore = [];
    for (const port of ports) {
      const current = filterActiveLoadedTroops(parseJsonArray(port.ship_troops));
      const template = filterActiveLoadedTroops(parseJsonArray(port.ship_troops_template));
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

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function normalizeEvmAddress(value) {
  const text = String(value || '').trim();
  return EVM_ADDRESS_RE.test(text) ? text.toLowerCase() : '';
}

function requireAvantisSession(session) {
  if (session?.player?.dex !== 'avantis') {
    return {
      ok: false,
      error: `Avantis trading is only available for accounts registered on Avantis. Current account DEX: ${session?.player?.dex || 'unknown'}.`,
    };
  }
  const address = normalizeEvmAddress(session?.player?.wallet || '');
  if (!address) {
    return { ok: false, error: 'No EVM wallet is registered for this Avantis player.' };
  }
  return {
    ok: true,
    address,
  };
}

function avantisScaledUsd(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 10000 ? n / 1e6 : n;
}

function avantisScaledPrice(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e8 ? n / 1e10 : n;
}

function avantisScaledLeverage(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n > 10000 ? n / 1e10 : n;
}

function avantisBool(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function avantisPairIndex(row) {
  const value = row?.pairIndex ?? row?.pair_index ?? row?.trade?.pairIndex ?? row?.order?.pairIndex;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function avantisTradeIndex(row) {
  const value = row?.index ?? row?.trade_index ?? row?.trade?.index ?? row?.order?.index;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function avantisCollateralUsd(row) {
  return avantisScaledUsd(
    row?.margin
    ?? row?.collateral
    ?? row?.collateralUSDC
    ?? row?.trade?.collateralUSDC
    ?? row?.trade?.positionSizeUSDC
    ?? row?.positionSizeUSDC
    ?? row?.trade?.initialPosToken
    ?? row?.initialPosToken
    ?? row?.order?.initialPosToken
  );
}

function avantisLeverage(row) {
  return avantisScaledLeverage(row?.leverage ?? row?.trade?.leverage ?? row?.order?.leverage);
}

function avantisPositionSide(row) {
  const explicit = String(row?.side || '').toLowerCase();
  if (explicit === 'long' || explicit === 'short') return explicit;
  return avantisBool(row?.buy ?? row?.trade?.buy ?? row?.order?.buy) ? 'long' : 'short';
}

function avantisPositionSymbol(row, indexMap = {}) {
  const explicit = String(row?.symbol || row?.pair_symbol || '').trim();
  if (explicit) return explicit.toUpperCase().replace(/\/USD$/, '');
  const pairIndex = avantisPairIndex(row);
  const pair = pairIndex != null ? indexMap[pairIndex] : null;
  const from = String(pair?.from || pair?.symbol?.split('/')?.[0] || '').toUpperCase();
  return from || `PAIR_${pairIndex ?? 'UNKNOWN'}`;
}

function normalizeAvantisPosition(row, indexMap = {}) {
  const collateral = avantisCollateralUsd(row);
  const leverage = avantisLeverage(row);
  const entry = avantisScaledPrice(row?.openPrice ?? row?.trade?.openPrice);
  const mark = Number(row?.mark_price ?? row?.current_price ?? row?.price ?? 0);
  const pnl = Number(row?.pnl ?? row?.pnlUSD ?? row?.unrealised ?? 0);
  return {
    symbol: avantisPositionSymbol(row, indexMap),
    side: avantisPositionSide(row),
    pair_index: avantisPairIndex(row),
    trade_index: avantisTradeIndex(row),
    collateral_usd: collateral,
    leverage,
    notional_usd: Number((collateral * leverage).toFixed(6)),
    entry_price: entry,
    mark_price: Number.isFinite(mark) && mark > 0 ? mark : null,
    pnl_usd: Number.isFinite(pnl) ? pnl : null,
    take_profit: avantisScaledPrice(row?.tp ?? row?.trade?.tp),
    stop_loss: avantisScaledPrice(row?.sl ?? row?.trade?.sl),
    raw: row,
  };
}

function normalizeAvantisOrder(row, indexMap = {}) {
  const collateral = avantisCollateralUsd(row);
  const leverage = avantisLeverage(row);
  return {
    symbol: avantisPositionSymbol(row, indexMap),
    side: avantisPositionSide(row),
    pair_index: avantisPairIndex(row),
    trade_index: avantisTradeIndex(row),
    collateral_usd: collateral,
    leverage,
    notional_usd: Number((collateral * leverage).toFixed(6)),
    price: avantisScaledPrice(row?.price ?? row?.openPrice ?? row?.order?.price),
    take_profit: avantisScaledPrice(row?.tp ?? row?.order?.tp),
    stop_loss: avantisScaledPrice(row?.sl ?? row?.order?.sl),
    raw: row,
  };
}

async function avantisPairs() {
  const pairs = await avantis.getPairsMap();
  const indexMap = pairs?.indexMap || {};
  return {
    ...pairs,
    indexMap,
  };
}

async function normalizeAvantisMarkets(symbols = [], limit = 60) {
  const [{ raw = [], indexMap = {} }, prices] = await Promise.all([
    avantisPairs(),
    avantis.getPrices().catch(() => ({})),
  ]);
  const wanted = (symbols || []).map((s) => String(s || '').trim().toUpperCase()).filter(Boolean);
  const filtered = wanted.length
    ? raw.filter((market) => wanted.some((symbol) => {
        const compact = symbol.replace(/[-_/ ]?(?:USD|USDC|PERP)$/i, '');
        return String(market?.from || '').toUpperCase() === compact
          || String(market?.symbol || '').toUpperCase() === symbol
          || String(market?.symbol || '').replace(/[-_/ ]/g, '').toUpperCase() === symbol.replace(/[-_/ ]/g, '');
      }))
    : raw;
  return filtered.slice(0, Math.max(1, Math.min(120, Number(limit) || 60))).map((market) => {
    const symbol = String(market?.symbol || `${market?.from || ''}/${market?.to || 'USD'}`).toUpperCase();
    const price = prices?.[symbol] || prices?.[String(market?.from || '').toUpperCase()] || null;
    return {
      symbol: String(market?.from || symbol.split('/')[0] || '').toUpperCase(),
      pair_symbol: symbol,
      pair_index: market?.index ?? indexMap?.[market?.index]?.index ?? null,
      from: market?.from || null,
      to: market?.to || null,
      mark_price: Number(price?.mark || 0) > 0 ? Number(price.mark) : null,
      yesterday_price: Number(price?.yesterday_price || 0) > 0 ? Number(price.yesterday_price) : null,
      raw: market,
    };
  });
}

function avantisMarketMaxLeverage(market) {
  const value = Number(
    market?.raw?.leverages?.maxLeverage
    ?? market?.raw?.maxLeverage
    ?? market?.raw?.max_leverage
    ?? market?.leverages?.maxLeverage
    ?? market?.maxLeverage
    ?? market?.max_leverage
    ?? 0
  );
  return Number.isFinite(value) && value > 0 ? value : null;
}

function avantisPythSymbol(market) {
  return market?.raw?.feed?.attributes?.symbol
    || market?.feed?.attributes?.symbol
    || market?.raw?.pyth_symbol
    || market?.pyth_symbol
    || '';
}

function avantisMarketAssetClass(pythSymbol) {
  const text = String(pythSymbol || '');
  if (/^Crypto\./i.test(text)) return 'crypto';
  if (/^FX\./i.test(text)) return 'forex';
  if (/^Equity\./i.test(text)) return 'equity';
  if (/^(Metal|Commodities)\./i.test(text)) return 'commodity';
  if (/^Rates\./i.test(text)) return 'rates';
  return 'unknown';
}

function pctChange(from, to) {
  const a = Number(from);
  const b = Number(to);
  if (!(a > 0) || !(b > 0)) return null;
  return ((b - a) / a) * 100;
}

function downsample(values = [], max = 12) {
  const list = values.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (list.length <= max) return list.map((n) => Number(n.toFixed(6)));
  const out = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (list.length - 1)) / (max - 1));
    out.push(Number(list[idx].toFixed(6)));
  }
  return out;
}

function binanceKlineSymbol(symbol) {
  const base = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!base || base.endsWith('USD') || base.endsWith('USDC') || base.endsWith('USDT')) return '';
  return `${base}USDT`;
}

async function fetchBinanceHourlyCloses(symbol, lookbackHours = 24) {
  const pair = binanceKlineSymbol(symbol);
  if (!pair) return [];
  const hours = Math.max(4, Math.min(168, Number(lookbackHours) || 24));
  const url = `${BINANCE_KLINES_URL}?symbol=${encodeURIComponent(pair)}&interval=1h&limit=${Math.ceil(hours)}`;
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 6500);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((row) => Number(Array.isArray(row) ? row[4] : 0))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(-Math.ceil(hours));
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAvantisBenchmarkCloses(pythSymbol, lookbackHours = 24) {
  const symbol = String(pythSymbol || '').trim();
  if (!symbol) return [];
  const now = Math.floor(Date.now() / 1000);
  const hours = Math.max(4, Math.min(168, Number(lookbackHours) || 24));
  const from = now - Math.ceil(hours + 2) * 3600;
  const url = `${PYTH_BENCHMARKS_URL}/history?symbol=${encodeURIComponent(symbol)}&resolution=60&from=${from}&to=${now}`;
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 6500);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    if (data?.s !== 'ok' || !Array.isArray(data.c)) return [];
    return data.c.map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(-Math.ceil(hours));
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAvantisChartCloses(row, lookbackHours = 24) {
  const binanceCloses = await fetchBinanceHourlyCloses(row?.symbol, lookbackHours);
  if (binanceCloses.length >= 4) {
    return { source: 'binance_1h', closes: binanceCloses };
  }
  const pythCloses = await fetchAvantisBenchmarkCloses(row?.pyth_symbol, lookbackHours);
  if (pythCloses.length >= 4) {
    return { source: 'pyth_benchmarks_1h', closes: pythCloses };
  }
  return { source: null, closes: [] };
}

function analyzeAvantisMarket(market, closes = []) {
  const mark = Number(market?.mark_price || 0);
  const yesterday = Number(market?.yesterday_price || 0);
  const closeList = closes.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const last = closeList.length ? closeList[closeList.length - 1] : mark;
  const change24h = pctChange(yesterday, mark || last);
  const change4h = closeList.length >= 5 ? pctChange(closeList[closeList.length - 5], last) : null;
  const change1h = closeList.length >= 2 ? pctChange(closeList[closeList.length - 2], last) : null;
  const returns = [];
  for (let i = 1; i < closeList.length; i++) {
    const ch = pctChange(closeList[i - 1], closeList[i]);
    if (ch != null) returns.push(ch);
  }
  const avg = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / returns.length
    : 0;
  const volatility = Math.sqrt(variance);
  const momentum = (
    (change4h ?? 0) * 0.55
    + (change1h ?? 0) * 0.25
    + (change24h ?? 0) * 0.20
  );
  const score = Number.isFinite(momentum) ? momentum : 0;
  const side = score >= 0 ? 'long' : 'short';
  return {
    change_1h_pct: change1h == null ? null : Number(change1h.toFixed(3)),
    change_4h_pct: change4h == null ? null : Number(change4h.toFixed(3)),
    change_24h_pct: change24h == null ? null : Number(change24h.toFixed(3)),
    volatility_hourly_pct: Number(volatility.toFixed(3)),
    signal_score: Number(score.toFixed(3)),
    suggested_side: side,
    reason: side === 'long'
      ? 'positive short-term momentum versus recent closes'
      : 'negative short-term momentum versus recent closes',
    sparkline_24h: downsample(closeList, 12),
  };
}

async function buildAvantisMarketScan({ symbols = [], limit = 120, chart_limit = 32, lookback_hours = 24 } = {}) {
  const cacheKey = JSON.stringify({
    symbols: (symbols || []).map((s) => String(s || '').toUpperCase()).sort(),
    limit: Number(limit) || 120,
    chart_limit: Number(chart_limit) || 32,
    lookback_hours: Number(lookback_hours) || 24,
  });
  if (avantisMarketScanCache.data && avantisMarketScanCache.key === cacheKey && Date.now() - avantisMarketScanCache.ts < AVANTIS_MARKET_SCAN_CACHE_MS) {
    return avantisMarketScanCache.data;
  }

  const markets = await normalizeAvantisMarkets(symbols, limit);
  const baseRows = markets.map((market) => {
    const mark = Number(market.mark_price || 0);
    const yesterday = Number(market.yesterday_price || 0);
    const pythSymbol = avantisPythSymbol(market);
    return {
      symbol: market.symbol,
      pair_symbol: market.pair_symbol,
      pair_index: market.pair_index,
      mark_price: mark > 0 ? mark : null,
      yesterday_price: yesterday > 0 ? yesterday : null,
      change_24h_pct: pctChange(yesterday, mark),
      max_leverage: avantisMarketMaxLeverage(market),
      pyth_symbol: pythSymbol,
      asset_class: avantisMarketAssetClass(pythSymbol),
      raw: market.raw,
    };
  });

  const chartTargets = baseRows
    .filter((row) => row.mark_price && row.pyth_symbol && row.asset_class === 'crypto')
    .sort((a, b) => Math.abs(Number(b.change_24h_pct || 0)) - Math.abs(Number(a.change_24h_pct || 0)))
    .slice(0, Math.max(1, Math.min(80, Number(chart_limit) || 32)));
  const chartByPair = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < chartTargets.length) {
      const row = chartTargets[cursor++];
      const chart = await fetchAvantisChartCloses(row, lookback_hours);
      chartByPair.set(row.pair_index ?? row.pair_symbol ?? row.symbol, chart);
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, chartTargets.length || 1) }, () => worker()));

  const analyzed = baseRows.map((row) => {
    const chartData = chartByPair.get(row.pair_index ?? row.pair_symbol ?? row.symbol) || {};
    const closes = Array.isArray(chartData.closes) ? chartData.closes : [];
    const analysis = analyzeAvantisMarket(row, closes);
    return {
      symbol: row.symbol,
      pair_symbol: row.pair_symbol,
      pair_index: row.pair_index,
      mark_price: row.mark_price,
      yesterday_price: row.yesterday_price,
      change_24h_pct: row.change_24h_pct == null ? null : Number(row.change_24h_pct.toFixed(3)),
      max_leverage: row.max_leverage,
      pyth_symbol: row.pyth_symbol || null,
      asset_class: row.asset_class,
      chart: closes.length ? {
        lookback_hours: Math.max(4, Math.min(168, Number(lookback_hours) || 24)),
        resolution: '1h',
        source: chartData.source || 'unknown_1h',
        sparkline: analysis.sparkline_24h,
      } : null,
      suggested_side: analysis.suggested_side,
      signal_score: analysis.signal_score,
      signal: {
        side: analysis.suggested_side,
        suggested_side: analysis.suggested_side,
        score: analysis.signal_score,
        change_1h_pct: analysis.change_1h_pct,
        change_4h_pct: analysis.change_4h_pct,
        change_24h_pct: analysis.change_24h_pct,
        volatility_hourly_pct: analysis.volatility_hourly_pct,
        reason: analysis.reason,
      },
    };
  });

  const chartedCandidates = analyzed
    .filter((row) => row.mark_price && row.chart?.sparkline?.length >= 4)
    .sort((a, b) => Math.abs(b.signal.score) - Math.abs(a.signal.score))
    .slice(0, 12);
  const fallbackPool = analyzed.some((row) => row.mark_price && row.asset_class === 'crypto')
    ? analyzed.filter((row) => row.asset_class === 'crypto')
    : analyzed;
  const fallbackCandidates = fallbackPool
    .filter((row) => row.mark_price)
    .sort((a, b) => Math.abs(b.signal.score || b.change_24h_pct || 0) - Math.abs(a.signal.score || a.change_24h_pct || 0))
    .slice(0, 12);
  const candidates = chartedCandidates.length ? chartedCandidates : fallbackCandidates;
  const chartSources = analyzed.reduce((acc, row) => {
    const source = row.chart?.source || 'none';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  const result = {
    ok: true,
    success: true,
    dex: 'avantis',
    markets: analyzed.map((row) => ({
      symbol: row.symbol,
      pair_symbol: row.pair_symbol,
      pair_index: row.pair_index,
      mark_price: row.mark_price,
      change_24h_pct: row.change_24h_pct,
      max_leverage: row.max_leverage,
      asset_class: row.asset_class,
      suggested_side: row.suggested_side,
      signal_score: row.signal_score,
      signal: row.signal,
      chart: row.chart,
    })),
    ranked_candidates: candidates,
    total_returned: analyzed.length,
    charted_markets: analyzed.filter((row) => row.chart).length,
    chart_sources: chartSources,
    selection_rule: 'Rank candidates by absolute 1h/4h/24h momentum score. suggested_side follows the score sign.',
  };
  avantisMarketScanCache = { key: cacheKey, ts: Date.now(), data: result };
  return result;
}

function chooseAvantisScanCandidate(scan, requestedSide = '', constraints = {}) {
  const side = String(requestedSide || '').toLowerCase();
  const normalizedSide = side === 'short' || side === 'sell' || side === 'ask' ? 'short'
    : side === 'long' || side === 'buy' || side === 'bid' ? 'long'
    : '';
  const minMarketMaxLeverage = Number(constraints.min_market_max_leverage || 0);
  const strictLeverage = constraints.strict_leverage === true && minMarketMaxLeverage > 0;
  const cryptoOnly = constraints.crypto_only === true;
  const preferVolatile = constraints.prefer_volatile === true;
  const avoidSymbols = new Set((Array.isArray(constraints.avoid_symbols) ? constraints.avoid_symbols : [])
    .map((symbol) => String(symbol || '').trim().toUpperCase().replace(/[-_/ ]?(?:USD|USDC|PERP)$/i, ''))
    .filter(Boolean));
  const rankValue = (row) => {
    const signalScore = Math.abs(Number(row?.signal_score ?? row?.signal?.score ?? 0));
    const change24h = Math.abs(Number(row?.change_24h_pct ?? row?.signal?.change_24h_pct ?? 0));
    const hourlyVol = Math.abs(Number(row?.signal?.volatility_hourly_pct ?? row?.volatility_hourly_pct ?? 0));
    return preferVolatile
      ? (hourlyVol * 3) + signalScore + (change24h * 0.15)
      : signalScore || change24h;
  };
  const rankedRows = Array.isArray(scan?.ranked_candidates) ? scan.ranked_candidates : [];
  const marketRows = Array.isArray(scan?.markets) ? scan.markets : [];
  const seen = new Set();
  const rows = [...rankedRows, ...marketRows]
    .filter((row) => {
      const key = String(row?.pair_index ?? row?.pair_symbol ?? row?.symbol ?? '').toUpperCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((row) => !avoidSymbols.has(String(row?.symbol || '').toUpperCase()))
    .sort((a, b) => rankValue(b) - rankValue(a));
  const sideMatches = (row) => !normalizedSide || row?.suggested_side === normalizedSide || row?.signal?.side === normalizedSide || row?.signal?.suggested_side === normalizedSide;
  const assetFits = (row) => !cryptoOnly || row?.asset_class === 'crypto' || /^Crypto\./i.test(String(row?.pyth_symbol || ''));
  const leverageFits = (row) => {
    if (!(minMarketMaxLeverage > 0)) return true;
    const maxLeverage = Number(row?.max_leverage || 0);
    return maxLeverage > 0 && maxLeverage + 1e-9 >= minMarketMaxLeverage;
  };
  const leveragedCandidate = rows.find((row) => assetFits(row) && sideMatches(row) && leverageFits(row))
    || rows.find((row) => assetFits(row) && leverageFits(row))
    || rows.find((row) => sideMatches(row) && leverageFits(row));
  if (leveragedCandidate || strictLeverage) return leveragedCandidate || null;
  return rows.find((row) => assetFits(row) && sideMatches(row))
    || rows[0]
    || null;
}

function findSingleAvantisRow(rows, { symbol, pair_index, trade_index }, indexMap = {}, label = 'position') {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const wantedSymbol = String(symbol || '').trim().toUpperCase().replace(/[-_/ ]?(?:USD|USDC|PERP)$/i, '');
  const wantedPair = pair_index == null ? null : Number(pair_index);
  const wantedTrade = trade_index == null ? null : Number(trade_index);
  let matches = sourceRows.filter((row) => {
    const pair = avantisPairIndex(row);
    const idx = avantisTradeIndex(row);
    const rowSymbol = avantisPositionSymbol(row, indexMap);
    return (
      (wantedPair == null || pair === wantedPair)
      && (wantedTrade == null || idx === wantedTrade)
      && (!wantedSymbol || rowSymbol === wantedSymbol)
    );
  });
  if (!matches.length && !wantedSymbol && wantedPair == null && wantedTrade == null && sourceRows.length === 1) {
    matches = sourceRows;
  }
  if (!matches.length) {
    return {
      error: `No open Avantis ${label} found for the requested filters.`,
      available: sourceRows.map((row) => normalizeAvantisPosition(row, indexMap)),
    };
  }
  if (matches.length > 1 && wantedTrade == null) {
    return {
      error: `Multiple Avantis ${label}s match. Specify pair_index and trade_index.`,
      available: matches.map((row) => normalizeAvantisPosition(row, indexMap)),
    };
  }
  return { row: matches[0] };
}

function filterAvantisRows(rows, { symbol, pair_index, trade_index }, indexMap = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const wantedSymbol = String(symbol || '').trim().toUpperCase().replace(/[-_/ ]?(?:USD|USDC|PERP)$/i, '');
  const wantedPair = pair_index == null ? null : Number(pair_index);
  const wantedTrade = trade_index == null ? null : Number(trade_index);
  return sourceRows.filter((row) => {
    const pair = avantisPairIndex(row);
    const idx = avantisTradeIndex(row);
    const rowSymbol = avantisPositionSymbol(row, indexMap);
    return (
      (wantedPair == null || pair === wantedPair)
      && (wantedTrade == null || idx === wantedTrade)
      && (!wantedSymbol || rowSymbol === wantedSymbol)
    );
  });
}

function isAvantisCloseAllRequest(args = {}) {
  return args.all === true
    || args.close_all === true
    || args.all_positions === true
    || args.close_all_positions === true
    || String(args.scope || '').toLowerCase() === 'all';
}

function findDuplicateAvantisOpenPositionForOrder(actionArgs, positions, indexMap = {}) {
  const symbol = String(actionArgs?.symbol || '').trim().toUpperCase().replace(/[-_/ ]?(?:USD|USDC|PERP)$/i, '');
  const side = normalizeAvantisTradeSide(actionArgs?.side);
  const leverage = Number(actionArgs?.leverage || 1);
  const collateral = Number(actionArgs?.collateral_usd || 0);
  if (!symbol || !side || !(leverage > 0) || !(collateral > 0)) return null;
  for (const row of Array.isArray(positions) ? positions : []) {
    const pos = normalizeAvantisPosition(row, indexMap);
    if (pos.symbol !== symbol || pos.side !== side) continue;
    if (Math.abs(Number(pos.leverage || 0) - leverage) > 0.05) continue;
    const tolerance = Math.max(0.1, collateral * 0.08);
    if (Math.abs(Number(pos.collateral_usd || 0) - collateral) > tolerance) continue;
    return pos;
  }
  return null;
}

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function finitePositiveFromArgs(args = {}, names = []) {
  for (const name of names) {
    const value = finitePositive(args?.[name]);
    if (value > 0) return value;
  }
  return 0;
}

function roundAvantisTriggerPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Number(n.toFixed(8));
}

function avantisTriggerPriceFromPnlPct(position, pnlPct, leg) {
  const entry = finitePositive(position?.entry_price);
  const leverage = finitePositive(position?.leverage) || 1;
  const pct = finitePositive(pnlPct);
  if (!entry || !pct) return 0;
  const move = (pct / 100) / leverage;
  const side = String(position?.side || '').toLowerCase();
  if (leg === 'take_profit') {
    return roundAvantisTriggerPrice(side === 'short' ? entry * (1 - move) : entry * (1 + move));
  }
  if (leg === 'stop_loss') {
    return roundAvantisTriggerPrice(side === 'short' ? entry * (1 + move) : entry * (1 - move));
  }
  return 0;
}

function avantisMinNotionalError({ symbol, side, collateralUsd, collateralPct, leverage, notionalUsd, usdcBalance }) {
  const collateral = Number(collateralUsd || 0);
  const lev = Number(leverage || 1);
  const notional = Number(notionalUsd || collateral * lev || 0);
  const minimum = AVANTIS_MIN_NOTIONAL_USD;
  const missingNotional = Math.max(0, minimum - notional);
  const neededCollateral = lev > 0 ? minimum / lev : minimum;
  const extraCollateral = Math.max(0, neededCollateral - collateral);
  const neededLeverage = collateral > 0 ? minimum / collateral : 0;
  const balance = Number(usdcBalance || 0);
  const fullWalletNotional = Number.isFinite(balance) && balance > collateral ? balance * lev : 0;
  const fullWalletMissingNotional = fullWalletNotional > 0 ? Math.max(0, minimum - fullWalletNotional) : 0;
  const neededLeverageWithFullWallet = Number.isFinite(balance) && balance > 0 ? minimum / balance : 0;
  const balanceText = Number.isFinite(balance) && balance > 0
    ? ` Wallet balance is about ${formatUsdApprox(balance)} USDC.`
    : '';
  const fullWalletText = fullWalletNotional > 0
    ? fullWalletNotional >= minimum
      ? ` Full wallet at ${lev}x would be ${formatUsdApprox(fullWalletNotional)} notional and would meet the minimum if the player allowed more collateral.`
      : ` Full wallet at ${lev}x would be ${formatUsdApprox(fullWalletNotional)} notional, still short by ${formatUsdApprox(fullWalletMissingNotional)}; full wallet needs at least ${neededLeverageWithFullWallet.toFixed(2).replace(/\.?0+$/, '')}x.`
    : '';
  const pctText = Number(collateralPct) > 0
    ? ` This used ${Math.min(100, Number(collateralPct)).toFixed(2).replace(/\.?0+$/, '')}% of balance as collateral.`
    : '';
  const leverageHint = neededLeverage > lev
    ? ` With ${formatUsdApprox(collateral)} collateral, it needs at least ${neededLeverage.toFixed(2).replace(/\.?0+$/, '')}x leverage before policy/market caps. Policy max is ${AVANTIS_BROWSER_POLICY.max_leverage}x, so do not say leverage exceeds policy unless the required leverage is above ${AVANTIS_BROWSER_POLICY.max_leverage}x.`
    : '';
  return [
    `Avantis minimum position size is about ${formatUsdApprox(minimum)} notional.`,
    `Math for ${String(side || 'trade').toUpperCase()} ${String(symbol || '').toUpperCase()}: ${formatUsdApprox(collateral)} collateral × ${lev}x = ${formatUsdApprox(notional)} notional.`,
    `Short by ${formatUsdApprox(missingNotional)} notional.`,
    `At ${lev}x, required collateral is ${formatUsdApprox(neededCollateral)} (${formatUsdApprox(extraCollateral)} more).`,
    leverageHint,
    balanceText,
    fullWalletText,
    pctText,
  ].filter(Boolean).join(' ');
}

function normalizeAvantisTradeSide(value) {
  const side = String(value || '').trim().toLowerCase();
  if (side === 'long' || side === 'buy' || side === 'bid') return 'long';
  if (side === 'short' || side === 'sell' || side === 'ask') return 'short';
  return '';
}

function avantisBrowserPolicy(overrides = {}) {
  const now = Date.now();
  return {
    ...AVANTIS_BROWSER_POLICY,
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + AVANTIS_BROWSER_POLICY.expires_in_ms).toISOString(),
  };
}

function avantisBrowserAction(type, account, args, summary, policyOverrides = {}) {
  const policy = avantisBrowserPolicy(policyOverrides);
  const action = {
    id: `avantis:${type}:${crypto.randomUUID()}`,
    dex: 'avantis',
    type,
    trading_mode: 'browser_signature',
    wallet: account.address,
    chain: 'base',
    args,
    policy,
    summary,
    requires_wallet_signature: true,
  };
  return {
    ok: true,
    success: false,
    verified: false,
    dex: 'avantis',
    trading_mode: 'browser_signature',
    browser_action_required: true,
    browser_action: action,
    message: 'Prepared an Avantis browser action. The frontend will route it to Avantis Smart Wallet auto-signing when enabled, otherwise to the external wallet prompt.',
  };
}

async function runAvantisPlaceOrderAction(session, agentKey, args = {}) {
  try {
    const account = requireAvantisSession(session);
    if (!account.ok) return { ok: false, error: account.error };
    let symbol = String(args.symbol || args.market || '').trim().toUpperCase().replace(/\/USD$/, '');
    let side = normalizeAvantisTradeSide(args.side);
    const autoSelectMarket = args.auto_select === true || args.choose_market === true;
    const orderType = String(args.order_type || args.orderType || (finitePositive(args.price) ? 'limit' : 'market')).toLowerCase() === 'limit'
      ? 'limit'
      : 'market';
    const preferVolatile = args.prefer_volatile === true || args.preferVolatile === true || String(args.selection_strategy || args.strategy || '').toLowerCase() === 'volatile';
    const avoidSymbols = (Array.isArray(args.avoid_symbols) ? args.avoid_symbols : String(args.avoid_symbols || '').split(/[,;\s]+/))
      .map((item) => String(item || '').trim().toUpperCase().replace(/[-_/ ]?(?:USD|USDC|PERP)$/i, ''))
      .filter(Boolean);
    const requestedMaxLeverage = args.use_max_leverage === true || args.max_leverage === true;
    const explicitLeverage = finitePositive(args.leverage) || finitePositive(typeof args.max_leverage === 'number' ? args.max_leverage : 0);
    let leverage = requestedMaxLeverage
      ? AVANTIS_BROWSER_POLICY.max_leverage
      : Math.max(1, Math.min(1000, explicitLeverage || 2));
    const slippagePct = Math.max(0.1, Math.min(50, finitePositive(args.slippage_pct ?? args.slippagePct ?? args.slippage_percent) || 1));
    const [usdcBalance, ethBalance] = await Promise.all([
      avantis.getUsdcBalance(account.address).catch(() => 0),
      avantis.getEthBalance(account.address).catch(() => 0),
    ]);
    const requestedCollateralUsd = finitePositive(args.collateral_usd ?? args.collateralUsd ?? args.amount_usd ?? args.amount);
    const collateralPct = finitePositive(args.collateral_pct ?? args.collateralPct ?? args.balance_percent ?? args.balancePercent);
    const notionalUsd = finitePositive(args.notional_usd ?? args.notionalUsd);
    let estimatedCollateralUsd = requestedCollateralUsd || 0;
    if (!estimatedCollateralUsd && collateralPct) {
      estimatedCollateralUsd = usdcBalance * (Math.max(0.01, Math.min(100, collateralPct)) / 100);
    }
    if (!estimatedCollateralUsd && notionalUsd) estimatedCollateralUsd = notionalUsd / leverage;

    let marketDecision = null;
    let selectedMarketMaxLeverage = null;
    const shouldAutoSelectMarket = autoSelectMarket || (preferVolatile && avoidSymbols.includes(symbol));
    if (!symbol || !side || shouldAutoSelectMarket || preferVolatile) {
      const scan = await buildAvantisMarketScan({
        symbols: symbol && !shouldAutoSelectMarket ? [symbol] : [],
        limit: symbol && !shouldAutoSelectMarket ? 20 : 120,
        chart_limit: symbol && !shouldAutoSelectMarket ? 8 : 40,
        lookback_hours: finitePositive(args.analysis_lookback_hours) || 24,
      });
      const minLeverageForMinNotional = estimatedCollateralUsd > 0 ? AVANTIS_MIN_NOTIONAL_USD / estimatedCollateralUsd : 0;
      const requiredMarketMaxLeverage = requestedMaxLeverage
        ? minLeverageForMinNotional
        : Math.max(leverage, minLeverageForMinNotional);
      const candidate = chooseAvantisScanCandidate(scan, side, {
        min_market_max_leverage: requiredMarketMaxLeverage,
        strict_leverage: requiredMarketMaxLeverage > 0,
        crypto_only: !symbol || shouldAutoSelectMarket,
        prefer_volatile: preferVolatile,
        avoid_symbols: avoidSymbols,
      });
      if (!candidate && requiredMarketMaxLeverage > 0) {
        const fittingMarkets = (Array.isArray(scan?.markets) ? scan.markets : [])
          .filter((row) => Number(row?.max_leverage || 0) + 1e-9 >= requiredMarketMaxLeverage)
          .filter((row) => !symbol || autoSelectMarket || String(row?.symbol || '').toUpperCase() === symbol)
          .slice(0, 8)
          .map((row) => ({
            symbol: row.symbol,
            max_leverage: row.max_leverage,
            asset_class: row.asset_class,
            suggested_side: row.suggested_side,
          }));
        return {
          ok: false,
          error: `No Avantis ${symbol || 'crypto'} market in the scan supports ${requiredMarketMaxLeverage.toFixed(2).replace(/\.?0+$/, '')}x leverage. Need: choose a lower leverage or a market with higher max leverage.`,
          requested_leverage: leverage,
          required_market_max_leverage: Number(requiredMarketMaxLeverage.toFixed(6)),
          fitting_markets: fittingMarkets,
        };
      }
      if (candidate) {
        if (!symbol || shouldAutoSelectMarket) symbol = String(candidate.symbol || '').toUpperCase();
        if (!side) side = normalizeAvantisTradeSide(candidate.suggested_side || candidate.signal?.side || candidate.signal?.suggested_side);
        if (requestedMaxLeverage && Number(candidate.max_leverage) > 0) {
          leverage = Math.min(leverage, Number(candidate.max_leverage));
        }
        selectedMarketMaxLeverage = Number(candidate.max_leverage || 0) || null;
        marketDecision = {
          selected_symbol: String(candidate.symbol || '').toUpperCase(),
          selected_side: candidate.suggested_side || candidate.signal?.side || side,
          pair_index: candidate.pair_index,
          mark_price: candidate.mark_price,
          max_leverage: selectedMarketMaxLeverage,
          change_1h_pct: candidate.signal?.change_1h_pct ?? null,
          change_4h_pct: candidate.signal?.change_4h_pct ?? null,
          change_24h_pct: candidate.signal?.change_24h_pct ?? candidate.change_24h_pct ?? null,
          signal_score: candidate.signal_score ?? candidate.signal?.score ?? null,
          reason: candidate.signal?.reason || scan.selection_rule,
          sparkline_24h: candidate.chart?.sparkline || [],
          chart_source: candidate.chart?.source || null,
          prefer_volatile: preferVolatile || null,
          avoid_symbols: avoidSymbols.length ? avoidSymbols : null,
          min_leverage_for_min_notional: minLeverageForMinNotional > 0 ? Number(minLeverageForMinNotional.toFixed(3)) : null,
          required_market_max_leverage: requiredMarketMaxLeverage > 0 ? Number(requiredMarketMaxLeverage.toFixed(3)) : null,
          scanned_markets: scan.total_returned,
          charted_markets: scan.charted_markets,
        };
      }
    }
    if (!symbol) return { ok: false, error: 'Avantis market scan could not choose a tradable symbol. Try specifying SOL, BTC, ETH, or another market.' };
    if (!side) return { ok: false, error: 'Avantis market scan could not choose long or short. Specify side or retry.' };
    if (!selectedMarketMaxLeverage) {
      const marketRows = await normalizeAvantisMarkets([symbol], 5);
      const market = marketRows.find((row) => String(row?.symbol || '').toUpperCase() === symbol) || marketRows[0] || null;
      selectedMarketMaxLeverage = avantisMarketMaxLeverage(market);
    }
    if (requestedMaxLeverage && Number(selectedMarketMaxLeverage) > 0) {
      leverage = Math.min(leverage, Number(selectedMarketMaxLeverage));
    }
    if (Number(selectedMarketMaxLeverage) > 0 && leverage > Number(selectedMarketMaxLeverage) + 1e-9) {
      return {
        ok: false,
        error: `Avantis ${symbol} supports max ${selectedMarketMaxLeverage}x leverage, but the prepared order used ${leverage}x. Need: choose a market that supports ${leverage}x or lower leverage for ${symbol}.`,
        symbol,
        requested_leverage: leverage,
        market_max_leverage: selectedMarketMaxLeverage,
      };
    }
    if (leverage > AVANTIS_BROWSER_POLICY.max_leverage) {
      return { ok: false, error: `Browser AI policy blocks Avantis leverage above ${AVANTIS_BROWSER_POLICY.max_leverage}x.` };
    }
    if (slippagePct > AVANTIS_BROWSER_POLICY.max_slippage_pct) {
      return { ok: false, error: `Browser AI policy blocks Avantis slippage above ${AVANTIS_BROWSER_POLICY.max_slippage_pct}%.` };
    }

    let collateralUsd = requestedCollateralUsd;
    if (!collateralUsd && collateralPct) {
      collateralUsd = usdcBalance * (Math.max(0.01, Math.min(100, collateralPct)) / 100);
    }
    if (!collateralUsd && notionalUsd) collateralUsd = notionalUsd / leverage;
    if (!collateralUsd) {
      const minCollateral = 100 / leverage;
      const defaultCollateral = Math.min(Math.max(usdcBalance * 0.1, minCollateral), 50);
      collateralUsd = defaultCollateral;
    }
    collateralUsd = Number(collateralUsd.toFixed(6));
    const finalNotional = Number((collateralUsd * leverage).toFixed(6));
    if (!(collateralUsd > 0)) return { ok: false, error: 'Avantis order needs collateral_usd or notional_usd.' };
    if (finalNotional < AVANTIS_MIN_NOTIONAL_USD) {
      return {
        ok: false,
        error: avantisMinNotionalError({
          symbol,
          side,
          collateralUsd,
          collateralPct,
          leverage,
          notionalUsd: finalNotional,
          usdcBalance,
        }),
        minimum_notional_usd: AVANTIS_MIN_NOTIONAL_USD,
        collateral_usd: collateralUsd,
        collateral_pct: collateralPct || null,
        leverage,
        notional_usd: finalNotional,
        balance_usdc: usdcBalance,
        required_collateral_usd: Number((AVANTIS_MIN_NOTIONAL_USD / leverage).toFixed(6)),
        required_leverage_for_collateral: collateralUsd > 0
          ? Number((AVANTIS_MIN_NOTIONAL_USD / collateralUsd).toFixed(6))
          : null,
      };
    }
    if (collateralUsd > AVANTIS_BROWSER_POLICY.max_collateral_usd) {
      return { ok: false, error: `Browser AI policy blocks Avantis collateral above $${AVANTIS_BROWSER_POLICY.max_collateral_usd}.` };
    }
    if (finalNotional > AVANTIS_BROWSER_POLICY.max_notional_usd) {
      return { ok: false, error: `Browser AI policy blocks Avantis notional above $${AVANTIS_BROWSER_POLICY.max_notional_usd}.` };
    }
    if (orderType === 'limit' && !finitePositive(args.price)) {
      return { ok: false, error: 'Limit orders need a positive price.' };
    }

    const actionArgs = {
      symbol,
      side,
      order_type: orderType,
      collateral_usd: collateralUsd,
      leverage,
      market_max_leverage: selectedMarketMaxLeverage,
      slippage_pct: slippagePct,
      notional_usd: finalNotional,
      take_profit: finitePositive(args.take_profit ?? args.tp) || null,
      stop_loss: finitePositive(args.stop_loss ?? args.sl) || null,
      market_analysis: marketDecision,
      ...(orderType === 'limit' ? { price: finitePositive(args.price) } : {}),
    };
    const [{ indexMap }, openPositions] = await Promise.all([
      avantisPairs(),
      avantis.getPositionsByAddress(account.address).catch(() => []),
    ]);
    const duplicatePosition = findDuplicateAvantisOpenPositionForOrder(actionArgs, openPositions, indexMap);
    if (duplicatePosition) {
      return {
        ok: false,
        error: `Duplicate Avantis order blocked: ${side.toUpperCase()} ${symbol} with about $${collateralUsd.toFixed(2)} collateral at ${leverage}x is already open. Close or change the existing position first.`,
        duplicate_position: duplicatePosition,
        requested_order: actionArgs,
      };
    }
    if (usdcBalance + 1e-9 < collateralUsd) {
      return {
        ok: false,
        error: `Registered browser wallet has insufficient USDC. Need ${collateralUsd.toFixed(2)} USDC, have ${Number(usdcBalance || 0).toFixed(2)}.`,
        self_custody_address: account.address,
        balance_usdc: usdcBalance,
        balance_eth: ethBalance,
      };
    }
    if (!(ethBalance >= 0.0002)) {
      return {
        ok: false,
        error: `Registered browser wallet needs Base ETH for gas. Have ${Number(ethBalance || 0).toFixed(6)} ETH, need about 0.0002 ETH.`,
        self_custody_address: account.address,
        balance_usdc: usdcBalance,
        balance_eth: ethBalance,
      };
    }
    const output = avantisBrowserAction(
      'place_order',
      account,
      actionArgs,
      `${side.toUpperCase()} ${symbol} ${orderType} with $${collateralUsd.toFixed(2)} collateral at ${leverage}x`
    );
    await notifyAgentAction(agentKey, 'avantis_browser_action_prepared', output);
    return output;
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function runAvantisClosePositionAction(session, agentKey, args = {}) {
  try {
    const account = requireAvantisSession(session);
    if (!account.ok) return { ok: false, error: account.error };
    const [{ indexMap }, positions] = await Promise.all([
      avantisPairs(),
      avantis.getPositionsByAddress(account.address),
    ]);
    const percent = finitePositive(args.percent ?? args.close_percent) || 100;
    const closePercent = Number(Math.max(0.01, Math.min(100, percent)).toFixed(4));
    if (isAvantisCloseAllRequest(args)) {
      const matches = filterAvantisRows(positions, args, indexMap);
      if (!matches.length) {
        return {
          ok: false,
          error: 'No open Avantis positions found for the requested filters.',
          available_positions: positions.map((row) => normalizeAvantisPosition(row, indexMap)),
        };
      }
      const normalizedRows = matches.map((row) => normalizeAvantisPosition(row, indexMap));
      const browserActions = normalizedRows.map((normalized) => {
        const amount = normalized.collateral_usd * (closePercent / 100);
        const actionArgs = {
          symbol: normalized.symbol,
          side: normalized.side,
          pair_index: normalized.pair_index,
          trade_index: normalized.trade_index,
          collateral_usd: Number(amount.toFixed(6)),
          percent: closePercent,
          position: normalized,
        };
        return avantisBrowserAction(
          'close_position',
          account,
          actionArgs,
          `Close ${actionArgs.percent}% of ${normalized.symbol} ${normalized.side.toUpperCase()} #${normalized.trade_index}`
        ).browser_action;
      });
      const output = {
        ok: true,
        success: false,
        verified: false,
        dex: 'avantis',
        trading_mode: 'browser_signature',
        browser_action_required: true,
        browser_action: browserActions[0] || null,
        browser_actions: browserActions,
        count: browserActions.length,
        positions: normalizedRows,
        message: `Prepared ${browserActions.length} Avantis close action(s). The frontend will route each action to Smart Wallet auto-signing when enabled, otherwise to the external wallet prompt.`,
      };
      await notifyAgentAction(agentKey, 'avantis_browser_action_prepared', output);
      return output;
    }
    const selected = findSingleAvantisRow(positions, args, indexMap, 'position');
    if (selected.error) return { ok: false, error: selected.error, available_positions: selected.available };
    const normalized = normalizeAvantisPosition(selected.row, indexMap);
    const amount = finitePositive(args.amount ?? args.collateral_usd ?? args.collateralUsd)
      || normalized.collateral_usd * (closePercent / 100);
    const actionArgs = {
      symbol: normalized.symbol,
      side: normalized.side,
      pair_index: normalized.pair_index,
      trade_index: normalized.trade_index,
      collateral_usd: Number(amount.toFixed(6)),
      percent: closePercent,
      position: normalized,
    };
    const output = avantisBrowserAction(
      'close_position',
      account,
      actionArgs,
      `Close ${actionArgs.percent}% of ${normalized.symbol} ${normalized.side.toUpperCase()}`
    );
    await notifyAgentAction(agentKey, 'avantis_browser_action_prepared', output);
    return output;
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function runAvantisCancelOrderAction(session, agentKey, args = {}) {
  try {
    const account = requireAvantisSession(session);
    if (!account.ok) return { ok: false, error: account.error };
    const [{ indexMap }, orders] = await Promise.all([
      avantisPairs(),
      avantis.getOpenOrdersByAddress(account.address),
    ]);
    const selected = findSingleAvantisRow(orders, args, indexMap, 'order');
    if (selected.error) return { ok: false, error: selected.error, available_orders: selected.available };
    const normalized = normalizeAvantisOrder(selected.row, indexMap);
    const actionArgs = {
      symbol: normalized.symbol,
      side: normalized.side,
      pair_index: normalized.pair_index,
      trade_index: normalized.trade_index,
      order: normalized,
    };
    const output = avantisBrowserAction(
      'cancel_order',
      account,
      actionArgs,
      `Cancel ${normalized.symbol} ${normalized.side.toUpperCase()} limit order`
    );
    await notifyAgentAction(agentKey, 'avantis_browser_action_prepared', output);
    return output;
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function runAvantisSetTpslAction(session, agentKey, args = {}) {
  try {
    const account = requireAvantisSession(session);
    if (!account.ok) return { ok: false, error: account.error };
    const takeProfitPriceInput = finitePositive(args.take_profit ?? args.tp);
    const stopLossPriceInput = finitePositive(args.stop_loss ?? args.sl);
    const takeProfitPnlPct = finitePositiveFromArgs(args, [
      'take_profit_pnl_pct',
      'take_profit_profit_pct',
      'take_profit_pct',
      'tp_pnl_pct',
      'tp_profit_pct',
      'tp_pct',
    ]);
    const stopLossPnlPct = finitePositiveFromArgs(args, [
      'stop_loss_pnl_pct',
      'stop_loss_loss_pct',
      'stop_loss_pct',
      'sl_pnl_pct',
      'sl_loss_pct',
      'sl_pct',
    ]);
    if (!takeProfitPriceInput && !stopLossPriceInput && !takeProfitPnlPct && !stopLossPnlPct) {
      return { ok: false, error: 'Provide take_profit, stop_loss, or both.' };
    }
    const [{ indexMap }, positions] = await Promise.all([
      avantisPairs(),
      avantis.getPositionsByAddress(account.address),
    ]);
    const selected = findSingleAvantisRow(positions, args, indexMap, 'position');
    if (selected.error) return { ok: false, error: selected.error, available_positions: selected.available };
    const normalized = normalizeAvantisPosition(selected.row, indexMap);
    const computedTakeProfit = takeProfitPnlPct
      ? avantisTriggerPriceFromPnlPct(normalized, takeProfitPnlPct, 'take_profit')
      : 0;
    const computedStopLoss = stopLossPnlPct
      ? avantisTriggerPriceFromPnlPct(normalized, stopLossPnlPct, 'stop_loss')
      : 0;
    const nextTakeProfit = takeProfitPriceInput || computedTakeProfit || (finitePositive(normalized.take_profit) || null);
    const nextStopLoss = stopLossPriceInput || computedStopLoss || (finitePositive(normalized.stop_loss) || null);
    const actionArgs = {
      symbol: normalized.symbol,
      side: normalized.side,
      pair_index: normalized.pair_index,
      trade_index: normalized.trade_index,
      take_profit: nextTakeProfit,
      stop_loss: nextStopLoss,
      take_profit_pnl_pct: takeProfitPnlPct || null,
      stop_loss_pnl_pct: stopLossPnlPct || null,
      tpsl_basis: takeProfitPnlPct || stopLossPnlPct ? 'pnl_pct' : 'price',
      position: normalized,
    };
    const output = avantisBrowserAction(
      'set_tpsl',
      account,
      actionArgs,
      `Set ${normalized.symbol} TP/SL in browser wallet`
    );
    await notifyAgentAction(agentKey, 'avantis_browser_action_prepared', output);
    return output;
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
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

function decibelIntervalSeconds(interval) {
  switch (String(interval || '').toLowerCase()) {
    case '1m': return 60;
    case '5m': return 5 * 60;
    case '15m': return 15 * 60;
    case '30m': return 30 * 60;
    case '1h': return 60 * 60;
    case '4h': return 4 * 60 * 60;
    case '1d': return 24 * 60 * 60;
    default: return 60 * 60;
  }
}

function roundIndicator(value, digits = 4) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}

function emaSeries(values, period) {
  const p = Math.max(1, Math.floor(Number(period) || 1));
  const k = 2 / (p + 1);
  const out = [];
  let ema = null;
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) {
      out.push(null);
      continue;
    }
    if (ema == null) ema = value;
    else ema = value * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function computeRsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function computeMacd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (!Array.isArray(closes) || closes.length < slow + signalPeriod) return null;
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const macd = closes.map((_, i) => (
    fastEma[i] == null || slowEma[i] == null ? null : fastEma[i] - slowEma[i]
  ));
  const signal = emaSeries(macd.map((v) => (v == null ? 0 : v)), signalPeriod);
  const last = macd.length - 1;
  const prev = Math.max(0, last - 1);
  const line = macd[last];
  const prevLine = macd[prev];
  const sig = signal[last];
  const prevSig = signal[prev];
  const histogram = line - sig;
  return {
    line,
    signal: sig,
    histogram,
    previous_line: prevLine,
    previous_signal: prevSig,
    crossed_signal_up: prevLine <= prevSig && line > sig,
    crossed_signal_down: prevLine >= prevSig && line < sig,
    crossed_zero_up: prevLine <= 0 && line > 0,
    crossed_zero_down: prevLine >= 0 && line < 0,
  };
}

function computeAtr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length <= period) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const high = Number(candles[i].high);
    const low = Number(candles[i].low);
    const prevClose = Number(candles[i - 1].close);
    if (![high, low, prevClose].every(Number.isFinite)) continue;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (trs.length < period) return null;
  const window = trs.slice(-period);
  return window.reduce((sum, v) => sum + v, 0) / window.length;
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function decibelScanFromCandles({ market, candles, interval }) {
  const closes = candles.map((c) => Number(c.close)).filter(Number.isFinite);
  const last = candles[candles.length - 1] || null;
  const prev = candles[candles.length - 2] || null;
  const rsi = computeRsi(closes, 14);
  const macd = computeMacd(closes, 12, 26, 9);
  const atr = computeAtr(candles, 14);
  const volumes = candles.map((c) => Number(c.volume)).filter(Number.isFinite);
  const lastVolume = volumes[volumes.length - 1] || 0;
  const avgVolume20 = average(volumes.slice(-21, -1)) || average(volumes.slice(-20)) || 0;
  const volumeRatio = avgVolume20 > 0 ? lastVolume / avgVolume20 : null;
  const intervalSec = decibelIntervalSeconds(interval);
  const nowSec = Math.floor(Date.now() / 1000);
  const lastSec = Number(last?.time || 0);
  const stale = !lastSec || nowSec - lastSec > intervalSec * 3;
  const close = Number(last?.close || market.mark_price || 0);
  const previousClose = Number(prev?.close || 0);
  const changePct = previousClose > 0 ? ((close - previousClose) / previousClose) * 100 : null;
  return {
    symbol: market.symbol,
    market_name: market.market_name,
    market_addr: market.market_addr,
    interval,
    candles: candles.length,
    stale,
    stale_seconds: lastSec ? nowSec - lastSec : null,
    mark_price: roundIndicator(market.mark_price || close, 8),
    last_close: roundIndicator(close, 8),
    previous_close: roundIndicator(previousClose, 8),
    last_change_pct: roundIndicator(changePct, 4),
    rsi_14: roundIndicator(rsi, 2),
    macd: macd ? {
      line: roundIndicator(macd.line, 8),
      signal: roundIndicator(macd.signal, 8),
      histogram: roundIndicator(macd.histogram, 8),
      crossed_signal_up: !!macd.crossed_signal_up,
      crossed_signal_down: !!macd.crossed_signal_down,
      crossed_zero_up: !!macd.crossed_zero_up,
      crossed_zero_down: !!macd.crossed_zero_down,
    } : null,
    volume: {
      last: roundIndicator(lastVolume, 4),
      avg_20: roundIndicator(avgVolume20, 4),
      ratio_to_avg_20: roundIndicator(volumeRatio, 4),
      good: Number.isFinite(volumeRatio) ? volumeRatio >= 1.15 : false,
    },
    atr_14: roundIndicator(atr, 8),
    atr_pct: close > 0 && atr != null ? roundIndicator((atr / close) * 100, 4) : null,
    blockers: [
      stale ? 'Market data is stale; do not trade from this scan.' : '',
      candles.length < 50 ? 'Not enough candles for reliable RSI/MACD.' : '',
    ].filter(Boolean),
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
  const mark = Number(position?.mark_price ?? position?.markPrice ?? position?.market_price ?? position?.marketPrice ?? 0);
  const isLong = decibel.positionIsLong(position);
  return {
    symbol,
    side: isLong ? 'long' : 'short',
    size: Math.abs(size),
    entry_price: Number.isFinite(entry) ? entry : null,
    mark_price: mark > 0 ? mark : null,
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

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function decibelClosePnlPrice(placed, position) {
  const fillPrice = firstPositiveNumber(
    placed?.verification?.fill_price,
    placed?.verification?.fillPrice,
    placed?.verification?.price,
    placed?.result?.fill_price,
    placed?.result?.fillPrice,
    placed?.result?.avg_fill_price,
    placed?.result?.avgFillPrice,
    placed?.order?.fill_price,
    placed?.order?.fillPrice,
  );
  if (fillPrice) return { price: fillPrice, source: 'fill_price' };

  const markPrice = firstPositiveNumber(
    placed?.order?.mark_price,
    placed?.order?.markPrice,
    position?.mark_price,
    position?.markPrice,
  );
  if (markPrice) return { price: markPrice, source: 'mark_price' };

  const acceptablePrice = firstPositiveNumber(placed?.order?.execution_price, placed?.order?.executionPrice);
  if (acceptablePrice) return { price: acceptablePrice, source: 'acceptable_execution_price' };

  const entryPrice = firstPositiveNumber(position?.entry_price, position?.entryPrice);
  return { price: entryPrice, source: entryPrice ? 'entry_price_fallback' : 'unavailable' };
}

function decibelCloseSettlementNote(closePnl) {
  if (!closePnl) return 'Final PnL settlement is not available yet.';
  if (closePnl.price_source === 'fill_price') {
    return 'PnL is estimated from the reported fill price; final exchange settlement may update slightly.';
  }
  if (closePnl.price_source === 'mark_price') {
    return 'PnL is estimated from mark price at close submission; final exchange settlement may update slightly.';
  }
  if (closePnl.price_source === 'acceptable_execution_price') {
    return 'PnL is estimated from the reduce-only acceptable price because mark/fill price was unavailable; final exchange settlement may update.';
  }
  return 'PnL is estimated from available position data; final exchange settlement may update.';
}

function estimateDecibelClosePnl(position, closeSize, exitPrice, options = {}) {
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
  const acceptableExecutionPrice = firstPositiveNumber(options.acceptableExecutionPrice);

  return {
    realized_pnl_usd_estimate: Number(pnlUsd.toFixed(6)),
    realized_pnl_pct_estimate: pnlPct == null ? null : Number(pnlPct.toFixed(4)),
    price_move_pct: Number(priceMovePct.toFixed(4)),
    entry_price: entry,
    exit_price: exit,
    price_source: options.priceSource || 'unknown',
    acceptable_execution_price: acceptableExecutionPrice == null ? null : Number(acceptableExecutionPrice.toFixed(6)),
    closed_size_base: size,
    closed_entry_notional_usd: Number(closedEntryNotional.toFixed(6)),
    closed_exit_notional_usd: Number(closedExitNotional.toFixed(6)),
    closed_collateral_usd: Number(closedCollateral.toFixed(6)),
    method: options.priceSource === 'mark_price'
      ? 'entry_mark_estimate'
      : options.priceSource === 'fill_price'
        ? 'entry_fill_estimate'
        : 'entry_exit_estimate',
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
    return requested ? { ...cached.value, subaccount: requested } : cached.value;
  }
  const primary = decibel.normalizeAptosAddress(await decibel.getPrimarySubaccountAddr(owner));
  const subaccounts = await decibel.fetchUserSubaccounts(owner);
  const value = {
    ok: true,
    owner,
    subaccount: requested || primary,
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
  const closePrice = decibelClosePnlPrice(placed, normalized);
  const closePnl = estimateDecibelClosePnl(normalized, closedSize, closePrice.price, {
    priceSource: closePrice.source,
    acceptableExecutionPrice: placed?.order?.execution_price,
  });
  const remainingSize = Math.max(0, normalized.size - closedSize);
  const remainingPrice = firstPositiveNumber(closePrice.price, placed?.order?.mark_price, normalized.entry_price, placed?.order?.execution_price) || 0;
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
      remaining_notional_usd: Number((remainingSize * remainingPrice).toFixed(6)),
      ...closePnl,
      settlement_note: decibelCloseSettlementNote(closePnl),
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
        cannon_initial_energy: combat.cannonInitialEnergyForShipLevel(game.getPlayerShip(playerId).level),
        cannon_damage: combat.cannonDamageForShipLevel(game.getPlayerShip(playerId).level),
        cannon_shot_cost: 'level-based base cost, then +1 energy per repeated shot',
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
      const playerShip = game.getPlayerShip(playerId);
      const energyCheck = validateAiAttackEnergy(
        resolvedCannonShots,
        resolvedRallyMarker,
        playerShip.level,
      );
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
        serverShipLevel: playerShip.level,
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
            serverShipLevel: playerShip.level,
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
    'auto_upgrade_buildings',
    {
      title: 'Auto Upgrade Buildings',
      description: 'Upgrade multiple affordable owned buildings in one action. Use for broad requests like upgrade all buildings, upgrade everything, or upgrade 10 buildings.',
      inputSchema: {
        focus: z.enum(['balanced', 'economy', 'defense', 'ports', 'town_hall']).optional(),
        target_type: z.string().optional(),
        max_upgrades: z.number().int().min(1).max(20).optional(),
      },
    },
    async ({ focus = 'balanced', target_type, max_upgrades = 10 }) => {
      const result = await autoUpgradeBuildings(playerId, agentKey, { focus, target_type, max_upgrades });
      if (!result.success) return toolError('No eligible buildings could be upgraded', result);
      return jsonResult(result);
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
      description: 'Upgrade an active troop type: knight, mage, archer, or demon_king.',
      inputSchema: {
        troop_type: z.string(),
      },
    },
    async ({ troop_type }) => {
      const normalized = normalizeTroopType(troop_type);
      if (!normalized) return toolError('Invalid troop_type. Use knight, mage, archer, or demon_king.');
      const result = game.upgradeTroop(playerId, normalized);
      if (result.error) return toolError(result.error, result);
      await notifyAgentAction(agentKey, 'upgrade_troop', { troop_type: normalized, ...result });
      return jsonResult({ ...result, base: buildBaseState(playerId, false) });
    }
  );

  server.registerTool(
    'avantis_get_account',
    {
      title: 'Avantis Account',
      description: 'Read Avantis account data for the authenticated player wallet. Avantis writes are prepared by MCP and submitted in the browser via wallet or Avantis Smart Wallet delegate; no server private key is stored.',
      inputSchema: {
        include_orders: z.boolean().optional(),
      },
    },
    async ({ include_orders = true }) => {
      const account = requireAvantisSession(session);
      if (!account.ok) return toolError(account.error);
      const selfCustody = await avantis.getAccountInfoByAddress(account.address);
      return jsonResult({
        success: true,
        dex: 'avantis',
        trading_modes: {
          self_custody: {
            address: account.address,
            can_read: true,
            can_write_from_mcp: 'prepare_only',
            signing: 'browser_or_avantis_smart_wallet',
            reason: 'MCP prepares the Avantis action; the browser submits it after client-side policy checks through the connected wallet or an enabled Avantis Smart Wallet delegate.',
          },
        },
        self_custody_account: selfCustody,
        include_orders,
      });
    }
  );

  server.registerTool(
    'avantis_get_markets',
    {
      title: 'Avantis Markets',
      description: 'List Avantis markets and mark prices from the same Avantis/Pyth feeds used by the app.',
      inputSchema: {
        symbols: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(120).optional(),
      },
    },
    async ({ symbols = [], limit = 60 }) => {
      const account = requireAvantisSession(session);
      if (!account.ok) return toolError(account.error);
      const markets = await normalizeAvantisMarkets(symbols, limit);
      return jsonResult({
        success: true,
        dex: 'avantis',
        markets,
        total_returned: markets.length,
      });
    }
  );

  server.registerTool(
    'avantis_market_scan',
    {
      title: 'Avantis Market Scan',
      description: 'List Avantis markets plus compact chart/sparkline momentum signals so the agent can choose a trade when the player delegates symbol/side selection.',
      inputSchema: {
        symbols: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(120).optional(),
        chart_limit: z.number().int().min(1).max(80).optional(),
        lookback_hours: z.number().int().min(4).max(168).optional(),
      },
    },
    async ({ symbols = [], limit = 120, chart_limit = 40, lookback_hours = 24 }) => {
      const account = requireAvantisSession(session);
      if (!account.ok) return toolError(account.error);
      const scan = await buildAvantisMarketScan({ symbols, limit, chart_limit, lookback_hours });
      return jsonResult(scan);
    }
  );

  server.registerTool(
    'avantis_get_positions',
    {
      title: 'Avantis Positions',
      description: 'Read Avantis open positions and open limit orders for the player browser wallet.',
      inputSchema: {
        include_orders: z.boolean().optional(),
      },
    },
    async ({ include_orders = true }) => {
      const account = requireAvantisSession(session);
      if (!account.ok) return toolError(account.error);
      const { indexMap } = await avantisPairs();
      const [positions, orders] = await Promise.all([
        avantis.getPositionsByAddress(account.address),
        include_orders ? avantis.getOpenOrdersByAddress(account.address) : Promise.resolve([]),
      ]);
      return jsonResult({
        success: true,
        dex: 'avantis',
        self_custody_address: account.address,
        positions: positions.map((row) => normalizeAvantisPosition(row, indexMap)),
        open_orders: orders.map((row) => normalizeAvantisOrder(row, indexMap)),
        signing: 'browser_or_avantis_smart_wallet',
      });
    }
  );

  server.registerTool(
    'avantis_place_order',
    {
      title: 'Avantis Place Order',
      description: 'Prepare an Avantis market/limit long or short. MCP never signs; the browser performs the final transaction after policy checks via wallet or Avantis Smart Wallet delegate.',
      inputSchema: {
        symbol: z.string().optional(),
        side: z.enum(['long', 'short', 'buy', 'sell', 'bid', 'ask']).optional(),
        order_type: z.enum(['market', 'limit']).optional(),
        price: z.number().positive().optional(),
        collateral_usd: z.number().positive().optional(),
        collateral_pct: z.number().positive().max(100).optional(),
        notional_usd: z.number().positive().optional(),
        leverage: z.number().positive().max(1000).optional(),
        use_max_leverage: z.boolean().optional(),
        max_leverage: z.union([z.boolean(), z.number().positive().max(1000)]).optional(),
        slippage_pct: z.number().positive().max(50).optional(),
        take_profit: z.number().positive().optional(),
        stop_loss: z.number().positive().optional(),
        auto_select: z.boolean().optional(),
        choose_market: z.boolean().optional(),
        prefer_volatile: z.boolean().optional(),
        preferVolatile: z.boolean().optional(),
        selection_strategy: z.enum(['volatile', 'momentum']).optional(),
        avoid_symbols: z.union([z.array(z.string()), z.string()]).optional(),
        analysis_lookback_hours: z.number().int().min(4).max(168).optional(),
      },
    },
    async (args) => {
      const placed = await runAvantisPlaceOrderAction(session, agentKey, args);
      if (!placed.ok) return toolError(placed.error, placed);
      return jsonResult(placed);
    }
  );

  server.registerTool(
    'avantis_close_position',
    {
      title: 'Avantis Close Position',
      description: 'Prepare a browser-signed close/reduce action for the player Avantis position. If symbol is omitted, prepares the only open position or returns a blocker.',
      inputSchema: {
        symbol: z.string().optional(),
        pair_index: z.number().int().min(0).optional(),
        trade_index: z.number().int().min(0).optional(),
        amount: z.number().positive().optional(),
        collateral_usd: z.number().positive().optional(),
        percent: z.number().positive().max(100).optional(),
        all: z.boolean().optional(),
        close_all: z.boolean().optional(),
        all_positions: z.boolean().optional(),
        close_all_positions: z.boolean().optional(),
      },
    },
    async (args) => {
      const closed = await runAvantisClosePositionAction(session, agentKey, args);
      if (!closed.ok) return toolError(closed.error, closed);
      return jsonResult(closed);
    }
  );

  server.registerTool(
    'avantis_cancel_order',
    {
      title: 'Avantis Cancel Order',
      description: 'Prepare a browser-signed cancel action for a player Avantis open limit order by pair/trade index or by unambiguous symbol.',
      inputSchema: {
        symbol: z.string().optional(),
        pair_index: z.number().int().min(0).optional(),
        trade_index: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      const cancelled = await runAvantisCancelOrderAction(session, agentKey, args);
      if (!cancelled.ok) return toolError(cancelled.error, cancelled);
      return jsonResult(cancelled);
    }
  );

  server.registerTool(
    'avantis_set_tpsl',
    {
      title: 'Avantis Set TP/SL',
      description: 'Prepare a browser-signed take-profit and/or stop-loss update on a player Avantis position.',
      inputSchema: {
        symbol: z.string().optional(),
        pair_index: z.number().int().min(0).optional(),
        trade_index: z.number().int().min(0).optional(),
        take_profit: z.number().positive().optional(),
        stop_loss: z.number().positive().optional(),
        take_profit_pnl_pct: z.number().positive().optional(),
        take_profit_profit_pct: z.number().positive().optional(),
        take_profit_pct: z.number().positive().optional(),
        tp_pnl_pct: z.number().positive().optional(),
        tp_profit_pct: z.number().positive().optional(),
        tp_pct: z.number().positive().optional(),
        stop_loss_pnl_pct: z.number().positive().optional(),
        stop_loss_loss_pct: z.number().positive().optional(),
        stop_loss_pct: z.number().positive().optional(),
        sl_pnl_pct: z.number().positive().optional(),
        sl_loss_pct: z.number().positive().optional(),
        sl_pct: z.number().positive().optional(),
      },
    },
    async (args) => {
      const updated = await runAvantisSetTpslAction(session, agentKey, args);
      if (!updated.ok) return toolError(updated.error, updated);
      return jsonResult(updated);
    }
  );

  server.registerTool(
    'hermes_job_list',
    {
      title: 'Hermes Job List',
      description: 'List the authenticated player scheduled Hermes jobs and their latest status.',
      inputSchema: {},
    },
    async () => jsonResult({
      success: true,
      jobs: hermesJobs.listJobs(playerId),
    })
  );

  server.registerTool(
    'hermes_job_create_draft',
    {
      title: 'Create Hermes Job Draft',
      description: 'Create a draft scheduled Decibel monitoring job. Drafts do not run until the player activates them in the UI or updates status to active.',
      inputSchema: {
        name: z.string().optional(),
        instruction: z.string(),
        mode: z.enum(['monitor_only', 'ask_before_trade', 'auto_trade']).optional(),
        symbols: z.array(z.string()).optional(),
        interval_minutes: z.number().int().min(15).max(1440).optional(),
        max_runs_per_day: z.number().int().min(1).max(96).optional(),
        expires_at: z.string().optional(),
        policy: z.object({
          scan_timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).optional(),
          lookback_candles: z.number().int().min(50).max(500).optional(),
          max_collateral_usd: z.number().positive().max(1000).optional(),
          max_balance_pct: z.number().positive().max(100).optional(),
          max_leverage: z.number().positive().max(50).optional(),
          max_slippage_pct: z.number().positive().max(25).optional(),
          max_trades_per_day: z.number().int().min(0).max(24).optional(),
          cooldown_minutes: z.number().int().min(5).max(1440).optional(),
          max_open_positions: z.number().int().min(0).max(20).optional(),
          allow_open: z.boolean().optional(),
          allow_close: z.boolean().optional(),
          allow_tpsl: z.boolean().optional(),
          allow_cancel: z.boolean().optional(),
        }).optional(),
      },
    },
    async (args) => {
      if (session.player.dex !== 'decibel') return toolError('Scheduled Decibel jobs are available only for Decibel accounts.');
      const result = hermesJobs.createJob(playerId, { ...args, status: 'draft' });
      if (!result.ok) return toolError(result.error, result);
      return jsonResult(result);
    }
  );

  server.registerTool(
    'hermes_job_update',
    {
      title: 'Update Hermes Job',
      description: 'Update a scheduled Hermes job. Use for changing interval, mode, symbols, or risk policy.',
      inputSchema: {
        job_id: z.string(),
        status: z.enum(['draft', 'active', 'paused']).optional(),
        name: z.string().optional(),
        instruction: z.string().optional(),
        mode: z.enum(['monitor_only', 'ask_before_trade', 'auto_trade']).optional(),
        symbols: z.array(z.string()).optional(),
        interval_minutes: z.number().int().min(15).max(1440).optional(),
        max_runs_per_day: z.number().int().min(1).max(96).optional(),
        expires_at: z.string().optional(),
        policy: z.record(z.any()).optional(),
      },
    },
    async ({ job_id, ...patch }) => {
      const result = hermesJobs.updateJob(playerId, job_id, patch);
      if (!result.ok) return toolError(result.error, result);
      return jsonResult(result);
    }
  );

  server.registerTool(
    'hermes_job_pause',
    {
      title: 'Pause Hermes Job',
      description: 'Pause a scheduled Hermes job.',
      inputSchema: { job_id: z.string() },
    },
    async ({ job_id }) => {
      const job = hermesJobs.getJob(playerId, job_id);
      if (!job) return toolError('Job not found.');
      const result = hermesJobs.updateJob(playerId, job_id, { ...job, status: 'paused' });
      if (!result.ok) return toolError(result.error, result);
      return jsonResult(result);
    }
  );

  server.registerTool(
    'hermes_job_resume',
    {
      title: 'Resume Hermes Job',
      description: 'Resume an existing scheduled Hermes job.',
      inputSchema: { job_id: z.string() },
    },
    async ({ job_id }) => {
      const job = hermesJobs.getJob(playerId, job_id);
      if (!job) return toolError('Job not found.');
      const result = hermesJobs.updateJob(playerId, job_id, { ...job, status: 'active' });
      if (!result.ok) return toolError(result.error, result);
      return jsonResult(result);
    }
  );

  server.registerTool(
    'hermes_job_delete',
    {
      title: 'Delete Hermes Job',
      description: 'Delete a scheduled Hermes job and its future runs.',
      inputSchema: { job_id: z.string() },
    },
    async ({ job_id }) => {
      const result = hermesJobs.deleteJob(playerId, job_id);
      if (!result.ok) return toolError('Job not found.');
      return jsonResult(result);
    }
  );

  server.registerTool(
    'hermes_job_run_now',
    {
      title: 'Run Hermes Job Now',
      description: 'Queue a scheduled Hermes job to run immediately. The worker will charge one AI message when it executes.',
      inputSchema: { job_id: z.string() },
    },
    async ({ job_id }) => {
      const result = hermesJobs.runNow(playerId, job_id);
      if (!result.ok) return toolError(result.error, result);
      return jsonResult(result);
    }
  );

  server.registerTool(
    'hermes_job_get_runs',
    {
      title: 'Hermes Job Run History',
      description: 'Read recent scheduled Hermes job runs with tools and results.',
      inputSchema: {
        job_id: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ job_id, limit = 20 }) => {
      const result = hermesJobs.listRuns(playerId, job_id, limit);
      if (!result.ok) return toolError(result.error, result);
      return jsonResult(result);
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
    'decibel_market_scan',
    {
      title: 'Decibel Market Scan',
      description: 'Read Decibel candles and return server-calculated RSI, MACD, volume ratio, ATR, stale-data blockers, and mark price. Use this before scheduled or delegated technical-analysis trading decisions.',
      inputSchema: {
        symbols: z.array(z.string()).min(1).max(10),
        interval: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d']).optional(),
        lookback: z.number().int().min(50).max(500).optional(),
      },
    },
    async ({ symbols, interval = '1h', lookback = 160 }) => {
      const account = await requireDecibelSession(session);
      if (!account.ok) return toolError(account.error);
      const requested = (symbols || []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 10);
      const scans = [];
      for (const symbol of requested) {
        try {
          const market = await getDecibelMarket(symbol);
          if (!market.market_addr) throw new Error(`No market address for ${symbol}`);
          const candles = await decibel.fetchCandlesticks({
            market_addr: market.market_addr,
            interval,
            limit: lookback,
            hideOutliers: true,
          });
          scans.push(decibelScanFromCandles({ market, candles, interval }));
        } catch (error) {
          scans.push({
            symbol: String(symbol || '').toUpperCase(),
            error: error?.message || String(error || 'market scan failed'),
            blockers: ['Market scan failed; do not trade this symbol from this scan.'],
          });
        }
      }
      return jsonResult({
        success: true,
        dex: 'decibel',
        interval,
        lookback,
        scans,
        account: {
          owner: account.owner,
          primary_subaccount: account.subaccount,
        },
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
    avantis_skill: `${PUBLIC_URL}/avantis-skills.md`,
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

app.get('/avantis-skills.md', (_req, res) => {
  res.type('text/markdown').send(readAvantisSkill());
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
