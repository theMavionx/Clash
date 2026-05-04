const express = require('express');
const db = require('./db');
const tasks = require('./tasks');
const elfa = require('./elfa');

const router = express.Router();

// ---------- Validation Helpers ----------
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // Solana base58
const EVM_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;              // Base/Ethereum 20-byte hex
const APTOS_WALLET_RE = /^0x[0-9a-fA-F]{1,64}$/;          // Aptos account, padded or not
function isValidWallet(w) {
  if (typeof w !== 'string') return false;
  return SOLANA_WALLET_RE.test(w)
    || EVM_WALLET_RE.test(w)
    || (APTOS_WALLET_RE.test(w) && !EVM_WALLET_RE.test(w));
}
// Kept as alias so older references keep working.
const WALLET_RE = SOLANA_WALLET_RE;
void WALLET_RE;

function normalizeAptosWallet(w) {
  const raw = String(w || '').trim().toLowerCase();
  if (!APTOS_WALLET_RE.test(raw) || EVM_WALLET_RE.test(raw)) return raw;
  return `0x${raw.slice(2).padStart(64, '0')}`;
}

function walletLookupCandidates(wallet) {
  const raw = String(wallet || '').trim();
  const set = new Set([raw]);
  if (APTOS_WALLET_RE.test(raw) && !EVM_WALLET_RE.test(raw)) {
    const padded = normalizeAptosWallet(raw);
    const unpadded = `0x${padded.slice(2).replace(/^0+/, '') || '0'}`;
    set.add(padded);
    set.add(unpadded);
  }
  return Array.from(set).filter(Boolean);
}

function getPlayerByWalletAnyForm(wallet, excludeId = null) {
  const candidates = walletLookupCandidates(wallet);
  const placeholders = candidates.map(() => '?').join(',');
  const params = [...candidates];
  let where = `wallet IN (${placeholders})`;
  if (excludeId != null) {
    where += ' AND id != ?';
    params.push(excludeId);
  }
  return db.db.prepare(
    `SELECT * FROM players WHERE ${where} ORDER BY COALESCE(trophies, 0) DESC, id DESC LIMIT 1`
  ).get(...params);
}

// Per-DEX canonical lookup. Each (wallet, dex) pair is unique post-migration,
// so this returns at most one row. Uses the same Aptos zero-padding fan-out
// as the wallet-only variant so a user who entered an unpadded Aptos
// address on one device still matches their padded record from another.
function getPlayerByWalletAndDexAnyForm(wallet, dex) {
  const candidates = walletLookupCandidates(wallet);
  if (!candidates.length) return null;
  const placeholders = candidates.map(() => '?').join(',');
  return db.db.prepare(
    `SELECT * FROM players WHERE wallet IN (${placeholders}) AND dex = ? LIMIT 1`
  ).get(...candidates, dex);
}

// Return ALL DEX-specific accounts a wallet owns. Used by the wallet-only
// login probe to tell the client which DEX rows already exist so the picker
// can grey out "create new account" hints. Sorted by trophies DESC so the
// user's most-played DEX appears first if the client decides to fall back
// to "any account".
function getAllPlayersByWalletAnyForm(wallet) {
  const candidates = walletLookupCandidates(wallet);
  if (!candidates.length) return [];
  const placeholders = candidates.map(() => '?').join(',');
  return db.db.prepare(
    `SELECT * FROM players WHERE wallet IN (${placeholders}) ORDER BY COALESCE(trophies, 0) DESC, id DESC`
  ).all(...candidates);
}

// ---------- Auth Middleware ----------

// In-memory throttle so the heartbeat UPDATE doesn't fire on every single
// authenticated request — the polling cycle hits /api/state, /api/futures/*,
// /api/tasks etc. several times per second per active user. Bumping at most
// once per 60s per player is enough resolution for the admin "online now"
// (5-min window) + "active 24h" / "active 7d" counters, and keeps the
// players table out of the WAL hot path.
const _lastSeenBumpAt = new Map(); // playerId -> Date.now()
const LAST_SEEN_THROTTLE_MS = 60_000;

function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Missing x-token header' });
  const player = db.authenticatePlayer(token);
  if (!player) return res.status(401).json({ error: 'Invalid token' });
  req.player = player;
  // Heartbeat — bumps last_seen_at server-side. Powers the admin panel's
  // online/active counters (replaces the never-wired WebSocket path).
  // Throttled per-player so a chatty client doesn't write-amp the table.
  try {
    const now = Date.now();
    const prev = _lastSeenBumpAt.get(player.id) || 0;
    if (now - prev >= LAST_SEEN_THROTTLE_MS) {
      _lastSeenBumpAt.set(player.id, now);
      db.stmts.bumpPlayerLastSeen.run(player.id);
    }
  } catch { /* never block auth on a write failure */ }
  next();
}

// ==================== CLIENT LOGS (no auth) ====================
// Per-IP rate limit — no auth, so only the IP is usable as a key. Bucket
// cleans up expired entries every 5 minutes to bound memory growth under
// abuse. Previously unprotected: a flood of 10k/s could DoS the server's
// stdout / log sink.
const CLIENT_LOG_WINDOW_MS = 60_000;
const CLIENT_LOG_MAX_PER_WINDOW = 3000;  // bumped 30 → 3000 (100×) per user request
const clientLogBuckets = new Map(); // ip → { count, resetAt }
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of clientLogBuckets) if (v.resetAt < now) clientLogBuckets.delete(k);
}, 5 * 60_000).unref?.();

router.post('/client-log', (req, res) => {
  const ip = req.headers['x-real-ip'] || req.ip || 'anon';
  const now = Date.now();
  const b = clientLogBuckets.get(ip);
  if (b && b.resetAt > now) {
    if (b.count >= CLIENT_LOG_MAX_PER_WINDOW) {
      return res.status(429).json({ ok: false });
    }
    b.count++;
  } else {
    clientLogBuckets.set(ip, { count: 1, resetAt: now + CLIENT_LOG_WINDOW_MS });
  }
  const { level, message, ua, url } = req.body || {};
  const ts = new Date().toISOString();
  // Cap message size to 1kB — a single payload can't fill the log by itself
  // even if the rate-limit is somehow bypassed.
  const msg = String(message || '').slice(0, 1024);
  console.log(`[CLIENT ${(level || 'info').toUpperCase()}] ${ts} | ${ip} | ${(ua || '').slice(0, 80)} | ${String(url || '').slice(0, 200)} | ${msg}`);
  res.json({ ok: true });
});

// ==================== PLAYERS ====================

