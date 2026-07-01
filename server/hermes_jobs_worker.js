const os = require('os');
const db = require('./db');
const hermesClient = require('./hermes_client');
const hermesJobs = require('./hermes_jobs');
const aiQuota = require('./ai_quota');

const WORKER_ID = `${os.hostname()}:${process.pid}:${Date.now()}`;
const POLL_MS = Math.max(5_000, Math.min(300_000, Number(process.env.CLASH_HERMES_JOBS_POLL_MS || 30_000)));
const BATCH_SIZE = Math.max(1, Math.min(20, Number(process.env.CLASH_HERMES_JOBS_BATCH_SIZE || 3)));
const RUN_TIMEOUT_MS = Math.max(60_000, Math.min(600_000, Number(process.env.CLASH_HERMES_JOBS_RUN_TIMEOUT_MS || 240_000)));
const JOBS_ENABLED = process.env.CLASH_HERMES_JOBS_ENABLED !== '0' && db.AI_MCP_AGENT_ACCESS_ENABLED;

function preview(value, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function nextUtcDaySql() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0));
  return next.toISOString().replace('T', ' ').slice(0, 19);
}

function toolEventsBetween(playerId, startId) {
  return db.db.prepare(`
    SELECT id, tool, status, duration_ms, error, input_json, output_json, created_at
    FROM mcp_events
    WHERE player_id = ?
      AND id > ?
    ORDER BY id ASC
    LIMIT 200
  `).all(playerId, Number(startId || 0));
}

function parseJson(value, fallback = null) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function summarizeToolEvents(events) {
  return events.map((event) => ({
    id: event.id,
    tool: event.tool,
    status: event.status,
    duration_ms: event.duration_ms,
    error: event.error || null,
    created_at: event.created_at,
  }));
}

function summarizeActions(events) {
  return events
    .filter((event) => /^(decibel_place_order|decibel_close_position|decibel_cancel_order|decibel_set_leverage|decibel_set_tpsl)$/.test(String(event.tool || '')))
    .map((event) => ({
      id: event.id,
      tool: event.tool,
      status: event.status,
      error: event.error || null,
      output: parseJson(event.output_json, null),
    }));
}

function buildScheduledJobContext(job, run, dailyTrades) {
  const policy = job.policy || {};
  const symbols = Array.isArray(job.symbols) && job.symbols.length ? job.symbols : hermesJobs.DEFAULT_SYMBOLS;
  return [
    '## Scheduled Decibel Job Contract',
    'This is an autonomous scheduled job run, not a normal live chat turn.',
    `Job id: ${job.id}.`,
    `Run id: ${run.id}.`,
    `Mode: ${job.mode}.`,
    `Saved instruction: ${job.instruction}`,
    `Allowed symbols: ${symbols.join(', ')}.`,
    `Scan timeframe: ${policy.scan_timeframe || '1h'}. Lookback candles: ${policy.lookback_candles || 160}.`,
    `Max collateral per trade: $${policy.max_collateral_usd}.`,
    `Max balance percent per trade: ${policy.max_balance_pct}%.`,
    `Max leverage: ${policy.max_leverage}x.`,
    `Max slippage: ${policy.max_slippage_pct}%.`,
    `Max trades per day: ${policy.max_trades_per_day}. Trades already recorded today for this job: ${dailyTrades}.`,
    `Max open positions allowed by this job: ${policy.max_open_positions}.`,
    `Cooldown minutes after a trade: ${policy.cooldown_minutes}.`,
    `Allowed writes: open=${!!policy.allow_open}, close=${!!policy.allow_close}, tpsl=${!!policy.allow_tpsl}, cancel=${!!policy.allow_cancel}.`,
    `Scale-in allowed: ${!!policy.scale_in_allowed}.`,
    `Use client_order_id prefix exactly: job_${job.id.slice(0, 8)}_${run.id.slice(0, 8)} for any Decibel write tool.`,
    'Required first step: call decibel_market_scan with the allowed symbols, scan timeframe, and lookback from this context.',
    'If any scan has stale=true or blockers, do not trade that symbol.',
    'Monitor-only mode: do not call write tools under any circumstance.',
    'Ask-before-trade mode: do not call write tools; explain what trade would be considered.',
    'Auto-trade mode: trade only if the saved instruction conditions are clearly met and all policy caps permit it. If not clearly met, do nothing.',
    'For final answer, include decision, symbol(s), RSI, MACD cross facts, volume ratio, action/no-action, and next useful note. Keep it concise.',
  ].join('\n');
}

