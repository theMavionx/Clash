const express = require('express');
const db = require('./db');

const router = express.Router();

// ---------- Auth Middleware ----------

function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Missing x-token header' });
  const player = db.authenticatePlayer(token);
  if (!player) return res.status(401).json({ error: 'Invalid token' });
  req.player = player;
  next();
}

// ==================== PLAYERS ====================

// Register a new player (or recover existing account by wallet)
router.post('/players/register', (req, res) => {
  const { name, wallet } = req.body;

  // If wallet provided, check if an account already exists for this wallet
  if (wallet) {
    const existing = db.db.prepare('SELECT * FROM players WHERE wallet = ?').get(wallet);
    if (existing) {
      const state = db.getFullPlayerState(existing.id);
      return res.json({ ...state, token: existing.token });
    }
  }

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  try {
    const result = db.registerPlayer(name.trim());
    // Save wallet address if provided
    if (wallet) {
      db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, result.id);
    }
    const state = db.getFullPlayerState(result.id);
    res.json({ ...state, token: result.token });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Name already taken' });
    }
    throw e;
  }
});

// Login (get state by token)
router.get('/players/me', auth, (req, res) => {
  const state = db.getFullPlayerState(req.player.id);
  res.json(state);
});

// Login by wallet address (recover account after cache clear)
router.post('/players/login-wallet', (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  const player = db.db.prepare('SELECT * FROM players WHERE wallet = ?').get(wallet);
  if (!player) return res.status(404).json({ error: 'No account found for this wallet' });
  const state = db.getFullPlayerState(player.id);
  res.json({ ...state, token: player.token });
});

// ==================== RESOURCES ====================

// Get current resources
router.get('/resources', auth, (req, res) => {
  res.json(db.getResources(req.player.id));
});

// Add resources
router.post('/resources/add', auth, (req, res) => {
  const { gold = 0, wood = 0, ore = 0 } = req.body;
  if (typeof gold !== 'number' || typeof wood !== 'number' || typeof ore !== 'number') {
    return res.status(400).json({ error: 'gold, wood, ore must be numbers' });
  }
  if (gold < 0 || wood < 0 || ore < 0) {
    return res.status(400).json({ error: 'Values must be non-negative. Use /resources/subtract instead' });
  }
  const result = db.addResources(req.player.id, gold, wood, ore);
  res.json(result);
});

