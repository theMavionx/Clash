import { useCallback, useLayoutEffect, useMemo, useState } from 'react';

async function requestReward(scope, signal) {
  const { gameApi, token, dex, wallet, imperialJwt } = scope;
  const response = await fetch(`${gameApi}/trading/claim-gold`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-token': token, 'x-dex': dex,
      ...(imperialJwt ? { 'x-imperial-jwt': imperialJwt } : {}) },
    body: JSON.stringify({ dex, wallet }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error || result?.reason || `Reward claim failed (${response.status})`);
  return result;
}

async function refreshRewardResources(scope, signal, current) {
  try {
    const response = await fetch(`${scope.gameApi}/resources`, {
      signal, cache: 'no-store', headers: { 'x-token': scope.token },
    });
    const data = await response.json();
    if (!response.ok || !current() || !data) return;
    const resources = { gold: Number(data.gold), wood: Number(data.wood), ore: Number(data.ore) };
    if (Object.values(resources).every(value => Number.isFinite(value) && value >= 0)) {
      window.onGodotMessage?.({ action: 'resources', data: resources });
    }
  } catch { /* A refresh failure must not replace the committed claim result. */ }
}

function rewardClaim(scope, current, publish) {
  let inFlight = null, abort = null, generation = 0;
  return {
    claim: () => {
      if (!current()) return Promise.resolve(null);
      if (inFlight) return inFlight;
      const epoch = generation;
      abort = new AbortController();
      const signal = abort.signal;
      const stillCurrent = () => current() && epoch === generation;
      const pending = requestReward(scope, signal).then(async result => {
        if (!stillCurrent()) return null;
        publish(result);
        if (Number(result?.gold) > 0 && result?.dex === scope.dex) {
          await refreshRewardResources(scope, signal, stillCurrent);
        }
        return stillCurrent() ? result : null;
      }).catch(cause => {
        if (current() && epoch === generation && cause?.name !== 'AbortError') {
          console.warn(`[${scope.dex} rewards]`, cause?.message || cause);
        }
        return null;
      }).finally(() => { if (inFlight === pending) { inFlight = null; abort = null; } });
      inFlight = pending;
      return pending;
    },
    cancel: () => { generation++; abort?.abort(); inFlight = null; },
  };
}

function rewardScheduler(scope, publish) {
  let alive = false, poll = null;
  const timers = new Set();
  const current = () => alive && scope.active && scope.ready && !!scope.token && !!scope.wallet
    && (!window._playerToken || window._playerToken === scope.token);
  const request = rewardClaim(scope, current, publish);
  const clear = () => { for (const timer of timers) clearTimeout(timer); timers.clear(); };
  const later = delay => {
    const timer = setTimeout(() => { timers.delete(timer); request.claim(); }, delay);
    timers.add(timer);
  };
  return {
    claim: request.claim,
    afterTrade: () => {
      if (!current()) return;
      clear(); later(2_500);
      // The server importer has a 20s per-reason cooldown. Catch late fills after it.
      later(25_000);
    },
    start: () => {
      alive = true;
      if (!current()) return;
      later(1_500);
      poll = setInterval(() => { if (document.visibilityState === 'visible') request.claim(); }, 30_000);
    },
    stop: () => { alive = false; clear(); clearInterval(poll); request.cancel(); },
  };
}

/** Claim server-verified rewards; never infer a payout from an accepted order. */
export function useTradingGoldSync({ active, ready, dex, playerId, token, wallet,
  sessionKey = '', imperialJwt = '', gameApi = '/api' }) {
  const scope = useMemo(() => ({ active, ready, dex, playerId, token, wallet, sessionKey, imperialJwt, gameApi }),
    [active, ready, dex, playerId, token, wallet, sessionKey, imperialJwt, gameApi]);
  const [notice, setNotice] = useState(null);
  const controller = useMemo(() => rewardScheduler(scope, result => {
    const amount = Number(result?.gold);
    if (!Number.isFinite(amount) || amount <= 0 || result?.dex !== scope.dex) return;
    setNotice({ scope, amount, reason: result.reason || 'Trading rewards' });
    window.onGodotMessage?.({ action: 'resources_add', data: { gold: amount, wood: 0, ore: 0 } });
  }), [scope]);
  // Invalidate the old identity synchronously at commit, before async results can publish.
  useLayoutEffect(() => { controller.start(); return controller.stop; }, [controller]);
  const clearGoldEarned = useCallback(() => setNotice(null), []);
  return { claimGold: controller.claim, scheduleGoldClaim: controller.afterTrade, clearGoldEarned,
    goldEarned: notice?.scope === scope ? { amount: notice.amount, reason: notice.reason } : null };
}
