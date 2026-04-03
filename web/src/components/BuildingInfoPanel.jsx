import { memo, useCallback } from 'react';
import { useSend, useBuilding } from '../hooks/useGodot';
import { colors } from '../styles/theme';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const ICONS = { gold: goldIcon, wood: woodIcon, ore: stoneIcon };

function BuildingInfoPanel({ onOpenTroops }) {
  const { sendToGodot } = useSend();
  const { selectedBuilding: building } = useBuilding();

  const handleDeselect = useCallback(() => sendToGodot('deselect_building'), [sendToGodot]);
  const handleUpgrade = useCallback(() => sendToGodot('upgrade_building'), [sendToGodot]);
  const handleBuyShip = useCallback(() => sendToGodot('buy_ship'), [sendToGodot]);

  if (!building || building.is_barracks) return null;

  const ratio = building.max_hp > 0 ? building.hp / building.max_hp : 1;
  const isMaxLevel = building.level >= building.max_level;
  const barColor = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';

  return (
    <div style={styles.wrap}>
      <div style={styles.panel}>
        <button 
          style={styles.closeBtn} 
          onClick={handleDeselect}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.1)'}
        >✕</button>

        <div style={styles.title}>{building.name} <span style={{color:'#8e7b54'}}>(Lv. {building.level})</span></div>

        <div style={styles.barBg}>
          <div style={{ ...styles.barFill, width: `${ratio * 100}%`, background: barColor }} />
        </div>
        <div style={styles.hpText}>❤️ {building.hp} / {building.max_hp}</div>

        {!building.is_enemy && (
          building.level >= building.max_level ? null : (
            <>
              <h3 style={styles.sectionTitle}>Upgrade Resources</h3>
              <div style={styles.costsContainer}>
                {Object.entries(building.upgrade_cost || {}).map(([res, amount]) => (
                  <div key={res} style={styles.costItem}>
                    <img src={ICONS[res]} alt={res} style={styles.costIcon} />
                    <span style={styles.costAmount}>
                      {amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )
        )}

        {/* --- ACTIONS ROW --- */}
        <div style={styles.actionRow}>
          {!building.is_enemy && building.level < building.max_level && (
            <button
              style={styles.upgradeBtn}
              onClick={handleUpgrade}
              onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseOut={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
              onMouseDown={e => e.currentTarget.style.transform = 'translateY(4px)'}
              onMouseUp={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              UPGRADE
            </button>
          )}

          {building.id === 'barn' && !building.is_enemy && (
            <button
              style={styles.troopsBtn}
              onClick={onOpenTroops}
              onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseOut={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
              onMouseDown={e => e.currentTarget.style.transform = 'translateY(4px)'}
              onMouseUp={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              TROOPS
            </button>
          )}

          {building.id === 'port' && !building.is_enemy && !building.has_ship && (
            <button
              style={styles.troopsBtn}
              onClick={handleBuyShip}
              onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseOut={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
              onMouseDown={e => e.currentTarget.style.transform = 'translateY(4px)'}
              onMouseUp={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              BUY SHIP
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(BuildingInfoPanel);

const styles = {
  wrap: {
    position: 'fixed',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    pointerEvents: 'all',
    zIndex: 10,
    width: '90%',
    maxWidth: 240,
  },
  panel: {
    background: '#e8dfc8',
    border: '4px solid #bba882',
    borderRadius: 14,
    boxShadow: '0 12px 24px rgba(0,0,0,0.6), inset 0 2px 6px rgba(255,255,255,0.8)',
    padding: '16px 12px 14px',
    position: 'relative',
    textAlign: 'center',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  closeBtn: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#E53935',
    border: '3px solid #fdf8e7',
    color: '#fff',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
    zIndex: 20,
    transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)',
    outline: 'none',
  },
  title: {
    fontSize: 15,
    fontWeight: 900,
    color: '#5C3A21',
    textShadow: '0 1px 1px rgba(255,255,255,0.7)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  barBg: {
    height: 12,
    borderRadius: 6,
    background: '#bba882',
    border: '2px solid #a3906a',
    backgroundColor: '#d4c8b0',
    overflow: 'hidden',
    marginBottom: 4,
    position: 'relative',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: 'inset 0 2px 2px rgba(255,255,255,0.4), inset 0 -2px 2px rgba(0,0,0,0.2)',
  },
  hpText: {
    fontSize: 12,
    color: '#5C3A21',
    fontWeight: 900,
    marginBottom: 10,
    textShadow: '0 1px 1px #fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sectionTitle: {
    color: '#a3906a',
    fontSize: 11,
    fontWeight: 900,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    borderBottom: '2px solid rgba(163, 144, 106, 0.3)',
    paddingBottom: 4,
  },
  costsContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    margin: '8px 0 10px',
  },
  costItem: {
    background: '#fdf8e7',
    border: '2px solid #bba882',
    borderRadius: 10,
    width: 48,
    height: 48,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    boxShadow: '0 4px 6px rgba(0,0,0,0.1), inset 0 2px 2px #fff',
  },
  costIcon: {
    width: 20,
    height: 20,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.2))',
  },
  costAmount: {
    fontSize: 11,
    fontWeight: 900,
    color: '#5C3A21',
  },
  upgradeBtn: {
    flex: 1,
    background: '#4CAF50',
    border: '3px solid #fdf8e7',
    borderRadius: 10,
    padding: '8px 10px',
    color: '#fff',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    boxShadow: '0 4px 0 #2E7D32, 0 4px 8px rgba(0,0,0,0.2)',
    textShadow: '0 2px 2px rgba(0,0,0,0.3)',
    transition: 'transform 0.1s, filter 0.1s',
    outline: 'none',
  },
  troopsBtn: {
    flex: 1,
    background: '#2196F3',
    border: '3px solid #fdf8e7',
    borderRadius: 10,
    padding: '8px 10px',
    color: '#fff',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    boxShadow: '0 4px 0 #1565C0, 0 4px 8px rgba(0,0,0,0.2)',
    textShadow: '0 2px 2px rgba(0,0,0,0.3)',
    transition: 'transform 0.1s, filter 0.1s',
    outline: 'none',
  },
  actionRow: {
    display: 'flex',
    gap: 8,
    marginTop: 6,
  },
};
