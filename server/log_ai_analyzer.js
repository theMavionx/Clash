const fs = require('fs');
const path = require('path');
const db = require('./db');
const { resolveModelChain } = require('../hermes-orchestrator/src/clash_agent_settings.cjs');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_LOG_LIMIT = 450;
const MAX_FILE_LOG_BYTES = 80_000;
const MAX_EVIDENCE_CHARS = 75_000;
const REPORT_SCHEMA_VERSION = 'clash-admin-log-ai-v1';
const LOCAL_ANALYZER_MODEL = 'local/incident-cluster-v1';
const DEFAULT_MODEL_MAX_TOKENS = 3000;

let schedulerTimer = null;
let runningPromise = null;

function sqliteDate(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function safeJsonParse(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function trimText(value, max = 1200) {
  if (value == null) return value;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}...[truncated ${text.length - max} chars]` : text;
}

function compactValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') return trimText(value, depth > 1 ? 500 : 1400);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, depth > 1 ? 12 : 30).map((item) => compactValue(item, depth + 1));
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/token|secret|password|private|api[_-]?key/i.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = compactValue(raw, depth + 1);
  }
  return out;
}

function tableExists(name) {
  return !!db.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(name);
}

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || process.env.CLASH_OPENROUTER_API_KEY || '';
}

function getModel() {
  return getModels()[0];
}

function getModels() {
  const explicit = String(process.env.CLASH_LOG_AI_MODEL || '').trim();
  const resolved = explicit ? [explicit] : resolveModelChain(process.env);
  return Array.from(new Set([
    ...resolved,
    process.env.CLASH_HERMES_PRIMARY_MODEL,
    'openai/gpt-oss-120b',
  ].map((value) => String(value || '').trim()).filter(Boolean)));
}

function collectRows(windowStart, windowEnd, limit = DEFAULT_LOG_LIMIT) {
  const args = [windowStart, windowEnd];
  const out = {
    client_errors: [],
    client_warnings: [],
    hermes_failures: [],
    mcp_failures: [],
    replay_telemetry: [],
    feedback_problems: [],
  };

  if (tableExists('client_logs')) {
    out.client_errors = db.db.prepare(`
      SELECT cl.id, cl.created_at, cl.level, cl.source, cl.url, cl.message, cl.stack, cl.payload,
             p.name AS player_name, p.dex AS player_dex, p.wallet AS player_wallet
      FROM client_logs cl
      LEFT JOIN players p ON p.id = cl.player_id
      WHERE cl.created_at >= ? AND cl.created_at < ?
        AND lower(cl.level) IN ('error', 'onerror', 'unhandledrejection')
      ORDER BY cl.id DESC
      LIMIT ?
    `).all(...args, limit).map(normalizeClientLogRow);

    out.client_warnings = db.db.prepare(`
      SELECT cl.id, cl.created_at, cl.level, cl.source, cl.url, cl.message, cl.stack, cl.payload,
             p.name AS player_name, p.dex AS player_dex, p.wallet AS player_wallet
      FROM client_logs cl
      LEFT JOIN players p ON p.id = cl.player_id
      WHERE cl.created_at >= ? AND cl.created_at < ?
        AND lower(cl.level) = 'warn'
      ORDER BY cl.id DESC
      LIMIT ?
    `).all(...args, Math.min(150, limit)).map(normalizeClientLogRow);
  }

  if (tableExists('hermes_chat_events')) {
    out.hermes_failures = db.db.prepare(`
      SELECT id, created_at, player_name, event_type, intent, status, duration_ms, model,
             error, request_preview, response_preview, attempts_json
      FROM hermes_chat_events
      WHERE created_at >= ? AND created_at < ?
        AND (lower(status) NOT IN ('ok', 'success') OR error IS NOT NULL)
      ORDER BY id DESC
      LIMIT ?
    `).all(...args, Math.min(180, limit)).map((row) => ({
      ...row,
      attempts_json: safeJsonParse(row.attempts_json, row.attempts_json),
    }));
  }

  if (tableExists('mcp_events')) {
    out.mcp_failures = db.db.prepare(`
      SELECT me.id, me.created_at, me.tool, me.status, me.duration_ms, me.error,
             me.input_json, me.output_json, me.metadata_json, p.name AS player_name, p.dex AS player_dex
      FROM mcp_events me
      LEFT JOIN players p ON p.id = me.player_id
      WHERE me.created_at >= ? AND me.created_at < ?
        AND (lower(me.status) NOT IN ('ok', 'success') OR me.error IS NOT NULL)
      ORDER BY me.id DESC
      LIMIT ?
    `).all(...args, Math.min(220, limit)).map((row) => ({
      ...row,
      input_json: safeJsonParse(row.input_json, row.input_json),
      output_json: safeJsonParse(row.output_json, row.output_json),
      metadata_json: safeJsonParse(row.metadata_json, row.metadata_json),
    }));
  }

  if (tableExists('replay_telemetry')) {
    out.replay_telemetry = db.db.prepare(`
      SELECT id, created_at, player_id, battle_session_id, replay_label, attacker_name,
             expected_result, expected_duration, actual_elapsed, actual_wall_elapsed, summary
      FROM replay_telemetry
      WHERE created_at >= ? AND created_at < ?
      ORDER BY id DESC
      LIMIT ?
    `).all(...args, Math.min(120, limit)).map((row) => ({
      ...row,
      summary: safeJsonParse(row.summary, row.summary),
    }));
  }

  if (tableExists('user_feedback')) {
    out.feedback_problems = db.db.prepare(`
      SELECT uf.id, uf.created_at, uf.kind, uf.message, uf.contact_type, uf.page_url,
             p.name AS player_name, p.dex AS player_dex, p.wallet AS player_wallet
      FROM user_feedback uf
      LEFT JOIN players p ON p.id = uf.player_id
      WHERE uf.created_at >= ? AND uf.created_at < ?
        AND lower(uf.kind) = 'problem'
      ORDER BY uf.id DESC
      LIMIT ?
    `).all(...args, Math.min(120, limit));
  }

  return out;
}

function normalizeClientLogRow(row) {
  return {
    ...row,
    message: trimText(row.message, 1600),
    stack: row.stack ? trimText(row.stack, 1800) : null,
    payload: compactValue(safeJsonParse(row.payload, row.payload ? trimText(row.payload, 1600) : null)),
  };
}

function readRecentFileLogs(windowStartDate, windowEndDate) {
  const root = path.resolve(__dirname, '..');
  const candidates = [
    '.tmp-local-server-4000.err.log',
    '.tmp-local-server-4000.out.log',
    '.tmp-codex-server-now.err.log',
    '.tmp-codex-server-now.out.log',
    '.tmp-local-futures-3999.err.log',
    '.tmp-local-futures-3999.out.log',
  ];
  const rows = [];
  for (const rel of candidates) {
    const file = path.join(root, rel);
    try {
      const stat = fs.statSync(file);
      if (stat.mtime < windowStartDate || stat.mtime > new Date(windowEndDate.getTime() + 6 * 3600_000)) continue;
      const fd = fs.openSync(file, 'r');
      try {
        const len = Math.min(stat.size, MAX_FILE_LOG_BYTES);
        const buffer = Buffer.alloc(len);
        fs.readSync(fd, buffer, 0, len, Math.max(0, stat.size - len));
        const text = buffer.toString('utf8');
        const interesting = text
          .split(/\r?\n/)
          .filter((line) => /error|exception|unhandled|failed|warn|timeout|econn|abort/i.test(line))
          .slice(-80)
          .map((line) => trimText(line, 800));
        rows.push({ file: rel, mtime: stat.mtime.toISOString(), lines: interesting });
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // Local log files are best-effort; SQLite sources are authoritative.
    }
  }
  return rows;
}

function compactSourcesForPrompt(sources, fileLogs) {
  const compacted = {
    sources: compactValue(sources),
    file_logs: compactValue(fileLogs),
  };
  let text = JSON.stringify(compacted, null, 2);
  if (text.length <= MAX_EVIDENCE_CHARS) return text;

  const smallerSources = {};
  for (const [key, rows] of Object.entries(sources)) {
    smallerSources[key] = Array.isArray(rows)
      ? rows.slice(0, 40).map((row) => compactValue(row, 1))
      : compactValue(rows, 1);
  }
  text = JSON.stringify({
    truncated: true,
    reason: `Evidence exceeded ${MAX_EVIDENCE_CHARS} chars; kept first 40 compact rows per source.`,
    sources: smallerSources,
    file_logs: fileLogs.map((item) => ({
      file: item.file,
      mtime: item.mtime,
      lines: item.lines.slice(-30),
    })),
  }, null, 2);
  return text.length > MAX_EVIDENCE_CHARS
    ? `${text.slice(0, MAX_EVIDENCE_CHARS)}\n...[evidence payload truncated for model context]`
    : text;
}

function sourceCounts(sources, fileLogs) {
  return {
    client_errors: sources.client_errors.length,
    client_warnings: sources.client_warnings.length,
    hermes_failures: sources.hermes_failures.length,
    mcp_failures: sources.mcp_failures.length,
    replay_telemetry: sources.replay_telemetry.length,
    feedback_problems: sources.feedback_problems.length,
    file_logs: fileLogs.reduce((sum, item) => sum + item.lines.length, 0),
  };
}

function scalarCount(sql, args) {
  return Number(db.db.prepare(sql).get(...args)?.count || 0);
}

function collectSourceCounts(windowStart, windowEnd, fileLogs = []) {
  const args = [windowStart, windowEnd];
  const counts = {
    client_errors: 0,
    client_warnings: 0,
    hermes_failures: 0,
    mcp_failures: 0,
    replay_telemetry: 0,
    feedback_problems: 0,
    file_logs: fileLogs.reduce((sum, item) => sum + item.lines.length, 0),
  };
  if (tableExists('client_logs')) {
    counts.client_errors = scalarCount(`
      SELECT COUNT(*) AS count FROM client_logs
      WHERE created_at >= ? AND created_at < ?
        AND lower(level) IN ('error', 'onerror', 'unhandledrejection')
    `, args);
    counts.client_warnings = scalarCount(`
      SELECT COUNT(*) AS count FROM client_logs
      WHERE created_at >= ? AND created_at < ? AND lower(level) = 'warn'
    `, args);
  }
  if (tableExists('hermes_chat_events')) {
    counts.hermes_failures = scalarCount(`
      SELECT COUNT(*) AS count FROM hermes_chat_events
      WHERE created_at >= ? AND created_at < ?
        AND (lower(status) NOT IN ('ok', 'success') OR error IS NOT NULL)
    `, args);
  }
  if (tableExists('mcp_events')) {
    counts.mcp_failures = scalarCount(`
      SELECT COUNT(*) AS count FROM mcp_events
      WHERE created_at >= ? AND created_at < ?
        AND (lower(status) NOT IN ('ok', 'success') OR error IS NOT NULL)
    `, args);
  }
  if (tableExists('replay_telemetry')) {
    counts.replay_telemetry = scalarCount(`
      SELECT COUNT(*) AS count FROM replay_telemetry
      WHERE created_at >= ? AND created_at < ?
    `, args);
  }
  if (tableExists('user_feedback')) {
    counts.feedback_problems = scalarCount(`
      SELECT COUNT(*) AS count FROM user_feedback
      WHERE created_at >= ? AND created_at < ? AND lower(kind) = 'problem'
    `, args);
  }
  return counts;
}

function normalizedIncidentSignature(row) {
  return String(row?.message || row?.error || row?.status || 'unknown failure')
    .replace(/0x[a-f0-9]{16,}/gi, '0x…')
    .replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, '<wallet>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function classifyLocalIncident(signature, level = 'error') {
  const text = String(signature || '').toLowerCase();
  if (/audio.*not allowed|bridge not ready|auto_connecting|signal is aborted/.test(text)) {
    return { severity: 'noise', area: 'client', action: 'Keep classified as transient startup/browser noise.' };
  }
  if (/work\.(wasm|pck)|lazy\.chunk|runtimeerror: unreachable/.test(text)) {
    return { severity: 'high', area: 'client', action: 'Verify immutable export assets, CDN/cache headers, and the current release smoke test.' };
  }
  if (/price feed unavailable|unauthorized|builder.*mismatch|failed to (place|close|withdraw)|liquidat/.test(text)) {
    return { severity: 'high', area: 'trading', action: 'Reproduce the affected exchange request and validate its upstream response and fallback path.' };
  }
  if (/\b429\b|too many requests|rate limit|\b500\b|timed out|failed to fetch|material.*null|pool exhausted/.test(text)) {
    return { severity: 'medium', area: /rpc|trade|price|bulk|dex/.test(text) ? 'trading' : 'client', action: 'Inspect the endpoint/component named by the signature and verify retry, cooldown, and fallback behavior.' };
  }
  if (String(level).toLowerCase() === 'warn') {
    return { severity: 'low', area: 'client', action: 'Monitor recurrence and promote only if it becomes player-facing.' };
  }
  return { severity: 'medium', area: 'unknown', action: 'Reproduce with the evidence id and add a narrower diagnostic around the failing operation.' };
}

function buildLocalIncidentReport({ windowStart, windowEnd, sources, counts, providerError = '' }) {
  const grouped = new Map();
  for (const sourceName of ['client_errors', 'client_warnings', 'hermes_failures', 'mcp_failures']) {
    for (const row of sources[sourceName] || []) {
      const signature = normalizedIncidentSignature(row);
      if (!signature) continue;
      const key = `${sourceName}:${signature}`;
      const current = grouped.get(key) || {
        signature,
        sourceName,
        level: row.level || (sourceName.includes('warning') ? 'warn' : 'error'),
        count: 0,
        evidenceIds: [],
      };
      current.count += 1;
      if (current.evidenceIds.length < 8 && row.id != null) {
        const table = sourceName.startsWith('client_') ? 'client_logs'
          : sourceName === 'hermes_failures' ? 'hermes_chat_events'
            : 'mcp_events';
        current.evidenceIds.push(`${table}:${row.id}`);
      }
      grouped.set(key, current);
    }
  }
  const top = Array.from(grouped.values())
    .map((item) => ({ ...item, classification: classifyLocalIncident(item.signature, item.level) }))
    .sort((a, b) => {
      const rank = { critical: 5, high: 4, medium: 3, low: 2, noise: 1 };
      return (rank[b.classification.severity] - rank[a.classification.severity]) || (b.count - a.count);
    })
    .slice(0, 10);
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, noise: 0 };
  for (const item of top) severityCounts[item.classification.severity] += 1;
  const weighted = severityCounts.critical * 25 + severityCounts.high * 14 + severityCounts.medium * 7 + severityCounts.low * 2;
  const healthScore = Math.max(0, Math.min(100, 100 - weighted));
  const topIncidents = top.map((item) => ({
    title: `${item.signature}${item.count > 1 ? ` (${item.count} sampled)` : ''}`,
    severity: item.classification.severity,
    sources: [item.sourceName],
    evidence_ids: item.evidenceIds,
    affected_area: item.classification.area,
    root_cause_confidence: 'unknown',
    summary: `Observed ${item.count} matching row(s) in the bounded evidence sample. Full-window totals are reported separately.`,
    recommended_action: item.classification.action,
  }));
  const providerNote = providerError
    ? `OpenRouter analysis was unavailable (${trimText(providerError, 300)}). This deterministic report keeps the daily operational window usable.`
    : 'This deterministic report was requested without an external model.';
  const reportJson = {
    schema: REPORT_SCHEMA_VERSION,
    health_score: healthScore,
    severity_counts: severityCounts,
    top_incidents: topIncidents,
    watchlist: [
      'client error and warning totals by source/message signature',
      'HTTP 401/429/5xx rates for trading and Solana RPC endpoints',
      'Godot export asset-load and renderer errors after each release',
      'Hermes and MCP failure counts',
    ],
    missing_evidence: providerError ? ['External model synthesis unavailable; local clustering was used.'] : [],
    analyzer: { mode: 'local_fallback', provider_error: providerError || null },
  };
  const incidentLines = topIncidents.length
    ? topIncidents.map((item) => `- **${item.severity.toUpperCase()}** ${item.title}`).join('\n')
    : '- No sampled error clusters were found in this window.';
  const markdown = [
    '# Clash Daily Operations Report',
    '',
    '## 1. Executive Summary',
    '',
    `${providerNote} Health score: **${healthScore}/100**.`,
    '',
    '## 2. Severity Breakdown',
    '',
    `Critical ${severityCounts.critical}; high ${severityCounts.high}; medium ${severityCounts.medium}; low ${severityCounts.low}; noise ${severityCounts.noise}.`,
    '',
    '## 3. Incident Clusters',
    '',
    incidentLines,
    '',
    '## 4. AI/Hermes/MCP Health',
    '',
    `Hermes failures: ${counts.hermes_failures}; MCP failures: ${counts.mcp_failures}.`,
    '',
    '## 5. Client/Game Health',
    '',
    `Client errors: ${counts.client_errors}; client warnings: ${counts.client_warnings}; replay rows: ${counts.replay_telemetry}.`,
    '',
    '## 6. Trading/NFT/Bridge Risk',
    '',
    'Review high-severity trading signatures above; no financial result is inferred without matching server or on-chain evidence.',
    '',
    '## 7. Noise and Expected Failures',
    '',
    'Browser autoplay, startup bridge readiness, aborted navigation requests, and wallet auto-connect events are treated as noise unless paired with a user-facing failure.',
    '',
    '## 8. Recommended Fix Queue',
    '',
    topIncidents.filter((item) => item.severity !== 'noise').slice(0, 6)
      .map((item, index) => `${index + 1}. ${item.recommended_action}`).join('\n') || '1. Continue monitoring.',
    '',
    '## 9. Queries and Watchlist',
    '',
    `Window: ${windowStart} to ${windowEnd} UTC. Use the evidence ids above to inspect exact rows.`,
    '',
    '```json',
    JSON.stringify(reportJson, null, 2),
    '```',
  ].join('\n');
  return { markdown, jsonReport: reportJson };
}

