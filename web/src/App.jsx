import GodotCanvas from './components/GodotCanvas';
import GameUI from './components/GameUI';
import { GodotProvider } from './hooks/useGodot';
import './index.css';

export default function App() {
  return (
    <GodotProvider>
      <div style={styles.container}>
        <GodotCanvas />
        <GameUI />
      </div>
    </GodotProvider>
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
