"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Database = require("better-sqlite3");
const { clientAddress, rateAddress, createWindow, validAdmin, safeRequestPath,
  createMigrationIngress, createReadCache, botUpgradePlayer, securityHeaders } = require("./http_security");
const { createMigrationRouter } = require("./migration_routes");
const request = (remote, headers = {}) => ({ socket: { remoteAddress: remote }, headers });

test("client identity rejects forged CF/XFF and trusts only the nearest verified proxy", () => {
  assert.equal(clientAddress(request("203.0.113.8", { "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })), "203.0.113.8");
  assert.equal(clientAddress(request("127.0.0.1", { "x-forwarded-for": "1.1.1.1, 203.0.113.8", "cf-connecting-ip": "2.2.2.2" })), "203.0.113.8");
  assert.equal(clientAddress(request("::ffff:127.0.0.1", { "x-forwarded-for": "203.0.113.8, 172.64.1.2", "cf-connecting-ip": "203.0.113.8" })), "203.0.113.8");
  assert.equal(clientAddress(request("127.0.0.1", { "x-forwarded-for": "evil, 203.0.113.8" })), "203.0.113.8");
  assert.equal(clientAddress(request("127.0.0.1", { "x-forwarded-for": "1.1.1.1, invalid" })), "127.0.0.1");
  assert.equal(rateAddress(request("2001:db8:abcd:1234::1")), rateAddress(request("2001:0DB8:ABCD:1234:0:0:0:2")));
});

test("rate buckets have a strict capacity, retry interval and expiration", () => {
  let time = 0;
  const take = createWindow({ now: () => time, capacity: 2, windowMs: 1000 });
  assert.equal(take("a", 2).ok, true);
  assert.equal(take("a", 2).ok, true);
  assert.equal(take("a", 2).ok, false);
  assert.equal(take("b", 2).ok, true);
  assert.deepEqual(take("c", 2), { ok: false, retryAfter: 1 });
  time = 1000;
  assert.equal(take("c", 2).ok, true);
});

test("admin check is header-only, rejects arrays/oversized keys, logs exclude query tokens", () => {
  const env = { ADMIN_KEY: "secret" };
  assert.equal(validAdmin({ headers: { "x-admin-key": "secret" } }, env), true);
  for (const value of [undefined, "wrong", ["secret"], "x".repeat(257)])
    assert.equal(validAdmin({ headers: { "x-admin-key": value }, query: { admin_key: "secret" } }, env), false);
  assert.equal(validAdmin({ headers: { "x-admin-key": "secret" } }, {}), false);
  assert.equal(safeRequestPath({ url: "/api/v1/bot/ws?token=SECRET&authorization=PRIVATE" }), "/api/v1/bot/ws");
  assert.equal(safeRequestPath({ url: "/bad\r\nforged?key=SECRET" }), "/badforged");
});

test("read cache coalesces, does not recache a stale generation and briefly caches failure", async () => {
  let time = 0, calls = 0, finish;
  const cache = createReadCache(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, { now: () => time });
  const a = cache.get(), b = cache.get(); await Promise.resolve();
  assert.equal(calls, 1);
  finish({ ready: true });
  assert.deepEqual(await a, await b);
  await cache.get(); assert.equal(calls, 1);
  cache.clear();
  const old = cache.get(); await Promise.resolve(); const finishOld = finish;
  cache.clear(); const current = cache.get(); await Promise.resolve();
  finish({ ready: false }); await current;
  finishOld({ ready: true }); await old;
  assert.deepEqual(await cache.get(), { ready: false });
  let failures = 0;
  const broken = createReadCache(() => { failures++; throw Error("private upstream"); }, { now: () => time });
  await assert.rejects(broken.get()); await assert.rejects(broken.get());
  assert.equal(failures, 1);
  time = 1001; await assert.rejects(broken.get()); assert.equal(failures, 2);
});

async function listen(t, app) {
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test("ingress blocks unauthenticated key bodies before parsing and limits auth without blocking admin", async t => {
  const app = express(), env = { NODE_ENV: "production", ADMIN_KEY: "test-secret" };
  let parsed = 0;
  app.use(securityHeaders);
  app.use("/api/migration", createMigrationIngress({ env }));
  app.use(express.json({ limit: "40kb", inflate: false }));
  app.use((_req, res) => { parsed++; res.json({ ok: true }); });
  const url = await listen(t, app);
  assert.equal((await fetch(url + "/api/migration/admin/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken-secret" })).status, 403);
  assert.equal(parsed, 0);
  const large = await fetch(url + "/API/MIGRATION/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transaction: "x".repeat(41000) }) });
  assert.equal(large.status, 413);
  assert.equal((await fetch(url + "/api/migration/submit", { method: "POST", headers: { "Content-Encoding": "gzip" }, body: "x" })).status, 415);
  assert.equal(parsed, 0);
  for (let i = 0; i < 20; i++) assert.equal((await fetch(url + "/api/migration/challenge", {
    method: "POST", headers: { "x-forwarded-for": "203.0.113.8" },
  })).status, 200);
  const blocked = await fetch(url + "/api/migration/challenge", { method: "POST",
    headers: { "x-forwarded-for": "203.0.113.1, 203.0.113.8", "cf-connecting-ip": "1.1.1.1" } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  const admin = await fetch(url + "/api/migration/admin", { headers: { "x-admin-key": "test-secret" } });
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get("referrer-policy"), "no-referrer");
});

test("public status HTTP requests coalesce and admin changes invalidate cached readiness", async t => {
  const db = new Database(":memory:"), app = express();
  const router = createMigrationRouter({ db, chain: {}, autoStart: false, env: { ADMIN_KEY: "secret" }, logger: () => {} });
  t.after(() => db.close());
  let calls = 0;
  router.service.status = async () => { calls++; return { ready: true }; };
  router.service.updateConfig = async () => ({ enabled: false });
  app.use(express.json()); app.use("/api/migration", router.router);
  const url = await listen(t, app);
  const responses = await Promise.all(Array.from({ length: 15 }, () => fetch(url + "/api/migration/status")));
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(calls, 1);
  await fetch(url + "/api/migration/admin/config", { method: "PUT", headers: { "x-admin-key": "secret", "Content-Type": "application/json" }, body: '{"enabled":false}' });
  await fetch(url + "/api/migration/status");
  assert.equal(calls, 2);
});

test("bot socket identity never falls back to a default tenant", () => {
  const auth = token => token === "valid" ? { id: "player-id" } : null;
  assert.equal(botUpgradePlayer({ url: "/api/v1/bot/ws", headers: {} }, auth), null);
  assert.equal(botUpgradePlayer({ url: "/api/v1/bot/ws?token=invalid", headers: {} }, auth), null);
  assert.deepEqual(botUpgradePlayer({ url: "/api/v1/bot/ws?token=valid", headers: {} }, auth), { id: "player-id" });
  assert.equal(botUpgradePlayer({ url: "/", headers: { "x-token": "valid" } }, () => { throw Error("fail"); }), null);
});

test("disconnected clients retain concurrency slots until their underlying work settles", async t => {
  const db = new Database(":memory:"), app = express();
  const router = createMigrationRouter({ db, chain: {}, autoStart: false,
    env: { ADMIN_KEY: "secret" }, logger: () => {} });
  t.after(() => db.close());
  let release, allStarted, calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { allStarted = resolve; });
  router.service.authenticate = () => "verified-wallet";
  router.service.account = async () => {
    if (++calls === 24) allStarted();
    await pending;
    return { ok: true };
  };
  router.service.admin = async () => ({ ok: true });
  app.use("/api/migration", router.router);
  const url = await listen(t, app), controller = new AbortController();
  t.after(() => { release(); controller.abort(); });
  const requests = Array.from({ length: 24 }, () =>
    fetch(url + "/api/migration/account", { signal: controller.signal }).catch(() => null));
  await started;
  controller.abort();
  await Promise.all(requests);
  const busy = await fetch(url + "/api/migration/account");
  assert.equal(busy.status, 503);
  assert.equal((await busy.json()).error, "MIGRATION_BUSY");
  assert.equal(calls, 24);
  assert.equal((await fetch(url + "/api/migration/admin", {
    headers: { "x-admin-key": "secret" },
  })).status, 200);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await fetch(url + "/api/migration/account")).status, 200);
});