// Register a new player (or recover existing account by wallet)
// Set DEX preference (pacifica | avantis | decibel | gmx). Called after
// register or from RegisterPanel when the user switches DEX pre-connect.
// The value is used by leaderboard badges and by /api/futures/* routing.
// Without `gmx` in this set, the registration handler silently drops the
// requested dex on the floor and the player_row keeps its DEFAULT
// 'pacifica' — which is exactly the bug that produced phantom Pacifica
// accounts whenever a user picked GMX in the picker (the chosen DEX never
// reached the database).
const VALID_DEXES = new Set(['pacifica', 'avantis', 'decibel', 'gmx']);
// DEXes whose trade history is indexed by the futures rewards worker into
// the trade_history table (server-futures/futures.db). GMX joins this group
// in Phase 3 once the indexer wakes up; until then the rewards worker has
// no GMX rows to baseline against, so we keep it out of this set even
// though VALID_DEXES already accepts it.
const REWARD_INDEXED_DEXES = new Set(['avantis', 'decibel']);
function currentFuturesRewardBaseline(playerId, dex) {
  if (!REWARD_INDEXED_DEXES.has(dex)) return 0;
  try {
    const fdb = futuresDbReadonly();
    if (!fdb) return 0;
    const row = fdb.prepare(
      'SELECT COALESCE(MAX(id), 0) AS last_id FROM trade_history WHERE player_id = ? AND dex = ?'
    ).get(playerId, dex);
    return Number(row?.last_id || 0);
  } catch {
    return 0;
  }
}

function ensureTradingRewardRow(playerId, wallet, dex, baseline = 0) {
  try {
    db.db.prepare(`
      INSERT OR IGNORE INTO trading_rewards (player_id, dex, wallet, last_trade_id)
      VALUES (?, ?, ?, ?)
    `).run(playerId, dex, wallet || '', Math.max(0, Number(baseline) || 0));
  } catch {}
}

// /players/set-dex is now a no-op endpoint that returns the player's
// existing DEX. Pre-migration this UPDATEd the dex column on the same
// row, but DEX is now part of identity ((wallet, dex) UNIQUE) — switching
// DEX means logging into a different account, handled by the client via
// clearing its token and re-running register/login-wallet against the
// new DEX. Keeping the endpoint as a no-op rather than deleting it
// prevents 404s from stale clients during the deploy window; once all
// clients are on the new auth flow we can drop it.
router.post('/players/set-dex', auth, (req, res) => {
  const { dex } = req.body;
  if (!VALID_DEXES.has(dex)) {
    return res.status(400).json({ error: 'dex must be "pacifica", "avantis", "decibel" or "gmx"' });
  }
  if (dex !== req.player.dex) {
    logAuth('set-dex no-op (DEX is now per-account; client should switch via login-wallet)', {
      player_id: req.player.id, current_dex: req.player.dex, requested_dex: dex,
    });
  }
  res.json({ success: true, dex: req.player.dex, note: 'DEX is per-account; ignore field' });
});

router.post('/players/register', (req, res) => {
  const { name, wallet, dex, fid } = req.body;
  const requestedDex = VALID_DEXES.has(dex) ? dex : 'pacifica';

  // ── Per-DEX canonical lookup ────────────────────────────────────────
  // Each (wallet, dex) is now its own player row. The user's Avantis
  // progress and GMX progress live on separate rows even though both use
  // the same EVM wallet. So we only treat a row as "this is your account"
  // when BOTH the wallet AND the requested DEX match.
  if (wallet) {
    let existing = getPlayerByWalletAndDexAnyForm(wallet, requestedDex);

    // Migration path for Farcaster placeholder rows (wallet = `fc_<fid>`).
    // Same dex must match — if the placeholder was created on Pacifica and
    // the user is now requesting Avantis, we let the new-row branch run
    // and the placeholder stays for the original DEX.
    if (!existing && fid) {
      const placeholder = 'fc_' + String(fid);
      const placeholderRow = db.db.prepare(
        'SELECT * FROM players WHERE wallet = ? AND dex = ? ORDER BY id DESC LIMIT 1'
      ).get(placeholder, requestedDex);
      if (placeholderRow) {
        db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, placeholderRow.id);
        placeholderRow.wallet = wallet;
        existing = placeholderRow;
        logAuth('FC placeholder adopted', { fid, wallet, dex: requestedDex, player_id: existing.id });
      }
    }

    if (existing) {
      // Optional rename on re-login (same as before, scoped to this row).
      const trimmed = typeof name === 'string' ? name.trim() : '';
      const looksAutoDerived = /^player_[0-9a-f]{4,}$/i.test(trimmed);
      if (trimmed.length >= 2 && !looksAutoDerived && trimmed !== existing.name) {
        let finalName = trimmed;
        for (let suffix = 0; suffix <= 99; suffix++) {
          const tryName = suffix === 0 ? finalName : finalName + suffix;
          const clash = db.db.prepare('SELECT id FROM players WHERE name = ? AND id != ?').get(tryName, existing.id);
          if (!clash) {
            db.db.prepare('UPDATE players SET name = ? WHERE id = ?').run(tryName, existing.id);
            existing.name = tryName;
            finalName = tryName;
            break;
          }
        }
      }
      // No more dex-switching on the existing row — DEX is now part of
      // identity. If the caller wanted a different DEX they fall through
      // to the new-row branch above.
      const state = db.getFullPlayerState(existing.id);
      return res.json({ ...state, token: existing.token });
    }
  }

  // ── New-row branch ──────────────────────────────────────────────────
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  if (trimmed.length > 30) {
    return res.status(400).json({ error: 'Name must be at most 30 characters' });
  }
  // Try the requested name; if taken, append 1, 2, 3… until unique. This
  // is what gives a user a fresh nick when they create a second-DEX
  // account on the same wallet (e.g. "Player1" on Avantis, "Player11" on
  // GMX) — same suffix mechanism that handled inter-user name clashes.
  let finalName = trimmed;
  let result = null;
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
  if (!result) {
    return res.status(409).json({ error: 'Name collision — try a different name' });
  }
  if (wallet) {
    db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, result.id);
  }
  // Always set dex on new rows — not just when VALID. The default
  // 'pacifica' from the table DDL is a sensible fallback but we already
  // normalised requestedDex above so it's guaranteed valid.
  db.db.prepare('UPDATE players SET dex = ? WHERE id = ?').run(requestedDex, result.id);
  const state = db.getFullPlayerState(result.id);
  logAuth('Player registered', { name: finalName, wallet: wallet || null, dex: requestedDex });
  res.json({ ...state, token: result.token });
});

// Login (get state by token)
router.get('/players/me', auth, (req, res) => {
  const state = db.getFullPlayerState(req.player.id);
  res.json(state);
});

