import { useEffect } from 'react';
import GodotCanvas from './components/GodotCanvas';
import GameUI from './components/GameUI';
import { GodotProvider } from './hooks/useGodot';
import WalletProvider from './components/WalletProvider';
import { useFarcaster } from './hooks/useFarcaster';
import './index.css';

function AppInner() {
  const { isInFrame, user } = useFarcaster();

  // Expose Farcaster user to Godot bridge for auto-registration
  useEffect(() => {
    if (isInFrame && user) {
      window._farcasterUser = user;
    }
  }, [isInFrame, user]);

  return (
    <div style={styles.container}>
      <GodotCanvas />
      <GameUI />
    </div>
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
    height: '100vh',
    overflow: 'hidden',
    position: 'relative',
    background: '#0a0b1a',
  },
};
