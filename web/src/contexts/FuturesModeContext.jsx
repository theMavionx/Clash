// Per-account futures UI mode: 'basic' (simplified) or 'pro' (full feature
// set). The user picks on first entry; the choice is persisted server-side
// so it survives browser/device swaps. NULL means "not chosen yet" —
// FuturesPanel uses that to show the first-time selection screen instead
// of the trading UI.
//
// Source of truth is the server. We GET /api/players/futures-mode whenever
// the player's token changes (boot, login, account swap) and POST to the
// same endpoint when the user explicitly picks/toggles. We do NOT rely on
// `usePlayer().futures_mode` because Godot's js_bridge never includes that
// field in its `state` message — so the on-load selection screen would
// re-appear after every refresh.

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePlayer } from '../hooks/useGodot';

const FuturesModeContext = createContext(null);

const GAME_API = import.meta.env.VITE_GAME_API || '/api';

export function FuturesModeProvider({ children }) {
  const player = usePlayer();
  const token = player?.token || null;

  const [mode, setModeLocal] = useState(null);
  // `loaded` flips true once the GET completes for the current token. Until
  // then we deliberately suppress `needsSelection` so the first-time picker
  // never flashes for a returning user during the brief window between
  // token arrival and the server's response.
  const [loaded, setLoaded] = useState(false);
  // Token the last fetch was keyed on — guards against stale responses
  // overwriting state after an account switch.
  const fetchTokenRef = useRef(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!token) {
      fetchTokenRef.current = null;
      setModeLocal(null);
      setLoaded(false);
      return;
    }
    fetchTokenRef.current = token;
    setLoaded(false);
    const tokenForFetch = token;
    fetch(`${GAME_API}/players/futures-mode`, { headers: { 'x-token': tokenForFetch } })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(res => {
        if (fetchTokenRef.current !== tokenForFetch) return;
        setModeLocal(res?.mode || null);
        setLoaded(true);
      })
      .catch(e => {
        if (fetchTokenRef.current !== tokenForFetch) return;
        console.warn('[futures-mode] hydrate failed:', e?.message || e);
        setLoaded(true);
      });
  }, [token]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setMode = useCallback(async (newMode) => {
    if (newMode !== 'basic' && newMode !== 'pro') return;
    if (!token) return;
    const prev = mode;
    setModeLocal(newMode);
    try {
      const r = await fetch(`${GAME_API}/players/futures-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ mode: newMode }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        console.warn('[futures-mode] server rejected:', r.status, body?.error);
        setModeLocal(prev);
      }
    } catch (e) {
      console.warn('[futures-mode] network error:', e?.message || e);
      setModeLocal(prev);
    }
  }, [token, mode]);

  // `isLoaded` is true once we both have an account and the GET responded.
  // Distinguishes "still loading" from "loaded, mode is NULL → first-time
  // selection screen".
  const isLoaded = !!player?.player_id && loaded;

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
