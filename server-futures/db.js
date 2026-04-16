const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'futures.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

function getWallet(playerId, dex = 'pacifica') {
  return stmts.getWallet.get(playerId, dex);
}

function createWallet(playerId, playerName, publicKey, secretKey, dex = 'pacifica', chain = 'solana') {
  stmts.createWallet.run(playerId, playerName, publicKey, secretKey, dex, chain);
  return stmts.getWallet.get(playerId, dex);
}

function getOrCreateWallet(playerId, playerName, generateFn, dex = 'pacifica', chain = 'solana') {
  let wallet = stmts.getWallet.get(playerId, dex);
  if (wallet) return { wallet, created: false };

  const { publicKey, secretKey } = generateFn();
  wallet = createWallet(playerId, playerName, publicKey, secretKey, dex, chain);
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
