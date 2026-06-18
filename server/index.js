const fs = require('fs');
const path = require('path');

// Load .env files BEFORE requiring routes so process.env is populated by the
// time route modules read config (game shop quote signer, NFT keys, CoP token,
// etc.). Mirrors the precedence used by nft/scripts/lib-env.mjs so the same
// keys configured for nft tooling work for the running server.
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
const http = require('http');
const { router } = require('./routes');
const { startDailyLogAiScheduler } = require('./log_ai_analyzer');
const { setupWebSocket, getOnlinePlayers } = require('./websocket');

const PORT = process.env.PORT || 4000;
const WEB_DIST_DIR = path.join(REPO_ROOT, 'web', 'dist');

const app = express();
// Production traffic is normally behind nginx on the same host. Trust only
// loopback proxy headers so per-IP rate limits do not collapse all users into
// 127.0.0.1, while still ignoring spoofed X-Forwarded-For from the open web.
app.set('trust proxy', process.env.CLASH_TRUST_PROXY || 'loopback');
const DEFAULT_ORIGINS = [
  'https://clashofperps.fun',
  'https://www.clashofperps.fun',
];
const LOCALHOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const ALLOWED_ORIGINS = new Set(
  (process.env.CLASH_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
    .concat(DEFAULT_ORIGINS)
);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin) || LOCALHOST_RE.test(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: false,
}));
app.use(express.json({ limit: process.env.CLASH_JSON_LIMIT || '2mb' }));
if (fs.existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR, { index: false }));
}

function dashboardAuth(req, res, next) {
  if (process.env.PUBLIC_DASHBOARD === '1') return next();
  const adminKey = process.env.ADMIN_KEY || process.env.CLASH_ADMIN_KEY;
  const provided = req.headers['x-admin-key'] || req.query.admin_key;
  if (adminKey && provided === adminKey) return next();
  return res.status(404).send('Not found');
}

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

// Health check — HTML page for browser
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

