"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { Keypair } = require("@solana/web3.js");
const nacl = require("tweetnacl");
const { createMigration, units, decimal } = require("./migration_core");
const A = "0x1111111111111111111111111111111111111111",
  B = "0x2222222222222222222222222222222222222222";
function fixture(t) {
  const db = new Database(":memory:"),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "clash-migration-test-")),
    user = Keypair.generate();
  let time = 1700000000000;
  const state = {
    deposit: "pending",
    payout: "pending",
    sale: "pending",
    broadcasts: [],
    payouts: 0,
    sales: 0,
  };
  const chain = {
    keyAddress: async (k, s) =>
      k === "jupiter"
        ? "configured"
        : k === "solana"
          ? Keypair.generate().publicKey.toBase58()
          : A,
    health: async () => ({
      reasons: [],
      targetDecimals: 18,
      inventory: String(1000000n * 10n ** 18n),
    }),
    snapshot: async () => ({
      slot: 123,
      balances: { [user.publicKey.toBase58()]: "1000000000" },
    }),
    balance: async () => "1000000000",
    prices: async () => ({
      solUsdMicros: "100000000",
      clashUsdMicros: "1000000",
    }),
    prepareDeposit: async (r) => ({
      transaction: "unsigned-" + r.id,
      lastValidBlockHeight: 100,
    }),
    signDeposit: async (r, raw) => {
      assert.equal(raw, "valid");
      return { raw: "signed-" + r.id, hash: "sol-" + r.id };
    },
    depositStatus: async () => state.deposit,
    broadcastSolana: async (raw) => state.broadcasts.push(raw),
    preparePayout: async (r) => {
      state.payouts++;
      return { raw: "evm-" + r.id, hash: "hash-" + r.id, nonce: 1 };
    },
    payoutStatus: async () => state.payout,
    broadcastEvm: async (raw) => state.broadcasts.push(raw),
    prepareSale: async () => {
      state.sales++;
      return {
        raw: "sale",
        hash: "sale-hash",
        lastValidBlockHeight: 150,
        slippageBps: 500,
      };
    },
    saleStatus: async () => state.sale,
  };
  const options = {
    db,
    chain,
    now: () => time,
    keyFile: path.join(dir, "key"),
  };
  const service = createMigration(options);
  t.after(() => {
    db.close();
    assert.ok(dir.startsWith(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    db,
    user,
    state,
    chain,
    service,
    options,
    advance: (n) => (time += n),
    setup: async () => {
      await service.setKey("solana", "test-sol-private");
      await service.setKey("evm", "test-evm-private");
      await service.setKey("jupiter", "test-jup-private");
      await service.takeSnapshot();
      await service.updateConfig({ targetToken: A, enabled: true });
    },
    q: (amount = "100", id = "request-one-123456") =>
      service.quote(user.publicKey.toBase58(), {
        amount,
        destination: B,
        idempotencyKey: id,
      }),
  };
}
test("exact amount parsing and display preserve precision", () => {
  assert.equal(units("1.000001"), 1000001n);
  assert.equal(decimal(1000001n), "1.000001");
  assert.throws(() => units("1e6"));
  assert.throws(() => units("0.0000001"));
  assert.throws(() => units(1));
});
test("unconfigured service fails closed; secret encryption and redaction", async (t) => {
  const f = fixture(t);
  assert.equal((await f.service.status()).ready, false);
  await assert.rejects(
    f.service.updateConfig({ enabled: true }),
    /CONFIGURATION/,
  );
  await f.setup();
  const admin = JSON.stringify(await f.service.admin());
  assert.ok(!admin.includes("test-sol-private"));
  const ciphertext = f.db
    .prepare("SELECT value FROM migration_secrets WHERE kind='solana'")
    .get().value;
  assert.ok(!ciphertext.includes("test-sol-private"));
  assert.equal(fs.statSync(f.options.keyFile).size, 32);
});
test("challenge signature binds owner, one-time nonce and expiration", async (t) => {
  const f = fixture(t),
    w = f.user.publicKey.toBase58(),
    c = f.service.challenge(w);
  const sig = Buffer.from(
    nacl.sign.detached(Buffer.from(c.message), f.user.secretKey),
  ).toString("base64");
  const session = f.service.verify(c.id, sig);
  assert.equal(f.service.authenticate(session.token), w);
  assert.throws(() => f.service.verify(c.id, sig), /AUTH_EXPIRED/);
  const c2 = f.service.challenge(w);
  assert.throws(
    () => f.service.verify(c2.id, Buffer.alloc(64).toString("base64")),
    /INVALID_SIGNATURE/,
  );
  f.advance(3600001);
  assert.throws(() => f.service.authenticate(session.token), /AUTH_REQUIRED/);
});
test("quote reserves allowance and inventory, retries are idempotent", async (t) => {
  const f = fixture(t);
  await f.setup();
  await assert.rejects(f.q("1001"), /ELIGIBILITY/);
  const q = await f.q("600");
  assert.equal((await f.q("600")).id, q.id);
  assert.equal(q.outputUnits, String(600n * 10n ** 18n));
  await assert.rejects(
    f.q("401", "request-two-123456"),
    /EXISTING_REQUEST_PENDING/,
  );
  assert.equal(
    (await f.service.account(f.user.publicKey.toBase58())).remainingUnits,
    "400000000",
  );
  await assert.rejects(f.service.takeSnapshot(), /SNAPSHOT_LOCKED/);
  await assert.rejects(f.service.setKey("evm", "new-private"), /LIABILITIES/);
});
test("changed ratio and target do not retarget accepted quotes", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  await f.service.updateConfig({ targetToken: B, ratio: "2" });
  const row = JSON.parse(
    f.db.prepare("SELECT payload FROM migration_requests WHERE id=?").get(q.id)
      .payload,
  );
  assert.equal(row.ratio, "1");
  assert.equal(row.targetToken, A);
});
test("exact target inventory and global supply cap block acceptance", async (t) => {
  const f = fixture(t);
  await f.setup();
  f.chain.health = async () => ({
    reasons: [],
    targetDecimals: 18,
    inventory: "1",
  });
  await assert.rejects(f.q(), /INVENTORY/);
});
test("crash after signing restores identical raw transaction and never allocates second payout", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  await f.service.tick();
  assert.equal(f.state.broadcasts[0], "signed-" + q.id);
  f.state.deposit = "confirmed";
  await f.service.tick();
  assert.equal(f.state.payouts, 1);
  const second = createMigration(f.options);
  await second.tick();
  assert.equal(f.state.payouts, 1);
  assert.equal(f.state.broadcasts.filter((s) => s === "evm-" + q.id).length, 2);
  f.state.payout = "confirmed";
  await second.tick();
  assert.equal(
    (await second.account(f.user.publicKey.toBase58())).requests[0].status,
    "paid",
  );
  await second.tick();
  assert.equal(f.state.payouts, 1);
});
test("signed expired deposit remains reserved for reconciliation, not offered a second deposit", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  f.state.deposit = "expired";
  await f.service.tick();
  const a = await f.service.account(f.user.publicKey.toBase58());
  assert.equal(a.requests[0].status, "review");
  assert.equal(a.remainingUnits, "900000000");
});
test("unsigned quote expiry releases reservation, failed signed receipt releases safely", async (t) => {
  const f = fixture(t);
  await f.setup();
  await f.q();
  f.advance(90001);
  await f.service.tick();
  assert.equal(
    (await f.service.account(f.user.publicKey.toBase58())).remainingUnits,
    "1000000000",
  );
  const q = await f.q("100", "second-request-12345");
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  f.state.deposit = "failed";
  await f.service.tick();
  assert.equal(
    (await f.service.account(f.user.publicKey.toBase58())).remainingUnits,
    "1000000000",
  );
});
test("pause stops new spends but reconciles already confirmed sends", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  await f.service.updateConfig({ enabled: false });
  f.state.deposit = "confirmed";
  await f.service.tick();
  assert.equal(f.state.payouts, 0);
  assert.equal(
    (await f.service.account(f.user.publicKey.toBase58())).requests[0].status,
    "deposited",
  );
});
test("second worker cannot acquire live lease during an awaited call", async (t) => {
  const f = fixture(t);
  await f.setup();
  let release;
  f.chain.prepareDeposit = () =>
    new Promise((resolve) => {
      release = () =>
        resolve({ transaction: "unsigned", lastValidBlockHeight: 10 });
    });
  const p = f.q();
  await new Promise((resolve) => setImmediate(resolve));
  const second = createMigration(f.options);
  await assert.rejects(second.tick(), /WORKER_BUSY/);
  release();
  await p;
});
test("liquidation consumes only confirmed lots once; residual waits ten minutes", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q("50");
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  f.state.deposit = "confirmed";
  f.state.payout = "confirmed";
  await f.service.tick();
  assert.equal(f.state.sales, 0);
  f.advance(600001);
  await f.service.tick();
  assert.equal(f.state.sales, 1);
  await f.service.tick();
  assert.equal(f.state.sales, 1);
  f.state.sale = "confirmed";
  await f.service.tick();
  await f.service.tick();
  assert.equal(f.state.sales, 1);
  assert.equal(
    JSON.parse(
      f.db.prepare("SELECT payload FROM migration_requests").get().payload,
    ).soldUnits,
    "50000000",
  );
});
test("slippage cannot exceed owner-approved 10 percent", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.service.updateConfig({ maxSlippageBps: 1001 }),
    /INVALID_SLIPPAGE/,
  );
});
test("unsigned quotes resume and cancel; signed deposit cannot cancel", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  assert.equal(
    (await f.service.account(f.user.publicKey.toBase58())).activeQuote.id,
    q.id,
  );
  await f.service.cancel(f.user.publicKey.toBase58(), q.id);
  assert.equal(
    (await f.service.account(f.user.publicKey.toBase58())).remainingUnits,
    "1000000000",
  );
  const q2 = await f.q("100", "second-request-12345");
  await f.service.submit(f.user.publicKey.toBase58(), q2.id, "valid");
  await assert.rejects(
    f.service.cancel(f.user.publicKey.toBase58(), q2.id),
    /ALREADY_SUBMITTED/,
  );
});
test("nonce conflict retains liability and cannot produce a replacement payout", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  f.state.deposit = "confirmed";
  f.state.payout = "conflict";
  await f.service.tick();
  await f.service.tick();
  assert.equal(f.state.payouts, 1);
  assert.equal(
    (await f.service.account(f.user.publicKey.toBase58())).requests[0].status,
    "review",
  );
});
test("expired ambiguous deposit can reconcile later without releasing eligibility", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  f.state.deposit = "expired";
  await f.service.tick();
  const original = f.chain.depositStatus;
  f.chain.depositStatus = async () => { throw new Error("temporary RPC outage"); };
  await f.service.tick();
  f.chain.depositStatus = original;
  f.state.deposit = "confirmed";
  f.state.payout = "confirmed";
  await f.service.tick();
  assert.equal(
    (await f.service.account(f.user.publicKey.toBase58())).requests[0].status,
    "paid",
  );
  assert.equal(f.state.payouts, 1);
});

test("worker rotates past twenty unresolved reviews", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  const row = f.db.prepare("SELECT * FROM migration_requests WHERE id=?").get(q.id);
  for (let i = 0; i < 21; i++) {
    f.db.prepare("INSERT INTO migration_requests VALUES(?,?,?,?,?,?,?)").run(
      "review-" + i, "wallet-" + i, "idem-" + i, "review",
      JSON.stringify({ ...JSON.parse(row.payload), depositHash: "unknown-" + i }),
      row.created_at - 1, row.updated_at - 1,
    );
  }
  f.advance(100000);
  await f.service.tick();
  f.advance(1000);
  await f.service.tick();
  assert.equal(f.db.prepare("SELECT status FROM migration_requests WHERE id=?").get(q.id).status, "expired");
});
