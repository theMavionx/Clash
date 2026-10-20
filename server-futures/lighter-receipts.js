// Server-side receipts for Lighter / Robinhood Lighter orders that Clash itself
// signed and submitted. They are the only evidence for the non-builder
// `<dex>_terminal` verified source: a venue fill counts only when it matches a
// receipt our server wrote for the importing player's account. Client-supplied
// fills are never accepted.

const TERMINAL_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 2 * 60 * 1000;
const PRICE_TOLERANCE = 1e-6;
const SIZE_TOLERANCE = 1e-9;

function ensureLighterReceiptSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lighter_order_receipts (
      dex                TEXT NOT NULL,
      account_index      INTEGER NOT NULL,
      client_order_index TEXT NOT NULL,
      api_key_index      INTEGER NOT NULL,
      player_id          TEXT NOT NULL,
      market_id          INTEGER NOT NULL,
      symbol             TEXT NOT NULL,
      is_ask             INTEGER NOT NULL,
      base_amount        TEXT NOT NULL,
      size               TEXT NOT NULL,
      price              TEXT NOT NULL,
      order_type         TEXT NOT NULL,
      reduce_only        INTEGER NOT NULL DEFAULT 0,
      trigger_price      TEXT,
      group_role         TEXT NOT NULL DEFAULT 'single',
      builder_applied    INTEGER NOT NULL DEFAULT 0,
      integrator_account_index INTEGER NOT NULL DEFAULT 0,
      status             TEXT NOT NULL DEFAULT 'pending',
      tx_hash            TEXT,
      response_json      TEXT,
      created_at_ms      INTEGER NOT NULL,
      updated_at_ms      INTEGER NOT NULL,
      PRIMARY KEY (dex, account_index, client_order_index)
    );
    CREATE INDEX IF NOT EXISTS idx_lighter_receipts_player
      ON lighter_order_receipts(player_id, dex, account_index, created_at_ms);
    -- One row per venue fill credited through a receipt: idempotent imports and
    -- a cumulative size cap per receipt.
    CREATE TABLE IF NOT EXISTS lighter_receipt_fills (
      dex                TEXT NOT NULL,
      trade_id           TEXT NOT NULL,
      account_index      INTEGER NOT NULL,
      client_order_index TEXT NOT NULL,
      player_id          TEXT NOT NULL,
      size               TEXT NOT NULL,
      created_at_ms      INTEGER NOT NULL,
      PRIMARY KEY (dex, trade_id, account_index)
    );
    CREATE INDEX IF NOT EXISTS idx_lighter_receipt_fills_receipt
      ON lighter_receipt_fills(dex, account_index, client_order_index);
  `);
}

const schemaReady = new WeakSet();
function ready(db) {
  if (!schemaReady.has(db)) { ensureLighterReceiptSchema(db); schemaReady.add(db); }
  return db;
}

/** Written BEFORE the signer sends; a clash on the key refuses the order (no ambiguous evidence). */
function recordPendingReceipts(db, receipts, now = Date.now()) {
  ready(db);
  const insert = db.prepare(`
    INSERT INTO lighter_order_receipts (dex, account_index, client_order_index, api_key_index, player_id,
      market_id, symbol, is_ask, base_amount, size, price, order_type, reduce_only, trigger_price, group_role,
      builder_applied, integrator_account_index, status, created_at_ms, updated_at_ms)
    VALUES (@dex, @account_index, @client_order_index, @api_key_index, @player_id, @market_id, @symbol, @is_ask,
      @base_amount, @size, @price, @order_type, @reduce_only, @trigger_price, @group_role, @builder_applied,
      @integrator_account_index, 'pending', @now, @now)
  `);
  db.transaction(rows => {
    for (const r of rows) {
      insert.run({
        dex: String(r.dex),
        account_index: Number(r.accountIndex),
        client_order_index: String(r.clientOrderIndex),
        api_key_index: Number(r.apiKeyIndex),
        player_id: String(r.playerId),
        market_id: Number(r.marketId),
        symbol: String(r.symbol),
        is_ask: r.isAsk ? 1 : 0,
        base_amount: String(r.baseAmount),
        size: String(r.size),
        price: String(r.price),
        order_type: String(r.orderType),
        reduce_only: r.reduceOnly ? 1 : 0,
        trigger_price: r.triggerPrice != null ? String(r.triggerPrice) : null,
        group_role: String(r.groupRole || 'single'),
        builder_applied: r.builderApplied ? 1 : 0,
        integrator_account_index: Number(r.integratorAccountIndex || 0),
        now,
      });
    }
  })(receipts);
}

function finalizeReceipts(db, { dex, accountIndex, clientOrderIndexes, status, txHash = null, response = null }, now = Date.now()) {
  ready(db);
  const update = db.prepare(`
    UPDATE lighter_order_receipts SET status = ?, tx_hash = COALESCE(?, tx_hash), response_json = ?, updated_at_ms = ?
    WHERE dex = ? AND account_index = ? AND client_order_index = ? AND status = 'pending'
  `);
  const body = response == null ? null : JSON.stringify(response).slice(0, 4000);
  db.transaction(() => {
    for (const id of clientOrderIndexes) update.run(status, txHash, body, now, String(dex), Number(accountIndex), String(id));
  })();
}

function getReceipt(db, dex, accountIndex, clientOrderIndex) {
  ready(db);
  return db.prepare(`SELECT * FROM lighter_order_receipts WHERE dex = ? AND account_index = ? AND client_order_index = ?`)
    .get(String(dex), Number(accountIndex), String(clientOrderIndex)) || null;
}

function matchedSize(db, dex, accountIndex, clientOrderIndex, excludeTradeId = null) {
  ready(db);
  const rows = db.prepare(`SELECT trade_id, size FROM lighter_receipt_fills WHERE dex = ? AND account_index = ? AND client_order_index = ?`)
    .all(String(dex), Number(accountIndex), String(clientOrderIndex));
  return rows.filter(r => r.trade_id !== excludeTradeId).reduce((sum, r) => sum + Number(r.size || 0), 0);
}

function tradeTimestampMs(trade) {
  const raw = Number(trade?.timestamp ?? trade?.transaction_time ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw > 1e15) return Math.floor(raw / 1000); // microseconds
  return raw < 1e12 ? raw * 1000 : raw;
}

/**
 * Pure matcher: does this venue fill belong to this receipt for this player/account?
 * Returns { ok: true, proof } or { ok: false, reason }.
 */
function matchFillToReceipt({ receipt, trade, accountIndex, playerId, alreadyMatched = 0 }) {
  const account = Number(accountIndex);
  const isAsk = Number(trade?.ask_account_id) === account;
  const isBid = Number(trade?.bid_account_id) === account;
  if (!isAsk && !isBid) return { ok: false, reason: 'foreign_account' };
  if (isAsk && isBid) return { ok: false, reason: 'self_trade' };
  if (!receipt) return { ok: false, reason: 'no_receipt' };
  if (String(receipt.player_id) !== String(playerId)) return { ok: false, reason: 'foreign_player' };
  if (Number(receipt.account_index) !== account) return { ok: false, reason: 'foreign_account' };
  if (receipt.status !== 'submitted') return { ok: false, reason: 'receipt_not_submitted' };
  if (Number(receipt.market_id) !== Number(trade?.market_id)) return { ok: false, reason: 'market_mismatch' };
  if (Boolean(receipt.is_ask) !== isAsk) return { ok: false, reason: 'side_mismatch' };
  const price = Number(trade?.price);
  const limit = Number(receipt.price);
  if (!(price > 0) || !(limit > 0)) return { ok: false, reason: 'price_missing' };
  if (isAsk ? price < limit * (1 - PRICE_TOLERANCE) : price > limit * (1 + PRICE_TOLERANCE)) {
    return { ok: false, reason: 'price_outside_limit' };
  }
  const size = Number(trade?.size);
  const cap = Number(receipt.size);
  if (!(size > 0) || !(cap > 0)) return { ok: false, reason: 'size_missing' };
  if (alreadyMatched + size > cap * (1 + SIZE_TOLERANCE) + SIZE_TOLERANCE) return { ok: false, reason: 'size_exceeds_receipt' };
  const at = tradeTimestampMs(trade);
  const created = Number(receipt.created_at_ms);
  if (!at || at < created - CLOCK_SKEW_MS || at > created + TERMINAL_MATCH_WINDOW_MS) {
    return { ok: false, reason: 'outside_time_window' };
  }
  const takerTx = receipt.tx_hash && String(trade?.tx_hash || '').toLowerCase() === String(receipt.tx_hash).toLowerCase();
  return {
    ok: true,
    proof: {
      match: takerTx ? 'tx_hash_and_client_order_index' : 'client_order_index',
      receipt: {
        dex: receipt.dex,
        account_index: Number(receipt.account_index),
        api_key_index: Number(receipt.api_key_index),
        client_order_index: String(receipt.client_order_index),
        market_id: Number(receipt.market_id),
        symbol: receipt.symbol,
        is_ask: Boolean(receipt.is_ask),
        size: receipt.size,
        price: receipt.price,
        order_type: receipt.order_type,
        group_role: receipt.group_role,
        tx_hash: receipt.tx_hash || null,
        builder_applied: Boolean(receipt.builder_applied),
        created_at_ms: created,
      },
    },
  };
}

/** Looks up the receipt for our side of the fill and checks it. */
function matchFill(db, { dex, trade, accountIndex, playerId }) {
  const account = Number(accountIndex);
  const isAsk = Number(trade?.ask_account_id) === account;
  const clientId = isAsk
    ? (trade?.ask_client_id_str ?? trade?.ask_client_id)
    : (trade?.bid_client_id_str ?? trade?.bid_client_id);
  const tradeId = String(trade?.trade_id_str ?? trade?.trade_id ?? '');
  if (!tradeId) return { ok: false, reason: 'trade_id_missing' };
  const receipt = clientId == null || String(clientId) === '' || String(clientId) === '0'
    ? null : getReceipt(db, dex, account, clientId);
  const alreadyMatched = receipt ? matchedSize(db, dex, account, receipt.client_order_index, tradeId) : 0;
  const result = matchFillToReceipt({ receipt, trade, accountIndex: account, playerId, alreadyMatched });
  return result.ok ? { ...result, tradeId, receipt } : result;
}

/** Records the credited fill (idempotent). Returns true when newly recorded. */
function recordReceiptFill(db, { dex, tradeId, accountIndex, receipt, playerId, size }, now = Date.now()) {
  ready(db);
  const info = db.prepare(`INSERT OR IGNORE INTO lighter_receipt_fills
    (dex, trade_id, account_index, client_order_index, player_id, size, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(String(dex), String(tradeId), Number(accountIndex), String(receipt.client_order_index), String(playerId), String(size), now);
  return info.changes > 0;
}

module.exports = {
  ensureLighterReceiptSchema,
  recordPendingReceipts,
  finalizeReceipts,
  getReceipt,
  matchFill,
  matchFillToReceipt,
  recordReceiptFill,
  TERMINAL_MATCH_WINDOW_MS,
};
