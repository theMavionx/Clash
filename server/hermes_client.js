const crypto = require('crypto');

const DEFAULT_URL = 'http://127.0.0.1:8600';
const ORCHESTRATOR_URL = String(process.env.CLASH_HERMES_ORCHESTRATOR_URL || DEFAULT_URL).replace(/\/+$/, '');
const ORCHESTRATOR_TOKEN = process.env.CLASH_HERMES_ORCHESTRATOR_TOKEN || process.env.HERMES_ORCHESTRATOR_TOKEN || '';
const PRIMARY_MODEL = process.env.CLASH_HERMES_PRIMARY_MODEL || 'openai/gpt-oss-20b:free';
const FALLBACK_MODEL = process.env.CLASH_HERMES_FALLBACK_MODEL || 'google/gemma-4-31b-it:free';
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
    },
  });
}

async function chat(player, mcpKey, message, options = {}) {
  const safePlayer = sanitizePlayer(player);
  await provision(safePlayer, mcpKey);
  const instructions = [
    'You are the in-game AI assistant for Clash of Perps.',
    'Use the Clash MCP tools for game actions instead of inventing results.',
    'Only act on the authenticated player account attached to your MCP key.',
    'Keep replies short and game-like. When you perform an action, report the concrete outcome.',
    'For attacks, prefer nearby landing slots, use cannon shots on defensive towers first, and use rally markers only when tactically useful.',
  ].join('\n');
  return request(`/players/${encodeURIComponent(safePlayer.id)}/chat`, {
    method: 'POST',
    body: {
      input: String(message || '').slice(0, 8000),
      instructions,
      previous_response_id: options.previous_response_id || null,
      idempotency_key: options.idempotency_key || crypto.randomUUID(),
      metadata: {
        player_id: safePlayer.id,
        player_name: safePlayer.name,
        source: 'clash-web-chat',
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
