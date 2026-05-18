import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const game = require('../../server/db.js');

const MCP_URL = process.env.CLASH_STRESS_MCP_URL || 'http://127.0.0.1:4100/mcp';
const MCP_HEALTH_URL = process.env.CLASH_STRESS_MCP_HEALTH_URL || 'http://127.0.0.1:4100/health';
const HERMES_HEALTH_URL = process.env.CLASH_STRESS_HERMES_HEALTH_URL || 'http://127.0.0.1:8600/health';
const BACKEND_PROBE_URL = process.env.CLASH_STRESS_BACKEND_PROBE_URL || 'http://127.0.0.1:4000/api/agent-events/pending';
const ATTACKS = Math.max(1, Math.floor(Number(process.env.CLASH_STRESS_ATTACKS || 50)));
const CONCURRENCY = Math.max(1, Math.floor(Number(process.env.CLASH_STRESS_CONCURRENCY || 6)));
const RUN_ID = process.env.CLASH_STRESS_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const PREFIX = `stress_ai_${RUN_ID}`;
const OUT_DIR = path.resolve(process.cwd(), '..', '.local-logs');
const OUT_FILE = path.join(OUT_DIR, `ai-mcp-stress-${RUN_ID}.json`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(values, p) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summary(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return { count: 0, min: null, p50: null, p90: null, p95: null, max: null, avg: null };
  return {
    count: clean.length,
    min: Math.min(...clean),
    p50: percentile(clean, 50),
    p90: percentile(clean, 90),
    p95: percentile(clean, 95),
    max: Math.max(...clean),
    avg: Math.round(clean.reduce((a, b) => a + b, 0) / clean.length),
  };
}

function parseJsonText(result) {
  const text = result?.content?.find?.((item) => item.type === 'text')?.text || result?.content?.[0]?.text || '';
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function callTool(token, name, args = {}) {
  const started = Date.now();
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'clash-ai-mcp-stress', version: '0.1.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args });
    return {
      ok: !result?.isError,
      duration_ms: Date.now() - started,
      payload: parseJsonText(result),
    };
  } catch (err) {
    return {
      ok: false,
      duration_ms: Date.now() - started,
      error: err?.message || String(err),
    };
  } finally {
    await client.close().catch(() => {});
  }
}

function placeOrThrow(playerId, type, x, z, grid = 0) {
  const result = game.placeBuilding(playerId, type, x, z, grid);
  if (result?.error) throw new Error(`place ${type} failed: ${result.error}`);
  return result;
}

function setResources(playerId, gold = 10000, wood = 10000, ore = 10000) {
  game.db.prepare('UPDATE players SET gold = ?, wood = ?, ore = ?, shield_until = NULL WHERE id = ?')
    .run(gold, wood, ore, playerId);
}

function ageProduction(playerId) {
  game.db.prepare(`
    UPDATE buildings
    SET last_collected_at = datetime('now', '-90 minutes')
    WHERE player_id = ? AND type IN ('mine', 'sawmill')
  `).run(playerId);
}

function preparePlayerBase(player, role, index) {
  setResources(player.id, 10000, 10000, 10000);
  placeOrThrow(player.id, 'town_hall', 10, 10, 0);
  placeOrThrow(player.id, 'mine', 2, 2, 0);
  placeOrThrow(player.id, 'sawmill', 6, 2, 0);
  placeOrThrow(player.id, 'barn', 2, 7, 0);
  const port = placeOrThrow(player.id, 'port', 2 + (index % 8), 0, 1);
  if (role === 'defender') {
    placeOrThrow(player.id, 'archer_tower', 8, 6, 0);
  }
  setResources(player.id, role === 'attacker' ? 10000 : 3000, 10000, 10000);
  ageProduction(player.id);
  if (role === 'attacker') {
    const ship = game.buyShip(player.id, port.id);
    if (ship?.error) throw new Error(`buy ship failed: ${ship.error}`);
    game.db.prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?')
      .run(JSON.stringify(['Mage', 'Mage', 'Knight']), JSON.stringify(['Mage', 'Mage', 'Knight']), port.id);
  }
}

function createStressAccount(name, role, index) {
  const existing = game.db.prepare('SELECT id, name, token FROM players WHERE name = ?').get(name);
  if (existing) return { player: existing, key: null, reused: true };
  const player = game.registerPlayer(name);
  preparePlayerBase(player, role, index);
  const key = role === 'attacker' ? game.createAiAgentKey(player.id, 'Stress MCP Agent').key : null;
  return { player, key, reused: false };
}

function setupStressPairs() {
  const pairs = [];
  for (let i = 0; i < ATTACKS; i++) {
    const suffix = String(i + 1).padStart(2, '0');
    const attacker = createStressAccount(`${PREFIX}_atk_${suffix}`, 'attacker', i);
    const defender = createStressAccount(`${PREFIX}_def_${suffix}`, 'defender', i);
    if (!attacker.key && attacker.reused) {
      const created = game.createAiAgentKey(attacker.player.id, 'Stress MCP Agent');
      attacker.key = created.key;
    }
    pairs.push({
      index: i + 1,
      attacker: attacker.player,
      defender: defender.player,
      key: attacker.key,
    });
  }
  return pairs;
}

async function probe(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    await res.text().catch(() => '');
    return { ok: res.status < 500, status: res.status, duration_ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), duration_ms: Date.now() - started };
  }
}