// Link a wallet to the current account. Per-DEX canonical: a wallet is
// allowed to be bound to MULTIPLE rows as long as those rows belong to
// different DEXes. Collision check therefore compares against rows on
// the SAME DEX as the current account — binding a wallet that's already
// the Avantis row of a different player still routes the client to that
// canonical row; binding one that only collides with this user's GMX row
// is fine.
router.post('/players/link-wallet', auth, (req, res) => {
  const { wallet } = req.body;
  if (!wallet || !isValidWallet(wallet)) return res.status(400).json({ error: 'Valid wallet required' });

  const current = req.player;
  // Same-DEX collision check. We exclude current.id so a no-op rebind
  // (already bound on this DEX to this user) doesn't trip the switch.
  const existing = (() => {
    const candidates = walletLookupCandidates(wallet);
    if (!candidates.length) return null;
    const placeholders = candidates.map(() => '?').join(',');
    return db.db.prepare(
      `SELECT * FROM players WHERE wallet IN (${placeholders}) AND dex = ? AND id != ? LIMIT 1`
    ).get(...candidates, current.dex, current.id);
  })();

  if (existing) {
    const state = db.getFullPlayerState(existing.id);
    logAuth('Wallet already linked to another account on same DEX; returning canonical token', {
      from_account: current.name, to_account: existing.name, wallet, dex: current.dex,
    });
    return res.json({
      success: true,
      switched_account: true,
      token: existing.token,
      ...state,
    });
  }

  db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, current.id);
  res.json({ success: true, switched_account: false });
});

