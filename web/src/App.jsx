import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { GodotProvider, usePlayer, useUI } from './hooks/useGodot';
import WalletProvider from './components/WalletProvider';
import PrivyAuthProvider from './components/PrivyAuthProvider';
import { DexProvider, DexServerSync, useDex } from './contexts/DexContext';
import { FuturesModeProvider, useFuturesMode } from './contexts/FuturesModeContext';
import { EvmWalletProvider, useEvmWallet } from './contexts/EvmWalletContext';
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';
import { getPreferredAptosApiKey } from './lib/aptosBrowserKeyPool';
import { AptosWalletProvider, useAptosWallet } from './contexts/AptosWalletContext';
import { useFarcaster } from './hooks/useFarcaster';
import { usePreloadPanelAssets } from './hooks/usePreloadPanelAssets';
import { useOptionalPrivy } from './components/PrivyAuthProvider';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
import { addClientBreadcrumb, lazyWithClientReload, setClientLogContext } from './lib/clientLogger';
import {
  applyPendingClientUpdate,
  clearPendingClientUpdate,
  getPendingClientUpdate,
  markClientInteractive,
  scheduleClientUpdateAutoApply,
  setClientActivity,
} from './lib/updateCoordinator';
import { installTradeFetchCache, prefetchDexTradeData } from './lib/tradePrefetch';
import WalletSessionRecovery from './components/WalletSessionRecovery';
// Loading splash assets — served directly from `web/public/` so art can be
// swapped without rebuilding the bundle. We layer background + logo
// separately so the logo can be hidden on narrow (phone-portrait) screens
// while the background still fills the viewport — otherwise a
// single-composed image either letterboxes or crops the logo.
const splashBg = '/splash-bg.png';
const splashLogo = '/splash-logo.png?v=splash-art';
import './index.css';

// Lazy load heavy components — only after Farcaster SDK is ready
const GodotCanvas = lazy(lazyWithClientReload(() => import('./components/GodotCanvas'), 'GodotCanvas'));
const GameUI = lazy(lazyWithClientReload(() => import('./components/GameUI'), 'GameUI'));
const CLASH_SOLANA_MINT = '9mM1Mc4Ta9UJJ32v5qsHef91PiXi7EWyiSsqF5WXpump';
const CLASH_TOKEN_NOTICE_KEY = 'clash_solana_token_notice_v2';
const GAME_AUTH_STORAGE_KEY = 'clash_game_auth_v1';
let localGuestPreflightDone = false;

function makeLocalGuestId() {
  const randomPart = globalThis.crypto?.randomUUID?.()
    ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return `g_${Date.now().toString(36)}_${randomPart}`;
}

function isLocalGuestAuthRecord(raw) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    const wallet = String(parsed?.wallet || '');
    const name = String(parsed?.name || '');
    return wallet.startsWith('local_guest_') || name.startsWith('Guest_');
  } catch {
    return false;
  }
}

function prepareLocalGuestSession() {
  if (localGuestPreflightDone || typeof window === 'undefined') return;
  localGuestPreflightDone = true;
  try {
    const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
    if (!localHosts.has(window.location.hostname)) return;
    const url = new URL(window.location.href);
    const guest = String(url.searchParams.get('guest') || '').toLowerCase();
    if (guest !== '1' && guest !== 'true' && guest !== 'new') {
      const rawAuth = window.localStorage.getItem(GAME_AUTH_STORAGE_KEY);
      if (isLocalGuestAuthRecord(rawAuth)) {
        window.localStorage.removeItem(GAME_AUTH_STORAGE_KEY);
        window._playerToken = null;
      }
      window.localStorage.removeItem('clash.localGuest');
      return;
    }

    let guestId = String(url.searchParams.get('guest_id') || '').trim();
    if (!guestId) {
      guestId = String(window.localStorage.getItem('clash.localGuest') || '').trim();
    }
    if (!guestId) {
      guestId = makeLocalGuestId();
    }
    if (guest !== '1' || url.searchParams.get('guest_id') !== guestId) {
      url.searchParams.set('guest', '1');
      url.searchParams.set('guest_id', guestId);
      window.history.replaceState(null, '', url.toString());
    }

    window.localStorage.removeItem(GAME_AUTH_STORAGE_KEY);
    window.localStorage.setItem('clash.localGuest', guestId);
    window._playerToken = null;
  } catch {
    // Local test helper only; never block normal app boot.
  }
}

