import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import pacificaLogo from '../assets/pacifica.png';
import avantisLogo from '../assets/avantis.svg';
import decibelLogo from '../assets/decibel.svg';
import { usePlayer } from '../hooks/useGodot';

const DexContext = createContext(null);

const STORAGE_KEY = 'clash_dex';

export const DEX_CONFIG = {
  pacifica: {
    id: 'pacifica',
    label: 'PACIFICA',
    shortLabel: 'PAC',
    emoji: '🌊',
    logo: pacificaLogo,
    // Pacifica's asset is just the circular icon (pinwheel); the wordmark
    // is rendered as inline text next to it. Avantis ships a full
    // horizontal lockup so we skip the extra text there.
    logoIsWordmark: false,
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
    logo: avantisLogo,
    logoIsWordmark: true,
    color: '#0EA5E9',
    colorDark: '#0369A1',
    colorLight: 'rgba(14,165,233,0.15)',
    borderColor: '#0284C7',
    chain: 'Base',
    chainShort: 'BASE',
    description: 'Perps on Base',
  },
  decibel: {
    id: 'decibel',
    label: 'DECIBEL',
    shortLabel: 'DCB',
    emoji: '🔊',
    logo: decibelLogo,
    // Placeholder mark — pure icon, render the wordmark inline.
    logoIsWordmark: false,
    color: '#0EE8A4',
    colorDark: '#059669',
    colorLight: 'rgba(14,232,164,0.15)',
    borderColor: '#10B981',
    chain: 'Aptos',
    chainShort: 'APT',
    description: 'Perps on Aptos',
  },
};

export function isDexAvailableInContext(dexId, { isInFrame = false } = {}) {
  if (!DEX_CONFIG[dexId]) return false;
  // Farcaster mini apps expose Solana and, on some clients, EVM providers.
  // Aptos wallet-standard providers such as Petra are not available there, so
  // Decibel would leave users stuck on an impossible connect step.
  if (isInFrame && dexId === 'decibel') return false;
  return true;
}

export function getAvailableDexConfigs({ isInFrame = false } = {}) {
  return Object.values(DEX_CONFIG).filter(cfg => (
    isDexAvailableInContext(cfg.id, { isInFrame })
  ));
}

export function DexProvider({ children }) {
  const [dex, setDexState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'pacifica'
  );

  const setDex = useCallback((newDex) => {
    localStorage.setItem(STORAGE_KEY, newDex);
    setDexState(newDex);
  }, []);

  // Sync the server-side dex preference whenever the token changes (first
  // load, and again after account switches). Previously a `synced.current`
  // ref was latched to true after the first successful sync and never reset,
  // so when a user logged out and signed in as a different account, the DEX
  // UI stayed on the previous account's preference — e.g. user A's last DEX
  // was Avantis, user B registered with Pacifica, but the whole futures
  // panel still renders Avantis because localStorage + the never-refreshed
  // context disagree with the server.
  //
  // We only sync the `dex` value here, never the `clash_dex_picked` flag —
  // that flag is owned exclusively by auth/useAuthFlow.js (commitDex /
  // unpickDex / session reset on show_register). Touching it here used to
  // race with useAuthFlow's admin-delete reset.
  const player = usePlayer();
  const token = player?.token || null;
  const lastSyncedToken = useRef(null);
  useEffect(() => {
    if (!token) { lastSyncedToken.current = null; return; }
    if (lastSyncedToken.current === token) return;
    lastSyncedToken.current = token;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/state', { headers: { 'x-token': token } });
        if (cancelled || !r.ok) return;
        const j = await r.json();
        // Re-check cancelled AFTER the JSON parse: another token swap may
        // have happened while the response was still being parsed. Without
        // this a stale /api/state response from account A could land under
        // account B's context and reset the DEX selector to the wrong value.
        if (cancelled) return;
        if (j.dex === 'pacifica' || j.dex === 'avantis' || j.dex === 'decibel') {
          // Compare against current React state, not localStorage — localStorage
          // was the previous account's setting and we want the authoritative
          // server value for THIS token to win even if it matches what's
          // cached in storage.
          setDex(j.dex);
        }
      } catch { /* network error — keep local dex */ }
    })();
    return () => { cancelled = true; };
  }, [token, setDex]);

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

// Shared tint for Avantis (white SVG → brand blue on light backgrounds).
const AVANTIS_BLUE_FILTER = 'brightness(0) saturate(100%) invert(49%) sepia(88%) saturate(1854%) hue-rotate(173deg) brightness(93%) contrast(97%)';

// Standalone DEX logo — no badge chrome, just the official mark. Size tuned
// to sit comfortably inline next to text of the same size.
export function DexBadge({ dexId, size = 'sm' }) {
  const cfg = DEX_CONFIG[dexId];
  if (!cfg) return null;
  const isLg = size === 'lg';
  // Wordmarks are wide, so we cap their height a bit smaller than icon-only
  // logos to keep them in scale with the surrounding UI.
  const logoH = cfg.logoIsWordmark ? (isLg ? 12 : 10) : (isLg ? 16 : 13);

  return (
    <img
      src={cfg.logo}
      alt={cfg.label}
      title={cfg.label}
      style={{
        height: logoH,
        width: 'auto',
        objectFit: 'contain',
        flexShrink: 0,
        userSelect: 'none',
        verticalAlign: 'middle',
        filter: cfg.id === 'avantis' ? AVANTIS_BLUE_FILTER : 'none',
      }}
    />
  );
}

// "Powered by X" footer block — renders the real DEX wordmark inline. Used
// under FuturesPanel / TradeIdeaModal so users know which venue they're
// trading on. Colors handled via CSS filter (SVGs ship as white).
export function PoweredBy({ dexId, inverted = false }) {
  const cfg = DEX_CONFIG[dexId];
  if (!cfg) return null;
  // If inverted=true we're on a light background (need dark logo).
  // Pacifica PNG is already colored; Avantis SVG needs tint.
  const avantisLightFilter = 'brightness(0) saturate(100%) invert(49%) sepia(88%) saturate(1854%) hue-rotate(173deg) brightness(93%) contrast(97%)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 6, fontSize: 10, fontWeight: 900,
      color: inverted ? '#5C3A21' : 'rgba(255,255,255,0.85)',
      letterSpacing: '0.8px', textTransform: 'uppercase',
      textShadow: inverted ? 'none' : '0 1px 0 rgba(0,0,0,0.35)',
      opacity: 0.9,
    }}>
      <span>Powered by</span>
      <img
        src={cfg.logo}
        alt={cfg.label}
        style={{
          height: 16,
          width: 'auto',
          objectFit: 'contain',
          filter: cfg.id === 'avantis'
            ? (inverted ? avantisLightFilter : 'none') // white on dark, tinted on light
            : 'none',
        }}
      />
    </div>
  );
}
