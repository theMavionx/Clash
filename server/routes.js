const express = require('express');
const db = require('./db');
const tasks = require('./tasks');
const elfa = require('./elfa');

const router = express.Router();

// ---------- Validation Helpers ----------
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // Solana base58
const EVM_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;              // Base/Ethereum 20-byte hex
function isValidWallet(w) {
  return typeof w === 'string' && (SOLANA_WALLET_RE.test(w) || EVM_WALLET_RE.test(w));
}
// Kept as alias so older references keep working.
const WALLET_RE = SOLANA_WALLET_RE;
void WALLET_RE;

// ---------- Auth Middleware ----------

function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Missing x-token header' });
  const player = db.authenticatePlayer(token);
  if (!player) return res.status(401).json({ error: 'Invalid token' });
  req.player = player;
  next();
}

// ==================== CLIENT LOGS (no auth) ====================

router.post('/client-log', (req, res) => {
  const { level, message, ua, url } = req.body || {};
  const ts = new Date().toISOString();
  const ip = req.headers['x-real-ip'] || req.ip;
  console.log(`[CLIENT ${(level || 'info').toUpperCase()}] ${ts} | ${ip} | ${(ua || '').slice(0, 80)} | ${url || ''} | ${message || ''}`);
  res.json({ ok: true });
});

// ==================== PLAYERS ====================

// Register a new player (or recover existing account by wallet)
// Set DEX preference (pacifica | avantis). Called after register or from
// RegisterPanel when the user switches DEX pre-connect. The value is used
// by leaderboard badges and by /api/futures/* routing.
router.post('/players/set-dex', auth, (req, res) => {
  const { dex } = req.body;
  if (dex !== 'pacifica' && dex !== 'avantis') {
    return res.status(400).json({ error: 'dex must be "pacifica" or "avantis"' });
  }
  db.db.prepare('UPDATE players SET dex = ? WHERE id = ?').run(dex, req.player.id);
  res.json({ success: true, dex });
});

router.post('/players/register', (req, res) => {
  const { name, wallet, dex } = req.body;

  // If wallet provided, check if an account already exists for this wallet.
  // Multiple rows may share a wallet (legacy bug — no UNIQUE constraint). Prefer
  // the account with the most progress (highest trophies, then highest id/newest).
  if (wallet) {
    const existing = db.db.prepare(
      'SELECT * FROM players WHERE wallet = ? ORDER BY COALESCE(trophies, 0) DESC, id DESC LIMIT 1'
    ).get(wallet);
    if (existing) {
      const state = db.getFullPlayerState(existing.id);
      return res.json({ ...state, token: existing.token });
    }
  }

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  // Try the requested name; if taken, append 1, 2, 3… until unique
  let finalName = name.trim();
  let result;
  for (let suffix = 0; suffix <= 99; suffix++) {
    const tryName = suffix === 0 ? finalName : finalName + suffix;
    try {
      result = db.registerPlayer(tryName);
      finalName = tryName;
      break;
    } catch (e) {
      if (e.message.includes('UNIQUE') && suffix < 99) continue;
      throw e;
    }
  }
  // Save wallet address if provided
  if (wallet) {
    db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, result.id);
  }
  // Save DEX preference if provided (pacifica | avantis)
  if (dex === 'pacifica' || dex === 'avantis') {
    db.db.prepare('UPDATE players SET dex = ? WHERE id = ?').run(dex, result.id);
  }
  const state = db.getFullPlayerState(result.id);
  logAuth('Player registered', { name: finalName, wallet: wallet || null, dex: dex || null });
  res.json({ ...state, token: result.token });
});

// Login (get state by token)
router.get('/players/me', auth, (req, res) => {
  const state = db.getFullPlayerState(req.player.id);
  res.json(state);
});

// Link a wallet to current account. Wallet is the canonical identity — if it
// already belongs to a different account (e.g. user plays on desktop with
// wallet, then opens in Farcaster which auto-created a stub account), we do NOT
// create a duplicate. Instead return the canonical account's token so the
// client can switch sessions into it. The stub account is left intact for now
// (admin can clean it up later) to avoid destroying data on race conditions.
router.post('/players/link-wallet', auth, (req, res) => {
  const { wallet } = req.body;
  if (!wallet || !isValidWallet(wallet)) return res.status(400).json({ error: 'Valid Solana wallet required' });

  const current = req.player;
  const existing = db.db.prepare('SELECT * FROM players WHERE wallet = ? AND id != ?').get(wallet, current.id);

  if (existing) {
    // Wallet is already bound to another account — that one wins.
    // Tell the client to switch its session token.
    const state = db.getFullPlayerState(existing.id);
    logAuth('Wallet already linked to another account; returning canonical token', {
      from_account: current.name, to_account: existing.name, wallet,
    });
    return res.json({
      success: true,
      switched_account: true,
      token: existing.token,
      ...state,
    });
  }

  // No conflict — bind wallet to current account
  db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, current.id);
  res.json({ success: true, switched_account: false });
});

// Login by wallet address (recover account after cache clear).
// Same canonical-row rule as /register: prefer highest trophies, newest id.
router.post('/players/login-wallet', (req, res) => {
  const { wallet } = req.body;
  if (!wallet || !isValidWallet(wallet)) return res.status(400).json({ error: 'Valid Solana wallet required' });
  const player = db.db.prepare(
    'SELECT * FROM players WHERE wallet = ? ORDER BY COALESCE(trophies, 0) DESC, id DESC LIMIT 1'
  ).get(wallet);
  if (!player) return res.status(404).json({ error: 'No account found for this wallet' });
  const state = db.getFullPlayerState(player.id);
  res.json({ ...state, token: player.token });
});

// ==================== RESOURCES ====================

// Get current resources
router.get('/resources', auth, (req, res) => {
  res.json(db.getResources(req.player.id));
});

