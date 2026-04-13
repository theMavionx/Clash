// Task system — admin-configurable quests with server-side verification.
// Types: volume | positions | combo_volume_attack | daily_trade_gold

const db = require('./db');

// ---------- Schema ----------
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      params TEXT NOT NULL DEFAULT '{}',
      reward_gold INTEGER NOT NULL DEFAULT 0,
      reward_wood INTEGER NOT NULL DEFAULT 0,
      reward_ore  INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      repeatable INTEGER NOT NULL DEFAULT 0,
      cooldown_hours INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS player_tasks (
      player_id TEXT NOT NULL,
      task_id   INTEGER NOT NULL,
      snapshot  TEXT NOT NULL DEFAULT '{}',
      progress  REAL NOT NULL DEFAULT 0,
      progress_value REAL NOT NULL DEFAULT 0,
      target_value   REAL NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_at TEXT,
      PRIMARY KEY (player_id, task_id)
    );
  `);
} catch (e) { console.error('tasks schema error', e); }

const VALID_TYPES = ['volume', 'positions', 'combo_volume_attack', 'daily_trade_gold'];
const VALID_SIDES = ['any', 'long', 'short'];

function parseParams(p) {
  try { return typeof p === 'string' ? JSON.parse(p) : (p || {}); } catch { return {}; }
}

function matchesSymbol(tradeSymbol, wantSymbol) {
  if (!wantSymbol || wantSymbol === 'ANY' || wantSymbol === 'any' || wantSymbol === '*') return true;
  return (tradeSymbol || '').toUpperCase() === wantSymbol.toUpperCase();
}

// Pacifica trade side: "open_long"/"open_short"/"close_long"/"close_short" OR "buy"/"sell"/contains close.
function classifyTrade(tradeSide) {
  const s = (tradeSide || '').toLowerCase();
  const isClose = s.includes('close');
  const isLong = s.includes('long') || s === 'buy' || s.includes('buy');
  const isShort = s.includes('short') || s === 'sell' || s.includes('sell');
  return { isClose, isLong, isShort, isOpen: !isClose };
}

function matchesSide(tradeSide, wantSide) {
  if (!wantSide || wantSide === 'any') return true;
  const c = classifyTrade(tradeSide);
  if (wantSide === 'long') return c.isLong && !c.isShort;
  if (wantSide === 'short') return c.isShort && !c.isLong;
  return true;
}

// ---------- Snapshots ----------
// Captured when the player starts (or auto-starts) a task.
async function buildSnapshot(player, task) {
  const p = parseParams(task.params);
  const now = new Date().toISOString();
  const snap = { start_time: now, type: task.type };

  if (task.type === 'volume' || task.type === 'positions' || task.type === 'combo_volume_attack') {
    // Baseline = max history_id from Pacifica (source of truth). trading_rewards.last_trade_id
    // may be stale (if the player hasn't claimed gold yet), so we can't rely on it —
    // it would let pre-existing trades leak into the quest progress.
    const wallet = (player && player.wallet) || (() => {
      try {
        const row = db.db.prepare('SELECT wallet FROM trading_rewards WHERE player_id = ?').get(player.id);
        return row && row.wallet;
      } catch { return null; }
    })();
    let baseline = 0;
    if (wallet && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      try {
        const r = await fetch(`https://api.pacifica.fi/api/v1/trades/history?account=${wallet}&builder_code=clashofperps`);
        const j = await r.json();
        if (j && j.success && Array.isArray(j.data)) {
          for (const t of j.data) {
            const id = Number(t.history_id || 0);
            if (id > baseline) baseline = id;
          }
        }
      } catch {}
    }
    // Fallback to trading_rewards only if Pacifica fetch failed (avoids zero baseline)
    if (baseline === 0) {
      const reward = db.db.prepare('SELECT last_trade_id FROM trading_rewards WHERE player_id = ?').get(player.id);
      baseline = reward ? reward.last_trade_id : 0;
    }
    snap.trade_id_start = baseline;
  }
  if (task.type === 'combo_volume_attack') {
    const winsRow = db.db.prepare(
      `SELECT COUNT(*) AS c FROM battle_replays WHERE attacker_id = ? AND verified_result = 'accepted'`
    ).get(player.id);
    snap.wins_start = winsRow ? winsRow.c : 0;
  }
  if (task.type === 'daily_trade_gold') {
    const windowH = Number(p.window_hours) > 0 ? Number(p.window_hours) : 24;
    const cutoff = new Date(Date.now() - windowH * 3600 * 1000).toISOString().replace('T', ' ').split('.')[0];
    snap.window_hours = windowH;
    snap.window_from = cutoff;
  }
  return snap;
}

