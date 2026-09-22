"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  Keypair,
  Transaction,
  SystemProgram,
  VersionedTransaction,
  ComputeBudgetProgram,
  ComputeBudgetInstruction,
  TransactionInstruction,
} = require("@solana/web3.js");
const bs58 = require("bs58").default || require("bs58");
const {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  decodeTransferCheckedInstruction,
  MintLayout,
  AccountLayout,
} = require("@solana/spl-token");
const { PublicKey } = require("@solana/web3.js");
const { SOURCE_MINT } = require("./migration_core");
const {
  createMigrationChain,
  alchemyUrl,
  directFetch,
  validateTargetSupply,
} = require("./migration_chain");
const { LIGHTHOUSE, hasOnlyLighthouseAssertions, verifyLighthouseDeployment } = require('./migration_deposit_policy');

function depositExpiryFixture(lighthouse = false) {
  const payer = Keypair.generate(), user = Keypair.generate();
  const tx = new Transaction({ feePayer: payer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(
    SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: payer.publicKey, lamports: 1234 }));
  const transaction = tx.serialize({ requireAllSignatures: false }).toString('base64');
  if (lighthouse) tx.add(new TransactionInstruction({ programId: new PublicKey(LIGHTHOUSE),
    keys: [{ pubkey: user.publicKey, isSigner: false, isWritable: false }], data: Buffer.from([5, 0, 7, 0, 0]) }));
  tx.sign(payer, user);
  const r = { transaction, depositRaw: tx.serialize().toString('base64'), depositHash: bs58.encode(tx.signature),
    wallet: user.publicKey.toBase58(), solanaTreasury: payer.publicKey.toBase58(), lastValidBlockHeight: 100 };
  const state = { slot: 500, height: 133, valid: { context: { slot: 500 }, value: false },
    status: { context: { slot: 500 }, value: [null] }, receipt: null, statusReads: 0, lateStatus: null };
  const connection = {
    getSlot: async commitment => { assert.equal(commitment, 'finalized'); return state.slot; },
    getBlockHeight: async config => { assert.deepEqual(config, { commitment: 'finalized', minContextSlot: state.slot }); return state.height; },
    isBlockhashValid: async (hash, config) => {
      assert.equal(hash, tx.recentBlockhash);
      assert.deepEqual(config, { commitment: 'finalized', minContextSlot: state.slot }); return state.valid;
    },
    getSignatureStatuses: async (hashes, config) => {
      assert.deepEqual(hashes, [r.depositHash]); assert.equal(config.searchTransactionHistory, true);
      state.statusReads++;
      return state.statusReads > 1 && state.lateStatus ? state.lateStatus : state.status;
    },
    getTransaction: async (hash, config) => {
      assert.equal(hash, r.depositHash);
      assert.deepEqual(config, { commitment: 'finalized', maxSupportedTransactionVersion: 0 }); return state.receipt;
    },
  };
  const chain = createMigrationChain({}, { connection });
  return { r, state, connection, tx, payer, user, read: () => chain.depositExpiryEvidence(r) };
}

test('deposit expiry proof requires finalized height margin and immutable signed identity without sends', async () => {
  for (const lighthouse of [false, true]) {
    const f = depositExpiryFixture(lighthouse);
    assert.deepEqual(await f.read(), { kind: 'expired_unlanded', slot: 500, height: 133 });
    assert.equal(f.state.statusReads, 2, 'absence checked again after transaction lookup');
  }
});

