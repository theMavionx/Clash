import { colors } from '../styles/theme';

export default function PlayerInfo({ playerState }) {
  if (!playerState) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.badge}>
        <div style={styles.avatar}>⚔️</div>
        <div style={styles.info}>
          <span style={styles.name}>{playerState.player_name}</span>
          <span style={styles.trophies}>🏆 {playerState.trophies || 0}</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'fixed',
    top: 8,
    left: 12,
    pointerEvents: 'none',
    zIndex: 10,
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'linear-gradient(180deg, #3E6B35 0%, #2D4F27 100%)',
    border: '3px solid #5A8F4E',
    borderRadius: 28,
    padding: '4px 14px 4px 4px',
    boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: 'linear-gradient(180deg, #4CAF50, #2E7D32)',
    border: '2px solid #81C784',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
  },
  name: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 800,
    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
  },
  trophies: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: 700,
    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
  },
};
