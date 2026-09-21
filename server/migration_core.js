"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const nacl = require("tweetnacl");
const { PublicKey } = require("@solana/web3.js");
const { isAddress, getAddress } = require("viem");
const SOURCE_MINT = "9mM1Mc4Ta9UJJ32v5qsHef91PiXi7EWyiSsqF5WXpump";
const MIN_SALE_USD = "100";
const MAX_SALE_RETRIES = 4;
const SALE_RETRY_DELAY_MS = 30000;
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
  payoutDelayEnabled: true,
  payoutDelayMinSeconds: 150,
  payoutDelayMaxSeconds: 420,
  closesAt: null,
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
function snapshotTime(value) {
  check(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value),
    "INVALID_SNAPSHOT_TIME",
  );
  const ms = Date.parse(value);
  check(
    Number.isFinite(ms) &&
      new Date(ms).toISOString() ===
        (value.includes(".") ? value : value.replace("Z", ".000Z")),
    "INVALID_SNAPSHOT_TIME",
  );
  return ms;
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
function createMigration({ db, chain, now = Date.now, keyFile, record = () => {} }) {
  if (!db.readonly) {
    db.exec(`CREATE TABLE IF NOT EXISTS migration_config(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_secrets(kind TEXT PRIMARY KEY,value TEXT NOT NULL,address TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_snapshot(id INTEGER PRIMARY KEY CHECK(id=1),slot INTEGER NOT NULL,created_at INTEGER NOT NULL,total TEXT NOT NULL,wallets INTEGER NOT NULL,checksum TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_snapshot_meta(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL,requested_at INTEGER,block_time INTEGER);
    CREATE TABLE IF NOT EXISTS migration_snapshot_archive(checksum TEXT PRIMARY KEY,snapshot TEXT NOT NULL,replaced_at INTEGER NOT NULL,replacement_checksum TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_entitlements_archive(snapshot_checksum TEXT NOT NULL,wallet TEXT NOT NULL,units TEXT NOT NULL,PRIMARY KEY(snapshot_checksum,wallet));
    CREATE TABLE IF NOT EXISTS migration_entitlements(wallet TEXT PRIMARY KEY,units TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_auth(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_sessions(hash TEXT PRIMARY KEY,wallet TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_requests(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,idem TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(wallet,idem));
    CREATE TABLE IF NOT EXISTS migration_sends(hash TEXT PRIMARY KEY,request_id TEXT NOT NULL,kind TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_sales(id TEXT PRIMARY KEY,status TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS migration_auth_expiry ON migration_auth(expires);
    CREATE INDEX IF NOT EXISTS migration_auth_wallet ON migration_auth(wallet,expires);
    CREATE INDEX IF NOT EXISTS migration_sessions_expiry ON migration_sessions(expires);
    CREATE INDEX IF NOT EXISTS migration_sessions_wallet ON migration_sessions(wallet,expires);`);
    db.prepare("INSERT OR IGNORE INTO migration_config VALUES(1,?,1)").run(
      JSON.stringify(DEFAULTS),
    );
  }
  const owner = crypto.randomUUID();
  const gate = require("./migration_gate").createMigrationGate({ record });
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
    const meta = db
      .prepare("SELECT * FROM migration_snapshot_meta WHERE id=1")
      .get();
    return s
      ? {
          slot: s.slot,
          createdAt: s.created_at,
          totalUnits: s.total,
          wallets: s.wallets,
          checksum: s.checksum,
          mode: meta?.mode || "captured",
          requestedAt: meta?.requested_at ?? null,
          blockTime: meta?.block_time ?? null,
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
      targetToken: r.targetToken,
      inputUnits: r.inputUnits,
      outputUnits: r.outputUnits,
      targetDecimals: r.targetDecimals,
      destination: r.destination,
      status: r.status,
      depositHash: r.depositHash || null,
      payoutHash: r.payoutHash || null,
      createdAt: r.createdAt,
      depositedAt: r.depositedAt || null,
      payoutNotBefore: r.payoutNotBefore || null,
      payoutIncludedAt: r.payoutIncludedAt || null,
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
  async function exclusive(fn, operation = "mutation", background = false) {
    check(!db.readonly, "READ_ONLY_WORKER", 409);
    let release;
    try { release = await gate.acquire(operation, background); }
    catch { throw new MigrationError("WORKER_BUSY", 409); }
    if (!release) return { ok: true, skipped: true };
    const started = Date.now();
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
      try { db.prepare("DELETE FROM migration_lease WHERE owner=?").run(owner); }
      finally { release(); }
      try { record({ event: "operation_completed", operation, durationMs: Date.now() - started }); } catch { /* diagnostics only */ }
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
      closesAt: c.closesAt,
      serverTime: now(),
      closed: c.closesAt !== null && now() >= c.closesAt,
      sourceMint: SOURCE_MINT,
      sourceDecimals: 6,
      chainId: 4663,
      targetToken: c.targetToken,
      ratio: c.ratio,
      feeUsd: c.feeUsd,
      payoutDelay: { enabled: c.payoutDelayEnabled, minSeconds: c.payoutDelayMinSeconds, maxSeconds: c.payoutDelayMaxSeconds },
      snapshot: snapshot(),
    };
  }
  function requireAdmissionOpen() {
    const deadline = config().closesAt;
    check(deadline === null || now() < deadline, "MIGRATION_CLOSED", 409);
  }
  // Deadline is separate from the settlement kill switch: accepted sends keep reconciling.
  async function setDeadline(input = {}) {
    return exclusive(async () => {
      const relative = Object.hasOwn(input, "durationSeconds");
      check(Object.keys(input).length === 1 && (relative || Object.hasOwn(input, "closesAt")),
        "INVALID_DEADLINE");
      if (relative) check(Number.isInteger(input.durationSeconds) && input.durationSeconds >= 60 &&
        input.durationSeconds <= 366 * 86400, "INVALID_DEADLINE");
      const closesAt = relative ? now() + input.durationSeconds * 1000 : input.closesAt;
      check(closesAt === null || (Number.isSafeInteger(closesAt) && closesAt > 0 &&
        closesAt <= Date.UTC(2100, 0, 1)), "INVALID_DEADLINE");
      const c = { ...config(), closesAt };
      fence();
      db.prepare("UPDATE migration_config SET value=?,revision=revision+1 WHERE id=1")
        .run(JSON.stringify(c));
      audit("deadline_updated:" + (closesAt === null ? "disabled" : closesAt));
      return { closesAt, serverTime: now() };
    });
  }
  function updateConfig(input) {
    // Use the dedicated endpoint; ordinary configuration saves cannot overwrite a newer timer.
    check(!Object.hasOwn(input, "closesAt"), "USE_DEADLINE_ENDPOINT");
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
      check(typeof c.payoutDelayEnabled === "boolean" &&
        Number.isInteger(c.payoutDelayMinSeconds) && Number.isInteger(c.payoutDelayMaxSeconds) &&
        c.payoutDelayMinSeconds >= 0 && c.payoutDelayMinSeconds <= c.payoutDelayMaxSeconds &&
        c.payoutDelayMaxSeconds <= 3600, "INVALID_PAYOUT_DELAY");
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
      check(units(c.batchUsd) >= units(MIN_SALE_USD) &&
        units(c.residualUsd) >= units(MIN_SALE_USD), "SALE_MINIMUM_100_USD");
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
            !sales().some((r) => !["completed", "failed"].includes(r.status) || r.retryPending) &&
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
  // A new cutoff must never redefine an unresolved deposit or erase used allocation.
  function canReplaceSettledSnapshot() {
    return !!snapshot() && !config().enabled &&
      !db.prepare("SELECT 1 FROM migration_requests WHERE status NOT IN ('paid','expired','deposit_failed') LIMIT 1").get() &&
      !sales().some(r => !["completed", "failed"].includes(r.status) || r.retryPending);
  }
  function checkSnapshotReplacement(input) {
    if (input.replaceSettled !== true) {
      check(!db.prepare("SELECT 1 FROM migration_requests LIMIT 1").get(), "SNAPSHOT_LOCKED", 409);
      return;
    }
    check(canReplaceSettledSnapshot(), "SNAPSHOT_REPLACEMENT_BLOCKED", 409);
    check(typeof input.expectedChecksum === "string" && input.expectedChecksum === snapshot().checksum,
      "CONFIGURATION_CHANGED", 409);
    check(typeof input.at === "string", "INVALID_SNAPSHOT_TIME");
  }
  async function takeSnapshot(input = {}) {
    return exclusive(async () => {
      checkSnapshotReplacement(input);
      const historical = input.at !== undefined;
      const requestedAt = historical ? snapshotTime(input.at) : null;
      check(!historical || requestedAt <= now(), "INVALID_SNAPSHOT_TIME");
      const s = historical
        ? await chain.snapshotAt(input.at)
        : await chain.snapshot(SOURCE_MINT);
      fence();
      check(
        !historical ||
          (s.requestedAt === requestedAt &&
            Number.isSafeInteger(s.blockTime) &&
            s.blockTime <= requestedAt),
        "INVALID_SNAPSHOT",
      );
      if (input.replaceSettled === true) {
        const old = snapshot();
        check(requestedAt > (old.requestedAt ?? old.blockTime ?? old.createdAt) && s.slot > old.slot,
          "SNAPSHOT_MUST_ADVANCE", 409);
      }
      const entries = Object.entries(historical ? {} : s.balances)
        .filter(([w]) => PublicKey.isOnCurve(new PublicKey(w).toBytes()))
        .sort(([a], [b]) => a.localeCompare(b));
      const total = entries.reduce((n, [, v]) => n + BigInt(v), 0n);
      check(
        (historical || total > 0n) &&
          total <= 1000000000n * 1000000n &&
          Number.isSafeInteger(s.slot),
        "INVALID_SNAPSHOT",
      );
      const checksum = digest(JSON.stringify(historical
        ? { mode: "historical", mint: SOURCE_MINT, slot: s.slot, requestedAt, blockTime: s.blockTime }
        : entries));
      db.transaction(() => {
        checkSnapshotReplacement(input);
        const previous = snapshot();
        if (input.replaceSettled === true) {
          db.prepare("INSERT INTO migration_snapshot_archive VALUES(?,?,?,?)")
            .run(previous.checksum, JSON.stringify(previous), now(), checksum);
          db.prepare("INSERT INTO migration_entitlements_archive SELECT ?,wallet,units FROM migration_entitlements")
            .run(previous.checksum);
        }
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
          checksum,
        );
        db.prepare(
          "INSERT OR REPLACE INTO migration_snapshot_meta VALUES(1,?,?,?)",
        ).run(
          historical ? "historical" : "captured",
          requestedAt,
          s.blockTime ?? null,
        );
        audit("snapshot_published");
        if (input.replaceSettled === true)
          audit("snapshot_replaced:" + previous.checksum + ":" + checksum);
      }).immediate();
      return snapshot();
    });
  }
  function challenge(w) {
    w = wallet(w);
    db.prepare("DELETE FROM migration_auth WHERE expires<?").run(now());
    db.prepare("DELETE FROM migration_sessions WHERE expires<?").run(now());
    // Repeated requests for one public wallet do not create unbounded nonce rows
    // or invalidate a challenge another browser is currently signing.
    const existing = db.prepare("SELECT id,message FROM migration_auth WHERE wallet=? AND expires>? ORDER BY expires DESC LIMIT 1")
      .get(w, now() + 30000);
    if (existing) return existing;
    check(db.prepare("SELECT count(*) n FROM migration_auth").get().n < 10000, "AUTH_CAPACITY", 429);
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
    check(typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) &&
      typeof sig === "string" && sig.length <= 100, "INVALID_SIGNATURE", 401);
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
        db.prepare("DELETE FROM migration_sessions WHERE expires<?").run(now());
        check(db.prepare("SELECT count(*) n FROM migration_sessions").get().n < 50000, "AUTH_CAPACITY", 429);
        // Retain up to eight active browser sessions for this verified wallet.
        db.prepare("DELETE FROM migration_sessions WHERE hash IN (SELECT hash FROM migration_sessions WHERE wallet=? ORDER BY expires DESC LIMIT -1 OFFSET 7)").run(r.wallet);
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
  async function ensureEntitlement(w) {
    const s = snapshot();
    if (
      s?.mode !== "historical" ||
      db.prepare("SELECT 1 FROM migration_entitlements WHERE wallet=?").get(w)
    )
      return;
    const amount = await chain.historicalBalance(w, s.slot);
    check(
      typeof amount === "string" &&
        /^\d+$/.test(amount) &&
        BigInt(amount) <= 1000000000000000n,
      "HISTORY_INVALID",
      503,
    );
    db.transaction(() => {
      const current = snapshot();
      check(
        current?.checksum === s.checksum &&
          current.slot === s.slot &&
          current.mode === "historical",
        "CONFIGURATION_CHANGED",
        409,
      );
      const inserted = db
        .prepare("INSERT OR IGNORE INTO migration_entitlements VALUES(?,?)")
        .run(w, amount).changes;
      if (inserted) {
        const total = BigInt(current.totalUnits) + BigInt(amount);
        check(total <= 1000000000000000n, "HISTORY_INVALID", 503);
        db.prepare(
          "UPDATE migration_snapshot SET total=?,wallets=wallets+1 WHERE id=1",
        ).run(String(total));
      }
    }).immediate();
  }
  async function account(w) {
    await ensureEntitlement(w);
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
      requireAdmissionOpen();
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
      await ensureEntitlement(w);
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
          expiresAt: Math.min(now() + 90000, c.closesAt ?? Infinity),
          solanaTreasury: address("solana"),
          evmTreasury: address("evm"),
          soldUnits: "0",
          snapshotSlot: snapshot()?.slot,
          snapshotChecksum: snapshot()?.checksum,
        };
      Object.assign(r, await chain.prepareDeposit(r));
      fence();
      db.transaction(() => {
        requireAdmissionOpen();
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
    }, "quote");
  }
  async function submit(w, id, transaction) {
    return exclusive(async () => {
      const r = rows().find((r) => r.id === id && r.wallet === w);
      check(r, "REQUEST_NOT_FOUND", 404);
      if (r.status !== "quoted") return publicRequest(r);
      check(config().enabled, "MIGRATION_PAUSED", 409);
      requireAdmissionOpen();
      check(r.expiresAt > now(), "QUOTE_EXPIRED", 409);
      const signed = await chain.signDeposit(r, transaction, secret("solana"));
      requireAdmissionOpen();
      check(config().enabled, "MIGRATION_PAUSED", 409);
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
    }, "submit");
  }
  // Persist once under the worker lease. Restarts/reconciliation must not reroll
  // the delay; already-signed payouts never pass through this scheduling gate.
  function schedulePayout(r) {
    if (r.payoutNotBefore != null) {
      check(Number.isSafeInteger(r.payoutNotBefore) && r.payoutNotBefore > 0,
        "INVALID_PAYOUT_SCHEDULE");
      return;
    }
    const depositedAt = r.depositedAt || now();
    check(Number.isSafeInteger(depositedAt) && depositedAt > 0, "INVALID_PAYOUT_SCHEDULE");
    r.depositedAt = depositedAt;
    const c = config();
    const delayMs = c.payoutDelayEnabled
      ? crypto.randomInt(c.payoutDelayMinSeconds * 1000, c.payoutDelayMaxSeconds * 1000 + 1) : 0;
    r.payoutNotBefore = depositedAt + delayMs;
    db.transaction(() => {
      save(r);
      audit("payout_scheduled:" + r.id + ":" + r.payoutNotBefore);
    }).immediate();
  }
  function depositOnlyReview(r) {
    return r.status === "review" && r.errorCode === "DEPOSIT_REQUIRES_RECONCILIATION" &&
      r.depositHash && !r.payoutHash && !r.payoutRaw && r.payoutNonce == null &&
      (!r.soldUnits || r.soldUnits === "0");
  }
  async function reconcileDepositExpiry(r) {
    if (!depositOnlyReview(r) || !Number.isSafeInteger(r.lastValidBlockHeight) ||
      !chain.depositExpiryEvidence) return;
    const evidence = await chain.depositExpiryEvidence(r);
    fence();
    if (evidence?.kind !== "expired_unlanded" || !Number.isSafeInteger(evidence.height) ||
      evidence.height <= r.lastValidBlockHeight + 32 || !Number.isSafeInteger(evidence.slot) || evidence.slot <= 0) {
      delete r.depositExpiryProbe;
      save(r);
      return;
    }
    const previous = r.depositExpiryProbe;
    if (previous?.hash === r.depositHash && Number.isSafeInteger(previous.at) &&
      now() - previous.at >= 30000 && evidence.height > previous.height && evidence.slot > previous.slot) {
      r.status = "deposit_failed";
      r.errorCode = "DEPOSIT_EXPIRED_UNLANDED";
      r.depositExpiryVerifiedAt = now();
      r.depositExpiryEvidence = { ...evidence, first: previous, at: now(), hash: r.depositHash };
      // Keep original signed bytes, hash and migration_sends. A new quote must
      // pass every normal gate and obtain a new explicit wallet signature.
      db.transaction(() => { save(r); audit("deposit_expiry_verified:" + r.id); }).immediate();
    } else if (!previous || previous.hash !== r.depositHash) {
      r.depositExpiryProbe = { ...evidence, at: now(), hash: r.depositHash };
      save(r);
    }
  }
  async function payoutQueueReady() {
    const outstanding = rows();
    // An unresolved incoming Solana deposit owns no outgoing EVM nonce.
    // Keep its allocation/liability reserved, but isolate its review from other
    // users. Unknown reviews or any evidence of a prepared payout still block.
    if (outstanding.some(r => r.status === "review" && !depositOnlyReview(r))) return false;
    for (const previous of outstanding.filter(r => r.status === "payout_signed")) {
      // Never trust persisted inclusion alone: a receipt can disappear in a reorg.
      const result = await chain.payoutStatus(previous, { inclusionOnly: true });
      if (result !== "included" && result !== "confirmed") return false;
    }
    return true;
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
            const depositState = !r.payoutHash && r.depositHash ? await chain.depositStatus(r) : null;
            if (
              !r.payoutHash &&
              r.depositHash &&
              depositState === "confirmed"
            ) {
              r.status = "deposited";
              r.depositedAt = r.depositedAt || now();
              r.errorCode = null;
              delete r.depositExpiryProbe;
              schedulePayout(r);
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
            else if (depositState === "expired") await reconcileDepositExpiry(r);
            else if (r.depositExpiryProbe) { delete r.depositExpiryProbe; save(r); }
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
              schedulePayout(r);
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
          if (r.status === "deposited") schedulePayout(r);
          if (r.status === "deposited" && config().enabled && now() >= r.payoutNotBefore) {
            // Serialize unmined sends, but do not wait for finality of verified transfers.
            if (!(await payoutQueueReady())) continue;
            const signed = await chain.preparePayout(r, secret("evm"));
            fence();
            check(config().enabled, "MIGRATION_PAUSED", 409);
            check(!rows().some(x => x.id !== r.id && x.payoutHash &&
              x.evmTreasury?.toLowerCase() === r.evmTreasury.toLowerCase() &&
              x.payoutNonce === signed.nonce), "PAYOUT_NONCE_ALREADY_RESERVED", 409);
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
            } else if (result === "included") {
              const firstInclusion = !r.payoutIncludedAt;
              r.payoutIncludedAt = r.payoutIncludedAt || now();
              r.errorCode = null;
              save(r);
              if (firstInclusion) audit("payout_included:" + r.id);
            } else if (result === "failed" || result === "conflict") {
              r.payoutIncludedAt = null;
              r.status = "review";
              r.errorCode = "PAYOUT_REQUIRES_RECONCILIATION";
              save(r);
            } else {
              r.payoutIncludedAt = null;
              save(r);
              if (config().enabled) {
                fence();
                await chain.broadcastEvm(r.payoutRaw);
              }
            }
          }
        } catch (e) {
          const code = e instanceof MigrationError ? e.code : "UPSTREAM_RETRY";
          // Preserve the reason/stage of a review across transient provider
          // errors; otherwise an isolated incoming deposit becomes global again.
          if (r.status === "review" && r.errorCode) {
            r.lastReconciliationError = code;
            delete r.depositExpiryProbe;
          }
          else r.errorCode = code;
          save(r);
        } finally {
          fence();
          db.prepare(
            "UPDATE migration_requests SET updated_at=? WHERE id=?",
          ).run(now(), r.id);
        }
        // Yield at a persisted state boundary; never interrupt signing or sending.
        if (gate.pending) break;
      }
      if (!gate.pending) await processSales();
      return { ok: true };
    }, "tick", true);
  }
  // Shared by the embedded worker and the owner-operated CLI. This path never
  // decrypts a key, signs, broadcasts, acquires a lease or writes to the DB.
  async function salesPreview() {
    const open = sales().find(r => ["signed", "review"].includes(r.status));
    if (open) return { state: open.status === "review" ? "review" : "pending",
      saleId: open.id, hash: open.hash, inputUnits: open.inputUnits,
      reason: open.errorCode || "SALE_AWAITING_FINALITY" };
    const c = config();
    if (!c.enabled) return { state: "waiting", reason: "MIGRATION_PAUSED" };
    const retry = sales().find(r => r.status === "failed" && r.retryPending);
    const retryBps = retry ? nextSaleRetryBps(retry, c.maxSlippageBps) : null;
    if (retry && retryBps === null) return { state: "review", reason: "SALE_SLIPPAGE_RETRY_LIMIT", saleId: retry.id };
    if (retry && now() < retry.retryNotBefore)
      return { state: "waiting", reason: "SALE_RETRY_BACKOFF", nextEligibleAt: retry.retryNotBefore, saleId: retry.id };
    const treasury = address("solana");
    if (!treasury) return { state: "waiting", reason: "SOLANA_KEY_REQUIRED" };
    const balance = await chain.saleBalance(treasury);
    // Finalized source deposits fund liquidation independently of the EVM payout.
    // Review/unknown states remain held; a wallet balance alone is not a deposit proof.
    const available = rows().filter(r => ["deposited", "payout_signed", "paid"].includes(r.status) &&
      Number.isSafeInteger(r.depositedAt) && r.depositedAt > 0 &&
      typeof r.depositHash === "string" && r.depositHash.length > 0 &&
      BigInt(r.inputUnits) > BigInt(r.soldUnits || 0));
    const total = available.reduce((n, r) => n + BigInt(r.inputUnits) - BigInt(r.soldUnits || 0), 0n);
    const view = { treasury, tokenBalanceUnits: balance.tokenUnits,
      solLamports: balance.solLamports, eligibleUnits: String(total) };
    const waiting = reason => ({ ...view, state: "waiting", reason });
    if (!available.length) return waiting("NO_CONFIRMED_DEPOSIT_LOTS");
    if (available.some(r => r.solanaTreasury !== treasury)) return waiting("SALE_TREASURY_MISMATCH");
    if (BigInt(balance.solLamports) < 10000000n) return waiting("SOL_GAS_REQUIRED");
    const price = await chain.prices();
    const priceUnits = BigInt(price.clashUsdMicros);
    check(priceUnits > 0n, "PRICE_UNAVAILABLE", 503);
    const value = total * priceUnits / 1000000n;
    if (value < units(MIN_SALE_USD)) return waiting("SALE_BELOW_MINIMUM");
    const normal = value >= units(c.batchUsd);
    const oldest = Math.min(...available.map(r => r.depositedAt));
    check(Number.isFinite(oldest), "SALE_LOT_TIMESTAMP_INVALID", 409);
    if (!normal && now() - oldest < c.idleSeconds * 1000)
      return { ...waiting("BATCH_THRESHOLD_WAIT"), nextEligibleAt: oldest + c.idleSeconds * 1000 };
    // Round up one base unit if necessary: a $100 target rounded down can
    // otherwise create a $99.999999 batch despite the minimum-value gate.
    const target = units(normal ? c.batchUsd : c.residualUsd);
    if (target < units(MIN_SALE_USD)) return waiting("SALE_BELOW_MINIMUM");
    const limit = (target * 1000000n + priceUnits - 1n) / priceUnits;
    let left = total < limit ? total : limit;
    if (left <= 0n) return waiting("SALE_AMOUNT_TOO_SMALL");
    if (BigInt(balance.tokenUnits) < left) return waiting("SALE_BALANCE_UNAVAILABLE");
    const inputUnits = String(left), lots = [];
    for (const r of available) {
      const amount = BigInt(r.inputUnits) - BigInt(r.soldUnits || 0);
      const n = amount < left ? amount : left;
      if (n > 0n) lots.push({ id: r.id, units: String(n) });
      left -= n;
      if (!left) break;
    }
    return { ...view, state: "ready", inputUnits, lots,
      slippageBps: retryBps ?? Math.min(50, c.slippageBps), maxSlippageBps: c.maxSlippageBps,
      ...(retry ? { retryOf: retry.id, retryRoot: retry.retryRoot || retry.id, retryCount: (retry.retryCount || 0) + 1 } : {}) };
  }
  function nextSaleRetryBps(sale, maximum) {
    const count = sale.retryCount || 0;
    if (!Number.isInteger(count) || count < 0 || count >= MAX_SALE_RETRIES ||
      !Number.isInteger(sale.slippageBps) || sale.slippageBps < 1) return null;
    return [...new Set([50, 100, 200, 500, 1000, maximum])].sort((a, b) => a - b)
      .find(bps => bps > sale.slippageBps && bps <= maximum && bps <= 1000) ?? null;
  }
  let lastSaleEvent;
  function saleEvent(event) {
    if (lastSaleEvent !== event) { audit(event); lastSaleEvent = event; }
  }
  async function tickSales() {
    return exclusive(() => processSales());
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
            open.errorCode = null;
            saveSale(open);
            audit("sale_confirmed:" + open.id);
          }).immediate();
        } else if (result === "failed" || result === "expired") {
          const evidence = result === "failed" && chain.saleFailureEvidence
            ? await chain.saleFailureEvidence(open) : null;
          const verifiedSlippage = evidence?.kind === "slippage" && evidence.code === 6001 &&
            Number.isSafeInteger(evidence.slot) && evidence.slot > 0;
          const nextBps = verifiedSlippage ? nextSaleRetryBps(open, config().maxSlippageBps) : null;
          if (verifiedSlippage && nextBps !== null) {
            open.status = "failed";
            open.errorCode = "JUPITER_SLIPPAGE";
            open.failedSlot = evidence.slot;
            open.retryPending = true;
            open.retryNotBefore = now() + SALE_RETRY_DELAY_MS;
            db.transaction(() => {
              saveSale(open);
              audit("sale_retry_scheduled:" + open.id + ":" + nextBps);
            }).immediate();
            return { state: "waiting", reason: "SALE_RETRY_BACKOFF", saleId: open.id, nextEligibleAt: open.retryNotBefore };
          }
          open.status = "review";
          open.errorCode = verifiedSlippage ? "SALE_SLIPPAGE_RETRY_LIMIT" : "SALE_REQUIRES_RECONCILIATION";
          saveSale(open);
        } else if (config().enabled && open.status === "signed") {
          fence();
          await chain.broadcastSolana(open.raw);
        }
      } catch (e) {
        // Pending bytes remain authoritative; never make a replacement trade.
        const reason = e instanceof MigrationError ? e.code : "UPSTREAM_RETRY";
        saleEvent("sale_pending:" + reason);
        return { state: "pending", saleId: open.id, hash: open.hash, reason };
      }
      return { state: open.status, saleId: open.id, hash: open.hash,
        reason: open.errorCode || null };
    }
    try {
      const plan = await salesPreview();
      if (plan.state !== "ready") {
        saleEvent("sale_waiting:" + plan.reason);
        return plan;
      }
      const { inputUnits, lots } = plan;
      check(config().enabled, "MIGRATION_PAUSED", 409);
      const prepared = await chain.prepareSale(
        {
          inputUnits,
          slippageBps: plan.slippageBps,
          maxSlippageBps: plan.maxSlippageBps,
          onAttempt: (bps, outcome) => {
            fence();
            saleEvent("sale_simulation:" + bps + ":" + outcome);
          },
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
        ...(plan.retryOf ? { retryOf: plan.retryOf, retryRoot: plan.retryRoot, retryCount: plan.retryCount } : {}),
      };
      fence();
      check(config().enabled, "MIGRATION_PAUSED", 409);
      db.transaction(() => {
        if (plan.retryOf) {
          const parent = sales().find(s => s.id === plan.retryOf);
          check(parent?.status === "failed" && parent.retryPending, "SALE_RETRY_CHANGED", 409);
          parent.retryPending = false;
          parent.retriedBy = sale.id;
          saveSale(parent);
        }
        db.prepare("INSERT INTO migration_sales VALUES(?,?,?,?,?)").run(
          sale.id, sale.status, JSON.stringify(sale), now(), now(),
        );
        audit("sale_signed:" + sale.id);
      }).immediate();
      return { state: "signed", saleId: sale.id, hash: sale.hash,
        inputUnits, slippageBps: sale.slippageBps };
    } catch (e) {
      const reason = e instanceof MigrationError ? e.code : "UPSTREAM_RETRY";
      saleEvent("sale_deferred:" + reason);
      return { state: "waiting", reason };
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
      canReplaceSettledSnapshot: canReplaceSettledSnapshot(),
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
          retryOf: s.retryOf || null,
          retryCount: s.retryCount || 0,
          retryPending: !!s.retryPending,
          retryNotBefore: s.retryNotBefore || null,
          slippageBps: s.slippageBps,
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
    setDeadline,
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
    tickSales,
    salesPreview,
    admin,
  };
}
module.exports = {
  createMigration,
  MigrationError,
  check,
  units,
  decimal,
  snapshotTime,
  SOURCE_MINT,
  MIN_SALE_USD,
  DEFAULTS,
};
