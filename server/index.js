const express = require('express');
const cors = require('cors');
const http = require('http');
const { router } = require('./routes');
const { setupWebSocket, getOnlinePlayers } = require('./websocket');

const PORT = process.env.PORT || 4000;

const app = express();
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
app.use(express.json({ limit: '64kb' }));

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
      SELECT r.*, p.name, p.dex
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
      fdb.pragma('journal_mode = WAL');
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
    Total gold distributed across both DEXs: <strong style="color:#FFD700">${totalGold}</strong>
  </div>
</body></html>`);
});

// Admin panel — served under /api so it goes through the proxy
app.get('/api/admin/panel', (req, res) => {
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
  .tabs { display: flex; gap: 0; margin-bottom: 24px; border-bottom: 2px solid #374151; }
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
    <div class="tab" onclick="switchTab('elfa')">Elfa</div>
    <div class="tab" onclick="switchTab('logs')">Logs</div>
    <div class="tab" onclick="switchTab('stats')">Stats</div>
  </div>

  <div class="panel active" id="tab-players">
    <div class="stats" id="playerStats"></div>
    <table><thead><tr>
      <th>Name</th><th>DEX</th><th>UI</th><th>Wallet</th><th>Trophies</th><th>Level</th><th>Gold</th><th>Wood</th><th>Ore</th><th>Trade Gold</th><th>Trade Vol</th><th>Buildings</th><th>Shield</th><th>Joined</th><th>Actions</th>
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
        <option value="error">Error</option>
      </select>
      <button class="btn" onclick="loadLogs()">Refresh</button>
      <span id="logCount" style="color:#6b7280;font-size:12px;margin-left:8px"></span>
    </div>
    <table><thead><tr>
      <th>Time</th><th>Type</th><th>Message</th><th>Data</th>
    </tr></thead><tbody id="logsBody"></tbody></table>
  </div>

  <div class="panel" id="tab-stats">
    <div class="stats" id="serverStats"></div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">DEX Breakdown</h2>
    <div id="dexStats" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px"></div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Futures UI Mode</h2>
    <div id="uiModeStats" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px"></div>

    <h2 style="color:#f59e0b;font-size:18px;margin:24px 0 12px">Top Avantis Traders</h2>
    <table><thead><tr>
      <th>Name</th><th>Wallet</th><th>Volume</th><th>Trades</th>
    </tr></thead><tbody id="avantisTopBody"></tbody></table>

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

<script>
let KEY = localStorage.getItem('admin_key') || '';
let players = [], replays = [];

async function api(path) {
  const r = await fetch('/api' + path, { headers: { 'x-admin-key': KEY } });
  if (r.status === 403) { logout(); throw new Error('Forbidden'); }
  return r.json();
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
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', t.textContent.toLowerCase().includes(name)));
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

function renderPlayers() {
  const shielded = players.filter(p => p.shield_active).length;
  const pacCount = players.filter(p => p.dex === 'pacifica').length;
  const avtCount = players.filter(p => p.dex === 'avantis').length;
  const noDex = players.filter(p => !p.dex).length;
  document.getElementById('playerStats').innerHTML =
    '<div class="stat"><div class="v">' + players.length + '</div><div class="l">Players</div></div>' +
    '<div class="stat" style="border-color:#7C3AED"><div class="v" style="color:#a78bfa;font-size:22px">' + pacCount + '</div><div class="l">Pacifica</div></div>' +
    '<div class="stat" style="border-color:#0EA5E9"><div class="v" style="color:#38bdf8;font-size:22px">' + avtCount + '</div><div class="l">Avantis</div></div>' +
    (noDex > 0 ? '<div class="stat"><div class="v" style="font-size:18px;color:#9ca3af">' + noDex + '</div><div class="l">No DEX set</div></div>' : '') +
    '<div class="stat"><div class="v">' + shielded + '</div><div class="l">Shielded</div></div>' +
    '<div class="stat"><div class="v">' + players.reduce((s,p) => s + p.buildings_count, 0) + '</div><div class="l">Buildings</div></div>' +
    '<div class="stat" style="cursor:pointer;border-color:#f59e0b" onclick="resetAllTrophies()"><div class="v" style="font-size:14px">RESET ALL</div><div class="l">Trophies</div></div>' +
    '<div class="stat" style="cursor:pointer;border-color:#34d399" onclick="addResAll()"><div class="v" style="font-size:14px;color:#34d399">+ RES ALL</div><div class="l">Add Resources</div></div>';

  function dexBadge(d) {
    if (d === 'pacifica') return '<span class="badge" style="background:#4c1d95;color:#ddd6fe">PAC</span>';
    if (d === 'avantis')  return '<span class="badge" style="background:#0c4a6e;color:#bae6fd">AVT</span>';
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
    // Click-to-copy: cheap UX win, no extra deps.
    return '<span class="mono" style="cursor:pointer;color:#bae6fd" title="' + esc(s) + '" onclick="navigator.clipboard.writeText(\\'' + esc(s) + '\\')">' + esc(slice) + '</span>';
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
    '<td class="mono">' + (p.created_at||'').split(' ')[0] + '</td>' +
    '<td><button class="btn" onclick="addResPlayer(\\'' + esc(p.name) + '\\')">+Res</button> <button class="btn" onclick="resetTrophies(\\'' + esc(p.name) + '\\')">0 Troph</button> <button class="btn" onclick="resetPlayer(\\'' + esc(p.name) + '\\')">Reset</button> <button class="btn btn-danger" onclick="deletePlayer(\\'' + esc(p.name) + '\\')">Delete</button></td>' +
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

async function loadStats() {
  try {
    const s = await api('/admin/stats');
    document.getElementById('serverStats').innerHTML =
      '<div class="stat"><div class="v">' + s.players + '</div><div class="l">Players</div></div>' +
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
    const avt = dex.avantis_activity;
    function dexCard(name, color, playerCount, tradingGold, volume, extraLines) {
      return (
        '<div style="flex:1;min-width:240px;background:#1f2937;border:2px solid ' + color + ';border-radius:12px;padding:16px">' +
        '<div style="color:' + color + ';font-size:14px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px">' + name + '</div>' +
        '<div style="display:flex;gap:16px;margin-bottom:8px">' +
          '<div><div style="font-size:20px;font-weight:800">' + playerCount + '</div><div style="font-size:11px;color:#6b7280">players</div></div>' +
          '<div><div style="font-size:20px;font-weight:800;color:#fbbf24">' + tradingGold + '</div><div style="font-size:11px;color:#6b7280">trade gold</div></div>' +
          '<div><div style="font-size:20px;font-weight:800">' + fmtUSD(volume) + '</div><div style="font-size:11px;color:#6b7280">volume</div></div>' +
        '</div>' +
        (extraLines || '') +
        '</div>'
      );
    }
    const pacCount = (byDex.find(x => x.dex === 'pacifica') || {}).n || 0;
    const avtCount = (byDex.find(x => x.dex === 'avantis') || {}).n || 0;
    const noneCount = (byDex.find(x => x.dex === 'unknown') || {}).n || 0;
    const pacRew = rewardsMap.pacifica || {};
    const avtRew = rewardsMap.avantis || {};
    const avtExtra = avt
      ? '<div style="font-size:12px;color:#9ca3af;line-height:1.6">' +
          'Trades all-time: <strong style="color:#e5e7eb">' + avt.total_trades + '</strong><br>' +
          'Trades 24h: <strong style="color:#e5e7eb">' + avt.trades_24h + '</strong><br>' +
          'Active traders: <strong style="color:#e5e7eb">' + avt.active_traders + '</strong>' +
        '</div>'
      : '<div style="font-size:12px;color:#6b7280">Futures service offline — no live Avantis data</div>';
    document.getElementById('dexStats').innerHTML =
      dexCard('Pacifica · Solana', '#7C3AED', pacCount, pacRew.total_gold || 0, pacRew.total_volume || 0, '') +
      dexCard('Avantis · Base', '#0EA5E9', avtCount, avtRew.total_gold || 0, avtRew.total_volume || 0, avtExtra) +
      (noneCount > 0 ? '<div style="flex:1;min-width:180px;background:#1f2937;border:1px dashed #6b7280;border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:center"><div style="text-align:center"><div style="font-size:28px;font-weight:800;color:#9ca3af">' + noneCount + '</div><div style="font-size:11px;color:#6b7280;margin-top:4px">No DEX set<br/>(legacy accounts)</div></div></div>' : '');

    // Futures UI mode breakdown — comes from /admin/stats (s.ui_modes).
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

    document.getElementById('avantisTopBody').innerHTML = (dex.avantis_top || []).map(p =>
      '<tr>' +
      '<td><strong>' + esc(p.name) + '</strong></td>' +
      '<td class="mono" style="font-size:11px">' + esc(p.wallet ? p.wallet.slice(0,6) + '...' + p.wallet.slice(-4) : '—') + '</td>' +
      '<td>' + fmtUSD(p.volume) + '</td>' +
      '<td>' + p.trades + '</td>' +
      '</tr>'
    ).join('') || '<tr><td colspan="4" style="text-align:center;color:#6b7280">No Avantis trades yet</td></tr>';

    function dexBadge(d) {
      if (d === 'pacifica') return '<span class="badge" style="background:#4c1d95;color:#ddd6fe">PAC</span>';
      if (d === 'avantis')  return '<span class="badge" style="background:#0c4a6e;color:#bae6fd">AVT</span>';
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
      '<div class="stat"><div class="v" style="color:#fca5a5">' + (s.started - s.claimed) + '</div><div class="l">In progress</div></div>';
    document.getElementById('taskStatsBody').innerHTML = (s.players || []).map(p => {
      const pct = p.target_value > 0 ? Math.min(100, Math.round((p.progress_value / p.target_value) * 100)) : 0;
      const progBar = '<div style="width:120px;height:8px;background:#111827;border-radius:4px;overflow:hidden;border:1px solid #374151"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#f59e0b,#d97706)"></div></div>' +
        '<div style="font-size:10px;color:#9ca3af;margin-top:2px">' + Math.floor(p.progress_value||0) + ' / ' + Math.floor(p.target_value||0) + ' (' + pct + '%)</div>';
      const walletShort = p.wallet ? (p.wallet.slice(0,4) + '…' + p.wallet.slice(-4)) : '—';
      return '<tr>' +
        '<td><strong>' + esc(p.player_name || p.player_id) + '</strong></td>' +
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

// Load logs/stats when switching to those tabs
const origSwitch = switchTab;
switchTab = function(name) {
  origSwitch(name);
  if (name === 'logs') loadLogs();
  if (name === 'stats') loadStats();
  if (name === 'tasks') loadTasks();
  if (name === 'elfa') loadElfa();
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Clash server running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket available at ws://0.0.0.0:${PORT}/ws`);
});
