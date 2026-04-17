const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const PORT = process.env.FUTURES_PORT || 3999;

const app = express();

// CORS: whitelist the known game origins (local dev + the production domain).
// Wildcard '*' was a footgun for a custodial financial API — any malicious page
// could make credentialed cross-origin calls if it got hold of a player token.
// Override with CLASH_CORS_ORIGINS env (comma-separated) if needed.
const DEFAULT_ORIGINS = [
  'https://clashofperps.fun',
  'https://www.clashofperps.fun',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
];
const ALLOWED_ORIGINS = new Set(
  (process.env.CLASH_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
    .concat(DEFAULT_ORIGINS)
);
app.use(cors({
  origin(origin, cb) {
    // Allow same-origin / curl / server-to-server (no Origin header).
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: false,
}));
app.use(express.json({ limit: '64kb' })); // clamp request body size

// ---------- Lightweight per-token rate limiter (no new deps) ----------
// Token-bucket: each authed player gets N requests per window per endpoint
// group. Keys are derived from `x-token` header (anon clients share a bucket
// keyed by IP, which is handled by nginx upstream in prod).
function makeRateLimiter({ windowMs, max, group }) {
  const buckets = new Map(); // key → { count, resetAt }
  // Janitor: drop expired buckets every minute so the map doesn't grow.
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }, 60_000).unref?.();
  return (req, res, next) => {
    const key = (req.headers['x-token'] || req.ip || 'anon') + ':' + group;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (b.count >= max) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests — slow down.', retry_after_s: retryAfter });
    }
    b.count++;
    next();
  };
}
// Trade endpoints: 30/min (≈1 every 2s, plenty for a real user).
const tradeLimiter = makeRateLimiter({ windowMs: 60_000, max: 30, group: 'trade' });
// Withdraw: much tighter — 5/min per player.
const withdrawLimiter = makeRateLimiter({ windowMs: 60_000, max: 5, group: 'withdraw' });
app.use(['/api/orders', '/api/positions/close', '/api/tpsl'], tradeLimiter);
app.use('/api/withdraw', withdrawLimiter);

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
  <div class="subtitle">Pacifica Mainnet | Builder: clashofperps</div>
  <div class="stats">
    <div class="stat"><div class="value">${walletCount}</div><div class="label">Wallets</div></div>
    <div class="stat"><div class="value">${tradeCount}</div><div class="label">Trades</div></div>
  </div>
</body></html>`);
});

// API routes
app.use('/api', routes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Futures server running on http://0.0.0.0:${PORT}`);
  console.log('Network: Pacifica Mainnet');
  console.log('Builder code: clashofperps');
});
