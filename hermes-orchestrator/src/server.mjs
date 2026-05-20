import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import clashPrompt from './clash_agent_prompt.cjs';
import clashSettings from './clash_agent_settings.cjs';

const {
  CLASH_PROMPT_VERSION,
  DECIBEL_TRADING_SKILL,
  AVANTIS_TRADING_SKILL,
  toolIncludeForDex,
  playbookForDex,
  composeRuntimeInstructions,
  buildRuntimeInstructions,
} = clashPrompt;

const { resolveModelChain, resolveProviderOrder } = clashSettings;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    if (process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

const CWD = process.cwd();
loadEnvFile(path.join(CWD, '.env'));
loadEnvFile(path.join(CWD, '..', '.env'));
loadEnvFile(path.join(CWD, '..', '..', '.env'));
loadEnvFile(path.join(CWD, 'server', '.env'));
loadEnvFile(path.join(CWD, 'web', '.env'));

const DEFAULT_ROOT = process.platform === 'win32'
  ? path.resolve(CWD, '..', '.clash-hermes-local')
  : '/srv/clash-hermes';
const ROOT = path.resolve(process.env.CLASH_HERMES_ROOT || DEFAULT_ROOT);
const PLAYERS_DIR = path.resolve(process.env.CLASH_HERMES_PLAYERS_DIR || path.join(ROOT, 'players'));
const STATE_DIR = path.resolve(process.env.CLASH_HERMES_STATE_DIR || path.join(ROOT, 'state'));
const STATE_FILE = path.resolve(process.env.CLASH_HERMES_STATE_FILE || path.join(STATE_DIR, 'players.json'));
const LOG_DIR = path.resolve(process.env.CLASH_HERMES_LOG_DIR || path.join(ROOT, 'logs'));
const HOST = process.env.CLASH_HERMES_ORCHESTRATOR_HOST || '127.0.0.1';
const PORT = Number(process.env.CLASH_HERMES_ORCHESTRATOR_PORT || 8600);
const TOKEN = process.env.HERMES_ORCHESTRATOR_TOKEN || process.env.CLASH_HERMES_ORCHESTRATOR_TOKEN || '';
const HERMES_BIN = process.env.HERMES_BIN || 'hermes';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL_CHAIN = resolveModelChain(process.env);
const PRIMARY_MODEL = MODEL_CHAIN[0];
const FALLBACK_MODELS = MODEL_CHAIN.slice(1);
const FALLBACK_MODEL = FALLBACK_MODELS[0] || '';
const PROVIDER_ORDER = resolveProviderOrder(process.env);
const FALLBACK_AFTER_RETRIES = Number(process.env.CLASH_HERMES_FALLBACK_AFTER_RETRIES || 3);
const PRIMARY_MODEL_RETRIES = Number(process.env.CLASH_HERMES_PRIMARY_RETRIES || 3);
const ACTION_PRIMARY_MODEL_RETRIES = Number(process.env.CLASH_HERMES_ACTION_PRIMARY_RETRIES || 1);
const ACTION_FALLBACK_MODEL_RETRIES = Number(process.env.CLASH_HERMES_ACTION_FALLBACK_RETRIES || 1);
const MCP_URL = process.env.CLASH_MCP_URL || 'https://mcp.clashofperps.fun/mcp';
const HERMES_READY_TIMEOUT_MS = Number(process.env.CLASH_HERMES_READY_TIMEOUT_MS || 45_000);
const HERMES_IDLE_SHUTDOWN_MS = Number(process.env.CLASH_HERMES_IDLE_SHUTDOWN_MS || 15 * 60_000);
const HERMES_TOOL_TIMEOUT = Number(process.env.CLASH_HERMES_TOOL_TIMEOUT || 30);
const HERMES_CHAT_TIMEOUT_MS = Number(process.env.CLASH_HERMES_CHAT_TIMEOUT_MS || 20_000);
const HERMES_ACTION_CHAT_TIMEOUT_MS = Number(process.env.CLASH_HERMES_ACTION_CHAT_TIMEOUT_MS || 45_000);
const MODEL_CONTEXT_LENGTH = Number(process.env.CLASH_HERMES_MODEL_CONTEXT_LENGTH || 65_536);
const MAX_INPUT_CHARS = Number(process.env.CLASH_HERMES_MAX_INPUT_CHARS || 8000);
const MAX_INSTRUCTIONS_CHARS = Number(process.env.CLASH_HERMES_MAX_INSTRUCTIONS_CHARS || 24000);
const START_PORT = Number(process.env.CLASH_HERMES_PLAYER_PORT_START || 8700);
const state = { players: {}, nextPort: START_PORT };
const processes = new Map();
const playerLifecycleLocks = new Map();
let saveStateChain = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function publicPlayerState(playerId) {
  const row = state.players[playerId];
  if (!row) return null;
  const proc = processes.get(playerId);
  const running = !!proc && !proc.killed && proc.exitCode == null;
  return {
    player_id: playerId,
    name: row.name || null,
    dex: row.dex || null,
    port: row.port,
    model: row.model || PRIMARY_MODEL,
    fallback_model: FALLBACK_MODEL || null,
    fallback_models: FALLBACK_MODELS,
    model_chain: MODEL_CHAIN,
    provider_order: PROVIDER_ORDER,
    running,
    pid: proc?.pid || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    last_started_at: row.last_started_at || null,
    last_chat_at: row.last_chat_at || null,
    last_error: running ? null : row.last_error || null,
    last_progress: row.last_progress || null,
  };
}

function assertConfigured() {
  if (!TOKEN) throw new Error('HERMES_ORCHESTRATOR_TOKEN is required');
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required');
}

function safePlayerId(playerId) {
  const id = String(playerId || '').trim();
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(id)) {
    const digest = crypto.createHash('sha256').update(id).digest('hex').slice(0, 32);
    if (!digest) throw new Error('player_id required');
    return `p_${digest}`;
  }
  return id;
}

function withPlayerLifecycleLock(playerId, fn) {
  const safeId = safePlayerId(playerId);
  const previous = playerLifecycleLocks.get(safeId) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => fn());
  const entry = current.finally(() => {
    if (playerLifecycleLocks.get(safeId) === entry) {
      playerLifecycleLocks.delete(safeId);
    }
  }).catch(() => {});
  playerLifecycleLocks.set(safeId, entry);
  return current;
}

function clampText(value, max) {
  if (value == null) return '';
  return String(value).slice(0, max);
}

function randomToken(prefix = 'hermes') {
  return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
}

async function ensureDirs() {
  await fsp.mkdir(PLAYERS_DIR, { recursive: true });
  await fsp.mkdir(STATE_DIR, { recursive: true });
  await fsp.mkdir(LOG_DIR, { recursive: true });
}

