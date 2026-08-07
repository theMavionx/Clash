// Player-facing tournament state hook.
//
// Fetches /api/tournaments/me — the active tournament for the player's DEX
// (or null) and their participation row. Components use it to decide
// whether to show "Join" or "Leave + leaderboard". Polls every 30s while
// the panel is open; the calling component triggers a manual `refresh()`
// after a join/leave action so the UI reflects the change without waiting
// for the next poll tick.
import { useEffect, useState, useCallback, useRef } from 'react';
import { usePlayer } from './useGodot';
import { useDex } from '../contexts/DexContext';

const TOURNAMENT_REQUEST_TIMEOUT_MS = 12_000;
const TOURNAMENT_CACHE_TTL_MS = 30_000;
const TOURNAMENT_CACHE_MAX_ENTRIES = 100;
const tournamentResponseCache = new Map();

function readTournamentCache(key) {
  const entry = tournamentResponseCache.get(key);
  if (!entry || Date.now() - entry.storedAt > TOURNAMENT_CACHE_TTL_MS) return null;
  return entry.data;
}

function writeTournamentCache(key, data) {
  tournamentResponseCache.delete(key);
  tournamentResponseCache.set(key, { data, storedAt: Date.now() });
  while (tournamentResponseCache.size > TOURNAMENT_CACHE_MAX_ENTRIES) {
    tournamentResponseCache.delete(tournamentResponseCache.keys().next().value);
  }
}

function deleteTournamentCache(key) {
  tournamentResponseCache.delete(key);
}

function cancelTournamentRequest(requestRef) {
  requestRef.current?.controller?.abort();
  requestRef.current = null;
}

function fetchTournamentJson(requestRef, key, url, options = {}) {
  const active = requestRef.current;
  if (active?.key === key && active.promise) return active.promise;
  active?.controller?.abort();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOURNAMENT_REQUEST_TIMEOUT_MS);
  let trackedPromise;
  const request = fetch(url, {
    ...options,
    cache: 'no-store',
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) throw new Error(`tournament request failed (${response.status})`);
    return response.json();
  });
  trackedPromise = request.finally(() => {
    clearTimeout(timeout);
    if (requestRef.current?.promise === trackedPromise) requestRef.current = null;
  });
  requestRef.current = { key, controller, promise: trackedPromise };
  return trackedPromise;
}

