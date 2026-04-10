const express = require('express');
const db = require('./db');

const router = express.Router();

// ---------- Validation Helpers ----------
const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // Solana base58
function isValidWallet(w) { return typeof w === 'string' && WALLET_RE.test(w); }

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
  const state = db.getFullPlayerState(result.id);
  res.json({ ...state, token: result.token });
});

// Login (get state by token)
router.get('/players/me', auth, (req, res) => {
  const state = db.getFullPlayerState(req.player.id);
  res.json(state);
});

// Link a wallet to existing account (e.g. Farcaster user connecting Solana wallet)
router.post('/players/link-wallet', auth, (req, res) => {
  const { wallet } = req.body;
  if (!wallet || !isValidWallet(wallet)) return res.status(400).json({ error: 'Valid Solana wallet required' });
  db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, req.player.id);
  res.json({ success: true });
});

// Login by wallet address (recover account after cache clear)
router.post('/players/login-wallet', (req, res) => {
  const { wallet } = req.body;
  if (!wallet || !isValidWallet(wallet)) return res.status(400).json({ error: 'Valid Solana wallet required' });
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
  const deployed = {};
  for (const port of ports) {
    const template = JSON.parse(port.ship_troops_template || '[]');
    for (const t of template) deployed[t] = (deployed[t] || 0) + 1;
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
router.post('/troop-died', auth, (req, res) => {
  const { troop_name } = req.body;
  if (!troop_name || !VALID_TROOPS.includes(troop_name)) return res.status(400).json({ error: 'Invalid troop' });

  // Find first port that has this troop and remove one instance
  const ports = db.db.prepare('SELECT id, ship_troops FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(req.player.id, 'port');
  for (const port of ports) {
    const troops = JSON.parse(port.ship_troops || '[]');
    const idx = troops.indexOf(troop_name);
    if (idx !== -1) {
      troops.splice(idx, 1);
      db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(JSON.stringify(troops), port.id);
      return res.json({ success: true, removed: troop_name, port_id: port.id });
    }
  }
  res.json({ success: true, removed: null }); // troop not found in any ship (already removed)
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
      // If template is empty, nothing to restore (player never loaded troops)
      if (template.length === 0) continue;
      // Compare: template is the full layout, current may have gaps (nulls) or fewer entries
      const missing = template.length - current.length;
      if (missing > 0) {
        totalToRestore += missing;
        shipsToRestore.push({ port, template });
      }
    }

    if (totalToRestore === 0) return { cost: 0, restored: 0, ships: [] };

    const totalCost = totalToRestore * REINFORCE_COST;
    const player = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(req.player.id);
    if (player.gold < totalCost) throw { status: 400, error: `Not enough gold (need ${totalCost})` };

    db.db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(totalCost, req.player.id);

    // Restore each ship to its template (exact same troops, same slots)
    const resultShips = [];
    for (const { port, template } of shipsToRestore) {
      const troopsJson = JSON.stringify(template);
      db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(troopsJson, port.id);
      resultShips.push({ id: port.id, ship_troops: template });
    }

    const updated = db.db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(req.player.id);
    return { cost: totalCost, restored: totalToRestore, ships: resultShips, resources: updated };
  });

  try {
    const result = txn();
    res.json({ success: true, ...result });
  } catch (e) {
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
    SELECT p.name, p.trophies,
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

const GOLD_PER_USD_VOLUME = 0.20;
const GOLD_FIRST_DEPOSIT = 500;
const GOLD_FIRST_TRADE = 300;
const GOLD_DAILY_TRADE = 750;
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

const ADMIN_KEY = process.env.ADMIN_KEY;
function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
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

// Wipe entire database
router.post('/admin/wipe', adminAuth, (req, res) => {
  db.db.prepare('DELETE FROM buildings').run();
  db.db.prepare('DELETE FROM troop_levels').run();
  db.db.prepare('DELETE FROM players').run();
  res.json({ wiped: true });
});

module.exports = { router, auth };