async function loadState() {
  await ensureDirs();
  try {
    const parsed = JSON.parse(await fsp.readFile(STATE_FILE, 'utf8'));
    state.players = parsed.players && typeof parsed.players === 'object' ? parsed.players : {};
    state.nextPort = Number(parsed.nextPort || START_PORT);
  } catch {
    await saveState();
  }
}

async function writeStateSnapshot(snapshot) {
  await ensureDirs();
  const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, snapshot);
  await fsp.rename(tmp, STATE_FILE);
  await fsp.chmod(STATE_FILE, 0o600).catch(() => {});
}

async function saveState() {
  const snapshot = JSON.stringify(state, null, 2);
  saveStateChain = saveStateChain
    .catch(() => {})
    .then(() => writeStateSnapshot(snapshot));
  return saveStateChain;
}

async function setPlayerProgress(playerId, progress) {
  const safeId = safePlayerId(playerId);
  const row = state.players[safeId];
  if (!row) return;
  row.last_progress = {
    ...progress,
    at: nowIso(),
  };
  row.updated_at = nowIso();
  await saveState().catch(() => {});
}

function playerHome(playerId) {
  return path.join(PLAYERS_DIR, safePlayerId(playerId));
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''));
}

const GLOBAL_GAME_MEMORY = [
  '# Clash of Perps Shared Agent Memory',
  '',
  'This memory is shared by every Clash of Perps AI agent.',
  '',
  'Core identity:',
  '- You are an in-game Clash of Perps agent, not a general-purpose assistant.',
  '- You operate only through Clash MCP tools.',
  '- For real game actions, use tools first and answer after the tool result.',
  '',
  'Common action mapping:',
  '- "attack", "атакуй", "напади", "find enemy" means inspect base, confirm loaded ships, then execute_ai_attack_plan with auto_tactics true.',
  '- "attack <player name>" means pass that exact name as target_player_name to execute_ai_attack_plan. If the target is shielded, naturally say the target is under shield and include the shield remaining hours from the tool result.',
  '- Generic requests like "attack a base", "attack new base", "battle again", or "find an enemy" are NOT named attacks. Omit target_player_name and use normal matchmaking.',
  '- "collect resources", "збери ресурси" means inspect base, then collect_resources.',
  '- "build my base", "set up base", or "arrange everything" means use auto_build_base with balanced focus. Do not ask the player for grids or a building list.',
  '- "build from shop" for one specific building means use get_building_catalog, find_build_slots, then place_building.',
  '- "upgrade X" means inspect owned ids, then upgrade_building or upgrade_troop.',
  '',
  'Battle rules:',
  '- Keep landing slots coherent. Use nearby slots for small fleets and a connected front for larger fleets.',
  '- Cannon shots target defensive towers first: turret and archer_tower. Do not waste cannon shots on Town Hall.',
  '- Rally marker is optional. Use it only if it helps focus troops on a nearby useful objective.',
  '- Named/targeted attacks cost 2x the normal gold attack cost for the attacker Town Hall level.',
  '- Never pass generic words such as base, enemy, player, again, new, random, or another as target_player_name.',
  '- For blockers/errors, answer naturally in the player language when possible and keep the exact blocker facts.',
  '- Respect the one MCP battle per minute cooldown. Do not spam retries during cooldown.',
  '',
  'Construction rules:',
  '- Town Hall is mandatory and must be placed first on a new base. If it is missing, build town_hall before anything else.',
  '- grid_index 0 is the main island for normal buildings.',
  '- grid_index 1 is only for ports.',
  '- grid_index 2 is attack/deployment space and is never used for base construction.',
  '- Use barn, not barracks.',
  '',
  'Decibel trading rules:',
  '- Decibel trading is part of the Clash agent only for players whose account DEX is decibel.',
  '- Use only Clash MCP Decibel tools for trading; never bypass builder-aware routing.',
  '- Read-only trading requests should call Decibel read tools immediately.',
  '- Write trading requests need clear symbol, side, and size/notional/collateral.',
  '',
  'Avantis trading rules:',
  '- Avantis trading is part of the Clash agent only for players whose account DEX is avantis.',
  '- Use Clash MCP Avantis tools. Self-custody reads use the player wallet; MCP writes only prepare browser_action payloads for the browser wallet to sign.',
  '- Do not claim an Avantis write is done from MCP alone. Say prepared / wallet confirmation opened; the frontend reports the actual tx after the browser signs.',
  '',
].join('\n');

function initialPlayerMemory(row) {
  return [
    '# Player Agent Memory',
    '',
    `Player: ${row.name || row.safe_id}`,
    `Player id: ${row.safe_id}`,
    `Current DEX: ${row.dex || 'unknown'}`,
    '',
    'Preferences:',
    '- Use concise player-facing replies in the same language as the user, including blockers/errors when possible.',
    '- Prefer useful autonomous decisions when the request is clear.',
    '- Keep battle, build, upgrade, and resource actions grounded in fresh MCP tool state.',
    '',
  ].join('\n');
}

function writePlayerConfig(playerId, row) {
  const include = toolIncludeForDex(row?.dex).map((tool) => `        - ${tool}`).join('\n');
  const providerOrderLines = PROVIDER_ORDER.length
    ? [
        '  order:',
        ...PROVIDER_ORDER.map((provider) => `    - ${provider}`),
      ]
    : [];
  return [
    '# Managed by clash-hermes-orchestrator. Do not edit by hand.',
    'provider: openrouter',
    'provider_routing:',
    '  sort: throughput',
    ...providerOrderLines,
    'model:',
    `  default: ${yamlString(row.model || PRIMARY_MODEL)}`,
    `  context_length: ${MODEL_CONTEXT_LENGTH}`,
    '  max_tokens: 500',
    ...(FALLBACK_MODEL ? [
      'fallback_model:',
      '  provider: openrouter',
      `  model: ${yamlString(FALLBACK_MODEL)}`,
      '  timeout: 30',
    ] : []),
    'auxiliary:',
    '  mcp:',
    '    provider: main',
    '    timeout: 15',
    '  session_search:',
    '    provider: main',
    '    timeout: 10',
    '    max_concurrency: 1',
    '  skills_hub:',
    '    provider: main',
    '    timeout: 10',
    '  flush_memories:',
    '    provider: main',
    '    timeout: 10',
    '  compression:',
    `    context_length: ${MODEL_CONTEXT_LENGTH}`,
    '# Hermes v0.14 still honors top-level toolsets for profiles. The',
    '# platform_toolsets block below covers API/gateway entrypoints too.',
    'toolsets:',
    '  - mcp-clash',
    'platform_toolsets:',
    '  api_server:',
    '    - mcp-clash',
    '  gateway:',
    '    - mcp-clash',
    '  cli:',
    '    - mcp-clash',
    'skills:',
    '  creation_nudge_interval: 0',
    '  external_dirs:',
    `    - ${yamlString(path.join(playerHome(playerId), 'skills'))}`,
    'agent:',
    '  max_turns: 10',
    '  gateway_timeout: 90',
    '  restart_drain_timeout: 30',
    '  api_max_retries: 1',
    '  reasoning_effort: minimal',
    '  tool_use_enforcement: true',
    '  disabled_toolsets:',
    '    - terminal',
    '    - file',
    '    - browser',
    '    - web',
    '    - code_execution',
    '    - cronjob',
    '    - skills',
    '    - skills_hub',
    '    - memory',
    '    - session_search',
    '    - todo',
    '    - moa',
    'display:',
    '  background_process_notifications: result',
    'security:',
    '  redact_secrets: true',
    'mcp_servers:',
    '  clash:',
    `    url: ${yamlString(MCP_URL)}`,
    '    headers:',
    `      Authorization: ${yamlString(`Bearer ${row.mcp_key}`)}`,
    `    timeout: ${HERMES_TOOL_TIMEOUT}`,
    '    tools:',
    '      include:',
    include,
    '      resources: false',
    '      prompts: false',
    '',
  ].join('\n');
}

