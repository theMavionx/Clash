'use strict';

const {
  resolveModelChain,
  resolveProviderOrder,
  parseModelChain,
} = require('../hermes-orchestrator/src/clash_agent_settings.cjs');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_PROMPT_CHARS = 6000;
const MAX_CURRENT_DRAFT_CHARS = 30000;
const DEFAULT_TIMEOUT_MS = 45000;
const TOURNAMENT_DEXES = new Set([
  'pacifica', 'avantis', 'decibel', 'gmx', 'ostium', 'monad', 'phoenix',
  'hyperliquid', 'risex', 'nado', 'ondo', 'hibachi', 'grvt', 'hotstuff', 'katana',
  'gmtrade', 'flash', 'lighter',
  'bulk',
]);
const TOURNAMENT_FIELDS = new Set([
  'event_kind', 'name', 'description', 'dex', 'dex_scope', 'eligible_dexes', 'mode',
  'team_score_by', 'team_prize_mode', 'team_prize_splits', 'team_member_reward_by',
  'attack_match_policy', 'battle_mode', 'ranked_daily_attack_limit',
  'ranked_shield_hours', 'ranked_max_defenses_per_day', 'ranked_altar_bonus_enabled',
  'start_at', 'end_at', 'preregistration_enabled', 'registration_opens_at',
  'registration_closes_at', 'registration_require_twitter', 'gold_boost',
  'seeker_gold_boost', 'trophy_boost', 'shield_hours', 'freeze_trophies',
  'min_town_hall_level', 'seeker_only', 'sort_by', 'scoring_mode',
  'daily_pool_points', 'daily_pool_enabled_at', 'daily_pool_award_time_utc',
  'daily_pool_growth_pct', 'daily_pool_overrides', 'points_trophy_weight',
  'points_volume_weight', 'points_pnl_weight', 'prize_currency', 'prize_tiers',
  'mega_config', 'reward_config', 'rewards_in_cop',
]);

function configuredOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || process.env.CLASH_OPENROUTER_API_KEY || '';
}

function unique(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function modelChain(env = process.env) {
  const explicit = parseModelChain(env.CLASH_TOURNAMENT_AI_MODELS);
  return unique(explicit.length ? explicit : [
    env.CLASH_TOURNAMENT_AI_MODEL,
    'poolside/laguna-s-2.1:free',
    'google/gemma-4-31b-it:free',
    'google/gemma-4-26b-a4b-it:free',
    'inclusionai/ling-3.0-flash:free',
    'openrouter/free',
    'openai/gpt-oss-20b:free',
    ...resolveModelChain(env),
    'openai/gpt-4.1-mini',
    'google/gemini-2.5-flash',
  ]);
}

function isFreeModel(model) {
  const value = String(model || '').trim().toLowerCase();
  return value === 'openrouter/free' || value.endsWith(':free');
}

function clampNumber(value, min, max, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function cleanText(value, max = 160) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function cleanDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 19).replace('T', ' ');
}

function cleanDay(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  return Number.isFinite(Date.parse(`${text}T00:00:00Z`)) ? text : '';
}

function cleanEnum(value, allowed, fallback) {
  const text = String(value || '').trim().toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

function cleanBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
  if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') return false;
  return fallback;
}