// Login by wallet address. Per-DEX canonical: caller MUST pass `dex` so we
// can match the right row. Without dex we fall back to "any account this
// wallet owns" for back-compat with old clients (returns highest-trophy
// row). New clients always send dex — see useAuthFlow.js.
router.post('/players/login-wallet', (req, res) => {
  const { wallet, dex } = req.body;
  if (!wallet || !isValidWallet(wallet)) return res.status(400).json({ error: 'Valid wallet required' });

  let player;
  if (VALID_DEXES.has(dex)) {
    player = getPlayerByWalletAndDexAnyForm(wallet, dex);
  } else {
    player = getPlayerByWalletAnyForm(wallet);
  }
  if (!player) return res.status(404).json({ error: 'No account found for this wallet on this DEX' });
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
// Grid is 20x20 cells by design (matches client grid_width/grid_height).
// Cap coordinates server-side so a tampered client can't place buildings
// at grid_x=-999999 — would never collide with legitimate buildings and
// could be abused for defensive "hiding" or resource-locking exploits.
const GRID_MAX_COORD = 40; // generous ceiling; real grids are ≤20 per axis
router.post('/buildings/place', auth, (req, res) => {
  const { type, grid_x, grid_z, grid_index = 0 } = req.body;
  if (!type || grid_x == null || grid_z == null) {
    return res.status(400).json({ error: 'type, grid_x, grid_z are required' });
  }
  if (!Number.isInteger(grid_x) || !Number.isInteger(grid_z)) {
    return res.status(400).json({ error: 'grid_x and grid_z must be integers' });
  }
  if (grid_x < 0 || grid_x > GRID_MAX_COORD || grid_z < 0 || grid_z > GRID_MAX_COORD) {
    return res.status(400).json({ error: `grid_x and grid_z must be in [0, ${GRID_MAX_COORD}]` });
  }
  if (!Number.isInteger(grid_index) || grid_index < 0 || grid_index > 3) {
    return res.status(400).json({ error: 'grid_index must be 0..3' });
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
  if (grid_x < 0 || grid_x > GRID_MAX_COORD || grid_z < 0 || grid_z > GRID_MAX_COORD) {
    return res.status(400).json({ error: `grid_x and grid_z must be in [0, ${GRID_MAX_COORD}]` });
  }
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
const TROOP_NAME_MAP = {
  knight: 'Knight',
  mage: 'Mage',
  barbarian: 'Barbarian',
  archer: 'Archer',
  ranger: 'Ranger',
};
function _normalizeTroopName(name) {
  return TROOP_NAME_MAP[String(name || '').toLowerCase()] || String(name || '');
}
function _applyCasualties(playerId, casualties) {
  if (!casualties || typeof casualties !== 'object') return;

  // Count total deployed troops across all ships
  const ports = db.db.prepare('SELECT id, ship_troops, ship_troops_template FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(playerId, 'port');
  // Count from actual ship_troops (not template) — template may differ after swaps
  const deployed = {};
  for (const port of ports) {
    const troops = JSON.parse(port.ship_troops || '[]');
    for (const t of troops) {
      const name = _normalizeTroopName(t);
      deployed[name] = (deployed[name] || 0) + 1;
    }
  }

  // Cap casualties to deployed counts (prevent client from claiming more losses than deployed)
  const validCasualties = {};
  for (const [name, count] of Object.entries(casualties)) {
    if (typeof count !== 'number' || count <= 0) continue;
    const normalized = _normalizeTroopName(name);
    validCasualties[normalized] = Math.min(
      (validCasualties[normalized] || 0) + count,
      deployed[normalized] || 0
    );
  }

  const remaining = { ...validCasualties };
  for (const port of ports) {
    const troops = JSON.parse(port.ship_troops || '[]');
    const filtered = [];
    for (const t of troops) {
      const name = _normalizeTroopName(t);
      if (remaining[name] && remaining[name] > 0) {
        remaining[name]--;
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
    rallies: gameActions.filter(a => a.type === 'rally_drop').length,
    destroyed: verification.buildingsDestroyed,
  });
  console.log(`[BATTLE] ${claimedResult} by ${req.player.id} vs ${defender_id}: ${verification.reason} (TH ${Math.round((verification.townHallHpPct || 0) * 100)}%)`);
  console.log(`[BATTLE] Ships: ${gameActions.filter(a => a.type === 'place_ship').length}, Rallies: ${gameActions.filter(a => a.type === 'rally_drop').length}, Troops spawned: ${verification._troopsSpawned || '?'}, Buildings destroyed: ${verification.buildingsDestroyed}`);
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
    // Remove server-simulated casualties from attacker's ships. Real-time
    // /troop-died may already have removed some; _applyCasualties caps against
    // the current ship state, so the final submit is idempotent.
    _applyCasualties(req.player.id, verification.casualties);
    // Return authoritative post-casualty ship state so client can sync immediately
    return res.json({ ...battleResult, ships: _getShipsPayload(req.player.id), casualties: verification.casualties || {} });
  }

  // Defeat — attacker loses trophies, defender gains
  const defeatResult = db.battleDefeat(req.player.id, defender_id);
  db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'accepted', 'Defeat', null, verification);

  // Remove server-simulated casualties from attacker's ships.
  _applyCasualties(req.player.id, verification.casualties);

  res.json({
    success: true,
    loot: { gold: 0, wood: 0, ore: 0 },
    trophies: defeatResult.attackerTrophies,
    ships: _getShipsPayload(req.player.id),
    casualties: verification.casualties || {},
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
// Rate-limited: 5ms cooldown (was 500ms, bumped 100× per user request).
const _troopDiedTimestamps = {};
router.post('/troop-died', auth, (req, res) => {
  const now = Date.now();
  const last = _troopDiedTimestamps[req.player.id] || 0;
  if (now - last < 5) return res.status(429).json({ error: 'Too fast' });
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

// ==================== FUTURES MODE ====================
// Per-player UI mode for the futures panel. NULL until the user makes their
// first-time choice; then 'basic' or 'pro'. Choice is permanent unless the
// user explicitly switches via the profile toggle. Server is authoritative —
// the client checks on every load and shows the first-time selection screen
// when the value is NULL.

router.get('/players/futures-mode', auth, (req, res) => {
  const row = db.db.prepare('SELECT futures_mode FROM players WHERE id = ?').get(req.player.id);
  res.json({ mode: row?.futures_mode || null });
});

router.post('/players/futures-mode', auth, (req, res) => {
  const { mode } = req.body || {};
  if (mode !== 'basic' && mode !== 'pro') {
    return res.status(400).json({ error: "mode must be 'basic' or 'pro'" });
  }
  db.db.prepare('UPDATE players SET futures_mode = ? WHERE id = ?').run(mode, req.player.id);
  res.json({ mode });
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
const GOLD_PER_USD_VOLUME_DECIBEL = 10;
const GOLD_FIRST_DEPOSIT = 500;
const GOLD_FIRST_TRADE = 300;
const GOLD_DAILY_TRADE = 200;
const GOLD_PER_10_USD_PROFIT = 150; // +150 gold per $10 positive PnL

function volumeGoldForDex(dex, usdVolume) {
  const volume = Number(usdVolume);
  if (!Number.isFinite(volume) || volume <= 0) return 0;
  const rate = dex === 'decibel' ? GOLD_PER_USD_VOLUME_DECIBEL : GOLD_PER_USD_VOLUME;
  return Math.floor(volume * rate);
}

// Trading rewards table
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS trading_rewards (
      player_id    TEXT NOT NULL,
      dex          TEXT NOT NULL DEFAULT 'pacifica',
      wallet       TEXT NOT NULL,
      last_trade_id INTEGER NOT NULL DEFAULT 0,
      total_volume REAL NOT NULL DEFAULT 0,
      total_gold   INTEGER NOT NULL DEFAULT 0,
      first_deposit INTEGER NOT NULL DEFAULT 0,
      first_trade  INTEGER NOT NULL DEFAULT 0,
      last_daily   TEXT,
      pnl_gold_pool REAL NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (player_id, dex)
    )
  `);
} catch {}
try { db.db.exec(`ALTER TABLE trading_rewards ADD COLUMN pnl_gold_pool REAL NOT NULL DEFAULT 0`); } catch {}
try {
  const cols = db.db.prepare('PRAGMA table_info(trading_rewards)').all();
  const hasDex = cols.some(c => c.name === 'dex');
  const pkCols = cols.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
  if (!hasDex || pkCols.join(',') !== 'player_id,dex') {
    db.db.exec('DROP TABLE IF EXISTS trading_rewards_old_migrate');
    db.db.exec('ALTER TABLE trading_rewards RENAME TO trading_rewards_old_migrate');
    db.db.exec(`
      CREATE TABLE trading_rewards (
        player_id    TEXT NOT NULL,
        dex          TEXT NOT NULL DEFAULT 'pacifica',
        wallet       TEXT NOT NULL,
        last_trade_id INTEGER NOT NULL DEFAULT 0,
        total_volume REAL NOT NULL DEFAULT 0,
        total_gold   INTEGER NOT NULL DEFAULT 0,
        first_deposit INTEGER NOT NULL DEFAULT 0,
        first_trade  INTEGER NOT NULL DEFAULT 0,
        last_daily   TEXT,
        pnl_gold_pool REAL NOT NULL DEFAULT 0,
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (player_id, dex)
      )
    `);
    const oldCols = db.db.prepare('PRAGMA table_info(trading_rewards_old_migrate)').all();
    const oldHasDex = oldCols.some(c => c.name === 'dex');
    const dexExpr = oldHasDex
      ? "COALESCE(NULLIF(dex, ''), (SELECT p.dex FROM players p WHERE p.id = trading_rewards_old_migrate.player_id), 'pacifica')"
      : "COALESCE((SELECT p.dex FROM players p WHERE p.id = trading_rewards_old_migrate.player_id), 'pacifica')";
    db.db.exec(`
      INSERT OR REPLACE INTO trading_rewards (
        player_id, dex, wallet, last_trade_id, total_volume, total_gold,
        first_deposit, first_trade, last_daily, pnl_gold_pool, updated_at
      )
      SELECT
        player_id, ${dexExpr}, wallet, last_trade_id, total_volume, total_gold,
        first_deposit, first_trade, last_daily, COALESCE(pnl_gold_pool, 0), updated_at
      FROM trading_rewards_old_migrate
    `);
    db.db.exec('DROP TABLE trading_rewards_old_migrate');
  }
} catch (e) {
  console.warn('[trading_rewards] per-dex migration failed:', e.message);
}

// Rate limiter for claim-gold (max 1 per 250ms per player).
// Previously 5000ms, which was hit by legitimate new-account flows: on
// WebSocket reconnect Pacifica replays account_trades events for every open
// position, and the client debounces each to a claimGold() call 1s later —
// five existing trades = five calls within ~5s, so only one goes through and
// the other four return 429. The rate limit now stops only outright spam
// (>4/sec) while still allowing normal burst traffic. Still cheap server-
// side (claim-gold itself is rate-protected internally by last_trade_id
// transaction + gold_history UNIQUE dedup, so even rapid identical calls
// can't double-credit).
const CLAIM_COOLDOWN_MS = 25;  // bumped 250 → 25ms (100× more lenient) per user request — last_trade_id transaction still prevents double-credit
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
let _futuresDbUnavailableAt = 0;
function futuresDbReadonly() {
  if (_futuresDb === 'unavailable') {
    if (Date.now() - _futuresDbUnavailableAt < 30_000) return null;
    _futuresDb = null;
  }
  if (_futuresDb) return _futuresDb;
  try {
    const Database = require('better-sqlite3');
    const fpath = process.env.CLASH_FUTURES_DB || require('path').join(__dirname, '..', 'server-futures', 'futures.db');
    if (!require('fs').existsSync(fpath)) throw new Error('futures.db not found at ' + fpath);
    _futuresDb = new Database(fpath, { readonly: true, fileMustExist: true });
    try { _futuresDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.warn('[claim-gold] Avantis futures.db unavailable:', e.message);
    _futuresDb = 'unavailable';
    _futuresDbUnavailableAt = Date.now();
    return null;
  }
  return _futuresDb;
}

router.post('/trading/claim-gold', auth, async (req, res) => {
  // Rate limit
  const lastClaim = claimCooldowns.get(req.player.id);
  if (lastClaim && Date.now() - lastClaim < CLAIM_COOLDOWN_MS) {
    return res.status(429).json({ gold: 0, reason: 'Please wait before claiming again' });
  }
  claimCooldowns.set(req.player.id, Date.now());
  const wallet = req.body.wallet || req.player.wallet;
  const playerDex = VALID_DEXES.has(String(req.player.dex || '').toLowerCase())
    ? String(req.player.dex).toLowerCase()
    : 'pacifica';
  const requestedDex = req.body.dex == null ? playerDex : String(req.body.dex).toLowerCase();
  if (!VALID_DEXES.has(requestedDex)) {
    return res.status(400).json({ error: 'Invalid dex' });
  }
  if (requestedDex !== playerDex) {
    return res.status(409).json({
      error: `Account is registered for '${playerDex}'. Switch DEX before claiming ${requestedDex} rewards.`,
      dex: playerDex,
    });
  }
  const dex = playerDex;

  // Auto-replace Farcaster `fc_<fid>` placeholder wallets with the real
  // address from the request body. The placeholder is stored by older
  // FC auto-register paths when an EVM provider wasn't yet available;
  // left uncorrected it blocks task verifiers from finding real trades
  // (resolveWallet returns null for non-Solana/non-EVM strings) and
  // makes trading_rewards.wallet useless.
  const isPlaceholderWallet = (w) => typeof w === 'string' && /^fc_/i.test(w);
  if (isValidWallet(wallet) && isPlaceholderWallet(req.player.wallet)) {
    try {
      db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, req.player.id);
      db.db.prepare('UPDATE trading_rewards SET wallet = ? WHERE player_id = ? AND dex = ?').run(wallet, req.player.id, dex);
      console.log(`[claim-gold] replaced placeholder ${req.player.wallet} with real wallet ${wallet} for player ${req.player.id}`);
    } catch { /* non-fatal */ }
  }

  // ── Self-custody DEXes (Avantis on Base, Decibel on Aptos, GMX on
  // Arbitrum) ── Both Avantis and Decibel already write verified rows into
  // futures.db trade_history via their dedicated rewards-workers; GMX rides
  // the same query but has no worker yet (Phase 3). Until the GMX events
  // indexer ships, the trade_history query returns 0 rows and the user
  // simply gets "No new trades" — that's the desired no-op, NOT a fall-
  // through to the Pacifica branch which would 400 with "wallet required"
  // or worse, hit Pacifica's REST with a non-Solana address.
  if (dex === 'avantis' || dex === 'decibel' || dex === 'gmx') {
    const fdb = futuresDbReadonly();
    if (!fdb) {
      return res.json({ gold: 0, reason: 'Futures service unavailable — try again later' });
    }
    let reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    if (!reward) {
      db.db.prepare('INSERT INTO trading_rewards (player_id, dex, wallet) VALUES (?, ?, ?)').run(req.player.id, dex, wallet || '');
      reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    }
    let newTrades = [];
    try {
      const sourceClause = dex === 'decibel'
        ? "AND verified_source IN ('worker', 'server')"
        : "AND verified_source = 'worker'";
      newTrades = fdb.prepare(`
        SELECT id, symbol, side, amount, notional_usd, status, created_at
        FROM trade_history
        WHERE player_id = ? AND dex = ? AND status = 'filled'
          ${sourceClause} AND id > ?
        ORDER BY id ASC
      `).all(req.player.id, dex, reward.last_trade_id || 0);
    } catch (e) {
      console.warn(`[claim-gold] ${dex} verified trade query failed:`, e.message);
      return res.json({ gold: 0, reason: 'Futures trade verifier unavailable - try again later', dex });
    }

    if (newTrades.length === 0 && reward.first_deposit && reward.first_trade) {
      return res.json({ gold: 0, reason: 'No new trades' });
    }

    // Sanity: clamp each trade's notional to a sane range so a bugged/forged
    // row (e.g. Infinity from parseFloat("1e100")) cannot mint unlimited gold.
    // Also require a realistic minimum — Avantis min notional is $100.
    const SANE_MIN_NOTIONAL = dex === 'decibel' ? 1 : 50;
    const SANE_MAX_NOTIONAL = 10_000_000;

    let totalGold = 0;
    const reasons = [];
    let maxId = reward.last_trade_id || 0;
    let newVolume = 0;
    let creditedTrades = 0;
    // Track opens separately — "first_trade" bonus should only fire on an
    // actual OPEN (long/short), not on a close-only sequence. Previously a
    // user who closed a pre-reward position without ever opening a new one
    // qualified for the 300-gold bonus. `side` values from the worker are
    // 'long' / 'short' for opens and 'close_long' / 'close_short' for closes.
    let creditedOpens = 0;
    for (const t of newTrades) {
      const raw = Number(t.notional_usd);
      if (!Number.isFinite(raw) || raw < SANE_MIN_NOTIONAL || raw > SANE_MAX_NOTIONAL) {
        if (t.id > maxId) maxId = t.id; // still advance cursor to skip it
        continue;
      }
      newVolume += raw;
      totalGold += volumeGoldForDex(dex, raw);
      creditedTrades++;
      const sideLower = String(t.side || '').toLowerCase();
      if (sideLower === 'long' || sideLower === 'short' || sideLower === 'bid' || sideLower === 'ask') {
        creditedOpens++;
      }
      if (t.id > maxId) maxId = t.id;
    }
    if (creditedTrades > 0) reasons.push(`${creditedTrades} trades`);

    // GOLD_FIRST_DEPOSIT: only award once the player has ALSO completed their
    // first real trade. Previously it was granted unconditionally on the first
    // /claim-gold call, letting a brand-new account farm 500 gold without
    // ever depositing or trading.
    //
    // Additional guard: audit gold_history for a prior grant. If an admin
    // resets `trading_rewards.first_deposit=0` (or the row gets deleted and
    // recreated), the flag-based check re-fires and the bonus pays again.
    // Checking gold_history defends against that by making the bonus truly
    // once-per-player.
    //
    // first_trade gate: `creditedOpens > 0` rather than all trades, so close-
    // only activity doesn't trigger the opening bonus.
    const hasRealOpen = creditedOpens > 0 || reward.first_trade;
    const priorBonuses = db.db.prepare(
      "SELECT reason FROM gold_history WHERE player_id = ? AND (reason LIKE '%First deposit!%' OR reason LIKE '%First trade!%')"
    ).all(req.player.id);
    const alreadyPaidFirstDeposit = priorBonuses.some(r => String(r.reason).includes('First deposit!'));
    const alreadyPaidFirstTrade   = priorBonuses.some(r => String(r.reason).includes('First trade!'));
    if (!reward.first_deposit && !alreadyPaidFirstDeposit && hasRealOpen) { totalGold += GOLD_FIRST_DEPOSIT; reasons.push('First deposit!'); }
    if (!reward.first_trade && !alreadyPaidFirstTrade && creditedOpens > 0) { totalGold += GOLD_FIRST_TRADE; reasons.push('First trade!'); }
    const today = new Date().toISOString().split('T')[0];
    if (reward.last_daily !== today && creditedTrades > 0) { totalGold += GOLD_DAILY_TRADE; reasons.push('Daily bonus'); }

    // All writes wrapped in a transaction so two concurrent /claim-gold
    // requests from the same player can't both read the same last_trade_id
    // and double-credit overlapping trades. The transaction also guarantees
    // the UPDATE + addResources + gold_history INSERT stay in sync (prior
    // code's trailing try/catch on gold_history could leave total_gold
    // incremented without a history row).
    //
    // Inside the transaction we re-read last_trade_id and short-circuit if
    // it moved past our cursor — a sibling request just processed these
    // trades. `better-sqlite3` transactions are synchronous so this
    // "compare-and-set" is atomic.
    const creditTxn = db.db.transaction(() => {
      const fresh = db.db.prepare('SELECT last_trade_id FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
      const expectedLastId = reward.last_trade_id || 0;
      const actualLastId = (fresh && fresh.last_trade_id) || 0;
      if (actualLastId !== expectedLastId) {
        return { raced: true };
      }
      db.db.prepare(`
        UPDATE trading_rewards SET
          last_trade_id = ?, total_volume = total_volume + ?, total_gold = total_gold + ?,
          first_deposit = CASE WHEN ? > 0 OR first_trade = 1 THEN 1 ELSE first_deposit END,
          first_trade = CASE WHEN ? > 0 THEN 1 ELSE first_trade END,
          last_daily = CASE WHEN ? > 0 THEN ? ELSE last_daily END,
          updated_at = datetime('now')
        WHERE player_id = ? AND dex = ?
      `).run(maxId, newVolume, totalGold, creditedOpens, creditedOpens, creditedTrades, today, req.player.id, dex);
      if (totalGold > 0) {
        db.addResources(req.player.id, totalGold, 0, 0);
        // Record the payout in gold_history so ProfileModal's trading-stats
        // timeline shows the same ledger as Pacifica. Reason must contain
        // "trade" / "profit" / "daily" / "deposit" / "volume" for the
        // daily_trade_gold task verifier's heuristic (see tasks.js).
        db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)')
          .run(req.player.id, totalGold, reasons.join(' + ') || 'Trading reward');
      }
      return { raced: false };
    });

    const txnResult = creditTxn();
    if (txnResult.raced) {
      return res.json({ gold: 0, reason: 'Already claimed by parallel request', dex });
    }
    if (totalGold > 0) {
      return res.json({ gold: totalGold, reason: reasons.join(' + ') || 'Trading reward', dex });
    }
    return res.json({ gold: 0, reason: newTrades.length ? 'Below reward threshold' : 'No new trades', dex });
  }

  // ── Pacifica branch (existing, unchanged) ──
  if (!wallet) return res.status(400).json({ error: 'wallet required — connect wallet in profile' });

  try {
    // Get or create reward record
    let reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    if (!reward) {
      db.db.prepare('INSERT INTO trading_rewards (player_id, dex, wallet) VALUES (?, ?, ?)').run(req.player.id, dex, wallet);
      reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
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
      totalGold += volumeGoldForDex('pacifica', volume);
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

    // First deposit / first trade bonuses — once per player forever.
    // Both the flag AND a gold_history audit must say "never paid". If an
    // admin resets trading_rewards.first_deposit=0, the gold_history check
    // still blocks a repeat payout.
    const priorBonusesPac = db.db.prepare(
      "SELECT reason FROM gold_history WHERE player_id = ? AND (reason LIKE '%First deposit!%' OR reason LIKE '%First trade!%')"
    ).all(req.player.id);
    const alreadyPaidFirstDepositPac = priorBonusesPac.some(r => String(r.reason).includes('First deposit!'));
    const alreadyPaidFirstTradePac   = priorBonusesPac.some(r => String(r.reason).includes('First trade!'));
    if (!reward.first_deposit && !alreadyPaidFirstDepositPac) {
      totalGold += GOLD_FIRST_DEPOSIT;
      reasons.push('First deposit!');
    }
    if (!reward.first_trade && !alreadyPaidFirstTradePac && newTrades.length > 0) {
      totalGold += GOLD_FIRST_TRADE;
      reasons.push('First trade!');
    }

    // Daily bonus
    const today = new Date().toISOString().split('T')[0];
    if (reward.last_daily !== today && newTrades.length > 0) {
      totalGold += GOLD_DAILY_TRADE;
      reasons.push('Daily bonus');
    }

    // Atomic write: guard against two concurrent /claim-gold requests both
    // reading the same last_trade_id and crediting overlapping trades.
    // Inside the transaction we re-read the cursor — if another request
    // advanced it, abort gracefully.
    const newVolume = newTrades.reduce((s, t) => s + parseFloat(t.price || 0) * parseFloat(t.amount || 0), 0);
    const creditTxnPac = db.db.transaction(() => {
      const fresh = db.db.prepare('SELECT last_trade_id FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
      const expectedLastId = reward.last_trade_id || 0;
      const actualLastId = (fresh && fresh.last_trade_id) || 0;
      if (actualLastId !== expectedLastId) {
        return { raced: true };
      }
      const insertTrade = db.db.prepare('INSERT OR IGNORE INTO player_trades (player_id, history_id, symbol, price, amount, fee) VALUES (?, ?, ?, ?, ?, ?)');
      for (const t of newTrades) {
        insertTrade.run(req.player.id, t.history_id, t.symbol || '?', t.price || '0', t.amount || '0', t.builder_fee || '0');
      }
      db.db.prepare(`
        UPDATE trading_rewards SET
          last_trade_id = ?, total_volume = total_volume + ?, total_gold = total_gold + ?,
          first_deposit = 1, first_trade = CASE WHEN ? > 0 THEN 1 ELSE first_trade END,
          last_daily = ?, pnl_gold_pool = ?, updated_at = datetime('now')
        WHERE player_id = ? AND dex = ?
      `).run(maxTradeId, newVolume, totalGold, newTrades.length, today, pnlPool, req.player.id, dex);
      if (totalGold > 0) {
        db.addResources(req.player.id, totalGold, 0, 0);
        const reason = reasons.join(' + ') || 'Trading reward';
        db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)').run(req.player.id, totalGold, reason);
      }
      return { raced: false };
    });
    const txnResPac = creditTxnPac();
    if (txnResPac.raced) {
      return res.json({ gold: 0, reason: 'Already claimed by parallel request' });
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
    CREATE INDEX IF NOT EXISTS idx_gold_history_player ON gold_history(player_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_player_trades_player ON player_trades(player_id, created_at);
  `);
} catch { /* non-fatal on first boot */ }

// Get trading reward stats + gold history + trade history from Pacifica
router.get('/trading/stats', auth, async (req, res) => {
  const dex = VALID_DEXES.has(String(req.player.dex || '').toLowerCase())
    ? String(req.player.dex).toLowerCase()
    : 'pacifica';
  const reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
  const goldHistory = db.db.prepare('SELECT amount, reason, created_at FROM gold_history WHERE player_id = ? ORDER BY created_at DESC LIMIT 50').all(req.player.id);

  // Trade list source depends on DEX: Pacifica stores a synced copy in the
  // main DB's `player_trades`, Avantis lives in server-futures/futures.db
  // (trade_history). We normalise both into the same { symbol, price,
  // amount, fee, created_at } shape so ProfileModal renders uniformly.
  let trades = [];
  if (dex === 'avantis' || dex === 'decibel') {
    const fdb = futuresDbReadonly();
    if (fdb) {
      try {
        const sourceClause = dex === 'decibel'
          ? "AND verified_source IN ('worker', 'server')"
          : "AND verified_source = 'worker'";
        const rows = fdb.prepare(`
          SELECT symbol, side, price, amount, notional_usd, order_type, status, created_at
          FROM trade_history
          WHERE player_id = ? AND dex = ? AND status = 'filled'
            ${sourceClause}
          ORDER BY id DESC
          LIMIT 50
        `).all(req.player.id, dex);
        trades = rows.map(r => ({
          symbol: r.symbol,
          side: r.side,
          // For Avantis the on-chain trade row has `amount` = collateral and
          // `notional_usd` = amount × leverage. ProfileModal shows "price *
          // amount" as the trade value so we surface notional_usd as the
          // "price" column and amount=1 to keep the product correct.
          price: String(r.notional_usd || 0),
          amount: '1',
          fee: 0,
          order_type: r.order_type,
          created_at: r.created_at,
        }));
      } catch (e) {
        console.warn(`[trading/stats] ${dex} futures.db read failed:`, e.message);
      }
    }
  } else {
    trades = db.db.prepare(
      'SELECT symbol, price, amount, fee, created_at FROM player_trades WHERE player_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.player.id);
  }

  res.json({
    ...(reward || { total_volume: 0, total_gold: 0 }),
    gold_history: goldHistory,
    trades,
    dex,
  });
});

// ==================== TASKS (QUESTS) ====================

// Rate-limit tasks endpoints per player (2s)
const taskRateLimit = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [k, v] of taskRateLimit) if (v < cutoff) taskRateLimit.delete(k);
}, 600000);

// Per-player gate for task endpoints. Default 20ms (was 2000ms — bumped
// 100× more lenient per user request). The endpoints below pass shorter
// values (e.g. 500 → 5) which scale with the same factor automatically.
// SQLite-backed task progress is idempotent so spam is safe.
function rateGate(playerId, ms = 20) {
  const effective = Math.max(0, Math.floor(ms / 100));
  if (effective === 0) return true;
  const last = taskRateLimit.get(playerId);
  if (last && Date.now() - last < effective) return false;
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

  // Always update cached progress (progress update is an independent fact,
  // kept outside the payout txn so it lands even if the completion check
  // fails or the atomic claim loses a race).
  db.db.prepare(
    `UPDATE player_tasks SET progress_value = ?, target_value = ?, progress = ? WHERE player_id = ? AND task_id = ?`
  ).run(result.progress_value, result.target_value, result.target_value > 0 ? Math.min(1, result.progress_value / result.target_value) : 0, req.player.id, id);

  if (!result.completed) {
    return res.json({ ok: false, completed: false, progress_value: result.progress_value, target_value: result.target_value, breakdown: result.breakdown });
  }
  const nextRepeatableSnapshot = task.repeatable ? await tasks.buildSnapshot(req.player, task) : null;

  // Atomic payout: re-check claimed_at inside the transaction so two
  // concurrent /tasks/:id/claim calls can't both pass canClaim() and
  // double-pay. Previously the rate-limiter's 3s gate was the only guard;
  // two requests arriving within ~ms of each other would both credit.
  const payout = db.db.transaction(() => {
    const latest = db.db.prepare('SELECT claimed_at FROM player_tasks WHERE player_id = ? AND task_id = ?').get(req.player.id, id);
    // For one-shot tasks: if claimed_at already set by a racing request,
    // abort. For repeatable tasks: if claimed_at advanced since we started,
    // the cooldown check we did earlier is stale — abort and let user
    // re-submit rather than risk a duplicate payout within the cooldown.
    if (latest && latest.claimed_at && (!task.repeatable || latest.claimed_at !== pt.claimed_at)) {
      return { raced: true };
    }
    db.addResources(req.player.id, task.reward_gold || 0, task.reward_wood || 0, task.reward_ore || 0);
    if (task.reward_gold > 0) {
      db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)')
        .run(req.player.id, task.reward_gold, `Quest: ${task.title}`);
    }
    if (task.repeatable) {
      db.db.prepare(`
        UPDATE player_tasks
        SET claimed_at = datetime('now'),
            snapshot = ?,
            progress = 0,
            progress_value = 0,
            target_value = ?
        WHERE player_id = ? AND task_id = ?
      `).run(JSON.stringify(nextRepeatableSnapshot || {}), result.target_value || 0, req.player.id, id);
    } else {
      db.db.prepare(`UPDATE player_tasks SET claimed_at = datetime('now') WHERE player_id = ? AND task_id = ?`).run(req.player.id, id);
    }
    return { raced: false };
  });
  const payoutRes = payout();
  if (payoutRes.raced) {
    return res.status(409).json({ error: 'Already claimed by parallel request' });
  }

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
  // Bumped 10/min → 1000/min (100× more lenient) per user request. The
  // backing OpenAI / Elfa upstream still has its own quota — that's the
  // real cost gate, not this in-process counter.
  const now = Date.now();
  const arr = (explainRate.get(playerId) || []).filter(t => now - t < 60000);
  if (arr.length >= 1000) return false;
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
    SELECT id, name, trophies, level, gold, wood, ore, wallet, dex,
           futures_mode, tutorial_flags,
           shield_until, last_attacked_by, last_attacked_at, created_at,
           last_seen_at
    FROM players ORDER BY trophies DESC
  `).all();
  // Pull per-player trading rewards in one shot so the UI can show gold
  // earned from trading next to each row (no N+1 query).
  const rewardsMap = {};
  try {
    const rewards = db.db.prepare(`
      SELECT player_id,
             COALESCE(SUM(total_gold), 0) AS total_gold,
             COALESCE(SUM(total_volume), 0) AS total_volume,
             MAX(last_daily) AS last_daily
      FROM trading_rewards
      GROUP BY player_id
    `).all();
    for (const r of rewards) rewardsMap[r.player_id] = r;
  } catch { /* trading_rewards missing on fresh DB */ }
  res.json(players.map(p => {
    const tr = rewardsMap[p.id];
    // Online = heartbeat within the past 5 min. Same window as the
    // /admin/stats counter so the row badge agrees with the headline
    // number. SQLite returns last_seen_at as "YYYY-MM-DD HH:MM:SS" UTC
    // which `new Date(... + 'Z')` parses correctly cross-browser.
    const lastSeenMs = p.last_seen_at ? new Date(p.last_seen_at + 'Z').getTime() : 0;
    const ageMs = lastSeenMs ? (Date.now() - lastSeenMs) : Infinity;
    return {
      ...p,
      dex: p.dex || null,
      // futures_mode: 'pro' | 'basic' | null. NULL means user has not yet
      // made the first-time selection (haven't opened the futures panel
      // since the feature shipped).
      futures_mode: p.futures_mode || null,
      shield_active: p.shield_until && new Date(p.shield_until + 'Z') > new Date(),
      shield_remaining: p.shield_until ? Math.max(0, Math.round((new Date(p.shield_until + 'Z') - new Date()) / 60000)) : 0,
      buildings_count: db.db.prepare('SELECT COUNT(*) as c FROM buildings WHERE player_id = ?').get(p.id).c,
      trading_gold: tr?.total_gold || 0,
      trading_volume: tr?.total_volume || 0,
      trading_last_daily: tr?.last_daily || null,
      // Heartbeat-derived presence flags. Computed server-side so the
      // panel JS doesn't have to re-implement the same time math 5 places.
      online: ageMs <= 5 * 60 * 1000,
      active_24h: ageMs <= 24 * 60 * 60 * 1000,
      active_7d:  ageMs <= 7 * 24 * 60 * 60 * 1000,
      // Surface the raw last-seen so the panel can render "5 min ago"
      // tooltips. null when player has never been seen on the new column
      // (fresh accounts or accounts that haven't logged in since deploy).
      last_seen_age_sec: lastSeenMs ? Math.floor(ageMs / 1000) : null,
    };
  }));
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
  const topPlayers = db.db.prepare('SELECT name, trophies, gold, wood, ore, dex FROM players ORDER BY trophies DESC LIMIT 10').all();

  // DEX breakdown — aggregate by players.dex so we can show Pacifica vs
  // Avantis adoption / volume / gold distribution side by side. Guarded
  // against an empty trading_rewards table on fresh DBs.
  const byDex = db.db.prepare(`
    SELECT COALESCE(dex, 'unknown') AS dex, COUNT(*) AS n
    FROM players GROUP BY dex
  `).all();

  // Futures UI mode breakdown — Pro vs Basic vs not-yet-picked. Mirrors
  // the byDex shape so the admin UI can render it the same way.
  let byUiMode = [];
  try {
    byUiMode = db.db.prepare(`
      SELECT COALESCE(futures_mode, 'none') AS mode, COUNT(*) AS n
      FROM players GROUP BY futures_mode
    `).all();
  } catch { /* futures_mode column may not exist on a very old DB */ }
  let rewardsByDex = [];
  try {
    rewardsByDex = db.db.prepare(`
      SELECT COALESCE(r.dex, 'unknown') AS dex,
             COUNT(r.player_id) AS traders,
             COALESCE(SUM(r.total_gold), 0) AS total_gold,
             COALESCE(SUM(r.total_volume), 0) AS total_volume
      FROM trading_rewards r
      LEFT JOIN players p ON p.id = r.player_id
      GROUP BY r.dex
    `).all();
  } catch { /* trading_rewards missing */ }

  // Per-DEX trade activity from server-futures.trade_history. We compute
  // the same shape (total_trades / active_traders / total_volume /
  // trades_24h) for every DEX whose worker indexes into the futures DB.
  // Pacifica is intentionally absent from this set — it's custodial and
  // the futures worker doesn't index its trades the same way; Pacifica
  // activity comes through the on-chain Solana RPC path elsewhere.
  const ACTIVITY_DEXES = ['avantis', 'decibel', 'gmx'];
  const dexActivity = {};   // { avantis: {...}, decibel: {...}, gmx: {...} }
  const dexTop = {};        // { avantis: [...], decibel: [...], gmx: [...] }
  try {
    const fdb = futuresDbReadonly();
    if (fdb) {
      const totals = fdb.prepare(`
        SELECT COUNT(*) AS trades,
               COUNT(DISTINCT player_id) AS traders,
               COALESCE(SUM(notional_usd), 0) AS volume
        FROM trade_history WHERE dex = ? AND status = 'filled' AND verified_source = 'worker'
      `);
      const recent = fdb.prepare(`
        SELECT COUNT(*) AS trades FROM trade_history
        WHERE dex = ? AND status = 'filled' AND verified_source = 'worker'
          AND created_at > datetime('now', '-24 hours')
      `);
      const top = fdb.prepare(`
        SELECT player_id, COALESCE(SUM(notional_usd), 0) AS vol, COUNT(*) AS trades
        FROM trade_history WHERE dex = ? AND status = 'filled' AND verified_source = 'worker'
        GROUP BY player_id ORDER BY vol DESC LIMIT 10
      `);
      const nameLookup = db.db.prepare('SELECT name, wallet FROM players WHERE id = ?');
      for (const dex of ACTIVITY_DEXES) {
        const tot = totals.get(dex) || {};
        const rec = recent.get(dex) || {};
        dexActivity[dex] = {
          total_trades: tot.trades || 0,
          active_traders: tot.traders || 0,
          total_volume: tot.volume || 0,
          trades_24h: rec.trades || 0,
        };
        const raw = top.all(dex);
        dexTop[dex] = raw.map(r => {
          const p = nameLookup.get(r.player_id) || {};
          return {
            player_id: r.player_id,
            name: p.name || '?',
            wallet: p.wallet || '',
            volume: r.vol,
            trades: r.trades,
          };
        });
      }
    }
  } catch { /* futures unavailable */ }

  // Active-player counters from the heartbeat column. "Online now" =
  // last_seen within the past 5 minutes (matches how the auth middleware
  // throttles bumps to once per 60s — at 5 min the worst-case staleness
  // is ~6 min, plenty for live admin oversight). 24h / 7d are the
  // standard MAU-style retention buckets.
  const activeQ = db.db.prepare(`
    SELECT
      COUNT(CASE WHEN last_seen_at > datetime('now', '-5 minutes')  THEN 1 END) AS online_now,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-24 hours')   THEN 1 END) AS active_24h,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-7 days')     THEN 1 END) AS active_7d,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-30 days')    THEN 1 END) AS active_30d
    FROM players WHERE last_seen_at IS NOT NULL
  `).get();

  // Same buckets sliced by DEX so the panel can show "active Pacifica
  // players today" vs "active GMX players today" and we can spot when a
  // newly-added DEX is actually getting traction.
  const activeByDex = db.db.prepare(`
    SELECT COALESCE(dex, 'unknown') AS dex,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-5 minutes')  THEN 1 END) AS online_now,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-24 hours')   THEN 1 END) AS active_24h,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-7 days')     THEN 1 END) AS active_7d
    FROM players WHERE last_seen_at IS NOT NULL
    GROUP BY dex
  `).all();

  res.json({
    players: playerCount, buildings: buildingCount, replays: replayCount,
    accepted, rejected, shielded, recentBattles,
    economy: { totalGold, totalWood, totalOre },
    topPlayers,
    activity: {
      online_now: activeQ?.online_now || 0,
      active_24h: activeQ?.active_24h || 0,
      active_7d:  activeQ?.active_7d  || 0,
      active_30d: activeQ?.active_30d || 0,
      by_dex: activeByDex,
    },
    dex: {
      players_by_dex: byDex,
      rewards_by_dex: rewardsByDex,
      // New unified shape: per-DEX activity + top traders. Old
      // `avantis_activity` / `avantis_top` kept as aliases for one release
      // so the deployed admin panel doesn't blank out mid-deploy.
      activity_by_dex: dexActivity,
      top_by_dex: dexTop,
      avantis_activity: dexActivity.avantis || null,
      avantis_top: dexTop.avantis || [],
    },
    ui_modes: byUiMode,
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
