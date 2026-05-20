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

export function useTournament({ active = false, pollMs = 30000 } = {}) {
  const player = usePlayer();
  const token = player?.token;
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const fetchToken = token;
    try {
      const res = await fetch('/api/tournaments/me', {
        headers: { 'x-token': fetchToken },
      });
      if (!res.ok) throw new Error('failed to load tournament');
      const data = await res.json();
      // Stale-response guard: if the token changed while this was in flight
      // (account switch), drop the result so we don't paint Bob's tournament
      // state into Alice's UI.
      if (tokenRef.current !== fetchToken) return;
      setMe(data);
      setLoaded(true);
    } catch (e) {
      setError(e.message || 'error');
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!active) return;
    if (!token) {
      setMe(null);
      setLoading(false);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [active, token, pollMs, refresh]);

  const join = useCallback(async (tournamentId, options = {}) => {
    if (!token) return false;
    const res = await fetch(`/api/tournaments/${tournamentId}/join`, {
      method: 'POST',
      headers: { 'x-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reward_wallet_evm: options.rewardWalletEvm || options.reward_wallet_evm || undefined,
      }),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    await refresh();
    return { ok: res.ok, ...(data || {}) };
  }, [token, refresh]);

  const updateRewardWallet = useCallback(async (tournamentId, rewardWalletEvm) => {
    if (!token) return { ok: false, error: 'not authenticated' };
    const res = await fetch(`/api/tournaments/${tournamentId}/reward-wallet`, {
      method: 'POST',
      headers: { 'x-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reward_wallet_evm: rewardWalletEvm }),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    await refresh();
    return { ok: res.ok, ...(data || {}) };
  }, [token, refresh]);

  const leave = useCallback(async (tournamentId) => {
    if (!token) return false;
    const res = await fetch(`/api/tournaments/${tournamentId}/leave`, {
      method: 'POST',
      headers: { 'x-token': token },
    });
    const ok = res.ok;
    await refresh();
    return ok;
  }, [token, refresh]);

  return { me, loading, loaded, error, refresh, join, leave, updateRewardWallet };
}

// Public leaderboard fetcher — separate from the per-player state above
// because anyone can spectate (even pre-login). Polls every 10s while the
// panel is open since users want to see their rank update in near-real-time
// when they trade or battle.
export function useTournamentLeaderboard(tournamentId, { active = false, pollMs = 10000 } = {}) {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const idRef = useRef(tournamentId);
  idRef.current = tournamentId;

  const refresh = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const fetchId = tournamentId;
    try {
      const res = await fetch(`/api/tournaments/${fetchId}/leaderboard?limit=50`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      // Stale-response guard for tournament-id swaps.
      if (idRef.current !== fetchId) return;
      setBoard(data);
    } catch {
      /* keep last-known board on transient failure */
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (!active || !tournamentId) return;
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [active, tournamentId, pollMs, refresh]);

  return { board, loading, refresh };
}

// Past tournaments for the current player's DEX (status='ended' or end_at
// < now). Used by the "History" tab in TournamentPanel so a finished
// tournament's leaderboard doesn't disappear the moment it ends. Returned
// rows include the player's own participation summary, so the panel can
// show "your final rank: $X PnL" without a per-tournament round-trip.
export function useTournamentHistory({ active = false } = {}) {
  const player = usePlayer();
  const token = player?.token;
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const fetchToken = token;
    try {
      const res = await fetch('/api/tournaments/history?limit=20', {
        headers: { 'x-token': fetchToken },
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (tokenRef.current !== fetchToken) return;
      setItems(data.tournaments || []);
    } catch {
      /* keep last-known list on transient failure */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!active || !token) return;
    refresh();
  }, [active, token, refresh]);

  return { items, loading, refresh };
}
