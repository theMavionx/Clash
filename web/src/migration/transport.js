import { migrationErrorText } from './strings.js';

/** Retry only explicit admission rejection; a timed-out write remains ambiguous. */
export async function migrationApi(path, token, body, { fetchImpl = fetch, timeoutMs = 25000,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl('/api/migration' + path, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal,
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: serialized }),
    });
    let data;
    try { data = await response.json(); } catch { throw Object.assign(new Error('Invalid response'), { code: 'INVALID_RESPONSE' }); }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw Object.assign(new Error('Invalid response'), { code: 'INVALID_RESPONSE' });
    if (!response.ok) {
      if (['/quote', '/submit'].includes(path) && response.status === 409 &&
        data.error === 'WORKER_BUSY' && attempt < 2 && !controller.signal.aborted) {
        await wait(400 * (attempt + 1));
        continue; // Same idempotency key or exact signed bytes; never ask for another signature.
      }
      const reference = data.traceId || response.headers?.get('x-request-id');
      const trace = /^[0-9a-f-]{36}$/.test(reference || '') ? ` Reference: ${reference}` : '';
      throw Object.assign(new Error(migrationErrorText(data.error) + trace), {
        migrationSafe: true, status: response.status, code: data.error,
      });
    }
    return data;
    }
  } finally { clearTimeout(timer); }
}

/** Serial polling; no timer fan-out while a previous network call is pending. */
export function startMigrationPolling(read, { onError = () => {}, intervalMs = 12000,
  schedule = setTimeout, cancel = clearTimeout } = {}) {
  let stopped = false, timer;
  async function poll() {
    try { await read(); } catch (error) { if (!stopped) onError(error); }
    finally { if (!stopped) timer = schedule(poll, intervalMs); }
  }
  void poll();
  return () => { stopped = true; cancel(timer); };
}
