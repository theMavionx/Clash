"use strict";
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createMigration, MigrationError } = require("./migration_core");
const { createMigrationChain } = require("./migration_chain");
const { createMigrationIngress, validAdmin, createReadCache } = require("./http_security");
const { readMigrationLedger } = require("./migration_ledger");
function createMigrationRouter({
  db,
  env = process.env,
  chain,
  autoStart = true,
  keyFile,
  logger = (record) => console.info(JSON.stringify(record)),
} = {}) {
  const router = express.Router();
  db.exec(`CREATE TABLE IF NOT EXISTS migration_diagnostics (
    id INTEGER PRIMARY KEY, at INTEGER NOT NULL, payload TEXT NOT NULL
  )`);
  const record = (event) => {
    const entry = { component: "migration", at: Date.now(), ...event };
    try {
      db.transaction(() => {
        db.prepare("INSERT INTO migration_diagnostics(at,payload) VALUES(?,?)").run(entry.at, JSON.stringify(entry));
        db.prepare("DELETE FROM migration_diagnostics WHERE id <= (SELECT MAX(id)-10000 FROM migration_diagnostics)").run();
      })();
    } catch { entry.persistenceFailed = true; }
    // Logging failure must never change a settlement result or cause a retry.
    try { logger(entry); } catch { /* Best effort. */ }
  };
  const defaultKey =
    db.name && db.name !== ":memory:"
      ? path.join(
          path.dirname(fs.realpathSync(db.name)),
          "migration-master.key",
        )
      : null;
  const service = createMigration({
    db,
    chain: chain || createMigrationChain(env),
    keyFile: keyFile || env.MIGRATION_KEY_FILE || defaultKey,
  });
  const publicStatus = createReadCache(() => service.status());
  const operations = { admin: 0, public: 0 };
  router.use(createMigrationIngress({ env }));
  router.use((req, res, next) => {
    const started = Date.now(), traceId = crypto.randomUUID();
    res.set("X-Migration-Trace-Id", traceId);
    res.locals.migrationTraceId = traceId;
    res.on("finish", () => {
      if (req.method === "GET" && res.statusCode < 400) return;
      const candidate = res.locals.migrationRequestId || req.body?.id;
      // Never capture headers, bodies, raw URLs, signatures or provider error text.
      record({ event: "http_completed", traceId,
        method: ["GET", "POST", "PUT", "DELETE"].includes(req.method) ? req.method : "OTHER",
        stage: req.route?.path || "middleware",
        requestId: typeof candidate === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate) ? candidate : null,
        httpStatus: res.statusCode, durationMs: Date.now() - started,
        errorCode: res.locals.migrationErrorCode || (res.statusCode >= 400 ? "HTTP_REJECTED" : null),
        ...(res.locals.transactionDifference ? { transactionDifference: res.locals.transactionDifference } : {}),
      });
    });
    res.set("Cache-Control", "no-store, private");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  const run = (fn) => async (req, res) => {
    const group = req.path.toLowerCase().startsWith("/admin") ? "admin" : "public";
    if (operations[group] >= (group === "admin" ? 4 : 24))
      return res.set("Retry-After", "2").status(503).json({ error: "MIGRATION_BUSY" });
    // Count underlying operations until settled, even if the client disconnects.
    operations[group]++;
    try {
      const result = await fn(req);
      if (group === "admin" && req.method !== "GET") publicStatus.clear();
      res.locals.migrationRequestId = result?.id;
      res.json(result);
    } catch (e) {
      res.locals.migrationErrorCode = e instanceof MigrationError && /^[A-Z][A-Z0-9_]{0,79}$/.test(e.code) ? e.code : "MIGRATION_UNAVAILABLE";
      if (e instanceof MigrationError && e.code === "TRANSACTION_CHANGED" && e.transactionDifference) {
        const diff = {};
        for (const field of ['feePayer', 'blockhash', 'accountOrder', 'header', 'programs', 'data', 'accounts']) {
          if (typeof e.transactionDifference[field] === 'boolean') diff[field] = e.transactionDifference[field];
        }
        for (const field of ['expectedInstructions', 'receivedInstructions', 'lighthouseInstructions']) {
          const n = e.transactionDifference[field];
          if (Number.isInteger(n) && n >= 0 && n <= 1232) diff[field] = n;
        }
        res.locals.transactionDifference = diff;
      }
      res.status(e instanceof MigrationError ? e.status : 503).json({
        error: res.locals.migrationErrorCode,
        traceId: res.locals.migrationTraceId,
      });
    } finally {
      operations[group]--;
    }
  };
  const auth = (req) =>
    service.authenticate(
      String(req.headers.authorization || "").replace(/^Bearer /, ""),
    );
  const admin = (req, res, next) => {
    if (!validAdmin(req, env))
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
  router.get(
    "/status",
    run(async () => {
      const state = await publicStatus.get(), serverTime = Date.now();
      return { ...state, serverTime, closed: state.closesAt != null && serverTime >= state.closesAt };
    }),
  );
  router.post(
    "/challenge",
    run((req) => service.challenge(req.body?.wallet)),
  );
  router.post(
    "/verify",
    run((req) => service.verify(req.body?.id, req.body?.signature)),
  );
  router.get(
    "/account",
    run((req) => service.account(auth(req))),
  );
  router.post(
    "/quote",
    run((req) => service.quote(auth(req), req.body || {})),
  );
  router.post(
    "/submit",
    run((req) =>
      service.submit(auth(req), req.body?.id, req.body?.transaction),
    ),
  );
  router.post(
    "/cancel",
    run((req) => service.cancel(auth(req), req.body?.id)),
  );
  router.get(
    "/admin",
    admin,
    run(() => service.admin()),
  );
  router.get("/admin/diagnostics", admin, run(() => ({
    events: db.prepare("SELECT payload FROM migration_diagnostics ORDER BY id DESC LIMIT 200").all().map(row => JSON.parse(row.payload)),
  })));
  router.get('/admin/ledger', admin, run(req => {
    try { return readMigrationLedger(db, { wallet: req.query.wallet || '', page: req.query.page || 1 }); }
    catch (error) {
      if (['INVALID_LEDGER_FILTER', 'INVALID_LEDGER_PAGE'].includes(error.message))
        throw new MigrationError(error.message, 400);
      throw error;
    }
  }));
  router.put(
    "/admin/deadline",
    admin,
    run(req => service.setDeadline(req.body || {})),
  );
  router.put(
    "/admin/config",
    admin,
    run((req) => service.updateConfig(req.body || {})),
  );
  router.post(
    "/admin/keys",
    admin,
    run((req) => service.setKey(req.body?.kind, req.body?.secret)),
  );
  router.post(
    "/admin/snapshot",
    admin,
    run((req) => {
      if (req.body?.confirm !== true)
        throw new MigrationError("CONFIRMATION_REQUIRED");
      return service.takeSnapshot({ at: req.body?.at,
        replaceSettled: req.body?.replaceSettled === true,
        expectedChecksum: req.body?.expectedChecksum });
    }),
  );
  router.post(
    "/admin/tick",
    admin,
    run(() => service.tick()),
  );
  let timer;
  if (autoStart) {
    timer = setInterval(
      () =>
        service.tick().catch((e) => {
          record({ event: "worker_failed", stage: "tick", errorCode: e instanceof MigrationError && /^[A-Z][A-Z0-9_]{0,79}$/.test(e.code) ? e.code : "MIGRATION_UNAVAILABLE" });
        }),
      15000,
    );
    timer.unref();
  }
  return { router, service, stop: () => clearInterval(timer) };
}
module.exports = { createMigrationRouter };
