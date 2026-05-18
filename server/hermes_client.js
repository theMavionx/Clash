const crypto = require('crypto');
const { CLASH_RUNTIME_INSTRUCTIONS } = require('../hermes-orchestrator/src/clash_agent_prompt.cjs');
const { resolveModelChain } = require('../hermes-orchestrator/src/clash_agent_settings.cjs');

const DEFAULT_URL = 'http://127.0.0.1:8600';
const ORCHESTRATOR_URL = String(process.env.CLASH_HERMES_ORCHESTRATOR_URL || DEFAULT_URL).replace(/\/+$/, '');
const ORCHESTRATOR_TOKEN = process.env.CLASH_HERMES_ORCHESTRATOR_TOKEN || process.env.HERMES_ORCHESTRATOR_TOKEN || '';
const MODEL_CHAIN = resolveModelChain(process.env);
const PRIMARY_MODEL = MODEL_CHAIN[0];
const FALLBACK_MODEL = MODEL_CHAIN[1] || '';
const REQUEST_TIMEOUT_MS = Number(process.env.CLASH_HERMES_BACKEND_TIMEOUT_MS || 300_000);
const DETAILED_LOGS = process.env.CLASH_AI_CHAT_DETAILED_LOGS !== '0';

function logHermesClient(event, payload = {}) {
  if (!DETAILED_LOGS) return;
  try {
    console.log(JSON.stringify({
      event: `hermes_client_${event}`,
      at: new Date().toISOString(),
      ...payload,
    }));
  } catch {
    console.log(`[hermes-client] ${event}`);
  }
}

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
    .normalize('NFKC')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/['`\u2018\u2019\u02bc]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function startsWithToken(text, token) {
  return text === token
    || text.startsWith(`${token} `)
    || text.startsWith(`${token},`)
    || text.startsWith(`${token}.`)
    || text.startsWith(`${token}!`)
    || text.startsWith(`${token}?`);
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

function cleanupAttackTargetName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^@+/, '')
    .replace(/[.,!?;:()[\]{}"'`]+$/g, '')
    .trim();
}

function isGenericAttackTargetName(value) {
  const candidate = cleanupAttackTargetName(value);
  if (!candidate) return true;
  const normalized = normalizeIntentText(candidate);
  if (!normalized || GENERIC_ATTACK_TARGETS.has(normalized)) return true;
  if (/^(?:base|enemy|player|user|target|opponent|battle|raid)[_-]?\d*$/i.test(candidate)) return true;
  return false;
}

function isPassiveChat(text) {
  if (!text) return true;
  const greetings = ['hi', 'hello', 'hey', 'yo', 'sup', 'gm', 'gn', 'привіт', 'привет', 'вітаю', 'здравствуй', 'здравствуйте', 'hola', 'bonjour', 'salut', 'hallo', 'ciao', 'ola', 'oi', 'hej', 'hei', 'مرحبا', 'سلام', '你好', '您好', 'こんにちは', 'こんばんは', '안녕', 'xin chao'];
  if (greetings.some((token) => startsWithToken(text, token))) return true;
  const thanks = ['thanks', 'thank you', 'thx', 'дякую', 'спасибо', 'merci', 'gracias', 'obrigado', 'obrigada', 'danke', 'grazie', 'شكرا', '谢谢', 'ありがとう', '고마워', 'cam on'];
  if (thanks.some((token) => startsWithToken(text, token))) return true;
  if (/^(ok|okay|ок|добре|хорошо|fine|cool|nice|супер|круто|ага|yes|no|так|ні|нет)$/i.test(text)) return true;
  if (/^(who are you|what are you|хто ти|кто ты|як справи|как дела|how are you)\??$/i.test(text)) return true;
  return false;
}

function extractAttackTargetName(message) {
  const raw = String(message || '').normalize('NFKC').trim();
  if (!raw) return '';
  const patterns = [
    /\b(?:attack|raid|hit|battle)\s+(?:(?:player|user)\s+)?([\p{L}\p{N}_.-]{2,60})\b/iu,
    /(?:атаку|атака\s+на|атакуй|атакувати|атаковать|напади\s+на|напасть\s+на|нападай\s+на|ударь\s+по|ударь|атакуй\s+гравця|атакуй\s+игрока)\s+([\p{L}\p{N}_.-]{2,60})/iu,
  ];
  const generic = new Set(['enemy', 'someone', 'somebody', 'base', 'player', 'user', 'когось', 'ворога', 'врага', 'базу', 'гравця', 'игрока']);
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const candidate = String(match?.[1] || '').replace(/[.,!?;:]+$/g, '').trim();
    if (candidate && !generic.has(candidate.toLowerCase())) return candidate;
  }
  return '';
}