// Add resources (admin only — players earn resources through gameplay)
router.post('/resources/add', adminAuth, (req, res) => {
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

// Subtract resources (admin only)
router.post('/resources/subtract', adminAuth, (req, res) => {
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

// Set resources directly (admin only)
router.post('/resources/set', adminAuth, (req, res) => {
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
  if (result.collected > 0) logEconomy('collect', { player: req.player.id, resource: result.resource, amount: result.collected });
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
  const grid_x = parseInt(req.body.grid_x, 10);
  const grid_z = parseInt(req.body.grid_z, 10);
  if (!Number.isInteger(grid_x) || !Number.isInteger(grid_z)) return res.status(400).json({ error: 'Valid integer grid_x and grid_z required' });
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
// Remove casualties from player's ship_troops after battle.
// casualties = {Knight: 1, Mage: 2} — removes that many of each type across all ships.
// Validates: casualty counts can't exceed what was actually deployed.
function _applyCasualties(playerId, casualties) {
  if (!casualties || typeof casualties !== 'object') return;

  // Count total deployed troops across all ships
  const ports = db.db.prepare('SELECT id, ship_troops, ship_troops_template FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(playerId, 'port');
  // Count from actual ship_troops (not template) — template may differ after swaps
  const deployed = {};
  for (const port of ports) {
    const troops = JSON.parse(port.ship_troops || '[]');
    for (const t of troops) deployed[t] = (deployed[t] || 0) + 1;
  }

  // Cap casualties to deployed counts (prevent client from claiming more losses than deployed)
  const validCasualties = {};
  for (const [name, count] of Object.entries(casualties)) {
    if (typeof count !== 'number' || count <= 0) continue;
    validCasualties[name] = Math.min(count, deployed[name] || 0);
  }

  const remaining = { ...validCasualties };
  for (const port of ports) {
    const troops = JSON.parse(port.ship_troops || '[]');
    const filtered = [];
    for (const t of troops) {
      if (remaining[t] && remaining[t] > 0) {
        remaining[t]--;
      } else {
        filtered.push(t);
      }
    }
    if (filtered.length !== troops.length) {
      db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(JSON.stringify(filtered), port.id);
    }
  }

  // Defensive log: if any casualties weren't applied, /troop-died removed them first,
  // or client's dict diverged from server state — worth noticing.
  const leftover = Object.entries(remaining).filter(([, c]) => c > 0);
  if (leftover.length > 0) {
    console.log(`[CASUALTIES] Player ${playerId} had ${leftover.length} casualty types not applied (already removed or desync):`, leftover);
  }
}

// Returns current ship_troops for all ports as [{id, level, ship_troops, ship_troops_template}].
// Used to push the authoritative post-battle state back to the client in /attack/result response.
function _getShipsPayload(playerId) {
  const ports = db.db.prepare('SELECT id, level, ship_troops, ship_troops_template, has_ship FROM buildings WHERE player_id = ? AND type = ?').all(playerId, 'port');
  return ports.filter(p => p.has_ship).map(p => ({
    id: p.id,
    level: p.level,
    ship_troops: JSON.parse(p.ship_troops || '[]'),
    ship_troops_template: JSON.parse(p.ship_troops_template || '[]'),
  }));
}

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

  // Cap troop levels to server-verified values (prevent level spoofing)
  const troopLevelRows = db.getTroopLevels(req.player.id);
  const serverTroopLevels = {};
  for (const row of troopLevelRows) serverTroopLevels[row.troop_type] = row.level;
  for (const act of gameActions) {
    if (act.type === 'place_ship' && act.troopType && act.troopLevel) {
      const serverLvl = serverTroopLevels[act.troopType] || 1;
      act.troopLevel = Math.min(act.troopLevel, serverLvl);
    }
  }

  // Run server simulation verification
  const { verifyReplay } = require('./combat_session');
  const verification = verifyReplay({
    defenderBuildings,
    actions: gameActions,
    claimedResult,
    gridConfig,
    serverTroopLevels,
  });

  logBattle(`${claimedResult} ${verification.valid ? 'ACCEPTED' : 'REJECTED'}`, {
    attacker: req.player.id, defender: defender_id,
    reason: verification.reason,
    thHp: Math.round((verification.townHallHpPct || 0) * 100) + '%',
    ships: gameActions.filter(a => a.type === 'place_ship').length,
    destroyed: verification.buildingsDestroyed,
  });
  console.log(`[BATTLE] ${claimedResult} by ${req.player.id} vs ${defender_id}: ${verification.reason} (TH ${Math.round((verification.townHallHpPct || 0) * 100)}%)`);
  console.log(`[BATTLE] Ships: ${gameActions.filter(a => a.type === 'place_ship').length}, Troops spawned: ${verification._troopsSpawned || '?'}, Buildings destroyed: ${verification.buildingsDestroyed}`);
  console.log(`[BATTLE] Actions:`, JSON.stringify(gameActions.filter(a => a.type === 'place_ship').map(a => ({t: a.t, troops: a.troops, troopType: a.troopType, x: a.x?.toFixed(2), z: a.z?.toFixed(2)}))));
  console.log(`[BATTLE] Grid:`, JSON.stringify(gridConfig));
  console.log(`[BATTLE] TroopLevels:`, JSON.stringify(serverTroopLevels));
  console.log(`[BATTLE] Defender buildings:`, defenderBuildings.length, defenderBuildings.map(b => `${b.type}:lv${b.level}:hp${b.hp}`).join(', '));

  if (!verification.valid) {
    db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'rejected', verification.reason, null, verification);
    // Debug info logged server-side only — never expose sim internals to client
    console.log('[SIM REJECT]', JSON.stringify({
      troopsSpawned: verification._troopsSpawned,
      troopsAlive: verification._troopsAlive,
      guardsAlive: verification._guardsAlive,
      simTimeSec: verification._simTimeSec,
      buildingsDestroyed: verification.buildingsDestroyed,
    }));
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
    // Remove casualties from attacker's ships
    _applyCasualties(req.player.id, req.body.casualties);
    // Return authoritative post-casualty ship state so client can sync immediately
    return res.json({ ...battleResult, ships: _getShipsPayload(req.player.id) });
  }

  // Defeat — attacker loses trophies, defender gains
  const defeatResult = db.battleDefeat(req.player.id, defender_id);
  db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'accepted', 'Defeat', null, verification);

  // Remove casualties from attacker's ships
  _applyCasualties(req.player.id, req.body.casualties);

  res.json({
    success: true,
    loot: { gold: 0, wood: 0, ore: 0 },
    trophies: defeatResult.attackerTrophies,
    ships: _getShipsPayload(req.player.id),
  });
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
  logEconomy('troop_upgrade', { player: req.player.id, troop: type, level: result.level });
  res.json(result);
});

// ==================== MATCHMAKING ====================

// Find enemy with closest trophies
router.get('/find-enemy', auth, (req, res) => {
  // Pre-flight: player must have a port with a ship loaded with troops
  const buildings = db.getPlayerBuildings(req.player.id);
  const ports = buildings.filter(b => b.type === 'port');
  if (ports.length === 0) {
    return res.status(400).json({ error: 'You need a Port to attack. Build one first.' });
  }
  const portsWithShips = ports.filter(p => p.has_ship === 1);
  if (portsWithShips.length === 0) {
    return res.status(400).json({ error: 'You need a Ship to attack. Buy one at your Port.' });
  }
  let totalTroopsLoaded = 0;
  for (const p of portsWithShips) {
    try {
      const troops = JSON.parse(p.ship_troops || '[]');
      totalTroopsLoaded += troops.length;
    } catch {}
  }
  if (totalTroopsLoaded === 0) {
    return res.status(400).json({ error: 'No troops loaded on your ships. Train troops at the Barracks first.' });
  }

  const result = db.findEnemy(req.player.id);
  if (result.error) { logBattle('find_enemy failed', { player: req.player.id, error: result.error }); return res.status(404).json(result); }
  logBattle('find_enemy', { attacker: req.player.id, defender: result.id, name: result.name });
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

// ==================== TROOPS ====================

// Buy a troop (deduct gold, server-validated)
const TROOP_BUY_COST = 100;
router.post('/troops/buy', auth, (req, res) => {
  const { troop_name } = req.body;
  if (!troop_name) return res.status(400).json({ error: 'troop_name required' });
  const validTroops = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger'];
  if (!validTroops.includes(troop_name)) return res.status(400).json({ error: 'Invalid troop type' });
  if (!db.canAfford(req.player.id, TROOP_BUY_COST, 0, 0)) {
    return res.status(400).json({ error: 'Not enough gold', cost: TROOP_BUY_COST });
  }
  db.subtractResources(req.player.id, TROOP_BUY_COST, 0, 0);
  res.json({ success: true, troop_name, cost: TROOP_BUY_COST, resources: db.getResources(req.player.id) });
});

// Load troop onto a ship at a port
const TROOP_COST = 100;
const REINFORCE_COST = 50;
const VALID_TROOPS = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger'];

// Load a troop into a ship slot (costs 100 gold). Also saves template.
router.post('/buildings/:id/load-troop', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const { troop_name } = req.body;
  if (!troop_name || !VALID_TROOPS.includes(troop_name)) return res.status(400).json({ error: 'Invalid troop type' });

  const txn = db.db.transaction(() => {
    const building = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, req.player.id);
    if (!building) throw { status: 404, error: 'Building not found' };
    if (building.type !== 'port' || !building.has_ship) throw { status: 400, error: 'No ship at this port' };

    const shipTroops = JSON.parse(building.ship_troops || '[]');
    const capacity = building.level * 3;  // 3x capacity: Lv1=3, Lv2=6, Lv3=9
    if (shipTroops.length >= capacity) throw { status: 400, error: 'Ship is full' };

    const player = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(req.player.id);
    if (player.gold < TROOP_COST) throw { status: 400, error: 'Not enough gold' };

    db.db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(TROOP_COST, req.player.id);
    shipTroops.push(troop_name);
    const troopsJson = JSON.stringify(shipTroops);
    // Save both current troops and template (what player chose)
    db.db.prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?').run(troopsJson, troopsJson, buildingId);

    const updated = db.db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(req.player.id);
    return { ship_troops: shipTroops, ship_level: building.level, ship_capacity: capacity, resources: updated };
  });

  try {
    const result = txn();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.error || 'Server error' });
  }
});

// Swap a troop in a specific slot (costs 100 gold). Does NOT update template.
router.post('/buildings/:id/swap-troop', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const { slot, troop_name } = req.body;
  if (!Number.isInteger(slot) || !troop_name || !VALID_TROOPS.includes(troop_name)) {
    return res.status(400).json({ error: 'Valid integer slot and troop_name required' });
  }

  const txn = db.db.transaction(() => {
    const building = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, req.player.id);
    if (!building) throw { status: 404, error: 'Building not found' };
    if (building.type !== 'port' || !building.has_ship) throw { status: 400, error: 'No ship at this port' };

    const shipTroops = JSON.parse(building.ship_troops || '[]');
    if (slot < 0 || slot >= shipTroops.length) throw { status: 400, error: 'Invalid slot' };

    const player = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(req.player.id);
    if (player.gold < TROOP_COST) throw { status: 400, error: 'Not enough gold' };

    db.db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(TROOP_COST, req.player.id);
    shipTroops[slot] = troop_name;
    const troopsJson = JSON.stringify(shipTroops);
    // Update ship_troops only — template stays as the last full loadout so /reinforce
    // can still restore the original slot count after casualties.
    db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(troopsJson, buildingId);

    const updated = db.db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(req.player.id);
    return { ship_troops: shipTroops, ship_level: building.level, ship_capacity: building.level * 3, resources: updated };
  });

  try {
    const result = txn();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.error || 'Server error' });
  }
});

