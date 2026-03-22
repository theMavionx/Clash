import { colors } from '../styles/theme';

const ITEMS = [
  { key: 'gold', label: '💰', color: colors.gold, bg: '#4A3800' },
  { key: 'wood', label: '🪵', color: colors.wood, bg: '#1B3A1B' },
  { key: 'ore', label: '💎', color: colors.ore, bg: '#2A1040' },
];

export default function ResourceBar({ resources, sendToGodot }) {
  return (
    <div style={styles.bar}>
      {ITEMS.map(({ key, label, color, bg }) => (
        <div key={key} style={{ ...styles.pill, background: bg, borderColor: color }}>
          <span style={styles.icon}>{label}</span>
          <span style={{ ...styles.value, color }}>
            {(resources[key] || 0).toLocaleString().replace(/,/g, ' ')}
          </span>
          <button
            style={{ ...styles.plus, background: color, borderColor: color }}
            onClick={() => sendToGodot('add_resources', { resource: key })}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >+</button>
        </div>
      ))}
    </div>
  );
}

const styles = {
  bar: {
    position: 'fixed',
    top: 8,
    right: 12,
    display: 'flex',
    gap: 6,
    pointerEvents: 'all',
    zIndex: 10,
  },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px 4px 10px',
    borderRadius: 22,
    border: '2.5px solid',
    boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
  },
  icon: {
    fontSize: 18,
  },
  value: {
    fontSize: 17,
    fontWeight: 900,
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
    minWidth: 50,
    textAlign: 'right',
  },
  plus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    border: '2px solid',
    color: '#fff',
    fontSize: 16,
    fontWeight: 900,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
    boxShadow: '0 2px 0 rgba(0,0,0,0.3)',
    transition: 'transform 0.1s',
  },
};
