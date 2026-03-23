import { useState, memo } from 'react';
import { useSend } from '../hooks/useGodot';
import { colors, cartoonPanel, cartoonBtn } from '../styles/theme';

function RegisterPanel() {
  const { sendToGodot } = useSend();
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim().length >= 2) {
      sendToGodot('register', { name: name.trim() });
    }
  };

  return (
    <div style={styles.overlay}>
      <form style={styles.panel} onSubmit={handleSubmit}>
        <div style={styles.icon}>⚔️</div>
        <h2 style={styles.title}>Enter Your Name</h2>
        <input
          style={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Commander name..."
          maxLength={20}
          autoFocus
        />
        <button type="submit" style={cartoonBtn('#43A047', '#2E7D32')}>
          ▶️ PLAY
        </button>
      </form>
    </div>
  );
}

export default memo(RegisterPanel);

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    pointerEvents: 'all',
  },
  panel: {
    ...cartoonPanel,
    width: 320,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    alignItems: 'center',
    padding: 28,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 900,
    color: colors.gold,
    textShadow: '0 2px 0 rgba(0,0,0,0.4)',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 14,
    border: '3px solid #6D4C2A',
    background: '#1a1008',
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center',
    outline: 'none',
  },
};
