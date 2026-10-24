// Client for ClashBot's public copy-trading analytics, reached through the
// Clash server's authenticated allowlist proxy (server/clashbot_copy_proxy.js).
//
// Contracts mirror the public fetches in ClashBot's CopyTradingPage
// (egorble/copy-trading `copy/main`); only the base path differs:
//   /leaderboard-api/v1/leaderboard      -> /api/v1/copy-trading/leaderboard
//   /leaderboard-api/v1/venues/status    -> /api/v1/copy-trading/venues/status
//   /copy-api/v1/<route>                 -> /api/v1/copy-trading/<route>
//
// Copy-bot control (create / manage / stats) lives in copyBotsApi.js, which
// goes through the Clash server's HMAC-signed ClashBot partner channel.
//
// The path is same-origin on purpose: VITE_BOT_API_BASE_URL may point at the
// Phantom bot backend for debugging, which does not host these routes.
import { botAuthHeaders } from '../../lib/botApiClient';

const BASE = '/api/v1/copy-trading';

export class CopyApiError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.name = 'CopyApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, token, { query, signal } = {}) {
  const search = query ? `?${new URLSearchParams(query)}` : '';
  let response;
  try {
    response = await fetch(`${BASE}${path}${search}`, {
      headers: botAuthHeaders(token, { accept: 'application/json' }),
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
      : payload?.error?.message || `Copy trading request failed (${response.status})`;
    throw new CopyApiError(message, { status: response.status, code: payload?.code || '' });
  }
  return payload;
}

/** Leaderboard params use ClashBot's exact query names. */
export function fetchLeaderboard(token, params, signal) {
  return request('/leaderboard', token, { query: params, signal });
}

export function fetchVenueStatuses(token, signal) {
  return request('/venues/status', token, { signal });
}

export function fetchTraderSummary(token, venue, account, signal) {
  return request('/trader-summary', token, { query: { venue, account }, signal });
}

export function fetchTraderDetails(token, params, signal) {
  return request('/trader-details', token, { query: params, signal });
}

export function fetchTraderSourceSnapshot(token, venue, account, signal) {
  return request('/trader-source-snapshot', token, { query: { venue, account }, signal });
}

export function fetchTraderDailyAnalytics(token, venue, account, signal) {
  return request('/trader-daily-analytics', token, { query: { venue, account }, signal });
}

export function fetchTraderTradeHistory(token, { venue, account, range = '30d', page = 1, limit = 50 }, signal) {
  return request('/trader-trade-history', token, {
    query: { venue, account, range, page: String(page), limit: String(limit) },
    signal,
  });
}

/** Public execution readiness per venue (capabilities + destination controls). */
export function fetchCopyServiceStatus(token, signal) {
  return request('/copy/status', token, { signal });
}

export function friendlyCopyError(error, fallback = 'Something went wrong. Try again in a moment.') {
  if (!error) return fallback;
  if (error.name === 'AbortError') return '';
  const message = String(error.message || '').trim();
  if (error.status === 401 && /token/i.test(message)) return 'Sign in again to use copy trading.';
  if (error.status === 429) return 'Too many requests. Wait a few seconds and try again.';
  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return 'ClashBot is temporarily unavailable. Try again shortly.';
  }
  return message || fallback;
}
