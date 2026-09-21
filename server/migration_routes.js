"use strict";
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createMigration, MigrationError } = require("./migration_core");
const { createMigrationChain } = require("./migration_chain");
function createMigrationRouter({
  db,
  env = process.env,
  chain,
  autoStart = true,
  keyFile,
} = {}) {
  const router = express.Router();
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
  const rates = new Map();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store, private");
    res.set("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    if (
      origin &&
      !["https://clashofperps.fun", "https://www.clashofperps.fun"].includes(
        origin,
      ) &&
      !(
        env.NODE_ENV !== "production" &&
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      )
    )
      return res.status(403).json({ error: "ORIGIN_NOT_ALLOWED" });
    const now = Date.now(),
      ip = req.ip || "unknown";
    for (const [key, r] of rates) if (r.until < now) rates.delete(key);
    let r = rates.get(ip);
    if (!r) {
      if (rates.size >= 10000)
        return res.status(429).json({ error: "RATE_LIMIT" });
      r = { count: 0, until: now + 60000 };
      rates.set(ip, r);
    }
    if (++r.count > 90) return res.status(429).json({ error: "RATE_LIMIT" });
    next();
  });
  const run = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      res.status(e instanceof MigrationError ? e.status : 503).json({
        error: e instanceof MigrationError ? e.code : "MIGRATION_UNAVAILABLE",
      });
    }
  };
  const auth = (req) =>
    service.authenticate(
      String(req.headers.authorization || "").replace(/^Bearer /, ""),
    );
  const admin = (req, res, next) => {
    const a = Buffer.from(String(req.headers["x-admin-key"] || "")),
      b = Buffer.from(env.ADMIN_KEY || "");
    if (!b.length || a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
  router.get(
    "/status",
    run(() => service.status()),
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
      return service.takeSnapshot({ at: req.body?.at });
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
        service.tick().catch(() => {
          /* State/error codes remain in the private ledger. Never log keys or RPC URLs. */
        }),
      15000,
    );
    timer.unref();
  }
  return { router, service, stop: () => clearInterval(timer) };
}
module.exports = { createMigrationRouter };
