const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

function splitKeys(value) {
  return String(value || '')
    .split(/[\s,;]+/u)
    .map(key => key.trim())
    .filter(Boolean);
}

const VITE_ENV = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env
  : {};

function errorStatus(error) {
  const direct = Number(
    error?.status
    ?? error?.statusCode
    ?? error?.response?.status
    ?? error?.response?.statusCode,
  );
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(error?.message || error || '').match(/\b(401|403|429)\b/u);
  return match ? Number(match[1]) : 0;
}

export function isAptosBrowserKeyLimitError(error) {
  const status = errorStatus(error);
  if ([401, 403, 429].includes(status)) return true;
  return /rate[\s_-]*limit|too many requests|max(?:imum)? usage|quota|credit cap|monthlycredit|monthlybudget|monthly budget|organization limit/iu
    .test(String(error?.message || error || ''));
}

export function createAptosBrowserKeyPool(keys, poolOptions = {}) {
  const normalizedKeys = [...new Set((keys || []).flatMap(splitKeys))];
  const cooldownUntil = new Map();
  const now = typeof poolOptions.now === 'function' ? poolOptions.now : Date.now;
  const logger = poolOptions.logger || console;
  let cursor = 0;

  function candidates() {
    if (!normalizedKeys.length) return [{ key: '', index: -1 }];
    const currentTime = now();
    const available = [];
    const cooling = [];
    for (let offset = 0; offset < normalizedKeys.length; offset += 1) {
      const index = (cursor + offset) % normalizedKeys.length;
      const item = { key: normalizedKeys[index], index };
      const until = cooldownUntil.get(index) || 0;
      if (until <= currentTime) available.push(item);
      else cooling.push({ ...item, until });
    }
    if (available.length) return available;
    cooling.sort((a, b) => a.until - b.until);
    return cooling;
  }

  function markLimited(index, cooldownMs) {
    if (index < 0) return;
    cooldownUntil.set(index, now() + cooldownMs);
  }

  function markSuccess(index) {
    if (index < 0 || !normalizedKeys.length) return;
    cooldownUntil.delete(index);
    cursor = (index + 1) % normalizedKeys.length;
  }

  async function run(operation, options = {}) {
    const cooldownMs = Math.max(1000, Number(options.cooldownMs || DEFAULT_COOLDOWN_MS));
    let lastError = null;
    for (const candidate of candidates()) {
      try {
        const result = await operation(candidate.key, candidate.index);
        markSuccess(candidate.index);
        return result;
      } catch (error) {
        lastError = error;
        if (!isAptosBrowserKeyLimitError(error)) throw error;
        markLimited(candidate.index, cooldownMs);
        logger.warn?.('[Aptos] Browser API key limited; rotating', {
          operation: options.label || 'Aptos request',
          key_index: candidate.index + 1,
          key_count: normalizedKeys.length,
          status: errorStatus(error) || undefined,
          cooldown_ms: cooldownMs,
        });
      }
    }
    if (options.allowPublicFallback && normalizedKeys.length) {
      return operation('', -1);
    }
    throw lastError || new Error(`No Aptos browser API key available for ${options.label || 'request'}`);
  }

  function status() {
    const currentTime = now();
    return {
      key_count: normalizedKeys.length,
      current_index: normalizedKeys.length ? cursor + 1 : 0,
      cooling_down: [...cooldownUntil.entries()]
        .filter(([, until]) => until > currentTime)
        .map(([index, until]) => ({
          key_index: index + 1,
          retry_in_ms: Math.max(0, until - currentTime),
        })),
    };
  }

  return {
    run,
    preferredKey: () => candidates()[0]?.key || '',
    status,
  };
}

const browserKeyPool = createAptosBrowserKeyPool([
  ...splitKeys(VITE_ENV.VITE_APTOS_NODE_API_KEYS),
  ...splitKeys(VITE_ENV.VITE_APTOS_NODE_API_KEY),
]);

export async function runWithAptosBrowserKeys(operation, options = {}) {
  return browserKeyPool.run(operation, options);
}

export function aptosFetchOptionsForKey(baseOptions = {}, apiKey = '') {
  const headers = new Headers(baseOptions.headers || {});
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
  else headers.delete('Authorization');
  return { ...baseOptions, headers };
}

export async function fetchWithAptosBrowserKeys(url, options = {}, metadata = {}) {
  return runWithAptosBrowserKeys(async apiKey => {
    const response = await fetch(url, aptosFetchOptionsForKey(options, apiKey));
    if ([401, 403, 429].includes(response.status)) {
      const body = await response.clone().text().catch(() => '');
      const error = new Error(
        `${metadata.label || 'Aptos request'} failed: ${response.status} ${body || response.statusText}`,
      );
      error.status = response.status;
      throw error;
    }
    return response;
  }, metadata);
}

export function getPreferredAptosApiKey() {
  return browserKeyPool.preferredKey();
}

export function getAptosBrowserKeyPoolStatus() {
  return browserKeyPool.status();
}
