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
      <td>${p.name}</td>
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