// Get current ship troops for all ports (used before attack to sync)
router.get('/ships', auth, (req, res) => {
  const ports = db.db.prepare('SELECT id, level, ship_troops, ship_troops_template, has_ship FROM buildings WHERE player_id = ? AND type = ?').all(req.player.id, 'port');
  const ships = ports.filter(p => p.has_ship).map(p => ({
    id: p.id,
    level: p.level,
    ship_troops: JSON.parse(p.ship_troops || '[]'),
    ship_troops_template: JSON.parse(p.ship_troops_template || '[]'),
  }));
  res.json({ ships });
});

// Report a single troop death during battle — removes one from ship_troops immediately
// Rate-limited: max 1 per 500ms per player to prevent abuse
const _troopDiedTimestamps = {};
router.post('/troop-died', auth, (req, res) => {
  const now = Date.now();
  const last = _troopDiedTimestamps[req.player.id] || 0;
  if (now - last < 500) return res.status(429).json({ error: 'Too fast' });
  _troopDiedTimestamps[req.player.id] = now;

  const { troop_name } = req.body;
  if (!troop_name || !VALID_TROOPS.includes(troop_name)) return res.status(400).json({ error: 'Invalid troop' });

  // Find first port that has this troop and remove one instance (atomic)
  const result = db.db.transaction(() => {
    const ports = db.db.prepare('SELECT id, ship_troops FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(req.player.id, 'port');
    for (const port of ports) {
      const troops = JSON.parse(port.ship_troops || '[]');
      const idx = troops.indexOf(troop_name);
      if (idx !== -1) {
        troops.splice(idx, 1);
        db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(JSON.stringify(troops), port.id);
        return { removed: troop_name, port_id: port.id };
      }
    }
    return { removed: null };
  })();
  res.json({ success: true, ...result });
});

// Get casualties: compare ship_troops vs ship_troops_template to find missing troops
router.get('/casualties', auth, (req, res) => {
  const ports = db.db.prepare('SELECT * FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(req.player.id, 'port');
  const casualties = {};
  let totalMissing = 0;

  for (const port of ports) {
    const current = JSON.parse(port.ship_troops || '[]');
    const template = JSON.parse(port.ship_troops_template || '[]');
    // Count how many of each troop type are missing
    const currentCounts = {};
    for (const t of current) currentCounts[t] = (currentCounts[t] || 0) + 1;
    for (const t of template) {
      if (currentCounts[t] && currentCounts[t] > 0) {
        currentCounts[t]--;
      } else {
        casualties[t] = (casualties[t] || 0) + 1;
        totalMissing++;
      }
    }
  }

  res.json({
    casualties,
    total: totalMissing,
    cost: totalMissing * REINFORCE_COST,
  });
});

// Reinforce: restore dead troops from template (costs 50 gold per restored troop)
router.post('/reinforce', auth, (req, res) => {
  const txn = db.db.transaction(() => {
    const ports = db.db.prepare('SELECT * FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(req.player.id, 'port');

    let totalToRestore = 0;
    const shipsToRestore = [];

    for (const port of ports) {
      const current = JSON.parse(port.ship_troops || '[]');
      const template = JSON.parse(port.ship_troops_template || '[]');
      if (template.length === 0) continue;
      // Count missing troops by type (template - current)
      const currentCounts = {};
      for (const t of current) currentCounts[t] = (currentCounts[t] || 0) + 1;
      const toAdd = [];
      for (const t of template) {
        if (currentCounts[t] && currentCounts[t] > 0) {
          currentCounts[t]--;
        } else {
          toAdd.push(t);
        }
      }
      if (toAdd.length > 0) {
        totalToRestore += toAdd.length;
        shipsToRestore.push({ port, current, toAdd });
      }
    }

    if (totalToRestore === 0) return { cost: 0, restored: 0, ships: [] };

    const totalCost = totalToRestore * REINFORCE_COST;
    const player = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(req.player.id);
    if (player.gold < totalCost) throw { status: 400, error: `Not enough gold (need ${totalCost})` };

    db.db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(totalCost, req.player.id);

    // Append missing troops to current (preserves swaps, only restores casualties)
    // Cap to ship capacity to prevent overflow from swap+reinforce combo
    const resultShips = [];
    for (const { port, current, toAdd } of shipsToRestore) {
      const capacity = port.level * 3;
      const slotsAvailable = Math.max(0, capacity - current.length);
      const restored = [...current, ...toAdd.slice(0, slotsAvailable)];
      const troopsJson = JSON.stringify(restored);
      db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(troopsJson, port.id);
      resultShips.push({ id: port.id, ship_troops: restored });
    }

    const updated = db.db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(req.player.id);
    return { cost: totalCost, restored: totalToRestore, ships: resultShips, resources: updated };
  });

  try {
    const result = txn();
    if (result.restored > 0) logEconomy('reinforce', { player: req.player.id, restored: result.restored, cost: result.cost });
    res.json({ success: true, ...result });
  } catch (e) {
    logError('reinforce failed', { player: req.player.id, error: e.error || e.message });
    res.status(e.status || 500).json({ error: e.error || 'Server error' });
  }
});

// Unload all troops from a ship
router.post('/buildings/:id/unload-troops', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });

  const building = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, req.player.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });

  db.db.prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?').run('[]', '[]', buildingId);
  res.json({ success: true, ship_troops: [] });
});