function normalizePayouts(input) {
  return (Array.isArray(input) ? input : [])
    .map((row) => ({
      rank: Math.max(1, Math.min(100, Math.floor(Number(row?.rank) || 1))),
      amount: clampNumber(row?.amount ?? row?.amount_usd ?? row?.quantity, 0, 1_000_000_000, 0),
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 100);
}

function normalizeReward(input = {}) {
  const type = cleanEnum(input.type, ['money', 'points', 'amp', 'nft', 'custom'], 'money');
  const currency = cleanText(input.currency || input.unit || (type === 'money' ? 'USD' : ''), 12).toUpperCase();
  return {
    type,
    label: cleanText(input.label || input.name || 'Reward', 80),
    unit: cleanText(input.unit || input.currency || (type === 'points' ? 'points' : type === 'nft' ? 'NFT' : 'reward'), 24),
    currency: type === 'money' ? (currency || 'USD') : currency,
    pool_amount: clampNumber(input.pool_amount ?? input.pool ?? input.quantity, 0, 1_000_000_000, 0),
    winners: Math.max(1, Math.min(100, Math.floor(Number(input.winners) || 1))),
    preset: cleanText(input.preset || 'custom', 40),
    payouts: normalizePayouts(input.payouts),
  };
}

function normalizeRewardPool(input = {}, index = 0, daily = false) {
  const output = {
    enabled: cleanBoolean(input.enabled, true),
    label: cleanText(input.label || input.name || `${daily ? 'Daily' : 'Final'} pool ${index + 1}`, 80),
    top_n: Math.max(1, Math.min(100, Math.floor(Number(input.top_n ?? input.winners) || 5))),
    metric: cleanEnum(input.metric, ['points', 'volume_usd', 'trophies', 'pnl_usd', 'gold'], 'points'),
    rewards: (Array.isArray(input.rewards) ? input.rewards : []).map(normalizeReward).slice(0, 12),
    payout_preset: cleanText(input.payout_preset || input.preset || 'custom', 40),
    payouts: normalizePayouts(input.payouts),
  };
  if (daily) {
    output.day_utc = cleanDay(input.day_utc || input.day || input.date);
    output.volume_target_usd = clampNumber(
      input.volume_target_usd ?? input.daily_volume_target_usd ?? input.volume_target,
      0,
      10_000_000_000,
      0,
    );
    output.volume_target_scope = cleanEnum(
      input.volume_target_scope || input.target_scope,
      ['player', 'tournament'],
      'player',
    );
  }
  return output;
}

function normalizeRewardConfig(input = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    daily_pools: (Array.isArray(raw.daily_pools) ? raw.daily_pools : [])
      .map((pool, index) => normalizeRewardPool(pool, index, true))
      .slice(0, 60),
    final_pools: (Array.isArray(raw.final_pools) ? raw.final_pools : [])
      .map((pool, index) => normalizeRewardPool(pool, index, false))
      .slice(0, 30),
    lucky_daily_raider: raw.lucky_daily_raider && typeof raw.lucky_daily_raider === 'object'
      ? raw.lucky_daily_raider
      : {},
  };
}

function normalizePrizeTiers(input) {
  return (Array.isArray(input) ? input : []).map((tier) => ({
    volume_usd: clampNumber(tier?.volume_usd ?? tier?.threshold_usd, 0, 10_000_000_000, 0),
    rewards: (Array.isArray(tier?.rewards) ? tier.rewards : []).map(normalizeReward).slice(0, 12),
  })).filter((tier) => tier.volume_usd > 0 || tier.rewards.length > 0)
    .sort((a, b) => a.volume_usd - b.volume_usd)
    .slice(0, 30);
}

function normalizeDailyOverrides(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const output = {};
  for (const [day, value] of Object.entries(raw)) {
    const validDay = cleanDay(day);
    const points = clampNumber(value, 1, 1_000_000_000, 0);
    if (validDay && points > 0) output[validDay] = points;
  }
  return output;
}

function normalizeTeamPrizeSplits(input) {
  return (Array.isArray(input) ? input : []).map((row) => ({
    dex: cleanEnum(row?.dex, [...TOURNAMENT_DEXES], ''),
    share_pct: clampNumber(row?.share_pct ?? row?.percent, 0, 100, 0),
  })).filter((row) => row.dex && row.share_pct > 0).slice(0, TOURNAMENT_DEXES.size);
}

function normalizeDraft(rawInput = {}) {
  const raw = rawInput?.draft && typeof rawInput.draft === 'object' ? rawInput.draft : rawInput;
  const draft = {};
  for (const field of TOURNAMENT_FIELDS) {
    if (raw?.[field] !== undefined) draft[field] = raw[field];
  }

  if ('event_kind' in draft) draft.event_kind = cleanEnum(draft.event_kind, ['standard', 'lucky_raider'], 'standard');
  if ('name' in draft) draft.name = cleanText(draft.name, 120);
  if ('description' in draft) draft.description = String(draft.description || '').trim().slice(0, 500);
  if ('dex_scope' in draft) draft.dex_scope = cleanEnum(draft.dex_scope, ['single', 'custom', 'all'], 'single');
  if ('dex' in draft) draft.dex = cleanEnum(draft.dex, [...TOURNAMENT_DEXES], 'pacifica');
  if ('eligible_dexes' in draft) {
    draft.eligible_dexes = unique(Array.isArray(draft.eligible_dexes) ? draft.eligible_dexes : [])
      .map((dex) => cleanEnum(dex, [...TOURNAMENT_DEXES], ''))
      .filter(Boolean);
  }
  if ('mode' in draft) draft.mode = cleanEnum(draft.mode, ['individual', 'dex_vs_dex'], 'individual');
  if ('team_score_by' in draft) draft.team_score_by = cleanEnum(draft.team_score_by, ['points', 'volume_usd', 'trophies', 'pnl_usd', 'gold'], 'volume_usd');
  if ('team_member_reward_by' in draft) draft.team_member_reward_by = cleanEnum(draft.team_member_reward_by, ['points', 'volume_usd', 'trophies', 'pnl_usd', 'gold'], 'volume_usd');
  if ('team_prize_mode' in draft) draft.team_prize_mode = cleanEnum(draft.team_prize_mode, ['winner_takes_all', 'custom_split'], 'winner_takes_all');
  if ('team_prize_splits' in draft) draft.team_prize_splits = normalizeTeamPrizeSplits(draft.team_prize_splits);
  if ('attack_match_policy' in draft) draft.attack_match_policy = cleanEnum(draft.attack_match_policy, ['all', 'same_dex', 'other_dex'], 'all');
  if ('battle_mode' in draft) draft.battle_mode = cleanEnum(draft.battle_mode, ['casual', 'ranked_raids'], 'casual');
  if ('sort_by' in draft) draft.sort_by = cleanEnum(draft.sort_by, ['points', 'volume_usd', 'trophies', 'pnl_usd', 'gold'], 'points');
  if ('scoring_mode' in draft) draft.scoring_mode = cleanEnum(draft.scoring_mode, ['live', 'daily_pool'], 'live');

  for (const field of ['start_at', 'end_at', 'registration_opens_at', 'registration_closes_at', 'daily_pool_enabled_at']) {
    if (field in draft) draft[field] = cleanDate(draft[field]);
  }
  for (const field of [
    'preregistration_enabled', 'registration_require_twitter', 'freeze_trophies',
    'seeker_only', 'rewards_in_cop', 'ranked_altar_bonus_enabled',
  ]) {
    if (field in draft) draft[field] = cleanBoolean(draft[field]);
  }
  for (const field of ['gold_boost', 'seeker_gold_boost', 'trophy_boost']) {
    if (field in draft) draft[field] = clampNumber(draft[field], 0, 100, 1);
  }
  if ('shield_hours' in draft) draft.shield_hours = draft.shield_hours === null ? null : clampNumber(draft.shield_hours, 0, 720, 0);
  if ('min_town_hall_level' in draft) draft.min_town_hall_level = Math.floor(clampNumber(draft.min_town_hall_level, 0, 20, 0));
  if ('ranked_daily_attack_limit' in draft) draft.ranked_daily_attack_limit = Math.floor(clampNumber(draft.ranked_daily_attack_limit, 1, 100, 20));
  if ('ranked_shield_hours' in draft) draft.ranked_shield_hours = clampNumber(draft.ranked_shield_hours, 0, 168, 0);
  if ('ranked_max_defenses_per_day' in draft) draft.ranked_max_defenses_per_day = Math.floor(clampNumber(draft.ranked_max_defenses_per_day, 0, 100, 20));
  if ('daily_pool_points' in draft) draft.daily_pool_points = clampNumber(draft.daily_pool_points, 1, 1_000_000_000, 1000);
  if ('daily_pool_growth_pct' in draft) draft.daily_pool_growth_pct = clampNumber(draft.daily_pool_growth_pct, -99, 1000, 0);
  if ('daily_pool_award_time_utc' in draft) {
    const match = String(draft.daily_pool_award_time_utc || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    draft.daily_pool_award_time_utc = match ? `${match[1]}:${match[2]}` : '00:00';
  }
  if ('daily_pool_overrides' in draft) draft.daily_pool_overrides = normalizeDailyOverrides(draft.daily_pool_overrides);
  for (const field of ['points_trophy_weight', 'points_volume_weight', 'points_pnl_weight']) {
    if (field in draft) draft[field] = clampNumber(draft[field], 0, 100, 0);
  }
  if (['points_trophy_weight', 'points_volume_weight', 'points_pnl_weight'].some((field) => field in draft)) {
    const values = [
      clampNumber(draft.points_trophy_weight, 0, 100, 20),
      clampNumber(draft.points_volume_weight, 0, 100, 60),
      clampNumber(draft.points_pnl_weight, 0, 100, 20),
    ];
    const total = values.reduce((sum, value) => sum + value, 0);
    const normalized = total > 0 ? values.map((value) => Number((value * 100 / total).toFixed(4))) : [20, 60, 20];
    normalized[2] = Number((100 - normalized[0] - normalized[1]).toFixed(4));
    [draft.points_trophy_weight, draft.points_volume_weight, draft.points_pnl_weight] = normalized;
  }
  if ('prize_currency' in draft) draft.prize_currency = cleanText(draft.prize_currency || 'USD', 12).toUpperCase();
  if ('prize_tiers' in draft) draft.prize_tiers = normalizePrizeTiers(draft.prize_tiers);
  if ('reward_config' in draft) draft.reward_config = normalizeRewardConfig(draft.reward_config);
  if ('mega_config' in draft) {
    draft.mega_config = draft.mega_config && typeof draft.mega_config === 'object' && !Array.isArray(draft.mega_config)
      ? draft.mega_config
      : {};
  }
  return draft;
}

function safeDraftForPrompt(input) {
  let text = '{}';
  try { text = JSON.stringify(input && typeof input === 'object' ? input : {}); } catch {}
  if (text.length > MAX_CURRENT_DRAFT_CHARS) text = text.slice(0, MAX_CURRENT_DRAFT_CHARS);
  return text;
}

function systemPrompt(now = new Date()) {
  return [
    'You are the Clash of Perps Tournament Configuration Planner.',
    'You configure a tournament draft for an authenticated administrator. You do not have tools, database access, payout permissions, or permission to start/save/delete anything.',
    'Return one strict JSON object and no markdown. Shape: {"summary":"...","warnings":["..."],"draft":{...}}.',
    `Current UTC time: ${now.toISOString()}. All dates must be UTC in "YYYY-MM-DD HH:mm:ss" format.`,
    '',
    'Supported draft fields:',
    '- Identity: event_kind standard|lucky_raider, name, description.',
    `- DEX: dex_scope single|custom|all, dex, eligible_dexes. Supported DEX IDs: ${[...TOURNAMENT_DEXES].join(', ')}.`,
    '- Competition: mode individual|dex_vs_dex, team_score_by, team_prize_mode, team_prize_splits, team_member_reward_by, attack_match_policy.',
    '- Battle: battle_mode casual|ranked_raids. Ranked fields: ranked_daily_attack_limit 1..100, ranked_shield_hours 0..168, ranked_max_defenses_per_day 0..100, ranked_altar_bonus_enabled.',
    '- Schedule: start_at, end_at, preregistration_enabled, registration_opens_at, registration_closes_at, registration_require_twitter.',
    '- Eligibility/boosts: min_town_hall_level, seeker_only, gold_boost, seeker_gold_boost, trophy_boost, shield_hours, freeze_trophies.',
    '- Scoring: sort_by points|volume_usd|trophies|pnl_usd|gold, scoring_mode live|daily_pool, daily_pool_points, daily_pool_enabled_at, daily_pool_award_time_utc HH:MM, daily_pool_growth_pct, daily_pool_overrides, and three point weights summing to 100.',
    '- Rewards: prize_currency, prize_tiers, reward_config, rewards_in_cop.',
    '',
    'Daily rewards are reward_config.daily_pools. To split a tournament by days, return one daily pool per UTC reward day:',
    '{"enabled":true,"label":"Day 1","day_utc":"YYYY-MM-DD","volume_target_usd":10000,"volume_target_scope":"player","top_n":5,"metric":"points","rewards":[...],"payouts":[]}.',
    'volume_target_scope is "player" for a per-player qualification target or "tournament" for a global daily target.',
    'Reward shape: {"type":"money|points|amp|nft|custom","label":"...","unit":"...","currency":"USD","pool_amount":100,"winners":5,"preset":"top5_balanced","payouts":[{"rank":1,"amount":40}]}',
    'Final rewards are reward_config.final_pools with the same reward shape but no day_utc or volume target.',
    'Never invent a DEX, reward type, field, wallet, secret, URL, or unsupported capability.',
    'Preserve useful current draft values unless the administrator explicitly asks to change them.',
    'If information is missing, choose conservative operational defaults and report the assumption in warnings.',
    'Do not set status. The administrator controls whether the reviewed draft is saved or activated.',
  ].join('\n');
}

function userPrompt(prompt, currentDraft) {
  return [
    'Administrator request:',
    String(prompt || '').trim().slice(0, MAX_PROMPT_CHARS),
    '',
    'Current wizard draft:',
    safeDraftForPrompt(currentDraft),
    '',
    'Produce a complete, internally consistent draft. Include every explicitly requested daily reward day and volume target.',
  ].join('\n');
}

function extractJson(content) {
  const raw = Array.isArray(content)
    ? content.map((item) => typeof item === 'string' ? item : item?.text || '').join('')
    : String(content || '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || raw;
  const start = candidate.indexOf('{');
  if (start < 0) throw new Error('AI response did not contain a JSON object');
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end <= start) throw new Error('AI response contained an incomplete JSON object');
  const parsed = JSON.parse(candidate.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI response JSON must be an object');
  return parsed;
}

function assertCompleteDraft(draft) {
  const missing = [];
  if (!draft.name) missing.push('name');
  if (!draft.start_at) missing.push('start_at');
  if (!draft.end_at) missing.push('end_at');
  if (!draft.dex && !draft.eligible_dexes?.length && draft.dex_scope !== 'all') {
    missing.push('dex');
  }
  if (missing.length) {
    throw new Error(`AI returned an incomplete tournament draft: missing ${missing.join(', ')}`);
  }
}

async function requestModel({ model, prompt, currentDraft, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const key = configuredOpenRouterKey();
  if (!key) {
    const error = new Error('OpenRouter is not configured on the server');
    error.status = 503;
    throw error;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  timeout.unref?.();
  try {
    const providers = resolveProviderOrder(process.env);
    const send = async (structuredOutput) => {
      const body = {
        model,
        temperature: 0.1,
        max_tokens: Math.max(800, Math.min(5000, Number(process.env.CLASH_TOURNAMENT_AI_MAX_TOKENS || 2600))),
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: userPrompt(prompt, currentDraft) },
        ],
      };
      if (structuredOutput) body.response_format = { type: 'json_object' };
      if (!isFreeModel(model) && providers.length) body.provider = { order: providers };

      const response = await fetchImpl(process.env.CLASH_TOURNAMENT_AI_URL || OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.CLASH_PUBLIC_URL || 'https://clashofperps.fun',
          'X-Title': 'Clash Tournament Planner',
        },
        body: JSON.stringify(body),
      });
      const responseText = await response.text();
      let payload = null;
      try { payload = responseText ? JSON.parse(responseText) : null; } catch { payload = { raw: responseText }; }
      if (!response.ok) {
        const error = new Error(payload?.error?.message || payload?.message || `OpenRouter HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? '';
      return extractJson(content);
    };

    try {
      return await send(true);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      const unsupportedStructuredOutput = error?.status === 400
        && /(response.?format|structured|json.?mode|unsupported parameter)/.test(message);
      if (!unsupportedStructuredOutput) throw error;
      return send(false);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function generateTournamentDraft(options = {}) {
  const prompt = String(options.prompt || '').trim();
  if (prompt.length < 8) {
    const error = new Error('Describe the tournament in at least 8 characters');
    error.status = 400;
    throw error;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    const error = new Error(`Tournament AI prompt is limited to ${MAX_PROMPT_CHARS} characters`);
    error.status = 400;
    throw error;
  }

  const failures = [];
  for (const model of (options.models?.length ? unique(options.models) : modelChain())) {
    try {
      const parsed = await requestModel({
        model,
        prompt,
        currentDraft: options.currentDraft,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      });
      const draft = normalizeDraft(parsed);
      if (!Object.keys(draft).length) throw new Error('AI returned an empty tournament draft');
      assertCompleteDraft(draft);
      return {
        ok: true,
        model,
        summary: cleanText(parsed.summary || 'Tournament draft prepared.', 500),
        warnings: (Array.isArray(parsed.warnings) ? parsed.warnings : [])
          .map((warning) => cleanText(warning, 240))
          .filter(Boolean)
          .slice(0, 20),
        draft,
      };
    } catch (error) {
      failures.push({ model, error: cleanText(error?.message || 'Unknown model error', 240) });
    }
  }
  const error = new Error(`Tournament AI failed across ${failures.length} model${failures.length === 1 ? '' : 's'}`);
  error.status = 502;
  error.failures = failures;
  throw error;
}

module.exports = {
  MAX_PROMPT_CHARS,
  generateTournamentDraft,
  modelChain,
  normalizeDraft,
  normalizeRewardConfig,
  extractJson,
  systemPrompt,
};