function extractAttackTargetNameV2(message) {
  const raw = String(message || '').normalize('NFKC').trim();
  if (!raw) return '';
  const patterns = [
    /\b(?:attack|raid|hit|battle)\s+(?:(?:the|a|an)\s+)?(?:player|user|enemy|opponent)\s+(?:named|called\s+)?@?([\p{L}\p{N}_.-]{2,60})\b/iu,
    /\b(?:attack|raid|hit|battle)\s+@?([\p{L}\p{N}_.-]{2,60})\b/iu,
    /(?:атакуй|атакувати|атаковать|атака\s+на|напади\s+на|напасть\s+на|нападай\s+на|ударь\s+по|ударь)\s+(?:(?:гравця|игрока|ворога|врага)\s+)?@?([\p{L}\p{N}_.-]{2,60})/iu,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const candidate = cleanupAttackTargetName(match?.[1] || '');
    if (candidate && !isGenericAttackTargetName(candidate)) return candidate;
  }
  return '';
}

function isAttackIntentText(text) {
  return /(атак|напад|raid|battle|enemy|ворог|враг|бій|бой|进攻|攻击|打仗|敵|敌|danh|attack)/i.test(text);
}

function battleIntentForTarget(targetPlayerName = '') {
  return {
    kind: targetPlayerName ? 'targeted_battle' : 'battle',
    action_required: true,
    goal: targetPlayerName
      ? `Start an AI online battle against ${targetPlayerName} only through MCP tools.`
      : 'Start an AI online battle only through MCP tools.',
    target_player_name: targetPlayerName || undefined,
    required_loop: targetPlayerName
      ? `get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ target_player_name: "${targetPlayerName}", auto_tactics: true }) -> if shielded, report remaining shield hours in English; otherwise summarize result and losses`
      : 'get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ auto_tactics: true }) -> summarize result and losses',
  };
}

function classifyGameIntent(message) {
  const text = normalizeIntentText(message);
  if (!text) return { kind: 'general', action_required: false };
  if (isAttackIntentText(text)) {
    return battleIntentForTarget(extractAttackTargetNameV2(message));
  }
  if (/(атак|атакуй|напад|напади|raid|battle|enemy|ворог|враг|бій|бой|进攻|攻击|打仗|敵|敌|đánh|attack)/i.test(text)) {
    const targetPlayerName = extractAttackTargetName(message);
    return {
      kind: targetPlayerName ? 'targeted_battle' : 'battle',
      action_required: true,
      goal: targetPlayerName
        ? `Start an AI online battle against ${targetPlayerName} only through MCP tools.`
        : 'Start an AI online battle only through MCP tools.',
      target_player_name: targetPlayerName || undefined,
      required_loop: targetPlayerName
        ? `get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ target_player_name: "${targetPlayerName}", auto_tactics: true }) -> if shielded, report remaining shield hours; otherwise summarize result and losses`
        : 'get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ auto_tactics: true }) -> summarize result and losses',
    };
  }
  if (/(збери|собери|collect|收集|thu thap).*(ресурс|реси|resources|资源|tai nguyen)|(?:ресурс|реси|resources|资源|tai nguyen).*(збери|собери|collect|收集|thu thap)/i.test(text)) {
    return {
      kind: 'collect_resources',
      action_required: true,
      goal: 'Collect available game resources only through MCP tools.',
      required_loop: 'get_base_state -> collect_resources({}) -> summarize collected resources',
    };
  }
  if (/(build|place|set up|setup|розстав|побуд|постав|建造|布置|xay).*(base|баз|基地|can cu)|(?:base|баз|基地|can cu).*(build|place|set up|setup|розстав|побуд|постав|建造|布置|xay)/i.test(text)) {
    return {
      kind: 'auto_build_base',
      action_required: true,
      goal: 'Autonomously build and arrange the player base through MCP tools without asking for grids or a building list.',
      required_loop: 'get_base_state -> auto_build_base({ focus: "balanced" }) -> summarize built buildings and blockers',
    };
  }
  if (/(побуд|постав|build|place|shop|магазин|archer tower|tower|порт|port|будів|building|建造|建筑|商店|港口|塔|xay)/i.test(text)) {
    return {
      kind: 'build',
      action_required: true,
      goal: 'Place a valid building using catalog and build-slot tools.',
      required_loop: 'get_base_state -> if broad base setup use auto_build_base; otherwise get_building_catalog if needed -> find_build_slots -> place_building -> summarize result',
    };
  }
  if (/(апгрейд|апгрейдни|upgrade|level|lvl|рівень|уровень|升级|nang cap)/i.test(text)) {
    return {
      kind: 'upgrade',
      action_required: true,
      goal: 'Upgrade the requested building or troop using MCP tools.',
      required_loop: 'get_base_state -> identify exact id/type -> upgrade_building or upgrade_troop -> summarize result',
    };
  }
  if (/(кораб|ship|troop|військ|войск|load|reinforce|віднов|восстанов|船|部队|增援|tau|quan)/i.test(text)) {
    return {
      kind: 'fleet',
      action_required: true,
      goal: 'Manage ships, troops, loadouts, or reinforcements through MCP tools.',
      required_loop: 'get_base_state -> choose valid port/ship/troop ids -> use the relevant ship/troop MCP tool -> summarize result',
    };
  }
  if (/(скіли|skills|що ти вмієш|что ты умеешь|можеш|умеешь|技能|你会|能力)/i.test(text)) {
    return {
      kind: 'skills',
      action_required: false,
      goal: 'Explain only Clash of Perps gameplay capabilities.',
    };
  }
  if (isPassiveChat(text)) return { kind: 'general', action_required: false };
  return {
    kind: 'gameplay',
    action_required: true,
    goal: 'Infer the player Clash of Perps gameplay request in any language and complete the useful action through MCP tools.',
    required_loop: 'get_base_state -> infer the requested game action from the player message and recent context -> use the minimum relevant Clash MCP tool(s) -> summarize confirmed result or blocker',
  };
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
      'If a tool blocks the action, stop and report the exact blocker in clear English. Do not translate blocker/error messages.'
    );
  }
  return lines.join('\n');
}