// ==================== TUTORIAL ====================

// Tutorial flags (bitmask): each bit = one completed phase
// Bit 0 (1):  base tutorial (welcome, TH, buildings)
// Bit 1 (2):  army tutorial (port, ship, troops)
// Bit 2 (4):  attack tutorial (first battle guide)
// Bit 3 (8):  trading tutorial

// GET current tutorial state
router.get('/tutorial', auth, (req, res) => {
  const player = db.db.prepare('SELECT tutorial_flags FROM players WHERE id = ?').get(req.player.id);
  res.json({ tutorial_flags: player?.tutorial_flags || 0 });
});

// POST mark a tutorial phase as complete (flag is a bitmask: 1,2,4,8)
router.post('/tutorial/complete', auth, (req, res) => {
  const { flag } = req.body;
  if (!Number.isInteger(flag) || flag < 1 || flag > 15) return res.status(400).json({ error: 'Invalid flag' });
  const player = db.db.prepare('SELECT tutorial_flags FROM players WHERE id = ?').get(req.player.id);
  const current = player?.tutorial_flags || 0;
  const updated = current | flag;
  if (updated !== current) {
    db.db.prepare('UPDATE players SET tutorial_flags = ? WHERE id = ?').run(updated, req.player.id);
  }
  res.json({ tutorial_flags: updated });
});

// ==================== LEADERBOARD ====================

