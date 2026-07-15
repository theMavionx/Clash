const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = process.env.CLASH_FUTURES_DB || path.join(__dirname, 'futures.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- Privkey encryption (AES-256-GCM) ----------
// Encrypts custodial wallet secret keys at rest. The encryption key lives in
// env CLASH_WALLET_ENCRYPTION_KEY (64 hex chars = 32 bytes). In dev we fall
// back to a host-specific key so local runs don't crash, but in prod the
// env var MUST be set — rotating it requires re-encrypting all rows.
const ENC_ALGO = 'aes-256-gcm';
const ENC_MARKER = 'enc1:'; // versioned prefix so we can migrate schemes later

function getEncKey() {
  const raw = process.env.CLASH_WALLET_ENCRYPTION_KEY;
  if (raw && /^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  // Anything that isn't a valid key is a hard fail. Previous behaviour fell
  // back to sha256("clash-dev-fallback") when NODE_ENV !== 'production' —
  // that's a deterministic, publicly-known key. A deployment that forgets to
  // set NODE_ENV would silently encrypt real wallets under a well-known key.
  // Fail loudly instead. Dev hosts can set NODE_ENV=development to opt in to
  // the fallback explicitly.
  if (process.env.NODE_ENV === 'development' && !raw) {
    console.warn('[futures] WARNING: CLASH_WALLET_ENCRYPTION_KEY unset — using INSECURE dev fallback. Never run production this way.');
    return crypto.createHash('sha256').update('clash-dev-fallback').digest();
  }
  throw new Error(
    'CLASH_WALLET_ENCRYPTION_KEY must be set to a 64-hex-char key. ' +
    'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}
let _encKey = null;
function encKey() { return _encKey || (_encKey = getEncKey()); }

function encryptSecret(plain) {
  if (plain.startsWith(ENC_MARKER)) return plain; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: enc1:<iv-hex>:<tag-hex>:<ciphertext-hex>
  return ENC_MARKER + iv.toString('hex') + ':' + tag.toString('hex') + ':' + ct.toString('hex');
}

function decryptSecret(stored) {
  if (!stored.startsWith(ENC_MARKER)) {
    // Any row without the enc1: prefix is a bug (migration didn't run, or a
    // raw row was inserted). Loudly surface it — silently returning plaintext
    // hides the lapse forever and encourages downstream misuse.
    // To unstick a broken deploy: call migrateLegacyPlaintext() manually.
    throw new Error('Wallet secret is not encrypted — refusing to use. Re-run migration or restore from backup.');
  }
  const parts = stored.slice(ENC_MARKER.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted secret');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const ct = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv(ENC_ALGO, encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ---------- Schema ----------

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    player_id    TEXT NOT NULL,
    player_name  TEXT NOT NULL,
    public_key   TEXT NOT NULL UNIQUE,
    secret_key   TEXT NOT NULL,
    dex          TEXT NOT NULL DEFAULT 'pacifica',
    chain        TEXT NOT NULL DEFAULT 'solana',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (player_id, dex)
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id    TEXT NOT NULL,
    tx_signature TEXT NOT NULL UNIQUE,
    amount       REAL NOT NULL,
    token        TEXT NOT NULL DEFAULT 'USDC',
    status       TEXT NOT NULL DEFAULT 'confirmed',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trade_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id      TEXT NOT NULL,
    symbol         TEXT NOT NULL,
    side           TEXT NOT NULL,
    order_type     TEXT NOT NULL,
    amount         TEXT NOT NULL,
    price          TEXT,
    order_id       INTEGER,
    client_order_id TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    pnl            TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS decibel_order_proofs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id       TEXT NOT NULL,
    subaccount      TEXT NOT NULL,
    order_id        TEXT,
    client_order_id TEXT,
    symbol          TEXT,
    side            TEXT,
    order_type      TEXT,
    market_name     TEXT,
    market_addr     TEXT,
    builder_addr    TEXT NOT NULL,
    builder_fee_bps REAL NOT NULL,
    tx_hash         TEXT,
    proof_json      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gmtrade_pending_trade_reports (
    signature       TEXT PRIMARY KEY,
    player_id       TEXT NOT NULL,
    wallet          TEXT NOT NULL,
    body_json       TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    first_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dex_worker_state (
    dex        TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (dex, key)
  );

`);

// ---------- Pre-statement migrations ----------
// These MUST run before any db.prepare() call. better-sqlite3 validates FK
// references and column names eagerly at prepare-time — any mismatch with
// the actual table shape throws and crashes module loading.

// wallets migration: add dex/chain columns if missing (old DBs from before
// the composite PK / multi-DEX support).
try { db.exec("ALTER TABLE wallets ADD COLUMN dex TEXT NOT NULL DEFAULT 'pacifica'"); } catch {}
try { db.exec("ALTER TABLE wallets ADD COLUMN chain TEXT NOT NULL DEFAULT 'solana'"); } catch {}

// trade_history migration: add dex + notional_usd so the main server can
// attribute gold rewards per-DEX and by traded volume.
try { db.exec("ALTER TABLE trade_history ADD COLUMN dex TEXT NOT NULL DEFAULT 'pacifica'"); } catch {}
try { db.exec("ALTER TABLE trade_history ADD COLUMN notional_usd REAL NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE trade_history ADD COLUMN verified_source TEXT NOT NULL DEFAULT 'client'"); } catch {}
try { db.exec("ALTER TABLE trade_history ADD COLUMN fee TEXT"); } catch {}
try { db.exec("ALTER TABLE trade_history ADD COLUMN proof_json TEXT"); } catch {}
// Dedup: trade_history.client_order_id was nullable + non-unique, so
// client-reported opens (order_id = tx_hash) and worker-recorded closes
// (order_id = 'closed_...') for the same underlying trade could both land,
// crediting gold twice. A partial UNIQUE index (NULLs allowed, dupes
// rejected) is idempotent on existing DBs and safe for any row that
// already has a client_order_id. Wrapped in try/catch so the migration
// is a no-op if the index already exists.
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_history_client_order_id ON trade_history(client_order_id) WHERE client_order_id IS NOT NULL");
} catch (e) {
  console.warn('[futures.db] dedup index migration warning:', e.message);
}
// Index for /claim-gold lookup — main server reads WHERE player_id=? AND dex=? AND id>? frequently.
try { db.exec("CREATE INDEX IF NOT EXISTS idx_trade_history_player_dex ON trade_history(player_id, dex, id)"); } catch {}
// Ostium closes inherit routing eligibility from the matching Open fill by
// trader + position id. Keep that lookup indexed as fill history grows.
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trade_history_ostium_position_route
    ON trade_history (
      lower(json_extract(proof_json, '$.fill.trader')),
      CAST(json_extract(proof_json, '$.fill.pid') AS TEXT),
      lower(json_extract(proof_json, '$.fill.action')),
      lower(json_extract(proof_json, '$.fill.builder'))
    )
    WHERE dex = 'ostium'
      AND status = 'filled'
      AND verified_source = 'ostium_api'
      AND json_valid(COALESCE(proof_json, ''))
  `);
} catch (e) {
  console.warn('[futures.db] Ostium position route index warning:', e.message);
}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_decibel_order_proofs_order ON decibel_order_proofs(order_id) WHERE order_id IS NOT NULL"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_decibel_order_proofs_client ON decibel_order_proofs(client_order_id) WHERE client_order_id IS NOT NULL"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_decibel_order_proofs_order_unique ON decibel_order_proofs(order_id) WHERE order_id IS NOT NULL"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_decibel_order_proofs_client_unique ON decibel_order_proofs(client_order_id) WHERE client_order_id IS NOT NULL"); } catch {}

// FK-mismatch migration: old deposits/trade_history rows reference
// wallets(player_id), but that column is no longer UNIQUE after we switched
// wallets PK to composite (player_id, dex). SQLite validates FKs lazily at
// prepare-time, so any statement against those tables errors with
// "foreign key mismatch" until the FK is stripped. Fix by rebuilding the
// tables without the FK clause.
function rebuildTableIfHasFK(tableName) {
  try {
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(tableName)?.sql || '';
    if (!sql.includes('REFERENCES wallets')) return; // already clean
    const newSql = sql.replace(/REFERENCES\s+wallets\s*\([^)]+\)/gi, '');
    db.exec('PRAGMA foreign_keys = OFF;');
    const rebuild = db.transaction(() => {
      db.exec(`ALTER TABLE ${tableName} RENAME TO ${tableName}_old_fk;`);
      db.exec(newSql);
      db.exec(`INSERT INTO ${tableName} SELECT * FROM ${tableName}_old_fk;`);
      db.exec(`DROP TABLE ${tableName}_old_fk;`);
    });
    rebuild();
    db.exec('PRAGMA foreign_keys = ON;');
    console.log(`[futures.db] Rebuilt ${tableName} without FK.`);
  } catch (e) {
    console.error(`[futures.db] FK rebuild for ${tableName} failed:`, e.message);
  }
}
rebuildTableIfHasFK('deposits');
rebuildTableIfHasFK('trade_history');

// ---------- Prepared Statements ----------

const stmts = {
  getWallet: db.prepare('SELECT * FROM wallets WHERE player_id = ? AND dex = ?'),
  getWalletByPubkey: db.prepare('SELECT * FROM wallets WHERE public_key = ?'),
  createWallet: db.prepare(`
    INSERT INTO wallets (player_id, player_name, public_key, secret_key, dex, chain)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  addDeposit: db.prepare(`
    INSERT INTO deposits (player_id, tx_signature, amount, token)
    VALUES (?, ?, ?, ?)
  `),
  getDeposits: db.prepare('SELECT id, tx_signature, amount, token, status, created_at FROM deposits WHERE player_id = ? ORDER BY created_at DESC LIMIT 50'),

  // INSERT OR IGNORE so a duplicate client_order_id (from the UNIQUE
  // partial index) silently drops instead of throwing. Prevents one
  // duplicate report from crashing the request handler.
  addTrade: db.prepare(`
    INSERT OR IGNORE INTO trade_history (player_id, symbol, side, order_type, amount, price, order_id, client_order_id, status, dex, notional_usd, verified_source, pnl, fee, proof_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `),
  recordDecibelOrderProof: db.prepare(`
    INSERT OR IGNORE INTO decibel_order_proofs (
      player_id, subaccount, order_id, client_order_id, symbol, side, order_type,
      market_name, market_addr, builder_addr, builder_fee_bps, tx_hash, proof_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateDecibelOrderProofByOrder: db.prepare(`
    UPDATE decibel_order_proofs SET
      player_id=?, subaccount=?,
      client_order_id=COALESCE(?, client_order_id),
      symbol=COALESCE(?, symbol),
      side=COALESCE(?, side),
      order_type=COALESCE(?, order_type),
      market_name=COALESCE(?, market_name),
      market_addr=COALESCE(?, market_addr),
      builder_addr=?,
      builder_fee_bps=?,
      tx_hash=COALESCE(?, tx_hash),
      proof_json=COALESCE(?, proof_json),
      updated_at=datetime('now')
    WHERE order_id=?
  `),
  updateDecibelOrderProofByClient: db.prepare(`
    UPDATE decibel_order_proofs SET
      player_id=?, subaccount=?,
      order_id=COALESCE(?, order_id),
      symbol=COALESCE(?, symbol),
      side=COALESCE(?, side),
      order_type=COALESCE(?, order_type),
      market_name=COALESCE(?, market_name),
      market_addr=COALESCE(?, market_addr),
      builder_addr=?,
      builder_fee_bps=?,
      tx_hash=COALESCE(?, tx_hash),
      proof_json=COALESCE(?, proof_json),
      updated_at=datetime('now')
    WHERE client_order_id=?
  `),
  getDecibelOrderProofByOrder: db.prepare('SELECT * FROM decibel_order_proofs WHERE order_id = ? LIMIT 1'),
  getDecibelOrderProofByClient: db.prepare('SELECT * FROM decibel_order_proofs WHERE client_order_id = ? LIMIT 1'),
  upgradeDecibelWorkerTradeByClient: db.prepare(`
    UPDATE trade_history
       SET verified_source='decibel_fill',
           proof_json=COALESCE(?, proof_json),
           fee=COALESCE(?, fee)
     WHERE dex='decibel'
       AND verified_source='worker'
       AND client_order_id=?
  `),
  upgradeDecibelWorkerTradeByOrder: db.prepare(`
    UPDATE trade_history
       SET verified_source='decibel_fill',
           proof_json=COALESCE(?, proof_json),
           fee=COALESCE(?, fee)
     WHERE dex='decibel'
       AND verified_source='worker'
       AND order_id=?
  `),
  upsertPendingGmtradeTradeReport: db.prepare(`
    INSERT INTO gmtrade_pending_trade_reports
      (signature, player_id, wallet, body_json, attempts, last_error, updated_at)
    VALUES (?, ?, ?, ?, 0, NULL, datetime('now'))
    ON CONFLICT(signature) DO UPDATE SET
      player_id = excluded.player_id,
      wallet = excluded.wallet,
      body_json = excluded.body_json,
      updated_at = datetime('now')
  `),
  listPendingGmtradeTradeReports: db.prepare(`
    SELECT signature, player_id, wallet, body_json, attempts, last_error, first_seen_at, updated_at
    FROM gmtrade_pending_trade_reports
    WHERE player_id = ?
    ORDER BY first_seen_at ASC
    LIMIT ?
  `),
  markPendingGmtradeTradeReportAttempt: db.prepare(`
    UPDATE gmtrade_pending_trade_reports
    SET attempts = attempts + 1,
        last_error = ?,
        updated_at = datetime('now')
    WHERE signature = ?
  `),
  deletePendingGmtradeTradeReport: db.prepare('DELETE FROM gmtrade_pending_trade_reports WHERE signature = ?'),
  getDexWorkerState: db.prepare('SELECT value FROM dex_worker_state WHERE dex = ? AND key = ?'),
  setDexWorkerState: db.prepare(`
    INSERT INTO dex_worker_state (dex, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(dex, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `),
  updateTradeStatus: db.prepare('UPDATE trade_history SET status = ?, pnl = ? WHERE id = ?'),
  getTrades: db.prepare('SELECT * FROM trade_history WHERE player_id = ? ORDER BY created_at DESC LIMIT 100'),
};

// ---------- Wallet Functions ----------
// secret_key is stored encrypted; getWallet transparently decrypts before
// handing the row to callers. Callers must never write secret_key directly.

function hydrateWallet(row) {
  if (!row) return row;
  try {
    return { ...row, secret_key: decryptSecret(row.secret_key) };
  } catch (e) {
    console.error('[futures.db] Failed to decrypt secret for', row.public_key, e.message);
    return null;
  }
}

function getWallet(playerId, dex = 'pacifica') {
  return hydrateWallet(stmts.getWallet.get(playerId, dex));
}

function createWallet(playerId, playerName, publicKey, secretKey, dex = 'pacifica', chain = 'solana') {
  stmts.createWallet.run(playerId, playerName, publicKey, encryptSecret(secretKey), dex, chain);
  return hydrateWallet(stmts.getWallet.get(playerId, dex));
}

function getOrCreateWallet(playerId, playerName, generateFn, dex = 'pacifica', chain = 'solana') {
  const existing = stmts.getWallet.get(playerId, dex);
  if (existing) return { wallet: hydrateWallet(existing), created: false };

  const { publicKey, secretKey } = generateFn();
  const wallet = createWallet(playerId, playerName, publicKey, secretKey, dex, chain);
  return { wallet, created: true };
}

// ---------- Deposit Functions ----------

function addDeposit(playerId, txSignature, amount, token = 'USDC') {
  stmts.addDeposit.run(playerId, txSignature, amount, token);
  return { success: true };
}

function getDeposits(playerId) {
  return stmts.getDeposits.all(playerId);
}

// ---------- Trade Functions ----------

function addTrade(playerId, { symbol, side, orderType, amount, price, orderId, clientOrderId, status = 'pending', dex = 'pacifica', notional_usd = 0, verifiedSource = 'server', pnl = null, fee = null, proofJson = null, createdAt = null }) {
  const info = stmts.addTrade.run(
    playerId, symbol, side, orderType,
    amount, price || null,
    orderId || null, clientOrderId || null,
    status, dex, notional_usd, verifiedSource,
    pnl != null ? String(pnl) : null,
    fee != null ? String(fee) : null,
    proofJson != null ? String(proofJson) : null,
    createdAt != null ? String(createdAt) : null
  );
  return { id: info.changes ? info.lastInsertRowid : null, changes: info.changes };
}

function getDexWorkerState(dex, key, fallback = null) {
  const row = stmts.getDexWorkerState.get(String(dex), String(key));
  return row?.value ?? fallback;
}

function setDexWorkerState(dex, key, value) {
  stmts.setDexWorkerState.run(String(dex), String(key), String(value));
  return { success: true };
}

function recordDecibelOrderProof({
  playerId,
  subaccount,
  orderId = null,
  clientOrderId = null,
  symbol = null,
  side = null,
  orderType = null,
  marketName = null,
  marketAddr = null,
  builderAddr,
  builderFeeBps,
  txHash = null,
  proofJson = null,
}) {
  if (!playerId || !subaccount || !builderAddr || !Number.isFinite(Number(builderFeeBps))) return { changes: 0 };
  const normalizedOrderId = orderId == null || orderId === '' ? null : String(orderId);
  const normalizedClientOrderId = clientOrderId == null || clientOrderId === '' ? null : String(clientOrderId);
  if (!normalizedOrderId && !normalizedClientOrderId) return { changes: 0 };
  const info = stmts.recordDecibelOrderProof.run(
    String(playerId),
    String(subaccount).toLowerCase(),
    normalizedOrderId,
    normalizedClientOrderId,
    symbol == null ? null : String(symbol),
    side == null ? null : String(side),
    orderType == null ? null : String(orderType),
    marketName == null ? null : String(marketName),
    marketAddr == null ? null : String(marketAddr).toLowerCase(),
    String(builderAddr).toLowerCase(),
    Number(builderFeeBps),
    txHash == null ? null : String(txHash),
    proofJson == null ? null : String(proofJson),
  );
  if (!info.changes) {
    let changes = 0;
    if (normalizedOrderId) {
      const update = stmts.updateDecibelOrderProofByOrder.run(
        String(playerId),
        String(subaccount).toLowerCase(),
        normalizedClientOrderId,
        symbol == null ? null : String(symbol),
        side == null ? null : String(side),
        orderType == null ? null : String(orderType),
        marketName == null ? null : String(marketName),
        marketAddr == null ? null : String(marketAddr).toLowerCase(),
        String(builderAddr).toLowerCase(),
        Number(builderFeeBps),
        txHash == null ? null : String(txHash),
        proofJson == null ? null : String(proofJson),
        normalizedOrderId,
      );
      changes += update.changes || 0;
    }
    if (normalizedClientOrderId) {
      const update = stmts.updateDecibelOrderProofByClient.run(
        String(playerId),
        String(subaccount).toLowerCase(),
        normalizedOrderId,
        symbol == null ? null : String(symbol),
        side == null ? null : String(side),
        orderType == null ? null : String(orderType),
        marketName == null ? null : String(marketName),
        marketAddr == null ? null : String(marketAddr).toLowerCase(),
        String(builderAddr).toLowerCase(),
        Number(builderFeeBps),
        txHash == null ? null : String(txHash),
        proofJson == null ? null : String(proofJson),
        normalizedClientOrderId,
      );
      changes += update.changes || 0;
    }
    return { changes };
  }
  return { changes: info.changes };
}

function getDecibelOrderProof({ orderId = null, clientOrderId = null } = {}) {
  const normalizedOrderId = orderId == null || orderId === '' ? null : String(orderId);
  const normalizedClientOrderId = clientOrderId == null || clientOrderId === '' ? null : String(clientOrderId);
  if (normalizedOrderId) {
    const row = stmts.getDecibelOrderProofByOrder.get(normalizedOrderId);
    if (row) return row;
  }
  if (normalizedClientOrderId) {
    const row = stmts.getDecibelOrderProofByClient.get(normalizedClientOrderId);
    if (row) return row;
  }
  return null;
}

function upgradeDecibelWorkerTradeByClient({ clientOrderId, proofJson = null, fee = null } = {}) {
  if (!clientOrderId) return { changes: 0 };
  const info = stmts.upgradeDecibelWorkerTradeByClient.run(
    proofJson == null ? null : String(proofJson),
    fee == null ? null : String(fee),
    String(clientOrderId),
  );
  return { changes: info.changes || 0 };
}

function upgradeDecibelWorkerTradeByOrder({ orderId, proofJson = null, fee = null } = {}) {
  if (!orderId) return { changes: 0 };
  const info = stmts.upgradeDecibelWorkerTradeByOrder.run(
    proofJson == null ? null : String(proofJson),
    fee == null ? null : String(fee),
    String(orderId),
  );
  return { changes: info.changes || 0 };
}

function getTrades(playerId) {
  return stmts.getTrades.all(playerId);
}

function upsertPendingGmtradeTradeReport({ playerId, wallet, signature, body }) {
  if (!playerId || !wallet || !signature) return { changes: 0 };
  const safeBody = body && typeof body === 'object' ? body : {};
  const info = stmts.upsertPendingGmtradeTradeReport.run(
    String(signature),
    String(playerId),
    String(wallet),
    JSON.stringify(safeBody),
  );
  return { changes: info.changes || 0 };
}

function listPendingGmtradeTradeReports(playerId, limit = 25) {
  if (!playerId) return [];
  const n = Math.max(1, Math.min(100, Number(limit) || 25));
  return stmts.listPendingGmtradeTradeReports.all(String(playerId), n);
}

function markPendingGmtradeTradeReportAttempt(signature, error = null) {
  if (!signature) return { changes: 0 };
  const info = stmts.markPendingGmtradeTradeReportAttempt.run(
    error == null ? null : String(error).slice(0, 500),
    String(signature),
  );
  return { changes: info.changes || 0 };
}

function deletePendingGmtradeTradeReport(signature) {
  if (!signature) return { changes: 0 };
  const info = stmts.deletePendingGmtradeTradeReport.run(String(signature));
  return { changes: info.changes || 0 };
}

// ---------- Exports ----------

module.exports = {
  db,
  getWallet,
  createWallet,
  getOrCreateWallet,
  addDeposit,
  getDeposits,
  addTrade,
  getDexWorkerState,
  setDexWorkerState,
  getTrades,
  upsertPendingGmtradeTradeReport,
  listPendingGmtradeTradeReports,
  markPendingGmtradeTradeReportAttempt,
  deletePendingGmtradeTradeReport,
  recordDecibelOrderProof,
  getDecibelOrderProof,
  upgradeDecibelWorkerTradeByClient,
  upgradeDecibelWorkerTradeByOrder,
};

// One-time encryption migration: any row where secret_key doesn't start with
// our ENC_MARKER is legacy plaintext — encrypt in place.
try {
  const legacy = db.prepare(`SELECT public_key, secret_key FROM wallets WHERE secret_key NOT LIKE '${ENC_MARKER}%'`).all();
  if (legacy.length > 0) {
    const update = db.prepare('UPDATE wallets SET secret_key = ? WHERE public_key = ?');
    const tx = db.transaction((rows) => {
      for (const r of rows) update.run(encryptSecret(r.secret_key), r.public_key);
    });
    tx(legacy);
    console.log(`[futures.db] Encrypted ${legacy.length} legacy wallet secrets.`);
  }
} catch (e) {
  console.error('[futures.db] Encryption migration failed:', e.message);
}
// (Note: trade_history + FK-mismatch migrations moved above prepared statements.)