export function useTournament({ active = false, pollMs = 30000 } = {}) {
  const player = usePlayer();
  const token = player?.token;
  const { dex } = useDex();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const tokenRef = useRef(token);
  const dexRef = useRef(dex);
  const requestRef = useRef(null);
  tokenRef.current = token;
  dexRef.current = dex;
  const cacheKey = `me:${player?.id || player?.player_id || 'session'}:${dex || ''}`;

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const fetchToken = token;
    const fetchDex = dex;
    try {
      const data = await fetchTournamentJson(requestRef, cacheKey, `/api/tournaments/me?dex=${encodeURIComponent(fetchDex || '')}`, {
        headers: { 'x-token': fetchToken },
      });
      // Stale-response guard: if the token changed while this was in flight
      // (account switch), drop the result so we don't paint Bob's tournament
      // state into Alice's UI.
      if (tokenRef.current !== fetchToken || dexRef.current !== fetchDex) return;
      writeTournamentCache(cacheKey, data);
      setMe(data);
      setLoaded(true);
    } catch (e) {
      if (tokenRef.current !== fetchToken || dexRef.current !== fetchDex) return;
      setError(e.message || 'error');
      setLoaded(true);
    } finally {
      if (tokenRef.current === fetchToken && dexRef.current === fetchDex) setLoading(false);
    }
  }, [token, dex, cacheKey]);

  useEffect(() => {
    if (!active) return;
    if (!token) {
      setMe(null);
      setLoading(false);
      setLoaded(false);
      return;
    }
    const cached = readTournamentCache(cacheKey);
    setLoaded(!!cached);
    setMe(cached);
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => {
      clearInterval(id);
      cancelTournamentRequest(requestRef);
    };
  }, [active, token, dex, pollMs, refresh, cacheKey]);

  const join = useCallback(async (tournamentId, options = {}) => {
    if (!token) return false;
    const res = await fetch(`/api/tournaments/${tournamentId}/join`, {
      method: 'POST',
      headers: { 'x-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reward_wallet_evm: options.rewardWalletEvm || options.reward_wallet_evm || undefined,
        reward_wallet_solana: options.rewardWalletSolana || options.reward_wallet_solana || options.rewardWalletEvm || options.reward_wallet_evm || undefined,
        twitter_handle: options.twitterHandle || options.twitter_handle || undefined,
      }),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    cancelTournamentRequest(requestRef);
    deleteTournamentCache(cacheKey);
    await refresh();
    return { ok: res.ok, ...(data || {}) };
  }, [token, refresh, cacheKey]);

  const updateRewardWallet = useCallback(async (tournamentId, rewardWalletEvm, options = {}) => {
    if (!token) return { ok: false, error: 'not authenticated' };
    const res = await fetch(`/api/tournaments/${tournamentId}/reward-wallet`, {
      method: 'POST',
      headers: { 'x-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reward_wallet_evm: rewardWalletEvm,
        reward_wallet_solana: rewardWalletEvm,
        twitter_handle: options.twitterHandle || options.twitter_handle || undefined,
      }),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    cancelTournamentRequest(requestRef);
    deleteTournamentCache(cacheKey);
    await refresh();
    return { ok: res.ok, ...(data || {}) };
  }, [token, refresh, cacheKey]);

  const leave = useCallback(async (tournamentId) => {
    if (!token) return false;
    const res = await fetch(`/api/tournaments/${tournamentId}/leave`, {
      method: 'POST',
      headers: { 'x-token': token },
    });
    const ok = res.ok;
    cancelTournamentRequest(requestRef);
    deleteTournamentCache(cacheKey);
    await refresh();
    return ok;
  }, [token, refresh, cacheKey]);

  return { me, loading, loaded, error, refresh, join, leave, updateRewardWallet };
}

export function useLuckyRaider({ active = false, pollMs = 30000 } = {}) {
  const player = usePlayer();
  const token = player?.token;
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const tokenRef = useRef(token);
  const requestRef = useRef(null);
  tokenRef.current = token;
  const cacheKey = `lucky:${player?.id || player?.player_id || 'session'}`;

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const fetchToken = token;
    try {
      const data = await fetchTournamentJson(requestRef, cacheKey, '/api/tournaments/lucky-raider', {
        headers: { 'x-token': fetchToken },
      });
      if (tokenRef.current !== fetchToken) return;
      writeTournamentCache(cacheKey, data);
      setMe(data);
      setLoaded(true);
    } catch (e) {
      if (tokenRef.current !== fetchToken) return;
      setError(e.message || 'error');
      setLoaded(true);
    } finally {
      if (tokenRef.current === fetchToken) setLoading(false);
    }
  }, [token, cacheKey]);

  useEffect(() => {
    if (!active) return;
    if (!token) {
      setMe(null);
      setLoading(false);
      setLoaded(false);
      return;
    }
    const cached = readTournamentCache(cacheKey);
    setLoaded(!!cached);
    setMe(cached);
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => {
      clearInterval(id);
      cancelTournamentRequest(requestRef);
    };
  }, [active, token, pollMs, refresh, cacheKey]);

  const updateRewardWallet = useCallback(async (tournamentId, rewardWalletEvm, options = {}) => {
    if (!token) return { ok: false, error: 'not authenticated' };
    const res = await fetch(`/api/tournaments/${tournamentId}/reward-wallet`, {
      method: 'POST',
      headers: { 'x-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reward_wallet_evm: rewardWalletEvm,
        reward_wallet_solana: rewardWalletEvm,
        twitter_handle: options.twitterHandle || options.twitter_handle || undefined,
      }),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    cancelTournamentRequest(requestRef);
    deleteTournamentCache(cacheKey);
    await refresh();
    return { ok: res.ok, ...(data || {}) };
  }, [token, refresh, cacheKey]);

  return { me, loading, loaded, error, refresh, updateRewardWallet };
}

