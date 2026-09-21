"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Database = require("better-sqlite3");
const { createMigrationRouter } = require("./migration_routes");
test("public HTTP is fail-closed, admin uses existing password and disallowed origins fail", async (t) => {
  const db = new Database(":memory:");
  const app = express();
  app.use(express.json({ limit: "40kb" }));
  const m = createMigrationRouter({
    db,
    chain: {},
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
});
