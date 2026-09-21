"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Database = require("better-sqlite3");
const { Keypair, PublicKey, TransactionInstruction, VersionedTransaction } = require("@solana/web3.js");
const { AccountLayout, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } = require("@solana/spl-token");
const bs58 = require("bs58").default || require("bs58");
const { createMigrationChain, saleSlippageSteps, isJupiterSlippageError } = require("./migration_chain");
const { SOURCE_MINT, MigrationError } = require("./migration_core");
const { createMigration } = require("./migration_core");
const { parseArgs, runWorker } = require("./migration_sales_worker");
const JUP = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const SOL = "So11111111111111111111111111111111111111112";

function swapFixture() {
  // Ephemeral test-only key; all quote/RPC/simulation calls are mocked.
  const signer = Keypair.generate();
  const ata = getAssociatedTokenAddressSync(new PublicKey(SOURCE_MINT), signer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const state = { quotes: [], attempts: [], simulations: 0, failUntil: 0, error: null,
    tokens: "10000000000", sol: 1000000000, minimum: 0n, corruptBalance: false };
  const connection = {
    getTokenAccountBalance: async () => ({ value: { amount: state.tokens } }),
    getBalance: async () => state.sol,
    getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 123 }),
    simulateTransaction: async (tx, options) => {
      state.simulations++;
      assert.equal(options.sigVerify, false);
      assert.equal(options.commitment, "finalized");
      assert.ok(tx.signatures.every(s => s.every(b => b === 0)), "Simulation precedes signing");
      if (state.error) return { value: { err: state.error } };
      if (state.quotes.at(-1) < state.failUntil)
        return { value: { err: { InstructionError: [2, { Custom: 6001 }] } } };
      const data = Buffer.alloc(AccountLayout.span);
      data.writeBigUInt64LE(BigInt(state.tokens) - 4000000000n + (state.corruptBalance ? 1n : 0n), 64);
      return { value: { err: null, accounts: [
        { data: [data.toString("base64"), "base64"] },
        { lamports: Number(BigInt(state.sol) + state.minimum - 5000n) },
      ] } };
    },
  };
  const deps = { connection, prices: async () => ({ clashUsdMicros: "25000", solUsdMicros: "100000000" }),
    json: async url => {
      const params = new URL(url).searchParams;
      const bps = Number(params.get("slippageBps"));
      state.quotes.push(bps);
      state.minimum = 1000000000n * BigInt(10000 - bps) / 10000n;
      return { inputMint: SOURCE_MINT, outputMint: SOL, inAmount: params.get("amount"),
        swapMode: "ExactIn", slippageBps: bps, outAmount: "1000000000", otherAmountThreshold: String(state.minimum),
        swapInstruction: { programId: JUP, data: Buffer.from([1]).toString("base64"), accounts: [
          { pubkey: signer.publicKey.toBase58(), isSigner: true, isWritable: true },
          { pubkey: ata.toBase58(), isSigner: false, isWritable: true },
        ] } };
    } };
  const input = { inputUnits: "4000000000", slippageBps: 50, maxSlippageBps: 500,
    onAttempt: (bps, result) => state.attempts.push([bps, result]) };
  return { state, deps, signer, input, run: () =>
    createMigrationChain({}, deps).prepareSale(input, bs58.encode(signer.secretKey), "mock-api-key") };
}

test("bounded slippage ladder includes exact owner cap and rejects invalid inputs", () => {
  assert.deepEqual(saleSlippageSteps(50, 500), [50, 100, 200, 500]);
  assert.deepEqual(saleSlippageSteps(25, 150), [25, 50, 100, 150]);
  assert.deepEqual(saleSlippageSteps(50, 50), [50]);
  for (const values of [[0, 500], [100, 50], [50, 1001], [0.5, 100], [50, Infinity]])
    assert.throws(() => saleSlippageSteps(...values), /INVALID_SLIPPAGE/);
});

