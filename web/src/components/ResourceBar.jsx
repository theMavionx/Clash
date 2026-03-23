import { colors } from '../styles/theme';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const ITEMS = [
  { key: 'gold', icon: goldIcon, bg: '#3e372b', indicator: '#e6a817' },
  { key: 'wood', icon: woodIcon, bg: '#3e372b', indicator: '#5c4026' },
  { key: 'ore', icon: stoneIcon, bg: '#3e372b', indicator: '#8a8a8a' },
];

export default function ResourceBar({ resources, sendToGodot }) {
  return (
    <div style={styles.bar}>
      {ITEMS.map(({ key, icon, bg, indicator }) => {
        return (
          <div key={key} style={styles.container}>
            {/* Main Bar Background */}
            <div style={{ 
              ...styles.pill, 
              background: bg,
            }}>
              {/* Indicator block behind icon */}
              <div style={{ ...styles.indicator, background: indicator }} />
              
              {/* Resource Value */}
              <span style={styles.value}>
                {(resources[key] || 0).toLocaleString().replace(/,/g, ' ')}
              </span>

              {/* Hidden Add Button (accessible via click on the bar) */}
              <button
                style={styles.hiddenButton}
                onClick={() => sendToGodot('add_resources', { resource: key })}
                title={`Add ${key}`}
              />
            </div>

            {/* Overlapping Icon */}
            <img src={icon} alt={key} style={styles.icon} />
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  bar: {
    position: 'fixed',
    top: 16,
    right: 20,
    display: 'flex',
    gap: 16, // Space between resources
    pointerEvents: 'all',
    zIndex: 10,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: 48,
  },
  pill: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px 0 50px', // Normal padding
    height: 32, // Adjusted thickness
    border: '2px solid #1a1a1a', 
    boxShadow: '0 3px 5px rgba(0,0,0,0.5), inset 0 2px 2px rgba(255,255,255,0.06)',
    minWidth: 120, 
    borderRadius: 16, // Fully rounded for separated pills
    position: 'relative',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 35, // Wider accent block
    opacity: 1, // Solid color
    borderRight: '1.5px solid #1a1a1a', 
  },
  icon: {
    position: 'absolute',
    left: -12, // Sticks out to the left
    top: '50%',
    transform: 'translateY(-50%)',
    width: 56, // Sized cleanly
    height: 56,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.6))', // Stronger shadow so it pops above the gap
    pointerEvents: 'none',
    zIndex: 4,
  },
  value: {
    fontSize: 18, 
    fontWeight: 900,
    color: '#fff',
    WebkitTextStroke: '1px #111', 
    textShadow: '0 2px 1px rgba(0,0,0,1)', 
    letterSpacing: '0.5px',
    zIndex: 2,
    width: '100%',
    textAlign: 'center',
  },
  hiddenButton: {
    position: 'absolute',
    inset: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    zIndex: 3,
  },
};
