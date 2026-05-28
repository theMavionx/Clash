const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const { CANONICAL_GRID_CONFIG } = require('./combat_defs');
const uuidv4 = () => crypto.randomUUID();

const DB_PATH = process.env.CLASH_MAIN_DB || path.join(__dirname, 'clash.db');

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
      name         TEXT NOT NULL,
      description  TEXT,
      dex          TEXT NOT NULL CHECK(dex IN ('pacifica','avantis','decibel','gmx','monad','phoenix','hyperliquid','risex','nado')),
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
      sort_by      TEXT NOT NULL DEFAULT 'pnl_usd' CHECK(sort_by IN ('pnl_usd','trophies','volume_usd','gold','points','volume_trophies_50_50')),
      points_trophy_weight REAL NOT NULL DEFAULT 0,
      points_volume_weight REAL NOT NULL DEFAULT 0,
      points_pnl_weight    REAL NOT NULL DEFAULT 0,
      scoring_mode TEXT NOT NULL DEFAULT 'live' CHECK(scoring_mode IN ('live','daily_pool')),
      daily_pool_points REAL NOT NULL DEFAULT 1000,
      daily_pool_enabled_at TEXT,
      prize_currency TEXT NOT NULL DEFAULT 'USD',
      prize_tiers    TEXT NOT NULL DEFAULT '[]',
      rewards_in_cop INTEGER NOT NULL DEFAULT 0,
      seeker_only  INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended','draft')),
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tournaments_dex_status ON tournaments(dex, status);
    CREATE INDEX IF NOT EXISTS idx_tournaments_scope_status ON tournaments(dex_scope, status);
  `);
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
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN points_trophy_weight REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN points_volume_weight REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN points_pnl_weight REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN scoring_mode TEXT NOT NULL DEFAULT 'live'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_points REAL NOT NULL DEFAULT 1000`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_enabled_at TEXT`); } catch {}
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
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN prize_currency TEXT NOT NULL DEFAULT 'USD'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN prize_tiers TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN rewards_in_cop INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN seeker_only INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN seeker_gold_boost REAL NOT NULL DEFAULT 1.0`); } catch {}
  try { db.exec(`ALTER TABLE tournaments ADD COLUMN shield_hours REAL`); } catch {}
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
      && (!schema.includes("'points'") || !schema.includes("'volume_trophies_50_50'") || !schema.includes("'monad'") || !schema.includes("'phoenix'") || !schema.includes("'hyperliquid'") || !schema.includes("'risex'") || !schema.includes("'nado'") || !schema.includes("points_trophy_weight") || !schema.includes("scoring_mode") || !schema.includes("daily_pool_points") || !schema.includes("prize_tiers") || !schema.includes("rewards_in_cop") || !schema.includes("seeker_only") || !schema.includes("seeker_gold_boost") || !schema.includes("shield_hours") || !schema.includes("dex_scope") || !schema.includes("eligible_dexes") || !schema.includes("dex_vs_dex") || !schema.includes("team_prize_splits") || !schema.includes("attack_match_policy"));
    if (needsRebuild) {
      db.pragma('foreign_keys = OFF');
      db.transaction(() => {
        db.exec(`
          CREATE TABLE tournaments_new (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            description  TEXT,
            dex          TEXT NOT NULL CHECK(dex IN ('pacifica','avantis','decibel','gmx','monad','phoenix','hyperliquid','risex','nado')),
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
            sort_by      TEXT NOT NULL DEFAULT 'pnl_usd' CHECK(sort_by IN ('pnl_usd','trophies','volume_usd','gold','points','volume_trophies_50_50')),
            points_trophy_weight REAL NOT NULL DEFAULT 0,
            points_volume_weight REAL NOT NULL DEFAULT 0,
            points_pnl_weight    REAL NOT NULL DEFAULT 0,
            scoring_mode TEXT NOT NULL DEFAULT 'live',
            daily_pool_points REAL NOT NULL DEFAULT 1000,
            daily_pool_enabled_at TEXT,
            prize_currency TEXT NOT NULL DEFAULT 'USD',
            prize_tiers    TEXT NOT NULL DEFAULT '[]',
            rewards_in_cop INTEGER NOT NULL DEFAULT 0,
            seeker_only  INTEGER NOT NULL DEFAULT 0,
            status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended','draft')),
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            preregistration_enabled INTEGER NOT NULL DEFAULT 0,
            registration_opens_at TEXT,
            registration_closes_at TEXT
          );
          INSERT INTO tournaments_new (
            id, name, description, dex, dex_scope, eligible_dexes, mode, team_score_by, team_prize_mode, team_prize_splits, team_member_reward_by, attack_match_policy, start_at, end_at, gold_boost, seeker_gold_boost, trophy_boost,
            shield_hours, freeze_trophies, sort_by, points_trophy_weight, points_volume_weight, points_pnl_weight,
            scoring_mode, daily_pool_points, daily_pool_enabled_at,
            prize_currency, prize_tiers, rewards_in_cop, seeker_only, status, created_at, preregistration_enabled, registration_opens_at, registration_closes_at
          )
          SELECT
            id, name, description,
            CASE WHEN dex IN ('pacifica','avantis','decibel','gmx','monad','phoenix','hyperliquid','risex','nado') THEN dex ELSE 'pacifica' END,
            CASE WHEN dex_scope IN ('single','custom','all') THEN dex_scope ELSE 'single' END,
            CASE
              WHEN eligible_dexes IS NOT NULL AND eligible_dexes != '' AND eligible_dexes != '[]' THEN eligible_dexes
              ELSE '["' || CASE WHEN dex IN ('pacifica','avantis','decibel','gmx','monad','phoenix','hyperliquid','risex','nado') THEN dex ELSE 'pacifica' END || '"]'
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
            CASE WHEN sort_by IN ('pnl_usd','trophies','volume_usd','gold','points','volume_trophies_50_50') THEN sort_by ELSE 'pnl_usd' END,
            COALESCE(points_trophy_weight, CASE WHEN sort_by = 'volume_trophies_50_50' THEN 50 ELSE 0 END),
            COALESCE(points_volume_weight, CASE WHEN sort_by = 'volume_trophies_50_50' THEN 50 ELSE 0 END),
            COALESCE(points_pnl_weight, 0),
            CASE WHEN scoring_mode IN ('live','daily_pool') THEN scoring_mode ELSE 'live' END,
            CASE WHEN COALESCE(daily_pool_points, 0) > 0 THEN daily_pool_points ELSE 1000 END,
            daily_pool_enabled_at,
            COALESCE(prize_currency, 'USD'),
            COALESCE(prize_tiers, '[]'),
            COALESCE(rewards_in_cop, 0),
            COALESCE(seeker_only, 0),
            CASE WHEN status IN ('active','ended','draft') THEN status ELSE 'active' END,
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
try { db.exec(`ALTER TABLE tournaments ADD COLUMN scoring_mode TEXT NOT NULL DEFAULT 'live'`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_points REAL NOT NULL DEFAULT 1000`); } catch {}
try { db.exec(`ALTER TABLE tournaments ADD COLUMN daily_pool_enabled_at TEXT`); } catch {}
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
      last_activity_at TEXT,
      PRIMARY KEY (tournament_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tp_player_active ON tournament_participants(player_id, left_at);
    CREATE INDEX IF NOT EXISTS idx_tp_leaderboard ON tournament_participants(tournament_id, pnl_usd DESC);
  `);
  try { db.exec(`ALTER TABLE tournament_participants ADD COLUMN team_dex TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournament_participants ADD COLUMN reward_wallet_evm TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournament_participants ADD COLUMN last_activity_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tournament_participants ADD COLUMN awarded_points REAL NOT NULL DEFAULT 0`); } catch {}
} catch (e) { console.warn('[db] tournament_participants migration:', e.message); }

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
            const tokenOk = ['base', 'arbitrum', 'monad'].includes(chain)
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
  mine:    { resource: 'ore',  rate: [18, 33, 54, 81], max: [200, 400, 800, 1600] },    // per minute
  sawmill: { resource: 'wood', rate: [24, 45, 72, 108], max: [250, 500, 1000, 2000] },
};

// ---------- Prepared Statements ----------

const stmts = {
  // Players
  createPlayer: db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore)
    VALUES (?, ?, ?, 2000, 2000, 2000)
  `),
  getPlayerByToken: db.prepare(`SELECT * FROM players WHERE token = ?`),
  getPlayerByName: db.prepare(`SELECT * FROM players WHERE name = ?`),
  getPlayerByNameCasefold: db.prepare(`SELECT * FROM players WHERE lower(name) = lower(?) LIMIT 1`),
  searchPlayersByName: db.prepare(`
    SELECT id, name, trophies, level, shield_until
    FROM players
    WHERE lower(name) LIKE lower(?) ESCAPE '\\'
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
  // Heartbeat — fired on every authenticated API call by the auth
  // middleware. Idempotent (single UPDATE), no event sourcing needed.
  // The TEXT column stores ISO-ish "YYYY-MM-DD HH:MM:SS" so SQLite's
  // datetime() comparisons work directly.
  bumpPlayerLastSeen: db.prepare(`UPDATE players SET last_seen_at = datetime('now') WHERE id = ?`),
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
    SELECT id, name, trophies, level FROM players
    WHERE id != ?
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

  // Production
  updateLastCollected: db.prepare(`UPDATE buildings SET last_collected_at = ? WHERE id = ? AND player_id = ?`),

  // Replay
  insertReplay: db.prepare(`
    INSERT INTO battle_replays (attacker_id, defender_id, claimed_result, verified_result, verification_reason, replay_data, buildings_snapshot, loot_gold, loot_wood, loot_ore, sim_th_hp_pct, sim_buildings_destroyed, sim_debug, duration_sec)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  markSurrenderById: db.prepare(`
    UPDATE battle_sessions
    SET surrendered_at = datetime('now'),
        status = 'cancelled',
        completed_at = COALESCE(completed_at, datetime('now'))
    WHERE id = ? AND attacker_id = ?
  `),
  // Surrender stamp by attacker+defender pair — fallback used when the
  // client lost the session id (page reload, sailor abandon). Targets the
  // most recent active or recently-completed session for the pair.
  markSurrenderByPair: db.prepare(`
    UPDATE battle_sessions
    SET surrendered_at = datetime('now'),
        status = CASE WHEN status = 'active' THEN 'cancelled' ELSE status END,
        completed_at = COALESCE(completed_at, datetime('now'))
    WHERE id = (
      SELECT id FROM battle_sessions
      WHERE attacker_id = ? AND defender_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    )
  `),
  // Insert-only fallback when no battle_session row exists for this pair
  // (extremely rare — find-enemy always creates one, but guards against
  // stale data on legacy accounts). Acts as a pure cooldown marker; the
  // matchmaker only reads `surrendered_at`, not `status` or `reserved_until`.
  insertSurrenderMarker: db.prepare(`
    INSERT INTO battle_sessions (id, attacker_id, defender_id, status, reserved_until, surrendered_at, completed_at)
    VALUES (?, ?, ?, 'cancelled', datetime('now'), datetime('now'), datetime('now'))
  `),

  // Tournaments — used by battle paths to detect whether a player is
  // currently joined to an active tournament available to their DEX. When yes,
  // main `players.trophies` writes are skipped and the delta is routed
  // (with boost) into `tournament_participants.trophies` instead.
  // Joins with `players.dex` to enforce single/custom/all DEX scoping; `left_at IS NULL`
  // means the participant is still active (didn't soft-leave).
  // Status='active' + (end_at IS NULL OR end_at > now) defines "live now".
  getActiveTournamentForPlayer: db.prepare(`
    SELECT t.id AS tournament_id, t.dex, t.dex_scope, t.eligible_dexes, t.mode, t.seeker_only, p.team_dex,
           t.gold_boost, COALESCE(t.seeker_gold_boost, 1.0) AS seeker_gold_boost, t.trophy_boost,
           COALESCE(pl.is_seeker, 0) AS is_seeker,
           COALESCE(t.freeze_trophies, 1) AS freeze_trophies, t.sort_by,
           COALESCE(t.scoring_mode, 'live') AS scoring_mode,
           COALESCE(t.daily_pool_points, 1000) AS daily_pool_points,
           t.daily_pool_enabled_at,
           t.shield_hours, t.start_at, t.end_at, p.joined_at
    FROM tournament_participants p
    JOIN players pl ON pl.id = p.player_id
    JOIN tournaments t ON t.id = p.tournament_id
    WHERE p.player_id = ?
      AND p.left_at IS NULL
      AND t.status = 'active'
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
  getActiveTournamentAttackPolicyForPlayer: db.prepare(`
    SELECT t.id AS tournament_id, t.name, t.dex, t.dex_scope, t.eligible_dexes, t.mode, t.seeker_only,
           COALESCE(t.attack_match_policy, 'all') AS attack_match_policy,
           p.team_dex, pl.dex AS player_dex
    FROM tournament_participants p
    JOIN players pl ON pl.id = p.player_id
    JOIN tournaments t ON t.id = p.tournament_id
    WHERE p.player_id = ?
      AND p.left_at IS NULL
      AND COALESCE(t.mode, 'individual') = 'dex_vs_dex'
      AND COALESCE(t.attack_match_policy, 'all') != 'all'
      AND t.status = 'active'
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
function recordTournamentTrade(playerId, volumeUsd, pnlUsd, count = 1) {
  if (!playerId) return;
  const c = Number(count) || 0;
  if (c <= 0) return;
  const t = getPlayerActiveTournament(playerId);
  if (!t) return;
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
    dex: t.dex,
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

function utcDayFromMs(ms) {
  const d = new Date(Number.isFinite(ms) ? ms : Date.now());
  return d.toISOString().slice(0, 10);
}

function utcDayFromSql(value) {
  return utcDayFromMs(sqlDateMs(value) ?? Date.now());
}

function isDailyPoolTournament(t) {
  return String(t?.scoring_mode || 'live').toLowerCase() === 'daily_pool';
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
  if (!playerId || !isDailyPoolTournament(t)) return false;
  const eventId = String(opts.eventId || opts.event_id || '').trim();
  if (!eventId) return false;
  const source = String(opts.source || 'event').trim() || 'event';
  const eventTime = opts.createdAt || opts.created_at || new Date().toISOString();
  const eventMs = sqlDateMs(eventTime);
  const enabledMs = sqlDateMs(t.daily_pool_enabled_at);
  if (enabledMs && eventMs && eventMs < enabledMs) return false;
  const day = opts.day || utcDayFromSql(eventTime);
  const r = stmts.insertTournamentDailyActivity.run(
    t.tournament_id || t.id,
    day,
    playerId,
    source,
    eventId,
    String(opts.dex || t.dex || '').toLowerCase() || null,
    Math.max(0, Math.floor(Number(metrics.trades_count || metrics.tradesCount || 0))),
    Math.max(0, safeUsd(metrics.volume_usd ?? metrics.volumeUsd ?? 0)),
    safeUsd(metrics.pnl_usd ?? metrics.pnlUsd ?? 0),
    Math.max(0, Math.floor(Number(metrics.trophies || 0))),
    Math.max(0, Math.floor(Number(metrics.gold || 0)))
  );
  return r.changes > 0;
}

function safeUsd(v, maxAbs = 10_000_000) {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > maxAbs) return 0;
  return n;
}

// Idempotently credits concrete futures trade_history rows into the active
// tournament. This is separate from trading_rewards.last_trade_id because some
// venues, especially Decibel, emit realised PnL later than the instant server
// order row. The ledger lets us sync that delayed PnL without minting volume or
// gold twice.
function recordTournamentTradeRows(playerId, rows, opts = {}) {
  if (!playerId || !Array.isArray(rows) || rows.length === 0) {
    return { credited_rows: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0 };
  }
  const t = getPlayerActiveTournament(playerId);
  if (!t) return { credited_rows: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0 };

  const source = String(opts.source || 'trade_history');
  const creditCount = opts.count !== false;
  const creditVolume = opts.volume !== false;
  const creditPnl = opts.pnl !== false;
  let creditedRows = 0;
  let tradesCount = 0;
  let volumeUsd = 0;
  let pnlUsd = 0;

  for (const row of rows) {
    if (row?.reward_duplicate) continue;
    if (!tradeInTournamentWindow(t, row)) continue;
    const tradeId = row?.id ?? row?.history_id ?? row?.trade_id;
    if (tradeId === undefined || tradeId === null || tradeId === '') continue;
    const creditDex = String(opts.dex || row?.dex || t.dex || '').toLowerCase() || t.dex;
    const count = creditCount ? 1 : 0;
    const volume = creditVolume ? Math.max(0, safeUsd(row.notional_usd ?? row.volume_usd ?? row.volume)) : 0;
    const pnl = creditPnl ? safeUsd(row.pnl ?? row.pnl_usd ?? row.realized_pnl ?? row.realised_pnl) : 0;
    const r = stmts.insertTournamentTradeCredit.run(
      t.tournament_id,
      source,
      String(tradeId),
      playerId,
      creditDex,
      count,
      volume,
      pnl
    );
    if (!r.changes) continue;
    recordTournamentDailyActivity(t, playerId, {
      trades_count: count,
      volume_usd: volume,
      pnl_usd: pnl,
    }, {
      source,
      eventId: String(tradeId),
      dex: creditDex,
      created_at: row.created_at,
    });
    creditedRows++;
    tradesCount += count;
    volumeUsd += volume;
    pnlUsd += pnl;
  }

  if (creditedRows > 0 && (tradesCount !== 0 || volumeUsd !== 0 || pnlUsd !== 0)) {
    stmts.bumpTournamentTrade.run(tradesCount, volumeUsd, pnlUsd, t.tournament_id, playerId);
  }
  return { credited_rows: creditedRows, trades_count: tradesCount, volume_usd: volumeUsd, pnl_usd: pnlUsd };
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

function tournamentFirstDailyPoolDay(t) {
  const start = Math.max(
    sqlDateMs(t.start_at) ?? 0,
    sqlDateMs(t.daily_pool_enabled_at) ?? 0
  );
  return utcDayFromMs(start || Date.now());
}

function tournamentLastClosedDailyPoolDay(t, now = new Date()) {
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

    const rows = db.prepare(`
      SELECT player_id,
             COALESCE(SUM(trades_count), 0) AS trades_count,
             COALESCE(SUM(volume_usd), 0) AS volume_usd,
             COALESCE(SUM(pnl_usd), 0) AS pnl_usd,
             COALESCE(SUM(trophies), 0) AS trophies
        FROM tournament_daily_activity
       WHERE tournament_id = ? AND day_utc = ?
       GROUP BY player_id
    `).all(tid, day);
    const pool = Math.max(0, Number(t.daily_pool_points || 1000) || 0);
    const weights = dailyPoolWeights(t);
    const categories = [
      { key: 'trophies', column: 'trophies', weight: weights.trophies },
      { key: 'volume', column: 'volume_usd', weight: weights.volume },
      { key: 'pnl', column: 'pnl_usd', weight: weights.pnl },
    ];
    const details = { pool, weights, categories: {} };
    let awardedTotal = 0;
    for (const cat of categories) {
      const catPool = pool * (Math.max(0, Number(cat.weight) || 0) / 100);
      const values = rows.map((row) => ({
        player_id: row.player_id,
        value: Math.max(0, Number(row[cat.column]) || 0),
      })).filter((row) => row.value > 0);
      const totalRaw = values.reduce((sum, row) => sum + row.value, 0);
      details.categories[cat.key] = { pool: Number(catPool.toFixed(6)), raw_total: Number(totalRaw.toFixed(6)), players: values.length };
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

function awardPendingTournamentDailyPools(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const maxDays = Math.max(1, Math.min(60, Number(options.maxDays || 14)));
  const tournaments = db.prepare(`
    SELECT *
      FROM tournaments
     WHERE COALESCE(scoring_mode, 'live') = 'daily_pool'
       AND status IN ('active','ended')
  `).all();
  const results = [];
  for (const t of tournaments) {
    const first = tournamentFirstDailyPoolDay(t);
    const last = tournamentLastClosedDailyPoolDay(t, now);
    if (first > last) continue;
    let day = first;
    let guard = 0;
    while (day <= last && guard < maxDays) {
      const run = stmts.getTournamentDailyRun.get(t.id, day);
      if (!run) results.push(awardTournamentDailyPoolDay(t.id, day));
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
  const finalDay = endMs && endMs <= nowMs ? utcDayFromMs(endMs - 1) : utcDayFromMs(nowMs);
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
  mage_tower: 4, // unlocked at TH4
};

// Max count per building type PER TH level: { type: [th1, th2, th3, th4] }
const TH_MAX_COUNT = {
  mine:         [1, 2, 3, 3],
  sawmill:      [1, 2, 3, 3],
  barn:         [1, 1, 1, 1],
  port:         [1, 2, 5, 5],
  altar:        [1, 1, 1, 1],
  archer_tower: [1, 2, 3, 3],
  tombstone:    [0, 1, 3, 3],  // unlocked at TH2
  turret:       [0, 0, 3, 3],  // unlocked at TH3
  storage:      [0, 1, 2, 3],  // unlocked at TH2
  mage_tower:   [0, 0, 0, 2],  // unlocked at TH4
  town_hall:    [1, 1, 1, 1],
};

// Required buildings to upgrade Town Hall (all must be at TH's current level)
const TH_UPGRADE_REQUIRES = {
  1: ['mine', 'sawmill', 'barn', 'port'],
  2: ['mine', 'sawmill', 'barn', 'port', 'storage', 'tombstone', 'archer_tower'],
  3: ['mine', 'sawmill', 'barn', 'port', 'storage', 'tombstone', 'archer_tower', 'turret'],
};

const BUILDING_DEFS = {
  town_hall: {
    size: [4, 4], max_level: 4,
    hp_levels: [3500, 6000, 10000, 17000],
    cost: { gold: 0, wood: 0, ore: 0 },
    upgrade_cost: {
      2: { gold: 2000, wood: 6000, ore: 5000 },
      3: { gold: 5000, wood: 20000, ore: 18000 },
      4: { gold: 30000, wood: 47500, ore: 45000 },
    },
    max_count: 1,
  },
  mine: {
    size: [3, 3], max_level: 4,
    hp_levels: [1200, 2200, 3800, 6000],
    cost: { gold: 200, wood: 500, ore: 0 },
    max_count: 4,
  },
  barn: {
    size: [4, 3], max_level: 4,
    hp_levels: [2000, 3500, 6000, 9500],
    cost: { gold: 300, wood: 800, ore: 600 },
    max_count: 1,
  },
  port: {
    size: [4, 3], max_level: 4,
    hp_levels: [1800, 3200, 5500, 8500],
    cost: { gold: 500, wood: 1200, ore: 1000 },
    max_count: 2,
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
    size: [3, 3], max_level: 4,
    hp_levels: [1200, 2200, 3800, 6000],
    cost: { gold: 200, wood: 0, ore: 500 },
    max_count: 4,
  },
  turret: {
    size: [2, 2], max_level: 4,
    hp_levels: [900, 1600, 2800, 4500],
    cost: { gold: 400, wood: 1500, ore: 1200 },
    max_count: 6,
  },
  tombstone: {
    size: [3, 3], max_level: 4,
    hp_levels: [1000, 1500, 2000, 2700],
    cost: { gold: 200, wood: 0, ore: 800 },
    max_count: 4,
  },
  storage: {
    size: [4, 5], max_level: 4,
    hp_levels: [1400, 2500, 4200, 6500],
    cost: { gold: 300, wood: 1200, ore: 0 },
    max_count: 3,
  },
  archer_tower: {
    size: [3, 3], max_level: 5,
    hp_levels: [800, 1500, 2500, 3800, 5600],
    cost: { gold: 400, wood: 1500, ore: 0 },
    max_count: 4,
  },
  mage_tower: {
    size: [3, 3], max_level: 3,
    hp_levels: [700, 1200, 2000],
    cost: { gold: 2500, wood: 0, ore: 4000 },
    max_count: 2,
  },
};

const BUILDING_UPGRADE_COST_MULTIPLIERS = {
  2: 2,
  3: 3,
  4: 20,
  5: 35,
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

// ---------- Troop Definitions ----------

const TROOP_DEFS = {
  knight:    { max_level: 4, cost: [{ gold: 300, wood: 0, ore: 250 },  { gold: 600, wood: 0, ore: 500 },  { gold: 1200, wood: 0, ore: 1000 }] },
  mage:      { max_level: 4, cost: [{ gold: 500, wood: 0, ore: 500 }, { gold: 1000, wood: 0, ore: 1000 }, { gold: 2000, wood: 0, ore: 2000 }] },
  barbarian: { max_level: 4, cost: [{ gold: 350, wood: 0, ore: 350 }, { gold: 700, wood: 0, ore: 700 }, { gold: 1400, wood: 0, ore: 1400 }] },
  archer:    { max_level: 4, cost: [{ gold: 350, wood: 350, ore: 0 }, { gold: 700, wood: 700, ore: 0 }, { gold: 1400, wood: 1400, ore: 0 }] },
  ranger:    { max_level: 4, cost: [{ gold: 250, wood: 250, ore: 0 }, { gold: 500, wood: 500, ore: 0 }, { gold: 1000, wood: 1000, ore: 0 }] },
  demon_king: { max_level: 3, cost: [{ gold: 0, wood: 0, ore: 0 }, { gold: 0, wood: 0, ore: 0 }] },
};

const ALTAR_SKILL_DEFS = {
  prosperity: {
    max_level: 3,
    bonuses: [10, 20, 30],
    cost: [
      { wood: 10000, ore: 10000, gold: 2500 },
      { wood: 30000, ore: 30000, gold: 7500 },
      { wood: 80000, ore: 80000, gold: 20000 },
    ],
  },
  ward: {
    max_level: 3,
    bonuses: [5, 10, 15],
    cost: [
      { wood: 15000, ore: 8000, gold: 2500 },
      { wood: 45000, ore: 25000, gold: 7500 },
      { wood: 120000, ore: 60000, gold: 20000 },
    ],
  },
  conquest: {
    max_level: 3,
    bonuses: [4, 8, 12],
    cost: [
      { wood: 8000, ore: 15000, gold: 2500 },
      { wood: 25000, ore: 45000, gold: 7500 },
      { wood: 60000, ore: 120000, gold: 20000 },
    ],
  },
};

const DEFENSE_BUILDING_TYPES = new Set(['turret', 'archer_tower', 'archertower', 'archtower', 'mage_tower', 'tombstone']);

const DEMON_KING_UPGRADE_WINS = {
  2: 1000,
  3: 10000,
};

function demonKingRequiredWins(level) {
  return DEMON_KING_UPGRADE_WINS[Number(level)] || null;
}

const GRID_SPECS = {
  0: { width: 27, height: 27, label: 'main island', allowed: null, blocked: ['port'] },
  1: { width: 27, height: 3, label: 'port coast', allowed: ['port'], blocked: [] },
  2: { width: 27, height: 5, label: 'attack approach', allowed: ['flag'], blocked: [] },
};

// ---------- Trophy Points per Building (type -> level -> trophies) ----------

// PvP trophy rewards — trophies only change from battles
const TROPHY_WIN = 30;
const TROPHY_LOSS = 15;  // defender loses this on defeat

const TROPHY_TABLE = {
  town_hall: [50, 120, 250, 450],
  mine:      [10, 25, 50, 90],
  barn:      [10, 25, 50, 90],
  port:      [15, 35, 70, 125],
  sawmill:   [10, 25, 50, 90],
  turret:    [20, 45, 90, 160],
  tombstone: [5, 10, 20, 40],
  storage:      [10, 25, 50, 90],
  archer_tower: [15, 35, 70, 125, 200],
  mage_tower:   [20, 45, 90],
};

// ---------- Helper Functions ----------

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

function registerPlayer(name) {
  const id = uuidv4();
  const token = uuidv4();
  stmts.createPlayer.run(id, name, token);
  // Init troop levels
  for (const troop of Object.keys(TROOP_DEFS)) {
    stmts.upsertTroopLevel.run(id, troop, 1);
  }
  return { id, name, token };
}

function authenticatePlayer(token) {
  return stmts.getPlayerByToken.get(token);
}

function normalizeDemonKingNftLevel(level) {
  const n = Number(level);
  return [1, 2, 3].includes(n) ? n : 1;
}

function normalizeDemonKingNftRow(row) {
  if (!row) return null;
  return {
    playerId: row.player_id,
    collection: row.collection || 'demon_king',
    chain: String(row.chain || '').toLowerCase(),
    tokenId: String(row.token_id || ''),
    wallet: row.wallet || '',
    level: normalizeDemonKingNftLevel(row.level),
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

function normalizeDemonKingBattleToken(token = {}) {
  const chain = String(token.chain ?? token.chainKey ?? token.nftChain ?? '').trim().toLowerCase();
  const tokenId = String(
    token.tokenId ?? token.token_id ?? token.tokenIdRaw ?? token.nftTokenId ?? ''
  ).trim();
  const tokenOk = ['base', 'arbitrum', 'monad'].includes(chain)
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

function getPlayerDemonKingNft(playerId, chain, tokenId) {
  if (!playerId || !chain || tokenId == null) return null;
  return normalizeDemonKingNftRow(stmts.getPlayerDemonKingNft.get(
    playerId,
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

function replacePlayerDemonKingNfts(playerId, wallet, tokens = [], options = {}) {
  const owner = String(wallet || '').trim();
  if (!playerId || !owner) return [];
  const normalized = Array.isArray(tokens)
    ? tokens.map(normalizeDemonKingNftInput).filter(Boolean)
    : [];
  _replacePlayerDemonKingNftsTxn(playerId, owner, normalized, options);
  return listPlayerDemonKingNfts(playerId, owner);
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
  1: { gold: 10000, wood: 10000, ore: 10000 },
  2: { gold: 20000, wood: 20000, ore: 20000 },
  3: { gold: 40000, wood: 40000, ore: 40000 },
  4: { gold: 70000, wood: 70000, ore: 70000 },
};

// Additional capacity per Storage building per level
const STORAGE_CAPACITY = {
  1: { gold: 15000, wood: 15000, ore: 15000 },
  2: { gold: 20000, wood: 20000, ore: 20000 },
  3: { gold: 30000, wood: 30000, ore: 30000 },
  4: { gold: 50000, wood: 50000, ore: 50000 },
};

function getResourceCaps(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  // Find Town Hall level
  let thLevel = 1;
  for (const b of buildings) {
    if (b.type === 'town_hall') thLevel = b.level;
  }
  const base = TH_BASE_CAPACITY[Math.min(thLevel, 4)] || TH_BASE_CAPACITY[1];
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

function addResources(playerId, gold = 0, wood = 0, ore = 0) {
  const current = stmts.getResources.get(playerId);
  if (!current) return null;
  // Cap to storage capacity
  const caps = getResourceCaps(playerId);
  const newGold = Math.min(caps.gold, Math.max(0, current.gold + gold));
  const newWood = Math.min(caps.wood, Math.max(0, current.wood + wood));
  const newOre = Math.min(caps.ore, Math.max(0, current.ore + ore));
  stmts.updateResource.run(newGold, newWood, newOre, playerId);
  return { gold: newGold, wood: newWood, ore: newOre };
}

function subtractResources(playerId, gold = 0, wood = 0, ore = 0) {
  const current = stmts.getResources.get(playerId);
  if (!current) return null;
  if (current.gold < gold || current.wood < wood || current.ore < ore) {
    return { error: 'Not enough resources', current };
  }
  return addResources(playerId, -gold, -wood, -ore);
}

function canAfford(playerId, gold = 0, wood = 0, ore = 0) {
  const current = stmts.getResources.get(playerId);
  if (!current) return false;
  return current.gold >= gold && current.wood >= wood && current.ore >= ore;
}

function getTownHallLevel(playerId) {
  const buildings = stmts.getBuildings.all(playerId);
  for (const b of buildings) {
    if (b.type === 'town_hall') return b.level;
  }
  return 1;
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
  subtractResources(playerId, cost.gold, cost.wood, cost.ore);

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

  // Town Hall upgrade — check all required buildings are at current TH level
  if (building.type === 'town_hall') {
    const required = TH_UPGRADE_REQUIRES[building.level];
    if (required) {
      const allBuildings = stmts.getBuildings.all(playerId);
      for (const reqType of required) {
        const found = allBuildings.find(b => b.type === reqType && b.level >= building.level);
        if (!found) {
          return { error: `Upgrade all ${reqType} to level ${building.level} first` };
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

  subtractResources(playerId, cost.gold, cost.wood, cost.ore);

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
  if (building.type === 'port' && building.has_ship) {
    return { error: 'Cannot move a port with a docked ship' };
  }
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
  return decorateBuildingsForPlayer(playerId, stmts.getBuildings.all(playerId));
}

function getBattleWins(playerId) {
  return Math.max(0, Number(stmts.getBattleWins.get(playerId)?.battle_wins || 0) || 0);
}

function getDemonKingBattleWins(playerId, chain, tokenId) {
  const token = normalizeDemonKingBattleToken({ chain, tokenId });
  if (!playerId || !token) return 0;
  return Math.max(0, Number(stmts.getDemonKingBattleWins.get(playerId, token.chain, token.tokenId)?.wins || 0) || 0);
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

function getDemonKingUpgradeStatus(playerId, options = {}) {
  const def = TROOP_DEFS.demon_king;
  const levels = stmts.getTroopLevels.all(playerId);
  const current = levels.find(t => t.troop_type === 'demon_king');
  const currentLevel = current ? current.level : 1;
  const nextLevel = currentLevel >= def.max_level ? null : currentLevel + 1;
  const requiredWins = nextLevel ? demonKingRequiredWins(nextLevel) : null;
  const token = normalizeDemonKingBattleToken(options);
  const battleWins = token ? getDemonKingBattleWins(playerId, token.chain, token.tokenId) : 0;
  return {
    troop_type: 'demon_king',
    current_level: currentLevel,
    max_level: def.max_level,
    next_level: nextLevel,
    battle_wins: battleWins,
    wins: battleWins,
    account_battle_wins: getBattleWins(playerId),
    required_wins: requiredWins,
    wins_ready: requiredWins == null || battleWins >= requiredWins,
    requires_nft_upgrade: nextLevel != null,
    nft_upgrade_price: 'same_as_purchase',
    win_scope: token ? 'demon_king_nft' : 'none',
    nft: token ? { chain: token.chain, token_id: token.tokenId } : null,
  };
}

function upgradeTroop(playerId, troopType, options = {}) {
  const def = TROOP_DEFS[troopType];
  if (!def) return { error: `Unknown troop type: ${troopType}` };

  const levels = stmts.getTroopLevels.all(playerId);
  const current = levels.find(t => t.troop_type === troopType);
  const currentLevel = current ? current.level : 1;

  if (currentLevel >= def.max_level) {
    return { error: 'Already at max level' };
  }

  if (troopType === 'demon_king') {
    const newLevel = currentLevel + 1;
    const requiredWins = demonKingRequiredWins(newLevel);
    const token = normalizeDemonKingBattleToken({
      chain: options.nftChain || options.chain,
      tokenId: options.nftTokenId || options.tokenId || options.token_id,
    });
    const battleWins = token ? getDemonKingBattleWins(playerId, token.chain, token.tokenId) : 0;
    const status = {
      ...getDemonKingUpgradeStatus(playerId, token || {}),
      next_level: newLevel,
      required_wins: requiredWins,
      battle_wins: battleWins,
      wins: battleWins,
      wins_ready: requiredWins == null || battleWins >= requiredWins,
    };
    if (requiredWins != null && battleWins < requiredWins) {
      return {
        ...status,
        error: `Demon King level ${newLevel} requires ${requiredWins} battle wins`,
        code: 'DEMON_KING_WINS_REQUIRED',
      };
    }
    if (!options.nftVerified || Number(options.nftLevel || 0) < newLevel) {
      return {
        ...status,
        error: `Upgrade your Demon King NFT to level ${newLevel} first`,
        code: 'DEMON_KING_NFT_UPGRADE_REQUIRED',
        requires_nft_upgrade: true,
      };
    }
    stmts.upsertTroopLevel.run(playerId, troopType, newLevel);
    return {
      troop_type: troopType,
      level: newLevel,
      current_level: newLevel,
      cost: { gold: 0, wood: 0, ore: 0 },
      battle_wins: battleWins,
      required_wins: requiredWins,
      nft: {
        chain: options.nftChain || null,
        token_id: options.nftTokenId || null,
        owner: options.nftOwner || null,
        level: Number(options.nftLevel || newLevel),
      },
      resources: getResources(playerId),
    };
  }

  const cost = def.cost[currentLevel - 1]; // cost to upgrade FROM current level
  if (!canAfford(playerId, cost.gold, cost.wood, cost.ore)) {
    return { error: 'Not enough resources', cost };
  }

  subtractResources(playerId, cost.gold, cost.wood, cost.ore);
  const newLevel = currentLevel + 1;
  stmts.upsertTroopLevel.run(playerId, troopType, newLevel);

  return {
    troop_type: troopType, level: newLevel, cost,
    resources: getResources(playerId),
  };
}

function getTroopLevels(playerId) {
  return stmts.getTroopLevels.all(playerId);
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

  subtractResources(playerId, cost.gold || 0, cost.wood || 0, cost.ore || 0);
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
  const prosperityApplies = prod.resource === 'wood' || prod.resource === 'ore';
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
  const withProduction = buildings.map((building) => {
    const production = getBuildingProductionSnapshot(building, now, levels);
    return production ? {
      ...building,
      stored: production.stored,
      production_resource: production.resource,
      production_max: production.max,
      production_rate_per_min: production.rate_per_min,
      production_base_rate_per_min: production.base_rate_per_min,
      altar_prosperity_bonus_pct: production.altar_prosperity_bonus_pct,
    } : building;
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
  addResources(playerId, addObj.gold, addObj.wood, addObj.ore);

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
  const myStrength = getBaseStrength(playerId);
  const rawCandidates = stmts.findEnemyCandidates.all(playerId, playerId, playerId, playerId);
  const matchFilter = filterTournamentAttackCandidates(playerId, rawCandidates);
  const candidates = matchFilter.candidates;
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

  // Pick closest base strength
  let best = null, bestDiff = Infinity;
  for (const c of candidates) {
    const str = getBaseStrength(c.id);
    const diff = Math.abs(str - myStrength);
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  }
  if (!best) return { error: NO_TARGETS };

  // Repair enemy buildings before attack
  repairAllBuildings(best.id);
  const buildings = getPlayerBuildings(best.id);
  const resources = getResources(best.id);
  const sessionId = uuidv4();
  const reservedUntil = sqliteDateFromMs(Date.now() + BATTLE_RESERVATION_MINUTES * 60_000);
  const attackCostGold = getAttackCost(playerId);
  if (!canAfford(playerId, attackCostGold, 0, 0)) {
    return {
      error: `Not enough gold to attack. Need ${attackCostGold} gold.`,
      status: 400,
      attack_cost_gold: attackCostGold,
      resources: getResources(playerId),
    };
  }
  const attackerResources = subtractResources(playerId, attackCostGold, 0, 0);
  if (attackerResources?.error) {
    return {
      error: 'Not enough gold to attack',
      status: 400,
      attack_cost_gold: attackCostGold,
      resources: getResources(playerId),
    };
  }
  stmts.createBattleSession.run(sessionId, playerId, best.id, reservedUntil);
  return {
    id: best.id,
    name: best.name,
    trophies: best.trophies,
    level: best.level,
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
    const attackerResources = subtractResources(playerId, attackCostGold, 0, 0);
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
    };
  })();
}

// Stamps the matchmaker cooldown for a surrender. Tries the session id
// first (precise), then falls back to the most recent attacker/defender
// session, then inserts a synthetic marker row if no session exists at all.
// Returns true when a row was actually stamped — useful for the route to
// confirm the cooldown is now in place.
function markSurrender(attackerId, defenderId, sessionId = '') {
  if (!attackerId || !defenderId) return false;
  const sid = normalizeBattleSessionId(sessionId);
  if (sid) {
    const r = stmts.markSurrenderById.run(sid, attackerId);
    if (r.changes > 0) return true;
  }
  const pair = stmts.markSurrenderByPair.run(attackerId, defenderId);
  if (pair.changes > 0) return true;
  try {
    stmts.insertSurrenderMarker.run(uuidv4(), attackerId, defenderId);
    return true;
  } catch {
    return false;
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
  return {
    ...safe,
    buildings: getPlayerBuildings(playerId),
    troop_levels: getTroopLevels(playerId),
    altar_skills: getAltarSkillLevels(playerId),
    resource_caps: getResourceCaps(playerId),
    shop_entitlements: getShopEntitlements(playerId),
    building_unlocks: getBuildingUnlocks(playerId),
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

const SHIP_COST_GOLD = 500;

function buyShip(playerId, buildingId) {
  const building = stmts.getBuildingById.get(buildingId, playerId);
  if (!building) return { error: 'Building not found' };
  if (building.type !== 'port') return { error: 'Can only buy ships at ports' };
  if (building.has_ship) return { error: 'Port already has a ship' };
  if (!canAfford(playerId, SHIP_COST_GOLD, 0, 0)) {
    return { error: 'Not enough gold', cost: { gold: SHIP_COST_GOLD } };
  }
  subtractResources(playerId, SHIP_COST_GOLD, 0, 0);
  stmts.setShipOnPort.run(buildingId, playerId);
  return { success: true, resources: getResources(playerId) };
}

const LOOT_PERCENT = 0.15;

const RAID_ATTACK_COST_GOLD = 200;
const TARGETED_ATTACK_COST_MULTIPLIER = 2;

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
  const t = getPlayerActiveTournament(defenderId);
  if (!t || t.shield_hours === null || t.shield_hours === undefined || t.shield_hours === '') {
    return SHIELD_HOURS;
  }
  const n = Number(t.shield_hours);
  if (!Number.isFinite(n)) return SHIELD_HOURS;
  return Math.max(0, n);
}

function battleDefeat(attackerId, defenderId, battleSessionId = '') {
  // Trophy deltas route through applyTrophyDelta so per-player tournament
  // freeze is honoured: a tournament-joined player's main `players.trophies`
  // stays put, and the delta is funneled (with optional positive-only
  // boost) into `tournament_participants.trophies` instead.
  applyTrophyDelta(attackerId, -TROPHY_LOSS, { source: 'attack_loss', eventId: battleSessionId });
  applyTrophyDelta(defenderId,  TROPHY_WIN);
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
  const lootGold = Math.floor((defender.gold || 0) * LOOT_PERCENT);
  const lootWood = Math.floor((defender.wood || 0) * LOOT_PERCENT);
  const lootOre = Math.floor((defender.ore || 0) * LOOT_PERCENT);

  // Transfer resources
  subtractResources(defenderId, lootGold, lootWood, lootOre);
  addResources(attackerId, lootGold, lootWood, lootOre);

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
  applyTrophyDelta(attackerId,  TROPHY_WIN, { source: 'attack_win', eventId: battleSessionId });
  applyTrophyDelta(defenderId, -TROPHY_LOSS, { source: 'defense_loss', eventId: battleSessionId });
  stmts.incrementBattleWins.run(attackerId);
  finishBattleSession(battleSessionId, attackerId, defenderId, 'completed');

  return {
    success: true,
    loot: { gold: lootGold, wood: lootWood, ore: lootOre },
    attacker_resources: getResources(attackerId),
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

function storeReplay(attackerId, defenderId, replayData, buildingsSnapshot, claimedResult, verifiedResult, reason, loot, simResult) {
  const duration = replayDurationSec(replayData, simResult);
  const info = stmts.insertReplay.run(
    attackerId, defenderId, claimedResult, verifiedResult, reason || '',
    JSON.stringify(replayData), JSON.stringify(buildingsSnapshot),
    loot?.gold || 0, loot?.wood || 0, loot?.ore || 0,
    simResult?.townHallHpPct ?? null, simResult?.buildingsDestroyed ?? 0,
    replaySimDebug(simResult), duration
  );
  return Number(info?.lastInsertRowid || 0) || null;
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
  ALTAR_SKILL_DEFS,
  registerPlayer,
  authenticatePlayer,
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
  markDemonKingNftWalletChecked,
  getResources,
  addResources,
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
  upgradeTroop,
  getTroopLevels,
  upgradeAltarSkill,
  getAltarSkillLevels,
  getAltarBonusPct,
  findEnemy,
  inspectEnemyByName,
  findEnemyByName,
  collectResources,
  getProductionStatus,
  recalculateTrophies,
  getTrophies,
  getBattleWins,
  getDemonKingBattleWins,
  recordDemonKingBattleWinEvents,
  getDemonKingUpgradeStatus,
  demonKingRequiredWins,
  getFullPlayerState,
  buyShip,
  battleVictory,
  battleDefeat,
  markSurrender,
  validateBattleSession,
  finishBattleSession,
  // Tournament hooks — exported so server/routes.js claim-gold path and
  // server-futures rewards-workers can credit volume / pnl into
  // tournament_participants alongside the normal flow.
  getPlayerActiveTournament,
  applyTrophyDelta,
  applyGoldReward,
  recordTournamentTrade,
  recordTournamentTradeRows,
  awardTournamentDailyPoolDay,
  awardTournamentFinalDailyPoolDay,
  awardPendingTournamentDailyPools,
  seedTournamentDailyPoolBaseline,
  getResourceCaps,
  storeReplay,
  TROPHY_TABLE,
};
