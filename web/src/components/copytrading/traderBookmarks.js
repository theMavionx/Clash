// Starred traders (ClashBot copy/main src/copyTrading/traderBookmarks.ts):
// a local snapshot list, scoped per game player, shown as the "Starred" scope.
import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'clash.copytrading.bookmarks.v1:';
const CHANGE_EVENT = 'clash:copytrading-bookmarks';
export const MAX_TRADER_BOOKMARKS = 100;
const EVM_ACCOUNT = /^0x[0-9a-f]{40}$/i;

const SNAPSHOT_FIELDS = [
  'rank', 'displayName', 'pnlUsd', 'roiPercent', 'volumeUsd', 'accountValueUsd', 'copyScore',
  'winRatePercent', 'winRateTradesCount', 'winRateWinsCount', 'winRateLossesCount', 'winRateBreakevenCount',
  'winRateGrossProfitUsd', 'winRateGrossLossUsd', 'quality', 'pnlQuality', 'roiQuality', 'winRateQuality',
  'capitalTier', 'positionBias', 'traderPattern', 'traderPatternConfidence', 'minimumCopyBalanceUsd',
];

export function bookmarkKey(venue, account) {
  const trimmed = String(account || '').trim();
  const canonical = venue === 'decibel' || EVM_ACCOUNT.test(trimmed) ? trimmed.toLowerCase() : trimmed;
  return `${venue}:${canonical}`;
}

function storageKey(playerId) {
  return `${PREFIX}${String(playerId || 'anonymous')}`;
}

function read(playerId) {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(storageKey(playerId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.venue === 'string' && typeof item.account === 'string'
        && /^[a-z0-9]{2,24}$/.test(item.venue) && item.account.length <= 128)
      .slice(0, MAX_TRADER_BOOKMARKS);
  } catch {
    return [];
  }
}

function write(playerId, list) {
  try {
    globalThis.localStorage?.setItem(storageKey(playerId), JSON.stringify(list.slice(0, MAX_TRADER_BOOKMARKS)));
  } catch {
    // Storage unavailable: starring is a convenience only.
  }
  globalThis.dispatchEvent?.(new Event(CHANGE_EVENT));
}

function snapshot(trader, window) {
  const out = { venue: trader.venue, account: trader.account, snapshotWindow: window, savedAt: Date.now() };
  for (const field of SNAPSHOT_FIELDS) out[field] = trader[field] ?? null;
  return out;
}

/** Hook: `{ bookmarks, isBookmarked, toggle }`, synced across components. */
export function useTraderBookmarks(playerId) {
  const [bookmarks, setBookmarks] = useState(() => read(playerId));

  useEffect(() => {
    const sync = () => setBookmarks(read(playerId));
    sync();
    globalThis.addEventListener?.(CHANGE_EVENT, sync);
    globalThis.addEventListener?.('storage', sync);
    return () => {
      globalThis.removeEventListener?.(CHANGE_EVENT, sync);
      globalThis.removeEventListener?.('storage', sync);
    };
  }, [playerId]);

  const isBookmarked = useCallback(
    (trader) => bookmarks.some((item) => bookmarkKey(item.venue, item.account) === bookmarkKey(trader.venue, trader.account)),
    [bookmarks],
  );

  const toggle = useCallback((trader, window) => {
    const key = bookmarkKey(trader.venue, trader.account);
    const current = read(playerId);
    const exists = current.some((item) => bookmarkKey(item.venue, item.account) === key);
    write(playerId, exists
      ? current.filter((item) => bookmarkKey(item.venue, item.account) !== key)
      : [snapshot(trader, window), ...current]);
  }, [playerId]);

  return { bookmarks, isBookmarked, toggle };
}