function tryStaticReply(message) {
  const intent = classifyGameIntent(message);
  if (intent.kind === 'skills') {
    return {
      ok: true,
      model: 'static-router',
      fallback: false,
      fallback_index: 0,
      attempted_models: [],
      output_text: 'I can inspect your base, collect resources, build and upgrade buildings, manage ships and troops, reinforce battle losses, and launch AI online battles.',
      timings: { total_ms: 0, model_ensure_ms: 0, model_call_ms: 0 },
    };
  }
  if (intent.kind === 'skills') {
    return {
      ok: true,
      model: 'static-router',
      fallback: false,
      fallback_index: 0,
      attempted_models: [],
      output_text: 'Я можу переглядати твою базу, збирати ресурси, будувати й апгрейдити будівлі, керувати кораблями та військами, відновлювати втрати після бою і запускати AI-атаки.',
      timings: { total_ms: 0, model_ensure_ms: 0, model_call_ms: 0 },
    };
  }
  if (/^(how to play|help|guide|tutorial)$/i.test(normalizeIntentText(message))) {
    return {
      ok: true,
      model: 'static-router',
      fallback: false,
      fallback_index: 0,
      attempted_models: [],
      output_text: 'Build your economy, collect resources, upgrade Town Hall, load troops into ships, then launch AI battles. I can do those actions for you when you ask.',
      timings: { total_ms: 0, model_ensure_ms: 0, model_call_ms: 0 },
    };
  }
  return null;
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
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const url = `${ORCHESTRATOR_URL}${path}`;
    const method = options.method || 'GET';
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${ORCHESTRATOR_TOKEN}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        body: options.body == null ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (err) {
      const cause = err?.cause || {};
      const detail = cause?.code
        ? `${cause.code}${cause.address ? ` ${cause.address}` : ''}${cause.port ? `:${cause.port}` : ''}`
        : err?.name || 'network error';
      const wrapped = new Error(`Hermes orchestrator fetch failed (${url}): ${detail}`);
      wrapped.status = 502;
      wrapped.cause = err;
      logHermesClient('request_error', {
        method,
        path,
        duration_ms: Date.now() - startedAt,
        error: wrapped.message,
      });
      throw wrapped;
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    logHermesClient('request_done', {
      method,
      path,
      status: res.status,
      ok: res.ok,
      duration_ms: Date.now() - startedAt,
      response_bytes: text.length,
    });
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
  classifyGameIntent,
  tryStaticReply,
};
