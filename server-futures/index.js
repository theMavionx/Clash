const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const PORT = process.env.FUTURES_PORT || 4001;

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
