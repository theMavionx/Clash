"use strict";
const crypto = require("node:crypto");
const { BlockList, isIP } = require("node:net");
// Official Cloudflare ranges, verified 2026-09-21. Never trust arbitrary CF headers.
const CLOUDFLARE_RANGES = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22", "2400:cb00::/32",
  "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32",
];
const cloudflare = new BlockList();
for (const range of CLOUDFLARE_RANGES) {
  const [address, prefix] = range.split("/");
  cloudflare.addSubnet(address, Number(prefix), isIP(address) === 6 ? "ipv6" : "ipv4");
}
function normalizeIp(value) {
  if (typeof value !== "string" || value.length > 64) return "";
  let ip = value.trim();
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) ip = ip.slice(7);
  if (!isIP(ip) || ip.includes("%")) return "";
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip;
}
const loopback = ip => ip === "::1" || /^127\./.test(ip);
/** Resolve only the nearest untrusted peer, not an attacker-supplied leftmost XFF. */
function clientAddress(req) {
  let peer = normalizeIp(req.socket?.remoteAddress) || "unknown";
  if (loopback(peer)) {
    const xff = req.headers?.["x-forwarded-for"];
    if (typeof xff === "string" && xff.length <= 2048) {
      const hops = xff.split(",");
      if (hops.length <= 16) for (let i = hops.length - 1; i >= 0; i--) {
        const hop = normalizeIp(hops[i]);
        if (!hop) return peer;
        peer = hop;
        if (!loopback(peer)) break;
      }
    }
  }
  const type = isIP(peer);
  if (type && cloudflare.check(peer, type === 6 ? "ipv6" : "ipv4")) {
    const actual = normalizeIp(req.headers?.["cf-connecting-ip"]);
    if (actual) return actual;
  }
  return peer;
}
/** Group IPv6 privacy addresses by /64 to avoid trivial per-IP bucket rotation. */
function rateAddress(req) {
  const ip = clientAddress(req);
  if (isIP(ip) !== 6) return ip;
  const [left, right = ""] = ip.split("::");
  const a = left ? left.split(":") : [], b = right ? right.split(":") : [];
  const words = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return words.slice(0, 4).map(word => parseInt(word, 16).toString(16)).join(":") + "::/64";
}
/** Fixed-window limiter: bounded memory and amortized O(1), no per-request map scan. */
function createWindow({ now = Date.now, windowMs = 60000, capacity = 10000 } = {}) {
  const buckets = new Map();
  let resetAt = now() + windowMs;
  return (key, limit, cost = 1) => {
    const stamp = now();
    if (stamp >= resetAt) { buckets.clear(); resetAt = stamp + windowMs; }
    const retryAfter = Math.max(1, Math.ceil((resetAt - stamp) / 1000));
    if (!buckets.has(key) && buckets.size >= capacity) return { ok: false, retryAfter };
    const count = (buckets.get(key) || 0) + Math.max(1, Math.min(limit + 1, Math.ceil(Number(cost) || 1)));
    buckets.set(key, Math.min(count, limit + 1));
    return { ok: count <= limit, retryAfter };
  };
}
/** Bound public telemetry before parsing. Normal clients send five small events. */
function createClientLogIngress({ now = Date.now } = {}) {
  const take = createWindow({ now });
  return (req, res, next) => {
    const ip = rateAddress(req);
    if (!take('global', 600).ok || !take(ip, 60).ok)
      return res.set('Retry-After', '60').status(429).json({ ok: false });
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')
      return res.status(415).json({ ok: false });
    if (Number(req.headers['content-length'] || 0) > 100 * 1024)
      return res.status(413).json({ ok: false });
    next();
  };
}
/** Constant-time comparison of fixed-size digests; only explicit header credentials. */
function validAdmin(req, env = process.env) {
  const expected = env.ADMIN_KEY || "", supplied = req.headers?.["x-admin-key"];
  if (!expected || typeof supplied !== "string" || supplied.length > 256) return false;
  const hash = value => crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(hash(expected), hash(supplied));
}
function allowedOrigin(origin, env = process.env) {
  return !origin || ["https://clashofperps.fun", "https://www.clashofperps.fun"].includes(origin) ||
    (env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
}
/** Never retain query credentials or log-injection control characters. */
function safeRequestPath(req) {
  return String(req.originalUrl || req.url || "/").split(/[?#]/, 1)[0]
    .replace(/[\x00-\x1f\x7f]/g, "").slice(0, 256);
}
function securityHeaders(_req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Frame-Options", "SAMEORIGIN");
  // Deliberately not a script-src lockdown: wallets/Godot need separate CSP testing.
  res.set("Content-Security-Policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  next();
}
const admitted = Symbol("migrationAdmitted");
/** Install before JSON parsing; route fallback also protects isolated router mounts. */
function createMigrationIngress({ env = process.env, now = Date.now } = {}) {
  const take = createWindow({ now });
  return (req, res, next) => {
    if (req[admitted]) return next();
    res.set("Cache-Control", "no-store, private");
    res.set("X-Content-Type-Options", "nosniff");
    const route = req.path.toLowerCase().replace(/\/$/, "") || "/";
    const isAdmin = route === "/admin" || route.startsWith("/admin/");
    const verifiedAdmin = isAdmin && validAdmin(req, env);
    const group = isAdmin ? (verifiedAdmin ? "admin" : "denied_admin") :
      route === "/client-events" ? "diagnostics" :
      ["/challenge", "/verify"].includes(route) ? "auth" : req.method === "GET" ? "read" : "write";
    const perIp = { admin: 120, denied_admin: 10, auth: 20, read: 180, write: 30, diagnostics: 60 }[group];
    const global = { admin: 600, denied_admin: 120, auth: 300, read: 3000, write: 300, diagnostics: 600 }[group];
    for (const [key, limit] of [[`global:${group}`, global], [`${group}:${rateAddress(req)}`, perIp]]) {
      const verdict = take(key, limit);
      if (!verdict.ok) return res.set("Retry-After", String(verdict.retryAfter)).status(429).json({ error: "RATE_LIMIT" });
    }
    if (!allowedOrigin(req.headers.origin, env)) return res.status(403).json({ error: "ORIGIN_NOT_ALLOWED" });
    if (isAdmin && !verifiedAdmin) return res.status(403).json({ error: "Forbidden" });
    if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity")
      return res.status(415).json({ error: "CONTENT_ENCODING_NOT_ALLOWED" });
    if (Number(req.headers["content-length"] || 0) > 40 * 1024)
      return res.status(413).json({ error: "REQUEST_TOO_LARGE" });
    req[admitted] = true;
    next();
  };
}
/** Read cache with request coalescing and generation-safe invalidation. */
function createReadCache(read, { now = Date.now, ttlMs = 5000 } = {}) {
  let entry, pending, revision = 0;
  return {
    clear() { entry = null; pending = null; revision++; },
    async get() {
      if (entry && entry.until > now()) {
        if (entry.error) throw entry.error;
        return entry.value;
      }
      if (pending) return pending;
      const generation = revision;
      const task = Promise.resolve().then(read).then(value => {
        if (generation === revision) entry = { value, until: now() + ttlMs };
        return value;
      }, error => {
        if (generation === revision) entry = { error, until: now() + 1000 };
        throw error;
      }).finally(() => { if (pending === task) pending = null; });
      pending = task;
      return task;
    },
  };
}
/** Authenticate before upgrading the bot socket; there is no default tenant fallback. */
function botUpgradePlayer(req, authenticate) {
  let token = req.headers?.["x-token"];
  if (!token) try { token = new URL(req.url, "http://localhost").searchParams.get("token"); } catch { return null; }
  if (typeof token !== "string" || !token.length || token.length > 256) return null;
  try { return authenticate(token) || null; } catch { return null; }
}
module.exports = { clientAddress, rateAddress, createWindow, validAdmin, allowedOrigin,
  safeRequestPath, securityHeaders, createMigrationIngress, createReadCache, botUpgradePlayer, createClientLogIngress };
