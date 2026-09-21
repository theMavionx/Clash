"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  Keypair,
  Transaction,
  SystemProgram,
  VersionedTransaction,
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
} = require("./migration_chain");
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
    tx.instructions[0].keys[5].pubkey.toBase58(),
    TOKEN_2022_PROGRAM_ID.toBase58(),
  );
  const transfer = decodeTransferCheckedInstruction(
    tx.instructions[1],
    TOKEN_2022_PROGRAM_ID,
  );
  assert.equal(transfer.data.amount, 1234567n);
  assert.equal(transfer.data.decimals, 6);
  assert.equal(
    transfer.keys.destination.pubkey.toBase58(),
    destination.toBase58(),
  );
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
