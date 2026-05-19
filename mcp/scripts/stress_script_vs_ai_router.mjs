import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const hermesClient = require('../../server/hermes_client.js');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');
loadEnvFile(path.join(ROOT, '.env'));
loadEnvFile(path.join(ROOT, 'web', '.env'));
loadEnvFile(path.join(ROOT, 'hermes-orchestrator', '.env'));

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = process.argv[2] || process.env.SCRIPT_VS_AI_MODEL || 'qwen/qwen3-30b-a3b-instruct-2507:nitro';
const PROVIDER_ORDER = String(process.env.CLASH_HERMES_PROVIDER_ORDER || 'cerebras')
  .split(/[,;\s]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const cases = [
  {
    message: 'open long BTC with 10 USDC at 5x',
    expected_tool: 'decibel_place_order',
    history: [],
  },
  {
    message: 'long ETH 25 dollars 3x',
    expected_tool: 'decibel_place_order',
    history: [],
  },
  {
    message: 'short SOL with 12 USDC 2x',
    expected_tool: 'decibel_place_order',
    history: [],
  },
  {
    message: 'buy APT notional 50',
    expected_tool: 'decibel_place_order',
    history: [],
  },
  {
    message: 'sell BTC limit at 80000 with 20 USDC',
    expected_tool: 'decibel_place_order',
    history: [],
  },
  {
    message: 'open long on DOGE 5x for all my money',
    expected_tool: 'decibel_place_order',
    history: [],
  },
  {
    message: 'відкрий лонг BTC на 10% мого балансу з 5 плечем',
    expected_tool: 'decibel_place_order',
    history: [],
  },
  {
    message: 'открой шорт SOL на все деньги 3x',
    expected_tool: 'decibel_place_order',
    history: [],
  },
  {
    message: 'close my BTC position',
    expected_tool: 'decibel_close_position',
    history: [],
  },
  {
    message: 'закрий позу',
    expected_tool: 'decibel_close_position',
    history: [
      { role: 'assistant', text: 'Done: SOL long opened with 100% USDC, 4x leverage, $20 notional.' },
    ],
  },
  {
    message: 'reduce ETH by 50 percent',
    expected_tool: 'decibel_close_position',
    history: [],
  },
  {
    message: 'open something interesting but conservative',
    expected_tool: 'decibel_place_order',
    history: [],
  },
  {
    message: 'show my Decibel account',
    expected_tool: 'decibel_get_account',
    history: [],
  },
  {
    message: 'attack egor4042007',
    expected_tool: 'execute_ai_attack_plan',
    history: [],
  },
  {
    message: 'collect my game resources',
    expected_tool: 'collect_resources',
    history: [],
  },
];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function firstExpectedTool(intent) {
  const tools = Array.isArray(intent?.expected_tools) ? intent.expected_tools : [];
  return tools[tools.length - 1] || tools[0] || null;
}

function scriptPlan(testCase) {
  const started = performance.now();
  const intent = hermesClient.classifyGameIntent(testCase.message);
  const tool = firstExpectedTool(intent);
  const args = {};
  const elapsed = performance.now() - started;
  return {
    ok: tool === testCase.expected_tool,
    elapsed_ms: elapsed,
    tool,
    args,
    intent: intent?.kind || null,
    mode: 'intent_classifier_hint',
  };
}

function buildAiPrompt(testCase) {
  const historyText = testCase.history?.length
    ? testCase.history.map((item) => `${item.role}: ${item.text}`).join('\n')
    : 'none';
  return [
    'You are the ClashHermes tool router. Convert the player message into exactly one MCP tool call JSON.',
    'Return ONLY valid compact JSON with this shape: {"tool":"tool_name","args":{...},"confidence":0.0}.',
    'Allowed tools: decibel_place_order, decibel_close_position, decibel_get_account, decibel_get_markets, execute_ai_attack_plan, collect_resources, place_building, upgrade_building, load_troops.',
    'Rules:',
    '- For Decibel open orders infer symbol, side, leverage, notional_usd or collateral_pct.',
    '- "all my money", "all balance", Ukrainian/Russian equivalents mean collateral_pct 100.',
    '- If closing and no symbol is in the message, infer the last opened symbol from history.',
    '- "open something interesting/conservative" means decibel_place_order BTC long, collateral_pct 10, leverage 2, autonomous_default true.',
    '- For targeted game attacks put target_player_name in args.',
    '- Do not ask clarifying questions in this benchmark.',
    '',
    `Recent history: ${historyText}`,
    `Player message: ${testCase.message}`,
  ].join('\n');
}

function parseAiJson(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function aiPlan(testCase) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is missing');
  }
  const started = performance.now();
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://clashofperps.fun',
      'X-Title': 'ClashHermes Router Benchmark',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Return strict JSON only. No markdown. No prose.' },
        { role: 'user', content: buildAiPrompt(testCase) },
      ],
      temperature: 0,
      max_tokens: 220,
      provider: PROVIDER_ORDER.length ? { order: PROVIDER_ORDER, allow_fallbacks: true } : undefined,
    }),
  });
  const elapsed = performance.now() - started;
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    return {
      ok: false,
      elapsed_ms: elapsed,
      status: response.status,
      error: json?.error?.message || json?.message || text.slice(0, 300),
      tool: null,
      args: {},
    };
  }
  const output = json?.choices?.[0]?.message?.content || '';
  const parsed = parseAiJson(output);
  return {
    ok: parsed?.tool === testCase.expected_tool,
    elapsed_ms: elapsed,
    status: response.status,
    tool: parsed?.tool || null,
    args: parsed?.args || {},
    raw: output,
    usage: json?.usage || null,
  };
}

