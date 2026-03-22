import { colors, cartoonPanel, cartoonBtn } from '../styles/theme';

export default function ShopPanel({ buildingDefs, sendToGodot, onClose }) {
  const buildings = buildingDefs?.buildings || {};

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>🔨 Build</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.list}>
          {Object.entries(buildings).map(([id, def]) => (
            <button
              key={id}
              style={styles.item}
              onClick={() => sendToGodot('start_placement', { building_id: id })}
            >
              <div style={styles.itemTop}>
                <span style={styles.itemName}>{def.name}</span>
                <span style={styles.itemSize}>{def.cells[0]}×{def.cells[1]}</span>
              </div>
              <div style={styles.costRow}>
                {Object.entries(def.cost || {}).map(([res, amount]) => (
                  amount > 0 && (
                    <span key={res} style={{ ...styles.costItem, color: colors[res] || '#fff' }}>
                      {res === 'gold' ? '💰' : res === 'wood' ? '🪵' : '💎'} {amount}
                    </span>
                  )
                ))}
                {Object.keys(def.cost || {}).length === 0 && (
                  <span style={{ color: colors.green, fontWeight: 700 }}>FREE</span>
                )}
              </div>
            </button>
          ))}
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
    width: 320,
    maxHeight: '70vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottom: '2px solid #6D4C2A',
    paddingBottom: 10,
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
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflowY: 'auto',
  },
  item: {
    padding: '10px 14px',
    borderRadius: 14,
    border: '2px solid #5D4037',
    background: 'linear-gradient(180deg, #4E342E, #3E2723)',
    cursor: 'pointer',
    textAlign: 'left',
    color: '#fff',
    boxShadow: '0 2px 0 #2C1B0E',
    transition: 'transform 0.1s',
  },
  itemTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 800,
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
  itemSize: {
    fontSize: 12,
    color: '#A1887F',
    fontWeight: 700,
  },
  costRow: {
    display: 'flex',
    gap: 12,
  },
  costItem: {
    fontSize: 14,
    fontWeight: 700,
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
};
