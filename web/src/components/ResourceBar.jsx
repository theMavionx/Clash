import { memo, useCallback } from 'react';
import { useResources, useSend } from '../hooks/useGodot';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const ITEMS = [
  { key: 'gold', icon: goldIcon, indicator: '#e6a817', offset: { left: -22, top: '48%' } },
  { key: 'wood', icon: woodIcon, indicator: '#5c4026', offset: { left: -14, top: '50%' } },
  { key: 'ore', icon: stoneIcon, indicator: '#8a8a8a', offset: { left: -14, top: '50%' } },
];

const fmtShort = (n) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(0) + 'K';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n || 0);
};

function ResourceBar() {
  const data = useResources();
  const { sendToGodot } = useSend();
  const caps = data.caps || { gold: 5000, wood: 5000, ore: 5000 };

  const handleClick = useCallback((key) => {
    sendToGodot('add_resources', { resource: key });
  }, [sendToGodot]);

  return (
    <div style={styles.bar}>
      {ITEMS.map(({ key, icon, indicator, offset }) => {
        const current = data[key] || 0;
        const max = caps[key] || 5000;
        const pct = Math.min(100, (current / max) * 100);
        const full = current >= max;
        // Color shifts: green → yellow → red as it fills
        const barColor = indicator;

        return (
          <div key={key} style={styles.container}>
            <img
              src={icon}
              alt={key}
              style={{
                ...styles.icon,
                left: offset?.left ?? -10,
                top: offset?.top ?? '50%'
              }}
            />
            <div style={styles.pill}>
              <div style={{
                ...styles.indicator,
                background: barColor,
                width: `${pct}%`,
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -1px 3px rgba(0,0,0,0.3)'
              }} />
              <div style={styles.textWrap}>
                <span style={styles.value}>{fmtShort(current)}</span>
                <span style={styles.maxValue}>/ {fmtShort(max)}</span>
              </div>
              <button
                style={styles.hiddenButton}
                onClick={() => handleClick(key)}
                title={`Add ${key}`}
              />
            </div>
          </div>
        );
      })}
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
    flexDirection: 'row',
    gap: 25,
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
    padding: '0 15px 0 52px',
    height: 32,
    border: '2.5px solid #1a1a1a',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    boxShadow: '0 4px 6px rgba(0,0,0,0.5), inset 0 2px 4px rgba(0,0,0,0.4)',
    minWidth: 170,
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 1,
    borderRight: '1.5px solid #1a1a1a',
    transition: 'width 0.4s ease-out, background 0.3s',
  },
  icon: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 74,
    height: 74,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.6))',
    pointerEvents: 'none',
    zIndex: 4,
  },
  textWrap: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    zIndex: 2,
    width: '100%',
    justifyContent: 'center',
  },
  value: {
    fontSize: 18,
    fontWeight: 900,
    color: '#fff',
    WebkitTextStroke: '1px #111',
    textShadow: '0 2px 1px rgba(0,0,0,1)',
    letterSpacing: '0.5px',
  },
  maxValue: {
    fontSize: 11,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.5)',
    textShadow: '0 1px 1px rgba(0,0,0,0.8)',
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