async function main() {
  const scriptStarted = performance.now();
  const scriptRows = cases.map((testCase) => ({ message: testCase.message, expected_tool: testCase.expected_tool, ...scriptPlan(testCase) }));
  const scriptTotalMs = performance.now() - scriptStarted;

  const aiRows = [];
  const aiStarted = performance.now();
  for (const testCase of cases) {
    const row = await aiPlan(testCase);
    aiRows.push({ message: testCase.message, expected_tool: testCase.expected_tool, ...row });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const aiTotalMs = performance.now() - aiStarted;

  const scriptTimes = scriptRows.map((row) => row.elapsed_ms);
  const aiTimes = aiRows.map((row) => row.elapsed_ms);
  const summary = {
    model: MODEL,
    provider_order: PROVIDER_ORDER,
    cases: cases.length,
    script: {
      total_ms: roundMs(scriptTotalMs),
      avg_ms: roundMs(scriptTimes.reduce((a, b) => a + b, 0) / scriptTimes.length),
      p50_ms: roundMs(percentile(scriptTimes, 50)),
      p90_ms: roundMs(percentile(scriptTimes, 90)),
      ok: scriptRows.filter((row) => row.ok).length,
      failed: scriptRows.filter((row) => !row.ok).length,
    },
    ai: {
      total_ms: roundMs(aiTotalMs),
      avg_ms: roundMs(aiTimes.reduce((a, b) => a + b, 0) / aiTimes.length),
      p50_ms: roundMs(percentile(aiTimes, 50)),
      p90_ms: roundMs(percentile(aiTimes, 90)),
      ok: aiRows.filter((row) => row.ok).length,
      failed: aiRows.filter((row) => !row.ok).length,
    },
    ratio_ai_total_vs_script_total: roundMs(aiTotalMs / Math.max(1, scriptTotalMs)),
    rows: cases.map((testCase, index) => ({
      message: testCase.message,
      expected_tool: testCase.expected_tool,
      script_tool: scriptRows[index].tool,
      script_mode: scriptRows[index].mode,
      script_ms: roundMs(scriptRows[index].elapsed_ms),
      script_ok: scriptRows[index].ok,
      ai_tool: aiRows[index].tool,
      ai_ms: roundMs(aiRows[index].elapsed_ms),
      ai_ok: aiRows[index].ok,
      ai_error: aiRows[index].error || null,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