router.get('/leaderboard', (req, res) => {
  const rows = db.db.prepare(`
    SELECT p.name, p.trophies, p.dex,
      COALESCE((SELECT MAX(b.level) FROM buildings b WHERE b.player_id = p.id AND b.type = 'town_hall'), 1) AS level
    FROM players p
    WHERE p.trophies > 0
    ORDER BY p.trophies DESC
    LIMIT 50
  `).all();
  res.json(rows);
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

const GOLD_PER_USD_VOLUME = 0.30;
const GOLD_FIRST_DEPOSIT = 500;
const GOLD_FIRST_TRADE = 300;
const GOLD_DAILY_TRADE = 200;
const GOLD_PER_10_USD_PROFIT = 150; // +150 gold per $10 positive PnL

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
// Lazy-open server-futures DB (read-only) so this endpoint can credit gold
// for Avantis trades recorded by the futures service. Guarded so the main
// server still works on hosts where server-futures isn't deployed.
let _futuresDb = null;
function futuresDbReadonly() {
  if (_futuresDb === 'unavailable') return null;
  if (_futuresDb) return _futuresDb;
  try {
    const Database = require('better-sqlite3');
    const fpath = process.env.CLASH_FUTURES_DB || require('path').join(__dirname, '..', 'server-futures', 'futures.db');
    if (!require('fs').existsSync(fpath)) throw new Error('futures.db not found at ' + fpath);
    _futuresDb = new Database(fpath, { readonly: true, fileMustExist: true });
    _futuresDb.pragma('journal_mode = WAL');
  } catch (e) {
    console.warn('[claim-gold] Avantis futures.db unavailable:', e.message);
    _futuresDb = 'unavailable';
    return null;
  }
  return _futuresDb;
}

router.post('/trading/claim-gold', auth, async (req, res) => {
  // Rate limit
  const lastClaim = claimCooldowns.get(req.player.id);
  if (lastClaim && Date.now() - lastClaim < 5000) {
    return res.status(429).json({ gold: 0, reason: 'Please wait before claiming again' });
  }
  claimCooldowns.set(req.player.id, Date.now());
  const wallet = req.body.wallet || req.player.wallet;
  const dex = String(req.body.dex || req.player.dex || 'pacifica').toLowerCase();

  // ── Avantis branch: count volume from server-futures.trade_history ──
  if (dex === 'avantis') {
    const fdb = futuresDbReadonly();
    if (!fdb) {
      return res.json({ gold: 0, reason: 'Futures service unavailable — try again later' });
    }
    let reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ?').get(req.player.id);
    if (!reward) {
      db.db.prepare('INSERT INTO trading_rewards (player_id, wallet) VALUES (?, ?)').run(req.player.id, wallet || '');
      reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ?').get(req.player.id);
    }
    // Use last_trade_id as a rowid-threshold — avantis rows have integer PKs.
    const newTrades = fdb.prepare(`
      SELECT id, symbol, side, amount, notional_usd, status, created_at
      FROM trade_history
      WHERE player_id = ? AND dex = 'avantis' AND status != 'failed' AND id > ?
      ORDER BY id ASC
    `).all(req.player.id, reward.last_trade_id || 0);

    if (newTrades.length === 0 && reward.first_deposit && reward.first_trade) {
      return res.json({ gold: 0, reason: 'No new trades' });
    }

    let totalGold = 0;
    const reasons = [];
    let maxId = reward.last_trade_id || 0;
    let newVolume = 0;
    for (const t of newTrades) {
      const vol = Number(t.notional_usd) || 0;
      newVolume += vol;
      totalGold += Math.floor(vol * GOLD_PER_USD_VOLUME);
      if (t.id > maxId) maxId = t.id;
    }
    if (newTrades.length > 0) reasons.push(`${newTrades.length} trades`);

    if (!reward.first_deposit) { totalGold += GOLD_FIRST_DEPOSIT; reasons.push('First deposit!'); }
    if (!reward.first_trade && newTrades.length > 0) { totalGold += GOLD_FIRST_TRADE; reasons.push('First trade!'); }
    const today = new Date().toISOString().split('T')[0];
    if (reward.last_daily !== today && newTrades.length > 0) { totalGold += GOLD_DAILY_TRADE; reasons.push('Daily bonus'); }

    db.db.prepare(`
      UPDATE trading_rewards SET
        last_trade_id = ?, total_volume = total_volume + ?, total_gold = total_gold + ?,
        first_deposit = 1, first_trade = CASE WHEN ? > 0 THEN 1 ELSE first_trade END,
        last_daily = ?, updated_at = datetime('now')
      WHERE player_id = ?
    `).run(maxId, newVolume, totalGold, newTrades.length, today, req.player.id);

    if (totalGold > 0) {
      db.addResources(req.player.id, totalGold, 0, 0);
      return res.json({ gold: totalGold, reason: reasons.join(' + ') || 'Trading reward', dex: 'avantis' });
    }
    return res.json({ gold: 0, reason: newTrades.length ? 'Below reward threshold' : 'No new trades', dex: 'avantis' });
  }

  // ── Pacifica branch (existing, unchanged) ──
  if (!wallet) return res.status(400).json({ error: 'wallet required — connect wallet in profile' });

  try {
    // Get or create reward record
    let reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ?').get(req.player.id);
    if (!reward) {
      db.db.prepare('INSERT INTO trading_rewards (player_id, wallet) VALUES (?, ?)').run(req.player.id, wallet);
      reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ?').get(req.player.id);
    }
    // Auto-link wallet to player account if missing or still a Farcaster placeholder
    // (`fc_<fid>` saved during Farcaster auto-register). Lets tasks/quests find the real wallet.
    if (isValidWallet(wallet) && (!isValidWallet(req.player.wallet))) {
      try { db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, req.player.id); } catch {}
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

// ==================== TASKS (QUESTS) ====================

// Rate-limit tasks endpoints per player (2s)
const taskRateLimit = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [k, v] of taskRateLimit) if (v < cutoff) taskRateLimit.delete(k);
}, 600000);

function rateGate(playerId, ms = 2000) {
  const last = taskRateLimit.get(playerId);
  if (last && Date.now() - last < ms) return false;
  taskRateLimit.set(playerId, Date.now());
  return true;
}

// List active tasks + player progress
router.get('/tasks', auth, async (req, res) => {
  if (!rateGate('list:' + req.player.id, 500)) {
    return res.status(429).json({ error: 'slow down' });
  }
  const list = tasks.getActiveTasks();
  const out = [];
  for (const t of list) {
    const pt = tasks.getPlayerTask(req.player.id, t.id);
    out.push({
      id: t.id,
      type: t.type,
      title: t.title,
      description: t.description,
      params: tasks.parseParams(t.params),
      reward_gold: t.reward_gold,
      reward_wood: t.reward_wood,
      reward_ore: t.reward_ore,
      repeatable: !!t.repeatable,
      cooldown_hours: t.cooldown_hours,
      started: !!pt,
      progress_value: pt ? pt.progress_value : 0,
      target_value: pt ? pt.target_value : 0,
      claimed_at: pt ? pt.claimed_at : null,
    });
  }
  res.json(out);
});

// Start a task (captures baseline snapshot)
router.post('/tasks/:id/start', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const task = tasks.getTaskById(id);
  if (!task || !task.active) return res.status(404).json({ error: 'Task not active' });

  const existing = tasks.getPlayerTask(req.player.id, id);
  if (existing && !existing.claimed_at) {
    return res.json({ ok: true, already_started: true });
  }
  // Repeatable + claimed: check cooldown before allowing re-start
  if (existing && existing.claimed_at) {
    const check = tasks.canClaim(existing, task);
    if (!check.ok && check.reason && check.reason.startsWith('Cooldown')) {
      return res.status(429).json({ error: check.reason });
    }
  }

  const snap = await tasks.buildSnapshot(req.player, task);
  db.db.prepare(
    `INSERT OR REPLACE INTO player_tasks (player_id, task_id, snapshot, progress, progress_value, target_value, started_at, claimed_at)
     VALUES (?, ?, ?, 0, 0, 0, datetime('now'), NULL)`
  ).run(req.player.id, id, JSON.stringify(snap));
  res.json({ ok: true, started: true });
});

// Claim a task — verifies against Pacifica + battle_replays, pays out on success
router.post('/tasks/:id/claim', auth, async (req, res) => {
  if (!rateGate('claim:' + req.player.id, 3000)) {
    return res.status(429).json({ error: 'slow down' });
  }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const task = tasks.getTaskById(id);
  if (!task || !task.active) return res.status(404).json({ error: 'Task not active' });

  let pt = tasks.getPlayerTask(req.player.id, id);
  if (!pt) {
    // auto-start — snapshot taken now, so there's nothing yet to claim
    const snap = await tasks.buildSnapshot(req.player, task);
    db.db.prepare(
      `INSERT INTO player_tasks (player_id, task_id, snapshot) VALUES (?, ?, ?)`
    ).run(req.player.id, id, JSON.stringify(snap));
    pt = tasks.getPlayerTask(req.player.id, id);
  }
  const claimCheck = tasks.canClaim(pt, task);
  if (!claimCheck.ok) return res.status(400).json({ error: claimCheck.reason });

  const snap = tasks.parseParams(pt.snapshot);
  const result = await tasks.verifyTask(req.player, task, snap);

  // Always update cached progress
  db.db.prepare(
    `UPDATE player_tasks SET progress_value = ?, target_value = ?, progress = ? WHERE player_id = ? AND task_id = ?`
  ).run(result.progress_value, result.target_value, result.target_value > 0 ? Math.min(1, result.progress_value / result.target_value) : 0, req.player.id, id);

  if (!result.completed) {
    return res.json({ ok: false, completed: false, progress_value: result.progress_value, target_value: result.target_value, breakdown: result.breakdown });
  }

  // Payout in a transaction
  const payout = db.db.transaction(() => {
    db.addResources(req.player.id, task.reward_gold || 0, task.reward_wood || 0, task.reward_ore || 0);
    if (task.reward_gold > 0) {
      try {
        db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)')
          .run(req.player.id, task.reward_gold, `Quest: ${task.title}`);
      } catch {}
    }
    db.db.prepare(`UPDATE player_tasks SET claimed_at = datetime('now') WHERE player_id = ? AND task_id = ?`).run(req.player.id, id);
    // If repeatable with no cooldown — keep snapshot refreshed for next run? We reset via cooldown claim flow instead.
  });
  payout();

  try {
    logEconomy('Task claimed', { player: req.player.name, task: task.title, gold: task.reward_gold, wood: task.reward_wood, ore: task.reward_ore });
  } catch {}

  res.json({
    ok: true,
    completed: true,
    reward: { gold: task.reward_gold, wood: task.reward_wood, ore: task.reward_ore },
    progress_value: result.progress_value,
    target_value: result.target_value,
  });
});