function buildAnalysisPrompt({ windowStart, windowEnd, sources, fileLogs, counts }) {
  return [
    '# Clash of Perps Daily AI Log Analyst',
    '',
    'You are the private operations AI for Clash of Perps, a Godot 4.6.1 + Node.js + SQLite game with trading integrations and Hermes/OpenRouter AI chat.',
    'Your task is to analyze the previous 24-hour operational window and produce an admin-grade incident report.',
    '',
    '## Absolute Scope',
    `Window start UTC: ${windowStart}`,
    `Window end UTC: ${windowEnd}`,
    'Analyze only evidence inside this prompt. Do not invent incidents, users, stack traces, root causes, counts, or fixes.',
    'If evidence is inconclusive, say exactly what is missing and what log/event would prove the cause.',
    'Treat client logs, Hermes chat events, MCP events, replay telemetry, user feedback, and local server log snippets as separate evidence streams.',
    '',
    '## Product Context',
    '- Client: browser React shell hosting a Godot export.',
    '- Game server: Express API with SQLite persistence.',
    '- Admin: server-rendered /api/admin/panel.',
    '- AI: Hermes per-player agent through OpenRouter; model routing follows CLASH_HERMES_MODEL_CHAIN.',
    '- Trading DEXes include Pacifica, Avantis, Decibel, GMX, Monad/Perpl, Phoenix, Hyperliquid, RiseX, Nado, Hibachi, Hotstuff, GRVT, and Katana.',
    '- Important systems: auth/login by wallet, client-log ingestion, AI chat, MCP tool calls, replay verification, NFT/bridge/shop, futures trading rewards.',
    '',
    '## Analysis Requirements',
    '1. Group errors by likely incident, not by raw row id.',
    '2. Separate confirmed root cause, likely root cause, and unknown cause.',
    '3. Find repeated signatures: same message, same stack top, same endpoint, same DEX, same MCP tool, same model, same player group, same browser or wallet provider.',
    '4. Prioritize severity using: player-facing breakage > money/trading/NFT risk > AI action failure > admin-only issue > noisy/transient warning.',
    '5. For every high/medium severity item, include evidence ids and exact source names.',
    '6. Identify which errors are probably expected/noise and justify why.',
    '7. Point out regressions that look new or clustered in time.',
    '8. Suggest concrete engineering actions: file/module to inspect if inferable, endpoint/tool to test, logs to add, guard/rate-limit/retry to implement, and validation steps.',
    '9. Include a next-24h watchlist with metrics or query filters admins should monitor.',
    '10. Do not expose secrets. Redact wallets to first 6 + last 4 if you quote them.',
    '',
    '## Output Format',
    'Return Markdown first, then a fenced JSON block.',
    'Markdown sections must be exactly:',
    '1. Executive Summary',
    '2. Severity Breakdown',
    '3. Incident Clusters',
    '4. AI/Hermes/MCP Health',
    '5. Client/Game Health',
    '6. Trading/NFT/Bridge Risk',
    '7. Noise and Expected Failures',
    '8. Recommended Fix Queue',
    '9. Queries and Watchlist',
    '',
    'The JSON block must be valid JSON with this shape:',
    JSON.stringify({
      schema: REPORT_SCHEMA_VERSION,
      health_score: '0-100 integer',
      severity_counts: { critical: 0, high: 0, medium: 0, low: 0, noise: 0 },
      top_incidents: [{
        title: 'short title',
        severity: 'critical|high|medium|low|noise',
        sources: ['client_errors'],
        evidence_ids: ['client_logs:123'],
        affected_area: 'auth|ai|mcp|client|trading|nft|bridge|battle|admin|unknown',
        root_cause_confidence: 'confirmed|likely|unknown',
        summary: 'what happened',
        recommended_action: 'specific next engineering action',
      }],
      watchlist: ['specific metric or query to monitor'],
      missing_evidence: ['what would improve confidence'],
    }, null, 2),
    '',
    '## Source Counts',
    JSON.stringify(counts, null, 2),
    '',
    '## Evidence Payload',
    compactSourcesForPrompt(sources, fileLogs),
  ].join('\n');
}

