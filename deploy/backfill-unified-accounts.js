#!/usr/bin/env node
/*
 * One-shot/idempotent backfill for the unified Clash account model.
 *
 * The normal server boot migration creates the new tables. This script
 * copies legacy players.wallet / players.dex relationships into:
 *   - player_auth_identities
 *   - player_wallets
 *   - player_dex_accounts
 *
 * It intentionally keeps legacy players rows intact. When a wallet has
 * multiple legacy rows, the most recently seen player row becomes the
 * canonical game account and all legacy DEX rows for that wallet are
 * attached to it.
 */

const path = require('path');

function loadBetterSqlite3() {
  try { return require('better-sqlite3'); } catch {}
  return require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'));
}

const Database = loadBetterSqlite3();

const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const APTOS_WALLET_RE = /^0x[0-9a-fA-F]{1,64}$/;

function normalizeAptosWallet(value) {
  const raw = String(value || '').trim();
  if (!APTOS_WALLET_RE.test(raw) || EVM_WALLET_RE.test(raw)) return raw;
  return `0x${raw.replace(/^0x/i, '').padStart(64, '0').toLowerCase()}`;
}

function chainType(wallet) {
  const raw = String(wallet || '').trim();
  if (EVM_WALLET_RE.test(raw)) return 'evm';
  if (APTOS_WALLET_RE.test(raw) && !EVM_WALLET_RE.test(raw)) return 'aptos';
  if (SOLANA_WALLET_RE.test(raw)) return 'solana';
  if (/^local_guest_[A-Za-z0-9_-]+$/.test(raw)) return 'local';
  return 'unknown';
}

function canonicalWallet(wallet) {
  const raw = String(wallet || '').trim();
  if (EVM_WALLET_RE.test(raw)) return raw.toLowerCase();
  if (APTOS_WALLET_RE.test(raw) && !EVM_WALLET_RE.test(raw)) return normalizeAptosWallet(raw);
  return raw;
}

function isValidWallet(wallet) {
  const raw = String(wallet || '').trim();
  return SOLANA_WALLET_RE.test(raw)
    || EVM_WALLET_RE.test(raw)
    || (APTOS_WALLET_RE.test(raw) && !EVM_WALLET_RE.test(raw))
    || /^local_guest_[A-Za-z0-9_-]+$/.test(raw);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dbArg = args.find((arg) => !arg.startsWith('--'));
const dbPath = dbArg || process.env.CLASH_MAIN_DB || path.join(__dirname, '..', 'server', 'clash.db');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

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
`);

const rows = db.prepare(`
  SELECT id, name, wallet, dex, created_at, last_seen_at
  FROM players
  WHERE wallet IS NOT NULL AND wallet != ''
  ORDER BY datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
`).all();

const groups = new Map();
for (const row of rows) {
  if (!isValidWallet(row.wallet)) continue;
  const wallet = canonicalWallet(row.wallet);
  const type = chainType(wallet);
  const key = `${type}:${wallet}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ...row, wallet, chain_type: type });
}

function timeValue(value) {
  const t = Date.parse(String(value || '').replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : 0;
}

for (const group of groups.values()) {
  group.sort((a, b) => (
    timeValue(b.last_seen_at) - timeValue(a.last_seen_at)
    || timeValue(b.created_at) - timeValue(a.created_at)
    || String(a.id).localeCompare(String(b.id))
  ));
}

let identityCount = 0;
let walletCount = 0;
let dexAccountCount = 0;
let duplicateWalletGroups = 0;

const upsert = db.transaction(() => {
  for (const [key, group] of groups.entries()) {
    const canonical = group[0];
    if (group.length > 1) duplicateWalletGroups += 1;

    const beforeIdentity = db.prepare('SELECT changes() AS n').get().n;
    void beforeIdentity;
    db.prepare(`
      INSERT OR IGNORE INTO player_auth_identities (player_id, type, identifier, verified_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(canonical.id, `${canonical.chain_type}_wallet`, canonical.wallet);
    identityCount += db.prepare('SELECT changes() AS n').get().n;

    db.prepare(`
      INSERT INTO player_wallets (player_id, chain_type, address, label, is_primary, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(chain_type, address) DO UPDATE SET
        player_id = excluded.player_id,
        is_primary = 1,
        updated_at = datetime('now')
    `).run(canonical.id, canonical.chain_type, canonical.wallet, canonical.chain_type);
    walletCount += db.prepare('SELECT changes() AS n').get().n;

    const byDex = new Map();
    for (const row of group) {
      const dex = String(row.dex || 'pacifica').toLowerCase();
      if (!byDex.has(dex)) byDex.set(dex, []);
      byDex.get(dex).push(row);
    }

    for (const [dex, legacyRows] of byDex.entries()) {
      const metadata = {
        source: 'legacy_players_backfill',
        canonical_player_id: canonical.id,
        legacy_player_ids: legacyRows.map((row) => row.id),
        duplicate_wallet_group: group.length > 1,
      };
      db.prepare(`
        INSERT INTO player_dex_accounts
          (player_id, dex, chain_type, wallet_address, status, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, 'ready', ?, datetime('now'))
        ON CONFLICT(player_id, dex) DO UPDATE SET
          chain_type = COALESCE(excluded.chain_type, player_dex_accounts.chain_type),
          wallet_address = COALESCE(excluded.wallet_address, player_dex_accounts.wallet_address),
          status = 'ready',
          metadata_json = excluded.metadata_json,
          updated_at = datetime('now')
      `).run(canonical.id, dex, canonical.chain_type, canonical.wallet, JSON.stringify(metadata));
      dexAccountCount += db.prepare('SELECT changes() AS n').get().n;
    }
  }
});

console.log(JSON.stringify({
  db: dbPath,
  dry_run: dryRun,
  legacy_wallet_rows: rows.length,
  canonical_wallet_groups: groups.size,
  duplicate_wallet_groups: Array.from(groups.values()).filter((group) => group.length > 1).length,
  duplicate_wallet_samples: Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .slice(0, 25)
    .map(([key, group]) => ({
      key,
      canonical_player_id: group[0].id,
      canonical_name: group[0].name,
      rows: group.map((row) => ({
        id: row.id,
        name: row.name,
        dex: row.dex || 'pacifica',
        created_at: row.created_at || null,
        last_seen_at: row.last_seen_at || null,
      })),
    })),
}, null, 2));

if (dryRun) {
  db.close();
  process.exit(0);
}

upsert();

const summary = {
  db: dbPath,
  inserted_or_updated_identities: identityCount,
  inserted_or_updated_wallets: walletCount,
  inserted_or_updated_dex_accounts: dexAccountCount,
  duplicate_wallet_groups_seen: duplicateWalletGroups,
  final: {
    identities: db.prepare('SELECT COUNT(*) AS n FROM player_auth_identities').get().n,
    wallets: db.prepare('SELECT COUNT(*) AS n FROM player_wallets').get().n,
    dex_accounts: db.prepare('SELECT COUNT(*) AS n FROM player_dex_accounts').get().n,
  },
};

console.log(JSON.stringify(summary, null, 2));
db.close();
