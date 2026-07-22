const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const {
  CANONICAL_GRID_CONFIG,
  TROOP_STATS,
  computeDemonKingStats,
  DEFENSE_STATS,
  SKELETON_GUARD,
} = require('./combat_defs');
const {
  CANONICAL_GRID_CONFIGS,
  COMBAT_GRID_VERSION,
} = require('./combat_grid_config');
const {
  MATCHMAKING_CONFIG,
  buildBotBaseTemplates,
} = require('./matchmaking_defs');
const uuidv4 = () => crypto.randomUUID();

const DB_PATH = process.env.CLASH_MAIN_DB || path.join(__dirname, 'clash.db');

function raidBotTargetsEnabled() {
  const raw = String(process.env.CLASH_RAID_BOT_TARGETS_ENABLED || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- Schema ----------

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    token      TEXT NOT NULL UNIQUE,
    gold       INTEGER NOT NULL DEFAULT 4000,
    wood       INTEGER NOT NULL DEFAULT 4000,
    ore        INTEGER NOT NULL DEFAULT 4000,
    trophies   INTEGER NOT NULL DEFAULT 0,
    level      INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS buildings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    grid_x      INTEGER NOT NULL,
    grid_z      INTEGER NOT NULL,
    grid_index  INTEGER NOT NULL DEFAULT 0,
    hp          INTEGER NOT NULL,
    max_hp      INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(player_id, grid_x, grid_z, grid_index)
  );

  CREATE TABLE IF NOT EXISTS troop_levels (
    player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    troop_type TEXT NOT NULL,
    level      INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (player_id, troop_type)
  );

  CREATE TABLE IF NOT EXISTS altar_skill_levels (
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    skill_id  TEXT NOT NULL,
    level     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, skill_id)
  );

  CREATE TABLE IF NOT EXISTS player_ships (
    player_id            TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    level                INTEGER NOT NULL DEFAULT 1,
    troops               TEXT NOT NULL DEFAULT '[]',
    troop_template       TEXT NOT NULL DEFAULT '[]',
    capacity_override    INTEGER NOT NULL DEFAULT 0,
    migration_json       TEXT,
    migrated_from_ports_at TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Safe migrations
try { db.exec(`ALTER TABLE buildings ADD COLUMN last_collected_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN wallet TEXT`); } catch {}
try { db.exec(`ALTER TABLE buildings ADD COLUMN has_ship INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE buildings ADD COLUMN ship_troops TEXT NOT NULL DEFAULT '[]'`); } catch {}
try { db.exec(`ALTER TABLE buildings ADD COLUMN ship_troops_template TEXT NOT NULL DEFAULT '[]'`); } catch {}
// Shield: protects from attacks after being raided
try { db.exec(`ALTER TABLE players ADD COLUMN shield_until TEXT`); } catch {}
// Attack cooldown: prevent re-attacking same player
try { db.exec(`ALTER TABLE players ADD COLUMN last_attacked_by TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN last_attacked_at TEXT`); } catch {}
// Surrender stamp: when an attacker bails on a battle without finishing it,
// we record the surrender on their session row (instead of writing a fake
// battle_replays entry). The matchmaker reads this column to enforce the
// 24h personal cooldown on surrendered defenders.
try { db.exec(`ALTER TABLE battle_sessions ADD COLUMN surrendered_at TEXT`); } catch {}
// Tutorial progress: bitmask of completed tutorial phases
try { db.exec(`ALTER TABLE players ADD COLUMN tutorial_flags INTEGER NOT NULL DEFAULT 0`); } catch {}
// DEX preference: 'pacifica' (Solana) or 'avantis' (Base). Chosen at register time.
try { db.exec(`ALTER TABLE players ADD COLUMN dex TEXT NOT NULL DEFAULT 'pacifica'`); } catch {}
// Futures UI mode: 'basic' (simplified UI for new traders) or 'pro' (full
// feature set). NULL = user has not chosen yet → client shows the
// first-time selection screen before letting them trade. Selection is
// persisted server-side so it survives device/browser swaps.
try { db.exec(`ALTER TABLE players ADD COLUMN futures_mode TEXT`); } catch {}
// Last-seen heartbeat: bumped to `datetime('now')` by the `auth` middleware
// on every authenticated API call. Drives the admin panel's "Online now"
// (last_seen_at > now-5min), "Active 24h", and "Active 7d" counters.
// Replaces the WebSocket-based `getOnlinePlayers()` path which was never
// wired up on the client (Godot/React app doesn't open the /ws socket),
// so the WS clients map stayed empty and admin always showed everyone
// offline.
try { db.exec(`ALTER TABLE players ADD COLUMN last_seen_at TEXT`); } catch {}

// Security migration ledger for one-shot incident response mutations.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_migrations (
      key        TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch (e) { console.warn('[db] security_migrations migration:', e.message); }

// 2026-06-21: wallet auth used to issue player tokens by wallet+dex without
// a wallet signature. Rotate all existing session tokens once so any token
// minted through that legacy flow becomes invalid after the security deploy.
try {
  const migrationKey = 'rotate-player-tokens-wallet-auth-proof-2026-06-21';
  const applied = db.prepare('SELECT key FROM security_migrations WHERE key = ?').get(migrationKey);
  if (!applied) {
    const players = db.prepare('SELECT id FROM players').all();
    const rotateTokens = db.transaction((rows) => {
      const update = db.prepare('UPDATE players SET token = ? WHERE id = ?');
      for (const row of rows) update.run(uuidv4(), row.id);
      db.prepare('INSERT INTO security_migrations (key) VALUES (?)').run(migrationKey);
    });
    rotateTokens(players);
    console.warn(`[db] rotated ${players.length} player session tokens for wallet-auth proof migration`);
  }
} catch (e) { console.warn('[db] player token security rotation failed:', e.message); }
// Seeker/Saga device capability. The browser can only persist the Solana
// Mobile signal and optional .skr handle; a cryptographic SGT ownership check
// can be layered on later if tournaments need hard anti-spoofing.
try { db.exec(`ALTER TABLE players ADD COLUMN is_seeker INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN seeker_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN seeker_source TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN seeker_detected_at TEXT`); } catch {}
// Base NFT gold boost. Verified server-side by wallet signature + ERC-721
// balance check, then read by the trading reward claim path.
try { db.exec(`ALTER TABLE players ADD COLUMN nft_gold_boost_wallet TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN nft_gold_boost_contract TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN nft_gold_boost_verified_at TEXT`); } catch {}
// PvP win counter. Used by Demon King NFT-backed progression gates.
try { db.exec(`ALTER TABLE players ADD COLUMN battle_wins INTEGER NOT NULL DEFAULT 0`); } catch {}
// Server-generated raid targets. Only the selected bot template is materialized
// as a temporary marked player so the existing battle verifier, building
// loader, and resource transfer paths stay compatible with client expectations.
try { db.exec(`ALTER TABLE players ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN bot_difficulty TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN bot_variant INTEGER`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN bot_generation TEXT`); } catch {}
// Account moderation. Banned accounts keep their rows for auditability but
// cannot authenticate or receive token-bearing login responses.
try { db.exec(`ALTER TABLE players ADD COLUMN banned_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN banned_reason TEXT`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN banned_by TEXT`); } catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_name_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      old_name      TEXT NOT NULL,
      new_name      TEXT NOT NULL,
      source        TEXT,
      changed_by    TEXT,
      metadata_json TEXT,
      changed_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_player_name_history_player
      ON player_name_history(player_id, changed_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_player_name_history_names
      ON player_name_history(old_name, new_name);
  `);
} catch (e) {
  console.warn('[db] player_name_history migration warning:', e.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_blacklist (
      wallet     TEXT PRIMARY KEY,
      chain_type TEXT,
      reason     TEXT,
      player_id  TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_blacklist_player
      ON wallet_blacklist(player_id);
  `);
} catch (e) {
  console.warn('[db] wallet blacklist migration warning:', e.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mm_bot_access (
      player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      enabled    INTEGER NOT NULL DEFAULT 1,
      note       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mm_bot_access_enabled
      ON mm_bot_access(enabled, updated_at);
  `);
} catch (e) {
  console.warn('[db] mm_bot_access migration warning:', e.message);
}

// Unified account identity layer. The legacy `players.wallet` and
// `players.dex` columns remain for compatibility, but new auth paths should
// treat one player row as the canonical game account and attach wallets /
// venue setup rows here.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_auth_identities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      identifier  TEXT NOT NULL,
      verified_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(type, identifier)
    );
    CREATE INDEX IF NOT EXISTS idx_player_auth_identities_player
      ON player_auth_identities(player_id);

    CREATE TABLE IF NOT EXISTS player_wallets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      chain_type  TEXT NOT NULL,
      address     TEXT NOT NULL,
      label       TEXT,
      is_primary  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chain_type, address)
    );
    CREATE INDEX IF NOT EXISTS idx_player_wallets_player
      ON player_wallets(player_id, chain_type);

    CREATE TABLE IF NOT EXISTS player_dex_accounts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      dex            TEXT NOT NULL,
      chain_type     TEXT,
      wallet_address TEXT,
      account_id     TEXT,
      status         TEXT NOT NULL DEFAULT 'disconnected',
      metadata_json  TEXT NOT NULL DEFAULT '{}',
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(player_id, dex)
    );
    CREATE INDEX IF NOT EXISTS idx_player_dex_accounts_dex
      ON player_dex_accounts(dex, status);

    CREATE TABLE IF NOT EXISTS player_dex_credentials (
      player_id       TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      dex             TEXT NOT NULL,
      credential_type TEXT NOT NULL,
      storage_mode    TEXT NOT NULL DEFAULT 'browser_only',
      public_hint     TEXT,
      encrypted_secret TEXT,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(player_id, dex, credential_type)
    );
  `);
} catch (e) {
  console.warn('[db] unified identity migration warning:', e.message);
}
try {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_pacifica_ready_wallet_owner
      ON player_dex_accounts(wallet_address)
      WHERE dex = 'pacifica'
        AND status = 'ready'
        AND wallet_address IS NOT NULL
        AND wallet_address != '';
  `);
} catch (e) {
  console.warn('[db] pacifica wallet owner uniqueness skipped:', e.message);
}

// Player-bound NFT cache. Demon King ownership is verified from chain once,
// persisted here, then reused by load/upgrade flows so the UI does not scan
// ownerOf repeatedly across every panel mount.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_nfts (
      player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      collection   TEXT NOT NULL DEFAULT 'demon_king',
      chain        TEXT NOT NULL,
      token_id     TEXT NOT NULL,
      wallet       TEXT NOT NULL,
      level        INTEGER NOT NULL DEFAULT 1,
      image_url    TEXT,
      active       INTEGER NOT NULL DEFAULT 1,
      source       TEXT,
      tx_hash      TEXT,
      verified_at  TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (player_id, collection, chain, token_id)
    );
    CREATE INDEX IF NOT EXISTS idx_player_nfts_player_active
      ON player_nfts(player_id, collection, active, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_player_nfts_wallet
      ON player_nfts(collection, wallet, chain, active);
    CREATE INDEX IF NOT EXISTS idx_player_nfts_token
      ON player_nfts(collection, chain, token_id, active);

    CREATE TABLE IF NOT EXISTS player_nft_wallet_checks (
      player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      collection   TEXT NOT NULL DEFAULT 'demon_king',
      wallet       TEXT NOT NULL,
      chains       TEXT NOT NULL DEFAULT '[]',
      result_count INTEGER NOT NULL DEFAULT 0,
      checked_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (player_id, collection, wallet)
    );
    CREATE INDEX IF NOT EXISTS idx_player_nft_wallet_checks_recent
      ON player_nft_wallet_checks(collection, wallet, checked_at DESC);

    CREATE TABLE IF NOT EXISTS nft_rarities (
      collection    TEXT NOT NULL DEFAULT 'demon_king',
      chain         TEXT NOT NULL,
      token_id      TEXT NOT NULL,
      rarity        TEXT NOT NULL CHECK (rarity IN ('common', 'epic', 'legendary')),
      legacy_level  INTEGER NOT NULL DEFAULT 1,
      owner_wallet  TEXT,
      player_id     TEXT,
      rarity_source TEXT NOT NULL DEFAULT 'reveal',
      reveal_seed   TEXT,
      snapshot_hash TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      revealed_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (collection, chain, token_id)
    );
    CREATE INDEX IF NOT EXISTS idx_nft_rarities_collection_rarity
      ON nft_rarities(collection, rarity, updated_at DESC);

  `);
} catch (e) { console.warn('[db] player_nfts migration:', e.message); }

// Marketplace indexer state. The indexer reads V3 marketplace events
// (Listed / Cancelled / Sold) from Base and writes them into the two tables
// below. `marketplace_listings` is the latest-state view used by the
// /marketplace/listings endpoint; `marketplace_events` is the full audit
// log used for debugging and historical queries.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      chain          TEXT NOT NULL,
      token_id       TEXT NOT NULL,
      seller         TEXT NOT NULL,
      payment_token  TEXT NOT NULL,
      price_wei      TEXT NOT NULL,
      created_at     INTEGER NOT NULL,
      expires_at     INTEGER NOT NULL DEFAULT 0,
      active         INTEGER NOT NULL DEFAULT 1,
      listed_block   INTEGER NOT NULL,
      listed_tx      TEXT NOT NULL,
      cancelled_block INTEGER,
      cancelled_tx   TEXT,
      sold_block     INTEGER,
      sold_tx        TEXT,
      buyer          TEXT,
      sold_price_wei TEXT,
      indexed_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (chain, token_id)
    );
    CREATE INDEX IF NOT EXISTS idx_marketplace_listings_active
      ON marketplace_listings(chain, active, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller
      ON marketplace_listings(seller, chain);

    CREATE TABLE IF NOT EXISTS marketplace_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      chain        TEXT NOT NULL,
      event_type   TEXT NOT NULL,
      token_id     TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      log_index    INTEGER NOT NULL,
      tx_hash      TEXT NOT NULL,
      raw_data     TEXT NOT NULL,
      indexed_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_events_unique
      ON marketplace_events(chain, tx_hash, log_index);
    CREATE INDEX IF NOT EXISTS idx_marketplace_events_token
      ON marketplace_events(chain, token_id, block_number);

    CREATE TABLE IF NOT EXISTS marketplace_indexer_state (
      chain               TEXT PRIMARY KEY,
      last_indexed_block  INTEGER NOT NULL,
      last_indexed_at     TEXT NOT NULL DEFAULT (datetime('now')),
      logs_processed      INTEGER NOT NULL DEFAULT 0,
      errors_total        INTEGER NOT NULL DEFAULT 0,
      last_error          TEXT
    );
  `);
} catch (e) { console.warn('[db] marketplace_listings migration:', e.message); }

// Server-custodial NFT marketplace. This is separate from the legacy
// on-chain marketplace indexer above: listings are backed by server custody,
// verified treasury payments, and an append-only event log.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS custodial_marketplace_orders (
      id                         TEXT PRIMARY KEY,
      status                     TEXT NOT NULL DEFAULT 'awaiting_deposit',
      seller_player_id           TEXT REFERENCES players(id) ON DELETE SET NULL,
      seller_wallet              TEXT NOT NULL,
      seller_payout_chain        TEXT NOT NULL DEFAULT 'solana',
      seller_payout_address      TEXT NOT NULL,
      asset_chain                TEXT NOT NULL DEFAULT 'solana',
      asset_id                   TEXT NOT NULL,
      asset_standard             TEXT,
      asset_collection           TEXT,
      level                      INTEGER NOT NULL DEFAULT 1,
      price_usdc_units           TEXT NOT NULL,
      fee_bps                    INTEGER NOT NULL DEFAULT 0,
      fee_usdc_units             TEXT NOT NULL DEFAULT '0',
      royalty_bps                INTEGER NOT NULL DEFAULT 0,
      royalty_usdc_units         TEXT NOT NULL DEFAULT '0',
      seller_amount_usdc_units   TEXT NOT NULL,
      payment_chain              TEXT NOT NULL DEFAULT 'base',
      payment_token              TEXT NOT NULL DEFAULT 'usdc',
      payment_token_address      TEXT,
      payment_decimals           INTEGER NOT NULL DEFAULT 6,
      payment_label              TEXT NOT NULL DEFAULT 'USDC',
      payment_treasury           TEXT,
      payment_amount_usdc_units  TEXT,
      payment_nonce              TEXT,
      payment_deadline           INTEGER,
      buyer_player_id            TEXT REFERENCES players(id) ON DELETE SET NULL,
      buyer_wallet               TEXT,
      buyer_dest_chain           TEXT,
      buyer_dest_address         TEXT,
      vault_chain                TEXT NOT NULL DEFAULT 'solana',
      vault_address              TEXT NOT NULL,
      deposit_tx_hash            TEXT,
      deposit_verified_at        TEXT,
      payment_tx_hash            TEXT,
      payment_verified_at        TEXT,
      delivery_tx_hash           TEXT,
      delivered_at               TEXT,
      payout_tx_hash             TEXT,
      paid_out_at                TEXT,
      cancel_tx_hash             TEXT,
      cancelled_at               TEXT,
      error                      TEXT,
      metadata_json              TEXT NOT NULL DEFAULT '{}',
      created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_custodial_marketplace_status
      ON custodial_marketplace_orders(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_custodial_marketplace_seller
      ON custodial_marketplace_orders(seller_player_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_custodial_marketplace_buyer
      ON custodial_marketplace_orders(buyer_player_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_custodial_marketplace_asset
      ON custodial_marketplace_orders(asset_chain, asset_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_custodial_marketplace_active_asset
      ON custodial_marketplace_orders(asset_chain, asset_id)
      WHERE status IN ('awaiting_deposit', 'active', 'reserved', 'paid', 'delivering');
    CREATE UNIQUE INDEX IF NOT EXISTS idx_custodial_marketplace_deposit_tx
      ON custodial_marketplace_orders(deposit_tx_hash)
      WHERE deposit_tx_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_custodial_marketplace_payment_tx
      ON custodial_marketplace_orders(payment_tx_hash)
      WHERE payment_tx_hash IS NOT NULL;

    CREATE TABLE IF NOT EXISTS custodial_marketplace_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id        TEXT NOT NULL REFERENCES custodial_marketplace_orders(id) ON DELETE CASCADE,
      event_type      TEXT NOT NULL,
      actor_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      tx_hash         TEXT,
      data_json       TEXT NOT NULL DEFAULT '{}',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_custodial_marketplace_events_order
      ON custodial_marketplace_events(order_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_custodial_marketplace_events_recent
      ON custodial_marketplace_events(created_at DESC);
  `);
} catch (e) { console.warn('[db] custodial_marketplace migration:', e.message); }

try { db.exec(`ALTER TABLE custodial_marketplace_orders ADD COLUMN payment_decimals INTEGER NOT NULL DEFAULT 6`); }
catch (e) { if (!/duplicate column/i.test(String(e?.message || ''))) console.warn('[db] custodial_marketplace payment_decimals migration:', e.message); }
try { db.exec(`ALTER TABLE custodial_marketplace_orders ADD COLUMN payment_label TEXT NOT NULL DEFAULT 'USDC'`); }
catch (e) { if (!/duplicate column/i.test(String(e?.message || ''))) console.warn('[db] custodial_marketplace payment_label migration:', e.message); }
try { db.exec(`ALTER TABLE custodial_marketplace_orders ADD COLUMN royalty_bps INTEGER NOT NULL DEFAULT 0`); }
catch (e) { if (!/duplicate column/i.test(String(e?.message || ''))) console.warn('[db] custodial_marketplace royalty_bps migration:', e.message); }
try { db.exec(`ALTER TABLE custodial_marketplace_orders ADD COLUMN royalty_usdc_units TEXT NOT NULL DEFAULT '0'`); }
catch (e) { if (!/duplicate column/i.test(String(e?.message || ''))) console.warn('[db] custodial_marketplace royalty_usdc_units migration:', e.message); }

// Cross-chain bridge ledger. One row per consumed (sourceRef, destChain) tuple
// so the orchestrator can refuse to re-sign / re-mint receipts for an asset
// that has already been bridged. EVM and Aptos destinations also enforce
// replay protection on-chain via `usedBridgeRefs` / `used_nonces`, but Solana
// destination mints are server-mediated (no on-chain check), so this ledger
// is the only line of defence there.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS used_bridge_refs (
      source_ref      TEXT NOT NULL,
      dest_chain      TEXT NOT NULL,
      source_chain    TEXT NOT NULL,
      burn_tx_hash    TEXT NOT NULL,
      dest_address    TEXT NOT NULL,
      dest_tx_or_asset TEXT,
      level           INTEGER NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_ref, dest_chain)
    );
    CREATE INDEX IF NOT EXISTS idx_used_bridge_refs_burn ON used_bridge_refs(burn_tx_hash);

    CREATE TABLE IF NOT EXISTS bridge_logs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id       TEXT NOT NULL,
      phase            TEXT NOT NULL,
      status           TEXT NOT NULL,
      source_chain     TEXT,
      dest_chain       TEXT,
      source_ref       TEXT,
      burn_tx_hash     TEXT,
      dest_address     TEXT,
      dest_tx_or_asset TEXT,
      level            INTEGER,
      error            TEXT,
      data             TEXT,
      ip               TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bridge_logs_recent ON bridge_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bridge_logs_phase_status ON bridge_logs(phase, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bridge_logs_pair ON bridge_logs(source_chain, dest_chain, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bridge_logs_ref ON bridge_logs(source_ref, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bridge_logs_burn ON bridge_logs(burn_tx_hash, created_at DESC);
  `);
} catch (e) { console.warn('[db] bridge ledger migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_agent_keys (
      id           TEXT PRIMARY KEY,
      player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      name         TEXT NOT NULL DEFAULT 'AI Agent',
      key_hash     TEXT NOT NULL UNIQUE,
      key_prefix   TEXT NOT NULL,
      key_suffix   TEXT NOT NULL,
      scopes       TEXT NOT NULL DEFAULT '["game:read","game:write"]',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      revoked_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ai_agent_keys_player ON ai_agent_keys(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_agent_keys_active_hash ON ai_agent_keys(key_hash) WHERE revoked_at IS NULL;
  `);
} catch (e) { console.warn('[db] ai_agent_keys migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     TEXT REFERENCES players(id) ON DELETE SET NULL,
      ai_key_id     TEXT,
      ai_key_prefix TEXT,
      tool          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'ok',
      duration_ms   INTEGER,
      error         TEXT,
      input_json    TEXT,
      output_json   TEXT,
      metadata_json TEXT,
      ip            TEXT,
      ua            TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_events_recent ON mcp_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mcp_events_tool_recent ON mcp_events(tool, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mcp_events_status_recent ON mcp_events(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mcp_events_player_recent ON mcp_events(player_id, created_at DESC);
  `);
  try { db.exec(`ALTER TABLE mcp_events ADD COLUMN output_json TEXT`); } catch {}
} catch (e) { console.warn('[db] mcp_events migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hermes_agents (
      player_id          TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      ai_key_id          TEXT NOT NULL,
      mcp_key            TEXT NOT NULL,
      orchestrator_state TEXT,
      status             TEXT NOT NULL DEFAULT 'new',
      last_error         TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
      last_provisioned_at TEXT,
      last_chat_at       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hermes_agents_status ON hermes_agents(status, updated_at DESC);
  `);
} catch (e) { console.warn('[db] hermes_agents migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hermes_chat_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   TEXT REFERENCES players(id) ON DELETE SET NULL,
      trace_id    TEXT,
      event_type  TEXT NOT NULL DEFAULT 'message',
      intent      TEXT,
      player_name TEXT,
      status      TEXT NOT NULL DEFAULT 'ok',
      duration_ms INTEGER,
      model       TEXT,
      error       TEXT,
      request_preview TEXT,
      response_preview TEXT,
      input_json  TEXT,
      output_json TEXT,
      quota_json  TEXT,
      attempts_json TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_hermes_chat_events_recent ON hermes_chat_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hermes_chat_events_player ON hermes_chat_events(player_id, created_at DESC);
  `);
  try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN trace_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'message'`); } catch {}
  try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN intent TEXT`); } catch {}
  try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN player_name TEXT`); } catch {}
  try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN request_preview TEXT`); } catch {}
  try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN response_preview TEXT`); } catch {}
  try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN quota_json TEXT`); } catch {}
  try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN attempts_json TEXT`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_hermes_chat_events_trace ON hermes_chat_events(trace_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_hermes_chat_events_type_recent ON hermes_chat_events(event_type, created_at DESC)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_hermes_chat_events_intent_recent ON hermes_chat_events(intent, created_at DESC)`); } catch {}
} catch (e) { console.warn('[db] hermes_chat_events migration:', e.message); }
try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN trace_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'message'`); } catch {}
try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN intent TEXT`); } catch {}
try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN player_name TEXT`); } catch {}
try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN request_preview TEXT`); } catch {}
try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN response_preview TEXT`); } catch {}
try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN quota_json TEXT`); } catch {}
try { db.exec(`ALTER TABLE hermes_chat_events ADD COLUMN attempts_json TEXT`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_hermes_chat_events_trace ON hermes_chat_events(trace_id)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_hermes_chat_events_type_recent ON hermes_chat_events(event_type, created_at DESC)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_hermes_chat_events_intent_recent ON hermes_chat_events(intent, created_at DESC)`); } catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hermes_jobs (
      id                  TEXT PRIMARY KEY,
      player_id           TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      dex                 TEXT NOT NULL DEFAULT 'decibel',
      status              TEXT NOT NULL DEFAULT 'draft',
      mode                TEXT NOT NULL DEFAULT 'monitor_only',
      name                TEXT NOT NULL,
      instruction         TEXT NOT NULL,
      interval_minutes    INTEGER NOT NULL DEFAULT 60,
      max_runs_per_day    INTEGER NOT NULL DEFAULT 6,
      max_messages_total  INTEGER NOT NULL DEFAULT 0,
      timezone            TEXT NOT NULL DEFAULT 'UTC',
      active_hours_json   TEXT,
      symbols_json        TEXT NOT NULL DEFAULT '[]',
      policy_json         TEXT NOT NULL DEFAULT '{}',
      notifications_json  TEXT NOT NULL DEFAULT '{}',
      scoped_ai_key_id    TEXT,
      runs_count          INTEGER NOT NULL DEFAULT 0,
      messages_used       INTEGER NOT NULL DEFAULT 0,
      trade_count         INTEGER NOT NULL DEFAULT 0,
      starts_at           TEXT,
      expires_at          TEXT,
      next_run_at         TEXT,
      last_run_at         TEXT,
      last_run_status     TEXT,
      last_summary        TEXT,
      last_error          TEXT,
      locked_until        TEXT,
      locked_by           TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
      activated_at        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hermes_jobs_player ON hermes_jobs(player_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hermes_jobs_due ON hermes_jobs(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_hermes_jobs_lock ON hermes_jobs(locked_until);

    CREATE TABLE IF NOT EXISTS hermes_job_runs (
      id                  TEXT PRIMARY KEY,
      job_id              TEXT NOT NULL REFERENCES hermes_jobs(id) ON DELETE CASCADE,
      player_id           TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      trace_id            TEXT,
      idempotency_key     TEXT NOT NULL UNIQUE,
      scheduled_for       TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'started',
      quota_bucket        TEXT,
      quota_json          TEXT,
      model               TEXT,
      duration_ms         INTEGER,
      response_text       TEXT,
      tools_json          TEXT,
      actions_json        TEXT,
      mcp_event_start_id  INTEGER,
      mcp_event_end_id    INTEGER,
      error               TEXT,
      started_at          TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hermes_job_runs_job ON hermes_job_runs(job_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hermes_job_runs_player ON hermes_job_runs(player_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hermes_job_runs_status ON hermes_job_runs(status, started_at DESC);
  `);
} catch (e) { console.warn('[db] hermes scheduled jobs migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_message_credit_balances (
      player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      credits    INTEGER NOT NULL DEFAULT 0 CHECK(credits >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_message_credit_ledger (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      delta         INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason        TEXT NOT NULL,
      purchase_id   INTEGER,
      metadata_json TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_message_credit_ledger_player ON ai_message_credit_ledger(player_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_message_entitlements (
      player_id            TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      lifetime_daily_limit INTEGER NOT NULL DEFAULT 0 CHECK(lifetime_daily_limit >= 0),
      source_purchase_id   INTEGER,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_message_daily_usage (
      player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      day               TEXT NOT NULL,
      free_used         INTEGER NOT NULL DEFAULT 0 CHECK(free_used >= 0),
      subscription_used INTEGER NOT NULL DEFAULT 0 CHECK(subscription_used >= 0),
      credit_used       INTEGER NOT NULL DEFAULT 0 CHECK(credit_used >= 0),
      total_used        INTEGER NOT NULL DEFAULT 0 CHECK(total_used >= 0),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(player_id, day)
    );
    CREATE INDEX IF NOT EXISTS idx_ai_message_daily_usage_day ON ai_message_daily_usage(day);
  `);
} catch (e) { console.warn('[db] ai message billing migration:', e.message); }

// Browser console/error ingestion. Public endpoint writes bounded rows here so
// production client failures survive PM2 log rotation and can be queried from
// the admin panel. Payloads are capped in routes.js before insertion.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   TEXT REFERENCES players(id) ON DELETE SET NULL,
      ip          TEXT,
      level       TEXT NOT NULL DEFAULT 'info',
      source      TEXT,
      url         TEXT,
      ua          TEXT,
      message     TEXT NOT NULL,
      stack       TEXT,
      payload     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_client_logs_recent ON client_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_logs_level_recent ON client_logs(level, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_logs_player_recent ON client_logs(player_id, created_at DESC);
  `);
} catch (e) { console.warn('[db] client_logs migration:', e.message); }

// Daily AI log-analysis reports. The scheduler reads the last 24h of stored
// operational/client errors, asks the Hermes OpenRouter model for diagnosis,
// and keeps the full prompt + model output for admin auditability.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_log_reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      window_start    TEXT NOT NULL,
      window_end      TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      model           TEXT,
      prompt          TEXT,
      report_markdown TEXT,
      report_json     TEXT,
      source_counts   TEXT,
      error           TEXT,
      duration_ms     INTEGER,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ai_log_reports_recent ON ai_log_reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_log_reports_window ON ai_log_reports(window_start, window_end);
    CREATE INDEX IF NOT EXISTS idx_ai_log_reports_status ON ai_log_reports(status, created_at DESC);
  `);
} catch (e) { console.warn('[db] ai_log_reports migration:', e.message); }

// Phoenix builder earnings index. The Phoenix collateral-history endpoint is
// paginated and rate-limited; keeping exact transfer events locally prevents
// the admin earnings card from showing a newest-pages sliding window.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS phoenix_collateral_events (
      authority                 TEXT NOT NULL,
      event_key                 TEXT NOT NULL,
      trader_pda_index          INTEGER NOT NULL DEFAULT 0,
      trader_subaccount_index   INTEGER NOT NULL DEFAULT 0,
      event_type                TEXT NOT NULL,
      amount_raw                INTEGER NOT NULL DEFAULT 0,
      amount_usd                REAL NOT NULL DEFAULT 0,
      collateral_after_raw      INTEGER,
      slot                      INTEGER,
      slot_index                INTEGER,
      event_index               INTEGER,
      event_timestamp           TEXT,
      raw_json                  TEXT,
      indexed_at                TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (authority, event_key)
    );
    CREATE INDEX IF NOT EXISTS idx_phoenix_collateral_events_authority_type
      ON phoenix_collateral_events(authority, event_type, trader_subaccount_index);
    CREATE INDEX IF NOT EXISTS idx_phoenix_collateral_events_authority_time
      ON phoenix_collateral_events(authority, event_timestamp DESC, slot DESC);

    CREATE TABLE IF NOT EXISTS phoenix_earnings_index_state (
      authority        TEXT PRIMARY KEY,
      last_backfill_at TEXT,
      last_sync_at     TEXT,
      last_cursor      TEXT,
      pages_fetched    INTEGER NOT NULL DEFAULT 0,
      events_indexed   INTEGER NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch (e) { console.warn('[db] phoenix earnings index migration:', e.message); }

// Lightweight presence event stream for admin analytics. last_seen_at gives
// current presence, while these sampled heartbeat rows let the admin panel
// compute daily active players and approximate session lengths over time.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_activity_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL DEFAULT 'heartbeat',
      source      TEXT NOT NULL DEFAULT 'api',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_player_activity_recent ON player_activity_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_player_activity_player_recent ON player_activity_events(player_id, created_at DESC);
  `);
} catch (e) { console.warn('[db] player_activity_events migration:', e.message); }

// Public $CLASH treasury history. This ledger is append-only: admin writes
// publish verifiable Solana buyback/burn transactions, while public dashboard
// reads expose only the transaction proof and public-facing metadata.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clash_token_transactions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type        TEXT NOT NULL CHECK(event_type IN ('buyback', 'burn')),
      amount_base_units TEXT NOT NULL,
      token_decimals    INTEGER NOT NULL DEFAULT 6 CHECK(token_decimals BETWEEN 0 AND 18),
      usd_value_e6      TEXT,
      tx_signature      TEXT NOT NULL,
      occurred_at       TEXT NOT NULL,
      public_note       TEXT,
      created_by        TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(event_type, tx_signature)
    );
    CREATE INDEX IF NOT EXISTS idx_clash_token_transactions_public
      ON clash_token_transactions(occurred_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_clash_token_transactions_type
      ON clash_token_transactions(event_type, occurred_at DESC);
  `);
} catch (e) { console.warn('[db] clash_token_transactions migration:', e.message); }

// Durable lifetime account count for the public dashboard. Player rows can be
// removed by support/admin tooling, so COUNT(players) is not an all-time
// metric. Initialize from current non-bot rows, then only increment on future
// real-account inserts; deletes intentionally do not decrement it.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS public_counters (
      key        TEXT PRIMARY KEY,
      value      INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO public_counters (key, value)
    SELECT 'users_all_time', COUNT(*)
    FROM players
    WHERE COALESCE(is_bot, 0) = 0;
    UPDATE public_counters
    SET value = MAX(value, (
          SELECT COUNT(*) FROM players WHERE COALESCE(is_bot, 0) = 0
        )),
        updated_at = datetime('now')
    WHERE key = 'users_all_time';
    CREATE TRIGGER IF NOT EXISTS trg_public_users_all_time_insert
    AFTER INSERT ON players
    WHEN COALESCE(NEW.is_bot, 0) = 0
    BEGIN
      UPDATE public_counters
      SET value = value + 1, updated_at = datetime('now')
      WHERE key = 'users_all_time';
    END;
  `);
} catch (e) { console.warn('[db] public counters migration:', e.message); }

// Player-submitted feedback and bug reports. Kept separate from client_logs:
// these are intentional messages with contact details, not telemetry.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_feedback (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     TEXT REFERENCES players(id) ON DELETE SET NULL,
      kind          TEXT NOT NULL DEFAULT 'feedback',
      message       TEXT NOT NULL,
      contact_type  TEXT NOT NULL,
      contact_value TEXT NOT NULL,
      page_url      TEXT,
      ua            TEXT,
      viewport      TEXT,
      ip            TEXT,
      status        TEXT NOT NULL DEFAULT 'new',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_feedback_recent ON user_feedback(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_feedback_player_recent ON user_feedback(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_feedback_status_recent ON user_feedback(status, created_at DESC);
  `);
} catch (e) { console.warn('[db] user_feedback migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_telemetry (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id           TEXT REFERENCES players(id) ON DELETE SET NULL,
      battle_session_id   TEXT,
      replay_label        TEXT,
      attacker_name       TEXT,
      expected_result     TEXT,
      expected_duration   REAL,
      actual_elapsed      REAL,
      actual_wall_elapsed REAL,
      summary             TEXT,
      events              TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_replay_telemetry_recent ON replay_telemetry(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_replay_telemetry_player_recent ON replay_telemetry(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_replay_telemetry_session ON replay_telemetry(battle_session_id);
  `);
} catch (e) { console.warn('[db] replay_telemetry migration:', e.message); }
try { db.exec(`ALTER TABLE replay_telemetry ADD COLUMN actual_wall_elapsed REAL`); } catch {}

// Tournaments — admin-curated competitions per DEX. While a player is
// joined ("active in tournament"), their main `players.trophies` is
// FROZEN (reads still happen, writes from battle/quest paths skip them
// for the joined player). Tournament-only counters live in
// `tournament_participants` and rank players by an admin-chosen sort
// key (pnl_usd / trophies / volume / gold / raw weighted points). Boosts are multipliers
// applied to the in-tournament counters; main account stats see the
// unboosted (zero) delta. Leaderboard is real-time read from the
// participant rows; tournament ends → status flips to 'ended', writes
// stop, leaderboard becomes a frozen historical record.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      event_kind   TEXT NOT NULL DEFAULT 'standard' CHECK(event_kind IN ('standard','lucky_raider')),
      name         TEXT NOT NULL,
      description  TEXT,
      dex          TEXT NOT NULL CHECK(dex IN ('pacifica','avantis','decibel','dango','gmx','ostium','monad','phoenix','hyperliquid','risex','nado','hibachi','hotstuff','grvt','katana','gmtrade','flash')),
      dex_scope    TEXT NOT NULL DEFAULT 'single' CHECK(dex_scope IN ('single','custom','all')),
      eligible_dexes TEXT NOT NULL DEFAULT '[]',
      mode         TEXT NOT NULL DEFAULT 'individual' CHECK(mode IN ('individual','dex_vs_dex')),
      team_score_by TEXT NOT NULL DEFAULT 'volume_usd',
      team_prize_mode TEXT NOT NULL DEFAULT 'winner_takes_all',
      team_prize_splits TEXT NOT NULL DEFAULT '[]',
      team_member_reward_by TEXT NOT NULL DEFAULT 'volume_usd',
      attack_match_policy TEXT NOT NULL DEFAULT 'all' CHECK(attack_match_policy IN ('all','enemy_or_non_participant','enemy_only')),
      start_at     TEXT NOT NULL,                        -- ISO datetime
      end_at       TEXT,                                  -- nullable (open-ended)
      gold_boost   REAL NOT NULL DEFAULT 1.0,
      seeker_gold_boost REAL NOT NULL DEFAULT 1.0,
      trophy_boost REAL NOT NULL DEFAULT 1.0,
      shield_hours REAL,
      freeze_trophies INTEGER NOT NULL DEFAULT 1,
      min_town_hall_level INTEGER NOT NULL DEFAULT 0,
      registration_require_twitter INTEGER NOT NULL DEFAULT 0,
      sort_by      TEXT NOT NULL DEFAULT 'pnl_usd' CHECK(sort_by IN ('pnl_usd','trophies','volume_usd','gold','points','volume_trophies_50_50')),
      points_trophy_weight REAL NOT NULL DEFAULT 0,
      points_volume_weight REAL NOT NULL DEFAULT 0,
      points_pnl_weight    REAL NOT NULL DEFAULT 0,
      scoring_mode TEXT NOT NULL DEFAULT 'live' CHECK(scoring_mode IN ('live','daily_pool')),
      daily_pool_points REAL NOT NULL DEFAULT 1000,
      daily_pool_growth_pct REAL NOT NULL DEFAULT 0,
      daily_pool_overrides TEXT NOT NULL DEFAULT '{}',
      daily_pool_enabled_at TEXT,
      daily_pool_award_time_utc TEXT NOT NULL DEFAULT '00:00',
      prize_currency TEXT NOT NULL DEFAULT 'USD',
      prize_tiers    TEXT NOT NULL DEFAULT '[]',
      mega_config    TEXT NOT NULL DEFAULT '{}',
      reward_config  TEXT NOT NULL DEFAULT '{}',
      rewards_in_cop INTEGER NOT NULL DEFAULT 0,
      seeker_only  INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended','draft')),
      paused_at    TEXT,
      pause_reason TEXT,
      resumed_at   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tournaments_dex_status ON tournaments(dex, status);
    CREATE INDEX IF NOT EXISTS idx_tournaments_scope_status ON tournaments(dex_scope, status);
  `);
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN event_kind TEXT NOT NULL DEFAULT 'standard'`); } catch {}
  try { db.exec(`UPDATE tournaments SET event_kind = 'standard' WHERE event_kind IS NULL OR event_kind NOT IN ('standard','lucky_raider')`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN dex_scope TEXT NOT NULL DEFAULT 'single'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN eligible_dexes TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN mode TEXT NOT NULL DEFAULT 'individual'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN team_score_by TEXT NOT NULL DEFAULT 'volume_usd'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN team_prize_mode TEXT NOT NULL DEFAULT 'winner_takes_all'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN team_prize_splits TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN team_member_reward_by TEXT NOT NULL DEFAULT 'volume_usd'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN attack_match_policy TEXT NOT NULL DEFAULT 'all'`); } catch {}
  try {
    db.exec(`
      UPDATE tournaments
      SET attack_match_policy = 'all'
      WHERE attack_match_policy NOT IN ('all','enemy_or_non_participant','enemy_only')
    `);
  } catch {}
  try {
    db.exec(`
      UPDATE tournaments
      SET eligible_dexes = '["' || dex || '"]'
      WHERE eligible_dexes IS NULL OR eligible_dexes = '' OR eligible_dexes = '[]'
    `);
  } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN preregistration_enabled INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN registration_opens_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN registration_closes_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN freeze_trophies INTEGER NOT NULL DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN min_town_hall_level INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`UPDATE tournaments SET min_town_hall_level = 0 WHERE min_town_hall_level IS NULL OR min_town_hall_level < 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN registration_require_twitter INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`UPDATE tournaments SET registration_require_twitter = CASE WHEN registration_require_twitter IS NULL THEN 0 ELSE registration_require_twitter END`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN points_trophy_weight REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN points_volume_weight REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN points_pnl_weight REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN scoring_mode TEXT NOT NULL DEFAULT 'live'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_points REAL NOT NULL DEFAULT 1000`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_growth_pct REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_overrides TEXT NOT NULL DEFAULT '{}'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_enabled_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_award_time_utc TEXT NOT NULL DEFAULT '00:00'`); } catch {}
  try {
    db.exec(`
      UPDATE tournaments
      SET scoring_mode = 'live'
      WHERE scoring_mode NOT IN ('live','daily_pool') OR scoring_mode IS NULL OR scoring_mode = ''
    `);
  } catch {}
  try {
    db.exec(`
      UPDATE tournaments
      SET daily_pool_points = 1000
      WHERE daily_pool_points IS NULL OR daily_pool_points <= 0
    `);
  } catch {}
  try {
    db.exec(`
      UPDATE tournaments
      SET daily_pool_growth_pct = 0
      WHERE daily_pool_growth_pct IS NULL
    `);
  } catch {}
  try {
    db.exec(`
      UPDATE tournaments
      SET daily_pool_overrides = '{}'
      WHERE daily_pool_overrides IS NULL OR daily_pool_overrides = ''
    `);
  } catch {}
  try {
    db.exec(`
      UPDATE tournaments
      SET daily_pool_award_time_utc = '00:00'
      WHERE daily_pool_award_time_utc IS NULL
         OR length(daily_pool_award_time_utc) != 5
         OR daily_pool_award_time_utc NOT GLOB '[0-9][0-9]:[0-9][0-9]'
         OR CAST(substr(daily_pool_award_time_utc, 1, 2) AS INTEGER) > 23
         OR CAST(substr(daily_pool_award_time_utc, 4, 2) AS INTEGER) > 59
    `);
  } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN prize_currency TEXT NOT NULL DEFAULT 'USD'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN prize_tiers TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN mega_config TEXT NOT NULL DEFAULT '{}'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN reward_config TEXT NOT NULL DEFAULT '{}'`); } catch {}
  try { db.exec(`UPDATE tournaments SET reward_config = '{}' WHERE reward_config IS NULL OR reward_config = ''`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN rewards_in_cop INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN seeker_only INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN seeker_gold_boost REAL NOT NULL DEFAULT 1.0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN shield_hours REAL`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN paused_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN pause_reason TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN resumed_at TEXT`); } catch {}
  try { db.exec(`UPDATE tournaments SET seeker_gold_boost = 1.0 WHERE seeker_gold_boost IS NULL OR seeker_gold_boost <= 0`); } catch {}
  try { db.exec(`UPDATE tournaments SET shield_hours = 0 WHERE shield_hours IS NOT NULL AND shield_hours < 0`); } catch {}
  try {
    db.exec(`
      UPDATE tournaments
      SET points_trophy_weight = 50,
          points_volume_weight = 50,
          points_pnl_weight = 0
      WHERE sort_by = 'volume_trophies_50_50'
        AND COALESCE(points_trophy_weight, 0) = 0
        AND COALESCE(points_volume_weight, 0) = 0
        AND COALESCE(points_pnl_weight, 0) = 0
    `);
  } catch {}
  try {
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tournaments'").get()?.sql || '';
    const needsRebuild = schema
      && (!schema.includes("event_kind") || !schema.includes("'points'") || !schema.includes("'volume_trophies_50_50'") || !schema.includes("'dango'") || !schema.includes("'ostium'") || !schema.includes("'monad'") || !schema.includes("'phoenix'") || !schema.includes("'hyperliquid'") || !schema.includes("'risex'") || !schema.includes("'nado'") || !schema.includes("'hibachi'") || !schema.includes("'grvt'") || !schema.includes("'katana'") || !schema.includes("'gmtrade'") || !schema.includes("'flash'") || !schema.includes("points_trophy_weight") || !schema.includes("scoring_mode") || !schema.includes("daily_pool_points") || !schema.includes("daily_pool_growth_pct") || !schema.includes("daily_pool_overrides") || !schema.includes("daily_pool_award_time_utc") || !schema.includes("prize_tiers") || !schema.includes("mega_config") || !schema.includes("reward_config") || !schema.includes("rewards_in_cop") || !schema.includes("seeker_only") || !schema.includes("seeker_gold_boost") || !schema.includes("shield_hours") || !schema.includes("dex_scope") || !schema.includes("eligible_dexes") || !schema.includes("dex_vs_dex") || !schema.includes("team_prize_splits") || !schema.includes("attack_match_policy"));
    if (needsRebuild) {
      db.pragma('foreign_keys = OFF');
      db.transaction(() => {
        db.exec(`
          CREATE TABLE tournaments_new (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_kind   TEXT NOT NULL DEFAULT 'standard' CHECK(event_kind IN ('standard','lucky_raider')),
            name         TEXT NOT NULL,
            description  TEXT,
            dex          TEXT NOT NULL CHECK(dex IN ('pacifica','avantis','decibel','dango','gmx','ostium','monad','phoenix','hyperliquid','risex','nado','hibachi','hotstuff','grvt','katana','gmtrade','flash')),
            dex_scope    TEXT NOT NULL DEFAULT 'single' CHECK(dex_scope IN ('single','custom','all')),
            eligible_dexes TEXT NOT NULL DEFAULT '[]',
            mode         TEXT NOT NULL DEFAULT 'individual' CHECK(mode IN ('individual','dex_vs_dex')),
            team_score_by TEXT NOT NULL DEFAULT 'volume_usd',
            team_prize_mode TEXT NOT NULL DEFAULT 'winner_takes_all',
            team_prize_splits TEXT NOT NULL DEFAULT '[]',
            team_member_reward_by TEXT NOT NULL DEFAULT 'volume_usd',
            attack_match_policy TEXT NOT NULL DEFAULT 'all' CHECK(attack_match_policy IN ('all','enemy_or_non_participant','enemy_only')),
            start_at     TEXT NOT NULL,
            end_at       TEXT,
            gold_boost   REAL NOT NULL DEFAULT 1.0,
            seeker_gold_boost REAL NOT NULL DEFAULT 1.0,
            trophy_boost REAL NOT NULL DEFAULT 1.0,
            shield_hours REAL,
            freeze_trophies INTEGER NOT NULL DEFAULT 1,
            min_town_hall_level INTEGER NOT NULL DEFAULT 0,
            registration_require_twitter INTEGER NOT NULL DEFAULT 0,
            sort_by      TEXT NOT NULL DEFAULT 'pnl_usd' CHECK(sort_by IN ('pnl_usd','trophies','volume_usd','gold','points','volume_trophies_50_50')),
            points_trophy_weight REAL NOT NULL DEFAULT 0,
            points_volume_weight REAL NOT NULL DEFAULT 0,
            points_pnl_weight    REAL NOT NULL DEFAULT 0,
            scoring_mode TEXT NOT NULL DEFAULT 'live',
            daily_pool_points REAL NOT NULL DEFAULT 1000,
            daily_pool_growth_pct REAL NOT NULL DEFAULT 0,
            daily_pool_overrides TEXT NOT NULL DEFAULT '{}',
            daily_pool_enabled_at TEXT,
            daily_pool_award_time_utc TEXT NOT NULL DEFAULT '00:00',
            prize_currency TEXT NOT NULL DEFAULT 'USD',
            prize_tiers    TEXT NOT NULL DEFAULT '[]',
            mega_config    TEXT NOT NULL DEFAULT '{}',
            reward_config  TEXT NOT NULL DEFAULT '{}',
            rewards_in_cop INTEGER NOT NULL DEFAULT 0,
            seeker_only  INTEGER NOT NULL DEFAULT 0,
            status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended','draft')),
            paused_at    TEXT,
            pause_reason TEXT,
            resumed_at   TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            preregistration_enabled INTEGER NOT NULL DEFAULT 0,
            registration_opens_at TEXT,
            registration_closes_at TEXT
          );
          INSERT INTO tournaments_new (
            id, event_kind, name, description, dex, dex_scope, eligible_dexes, mode, team_score_by, team_prize_mode, team_prize_splits, team_member_reward_by, attack_match_policy, start_at, end_at, gold_boost, seeker_gold_boost, trophy_boost,
            shield_hours, freeze_trophies, min_town_hall_level, registration_require_twitter, sort_by, points_trophy_weight, points_volume_weight, points_pnl_weight,
            scoring_mode, daily_pool_points, daily_pool_growth_pct, daily_pool_overrides, daily_pool_enabled_at, daily_pool_award_time_utc,
            prize_currency, prize_tiers, mega_config, reward_config, rewards_in_cop, seeker_only, status, paused_at, pause_reason, resumed_at, created_at, preregistration_enabled, registration_opens_at, registration_closes_at
          )
          SELECT
            id,
            CASE WHEN event_kind IN ('standard','lucky_raider') THEN event_kind ELSE 'standard' END,
            name, description,
            CASE WHEN dex IN ('pacifica','avantis','decibel','dango','gmx','ostium','monad','phoenix','hyperliquid','risex','nado','hibachi','hotstuff','grvt','katana','gmtrade','flash') THEN dex ELSE 'pacifica' END,
            CASE WHEN dex_scope IN ('single','custom','all') THEN dex_scope ELSE 'single' END,
            CASE
              WHEN eligible_dexes IS NOT NULL AND eligible_dexes != '' AND eligible_dexes != '[]' THEN eligible_dexes
              ELSE '["' || CASE WHEN dex IN ('pacifica','avantis','decibel','dango','gmx','ostium','monad','phoenix','hyperliquid','risex','nado','hibachi','hotstuff','grvt','katana','gmtrade','flash') THEN dex ELSE 'pacifica' END || '"]'
            END,
            CASE WHEN mode IN ('individual','dex_vs_dex') THEN mode ELSE 'individual' END,
            COALESCE(team_score_by, 'volume_usd'),
            CASE WHEN team_prize_mode IN ('winner_takes_all','custom_split') THEN team_prize_mode ELSE 'winner_takes_all' END,
            COALESCE(team_prize_splits, '[]'),
            COALESCE(team_member_reward_by, 'volume_usd'),
            CASE WHEN attack_match_policy IN ('all','enemy_or_non_participant','enemy_only') THEN attack_match_policy ELSE 'all' END,
            start_at, end_at, gold_boost, COALESCE(seeker_gold_boost, 1.0), trophy_boost,
            CASE WHEN shield_hours IS NULL THEN NULL ELSE MAX(0, shield_hours) END,
            COALESCE(freeze_trophies, 1),
            COALESCE(min_town_hall_level, 0),
            COALESCE(registration_require_twitter, 0),
            CASE WHEN sort_by IN ('pnl_usd','trophies','volume_usd','gold','points','volume_trophies_50_50') THEN sort_by ELSE 'pnl_usd' END,
            COALESCE(points_trophy_weight, CASE WHEN sort_by = 'volume_trophies_50_50' THEN 50 ELSE 0 END),
            COALESCE(points_volume_weight, CASE WHEN sort_by = 'volume_trophies_50_50' THEN 50 ELSE 0 END),
            COALESCE(points_pnl_weight, 0),
            CASE WHEN scoring_mode IN ('live','daily_pool') THEN scoring_mode ELSE 'live' END,
            CASE WHEN COALESCE(daily_pool_points, 0) > 0 THEN daily_pool_points ELSE 1000 END,
            COALESCE(daily_pool_growth_pct, 0),
            COALESCE(daily_pool_overrides, '{}'),
            daily_pool_enabled_at,
            CASE
              WHEN daily_pool_award_time_utc GLOB '[0-9][0-9]:[0-9][0-9]'
               AND CAST(substr(daily_pool_award_time_utc, 1, 2) AS INTEGER) <= 23
               AND CAST(substr(daily_pool_award_time_utc, 4, 2) AS INTEGER) <= 59
              THEN daily_pool_award_time_utc
              ELSE '00:00'
            END,
            COALESCE(prize_currency, 'USD'),
            COALESCE(prize_tiers, '[]'),
            COALESCE(mega_config, '{}'),
            COALESCE(reward_config, '{}'),
            COALESCE(rewards_in_cop, 0),
            COALESCE(seeker_only, 0),
            CASE WHEN status IN ('active','ended','draft') THEN status ELSE 'active' END,
            paused_at,
            pause_reason,
            resumed_at,
            created_at,
            COALESCE(preregistration_enabled, 0),
            registration_opens_at,
            registration_closes_at
          FROM tournaments;
          DROP TABLE tournaments;
          ALTER TABLE tournaments_new RENAME TO tournaments;
          CREATE INDEX IF NOT EXISTS idx_tournaments_dex_status ON tournaments(dex, status);
          CREATE INDEX IF NOT EXISTS idx_tournaments_scope_status ON tournaments(dex_scope, status);
          INSERT OR REPLACE INTO sqlite_sequence(name, seq)
            SELECT 'tournaments', COALESCE(MAX(id), 0) FROM tournaments;
        `);
      })();
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
} catch (e) { console.warn('[db] tournaments migration:', e.message); }

// The rebuild path above intentionally tolerates legacy DBs. If a legacy
// rebuild failed before adding newer columns, retry the additive columns here
// so prepared statements below can still compile on old production files.
try { db.exec(`ALTER TABLE tournaments ADD COLUMN dex_scope TEXT NOT NULL DEFAULT 'single'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN event_kind TEXT NOT NULL DEFAULT 'standard'`); } catch {}
try { db.exec(`UPDATE tournaments SET event_kind = 'standard' WHERE event_kind IS NULL OR event_kind NOT IN ('standard','lucky_raider')`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN eligible_dexes TEXT NOT NULL DEFAULT '[]'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN mode TEXT NOT NULL DEFAULT 'individual'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN team_score_by TEXT NOT NULL DEFAULT 'volume_usd'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN team_prize_mode TEXT NOT NULL DEFAULT 'winner_takes_all'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN team_prize_splits TEXT NOT NULL DEFAULT '[]'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN team_member_reward_by TEXT NOT NULL DEFAULT 'volume_usd'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN attack_match_policy TEXT NOT NULL DEFAULT 'all'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN seeker_only INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN seeker_gold_boost REAL NOT NULL DEFAULT 1.0`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN shield_hours REAL`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN paused_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN pause_reason TEXT`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN resumed_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN scoring_mode TEXT NOT NULL DEFAULT 'live'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_points REAL NOT NULL DEFAULT 1000`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_growth_pct REAL NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_overrides TEXT NOT NULL DEFAULT '{}'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_enabled_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_award_time_utc TEXT NOT NULL DEFAULT '00:00'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN mega_config TEXT NOT NULL DEFAULT '{}'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN reward_config TEXT NOT NULL DEFAULT '{}'`); } catch {}
try { db.exec(`UPDATE tournaments SET reward_config = '{}' WHERE reward_config IS NULL OR reward_config = ''`); } catch {}
try {
  db.exec(`
    UPDATE tournaments
    SET scoring_mode = 'live'
    WHERE scoring_mode NOT IN ('live','daily_pool') OR scoring_mode IS NULL OR scoring_mode = ''
  `);
} catch {}
try {
  db.exec(`
    UPDATE tournaments
    SET daily_pool_points = 1000
    WHERE daily_pool_points IS NULL OR daily_pool_points <= 0
  `);
} catch {}
try { db.exec(`UPDATE tournaments SET daily_pool_growth_pct = 0 WHERE daily_pool_growth_pct IS NULL`); } catch {}
try { db.exec(`UPDATE tournaments SET daily_pool_overrides = '{}' WHERE daily_pool_overrides IS NULL OR daily_pool_overrides = ''`); } catch {}
try {
  db.exec(`
    UPDATE tournaments
    SET daily_pool_award_time_utc = '00:00'
    WHERE daily_pool_award_time_utc IS NULL
       OR length(daily_pool_award_time_utc) != 5
       OR daily_pool_award_time_utc NOT GLOB '[0-9][0-9]:[0-9][0-9]'
       OR CAST(substr(daily_pool_award_time_utc, 1, 2) AS INTEGER) > 23
       OR CAST(substr(daily_pool_award_time_utc, 4, 2) AS INTEGER) > 59
  `);
} catch {}
try { db.exec(`UPDATE tournaments SET seeker_gold_boost = 1.0 WHERE seeker_gold_boost IS NULL OR seeker_gold_boost <= 0`); } catch {}
try { db.exec(`UPDATE tournaments SET shield_hours = 0 WHERE shield_hours IS NOT NULL AND shield_hours < 0`); } catch {}
try {
  db.exec(`
    UPDATE tournaments
    SET attack_match_policy = 'all'
    WHERE attack_match_policy NOT IN ('all','enemy_or_non_participant','enemy_only')
  `);
} catch {}
try {
  db.exec(`
    UPDATE tournaments
    SET eligible_dexes = '["' || dex || '"]'
    WHERE eligible_dexes IS NULL OR eligible_dexes = '' OR eligible_dexes = '[]'
  `);
} catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_tournaments_scope_status ON tournaments(dex_scope, status)`); } catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_participants (
      tournament_id    INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id        TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      joined_at        TEXT NOT NULL DEFAULT (datetime('now')),
      left_at          TEXT,                              -- soft leave (nulled = active)
      trophies         INTEGER NOT NULL DEFAULT 0,
      gold             INTEGER NOT NULL DEFAULT 0,        -- gold "won" inside the tournament window for boost-leaderboard. Real gold still goes to players.gold normally.
      trades_count     INTEGER NOT NULL DEFAULT 0,
      volume_usd       REAL NOT NULL DEFAULT 0,
      pnl_usd          REAL NOT NULL DEFAULT 0,
      awarded_points   REAL NOT NULL DEFAULT 0,
      team_dex         TEXT,
      reward_wallet_evm TEXT,
      twitter_handle   TEXT,
      last_activity_at TEXT,
      PRIMARY KEY (tournament_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tp_player_active ON tournament_participants(player_id, left_at);
    CREATE INDEX IF NOT EXISTS idx_tp_leaderboard ON tournament_participants(tournament_id, pnl_usd DESC);
  `);
  try { db.exec(`ALTER TABLE tournament_participants ADD COLUMN team_dex TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournament_participants ADD COLUMN reward_wallet_evm TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournament_participants ADD COLUMN twitter_handle TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournament_participants ADD COLUMN last_activity_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournament_participants ADD COLUMN awarded_points REAL NOT NULL DEFAULT 0`); } catch {}
} catch (e) { console.warn('[db] tournament_participants migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_pause_periods (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      paused_at     TEXT NOT NULL,
      resumed_at    TEXT,
      reason        TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tournament_pause_periods_window
      ON tournament_pause_periods(tournament_id, paused_at, resumed_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_pause_periods_open
      ON tournament_pause_periods(tournament_id)
      WHERE resumed_at IS NULL;
  `);
} catch (e) { console.warn('[db] tournament_pause_periods migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_trade_credits (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      source        TEXT NOT NULL DEFAULT 'trade_history',
      trade_id      TEXT NOT NULL,
      player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      dex           TEXT NOT NULL,
      trades_count  INTEGER NOT NULL DEFAULT 0,
      volume_usd    REAL NOT NULL DEFAULT 0,
      pnl_usd       REAL NOT NULL DEFAULT 0,
      credited_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, source, trade_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ttc_player ON tournament_trade_credits(player_id, tournament_id);
  `);
} catch (e) { console.warn('[db] tournament_trade_credits migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_trade_sync_state (
      tournament_id         INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id             TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      dex                   TEXT NOT NULL,
      source                TEXT NOT NULL DEFAULT 'trade_history',
      last_trade_id         INTEGER NOT NULL DEFAULT 0,
      last_updated_at       TEXT,
      last_updated_trade_id INTEGER NOT NULL DEFAULT 0,
      last_reconciled_at    TEXT,
      last_synced_at        TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, player_id, dex, source)
    );
    CREATE INDEX IF NOT EXISTS idx_ttss_tournament
      ON tournament_trade_sync_state(tournament_id, last_synced_at);
  `);
} catch (e) { console.warn('[db] tournament_trade_sync_state migration:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_daily_activity (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      day_utc       TEXT NOT NULL,
      player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      source        TEXT NOT NULL,
      event_id      TEXT NOT NULL,
      dex           TEXT,
      trades_count  INTEGER NOT NULL DEFAULT 0,
      volume_usd    REAL NOT NULL DEFAULT 0,
      pnl_usd       REAL NOT NULL DEFAULT 0,
      trophies      INTEGER NOT NULL DEFAULT 0,
      gold          INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, source, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tda_day ON tournament_daily_activity(tournament_id, day_utc);
    CREATE INDEX IF NOT EXISTS idx_tda_player ON tournament_daily_activity(player_id, tournament_id, day_utc);

    CREATE TABLE IF NOT EXISTS tournament_daily_awards (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      day_utc       TEXT NOT NULL,
      player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      category      TEXT NOT NULL,
      points        REAL NOT NULL DEFAULT 0,
      raw_value     REAL NOT NULL DEFAULT 0,
      awarded_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, day_utc, player_id, category)
    );
    CREATE INDEX IF NOT EXISTS idx_tda_awards_player ON tournament_daily_awards(player_id, tournament_id);

    CREATE TABLE IF NOT EXISTS tournament_daily_point_runs (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      day_utc       TEXT NOT NULL,
      processed_at  TEXT NOT NULL DEFAULT (datetime('now')),
      total_points  REAL NOT NULL DEFAULT 0,
      details_json  TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (tournament_id, day_utc)
    );

    CREATE TABLE IF NOT EXISTS tournament_lucky_raider_runs (
      tournament_id    INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      day_utc          TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      seed             TEXT NOT NULL DEFAULT '',
      winner_player_id TEXT,
      details_json     TEXT NOT NULL DEFAULT '{}',
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, day_utc)
    );
    CREATE INDEX IF NOT EXISTS idx_tlr_runs_winner
      ON tournament_lucky_raider_runs(winner_player_id, tournament_id);

    CREATE TABLE IF NOT EXISTS tournament_lucky_raider_entries (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      day_utc       TEXT NOT NULL,
      player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      volume_usd    REAL NOT NULL DEFAULT 0,
      tickets       INTEGER NOT NULL DEFAULT 0,
      eligible      INTEGER NOT NULL DEFAULT 0,
      reason        TEXT,
      details_json  TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, day_utc, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tlr_entries_player
      ON tournament_lucky_raider_entries(player_id, tournament_id, day_utc);

    CREATE TABLE IF NOT EXISTS tournament_lucky_raider_payouts (
      id                 TEXT PRIMARY KEY,
      tournament_id      INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      day_utc            TEXT NOT NULL,
      place              INTEGER NOT NULL,
      reward_index       INTEGER NOT NULL DEFAULT 0,
      player_id          TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      destination_wallet TEXT,
      reward_label       TEXT NOT NULL DEFAULT '',
      reward_currency    TEXT NOT NULL DEFAULT '',
      reward_amount_usd  REAL NOT NULL DEFAULT 0,
      clash_usd_price    REAL NOT NULL DEFAULT 0,
      clash_amount       TEXT NOT NULL DEFAULT '',
      clash_amount_units TEXT NOT NULL DEFAULT '',
      price_source       TEXT,
      status             TEXT NOT NULL DEFAULT 'pending',
      tx_hash            TEXT,
      error              TEXT,
      attempts           INTEGER NOT NULL DEFAULT 0,
      metadata_json      TEXT NOT NULL DEFAULT '{}',
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at            TEXT,
      UNIQUE(tournament_id, day_utc, place, reward_index)
    );
    CREATE INDEX IF NOT EXISTS idx_tlr_payouts_status
      ON tournament_lucky_raider_payouts(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_tlr_payouts_player
      ON tournament_lucky_raider_payouts(player_id, tournament_id, day_utc);
  `);
} catch (e) { console.warn('[db] tournament daily pool migration:', e.message); }

// Battle replays — stores full replay data for verification and future replay viewer
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_replays (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_id           TEXT NOT NULL,
      defender_id           TEXT NOT NULL,
      claimed_result        TEXT NOT NULL,
      verified_result       TEXT NOT NULL,
      verification_reason   TEXT,
      replay_data           TEXT NOT NULL,
      buildings_snapshot    TEXT,
      loot_gold             INTEGER DEFAULT 0,
      loot_wood             INTEGER DEFAULT 0,
      loot_ore              INTEGER DEFAULT 0,
      sim_th_hp_pct         REAL,
      sim_buildings_destroyed INTEGER DEFAULT 0,
      sim_debug             TEXT,
      duration_sec          REAL,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
} catch {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_nft_battle_win_events (
      replay_id   INTEGER NOT NULL REFERENCES battle_replays(id) ON DELETE CASCADE,
      player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      collection  TEXT NOT NULL DEFAULT 'demon_king',
      chain       TEXT NOT NULL,
      token_id    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (replay_id, collection, chain, token_id)
    );
    CREATE INDEX IF NOT EXISTS idx_player_nft_battle_win_events_token
      ON player_nft_battle_win_events(player_id, collection, chain, token_id, created_at DESC);
  `);
} catch (e) { console.warn('[db] player_nft_battle_win_events migration:', e.message); }
try { db.exec(`ALTER TABLE battle_replays ADD COLUMN sim_debug TEXT`); } catch {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_revenge_uses (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      defender_id        TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      attacker_id        TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      source_battle_id   INTEGER NOT NULL REFERENCES battle_replays(id) ON DELETE CASCADE,
      revenge_session_id TEXT,
      revenge_battle_id  INTEGER,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(defender_id, source_battle_id)
    );
    CREATE INDEX IF NOT EXISTS idx_battle_revenge_uses_defender
      ON battle_revenge_uses(defender_id, created_at DESC);
  `);
} catch (e) { console.warn('[db] battle_revenge_uses migration:', e.message); }
try {
  db.exec(`
    UPDATE players
    SET battle_wins = (
      SELECT COUNT(*)
      FROM battle_replays r
      WHERE r.attacker_id = players.id
        AND lower(COALESCE(r.claimed_result, '')) = 'victory'
        AND lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory')
    )
    WHERE COALESCE(battle_wins, 0) = 0
  `);
} catch {}

try {
  const backfillRows = db.prepare(`
    SELECT id, attacker_id, replay_data
      FROM battle_replays
     WHERE lower(COALESCE(claimed_result, '')) = 'victory'
       AND lower(COALESCE(verified_result, '')) IN ('accepted', 'victory')
       AND replay_data LIKE '%DemonKing:%'
  `).all();
  if (backfillRows.length) {
    const insertNftWin = db.prepare(`
      INSERT OR IGNORE INTO player_nft_battle_win_events
        (replay_id, player_id, collection, chain, token_id)
      VALUES (?, ?, 'demon_king', ?, ?)
    `);
    const backfillTxn = db.transaction((rows) => {
      let inserted = 0;
      for (const row of rows) {
        let replay = null;
        try { replay = JSON.parse(row.replay_data || '[]'); } catch { replay = []; }
        const actions = Array.isArray(replay)
          ? replay
          : (Array.isArray(replay?.actions) ? replay.actions : []);
        const tokens = new Map();
        for (const action of actions) {
          if (action?.type !== 'place_ship') continue;
          const troopEntries = Array.isArray(action.troops)
            ? action.troops
            : (action.troopType ? [action.troopType] : []);
          for (const entry of troopEntries) {
            const parts = String(entry || '').split(':');
            if (parts.length < 3 || parts[0] !== 'DemonKing') continue;
            const chain = String(parts[1] || '').trim().toLowerCase();
            const tokenId = String(parts[2] || '').trim();
            const tokenOk = ['base', 'arbitrum', 'monad', 'ink'].includes(chain)
              ? /^\d+$/.test(tokenId)
              : chain === 'aptos'
                ? /^0x[0-9a-fA-F]{1,64}$/.test(tokenId)
                : chain === 'solana'
                  ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenId)
                  : false;
            if (!tokenOk) continue;
            tokens.set(`${chain}:${tokenId}`, { chain, tokenId });
          }
        }
        for (const token of tokens.values()) {
          inserted += insertNftWin.run(row.id, row.attacker_id, token.chain, token.tokenId).changes || 0;
        }
      }
      return inserted;
    });
    const inserted = backfillTxn(backfillRows);
    if (inserted) console.log(`[db] backfilled ${inserted} Demon King NFT battle win event(s)`);
  }
} catch (e) { console.warn('[db] Demon King NFT win backfill:', e.message); }

// Battle matchmaking reservations. /find-enemy creates a short-lived session
// so two attackers cannot be handed the same unshielded defender, play the
// whole battle locally, and then have one result rejected once the first
// submit grants a shield.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_sessions (
      id            TEXT PRIMARY KEY,
      attacker_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      defender_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'expired', 'cancelled')),
      reserved_until TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at  TEXT
    )
  `);
} catch {}
// Keep this immediately after the table exists. The early "safe migrations"
// block can run before battle_sessions is created on a fresh DB, so this second
// idempotent pass is what makes clean installs safe before prepared statements
// reference surrendered_at.
try { db.exec(`ALTER TABLE battle_sessions ADD COLUMN surrendered_at TEXT`); } catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS raid_matchmaking (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_session_id     TEXT UNIQUE,
      attacker_id           TEXT NOT NULL,
      defender_id           TEXT NOT NULL,
      target_is_bot         INTEGER NOT NULL DEFAULT 0,
      target_bot_difficulty TEXT,
      attacker_th           INTEGER NOT NULL DEFAULT 1,
      defender_th           INTEGER NOT NULL DEFAULT 1,
      attack_power          REAL NOT NULL DEFAULT 0,
      base_power            REAL NOT NULL DEFAULT 0,
      base_power_ratio      REAL NOT NULL DEFAULT 0,
      difficulty_bucket     TEXT NOT NULL DEFAULT 'normal',
      recovery_level        INTEGER NOT NULL DEFAULT 0,
      recent_success_rate   REAL,
      recent_raid_count     INTEGER NOT NULL DEFAULT 0,
      consecutive_losses    INTEGER NOT NULL DEFAULT 0,
      match_score           REAL NOT NULL DEFAULT 0,
      live_candidate_count  INTEGER NOT NULL DEFAULT 0,
      bot_candidate_count   INTEGER NOT NULL DEFAULT 0,
      selection_reason      TEXT,
      result                TEXT,
      verified_result       TEXT,
      completed_at          TEXT,
      duration_sec          REAL,
      sim_th_hp_pct         REAL,
      sim_buildings_destroyed INTEGER DEFAULT 0,
      main_loss_reason      TEXT,
      loot_gold             INTEGER DEFAULT 0,
      loot_wood             INTEGER DEFAULT 0,
      loot_ore              INTEGER DEFAULT 0,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_raid_matchmaking_attacker_created
      ON raid_matchmaking(attacker_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_raid_matchmaking_result_created
      ON raid_matchmaking(result, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_raid_matchmaking_defender_created
      ON raid_matchmaking(defender_id, created_at DESC);
  `);
} catch (e) { console.warn('[db] raid matchmaking migration:', e.message); }

// Paid utility purchases. Kept separate from `players.wallet`: a player can
// be logged in through Aptos/Solana/etc. and still pay from a one-off Base
// wallet without changing their DEX identity.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS utility_purchases (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      utility        TEXT NOT NULL,
      chain          TEXT NOT NULL,
      tx_hash        TEXT NOT NULL UNIQUE,
      payer          TEXT NOT NULL,
      token          TEXT NOT NULL,
      recipient      TEXT NOT NULL,
      amount         TEXT NOT NULL,
      usd_price_e6   TEXT,
      duration_hours INTEGER,
      shield_until   TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_utility_purchases_player ON utility_purchases(player_id, created_at DESC);
  `);
} catch (e) { console.warn('[db] utility_purchases migration:', e.message); }

// Paid Town Hall flag customization. `player_town_hall_flags` is the current
// public flag shown on every base snapshot; history makes each paid upload
// consume exactly one shop purchase.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_town_hall_flags (
      player_id     TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      image_url     TEXT NOT NULL,
      image_path    TEXT NOT NULL,
      image_sha256  TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      purchase_id   INTEGER REFERENCES utility_purchases(id),
      tx_hash       TEXT,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player_town_hall_flag_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      purchase_id   INTEGER NOT NULL UNIQUE REFERENCES utility_purchases(id),
      tx_hash       TEXT,
      image_url     TEXT NOT NULL,
      image_path    TEXT NOT NULL,
      image_sha256  TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_town_hall_flag_history_player
      ON player_town_hall_flag_history(player_id, created_at DESC);
  `);
} catch (e) { console.warn('[db] town hall flag customization migration:', e.message); }

// Referral attribution and commission ledger. Revenue events are immutable and
// idempotent by source_type/source_id so retrying payment redemption, delivery,
// or trade sync cannot double-credit a referrer.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      code       TEXT NOT NULL UNIQUE,
      slug       TEXT NOT NULL UNIQUE,
      commission_bps INTEGER NOT NULL DEFAULT 1000,
      manual_enabled INTEGER NOT NULL DEFAULT 0,
      active     INTEGER NOT NULL DEFAULT 1,
      note       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_referral_codes_code
      ON referral_codes(code, active);

    CREATE TABLE IF NOT EXISTS player_referrals (
      referred_player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      referrer_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      code               TEXT NOT NULL,
      source             TEXT,
      bound_at           TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json      TEXT NOT NULL DEFAULT '{}',
      CHECK (referred_player_id <> referrer_player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_player_referrals_referrer
      ON player_referrals(referrer_player_id, bound_at DESC);

    CREATE TABLE IF NOT EXISTS referral_events (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      referred_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      source_type        TEXT NOT NULL,
      source_id          TEXT NOT NULL,
      revenue_kind       TEXT NOT NULL,
      currency           TEXT NOT NULL DEFAULT 'USD',
      gross_usd_e6       INTEGER NOT NULL DEFAULT 0,
      commission_usd_e6  INTEGER NOT NULL DEFAULT 0,
      commission_bps     INTEGER NOT NULL DEFAULT 1000,
      status             TEXT NOT NULL DEFAULT 'confirmed',
      tx_hash            TEXT,
      metadata_json      TEXT NOT NULL DEFAULT '{}',
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at       TEXT,
      paid_at            TEXT,
      payout_id          TEXT,
      UNIQUE(source_type, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_referral_events_referrer
      ON referral_events(referrer_player_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_referral_events_referred
      ON referral_events(referred_player_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS referral_payouts (
      id                 TEXT PRIMARY KEY,
      referrer_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status             TEXT NOT NULL DEFAULT 'requested',
      currency           TEXT NOT NULL DEFAULT 'USD',
      amount_usd_e6      INTEGER NOT NULL DEFAULT 0,
      destination        TEXT,
      tx_hash            TEXT,
      note               TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at            TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_referral_payouts_referrer
      ON referral_payouts(referrer_player_id, status, created_at DESC);

    DROP TRIGGER IF EXISTS trg_referral_utility_purchase;
    CREATE TRIGGER trg_referral_utility_purchase
    AFTER INSERT ON utility_purchases
    WHEN NEW.usd_price_e6 IS NOT NULL
    BEGIN
      INSERT OR IGNORE INTO referral_events (
        referrer_player_id, referred_player_id, source_type, source_id,
        revenue_kind, currency, gross_usd_e6, commission_usd_e6, commission_bps,
        status, tx_hash, metadata_json, confirmed_at
      )
      SELECT
        pr.referrer_player_id,
        NEW.player_id,
        'utility_purchase',
        CAST(NEW.id AS TEXT),
        CASE WHEN NEW.utility LIKE '%nft%' OR NEW.utility LIKE '%demon_king%' THEN 'nft_shop' ELSE 'game_shop' END,
        'USD',
        CAST(COALESCE(NULLIF(NEW.usd_price_e6, ''), '0') AS INTEGER),
        CAST((CAST(COALESCE(NULLIF(NEW.usd_price_e6, ''), '0') AS INTEGER)
          * COALESCE((SELECT rc.commission_bps FROM referral_codes rc WHERE rc.player_id = pr.referrer_player_id AND rc.active = 1), 1000)
        ) / 10000 AS INTEGER),
        COALESCE((SELECT rc.commission_bps FROM referral_codes rc WHERE rc.player_id = pr.referrer_player_id AND rc.active = 1), 1000),
        'confirmed',
        NEW.tx_hash,
        json_object('utility', NEW.utility, 'chain', NEW.chain, 'token', NEW.token, 'payer', NEW.payer),
        datetime('now')
      FROM player_referrals pr
      WHERE pr.referred_player_id = NEW.player_id
        AND pr.referrer_player_id <> NEW.player_id
        AND CAST(COALESCE(NULLIF(NEW.usd_price_e6, ''), '0') AS INTEGER) > 0;
    END;

    DROP TRIGGER IF EXISTS trg_referral_custodial_marketplace_delivered;
    CREATE TRIGGER trg_referral_custodial_marketplace_delivered
    AFTER UPDATE OF status ON custodial_marketplace_orders
    WHEN NEW.status = 'delivered' AND OLD.status <> 'delivered'
    BEGIN
      INSERT OR IGNORE INTO referral_events (
        referrer_player_id, referred_player_id, source_type, source_id,
        revenue_kind, currency, gross_usd_e6, commission_usd_e6, commission_bps,
        status, tx_hash, metadata_json, confirmed_at
      )
      SELECT
        pr.referrer_player_id,
        NEW.buyer_player_id,
        'custodial_marketplace',
        NEW.id,
        'marketplace_fee_royalty',
        'USD',
        CAST(COALESCE(NULLIF(NEW.fee_usdc_units, ''), '0') AS INTEGER)
          + CAST(COALESCE(NULLIF(NEW.royalty_usdc_units, ''), '0') AS INTEGER),
        CAST((
          CAST(COALESCE(NULLIF(NEW.fee_usdc_units, ''), '0') AS INTEGER)
          + CAST(COALESCE(NULLIF(NEW.royalty_usdc_units, ''), '0') AS INTEGER)
        ) * COALESCE((SELECT rc.commission_bps FROM referral_codes rc WHERE rc.player_id = pr.referrer_player_id AND rc.active = 1), 1000) / 10000 AS INTEGER),
        COALESCE((SELECT rc.commission_bps FROM referral_codes rc WHERE rc.player_id = pr.referrer_player_id AND rc.active = 1), 1000),
        'confirmed',
        NEW.payment_tx_hash,
        json_object(
          'asset_chain', NEW.asset_chain,
          'asset_id', NEW.asset_id,
          'fee_usdc_units', NEW.fee_usdc_units,
          'royalty_usdc_units', NEW.royalty_usdc_units,
          'seller_player_id', NEW.seller_player_id
        ),
        datetime('now')
      FROM player_referrals pr
      WHERE pr.referred_player_id = NEW.buyer_player_id
        AND pr.referrer_player_id <> NEW.buyer_player_id
        AND (
          CAST(COALESCE(NULLIF(NEW.fee_usdc_units, ''), '0') AS INTEGER)
          + CAST(COALESCE(NULLIF(NEW.royalty_usdc_units, ''), '0') AS INTEGER)
        ) > 0;
    END;
  `);
} catch (e) { console.warn('[db] referral migration:', e.message); }

try { db.prepare('ALTER TABLE referral_codes ADD COLUMN commission_bps INTEGER NOT NULL DEFAULT 1000').run(); } catch {}
try { db.prepare('ALTER TABLE referral_codes ADD COLUMN manual_enabled INTEGER NOT NULL DEFAULT 0').run(); } catch {}
try { db.prepare('ALTER TABLE referral_codes ADD COLUMN note TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE referral_events ADD COLUMN commission_bps INTEGER NOT NULL DEFAULT 1000').run(); } catch {}
try {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_referral_utility_purchase;
    CREATE TRIGGER trg_referral_utility_purchase
    AFTER INSERT ON utility_purchases
    WHEN NEW.usd_price_e6 IS NOT NULL
    BEGIN
      INSERT OR IGNORE INTO referral_events (
        referrer_player_id, referred_player_id, source_type, source_id,
        revenue_kind, currency, gross_usd_e6, commission_usd_e6, commission_bps,
        status, tx_hash, metadata_json, confirmed_at
      )
      SELECT
        pr.referrer_player_id,
        NEW.player_id,
        'utility_purchase',
        CAST(NEW.id AS TEXT),
        CASE WHEN NEW.utility LIKE '%nft%' OR NEW.utility LIKE '%demon_king%' THEN 'nft_shop' ELSE 'game_shop' END,
        'USD',
        CAST(COALESCE(NULLIF(NEW.usd_price_e6, ''), '0') AS INTEGER),
        CAST((CAST(COALESCE(NULLIF(NEW.usd_price_e6, ''), '0') AS INTEGER)
          * COALESCE((SELECT rc.commission_bps FROM referral_codes rc WHERE rc.player_id = pr.referrer_player_id AND rc.active = 1), 1000)
        ) / 10000 AS INTEGER),
        COALESCE((SELECT rc.commission_bps FROM referral_codes rc WHERE rc.player_id = pr.referrer_player_id AND rc.active = 1), 1000),
        'confirmed',
        NEW.tx_hash,
        json_object('utility', NEW.utility, 'chain', NEW.chain, 'token', NEW.token, 'payer', NEW.payer),
        datetime('now')
      FROM player_referrals pr
      WHERE pr.referred_player_id = NEW.player_id
        AND pr.referrer_player_id <> NEW.player_id
        AND CAST(COALESCE(NULLIF(NEW.usd_price_e6, ''), '0') AS INTEGER) > 0;
    END;

    DROP TRIGGER IF EXISTS trg_referral_custodial_marketplace_delivered;
    CREATE TRIGGER trg_referral_custodial_marketplace_delivered
    AFTER UPDATE OF status ON custodial_marketplace_orders
    WHEN NEW.status = 'delivered' AND OLD.status <> 'delivered'
    BEGIN
      INSERT OR IGNORE INTO referral_events (
        referrer_player_id, referred_player_id, source_type, source_id,
        revenue_kind, currency, gross_usd_e6, commission_usd_e6, commission_bps,
        status, tx_hash, metadata_json, confirmed_at
      )
      SELECT
        pr.referrer_player_id,
        NEW.buyer_player_id,
        'custodial_marketplace',
        NEW.id,
        'marketplace_fee_royalty',
        'USD',
        CAST(COALESCE(NULLIF(NEW.fee_usdc_units, ''), '0') AS INTEGER)
          + CAST(COALESCE(NULLIF(NEW.royalty_usdc_units, ''), '0') AS INTEGER),
        CAST((
          CAST(COALESCE(NULLIF(NEW.fee_usdc_units, ''), '0') AS INTEGER)
          + CAST(COALESCE(NULLIF(NEW.royalty_usdc_units, ''), '0') AS INTEGER)
        ) * COALESCE((SELECT rc.commission_bps FROM referral_codes rc WHERE rc.player_id = pr.referrer_player_id AND rc.active = 1), 1000) / 10000 AS INTEGER),
        COALESCE((SELECT rc.commission_bps FROM referral_codes rc WHERE rc.player_id = pr.referrer_player_id AND rc.active = 1), 1000),
        'confirmed',
        NEW.payment_tx_hash,
        json_object(
          'asset_chain', NEW.asset_chain,
          'asset_id', NEW.asset_id,
          'fee_usdc_units', NEW.fee_usdc_units,
          'royalty_usdc_units', NEW.royalty_usdc_units,
          'seller_player_id', NEW.seller_player_id
        ),
        datetime('now')
      FROM player_referrals pr
      WHERE pr.referred_player_id = NEW.buyer_player_id
        AND pr.referrer_player_id <> NEW.buyer_player_id
        AND (
          CAST(COALESCE(NULLIF(NEW.fee_usdc_units, ''), '0') AS INTEGER)
          + CAST(COALESCE(NULLIF(NEW.royalty_usdc_units, ''), '0') AS INTEGER)
        ) > 0;
    END;
  `);
} catch (e) { console.warn('[db] referral trigger migration:', e.message); }

// Server-side recovery for Solana shop purchases. Mobile wallets can submit
// the transfer successfully and fail to return to the browser before
// /shop/solana/redeem runs. Store every signed quote so the backend can later
// match on-chain memo bytes to a trusted quote and grant idempotently.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_solana_quotes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id        TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      buyer            TEXT NOT NULL,
      sku              TEXT NOT NULL,
      quantity         INTEGER NOT NULL,
      payment          TEXT NOT NULL,
      memo             TEXT NOT NULL,
      memo_hash        TEXT NOT NULL UNIQUE,
      signature        TEXT NOT NULL,
      treasury         TEXT NOT NULL,
      mint             TEXT,
      amount           TEXT NOT NULL,
      usd_price_e6     TEXT NOT NULL,
      deadline         INTEGER NOT NULL,
      consumed_tx_hash TEXT,
      consumed_at      TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_shop_solana_quotes_player ON shop_solana_quotes(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shop_solana_quotes_consumed ON shop_solana_quotes(consumed_tx_hash);
  `);
} catch (e) { console.warn('[db] shop_solana_quotes migration:', e.message); }

// Internal telemetry. These are append-only event ledgers for admin analytics:
// where claim-gold/shop/task flows fail, and how resources move through the
// economy. Keep them server-owned so client code cannot spoof analytics.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_claim_results (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id             TEXT REFERENCES players(id) ON DELETE SET NULL,
      dex                   TEXT NOT NULL DEFAULT 'unknown',
      futures_mode          TEXT,
      wallet                TEXT,
      result                TEXT NOT NULL DEFAULT 'unknown',
      reason                TEXT,
      last_trade_id_before  INTEGER,
      last_trade_id_after   INTEGER,
      raw_trade_count       INTEGER NOT NULL DEFAULT 0,
      credited_trade_count  INTEGER NOT NULL DEFAULT 0,
      credited_open_count   INTEGER NOT NULL DEFAULT 0,
      raw_volume_usd        REAL NOT NULL DEFAULT 0,
      credited_volume_usd   REAL NOT NULL DEFAULT 0,
      pnl_usd               REAL NOT NULL DEFAULT 0,
      volume_gold           REAL NOT NULL DEFAULT 0,
      first_deposit_gold    INTEGER NOT NULL DEFAULT 0,
      first_trade_gold      INTEGER NOT NULL DEFAULT 0,
      daily_gold            INTEGER NOT NULL DEFAULT 0,
      pnl_gold              INTEGER NOT NULL DEFAULT 0,
      nft_boost_gold        INTEGER NOT NULL DEFAULT 0,
      tournament_gold       INTEGER NOT NULL DEFAULT 0,
      altar_bonus_gold      INTEGER NOT NULL DEFAULT 0,
      total_gold_paid       INTEGER NOT NULL DEFAULT 0,
      clamped_trade_count   INTEGER NOT NULL DEFAULT 0,
      settling_trade_count  INTEGER NOT NULL DEFAULT 0,
      claim_latency_ms      INTEGER NOT NULL DEFAULT 0,
      metadata_json         TEXT NOT NULL DEFAULT '{}',
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trade_claim_results_player ON trade_claim_results(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trade_claim_results_dex ON trade_claim_results(dex, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trade_claim_results_result ON trade_claim_results(result, created_at DESC);

    CREATE TABLE IF NOT EXISTS shop_funnel_events (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id      TEXT REFERENCES players(id) ON DELETE SET NULL,
      event_type     TEXT NOT NULL,
      sku            TEXT,
      chain          TEXT,
      payment        TEXT,
      token          TEXT,
      quantity       INTEGER,
      usd_price_e6   TEXT,
      token_amount   TEXT,
      price_source   TEXT,
      tx_hash        TEXT,
      quote_id       TEXT,
      error_code     TEXT,
      error_message  TEXT,
      metadata_json  TEXT NOT NULL DEFAULT '{}',
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_shop_funnel_player ON shop_funnel_events(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shop_funnel_type ON shop_funnel_events(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shop_funnel_sku ON shop_funnel_events(sku, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shop_funnel_chain_payment ON shop_funnel_events(chain, payment, created_at DESC);

    CREATE TABLE IF NOT EXISTS resource_delta_events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id         TEXT REFERENCES players(id) ON DELETE SET NULL,
      source_type       TEXT NOT NULL DEFAULT 'resource_change',
      gold_delta        INTEGER NOT NULL DEFAULT 0,
      wood_delta        INTEGER NOT NULL DEFAULT 0,
      ore_delta         INTEGER NOT NULL DEFAULT 0,
      gold_before       INTEGER NOT NULL DEFAULT 0,
      wood_before       INTEGER NOT NULL DEFAULT 0,
      ore_before        INTEGER NOT NULL DEFAULT 0,
      gold_after        INTEGER NOT NULL DEFAULT 0,
      wood_after        INTEGER NOT NULL DEFAULT 0,
      ore_after         INTEGER NOT NULL DEFAULT 0,
      gold_cap_before   INTEGER NOT NULL DEFAULT 0,
      wood_cap_before   INTEGER NOT NULL DEFAULT 0,
      ore_cap_before    INTEGER NOT NULL DEFAULT 0,
      gold_cap_after    INTEGER NOT NULL DEFAULT 0,
      wood_cap_after    INTEGER NOT NULL DEFAULT 0,
      ore_cap_after     INTEGER NOT NULL DEFAULT 0,
      lost_gold_to_cap  INTEGER NOT NULL DEFAULT 0,
      lost_wood_to_cap  INTEGER NOT NULL DEFAULT 0,
      lost_ore_to_cap   INTEGER NOT NULL DEFAULT 0,
      related_purchase_id TEXT,
      related_task_id     INTEGER,
      related_replay_id   INTEGER,
      metadata_json       TEXT NOT NULL DEFAULT '{}',
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_resource_delta_player ON resource_delta_events(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_resource_delta_source ON resource_delta_events(source_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS task_claim_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id       TEXT REFERENCES players(id) ON DELETE SET NULL,
      task_id         INTEGER,
      task_type       TEXT,
      task_title      TEXT,
      result          TEXT NOT NULL DEFAULT 'unknown',
      progress_value  REAL NOT NULL DEFAULT 0,
      target_value    REAL NOT NULL DEFAULT 0,
      reward_gold     INTEGER NOT NULL DEFAULT 0,
      reward_wood     INTEGER NOT NULL DEFAULT 0,
      reward_ore      INTEGER NOT NULL DEFAULT 0,
      repeatable      INTEGER NOT NULL DEFAULT 0,
      cooldown_hours  REAL NOT NULL DEFAULT 0,
      error_reason    TEXT,
      metadata_json   TEXT NOT NULL DEFAULT '{}',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_task_claim_events_player ON task_claim_events(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_claim_events_task ON task_claim_events(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_claim_events_result ON task_claim_events(result, created_at DESC);
  `);
} catch (e) { console.warn('[db] telemetry migration:', e.message); }

// ---------- Indexes on hot player_id columns (tables defined above) ----------
// Without these, /battle-log and /buildings endpoints degrade to full-table
// scans once the DB reaches a few thousand rows. Idempotent on existing DBs.
// Indexes for tables created elsewhere (gold_history, player_trades — routes.js;
// player_tasks — tasks.js) are added next to their CREATE TABLE statements.
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_battle_replays_attacker ON battle_replays(attacker_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_battle_replays_defender ON battle_replays(defender_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_buildings_player ON buildings(player_id);
    CREATE INDEX IF NOT EXISTS idx_troop_levels_player ON troop_levels(player_id);
    CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet) WHERE wallet IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_players_dex ON players(dex) WHERE dex IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players(last_seen_at) WHERE last_seen_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_players_seeker ON players(is_seeker) WHERE is_seeker = 1;
    CREATE INDEX IF NOT EXISTS idx_battle_sessions_defender_active ON battle_sessions(defender_id, status, reserved_until);
    CREATE INDEX IF NOT EXISTS idx_battle_sessions_attacker_active ON battle_sessions(attacker_id, status, reserved_until);
  `);
} catch (e) {
  console.warn('[db] index migration warning:', e.message);
}

// Per-DEX accounts migration — make `(wallet, dex)` the canonical identity
// instead of just `wallet`. Before: switching DEX silently flipped the
// `dex` column on the same row, so a user who registered on Avantis and
// then picked GMX kept all the same progress (and Avantis-progress was
// hidden once dex flipped to gmx). After: each (wallet, dex) pair is its
// own player row, so progress on Avantis stays on the Avantis row even
// when the user later opens GMX with the same EVM wallet.
//
// Pre-flight: scan for duplicate (wallet, dex) pairs that would block the
// UNIQUE index. If any found we abort the migration with a loud warning
// rather than silently skipping — this should never happen on prod (DB
// audit on 2026-05-04 confirmed zero duplicates) but guards against
// future drift. The CREATE UNIQUE INDEX is partial (WHERE wallet IS NOT
// NULL) so wallet-less rows (Farcaster stub accounts pre-binding) don't
// collide with each other.
try {
  const dupes = db.prepare(`
    SELECT wallet, dex, COUNT(*) AS n
    FROM players
    WHERE wallet IS NOT NULL AND wallet != ''
    GROUP BY wallet, dex HAVING n > 1
  `).all();
  if (dupes.length > 0) {
    console.error('[db] cannot create UNIQUE (wallet, dex) — duplicates exist:', dupes);
    console.error('[db] resolve manually before next restart; UNIQUE index NOT created');
  } else {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_players_wallet_dex
        ON players(wallet, dex) WHERE wallet IS NOT NULL
    `);
  }
} catch (e) {
  console.warn('[db] (wallet, dex) UNIQUE index migration warning:', e.message);
}

// ---------- Resource Production Definitions ----------

const PRODUCTION_DEFS = {
  mine:    { resource: 'ore',  rate: [18, 33, 54, 81, 120], max: [200, 400, 800, 1600, 3000] },    // per minute
  sawmill: { resource: 'wood', rate: [24, 45, 72, 108, 160], max: [250, 500, 1000, 2000, 3750] },
};

// ---------- Prepared Statements ----------

const stmts = {
  // Players
  createPlayer: db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore)
    VALUES (?, ?, ?, 2000, 2000, 2000)
  `),
  getPlayerByToken: db.prepare(`SELECT * FROM players WHERE token = ? AND COALESCE(is_bot, 0) = 0`),
  getPlayerByName: db.prepare(`SELECT * FROM players WHERE name = ? AND COALESCE(is_bot, 0) = 0`),
  getPlayerByNameCasefold: db.prepare(`SELECT * FROM players WHERE lower(name) = lower(?) AND COALESCE(is_bot, 0) = 0 LIMIT 1`),
  searchPlayersByName: db.prepare(`
    SELECT id, name, trophies, level, shield_until
    FROM players
    WHERE lower(name) LIKE lower(?) ESCAPE '\\'
      AND COALESCE(is_bot, 0) = 0
    ORDER BY
      CASE WHEN lower(name) = lower(?) THEN 0 ELSE 1 END,
      length(name) ASC,
      trophies DESC
    LIMIT 6
  `),
  // wallet-only lookup kept for back-compat with code paths that don't
  // care about DEX (e.g. legacy Farcaster placeholder migration). New
  // code MUST use getPlayerByWalletAndDex so per-DEX accounts stay
  // segregated. After the (wallet, dex) UNIQUE migration there can be
  // multiple rows for the same wallet across different DEXes; this
  // returns the highest-trophy row (matches old "canonical" semantics).
  getPlayerByWallet: db.prepare(`SELECT * FROM players WHERE wallet = ? ORDER BY COALESCE(trophies, 0) DESC, id DESC LIMIT 1`),
  // Per-DEX wallet lookup — canonical post-migration. Each (wallet, dex)
  // is now a UNIQUE pair so this returns at most one row.
  getPlayerByWalletAndDex: db.prepare(`SELECT * FROM players WHERE wallet = ? AND dex = ? LIMIT 1`),
  getPlayerById: db.prepare(`SELECT * FROM players WHERE id = ?`),
  getPlayerNameClash: db.prepare(`SELECT id FROM players WHERE lower(name) = lower(?) AND id != ? LIMIT 1`),
  updatePlayerNameById: db.prepare(`UPDATE players SET name = ? WHERE id = ?`),
  insertPlayerNameHistory: db.prepare(`
    INSERT INTO player_name_history (player_id, old_name, new_name, source, changed_by, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  listPlayerNameHistory: db.prepare(`
    SELECT id, old_name, new_name, source, changed_by, metadata_json, changed_at
      FROM player_name_history
     WHERE player_id = ?
     ORDER BY datetime(changed_at) DESC, id DESC
     LIMIT ?
  `),
  getAdminPlayerByIdentifier: db.prepare(`
    SELECT * FROM players
    WHERE id = ?
       OR name = ?
       OR lower(name) = lower(?)
       OR lower(COALESCE(wallet, '')) = lower(?)
       OR EXISTS (
         SELECT 1 FROM player_wallets pw
          WHERE pw.player_id = players.id
            AND lower(pw.address) = lower(?)
       )
       OR EXISTS (
         SELECT 1 FROM player_dex_accounts pda
          WHERE pda.player_id = players.id
            AND lower(COALESCE(pda.wallet_address, '')) = lower(?)
       )
    ORDER BY COALESCE(trophies, 0) DESC, created_at ASC
    LIMIT 1
  `),
  banPlayerById: db.prepare(`
    UPDATE players
    SET banned_at = COALESCE(banned_at, datetime('now')),
        banned_reason = ?,
        banned_by = ?
    WHERE id = ?
  `),
  unbanPlayerById: db.prepare(`
    UPDATE players
    SET banned_at = NULL,
        banned_reason = NULL,
        banned_by = NULL
    WHERE id = ?
  `),
  getWalletBlacklist: db.prepare(`
    SELECT *
    FROM wallet_blacklist
    WHERE lower(wallet) = lower(?)
    LIMIT 1
  `),
  upsertWalletBlacklist: db.prepare(`
    INSERT INTO wallet_blacklist (wallet, chain_type, reason, player_id, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(wallet) DO UPDATE SET
      chain_type = COALESCE(excluded.chain_type, wallet_blacklist.chain_type),
      reason = COALESCE(NULLIF(excluded.reason, ''), wallet_blacklist.reason),
      player_id = COALESCE(excluded.player_id, wallet_blacklist.player_id),
      created_by = COALESCE(excluded.created_by, wallet_blacklist.created_by),
      updated_at = datetime('now')
  `),
  deleteWalletBlacklist: db.prepare(`DELETE FROM wallet_blacklist WHERE lower(wallet) = lower(?)`),
  getMmBotAccessByPlayerId: db.prepare(`
    SELECT a.*, p.name AS player_name, p.wallet AS player_wallet, p.dex AS player_dex
    FROM mm_bot_access a
    LEFT JOIN players p ON p.id = a.player_id
    WHERE a.player_id = ?
    LIMIT 1
  `),
  listMmBotAccess: db.prepare(`
    SELECT a.*, p.name AS player_name, p.wallet AS player_wallet, p.dex AS player_dex
    FROM mm_bot_access a
    LEFT JOIN players p ON p.id = a.player_id
    ORDER BY a.enabled DESC, a.updated_at DESC, a.created_at DESC
    LIMIT ?
  `),
  listEnabledMmBotAccess: db.prepare(`
    SELECT player_id, updated_at
    FROM mm_bot_access
    WHERE enabled = 1
  `),
  upsertMmBotAccess: db.prepare(`
    INSERT INTO mm_bot_access (player_id, enabled, note, created_by, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(player_id) DO UPDATE SET
      enabled = excluded.enabled,
      note = COALESCE(excluded.note, mm_bot_access.note),
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `),
  listWalletBlacklist: db.prepare(`
    SELECT *
    FROM wallet_blacklist
    ORDER BY updated_at DESC, created_at DESC
    LIMIT ?
  `),
  // Heartbeat — fired on every authenticated API call by the auth
  // middleware. Idempotent (single UPDATE), no event sourcing needed.
  // The TEXT column stores ISO-ish "YYYY-MM-DD HH:MM:SS" so SQLite's
  // datetime() comparisons work directly.
  bumpPlayerLastSeen: db.prepare(`UPDATE players SET last_seen_at = datetime('now') WHERE id = ?`),
  insertPlayerActivity: db.prepare(`
    INSERT INTO player_activity_events (player_id, event_type, source)
    VALUES (?, ?, ?)
  `),
  markPlayerSeeker: db.prepare(`
    UPDATE players
    SET is_seeker = 1,
        seeker_id = COALESCE(NULLIF(?, ''), seeker_id),
        seeker_source = COALESCE(NULLIF(?, ''), seeker_source, 'client'),
        seeker_detected_at = datetime('now')
    WHERE id = ?
  `),
  insertAiAgentKey: db.prepare(`
    INSERT INTO ai_agent_keys (id, player_id, name, key_hash, key_prefix, key_suffix, scopes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  listAiAgentKeys: db.prepare(`
    SELECT id, name, key_prefix, key_suffix, scopes, created_at, last_used_at, revoked_at
    FROM ai_agent_keys
    WHERE player_id = ?
    ORDER BY created_at DESC
  `),
  getAiAgentKeyById: db.prepare(`
    SELECT id, name, key_prefix, key_suffix, scopes, created_at, last_used_at, revoked_at
    FROM ai_agent_keys
    WHERE id = ? AND player_id = ?
  `),
  getAiAgentKeyByHash: db.prepare(`
    SELECT
      k.*,
      p.id AS auth_player_id,
      p.name AS auth_player_name,
      p.wallet AS auth_player_wallet,
      p.dex AS auth_player_dex,
      p.trophies AS auth_player_trophies,
      p.level AS auth_player_level
    FROM ai_agent_keys k
    JOIN players p ON p.id = k.player_id
    WHERE k.key_hash = ? AND k.revoked_at IS NULL
    LIMIT 1
  `),
  touchAiAgentKey: db.prepare(`UPDATE ai_agent_keys SET last_used_at = datetime('now') WHERE id = ?`),
  revokeAiAgentKey: db.prepare(`
    UPDATE ai_agent_keys
    SET revoked_at = COALESCE(revoked_at, datetime('now'))
    WHERE id = ? AND player_id = ?
  `),
  countActiveAiAgentKeys: db.prepare(`
    SELECT COUNT(*) AS count
    FROM ai_agent_keys
    WHERE player_id = ? AND revoked_at IS NULL
  `),
  insertMcpEvent: db.prepare(`
    INSERT INTO mcp_events
      (player_id, ai_key_id, ai_key_prefix, tool, status, duration_ms, error, input_json, output_json, metadata_json, ip, ua)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getHermesAgent: db.prepare(`
    SELECT *
    FROM hermes_agents
    WHERE player_id = ?
  `),
  upsertHermesAgent: db.prepare(`
    INSERT INTO hermes_agents (player_id, ai_key_id, mcp_key, status, updated_at)
    VALUES (?, ?, ?, 'new', datetime('now'))
    ON CONFLICT(player_id) DO UPDATE SET
      ai_key_id = excluded.ai_key_id,
      mcp_key = excluded.mcp_key,
      updated_at = datetime('now')
  `),
  updateHermesAgentState: db.prepare(`
    UPDATE hermes_agents
    SET orchestrator_state = ?, status = ?, last_error = ?, updated_at = datetime('now'),
        last_provisioned_at = CASE WHEN ? THEN datetime('now') ELSE last_provisioned_at END,
        last_chat_at = CASE WHEN ? THEN datetime('now') ELSE last_chat_at END
    WHERE player_id = ?
  `),
  insertHermesChatEvent: db.prepare(`
    INSERT INTO hermes_chat_events
      (player_id, trace_id, event_type, intent, player_name, status, duration_ms, model, error,
       request_preview, response_preview, input_json, output_json, quota_json, attempts_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  // Find enemy candidates (not self, no shield, has a town hall, not in a
  // 24h personal cooldown after a loss/surrender).
  // The town-hall existence check excludes accounts that registered but
  // never built a base — attacking them would land you on an empty island
  // with nothing to destroy. Treating them as "unavailable" lets the same
  // error message ("all bases under shield, try again later") cover both
  // genuinely shielded targets and these orphan accounts, so the player
  // never lands in an unwinnable empty raid.
  // Personal cooldowns exclude defenders this attacker just beat, lost to,
  // or surrendered against. Without this, the matchmaker can re-pair a
  // player with a base that /attack/result will later reject.
  findEnemyCandidates: db.prepare(`
    SELECT id, name, trophies, level,
           COALESCE(is_bot, 0) AS is_bot,
           bot_difficulty,
           bot_variant
    FROM players
    WHERE id != ?
      AND COALESCE(is_bot, 0) = 0
      AND (shield_until IS NULL OR shield_until < datetime('now'))
      AND NOT (
        last_attacked_by = ?
        AND last_attacked_at IS NOT NULL
        AND datetime(last_attacked_at, '+1 hour') > datetime('now')
      )
      AND NOT EXISTS (
        SELECT 1 FROM battle_sessions s
        WHERE s.defender_id = players.id
          AND s.status = 'active'
          AND s.reserved_until > datetime('now')
      )
      AND EXISTS (
        SELECT 1 FROM buildings
        WHERE buildings.player_id = players.id
          AND buildings.type = 'town_hall'
      )
      AND NOT EXISTS (
        SELECT 1 FROM battle_replays r
        WHERE r.attacker_id = ?
          AND r.defender_id = players.id
          AND r.claimed_result = 'defeat'
          AND r.created_at > datetime('now', '-24 hours')
      )
      AND NOT EXISTS (
        SELECT 1 FROM battle_sessions bs2
        WHERE bs2.attacker_id = ?
          AND bs2.defender_id = players.id
          AND bs2.surrendered_at IS NOT NULL
          AND bs2.surrendered_at > datetime('now', '-24 hours')
      )
    ORDER BY RANDOM()
    LIMIT 100
  `),
  getActiveBattleReservationForDefender: db.prepare(`
    SELECT id, attacker_id, defender_id, reserved_until
    FROM battle_sessions
    WHERE defender_id = ?
      AND status = 'active'
      AND reserved_until > datetime('now')
    ORDER BY reserved_until DESC
    LIMIT 1
  `),
  getRecentDefeatAgainstDefender: db.prepare(`
    SELECT id, created_at
    FROM battle_replays
    WHERE attacker_id = ?
      AND defender_id = ?
      AND claimed_result = 'defeat'
      AND created_at > datetime('now', '-24 hours')
    ORDER BY created_at DESC
    LIMIT 1
  `),
  getRecentSurrenderAgainstDefender: db.prepare(`
    SELECT id, surrendered_at
    FROM battle_sessions
    WHERE attacker_id = ?
      AND defender_id = ?
      AND surrendered_at IS NOT NULL
      AND surrendered_at > datetime('now', '-24 hours')
    ORDER BY surrendered_at DESC
    LIMIT 1
  `),

  // Resources
  getResources: db.prepare(`SELECT gold, wood, ore FROM players WHERE id = ?`),
  updateResource: db.prepare(`UPDATE players SET gold = ?, wood = ?, ore = ? WHERE id = ?`),

  // Buildings
  placeBuilding: db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?)
  `),
  getBuildings: db.prepare(`SELECT * FROM buildings WHERE player_id = ?`),
  getBuildingById: db.prepare(`SELECT * FROM buildings WHERE id = ? AND player_id = ?`),
  getTownHallFlag: db.prepare(`
    SELECT player_id, image_url, image_path, image_sha256, mime_type, purchase_id, tx_hash, updated_at
    FROM player_town_hall_flags
    WHERE player_id = ?
  `),
  getUnconsumedTownHallFlagPurchase: db.prepare(`
    SELECT u.id, u.player_id, u.utility, u.chain, u.tx_hash, u.payer, u.token, u.amount, u.usd_price_e6, u.created_at
    FROM utility_purchases u
    LEFT JOIN player_town_hall_flag_history h ON h.purchase_id = u.id
    WHERE u.player_id = ?
      AND u.utility = 'town_hall_flag'
      AND h.id IS NULL
      AND (? IS NULL OR u.tx_hash = ?)
    ORDER BY u.id DESC
    LIMIT 1
  `),
  insertTownHallFlagHistory: db.prepare(`
    INSERT INTO player_town_hall_flag_history
      (player_id, purchase_id, tx_hash, image_url, image_path, image_sha256, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  upsertTownHallFlag: db.prepare(`
    INSERT INTO player_town_hall_flags
      (player_id, image_url, image_path, image_sha256, mime_type, purchase_id, tx_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(player_id) DO UPDATE SET
      image_url = excluded.image_url,
      image_path = excluded.image_path,
      image_sha256 = excluded.image_sha256,
      mime_type = excluded.mime_type,
      purchase_id = excluded.purchase_id,
      tx_hash = excluded.tx_hash,
      updated_at = datetime('now')
  `),
  clearTownHallFlag: db.prepare(`
    DELETE FROM player_town_hall_flags
    WHERE player_id = ?
  `),
  upgradeBuilding: db.prepare(`
    UPDATE buildings SET level = ?, hp = ?, max_hp = ? WHERE id = ? AND player_id = ?
  `),
  moveBuilding: db.prepare(`UPDATE buildings SET grid_x = ?, grid_z = ?, grid_index = ? WHERE id = ? AND player_id = ?`),
  removeBuilding: db.prepare(`DELETE FROM buildings WHERE id = ? AND player_id = ?`),
  updateBuildingHp: db.prepare(`UPDATE buildings SET hp = ? WHERE id = ? AND player_id = ?`),

  // Troop levels
  getTroopLevels: db.prepare(`SELECT troop_type, level FROM troop_levels WHERE player_id = ?`),
  upsertTroopLevel: db.prepare(`
    INSERT INTO troop_levels (player_id, troop_type, level)
    VALUES (?, ?, ?)
    ON CONFLICT(player_id, troop_type) DO UPDATE SET level = excluded.level
  `),

  // Altar skill levels
  getAltarSkillLevels: db.prepare(`SELECT skill_id, level FROM altar_skill_levels WHERE player_id = ?`),
  upsertAltarSkillLevel: db.prepare(`
    INSERT INTO altar_skill_levels (player_id, skill_id, level)
    VALUES (?, ?, ?)
    ON CONFLICT(player_id, skill_id) DO UPDATE SET level = excluded.level
  `),

  // Trophies
  updateTrophies: db.prepare(`UPDATE players SET trophies = ? WHERE id = ?`),
  getTrophies: db.prepare(`SELECT trophies FROM players WHERE id = ?`),
  incrementBattleWins: db.prepare(`UPDATE players SET battle_wins = COALESCE(battle_wins, 0) + 1 WHERE id = ?`),
  getBattleWins: db.prepare(`SELECT COALESCE(battle_wins, 0) AS battle_wins FROM players WHERE id = ?`),
  listPlayerDemonKingNfts: db.prepare(`
    SELECT player_id, collection, chain, token_id, wallet, level, image_url,
           active, source, tx_hash, verified_at, last_seen_at, updated_at,
           (SELECT r.rarity
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity,
           (SELECT r.revealed_at
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity_revealed_at,
           COALESCE((
             SELECT COUNT(*)
               FROM player_nft_battle_win_events e
              WHERE e.player_id = player_nfts.player_id
                AND e.collection = 'demon_king'
                AND e.chain = player_nfts.chain
                AND e.token_id = player_nfts.token_id
           ), 0) AS battle_wins
      FROM player_nfts
     WHERE player_id = ? AND collection = 'demon_king' AND active = 1
     ORDER BY level DESC, chain ASC, CAST(token_id AS INTEGER) ASC
  `),
  listPlayerDemonKingNftsByWallet: db.prepare(`
    SELECT player_id, collection, chain, token_id, wallet, level, image_url,
           active, source, tx_hash, verified_at, last_seen_at, updated_at,
           (SELECT r.rarity
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity,
           (SELECT r.revealed_at
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity_revealed_at,
           COALESCE((
             SELECT COUNT(*)
               FROM player_nft_battle_win_events e
              WHERE e.player_id = player_nfts.player_id
                AND e.collection = 'demon_king'
                AND e.chain = player_nfts.chain
                AND e.token_id = player_nfts.token_id
           ), 0) AS battle_wins
      FROM player_nfts
     WHERE player_id = ?
       AND collection = 'demon_king'
       AND lower(wallet) = lower(?)
       AND active = 1
     ORDER BY level DESC, chain ASC, CAST(token_id AS INTEGER) ASC
  `),
  getPlayerDemonKingNft: db.prepare(`
    SELECT player_id, collection, chain, token_id, wallet, level, image_url,
           active, source, tx_hash, verified_at, last_seen_at, updated_at,
           (SELECT r.rarity
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity,
           (SELECT r.revealed_at
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity_revealed_at,
           COALESCE((
             SELECT COUNT(*)
               FROM player_nft_battle_win_events e
              WHERE e.player_id = player_nfts.player_id
                AND e.collection = 'demon_king'
                AND e.chain = player_nfts.chain
                AND e.token_id = player_nfts.token_id
           ), 0) AS battle_wins
      FROM player_nfts
     WHERE player_id = ?
       AND collection = 'demon_king'
       AND chain = ?
       AND token_id = ?
       AND active = 1
     LIMIT 1
  `),
  deactivatePlayerDemonKingWalletChain: db.prepare(`
    UPDATE player_nfts
       SET active = 0, updated_at = datetime('now')
     WHERE player_id = ?
       AND collection = 'demon_king'
       AND lower(wallet) = lower(?)
       AND chain = ?
       AND active = 1
  `),
  deactivateDemonKingTokenEverywhere: db.prepare(`
    UPDATE player_nfts
       SET active = 0, updated_at = datetime('now')
     WHERE collection = 'demon_king'
       AND chain = ?
       AND token_id = ?
       AND active = 1
       AND (player_id != ? OR lower(wallet) != lower(?))
  `),
  upsertPlayerDemonKingNft: db.prepare(`
    INSERT INTO player_nfts
      (player_id, collection, chain, token_id, wallet, level, image_url,
       active, source, tx_hash, verified_at, last_seen_at, updated_at)
    VALUES (?, 'demon_king', ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    ON CONFLICT(player_id, collection, chain, token_id) DO UPDATE SET
      wallet = excluded.wallet,
      level = excluded.level,
      image_url = COALESCE(excluded.image_url, player_nfts.image_url),
      active = 1,
      source = COALESCE(excluded.source, player_nfts.source),
      tx_hash = COALESCE(excluded.tx_hash, player_nfts.tx_hash),
      verified_at = datetime('now'),
      last_seen_at = datetime('now'),
      updated_at = datetime('now')
  `),
  getDemonKingNftWalletCheck: db.prepare(`
    SELECT player_id, collection, wallet, chains, result_count, checked_at
      FROM player_nft_wallet_checks
     WHERE player_id = ? AND collection = 'demon_king' AND lower(wallet) = lower(?)
     LIMIT 1
  `),
  upsertDemonKingNftWalletCheck: db.prepare(`
    INSERT INTO player_nft_wallet_checks
      (player_id, collection, wallet, chains, result_count, checked_at)
    VALUES (?, 'demon_king', ?, ?, ?, datetime('now'))
    ON CONFLICT(player_id, collection, wallet) DO UPDATE SET
      chains = excluded.chains,
      result_count = excluded.result_count,
      checked_at = datetime('now')
  `),
  insertDemonKingBattleWinEvent: db.prepare(`
    INSERT OR IGNORE INTO player_nft_battle_win_events
      (replay_id, player_id, collection, chain, token_id)
    VALUES (?, ?, 'demon_king', ?, ?)
  `),
  getDemonKingBattleWins: db.prepare(`
    SELECT COUNT(*) AS wins
      FROM player_nft_battle_win_events
     WHERE player_id = ?
       AND collection = 'demon_king'
       AND chain = ?
       AND token_id = ?
  `),
  listPlayerCollectionNfts: db.prepare(`
    SELECT player_id, collection, chain, token_id, wallet, level, image_url,
           active, source, tx_hash, verified_at, last_seen_at, updated_at,
           (SELECT r.rarity
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity,
           (SELECT r.revealed_at
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity_revealed_at,
           COALESCE((
             SELECT COUNT(*)
               FROM player_nft_battle_win_events e
              WHERE e.player_id = player_nfts.player_id
                AND e.collection = player_nfts.collection
                AND e.chain = player_nfts.chain
                AND e.token_id = player_nfts.token_id
           ), 0) AS battle_wins
      FROM player_nfts
     WHERE player_id = ? AND collection = ? AND active = 1
     ORDER BY level DESC, chain ASC, CAST(token_id AS INTEGER) ASC
  `),
  listPlayerCollectionNftsByWallet: db.prepare(`
    SELECT player_id, collection, chain, token_id, wallet, level, image_url,
           active, source, tx_hash, verified_at, last_seen_at, updated_at,
           (SELECT r.rarity
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity,
           (SELECT r.revealed_at
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity_revealed_at,
           COALESCE((
             SELECT COUNT(*)
               FROM player_nft_battle_win_events e
              WHERE e.player_id = player_nfts.player_id
                AND e.collection = player_nfts.collection
                AND e.chain = player_nfts.chain
                AND e.token_id = player_nfts.token_id
           ), 0) AS battle_wins
      FROM player_nfts
     WHERE player_id = ?
       AND collection = ?
       AND lower(wallet) = lower(?)
       AND active = 1
     ORDER BY level DESC, chain ASC, CAST(token_id AS INTEGER) ASC
  `),
  listPlayerCollectionNftsForTaskBoost: db.prepare(`
    WITH linked_wallets(wallet) AS (
      SELECT wallet
        FROM players
       WHERE id = ?
         AND wallet IS NOT NULL
         AND wallet != ''
      UNION
      SELECT nft_gold_boost_wallet
        FROM players
       WHERE id = ?
         AND nft_gold_boost_wallet IS NOT NULL
         AND nft_gold_boost_wallet != ''
      UNION
      SELECT address
        FROM player_wallets
       WHERE player_id = ?
         AND address IS NOT NULL
         AND address != ''
      UNION
      SELECT wallet_address
        FROM player_dex_accounts
       WHERE player_id = ?
         AND wallet_address IS NOT NULL
         AND wallet_address != ''
         AND COALESCE(status, '') NOT IN ('disconnected', 'failed', 'error')
      UNION
      SELECT identifier
        FROM player_auth_identities
       WHERE player_id = ?
         AND identifier IS NOT NULL
         AND identifier != ''
         AND type IN ('evm_wallet', 'solana_wallet', 'aptos_wallet')
    )
    SELECT pn.player_id, pn.collection, pn.chain, pn.token_id, pn.wallet, pn.level, pn.image_url,
           pn.active, pn.source, pn.tx_hash, pn.verified_at, pn.last_seen_at, pn.updated_at,
           (SELECT r.rarity
              FROM nft_rarities r
             WHERE r.collection = pn.collection
               AND r.chain = pn.chain
               AND r.token_id = pn.token_id
             LIMIT 1) AS rarity,
           (SELECT r.revealed_at
              FROM nft_rarities r
             WHERE r.collection = pn.collection
               AND r.chain = pn.chain
               AND r.token_id = pn.token_id
             LIMIT 1) AS rarity_revealed_at,
           COALESCE((
             SELECT COUNT(*)
               FROM player_nft_battle_win_events e
              WHERE e.player_id = pn.player_id
                AND e.collection = pn.collection
                AND e.chain = pn.chain
                AND e.token_id = pn.token_id
           ), 0) AS battle_wins,
           CASE WHEN pn.player_id = ? THEN 0 ELSE 1 END AS owner_priority
      FROM player_nfts pn
     WHERE pn.collection = ?
       AND pn.active = 1
       AND (
         pn.player_id = ?
         OR EXISTS (
           SELECT 1
             FROM linked_wallets lw
            WHERE lower(lw.wallet) = lower(pn.wallet)
         )
       )
     ORDER BY owner_priority ASC, pn.level DESC, pn.chain ASC, pn.updated_at DESC
  `),
  getPlayerCollectionNft: db.prepare(`
    SELECT player_id, collection, chain, token_id, wallet, level, image_url,
           active, source, tx_hash, verified_at, last_seen_at, updated_at,
           (SELECT r.rarity
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity,
           (SELECT r.revealed_at
              FROM nft_rarities r
             WHERE r.collection = player_nfts.collection
               AND r.chain = player_nfts.chain
               AND r.token_id = player_nfts.token_id
             LIMIT 1) AS rarity_revealed_at,
           COALESCE((
             SELECT COUNT(*)
               FROM player_nft_battle_win_events e
              WHERE e.player_id = player_nfts.player_id
                AND e.collection = player_nfts.collection
                AND e.chain = player_nfts.chain
                AND e.token_id = player_nfts.token_id
           ), 0) AS battle_wins
      FROM player_nfts
     WHERE player_id = ?
       AND collection = ?
       AND chain = ?
       AND token_id = ?
       AND active = 1
     LIMIT 1
  `),
  deactivatePlayerCollectionWalletChain: db.prepare(`
    UPDATE player_nfts
       SET active = 0, updated_at = datetime('now')
     WHERE player_id = ?
       AND collection = ?
       AND lower(wallet) = lower(?)
       AND chain = ?
       AND active = 1
  `),
  deactivateCollectionTokenEverywhere: db.prepare(`
    UPDATE player_nfts
       SET active = 0, updated_at = datetime('now')
     WHERE collection = ?
       AND chain = ?
       AND token_id = ?
       AND active = 1
       AND (player_id != ? OR lower(wallet) != lower(?))
  `),
  upsertPlayerCollectionNft: db.prepare(`
    INSERT INTO player_nfts
      (player_id, collection, chain, token_id, wallet, level, image_url,
       active, source, tx_hash, verified_at, last_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    ON CONFLICT(player_id, collection, chain, token_id) DO UPDATE SET
      wallet = excluded.wallet,
      level = excluded.level,
      image_url = COALESCE(excluded.image_url, player_nfts.image_url),
      active = 1,
      source = COALESCE(excluded.source, player_nfts.source),
      tx_hash = COALESCE(excluded.tx_hash, player_nfts.tx_hash),
      verified_at = datetime('now'),
      last_seen_at = datetime('now'),
      updated_at = datetime('now')
  `),
  getCollectionNftWalletCheck: db.prepare(`
    SELECT player_id, collection, wallet, chains, result_count, checked_at
      FROM player_nft_wallet_checks
     WHERE player_id = ? AND collection = ? AND lower(wallet) = lower(?)
     LIMIT 1
  `),
  upsertCollectionNftWalletCheck: db.prepare(`
    INSERT INTO player_nft_wallet_checks
      (player_id, collection, wallet, chains, result_count, checked_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(player_id, collection, wallet) DO UPDATE SET
      chains = excluded.chains,
      result_count = excluded.result_count,
      checked_at = datetime('now')
  `),
  insertCollectionBattleWinEvent: db.prepare(`
    INSERT OR IGNORE INTO player_nft_battle_win_events
      (replay_id, player_id, collection, chain, token_id)
    VALUES (?, ?, ?, ?, ?)
  `),
  getCollectionBattleWins: db.prepare(`
    SELECT COUNT(*) AS wins
      FROM player_nft_battle_win_events
     WHERE player_id = ?
       AND collection = ?
       AND chain = ?
       AND token_id = ?
  `),
  getNftRarity: db.prepare(`
    SELECT collection, chain, token_id, rarity, legacy_level, owner_wallet,
           player_id, rarity_source, reveal_seed, snapshot_hash,
           metadata_json, revealed_at, updated_at
      FROM nft_rarities
     WHERE collection = ? AND chain = ? AND token_id = ?
     LIMIT 1
  `),
  upsertNftRarity: db.prepare(`
    INSERT INTO nft_rarities
      (collection, chain, token_id, rarity, legacy_level, owner_wallet,
       player_id, rarity_source, reveal_seed, snapshot_hash, metadata_json,
       revealed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(collection, chain, token_id) DO UPDATE SET
      rarity = excluded.rarity,
      legacy_level = excluded.legacy_level,
      owner_wallet = COALESCE(excluded.owner_wallet, nft_rarities.owner_wallet),
      player_id = COALESCE(excluded.player_id, nft_rarities.player_id),
      rarity_source = excluded.rarity_source,
      reveal_seed = COALESCE(excluded.reveal_seed, nft_rarities.reveal_seed),
      snapshot_hash = COALESCE(excluded.snapshot_hash, nft_rarities.snapshot_hash),
      metadata_json = COALESCE(excluded.metadata_json, nft_rarities.metadata_json),
      updated_at = datetime('now')
  `),

  // Production
  updateLastCollected: db.prepare(`UPDATE buildings SET last_collected_at = ? WHERE id = ? AND player_id = ?`),

  // Replay
  insertReplay: db.prepare(`
    INSERT INTO battle_replays (attacker_id, defender_id, claimed_result, verified_result, verification_reason, replay_data, buildings_snapshot, loot_gold, loot_wood, loot_ore, sim_th_hp_pct, sim_buildings_destroyed, sim_debug, duration_sec)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listRevengeTargets: db.prepare(`
    SELECT
      r.id AS battle_id,
      r.attacker_id,
      r.defender_id,
      r.claimed_result,
      r.verified_result,
      r.loot_gold,
      r.loot_wood,
      r.loot_ore,
      r.sim_buildings_destroyed,
      r.duration_sec,
      r.created_at,
      p.name AS attacker_name,
      p.trophies AS attacker_trophies,
      p.level AS attacker_level,
      p.shield_until AS attacker_shield_until,
      u.id AS revenge_use_id,
      u.revenge_session_id,
      u.revenge_battle_id,
      u.created_at AS revenge_used_at
    FROM battle_replays r
    JOIN players p ON p.id = r.attacker_id
    LEFT JOIN battle_revenge_uses u
      ON u.defender_id = r.defender_id
     AND u.source_battle_id = r.id
    WHERE r.defender_id = ?
      AND r.attacker_id != ?
      AND COALESCE(p.is_bot, 0) = 0
      AND lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory')
      AND NOT EXISTS (
        SELECT 1
        FROM battle_replays newer
        WHERE newer.defender_id = r.defender_id
          AND newer.attacker_id = r.attacker_id
          AND lower(COALESCE(newer.verified_result, '')) IN ('accepted', 'victory')
          AND (newer.created_at > r.created_at OR (newer.created_at = r.created_at AND newer.id > r.id))
      )
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 3
  `),
  getRevengeSourceBattle: db.prepare(`
    SELECT r.*, p.name AS attacker_name, p.trophies AS attacker_trophies,
           p.level AS attacker_level, p.shield_until AS attacker_shield_until,
           p.is_bot AS attacker_is_bot
    FROM battle_replays r
    JOIN players p ON p.id = r.attacker_id
    WHERE r.id = ? AND r.defender_id = ?
    LIMIT 1
  `),
  getRevengeUse: db.prepare(`
    SELECT *
    FROM battle_revenge_uses
    WHERE defender_id = ? AND source_battle_id = ?
    LIMIT 1
  `),
  insertRevengeUse: db.prepare(`
    INSERT INTO battle_revenge_uses
      (defender_id, attacker_id, source_battle_id, revenge_session_id)
    VALUES (?, ?, ?, ?)
  `),
  linkRevengeBattleBySession: db.prepare(`
    UPDATE battle_revenge_uses
    SET revenge_battle_id = COALESCE(revenge_battle_id, ?)
    WHERE defender_id = ? AND attacker_id = ? AND revenge_session_id = ?
  `),

  // Repair / Ship / Shield
  repairBuilding: db.prepare(`UPDATE buildings SET hp = max_hp WHERE id = ? AND player_id = ?`),
  setShipOnPort: db.prepare(`UPDATE buildings SET has_ship = 1 WHERE id = ? AND player_id = ?`),
  setShield: db.prepare(`UPDATE players SET shield_until = ?, last_attacked_by = ?, last_attacked_at = datetime('now') WHERE id = ?`),

  // Battle sessions
  expireBattleSessions: db.prepare(`
    UPDATE battle_sessions
    SET status = 'expired'
    WHERE status = 'active' AND reserved_until <= datetime('now')
  `),
  cancelBattleSessionsForAttacker: db.prepare(`
    UPDATE battle_sessions
    SET status = 'cancelled', completed_at = datetime('now')
    WHERE attacker_id = ? AND status = 'active'
  `),
  createBattleSession: db.prepare(`
    INSERT INTO battle_sessions (id, attacker_id, defender_id, reserved_until)
    VALUES (?, ?, ?, ?)
  `),
  getBattleSession: db.prepare(`SELECT * FROM battle_sessions WHERE id = ?`),
  finishBattleSessionById: db.prepare(`
    UPDATE battle_sessions
    SET status = ?, completed_at = datetime('now')
    WHERE id = ? AND attacker_id = ? AND defender_id = ? AND status = 'active'
  `),
  finishBattleSessionsForPair: db.prepare(`
    UPDATE battle_sessions
    SET status = ?, completed_at = datetime('now')
    WHERE attacker_id = ? AND defender_id = ? AND status = 'active'
  `),
  // Surrender stamp by session id — used when the client passes a known
  // battle_session_id from /find-enemy. Idempotent: re-stamping the same
  // row updates surrendered_at to the latest call so the 24h cooldown
  // window restarts (unlikely race, but defensive).
  getSurrenderSessionById: db.prepare(`
    SELECT id, attacker_id, defender_id, surrendered_at
    FROM battle_sessions
    WHERE id = ? AND attacker_id = ? AND defender_id = ?
  `),
  getLatestSurrenderSessionForPair: db.prepare(`
    SELECT id, attacker_id, defender_id, surrendered_at
    FROM battle_sessions
    WHERE attacker_id = ? AND defender_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `),
  markSurrenderById: db.prepare(`
    UPDATE battle_sessions
    SET surrendered_at = datetime('now'),
        status = 'cancelled',
        completed_at = COALESCE(completed_at, datetime('now'))
    WHERE id = ? AND attacker_id = ? AND defender_id = ? AND surrendered_at IS NULL
  `),
  // Surrender stamp by attacker+defender pair — fallback used when the
  // client lost the session id (page reload, sailor abandon). Targets the
  // most recent active or recently-completed session for the pair.
  markSurrenderByPair: db.prepare(`
    UPDATE battle_sessions
    SET surrendered_at = datetime('now'),
        status = CASE WHEN status = 'active' THEN 'cancelled' ELSE status END,
        completed_at = COALESCE(completed_at, datetime('now'))
    WHERE id = ? AND attacker_id = ? AND defender_id = ? AND surrendered_at IS NULL
  `),
  // Insert-only fallback when no battle_session row exists for this pair
  // (extremely rare — find-enemy always creates one, but guards against
  // stale data on legacy accounts). Acts as a pure cooldown marker; the
  // matchmaker only reads `surrendered_at`, not `status` or `reserved_until`.
  insertSurrenderMarker: db.prepare(`
    INSERT INTO battle_sessions (id, attacker_id, defender_id, status, reserved_until, surrendered_at, completed_at)
    VALUES (?, ?, ?, 'cancelled', datetime('now'), datetime('now'), datetime('now'))
  `),

  // Raid matchmaking analytics. One row is created when /find-enemy reserves
  // a target, then completed by /attack/result or /battle/surrender.
  insertRaidMatchmaking: db.prepare(`
    INSERT INTO raid_matchmaking (
      battle_session_id, attacker_id, defender_id,
      target_is_bot, target_bot_difficulty,
      attacker_th, defender_th,
      attack_power, base_power, base_power_ratio,
      difficulty_bucket, recovery_level,
      recent_success_rate, recent_raid_count, consecutive_losses,
      match_score, live_candidate_count, bot_candidate_count, selection_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getRaidMatchmakingBySession: db.prepare(`
    SELECT *
    FROM raid_matchmaking
    WHERE battle_session_id = ?
    LIMIT 1
  `),
  completeRaidMatchmaking: db.prepare(`
    UPDATE raid_matchmaking
    SET result = ?,
        verified_result = ?,
        completed_at = datetime('now'),
        duration_sec = ?,
        sim_th_hp_pct = ?,
        sim_buildings_destroyed = ?,
        main_loss_reason = ?,
        loot_gold = ?,
        loot_wood = ?,
        loot_ore = ?
    WHERE battle_session_id = ?
  `),
  markRaidMatchmakingSurrender: db.prepare(`
    UPDATE raid_matchmaking
    SET result = 'surrender',
        verified_result = 'surrender',
        completed_at = datetime('now'),
        main_loss_reason = 'surrender'
    WHERE battle_session_id = ? AND attacker_id = ?
  `),
  recentRaidMatchmakingResults: db.prepare(`
    SELECT result, target_is_bot, target_bot_difficulty, difficulty_bucket, recovery_level, created_at
    FROM raid_matchmaking
    WHERE attacker_id = ?
      AND result IN ('victory', 'defeat')
    ORDER BY created_at DESC
    LIMIT ?
  `),
  recentBattleReplayResults: db.prepare(`
    SELECT claimed_result, verified_result, sim_th_hp_pct, created_at
    FROM battle_replays
    WHERE attacker_id = ?
      AND lower(COALESCE(verified_result, '')) IN ('accepted', 'victory')
    ORDER BY created_at DESC
    LIMIT ?
  `),

  // Tournaments: used by battle paths to detect whether a player is currently
  // joined to an active tournament available to their DEX.
  getActiveTournamentForPlayer: db.prepare(`
    SELECT t.id AS tournament_id, t.dex, t.dex_scope, t.eligible_dexes, t.mode, t.seeker_only,
           COALESCE(t.event_kind, 'standard') AS event_kind,
           t.reward_config,
           p.team_dex,
           t.gold_boost, COALESCE(t.seeker_gold_boost, 1.0) AS seeker_gold_boost, t.trophy_boost,
           COALESCE(pl.is_seeker, 0) AS is_seeker,
           COALESCE(t.freeze_trophies, 1) AS freeze_trophies, t.sort_by,
           COALESCE(t.scoring_mode, 'live') AS scoring_mode,
           COALESCE(t.daily_pool_points, 1000) AS daily_pool_points,
           t.daily_pool_enabled_at,
           COALESCE(t.daily_pool_award_time_utc, '00:00') AS daily_pool_award_time_utc,
           t.shield_hours, t.start_at, t.end_at, p.joined_at
    FROM tournament_participants p
    JOIN players pl ON pl.id = p.player_id
    JOIN tournaments t ON t.id = p.tournament_id
    WHERE p.player_id = ?
      AND p.left_at IS NULL
      AND t.status = 'active'
      AND t.paused_at IS NULL
      AND COALESCE(t.event_kind, 'standard') = 'standard'
      AND (
        COALESCE(t.dex_scope, 'single') = 'all'
        OR t.dex = pl.dex
        OR instr(COALESCE(t.eligible_dexes, '[]'), '"' || pl.dex || '"') > 0
      )
      AND (COALESCE(t.seeker_only, 0) = 0 OR COALESCE(pl.is_seeker, 0) = 1)
      AND (t.end_at IS NULL OR replace(replace(t.end_at, 'T', ' '), ' UTC', '') > datetime('now'))
      AND replace(replace(t.start_at, 'T', ' '), ' UTC', '') <= datetime('now')
    ORDER BY t.id DESC
    LIMIT 1
  `),
  getTournamentByIdForPlayer: db.prepare(`
    SELECT t.id AS tournament_id, t.dex, t.dex_scope, t.eligible_dexes, t.mode, t.seeker_only,
           COALESCE(t.event_kind, 'standard') AS event_kind,
           t.reward_config,
           p.team_dex,
           t.gold_boost, COALESCE(t.seeker_gold_boost, 1.0) AS seeker_gold_boost, t.trophy_boost,
           COALESCE(pl.is_seeker, 0) AS is_seeker,
           COALESCE(t.freeze_trophies, 1) AS freeze_trophies, t.sort_by,
           COALESCE(t.scoring_mode, 'live') AS scoring_mode,
           COALESCE(t.daily_pool_points, 1000) AS daily_pool_points,
           t.daily_pool_enabled_at,
           COALESCE(t.daily_pool_award_time_utc, '00:00') AS daily_pool_award_time_utc,
           t.shield_hours, t.start_at, t.end_at, p.joined_at
    FROM tournament_participants p
    JOIN players pl ON pl.id = p.player_id
    JOIN tournaments t ON t.id = p.tournament_id
    WHERE t.id = ?
      AND p.player_id = ?
      AND p.left_at IS NULL
      AND t.status = 'active'
      AND t.paused_at IS NULL
      AND (t.end_at IS NULL OR replace(replace(t.end_at, 'T', ' '), ' UTC', '') > datetime('now'))
      AND replace(replace(t.start_at, 'T', ' '), ' UTC', '') <= datetime('now')
    LIMIT 1
  `),
  getActiveTournamentAttackPolicyForPlayer: db.prepare(`
    SELECT t.id AS tournament_id, t.name, t.dex, t.dex_scope, t.eligible_dexes, t.mode, t.seeker_only,
           COALESCE(t.attack_match_policy, 'all') AS attack_match_policy,
           p.team_dex, pl.dex AS player_dex
    FROM tournament_participants p
    JOIN players pl ON pl.id = p.player_id
    JOIN tournaments t ON t.id = p.tournament_id
    WHERE p.player_id = ?
      AND p.left_at IS NULL
      AND COALESCE(t.event_kind, 'standard') = 'standard'
      AND COALESCE(t.mode, 'individual') = 'dex_vs_dex'
      AND COALESCE(t.attack_match_policy, 'all') != 'all'
      AND t.status = 'active'
      AND t.paused_at IS NULL
      AND (
        COALESCE(t.dex_scope, 'single') = 'all'
        OR t.dex = pl.dex
        OR instr(COALESCE(t.eligible_dexes, '[]'), '"' || pl.dex || '"') > 0
      )
      AND (COALESCE(t.seeker_only, 0) = 0 OR COALESCE(pl.is_seeker, 0) = 1)
      AND (t.end_at IS NULL OR replace(replace(t.end_at, 'T', ' '), ' UTC', '') > datetime('now'))
      AND replace(replace(t.start_at, 'T', ' '), ' UTC', '') <= datetime('now')
    ORDER BY t.id DESC
    LIMIT 1
  `),
  getTournamentParticipantTeam: db.prepare(`
    SELECT tp.player_id, tp.team_dex, pl.dex AS player_dex, pl.name
    FROM tournament_participants tp
    JOIN players pl ON pl.id = tp.player_id
    WHERE tp.tournament_id = ?
      AND tp.player_id = ?
      AND tp.left_at IS NULL
    LIMIT 1
  `),
  bumpTournamentTrophies: db.prepare(`
    UPDATE tournament_participants
    SET trophies = MAX(0, trophies + ?), last_activity_at = datetime('now')
    WHERE tournament_id = ? AND player_id = ?
  `),
  bumpTournamentGold: db.prepare(`
    UPDATE tournament_participants
    SET gold = gold + ?, last_activity_at = datetime('now')
    WHERE tournament_id = ? AND player_id = ?
  `),
  bumpTournamentTrade: db.prepare(`
    UPDATE tournament_participants
    SET trades_count = trades_count + ?,
        volume_usd = volume_usd + ?,
        pnl_usd = pnl_usd + ?,
        last_activity_at = datetime('now')
    WHERE tournament_id = ? AND player_id = ?
  `),
  insertTournamentTradeCredit: db.prepare(`
    INSERT OR IGNORE INTO tournament_trade_credits (
      tournament_id, source, trade_id, player_id, dex, trades_count, volume_usd, pnl_usd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getTournamentTradeCredit: db.prepare(`
    SELECT player_id, dex, trades_count, volume_usd, pnl_usd
    FROM tournament_trade_credits
    WHERE tournament_id = ? AND source = ? AND trade_id = ?
    LIMIT 1
  `),
  getTournamentTradeSyncState: db.prepare(`
    SELECT tournament_id, player_id, dex, source, last_trade_id,
           last_updated_at, last_updated_trade_id, last_reconciled_at, last_synced_at
    FROM tournament_trade_sync_state
    WHERE tournament_id = ? AND player_id = ? AND dex = ? AND source = ?
    LIMIT 1
  `),
  upsertTournamentTradeSyncState: db.prepare(`
    INSERT INTO tournament_trade_sync_state (
      tournament_id, player_id, dex, source, last_trade_id,
      last_updated_at, last_updated_trade_id, last_reconciled_at, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(tournament_id, player_id, dex, source) DO UPDATE SET
      last_trade_id = excluded.last_trade_id,
      last_updated_at = excluded.last_updated_at,
      last_updated_trade_id = excluded.last_updated_trade_id,
      last_reconciled_at = excluded.last_reconciled_at,
      last_synced_at = datetime('now')
  `),
  updateTournamentTradeCreditPnl: db.prepare(`
    UPDATE tournament_trade_credits
    SET pnl_usd = ?
    WHERE tournament_id = ? AND source = ? AND trade_id = ? AND player_id = ?
  `),
  updateTournamentTradeCreditMetrics: db.prepare(`
    UPDATE tournament_trade_credits
    SET trades_count = ?,
        volume_usd = ?,
        pnl_usd = ?
    WHERE tournament_id = ? AND source = ? AND trade_id = ? AND player_id = ?
  `),
  updateTournamentTradeCreditDex: db.prepare(`
    UPDATE tournament_trade_credits
    SET dex = ?
    WHERE tournament_id = ? AND source = ? AND trade_id = ? AND player_id = ?
      AND lower(COALESCE(dex, '')) != ?
  `),
  bumpTournamentDailyActivityPnl: db.prepare(`
    UPDATE tournament_daily_activity
    SET pnl_usd = pnl_usd + ?
    WHERE tournament_id = ? AND source = ? AND event_id = ? AND player_id = ?
  `),
  bumpTournamentDailyActivityTradeMetrics: db.prepare(`
    UPDATE tournament_daily_activity
    SET trades_count = trades_count + ?,
        volume_usd = volume_usd + ?,
        pnl_usd = pnl_usd + ?
    WHERE tournament_id = ? AND source = ? AND event_id = ? AND player_id = ?
  `),
  updateTournamentDailyActivityDex: db.prepare(`
    UPDATE tournament_daily_activity
    SET dex = ?
    WHERE tournament_id = ? AND source = ? AND event_id = ? AND player_id = ?
      AND lower(COALESCE(dex, '')) != ?
  `),
  insertTournamentDailyActivity: db.prepare(`
    INSERT OR IGNORE INTO tournament_daily_activity (
      tournament_id, day_utc, player_id, source, event_id, dex,
      trades_count, volume_usd, pnl_usd, trophies, gold
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getTournamentDailyRun: db.prepare(`
    SELECT * FROM tournament_daily_point_runs
    WHERE tournament_id = ? AND day_utc = ?
  `),
  insertTournamentDailyRun: db.prepare(`
    INSERT OR IGNORE INTO tournament_daily_point_runs
      (tournament_id, day_utc, total_points, details_json)
    VALUES (?, ?, ?, ?)
  `),
  insertTournamentDailyAward: db.prepare(`
    INSERT OR IGNORE INTO tournament_daily_awards
      (tournament_id, day_utc, player_id, category, points, raw_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getTournamentLuckyRaiderRun: db.prepare(`
    SELECT * FROM tournament_lucky_raider_runs
    WHERE tournament_id = ? AND day_utc = ?
  `),
  upsertTournamentLuckyRaiderEntry: db.prepare(`
    INSERT INTO tournament_lucky_raider_entries (
      tournament_id, day_utc, player_id, volume_usd, tickets, eligible, reason, details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tournament_id, day_utc, player_id) DO UPDATE SET
      volume_usd = excluded.volume_usd,
      tickets = excluded.tickets,
      eligible = excluded.eligible,
      reason = excluded.reason,
      details_json = excluded.details_json,
      updated_at = datetime('now')
  `),
  insertTournamentLuckyRaiderRun: db.prepare(`
    INSERT OR IGNORE INTO tournament_lucky_raider_runs (
      tournament_id, day_utc, status, seed, winner_player_id, details_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `),
  insertTournamentLuckyRaiderPayout: db.prepare(`
    INSERT OR IGNORE INTO tournament_lucky_raider_payouts (
      id, tournament_id, day_utc, place, reward_index, player_id,
      destination_wallet, reward_label, reward_currency, reward_amount_usd,
      status, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getTournamentLuckyRaiderPayout: db.prepare(`
    SELECT lp.*,
           p.name AS player_name,
           t.name AS tournament_name,
           tp.reward_wallet_evm AS current_destination_wallet
      FROM tournament_lucky_raider_payouts lp
      LEFT JOIN players p ON p.id = lp.player_id
      LEFT JOIN tournaments t ON t.id = lp.tournament_id
      LEFT JOIN tournament_participants tp
        ON tp.tournament_id = lp.tournament_id
       AND tp.player_id = lp.player_id
     WHERE lp.id = ?
  `),
  listPendingTournamentLuckyRaiderPayouts: db.prepare(`
    SELECT lp.*,
           p.name AS player_name,
           t.name AS tournament_name,
           tp.reward_wallet_evm AS current_destination_wallet
      FROM tournament_lucky_raider_payouts lp
      LEFT JOIN players p ON p.id = lp.player_id
      LEFT JOIN tournaments t ON t.id = lp.tournament_id
      LEFT JOIN tournament_participants tp
        ON tp.tournament_id = lp.tournament_id
       AND tp.player_id = lp.player_id
     WHERE lp.status IN ('pending', 'failed')
       AND lp.attempts < ?
       AND (
         lp.status = 'pending'
         OR lp.updated_at <= datetime('now', ?)
       )
     ORDER BY lp.created_at ASC, lp.id ASC
     LIMIT ?
  `),
  claimTournamentLuckyRaiderPayout: db.prepare(`
    UPDATE tournament_lucky_raider_payouts
       SET status = 'processing',
           attempts = attempts + 1,
           error = NULL,
           updated_at = datetime('now')
     WHERE id = ?
       AND status IN ('pending', 'failed')
       AND attempts < ?
  `),
  updateTournamentLuckyRaiderPayoutDestination: db.prepare(`
    UPDATE tournament_lucky_raider_payouts
       SET destination_wallet = ?,
           updated_at = datetime('now')
     WHERE id = ?
  `),
  markTournamentLuckyRaiderPayoutPaid: db.prepare(`
    UPDATE tournament_lucky_raider_payouts
       SET status = 'paid',
           tx_hash = ?,
           clash_usd_price = ?,
           clash_amount = ?,
           clash_amount_units = ?,
           price_source = ?,
           error = NULL,
           paid_at = datetime('now'),
           updated_at = datetime('now')
     WHERE id = ?
  `),
  markTournamentLuckyRaiderPayoutFailed: db.prepare(`
    UPDATE tournament_lucky_raider_payouts
       SET status = 'failed',
           error = ?,
           updated_at = datetime('now')
     WHERE id = ?
       AND status = 'processing'
  `),
  voidTournamentLuckyRaiderPendingPayouts: db.prepare(`
    UPDATE tournament_lucky_raider_payouts
       SET status = 'void',
           error = ?,
           updated_at = datetime('now')
     WHERE tournament_id = ?
       AND day_utc = ?
       AND status IN ('pending', 'failed', 'processing')
  `),
  addTournamentAwardedPoints: db.prepare(`
    UPDATE tournament_participants
       SET awarded_points = awarded_points + ?,
           last_activity_at = COALESCE(last_activity_at, datetime('now'))
     WHERE tournament_id = ? AND player_id = ?
  `),
  seedTournamentAwardedPoints: db.prepare(`
    UPDATE tournament_participants
       SET awarded_points = CASE
         WHEN awarded_points > ? THEN awarded_points
         ELSE ?
       END
     WHERE tournament_id = ? AND player_id = ?
  `),
};

// ── Tournament: trophy freeze helper ──────────────────────────────────
// Returns the active tournament row for `playerId` if the player has
// joined an active tournament for their DEX. Null when no active
// tournament — battle/quest paths fall back to normal main-stat writes.
// The query is cached (prepared statement above) so this is sub-ms even
// in the inner battle loop.
function getPlayerActiveTournament(playerId) {
  if (!playerId) return null;
  return stmts.getActiveTournamentForPlayer.get(playerId) || null;
}

function getPlayerTournamentById(playerId, tournamentId) {
  if (!playerId || !tournamentId) return null;
  return stmts.getTournamentByIdForPlayer.get(tournamentId, playerId) || null;
}

const TOURNAMENT_ATTACK_MATCH_POLICIES = new Set(['all', 'enemy_or_non_participant', 'enemy_only']);

function normalizeTournamentAttackMatchPolicy(value) {
  const policy = String(value || 'all').trim().toLowerCase();
  return TOURNAMENT_ATTACK_MATCH_POLICIES.has(policy) ? policy : 'all';
}

function getTournamentAttackMatchContext(playerId) {
  if (!playerId) return null;
  const row = stmts.getActiveTournamentAttackPolicyForPlayer.get(playerId);
  if (!row) return null;
  const policy = normalizeTournamentAttackMatchPolicy(row.attack_match_policy);
  if (policy === 'all') return null;
  const teamDex = String(row.team_dex || row.player_dex || '').trim().toLowerCase();
  if (!teamDex) return null;
  return {
    tournament_id: row.tournament_id,
    tournament_name: row.name,
    attack_match_policy: policy,
    team_dex: teamDex,
  };
}

function tournamentAttackRestrictionForTarget(ctx, targetId) {
  if (!ctx || !targetId) return { allowed: true, reason: 'no_policy' };
  const defender = stmts.getTournamentParticipantTeam.get(ctx.tournament_id, targetId);
  if (defender) {
    const defenderTeam = String(defender.team_dex || defender.player_dex || '').trim().toLowerCase();
    if (defenderTeam && defenderTeam === ctx.team_dex) {
      return {
        allowed: false,
        reason: 'same_team',
        tournament_id: ctx.tournament_id,
        policy: ctx.attack_match_policy,
        attacker_team: ctx.team_dex,
        defender_team: defenderTeam,
      };
    }
    return {
      allowed: true,
      reason: 'enemy_team',
      tournament_id: ctx.tournament_id,
      policy: ctx.attack_match_policy,
      attacker_team: ctx.team_dex,
      defender_team: defenderTeam || null,
    };
  }
  if (ctx.attack_match_policy === 'enemy_only') {
    return {
      allowed: false,
      reason: 'not_tournament_participant',
      tournament_id: ctx.tournament_id,
      policy: ctx.attack_match_policy,
      attacker_team: ctx.team_dex,
      defender_team: null,
    };
  }
  return {
    allowed: true,
    reason: 'non_participant',
    tournament_id: ctx.tournament_id,
    policy: ctx.attack_match_policy,
    attacker_team: ctx.team_dex,
    defender_team: null,
  };
}

function tournamentAttackPolicyError(ctx, restriction, targetName = '') {
  if (!ctx || !restriction || restriction.allowed) return null;
  const team = String(ctx.team_dex || '').toUpperCase();
  if (restriction.reason === 'same_team') {
    return targetName
      ? `${targetName} is on your ${team} tournament team. Same-team attacks are disabled for this tournament.`
      : `No valid targets found: same-team attacks are disabled for your ${team} tournament team.`;
  }
  return targetName
    ? `${targetName} is not registered on an enemy tournament team. This tournament only allows enemy-team attacks.`
    : 'No valid targets found: this tournament only allows attacks against registered enemy-team players.';
}

function filterTournamentAttackCandidates(playerId, candidates) {
  const ctx = getTournamentAttackMatchContext(playerId);
  if (!ctx || !Array.isArray(candidates) || candidates.length === 0) {
    return { candidates: candidates || [], context: ctx, blocked: [] };
  }
  const allowed = [];
  const blocked = [];
  for (const candidate of candidates) {
    const restriction = tournamentAttackRestrictionForTarget(ctx, candidate.id);
    if (restriction.allowed) allowed.push(candidate);
    else blocked.push({ id: candidate.id, name: candidate.name, ...restriction });
  }
  return { candidates: allowed, context: ctx, blocked };
}

// Apply a trophy delta to the right destination:
//   - Player NOT in active tournament  → players.trophies += delta (existing behaviour)
//   - Player IS  in active tournament  → tournament_participants.trophies += boosted delta;
//                                        players.trophies UNCHANGED (frozen).
// `delta` may be negative (battle loss). Negative deltas skip the boost
// — boosts are positive incentives only, you don't get "extra punished"
// in a 2× trophy boost tournament.
//
// Used by `battleVictoryTxn` and `battleDefeat`. Preserves the previous
// "trophies clamps to zero" behaviour by capping main updates and
// relying on `MAX(0, ...)` in `bumpTournamentTrophies` for the
// participant counter.
function applyMainTrophyDelta(playerId, delta) {
  const cur = stmts.getPlayerById.get(playerId)?.trophies || 0;
  const next = Math.max(0, cur + delta);
  stmts.updateTrophies.run(next, playerId);
  console.log(`[trophy] player=${playerId.slice(0,8)} MAIN ${cur} ${delta>=0?'+':''}${delta} -> ${next}`);
  return next;
}

function applyTrophyDelta(playerId, delta, opts = {}) {
  if (!playerId || !delta) return;
  if (delta > 0 && opts.source === 'attack_win') {
    try {
      recordStandaloneLuckyRaiderAttackWin(playerId, opts.eventId || opts.battleSessionId || opts.battle_session_id || `attack:${playerId}:${Date.now()}`);
    } catch (e) {
      console.warn('[lucky-raider attack activity]', e.message);
    }
  }
  const t = getPlayerActiveTournament(playerId);
  if (t) {
    const boosted = delta > 0
      ? Math.round(delta * Number(t.trophy_boost || 1))
      : delta;
    const freezeTrophies = Number(t.freeze_trophies ?? 1) !== 0;
    stmts.bumpTournamentTrophies.run(boosted, t.tournament_id, playerId);
    if (delta > 0 && opts.source === 'attack_win') {
      recordTournamentDailyActivity(t, playerId, { trophies: boosted }, {
        source: 'attack_win',
        eventId: opts.eventId || opts.battleSessionId || opts.battle_session_id || `attack:${playerId}:${Date.now()}`,
      });
    }
    if (!freezeTrophies) {
      applyMainTrophyDelta(playerId, delta);
    }
    console.log(`[trophy] player=${playerId.slice(0,8)} TOURNAMENT t=${t.tournament_id} delta=${delta} boosted=${boosted} main=${freezeTrophies ? 'FROZEN' : 'LIVE'}`);
    return;
  }
  // No tournament — apply to main, clamping at zero like the legacy code.
  applyMainTrophyDelta(playerId, delta);
}

// Apply tournament gold_boost to a base gold reward and record the boosted
// amount in tournament_participants.gold for the leaderboard. Seeker/Saga
// players can receive an extra per-tournament seeker_gold_boost.
//   - Returns the gold amount the caller should actually credit to
//     `players.gold` (boosted when in tournament, original otherwise).
//   - The caller still owns the players.gold update via addResources();
//     this helper only handles the boost math + leaderboard bookkeeping.
//   - Negative or zero deltas pass through unchanged (boosts are positive
//     incentives only — same policy as applyTrophyDelta).
function applyGoldReward(playerId, baseGold) {
  const amount = Number(baseGold) || 0;
  if (!playerId || amount <= 0) return amount;
  const t = getPlayerActiveTournament(playerId);
  if (!t) return amount;
  const baseBoost = Number(t.gold_boost || 1) || 1;
  const seekerBoost = Number(t.is_seeker || 0) === 1 ? (Number(t.seeker_gold_boost || 1) || 1) : 1;
  const multiplier = Math.min(10, Math.max(0.1, baseBoost) * Math.max(0.1, seekerBoost));
  const boosted = Math.round(amount * multiplier);
  stmts.bumpTournamentGold.run(boosted, t.tournament_id, playerId);
  console.log(`[gold-boost] player=${playerId.slice(0,8)} t=${t.tournament_id} base=${amount} boost=${baseBoost}x seeker=${seekerBoost}x -> ${boosted}`);
  return boosted;
}

// Track filled trades in the active tournament leaderboard. No-op outside
// tournaments. Volume and pnl are already-vetted USD numbers from the
// caller's per-trade clamp loop, summed across `count` trades.
function recordTournamentTrade(playerId, volumeUsd, pnlUsd, count = 1, opts = {}) {
  if (!playerId) return;
  const c = Number(count) || 0;
  if (c <= 0) return;
  const t = getPlayerActiveTournament(playerId);
  if (!t) return;
  const activityDex = resolveTournamentActivityDex(t, opts);
  if (firstPresentTournamentDex([opts.dex, opts.trading_dex]) !== null && !activityDex) return;
  stmts.bumpTournamentTrade.run(
    c,
    Number(volumeUsd) || 0,
    Number(pnlUsd) || 0,
    t.tournament_id,
    playerId
  );
  recordTournamentDailyActivity(t, playerId, {
    trades_count: c,
    volume_usd: Number(volumeUsd) || 0,
    pnl_usd: Number(pnlUsd) || 0,
  }, {
    source: 'trade_summary',
    eventId: `summary:${playerId}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    dex: activityDex,
  });
}

function sqlDateMs(v) {
  if (!v) return null;
  const s = String(v)
    .replace(/[zZ]$/, '')
    .replace(/\s*UTC$/i, '')
    .replace(' ', 'T')
    .trim();
  const ms = Date.parse(`${s}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function tradeInTournamentWindow(t, row) {
  const tradeMs = sqlDateMs(row?.created_at) ?? Date.now();
  const startMs = Math.max(sqlDateMs(t.start_at) ?? 0, sqlDateMs(t.joined_at) ?? 0);
  const endMs = sqlDateMs(t.end_at) ?? Infinity;
  return tradeMs >= startMs && tradeMs <= endMs;
}

function tournamentPausePeriods(tournamentId) {
  if (!tournamentId) return [];
  return db.prepare(`
    SELECT paused_at, resumed_at
    FROM tournament_pause_periods
    WHERE tournament_id = ?
    ORDER BY paused_at ASC, id ASC
  `).all(tournamentId).map((period) => ({
    startMs: sqlDateMs(period.paused_at) ?? -Infinity,
    endMs: sqlDateMs(period.resumed_at) ?? Infinity,
  }));
}

function tradeFallsInTournamentPause(periods, row) {
  if (!periods.length) return false;
  const tradeMs = sqlDateMs(row?.created_at);
  if (tradeMs === null) return false;
  return periods.some((period) => tradeMs >= period.startMs && tradeMs < period.endMs);
}

function utcDayFromMs(ms) {
  const d = new Date(Number.isFinite(ms) ? ms : Date.now());
  return d.toISOString().slice(0, 10);
}

function utcDayFromSql(value) {
  return utcDayFromMs(sqlDateMs(value) ?? Date.now());
}

function parseTournamentRewardConfig(value) {
  let raw = value;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) raw = {};
    else {
      try { raw = JSON.parse(text); } catch { raw = {}; }
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const luckyRaw = raw.lucky_daily_raider && typeof raw.lucky_daily_raider === 'object'
    ? raw.lucky_daily_raider
    : {};
  const collections = Array.isArray(luckyRaw.required_collections)
    ? luckyRaw.required_collections
    : [];
  const requiredCollections = collections
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => ['demon_king', 'dragon'].includes(v));
  const ticketMetricRaw = String(luckyRaw.ticket_metric || luckyRaw.metric || 'volume').trim().toLowerCase();
  const ticketMetric = ['volume', 'attack_wins', 'attack_wins_plus_volume', 'volume_or_attack_wins', 'volume_and_attack_wins'].includes(ticketMetricRaw)
    ? ticketMetricRaw
    : 'volume';
  const maxTickets = Math.max(1, Math.min(100000, Math.floor(Number(luckyRaw.max_tickets || 20) || 20)));
  const manualWinners = normalizeLuckyRaiderManualWinners(luckyRaw.manual_winners ?? luckyRaw.manual_winner_ids ?? luckyRaw.manual_winners_text);
  return {
    ...raw,
    daily_pools: Array.isArray(raw.daily_pools) ? raw.daily_pools : [],
    final_pools: Array.isArray(raw.final_pools) ? raw.final_pools : [],
    lucky_daily_raider: {
      enabled: !!luckyRaw.enabled,
      label: String(luckyRaw.label || 'Lucky Daily Raider').slice(0, 80),
      ticket_metric: ticketMetric,
      volume_per_ticket_usd: Math.max(1, Math.min(10_000_000, Number(luckyRaw.volume_per_ticket_usd || 1000) || 1000)),
      volume_tickets_per_step: Math.max(1, Math.min(100000, Math.floor(Number(luckyRaw.volume_tickets_per_step ?? luckyRaw.volume_bonus_tickets_per_step ?? 1) || 1))),
      attack_wins_per_ticket: Math.max(1, Math.min(100000, Math.floor(Number(luckyRaw.attack_wins_per_ticket || 10) || 10))),
      min_town_hall_level: Math.max(0, Math.min(20, Math.floor(Number(luckyRaw.min_town_hall_level ?? luckyRaw.min_th ?? 0) || 0))),
      min_attack_wins: Math.max(0, Math.min(100000, Math.floor(Number(luckyRaw.min_attack_wins || 0) || 0))),
      winner_count: Math.max(1, Math.min(100, Math.floor(Number(luckyRaw.winner_count || luckyRaw.winners || 1) || 1))),
      max_tickets: maxTickets,
      max_counted_attacks: Math.max(1, Math.min(100000, Math.floor(Number(luckyRaw.max_counted_attacks || luckyRaw.max_attack_tickets || maxTickets) || maxTickets))),
      max_volume_tickets: Math.max(0, Math.min(100000, Math.floor(Number(luckyRaw.max_volume_tickets ?? luckyRaw.max_volume_bonus_tickets ?? 0) || 0))),
      require_nft: !!luckyRaw.require_nft,
      required_collections: requiredCollections.length ? requiredCollections : ['demon_king', 'dragon'],
      rewards: Array.isArray(luckyRaw.rewards) ? luckyRaw.rewards : [],
      draw_time_utc: String(luckyRaw.draw_time_utc || '00:05').slice(0, 16),
      manual_winners: manualWinners,
    },
  };
}

function normalizeLuckyRaiderManualWinners(value) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || '')
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  const seen = new Set();
  const winners = [];
  for (const item of rawItems) {
    const raw = typeof item === 'object' && item
      ? String(item.player_id || item.id || item.name || item.wallet || item.identifier || '').trim()
      : String(item || '').trim();
    const identifier = raw.replace(/^@+/, '').trim();
    if (!identifier) continue;
    const key = identifier.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    winners.push(identifier.slice(0, 160));
    if (winners.length >= 100) break;
  }
  return winners;
}

function tournamentLuckyRaiderConfig(t) {
  return parseTournamentRewardConfig(t?.reward_config).lucky_daily_raider;
}

function tournamentHasLuckyRaider(t) {
  return !!tournamentLuckyRaiderConfig(t).enabled;
}

function isDailyPoolTournament(t) {
  return String(t?.scoring_mode || 'live').toLowerCase() === 'daily_pool';
}

function tournamentNeedsDailyActivity(t) {
  return isDailyPoolTournament(t) || tournamentHasLuckyRaider(t);
}

const TOURNAMENT_CREDIT_DEXES = new Set([
  'pacifica',
  'avantis',
  'decibel',
  'dango',
  'gmx',
  'ostium',
  'monad',
  'phoenix',
  'hyperliquid',
  'risex',
  'nado',
  'hibachi',
  'hotstuff',
  'grvt',
  'katana',
  'gmtrade',
  'flash',
  'lighter',
]);

function normalizeTournamentCreditDex(value) {
  const dex = String(value || '').trim().toLowerCase();
  return TOURNAMENT_CREDIT_DEXES.has(dex) ? dex : null;
}

function normalizeTournamentCreditDexList(value) {
  let raw = value;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try { raw = JSON.parse(trimmed); }
    catch { raw = trimmed.split(',').map((item) => item.trim()); }
  }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const dex = normalizeTournamentCreditDex(item);
    if (dex && !out.includes(dex)) out.push(dex);
  }
  return out;
}

function tournamentEligibleCreditDexes(t) {
  const scope = String(t?.dex_scope || 'single').trim().toLowerCase();
  if (scope === 'all') return [...TOURNAMENT_CREDIT_DEXES];
  const list = normalizeTournamentCreditDexList(t?.eligible_dexes);
  if (list.length) return list;
  const dex = normalizeTournamentCreditDex(t?.dex);
  return dex ? [dex] : [];
}

function tournamentSingleCreditDex(t) {
  const eligible = tournamentEligibleCreditDexes(t);
  const scope = String(t?.dex_scope || 'single').trim().toLowerCase();
  return scope !== 'all' && eligible.length === 1 ? eligible[0] : null;
}

function tournamentCreditDexAllowed(t, dex) {
  const normalized = normalizeTournamentCreditDex(dex);
  if (!normalized) return null;
  return tournamentEligibleCreditDexes(t).includes(normalized) ? normalized : null;
}

function firstPresentTournamentDex(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return null;
}

function resolveTournamentCreditDex(t, row = {}, opts = {}) {
  // A concrete trade DEX is authoritative. If it is outside the tournament,
  // reject the row instead of relabelling it as the tournament's only DEX.
  const explicitDex = firstPresentTournamentDex([
    opts.dex,
    opts.trading_dex,
    row?.dex,
    row?.trading_dex,
  ]);
  if (explicitDex !== null) return tournamentCreditDexAllowed(t, explicitDex);

  const participantDexes = [
    row?.team_dex,
    row?.player_dex,
  ];
  for (const candidate of participantDexes) {
    const dex = tournamentCreditDexAllowed(t, candidate);
    if (dex) return dex;
  }
  return tournamentSingleCreditDex(t);
}

function resolveTournamentActivityDex(t, opts = {}) {
  const explicitDex = firstPresentTournamentDex([opts.dex, opts.trading_dex]);
  if (explicitDex !== null) return tournamentCreditDexAllowed(t, explicitDex);
  const participantDex = firstPresentTournamentDex([opts.team_dex, opts.player_dex]);
  return tournamentCreditDexAllowed(t, participantDex) || tournamentSingleCreditDex(t);
}

function dailyPoolWeights(t) {
  const weights = {
    trophies: Number(t?.points_trophy_weight || 0),
    volume: Number(t?.points_volume_weight || 0),
    pnl: Number(t?.points_pnl_weight || 0),
  };
  const total = weights.trophies + weights.volume + weights.pnl;
  if (!Number.isFinite(total) || total <= 0) return { trophies: 20, volume: 60, pnl: 20 };
  return weights;
}

function recordTournamentDailyActivity(t, playerId, metrics = {}, opts = {}) {
  if (!playerId || !tournamentNeedsDailyActivity(t)) return false;
  const eventId = String(opts.eventId || opts.event_id || '').trim();
  if (!eventId) return false;
  const source = String(opts.source || 'event').trim() || 'event';
  const eventTime = opts.createdAt || opts.created_at || new Date().toISOString();
  const eventMs = sqlDateMs(eventTime);
  const enabledMs = sqlDateMs(t.daily_pool_enabled_at);
  if (enabledMs && eventMs && eventMs < enabledMs) return false;
  const day = opts.day || tournamentActivityDayForEvent(t, eventMs ?? Date.now());
  const activityDex = resolveTournamentActivityDex(t, opts);
  if (firstPresentTournamentDex([opts.dex, opts.trading_dex]) !== null && !activityDex) return false;
  const r = stmts.insertTournamentDailyActivity.run(
    t.tournament_id || t.id,
    day,
    playerId,
    source,
    eventId,
    activityDex,
    Math.max(0, Math.floor(Number(metrics.trades_count || metrics.tradesCount || 0))),
    Math.max(0, safeUsd(metrics.volume_usd ?? metrics.volumeUsd ?? 0)),
    safeUsd(metrics.pnl_usd ?? metrics.pnlUsd ?? 0),
    Math.max(0, Math.floor(Number(metrics.trophies || 0))),
    Math.max(0, Math.floor(Number(metrics.gold || 0)))
  );
  return r.changes > 0;
}

function isTournamentAvailableForPlayerRow(t, player) {
  if (!t || !player) return false;
  const dex = String(player.dex || '').toLowerCase();
  const scope = String(t.dex_scope || 'single').toLowerCase();
  if (scope === 'all') return true;
  if (String(t.dex || '').toLowerCase() === dex) return true;
  return String(t.eligible_dexes || '[]').includes(`"${dex}"`);
}

function ensurePassiveTournamentParticipant(t, player) {
  if (!t?.id || !player?.id) return false;
  db.prepare(`
    INSERT INTO tournament_participants (tournament_id, player_id, joined_at, left_at, trophies, gold, trades_count, volume_usd, pnl_usd, team_dex, reward_wallet_evm, last_activity_at)
    VALUES (?, ?, datetime('now'), NULL, 0, 0, 0, 0, 0, NULL, NULL, datetime('now'))
    ON CONFLICT(tournament_id, player_id) DO UPDATE SET
      left_at = NULL,
      last_activity_at = datetime('now')
  `).run(t.id, player.id);
  return true;
}

function recordStandaloneLuckyRaiderAttackWin(playerId, eventId) {
  if (!playerId || !eventId) return { recorded: 0 };
  const player = stmts.getPlayerById.get(playerId);
  if (!player) return { recorded: 0 };
  const rows = db.prepare(`
    SELECT *
    FROM tournaments
    WHERE status = 'active'
      AND paused_at IS NULL
      AND COALESCE(event_kind, 'standard') = 'lucky_raider'
      AND (COALESCE(seeker_only, 0) = 0 OR COALESCE(?, 0) = 1)
      AND (end_at IS NULL OR replace(replace(end_at, 'T', ' '), ' UTC', '') > datetime('now'))
      AND replace(replace(start_at, 'T', ' '), ' UTC', '') <= datetime('now')
    ORDER BY id DESC
    LIMIT 20
  `).all(Number(player.is_seeker || 0));
  let recorded = 0;
  for (const t of rows) {
    if (!isTournamentAvailableForPlayerRow(t, player)) continue;
    if (!tournamentHasLuckyRaider(t)) continue;
    ensurePassiveTournamentParticipant(t, player);
    if (recordTournamentDailyActivity(t, playerId, {}, {
      source: 'attack_win',
      eventId: `lucky:${t.id}:${eventId}`,
      dex: player.dex,
    })) {
      recorded++;
    }
  }
  return { recorded };
}

function safeUsd(v, maxAbs = 10_000_000) {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > maxAbs) return 0;
  return n;
}

function getTournamentTradeSyncState(tournamentId, playerId, dex, source = 'trade_history') {
  const tid = Number(tournamentId);
  const normalizedDex = String(dex || '').trim().toLowerCase();
  const normalizedSource = String(source || 'trade_history').trim() || 'trade_history';
  if (!Number.isFinite(tid) || tid <= 0 || !playerId || !normalizedDex) return null;
  return stmts.getTournamentTradeSyncState.get(tid, String(playerId), normalizedDex, normalizedSource) || null;
}

function setTournamentTradeSyncState(input = {}) {
  const tid = Number(input.tournamentId ?? input.tournament_id);
  const playerId = String(input.playerId ?? input.player_id ?? '').trim();
  const dex = String(input.dex || '').trim().toLowerCase();
  const source = String(input.source || 'trade_history').trim() || 'trade_history';
  if (!Number.isFinite(tid) || tid <= 0 || !playerId || !dex) {
    throw new Error('invalid tournament trade sync state');
  }
  const lastTradeId = Math.max(0, Math.floor(Number(input.lastTradeId ?? input.last_trade_id) || 0));
  const lastUpdatedAt = String(input.lastUpdatedAt ?? input.last_updated_at ?? '').trim() || null;
  const lastUpdatedTradeId = Math.max(0, Math.floor(Number(input.lastUpdatedTradeId ?? input.last_updated_trade_id) || 0));
  const lastReconciledAt = String(input.lastReconciledAt ?? input.last_reconciled_at ?? '').trim() || null;
  stmts.upsertTournamentTradeSyncState.run(
    tid,
    playerId,
    dex,
    source,
    lastTradeId,
    lastUpdatedAt,
    lastUpdatedTradeId,
    lastReconciledAt
  );
  return getTournamentTradeSyncState(tid, playerId, dex, source);
}

function tournamentTradeCreditsForRows(tournamentId, source, playerId, rows) {
  const tradeIds = [...new Set(rows
    .map((row) => row?.id ?? row?.history_id ?? row?.trade_id)
    .filter((tradeId) => tradeId !== undefined && tradeId !== null && tradeId !== '')
    .map(String))];
  const credits = new Map();
  const chunkSize = 500;
  for (let offset = 0; offset < tradeIds.length; offset += chunkSize) {
    const chunk = tradeIds.slice(offset, offset + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    const matches = db.prepare(`
      SELECT trade_id, player_id, dex, trades_count, volume_usd, pnl_usd
      FROM tournament_trade_credits
      WHERE tournament_id = ? AND source = ? AND player_id = ?
        AND trade_id IN (${placeholders})
    `).all(tournamentId, source, playerId, ...chunk);
    for (const credit of matches) credits.set(String(credit.trade_id), credit);
  }
  return credits;
}

function listTournamentTradeCreditIds(tournamentId, source, playerId) {
  return db.prepare(`
    SELECT trade_id
    FROM tournament_trade_credits
    WHERE tournament_id = ? AND source = ? AND player_id = ?
  `).all(tournamentId, source, playerId).map((row) => String(row.trade_id));
}

// Idempotently credits concrete futures trade_history rows into the active
// tournament. This is separate from trading_rewards.last_trade_id because some
// venues, especially Decibel, emit realised PnL later than the instant server
// order row. The ledger lets us sync that delayed PnL without minting volume or
// gold twice.
function recordTournamentTradeRows(playerId, rows, opts = {}) {
  if (!playerId || !Array.isArray(rows) || rows.length === 0) {
    return { credited_rows: 0, updated_rows: 0, dex_updated_rows: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0, pnl_delta_usd: 0 };
  }
  const t = opts.tournamentId || opts.tournament_id
    ? getPlayerTournamentById(playerId, opts.tournamentId || opts.tournament_id)
    : getPlayerActiveTournament(playerId);
  if (!t) return { credited_rows: 0, updated_rows: 0, dex_updated_rows: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0, pnl_delta_usd: 0 };

  const source = String(opts.source || 'trade_history');
  const creditCount = opts.count !== false;
  const creditVolume = opts.volume !== false;
  const creditPnl = opts.pnl !== false;
  let creditedRows = 0;
  let tradesCount = 0;
  let volumeUsd = 0;
  let pnlUsd = 0;
  let updatedRows = 0;
  let dexUpdatedRows = 0;
  let pnlDeltaUsd = 0;
  let insertedTradesCount = 0;
  let insertedVolumeUsd = 0;
  let insertedPnlUsd = 0;
  const existingCredits = tournamentTradeCreditsForRows(t.tournament_id, source, playerId, rows);
  const pausePeriods = tournamentPausePeriods(t.tournament_id);

  for (const row of rows) {
    if (row?.reward_duplicate) continue;
    if (!tradeInTournamentWindow(t, row)) continue;
    if (tradeFallsInTournamentPause(pausePeriods, row)) continue;
    const tradeId = row?.id ?? row?.history_id ?? row?.trade_id;
    if (tradeId === undefined || tradeId === null || tradeId === '') continue;
    const creditDex = resolveTournamentCreditDex(t, row, opts);
    if (!creditDex) continue;
    const count = creditCount ? 1 : 0;
    const volume = creditVolume ? Math.max(0, safeUsd(row.notional_usd ?? row.volume_usd ?? row.volume)) : 0;
    const pnl = creditPnl ? safeUsd(row.pnl ?? row.pnl_usd ?? row.realized_pnl ?? row.realised_pnl) : 0;
    const tradeKey = String(tradeId);
    let existing = existingCredits.get(tradeKey) || null;
    let inserted = false;
    if (!existing) {
      const r = stmts.insertTournamentTradeCredit.run(
        t.tournament_id,
        source,
        tradeKey,
        playerId,
        creditDex,
        count,
        volume,
        pnl
      );
      inserted = !!r.changes;
      if (inserted) {
        existingCredits.set(tradeKey, {
          trade_id: tradeKey,
          player_id: playerId,
          dex: creditDex,
          trades_count: count,
          volume_usd: volume,
          pnl_usd: pnl,
        });
      } else {
        // The unique key is tournament/source/trade_id, so a conflicting
        // credit may belong to another player and is intentionally ignored.
        existing = stmts.getTournamentTradeCredit.get(t.tournament_id, source, tradeKey);
      }
    }
    if (!inserted) {
      if (existing?.player_id === playerId) {
        if (normalizeTournamentCreditDex(existing.dex) !== creditDex) {
          const changedDex = stmts.updateTournamentTradeCreditDex.run(
            creditDex,
            t.tournament_id,
            source,
            tradeKey,
            playerId,
            creditDex
          )?.changes || 0;
          if (changedDex) {
            stmts.updateTournamentDailyActivityDex.run(
              creditDex,
              t.tournament_id,
              source,
              tradeKey,
              playerId,
              creditDex
            );
            existing.dex = creditDex;
            dexUpdatedRows += changedDex;
          }
        }
        const previousCount = Number(existing.trades_count || 0);
        const previousVolume = safeUsd(existing.volume_usd);
        const previousPnl = safeUsd(existing.pnl_usd);
        const targetCount = creditCount ? count : previousCount;
        const targetVolume = creditVolume ? volume : previousVolume;
        const targetPnl = creditPnl ? pnl : previousPnl;
        const countDelta = targetCount - previousCount;
        const volumeDelta = targetVolume - previousVolume;
        const pnlDelta = targetPnl - previousPnl;
        if (
          Math.abs(countDelta) >= 0.000001
          || Math.abs(volumeDelta) >= 0.000001
          || Math.abs(pnlDelta) >= 0.000001
        ) {
          const changed = stmts.updateTournamentTradeCreditMetrics.run(
            targetCount,
            targetVolume,
            targetPnl,
            t.tournament_id,
            source,
            tradeKey,
            playerId
          )?.changes || 0;
          if (changed) {
            stmts.bumpTournamentTrade.run(countDelta, volumeDelta, pnlDelta, t.tournament_id, playerId);
            const dailyChanged = stmts.bumpTournamentDailyActivityTradeMetrics.run(
              countDelta,
              volumeDelta,
              pnlDelta,
              t.tournament_id,
              source,
              tradeKey,
              playerId
            )?.changes || 0;
            if (!dailyChanged) {
              recordTournamentDailyActivity(t, playerId, {
                trades_count: targetCount,
                volume_usd: targetVolume,
                pnl_usd: targetPnl,
              }, {
                source,
                eventId: tradeKey,
                dex: creditDex,
                created_at: row.created_at,
              });
            }
            existing.trades_count = targetCount;
            existing.volume_usd = targetVolume;
            existing.pnl_usd = targetPnl;
            updatedRows++;
            tradesCount += countDelta;
            volumeUsd += volumeDelta;
            pnlUsd += pnlDelta;
            pnlDeltaUsd += pnlDelta;
          }
        }
      }
      continue;
    }
    recordTournamentDailyActivity(t, playerId, {
      trades_count: count,
      volume_usd: volume,
      pnl_usd: pnl,
    }, {
      source,
      eventId: tradeKey,
      dex: creditDex,
      created_at: row.created_at,
    });
    creditedRows++;
    tradesCount += count;
    volumeUsd += volume;
    pnlUsd += pnl;
    insertedTradesCount += count;
    insertedVolumeUsd += volume;
    insertedPnlUsd += pnl;
  }

  if (creditedRows > 0 && (insertedTradesCount !== 0 || insertedVolumeUsd !== 0 || insertedPnlUsd !== 0)) {
    stmts.bumpTournamentTrade.run(insertedTradesCount, insertedVolumeUsd, insertedPnlUsd, t.tournament_id, playerId);
  }
  return { credited_rows: creditedRows, updated_rows: updatedRows, dex_updated_rows: dexUpdatedRows, trades_count: tradesCount, volume_usd: volumeUsd, pnl_usd: pnlUsd, pnl_delta_usd: pnlDeltaUsd };
}

function normalizeDailyPoolDay(day) {
  const s = String(day || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return utcDayFromSql(s || new Date().toISOString());
}

function previousUtcDay(now = new Date()) {
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 24 * 60 * 60 * 1000;
  return utcDayFromMs(ms);
}

function addUtcDays(day, count) {
  const ms = Date.parse(`${normalizeDailyPoolDay(day)}T00:00:00Z`) + (Number(count) || 0) * 24 * 60 * 60 * 1000;
  return utcDayFromMs(ms);
}

function normalizeDailyPoolAwardTimeUtc(value, fallback = '00:00') {
  const fallbackValue = /^\d{2}:\d{2}$/.test(String(fallback || '')) ? String(fallback) : '00:00';
  const raw = value === undefined || value === null || value === '' ? fallbackValue : String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return fallbackValue;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallbackValue;
  }
  return `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.floor(minutes)).padStart(2, '0')}`;
}

function dailyPoolAwardTimeMinutes(t) {
  const time = normalizeDailyPoolAwardTimeUtc(t?.daily_pool_award_time_utc, '00:00');
  return (Number(time.slice(0, 2)) * 60) + Number(time.slice(3, 5));
}

function dailyPoolAwardCutoffMs(t, dayInput) {
  const day = normalizeDailyPoolDay(dayInput);
  return Date.parse(`${day}T00:00:00Z`) + dailyPoolAwardTimeMinutes(t) * 60 * 1000;
}

function dailyPoolDayForEventMs(t, msInput) {
  const ms = Number.isFinite(msInput) ? msInput : Date.now();
  const utcDay = utcDayFromMs(ms);
  const cutoffMs = dailyPoolAwardCutoffMs(t, utcDay);
  return ms < cutoffMs ? addUtcDays(utcDay, -1) : utcDay;
}

function tournamentActivityDayForEvent(t, msInput) {
  if (!isDailyPoolTournament(t)) {
    return utcDayFromMs(Number.isFinite(msInput) ? msInput : Date.now());
  }
  return dailyPoolDayForEventMs(t, msInput);
}

function tournamentFirstDailyPoolDay(t) {
  const start = Math.max(
    sqlDateMs(t.start_at) ?? 0,
    sqlDateMs(t.daily_pool_enabled_at) ?? 0
  );
  return dailyPoolDayForEventMs(t, start || Date.now());
}

function tournamentDailyPoolActivityDays(t, dayInput) {
  const day = normalizeDailyPoolDay(dayInput);
  return [day];
}

function parseDailyPoolOverrides(value) {
  if (!value) return {};
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return {}; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [day, points] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) continue;
    const n = Number(points);
    if (!Number.isFinite(n) || n <= 0) continue;
    out[day] = Math.max(1, Math.min(1_000_000, Number(n.toFixed(4))));
  }
  return out;
}

function dailyPoolDayIndex(t, dayInput) {
  const firstMs = Date.parse(`${tournamentFirstDailyPoolDay(t)}T00:00:00Z`);
  const dayMs = Date.parse(`${normalizeDailyPoolDay(dayInput)}T00:00:00Z`);
  if (!Number.isFinite(firstMs) || !Number.isFinite(dayMs) || dayMs <= firstMs) return 0;
  return Math.max(0, Math.floor((dayMs - firstMs) / (24 * 60 * 60 * 1000)));
}

function tournamentDailyPoolPointsForDay(t, dayInput) {
  const day = normalizeDailyPoolDay(dayInput);
  const base = Math.max(1, Math.min(1_000_000, Number(t?.daily_pool_points || 1000) || 1000));
  const overrides = parseDailyPoolOverrides(t?.daily_pool_overrides);
  if (overrides[day] !== undefined) {
    return {
      points: overrides[day],
      base,
      growth_pct: Math.max(-99, Math.min(500, Number(t?.daily_pool_growth_pct || 0) || 0)),
      day_index: dailyPoolDayIndex(t, day),
      override: true,
    };
  }
  const growthPct = Math.max(-99, Math.min(500, Number(t?.daily_pool_growth_pct || 0) || 0));
  const dayIndex = dailyPoolDayIndex(t, day);
  const multiplier = Math.pow(1 + (growthPct / 100), dayIndex);
  const points = Math.max(1, Math.min(1_000_000, Number((base * multiplier).toFixed(4))));
  return { points, base, growth_pct: growthPct, day_index: dayIndex, override: false };
}

function tournamentLastClosedUtcDay(t, now = new Date()) {
  const yesterday = previousUtcDay(now);
  const endMs = sqlDateMs(t.end_at);
  const nowMs = now.getTime();
  if (!endMs) {
    if (String(t?.status || '').toLowerCase() === 'ended') {
      const row = db.prepare('SELECT MAX(day_utc) AS day_utc FROM tournament_daily_activity WHERE tournament_id = ?')
        .get(t.id || t.tournament_id);
      return row?.day_utc || addUtcDays(tournamentFirstDailyPoolDay(t), -1);
    }
    return yesterday;
  }
  const endDay = utcDayFromMs(endMs - 1);
  if (endMs <= nowMs) return endDay;
  return endDay < yesterday ? endDay : yesterday;
}

function tournamentLastClosedDailyPoolDay(t, now = new Date()) {
  const nowMs = now.getTime();
  const today = utcDayFromMs(nowMs);
  const scheduledLast = nowMs >= dailyPoolAwardCutoffMs(t, today)
    ? addUtcDays(today, -1)
    : addUtcDays(today, -2);
  const endMs = sqlDateMs(t.end_at);
  if (!endMs) {
    if (String(t?.status || '').toLowerCase() === 'ended') {
      const row = db.prepare('SELECT MAX(day_utc) AS day_utc FROM tournament_daily_activity WHERE tournament_id = ?')
        .get(t.id || t.tournament_id);
      return row?.day_utc || addUtcDays(tournamentFirstDailyPoolDay(t), -1);
    }
    return scheduledLast;
  }
  const endDay = dailyPoolDayForEventMs(t, endMs - 1);
  if (endMs <= nowMs) return endDay;
  return endDay < scheduledLast ? endDay : scheduledLast;
}

function luckyRaiderDrawTimeMinutes(cfg) {
  const raw = String(cfg?.draw_time_utc || '00:05').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 5;
  const hours = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const minutes = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return hours * 60 + minutes;
}

function tournamentLastClosedLuckyRaiderDay(t, now = new Date()) {
  const baseLast = tournamentLastClosedUtcDay(t, now);
  const cfg = tournamentLuckyRaiderConfig(t);
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const yesterday = previousUtcDay(now);
  if (baseLast === yesterday && nowMinutes < luckyRaiderDrawTimeMinutes(cfg)) {
    return addUtcDays(baseLast, -1);
  }
  return baseLast;
}

function awardTournamentDailyPoolDay(tournamentId, dayInput, options = {}) {
  const tid = Number(tournamentId);
  const day = normalizeDailyPoolDay(dayInput);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: false, error: 'invalid tournament id' };
  return db.transaction(() => {
    const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
    if (!t) return { ok: false, error: 'tournament not found' };
    if (!isDailyPoolTournament(t)) return { ok: true, skipped: true, reason: 'not_daily_pool', tournament_id: tid, day_utc: day };
    const existing = stmts.getTournamentDailyRun.get(tid, day);
    if (existing && !options.force) {
      return { ok: true, skipped: true, alreadyProcessed: true, tournament_id: tid, day_utc: day };
    }
    if (existing && options.force) {
      db.prepare('DELETE FROM tournament_daily_awards WHERE tournament_id = ? AND day_utc = ?').run(tid, day);
      db.prepare('DELETE FROM tournament_daily_point_runs WHERE tournament_id = ? AND day_utc = ?').run(tid, day);
      db.prepare(`
        UPDATE tournament_participants
           SET awarded_points = COALESCE((
             SELECT SUM(points)
               FROM tournament_daily_awards a
              WHERE a.tournament_id = tournament_participants.tournament_id
                AND a.player_id = tournament_participants.player_id
           ), 0)
         WHERE tournament_id = ?
      `).run(tid);
    }

    const activityDays = tournamentDailyPoolActivityDays(t, day);
    const activityDayPlaceholders = activityDays.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT player_id,
             COALESCE(SUM(trades_count), 0) AS trades_count,
             COALESCE(SUM(volume_usd), 0) AS volume_usd,
             COALESCE(SUM(pnl_usd), 0) AS pnl_usd,
             COALESCE(SUM(trophies), 0) AS trophies
        FROM tournament_daily_activity
       WHERE tournament_id = ? AND day_utc IN (${activityDayPlaceholders})
       GROUP BY player_id
    `).all(tid, ...activityDays);
    const poolState = tournamentDailyPoolPointsForDay(t, day);
    const pool = Math.max(0, Number(poolState.points || t.daily_pool_points || 1000) || 0);
    const weights = dailyPoolWeights(t);
    const categories = [
      { key: 'trophies', column: 'trophies', weight: weights.trophies },
      { key: 'volume', column: 'volume_usd', weight: weights.volume },
      { key: 'pnl', column: 'pnl_usd', weight: weights.pnl },
    ];
    const details = { pool, pool_state: poolState, weights, activity_days: activityDays, categories: {} };
    let awardedTotal = 0;
    for (const cat of categories) {
      const catPool = pool * (Math.max(0, Number(cat.weight) || 0) / 100);
      const signedTotal = rows.reduce((sum, row) => sum + (Number(row[cat.column]) || 0), 0);
      const values = rows.map((row) => ({
        player_id: row.player_id,
        value: Math.max(0, Number(row[cat.column]) || 0),
      })).filter((row) => row.value > 0);
      const totalRaw = values.reduce((sum, row) => sum + row.value, 0);
      const negativeTotal = rows.reduce((sum, row) => {
        const value = Number(row[cat.column]) || 0;
        return value < 0 ? sum + Math.abs(value) : sum;
      }, 0);
      // PnL is positive-only: losing players contribute zero and never reduce
      // the pool shared by profitable players.
      const disabledReason = cat.key === 'pnl' && totalRaw <= 0
        ? 'no_positive_pnl'
        : null;
      details.categories[cat.key] = {
        pool: Number(catPool.toFixed(6)),
        raw_total: Number(totalRaw.toFixed(6)),
        positive_total: Number(totalRaw.toFixed(6)),
        negative_total: Number(negativeTotal.toFixed(6)),
        signed_total: Number(signedTotal.toFixed(6)),
        players: disabledReason ? 0 : values.length,
        ...(disabledReason ? { skipped: disabledReason } : {}),
      };
      if (disabledReason) continue;
      if (catPool <= 0 || totalRaw <= 0) continue;
      for (const row of values) {
        const points = Number((catPool * (row.value / totalRaw)).toFixed(6));
        if (points <= 0) continue;
        const r = stmts.insertTournamentDailyAward.run(tid, day, row.player_id, cat.key, points, row.value);
        if (!r.changes) continue;
        stmts.addTournamentAwardedPoints.run(points, tid, row.player_id);
        awardedTotal += points;
      }
    }
    stmts.insertTournamentDailyRun.run(tid, day, awardedTotal, JSON.stringify(details));
    return {
      ok: true,
      tournament_id: tid,
      day_utc: day,
      players: rows.length,
      awarded_points: Number(awardedTotal.toFixed(6)),
      details,
    };
  })();
}

function awardLatestClosedTournamentDailyPoolDay(tournamentId, options = {}) {
  const tid = Number(tournamentId);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: false, error: 'invalid tournament id' };
  const now = options.now instanceof Date ? options.now : new Date();
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return { ok: false, error: 'tournament not found' };
  if (!isDailyPoolTournament(t)) return { ok: true, skipped: true, reason: 'not_daily_pool', tournament_id: tid };
  const day = tournamentLastClosedDailyPoolDay(t, now);
  const firstDay = tournamentFirstDailyPoolDay(t);
  if (firstDay > day) {
    return { ok: true, skipped: true, reason: 'no_awardable_day', tournament_id: tid, day_utc: day };
  }
  return awardTournamentDailyPoolDay(tid, day, options);
}

function playerHasTournamentRewardNft(playerId, collections = ['demon_king', 'dragon']) {
  const allowed = (Array.isArray(collections) ? collections : [])
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => ['demon_king', 'dragon'].includes(v));
  const list = allowed.length ? allowed : ['demon_king', 'dragon'];
  const placeholders = list.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT 1 AS ok
      FROM player_nfts
     WHERE player_id = ?
       AND active = 1
       AND collection IN (${placeholders})
     LIMIT 1
  `).get(playerId, ...list);
  return !!row;
}

function weightedLuckyRaiderWinner(entries, seed) {
  const eligible = (entries || []).filter((entry) => Number(entry.tickets || 0) > 0 && Number(entry.eligible || 0) === 1);
  const totalTickets = eligible.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.tickets || 0))), 0);
  if (totalTickets <= 0) return { winner: null, totalTickets: 0, pick: null };
  const hex = crypto.createHash('sha256').update(String(seed)).digest('hex');
  let cursor = Number(BigInt(`0x${hex.slice(0, 15)}`) % BigInt(totalTickets));
  const pick = cursor;
  for (const entry of eligible) {
    const tickets = Math.max(0, Math.floor(Number(entry.tickets || 0)));
    if (cursor < tickets) return { winner: entry, totalTickets, pick };
    cursor -= tickets;
  }
  return { winner: eligible[eligible.length - 1] || null, totalTickets, pick };
}

function weightedLuckyRaiderWinners(entries, seed, count = 1) {
  const targetCount = Math.max(1, Math.min(100, Math.floor(Number(count || 1) || 1)));
  let remaining = (entries || []).filter((entry) => Number(entry.tickets || 0) > 0 && Number(entry.eligible || 0) === 1);
  const initialTotalTickets = remaining.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.tickets || 0))), 0);
  const winners = [];
  const picks = [];
  for (let place = 1; place <= targetCount && remaining.length > 0; place += 1) {
    const totalTickets = remaining.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.tickets || 0))), 0);
    if (totalTickets <= 0) break;
    const hex = crypto.createHash('sha256').update(`${seed}:${place}`).digest('hex');
    let cursor = Number(BigInt(`0x${hex.slice(0, 15)}`) % BigInt(totalTickets));
    const pick = cursor;
    let selectedIndex = remaining.length - 1;
    for (let i = 0; i < remaining.length; i += 1) {
      const tickets = Math.max(0, Math.floor(Number(remaining[i].tickets || 0)));
      if (cursor < tickets) {
        selectedIndex = i;
        break;
      }
      cursor -= tickets;
    }
    const [winner] = remaining.splice(selectedIndex, 1);
    winners.push({ ...winner, place });
    picks.push({ place, pick, total_tickets: totalTickets });
  }
  return {
    winner: winners[0] || null,
    winners,
    totalTickets: initialTotalTickets,
    picks,
    pick: picks[0]?.pick ?? null,
  };
}

function resolveLuckyRaiderManualWinners(cfg, entries, count = 1) {
  const identifiers = normalizeLuckyRaiderManualWinners(cfg?.manual_winners || []);
  const targetCount = Math.max(1, Math.min(100, Math.floor(Number(count || 1) || 1)));
  if (!identifiers.length) return null;
  const byPlayerId = new Map((entries || []).map((entry) => [String(entry.player_id || '').toLowerCase(), entry]));
  const byName = new Map((entries || []).filter((entry) => entry.name).map((entry) => [String(entry.name).toLowerCase(), entry]));
  const winners = [];
  const unresolved = [];
  const seen = new Set();
  const lookupPlayer = db.prepare(`
    SELECT p.id AS player_id,
           p.name,
           COALESCE(p.is_bot, 0) AS is_bot
      FROM players p
     WHERE lower(p.id) = lower(?)
        OR lower(p.name) = lower(?)
        OR lower(COALESCE(p.wallet, '')) = lower(?)
        OR EXISTS (
          SELECT 1 FROM player_wallets pw
           WHERE pw.player_id = p.id
             AND lower(pw.address) = lower(?)
        )
        OR EXISTS (
          SELECT 1 FROM player_dex_accounts pda
           WHERE pda.player_id = p.id
             AND lower(COALESCE(pda.wallet_address, '')) = lower(?)
        )
     ORDER BY COALESCE(p.trophies, 0) DESC, p.created_at ASC
     LIMIT 1
  `);
  for (const identifier of identifiers) {
    if (winners.length >= targetCount) break;
    const key = String(identifier || '').toLowerCase();
    let entry = byPlayerId.get(key) || byName.get(key) || null;
    if (!entry) {
      const player = lookupPlayer.get(identifier, identifier, identifier, identifier, identifier);
      if (!player?.player_id) {
        unresolved.push(identifier);
        continue;
      }
      const playerKey = String(player.player_id).toLowerCase();
      entry = byPlayerId.get(playerKey) || {
        player_id: player.player_id,
        name: player.name || '',
        is_bot: Number(player.is_bot || 0) === 1,
        prize_eligible: Number(player.is_bot || 0) !== 1,
        volume_usd: 0,
        town_hall_level: getTownHallLevel(player.player_id),
        min_town_hall_level: Math.max(0, Math.floor(Number(cfg?.min_town_hall_level || 0) || 0)),
        attack_wins: 0,
        attack_losses: 0,
        attack_attempts: 0,
        raw_attack_wins: 0,
        raw_attack_losses: 0,
        raw_attack_attempts: 0,
        tickets: 1,
        eligible: 1,
        reason: 'manual_winner',
        details: {
          manual_winner: true,
          manual_identifier: identifier,
          volume_tickets: 0,
          raw_volume_tickets: 0,
          raw_volume_steps: 0,
          volume_tickets_per_step: Math.max(1, Math.floor(Number(cfg?.volume_tickets_per_step || 1) || 1)),
          attack_win_tickets: 0,
        },
      };
    }
    const playerKey = String(entry.player_id || '').toLowerCase();
    if (!playerKey || seen.has(playerKey)) continue;
    seen.add(playerKey);
    winners.push({
      ...entry,
      place: winners.length + 1,
      manual_override: true,
      reason: entry.reason === 'manual_winner' ? entry.reason : 'manual_override',
      tickets: Math.max(1, Math.floor(Number(entry.tickets || 0) || 0)),
      eligible: 1,
      details: {
        ...(entry.details || {}),
        manual_winner: true,
        manual_identifier: identifier,
      },
    });
  }
  const totalTickets = winners.reduce((sum, entry) => sum + Math.max(1, Math.floor(Number(entry.tickets || 0) || 0)), 0);
  return {
    winner: winners[0] || null,
    winners,
    totalTickets,
    picks: winners.map((entry) => ({ place: entry.place, pick: 'manual', total_tickets: totalTickets })),
    pick: winners.length ? 'manual' : null,
    manual: true,
    unresolved,
  };
}

const LUCKY_RAIDER_WIN_INTERVAL_DAYS = 3;

function luckyRaiderRecentWinnerIds(dayInput) {
  const day = normalizeDailyPoolDay(dayInput);
  const span = LUCKY_RAIDER_WIN_INTERVAL_DAYS - 1;
  const startDay = addUtcDays(day, -span);
  const endDay = addUtcDays(day, span);
  const ids = new Set();
  const rows = db.prepare(`
    SELECT winner_player_id, details_json
      FROM tournament_lucky_raider_runs
     WHERE status = 'completed'
       AND day_utc >= ?
       AND day_utc <= ?
       AND day_utc != ?
  `).all(startDay, endDay, day);
  for (const row of rows) {
    if (row?.winner_player_id) ids.add(String(row.winner_player_id));
    try {
      const details = JSON.parse(row?.details_json || '{}');
      const winners = Array.isArray(details?.winners) ? details.winners : [];
      for (const winner of winners) {
        if (winner?.player_id) ids.add(String(winner.player_id));
      }
    } catch {}
  }
  return ids;
}

function luckyRaiderRewardsForPlace(cfg, place) {
  const rewards = Array.isArray(cfg?.rewards) ? cfg.rewards : [];
  return rewards.map((reward) => {
    const payouts = Array.isArray(reward?.payouts) ? reward.payouts : [];
    const payout = payouts.find((p) => Number(p.rank) === Number(place));
    if (!payout || Number(payout.amount || 0) <= 0) return null;
    return {
      type: reward.type || 'custom',
      label: reward.label || reward.name || 'Reward',
      currency: reward.currency || null,
      unit: reward.unit || reward.currency || null,
      amount: Number(payout.amount || 0),
    };
  }).filter(Boolean);
}

function luckyRaiderRewardUsesClashToken(reward) {
  if (!reward || typeof reward !== 'object') return false;
  const currency = String(reward.currency || '').trim().toUpperCase();
  const unit = String(reward.unit || '').trim().toUpperCase();
  const symbol = String(reward.symbol || reward.token || '').trim().toUpperCase();
  return [currency, unit, symbol].some((value) => value === 'CLASH' || value === 'COP');
}

function luckyRaiderPayoutId(tournamentId, day, place, rewardIndex) {
  return `tlr:${Number(tournamentId)}:${normalizeDailyPoolDay(day)}:${Number(place)}:${Number(rewardIndex)}`;
}

function queueTournamentLuckyRaiderPayouts(t, dayInput, winners) {
  const tid = Number(t?.id);
  const day = normalizeDailyPoolDay(dayInput);
  if (!Number.isFinite(tid) || tid <= 0 || !Array.isArray(winners) || winners.length === 0) {
    return { queued: 0, skipped: 0 };
  }
  let queued = 0;
  let skipped = 0;
  for (const winner of winners) {
    const rewards = Array.isArray(winner?.rewards) ? winner.rewards : [];
    const place = Math.max(1, Math.floor(Number(winner?.place || 0) || 0));
    if (!winner?.player_id || place <= 0) continue;
    const participant = db.prepare(`
      SELECT tp.reward_wallet_evm,
             COALESCE(p.is_bot, 0) AS is_bot
        FROM tournament_participants tp
        LEFT JOIN players p ON p.id = tp.player_id
       WHERE tp.tournament_id = ? AND tp.player_id = ?
    `).get(tid, winner.player_id);
    const winnerIsBot = Number(participant?.is_bot || 0) === 1;
    for (let i = 0; i < rewards.length; i += 1) {
      const reward = rewards[i];
      if (!luckyRaiderRewardUsesClashToken(reward)) {
        skipped += 1;
        continue;
      }
      const amountUsd = Number(reward.amount || 0);
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        skipped += 1;
        continue;
      }
      if (winnerIsBot) {
        skipped += 1;
        continue;
      }
      const id = luckyRaiderPayoutId(tid, day, place, i);
      const metadata = {
        source: 'lucky_raider',
        tournament_name: t.name || '',
        player_name: winner.name || '',
        reward_type: reward.type || 'custom',
        reward_unit: reward.unit || reward.currency || '',
        amount_source: 'usd_budget',
      };
      const result = stmts.insertTournamentLuckyRaiderPayout.run(
        id,
        tid,
        day,
        place,
        i,
        winner.player_id,
        participant?.reward_wallet_evm || null,
        String(reward.label || 'CLASH reward').slice(0, 120),
        String(reward.currency || reward.unit || 'CLASH').toUpperCase().slice(0, 24),
        Number(amountUsd.toFixed(6)),
        'pending',
        JSON.stringify(metadata)
      );
      if (result.changes) queued += 1;
    }
  }
  return { queued, skipped };
}

function luckyRaiderTicketState(cfg, volume, attackWins) {
  const metric = String(cfg?.ticket_metric || 'volume').toLowerCase();
  const rawVolumeSteps = Math.floor(Math.max(0, Number(volume) || 0) / Math.max(1, Number(cfg?.volume_per_ticket_usd || 1000) || 1000));
  const volumeTicketsPerStep = Math.max(1, Math.floor(Number(cfg?.volume_tickets_per_step || 1) || 1));
  const rawVolumeTickets = rawVolumeSteps * volumeTicketsPerStep;
  const maxVolumeTickets = Math.max(0, Math.floor(Number(cfg?.max_volume_tickets || 0) || 0));
  const volumeTickets = maxVolumeTickets > 0 ? Math.min(rawVolumeTickets, maxVolumeTickets) : rawVolumeTickets;
  const attackTickets = Math.floor(Math.max(0, Math.floor(Number(attackWins) || 0)) / Math.max(1, Math.floor(Number(cfg?.attack_wins_per_ticket || 10) || 10)));
  let ticketsRaw = volumeTickets;
  if (metric === 'attack_wins') ticketsRaw = attackTickets;
  else if (metric === 'attack_wins_plus_volume') ticketsRaw = attackTickets + volumeTickets;
  else if (metric === 'volume_or_attack_wins') ticketsRaw = Math.max(volumeTickets, attackTickets);
  else if (metric === 'volume_and_attack_wins') ticketsRaw = Math.min(volumeTickets, attackTickets);
  const minAttackWins = Math.max(0, Math.floor(Number(cfg?.min_attack_wins || 0) || 0));
  let reason = ticketsRaw > 0 ? 'eligible' : 'below_ticket_threshold';
  if ((metric === 'attack_wins' || metric === 'volume_and_attack_wins') && attackTickets <= 0) reason = 'attack_wins_below_ticket';
  else if (metric === 'volume' && volumeTickets <= 0) reason = 'volume_below_ticket';
  else if (metric === 'attack_wins_plus_volume' && attackTickets <= 0 && volumeTickets <= 0) reason = 'attack_wins_plus_volume_below_ticket';
  else if (metric === 'volume_or_attack_wins' && volumeTickets <= 0 && attackTickets <= 0) reason = 'volume_or_attack_wins_below_ticket';
  if (minAttackWins > 0 && Math.max(0, Math.floor(Number(attackWins) || 0)) < minAttackWins) {
    reason = 'min_attack_wins_not_met';
    ticketsRaw = 0;
  }
  return {
    ticket_metric: metric,
    volume_tickets: Math.max(0, volumeTickets),
    raw_volume_tickets: Math.max(0, rawVolumeTickets),
    raw_volume_steps: Math.max(0, rawVolumeSteps),
    volume_tickets_per_step: volumeTicketsPerStep,
    max_volume_tickets: maxVolumeTickets,
    attack_win_tickets: Math.max(0, attackTickets),
    uncapped_tickets: Math.max(0, ticketsRaw),
    tickets: Math.max(0, Math.min(Math.max(1, Math.floor(Number(cfg?.max_tickets || 20) || 20)), ticketsRaw)),
    reason,
  };
}

function sqlDateStringFromMs(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function luckyRaiderDayWindow(t, dayInput) {
  const day = normalizeDailyPoolDay(dayInput);
  let startMs = Date.parse(`${day}T00:00:00Z`);
  let endMs = Date.parse(`${addUtcDays(day, 1)}T00:00:00Z`);
  const tournamentStartMs = sqlDateMs(t?.start_at);
  const tournamentEndMs = sqlDateMs(t?.end_at);
  if (Number.isFinite(tournamentStartMs)) startMs = Math.max(startMs, tournamentStartMs);
  if (Number.isFinite(tournamentEndMs)) endMs = Math.min(endMs, tournamentEndMs);
  if (!Number.isFinite(startMs)) startMs = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(endMs) || endMs < startMs) endMs = startMs;
  return {
    day,
    start_sql: sqlDateStringFromMs(startMs),
    end_sql: sqlDateStringFromMs(endMs),
  };
}

function luckyRaiderMaxCountedAttacks(cfg) {
  return Math.max(1, Math.floor(Number(cfg?.max_counted_attacks || cfg?.max_tickets || 20) || 20));
}

function luckyRaiderAttackStatsForPlayer(t, playerId, dayInput, cfgInput = null) {
  if (!playerId) {
    return {
      attack_attempts: 0,
      attack_wins: 0,
      attack_surrenders: 0,
      raw_attack_attempts: 0,
      raw_attack_wins: 0,
      raw_attack_surrenders: 0,
      max_counted_attacks: luckyRaiderMaxCountedAttacks(cfgInput),
    };
  }
  const cfg = cfgInput || tournamentLuckyRaiderConfig(t);
  const maxCountedAttacks = luckyRaiderMaxCountedAttacks(cfg);
  const window = luckyRaiderDayWindow(t, dayInput);
  const row = db.prepare(`
    WITH events AS (
      SELECT r.created_at AS event_at,
             'replay:' || r.id AS event_id,
             CASE
               WHEN lower(COALESCE(r.claimed_result, '')) = 'victory'
                AND lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory')
               THEN 1 ELSE 0
             END AS is_win,
             0 AS is_surrender
        FROM battle_replays r
       WHERE r.attacker_id = ?
         AND r.created_at >= ?
         AND r.created_at < ?
         AND lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory')
      UNION ALL
      SELECT s.surrendered_at AS event_at,
             'surrender:' || s.id AS event_id,
             0 AS is_win,
             1 AS is_surrender
        FROM battle_sessions s
       WHERE s.attacker_id = ?
         AND s.surrendered_at IS NOT NULL
         AND s.surrendered_at >= ?
         AND s.surrendered_at < ?
    ),
    ranked AS (
      SELECT *,
             ROW_NUMBER() OVER (ORDER BY event_at ASC, event_id ASC) AS rn
        FROM events
    ),
    first_attacks AS (
      SELECT COUNT(*) AS attack_attempts,
             COALESCE(SUM(is_win), 0) AS attack_wins,
             COALESCE(SUM(is_surrender), 0) AS attack_surrenders
        FROM ranked
       WHERE rn <= ?
    ),
    all_attacks AS (
      SELECT COUNT(*) AS raw_attack_attempts,
             COALESCE(SUM(is_win), 0) AS raw_attack_wins,
             COALESCE(SUM(is_surrender), 0) AS raw_attack_surrenders
        FROM events
    )
    SELECT first_attacks.attack_attempts,
           first_attacks.attack_wins,
           first_attacks.attack_surrenders,
           all_attacks.raw_attack_attempts,
           all_attacks.raw_attack_wins,
           all_attacks.raw_attack_surrenders
      FROM first_attacks, all_attacks
  `).get(
    playerId, window.start_sql, window.end_sql,
    playerId, window.start_sql, window.end_sql,
    maxCountedAttacks
  ) || {};
  return {
    attack_attempts: Math.max(0, Math.floor(Number(row.attack_attempts || 0) || 0)),
    attack_wins: Math.max(0, Math.floor(Number(row.attack_wins || 0) || 0)),
    attack_surrenders: Math.max(0, Math.floor(Number(row.attack_surrenders || 0) || 0)),
    raw_attack_attempts: Math.max(0, Math.floor(Number(row.raw_attack_attempts || 0) || 0)),
    raw_attack_wins: Math.max(0, Math.floor(Number(row.raw_attack_wins || 0) || 0)),
    raw_attack_surrenders: Math.max(0, Math.floor(Number(row.raw_attack_surrenders || 0) || 0)),
    max_counted_attacks: maxCountedAttacks,
  };
}

function awardTournamentLuckyRaiderDay(tournamentId, dayInput, options = {}) {
  const tid = Number(tournamentId);
  const day = normalizeDailyPoolDay(dayInput);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: false, error: 'invalid tournament id' };
  return db.transaction(() => {
    const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
    if (!t) return { ok: false, error: 'tournament not found' };
    const cfg = tournamentLuckyRaiderConfig(t);
    if (!cfg.enabled) return { ok: true, skipped: true, reason: 'lucky_raider_disabled', tournament_id: tid, day_utc: day };
    const existing = stmts.getTournamentLuckyRaiderRun.get(tid, day);
    if (existing && !options.force) {
      let details = {};
      try { details = JSON.parse(existing.details_json || '{}'); } catch {}
      return {
        ok: true,
        skipped: true,
        alreadyProcessed: true,
        tournament_id: tid,
        day_utc: day,
        status: existing.status,
        winner_player_id: existing.winner_player_id || null,
        details,
      };
    }
    if (existing && options.force) {
      db.prepare('DELETE FROM tournament_lucky_raider_runs WHERE tournament_id = ? AND day_utc = ?').run(tid, day);
      db.prepare('DELETE FROM tournament_lucky_raider_entries WHERE tournament_id = ? AND day_utc = ?').run(tid, day);
      stmts.voidTournamentLuckyRaiderPendingPayouts.run('voided by forced Lucky Raider rerun', tid, day);
    }

    const rows = db.prepare(`
      SELECT tp.player_id,
             p.name,
             COALESCE(p.is_bot, 0) AS is_bot,
             COALESCE(SUM(a.volume_usd), 0) AS volume_usd,
             COALESCE(SUM(a.trades_count), 0) AS trades_count
        FROM tournament_participants tp
        LEFT JOIN players p ON p.id = tp.player_id
        LEFT JOIN tournament_daily_activity a
          ON a.tournament_id = tp.tournament_id
         AND a.player_id = tp.player_id
         AND a.day_utc = ?
       WHERE tp.tournament_id = ?
         AND tp.left_at IS NULL
       GROUP BY tp.player_id
    `).all(day, tid);

    const entries = [];
    for (const row of rows) {
      const volume = Math.max(0, safeUsd(row.volume_usd, 1_000_000_000));
      const attackStats = luckyRaiderAttackStatsForPlayer(t, row.player_id, day, cfg);
      const attackWins = attackStats.attack_wins;
      const attackLosses = Math.max(0, attackStats.attack_attempts - attackWins);
      const rawAttackLosses = Math.max(0, attackStats.raw_attack_attempts - attackStats.raw_attack_wins);
      const ticketState = luckyRaiderTicketState(cfg, volume, attackWins);
      const ticketsRaw = ticketState.uncapped_tickets;
      const tickets = ticketState.tickets;
      let eligible = tickets > 0 ? 1 : 0;
      let reason = tickets > 0 ? 'eligible' : ticketState.reason;
      let hasNft = false;
      const townHallLevel = getTownHallLevel(row.player_id);
      const minTownHallLevel = Math.max(0, Math.floor(Number(cfg.min_town_hall_level || 0) || 0));
      if (minTownHallLevel > 0 && townHallLevel < minTownHallLevel) {
        eligible = 0;
        reason = 'town_hall_requirement_not_met';
      }
      if (cfg.require_nft) {
        hasNft = playerHasTournamentRewardNft(row.player_id, cfg.required_collections);
        if (!hasNft) {
          eligible = 0;
          reason = 'missing_required_nft';
        }
      }
      const details = {
        name: row.name || '',
        is_bot: Number(row.is_bot || 0) === 1,
        prize_eligible: Number(row.is_bot || 0) !== 1,
        trades_count: Number(row.trades_count || 0) || 0,
        town_hall_level: townHallLevel,
        min_town_hall_level: minTownHallLevel,
        attack_wins: attackWins,
        attack_losses: attackLosses,
        attack_attempts: attackStats.attack_attempts,
        attack_surrenders: attackStats.attack_surrenders,
        raw_attack_wins: attackStats.raw_attack_wins,
        raw_attack_losses: rawAttackLosses,
        raw_attack_attempts: attackStats.raw_attack_attempts,
        raw_attack_surrenders: attackStats.raw_attack_surrenders,
        max_counted_attacks: attackStats.max_counted_attacks,
        ticket_metric: cfg.ticket_metric,
        volume_per_ticket_usd: cfg.volume_per_ticket_usd,
        volume_tickets_per_step: cfg.volume_tickets_per_step,
        attack_wins_per_ticket: cfg.attack_wins_per_ticket,
        min_town_hall_level: minTownHallLevel,
        min_attack_wins: cfg.min_attack_wins,
        max_tickets: cfg.max_tickets,
        require_nft: cfg.require_nft,
        required_collections: cfg.required_collections,
        has_required_nft: cfg.require_nft ? hasNft : null,
        volume_tickets: ticketState.volume_tickets,
        raw_volume_tickets: ticketState.raw_volume_tickets,
        raw_volume_steps: ticketState.raw_volume_steps,
        volume_tickets_per_step: ticketState.volume_tickets_per_step,
        max_volume_tickets: ticketState.max_volume_tickets,
        attack_win_tickets: ticketState.attack_win_tickets,
        uncapped_tickets: ticketsRaw,
      };
      const entry = {
        player_id: row.player_id,
        name: row.name || '',
        is_bot: Number(row.is_bot || 0) === 1,
        prize_eligible: Number(row.is_bot || 0) !== 1,
        volume_usd: Number(volume.toFixed(2)),
        town_hall_level: townHallLevel,
        min_town_hall_level: minTownHallLevel,
        attack_wins: attackWins,
        attack_losses: attackLosses,
        attack_attempts: attackStats.attack_attempts,
        attack_surrenders: attackStats.attack_surrenders,
        raw_attack_wins: attackStats.raw_attack_wins,
        raw_attack_losses: rawAttackLosses,
        raw_attack_attempts: attackStats.raw_attack_attempts,
        raw_attack_surrenders: attackStats.raw_attack_surrenders,
        tickets,
        eligible,
        reason,
        details,
      };
      stmts.upsertTournamentLuckyRaiderEntry.run(
        tid,
        day,
        entry.player_id,
        entry.volume_usd,
        entry.tickets,
        entry.eligible,
        entry.reason,
        JSON.stringify(entry.details)
      );
      entries.push(entry);
    }

    const configHash = crypto.createHash('sha256').update(JSON.stringify(cfg)).digest('hex').slice(0, 16);
    const seed = `${tid}:${day}:${configHash}`;
    const recentWinnerIds = luckyRaiderRecentWinnerIds(day);
    const targetWinnerCount = Math.max(1, Math.min(100, Math.floor(Number(cfg.winner_count || 1) || 1)));
    const eligibleTotalTickets = entries
      .filter((entry) => Number(entry.tickets || 0) > 0 && Number(entry.eligible || 0) === 1)
      .reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.tickets || 0))), 0);
    const manualPick = resolveLuckyRaiderManualWinners(cfg, entries, targetWinnerCount);
    let pick = null;
    if (manualPick?.winners?.length) {
      const manualWinners = manualPick.winners.slice(0, targetWinnerCount).map((entry, index) => ({
        ...entry,
        place: index + 1,
      }));
      const manualIds = new Set(manualWinners.map((entry) => String(entry.player_id || '')));
      const remainingCount = Math.max(0, targetWinnerCount - manualWinners.length);
      const randomEntries = entries.filter((entry) => (
        Number(entry.tickets || 0) > 0
        && Number(entry.eligible || 0) === 1
        && !manualIds.has(String(entry.player_id || ''))
        && !recentWinnerIds.has(String(entry.player_id || ''))
      ));
      const randomPick = remainingCount > 0
        ? weightedLuckyRaiderWinners(randomEntries, seed, remainingCount)
        : { winners: [], picks: [], totalTickets: 0 };
      const randomWinners = (randomPick.winners || []).map((entry, index) => ({
        ...entry,
        place: manualWinners.length + index + 1,
      }));
      pick = {
        winner: manualWinners[0] || randomWinners[0] || null,
        winners: [...manualWinners, ...randomWinners],
        totalTickets: eligibleTotalTickets,
        picks: [
          ...manualWinners.map((entry) => ({ place: entry.place, pick: 'manual', total_tickets: eligibleTotalTickets })),
          ...(randomPick.picks || []).map((item, index) => ({
            ...item,
            place: manualWinners.length + index + 1,
          })),
        ],
        pick: 'manual',
        manual: true,
        manual_applied: manualWinners.map((entry) => ({
          place: entry.place,
          player_id: entry.player_id,
          name: entry.name,
          tickets: entry.tickets,
        })),
        manual_unresolved: manualPick.unresolved || [],
        random_fill: randomWinners.length,
        random_total_tickets: randomPick.totalTickets || 0,
      };
    } else {
      const drawEntries = entries.filter((entry) => !recentWinnerIds.has(String(entry.player_id)));
      const randomPick = weightedLuckyRaiderWinners(drawEntries, seed, targetWinnerCount);
      pick = {
        ...randomPick,
        manual_unresolved: manualPick?.unresolved || [],
      };
    }
    const winner = pick.winner || null;
    const winners = (pick.winners || []).map((entry) => ({
      place: entry.place,
      player_id: entry.player_id,
      name: entry.name,
      is_bot: !!entry.is_bot,
      prize_eligible: !!entry.prize_eligible,
      volume_usd: entry.volume_usd,
      attack_wins: entry.attack_wins,
      attack_losses: entry.attack_losses,
      attack_attempts: entry.attack_attempts,
      raw_attack_wins: entry.raw_attack_wins,
      raw_attack_losses: entry.raw_attack_losses,
      raw_attack_attempts: entry.raw_attack_attempts,
      volume_tickets: entry.details.volume_tickets,
      raw_volume_tickets: entry.details.raw_volume_tickets,
      raw_volume_steps: entry.details.raw_volume_steps,
      volume_tickets_per_step: entry.details.volume_tickets_per_step,
      attack_win_tickets: entry.details.attack_win_tickets,
      tickets: entry.tickets,
      rewards: luckyRaiderRewardsForPlace(cfg, entry.place),
    }));
    const details = {
      config: cfg,
      config_hash: configHash,
      players: rows.length,
      eligible_players: entries.filter((entry) => Number(entry.eligible || 0) === 1 && Number(entry.tickets || 0) > 0).length,
      total_tickets: pick.totalTickets,
      pick: pick.pick,
      picks: pick.picks || [],
      manual_override: !!pick.manual,
      manual_applied: pick.manual_applied || [],
      manual_winners: cfg.manual_winners || [],
      manual_unresolved: pick.manual_unresolved || pick.unresolved || [],
      random_fill: pick.random_fill || 0,
      random_total_tickets: pick.random_total_tickets || null,
      winner_count: targetWinnerCount,
      winners,
      entries: entries.map((entry) => ({
        player_id: entry.player_id,
        name: entry.name,
        is_bot: !!entry.is_bot,
        prize_eligible: !!entry.prize_eligible,
        volume_usd: entry.volume_usd,
        attack_wins: entry.attack_wins,
        attack_losses: entry.attack_losses,
        attack_attempts: entry.attack_attempts,
        raw_attack_wins: entry.raw_attack_wins,
        raw_attack_losses: entry.raw_attack_losses,
        raw_attack_attempts: entry.raw_attack_attempts,
        volume_tickets: entry.details.volume_tickets,
        raw_volume_tickets: entry.details.raw_volume_tickets,
        raw_volume_steps: entry.details.raw_volume_steps,
        volume_tickets_per_step: entry.details.volume_tickets_per_step,
        attack_win_tickets: entry.details.attack_win_tickets,
        tickets: entry.tickets,
        eligible: !!entry.eligible,
        reason: entry.reason,
      })),
    };
    const status = winner ? 'completed' : 'no_entries';
    stmts.insertTournamentLuckyRaiderRun.run(
      tid,
      day,
      status,
      seed,
      winner?.player_id || null,
      JSON.stringify(details)
    );
    const payoutQueue = queueTournamentLuckyRaiderPayouts(t, day, winners);
    if (payoutQueue.queued || payoutQueue.skipped) {
      details.payout_queue = payoutQueue;
      db.prepare(`
        UPDATE tournament_lucky_raider_runs
           SET details_json = ?
         WHERE tournament_id = ? AND day_utc = ?
      `).run(JSON.stringify(details), tid, day);
    }
    return {
      ok: true,
      tournament_id: tid,
      day_utc: day,
      status,
      winner_player_id: winner?.player_id || null,
      winner_name: winner?.name || null,
      winners,
      total_tickets: pick.totalTickets,
      eligible_players: details.eligible_players,
      entries: entries.length,
      payout_queue: payoutQueue,
      details,
    };
  })();
}

function listPendingTournamentLuckyRaiderPayouts(options = {}) {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(options.limit || 25) || 25)));
  const maxAttempts = Math.max(1, Math.min(50, Math.floor(Number(options.maxAttempts || 5) || 5)));
  const retrySeconds = Math.max(0, Math.min(86_400, Math.floor(Number(options.retrySeconds || 300) || 300)));
  return stmts.listPendingTournamentLuckyRaiderPayouts.all(maxAttempts, `-${retrySeconds} seconds`, limit);
}

function getTournamentLuckyRaiderPayout(id) {
  const payoutId = String(id || '').trim();
  if (!payoutId) return null;
  return stmts.getTournamentLuckyRaiderPayout.get(payoutId) || null;
}

function listTournamentLuckyRaiderPayouts(options = {}) {
  const limit = Math.max(1, Math.min(500, Math.floor(Number(options.limit || 100) || 100)));
  const status = String(options.status || 'all').trim().toLowerCase();
  const allowed = new Set(['pending', 'processing', 'failed', 'paid', 'void']);
  const where = allowed.has(status) ? 'WHERE lp.status = ?' : '';
  const params = allowed.has(status) ? [status, limit] : [limit];
  return db.prepare(`
    SELECT lp.*,
           p.name AS player_name,
           t.name AS tournament_name,
           tp.reward_wallet_evm AS current_destination_wallet
      FROM tournament_lucky_raider_payouts lp
      LEFT JOIN players p ON p.id = lp.player_id
      LEFT JOIN tournaments t ON t.id = lp.tournament_id
      LEFT JOIN tournament_participants tp
        ON tp.tournament_id = lp.tournament_id
       AND tp.player_id = lp.player_id
     ${where}
     ORDER BY
       CASE lp.status
         WHEN 'failed' THEN 0
         WHEN 'processing' THEN 1
         WHEN 'pending' THEN 2
         WHEN 'paid' THEN 3
         ELSE 4
       END,
       lp.created_at DESC,
       lp.id DESC
     LIMIT ?
  `).all(...params);
}

function getTournamentLuckyRaiderPayoutSummary() {
  const rows = db.prepare(`
    SELECT status,
           COUNT(*) AS count,
           COALESCE(SUM(reward_amount_usd), 0) AS reward_usd
      FROM tournament_lucky_raider_payouts
     GROUP BY status
  `).all();
  const summary = {
    total: 0,
    reward_usd: 0,
    by_status: {},
  };
  for (const row of rows) {
    const status = String(row.status || 'unknown');
    const count = Number(row.count || 0);
    const rewardUsd = Number(row.reward_usd || 0);
    summary.total += count;
    summary.reward_usd += rewardUsd;
    summary.by_status[status] = { count, reward_usd: rewardUsd };
  }
  return summary;
}

function claimTournamentLuckyRaiderPayout(id, options = {}) {
  const payoutId = String(id || '').trim();
  if (!payoutId) return null;
  const maxAttempts = Math.max(1, Math.min(50, Math.floor(Number(options.maxAttempts || 5) || 5)));
  return db.transaction(() => {
    const result = stmts.claimTournamentLuckyRaiderPayout.run(payoutId, maxAttempts);
    if (!result.changes) return null;
    return stmts.getTournamentLuckyRaiderPayout.get(payoutId) || null;
  })();
}

function updateTournamentLuckyRaiderPayoutDestination(id, wallet) {
  const payoutId = String(id || '').trim();
  const destination = String(wallet || '').trim();
  if (!payoutId || !destination) return null;
  stmts.updateTournamentLuckyRaiderPayoutDestination.run(destination, payoutId);
  return stmts.getTournamentLuckyRaiderPayout.get(payoutId) || null;
}

function isPlayerSolanaWalletLinked(playerId, wallet) {
  const pid = String(playerId || '').trim();
  const address = String(wallet || '').trim();
  if (!pid || !address) return false;
  if (isWalletBlacklisted(address)) return false;
  const row = db.prepare(`
    SELECT 1 AS ok
    WHERE EXISTS (
      SELECT 1 FROM player_wallets
      WHERE player_id = ? AND chain_type = 'solana' AND address = ?
    )
    OR EXISTS (
      SELECT 1 FROM player_dex_accounts
      WHERE player_id = ? AND chain_type = 'solana' AND wallet_address = ?
    )
    OR EXISTS (
      SELECT 1 FROM players
      WHERE id = ? AND wallet = ?
    )
    LIMIT 1
  `).get(pid, address, pid, address, pid, address);
  return !!row;
}

function markTournamentLuckyRaiderPayoutPaid(id, result = {}) {
  const payoutId = String(id || '').trim();
  if (!payoutId) return null;
  stmts.markTournamentLuckyRaiderPayoutPaid.run(
    String(result.txHash || result.tx_hash || ''),
    Number(result.clashUsdPrice || result.clash_usd_price || 0) || 0,
    String(result.clashAmount || result.clash_amount || ''),
    String(result.clashAmountUnits || result.clash_amount_units || ''),
    String(result.priceSource || result.price_source || ''),
    payoutId
  );
  return stmts.getTournamentLuckyRaiderPayout.get(payoutId) || null;
}

function markTournamentLuckyRaiderPayoutFailed(id, error) {
  const payoutId = String(id || '').trim();
  if (!payoutId) return null;
  const message = String(error?.message || error || 'payout failed').slice(0, 500);
  stmts.markTournamentLuckyRaiderPayoutFailed.run(message, payoutId);
  return stmts.getTournamentLuckyRaiderPayout.get(payoutId) || null;
}

function awardPendingTournamentDailyPools(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const maxDays = Math.max(1, Math.min(60, Number(options.maxDays || 14)));
  const tournaments = db.prepare(`
    SELECT *
      FROM tournaments
     WHERE status = 'ended'
        OR (status = 'active' AND paused_at IS NULL)
  `).all();
  const results = [];
  for (const t of tournaments) {
    const needsDailyPool = isDailyPoolTournament(t);
    const needsLucky = tournamentHasLuckyRaider(t);
    if (!needsDailyPool && !needsLucky) continue;
    const first = tournamentFirstDailyPoolDay(t);
    const dailyLast = needsDailyPool ? tournamentLastClosedDailyPoolDay(t, now) : addUtcDays(first, -1);
    const luckyLast = needsLucky ? tournamentLastClosedLuckyRaiderDay(t, now) : addUtcDays(first, -1);
    const last = dailyLast > luckyLast ? dailyLast : luckyLast;
    if (first > last) continue;
    const windowFirst = addUtcDays(last, -(maxDays - 1));
    let day = first > windowFirst ? first : windowFirst;
    let guard = 0;
    while (day <= last && guard < maxDays) {
      const dayResults = [];
      if (needsDailyPool && day <= dailyLast) {
        const run = stmts.getTournamentDailyRun.get(t.id, day);
        if (!run) dayResults.push(awardTournamentDailyPoolDay(t.id, day));
      }
      if (needsLucky && day <= luckyLast) {
        const luckyRun = stmts.getTournamentLuckyRaiderRun.get(t.id, day);
        if (!luckyRun) dayResults.push(awardTournamentLuckyRaiderDay(t.id, day));
      }
      results.push(...dayResults.filter((result) => result && !result.skipped));
      day = addUtcDays(day, 1);
      guard += 1;
    }
  }
  return { ok: true, processed: results.length, results };
}

function awardTournamentFinalDailyPoolDay(tournamentId, options = {}) {
  const tid = Number(tournamentId);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: false, error: 'invalid tournament id' };
  const now = options.now instanceof Date ? options.now : new Date();
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return { ok: false, error: 'tournament not found' };
  if (!isDailyPoolTournament(t)) return { ok: true, skipped: true, reason: 'not_daily_pool', tournament_id: tid };
  const endMs = sqlDateMs(t.end_at);
  const nowMs = now.getTime();
  const finalDay = endMs && endMs <= nowMs ? dailyPoolDayForEventMs(t, endMs - 1) : dailyPoolDayForEventMs(t, nowMs);
  const firstDay = tournamentFirstDailyPoolDay(t);
  if (firstDay > finalDay) {
    return { ok: true, skipped: true, reason: 'no_awardable_day', tournament_id: tid, day_utc: finalDay };
  }
  return awardTournamentDailyPoolDay(tid, finalDay, options);
}

function seedTournamentDailyPoolBaseline(tournamentId) {
  const tid = Number(tournamentId);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: false, updated: 0 };
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return { ok: false, updated: 0 };
  const w = dailyPoolWeights(t);
  const rows = db.prepare(`
    SELECT player_id, trophies, volume_usd, pnl_usd
      FROM tournament_participants
     WHERE tournament_id = ? AND left_at IS NULL
  `).all(tid);
  let updated = 0;
  for (const row of rows) {
    const score = (
      Math.max(0, Number(row.volume_usd) || 0) * (w.volume / 100)
      + Math.max(0, Number(row.trophies) || 0) * (w.trophies / 100)
      + Math.max(0, Number(row.pnl_usd) || 0) * (w.pnl / 100)
    );
    if (score <= 0) continue;
    const r = stmts.seedTournamentAwardedPoints.run(score, score, tid, row.player_id);
    updated += r.changes || 0;
  }
  return { ok: true, updated };
}

// ---------- Building Definitions (mirroring Godot) ----------

// ---------- Town Hall Progression System ----------
// Buildings unlocked per TH level. Not listed = available from TH1.
const TH_UNLOCK = {
  storage:   2,  // unlocked at TH2
  tombstone: 2,  // unlocked at TH2
  turret:    3,  // unlocked at TH3
  shark_trap: 3, // unlocked at TH3
  mage_tower: 4, // unlocked at TH4
  mortar:    5,  // unlocked at TH5
};

// Max count per building type PER TH level: { type: [th1, th2, th3, th4, th5] }
const TH_MAX_COUNT = {
  mine:         [1, 2, 3, 3, 4],
  sawmill:      [1, 2, 3, 3, 4],
  barn:         [1, 1, 1, 1, 1],
  altar:        [1, 1, 1, 1, 1],
  archer_tower: [1, 2, 3, 3, 3],
  tombstone:    [0, 1, 3, 3, 3],  // unlocked at TH2
  turret:       [0, 0, 3, 3, 3],  // unlocked at TH3
  shark_trap:   [0, 0, 1, 1, 2],  // one at TH3, second at TH5
  storage:      [0, 1, 2, 3, 3],  // unlocked at TH2
  mage_tower:   [0, 0, 0, 2, 2],  // unlocked at TH4
  mortar:       [0, 0, 0, 0, 1],  // unlocked at TH5
  town_hall:    [1, 1, 1, 1, 1],
};

// Required buildings to upgrade Town Hall (all must be at TH's current level)
const TH_UPGRADE_REQUIRES = {
  1: ['mine', 'sawmill', 'barn'],
  2: ['mine', 'sawmill', 'barn', 'storage', 'tombstone', 'archer_tower'],
  3: ['mine', 'sawmill', 'barn', 'storage', 'tombstone', 'archer_tower', 'turret'],
  4: ['mine', 'sawmill', 'barn', 'storage', 'tombstone', 'archer_tower', 'turret', 'mage_tower'],
};

const BUILDING_DEFS = {
  town_hall: {
    size: [4, 4], max_level: 5,
    hp_levels: [3500, 8000, 16000, 24000, 36000],
    cost: { gold: 0, wood: 0, ore: 0 },
    upgrade_cost: {
      2: { gold: 800, wood: 2400, ore: 2000 },
      3: { gold: 3000, wood: 7000, ore: 6000 },
      4: { gold: 10000, wood: 20000, ore: 17000 },
      5: { gold: 26000, wood: 52000, ore: 46000 },
    },
    max_count: 1,
  },
  mine: {
    size: [3, 3], max_level: 5,
    hp_levels: [1200, 2200, 3800, 6000, 9000],
    cost: { gold: 80, wood: 200, ore: 0 },
    max_count: 4,
  },
  barn: {
    size: [4, 3], max_level: 5,
    hp_levels: [2000, 3500, 6000, 9500, 14000],
    cost: { gold: 140, wood: 350, ore: 280 },
    max_count: 1,
  },
  port: {
    size: [4, 3], max_level: 3,
    hp_levels: [1800, 3200, 5500],
    cost: { gold: 240, wood: 560, ore: 480 },
    max_count: 5,
  },
  altar: {
    size: [3, 3], max_level: 1,
    hp_levels: [900],
    cost: { gold: 0, wood: 0, ore: 0 },
    max_count: 1,
    requires_purchase: true,
    shop_sku: 'altar',
  },
  sawmill: {
    size: [3, 3], max_level: 5,
    hp_levels: [1200, 2200, 3800, 6000, 9000],
    cost: { gold: 80, wood: 0, ore: 200 },
    max_count: 4,
  },
  turret: {
    size: [2, 2], max_level: 5,
    hp_levels: [900, 1600, 2800, 4500, 6800],
    cost: { gold: 220, wood: 700, ore: 580 },
    max_count: 6,
  },
  tombstone: {
    size: [3, 3], max_level: 4,
    hp_levels: [1000, 1500, 2000, 2700],
    cost: { gold: 120, wood: 0, ore: 500 },
    max_count: 4,
  },
  storage: {
    size: [4, 5], max_level: 5,
    hp_levels: [1400, 2500, 4200, 6500, 9500],
    cost: { gold: 140, wood: 550, ore: 0 },
    max_count: 4,
  },
  archer_tower: {
    size: [3, 3], max_level: 5,
    hp_levels: [800, 1500, 2500, 3800, 5600],
    cost: { gold: 180, wood: 650, ore: 0 },
    max_count: 4,
  },
  mage_tower: {
    size: [3, 3], max_level: 5,
    hp_levels: [700, 1200, 2000, 3100, 4600],
    cost: { gold: 800, wood: 0, ore: 1300 },
    max_count: 2,
  },
  mortar: {
    size: [2, 2], max_level: 1,
    hp_levels: [1700],
    cost: { gold: 600, wood: 900, ore: 700 },
    max_count: 1,
  },
  shark_trap: {
    size: [2, 2], max_level: 5,
    hp_levels: [1, 1, 1, 1, 1],
    damage_levels: [500, 750, 1050, 1450, 2000],
    cost: { gold: 300, wood: 800, ore: 650 },
    max_count: 2,
    non_targetable: true,
  },
};

const BUILDING_UPGRADE_COST_MULTIPLIERS = {
  2: 2,
  3: 3,
  4: 5,
  5: 8,
};

function getBuildingUpgradeCost(type, currentLevel) {
  const def = BUILDING_DEFS[type];
  if (!def) return { gold: 0, wood: 0, ore: 0 };
  const nextLevel = Number(currentLevel || 1) + 1;
  if (nextLevel > def.max_level) return { gold: 0, wood: 0, ore: 0 };
  if (type === 'town_hall' && def.upgrade_cost?.[nextLevel]) {
    return { ...def.upgrade_cost[nextLevel] };
  }
  const multiplier = BUILDING_UPGRADE_COST_MULTIPLIERS[nextLevel] || nextLevel;
  return {
    gold: (def.cost.gold || 0) * multiplier,
    wood: (def.cost.wood || 0) * multiplier,
    ore: (def.cost.ore || 0) * multiplier,
  };
}

function normalizeTownHallHpRows() {
  const hpLevels = BUILDING_DEFS.town_hall?.hp_levels || [];
  const rows = db.prepare(`
    SELECT id, level, hp, max_hp
    FROM buildings
    WHERE type = 'town_hall'
  `).all();
  const update = db.prepare(`
    UPDATE buildings SET hp = ?, max_hp = ? WHERE id = ?
  `);
  let updated = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      const level = Math.max(1, Math.min(hpLevels.length, Number(row.level) || 1));
      const nextMaxHp = hpLevels[level - 1];
      if (!nextMaxHp || Number(row.max_hp) === nextMaxHp) continue;

      const oldMaxHp = Math.max(1, Number(row.max_hp) || nextMaxHp);
      const oldHp = Math.max(0, Number(row.hp) || 0);
      const hpRatio = Math.max(0, Math.min(1, oldHp / oldMaxHp));
      const nextHp = Math.max(0, Math.min(nextMaxHp, Math.round(nextMaxHp * hpRatio)));
      update.run(nextHp, nextMaxHp, row.id);
      updated += 1;
    }
  });
  tx();

  if (updated > 0) {
    console.log(`[db] normalized Town Hall HP for ${updated} building row(s)`);
  }
}

normalizeTownHallHpRows();

function normalizePortLevelRows() {
  const def = BUILDING_DEFS.port;
  const maxLevel = Number(def?.max_level || 3);
  const hpLevels = def?.hp_levels || [];
  const cappedMaxHp = hpLevels[maxLevel - 1] || hpLevels[hpLevels.length - 1] || 1;
  const rows = db.prepare(`
    SELECT id, level, hp, max_hp
    FROM buildings
    WHERE type = 'port' AND level > ?
  `).all(maxLevel);
  if (!rows.length) return;

  const update = db.prepare(`
    UPDATE buildings SET level = ?, hp = ?, max_hp = ? WHERE id = ?
  `);
  let updated = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const oldMaxHp = Math.max(1, Number(row.max_hp) || cappedMaxHp);
      const oldHp = Math.max(0, Number(row.hp) || 0);
      const hpRatio = Math.max(0, Math.min(1, oldHp / oldMaxHp));
      const nextHp = Math.max(0, Math.min(cappedMaxHp, Math.round(cappedMaxHp * hpRatio)));
      update.run(maxLevel, nextHp, cappedMaxHp, row.id);
      updated += 1;
    }
  });
  tx();

  if (updated > 0) {
    console.log(`[db] normalized ${updated} Port row(s) to level ${maxLevel}`);
  }
}

normalizePortLevelRows();

function botBuildingHp(type, level) {
  const def = BUILDING_DEFS[type];
  if (!def) return 1;
  const hpLevels = def.hp_levels || [1];
  const idx = Math.max(0, Math.min(hpLevels.length - 1, Math.trunc(Number(level) || 1) - 1));
  return Math.max(1, Number(hpLevels[idx]) || 1);
}

let botTemplateByIdCache = null;

function botTemplateById(templateId) {
  if (!botTemplateByIdCache) {
    botTemplateByIdCache = new Map(buildBotBaseTemplates().map((template) => [template.id, template]));
  }
  return botTemplateByIdCache.get(templateId) || null;
}

function botMaterializedToken(templateId, sessionId) {
  return `bot-${crypto.createHash('sha256')
    .update(`raid-bot:${templateId}:${sessionId}`)
    .digest('hex')}`;
}

function cleanupOldBotTargets() {
  try {
    const result = db.prepare(`
      DELETE FROM players
      WHERE COALESCE(is_bot, 0) = 1
        AND NOT EXISTS (
          SELECT 1 FROM battle_sessions s
          WHERE s.defender_id = players.id
            AND s.status = 'active'
            AND s.reserved_until > datetime('now')
        )
        AND (
          id LIKE 'bot-th%'
          OR created_at < datetime('now', '-2 days')
        )
    `).run();
    if (result.changes > 0) {
      console.log(`[db] cleaned up ${result.changes} old raid bot target(s)`);
    }
  } catch (e) {
    console.warn('[db] bot target cleanup warning:', e.message);
  }
}

function virtualBotCandidatesForProfile(attackPower, profile) {
  const attackerTh = Math.max(1, Math.min(5, Number(attackPower.town_hall_level || 1)));
  const minTh = profile.recovery_level > 0 ? Math.max(1, attackerTh - 1) : Math.max(1, attackerTh - 1);
  const maxTh = profile.recovery_level > 0
    ? attackerTh
    : profile.selection_reason === 'strong_player'
      ? Math.min(5, attackerTh + 1)
      : Math.min(5, attackerTh + 1);
  const allowedDifficulties = profile.recovery_level > 0
    ? new Set(['easy', 'normal'])
    : profile.selection_reason === 'strong_player'
      ? new Set(['normal', 'hard'])
      : new Set(['easy', 'normal', 'hard']);

  return buildBotBaseTemplates()
    .filter((template) => template.th >= minTh && template.th <= maxTh && allowedDifficulties.has(template.difficulty))
    .map((template) => {
      const base = computeBasePowerFromBuildings(template.buildings);
      return {
        id: template.id,
        name: template.name,
        trophies: template.trophies,
        level: template.th,
        is_bot: 1,
        is_virtual_bot: true,
        bot_template_id: template.id,
        bot_difficulty: template.difficulty,
        bot_variant: template.variant,
        bot_generation: template.generation,
        bot_template: template,
        base_power: base.power,
        defender_th: base.town_hall_level,
      };
    });
}

function materializeBotTarget(candidate, sessionId) {
  const template = candidate.bot_template || botTemplateById(candidate.bot_template_id || candidate.id);
  if (!template) throw new Error('Bot template not found');
  const suffix = String(sessionId || uuidv4()).replace(/-/g, '').slice(0, 12);
  const botId = `bot-raid-${template.id}-${suffix}`;
  const botName = `${template.name} ${suffix.slice(0, 4)}`;
  const insertBot = db.prepare(`
    INSERT INTO players (
      id, name, token, gold, wood, ore, trophies, level,
      is_bot, bot_difficulty, bot_variant, bot_generation,
      shield_until, last_attacked_by, last_attacked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, NULL, NULL)
  `);
  const insertBuilding = db.prepare(`
    INSERT INTO buildings (
      player_id, type, level, grid_x, grid_z, grid_index,
      hp, max_hp, has_ship, ship_troops, ship_troops_template
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]')
  `);

  insertBot.run(
    botId,
    botName,
    botMaterializedToken(template.id, sessionId),
    template.resources.gold,
    template.resources.wood,
    template.resources.ore,
    template.trophies,
    template.th,
    template.difficulty,
    template.variant,
    template.generation
  );

  for (const building of template.buildings) {
    const maxHp = botBuildingHp(building.type, building.level);
    insertBuilding.run(
      botId,
      building.type,
      building.level,
      building.grid_x,
      building.grid_z,
      building.grid_index || 0,
      maxHp,
      maxHp,
      building.has_ship ? 1 : 0
    );
  }

  return {
    ...candidate,
    id: botId,
    name: botName,
    trophies: template.trophies,
    level: template.th,
    is_bot: 1,
    is_virtual_bot: false,
    bot_difficulty: template.difficulty,
    bot_variant: template.variant,
    bot_generation: template.generation,
    bot_template_id: template.id,
  };
}

cleanupOldBotTargets();

// ---------- Troop Definitions ----------

const TROOP_DEFS = {
  knight: {
    max_level: 7,
    cost: [
      { gold: 150, wood: 0, ore: 125 },
      { gold: 300, wood: 0, ore: 250 },
      { gold: 600, wood: 0, ore: 500 },
      { gold: 1200, wood: 0, ore: 1000 },
      { gold: 2200, wood: 0, ore: 1800 },
      { gold: 3800, wood: 0, ore: 3200 },
    ],
  },
  mage: {
    max_level: 7,
    cost: [
      { gold: 250, wood: 0, ore: 250 },
      { gold: 500, wood: 0, ore: 500 },
      { gold: 1000, wood: 0, ore: 1000 },
      { gold: 2000, wood: 0, ore: 2000 },
      { gold: 3600, wood: 0, ore: 3600 },
      { gold: 6000, wood: 0, ore: 6000 },
    ],
  },
  barbarian: {
    max_level: 7,
    cost: [
      { gold: 175, wood: 0, ore: 175 },
      { gold: 350, wood: 0, ore: 350 },
      { gold: 700, wood: 0, ore: 700 },
      { gold: 1400, wood: 0, ore: 1400 },
      { gold: 2600, wood: 0, ore: 2600 },
      { gold: 4400, wood: 0, ore: 4400 },
    ],
  },
  archer: {
    max_level: 7,
    cost: [
      { gold: 175, wood: 175, ore: 0 },
      { gold: 350, wood: 350, ore: 0 },
      { gold: 700, wood: 700, ore: 0 },
      { gold: 1400, wood: 1400, ore: 0 },
      { gold: 2600, wood: 2600, ore: 0 },
      { gold: 4400, wood: 4400, ore: 0 },
    ],
  },
  ranger: {
    max_level: 7,
    cost: [
      { gold: 125, wood: 125, ore: 0 },
      { gold: 250, wood: 250, ore: 0 },
      { gold: 500, wood: 500, ore: 0 },
      { gold: 1000, wood: 1000, ore: 0 },
      { gold: 1900, wood: 1900, ore: 0 },
      { gold: 3200, wood: 3200, ore: 0 },
    ],
  },
  demon_king: {
    max_level: 7,
    cost: [
      { gold: 150, wood: 0, ore: 125 },
      { gold: 300, wood: 0, ore: 250 },
      { gold: 600, wood: 0, ore: 500 },
      { gold: 1200, wood: 0, ore: 1000 },
      { gold: 2200, wood: 0, ore: 1800 },
      { gold: 3800, wood: 0, ore: 3200 },
    ],
  },
  fire_dragon: {
    max_level: 7,
    cost: [
      { gold: 250, wood: 0, ore: 250 },
      { gold: 500, wood: 0, ore: 500 },
      { gold: 1000, wood: 0, ore: 1000 },
      { gold: 2000, wood: 0, ore: 2000 },
      { gold: 3600, wood: 0, ore: 3600 },
      { gold: 6000, wood: 0, ore: 6000 },
    ],
  },
};
const DISABLED_TROOP_TYPES = new Set(['barbarian', 'ranger']);
const ACTIVE_TROOP_TYPES = Object.keys(TROOP_DEFS).filter((troop) => !DISABLED_TROOP_TYPES.has(troop));

function normalizeTroopTypeKey(troopType) {
  const compact = String(troopType || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  if (compact === 'demonking') return 'demon_king';
  if (compact === 'firedragon') return 'fire_dragon';
  if (TROOP_DEFS[compact]) return compact;
  return String(troopType || '').trim().toLowerCase();
}

function clampTroopLevelForType(troopType, level) {
  const def = TROOP_DEFS[troopType];
  const maxLevel = Number(def?.max_level) || 1;
  const numericLevel = Number(level) || 1;
  return Math.max(1, Math.min(maxLevel, Math.trunc(numericLevel)));
}

function isTroopDisabled(troopType) {
  return DISABLED_TROOP_TYPES.has(normalizeTroopTypeKey(troopType));
}

function getTroopLevelBarnRequirement(level) {
  const nextLevel = Math.max(1, Math.trunc(Number(level) || 1));
  if (nextLevel >= 5) return 5;
  return nextLevel;
}

function getTroopBarnGate(playerId, nextLevel) {
  const currentBarnLevel = getBarnLevel(playerId);
  if (!nextLevel) {
    return {
      current_barn_level: currentBarnLevel,
      required_barn_level: null,
      barn_ready: true,
    };
  }
  const requiredBarnLevel = getTroopLevelBarnRequirement(nextLevel);
  return {
    current_barn_level: currentBarnLevel,
    required_barn_level: requiredBarnLevel,
    barn_ready: currentBarnLevel >= requiredBarnLevel,
  };
}

// Lv3 costs stay under the TH5 75K storage cap; see design/gdd/economy-balance.md section 5.3.
const ALTAR_SKILL_DEFS = {
  prosperity: {
    max_level: 3,
    bonuses: [10, 20, 30],
    cost: [
      { wood: 10000, ore: 10000, gold: 2500 },
      { wood: 30000, ore: 30000, gold: 7500 },
      { wood: 70000, ore: 70000, gold: 20000 },
    ],
  },
  ward: {
    max_level: 3,
    bonuses: [5, 10, 15],
    cost: [
      { wood: 15000, ore: 8000, gold: 2500 },
      { wood: 45000, ore: 25000, gold: 7500 },
      { wood: 70000, ore: 60000, gold: 20000 },
    ],
  },
  glory: {
    max_level: 3,
    bonuses: [5, 7, 10],
    cost: [
      { wood: 12000, ore: 12000, gold: 3000 },
      { wood: 36000, ore: 36000, gold: 9000 },
      { wood: 70000, ore: 70000, gold: 24000 },
    ],
  },
};

const DEFENSE_BUILDING_TYPES = new Set(['turret', 'archer_tower', 'archertower', 'archtower', 'mage_tower', 'tombstone', 'mortar', 'shark_trap']);

const DEMON_KING_UPGRADE_WINS = {
  2: 1000,
  3: 10000,
};

function demonKingRequiredWins(level) {
  return DEMON_KING_UPGRADE_WINS[Number(level)] || null;
}

const GRID_SPECS = {
  0: { width: 29, height: 27, label: 'main island', allowed: null, blocked: ['port'] },
  1: { width: 27, height: 3, label: 'port coast', allowed: ['port'], blocked: [] },
  2: { width: 27, height: 5, label: 'attack approach', allowed: ['flag'], blocked: [] },
};

// ---------- Trophy Points per Building (type -> level -> trophies) ----------

// PvP trophy rewards — trophies only change from battles
const TROPHY_WIN = 30;
const TROPHY_LOSS = 15;  // defender loses this on defeat

const TROPHY_TABLE = {
  town_hall: [50, 120, 250, 450, 720],
  mine:      [10, 25, 50, 90, 145],
  barn:      [10, 25, 50, 90],
  port:      [15, 35, 70, 125, 195],
  sawmill:   [10, 25, 50, 90, 145],
  turret:    [20, 45, 90, 160, 255],
  tombstone: [5, 10, 20, 40],
  storage:      [10, 25, 50, 90, 145],
  archer_tower: [15, 35, 70, 125, 200],
  mage_tower:   [20, 45, 90, 145, 225],
  mortar:       [30, 65, 125, 210],
  shark_trap:   [25, 40, 60, 85, 115],
};

// ---------- Helper Functions ----------

const AI_MCP_AGENT_ACCESS_ENABLED = String(process.env.CLASH_AI_MCP_AGENT_ACCESS_ENABLED || '').trim() === '1';
const AI_MCP_AGENT_DISABLED_MESSAGE = 'AI/MCP agent access is disabled.';

function aiMcpAgentDisabledError() {
  return {
    error: AI_MCP_AGENT_DISABLED_MESSAGE,
    disabled: true,
    status: 403,
  };
}

function parseScopes(scopes) {
  try {
    const parsed = JSON.parse(scopes || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function publicAiAgentKeyRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    key_suffix: row.key_suffix,
    scopes: parseScopes(row.scopes),
    created_at: row.created_at,
    last_used_at: row.last_used_at || null,
    revoked_at: row.revoked_at || null,
  };
}

function hashAiAgentKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function createAiAgentKey(playerId, name = 'AI Agent') {
  if (!AI_MCP_AGENT_ACCESS_ENABLED) return aiMcpAgentDisabledError();
  const player = stmts.getPlayerById.get(playerId);
  if (!player) return { error: 'Player not found' };
  const activeCount = stmts.countActiveAiAgentKeys.get(playerId)?.count || 0;
  if (activeCount >= 10) return { error: 'Maximum 10 active AI keys reached' };

  const rawKey = `cop_ai_${crypto.randomBytes(32).toString('base64url')}`;
  const safeName = String(name || 'AI Agent').trim().slice(0, 40) || 'AI Agent';
  const id = uuidv4();
  const scopes = JSON.stringify(['game:read', 'game:write']);
  stmts.insertAiAgentKey.run(
    id,
    playerId,
    safeName,
    hashAiAgentKey(rawKey),
    rawKey.slice(0, 10),
    rawKey.slice(-4),
    scopes
  );
  const row = stmts.getAiAgentKeyById.get(id, playerId);
  return { ...publicAiAgentKeyRow(row), key: rawKey };
}

function listAiAgentKeys(playerId) {
  if (!AI_MCP_AGENT_ACCESS_ENABLED) return [];
  return stmts.listAiAgentKeys.all(playerId).map(publicAiAgentKeyRow);
}

function revokeAiAgentKey(playerId, keyId) {
  const id = String(keyId || '').trim();
  if (!id) return { error: 'key id required' };
  const info = stmts.revokeAiAgentKey.run(id, playerId);
  if (!info.changes) return { error: 'AI key not found' };
  return { success: true };
}

function authenticateAiAgentKey(rawKey) {
  if (!AI_MCP_AGENT_ACCESS_ENABLED) return null;
  const key = String(rawKey || '').trim();
  if (!key || !key.startsWith('cop_ai_')) return null;
  const row = stmts.getAiAgentKeyByHash.get(hashAiAgentKey(key));
  if (!row) return null;
  try { stmts.touchAiAgentKey.run(row.id); } catch {}
  return {
    key: publicAiAgentKeyRow(row),
    player: {
      id: row.auth_player_id,
      name: row.auth_player_name,
      wallet: row.auth_player_wallet,
      dex: row.auth_player_dex,
      trophies: row.auth_player_trophies,
      level: row.auth_player_level,
    },
  };
}

function publicHermesAgentRow(row) {
  if (!row) return null;
  let orchestratorState = null;
  try { orchestratorState = row.orchestrator_state ? JSON.parse(row.orchestrator_state) : null; } catch {}
  return {
    player_id: row.player_id,
    ai_key_id: row.ai_key_id,
    status: row.status,
    last_error: row.last_error || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_provisioned_at: row.last_provisioned_at || null,
    last_chat_at: row.last_chat_at || null,
    orchestrator: orchestratorState,
  };
}

function getOrCreateHermesAgent(playerId) {
  if (!AI_MCP_AGENT_ACCESS_ENABLED) return aiMcpAgentDisabledError();
  const player = stmts.getPlayerById.get(playerId);
  if (!player) return { error: 'Player not found' };

  const existing = stmts.getHermesAgent.get(playerId);
  if (existing?.mcp_key && authenticateAiAgentKey(existing.mcp_key)) {
    return { ...publicHermesAgentRow(existing), mcp_key: existing.mcp_key };
  }

  const created = createAiAgentKey(playerId, 'Hermes AI Chat');
  if (created.error) return created;
  stmts.upsertHermesAgent.run(playerId, created.id, created.key);
  const row = stmts.getHermesAgent.get(playerId);
  return { ...publicHermesAgentRow(row), mcp_key: created.key };
}

function markHermesAgentState(playerId, state = {}) {
  const status = String(state.status || (state.error ? 'error' : 'ready')).slice(0, 40);
  const error = state.error ? String(state.error).slice(0, 2000) : null;
  const payload = boundedJson(state.orchestrator ?? state, 20000);
  const provisioned = state.provisioned ? 1 : 0;
  const chatted = state.chatted ? 1 : 0;
  try {
    stmts.updateHermesAgentState.run(payload, status, error, provisioned, chatted, playerId);
  } catch (err) {
    console.warn('[db] failed to mark Hermes agent state:', err?.message || err);
  }
  const row = stmts.getHermesAgent.get(playerId);
  return publicHermesAgentRow(row);
}

function logHermesChatEvent(event = {}) {
  try {
    const duration = Number(event.durationMs ?? event.duration_ms);
    stmts.insertHermesChatEvent.run(
      event.playerId || event.player_id || null,
      event.traceId || event.trace_id || null,
      String(event.eventType || event.event_type || 'message').slice(0, 40),
      event.intent ? String(event.intent).slice(0, 80) : null,
      event.playerName || event.player_name ? String(event.playerName || event.player_name).slice(0, 120) : null,
      String(event.status || 'ok').slice(0, 40),
      Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : null,
      event.model ? String(event.model).slice(0, 120) : null,
      boundedJson(event.error, 2000),
      event.requestPreview || event.request_preview ? String(event.requestPreview || event.request_preview).slice(0, 1200) : null,
      event.responsePreview || event.response_preview ? String(event.responsePreview || event.response_preview).slice(0, 1600) : null,
      boundedJson(event.input ?? event.input_json, 8000),
      boundedJson(event.output ?? event.output_json, 20000),
      boundedJson(event.quota ?? event.quota_json, 4000),
      boundedJson(event.attempts ?? event.attempts_json, 12000)
    );
  } catch (err) {
    console.warn('[db] failed to log Hermes chat event:', err?.message || err);
  }
}

function boundedJson(value, maxBytes = 8000) {
  if (value == null) return null;
  let text = '';
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (!text) return null;
  const max = Number(maxBytes);
  if (Number.isFinite(max) && max > 0 && text.length > max) {
    return text.slice(0, max) + '...';
  }
  return text;
}

function logMcpEvent(event = {}) {
  try {
    const status = String(event.status || 'ok').slice(0, 40);
    const tool = String(event.tool || 'unknown').slice(0, 80);
    const duration = Number(event.durationMs ?? event.duration_ms);
    stmts.insertMcpEvent.run(
      event.playerId || event.player_id || null,
      event.aiKeyId || event.ai_key_id || null,
      event.aiKeyPrefix || event.ai_key_prefix || null,
      tool,
      status,
      Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : null,
      boundedJson(event.error, 2000),
      boundedJson(event.input ?? event.input_json, 8000),
      boundedJson(event.output ?? event.output_json, 20000),
      boundedJson(event.metadata ?? event.metadata_json, 8000),
      event.ip || null,
      event.ua || event.userAgent || null
    );
  } catch (err) {
    console.warn('[db] failed to log MCP event:', err?.message || err);
  }
}

function getGridSpec(gridIndex = 0) {
  return GRID_SPECS[Number(gridIndex)] || null;
}

function canPlaceBuildingAt(playerId, type, gridX, gridZ, gridIndex = 0, ignoreBuildingId = null) {
  const def = BUILDING_DEFS[type];
  if (!def) return { ok: false, error: `Unknown building type: ${type}` };
  const spec = getGridSpec(gridIndex);
  if (!spec) return { ok: false, error: 'grid_index must be 0, 1, or 2' };
  if (spec.allowed && !spec.allowed.includes(type)) {
    return { ok: false, error: `${type} can only be placed on another grid` };
  }
  if (spec.blocked?.includes(type)) {
    return { ok: false, error: `${type} cannot be placed on grid ${gridIndex}` };
  }
  if (!Number.isInteger(gridX) || !Number.isInteger(gridZ)) {
    return { ok: false, error: 'grid_x and grid_z must be integers' };
  }
  const [w, h] = def.size || [1, 1];
  if (gridX < 0 || gridZ < 0 || gridX + w > spec.width || gridZ + h > spec.height) {
    return { ok: false, error: `${type} footprint must fit inside ${spec.width}x${spec.height} grid` };
  }

  const blockers = [];
  for (const b of stmts.getBuildings.all(playerId)) {
    if (ignoreBuildingId != null && Number(b.id) === Number(ignoreBuildingId)) continue;
    if ((b.grid_index || 0) !== Number(gridIndex)) continue;
    const bDef = BUILDING_DEFS[b.type] || { size: [1, 1] };
    const [bw, bh] = bDef.size || [1, 1];
    const overlaps = gridX < b.grid_x + bw
      && gridX + w > b.grid_x
      && gridZ < b.grid_z + bh
      && gridZ + h > b.grid_z;
    if (overlaps) blockers.push({ id: b.id, type: b.type, grid_x: b.grid_x, grid_z: b.grid_z });
  }
  if (blockers.length) {
    return { ok: false, error: 'Grid cells are occupied', blockers };
  }
  return { ok: true, size: { width: w, height: h }, grid: spec };
}

function findOpenBuildingSlots(playerId, type, gridIndex = 0, limit = 20) {
  const def = BUILDING_DEFS[type];
  const spec = getGridSpec(gridIndex);
  if (!def || !spec) return [];
  const [w, h] = def.size || [1, 1];
  const slots = [];
  for (let z = 0; z <= spec.height - h; z++) {
    for (let x = 0; x <= spec.width - w; x++) {
      const check = canPlaceBuildingAt(playerId, type, x, z, gridIndex);
      if (check.ok) slots.push({ grid_x: x, grid_z: z, grid_index: Number(gridIndex) });
      if (slots.length >= limit) return slots;
    }
  }
  return slots;
}

function normalizeLegacyBarracksRows() {
  try {
    const legacyPlayers = db.prepare(`
      SELECT DISTINCT player_id
      FROM buildings
      WHERE type = 'barracks'
    `).all().map((row) => row.player_id);
    if (legacyPlayers.length === 0) return;

    const getLegacyRows = db.prepare(`
      SELECT *
      FROM buildings
      WHERE player_id = ? AND type = 'barracks'
      ORDER BY id ASC
    `);
    const getBarn = db.prepare(`
      SELECT id
      FROM buildings
      WHERE player_id = ? AND type = 'barn'
      LIMIT 1
    `);
    const deleteBuilding = db.prepare(`DELETE FROM buildings WHERE id = ?`);
    const convertToBarn = db.prepare(`
      UPDATE buildings
      SET type = 'barn', grid_x = ?, grid_z = ?, grid_index = ?, hp = ?, max_hp = ?
      WHERE id = ?
    `);

    db.transaction((playerIds) => {
      for (const playerId of playerIds) {
        const legacyRows = getLegacyRows.all(playerId);
        if (legacyRows.length === 0) continue;

        if (getBarn.get(playerId)) {
          for (const row of legacyRows) deleteBuilding.run(row.id);
          continue;
        }

        const primary = legacyRows[0];
        for (const row of legacyRows.slice(1)) deleteBuilding.run(row.id);

        let target = {
          grid_x: Number(primary.grid_x) || 0,
          grid_z: Number(primary.grid_z) || 0,
          grid_index: 0,
        };
        const placement = canPlaceBuildingAt(playerId, 'barn', target.grid_x, target.grid_z, target.grid_index, primary.id);
        if (!placement.ok) {
          const slot = findOpenBuildingSlots(playerId, 'barn', 0, 1)[0];
          if (!slot) {
            deleteBuilding.run(primary.id);
            continue;
          }
          target = slot;
        }

        const level = Math.min(Math.max(Number(primary.level) || 1, 1), BUILDING_DEFS.barn.hp_levels.length);
        const maxHp = BUILDING_DEFS.barn.hp_levels[level - 1] || BUILDING_DEFS.barn.hp_levels[0];
        const hp = Math.min(Math.max(Number(primary.hp) || maxHp, 1), maxHp);
        convertToBarn.run(target.grid_x, target.grid_z, target.grid_index, hp, maxHp, primary.id);
      }
    })(legacyPlayers);

    console.log(`[db] normalized legacy barracks rows for ${legacyPlayers.length} player(s)`);
  } catch (e) {
    console.warn('[db] legacy barracks normalization warning:', e.message);
  }
}

normalizeLegacyBarracksRows();

function referralSlugBase(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]+/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return base || 'player';
}

function normalizeReferralCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\/r\//i, '')
    .replace(/^\/?r\//i, '')
    .split(/[?#]/)[0]
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 48);
}

function parseSettingBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return !!fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function clampSettingInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function readAppSettingJsonValue(key, fallback = null) {
  try {
    const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(String(key || ''));
    return row ? JSON.parse(row.value_json || '{}') : fallback;
  } catch {
    return fallback;
  }
}

function writeAppSettingJsonValue(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = datetime('now')
  `).run(String(key || ''), JSON.stringify(value || {}));
  return value;
}

const LUCKY_RAIDER_PAYOUT_SETTINGS_KEY = 'lucky_raider.payouts';
const REFERRAL_SETTINGS_KEY = 'referrals.config';
const TASK_NFT_REWARD_BOOST_SETTINGS_KEY = 'tasks.nft_reward_boosts.v1';
const TASK_NFT_REWARD_BOOST_COLLECTIONS = [
  { key: 'demon_king', label: 'Demon King' },
  { key: 'dragon', label: 'Dragon' },
];
const TASK_NFT_REWARD_BOOST_RARITIES = ['common', 'epic', 'legendary'];

function getLuckyRaiderPayoutSettings() {
  const parsed = readAppSettingJsonValue(LUCKY_RAIDER_PAYOUT_SETTINGS_KEY, null) || {};
  const envAutoDefault = parseSettingBool(process.env.LUCKY_RAIDER_AUTO_PAYOUT, false);
  return {
    auto_payout_enabled: parseSettingBool(parsed.auto_payout_enabled, envAutoDefault),
    manual_payout_enabled: parseSettingBool(parsed.manual_payout_enabled, true),
    wallet_link_required: parseSettingBool(parsed.wallet_link_required, true),
    max_batch_size: clampSettingInt(
      parsed.max_batch_size,
      clampSettingInt(process.env.LUCKY_RAIDER_PAYOUT_BATCH_SIZE, 10, 1, 100),
      1,
      100
    ),
    max_attempts: clampSettingInt(
      parsed.max_attempts,
      clampSettingInt(process.env.LUCKY_RAIDER_PAYOUT_MAX_ATTEMPTS, 5, 1, 50),
      1,
      50
    ),
    retry_seconds: clampSettingInt(
      parsed.retry_seconds,
      clampSettingInt(process.env.LUCKY_RAIDER_PAYOUT_RETRY_SECONDS, 300, 0, 86_400),
      0,
      86_400
    ),
  };
}

function setLuckyRaiderPayoutSettings(input = {}) {
  const current = getLuckyRaiderPayoutSettings();
  const next = { ...current };
  if (Object.prototype.hasOwnProperty.call(input, 'auto_payout_enabled')) {
    next.auto_payout_enabled = parseSettingBool(input.auto_payout_enabled, current.auto_payout_enabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'manual_payout_enabled')) {
    next.manual_payout_enabled = parseSettingBool(input.manual_payout_enabled, current.manual_payout_enabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'wallet_link_required')) {
    next.wallet_link_required = parseSettingBool(input.wallet_link_required, current.wallet_link_required);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'max_batch_size')) {
    next.max_batch_size = clampSettingInt(input.max_batch_size, current.max_batch_size, 1, 100);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'max_attempts')) {
    next.max_attempts = clampSettingInt(input.max_attempts, current.max_attempts, 1, 50);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'retry_seconds')) {
    next.retry_seconds = clampSettingInt(input.retry_seconds, current.retry_seconds, 0, 86_400);
  }
  writeAppSettingJsonValue(LUCKY_RAIDER_PAYOUT_SETTINGS_KEY, next);
  return next;
}

function clampSettingPct(value, fallback = 0, min = 0, max = 1000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function emptyTaskNftRewardBoostCollectionConfig(collectionKey) {
  const spec = TASK_NFT_REWARD_BOOST_COLLECTIONS.find((item) => item.key === collectionKey) || {};
  return {
    enabled: true,
    label: spec.label || collectionKey,
    base_pct: 0,
    extra_pct_per_additional: 0,
    max_extra_nfts: 0,
    rarity_pct: { common: 0, epic: 0, legendary: 0 },
  };
}

function normalizeTaskNftRewardBoostCollectionConfig(input = {}, collectionKey) {
  const base = emptyTaskNftRewardBoostCollectionConfig(collectionKey);
  const raw = input && typeof input === 'object' ? input : {};
  const rawRarity = raw.rarity_pct && typeof raw.rarity_pct === 'object' ? raw.rarity_pct : {};
  const rarityPct = {};
  for (const rarity of TASK_NFT_REWARD_BOOST_RARITIES) {
    rarityPct[rarity] = clampSettingPct(rawRarity[rarity], base.rarity_pct[rarity], 0, 1000);
  }
  return {
    enabled: parseSettingBool(raw.enabled, base.enabled),
    label: String(raw.label || base.label || collectionKey).trim().slice(0, 80),
    base_pct: clampSettingPct(raw.base_pct, base.base_pct, 0, 1000),
    extra_pct_per_additional: clampSettingPct(raw.extra_pct_per_additional, base.extra_pct_per_additional, 0, 1000),
    max_extra_nfts: clampSettingInt(raw.max_extra_nfts ?? raw.maxExtraNfts, base.max_extra_nfts, 0, 1000),
    rarity_pct: rarityPct,
  };
}

function normalizeTaskNftRewardBoostTaskOverrides(input = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = String(key || '').trim();
    if (!/^\d+$/.test(id)) continue;
    if (value === null || value === undefined || value === '') continue;
    out[id] = parseSettingBool(value, false);
  }
  return out;
}

function normalizeTaskNftRewardBoostSettings(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const rawCollections = raw.collections && typeof raw.collections === 'object' ? raw.collections : {};
  const collections = {};
  for (const spec of TASK_NFT_REWARD_BOOST_COLLECTIONS) {
    collections[spec.key] = normalizeTaskNftRewardBoostCollectionConfig(rawCollections[spec.key], spec.key);
  }
  return {
    enabled: parseSettingBool(raw.enabled, true),
    default_task_enabled: parseSettingBool(raw.default_task_enabled ?? raw.defaultTaskEnabled, true),
    task_overrides: normalizeTaskNftRewardBoostTaskOverrides(raw.task_overrides || raw.taskOverrides || {}),
    // Count bonuses stack per owned NFT. Rarity uses the best owned rarity per
    // collection so a whale cannot multiply rarity bonus by every token.
    rarity_mode: 'best',
    collections,
  };
}

function getTaskNftRewardBoostSettings() {
  return normalizeTaskNftRewardBoostSettings(
    readAppSettingJsonValue(TASK_NFT_REWARD_BOOST_SETTINGS_KEY, {})
  );
}

function setTaskNftRewardBoostSettings(input = {}) {
  const current = getTaskNftRewardBoostSettings();
  const raw = input && typeof input === 'object' ? input : {};
  const next = normalizeTaskNftRewardBoostSettings({
    ...current,
    ...raw,
    collections: {
      ...(current.collections || {}),
      ...((raw.collections && typeof raw.collections === 'object') ? raw.collections : {}),
    },
    task_overrides: Object.prototype.hasOwnProperty.call(raw, 'task_overrides') || Object.prototype.hasOwnProperty.call(raw, 'taskOverrides')
      ? (raw.task_overrides || raw.taskOverrides || {})
      : (current.task_overrides || {}),
  });
  writeAppSettingJsonValue(TASK_NFT_REWARD_BOOST_SETTINGS_KEY, next);
  return next;
}

function taskNftRewardBoostTaskEnabled(taskId, settings = getTaskNftRewardBoostSettings()) {
  if (!settings.enabled) return false;
  const rawId = taskId == null || taskId === '' ? '' : String(taskId).trim();
  if (rawId && Object.prototype.hasOwnProperty.call(settings.task_overrides || {}, rawId)) {
    return !!settings.task_overrides[rawId];
  }
  return !!settings.default_task_enabled;
}

function taskNftRewardBoostNftSummary(playerId, options = {}) {
  const settings = options && (options.collections || Object.prototype.hasOwnProperty.call(options, 'enabled')) && !options.settings
    ? normalizeTaskNftRewardBoostSettings(options)
    : normalizeTaskNftRewardBoostSettings(options?.settings || getTaskNftRewardBoostSettings());
  const taskId = options?.taskId ?? options?.task_id ?? options?.id ?? null;
  const details = [];
  let totalPct = 0;
  const taskEnabled = taskNftRewardBoostTaskEnabled(taskId, settings);
  if (!playerId || !settings.enabled || !taskEnabled) {
    return {
      enabled: !!settings.enabled,
      task_enabled: taskEnabled,
      default_task_enabled: !!settings.default_task_enabled,
      task_id: taskId,
      total_pct: 0,
      multiplier: 1,
      collections: details,
    };
  }

  for (const spec of TASK_NFT_REWARD_BOOST_COLLECTIONS) {
    const cfg = settings.collections?.[spec.key] || emptyTaskNftRewardBoostCollectionConfig(spec.key);
    if (!cfg.enabled) continue;
    const nfts = listPlayerCollectionNftsForTaskBoost(playerId, spec.key);
    const count = nfts.length;
    if (count <= 0) continue;

    const rarityCounts = {};
    let bestRarity = null;
    let bestRarityPct = 0;
    for (const nft of nfts) {
      const rarity = normalizeNftRarity(nft.rarity);
      if (!rarity) continue;
      rarityCounts[rarity] = (rarityCounts[rarity] || 0) + 1;
      const pct = clampSettingPct(cfg.rarity_pct?.[rarity], 0, 0, 1000);
      if (pct > bestRarityPct) {
        bestRarityPct = pct;
        bestRarity = rarity;
      }
    }

    const basePct = clampSettingPct(cfg.base_pct, 0, 0, 1000);
    const extraPctPerAdditional = clampSettingPct(cfg.extra_pct_per_additional, 0, 0, 1000);
    const maxExtraNfts = clampSettingInt(cfg.max_extra_nfts, 0, 0, 1000);
    const rawExtraCount = Math.max(0, count - 1);
    const countedExtraCount = maxExtraNfts > 0 ? Math.min(rawExtraCount, maxExtraNfts) : rawExtraCount;
    const extraPct = extraPctPerAdditional * countedExtraCount;
    const collectionPct = basePct + extraPct + bestRarityPct;
    if (collectionPct <= 0) continue;
    totalPct += collectionPct;
    details.push({
      collection: spec.key,
      label: cfg.label || spec.label,
      count,
      extra_count: countedExtraCount,
      raw_extra_count: rawExtraCount,
      max_extra_nfts: maxExtraNfts,
      base_pct: basePct,
      extra_pct: extraPct,
      extra_pct_per_additional: extraPctPerAdditional,
      rarity_pct: bestRarityPct,
      best_rarity: bestRarity,
      rarity_counts: rarityCounts,
      total_pct: collectionPct,
    });
  }

  return {
    enabled: !!settings.enabled,
    task_enabled: taskEnabled,
    default_task_enabled: !!settings.default_task_enabled,
    task_id: taskId,
    total_pct: totalPct,
    multiplier: 1 + (totalPct / 100),
    collections: details,
  };
}

function applyTaskNftRewardBoost(playerId, reward = {}, options = {}) {
  const base = {
    gold: Math.max(0, intOr0(reward.gold)),
    wood: Math.max(0, intOr0(reward.wood)),
    ore: Math.max(0, intOr0(reward.ore)),
  };
  const boost = taskNftRewardBoostNftSummary(playerId, options);
  const multiplier = Number(boost.multiplier || 1) || 1;
  const boosted = {
    gold: Math.round(base.gold * multiplier),
    wood: Math.round(base.wood * multiplier),
    ore: Math.round(base.ore * multiplier),
  };
  const bonus = {
    gold: Math.max(0, boosted.gold - base.gold),
    wood: Math.max(0, boosted.wood - base.wood),
    ore: Math.max(0, boosted.ore - base.ore),
  };
  return {
    ...boosted,
    base,
    bonus,
    nft_bonus: bonus,
    boost_pct: boost.total_pct,
    multiplier: boost.multiplier,
    task_enabled: boost.task_enabled,
    default_task_enabled: boost.default_task_enabled,
    task_id: boost.task_id,
    details: boost.collections,
  };
}

function clampReferralBps(value, fallback = 1000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(10000, Math.round(n)));
}

function getReferralSettings() {
  let parsed = null;
  try {
    const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(REFERRAL_SETTINGS_KEY);
    parsed = row ? JSON.parse(row.value_json || '{}') : null;
  } catch {}
  const mode = parsed?.mode === 'all' ? 'all' : 'selected';
  return {
    mode,
    default_bps: clampReferralBps(parsed?.default_bps, 1000),
  };
}

function setReferralSettings(input = {}) {
  const next = {
    mode: input.mode === 'all' ? 'all' : 'selected',
    default_bps: clampReferralBps(input.default_bps, 1000),
  };
  db.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = datetime('now')
  `).run(REFERRAL_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function getReferralCodeForPlayer(playerId, { visibleOnly = false } = {}) {
  const row = db.prepare('SELECT * FROM referral_codes WHERE player_id = ?').get(String(playerId || ''));
  if (!row || !visibleOnly) return row || null;
  const settings = getReferralSettings();
  if (!row.active) return null;
  if (settings.mode === 'all' || Number(row.manual_enabled || 0) === 1) return row;
  return null;
}

function ensureReferralCode(playerOrId, options = {}) {
  const player = typeof playerOrId === 'object'
    ? playerOrId
    : stmts.getPlayerById.get(String(playerOrId || ''));
  if (!player?.id) return null;
  const settings = getReferralSettings();
  const force = !!options.force || settings.mode === 'all';
  const manualEnabled = options.manualEnabled == null ? (force && settings.mode !== 'all' ? 1 : 0) : (options.manualEnabled ? 1 : 0);
  const active = options.active == null ? 1 : (options.active ? 1 : 0);
  const commissionBps = clampReferralBps(options.commissionBps, settings.default_bps);
  const note = options.note == null ? null : String(options.note).slice(0, 500);
  const existing = db.prepare('SELECT * FROM referral_codes WHERE player_id = ?').get(player.id);
  if (existing) {
    if (options.force || options.update) {
      const customCode = normalizeReferralCode(options.code);
      if (customCode && customCode !== existing.code) {
        const conflict = db.prepare('SELECT player_id FROM referral_codes WHERE lower(code) = lower(?) AND player_id <> ?').get(customCode, player.id);
        if (conflict) throw new Error('Referral code is already used');
        db.prepare(`
          UPDATE referral_codes
          SET code = ?, slug = ?, commission_bps = ?, manual_enabled = ?, active = ?, note = ?, updated_at = datetime('now')
          WHERE player_id = ?
        `).run(customCode, customCode, commissionBps, manualEnabled, active, note, player.id);
      } else {
        db.prepare(`
          UPDATE referral_codes
          SET commission_bps = ?, manual_enabled = ?, active = ?, note = ?, updated_at = datetime('now')
          WHERE player_id = ?
        `).run(commissionBps, manualEnabled, active, note, player.id);
      }
      return db.prepare('SELECT * FROM referral_codes WHERE player_id = ?').get(player.id);
    }
    return existing;
  }
  if (!force) return null;

  const customCode = normalizeReferralCode(options.code);
  const base = customCode || referralSlugBase(player.name);
  const shortId = crypto.createHash('sha1').update(String(player.id)).digest('hex').slice(0, 6);
  for (let i = 0; i < 32; i += 1) {
    const suffix = i === 0 ? '' : `-${i + 1}`;
    const room = Math.max(1, 40 - suffix.length);
    const slug = `${base.slice(0, room)}${suffix}`;
    const code = customCode && i === 0 ? customCode : (i === 0 ? slug : `${slug}-${shortId}`);
    try {
      db.prepare(`
        INSERT INTO referral_codes (player_id, code, slug, commission_bps, manual_enabled, active, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(player.id, code, slug, commissionBps, manualEnabled, active, note);
      return db.prepare('SELECT * FROM referral_codes WHERE player_id = ?').get(player.id);
    } catch (e) {
      if (!/UNIQUE/i.test(String(e?.message || ''))) throw e;
      if (customCode) throw new Error('Referral code is already used');
    }
  }
  const fallback = `${base.slice(0, 24)}-${shortId}`;
  db.prepare(`
    INSERT OR IGNORE INTO referral_codes (player_id, code, slug, commission_bps, manual_enabled, active, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(player.id, fallback, fallback, commissionBps, manualEnabled, active, note);
  return db.prepare('SELECT * FROM referral_codes WHERE player_id = ?').get(player.id);
}

function issueReferralCodeForPlayer(playerLookup, options = {}) {
  const lookup = String(playerLookup || '').trim();
  if (!lookup) throw new Error('Player is required');
  const player = db.prepare(`
    SELECT id, name FROM players
    WHERE id = ? OR lower(name) = lower(?)
    ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).get(lookup, lookup, lookup);
  if (!player) throw new Error('Player not found');
  return ensureReferralCode(player, {
    force: true,
    update: true,
    manualEnabled: true,
    active: options.active == null ? true : !!options.active,
    code: options.code,
    commissionBps: options.commissionBps,
    note: options.note,
  });
}

function bindPlayerReferral(referredPlayerId, rawCode, source = 'unknown', metadata = {}) {
  const code = normalizeReferralCode(rawCode);
  if (!referredPlayerId || !code) return { bound: false, reason: 'missing_code' };
  const referred = stmts.getPlayerById.get(String(referredPlayerId));
  if (!referred) return { bound: false, reason: 'referred_not_found' };
  const existing = db.prepare('SELECT * FROM player_referrals WHERE referred_player_id = ?').get(referred.id);
  if (existing) return { bound: false, existing, reason: 'already_bound' };
  const settings = getReferralSettings();
  const refCode = db.prepare(`
    SELECT rc.*, p.name AS referrer_name
    FROM referral_codes rc
    JOIN players p ON p.id = rc.player_id
    WHERE rc.active = 1
      AND (? = 'all' OR rc.manual_enabled = 1)
      AND (lower(rc.code) = lower(?) OR lower(rc.slug) = lower(?))
    LIMIT 1
  `).get(settings.mode, code, code);
  if (!refCode) return { bound: false, reason: 'code_not_found' };
  if (refCode.player_id === referred.id) return { bound: false, reason: 'self_referral' };
  db.prepare(`
    INSERT OR IGNORE INTO player_referrals
      (referred_player_id, referrer_player_id, code, source, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    referred.id,
    refCode.player_id,
    refCode.code,
    String(source || 'unknown').slice(0, 80),
    JSON.stringify(metadata || {}),
  );
  const row = db.prepare('SELECT * FROM player_referrals WHERE referred_player_id = ?').get(referred.id);
  return { bound: !!row, referral: row, code: refCode };
}

function usdE6ToNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

function getReferralSummary(playerId) {
  const player = stmts.getPlayerById.get(String(playerId || ''));
  if (!player) return null;
  const settings = getReferralSettings();
  const code = settings.mode === 'all'
    ? ensureReferralCode(player)
    : getReferralCodeForPlayer(player.id, { visibleOnly: true });
  if (!code) return null;
  const bound = db.prepare(`
    SELECT pr.*, p.name AS referrer_name
    FROM player_referrals pr
    JOIN players p ON p.id = pr.referrer_player_id
    WHERE pr.referred_player_id = ?
  `).get(player.id) || null;
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS events,
      COALESCE(SUM(CASE WHEN status IN ('confirmed', 'claimable') THEN commission_usd_e6 ELSE 0 END), 0) AS confirmed_usd_e6,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_usd_e6 ELSE 0 END), 0) AS pending_usd_e6,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_usd_e6 ELSE 0 END), 0) AS paid_usd_e6
    FROM referral_events
    WHERE referrer_player_id = ?
  `).get(player.id) || {};
  const invited = db.prepare(`
    SELECT COUNT(*) AS count
    FROM player_referrals
    WHERE referrer_player_id = ?
  `).get(player.id) || {};
  const recent = db.prepare(`
    SELECT e.*, p.name AS referred_name
    FROM referral_events e
    JOIN players p ON p.id = e.referred_player_id
    WHERE e.referrer_player_id = ?
    ORDER BY e.created_at DESC
    LIMIT 25
  `).all(player.id).map((row) => ({
    id: row.id,
    referredPlayerId: row.referred_player_id,
    referredName: row.referred_name,
    sourceType: row.source_type,
    sourceId: row.source_id,
    revenueKind: row.revenue_kind,
    status: row.status,
    grossUsd: usdE6ToNumber(row.gross_usd_e6),
    commissionUsd: usdE6ToNumber(row.commission_usd_e6),
    txHash: row.tx_hash || null,
    createdAt: row.created_at,
  }));
  return {
    code: code?.code || null,
    slug: code?.slug || null,
    active: code ? !!code.active : false,
    manual_enabled: !!code.manual_enabled,
    rate_bps: clampReferralBps(code?.commission_bps, settings.default_bps),
    invited_count: Number(invited.count || 0),
    confirmed_usd: usdE6ToNumber(totals.confirmed_usd_e6),
    pending_usd: usdE6ToNumber(totals.pending_usd_e6),
    paid_usd: usdE6ToNumber(totals.paid_usd_e6),
    events_count: Number(totals.events || 0),
    referred_by: bound ? {
      player_id: bound.referrer_player_id,
      name: bound.referrer_name,
      code: bound.code,
      bound_at: bound.bound_at,
    } : null,
    recent,
  };
}

function recordReferralRevenue({
  referredPlayerId,
  sourceType,
  sourceId,
  revenueKind,
  grossUsdE6,
  status = 'confirmed',
  currency = 'USD',
  txHash = null,
  metadata = {},
} = {}) {
  const gross = Math.max(0, Math.trunc(Number(grossUsdE6) || 0));
  if (!referredPlayerId || !sourceType || !sourceId || gross <= 0) return { changes: 0, reason: 'invalid_input' };
  const referral = db.prepare('SELECT * FROM player_referrals WHERE referred_player_id = ?').get(String(referredPlayerId));
  if (!referral || referral.referrer_player_id === referredPlayerId) return { changes: 0, reason: 'no_referrer' };
  const rateBps = clampReferralBps(
    db.prepare('SELECT commission_bps FROM referral_codes WHERE player_id = ? AND active = 1').get(referral.referrer_player_id)?.commission_bps,
    getReferralSettings().default_bps,
  );
  const commission = Math.trunc((gross * rateBps) / 10000);
  if (commission <= 0) return { changes: 0, reason: 'dust' };
  const info = db.prepare(`
    INSERT OR IGNORE INTO referral_events (
      referrer_player_id, referred_player_id, source_type, source_id,
      revenue_kind, currency, gross_usd_e6, commission_usd_e6, commission_bps,
      status, tx_hash, metadata_json, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IN ('confirmed', 'claimable') THEN datetime('now') ELSE NULL END)
  `).run(
    referral.referrer_player_id,
    String(referredPlayerId),
    String(sourceType),
    String(sourceId),
    String(revenueKind || sourceType),
    String(currency || 'USD').slice(0, 20),
    gross,
    commission,
    rateBps,
    String(status || 'confirmed'),
    txHash == null ? null : String(txHash),
    JSON.stringify(metadata || {}),
    String(status || 'confirmed'),
  );
  if (!info.changes && String(status || 'confirmed') === 'confirmed') {
    const upgrade = db.prepare(`
      UPDATE referral_events
      SET gross_usd_e6 = ?,
          commission_usd_e6 = ?,
          commission_bps = ?,
          status = 'confirmed',
          tx_hash = COALESCE(?, tx_hash),
          metadata_json = ?,
          confirmed_at = COALESCE(confirmed_at, datetime('now'))
      WHERE source_type = ?
        AND source_id = ?
        AND status = 'pending'
    `).run(
      gross,
      commission,
      rateBps,
      txHash == null ? null : String(txHash),
      JSON.stringify(metadata || {}),
      String(sourceType),
      String(sourceId),
    );
    if (upgrade.changes) {
      return { changes: 0, upgraded: upgrade.changes || 0, commission_usd_e6: commission, commission_bps: rateBps };
    }
  }
  return { changes: info.changes || 0, upgraded: 0, commission_usd_e6: commission, commission_bps: rateBps };
}

function registerPlayer(name, options = {}) {
  const id = uuidv4();
  const token = uuidv4();
  stmts.createPlayer.run(id, name, token);
  // Init troop levels
  for (const troop of ACTIVE_TROOP_TYPES) {
    stmts.upsertTroopLevel.run(id, troop, 1);
  }
  ensurePlayerShip(id);
  const player = { id, name, token };
  if (options.referralCode) {
    try {
      bindPlayerReferral(id, options.referralCode, options.referralSource || 'register', options.referralMetadata || {});
    } catch (e) {
      console.warn('[referrals] bind on register failed:', e.message);
    }
  }
  return player;
}

function isPlayerBanned(player) {
  return !!(player && player.banned_at);
}

function authenticatePlayer(token) {
  const player = stmts.getPlayerByToken.get(token);
  return isPlayerBanned(player) ? null : player;
}

function safeNameHistoryMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  try {
    return JSON.stringify(metadata).slice(0, 4000);
  } catch {
    return null;
  }
}

function renamePlayer(playerId, nextName, options = {}) {
  const id = String(playerId || '').trim();
  const name = String(nextName || '').trim();
  if (!id) return { ok: false, error: 'player_not_found', status: 404 };
  if (!name) return { ok: false, error: 'invalid_name', status: 400 };
  const source = String(options.source || 'unknown').trim().slice(0, 80) || 'unknown';
  const changedBy = String(options.changedBy || options.changed_by || '').trim().slice(0, 120) || null;
  const metadataJson = safeNameHistoryMetadata(options.metadata);
  const run = db.transaction(() => {
    const player = stmts.getPlayerById.get(id);
    if (!player) return { ok: false, error: 'player_not_found', status: 404 };
    const oldName = String(player.name || '');
    if (oldName === name) {
      return { ok: true, changed: false, old_name: oldName, new_name: oldName, player };
    }
    const clash = stmts.getPlayerNameClash.get(name, id);
    if (clash) return { ok: false, error: 'nickname_taken', status: 409 };
    stmts.updatePlayerNameById.run(name, id);
    stmts.insertPlayerNameHistory.run(id, oldName, name, source, changedBy, metadataJson);
    const updated = stmts.getPlayerById.get(id) || { ...player, name };
    return { ok: true, changed: true, old_name: oldName, new_name: name, player: updated };
  });
  try {
    return run();
  } catch (e) {
    if (String(e?.message || '').includes('UNIQUE')) {
      return { ok: false, error: 'nickname_taken', status: 409 };
    }
    throw e;
  }
}

function listPlayerNameHistory(playerId, limit = 100) {
  const id = String(playerId || '').trim();
  if (!id) return [];
  const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
  return stmts.listPlayerNameHistory.all(id, safeLimit).map((row) => ({
    ...row,
    metadata: (() => {
      try { return JSON.parse(row.metadata_json || '{}'); } catch { return {}; }
    })(),
    metadata_json: undefined,
  }));
}

function getAdminPlayer(identifier) {
  const key = String(identifier || '').trim();
  if (!key) return null;
  return stmts.getAdminPlayerByIdentifier.get(key, key, key, key, key, key) || null;
}

function banPlayer(identifier, options = {}) {
  const player = getAdminPlayer(identifier);
  if (!player) return null;
  const reason = String(options.reason || 'admin ban').trim().slice(0, 500) || 'admin ban';
  const bannedBy = String(options.bannedBy || options.banned_by || 'admin').trim().slice(0, 120) || 'admin';
  stmts.banPlayerById.run(reason, bannedBy, player.id);
  return stmts.getPlayerById.get(player.id) || null;
}

function unbanPlayer(identifier) {
  const player = getAdminPlayer(identifier);
  if (!player) return null;
  stmts.unbanPlayerById.run(player.id);
  return stmts.getPlayerById.get(player.id) || null;
}

function walletBlacklistKey(wallet) {
  return String(wallet || '').trim();
}

function getWalletBlacklist(wallet) {
  const key = walletBlacklistKey(wallet);
  if (!key) return null;
  return stmts.getWalletBlacklist.get(key) || null;
}

function isWalletBlacklisted(wallet) {
  return !!getWalletBlacklist(wallet);
}

function blacklistWallet(wallet, options = {}) {
  const key = walletBlacklistKey(wallet);
  if (!key) return null;
  const chainType = String(options.chainType || options.chain_type || '').trim().toLowerCase() || null;
  const reason = String(options.reason || 'admin blacklist').trim().slice(0, 500) || 'admin blacklist';
  const playerId = String(options.playerId || options.player_id || '').trim() || null;
  const createdBy = String(options.createdBy || options.created_by || 'admin').trim().slice(0, 120) || 'admin';
  stmts.upsertWalletBlacklist.run(key, chainType, reason, playerId, createdBy);
  return getWalletBlacklist(key);
}

function unblacklistWallet(wallet) {
  const key = walletBlacklistKey(wallet);
  if (!key) return { changes: 0 };
  return stmts.deleteWalletBlacklist.run(key);
}

function listWalletBlacklist(limit = 200) {
  const n = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 200)));
  return stmts.listWalletBlacklist.all(n);
}

function normalizeMmBotAccessRow(row) {
  if (!row) return null;
  return {
    player_id: row.player_id,
    player_name: row.player_name || null,
    player_wallet: row.player_wallet || null,
    player_dex: row.player_dex || null,
    enabled: Number(row.enabled || 0) === 1,
    note: row.note || null,
    created_at: row.created_at || null,
    created_by: row.created_by || null,
    updated_at: row.updated_at || null,
    updated_by: row.updated_by || null,
  };
}

function getMmBotAccess(playerId) {
  const id = String(playerId || '').trim();
  if (!id) return null;
  return normalizeMmBotAccessRow(stmts.getMmBotAccessByPlayerId.get(id));
}

function isMmBotAccessEnabled(playerId) {
  return !!getMmBotAccess(playerId)?.enabled;
}

function listMmBotAccess(limit = 500) {
  const n = Math.max(1, Math.min(5000, Math.floor(Number(limit) || 500)));
  return stmts.listMmBotAccess.all(n).map(normalizeMmBotAccessRow);
}

function listEnabledMmBotAccessPlayerIds() {
  return new Set(stmts.listEnabledMmBotAccess.all().map((row) => String(row.player_id || '')).filter(Boolean));
}

function setMmBotAccess(identifier, options = {}) {
  const player = getAdminPlayer(identifier);
  if (!player) return null;
  const enabledRaw = String(options.enabled ?? 'true').trim().toLowerCase();
  const enabled = options.enabled === false || options.enabled === 0 || ['0', 'false', 'no', 'off'].includes(enabledRaw) ? 0 : 1;
  const noteRaw = options.note ?? options.reason ?? '';
  const note = noteRaw == null ? null : String(noteRaw).trim().slice(0, 500) || null;
  const actor = String(options.updatedBy || options.updated_by || options.createdBy || options.created_by || 'admin')
    .trim()
    .slice(0, 120) || 'admin';
  stmts.upsertMmBotAccess.run(player.id, enabled, note, actor, actor);
  return getMmBotAccess(player.id);
}

function normalizeDemonKingNftLevel(level) {
  const n = Number(level);
  return [1, 2, 3].includes(n) ? n : 1;
}

const NFT_RARITY_LABELS = {
  common: 'Common',
  epic: 'Epic',
  legendary: 'Legendary',
};

function normalizeNftRarity(value) {
  const text = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(NFT_RARITY_LABELS, text) ? text : null;
}

function collectionSupportsRarity(collection) {
  const key = normalizePlayerNftCollection(collection);
  return key === 'demon_king' || key === 'dragon';
}

function demonKingLegacyRarityFallback(level) {
  return normalizeDemonKingNftLevel(level) > 1 ? 'legendary' : null;
}

function normalizeRarityRow(row, fallbackLevel = 1, fallbackCollection = 'demon_king') {
  const collection = normalizePlayerNftCollection(row?.collection || fallbackCollection);
  const rarity = normalizeNftRarity(row?.rarity)
    || (collection === 'demon_king' ? demonKingLegacyRarityFallback(fallbackLevel) : null);
  if (!rarity) return null;
  return {
    collection,
    chain: String(row?.chain || '').toLowerCase(),
    tokenId: String(row?.token_id ?? row?.tokenId ?? ''),
    rarity,
    rarityLabel: NFT_RARITY_LABELS[rarity],
    legacyLevel: normalizeDemonKingNftLevel(row?.legacy_level ?? fallbackLevel),
    ownerWallet: row?.owner_wallet || null,
    playerId: row?.player_id || null,
    source: row?.rarity_source || null,
    revealedAt: row?.revealed_at || null,
    updatedAt: row?.updated_at || null,
  };
}

function normalizeDemonKingNftRow(row) {
  if (!row) return null;
  const level = normalizeDemonKingNftLevel(row.level);
  const rarity = normalizeNftRarity(row.rarity) || demonKingLegacyRarityFallback(level);
  return {
    playerId: row.player_id,
    collection: row.collection || 'demon_king',
    chain: String(row.chain || '').toLowerCase(),
    tokenId: String(row.token_id || ''),
    wallet: row.wallet || '',
    level,
    legacyLevel: level,
    rarity,
    rarityLabel: rarity ? NFT_RARITY_LABELS[rarity] : 'Unrevealed',
    rarityRevealedAt: row.rarity_revealed_at || null,
    imageUrl: row.image_url || null,
    active: !!row.active,
    source: row.source || null,
    txHash: row.tx_hash || null,
    verifiedAt: row.verified_at || null,
    lastSeenAt: row.last_seen_at || null,
    updatedAt: row.updated_at || null,
    wins: Math.max(0, Number(row.battle_wins || row.wins || 0) || 0),
    battleWins: Math.max(0, Number(row.battle_wins || row.wins || 0) || 0),
  };
}

function normalizeDemonKingNftInput(token = {}) {
  const chain = String(token.chain || '').trim().toLowerCase();
  const tokenId = String(token.tokenId ?? token.token_id ?? token.id ?? '').trim();
  if (!chain || !tokenId) return null;
  return {
    chain,
    tokenId,
    level: normalizeDemonKingNftLevel(token.level),
    imageUrl: token.imageUrl || token.image_url || null,
  };
}

function normalizePlayerNftCollection(collection) {
  const key = String(collection || 'demon_king')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (!key || key === 'demonking' || key === 'demon_king') return 'demon_king';
  if (key === 'fire_dragon') return 'dragon';
  return key;
}

function normalizeCollectionNftRow(row) {
  if (!row) return null;
  const collection = normalizePlayerNftCollection(row.collection);
  const level = normalizeDemonKingNftLevel(row.level);
  const rarity = collectionSupportsRarity(collection)
    ? (normalizeNftRarity(row.rarity) || (collection === 'demon_king' ? demonKingLegacyRarityFallback(level) : null))
    : null;
  return {
    playerId: row.player_id,
    collection,
    chain: String(row.chain || '').toLowerCase(),
    tokenId: String(row.token_id || ''),
    wallet: row.wallet || '',
    level,
    legacyLevel: level,
    ...(collectionSupportsRarity(collection) ? {
      rarity,
      rarityLabel: rarity ? NFT_RARITY_LABELS[rarity] : 'Unrevealed',
      rarityRevealedAt: row.rarity_revealed_at || null,
    } : {}),
    imageUrl: row.image_url || null,
    active: !!row.active,
    source: row.source || null,
    txHash: row.tx_hash || null,
    verifiedAt: row.verified_at || null,
    lastSeenAt: row.last_seen_at || null,
    updatedAt: row.updated_at || null,
    wins: Math.max(0, Number(row.battle_wins || row.wins || 0) || 0),
    battleWins: Math.max(0, Number(row.battle_wins || row.wins || 0) || 0),
  };
}

function normalizeDemonKingBattleToken(token = {}) {
  const chain = String(token.chain ?? token.chainKey ?? token.nftChain ?? '').trim().toLowerCase();
  const tokenId = String(
    token.tokenId ?? token.token_id ?? token.tokenIdRaw ?? token.nftTokenId ?? ''
  ).trim();
  const tokenOk = ['base', 'arbitrum', 'monad', 'ink'].includes(chain)
    ? /^\d+$/.test(tokenId)
    : chain === 'aptos'
      ? /^0x[0-9a-fA-F]{1,64}$/.test(tokenId)
      : chain === 'solana'
        ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenId)
        : false;
  if (!chain || !tokenOk) return null;
  return { chain, tokenId };
}

function normalizeDemonKingBattleTokens(tokens = []) {
  const unique = new Map();
  if (!Array.isArray(tokens)) return [];
  for (const raw of tokens) {
    const token = normalizeDemonKingBattleToken(raw);
    if (!token) continue;
    unique.set(`${token.chain}:${token.tokenId}`, token);
  }
  return [...unique.values()];
}

function normalizeDemonKingChains(chains, tokens = []) {
  const set = new Set();
  if (Array.isArray(chains)) {
    for (const chain of chains) {
      const key = String(chain || '').trim().toLowerCase();
      if (key) set.add(key);
    }
  }
  for (const token of tokens) {
    const key = String(token?.chain || '').trim().toLowerCase();
    if (key) set.add(key);
  }
  return [...set].filter(Boolean);
}

function listPlayerDemonKingNfts(playerId, wallet = null) {
  if (!playerId) return [];
  const rows = wallet
    ? stmts.listPlayerDemonKingNftsByWallet.all(playerId, String(wallet).trim())
    : stmts.listPlayerDemonKingNfts.all(playerId);
  return rows.map(normalizeDemonKingNftRow).filter(Boolean);
}

function listPlayerCollectionNfts(playerId, collection = 'demon_king', wallet = null) {
  const collectionKey = normalizePlayerNftCollection(collection);
  if (!playerId || !collectionKey) return [];
  const rows = wallet
    ? stmts.listPlayerCollectionNftsByWallet.all(playerId, collectionKey, String(wallet).trim())
    : stmts.listPlayerCollectionNfts.all(playerId, collectionKey);
  return rows.map(normalizeCollectionNftRow).filter(Boolean);
}

function listPlayerCollectionNftsForTaskBoost(playerId, collection = 'demon_king') {
  const collectionKey = normalizePlayerNftCollection(collection);
  if (!playerId || !collectionKey) return [];
  const rows = stmts.listPlayerCollectionNftsForTaskBoost.all(
    playerId,
    playerId,
    playerId,
    playerId,
    playerId,
    playerId,
    collectionKey,
    playerId
  );
  const byToken = new Map();
  for (const row of rows) {
    const nft = normalizeCollectionNftRow(row);
    if (!nft) continue;
    const key = `${nft.collection}:${nft.chain}:${nft.tokenId}`.toLowerCase();
    if (!key) continue;
    const existing = byToken.get(key);
    if (!existing || existing.playerId !== playerId && nft.playerId === playerId) {
      byToken.set(key, nft);
    }
  }
  return [...byToken.values()];
}

function getPlayerDemonKingNft(playerId, chain, tokenId) {
  if (!playerId || !chain || tokenId == null) return null;
  return normalizeDemonKingNftRow(stmts.getPlayerDemonKingNft.get(
    playerId,
    String(chain).trim().toLowerCase(),
    String(tokenId).trim()
  ));
}

function getPlayerCollectionNft(playerId, collection = 'demon_king', chain, tokenId) {
  const collectionKey = normalizePlayerNftCollection(collection);
  if (!playerId || !collectionKey || !chain || tokenId == null) return null;
  return normalizeCollectionNftRow(stmts.getPlayerCollectionNft.get(
    playerId,
    collectionKey,
    String(chain).trim().toLowerCase(),
    String(tokenId).trim()
  ));
}

const _replacePlayerDemonKingNftsTxn = db.transaction((playerId, wallet, tokens, options = {}) => {
  const owner = String(wallet || '').trim();
  const chains = normalizeDemonKingChains(options.chains, tokens);
  for (const chain of chains) {
    stmts.deactivatePlayerDemonKingWalletChain.run(playerId, owner, chain);
  }

  for (const rawToken of tokens) {
    const token = normalizeDemonKingNftInput(rawToken);
    if (!token) continue;
    stmts.deactivateDemonKingTokenEverywhere.run(token.chain, token.tokenId, playerId, owner);
    stmts.upsertPlayerDemonKingNft.run(
      playerId,
      token.chain,
      token.tokenId,
      owner,
      token.level,
      token.imageUrl,
      options.source || rawToken.source || 'sync',
      options.txHash || rawToken.txHash || rawToken.tx_hash || null
    );
  }

  stmts.upsertDemonKingNftWalletCheck.run(
    playerId,
    owner,
    JSON.stringify(chains),
    tokens.length
  );
});

const _replacePlayerCollectionNftsTxn = db.transaction((playerId, collection, wallet, tokens, options = {}) => {
  const owner = String(wallet || '').trim();
  const collectionKey = normalizePlayerNftCollection(collection);
  const chains = normalizeDemonKingChains(options.chains, tokens);
  for (const chain of chains) {
    stmts.deactivatePlayerCollectionWalletChain.run(playerId, collectionKey, owner, chain);
  }

  for (const rawToken of tokens) {
    const token = normalizeDemonKingNftInput(rawToken);
    if (!token) continue;
    stmts.deactivateCollectionTokenEverywhere.run(collectionKey, token.chain, token.tokenId, playerId, owner);
    stmts.upsertPlayerCollectionNft.run(
      playerId,
      collectionKey,
      token.chain,
      token.tokenId,
      owner,
      token.level,
      token.imageUrl,
      options.source || rawToken.source || 'sync',
      options.txHash || rawToken.txHash || rawToken.tx_hash || null
    );
  }

  stmts.upsertCollectionNftWalletCheck.run(
    playerId,
    collectionKey,
    owner,
    JSON.stringify(chains),
    tokens.length
  );
});

function replacePlayerDemonKingNfts(playerId, wallet, tokens = [], options = {}) {
  const owner = String(wallet || '').trim();
  if (!playerId || !owner) return [];
  const normalized = Array.isArray(tokens)
    ? tokens.map(normalizeDemonKingNftInput).filter(Boolean)
    : [];
  _replacePlayerDemonKingNftsTxn(playerId, owner, normalized, options);
  return listPlayerDemonKingNfts(playerId, owner);
}

function replacePlayerCollectionNfts(playerId, collection = 'demon_king', wallet, tokens = [], options = {}) {
  const owner = String(wallet || '').trim();
  const collectionKey = normalizePlayerNftCollection(collection);
  if (!playerId || !collectionKey || !owner) return [];
  const normalized = Array.isArray(tokens)
    ? tokens.map(normalizeDemonKingNftInput).filter(Boolean)
    : [];
  _replacePlayerCollectionNftsTxn(playerId, collectionKey, owner, normalized, options);
  return listPlayerCollectionNfts(playerId, collectionKey, owner);
}

function bindPlayerDemonKingNft(playerId, wallet, token = {}, options = {}) {
  const owner = String(wallet || '').trim();
  const normalized = normalizeDemonKingNftInput(token);
  if (!playerId || !owner || !normalized) return null;
  stmts.deactivateDemonKingTokenEverywhere.run(normalized.chain, normalized.tokenId, playerId, owner);
  stmts.upsertPlayerDemonKingNft.run(
    playerId,
    normalized.chain,
    normalized.tokenId,
    owner,
    normalized.level,
    normalized.imageUrl,
    options.source || token.source || 'verified',
    options.txHash || token.txHash || token.tx_hash || null
  );
  return getPlayerDemonKingNft(playerId, normalized.chain, normalized.tokenId);
}

function bindPlayerCollectionNft(playerId, collection = 'demon_king', wallet, token = {}, options = {}) {
  const owner = String(wallet || '').trim();
  const collectionKey = normalizePlayerNftCollection(collection);
  const normalized = normalizeDemonKingNftInput(token);
  if (!playerId || !collectionKey || !owner || !normalized) return null;
  stmts.deactivateCollectionTokenEverywhere.run(collectionKey, normalized.chain, normalized.tokenId, playerId, owner);
  stmts.upsertPlayerCollectionNft.run(
    playerId,
    collectionKey,
    normalized.chain,
    normalized.tokenId,
    owner,
    normalized.level,
    normalized.imageUrl,
    options.source || token.source || 'verified',
    options.txHash || token.txHash || token.tx_hash || null
  );
  return getPlayerCollectionNft(playerId, collectionKey, normalized.chain, normalized.tokenId);
}

function getNftRarity(collection = 'demon_king', chain, tokenId, options = {}) {
  const collectionKey = normalizePlayerNftCollection(collection);
  const chainKey = String(chain || '').trim().toLowerCase();
  const tokenText = String(tokenId ?? '').trim();
  if (!collectionKey || !chainKey || !tokenText) return null;
  const row = stmts.getNftRarity.get(collectionKey, chainKey, tokenText);
  if (!row) {
    if (collectionKey !== 'demon_king') return null;
    return normalizeRarityRow({
      collection: collectionKey,
      chain: chainKey,
      token_id: tokenText,
      legacy_level: options.legacyLevel,
    }, options.legacyLevel, collectionKey);
  }
  return normalizeRarityRow(row, options.legacyLevel, collectionKey);
}

function listNftRarities(collection = 'demon_king', chain, tokenIds = [], options = {}) {
  const collectionKey = normalizePlayerNftCollection(collection);
  const chainKey = String(chain || '').trim().toLowerCase();
  const ids = (Array.isArray(tokenIds) ? tokenIds : String(tokenIds || '').split(','))
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  if (!collectionKey || !chainKey || !ids.length) return {};
  const uniqueIds = [...new Set(ids)].slice(0, 500);
  const placeholders = uniqueIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT collection, chain, token_id, rarity, legacy_level, owner_wallet,
           player_id, rarity_source, reveal_seed, snapshot_hash,
           metadata_json, revealed_at, updated_at
      FROM nft_rarities
     WHERE collection = ? AND chain = ? AND token_id IN (${placeholders})
  `).all(collectionKey, chainKey, ...uniqueIds);
  const byId = {};
  for (const row of rows) {
    const normalized = normalizeRarityRow(row, options.legacyLevels?.[row.token_id], collectionKey);
    if (normalized?.tokenId) byId[normalized.tokenId] = normalized;
  }
  if (collectionKey === 'demon_king' && options.legacyLevels && typeof options.legacyLevels === 'object') {
    for (const id of uniqueIds) {
      if (byId[id]) continue;
      const fallback = normalizeRarityRow({
        collection: collectionKey,
        chain: chainKey,
        token_id: id,
        legacy_level: options.legacyLevels[id],
      }, options.legacyLevels[id]);
      if (fallback) byId[id] = fallback;
    }
  }
  return byId;
}

function upsertNftRarity({
  collection = 'demon_king',
  chain,
  tokenId,
  rarity,
  legacyLevel = 1,
  ownerWallet = null,
  playerId = null,
  source = 'reveal',
  revealSeed = null,
  snapshotHash = null,
  metadata = {},
} = {}) {
  const collectionKey = normalizePlayerNftCollection(collection);
  const chainKey = String(chain || '').trim().toLowerCase();
  const tokenText = String(tokenId ?? '').trim();
  const rarityKey = normalizeNftRarity(rarity);
  if (!collectionKey || !chainKey || !tokenText || !rarityKey) return null;
  const metadataJson = (() => {
    try { return JSON.stringify(metadata || {}); } catch { return '{}'; }
  })();
  stmts.upsertNftRarity.run(
    collectionKey,
    chainKey,
    tokenText,
    rarityKey,
    normalizeDemonKingNftLevel(legacyLevel),
    ownerWallet ? String(ownerWallet) : null,
    playerId ? String(playerId) : null,
    String(source || 'reveal').slice(0, 80),
    revealSeed ? String(revealSeed) : null,
    snapshotHash ? String(snapshotHash) : null,
    metadataJson,
  );
  return getNftRarity(collectionKey, chainKey, tokenText, { legacyLevel });
}

function getDemonKingNftWalletCheck(playerId, wallet) {
  if (!playerId || !wallet) return null;
  const row = stmts.getDemonKingNftWalletCheck.get(playerId, String(wallet).trim());
  if (!row) return null;
  let chains = [];
  try { chains = JSON.parse(row.chains || '[]'); } catch { chains = []; }
  return {
    playerId: row.player_id,
    collection: row.collection || 'demon_king',
    wallet: row.wallet,
    chains: Array.isArray(chains) ? chains.map((c) => String(c).toLowerCase()) : [],
    resultCount: Number(row.result_count) || 0,
    checkedAt: row.checked_at || null,
  };
}

function getCollectionNftWalletCheck(playerId, collection = 'demon_king', wallet) {
  const collectionKey = normalizePlayerNftCollection(collection);
  if (!playerId || !collectionKey || !wallet) return null;
  const row = stmts.getCollectionNftWalletCheck.get(playerId, collectionKey, String(wallet).trim());
  if (!row) return null;
  let chains = [];
  try { chains = JSON.parse(row.chains || '[]'); } catch { chains = []; }
  return {
    playerId: row.player_id,
    collection: row.collection || collectionKey,
    wallet: row.wallet,
    chains: Array.isArray(chains) ? chains.map((c) => String(c).toLowerCase()) : [],
    resultCount: Number(row.result_count) || 0,
    checkedAt: row.checked_at || null,
  };
}

function markDemonKingNftWalletChecked(playerId, wallet, chains = [], resultCount = 0) {
  if (!playerId || !wallet) return null;
  const chainList = normalizeDemonKingChains(chains);
  stmts.upsertDemonKingNftWalletCheck.run(
    playerId,
    String(wallet).trim(),
    JSON.stringify(chainList),
    Math.max(0, Number(resultCount) || 0)
  );
  return getDemonKingNftWalletCheck(playerId, wallet);
}

// ---------- Resource Storage Capacity (CoC-style) ----------

// Base capacity from Town Hall (without any Storage buildings)
const TH_BASE_CAPACITY = {
  1: { gold: 6000, wood: 6000, ore: 6000 },
  2: { gold: 6000, wood: 6000, ore: 6000 },
  3: { gold: 9000, wood: 9000, ore: 9000 },
  4: { gold: 12000, wood: 12000, ore: 12000 },
  5: { gold: 18000, wood: 18000, ore: 18000 },
};

// Additional capacity per Storage building per level
const STORAGE_CAPACITY = {
  1: { gold: 2000, wood: 2000, ore: 2000 },
  2: { gold: 3000, wood: 3000, ore: 3000 },
  3: { gold: 6500, wood: 6500, ore: 6500 },
  4: { gold: 14000, wood: 14000, ore: 14000 },
  5: { gold: 19000, wood: 19000, ore: 19000 },
};

function getResourceCaps(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  // Find Town Hall level
  let thLevel = 1;
  for (const b of buildings) {
    if (b.type === 'town_hall') thLevel = b.level;
  }
  const base = TH_BASE_CAPACITY[Math.min(thLevel, 5)] || TH_BASE_CAPACITY[1];
  let maxGold = base.gold;
  let maxWood = base.wood;
  let maxOre = base.ore;
  // Add capacity from each Storage building
  for (const b of buildings) {
    if (b.type === 'storage') {
      const cap = STORAGE_CAPACITY[b.level] || STORAGE_CAPACITY[1];
      maxGold += cap.gold;
      maxWood += cap.wood;
      maxOre += cap.ore;
    }
  }
  return { gold: maxGold, wood: maxWood, ore: maxOre };
}

function getResources(playerId) {
  return stmts.getResources.get(playerId);
}

function telemetryJson(value) {
  if (value == null) return '{}';
  try {
    const text = JSON.stringify(value);
    return text && text.length <= 20000 ? text : JSON.stringify({ truncated: true, bytes: text?.length || 0 });
  } catch {
    return '{}';
  }
}

function textOrNull(value, max = 500) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function intOr0(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function realOr0(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function recordTradeClaimResult(event = {}) {
  try {
    db.prepare(`
      INSERT INTO trade_claim_results (
        player_id, dex, futures_mode, wallet, result, reason,
        last_trade_id_before, last_trade_id_after,
        raw_trade_count, credited_trade_count, credited_open_count,
        raw_volume_usd, credited_volume_usd, pnl_usd,
        volume_gold, first_deposit_gold, first_trade_gold, daily_gold, pnl_gold,
        nft_boost_gold, tournament_gold, altar_bonus_gold, total_gold_paid,
        clamped_trade_count, settling_trade_count, claim_latency_ms, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.playerId || event.player_id || null,
      textOrNull(event.dex || 'unknown', 40),
      textOrNull(event.futuresMode || event.futures_mode, 40),
      textOrNull(event.wallet, 160),
      textOrNull(event.result || 'unknown', 40),
      textOrNull(event.reason, 300),
      event.lastTradeIdBefore ?? event.last_trade_id_before ?? null,
      event.lastTradeIdAfter ?? event.last_trade_id_after ?? null,
      intOr0(event.rawTradeCount ?? event.raw_trade_count),
      intOr0(event.creditedTradeCount ?? event.credited_trade_count),
      intOr0(event.creditedOpenCount ?? event.credited_open_count),
      realOr0(event.rawVolumeUsd ?? event.raw_volume_usd),
      realOr0(event.creditedVolumeUsd ?? event.credited_volume_usd),
      realOr0(event.pnlUsd ?? event.pnl_usd),
      realOr0(event.volumeGold ?? event.volume_gold),
      intOr0(event.firstDepositGold ?? event.first_deposit_gold),
      intOr0(event.firstTradeGold ?? event.first_trade_gold),
      intOr0(event.dailyGold ?? event.daily_gold),
      intOr0(event.pnlGold ?? event.pnl_gold),
      intOr0(event.nftBoostGold ?? event.nft_boost_gold),
      intOr0(event.tournamentGold ?? event.tournament_gold),
      intOr0(event.altarBonusGold ?? event.altar_bonus_gold),
      intOr0(event.totalGoldPaid ?? event.total_gold_paid),
      intOr0(event.clampedTradeCount ?? event.clamped_trade_count),
      intOr0(event.settlingTradeCount ?? event.settling_trade_count),
      intOr0(event.claimLatencyMs ?? event.claim_latency_ms),
      telemetryJson(event.metadata || event.metadata_json || {}),
    );
  } catch (e) {
    console.warn('[telemetry] trade_claim_results skipped:', e.message);
  }
}

function recordShopFunnelEvent(event = {}) {
  try {
    db.prepare(`
      INSERT INTO shop_funnel_events (
        player_id, event_type, sku, chain, payment, token, quantity,
        usd_price_e6, token_amount, price_source, tx_hash, quote_id,
        error_code, error_message, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.playerId || event.player_id || null,
      textOrNull(event.eventType || event.event_type || 'unknown', 80),
      textOrNull(event.sku, 80),
      textOrNull(event.chain, 40),
      textOrNull(event.payment, 40),
      textOrNull(event.token, 180),
      event.quantity == null ? null : intOr0(event.quantity),
      event.usdPriceE6 == null && event.usd_price_e6 == null ? null : String(event.usdPriceE6 ?? event.usd_price_e6),
      event.tokenAmount == null && event.token_amount == null ? null : String(event.tokenAmount ?? event.token_amount),
      textOrNull(event.priceSource || event.price_source, 240),
      textOrNull(event.txHash || event.tx_hash, 180),
      textOrNull(event.quoteId || event.quote_id, 180),
      textOrNull(event.errorCode || event.error_code, 120),
      textOrNull(event.errorMessage || event.error_message, 500),
      telemetryJson(event.metadata || event.metadata_json || {}),
    );
  } catch (e) {
    console.warn('[telemetry] shop_funnel_events skipped:', e.message);
  }
}

function recordTaskClaimEvent(event = {}) {
  try {
    db.prepare(`
      INSERT INTO task_claim_events (
        player_id, task_id, task_type, task_title, result,
        progress_value, target_value, reward_gold, reward_wood, reward_ore,
        repeatable, cooldown_hours, error_reason, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.playerId || event.player_id || null,
      event.taskId ?? event.task_id ?? null,
      textOrNull(event.taskType || event.task_type, 80),
      textOrNull(event.taskTitle || event.task_title, 240),
      textOrNull(event.result || 'unknown', 60),
      realOr0(event.progressValue ?? event.progress_value),
      realOr0(event.targetValue ?? event.target_value),
      intOr0(event.rewardGold ?? event.reward_gold),
      intOr0(event.rewardWood ?? event.reward_wood),
      intOr0(event.rewardOre ?? event.reward_ore),
      event.repeatable ? 1 : 0,
      realOr0(event.cooldownHours ?? event.cooldown_hours),
      textOrNull(event.errorReason || event.error_reason, 300),
      telemetryJson(event.metadata || event.metadata_json || {}),
    );
  } catch (e) {
    console.warn('[telemetry] task_claim_events skipped:', e.message);
  }
}

function recordResourceDeltaEvent(event = {}) {
  try {
    db.prepare(`
      INSERT INTO resource_delta_events (
        player_id, source_type,
        gold_delta, wood_delta, ore_delta,
        gold_before, wood_before, ore_before,
        gold_after, wood_after, ore_after,
        gold_cap_before, wood_cap_before, ore_cap_before,
        gold_cap_after, wood_cap_after, ore_cap_after,
        lost_gold_to_cap, lost_wood_to_cap, lost_ore_to_cap,
        related_purchase_id, related_task_id, related_replay_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.playerId || event.player_id || null,
      textOrNull(event.sourceType || event.source_type || 'resource_change', 80),
      intOr0(event.goldDelta ?? event.gold_delta),
      intOr0(event.woodDelta ?? event.wood_delta),
      intOr0(event.oreDelta ?? event.ore_delta),
      intOr0(event.goldBefore ?? event.gold_before),
      intOr0(event.woodBefore ?? event.wood_before),
      intOr0(event.oreBefore ?? event.ore_before),
      intOr0(event.goldAfter ?? event.gold_after),
      intOr0(event.woodAfter ?? event.wood_after),
      intOr0(event.oreAfter ?? event.ore_after),
      intOr0(event.goldCapBefore ?? event.gold_cap_before),
      intOr0(event.woodCapBefore ?? event.wood_cap_before),
      intOr0(event.oreCapBefore ?? event.ore_cap_before),
      intOr0(event.goldCapAfter ?? event.gold_cap_after),
      intOr0(event.woodCapAfter ?? event.wood_cap_after),
      intOr0(event.oreCapAfter ?? event.ore_cap_after),
      intOr0(event.lostGoldToCap ?? event.lost_gold_to_cap),
      intOr0(event.lostWoodToCap ?? event.lost_wood_to_cap),
      intOr0(event.lostOreToCap ?? event.lost_ore_to_cap),
      event.relatedPurchaseId ?? event.related_purchase_id ?? null,
      event.relatedTaskId ?? event.related_task_id ?? null,
      event.relatedReplayId ?? event.related_replay_id ?? null,
      telemetryJson(event.metadata || event.metadata_json || {}),
    );
  } catch (e) {
    console.warn('[telemetry] resource_delta_events skipped:', e.message);
  }
}

function addResources(playerId, gold = 0, wood = 0, ore = 0, options = {}) {
  const current = stmts.getResources.get(playerId);
  if (!current) return null;
  // Cap to storage capacity
  const capsBefore = getResourceCaps(playerId);
  const newGold = applyResourceDeltaWithCap(current.gold, gold, capsBefore.gold);
  const newWood = applyResourceDeltaWithCap(current.wood, wood, capsBefore.wood);
  const newOre = applyResourceDeltaWithCap(current.ore, ore, capsBefore.ore);
  stmts.updateResource.run(newGold, newWood, newOre, playerId);
  const capsAfter = getResourceCaps(playerId);
  const lostGoldToCap = Number(gold) > 0 ? Math.max(0, current.gold + Number(gold) - newGold) : 0;
  const lostWoodToCap = Number(wood) > 0 ? Math.max(0, current.wood + Number(wood) - newWood) : 0;
  const lostOreToCap = Number(ore) > 0 ? Math.max(0, current.ore + Number(ore) - newOre) : 0;
  recordResourceDeltaEvent({
    playerId,
    sourceType: options.sourceType || options.source_type || 'resource_change',
    goldDelta: newGold - current.gold,
    woodDelta: newWood - current.wood,
    oreDelta: newOre - current.ore,
    goldBefore: current.gold,
    woodBefore: current.wood,
    oreBefore: current.ore,
    goldAfter: newGold,
    woodAfter: newWood,
    oreAfter: newOre,
    goldCapBefore: capsBefore.gold,
    woodCapBefore: capsBefore.wood,
    oreCapBefore: capsBefore.ore,
    goldCapAfter: capsAfter.gold,
    woodCapAfter: capsAfter.wood,
    oreCapAfter: capsAfter.ore,
    lostGoldToCap,
    lostWoodToCap,
    lostOreToCap,
    relatedPurchaseId: options.relatedPurchaseId || options.related_purchase_id || null,
    relatedTaskId: options.relatedTaskId || options.related_task_id || null,
    relatedReplayId: options.relatedReplayId || options.related_replay_id || null,
    metadata: options.metadata || {},
  });
  return { gold: newGold, wood: newWood, ore: newOre };
}

function subtractResources(playerId, gold = 0, wood = 0, ore = 0, options = {}) {
  const current = stmts.getResources.get(playerId);
  if (!current) return null;
  if (current.gold < gold || current.wood < wood || current.ore < ore) {
    return { error: 'Not enough resources', current };
  }
  return addResources(playerId, -gold, -wood, -ore, options);
}

function canAfford(playerId, gold = 0, wood = 0, ore = 0) {
  const current = stmts.getResources.get(playerId);
  if (!current) return false;
  return current.gold >= gold && current.wood >= wood && current.ore >= ore;
}

function applyResourceDeltaWithCap(currentValue, deltaValue, capValue) {
  const current = Math.max(0, Number(currentValue) || 0);
  const delta = Number(deltaValue) || 0;
  const cap = Math.max(0, Number(capValue) || 0);
  const next = Math.max(0, current + delta);
  if (delta <= 0) return next;
  if (current >= cap) return current;
  return Math.min(cap, next);
}

function getTownHallLevel(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  for (const b of buildings) {
    if (b.type === 'town_hall') return b.level;
  }
  return 1;
}

function getBarnLevel(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  let level = 0;
  for (const b of buildings) {
    if (b.type === 'barn') level = Math.max(level, Number(b.level) || 0);
  }
  return level;
}

function hasTownHall(playerId) {
  return stmts.getBuildings.all(playerId).some((b) => b.type === 'town_hall');
}

function hasUtilityPurchase(playerId, utility) {
  if (!playerId || !utility) return false;
  const row = db.prepare(`
    SELECT 1
    FROM utility_purchases
    WHERE player_id = ? AND utility = ?
    LIMIT 1
  `).get(playerId, utility);
  return !!row;
}

function getShopEntitlements(playerId) {
  const altar = hasUtilityPurchase(playerId, 'altar');
  return { altar };
}

function getBuildingUnlocks(playerId) {
  return {
    altar: hasUtilityPurchase(playerId, 'altar'),
  };
}

function placeBuilding(playerId, type, gridX, gridZ, gridIndex = 0) {
  if (type === 'port') return { error: 'Ports were replaced by the player main ship' };
  const def = BUILDING_DEFS[type];
  if (!def) return { error: `Unknown building type: ${type}` };

  if (def.requires_purchase && !hasUtilityPurchase(playerId, def.shop_sku || type)) {
    return { error: `${type} requires an on-chain purchase first` };
  }

  if (type !== 'town_hall' && !hasTownHall(playerId)) {
    return { error: 'Build Town Hall first!' };
  }

  const placement = canPlaceBuildingAt(playerId, type, gridX, gridZ, gridIndex);
  if (!placement.ok) return { error: placement.error, blockers: placement.blockers };

  // Require Mine and Sawmill before any other building after Town Hall.
  if (type !== 'town_hall' && type !== 'mine' && type !== 'sawmill') {
    const existing = stmts.getBuildings.all(playerId);
    const hasMine = existing.some(b => b.type === 'mine');
    const hasSawmill = existing.some(b => b.type === 'sawmill');
    if (!hasMine || !hasSawmill) {
      return { error: 'Build a Mine and Sawmill first!' };
    }
  }

  // Check TH-based unlock and max count
  const thLevel = getTownHallLevel(playerId);
  const thMax = TH_MAX_COUNT[type];
  if (thMax) {
    const maxForTh = thMax[Math.min(thLevel - 1, thMax.length - 1)] || 0;
    if (maxForTh === 0) {
      const unlockAt = TH_UNLOCK[type];
      return { error: `${type} unlocks at Town Hall level ${unlockAt || '?'}` };
    }
    const existing = stmts.getBuildings.all(playerId).filter(b => b.type === type);
    if (existing.length >= maxForTh) {
      return { error: `Maximum ${maxForTh} ${type} at Town Hall level ${thLevel}` };
    }
  }

  // Check resources
  const cost = def.cost;
  if (!canAfford(playerId, cost.gold, cost.wood, cost.ore)) {
    return { error: 'Not enough resources', cost };
  }

  // Deduct resources
  subtractResources(playerId, cost.gold, cost.wood, cost.ore, {
    sourceType: 'building_place',
    metadata: { building_type: type, grid_x: gridX, grid_z: gridZ, grid_index: gridIndex },
  });

  const hp = def.hp_levels[0];
  const info = stmts.placeBuilding.run(playerId, type, gridX, gridZ, gridIndex, hp, hp);
  return {
    id: info.lastInsertRowid,
    type, level: 1, grid_x: gridX, grid_z: gridZ, grid_index: gridIndex,
    hp, max_hp: hp,
    resources: getResources(playerId),
  };
}

function upgradeBuilding(playerId, buildingId) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };

  const def = BUILDING_DEFS[building.type];
  if (!def) return { error: 'Unknown building type' };

  if (building.level >= def.max_level) {
    return { error: 'Already at max level' };
  }

  const nextLevel = building.level + 1;
  const thLevel = getTownHallLevel(playerId);

  // Town Hall upgrade — check required buildings up to their own cap.
  if (building.type === 'town_hall') {
    const required = TH_UPGRADE_REQUIRES[building.level];
    if (required) {
      const allBuildings = stmts.getBuildings.all(playerId);
      for (const reqType of required) {
        const reqDef = BUILDING_DEFS[reqType] || {};
        const requiredLevel = Math.min(building.level, Number(reqDef.max_level) || building.level);
        const found = allBuildings.find(b => b.type === reqType && b.level >= requiredLevel);
        if (!found) {
          return { error: `Upgrade all ${reqType} to level ${requiredLevel} first` };
        }
      }
    }
  } else {
    // Non-TH buildings can't exceed TH level
    if (nextLevel > thLevel) {
      return { error: `Upgrade Town Hall to level ${nextLevel} first` };
    }
  }

  // Cost mirrors the Godot economy helper.
  const cost = getBuildingUpgradeCost(building.type, building.level);

  if (!canAfford(playerId, cost.gold, cost.wood, cost.ore)) {
    return { error: 'Not enough resources', cost };
  }

  subtractResources(playerId, cost.gold, cost.wood, cost.ore, {
    sourceType: 'building_upgrade',
    metadata: { building_id: buildingId, building_type: building.type, from_level: building.level, to_level: nextLevel },
  });

  const newHp = def.hp_levels[nextLevel - 1];
  stmts.upgradeBuilding.run(nextLevel, newHp, newHp, buildingId, playerId);

  return {
    id: buildingId, type: building.type, level: nextLevel,
    hp: newHp, max_hp: newHp, cost,
    resources: getResources(playerId),
  };
}

function removeBuilding(playerId, buildingId) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };
  stmts.removeBuilding.run(buildingId, playerId);
  return { removed: buildingId, type: building.type };
}

function moveBuilding(playerId, buildingId, gridX, gridZ, gridIndex = null) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };
  const nextGridIndex = gridIndex == null ? (building.grid_index || 0) : Number(gridIndex);
  const placement = canPlaceBuildingAt(playerId, building.type, gridX, gridZ, nextGridIndex, buildingId);
  if (!placement.ok) return { error: placement.error, blockers: placement.blockers };
  stmts.moveBuilding.run(gridX, gridZ, nextGridIndex, buildingId, playerId);
  return {
    success: true,
    id: buildingId,
    type: building.type,
    level: building.level,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: nextGridIndex,
    resources: getResources(playerId),
  };
}

function getPlayerBuildings(playerId) {
  return decorateBuildingsForPlayer(
    playerId,
    stmts.getBuildings.all(playerId).filter((building) => building.type !== 'port'),
  );
}

function getTownHallFlag(playerId) {
  if (!playerId) return null;
  return stmts.getTownHallFlag.get(playerId) || null;
}

function getUnconsumedTownHallFlagPurchase(playerId, txHash = null) {
  if (!playerId) return null;
  const normalizedTx = txHash ? String(txHash).trim() : null;
  return stmts.getUnconsumedTownHallFlagPurchase.get(playerId, normalizedTx, normalizedTx) || null;
}

function setTownHallFlag(playerId, flag = {}) {
  if (!playerId) return { error: 'player_id required' };
  const purchaseId = Number(flag.purchaseId || flag.purchase_id || 0);
  if (!Number.isSafeInteger(purchaseId) || purchaseId <= 0) {
    return { error: 'purchase_id required' };
  }
  const imageUrl = String(flag.imageUrl || flag.image_url || '').trim();
  const imagePath = String(flag.imagePath || flag.image_path || '').trim();
  const imageSha256 = String(flag.imageSha256 || flag.image_sha256 || '').trim().toLowerCase();
  const mimeType = String(flag.mimeType || flag.mime_type || '').trim().toLowerCase();
  const txHash = String(flag.txHash || flag.tx_hash || '').trim() || null;
  if (!imageUrl || !imagePath || !/^[a-f0-9]{64}$/.test(imageSha256) || !mimeType) {
    return { error: 'invalid flag image metadata' };
  }

  return db.transaction(() => {
    stmts.insertTownHallFlagHistory.run(
      playerId,
      purchaseId,
      txHash,
      imageUrl,
      imagePath,
      imageSha256,
      mimeType,
    );
    stmts.upsertTownHallFlag.run(
      playerId,
      imageUrl,
      imagePath,
      imageSha256,
      mimeType,
      purchaseId,
      txHash,
    );
    return getTownHallFlag(playerId);
  })();
}

function clearTownHallFlag(playerId) {
  if (!playerId) return { error: 'player_id required' };
  stmts.clearTownHallFlag.run(playerId);
  return { ok: true };
}

function getBattleWins(playerId) {
  return Math.max(0, Number(stmts.getBattleWins.get(playerId)?.battle_wins || 0) || 0);
}

function getDemonKingBattleWins(playerId, chain, tokenId) {
  const token = normalizeDemonKingBattleToken({ chain, tokenId });
  if (!playerId || !token) return 0;
  return Math.max(0, Number(stmts.getDemonKingBattleWins.get(playerId, token.chain, token.tokenId)?.wins || 0) || 0);
}

function getCollectionBattleWins(playerId, collection = 'demon_king', chain, tokenId) {
  const collectionKey = normalizePlayerNftCollection(collection);
  const token = normalizeDemonKingBattleToken({ chain, tokenId });
  if (!playerId || !collectionKey || !token) return 0;
  return Math.max(0, Number(stmts.getCollectionBattleWins.get(playerId, collectionKey, token.chain, token.tokenId)?.wins || 0) || 0);
}

function recordDemonKingBattleWinEvents(replayId, playerId, tokens = []) {
  const id = Number(replayId);
  const normalized = normalizeDemonKingBattleTokens(tokens);
  if (!Number.isFinite(id) || id <= 0 || !playerId || !normalized.length) return [];
  const tx = db.transaction(() => {
    for (const token of normalized) {
      stmts.insertDemonKingBattleWinEvent.run(id, playerId, token.chain, token.tokenId);
    }
    return normalized.map((token) => ({
      ...token,
      wins: getDemonKingBattleWins(playerId, token.chain, token.tokenId),
    }));
  });
  return tx();
}

function recordCollectionBattleWinEvents(replayId, playerId, collection = 'demon_king', tokens = []) {
  const id = Number(replayId);
  const collectionKey = normalizePlayerNftCollection(collection);
  const normalized = normalizeDemonKingBattleTokens(tokens);
  if (!Number.isFinite(id) || id <= 0 || !playerId || !collectionKey || !normalized.length) return [];
  const tx = db.transaction(() => {
    for (const token of normalized) {
      stmts.insertCollectionBattleWinEvent.run(id, playerId, collectionKey, token.chain, token.tokenId);
    }
    return normalized.map((token) => ({
      ...token,
      collection: collectionKey,
      wins: getCollectionBattleWins(playerId, collectionKey, token.chain, token.tokenId),
    }));
  });
  return tx();
}

const NFT_BACKED_TROOP_COLLECTIONS = {
  demon_king: { collection: 'demon_king', label: 'Demon King' },
  fire_dragon: { collection: 'dragon', label: 'Dragon' },
};

function getNftBackedTroopUpgradeStatus(playerId, troopType, options = {}) {
  const troopKey = normalizeTroopTypeKey(troopType);
  const cfg = NFT_BACKED_TROOP_COLLECTIONS[troopKey];
  const def = TROOP_DEFS[troopKey];
  if (!cfg || !def) return null;
  const levels = stmts.getTroopLevels.all(playerId);
  const current = levels.find(t => t.troop_type === troopKey);
  const currentLevel = current ? current.level : 1;
  const nextLevel = currentLevel >= def.max_level ? null : currentLevel + 1;
  const barnGate = getTroopBarnGate(playerId, nextLevel);
  const token = normalizeDemonKingBattleToken(options);
  const battleWins = token ? getCollectionBattleWins(playerId, cfg.collection, token.chain, token.tokenId) : 0;
  const ownedCount = listPlayerCollectionNfts(playerId, cfg.collection).length;
  return {
    troop_type: troopKey,
    collection: cfg.collection,
    label: cfg.label,
    current_level: currentLevel,
    max_level: def.max_level,
    next_level: nextLevel,
    current_barn_level: barnGate.current_barn_level,
    required_barn_level: barnGate.required_barn_level,
    barn_ready: barnGate.barn_ready,
    current_town_hall_level: getTownHallLevel(playerId),
    required_town_hall_level: null,
    town_hall_ready: true,
    owns_nft: ownedCount > 0,
    owned_nfts: ownedCount,
    cost: nextLevel ? def.cost[currentLevel - 1] : null,
    battle_wins: battleWins,
    wins: battleWins,
    account_battle_wins: getBattleWins(playerId),
    required_wins: null,
    wins_ready: true,
    requires_nft_upgrade: false,
    nft_upgrade_price: null,
    win_scope: token ? `${cfg.collection}_nft` : 'none',
    nft: token ? { chain: token.chain, token_id: token.tokenId } : null,
  };
}

function getDemonKingUpgradeStatus(playerId, options = {}) {
  const generic = getNftBackedTroopUpgradeStatus(playerId, 'demon_king', options);
  if (generic) return generic;
  const def = TROOP_DEFS.demon_king;
  const levels = stmts.getTroopLevels.all(playerId);
  const current = levels.find(t => t.troop_type === 'demon_king');
  const currentLevel = current ? current.level : 1;
  const nextLevel = currentLevel >= def.max_level ? null : currentLevel + 1;
  const barnGate = getTroopBarnGate(playerId, nextLevel);
  const requiredWins = nextLevel ? demonKingRequiredWins(nextLevel) : null;
  const token = normalizeDemonKingBattleToken(options);
  const battleWins = token ? getDemonKingBattleWins(playerId, token.chain, token.tokenId) : 0;
  return {
    troop_type: 'demon_king',
    current_level: currentLevel,
    max_level: def.max_level,
    next_level: nextLevel,
    current_barn_level: barnGate.current_barn_level,
    required_barn_level: barnGate.required_barn_level,
    barn_ready: barnGate.barn_ready,
    current_town_hall_level: getTownHallLevel(playerId),
    required_town_hall_level: null,
    town_hall_ready: true,
    battle_wins: battleWins,
    wins: battleWins,
    account_battle_wins: getBattleWins(playerId),
    required_wins: requiredWins,
    wins_ready: requiredWins == null || battleWins >= requiredWins,
    requires_nft_upgrade: false,
    nft_upgrade_price: null,
    win_scope: token ? 'demon_king_nft' : 'none',
    nft: token ? { chain: token.chain, token_id: token.tokenId } : null,
  };
}

function upgradeTroop(playerId, troopType, options = {}) {
  const troopKey = normalizeTroopTypeKey(troopType);
  if (isTroopDisabled(troopKey)) {
    return {
      error: 'Troop disabled',
      code: 'TROOP_DISABLED',
      troop_type: troopKey,
      status: 400,
    };
  }

  const def = TROOP_DEFS[troopKey];
  if (!def) return { error: `Unknown troop type: ${troopType}` };

  const levels = stmts.getTroopLevels.all(playerId);
  const current = levels.find(t => normalizeTroopTypeKey(t.troop_type) === troopKey);
  const currentLevel = current ? clampTroopLevelForType(troopKey, current.level) : 1;
  const expectedLevel = Number(options.expectedLevel ?? options.expected_level ?? options.currentLevel ?? options.current_level ?? 0);
  if (Number.isFinite(expectedLevel) && expectedLevel > 0 && expectedLevel !== currentLevel) {
    return {
      error: `Troop level changed. Current level is ${currentLevel}.`,
      code: 'TROOP_LEVEL_CHANGED',
      status: 409,
      troop_type: troopKey,
      current_level: currentLevel,
      expected_level: expectedLevel,
      resources: getResources(playerId),
    };
  }

  if (currentLevel >= def.max_level) {
    return { error: 'Already at max level' };
  }

  const nextLevel = currentLevel + 1;
  const barnGate = getTroopBarnGate(playerId, nextLevel);
  if (!barnGate.barn_ready) {
    return {
      error: `Barn level ${barnGate.required_barn_level} required for troop level ${nextLevel}`,
      code: 'BARN_LEVEL_REQUIRED',
      status: 403,
      troop_type: troopKey,
      current_level: currentLevel,
      next_level: nextLevel,
      max_level: def.max_level,
      current_barn_level: barnGate.current_barn_level,
      required_barn_level: barnGate.required_barn_level,
      barn_ready: false,
      current_town_hall_level: getTownHallLevel(playerId),
      required_town_hall_level: null,
      town_hall_ready: true,
    };
  }

  const nftCfg = NFT_BACKED_TROOP_COLLECTIONS[troopKey];
  if (nftCfg && listPlayerCollectionNfts(playerId, nftCfg.collection).length === 0) {
    return {
      ...getNftBackedTroopUpgradeStatus(playerId, troopKey),
      error: `${nftCfg.label} NFT required`,
      code: 'NFT_TROOP_REQUIRED',
      status: 403,
    };
  }

  const cost = def.cost[currentLevel - 1]; // cost to upgrade FROM current level
  if (!cost) {
    return {
      error: `Missing upgrade cost for ${troopType} level ${currentLevel}`,
      code: 'TROOP_UPGRADE_COST_MISSING',
      status: 500,
      troop_type: troopKey,
      current_level: currentLevel,
      next_level: nextLevel,
    };
  }
  if (!canAfford(playerId, cost.gold, cost.wood, cost.ore)) {
    return { error: 'Not enough resources', cost };
  }

  subtractResources(playerId, cost.gold, cost.wood, cost.ore, {
    sourceType: 'troop_upgrade',
    metadata: { troop_type: troopKey, from_level: currentLevel, to_level: nextLevel },
  });
  const newLevel = nextLevel;
  stmts.upsertTroopLevel.run(playerId, troopKey, newLevel);

  return {
    troop_type: troopKey, level: newLevel, cost,
    resources: getResources(playerId),
  };
}

function getTroopLevels(playerId) {
  const levelsByType = {};
  for (const troopType of ACTIVE_TROOP_TYPES) levelsByType[troopType] = 1;
  for (const row of stmts.getTroopLevels.all(playerId)) {
    const troopType = normalizeTroopTypeKey(row.troop_type);
    if (!TROOP_DEFS[troopType] || isTroopDisabled(troopType)) continue;
    levelsByType[troopType] = Math.max(
      levelsByType[troopType] || 1,
      clampTroopLevelForType(troopType, row.level),
    );
  }
  return ACTIVE_TROOP_TYPES.map((troopType) => ({
    troop_type: troopType,
    level: clampTroopLevelForType(troopType, levelsByType[troopType]),
  }));
}

function getAltarSkillLevels(playerId) {
  const rows = stmts.getAltarSkillLevels.all(playerId);
  const result = {};
  for (const skillId of Object.keys(ALTAR_SKILL_DEFS)) result[skillId] = 0;
  for (const row of rows) {
    if (ALTAR_SKILL_DEFS[row.skill_id]) {
      result[row.skill_id] = Math.max(0, Math.min(ALTAR_SKILL_DEFS[row.skill_id].max_level, Number(row.level) || 0));
    }
  }
  return result;
}

function altarBonusPctFromLevels(levels, skillId) {
  const def = ALTAR_SKILL_DEFS[skillId];
  const level = Math.max(0, Math.min(def?.max_level || 0, Number(levels?.[skillId]) || 0));
  return level > 0 ? Number(def.bonuses[level - 1]) || 0 : 0;
}

function getAltarBonusPct(playerId, skillId) {
  return altarBonusPctFromLevels(getAltarSkillLevels(playerId), skillId);
}

function applyAltarProsperityResourceBonus(playerId, resources = {}) {
  const pct = getAltarBonusPct(playerId, 'prosperity');
  const base = {
    gold: Math.max(0, Math.floor(Number(resources.gold) || 0)),
    wood: Math.max(0, Math.floor(Number(resources.wood) || 0)),
    ore: Math.max(0, Math.floor(Number(resources.ore) || 0)),
  };
  const total = { ...base };
  const bonus = { gold: 0, wood: 0, ore: 0 };
  if (pct > 0) {
    for (const key of ['gold', 'wood', 'ore']) {
      if (base[key] <= 0) continue;
      total[key] = Math.ceil(base[key] * (1 + pct / 100));
      bonus[key] = total[key] - base[key];
    }
  }
  return {
    ...total,
    base,
    bonus,
    prosperity_bonus_pct: pct,
  };
}

function getAltarTrophyBonus(playerId) {
  const levels = getAltarSkillLevels(playerId);
  const level = Math.max(0, Math.min(ALTAR_SKILL_DEFS.glory.max_level, Number(levels.glory) || 0));
  if (level <= 0) return { level: 0, bonus: 0, min: 0, max: 0 };
  const bonus = Number(ALTAR_SKILL_DEFS.glory.bonuses[level - 1]) || 0;
  return { level, bonus, min: bonus, max: bonus };
}

function applyAltarBuildingBonuses(buildings, levels = {}) {
  const wardPct = altarBonusPctFromLevels(levels, 'ward');
  const hpMultiplier = 1 + wardPct / 100;
  return buildings.map((building) => {
    if (!DEFENSE_BUILDING_TYPES.has(building.type) || hpMultiplier <= 1) return building;
    const baseMaxHp = Math.max(1, Number(building.max_hp) || Number(building.hp) || 1);
    const baseHp = Math.max(0, Number(building.hp) || 0);
    const boostedMaxHp = Math.ceil(baseMaxHp * hpMultiplier);
    const boostedHp = baseHp >= baseMaxHp
      ? boostedMaxHp
      : Math.max(0, Math.min(boostedMaxHp, Math.ceil(baseHp * hpMultiplier)));
    return {
      ...building,
      hp: boostedHp,
      max_hp: boostedMaxHp,
      base_hp: baseHp,
      base_max_hp: baseMaxHp,
      altar_ward_bonus_pct: wardPct,
      altar_ward_damage_bonus_pct: wardPct,
    };
  });
}

function upgradeAltarSkill(playerId, skillId) {
  const def = ALTAR_SKILL_DEFS[skillId];
  if (!def) return { error: `Unknown altar skill: ${skillId}` };

  const hasAltar = stmts.getBuildings.all(playerId).some(b => b.type === 'altar');
  if (!hasAltar) return { error: 'Build an Altar first' };

  const levels = getAltarSkillLevels(playerId);
  const currentLevel = levels[skillId] || 0;
  if (currentLevel >= def.max_level) return { error: 'Already at max level' };

  const cost = def.cost[currentLevel];
  if (!canAfford(playerId, cost.gold || 0, cost.wood || 0, cost.ore || 0)) {
    return { error: 'Not enough resources', cost };
  }

  subtractResources(playerId, cost.gold || 0, cost.wood || 0, cost.ore || 0, {
    sourceType: 'altar_skill_upgrade',
    metadata: { skill_id: skillId, from_level: currentLevel, to_level: currentLevel + 1 },
  });
  const newLevel = currentLevel + 1;
  stmts.upsertAltarSkillLevel.run(playerId, skillId, newLevel);
  return {
    success: true,
    skill_id: skillId,
    level: newLevel,
    current_level: newLevel,
    bonus: def.bonuses[newLevel - 1],
    cost,
    altar_skills: getAltarSkillLevels(playerId),
    resources: getResources(playerId),
  };
}

function parseSqliteUtcDate(value) {
  if (!value) return null;
  const raw = String(value);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBuildingProductionSnapshot(building, now = new Date(), altarLevels = null) {
  const prod = PRODUCTION_DEFS[building.type];
  if (!prod) return null;
  const lastCollected = parseSqliteUtcDate(building.last_collected_at) || parseSqliteUtcDate(building.created_at) || now;
  const elapsedMinutes = Math.max(0, (now - lastCollected) / 60000);
  const lvl = Math.max(1, Math.floor(Number(building.level) || 1));
  const lvlIdx = Math.min(lvl - 1, prod.rate.length - 1);
  const levels = altarLevels || (building.player_id ? getAltarSkillLevels(building.player_id) : {});
  const prosperityApplies = prod.resource === 'gold' || prod.resource === 'wood' || prod.resource === 'ore';
  const prosperityPct = prosperityApplies ? altarBonusPctFromLevels(levels, 'prosperity') : 0;
  const ratePerMin = prod.rate[lvlIdx] * (1 + prosperityPct / 100);
  const maxStored = prod.max[lvlIdx];
  const stored = Math.min(Math.floor(ratePerMin * elapsedMinutes), maxStored);
  return {
    resource: prod.resource,
    stored,
    max: maxStored,
    rate_per_min: ratePerMin,
    base_rate_per_min: prod.rate[lvlIdx],
    altar_prosperity_bonus_pct: prosperityPct,
    elapsed_minutes: elapsedMinutes,
  };
}

function decorateBuildingsForPlayer(playerId, buildings) {
  const now = new Date();
  const levels = getAltarSkillLevels(playerId);
  const townHallFlag = getTownHallFlag(playerId);
  const withProduction = buildings.map((building) => {
    const production = getBuildingProductionSnapshot(building, now, levels);
    const decorated = production ? {
      ...building,
      stored: production.stored,
      production_resource: production.resource,
      production_max: production.max,
      production_rate_per_min: production.rate_per_min,
      production_base_rate_per_min: production.base_rate_per_min,
      altar_prosperity_bonus_pct: production.altar_prosperity_bonus_pct,
    } : { ...building };
    if (decorated.type === 'town_hall' && townHallFlag?.image_url) {
      decorated.town_hall_flag_url = townHallFlag.image_url;
      decorated.flag_url = townHallFlag.image_url;
      decorated.town_hall_flag_updated_at = townHallFlag.updated_at || null;
    }
    return decorated;
  });
  return applyAltarBuildingBonuses(withProduction, levels);
}

function collectResources(playerId, buildingId) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };

  const production = getBuildingProductionSnapshot(building, new Date(), getAltarSkillLevels(playerId));
  if (!production) return { error: 'This building does not produce resources' };

  if (production.elapsed_minutes < 0.1) return { error: 'Nothing to collect yet' };

  const produced = production.stored;

  if (produced <= 0) return { error: 'Nothing to collect yet' };

  // Add resources
  const addObj = { gold: 0, wood: 0, ore: 0 };
  addObj[production.resource] = produced;
  addResources(playerId, addObj.gold, addObj.wood, addObj.ore, {
    sourceType: 'production_collect',
    metadata: { building_id: buildingId, building_type: building.type, resource: production.resource, produced },
  });

  // Update last_collected_at
  const now = new Date();
  stmts.updateLastCollected.run(now.toISOString().replace('T', ' ').split('.')[0], buildingId, playerId);

  return {
    collected: produced,
    resource: production.resource,
    building_id: buildingId,
    resources: getResources(playerId),
  };
}

function getProductionStatus(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  const now = new Date();
  const levels = getAltarSkillLevels(playerId);
  const result = [];
  for (const b of buildings) {
    const production = getBuildingProductionSnapshot(b, now, levels);
    if (!production) continue;
    result.push({
      building_id: b.id,
      type: b.type,
      resource: production.resource,
      stored: production.stored,
      max: production.max,
      rate_per_min: production.rate_per_min,
      base_rate_per_min: production.base_rate_per_min,
      altar_prosperity_bonus_pct: production.altar_prosperity_bonus_pct,
    });
  }
  return result;
}

const MATCHMAKING_TROOP_ALIASES = {
  demonking: 'demon_king',
  demon_king: 'demon_king',
  firedragon: 'fire_dragon',
  fire_dragon: 'fire_dragon',
};

function clampMatchNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeMatchTroopType(entry) {
  const raw = String(entry || '').split(':')[0].trim().toLowerCase();
  return MATCHMAKING_TROOP_ALIASES[raw] || raw;
}

function matchTroopEntryLevel(entry, fallback = 1) {
  const match = String(entry || '').match(/:L([1-4])$/i);
  if (match) return clampMatchNumber(match[1], 1, 4, fallback);
  return clampMatchNumber(fallback, 1, 4, 1);
}

function troopLevelsObject(playerId) {
  const levels = {};
  for (const row of getTroopLevels(playerId)) {
    levels[row.troop_type] = clampMatchNumber(row.level, 1, 4, 1);
  }
  return levels;
}

function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function troopPowerFromEntry(entry, levelMap) {
  if (String(entry || '') === '_SLOT_FILLER_') return 0;
  const troopType = normalizeMatchTroopType(entry);
  if (!troopType || (!TROOP_STATS[troopType] && troopType !== 'demon_king')) return 0;
  const fallbackLevel = levelMap[troopType] || 1;
  const level = matchTroopEntryLevel(entry, fallbackLevel);
  const stats = troopType === 'demon_king'
    ? computeDemonKingStats(levelMap, Math.min(3, level))
    : (TROOP_STATS[troopType]?.[level] || TROOP_STATS[troopType]?.[1]);
  if (!stats) return 0;
  const hp = Math.max(1, Number(stats.hp) || 1);
  const damage = Math.max(0, Number(stats.damage) || 0);
  const atkSpeed = Math.max(0.1, Number(stats.atkSpeed) || 1);
  const dps = damage / atkSpeed;
  const rangeBonus = Number(stats.range || 0) >= 0.9 ? 80 : 0;
  const flyingBonus = stats.flying ? 140 : 0;
  return hp * 0.18 + dps * 28 + rangeBonus + flyingBonus;
}

function computeAttackPower(playerId) {
  const levels = troopLevelsObject(playerId);
  const ports = stmts.getBuildings.all(playerId)
    .filter((b) => b.type === 'port' && Number(b.has_ship) === 1);
  let power = 0;
  let troopCount = 0;
  let shipCount = 0;
  let shipCapacity = 0;
  for (const port of ports) {
    const troops = safeJsonArray(port.ship_troops);
    if (troops.length === 0) continue;
    shipCount += 1;
    const portLevel = clampMatchNumber(port.level, 1, BUILDING_DEFS.port.max_level, 1);
    shipCapacity += portLevel * 3;
    power += 120 + portLevel * 90;
    for (const troop of troops) {
      if (String(troop || '') === '_SLOT_FILLER_') continue;
      const p = troopPowerFromEntry(troop, levels);
      if (p <= 0) continue;
      troopCount += 1;
      power += p;
    }
  }
  const thLevel = getTownHallLevel(playerId);
  power += Math.max(0, thLevel - 1) * 180;
  return {
    power: Math.max(1, Math.round(power)),
    town_hall_level: thLevel,
    troop_count: troopCount,
    ship_count: shipCount,
    ship_capacity: shipCapacity,
  };
}

function defensePowerForBuilding(building) {
  const type = String(building.type || '').toLowerCase();
  const level = Math.max(1, Math.trunc(Number(building.level) || 1));
  if (type === 'turret') {
    const stats = DEFENSE_STATS.turret[level] || DEFENSE_STATS.turret[1];
    const dps = (Number(stats.damage) || 0) / Math.max(0.1, Number(stats.fireRate) || 1);
    return dps * 35 + (Number(stats.detectRange) || 0) * 180;
  }
  if (type === 'archer_tower') {
    const stats = DEFENSE_STATS.archer_tower[level] || DEFENSE_STATS.archer_tower[1];
    const dps = (Number(stats.damage) || 0) / Math.max(0.1, Number(stats.fireRate) || 1);
    return dps * 32 + (Number(stats.detectRange) || 0) * 170;
  }
  if (type === 'mage_tower') {
    const stats = DEFENSE_STATS.mage_tower[level] || DEFENSE_STATS.mage_tower[1];
    const dps = (Number(stats.maxDamage || stats.damage) || 0) / Math.max(0.1, Number(stats.tickRate || stats.fireRate) || 1);
    return dps * 24 + (Number(stats.detectRange) || 0) * 170;
  }
  if (type === 'mortar') {
    const stats = DEFENSE_STATS.mortar[level] || DEFENSE_STATS.mortar[1];
    const dps = (Number(stats.damage) || 0) / Math.max(0.1, Number(stats.fireRate) || 1);
    return dps * 30
      + (Number(stats.detectRange) || 0) * 165
      + (Number(stats.splashRadius) || 0) * 360
      - (Number(stats.minRange) || 0) * 90;
  }
  if (type === 'tombstone') {
    const stats = SKELETON_GUARD.levels?.[level] || SKELETON_GUARD;
    const dps = (Number(stats.damage) || 0) / Math.max(0.1, Number(stats.atkSpeed) || 1);
    return (Number(stats.hp) || 0) * 0.12 + dps * 38 + (Number(stats.detectionRadius) || 0) * 170;
  }
  if (type === 'shark_trap') {
    const damage = BUILDING_DEFS.shark_trap.damage_levels?.[Math.max(0, Math.min(4, level - 1))] || 500;
    return damage * 1.4;
  }
  return 0;
}

function computeBasePowerFromBuildings(buildings = []) {
  let power = 0;
  let thLevel = 1;
  let defenseCount = 0;
  for (const building of buildings) {
    const type = String(building.type || '').toLowerCase();
    const level = Math.max(1, Math.trunc(Number(building.level) || 1));
    const maxHp = Math.max(1, Number(building.max_hp) || botBuildingHp(type, level));
    const hpWeight = type === 'town_hall'
      ? 0.22
      : DEFENSE_BUILDING_TYPES.has(type)
        ? 0.18
        : 0.10;
    power += maxHp * hpWeight;
    if (type === 'town_hall') {
      thLevel = Math.max(thLevel, level);
      power += level * 420;
    }
    const defensePower = defensePowerForBuilding(building);
    if (defensePower > 0) {
      defenseCount += 1;
      power += defensePower;
    }
  }
  if (defenseCount >= 3) power += Math.min(600, (defenseCount - 2) * 140);
  return {
    power: Math.max(1, Math.round(power)),
    town_hall_level: thLevel,
    defense_count: defenseCount,
  };
}

function computeBasePower(playerId) {
  return computeBasePowerFromBuildings(stmts.getBuildings.all(playerId));
}

function replayRowToRaidResult(row) {
  const claimed = String(row?.claimed_result || '').toLowerCase();
  if (claimed === 'victory') return 'victory';
  const thHp = Number(row?.sim_th_hp_pct);
  if (Number.isFinite(thHp) && thHp <= 0.02) return 'victory';
  return 'defeat';
}

function getRecentRaidPerformance(playerId) {
  const limit = MATCHMAKING_CONFIG.recentRaidWindow;
  let rows = stmts.recentRaidMatchmakingResults.all(playerId, limit);
  if (!rows.length) {
    rows = stmts.recentBattleReplayResults.all(playerId, limit)
      .map((row) => ({ result: replayRowToRaidResult(row), created_at: row.created_at }));
  }
  let wins = 0;
  let losses = 0;
  let consecutiveLosses = 0;
  for (const row of rows) {
    if (row.result === 'victory') wins += 1;
    if (row.result === 'defeat') losses += 1;
  }
  for (const row of rows) {
    if (row.result === 'defeat') consecutiveLosses += 1;
    else break;
  }
  return {
    raids: rows.length,
    wins,
    losses,
    success_rate: rows.length ? wins / rows.length : null,
    consecutive_losses: consecutiveLosses,
  };
}

function matchmakingProfileForPlayer(playerId, attackPower) {
  const recent = getRecentRaidPerformance(playerId);
  const rate = recent.success_rate;
  let recoveryLevel = 0;
  if (recent.consecutive_losses >= MATCHMAKING_CONFIG.recoveryLossStreakStrong) {
    recoveryLevel = 2;
  } else if (
    recent.consecutive_losses >= MATCHMAKING_CONFIG.recoveryLossStreakSoft
    || (recent.raids >= MATCHMAKING_CONFIG.minRecoveryRaids && rate != null && rate < MATCHMAKING_CONFIG.strugglingSuccessRate)
  ) {
    recoveryLevel = 1;
  }

  let ratioBand = MATCHMAKING_CONFIG.normalRatio;
  let difficulty = 'normal';
  let botBias = 0.10;
  let liveBias = 0;
  let selectionReason = 'normal';

  if (recoveryLevel >= 2) {
    ratioBand = MATCHMAKING_CONFIG.easyRatio;
    difficulty = 'easy';
    botBias = -0.20;
    liveBias = 0.10;
    selectionReason = 'recovery_strong';
  } else if (recoveryLevel === 1) {
    ratioBand = {
      min: MATCHMAKING_CONFIG.easyRatio.min,
      target: (MATCHMAKING_CONFIG.easyRatio.target + MATCHMAKING_CONFIG.normalRatio.target) / 2,
      max: MATCHMAKING_CONFIG.normalRatio.max,
    };
    difficulty = 'easy';
    botBias = -0.08;
    liveBias = 0.04;
    selectionReason = 'recovery_soft';
  } else if (recent.raids >= 5 && rate != null && rate > MATCHMAKING_CONFIG.strongPlayerSuccessRate) {
    ratioBand = MATCHMAKING_CONFIG.hardRatio;
    difficulty = 'hard';
    botBias = 0.18;
    liveBias = -0.04;
    selectionReason = 'strong_player';
  }

  return {
    ...recent,
    recovery_level: recoveryLevel,
    target_ratio: ratioBand.target,
    ratio_band: ratioBand,
    preferred_difficulty: difficulty,
    bot_bias: botBias,
    live_bias: liveBias,
    selection_reason: selectionReason,
    attack_power: attackPower,
  };
}

function scoreMatchCandidate(candidate, attackPower, profile) {
  const base = Number(candidate.base_power || 0) > 0
    ? {
        power: Number(candidate.base_power),
        town_hall_level: Number(candidate.defender_th || candidate.level || 1),
      }
    : computeBasePower(candidate.id);
  const ratio = base.power / Math.max(1, attackPower.power);
  const band = profile.ratio_band;
  let score = Math.abs(ratio - profile.target_ratio);
  if (ratio < band.min) score += (band.min - ratio) * 1.5;
  if (ratio > band.max) score += (ratio - band.max) * 1.8;
  const thDiff = Math.abs(base.town_hall_level - attackPower.town_hall_level);
  score += thDiff * 0.16;
  if (base.town_hall_level > attackPower.town_hall_level) score += 0.10;
  const isBot = Number(candidate.is_bot || 0) === 1 || candidate.is_virtual_bot;
  score += isBot ? profile.bot_bias : profile.live_bias;
  if (isBot && candidate.bot_difficulty && candidate.bot_difficulty !== profile.preferred_difficulty) {
    score += candidate.bot_difficulty === 'hard' && profile.recovery_level > 0 ? 0.25 : 0.06;
  }
  score += Math.random() * 0.05;
  return {
    ...candidate,
    is_bot: isBot,
    base_power: base.power,
    defender_th: base.town_hall_level,
    base_power_ratio: ratio,
    match_score: score,
  };
}

function chooseWeightedCandidate(scored) {
  if (!scored.length) return null;
  const sorted = [...scored].sort((a, b) => a.match_score - b.match_score);
  const pool = sorted.slice(0, Math.max(1, MATCHMAKING_CONFIG.candidatePoolSize));
  let total = 0;
  const weights = pool.map((candidate, index) => {
    const weight = 1 / (0.18 + Math.max(0, candidate.match_score)) + Math.max(0, pool.length - index) * 0.015;
    total += weight;
    return weight;
  });
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[0];
}

function botCandidatesAllowedForTournament(matchFilter) {
  const ctx = matchFilter?.context || null;
  return !ctx || ctx.attack_match_policy !== 'enemy_only';
}

function getRaidRewardProfile(battleSessionId) {
  const sid = normalizeBattleSessionId(battleSessionId);
  const row = sid ? stmts.getRaidMatchmakingBySession.get(sid) : null;
  if (!row || Number(row.target_is_bot || 0) !== 1) {
    return { is_bot: false, loot_multiplier: 1, trophy_multiplier: 1, matchmaking: row || null };
  }
  const reason = String(row.selection_reason || '');
  if (!raidBotTargetsEnabled()) {
    return {
      is_bot: true,
      loot_multiplier: 1,
      trophy_multiplier: 1,
      matchmaking: row,
      reason: reason || 'raid_bot_targets_disabled',
    };
  }
  const difficulty = String(row.target_bot_difficulty || row.difficulty_bucket || 'normal');
  const lootKey = Number(row.recovery_level || 0) >= 2
    ? 'recovery_strong'
    : Number(row.recovery_level || 0) >= 1
      ? 'recovery_soft'
      : difficulty;
  return {
    is_bot: true,
    loot_multiplier: MATCHMAKING_CONFIG.botLootMultiplier[lootKey] || MATCHMAKING_CONFIG.botLootMultiplier.normal,
    trophy_multiplier: MATCHMAKING_CONFIG.botTrophyMultiplier[lootKey] || MATCHMAKING_CONFIG.botTrophyMultiplier.normal,
    matchmaking: row,
    reason,
  };
}

function isBotPlayer(playerId) {
  if (!playerId) return false;
  return Number(stmts.getPlayerById.get(playerId)?.is_bot || 0) === 1;
}

// Calculate base strength score: TH level * 100 + building progress %
function getBaseStrength(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  let thLevel = 1;
  for (const b of buildings) {
    if (b.type === 'town_hall') { thLevel = b.level; break; }
  }
  // Count building slots filled and leveled (same logic as client progress bar)
  let total = 0, done = 0;
  for (const type in TH_MAX_COUNT) {
    if (type === 'town_hall') continue;
    const limits = TH_MAX_COUNT[type];
    const maxAtTh = limits[Math.min(thLevel - 1, limits.length - 1)] || 0;
    if (maxAtTh <= 0) continue;
    const maxLevelForType = Math.min(thLevel, BUILDING_DEFS[type]?.max_level || thLevel);
    for (let s = 0; s < maxAtTh; s++) {
      for (let l = 1; l <= maxLevelForType; l++) total++;
    }
    const placed = buildings.filter(b => b.type === type).map(b => b.level).sort((a, b) => b - a);
    for (let s = 0; s < maxAtTh; s++) {
      const blvl = s < placed.length ? placed[s] : 0;
      for (let l = 1; l <= maxLevelForType; l++) {
        if (blvl >= l) done++;
      }
    }
  }
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  return thLevel * 100 + progress;
}

const BATTLE_RESERVATION_MINUTES = 10;

function sqliteDateFromMs(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function normalizeBattleSessionId(sessionId) {
  return String(sessionId || '').trim();
}

function battleShieldInfo(player) {
  if (!player?.shield_until) return null;
  const shieldEnd = new Date(`${player.shield_until}Z`);
  const remainingMs = shieldEnd.getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  return {
    shield_until: player.shield_until,
    remaining_ms: remainingMs,
    remaining_minutes: Math.max(1, Math.ceil(remainingMs / 60_000)),
    remaining_hours: Math.max(1, Math.ceil(remainingMs / 3_600_000)),
  };
}

function battleAttackCooldownInfo(defender, attackerId) {
  if (!defender?.last_attacked_at || defender.last_attacked_by !== attackerId) return null;
  const lastAttack = new Date(`${defender.last_attacked_at}Z`);
  const cooldownEnd = new Date(lastAttack.getTime() + ATTACK_COOLDOWN_HOURS * 3600000);
  const remainingMs = cooldownEnd.getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  return {
    reason: 'recent_successful_attack_1h',
    last_attacked_at: defender.last_attacked_at,
    cooldown_until: sqliteDateFromMs(cooldownEnd.getTime()),
    remaining_ms: remainingMs,
    remaining_minutes: Math.max(1, Math.ceil(remainingMs / 60_000)),
  };
}

function publicBattleTarget(player) {
  return player ? {
    id: player.id,
    name: player.name,
    trophies: player.trophies,
    level: player.level,
  } : null;
}

function findEnemy(playerId) {
  const player = stmts.getPlayerById.get(playerId);
  if (!player) return { error: 'Player not found' };
  return db.transaction(() => {
  stmts.expireBattleSessions.run();
  // One attacker should have only one live target reservation. If they tap
  // Find Enemy again, the newest target replaces the previous lock.
  stmts.cancelBattleSessionsForAttacker.run(playerId);
  const attackPower = computeAttackPower(playerId);
  const profile = matchmakingProfileForPlayer(playerId, attackPower);
  const rawCandidates = stmts.findEnemyCandidates.all(playerId, playerId, playerId, playerId);
  const matchFilter = filterTournamentAttackCandidates(playerId, rawCandidates);
  const liveCandidates = matchFilter.candidates;
  const includeBots = raidBotTargetsEnabled()
    && botCandidatesAllowedForTournament(matchFilter)
    && (
      profile.recovery_level > 0
      || liveCandidates.length < MATCHMAKING_CONFIG.minLiveCandidatesBeforeBots
      || attackPower.town_hall_level >= 3
    );
  const botCandidates = includeBots
    ? virtualBotCandidatesForProfile(attackPower, profile)
    : [];
  const candidates = [...liveCandidates, ...botCandidates];
  // Friendly user-facing message — same wording for "everybody is shielded"
  // and "no real bases registered yet" because from the player's POV they
  // both mean the same thing: come back later.
  const NO_TARGETS = 'Sorry — all bases are under shield right now. Wait a bit until their shields drop.';
  if (candidates.length === 0) {
    const restrictedError = matchFilter.blocked?.length
      ? tournamentAttackPolicyError(matchFilter.context, matchFilter.blocked[0])
      : null;
    return {
      error: restrictedError || NO_TARGETS,
      tournament_attack_policy: matchFilter.context || null,
      blocked_targets: matchFilter.blocked?.length || 0,
    };
  }

  const scoredCandidates = candidates.map((candidate) => scoreMatchCandidate(candidate, attackPower, profile));
  let best = chooseWeightedCandidate(scoredCandidates);
  if (!best) return { error: NO_TARGETS };

  const attackCostGold = getAttackCost(playerId);
  if (!canAfford(playerId, attackCostGold, 0, 0)) {
    return {
      error: `Not enough gold to attack. Need ${attackCostGold} gold.`,
      status: 400,
      attack_cost_gold: attackCostGold,
      resources: getResources(playerId),
    };
  }

  const sessionId = uuidv4();
  if (best.is_virtual_bot) {
    best = materializeBotTarget(best, sessionId);
  }

  // Repair enemy buildings before attack
  repairAllBuildings(best.id);
  const buildings = getPlayerBuildings(best.id);
  const repairedBase = computeBasePowerFromBuildings(buildings);
  const basePowerRatio = repairedBase.power / Math.max(1, attackPower.power);
  const difficultyBucket = basePowerRatio < MATCHMAKING_CONFIG.normalRatio.min
    ? 'easy'
    : basePowerRatio > MATCHMAKING_CONFIG.normalRatio.max
      ? 'hard'
      : 'normal';
  const resources = getResources(best.id);
  const reservedUntil = sqliteDateFromMs(Date.now() + BATTLE_RESERVATION_MINUTES * 60_000);
  const attackerResources = subtractResources(playerId, attackCostGold, 0, 0, {
    sourceType: 'attack_cost',
    metadata: {
      match_type: best.is_bot ? 'bot' : 'live',
      selection_reason: profile.selection_reason,
      defender_id: best.id,
      battle_session_id: sessionId,
      attack_power: attackPower.power,
      base_power: repairedBase.power,
      base_power_ratio: Number(basePowerRatio.toFixed(4)),
    },
  });
  if (attackerResources?.error) {
    return {
      error: 'Not enough gold to attack',
      status: 400,
      attack_cost_gold: attackCostGold,
      resources: getResources(playerId),
    };
  }
  stmts.createBattleSession.run(sessionId, playerId, best.id, reservedUntil);
  try {
    stmts.insertRaidMatchmaking.run(
      sessionId,
      playerId,
      best.id,
      best.is_bot ? 1 : 0,
      best.bot_difficulty || null,
      attackPower.town_hall_level,
      repairedBase.town_hall_level,
      attackPower.power,
      repairedBase.power,
      Number(basePowerRatio.toFixed(6)),
      difficultyBucket,
      profile.recovery_level,
      profile.success_rate == null ? null : Number(profile.success_rate.toFixed(6)),
      profile.raids,
      profile.consecutive_losses,
      Number(best.match_score.toFixed(6)),
      liveCandidates.length,
      botCandidates.length,
      profile.selection_reason
    );
  } catch (e) {
    console.warn('[matchmaking] failed to record raid match:', e.message);
  }
  return {
    id: best.id,
    name: best.name,
    trophies: best.trophies,
    level: best.level,
    is_bot: best.is_bot,
    matchmaking: {
      target_is_bot: best.is_bot,
      target_bot_difficulty: best.bot_difficulty || null,
      difficulty_bucket: difficultyBucket,
      selection_reason: profile.selection_reason,
      recovery_level: profile.recovery_level,
      recent_success_rate: profile.success_rate,
      recent_raid_count: profile.raids,
      consecutive_losses: profile.consecutive_losses,
      attack_power: attackPower.power,
      base_power: repairedBase.power,
      base_power_ratio: Number(basePowerRatio.toFixed(4)),
      live_candidate_count: liveCandidates.length,
      bot_candidate_count: botCandidates.length,
      target_success_rate: MATCHMAKING_CONFIG.targetSuccessRate,
    },
    buildings,
    resources,
    attacker_resources: attackerResources,
    attack_cost_gold: attackCostGold,
    battle_session_id: sessionId,
    battle_session_expires_at: reservedUntil,
    // Canonical island grid — the Godot client reads this from its own
    // scene, but a headless agent can't. Ship it so the agent can build a
    // valid `battle_start` action without guessing coordinates.
    grid_config: CANONICAL_GRID_CONFIG,
    grid_configs: CANONICAL_GRID_CONFIGS,
    combat_grid_version: COMBAT_GRID_VERSION,
  };
  })();
}

function resolveNamedBattleTarget(playerId, rawTargetName) {
  const attacker = stmts.getPlayerById.get(playerId);
  if (!attacker) return { error: 'Player not found' };
  const targetName = String(rawTargetName || '').trim();
  if (!targetName) return { error: 'Target player name required' };

  let target = stmts.getPlayerByName.get(targetName) || stmts.getPlayerByNameCasefold.get(targetName);
  if (!target) {
    const escaped = targetName.replace(/[\\%_]/g, (m) => `\\${m}`);
    const matches = stmts.searchPlayersByName.all(`%${escaped}%`, targetName);
    if (matches.length === 1) {
      target = stmts.getPlayerById.get(matches[0].id);
    } else if (matches.length > 1) {
      return {
        error: `Multiple players match "${targetName}". Use the exact name.`,
        matches: matches.map(publicBattleTarget),
      };
    }
  }
  if (!target) return { error: `Player "${targetName}" not found.` };
  if (target.id === playerId) return { error: 'Cannot attack yourself.' };
  if (Number(target.is_bot || 0) === 1) return { error: `Player "${targetName}" not found.` };

  const shield = battleShieldInfo(target);
  if (shield) {
    return {
      error: `${target.name} is under shield for about ${shield.remaining_hours}h.`,
      target: publicBattleTarget(target),
      shield,
    };
  }

  const attackCooldown = battleAttackCooldownInfo(target, playerId);
  if (attackCooldown) {
    return {
      error: `You already attacked ${target.name} recently. Try another target for about ${attackCooldown.remaining_minutes}m.`,
      target: publicBattleTarget(target),
      cooldown: attackCooldown,
    };
  }

  const activeReservation = stmts.getActiveBattleReservationForDefender.get(target.id);
  if (activeReservation && activeReservation.attacker_id !== playerId) {
    return {
      error: `${target.name} is already reserved for another active battle. Try again in a few minutes.`,
      target: publicBattleTarget(target),
      reserved_until: activeReservation.reserved_until,
    };
  }

  const hasTownHall = stmts.getBuildings.all(target.id).some((b) => b.type === 'town_hall');
  if (!hasTownHall) {
    return {
      error: `${target.name} does not have an attackable base yet.`,
      target: publicBattleTarget(target),
    };
  }

  const tournamentAttackCtx = getTournamentAttackMatchContext(playerId);
  const tournamentAttackRestriction = tournamentAttackRestrictionForTarget(tournamentAttackCtx, target.id);
  if (!tournamentAttackRestriction.allowed) {
    return {
      error: tournamentAttackPolicyError(tournamentAttackCtx, tournamentAttackRestriction, target.name),
      target: publicBattleTarget(target),
      tournament_attack_policy: tournamentAttackCtx,
      restriction: tournamentAttackRestriction.reason,
    };
  }

  const recentDefeat = stmts.getRecentDefeatAgainstDefender.get(playerId, target.id);
  if (recentDefeat) {
    return {
      error: `You recently lost to ${target.name}. Try another target for now.`,
      target: publicBattleTarget(target),
      cooldown: { reason: 'recent_defeat_24h', since: recentDefeat.created_at },
    };
  }

  const recentSurrender = stmts.getRecentSurrenderAgainstDefender.get(playerId, target.id);
  if (recentSurrender) {
    return {
      error: `You recently surrendered against ${target.name}. Try another target for now.`,
      target: publicBattleTarget(target),
      cooldown: { reason: 'recent_surrender_24h', since: recentSurrender.surrendered_at },
    };
  }

  return { attacker, target, requested_name: targetName };
}

function inspectEnemyByName(playerId, rawTargetName) {
  return db.transaction(() => {
    stmts.expireBattleSessions.run();
    const resolved = resolveNamedBattleTarget(playerId, rawTargetName);
    if (resolved.error) return resolved;
    const normalAttackCostGold = getAttackCost(playerId);
    const targetedAttackCostGold = getTargetedAttackCost(playerId);
    return {
      targeted: true,
      requested_name: resolved.requested_name,
      target: publicBattleTarget(resolved.target),
      normal_attack_cost_gold: normalAttackCostGold,
      targeted_attack_multiplier: TARGETED_ATTACK_COST_MULTIPLIER,
      attack_cost_gold: targetedAttackCostGold,
      resources: getResources(playerId),
    };
  })();
}

function findEnemyByName(playerId, rawTargetName) {
  return db.transaction(() => {
    stmts.expireBattleSessions.run();
    const resolved = resolveNamedBattleTarget(playerId, rawTargetName);
    if (resolved.error) return resolved;
    const target = resolved.target;

    stmts.cancelBattleSessionsForAttacker.run(playerId);

    // Same reservation/charge shape as random matchmaking, but against a
    // resolved player selected by name.
    repairAllBuildings(target.id);
    const buildings = getPlayerBuildings(target.id);
    const resources = getResources(target.id);
    const sessionId = uuidv4();
    const reservedUntil = sqliteDateFromMs(Date.now() + BATTLE_RESERVATION_MINUTES * 60_000);
    const normalAttackCostGold = getAttackCost(playerId);
    const attackCostGold = getTargetedAttackCost(playerId);
    if (!canAfford(playerId, attackCostGold, 0, 0)) {
      return {
        error: `Not enough gold to attack. Need ${attackCostGold} gold.`,
        status: 400,
        normal_attack_cost_gold: normalAttackCostGold,
        targeted_attack_multiplier: TARGETED_ATTACK_COST_MULTIPLIER,
        attack_cost_gold: attackCostGold,
        resources: getResources(playerId),
      };
    }
    const attackerResources = subtractResources(playerId, attackCostGold, 0, 0, {
      sourceType: 'attack_cost',
      metadata: { match_type: 'named', defender_id: target.id, battle_session_id: sessionId },
    });
    if (attackerResources?.error) {
      return {
        error: 'Not enough gold to attack',
        status: 400,
        normal_attack_cost_gold: normalAttackCostGold,
        targeted_attack_multiplier: TARGETED_ATTACK_COST_MULTIPLIER,
        attack_cost_gold: attackCostGold,
        resources: getResources(playerId),
      };
    }
    stmts.createBattleSession.run(sessionId, playerId, target.id, reservedUntil);
    return {
      targeted: true,
      requested_name: resolved.requested_name,
      id: target.id,
      name: target.name,
      trophies: target.trophies,
      level: target.level,
      buildings,
      resources,
      attacker_resources: attackerResources,
      normal_attack_cost_gold: normalAttackCostGold,
      targeted_attack_multiplier: TARGETED_ATTACK_COST_MULTIPLIER,
      attack_cost_gold: attackCostGold,
      battle_session_id: sessionId,
      battle_session_expires_at: reservedUntil,
      grid_config: CANONICAL_GRID_CONFIG,
      grid_configs: CANONICAL_GRID_CONFIGS,
      combat_grid_version: COMBAT_GRID_VERSION,
    };
  })();
}

function revengeTargetPayload(row) {
  if (!row) return null;
  const shield = battleShieldInfo({ shield_until: row.attacker_shield_until });
  const used = !!row.revenge_use_id;
  const canRevenge = !shield && !used;
  return {
    battle_id: Number(row.battle_id),
    player_id: row.attacker_id,
    name: row.attacker_name || 'Unknown',
    trophies: Number(row.attacker_trophies || 0),
    level: Number(row.attacker_level || 1),
    attacked_at: row.created_at,
    result: row.claimed_result,
    loot: {
      gold: Number(row.loot_gold || 0),
      wood: Number(row.loot_wood || 0),
      ore: Number(row.loot_ore || 0),
    },
    buildings_destroyed: Number(row.sim_buildings_destroyed || 0),
    duration_sec: Number(row.duration_sec || 0),
    shield_active: !!shield,
    shield_until: shield?.shield_until || null,
    shield_remaining_minutes: shield?.remaining_minutes || 0,
    revenge_used: used,
    revenge_used_at: row.revenge_used_at || null,
    can_revenge: canRevenge,
    reason: canRevenge ? null : (used ? 'revenge_used' : 'shield_active'),
  };
}

function listRevengeTargets(playerId) {
  const player = stmts.getPlayerById.get(playerId);
  if (!player) return { error: 'Player not found' };
  return {
    targets: stmts.listRevengeTargets.all(playerId, playerId).map(revengeTargetPayload),
  };
}

function startRevengeBattle(playerId, sourceBattleId) {
  const player = stmts.getPlayerById.get(playerId);
  if (!player) return { error: 'Player not found' };
  const battleId = Number(sourceBattleId);
  if (!Number.isInteger(battleId) || battleId <= 0) return { error: 'source battle id required', status: 400 };

  return db.transaction(() => {
    stmts.expireBattleSessions.run();
    const recent = stmts.listRevengeTargets
      .all(playerId, playerId)
      .find((row) => Number(row.battle_id) === battleId);
    if (!recent) {
      return { error: 'Revenge is only available against your last 3 attackers.', status: 403 };
    }
    if (recent.revenge_use_id) {
      return { error: 'Revenge already used for this attack.', status: 409, reason: 'revenge_used' };
    }

    const source = stmts.getRevengeSourceBattle.get(battleId, playerId);
    if (!source) return { error: 'Revenge source battle not found.', status: 404 };
    const target = stmts.getPlayerById.get(source.attacker_id);
    if (!target || Number(target.is_bot || 0) === 1) return { error: 'Revenge target is no longer available.', status: 404 };
    if (target.id === playerId) return { error: 'Cannot attack yourself.', status: 400 };

    const shield = battleShieldInfo(target);
    if (shield) {
      return {
        error: `${target.name} is protected by shield for about ${shield.remaining_hours}h.`,
        status: 409,
        reason: 'shield_active',
        shield,
        target: publicBattleTarget(target),
      };
    }

    const activeReservation = stmts.getActiveBattleReservationForDefender.get(target.id);
    if (activeReservation && activeReservation.attacker_id !== playerId) {
      return {
        error: `${target.name} is already reserved for another active battle. Try again in a few minutes.`,
        status: 409,
        reason: 'target_reserved',
        reserved_until: activeReservation.reserved_until,
        target: publicBattleTarget(target),
      };
    }

    const hasTownHall = stmts.getBuildings.all(target.id).some((b) => b.type === 'town_hall');
    if (!hasTownHall) {
      return { error: `${target.name} does not have an attackable base yet.`, status: 400, target: publicBattleTarget(target) };
    }

    const alreadyUsed = stmts.getRevengeUse.get(playerId, battleId);
    if (alreadyUsed) {
      return { error: 'Revenge already used for this attack.', status: 409, reason: 'revenge_used' };
    }

    const attackCostGold = getAttackCost(playerId);
    if (!canAfford(playerId, attackCostGold, 0, 0)) {
      return {
        error: `Not enough gold to revenge. Need ${attackCostGold} gold.`,
        status: 400,
        attack_cost_gold: attackCostGold,
        resources: getResources(playerId),
      };
    }

    stmts.cancelBattleSessionsForAttacker.run(playerId);
    repairAllBuildings(target.id);
    const buildings = getPlayerBuildings(target.id);
    const resources = getResources(target.id);
    const sessionId = uuidv4();
    const reservedUntil = sqliteDateFromMs(Date.now() + BATTLE_RESERVATION_MINUTES * 60_000);
    const attackerResources = subtractResources(playerId, attackCostGold, 0, 0, {
      sourceType: 'attack_cost',
      metadata: {
        match_type: 'revenge',
        defender_id: target.id,
        source_battle_id: battleId,
        battle_session_id: sessionId,
      },
    });
    if (attackerResources?.error) {
      return {
        error: 'Not enough gold to revenge',
        status: 400,
        attack_cost_gold: attackCostGold,
        resources: getResources(playerId),
      };
    }
    stmts.createBattleSession.run(sessionId, playerId, target.id, reservedUntil);
    stmts.insertRevengeUse.run(playerId, target.id, battleId, sessionId);

    return {
      revenge: true,
      source_battle_id: battleId,
      id: target.id,
      name: target.name,
      trophies: target.trophies,
      level: target.level,
      buildings,
      resources,
      attacker_resources: attackerResources,
      attack_cost_gold: attackCostGold,
      battle_session_id: sessionId,
      battle_session_expires_at: reservedUntil,
      grid_config: CANONICAL_GRID_CONFIG,
      grid_configs: CANONICAL_GRID_CONFIGS,
      combat_grid_version: COMBAT_GRID_VERSION,
    };
  })();
}

// Stamps the matchmaker cooldown for a surrender and applies the normal
// battle-loss trophy penalty once. Retry calls for the same session/pair do
// not subtract trophies again because surrendered_at is already populated.
const _markSurrenderTxn = db.transaction((attackerId, defenderId, sessionId = '') => {
  if (!attackerId || !defenderId) return { ok: false, error: 'missing_player' };
  const sid = normalizeBattleSessionId(sessionId);
  let session = sid ? stmts.getSurrenderSessionById.get(sid, attackerId, defenderId) : null;
  let synthetic = false;
  if (!session) {
    session = stmts.getLatestSurrenderSessionForPair.get(attackerId, defenderId);
  }
  if (!session) {
    const syntheticId = uuidv4();
    stmts.insertSurrenderMarker.run(syntheticId, attackerId, defenderId);
    session = { id: syntheticId, attacker_id: attackerId, defender_id: defenderId, surrendered_at: null };
    synthetic = true;
  }
  if (session.surrendered_at && !synthetic) {
    return {
      ok: true,
      stamped: true,
      already_surrendered: true,
      trophy_delta: 0,
      trophies: stmts.getPlayerById.get(attackerId)?.trophies || 0,
      battle_session_id: session.id,
    };
  }
  const r = synthetic
    ? { changes: 1 }
    : (sid && session.id === sid
      ? stmts.markSurrenderById.run(session.id, attackerId, defenderId)
      : stmts.markSurrenderByPair.run(session.id, attackerId, defenderId));
  if (r.changes <= 0) {
    return {
      ok: true,
      stamped: true,
      already_surrendered: true,
      trophy_delta: 0,
      trophies: stmts.getPlayerById.get(attackerId)?.trophies || 0,
      battle_session_id: session.id,
    };
  }
  try { stmts.markRaidMatchmakingSurrender.run(session.id, attackerId); } catch {}
  applyTrophyDelta(attackerId, -TROPHY_LOSS, { source: 'surrender', eventId: session.id });
  return {
    ok: true,
    stamped: true,
    already_surrendered: false,
    trophy_delta: -TROPHY_LOSS,
    trophies: stmts.getPlayerById.get(attackerId)?.trophies || 0,
    battle_session_id: session.id,
  };
});

function markSurrender(attackerId, defenderId, sessionId = '') {
  try {
    return _markSurrenderTxn(attackerId, defenderId, sessionId);
  } catch (e) {
    console.warn('[surrender]', e.message);
    return { ok: false, stamped: false, error: e.message };
  }
}

function validateBattleSession(sessionId, attackerId, defenderId) {
  const normalized = normalizeBattleSessionId(sessionId);
  if (!normalized) return { ok: true, legacy: true };

  stmts.expireBattleSessions.run();
  const session = stmts.getBattleSession.get(normalized);
  if (!session) return { ok: false, error: 'Battle session expired. Find an enemy again.' };
  if (session.attacker_id !== attackerId || session.defender_id !== defenderId) {
    return { ok: false, error: 'Battle session does not match this attack. Find an enemy again.' };
  }
  if (session.status === 'expired') {
    return { ok: false, error: 'Battle session expired. Find an enemy again.' };
  }
  if (session.status !== 'active') {
    return { ok: false, error: 'Battle session is no longer active. Find an enemy again.' };
  }
  const expiresAt = new Date(session.reserved_until + 'Z');
  if (expiresAt <= new Date()) {
    stmts.finishBattleSessionById.run('expired', normalized, attackerId, defenderId);
    return { ok: false, error: 'Battle session expired. Find an enemy again.' };
  }
  return { ok: true, session };
}

function finishBattleSession(sessionId, attackerId, defenderId, status = 'completed') {
  const finalStatus = ['completed', 'expired', 'cancelled'].includes(status) ? status : 'completed';
  const normalized = normalizeBattleSessionId(sessionId);
  if (normalized) {
    return stmts.finishBattleSessionById.run(finalStatus, normalized, attackerId, defenderId);
  }
  return stmts.finishBattleSessionsForPair.run(finalStatus, attackerId, defenderId);
}

function recalculateTrophies(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  let total = 0;
  for (const b of buildings) {
    const table = TROPHY_TABLE[b.type];
    if (table && b.level >= 1 && b.level <= table.length) {
      total += table[b.level - 1];
    }
  }
  // Add troop level trophies (5 per troop level above 1)
  const troops = stmts.getTroopLevels.all(playerId);
  for (const t of troops) {
    if (t.level > 1) {
      total += (t.level - 1) * 5;
    }
  }
  stmts.updateTrophies.run(total, playerId);
  return { trophies: total };
}

function getTrophies(playerId) {
  const row = stmts.getTrophies.get(playerId);
  return row ? row.trophies : 0;
}

function getFullPlayerState(playerId) {
  const player = stmts.getPlayerById.get(playerId);
  if (!player) return null;
  // Auto-repair buildings on login (like Clash of Clans)
  repairAllBuildings(playerId);
  const { token, ...safe } = player;
  const wallets = db.prepare(`
    SELECT chain_type, address, label, is_primary, updated_at
    FROM player_wallets
    WHERE player_id = ?
    ORDER BY is_primary DESC, updated_at DESC
  `).all(playerId);
  const dexAccounts = db.prepare(`
    SELECT dex, chain_type, wallet_address, account_id, status, metadata_json, updated_at
    FROM player_dex_accounts
    WHERE player_id = ?
    ORDER BY updated_at DESC
  `).all(playerId).map((row) => ({
    ...row,
    metadata: (() => {
      try { return JSON.parse(row.metadata_json || '{}'); } catch { return {}; }
    })(),
    metadata_json: undefined,
  }));
  const townHallFlag = getTownHallFlag(playerId);
  return {
    ...safe,
    wallets,
    dex_accounts: dexAccounts,
    buildings: getPlayerBuildings(playerId),
    ship: getPlayerShip(playerId),
    town_hall_flag: townHallFlag ? {
      image_url: townHallFlag.image_url,
      updated_at: townHallFlag.updated_at,
      purchase_id: townHallFlag.purchase_id || null,
      tx_hash: townHallFlag.tx_hash || null,
    } : null,
    troop_levels: getTroopLevels(playerId),
    altar_skills: getAltarSkillLevels(playerId),
    resource_caps: getResourceCaps(playerId),
    shop_entitlements: getShopEntitlements(playerId),
    building_unlocks: getBuildingUnlocks(playerId),
    referral: getReferralSummary(playerId),
  };
}

function repairAllBuildings(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  for (const b of buildings) {
    if (b.hp < b.max_hp) {
      stmts.repairBuilding.run(b.id, playerId);
    }
  }
}

const SHIP_COST_GOLD = 250;

const PLAYER_SHIP_LEVELS = Object.freeze({
  1: Object.freeze({ capacity: 3, town_hall: 1, cost: Object.freeze({ gold: 0, wood: 0, ore: 0 }) }),
  2: Object.freeze({ capacity: 12, town_hall: 2, cost: Object.freeze({ gold: 1000, wood: 2000, ore: 1700 }) }),
  3: Object.freeze({ capacity: 27, town_hall: 3, cost: Object.freeze({ gold: 1800, wood: 3600, ore: 3100 }) }),
  4: Object.freeze({ capacity: 36, town_hall: 4, cost: Object.freeze({ gold: 2400, wood: 4800, ore: 4100 }) }),
  5: Object.freeze({ capacity: 45, town_hall: 5, cost: Object.freeze({ gold: 3250, wood: 6400, ore: 5500 }) }),
});

function safeShipTroopArray(raw) {
  if (Array.isArray(raw)) return raw.filter((entry) => typeof entry === 'string');
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function playerShipCapacity(level, capacityOverride = 0) {
  const normalizedLevel = Math.max(1, Math.min(5, Number(level) || 1));
  return Math.max(
    Number(PLAYER_SHIP_LEVELS[normalizedLevel]?.capacity || 3),
    Math.max(0, Number(capacityOverride) || 0),
  );
}

function playerShipLevelForCapacity(capacity) {
  const requested = Math.max(3, Number(capacity) || 3);
  for (const level of [1, 2, 3, 4, 5]) {
    if (PLAYER_SHIP_LEVELS[level].capacity >= requested) return level;
  }
  return 5;
}

function serializePlayerShip(row) {
  if (!row) return null;
  const level = Math.max(1, Math.min(5, Number(row.level) || 1));
  return {
    id: 'main_ship',
    level,
    capacity: playerShipCapacity(level, row.capacity_override),
    troops: safeShipTroopArray(row.troops),
    troop_template: safeShipTroopArray(row.troop_template),
    migrated_from_ports_at: row.migrated_from_ports_at || null,
    updated_at: row.updated_at || null,
  };
}

// Existing fleets are folded into one authoritative ship on first access. The
// legacy port rows remain untouched so migration can be audited or rolled back.
function ensurePlayerShip(playerId) {
  if (!playerId) return null;
  const existing = db.prepare('SELECT * FROM player_ships WHERE player_id = ?').get(playerId);
  if (existing) return serializePlayerShip(existing);

  const ports = db.prepare(`
    SELECT id, level, has_ship, ship_troops, ship_troops_template
    FROM buildings
    WHERE player_id = ? AND type = 'port' AND has_ship = 1
    ORDER BY id ASC
  `).all(playerId);
  const troops = [];
  const troopTemplate = [];
  let legacyCapacity = 0;
  const sourcePorts = [];
  for (const port of ports) {
    const portLevel = Math.max(1, Math.min(3, Number(port.level) || 1));
    legacyCapacity += portLevel * 3;
    const current = safeShipTroopArray(port.ship_troops);
    const template = safeShipTroopArray(port.ship_troops_template);
    troops.push(...current);
    troopTemplate.push(...template);
    sourcePorts.push({ id: port.id, level: portLevel, current_slots: current.length, template_slots: template.length });
  }
  const requiredCapacity = Math.max(3, legacyCapacity, troops.length, troopTemplate.length);
  const level = playerShipLevelForCapacity(requiredCapacity);
  const levelCapacity = PLAYER_SHIP_LEVELS[level].capacity;
  // capacity_override is an absolute preserved capacity, not a delta. Legacy
  // accounts can exceed the new level-5 cap because older builds allowed more
  // than five ports; keep every paid slot instead of truncating that fleet.
  const capacityOverride = requiredCapacity > levelCapacity ? requiredCapacity : 0;
  const migration = {
    version: 1,
    source: ports.length > 0 ? 'legacy_ports' : 'new_player',
    legacy_capacity: legacyCapacity,
    source_ports: sourcePorts,
  };
  db.prepare(`
    INSERT INTO player_ships
      (player_id, level, troops, troop_template, capacity_override, migration_json, migrated_from_ports_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    playerId,
    level,
    JSON.stringify(troops),
    JSON.stringify(troopTemplate.length > 0 ? troopTemplate : troops),
    capacityOverride,
    JSON.stringify(migration),
    ports.length > 0 ? new Date().toISOString() : null,
  );
  return serializePlayerShip(db.prepare('SELECT * FROM player_ships WHERE player_id = ?').get(playerId));
}

function getPlayerShip(playerId) {
  return ensurePlayerShip(playerId);
}

function updatePlayerShipTroops(playerId, troops, troopTemplate = undefined) {
  ensurePlayerShip(playerId);
  const current = db.prepare('SELECT * FROM player_ships WHERE player_id = ?').get(playerId);
  if (!current) return null;
  const normalizedTroops = safeShipTroopArray(troops);
  const normalizedTemplate = troopTemplate === undefined
    ? safeShipTroopArray(current.troop_template)
    : safeShipTroopArray(troopTemplate);
  const capacity = playerShipCapacity(current.level, current.capacity_override);
  if (normalizedTroops.length > capacity || normalizedTemplate.length > capacity) {
    return { error: 'Ship capacity exceeded', capacity };
  }
  db.prepare(`
    UPDATE player_ships
    SET troops = ?, troop_template = ?, updated_at = datetime('now')
    WHERE player_id = ?
  `).run(JSON.stringify(normalizedTroops), JSON.stringify(normalizedTemplate), playerId);
  return getPlayerShip(playerId);
}

function upgradePlayerShip(playerId) {
  const ship = getPlayerShip(playerId);
  if (!ship) return { error: 'Player ship not found' };
  if (ship.level >= 5) return { error: 'Ship is already at max level' };
  const nextLevel = ship.level + 1;
  const config = PLAYER_SHIP_LEVELS[nextLevel];
  const townHallLevel = getTownHallLevel(playerId);
  if (townHallLevel < config.town_hall) {
    return { error: `Upgrade Town Hall to level ${config.town_hall} first` };
  }
  const cost = config.cost;
  if (!canAfford(playerId, cost.gold, cost.wood, cost.ore)) {
    return { error: 'Not enough resources', cost };
  }
  subtractResources(playerId, cost.gold, cost.wood, cost.ore, {
    sourceType: 'main_ship_upgrade',
    metadata: { from_level: ship.level, to_level: nextLevel },
  });
  db.prepare(`
    UPDATE player_ships
    SET level = ?, capacity_override = 0, updated_at = datetime('now')
    WHERE player_id = ?
  `).run(nextLevel, playerId);
  return { success: true, ship: getPlayerShip(playerId), cost, resources: getResources(playerId) };
}

function buyShip(playerId, buildingId) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };
  if (building.type !== 'port') return { error: 'Can only buy ships at ports' };
  if (building.has_ship) return { error: 'Port already has a ship' };
  if (!canAfford(playerId, SHIP_COST_GOLD, 0, 0)) {
    return { error: 'Not enough gold', cost: { gold: SHIP_COST_GOLD } };
  }
  subtractResources(playerId, SHIP_COST_GOLD, 0, 0, {
    sourceType: 'ship_purchase',
    metadata: { cost_gold: SHIP_COST_GOLD },
  });
  stmts.setShipOnPort.run(buildingId, playerId);
  return { success: true, resources: getResources(playerId) };
}

const LOOT_PERCENT = 0.15;

const RAID_ATTACK_COST_GOLD = 300;
const TARGETED_ATTACK_COST_MULTIPLIER = 1;

function attackCostForTownHallLevel(thLevel) {
  return RAID_ATTACK_COST_GOLD;
}

function getAttackCost(playerId) {
  return attackCostForTownHallLevel(getTownHallLevel(playerId));
}

function getTargetedAttackCost(playerId) {
  return getAttackCost(playerId) * TARGETED_ATTACK_COST_MULTIPLIER;
}


const SHIELD_HOURS = 6; // 6-hour shield after being raided
const ATTACK_COOLDOWN_HOURS = 1; // can't attack same player for 1 hour

function getPostRaidShieldHours(defenderId) {
  if (isBotPlayer(defenderId)) return 0;
  const t = getPlayerActiveTournament(defenderId);
  if (!t || t.shield_hours === null || t.shield_hours === undefined || t.shield_hours === '') {
    return SHIELD_HOURS;
  }
  const n = Number(t.shield_hours);
  if (!Number.isFinite(n)) return SHIELD_HOURS;
  return Math.max(0, n);
}

function battleDefeat(attackerId, defenderId, battleSessionId = '') {
  const defenderIsBot = isBotPlayer(defenderId);
  // Trophy deltas route through applyTrophyDelta so per-player tournament
  // freeze is honoured: a tournament-joined player's main `players.trophies`
  // stays put, and the delta is funneled (with optional positive-only
  // boost) into `tournament_participants.trophies` instead.
  applyTrophyDelta(attackerId, -TROPHY_LOSS, { source: 'attack_loss', eventId: battleSessionId });
  if (!defenderIsBot) applyTrophyDelta(defenderId,  TROPHY_WIN);
  finishBattleSession(battleSessionId, attackerId, defenderId, 'completed');
  // Return current main trophies for backwards-compat with callers that
  // displayed them in the response. For tournament-frozen players these
  // numbers are deliberately stale (matching "main is frozen during
  // tournament") — the panel reads tournament counters separately.
  return {
    attackerTrophies: stmts.getPlayerById.get(attackerId)?.trophies || 0,
    defenderTrophies: stmts.getPlayerById.get(defenderId)?.trophies || 0,
  };
}

const _battleVictoryTxn = db.transaction((attackerId, defenderId, battleSessionId = '') => {
  const sessionCheck = validateBattleSession(battleSessionId, attackerId, defenderId);
  if (!sessionCheck.ok) return { error: sessionCheck.error };

  // Check defender has no active shield
  const defender = stmts.getPlayerById.get(defenderId);
  if (!defender) return { error: 'Defender not found' };
  if (defender.shield_until) {
    const shieldEnd = new Date(defender.shield_until + 'Z');
    if (shieldEnd > new Date()) return { error: 'Defender is shielded' };
  }

  // Check cooldown — can't attack same player twice within cooldown
  if (battleAttackCooldownInfo(defender, attackerId)) return { error: 'Already attacked this player recently' };

  // Calculate loot — 30% of defender's resources (floored to whole numbers)
  const rewardProfile = getRaidRewardProfile(battleSessionId);
  const lootPercent = LOOT_PERCENT * rewardProfile.loot_multiplier;
  const lootGold = Math.floor((defender.gold || 0) * lootPercent);
  const lootWood = Math.floor((defender.wood || 0) * lootPercent);
  const lootOre = Math.floor((defender.ore || 0) * lootPercent);

  const boostedLoot = applyAltarProsperityResourceBonus(attackerId, {
    gold: lootGold,
    wood: lootWood,
    ore: lootOre,
  });

  // Transfer resources. The defender loses the base raid loot; Prosperity
  // creates the extra resources for the attacker.
  subtractResources(defenderId, lootGold, lootWood, lootOre, {
    sourceType: 'raid_loot_defender',
    metadata: {
      attacker_id: attackerId,
      battle_session_id: battleSessionId,
      target_is_bot: rewardProfile.is_bot,
      loot_multiplier: rewardProfile.loot_multiplier,
    },
  });
  addResources(attackerId, boostedLoot.gold, boostedLoot.wood, boostedLoot.ore, {
    sourceType: 'raid_loot_attacker',
    metadata: {
      defender_id: defenderId,
      battle_session_id: battleSessionId,
      target_is_bot: rewardProfile.is_bot,
      loot_multiplier: rewardProfile.loot_multiplier,
      base: boostedLoot.base,
      bonus: boostedLoot.bonus,
      prosperity_bonus_pct: boostedLoot.prosperity_bonus_pct,
    },
  });

  // Tournament admins can override post-raid shield length. Zero means
  // "no shield" while still stamping last_attacked_by/at for cooldowns.
  const shieldHours = getPostRaidShieldHours(defenderId);
  const shieldUntil = shieldHours > 0
    ? new Date(Date.now() + shieldHours * 3600000).toISOString().replace('T', ' ').slice(0, 19)
    : null;
  stmts.setShield.run(shieldUntil, attackerId, defenderId);

  // PvP trophies — attacker gains, defender loses. Routed through
  // applyTrophyDelta so a tournament-joined player has their main
  // trophies frozen and the delta credited (with boost on positive
  // delta) to their tournament_participants row instead.
  const trophyBonus = getAltarTrophyBonus(attackerId);
  const trophyBase = TROPHY_WIN;
  const attackerTrophyDelta = trophyBase + trophyBonus.bonus;
  applyTrophyDelta(attackerId, attackerTrophyDelta, { source: 'attack_win', eventId: battleSessionId });
  if (!rewardProfile.is_bot) {
    applyTrophyDelta(defenderId, -TROPHY_LOSS, { source: 'defense_loss', eventId: battleSessionId });
  }
  stmts.incrementBattleWins.run(attackerId);
  finishBattleSession(battleSessionId, attackerId, defenderId, 'completed');

  return {
    success: true,
    loot: { gold: boostedLoot.gold, wood: boostedLoot.wood, ore: boostedLoot.ore },
    loot_base: boostedLoot.base,
    altar_prosperity_bonus_pct: boostedLoot.prosperity_bonus_pct,
    altar_prosperity_bonus: boostedLoot.bonus,
    attacker_resources: getResources(attackerId),
    trophy_base: trophyBase,
    trophy_base_unmodified: TROPHY_WIN,
    trophy_target_multiplier: rewardProfile.trophy_multiplier,
    trophy_bonus: trophyBonus.bonus,
    trophy_bonus_level: trophyBonus.level,
    trophy_bonus_range: { min: trophyBonus.min, max: trophyBonus.max },
    trophy_delta: attackerTrophyDelta,
    target_is_bot: rewardProfile.is_bot,
    loot_multiplier: rewardProfile.loot_multiplier,
    // Re-read main trophies for response. For attacker frozen by a
    // tournament this stays at the pre-battle value (the tournament
    // counter took the increment); the futures/HUD UI reads tournament
    // standings via the dedicated /api/tournaments/:id/me endpoint.
    trophies: stmts.getPlayerById.get(attackerId)?.trophies || 0,
  };
});

function battleVictory(attackerId, defenderId, battleSessionId = '') {
  if (!attackerId || !defenderId) return { error: 'Missing player IDs' };
  if (attackerId === defenderId) return { error: 'Cannot attack yourself' };
  return _battleVictoryTxn(attackerId, defenderId, battleSessionId);
}

function replayDurationSec(replayData, simResult) {
  const actions = Array.isArray(replayData?.actions)
    ? replayData.actions
    : (Array.isArray(replayData) ? replayData : []);
  const battleEnd = actions
    .map(a => (a?.type === 'battle_end' ? Number(a?.t) : NaN))
    .filter(t => Number.isFinite(t) && t > 0);
  if (battleEnd.length) return Math.max(...battleEnd);

  const times = actions
    .filter(a => a?.type !== 'battle_start' && a?.type !== 'battle_end')
    .map(a => Number(a?.t))
    .filter(t => Number.isFinite(t) && t >= 0);
  if (times.length) {
    const actionDuration = Math.max(0, Math.max(...times) - Math.min(...times));
    if (actionDuration >= 1) return actionDuration;
  }

  const simDuration = Number(simResult?._simTimeSec ?? simResult?.simTimeSec);
  if (Number.isFinite(simDuration) && simDuration > 0) return simDuration;
  return 0;
}

function compactSimTrace(trace) {
  const importantKinds = new Set([
    'building_destroyed',
    'troop_death',
    'guard_death',
    'guard_melee_hit',
    'guard_target_acquired',
    'guard_target_lost',
    'defense_fire',
    'defense_projectile_hit',
    'troop_projectile_lost_target',
    'cannon_fire',
    'cannon_hit',
  ]);
  if (!Array.isArray(trace)) return [];
  return trace
    .filter((event) => importantKinds.has(event?.kind))
    .map((event) => ({
      kind: event.kind,
      t: event.t,
      id: event.buildingId ?? event.guardId ?? event.troopId ?? null,
      type: event.type ?? event.targetType ?? null,
      troop: event.troop ?? null,
      replayOrder: event.replayOrder ?? event.targetReplayOrder ?? event.sourceReplayOrder ?? null,
      targetId: event.targetId ?? event.target?.id ?? null,
      targetType: event.targetType ?? event.target?.type ?? null,
      hp: event.hp ?? event.hpAfter ?? event.target?.hp ?? null,
      damage: event.damage ?? null,
      reason: event.reason ?? null,
    }));
}

function replaySimDebug(simResult) {
  if (!simResult || typeof simResult !== 'object') return null;
  const debug = {
    resolvedResult: simResult.resolvedResult,
    reason: simResult.reason,
    townHallDestroyed: simResult.townHallDestroyed,
    townHallHpPct: simResult.townHallHpPct,
    buildingsDestroyed: simResult.buildingsDestroyed,
    simTimeSec: simResult._simTimeSec,
    troopsSpawned: simResult._troopsSpawned,
    troopsAlive: simResult._troopsAlive,
    guardsAlive: simResult._guardsAlive,
    casualties: simResult.casualties || {},
    cannonShotsAccepted: simResult._cannonShotsAccepted,
    cannonEventsIgnored: simResult._cannonEventsIgnored,
    rallyEventsAccepted: simResult._rallyEventsAccepted,
    rallyEventsIgnored: simResult._rallyEventsIgnored,
    traceEvents: simResult._traceEvents,
    traceDropped: simResult._traceDropped,
    buildingHPs: simResult._buildingHPs || [],
    troopEndState: simResult._troopEndState || [],
    aliveTroopDetails: simResult._aliveTroopDetails || [],
    aliveGuardDetails: simResult._aliveGuardDetails || [],
    traceImportant: compactSimTrace(simResult._trace || []),
    trace: simResult._trace || [],
  };
  const text = JSON.stringify(debug);
  const max = Number(process.env.CLASH_SIM_DEBUG_MAX_BYTES || 2_000_000);
  if (Number.isFinite(max) && max > 0 && text.length > max) {
    return JSON.stringify({
      ...debug,
      trace: [],
      truncated: true,
      originalBytes: text.length,
      maxBytes: max,
    });
  }
  return text;
}

function battleSessionIdFromReplayData(replayData) {
  const actions = Array.isArray(replayData?.actions)
    ? replayData.actions
    : (Array.isArray(replayData) ? replayData : []);
  const battleStart = actions.find((action) => action?.type === 'battle_start');
  return normalizeBattleSessionId(battleStart?.battle_session_id || replayData?.battle_session_id || '');
}

function resolvedRaidResult(claimedResult, verifiedResult, simResult) {
  const verified = String(verifiedResult || '').toLowerCase();
  if (verified && verified !== 'accepted' && verified !== 'victory') return verified;
  if (simResult?.resolvedResult) return String(simResult.resolvedResult).toLowerCase();
  if (simResult?.townHallDestroyed || (Number(simResult?.townHallHpPct) <= 0.02)) return 'victory';
  const claimed = String(claimedResult || '').toLowerCase();
  return claimed === 'victory' ? 'victory' : 'defeat';
}

function completeRaidMatchmakingFromReplay(replayData, claimedResult, verifiedResult, reason, loot, simResult, duration) {
  const sessionId = battleSessionIdFromReplayData(replayData);
  if (!sessionId) return;
  const actions = Array.isArray(replayData?.actions)
    ? replayData.actions
    : (Array.isArray(replayData) ? replayData : []);
  const shipActions = actions.filter((action) => ['place_ship', 'deploy_troop'].includes(action?.type));
  let result = resolvedRaidResult(claimedResult, verifiedResult, simResult);
  if (result === 'defeat' && (shipActions.length === 0 || Number(duration || 0) < 15)) {
    result = 'abandoned';
  }
  try {
    stmts.completeRaidMatchmaking.run(
      result,
      verifiedResult || null,
      Number.isFinite(Number(duration)) ? Number(duration) : null,
      simResult?.townHallHpPct ?? null,
      simResult?.buildingsDestroyed ?? 0,
      reason || simResult?.reason || null,
      loot?.gold || 0,
      loot?.wood || 0,
      loot?.ore || 0,
      sessionId
    );
  } catch (e) {
    console.warn('[matchmaking] failed to complete raid match:', e.message);
  }
}

function withAttackerFlagSnapshot(replayData, attackerId) {
  const attackerFlagUrl = String(getTownHallFlag(attackerId)?.image_url || '').trim();
  const decorateActions = (actions) => actions.map((action) => {
    if (!action || action.type !== 'battle_start') return action;
    return { ...action, attacker_flag_url: attackerFlagUrl };
  });
  if (Array.isArray(replayData)) return decorateActions(replayData);
  if (replayData && typeof replayData === 'object' && Array.isArray(replayData.actions)) {
    return { ...replayData, actions: decorateActions(replayData.actions) };
  }
  return replayData;
}

function storeReplay(attackerId, defenderId, replayData, buildingsSnapshot, claimedResult, verifiedResult, reason, loot, simResult) {
  const duration = replayDurationSec(replayData, simResult);
  const persistedReplayData = withAttackerFlagSnapshot(replayData, attackerId);
  const info = stmts.insertReplay.run(
    attackerId, defenderId, claimedResult, verifiedResult, reason || '',
    JSON.stringify(persistedReplayData), JSON.stringify(buildingsSnapshot),
    loot?.gold || 0, loot?.wood || 0, loot?.ore || 0,
    simResult?.townHallHpPct ?? null, simResult?.buildingsDestroyed ?? 0,
    replaySimDebug(simResult), duration
  );
  const replayId = Number(info?.lastInsertRowid || 0) || null;
  const sessionId = battleSessionIdFromReplayData(persistedReplayData);
  if (replayId && sessionId) {
    try { stmts.linkRevengeBattleBySession.run(replayId, attackerId, defenderId, sessionId); } catch {}
  }
  completeRaidMatchmakingFromReplay(persistedReplayData, claimedResult, verifiedResult, reason, loot, simResult, duration);
  return replayId;
}

function getPlayerMatchmakingStats(playerId) {
  const attackPower = computeAttackPower(playerId);
  const profile = matchmakingProfileForPlayer(playerId, attackPower);
  const recent = db.prepare(`
    SELECT battle_session_id, defender_id, target_is_bot, target_bot_difficulty,
           attacker_th, defender_th, attack_power, base_power, base_power_ratio,
           difficulty_bucket, recovery_level, selection_reason, result, created_at, completed_at
    FROM raid_matchmaking
    WHERE attacker_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(playerId);
  return {
    target_success_rate: MATCHMAKING_CONFIG.targetSuccessRate,
    target_band: MATCHMAKING_CONFIG.targetBand,
    attack_power: attackPower,
    profile,
    recent,
  };
}

const BATTLE_RISK_THRESHOLDS = Object.freeze({
  burstWindowMinutes: 15,
  burstAttackStarts: 40,
  dailyWindowHours: 24,
  dailyAttackStartsExclusive: 500,
  unsubmittedMinStarts: 80,
  unsubmittedMaxSubmitRate: 0.25,
  shortWinMinWins: 50,
  shortWinAvgDurationSec: 20,
  simMismatchAllowed: 10,
  rejectedResults: 10,
  sharedIpPlayers: 8,
  sharedIpMinStarts: 20,
  shipDeployWindowHours: 24,
  shipDeployBucketSize: 0.5,
  shipDeployMinSamples: 8,
  shipDeployMinRepeats: 6,
  shipDeployMinRatio: 0.75,
});

function battleRiskNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function battleRiskReplayActions(replayData) {
  let parsed = replayData;
  if (typeof replayData === 'string') {
    try { parsed = JSON.parse(replayData || '[]'); } catch { return []; }
  }
  if (Array.isArray(parsed?.actions)) return parsed.actions;
  if (Array.isArray(parsed)) return parsed;
  return [];
}

function battleRiskFiniteCoord(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function battleRiskCoordBucket(value) {
  const bucketSize = Math.max(0.01, Number(BATTLE_RISK_THRESHOLDS.shipDeployBucketSize) || 0.5);
  const rounded = Math.round(Number(value) / bucketSize) * bucketSize;
  const clean = Object.is(rounded, -0) ? 0 : rounded;
  return Number(clean.toFixed(2));
}

function battleRiskCoordText(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return Number(n.toFixed(2)).toString();
}

function battleRiskShipDeployPatternFromReplay(replayData) {
  const actions = battleRiskReplayActions(replayData);
  const coords = [];
  for (const action of actions) {
    if (!['place_ship', 'deploy_troop'].includes(action?.type)) continue;
    const troopSpawns = Array.isArray(action.troop_spawns) ? action.troop_spawns : [];
    const firstSpawn = troopSpawns[0] || {};
    const rawX = battleRiskFiniteCoord(action.troop_x, action.x, firstSpawn.x);
    const rawZ = battleRiskFiniteCoord(action.troop_z, action.z, firstSpawn.z);
    if (rawX === null || rawZ === null) continue;
    const x = battleRiskCoordBucket(rawX);
    const z = battleRiskCoordBucket(rawZ);
    coords.push({
      order: coords.length + 1,
      x,
      z,
      label: `${battleRiskCoordText(x)},${battleRiskCoordText(z)}`,
    });
  }
  if (!coords.length) return null;
  return {
    signature: coords.map((coord) => coord.label).join('|'),
    ship_count: coords.length,
    coords,
    coords_text: coords.map((coord) => coord.label).join(' -> '),
  };
}

function getBattleShipDeployPatternMetrics(options = {}) {
  const playerId = String(options.playerId || '').trim();
  const windowHours = Math.max(1, Math.min(168, Math.trunc(Number(options.windowHours) || BATTLE_RISK_THRESHOLDS.shipDeployWindowHours)));
  const limit = Math.max(100, Math.min(50000, Math.trunc(Number(options.limit) || (playerId ? 2000 : 50000))));
  const playerSql = playerId ? 'AND attacker_id = ?' : '';
  const params = [`-${windowHours} hours`];
  if (playerId) params.push(playerId);
  params.push(limit);

  const rows = db.prepare(`
    SELECT attacker_id, replay_data, created_at
    FROM battle_replays
    WHERE created_at > datetime('now', ?)
      AND (replay_data LIKE '%place_ship%' OR replay_data LIKE '%deploy_troop%')
      ${playerSql}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(...params);

  const byPlayer = new Map();
  for (const row of rows) {
    const pattern = battleRiskShipDeployPatternFromReplay(row.replay_data);
    if (!pattern?.signature) continue;
    let player = byPlayer.get(row.attacker_id);
    if (!player) {
      player = { samples: 0, signatures: new Map(), latest_at: null };
      byPlayer.set(row.attacker_id, player);
    }
    player.samples += 1;
    if (!player.latest_at || String(row.created_at || '') > player.latest_at) player.latest_at = row.created_at || null;
    const existing = player.signatures.get(pattern.signature) || {
      count: 0,
      ship_count: pattern.ship_count,
      coords_text: pattern.coords_text,
      signature: pattern.signature,
    };
    existing.count += 1;
    player.signatures.set(pattern.signature, existing);
  }

  const metrics = new Map();
  for (const [id, player] of byPlayer.entries()) {
    const top = [...player.signatures.values()].sort((a, b) => b.count - a.count || b.ship_count - a.ship_count)[0] || null;
    if (!top) continue;
    const ratio = player.samples > 0 ? top.count / player.samples : 0;
    metrics.set(id, {
      ship_deploy_samples_24h: player.samples,
      ship_deploy_distinct_patterns_24h: player.signatures.size,
      ship_deploy_top_repeats_24h: top.count,
      ship_deploy_top_ratio_24h: Number(ratio.toFixed(4)),
      ship_deploy_top_ship_count: top.ship_count,
      ship_deploy_top_signature: top.signature,
      ship_deploy_top_coords: top.coords_text,
      ship_deploy_latest_at: player.latest_at,
    });
  }
  return metrics;
}

function battleRiskFlagsForMetrics(row = {}) {
  const starts15m = battleRiskNumber(row.attack_starts_15m);
  const starts24h = battleRiskNumber(row.attack_starts_24h);
  const submitted24h = battleRiskNumber(row.submitted_results_24h);
  const acceptedWins24h = battleRiskNumber(row.accepted_wins_24h);
  const avgWinDuration = battleRiskNumber(row.avg_win_duration_sec, null);
  const simMismatchAllowed = battleRiskNumber(row.sim_mismatch_allowed_24h);
  const rejectedResults = battleRiskNumber(row.rejected_results_24h);
  const ipPlayers24h = battleRiskNumber(row.ip_players_24h);
  const shipDeploySamples = battleRiskNumber(row.ship_deploy_samples_24h);
  const shipDeployRepeats = battleRiskNumber(row.ship_deploy_top_repeats_24h);
  const shipDeployRatio = battleRiskNumber(row.ship_deploy_top_ratio_24h);
  const submitRate = starts24h > 0 ? submitted24h / starts24h : null;
  const flags = [];

  if (starts15m >= BATTLE_RISK_THRESHOLDS.burstAttackStarts) {
    flags.push({
      code: 'battle_burst_15m',
      label: `${starts15m} attack starts in ${BATTLE_RISK_THRESHOLDS.burstWindowMinutes}m`,
      tone: 'red',
      severity: 'red',
      detail: 'Burst threshold reached for new attacks.',
    });
  }
  if (starts24h > BATTLE_RISK_THRESHOLDS.dailyAttackStartsExclusive) {
    flags.push({
      code: 'battle_daily_volume',
      label: `${starts24h} attack starts in 24h`,
      tone: 'red',
      severity: 'red',
      detail: 'Daily attack volume exceeds the owner-approved threshold.',
    });
  }
  if (
    starts24h >= BATTLE_RISK_THRESHOLDS.unsubmittedMinStarts
    && submitRate !== null
    && submitRate <= BATTLE_RISK_THRESHOLDS.unsubmittedMaxSubmitRate
  ) {
    flags.push({
      code: 'battle_low_submit_rate',
      label: `${Math.round(submitRate * 100)}% result submit rate`,
      tone: 'red',
      severity: 'red',
      detail: 'Many targets are reserved without completed battle results.',
    });
  }
  if (
    acceptedWins24h >= BATTLE_RISK_THRESHOLDS.shortWinMinWins
    && avgWinDuration !== null
    && avgWinDuration > 0
    && avgWinDuration < BATTLE_RISK_THRESHOLDS.shortWinAvgDurationSec
  ) {
    flags.push({
      code: 'battle_short_wins',
      label: `${acceptedWins24h} wins avg ${Math.round(avgWinDuration)}s`,
      tone: 'red',
      severity: 'red',
      detail: 'Large volume of very short accepted wins.',
    });
  }
  if (simMismatchAllowed >= BATTLE_RISK_THRESHOLDS.simMismatchAllowed) {
    flags.push({
      code: 'battle_sim_mismatch',
      label: `${simMismatchAllowed} sim mismatch allowances`,
      tone: 'red',
      severity: 'red',
      detail: 'Replay verifier allowed too many simulation mismatches in 24h.',
    });
  }
  if (rejectedResults >= BATTLE_RISK_THRESHOLDS.rejectedResults) {
    flags.push({
      code: 'battle_rejected_results',
      label: `${rejectedResults} rejected battle results`,
      tone: 'red',
      severity: 'red',
      detail: 'Replay verifier rejected many submitted battle results in 24h.',
    });
  }
  if (
    ipPlayers24h >= BATTLE_RISK_THRESHOLDS.sharedIpPlayers
    && starts24h >= BATTLE_RISK_THRESHOLDS.sharedIpMinStarts
  ) {
    flags.push({
      code: 'battle_shared_ip_cluster',
      label: `${ipPlayers24h} active players on latest IP`,
      tone: 'red',
      severity: 'red',
      detail: 'Latest client-log IP is shared by many active accounts.',
    });
  }
  if (
    shipDeploySamples >= BATTLE_RISK_THRESHOLDS.shipDeployMinSamples
    && shipDeployRepeats >= BATTLE_RISK_THRESHOLDS.shipDeployMinRepeats
    && shipDeployRatio >= BATTLE_RISK_THRESHOLDS.shipDeployMinRatio
  ) {
    flags.push({
      code: 'battle_repeated_ship_deploy',
      label: `${shipDeployRepeats}/${shipDeploySamples} same ship deployment`,
      tone: 'red',
      severity: 'red',
      detail: `Same rounded ship coordinate pattern repeated. Pattern: ${row.ship_deploy_top_coords || row.ship_deploy_top_signature || 'unknown'}`,
    });
  }

  return flags;
}

function battleRiskScore(flags, row = {}) {
  const flagScore = (flags || []).length * 1000;
  return flagScore
    + battleRiskNumber(row.attack_starts_24h)
    + battleRiskNumber(row.attack_starts_15m) * 5
    + battleRiskNumber(row.accepted_wins_24h) * 2
    + battleRiskNumber(row.rejected_results_24h) * 10
    + battleRiskNumber(row.sim_mismatch_allowed_24h) * 10
    + battleRiskNumber(row.ship_deploy_top_repeats_24h) * 20;
}

function normalizeBattleRiskRow(row, includeClean = false) {
  const flags = battleRiskFlagsForMetrics(row);
  const captchaRequired = flags.length > 0;
  if (!includeClean && !captchaRequired) return null;
  const starts24h = battleRiskNumber(row.attack_starts_24h);
  const submitted24h = battleRiskNumber(row.submitted_results_24h);
  const normalized = {
    player_id: row.player_id,
    name: row.name || null,
    wallet: row.wallet || null,
    dex: row.dex || null,
    trophies: battleRiskNumber(row.trophies),
    level: battleRiskNumber(row.level, 1),
    th_level: battleRiskNumber(row.th_level, 1),
    last_ip: row.last_ip || null,
    last_client_log_at: row.last_client_log_at || null,
    latest_attack_at: row.latest_attack_at || null,
    latest_result_at: row.latest_result_at || null,
    attack_starts_15m: battleRiskNumber(row.attack_starts_15m),
    attack_starts_24h: starts24h,
    completed_sessions_24h: battleRiskNumber(row.completed_sessions_24h),
    cancelled_sessions_24h: battleRiskNumber(row.cancelled_sessions_24h),
    active_sessions_now: battleRiskNumber(row.active_sessions_now),
    submitted_results_24h: submitted24h,
    claimed_wins_24h: battleRiskNumber(row.claimed_wins_24h),
    accepted_wins_24h: battleRiskNumber(row.accepted_wins_24h),
    rejected_results_24h: battleRiskNumber(row.rejected_results_24h),
    sim_mismatch_allowed_24h: battleRiskNumber(row.sim_mismatch_allowed_24h),
    avg_win_duration_sec: row.avg_win_duration_sec == null ? null : Number(row.avg_win_duration_sec),
    bot_matches_24h: battleRiskNumber(row.bot_matches_24h),
    bot_share_24h: row.bot_share_24h == null ? null : Number(row.bot_share_24h),
    distinct_defenders_24h: battleRiskNumber(row.distinct_defenders_24h),
    ip_players_24h: battleRiskNumber(row.ip_players_24h),
    ip_logs_24h: battleRiskNumber(row.ip_logs_24h),
    ship_deploy_samples_24h: battleRiskNumber(row.ship_deploy_samples_24h),
    ship_deploy_distinct_patterns_24h: battleRiskNumber(row.ship_deploy_distinct_patterns_24h),
    ship_deploy_top_repeats_24h: battleRiskNumber(row.ship_deploy_top_repeats_24h),
    ship_deploy_top_ratio_24h: row.ship_deploy_top_ratio_24h == null ? null : Number(row.ship_deploy_top_ratio_24h),
    ship_deploy_top_ship_count: battleRiskNumber(row.ship_deploy_top_ship_count),
    ship_deploy_top_signature: row.ship_deploy_top_signature || null,
    ship_deploy_top_coords: row.ship_deploy_top_coords || null,
    ship_deploy_latest_at: row.ship_deploy_latest_at || null,
    submit_rate_24h: starts24h > 0 ? Number((submitted24h / starts24h).toFixed(4)) : null,
    risk_flags: flags,
    captcha_required: captchaRequired,
  };
  normalized.risk_score = battleRiskScore(flags, normalized);
  return normalized;
}

function getBattleRiskPlayers(options = {}) {
  const limit = Math.max(1, Math.min(1000, Math.trunc(Number(options.limit) || 120)));
  const includeClean = !!options.includeClean;
  const playerId = String(options.playerId || '').trim();
  const playerFilterSql = playerId ? 'AND p.id = ?' : '';
  const params = playerId ? [playerId] : [];
  const rows = db.prepare(`
    WITH human_players AS (
      SELECT p.id, p.name, p.wallet, p.dex, p.trophies, p.level
      FROM players p
      WHERE COALESCE(p.is_bot, 0) = 0
      ${playerFilterSql}
    ),
    player_th AS (
      SELECT hp.id, COALESCE(MAX(CASE WHEN b.type = 'town_hall' THEN b.level END), 1) AS th_level
      FROM human_players hp
      LEFT JOIN buildings b ON b.player_id = hp.id
      GROUP BY hp.id
    ),
    sessions AS (
      SELECT attacker_id,
             COUNT(*) AS attack_starts_24h,
             SUM(CASE WHEN created_at > datetime('now', '-15 minutes') THEN 1 ELSE 0 END) AS attack_starts_15m,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions_24h,
             SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_sessions_24h,
             SUM(CASE WHEN status = 'active' AND reserved_until > datetime('now') THEN 1 ELSE 0 END) AS active_sessions_now,
             MAX(created_at) AS latest_attack_at
      FROM battle_sessions
      WHERE created_at > datetime('now', '-24 hours')
      GROUP BY attacker_id
    ),
    replays AS (
      SELECT attacker_id,
             COUNT(*) AS submitted_results_24h,
             SUM(CASE WHEN lower(COALESCE(claimed_result, '')) = 'victory' THEN 1 ELSE 0 END) AS claimed_wins_24h,
             SUM(CASE WHEN lower(COALESCE(claimed_result, '')) = 'victory'
                       AND lower(COALESCE(verified_result, '')) IN ('accepted', 'victory') THEN 1 ELSE 0 END) AS accepted_wins_24h,
             SUM(CASE WHEN lower(COALESCE(verified_result, '')) = 'rejected' THEN 1 ELSE 0 END) AS rejected_results_24h,
             SUM(CASE WHEN COALESCE(verification_reason, '') LIKE 'SIM_MISMATCH_ALLOWED:%' THEN 1 ELSE 0 END) AS sim_mismatch_allowed_24h,
             AVG(CASE WHEN lower(COALESCE(claimed_result, '')) = 'victory'
                       AND lower(COALESCE(verified_result, '')) IN ('accepted', 'victory')
                      THEN duration_sec ELSE NULL END) AS avg_win_duration_sec,
             MAX(created_at) AS latest_result_at
      FROM battle_replays
      WHERE created_at > datetime('now', '-24 hours')
      GROUP BY attacker_id
    ),
    mm AS (
      SELECT attacker_id,
             COUNT(*) AS matchmaking_rows_24h,
             SUM(CASE WHEN target_is_bot = 1 THEN 1 ELSE 0 END) AS bot_matches_24h,
             AVG(CASE WHEN target_is_bot = 1 THEN 1.0 ELSE 0.0 END) AS bot_share_24h,
             COUNT(DISTINCT defender_id) AS distinct_defenders_24h
      FROM raid_matchmaking
      WHERE created_at > datetime('now', '-24 hours')
      GROUP BY attacker_id
    ),
    latest_ip AS (
      SELECT cl.player_id, cl.ip AS last_ip, cl.created_at AS last_client_log_at
      FROM client_logs cl
      JOIN (
        SELECT player_id, MAX(id) AS id
        FROM client_logs
        WHERE player_id IS NOT NULL
          AND COALESCE(ip, '') != ''
          AND created_at > datetime('now', '-7 days')
        GROUP BY player_id
      ) latest ON latest.id = cl.id
    ),
    ip_rollup AS (
      SELECT ip,
             COUNT(DISTINCT player_id) AS ip_players_24h,
             COUNT(*) AS ip_logs_24h
      FROM client_logs
      WHERE player_id IS NOT NULL
        AND COALESCE(ip, '') != ''
        AND created_at > datetime('now', '-24 hours')
      GROUP BY ip
    )
    SELECT hp.id AS player_id,
           hp.name, hp.wallet, hp.dex, hp.trophies, hp.level,
           COALESCE(pt.th_level, 1) AS th_level,
           COALESCE(s.attack_starts_24h, 0) AS attack_starts_24h,
           COALESCE(s.attack_starts_15m, 0) AS attack_starts_15m,
           COALESCE(s.completed_sessions_24h, 0) AS completed_sessions_24h,
           COALESCE(s.cancelled_sessions_24h, 0) AS cancelled_sessions_24h,
           COALESCE(s.active_sessions_now, 0) AS active_sessions_now,
           s.latest_attack_at,
           COALESCE(r.submitted_results_24h, 0) AS submitted_results_24h,
           COALESCE(r.claimed_wins_24h, 0) AS claimed_wins_24h,
           COALESCE(r.accepted_wins_24h, 0) AS accepted_wins_24h,
           COALESCE(r.rejected_results_24h, 0) AS rejected_results_24h,
           COALESCE(r.sim_mismatch_allowed_24h, 0) AS sim_mismatch_allowed_24h,
           r.avg_win_duration_sec,
           r.latest_result_at,
           COALESCE(mm.bot_matches_24h, 0) AS bot_matches_24h,
           mm.bot_share_24h,
           COALESCE(mm.distinct_defenders_24h, 0) AS distinct_defenders_24h,
           li.last_ip,
           li.last_client_log_at,
           COALESCE(ipr.ip_players_24h, 0) AS ip_players_24h,
           COALESCE(ipr.ip_logs_24h, 0) AS ip_logs_24h
    FROM human_players hp
    LEFT JOIN player_th pt ON pt.id = hp.id
    LEFT JOIN sessions s ON s.attacker_id = hp.id
    LEFT JOIN replays r ON r.attacker_id = hp.id
    LEFT JOIN mm ON mm.attacker_id = hp.id
    LEFT JOIN latest_ip li ON li.player_id = hp.id
    LEFT JOIN ip_rollup ipr ON ipr.ip = li.last_ip
    WHERE COALESCE(s.attack_starts_24h, 0) > 0
       OR COALESCE(r.submitted_results_24h, 0) > 0
       OR COALESCE(mm.matchmaking_rows_24h, 0) > 0
    ORDER BY COALESCE(s.attack_starts_24h, 0) DESC, COALESCE(r.accepted_wins_24h, 0) DESC
  `).all(...params);

  const shipDeployMetricsByPlayer = getBattleShipDeployPatternMetrics({ playerId });
  return rows
    .map((row) => normalizeBattleRiskRow({ ...row, ...(shipDeployMetricsByPlayer.get(row.player_id) || {}) }, includeClean))
    .filter(Boolean)
    .sort((a, b) => b.risk_score - a.risk_score || b.attack_starts_24h - a.attack_starts_24h)
    .slice(0, limit);
}

function getBattleRiskForPlayer(playerId) {
  const id = String(playerId || '').trim();
  if (!id) return null;
  const row = getBattleRiskPlayers({ playerId: id, includeClean: true, limit: 1 })[0];
  return row || {
    player_id: id,
    risk_flags: [],
    captcha_required: false,
    risk_score: 0,
    attack_starts_15m: 0,
    attack_starts_24h: 0,
  };
}

function getGlobalMatchmakingStats(days = 7) {
  const safeDays = Math.max(1, Math.min(90, Math.trunc(Number(days) || 7)));
  const params = [`-${safeDays} days`];
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS raids,
      SUM(CASE WHEN result IN ('victory', 'defeat') THEN 1 ELSE 0 END) AS decided_raids,
      SUM(CASE WHEN result = 'victory' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN result = 'defeat' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN result = 'surrender' THEN 1 ELSE 0 END) AS surrenders,
      SUM(CASE WHEN result = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
      SUM(CASE WHEN target_is_bot = 1 THEN 1 ELSE 0 END) AS bot_matches,
      SUM(CASE WHEN recovery_level > 0 THEN 1 ELSE 0 END) AS recovery_matches,
      AVG(base_power_ratio) AS avg_base_power_ratio,
      AVG(CASE WHEN result IN ('victory', 'defeat') THEN CASE WHEN result = 'victory' THEN 1.0 ELSE 0.0 END END) AS success_rate
    FROM raid_matchmaking
    WHERE created_at > datetime('now', ?)
  `).get(...params);
  const byTh = db.prepare(`
    SELECT attacker_th,
           COUNT(*) AS raids,
           SUM(CASE WHEN result IN ('victory', 'defeat') THEN 1 ELSE 0 END) AS decided_raids,
           SUM(CASE WHEN result = 'victory' THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN target_is_bot = 1 THEN 1 ELSE 0 END) AS bot_matches,
           SUM(CASE WHEN recovery_level > 0 THEN 1 ELSE 0 END) AS recovery_matches,
           AVG(base_power_ratio) AS avg_base_power_ratio,
           AVG(CASE WHEN result IN ('victory', 'defeat') THEN CASE WHEN result = 'victory' THEN 1.0 ELSE 0.0 END END) AS success_rate
    FROM raid_matchmaking
    WHERE created_at > datetime('now', ?)
    GROUP BY attacker_th
    ORDER BY attacker_th
  `).all(...params);
  const byTarget = db.prepare(`
    SELECT CASE WHEN target_is_bot = 1 THEN 'bot' ELSE 'live' END AS target_type,
           COALESCE(target_bot_difficulty, difficulty_bucket, 'live') AS bucket,
           COUNT(*) AS raids,
           SUM(CASE WHEN result IN ('victory', 'defeat') THEN 1 ELSE 0 END) AS decided_raids,
           SUM(CASE WHEN result = 'victory' THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN recovery_level > 0 THEN 1 ELSE 0 END) AS recovery_matches,
           AVG(base_power_ratio) AS avg_base_power_ratio,
           AVG(CASE WHEN result IN ('victory', 'defeat') THEN CASE WHEN result = 'victory' THEN 1.0 ELSE 0.0 END END) AS success_rate
    FROM raid_matchmaking
    WHERE created_at > datetime('now', ?)
    GROUP BY target_type, bucket
    ORDER BY target_type, bucket
  `).all(...params);
  const byPlayer = db.prepare(`
    WITH player_th AS (
      SELECT p.id, COALESCE(MAX(CASE WHEN b.type = 'town_hall' THEN b.level END), 1) AS th_level
      FROM players p
      LEFT JOIN buildings b ON b.player_id = p.id
      WHERE COALESCE(p.is_bot, 0) = 0
      GROUP BY p.id
    ),
    mm AS (
      SELECT attacker_id,
             COUNT(*) AS raids,
             SUM(CASE WHEN result IN ('victory', 'defeat') THEN 1 ELSE 0 END) AS decided_raids,
             SUM(CASE WHEN result = 'victory' THEN 1 ELSE 0 END) AS wins,
             SUM(CASE WHEN result = 'defeat' THEN 1 ELSE 0 END) AS losses,
             SUM(CASE WHEN target_is_bot = 1 THEN 1 ELSE 0 END) AS bot_matches,
             SUM(CASE WHEN recovery_level > 0 THEN 1 ELSE 0 END) AS recovery_matches,
             AVG(base_power_ratio) AS avg_base_power_ratio,
             MAX(created_at) AS latest_at
      FROM raid_matchmaking
      WHERE created_at > datetime('now', ?)
      GROUP BY attacker_id
    )
    SELECT p.id, p.name, p.dex, COALESCE(pt.th_level, 1) AS th_level,
           mm.raids, mm.decided_raids, mm.wins, mm.losses,
           mm.bot_matches, mm.recovery_matches, mm.avg_base_power_ratio,
           CASE WHEN mm.decided_raids > 0 THEN CAST(mm.wins AS REAL) / mm.decided_raids ELSE NULL END AS success_rate,
           CASE WHEN mm.raids > 0 THEN CAST(mm.bot_matches AS REAL) / mm.raids ELSE NULL END AS bot_share,
           mm.latest_at
    FROM mm
    JOIN players p ON p.id = mm.attacker_id AND COALESCE(p.is_bot, 0) = 0
    LEFT JOIN player_th pt ON pt.id = p.id
    ORDER BY mm.raids DESC, success_rate ASC, mm.latest_at DESC
    LIMIT 120
  `).all(...params);
  const botTemplateInventory = Object.values(buildBotBaseTemplates().reduce((acc, template) => {
    const key = `${template.th}:${template.difficulty}`;
    if (!acc[key]) acc[key] = { th: template.th, difficulty: template.difficulty, templates: 0 };
    acc[key].templates += 1;
    return acc;
  }, {})).sort((a, b) => a.th - b.th || String(a.difficulty).localeCompare(String(b.difficulty)));
  const activeBotTargets = db.prepare(`
    SELECT level AS th, bot_difficulty AS difficulty, COUNT(*) AS active_targets
    FROM players
    WHERE COALESCE(is_bot, 0) = 1
    GROUP BY level, bot_difficulty
    ORDER BY level, bot_difficulty
  `).all();
  const battleRiskPlayers = getBattleRiskPlayers({ limit: 120 });
  const battleRiskByPlayer = new Map(battleRiskPlayers.map((row) => [row.player_id, row]));
  const byPlayerWithRisk = byPlayer.map((row) => {
    const risk = battleRiskByPlayer.get(row.id);
    return {
      ...row,
      risk_flags: risk?.risk_flags || [],
      captcha_required: !!risk?.captcha_required,
    };
  });
  return {
    days: safeDays,
    target_success_rate: MATCHMAKING_CONFIG.targetSuccessRate,
    target_band: MATCHMAKING_CONFIG.targetBand,
    summary,
    by_th: byTh,
    by_target: byTarget,
    by_player: byPlayerWithRisk,
    battle_risk_thresholds: BATTLE_RISK_THRESHOLDS,
    battle_risk_players: battleRiskPlayers,
    captcha_required_count: battleRiskPlayers.length,
    bot_templates: botTemplateInventory,
    active_bot_targets: activeBotTargets,
  };
}

module.exports = {
  db,
  // Re-export the prepared-statement bag so route code can call
  // pre-compiled queries without re-preparing them per request. Currently
  // only `bumpPlayerLastSeen` is consumed externally; expand carefully —
  // each new entry duplicates state that the existing `db.db.prepare`
  // call sites can already construct on demand.
  stmts,
  BUILDING_DEFS,
  BUILDING_UPGRADE_COST_MULTIPLIERS,
  TH_UNLOCK,
  TH_MAX_COUNT,
  TH_UPGRADE_REQUIRES,
  GRID_SPECS,
  TROOP_DEFS,
  DISABLED_TROOP_TYPES,
  ACTIVE_TROOP_TYPES,
  isTroopDisabled,
  ALTAR_SKILL_DEFS,
  registerPlayer,
  authenticatePlayer,
  renamePlayer,
  listPlayerNameHistory,
  isPlayerBanned,
  getAdminPlayer,
  banPlayer,
  unbanPlayer,
  getWalletBlacklist,
  isWalletBlacklisted,
  blacklistWallet,
  unblacklistWallet,
  listWalletBlacklist,
  getMmBotAccess,
  isMmBotAccessEnabled,
  listMmBotAccess,
  listEnabledMmBotAccessPlayerIds,
  setMmBotAccess,
  ensureReferralCode,
  issueReferralCodeForPlayer,
  getLuckyRaiderPayoutSettings,
  setLuckyRaiderPayoutSettings,
  getTaskNftRewardBoostSettings,
  setTaskNftRewardBoostSettings,
  taskNftRewardBoostNftSummary,
  applyTaskNftRewardBoost,
  getReferralSettings,
  setReferralSettings,
  bindPlayerReferral,
  getReferralSummary,
  recordReferralRevenue,
  createAiAgentKey,
  listAiAgentKeys,
  revokeAiAgentKey,
  authenticateAiAgentKey,
  getOrCreateHermesAgent,
  markHermesAgentState,
  logHermesChatEvent,
  logMcpEvent,
  listPlayerDemonKingNfts,
  getPlayerDemonKingNft,
  replacePlayerDemonKingNfts,
  bindPlayerDemonKingNft,
  getDemonKingNftWalletCheck,
  listPlayerCollectionNfts,
  getPlayerCollectionNft,
  replacePlayerCollectionNfts,
  bindPlayerCollectionNft,
  getCollectionNftWalletCheck,
  markDemonKingNftWalletChecked,
  NFT_RARITY_LABELS,
  normalizeNftRarity,
  collectionSupportsRarity,
  getNftRarity,
  listNftRarities,
  upsertNftRarity,
  getResources,
  addResources,
  recordTradeClaimResult,
  recordShopFunnelEvent,
  recordTaskClaimEvent,
  recordResourceDeltaEvent,
  canAfford,
  subtractResources,
  hasUtilityPurchase,
  getShopEntitlements,
  getBuildingUnlocks,
  getBuildingUpgradeCost,
  canPlaceBuildingAt,
  findOpenBuildingSlots,
  placeBuilding,
  upgradeBuilding,
  moveBuilding,
  removeBuilding,
  getPlayerBuildings,
  getTownHallFlag,
  getUnconsumedTownHallFlagPurchase,
  setTownHallFlag,
  clearTownHallFlag,
  upgradeTroop,
  getTroopLevels,
  upgradeAltarSkill,
  getAltarSkillLevels,
  getAltarBonusPct,
  applyAltarProsperityResourceBonus,
  findEnemy,
  inspectEnemyByName,
  findEnemyByName,
  listRevengeTargets,
  startRevengeBattle,
  collectResources,
  getProductionStatus,
  recalculateTrophies,
  getTrophies,
  getBattleWins,
  getDemonKingBattleWins,
  recordDemonKingBattleWinEvents,
  getCollectionBattleWins,
  recordCollectionBattleWinEvents,
  getDemonKingUpgradeStatus,
  getNftBackedTroopUpgradeStatus,
  demonKingRequiredWins,
  getFullPlayerState,
  getPlayerShip,
  ensurePlayerShip,
  updatePlayerShipTroops,
  upgradePlayerShip,
  playerShipCapacity,
  PLAYER_SHIP_LEVELS,
  buyShip,
  battleVictory,
  battleDefeat,
  markSurrender,
  validateBattleSession,
  finishBattleSession,
  getPlayerMatchmakingStats,
  getGlobalMatchmakingStats,
  getBattleRiskPlayers,
  getBattleRiskForPlayer,
  BATTLE_RISK_THRESHOLDS,
  AI_MCP_AGENT_ACCESS_ENABLED,
  AI_MCP_AGENT_DISABLED_MESSAGE,
  // Tournament hooks — exported so server/routes.js claim-gold path and
  // server-futures rewards-workers can credit volume / pnl into
  // tournament_participants alongside the normal flow.
  getPlayerActiveTournament,
  getPlayerTournamentById,
  applyTrophyDelta,
  applyGoldReward,
  recordTournamentTrade,
  recordTournamentTradeRows,
  listTournamentTradeCreditIds,
  getTournamentTradeSyncState,
  setTournamentTradeSyncState,
  luckyRaiderAttackStatsForPlayer,
  awardTournamentDailyPoolDay,
  awardLatestClosedTournamentDailyPoolDay,
  awardTournamentLuckyRaiderDay,
  awardTournamentFinalDailyPoolDay,
  awardPendingTournamentDailyPools,
  getTournamentLuckyRaiderPayout,
  listTournamentLuckyRaiderPayouts,
  getTournamentLuckyRaiderPayoutSummary,
  listPendingTournamentLuckyRaiderPayouts,
  claimTournamentLuckyRaiderPayout,
  updateTournamentLuckyRaiderPayoutDestination,
  isPlayerSolanaWalletLinked,
  markTournamentLuckyRaiderPayoutPaid,
  markTournamentLuckyRaiderPayoutFailed,
  seedTournamentDailyPoolBaseline,
  getResourceCaps,
  storeReplay,
  TROPHY_TABLE,
};