function writePlayerEnv(row) {
  return [
    '# Managed by clash-hermes-orchestrator. Do not edit by hand.',
    `OPENROUTER_API_KEY=${OPENROUTER_API_KEY}`,
    'API_SERVER_ENABLED=true',
    'API_SERVER_HOST=127.0.0.1',
    `API_SERVER_PORT=${row.port}`,
    `API_SERVER_KEY=${row.api_key}`,
    `API_SERVER_MODEL_NAME=clash-player-${row.safe_id}`,
    'API_SERVER_CORS_ORIGINS=',
    '',
  ].join('\n');
}

async function writePlayerFiles(playerId, row) {
  const home = playerHome(playerId);
  await fsp.mkdir(home, { recursive: true });
  const versionFile = path.join(home, '.clash_prompt_version');
  let previousPromptVersion = '';
  try { previousPromptVersion = (await fsp.readFile(versionFile, 'utf8')).trim(); } catch {}
  if (previousPromptVersion !== CLASH_PROMPT_VERSION) {
    await fsp.rm(path.join(home, 'sessions'), { recursive: true, force: true });
  }
  await fsp.writeFile(path.join(home, 'config.yaml'), writePlayerConfig(playerId, row), { mode: 0o600 });
  await fsp.writeFile(path.join(home, '.env'), writePlayerEnv(row), { mode: 0o600 });
  const combinedPlaybook = composeRuntimeInstructions(row.dex);
  await fsp.writeFile(path.join(home, 'SOUL.md'), combinedPlaybook, { mode: 0o600 });
  await fsp.writeFile(path.join(home, 'HERMES.md'), combinedPlaybook, { mode: 0o600 });
  await fsp.mkdir(path.join(home, 'skills', 'clash-of-perps-ai-agent'), { recursive: true });
  await fsp.writeFile(path.join(home, 'skills', 'clash-of-perps-ai-agent', 'SKILL.md'), playbookForDex(row.dex), { mode: 0o600 });
  await fsp.rm(path.join(home, 'skills', 'clash-decibel-trading'), { recursive: true, force: true });
  await fsp.rm(path.join(home, 'skills', 'clash-avantis-trading'), { recursive: true, force: true });
  if (row.dex === 'avantis') {
    await fsp.mkdir(path.join(home, 'skills', 'clash-avantis-trading'), { recursive: true });
    await fsp.writeFile(path.join(home, 'skills', 'clash-avantis-trading', 'SKILL.md'), AVANTIS_TRADING_SKILL, { mode: 0o600 });
  } else if (row.dex === 'decibel') {
    await fsp.mkdir(path.join(home, 'skills', 'clash-decibel-trading'), { recursive: true });
    await fsp.writeFile(path.join(home, 'skills', 'clash-decibel-trading', 'SKILL.md'), DECIBEL_TRADING_SKILL, { mode: 0o600 });
  } else {
    await fsp.mkdir(path.join(home, 'skills', 'clash-decibel-trading'), { recursive: true });
    await fsp.writeFile(path.join(home, 'skills', 'clash-decibel-trading', 'SKILL.md'), DECIBEL_TRADING_SKILL, { mode: 0o600 });
    await fsp.mkdir(path.join(home, 'skills', 'clash-avantis-trading'), { recursive: true });
    await fsp.writeFile(path.join(home, 'skills', 'clash-avantis-trading', 'SKILL.md'), AVANTIS_TRADING_SKILL, { mode: 0o600 });
  }
  await fsp.writeFile(versionFile, CLASH_PROMPT_VERSION, { mode: 0o600 });
  await fsp.mkdir(path.join(home, 'sessions'), { recursive: true });
  await fsp.mkdir(path.join(home, 'memory'), { recursive: true });
  await fsp.writeFile(path.join(home, 'memory', 'global.md'), GLOBAL_GAME_MEMORY, { mode: 0o600 });
  const playerMemoryPath = path.join(home, 'memory', 'player.md');
  try {
    await fsp.access(playerMemoryPath);
  } catch {
    await fsp.writeFile(playerMemoryPath, initialPlayerMemory(row), { mode: 0o600 });
  }
  const recentMemoryPath = path.join(home, 'memory', 'recent.md');
  try {
    await fsp.access(recentMemoryPath);
  } catch {
    await fsp.writeFile(recentMemoryPath, '# Recent Player Conversation\n\n', { mode: 0o600 });
  }
}

async function allocatePort() {
  const used = new Set(Object.values(state.players).map((row) => Number(row.port)));
  let port = Math.max(START_PORT, Number(state.nextPort || START_PORT));
  while (used.has(port)) port += 1;
  state.nextPort = port + 1;
  return port;
}

async function provisionPlayer(playerId, body) {
  assertConfigured();
  const safeId = safePlayerId(playerId);
  const mcpKey = clampText(body?.mcp_key, 512);
  if (!mcpKey.startsWith('cop_ai_')) throw new Error('valid mcp_key is required');
  const existing = state.players[safeId] || {};
  const requestedDex = String(body?.dex || body?.player?.dex || existing.dex || '').trim().toLowerCase();
  const row = {
    ...existing,
    safe_id: safeId,
    name: clampText(body?.name || existing.name || safeId, 80),
    dex: requestedDex || null,
    mcp_key: mcpKey,
    api_key: existing.api_key || randomToken('hapi'),
    port: existing.port || await allocatePort(),
    model: clampText(body?.model || existing.model || PRIMARY_MODEL, 120),
    created_at: existing.created_at || nowIso(),
    updated_at: nowIso(),
    last_error: null,
    last_progress: existing.last_progress || null,
  };
  state.players[safeId] = row;
  await writePlayerFiles(safeId, row);
  await saveState();
  await ensurePlayerRunning(safeId);
  return publicPlayerState(safeId);
}

