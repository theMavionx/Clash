const fs = require('fs');
const path = require('path');

// Load env before requiring routes/workers. Decibel signer, API keys, wallet
// encryption, and RPC settings are read at module load time.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    if (process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}
const REPO_ROOT = path.resolve(__dirname, '..');
loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(REPO_ROOT, '.env'));
loadEnvFile(path.join(REPO_ROOT, 'web', '.env'));

const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const PORT = process.env.FUTURES_PORT || 3999;

const app = express();

// CORS: whitelist the known game origins (production domain) plus any
// localhost / 127.0.0.1 port for local dev. Wildcard '*' was a footgun for
// a custodial financial API — any malicious page could make credentialed
// cross-origin calls if it got hold of a player token. Override with
// CLASH_CORS_ORIGINS env (comma-separated) if needed.
const DEFAULT_ORIGINS = [
  'https://clashofperps.fun',
  'https://www.clashofperps.fun',
];
// Localhost regex matches any port — covers Vite picking 5174/5175/5176/...
// when its default 5173 is taken, plus arbitrary preview servers.
const LOCALHOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const ALLOWED_ORIGINS = new Set(
  (process.env.CLASH_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
    .concat(DEFAULT_ORIGINS)
);
app.use(cors({
  origin(origin, cb) {
    // Allow same-origin / curl / server-to-server (no Origin header).
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    if (LOCALHOST_RE.test(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: false,
}));
app.use(express.json({ limit: '64kb' })); // clamp request body size

// No in-process futures rate limiter. Trading, withdraw, and Phoenix proxy
// routes should not return app-level 429s; idempotency guards, wallet signing,
// RPC/provider limits, and exchange-side validation remain the actual safety
// boundaries.

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url } = req;
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}${method}\x1b[0m ${url} \x1b[90m${status} ${ms}ms\x1b[0m`);
  });
  next();
});

// Health check
app.get('/', (req, res) => {
  const db = require('./db');
  const walletCount = db.db.prepare('SELECT COUNT(*) as count FROM wallets').get().count;
  const tradeCount = db.db.prepare('SELECT COUNT(*) as count FROM trade_history').get().count;

  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Clash Futures Server</title>
<meta http-equiv="refresh" content="10">
<style>
  body { background: #1a1b2e; color: #e0e0e0; font-family: 'Segoe UI', sans-serif; margin: 40px; }
  h1 { color: #4CAF50; margin-bottom: 5px; }
  .subtitle { color: #888; margin-bottom: 30px; }
  .stats { display: flex; gap: 20px; margin-bottom: 30px; }
  .stat { background: #252640; border: 1px solid #3a3b55; border-radius: 12px; padding: 16px 24px; min-width: 120px; }
  .stat .value { font-size: 28px; font-weight: bold; color: #4CAF50; }
  .stat .label { font-size: 13px; color: #888; margin-top: 4px; }
</style>
</head><body>
  <h1>Clash Futures Server</h1>
  <div class="subtitle">Pacifica / Avantis / Decibel / GMX / Perpl | Builder: clashofperps</div>
  <div class="stats">
    <div class="stat"><div class="value">${walletCount}</div><div class="label">Wallets</div></div>
    <div class="stat"><div class="value">${tradeCount}</div><div class="label">Trades</div></div>
  </div>
</body></html>`);
});

// API routes
app.use('/api', routes);

// Error handler — production logs compact message, dev keeps full stack.
// Body-parser malformed-JSON errors are client mistakes, not server bugs,
// so they get a 400 response and a single-line WARN (not stderr noise with
// a stack frame to a generic JSON.parse pointer that says nothing).
app.use((err, req, res, _next) => {
  const isBodyParseError = err && (
    err.type === 'entity.parse.failed'
    || (err instanceof SyntaxError && err.status === 400 && 'body' in err)
  );
  if (isBodyParseError) {
    console.warn(`[warn] ${req.method} ${req.url} → malformed request body: ${err.message}`);
    return res.status(400).json({ error: 'Malformed request body' });
  }
  if (process.env.NODE_ENV === 'production') {
    const firstFrame = String(err.stack || '').split('\n')[1] || '';
    console.error(`[err] ${req.method} ${req.url} → ${err.message} ${firstFrame.trim()}`);
  } else {
    console.error(err.stack);
  }
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : (err.message || 'Request failed') });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Futures server running on http://127.0.0.1:${PORT}`);
  console.log('Network: Pacifica Mainnet + Avantis (Base) + Decibel (Aptos) + GMX (Arbitrum) + Perpl (Monad) + Phoenix (Solana) + Hyperliquid + Nado (Ink)');
  console.log('Builder code: clashofperps');
  // Start gold-rewards indexers. Avantis still needs polling. Decibel orders
  // are submitted by this server signer, so the Decibel order route records
  // rewardable rows synchronously; the old Decibel poller is now an optional
  // backfill path to avoid double-counting the same volume.
  try {
    require('./avantis-rewards-worker').start();
  } catch (e) {
    console.error('[worker] avantis-rewards-worker failed to start:', e.message);
  }
  // Decibel worker is now ALWAYS-ON. Server-side `'server'` source rows
  // are no longer accepted by the credit pipeline (they were unverified
  // pre-fill and let users farm gold for orders that didn't land), so
  // the only path to credit a Decibel trade is the worker confirming
  // the position appeared/disappeared on-chain via account_positions.
  // The opt-in env flag is left for emergency disable: set
  // DECIBEL_REWARDS_WORKER=0 to skip.
  if (process.env.DECIBEL_REWARDS_WORKER !== '0') {
    try {
      require('./decibel-rewards-worker').start();
    } catch (e) {
      console.error('[worker] decibel-rewards-worker failed to start:', e.message);
    }
  } else {
    console.log('[decibel-rewards-worker] skipped (DECIBEL_REWARDS_WORKER=0)');
  }
  // GMX events worker — polls subsquid for OrderExecuted events of every
  // registered GMX wallet and writes verified rows into trade_history. Same
  // pattern as Avantis; the trade_history.client_order_id UNIQUE index
  // dedups against any future client-side reportTrade path.
  try {
    require('./gmx-rewards-worker').start();
  } catch (e) {
    console.error('[worker] gmx-rewards-worker failed to start:', e.message);
  }
  try {
    require('./phoenix-rewards-worker').start();
  } catch (e) {
    console.error('[worker] phoenix-rewards-worker failed to start:', e.message);
  }
  try {
    require('./hyperliquid-rewards-worker').start();
  } catch (e) {
    console.error('[worker] hyperliquid-rewards-worker failed to start:', e.message);
  }
  try {
    require('./hotstuff-rewards-worker').start();
  } catch (e) {
    console.error('[worker] hotstuff-rewards-worker failed to start:', e.message);
  }
});