test("6001 must be the exact Jupiter instruction error, never a substring or unrelated program", () => {
  const ix = new TransactionInstruction({ programId: new PublicKey(JUP), keys: [], data: Buffer.alloc(0) });
  assert.equal(isJupiterSlippageError({ InstructionError: [0, { Custom: 6001 }] }, [ix]), true);
  assert.equal(isJupiterSlippageError({ message: "6001" }, [ix]), false);
  assert.equal(isJupiterSlippageError({ InstructionError: [0, { Custom: 16001 }] }, [ix]), false);
  assert.equal(isJupiterSlippageError({ InstructionError: [1, { Custom: 6001 }] }, [ix]), false);
  ix.programId = Keypair.generate().publicKey;
  assert.equal(isJupiterSlippageError({ InstructionError: [0, { Custom: 6001 }] }, [ix]), false);
});

test("simulation escalates 0.5 to 1 to 2 percent, stops on first success and never broadcasts", async () => {
  const f = swapFixture(); f.state.failUntil = 200;
  const result = await f.run();
  assert.deepEqual(f.state.quotes, [50, 100, 200]);
  assert.deepEqual(f.state.attempts, [[50, "SLIPPAGE"], [100, "SLIPPAGE"], [200, "OK"]]);
  assert.equal(result.slippageBps, 200);
  assert.equal(result.minimumOutput, "980000000");
  const signed = VersionedTransaction.deserialize(Buffer.from(result.raw, "base64"));
  assert.ok(signed.signatures[0].some(b => b !== 0));
  // No send/broadcast method is supplied by the fixture at all.
});

test("simulation never exceeds cap and never signs on failure", async () => {
  const f = swapFixture(); f.state.failUntil = 1000;
  await assert.rejects(f.run(), /SLIPPAGE_LIMIT/);
  assert.deepEqual(f.state.quotes, [50, 100, 200, 500]);
});

test("timeout, unrelated simulation failure, missing balance or gas never raise slippage", async () => {
  const f = swapFixture(); f.state.error = { InstructionError: [2, { Custom: 6002 }] };
  await assert.rejects(f.run(), /SALE_SIMULATION_FAILED/);
  assert.deepEqual(f.state.quotes, [50]);
  const network = swapFixture(); let calls = 0;
  network.deps.json = async () => { calls++; throw new MigrationError("UPSTREAM_UNAVAILABLE", 503); };
  await assert.rejects(network.run(), /UPSTREAM_UNAVAILABLE/);
  assert.equal(calls, 1);
  const low = swapFixture(); low.state.tokens = "3999999999";
  await assert.rejects(low.run(), /SALE_BALANCE_UNAVAILABLE/);
  assert.equal(low.state.quotes.length, 0);
  low.state.tokens = "4000000000"; low.state.sol = 9999999;
  await assert.rejects(low.run(), /SOL_GAS_REQUIRED/);
  assert.equal(low.state.quotes.length, 0);
});

test("wrong simulated token delta remains fail-closed", async () => {
  const f = swapFixture(); f.state.corruptBalance = true;
  await assert.rejects(f.run(), /SALE_SIMULATION_BALANCE_MISMATCH/);
  assert.deepEqual(f.state.quotes, [50]);
});

test("fresh quote price dropping below $100 prevents simulation and signing", async () => {
  const f = swapFixture();
  f.deps.prices = async () => ({ clashUsdMicros: "24999", solUsdMicros: "100000000" });
  await assert.rejects(f.run(), /SALE_BELOW_MINIMUM/);
  assert.equal(f.state.simulations, 0);
  assert.equal(f.state.quotes.length, 1);
});