// Public leaderboard fetcher — separate from the per-player state above
// because anyone can spectate (even pre-login). Polls every 10s while the
// panel is open since users want to see their rank update in near-real-time
// when they trade or battle.
export function useTournamentLeaderboard(tournamentId, { active = false, pollMs = 10000 } = {}) {
  const player = usePlayer();
  const token = player?.token;
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const idRef = useRef(tournamentId);
  const tokenRef = useRef(token);
  const requestRef = useRef(null);
  idRef.current = tournamentId;
  tokenRef.current = token;
  const viewerKey = player?.id || player?.player_id || 'public';
  const cacheKey = `leaderboard:${tournamentId || ''}:${viewerKey}`;

  const refresh = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const fetchId = tournamentId;
    const fetchToken = token;
    try {
      const data = await fetchTournamentJson(requestRef, cacheKey, `/api/tournaments/${fetchId}/leaderboard?limit=50`, {
        headers: fetchToken ? { 'x-token': fetchToken } : {},
      });
      // Stale-response guard for tournament-id swaps.
      if (idRef.current !== fetchId || tokenRef.current !== fetchToken) return;
      writeTournamentCache(cacheKey, data);
      setBoard(data);
    } catch {
      /* keep last-known board on transient failure */
    } finally {
      if (idRef.current === fetchId && tokenRef.current === fetchToken) setLoading(false);
    }
  }, [tournamentId, token, cacheKey]);

  useEffect(() => {
    if (!active || !tournamentId) return;
    const cached = readTournamentCache(cacheKey);
    setBoard(cached);
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => {
      clearInterval(id);
      cancelTournamentRequest(requestRef);
    };
  }, [active, tournamentId, pollMs, refresh, cacheKey]);

  return { board, loading, refresh };
}

export function useTournamentDailyPoints(tournamentId, { active = false, pollMs = 30000, limit = 7 } = {}) {
  const player = usePlayer();
  const token = player?.token;
  const [daily, setDaily] = useState(null);
  const [loading, setLoading] = useState(false);
  const idRef = useRef(tournamentId);
  const tokenRef = useRef(token);
  const requestRef = useRef(null);
  idRef.current = tournamentId;
  tokenRef.current = token;
  const boundedLimit = Math.max(1, Math.min(60, Number(limit) || 7));
  const viewerKey = player?.id || player?.player_id || 'public';
  const cacheKey = `daily:${tournamentId || ''}:${boundedLimit}:${viewerKey}`;

  const refresh = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const fetchId = tournamentId;
    const fetchToken = token;
    try {
      const data = await fetchTournamentJson(requestRef, cacheKey, `/api/tournaments/${fetchId}/daily-points?limit=${boundedLimit}`, {
        headers: fetchToken ? { 'x-token': fetchToken } : {},
      });
      if (idRef.current !== fetchId || tokenRef.current !== fetchToken) return;
      writeTournamentCache(cacheKey, data);
      setDaily(data);
    } catch {
      /* keep last-known daily stats on transient failure */
    } finally {
      if (idRef.current === fetchId && tokenRef.current === fetchToken) setLoading(false);
    }
  }, [tournamentId, token, boundedLimit, cacheKey]);

  useEffect(() => {
    if (!active || !tournamentId) return;
    const cached = readTournamentCache(cacheKey);
    setDaily(cached);
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => {
      clearInterval(id);
      cancelTournamentRequest(requestRef);
    };
  }, [active, tournamentId, pollMs, refresh, cacheKey]);

  useEffect(() => {
    if (!active || tournamentId) return;
    setDaily(null);
    setLoading(false);
  }, [active, tournamentId]);

  return { daily, loading, refresh };
}

// Past tournaments for the current player's DEX (status='ended' or end_at
// < now). Used by the "History" tab in TournamentPanel so a finished
// tournament's leaderboard doesn't disappear the moment it ends. Returned
// rows include the player's own participation summary, so the panel can
// show "your final rank: $X PnL" without a per-tournament round-trip.
export function useTournamentHistory({ active = false } = {}) {
  const player = usePlayer();
  const token = player?.token;
  const { dex } = useDex();
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef(token);
  const dexRef = useRef(dex);
  const requestRef = useRef(null);
  tokenRef.current = token;
  dexRef.current = dex;
  const cacheKey = `history:${player?.id || player?.player_id || 'session'}:${dex || ''}`;

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const fetchToken = token;
    const fetchDex = dex;
    try {
      const data = await fetchTournamentJson(requestRef, cacheKey, `/api/tournaments/history?limit=20&dex=${encodeURIComponent(fetchDex || '')}`, {
        headers: { 'x-token': fetchToken },
      });
      if (tokenRef.current !== fetchToken || dexRef.current !== fetchDex) return;
      writeTournamentCache(cacheKey, data);
      setItems(data.tournaments || []);
    } catch {
      /* keep last-known list on transient failure */
    } finally {
      if (tokenRef.current === fetchToken && dexRef.current === fetchDex) setLoading(false);
    }
  }, [token, dex, cacheKey]);

  useEffect(() => {
    if (!active || !token) return;
    const cached = readTournamentCache(cacheKey);
    setItems(cached?.tournaments || null);
    refresh();
    return () => cancelTournamentRequest(requestRef);
  }, [active, token, dex, refresh, cacheKey]);

  return { items, loading, refresh };
}
