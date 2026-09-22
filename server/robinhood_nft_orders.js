'use strict';
const crypto = require('node:crypto');
const TOKEN = require('./robinhood_shop').TOKEN;
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic = address => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
const hex = n => `0x${BigInt(n).toString(16)}`;

// All money and supply mutations share the game DB transaction. Dependencies
// are explicit so crash/replay behavior can be exercised without a live wallet.
function createNftOrders({ db, rpc, prepare, reserve, release, complete, deliver, now = () => Math.floor(Date.now()/1000) }) {
  db.exec(`CREATE TABLE IF NOT EXISTS robinhood_nft_orders (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL, buyer TEXT NOT NULL,
    recipient TEXT NOT NULL, treasury TEXT NOT NULL, amount TEXT NOT NULL UNIQUE,
    start_block INTEGER NOT NULL, deadline INTEGER NOT NULL,
    reservation_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'awaiting_payment',
    payment_tx TEXT UNIQUE, asset TEXT, delivery_tx TEXT, signed_tx TEXT,
    last_valid_block INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, lease_until INTEGER NOT NULL DEFAULT 0
  ); CREATE INDEX IF NOT EXISTS rh_nft_pending ON robinhood_nft_orders(state, updated_at);`);
  if (!db.prepare('PRAGMA table_info(robinhood_nft_orders)').all().some(c => c.name === 'lease_token')) db.exec('ALTER TABLE robinhood_nft_orders ADD COLUMN lease_token TEXT');
  const get = id => db.prepare('SELECT * FROM robinhood_nft_orders WHERE id = ?').get(id);
  const publicOrder = row => row && ({ id: row.id, state: row.state, buyer: row.buyer, recipient: row.recipient,
    treasury: row.treasury, amount: row.amount, token: TOKEN, chainId: 4663, deadline: row.deadline,
    paymentTx: row.payment_tx, asset: row.asset, deliveryTx: row.delivery_tx,
    message: row.state === 'awaiting_payment' ? 'Confirm CLASH payment on Robinhood' : row.state === 'delivered' ? 'NFT delivered on Solana' : row.state === 'expired' ? 'Unpaid quote expired' : 'Payment received. NFT delivery is processing; do not pay again.' });
  async function quote(playerId, buyer, recipient) {
    const pending = db.prepare("SELECT * FROM robinhood_nft_orders WHERE player_id = ? AND state NOT IN ('delivered','expired') ORDER BY created_at DESC LIMIT 1").get(playerId);
    if (pending) return publicOrder(pending);
    const config = await prepare(buyer, recipient);
    const start = Number(await rpc('eth_blockNumber', []));
    if (!Number.isSafeInteger(start) || start < 1) throw new Error('Robinhood block unavailable');
    return db.transaction(() => {
      const again = db.prepare("SELECT * FROM robinhood_nft_orders WHERE player_id = ? AND state NOT IN ('delivered','expired') LIMIT 1").get(playerId);
      if (again) return publicOrder(again);
      if (db.prepare("SELECT 1 FROM robinhood_nft_orders WHERE (buyer=? OR recipient=?) AND state NOT IN ('delivered','expired') LIMIT 1").get(buyer.toLowerCase(),recipient)) throw new Error('This wallet already has an NFT order processing');
      const id = crypto.randomUUID();
      const reservationId = reserve(id, recipient);
      // Sub-pico-token salt identifies this exact order in transfer logs.
      const amount = (BigInt(config.amount) + BigInt(crypto.randomInt(1, 1_000_000_000))).toString();
      db.prepare(`INSERT INTO robinhood_nft_orders(id,player_id,buyer,recipient,treasury,amount,start_block,deadline,reservation_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,playerId,buyer.toLowerCase(),recipient,config.treasury.toLowerCase(),amount,start,now()+600,reservationId,now(),now());
      return publicOrder(get(id));
    })();
  }
  async function reconcilePayment(row, lease) {
    const chain = await rpc('eth_chainId', []);
    if (Number(chain) !== 4663) throw new Error('Wrong payment chain');
    const head = await rpc('eth_getBlockByNumber', ['latest', false]);
    if (!head) throw new Error('Payment history unavailable');
    // Never scan a partial range and interpret it as proof of no payment.
    let end = Number(head.number);
    if (!Number.isSafeInteger(end) || end < row.start_block) throw new Error('Payment history behind quote');
    if (Number(head.timestamp) > row.deadline+600) {
      let low = row.start_block, high = end;
      while (low < high) {
        const mid = Math.floor((low+high)/2);
        const block = await rpc('eth_getBlockByNumber',[hex(mid),false]);
        if (!block || !Number.isFinite(Number(block.timestamp))) throw new Error('Incomplete payment block history');
        if (Number(block.timestamp) <= row.deadline+600) low=mid+1; else high=mid;
      }
      end = low; // Include the first block after the grace window too.
    }
    const logs = [];
    for (let from = row.start_block; from <= end; from += 1000) {
      const batch = await rpc('eth_getLogs', [{ address: TOKEN, fromBlock: hex(from), toBlock: hex(Math.min(end, from+999)), topics: [TRANSFER, topic(row.buyer), topic(row.treasury)] }]);
      if (!Array.isArray(batch)) throw new Error('Incomplete payment history');
      logs.push(...batch);
    }
    for (const log of logs) {
      if (String(log.address).toLowerCase() !== TOKEN.toLowerCase() || log.topics?.length !== 3
        || log.topics[0] !== TRANSFER || log.topics[1]?.toLowerCase() !== topic(row.buyer)
        || log.topics[2]?.toLowerCase() !== topic(row.treasury)) continue;
      if (log.removed || BigInt(log.data || '0') !== BigInt(row.amount)) continue;
      const receipt = await rpc('eth_getTransactionReceipt', [log.transactionHash]);
      if (!receipt || receipt.status !== '0x1' || String(receipt.from).toLowerCase() !== row.buyer) continue;
      const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
      if (!block || block.hash !== receipt.blockHash || log.blockHash !== block.hash) throw new Error('Payment confirmation pending');
      if (Number(block.timestamp) > row.deadline + 600 || Number(block.timestamp) < row.created_at - 30) continue;
      // Owner-selected fast delivery policy: successful canonical receipt and
      // 12 successor blocks, not the much slower L1 finalization tag.
      const state = Number(head.number) < Number(receipt.blockNumber)+12 ? 'confirming' : 'paid';
      db.prepare("UPDATE robinhood_nft_orders SET state=?,payment_tx=?,updated_at=?,last_error=NULL WHERE id=? AND lease_token=? AND state IN ('awaiting_payment','confirming')")
        .run(state,String(log.transactionHash).toLowerCase(),now(),row.id,lease);
      return;
    }
    if (now() <= row.deadline+600) return;
    const finalized = await rpc('eth_getBlockByNumber', ['finalized',false]);
    if (finalized && Number(finalized.timestamp) > row.deadline + 600 && Number(finalized.number) >= row.start_block) {
      db.transaction(() => {
        const changed = db.prepare("UPDATE robinhood_nft_orders SET state='expired',updated_at=? WHERE id=? AND lease_token=? AND state='awaiting_payment' AND payment_tx IS NULL").run(now(),row.id,lease);
        if (changed.changes) release(row.reservation_id);
      })();
    }
  }
  async function process(id) {
    const lease = crypto.randomUUID();
    const locked = db.prepare("UPDATE robinhood_nft_orders SET lease_until=?,lease_token=?,attempts=attempts+1 WHERE id=? AND lease_until<? AND state NOT IN ('delivered','expired')").run(now()+180, lease, id, now());
    if (!locked.changes) return;
    try {
      let row = get(id);
      if (row.state === 'awaiting_payment' || row.state === 'confirming') await reconcilePayment(row, lease);
      row = get(id);
      if (row.lease_token !== lease) return;
      if (row.state !== 'paid' && row.state !== 'delivering') return;
      const result = await deliver(row, signed => {
        const changed = db.prepare("UPDATE robinhood_nft_orders SET state='delivering',asset=?,delivery_tx=?,signed_tx=?,last_valid_block=?,updated_at=? WHERE id=? AND lease_token=? AND state IN ('paid','delivering')")
          .run(signed.asset,signed.signature,signed.raw,signed.lastValidBlockHeight,now(),id,lease);
        if (!changed.changes) throw new Error('NFT worker lease changed; retry deferred');
      });
      if (!result?.confirmed) return;
      db.transaction(() => {
        const current = get(id);
        if (current.lease_token !== lease || !['paid','delivering'].includes(current.state)) return;
        complete(current, result);
        db.prepare("UPDATE robinhood_nft_orders SET state='delivered',asset=?,delivery_tx=?,signed_tx=NULL,last_error=NULL,updated_at=? WHERE id=?")
          .run(result.asset,result.signature,now(),id);
      })();
    } catch (error) {
      // Operational detail stays server-side; never serialize RPC URLs/keys.
      const safe = String(error?.message || 'Processing failed').replace(/https?:\S+/g,'[RPC]').slice(0,180);
      db.prepare('UPDATE robinhood_nft_orders SET last_error=?,updated_at=? WHERE id=? AND lease_token=?').run(safe,now(),id,lease);
      console.warn('[rh-nft] processing deferred', id, safe);
    } finally { db.prepare('UPDATE robinhood_nft_orders SET lease_until=0,lease_token=NULL,updated_at=? WHERE id=? AND lease_token=?').run(now(),id,lease); }
  }
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const rows = db.prepare("SELECT id FROM robinhood_nft_orders WHERE state NOT IN ('delivered','expired') AND lease_until<? ORDER BY updated_at LIMIT 5").all(now());
      for (const row of rows) await process(row.id);
    } finally { running = false; }
  }
  return { quote, tick, process, get, publicOrder };
}
module.exports = { createNftOrders };
