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
