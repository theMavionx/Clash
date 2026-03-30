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

  if (!building || building.is_barracks) return null;

  const ratio = building.max_hp > 0 ? building.hp / building.max_hp : 1;
  const isMaxLevel = building.level >= building.max_level;
  const barColor = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#F44336';

  return (
    <div style={styles.wrap}>
      <div style={styles.panel}>
        <button style={styles.closeBtn} onClick={handleDeselect}>✕</button>

        <div style={styles.title}>{building.name} (Lv. {building.level})</div>

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
                      {amount}
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
            >
              Upgrade
            </button>
          )}

          {building.id === 'barn' && !building.is_enemy && (
            <button
              style={styles.troopsBtn}
              onClick={onOpenTroops}
            >
              Troops
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
    maxWidth: 260,
  },
  panel: {
    background: 'linear-gradient(180deg, #101827 0%, #070B14 100%)',
    border: '3px solid #1a1a1a',
    borderRadius: 18,
    boxShadow: '0 10px 20px rgba(0,0,0,0.9), inset 0 1px 2px rgba(255,255,255,0.05)',
    padding: '16px 12px 12px',
    position: 'relative',
    textAlign: 'center',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  closeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'linear-gradient(180deg, #FF5252, #D32F2F)',
    border: '2px solid #fff',
    color: '#fff',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
    zIndex: 20,
    transition: 'transform 0.1s',
  },
  title: {
    fontSize: 14,
    fontWeight: 900,
    color: '#FFD700',
    WebkitTextStroke: '1px #000',
    textShadow: '0 2px 2px rgba(0,0,0,0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  barBg: {
    height: 12,
    borderRadius: 6,
    background: '#0a0a0a',
    border: '1.5px solid #1a1a1a',
    overflow: 'hidden',
    marginBottom: 4,
    position: 'relative',
    boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,1)',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: 'inset 0 2px 2px rgba(255,255,255,0.3), inset 0 -2px 2px rgba(0,0,0,0.2)',
  },
  hpText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: 900,
    marginBottom: 10,
    textShadow: '0 1.5px 2px rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 900,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1.5px solid rgba(255,255,255,0.05)',
    paddingBottom: 4,
  },
  costsContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    margin: '8px 0 12px',
  },
  costItem: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1.5px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    width: 48,
    height: 48,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    boxShadow: '0 4px 8px rgba(0,0,0,0.4), inset 0 2px 2px rgba(255,255,255,0.02)',
  },
  costIcon: {
    width: 20,
    height: 20,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.6))',
  },
  costAmount: {
    fontSize: 10,
    fontWeight: 900,
    color: '#fff',
    textShadow: '0 1.5px 2px rgba(0,0,0,1)',
  },
  upgradeBtn: {
    flex: 1,
    background: 'linear-gradient(180deg, #FB8C00 0%, #E65100 100%)',
    border: '2px solid #FFCC80',
    borderRadius: 12,
    padding: '8px 12px',
    color: '#fff',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    boxShadow: '0 4px 0 #CB6B00, 0 8px 16px rgba(251, 140, 0, 0.3)',
    textShadow: '0 1.5px 2px rgba(0,0,0,0.5)',
    transition: 'transform 0.1s, box-shadow 0.1s',
  },
  troopsBtn: {
    flex: 1,
    background: 'linear-gradient(180deg, #1E88E5 0%, #0D47A1 100%)',
    border: '2px solid #90CAF9',
    borderRadius: 12,
    padding: '8px 12px',
    color: '#fff',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    boxShadow: '0 4px 0 #0D47A1, 0 8px 16px rgba(30, 136, 229, 0.3)',
    textShadow: '0 1.5px 2px rgba(0,0,0,0.5)',
    transition: 'transform 0.1s, box-shadow 0.1s',
  },
  actionRow: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
};
