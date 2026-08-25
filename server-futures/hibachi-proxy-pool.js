const crypto = require('crypto');
const fs = require('fs');
const { ProxyAgent } = require('undici');

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return !/^(0|false|no|off)$/iu.test(String(value).trim());
}

function proxySourceLines(env = process.env, fsImpl = fs) {
  const filePath = String(env.HIBACHI_PROXY_FILE || '').trim();
  if (filePath) {
    try {
      return String(fsImpl.readFileSync(filePath, 'utf8')).split(/\r?\n/gu);
    } catch (error) {
      const wrapped = new Error(`Configured Hibachi proxy file could not be read: ${error.message}`);
      wrapped.code = 'HIBACHI_PROXY_FILE_UNREADABLE';
      throw wrapped;
    }
  }
  return String(env.HIBACHI_PROXIES || '').split(/[\r\n,;]+/gu);
}

function proxyUrlFromLine(value) {
  const text = String(value || '').trim();
  if (!text || text.startsWith('#')) return null;

  let url;
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(text)) {
    url = new URL(text);
  } else {
    const match = text.match(/^([^:\s]+):(\d{1,5})(?::([^:]+):(.+))?$/u);
    if (!match) throw new Error('Expected host:port:user:password or an HTTP proxy URL.');
    const [, host, port, username = '', password = ''] = match;
    const credentials = username || password
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : '';
    url = new URL(`http://${credentials}${host}:${port}`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsupported Hibachi proxy protocol: ${url.protocol}`);
  }
  if (!url.hostname || !url.port) throw new Error('Proxy host and port are required.');
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Proxy port is invalid.');
  return url.toString();
}

function stableIndex(value, size) {
  if (!size) return 0;
  const digest = crypto.createHash('sha256').update(String(value || '')).digest();
  return digest.readUInt32BE(0) % size;
}

function safeProxyId(proxyUrl) {
  const url = new URL(proxyUrl);
  return crypto
    .createHash('sha256')
    .update(`${url.hostname}:${url.port}`)
    .digest('hex')
    .slice(0, 10);
}

class HibachiProxyPool {
  constructor(proxyLines = [], options = {}) {
    this.ProxyAgentClass = options.ProxyAgentClass || ProxyAgent;
    this.now = options.now || Date.now;
    this.allowDirectFallback = Boolean(options.allowDirectFallback);
    this.readAttempts = boundedInteger(options.readAttempts, 4, 1, 10);
    this.rateLimitCooldownMs = boundedInteger(options.rateLimitCooldownMs, 30_000, 1_000, 30 * 60_000);
    this.failureCooldownMs = boundedInteger(options.failureCooldownMs, 10_000, 1_000, 5 * 60_000);
    this.maxFailureCooldownMs = boundedInteger(options.maxFailureCooldownMs, 5 * 60_000, this.failureCooldownMs, 60 * 60_000);
    this.geoCooldownMs = boundedInteger(options.geoCooldownMs, 30 * 60_000, 60_000, 24 * 60 * 60_000);
    this.roundRobin = 0;

    const unique = new Set();
    this.entries = [];
    for (const line of proxyLines) {
      let proxyUrl;
      try {
        proxyUrl = proxyUrlFromLine(line);
      } catch (error) {
        const wrapped = new Error(`Invalid Hibachi proxy entry: ${error.message}`);
        wrapped.code = 'HIBACHI_PROXY_INVALID';
        throw wrapped;
      }
      if (!proxyUrl || unique.has(proxyUrl)) continue;
      unique.add(proxyUrl);
      this.entries.push({
        proxyUrl,
        id: safeProxyId(proxyUrl),
        dispatcher: null,
        cooldownUntil: 0,
        consecutiveFailures: 0,
        inFlight: 0,
        requests: 0,
        successes: 0,
        rateLimits: 0,
        transportFailures: 0,
        geoBlocks: 0,
        lastSuccessAt: 0,
        lastFailureAt: 0,
      });
    }
  }

  get configured() {
    return this.entries.length > 0;
  }

  dispatcherFor(entry) {
    if (!entry.dispatcher) entry.dispatcher = new this.ProxyAgentClass(entry.proxyUrl);
    return entry.dispatcher;
  }

  acquire({ affinityKey = '', excluded = new Set() } = {}) {
    if (!this.configured) return null;
    const now = this.now();
    const count = this.entries.length;
    const start = affinityKey
      ? stableIndex(affinityKey, count)
      : (this.roundRobin++ % count);

    for (let offset = 0; offset < count; offset += 1) {
      const index = (start + offset) % count;
      if (excluded.has(index)) continue;
      const entry = this.entries[index];
      if (entry.cooldownUntil > now) continue;
      entry.inFlight += 1;
      entry.requests += 1;
      return {
        index,
        id: entry.id,
        dispatcher: this.dispatcherFor(entry),
        released: false,
      };
    }

    if (this.allowDirectFallback) return null;
    const nextReadyAt = this.entries
      .filter((_, index) => !excluded.has(index))
      .reduce((minimum, entry) => Math.min(minimum, entry.cooldownUntil || now), Number.POSITIVE_INFINITY);
    const retryAfter = Number.isFinite(nextReadyAt)
      ? Math.max(1, Math.ceil((nextReadyAt - now) / 1_000))
      : Math.max(1, Math.ceil(this.failureCooldownMs / 1_000));
    const error = new Error(`All configured Hibachi proxies are cooling down. Retry in ${retryAfter} seconds.`);
    error.code = 'HIBACHI_PROXY_POOL_COOLDOWN';
    error.status = 503;
    error.retryAfter = retryAfter;
    throw error;
  }

  release(lease) {
    if (!lease || lease.released) return;
    lease.released = true;
    const entry = this.entries[lease.index];
    if (entry) entry.inFlight = Math.max(0, entry.inFlight - 1);
  }

  reportSuccess(lease) {
    const entry = lease && this.entries[lease.index];
    if (!entry) return;
    entry.successes += 1;
    entry.consecutiveFailures = 0;
    entry.lastSuccessAt = this.now();
  }

  reportRateLimit(lease, retryAfterSeconds = null) {
    const entry = lease && this.entries[lease.index];
    if (!entry) return;
    const parsed = Number(retryAfterSeconds);
    const cooldownMs = Number.isFinite(parsed) && parsed > 0
      ? Math.max(1_000, Math.min(30 * 60_000, Math.ceil(parsed * 1_000)))
      : this.rateLimitCooldownMs;
    entry.rateLimits += 1;
    entry.lastFailureAt = this.now();
    entry.cooldownUntil = Math.max(entry.cooldownUntil, this.now() + cooldownMs);
  }

  reportGeoBlock(lease) {
    const entry = lease && this.entries[lease.index];
    if (!entry) return;
    entry.geoBlocks += 1;
    entry.lastFailureAt = this.now();
    entry.cooldownUntil = Math.max(entry.cooldownUntil, this.now() + this.geoCooldownMs);
  }

  reportTransportFailure(lease) {
    const entry = lease && this.entries[lease.index];
    if (!entry) return;
    entry.transportFailures += 1;
    entry.consecutiveFailures += 1;
    entry.lastFailureAt = this.now();
    const multiplier = 2 ** Math.min(8, entry.consecutiveFailures - 1);
    const cooldownMs = Math.min(this.maxFailureCooldownMs, this.failureCooldownMs * multiplier);
    entry.cooldownUntil = Math.max(entry.cooldownUntil, this.now() + cooldownMs);
  }

  stats() {
    const now = this.now();
    return {
      configured: this.entries.length,
      active: this.entries.filter(entry => entry.cooldownUntil <= now).length,
      cooling: this.entries.filter(entry => entry.cooldownUntil > now).length,
      inFlight: this.entries.reduce((total, entry) => total + entry.inFlight, 0),
      requests: this.entries.reduce((total, entry) => total + entry.requests, 0),
      successes: this.entries.reduce((total, entry) => total + entry.successes, 0),
      successfulProxies: this.entries.filter(entry => entry.successes > 0).length,
      rateLimits: this.entries.reduce((total, entry) => total + entry.rateLimits, 0),
      transportFailures: this.entries.reduce((total, entry) => total + entry.transportFailures, 0),
      geoBlocks: this.entries.reduce((total, entry) => total + entry.geoBlocks, 0),
      directFallback: this.allowDirectFallback,
      readAttempts: this.readAttempts,
    };
  }

  resetForTests() {
    this.roundRobin = 0;
    for (const entry of this.entries) {
      entry.cooldownUntil = 0;
      entry.consecutiveFailures = 0;
      entry.inFlight = 0;
      entry.requests = 0;
      entry.successes = 0;
      entry.rateLimits = 0;
      entry.transportFailures = 0;
      entry.geoBlocks = 0;
      entry.lastSuccessAt = 0;
      entry.lastFailureAt = 0;
    }
  }
}

function createHibachiProxyPool(options = {}) {
  const env = options.env || process.env;
  const lines = options.proxyLines || proxySourceLines(env, options.fsImpl || fs);
  return new HibachiProxyPool(lines, {
    ProxyAgentClass: options.ProxyAgentClass || ProxyAgent,
    now: options.now || Date.now,
    allowDirectFallback: options.allowDirectFallback ?? enabled(env.HIBACHI_PROXY_DIRECT_FALLBACK, false),
    readAttempts: options.readAttempts ?? env.HIBACHI_PROXY_READ_ATTEMPTS,
    rateLimitCooldownMs: options.rateLimitCooldownMs ?? env.HIBACHI_PROXY_RATE_LIMIT_COOLDOWN_MS,
    failureCooldownMs: options.failureCooldownMs ?? env.HIBACHI_PROXY_FAILURE_COOLDOWN_MS,
    maxFailureCooldownMs: options.maxFailureCooldownMs ?? env.HIBACHI_PROXY_MAX_FAILURE_COOLDOWN_MS,
    geoCooldownMs: options.geoCooldownMs ?? env.HIBACHI_PROXY_GEO_COOLDOWN_MS,
  });
}

module.exports = {
  HibachiProxyPool,
  createHibachiProxyPool,
  proxySourceLines,
  proxyUrlFromLine,
};
