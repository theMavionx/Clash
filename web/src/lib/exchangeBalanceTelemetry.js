const SUPPORTED_EXCHANGES = new Set([
  'pacifica', 'avantis', 'decibel', 'gmx', 'ostium', 'monad', 'phoenix',
  'hyperliquid', 'risex', 'nado', 'ondo', 'hibachi', 'hotstuff', 'grvt', 'katana',
  'gmtrade', 'flash', 'lighter', 'rhlighter', 'bulk',
]);

const MIN_REPORT_INTERVAL_MS = 60_000;
const UNCHANGED_REFRESH_MS = 15 * 60_000;
const MATERIAL_BALANCE_CHANGE_USD = 0.01;
const MAX_BALANCE_USD = 1_000_000_000_000;

const reportState = new Map();
let activePlayerToken = '';

function finiteUsd(value, nullable = false) {
  if (value == null || value === '') return nullable ? null : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(MAX_BALANCE_USD, Math.max(0, parsed));
}

export function normalizeExchangeBalanceSnapshot(raw = {}) {
  const dex = String(raw.dex || raw.exchange || '').trim().toLowerCase();
  if (!SUPPORTED_EXCHANGES.has(dex)) return null;
  const rawBalance = raw.balance_usd ?? raw.balanceUsd ?? raw.equity_usd ?? raw.equityUsd;
  if (rawBalance == null || rawBalance === '') return null;
  const balanceUsd = finiteUsd(rawBalance);
  if (balanceUsd == null) return null;
  const availableUsd = finiteUsd(
    raw.available_usd ?? raw.availableUsd ?? raw.available_margin_usd ?? raw.availableMarginUsd,
    true,
  );
  const walletAddress = String(raw.wallet_address || raw.walletAddress || '').trim().slice(0, 160);
  const source = String(raw.source || 'trading_ui')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/gu, '_')
    .slice(0, 48) || 'trading_ui';
  return {
    dex,
    balance_usd: balanceUsd,
    available_usd: availableUsd,
    ...(walletAddress ? { wallet_address: walletAddress } : {}),
    source,
  };
}

function materiallyChanged(previous, next) {
  if (!previous) return true;
  if (Math.abs(previous.balance_usd - next.balance_usd) >= MATERIAL_BALANCE_CHANGE_USD) return true;
  if (previous.available_usd == null || next.available_usd == null) {
    return previous.available_usd !== next.available_usd;
  }
  return Math.abs(previous.available_usd - next.available_usd) >= MATERIAL_BALANCE_CHANGE_USD;
}

function playerToken(explicitToken) {
  if (explicitToken) return String(explicitToken);
  return typeof window !== 'undefined' ? String(window._playerToken || '') : '';
}

export async function reportExchangeBalanceSnapshots(rawSnapshots, options = {}) {
  const token = playerToken(options.token);
  if (!token || typeof fetch !== 'function') return { ok: false, skipped: 'unauthenticated' };
  if (token !== activePlayerToken) {
    reportState.clear();
    activePlayerToken = token;
  }

  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const rowsByDex = new Map();
  for (const raw of Array.isArray(rawSnapshots) ? rawSnapshots : [rawSnapshots]) {
    const row = normalizeExchangeBalanceSnapshot(raw);
    if (row) rowsByDex.set(row.dex, row);
  }

  const dueRows = [];
  for (const row of rowsByDex.values()) {
    const state = reportState.get(row.dex);
    if (state && now - state.attemptedAt < MIN_REPORT_INTERVAL_MS) continue;
    const changed = materiallyChanged(state?.snapshot, row);
    if (!changed && state?.succeededAt && now - state.succeededAt < UNCHANGED_REFRESH_MS) continue;
    dueRows.push(row);
    reportState.set(row.dex, {
      ...state,
      attemptedAt: now,
      snapshot: row,
    });
  }
  if (!dueRows.length) return { ok: true, skipped: 'throttled', stored: 0 };

  try {
    const response = await fetch('/api/exchange-balances/snapshot', {
      method: 'POST',
      cache: 'no-store',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'x-token': token,
      },
      body: JSON.stringify({ snapshots: dueRows }),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, stored: 0 };
    }
    for (const row of dueRows) {
      const state = reportState.get(row.dex);
      reportState.set(row.dex, { ...state, succeededAt: now, snapshot: row });
    }
    return { ok: true, stored: dueRows.length };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), stored: 0 };
  }
}

export const _test = {
  materiallyChanged,
  reset() {
    reportState.clear();
    activePlayerToken = '';
  },
};