// ---------- Verifiers ----------
// Each returns { progress_value, target_value, completed }

// Solana base58 address: 32-44 chars, no '0OIl'
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function isSolanaWallet(w) { return typeof w === 'string' && SOLANA_RE.test(w); }

function resolveWallet(player) {
  if (player && isSolanaWallet(player.wallet)) return player.wallet;
  try {
    const row = db.db.prepare('SELECT wallet FROM trading_rewards WHERE player_id = ?').get(player.id);
    if (row && isSolanaWallet(row.wallet)) return row.wallet;
  } catch {}
  return null;
}

async function fetchWalletTrades(wallet) {
  if (!wallet) return [];
  try {
    const r = await fetch(
      `https://api.pacifica.fi/api/v1/trades/history?account=${wallet}&builder_code=clashofperps`
    );
    const j = await r.json();
    return (j && j.success && Array.isArray(j.data)) ? j.data : [];
  } catch { return []; }
}

async function verifyVolume(player, task, snap) {
  const p = parseParams(task.params);
  const target = Number(p.target_volume) || 0;
  const symbol = p.symbol || 'any';
  const side = p.side || 'any';
  const wallet = resolveWallet(player);
  const trades = await fetchWalletTrades(wallet);
  const startId = snap.trade_id_start || 0;
  let vol = 0;
  let matched = 0;
  for (const t of trades) {
    if ((t.history_id || 0) <= startId) continue;
    if (!matchesSymbol(t.symbol, symbol)) continue;
    if (!matchesSide(t.side, side)) continue;
    vol += (parseFloat(t.price) || 0) * (parseFloat(t.amount) || 0);
    matched += 1;
  }
  console.log(`[task ${task.id} volume] player=${player.name} wallet=${wallet || 'NONE'} trades_total=${trades.length} start_id=${startId} symbol=${symbol} side=${side} matched=${matched} vol=$${vol.toFixed(2)} target=$${target}`);
  return { progress_value: vol, target_value: target, completed: vol >= target };
}

async function verifyPositions(player, task, snap) {
  const p = parseParams(task.params);
  const target = Number(p.target_positions) || 0;
  const symbol = p.symbol || 'any';
  const side = p.side || 'any';
  const countClose = !!p.count_close; // default: count openings only
  const trades = await fetchWalletTrades(resolveWallet(player));
  const startId = snap.trade_id_start || 0;
  let n = 0;
  for (const t of trades) {
    if ((t.history_id || 0) <= startId) continue;
    if (!matchesSymbol(t.symbol, symbol)) continue;
    if (!matchesSide(t.side, side)) continue;
    const c = classifyTrade(t.side);
    if (!countClose && c.isClose) continue;
    n += 1;
  }
  return { progress_value: n, target_value: target, completed: n >= target };
}

async function verifyComboVolumeAttack(player, task, snap) {
  const p = parseParams(task.params);
  const targetVol = Number(p.target_volume) || 0;
  const targetWins = Number(p.target_wins) || 0;
  const symbol = p.symbol || 'any';
  const side = p.side || 'any';

  const trades = await fetchWalletTrades(resolveWallet(player));
  const startId = snap.trade_id_start || 0;
  let vol = 0;
  for (const t of trades) {
    if ((t.history_id || 0) <= startId) continue;
    if (!matchesSymbol(t.symbol, symbol)) continue;
    if (!matchesSide(t.side, side)) continue;
    vol += (parseFloat(t.price) || 0) * (parseFloat(t.amount) || 0);
  }

  const winsRow = db.db.prepare(
    `SELECT COUNT(*) AS c FROM battle_replays WHERE attacker_id = ? AND verified_result = 'accepted'`
  ).get(player.id);
  const winsNow = winsRow ? winsRow.c : 0;
  const winsDelta = Math.max(0, winsNow - (snap.wins_start || 0));

  const volPct = targetVol > 0 ? vol / targetVol : 1;
  const winsPct = targetWins > 0 ? winsDelta / targetWins : 1;
  const progress = Math.min(volPct, winsPct);
  return {
    progress_value: progress,
    target_value: 1,
    completed: vol >= targetVol && winsDelta >= targetWins,
    breakdown: { volume: vol, target_volume: targetVol, wins: winsDelta, target_wins: targetWins },
  };
}