test('deposit expiry proof rejects stale contexts, late receipts, invalid identity and durable nonce', async () => {
  const mutations = [
    f => { f.r.lastValidBlockHeight = 0; },
    f => { f.r.lastValidBlockHeight = Number.MAX_SAFE_INTEGER; },
    f => { f.r.lastValidBlockHeight = 1.5; },
    f => { f.r.depositRaw = 'invalid'; },
    f => { f.r.transaction = ''; },
    f => { f.r.depositHash = bs58.encode(Buffer.alloc(64, 1)); },
    f => { f.r.solanaTreasury = f.user.publicKey.toBase58(); },
    f => { f.r.wallet = Keypair.generate().publicKey.toBase58(); },
    f => {
      f.tx.signatures[1].signature[0] ^= 1;
      f.r.depositRaw = f.tx.serialize({ verifySignatures: false }).toString('base64');
    },
    f => {
      f.tx.instructions[0].data[4] ^= 1; f.tx.sign(f.payer, f.user);
      f.r.depositRaw = f.tx.serialize().toString('base64'); f.r.depositHash = bs58.encode(f.tx.signature);
    },
    f => {
      f.tx.instructions.unshift(SystemProgram.nonceAdvance({ noncePubkey: Keypair.generate().publicKey,
        authorizedPubkey: f.payer.publicKey }));
      f.tx.sign(f.payer, f.user); f.r.transaction = f.tx.serialize().toString('base64');
      f.r.depositRaw = f.r.transaction; f.r.depositHash = bs58.encode(f.tx.signature);
    },
    f => { f.state.slot = 0; },
    f => { f.state.height = 132; },
    f => { f.state.height = NaN; },
    f => { f.state.valid.value = true; },
    f => { f.state.valid.context.slot = 499; },
    f => { f.state.valid.context = {}; },
    f => { f.state.status.context.slot = 499; },
    f => { f.state.status.value = []; },
    f => { f.state.status.value = [{ confirmationStatus: 'processed' }]; },
    f => { f.state.status.value = [{ confirmationStatus: 'finalized', err: null }]; },
    f => { f.state.receipt = { slot: 400, meta: { err: null } }; },
    f => { f.state.receipt = undefined; },
    f => { f.state.lateStatus = { context: { slot: 501 }, value: [{ confirmationStatus: 'confirmed' }] }; },
  ];
  for (const mutate of mutations) {
    const f = depositExpiryFixture(); mutate(f);
    assert.equal(await f.read(), null, mutate.toString());
  }
});

test('deposit expiry proof propagates RPC failures rather than treating errors as absence', async () => {
  for (const name of ['getSlot', 'getBlockHeight', 'isBlockhashValid', 'getSignatureStatuses', 'getTransaction']) {
    const f = depositExpiryFixture(); f.connection[name] = async () => { throw Error('RPC unavailable'); };
    await assert.rejects(f.read(), /RPC unavailable/);
  }
});