function FarcasterGate({ children }) {
  const { isInFrame, user, loading } = useFarcaster();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isInFrame && user) {
      window._farcasterUser = user;
    }
  }, [isInFrame, user]);

  useEffect(() => {
    if (!loading) {
      // Farcaster SDK done (or not in frame) — start game
      setReady(true);
    }
  }, [loading]);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 3500);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <SplashScreen label={isInFrame ? 'Connecting to Farcaster...' : 'Loading...'} />
    );
  }

  return children;
}

// Responsive splash. Background image covers the whole viewport and always
// paints. Logo overlay only appears on wider screens — on phone-portrait
// (< 600 px wide) we hide it so the background isn't cropped around a
// forced-centered logo. Label stays visible everywhere.
function SplashScreen({ label }) {
  return (
    <div style={styles.splash}>
      <img src={splashBg} alt="" style={styles.splashBg} />
      <img src={splashLogo} alt="Clash of Perps" style={styles.splashLogo} className="splash-logo" />
      <div style={styles.splashText}>{label}</div>
      <style>{`
        @media (max-width: 600px), (orientation: portrait) and (max-width: 800px) {
          .splash-logo { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function ClientInteractiveMarker() {
  useEffect(() => {
    markClientInteractive();
  }, []);
  return null;
}

function AppInner() {
  // Warm up the browser's image cache with every BuildingInfoPanel thumbnail
  // while the player is still on the loading screen — otherwise the first
  // building click cold-fetches ~1.7 MB of PNGs and freezes for ~1-2 seconds.
  usePreloadPanelAssets();
  return (
    <FarcasterGate>
      <ChunkErrorBoundary name="AppInner">
        <Suspense fallback={<SplashScreen label="Loading game..." />}>
          <div style={styles.container}>
            <ClientInteractiveMarker />
            <GodotCanvas />
            <GameUI />
            <ClashMigrationNotice />
            <ClientUpdateNotice />
          </div>
        </Suspense>
      </ChunkErrorBoundary>
    </FarcasterGate>
  );
}

function ClashMigrationNotice() {
  const player = usePlayer();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const canShow = !!(ui?.ready && !ui?.showRegister && (player?.token || (typeof window !== 'undefined' ? window._playerToken : null)));

  useEffect(() => {
    if (!canShow) return;
    try {
      setOpen(localStorage.getItem(CLASH_TOKEN_NOTICE_KEY) !== '1');
    } catch {
      setOpen(true);
    }
  }, [canShow]);

  function closeNotice() {
    try { localStorage.setItem(CLASH_TOKEN_NOTICE_KEY, '1'); } catch { /* storage disabled */ }
    setOpen(false);
  }

  async function copyMint() {
    try {
      await navigator.clipboard?.writeText?.(CLASH_SOLANA_MINT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  }

  if (!canShow || !open) return null;

  return (
    <div style={styles.noticeOverlay} role="dialog" aria-modal="true" aria-labelledby="clash-migration-title">
      <div style={styles.noticePanel}>
        <div style={styles.noticeHeader}>
          <div style={styles.noticeBadge} aria-label="CLASH token">
            <img src="/icons/icon-192.png" alt="" style={styles.noticeBadgeImg} />
          </div>
          <button type="button" style={styles.noticeClose} onClick={closeNotice} aria-label="Close">x</button>
        </div>
        <h2 id="clash-migration-title" style={styles.noticeTitle}>$CLASH Token Is Live On Solana</h2>
        <p style={styles.noticeText}>
          The official Clash of Perps token is live as $CLASH on Solana.
        </p>
        <div style={styles.noticeContractBox}>
          <span style={styles.noticeContractLabel}>Token contract</span>
          <div style={styles.noticeContractRow}>
            <button type="button" style={styles.noticeContractValue} onClick={copyMint} title="Copy token contract">
              {CLASH_SOLANA_MINT}
            </button>
            <button type="button" style={styles.noticeCopyBtn} onClick={copyMint} aria-label="Copy token contract">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <button type="button" style={styles.noticeDoneBtn} onClick={closeNotice}>Got it</button>
      </div>
    </div>
  );
}

function ClientUpdateNotice() {
  const [pending, setPending] = useState(() => getPendingClientUpdate());

  useEffect(() => {
    const handleUpdate = (update) => {
      const next = update || getPendingClientUpdate();
      if (scheduleClientUpdateAutoApply(next)) {
        setPending(null);
        return;
      }
      setPending(next);
    };
    const onUpdate = (event) => handleUpdate(event?.detail?.update);
    handleUpdate();
    window.addEventListener('clash:update-available', onUpdate);
    window.addEventListener('storage', onUpdate);
    window.addEventListener('clash:activity', onUpdate);
    return () => {
      window.removeEventListener('clash:update-available', onUpdate);
      window.removeEventListener('storage', onUpdate);
      window.removeEventListener('clash:activity', onUpdate);
    };
  }, []);

  if (!pending) return null;

  const reason = String(pending.reason || '').replace(/_/g, ' ');
  const scope = pending.scope ? String(pending.scope) : 'app';
  const isDeferred = !!(pending.activity?.critical_action || pending.activity?.futures_busy);

  return (
    <div style={styles.updateToast} role="status">
      <div style={styles.updateText}>
        <strong style={styles.updateTitle}>Update ready</strong>
        <span style={styles.updateSub}>
          {isDeferred ? 'Deferred until you refresh.' : `New ${scope} build available.`}
          {reason ? ` ${reason}.` : ''}
        </span>
      </div>
      <button type="button" style={styles.updateRefreshBtn} onClick={applyPendingClientUpdate}>Refresh</button>
      <button
        type="button"
        style={styles.updateDismissBtn}
        onClick={() => {
          clearPendingClientUpdate();
          setPending(null);
        }}
        aria-label="Dismiss update notice"
      >
        x
      </button>
    </div>
  );
}

function ClientLogContextBridge() {
  const { dex } = useDex();
  const { mode } = useFuturesMode();
  const player = usePlayer();
  const solWallet = useSolWallet();
  const evmWallet = useEvmWallet();
  const aptosWallet = useAptosWallet();
  const privy = useOptionalPrivy();
  const prevRef = useRef({});

  const solAddress = solWallet?.publicKey?.toBase58?.() || null;
  const privySolAddress = (privy.solanaWallets || []).find(w => w?.address)?.address || null;
  const isEvmDex = dex === 'avantis' || dex === 'gmx' || dex === 'ostium' || dex === 'monad' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'ondo' || dex === 'hotstuff' || dex === 'grvt';
  const walletAddress = dex === 'decibel'
    ? aptosWallet?.address
    : isEvmDex
      ? evmWallet?.address
      : (solAddress || privySolAddress);
  const walletAdapter = dex === 'decibel'
    ? aptosWallet?.walletName
    : isEvmDex
      ? evmWallet?.source
      : (solWallet?.wallet?.adapter?.name || (privySolAddress ? 'privy_solana' : null));
  const playerId = player?.player_id || player?.id || null;
  const hasPrivySolanaWallet = (privy.solanaWallets || []).some(w => w?.address);

  useEffect(() => {
    setClientLogContext({
      selected_dex: dex,
      futures_mode: mode || null,
      player_id: playerId,
      wallet_adapter: walletAdapter || null,
      wallet_address: walletAddress || null,
      privy_logged_in: !!privy.authenticated,
      has_privy_solana_wallet: hasPrivySolanaWallet,
    });
    setClientActivity({
      selected_dex: dex,
      active_scope: mode === 'futures' ? `futures:${dex}` : 'game',
    });

    const prev = prevRef.current;
    if (prev.dex && prev.dex !== dex) addClientBreadcrumb('dex.changed', { from: prev.dex, to: dex });
    if (prev.mode !== undefined && prev.mode !== mode) addClientBreadcrumb('futures_mode.changed', { from: prev.mode, to: mode || null });
    if (prev.walletAddress !== undefined && prev.walletAddress !== walletAddress) {
      addClientBreadcrumb('wallet.active_changed', {
        dex,
        adapter: walletAdapter || null,
        connected: !!walletAddress,
      });
    }
    prevRef.current = { dex, mode, walletAddress };
  }, [dex, mode, playerId, walletAdapter, walletAddress, privy.authenticated, hasPrivySolanaWallet]);

  return null;
}

function isEvmTradeDex(dex) {
  return dex === 'avantis'
    || dex === 'gmx'
    || dex === 'ostium'
    || dex === 'monad'
    || dex === 'hyperliquid'
    || dex === 'risex'
    || dex === 'nado'
    || dex === 'ondo'
    || dex === 'hibachi'
    || dex === 'hotstuff'
    || dex === 'grvt'
    || dex === 'katana'
    || dex === 'lighter';
}

function TradeDataPrefetchBridge() {
  const { dex } = useDex();
  const player = usePlayer();
  const ui = useUI();
  const solWallet = useSolWallet();
  const evmWallet = useEvmWallet();
  const aptosWallet = useAptosWallet();
  const privy = useOptionalPrivy();

  const solAddress = solWallet?.publicKey?.toBase58?.() || null;
  const privySolAddress = (privy.solanaWallets || []).find(w => w?.address)?.address || null;
  const walletAddress = dex === 'decibel'
    ? aptosWallet?.address
    : isEvmTradeDex(dex)
      ? evmWallet?.address
      : (solAddress || privySolAddress);
  const walletKind = dex === 'decibel'
    ? (aptosWallet?.walletName || null)
    : isEvmTradeDex(dex)
      ? (evmWallet?.source || null)
      : (solWallet?.wallet?.adapter?.name || (privySolAddress ? 'privy_solana' : null));
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null) || null;
  const canPrefetch = !!dex && (ui?.ready || !!token || !!walletAddress);

  useEffect(() => {
    installTradeFetchCache();
  }, []);

  useEffect(() => {
    if (!canPrefetch) return undefined;
    let cancelled = false;
    let idleId = null;
    let bootTimerId = null;

    const runPrefetch = (reason, force = false) => {
      if (cancelled) return;
      prefetchDexTradeData({
        dex,
        token,
        walletAddress,
        walletKind,
        reason,
        force,
      }).catch(() => {
        // Startup prefetch is opportunistic; the trade panel still owns errors.
      });
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(() => runPrefetch('boot'), { timeout: 1500 });
    } else {
      bootTimerId = setTimeout(() => runPrefetch('boot'), 250);
    }

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      runPrefetch('warm-interval');
    }, 30000);

    const onFocus = () => runPrefetch('focus');
    const onVisibility = () => {
      if (document.visibilityState === 'visible') runPrefetch('visible');
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
      if (bootTimerId !== null) clearTimeout(bootTimerId);
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [canPrefetch, dex, token, walletAddress, walletKind]);

  return null;
}

export default function App() {
  prepareLocalGuestSession();

  return (
    <DexProvider>
      <PrivyAuthProvider>
        <EvmWalletProvider>
          {/* Aptos wallet stack for Decibel. The official AIP-62 adapter
              auto-discovers Petra/Pontem/Martian via the wallet standard;
              `dappConfig.aptosApiKeys` injects the Aptos Labs API key for
              authenticated fullnode + Decibel-API access. Our shim
              AptosWalletProvider exposes the same interface useDecibel was
              already calling, so the rest of the app doesn't change. */}
          <AptosWalletAdapterProvider
            autoConnect={true}
            dappConfig={{
              network: Network.MAINNET,
              aptosApiKeys: getPreferredAptosApiKey()
                ? { mainnet: getPreferredAptosApiKey() }
                : undefined,
            }}
            onError={(e) => console.warn('[aptos-adapter]', e?.message || e)}
          >
            <AptosWalletProvider>
              <WalletProvider>
                <GodotProvider>
                  <DexServerSync />
                  {/* FuturesModeProvider sits inside GodotProvider so it can read
                      the player's `futures_mode` from the player state context. */}
                  <FuturesModeProvider>
                    <ClientLogContextBridge />
                    <TradeDataPrefetchBridge />
                    <WalletSessionRecovery />
                    <AppInner />
                  </FuturesModeProvider>
                </GodotProvider>
              </WalletProvider>
            </AptosWalletProvider>
          </AptosWalletAdapterProvider>
        </EvmWalletProvider>
      </PrivyAuthProvider>
    </DexProvider>
  );
}

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    position: 'relative',
    background: '#0a0b1a',
  },
  splash: {
    width: '100vw',
    height: '100vh',
    background: '#0a0b1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  splashBg: {
    position: 'absolute',
    top: 0, left: 0, width: '100%', height: '100%',
    objectFit: 'cover',
    zIndex: 0,
    userSelect: 'none',
    pointerEvents: 'none',
  },
  splashLogo: {
    // Absolute-positioned so the logo sits at the SAME spot across both
    // splash layers (App.jsx FarcasterGate → GodotCanvas overlay). Before,
    // App.jsx centered via flex (`position:relative`) and GodotCanvas used
    // `top:12%` — the logo visibly jumped on hand-off between lazy loads.
    position: 'absolute',
    top: '8%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(95vw, 1100px)',
    height: 'auto',
    zIndex: 1,
    objectFit: 'contain',
    userSelect: 'none',
    pointerEvents: 'none',
    filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.6))',
  },
  splashText: {
    position: 'absolute',
    bottom: '8%',
    color: '#fff',
    fontSize: 20,
    fontWeight: 900,
    zIndex: 2,
    textShadow: '0 2px 8px rgba(0,0,0,0.8)',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  mobilePrompt: {
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '0 30px',
    textAlign: 'center',
  },
  mobileTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 900,
    textShadow: '0 3px 8px rgba(0,0,0,0.8)',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  mobileDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: 600,
    textShadow: '0 2px 4px rgba(0,0,0,0.6)',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    maxWidth: 280,
    lineHeight: 1.4,
  },
  mobileBtn: {
    padding: '16px 48px',
    background: 'linear-gradient(180deg, #ffe066, #e6b800)',
    border: '3px solid #5a3a22',
    borderRadius: 14,
    color: '#2e1c10',
    fontSize: 20,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
    marginTop: 8,
  },
  mobileSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  noticeOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 20000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(6, 8, 18, 0.72)',
    backdropFilter: 'blur(3px)',
    pointerEvents: 'auto',
  },
  noticePanel: {
    width: 430,
    maxWidth: 'calc(100vw - 28px)',
    border: '4px solid #44a9d5',
    background: '#f6e9c7',
    boxShadow: '0 20px 55px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.7)',
    color: '#5C3A21',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  noticeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noticeBadge: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: '#fff8e6',
    border: '2px solid #d7c69e',
    boxShadow: '0 3px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.7)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeBadgeImg: {
    display: 'block',
    width: 30,
    height: 30,
    borderRadius: 6,
    objectFit: 'contain',
    boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
  },
  noticeClose: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    border: '2px solid #fff',
    background: '#E53935',
    color: '#fff',
    fontSize: 18,
    fontWeight: 900,
    lineHeight: 1,
    cursor: 'pointer',
  },
  noticeTitle: {
    margin: 0,
    color: '#287ea7',
    fontSize: 24,
    fontWeight: 1000,
    textTransform: 'uppercase',
    textAlign: 'center',
    textShadow: '0 2px 0 rgba(255,255,255,0.8)',
  },
  noticeText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.45,
    textAlign: 'center',
    color: '#6a5439',
  },
  noticeContractBox: {
    border: '2px solid #c2ae83',
    borderRadius: 10,
    background: '#fff7dc',
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  noticeContractLabel: {
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
    color: '#8a6b43',
  },
  noticeContractRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 8,
  },
  noticeContractValue: {
    width: '100%',
    border: 0,
    background: 'transparent',
    padding: 0,
    textAlign: 'left',
    color: '#1f5f86',
    fontSize: 12,
    fontWeight: 900,
    overflowWrap: 'anywhere',
    cursor: 'copy',
    fontFamily: '"JetBrains Mono", "Consolas", monospace',
  },
  noticeCopyBtn: {
    minHeight: 30,
    padding: '0 12px',
    borderRadius: 8,
    border: '2px solid #b79b63',
    background: '#fffaf0',
    color: '#5C3A21',
    fontSize: 11,
    fontWeight: 1000,
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: '0 2px 0 rgba(92,58,33,0.18)',
    whiteSpace: 'nowrap',
  },
  noticeActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  noticePrimaryBtn: {
    minHeight: 42,
    borderRadius: 12,
    background: 'linear-gradient(180deg,#ffbe24,#ff7d18)',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 1000,
    textTransform: 'uppercase',
    textShadow: '0 2px 2px rgba(0,0,0,0.35)',
    boxShadow: '0 8px 18px rgba(230,112,20,0.25)',
  },
  noticeSecondaryBtn: {
    minHeight: 42,
    borderRadius: 12,
    border: '2px solid #c2ae83',
    background: '#fff8e6',
    color: '#5C3A21',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 1000,
    textTransform: 'uppercase',
  },
  noticeDoneBtn: {
    minHeight: 40,
    borderRadius: 10,
    border: '2px solid #c2ae83',
    background: '#fff8e6',
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 1000,
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  updateToast: {
    position: 'fixed',
    right: 16,
    bottom: 16,
    zIndex: 19000,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    maxWidth: 'calc(100vw - 32px)',
    padding: '10px 12px',
    borderRadius: 10,
    border: '2px solid #44a9d5',
    background: '#fff7dc',
    color: '#5C3A21',
    boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    pointerEvents: 'auto',
  },
  updateText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  updateTitle: {
    fontSize: 13,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  updateSub: {
    fontSize: 11,
    fontWeight: 700,
    color: '#7a6746',
    maxWidth: 260,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  updateRefreshBtn: {
    height: 34,
    padding: '0 14px',
    borderRadius: 8,
    border: '2px solid #c27416',
    background: 'linear-gradient(180deg, #ffbd2e, #ff8414)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    textShadow: '0 1px 0 rgba(0,0,0,0.25)',
    flexShrink: 0,
  },
  updateDismissBtn: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '2px solid #c2ae83',
    background: '#fff',
    color: '#7a5432',
    fontSize: 15,
    fontWeight: 900,
    cursor: 'pointer',
    lineHeight: 1,
    flexShrink: 0,
  },
};
