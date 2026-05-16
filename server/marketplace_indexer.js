// Marketplace event indexer.
//
// Polls the V3 marketplace contract on Base (and any other configured chain)
// for Listed / Cancelled / Sold events, applies them to the local SQLite
// state, and stores a full audit log.
//
// Lifecycle:
//   - startMarketplaceIndexer(opts) — kicks off the poll loop in the
//     background. Idempotent: returns the existing handle if already running.
//   - stopMarketplaceIndexer()    — sets a stop flag; loop exits on next tick.
//
// Resilience:
//   - Each iteration walks last_indexed_block → head in 4000-block windows
//     (Base RPC caps eth_getLogs at 10k).
//   - Reorg protection: we lag `CONFIRMATION_DEPTH` blocks behind head so a
//     reorg can't invalidate already-indexed state. With Base's <1s soft-
//     finality + ~2s block time, 10 blocks (~20s) is conservative.
//   - All writes are inside a single SQLite transaction per window so a
//     crash mid-batch never half-applies events.
//   - On any RPC error we log + bump errors_total and retry next tick.
//
// Idempotency: `marketplace_events` has a UNIQUE(chain, tx_hash, log_index)
// constraint. Re-running over the same block range is a no-op.

const path = require('node:path');
const fs = require('node:fs');

const NFT_ROOT = path.resolve(__dirname, '..', 'nft');

// Topic hashes — derived once at module load via viem's keccak256.
let _topics = null;
async function topics() {
  if (_topics) return _topics;
  const { keccak256, toBytes } = await import('viem');
  const h = (sig) => keccak256(toBytes(sig));
  _topics = {
    Listed:    h('Listed(uint256,address,address,uint256,uint64)'),
    Cancelled: h('Cancelled(uint256,address)'),
    Sold:      h('Sold(uint256,address,address,address,uint256,address,uint256)'),
  };
  return _topics;
}

// Lazy-loaded so unit tests can stub viem.
async function publicClient(chainKey) {
  const { createPublicClient, http, defineChain } = await import('viem');
  const chains = await import('viem/chains');
  const monad = defineChain({
    id: 143, name: 'Monad',
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  });
  const map = {
    base:     { viem: chains.base,     defaultRpc: 'https://mainnet.base.org' },
    arbitrum: { viem: chains.arbitrum, defaultRpc: 'https://arb1.arbitrum.io/rpc' },
    monad:    { viem: monad,           defaultRpc: 'https://rpc.monad.xyz' },
  };
  const spec = map[chainKey];
  if (!spec) throw new Error(`Unsupported chain ${chainKey}`);
  const rpc = process.env[`NFT_${chainKey.toUpperCase()}_RPC_URL`]
    || process.env[`${chainKey.toUpperCase()}_RPC_URL`]
    || spec.defaultRpc;
  return createPublicClient({ chain: spec.viem, transport: http(rpc) });
}

