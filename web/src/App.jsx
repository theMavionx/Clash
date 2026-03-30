import GodotCanvas from './components/GodotCanvas';
import GameUI from './components/GameUI';
import { GodotProvider } from './hooks/useGodot';
import WalletProvider from './components/WalletProvider';
import './index.css';

export default function App() {
  return (
    <WalletProvider>
      <GodotProvider>
        <div style={styles.container}>
          <GodotCanvas />
          <GameUI />
        </div>
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
