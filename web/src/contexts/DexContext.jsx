import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import pacificaLogo from '../assets/pacifica.png';
import avantisLogo from '../assets/avantis.svg';
// Decibel uses the project favicon (yellow square with the brand mark) as its
// official logo. Served from /public so we reference it as a root URL string.
const decibelLogo = '/favicon.png';
import { usePlayer } from '../hooks/useGodot';
import { isFarcasterFrame } from '../hooks/useFarcaster';
import { isSolanaMobileSync, useSolanaMobile } from '../hooks/useSolanaMobile';
import { writeLastPlayerDexPreference } from '../lib/lastPlayerDex';

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
    color: '#FFE600',
    colorDark: '#B8860B',
    colorLight: 'rgba(255,230,0,0.15)',
    borderColor: '#DAA520',
    chain: 'Aptos',
    chainShort: 'APT',
    description: 'Perps on Aptos',
  },
  gmx: {
    id: 'gmx',
    label: 'GMX',
    shortLabel: 'GMX',
    emoji: '🟣',
    // Served from /public so we reference it as a root URL string. Phase 1
    // ships a placeholder — replace web/public/gmx.png with the official
    // GMX brand asset (purple G mark) when adding the integration to prod.
    logo: '/gmx.png',
    logoIsWordmark: false,
    color: '#4F46E5',
    colorDark: '#3730A3',
    colorLight: 'rgba(79,70,229,0.15)',
    borderColor: '#4338CA',
    chain: 'Arbitrum',
    chainShort: 'ARB',
    description: 'Perps on Arbitrum',
  },
  monad: {
    id: 'monad',
    label: 'PERPL',
    shortLabel: 'PRP',
    emoji: '⚡',
    // Perpl's official mark — 3-bar pixel glyph in their brand purple
    // (#6F5CFF), pulled directly from app.perpl.xyz. Stored as an SVG so
    // it scales cleanly at every badge size; same convention as
    // avantis.svg (icon-only, wordmark rendered as inline text).
    logo: '/perpl.svg',
    logoIsWordmark: false,
    color: '#6F5CFF',
    colorDark: '#4530E0',
    colorLight: 'rgba(111,92,255,0.15)',
    borderColor: '#5547E5',
    chain: 'Monad',
    chainShort: 'MON',
    description: 'Perps on Monad',
  },
  phoenix: {
    id: 'phoenix',
    label: 'PHOENIX',
    shortLabel: 'PHX',
    emoji: 'PHX',
    logo: '/phoenix-mark-orange.svg',
    logoIsWordmark: false,
    color: '#F97316',
    colorDark: '#C2410C',
    colorLight: 'rgba(249,115,22,0.15)',
    borderColor: '#EA580C',
    chain: 'Solana',
    chainShort: 'SOL',
    description: 'Phoenix perps on Solana',
  },
  hyperliquid: {
    id: 'hyperliquid',
    label: 'HYPERLIQUID',
    shortLabel: 'HL',
    emoji: 'HL',
    logo: '/hyperliquid.svg',
    logoIsWordmark: false,
    color: '#22C55E',
    colorDark: '#047857',
    colorLight: 'rgba(34,197,94,0.15)',
    borderColor: '#059669',
    chain: 'Hyperliquid',
    chainShort: 'HL',
    description: 'Perps on Hyperliquid',
  },
  risex: {
    id: 'risex',
    label: 'RISEx',
    shortLabel: 'RSX',
    emoji: 'RX',
    logo: '/risex.svg',
    logoIsWordmark: false,
    // Brand mint #04DF83 from the official RISEx icon; dark tone is the
    // same hue shifted down so it stays readable on light parchment
    // backgrounds in the "Powered by RISEx" footer.
    color: '#04DF83',
    colorDark: '#047857',
    colorLight: 'rgba(4,223,131,0.15)',
    borderColor: '#04DF83',
    chain: 'RISE',
    chainShort: 'RISE',
    description: 'Perps on RISE',
  },
  nado: {
    id: 'nado',
    label: 'NADO',
    shortLabel: 'NDO',
    emoji: 'ND',
    logo: '/nado.png',
    logoIsWordmark: false,
    color: '#00B8D9',
    colorDark: '#075985',
    colorLight: 'rgba(0,184,217,0.15)',
    borderColor: '#0891B2',
    chain: 'Ink',
    chainShort: 'INK',
    description: 'Perps on Ink',
  },
  hibachi: {
    id: 'hibachi',
    label: 'HIBACHI',
    shortLabel: 'HBC',
    emoji: 'HB',
    logo: '/hibachi.png',
    logoIsWordmark: false,
    color: '#EF4444',
    colorDark: '#991B1B',
    colorLight: 'rgba(239,68,68,0.15)',
    borderColor: '#DC2626',
    chain: 'Arc',
    chainShort: 'ARC',
    description: 'Perps on Arc',
  },
  hotstuff: {
    id: 'hotstuff',
    label: 'HOTSTUFF',
    shortLabel: 'HOT',
    emoji: 'HOT',
    logo: '/hotstuff.svg',
    logoIsWordmark: false,
    color: '#EF4444',
    colorDark: '#991B1B',
    colorLight: 'rgba(239,68,68,0.15)',
    borderColor: '#DC2626',
    chain: 'Hotstuff L1',
    chainShort: 'HOT',
    description: 'Perps on Hotstuff L1 mainnet',
  },
  grvt: {
    id: 'grvt',
    label: 'GRVT',
    shortLabel: 'GRVT',
    emoji: 'GRVT',
    logo: '/grvt.png',
    logoIsWordmark: false,
    color: '#111827',
    colorDark: '#111827',
    colorLight: 'rgba(17,24,39,0.12)',
    borderColor: '#374151',
    chain: 'GRVT Exchange',
    chainShort: 'GRVT',
    description: 'Perps on GRVT Exchange',
  },
  katana: {
    id: 'katana',
    label: 'KATANA',
    shortLabel: 'KTN',
    emoji: 'KTN',
    logo: '/katana-perps.svg',
    logoIsWordmark: false,
    color: '#D92D20',
    colorDark: '#991B1B',
    colorLight: 'rgba(217,45,32,0.15)',
    borderColor: '#B42318',
    chain: 'Katana',
    chainShort: 'KTN',
    description: 'Perps on Katana',
  },
  gmtrade: {
    id: 'gmtrade',
    label: 'GMTRADE',
    shortLabel: 'GMT',
    emoji: 'GMT',
    logo: '/gmtrade.svg',
    logoIsWordmark: false,
    color: '#14B8A6',
    colorDark: '#0F766E',
    colorLight: 'rgba(20,184,166,0.15)',
    borderColor: '#0D9488',
    chain: 'Solana',
    chainShort: 'SOL',
    description: 'GMX-style perps on Solana',
  },
  flash: {
    id: 'flash',
    label: 'FLASH',
    shortLabel: 'FLS',
    emoji: 'FLS',
    logo: '/flash-trade.png',
    logoIsWordmark: false,
    color: '#FACC15',
    colorDark: '#A16207',
    colorLight: 'rgba(250,204,21,0.16)',
    borderColor: '#EAB308',
    chain: 'Solana',
    chainShort: 'SOL',
    description: 'Flash Trade perps on Solana',
  },
  lighter: {
    id: 'lighter',
    label: 'LIGHTER',
    shortLabel: 'LTR',
    emoji: 'LTR',
    logo: '/lighter.svg',
    logoIsWordmark: false,
    color: '#111827',
    colorDark: '#111827',
    colorLight: 'rgba(17,24,39,0.12)',
    borderColor: '#374151',
    chain: 'Lighter',
    chainShort: 'LTR',
    description: 'Perps on Lighter',
  },
};

