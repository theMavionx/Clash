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
  TOOL_INCLUDE,
  CLASH_AGENT_PLAYBOOK,
  buildRuntimeInstructions,
} = clashPrompt;

const { resolveModelChain } = clashSettings;

const ROOT = path.resolve(process.env.CLASH_HERMES_ROOT || '/srv/clash-hermes');
const PLAYERS_DIR = path.resolve(process.env.CLASH_HERMES_PLAYERS_DIR || path.join(ROOT, 'players'));
const STATE_DIR = path.resolve(process.env.CLASH_HERMES_STATE_DIR || path.join(ROOT, 'state'));
const STATE_FILE = path.resolve(process.env.CLASH_HERMES_STATE_FILE || path.join(STATE_DIR, 'players.json'));
const LOG_DIR = path.resolve(process.env.CLASH_HERMES_LOG_DIR || path.join(ROOT, 'logs'));
const HOST = process.env.CLASH_HERMES_ORCHESTRATOR_HOST || '127.0.0.1';
const PORT = Number(process.env.CLASH_HERMES_ORCHESTRATOR_PORT || 8600);
const TOKEN = process.env.HERMES_ORCHESTRATOR_TOKEN || '';
const HERMES_BIN = process.env.HERMES_BIN || 'hermes';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL_CHAIN = resolveModelChain(process.env);
const PRIMARY_MODEL = MODEL_CHAIN[0];
const FALLBACK_MODELS = MODEL_CHAIN.slice(1);
const FALLBACK_MODEL = FALLBACK_MODELS[0] || '';
const FALLBACK_AFTER_RETRIES = Number(process.env.CLASH_HERMES_FALLBACK_AFTER_RETRIES || 2);
const MCP_URL = process.env.CLASH_MCP_URL || 'https://mcp.clashofperps.fun/mcp';
const HERMES_READY_TIMEOUT_MS = Number(process.env.CLASH_HERMES_READY_TIMEOUT_MS || 45_000);
const HERMES_IDLE_SHUTDOWN_MS = Number(process.env.CLASH_HERMES_IDLE_SHUTDOWN_MS || 15 * 60_000);
const HERMES_TOOL_TIMEOUT = Number(process.env.CLASH_HERMES_TOOL_TIMEOUT || 120);
const HERMES_CHAT_TIMEOUT_MS = Number(process.env.CLASH_HERMES_CHAT_TIMEOUT_MS || 25_000);
const MODEL_CONTEXT_LENGTH = Number(process.env.CLASH_HERMES_MODEL_CONTEXT_LENGTH || 65_536);
const MAX_INPUT_CHARS = Number(process.env.CLASH_HERMES_MAX_INPUT_CHARS || 8000);
const MAX_INSTRUCTIONS_CHARS = Number(process.env.CLASH_HERMES_MAX_INSTRUCTIONS_CHARS || 24000);
const START_PORT = Number(process.env.CLASH_HERMES_PLAYER_PORT_START || 8700);
const state = { players: {}, nextPort: START_PORT };
const processes = new Map();

function nowIso() {
  return new Date().toISOString();
}