// ==================== ELFA (SOCIAL INTEL) ====================

// Per-player rate limit for /elfa/explain — 10/min
const explainRate = new Map();
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [k, arr] of explainRate) {
    const kept = arr.filter(t => t >= cutoff);
    if (kept.length) explainRate.set(k, kept); else explainRate.delete(k);
  }
}, 300000);

function explainRateLimit(playerId) {
  const now = Date.now();
  const arr = (explainRate.get(playerId) || []).filter(t => now - t < 60000);
  if (arr.length >= 10) return false;
  arr.push(now);
  explainRate.set(playerId, arr);
  return true;
}

// Social signals for all known trending tokens — cached 1h server-side
router.get('/elfa/signals', auth, async (req, res) => {
  const r = await elfa.getAllSignals();
  res.json(r);
});

// Explain why a symbol is moving — cached 10 min, 10 req/min per player
router.get('/elfa/explain/:symbol', auth, async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'bad symbol' });
  if (!explainRateLimit(req.player.id)) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute' });
  }
  const data = await elfa.getExplain(symbol, req.player.name);
  res.json(data);
});

// Structured trade idea (side/entry/tp/sl/confidence) — hacked on top of /chat
// with a JSON prompt. Cached 30 min. Same rate limit bucket as explain.
router.get('/elfa/trade-idea/:symbol', auth, async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'bad symbol' });
  if (!explainRateLimit(req.player.id)) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute' });
  }
  const data = await elfa.getTradeIdea(symbol, req.player.name);
  res.json(data);
});

