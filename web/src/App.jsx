import { useEffect, useState, lazy, Suspense } from 'react';
import { GodotProvider } from './hooks/useGodot';
import WalletProvider from './components/WalletProvider';
import { useFarcaster } from './hooks/useFarcaster';
import loadingImage from './assets/photo_5357292113839723543_y (1) (1) (1).jpg';
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
      <div style={styles.splash}>
        <img src={loadingImage} alt="" style={styles.splashImg} />
        <div style={styles.splashText}>
          {isInFrame ? 'Connecting to Farcaster...' : 'Loading...'}
        </div>
      </div>
    );
  }

  return children;
}

function AppInner() {
  return (
    <FarcasterGate>
      <Suspense fallback={
        <div style={styles.splash}>
          <img src={loadingImage} alt="" style={styles.splashImg} />
          <div style={styles.splashText}>Loading game...</div>
        </div>
      }>
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
    <WalletProvider>
      <GodotProvider>
        <AppInner />
      </GodotProvider>
    </WalletProvider>
  );
}

const styles = {
  container: {
    width: '100vw',
    height: '100dvh',
    overflow: 'hidden',
    position: 'relative',
    background: '#0a0b1a',
  },
  splash: {
    width: '100vw',
    height: '100dvh',
    background: '#0a0b1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  splashImg: {
    position: 'absolute',
    top: 0, left: 0, width: '100%', height: '100%',
    objectFit: 'cover',
    opacity: 0.7,
  },
  splashText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 900,
    zIndex: 1,
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
