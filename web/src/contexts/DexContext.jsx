import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const DexContext = createContext(null);

const STORAGE_KEY = 'clash_dex';

export const DEX_CONFIG = {
  pacifica: {
    id: 'pacifica',
    label: 'PACIFICA',
    shortLabel: 'PAC',
    emoji: '🌊',
    color: '#7C3AED',
    colorDark: '#5B21B6',
    colorLight: 'rgba(124,58,237,0.15)',
    borderColor: '#6D28D9',
    chain: 'Solana',
    chainShort: 'SOL',
    description: 'Perps on Solana',
  },
  avantis: {
    id: 'avantis',
    label: 'AVANTIS',
    shortLabel: 'AVT',
    emoji: '⚡',
    color: '#0EA5E9',
    colorDark: '#0369A1',
    colorLight: 'rgba(14,165,233,0.15)',
    borderColor: '#0284C7',
    chain: 'Base',
    chainShort: 'BASE',
    description: 'Perps on Base',
  },
};

export function DexProvider({ children }) {
  const [dex, setDexState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'pacifica'
  );

  const setDex = useCallback((newDex) => {
    localStorage.setItem(STORAGE_KEY, newDex);
    setDexState(newDex);
  }, []);

  // Once the player's token exists, fetch their server-side dex preference so
  // returning users land on the DEX they registered with (localStorage may be
  // stale after a cache clear or device swap).
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current) return;
    const poll = setInterval(async () => {
      const token = window._playerToken;
      if (!token) return;
      synced.current = true;
      clearInterval(poll);
      try {
        const r = await fetch('/api/state', { headers: { 'x-token': token } });
        if (!r.ok) return;
        const j = await r.json();
        if (j.dex === 'pacifica' || j.dex === 'avantis') {
          if (j.dex !== localStorage.getItem(STORAGE_KEY)) {
            setDex(j.dex);
          }
          // Mark dex as picked so the RegisterPanel picker is skipped.
          try { localStorage.setItem('clash_dex_picked', '1'); } catch {}
        }
      } catch {}
    }, 500);
    return () => clearInterval(poll);
  }, [setDex]);

  return (
    <DexContext.Provider value={{ dex, setDex, config: DEX_CONFIG[dex] }}>
      {children}
    </DexContext.Provider>
  );
}

export function useDex() {
  const ctx = useContext(DexContext);
  if (!ctx) throw new Error('useDex must be used within DexProvider');
  return ctx;
}

// Standalone badge component — usable anywhere
export function DexBadge({ dexId, size = 'sm' }) {
  const cfg = DEX_CONFIG[dexId];
  if (!cfg) return null; // unknown dex — hide badge
  const isLg = size === 'lg';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: isLg ? 5 : 3,
      padding: isLg ? '3px 9px' : '2px 6px',
      borderRadius: isLg ? 8 : 6,
      background: cfg.colorLight,
      border: `1.5px solid ${cfg.borderColor}`,
      fontSize: isLg ? 12 : 10,
      fontWeight: 900,
      color: cfg.color,
      letterSpacing: '0.5px',
      lineHeight: 1,
      textTransform: 'uppercase',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      <span style={{ fontSize: isLg ? 13 : 10 }}>{cfg.emoji}</span>
      {cfg.shortLabel}
    </span>
  );
}
