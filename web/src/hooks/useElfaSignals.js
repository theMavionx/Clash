import { useState, useEffect, useRef } from 'react';
import { usePlayer } from './useGodot';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';

// Polls /elfa/signals every 15 min. Server caches 1h so most hits are free.
export function useElfaSignals() {
  const [signals, setSignals] = useState({});
  const stopped = useRef(false);
  const player = usePlayer();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);

  useEffect(() => {
    stopped.current = false;
    const load = async () => {
      if (!token) return;
      try {
        const r = await fetch(`${GAME_API}/elfa/signals`, { headers: { 'x-token': token } });
        if (!r.ok) return;
        const j = await r.json();
        if (!stopped.current && j && j.signals) setSignals(j.signals);
      } catch {}
    };
    load();
    const iv = setInterval(load, 15 * 60 * 1000);
    return () => { stopped.current = true; clearInterval(iv); };
  }, [token]);

  return signals;
}