function extractJsonReport(text) {
  const match = String(text || '').match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  return safeJsonParse(match[1], null);
}

async function callOpenRouter(prompt, model, options = {}) {
  const key = getOpenRouterKey();
  if (!key) {
    const err = new Error('OPENROUTER_API_KEY is not configured');
    err.status = 503;
    throw err;
  }
  const response = await (options.fetchImpl || fetch)(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.CLASH_PUBLIC_URL || 'https://clashofperps.fun',
      'X-Title': 'Clash Admin Daily Log Analyst',
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: Number(options.maxTokens || process.env.CLASH_LOG_AI_MAX_TOKENS || DEFAULT_MODEL_MAX_TOKENS),
      messages: [
        {
          role: 'system',
          content: 'You are a senior production incident analyst. Be precise, evidence-based, and operationally useful.',
        },
        { role: 'user', content: prompt },
      ],
      provider: process.env.CLASH_HERMES_PROVIDER_ORDER
        ? { order: process.env.CLASH_HERMES_PROVIDER_ORDER.split(',').map((s) => s.trim()).filter(Boolean) }
        : undefined,
    }),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) {
    const err = new Error(json?.error?.message || json?.message || `OpenRouter HTTP ${response.status}`);
    err.status = response.status;
    err.body = json;
    throw err;
  }
  return json?.choices?.[0]?.message?.content || json?.output_text || text;
}

