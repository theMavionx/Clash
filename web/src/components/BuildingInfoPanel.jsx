import { colors, cartoonPanel, cartoonBtn } from '../styles/theme';

export default function BuildingInfoPanel({ building, sendToGodot, onOpenTroops }) {
  if (!building || building.is_barracks) return null;

  const ratio = building.max_hp > 0 ? building.hp / building.max_hp : 1;
  const isMaxLevel = building.level >= building.max_level;
  const barColor = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';

  return (
    <div style={styles.wrap}>
      <div style={styles.panel}>
        <button style={styles.closeBtn} onClick={() => sendToGodot('deselect_building')}>✕</button>

        <div style={styles.title}>{building.name} (Lv. {building.level})</div>

        <div style={styles.barBg}>
          <div style={{ ...styles.barFill, width: `${ratio * 100}%`, background: barColor }} />
        </div>
        <div style={styles.hpText}>❤️ {building.hp} / {building.max_hp}</div>

        {!building.is_enemy && (
          isMaxLevel ? (
            <div style={styles.maxLevel}>⭐ MAX LEVEL</div>
          ) : (
            <>
              <div style={styles.cost}>
                {Object.entries(building.upgrade_cost || {}).map(([res, amount]) => (
                  <span key={res} style={{ color: colors[res] || '#fff', fontWeight: 700 }}>
                    {res === 'gold' ? '💰' : res === 'wood' ? '🪵' : '💎'} {amount}
                  </span>
                ))}
              </div>
              <button
                style={cartoonBtn('#43A047', '#2E7D32')}
                onClick={() => sendToGodot('upgrade_building')}
              >
                ⬆️ Upgrade
              </button>
            </>
          )
        )}

        {building.id === 'barn' && !building.is_enemy && (
          <button
            style={{ ...cartoonBtn('#7B1FA2', '#4A148C'), marginTop: 8 }}
            onClick={onOpenTroops}
          >
            ⚔️ Troops
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'fixed',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    pointerEvents: 'all',
    zIndex: 10,
  },
  panel: {
    ...cartoonPanel,
    minWidth: 260,
    position: 'relative',
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    background: '#C62828',
    border: '2px solid #E53935',
    color: '#fff',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 2px 0 #8E0000',
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
    color: colors.gold,
    textShadow: '0 2px 0 rgba(0,0,0,0.4)',
    marginBottom: 10,
  },
  barBg: {
    height: 14,
    borderRadius: 7,
    background: '#1a1a1a',
    border: '2px solid #444',
    overflow: 'hidden',
    marginBottom: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
    transition: 'width 0.3s',
    boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)',
  },
  hpText: {
    fontSize: 13,
    color: '#BCAAA4',
    fontWeight: 700,
    marginBottom: 10,
  },
  cost: {
    display: 'flex',
    justifyContent: 'center',
    gap: 14,
    fontSize: 14,
    marginBottom: 10,
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
  maxLevel: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: 900,
    textShadow: '0 2px 0 rgba(0,0,0,0.3)',
  },
};
