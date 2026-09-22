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
    record,
  });
  const publicStatus = createReadCache(() => service.status());
  const operations = { admin: 0, public: 0 };
  router.use(createMigrationIngress({ env }));
  router.use((req, res, next) => {
    const started = Date.now(), traceId = crypto.randomUUID();
    res.set("X-Migration-Trace-Id", traceId);
    res.locals.migrationTraceId = traceId;
    res.on("finish", () => {
      if ((req.method === "GET" || req.path === "/client-events") && res.statusCode < 400) return;
      const candidate = res.locals.migrationRequestId || req.body?.id;
      // Never capture headers, bodies, raw URLs, signatures or provider error text.
      record({ event: "http_completed", traceId,
        method: ["GET", "POST", "PUT", "DELETE"].includes(req.method) ? req.method : "OTHER",
        stage: req.route?.path || "middleware",
        requestId: typeof candidate === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate) ? candidate : null,
        wallet: res.locals.migrationWallet || null,
        httpStatus: res.statusCode, durationMs: Date.now() - started,
        errorCode: res.locals.migrationErrorCode || (res.statusCode >= 400 ? "HTTP_REJECTED" : null),
        ...(res.locals.transactionDifference ? { transactionDifference: res.locals.transactionDifference } : {}),
        ...(res.locals.verification ? { verification: res.locals.verification } : {}),
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
        const reasons = ['ENVELOPE_CHANGED', 'ACCOUNT_LIMIT', 'ORIGINAL_PRIVILEGES', 'PROGRAM_PRIVILEGES', 'NEW_ACCOUNT_PRIVILEGES', 'ASSERTION_LIMIT', 'ASSERTION_LENGTH', 'ASSERTION_OPCODE', 'ASSERTION_ACCOUNTS', 'ORIGINAL_INSTRUCTION', 'UNUSED_ACCOUNT', 'INSTRUCTION_COUNT'];
        if (reasons.includes(e.transactionDifference.policyReason)) diff.policyReason = e.transactionDifference.policyReason;
        for (const field of ['assertionOpcodes', 'assertionAccountCounts']) {
          const values = e.transactionDifference[field];
          if (Array.isArray(values) && values.length <= 16 && values.every(n => Number.isInteger(n) && n >= -1 && n <= 256)) diff[field] = values;
        }
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
  const auth = (req) => {
    const wallet = service.authenticate(
      String(req.headers.authorization || "").replace(/^Bearer /, ""),
    );
    req.res.locals.migrationWallet = wallet;
    return wallet;
  };
  router.post('/client-events', run(req => {
    const wallet = auth(req), body = req.body || {};
    const stages = ['sign_started', 'sign_waiting', 'sign_returned', 'sign_failed',
      'sign_expired', 'page_hidden', 'page_visible', 'submit_started', 'submit_returned', 'submit_failed'];
    if (!stages.includes(body.stage) || typeof body.id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.id)) throw new MigrationError('INVALID_DIAGNOSTIC');
    if (!db.prepare('SELECT 1 FROM migration_requests WHERE id=? AND wallet=?').get(body.id, wallet))
      throw new MigrationError('REQUEST_NOT_FOUND', 404);
    record({ event: 'client_stage', source: 'untrusted_client', wallet, requestId: body.id,
      stage: body.stage,
      adapter: ['phantom', 'solflare', 'mobile', 'seeker', 'other'].includes(body.adapter) ? body.adapter : 'other',
      elapsedMs: Number.isSafeInteger(body.elapsedMs) && body.elapsedMs >= 0 ? Math.min(body.elapsedMs, 3600000) : null,
      errorCode: ['rejected', 'aborted', 'expired', 'timeout', 'wallet_error', 'server_error'].includes(body.errorCode) ? body.errorCode : null,
    });
    return { ok: true };
  }));
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
    run((req) => {
      const id = req.body?.id, sig = req.body?.signature;
      const challenge = typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)
        ? db.prepare('SELECT wallet,expires FROM migration_auth WHERE id=?').get(id) : null;
      req.res.locals.verification = {
        challengeFound: !!challenge, challengeExpired: challenge ? challenge.expires <= Date.now() : null,
        challengeWallet: challenge?.wallet || null, // Claimed owner, not authenticated until verification passes.
        signatureBytes: typeof sig === 'string' && sig.length <= 100 ? Buffer.from(sig, 'base64').length : null,
        adapter: ['phantom', 'solflare', 'mobile', 'seeker'].includes(req.body?.adapter) ? req.body.adapter : 'other',
      };
      return service.verify(id, sig);
    }),
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
