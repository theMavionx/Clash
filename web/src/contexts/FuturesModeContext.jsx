// Per-account futures UI mode: 'basic' (simplified) or 'pro' (full feature
// set). The user picks on first entry; the choice is persisted server-side
// so it survives browser/device swaps. NULL means "not chosen yet" —
// FuturesPanel uses that to show the first-time selection screen instead
// of the trading UI.
//
// Source of truth is the server. We hydrate from `usePlayer().futures_mode`
// (which arrives in the `state` message from Godot's bridge), and we POST
// /api/players/futures-mode whenever the user explicitly toggles in the
// profile. Account switches re-hydrate automatically because the value
// flows through the player state object keyed on token.

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { usePlayer } from '../hooks/useGodot';

const FuturesModeContext = createContext(null);

const GAME_API = import.meta.env.VITE_GAME_API || '/api';

export function FuturesModeProvider({ children }) {
  const player = usePlayer();
  const token = player?.token || null;
  const serverMode = player?.futures_mode || null;

  // Local mirror so optimistic updates feel instant. Synced from server on
  // every player.token / player.futures_mode change.
  const [mode, setModeLocal] = useState(serverMode);

  // Sync from server state into local mirror — legitimate external-boundary
  // read (server pushes via player state). ESLint's heuristic flags it but
  // there's no derived-state alternative because we ALSO write locally for
  // optimistic updates that the server may later reject.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setModeLocal(serverMode);
  }, [serverMode, token]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setMode = useCallback(async (newMode) => {
    if (newMode !== 'basic' && newMode !== 'pro') return;
    if (!token) return;
    // Optimistic — flip UI now, reconcile on response.
    setModeLocal(newMode);
    try {
      const r = await fetch(`${GAME_API}/players/futures-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ mode: newMode }),
      });
      if (!r.ok) {
        // Roll back on server error so the UI doesn't lie about persisted state.
        const body = await r.json().catch(() => ({}));
        console.warn('[futures-mode] server rejected:', r.status, body?.error);
        setModeLocal(serverMode);
      }
    } catch (e) {
      console.warn('[futures-mode] network error:', e?.message || e);
      setModeLocal(serverMode);
    }
  }, [token, serverMode]);

  // `isLoaded` is true once we know whether the player has chosen — i.e.
  // we have a player object back from the server. Distinguishes "still
  // loading account" from "loaded, mode is NULL → show first-time screen".
  const isLoaded = !!player?.player_id;

  const value = useMemo(() => ({
    mode,            // 'basic' | 'pro' | null
    setMode,
    isLoaded,
    needsSelection: isLoaded && !mode,
  }), [mode, setMode, isLoaded]);

  return (
    <FuturesModeContext.Provider value={value}>
      {children}
    </FuturesModeContext.Provider>
  );
}

export function useFuturesMode() {
  const ctx = useContext(FuturesModeContext);
  if (!ctx) throw new Error('useFuturesMode must be used within FuturesModeProvider');
  return ctx;
}
