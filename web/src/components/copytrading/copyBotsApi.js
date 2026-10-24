// Client for in-game ClashBot copy bots. The Clash server
// (server/clashbot_copy_bots.js) signs every call to ClashBot's partner API,
// so the browser only ever sends its game token to its own origin.
import { botAuthHeaders } from '../../lib/botApiClient';
import { CopyApiError } from './copyTradingApi';

const BASE = '/api/v1/copy-bots';

async function call(token, method, path, { body, query, signal } = {}) {
  const search = query ? `?${new URLSearchParams(query)}` : '';
  let response;
  try {
    response = await fetch(`${BASE}${path}${search}`, {
      method,
      headers: botAuthHeaders(token, {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new CopyApiError('Network error. Check your connection and try again.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : payload?.error?.message || payload?.message || `Copy bot request failed (${response.status})`;
    const error = new CopyApiError(message, { status: response.status, code: payload?.code || '' });
    error.payload = payload;
    throw error;
  }
  return payload;
}

export const copyBotsStatus = (token, signal) => call(token, 'GET', '/status', { signal });
export const listCopyBots = (token, signal) => call(token, 'GET', '/bots', { signal });
export const createCopyBot = (token, body) => call(token, 'POST', '/bots', { body });
export const updateCopyBot = (token, id, body) => call(token, 'PATCH', `/bots/${id}`, { body });
export const setCopyBotStatus = (token, id, status, force) =>
  call(token, 'POST', `/bots/${id}/status`, { body: force === undefined ? { status } : { status, force } });
export const flattenCopyBot = (token, id, then) => call(token, 'POST', `/bots/${id}/flatten`, { body: then ? { then } : {} });
export const deleteCopyBot = (token, id) => call(token, 'DELETE', `/bots/${id}`);
export const copyBotStats = (token, id, signal) => call(token, 'GET', `/bots/${id}/stats`, { signal });
export const copyBotDiagnostics = (token, id, signal) => call(token, 'GET', `/bots/${id}/diagnostics`, { query: { limit: '20' }, signal });
export const savedCopyConnections = (token, venue) => call(token, 'POST', '/connections', { body: { venue } });
export const revokeCopyConnections = (token, venue) => call(token, 'POST', '/connections/revoke', { body: venue ? { venue } : {} });