test('Lighthouse compatibility preserves exact transfers, permissions, fees, signatures and receipt identity', async () => {
  const payer = Keypair.generate(), user = Keypair.generate();
  const base = new Transaction({ feePayer: payer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }),
    SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: payer.publicKey, lamports: 1234 }),
  );
  const encoded = base.serialize({ requireAllSignatures: false }).toString('base64');
  const expected = Transaction.from(Buffer.from(encoded, 'base64'));
  const assertion = () => new TransactionInstruction({ programId: new PublicKey(LIGHTHOUSE),
    keys: [{ pubkey: user.publicKey, isSigner: false, isWritable: false }], data: Buffer.from([5, 0, 7, 0, 0]) });
  const enhanced = () => {
    const tx = Transaction.from(Buffer.from(encoded, 'base64'));
    tx.instructions.unshift(...Array.from({ length: 3 }, assertion));
    tx.add(...Array.from({ length: 3 }, assertion));
    return tx;
  };
  const roundTrip = tx => Transaction.from(tx.serialize({ requireAllSignatures: false }));
  const guarded = enhanced(); guarded.partialSign(user);
  assert.equal(hasOnlyLighthouseAssertions(roundTrip(guarded), expected), true);
  for (const mutate of [
    tx => { tx.instructions[0].programId = Keypair.generate().publicKey; },
    tx => { tx.instructions[0].data = Buffer.from([0, 0, 0]); }, // MemoryWrite
    tx => { tx.instructions[0].data = Buffer.from([1, 0, 0]); }, // MemoryClose
    tx => { tx.instructions[0].data = Buffer.from([16, 0, 0]); }, // CPI-capable Merkle assertion
    tx => { tx.instructions[0].keys[0].pubkey = Keypair.generate().publicKey; },
    tx => { tx.instructions[4] = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 999999 }); },
    tx => { tx.instructions[5].data[4] ^= 1; }, // transfer amount
    tx => { tx.instructions.reverse(); },
    tx => { tx.instructions.splice(5, 1); },
    tx => { tx.instructions.push(tx.instructions[5]); }, // duplicate monetary instruction
    tx => { tx.recentBlockhash = Keypair.generate().publicKey.toBase58(); },
    tx => { tx.feePayer = user.publicKey; },
    tx => { tx.instructions[0].keys.push({ pubkey: payer.publicKey, isWritable: true, isSigner: true }); },
    tx => { tx.instructions[0].keys[0] = { pubkey: ComputeBudgetProgram.programId, isWritable: true, isSigner: false }; },
  ]) {
    const bad = enhanced(); mutate(bad);
    assert.equal(hasOnlyLighthouseAssertions(roundTrip(bad), expected), false);
  }
  let verified = 0, simulated = 0, receipt;
  const adapter = createMigrationChain({}, { verifyLighthouse: async () => { verified++; return true; }, connection: {
    simulateTransaction: async () => { simulated++; return { value: { err: null } }; },
    getSignatureStatuses: async () => ({ value: [{ confirmationStatus: 'finalized', err: null }] }),
    getTransaction: async () => ({ meta: { err: null }, transaction: { message: receipt } }),
  } });
  const r = { transaction: encoded, wallet: user.publicKey.toBase58(), solanaTreasury: payer.publicKey.toBase58() };
  await assert.rejects(adapter.signDeposit(r, enhanced().serialize({ requireAllSignatures: false }).toString('base64'), bs58.encode(payer.secretKey)), /INVALID_SIGNATURE/);
  const signed = await adapter.signDeposit(r, guarded.serialize({ requireAllSignatures: false }).toString('base64'), bs58.encode(payer.secretKey));
  assert.equal(verified, 1); assert.equal(simulated, 1);
  const complete = Transaction.from(Buffer.from(signed.raw, 'base64'));
  assert.ok(complete.verifySignatures());
  receipt = complete.compileMessage();
  assert.equal(await adapter.depositStatus({ ...r, depositRaw: signed.raw, depositHash: signed.hash }), 'confirmed');
  receipt = expected.compileMessage();
  await assert.rejects(adapter.depositStatus({ ...r, depositRaw: signed.raw, depositHash: signed.hash }), /DEPOSIT_MESSAGE_MISMATCH/);
  const failClosed = createMigrationChain({}, { connection: {}, verifyLighthouse: async () => false });
  await assert.rejects(failClosed.signDeposit(r, guarded.serialize({ requireAllSignatures: false }).toString('base64'), bs58.encode(payer.secretKey)), /LIGHTHOUSE_DEPLOYMENT_MISMATCH/);
});
test('Lighthouse deployment pin rejects missing, upgradeable and replaced executable accounts', async () => {
  assert.equal(await verifyLighthouseDeployment({ getMultipleAccountsInfo: async () => [null, null] }), false);
  const programData = new PublicKey('CJ5WEjifs4d77pEA9DpewppByFjHcAkNv3YYSuSoDk7c');
  const owner = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
  const program = { executable: true, owner, data: Buffer.alloc(36) };
  program.data.writeUInt32LE(2); programData.toBuffer().copy(program.data, 4);
  const data = { executable: false, owner, data: Buffer.alloc(46) }; data.data.writeUInt32LE(3);
  data.data[12] = 1;
  assert.equal(await verifyLighthouseDeployment({ getMultipleAccountsInfo: async () => [program, data] }), false);
  data.data[12] = 0;
  assert.equal(await verifyLighthouseDeployment({ getMultipleAccountsInfo: async () => [program, data] }), false, 'Wrong executable hash rejected even when immutable');
});
test("USDG supply exception is confined to official Robinhood token and metadata", () => {
  const { address } = require("../shared/migration-assets.json").robinhoodUsdg;
  validateTargetSupply(address, 6, 123456789n, "USDG");
  assert.throws(() => validateTargetSupply(address, 18, 123n, "USDG"), /USDG_METADATA/);
  assert.throws(() => validateTargetSupply(address, 6, 123n, "USDC"), /USDG_METADATA/);
  assert.throws(() => validateTargetSupply(address, 6, 0n, "USDG"), /USDG_METADATA/);
  const other = "0x1111111111111111111111111111111111111111";
  assert.throws(() => validateTargetSupply(other, 6, 123n, "USDG"), /ONE_BILLION/);
  validateTargetSupply(other, 6, 1000000000000000n, "CLASH");
});
test("RPC rejects public endpoints and credential exfiltration destinations", async () => {
  assert.throws(() =>
    alchemyUrl(
      "https://api.mainnet-beta.solana.com",
      "solana-mainnet.g.alchemy.com",
    ),
  );
  assert.throws(() =>
    alchemyUrl(
      "https://solana-mainnet.g.alchemy.com.evil.test/v2/x",
      "solana-mainnet.g.alchemy.com",
    ),
  );
  await assert.rejects(directFetch("http://localhost:4000/api/admin"));
  assert.equal(
    alchemyUrl(
      "https://solana-mainnet.g.alchemy.com/v2/test",
      "solana-mainnet.g.alchemy.com",
    ),
    "https://solana-mainnet.g.alchemy.com/v2/test",
  );
});
test("CLASH deposit derives Token-2022 accounts, transfer program and immutable-owner rent", async () => {
  const user = Keypair.generate(),
    payer = Keypair.generate();
  const mint = new PublicKey(SOURCE_MINT);
  const source = getAssociatedTokenAddressSync(
    mint,
    user.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const destination = getAssociatedTokenAddressSync(
    mint,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const adapter = createMigrationChain(
    {},
    {
      connection: {
        getTokenAccountBalance: async (p) => {
          assert.equal(p.toBase58(), source.toBase58());
          return { value: { amount: "10000000" } };
        },
        getBalance: async () => 1000000000,
        getLatestBlockhash: async () => ({
          blockhash: Keypair.generate().publicKey.toBase58(),
          lastValidBlockHeight: 100,
        }),
        getFeeForMessage: async () => ({ value: 10000 }),
        getMinimumBalanceForRentExemption: async (size) => {
          assert.equal(size, 170);
          return 2074080;
        },
      },
    },
  );
  const result = await adapter.prepareDeposit({
    id: "token-2022-test",
    wallet: user.publicKey.toBase58(),
    solanaTreasury: payer.publicKey.toBase58(),
    inputUnits: "1234567",
    feeLamports: "20000000",
  });
  const tx = Transaction.from(Buffer.from(result.transaction, "base64"));
  assert.equal(result.depositDestination, destination.toBase58());
  assert.equal(
    tx.instructions[2].keys[5].pubkey.toBase58(),
    TOKEN_2022_PROGRAM_ID.toBase58(),
  );
  const transfer = decodeTransferCheckedInstruction(
    tx.instructions[3],
    TOKEN_2022_PROGRAM_ID,
  );
  assert.equal(transfer.data.amount, 1234567n);
  assert.equal(transfer.data.decimals, 6);
  assert.equal(
    transfer.keys.destination.pubkey.toBase58(),
    destination.toBase58(),
  );
  assert.equal(ComputeBudgetInstruction.decodeSetComputeUnitLimit(tx.instructions[0]).units, 200000);
  assert.equal(ComputeBudgetInstruction.decodeSetComputeUnitPrice(tx.instructions[1]).microLamports, 10000n);
});
test("Phantom priority-fee augmentation reproduces old rejection; pinned quote signs unchanged", async () => {
  const user = Keypair.generate(), payer = Keypair.generate();
  const r = { id: 'phantom-compatibility', wallet: user.publicKey.toBase58(),
    solanaTreasury: payer.publicKey.toBase58(), inputUnits: '4000000000', feeLamports: '20000000' };
  let simulations = 0, networkFee = 12000;
  const adapter = createMigrationChain({}, { connection: {
    getTokenAccountBalance: async () => ({ value: { amount: '4000000000' } }),
    getBalance: async () => 1000000000,
    getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }),
    getFeeForMessage: async message => {
      assert.equal(message.instructions.length, 6);
      return { value: networkFee };
    },
    getMinimumBalanceForRentExemption: async () => 2074080,
    simulateTransaction: async tx => { simulations++; assert.ok(tx instanceof VersionedTransaction); return { value: { err: null } }; },
  } });
  const prepared = await adapter.prepareDeposit(r);
  const phantomSign = encoded => {
    const tx = Transaction.from(Buffer.from(encoded, 'base64'));
    // Phantom's documented unsigned-transaction enhancement rule.
    if (!tx.instructions.some(ix => ix.programId.equals(ComputeBudgetProgram.programId))) {
      tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }));
    }
    tx.partialSign(user);
    return tx.serialize({ requireAllSignatures: false }).toString('base64');
  };
  const old = Transaction.from(Buffer.from(prepared.transaction, 'base64'));
  old.instructions = old.instructions.slice(2);
  const oldEncoded = old.serialize({ requireAllSignatures: false }).toString('base64');
  await assert.rejects(adapter.signDeposit({ ...r, transaction: oldEncoded }, phantomSign(oldEncoded), bs58.encode(payer.secretKey)), error => {
    assert.equal(error.code, 'TRANSACTION_CHANGED');
    assert.equal(error.transactionDifference.expectedInstructions, 4);
    assert.equal(error.transactionDifference.receivedInstructions, 6);
    assert.equal(error.transactionDifference.blockhash, false);
    assert.equal(error.transactionDifference.feePayer, false);
    return true;
  });
  assert.equal(simulations, 0);
  const result = await adapter.signDeposit({ ...r, ...prepared }, phantomSign(prepared.transaction), bs58.encode(payer.secretKey));
  assert.ok(Transaction.from(Buffer.from(result.raw, 'base64')).verifySignatures());
  assert.equal(simulations, 1);
  const tampered = Transaction.from(Buffer.from(prepared.transaction, 'base64'));
  tampered.instructions[1] = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000000 });
  tampered.partialSign(user);
  await assert.rejects(adapter.signDeposit({ ...r, ...prepared }, tampered.serialize({ requireAllSignatures: false }).toString('base64'), bs58.encode(payer.secretKey)), /TRANSACTION_CHANGED/);
  assert.equal(simulations, 1, 'Wallet must not raise the sponsored fee');
  networkFee = 20000000;
  await assert.rejects(adapter.prepareDeposit(r), /NETWORK_FEE_EXCEEDS_QUOTE/);
});
test("current capture includes extended Token-2022 accounts instead of filtering them out", async () => {
  const owner = Keypair.generate().publicKey,
    mint = new PublicKey(SOURCE_MINT);
  const mintData = Buffer.alloc(82),
    accountData = Buffer.alloc(170),
    zero = PublicKey.default;
  MintLayout.encode(
    {
      mintAuthorityOption: 0,
      mintAuthority: zero,
      supply: 1000000000000000n,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: zero,
    },
    mintData,
  );
  AccountLayout.encode(
    {
      mint,
      owner,
      amount: 123456n,
      delegateOption: 0,
      delegate: zero,
      state: 1,
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: zero,
    },
    accountData,
  );
  const adapter = createMigrationChain(
    {},
    {
      connection: {
        getAccountInfo: async () => ({
          data: mintData,
          owner: TOKEN_2022_PROGRAM_ID,
        }),
        getProgramAccounts: async (program, options) => {
          assert.equal(program.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58());
          assert.ok(options.filters.every((f) => !f.dataSize));
          return {
            context: { slot: 123 },
            value: [
              { account: { data: accountData, owner: TOKEN_2022_PROGRAM_ID } },
            ],
          };
        },
      },
    },
  );
  const s = await adapter.snapshot();
  assert.equal(s.balances[owner.toBase58()], "123456");
});
test("sponsored signer signs only the exact stored message with valid wallet signature", async () => {
  const payer = Keypair.generate(),
    user = Keypair.generate(),
    block = Keypair.generate().publicKey.toBase58();
  let simulated = 0;
  const tx = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: block,
  }).add(
    SystemProgram.transfer({
      fromPubkey: user.publicKey,
      toPubkey: payer.publicKey,
      lamports: 1234,
    }),
  );
  const r = {
    wallet: user.publicKey.toBase58(),
    solanaTreasury: payer.publicKey.toBase58(),
    transaction: tx
      .serialize({ requireAllSignatures: false })
      .toString("base64"),
  };
  const adapter = createMigrationChain(
    {},
    {
      connection: {
        simulateTransaction: async (t) => {
          simulated++;
          assert.ok(t instanceof VersionedTransaction);
          return { value: { err: null } };
        },
      },
    },
  );
  await assert.rejects(
    adapter.signDeposit(r, r.transaction, bs58.encode(payer.secretKey)),
    /INVALID_SIGNATURE/,
  );
  tx.partialSign(user);
  const signed = await adapter.signDeposit(
    r,
    tx.serialize({ requireAllSignatures: false }).toString("base64"),
    bs58.encode(payer.secretKey),
  );
  assert.equal(simulated, 1);
  const complete = Transaction.from(Buffer.from(signed.raw, "base64"));
  assert.ok(complete.verifySignatures());
  assert.equal(bs58.encode(complete.signature), signed.hash);
  const changed = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: block,
  }).add(
    SystemProgram.transfer({
      fromPubkey: user.publicKey,
      toPubkey: payer.publicKey,
      lamports: 1235,
    }),
  );
  changed.partialSign(user);
  await assert.rejects(
    adapter.signDeposit(
      r,
      changed.serialize({ requireAllSignatures: false }).toString("base64"),
      bs58.encode(payer.secretKey),
    ),
    /TRANSACTION_CHANGED/,
  );
});
test("failed deposit simulation is never broadcast or accepted", async () => {
  const payer = Keypair.generate(),
    user = Keypair.generate();
  const tx = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).add(
    SystemProgram.transfer({
      fromPubkey: user.publicKey,
      toPubkey: payer.publicKey,
      lamports: 1,
    }),
  );
  const r = {
    wallet: user.publicKey.toBase58(),
    solanaTreasury: payer.publicKey.toBase58(),
    transaction: tx
      .serialize({ requireAllSignatures: false })
      .toString("base64"),
  };
  tx.partialSign(user);
  const a = createMigrationChain(
    {},
    {
      connection: {
        simulateTransaction: async () => ({
          value: { err: "insufficient funds" },
        }),
      },
    },
  );
  await assert.rejects(
    a.signDeposit(
      r,
      tx.serialize({ requireAllSignatures: false }).toString("base64"),
      bs58.encode(payer.secretKey),
    ),
    /SIMULATION_FAILED/,
  );
});
test("wrong EVM chain prevents signing and broadcasting", async () => {
  const a = createMigrationChain(
    {},
    {
      publicClient: {
        getChainId: async () => 1,
        sendRawTransaction: async () => {
          throw Error("must not send");
        },
      },
    },
  );
  await assert.rejects(a.broadcastEvm("0x00"), /WRONG_CHAIN/);
});
test("treasury readiness uses one latest block, not delayed finalized inventory", async () => {
  const data = Buffer.alloc(82);
  MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default,
    supply: 1000000000000000n, decimals: 6, isInitialized: true,
    freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, data);
  let inventory = 20000000n, eth = 1000000000000000n;
  const reads = [];
  const pinned = args => { assert.equal(args.blockNumber, 123n); assert.equal(args.blockTag, undefined); };
  const adapter = createMigrationChain({}, {
    connection: { getAccountInfo: async () => ({ data, owner: TOKEN_2022_PROGRAM_ID }), getBalance: async () => 1000000000 },
    publicClient: {
      getChainId: async () => 4663,
      getBlock: async args => { assert.equal(args.blockTag, 'latest'); return { number: 123n }; },
      getCode: async args => { pinned(args); return '0x1234'; },
      getBalance: async args => { pinned(args); return eth; },
      readContract: async args => {
        pinned(args); reads.push(args.functionName);
        return { decimals: 6, symbol: 'USDG', totalSupply: 100000000000n, balanceOf: inventory }[args.functionName];
      },
    },
  });
  const config = { targetToken: require('../shared/migration-assets.json').robinhoodUsdg.address };
  const keys = { solana: JSON.stringify([...Keypair.generate().secretKey]), evm: '0x' + '11'.repeat(32) };
  const health = await adapter.health(config, keys);
  assert.deepEqual(health.reasons, []); assert.equal(health.inventory, '20000000');
  assert.deepEqual(reads, ['decimals', 'totalSupply', 'symbol', 'balanceOf']);
  inventory = 0n; eth = 0n;
  assert.deepEqual((await adapter.health(config, keys)).reasons, ['TARGET_INVENTORY_EMPTY', 'ETH_GAS_REQUIRED']);
});
function inclusionFixture() {
  const { encodeEventTopics, encodeAbiParameters, parseAbi } = require('viem');
  const r = { payoutHash: '0x' + '11'.repeat(32), payoutNonce: 5,
    evmTreasury: '0x' + '22'.repeat(20), destination: '0x' + '33'.repeat(20),
    targetToken: '0x' + '44'.repeat(20), outputUnits: '123' };
  const state = { final: 199n, canonical: '0xabc', nonce: 5, finalReads: 0, finalError: false,
    receipt: { blockNumber: 200n, blockHash: '0xabc', status: 'success', logs: [{
      address: r.targetToken,
      topics: encodeEventTopics({ abi: parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),
        eventName: 'Transfer', args: { from: r.evmTreasury, to: r.destination } }),
      data: encodeAbiParameters([{ type: 'uint256' }], [123n]),
    }] } };
  const adapter = createMigrationChain({}, { publicClient: {
    getChainId: async () => 4663,
    getTransactionReceipt: async () => state.receipt,
    getTransactionCount: async () => state.nonce,
    getBlock: async args => {
      if (args.blockTag === 'finalized') { state.finalReads++; if (state.finalError) throw Error('RPC outage'); return { number: state.final }; }
      assert.equal(args.blockNumber, 200n); return { hash: state.canonical };
    },
  } });
  return { r, state, adapter };
}

