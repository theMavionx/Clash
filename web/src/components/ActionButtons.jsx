import { colors, cartoonBtn } from '../styles/theme';

export default function ActionButtons({ enemyMode, sendToGodot }) {
  if (enemyMode.active) {
    return (
      <div style={styles.wrap}>
        <div style={styles.enemyBadge}>
          ⚔️ {enemyMode.name} • {enemyMode.trophies} 🏆
        </div>
        <button
          style={cartoonBtn('#FF8F00', '#E65100')}
          onClick={() => sendToGodot('return_home')}
        >
          🏠 Return Home
        </button>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <button
        style={cartoonBtn('#1565C0', '#0D47A1')}
        onClick={() => sendToGodot('find_enemy')}
      >
        🔍 Find Enemy
      </button>
      <button
        style={cartoonBtn('#C62828', '#8E0000')}
        onClick={() => sendToGodot('attack')}
      >
        ⚔️ Attack
      </button>
      <button
        style={cartoonBtn('#2E7D32', '#1B5E20')}
        onClick={() => sendToGodot('open_shop')}
      >
        🔨 Build
      </button>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'fixed',
    bottom: 16,
    right: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    pointerEvents: 'all',
    zIndex: 10,
  },
  enemyBadge: {
    background: 'linear-gradient(180deg, #B71C1C, #7F0000)',
    border: '3px solid #E53935',
    borderRadius: 16,
    padding: '8px 16px',
    color: '#fff',
    fontSize: 15,
    fontWeight: 800,
    textAlign: 'center',
    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
    boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
  },
};
