const { runRecovery } = require('./recover_pending_bridges');

let timer = null;
let startupTimer = null;
let running = false;

function intEnv(name, fallback, min, max) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function runOnce(options = {}) {
  if (running) return { skipped: 'already-running' };
  running = true;
  try {
    const summary = await runRecovery({
      execute: true,
      apiBase: options.apiBase,
      limit: options.limit,
      minAgeSec: options.minAgeSec,
      includeLogErrors: true,
      setExitCodeOnFailure: false,
    }, {
      log: (msg) => console.log(`[bridge-retry] ${msg}`),
      error: (msg) => console.warn(`[bridge-retry] ${msg}`),
    });
    if (summary.total || summary.ok || summary.failed) {
      console.log(`[bridge-retry] sweep done total=${summary.total} ok=${summary.ok} failed=${summary.failed}`);
    }
    return summary;
  } catch (err) {
    console.warn('[bridge-retry] sweep crashed:', err?.message || err);
    return { error: err?.message || String(err) };
  } finally {
    running = false;
  }
}

function startBridgeRetryWorker(options = {}) {
  stopBridgeRetryWorker();

  const apiBase = options.apiBase || process.env.BRIDGE_API_BASE || process.env.NFT_BRIDGE_API_BASE || 'http://127.0.0.1:4000/api';
  const intervalMs = options.intervalMs || intEnv('CLASH_BRIDGE_RETRY_INTERVAL_MS', 120_000, 30_000, 3_600_000);
  const startupDelayMs = options.startupDelayMs || intEnv('CLASH_BRIDGE_RETRY_STARTUP_DELAY_MS', 90_000, 5_000, 600_000);
  const limit = options.limit || intEnv('CLASH_BRIDGE_RETRY_LIMIT', 3, 1, 20);
  const minAgeSec = options.minAgeSec ?? intEnv('CLASH_BRIDGE_RETRY_MIN_AGE_SEC', 90, 10, 86_400);
  const workerOptions = { apiBase, limit, minAgeSec };

  const scheduleRun = () => {
    runOnce(workerOptions).catch((err) => {
      console.warn('[bridge-retry] async sweep failed:', err?.message || err);
    });
  };

  startupTimer = setTimeout(scheduleRun, startupDelayMs);
  startupTimer.unref?.();
  timer = setInterval(scheduleRun, intervalMs);
  timer.unref?.();
  return { apiBase, intervalMs, startupDelayMs, limit, minAgeSec };
}

function stopBridgeRetryWorker() {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startBridgeRetryWorker,
  stopBridgeRetryWorker,
  runOnce,
};
