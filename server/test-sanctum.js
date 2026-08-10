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
  createSanctumService,
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

  const pendingService = createSanctumService({ db: makeDb(), fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(await pendingService.getStatus(), {
    available: false,
    launchStatus: 'awaiting_sanctum_deployment',
    name: 'Clash Staked SOL',
    symbol: 'clashSOL',
    mint: null,
    reason: 'mint_not_deployed',
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
      return jsonResponse(200, { last7EpochApy: 0.073 });
    }
    if (url.pathname === '/swap/token/order') {
      assert.equal(url.searchParams.get('inp'), WRAPPED_SOL_MINT);
      assert.equal(url.searchParams.get('out'), clashSolMint);
      assert.equal(url.searchParams.get('mode'), 'ExactIn');
      assert.equal(url.searchParams.get('signer'), wallet.publicKey.toBase58());
      assert.deepEqual(url.searchParams.getAll('swapSrc'), ['Inf', 'SanctumRouter', 'Jup']);
      const amount = url.searchParams.get('amt');
      const unsigned = makeUnsignedTransaction(wallet);
      const tx = Buffer.from(unsigned.serialize()).toString('base64');
      unsignedByAmount.set(amount, tx);
      return jsonResponse(200, {
        inp: WRAPPED_SOL_MINT,
        out: clashSolMint,
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
      assert.equal(body.orderResponse.out, clashSolMint);
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
  db.prepare('UPDATE sanctum_order_intents SET expires_at_ms = 0 WHERE id = ?').run(badSignatureOrder.orderId);
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
  assert.equal(db.prepare('SELECT status FROM sanctum_order_intents WHERE id = ?').get(order.orderId).status, 'consumed');
  await expectCode(service.executeOrder({
    playerId: 'player-1', orderId: order.orderId, signedTransaction: Buffer.from(signed.serialize()).toString('base64'),
  }), 'ORDER_ALREADY_EXECUTED');

  assert.ok(seenUrls.length >= 5);
  console.log('Sanctum clashSOL tests passed: pending status, fixed route, exact message/signature verification, replay protection.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
