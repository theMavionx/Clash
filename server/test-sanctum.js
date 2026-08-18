const assert = require('assert/strict');
const Database = require('better-sqlite3');
const bs58Module = require('bs58');
const {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} = require('@solana/web3.js');
const {
  WRAPPED_SOL_MINT,
  LIVE_CLASHSOL_MINT,
  createSanctumService,
  normalizeSwapDirection,
  parseSolToLamports,
} = require('./sanctum');

const bs58 = bs58Module.default || bs58Module;

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE players (id TEXT PRIMARY KEY);
    INSERT INTO players (id) VALUES ('player-1');
    CREATE TABLE sanctum_order_intents (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      input_mint TEXT NOT NULL,
      output_mint TEXT NOT NULL,
      input_amount TEXT NOT NULL,
      output_amount TEXT NOT NULL,
      slippage_bps INTEGER NOT NULL,
      order_json TEXT NOT NULL,
      unsigned_tx_hash TEXT NOT NULL,
      tx_kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at_ms INTEGER NOT NULL,
      execution_started_at TEXT,
      tx_signature TEXT,
      consumed_at TEXT,
      last_error TEXT,
      last_error_code TEXT,
      last_error_stage TEXT,
      submitted_at TEXT,
      confirmed_at TEXT,
      confirmation_status TEXT,
      confirmation_slot INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    ALTER TABLE sanctum_order_intents ADD COLUMN direction TEXT NOT NULL DEFAULT 'stake';
    CREATE TABLE player_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      chain_type TEXT NOT NULL,
      address TEXT NOT NULL,
      label TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chain_type, address)
    );
  `);
  return db;
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

function makeUnsignedTransaction(wallet) {
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    })],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

function makeMultiSignerUnsignedTransaction(wallet, sponsor) {
  const message = new TransactionMessage({
    payerKey: sponsor.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    })],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.equal(error?.code, code);
    return true;
  });
}

async function run() {
  assert.equal(parseSolToLamports('1'), '1000000000');
  assert.equal(parseSolToLamports('0.001000001'), '1000001');
  assert.throws(() => parseSolToLamports('1.0000000001'), error => error?.code === 'INVALID_AMOUNT');
  assert.equal(normalizeSwapDirection('stake'), 'stake');
  assert.equal(normalizeSwapDirection('UNSTAKE'), 'unstake');
  assert.throws(() => normalizeSwapDirection('borrow'), error => error?.code === 'INVALID_DIRECTION');

  const pendingService = createSanctumService({ db: makeDb(), apiKey: '', fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(await pendingService.getStatus(), {
    available: false,
    launchStatus: 'configuration_required',
    name: 'Clash Staked SOL',
    symbol: 'clashSOL',
    mint: LIVE_CLASHSOL_MINT,
    reason: 'api_key_missing',
  });

  const db = makeDb();
  const wallet = Keypair.generate();
  const clashSolMint = Keypair.generate().publicKey.toBase58();
  const apiKey = 'server-only-test-key';
  const seenUrls = [];
  const unsignedByAmount = new Map();
  let finalSignature = '';
  let failExecute = false;
  let nextSponsor = null;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    seenUrls.push(url);
    assert.equal(url.searchParams.get('apiKey'), apiKey);
    if (url.pathname === `/lsts/${clashSolMint}`) {
      return jsonResponse(200, {
        data: [{
          mint: clashSolMint,
          symbol: 'clashSOL',
          name: 'Clash Staked SOL',
          decimals: 9,
          pool: { program: 'SanctumSpl', pool: Keypair.generate().publicKey.toBase58() },
          latestApy: 0.072,
        }],
      });
    }
    if (url.pathname === `/lsts/${clashSolMint}/apys`) {
      return jsonResponse(200, { data: [{ epoch: 100, epochEndTs: 1000, apy: 0.071 }, { epoch: 101, epochEndTs: 2000, apy: 0.073 }] });
    }
    if (url.pathname === '/swap/token/order') {
      const inputMint = url.searchParams.get('inp');
      const outputMint = url.searchParams.get('out');
      assert.equal(
        (inputMint === WRAPPED_SOL_MINT && outputMint === clashSolMint)
          || (inputMint === clashSolMint && outputMint === WRAPPED_SOL_MINT),
        true,
      );
      assert.equal(url.searchParams.get('mode'), 'ExactIn');
      assert.equal(url.searchParams.get('signer'), wallet.publicKey.toBase58());
      assert.deepEqual(url.searchParams.getAll('swapSrc'), ['Inf', 'SanctumRouter', 'Jup']);
      const amount = url.searchParams.get('amt');
      const sponsor = nextSponsor;
      nextSponsor = null;
      const unsigned = sponsor ? makeMultiSignerUnsignedTransaction(wallet, sponsor) : makeUnsignedTransaction(wallet);
      const tx = Buffer.from(unsigned.serialize()).toString('base64');
      unsignedByAmount.set(amount, tx);
      return jsonResponse(200, {
        inp: inputMint,
        out: outputMint,
        mode: 'ExactIn',
        tx,
        inpAmt: amount,
        outAmt: amount,
        swapSrcData: { swapSrc: 'SanctumRouter', data: { fees: [] } },
      });
    }
    if (url.pathname === '/swap/token/execute') {
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      assert.equal([clashSolMint, WRAPPED_SOL_MINT].includes(body.orderResponse.out), true);
      assert.ok(typeof body.signedTx === 'string');
      const submitted = VersionedTransaction.deserialize(Buffer.from(body.signedTx, 'base64'));
      finalSignature = bs58.encode(Buffer.from(submitted.signatures[0]));
      if (failExecute === 'http500') return jsonResponse(500, { error: 'simulated upstream response loss' });
      if (failExecute) throw new Error('simulated response loss after signed submission');
      return jsonResponse(200, { signature: finalSignature });
    }
    return jsonResponse(404, { error: 'unexpected route' });
  };

  let counter = 0;
  let chainStatus = null;
  let chainStatusError = false;
  const service = createSanctumService({
    db,
    fetchImpl,
    apiKey,
    clashSolMint,
    apiBaseUrl: 'https://sanctum.test',
    randomUUID: () => `order-${++counter}`,
    signatureStatusReader: async () => {
      if (chainStatusError) throw new Error('simulated RPC outage');
      return chainStatus;
    },
  });
  const status = await service.getStatus();
  assert.equal(status.available, true);
  assert.equal(status.mint, clashSolMint);
  assert.equal(status.apy, 0.073);
  assert.equal(status.apyPeriod, 'last_epoch');
  const degradedStatus = service.getLocalStatus({ degraded: true, error: 'temporary outage' });
  assert.equal(degradedStatus.available, true);
  assert.equal(degradedStatus.degraded, true);
  assert.equal(degradedStatus.mint, clashSolMint);
  assert.match(degradedStatus.warning, /temporary outage/);

  const undiscoverableService = createSanctumService({
    db: makeDb(),
    apiKey,
    clashSolMint,
    apiBaseUrl: 'https://sanctum.test',
    fetchImpl: async input => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/apys')) return jsonResponse(200, {});
      return jsonResponse(200, { data: [{ mint: Keypair.generate().publicKey.toBase58(), symbol: 'otherSOL' }] });
    },
  });
  const undiscoverableStatus = await undiscoverableService.getStatus();
  assert.equal(undiscoverableStatus.available, false);
  assert.equal(undiscoverableStatus.reason, 'pool_not_discoverable');
  await expectCode(undiscoverableService.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '1', slippageBps: 30,
  }), 'NOT_LIVE');

  const badSignatureOrder = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.25', slippageBps: 30,
  });
  await expectCode(service.executeOrder({
    playerId: 'player-1', orderId: badSignatureOrder.orderId, signedTransaction: badSignatureOrder.transaction,
  }), 'INVALID_SIGNATURE');
  await expectCode(service.executeOrder({
    playerId: 'different-player', orderId: badSignatureOrder.orderId, signedTransaction: badSignatureOrder.transaction,
  }), 'ORDER_NOT_FOUND');
  db.prepare('UPDATE sanctum_order_intents SET expires_at_ms = ? WHERE id = ?')
    .run(Date.now() - 1, badSignatureOrder.orderId);
  await expectCode(service.executeOrder({
    playerId: 'player-1', orderId: badSignatureOrder.orderId, signedTransaction: badSignatureOrder.transaction,
  }), 'ORDER_EXPIRED');

  const changedOrder = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.5', slippageBps: 30,
  });
  const changedTx = VersionedTransaction.deserialize(Buffer.from(changedOrder.transaction, 'base64'));
  changedTx.message.recentBlockhash = Keypair.generate().publicKey.toBase58();
  changedTx.sign([wallet]);
  const refreshedBlockhashResult = await service.executeOrder({
    playerId: 'player-1',
    orderId: changedOrder.orderId,
    signedTransaction: Buffer.from(changedTx.serialize()).toString('base64'),
  });
  assert.equal(refreshedBlockhashResult.status, 'submitted');
  chainStatus = { slot: 123450, confirmationStatus: 'confirmed', confirmations: 1, err: null };
  assert.equal((await service.getOrderStatus({ playerId: 'player-1', orderId: changedOrder.orderId })).status, 'confirmed');
  chainStatus = null;

  const changedInstructionOrder = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.75', slippageBps: 30,
  });
  const changedInstructionTx = VersionedTransaction.deserialize(Buffer.from(changedInstructionOrder.transaction, 'base64'));
  changedInstructionTx.message.compiledInstructions[0].data[0] ^= 1;
  changedInstructionTx.sign([wallet]);
  await expectCode(service.executeOrder({
    playerId: 'player-1',
    orderId: changedInstructionOrder.orderId,
    signedTransaction: Buffer.from(changedInstructionTx.serialize()).toString('base64'),
  }), 'TRANSACTION_CHANGED');
  assert.deepEqual(
    db.prepare('SELECT status, last_error_code, last_error_stage FROM sanctum_order_intents WHERE id = ?').get(changedInstructionOrder.orderId),
    { status: 'failed', last_error_code: 'TRANSACTION_CHANGED', last_error_stage: 'signature_validation' },
  );

  const sponsor = Keypair.generate();
  nextSponsor = sponsor;
  const multiSignerOrder = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.8', slippageBps: 30,
  });
  const multiSignerTx = VersionedTransaction.deserialize(Buffer.from(multiSignerOrder.transaction, 'base64'));
  multiSignerTx.sign([sponsor, wallet]);
  const expectedTransactionId = bs58.encode(Buffer.from(multiSignerTx.signatures[0]));
  assert.notEqual(expectedTransactionId, bs58.encode(Buffer.from(multiSignerTx.signatures[1])));
  const multiSignerResult = await service.executeOrder({
    playerId: 'player-1', orderId: multiSignerOrder.orderId,
    signedTransaction: Buffer.from(multiSignerTx.serialize()).toString('base64'),
  });
  assert.equal(multiSignerResult.signature, expectedTransactionId);
  chainStatus = { slot: 123451, confirmationStatus: 'confirmed', confirmations: 1, err: null };
  assert.equal((await service.getOrderStatus({ playerId: 'player-1', orderId: multiSignerOrder.orderId })).status, 'confirmed');
  chainStatus = null;

  const order = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '1.25', slippageBps: 45,
  });
  assert.equal(order.inputAmount, '1250000000');
  assert.equal(order.inputMint, WRAPPED_SOL_MINT);
  assert.equal(order.outputMint, clashSolMint);
  assert.equal(JSON.stringify(order).includes(apiKey), false);
  const signed = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
  signed.sign([wallet]);
  const result = await service.executeOrder({
    playerId: 'player-1',
    orderId: order.orderId,
    signedTransaction: Buffer.from(signed.serialize()).toString('base64'),
  });
  assert.equal(result.signature, finalSignature);
  assert.equal(
    db.prepare('SELECT address FROM player_wallets WHERE player_id = ?').get('player-1').address,
    wallet.publicKey.toBase58(),
  );
  assert.equal(db.prepare('SELECT status FROM sanctum_order_intents WHERE id = ?').get(order.orderId).status, 'submitted');
  chainStatus = { slot: 123456, confirmationStatus: 'confirmed', confirmations: 1, err: null };
  const confirmedResult = await service.getOrderStatus({ playerId: 'player-1', orderId: order.orderId });
  assert.equal(confirmedResult.status, 'confirmed');
  assert.equal(confirmedResult.explorerUrl, `https://solscan.io/tx/${finalSignature}`);
  const idempotentResult = await service.executeOrder({
    playerId: 'player-1', orderId: order.orderId, signedTransaction: Buffer.from(signed.serialize()).toString('base64'),
  });
  assert.equal(idempotentResult.status, 'confirmed');
  chainStatus = null;

  const legacyConsumedOrder = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.19', slippageBps: 30,
  });
  const legacyConsumedTx = VersionedTransaction.deserialize(Buffer.from(legacyConsumedOrder.transaction, 'base64'));
  legacyConsumedTx.sign([wallet]);
  await service.executeOrder({
    playerId: 'player-1', orderId: legacyConsumedOrder.orderId,
    signedTransaction: Buffer.from(legacyConsumedTx.serialize()).toString('base64'),
  });
  db.prepare("UPDATE sanctum_order_intents SET status = 'consumed' WHERE id = ?").run(legacyConsumedOrder.orderId);
  assert.equal(await service.getLatestActiveOrder({ playerId: 'player-1' }), null);
  assert.equal(db.prepare('SELECT status FROM sanctum_order_intents WHERE id = ?').get(legacyConsumedOrder.orderId).status, 'consumed');
  const quoteAfterLegacyRecovery = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.195', slippageBps: 30,
  });
  db.prepare("UPDATE sanctum_order_intents SET status = 'expired' WHERE id = ?").run(quoteAfterLegacyRecovery.orderId);

  const failedOnChainOrder = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.2', slippageBps: 30,
  });
  const failedOnChainTx = VersionedTransaction.deserialize(Buffer.from(failedOnChainOrder.transaction, 'base64'));
  failedOnChainTx.sign([wallet]);
  chainStatus = { slot: 123457, confirmationStatus: 'confirmed', confirmations: 1, err: { InstructionError: [0, 'Custom'] } };
  const failedOnChainResult = await service.executeOrder({
    playerId: 'player-1', orderId: failedOnChainOrder.orderId,
    signedTransaction: Buffer.from(failedOnChainTx.serialize()).toString('base64'),
  });
  assert.equal(failedOnChainResult.status, 'failed');
  assert.equal(failedOnChainResult.error.code, 'ONCHAIN_FAILED');
  chainStatus = null;

  const uncertainOrder = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.15', slippageBps: 30,
  });
  const uncertainTx = VersionedTransaction.deserialize(Buffer.from(uncertainOrder.transaction, 'base64'));
  uncertainTx.sign([wallet]);
  failExecute = true;
  await expectCode(service.executeOrder({
    playerId: 'player-1', orderId: uncertainOrder.orderId,
    signedTransaction: Buffer.from(uncertainTx.serialize()).toString('base64'),
  }), 'UPSTREAM_UNAVAILABLE');
  assert.equal(db.prepare('SELECT status FROM sanctum_order_intents WHERE id = ?').get(uncertainOrder.orderId).status, 'submission_unknown');
  failExecute = false;
  chainStatus = { slot: 123458, confirmationStatus: 'finalized', confirmations: null, err: null };
  assert.equal((await service.getOrderStatus({ playerId: 'player-1', orderId: uncertainOrder.orderId })).status, 'confirmed');
  chainStatus = null;

  const upstream500Order = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.16', slippageBps: 30,
  });
  const upstream500Tx = VersionedTransaction.deserialize(Buffer.from(upstream500Order.transaction, 'base64'));
  upstream500Tx.sign([wallet]);
  failExecute = 'http500';
  await expectCode(service.executeOrder({
    playerId: 'player-1', orderId: upstream500Order.orderId,
    signedTransaction: Buffer.from(upstream500Tx.serialize()).toString('base64'),
  }), 'UPSTREAM_SERVER_ERROR');
  assert.equal(db.prepare('SELECT status FROM sanctum_order_intents WHERE id = ?').get(upstream500Order.orderId).status, 'submission_unknown');
  failExecute = false;
  chainStatus = { slot: 123459, confirmationStatus: 'confirmed', confirmations: 1, err: null };
  assert.equal((await service.getOrderStatus({ playerId: 'player-1', orderId: upstream500Order.orderId })).status, 'confirmed');
  chainStatus = null;

  const staleUnknownOrder = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.17', slippageBps: 30,
  });
  const staleUnknownTx = VersionedTransaction.deserialize(Buffer.from(staleUnknownOrder.transaction, 'base64'));
  staleUnknownTx.sign([wallet]);
  failExecute = true;
  await expectCode(service.executeOrder({
    playerId: 'player-1', orderId: staleUnknownOrder.orderId,
    signedTransaction: Buffer.from(staleUnknownTx.serialize()).toString('base64'),
  }), 'UPSTREAM_UNAVAILABLE');
  failExecute = false;
  db.prepare('UPDATE sanctum_order_intents SET expires_at_ms = ? WHERE id = ?')
    .run(Date.now() - (11 * 60 * 1000), staleUnknownOrder.orderId);
  chainStatusError = true;
  const unavailableLookup = await service.getOrderStatus({ playerId: 'player-1', orderId: staleUnknownOrder.orderId });
  assert.equal(unavailableLookup.status, 'submission_unknown');
  assert.equal(unavailableLookup.rpcUnavailable, true);
  await expectCode(service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.18', slippageBps: 30,
  }), 'SWAP_IN_PROGRESS');
  chainStatusError = false;
  const finalNullLookup = await service.getOrderStatus({ playerId: 'player-1', orderId: staleUnknownOrder.orderId });
  assert.equal(finalNullLookup.status, 'failed');
  assert.equal(finalNullLookup.error.code, 'SUBMISSION_NOT_FOUND');

  const staleSubmittedOrder = await service.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.185', slippageBps: 30,
  });
  db.prepare(`
    UPDATE sanctum_order_intents SET status = 'submitted', tx_signature = ?, expires_at_ms = ? WHERE id = ?
  `).run(finalSignature, Date.now() - (11 * 60 * 1000), staleSubmittedOrder.orderId);
  const staleSubmittedResult = await service.getOrderStatus({ playerId: 'player-1', orderId: staleSubmittedOrder.orderId });
  assert.equal(staleSubmittedResult.status, 'failed');
  assert.equal(staleSubmittedResult.error.code, 'SUBMISSION_NOT_FOUND');

  const timeoutDb = makeDb();
  const timeoutService = createSanctumService({
    db: timeoutDb,
    fetchImpl,
    apiKey,
    clashSolMint,
    apiBaseUrl: 'https://sanctum.test',
    randomUUID: () => 'timeout-order',
    signatureStatusReader: async () => new Promise(() => {}),
    signatureStatusTimeoutMs: 25,
  });
  const timeoutOrder = await timeoutService.createOrder({
    playerId: 'player-1', wallet: wallet.publicKey.toBase58(), amountSol: '0.186', slippageBps: 30,
  });
  timeoutDb.prepare(`
    UPDATE sanctum_order_intents SET status = 'submitted', tx_signature = ? WHERE id = ?
  `).run(finalSignature, timeoutOrder.orderId);
  const timeoutStartedAt = Date.now();
  const timeoutResult = await timeoutService.getOrderStatus({ playerId: 'player-1', orderId: timeoutOrder.orderId });
  assert.equal(timeoutResult.status, 'submitted');
  assert.equal(timeoutResult.rpcUnavailable, true);
  assert.ok(Date.now() - timeoutStartedAt < 500, 'a stalled signature RPC must not freeze reconciliation');
  timeoutDb.close();

  const unstakeOrder = await service.createOrder({
    playerId: 'player-1',
    wallet: wallet.publicKey.toBase58(),
    amount: '0.125',
    direction: 'unstake',
    slippageBps: 35,
  });
  assert.equal(unstakeOrder.direction, 'unstake');
  assert.equal(unstakeOrder.inputMint, clashSolMint);
  assert.equal(unstakeOrder.outputMint, WRAPPED_SOL_MINT);
  assert.equal(db.prepare('SELECT direction FROM sanctum_order_intents WHERE id = ?').get(unstakeOrder.orderId).direction, 'unstake');
  await expectCode(service.createOrder({
    playerId: 'player-1',
    wallet: wallet.publicKey.toBase58(),
    amount: '1',
    direction: 'borrow',
  }), 'INVALID_DIRECTION');

  const limitedDb = makeDb();
  const limitedNow = Date.parse('2026-08-18T12:00:00.000Z');
  let upstreamOrders = 0;
  let limitedCounter = 0;
  const limitedFetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === `/lsts/${clashSolMint}`) {
      return jsonResponse(200, {
        data: [{
          mint: clashSolMint,
          symbol: 'clashSOL',
          name: 'Clash Staked SOL',
          decimals: 9,
          pool: { program: 'SanctumSpl', pool: Keypair.generate().publicKey.toBase58() },
        }],
      });
    }
    if (url.pathname.endsWith('/apys')) return jsonResponse(200, { data: [] });
    if (url.pathname === '/swap/token/order') {
      upstreamOrders += 1;
      const tx = Buffer.from(makeUnsignedTransaction(wallet).serialize()).toString('base64');
      return jsonResponse(200, {
        inp: url.searchParams.get('inp'),
        out: url.searchParams.get('out'),
        mode: 'ExactIn',
        tx,
        inpAmt: url.searchParams.get('amt'),
        outAmt: url.searchParams.get('amt'),
        swapSrcData: { swapSrc: 'SanctumRouter', data: { fees: [] } },
      });
    }
    return jsonResponse(404, { error: 'unexpected route' });
  };
  const limitedService = createSanctumService({
    db: limitedDb,
    fetchImpl: limitedFetch,
    apiKey,
    clashSolMint,
    apiBaseUrl: 'https://sanctum.test',
    now: () => limitedNow,
    randomUUID: () => `limited-${++limitedCounter}`,
    pendingIntentLimit: 3,
    expiredIntentRetentionMs: 24 * 60 * 60 * 1000,
  });
  const pendingOrders = [];
  for (let index = 0; index < 3; index += 1) {
    pendingOrders.push(await limitedService.createOrder({
      playerId: 'player-1',
      wallet: wallet.publicKey.toBase58(),
      amount: '0.1',
      direction: 'stake',
    }));
  }
  assert.equal(upstreamOrders, 3);
  await expectCode(limitedService.createOrder({
    playerId: 'player-1',
    wallet: wallet.publicKey.toBase58(),
    amount: '0.1',
    direction: 'stake',
  }), 'TOO_MANY_PENDING_ORDERS');
  assert.equal(upstreamOrders, 3, 'pending-intent rejection must happen before an upstream quote call');
  limitedDb.prepare(`
    UPDATE sanctum_order_intents
    SET status = 'expired', expires_at_ms = ?
    WHERE id = ?
  `).run(limitedNow - (2 * 24 * 60 * 60 * 1000), pendingOrders[0].orderId);
  await limitedService.createOrder({
    playerId: 'player-1',
    wallet: wallet.publicKey.toBase58(),
    amount: '0.1',
    direction: 'stake',
  });
  assert.equal(
    limitedDb.prepare('SELECT COUNT(*) AS count FROM sanctum_order_intents WHERE id = ?').get(pendingOrders[0].orderId).count,
    0,
    'expired quote payloads must be pruned after retention',
  );
  assert.equal(upstreamOrders, 4);

  assert.ok(seenUrls.length >= 5);
  if (process.env.SANCTUM_LIVE_TEST === '1') {
    const live = createSanctumService({ db: makeDb() });
    const liveStatus = await live.getStatus({ force: true });
    assert.equal(liveStatus.available, true);
    assert.equal(liveStatus.mint, LIVE_CLASHSOL_MINT);
    assert.equal(liveStatus.symbol, 'clashSOL');
    assert.equal(liveStatus.apyPeriod, 'last_epoch');
    assert.equal(Number.isFinite(Number(liveStatus.apy)), true);
    console.log('Sanctum live metadata and latest-epoch APY verified.');
  }
  console.log('Sanctum clashSOL tests passed: semantic signature validation, bounded RPC reconciliation, multi-signer IDs and idempotency.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