function startHealthSampler(samples, stopRef) {
  const urls = {
    mcp: MCP_HEALTH_URL,
    hermes: HERMES_HEALTH_URL,
    backend: BACKEND_PROBE_URL,
  };
  const tick = async () => {
    const at = new Date().toISOString();
    const entries = await Promise.all(Object.entries(urls).map(async ([name, url]) => [name, await probe(url)]));
    samples.push({ at, ...Object.fromEntries(entries) });
    if (!stopRef.stop) setTimeout(tick, 1000).unref?.();
  };
  tick();
}

async function runOne(pair) {
  const record = {
    index: pair.index,
    attacker: pair.attacker.name,
    defender: pair.defender.name,
    steps: {},
  };
  record.steps.get_base_state = await callTool(pair.key, 'get_base_state', { include_catalog: false });
  record.steps.collect_resources = await callTool(pair.key, 'collect_resources', {});
  record.steps.attack = await callTool(pair.key, 'execute_ai_attack_plan', {
    target_player_name: pair.defender.name,
    auto_tactics: true,
  });
  const attackPayload = record.steps.attack.payload || {};
  record.result = {
    ok: !!record.steps.attack.ok,
    error: attackPayload.error || record.steps.attack.error || null,
    battle_result: attackPayload.result || attackPayload.verified_result || attackPayload.claimed_result || null,
    enemy: attackPayload.enemy?.name || attackPayload.defender?.name || pair.defender.name,
    attack_cost_gold: attackPayload.attack_cost_gold ?? null,
    normal_attack_cost_gold: attackPayload.normal_attack_cost_gold ?? null,
    duration_sec: attackPayload.duration_sec ?? attackPayload.replay?.duration ?? null,
    loot: attackPayload.loot || null,
    casualties: attackPayload.casualties || null,
  };
  return record;
}

async function runPool(items, worker) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      results.push(await worker(item));
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => a.index - b.index);
}

const startedAt = Date.now();
fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`[stress] setting up ${ATTACKS} MCP attack pairs, run=${RUN_ID}`);
const pairs = setupStressPairs();
const healthSamples = [];
const stopRef = { stop: false };
startHealthSampler(healthSamples, stopRef);

console.log(`[stress] running ${ATTACKS} attacks with concurrency=${CONCURRENCY}`);
const results = await runPool(pairs, runOne);
stopRef.stop = true;
await sleep(1100);

const totalMs = Date.now() - startedAt;
const stepNames = ['get_base_state', 'collect_resources', 'attack'];
const stepStats = Object.fromEntries(stepNames.map((name) => [
  name,
  {
    ok: results.filter((r) => r.steps[name]?.ok).length,
    failed: results.filter((r) => !r.steps[name]?.ok).length,
    latency_ms: summary(results.map((r) => r.steps[name]?.duration_ms)),
  },
]));
const attacksOk = results.filter((r) => r.steps.attack?.ok).length;
const attackErrors = results
  .filter((r) => !r.steps.attack?.ok)
  .reduce((acc, r) => {
    const key = r.result.error || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
const outcomeCounts = results.reduce((acc, r) => {
  const key = r.result.battle_result || (r.steps.attack?.ok ? 'ok_unknown' : 'failed');
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const uptime = {};
for (const service of ['mcp', 'hermes', 'backend']) {
  const serviceSamples = healthSamples.map((s) => s[service]).filter(Boolean);
  uptime[service] = {
    samples: serviceSamples.length,
    ok: serviceSamples.filter((s) => s.ok).length,
    uptime_pct: serviceSamples.length ? Number(((serviceSamples.filter((s) => s.ok).length / serviceSamples.length) * 100).toFixed(2)) : null,
    latency_ms: summary(serviceSamples.map((s) => s.duration_ms)),
    statuses: serviceSamples.reduce((acc, s) => {
      const key = s.status ? String(s.status) : (s.ok ? 'ok' : 'error');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
}

const report = {
  run_id: RUN_ID,
  started_at: new Date(startedAt).toISOString(),
  finished_at: new Date().toISOString(),
  total_ms: totalMs,
  attacks_requested: ATTACKS,
  concurrency: CONCURRENCY,
  throughput_attacks_per_sec: Number((ATTACKS / (totalMs / 1000)).toFixed(2)),
  success: {
    attacks_ok: attacksOk,
    attacks_failed: ATTACKS - attacksOk,
    success_pct: Number(((attacksOk / ATTACKS) * 100).toFixed(2)),
  },
  outcomes: outcomeCounts,
  attack_errors: attackErrors,
  steps: stepStats,
  uptime,
  sample_failures: results.filter((r) => !r.steps.attack?.ok).slice(0, 10),
  sample_successes: results.filter((r) => r.steps.attack?.ok).slice(0, 5),
  results,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  run_id: report.run_id,
  total_ms: report.total_ms,
  success: report.success,
  outcomes: report.outcomes,
  steps: report.steps,
  uptime: report.uptime,
  out_file: OUT_FILE,
}, null, 2));
