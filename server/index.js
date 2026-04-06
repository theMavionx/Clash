const express = require('express');
const cors = require('cors');
const http = require('http');
const { router } = require('./routes');
const { setupWebSocket, getOnlinePlayers } = require('./websocket');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

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

app.get('/', (req, res) => {
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

// Trading stats dashboard
app.get('/trading-stats', async (req, res) => {
  const db = require('./db');

  // Local stats
  let rewards = [];
  try { rewards = db.db.prepare('SELECT r.*, p.name FROM trading_rewards r JOIN players p ON r.player_id = p.id ORDER BY r.total_gold DESC').all(); } catch {}
  const players = db.db.prepare('SELECT name, wallet, gold FROM players WHERE wallet IS NOT NULL ORDER BY gold DESC').all();

  // Pacifica stats
  let builderTrades = [], leaderboard = [];
  try {
    const [tRes, lRes] = await Promise.all([
      fetch('https://api.pacifica.fi/api/v1/builder/trades?builder_code=clashofperps').then(r=>r.json()),
      fetch('https://api.pacifica.fi/api/v1/leaderboard/builder_code?builder_code=clashofperps').then(r=>r.json()),
    ]);
    builderTrades = tRes.data || [];
    leaderboard = lRes.data || [];
  } catch {}

  const totalVol = leaderboard.reduce((s,u) => s + parseFloat(u.volume_all_time||0), 0);
  const totalFees = leaderboard.reduce((s,u) => s + parseFloat(u.fees_all_time||0), 0);
  const totalGold = rewards.reduce((s,r) => s + (r.total_gold||0), 0);

  const leaderRows = leaderboard.map(u => `
    <tr>
      <td style="font-family:monospace">${esc(u.address?.substring(0,8)+'...')}</td>
      <td>$${parseFloat(u.volume_all_time||0).toFixed(2)}</td>
      <td>$${parseFloat(u.fees_all_time||0).toFixed(4)}</td>
    </tr>
  `).join('');

  const rewardRows = rewards.map(r => `
    <tr>
      <td>${esc(r.name||'?')}</td>
      <td style="font-family:monospace">${esc(r.wallet?.substring(0,8)+'...')}</td>
      <td>${r.total_gold||0}</td>
      <td>$${parseFloat(r.total_volume||0).toFixed(2)}</td>
      <td>${r.last_daily||'—'}</td>
    </tr>
  `).join('');

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
  <div class="stats">
    <div class="stat"><div class="value">${leaderboard.length}</div><div class="label">Traders</div></div>
    <div class="stat"><div class="value">$${totalVol.toFixed(0)}</div><div class="label">Total Volume</div></div>
    <div class="stat"><div class="value">$${totalFees.toFixed(4)}</div><div class="label">Builder Fees</div></div>
    <div class="stat"><div class="value" style="color:#FFD700">${totalGold}</div><div class="label">Gold Distributed</div></div>
    <div class="stat"><div class="value">${builderTrades.length}</div><div class="label">Total Trades</div></div>
  </div>

  <h2>Pacifica Leaderboard</h2>
  <table>
    <tr><th>Wallet</th><th>Volume</th><th>Fees</th></tr>
    ${leaderRows || '<tr><td colspan="3" style="text-align:center;color:#888">No traders yet</td></tr>'}
  </table>

  <h2>Gold Rewards</h2>
  <table>
    <tr><th>Player</th><th>Wallet</th><th>Gold Earned</th><th>Volume</th><th>Last Active</th></tr>
    ${rewardRows || '<tr><td colspan="5" style="text-align:center;color:#888">No rewards claimed yet</td></tr>'}
  </table>
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
  </div>

  <div class="panel active" id="tab-players">
    <div class="stats" id="playerStats"></div>
    <table><thead><tr>
      <th>Name</th><th>Trophies</th><th>Level</th><th>Gold</th><th>Wood</th><th>Ore</th><th>Buildings</th><th>Shield</th><th>Joined</th><th>Actions</th>
    </tr></thead><tbody id="playersBody"></tbody></table>
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
  document.getElementById('playerStats').innerHTML =
    '<div class="stat"><div class="v">' + players.length + '</div><div class="l">Players</div></div>' +
    '<div class="stat"><div class="v">' + shielded + '</div><div class="l">Shielded</div></div>' +
    '<div class="stat"><div class="v">' + players.reduce((s,p) => s + p.buildings_count, 0) + '</div><div class="l">Buildings</div></div>' +
    '<div class="stat" style="cursor:pointer;border-color:#f59e0b" onclick="resetAllTrophies()"><div class="v" style="font-size:14px">RESET ALL</div><div class="l">Trophies</div></div>';

  document.getElementById('playersBody').innerHTML = players.map(p =>
    '<tr>' +
    '<td><strong>' + esc(p.name) + '</strong></td>' +
    '<td>' + p.trophies + '</td>' +
    '<td>' + p.level + '</td>' +
    '<td style="color:#e8b830">' + p.gold + '</td>' +
    '<td style="color:#6ab344">' + p.wood + '</td>' +
    '<td style="color:#8a9aaa">' + p.ore + '</td>' +
    '<td>' + p.buildings_count + '</td>' +
    '<td>' + (p.shield_active ? '<span class="badge badge-shield">' + p.shield_remaining + 'm left</span>' : '<span class="badge badge-off">none</span>') + '</td>' +
    '<td class="mono">' + (p.created_at||'').split(' ')[0] + '</td>' +
    '<td><button class="btn" onclick="resetTrophies(\\'' + esc(p.name) + '\\')">0 Troph</button> <button class="btn" onclick="resetPlayer(\\'' + esc(p.name) + '\\')">Reset</button> <button class="btn btn-danger" onclick="deletePlayer(\\'' + esc(p.name) + '\\')">Delete</button></td>' +
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
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);

// WebSocket on same server
setupWebSocket(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Clash server running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket available at ws://0.0.0.0:${PORT}/ws`);
});