test('exact canonical Robinhood inclusion confirms settlement without finalized RPC', async () => {
  const f = inclusionFixture();
  assert.equal(await f.adapter.payoutStatus(f.r), 'confirmed');
  f.state.finalError = true;
  assert.equal(await f.adapter.payoutStatus(f.r, { inclusionOnly: true }), 'included');
  assert.equal(await f.adapter.payoutStatus(f.r), 'confirmed');
  assert.equal(f.state.finalReads, 0, 'neither queue nor settlement depends on finalized RPC');
  f.state.finalError = false; f.state.final = 200n;
  assert.equal(await f.adapter.payoutStatus(f.r), 'confirmed');
});

test('inclusion rejects wrong token/recipient/amount, failed receipt and orphaned block before finality', async () => {
  for (const mutate of [f => { f.r.targetToken = '0x' + '55'.repeat(20); },
    f => { f.r.destination = '0x' + '66'.repeat(20); },
    f => { f.r.evmTreasury = '0x' + '77'.repeat(20); },
    f => { f.r.outputUnits = '124'; }]) {
    const f = inclusionFixture(); mutate(f);
    assert.equal(await f.adapter.payoutStatus(f.r, { inclusionOnly: true }), 'conflict');
    assert.equal(f.state.finalReads, 0);
  }
  const failed = inclusionFixture(); failed.state.receipt.status = 'reverted';
  assert.equal(await failed.adapter.payoutStatus(failed.r), 'failed');
  const orphan = inclusionFixture(); orphan.state.canonical = '0xdef';
  assert.equal(await orphan.adapter.payoutStatus(orphan.r), 'pending');
  orphan.state.receipt = null;
  assert.equal(await orphan.adapter.payoutStatus(orphan.r), 'pending');
  orphan.state.nonce = 6;
  assert.equal(await orphan.adapter.payoutStatus(orphan.r), 'conflict');
});
test("payout simulation failure still prevents transaction preparation", async () => {
  const key = '0x' + '11'.repeat(32);
  const address = require('viem/accounts').privateKeyToAccount(key).address;
  const adapter = createMigrationChain({}, { publicClient: {
    getChainId: async () => 4663,
    getTransactionCount: async () => 0,
    simulateContract: async () => { throw Error('SIMULATED_REVERT'); },
    estimateGas: async () => { assert.fail('Must stop before estimating/signing'); },
  } });
  await assert.rejects(adapter.preparePayout({ evmTreasury: address, destination: '0x' + '22'.repeat(20),
    targetToken: require('../shared/migration-assets.json').robinhoodUsdg.address, outputUnits: '1000000' }, key), /SIMULATED_REVERT/);
});
