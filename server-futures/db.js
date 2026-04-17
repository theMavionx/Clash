const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = path.join(__dirname, 'futures.db');
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
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CLASH_WALLET_ENCRYPTION_KEY not set in production');
  }
  // Dev fallback — NOT secure, but keeps local runs unblocked.
  return crypto.createHash('sha256').update('clash-dev-fallback').digest();
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
  if (!stored.startsWith(ENC_MARKER)) return stored; // legacy plaintext row
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
    player_id    TEXT NOT NULL REFERENCES wallets(player_id),
    tx_signature TEXT NOT NULL UNIQUE,
    amount       REAL NOT NULL,
    token        TEXT NOT NULL DEFAULT 'USDC',
    status       TEXT NOT NULL DEFAULT 'confirmed',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trade_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id      TEXT NOT NULL REFERENCES wallets(player_id),
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
`);

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

  addTrade: db.prepare(`
    INSERT INTO trade_history (player_id, symbol, side, order_type, amount, price, order_id, client_order_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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

function addTrade(playerId, { symbol, side, orderType, amount, price, orderId, clientOrderId, status = 'pending' }) {
  const info = stmts.addTrade.run(playerId, symbol, side, orderType, amount, price || null, orderId || null, clientOrderId || null, status);
  return { id: info.lastInsertRowid };
}

function getTrades(playerId) {
  return stmts.getTrades.all(playerId);
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
};

// Migrate existing wallets table if dex/chain columns are missing
try {
  const cols = db.prepare("PRAGMA table_info(wallets)").all().map(c => c.name);
  if (!cols.includes('dex')) {
    db.exec("ALTER TABLE wallets ADD COLUMN dex TEXT NOT NULL DEFAULT 'pacifica'");
  }
  if (!cols.includes('chain')) {
    db.exec("ALTER TABLE wallets ADD COLUMN chain TEXT NOT NULL DEFAULT 'solana'");
  }
} catch (e) {
  // Columns may already exist or table was freshly created with them
}

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