function playerBaseUrl(row) {
  return `http://127.0.0.1:${row.port}`;
}

function formatHermesStartError(err) {
  const code = err?.code ? ` (${err.code})` : '';
  if (err?.code === 'ENOENT') {
    return `Hermes runtime was not found: ${HERMES_BIN}. Install Hermes locally or set HERMES_BIN to the Hermes executable.`;
  }
  return `Hermes failed to start${code}: ${err?.message || 'unknown error'}`;
}

async function fetchJson(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    if (!res.ok) {
      const err = new Error(json?.error || json?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHermes(row) {
  const deadline = Date.now() + HERMES_READY_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await fetchJson(`${playerBaseUrl(row)}/v1/models`, {
        headers: { Authorization: `Bearer ${row.api_key}` },
      }, 5000);
      return true;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Hermes API did not become ready: ${lastError?.message || 'timeout'}`);
}

async function ensurePlayerRunning(playerId) {
  const safeId = safePlayerId(playerId);
  const row = state.players[safeId];
  if (!row) throw new Error('player is not provisioned');
  const current = processes.get(safeId);
  if (current && !current.killed && current.exitCode == null) return current;

  const home = playerHome(safeId);
  await writePlayerFiles(safeId, row);
  const out = fs.openSync(path.join(LOG_DIR, `${safeId}.out.log`), 'a');
  const err = fs.openSync(path.join(LOG_DIR, `${safeId}.err.log`), 'a');
  const child = spawn(HERMES_BIN, ['gateway', 'run', '--replace', '--accept-hooks'], {
    cwd: home,
    env: {
      ...process.env,
      HERMES_HOME: home,
      OPENROUTER_API_KEY,
      API_SERVER_ENABLED: 'true',
      API_SERVER_HOST: '127.0.0.1',
      API_SERVER_PORT: String(row.port),
      API_SERVER_KEY: row.api_key,
      API_SERVER_MODEL_NAME: `clash-player-${safeId}`,
    },
    stdio: ['ignore', out, err],
  });
  let startupDone = false;
  const startupFailure = new Promise((_, reject) => {
    const fail = async (message) => {
      if (startupDone) return;
      startupDone = true;
      const isActiveChild = processes.get(safeId) === child;
      if (isActiveChild) processes.delete(safeId);
      const latest = state.players[safeId];
      if (latest && isActiveChild) {
        latest.last_error = message;
        latest.updated_at = nowIso();
        await saveState().catch(() => {});
      }
      reject(new Error(message));
    };
    child.once('error', (spawnErr) => {
      fail(formatHermesStartError(spawnErr));
    });
    child.once('exit', (code, signal) => {
      if (startupDone || code === 0) return;
      fail(`Hermes exited before becoming ready: code=${code} signal=${signal || ''}`.trim());
    });
  });
  processes.set(safeId, child);
  row.last_started_at = nowIso();
  row.last_error = null;
  await saveState();
  child.on('exit', async (code, signal) => {
    const active = processes.get(safeId);
    if (active === child) processes.delete(safeId);
    if (active !== child) return;
    const latest = state.players[safeId];
    if (latest) {
      latest.last_error = code === 0 ? null : `Hermes exited code=${code} signal=${signal || ''}`.trim();
      latest.updated_at = nowIso();
      await saveState().catch(() => {});
    }
  });
  await Promise.race([
    waitForHermes(row).then(async (ready) => {
      startupDone = true;
      row.last_error = null;
      row.last_progress = {
        phase: 'ready',
        message: 'Hermes API is ready',
        at: nowIso(),
      };
      row.updated_at = nowIso();
      await saveState().catch(() => {});
      return ready;
    }),
    startupFailure,
  ]);
  return child;
}

function stopPlayer(playerId) {
  const safeId = safePlayerId(playerId);
  const child = processes.get(safeId);
  if (!child) return false;
  processes.delete(safeId);
  if (child.exitCode == null) child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode == null) child.kill('SIGKILL');
  }, 5000).unref?.();
  return true;
}

async function stopPlayerAndWait(playerId, timeoutMs = 7000) {
  const safeId = safePlayerId(playerId);
  const child = processes.get(safeId);
  if (!child) return false;
  processes.delete(safeId);
  if (child.exitCode != null) return true;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    child.once('exit', finish);
    const timer = setTimeout(() => {
      if (child.exitCode == null) child.kill('SIGKILL');
      setTimeout(finish, 500).unref?.();
    }, timeoutMs);
    timer.unref?.();
  });
  return true;
}

async function restartWithModel(playerId, model) {
  const safeId = safePlayerId(playerId);
  const row = state.players[safeId];
  if (!row) throw new Error('player is not provisioned');
  await stopPlayerAndWait(safeId);
  row.model = model;
  row.updated_at = nowIso();
  await writePlayerFiles(safeId, row);
  await saveState();
  await ensurePlayerRunning(safeId);
}

async function ensureModelRunning(playerId, model) {
  const safeId = safePlayerId(playerId);
  const row = state.players[safeId];
  if (!row) throw new Error('player is not provisioned');
  if (row.model !== model) {
    await restartWithModel(safeId, model);
    return state.players[safeId];
  }
  await ensurePlayerRunning(safeId);
  return state.players[safeId];
}

function extractOutputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  if (typeof response?.choices?.[0]?.message?.content === 'string') return response.choices[0].message.content;
  const chunks = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function trimForMemory(value, max = 800) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const TRANSIENT_AGENT_FAILURE_PATTERNS = [
  /AI message limit reached/i,
  /Open the AI shop/i,
  /Hermes exited before becoming ready/i,
  /Hermes orchestrator fetch failed/i,
  /\bECONNREFUSED\b/i,
  /\bGateway Timeout\b/i,
  /\b504\b/i,
  /AI request is still running/i,
  /AI result is still pending/i,
  /All routes failed/i,
  /route did not start cleanly/i,
  /Order executed at/i,
  /execution price/i,
  /Opened a .* leverage .* on/i,
  /Closed .* position/i,
  /reduced position/i,
  /final PnL settlement/i,
  /BTC long position/i,
  /You have no open positions/i,
  /Decibel positions/i,
  /open orders/i,
  /account is clean/i,
  /ready for new trades/i,
  /active orders on Decibel/i,
  /^\s*(?:Done|Result|Next):\s/i,
  /\|\s*Agent:\s*(?:Done|Result|Next):\s/i,
];

function isTransientAgentFailureText(value) {
  const text = String(value || '').trim();
  return !!text && TRANSIENT_AGENT_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

function filterRecentMemoryText(value) {
  const text = String(value || '');
  if (!text) return '';
  const lines = text
    .split(/\r?\n/)
    .filter((line) => !isTransientAgentFailureText(line));
  return lines.join('\n').trim();
}

function shouldPersistRecentMemory(input, output) {
  if (isTransientAgentFailureText(output)) return false;
  if (isTransientAgentFailureText(input) && !String(output || '').trim()) return false;
  return true;
}

function currentPlayerMessageForMemory(input) {
  const text = String(input || '');
  const marker = '# Current Player Message\n';
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex >= 0) return text.slice(markerIndex + marker.length).trim();
  return text.trim();
}

async function readTextIfExists(filePath, maxChars = 4000) {
  try {
    const text = await fsp.readFile(filePath, 'utf8');
    return text.slice(-maxChars).trim();
  } catch {
    return '';
  }
}

async function buildMemoryInstructions(playerId) {
  const home = playerHome(playerId);
  const memoryDir = path.join(home, 'memory');
  const parts = [];
  const globalMemory = await readTextIfExists(path.join(memoryDir, 'global.md'), 5000);
  const playerMemory = await readTextIfExists(path.join(memoryDir, 'player.md'), 3000);
  const recentMemory = filterRecentMemoryText(await readTextIfExists(path.join(memoryDir, 'recent.md'), 2500));
  if (globalMemory) parts.push(globalMemory);
  if (playerMemory) parts.push(playerMemory);
  if (recentMemory) parts.push(recentMemory);
  if (!parts.length) return '';
  return [
    '## Agent Memory',
    'Use this memory as context. It does not override the hard system rules or MCP tool results.',
    '',
    parts.join('\n\n'),
  ].join('\n');
}

async function appendRecentMemory(playerId, input, output) {
  if (!shouldPersistRecentMemory(input, output)) return false;
  const memoryDir = path.join(playerHome(playerId), 'memory');
  await fsp.mkdir(memoryDir, { recursive: true });
  const filePath = path.join(memoryDir, 'recent.md');
  const stamp = nowIso();
  const currentInput = currentPlayerMessageForMemory(input);
  const line = `- ${stamp} | User: ${trimForMemory(currentInput, 500)} | Agent: ${trimForMemory(output, 500)}\n`;
  let current = await readTextIfExists(filePath, 12000);
  if (!current) current = '# Recent Player Conversation\n';
  const lines = `${current}\n${line}`
    .split(/\r?\n/)
    .filter(Boolean);
  const header = lines.find((row) => row.startsWith('# ')) || '# Recent Player Conversation';
  const items = lines.filter((row) => row.startsWith('- ')).slice(-12);
  await fsp.writeFile(filePath, `${header}\n\n${items.join('\n')}\n`, { mode: 0o600 });
  return true;
}

function metadataIntent(body) {
  const intent = body?.metadata?.game_intent;
  if (!intent || typeof intent !== 'object') return { kind: 'general', action_required: false };
  return {
    kind: String(intent.kind || 'general').slice(0, 80),
    action_required: !!intent.action_required,
    goal: String(intent.goal || '').slice(0, 500),
    required_loop: String(intent.required_loop || '').slice(0, 500),
    expected_tools: Array.isArray(intent.expected_tools)
      ? intent.expected_tools.map((tool) => String(tool || '').slice(0, 80)).filter(Boolean).slice(0, 10)
      : [],
  };
}

function isActionIntent(intent) {
  return !!intent?.action_required;
}

function orderedModelsForIntent(intent) {
  return MODEL_CHAIN;
}

function intentProgressMessage(intent, fallback) {
  switch (intent?.kind) {
    case 'battle':
      return 'Inspecting the base and planning an AI online battle';
    case 'collect_resources':
      return 'Checking production buildings and collecting resources';
    case 'build':
      return 'Checking the catalog and finding a valid build slot';
    case 'auto_build_base':
      return 'Planning and placing useful base buildings';
    case 'upgrade':
      return 'Checking upgrade targets and resource costs';
    case 'fleet':
      return 'Checking ships, troops, and reinforcements';
    case 'decibel_account':
      return 'Reading your Decibel account and positions';
    case 'decibel_markets':
      return 'Reading Decibel markets and prices';
    case 'decibel_place_order':
      return 'Checking Decibel account state and preparing the order route';
    case 'decibel_close_position':
      return 'Checking Decibel positions before closing';
    case 'decibel_cancel_order':
      return 'Checking Decibel open orders before cancelling';
    case 'decibel_tpsl':
      return 'Checking Decibel positions before updating TP/SL';
    case 'decibel_leverage':
      return 'Checking Decibel market settings before leverage update';
    case 'avantis_account':
      return 'Reading your Avantis browser wallet';
    case 'avantis_markets':
      return 'Reading Avantis markets and prices';
    case 'avantis_place_order':
      return 'Preparing an Avantis browser-wallet order';
    case 'avantis_close_position':
      return 'Preparing an Avantis browser-wallet close';
    case 'avantis_cancel_order':
      return 'Preparing an Avantis browser-wallet cancel';
    case 'avantis_tpsl':
      return 'Preparing an Avantis browser-wallet TP/SL update';
    case 'avantis_leverage':
      return 'Checking Avantis positions and leverage rules';
    case 'gameplay':
      return 'Reading the game state and choosing the right game action';
    default:
      return fallback;
  }
}

function hermesTextFailure(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (/free-models-per-day|add\s+10\s+credits|daily\s+quota|negative\s+credit/i.test(raw)) {
    return { message: raw.slice(0, 300), no_retry: true };
  }
  if (/api call failed/i.test(raw) && /http\s*(429|5\d\d)|provider returned error|rate.?limit/i.test(raw)) {
    return { message: raw.slice(0, 300), no_retry: false };
  }
  if (/http\s*429/i.test(raw) || /rate.?limit/i.test(raw)) {
    return { message: raw.slice(0, 300), no_retry: false };
  }
  if (/\bmcp_clash_|execute_ai_attack_plan|get_base_state|collect_resources|place_building|upgrade_building/i.test(raw)) {
    return { message: 'Model leaked internal MCP tool names instead of a player-facing answer', no_retry: true };
  }
  if (/[\u0600-\u06FF\u0530-\u058F\u0590-\u05FF]/.test(raw)) {
    return { message: 'Model produced mixed-script garbled text', no_retry: true };
  }
  return null;
}

function assertUsableHermesResponse(response) {
  const outputText = extractOutputText(response);
  const failure = hermesTextFailure(outputText);
  if (failure) {
    const err = new Error(failure.message || String(failure));
    err.provider_failure = true;
    err.no_retry = !!failure.no_retry;
    throw err;
  }
  return outputText;
}

function previewForLog(value, max = 700) {
  return String(value ?? '')
    .replace(/cop_ai_[A-Za-z0-9_-]+/g, 'cop_ai_***')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, 'sk-or-v1-***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function logHermesAudit(event, payload = {}) {
  try {
    console.log(JSON.stringify({
      event,
      at: nowIso(),
      ...payload,
    }));
  } catch {
    console.log(`[hermes] ${event}`);
  }
}

function createHermesTimingRecorder({ traceId, playerId, intent }) {
  const startedAt = Date.now();
  let lastAt = startedAt;
  const events = [];
  return {
    events,
    mark(stage, payload = {}) {
      const now = Date.now();
      const event = {
        stage,
        at: nowIso(),
        elapsed_ms: Math.max(0, now - startedAt),
        step_ms: Math.max(0, now - lastAt),
        trace_id: traceId,
        player_id: playerId,
        intent: intent?.kind || 'general',
        status: payload.status || 'ok',
        ...payload,
      };
      lastAt = now;
      events.push(event);
      logHermesAudit('hermes_chat_stage', event);
      return event;
    },
  };
}

async function callHermesResponses(row, payload, timeoutMs = HERMES_CHAT_TIMEOUT_MS) {
  return fetchJson(`${playerBaseUrl(row)}/v1/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${row.api_key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': payload.idempotency_key || crypto.randomUUID(),
    },
    body: JSON.stringify({
      model: 'hermes-agent',
      input: payload.input,
      instructions: payload.instructions,
      previous_response_id: payload.previous_response_id || undefined,
      store: payload.store !== false,
      metadata: payload.metadata || undefined,
    }),
  }, timeoutMs);
}

async function chatWithPlayer(playerId, body) {
  const safeId = safePlayerId(playerId);
  const row = state.players[safeId];
  if (!row) throw new Error('player is not provisioned');
  const input = clampText(body?.input || body?.message, MAX_INPUT_CHARS).trim();
  if (!input) throw new Error('message required');
  const traceId = body?.metadata?.trace_id || body?.trace_id || body?.idempotency_key || crypto.randomUUID();
  const overallStartedAt = Date.now();
  const requestInstructions = clampText(body?.instructions || '', MAX_INSTRUCTIONS_CHARS);
  const intent = metadataIntent(body);
  const timing = createHermesTimingRecorder({ traceId, playerId: safeId, intent });
  timing.mark('request_received', {
    message: 'Hermes orchestrator received chat request',
    action_request: isActionIntent(intent),
    input_chars: input.length,
    input_preview: previewForLog(input, 700),
  });
  timing.mark('instructions_build_start', { message: 'Building runtime instructions and loading memory' });
  const baseInstructions = buildRuntimeInstructions(requestInstructions, row.dex);
  const memoryInstructions = await buildMemoryInstructions(safeId);
  const actionInstructions = isActionIntent(intent)
    ? [
        '## Active Game Action Contract',
        `Intent: ${intent.kind}.`,
        intent.goal ? `Goal: ${intent.goal}` : '',
        intent.required_loop ? `Required loop: ${intent.required_loop}` : '',
        Array.isArray(intent.expected_tools) && intent.expected_tools.length
          ? `Expected tools: ${intent.expected_tools.join(' -> ')}.`
          : '',
        'You must use Clash MCP tools before the final answer unless a fresh tool result already proves the action is impossible.',
        'When Expected tools contains multiple tools, the last write/action tool is mandatory before any success answer. Do not stop after a read/status tool such as get_base_state, decibel_get_positions, or avantis_get_positions.',
        'For Decibel or Avantis open/close trading requests with clear fields, use the expected trading tool directly. Do not run separate account, market, or leverage preflight tools unless a required field is missing.',
        'For Avantis write tools, a successful MCP call means the browser_action was prepared, not that the on-chain transaction was submitted. Say the wallet confirmation is being opened; never say opened/closed/cancelled/updated until a browser tx result exists.',
        'After the required tool returns a clear success or blocker, stop using tools and answer immediately in 1-3 short player-facing sentences.',
        'If the action is blocked or fails, answer naturally in the player language when possible and include the exact blocker.',
        'Never repeat an old quota, network, timeout, or runtime error from memory or chat context unless the current request produced that same fresh blocker.',
        'Do not do extra catalog/state checks after auto_build_base, collect_resources, or execute_ai_attack_plan returns.',
        'Do not respond with a generic capability list for this request.',
      ].filter(Boolean).join('\n')
    : '';
  const instructions = [
    baseInstructions,
    memoryInstructions,
    actionInstructions,
  ].filter(Boolean).join('\n\n');
  timing.mark('instructions_build_done', {
    message: 'Runtime instructions ready',
    instruction_chars: instructions.length,
    has_memory: !!memoryInstructions,
  });
  const payload = {
    input,
    instructions,
    previous_response_id: body?.previous_response_id || null,
    metadata: body?.metadata || {},
    idempotency_key: body?.idempotency_key || crypto.randomUUID(),
    store: body?.store !== false,
  };
  timing.mark('payload_ready', {
    message: 'Hermes response payload ready',
    idempotency_key: payload.idempotency_key,
    previous_response: !!payload.previous_response_id,
  });

  const attemptRecords = [];
  let lastError = null;
  const attemptedModels = [];
  const actionRequest = isActionIntent(intent);
  const requestModelChain = orderedModelsForIntent(intent);
  const primaryAttempts = Math.max(1, actionRequest ? ACTION_PRIMARY_MODEL_RETRIES : PRIMARY_MODEL_RETRIES);
  const fallbackAttempts = Math.max(1, actionRequest ? ACTION_FALLBACK_MODEL_RETRIES : FALLBACK_AFTER_RETRIES);
  const requestTimeoutMs = actionRequest ? HERMES_ACTION_CHAT_TIMEOUT_MS : HERMES_CHAT_TIMEOUT_MS;
  logHermesAudit('hermes_chat_started', {
    trace_id: traceId,
    player_id: safeId,
    intent: intent.kind,
    action_request: actionRequest,
    input_chars: input.length,
    input_preview: previewForLog(input, 900),
    model_chain: requestModelChain,
    primary_attempts: primaryAttempts,
    fallback_attempts: fallbackAttempts,
    timeout_ms: requestTimeoutMs,
  });
  await setPlayerProgress(safeId, {
    phase: 'preparing',
    message: actionRequest ? intentProgressMessage(intent, 'Preparing the game agent') : 'Preparing the game agent',
    attempt: 0,
    model_index: 0,
    total_models: requestModelChain.length,
    intent: intent.kind,
  });

  for (let modelIndex = 0; modelIndex < requestModelChain.length; modelIndex += 1) {
    const model = requestModelChain[modelIndex];
    attemptedModels.push(model);
    let activeRow = null;
    let ensureMs = 0;
    try {
      const ensureStartedAt = Date.now();
      timing.mark('model_start_begin', {
        message: modelIndex === 0 ? 'Starting primary Hermes model route' : 'Starting fallback Hermes model route',
        model,
        model_index: modelIndex,
      });
      await setPlayerProgress(safeId, {
        phase: modelIndex === 0 ? 'starting_model' : 'fallback_model',
        message: modelIndex === 0 ? 'Starting the primary agent route' : 'Switching to a backup route',
        attempt: 0,
        model_index: modelIndex,
        total_models: requestModelChain.length,
        intent: intent.kind,
      });
      activeRow = await withPlayerLifecycleLock(safeId, () => ensureModelRunning(safeId, model));
      ensureMs = Date.now() - ensureStartedAt;
      timing.mark('model_start_done', {
        message: 'Hermes model route is running',
        model,
        model_index: modelIndex,
        ensure_ms: ensureMs,
        port: activeRow.port,
      });
    } catch (err) {
      lastError = err;
      timing.mark('model_start_failed', {
        status: 'error',
        message: 'Hermes model route failed to start',
        model,
        model_index: modelIndex,
        error: err.message,
      });
      const latest = state.players[safeId];
      if (latest) {
        latest.last_error = `[${model}] ${err.message}`;
        await saveState();
      }
      await setPlayerProgress(safeId, {
        phase: 'model_start_failed',
        message: 'That route did not start cleanly, trying another one',
        attempt: 0,
        model_index: modelIndex,
        total_models: requestModelChain.length,
        intent: intent.kind,
      });
      continue;
    }
    const attemptsForModel = modelIndex === 0 ? primaryAttempts : fallbackAttempts;
    for (let attempt = 1; attempt <= attemptsForModel; attempt += 1) {
      const attemptStartedAt = Date.now();
      try {
        timing.mark('model_attempt_begin', {
          message: 'Starting model response attempt',
          model,
          attempt,
          max_attempts: attemptsForModel,
          model_index: modelIndex,
          timeout_ms: requestTimeoutMs,
        });
        await setPlayerProgress(safeId, {
          phase: modelIndex === 0 ? 'thinking' : 'fallback_thinking',
          message: modelIndex === 0
            ? intentProgressMessage(intent, 'Reading the game state and planning')
            : intentProgressMessage(intent, 'A backup route is planning the answer'),
          attempt,
          max_attempts: attemptsForModel,
          model_index: modelIndex,
          total_models: requestModelChain.length,
          intent: intent.kind,
        });
        timing.mark('model_call_start', {
          message: 'Calling Hermes Responses API',
          model,
          attempt,
          model_index: modelIndex,
          timeout_ms: requestTimeoutMs,
        });
        const response = await callHermesResponses(activeRow, payload, requestTimeoutMs);
        const callMs = Date.now() - attemptStartedAt;
        timing.mark('model_call_done', {
          message: 'Hermes Responses API returned',
          model,
          attempt,
          model_index: modelIndex,
          call_ms: callMs,
          response_id: response?.id || null,
        });
        await setPlayerProgress(safeId, {
          phase: 'checking_answer',
          message: 'Checking the answer before sending it',
          attempt,
          max_attempts: attemptsForModel,
          model_index: modelIndex,
          total_models: requestModelChain.length,
          intent: intent.kind,
        });
        timing.mark('answer_check_start', {
          message: 'Validating model output before sending',
          model,
          attempt,
          model_index: modelIndex,
        });
        const outputText = assertUsableHermesResponse(response);
        timing.mark('answer_check_done', {
          message: 'Model output accepted',
          model,
          attempt,
          model_index: modelIndex,
          output_chars: outputText.length,
          output_preview: previewForLog(outputText, 700),
        });
        const totalMs = Date.now() - overallStartedAt;
        attemptRecords.push({
          model,
          attempt,
          model_index: modelIndex,
          status: 'ok',
          ensure_ms: ensureMs,
          call_ms: callMs,
          total_ms: totalMs,
        });
        console.log(JSON.stringify({
          event: 'hermes_chat_attempt_ok',
          trace_id: traceId,
          player_id: safeId,
          model,
          attempt,
          model_index: modelIndex,
          ensure_ms: ensureMs,
          call_ms: callMs,
          total_ms: totalMs,
          intent: intent.kind,
          output_preview: previewForLog(outputText, 900),
        }));
        timing.mark('memory_update_start', {
          message: 'Appending recent conversation memory and saving state',
          model,
          attempt,
        });
        activeRow.last_chat_at = nowIso();
        activeRow.last_error = null;
        activeRow.last_progress = {
          phase: 'completed',
          message: 'Answer ready',
          at: nowIso(),
          attempt,
          max_attempts: attemptsForModel,
          model_index: modelIndex,
          total_models: requestModelChain.length,
          intent: intent.kind,
        };
        await appendRecentMemory(safeId, input, outputText).catch(() => {});
        await saveState();
        timing.mark('memory_update_done', {
          message: 'Conversation memory and player state saved',
          model,
          attempt,
        });
        logHermesAudit('hermes_chat_completed', {
          trace_id: traceId,
          player_id: safeId,
          intent: intent.kind,
          duration_ms: totalMs,
          model: activeRow.model || model,
          fallback: modelIndex > 0,
          attempted_models: attemptedModels,
          attempts: attemptRecords,
          output_chars: outputText.length,
          output_preview: previewForLog(outputText, 1200),
          timing_events: timing.events,
        });
        timing.mark('response_ready', {
          message: 'Returning final response to game server',
          model: activeRow.model || model,
          attempt,
          total_ms: totalMs,
        });
        return {
          ok: true,
          model: activeRow.model || model,
          fallback: modelIndex > 0,
          fallback_index: modelIndex,
          attempted_models: attemptedModels,
          attempts: attemptRecords,
          timings: {
            total_ms: totalMs,
            model_ensure_ms: ensureMs,
            model_call_ms: callMs,
          },
          timing_events: timing.events,
          output_text: outputText,
          response,
        };
      } catch (err) {
        lastError = err;
        const failedMs = Date.now() - attemptStartedAt;
        timing.mark('model_attempt_failed', {
          status: 'error',
          message: err.no_retry ? 'Model route rejected output' : 'Model route failed or timed out',
          model,
          attempt,
          model_index: modelIndex,
          error: err.message,
          no_retry: !!err.no_retry,
          failed_ms: failedMs,
        });
        attemptRecords.push({
          model,
          attempt,
          model_index: modelIndex,
          status: 'error',
          ensure_ms: ensureMs,
          call_ms: failedMs,
          total_ms: Date.now() - overallStartedAt,
          error: err.message,
          no_retry: !!err.no_retry,
        });
        activeRow.last_error = `[${model}] ${err.message}`;
        await saveState();
        await setPlayerProgress(safeId, {
          phase: err.no_retry ? 'route_rejected' : 'route_timeout',
          message: err.no_retry ? 'That route produced an unsafe answer, trying another one' : 'That route is slow, trying another one',
          attempt,
          max_attempts: attemptsForModel,
          model_index: modelIndex,
          total_models: requestModelChain.length,
          intent: intent.kind,
        });
        console.warn(JSON.stringify({
          event: 'hermes_chat_attempt_failed',
          trace_id: traceId,
          player_id: safeId,
          model,
          attempt,
          model_index: modelIndex,
          error: err.message,
          no_retry: !!err.no_retry,
        }));
        if (err.no_retry) break;
        if (attempt < attemptsForModel) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(1500 * attempt, 5000)));
        }
      }
    }
  }

  await setPlayerProgress(safeId, {
    phase: 'failed',
    message: 'All routes failed for this request',
    attempt: fallbackAttempts,
    model_index: requestModelChain.length - 1,
    total_models: requestModelChain.length,
    intent: intent.kind,
  });
  timing.mark('request_failed', {
    status: 'error',
    message: 'All Hermes routes failed',
    attempted_models: attemptedModels,
    error: lastError?.message || 'Hermes chat failed',
    total_ms: Date.now() - overallStartedAt,
  });
  logHermesAudit('hermes_chat_failed', {
    trace_id: traceId,
    player_id: safeId,
    intent: intent.kind,
    duration_ms: Date.now() - overallStartedAt,
    attempted_models: attemptedModels,
    attempts: attemptRecords,
    timing_events: timing.events,
    error: lastError?.message || 'Hermes chat failed',
  });
  throw lastError || new Error('Hermes chat failed');
}

