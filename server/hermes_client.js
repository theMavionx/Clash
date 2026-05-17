const crypto = require('crypto');
const { CLASH_RUNTIME_INSTRUCTIONS } = require('../hermes-orchestrator/src/clash_agent_prompt.cjs');
const { resolveModelChain } = require('../hermes-orchestrator/src/clash_agent_settings.cjs');

const DEFAULT_URL = 'http://127.0.0.1:8600';
const ORCHESTRATOR_URL = String(process.env.CLASH_HERMES_ORCHESTRATOR_URL || DEFAULT_URL).replace(/\/+$/, '');
const ORCHESTRATOR_TOKEN = process.env.CLASH_HERMES_ORCHESTRATOR_TOKEN || process.env.HERMES_ORCHESTRATOR_TOKEN || '';
const MODEL_CHAIN = resolveModelChain(process.env);
const PRIMARY_MODEL = MODEL_CHAIN[0];
const FALLBACK_MODEL = MODEL_CHAIN[1] || '';
const REQUEST_TIMEOUT_MS = Number(process.env.CLASH_HERMES_BACKEND_TIMEOUT_MS || 190_000);

function configured() {
  return !!(ORCHESTRATOR_URL && ORCHESTRATOR_TOKEN);
}

function assertConfigured() {
  if (!configured()) {
    const err = new Error('Hermes orchestrator is not configured');
    err.status = 503;
    throw err;
  }
}

function sanitizePlayer(player) {
  return {
    id: String(player?.id || ''),
    name: String(player?.name || ''),
    dex: player?.dex || null,
    level: player?.level || null,
    trophies: player?.trophies || null,
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => {
      const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : '';
      const text = typeof item?.text === 'string' ? item.text.trim().slice(0, 1000) : '';
      return role && text ? { role, text } : null;
    })
    .filter(Boolean)
    .slice(-4);
}

function buildChatInput(message, history) {
  const current = String(message || '').trim().slice(0, 8000);
  const safeHistory = normalizeHistory(history);
  if (!safeHistory.length) return current;

  const historyText = safeHistory
    .map((item) => `${item.role === 'user' ? 'User' : 'Agent'}: ${item.text}`)
    .join('\n');
  const currentBlock = `# Current Player Message\n${current}`;
  let input = `# Recent Chat Context\n${historyText}\n\n${currentBlock}`;
  if (input.length <= 8000) return input;

  const budget = Math.max(0, 8000 - currentBlock.length - 32);
  input = `# Recent Chat Context\n${historyText.slice(-budget)}\n\n${currentBlock}`;
  return input.slice(0, 8000);
}

async function request(path, options = {}) {
  assertConfigured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${ORCHESTRATOR_TOKEN}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body == null ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    if (!res.ok) {
      const err = new Error(json?.error || json?.message || `Hermes orchestrator HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function getStatus(playerId) {
  return request(`/players/${encodeURIComponent(playerId)}/status`, { timeoutMs: 15_000 });
}

async function provision(player, mcpKey) {
  const safePlayer = sanitizePlayer(player);
  return request(`/players/${encodeURIComponent(safePlayer.id)}/provision`, {
    method: 'POST',
    timeoutMs: 80_000,
    body: {
      name: safePlayer.name,
      player: safePlayer,
      mcp_key: mcpKey,
      model: PRIMARY_MODEL,
      fallback_model: FALLBACK_MODEL,
      model_chain: MODEL_CHAIN,
    },
  });
}

async function chat(player, mcpKey, message, options = {}) {
  const safePlayer = sanitizePlayer(player);
  const history = normalizeHistory(options.history);
  await provision(safePlayer, mcpKey);
  return request(`/players/${encodeURIComponent(safePlayer.id)}/chat`, {
    method: 'POST',
    body: {
      input: buildChatInput(message, history),
      instructions: CLASH_RUNTIME_INSTRUCTIONS,
      previous_response_id: options.previous_response_id || null,
      idempotency_key: options.idempotency_key || crypto.randomUUID(),
      metadata: {
        player_id: safePlayer.id,
        player_name: safePlayer.name,
        source: 'clash-web-chat',
        history_count: history.length,
        ...(options.metadata || {}),
      },
    },
  });
}

async function reset(playerId, options = {}) {
  return request(`/players/${encodeURIComponent(playerId)}/reset`, {
    method: 'POST',
    timeoutMs: 80_000,
    body: {
      delete_memory: !!options.delete_memory,
      restart: options.restart !== false,
    },
  });
}

module.exports = {
  configured,
  getStatus,
  provision,
  chat,
  reset,
};
