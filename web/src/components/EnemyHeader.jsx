import { memo } from 'react';
import { useUI } from '../hooks/useGodot';

function EnemyHeader() {
  const { enemyMode } = useUI();

  if (!enemyMode?.active) return null;

  return (
    <div style={styles.container}>
      <div style={styles.badge}>
        <span style={styles.name}>{enemyMode.name}</span>
        {enemyMode.trophies !== undefined && (
          <div style={styles.trophyContainer}>
            <span style={styles.trophyCount}>{enemyMode.trophies}</span>
            <span style={styles.trophyIcon}>🏆</span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
    pointerEvents: 'none',
  },
  badge: {
    background: 'linear-gradient(180deg, #B71C1C 0%, #7F0000 100%)',
    border: '3px solid #1a1a1a',
    borderRadius: 14,
    padding: '8px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0 8px 16px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.2)',
    justifyContent: 'center',
  },
  name: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
  },
  trophyContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'rgba(0,0,0,0.3)',
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
  },
  trophyCount: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 800,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
  },
  trophyIcon: {
    fontSize: 16,
  },
};

export default memo(EnemyHeader);
