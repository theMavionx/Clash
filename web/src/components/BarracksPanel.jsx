import { colors, cartoonPanel, cartoonBtn } from '../styles/theme';

export default function BarracksPanel({ building, buildingDefs, troopLevels, sendToGodot, onClose }) {
  if (!building || !building.is_barracks) return null;
  const troops = buildingDefs?.troops || {};

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>⚔️ Barracks</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {!building.is_enemy && building.level < building.max_level && (
          <button
            style={{ ...cartoonBtn('#43A047', '#2E7D32'), width: '100%', marginBottom: 10 }}
            onClick={() => sendToGodot('upgrade_building')}
          >
            ⬆️ Upgrade Barracks
          </button>
        )}

        <div style={styles.sep} />

        <div style={styles.troopList}>
          {Object.entries(troops).map(([name, tdef]) => {
            const lvl = troopLevels[name] || 1;
            const isMax = lvl >= 3;
            const nextCost = !isMax && tdef.costs?.[String(lvl + 1)];

            return (
              <div key={name} style={styles.troopCard}>
                <div style={styles.troopTop}>
                  <span style={styles.troopName}>{tdef.display}</span>
                  <span style={styles.troopLvl}>LVL {lvl}</span>
                </div>
                {building.is_enemy ? null : isMax ? (
                  <span style={styles.maxLvl}>⭐ MAX</span>
                ) : (
                  <div style={styles.troopBottom}>
                    <span style={styles.troopCost}>
                      {nextCost && Object.entries(nextCost).map(([res, amt]) => (
                        amt > 0 && <span key={res} style={{ color: colors[res], marginRight: 8 }}>
                          {res === 'gold' ? '💰' : res === 'wood' ? '🪵' : '💎'} {amt}
                        </span>
                      ))}
                    </span>
                    <button
                      style={cartoonBtn('#1565C0', '#0D47A1')}
                      onClick={() => sendToGodot('upgrade_troop', { troop_name: name })}
                    >
                      ⬆️
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    pointerEvents: 'all',
  },
  panel: {
    ...cartoonPanel,
    width: 340,
    maxHeight: '75vh',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottom: '2px solid #6D4C2A',
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    color: colors.gold,
    textShadow: '0 2px 0 rgba(0,0,0,0.4)',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    background: '#C62828',
    border: '2px solid #E53935',
    color: '#fff',
    fontSize: 16,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 2px 0 #8E0000',
  },
  sep: {
    height: 2,
    background: '#6D4C2A',
    margin: '4px 0 10px',
  },
  troopList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  troopCard: {
    padding: '10px 12px',
    borderRadius: 14,
    background: 'linear-gradient(180deg, #4E342E, #3E2723)',
    border: '2px solid #5D4037',
    boxShadow: '0 2px 0 #2C1B0E',
  },
  troopTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  troopName: {
    fontSize: 14,
    fontWeight: 800,
    color: '#fff',
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
  troopLvl: {
    fontSize: 13,
    fontWeight: 800,
    color: colors.gold,
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
  troopBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  troopCost: {
    fontSize: 13,
    fontWeight: 700,
  },
  maxLvl: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: 900,
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
};
