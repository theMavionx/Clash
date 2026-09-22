'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-leverup-rewards-'));
process.env.CLASH_FUTURES_DB = path.join(tempDir, 'futures.db');
process.env.NODE_ENV = 'test';
process.env.LEVERUP_BROKER_ID = '2';
process.env.LEVERUP_BROKER_RECEIVER = `0x${'b3'.repeat(20)}`;

const db = require('./db');
const leverup = require('./leverup');

const wallet = `0x${'11'.repeat(20)}`;
const otherWallet = `0x${'22'.repeat(20)}`;
const brokerReceiver = process.env.LEVERUP_BROKER_RECEIVER.toLowerCase();
const hash = byte => `0x${byte.repeat(32)}`;
const one = '1000000000000000000';
const price = value => `${BigInt(value) * 10n ** 18n}`;
const qty = value => `${BigInt(value) * 10n ** 10n}`;

function recordIntent(label, {
  status = 'executed_success',
  txHash = hash(label),
  rewardEligible = true,
  playerId = 'player-1',
  owner = wallet,
} = {}) {
  const intentHash = hash(`${Number.parseInt(label, 16) + 64}`.slice(-2));
  const inserted = db.recordLeverupIntentProof({
    intentHash,
    playerId,
    wallet: owner,
    action: 0,
    nonce: '1780000000000',
    brokerId: rewardEligible ? 2 : 0,
    brokerReceiver: rewardEligible ? brokerReceiver : null,
    rewardEligible,
    proofJson: {
      version: 'leverup_v2',
      action: 0,
      nonce: '1780000000000',
      broker_id: rewardEligible ? 2 : 0,
      reward_eligible: rewardEligible,
    },
  });
  assert.equal(inserted.conflict, false);
  if (status !== 'submitted') {
    db.updateLeverupIntentStatus({
      intentHash,
      playerId,
      wallet: owner,
      status,
      txHash: status === 'executed_success' ? txHash : null,
      statusJson: { executed: status !== 'pending', success: status === 'executed_success', txnHash: txHash },
    });
  }
  return { intentHash, txHash };
}

function position({ owner = wallet, isLong = true, pair = 'BTC/USD', entry = 100 } = {}) {
  return {
    trader: owner,
    pair,
    isLong,
    entryPrice: price(entry),
  };
}

function openRow(id, txHash, options = {}) {
  return {
    id: String(id),
    transactionHash: txHash,
    hash: options.positionHash || hash('90'),
    positionHash: options.positionHash || hash('90'),
    logIndex: id,
    qty: qty(options.size || 1),
    operationType: options.operationType || 'OPEN_MARKET_TRADE',
    blockTime: options.blockTime || '2026-09-14T10:00:00.000Z',
    isLong: options.isLong !== false,
    tokenInPrice: one,
    position: position({ owner: options.owner || wallet, isLong: options.isLong !== false, entry: options.at || 100 }),
    detail: { atPrice: price(options.at || 100), executionFee: '0' },
  };
}

function closeRow(id, txHash, options = {}) {
  return {
    id: String(id),
    transactionHash: txHash,
    hash: options.hash || options.positionHash || hash('91'),
    positionHash: options.positionHash || hash('91'),
    logIndex: id,
    qty: qty(options.size || 1),
    operationType: options.operationType || 'CLOSE_POSITION',
    blockTime: options.blockTime || '2026-09-14T10:01:00.000Z',
    isLong: options.isLong !== false,
    tokenIn: options.tokenIn,
    tokenInPrice: options.tokenInPrice || one,
    position: position({ owner: options.owner || wallet, isLong: options.isLong !== false, entry: 100 }),
    detail: {
      closePrice: price(options.at || 110),
      pnl: options.pnlRaw || price(options.pnl ?? 10),
      closeFee: options.closeFeeRaw || one,
    },
  };
}

