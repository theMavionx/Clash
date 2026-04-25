import { useEffect, useState, lazy, Suspense } from 'react';
import { GodotProvider } from './hooks/useGodot';
import WalletProvider from './components/WalletProvider';
import PrivyAuthProvider from './components/PrivyAuthProvider';
import { DexProvider } from './contexts/DexContext';
import { FuturesModeProvider } from './contexts/FuturesModeContext';
import { EvmWalletProvider } from './contexts/EvmWalletContext';
import { useFarcaster } from './hooks/useFarcaster';
import { usePreloadPanelAssets } from './hooks/usePreloadPanelAssets';
// Loading splash assets — served directly from `web/public/` so art can be
// swapped without rebuilding the bundle. We layer background + logo
// separately so the logo can be hidden on narrow (phone-portrait) screens
// while the background still fills the viewport — otherwise a
// single-composed image either letterboxes or crops the logo.
const splashBg = '/splash-bg.png';
const splashLogo = '/splash-logo.png';
import './index.css';

// Lazy load heavy components — only after Farcaster SDK is ready
const GodotCanvas = lazy(() => import('./components/GodotCanvas'));
const GameUI = lazy(() => import('./components/GameUI'));

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

function AppInner() {
  // Warm up the browser's image cache with every BuildingInfoPanel thumbnail
  // while the player is still on the loading screen — otherwise the first
  // building click cold-fetches ~1.7 MB of PNGs and freezes for ~1-2 seconds.
  usePreloadPanelAssets();
  return (
    <FarcasterGate>
      <Suspense fallback={<SplashScreen label="Loading game..." />}>
        <div style={styles.container}>
          <GodotCanvas />
          <GameUI />
        </div>
      </Suspense>
    </FarcasterGate>
  );
}

export default function App() {
  return (
    <DexProvider>
      <PrivyAuthProvider>
        <EvmWalletProvider>
          <WalletProvider>
            <GodotProvider>
              {/* FuturesModeProvider sits inside GodotProvider so it can read
                  the player's `futures_mode` from the player state context. */}
              <FuturesModeProvider>
                <AppInner />
              </FuturesModeProvider>
            </GodotProvider>
          </WalletProvider>
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
};