// Subtract resources
router.post('/resources/subtract', auth, (req, res) => {
  const { gold = 0, wood = 0, ore = 0 } = req.body;
  if (typeof gold !== 'number' || typeof wood !== 'number' || typeof ore !== 'number') {
    return res.status(400).json({ error: 'gold, wood, ore must be numbers' });
  }
  if (gold < 0 || wood < 0 || ore < 0) {
    return res.status(400).json({ error: 'Values must be non-negative' });
  }
  const result = db.subtractResources(req.player.id, gold, wood, ore);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Set resources directly
router.post('/resources/set', auth, (req, res) => {
  const { gold, wood, ore } = req.body;
  const current = db.getResources(req.player.id);
  const newGold = typeof gold === 'number' ? Math.max(0, gold) : current.gold;
  const newWood = typeof wood === 'number' ? Math.max(0, wood) : current.wood;
  const newOre = typeof ore === 'number' ? Math.max(0, ore) : current.ore;
  const result = db.addResources(req.player.id,
    newGold - current.gold,
    newWood - current.wood,
    newOre - current.ore
  );
  res.json(result);
});

// ==================== BUILDINGS ====================

// List all player buildings
router.get('/buildings', auth, (req, res) => {
  res.json(db.getPlayerBuildings(req.player.id));
});

// Place a building
router.post('/buildings/place', auth, (req, res) => {
  const { type, grid_x, grid_z, grid_index = 0 } = req.body;
  if (!type || grid_x == null || grid_z == null) {
    return res.status(400).json({ error: 'type, grid_x, grid_z are required' });
  }
  if (!Number.isInteger(grid_x) || !Number.isInteger(grid_z)) {
    return res.status(400).json({ error: 'grid_x and grid_z must be integers' });
  }
  const result = db.placeBuilding(req.player.id, type, grid_x, grid_z, grid_index);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Collect resources from a production building
router.post('/buildings/:id/collect', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const result = db.collectResources(req.player.id, buildingId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Get production status for all resource buildings
router.get('/buildings/production', auth, (req, res) => {
  res.json(db.getProductionStatus(req.player.id));
});

// Upgrade a building
router.post('/buildings/:id/upgrade', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const result = db.upgradeBuilding(req.player.id, buildingId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Move a building to a new grid position
router.post('/buildings/:id/move', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const { grid_x, grid_z } = req.body;
  if (grid_x === undefined || grid_z === undefined) return res.status(400).json({ error: 'grid_x and grid_z required' });
  const building = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, req.player.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });
  db.db.prepare('UPDATE buildings SET grid_x = ?, grid_z = ? WHERE id = ?').run(grid_x, grid_z, buildingId);
  const resources = db.getResources(req.player.id);
  res.json({ success: true, resources });
});

// Buy a ship at a port
router.post('/buildings/:id/buy-ship', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const result = db.buyShip(req.player.id, buildingId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Remove a building
router.delete('/buildings/:id', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const result = db.removeBuilding(req.player.id, buildingId);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

// ==================== BATTLE ====================

// Submit battle replay for verification
router.post('/attack/result', auth, (req, res) => {
  const { defender_id, actions, result: claimedResult } = req.body;
  if (!defender_id) return res.status(400).json({ error: 'defender_id required' });
  if (!actions || !Array.isArray(actions)) return res.status(400).json({ error: 'actions replay required' });
  if (!claimedResult) return res.status(400).json({ error: 'result required (victory/defeat)' });

  const defenderBuildings = db.getPlayerBuildings(defender_id);
  if (!defenderBuildings || defenderBuildings.length === 0) {
    return res.status(400).json({ error: 'Defender has no buildings' });
  }

  // Extract grid_config from battle_start action
  const battleStartAction = actions.find(a => a.type === 'battle_start');
  const gridConfig = battleStartAction?.grid_config;
  const gameActions = actions.filter(a => a.type !== 'battle_start');

  // Basic validation
  const shipActions = gameActions.filter(a => a.type === 'place_ship');
  if (claimedResult === 'victory' && shipActions.length === 0) {
    db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'rejected', 'No ships', null, null);
    return res.status(403).json({ error: 'No ships deployed' });
  }
  if (shipActions.length > 5) {
    db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'rejected', 'Too many ships', null, null);
    return res.status(403).json({ error: 'Too many ships in replay' });
  }

  // Run server simulation verification
  const { verifyReplay } = require('./combat_session');
  const verification = verifyReplay({
    defenderBuildings,
    actions: gameActions,
    claimedResult,
    gridConfig,
  });

  console.log(`[BATTLE] ${claimedResult} by ${req.player.id} vs ${defender_id}: ${verification.reason} (TH ${Math.round((verification.townHallHpPct || 0) * 100)}%)`);

  if (!verification.valid) {
    db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'rejected', verification.reason, null, verification);
    return res.status(403).json({ error: 'Replay verification failed', reason: verification.reason });
  }

  // Victory verified — grant loot
  if (claimedResult === 'victory') {
    const battleResult = db.battleVictory(req.player.id, defender_id);
    if (battleResult.error) {
      db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'error', battleResult.error, null, verification);
      return res.status(400).json(battleResult);
    }
    db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'accepted', verification.reason, battleResult.loot, verification);
    return res.json(battleResult);
  }

  // Defeat — no loot, still store replay
  db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'accepted', 'Defeat', null, verification);
  res.json({ success: true, loot: { gold: 0, wood: 0, ore: 0 } });
});

// ==================== TROOPS ====================

// Get troop levels
router.get('/troops', auth, (req, res) => {
  res.json(db.getTroopLevels(req.player.id));
});

// Upgrade a troop
router.post('/troops/:type/upgrade', auth, (req, res) => {
  const { type } = req.params;
  const result = db.upgradeTroop(req.player.id, type);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// ==================== MATCHMAKING ====================

// Find enemy with closest trophies
router.get('/find-enemy', auth, (req, res) => {
  const result = db.findEnemy(req.player.id);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});


// ==================== BATTLE LOG ====================

// Get battle log — both attacks on player's base AND player's own attacks
router.get('/battle-log', auth, (req, res) => {
  const rows = db.db.prepare(`
    SELECT r.id, r.attacker_id, r.defender_id, r.claimed_result, r.verified_result,
           r.loot_gold, r.loot_wood, r.loot_ore,
           r.sim_th_hp_pct, r.sim_buildings_destroyed, r.duration_sec,
           r.created_at, r.replay_data, r.buildings_snapshot,
           pa.name AS attacker_name, pa.trophies AS attacker_trophies,
           pd.name AS defender_name, pd.trophies AS defender_trophies
    FROM battle_replays r
    LEFT JOIN players pa ON pa.id = r.attacker_id
    LEFT JOIN players pd ON pd.id = r.defender_id
    WHERE (r.defender_id = ? OR r.attacker_id = ?) AND r.verified_result = 'accepted'
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all(req.player.id, req.player.id);

  res.json(rows.map(r => {
    const isAttacker = r.attacker_id === req.player.id;
    return {
      id: r.id,
      side: isAttacker ? 'attack' : 'defense',
      opponent_name: isAttacker ? (r.defender_name || 'Unknown') : (r.attacker_name || 'Unknown'),
      opponent_trophies: isAttacker ? (r.defender_trophies || 0) : (r.attacker_trophies || 0),
      result: r.claimed_result,
      loot: { gold: r.loot_gold, wood: r.loot_wood, ore: r.loot_ore },
      th_hp_pct: r.sim_th_hp_pct,
      buildings_destroyed: r.sim_buildings_destroyed,
      duration: r.duration_sec,
      created_at: r.created_at,
      replay_data: r.replay_data ? JSON.parse(r.replay_data) : null,
      buildings_snapshot: r.buildings_snapshot ? JSON.parse(r.buildings_snapshot) : null,
    };
  }));
});

// ==================== TROPHIES ====================

// Get trophies
router.get('/trophies', auth, (req, res) => {
  res.json({ trophies: db.getTrophies(req.player.id) });
});

// Recalculate trophies from current buildings & troops
router.post('/trophies/recalculate', auth, (req, res) => {
  const result = db.recalculateTrophies(req.player.id);
  res.json(result);
});

// Get trophy table (what each building is worth)
router.get('/trophies/table', (req, res) => {
  res.json(db.TROPHY_TABLE);
});

// ==================== TRADING REWARDS ====================

const GOLD_PER_USD_VOLUME = 0.05;
const GOLD_FIRST_DEPOSIT = 500;
const GOLD_FIRST_TRADE = 300;
const GOLD_DAILY_TRADE = 200;
const GOLD_PER_10_USD_PROFIT = 100; // +100 gold per $10 positive PnL

// Trading rewards table
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS trading_rewards (
      player_id    TEXT PRIMARY KEY,
      wallet       TEXT NOT NULL,
      last_trade_id INTEGER NOT NULL DEFAULT 0,
      total_volume REAL NOT NULL DEFAULT 0,
      total_gold   INTEGER NOT NULL DEFAULT 0,
      first_deposit INTEGER NOT NULL DEFAULT 0,
      first_trade  INTEGER NOT NULL DEFAULT 0,
      last_daily   TEXT,
      pnl_gold_pool REAL NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
} catch {}
try { db.db.exec(`ALTER TABLE trading_rewards ADD COLUMN pnl_gold_pool REAL NOT NULL DEFAULT 0`); } catch {}

// Rate limiter for claim-gold (max 1 per 5 seconds per player)
// Rate limiter — auto-expires old entries every 10 minutes to prevent memory leak
const claimCooldowns = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [k, v] of claimCooldowns) { if (v < cutoff) claimCooldowns.delete(k); }
}, 600000);

// Claim gold — server verifies trades via Pacifica API
router.post('/trading/claim-gold', auth, async (req, res) => {
  // Rate limit
  const lastClaim = claimCooldowns.get(req.player.id);
  if (lastClaim && Date.now() - lastClaim < 5000) {
    return res.status(429).json({ gold: 0, reason: 'Please wait before claiming again' });
  }
  claimCooldowns.set(req.player.id, Date.now());
  const wallet = req.body.wallet || req.player.wallet;
  if (!wallet) return res.status(400).json({ error: 'wallet required — connect wallet in profile' });

  try {
    // Get or create reward record
    let reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ?').get(req.player.id);
    if (!reward) {
      db.db.prepare('INSERT INTO trading_rewards (player_id, wallet) VALUES (?, ?)').run(req.player.id, wallet);
      reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ?').get(req.player.id);
    }

    // Fetch trades from Pacifica (verified source of truth)
    const tradesRes = await fetch(
      `https://api.pacifica.fi/api/v1/trades/history?account=${wallet}&builder_code=clashofperps`
    );
    const tradesData = await tradesRes.json();
    if (!tradesData.success || !tradesData.data) {
      return res.json({ gold: 0, reason: 'No trades found' });
    }

    // Filter only new trades (after last_trade_id)
    const newTrades = tradesData.data.filter(t => t.history_id > reward.last_trade_id);
    if (newTrades.length === 0 && reward.first_deposit && reward.first_trade) {
      return res.json({ gold: 0, reason: 'No new trades' });
    }

    let totalGold = 0;
    const reasons = [];
    let maxTradeId = reward.last_trade_id;

    // Volume rewards
    for (const t of newTrades) {
      const volume = parseFloat(t.price || 0) * parseFloat(t.amount || 0);
      totalGold += Math.floor(volume * GOLD_PER_USD_VOLUME);
      if (t.history_id > maxTradeId) maxTradeId = t.history_id;
    }

    // PnL profit rewards — check realized PnL from close trades
    let closePnl = 0;
    for (const t of newTrades) {
      const side = (t.side || '').toLowerCase();
      if (side.includes('close')) {
        const pnl = parseFloat(t.realized_pnl || t.pnl || 0);
        if (pnl > 0) closePnl += pnl;
      }
    }
    // Accumulate fractional profit in pool, award 100 gold per $10 crossed
    let pnlPool = (reward.pnl_gold_pool || 0) + closePnl;
    if (pnlPool >= 10) {
      const chunks = Math.floor(pnlPool / 10);
      const pnlGold = chunks * GOLD_PER_10_USD_PROFIT;
      totalGold += pnlGold;
      pnlPool -= chunks * 10;
      reasons.push(`+$${(chunks * 10).toFixed(0)} profit`);
    }

    if (newTrades.length > 0) {
      reasons.push(`${newTrades.length} trades`);
    }

    // First deposit bonus
    if (!reward.first_deposit) {
      totalGold += GOLD_FIRST_DEPOSIT;
      reasons.push('First deposit!');
    }

    // First trade bonus
    if (!reward.first_trade && newTrades.length > 0) {
      totalGold += GOLD_FIRST_TRADE;
      reasons.push('First trade!');
    }

    // Daily bonus
    const today = new Date().toISOString().split('T')[0];
    if (reward.last_daily !== today && newTrades.length > 0) {
      totalGold += GOLD_DAILY_TRADE;
      reasons.push('Daily bonus');
    }

    // Save all new trades to DB
    const insertTrade = db.db.prepare('INSERT OR IGNORE INTO player_trades (player_id, history_id, symbol, price, amount, fee) VALUES (?, ?, ?, ?, ?, ?)');
    for (const t of newTrades) {
      insertTrade.run(req.player.id, t.history_id, t.symbol || '?', t.price || '0', t.amount || '0', t.builder_fee || '0');
    }

    // Always update reward tracking (pnl_gold_pool accumulates even without gold payout)
    const newVolume = newTrades.reduce((s, t) => s + parseFloat(t.price || 0) * parseFloat(t.amount || 0), 0);
    db.db.prepare(`
      UPDATE trading_rewards SET
        last_trade_id = ?, total_volume = total_volume + ?, total_gold = total_gold + ?,
        first_deposit = 1, first_trade = CASE WHEN ? > 0 THEN 1 ELSE first_trade END,
        last_daily = ?, pnl_gold_pool = ?, updated_at = datetime('now')
      WHERE player_id = ?
    `).run(maxTradeId, newVolume, totalGold, newTrades.length, today, pnlPool, req.player.id);

    if (totalGold > 0) {
      db.addResources(req.player.id, totalGold, 0, 0);
      const reason = reasons.join(' + ') || 'Trading reward';
      db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)').run(req.player.id, totalGold, reason);
    }

    res.json({
      gold: Math.floor(totalGold),
      reason: reasons.join(' + ') || 'No new rewards',
      total_gold_earned: (reward.total_gold || 0) + totalGold,
    });
  } catch (e) {
    console.error('Claim gold error:', e);
    res.status(500).json({ error: 'Failed to claim rewards' });
  }
});

// Gold & trade history tables
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS gold_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id  TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      reason     TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS player_trades (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id    TEXT NOT NULL,
      history_id   INTEGER UNIQUE,
      symbol       TEXT NOT NULL,
      price        TEXT NOT NULL,
      amount       TEXT NOT NULL,
      fee          TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch {}

// Get trading reward stats + gold history + trade history from Pacifica
router.get('/trading/stats', auth, async (req, res) => {
  const reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ?').get(req.player.id);
  const goldHistory = db.db.prepare('SELECT amount, reason, created_at FROM gold_history WHERE player_id = ? ORDER BY created_at DESC LIMIT 50').all(req.player.id);
  const trades = db.db.prepare('SELECT symbol, price, amount, fee, created_at FROM player_trades WHERE player_id = ? ORDER BY created_at DESC LIMIT 50').all(req.player.id);

  res.json({
    ...(reward || { total_volume: 0, total_gold: 0 }),
    gold_history: goldHistory,
    trades,
  });
});

// ==================== FULL STATE ====================

// Get full player state (resources + buildings + troops)
router.get('/state', auth, (req, res) => {
  const state = db.getFullPlayerState(req.player.id);
  if (!state) return res.status(404).json({ error: 'Player not found' });
  res.json(state);
});

// ==================== ADMIN ====================

const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me-in-production';
function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// List all players
router.get('/admin/players', adminAuth, (req, res) => {
  const players = db.db.prepare('SELECT id, name, trophies, level, gold, wood, ore, created_at FROM players ORDER BY trophies DESC').all();
  res.json(players);
});

// Delete a player by name
router.delete('/admin/players/:name', adminAuth, (req, res) => {
  try {
    const player = db.db.prepare('SELECT id FROM players WHERE name = ?').get(req.params.name);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    db.db.prepare('DELETE FROM buildings WHERE player_id = ?').run(player.id);
    db.db.prepare('DELETE FROM troop_levels WHERE player_id = ?').run(player.id);
    try { db.db.prepare('DELETE FROM trading_rewards WHERE player_id = ?').run(player.id); } catch {}
    try { db.db.prepare('DELETE FROM gold_history WHERE player_id = ?').run(player.id); } catch {}
    try { db.db.prepare('DELETE FROM player_trades WHERE player_id = ?').run(player.id); } catch {}
    try { db.db.prepare('DELETE FROM battle_replays WHERE attacker_id = ? OR defender_id = ?').run(player.id, player.id); } catch {}
    db.db.prepare('DELETE FROM players WHERE id = ?').run(player.id);
    res.json({ deleted: req.params.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reset a player (keep account, clear buildings & reset resources)
router.post('/admin/players/:name/reset', adminAuth, (req, res) => {
  const player = db.db.prepare('SELECT id FROM players WHERE name = ?').get(req.params.name);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  db.db.prepare('DELETE FROM buildings WHERE player_id = ?').run(player.id);
  db.db.prepare('UPDATE players SET gold = 10000, wood = 10000, ore = 10000, trophies = 0 WHERE id = ?').run(player.id);
  db.db.prepare('UPDATE troop_levels SET level = 1 WHERE player_id = ?').run(player.id);
  res.json({ reset: req.params.name });
});

// Wipe entire database
router.post('/admin/wipe', adminAuth, (req, res) => {
  db.db.prepare('DELETE FROM buildings').run();
  db.db.prepare('DELETE FROM troop_levels').run();
  db.db.prepare('DELETE FROM players').run();
  res.json({ wiped: true });
});

module.exports = { router, auth };