export const DEX_ORDER = [
  'lighter',
  'flash',
  'gmtrade',
  'katana',
  'grvt',
  'hotstuff',
  'phoenix',
  'hyperliquid',
  'risex',
  'nado',
  'hibachi',
  'decibel',
  'pacifica',
  'avantis',
  'gmx',
  'monad',
];

export function isDexAvailableInContext(dexId, { isInFrame = false, isSolanaMobile = false } = {}) {
  if (!DEX_CONFIG[dexId]) return false;
  // Solana Saga / Seeker: show only Solana-native venues. The phone's Seed
  // Vault holds a Solana keypair, and Mobile Wallet Adapter is Solana-native.
  // Base/Arbitrum/Aptos/Monad signing would either dead-end or fall through
  // to a non-native wallet flow.
  if (isSolanaMobile && dexId !== 'pacifica' && dexId !== 'phoenix' && dexId !== 'gmtrade' && dexId !== 'flash') return false;
  // Farcaster mini apps expose Solana and, on some clients, EVM providers.
  // Aptos wallet-standard providers such as Petra are not available there, so
  // Decibel would leave users stuck on an impossible connect step.
  if (isInFrame && dexId === 'decibel') return false;
  // GMX (Arbitrum) inside Farcaster frames: the modern @farcaster/miniapp-sdk
  // exposes a generic EIP-1193 provider via `wallet.getEthereumProvider()`
  // that forwards `wallet_switchEthereumChain` to the host wallet (Warpcast,
  // Base App, etc.). Warpcast supports arbitrary EVM chains including
  // Arbitrum; Base App historically restricts to Base. We let the picker
  // show GMX in all FC contexts now — if the host wallet rejects the chain
  // switch, ensureArbitrumChain() in gmxConfig surfaces the error inline at
  // trade time rather than silently hiding the entire DEX. Better UX than
  // "GMX exists but you can't see it" for the 90% of FC users on Warpcast.
  return true;
}

