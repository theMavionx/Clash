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
    saleBalance: async () => ({ tokenUnits: "1000000000", solLamports: "100000000" }),
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
      return { raw: "evm-" + r.id, hash: "hash-" + r.id, nonce: state.payouts };
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

test('shared deadline persists across restarts and only changes the admission deadline', async t => {
  const f = fixture(t);
  const before = f.service.config();
  const result = await f.service.setDeadline({ durationSeconds: 86400 });
  assert.equal(result.closesAt - f.options.now(), 86400000);
  assert.deepEqual(f.service.config(), { ...before, closesAt: result.closesAt });
  const restarted = createMigration(f.options);
  f.advance(3600000);
  assert.equal((await restarted.status()).closesAt, result.closesAt);
  assert.equal((await restarted.status()).serverTime, f.options.now());
  await restarted.setDeadline({ closesAt: null });
  assert.deepEqual(restarted.config(), before);
  assert.equal(f.state.broadcasts.length, 0);
});

test('deadline validation is strict and general config cannot overwrite it', async t => {
  const f = fixture(t);
  for (const input of [{}, { closesAt: 'tomorrow' }, { closesAt: 0 }, { closesAt: 1.5 },
    { closesAt: Infinity }, { closesAt: Date.UTC(2101, 0, 1) }, { durationSeconds: 59 },
    { durationSeconds: 31622401 }, { durationSeconds: '86400' },
    { durationSeconds: 86400, closesAt: null }, { closesAt: null, enabled: true }]) {
    await assert.rejects(f.service.setDeadline(input), /INVALID_DEADLINE/);
  }
  assert.throws(() => f.service.updateConfig({ closesAt: null }), /USE_DEADLINE_ENDPOINT/);
});