function isOpenRouterCreditError(error) {
  return /more credits|insufficient credits|can only afford|monthly budget|payment required/i.test(String(error?.message || error || ''));
}

async function callOpenRouterWithFallback(prompt, models, options = {}) {
  let lastError = null;
  for (const model of models) {
    try {
      const markdown = await (options.callProvider || callOpenRouter)(prompt, model, options);
      return { markdown, model };
    } catch (error) {
      lastError = error;
      if (isOpenRouterCreditError(error)) break;
    }
  }
  throw lastError || new Error('No OpenRouter model is configured');
}

function insertReport(row) {
  return db.db.prepare(`
    INSERT INTO ai_log_reports
      (window_start, window_end, status, model, prompt, report_markdown, report_json, source_counts, error, duration_ms, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.window_start,
    row.window_end,
    row.status,
    row.model || null,
    row.prompt || null,
    row.report_markdown || null,
    row.report_json || null,
    row.source_counts || null,
    row.error || null,
    row.duration_ms || null,
    row.completed_at || null
  ).lastInsertRowid;
}

function listReports(limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return db.db.prepare(`
    SELECT id, window_start, window_end, status, model, report_markdown, report_json,
           source_counts, error, duration_ms, created_at, completed_at
    FROM ai_log_reports
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit).map((row) => ({
    ...row,
    report_json: safeJsonParse(row.report_json, null),
    source_counts: safeJsonParse(row.source_counts, null),
  }));
}

