import { memo } from 'react';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const fmt = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

function BattleResultOverlay({ result, onClose }) {
  if (!result) return null;

  const isVictory = result.type === 'victory';

  return (
    <div style={S.backdrop}>
      <div style={{ ...S.panel, borderColor: isVictory ? '#FFD700' : '#B71C1C' }}>
        {/* Title */}
        <div style={{ ...S.title, color: isVictory ? '#FFD700' : '#E53935' }}>
          {isVictory ? 'VICTORY' : 'DEFEAT'}
        </div>

        <div style={S.subtitle}>
          {isVictory ? 'Town Hall Destroyed!' : result.reason === 'timeout' ? 'Time Ran Out!' : 'All Troops Lost!'}
        </div>

        {/* Loot (only on victory) */}
        {isVictory && result.loot && (
          <div style={S.lootSection}>
            <div style={S.lootTitle}>Loot Captured (30%)</div>
            <div style={S.lootRow}>
              <LootItem icon={goldIcon} value={result.loot.gold} label="Gold" />
              <LootItem icon={woodIcon} value={result.loot.wood} label="Wood" />
              <LootItem icon={stoneIcon} value={result.loot.ore} label="Ore" />
            </div>
          </div>
        )}

        {/* Defeat message */}
        {!isVictory && (
          <div style={S.defeatMsg}>
            Better luck next time! Upgrade your troops and try again.
          </div>
        )}

        {/* Return button */}
        <button style={{ ...S.btn, background: isVictory ? 'linear-gradient(180deg, #4CAF50 0%, #2E7D32 100%)' : 'linear-gradient(180deg, #B71C1C 0%, #7F0000 100%)' }} onClick={onClose}>
          RETURN HOME
        </button>
      </div>
    </div>
  );
}

function LootItem({ icon, value, label }) {
  if (!value) return null;
  return (
    <div style={S.lootItem}>
      <img src={icon} alt={label} style={S.lootIcon} />
      <div style={S.lootValues}>
        <span style={S.lootAmount}>+{fmt(value)}</span>
        <span style={S.lootLabel}>{label}</span>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'all',
    animation: 'fadeIn 0.3s ease-out',
  },
  panel: {
    background: 'linear-gradient(180deg, #2a2015 0%, #1a140d 100%)',
    border: '4px solid',
    borderRadius: 24,
    padding: '32px 40px',
    textAlign: 'center',
    minWidth: 320,
    maxWidth: 420,
    boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 2px 8px rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 48,
    fontWeight: 900,
    letterSpacing: 4,
    textShadow: '0 4px 12px rgba(0,0,0,0.8)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#a3906a',
    marginTop: 4,
    marginBottom: 20,
  },
  lootSection: {
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: '16px 20px',
    marginBottom: 20,
    border: '2px solid rgba(255,215,0,0.2)',
  },
  lootTitle: {
    fontSize: 12,
    fontWeight: 800,
    color: '#a3906a',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  lootRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 20,
  },
  lootItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  lootIcon: {
    width: 40,
    height: 40,
    objectFit: 'contain',
    filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))',
  },
  lootValues: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  lootAmount: {
    fontSize: 20,
    fontWeight: 900,
    color: '#4CAF50',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
  },
  lootLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#a3906a',
    textTransform: 'uppercase',
  },
  defeatMsg: {
    fontSize: 14,
    color: '#a3906a',
    marginBottom: 20,
    lineHeight: 1.5,
  },
  btn: {
    padding: '14px 36px',
    border: '3px solid rgba(255,255,255,0.2)',
    borderRadius: 14,
    color: '#fff',
    fontSize: 18,
    fontWeight: 900,
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: 1,
    boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
    transition: 'transform 0.1s',
  },
};

export default memo(BattleResultOverlay);