test("sale balance checks finalized Token-2022 ATA; missing account waits without error", async () => {
  const treasury = Keypair.generate().publicKey;
  let account = null;
  const chain = createMigrationChain({}, { connection: {
    getAccountInfo: async (ata, commitment) => {
      assert.equal(commitment, "finalized");
      assert.equal(ata.toBase58(), getAssociatedTokenAddressSync(new PublicKey(SOURCE_MINT), treasury, false, TOKEN_2022_PROGRAM_ID).toBase58());
      return account;
    },
    getBalance: async () => 12300000,
  } });
  assert.deepEqual(await chain.saleBalance(treasury.toBase58()), { tokenUnits: "0", solLamports: "12300000" });
  const data = Buffer.alloc(AccountLayout.span);
  new PublicKey(SOURCE_MINT).toBuffer().copy(data, 0);
  treasury.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(123456789n, 64);
  account = { owner: TOKEN_2022_PROGRAM_ID, data };
  assert.equal((await chain.saleBalance(treasury.toBase58())).tokenUnits, "123456789");
  account.owner = Keypair.generate().publicKey;
  await assert.rejects(chain.saleBalance(treasury.toBase58()), /SALE_TOKEN_ACCOUNT_MISMATCH/);
});

test("CLI defaults read-only and requires explicit execute; rejects typos and tight loops", () => {
  assert.equal(parseArgs([]).execute, false);
  assert.equal(parseArgs(["--execute", "--once"]).execute, true);
  for (const args of [["--exectue"], ["--execute", "--execute"], ["--db"],
    ["--interval-ms", "1"], ["--interval-ms", "NaN"], ["--interval-ms", "300001"]])
    assert.throws(() => parseArgs(args));
});

test("check mode never invokes execution and redacts extra fields", async () => {
  const logs = [];
  const service = { tickSales: () => assert.fail("must not execute"),
    salesPreview: async () => ({ state: "ready", inputUnits: "4000000000", raw: "secret", lots: ["private"] }) };
  await runWorker({ service, once: true, logger: r => logs.push(r) });
  assert.equal(logs[0].mode, "check");
  assert.equal(logs[0].inputUnits, "4000000000");
  assert.equal(logs[0].raw, undefined);
  assert.equal(logs[0].lots, undefined);
});

test("runner backs off provider errors, deduplicates logs and stops via signal", async () => {
  const logs = [], delays = [], controller = new AbortController();
  const result = await runWorker({ service: { salesPreview: async () => { throw Error("secret rpc endpoint"); } },
    signal: controller.signal, logger: r => logs.push(r),
    wait: async ms => { delays.push(ms); if (delays.length === 3) controller.abort(); } });
  assert.deepEqual(delays, [30000, 60000, 120000]);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].reason, "WORKER_UNAVAILABLE");
  assert.equal(result.state, "stopped");
});

test("logging failure does not cause a second execution", async () => {
  let calls = 0;
  const result = await runWorker({ execute: true, once: true,
    service: { tickSales: async () => { calls++; return { state: "signed" }; } },
    logger: () => { throw Error("logger unavailable"); } });
  assert.equal(result.state, "signed");
  assert.equal(calls, 1);
});

test("actual CLI process defaults read-only against local paused DB and leaves no new tables/leases", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clash-sales-cli-"));
  const file = path.join(dir, "test.db");
  try {
    const fixtureDb = new Database(file);
    createMigration({ db: fixtureDb, chain: {} });
    fixtureDb.close();
    const before = fs.readFileSync(file);
    const result = spawnSync(process.execPath, [path.join(__dirname, "migration_sales_worker.js"),
      "--db", file, "--once"], { encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout.trim());
    assert.equal(record.mode, "check");
    assert.equal(record.reason, "MIGRATION_PAUSED");
    assert.deepEqual(fs.readFileSync(file), before);
    const missing = path.join(dir, "missing.db");
    const invalid = spawnSync(process.execPath, [path.join(__dirname, "migration_sales_worker.js"),
      "--db", missing, "--once"], { encoding: "utf8", timeout: 15000 });
    assert.equal(invalid.status, 1);
    assert.equal(fs.existsSync(missing), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