export function getAvailableDexConfigs({ isInFrame = false, isSolanaMobile = false } = {}) {
  const ordered = DEX_ORDER
    .map(id => DEX_CONFIG[id])
    .filter(Boolean);
  const rest = Object.values(DEX_CONFIG).filter(cfg => !DEX_ORDER.includes(cfg.id));
  return [...ordered, ...rest].filter(cfg => (
    isDexAvailableInContext(cfg.id, { isInFrame, isSolanaMobile })
  ));
}

export function DexProvider({ children }) {
  // On Saga/Seeker the synchronous detection cache is populated on first
  // useSolanaMobile() call (or the App.jsx boot sequence). We use it here
  // so the initial DEX selection from localStorage never lands on a DEX
  // we're going to hide a render later.
  const [dex, setDexState] = useState(
    () => {
      const cached = localStorage.getItem(STORAGE_KEY) || 'pacifica';
      const ctx = { isInFrame: isFarcasterFrame(), isSolanaMobile: isSolanaMobileSync() };
      return isDexAvailableInContext(cached, ctx) ? cached : 'pacifica';
    }
  );
  const { isSolanaMobile, ready: solanaMobileReady } = useSolanaMobile();

  useEffect(() => {
    if (!solanaMobileReady) return;
    const ctx = { isInFrame: isFarcasterFrame(), isSolanaMobile };
    setDexState(prevDex => {
      const nextDex = isDexAvailableInContext(prevDex, ctx) ? prevDex : 'pacifica';
      if (nextDex !== prevDex) localStorage.setItem(STORAGE_KEY, nextDex);
      return nextDex;
    });
  }, [solanaMobileReady, isSolanaMobile]);

  const setDex = useCallback((newDex) => {
    const ctx = { isInFrame: isFarcasterFrame(), isSolanaMobile: isSolanaMobileSync() };
    const nextDex = isDexAvailableInContext(newDex, ctx)
      ? newDex
      : 'pacifica';
    localStorage.setItem(STORAGE_KEY, nextDex);
    setDexState(nextDex);
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
        if (j.dex === 'pacifica' || j.dex === 'avantis' || j.dex === 'decibel' || j.dex === 'gmx' || j.dex === 'monad' || j.dex === 'phoenix' || j.dex === 'hyperliquid' || j.dex === 'risex' || j.dex === 'nado' || j.dex === 'hibachi' || j.dex === 'hotstuff' || j.dex === 'grvt' || j.dex === 'katana' || j.dex === 'gmtrade' || j.dex === 'flash' || j.dex === 'lighter') {
          // Compare against current React state, not localStorage — localStorage
          // was the previous account's setting and we want the authoritative
          // server value for THIS token to win even if it matches what's
          // cached in storage.
          writeLastPlayerDexPreference({ ...player, token }, j.dex);
          setDex(j.dex);
        }
      } catch { /* network error — keep local dex */ }
    })();
    return () => { cancelled = true; };
  }, [player, token, setDex]);

  return (
    <DexContext.Provider value={{ dex, setDex, config: DEX_CONFIG[dex] }}>
      {children}
    </DexContext.Provider>
  );
}

export function DexServerSync() {
  const player = usePlayer();
  const token = player?.token || null;
  const { setDex } = useDex();
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
        if (cancelled) return;
        if (j.dex === 'pacifica' || j.dex === 'avantis' || j.dex === 'decibel' || j.dex === 'gmx' || j.dex === 'monad' || j.dex === 'phoenix' || j.dex === 'hyperliquid' || j.dex === 'risex' || j.dex === 'nado' || j.dex === 'hibachi' || j.dex === 'hotstuff' || j.dex === 'grvt' || j.dex === 'katana' || j.dex === 'gmtrade' || j.dex === 'flash' || j.dex === 'lighter') {
          writeLastPlayerDexPreference({ ...player, token }, j.dex);
          setDex(j.dex);
        }
      } catch { /* network error - keep local dex */ }
    })();
    return () => { cancelled = true; };
  }, [player, token, setDex]);

  return null;
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