async function run() {
  const pending = recordIntent('01', { status: 'submitted' });
  const failed = recordIntent('02', { status: 'submitted' });
  let historyReads = 0;
  const noProof = await leverup.importFillsForPlayer('player-1', wallet, {
    db,
    statusReader: async intentHash => intentHash === failed.intentHash
      ? { executed: true, skipped: true, success: false, skipReason: 'fixture rejection' }
      : { submitted: true, executed: false, success: false },
    historyReader: async () => { historyReads += 1; return { content: [] }; },
  });
  assert.equal(noProof.skipped, 'no_executed_clash_intents');
  assert.equal(historyReads, 0, 'submitted/failed intents must not even open the reward history path');
  assert.equal(db.getLeverupIntentProof('player-1', wallet, pending.intentHash).status, 'pending');
  assert.equal(db.getLeverupIntentProof('player-1', wallet, failed.intentHash).status, 'failed');

  const directOpen = recordIntent('03');
  const directClose = recordIntent('04');
  const limitCreate = recordIntent('05');
  const decreaseCreate = recordIntent('06');
  const wrongBroker = recordIntent('07', { rewardEligible: false });
  recordIntent('08', { playerId: 'player-2', owner: otherWallet });
  const limitOrderHash = hash('a1');
  const decreaseOrderHash = hash('a2');
  const rows = [
    openRow(1, directOpen.txHash),
    closeRow(2, directClose.txHash, {
      tokenIn: `0x${'33'.repeat(20)}`,
      tokenInPrice: '0.025000000000000000',
      pnlRaw: price(10),
      closeFeeRaw: one,
    }),
    openRow(3, directOpen.txHash, { owner: otherWallet, positionHash: hash('93') }),
    openRow(4, wrongBroker.txHash, { positionHash: hash('94') }),
    openRow(5, hash('88'), { positionHash: hash('95') }),
    {
      id: '6', transactionHash: limitCreate.txHash, hash: limitOrderHash,
      operationType: 'OPEN_LIMIT_ORDER', blockTime: '2026-09-14T10:02:00.000Z',
      qty: qty(1), detail: { price: price(50) },
    },
    openRow(7, hash('81'), {
      operationType: 'EXECUTE_LIMIT_ORDER_SUCCESSFUL', positionHash: limitOrderHash,
      size: 1, at: 50, blockTime: '2026-09-14T10:03:00.000Z',
    }),
    {
      id: '8', transactionHash: decreaseCreate.txHash, hash: decreaseOrderHash,
      positionHash: hash('96'), operationType: 'DECREASE_ORDER_CREATED',
      blockTime: '2026-09-14T10:04:00.000Z', detail: { broker: '2' },
    },
    closeRow(9, hash('82'), {
      operationType: 'EXECUTE_DECREASE_ORDER_SUCCESSFUL', hash: decreaseOrderHash,
      positionHash: hash('96'), size: 1, at: 90, pnl: -2,
      blockTime: '2026-09-14T10:05:00.000Z',
    }),
  ];
  const historyReader = async (_owner, query) => {
    assert.equal(query.page, 0);
    return { content: rows, last: true, totalPages: 1 };
  };
  const imported = await leverup.importFillsForPlayer('player-1', wallet, {
    db,
    statusReader: async () => ({ submitted: true, executed: false }),
    historyReader,
    limit: 500,
  });
  assert.deepEqual(
    { imported: imported.imported, updated: imported.updated, learned: imported.learned_orders },
    { imported: 4, updated: 0, learned: 2 },
  );
  assert.equal(imported.economic_rows, 7);
  assert.equal(imported.eligible_intents, 4);
  assert.deepEqual(imported.ignored_reasons, {
    wallet_mismatch: 1, no_clash_route: 2, invalid_fill: 0,
  }, 'unrelated wallet/broker activity is explained, never credited');
  const trades = db.db.prepare(`
    SELECT * FROM trade_history WHERE player_id = 'player-1' AND dex = 'leverup' ORDER BY id
  `).all();
  assert.equal(trades.length, 4);
  assert.deepEqual(trades.map(row => row.side), ['open_long', 'close_long', 'open_long', 'close_long']);
  assert.deepEqual(trades.map(row => Number(row.notional_usd)), [100, 110, 50, 90]);
  assert.deepEqual(trades.map(row => row.pnl == null ? null : Number(row.pnl)), [null, 0.25, null, -2]);
  assert.equal(Number(trades[1].fee), 0.025, 'decimal tokenInPrice must convert non-stable collateral fees to USD');
  assert(trades.every(row => row.verified_source === 'leverup_broker_fill'));
  assert(trades.every(row => JSON.parse(row.proof_json).broker.verified === true));
  assert.equal(JSON.parse(trades[0].proof_json).route.kind, 'intent_tx');
  assert.equal(JSON.parse(trades[2].proof_json).route.kind, 'broker_order');
  assert.equal(db.getLeverupOrderProof('player-1', wallet, limitOrderHash).intent_hash, limitCreate.intentHash);
  assert.equal(db.getLeverupOrderProof('player-1', wallet, decreaseOrderHash).intent_hash, decreaseCreate.intentHash);

  const replay = await leverup.importFillsForPlayer('player-1', wallet, {
    db,
    statusReader: async () => ({ submitted: true, executed: false }),
    historyReader,
  });
  assert.equal(replay.imported, 0, 'official history replay must be idempotent');
  assert.equal(replay.updated, 0, 'unchanged official fills must not churn trade rows');
  assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM trade_history WHERE dex='leverup'").get().n, 4);

  const directProof = db.getLeverupIntentProof('player-1', wallet, directOpen.intentHash);
  assert.doesNotMatch(directProof.proof_json, /signature|actionData/u, 'stored proof must not retain one-tap secrets or signatures');
  assert.deepEqual(
    leverup.intentStatusEvidence({ executed: true, success: true, txnHash: hash('ab') }),
    { status: 'executed_success', txHash: hash('ab') },
  );
  assert.deepEqual(
    leverup.intentStatusEvidence({ executed: true, success: false, skipped: true }),
    { status: 'failed', txHash: null },
  );
  console.log('LeverUp broker-proof import, async order linkage, wallet isolation and replay checks: PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  try { db.db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(process.env.CLASH_FUTURES_DB + suffix); } catch (error) {
      if (!['ENOENT', 'EBUSY', 'EPERM'].includes(error.code)) console.warn(error.message);
    }
  }
  try { fs.rmdirSync(tempDir); } catch {}
});
