import { memo, useCallback, useRef, useEffect } from 'react';
import { useResources, useSend } from '../hooks/useGodot';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const ITEMS = [
  { key: 'gold', icon: goldIcon, bg: '#3e372b', indicator: '#e6a817' },
  { key: 'wood', icon: woodIcon, bg: '#3e372b', indicator: '#5c4026' },
  { key: 'ore', icon: stoneIcon, bg: '#3e372b', indicator: '#8a8a8a' },
];

const formatNumber = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

function ResourceBar() {
  const resources = useResources();
  const { sendToGodot } = useSend();
  const iconRefs = useRef({});
  const sentRef = useRef(false);

  const handleClick = useCallback((key) => {
    sendToGodot('add_resources', { resource: key });
  }, [sendToGodot]);

  // Send icon positions to Godot so flying icons land correctly
  useEffect(() => {
    if (sentRef.current) return;
    const timer = setTimeout(() => {
      const positions = {};
      for (const key of ['gold', 'wood', 'ore']) {
        const el = iconRefs.current[key];
        if (el) {
          const rect = el.getBoundingClientRect();
          positions[key] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
      }
      if (Object.keys(positions).length === 3) {
        sendToGodot('resource_bar_positions', positions);
        sentRef.current = true;
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [sendToGodot]);

  return (
    <div style={styles.bar}>
      {ITEMS.map(({ key, icon, bg, indicator }) => (
        <div key={key} style={styles.container}>
          <div style={{ ...styles.pill, background: bg }}>
            <div style={{ ...styles.indicator, background: indicator }} />
            <span style={styles.value}>{formatNumber(resources[key])}</span>
            <button
              style={styles.hiddenButton}
              onClick={() => handleClick(key)}
              title={`Add ${key}`}
            />
          </div>
          <img ref={el => iconRefs.current[key] = el} src={icon} alt={key} style={styles.icon} />
        </div>
      ))}
    </div>
  );
}

export default memo(ResourceBar);

const styles = {
  bar: {
    position: 'fixed',
    top: 16,
    right: 20,
    display: 'flex',
    gap: 16,
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
    padding: '0 20px 0 50px',
    height: 32,
    border: '2px solid #1a1a1a',
    boxShadow: '0 3px 5px rgba(0,0,0,0.5), inset 0 2px 2px rgba(255,255,255,0.06)',
    minWidth: 120,
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 35,
    opacity: 1,
    borderRight: '1.5px solid #1a1a1a',
  },
  icon: {
    position: 'absolute',
    left: -12,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 56,
    height: 56,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.6))',
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