async function resetPlayer(playerId, options = {}) {
  const safeId = safePlayerId(playerId);
  const row = state.players[safeId];
  if (!row) return { ok: true, existed: false };
  await stopPlayerAndWait(safeId);
  if (options.delete_memory) {
    await fsp.rm(path.join(playerHome(safeId), 'memory'), { recursive: true, force: true });
  } else if (options.delete_recent_memory) {
    const recentMemoryPath = path.join(playerHome(safeId), 'memory', 'recent.md');
    await fsp.mkdir(path.dirname(recentMemoryPath), { recursive: true });
    await fsp.writeFile(recentMemoryPath, '# Recent Player Conversation\n\n', { mode: 0o600 });
  }
  await fsp.rm(path.join(playerHome(safeId), 'sessions'), { recursive: true, force: true });
  await fsp.mkdir(path.join(playerHome(safeId), 'sessions'), { recursive: true });
  row.updated_at = nowIso();
  row.last_error = null;
  await saveState();
  if (options.restart !== false) await ensurePlayerRunning(safeId);
  return { ok: true, existed: true, player: publicPlayerState(safeId) };
}

function auth(req, res, next) {
  const raw = String(req.headers.authorization || '');
  const bearer = raw.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!TOKEN || bearer !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  return next();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: process.env.CLASH_HERMES_JSON_LIMIT || '1mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'clash-hermes-orchestrator',
    host: HOST,
    port: PORT,
    hermes_bin: HERMES_BIN,
    primary_model: PRIMARY_MODEL,
    fallback_model: FALLBACK_MODEL || null,
    fallback_models: FALLBACK_MODELS,
    model_chain: MODEL_CHAIN,
    provider_order: PROVIDER_ORDER,
    chat_timeout_ms: HERMES_CHAT_TIMEOUT_MS,
    action_chat_timeout_ms: HERMES_ACTION_CHAT_TIMEOUT_MS,
    primary_retries: PRIMARY_MODEL_RETRIES,
    fallback_retries: FALLBACK_AFTER_RETRIES,
    action_primary_retries: ACTION_PRIMARY_MODEL_RETRIES,
    action_fallback_retries: ACTION_FALLBACK_MODEL_RETRIES,
    model_context_length: MODEL_CONTEXT_LENGTH,
    players: Object.keys(state.players).length,
    running: processes.size,
  });
});