// Admin: per-symbol Elfa stats + error log
router.get('/admin/elfa/stats', adminAuth, (req, res) => {
  res.json({
    has_key: elfa.hasKey(),
    stats: elfa.getStats(),
    errors: elfa.getErrors(),
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

const ADMIN_KEY = process.env.ADMIN_KEY;
function adminAuth(req, res, next) {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// List all players with full details (shields, wallet, last attack)
router.get('/admin/players', adminAuth, (req, res) => {
  const players = db.db.prepare(`
    SELECT id, name, trophies, level, gold, wood, ore, wallet,
           shield_until, last_attacked_by, last_attacked_at, created_at
    FROM players ORDER BY trophies DESC
  `).all();
  res.json(players.map(p => ({
    ...p,
    shield_active: p.shield_until && new Date(p.shield_until + 'Z') > new Date(),
    shield_remaining: p.shield_until ? Math.max(0, Math.round((new Date(p.shield_until + 'Z') - new Date()) / 60000)) : 0,
    buildings_count: db.db.prepare('SELECT COUNT(*) as c FROM buildings WHERE player_id = ?').get(p.id).c,
  })));
});

// All battle replays with full details
router.get('/admin/replays', adminAuth, (req, res) => {
  const rows = db.db.prepare(`
    SELECT r.id, r.attacker_id, r.defender_id,
           r.claimed_result, r.verified_result, r.verification_reason,
           r.loot_gold, r.loot_wood, r.loot_ore,
           r.sim_th_hp_pct, r.sim_buildings_destroyed, r.duration_sec,
           r.created_at,
           pa.name AS attacker_name, pd.name AS defender_name
    FROM battle_replays r
    LEFT JOIN players pa ON pa.id = r.attacker_id
    LEFT JOIN players pd ON pd.id = r.defender_id
    ORDER BY r.created_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

// Get full details of one replay including actions and verification data
router.get('/admin/replays/:id', adminAuth, (req, res) => {
  const row = db.db.prepare(`
    SELECT r.*, pa.name AS attacker_name, pd.name AS defender_name
    FROM battle_replays r
    LEFT JOIN players pa ON pa.id = r.attacker_id
    LEFT JOIN players pd ON pd.id = r.defender_id
    WHERE r.id = ?
  `).get(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'Replay not found' });
  try { row.replay_data = row.replay_data ? JSON.parse(row.replay_data) : null; } catch {}
  try { row.buildings_snapshot = row.buildings_snapshot ? JSON.parse(row.buildings_snapshot) : null; } catch {}
  try { row.verification_data = row.verification_data ? JSON.parse(row.verification_data) : null; } catch {}
  res.json(row);
});

// Delete a player by name
// Diagnose wallet → accounts. Returns every row sharing the given wallet
// (legacy duplicates — DB lacks a UNIQUE constraint on wallet).
router.get('/admin/wallets/:wallet/accounts', adminAuth, (req, res) => {
  const rows = db.db.prepare(
    'SELECT id, name, trophies, wallet, created_at FROM players WHERE wallet = ? ORDER BY COALESCE(trophies, 0) DESC, id DESC'
  ).all(req.params.wallet);
  res.json({ wallet: req.params.wallet, count: rows.length, accounts: rows });
});

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
  db.db.prepare('UPDATE players SET gold = 4000, wood = 4000, ore = 4000, trophies = 0 WHERE id = ?').run(player.id);
  db.db.prepare('UPDATE troop_levels SET level = 1 WHERE player_id = ?').run(player.id);
  res.json({ reset: req.params.name });
});

// Reset trophies for one player
router.post('/admin/players/:name/reset-trophies', adminAuth, (req, res) => {
  const player = db.db.prepare('SELECT id FROM players WHERE name = ?').get(req.params.name);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  db.db.prepare('UPDATE players SET trophies = 0 WHERE id = ?').run(player.id);
  res.json({ reset_trophies: req.params.name });
});

// Reset trophies for ALL players
router.post('/admin/reset-all-trophies', adminAuth, (req, res) => {
  const result = db.db.prepare('UPDATE players SET trophies = 0').run();
  res.json({ reset: result.changes });
});

// Add resources to ALL players
router.post('/admin/add-resources-all', adminAuth, (req, res) => {
  const { gold = 0, wood = 0, ore = 0 } = req.body;
  if (typeof gold !== 'number' || typeof wood !== 'number' || typeof ore !== 'number') {
    return res.status(400).json({ error: 'gold, wood, ore must be numbers' });
  }
  const players = db.db.prepare('SELECT id FROM players').all();
  let updated = 0;
  for (const p of players) {
    db.addResources(p.id, gold, wood, ore);
    updated++;
  }
  res.json({ success: true, players_updated: updated, added: { gold, wood, ore } });
});

// Add resources to a specific player by name
router.post('/admin/players/:name/add-resources', adminAuth, (req, res) => {
  const player = db.db.prepare('SELECT id FROM players WHERE name = ?').get(req.params.name);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  const { gold = 0, wood = 0, ore = 0 } = req.body;
  if (typeof gold !== 'number' || typeof wood !== 'number' || typeof ore !== 'number') {
    return res.status(400).json({ error: 'gold, wood, ore must be numbers' });
  }
  db.addResources(player.id, gold, wood, ore);
  res.json({ success: true, resources: db.getResources(player.id) });
});

// Server logs — in-memory ring buffer
const LOG_MAX = 500;
const _serverLogs = [];
function addLog(type, message, data = null) {
  _serverLogs.push({ ts: new Date().toISOString(), type, message, data });
  if (_serverLogs.length > LOG_MAX) _serverLogs.shift();
}

// Expose log function for use in other handlers
function logBattle(msg, data) { addLog('battle', msg, data); }
function logEconomy(msg, data) { addLog('economy', msg, data); }
function logAuth(msg, data) { addLog('auth', msg, data); }
function logError(msg, data) { addLog('error', msg, data); }

// Get server logs
router.get('/admin/logs', adminAuth, (req, res) => {
  const type = req.query.type;
  const limit = Math.min(parseInt(req.query.limit) || 100, LOG_MAX);
  let logs = type ? _serverLogs.filter(l => l.type === type) : _serverLogs;
  res.json(logs.slice(-limit));
});

// Server stats
router.get('/admin/stats', adminAuth, (req, res) => {
  const playerCount = db.db.prepare('SELECT COUNT(*) as c FROM players').get().c;
  const buildingCount = db.db.prepare('SELECT COUNT(*) as c FROM buildings').get().c;
  const replayCount = db.db.prepare('SELECT COUNT(*) as c FROM battle_replays').get().c;
  const accepted = db.db.prepare("SELECT COUNT(*) as c FROM battle_replays WHERE verified_result='accepted'").get().c;
  const rejected = db.db.prepare("SELECT COUNT(*) as c FROM battle_replays WHERE verified_result='rejected'").get().c;
  const totalGold = db.db.prepare('SELECT SUM(gold) as s FROM players').get().s || 0;
  const totalWood = db.db.prepare('SELECT SUM(wood) as s FROM players').get().s || 0;
  const totalOre = db.db.prepare('SELECT SUM(ore) as s FROM players').get().s || 0;
  const shielded = db.db.prepare("SELECT COUNT(*) as c FROM players WHERE shield_until > datetime('now')").get().c;
  const recentBattles = db.db.prepare("SELECT COUNT(*) as c FROM battle_replays WHERE created_at > datetime('now', '-1 hour')").get().c;
  const topPlayers = db.db.prepare('SELECT name, trophies, gold, wood, ore FROM players ORDER BY trophies DESC LIMIT 5').all();
  res.json({
    players: playerCount, buildings: buildingCount, replays: replayCount,
    accepted, rejected, shielded, recentBattles,
    economy: { totalGold, totalWood, totalOre },
    topPlayers,
    uptime: Math.floor(process.uptime()),
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

// ---------- Admin: Tasks CRUD ----------
router.get('/admin/tasks', adminAuth, (req, res) => {
  const list = tasks.getAllTasks();
  // Per-task aggregate stats
  const startedRows = db.db.prepare(
    `SELECT task_id, COUNT(*) AS n FROM player_tasks GROUP BY task_id`
  ).all();
  const claimedRows = db.db.prepare(
    `SELECT task_id, COUNT(*) AS n FROM player_tasks WHERE claimed_at IS NOT NULL GROUP BY task_id`
  ).all();
  const progressRows = db.db.prepare(
    `SELECT task_id, AVG(CASE WHEN target_value > 0 THEN progress_value / target_value ELSE 0 END) AS avg_progress,
            MAX(claimed_at) AS last_claim, MAX(started_at) AS last_start
     FROM player_tasks GROUP BY task_id`
  ).all();
  const startedMap = {}; for (const r of startedRows) startedMap[r.task_id] = r.n;
  const claimedMap = {}; for (const r of claimedRows) claimedMap[r.task_id] = r.n;
  const progMap = {}; for (const r of progressRows) progMap[r.task_id] = r;
  res.json(list.map(t => {
    const p = progMap[t.id] || {};
    const started = startedMap[t.id] || 0;
    const claimed = claimedMap[t.id] || 0;
    return {
      ...t,
      params: tasks.parseParams(t.params),
      started_count: started,
      claimed_count: claimed,
      completion_rate: started > 0 ? claimed / started : 0,
      avg_progress: p.avg_progress || 0,
      last_claim: p.last_claim || null,
      last_start: p.last_start || null,
    };
  }));
});

// Overall quest system stats — for the big summary card
router.get('/admin/tasks-summary', adminAuth, (req, res) => {
  const total = db.db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
  const active = db.db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE active = 1').get().n;
  const started = db.db.prepare('SELECT COUNT(*) AS n FROM player_tasks').get().n;
  const claimed = db.db.prepare('SELECT COUNT(*) AS n FROM player_tasks WHERE claimed_at IS NOT NULL').get().n;
  const uniquePlayers = db.db.prepare('SELECT COUNT(DISTINCT player_id) AS n FROM player_tasks').get().n;
  const claimers = db.db.prepare('SELECT COUNT(DISTINCT player_id) AS n FROM player_tasks WHERE claimed_at IS NOT NULL').get().n;
  // Rewards paid — sum reward_* for each claimed (player_tasks, task)
  const rewardRow = db.db.prepare(`
    SELECT COALESCE(SUM(t.reward_gold),0) AS gold,
           COALESCE(SUM(t.reward_wood),0) AS wood,
           COALESCE(SUM(t.reward_ore),0)  AS ore
    FROM player_tasks pt
    JOIN tasks t ON t.id = pt.task_id
    WHERE pt.claimed_at IS NOT NULL
  `).get();
  // Recent activity — last 24h
  const cutoff24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace('T', ' ').split('.')[0];
  const started24 = db.db.prepare('SELECT COUNT(*) AS n FROM player_tasks WHERE started_at >= ?').get(cutoff24).n;
  const claimed24 = db.db.prepare('SELECT COUNT(*) AS n FROM player_tasks WHERE claimed_at >= ?').get(cutoff24).n;
  // Top 5 players by claims
  const topPlayers = db.db.prepare(`
    SELECT p.name, COUNT(*) AS claims,
           COALESCE(SUM(t.reward_gold),0) AS gold_earned
    FROM player_tasks pt
    JOIN tasks t   ON t.id = pt.task_id
    JOIN players p ON p.id = pt.player_id
    WHERE pt.claimed_at IS NOT NULL
    GROUP BY pt.player_id
    ORDER BY claims DESC, gold_earned DESC
    LIMIT 5
  `).all();
  // Breakdown by task type
  const byType = db.db.prepare(`
    SELECT t.type, COUNT(pt.task_id) AS claims
    FROM tasks t
    LEFT JOIN player_tasks pt ON pt.task_id = t.id AND pt.claimed_at IS NOT NULL
    GROUP BY t.type
  `).all();
  res.json({
    total, active,
    started, claimed,
    unique_players_started: uniquePlayers,
    unique_players_claimed: claimers,
    completion_rate: started > 0 ? claimed / started : 0,
    rewards: rewardRow,
    last_24h: { started: started24, claimed: claimed24 },
    top_players: topPlayers,
    by_type: byType,
  });
});

// Per-task player breakdown: who started, who claimed, progress, last claim time
router.get('/admin/tasks/:id/players', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const task = tasks.getTaskById(id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const rows = db.db.prepare(`
    SELECT pt.player_id, pt.progress_value, pt.target_value,
           pt.started_at, pt.claimed_at, p.name AS player_name, p.wallet
    FROM player_tasks pt
    LEFT JOIN players p ON p.id = pt.player_id
    WHERE pt.task_id = ?
    ORDER BY (pt.claimed_at IS NOT NULL) DESC, pt.started_at DESC
  `).all(id);
  res.json({
    task: { id: task.id, title: task.title, type: task.type, repeatable: !!task.repeatable },
    players: rows,
    started: rows.length,
    claimed: rows.filter(r => r.claimed_at).length,
  });
});

router.post('/admin/tasks', adminAuth, (req, res) => {
  const b = req.body || {};
  if (!tasks.VALID_TYPES.includes(b.type)) return res.status(400).json({ error: 'bad type' });
  if (!b.title || typeof b.title !== 'string') return res.status(400).json({ error: 'title required' });
  const params = typeof b.params === 'object' && b.params !== null ? b.params : {};
  if (params.side && !tasks.VALID_SIDES.includes(params.side)) return res.status(400).json({ error: 'bad side' });
  const r = db.db.prepare(
    `INSERT INTO tasks (type, title, description, params, reward_gold, reward_wood, reward_ore, active, repeatable, cooldown_hours, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    b.type,
    b.title.trim(),
    b.description || '',
    JSON.stringify(params),
    Number(b.reward_gold) || 0,
    Number(b.reward_wood) || 0,
    Number(b.reward_ore) || 0,
    b.active === false ? 0 : 1,
    b.repeatable ? 1 : 0,
    Number(b.cooldown_hours) || 0,
    Number(b.sort_order) || 0,
  );
  res.json({ id: r.lastInsertRowid });
});

router.patch('/admin/tasks/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const b = req.body || {};
  const existing = tasks.getTaskById(id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const params = b.params && typeof b.params === 'object' ? b.params : tasks.parseParams(existing.params);
  const merged = {
    type: tasks.VALID_TYPES.includes(b.type) ? b.type : existing.type,
    title: b.title != null ? String(b.title).trim() : existing.title,
    description: b.description != null ? String(b.description) : existing.description,
    params: JSON.stringify(params),
    reward_gold: b.reward_gold != null ? Number(b.reward_gold) : existing.reward_gold,
    reward_wood: b.reward_wood != null ? Number(b.reward_wood) : existing.reward_wood,
    reward_ore: b.reward_ore != null ? Number(b.reward_ore) : existing.reward_ore,
    active: b.active != null ? (b.active ? 1 : 0) : existing.active,
    repeatable: b.repeatable != null ? (b.repeatable ? 1 : 0) : existing.repeatable,
    cooldown_hours: b.cooldown_hours != null ? Number(b.cooldown_hours) : existing.cooldown_hours,
    sort_order: b.sort_order != null ? Number(b.sort_order) : existing.sort_order,
  };
  db.db.prepare(
    `UPDATE tasks SET type = ?, title = ?, description = ?, params = ?, reward_gold = ?, reward_wood = ?, reward_ore = ?, active = ?, repeatable = ?, cooldown_hours = ?, sort_order = ? WHERE id = ?`
  ).run(merged.type, merged.title, merged.description, merged.params, merged.reward_gold, merged.reward_wood, merged.reward_ore, merged.active, merged.repeatable, merged.cooldown_hours, merged.sort_order, id);
  res.json({ ok: true });
});

// Reset all player progress for a task (deletes player_tasks rows; keeps task itself)
router.post('/admin/tasks/:id/reset-progress', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const r = db.db.prepare('DELETE FROM player_tasks WHERE task_id = ?').run(id);
  res.json({ ok: true, removed: r.changes });
});

router.delete('/admin/tasks/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  db.db.prepare('DELETE FROM player_tasks WHERE task_id = ?').run(id);
  db.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Wipe entire database
router.post('/admin/wipe', adminAuth, (req, res) => {
  db.db.prepare('DELETE FROM buildings').run();
  db.db.prepare('DELETE FROM troop_levels').run();
  db.db.prepare('DELETE FROM players').run();
  res.json({ wiped: true });
});

module.exports = { router, auth, addLog, logBattle, logEconomy, logAuth, logError };
