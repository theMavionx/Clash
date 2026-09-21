"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const WebSocket = require("ws");
const { once } = require("node:events");

async function fixture(t) {
  let mutations = 0;
  const fakeDb = { authenticatePlayer: token => token === "valid" ? { id: "player", name: "Tester" } : null,
    getFullPlayerState: () => ({ id: "player" }), getResources: () => ({ gold: 10 }),
    addResources: () => { mutations++; }, subtractResources: () => { mutations++; } };
  const module = { exports: {} };
  let expireAuth;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "websocket.js"), "utf8"), {
    require: name => name === "./db" ? fakeDb : require(name), module,
    console: { log() {} }, Date, setInterval, clearInterval, clearTimeout,
    setTimeout(fn) { expireAuth = fn; return { unref() {} }; },
  });
  const wss = module.exports.setupWebSocket();
  const server = http.createServer();
  server.on("upgrade", (req, socket, head) => wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req)));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  await once(ws, "open");
  t.after(() => { ws.terminate(); for (const c of wss.clients) c.terminate(); wss.close(); server.closeAllConnections(); server.close(); });
  return { ws, wss, mutations: () => mutations, expireAuth: () => expireAuth(),
    send: async value => { const reply = once(ws, "message"); ws.send(JSON.stringify(value)); return JSON.parse((await reply)[0]); } };
}

test("game socket validates null/array messages and keeps authenticated reads working", async t => {
  const f = await fixture(t);
  assert.equal((await f.send(null)).error, "Invalid JSON");
  assert.equal((await f.send([])).error, "Invalid JSON");
  assert.equal((await f.send({ type: "auth", token: "valid" })).type, "auth_ok");
  assert.equal((await f.send({ type: "get_resources" })).data.gold, 10);
});

test("player WebSocket cannot bypass admin-only resource mutations", async t => {
  const f = await fixture(t);
  await f.send({ type: "auth", token: "valid" });
  assert.equal((await f.send({ type: "add_resources", gold: 999999 })).code, "ADMIN_REQUIRED");
  assert.equal((await f.send({ type: "subtract_resources", gold: -999999 })).code, "ADMIN_REQUIRED");
  assert.equal(f.mutations(), 0);
});

test("oversized frame is closed without taking down the server", async t => {
  const f = await fixture(t);
  const close = once(f.ws, "close");
  f.ws.send("x".repeat(65537));
  assert.equal((await close)[0], 1009);
});

test("unauthenticated idle connection is terminated by its deadline", async t => {
  const f = await fixture(t);
  const close = once(f.ws, "close");
  f.expireAuth();
  await close;
  assert.equal(f.ws.readyState, WebSocket.CLOSED);
});

test("message flood closes only the offending connection", async t => {
  const f = await fixture(t);
  await f.send({ type: "auth", token: "valid" });
  const close = once(f.ws, "close");
  for (let i = 0; i < 61; i++) f.ws.send(JSON.stringify({ type: "get_resources" }));
  assert.equal((await close)[0], 1008);
});
