import { memo } from 'react';
import { useUI } from '../hooks/useGodot';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const fmt = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

function EnemyHeader() {
  const { enemyMode } = useUI();

  if (!enemyMode?.active) return null;

  return (
    <div style={styles.container}>
      {/* Enemy name + trophies */}
      <div style={styles.badge}>
        <span style={styles.name}>{enemyMode.name}</span>
        {enemyMode.trophies !== undefined && (
          <div style={styles.trophyContainer}>
            <span style={styles.trophyCount}>{enemyMode.trophies}</span>
            <span style={styles.trophyIcon}>🏆</span>
          </div>
        )}
      </div>

      {/* Enemy resources — loot preview (30%) */}
      {(enemyMode.gold > 0 || enemyMode.wood > 0 || enemyMode.ore > 0) && (
        <div style={styles.resourceRow}>
          <ResourceChip icon={goldIcon} value={enemyMode.gold} color="#e6a817" />
          <ResourceChip icon={woodIcon} value={enemyMode.wood} color="#5c4026" />
          <ResourceChip icon={stoneIcon} value={enemyMode.ore} color="#8a8a8a" />
        </div>
      )}
    </div>
  );
}

function ResourceChip({ icon, value, color }) {
  return (
    <div style={styles.chip}>
      <img src={icon} alt="" style={styles.chipIcon} />
      <span style={{ ...styles.chipValue, color }}>{fmt(value)}</span>
      <span style={styles.chipLoot}>({fmt(Math.floor(value * 0.3))})</span>
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
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
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
  resourceRow: {
    display: 'flex',
    gap: 8,
    background: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: '6px 14px',
    backdropFilter: 'blur(4px)',
    border: '2px solid rgba(255,255,255,0.1)',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  chipIcon: {
    width: 20,
    height: 20,
    objectFit: 'contain',
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
  },
  chipValue: {
    fontSize: 14,
    fontWeight: 800,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
  },
  chipLoot: {
    fontSize: 11,
    fontWeight: 700,
    color: '#4CAF50',
    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
  },
};

export default memo(EnemyHeader);
