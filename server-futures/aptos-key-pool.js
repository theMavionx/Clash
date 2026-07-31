'use strict';

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

function splitKeys(value) {
  if (Array.isArray(value)) return value.flatMap(splitKeys);
  return String(value || '')
    .split(/[\s,;]+/)
    .map(key => key.trim())
    .filter(Boolean);
}

function uniqueKeys(values) {
  return [...new Set(values.flatMap(splitKeys))];
}

function keyPoolFromEnv(env = process.env) {
  const decibelKeys = uniqueKeys([
    env.DECIBEL_API_KEY,
    env.DECIBEL_API_KEYS,
  ]);
  if (decibelKeys.length) return decibelKeys;
  return uniqueKeys([
    env.APTOS_NODE_API_KEY,
    env.APTOS_API_KEY,
    env.VITE_APTOS_NODE_API_KEY,
    env.APTOS_NODE_API_KEYS,
    env.APTOS_API_KEYS,
  ]);
}

function errorStatus(error) {
  const status = Number(
    error?.status
    ?? error?.statusCode
    ?? error?.response?.status
    ?? error?.response?.statusCode,
  );
  return Number.isFinite(status) ? status : 0;
}

function isAptosKeyLimitError(error) {
  const status = errorStatus(error);
  if ([401, 403, 429].includes(status)) return true;
  const text = [
    error?.message,
    error?.body,
    error?.response?.data,
    error,
  ].map(value => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value || ''); }
  }).join(' ');
  return /rate[\s_-]*limit|too many requests|max(?:imum)? usage|quota|credit cap|monthlycredit|system limit|organization limit/i.test(text);
}

class AptosApiKeyPool {
  constructor(options = {}) {
    this.keys = uniqueKeys(options.keys || []);
    this.cooldownMs = Math.max(1000, Number(options.cooldownMs || DEFAULT_COOLDOWN_MS));
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.logger = options.logger || console;
    this.logPrefix = String(options.logPrefix || '[decibel]');
    this.cursor = 0;
    this.cooldownUntil = new Map();
  }

  get size() {
    return this.keys.length;
  }

  candidates() {
    if (!this.keys.length) return [{ key: '', index: -1 }];
    const now = this.now();
    const available = [];
    const cooling = [];
    for (let offset = 0; offset < this.keys.length; offset += 1) {
      const index = (this.cursor + offset) % this.keys.length;
      const item = { key: this.keys[index], index };
      const until = this.cooldownUntil.get(index) || 0;
      if (until <= now) available.push(item);
      else cooling.push({ ...item, until });
    }
    if (available.length) return available;
    cooling.sort((a, b) => a.until - b.until);
    return cooling;
  }

  markLimited(index, label, error) {
    if (index < 0) return;
    this.cooldownUntil.set(index, this.now() + this.cooldownMs);
    this.logger.warn?.(`${this.logPrefix} Aptos API key rate-limited; rotating`, {
      operation: label,
      key_index: index + 1,
      key_count: this.keys.length,
      status: errorStatus(error) || undefined,
      cooldown_ms: this.cooldownMs,
    });
  }

  markSuccess(index) {
    if (index < 0 || !this.keys.length) return;
    this.cooldownUntil.delete(index);
    this.cursor = (index + 1) % this.keys.length;
  }

  async run(label, operation, options = {}) {
    const isRetryable = options.isRetryable || isAptosKeyLimitError;
    const candidates = this.candidates();
    let lastError = null;
    for (const candidate of candidates) {
      try {
        const result = await operation(candidate.key, candidate.index);
        this.markSuccess(candidate.index);
        return result;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) throw error;
        this.markLimited(candidate.index, label, error);
      }
    }
    if (options.allowPublicFallback && this.keys.length) {
      return operation('', -1);
    }
    throw lastError || new Error(`No Aptos API key available for ${label}`);
  }

  snapshot() {
    const now = this.now();
    return {
      key_count: this.keys.length,
      current_index: this.keys.length ? this.cursor + 1 : 0,
      cooling_down: [...this.cooldownUntil.entries()]
        .filter(([, until]) => until > now)
        .map(([index, until]) => ({
          key_index: index + 1,
          retry_in_ms: Math.max(0, until - now),
        })),
    };
  }
}

module.exports = {
  AptosApiKeyPool,
  isAptosKeyLimitError,
  keyPoolFromEnv,
  splitKeys,
  uniqueKeys,
};
