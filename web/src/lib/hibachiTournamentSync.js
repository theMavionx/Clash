import { hibachiCredentialHeaders, normalizeHibachiCredentials } from './hibachiCredentials.js';

export const HIBACHI_TOURNAMENT_SYNC_INTERVAL_MS = 60_000;

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function parseResponse(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { error: text || '' }; }
}

export async function syncHibachiTournamentVolume({
  token,
  wallet = '',
  credentials,
  forceReconcile = false,
  reason = 'tournament_poll',
  signal,
  fetchImpl = fetch,
} = {}) {
  const normalized = normalizeHibachiCredentials(credentials);
  if (!token) throw new Error('Game session is not ready');
  if (!normalized) throw new Error('Reconnect Hibachi API credentials on this device to sync tournament volume');

  const send = async () => {
    const response = await fetchImpl('/api/trading/claim-gold', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-token': token,
        ...hibachiCredentialHeaders(normalized),
      },
      body: JSON.stringify({
        wallet: wallet || undefined,
        dex: 'hibachi',
        reason,
        force_reconcile: forceReconcile === true,
      }),
      signal,
    });
    return { response, data: await parseResponse(response) };
  };

  let result = await send();
  if (result.response.status === 429 && !signal?.aborted) {
    const retryAfterMs = Math.max(
      300,
      Math.min(2_000, Number(result.data?.retry_after_ms || 0) || 1_000),
    );
    await wait(retryAfterMs, signal);
    result = await send();
  }
  if (!result.response.ok) {
    throw new Error(
      result.data?.detail
      || result.data?.error
      || result.data?.reason
      || `Hibachi tournament sync failed (${result.response.status})`,
    );
  }
  if (result.data?.reconciliation?.ok === false) {
    throw new Error(
      result.data.reconciliation.error
      || `Hibachi trade import could not complete (${result.data.reconciliation.skipped || 'unknown error'})`,
    );
  }
  return result.data || {};
}