function getReport(id) {
  const row = db.db.prepare(`SELECT * FROM ai_log_reports WHERE id = ?`).get(id);
  if (!row) return null;
  return {
    ...row,
    report_json: safeJsonParse(row.report_json, null),
    source_counts: safeJsonParse(row.source_counts, null),
  };
}

async function runLogAiAnalysis(options = {}) {
  if (runningPromise) return runningPromise;
  runningPromise = (async () => {
    const started = Date.now();
    const windowEndDate = options.windowEnd ? new Date(options.windowEnd) : new Date();
    const lookbackHours = Math.max(1, Math.min(168, Number(options.lookbackHours || DEFAULT_LOOKBACK_HOURS)));
    const windowStartDate = options.windowStart ? new Date(options.windowStart) : new Date(windowEndDate.getTime() - lookbackHours * 3600_000);
    const windowStart = sqliteDate(windowStartDate);
    const windowEnd = sqliteDate(windowEndDate);
    const models = options.model ? [options.model] : getModels();
    let model = models[0] || getModel();

    let prompt = '';
    let counts = null;
    try {
      const sources = collectRows(windowStart, windowEnd, Number(options.limit || DEFAULT_LOG_LIMIT));
      const fileLogs = readRecentFileLogs(windowStartDate, windowEndDate);
      counts = collectSourceCounts(windowStart, windowEnd, fileLogs);
      prompt = buildAnalysisPrompt({ windowStart, windowEnd, sources, fileLogs, counts });
      let markdown = '';
      let jsonReport = null;
      let providerError = '';
      try {
        const providerResult = await callOpenRouterWithFallback(prompt, models, options);
        markdown = providerResult.markdown;
        model = providerResult.model;
        jsonReport = extractJsonReport(markdown);
      } catch (error) {
        providerError = error?.message || String(error);
        const local = buildLocalIncidentReport({
          windowStart,
          windowEnd,
          sources,
          counts,
          providerError,
        });
        markdown = local.markdown;
        jsonReport = local.jsonReport;
        model = LOCAL_ANALYZER_MODEL;
      }
      const id = insertReport({
        window_start: windowStart,
        window_end: windowEnd,
        status: 'ok',
        model,
        prompt,
        report_markdown: markdown,
        report_json: jsonReport ? JSON.stringify(jsonReport) : null,
        source_counts: JSON.stringify(counts),
        error: providerError || null,
        duration_ms: Date.now() - started,
        completed_at: sqliteDate(new Date()),
      });
      return getReport(id);
    } catch (err) {
      const id = insertReport({
        window_start: windowStart,
        window_end: windowEnd,
        status: 'error',
        model,
        prompt,
        report_json: null,
        source_counts: counts ? JSON.stringify(counts) : null,
        error: err?.message || String(err),
        duration_ms: Date.now() - started,
        completed_at: sqliteDate(new Date()),
      });
      throw Object.assign(err, { report: getReport(id) });
    }
  })().finally(() => {
    runningPromise = null;
  });
  return runningPromise;
}

function msUntilNextUtcMidnight(now = new Date()) {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return Math.max(1000, next.getTime() - now.getTime());
}

function startDailyLogAiScheduler() {
  if (schedulerTimer || process.env.CLASH_LOG_AI_SCHEDULER === '0') return;
  const scheduleNext = () => {
    schedulerTimer = setTimeout(async () => {
      try {
        const end = new Date();
        await runLogAiAnalysis({
          windowEnd: end,
          windowStart: new Date(end.getTime() - DEFAULT_LOOKBACK_HOURS * 3600_000),
        });
      } catch (err) {
        console.warn('[log-ai] daily analysis failed:', err?.message || err);
      } finally {
        schedulerTimer = null;
        scheduleNext();
      }
    }, msUntilNextUtcMidnight());
    schedulerTimer.unref?.();
  };
  scheduleNext();
}

module.exports = {
  REPORT_SCHEMA_VERSION,
  buildAnalysisPrompt,
  collectRows,
  collectSourceCounts,
  buildLocalIncidentReport,
  getModel,
  getModels,
  listReports,
  getReport,
  runLogAiAnalysis,
  startDailyLogAiScheduler,
};
