"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Database = require("better-sqlite3");
const { createMigrationRouter } = require("./migration_routes");
const { MigrationError } = require("./migration_core");
test("submit diagnostics persist safe codes and correlation IDs without credentials", async (t) => {
  const db = new Database(":memory:"), events = [];
  const app = express();
  app.use(express.json());
  const m = createMigrationRouter({ db, chain: {}, autoStart: false,
    env: { ADMIN_KEY: "ADMIN_SENTINEL" }, logger: event => events.push(event) });
  m.service.authenticate = () => "verified-wallet";
  m.service.submit = async () => {
    const error = new MigrationError("TRANSACTION_CHANGED", 400);
    error.transactionDifference = { blockhash: true, expectedInstructions: 6, receivedInstructions: 6, accounts: 'PRIVATE_SENTINEL', raw: 'SIGNED_SENTINEL' };
    throw error;
  };
  app.use("/api/migration", m.router);
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => { server.closeAllConnections(); server.close(); db.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/migration`;
  const id = "d110cb96-7b5c-495d-b792-92d1728d1d34";
  const send = () => fetch(url + "/submit?secret=QUERY_SENTINEL", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer AUTH_SENTINEL" },
    body: JSON.stringify({ id, transaction: "SIGNED_SENTINEL", secret: "KEY_SENTINEL" }) });
  const response = await send(), body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error, "TRANSACTION_CHANGED");
  assert.equal(body.traceId, response.headers.get("x-migration-trace-id"));
  assert.equal(events[0].requestId, id);
  assert.equal(events[0].traceId, body.traceId);
  assert.equal(events[0].stage, "/submit");
  assert.equal(events[0].errorCode, "TRANSACTION_CHANGED");
  assert.deepEqual(events[0].transactionDifference, { blockhash: true, expectedInstructions: 6, receivedInstructions: 6 });
  assert.ok(events[0].durationMs >= 0);
  assert.equal((await fetch(url + "/admin/diagnostics")).status, 403);
  const stored = await (await fetch(url + "/admin/diagnostics", { headers: { "x-admin-key": "ADMIN_SENTINEL" } })).json();
  assert.ok(stored.events.some(event => event.traceId === body.traceId));
  assert.ok(!JSON.stringify(stored).includes("SENTINEL"));
  m.service.submit = async () => { throw new Error("https://rpc/PRIVATE_SENTINEL"); };
  const unknown = await send();
  assert.equal(unknown.status, 503);
  assert.equal((await unknown.json()).error, "MIGRATION_UNAVAILABLE");
  assert.ok(!JSON.stringify(events).includes("SENTINEL"));
  db.transaction(() => {
    const insert = db.prepare("INSERT INTO migration_diagnostics(at,payload) VALUES(?,?)");
    for (let i = 0; i < 10005; i++) insert.run(i, '{}');
  })();
  await send();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM migration_diagnostics").get().n, 10000);
  db.exec("DROP TABLE migration_diagnostics");
  m.service.submit = async () => ({ status: "deposit_signed" });
  assert.equal((await send()).status, 200);
  assert.equal(events.at(-1).persistenceFailed, true);
});
test("public HTTP is fail-closed, admin uses existing password and disallowed origins fail", async (t) => {
  const db = new Database(":memory:");
  const app = express();
  app.use(express.json({ limit: "40kb" }));
  const m = createMigrationRouter({
    db,
    chain: {
      snapshotAt: async (at) => ({
        slot: 123,
        requestedAt: Date.parse(at),
        blockTime: Date.parse(at) - 1000,
      }),
    },
    env: { ADMIN_KEY: "test-admin-password", NODE_ENV: "production" },
    autoStart: false,
  });
  app.use("/api/migration", m.router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/api/migration`;
  const status = await fetch(url + "/status");
  assert.equal(status.status, 200);
  assert.match(status.headers.get("cache-control"), /no-store/);
  assert.equal((await status.json()).ready, false);
  assert.equal((await fetch(url + "/admin")).status, 403);
  assert.equal(
    (await fetch(url + "/admin?admin_key=test-admin-password")).status,
    403,
  );
  const admin = await fetch(url + "/admin", {
    headers: { "x-admin-key": "test-admin-password" },
  });
  assert.equal(admin.status, 200);
  assert.equal((await admin.json()).config.enabled, false);
  assert.equal((await fetch(url + "/account")).status, 401);
  assert.equal(
    (await fetch(url + "/status", { headers: { Origin: "https://evil.test" } }))
      .status,
    403,
  );
  const enable = await fetch(url + "/admin/config", {
    method: "PUT",
    headers: {
      "x-admin-key": "test-admin-password",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enable.status, 409);
  const bad = await fetch(url + "/admin/keys", {
    method: "POST",
    headers: {
      "x-admin-key": "test-admin-password",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: "evil",
      secret: "SENTINEL_SECRET_MUST_NOT_RETURN",
    }),
  });
  assert.ok(!(await bad.text()).includes("SENTINEL"));
  const at = new Date(Date.now() - 3600000).toISOString();
  const save = await fetch(url + "/admin/snapshot", {
    method: "POST",
    headers: {
      "x-admin-key": "test-admin-password",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirm: true, at }),
  });
  assert.equal(save.status, 200);
  const snapshot = await save.json();
  assert.equal(snapshot.mode, "historical");
  assert.equal(snapshot.requestedAt, Date.parse(at));
  assert.equal(snapshot.slot, 123);
});
