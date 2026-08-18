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
  const finalSignature = bs58.encode(Buffer.alloc(64, 7));
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
      const unsigned = makeUnsignedTransaction(wallet);
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
      return jsonResponse(200, { signature: finalSignature });
    }
    return jsonResponse(404, { error: 'unexpected route' });
  };

  let counter = 0;
  const service = createSanctumService({
    db,
    fetchImpl,
    apiKey,
    clashSolMint,
    apiBaseUrl: 'https://sanctum.test',
    randomUUID: () => `order-${++counter}`,
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
  await expectCode(service.executeOrder({
    playerId: 'player-1',
    orderId: changedOrder.orderId,
    signedTransaction: Buffer.from(changedTx.serialize()).toString('base64'),
  }), 'TRANSACTION_CHANGED');

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
  assert.equal(db.prepare('SELECT status FROM sanctum_order_intents WHERE id = ?').get(order.orderId).status, 'consumed');
  await expectCode(service.executeOrder({
    playerId: 'player-1', orderId: order.orderId, signedTransaction: Buffer.from(signed.serialize()).toString('base64'),
  }), 'ORDER_ALREADY_EXECUTED');

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
  console.log('Sanctum clashSOL tests passed: live mint config, bidirectional fixed routes, exact signature verification, replay protection.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