test('deadline boundary rejects new quotes and unsigned deposits but never blocks accepted settlement', async t => {
  const f = fixture(t); await f.setup();
  await f.service.setDeadline({ durationSeconds: 60 });
  const q = await f.q();
  assert.equal(q.expiresAt, f.options.now() + 60000);
  await f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid');
  f.advance(60000);
  assert.equal((await f.service.status()).closed, true);
  await assert.rejects(f.q('1', 'another-deadline-id'), /MIGRATION_CLOSED/);
  assert.equal((await f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid')).status, 'deposit_signed');
  f.state.deposit = 'confirmed';
  await f.service.tick(); f.advance(420000); await f.service.tick();
  assert.equal(f.state.payouts, 1);
  f.state.payout = 'confirmed'; await f.service.tick();
  assert.equal((await f.service.account(f.user.publicKey.toBase58())).requests[0].status, 'paid');
});

test('deadline closing during quote preparation or signing leaves no accepted deposit', async t => {
  const f = fixture(t); await f.setup();
  await f.service.setDeadline({ durationSeconds: 60 });
  const prepare = f.chain.prepareDeposit;
  f.chain.prepareDeposit = async r => { f.advance(60000); return prepare(r); };
  await assert.rejects(f.q(), /MIGRATION_CLOSED/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM migration_requests').get().n, 0);
  f.chain.prepareDeposit = prepare;
  await f.service.setDeadline({ durationSeconds: 60 });
  const q = await f.q(), sign = f.chain.signDeposit;
  f.chain.signDeposit = async (...args) => { f.advance(60000); return sign(...args); };
  await assert.rejects(f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid'), /MIGRATION_CLOSED/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM migration_sends').get().n, 0);
  assert.equal(f.db.prepare('SELECT status FROM migration_requests').get().status, 'quoted');
  assert.deepEqual(f.state.broadcasts, []);
});

test('admin deadline extension or removal restores admission without resetting eligibility', async t => {
  const f = fixture(t); await f.setup();
  await f.service.setDeadline({ closesAt: f.options.now() - 1 });
  await assert.rejects(f.q(), /MIGRATION_CLOSED/);
  await f.service.setDeadline({ durationSeconds: 86400 });
  const q = await f.q();
  await f.service.setDeadline({ closesAt: f.options.now() });
  await assert.rejects(f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid'), /MIGRATION_CLOSED/);
  await f.service.setDeadline({ closesAt: null });
  assert.equal((await f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid')).status, 'deposit_signed');
  assert.equal((await f.service.account(f.user.publicKey.toBase58())).usedUnits, q.inputUnits);
});
test("USDG fixed ratio pays one token per thousand and preserves quoted asset", async t => {
  const f = fixture(t);
  await f.setup();
  const { address } = require("../shared/migration-assets.json").robinhoodUsdg;
  f.chain.health = async () => ({ reasons: [], targetDecimals: 6, inventory: "100000000" });
  await f.service.updateConfig({ targetToken: address, ratio: "0.001" });
  const q = await f.q("1000");
  assert.equal(q.outputUnits, "1000000");
  assert.equal(q.targetToken.toLowerCase(), address.toLowerCase());
  await f.service.updateConfig({ targetToken: A, ratio: "1" });
  const same = await f.q("1000");
  assert.equal(same.outputUnits, "1000000");
  assert.equal(same.targetToken, q.targetToken);
  const account = await f.service.account(f.user.publicKey.toBase58());
  assert.equal(account.requests[0].targetToken, q.targetToken);
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

test("repeated challenges reuse live nonce and sessions remain bounded per wallet", async t => {
  const f = fixture(t), wallet = f.user.publicKey.toBase58();
  const first = f.service.challenge(wallet);
  for (let i = 0; i < 30; i++) assert.equal(f.service.challenge(wallet).id, first.id);
  assert.equal(f.db.prepare("SELECT count(*) n FROM migration_auth").get().n, 1);
  for (let i = 0; i < 10; i++) {
    const challenge = f.service.challenge(wallet);
    const signature = Buffer.from(nacl.sign.detached(Buffer.from(challenge.message), f.user.secretKey)).toString("base64");
    f.service.verify(challenge.id, signature);
    f.advance(1);
  }
  assert.equal(f.db.prepare("SELECT count(*) n FROM migration_sessions WHERE wallet=?").get(wallet).n, 8);
  assert.throws(() => f.service.verify("x".repeat(10000), "x".repeat(10000)), /INVALID_SIGNATURE/);
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
  assert.equal(f.state.payouts, 0);
  f.advance(420000);
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
test("Robinhood payout delay survives restart and cannot sign before its persisted deadline", async t => {
  const f = fixture(t); await f.setup();
  const q = await f.q();
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  await f.service.tick(); // Solana transmission is not delayed.
  assert.equal(f.state.broadcasts[0], "signed-" + q.id);
  assert.equal(JSON.parse(f.db.prepare('SELECT payload FROM migration_requests').get().payload).payoutNotBefore, undefined);
  f.state.deposit = "confirmed";
  await f.service.tick();
  const read = () => JSON.parse(f.db.prepare('SELECT payload FROM migration_requests').get().payload);
  const scheduled = read(), delay = scheduled.payoutNotBefore - scheduled.depositedAt;
  assert.ok(delay >= 150000 && delay <= 420000);
  assert.equal(f.state.payouts, 0);
  assert.equal((await f.service.account(f.user.publicKey.toBase58())).requests[0].payoutNotBefore, scheduled.payoutNotBefore);
  assert.equal(require('./migration_ledger').readMigrationLedger(f.db).requests[0].payoutNotBefore, scheduled.payoutNotBefore);
  const restarted = createMigration(f.options);
  f.advance(delay - 1);
  await restarted.tick();
  assert.equal(read().payoutNotBefore, scheduled.payoutNotBefore);
  assert.equal(f.state.payouts, 0);
  assert.equal(f.state.sales, 0);
  f.advance(1); await restarted.tick();
  assert.equal(f.state.payouts, 1);
  assert.equal(f.state.broadcasts.filter(s => s === 'evm-' + q.id).length, 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM migration_audit WHERE event LIKE 'payout_scheduled:%'").get().n, 1);
  f.state.payout = 'confirmed'; await restarted.tick(); await restarted.tick();
  assert.equal(f.state.payouts, 1);
});

test("pause retains scheduled delay and an elapsed schedule can resume without rerolling", async t => {
  const f = fixture(t); await f.setup();
  const q = await f.q();
  await f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid');
  f.state.deposit = 'confirmed';
  await f.service.updateConfig({ enabled: false }); await f.service.tick();
  const due = (await f.service.account(f.user.publicKey.toBase58())).requests[0].payoutNotBefore;
  f.advance(420001); await f.service.tick();
  assert.equal(f.state.payouts, 0);
  await f.service.updateConfig({ enabled: true }); await f.service.tick();
  assert.equal(f.state.payouts, 1);
  assert.equal((await f.service.account(f.user.publicKey.toBase58())).requests[0].payoutNotBefore, due);
});

test("legacy confirmed deposits schedule from original confirmation; corrupt deadlines fail closed", async t => {
  const f = fixture(t); await f.setup(); const q = await f.q();
  const p = JSON.parse(f.db.prepare('SELECT payload FROM migration_requests WHERE id=?').get(q.id).payload);
  p.depositedAt = f.options.now(); p.depositHash = 'legacy-deposit';
  f.db.prepare("UPDATE migration_requests SET status='deposited',payload=? WHERE id=?").run(JSON.stringify(p), q.id);
  f.advance(420001); await f.service.tick();
  const current = JSON.parse(f.db.prepare('SELECT payload FROM migration_requests WHERE id=?').get(q.id).payload);
  assert.equal(current.depositedAt, p.depositedAt);
  assert.ok(current.payoutNotBefore <= p.depositedAt + 420000);
  assert.equal(f.state.payouts, 1);
  // A different isolated ledger must not bypass a malformed stored deadline.
  const bad = fixture(t); await bad.setup(); const bq = await bad.q();
  const bp = JSON.parse(bad.db.prepare('SELECT payload FROM migration_requests').get().payload);
  bp.depositedAt = bad.options.now(); bp.payoutNotBefore = 'invalid';
  bad.db.prepare("UPDATE migration_requests SET status='deposited',payload=? WHERE id=?").run(JSON.stringify(bp), bq.id);
  await bad.service.tick(); assert.equal(bad.state.payouts, 0);
  assert.equal((await bad.service.account(bad.user.publicKey.toBase58())).requests[0].errorCode, 'INVALID_PAYOUT_SCHEDULE');
});

test("admin payout delay validates ranges, disable bypasses new waits but never rerolls existing ones", async t => {
  const f = fixture(t); await f.setup();
  for (const input of [{payoutDelayEnabled:'false'}, {payoutDelayMinSeconds:-1},
    {payoutDelayMaxSeconds:3601}, {payoutDelayMinSeconds:421}, {payoutDelayMaxSeconds:2.5}])
    await assert.rejects(f.service.updateConfig(input), /INVALID_PAYOUT_DELAY/);
  await f.service.updateConfig({payoutDelayMinSeconds:60,payoutDelayMaxSeconds:60});
  assert.deepEqual((await f.service.status()).payoutDelay,{enabled:true,minSeconds:60,maxSeconds:60});
  const q = await f.q(); await f.service.submit(f.user.publicKey.toBase58(),q.id,'valid');
  f.state.deposit='confirmed'; await f.service.tick();
  const before=(await f.service.account(f.user.publicKey.toBase58())).requests[0];
  assert.equal(before.payoutNotBefore-before.depositedAt,60000);
  await f.service.updateConfig({payoutDelayEnabled:false});
  await f.service.tick(); assert.equal(f.state.payouts,0);
  f.advance(60000); f.state.payout='confirmed'; await f.service.tick();
  assert.equal(f.state.payouts,1);
  const q2=await f.q('100','delay-disabled-request');
  await f.service.submit(f.user.publicKey.toBase58(),q2.id,'valid');
  await f.service.tick(); assert.equal(f.state.payouts,2);
  const after=(await f.service.account(f.user.publicKey.toBase58())).requests.find(r=>r.id===q2.id);
  assert.equal(after.payoutNotBefore,after.depositedAt);
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
  const q = await f.q("100");
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
    "100000000",
  );
});
test("slippage cannot exceed owner-approved 10 percent", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.service.updateConfig({ maxSlippageBps: 1001 }),
    /INVALID_SLIPPAGE/,
  );
});

async function paidLot(f, amount = "100") {
  await f.setup();
  const q = await f.q(amount);
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  f.state.deposit = "confirmed";
  f.state.payout = "confirmed";
  await f.service.tick();
  f.advance(420000);
  await f.service.tick();
  f.advance(600001);
  return q;
}

async function retryableSale(t) {
  const f = fixture(t);
  await paidLot(f);
  f.chain.prepareSale = async plan => {
    const n = ++f.state.sales;
    return { raw: 'retry-sale-' + n, hash: 'retry-hash-' + n, lastValidBlockHeight: 150 + n, slippageBps: plan.slippageBps };
  };
  f.chain.saleFailureEvidence = async () => ({ kind: 'slippage', code: 6001, slot: 999 });
  f.readSales = () => f.db.prepare('SELECT status,payload FROM migration_sales ORDER BY created_at').all().map(r => ({ ...JSON.parse(r.payload), status: r.status }));
  f.sold = () => JSON.parse(f.db.prepare('SELECT payload FROM migration_requests').get().payload).soldUnits;
  await f.service.tickSales();
  return f;
}

test('finalized Jupiter slippage retries after 30s with fresh bytes; restart and confirmation are exactly once', async t => {
  const f = await retryableSale(t), first = f.readSales()[0];
  f.state.sale = 'failed';
  assert.equal((await f.service.tickSales()).reason, 'SALE_RETRY_BACKOFF');
  assert.equal(f.sold(), '0');
  assert.equal(f.readSales()[0].failedSlot, 999);
  const restarted = createMigration(f.options);
  f.advance(29999);
  assert.equal((await restarted.tickSales()).reason, 'SALE_RETRY_BACKOFF');
  assert.equal(f.state.sales, 1);
  f.advance(1);
  assert.equal((await restarted.tickSales()).state, 'signed');
  const [parent, child] = f.readSales();
  assert.equal(parent.retryPending, false);
  assert.equal(parent.retriedBy, child.id);
  assert.equal(child.retryOf, first.id);
  assert.equal(child.retryRoot, first.id);
  assert.equal(child.retryCount, 1);
  assert.equal(child.slippageBps, 100);
  assert.notEqual(child.raw, first.raw);
  assert.notEqual(child.hash, first.hash);
  assert.equal(f.sold(), '0');
  f.state.sale = 'confirmed';
  await restarted.tickSales(); await restarted.tickSales();
  assert.equal(f.sold(), '100000000');
  assert.equal(f.state.sales, 2);
  assert.equal(f.readSales()[1].status, 'completed');
});

test('Jupiter slippage escalation stops at four children and 1000bps, never consumes failed lots', async t => {
  const f = await retryableSale(t);
  f.state.sale = 'failed';
  for (const bps of [100, 200, 500, 1000]) {
    assert.equal((await f.service.tickSales()).reason, 'SALE_RETRY_BACKOFF');
    f.advance(30000);
    assert.equal((await f.service.tickSales()).slippageBps, bps);
  }
  assert.equal((await f.service.tickSales()).reason, 'SALE_SLIPPAGE_RETRY_LIMIT');
  f.advance(60000); await f.service.tickSales();
  assert.equal(f.state.sales, 5);
  assert.equal(f.readSales().at(-1).retryCount, 4);
  assert.equal(f.readSales().at(-1).status, 'review');
  assert.equal(f.sold(), '0');
});

test('ambiguous, expired and unverified sale failure never authorize a replacement', async t => {
  for (const mode of ['expired', 'no-evidence', 'wrong-code', 'bad-slot', 'rpc-error', 'pending']) {
    await t.test(mode, async t => {
      const f = await retryableSale(t);
      f.state.sale = mode === 'expired' ? 'expired' : mode === 'pending' ? 'pending' : 'failed';
      f.chain.saleFailureEvidence = async () => {
        if (mode === 'rpc-error') throw new Error('provider unavailable');
        return mode === 'no-evidence' ? null : { kind: 'slippage', code: mode === 'wrong-code' ? 6002 : 6001, slot: mode === 'bad-slot' ? 0 : 999 };
      };
      await f.service.tickSales(); f.advance(60000); await f.service.tickSales();
      assert.equal(f.state.sales, 1);
      assert.equal(f.sold(), '0');
      assert.equal(f.readSales()[0].status, ['rpc-error', 'pending'].includes(mode) ? 'signed' : 'review');
    });
  }
});

test('pause and lowered slippage cap stop a scheduled fresh sale', async t => {
  const f = await retryableSale(t);
  f.state.sale = 'failed'; await f.service.tickSales(); f.advance(30000);
  await f.service.updateConfig({ enabled: false });
  assert.equal((await f.service.tickSales()).reason, 'MIGRATION_PAUSED');
  await f.service.updateConfig({ enabled: true, slippageBps: 50, maxSlippageBps: 50 });
  assert.equal((await f.service.tickSales()).reason, 'SALE_SLIPPAGE_RETRY_LIMIT');
  assert.equal(f.state.sales, 1);
  assert.equal(f.readSales()[0].retryPending, true);
});

test('retry child insertion failure rolls parent linkage back atomically', async t => {
  const f = await retryableSale(t);
  f.state.sale = 'failed'; await f.service.tickSales(); f.advance(30000);
  f.db.exec("CREATE TRIGGER test_reject_retry BEFORE INSERT ON migration_sales BEGIN SELECT RAISE(ABORT, 'test injection'); END");
  assert.equal((await f.service.tickSales()).reason, 'UPSTREAM_RETRY');
  assert.equal(f.readSales().length, 1);
  assert.equal(f.readSales()[0].retryPending, true);
  assert.equal(f.readSales()[0].retriedBy, undefined);
  assert.equal(f.sold(), '0');
  f.db.exec('DROP TRIGGER test_reject_retry');
  assert.equal((await f.service.tickSales()).state, 'signed');
  const [parent, child] = f.readSales();
  assert.equal(parent.retriedBy, child.id);
  assert.equal(child.retryCount, 1);
});

test('configuration lease prevents a concurrent slippage cap change during retry preparation', async t => {
  const f = await retryableSale(t);
  f.state.sale = 'failed'; await f.service.tickSales(); f.advance(30000);
  const prepare = f.chain.prepareSale;
  f.chain.prepareSale = async plan => {
    const result = await prepare(plan);
    await assert.rejects(f.service.updateConfig({ slippageBps: 50, maxSlippageBps: 50 }), /WORKER_BUSY/);
    return result;
  };
  assert.equal((await f.service.tickSales()).state, 'signed');
  assert.equal(f.readSales().length, 2);
  assert.equal(f.readSales()[1].slippageBps, 100);
  assert.equal(f.readSales()[0].retryPending, false);
  assert.equal(f.sold(), '0');
});

test("sales runner waits for actual finalized balance and gas; unrelated holdings are never sold", async t => {
  const f = fixture(t);
  await paidLot(f);
  f.chain.saleBalance = async () => ({ tokenUnits: "99999999", solLamports: "100000000" });
  assert.equal((await f.service.tickSales()).reason, "SALE_BALANCE_UNAVAILABLE");
  assert.equal(f.state.sales, 0);
  f.chain.saleBalance = async () => ({ tokenUnits: "999999999999", solLamports: "9999999" });
  assert.equal((await f.service.tickSales()).reason, "SOL_GAS_REQUIRED");
  f.chain.saleBalance = async () => ({ tokenUnits: "999999999999", solLamports: "100000000" });
  const preview = await f.service.salesPreview();
  assert.equal(preview.state, "ready");
  assert.equal(preview.inputUnits, "100000000");
  assert.equal(preview.slippageBps, 50);
  assert.equal(preview.maxSlippageBps, 1000);
  assert.equal(f.state.sales, 0);
  assert.equal((await f.service.tickSales()).state, "signed");
  assert.equal(f.state.sales, 1);
});

test("read-only sale preview cannot mutate DB or load any secret", async t => {
  const f = fixture(t);
  await paidLot(f);
  const file = path.join(path.dirname(f.options.keyFile), "preview.db");
  await f.db.backup(file);
  const before = fs.readFileSync(file);
  const db = new Database(file, { readonly: true });
  const preview = createMigration({ db, chain: f.chain, now: f.options.now });
  try {
    assert.equal((await preview.salesPreview()).state, "ready");
    await assert.rejects(preview.tickSales(), /READ_ONLY_WORKER/);
    assert.equal(f.state.sales, 0);
  } finally { db.close(); }
  assert.deepEqual(fs.readFileSync(file), before);
});

test("sales-only runner cannot confirm deposits or advance payouts", async t => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  f.state.deposit = "confirmed";
  f.advance(600001);
  assert.equal((await f.service.tickSales()).reason, "NO_CONFIRMED_DEPOSIT_LOTS");
  assert.equal(f.state.payouts, 0);
  assert.equal(f.state.broadcasts.length, 0);
});

test("confirmed deposit sells before delayed payout; restart and payout preserve exact amounts and sold units", async t => {
  const f = fixture(t); await f.setup();
  await f.service.updateConfig({ payoutDelayMinSeconds: 420, payoutDelayMaxSeconds: 420 });
  const q = await f.q('400');
  await f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid');
  await f.service.tick();
  assert.equal(f.state.sales, 0, 'unconfirmed source deposit never sells');
  f.state.deposit = 'confirmed';
  await f.service.tick();
  assert.equal(f.state.sales, 1, 'same reconciliation cycle makes the confirmed $400 batch eligible');
  assert.equal(f.state.payouts, 0, 'sale does not bypass payout delay');
  const read = () => { const r = f.db.prepare('SELECT status,payload FROM migration_requests').get(); return { ...JSON.parse(r.payload), status: r.status }; };
  const before = read();
  assert.equal(before.status, 'deposited');
  const restarted = createMigration(f.options);
  f.state.sale = 'confirmed';
  await restarted.tickSales();
  await restarted.tickSales();
  assert.equal(f.state.sales, 1, 'completed lot cannot be sold twice');
  assert.equal(read().soldUnits, '400000000');
  assert.equal(read().status, 'deposited', 'sale never marks user paid');
  f.advance(420000); f.state.payout = 'confirmed';
  await restarted.tick();
  const after = read();
  assert.equal(after.status, 'paid');
  assert.equal(after.soldUnits, '400000000');
  assert.equal(after.outputUnits, before.outputUnits);
  assert.equal(BigInt(after.outputUnits), BigInt(after.inputUnits) * 1000000000000n);
  assert.equal(after.destination, before.destination);
  assert.equal(after.payoutNotBefore, before.payoutNotBefore);
  assert.equal(f.state.payouts, 1);
  assert.equal(f.state.sales, 1);
});

test("sale eligibility admits confirmed deposited/payout-signed/paid only and requires persisted confirmation proof", async t => {
  const f = fixture(t); await f.setup();
  const q = await f.q('100');
  await f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid');
  f.state.deposit = 'confirmed'; await f.service.tick();
  const original = JSON.parse(f.db.prepare('SELECT payload FROM migration_requests').get().payload);
  f.advance(600001);
  for (const status of ['quoted', 'deposit_signed', 'deposit_failed', 'expired', 'review', 'unknown']) {
    f.db.prepare('UPDATE migration_requests SET status=?').run(status);
    assert.equal((await f.service.salesPreview()).reason, 'NO_CONFIRMED_DEPOSIT_LOTS', status);
  }
  for (const status of ['deposited', 'payout_signed', 'paid']) {
    f.db.prepare('UPDATE migration_requests SET status=?').run(status);
    assert.equal((await f.service.salesPreview()).state, 'ready', status);
    for (const invalid of [{ depositedAt: null }, { depositedAt: 0 }, { depositedAt: '1700000000000' }, { depositHash: '' }, { depositHash: null }]) {
      f.db.prepare('UPDATE migration_requests SET payload=?').run(JSON.stringify({ ...original, ...invalid }));
      assert.equal((await f.service.salesPreview()).reason, 'NO_CONFIRMED_DEPOSIT_LOTS');
    }
    f.db.prepare('UPDATE migration_requests SET payload=?').run(JSON.stringify(original));
  }
  assert.equal(f.state.sales, 0); assert.equal(f.state.payouts, 0);
});

test("confirmed unpaid deposits retain residual wait and hard $100 floor", async t => {
  const f = fixture(t); await f.setup();
  const q = await f.q('100');
  await f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid');
  f.state.deposit = 'confirmed'; await f.service.tick();
  assert.equal((await f.service.salesPreview()).reason, 'BATCH_THRESHOLD_WAIT');
  f.advance(600000);
  assert.equal((await f.service.salesPreview()).state, 'ready');
  f.chain.prices = async () => ({ clashUsdMicros: '999999', solUsdMicros: '100000000' });
  assert.equal((await f.service.salesPreview()).reason, 'SALE_BELOW_MINIMUM');
  assert.equal(f.state.payouts, 0); assert.equal(f.state.sales, 0);
});

test("sales runner shares lease with embedded worker and restores identical pending bytes", async t => {
  const f = fixture(t);
  await paidLot(f);
  let release;
  const original = f.chain.prepareSale;
  f.chain.prepareSale = () => new Promise(resolve => { release = async () => resolve(await original()); });
  const run = f.service.tickSales();
  await new Promise(resolve => setImmediate(resolve));
  const other = createMigration(f.options);
  await assert.rejects(other.tick(), /WORKER_BUSY/);
  await assert.rejects(other.tickSales(), /WORKER_BUSY/);
  await release();
  await run;
  f.chain.prepareSale = original;
  await other.tickSales();
  await other.tickSales();
  assert.equal(f.state.sales, 1);
  assert.deepEqual(f.state.broadcasts.filter(x => x === "sale"), ["sale", "sale"]);
  f.state.sale = "expired";
  assert.equal((await other.tickSales()).state, "review");
  const sent = f.state.broadcasts.length;
  await other.tickSales();
  assert.equal(f.state.sales, 1);
  assert.equal(f.state.broadcasts.length, sent);
  f.state.sale = "confirmed";
  await other.tickSales();
  await other.tickSales();
  assert.equal(JSON.parse(f.db.prepare("SELECT payload FROM migration_requests").get().payload).soldUnits, "100000000");
});

test("emergency pause during sale simulation prevents persisting or sending prepared trade", async t => {
  const f = fixture(t);
  await paidLot(f);
  const original = f.chain.prepareSale;
  f.chain.prepareSale = async () => {
    await f.service.updateConfig({ enabled: false });
    return original();
  };
  const before = f.state.broadcasts.length;
  assert.equal((await f.service.tickSales()).reason, "MIGRATION_PAUSED");
  assert.equal(f.db.prepare("SELECT count(*) n FROM migration_sales").get().n, 0);
  assert.equal(f.state.broadcasts.length, before);
});

test("wait diagnostics are deduplicated and never expose provider exception text", async t => {
  const f = fixture(t);
  await f.setup();
  f.chain.saleBalance = async () => { throw Error("https://provider/secret-key"); };
  await f.service.tickSales();
  await f.service.tickSales();
  const audit = f.db.prepare("SELECT event FROM migration_audit WHERE event LIKE 'sale_%'").all();
  assert.deepEqual(audit, [{ event: "sale_deferred:UPSTREAM_RETRY" }]);
});

test("idle time never permits a sale below $100; exact minimum is allowed", async t => {
  const f = fixture(t);
  await paidLot(f, "99.999999");
  f.advance(7 * 86400000);
  assert.equal((await f.service.tickSales()).reason, "SALE_BELOW_MINIMUM");
  assert.equal(f.state.sales, 0);
  const q = await f.q("0.000001", "minimum-top-up-123456");
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  await f.service.tick();
  f.advance(420000);
  await f.service.tick();
  assert.equal(f.state.sales, 1);
  const sale = JSON.parse(f.db.prepare("SELECT payload FROM migration_sales").get().payload);
  assert.equal(sale.inputUnits, "100000000");
  assert.equal(sale.lots.length, 2);
});

test("sub-$100 remainder waits after a completed $100 residual sale", async t => {
  const f = fixture(t);
  await paidLot(f, "150");
  assert.equal((await f.service.tickSales()).inputUnits, "100000000");
  f.state.sale = "confirmed";
  await f.service.tickSales();
  f.advance(86400000);
  assert.equal((await f.service.tickSales()).reason, "SALE_BELOW_MINIMUM");
  assert.equal(f.state.sales, 1);
  const row = JSON.parse(f.db.prepare("SELECT payload FROM migration_requests").get().payload);
  assert.equal(row.soldUnits, "100000000");
});

test("residual rounding cannot produce a batch just below the minimum", async t => {
  const f = fixture(t);
  await paidLot(f, "100");
  f.chain.prices = async () => ({ clashUsdMicros: "3000000", solUsdMicros: "100000000" });
  const plan = await f.service.salesPreview();
  assert.equal(plan.inputUnits, "33333334");
  assert.ok(BigInt(plan.inputUnits) * 3000000n / 1000000n >= units("100"));
});

test("normal $400 batches remain unchanged and config cannot bypass $100 floor", async t => {
  const f = fixture(t);
  await paidLot(f, "500");
  const sale = JSON.parse(f.db.prepare("SELECT payload FROM migration_sales").get().payload);
  assert.equal(sale.inputUnits, "400000000");
  await assert.rejects(f.service.updateConfig({ residualUsd: "99.999999" }), /SALE_MINIMUM_100_USD/);
  await assert.rejects(f.service.updateConfig({ batchUsd: "99", residualUsd: "99" }), /SALE_MINIMUM_100_USD/);
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
async function otherWalletQuote(f, id) {
  const wallet = Keypair.generate().publicKey.toBase58();
  f.db.prepare('INSERT INTO migration_entitlements VALUES(?,?)').run(wallet, '1000000000');
  const q = await f.service.quote(wallet, { amount: '20', destination: B, idempotencyKey: id });
  await f.service.submit(wallet, q.id, 'valid');
  return { wallet, q };
}

test('included payout releases next nonce before finality, survives restart, and never rebroadcasts included bytes', async t => {
  const f = fixture(t); await f.setup();
  await f.service.updateConfig({ payoutDelayEnabled: false });
  const q1 = await f.q('10');
  await f.service.submit(f.user.publicKey.toBase58(), q1.id, 'valid');
  await otherWalletQuote(f, 'next-request-123456');
  f.state.deposit = 'confirmed'; f.state.payout = 'included';
  await f.service.tick();
  assert.equal(f.state.payouts, 2);
  let account = await f.service.admin();
  assert.ok(account.requests.every(r => r.status === 'payout_signed' && r.payoutIncludedAt));
  assert.equal(f.state.broadcasts.filter(x => x.startsWith('evm-')).length, 0);
  const restarted = createMigration(f.options); await restarted.tick();
  assert.equal(f.state.payouts, 2);
  f.state.payout = 'confirmed'; await restarted.tick();
  account = await restarted.admin();
  assert.ok(account.requests.every(r => r.status === 'paid'));
  assert.equal(f.db.prepare("SELECT count(*) n FROM migration_sends WHERE kind='payout'").get().n, 2);
});

test('missing/orphaned inclusion and RPC failure block new signing despite persisted inclusion timestamp', async t => {
  const f = fixture(t); await f.setup(); await f.service.updateConfig({ payoutDelayEnabled: false });
  const q1 = await f.q('10'); await f.service.submit(f.user.publicKey.toBase58(), q1.id, 'valid');
  f.state.deposit = 'confirmed'; f.state.payout = 'included'; await f.service.tick();
  await otherWalletQuote(f, 'pending-next-123456');
  const original = f.chain.payoutStatus;
  f.chain.payoutStatus = async () => { throw Error('provider offline'); };
  await f.service.tick(); assert.equal(f.state.payouts, 1);
  f.chain.payoutStatus = original; f.state.payout = 'pending';
  await f.service.tick(); assert.equal(f.state.payouts, 1);
  assert.equal((await f.service.account(f.user.publicKey.toBase58())).requests.find(r => r.id === q1.id).payoutIncludedAt, null);
  assert.ok(f.state.broadcasts.includes('evm-' + q1.id), 'only original signed bytes retry');
  f.state.payout = 'included'; await f.service.tick();
  assert.equal(f.state.payouts, 2);
});

test('two included payouts reorg together: original bytes retry and third payout waits', async t => {
  const f = fixture(t); await f.setup(); await f.service.updateConfig({ payoutDelayEnabled: false });
  const first = await f.q('10'); await f.service.submit(f.user.publicKey.toBase58(), first.id, 'valid');
  const second = await otherWalletQuote(f, 'reorg-second-123456');
  f.state.deposit = 'confirmed'; f.state.payout = 'included'; await f.service.tick();
  assert.equal(f.state.payouts, 2);
  const third = await otherWalletQuote(f, 'reorg-third-123456');
  const restarted = createMigration(f.options); f.state.payout = 'pending'; await restarted.tick();
  assert.equal(f.state.payouts, 2);
  assert.equal((await restarted.account(third.wallet)).requests[0].status, 'deposited');
  assert.deepEqual(f.state.broadcasts.filter(x => x.startsWith('evm-')).sort(),
    ['evm-' + first.id, 'evm-' + second.q.id].sort());
  f.state.payout = 'included'; await restarted.tick();
  assert.equal(f.state.payouts, 3);
});

test('nonce rollback after inclusion check cannot persist a second payout at an already reserved nonce', async t => {
  const f = fixture(t); await f.setup(); await f.service.updateConfig({ payoutDelayEnabled: false });
  const q1 = await f.q('10'); await f.service.submit(f.user.publicKey.toBase58(), q1.id, 'valid');
  f.state.deposit = 'confirmed'; f.state.payout = 'included'; await f.service.tick();
  const { q: q2, wallet } = await otherWalletQuote(f, 'nonce-rollback-123456');
  f.chain.preparePayout = async () => ({ raw: 'never-send', hash: 'never-persist', nonce: 1 });
  await f.service.tick();
  const second = (await f.service.account(wallet)).requests.find(r => r.id === q2.id);
  assert.equal(second.status, 'deposited'); assert.equal(second.errorCode, 'PAYOUT_NONCE_ALREADY_RESERVED');
  assert.equal(second.payoutHash, null);
  assert.equal(f.db.prepare("SELECT count(*) n FROM migration_sends WHERE kind='payout'").get().n, 1);
  assert.ok(!f.state.broadcasts.includes('never-send'));
});

test('pause during payout preparation cannot persist or broadcast a new payout', async t => {
  const f = fixture(t); await f.setup(); await f.service.updateConfig({ payoutDelayEnabled: false });
  const q = await f.q('10'); await f.service.submit(f.user.publicKey.toBase58(), q.id, 'valid');
  f.state.deposit = 'confirmed';
  const original = f.chain.preparePayout;
  f.chain.preparePayout = async r => { await f.service.updateConfig({ enabled: false }); return original(r); };
  await f.service.tick();
  assert.equal(f.db.prepare("SELECT count(*) n FROM migration_sends WHERE kind='payout'").get().n, 0);
  assert.equal((await f.service.account(f.user.publicKey.toBase58())).requests[0].status, 'deposited');
});

test("nonce conflict retains liability and cannot produce a replacement payout", async (t) => {
  const f = fixture(t);
  await f.setup();
  const q = await f.q();
  await f.service.submit(f.user.publicKey.toBase58(), q.id, "valid");
  f.state.deposit = "confirmed";
  f.state.payout = "conflict";
  await f.service.tick();
  f.advance(420000);
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
  f.chain.depositStatus = async () => {
    throw new Error("temporary RPC outage");
  };
  await f.service.tick();
  f.chain.depositStatus = original;
  f.state.deposit = "confirmed";
  f.state.payout = "confirmed";
  await f.service.tick();
  f.advance(420000);
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
  const row = f.db
    .prepare("SELECT * FROM migration_requests WHERE id=?")
    .get(q.id);
  for (let i = 0; i < 21; i++) {
    f.db
      .prepare("INSERT INTO migration_requests VALUES(?,?,?,?,?,?,?)")
      .run(
        "review-" + i,
        "wallet-" + i,
        "idem-" + i,
        "review",
        JSON.stringify({
          ...JSON.parse(row.payload),
          depositHash: "unknown-" + i,
        }),
        row.created_at - 1,
        row.updated_at - 1,
      );
  }
  f.advance(100000);
  await f.service.tick();
  f.advance(1000);
  await f.service.tick();
  assert.equal(
    f.db.prepare("SELECT status FROM migration_requests WHERE id=?").get(q.id)
      .status,
    "expired",
  );
});

function historicalFixture(f) {
  f.chain.snapshotAt = async (at) => ({
    slot: 456,
    requestedAt: Date.parse(at),
    blockTime: Date.parse(at) - 1000,
  });
  const at = new Date(f.options.now() - 86400000).toISOString();
  return at;
}

async function settledSnapshotFixture(t) {
  const f = fixture(t);
  await f.setup();
  await f.q('100');
  f.db.prepare("UPDATE migration_requests SET status='paid'").run();
  await f.service.updateConfig({ enabled: false });
  const old = (await f.service.status()).snapshot;
  f.advance(60000);
  f.chain.snapshotAt = async at => ({ slot: 456, requestedAt: Date.parse(at), blockTime: Date.parse(at) });
  f.chain.historicalBalance = async () => '700000000';
  return { ...f, old, input: { at: new Date(f.options.now() - 1000).toISOString(),
    replaceSettled: true, expectedChecksum: old.checksum } };
}

test('settled snapshot replacement archives eligibility and preserves paid usage and immutable history', async t => {
  const f = await settledSnapshotFixture(t);
  const before = f.db.prepare('SELECT * FROM migration_requests').all();
  const admin = await f.service.admin();
  assert.equal(admin.canReplaceSnapshot, false);
  assert.equal(admin.canReplaceSettledSnapshot, true);
  await assert.rejects(f.service.takeSnapshot({ at: f.input.at }), /SNAPSHOT_LOCKED/);
  const next = await f.service.takeSnapshot(f.input);
  assert.equal(next.requestedAt, Date.parse(f.input.at));
  const archived = f.db.prepare('SELECT * FROM migration_snapshot_archive').get();
  assert.deepEqual(JSON.parse(archived.snapshot), f.old);
  assert.equal(archived.replacement_checksum, next.checksum);
  assert.equal(f.db.prepare('SELECT units FROM migration_entitlements_archive').get().units, '1000000000');
  assert.deepEqual(f.db.prepare('SELECT * FROM migration_requests').all(), before);
  const info = await f.service.account(f.user.publicKey.toBase58());
  assert.equal(info.eligibleUnits, '700000000');
  assert.equal(info.usedUnits, '100000000');
  assert.equal(info.remainingUnits, '600000000');
  assert.equal(f.service.config().enabled, false);
  assert.equal(f.state.payouts, 0);
  assert.deepEqual(f.state.broadcasts, []);
  await assert.rejects(f.service.takeSnapshot(f.input), /CONFIGURATION_CHANGED/);
});

test('snapshot replacement rejects enabled migration, every unresolved request and open sale', async t => {
  const f = await settledSnapshotFixture(t);
  await f.service.updateConfig({ enabled: true });
  await assert.rejects(f.service.takeSnapshot(f.input), /SNAPSHOT_REPLACEMENT_BLOCKED/);
  await f.service.updateConfig({ enabled: false });
  for (const status of ['quoted', 'deposit_signed', 'deposited', 'payout_signed', 'review', 'unknown']) {
    f.db.prepare('UPDATE migration_requests SET status=?').run(status);
    assert.equal((await f.service.admin()).canReplaceSettledSnapshot, false);
    await assert.rejects(f.service.takeSnapshot(f.input), /SNAPSHOT_REPLACEMENT_BLOCKED/);
  }
  f.db.prepare("UPDATE migration_requests SET status='paid'").run();
  for (const status of ['signed', 'review', 'unknown']) {
    f.db.prepare('INSERT OR REPLACE INTO migration_sales VALUES(?,?,?,?,?)').run('sale', status, '{}', 1, 1);
    await assert.rejects(f.service.takeSnapshot(f.input), /SNAPSHOT_REPLACEMENT_BLOCKED/);
  }
  f.db.prepare("UPDATE migration_sales SET status='completed'").run();
  await f.service.takeSnapshot(f.input);
});

test('snapshot replacement requires expected version and strictly later time and finalized slot', async t => {
  const f = await settledSnapshotFixture(t);
  await assert.rejects(f.service.takeSnapshot({ ...f.input, expectedChecksum: undefined }), /CONFIGURATION_CHANGED/);
  await assert.rejects(f.service.takeSnapshot({ ...f.input, expectedChecksum: 'stale' }), /CONFIGURATION_CHANGED/);
  await assert.rejects(f.service.takeSnapshot({ ...f.input, at: undefined }), /INVALID_SNAPSHOT_TIME/);
  await assert.rejects(f.service.takeSnapshot({ ...f.input, at: new Date(f.old.createdAt).toISOString() }), /SNAPSHOT_MUST_ADVANCE/);
  f.chain.snapshotAt = async at => ({ slot: f.old.slot, requestedAt: Date.parse(at), blockTime: Date.parse(at) });
  await assert.rejects(f.service.takeSnapshot(f.input), /SNAPSHOT_MUST_ADVANCE/);
  assert.equal((await f.service.status()).snapshot.checksum, f.old.checksum);
});

test('replacement provider failure and archive failure leave old snapshot and entitlements intact', async t => {
  const f = await settledSnapshotFixture(t), resolve = f.chain.snapshotAt;
  f.chain.snapshotAt = async () => { throw Error('provider failed'); };
  await assert.rejects(f.service.takeSnapshot(f.input), /provider failed/);
  f.chain.snapshotAt = resolve;
  f.db.exec("CREATE TRIGGER fail_snapshot_insert BEFORE INSERT ON migration_snapshot_meta BEGIN SELECT RAISE(ABORT,'test failure'); END");
  await assert.rejects(f.service.takeSnapshot(f.input), /test failure/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM migration_snapshot_archive').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM migration_entitlements_archive').get().n, 0);
  assert.equal((await f.service.status()).snapshot.checksum, f.old.checksum);
  assert.equal(f.db.prepare('SELECT units FROM migration_entitlements').get().units, '1000000000');
});

test('replacement rechecks pause and unresolved requests after historical network lookup', async t => {
  const f = await settledSnapshotFixture(t), resolve = f.chain.snapshotAt;
  f.chain.snapshotAt = async at => {
    f.db.prepare("UPDATE migration_requests SET status='review'").run();
    return resolve(at);
  };
  await assert.rejects(f.service.takeSnapshot(f.input), /SNAPSHOT_REPLACEMENT_BLOCKED/);
  assert.equal((await f.service.status()).snapshot.checksum, f.old.checksum);
  assert.equal(f.db.prepare('SELECT count(*) n FROM migration_snapshot_archive').get().n, 0);
});

test('new snapshot below already paid usage yields zero remaining without erasing payments', async t => {
  const f = await settledSnapshotFixture(t);
  await f.service.takeSnapshot(f.input);
  f.chain.historicalBalance = async () => '1000000';
  const info = await f.service.account(f.user.publicKey.toBase58());
  assert.equal(info.usedUnits, '100000000');
  assert.equal(info.remainingUnits, '0');
  assert.equal(info.requests[0].status, 'paid');
});
test("historical cutoff hydrates once, later purchases do not increase allocation, request locks replacement", async (t) => {
  const f = fixture(t);
  await f.setup();
  const at = historicalFixture(f);
  let calls = 0;
  f.chain.historicalBalance = async (_owner, slot) => {
    assert.equal(slot, 456);
    calls++;
    return "150000000";
  };
  const s = await f.service.takeSnapshot({ at });
  assert.equal(s.mode, "historical");
  assert.equal(s.requestedAt, Date.parse(at));
  assert.equal(s.wallets, 0);
  const info = await f.service.account(f.user.publicKey.toBase58());
  assert.equal(info.eligibleUnits, "150000000");
  assert.equal(info.balanceUnits, "1000000000");
  f.chain.historicalBalance = async () => {
    throw Error("must use immutable cache");
  };
  await f.service.account(f.user.publicKey.toBase58());
  await assert.rejects(f.q("151"), /ELIGIBILITY_EXCEEDED/);
  await f.q("100");
  assert.equal(calls, 1);
  await assert.rejects(f.service.takeSnapshot({ at }), /SNAPSHOT_LOCKED/);
  assert.equal((await f.service.status()).snapshot.wallets, 1);
});
test("direct quote hydrates history and a cached zero never falls back to current holdings", async (t) => {
  const f = fixture(t);
  await f.setup();
  const at = historicalFixture(f);
  let calls = 0;
  f.chain.historicalBalance = async () => {
    calls++;
    return "0";
  };
  await f.service.takeSnapshot({ at });
  await assert.rejects(f.q("1"), /ELIGIBILITY_EXCEEDED/);
  await assert.rejects(f.q("1"), /ELIGIBILITY_EXCEEDED/);
  assert.equal(calls, 1);
  assert.equal(
    (await f.service.account(f.user.publicKey.toBase58())).eligibleUnits,
    "0",
  );
});
test("historical provider failure preserves old snapshot and failed wallet read never caches zero", async (t) => {
  const f = fixture(t);
  await f.setup();
  const at = historicalFixture(f);
  const old = (await f.service.status()).snapshot;
  const resolve = f.chain.snapshotAt;
  f.chain.snapshotAt = async () => {
    throw Error("provider unavailable");
  };
  await assert.rejects(f.service.takeSnapshot({ at }));
  assert.equal((await f.service.status()).snapshot.checksum, old.checksum);
  f.chain.snapshotAt = resolve;
  await f.service.takeSnapshot({ at });
  f.chain.historicalBalance = async () => {
    throw Error("provider unavailable");
  };
  await assert.rejects(f.service.account(f.user.publicKey.toBase58()));
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM migration_entitlements").get().n,
    0,
  );
  await assert.rejects(
    f.service.takeSnapshot({
      at: new Date(f.options.now() + 10000).toISOString(),
    }),
    /INVALID_SNAPSHOT_TIME/,
  );
});
test("snapshot replacement during async history read cannot publish stale entitlement", async (t) => {
  const f = fixture(t);
  await f.setup();
  const at = historicalFixture(f);
  await f.service.takeSnapshot({ at });
  let finish;
  const started = new Promise((resolve) => {
    f.chain.historicalBalance = () => {
      resolve();
      return new Promise((r) => {
        finish = r;
      });
    };
  });
  const account = f.service.account(f.user.publicKey.toBase58());
  await started;
  await f.service.takeSnapshot({
    at: new Date(Date.parse(at) - 60000).toISOString(),
  });
  finish("100000000");
  await assert.rejects(account, /CONFIGURATION_CHANGED/);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM migration_entitlements").get().n,
    0,
  );
});