function readMarketplaceDeployment(chainKey) {
  const p = path.join(NFT_ROOT, 'deployments', `${chainKey}-marketplace-mainnet.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// One handle per (chain) is kept here so callers calling start*() twice
// don't end up with two pollers writing the same rows.
const _handles = new Map();

// ── ABI-less log decoder. The signatures are stable so we slice the data
//    payload by 32-byte slots, which is faster + dep-free.
function hexSlot(hex, i)      { return '0x' + hex.replace(/^0x/, '').slice(i * 64, (i + 1) * 64); }
function topicAddr(topic)     { return '0x' + topic.slice(26); }
function topicUint(topic)     { return BigInt(topic).toString(); }
function dataAddr(hex, i)     { return topicAddr(hexSlot(hex, i)); }
function dataUint(hex, i)     { return BigInt(hexSlot(hex, i)).toString(); }

// Per-chain RPC quirks. eth_getLogs window size varies wildly between
// providers; lookback is measured in blocks (deeper for chains with longer
// block times, since wall-clock recency matters more than block count).
const CHAIN_TUNING = {
  // Base: Alchemy/standard public RPCs allow 10k blocks per getLogs.
  base:     { windowSize: 4_000,  pollIntervalMs: 12_000, lookbackBlocks:  216_000 },   // ~5d at 2s blocks
  // Arbitrum: 10k blocks too, but blocks are ~0.25s.
  arbitrum: { windowSize: 4_000,  pollIntervalMs: 12_000, lookbackBlocks: 2_000_000 },  // ~5d at 0.25s
  // Monad: STRICT 100-block limit on rpc.monad.xyz. Poll faster + multiple
  // windows per tick so we don't fall behind on a ~0.5s-block chain.
  monad:    { windowSize: 100,    pollIntervalMs: 4_000,  lookbackBlocks: 50_000 },     // ~7h at 0.5s
};

async function startMarketplaceIndexer({
  chain = 'base',
  startBlock = null,        // override; otherwise resume from state row or contract deploy
  pollIntervalMs,
  windowSize,
  confirmationDepth = 10,
  lookbackBlocks,
} = {}) {
  const tuning = CHAIN_TUNING[chain] || CHAIN_TUNING.base;
  if (pollIntervalMs === undefined) pollIntervalMs = tuning.pollIntervalMs;
  if (windowSize === undefined)     windowSize     = tuning.windowSize;
  if (lookbackBlocks === undefined) lookbackBlocks = tuning.lookbackBlocks;
  if (_handles.has(chain)) return _handles.get(chain);

  const deployment = readMarketplaceDeployment(chain);
  if (!deployment?.marketplace) {
    console.warn(`[marketplace-indexer] ${chain}: no deployment, skipping`);
    return null;
  }

  // Lazy SQLite handle so the indexer can be imported even if db.js fails.
  const { db } = require('./db');
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO marketplace_events
      (chain, event_type, token_id, block_number, log_index, tx_hash, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertListed = db.prepare(`
    INSERT INTO marketplace_listings
      (chain, token_id, seller, payment_token, price_wei, created_at, expires_at,
       active, listed_block, listed_tx, cancelled_block, cancelled_tx,
       sold_block, sold_tx, buyer, sold_price_wei)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT(chain, token_id) DO UPDATE SET
      seller         = excluded.seller,
      payment_token  = excluded.payment_token,
      price_wei      = excluded.price_wei,
      created_at     = excluded.created_at,
      expires_at     = excluded.expires_at,
      active         = 1,
      listed_block   = excluded.listed_block,
      listed_tx      = excluded.listed_tx,
      cancelled_block = NULL,
      cancelled_tx   = NULL,
      sold_block     = NULL,
      sold_tx        = NULL,
      buyer          = NULL,
      sold_price_wei = NULL
  `);
  const markCancelled = db.prepare(`
    UPDATE marketplace_listings
       SET active = 0, cancelled_block = ?, cancelled_tx = ?
     WHERE chain = ? AND token_id = ?
  `);
  const markSold = db.prepare(`
    UPDATE marketplace_listings
       SET active = 0, sold_block = ?, sold_tx = ?, buyer = ?, sold_price_wei = ?
     WHERE chain = ? AND token_id = ?
  `);
  const upsertState = db.prepare(`
    INSERT INTO marketplace_indexer_state (chain, last_indexed_block, logs_processed)
    VALUES (?, ?, ?)
    ON CONFLICT(chain) DO UPDATE SET
      last_indexed_block = excluded.last_indexed_block,
      last_indexed_at    = datetime('now'),
      logs_processed     = marketplace_indexer_state.logs_processed + excluded.logs_processed
  `);
  const bumpError = db.prepare(`
    INSERT INTO marketplace_indexer_state (chain, last_indexed_block, errors_total, last_error)
    VALUES (?, COALESCE((SELECT last_indexed_block FROM marketplace_indexer_state WHERE chain = ?), 0), 1, ?)
    ON CONFLICT(chain) DO UPDATE SET
      errors_total = marketplace_indexer_state.errors_total + 1,
      last_error   = excluded.last_error,
      last_indexed_at = datetime('now')
  `);
  const getState = db.prepare(`SELECT * FROM marketplace_indexer_state WHERE chain = ?`);

  const TOPICS = await topics();
  const client = await publicClient(chain);
  const contractAddr = deployment.marketplace.toLowerCase();

  const handle = {
    chain,
    contract: deployment.marketplace,
    running: true,
    stop: false,
    startedAt: new Date().toISOString(),
    lastTickAt: null,
    consecErrors: 0,
  };

  function applyLog(log) {
    const topic0   = log.topics[0];
    const blockNum = Number(log.blockNumber);
    const logIdx   = Number(log.logIndex);

    if (topic0 === TOPICS.Listed) {
      const tokenId      = topicUint(log.topics[1]);
      const seller       = topicAddr(log.topics[2]);
      const paymentToken = dataAddr(log.data, 0);
      const priceWei     = dataUint(log.data, 1);
      const expiresAt    = Number(dataUint(log.data, 2));
      insertEvent.run(chain, 'Listed', tokenId, blockNum, logIdx, log.transactionHash,
        JSON.stringify({ seller, paymentToken, priceWei, expiresAt }));
      upsertListed.run(chain, tokenId, seller, paymentToken, priceWei,
        blockNum, expiresAt, blockNum, log.transactionHash);
      return;
    }
    if (topic0 === TOPICS.Cancelled) {
      const tokenId = topicUint(log.topics[1]);
      insertEvent.run(chain, 'Cancelled', tokenId, blockNum, logIdx, log.transactionHash,
        JSON.stringify({ seller: topicAddr(log.topics[2]) }));
      markCancelled.run(blockNum, log.transactionHash, chain, tokenId);
      return;
    }
    if (topic0 === TOPICS.Sold) {
      const tokenId      = topicUint(log.topics[1]);
      const buyer        = topicAddr(log.topics[2]);
      const seller       = topicAddr(log.topics[3]);
      const paymentToken = dataAddr(log.data, 0);
      const priceWei     = dataUint(log.data, 1);
      const royaltyRecv  = dataAddr(log.data, 2);
      const royaltyAmt   = dataUint(log.data, 3);
      insertEvent.run(chain, 'Sold', tokenId, blockNum, logIdx, log.transactionHash,
        JSON.stringify({ buyer, seller, paymentToken, priceWei, royaltyReceiver: royaltyRecv, royaltyAmount: royaltyAmt }));
      markSold.run(blockNum, log.transactionHash, buyer, priceWei, chain, tokenId);
      return;
    }
    // Unknown event (config / admin events that share the contract address —
    // AcceptedPaymentTokenUpdated, TreasuryUpdated, etc.). Stored in the audit
    // table with token_id='0' since they're not tied to any listing.
    insertEvent.run(chain, 'Unknown', '0', blockNum, logIdx, log.transactionHash,
      JSON.stringify({ topic0, topics: log.topics, data: log.data }));
  }

  async function tick() {
    if (handle.stop) return;
    handle.lastTickAt = new Date().toISOString();
    try {
      const head = await client.getBlockNumber();
      const safeHead = head - BigInt(confirmationDepth);

      let from;
      const state = getState.get(chain);
      if (state?.last_indexed_block) from = BigInt(state.last_indexed_block) + 1n;
      else if (startBlock !== null) from = BigInt(startBlock);
      else {
        // First run + no override: limit initial lookback per chain so we don't
        // walk millions of blocks of empty windows on slow RPCs.
        const lookback = BigInt(lookbackBlocks);
        from = head > lookback ? head - lookback : 0n;
      }
      if (from > safeHead) return;   // nothing safe to index yet

      while (!handle.stop && from <= safeHead) {
        const to = from + BigInt(windowSize) - 1n > safeHead ? safeHead : from + BigInt(windowSize) - 1n;
        const logs = await client.getLogs({
          address: contractAddr,
          fromBlock: from, toBlock: to,
          // No topic filter: we want every Listed/Cancelled/Sold + audit
          // anything else under the contract.
        });
        if (logs.length > 0) {
          const tx = db.transaction((rows) => { for (const l of rows) applyLog(l); });
          tx(logs);
        }
        upsertState.run(chain, Number(to), logs.length);
        from = to + 1n;
      }
      handle.consecErrors = 0;
    } catch (err) {
      handle.consecErrors += 1;
      const msg = String(err?.message || err).slice(0, 200);
      bumpError.run(chain, chain, msg);
      console.warn(`[marketplace-indexer] ${chain} error #${handle.consecErrors}: ${msg}`);
      if (handle.consecErrors <= 2) {
        // Surface the full stack the first couple of times so we can debug
        // bigint / shape issues that the short message hides.
        console.warn(err?.stack || err);
      }
    }
  }

  // Initial run immediately, then on interval.
  (async () => {
    while (!handle.stop) {
      await tick();
      if (handle.stop) break;
      // Back-off on persistent errors to spare the RPC.
      const delay = handle.consecErrors > 3 ? pollIntervalMs * 4 : pollIntervalMs;
      await new Promise((r) => setTimeout(r, delay));
    }
    handle.running = false;
  })();

  _handles.set(chain, handle);
  return handle;
}

function stopMarketplaceIndexer(chain) {
  if (chain) {
    const h = _handles.get(chain);
    if (h) h.stop = true;
    _handles.delete(chain);
    return;
  }
  for (const h of _handles.values()) h.stop = true;
  _handles.clear();
}

function getIndexerStatus() {
  const { db } = require('./db');
  const rows = db.prepare('SELECT * FROM marketplace_indexer_state').all();
  return rows.map((r) => ({
    chain: r.chain,
    lastIndexedBlock: r.last_indexed_block,
    lastIndexedAt: r.last_indexed_at,
    logsProcessed: r.logs_processed,
    errorsTotal: r.errors_total,
    lastError: r.last_error,
    running: _handles.has(r.chain) && !_handles.get(r.chain).stop,
  }));
}

module.exports = {
  startMarketplaceIndexer,
  stopMarketplaceIndexer,
  getIndexerStatus,
};