app.get('/', dashboardAuth, (req, res) => {
  const db = require('./db');
  const players = db.db.prepare('SELECT id, name, trophies, level, gold, wood, ore, created_at FROM players ORDER BY trophies DESC').all();
  const totalBuildings = db.db.prepare('SELECT COUNT(*) as count FROM buildings').get().count;
  const online = getOnlinePlayers();
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const secs = Math.floor(uptime % 60);

  const playersRows = players.map(p => `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${p.trophies}</td>
      <td>${p.level}</td>
      <td style="color:#e8b830">${p.gold}</td>
      <td style="color:#6ab344">${p.wood}</td>
      <td style="color:#8a9aaa">${p.ore}</td>
      <td>${online.some(o => o.player_id === p.id) ? '<span style="color:#4f4">ONLINE</span>' : '<span style="color:#888">offline</span>'}</td>
      <td style="color:#888;font-size:12px">${p.created_at}</td>
    </tr>
  `).join('');

  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Clash Server</title>
<meta http-equiv="refresh" content="10">
<style>
  body { background: #1a1b2e; color: #e0e0e0; font-family: 'Segoe UI', sans-serif; margin: 40px; }
  h1 { color: #e8b830; margin-bottom: 5px; }
  .subtitle { color: #888; margin-bottom: 30px; }
  .stats { display: flex; gap: 20px; margin-bottom: 30px; }
  .stat { background: #252640; border: 1px solid #3a3b55; border-radius: 12px; padding: 16px 24px; min-width: 120px; }
  .stat .value { font-size: 28px; font-weight: bold; color: #e8b830; }
  .stat .label { font-size: 13px; color: #888; margin-top: 4px; }
  table { border-collapse: collapse; width: 100%; background: #252640; border-radius: 12px; overflow: hidden; }
  th { background: #2a2b48; color: #aaa; text-align: left; padding: 12px 16px; font-size: 13px; text-transform: uppercase; }
  td { padding: 10px 16px; border-top: 1px solid #2e2f4a; }
  tr:hover { background: #2e2f50; }
</style>
</head><body>
  <h1>Clash Multiplayer Server</h1>
  <div class="subtitle">Auto-refresh every 10s</div>
  <div class="stats">
    <div class="stat"><div class="value">${players.length}</div><div class="label">Players</div></div>
    <div class="stat"><div class="value">${online.length}</div><div class="label">Online</div></div>
    <div class="stat"><div class="value">${totalBuildings}</div><div class="label">Buildings</div></div>
    <div class="stat"><div class="value">${hours}h ${mins}m ${secs}s</div><div class="label">Uptime</div></div>
  </div>
  <table>
    <tr><th>Name</th><th>Trophies</th><th>Level</th><th>Gold</th><th>Wood</th><th>Ore</th><th>Status</th><th>Joined</th></tr>
    ${playersRows || '<tr><td colspan="8" style="text-align:center;color:#888">No players yet</td></tr>'}
  </table>
</body></html>`);
});

// Online players list
app.get('/api/online', (req, res) => {
  res.json(getOnlinePlayers());
});

// Trading stats dashboard — shows Pacifica (via builder API) + Avantis (via
// futures.db) + in-game gold ledger, side by side with a DEX split.
app.get('/trading-stats', dashboardAuth, async (req, res) => {
  const db = require('./db');

  // Local stats — trading_rewards rows joined with players (incl. DEX).
  let rewards = [];
  try {
    rewards = db.db.prepare(`
      SELECT r.*, p.name, p.dex AS player_dex
      FROM trading_rewards r
      JOIN players p ON r.player_id = p.id
      ORDER BY r.total_gold DESC
    `).all();
  } catch { /* no trading_rewards yet */ }

  // Split rewards by DEX.
  const pacRewards = rewards.filter(r => r.dex === 'pacifica');
  const avtRewards = rewards.filter(r => r.dex === 'avantis');

  // Pacifica public builder stats.
  let builderTrades = [], leaderboard = [];
  try {
    const [tRes, lRes] = await Promise.all([
      fetch('https://api.pacifica.fi/api/v1/builder/trades?builder_code=clashofperps').then(r=>r.json()),
      fetch('https://api.pacifica.fi/api/v1/leaderboard/builder_code?builder_code=clashofperps').then(r=>r.json()),
    ]);
    builderTrades = tRes.data || [];
    leaderboard = lRes.data || [];
  } catch { /* pacifica API down */ }

  // Avantis: pull trade_history from server-futures.db (read-only). The
  // worker indexes both client-reported trades and closes detected via
  // Avantis Core polling; aggregating here gives us a leaderboard without
  // scraping Avantis's own dashboard.
  let avantisLeader = [];
  let avantisTotals = { trades: 0, volume: 0, traders: 0, trades24h: 0 };
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const fpath = process.env.CLASH_FUTURES_DB || path.join(__dirname, '..', 'server-futures', 'futures.db');
    if (require('fs').existsSync(fpath)) {
      const fdb = new Database(fpath, { readonly: true, fileMustExist: true });
      try { fdb.pragma('journal_mode = WAL'); } catch {}
      const totals = fdb.prepare(`
        SELECT COUNT(*) AS trades,
               COUNT(DISTINCT player_id) AS traders,
               COALESCE(SUM(notional_usd), 0) AS volume
        FROM trade_history WHERE dex='avantis' AND status = 'filled' AND verified_source = 'worker'
      `).get();
      const recent = fdb.prepare(`
        SELECT COUNT(*) AS trades FROM trade_history
        WHERE dex='avantis' AND status = 'filled' AND verified_source = 'worker' AND created_at > datetime('now', '-24 hours')
      `).get();
      avantisTotals = {
        trades: totals.trades || 0,
        volume: totals.volume || 0,
        traders: totals.traders || 0,
        trades24h: recent.trades || 0,
      };
      const rows = fdb.prepare(`
        SELECT player_id, COUNT(*) AS trades, SUM(notional_usd) AS volume
        FROM trade_history WHERE dex='avantis' AND status = 'filled' AND verified_source = 'worker'
        GROUP BY player_id ORDER BY volume DESC LIMIT 25
      `).all();
      const nameStmt = db.db.prepare('SELECT name, wallet FROM players WHERE id = ?');
      avantisLeader = rows.map(r => {
        const p = nameStmt.get(r.player_id) || {};
        return {
          name: p.name || '?',
          wallet: p.wallet || '',
          trades: r.trades,
          volume: Number(r.volume) || 0,
        };
      });
      fdb.close();
    }
  } catch (e) {
    console.warn('[trading-stats] futures.db aggregation failed:', e.message);
  }

  const totalVol = leaderboard.reduce((s,u) => s + parseFloat(u.volume_all_time||0), 0);
  const totalFees = leaderboard.reduce((s,u) => s + parseFloat(u.fees_all_time||0), 0);
  const totalGold = rewards.reduce((s,r) => s + (r.total_gold||0), 0);
  const pacGold = pacRewards.reduce((s,r) => s + (r.total_gold||0), 0);
  const avtGold = avtRewards.reduce((s,r) => s + (r.total_gold||0), 0);

  const leaderRows = leaderboard.map(u => `
    <tr>
      <td style="font-family:monospace">${esc(u.address?.substring(0,8)+'...')}</td>
      <td>$${parseFloat(u.volume_all_time||0).toFixed(2)}</td>
      <td>$${parseFloat(u.fees_all_time||0).toFixed(4)}</td>
    </tr>
  `).join('');

  const avantisRows = avantisLeader.map(u => `
    <tr>
      <td>${esc(u.name)}</td>
      <td style="font-family:monospace">${esc(u.wallet ? u.wallet.slice(0,6)+'...'+u.wallet.slice(-4) : '—')}</td>
      <td>$${u.volume.toFixed(2)}</td>
      <td>${u.trades}</td>
    </tr>
  `).join('');

  // Split gold-rewards table by DEX so they're readable side-by-side.
  const renderRewardRow = (r) => `
    <tr>
      <td>${esc(r.name||'?')}</td>
      <td style="font-family:monospace">${esc(r.wallet ? (r.wallet.length > 20 ? r.wallet.slice(0,6)+'...'+r.wallet.slice(-4) : r.wallet.substring(0,10)+'...') : '—')}</td>
      <td>${r.total_gold||0}</td>
      <td>$${parseFloat(r.total_volume||0).toFixed(2)}</td>
      <td>${r.last_daily||'—'}</td>
    </tr>
  `;
  const pacRewardRows = pacRewards.map(renderRewardRow).join('');
  const avtRewardRows = avtRewards.map(renderRewardRow).join('');

  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Trading Stats — clashofperps</title>
<meta http-equiv="refresh" content="30">
<style>
  body { background: #1a1b2e; color: #e0e0e0; font-family: 'Segoe UI', sans-serif; margin: 40px; }
  h1 { color: #4CAF50; margin-bottom: 5px; }
  h2 { color: #FFD700; margin-top: 30px; }
  .subtitle { color: #888; margin-bottom: 20px; }
  .stats { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
  .stat { background: #252640; border: 1px solid #3a3b55; border-radius: 12px; padding: 16px 24px; min-width: 140px; }
  .stat .value { font-size: 28px; font-weight: bold; color: #4CAF50; }
  .stat .label { font-size: 13px; color: #888; margin-top: 4px; }
  table { border-collapse: collapse; width: 100%; background: #252640; border-radius: 12px; overflow: hidden; margin-top: 10px; }
  th { background: #2a2b48; color: #aaa; text-align: left; padding: 10px 14px; font-size: 12px; text-transform: uppercase; }
  td { padding: 8px 14px; border-top: 1px solid #2e2f4a; font-size: 14px; }
  tr:hover { background: #2e2f50; }
  a { color: #4CAF50; }
</style>
</head><body>
  <h1>Trading Stats</h1>
  <div class="subtitle">Builder: clashofperps | Auto-refresh 30s | <a href="/">Game Dashboard</a></div>

  <h2 style="color:#a78bfa">Pacifica · Solana</h2>
  <div class="stats">
    <div class="stat"><div class="value" style="color:#a78bfa">${leaderboard.length}</div><div class="label">Traders</div></div>
    <div class="stat"><div class="value">$${totalVol.toFixed(0)}</div><div class="label">Total Volume</div></div>
    <div class="stat"><div class="value">$${totalFees.toFixed(4)}</div><div class="label">Builder Fees</div></div>
    <div class="stat"><div class="value" style="color:#FFD700">${pacGold}</div><div class="label">Pacifica Gold</div></div>
    <div class="stat"><div class="value">${builderTrades.length}</div><div class="label">Total Trades</div></div>
  </div>

  <h2 style="color:#38bdf8">Avantis · Base</h2>
  <div class="stats">
    <div class="stat"><div class="value" style="color:#38bdf8">${avantisTotals.traders}</div><div class="label">Traders</div></div>
    <div class="stat"><div class="value">$${avantisTotals.volume.toFixed(0)}</div><div class="label">Total Volume</div></div>
    <div class="stat"><div class="value" style="color:#FFD700">${avtGold}</div><div class="label">Avantis Gold</div></div>
    <div class="stat"><div class="value">${avantisTotals.trades}</div><div class="label">Total Trades</div></div>
    <div class="stat"><div class="value">${avantisTotals.trades24h}</div><div class="label">Trades 24h</div></div>
  </div>

  <h2 style="color:#a78bfa">Pacifica Leaderboard</h2>
  <table>
    <tr><th>Wallet</th><th>Volume</th><th>Fees</th></tr>
    ${leaderRows || '<tr><td colspan="3" style="text-align:center;color:#888">No traders yet</td></tr>'}
  </table>

  <h2 style="color:#38bdf8">Avantis Leaderboard</h2>
  <table>
    <tr><th>Player</th><th>Wallet</th><th>Volume</th><th>Trades</th></tr>
    ${avantisRows || '<tr><td colspan="4" style="text-align:center;color:#888">No Avantis trades yet</td></tr>'}
  </table>

  <h2 style="color:#a78bfa">Pacifica Gold Rewards</h2>
  <table>
    <tr><th>Player</th><th>Wallet</th><th>Gold Earned</th><th>Volume</th><th>Last Active</th></tr>
    ${pacRewardRows || '<tr><td colspan="5" style="text-align:center;color:#888">No Pacifica rewards yet</td></tr>'}
  </table>

  <h2 style="color:#38bdf8">Avantis Gold Rewards</h2>
  <table>
    <tr><th>Player</th><th>Wallet</th><th>Gold Earned</th><th>Volume</th><th>Last Active</th></tr>
    ${avtRewardRows || '<tr><td colspan="5" style="text-align:center;color:#888">No Avantis rewards yet</td></tr>'}
  </table>

  <div style="margin-top:40px;font-size:12px;color:#666;text-align:center">
    Total gold distributed across indexed DEXs: <strong style="color:#FFD700">${totalGold}</strong>
  </div>
</body></html>`);
});

// Admin panel — served under /api so it goes through the proxy
app.get('/api/admin/panel', (req, res) => {
  if (req.query.legacy !== '1') {
    const builtAdmin = path.join(REPO_ROOT, 'web', 'dist', 'admin.html');
    if (fs.existsSync(builtAdmin)) {
      return res.sendFile(builtAdmin);
    }
    const devOrigin = process.env.CLASH_ADMIN_DEV_ORIGIN || 'http://localhost:5173';
    return res.send(`<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0a0b1a">
<title>Clash Admin</title>
</head><body>
<div id="admin-root"></div>
<script type="module" src="${devOrigin}/src/admin/main.jsx"></script>
</body></html>`);
  }
  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Admin — Clash</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #111827; color: #e5e7eb; font-family: 'Segoe UI', system-ui, sans-serif; }
  .login { display: flex; align-items: center; justify-content: center; height: 100vh; }
  .login-box { background: #1f2937; border: 1px solid #374151; border-radius: 16px; padding: 40px; width: 360px; }
  .login-box h1 { color: #f59e0b; font-size: 22px; margin-bottom: 20px; text-align: center; }
  .login-box input { width: 100%; padding: 12px 16px; background: #111827; border: 1px solid #4b5563; border-radius: 8px; color: #fff; font-size: 15px; margin-bottom: 12px; }
  .login-box button { width: 100%; padding: 12px; background: #f59e0b; border: none; border-radius: 8px; color: #111; font-size: 15px; font-weight: 700; cursor: pointer; }
  .login-box button:hover { background: #d97706; }
  .login-box .err { color: #ef4444; font-size: 13px; margin-top: 8px; text-align: center; display: none; }
  #app { display: none; padding: 24px; max-width: 1200px; margin: 0 auto; }
  h1 { color: #f59e0b; font-size: 24px; margin-bottom: 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 0; margin-bottom: 24px; border-bottom: 2px solid #374151; }
  .tab { padding: 10px 20px; cursor: pointer; font-weight: 700; font-size: 14px; color: #9ca3af; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .tab.active { color: #f59e0b; border-color: #f59e0b; }
  .tab:hover { color: #d1d5db; }
  .panel { display: none; }
  .panel.active { display: block; }
  table { width: 100%; border-collapse: collapse; background: #1f2937; border-radius: 12px; overflow: hidden; }
  th { background: #252d3d; color: #9ca3af; text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px 14px; border-top: 1px solid #2d3748; font-size: 13px; }
  tr:hover { background: #2d3748; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  .badge-ok { background: #065f46; color: #34d399; }
  .badge-fail { background: #7f1d1d; color: #fca5a5; }
  .badge-shield { background: #1e3a5f; color: #93c5fd; }
  .badge-off { background: #374151; color: #6b7280; }
  .btn { padding: 5px 12px; border: 1px solid #4b5563; border-radius: 6px; background: #1f2937; color: #e5e7eb; cursor: pointer; font-size: 12px; font-weight: 600; }
  .btn:hover { background: #374151; }
  .btn-danger { border-color: #7f1d1d; color: #fca5a5; }
  .btn-danger:hover { background: #7f1d1d; }
  .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { background: #1f2937; border: 1px solid #374151; border-radius: 12px; padding: 16px 20px; min-width: 130px; }
  .stat .v { font-size: 26px; font-weight: 800; color: #f59e0b; }
  .stat .l { font-size: 12px; color: #6b7280; margin-top: 2px; }
  .mono { font-family: 'Cascadia Code', monospace; font-size: 12px; }
  .filter { margin-bottom: 16px; display: flex; gap: 8px; align-items: center; }
  .filter select, .filter input { padding: 6px 10px; background: #1f2937; border: 1px solid #4b5563; border-radius: 6px; color: #e5e7eb; font-size: 13px; }
  .filter input { min-width: 220px; }
  .log-row-error { border-left: 3px solid #ef4444; }
  .log-row-warn { border-left: 3px solid #f59e0b; }
  .log-row-info, .log-row-log { border-left: 3px solid #38bdf8; }
  .log-msg { max-width: 420px; white-space: pre-wrap; word-break: break-word; line-height: 1.35; }
  .log-url { max-width: 240px; word-break: break-all; color: #93c5fd; font-size: 11px; }
  .log-action { margin-top: 6px; padding: 6px 8px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #cbd5e1; font-size: 11px; line-height: 1.35; }
  .log-action strong { color: #fbbf24; }
  .log-meta { color: #6b7280; font-size: 11px; line-height: 1.35; }
  details.log-details { margin-top: 6px; }
  details.log-details summary { cursor: pointer; color: #fbbf24; font-size: 11px; }
  .log-pre { margin-top: 6px; max-height: 220px; overflow: auto; background: #111827; border: 1px solid #374151; border-radius: 8px; padding: 8px; color: #cbd5e1; white-space: pre-wrap; word-break: break-word; }
  .ai-report { background:#0f172a; border:1px solid #334155; border-radius:12px; padding:14px; margin-bottom:14px; }
  .ai-report h3 { color:#fbbf24; font-size:15px; margin-bottom:8px; }
  .ai-report-pre { max-height:560px; overflow:auto; white-space:pre-wrap; word-break:break-word; line-height:1.45; background:#111827; border:1px solid #374151; border-radius:10px; padding:12px; color:#dbeafe; }
  .ai-report-json { max-height:260px; overflow:auto; white-space:pre-wrap; word-break:break-word; background:#020617; border:1px solid #1f2937; border-radius:8px; padding:10px; color:#bfdbfe; }
  .feedback-message { max-width: 520px; white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
  .feedback-contact { font-size: 12px; color: #fbbf24; word-break: break-word; }
  .local-tools-backdrop { position: fixed; inset: 0; z-index: 50; display: none; align-items: center; justify-content: center; background: rgba(2, 6, 23, 0.74); padding: 18px; }
  .local-tools { width: min(720px, 96vw); max-height: 92vh; overflow: auto; background: #172033; border: 1px solid #334155; border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,0.55); }
  .local-tools-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; background: #1f2937; border-bottom: 1px solid #334155; }
  .local-tools-title { color: #f59e0b; font-size: 17px; font-weight: 900; }
  .local-tools-sub { color: #94a3b8; font-size: 12px; margin-top: 2px; }
  .local-tools-body { padding: 16px; }
  .local-tool-section { margin-bottom: 18px; }
  .local-tool-label { color: #dbeafe; font-size: 13px; font-weight: 900; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.4px; }
  .local-tool-row { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px; align-items: center; margin-bottom: 9px; }
  .local-tool-name { color: #e5e7eb; font-size: 14px; font-weight: 800; }
  .local-tool-buttons { display: grid; grid-template-columns: repeat(5, minmax(44px, 1fr)); gap: 7px; }
  .local-tool-buttons.local-resource-buttons { grid-template-columns: repeat(4, minmax(78px, 1fr)); }
  .local-tool-buttons.local-trophy-buttons { grid-template-columns: repeat(6, minmax(62px, 1fr)); }
  .local-wide { grid-column: 1 / -1; }
  .local-danger { border-color: #f59e0b !important; color: #fef3c7 !important; background: #3b2a12 !important; }
  .local-tool-status { min-height: 20px; color: #93c5fd; font-size: 12px; font-weight: 700; margin-top: 10px; }
  @media (max-width: 620px) {
    .local-tools-backdrop { padding: 0; align-items: stretch; }
    .local-tools { width: 100vw; max-height: none; border-radius: 0; }
    .local-tool-row { grid-template-columns: 1fr; gap: 5px; }
    .local-tool-buttons.local-resource-buttons { grid-template-columns: repeat(2, minmax(78px, 1fr)); }
  }
</style>
</head><body>

<div class="login" id="login">
  <div class="login-box">
    <h1>Admin Login</h1>
    <input type="password" id="key" placeholder="Admin key" onkeydown="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">Login</button>
    <div class="err" id="loginErr">Invalid key</div>
  </div>
</div>

<div id="app">
  <h1>Clash Admin Panel</h1>
  <div class="sub" id="refreshInfo">Loading...</div>

  <div class="tabs">
    <div class="tab active" onclick="switchTab('players')">Players</div>
    <div class="tab" onclick="switchTab('replays')">Battle Replays</div>
    <div class="tab" onclick="switchTab('tasks')">Tasks</div>
    <div class="tab" onclick="switchTab('tournaments')">Tournaments</div>
    <div class="tab" onclick="switchTab('elfa')">Elfa</div>
    <div class="tab" onclick="switchTab('logs')">Logs</div>
    <div class="tab" onclick="switchTab('client')">Client Logs</div>
    <div class="tab" onclick="switchTab('ai-reports')">AI Log Reports</div>
    <div class="tab" onclick="switchTab('feedback')">Feedback</div>
    <div class="tab" onclick="switchTab('stats')">Stats</div>
    <div class="tab" onclick="switchTab('earnings')">Earnings</div>
    <div class="tab" onclick="switchTab('shop')">Shop</div>
    <div class="tab" onclick="switchTab('marketplace')">Marketplace</div>
    <div class="tab" onclick="switchTab('nft')">NFT / Bridge</div>
  </div>

  <div class="panel active" id="tab-players">
    <div class="stats" id="playerStats"></div>
    <table><thead><tr>
      <th>Name</th><th>DEX</th><th>UI</th><th>Wallet</th><th>Trophies</th><th>Level</th><th>Gold</th><th>Wood</th><th>Ore</th><th>Trade Gold</th><th>Trade Vol</th><th>Buildings</th><th>Shield</th><th>Status</th><th>Joined</th><th>Actions</th>
    </tr></thead><tbody id="playersBody"></tbody></table>
  </div>

  <div class="panel" id="tab-logs">
    <div class="filter">
      <span style="color:#9ca3af;font-size:13px">Type:</span>
      <select id="logFilter" onchange="loadLogs()">
        <option value="">All</option>
        <option value="battle">Battle</option>
        <option value="economy">Economy</option>
        <option value="auth">Auth</option>
        <option value="feedback">Feedback</option>
        <option value="error">Error</option>
      </select>
      <button class="btn" onclick="loadLogs()">Refresh</button>
      <span id="logCount" style="color:#6b7280;font-size:12px;margin-left:8px"></span>
    </div>
    <table><thead><tr>
      <th>Time</th><th>Type</th><th>Message</th><th>Data</th>
    </tr></thead><tbody id="logsBody"></tbody></table>
  </div>

  <div class="panel" id="tab-client">
    <div class="stats" id="clientLogStats"></div>
    <div class="filter" style="flex-wrap:wrap">
      <span style="color:#9ca3af;font-size:13px">Level:</span>
      <select id="clientLogLevel" onchange="loadClientLogs()">
        <option value="">All</option>
        <option value="error">Error</option>
        <option value="warn">Warn</option>
        <option value="unhandledrejection">Unhandled rejection</option>
        <option value="onerror">Window error</option>
        <option value="info">Info</option>
        <option value="log">Log</option>
        <option value="debug">Debug</option>
      </select>
      <span style="color:#9ca3af;font-size:13px">Window:</span>
      <select id="clientLogSince" onchange="loadClientLogs()">
        <option value="15">15m</option>
        <option value="60" selected>1h</option>
        <option value="360">6h</option>
        <option value="1440">24h</option>
        <option value="10080">7d</option>
        <option value="">All retained (7d max)</option>
      </select>
      <input id="clientLogSearch" placeholder="Search message / URL / source" onkeydown="if(event.key==='Enter')loadClientLogs()">
      <button class="btn" onclick="loadClientLogs()">Refresh</button>
      <span id="clientLogCount" style="color:#6b7280;font-size:12px;margin-left:8px"></span>
    </div>
    <table><thead><tr>
      <th>User group</th><th>Time</th><th>Level</th><th>Source</th><th>Message</th><th>URL / Details</th>
    </tr></thead><tbody id="clientLogsBody"></tbody></table>
  </div>

  <div class="panel" id="tab-ai-reports">
    <div class="stats" id="aiLogReportStats"></div>
    <div class="filter" style="flex-wrap:wrap">
      <span style="color:#9ca3af;font-size:13px">Daily at 00:00 UTC. Manual run analyzes the last 24h.</span>
      <button class="btn" onclick="loadAiLogReports()">Refresh</button>
      <button class="btn" onclick="runAiLogReport()">Run now</button>
      <span id="aiLogReportStatus" style="color:#6b7280;font-size:12px;margin-left:8px"></span>
    </div>
    <div id="aiLogReportLatest"></div>
    <table><thead><tr>
      <th>ID</th><th>Window</th><th>Status</th><th>Model</th><th>Counts</th><th>Duration</th><th>Created</th><th>Actions</th>
    </tr></thead><tbody id="aiLogReportsBody"></tbody></table>
  </div>

  <div class="panel" id="tab-feedback">
    <div class="stats" id="feedbackStats"></div>
    <div class="filter" style="flex-wrap:wrap">
      <span style="color:#9ca3af;font-size:13px">Type:</span>
      <select id="feedbackKind" onchange="loadFeedback()">
        <option value="">All</option>
        <option value="problem">Problem</option>
        <option value="feedback">Feedback</option>
      </select>
      <span style="color:#9ca3af;font-size:13px">Window:</span>
      <select id="feedbackSince" onchange="loadFeedback()">
        <option value="1440" selected>24h</option>
        <option value="10080">7d</option>
        <option value="43200">30d</option>
        <option value="">All</option>
      </select>
      <input id="feedbackSearch" placeholder="Search message / contact / player" onkeydown="if(event.key==='Enter')loadFeedback()">
      <button class="btn" onclick="loadFeedback()">Refresh</button>
      <span id="feedbackCount" style="color:#6b7280;font-size:12px;margin-left:8px"></span>
    </div>
    <table><thead><tr>
      <th>Time</th><th>Type</th><th>Player</th><th>Contact</th><th>Message</th><th>Context</th>
    </tr></thead><tbody id="feedbackBody"></tbody></table>
  </div>

  <div class="panel" id="tab-stats">
    <div class="stats" id="serverStats"></div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Player Analytics</h2>
    <div class="stats" id="playerAnalyticsStats"></div>
    <div style="font-size:12px;color:#9ca3af;margin:-10px 0 14px" id="playerAnalyticsNote"></div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px">
      <div style="flex:1;min-width:360px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Town Hall Distribution</h3>
        <table><thead><tr>
          <th>TH</th><th>Players</th><th>%</th><th>Share</th>
        </tr></thead><tbody id="thDistributionBody"></tbody></table>
      </div>
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Top Actions 7d</h3>
        <table><thead><tr>
          <th>Action</th><th>Events</th>
        </tr></thead><tbody id="playerActionsBody"></tbody></table>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 8px;flex-wrap:wrap">
      <h3 style="color:#9ca3af;font-size:13px;margin:0;text-transform:uppercase;letter-spacing:0.5px">Players Activity</h3>
      <button class="btn" onclick="exportPlayerActivityData()">Export all data</button>
    </div>
    <table style="margin-bottom:20px"><thead><tr>
      <th>Player</th><th>DEX</th><th>TH</th><th>Active Days 7d</th><th>Sessions 7d</th><th>Avg Session</th><th>Events 7d</th><th>Battles 7d</th><th>Futures Volume</th><th>Last Action</th>
    </tr></thead><tbody id="playerActivityBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Combat Health</h2>
    <div class="stats" id="combatStats"></div>
    <div style="font-size:12px;color:#9ca3af;margin:-10px 0 14px" id="combatStatsNote"></div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px">
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">TH Gap 30d</h3>
        <table><thead><tr>
          <th>Bucket</th><th>Attacks</th><th>Win %</th><th>Accepted %</th><th>TH Dmg</th>
        </tr></thead><tbody id="combatGapBody"></tbody></table>
      </div>
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Top Attackers 30d</h3>
        <table><thead><tr>
          <th>Player</th><th>DEX</th><th>TH</th><th>Attacks</th><th>Win %</th><th>Avg Gold</th>
        </tr></thead><tbody id="combatAttackersBody"></tbody></table>
      </div>
    </div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Growth Funnel</h2>
    <div class="stats" id="growthFunnelStats"></div>
    <div style="font-size:12px;color:#9ca3af;margin:-10px 0 14px" id="growthFunnelNote"></div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px">
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Player Funnel</h3>
        <table><thead><tr>
          <th>Step</th><th>Players</th><th>From Prev</th><th>From Total</th>
        </tr></thead><tbody id="growthFunnelBody"></tbody></table>
      </div>
      <div style="flex:1;min-width:520px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">DEX Funnel</h3>
        <table><thead><tr>
          <th>DEX</th><th>Players</th><th>Active 24h</th><th>First Trade</th><th>Volume</th><th>Shop</th><th>Token Pay</th>
        </tr></thead><tbody id="growthDexBody"></tbody></table>
      </div>
    </div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Telemetry Events</h2>
    <div class="stats" id="telemetryStats"></div>
    <div style="font-size:12px;color:#9ca3af;margin:-10px 0 14px" id="telemetryNote"></div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px">
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Trade Claim Results 7d</h3>
        <table><thead><tr>
          <th>Result</th><th>Events</th><th>Players</th><th>Gold</th><th>Volume</th><th>Latency</th>
        </tr></thead><tbody id="telemetryTradeBody"></tbody></table>
      </div>
      <div style="flex:1;min-width:520px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Resource Flow 7d</h3>
        <table><thead><tr>
          <th>Source</th><th>Events</th><th>Players</th><th>Gold</th><th>Wood</th><th>Ore</th><th>Lost Cap</th>
        </tr></thead><tbody id="telemetryResourceBody"></tbody></table>
      </div>
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px">
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Shop Funnel 7d</h3>
        <table><thead><tr>
          <th>Step</th><th>Events</th><th>Players</th><th>Errors</th>
        </tr></thead><tbody id="telemetryShopBody"></tbody></table>
      </div>
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Task Claims 7d</h3>
        <table><thead><tr>
          <th>Result</th><th>Events</th><th>Players</th><th>Gold</th><th>Wood</th><th>Ore</th>
        </tr></thead><tbody id="telemetryTaskBody"></tbody></table>
      </div>
    </div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">MCP Agent Usage</h2>
    <div class="stats" id="mcpStats"></div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px">
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Popular MCP requests</h3>
        <table><thead><tr>
          <th>Tool</th><th>24h</th><th>7d</th><th>All</th><th>Errors</th><th>Avg</th><th>Latest</th>
        </tr></thead><tbody id="mcpToolsBody"></tbody></table>
      </div>
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">MCP errors</h3>
        <table><thead><tr>
          <th>Tool</th><th>Status</th><th>Error</th><th>24h</th><th>7d</th><th>All</th>
        </tr></thead><tbody id="mcpErrorsBody"></tbody></table>
      </div>
    </div>
    <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Recent MCP events</h3>
    <table><thead><tr>
      <th>Time</th><th>Player</th><th>Tool</th><th>Status</th><th>Latency</th><th>Error</th>
    </tr></thead><tbody id="mcpRecentBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">DEX Breakdown</h2>
    <div id="dexStats" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px"></div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">GRVT Builder Fees & Proofs</h2>
    <div class="stats" id="grvtBuilderStats"></div>
    <table><thead><tr>
      <th>Time</th><th>Player</th><th>Symbol</th><th>Sub Account</th><th>Notional</th><th>Builder Fee</th><th>Proof</th>
    </tr></thead><tbody id="grvtBuilderProofsBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Device Breakdown</h2>
    <div id="deviceStats" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px"></div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px">
      <div style="flex:1;min-width:360px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Platforms</h3>
        <table><thead><tr>
          <th>Platform</th><th>Players</th><th>Active 24h</th><th>Online</th>
        </tr></thead><tbody id="devicePlatformBody"></tbody></table>
      </div>
      <div style="flex:1;min-width:420px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Devices by DEX</h3>
        <table><thead><tr>
          <th>DEX</th><th>Device</th><th>Players</th><th>Active 24h</th>
        </tr></thead><tbody id="deviceDexBody"></tbody></table>
      </div>
    </div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Futures UI Mode</h2>
    <div id="uiModeStats" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px"></div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Top Traders by DEX</h2>
    <div id="topTradersByDex" style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px"></div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Top Players (by Trophies)</h2>
    <table><thead><tr>
      <th>Name</th><th>DEX</th><th>Trophies</th><th>Gold</th><th>Wood</th><th>Ore</th>
    </tr></thead><tbody id="topPlayersBody"></tbody></table>
  </div>

  <div class="panel" id="tab-tasks">
    <div class="stats" id="tasksSummary"></div>
    <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap">
      <div style="flex:1;min-width:280px;background:#1f2937;border:1px solid #374151;border-radius:12px;padding:14px">
        <h3 style="color:#f59e0b;font-size:13px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Top Quest Hunters</h3>
        <table style="font-size:12px"><thead><tr>
          <th>Player</th><th>Claims</th><th>Gold</th>
        </tr></thead><tbody id="tasksTopPlayers"></tbody></table>
      </div>
      <div style="flex:1;min-width:280px;background:#1f2937;border:1px solid #374151;border-radius:12px;padding:14px">
        <h3 style="color:#f59e0b;font-size:13px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Claims by Type</h3>
        <table style="font-size:12px"><thead><tr>
          <th>Type</th><th>Claims</th>
        </tr></thead><tbody id="tasksByType"></tbody></table>
      </div>
    </div>
    <table><thead><tr>
      <th>ID</th><th>Type</th><th>Title</th><th>Params</th><th>Reward</th><th>Active</th><th>Repeat</th><th>Started</th><th>Claimed</th><th>Rate</th><th>Avg %</th><th>Last Claim</th><th>Actions</th>
    </tr></thead><tbody id="tasksBody"></tbody></table>
  </div>

  <div class="panel" id="tab-tournaments">
    <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap">
      <div style="flex:1;min-width:340px;background:#1f2937;border:1px solid #374151;border-radius:12px;padding:14px">
        <h3 id="tn_form_title" style="color:#f59e0b;font-size:13px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Create Tournament</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label style="font-size:11px;color:#9ca3af">Name<input id="tn_name" placeholder="e.g. Spring Cup" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af">Primary DEX
            <select id="tn_dex" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
              <option value="pacifica">Pacifica</option>
              <option value="avantis">Avantis</option>
              <option value="decibel">Decibel</option>
              <option value="gmx">GMX</option>
              <option value="monad">Perpl</option>
              <option value="phoenix">Phoenix</option>
              <option value="hyperliquid">Hyperliquid</option>
              <option value="risex">RISEx</option>
              <option value="nado">Nado</option>
              <option value="grvt">GRVT</option>
              <option value="hotstuff">Hotstuff</option>
            </select>
          </label>
          <label style="font-size:11px;color:#9ca3af">DEX scope
            <select id="tn_dex_scope" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
              <option value="single">Only primary DEX</option>
              <option value="all">All DEXes</option>
              <option value="custom">Selected DEXes</option>
            </select>
          </label>
          <div id="tn_dexes_box" style="display:none;grid-column:1/-1;background:#0f172a;border:1px solid #374151;border-radius:8px;padding:8px">
            <div style="font-size:11px;color:#fbbf24;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">Eligible DEXes</div>
            <div style="display:grid;grid-template-columns:repeat(4,minmax(100px,1fr));gap:8px">
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="pacifica" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">Pacifica</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="avantis" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">Avantis</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="decibel" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">Decibel</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="gmx" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">GMX</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="monad" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">Perpl</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="phoenix" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">Phoenix</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="hyperliquid" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">Hyperliquid</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="risex" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">RISEx</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="nado" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">Nado</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="grvt" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">GRVT</label>
              <label style="font-size:11px;color:#d1d5db;display:flex;align-items:center;gap:6px"><input data-tn-dex-check value="hotstuff" type="checkbox" onchange="updateTournamentDexScopeUi();updateTournamentTeamUi()" style="width:auto;margin:0">Hotstuff</label>
            </div>
            <div id="tn_dex_hint" style="font-size:11px;color:#9ca3af;margin-top:6px">Pick at least one DEX.</div>
          </div>
          <label style="font-size:11px;color:#9ca3af">Tournament mode
            <select id="tn_mode" onchange="updateTournamentModeUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
              <option value="individual">Individual players</option>
              <option value="dex_vs_dex">DEX vs DEX teams</option>
            </select>
          </label>
          <div id="tn_team_box" style="display:none;grid-column:1/-1;background:#0f172a;border:1px solid #374151;border-radius:8px;padding:8px">
            <div style="font-size:11px;color:#fbbf24;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">DEX vs DEX settings</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">
              <label style="font-size:11px;color:#9ca3af">Winning side metric
                <select id="tn_team_score_by" onchange="updateTournamentTeamUi()" style="width:100%;margin-top:4px;background:#111827;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
                  <option value="volume_usd">Team volume</option>
                  <option value="pnl_usd">Team positive PnL</option>
                  <option value="points">Team custom points</option>
                  <option value="trades_count">Team trades</option>
                  <option value="trophies">Team trophies</option>
                  <option value="gold">Team gold</option>
                </select>
              </label>
              <label style="font-size:11px;color:#9ca3af">Prize split
                <select id="tn_team_prize_mode" onchange="updateTournamentTeamUi()" style="width:100%;margin-top:4px;background:#111827;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
                  <option value="winner_takes_all">Winner takes all</option>
                  <option value="custom_split">Custom DEX split</option>
                </select>
              </label>
              <label style="font-size:11px;color:#9ca3af">Players split team pool by
                <select id="tn_team_member_reward_by" onchange="updateTournamentTeamUi()" style="width:100%;margin-top:4px;background:#111827;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
                  <option value="volume_usd">Player volume</option>
                  <option value="pnl_usd">Player positive PnL</option>
                  <option value="points">Player custom points</option>
                  <option value="trades_count">Player trades</option>
                  <option value="trophies">Player trophies</option>
                  <option value="gold">Player gold</option>
                </select>
              </label>
              <label style="font-size:11px;color:#9ca3af">Attack matching
                <select id="tn_attack_match_policy" onchange="updateTournamentTeamUi()" style="width:100%;margin-top:4px;background:#111827;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
                  <option value="all">Normal matchmaking</option>
                  <option value="enemy_or_non_participant">Block same-team attacks</option>
                  <option value="enemy_only">Enemy teams only</option>
                </select>
              </label>
            </div>
            <div id="tn_team_points_box" style="display:none;margin-top:8px;background:#111827;border:1px solid #374151;border-radius:8px;padding:8px">
              <div style="font-size:11px;color:#fbbf24;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">Team custom point weights</div>
              <div style="display:grid;grid-template-columns:repeat(3,minmax(120px,1fr));gap:8px">
                <label style="font-size:11px;color:#9ca3af"><span style="display:flex;align-items:center;gap:6px"><input id="tn_team_points_trophy_on" type="checkbox" checked onchange="copyTournamentPointWeights('tn_team_points','tn_points');updateTournamentTeamPointsUi();updateTournamentPointsUi()" style="width:auto;margin:0">Trophies %</span><input id="tn_team_points_trophy" type="number" min="0" max="100" step="1" value="20" oninput="copyTournamentPointWeights('tn_team_points','tn_points');updateTournamentTeamPointsUi();updateTournamentPointsUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
                <label style="font-size:11px;color:#9ca3af"><span style="display:flex;align-items:center;gap:6px"><input id="tn_team_points_volume_on" type="checkbox" checked onchange="copyTournamentPointWeights('tn_team_points','tn_points');updateTournamentTeamPointsUi();updateTournamentPointsUi()" style="width:auto;margin:0">Volume %</span><input id="tn_team_points_volume" type="number" min="0" max="100" step="1" value="60" oninput="copyTournamentPointWeights('tn_team_points','tn_points');updateTournamentTeamPointsUi();updateTournamentPointsUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
                <label style="font-size:11px;color:#9ca3af"><span style="display:flex;align-items:center;gap:6px"><input id="tn_team_points_pnl_on" type="checkbox" checked onchange="copyTournamentPointWeights('tn_team_points','tn_points');updateTournamentTeamPointsUi();updateTournamentPointsUi()" style="width:auto;margin:0">Positive PnL %</span><input id="tn_team_points_pnl" type="number" min="0" max="100" step="1" value="20" oninput="copyTournamentPointWeights('tn_team_points','tn_points');updateTournamentTeamPointsUi();updateTournamentPointsUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
              </div>
              <div id="tn_team_points_hint" style="font-size:11px;color:#9ca3af;margin-top:6px">Enabled weights must total 100. Example: 50% trophies + 50% volume.</div>
            </div>
            <div id="tn_team_splits_rows" style="display:none;margin-top:8px"></div>
            <div id="tn_team_hint" style="font-size:11px;color:#9ca3af;margin-top:6px">Select at least two DEXes for a team tournament.</div>
          </div>
          <label style="font-size:11px;color:#9ca3af;grid-column:1/-1">Description<input id="tn_desc" placeholder="optional" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af">Start (UTC, optional)<input id="tn_start" placeholder="2026-05-04 12:00:00" oninput="updateTournamentDailyOverridesUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af">End (UTC, optional)<input id="tn_end" placeholder="2026-05-11 12:00:00" oninput="updateTournamentDailyOverridesUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:8px;margin-top:4px">
            <input id="tn_prereg" type="checkbox" style="width:auto;margin:0"> Pre-registration
          </label>
          <label style="font-size:11px;color:#9ca3af">Registration opens<input id="tn_reg_open" placeholder="optional" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af">Registration closes<input id="tn_reg_close" placeholder="defaults to start" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af">Gold boost (×)<input id="tn_gold" type="number" step="0.1" min="0.1" max="10" value="1" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af">Seeker gold boost (×)<input id="tn_seeker_gold" type="number" step="0.1" min="0.1" max="10" value="1" title="Extra gold multiplier only for Solana Mobile Seeker/Saga users. Use 1.2 for +20%." style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af">Trophy boost (×)<input id="tn_trophy" type="number" step="0.1" min="0.1" max="10" value="1" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af">Shield after raid (hours)<input id="tn_shield_hours" type="number" step="0.25" min="0" max="720" placeholder="blank = default, 0 = none" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
          <label style="font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:8px;margin-top:4px">
            <input id="tn_freeze_trophies" type="checkbox" checked style="width:auto;margin:0"> Freeze main trophies
          </label>
          <label style="font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:8px;margin-top:4px">
            <input id="tn_seeker_only" type="checkbox" style="width:auto;margin:0"> Seeker-only tournament
          </label>
          <label style="font-size:11px;color:#9ca3af">Sort by
            <select id="tn_sort" onchange="updateTournamentPointsUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
              <option value="points">Custom points</option>
              <option value="pnl_usd">PnL (USD)</option>
              <option value="trophies">Trophies</option>
              <option value="volume_usd">Volume (USD)</option>
              <option value="gold">Gold</option>
            </select>
          </label>
          <label style="font-size:11px;color:#9ca3af">Scoring mode
            <select id="tn_scoring_mode" onchange="updateTournamentPointsUi();updateTournamentDailyOverridesUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
              <option value="live">Live scoring</option>
              <option value="daily_pool">Daily pool at 00:00 UTC</option>
            </select>
          </label>
          <label style="font-size:11px;color:#9ca3af">Daily pool points
            <input id="tn_daily_pool_points" type="number" min="1" step="1" value="1000" oninput="updateTournamentPointsUi();updateTournamentDailyOverridesUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
          </label>
          <label style="font-size:11px;color:#9ca3af">Daily pool growth %
            <input id="tn_daily_pool_growth_pct" type="number" min="-99" max="500" step="0.1" value="0" oninput="updateTournamentPointsUi();updateTournamentDailyOverridesUi()" title="Example: 20 means each next UTC day auto pool is 20% larger unless that day has an override." style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
          </label>
          <div id="tn_daily_overrides_box" style="grid-column:1/-1;background:#0f172a;border:1px solid #374151;border-radius:8px;padding:8px">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px">
              <div style="font-size:11px;color:#fbbf24;text-transform:uppercase;letter-spacing:0.4px">Daily pool overrides</div>
              <span id="tn_daily_overrides_hint" style="font-size:11px;color:#9ca3af">Daily pool mode only.</span>
            </div>
            <div id="tn_daily_override_rows" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px"></div>
          </div>
          <div id="tn_points_box" style="grid-column:1/-1;background:#0f172a;border:1px solid #374151;border-radius:8px;padding:8px">
            <div style="font-size:11px;color:#fbbf24;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">Point weights</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              <label style="font-size:11px;color:#9ca3af"><span style="display:flex;align-items:center;gap:6px"><input id="tn_points_trophy_on" type="checkbox" checked onchange="copyTournamentPointWeights('tn_points','tn_team_points');updateTournamentPointsUi();updateTournamentTeamPointsUi()" style="width:auto;margin:0">Trophies %</span><input id="tn_points_trophy" type="number" min="0" max="100" step="1" value="20" oninput="copyTournamentPointWeights('tn_points','tn_team_points');updateTournamentPointsUi();updateTournamentTeamPointsUi()" style="width:100%;margin-top:4px;background:#111827;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
              <label style="font-size:11px;color:#9ca3af"><span style="display:flex;align-items:center;gap:6px"><input id="tn_points_volume_on" type="checkbox" checked onchange="copyTournamentPointWeights('tn_points','tn_team_points');updateTournamentPointsUi();updateTournamentTeamPointsUi()" style="width:auto;margin:0">Volume %</span><input id="tn_points_volume" type="number" min="0" max="100" step="1" value="60" oninput="copyTournamentPointWeights('tn_points','tn_team_points');updateTournamentPointsUi();updateTournamentTeamPointsUi()" style="width:100%;margin-top:4px;background:#111827;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
              <label style="font-size:11px;color:#9ca3af"><span style="display:flex;align-items:center;gap:6px"><input id="tn_points_pnl_on" type="checkbox" checked onchange="copyTournamentPointWeights('tn_points','tn_team_points');updateTournamentPointsUi();updateTournamentTeamPointsUi()" style="width:auto;margin:0">Positive PnL %</span><input id="tn_points_pnl" type="number" min="0" max="100" step="1" value="20" oninput="copyTournamentPointWeights('tn_points','tn_team_points');updateTournamentPointsUi();updateTournamentTeamPointsUi()" style="width:100%;margin-top:4px;background:#111827;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>
            </div>
            <div id="tn_points_hint" style="font-size:11px;color:#9ca3af;margin-top:6px">Enabled weights must total 100. Points are raw, not capped.</div>
          </div>
          <div id="tn_prize_box" style="grid-column:1/-1;background:#0f172a;border:1px solid #374151;border-radius:8px;padding:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
              <div style="font-size:11px;color:#fbbf24;text-transform:uppercase;letter-spacing:0.4px">Prize pool tiers</div>
              <label style="font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:6px">Currency
                <input id="tn_prize_currency" value="USD" maxlength="12" style="width:72px;background:#111827;border:1px solid #374151;border-radius:6px;padding:5px;color:#e5e7eb;text-transform:uppercase">
              </label>
            </div>
            <label style="font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <input id="tn_rewards_cop" type="checkbox" onchange="updateTournamentPrizeUi()" style="width:auto;margin:0"> Rewards in CLASH token (players must enter Solana payout address)
            </label>
            <div id="tn_prize_rows" style="display:flex;flex-direction:column;gap:8px"></div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
              <button type="button" class="btn" onclick="addTournamentPrizeTier()">Add tier</button>
              <button type="button" class="btn" onclick="loadTournamentPrizeExample()" style="background:#4b5563">Load example</button>
              <span id="tn_prize_hint" style="font-size:11px;color:#9ca3af">No prize tiers configured.</span>
            </div>
          </div>
          <label style="font-size:11px;color:#9ca3af">Status
            <select id="tn_status" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="ended">Ended</option>
            </select>
          </label>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
          <button id="tn_submit" class="btn" onclick="saveTournament()">Create</button>
          <button id="tn_cancel" class="btn" style="display:none;background:#4b5563" onclick="resetTournamentForm()">Cancel edit</button>
        </div>
      </div>
      <div style="flex:2;min-width:380px;background:#1f2937;border:1px solid #374151;border-radius:12px;padding:14px">
        <h3 style="color:#f59e0b;font-size:13px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Live Leaderboard</h3>
        <div id="tn_lb_meta" style="font-size:12px;color:#9ca3af;margin-bottom:8px">Pick a tournament below to view its leaderboard.</div>
        <table style="font-size:12px"><thead><tr>
          <th>#</th><th>Player</th><th>Team</th><th>Score</th><th>Prize</th><th>Trophies</th><th>Gold</th><th>Trades</th><th>Volume</th><th>PnL</th><th>Actions</th>
        </tr></thead><tbody id="tn_lb_body"></tbody></table>
        <h3 style="color:#f59e0b;font-size:13px;margin:18px 0 10px;text-transform:uppercase;letter-spacing:0.5px">Daily Point Logs</h3>
        <div id="tn_daily_meta" style="font-size:12px;color:#9ca3af;margin-bottom:8px">Pick a tournament daily log to inspect UTC day awards.</div>
        <div id="tn_daily_body" style="display:flex;flex-direction:column;gap:12px"></div>
      </div>
    </div>
    <table><thead><tr>
      <th>ID</th><th>Name</th><th>DEX</th><th>Access</th><th>Status</th><th>Phase</th><th>Start</th><th>End</th><th>Reg</th><th>Gold×</th><th>Seeker Gold×</th><th>Trophy×</th><th>Shield</th><th>Freeze</th><th>Sort</th><th>Prize</th><th>Volume</th><th>Players</th><th>Actions</th>
    </tr></thead><tbody id="tournamentsBody"></tbody></table>
  </div>

  <div class="panel" id="tab-earnings">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="color:#f59e0b;font-size:20px">Net Commission Earned</h2>
      <button class="btn" onclick="loadEarnings(true)">Refresh on-chain</button>
    </div>
    <div class="stats" id="earningsTotals"></div>
    <div id="earningsCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:8px"></div>
    <div id="earningsMeta" style="color:#6b7280;font-size:12px;margin-top:14px"></div>
    <h3 style="color:#f59e0b;font-size:16px;margin:24px 0 10px">Revenue by Exchange</h3>
    <div class="stats" id="revenueAnalyticsTotals"></div>
    <div style="overflow:auto;margin-top:10px">
      <table style="font-size:12px;min-width:980px"><thead><tr>
        <th>DEX</th><th>24h</th><th>7d</th><th>30d</th><th>All</th><th>Model</th>
      </tr></thead><tbody id="revenueDexWindowBody"></tbody></table>
    </div>
    <h3 style="color:#f59e0b;font-size:16px;margin:24px 0 10px">Tournament Revenue</h3>
    <div id="revenueTournamentMeta" style="color:#6b7280;font-size:12px;margin-bottom:8px"></div>
    <div style="overflow:auto">
      <table style="font-size:12px;min-width:1080px"><thead><tr>
        <th>ID</th><th>Tournament</th><th>DEX</th><th>Status</th><th>Period</th><th>Players</th><th>Trades</th><th>Volume</th><th>Exact</th><th>Estimate</th><th>Source</th>
      </tr></thead><tbody id="revenueTournamentBody"></tbody></table>
    </div>
    <div style="margin-top:18px;padding:12px 14px;background:#0f172a;border:1px solid #1e293b;border-radius:8px;font-size:12px;color:#94a3b8;line-height:1.5">
      <strong style="color:#cbd5e1">Source per DEX:</strong><br>
      • <strong>Pacifica</strong> — sum <code style="color:#fbbf24">builder_fee</code> from <code>/api/v1/builder/trades?builder_code=clashofperps</code> (exact USDC rebate per trade; cumulative).<br>
      • <strong>GMX</strong> — Modelled as <code>volume × fee_per_side × tier_rebate</code>. Volume from local futures.db, tier rate read on-chain from <code>tiers(referrerTiers(affiliate))</code> on GMX ReferralStorage; fee_per_side default 0.05% (env <code>GMX_AVG_FEE_BPS</code>).<br>
      • <strong>Decibel</strong> — Authenticated REST <code>/api/v1/account_overviews?account=&lt;builder-subaccount&gt;</code>: <code>fee_income</code> field, our cumulative builder rebate. Withdrawable USDC shown beside.<br>
      • <strong>Avantis</strong> — Modelled as <code style="color:#fbbf24">volume × fee_per_side × tier1_rebate</code>. Volume from local futures.db (worker+client rows), tier1 rebate read on-chain from <code>referralTiers(1) = 5%</code>, fee_per_side default 0.08% (env <code>AVANTIS_AVG_FEE_BPS</code> to tune).<br>
      • <strong>Phoenix</strong> — reads actual Flight fee-collector <code style="color:#fbbf24">collateral-history transfer</code> events from Phoenix REST / on-chain indexed state. Local volume × bps is shown only as an estimate for comparison; deposits are excluded.<br>
      • <strong>Perpl</strong> — currently shown as $0 commission. We index verified Perpl fills for game rewards, but no builder/referrer fee is passed in our order flow and no exact fee-income source is configured; local volume × bps is only a hypothetical estimate.<br>
      • <strong>Hyperliquid</strong> — reads exact <code style="color:#fbbf24">builderRewards</code> from Hyperliquid <code>/info</code> referral state for our builder wallet. Local volume × bps is shown only as an estimate.
      <br>* <strong>Nado</strong> - reads exact indexed <code style="color:#fbbf24">builder_fee</code> from Nado match events where packed order appendix has our <code>builderId</code>. Local volume x bps is shown only as an estimate.
      <br>* <strong>Hotstuff</strong> - reads locally imported Hotstuff fills verified by broker fee + Clash cloid prefix. The card sums exact <code style="color:#fbbf24">broker_fee</code> stored from Hotstuff fill API; local volume x bps is shown only as an estimate.
    </div>
  </div>

  <div class="panel" id="tab-shop">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="color:#f59e0b;font-size:20px">CoP Shop Purchases</h2>
      <button class="btn" onclick="loadShop()">Refresh</button>
    </div>
    <div class="stats" id="shopSummary"></div>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">AI Chat Billing</h2>
    <div class="stats" id="aiChatBillingSummary"></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#111827;border:1px solid #273244;border-radius:10px;padding:12px;margin:10px 0 18px">
      <label style="font-size:13px;color:#cbd5e1">Free messages per player / day</label>
      <input id="aiFreeMessagesPerDay" type="number" min="0" max="1000" step="1" style="width:110px">
      <button class="btn" onclick="saveAiChatSettings()">Save AI settings</button>
      <span id="aiChatSettingsStatus" style="font-size:12px;color:#94a3b8"></span>
    </div>
    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">AI Usage by Player</h2>
    <table><thead><tr>
      <th>Player</th><th>DEX</th><th>Msgs today</th><th>Msgs 7d</th><th>Msgs all</th><th>Hermes</th><th>MCP</th><th>Credits / pass</th><th>Purchases</th><th>Last chat</th>
    </tr></thead><tbody id="aiChatUsersBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">AI Payments by Chain</h2>
    <table><thead><tr>
      <th>Chain</th><th>Payments</th><th>Buyers</th><th>Gross value</th><th>24h</th><th>7d</th><th>Last</th>
    </tr></thead><tbody id="aiChatPaymentChainsBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">AI Payments by Token</h2>
    <table><thead><tr>
      <th>Chain</th><th>Token</th><th>Payments</th><th>Buyers</th><th>Gross value</th><th>Last</th>
    </tr></thead><tbody id="aiChatPaymentTokensBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">AI Payments by Product / Chain</h2>
    <table><thead><tr>
      <th>Product</th><th>Chain</th><th>Token</th><th>Payments</th><th>Buyers</th><th>Gross value</th><th>Last</th>
    </tr></thead><tbody id="aiChatPaymentProductsBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Recent AI Payments</h2>
    <table><thead><tr>
      <th>Time</th><th>Player</th><th>Product</th><th>Chain / token</th><th>Gross price</th><th>Payer</th><th>Tx</th>
    </tr></thead><tbody id="aiChatPaymentRecentBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">AI Agent Model Stats</h2>
    <table><thead><tr>
      <th>Model</th><th>Requests</th><th>Errors</th><th>Avg</th><th>Last</th>
    </tr></thead><tbody id="aiChatModelBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Recent AI Agent Errors</h2>
    <table><thead><tr>
      <th>Time</th><th>Player</th><th>Intent</th><th>Model</th><th>Duration</th><th>Error / Request</th>
    </tr></thead><tbody id="aiChatErrorsBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Recent AI Agent Logs</h2>
    <table><thead><tr>
      <th>Time</th><th>Player</th><th>Intent</th><th>Status</th><th>Duration</th><th>Model</th><th>Request / Response</th>
    </tr></thead><tbody id="aiChatRecentBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">By Product</h2>
    <table><thead><tr>
      <th>Product</th><th>SKU</th><th>Kind</th><th>Purchases</th><th>Unique buyers</th><th>Gross value</th><th>First</th><th>Last</th>
    </tr></thead><tbody id="shopBySkuBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Top Buyers</h2>
    <table><thead><tr>
      <th>#</th><th>Player</th><th>DEX</th><th>Purchases</th><th>Gross spent</th><th>Last buy</th>
    </tr></thead><tbody id="shopTopBuyersBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Recent purchases (200)</h2>
    <table><thead><tr>
      <th>Time</th><th>Player</th><th>Product</th><th>Gross price</th><th>Payer</th><th>Tx</th>
    </tr></thead><tbody id="shopRecentBody"></tbody></table>
  </div>

  <div class="panel" id="tab-marketplace">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap">
      <div>
        <h2 style="color:#f59e0b;font-size:20px">Custodial Marketplace</h2>
        <div style="color:#6b7280;font-size:12px;margin-top:3px">All cross-chain NFT listings, sales, settlement status, and errors.</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select id="marketplaceOrderFilter" onchange="renderMarketplace()" style="padding:6px 10px;background:#1f2937;border:1px solid #4b5563;border-radius:6px;color:#e5e7eb;font-size:13px">
          <option value="all">All orders</option>
          <option value="open">Open / pending</option>
          <option value="errors">Errors only</option>
          <option value="awaiting_deposit">Awaiting deposit</option>
          <option value="active">Active</option>
          <option value="reserved">Reserved</option>
          <option value="paid">Paid</option>
          <option value="delivering">Delivering</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button class="btn" onclick="loadMarketplace()">Refresh</button>
      </div>
    </div>
    <div class="stats" id="marketplaceSummary"></div>

    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px">
      <div style="flex:1;min-width:360px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">By status</h3>
        <table><thead><tr>
          <th>Status</th><th>Orders</th><th>Open</th><th>Sales</th><th>Sales vol</th><th>Errors</th><th>Latest</th>
        </tr></thead><tbody id="marketplaceStatusBody"></tbody></table>
      </div>
      <div style="flex:1;min-width:360px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">NFT chain</h3>
        <table><thead><tr>
          <th>Chain</th><th>Orders</th><th>Open</th><th>Sales</th><th>Volume</th><th>Errors</th><th>Latest</th>
        </tr></thead><tbody id="marketplaceAssetChainBody"></tbody></table>
      </div>
      <div style="flex:1;min-width:360px">
        <h3 style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Payment chain</h3>
        <table><thead><tr>
          <th>Chain</th><th>Orders</th><th>Open</th><th>Sales</th><th>Volume</th><th>Errors</th><th>Latest</th>
        </tr></thead><tbody id="marketplacePaymentChainBody"></tbody></table>
      </div>
    </div>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Marketplace Errors</h2>
    <table><thead><tr>
      <th>Updated</th><th>Order</th><th>Status</th><th>Asset</th><th>Payment</th><th>Error</th><th>Actions</th>
    </tr></thead><tbody id="marketplaceErrorsBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Recent Orders</h2>
    <table><thead><tr>
      <th>Updated</th><th>Order</th><th>Status</th><th>Asset</th><th>Seller</th><th>Buyer</th><th>Price</th><th>Payment</th><th>Delivery / Payout</th><th>Error</th><th>Actions</th>
    </tr></thead><tbody id="marketplaceOrdersBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Recent Events</h2>
    <table><thead><tr>
      <th>Time</th><th>Event</th><th>Order</th><th>Status</th><th>Asset</th><th>Tx</th><th>Data</th>
    </tr></thead><tbody id="marketplaceEventsBody"></tbody></table>
  </div>

  <div class="panel" id="tab-nft">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap">
      <h2 style="color:#f59e0b;font-size:20px">NFT / Bridge Analytics</h2>
      <button class="btn" onclick="loadNftAnalytics()">Refresh</button>
    </div>
    <div class="stats" id="nftSummary"></div>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">NFT Supply by Chain</h2>
    <table><thead><tr>
      <th>Chain</th><th>NFTs</th><th>RPC</th><th>Raw live count</th>
    </tr></thead><tbody id="nftSupplyBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Bridge Routes</h2>
    <table><thead><tr>
      <th>Route</th><th>Total</th><th>Today</th><th>Pending</th><th>Latest</th>
    </tr></thead><tbody id="bridgeRoutesBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Payment Tokens</h2>
    <table><thead><tr>
      <th>Chain</th><th>Token</th><th>Payments</th><th>Today</th><th>Buyers</th><th>Revenue</th><th>Latest</th>
    </tr></thead><tbody id="paymentTokensBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Payments by Chain</h2>
    <table><thead><tr>
      <th>Chain</th><th>Payments</th><th>Today</th><th>Buyers</th><th>Revenue</th><th>Latest</th>
    </tr></thead><tbody id="paymentChainsBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Marketplace Payment Tokens</h2>
    <table><thead><tr>
      <th>Chain</th><th>Token</th><th>Sales</th><th>Latest</th>
    </tr></thead><tbody id="marketplaceTokensBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Bridge Health Logs</h2>
    <div class="stats" id="bridgeLogStats"></div>
    <table><thead><tr>
      <th>Time</th><th>Status</th><th>Phase</th><th>Route</th><th>Level</th><th>Error / Result</th>
    </tr></thead><tbody id="bridgeLogsBody"></tbody></table>

    <h2 style="color:#f59e0b;font-size:16px;margin:24px 0 8px">Bridge Ledger</h2>
    <table><thead><tr>
      <th>Time</th><th>Route</th><th>Level</th><th>Source ref</th><th>Burn tx</th><th>Destination</th>
    </tr></thead><tbody id="bridgeLedgerBody"></tbody></table>
  </div>

  <div class="panel" id="tab-elfa">
    <div class="stats" id="elfaSummary"></div>
    <h2 style="color:#f59e0b;font-size:16px;margin:16px 0 8px">Per-Symbol Usage</h2>
    <div class="filter">
      <input id="elfaSearch" placeholder="Filter by symbol..." oninput="renderElfaStats()" style="width:200px">
      <button class="btn" onclick="loadElfa()">Refresh</button>
      <span id="elfaCount" style="color:#6b7280;font-size:12px;margin-left:8px"></span>
    </div>
    <table><thead><tr>
      <th>Symbol</th><th>Requests</th><th>Cache Hits</th><th>Fresh Calls</th><th>Credits</th><th>Last Refreshed</th><th>Last Player</th>
    </tr></thead><tbody id="elfaStatsBody"></tbody></table>
    <h2 style="color:#f59e0b;font-size:16px;margin:20px 0 8px">Recent Errors (last 100)</h2>
    <table><thead><tr>
      <th>Time</th><th>Path</th><th>Status</th><th>Message</th>
    </tr></thead><tbody id="elfaErrorsBody"></tbody></table>
  </div>

  <div id="taskStatsModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:999;align-items:center;justify-content:center;padding:20px">
    <div style="background:#1f2937;border:1px solid #374151;border-radius:16px;padding:20px;max-width:760px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2 id="taskStatsTitle" style="color:#f59e0b;font-size:18px">Task stats</h2>
        <button class="btn" onclick="document.getElementById('taskStatsModal').style.display='none'">Close</button>
      </div>
      <div id="taskStatsSummary" style="display:flex;gap:10px;margin-bottom:12px"></div>
      <table><thead><tr>
        <th>Player</th><th>Wallet</th><th>Progress</th><th>Started</th><th>Claimed</th>
      </tr></thead><tbody id="taskStatsBody"></tbody></table>
    </div>
  </div>

  <div id="taskModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:999;align-items:center;justify-content:center;padding:20px">
    <div style="background:#1f2937;border:1px solid #374151;border-radius:16px;padding:24px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto">
      <h2 id="taskFormTitle" style="color:#f59e0b;font-size:20px;margin-bottom:16px">Create Task</h2>
      <div style="display:flex;flex-direction:column;gap:10px">
        <label style="font-size:12px;color:#9ca3af">Type
          <select id="tf_type" onchange="updateTaskFormFields()" style="width:100%;padding:8px;background:#111827;border:1px solid #4b5563;border-radius:6px;color:#fff;margin-top:4px">
            <option value="volume">Volume ($)</option>
            <option value="positions">Positions count</option>
            <option value="combo_volume_attack">Combo: Volume + Attack wins</option>
            <option value="daily_trade_gold">Gold earned from trading (window)</option>
          </select>
        </label>
        <label style="font-size:12px;color:#9ca3af">Title
          <input id="tf_title" style="width:100%;padding:8px;background:#111827;border:1px solid #4b5563;border-radius:6px;color:#fff;margin-top:4px" placeholder="e.g. Trade $500 on BTC">
        </label>
        <label style="font-size:12px;color:#9ca3af">Description
          <input id="tf_desc" style="width:100%;padding:8px;background:#111827;border:1px solid #4b5563;border-radius:6px;color:#fff;margin-top:4px" placeholder="Shown to players">
        </label>
        <div id="tf_fields" style="display:flex;flex-direction:column;gap:10px;padding:12px;background:#111827;border-radius:8px;border:1px solid #374151"></div>
        <div style="display:flex;gap:8px">
          <label style="font-size:12px;color:#9ca3af;flex:1">Reward Gold
            <input type="number" id="tf_rg" value="0" style="width:100%;padding:8px;background:#111827;border:1px solid #4b5563;border-radius:6px;color:#e8b830;margin-top:4px">
          </label>
          <label style="font-size:12px;color:#9ca3af;flex:1">Wood
            <input type="number" id="tf_rw" value="0" style="width:100%;padding:8px;background:#111827;border:1px solid #4b5563;border-radius:6px;color:#6ab344;margin-top:4px">
          </label>
          <label style="font-size:12px;color:#9ca3af;flex:1">Ore
            <input type="number" id="tf_ro" value="0" style="width:100%;padding:8px;background:#111827;border:1px solid #4b5563;border-radius:6px;color:#8a9aaa;margin-top:4px">
          </label>
        </div>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <label style="font-size:13px;color:#e5e7eb"><input type="checkbox" id="tf_active" checked> Active</label>
          <label style="font-size:13px;color:#e5e7eb"><input type="checkbox" id="tf_repeat" onchange="document.getElementById('tf_cooldown').disabled = !this.checked"> Repeatable</label>
          <label style="font-size:12px;color:#9ca3af">Cooldown (h)
            <input type="number" id="tf_cooldown" value="0" disabled style="width:70px;padding:6px;background:#111827;border:1px solid #4b5563;border-radius:6px;color:#fff;margin-left:6px">
          </label>
          <label style="font-size:12px;color:#9ca3af">Order
            <input type="number" id="tf_order" value="0" style="width:60px;padding:6px;background:#111827;border:1px solid #4b5563;border-radius:6px;color:#fff;margin-left:6px">
          </label>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          <button class="btn" onclick="closeTaskForm()">Cancel</button>
          <button class="btn" style="border-color:#34d399;color:#34d399" onclick="saveTask()">Save</button>
        </div>
      </div>
    </div>
  </div>

  <div class="panel" id="tab-replays">
    <div class="filter">
      <span style="color:#9ca3af;font-size:13px">Filter:</span>
      <select id="replayFilter" onchange="renderReplays()">
        <option value="all">All</option>
        <option value="accepted">Accepted</option>
        <option value="rejected">Rejected</option>
      </select>
      <input id="replaySearch" placeholder="Player name..." oninput="renderReplays()" style="width:160px">
    </div>
    <div class="stats" id="replayStats"></div>
    <table><thead><tr>
      <th>ID</th><th>Attacker</th><th>Defender</th><th>Claimed</th><th>Verified</th><th>Reason</th><th>TH HP</th><th>Destroyed</th><th>Loot</th><th>Duration</th><th>Date</th>
    </tr></thead><tbody id="replaysBody"></tbody></table>
  </div>
</div>

<div class="local-tools-backdrop" id="localToolsModal" onclick="if(event.target===this)closeBuildingTools()">
  <div class="local-tools">
    <div class="local-tools-head">
      <div>
        <div class="local-tools-title" id="localToolsTitle">Admin Building Tools</div>
        <div class="local-tools-sub">Admin-only. Can alter live accounts and bypass resource costs.</div>
      </div>
      <button class="btn" onclick="closeBuildingTools()">Close</button>
    </div>
    <div class="local-tools-body">
      <div class="local-tool-section">
        <div class="local-tool-label">Max Village by Town Hall</div>
        <div class="local-tool-buttons" id="localMaxVillageButtons"></div>
      </div>
      <div class="local-tool-section">
        <div class="local-tool-label">Resources</div>
        <div id="localResourceRows"></div>
      </div>
      <div class="local-tool-section">
        <div class="local-tool-label">Account Trophies</div>
        <div class="local-tool-buttons local-trophy-buttons" id="localTrophyRows"></div>
      </div>
      <div class="local-tool-section">
        <div class="local-tool-label">Everything</div>
        <div class="local-tool-buttons local-resource-buttons">
          <button class="btn local-danger local-wide" onclick="maxEverything()">Max Everything</button>
        </div>
      </div>
      <div class="local-tool-section">
        <div class="local-tool-label">Spawn Any Building</div>
        <div id="localBuildingRows"></div>
      </div>
      <div class="local-tool-status" id="localToolsStatus"></div>
    </div>
  </div>
</div>

<script>
let KEY = localStorage.getItem('admin_key') || '';
let players = [], replays = [];
let localToolsPlayer = '';
const ADMIN_BUILDING_TOOL_DEFS = [
  { type: 'altar', label: 'Altar', max: 1 },
  { type: 'archer_tower', label: 'Archer Tower', max: 5 },
  { type: 'barn', label: 'Barn', max: 4 },
  { type: 'mage_tower', label: 'Mage Tower', max: 3 },
  { type: 'mine', label: 'Mine', max: 4 },
  { type: 'port', label: 'Port', max: 4 },
  { type: 'sawmill', label: 'Sawmill', max: 4 },
  { type: 'storage', label: 'Storage', max: 4 },
  { type: 'tombstone', label: 'Tombstone', max: 4 },
  { type: 'town_hall', label: 'Town Hall', max: 4 },
  { type: 'turret', label: 'Turret', max: 5 },
];
const ADMIN_BUILDING_TYPES = ADMIN_BUILDING_TOOL_DEFS.map((b) => b.type);
const ADMIN_RESOURCE_TOOL_DEFS = [
  { key: 'gold', label: 'Gold' },
  { key: 'wood', label: 'Wood' },
  { key: 'ore', label: 'Ore' },
  { key: 'all', label: 'All Resources' },
];
const ADMIN_RESOURCE_AMOUNTS = [
  { label: '+10k', value: 10000 },
  { label: '+50k', value: 50000 },
  { label: '+100k', value: 100000 },
  { label: 'Max', value: 999999999 },
];
const ADMIN_TROPHY_AMOUNTS = [-500, -100, -10, 10, 100, 500];

async function api(path) {
  const r = await fetch('/api' + path, { headers: { 'x-admin-key': KEY } });
  if (r.status === 403) { logout(); throw new Error('Forbidden'); }
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch('/api' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': KEY },
    body: JSON.stringify(body || {}),
  });
  if (r.status === 403) { logout(); throw new Error('Forbidden'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

async function doLogin() {
  KEY = document.getElementById('key').value;
  try {
    await api('/admin/players');
    localStorage.setItem('admin_key', KEY);
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    loadAll();
  } catch {
    document.getElementById('loginErr').style.display = 'block';
  }
}

function logout() {
  localStorage.removeItem('admin_key');
  document.getElementById('login').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    const onclick = t.getAttribute('onclick') || '';
    t.classList.toggle('active', onclick.includes("switchTab('" + name + "')"));
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}

async function loadAll() {
  try {
    [players, replays] = await Promise.all([api('/admin/players'), api('/admin/replays')]);
    renderPlayers();
    renderReplays();
    document.getElementById('refreshInfo').textContent = 'Last refresh: ' + new Date().toLocaleTimeString();
  } catch(e) { console.error(e); }
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function jsq(s) { return String(s || '').replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'").replace(/\\r?\\n/g, ' '); }
function fmtAdminTime(t) { return t ? new Date(String(t).replace(' ', 'T') + 'Z').toLocaleString() : '-'; }
function fmtAdminUsd(v, maxDigits = 2) {
  const n = Number(v) || 0;
  return '$' + n.toLocaleString(undefined, {
    minimumFractionDigits: maxDigits === 0 ? 0 : 2,
    maximumFractionDigits: maxDigits,
  });
}

document.addEventListener('click', (event) => {
  const el = event.target?.closest?.('[data-copy]');
  if (!el) return;
  const text = el.getAttribute('data-copy') || '';
  navigator.clipboard?.writeText?.(text).catch(() => {});
});
function fmtAdminCompactUsd(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  return fmtAdminUsd(n, 0);
}

let PLAYER_ACTIVITY_EXPORT_ROWS = [];

function csvCell(value) {
  const s = String(value == null ? '' : value);
  return /[",\\r\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportPlayerActivityData() {
  const rows = PLAYER_ACTIVITY_EXPORT_ROWS || [];
  const headers = [
    'player_id', 'player', 'dex', 'town_hall', 'buildings',
    'active_days_7d', 'active_days_30d', 'sessions_7d', 'avg_session_min_7d',
    'events_7d', 'battles_7d', 'accepted_battles_7d',
    'futures_volume_usd', 'futures_trades_count', 'futures_by_dex',
    'last_action_at', 'last_action', 'last_seen_at',
  ];
  const lines = [headers.join(',')].concat(rows.map((row) => headers.map((key) => {
    if (key === 'town_hall') return csvCell(row.th_level || 1);
    if (key === 'buildings') return csvCell(row.buildings_count || 0);
    if (key === 'player') return csvCell(row.name || row.id || '');
    if (key === 'futures_by_dex') return csvCell(JSON.stringify(row.futures_by_dex || {}));
    return csvCell(row[key]);
  }).join(',')));
  const blob = new Blob([lines.join('\\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'player-activity-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderPlayers() {
  const shielded   = players.filter(p => p.shield_active).length;
  const pacCount   = players.filter(p => p.dex === 'pacifica').length;
  const avtCount   = players.filter(p => p.dex === 'avantis').length;
  const decCount   = players.filter(p => p.dex === 'decibel').length;
  const gmxCount   = players.filter(p => p.dex === 'gmx').length;
  const monCount   = players.filter(p => p.dex === 'monad').length;
  const phxCount   = players.filter(p => p.dex === 'phoenix').length;
  const hplCount   = players.filter(p => p.dex === 'hyperliquid').length;
  const risCount   = players.filter(p => p.dex === 'risex').length;
  const ndoCount   = players.filter(p => p.dex === 'nado').length;
  const hibCount   = players.filter(p => p.dex === 'hibachi').length;
  const grvtCount  = players.filter(p => p.dex === 'grvt').length;
  const hotCount    = players.filter(p => p.dex === 'hotstuff').length;
  const gmtCount    = players.filter(p => p.dex === 'gmtrade').length;
  const flsCount    = players.filter(p => p.dex === 'flash').length;
  const katCount   = players.filter(p => p.dex === 'katana').length;
  const noDex      = players.filter(p => !p.dex).length;
  // Heartbeat-based presence — counted client-side from /admin/players
  // payload so the badges agree with the per-row "ONLINE" rendering.
  const onlineNow  = players.filter(p => p.online).length;
  const active24h  = players.filter(p => p.active_24h).length;
  const active7d   = players.filter(p => p.active_7d).length;
  document.getElementById('playerStats').innerHTML =
    '<div class="stat"><div class="v">' + players.length + '</div><div class="l">Players</div></div>' +
    '<div class="stat" style="border-color:#22c55e"><div class="v" style="color:#4ade80">' + onlineNow + '</div><div class="l">Online now</div></div>' +
    '<div class="stat" style="border-color:#0ea5e9"><div class="v" style="color:#38bdf8">' + active24h + '</div><div class="l">Active 24h</div></div>' +
    '<div class="stat"><div class="v" style="color:#9ca3af">' + active7d + '</div><div class="l">Active 7d</div></div>' +
    '<div class="stat" style="border-color:#7C3AED"><div class="v" style="color:#a78bfa;font-size:22px">' + pacCount + '</div><div class="l">Pacifica</div></div>' +
    '<div class="stat" style="border-color:#0EA5E9"><div class="v" style="color:#38bdf8;font-size:22px">' + avtCount + '</div><div class="l">Avantis</div></div>' +
    '<div class="stat" style="border-color:#facc15"><div class="v" style="color:#facc15;font-size:22px">' + decCount + '</div><div class="l">Decibel</div></div>' +
    '<div class="stat" style="border-color:#4f46e5"><div class="v" style="color:#a5b4fc;font-size:22px">' + gmxCount + '</div><div class="l">GMX</div></div>' +
    '<div class="stat" style="border-color:#8b5cf6"><div class="v" style="color:#c4b5fd;font-size:22px">' + monCount + '</div><div class="l">Perpl</div></div>' +
    '<div class="stat" style="border-color:#f97316"><div class="v" style="color:#fb923c;font-size:22px">' + phxCount + '</div><div class="l">Phoenix</div></div>' +
    '<div class="stat" style="border-color:#16a34a"><div class="v" style="color:#86efac;font-size:22px">' + hplCount + '</div><div class="l">Hyperliquid</div></div>' +
    '<div class="stat" style="border-color:#e11d48"><div class="v" style="color:#fb7185;font-size:22px">' + risCount + '</div><div class="l">RISEx</div></div>' +
    '<div class="stat" style="border-color:#00b8d9"><div class="v" style="color:#67e8f9;font-size:22px">' + ndoCount + '</div><div class="l">Nado</div></div>' +
    '<div class="stat" style="border-color:#dc2626"><div class="v" style="color:#f87171;font-size:22px">' + hibCount + '</div><div class="l">Hibachi</div></div>' +
    '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24;font-size:22px">' + grvtCount + '</div><div class="l">GRVT</div></div>' +
    '<div class="stat" style="border-color:#ef4444"><div class="v" style="color:#fca5a5;font-size:22px">' + hotCount + '</div><div class="l">Hotstuff</div></div>' +
    '<div class="stat" style="border-color:#06b6d4"><div class="v" style="color:#67e8f9;font-size:22px">' + katCount + '</div><div class="l">Katana</div></div>' +
    '<div class="stat" style="border-color:#0f766e"><div class="v" style="color:#5eead4;font-size:22px">' + gmtCount + '</div><div class="l">GMTrade</div></div>' +
    '<div class="stat" style="border-color:#eab308"><div class="v" style="color:#fde047;font-size:22px">' + flsCount + '</div><div class="l">Flash</div></div>' +
    (noDex > 0 ? '<div class="stat"><div class="v" style="font-size:18px;color:#9ca3af">' + noDex + '</div><div class="l">No DEX set</div></div>' : '') +
    '<div class="stat"><div class="v">' + shielded + '</div><div class="l">Shielded</div></div>' +
    '<div class="stat"><div class="v">' + players.reduce((s,p) => s + p.buildings_count, 0) + '</div><div class="l">Buildings</div></div>' +
    '<div class="stat" style="cursor:pointer;border-color:#f59e0b" onclick="resetAllTrophies()"><div class="v" style="font-size:14px">RESET ALL</div><div class="l">Trophies</div></div>' +
    '<div class="stat" style="cursor:pointer;border-color:#34d399" onclick="addResAll()"><div class="v" style="font-size:14px;color:#34d399">+ RES ALL</div><div class="l">Add Resources</div></div>';

  function dexBadge(d) {
    if (d === 'pacifica') return '<span class="badge" style="background:#4c1d95;color:#ddd6fe">PAC</span>';
    if (d === 'avantis')  return '<span class="badge" style="background:#0c4a6e;color:#bae6fd">AVT</span>';
    if (d === 'decibel')  return '<span class="badge" style="background:#713f12;color:#fde68a">DCB</span>';
    if (d === 'gmx')      return '<span class="badge" style="background:#312e81;color:#c7d2fe">GMX</span>';
    if (d === 'monad')    return '<span class="badge" style="background:#4c1d95;color:#ddd6fe">PER</span>';
    if (d === 'phoenix')  return '<span class="badge" style="background:#7c2d12;color:#fed7aa">PHX</span>';
    if (d === 'hyperliquid') return '<span class="badge" style="background:#14532d;color:#bbf7d0">HL</span>';
    if (d === 'risex') return '<span class="badge" style="background:#7f1d1d;color:#fecdd3">RIS</span>';
    if (d === 'nado') return '<span class="badge" style="background:#164e63;color:#cffafe">NDO</span>';
    if (d === 'hibachi') return '<span class="badge" style="background:#7f1d1d;color:#fecaca">HIB</span>';
    if (d === 'grvt') return '<span class="badge" style="background:#78350f;color:#fde68a">GRVT</span>';
    if (d === 'hotstuff') return '<span class="badge" style="background:#7f1d1d;color:#fecaca">HOT</span>';
    if (d === 'katana') return '<span class="badge" style="background:#164e63;color:#cffafe">KTN</span>';
    if (d === 'gmtrade') return '<span class="badge" style="background:#0f766e;color:#ccfbf1">GMT</span>';
    if (d === 'flash') return '<span class="badge" style="background:#713f12;color:#fef3c7">FLS</span>';
    return '<span class="badge badge-off">—</span>';
  }
  function statusBadge(p) {
    // Per-row presence indicator. Mirrors the headline counts.
    //   ONLINE  = bumped within 5 min     (green)
    //   24h    = within 24 hours          (light blue)
    //   7d     = within 7 days            (gray)
    //   —      = never seen on this column  (the column was added in the
    //                                       last_seen_at migration; legacy
    //                                       sessions filled it on first
    //                                       authenticated request after
    //                                       deploy, so '—' really means
    //                                       "no API call since deploy")
    if (p.online) return '<span class="badge badge-ok">ONLINE</span>';
    if (p.active_24h) return '<span class="badge badge-shield">24h</span>';
    if (p.active_7d)  return '<span class="badge" style="background:#374151;color:#d1d5db">7d</span>';
    return '<span class="badge badge-off">—</span>';
  }
  function uiBadge(m) {
    // Per-player futures UI mode. NULL = user has not yet picked (hasn't
    // opened the futures panel since the feature shipped).
    if (m === 'pro')   return '<span class="badge" style="background:#0ea5e9;color:#fff">PRO</span>';
    if (m === 'basic') return '<span class="badge" style="background:#16a34a;color:#fff">BASIC</span>';
    return '<span class="badge badge-off">—</span>';
  }
  function walletShort(w) {
    if (!w) return '<span class="badge badge-off">—</span>';
    const s = String(w);
    // EVM and Solana addresses are different lengths but the start/end
    // pattern is universally readable.
    const slice = s.length > 12 ? s.slice(0, 6) + '…' + s.slice(-4) : s;
    // Click-to-copy: keep the generated row free of nested inline JS quoting.
    return '<span class="mono" data-copy="' + esc(s) + '" style="cursor:pointer;color:#bae6fd" title="' + esc(s) + '">' + esc(slice) + '</span>';
  }
  function fmtUSD(n) {
    const v = Number(n) || 0;
    if (v >= 1e6) return '$' + (v/1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K';
    return '$' + v.toFixed(0);
  }
  document.getElementById('playersBody').innerHTML = players.map(p =>
    '<tr>' +
    '<td><strong>' + esc(p.name) + '</strong></td>' +
    '<td>' + dexBadge(p.dex) + '</td>' +
    '<td>' + uiBadge(p.futures_mode) + '</td>' +
    '<td>' + walletShort(p.wallet) + '</td>' +
    '<td>' + p.trophies + '</td>' +
    '<td>' + p.level + '</td>' +
    '<td style="color:#e8b830">' + p.gold + '</td>' +
    '<td style="color:#6ab344">' + p.wood + '</td>' +
    '<td style="color:#8a9aaa">' + p.ore + '</td>' +
    '<td style="color:#fbbf24">' + (p.trading_gold || 0) + '</td>' +
    '<td style="color:#9ca3af;font-size:12px">' + fmtUSD(p.trading_volume) + '</td>' +
    '<td>' + p.buildings_count + '</td>' +
    '<td>' + (p.shield_active ? '<span class="badge badge-shield">' + p.shield_remaining + 'm left</span>' : '<span class="badge badge-off">none</span>') + '</td>' +
    '<td title="' + (p.last_seen_age_sec != null ? Math.round(p.last_seen_age_sec/60) + ' min ago' : 'never') + '">' + statusBadge(p) + '</td>' +
    '<td class="mono">' + (p.created_at||'').split(' ')[0] + '</td>' +
    '<td><button class="btn" onclick="addResPlayer(\\'' + esc(p.name) + '\\')">+Res</button> <button class="btn" onclick="adjustAccountTrophies(\\'' + esc(jsq(p.name)) + '\\')">+/- Troph</button> <button class="btn" onclick="openBuildingTools(\\'' + esc(jsq(p.name)) + '\\')">Admin Tools</button> <button class="btn" onclick="resetTrophies(\\'' + esc(p.name) + '\\')">0 Troph</button> <button class="btn" onclick="resetPlayer(\\'' + esc(p.name) + '\\')">Reset</button> <button class="btn btn-danger" onclick="deletePlayer(\\'' + esc(p.name) + '\\')">Delete</button></td>' +
    '</tr>'
  ).join('');
}

function renderReplays() {
  const filter = document.getElementById('replayFilter').value;
  const search = document.getElementById('replaySearch').value.toLowerCase();
  let filtered = replays;
  if (filter !== 'all') filtered = filtered.filter(r => r.verified_result === filter);
  if (search) filtered = filtered.filter(r => (r.attacker_name||'').toLowerCase().includes(search) || (r.defender_name||'').toLowerCase().includes(search));

  const accepted = replays.filter(r => r.verified_result === 'accepted').length;
  const rejected = replays.filter(r => r.verified_result === 'rejected').length;
  document.getElementById('replayStats').innerHTML =
    '<div class="stat"><div class="v">' + replays.length + '</div><div class="l">Total Replays</div></div>' +
    '<div class="stat"><div class="v" style="color:#34d399">' + accepted + '</div><div class="l">Accepted</div></div>' +
    '<div class="stat"><div class="v" style="color:#fca5a5">' + rejected + '</div><div class="l">Rejected</div></div>';

  document.getElementById('replaysBody').innerHTML = filtered.map(r =>
    '<tr>' +
    '<td class="mono">' + r.id + '</td>' +
    '<td>' + esc(r.attacker_name||'?') + '</td>' +
    '<td>' + esc(r.defender_name||'?') + '</td>' +
    '<td>' + r.claimed_result + '</td>' +
    '<td><span class="badge ' + (r.verified_result==='accepted'?'badge-ok':'badge-fail') + '">' + r.verified_result + '</span></td>' +
    '<td style="max-width:200px;word-break:break-word;font-size:12px;color:#9ca3af">' + esc(r.verification_reason||'') + '</td>' +
    '<td>' + (r.sim_th_hp_pct != null ? Math.round(r.sim_th_hp_pct*100) + '%' : '—') + '</td>' +
    '<td>' + (r.sim_buildings_destroyed||0) + '</td>' +
    '<td style="font-size:12px">' + [r.loot_gold&&('G:'+r.loot_gold), r.loot_wood&&('W:'+r.loot_wood), r.loot_ore&&('O:'+r.loot_ore)].filter(Boolean).join(' ') + '</td>' +
    '<td>' + (r.duration_sec ? Math.round(r.duration_sec) + 's' : '—') + '</td>' +
    '<td class="mono">' + (r.created_at||'').replace('T',' ').split('.')[0] + '</td>' +
    '</tr>'
  ).join('');
}

async function resetTrophies(name) {
  if (!confirm('Reset trophies for ' + name + ' to 0?')) return;
  await fetch('/api/admin/players/' + encodeURIComponent(name) + '/reset-trophies', { method: 'POST', headers: { 'x-admin-key': KEY } });
  loadAll();
}

async function resetAllTrophies() {
  if (!confirm('Reset ALL players trophies to 0? This is for new season/tournament.')) return;
  await fetch('/api/admin/reset-all-trophies', { method: 'POST', headers: { 'x-admin-key': KEY } });
  loadAll();
}

async function adjustAccountTrophies(name, quickDelta) {
  const raw = quickDelta == null ? prompt('Account trophy delta for ' + name + ' (use negative to subtract):', '100') : String(quickDelta);
  if (raw === null) return;
  const delta = Math.trunc(Number(raw));
  if (!Number.isFinite(delta) || delta === 0) { alert('Enter a non-zero number.'); return; }
  try {
    const data = await apiPost('/admin/players/' + encodeURIComponent(name) + '/trophies', { delta });
    const sign = data.delta >= 0 ? '+' : '';
    setLocalToolsStatus(name + ' account trophies: ' + data.before + ' -> ' + data.trophies + ' (' + sign + data.delta + ').');
    loadAll();
  } catch (e) {
    alert(e.message || 'Failed to adjust account trophies');
    setLocalToolsStatus('Failed: ' + e.message, true);
  }
}

async function addResAll() {
  const gold = prompt('Gold to add to ALL players:', '1000');
  if (gold === null) return;
  const wood = prompt('Wood:', '1000');
  if (wood === null) return;
  const ore = prompt('Ore:', '1000');
  if (ore === null) return;
  const r = await fetch('/api/admin/add-resources-all', {
    method: 'POST',
    headers: { 'x-admin-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gold: +gold, wood: +wood, ore: +ore })
  });
  const data = await r.json();
  alert('Added to ' + (data.players_updated || 0) + ' players');
  loadAll();
}

async function addResPlayer(name) {
  const gold = prompt('Gold for ' + name + ':', '5000');
  if (gold === null) return;
  const wood = prompt('Wood:', '5000');
  if (wood === null) return;
  const ore = prompt('Ore:', '5000');
  if (ore === null) return;
  await fetch('/api/admin/players/' + encodeURIComponent(name) + '/add-resources', {
    method: 'POST',
    headers: { 'x-admin-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gold: +gold, wood: +wood, ore: +ore })
  });
  loadAll();
}

function setLocalToolsStatus(text, isError) {
  const el = document.getElementById('localToolsStatus');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? '#fca5a5' : '#93c5fd';
}

function renderBuildingTools() {
  const maxBox = document.getElementById('localMaxVillageButtons');
  const rowsBox = document.getElementById('localBuildingRows');
  const resourceBox = document.getElementById('localResourceRows');
  const trophyBox = document.getElementById('localTrophyRows');
  if (!maxBox || !rowsBox || !resourceBox || !trophyBox) return;
  maxBox.innerHTML = [1, 2, 3, 4].map((level) =>
    '<button class="btn" onclick="buildMaxVillage(' + level + ')">' + level + '</button>'
  ).join('');
  resourceBox.innerHTML = ADMIN_RESOURCE_TOOL_DEFS.map((def) => {
    const buttons = ADMIN_RESOURCE_AMOUNTS.map((amount) =>
      '<button class="btn" onclick="addAdminResources(\\'' + def.key + '\\',' + amount.value + ')">' + amount.label + '</button>'
    ).join('');
    return '<div class="local-tool-row">' +
      '<div class="local-tool-name">' + esc(def.label) + '</div>' +
      '<div class="local-tool-buttons local-resource-buttons">' + buttons + '</div>' +
      '</div>';
  }).join('');
  trophyBox.innerHTML = ADMIN_TROPHY_AMOUNTS.map((amount) =>
    '<button class="btn" onclick="adjustAccountTrophies(\\'' + esc(jsq(localToolsPlayer)) + '\\',' + amount + ')">' + (amount > 0 ? '+' : '') + amount + '</button>'
  ).join('') + '<button class="btn local-wide" onclick="adjustAccountTrophies(\\'' + esc(jsq(localToolsPlayer)) + '\\')">Custom</button>';
  rowsBox.innerHTML = ADMIN_BUILDING_TOOL_DEFS.map((def) => {
    const buttons = Array.from({ length: def.max }, (_, i) => {
      const level = i + 1;
      return '<button class="btn" onclick="spawnAdminBuilding(\\'' + def.type + '\\',' + level + ')">' + level + '</button>';
    }).join('');
    return '<div class="local-tool-row">' +
      '<div class="local-tool-name">' + esc(def.label) + '</div>' +
      '<div class="local-tool-buttons">' + buttons + '</div>' +
      '</div>';
  }).join('');
}

function openBuildingTools(name) {
  localToolsPlayer = name;
  document.getElementById('localToolsTitle').textContent = 'Admin Tools - ' + name;
  setLocalToolsStatus('Choose resources, trophies, a building level, or max village preset. These actions affect this account immediately.');
  renderBuildingTools();
  document.getElementById('localToolsModal').style.display = 'flex';
}

function closeBuildingTools() {
  document.getElementById('localToolsModal').style.display = 'none';
}

async function spawnAdminBuilding(type, level) {
  if (!localToolsPlayer) return;
  setLocalToolsStatus('Adding ' + type + ' Lv.' + level + '...');
  try {
    const data = await apiPost('/admin/players/' + encodeURIComponent(localToolsPlayer) + '/add-building', {
      type,
      level,
      auto_slot: true,
      grant_purchase: true,
    });
    setLocalToolsStatus('Added ' + data.building.type + ' Lv.' + data.building.level + ' at grid ' + data.building.grid_index + ' (' + data.building.grid_x + ', ' + data.building.grid_z + ').');
    loadAll();
  } catch (e) {
    setLocalToolsStatus('Failed: ' + e.message, true);
  }
}

async function addAdminResources(kind, amount) {
  if (!localToolsPlayer) return;
  const body = { gold: 0, wood: 0, ore: 0 };
  if (kind === 'all') {
    body.gold = amount;
    body.wood = amount;
    body.ore = amount;
  } else if (body.hasOwnProperty(kind)) {
    body[kind] = amount;
  } else {
    return;
  }
  setLocalToolsStatus('Adding resources...');
  try {
    const data = await apiPost('/admin/players/' + encodeURIComponent(localToolsPlayer) + '/add-resources', body);
    setLocalToolsStatus('Resources: gold ' + data.resources.gold + ', wood ' + data.resources.wood + ', ore ' + data.resources.ore + '.');
    loadAll();
  } catch (e) {
    setLocalToolsStatus('Failed: ' + e.message, true);
  }
}

async function buildMaxVillage(level) {
  if (!localToolsPlayer) return;
  if (!confirm('Clear current buildings and build max TH' + level + ' village for ' + localToolsPlayer + '?')) return;
  setLocalToolsStatus('Building max TH' + level + ' village...');
  try {
    const data = await apiPost('/admin/players/' + encodeURIComponent(localToolsPlayer) + '/max-village', {
      town_hall_level: level,
    });
    setLocalToolsStatus('Built TH' + data.town_hall_level + ' village: ' + data.buildings_added + ' buildings.');
    loadAll();
  } catch (e) {
    setLocalToolsStatus('Failed: ' + e.message, true);
  }
}

async function maxEverything() {
  if (!localToolsPlayer) return;
  if (!confirm('Clear buildings, build max TH4 village, and fill all resources for ' + localToolsPlayer + '?')) return;
  setLocalToolsStatus('Building max village...');
  try {
    const village = await apiPost('/admin/players/' + encodeURIComponent(localToolsPlayer) + '/max-village', {
      town_hall_level: 4,
    });
    const resources = await apiPost('/admin/players/' + encodeURIComponent(localToolsPlayer) + '/add-resources', {
      gold: 999999999,
      wood: 999999999,
      ore: 999999999,
    });
    setLocalToolsStatus('Maxed: ' + village.buildings_added + ' buildings, resources ' + resources.resources.gold + '/' + resources.resources.wood + '/' + resources.resources.ore + '.');
    loadAll();
  } catch (e) {
    setLocalToolsStatus('Failed: ' + e.message, true);
  }
}

async function resetPlayer(name) {
  if (!confirm('Reset ' + name + '? Buildings deleted, resources reset to 10k.')) return;
  await fetch('/api/admin/players/' + encodeURIComponent(name) + '/reset', { method: 'POST', headers: { 'x-admin-key': KEY } });
  loadAll();
}

async function deletePlayer(name) {
  if (!confirm('DELETE ' + name + '? This cannot be undone!')) return;
  await fetch('/api/admin/players/' + encodeURIComponent(name), { method: 'DELETE', headers: { 'x-admin-key': KEY } });
  loadAll();
}

async function loadLogs() {
  try {
    const type = document.getElementById('logFilter').value;
    const url = '/api/admin/logs?limit=200' + (type ? '&type=' + type : '');
    const logs = await api(url.replace('/api', ''));
    document.getElementById('logCount').textContent = logs.length + ' entries';
    document.getElementById('logsBody').innerHTML = logs.reverse().map(l => {
      const typeColor = l.type === 'error' ? '#fca5a5' : l.type === 'battle' ? '#93c5fd' : l.type === 'economy' ? '#34d399' : l.type === 'auth' ? '#c084fc' : '#9ca3af';
      return '<tr>' +
        '<td class="mono" style="white-space:nowrap">' + (l.ts||'').split('T')[1]?.split('.')[0] + '</td>' +
        '<td><span class="badge" style="background:' + typeColor + '22;color:' + typeColor + '">' + l.type + '</span></td>' +
        '<td>' + esc(l.message) + '</td>' +
        '<td class="mono" style="max-width:300px;word-break:break-all;font-size:11px;color:#6b7280">' + (l.data ? esc(JSON.stringify(l.data)) : '') + '</td>' +
      '</tr>';
    }).join('');
  } catch(e) { console.error(e); }
}

function levelColor(level) {
  const l = String(level || '').toLowerCase();
  if (l === 'error' || l === 'onerror' || l === 'unhandledrejection') return '#fca5a5';
  if (l === 'warn') return '#fbbf24';
  if (l === 'debug') return '#a78bfa';
  if (l === 'info' || l === 'log') return '#7dd3fc';
  return '#9ca3af';
}

function formatClientLogTime(value) {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleString();
}

function compactUrl(url) {
  if (!url) return '—';
  try {
    const u = new URL(url);
    return u.pathname + (u.search || '') + (u.hash || '');
  } catch {
    return String(url);
  }
}

function detailsBlock(label, value) {
  if (!value) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return '<details class="log-details"><summary>' + label + '</summary><pre class="log-pre mono">' + esc(text) + '</pre></details>';
}

function fmtDurationMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1000) return Math.round(n) + 'ms';
  if (n < 60_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + 's';
  return Math.round(n / 60_000) + 'm';
}

function actionSummaryBlock(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const recovery = payload.fetch_recovery;
  const action = payload.action || payload.actions?.last || payload.actions?.recent_failures?.[0] || payload.actions?.recovered?.[0];
  const bits = [];
  if (action?.key) {
    bits.push('<strong>Action</strong> ' + esc(action.key));
    if (action.status) bits.push('status=' + esc(action.status));
    if (action.duration_ms != null) bits.push('duration=' + esc(fmtDurationMs(action.duration_ms)));
    if (action.had_error) bits.push('<span style="color:#fca5a5">had error</span>');
    if (action.recovered_after_error) bits.push('<span style="color:#86efac">recovered</span>');
    if (action.last_error) bits.push('last=' + esc(String(action.last_error).slice(0, 120)));
  }
  if (recovery?.path) {
    bits.push('<strong>Fetch recovered</strong> ' + esc(recovery.method || '') + ' ' + esc(recovery.path));
    if (recovery.recovered_after_ms != null) bits.push('after=' + esc(fmtDurationMs(recovery.recovered_after_ms)));
    if (recovery.previous_status || recovery.previous_error) {
      bits.push('from=' + esc(recovery.previous_status || recovery.previous_error));
    }
  }
  if (!bits.length) return '';
  return '<div class="log-action">' + bits.join(' &middot; ') + '</div>';
}

function shortWallet(wallet) {
  const s = String(wallet || '');
  if (!s) return 'no wallet';
  return s.length > 18 ? s.slice(0, 6) + '…' + s.slice(-4) : s;
}

function clientDexBadge(dex) {
  const d = String(dex || 'unknown').toLowerCase();
  const color = d === 'pacifica' ? '#8b5cf6'
    : d === 'avantis' ? '#38bdf8'
    : d === 'decibel' ? '#facc15'
    : d === 'gmx' ? '#a5b4fc'
    : d === 'monad' ? '#c4b5fd'
    : d === 'phoenix' ? '#fb923c'
    : d === 'hyperliquid' ? '#86efac'
    : d === 'risex' ? '#fb7185'
    : d === 'nado' ? '#67e8f9'
    : d === 'hotstuff' ? '#fca5a5'
    : '#9ca3af';
  return '<span class="badge" style="background:' + color + '22;color:' + color + '">' + esc(d) + '</span>';
}

function groupClientLogs(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.player_id ? 'player:' + r.player_id : 'anon:' + (r.ip || '') + ':' + (r.ua || '').slice(0, 80);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        rows: [],
        player_id: r.player_id,
        name: r.player_name || null,
        dex: r.player_dex || null,
        wallet: r.player_wallet || null,
        ip: r.ip || null,
        ua: r.ua || null,
        counts: {},
      };
      map.set(key, g);
    }
    g.rows.push(r);
    const level = String(r.level || 'info').toLowerCase();
    g.counts[level] = (g.counts[level] || 0) + 1;
  }
  return Array.from(map.values());
}

async function loadClientLogs() {
  try {
    const params = new URLSearchParams();
    params.set('limit', '200');
    const level = document.getElementById('clientLogLevel').value;
    const since = document.getElementById('clientLogSince').value;
    const q = document.getElementById('clientLogSearch').value.trim();
    if (level) params.set('level', level);
    if (since) params.set('since_min', since);
    if (q) params.set('q', q);
    const data = await api('/admin/client-logs?' + params.toString());
    const rows = data.rows || [];
    const counts = rows.reduce((acc, r) => {
      const l = String(r.level || 'info').toLowerCase();
      acc[l] = (acc[l] || 0) + 1;
      return acc;
    }, {});
    const serious = (counts.error || 0) + (counts.onerror || 0) + (counts.unhandledrejection || 0);
    document.getElementById('clientLogStats').innerHTML =
      '<div class="stat"><div class="v">' + rows.length + '</div><div class="l">Rows shown</div></div>' +
      '<div class="stat" style="border-color:#ef4444"><div class="v" style="color:#fca5a5">' + serious + '</div><div class="l">Errors</div></div>' +
      '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24">' + (counts.warn || 0) + '</div><div class="l">Warnings</div></div>' +
      '<div class="stat"><div class="v" style="color:#7dd3fc">' + ((counts.info || 0) + (counts.log || 0)) + '</div><div class="l">Info / Log</div></div>' +
      '<div class="stat"><div class="v" style="color:#a78bfa">' + (counts.debug || 0) + '</div><div class="l">Debug</div></div>';
    const groups = groupClientLogs(rows);
    document.getElementById('clientLogCount').textContent =
      rows.length + ' entries · ' + groups.length + ' group' + (groups.length === 1 ? '' : 's') +
      ' · kept ' + (data.retention_days || 7) + 'd max';
    document.getElementById('clientLogsBody').innerHTML = groups.map((g) => {
      const errorCount = (g.counts.error || 0) + (g.counts.onerror || 0) + (g.counts.unhandledrejection || 0);
      const warnCount = g.counts.warn || 0;
      const groupName = g.name || 'Anonymous browser';
      const title = g.name
        ? '<strong>' + esc(groupName) + '</strong> ' + clientDexBadge(g.dex) + '<div class="log-meta mono">' + esc(shortWallet(g.wallet)) + '</div>'
        : '<strong>' + esc(groupName) + '</strong><div class="log-meta">' + esc(g.ip || 'unknown ip') + '</div>';
      const uaLine = g.ua ? '<div class="log-meta" style="max-width:680px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.ua) + '</div>' : '';
      const header =
        '<tr style="background:#111827;border-top:2px solid #374151">' +
          '<td colspan="6" style="padding:12px 14px">' +
            '<div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start">' +
              '<div>' + title + uaLine + '</div>' +
              '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">' +
                '<span class="badge" style="background:#374151;color:#d1d5db">' + g.rows.length + ' logs</span>' +
                (errorCount ? '<span class="badge" style="background:#ef444422;color:#fca5a5">' + errorCount + ' errors</span>' : '') +
                (warnCount ? '<span class="badge" style="background:#f59e0b22;color:#fbbf24">' + warnCount + ' warns</span>' : '') +
              '</div>' +
            '</div>' +
          '</td>' +
        '</tr>';
      const rowsHtml = g.rows.map((r) => {
        const color = levelColor(r.level);
        const cls = 'log-row-' + String(r.level || 'info').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const urlText = compactUrl(r.url);
        const actionSummary = actionSummaryBlock(r.payload);
        const details = actionSummary + detailsBlock('Stack', r.stack) + detailsBlock('Payload', r.payload);
        return '<tr class="' + cls + '">' +
          '<td class="log-meta">' + (r.player_id ? 'player ' + esc(String(r.player_id).slice(0, 8)) : esc(r.ip || 'anonymous')) + '</td>' +
          '<td class="mono" style="white-space:nowrap">' + formatClientLogTime(r.created_at) + '</td>' +
          '<td><span class="badge" style="background:' + color + '22;color:' + color + '">' + esc(r.level || 'info') + '</span></td>' +
          '<td class="mono" style="font-size:11px;color:#cbd5e1">' + esc(r.source || 'client') + '</td>' +
          '<td class="log-msg">' + esc(r.message || '') + '</td>' +
          '<td><div class="log-url" title="' + esc(r.url || '') + '">' + esc(urlText) + '</div>' + (details || '<span class="log-meta">—</span>') + '</td>' +
        '</tr>';
      }).join('');
      return header + rowsHtml;
    }).join('') || '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:24px">No client logs for this filter</td></tr>';
  } catch(e) { console.error(e); }
}

function aiReportCountsHtml(counts) {
  if (!counts || typeof counts !== 'object') return '<span class="log-meta">-</span>';
  const labels = [
    ['client_errors', 'client err'],
    ['client_warnings', 'warn'],
    ['hermes_failures', 'Hermes'],
    ['mcp_failures', 'MCP'],
    ['feedback_problems', 'feedback'],
    ['file_logs', 'file lines'],
  ];
  return labels
    .filter(([key]) => counts[key])
    .map(([key, label]) => '<span class="badge" style="background:#334155;color:#cbd5e1;margin:1px">' + esc(label) + ': ' + esc(counts[key]) + '</span>')
    .join(' ') || '<span class="log-meta">no error evidence</span>';
}

function aiReportHealthBadge(report) {
  const health = report?.report_json?.health_score;
  if (health == null) return '';
  const n = Number(health);
  const color = n >= 85 ? '#4ade80' : n >= 65 ? '#fbbf24' : '#fca5a5';
  return '<span class="badge" style="background:' + color + '22;color:' + color + '">health ' + esc(String(health)) + '</span>';
}

function renderAiReportLatest(report) {
  if (!report) {
    document.getElementById('aiLogReportLatest').innerHTML =
      '<div class="ai-report"><h3>No AI log report yet</h3><div class="log-meta">Use Run now or wait for 00:00 UTC.</div></div>';
    return;
  }
  const markdown = report.report_markdown || report.error || '';
  const json = report.report_json ? JSON.stringify(report.report_json, null, 2) : '';
  document.getElementById('aiLogReportLatest').innerHTML =
    '<div class="ai-report">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap">' +
        '<div>' +
          '<h3>Latest AI Log Report #' + esc(report.id) + ' ' + aiReportHealthBadge(report) + '</h3>' +
          '<div class="log-meta mono">' + esc(fmtAdminTime(report.window_start)) + ' - ' + esc(fmtAdminTime(report.window_end)) + ' UTC В· ' + esc(report.model || '-') + '</div>' +
        '</div>' +
        '<button class="btn" onclick="viewAiLogReport(' + Number(report.id) + ')">Reload full</button>' +
      '</div>' +
      '<pre class="ai-report-pre mono">' + esc(markdown) + '</pre>' +
      (json ? '<details class="log-details" open><summary>Structured JSON</summary><pre class="ai-report-json mono">' + esc(json) + '</pre></details>' : '') +
    '</div>';
}

async function loadAiLogReports() {
  try {
    const data = await api('/admin/ai-log-reports?limit=20');
    const reports = data.reports || [];
    const latest = reports[0] || null;
    const ok = reports.filter(r => r.status === 'ok').length;
    const failed = reports.filter(r => r.status === 'error').length;
    document.getElementById('aiLogReportStats').innerHTML =
      '<div class="stat"><div class="v">' + reports.length + '</div><div class="l">Stored reports</div></div>' +
      '<div class="stat"><div class="v" style="font-size:14px;color:#9ca3af">' + esc(data.model || '-') + '</div><div class="l">Configured model</div></div>' +
      '<div class="stat" style="border-color:#4ade80"><div class="v" style="color:#4ade80">' + ok + '</div><div class="l">OK shown</div></div>' +
      '<div class="stat" style="border-color:#ef4444"><div class="v" style="color:#fca5a5">' + failed + '</div><div class="l">Failed shown</div></div>';
    renderAiReportLatest(latest);
    document.getElementById('aiLogReportStatus').textContent = reports.length + ' reports loaded';
    document.getElementById('aiLogReportsBody').innerHTML = reports.map((r) => {
      const statusColor = r.status === 'ok' ? '#4ade80' : r.status === 'error' ? '#fca5a5' : '#fbbf24';
      const duration = r.duration_ms ? fmtDurationMs(r.duration_ms) : '-';
      return '<tr>' +
        '<td class="mono">' + esc(r.id) + '</td>' +
        '<td class="mono" style="font-size:11px">' + esc(fmtAdminTime(r.window_start)) + '<br>' + esc(fmtAdminTime(r.window_end)) + '</td>' +
        '<td><span class="badge" style="background:' + statusColor + '22;color:' + statusColor + '">' + esc(r.status || '-') + '</span></td>' +
        '<td class="mono" style="font-size:11px">' + esc(r.model || '-') + '</td>' +
        '<td>' + aiReportCountsHtml(r.source_counts) + '</td>' +
        '<td class="mono">' + esc(duration) + '</td>' +
        '<td class="mono" style="font-size:11px">' + esc(fmtAdminTime(r.created_at)) + '</td>' +
        '<td><button class="btn" onclick="viewAiLogReport(' + Number(r.id) + ')">View</button></td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="8" style="color:#6b7280;text-align:center;padding:24px">No reports yet</td></tr>';
  } catch(e) {
    document.getElementById('aiLogReportStatus').style.color = '#fca5a5';
    document.getElementById('aiLogReportStatus').textContent = e.message || String(e);
  }
}

async function viewAiLogReport(id) {
  try {
    const data = await api('/admin/ai-log-reports/' + encodeURIComponent(id));
    renderAiReportLatest(data.report);
  } catch(e) {
    document.getElementById('aiLogReportStatus').style.color = '#fca5a5';
    document.getElementById('aiLogReportStatus').textContent = e.message || String(e);
  }
}

async function runAiLogReport() {
  const status = document.getElementById('aiLogReportStatus');
  status.style.color = '#fbbf24';
  status.textContent = 'Running OpenRouter analysis...';
  try {
    const data = await apiPost('/admin/ai-log-reports/run', { lookback_hours: 24 });
    status.style.color = '#4ade80';
    status.textContent = 'Report #' + data.report.id + ' completed';
    await loadAiLogReports();
  } catch(e) {
    status.style.color = '#fca5a5';
    status.textContent = e.message || String(e);
    await loadAiLogReports().catch(() => {});
  }
}

async function loadFeedback() {
  try {
    const params = new URLSearchParams();
    params.set('limit', '200');
    const kind = document.getElementById('feedbackKind').value;
    const since = document.getElementById('feedbackSince').value;
    const q = document.getElementById('feedbackSearch').value.trim();
    if (kind) params.set('kind', kind);
    if (since) params.set('since_min', since);
    if (q) params.set('q', q);
    const data = await api('/admin/feedback?' + params.toString());
    const rows = data.rows || [];
    const summary = data.summary || {};
    document.getElementById('feedbackStats').innerHTML =
      '<div class="stat"><div class="v">' + (summary.total || 0) + '</div><div class="l">All feedback</div></div>' +
      '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24">' + (summary.day || 0) + '</div><div class="l">Last 24h</div></div>' +
      '<div class="stat" style="border-color:#ef4444"><div class="v" style="color:#fca5a5">' + (summary.problems || 0) + '</div><div class="l">Problems</div></div>' +
      '<div class="stat" style="border-color:#38bdf8"><div class="v" style="color:#7dd3fc">' + (summary.feedback || 0) + '</div><div class="l">Feedback</div></div>';
    document.getElementById('feedbackCount').textContent = rows.length + ' entries shown';
    document.getElementById('feedbackBody').innerHTML = rows.map((r) => {
      const isProblem = r.kind === 'problem';
      const badge = isProblem
        ? '<span class="badge" style="background:#7f1d1d;color:#fecaca">problem</span>'
        : '<span class="badge" style="background:#075985;color:#bae6fd">feedback</span>';
      const player = r.player_name
        ? '<strong>' + esc(r.player_name) + '</strong> ' + clientDexBadge(r.player_dex) + '<div class="log-meta mono">' + esc(shortWallet(r.player_wallet)) + '</div>'
        : '<span class="log-meta">Anonymous</span>';
      const contact = '<div class="feedback-contact">' + esc(r.contact_type || '-') + ': ' + esc(r.contact_value || '-') + '</div>';
      const context = [
        r.page_url ? '<div class="log-url" title="' + esc(r.page_url) + '">' + esc(compactUrl(r.page_url)) + '</div>' : '',
        r.viewport ? '<div class="log-meta">Viewport ' + esc(r.viewport) + '</div>' : '',
        r.ua ? detailsBlock('User agent', r.ua) : '',
      ].join('');
      return '<tr>' +
        '<td class="mono" style="white-space:nowrap">' + formatClientLogTime(r.created_at) + '</td>' +
        '<td>' + badge + '</td>' +
        '<td>' + player + '</td>' +
        '<td>' + contact + '</td>' +
        '<td class="feedback-message">' + esc(r.message || '') + '</td>' +
        '<td>' + (context || '<span class="log-meta">-</span>') + '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:24px">No feedback for this filter</td></tr>';
  } catch(e) { console.error(e); }
}

async function loadStats() {
  try {
    const s = await api('/admin/stats');
    // Activity card row — heartbeat-based presence. Drives the answer
    // to "how many players are actually online / active per day". Any
    // missing fields fall through to 0 so a partial backend (older
    // build that doesn't send the activity block yet) still renders.
    const act = s.activity || {};
    const activityHtml =
      '<div class="stat" style="border-color:#22c55e"><div class="v" style="color:#4ade80">' + (act.online_now || 0) + '</div><div class="l">Online now</div></div>' +
      '<div class="stat" style="border-color:#0ea5e9"><div class="v" style="color:#38bdf8">' + (act.active_24h || 0) + '</div><div class="l">Active 24h</div></div>' +
      '<div class="stat"><div class="v" style="color:#a78bfa">' + (act.active_7d || 0) + '</div><div class="l">Active 7d</div></div>' +
      '<div class="stat"><div class="v" style="color:#9ca3af">' + (act.active_30d || 0) + '</div><div class="l">Active 30d</div></div>';
    document.getElementById('serverStats').innerHTML =
      activityHtml +
      '<div class="stat"><div class="v">' + s.players + '</div><div class="l">Total Players</div></div>' +
      '<div class="stat"><div class="v">' + s.replays + '</div><div class="l">Replays</div></div>' +
      '<div class="stat"><div class="v" style="color:#34d399">' + s.accepted + '</div><div class="l">Accepted</div></div>' +
      '<div class="stat"><div class="v" style="color:#fca5a5">' + s.rejected + '</div><div class="l">Rejected</div></div>' +
      '<div class="stat"><div class="v">' + s.recentBattles + '</div><div class="l">Battles/hr</div></div>' +
      '<div class="stat"><div class="v">' + s.shielded + '</div><div class="l">Shielded</div></div>' +
      '<div class="stat"><div class="v" style="color:#e8b830">' + Math.round(s.economy.totalGold/1000) + 'K</div><div class="l">Total Gold</div></div>' +
      '<div class="stat"><div class="v" style="color:#6ab344">' + Math.round(s.economy.totalWood/1000) + 'K</div><div class="l">Total Wood</div></div>' +
      '<div class="stat"><div class="v" style="color:#8a9aaa">' + Math.round(s.economy.totalOre/1000) + 'K</div><div class="l">Total Ore</div></div>' +
      '<div class="stat"><div class="v">' + Math.floor(s.uptime/60) + 'm</div><div class="l">Uptime</div></div>' +
      '<div class="stat"><div class="v">' + s.memory + 'MB</div><div class="l">Memory</div></div>';

    const pa = s.player_analytics || {};
    const paSummary = pa.summary || {};
    const th = pa.town_hall || {};
    document.getElementById('playerAnalyticsStats').innerHTML =
      '<div class="stat" style="border-color:#38bdf8"><div class="v" style="color:#38bdf8">' + (paSummary.avg_daily_active_7d || 0) + '</div><div class="l">Avg DAU 7d</div></div>' +
      '<div class="stat"><div class="v" style="color:#a78bfa">' + (paSummary.avg_daily_active_30d || 0) + '</div><div class="l">Avg DAU 30d</div></div>' +
      '<div class="stat"><div class="v">' + (paSummary.sessions_7d || 0) + '</div><div class="l">Sessions 7d</div></div>' +
      '<div class="stat" style="border-color:#22c55e"><div class="v" style="color:#4ade80">' + (paSummary.avg_session_min_7d || 0) + 'm</div><div class="l">Avg Session 7d</div></div>' +
      '<div class="stat"><div class="v">' + (paSummary.observed_events_7d || 0) + '</div><div class="l">Observed Events 7d</div></div>' +
      '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24">' + (th.average || 0) + '</div><div class="l">Avg TH</div></div>';
    document.getElementById('playerAnalyticsNote').textContent = paSummary.note || '';

    const thRows = th.distribution || [];
    document.getElementById('thDistributionBody').innerHTML = thRows.length
      ? thRows.map(row => {
          const pct = Number(row.pct || 0);
          return '<tr>' +
            '<td><span class="badge" style="background:#78350f;color:#fde68a">TH' + esc(row.th_level || 1) + '</span></td>' +
            '<td style="font-weight:800">' + (row.players || 0) + '</td>' +
            '<td>' + pct.toFixed(1) + '%</td>' +
            '<td><div style="width:140px;height:8px;background:#111827;border:1px solid #374151;border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.max(0, Math.min(100, pct)) + '%;background:#f59e0b"></div></div></td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="4" style="color:#6b7280;text-align:center;padding:20px">No TH data yet</td></tr>';

    const actionRows = pa.actions || [];
    document.getElementById('playerActionsBody').innerHTML = actionRows.length
      ? actionRows.map(row => '<tr>' +
          '<td class="mono" style="font-size:12px;color:#e5e7eb">' + esc(row.action || '-') + '</td>' +
          '<td style="font-weight:800">' + (row.count || 0) + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="2" style="color:#6b7280;text-align:center;padding:20px">No action events yet</td></tr>';

    const activityRows = pa.players || [];
    PLAYER_ACTIVITY_EXPORT_ROWS = pa.players_export || activityRows;
    document.getElementById('playerActivityBody').innerHTML = activityRows.length
      ? activityRows.map(row => '<tr>' +
          '<td><strong>' + esc(row.name || row.id || '-') + '</strong></td>' +
          '<td>' + dexBadge(row.dex) + ' <span style="color:#9ca3af">' + esc(row.dex || 'unknown') + '</span></td>' +
          '<td><span class="badge" style="background:#78350f;color:#fde68a">TH' + esc(row.th_level || 1) + '</span><div style="font-size:10px;color:#6b7280;margin-top:3px">' + (row.buildings_count || 0) + ' buildings</div></td>' +
          '<td>' + (row.active_days_7d || 0) + '</td>' +
          '<td>' + (row.sessions_7d || 0) + '</td>' +
          '<td>' + (row.avg_session_min_7d || 0) + 'm</td>' +
          '<td>' + (row.events_7d || 0) + '</td>' +
          '<td>' + (row.battles_7d || 0) + ' <span style="color:#4ade80">(' + (row.accepted_battles_7d || 0) + ' ok)</span></td>' +
          '<td><strong>' + fmtAdminCompactUsd(row.futures_volume_usd || 0) + '</strong><div style="font-size:10px;color:#6b7280;margin-top:3px">' + (row.futures_trades_count || 0) + ' trades</div></td>' +
          '<td><div class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtAdminTime(row.last_action_at || row.last_seen_at)) + '</div><div style="font-size:11px;color:#6b7280">' + esc(row.last_action || 'heartbeat') + '</div></td>' +
        '</tr>').join('')
      : '<tr><td colspan="10" style="color:#6b7280;text-align:center;padding:20px">No player activity yet</td></tr>';

    const combat = s.combat || {};
    const combatWindows = combat.windows || [];
    function pctText(v) {
      const n = Number(v) || 0;
      return n.toFixed(1) + '%';
    }
    function combatCard(row, color) {
      return '<div class="stat" style="border-color:' + color + '">' +
        '<div class="v" style="color:' + color + '">' + (row.attacks || 0) + '</div>' +
        '<div class="l">' + esc(row.label || row.key || 'Combat') + ' attacks</div>' +
        '<div style="font-size:11px;color:#9ca3af;margin-top:8px;line-height:1.5">' +
          'win: <strong style="color:#4ade80">' + pctText(row.accepted_win_rate_pct) + '</strong> | ' +
          'accepted: <strong style="color:#e5e7eb">' + pctText(row.acceptance_rate_pct) + '</strong><br>' +
          'TH dmg: <strong style="color:#fbbf24">' + pctText(row.avg_th_damage_pct) + '</strong> | ' +
          'avg loot: <strong style="color:#e8b830">' + Math.round(row.avg_loot_gold || 0) + 'G</strong>' +
        '</div>' +
      '</div>';
    }
    document.getElementById('combatStats').innerHTML = combatWindows.length
      ? combatWindows.map((row, i) => combatCard(row, i === 0 ? '#38bdf8' : (i === 1 ? '#a78bfa' : '#f59e0b'))).join('')
      : '<div style="color:#6b7280;padding:16px">No combat data yet</div>';
    document.getElementById('combatStatsNote').textContent = combat.note || '';

    const gapRows = combat.th_gap_30d || [];
    document.getElementById('combatGapBody').innerHTML = gapRows.length
      ? gapRows.map(row => '<tr>' +
          '<td><span class="badge" style="background:#1f2937;color:#e5e7eb">' + esc(String(row.bucket || '-').replace(/_/g, ' ')) + '</span></td>' +
          '<td style="font-weight:800">' + (row.attacks || 0) + '</td>' +
          '<td style="color:#4ade80">' + pctText(row.accepted_win_rate_pct) + '</td>' +
          '<td>' + pctText(row.acceptance_rate_pct) + '</td>' +
          '<td style="color:#fbbf24">' + pctText(row.avg_th_damage_pct) + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="5" style="color:#6b7280;text-align:center;padding:20px">No TH gap battles yet</td></tr>';

    const attackerRows = combat.top_attackers_30d || [];
    document.getElementById('combatAttackersBody').innerHTML = attackerRows.length
      ? attackerRows.map(row => '<tr>' +
          '<td><strong>' + esc(row.name || row.attacker_id || '-') + '</strong></td>' +
          '<td>' + dexBadge(row.dex) + '</td>' +
          '<td><span class="badge" style="background:#78350f;color:#fde68a">TH' + esc(row.th_level || 1) + '</span></td>' +
          '<td style="font-weight:800">' + (row.attacks || 0) + '</td>' +
          '<td style="color:#4ade80">' + pctText(row.accepted_win_rate_pct) + '</td>' +
          '<td style="color:#e8b830">' + Math.round(row.avg_loot_gold || 0) + 'G</td>' +
        '</tr>').join('')
      : '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:20px">No attackers yet</td></tr>';

    const funnel = s.growth_funnel || {};
    const tradingFunnel = funnel.trading || {};
    const shopFunnel = funnel.shop || {};
    const marketFunnel = funnel.marketplace || {};
    function funnelCard(label, value, sub, color) {
      return '<div class="stat" style="border-color:' + color + '">' +
        '<div class="v" style="color:' + color + '">' + value + '</div>' +
        '<div class="l">' + label + '</div>' +
        (sub ? '<div style="font-size:11px;color:#9ca3af;margin-top:8px;line-height:1.5">' + sub + '</div>' : '') +
      '</div>';
    }
    document.getElementById('growthFunnelStats').innerHTML =
      funnelCard('Trade volume', fmtAdminCompactUsd(tradingFunnel.total_volume || 0), (tradingFunnel.first_trade_players || 0) + ' traders', '#38bdf8') +
      funnelCard('Trade gold paid', Math.round(tradingFunnel.trade_gold_paid || 0).toLocaleString() + 'G', (tradingFunnel.trade_gold_claimers || 0) + ' claimers', '#fbbf24') +
      funnelCard('Shop revenue', fmtAdminUsd(shopFunnel.revenue_usd || 0), (shopFunnel.buyers || 0) + ' buyers', '#4ade80') +
      funnelCard('Project token payers', shopFunnel.project_token_buyers || 0, (shopFunnel.project_token_purchases || 0) + ' purchases', '#a78bfa') +
      funnelCard('Marketplace paid', fmtAdminUsd(marketFunnel.paid_usdc || 0), (marketFunnel.paid_orders || 0) + ' paid orders', '#f97316');
    document.getElementById('growthFunnelNote').textContent = funnel.note || '';

    const funnelRows = funnel.steps || [];
    document.getElementById('growthFunnelBody').innerHTML = funnelRows.length
      ? funnelRows.map(row => '<tr>' +
          '<td><strong>' + esc(row.label || row.key || '-') + '</strong></td>' +
          '<td style="font-weight:800">' + (row.players || 0) + '</td>' +
          '<td>' + pctText(row.from_previous_pct) + '</td>' +
          '<td>' + pctText(row.from_total_pct) + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="4" style="color:#6b7280;text-align:center;padding:20px">No funnel data yet</td></tr>';

    const growthDexRows = funnel.by_dex || [];
    document.getElementById('growthDexBody').innerHTML = growthDexRows.length
      ? growthDexRows.map(row => '<tr>' +
          '<td>' + dexBadge(row.dex) + ' <span style="color:#9ca3af">' + esc(row.dex || 'unknown') + '</span></td>' +
          '<td style="font-weight:800">' + (row.players || 0) + '</td>' +
          '<td>' + (row.active_24h || 0) + '</td>' +
          '<td>' + (row.first_trade_players || 0) + '</td>' +
          '<td style="color:#38bdf8">' + fmtAdminCompactUsd(row.total_volume || 0) + '</td>' +
          '<td>' + (row.shop_buyers || 0) + '</td>' +
          '<td style="color:#a78bfa">' + (row.project_token_buyers || 0) + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:20px">No DEX funnel data yet</td></tr>';

    const telemetry = s.telemetry || {};
    const telemetryWindows = telemetry.windows || [];
    const telemetryDay = telemetryWindows.find(row => row.key === '24h') || telemetryWindows[0] || {};
    const telemetryWeek = telemetryWindows.find(row => row.key === '7d') || telemetryWindows[1] || {};
    document.getElementById('telemetryStats').innerHTML =
      funnelCard('Trade claim events', telemetryWeek.trade_claim_events || 0, (telemetryWeek.trade_gold_paid || 0).toLocaleString() + 'G paid / ' + (telemetryWeek.trade_claim_players || 0) + ' players', '#38bdf8') +
      funnelCard('Shop funnel events', telemetryWeek.shop_events || 0, (telemetryWeek.shop_succeeded || 0) + ' ok / ' + (telemetryWeek.shop_failed || 0) + ' failed', '#4ade80') +
      funnelCard('Resource events', telemetryDay.resource_events || 0, '24h gold delta: ' + (telemetryDay.resource_gold_delta || 0).toLocaleString() + 'G', '#fbbf24') +
      funnelCard('Task claim events', telemetryWeek.task_events || 0, (telemetryWeek.task_paid_events || 0) + ' paid / ' + (telemetryWeek.task_players || 0) + ' players', '#a78bfa');
    document.getElementById('telemetryNote').textContent = telemetry.note || '';

    const telemetryTradeRows = telemetry.trade_claim_results_7d || [];
    document.getElementById('telemetryTradeBody').innerHTML = telemetryTradeRows.length
      ? telemetryTradeRows.map(row => '<tr>' +
          '<td><span class="badge" style="background:#1f2937;color:#e5e7eb">' + esc(row.result || 'unknown') + '</span></td>' +
          '<td style="font-weight:800">' + (row.events || 0) + '</td>' +
          '<td>' + (row.players || 0) + '</td>' +
          '<td style="color:#fbbf24">' + Math.round(row.gold_paid || 0).toLocaleString() + 'G</td>' +
          '<td style="color:#38bdf8">' + fmtAdminCompactUsd(row.volume_usd || 0) + '</td>' +
          '<td>' + Math.round(row.avg_latency_ms || 0) + 'ms</td>' +
        '</tr>').join('')
      : '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:20px">No trade claim telemetry yet</td></tr>';

    const telemetryResourceRows = telemetry.resource_sources_7d || [];
    document.getElementById('telemetryResourceBody').innerHTML = telemetryResourceRows.length
      ? telemetryResourceRows.map(row => '<tr>' +
          '<td class="mono" style="font-size:12px;color:#e5e7eb">' + esc(row.source_type || 'resource_change') + '</td>' +
          '<td style="font-weight:800">' + (row.events || 0) + '</td>' +
          '<td>' + (row.players || 0) + '</td>' +
          '<td style="color:' + ((row.gold_delta || 0) >= 0 ? '#4ade80' : '#f87171') + '">' + Math.round(row.gold_delta || 0).toLocaleString() + 'G</td>' +
          '<td>' + Math.round(row.wood_delta || 0).toLocaleString() + '</td>' +
          '<td>' + Math.round(row.ore_delta || 0).toLocaleString() + '</td>' +
          '<td style="color:#f97316">' + Math.round(row.lost_gold_to_cap || 0).toLocaleString() + 'G</td>' +
        '</tr>').join('')
      : '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:20px">No resource telemetry yet</td></tr>';

    const telemetryShopRows = telemetry.shop_steps_7d || [];
    document.getElementById('telemetryShopBody').innerHTML = telemetryShopRows.length
      ? telemetryShopRows.map(row => '<tr>' +
          '<td class="mono" style="font-size:12px;color:#e5e7eb">' + esc(row.event_type || 'unknown') + '</td>' +
          '<td style="font-weight:800">' + (row.events || 0) + '</td>' +
          '<td>' + (row.players || 0) + '</td>' +
          '<td style="color:' + ((row.errors || 0) ? '#f87171' : '#4ade80') + '">' + (row.errors || 0) + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="4" style="color:#6b7280;text-align:center;padding:20px">No shop telemetry yet</td></tr>';

    const telemetryTaskRows = telemetry.task_results_7d || [];
    document.getElementById('telemetryTaskBody').innerHTML = telemetryTaskRows.length
      ? telemetryTaskRows.map(row => '<tr>' +
          '<td><span class="badge" style="background:#1f2937;color:#e5e7eb">' + esc(row.result || 'unknown') + '</span></td>' +
          '<td style="font-weight:800">' + (row.events || 0) + '</td>' +
          '<td>' + (row.players || 0) + '</td>' +
          '<td style="color:#fbbf24">' + Math.round(row.reward_gold || 0).toLocaleString() + 'G</td>' +
          '<td>' + Math.round(row.reward_wood || 0).toLocaleString() + '</td>' +
          '<td>' + Math.round(row.reward_ore || 0).toLocaleString() + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:20px">No task telemetry yet</td></tr>';

    const mcp = s.mcp || {};
    const mcpSummary = mcp.summary || {};
    const day = mcpSummary.day || {};
    const week = mcpSummary.week || {};
    const all = mcpSummary.all || {};
    function mcpWindowCard(label, row, color) {
      const total = row.total || 0;
      const errors = row.errors || 0;
      const errColor = errors > 0 ? '#f87171' : '#4ade80';
      return '<div class="stat" style="border-color:' + color + '">' +
        '<div class="v" style="color:' + color + '">' + total + '</div>' +
        '<div class="l">' + label + ' calls</div>' +
        '<div style="font-size:11px;color:#9ca3af;margin-top:8px;line-height:1.5">' +
          'players: <strong style="color:#e5e7eb">' + (row.unique_players || 0) + '</strong> | ' +
          'battles: <strong style="color:#e5e7eb">' + (row.ai_battles || 0) + '</strong><br>' +
          'errors: <strong style="color:' + errColor + '">' + errors + '</strong> | ' +
          'avg: <strong style="color:#e5e7eb">' + Math.round(row.avg_duration_ms || 0) + 'ms</strong>' +
        '</div>' +
      '</div>';
    }
    document.getElementById('mcpStats').innerHTML =
      mcpWindowCard('24h', day, '#38bdf8') +
      mcpWindowCard('7d', week, '#a78bfa') +
      mcpWindowCard('All', all, '#f59e0b') +
      '<div class="stat"><div class="v" style="font-size:14px;color:#9ca3af">' + esc(fmtAdminTime(all.latest_at)) + '</div><div class="l">Latest MCP event</div></div>';

    const mcpTools = mcp.popular_tools || [];
    document.getElementById('mcpToolsBody').innerHTML = mcpTools.length
      ? mcpTools.map(row => '<tr>' +
          '<td class="mono" style="font-size:12px;color:#e5e7eb">' + esc(row.tool || '-') + '</td>' +
          '<td>' + (row.day || 0) + '</td>' +
          '<td>' + (row.week || 0) + '</td>' +
          '<td style="font-weight:800">' + (row.total || 0) + '</td>' +
          '<td style="color:' + ((row.errors || 0) ? '#f87171' : '#4ade80') + '">' + (row.errors || 0) + '</td>' +
          '<td>' + Math.round(row.avg_duration_ms || 0) + 'ms</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtAdminTime(row.latest_at)) + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:24px">No MCP calls yet</td></tr>';

    const mcpErrors = mcp.popular_errors || [];
    document.getElementById('mcpErrorsBody').innerHTML = mcpErrors.length
      ? mcpErrors.map(row => '<tr class="log-row-error">' +
          '<td class="mono" style="font-size:12px">' + esc(row.tool || '-') + '</td>' +
          '<td><span class="badge" style="background:#7f1d1d;color:#fecaca">' + esc(row.status || 'error') + '</span></td>' +
          '<td class="log-msg">' + esc(row.error || '-') + '</td>' +
          '<td>' + (row.day || 0) + '</td>' +
          '<td>' + (row.week || 0) + '</td>' +
          '<td style="font-weight:800">' + (row.total || 0) + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:24px">No MCP errors</td></tr>';

    const mcpRecent = mcp.recent || [];
    document.getElementById('mcpRecentBody').innerHTML = mcpRecent.length
      ? mcpRecent.map(row => '<tr class="' + (row.status === 'ok' ? 'log-row-info' : 'log-row-error') + '">' +
          '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtAdminTime(row.created_at)) + '</td>' +
          '<td>' + esc(row.player_name || row.ai_key_prefix || 'unknown') + '</td>' +
          '<td class="mono" style="font-size:12px">' + esc(row.tool || '-') + '</td>' +
          '<td>' + (row.status === 'ok'
            ? '<span class="badge" style="background:#064e3b;color:#86efac">ok</span>'
            : '<span class="badge" style="background:#7f1d1d;color:#fecaca">' + esc(row.status || 'error') + '</span>') + '</td>' +
          '<td>' + (row.duration_ms == null ? '-' : Math.round(row.duration_ms) + 'ms') + '</td>' +
          '<td class="log-msg">' + esc(row.error || '-') + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:24px">No MCP events yet</td></tr>';

    // DEX adoption + rewards breakdown
    function fmtUSD(n) {
      const v = Number(n) || 0;
      if (v >= 1e6) return '$' + (v/1e6).toFixed(1) + 'M';
      if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K';
      return '$' + v.toFixed(0);
    }
    const dex = s.dex || {};
    const byDex = dex.players_by_dex || [];
    const rewards = dex.rewards_by_dex || [];
    const rewardsMap = {};
    for (const r of rewards) rewardsMap[r.dex] = r;
    const activityByDex = dex.activity_by_dex || {};
    const topByDex      = dex.top_by_dex || {};
    const activeByDex   = act.by_dex || [];
    const activeByDexMap = {};
    for (const r of activeByDex) activeByDexMap[r.dex] = r;
    function dexCard(id, name, color, playerCount, tradingGold, volume, extraLines) {
      return (
        '<div style="flex:1;min-width:260px;background:#1f2937;border:2px solid ' + color + ';border-radius:12px;padding:16px">' +
        '<div style="color:' + color + ';font-size:14px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px">' + name + '</div>' +
        '<div style="display:flex;gap:16px;margin-bottom:8px;flex-wrap:wrap">' +
          '<div><div style="font-size:20px;font-weight:800">' + playerCount + '</div><div style="font-size:11px;color:#6b7280">players</div></div>' +
          '<div><div style="font-size:20px;font-weight:800;color:#fbbf24">' + tradingGold + '</div><div style="font-size:11px;color:#6b7280">trade gold</div></div>' +
          '<div><div style="font-size:20px;font-weight:800">' + fmtUSD(volume) + '</div><div style="font-size:11px;color:#6b7280">volume</div></div>' +
        '</div>' +
        (extraLines || '') +
        '</div>'
      );
    }
    function activityLines(dexId) {
      const a = activityByDex[dexId];
      const ab = activeByDexMap[dexId] || {};
      // Two stacked stanzas: futures-side trade activity (only present
      // for DEXes whose worker indexes into futures.db) + main-side
      // heartbeat activity (always present). For Pacifica we never have
      // the trades stanza so we just show the heartbeat one.
      const tradeStanza = a
        ? 'Trades all-time: <strong style="color:#e5e7eb">' + a.total_trades + '</strong> · ' +
          'Trades 24h: <strong style="color:#e5e7eb">' + a.trades_24h + '</strong> · ' +
          'Active traders: <strong style="color:#e5e7eb">' + a.active_traders + '</strong><br>'
        : '';
      const presenceStanza =
        'Online now: <strong style="color:#4ade80">' + (ab.online_now || 0) + '</strong> · ' +
        'Active 24h: <strong style="color:#38bdf8">' + (ab.active_24h || 0) + '</strong> · ' +
        'Active 7d: <strong style="color:#a78bfa">' + (ab.active_7d || 0) + '</strong>';
      return '<div style="font-size:12px;color:#9ca3af;line-height:1.6">' + tradeStanza + presenceStanza + '</div>';
    }
    const pacCount = (byDex.find(x => x.dex === 'pacifica') || {}).n || 0;
    const avtCount = (byDex.find(x => x.dex === 'avantis')  || {}).n || 0;
    const decCount = (byDex.find(x => x.dex === 'decibel')  || {}).n || 0;
    const gmxCount = (byDex.find(x => x.dex === 'gmx')      || {}).n || 0;
    const monCount = (byDex.find(x => x.dex === 'monad')    || {}).n || 0;
    const phxCount = (byDex.find(x => x.dex === 'phoenix')  || {}).n || 0;
    const hplCount = (byDex.find(x => x.dex === 'hyperliquid') || {}).n || 0;
    const risCount = (byDex.find(x => x.dex === 'risex') || {}).n || 0;
    const ndoCount = (byDex.find(x => x.dex === 'nado') || {}).n || 0;
    const hibCount = (byDex.find(x => x.dex === 'hibachi') || {}).n || 0;
    const grvtCount = (byDex.find(x => x.dex === 'grvt') || {}).n || 0;
    const hotCount = (byDex.find(x => x.dex === 'hotstuff') || {}).n || 0;
    const katCount = (byDex.find(x => x.dex === 'katana') || {}).n || 0;
    const gmtCount = (byDex.find(x => x.dex === 'gmtrade') || {}).n || 0;
    const flsCount = (byDex.find(x => x.dex === 'flash') || {}).n || 0;
    const noneCount = (byDex.find(x => x.dex === 'unknown') || {}).n || 0;
    const pacRew = rewardsMap.pacifica || {};
    const avtRew = rewardsMap.avantis  || {};
    const decRew = rewardsMap.decibel  || {};
    const gmxRew = rewardsMap.gmx      || {};
    const monRew = rewardsMap.monad    || {};
    const phxRew = rewardsMap.phoenix  || {};
    const hplRew = rewardsMap.hyperliquid || {};
    const risRew = rewardsMap.risex || {};
    const ndoRew = rewardsMap.nado || {};
    const hibRew = rewardsMap.hibachi || {};
    const grvtRew = rewardsMap.grvt || {};
    const hotRew = rewardsMap.hotstuff || {};
    const katRew = rewardsMap.katana || {};
    const gmtRew = rewardsMap.gmtrade || {};
    const flsRew = rewardsMap.flash || {};
    document.getElementById('dexStats').innerHTML =
      dexCard('pacifica', 'Pacifica · Solana', '#7C3AED', pacCount, pacRew.total_gold || 0, pacRew.total_volume || 0, activityLines('pacifica')) +
      dexCard('avantis',  'Avantis · Base',    '#0EA5E9', avtCount, avtRew.total_gold || 0, avtRew.total_volume || 0, activityLines('avantis')) +
      dexCard('decibel',  'Decibel · Aptos',   '#facc15', decCount, decRew.total_gold || 0, decRew.total_volume || 0, activityLines('decibel')) +
      dexCard('gmx',      'GMX · Arbitrum',    '#4f46e5', gmxCount, gmxRew.total_gold || 0, gmxRew.total_volume || 0, activityLines('gmx')) +
      dexCard('phoenix',  'Phoenix · Solana',  '#f97316', phxCount, phxRew.total_gold || 0, phxRew.total_volume || 0, activityLines('phoenix')) +
      dexCard('monad',    'Perpl / Monad',     '#8b5cf6', monCount, monRew.total_gold || 0, monRew.total_volume || 0, activityLines('monad')) +
      dexCard('hyperliquid', 'Hyperliquid',     '#16a34a', hplCount, hplRew.total_gold || 0, hplRew.total_volume || 0, activityLines('hyperliquid')) +
      dexCard('risex',    'RISEx',             '#e11d48', risCount, risRew.total_gold || 0, risRew.total_volume || 0, activityLines('risex')) +
      dexCard('nado',     'Nado · Ink',        '#00b8d9', ndoCount, ndoRew.total_gold || 0, ndoRew.total_volume || 0, activityLines('nado')) +
      dexCard('hibachi',  'Hibachi',           '#dc2626', hibCount, hibRew.total_gold || 0, hibRew.total_volume || 0, activityLines('hibachi')) +
      dexCard('grvt',     'GRVT / GRVT Exchange', '#f59e0b', grvtCount, grvtRew.total_gold || 0, grvtRew.total_volume || 0, activityLines('grvt')) +
      dexCard('hotstuff', 'Hotstuff',          '#ef4444', hotCount, hotRew.total_gold || 0, hotRew.total_volume || 0, activityLines('hotstuff')) +
      dexCard('katana',   'Katana Perps',      '#06b6d4', katCount, katRew.total_gold || 0, katRew.total_volume || 0, activityLines('katana')) +
      dexCard('gmtrade',   'GMTrade',           '#0f766e', gmtCount, gmtRew.total_gold || 0, gmtRew.total_volume || 0, activityLines('gmtrade')) +
      dexCard('flash',     'Flash Trade',       '#eab308', flsCount, flsRew.total_gold || 0, flsRew.total_volume || 0, activityLines('flash')) +
      (noneCount > 0 ? '<div style="flex:1;min-width:180px;background:#1f2937;border:1px dashed #6b7280;border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:center"><div style="text-align:center"><div style="font-size:28px;font-weight:800;color:#9ca3af">' + noneCount + '</div><div style="font-size:11px;color:#6b7280;margin-top:4px">No DEX set<br/>(legacy accounts)</div></div></div>' : '');

    const grvtBuilder = dex.grvt_builder || {};
    const grvtConfig = grvtBuilder.config || {};
    if (grvtBuilder.error) {
      document.getElementById('grvtBuilderStats').innerHTML =
        '<div class="stat" style="border-color:#ef4444"><div class="v" style="font-size:14px;color:#fca5a5">Unavailable</div><div class="l">' + esc(grvtBuilder.error) + '</div></div>';
      document.getElementById('grvtBuilderProofsBody').innerHTML =
        '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:20px">GRVT builder stats unavailable</td></tr>';
    } else {
      document.getElementById('grvtBuilderStats').innerHTML =
        '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24">' + fmtUSD(grvtBuilder.fee_usd || 0) + '</div><div class="l">Builder fees total</div></div>' +
        '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fde68a">' + fmtUSD(grvtBuilder.fee_24h_usd || 0) + '</div><div class="l">Builder fees 24h</div></div>' +
        '<div class="stat"><div class="v">' + (grvtBuilder.fills || 0) + '</div><div class="l">Verified fills</div></div>' +
        '<div class="stat"><div class="v">' + (grvtBuilder.traders || 0) + '</div><div class="l">Fee traders</div></div>' +
        '<div class="stat"><div class="v">' + fmtUSD(grvtBuilder.volume_usd || 0) + '</div><div class="l">GRVT builder volume</div></div>' +
        '<div class="stat"><div class="v" style="font-size:15px;color:#9ca3af">' + esc(grvtConfig.feeBps ?? 0) + ' bps</div><div class="l">Configured fee</div></div>' +
        '<div class="stat"><div class="v" style="font-size:12px;color:#9ca3af">' + esc(grvtConfig.accountId ? grvtConfig.accountId.slice(0, 8) + '...' + grvtConfig.accountId.slice(-6) : 'missing') + '</div><div class="l">Builder account</div></div>' +
        '<div class="stat"><div class="v" style="font-size:12px;color:#9ca3af">' + esc(grvtConfig.authMode || 'unknown') + '</div><div class="l">Proof source: GRVT fill API</div></div>';
      const proofRows = grvtBuilder.recent_proofs || [];
      document.getElementById('grvtBuilderProofsBody').innerHTML = proofRows.length
        ? proofRows.map(row => '<tr>' +
            '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtAdminTime(row.created_at)) + '</td>' +
            '<td><strong>' + esc(row.name || '?') + '</strong><br><span class="mono" style="font-size:11px;color:#6b7280">' + esc(row.wallet ? row.wallet.slice(0, 6) + '...' + row.wallet.slice(-4) : '-') + '</span></td>' +
            '<td>' + esc(row.symbol || '-') + ' <span style="color:#9ca3af">' + esc(row.side || '') + '</span></td>' +
            '<td class="mono" style="font-size:11px">' + esc(row.sub_account_id || '-') + '</td>' +
            '<td>' + fmtUSD(row.notional_usd || 0) + '</td>' +
            '<td>' + fmtAdminUsd(row.fee_usd || 0, 4) + '<br><span style="font-size:10px;color:#9ca3af">' + esc(row.fee_source || '-') + '</span></td>' +
            '<td class="mono" style="font-size:10px;max-width:260px;word-break:break-all">' +
              'source=' + esc(row.proof_source || '-') + '<br>' +
              'onchain=' + esc(row.onchain_proof || '-') + '<br>' +
              'client=' + esc(row.client_order_id || '-') + '<br>' +
              'order=' + esc(row.order_id || '-') + '<br>' +
              '<span title="' + esc(row.proof_json || '') + '">proof_json=' + (row.proof_json ? 'stored' : 'missing') + '</span>' +
            '</td>' +
          '</tr>').join('')
        : '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:20px">No GRVT builder fills yet</td></tr>';
    }

    // Device breakdown comes from /admin/stats (s.devices). Solana Mobile
    // is server-counted from seeker flags plus UA/payload fallback.
    const devices = s.devices || {};
    const deviceSummary = devices.summary || [];
    const devicePlatforms = devices.platforms || [];
    const deviceByDex = devices.by_dex || [];
    function deviceColor(key) {
      return key === 'solana_mobile' ? '#14f195'
        : key === 'mobile_web' ? '#38bdf8'
        : key === 'tablet_web' ? '#a78bfa'
        : key === 'desktop_web' ? '#f59e0b'
        : key === 'android' ? '#34d399'
        : key === 'ios' ? '#60a5fa'
        : key === 'windows' ? '#38bdf8'
        : key === 'macos' ? '#cbd5e1'
        : key === 'linux' ? '#fbbf24'
        : key === 'bot' ? '#f87171'
        : '#9ca3af';
    }
    function deviceCard(row) {
      const color = deviceColor(row.key);
      return '<div style="flex:1;min-width:210px;background:linear-gradient(180deg,' + color + '1f,' + color + '08);border:1px solid ' + color + ';border-radius:12px;padding:16px">' +
        '<div style="font-size:13px;color:' + color + ';font-weight:800;letter-spacing:0.4px;text-transform:uppercase">' + esc(row.label || row.key) + '</div>' +
        '<div style="font-size:32px;font-weight:900;color:#fff;margin:6px 0 2px">' + (row.players || 0) + '</div>' +
        '<div style="font-size:11px;color:#9ca3af;line-height:1.5">' +
          'Active 24h: <strong style="color:#e5e7eb">' + (row.active_24h || 0) + '</strong><br>' +
          'Online: <strong style="color:#4ade80">' + (row.online_now || 0) + '</strong>' +
        '</div>' +
      '</div>';
    }
    document.getElementById('deviceStats').innerHTML = deviceSummary.length
      ? deviceSummary.map(deviceCard).join('')
      : '<div style="color:#6b7280;padding:16px">No device data yet</div>';
    document.getElementById('devicePlatformBody').innerHTML = devicePlatforms.length
      ? devicePlatforms.map(row => '<tr>' +
          '<td><span class="badge" style="background:' + deviceColor(row.key) + '22;color:' + deviceColor(row.key) + '">' + esc(row.label || row.key) + '</span></td>' +
          '<td style="font-weight:800">' + (row.players || 0) + '</td>' +
          '<td>' + (row.active_24h || 0) + '</td>' +
          '<td style="color:#4ade80">' + (row.online_now || 0) + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="4" style="color:#6b7280;text-align:center;padding:20px">No platform data yet</td></tr>';
    document.getElementById('deviceDexBody').innerHTML = deviceByDex.length
      ? deviceByDex.map(row => '<tr>' +
          '<td>' + dexBadge(row.dex) + ' <span style="color:#9ca3af">' + esc(row.dex || 'unknown') + '</span></td>' +
          '<td><span class="badge" style="background:' + deviceColor(row.device) + '22;color:' + deviceColor(row.device) + '">' + esc(row.label || row.device) + '</span></td>' +
          '<td style="font-weight:800">' + (row.players || 0) + '</td>' +
          '<td>' + (row.active_24h || 0) + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="4" style="color:#6b7280;text-align:center;padding:20px">No device by DEX data yet</td></tr>';

    // Futures UI mode breakdown comes from /admin/stats (s.ui_modes).
    // Server returns an array like [{mode:'pro',n:5}, {mode:'basic',n:12},
    // {mode:'none',n:107}]. Sourcing from the API guarantees stats work
    // even if the user opens this tab before the players list loaded.
    const uiModes = s.ui_modes || [];
    const uiPro    = (uiModes.find(x => x.mode === 'pro')   || {}).n || 0;
    const uiBasic  = (uiModes.find(x => x.mode === 'basic') || {}).n || 0;
    const uiNone   = (uiModes.find(x => x.mode === 'none')  || {}).n || 0;
    const uiTotal  = uiPro + uiBasic;  // denominator only counts players who DID pick
    function uiCard(label, color, count, denom) {
      const pct = denom > 0 ? Math.round((count / denom) * 100) : 0;
      return '<div style="flex:1;min-width:180px;background:linear-gradient(180deg,' + color + '22,' + color + '0a);border:1px solid ' + color + ';border-radius:12px;padding:16px">' +
        '<div style="font-size:13px;color:' + color + ';font-weight:700;letter-spacing:0.4px">' + label + '</div>' +
        '<div style="font-size:32px;font-weight:900;color:#fff;margin:6px 0 2px">' + count + '</div>' +
        '<div style="font-size:11px;color:#9ca3af">' + pct + '% of pickers</div>' +
      '</div>';
    }
    document.getElementById('uiModeStats').innerHTML =
      uiCard('Pro', '#0EA5E9', uiPro, uiTotal) +
      uiCard('Basic', '#16a34a', uiBasic, uiTotal) +
      (uiNone > 0
        ? '<div style="flex:1;min-width:180px;background:#1f2937;border:1px dashed #6b7280;border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:center"><div style="text-align:center"><div style="font-size:28px;font-weight:800;color:#9ca3af">' + uiNone + '</div><div style="font-size:11px;color:#6b7280;margin-top:4px">Not picked yet<br/>(haven\\'t opened futures)</div></div></div>'
        : '');

    // Per-DEX top traders. One column per DEX whose worker indexes into
    // server-futures (Pacifica is intentionally absent from this section
    // because it's custodial — we don't have parity trade rows for it).
    function topTraderTable(dexId, label, color) {
      const rows = topByDex[dexId] || [];
      const body = rows.length
        ? rows.map(p =>
            '<tr>' +
              '<td><strong>' + esc(p.name) + '</strong></td>' +
              '<td class="mono" style="font-size:11px">' + esc(p.wallet ? p.wallet.slice(0,6) + '...' + p.wallet.slice(-4) : '—') + '</td>' +
              '<td>' + fmtUSD(p.volume) + '</td>' +
              '<td>' + p.trades + '</td>' +
            '</tr>'
          ).join('')
        : '<tr><td colspan="4" style="text-align:center;color:#6b7280;padding:20px">No ' + label + ' trades yet</td></tr>';
      return (
        '<div style="flex:1;min-width:340px;background:#1f2937;border:1px solid ' + color + ';border-radius:12px;padding:14px">' +
          '<h3 style="color:' + color + ';font-size:13px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">' + label + '</h3>' +
          '<table style="font-size:12px;width:100%"><thead><tr>' +
            '<th>Name</th><th>Wallet</th><th>Volume</th><th>Trades</th>' +
          '</tr></thead><tbody>' + body + '</tbody></table>' +
        '</div>'
      );
    }
    document.getElementById('topTradersByDex').innerHTML =
      topTraderTable('avantis', 'Avantis · Base',  '#0EA5E9') +
      topTraderTable('decibel', 'Decibel · Aptos', '#facc15') +
      topTraderTable('gmx',     'GMX · Arbitrum',  '#4f46e5') +
      topTraderTable('monad',   'Perpl / Monad',   '#8b5cf6') +
      topTraderTable('hyperliquid', 'Hyperliquid', '#16a34a') +
      topTraderTable('risex',   'RISEx',           '#e11d48') +
      topTraderTable('phoenix', 'Phoenix · Solana', '#f97316') +
      topTraderTable('nado',    'Nado · Ink',       '#00b8d9') +
      topTraderTable('hibachi', 'Hibachi',          '#dc2626');

    document.getElementById('topTradersByDex').innerHTML +=
      topTraderTable('grvt', 'GRVT / GRVT Exchange', '#f59e0b');

    document.getElementById('topTradersByDex').innerHTML +=
      topTraderTable('hotstuff', 'Hotstuff', '#ef4444');

    document.getElementById('topTradersByDex').innerHTML +=
      topTraderTable('katana', 'Katana Perps', '#06b6d4');

    document.getElementById('topTradersByDex').innerHTML +=
      topTraderTable('gmtrade', 'GMTrade', '#0f766e');

    document.getElementById('topTradersByDex').innerHTML +=
      topTraderTable('flash', 'Flash Trade', '#16a34a');

    function dexBadge(d) {
      if (d === 'pacifica') return '<span class="badge" style="background:#4c1d95;color:#ddd6fe">PAC</span>';
      if (d === 'avantis')  return '<span class="badge" style="background:#0c4a6e;color:#bae6fd">AVT</span>';
      if (d === 'decibel')  return '<span class="badge" style="background:#713f12;color:#fde68a">DCB</span>';
      if (d === 'gmx')      return '<span class="badge" style="background:#312e81;color:#c7d2fe">GMX</span>';
      if (d === 'monad')    return '<span class="badge" style="background:#4c1d95;color:#ddd6fe">PER</span>';
      if (d === 'phoenix')  return '<span class="badge" style="background:#7c2d12;color:#fed7aa">PHX</span>';
      if (d === 'hyperliquid') return '<span class="badge" style="background:#14532d;color:#bbf7d0">HL</span>';
      if (d === 'risex') return '<span class="badge" style="background:#7f1d1d;color:#fecdd3">RIS</span>';
      if (d === 'nado') return '<span class="badge" style="background:#164e63;color:#cffafe">NDO</span>';
      if (d === 'hibachi') return '<span class="badge" style="background:#7f1d1d;color:#fecaca">HIB</span>';
      if (d === 'grvt') return '<span class="badge" style="background:#78350f;color:#fde68a">GRVT</span>';
      if (d === 'hotstuff') return '<span class="badge" style="background:#7f1d1d;color:#fecaca">HOT</span>';
      if (d === 'katana') return '<span class="badge" style="background:#164e63;color:#cffafe">KTN</span>';
      if (d === 'gmtrade') return '<span class="badge" style="background:#0f766e;color:#ccfbf1">GMT</span>';
      if (d === 'flash') return '<span class="badge" style="background:#713f12;color:#fef3c7">FLS</span>';
      return '<span class="badge badge-off">—</span>';
    }
    document.getElementById('topPlayersBody').innerHTML = (s.topPlayers||[]).map(p =>
      '<tr><td><strong>' + esc(p.name) + '</strong></td><td>' + dexBadge(p.dex) + '</td><td>' + p.trophies + '</td>' +
      '<td style="color:#e8b830">' + p.gold + '</td><td style="color:#6ab344">' + p.wood + '</td><td style="color:#8a9aaa">' + p.ore + '</td></tr>'
    ).join('');
  } catch(e) { console.error(e); }
}

// ---------- Tasks admin ----------
let editingTaskId = null;

const TASK_FIELD_SPECS = {
  volume: [
    { k: 'symbol', label: 'Symbol (ANY or BTC/ETH/...)', type: 'text', default: 'ANY' },
    { k: 'side', label: 'Side', type: 'select', options: ['any','long','short'], default: 'any' },
    { k: 'target_volume', label: 'Target volume (USD)', type: 'number', default: 100 },
  ],
  positions: [
    { k: 'symbol', label: 'Symbol (ANY or BTC/ETH/...)', type: 'text', default: 'ANY' },
    { k: 'side', label: 'Side', type: 'select', options: ['any','long','short'], default: 'any' },
    { k: 'target_positions', label: 'Positions to open', type: 'number', default: 5 },
    { k: 'count_close', label: 'Count close trades too?', type: 'checkbox', default: false },
  ],
  combo_volume_attack: [
    { k: 'symbol', label: 'Symbol (ANY or BTC/ETH/...)', type: 'text', default: 'ANY' },
    { k: 'side', label: 'Side', type: 'select', options: ['any','long','short'], default: 'any' },
    { k: 'target_volume', label: 'Target volume (USD)', type: 'number', default: 100 },
    { k: 'target_wins', label: 'Attack wins required', type: 'number', default: 1 },
  ],
  daily_trade_gold: [
    { k: 'target_gold', label: 'Target gold earned from trading', type: 'number', default: 1000 },
    { k: 'window_hours', label: 'Window (hours, 24 = daily)', type: 'number', default: 24 },
  ],
};

function updateTaskFormFields(seed) {
  const type = document.getElementById('tf_type').value;
  const specs = TASK_FIELD_SPECS[type] || [];
  const root = document.getElementById('tf_fields');
  root.innerHTML = specs.map(s => {
    const val = seed && seed[s.k] != null ? seed[s.k] : s.default;
    if (s.type === 'select') {
      return '<label style="font-size:12px;color:#9ca3af">' + s.label +
        '<select id="tfp_' + s.k + '" style="width:100%;padding:8px;background:#0b1322;border:1px solid #4b5563;border-radius:6px;color:#fff;margin-top:4px">' +
        s.options.map(o => '<option value="' + o + '"' + (o===val?' selected':'') + '>' + o + '</option>').join('') +
        '</select></label>';
    }
    if (s.type === 'checkbox') {
      return '<label style="font-size:13px;color:#e5e7eb"><input type="checkbox" id="tfp_' + s.k + '"' + (val?' checked':'') + '> ' + s.label + '</label>';
    }
    return '<label style="font-size:12px;color:#9ca3af">' + s.label +
      '<input id="tfp_' + s.k + '" type="' + s.type + '" value="' + (val != null ? val : '') + '" style="width:100%;padding:8px;background:#0b1322;border:1px solid #4b5563;border-radius:6px;color:#fff;margin-top:4px"></label>';
  }).join('');
}

function openTaskForm(task) {
  editingTaskId = task ? task.id : null;
  document.getElementById('taskFormTitle').textContent = task ? 'Edit Task #' + task.id : 'Create Task';
  document.getElementById('tf_type').value = task ? task.type : 'volume';
  document.getElementById('tf_title').value = task ? task.title : '';
  document.getElementById('tf_desc').value = task ? task.description : '';
  document.getElementById('tf_rg').value = task ? task.reward_gold : 0;
  document.getElementById('tf_rw').value = task ? task.reward_wood : 0;
  document.getElementById('tf_ro').value = task ? task.reward_ore : 0;
  document.getElementById('tf_active').checked = task ? !!task.active : true;
  document.getElementById('tf_repeat').checked = task ? !!task.repeatable : false;
  document.getElementById('tf_cooldown').value = task ? (task.cooldown_hours || 0) : 0;
  document.getElementById('tf_cooldown').disabled = !(task && task.repeatable);
  document.getElementById('tf_order').value = task ? (task.sort_order || 0) : 0;
  updateTaskFormFields(task ? task.params : null);
  document.getElementById('taskModal').style.display = 'flex';
}

function closeTaskForm() {
  document.getElementById('taskModal').style.display = 'none';
  editingTaskId = null;
}

async function saveTask() {
  const type = document.getElementById('tf_type').value;
  const specs = TASK_FIELD_SPECS[type] || [];
  const params = {};
  for (const s of specs) {
    const el = document.getElementById('tfp_' + s.k);
    if (!el) continue;
    if (s.type === 'checkbox') params[s.k] = el.checked;
    else if (s.type === 'number') params[s.k] = Number(el.value);
    else params[s.k] = el.value;
  }
  const body = {
    type,
    title: document.getElementById('tf_title').value.trim(),
    description: document.getElementById('tf_desc').value,
    params,
    reward_gold: +document.getElementById('tf_rg').value,
    reward_wood: +document.getElementById('tf_rw').value,
    reward_ore: +document.getElementById('tf_ro').value,
    active: document.getElementById('tf_active').checked,
    repeatable: document.getElementById('tf_repeat').checked,
    cooldown_hours: +document.getElementById('tf_cooldown').value,
    sort_order: +document.getElementById('tf_order').value,
  };
  if (!body.title) { alert('Title required'); return; }
  const url = editingTaskId ? '/api/admin/tasks/' + editingTaskId : '/api/admin/tasks';
  const method = editingTaskId ? 'PATCH' : 'POST';
  const r = await fetch(url, {
    method,
    headers: { 'x-admin-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) { alert('Error: ' + (j.error || r.status)); return; }
  closeTaskForm();
  loadTasks();
}

let TASKS_CACHE = [];

async function loadTasks() {
  try {
    const [list, summary] = await Promise.all([api('/admin/tasks'), api('/admin/tasks-summary')]);
    TASKS_CACHE = list;

    // Summary cards
    const sr = summary.rewards || {};
    document.getElementById('tasksSummary').innerHTML =
      '<div class="stat" style="cursor:pointer;border-color:#34d399" onclick="openTaskForm()"><div class="v" style="font-size:14px;color:#34d399">+ NEW</div><div class="l">Create Quest</div></div>' +
      '<div class="stat"><div class="v">' + summary.total + '</div><div class="l">Total Quests</div></div>' +
      '<div class="stat"><div class="v" style="color:#34d399">' + summary.active + '</div><div class="l">Active</div></div>' +
      '<div class="stat"><div class="v">' + summary.started + '</div><div class="l">Total Starts</div></div>' +
      '<div class="stat"><div class="v" style="color:#34d399">' + summary.claimed + '</div><div class="l">Total Claims</div></div>' +
      '<div class="stat"><div class="v">' + Math.round(summary.completion_rate * 100) + '%</div><div class="l">Completion</div></div>' +
      '<div class="stat"><div class="v">' + summary.unique_players_started + '</div><div class="l">Players Started</div></div>' +
      '<div class="stat"><div class="v">' + summary.unique_players_claimed + '</div><div class="l">Players Claimed</div></div>' +
      '<div class="stat"><div class="v" style="color:#e8b830">' + (sr.gold||0).toLocaleString() + '</div><div class="l">Gold Paid</div></div>' +
      '<div class="stat"><div class="v" style="color:#6ab344">' + (sr.wood||0).toLocaleString() + '</div><div class="l">Wood Paid</div></div>' +
      '<div class="stat"><div class="v" style="color:#8a9aaa">' + (sr.ore||0).toLocaleString() + '</div><div class="l">Ore Paid</div></div>' +
      '<div class="stat"><div class="v" style="color:#93c5fd">' + summary.last_24h.started + ' / ' + summary.last_24h.claimed + '</div><div class="l">24h Starts / Claims</div></div>';

    // Top players
    document.getElementById('tasksTopPlayers').innerHTML = (summary.top_players || []).map(p =>
      '<tr><td><strong>' + esc(p.name) + '</strong></td><td>' + p.claims + '</td><td style="color:#e8b830">' + (p.gold_earned || 0).toLocaleString() + '</td></tr>'
    ).join('') || '<tr><td colspan="3" style="color:#6b7280;text-align:center;padding:12px">No claims yet</td></tr>';

    // Claims by type
    document.getElementById('tasksByType').innerHTML = (summary.by_type || []).map(r =>
      '<tr><td><span class="badge" style="background:#1e3a5f;color:#93c5fd">' + r.type + '</span></td><td>' + r.claims + '</td></tr>'
    ).join('') || '<tr><td colspan="2" style="color:#6b7280;text-align:center;padding:12px">No data</td></tr>';

    // Tasks table
    document.getElementById('tasksBody').innerHTML = list.map(t => {
      const paramsText = Object.entries(t.params || {}).map(([k,v]) => k + '=' + v).join(', ');
      const reward = [t.reward_gold && ('G:' + t.reward_gold), t.reward_wood && ('W:' + t.reward_wood), t.reward_ore && ('O:' + t.reward_ore)].filter(Boolean).join(' ');
      const ratePct = Math.round((t.completion_rate || 0) * 100);
      const avgPct = Math.round((t.avg_progress || 0) * 100);
      const rateColor = ratePct >= 50 ? '#34d399' : ratePct >= 20 ? '#f59e0b' : '#fca5a5';
      const lastClaim = t.last_claim ? t.last_claim.replace('T',' ').split('.')[0].split(' ')[0] : '—';
      return '<tr>' +
        '<td class="mono">' + t.id + '</td>' +
        '<td><span class="badge" style="background:#1e3a5f;color:#93c5fd">' + t.type + '</span></td>' +
        '<td><strong>' + esc(t.title) + '</strong><div style="color:#6b7280;font-size:11px">' + esc(t.description||'') + '</div></td>' +
        '<td class="mono" style="font-size:11px;color:#9ca3af;max-width:200px;word-break:break-all">' + esc(paramsText) + '</td>' +
        '<td>' + reward + '</td>' +
        '<td>' + (t.active ? '<span class="badge badge-ok">on</span>' : '<span class="badge badge-off">off</span>') + '</td>' +
        '<td>' + (t.repeatable ? ('<span class="badge badge-shield">' + t.cooldown_hours + 'h</span>') : '—') + '</td>' +
        '<td>' + (t.started_count || 0) + '</td>' +
        '<td style="color:#34d399">' + (t.claimed_count || 0) + '</td>' +
        '<td style="color:' + rateColor + ';font-weight:700">' + ratePct + '%</td>' +
        '<td><div style="width:60px;height:6px;background:#111827;border-radius:3px;overflow:hidden;border:1px solid #374151"><div style="width:' + avgPct + '%;height:100%;background:#f59e0b"></div></div><div style="font-size:10px;color:#9ca3af;margin-top:2px">' + avgPct + '%</div></td>' +
        '<td class="mono" style="font-size:11px;color:#9ca3af">' + lastClaim + '</td>' +
        '<td><button class="btn" onclick="taskStats(' + t.id + ')">Stats</button> <button class="btn" onclick="editTask(' + t.id + ')">Edit</button> <button class="btn" onclick="toggleTask(' + t.id + ',' + (t.active?0:1) + ')">' + (t.active?'Disable':'Enable') + '</button> <button class="btn" onclick="resetTaskProgress(' + t.id + ')" style="border-color:#f59e0b;color:#f59e0b">Reset</button> <button class="btn btn-danger" onclick="deleteTask(' + t.id + ')">Del</button></td>' +
        '</tr>';
    }).join('');
  } catch(e) { console.error(e); }
}

function editTask(id) {
  const task = TASKS_CACHE.find(t => t.id === id);
  if (task) openTaskForm(task);
}

async function toggleTask(id, active) {
  await fetch('/api/admin/tasks/' + id, {
    method: 'PATCH',
    headers: { 'x-admin-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: !!active }),
  });
  loadTasks();
}

async function taskStats(id) {
  try {
    const s = await api('/admin/tasks/' + id + '/players');
    document.getElementById('taskStatsTitle').textContent = 'Stats: ' + s.task.title + ' (#' + s.task.id + ')';
    document.getElementById('taskStatsSummary').innerHTML =
      '<div class="stat"><div class="v">' + s.started + '</div><div class="l">Started</div></div>' +
      '<div class="stat"><div class="v" style="color:#34d399">' + s.claimed + '</div><div class="l">Claimed</div></div>' +
      '<div class="stat"><div class="v" style="color:#fbbf24">' + (s.paid_claims || 0) + '</div><div class="l">Paid claims</div></div>' +
      '<div class="stat"><div class="v" style="color:#fca5a5">' + (s.started - s.claimed) + '</div><div class="l">In progress</div></div>';
    document.getElementById('taskStatsBody').innerHTML = (s.players || []).map(p => {
      const pct = p.target_value > 0 ? Math.min(100, Math.round((p.progress_value / p.target_value) * 100)) : 0;
      const progBar = '<div style="width:120px;height:8px;background:#111827;border-radius:4px;overflow:hidden;border:1px solid #374151"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#f59e0b,#d97706)"></div></div>' +
        '<div style="font-size:10px;color:#9ca3af;margin-top:2px">' + Math.floor(p.progress_value||0) + ' / ' + Math.floor(p.target_value||0) + ' (' + pct + '%)</div>';
      const walletShort = p.wallet ? (p.wallet.slice(0,4) + '…' + p.wallet.slice(-4)) : '—';
      return '<tr>' +
        '<td><strong>' + esc(p.player_name || p.player_id) + '</strong><div style="font-size:10px;color:#fbbf24">' + (p.paid_claim_count || 0) + ' paid / ' + (p.attempt_count || 0) + ' attempts</div></td>' +
        '<td class="mono" style="font-size:11px;color:#9ca3af">' + walletShort + '</td>' +
        '<td>' + progBar + '</td>' +
        '<td class="mono" style="font-size:11px">' + (p.started_at || '—').replace('T',' ').split('.')[0] + '</td>' +
        '<td>' + (p.claimed_at ? '<span class="badge badge-ok">' + p.claimed_at.replace('T',' ').split('.')[0] + '</span>' : '<span class="badge badge-off">—</span>') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:20px">No players yet</td></tr>';
    document.getElementById('taskStatsModal').style.display = 'flex';
  } catch(e) { alert('Error: ' + e.message); }
}

async function resetTaskProgress(id) {
  if (!confirm('Reset all player progress for task #' + id + '? This wipes snapshots so everyone restarts from now.')) return;
  const r = await fetch('/api/admin/tasks/' + id + '/reset-progress', { method: 'POST', headers: { 'x-admin-key': KEY } });
  const j = await r.json();
  alert('Removed ' + (j.removed || 0) + ' player records');
  loadTasks();
}

async function deleteTask(id) {
  if (!confirm('Delete task #' + id + '?')) return;
  await fetch('/api/admin/tasks/' + id, { method: 'DELETE', headers: { 'x-admin-key': KEY } });
  loadTasks();
}

// ---------- Tournaments admin ----------
let TOURNAMENTS_CACHE = [];
let TOURNAMENT_LB_ID = null;
let TOURNAMENT_EDIT_ID = null;
const TOURNAMENT_DEXES_ADMIN = ['pacifica', 'avantis', 'decibel', 'gmx', 'monad', 'phoenix', 'hyperliquid', 'risex', 'nado', 'hibachi', 'hotstuff', 'grvt', 'katana', 'gmtrade', 'flash'];
const TOURNAMENT_DEX_LABELS_ADMIN = {
  pacifica: 'Pacifica',
  avantis: 'Avantis',
  decibel: 'Decibel',
  gmx: 'GMX',
  monad: 'Perpl',
  phoenix: 'Phoenix',
  hyperliquid: 'Hyperliquid',
  risex: 'RISEx',
  nado: 'Nado',
  hibachi: 'Hibachi',
  grvt: 'GRVT',
  hotstuff: 'Hotstuff',
  katana: 'Katana Perps',
  gmtrade: 'GMTrade',
  flash: 'Flash Trade',
};
const TOURNAMENT_TEAM_METRIC_LABELS_ADMIN = {
  volume_usd: 'Volume',
  pnl_usd: 'Positive PnL',
  points: 'Custom points',
  trades_count: 'Trades',
  trophies: 'Trophies',
  gold: 'Gold',
};

function tournamentDexLabel(dex) {
  return TOURNAMENT_DEX_LABELS_ADMIN[dex] || dex || '';
}

function tournamentTeamMetricLabel(metric) {
  return TOURNAMENT_TEAM_METRIC_LABELS_ADMIN[metric] || metric || 'Volume';
}

function tournamentAttackPolicyLabel(policy) {
  if (policy === 'enemy_or_non_participant') return 'Block same-team attacks';
  if (policy === 'enemy_only') return 'Enemy teams only';
  return 'Normal matchmaking';
}

function selectedTournamentDexes() {
  const scope = document.getElementById('tn_dex_scope')?.value || 'single';
  if (scope === 'all') return TOURNAMENT_DEXES_ADMIN.slice();
  if (scope === 'custom') {
    return Array.from(document.querySelectorAll('[data-tn-dex-check]:checked'))
      .map(el => el.value)
      .filter(d => TOURNAMENT_DEXES_ADMIN.includes(d));
  }
  const dex = document.getElementById('tn_dex')?.value || 'pacifica';
  return TOURNAMENT_DEXES_ADMIN.includes(dex) ? [dex] : ['pacifica'];
}

function setTournamentDexSelection(dexes) {
  const set = new Set((Array.isArray(dexes) ? dexes : []).filter(d => TOURNAMENT_DEXES_ADMIN.includes(d)));
  document.querySelectorAll('[data-tn-dex-check]').forEach((el) => { el.checked = set.has(el.value); });
}

function tournamentDexScopeLabel(t) {
  const list = Array.isArray(t?.eligible_dexes) && t.eligible_dexes.length
    ? t.eligible_dexes
    : (t?.dex ? [t.dex] : []);
  if (t?.dex_scope === 'all' || list.length === TOURNAMENT_DEXES_ADMIN.length) return 'All DEXes';
  if (list.length > 1) return list.map(tournamentDexLabel).join(', ');
  return tournamentDexLabel(list[0] || t?.dex || 'pacifica');
}

function updateTournamentDexScopeUi() {
  const scope = document.getElementById('tn_dex_scope')?.value || 'single';
  const primary = document.getElementById('tn_dex');
  const box = document.getElementById('tn_dexes_box');
  const hint = document.getElementById('tn_dex_hint');
  if (primary) primary.disabled = scope === 'all';
  if (box) box.style.display = scope === 'custom' ? 'block' : 'none';
  if (scope === 'custom' && selectedTournamentDexes().length === 0 && primary) {
    setTournamentDexSelection([primary.value || 'pacifica']);
  }
  if (hint) {
    const list = selectedTournamentDexes();
    hint.style.color = list.length ? '#9ca3af' : '#fca5a5';
    hint.textContent = scope === 'all'
      ? 'Every DEX can join this tournament.'
      : scope === 'custom'
        ? (list.length ? list.map(tournamentDexLabel).join(', ') + ' can join.' : 'Pick at least one DEX.')
        : tournamentDexLabel(primary?.value || 'pacifica') + ' players can join.';
  }
}

function readTournamentTeamSplits() {
  const mode = document.getElementById('tn_team_prize_mode')?.value || 'winner_takes_all';
  if (mode !== 'custom_split') return [];
  return Array.from(document.querySelectorAll('[data-team-split-dex]')).map((el) => ({
    dex: el.getAttribute('data-team-split-dex'),
    share_pct: Math.max(0, Math.min(100, Number(el.value) || 0)),
  })).filter(row => TOURNAMENT_DEXES_ADMIN.includes(row.dex));
}

function renderTournamentTeamSplits(seedSplits) {
  const box = document.getElementById('tn_team_splits_rows');
  if (!box) return;
  const mode = document.getElementById('tn_mode')?.value || 'individual';
  const prizeMode = document.getElementById('tn_team_prize_mode')?.value || 'winner_takes_all';
  const dexes = selectedTournamentDexes();
  if (mode !== 'dex_vs_dex' || prizeMode !== 'custom_split') {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.style.display = 'grid';
  box.style.gridTemplateColumns = 'repeat(auto-fit,minmax(140px,1fr))';
  box.style.gap = '8px';
  const current = new Map(readTournamentTeamSplits().map(row => [row.dex, row.share_pct]));
  const seeded = new Map((Array.isArray(seedSplits) ? seedSplits : []).map(row => [row.dex, Number(row.share_pct ?? row.share ?? 0) || 0]));
  const fallback = dexes.length ? Number((100 / dexes.length).toFixed(2)) : 0;
  box.innerHTML = dexes.map((dex) => {
    const value = current.has(dex) ? current.get(dex) : (seeded.has(dex) ? seeded.get(dex) : fallback);
    return '<label style="font-size:11px;color:#9ca3af">' + esc(tournamentDexLabel(dex)) + ' share %'
      + '<input data-team-split-dex="' + esc(dex) + '" type="number" min="0" max="100" step="0.01" value="' + value + '" oninput="updateTournamentTeamHint()" style="width:100%;margin-top:4px;background:#111827;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">'
      + '</label>';
  }).join('');
  updateTournamentTeamHint();
}

function updateTournamentTeamHint() {
  const hint = document.getElementById('tn_team_hint');
  if (!hint) return;
  const mode = document.getElementById('tn_mode')?.value || 'individual';
  const dexes = selectedTournamentDexes();
  const prizeMode = document.getElementById('tn_team_prize_mode')?.value || 'winner_takes_all';
  if (mode !== 'dex_vs_dex') {
    hint.style.color = '#9ca3af';
    hint.textContent = 'Individual tournament mode.';
    return;
  }
  if (dexes.length < 2) {
    hint.style.color = '#fca5a5';
    hint.textContent = 'DEX vs DEX needs at least two selected DEXes.';
    return;
  }
  if (prizeMode === 'custom_split') {
    const total = readTournamentTeamSplits().reduce((s, row) => s + Number(row.share_pct || 0), 0);
    hint.style.color = Math.abs(total - 100) < 0.01 ? '#9ca3af' : '#fca5a5';
    hint.textContent = 'Custom DEX shares total: ' + total.toFixed(2).replace(/\\.00$/, '') + '%. Must be 100%.';
    return;
  }
  hint.style.color = '#9ca3af';
  const attackPolicy = document.getElementById('tn_attack_match_policy')?.value || 'all';
  hint.textContent = 'Winning side is ranked by ' + tournamentTeamMetricLabel(document.getElementById('tn_team_score_by')?.value || 'volume_usd')
    + '. Its pool is split between players by ' + tournamentTeamMetricLabel(document.getElementById('tn_team_member_reward_by')?.value || 'volume_usd')
    + '. Attacks: ' + tournamentAttackPolicyLabel(attackPolicy) + '.';
}

function updateTournamentTeamUi(seedSplits) {
  const modeEl = document.getElementById('tn_mode');
  const mode = modeEl?.value || 'individual';
  const box = document.getElementById('tn_team_box');
  if (box) box.style.display = mode === 'dex_vs_dex' ? 'block' : 'none';
  if (mode === 'dex_vs_dex') {
    const scope = document.getElementById('tn_dex_scope');
    const primary = document.getElementById('tn_dex')?.value || 'pacifica';
    let list = selectedTournamentDexes();
    if (scope && scope.value === 'single') scope.value = 'custom';
    if (list.length < 2) {
      const second = TOURNAMENT_DEXES_ADMIN.find(d => d !== primary) || 'decibel';
      setTournamentDexSelection([primary, second]);
    }
    updateTournamentDexScopeUi();
  }
  renderTournamentTeamSplits(seedSplits);
  updateTournamentTeamPointsUi();
  updateTournamentPointsUi();
  updateTournamentTeamHint();
}

function updateTournamentModeUi() {
  updateTournamentTeamUi();
}

function isTournamentPointsSort(sortBy) {
  return sortBy === 'points' || sortBy === 'volume_trophies_50_50';
}

function isTournamentDailyPool(t) {
  return String(t?.scoring_mode || 'live') === 'daily_pool';
}

function tournamentPointsWeights(t) {
  if (t && t.sort_by === 'volume_trophies_50_50') return { trophies: 50, volume: 50, pnl: 0 };
  const w = (t && t.points_weights) || {};
  return {
    trophies: Number(w.trophies ?? t?.points_trophy_weight ?? 20) || 0,
    volume: Number(w.volume ?? t?.points_volume_weight ?? 60) || 0,
    pnl: Number(w.pnl ?? t?.points_pnl_weight ?? 20) || 0,
  };
}

function fmtTournamentWeight(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\\.?0+$/, '');
}

function fmtTournamentUsd(n, currency) {
  const value = Number(n) || 0;
  const text = value >= 1000
    ? Math.round(value).toLocaleString()
    : value.toLocaleString(undefined, { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return '$' + text + (currency ? ' ' + currency : '');
}

function tournamentPointParts(weights) {
  const parts = [];
  if (Number(weights.trophies) > 0) parts.push(fmtTournamentWeight(weights.trophies) + '% Trophies');
  if (Number(weights.volume) > 0) parts.push(fmtTournamentWeight(weights.volume) + '% Volume');
  if (Number(weights.pnl) > 0) parts.push(fmtTournamentWeight(weights.pnl) + '% PnL');
  return parts;
}

function tournamentPrizeExample() {
  return [
    {
      volume_usd: 100000,
      rewards: [
        {
          type: 'money',
          label: 'Cash',
          currency: 'USD',
          pool_amount: 200,
          winners: 5,
          preset: 'top5_balanced',
          payouts: buildTournamentPrizePayouts({ pool_amount: 200, winners: 5, preset: 'top5_balanced' }),
        },
        {
          type: 'points',
          label: 'Decibel points',
          unit: 'points',
          pool_amount: 1000,
          winners: 10,
          preset: 'top10_balanced',
          payouts: buildTournamentPrizePayouts({ pool_amount: 1000, winners: 10, preset: 'top10_balanced' }),
        },
      ],
    },
    {
      volume_usd: 1000000,
      rewards: [
        {
          type: 'money',
          label: 'Cash',
          currency: 'USD',
          pool_amount: 1000,
          winners: 5,
          preset: 'top5_aggressive',
          payouts: buildTournamentPrizePayouts({ pool_amount: 1000, winners: 5, preset: 'top5_aggressive' }),
        },
        {
          type: 'nft',
          label: 'Demon King NFT',
          unit: 'NFT',
          pool_amount: 3,
          winners: 3,
          preset: 'equal',
          payouts: buildTournamentPrizePayouts({ pool_amount: 3, winners: 3, preset: 'equal' }),
        },
      ],
    },
  ];
}

const TOURNAMENT_PRIZE_PRESETS = [
  { id: 'winner_take_all', label: 'Winner takes all', weights: [100] },
  { id: 'equal', label: 'Equal split', equal: true },
  { id: 'top3_balanced', label: 'Top 3: 50/30/20', weights: [50, 30, 20] },
  { id: 'top3_aggressive', label: 'Top 3: 60/25/15', weights: [60, 25, 15] },
  { id: 'top5_balanced', label: 'Top 5: 40/25/15/12/8', weights: [40, 25, 15, 12, 8] },
  { id: 'top5_aggressive', label: 'Top 5: 50/25/12/8/5', weights: [50, 25, 12, 8, 5] },
  { id: 'top10_balanced', label: 'Top 10: balanced', weights: [30, 20, 15, 10, 8, 6, 5, 3, 2, 1] },
  { id: 'top10_flatter', label: 'Top 10: flatter', weights: [25, 18, 14, 11, 9, 7, 6, 4, 3, 3] },
  { id: 'top10_long_tail', label: 'Top 10: long tail', weights: [35, 18, 12, 9, 7, 6, 5, 4, 2, 2] },
  { id: 'linear', label: 'Linear drop', linear: true },
];

function tournamentPrizePresetOptions(selected) {
  return TOURNAMENT_PRIZE_PRESETS.map((preset) =>
    '<option value="' + esc(preset.id) + '"' + (preset.id === selected ? ' selected' : '') + '>' + esc(preset.label) + '</option>'
  ).join('');
}

function tournamentPrizeRewardDefaults(type) {
  if (type === 'money') return { type: 'money', label: 'Cash', currency: 'USD', unit: 'USD', pool_amount: 200, winners: 5, preset: 'top5_balanced' };
  if (type === 'points') return { type: 'points', label: 'Points', unit: 'points', pool_amount: 1000, winners: 10, preset: 'top10_balanced' };
  if (type === 'amp') return { type: 'amp', label: 'AMP', unit: 'AMP', pool_amount: 1000, winners: 10, preset: 'top10_balanced' };
  if (type === 'nft') return { type: 'nft', label: 'NFT reward', unit: 'NFT', pool_amount: 1, winners: 1, preset: 'winner_take_all' };
  return { type: 'custom', label: 'Custom reward', unit: 'reward', pool_amount: 100, winners: 5, preset: 'equal' };
}

function normalizeTournamentPrizeRewardAdmin(raw) {
  const type = ['money', 'points', 'amp', 'nft', 'custom'].includes(String(raw?.type || '').toLowerCase()) ? String(raw.type).toLowerCase() : 'custom';
  const defaults = tournamentPrizeRewardDefaults(type);
  const pool = Math.max(0, Number(raw?.pool_amount ?? raw?.pool ?? raw?.quantity ?? raw?.amount ?? defaults.pool_amount) || 0);
  const payouts = Array.isArray(raw?.payouts) ? raw.payouts.map((p) => ({
    rank: Math.max(1, Math.floor(Number(p?.rank) || 1)),
    amount: Math.max(0, Number(p?.amount ?? p?.amount_usd ?? p?.quantity ?? p?.points) || 0),
  })).filter((p) => p.amount > 0).sort((a, b) => a.rank - b.rank) : [];
  const winners = Math.max(1, Math.min(100, Math.floor(Number(raw?.winners) || payouts.length || defaults.winners || 1)));
  const reward = {
    type,
    label: String(raw?.label || raw?.name || defaults.label).trim().slice(0, 80),
    unit: String(raw?.unit || raw?.currency || defaults.unit).trim().slice(0, 24),
    pool_amount: pool,
    winners,
    preset: String(raw?.preset || defaults.preset),
    payouts,
  };
  if (type === 'money') reward.currency = String(raw?.currency || raw?.unit || defaults.currency || 'USD').trim().toUpperCase().slice(0, 12) || 'USD';
  if (!reward.payouts.length && reward.pool_amount > 0) reward.payouts = buildTournamentPrizePayouts(reward);
  return reward;
}

function normalizeTournamentPrizeTiersAdmin(tiers) {
  const arr = Array.isArray(tiers) ? tiers : [];
  return arr.map((tier) => {
    const legacyPayouts = Array.isArray(tier?.payouts) ? tier.payouts.map((p) => ({
      rank: Math.max(1, Math.floor(Number(p?.rank) || 1)),
      amount: Math.max(0, Number(p?.amount_usd ?? p?.amount) || 0),
    })).filter((p) => p.amount > 0).sort((a, b) => a.rank - b.rank) : [];
    const legacyPool = Math.max(0, Number(tier?.pool_usd) || 0);
    const rewards = Array.isArray(tier?.rewards) && tier.rewards.length
      ? tier.rewards.map(normalizeTournamentPrizeRewardAdmin)
      : ((legacyPool > 0 || legacyPayouts.length) ? [normalizeTournamentPrizeRewardAdmin({
        type: 'money',
        label: 'Cash',
        currency: tier?.currency || 'USD',
        pool_amount: legacyPool || legacyPayouts.reduce((s, p) => s + Number(p.amount || 0), 0),
        winners: legacyPayouts.length || 3,
        preset: 'top3_balanced',
        payouts: legacyPayouts,
      })] : []);
    return {
      volume_usd: Math.max(0, Number(tier?.volume_usd) || 0),
      rewards,
    };
  }).filter((tier) => tier.volume_usd > 0 || tier.rewards.length > 0)
    .sort((a, b) => a.volume_usd - b.volume_usd);
}

function buildTournamentPrizePayouts(reward) {
  const pool = Math.max(0, Number(reward?.pool_amount) || 0);
  const winners = Math.max(1, Math.min(100, Math.floor(Number(reward?.winners) || 1)));
  const preset = TOURNAMENT_PRIZE_PRESETS.find((p) => p.id === reward?.preset) || TOURNAMENT_PRIZE_PRESETS[1];
  let weights = [];
  if (preset.equal) weights = Array(winners).fill(1);
  else if (preset.linear) weights = Array.from({ length: winners }, (_, i) => winners - i);
  else weights = Array.from({ length: winners }, (_, i) => Number(preset.weights?.[i] || 0));
  if (!weights.some((w) => w > 0)) weights = Array(winners).fill(1);
  const sum = weights.reduce((s, w) => s + Math.max(0, Number(w) || 0), 0) || 1;
  let remaining = pool;
  return weights.slice(0, winners).map((weight, index) => {
    const rank = index + 1;
    const raw = index === winners - 1 ? remaining : pool * Math.max(0, Number(weight) || 0) / sum;
    const amount = reward?.type === 'nft'
      ? Math.max(0, Math.round(raw))
      : Math.max(0, Number(raw.toFixed(2)));
    remaining = Math.max(0, Number((remaining - amount).toFixed(2)));
    return { rank, amount };
  }).filter((p) => p.amount > 0);
}

function formatTournamentRewardPool(reward, currencyFallback) {
  const amount = Number(reward?.pool_amount || 0);
  if (reward?.type === 'money') return fmtTournamentUsd(amount, reward.currency || currencyFallback || 'USD');
  return fmtTournamentWeight(amount) + ' ' + (reward?.unit || reward?.label || 'reward');
}

function readTournamentPrizeTiers() {
  const rows = Array.from(document.querySelectorAll('[data-prize-tier]'));
  return normalizeTournamentPrizeTiersAdmin(rows.map((row) => {
    const rewards = Array.from(row.querySelectorAll('[data-prize-reward]')).map((rRow) => ({
      type: rRow.querySelector('[data-reward-type]')?.value,
      label: rRow.querySelector('[data-reward-label]')?.value,
      unit: rRow.querySelector('[data-reward-unit]')?.value,
      currency: rRow.querySelector('[data-reward-currency]')?.value,
      pool_amount: rRow.querySelector('[data-reward-pool]')?.value,
      winners: rRow.querySelector('[data-reward-winners]')?.value,
      preset: rRow.querySelector('[data-reward-preset]')?.value,
      payouts: Array.from(rRow.querySelectorAll('[data-prize-payout]')).map((pRow) => ({
        rank: pRow.querySelector('[data-prize-rank]')?.value,
        amount: pRow.querySelector('[data-prize-amount]')?.value,
      })),
    }));
    return {
      volume_usd: row.querySelector('[data-prize-volume]')?.value,
      rewards,
    };
  }));
}

function renderTournamentPrizeTiers(tiers) {
  const box = document.getElementById('tn_prize_rows');
  if (!box) return;
  const normalized = normalizeTournamentPrizeTiersAdmin(tiers);
  if (normalized.length === 0) {
    box.innerHTML = '';
    updateTournamentPrizeUi();
    return;
  }
  box.innerHTML = normalized.map((tier, idx) => {
    const rewards = tier.rewards.length ? tier.rewards : [normalizeTournamentPrizeRewardAdmin({ type: 'money' })];
    return '<div data-prize-tier="' + idx + '" style="border:1px solid #374151;border-radius:8px;padding:8px;background:#111827">'
      + '<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end">'
      + '<label style="font-size:11px;color:#9ca3af">Total volume unlock ($)<input data-prize-volume type="number" min="0" step="1000" value="' + tier.volume_usd + '" oninput="updateTournamentPrizeUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>'
      + '<button type="button" class="btn" onclick="removeTournamentPrizeTier(' + idx + ')" style="background:#7f1d1d">Remove</button>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">'
      + rewards.map((reward, rewardIdx) => renderTournamentPrizeReward(idx, rewardIdx, reward)).join('')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + '<button type="button" class="btn" onclick="addTournamentPrizeReward(' + idx + ',&quot;money&quot;)" style="background:#166534">+ Cash</button>'
      + '<button type="button" class="btn" onclick="addTournamentPrizeReward(' + idx + ',&quot;points&quot;)" style="background:#1d4ed8">+ Points</button>'
      + '<button type="button" class="btn" onclick="addTournamentPrizeReward(' + idx + ',&quot;amp&quot;)" style="background:#7c3aed">+ AMP</button>'
      + '<button type="button" class="btn" onclick="addTournamentPrizeReward(' + idx + ',&quot;nft&quot;)" style="background:#92400e">+ NFT</button>'
      + '<button type="button" class="btn" onclick="addTournamentPrizeReward(' + idx + ',&quot;custom&quot;)" style="background:#4b5563">+ Custom</button>'
      + '</div>'
      + '</div>';
  }).join('');
  updateTournamentPrizeUi();
}

function renderTournamentPrizeReward(tierIdx, rewardIdx, reward) {
  const currencyInput = reward.type === 'money'
    ? '<label style="font-size:11px;color:#9ca3af">Currency<input data-reward-currency value="' + esc(reward.currency || 'USD') + '" maxlength="12" oninput="updateTournamentPrizeUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb;text-transform:uppercase"></label>'
    : '<label style="font-size:11px;color:#9ca3af">Unit<input data-reward-unit value="' + esc(reward.unit || '') + '" maxlength="24" oninput="updateTournamentPrizeUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>';
  const payouts = reward.payouts.length ? reward.payouts : buildTournamentPrizePayouts(reward);
  return '<div data-prize-reward style="border:1px solid #334155;border-radius:8px;padding:8px;background:#0b1220">'
    + '<div style="display:grid;grid-template-columns:90px 1fr 96px 90px 86px 160px auto;gap:7px;align-items:end">'
    + '<label style="font-size:11px;color:#9ca3af">Type<select data-reward-type onchange="changeTournamentPrizeRewardType(' + tierIdx + ',' + rewardIdx + ',this.value)" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">'
    + ['money', 'points', 'amp', 'nft', 'custom'].map((type) => '<option value="' + type + '"' + (reward.type === type ? ' selected' : '') + '>' + type.toUpperCase() + '</option>').join('')
    + '</select></label>'
    + '<label style="font-size:11px;color:#9ca3af">Prize name<input data-reward-label value="' + esc(reward.label || '') + '" maxlength="80" oninput="updateTournamentPrizeUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>'
    + currencyInput
    + '<label style="font-size:11px;color:#9ca3af">Pool<input data-reward-pool type="number" min="0" step="' + (reward.type === 'nft' ? '1' : '1') + '" value="' + reward.pool_amount + '" oninput="regenerateTournamentPrizeReward(' + tierIdx + ',' + rewardIdx + ')" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>'
    + '<label style="font-size:11px;color:#9ca3af">Winners<input data-reward-winners type="number" min="1" max="100" step="1" value="' + reward.winners + '" oninput="regenerateTournamentPrizeReward(' + tierIdx + ',' + rewardIdx + ')" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>'
    + '<label style="font-size:11px;color:#9ca3af">Preset<select data-reward-preset onchange="regenerateTournamentPrizeReward(' + tierIdx + ',' + rewardIdx + ')" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">' + tournamentPrizePresetOptions(reward.preset) + '</select></label>'
    + '<button type="button" class="btn" onclick="removeTournamentPrizeReward(' + tierIdx + ',' + rewardIdx + ')" style="background:#7f1d1d">Remove</button>'
    + '</div>'
    + '<div style="font-size:10px;color:#9ca3af;margin-top:7px">Rank rewards: ' + payouts.map((p) => '#' + p.rank + ' ' + fmtTournamentWeight(p.amount)).join(' / ') + '</div>'
    + payouts.map((p, payoutIdx) =>
      '<div data-prize-payout style="display:grid;grid-template-columns:72px 1fr auto;gap:8px;align-items:end;margin-top:5px">'
      + '<label style="font-size:11px;color:#9ca3af">Rank<input data-prize-rank type="number" min="1" step="1" value="' + p.rank + '" oninput="updateTournamentPrizeUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>'
      + '<label style="font-size:11px;color:#9ca3af">Amount<input data-prize-amount type="number" min="0" step="' + (reward.type === 'nft' ? '1' : '1') + '" value="' + p.amount + '" oninput="updateTournamentPrizeUi()" style="width:100%;margin-top:4px;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb"></label>'
      + '<button type="button" class="btn" onclick="removeTournamentPrizePayout(' + tierIdx + ',' + rewardIdx + ',' + payoutIdx + ')" style="background:#4b5563">Remove</button>'
      + '</div>'
    ).join('')
    + '<button type="button" class="btn" onclick="addTournamentPrizePayout(' + tierIdx + ',' + rewardIdx + ')" style="margin-top:8px;background:#374151">Add payout row</button>'
    + '</div>';
}

function addTournamentPrizeTier() {
  const tiers = readTournamentPrizeTiers();
  const nextVolume = (tiers[tiers.length - 1]?.volume_usd || 0) + 500000;
  tiers.push({ volume_usd: nextVolume, rewards: [normalizeTournamentPrizeRewardAdmin({ type: 'money', pool_amount: 500, winners: 3, preset: 'top3_balanced' })] });
  renderTournamentPrizeTiers(tiers);
}

function removeTournamentPrizeTier(index) {
  const tiers = readTournamentPrizeTiers();
  tiers.splice(index, 1);
  renderTournamentPrizeTiers(tiers);
}

function addTournamentPrizeReward(index, type) {
  const tiers = readTournamentPrizeTiers();
  const tier = tiers[index] || { volume_usd: 0, rewards: [] };
  tier.rewards = Array.isArray(tier.rewards) ? tier.rewards : [];
  tier.rewards.push(normalizeTournamentPrizeRewardAdmin(tournamentPrizeRewardDefaults(type)));
  tiers[index] = tier;
  renderTournamentPrizeTiers(tiers);
}

function removeTournamentPrizeReward(index, rewardIndex) {
  const tiers = readTournamentPrizeTiers();
  if (tiers[index]) tiers[index].rewards.splice(rewardIndex, 1);
  renderTournamentPrizeTiers(tiers);
}

function changeTournamentPrizeRewardType(index, rewardIndex, type) {
  const tiers = readTournamentPrizeTiers();
  if (!tiers[index] || !tiers[index].rewards[rewardIndex]) return;
  const next = tournamentPrizeRewardDefaults(type);
  tiers[index].rewards[rewardIndex] = normalizeTournamentPrizeRewardAdmin({ ...next, pool_amount: tiers[index].rewards[rewardIndex].pool_amount });
  renderTournamentPrizeTiers(tiers);
}

function regenerateTournamentPrizeReward(index, rewardIndex) {
  const tiers = readTournamentPrizeTiers();
  const reward = tiers[index]?.rewards?.[rewardIndex];
  if (!reward) return;
  reward.payouts = buildTournamentPrizePayouts(reward);
  tiers[index].rewards[rewardIndex] = reward;
  renderTournamentPrizeTiers(tiers);
}

function addTournamentPrizePayout(index, rewardIndex) {
  const tiers = readTournamentPrizeTiers();
  const reward = tiers[index]?.rewards?.[rewardIndex];
  if (!reward) return;
  const nextRank = reward.payouts.reduce((max, p) => Math.max(max, Number(p.rank) || 0), 0) + 1;
  reward.payouts.push({ rank: nextRank, amount: 1 });
  renderTournamentPrizeTiers(tiers);
}

function removeTournamentPrizePayout(index, rewardIndex, payoutIndex) {
  const tiers = readTournamentPrizeTiers();
  if (tiers[index]?.rewards?.[rewardIndex]) tiers[index].rewards[rewardIndex].payouts.splice(payoutIndex, 1);
  renderTournamentPrizeTiers(tiers);
}

function loadTournamentPrizeExample() {
  renderTournamentPrizeTiers(tournamentPrizeExample());
}

function updateTournamentPrizeUi() {
  const hint = document.getElementById('tn_prize_hint');
  if (!hint) return;
  const tiers = readTournamentPrizeTiers();
  const cop = document.getElementById('tn_rewards_cop')?.checked;
  const currency = document.getElementById('tn_prize_currency');
  if (currency && cop) currency.value = 'CLASH';
  if (!tiers.length) {
    hint.style.color = '#9ca3af';
    hint.textContent = cop ? 'CLASH rewards enabled. Players must enter a Solana payout address when joining.' : 'No prize tiers configured.';
    return;
  }
  const invalid = tiers.find((tier) => (tier.rewards || []).find((reward) =>
    reward.payouts.reduce((s, p) => s + Number(p.amount || 0), 0) > Number(reward.pool_amount || 0) + 0.01
  ));
  if (invalid) {
    hint.style.color = '#fca5a5';
    hint.textContent = 'Reward payouts cannot exceed their configured pool.';
    return;
  }
  const top = tiers[tiers.length - 1];
  const pools = (top.rewards || []).map((reward) => formatTournamentRewardPool(reward, document.getElementById('tn_prize_currency')?.value || 'USD')).join(' + ');
  hint.style.color = '#9ca3af';
  hint.textContent = tiers.length + ' tier(s), top pool ' + (pools || '0')
    + ' at ' + fmtTournamentUsd(top.volume_usd, '') + ' total volume.'
    + (cop ? ' CLASH Solana payout addresses required.' : '');
}

function tournamentPrizeLabel(t) {
  const currency = t?.prize_currency || 'USD';
  const pool = Number(t?.prize_pool_usd || 0);
  const rewards = Array.isArray(t?.prize_rewards) ? t.prize_rewards : [];
  const rewardText = rewards.length ? rewards.map((reward) => esc(reward.label || reward.type) + ': ' + esc(formatTournamentRewardPool(reward, currency))).join('<br>') : '';
  const active = t?.prize_active_tier;
  const next = t?.prize_next_tier;
  const totalVolume = Number(t?.prize_total_volume_usd || 0);
  if ((pool > 0 || rewards.length) && active) {
    return (rewardText || fmtTournamentUsd(pool, currency)) + (t?.rewards_in_cop ? ' <span style="color:#fbbf24">CLASH</span>' : '')
      + '<div style="font-size:10px;color:#9ca3af">active at ' + fmtTournamentUsd(active.volume_usd || 0, '') + ' vol · current ' + fmtTournamentUsd(totalVolume, '') + '</div>';
  }
  if (next) {
    const nextRewards = Array.isArray(next.rewards) && next.rewards.length
      ? next.rewards.map((reward) => esc(formatTournamentRewardPool(reward, currency))).join(' + ')
      : fmtTournamentUsd(next.pool_usd || 0, currency);
    return '<span style="color:#9ca3af">Next ' + nextRewards
      + '</span><div style="font-size:10px;color:#9ca3af">needs ' + fmtTournamentUsd(next.volume_usd || 0, '') + ' vol</div>';
  }
  return '<span style="color:#6b7280">—</span>';
}

function tournamentSortLabel(tOrSort) {
  const sortBy = typeof tOrSort === 'string' ? tOrSort : tOrSort?.sort_by;
  if (typeof tOrSort === 'object' && isTournamentDailyPool(tOrSort)) {
    const w = tournamentPointsWeights(tOrSort);
    const parts = tournamentPointParts(w);
    return 'Daily pool (' + (parts.length ? parts.join(' / ') : 'no enabled metrics') + ')';
  }
  if (sortBy === 'trophies') return 'Trophies';
  if (sortBy === 'volume_usd') return 'Volume (USD)';
  if (sortBy === 'gold') return 'Gold';
  if (isTournamentPointsSort(sortBy)) {
    const w = tournamentPointsWeights(typeof tOrSort === 'string' ? { sort_by: sortBy } : tOrSort);
    const parts = tournamentPointParts(w);
    return 'Points (' + (parts.length ? parts.join(' / ') : 'no enabled metrics') + ')';
  }
  return 'PnL (USD)';
}

function readTournamentWeight(id, fallback) {
  const enabled = document.getElementById(id + '_on');
  if (enabled && !enabled.checked) return 0;
  const el = document.getElementById(id);
  const n = Number(el && el.value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function readTournamentPointWeights(prefix) {
  return {
    trophies: readTournamentWeight(prefix + '_trophy', 20),
    volume: readTournamentWeight(prefix + '_volume', 60),
    pnl: readTournamentWeight(prefix + '_pnl', 20),
  };
}

function setTournamentPointInputs(prefix, weights) {
  const w = weights || { trophies: 20, volume: 60, pnl: 20 };
  [
    ['trophy', Number(w.trophies) || 0],
    ['volume', Number(w.volume) || 0],
    ['pnl', Number(w.pnl) || 0],
  ].forEach(([key, value]) => {
    const input = document.getElementById(prefix + '_' + key);
    const enabled = document.getElementById(prefix + '_' + key + '_on');
    if (input) input.value = value;
    if (enabled) enabled.checked = value > 0;
  });
}

function copyTournamentPointWeights(fromPrefix, toPrefix) {
  setTournamentPointInputs(toPrefix, readTournamentPointWeights(fromPrefix));
}

function tournamentTeamUsesCustomPoints() {
  const mode = document.getElementById('tn_mode')?.value || 'individual';
  if (mode !== 'dex_vs_dex') return false;
  return (document.getElementById('tn_team_score_by')?.value || 'volume_usd') === 'points'
    || (document.getElementById('tn_team_member_reward_by')?.value || 'volume_usd') === 'points';
}

function updateTournamentTeamPointsUi() {
  const box = document.getElementById('tn_team_points_box');
  const hint = document.getElementById('tn_team_points_hint');
  if (!box || !hint) return;
  const active = tournamentTeamUsesCustomPoints();
  box.style.display = active ? 'block' : 'none';
  ['tn_team_points_trophy', 'tn_team_points_volume', 'tn_team_points_pnl'].forEach((id) => {
    const input = document.getElementById(id);
    const enabled = document.getElementById(id + '_on');
    if (enabled) enabled.disabled = !active;
    if (input) {
      input.disabled = !active || (enabled && !enabled.checked);
      input.style.opacity = input.disabled ? '0.55' : '1';
    }
  });
  const weights = readTournamentPointWeights('tn_team_points');
  const total = weights.trophies + weights.volume + weights.pnl;
  const parts = tournamentPointParts(weights);
  hint.style.color = Math.abs(total - 100) < 0.001 ? '#9ca3af' : '#fca5a5';
  hint.textContent = 'Total: ' + total + '%. '
    + (parts.length ? 'Team points = ' + parts.join(' + ') + '.' : 'Enable at least one team metric.')
    + ' Example: 50% Trophies + 50% Volume.';
}

function updateTournamentPointsUi() {
  const sort = document.getElementById('tn_sort');
  const box = document.getElementById('tn_points_box');
  const hint = document.getElementById('tn_points_hint');
  if (!sort || !box || !hint) return;
  const teamUsesPoints = tournamentTeamUsesCustomPoints();
  const scoringMode = document.getElementById('tn_scoring_mode')?.value || 'live';
  const isDailyPool = scoringMode === 'daily_pool';
  if (isDailyPool && sort.value !== 'points') sort.value = 'points';
  sort.disabled = isDailyPool;
  sort.style.opacity = isDailyPool ? '0.6' : '1';
  const poolInput = document.getElementById('tn_daily_pool_points');
  const growthInput = document.getElementById('tn_daily_pool_growth_pct');
  const overridesBox = document.getElementById('tn_daily_overrides_box');
  if (poolInput) {
    poolInput.disabled = !isDailyPool;
    poolInput.style.opacity = isDailyPool ? '1' : '0.55';
  }
  if (growthInput) {
    growthInput.disabled = !isDailyPool;
    growthInput.style.opacity = isDailyPool ? '1' : '0.55';
  }
  if (overridesBox) overridesBox.style.opacity = isDailyPool ? '1' : '0.55';
  const isPoints = isDailyPool || sort.value === 'points' || teamUsesPoints;
  box.style.opacity = isPoints ? '1' : '0.45';
  ['tn_points_trophy', 'tn_points_volume', 'tn_points_pnl'].forEach((id) => {
    const input = document.getElementById(id);
    const enabled = document.getElementById(id + '_on');
    if (enabled) enabled.disabled = !isPoints;
    if (input) {
      input.disabled = !isPoints || (enabled && !enabled.checked);
      input.style.opacity = input.disabled ? '0.55' : '1';
    }
  });
  const weights = {
    trophies: readTournamentWeight('tn_points_trophy', 20),
    volume: readTournamentWeight('tn_points_volume', 60),
    pnl: readTournamentWeight('tn_points_pnl', 20),
  };
  const total = weights.trophies + weights.volume + weights.pnl;
  const parts = tournamentPointParts(weights);
  hint.style.color = Math.abs(total - 100) < 0.001 ? '#9ca3af' : '#fca5a5';
  const poolPoints = Math.max(1, Number(poolInput?.value || 1000) || 1000);
  const growthPct = Number(growthInput?.value || 0) || 0;
  hint.textContent = 'Total: ' + total + '%. '
    + (parts.length ? 'Points = ' + parts.join(' + ') + '.' : 'Enable at least one metric.')
    + (isDailyPool ? ' Awards ' + poolPoints + ' base points per closed UTC day using these weights' + (growthPct ? ', growth ' + growthPct + '%/day.' : '.') : '')
    + (teamUsesPoints && sort.value !== 'points' ? ' Used by DEX vs DEX custom points.' : '');
}

function tournamentFormDayFromInput(id) {
  const raw = document.getElementById(id)?.value || '';
  const m = String(raw).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function addUtcDayString(day, count) {
  const ms = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + (Number(count) || 0) * 86400000).toISOString().slice(0, 10);
}

function tournamentDailyOverrideDays() {
  const start = tournamentFormDayFromInput('tn_start') || new Date().toISOString().slice(0, 10);
  const end = tournamentFormDayFromInput('tn_end');
  let count = 7;
  if (start && end) {
    const startMs = Date.parse(start + 'T00:00:00Z');
    const endMs = Date.parse(end + 'T00:00:00Z');
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      count = Math.min(60, Math.max(1, Math.ceil((endMs - startMs) / 86400000)));
    }
  }
  const days = [];
  for (let i = 0; i < count; i += 1) {
    const day = addUtcDayString(start, i);
    if (day) days.push(day);
  }
  return days;
}

function readTournamentDailyOverrides() {
  const out = {};
  document.querySelectorAll('[data-tn-daily-override-day]').forEach((input) => {
    const day = input.getAttribute('data-tn-daily-override-day');
    const value = String(input.value || '').trim();
    if (!day || !value) return;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) out[day] = Math.max(1, Math.round(n * 10000) / 10000);
  });
  return out;
}

function updateTournamentDailyOverridesUi(seedOverrides) {
  const rowsEl = document.getElementById('tn_daily_override_rows');
  const hint = document.getElementById('tn_daily_overrides_hint');
  if (!rowsEl || !hint) return;
  const scoringMode = document.getElementById('tn_scoring_mode')?.value || 'live';
  if (scoringMode !== 'daily_pool') {
    rowsEl.innerHTML = '';
    hint.textContent = 'Daily pool mode only.';
    return;
  }
  const existing = seedOverrides && typeof seedOverrides === 'object' ? seedOverrides : readTournamentDailyOverrides();
  const base = Math.max(1, Number(document.getElementById('tn_daily_pool_points')?.value || 1000) || 1000);
  const growthPct = Math.max(-99, Math.min(500, Number(document.getElementById('tn_daily_pool_growth_pct')?.value || 0) || 0));
  const days = tournamentDailyOverrideDays();
  rowsEl.innerHTML = days.map((day, index) => {
    const auto = Math.max(1, Math.round(base * Math.pow(1 + growthPct / 100, index) * 10000) / 10000);
    const value = existing[day] != null ? existing[day] : '';
    return '<label style="font-size:11px;color:#9ca3af;background:#111827;border:1px solid #374151;border-radius:6px;padding:7px">'
      + '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px"><span>Day ' + (index + 1) + '</span><span class="mono">' + esc(day) + '</span></div>'
      + '<input data-tn-daily-override-day="' + esc(day) + '" type="number" min="1" step="1" placeholder="auto ' + esc(String(auto)) + '" value="' + esc(String(value)) + '" style="width:100%;background:#0f172a;border:1px solid #374151;border-radius:6px;padding:6px;color:#e5e7eb">'
      + '</label>';
  }).join('');
  const overrideCount = Object.keys(existing || {}).length;
  hint.textContent = days.length + ' day' + (days.length === 1 ? '' : 's') + ' shown. Blank = auto growth. Overrides saved: ' + overrideCount + '.';
}

async function loadTournaments() {
  try {
    const d = await api('/admin/tournaments');
    TOURNAMENTS_CACHE = d.tournaments || [];
    renderTournaments();
    if (TOURNAMENT_LB_ID) loadTournamentLeaderboard(TOURNAMENT_LB_ID);
  } catch(e) { console.error(e); }
}

function renderTournaments() {
  const body = document.getElementById('tournamentsBody');
  if (!body) return;
  if (TOURNAMENTS_CACHE.length === 0) {
    body.innerHTML = '<tr><td colspan="19" style="text-align:center;color:#6b7280;padding:20px">No tournaments yet - create one above</td></tr>';
    return;
  }
  body.innerHTML = TOURNAMENTS_CACHE.map(t => {
    const statusBadge = t.status === 'active' ? '<span style="color:#34d399">ACTIVE</span>'
      : t.status === 'draft' ? '<span style="color:#9ca3af">DRAFT</span>'
      : '<span style="color:#6b7280">ENDED</span>';
    const phaseColor = t.phase === 'live' ? '#34d399'
      : t.phase === 'preregistration' ? '#60a5fa'
      : t.phase === 'scheduled' ? '#fbbf24'
      : '#9ca3af';
    const reg = t.preregistration_enabled
      ? 'ON' + (t.registration_closes_at ? '<div style="font-size:10px;color:#9ca3af">until ' + esc(t.registration_closes_at) + '</div>' : '')
      : 'OFF';
    return '<tr>'
      + '<td>' + t.id + '</td>'
      + '<td>' + esc(t.name) + (t.description ? '<div style="font-size:10px;color:#9ca3af">' + esc(t.description) + '</div>' : '') + '</td>'
      + '<td>' + esc(t.dex_label || tournamentDexScopeLabel(t)) + '<div style="font-size:10px;color:#6b7280">' + esc((t.mode === 'dex_vs_dex' ? 'DEX vs DEX · ' : '') + (t.dex_scope || 'single')) + '</div></td>'
      + '<td>' + (t.seeker_only ? '<span style="color:#a78bfa">SEEKER</span>' : '<span style="color:#9ca3af">ALL</span>') + '</td>'
      + '<td>' + statusBadge + '</td>'
      + '<td><span style="color:' + phaseColor + '">' + esc(t.phase || '') + '</span></td>'
      + '<td style="font-size:11px">' + esc(t.start_at || '') + '</td>'
      + '<td style="font-size:11px">' + esc(t.end_at || '∞') + '</td>'
      + '<td style="font-size:11px">' + reg + '</td>'
      + '<td>' + t.gold_boost + '×</td>'
      + '<td>' + (t.seeker_gold_boost || 1) + '×</td>'
      + '<td>' + t.trophy_boost + '×</td>'
      + '<td>' + esc(t.shield_label || 'Default') + '</td>'
      + '<td>' + (t.freeze_trophies ? '<span style="color:#60a5fa">ON</span>' : '<span style="color:#fbbf24">OFF</span>') + '</td>'
      + '<td>' + esc(t.sort_label || tournamentSortLabel(t))
        + (isTournamentDailyPool(t) ? '<div style="font-size:10px;color:#fbbf24">' + esc(Number(t.daily_pool_points || 1000) + ' base pts/day @ 00:00 UTC') + '</div>'
          + '<div style="font-size:10px;color:#9ca3af">' + esc((Number(t.daily_pool_growth_pct || 0) || 0) + '% daily growth · ' + Object.keys(t.daily_pool_overrides || {}).length + ' override(s)') + '</div>' : '')
      + '</td>'
      + '<td style="font-size:11px">' + tournamentPrizeLabel(t) + '</td>'
      + '<td style="font-size:11px;color:#38bdf8">' + fmtTournamentUsd(t.prize_total_volume_usd || 0, '') + '</td>'
      + '<td>' + (t.participants || 0) + '/' + (t.registered || 0) + '</td>'
      + '<td>'
      +   '<button class="btn" onclick="loadTournamentLeaderboard(' + t.id + ')">Leaderboard</button> '
      +   '<button class="btn" onclick="loadTournamentDailyLogs(' + t.id + ')">Daily log</button> '
      +   '<button class="btn" onclick="editTournament(' + t.id + ')">Edit</button> '
      +   (t.status === 'active' ? '<button class="btn" onclick="endTournament(' + t.id + ')">End</button> ' : '')
      +   '<button class="btn" onclick="deleteTournament(' + t.id + ')" style="background:#7f1d1d">Delete</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

function getTournamentFormBody() {
  const dexScope = document.getElementById('tn_dex_scope')?.value || 'single';
  const eligibleDexes = selectedTournamentDexes();
  const mode = document.getElementById('tn_mode')?.value || 'individual';
  const teamScoreBy = document.getElementById('tn_team_score_by')?.value || 'volume_usd';
  const teamMemberRewardBy = document.getElementById('tn_team_member_reward_by')?.value || 'volume_usd';
  const teamUsesPoints = mode === 'dex_vs_dex' && (teamScoreBy === 'points' || teamMemberRewardBy === 'points');
  const pointWeights = readTournamentPointWeights(teamUsesPoints ? 'tn_team_points' : 'tn_points');
  return {
    name: document.getElementById('tn_name').value.trim(),
    description: document.getElementById('tn_desc').value.trim(),
    dex: eligibleDexes[0] || document.getElementById('tn_dex').value,
    dex_scope: dexScope,
    eligible_dexes: eligibleDexes,
    mode,
    team_score_by: teamScoreBy,
    team_prize_mode: document.getElementById('tn_team_prize_mode')?.value || 'winner_takes_all',
    team_prize_splits: readTournamentTeamSplits(),
    team_member_reward_by: teamMemberRewardBy,
    attack_match_policy: document.getElementById('tn_attack_match_policy')?.value || 'all',
    start_at: document.getElementById('tn_start').value.trim() || undefined,
    end_at: document.getElementById('tn_end').value.trim() || undefined,
    preregistration_enabled: document.getElementById('tn_prereg').checked,
    registration_opens_at: document.getElementById('tn_reg_open').value.trim() || undefined,
    registration_closes_at: document.getElementById('tn_reg_close').value.trim() || undefined,
    gold_boost: parseFloat(document.getElementById('tn_gold').value) || 1,
    seeker_gold_boost: parseFloat(document.getElementById('tn_seeker_gold').value) || 1,
    trophy_boost: parseFloat(document.getElementById('tn_trophy').value) || 1,
    shield_hours: document.getElementById('tn_shield_hours').value.trim() === '' ? null : Number(document.getElementById('tn_shield_hours').value),
    freeze_trophies: document.getElementById('tn_freeze_trophies').checked,
    seeker_only: document.getElementById('tn_seeker_only').checked,
    sort_by: document.getElementById('tn_sort').value,
    scoring_mode: document.getElementById('tn_scoring_mode')?.value || 'live',
    daily_pool_points: Math.max(1, Number(document.getElementById('tn_daily_pool_points')?.value || 1000) || 1000),
    daily_pool_growth_pct: Number(document.getElementById('tn_daily_pool_growth_pct')?.value || 0) || 0,
    daily_pool_overrides: readTournamentDailyOverrides(),
    points_trophy_weight: pointWeights.trophies,
    points_volume_weight: pointWeights.volume,
    points_pnl_weight: pointWeights.pnl,
    prize_currency: (document.getElementById('tn_prize_currency').value.trim() || 'USD').toUpperCase(),
    prize_tiers: readTournamentPrizeTiers(),
    rewards_in_cop: document.getElementById('tn_rewards_cop').checked,
    status: document.getElementById('tn_status').value,
  };
}

function resetTournamentForm() {
  TOURNAMENT_EDIT_ID = null;
  document.getElementById('tn_form_title').textContent = 'Create Tournament';
  document.getElementById('tn_submit').textContent = 'Create';
  document.getElementById('tn_cancel').style.display = 'none';
  document.getElementById('tn_name').value = '';
  document.getElementById('tn_desc').value = '';
  document.getElementById('tn_dex').value = 'pacifica';
  document.getElementById('tn_dex_scope').value = 'single';
  setTournamentDexSelection(['pacifica']);
  document.getElementById('tn_mode').value = 'individual';
  document.getElementById('tn_team_score_by').value = 'volume_usd';
  document.getElementById('tn_team_prize_mode').value = 'winner_takes_all';
  document.getElementById('tn_team_member_reward_by').value = 'volume_usd';
  document.getElementById('tn_attack_match_policy').value = 'all';
  document.getElementById('tn_start').value = '';
  document.getElementById('tn_end').value = '';
  document.getElementById('tn_prereg').checked = false;
  document.getElementById('tn_reg_open').value = '';
  document.getElementById('tn_reg_close').value = '';
  document.getElementById('tn_gold').value = '1';
  document.getElementById('tn_seeker_gold').value = '1';
  document.getElementById('tn_trophy').value = '1';
  document.getElementById('tn_shield_hours').value = '';
  document.getElementById('tn_freeze_trophies').checked = true;
  document.getElementById('tn_seeker_only').checked = false;
  document.getElementById('tn_sort').value = 'points';
  document.getElementById('tn_scoring_mode').value = 'live';
  document.getElementById('tn_daily_pool_points').value = '1000';
  document.getElementById('tn_daily_pool_growth_pct').value = '0';
  document.getElementById('tn_points_trophy').value = '20';
  document.getElementById('tn_points_volume').value = '60';
  document.getElementById('tn_points_pnl').value = '20';
  document.getElementById('tn_points_trophy_on').checked = true;
  document.getElementById('tn_points_volume_on').checked = true;
  document.getElementById('tn_points_pnl_on').checked = true;
  setTournamentPointInputs('tn_team_points', { trophies: 20, volume: 60, pnl: 20 });
  document.getElementById('tn_prize_currency').value = 'USD';
  document.getElementById('tn_rewards_cop').checked = false;
  renderTournamentPrizeTiers([]);
  document.getElementById('tn_status').value = 'active';
  updateTournamentDexScopeUi();
  updateTournamentTeamUi();
  updateTournamentPointsUi();
  updateTournamentDailyOverridesUi({});
  updateTournamentPrizeUi();
}

function editTournament(id) {
  const t = TOURNAMENTS_CACHE.find(x => Number(x.id) === Number(id));
  if (!t) return;
  TOURNAMENT_EDIT_ID = t.id;
  document.getElementById('tn_form_title').textContent = 'Edit Tournament #' + t.id;
  document.getElementById('tn_submit').textContent = 'Save changes';
  document.getElementById('tn_cancel').style.display = 'inline-block';
  document.getElementById('tn_name').value = t.name || '';
  document.getElementById('tn_desc').value = t.description || '';
  document.getElementById('tn_dex').value = t.dex || 'pacifica';
  document.getElementById('tn_dex_scope').value = t.dex_scope || ((t.eligible_dexes || []).length > 1 ? 'custom' : 'single');
  setTournamentDexSelection(t.eligible_dexes || [t.dex || 'pacifica']);
  document.getElementById('tn_mode').value = t.mode || 'individual';
  document.getElementById('tn_team_score_by').value = t.team_score_by || 'volume_usd';
  document.getElementById('tn_team_prize_mode').value = t.team_prize_mode || 'winner_takes_all';
  document.getElementById('tn_team_member_reward_by').value = t.team_member_reward_by || 'volume_usd';
  document.getElementById('tn_attack_match_policy').value = t.attack_match_policy || 'all';
  document.getElementById('tn_start').value = t.start_at || '';
  document.getElementById('tn_end').value = t.end_at || '';
  document.getElementById('tn_prereg').checked = !!t.preregistration_enabled;
  document.getElementById('tn_reg_open').value = t.registration_opens_at || '';
  document.getElementById('tn_reg_close').value = t.registration_closes_at || '';
  document.getElementById('tn_gold').value = t.gold_boost || 1;
  document.getElementById('tn_seeker_gold').value = t.seeker_gold_boost || 1;
  document.getElementById('tn_trophy').value = t.trophy_boost || 1;
  document.getElementById('tn_shield_hours').value = t.shield_hours == null ? '' : t.shield_hours;
  document.getElementById('tn_freeze_trophies').checked = t.freeze_trophies !== false;
  document.getElementById('tn_seeker_only').checked = !!t.seeker_only;
  document.getElementById('tn_sort').value = t.sort_by === 'volume_trophies_50_50' ? 'points' : (t.sort_by || 'points');
  document.getElementById('tn_scoring_mode').value = isTournamentDailyPool(t) ? 'daily_pool' : 'live';
  document.getElementById('tn_daily_pool_points').value = Math.max(1, Number(t.daily_pool_points || 1000) || 1000);
  document.getElementById('tn_daily_pool_growth_pct').value = Number(t.daily_pool_growth_pct || 0) || 0;
  const weights = tournamentPointsWeights(t);
  document.getElementById('tn_points_trophy').value = weights.trophies;
  document.getElementById('tn_points_volume').value = weights.volume;
  document.getElementById('tn_points_pnl').value = weights.pnl;
  document.getElementById('tn_points_trophy_on').checked = Number(weights.trophies) > 0;
  document.getElementById('tn_points_volume_on').checked = Number(weights.volume) > 0;
  document.getElementById('tn_points_pnl_on').checked = Number(weights.pnl) > 0;
  setTournamentPointInputs('tn_team_points', weights);
  document.getElementById('tn_prize_currency').value = t.prize_currency || 'USD';
  document.getElementById('tn_rewards_cop').checked = !!t.rewards_in_cop;
  renderTournamentPrizeTiers(t.prize_tiers || []);
  document.getElementById('tn_status').value = t.status || 'active';
  updateTournamentDexScopeUi();
  updateTournamentTeamUi(t.team_prize_splits || []);
  updateTournamentPointsUi();
  updateTournamentDailyOverridesUi(t.daily_pool_overrides || {});
  updateTournamentPrizeUi();
  document.getElementById('tn_form_title').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveTournament() {
  const body = getTournamentFormBody();
  if (!body.name) { alert('Name required'); return; }
  if (!body.eligible_dexes || body.eligible_dexes.length === 0) {
    alert('Pick at least one eligible DEX.');
    return;
  }
  if (body.shield_hours !== null && (!Number.isFinite(body.shield_hours) || body.shield_hours < 0)) {
    alert('Shield after raid must be blank, 0, or a positive number of hours.');
    return;
  }
  if (body.mode === 'dex_vs_dex') {
    if (body.eligible_dexes.length < 2) {
      alert('DEX vs DEX needs at least two selected DEXes.');
      return;
    }
    if (body.team_prize_mode === 'custom_split') {
      const total = (body.team_prize_splits || []).reduce((s, row) => s + Number(row.share_pct || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        alert('DEX prize split shares must add up to 100%. Current total: ' + total.toFixed(2) + '%.');
        return;
      }
    }
  }
  const needsPointWeights = body.scoring_mode === 'daily_pool'
    || body.sort_by === 'points'
    || (body.mode === 'dex_vs_dex' && (body.team_score_by === 'points' || body.team_member_reward_by === 'points'));
  if (needsPointWeights) {
    const total = body.points_trophy_weight + body.points_volume_weight + body.points_pnl_weight;
    if (Math.abs(total - 100) > 0.001) {
      alert('Point weights must add up to 100%. Current total: ' + total + '%.');
      return;
    }
  }
  const badTier = (body.prize_tiers || []).find((tier) =>
    (tier.rewards || []).find((reward) =>
      (reward.payouts || []).reduce((s, p) => s + Number(p.amount || 0), 0) > Number(reward.pool_amount || 0) + 0.01
    )
  );
  if (badTier) {
    alert('Prize reward payouts cannot exceed their configured pool.');
    return;
  }
  const editingId = TOURNAMENT_EDIT_ID;
  const r = await fetch(editingId ? '/api/admin/tournaments/' + editingId : '/api/admin/tournaments', {
    method: editingId ? 'PATCH' : 'POST',
    headers: { 'x-admin-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) { alert(j.error || 'Failed'); return; }
  resetTournamentForm();
  loadTournaments();
}

async function createTournament() {
  return saveTournament();
}

async function endTournament(id) {
  if (!confirm('Force-end tournament #' + id + '? Players keep their stats but it stops accepting trophies/gold.')) return;
  await fetch('/api/admin/tournaments/' + id + '/end', { method: 'POST', headers: { 'x-admin-key': KEY } });
  loadTournaments();
}

async function deleteTournament(id) {
  if (!confirm('Delete tournament #' + id + ' (also wipes participants)?')) return;
  await fetch('/api/admin/tournaments/' + id, { method: 'DELETE', headers: { 'x-admin-key': KEY } });
  if (TOURNAMENT_LB_ID === id) {
    TOURNAMENT_LB_ID = null;
    document.getElementById('tn_lb_meta').textContent = 'Pick a tournament below to view its leaderboard.';
    document.getElementById('tn_lb_body').innerHTML = '';
    document.getElementById('tn_daily_meta').textContent = 'Pick a tournament daily log to inspect UTC day awards.';
    document.getElementById('tn_daily_body').innerHTML = '';
  }
  loadTournaments();
}

async function loadTournamentLeaderboard(id) {
  TOURNAMENT_LB_ID = id;
  try {
    const r = await fetch('/api/tournaments/' + id + '/leaderboard?limit=50', {
      headers: { 'x-admin-key': KEY },
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error || 'Failed'); return; }
    const t = j.tournament;
    const prize = j.prize || {};
    const teamMeta = j.teams && Array.isArray(j.teams.teams)
      ? ' · teams: ' + j.teams.teams.map(team => team.label + ' #' + team.rank + ' ' + Number(team.score || 0).toFixed(1) + (team.winner ? ' winner' : '')).join(' | ')
      : '';
    const prizeMeta = Number(prize.pool_usd || 0) > 0
      ? ' · prize: ' + fmtTournamentUsd(prize.pool_usd, prize.currency || t.prize_currency || 'USD')
      : (prize.next_tier ? ' · next prize: ' + fmtTournamentUsd(prize.next_tier.pool_usd || 0, prize.currency || t.prize_currency || 'USD') + ' @ ' + fmtTournamentUsd(prize.next_tier.volume_usd || 0, '') + ' vol' : '');
    const totalVolumeMeta = ' · total volume: ' + fmtTournamentUsd(prize.total_volume_usd ?? t.prize_total_volume_usd ?? 0, '');
    document.getElementById('tn_lb_meta').textContent =
      '#' + t.id + ' ' + t.name + ' · ' + (t.dex_label || t.dex) + ' · ' + (t.mode_label || 'Individual') + ' · ' + (t.phase || t.status) + ' · sort: ' + (j.sort_label || tournamentSortLabel(j.sort_by)) + totalVolumeMeta + prizeMeta + teamMeta + ' · ' + (j.leaderboard.length) + ' players';
    document.getElementById('tn_lb_body').innerHTML = j.leaderboard.map(r => {
      const score = r.score == null ? '—' : Number(r.score || 0).toFixed(1);
      const prizeAmount = Number(r.prize_amount || 0);
      const rewardWallet = r.reward_wallet_evm ? '<div style="font-size:10px;color:#9ca3af">' + esc(r.reward_wallet_evm) + '</div>' : '';
      return '<tr>'
        + '<td>' + r.rank + '</td>'
        + '<td>' + esc(r.name || (r.wallet || '').slice(0, 8)) + '</td>'
        + '<td>' + esc(r.team_label || r.dex || 'вЂ”') + (r.team_rank ? '<div style="font-size:10px;color:#9ca3af">team #' + r.team_rank + '</div>' : '') + '</td>'
        + '<td>' + score + '</td>'
        + '<td>' + (prizeAmount > 0 ? fmtTournamentUsd(prizeAmount, r.prize_currency || prize.currency || t.prize_currency || 'USD') : '—') + rewardWallet + '</td>'
        + '<td>' + r.trophies + '</td>'
        + '<td>' + r.gold + '</td>'
        + '<td>' + r.trades_count + '</td>'
        + '<td>$' + Math.round(r.volume_usd || 0).toLocaleString() + '</td>'
        + '<td style="color:' + ((r.pnl_usd || 0) >= 0 ? '#34d399' : '#fca5a5') + '">$' + (r.pnl_usd || 0).toFixed(2) + '</td>'
        + '<td><button class="btn" onclick="adjustTournamentTrophies(' + t.id + ',\\'' + esc(jsq(r.player_id)) + '\\',\\'' + esc(jsq(r.name || r.player_id)) + '\\')">+/- Troph</button></td>'
        + '</tr>';
    }).join('');
    if (isTournamentDailyPool(t)) {
      loadTournamentDailyLogs(id);
    } else {
      document.getElementById('tn_daily_meta').textContent = 'Tournament #' + t.id + ' uses live scoring, so no daily point awards are generated.';
      document.getElementById('tn_daily_body').innerHTML = '';
    }
  } catch(e) { console.error(e); }
}

async function adjustTournamentTrophies(tournamentId, playerId, label, quickDelta) {
  const raw = quickDelta == null ? prompt('Tournament trophy delta for ' + label + ' (use negative to subtract):', '100') : String(quickDelta);
  if (raw === null) return;
  const delta = Math.trunc(Number(raw));
  if (!Number.isFinite(delta) || delta === 0) { alert('Enter a non-zero number.'); return; }
  try {
    const data = await apiPost('/admin/tournaments/' + tournamentId + '/participants/' + encodeURIComponent(playerId) + '/adjust-trophies', { delta });
    const sign = data.delta >= 0 ? '+' : '';
    alert('Tournament trophies: ' + data.before + ' -> ' + data.trophies + ' (' + sign + data.delta + ')');
    loadTournamentLeaderboard(tournamentId);
    loadTournaments();
  } catch (e) {
    alert(e.message || 'Failed to adjust tournament trophies');
  }
}

function fmtTournamentPoints(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 100) return v.toFixed(1);
  return v.toFixed(3).replace(/\.?0+$/, '') || '0';
}

function tournamentDailyCategorySummary(categories) {
  if (!categories || !categories.length) return '<span style="color:#6b7280">no awards yet</span>';
  const label = { trophies: 'Trophies', volume: 'Volume', pnl: 'PnL' };
  return categories.map(c => {
    const raw = c.category === 'volume'
      ? '$' + Math.round(Number(c.raw_value || 0)).toLocaleString()
      : fmtTournamentPoints(c.raw_value);
    return '<span style="display:inline-block;margin-right:10px;color:#cbd5e1">'
      + esc(label[c.category] || c.category) + ': <strong style="color:#fbbf24">' + fmtTournamentPoints(c.points) + ' pts</strong>'
      + ' <span style="color:#6b7280">raw ' + raw + ' / ' + (c.players || 0) + ' players</span></span>';
  }).join('');
}

async function loadTournamentDailyLogs(id) {
  try {
    const r = await fetch('/api/admin/tournaments/' + id + '/daily-points?limit=21', {
      headers: { 'x-admin-key': KEY },
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error || 'Failed'); return; }
    const t = j.tournament || {};
    const days = j.days || [];
    document.getElementById('tn_daily_meta').textContent =
      '#' + t.id + ' ' + (t.name || '') + ' - daily pool log, newest UTC days first (' + days.length + ' day rows)';
    if (!days.length) {
      document.getElementById('tn_daily_body').innerHTML =
        '<div style="color:#6b7280;font-size:12px;padding:12px;border:1px dashed #374151;border-radius:8px">No daily activity or awards recorded yet.</div>';
      return;
    }
    document.getElementById('tn_daily_body').innerHTML = days.map(day => {
      const run = day.run || {};
      const totals = day.totals || {};
      const processed = day.processed
        ? '<span style="color:#34d399">processed ' + esc(run.processed_at || '') + '</span>'
        : '<span style="color:#fbbf24">not awarded yet</span>';
      const players = day.players || [];
      const rows = players.map((p, idx) => {
        const name = p.name || (p.wallet ? p.wallet.slice(0, 8) : String(p.player_id || '').slice(0, 8));
        const points = fmtTournamentPoints(p.points || 0);
        return '<tr>'
          + '<td>' + (idx + 1) + '</td>'
          + '<td>' + esc(name) + '<div style="font-size:10px;color:#6b7280">' + esc(p.dex || '') + '</div></td>'
          + '<td style="color:#fbbf24;font-weight:700">' + points + '</td>'
          + '<td>' + fmtTournamentPoints(p.trophy_points || 0) + '</td>'
          + '<td>' + fmtTournamentPoints(p.volume_points || 0) + '</td>'
          + '<td>' + fmtTournamentPoints(p.pnl_points || 0) + '</td>'
          + '<td>' + (p.trophies || 0) + '</td>'
          + '<td>$' + Math.round(p.volume_usd || 0).toLocaleString() + '</td>'
          + '<td style="color:' + ((p.pnl_usd || 0) >= 0 ? '#34d399' : '#fca5a5') + '">$' + Number(p.pnl_usd || 0).toFixed(2) + '</td>'
          + '<td>' + (p.trades_count || 0) + '</td>'
          + '<td>' + (p.events || 0) + '</td>'
          + '</tr>';
      }).join('') || '<tr><td colspan="11" style="text-align:center;color:#6b7280;padding:10px">No player rows for this day.</td></tr>';
      return '<div style="border:1px solid #374151;border-radius:10px;background:#111827;padding:12px">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px">'
        +   '<div><strong style="color:#e5e7eb">' + esc(day.day_utc) + '</strong>'
        +     '<div style="font-size:11px;color:#9ca3af">' + processed + ' - total awards ' + fmtTournamentPoints(totals.points || run.total_points || 0) + ' pts</div>'
        +   '</div>'
        +   '<div style="font-size:11px;color:#9ca3af;text-align:right">'
        +     (totals.players || 0) + ' players - ' + (totals.trades_count || 0) + ' trades - $' + Math.round(totals.volume_usd || 0).toLocaleString() + ' volume - ' + (totals.trophies || 0) + ' trophies'
        +   '</div>'
        + '</div>'
        + '<div style="font-size:11px;margin-bottom:8px">' + tournamentDailyCategorySummary(day.category_totals || []) + '</div>'
        + '<table style="font-size:11px"><thead><tr>'
        + '<th>#</th><th>Player</th><th>Pts</th><th>Trophy pts</th><th>Volume pts</th><th>PnL pts</th><th>Trophies</th><th>Volume</th><th>PnL</th><th>Trades</th><th>Events</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>'
        + '</div>';
    }).join('');
  } catch(e) { console.error(e); }
}

// ---------- Elfa admin ----------
let ELFA_CACHE = { stats: [], errors: [], has_key: false };

async function loadElfa() {
  try {
    const d = await api('/admin/elfa/stats');
    ELFA_CACHE = d;
    const totalHits = (d.stats || []).reduce((s, r) => s + (r.explain_hits || 0), 0);
    const totalFresh = (d.stats || []).reduce((s, r) => s + (r.fresh_calls || 0), 0);
    const totalCache = (d.stats || []).reduce((s, r) => s + (r.cache_hits || 0), 0);
    const totalCredits = (d.stats || []).reduce((s, r) => s + (r.credits_total || 0), 0);
    const cacheRatio = totalHits > 0 ? Math.round((totalCache / totalHits) * 100) : 0;
    document.getElementById('elfaSummary').innerHTML =
      '<div class="stat"><div class="v">' + (d.has_key ? '<span style="color:#34d399">ON</span>' : '<span style="color:#fca5a5">OFF</span>') + '</div><div class="l">API Key</div></div>' +
      '<div class="stat"><div class="v">' + (d.stats || []).length + '</div><div class="l">Tracked Symbols</div></div>' +
      '<div class="stat"><div class="v">' + totalHits + '</div><div class="l">Total Requests</div></div>' +
      '<div class="stat"><div class="v" style="color:#34d399">' + totalCache + '</div><div class="l">Cache Hits</div></div>' +
      '<div class="stat"><div class="v" style="color:#f59e0b">' + totalFresh + '</div><div class="l">Fresh Elfa Calls</div></div>' +
      '<div class="stat"><div class="v">' + cacheRatio + '%</div><div class="l">Cache Ratio</div></div>' +
      '<div class="stat"><div class="v" style="color:#e8b830">' + totalCredits + '</div><div class="l">Credits Used</div></div>' +
      '<div class="stat"><div class="v" style="color:#fca5a5">' + (d.errors || []).length + '</div><div class="l">Recent Errors</div></div>';
    renderElfaStats();
  } catch(e) { console.error(e); }
}

function renderElfaStats() {
  const search = (document.getElementById('elfaSearch').value || '').toLowerCase();
  const rows = (ELFA_CACHE.stats || []).filter(r => !search || r.symbol.toLowerCase().includes(search));
  document.getElementById('elfaCount').textContent = rows.length + ' symbols';
  document.getElementById('elfaStatsBody').innerHTML = rows.map(r => {
    const lastRefreshed = r.last_refreshed_at ? r.last_refreshed_at.replace('T',' ').split('.')[0] : '—';
    const cacheRatio = r.explain_hits > 0 ? Math.round((r.cache_hits / r.explain_hits) * 100) : 0;
    return '<tr>' +
      '<td><strong>' + esc(r.symbol) + '</strong></td>' +
      '<td>' + (r.explain_hits || 0) + '</td>' +
      '<td style="color:#34d399">' + (r.cache_hits || 0) + ' <span style="color:#6b7280;font-size:10px">(' + cacheRatio + '%)</span></td>' +
      '<td style="color:#f59e0b">' + (r.fresh_calls || 0) + '</td>' +
      '<td style="color:#e8b830">' + (r.credits_total || 0) + '</td>' +
      '<td class="mono" style="font-size:11px;color:#9ca3af">' + lastRefreshed + '</td>' +
      '<td>' + esc(r.last_player || '—') + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:20px">No usage yet</td></tr>';

  document.getElementById('elfaErrorsBody').innerHTML = (ELFA_CACHE.errors || []).map(e => {
    const t = (e.ts || '').split('T')[1]?.split('.')[0] || '';
    const sc = e.status || 0;
    const color = sc >= 500 ? '#fca5a5' : sc >= 400 ? '#f59e0b' : '#9ca3af';
    return '<tr>' +
      '<td class="mono" style="font-size:11px">' + t + '</td>' +
      '<td class="mono" style="font-size:11px">' + esc(e.path || '') + '</td>' +
      '<td style="color:' + color + ';font-weight:700">' + sc + '</td>' +
      '<td style="font-size:11px;color:#9ca3af">' + esc(e.message || '') + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:#6b7280;padding:12px">No errors</td></tr>';
}

function renderRevenueAnalytics(data) {
  const totalsEl = document.getElementById('revenueAnalyticsTotals');
  const dexBody = document.getElementById('revenueDexWindowBody');
  const tnBody = document.getElementById('revenueTournamentBody');
  const tnMeta = document.getElementById('revenueTournamentMeta');
  if (!totalsEl || !dexBody || !tnBody || !tnMeta) return;
  if (!data || data.error) {
    totalsEl.innerHTML = '<div class="stat" style="border-color:#ef4444"><div class="v" style="color:#fca5a5">Failed</div><div class="l">' + esc(data?.error || 'analytics unavailable') + '</div></div>';
    dexBody.innerHTML = '<tr><td colspan="6" style="color:#fca5a5;text-align:center;padding:18px">Revenue analytics unavailable</td></tr>';
    tnBody.innerHTML = '<tr><td colspan="11" style="color:#fca5a5;text-align:center;padding:18px">Tournament analytics unavailable</td></tr>';
    tnMeta.textContent = '';
    return;
  }

  const windows = Array.isArray(data.windows) ? data.windows : [];
  const byWindow = Object.fromEntries(windows.map(w => [w.key, w]));
  const w24 = byWindow['24h'] || {};
  const w30 = byWindow['30d'] || {};
  const wall = byWindow.all || {};
  const stat = (value, label, color = '#e8b830') =>
    '<div class="stat"><div class="v" style="color:' + color + '">' + value + '</div><div class="l">' + label + '</div></div>';
  totalsEl.innerHTML =
    stat(fmtAdminUsd(w24.total_estimated_fee_usd), '24h estimated fee', '#fbbf24') +
    stat(fmtAdminUsd(w30.total_estimated_fee_usd), '30d estimated fee', '#fbbf24') +
    stat(fmtAdminUsd(wall.total_estimated_fee_usd), 'All estimated fee', '#fbbf24') +
    stat(fmtAdminCompactUsd(w30.total_volume_usd), '30d local volume', '#38bdf8') +
    stat((Number(w30.total_trades) || 0).toLocaleString(), '30d local trades', '#fbbf24');

  const dexes = Array.isArray(data.dexes) && data.dexes.length ? data.dexes : [
    { key: 'pacifica', label: 'Pacifica' },
    { key: 'decibel', label: 'Decibel' },
    { key: 'avantis', label: 'Avantis' },
    { key: 'gmx', label: 'GMX' },
    { key: 'phoenix', label: 'Phoenix' },
    { key: 'monad', label: 'Perpl' },
    { key: 'hyperliquid', label: 'Hyperliquid' },
    { key: 'risex', label: 'RISE' },
    { key: 'nado', label: 'Nado' },
    { key: 'hibachi', label: 'Hibachi' },
    { key: 'hotstuff', label: 'Hotstuff' },
    { key: 'katana', label: 'Katana Perps' },
    { key: 'gmtrade', label: 'GMTrade' },
    { key: 'flash', label: 'Flash Trade' },
  ];
  const windowKeys = ['24h', '7d', '30d', 'all'];
  const revenueCell = (row) => {
    if (!row) return '<td style="color:#6b7280">-</td>';
    const estimate = Number(row.estimated_fee_usd) || 0;
    const volume = Number(row.volume_usd) || 0;
    const trades = Number(row.trades) || 0;
    const estimateLine = estimate > 0
      ? '<div style="font-size:10px;color:#fbbf24">estimated only</div>'
      : '';
    return '<td><strong style="color:#fbbf24">' + fmtAdminUsd(estimate, 2) + '</strong>' +
      '<div style="font-size:10px;color:#94a3b8">' + fmtAdminCompactUsd(volume) + ' vol / ' + trades.toLocaleString() + ' trades</div>' +
      estimateLine + '</td>';
  };
  dexBody.innerHTML = dexes.map((dex) => {
    const allRow = byWindow.all?.dexes?.[dex.key] || {};
    const configured = allRow.configured !== false;
    const modelColor = configured ? '#94a3b8' : '#fca5a5';
    return '<tr>' +
      '<td><strong>' + esc(dex.label || dex.key) + '</strong><div class="mono" style="font-size:10px;color:#64748b">' + esc(dex.key) + '</div></td>' +
      windowKeys.map(k => revenueCell(byWindow[k]?.dexes?.[dex.key])).join('') +
      '<td style="color:' + modelColor + ';font-size:11px">' + esc(allRow.rate_label || allRow.model || '-') + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:18px">No DEX analytics yet</td></tr>';

  const tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];
  tnMeta.textContent = 'Updated ' + (data.last_updated || '') + '. ' + (data.note || '');
  tnBody.innerHTML = tournaments.map((row) => {
    const breakdown = Array.isArray(row.breakdown) ? row.breakdown : [];
    const dexText = breakdown.length > 1
      ? breakdown.map(b => esc(String(b.dex || '').toUpperCase()) + ' ' + fmtAdminCompactUsd(b.volume_usd)).join('<br>')
      : esc(String(row.dex || breakdown[0]?.dex || '-').toUpperCase());
    const rateText = breakdown.length
      ? breakdown.map(b => esc(String(b.dex || '').toUpperCase()) + ': ' + esc(b.rate_label || b.model || '-')).join('<br>')
      : esc(row.source_detail || '-');
    const period = fmtAdminTime(row.start_at) + ' - ' + (row.end_at ? fmtAdminTime(row.end_at) : 'open');
    const estimate = Number(row.estimated_fee_usd) || 0;
    const estimateCell = estimate > 0
      ? '<span style="color:#fbbf24">' + fmtAdminUsd(estimate, 2) + '</span>'
      : '<span style="color:#94a3b8">-</span>';
    return '<tr>' +
      '<td class="mono">' + row.id + '</td>' +
      '<td><strong>' + esc(row.name || '-') + '</strong><div style="font-size:10px;color:#64748b">' + esc(row.mode || '') + ' / ' + esc(row.dex_scope || '') + '</div></td>' +
      '<td>' + dexText + '</td>' +
      '<td><span class="badge">' + esc(row.phase || row.status || '-') + '</span></td>' +
      '<td style="font-size:11px;color:#94a3b8">' + esc(period) + '</td>' +
      '<td>' + (Number(row.players) || 0).toLocaleString() + '</td>' +
      '<td>' + (Number(row.trades) || 0).toLocaleString() + '</td>' +
      '<td style="color:#38bdf8;font-weight:800">' + fmtAdminCompactUsd(row.volume_usd) + '</td>' +
      '<td style="color:#94a3b8;font-weight:800">exact in Earnings</td>' +
      '<td>' + estimateCell + '</td>' +
      '<td style="font-size:10px;color:#94a3b8">' + esc(row.source_detail || '-') + '<div>' + rateText + '</div></td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="11" style="color:#6b7280;text-align:center;padding:18px">No tournaments yet</td></tr>';
}

async function loadEarnings(force) {
  const meta = document.getElementById('earningsMeta');
  meta.textContent = 'Reading on-chain' + (force ? ' (forced refresh)' : '') + '…';
  try {
    const [data, analytics] = await Promise.all([
      api('/admin/earnings' + (force ? '?force=1' : '')),
      api('/admin/revenue-analytics').catch((e) => ({ error: e?.message || String(e) })),
    ]);
    renderRevenueAnalytics(analytics);
    const dexes = [
      ['pacifica', 'Pacifica', '#a78bfa', '#7C3AED'],
      ['decibel',  'Decibel',  '#facc15', '#facc15'],
      ['avantis',  'Avantis',  '#38bdf8', '#0EA5E9'],
      ['gmx',      'GMX',      '#a5b4fc', '#4f46e5'],
      ['phoenix',  'Phoenix',  '#fb923c', '#f97316'],
      ['monad',    'Perpl',    '#c4b5fd', '#8b5cf6'],
      ['hyperliquid', 'Hyperliquid', '#86efac', '#16a34a'],
      ['grvt',     'GRVT',     '#5eead4', '#14b8a6'],
      ['nado',     'Nado',     '#67e8f9', '#00b8d9'],
      ['hibachi',  'Hibachi',  '#f87171', '#dc2626'],
      ['hotstuff', 'Hotstuff', '#fca5a5', '#ef4444'],
      ['katana',   'Katana Perps', '#67e8f9', '#06b6d4'],
      ['gmtrade',  'GMTrade',  '#5eead4', '#0f766e'],
      ['flash',    'Flash Trade', '#fde047', '#eab308'],
    ];
    const total = Number(data.total_usd) || 0;
    document.getElementById('earningsTotals').innerHTML =
      '<div class="stat" style="min-width:200px"><div class="v">$' + total.toFixed(2) + '</div><div class="l">Total net earned</div></div>';
    document.getElementById('earningsCards').innerHTML = dexes.map(([k, label, color, border]) => {
      const d = data[k] || {};
      const ok = d.ok;
      const v = ok && Number.isFinite(d.earned_usd) ? '$' + d.earned_usd.toFixed(4) : '—';
      const addrLine = ok && d.address
        ? '<code class="mono" style="color:#94a3b8;font-size:10px">' + esc(d.address.slice(0, 10) + '…' + d.address.slice(-4)) + '</code>'
        : '';
      const subLine = (() => {
        if (!ok) return '';
        if (d.model === 'onchain_collateral_transfers') {
          const transfers = Number(d.transfer_events || 0);
          const estimate = Number.isFinite(Number(d.estimated_fee_usd))
            ? ' · local estimate $' + Number(d.estimated_fee_usd).toFixed(4)
            : '';
          const collateral = Number.isFinite(Number(d.collateral_usd))
            ? ' · collateral $' + Number(d.collateral_usd).toFixed(2)
            : '';
          return '<span style="color:#9ca3af;font-size:11px">' + transfers + ' fee transfer(s)' + estimate + collateral + '</span>';
        }
        if (d.model === 'hyperliquid_referral_builder_rewards') {
          const unclaimed = Number.isFinite(Number(d.unclaimed_rewards_usd))
            ? ' · $' + Number(d.unclaimed_rewards_usd).toFixed(4) + ' unclaimed'
            : '';
          const claimed = Number.isFinite(Number(d.claimed_rewards_usd))
            ? ' · $' + Number(d.claimed_rewards_usd).toFixed(4) + ' claimed'
            : '';
          const estimate = Number.isFinite(Number(d.estimated_fee_usd))
            ? ' · local estimate $' + Number(d.estimated_fee_usd).toFixed(4)
            : '';
          return '<span style="color:#9ca3af;font-size:11px">exact builderRewards' + unclaimed + claimed + estimate + '</span>';
        }
        if (d.model === 'nado_indexer_builder_fee_exact') {
          const estimate = Number.isFinite(Number(d.estimated_fee_usd))
            ? ' / local estimate $' + Number(d.estimated_fee_usd).toFixed(4)
            : '';
          const latest = d.latest_submission_idx
            ? ' / last idx ' + esc(String(d.latest_submission_idx))
            : '';
          return '<span style="color:#9ca3af;font-size:11px">builder #' + esc(String(d.builder_id || '')) + ' / ' + (d.matched_events || 0) + ' indexed fill(s) / ' + (d.indexed_wallets || 0) + ' wallet(s)' + latest + estimate + '</span>';
        }
        if (d.model === 'grvt_builder_fill_history') {
          const estimate = Number.isFinite(Number(d.estimated_fee_usd))
            ? ' / local estimate $' + Number(d.estimated_fee_usd).toFixed(4)
            : '';
          const local = Number.isFinite(Number(d.local_trades))
            ? ' / local ' + Number(d.local_trades) + ' fill(s)'
            : '';
          return '<span style="color:#9ca3af;font-size:11px">' + (d.trades || 0) + ' builder fill(s) / $' + Number(d.volume_usd || 0).toFixed(0) + ' vol' + local + estimate + '</span>';
        }
        if (d.model === 'hotstuff_local_broker_fee_exact') {
          const estimate = Number.isFinite(Number(d.estimated_fee_usd))
            ? ' / local estimate $' + Number(d.estimated_fee_usd).toFixed(4)
            : '';
          const acct = Number.isFinite(Number(d.broker_account_equity_usd))
            ? ' / broker equity $' + Number(d.broker_account_equity_usd).toFixed(2)
            : '';
          const legacy = Number(d.legacy_unverified_fills || 0) > 0
            ? ' / legacy pending ' + Number(d.legacy_unverified_fills)
            : '';
          return '<span style="color:#9ca3af;font-size:11px">' + (d.trades || 0) + ' fill(s) / $' + Number(d.volume_usd || 0).toFixed(0) + ' vol / 24h exact fee $' + Number(d.earned_24h_usd || 0).toFixed(4) + acct + legacy + estimate + '</span>';
        }
        if (d.model === 'perpl_builder_fee_not_configured') {
          const pct = Number(d.builder_fee_pct ?? d.fee_per_side_pct ?? 0);
          const estimate = Number.isFinite(Number(d.estimated_fee_usd))
            ? ' · hypothetical ' + pct + '% $' + Number(d.estimated_fee_usd).toFixed(4)
            : '';
          return '<span style="color:#9ca3af;font-size:11px">' + d.trades + ' indexed fills · $' + Number(d.volume_usd || 0).toFixed(0) + ' vol · no builder-fee source' + estimate + '</span>';
        }
        if (d.model === 'nado_builder_not_configured') {
          return '<span style="color:#9ca3af;font-size:11px">builder code not configured</span>';
        }
        if (d.volume_usd != null) {
          if (d.model === 'single_builder_fee' || d.builder_fee_pct != null) {
            return '<span style="color:#9ca3af;font-size:11px">' + d.trades + ' trades · $' + Number(d.volume_usd).toFixed(0) + ' vol × ' + (d.builder_fee_pct ?? d.fee_per_side_pct ?? 0) + '% builder fee</span>';
          }
          return '<span style="color:#9ca3af;font-size:11px">' + d.trades + ' trades · $' + Number(d.volume_usd).toFixed(0) + ' vol × ' + (d.rebate_pct ?? 0) + '% × ' + (d.fee_per_side_pct ?? 0) + '%</span>';
        }
        if (d.trades != null) {
          return '<span style="color:#9ca3af;font-size:11px">' + d.trades + ' trades' + (d.traded_referrals ? ' / ' + d.traded_referrals + ' refs' : '') + '</span>';
        }
        if (d.withdrawable_usd != null) {
          return '<span style="color:#9ca3af;font-size:11px">$' + d.withdrawable_usd.toFixed(2) + ' withdrawable</span>';
        }
        return '';
      })();
      const tradeLine = subLine;
      const noteLine = ok && d.note
        ? '<div style="margin-top:6px;font-size:11px;color:#fbbf24;line-height:1.4">' + esc(d.note) + '</div>'
        : '';
      const errLine = !ok
        ? '<div style="margin-top:6px;font-size:11px;color:#fca5a5">' + esc(d.error || 'unavailable') + '</div>'
        : '';
      return '<div style="background:#1f2937;border:1px solid ' + border + ';border-radius:12px;padding:18px">'
        + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">'
        +   '<div style="font-size:13px;color:' + color + ';font-weight:700;text-transform:uppercase;letter-spacing:0.5px">' + label + '</div>'
        +   '<div style="font-size:11px;color:#6b7280">' + esc(d.currency || '') + '</div>'
        + '</div>'
        + '<div style="font-size:28px;font-weight:800;color:' + color + '">' + v + '</div>'
        + '<div style="margin-top:8px;display:flex;justify-content:space-between;gap:8px;align-items:baseline">' + addrLine + tradeLine + '</div>'
        + noteLine + errLine
        + '</div>';
    }).join('');
    const ageS = Math.round((Number(data.age_ms) || 0) / 1000);
    meta.textContent = 'Updated ' + esc(data.last_updated || '') + (data.cached ? ' • cached (' + ageS + 's old)' : ' • fresh');
  } catch (e) {
    meta.textContent = 'Failed: ' + (e?.message || e);
  }
}

async function loadShop() {
  try {
    const [data, aiBilling] = await Promise.all([
      api('/admin/shop'),
      api('/admin/ai-chat/billing').catch((e) => ({ error: e?.message || String(e) })),
    ]);
    const s = data.summary || {};
    const fmtUsd = (v) => '$' + (Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtTime = (t) => t ? new Date(t.replace(' ', 'T') + 'Z').toLocaleString() : '—';
    const txLink = (chain, hash) => {
      if (!hash) return '—';
      const key = String(chain || '').toLowerCase();
      const explorers = {
        base: 'https://basescan.org/tx/',
        arbitrum: 'https://arbiscan.io/tx/',
        monad: 'https://testnet.monadexplorer.com/tx/',
        ink: 'https://explorer.inkonchain.com/tx/',
        solana: 'https://solscan.io/tx/',
        aptos: 'https://explorer.aptoslabs.com/txn/',
      };
      const explorer = explorers[key] || null;
      const short = '<code class="mono">' + esc(hash.slice(0, 10) + '…' + hash.slice(-6)) + '</code>';
      return explorer ? '<a href="' + explorer + esc(hash) + '" target="_blank" style="color:#fbbf24">' + short + '</a>' : short;
    };

    document.getElementById('shopSummary').innerHTML =
      '<div class="stat"><div class="v">' + (s.total_purchases || 0) + '</div><div class="l">Total purchases</div></div>' +
      '<div class="stat" style="border-color:#22c55e"><div class="v" style="color:#4ade80">' + fmtUsd(s.total_revenue_usd) + '</div><div class="l">Cash/native revenue</div></div>' +
      '<div class="stat"><div class="v">' + fmtUsd(s.gross_sales_usd) + '</div><div class="l">Gross shop value</div></div>' +
      '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24">' + fmtUsd(s.project_token_value_usd) + '</div><div class="l">SKR/CoP value</div></div>' +
      '<div class="stat"><div class="v" style="color:#4ade80">' + fmtUsd(s.stable_revenue_usd) + '</div><div class="l">USDC revenue</div></div>' +
      '<div class="stat"><div class="v" style="color:#38bdf8">' + fmtUsd(s.native_revenue_usd) + '</div><div class="l">Native est.</div></div>' +
      '<div class="stat" style="border-color:#0ea5e9"><div class="v" style="color:#38bdf8">' + (s.unique_buyers || 0) + '</div><div class="l">Unique buyers</div></div>' +
      '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24">' + (s.altar_purchases || 0) + '</div><div class="l">Altar bought</div></div>' +
      '<div class="stat"><div class="v">' + (s.last_1h_purchases || 0) + '</div><div class="l">1h purchases</div></div>' +
      '<div class="stat"><div class="v">' + (s.last_24h_purchases || 0) + '</div><div class="l">24h purchases</div></div>' +
      '<div class="stat"><div class="v" style="color:#4ade80">' + fmtUsd(s.last_24h_revenue_usd) + '</div><div class="l">24h cash/native</div></div>' +
      '<div class="stat"><div class="v">' + (s.last_7d_purchases || 0) + '</div><div class="l">7d purchases</div></div>';

    if (aiBilling && !aiBilling.error) {
      const u = aiBilling.usage || {};
      const b = aiBilling.balances || {};
      const h = aiBilling.hermes || {};
      const w = aiBilling.usage_windows || {};
      const aiRevenue = aiBilling.revenue_summary || {};
      const aiPaymentTotals = (aiBilling.payments_by_chain || []).reduce((acc, row) => {
        acc.payments += Number(row.payments || 0);
        acc.revenue += Number(row.revenue_usd || 0);
        return acc;
      }, { payments: 0, revenue: 0 });
      const aiCashRevenue = aiRevenue.revenue_usd ?? aiPaymentTotals.revenue;
      const aiGrossValue = aiRevenue.gross_sales_usd ?? aiPaymentTotals.revenue;
      document.getElementById('aiFreeMessagesPerDay').value = aiBilling.settings?.free_messages_per_day ?? 0;
      document.getElementById('aiChatBillingSummary').innerHTML =
        '<div class="stat" style="border-color:#22c55e"><div class="v" style="color:#4ade80">' + (aiBilling.settings?.free_messages_per_day ?? 0) + '</div><div class="l">Free msgs / day</div></div>' +
        '<div class="stat"><div class="v">' + (u.today || 0) + '</div><div class="l">AI msgs today</div></div>' +
        '<div class="stat"><div class="v">' + (u.week || 0) + '</div><div class="l">AI msgs 7d</div></div>' +
        '<div class="stat"><div class="v">' + (u.all || 0) + '</div><div class="l">AI msgs all</div></div>' +
        '<div class="stat"><div class="v">' + (w.users_7d || 0) + '</div><div class="l">AI users 7d</div></div>' +
        '<div class="stat"><div class="v">' + aiPaymentTotals.payments + '</div><div class="l">AI payments</div></div>' +
        '<div class="stat" style="border-color:#22c55e"><div class="v" style="color:#4ade80">' + fmtUsd(aiCashRevenue) + '</div><div class="l">AI cash/native</div></div>' +
        '<div class="stat"><div class="v">' + fmtUsd(aiGrossValue) + '</div><div class="l">AI gross value</div></div>' +
        '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24">' + fmtUsd(aiRevenue.project_token_value_usd) + '</div><div class="l">AI SKR/CoP value</div></div>' +
        '<div class="stat" style="border-color:#22c55e"><div class="v" style="color:#4ade80">' + (b.outstanding_credits || 0) + '</div><div class="l">Outstanding credits</div></div>' +
        '<div class="stat"><div class="v">' + (b.lifetime_players || 0) + '</div><div class="l">Lifetime passes</div></div>' +
        '<div class="stat" style="border-color:#ef4444"><div class="v" style="color:#fca5a5">' + (h.h24_errors || 0) + '</div><div class="l">Hermes errors 24h</div></div>' +
        '<div class="stat"><div class="v">' + (h.avg_duration_ms || 0) + 'ms</div><div class="l">Avg response</div></div>';
      const aiUsers = aiBilling.users || [];
      document.getElementById('aiChatUsersBody').innerHTML = aiUsers.length === 0
        ? '<tr><td colspan="10" style="color:#6b7280;text-align:center;padding:18px">No AI chat users yet</td></tr>'
        : aiUsers.map((row) => {
            const hermesErrors = Number(row.hermes_errors || 0);
            const mcpErrors = Number(row.mcp_errors || 0);
            return '<tr>' +
              '<td style="font-weight:800">' + esc(row.name || row.player_id || '-') + '<div class="mono" style="font-size:10px;color:#64748b">' + esc(String(row.player_id || '').slice(0, 12)) + '</div></td>' +
              '<td>' + esc(row.dex || '-') + '</td>' +
              '<td>' + (row.today_used || 0) + '</td>' +
              '<td>' + (row.week_used || 0) + '</td>' +
              '<td><strong>' + (row.total_used || 0) + '</strong><div style="font-size:10px;color:#94a3b8">free ' + (row.free_used || 0) + ' / sub ' + (row.subscription_used || 0) + ' / credits ' + (row.credit_used || 0) + '</div></td>' +
              '<td>' + (row.hermes_requests || 0) + '<div style="font-size:10px;color:' + (hermesErrors ? '#fca5a5' : '#94a3b8') + '">errors ' + hermesErrors + ' / avg ' + (row.hermes_avg_duration_ms || 0) + 'ms</div></td>' +
              '<td>' + (row.mcp_calls || 0) + '<div style="font-size:10px;color:' + (mcpErrors ? '#fca5a5' : '#94a3b8') + '">errors ' + mcpErrors + '</div></td>' +
              '<td>' + (row.credits || 0) + '<div style="font-size:10px;color:#94a3b8">daily ' + (row.lifetime_daily_limit || 0) + '</div></td>' +
              '<td>' + (row.ai_purchases || 0) + '<div style="font-size:10px;color:#4ade80">' + fmtUsd(row.spent_usd) + '</div></td>' +
              '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.last_chat_at || row.last_usage_day || row.last_purchase_at)) + '</td>' +
            '</tr>';
          }).join('');

      const payChains = aiBilling.payments_by_chain || [];
      document.getElementById('aiChatPaymentChainsBody').innerHTML = payChains.length === 0
        ? '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:18px">No AI payments yet</td></tr>'
        : payChains.map((row) => '<tr>' +
            '<td><span class="badge">' + esc(row.chain || 'unknown') + '</span></td>' +
            '<td>' + (row.payments || 0) + '</td>' +
            '<td>' + (row.buyers || 0) + '</td>' +
            '<td style="color:#4ade80;font-weight:800">' + fmtUsd(row.revenue_usd) + '</td>' +
            '<td>' + (row.h24 || 0) + '</td>' +
            '<td>' + (row.d7 || 0) + '</td>' +
            '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.last_at)) + '</td>' +
          '</tr>').join('');

      const payTokens = aiBilling.payments_by_token || [];
      document.getElementById('aiChatPaymentTokensBody').innerHTML = payTokens.length === 0
        ? '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:18px">No AI token payments yet</td></tr>'
        : payTokens.map((row) => '<tr>' +
            '<td><span class="badge">' + esc(row.chain || 'unknown') + '</span></td>' +
            '<td class="mono">' + esc(row.token || 'unknown') + '</td>' +
            '<td>' + (row.payments || 0) + '</td>' +
            '<td>' + (row.buyers || 0) + '</td>' +
            '<td style="color:#4ade80;font-weight:800">' + fmtUsd(row.revenue_usd) + '</td>' +
            '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.last_at)) + '</td>' +
          '</tr>').join('');

      const payProducts = aiBilling.payments_by_product_chain || [];
      document.getElementById('aiChatPaymentProductsBody').innerHTML = payProducts.length === 0
        ? '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:18px">No AI product payments yet</td></tr>'
        : payProducts.map((row) => '<tr>' +
            '<td style="font-weight:700">' + esc(row.title || row.sku || '-') + '<div class="mono" style="font-size:10px;color:#64748b">' + esc(row.sku || '') + '</div></td>' +
            '<td><span class="badge">' + esc(row.chain || 'unknown') + '</span></td>' +
            '<td class="mono">' + esc(row.token || 'unknown') + '</td>' +
            '<td>' + (row.payments || 0) + '</td>' +
            '<td>' + (row.buyers || 0) + '</td>' +
            '<td style="color:#4ade80;font-weight:800">' + fmtUsd(row.revenue_usd) + '</td>' +
            '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.last_at)) + '</td>' +
          '</tr>').join('');

      const aiPayments = aiBilling.payment_recent || [];
      document.getElementById('aiChatPaymentRecentBody').innerHTML = aiPayments.length === 0
        ? '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:18px">No recent AI payments</td></tr>'
        : aiPayments.map((row) => '<tr>' +
            '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtTime(row.created_at)) + '</td>' +
            '<td style="font-weight:700">' + esc(row.name || row.player_id || '-') + '<div style="font-size:10px;color:#64748b">' + esc(row.dex || '-') + '</div></td>' +
            '<td>' + esc(row.title || row.sku || '-') + '</td>' +
            '<td><span class="badge">' + esc(row.chain || '-') + '</span><div class="mono" style="font-size:10px;color:#94a3b8">' + esc(row.token || '-') + '</div></td>' +
            '<td style="color:#4ade80;font-weight:700">' + fmtUsd(row.price_usd) + '</td>' +
            '<td class="mono" style="font-size:11px;color:#9ca3af">' + (row.payer ? esc(row.payer.slice(0, 8) + 'вЂ¦' + row.payer.slice(-4)) : 'вЂ”') + '</td>' +
            '<td>' + txLink(row.chain, row.tx_hash) + '</td>' +
          '</tr>').join('');

      const aiModels = aiBilling.hermes_models || [];
      document.getElementById('aiChatModelBody').innerHTML = aiModels.length === 0
        ? '<tr><td colspan="5" style="color:#6b7280;text-align:center;padding:18px">No AI chat model logs yet</td></tr>'
        : aiModels.map((row) => '<tr>' +
            '<td class="mono" style="font-size:11px">' + esc(row.model || 'unknown') + '</td>' +
            '<td>' + (row.requests || 0) + '</td>' +
            '<td style="color:' + ((row.errors || 0) ? '#fca5a5' : '#94a3b8') + '">' + (row.errors || 0) + '</td>' +
            '<td>' + (row.avg_duration_ms || 0) + 'ms</td>' +
            '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.last_at)) + '</td>' +
          '</tr>').join('');
      const aiErrors = aiBilling.hermes_errors_recent || [];
      document.getElementById('aiChatErrorsBody').innerHTML = aiErrors.length === 0
        ? '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:18px">No AI chat errors yet</td></tr>'
        : aiErrors.map((row) => '<tr class="log-row-error">' +
            '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtTime(row.created_at)) + '</td>' +
            '<td style="font-weight:700">' + esc(row.player_name || row.player_id || '-') + '</td>' +
            '<td><span class="badge">' + esc(row.intent || '-') + '</span><div class="mono" style="font-size:10px;color:#64748b">trace ' + esc(String(row.trace_id || '').slice(0, 12)) + '</div></td>' +
            '<td class="mono" style="font-size:10px;color:#cbd5e1">' + esc(row.model || '-') + '</td>' +
            '<td>' + (row.duration_ms ?? '-') + 'ms</td>' +
            '<td style="max-width:560px;white-space:normal;line-height:1.35">' +
              '<div style="color:#fca5a5">' + esc(row.error || row.status || '-') + '</div>' +
              '<div style="color:#fbbf24;margin-top:4px">' + esc(row.request_preview || '') + '</div>' +
            '</td>' +
          '</tr>').join('');
      const aiRecent = aiBilling.hermes_recent || [];
      document.getElementById('aiChatRecentBody').innerHTML = aiRecent.length === 0
        ? '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:18px">No AI chat logs yet</td></tr>'
        : aiRecent.map((row) => {
            const ok = row.status === 'ok';
            const trace = row.trace_id ? '<div class="mono" style="font-size:10px;color:#6b7280">trace ' + esc(String(row.trace_id).slice(0, 12)) + '</div>' : '';
            const attempts = Array.isArray(row.attempts) && row.attempts.length
              ? '<div class="mono" style="font-size:10px;color:#94a3b8;margin-top:4px">' + esc(row.attempts.map(a => (a.model || '?') + ':' + (a.status || '?') + ':' + (a.call_ms ?? 0) + 'ms').join(' | ')) + '</div>'
              : '';
            const err = row.error ? '<div style="color:#fca5a5;margin-top:4px">' + esc(row.error) + '</div>' : '';
            return '<tr>' +
              '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtTime(row.created_at)) + trace + '</td>' +
              '<td style="font-weight:700">' + esc(row.player_name || row.player_id || '-') + '</td>' +
              '<td><span class="badge">' + esc(row.intent || '-') + '</span><div style="font-size:10px;color:#64748b">' + esc(row.event_type || 'message') + '</div></td>' +
              '<td style="color:' + (ok ? '#4ade80' : '#fca5a5') + ';font-weight:700">' + esc(row.status || '-') + '</td>' +
              '<td>' + (row.duration_ms ?? '-') + 'ms</td>' +
              '<td class="mono" style="font-size:10px;color:#cbd5e1">' + esc(row.model || '-') + '</td>' +
              '<td style="max-width:520px;white-space:normal;line-height:1.35">' +
                '<div style="color:#fbbf24">' + esc(row.request_preview || '') + '</div>' +
                '<div style="color:#cbd5e1;margin-top:4px">' + esc(row.response_preview || '') + '</div>' +
                attempts + err +
              '</td>' +
            '</tr>';
          }).join('');
    } else {
      document.getElementById('aiChatBillingSummary').innerHTML =
        '<div style="color:#ef4444">AI billing failed: ' + esc(aiBilling?.error || 'unknown') + '</div>';
      document.getElementById('aiChatUsersBody').innerHTML = '<tr><td colspan="10" style="color:#ef4444">Unavailable</td></tr>';
      document.getElementById('aiChatPaymentChainsBody').innerHTML = '<tr><td colspan="7" style="color:#ef4444">Unavailable</td></tr>';
      document.getElementById('aiChatPaymentTokensBody').innerHTML = '<tr><td colspan="6" style="color:#ef4444">Unavailable</td></tr>';
      document.getElementById('aiChatPaymentProductsBody').innerHTML = '<tr><td colspan="7" style="color:#ef4444">Unavailable</td></tr>';
      document.getElementById('aiChatPaymentRecentBody').innerHTML = '<tr><td colspan="7" style="color:#ef4444">Unavailable</td></tr>';
      document.getElementById('aiChatModelBody').innerHTML = '<tr><td colspan="5" style="color:#ef4444">Unavailable</td></tr>';
      document.getElementById('aiChatErrorsBody').innerHTML = '<tr><td colspan="6" style="color:#ef4444">Unavailable</td></tr>';
      document.getElementById('aiChatRecentBody').innerHTML = '<tr><td colspan="7" style="color:#ef4444">Unavailable</td></tr>';
    }

    const bySku = data.by_sku || [];
    document.getElementById('shopBySkuBody').innerHTML = bySku.length === 0
      ? '<tr><td colspan="8" style="color:#6b7280;text-align:center;padding:24px">No purchases yet</td></tr>'
      : bySku.map((row) => '<tr>' +
          '<td style="font-weight:700">' + esc(row.title) + '</td>' +
          '<td class="mono">' + esc(row.sku) + '</td>' +
          '<td>' + (row.kind ? '<span class="badge badge-shield">' + esc(row.kind) + '</span>' : '—') + '</td>' +
          '<td>' + row.purchases + '</td>' +
          '<td>' + row.unique_buyers + '</td>' +
          '<td style="color:#4ade80;font-weight:700">' + fmtUsd(row.revenue_usd) + '</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.first_at)) + '</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.last_at)) + '</td>' +
        '</tr>').join('');

    const top = data.top_buyers || [];
    document.getElementById('shopTopBuyersBody').innerHTML = top.length === 0
      ? '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:24px">No buyers</td></tr>'
      : top.map((row, i) => '<tr>' +
          '<td style="color:#9ca3af">' + (i + 1) + '</td>' +
          '<td style="font-weight:700">' + esc(row.name) + '</td>' +
          '<td>' + esc(row.dex || '-') + '</td>' +
          '<td>' + row.purchases + '</td>' +
          '<td style="color:#4ade80;font-weight:700">' + fmtUsd(row.spent_usd) + '</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.last_at)) + '</td>' +
        '</tr>').join('');

    const recent = data.recent || [];
    document.getElementById('shopRecentBody').innerHTML = recent.length === 0
      ? '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:24px">No recent purchases</td></tr>'
      : recent.map((row) => '<tr>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtTime(row.created_at)) + '</td>' +
          '<td style="font-weight:700">' + esc(row.name) + '</td>' +
          '<td>' + esc(row.title) + '</td>' +
          '<td style="color:#4ade80">' + fmtUsd(row.price_usd) + '</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + (row.payer ? esc(row.payer.slice(0, 8) + '…' + row.payer.slice(-4)) : '—') + '</td>' +
          '<td>' + txLink(row.chain, row.tx_hash) + '</td>' +
        '</tr>').join('');
  } catch (e) {
    console.error(e);
    document.getElementById('shopSummary').innerHTML = '<div style="color:#ef4444">Failed to load: ' + esc(e?.message || String(e)) + '</div>';
  }
}

async function saveAiChatSettings() {
  const el = document.getElementById('aiFreeMessagesPerDay');
  const status = document.getElementById('aiChatSettingsStatus');
  status.textContent = 'Saving...';
  status.style.color = '#94a3b8';
  try {
    await apiPost('/admin/ai-chat/settings', {
      free_messages_per_day: Number(el.value || 0),
    });
    status.style.color = '#4ade80';
    status.textContent = 'Saved';
    await loadShop();
  } catch (e) {
    status.style.color = '#fca5a5';
    status.textContent = e?.message || 'Failed';
  }
}

let marketplaceCache = null;

function marketUsdc(units) {
  const raw = Number(units || 0);
  return fmtAdminUsd(raw / 1000000, 2);
}

function marketShort(value, head = 8, tail = 5) {
  const s = String(value || '');
  if (!s) return '-';
  return s.length > head + tail + 3 ? s.slice(0, head) + '...' + s.slice(-tail) : s;
}

function marketChainLabel(chain) {
  return ({
    base: 'Base',
    arbitrum: 'Arbitrum',
    monad: 'Monad',
    ink: 'Ink',
    aptos: 'Aptos',
    solana: 'Solana',
    unknown: 'Unknown',
  }[String(chain || '').toLowerCase()] || chain || '-');
}

function marketChainBadge(chain) {
  const c = String(chain || 'unknown').toLowerCase();
  const colors = {
    base: '#2563eb',
    arbitrum: '#1d4ed8',
    monad: '#7c3aed',
    ink: '#111827',
    aptos: '#374151',
    solana: '#059669',
    unknown: '#4b5563',
  };
  return '<span class="badge" style="background:' + (colors[c] || '#4b5563') + ';color:#fff">' + esc(marketChainLabel(c)) + '</span>';
}

function marketStatusBadge(status) {
  const s = String(status || 'unknown').toLowerCase();
  const styles = {
    awaiting_deposit: 'background:#713f12;color:#fde68a',
    active: 'background:#064e3b;color:#86efac',
    reserved: 'background:#1e3a5f;color:#bfdbfe',
    paid: 'background:#78350f;color:#fbbf24',
    delivering: 'background:#581c87;color:#ddd6fe',
    delivered: 'background:#14532d;color:#bbf7d0',
    cancelled: 'background:#374151;color:#9ca3af',
    unknown: 'background:#4b5563;color:#d1d5db',
  };
  return '<span class="badge" style="' + (styles[s] || styles.unknown) + '">' + esc(s) + '</span>';
}

function marketExplorerUrl(chain, hash) {
  const h = String(hash || '');
  if (!h) return null;
  const c = String(chain || '').toLowerCase();
  if (c === 'base') return 'https://basescan.org/tx/' + h;
  if (c === 'arbitrum') return 'https://arbiscan.io/tx/' + h;
  if (c === 'monad') return 'https://testnet.monadexplorer.com/tx/' + h;
  if (c === 'ink') return 'https://explorer.inkonchain.com/tx/' + h;
  if (c === 'solana') return 'https://solscan.io/tx/' + h;
  if (c === 'aptos') return 'https://explorer.aptoslabs.com/txn/' + h + '?network=mainnet';
  return null;
}

function marketTxLink(chain, hash) {
  if (!hash) return '<span style="color:#6b7280">-</span>';
  const label = '<code class="mono">' + esc(marketShort(hash, 10, 6)) + '</code>';
  const url = marketExplorerUrl(chain, hash);
  return url ? '<a href="' + esc(url) + '" target="_blank" style="color:#fbbf24">' + label + '</a>' : label;
}

function marketWallet(value) {
  if (!value) return '<span style="color:#6b7280">-</span>';
  return '<code class="mono" title="' + esc(value) + '">' + esc(marketShort(value, 8, 5)) + '</code>';
}

function marketAssetCell(order) {
  return marketChainBadge(order.assetChain) +
    '<div class="mono" title="' + esc(order.assetId || '') + '" style="margin-top:4px;color:#cbd5e1">' + esc(marketShort(order.assetId, 10, 6)) + '</div>' +
    '<div style="font-size:10px;color:#64748b">L' + (order.level || 1) + ' ' + esc(order.assetStandard || '') + '</div>';
}

function marketPaymentCell(order) {
  const payment = order.payment || {};
  return marketChainBadge(order.paymentChain || payment.chain) +
    '<div style="font-size:11px;color:#4ade80;margin-top:4px">' + esc(payment.amountFormatted || order.priceUsdc || '-') + ' ' + esc(order.paymentLabel || payment.label || 'USDC') + '</div>' +
    (order.paymentTxHash ? '<div>' + marketTxLink(order.paymentChain || payment.chain, order.paymentTxHash) + '</div>' : '');
}

function marketErrorCell(order) {
  if (!order.error) return '<span style="color:#6b7280">-</span>';
  return '<div class="log-msg" style="color:#fca5a5;max-width:360px">' + esc(order.error) + '</div>';
}

function marketActions(order) {
  const id = encodeURIComponent(String(order.id || ''));
  const parts = [];
  if (order.status === 'paid' || order.status === 'delivering') {
    parts.push('<button class="btn" onclick="settleMarketplaceOrder(decodeURIComponent(\\'' + id + '\\'))">Auto settle</button>');
  }
  if (order.status === 'delivered' && !order.payoutTxHash) {
    parts.push('<button class="btn" onclick="payoutMarketplaceOrder(decodeURIComponent(\\'' + id + '\\'))">Auto payout</button>');
  }
  return parts.join(' ') || '<span style="color:#6b7280">-</span>';
}

function renderMarketplaceGroupRows(rows, bodyId, emptyText) {
  document.getElementById(bodyId).innerHTML = (rows || []).length === 0
    ? '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:18px">' + esc(emptyText) + '</td></tr>'
    : rows.map((row) => '<tr class="' + ((row.errors || 0) ? 'log-row-warn' : '') + '">' +
        '<td>' + (row.status ? marketStatusBadge(row.status) : marketChainBadge(row.chain)) + '</td>' +
        '<td style="font-weight:800">' + (row.orders || 0) + '</td>' +
        '<td>' + (row.openOrders || 0) + '</td>' +
        '<td>' + (row.sales || 0) + '</td>' +
        '<td style="color:#4ade80;font-weight:700">' + marketUsdc(row.salesVolumeUsdcUnits) + '</td>' +
        '<td style="color:' + ((row.errors || 0) ? '#fca5a5' : '#6b7280') + '">' + (row.errors || 0) + '</td>' +
        '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtAdminTime(row.latestAt)) + '</td>' +
      '</tr>').join('');
}

function renderMarketplace() {
  const data = marketplaceCache;
  if (!data) return;
  const s = data.summary || {};
  document.getElementById('marketplaceSummary').innerHTML =
    '<div class="stat"><div class="v">' + (s.totalOrders || 0) + '</div><div class="l">Total orders</div></div>' +
    '<div class="stat" style="border-color:#22c55e"><div class="v" style="color:#4ade80">' + (s.deliveredOrders || 0) + '</div><div class="l">Delivered sales</div></div>' +
    '<div class="stat" style="border-color:#22c55e"><div class="v" style="color:#4ade80">' + marketUsdc(s.salesVolumeUsdcUnits) + '</div><div class="l">Sales volume</div></div>' +
    '<div class="stat"><div class="v">' + (s.activeListings || 0) + '</div><div class="l">Active listings</div></div>' +
    '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24">' + ((s.reservedOrders || 0) + (s.paidOrders || 0) + (s.deliveringOrders || 0)) + '</div><div class="l">Pending buyers</div></div>' +
    '<div class="stat" style="border-color:' + ((s.errorOrders || 0) ? '#ef4444' : '#22c55e') + '"><div class="v" style="color:' + ((s.errorOrders || 0) ? '#f87171' : '#4ade80') + '">' + (s.errorOrders || 0) + '</div><div class="l">Orders with errors</div></div>' +
    '<div class="stat"><div class="v">' + marketUsdc(s.feeUsdcUnits) + '</div><div class="l">Marketplace fee</div></div>' +
    '<div class="stat"><div class="v">' + marketUsdc(s.royaltyUsdcUnits) + '</div><div class="l">Royalty</div></div>' +
    '<div class="stat"><div class="v">' + marketUsdc(s.projectRevenueUsdcUnits) + '</div><div class="l">Project revenue</div></div>' +
    '<div class="stat" style="border-color:#38bdf8"><div class="v" style="color:#38bdf8">' + marketUsdc(s.payoutDueUsdcUnits) + '</div><div class="l">Payout due</div></div>' +
    '<div class="stat"><div class="v">' + (s.sales24h || 0) + '</div><div class="l">Sales 24h</div></div>' +
    '<div class="stat"><div class="v" style="font-size:14px;color:#9ca3af">' + esc(fmtAdminTime(s.latestAt)) + '</div><div class="l">Latest update</div></div>';

  renderMarketplaceGroupRows(data.byStatus, 'marketplaceStatusBody', 'No marketplace status data');
  renderMarketplaceGroupRows(data.byAssetChain, 'marketplaceAssetChainBody', 'No asset chain data');
  renderMarketplaceGroupRows(data.byPaymentChain, 'marketplacePaymentChainBody', 'No payment chain data');

  const errors = data.recentErrors || [];
  document.getElementById('marketplaceErrorsBody').innerHTML = errors.length === 0
    ? '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:24px">No marketplace errors</td></tr>'
    : errors.map((order) => '<tr class="log-row-error">' +
        '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtAdminTime(order.updatedAt)) + '</td>' +
        '<td><code class="mono">' + esc(marketShort(order.id, 8, 6)) + '</code></td>' +
        '<td>' + marketStatusBadge(order.status) + '</td>' +
        '<td>' + marketAssetCell(order) + '</td>' +
        '<td>' + marketPaymentCell(order) + '</td>' +
        '<td>' + marketErrorCell(order) + '</td>' +
        '<td>' + marketActions(order) + '</td>' +
      '</tr>').join('');

  const filterEl = document.getElementById('marketplaceOrderFilter');
  const filter = filterEl ? String(filterEl.value || 'all') : 'all';
  let orders = data.recentOrders || [];
  if (filter === 'errors') orders = orders.filter((order) => !!order.error);
  else if (filter === 'open') orders = orders.filter((order) => !['delivered', 'cancelled'].includes(String(order.status || '').toLowerCase()));
  else if (filter !== 'all') orders = orders.filter((order) => String(order.status || '').toLowerCase() === filter);

  document.getElementById('marketplaceOrdersBody').innerHTML = orders.length === 0
    ? '<tr><td colspan="11" style="color:#6b7280;text-align:center;padding:24px">No orders for this filter</td></tr>'
    : orders.map((order) => '<tr class="' + (order.error ? 'log-row-error' : '') + '">' +
        '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtAdminTime(order.updatedAt)) + '</td>' +
        '<td><code class="mono" title="' + esc(order.id || '') + '">' + esc(marketShort(order.id, 8, 6)) + '</code></td>' +
        '<td>' + marketStatusBadge(order.status) + '</td>' +
        '<td>' + marketAssetCell(order) + '</td>' +
        '<td>' + marketChainBadge(order.sellerPayoutChain || order.assetChain) + '<div>' + marketWallet(order.sellerWallet) + '</div></td>' +
        '<td>' + marketChainBadge(order.buyerDestChain || order.paymentChain) + '<div>' + marketWallet(order.buyerWallet || order.buyerDestAddress) + '</div></td>' +
        '<td style="color:#4ade80;font-weight:700">' + marketUsdc(order.priceUsdcUnits) +
          '<div style="font-size:10px;color:#64748b">fee ' + marketUsdc(order.feeUsdcUnits) + '</div>' +
          '<div style="font-size:10px;color:#64748b">royalty ' + marketUsdc(order.royaltyUsdcUnits) + '</div>' +
        '</td>' +
        '<td>' + marketPaymentCell(order) + '</td>' +
        '<td><div>Delivery: ' + marketTxLink(order.buyerDestChain || order.assetChain, order.deliveryTxHash) + '</div><div style="margin-top:4px">Payout: ' + marketTxLink(order.sellerPayoutChain, order.payoutTxHash) + '</div></td>' +
        '<td>' + marketErrorCell(order) + '</td>' +
        '<td>' + marketActions(order) + '</td>' +
      '</tr>').join('');

  const events = data.recentEvents || [];
  document.getElementById('marketplaceEventsBody').innerHTML = events.length === 0
    ? '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:24px">No marketplace events</td></tr>'
    : events.map((event) => {
        const order = event.order || {};
        const dataText = JSON.stringify(event.data || {});
        return '<tr class="' + (String(event.type || '').includes('failed') ? 'log-row-error' : 'log-row-info') + '">' +
          '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtAdminTime(event.createdAt)) + '</td>' +
          '<td><span class="badge">' + esc(event.type || '-') + '</span></td>' +
          '<td><code class="mono">' + esc(marketShort(event.orderId, 8, 6)) + '</code></td>' +
          '<td>' + marketStatusBadge(order.status) + '</td>' +
          '<td>' + marketChainBadge(order.assetChain) + '<div class="mono" style="font-size:10px;color:#94a3b8">' + esc(marketShort(order.assetId, 8, 6)) + '</div></td>' +
          '<td>' + marketTxLink(order.paymentChain || order.assetChain, event.txHash) + '</td>' +
          '<td><div class="log-msg" style="max-width:420px;color:#cbd5e1">' + esc(dataText) + '</div></td>' +
        '</tr>';
      }).join('');
}

async function loadMarketplace() {
  try {
    const data = await api('/admin/marketplace/custodial/stats?limit=500');
    if (data?.error) throw new Error(data.error);
    marketplaceCache = data;
    renderMarketplace();
  } catch (e) {
    console.error(e);
    document.getElementById('marketplaceSummary').innerHTML = '<div style="color:#ef4444">Marketplace stats failed: ' + esc(e?.message || String(e)) + '</div>';
    ['marketplaceStatusBody', 'marketplaceAssetChainBody', 'marketplacePaymentChainBody', 'marketplaceErrorsBody', 'marketplaceOrdersBody', 'marketplaceEventsBody'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<tr><td style="color:#ef4444">Unavailable</td></tr>';
    });
  }
}

async function settleMarketplaceOrder(id) {
  if (!confirm('Run automatic marketplace delivery for this order?')) return;
  await apiPost('/admin/marketplace/custodial/orders/' + encodeURIComponent(id) + '/settle', { mode: 'auto' });
  await loadMarketplace();
}

async function payoutMarketplaceOrder(id) {
  if (!confirm('Run automatic seller payout for this order?')) return;
  await apiPost('/admin/marketplace/custodial/orders/' + encodeURIComponent(id) + '/payout', { mode: 'auto' });
  await loadMarketplace();
}

async function loadNftAnalytics() {
  try {
    const data = await api('/admin/nft-analytics');
    const fmtUsd = (v) => '$' + (Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtTime = (t) => t ? new Date(String(t).replace(' ', 'T') + 'Z').toLocaleString() : '-';
    const short = (v, a = 10, b = 6) => {
      const s = String(v || '');
      return s.length > a + b + 3 ? s.slice(0, a) + '...' + s.slice(-b) : s;
    };
    const chainLabel = (chain) => ({
      base: 'Base',
      arbitrum: 'Arbitrum',
      monad: 'Monad',
      ink: 'Ink',
      aptos: 'Aptos',
      solana: 'Solana',
    }[chain] || chain || '-');
    const tokenLabel = (token) => {
      const raw = String(token || 'native');
      const lower = raw.toLowerCase();
      if (!raw || raw === 'native' || /^0x0{40}$/.test(lower)) return 'native';
      if (lower === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') return 'USDC';
      return short(raw, 8, 6);
    };
    const explorerUrl = (chain, hash) => {
      const h = String(hash || '');
      if (!h) return null;
      if (chain === 'base') return 'https://basescan.org/tx/' + h;
      if (chain === 'arbitrum') return 'https://arbiscan.io/tx/' + h;
      if (chain === 'ink') return 'https://explorer.inkonchain.com/tx/' + h;
      if (chain === 'aptos') return 'https://explorer.aptoslabs.com/txn/' + h + '?network=mainnet';
      if (chain === 'solana') return 'https://solscan.io/tx/' + h;
      return null;
    };
    const txLink = (chain, hash) => {
      if (!hash) return '-';
      const url = explorerUrl(chain, hash);
      const label = '<code class="mono">' + esc(short(hash)) + '</code>';
      return url ? '<a href="' + esc(url) + '" target="_blank" style="color:#fbbf24">' + label + '</a>' : label;
    };
    const destLink = (chain, value) => {
      if (!value) return '<span style="color:#f59e0b">pending</span>';
      const s = String(value);
      if (s.includes('@')) {
        const parts = s.split('@');
        return '<code class="mono">' + esc(short(parts[0], 8, 6)) + '</code><br>' + txLink(chain, parts[1]);
      }
      return txLink(chain, s);
    };

    const supply = data.supply || {};
    const bridge = data.bridges?.summary || {};
    const logs = data.bridge_logs?.summary || {};
    document.getElementById('nftSummary').innerHTML =
      '<div class="stat"><div class="v">' + (supply.total || 0) + '/' + (supply.cap || 0) + '</div><div class="l">NFT supply</div></div>' +
      '<div class="stat"><div class="v">' + (supply.remaining || 0) + '</div><div class="l">Remaining</div></div>' +
      '<div class="stat" style="border-color:#38bdf8"><div class="v" style="color:#38bdf8">' + (bridge.total || 0) + '</div><div class="l">Total bridges</div></div>' +
      '<div class="stat"><div class="v">' + (bridge.today || 0) + '</div><div class="l">Bridges today</div></div>' +
      '<div class="stat" style="border-color:#f59e0b"><div class="v" style="color:#fbbf24">' + (bridge.pending || 0) + '</div><div class="l">Pending dest mint</div></div>' +
      '<div class="stat" style="border-color:' + ((logs.errors_24h || 0) ? '#ef4444' : '#22c55e') + '"><div class="v" style="color:' + ((logs.errors_24h || 0) ? '#f87171' : '#4ade80') + '">' + (logs.errors_24h || 0) + '</div><div class="l">Bridge errors 24h</div></div>';

    const supplyRows = supply.per_chain || [];
    document.getElementById('nftSupplyBody').innerHTML = supplyRows.length === 0
      ? '<tr><td colspan="4" style="color:#6b7280;text-align:center;padding:24px">No supply data</td></tr>'
      : supplyRows.map((row) => '<tr>' +
          '<td style="font-weight:700">' + esc(chainLabel(row.chain)) + '</td>' +
          '<td style="color:#fbbf24;font-weight:800">' + (row.count || 0) + '</td>' +
          '<td>' + (row.live ? '<span class="badge" style="background:#064e3b;color:#86efac">live</span>' : '<span class="badge" style="background:#713f12;color:#fde68a">fallback</span>') + '</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + (row.raw == null ? '-' : esc(row.raw)) + '</td>' +
        '</tr>').join('');

    const routeRows = data.bridges?.by_route || [];
    document.getElementById('bridgeRoutesBody').innerHTML = routeRows.length === 0
      ? '<tr><td colspan="5" style="color:#6b7280;text-align:center;padding:24px">No bridges yet</td></tr>'
      : routeRows.map((row) => '<tr>' +
          '<td><span class="badge badge-shield">' + esc(chainLabel(row.source_chain)) + '</span> -> <span class="badge badge-shield">' + esc(chainLabel(row.dest_chain)) + '</span></td>' +
          '<td style="font-weight:800">' + (row.total || 0) + '</td>' +
          '<td>' + (row.today || 0) + '</td>' +
          '<td style="color:' + ((row.pending || 0) ? '#fbbf24' : '#9ca3af') + '">' + (row.pending || 0) + '</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.latest_at)) + '</td>' +
        '</tr>').join('');

    const paymentRows = data.payments?.utility_by_token || [];
    document.getElementById('paymentTokensBody').innerHTML = paymentRows.length === 0
      ? '<tr><td colspan="7" style="color:#6b7280;text-align:center;padding:24px">No shop/resource payments yet</td></tr>'
      : paymentRows.map((row) => '<tr>' +
          '<td>' + esc(chainLabel(row.chain)) + '</td>' +
          '<td><code class="mono">' + esc(tokenLabel(row.token)) + '</code></td>' +
          '<td style="font-weight:800">' + (row.payments || 0) + '</td>' +
          '<td>' + (row.today || 0) + '</td>' +
          '<td>' + (row.unique_buyers || 0) + '</td>' +
          '<td style="color:#4ade80;font-weight:700">' + fmtUsd(row.revenue_usd) + '</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.latest_at)) + '</td>' +
        '</tr>').join('');

    const paymentChainRows = data.payments?.utility_by_chain || [];
    document.getElementById('paymentChainsBody').innerHTML = paymentChainRows.length === 0
      ? '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:24px">No chain payment totals yet</td></tr>'
      : paymentChainRows.map((row) => '<tr>' +
          '<td style="font-weight:700">' + esc(chainLabel(row.chain)) + '</td>' +
          '<td style="font-weight:800">' + (row.payments || 0) + '</td>' +
          '<td>' + (row.today || 0) + '</td>' +
          '<td>' + (row.unique_buyers || 0) + '</td>' +
          '<td style="color:#4ade80;font-weight:700">' + fmtUsd(row.revenue_usd) + '</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.latest_at)) + '</td>' +
        '</tr>').join('');

    const marketRows = data.payments?.marketplace_by_token || [];
    document.getElementById('marketplaceTokensBody').innerHTML = marketRows.length === 0
      ? '<tr><td colspan="4" style="color:#6b7280;text-align:center;padding:24px">No marketplace sales indexed yet</td></tr>'
      : marketRows.map((row) => '<tr>' +
          '<td>' + esc(chainLabel(row.chain)) + '</td>' +
          '<td><code class="mono">' + esc(tokenLabel(row.token)) + '</code></td>' +
          '<td style="font-weight:800">' + (row.sales || 0) + '</td>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af">' + esc(fmtTime(row.latest_at)) + '</td>' +
        '</tr>').join('');

    document.getElementById('bridgeLogStats').innerHTML =
      '<div class="stat"><div class="v">' + (logs.total || 0) + '</div><div class="l">Log rows</div></div>' +
      '<div class="stat"><div class="v">' + (logs.today || 0) + '</div><div class="l">Logs today</div></div>' +
      '<div class="stat" style="border-color:#ef4444"><div class="v" style="color:#f87171">' + (logs.errors_total || 0) + '</div><div class="l">Total errors</div></div>' +
      '<div class="stat"><div class="v" style="font-size:14px;color:#9ca3af">' + esc(fmtTime(logs.latest_at)) + '</div><div class="l">Latest bridge log</div></div>';

    const logRows = data.bridge_logs?.recent || [];
    document.getElementById('bridgeLogsBody').innerHTML = logRows.length === 0
      ? '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:24px">No bridge logs yet</td></tr>'
      : logRows.map((row) => {
          let result = row.error || row.dest_tx_or_asset || row.source_ref || '';
          try {
            const parsed = row.data ? JSON.parse(row.data) : {};
            result = row.error || parsed.error || parsed.note || parsed.destTxHash || parsed.txSig || parsed.assetAddress || result;
          } catch {}
          return '<tr class="' + (row.status === 'error' ? 'log-row-error' : 'log-row-info') + '">' +
            '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtTime(row.created_at)) + '</td>' +
            '<td>' + (row.status === 'error' ? '<span class="badge" style="background:#7f1d1d;color:#fecaca">error</span>' : '<span class="badge" style="background:#064e3b;color:#86efac">ok</span>') + '</td>' +
            '<td>' + esc(row.phase || '-') + '</td>' +
            '<td>' + esc(chainLabel(row.source_chain)) + ' -> ' + esc(chainLabel(row.dest_chain)) + '</td>' +
            '<td>' + (row.level || '-') + '</td>' +
            '<td class="log-msg">' + esc(result || '-') + '</td>' +
          '</tr>';
        }).join('');

    const ledgerRows = data.bridges?.recent || [];
    document.getElementById('bridgeLedgerBody').innerHTML = ledgerRows.length === 0
      ? '<tr><td colspan="6" style="color:#6b7280;text-align:center;padding:24px">No bridge ledger rows yet</td></tr>'
      : ledgerRows.map((row) => '<tr>' +
          '<td class="mono" style="font-size:11px;color:#9ca3af;white-space:nowrap">' + esc(fmtTime(row.created_at)) + '</td>' +
          '<td>' + esc(chainLabel(row.source_chain)) + ' -> ' + esc(chainLabel(row.dest_chain)) + '</td>' +
          '<td>' + (row.level || '-') + '</td>' +
          '<td><code class="mono">' + esc(short(row.source_ref, 10, 8)) + '</code></td>' +
          '<td>' + txLink(row.source_chain, row.burn_tx_hash) + '</td>' +
          '<td>' + destLink(row.dest_chain, row.dest_tx_or_asset) + '</td>' +
        '</tr>').join('');
  } catch (e) {
    console.error(e);
    document.getElementById('nftSummary').innerHTML = '<div style="color:#ef4444">Failed to load: ' + esc(e?.message || String(e)) + '</div>';
  }
}

// Load logs/stats when switching to those tabs
const origSwitch = switchTab;
switchTab = function(name) {
  origSwitch(name);
  if (name === 'logs') loadLogs();
  if (name === 'client') loadClientLogs();
  if (name === 'ai-reports') loadAiLogReports();
  if (name === 'feedback') loadFeedback();
  if (name === 'stats') loadStats();
  if (name === 'tasks') loadTasks();
  if (name === 'tournaments') { updateTournamentDexScopeUi(); updateTournamentTeamUi(); updateTournamentPointsUi(); updateTournamentDailyOverridesUi(); updateTournamentPrizeUi(); loadTournaments(); }
  if (name === 'elfa') loadElfa();
  if (name === 'earnings') loadEarnings();
  if (name === 'shop') loadShop();
  if (name === 'marketplace') loadMarketplace();
  if (name === 'nft') loadNftAnalytics();
};

// Auto-login if key saved
if (KEY) { doLogin(); }

// Auto-refresh every 15s
setInterval(() => { if (KEY) loadAll(); }, 15000);
</script>
</body></html>`);
});

// All game API routes
app.use('/api', router);

app.get('/r/:code', (req, res) => {
  const code = String(req.params.code || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48);
  if (!code) return res.redirect('/');
  if (fs.existsSync(path.join(WEB_DIST_DIR, 'index.html'))) {
    res.cookie?.('clash_ref', code, { sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    return res.redirect(`/?ref=${encodeURIComponent(code)}`);
  }
  return res.redirect(`/?ref=${encodeURIComponent(code)}`);
});
startDailyLogAiScheduler();

// Error handler
// In production, log the compact message + first stack frame — full stacks
// reveal file paths / line numbers, which is useful for an attacker probing
// the API but noisy in prod log aggregators. In dev (NODE_ENV !== 'production')
// keep the full stack for local debugging.
app.use((err, req, res, _next) => {
  if (process.env.NODE_ENV === 'production') {
    const firstFrame = String(err.stack || '').split('\n')[1] || '';
    console.error(`[err] ${req.method} ${req.url} → ${err.message} ${firstFrame.trim()}`);
  } else {
    console.error(err.stack);
  }
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);

// WebSocket on same server
setupWebSocket(server);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Clash server running on http://127.0.0.1:${PORT}`);
  console.log(`WebSocket available at ws://127.0.0.1:${PORT}/ws`);

  // Marketplace event indexer. Polls each chain for Listed/Cancelled/Sold
  // events and writes them into marketplace_listings.
  //
  //   CLASH_MARKETPLACE_INDEXER=0           → disable entirely (use this if
  //                                            running multiple replicas — only
  //                                            one should poll).
  //   CLASH_MARKETPLACE_CHAINS=base,arbitrum → explicit chain list.
  //   (no env)                              → auto-detect from
  //                                            nft/deployments/*-marketplace-mainnet.json
  if (process.env.CLASH_MARKETPLACE_INDEXER !== '0') {
    try {
      const { startMarketplaceIndexer } = require('./marketplace_indexer');
      const fs = require('node:fs');
      const path = require('node:path');
      const deployDir = path.resolve(__dirname, '..', 'nft', 'deployments');
      let chains;
      if (process.env.CLASH_MARKETPLACE_CHAINS) {
        chains = process.env.CLASH_MARKETPLACE_CHAINS.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        try {
          chains = fs.readdirSync(deployDir)
            .filter((f) => /-marketplace-mainnet\.json$/.test(f))
            .map((f) => f.replace(/-marketplace-mainnet\.json$/, ''));
        } catch { chains = ['base']; }
      }
      for (const c of chains) {
        startMarketplaceIndexer({ chain: c })
          .then((h) => h && console.log(`[marketplace-indexer] started for ${c} (${h.contract})`))
          .catch((err) => console.warn(`[marketplace-indexer] ${c} failed to start:`, err?.message || err));
      }
    } catch (err) {
      console.warn('[marketplace-indexer] init failed:', err?.message || err);
    }
  }

  if (process.env.CLASH_BRIDGE_RETRY_WORKER !== '0') {
    try {
      const { startBridgeRetryWorker } = require('./bridge_retry_worker');
      startBridgeRetryWorker({
        apiBase: process.env.BRIDGE_API_BASE || `http://127.0.0.1:${PORT}/api`,
      });
      console.log('[bridge-retry] worker scheduled');
    } catch (err) {
      console.warn('[bridge-retry] worker failed to start:', err?.message || err);
    }
  }
});

// Graceful shutdown of the indexer's poll loop. SIGTERM is the platform-
// agnostic signal; on Windows PM2/nodemon also issue SIGINT.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try {
      const { stopMarketplaceIndexer } = require('./marketplace_indexer');
      stopMarketplaceIndexer();
    } catch { /* ignore */ }
    try {
      const { stopBridgeRetryWorker } = require('./bridge_retry_worker');
      stopBridgeRetryWorker();
    } catch { /* ignore */ }
    process.exit(0);
  });
}
