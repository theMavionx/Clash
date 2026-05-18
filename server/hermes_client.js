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

function normalizeIntentText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['`\u2018\u2019\u02bc]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyGameIntent(message) {
  const text = normalizeIntentText(message);
  if (!text) return { kind: 'general', action_required: false };
  if (/(атак|атакуй|напад|напади|raid|battle|enemy|ворог|враг|бій|бой)/i.test(text)) {
    return {
      kind: 'battle',
      action_required: true,
      goal: 'Start an AI online battle only through MCP tools.',
      required_loop: 'get_base_state -> confirm loaded ships -> execute_ai_attack_plan({ auto_tactics: true }) -> summarize result and losses',
    };
  }
  if (/(збери|собери|collect).*(ресурс|реси|resources)|(?:ресурс|реси|resources).*(збери|собери|collect)/i.test(text)) {
    return {
      kind: 'collect_resources',
      action_required: true,
      goal: 'Collect available game resources only through MCP tools.',
      required_loop: 'get_base_state -> collect_resources({}) -> summarize collected resources',
    };
  }
  if (/(build|place|set up|setup|розстав|побуд|постав).*(base|баз)|(?:base|баз).*(build|place|set up|setup|розстав|побуд|постав)/i.test(text)) {
    return {
      kind: 'auto_build_base',
      action_required: true,
      goal: 'Autonomously build and arrange the player base through MCP tools without asking for grids or a building list.',
      required_loop: 'get_base_state -> auto_build_base({ focus: "balanced" }) -> summarize built buildings and blockers',
    };
  }
  if (/(побуд|постав|build|place|shop|магазин|archer tower|tower|порт|port|будів|building)/i.test(text)) {
    return {
      kind: 'build',
      action_required: true,
      goal: 'Place a valid building using catalog and build-slot tools.',
      required_loop: 'get_base_state -> if broad base setup use auto_build_base; otherwise get_building_catalog if needed -> find_build_slots -> place_building -> summarize result',
    };
  }
  if (/(апгрейд|апгрейдни|upgrade|level|lvl|рівень|уровень)/i.test(text)) {
    return {
      kind: 'upgrade',
      action_required: true,
      goal: 'Upgrade the requested building or troop using MCP tools.',
      required_loop: 'get_base_state -> identify exact id/type -> upgrade_building or upgrade_troop -> summarize result',
    };
  }
  if (/(кораб|ship|troop|військ|войск|load|reinforce|віднов|восстанов)/i.test(text)) {
    return {
      kind: 'fleet',
      action_required: true,
      goal: 'Manage ships, troops, loadouts, or reinforcements through MCP tools.',
      required_loop: 'get_base_state -> choose valid port/ship/troop ids -> use the relevant ship/troop MCP tool -> summarize result',
    };
  }
  if (/(скіли|skills|що ти вмієш|что ты умеешь|можеш|умеешь)/i.test(text)) {
    return {
      kind: 'skills',
      action_required: false,
      goal: 'Explain only Clash of Perps gameplay capabilities.',
    };
  }
  return { kind: 'general', action_required: false };
}

function buildIntentInstructions(intent) {
  if (!intent || intent.kind === 'general') return '';
  const lines = [
    '## Current Request Intent',
    `Intent: ${intent.kind}.`,
    `Goal: ${intent.goal || 'Help with Clash of Perps gameplay.'}`,
  ];
  if (intent.action_required) {
    lines.push(
      'This is a real game-action request. Do not answer with only advice.',
      'Use Clash MCP tools before the final answer. Never claim an action happened unless the tool result confirms it.',
      `Required loop: ${intent.required_loop}`,
      'If a tool blocks the action, stop and report the exact blocker in player-facing language.'
    );
  }
  return lines.join('\n');
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

function buildInstructionsForMessage(message) {
  const intent = classifyGameIntent(message);
  const intentInstructions = buildIntentInstructions(intent);
  return {
    intent,
    instructions: intentInstructions
      ? `${CLASH_RUNTIME_INSTRUCTIONS}\n\n${intentInstructions}`
      : CLASH_RUNTIME_INSTRUCTIONS,
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
      model_chain: MODEL_CHAIN,
    },
  });
}

async function chat(player, mcpKey, message, options = {}) {
  const safePlayer = sanitizePlayer(player);
  const history = normalizeHistory(options.history);
  await provision(safePlayer, mcpKey);
  const requestContext = buildInstructionsForMessage(message);
  return request(`/players/${encodeURIComponent(safePlayer.id)}/chat`, {
    method: 'POST',
    body: {
      input: buildChatInput(message, history),
      instructions: requestContext.instructions,
      previous_response_id: options.previous_response_id || null,
      idempotency_key: options.idempotency_key || crypto.randomUUID(),
      metadata: {
        player_id: safePlayer.id,
        player_name: safePlayer.name,
        source: 'clash-web-chat',
        history_count: history.length,
        game_intent: requestContext.intent,
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
