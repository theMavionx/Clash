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
  await assert.rejects(adapter.signDeposit({ ...r, transaction: oldEncoded }, phantomSign(oldEncoded), bs58.encode(payer.secretKey)), /TRANSACTION_CHANGED/);
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
test("relaxed inventory does not relax payout receipt finality", async () => {
  const adapter = createMigrationChain({}, { publicClient: {
    getChainId: async () => 4663,
    getTransactionReceipt: async () => ({ blockNumber: 200n, status: 'success' }),
    getBlock: async args => { assert.equal(args.blockTag, 'finalized'); return { number: 199n }; },
  } });
  assert.equal(await adapter.payoutStatus({ payoutHash: '0x' + '11'.repeat(32) }), 'pending');
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
