import { migrationErrorText } from './strings.js';

/** One request only: a timed-out write is ambiguous and must not be auto-replayed. */
export async function migrationApi(path, token, body, { fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('/api/migration' + path, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal,
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data;
    try { data = await response.json(); } catch { throw Object.assign(new Error('Invalid response'), { code: 'INVALID_RESPONSE' }); }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw Object.assign(new Error('Invalid response'), { code: 'INVALID_RESPONSE' });
    if (!response.ok) {
      const reference = data.traceId || response.headers?.get('x-request-id');
      const trace = /^[0-9a-f-]{36}$/.test(reference || '') ? ` Reference: ${reference}` : '';
      throw Object.assign(new Error(migrationErrorText(data.error) + trace), {
        migrationSafe: true, status: response.status, code: data.error,
      });
    }
    return data;
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
