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

  CREATE TABLE IF NOT EXISTS client_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    dex         TEXT NOT NULL,
    player_id   TEXT,
    player_name TEXT,
    wallet      TEXT,
    trace       TEXT,
    event       TEXT NOT NULL,
    attempt     INTEGER NOT NULL DEFAULT 0,
    data_json   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gmtrade_pending_reports (
    signature   TEXT PRIMARY KEY,
    player_id   TEXT NOT NULL,
    wallet      TEXT,
    body_json   TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'pending',
    last_error  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
try { db.exec("CREATE INDEX IF NOT EXISTS idx_decibel_order_proofs_order ON decibel_order_proofs(order_id) WHERE order_id IS NOT NULL"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_decibel_order_proofs_client ON decibel_order_proofs(client_order_id) WHERE client_order_id IS NOT NULL"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_decibel_order_proofs_order_unique ON decibel_order_proofs(order_id) WHERE order_id IS NOT NULL"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_decibel_order_proofs_client_unique ON decibel_order_proofs(client_order_id) WHERE client_order_id IS NOT NULL"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_client_logs_dex_created ON client_logs(dex, created_at DESC, id DESC)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_client_logs_trace ON client_logs(trace) WHERE trace IS NOT NULL"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_gmtrade_pending_reports_player ON gmtrade_pending_reports(player_id, status, updated_at)"); } catch {}

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
    INSERT OR IGNORE INTO trade_history (player_id, symbol, side, order_type, amount, price, order_id, client_order_id, status, dex, notional_usd, verified_source, pnl, fee, proof_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  addClientLog: db.prepare(`
    INSERT INTO client_logs (dex, player_id, player_name, wallet, trace, event, attempt, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  upsertGmtradePendingReport: db.prepare(`
    INSERT INTO gmtrade_pending_reports (signature, player_id, wallet, body_json, attempts, status, last_error, updated_at)
    VALUES (?, ?, ?, ?, 0, 'pending', ?, datetime('now'))
    ON CONFLICT(signature) DO UPDATE SET
      player_id=excluded.player_id,
      wallet=excluded.wallet,
      body_json=excluded.body_json,
      status='pending',
      last_error=excluded.last_error,
      updated_at=datetime('now')
  `),
  markGmtradePendingReport: db.prepare(`
    UPDATE gmtrade_pending_reports
       SET attempts = attempts + 1,
           status = ?,
           last_error = ?,
           updated_at = datetime('now')
     WHERE signature = ?
  `),
  getGmtradePendingReports: db.prepare(`
    SELECT * FROM gmtrade_pending_reports
     WHERE player_id = ? AND status = 'pending'
     ORDER BY updated_at ASC
     LIMIT ?
  `),
  getTradeByClientOrderId: db.prepare(`
    SELECT id, player_id, dex, notional_usd, verified_source
      FROM trade_history
     WHERE client_order_id = ?
     LIMIT 1
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

function addTrade(playerId, { symbol, side, orderType, amount, price, orderId, clientOrderId, status = 'pending', dex = 'pacifica', notional_usd = 0, verifiedSource = 'server', pnl = null, fee = null, proofJson = null }) {
  const info = stmts.addTrade.run(
    playerId, symbol, side, orderType,
    amount, price || null,
    orderId || null, clientOrderId || null,
    status, dex, notional_usd, verifiedSource,
    pnl != null ? String(pnl) : null,
    fee != null ? String(fee) : null,
    proofJson != null ? String(proofJson) : null
  );
  return { id: info.changes ? info.lastInsertRowid : null, changes: info.changes };
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

function getTrades(playerId) {
  return stmts.getTrades.all(playerId);
}

function recordClientLog({ dex, playerId, playerName, wallet, trace, event, attempt, data }) {
  const safeDex = String(dex || '').toLowerCase().slice(0, 40) || 'unknown';
  const safeEvent = String(event || '').slice(0, 120) || 'unknown';
  let dataJson = null;
  try {
    dataJson = JSON.stringify(data && typeof data === 'object' ? data : {});
    if (dataJson.length > 20_000) dataJson = `${dataJson.slice(0, 20_000)}...`;
  } catch {
    dataJson = '{}';
  }
  const info = stmts.addClientLog.run(
    safeDex,
    playerId == null ? null : String(playerId),
    playerName == null ? null : String(playerName).slice(0, 120),
    wallet == null ? null : String(wallet).slice(0, 120),
    trace == null ? null : String(trace).slice(0, 120),
    safeEvent,
    Number(attempt || 0) || 0,
    dataJson,
  );
  return { changes: info.changes || 0, id: info.lastInsertRowid };
}

function upsertGmtradePendingReport({ signature, playerId, wallet, body, reason }) {
  const sig = String(signature || '').trim();
  if (!sig || !playerId) return { changes: 0 };
  let bodyJson = '{}';
  try {
    bodyJson = JSON.stringify(body && typeof body === 'object' ? body : {});
    if (bodyJson.length > 20_000) bodyJson = bodyJson.slice(0, 20_000);
  } catch {
    bodyJson = '{}';
  }
  const info = stmts.upsertGmtradePendingReport.run(
    sig,
    String(playerId),
    wallet == null ? null : String(wallet),
    bodyJson,
    reason == null ? null : String(reason).slice(0, 500),
  );
  return { changes: info.changes || 0 };
}

function markGmtradePendingReport(signature, status, error = null) {
  const sig = String(signature || '').trim();
  if (!sig) return { changes: 0 };
  const info = stmts.markGmtradePendingReport.run(
    String(status || 'pending'),
    error == null ? null : String(error).slice(0, 500),
    sig,
  );
  return { changes: info.changes || 0 };
}

function getGmtradePendingReports(playerId, limit = 25) {
  return stmts.getGmtradePendingReports.all(String(playerId), Math.max(1, Math.min(100, Number(limit) || 25)));
}

function getTradeByClientOrderId(clientOrderId) {
  return stmts.getTradeByClientOrderId.get(String(clientOrderId || ''));
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
  getTrades,
  recordDecibelOrderProof,
  getDecibelOrderProof,
  recordClientLog,
  upsertGmtradePendingReport,
  markGmtradePendingReport,
  getGmtradePendingReports,
  getTradeByClientOrderId,
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
