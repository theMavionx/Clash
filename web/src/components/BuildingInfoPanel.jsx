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
  const isUpgrading = building.is_upgrading;

  return (
    <div style={styles.wrap}>
      <style>{`
        @keyframes fillUp { from { width: 0%; } to { width: 100%; } }
      `}</style>
      <div style={styles.panel}>
        <button style={styles.closeBtn} onClick={handleDeselect}>✕</button>

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
              {isUpgrading ? (
                <div style={styles.upgradeProgressWrap}>
                  <div style={styles.upgradeProgressTitle}>Upgrading...</div>
                  <div style={styles.barBgSmall}>
                    <div style={{ ...styles.barFill, background: '#FFC107', animation: 'fillUp 3s linear forwards' }} />
                  </div>
                </div>
              ) : (
                <button
                  style={styles.upgradeBtn}
                  onClick={handleUpgrade}
                >
                  Upgrade
                </button>
              )}
            </>
          )
        )}

        {building.id === 'barn' && !building.is_enemy && (
          <button
            style={{ ...styles.upgradeBtn, background: '#4A148C', boxShadow: '0 8px 20px rgba(74, 20, 140, 0.3), inset 0 2px 0 rgba(255,255,255,0.4)', marginTop: 16 }}
            onClick={onOpenTroops}
          >
            Troops
          </button>
        )}
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
  },
  panel: {
    background: '#0B1121',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    boxShadow: '0 12px 24px rgba(0,0,0,0.8), inset 0 2px 0 rgba(255,255,255,0.05)',
    padding: '20px 16px',
    minWidth: 200,
    position: 'relative',
    textAlign: 'center',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  closeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    background: '#C62828',
    border: '2px solid #E53935',
    color: '#fff',
    fontSize: 11,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 2px 0 #8E0000',
  },
  title: {
    fontSize: 15,
    fontWeight: 900,
    color: colors.gold,
    textShadow: '0 2px 0 rgba(0,0,0,0.4)',
    marginBottom: 8,
  },
  barBg: {
    height: 10,
    borderRadius: 5,
    background: '#1a1a1a',
    border: '2px solid #444',
    overflow: 'hidden',
    marginBottom: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s',
    boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)',
  },
  hpText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: 700,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 8,
  },
  maxLevel: {
    color: '#FFB300',
    fontSize: 14,
    fontWeight: 900,
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    padding: '8px',
    marginTop: 12,
  },
  costsContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    margin: '8px 0 16px',
  },
  costItem: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    width: 60,
    height: 60,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    boxShadow: '0 4px 8px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.02)',
  },
  costIcon: {
    width: 28,
    height: 28,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))',
    marginBottom: 2,
  },
  costAmount: {
    fontSize: 13,
    fontWeight: 900,
    color: '#f8fafc',
    textShadow: '0 2px 2px rgba(0,0,0,0.5)',
  },
  upgradeBtn: {
    background: '#F57F17',
    border: 'none',
    boxShadow: '0 6px 14px rgba(245, 127, 23, 0.3), inset 0 2px 0 rgba(255,255,255,0.4)',
    borderRadius: 14,
    padding: '10px 16px',
    color: '#fff',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.0,
    transition: 'transform 0.1s',
  },
  upgradeProgressWrap: {
    marginTop: 16,
  },
  upgradeProgressTitle: {
    color: '#FFEB3B',
    fontSize: 11,
    fontWeight: 900,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    WebkitTextStroke: '1px #000',
  },
  barBgSmall: {
    height: 8,
    borderRadius: 4,
    background: 'rgba(0,0,0,0.5)',
    overflow: 'hidden',
  }
};