function buildScheduledJobMessage(job) {
  const policy = job.policy || {};
  const symbols = Array.isArray(job.symbols) && job.symbols.length ? job.symbols : hermesJobs.DEFAULT_SYMBOLS;
  return [
    `Run scheduled Decibel job "${job.name}".`,
    `Instruction: ${job.instruction}`,
    `Symbols: ${symbols.join(', ')}.`,
    `Scan ${policy.scan_timeframe || '1h'} candles and decide according to the job mode.`,
  ].join('\n');
}

async function runWithTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Scheduled Hermes job timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function executeJob(job) {
  const player = db.stmts.getPlayerById.get(job.player_id);
  if (!player) {
    hermesJobs.delayJob(job.id, null, 'error', 'Player not found.');
    return;
  }
  if (String(player.dex || '').toLowerCase() !== 'decibel') {
    hermesJobs.delayJob(job.id, null, 'error', 'Scheduled Decibel jobs require a Decibel account.');
    return;
  }

  const run = hermesJobs.startRun(job, job.next_run_at);
  if (!run?.inserted) {
    hermesJobs.releaseJob(job.id);
    return;
  }

  const startedAt = Date.now();
  let reservation = null;
  let messageCharged = false;
  const mcpEventStartId = Number(db.db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM mcp_events').get()?.id || 0);
  try {
    const dailyRuns = hermesJobs.dailyRunCount(job.id);
    if (dailyRuns > Number(job.max_runs_per_day || 0)) {
      hermesJobs.finishRun(job, run, {
        status: 'skipped',
        duration_ms: Date.now() - startedAt,
        response_text: `Daily run cap reached (${job.max_runs_per_day}/day).`,
        mcp_event_start_id: mcpEventStartId,
        mcp_event_end_id: mcpEventStartId,
      });
      hermesJobs.delayJob(job.id, nextUtcDaySql(), 'active', null);
      return;
    }
    if (Number(job.max_messages_total || 0) > 0 && Number(job.messages_used || 0) >= Number(job.max_messages_total || 0)) {
      hermesJobs.finishRun(job, run, {
        status: 'expired',
        duration_ms: Date.now() - startedAt,
        response_text: `Job message cap reached (${job.max_messages_total}).`,
        mcp_event_start_id: mcpEventStartId,
        mcp_event_end_id: mcpEventStartId,
      });
      hermesJobs.delayJob(job.id, null, 'expired', 'Job message cap reached.');
      return;
    }

    const reserved = aiQuota.reserveAiMessage(job.player_id, 'scheduled_job', { job_id: job.id, run_id: run.id });
    if (!reserved?.ok) {
      hermesJobs.finishRun(job, run, {
        status: 'quota_blocked',
        duration_ms: Date.now() - startedAt,
        quota: reserved?.quota || null,
        response_text: 'AI message quota is empty. Job paused until the player tops up or resumes it.',
        mcp_event_start_id: mcpEventStartId,
        mcp_event_end_id: mcpEventStartId,
      });
      return;
    }
    reservation = reserved.reservation;
    messageCharged = true;

    const agent = db.getOrCreateHermesAgent(job.player_id);
    if (agent.error) throw new Error(agent.error);
    const dailyTrades = hermesJobs.dailyTradeCount(job.id);
    const result = await runWithTimeout(hermesClient.chat(player, agent.mcp_key, buildScheduledJobMessage(job), {
      previous_response_id: null,
      idempotency_key: run.idempotency_key,
      history: [],
      internal_context: buildScheduledJobContext(job, run, dailyTrades),
      metadata: {
        source: 'clash-hermes-job',
        trace_id: run.trace_id,
        job_id: job.id,
        run_id: run.id,
        game_intent: {
          kind: 'scheduled_decibel_job',
          action_required: true,
          goal: 'Execute a saved Decibel market monitoring job through MCP tools.',
          required_loop: 'decibel_market_scan -> optional Decibel write tool only if mode/policy/conditions allow -> concise result',
          expected_tools: ['decibel_market_scan'],
        },
      },
    }), RUN_TIMEOUT_MS);

    const mcpEvents = toolEventsBetween(job.player_id, mcpEventStartId);
    const actions = summarizeActions(mcpEvents);
    const writeCount = actions.filter((event) => event.status === 'ok').length;
    const status = writeCount > 0 ? 'action_done' : 'no_action';
    const responseText = String(result.output_text || '').trim();
    hermesJobs.finishRun(job, run, {
      status,
      quota_bucket: reservation?.bucket || null,
      quota: result.quota || reserved.quota,
      model: result.model || null,
      duration_ms: Date.now() - startedAt,
      response_text: responseText,
      tools: summarizeToolEvents(mcpEvents),
      actions,
      trade_count: actions.some((event) => event.tool === 'decibel_place_order' && event.status === 'ok') ? 1 : 0,
      mcp_event_start_id: mcpEventStartId,
      mcp_event_end_id: mcpEvents.length ? mcpEvents[mcpEvents.length - 1].id : mcpEventStartId,
      message_charged: messageCharged,
    });
    db.logHermesChatEvent({
      traceId: run.trace_id,
      eventType: 'scheduled_job',
      playerId: job.player_id,
      playerName: player.name,
      intent: 'scheduled_decibel_job',
      status,
      durationMs: Date.now() - startedAt,
      model: result.model || null,
      requestPreview: preview(job.instruction),
      responsePreview: preview(responseText, 1600),
      quota: { reservation, after: aiQuota.getAiMessageQuotaStatus(job.player_id) },
      input: { job_id: job.id, run_id: run.id, instruction: job.instruction, policy: job.policy, symbols: job.symbols },
      output: { response_text: responseText, tools: summarizeToolEvents(mcpEvents), actions },
      attempts: result.attempts || null,
    });
  } catch (error) {
    const mcpEvents = toolEventsBetween(job.player_id, mcpEventStartId);
    const message = error?.message || String(error || 'Scheduled job failed');
    hermesJobs.finishRun(job, run, {
      status: 'failed',
      quota_bucket: reservation?.bucket || null,
      quota: aiQuota.getAiMessageQuotaStatus(job.player_id),
      duration_ms: Date.now() - startedAt,
      response_text: '',
      tools: summarizeToolEvents(mcpEvents),
      actions: summarizeActions(mcpEvents),
      mcp_event_start_id: mcpEventStartId,
      mcp_event_end_id: mcpEvents.length ? mcpEvents[mcpEvents.length - 1].id : mcpEventStartId,
      error: message,
      message_charged: messageCharged,
    });
    console.warn(JSON.stringify({
      event: 'hermes_job_failed',
      job_id: job.id,
      player_id: job.player_id,
      error: message,
    }));
  }
}

let stopping = false;

async function tick() {
  if (!JOBS_ENABLED || stopping) return;
  hermesJobs.expireOldJobs();
  const jobs = hermesJobs.claimDueJobs(WORKER_ID, BATCH_SIZE);
  for (const job of jobs) {
    if (stopping) break;
    await executeJob(job);
  }
}

async function loop() {
  console.log(JSON.stringify({ event: 'hermes_jobs_worker_started', worker_id: WORKER_ID, poll_ms: POLL_MS }));
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      console.warn(JSON.stringify({ event: 'hermes_jobs_tick_failed', error: error?.message || String(error) }));
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

if (require.main === module) {
  loop().catch((error) => {
    console.error(JSON.stringify({ event: 'hermes_jobs_worker_crashed', error: error?.message || String(error) }));
    process.exitCode = 1;
  });
}

module.exports = {
  executeJob,
  tick,
};