app.get('/players/:playerId/status', auth, (req, res) => {
  const safeId = safePlayerId(req.params.playerId);
  res.json({ ok: true, player: publicPlayerState(safeId) });
});

app.post('/players/:playerId/provision', auth, async (req, res) => {
  try {
    const safeId = safePlayerId(req.params.playerId);
    const player = await withPlayerLifecycleLock(safeId, () => provisionPlayer(safeId, req.body || {}));
    res.json({ ok: true, player });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/players/:playerId/chat', auth, async (req, res) => {
  try {
    const safeId = safePlayerId(req.params.playerId);
    const result = await chatWithPlayer(safeId, req.body || {});
    res.json(result);
  } catch (err) {
    const safeId = safePlayerId(req.params.playerId);
    const row = state.players[safeId];
    if (row) {
      row.last_error = err.message;
      row.updated_at = nowIso();
      await saveState().catch(() => {});
    }
    res.status(err.status || 500).json({ ok: false, error: err.message, body: err.body || null });
  }
});

app.post('/players/:playerId/reset', auth, async (req, res) => {
  try {
    const safeId = safePlayerId(req.params.playerId);
    const result = await withPlayerLifecycleLock(safeId, () => resetPlayer(safeId, req.body || {}));
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/players/:playerId/stop', auth, async (req, res) => {
  try {
    const safeId = safePlayerId(req.params.playerId);
    const stopped = await withPlayerLifecycleLock(safeId, () => stopPlayer(safeId));
    res.json({ ok: true, stopped });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

setInterval(() => {
  const cutoff = Date.now() - HERMES_IDLE_SHUTDOWN_MS;
  for (const [playerId] of processes) {
    const row = state.players[playerId];
    const last = Date.parse(row?.last_chat_at || row?.last_started_at || 0);
    if (Number.isFinite(last) && last < cutoff) stopPlayer(playerId);
  }
}, 60_000).unref?.();

await loadState();
assertConfigured();
app.listen(PORT, HOST, () => {
  console.log(`clash-hermes-orchestrator listening on http://${HOST}:${PORT}`);
});
