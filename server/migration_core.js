"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const nacl = require("tweetnacl");
const { PublicKey } = require("@solana/web3.js");
const { isAddress, getAddress } = require("viem");
const SOURCE_MINT = "9mM1Mc4Ta9UJJ32v5qsHef91PiXi7EWyiSsqF5WXpump";
const DEFAULTS = Object.freeze({
  enabled: false,
  targetToken: "",
  ratio: "1",
  feeUsd: "2",
  batchUsd: "400",
  idleSeconds: 600,
  residualUsd: "100",
  slippageBps: 500,
  maxSlippageBps: 1000,
});
class MigrationError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
function check(ok, code, status = 400) {
  if (!ok) throw new MigrationError(code, status);
}
function units(value, decimals = 6) {
  check(
    typeof value === "string" && /^\d{1,18}(?:\.\d{1,18})?$/.test(value),
    "INVALID_AMOUNT",
  );
  const [a, b = ""] = value.split(".");
  check(b.length <= decimals, "AMOUNT_PRECISION");
  return (
    BigInt(a) * 10n ** BigInt(decimals) + BigInt(b.padEnd(decimals, "0") || "0")
  );
}
function decimal(n, d = 6) {
  const s = BigInt(n)
    .toString()
    .padStart(d + 1, "0");
  return d ? `${s.slice(0, -d)}.${s.slice(-d)}`.replace(/\.?0+$/, "") : s;
}
function wallet(value) {
  try {
    const p = new PublicKey(value);
    check(PublicKey.isOnCurve(p.toBytes()), "INVALID_WALLET");
    return p.toBase58();
  } catch {
    throw new MigrationError("INVALID_WALLET");
  }
}
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const active = "'quoted','deposit_signed','deposited','payout_signed','review'";
function createMigration({ db, chain, now = Date.now, keyFile }) {
  db.exec(`CREATE TABLE IF NOT EXISTS migration_config(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_secrets(kind TEXT PRIMARY KEY,value TEXT NOT NULL,address TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_snapshot(id INTEGER PRIMARY KEY CHECK(id=1),slot INTEGER NOT NULL,created_at INTEGER NOT NULL,total TEXT NOT NULL,wallets INTEGER NOT NULL,checksum TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_entitlements(wallet TEXT PRIMARY KEY,units TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_auth(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_sessions(hash TEXT PRIMARY KEY,wallet TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_requests(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,idem TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(wallet,idem));
    CREATE TABLE IF NOT EXISTS migration_sends(hash TEXT PRIMARY KEY,request_id TEXT NOT NULL,kind TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_sales(id TEXT PRIMARY KEY,status TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires INTEGER NOT NULL);`);
  db.prepare("INSERT OR IGNORE INTO migration_config VALUES(1,?,1)").run(
    JSON.stringify(DEFAULTS),
  );
  const owner = crypto.randomUUID();
  let busy = false;
  function config() {
    return {
      ...DEFAULTS,
      ...JSON.parse(
        db.prepare("SELECT value FROM migration_config WHERE id=1").get().value,
      ),
    };
  }
  function audit(event) {
    db.prepare("INSERT INTO migration_audit(event,at) VALUES(?,?)").run(
      event,
      now(),
    );
  }
  function snapshot() {
    const s = db.prepare("SELECT * FROM migration_snapshot").get();
    return s
      ? {
          slot: s.slot,
          createdAt: s.created_at,
          totalUnits: s.total,
          wallets: s.wallets,
          checksum: s.checksum,
        }
      : null;
  }
  function master(create = false) {
    check(keyFile, "ENCRYPTION_UNAVAILABLE", 503);
    if (!fs.existsSync(keyFile)) {
      check(
        create && !db.prepare("SELECT 1 FROM migration_secrets LIMIT 1").get(),
        "ENCRYPTION_UNAVAILABLE",
        503,
      );
      fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
      fs.writeFileSync(keyFile, crypto.randomBytes(32), {
        flag: "wx",
        mode: 0o600,
      });
    }
    const stat = fs.statSync(keyFile);
    check(
      stat.isFile() &&
        stat.size === 32 &&
        (process.platform === "win32" || !(stat.mode & 0o077)),
      "ENCRYPTION_UNAVAILABLE",
      503,
    );
    return fs.readFileSync(keyFile);
  }
  function encrypt(kind, secret) {
    const iv = crypto.randomBytes(12),
      c = crypto.createCipheriv("aes-256-gcm", master(true), iv);
    c.setAAD(Buffer.from("migration:" + kind));
    const data = Buffer.concat([c.update(secret, "utf8"), c.final()]);
    return [iv, c.getAuthTag(), data]
      .map((b) => b.toString("base64"))
      .join(".");
  }
  function secret(kind) {
    const row = db
      .prepare("SELECT value FROM migration_secrets WHERE kind=?")
      .get(kind);
    if (!row) return null;
    try {
      const [iv, tag, data] = row.value
        .split(".")
        .map((v) => Buffer.from(v, "base64"));
      const d = crypto.createDecipheriv("aes-256-gcm", master(), iv);
      d.setAAD(Buffer.from("migration:" + kind));
      d.setAuthTag(tag);
      return Buffer.concat([d.update(data), d.final()]).toString();
    } catch {
      throw new MigrationError("ENCRYPTION_UNAVAILABLE", 503);
    }
  }
  const address = (kind) =>
    db.prepare("SELECT address FROM migration_secrets WHERE kind=?").get(kind)
      ?.address || "";
  function prepareRpc() {
    chain.setRpcKey?.(secret("robinhoodRpc"));
  }
  function rows() {
    return db
      .prepare("SELECT * FROM migration_requests ORDER BY created_at")
      .all()
      .map((r) => ({
        ...JSON.parse(r.payload),
        id: r.id,
        wallet: r.wallet,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
  }
  function sales() {
    return db
      .prepare("SELECT * FROM migration_sales ORDER BY created_at")
      .all()
      .map((r) => ({
        ...JSON.parse(r.payload),
        id: r.id,
        status: r.status,
        createdAt: r.created_at,
      }));
  }
  function fence() {
    const l = db.prepare("SELECT * FROM migration_lease WHERE id=1").get();
    check(l?.owner === owner && l.expires > now(), "WORKER_LEASE_LOST", 409);
  }
  function save(r) {
    fence();
    const p = { ...r };
    delete p.status;
    db.prepare(
      "UPDATE migration_requests SET status=?,payload=?,updated_at=? WHERE id=?",
    ).run(r.status, JSON.stringify(p), now(), r.id);
  }
  function saveSale(r) {
    fence();
    const p = { ...r };
    delete p.status;
    db.prepare(
      "UPDATE migration_sales SET status=?,payload=?,updated_at=? WHERE id=?",
    ).run(r.status, JSON.stringify(p), now(), r.id);
  }
  function publicRequest(r) {
    return {
      id: r.id,
      inputUnits: r.inputUnits,
      outputUnits: r.outputUnits,
      targetDecimals: r.targetDecimals,
      destination: r.destination,
      status: r.status,
      depositHash: r.depositHash || null,
      payoutHash: r.payoutHash || null,
      createdAt: r.createdAt,
      errorCode: r.errorCode || null,
    };
  }
  function pending() {
    return db
      .prepare(
        `SELECT 1 FROM migration_requests WHERE status IN (${active}) LIMIT 1`,
      )
      .get();
  }
  function lease() {
    return db
      .transaction(() => {
        const l = db.prepare("SELECT * FROM migration_lease WHERE id=1").get();
        check(!l || l.expires < now() || l.owner === owner, "WORKER_BUSY", 409);
        db.prepare(
          "INSERT INTO migration_lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires",
        ).run(owner, now() + 300000);
      })
      .immediate();
  }
  async function exclusive(fn) {
    check(!busy, "WORKER_BUSY", 409);
    busy = true;
    let heartbeat;
    try {
      lease();
      heartbeat = setInterval(() => {
        db.prepare(
          "UPDATE migration_lease SET expires=? WHERE owner=? AND expires>?",
        ).run(now() + 300000, owner, now());
      }, 10000);
      heartbeat.unref();
      return await fn();
    } finally {
      clearInterval(heartbeat);
      db.prepare("DELETE FROM migration_lease WHERE owner=?").run(owner);
      busy = false;
    }
  }
  function configuredReasons() {
    const c = config(),
      reasons = [];
    if (!c.targetToken) reasons.push("TARGET_TOKEN_REQUIRED");
    if (!snapshot()) reasons.push("SNAPSHOT_REQUIRED");
    for (const k of ["solana", "evm", "jupiter"])
      if (!address(k)) reasons.push(k.toUpperCase() + "_KEY_REQUIRED");
    return reasons;
  }
  async function readiness() {
    const reasons = configuredReasons();
    if (!reasons.length) {
      try {
        prepareRpc();
        const c = config();
        const r = await chain.health(c, {
          solana: secret("solana"),
          evm: secret("evm"),
        });
        reasons.push(...r.reasons);
      } catch (e) {
        reasons.push(e instanceof MigrationError ? e.code : "RPC_UNAVAILABLE");
      }
    }
    return { ready: !reasons.length, reasons };
  }
  async function status() {
    const c = config(),
      r = await readiness();
    return {
      ...r,
      enabled: c.enabled,
      sourceMint: SOURCE_MINT,
      sourceDecimals: 6,
      chainId: 4663,
      targetToken: c.targetToken,
      ratio: c.ratio,
      feeUsd: c.feeUsd,
      snapshot: snapshot(),
    };
  }
  function updateConfig(input) {
    // Emergency pause never waits for a worker/network lease or decrypts keys.
    if (input.enabled === false && Object.keys(input).length === 1) {
      const c = { ...config(), enabled: false };
      db.prepare(
        "UPDATE migration_config SET value=?,revision=revision+1 WHERE id=1",
      ).run(JSON.stringify(c));
      audit("emergency_pause");
      return Promise.resolve(c);
    }
    return exclusive(async () => {
      const revision = db
        .prepare("SELECT revision FROM migration_config WHERE id=1")
        .get().revision;
      const old = config(),
        c = { ...old };
      for (const k of Object.keys(DEFAULTS))
        if (input[k] !== undefined) c[k] = input[k];
      check(typeof c.enabled === "boolean", "INVALID_CONFIG");
      check(
        c.targetToken === "" || isAddress(c.targetToken),
        "INVALID_TARGET_TOKEN",
      );
      if (c.targetToken) c.targetToken = getAddress(c.targetToken);
      for (const k of ["ratio", "feeUsd", "batchUsd", "residualUsd"])
        check(
          units(c[k]) > 0n && units(c[k]) <= 1000000n * 1000000n,
          "INVALID_CONFIG",
        );
      check(units(c.residualUsd) <= units(c.batchUsd), "INVALID_CONFIG");
      check(
        Number.isInteger(c.idleSeconds) &&
          c.idleSeconds >= 60 &&
          c.idleSeconds <= 86400,
        "INVALID_CONFIG",
      );
      check(
        Number.isInteger(c.slippageBps) &&
          Number.isInteger(c.maxSlippageBps) &&
          c.slippageBps >= 1 &&
          c.slippageBps <= c.maxSlippageBps &&
          c.maxSlippageBps <= 1000,
        "INVALID_SLIPPAGE",
      );
      if (c.enabled) {
        prepareRpc();
        check(
          !configuredReasons().filter((x) => x !== "TARGET_TOKEN_REQUIRED")
            .length && c.targetToken,
          "CONFIGURATION_INCOMPLETE",
          409,
        );
        const h = await chain.health(c, {
          solana: secret("solana"),
          evm: secret("evm"),
        });
        check(!h.reasons.length, "TREASURY_NOT_READY", 409);
      }
      fence();
      check(
        db
          .prepare(
            "UPDATE migration_config SET value=?,revision=revision+1 WHERE id=1 AND revision=?",
          )
          .run(JSON.stringify(c), revision).changes === 1,
        "CONFIGURATION_CHANGED",
        409,
      );
      audit("configuration_updated");
      return c;
    });
  }
  async function setKey(kind, value) {
    return exclusive(async () => {
      check(
        ["solana", "evm", "jupiter", "robinhoodRpc"].includes(kind) &&
          typeof value === "string" &&
          value.length < 2048,
        "INVALID_KEY",
      );
      check(
        ["jupiter", "robinhoodRpc"].includes(kind) ||
          (!pending() &&
            !sales().some((r) => r.status !== "completed") &&
            !rows().some(
              (r) =>
                r.status === "paid" &&
                BigInt(r.soldUnits || 0) < BigInt(r.inputUnits),
            )),
        "KEY_ROTATION_HAS_LIABILITIES",
        409,
      );
      const addr = await chain.keyAddress(kind, value);
      const enc = encrypt(kind, value);
      fence();
      db.prepare(
        "INSERT INTO migration_secrets VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET value=excluded.value,address=excluded.address",
      ).run(kind, enc, addr);
      audit("key_updated:" + kind);
      return { address: addr };
    });
  }
  async function takeSnapshot() {
    return exclusive(async () => {
      check(
        !db.prepare("SELECT 1 FROM migration_requests LIMIT 1").get(),
        "SNAPSHOT_LOCKED",
        409,
      );
      const s = await chain.snapshot(SOURCE_MINT);
      fence();
      const entries = Object.entries(s.balances)
        .filter(([w]) => PublicKey.isOnCurve(new PublicKey(w).toBytes()))
        .sort(([a], [b]) => a.localeCompare(b));
      const total = entries.reduce((n, [, v]) => n + BigInt(v), 0n);
      check(
        total > 0n &&
          total <= 1000000000n * 1000000n &&
          Number.isSafeInteger(s.slot),
        "INVALID_SNAPSHOT",
      );
      db.transaction(() => {
        check(
          !db.prepare("SELECT 1 FROM migration_requests LIMIT 1").get(),
          "SNAPSHOT_LOCKED",
          409,
        );
        db.prepare("DELETE FROM migration_entitlements").run();
        const insert = db.prepare(
          "INSERT INTO migration_entitlements VALUES(?,?)",
        );
        for (const [w, n] of entries) {
          if (PublicKey.isOnCurve(new PublicKey(w).toBytes()))
            insert.run(w, String(n));
        }
        db.prepare(
          "INSERT OR REPLACE INTO migration_snapshot VALUES(1,?,?,?,?,?)",
        ).run(
          s.slot,
          now(),
          String(total),
          entries.length,
          digest(JSON.stringify(entries)),
        );
        audit("snapshot_published");
      }).immediate();
      return snapshot();
    });
  }
  function challenge(w) {
    w = wallet(w);
    db.prepare("DELETE FROM migration_auth WHERE expires<?").run(now());
    db.prepare("DELETE FROM migration_sessions WHERE expires<?").run(now());
    const id = crypto.randomUUID();
    const message = `clashofperps.fun\nCLASH migration wallet verification\nWallet: ${w}\nNonce: ${id}\nExpires: ${new Date(now() + 300000).toISOString()}\nThis signature does not transfer tokens.`;
    db.prepare("INSERT INTO migration_auth VALUES(?,?,?,?)").run(
      id,
      w,
      message,
      now() + 300000,
    );
    return { id, message };
  }
  function verify(id, sig) {
    return db
      .transaction(() => {
        const r = db.prepare("SELECT * FROM migration_auth WHERE id=?").get(id);
        check(r && r.expires > now(), "AUTH_EXPIRED", 401);
        const b = Buffer.from(String(sig), "base64");
        check(
          b.length === 64 &&
            nacl.sign.detached.verify(
              Buffer.from(r.message),
              b,
              new PublicKey(r.wallet).toBytes(),
            ),
          "INVALID_SIGNATURE",
          401,
        );
        db.prepare("DELETE FROM migration_auth WHERE id=?").run(id);
        const token = crypto.randomBytes(32).toString("base64url"),
          expiresAt = now() + 3600000;
        db.prepare("INSERT INTO migration_sessions VALUES(?,?,?)").run(
          digest(token),
          r.wallet,
          expiresAt,
        );
        return { token, wallet: r.wallet, expiresAt };
      })
      .immediate();
  }
  function authenticate(token) {
    check(
      typeof token === "string" && token.length < 128,
      "AUTH_REQUIRED",
      401,
    );
    const r = db
      .prepare("SELECT * FROM migration_sessions WHERE hash=?")
      .get(digest(token));
    check(r && r.expires > now(), "AUTH_REQUIRED", 401);
    return r.wallet;
  }
  function entitlement(w) {
    const eligible = BigInt(
      db
        .prepare("SELECT units FROM migration_entitlements WHERE wallet=?")
        .get(w)?.units || 0,
    );
    const used = rows()
      .filter(
        (r) =>
          r.wallet === w && !["expired", "deposit_failed"].includes(r.status),
      )
      .reduce((s, r) => s + BigInt(r.inputUnits), 0n);
    return {
      eligibleUnits: String(eligible),
      usedUnits: String(used),
      remainingUnits: String(eligible > used ? eligible - used : 0n),
    };
  }
  async function account(w) {
    const own = rows()
      .filter((r) => r.wallet === w)
      .reverse();
    return {
      wallet: w,
      ...entitlement(w),
      balanceUnits: await chain.balance(w, SOURCE_MINT),
      requests: own.slice(0, 100).map(publicRequest),
      activeQuote: own.some((r) => r.status === "quoted" && r.expiresAt > now())
        ? quoteView(
            own.find((r) => r.status === "quoted" && r.expiresAt > now()),
          )
        : null,
    };
  }
  async function cancel(w, id) {
    return exclusive(async () => {
      const r = rows().find((r) => r.id === id && r.wallet === w);
      check(r, "REQUEST_NOT_FOUND", 404);
      check(
        r.status === "quoted" || r.status === "expired",
        "DEPOSIT_ALREADY_SUBMITTED",
        409,
      );
      r.status = "expired";
      save(r);
      return publicRequest(r);
    });
  }
  function quoteView(r) {
    return {
      id: r.id,
      inputUnits: r.inputUnits,
      outputUnits: r.outputUnits,
      targetDecimals: r.targetDecimals,
      destination: r.destination,
      feeLamports: r.feeLamports,
      expiresAt: r.expiresAt,
      transaction: r.transaction,
      sourceMint: SOURCE_MINT,
      targetToken: r.targetToken,
      ratio: r.ratio,
      status: r.status,
    };
  }
  async function quote(w, input) {
    return exclusive(async () => {
      prepareRpc();
      check(
        typeof input.idempotencyKey === "string" &&
          /^[\w-]{16,80}$/.test(input.idempotencyKey),
        "INVALID_IDEMPOTENCY",
      );
      const old = db
        .prepare("SELECT id FROM migration_requests WHERE wallet=? AND idem=?")
        .get(w, input.idempotencyKey);
      if (old) return quoteView(rows().find((r) => r.id === old.id));
      const c = config(),
        revision = db
          .prepare("SELECT revision FROM migration_config WHERE id=1")
          .get().revision;
      check(c.enabled, "MIGRATION_PAUSED", 409);
      check(!configuredReasons().length, "CONFIGURATION_INCOMPLETE", 409);
      check(
        !rows().some(
          (r) =>
            r.wallet === w &&
            !["paid", "expired", "deposit_failed"].includes(r.status),
        ),
        "EXISTING_REQUEST_PENDING",
        409,
      );
      check(
        rows().filter(
          (r) =>
            r.wallet === w &&
            r.status === "deposit_failed" &&
            r.createdAt > now() - 86400000,
        ).length < 3,
        "SPONSORED_FEE_RETRY_LIMIT",
        429,
      );
      check(
        isAddress(input.destination) && !/^0x0{40}$/i.test(input.destination),
        "INVALID_DESTINATION",
      );
      const amount = units(input.amount);
      check(
        amount > 0n && amount <= BigInt(entitlement(w).remainingUnits),
        "ELIGIBILITY_EXCEEDED",
      );
      const h = await chain.health(c, {
        solana: secret("solana"),
        evm: secret("evm"),
      });
      check(!h.reasons.length, "TREASURY_NOT_READY", 409);
      const output =
        (amount * units(c.ratio) * 10n ** BigInt(h.targetDecimals)) /
        (1000000n * 1000000n);
      check(output > 0n, "AMOUNT_TOO_SMALL");
      const locked = rows()
        .filter(
          (r) =>
            !["paid", "expired", "deposit_failed"].includes(r.status) &&
            r.targetToken.toLowerCase() === c.targetToken.toLowerCase(),
        )
        .reduce((s, r) => s + BigInt(r.outputUnits), 0n);
      check(
        output + locked <= BigInt(h.inventory),
        "INSUFFICIENT_INVENTORY",
        409,
      );
      check(
        rows()
          .filter((r) => !["expired", "deposit_failed"].includes(r.status))
          .reduce(
            (s, r) =>
              s +
              (BigInt(r.outputUnits) * 10n ** 18n) /
                10n ** BigInt(r.targetDecimals),
            0n,
          ) +
          (output * 10n ** 18n) / 10n ** BigInt(h.targetDecimals) <=
          1000000000n * 10n ** 18n,
        "SUPPLY_CAP",
      );
      const prices = await chain.prices();
      const fee =
        (units(c.feeUsd, 6) * 1000000000n + BigInt(prices.solUsdMicros) - 1n) /
        BigInt(prices.solUsdMicros);
      const id = crypto.randomUUID(),
        r = {
          id,
          wallet: w,
          status: "quoted",
          createdAt: now(),
          inputUnits: String(amount),
          outputUnits: String(output),
          targetDecimals: h.targetDecimals,
          targetToken: c.targetToken,
          destination: getAddress(input.destination),
          ratio: c.ratio,
          feeLamports: String(fee),
          expiresAt: now() + 90000,
          solanaTreasury: address("solana"),
          evmTreasury: address("evm"),
          soldUnits: "0",
        };
      Object.assign(r, await chain.prepareDeposit(r));
      fence();
      db.transaction(() => {
        check(
          config().enabled &&
            db.prepare("SELECT revision FROM migration_config WHERE id=1").get()
              .revision === revision,
          "CONFIGURATION_CHANGED",
          409,
        );
        check(
          amount <= BigInt(entitlement(w).remainingUnits),
          "ELIGIBILITY_EXCEEDED",
        );
        db.prepare("INSERT INTO migration_requests VALUES(?,?,?,?,?,?,?)").run(
          id,
          w,
          input.idempotencyKey,
          "quoted",
          JSON.stringify(r),
          now(),
          now(),
        );
        audit("quote_created:" + id);
      }).immediate();
      return quoteView(r);
    });
  }
  async function submit(w, id, transaction) {
    return exclusive(async () => {
      const r = rows().find((r) => r.id === id && r.wallet === w);
      check(r, "REQUEST_NOT_FOUND", 404);
      if (r.status !== "quoted") return publicRequest(r);
      check(config().enabled, "MIGRATION_PAUSED", 409);
      check(r.expiresAt > now(), "QUOTE_EXPIRED", 409);
      const signed = await chain.signDeposit(r, transaction, secret("solana"));
      r.depositRaw = signed.raw;
      r.depositHash = signed.hash;
      r.status = "deposit_signed";
      db.transaction(() => {
        db.prepare("INSERT INTO migration_sends VALUES(?,?,?)").run(
          signed.hash,
          r.id,
          "deposit",
        );
        save(r);
        audit("deposit_signed:" + id);
      }).immediate();
      return publicRequest(r);
    });
  }
  async function tick() {
    return exclusive(async () => {
      prepareRpc();
      // Reconcile existing sends even while paused; never create a new payout/sale while paused.
      for (const r of rows()
        .filter(
          (r) => !["paid", "expired", "deposit_failed"].includes(r.status),
        )
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .slice(0, 20)) {
        try {
          if (r.status === "review") {
            if (
              !r.payoutHash && r.depositHash &&
              (await chain.depositStatus(r)) === "confirmed"
            ) {
              r.status = "deposited";
              r.depositedAt = now();
              r.errorCode = null;
              save(r);
            } else if (
              r.payoutHash &&
              (await chain.payoutStatus(r)) === "confirmed"
            ) {
              r.status = "paid";
              r.paidAt = now();
              r.errorCode = null;
              save(r);
              audit("payout_reconciled:" + r.id);
            }
          }
          if (r.status === "quoted" && r.expiresAt < now()) {
            r.status = "expired";
            save(r);
            continue;
          }
          if (r.status === "deposit_signed") {
            const result = await chain.depositStatus(r);
            if (result === "confirmed") {
              r.status = "deposited";
              r.depositedAt = now();
              save(r);
            } else if (result === "failed") {
              r.status = "deposit_failed";
              save(r);
            } else if (result === "expired") {
              r.status = "review";
              r.errorCode = "DEPOSIT_REQUIRES_RECONCILIATION";
              save(r);
            } else if (config().enabled) {
              fence();
              await chain.broadcastSolana(r.depositRaw);
            }
          }
          if (r.status === "deposited" && config().enabled) {
            // Serialize payout nonces: only one unresolved EVM transaction is allowed.
            if (
              rows().some(
                (x) => x.status === "payout_signed" || x.status === "review",
              )
            )
              continue;
            const signed = await chain.preparePayout(r, secret("evm"));
            r.payoutRaw = signed.raw;
            r.payoutHash = signed.hash;
            r.payoutNonce = signed.nonce;
            r.status = "payout_signed";
            db.transaction(() => {
              db.prepare("INSERT INTO migration_sends VALUES(?,?,?)").run(
                signed.hash,
                r.id,
                "payout",
              );
              save(r);
            }).immediate();
          }
          if (r.status === "payout_signed") {
            const result = await chain.payoutStatus(r);
            if (result === "confirmed") {
              r.status = "paid";
              r.paidAt = now();
              r.errorCode = null;
              save(r);
              audit("payout_confirmed:" + r.id);
            } else if (result === "failed" || result === "conflict") {
              r.status = "review";
              r.errorCode = "PAYOUT_REQUIRES_RECONCILIATION";
              save(r);
            } else if (config().enabled) {
              fence();
              await chain.broadcastEvm(r.payoutRaw);
            }
          }
        } catch (e) {
          r.errorCode = e instanceof MigrationError ? e.code : "UPSTREAM_RETRY";
          save(r);
        } finally {
          fence();
          db.prepare("UPDATE migration_requests SET updated_at=? WHERE id=?")
            .run(now(), r.id);
        }
      }
      await processSales();
      return { ok: true };
    });
  }
  async function processSales() {
    let open = sales().find(
      (r) => r.status === "signed" || r.status === "review",
    );
    if (open) {
      try {
        const result = await chain.saleStatus(open);
        if (result === "confirmed") {
          db.transaction(() => {
            for (const l of open.lots) {
              const r = rows().find((x) => x.id === l.id);
              r.soldUnits = String(BigInt(r.soldUnits) + BigInt(l.units));
              save(r);
            }
            open.status = "completed";
            saveSale(open);
            audit("sale_confirmed:" + open.id);
          }).immediate();
        } else if (result === "failed" || result === "expired") {
          open.status = "review";
          open.errorCode = "SALE_REQUIRES_RECONCILIATION";
          saveSale(open);
        } else if (config().enabled && open.status === "signed") {
          fence();
          await chain.broadcastSolana(open.raw);
        }
      } catch {
        /* Pending bytes remain authoritative; no replacement trade. */
      }
      return;
    }
    const c = config();
    if (!c.enabled) return;
    const available = rows().filter(
      (r) =>
        r.status === "paid" && BigInt(r.inputUnits) > BigInt(r.soldUnits || 0),
    );
    if (!available.length) return;
    try {
      const price = await chain.prices(),
        total = available.reduce(
          (s, r) => s + BigInt(r.inputUnits) - BigInt(r.soldUnits || 0),
          0n,
        ),
        value = (total * BigInt(price.clashUsdMicros)) / 1000000n;
      const normal = value >= units(c.batchUsd);
      if (
        !normal &&
        now() - Math.min(...available.map((r) => r.depositedAt)) <
          c.idleSeconds * 1000
      )
        return;
      const limit =
        (units(normal ? c.batchUsd : c.residualUsd) * 1000000n) /
        BigInt(price.clashUsdMicros);
      let left = total < limit ? total : limit;
      if (left <= 0n) return;
      const inputUnits = String(left),
        lots = [];
      for (const r of available) {
        const a = BigInt(r.inputUnits) - BigInt(r.soldUnits || 0),
          n = a < left ? a : left;
        if (n > 0n) lots.push({ id: r.id, units: String(n) });
        left -= n;
        if (!left) break;
      }
      const prepared = await chain.prepareSale(
        {
          inputUnits,
          slippageBps: c.slippageBps,
          maxSlippageBps: c.maxSlippageBps,
        },
        secret("solana"),
        secret("jupiter"),
      );
      const sale = {
        id: crypto.randomUUID(),
        status: "signed",
        createdAt: now(),
        inputUnits,
        lots,
        ...prepared,
      };
      fence();
      db.prepare("INSERT INTO migration_sales VALUES(?,?,?,?,?)").run(
        sale.id,
        sale.status,
        JSON.stringify(sale),
        now(),
        now(),
      );
      audit("sale_signed:" + sale.id);
    } catch (e) {
      audit(
        "sale_deferred:" +
          (e instanceof MigrationError ? e.code : "UPSTREAM_RETRY"),
      );
    }
  }
  async function admin() {
    return {
      config: config(),
      readiness: await readiness(),
      snapshot: snapshot(),
      canReplaceSnapshot: !db
        .prepare("SELECT 1 FROM migration_requests LIMIT 1")
        .get(),
      wallets: {
        solana: address("solana"),
        evm: address("evm"),
        jupiter: !!address("jupiter"),
        robinhoodRpc: !!address("robinhoodRpc"),
      },
      requests: rows().reverse().slice(0, 200).map(publicRequest),
      sales: sales()
        .reverse()
        .slice(0, 100)
        .map((s) => ({
          id: s.id,
          status: s.status,
          inputUnits: s.inputUnits,
          hash: s.hash,
          errorCode: s.errorCode,
          createdAt: s.createdAt,
        })),
      audit: db
        .prepare(
          "SELECT event,at FROM migration_audit ORDER BY id DESC LIMIT 100",
        )
        .all(),
    };
  }
  return {
    status,
    config,
    updateConfig,
    setKey,
    takeSnapshot,
    challenge,
    verify,
    authenticate,
    account,
    quote,
    submit,
    cancel,
    tick,
    admin,
  };
}
module.exports = {
  createMigration,
  MigrationError,
  check,
  units,
  decimal,
  SOURCE_MINT,
  DEFAULTS,
};