async function verifyDailyTradeGold(player, task, snap) {
  const p = parseParams(task.params);
  const target = Number(p.target_gold) || 0;
  const from = snap.window_from;
  if (!from) return { progress_value: 0, target_value: target, completed: false };
  // Gold from trades is tracked in gold_history with reasons like "N trades", "Daily bonus", "+$X profit", "First deposit!", "First trade!"
  const rows = db.db.prepare(
    `SELECT amount, reason FROM gold_history WHERE player_id = ? AND created_at >= ?`
  ).all(player.id, from);
  let sum = 0;
  for (const r of rows) {
    const reason = (r.reason || '').toLowerCase();
    // Heuristic: any gold_history entry during the window that originated from the trading system
    if (
      reason.includes('trade') ||
      reason.includes('profit') ||
      reason.includes('daily') ||
      reason.includes('deposit') ||
      reason.includes('volume')
    ) {
      sum += r.amount || 0;
    }
  }
  return { progress_value: sum, target_value: target, completed: sum >= target };
}

async function verifyTask(player, task, snap) {
  switch (task.type) {
    case 'volume': return verifyVolume(player, task, snap);
    case 'positions': return verifyPositions(player, task, snap);
    case 'combo_volume_attack': return verifyComboVolumeAttack(player, task, snap);
    case 'daily_trade_gold': return verifyDailyTradeGold(player, task, snap);
    default: return { progress_value: 0, target_value: 0, completed: false };
  }
}

// ---------- Helpers ----------
function getActiveTasks() {
  return db.db.prepare('SELECT * FROM tasks WHERE active = 1 ORDER BY sort_order ASC, id ASC').all();
}

function getTaskById(id) {
  return db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function getAllTasks() {
  return db.db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC, id ASC').all();
}

function getPlayerTask(playerId, taskId) {
  return db.db.prepare('SELECT * FROM player_tasks WHERE player_id = ? AND task_id = ?').get(playerId, taskId);
}

function upsertPlayerTask(playerId, taskId, { snapshot, progress, progress_value, target_value }) {
  const existing = getPlayerTask(playerId, taskId);
  if (existing) {
    db.db.prepare(
      `UPDATE player_tasks SET progress = ?, progress_value = ?, target_value = ? WHERE player_id = ? AND task_id = ?`
    ).run(progress, progress_value, target_value, playerId, taskId);
  } else {
    db.db.prepare(
      `INSERT INTO player_tasks (player_id, task_id, snapshot, progress, progress_value, target_value) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(playerId, taskId, JSON.stringify(snapshot || {}), progress, progress_value, target_value);
  }
}

function canClaim(playerTask, task) {
  if (!playerTask) return { ok: false, reason: 'Not started' };
  if (playerTask.claimed_at && !task.repeatable) return { ok: false, reason: 'Already claimed' };
  if (playerTask.claimed_at && task.repeatable) {
    const hrs = Number(task.cooldown_hours) || 0;
    if (hrs > 0) {
      const last = new Date(playerTask.claimed_at + 'Z').getTime();
      const elapsedH = (Date.now() - last) / 3600000;
      if (elapsedH < hrs) return { ok: false, reason: `Cooldown: ${(hrs - elapsedH).toFixed(1)}h left` };
    }
  }
  return { ok: true };
}

module.exports = {
  VALID_TYPES,
  VALID_SIDES,
  parseParams,
  buildSnapshot,
  verifyTask,
  getActiveTasks,
  getAllTasks,
  getTaskById,
  getPlayerTask,
  upsertPlayerTask,
  canClaim,
};