function publicPlayerState(playerId) {
  const row = state.players[playerId];
  if (!row) return null;
  const proc = processes.get(playerId);
  return {
    player_id: playerId,
    name: row.name || null,
    port: row.port,
    model: row.model || PRIMARY_MODEL,
    fallback_model: FALLBACK_MODEL || null,
    fallback_models: FALLBACK_MODELS,
    model_chain: MODEL_CHAIN,
    running: !!proc && !proc.killed,
    pid: proc?.pid || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    last_started_at: row.last_started_at || null,
    last_chat_at: row.last_chat_at || null,
    last_error: row.last_error || null,
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

async function saveState() {
  await ensureDirs();
  const tmp = `${STATE_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2));
  await fsp.rename(tmp, STATE_FILE);
  await fsp.chmod(STATE_FILE, 0o600).catch(() => {});
}

function playerHome(playerId) {
  return path.join(PLAYERS_DIR, safePlayerId(playerId));
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''));
}

function writePlayerConfig(playerId, row) {
  const include = TOOL_INCLUDE.map((tool) => `        - ${tool}`).join('\n');
  return [
    '# Managed by clash-hermes-orchestrator. Do not edit by hand.',
    'provider: openrouter',
    'model:',
    `  default: ${yamlString(row.model || PRIMARY_MODEL)}`,
    `  context_length: ${MODEL_CONTEXT_LENGTH}`,
    'auxiliary:',
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
    '  max_turns: 30',
    '  gateway_timeout: 240',
    '  disabled_toolsets:',
    '    - terminal',
    '    - file',
    '    - browser',
    '    - web',
    '    - code_execution',
    '    - cronjob',
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
  await fsp.writeFile(path.join(home, 'SOUL.md'), CLASH_AGENT_PLAYBOOK, { mode: 0o600 });
  await fsp.writeFile(path.join(home, 'HERMES.md'), CLASH_AGENT_PLAYBOOK, { mode: 0o600 });
  await fsp.mkdir(path.join(home, 'skills', 'clash-of-perps-ai-agent'), { recursive: true });
  await fsp.writeFile(path.join(home, 'skills', 'clash-of-perps-ai-agent', 'SKILL.md'), CLASH_AGENT_PLAYBOOK, { mode: 0o600 });
  await fsp.writeFile(versionFile, CLASH_PROMPT_VERSION, { mode: 0o600 });
  await fsp.mkdir(path.join(home, 'sessions'), { recursive: true });
  await fsp.mkdir(path.join(home, 'memory'), { recursive: true });
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
  const row = {
    ...existing,
    safe_id: safeId,
    name: clampText(body?.name || existing.name || safeId, 80),
    mcp_key: mcpKey,
    api_key: existing.api_key || randomToken('hapi'),
    port: existing.port || await allocatePort(),
    model: clampText(body?.model || existing.model || PRIMARY_MODEL, 120),
    created_at: existing.created_at || nowIso(),
    updated_at: nowIso(),
    last_error: null,
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
  const child = spawn(HERMES_BIN, ['gateway'], {
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
  processes.set(safeId, child);
  row.last_started_at = nowIso();
  row.last_error = null;
  await saveState();
  child.on('exit', async (code, signal) => {
    const active = processes.get(safeId);
    if (active === child) processes.delete(safeId);
    const latest = state.players[safeId];
    if (latest) {
      latest.last_error = code === 0 ? null : `Hermes exited code=${code} signal=${signal || ''}`.trim();
      latest.updated_at = nowIso();
      await saveState().catch(() => {});
    }
  });
  await waitForHermes(row);
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

function hermesTextFailure(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (/api call failed/i.test(raw) && /http\s*(429|5\d\d)|provider returned error|rate.?limit/i.test(raw)) {
    return { message: raw.slice(0, 300), no_retry: /http\s*429|rate.?limit/i.test(raw) };
  }
  if (/http\s*429/i.test(raw) || /rate.?limit/i.test(raw)) {
    return { message: raw.slice(0, 300), no_retry: true };
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

async function callHermesResponses(row, payload) {
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
  }, HERMES_CHAT_TIMEOUT_MS);
}

async function chatWithPlayer(playerId, body) {
  const safeId = safePlayerId(playerId);
  if (!state.players[safeId]) throw new Error('player is not provisioned');
  const input = clampText(body?.input || body?.message, MAX_INPUT_CHARS).trim();
  if (!input) throw new Error('message required');
  const requestInstructions = clampText(body?.instructions || '', MAX_INSTRUCTIONS_CHARS);
  const instructions = buildRuntimeInstructions(requestInstructions);
  const payload = {
    input,
    instructions,
    previous_response_id: body?.previous_response_id || null,
    metadata: body?.metadata || {},
    idempotency_key: body?.idempotency_key || crypto.randomUUID(),
    store: body?.store !== false,
  };

  let lastError = null;
  const attemptedModels = [];
  const attemptsPerModel = Math.max(1, FALLBACK_AFTER_RETRIES);

  for (let modelIndex = 0; modelIndex < MODEL_CHAIN.length; modelIndex += 1) {
    const model = MODEL_CHAIN[modelIndex];
    attemptedModels.push(model);
    let activeRow = null;
    try {
      activeRow = await ensureModelRunning(safeId, model);
    } catch (err) {
      lastError = err;
      const latest = state.players[safeId];
      if (latest) {
        latest.last_error = `[${model}] ${err.message}`;
        await saveState();
      }
      continue;
    }
    for (let attempt = 1; attempt <= attemptsPerModel; attempt += 1) {
      try {
        const response = await callHermesResponses(activeRow, payload);
        const outputText = assertUsableHermesResponse(response);
        activeRow.last_chat_at = nowIso();
        activeRow.last_error = null;
        await saveState();
        return {
          ok: true,
          model: activeRow.model || model,
          fallback: modelIndex > 0,
          fallback_index: modelIndex,
          attempted_models: attemptedModels,
          output_text: outputText,
          response,
        };
      } catch (err) {
        lastError = err;
        activeRow.last_error = `[${model}] ${err.message}`;
        await saveState();
        console.warn(JSON.stringify({
          event: 'hermes_chat_attempt_failed',
          player_id: safeId,
          model,
          attempt,
          model_index: modelIndex,
          error: err.message,
          no_retry: !!err.no_retry,
        }));
        if (err.no_retry) break;
      }
    }
  }

  throw lastError || new Error('Hermes chat failed');
}

async function resetPlayer(playerId, options = {}) {
  const safeId = safePlayerId(playerId);
  const row = state.players[safeId];
  if (!row) return { ok: true, existed: false };
  stopPlayer(safeId);
  if (options.delete_memory) {
    await fsp.rm(path.join(playerHome(safeId), 'memory'), { recursive: true, force: true });
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
    chat_timeout_ms: HERMES_CHAT_TIMEOUT_MS,
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
    const player = await provisionPlayer(safeId, req.body || {});
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
    const result = await resetPlayer(safeId, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/players/:playerId/stop', auth, (req, res) => {
  const safeId = safePlayerId(req.params.playerId);
  res.json({ ok: true, stopped: stopPlayer(safeId) });
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
