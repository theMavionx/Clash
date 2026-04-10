import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useSend, useBuilding } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import arbaletImg from '../assets/units/arbalet.png';
import archerImg from '../assets/units/archer.png';
import berserkImg from '../assets/units/berserk.png';

// Module-level CSS — injected once, not re-parsed on every render
const UPGRADE_ANIM_CSS = `
  @keyframes levelUpGlow {
    0% { transform: scale(0.5); opacity: 1; filter: hue-rotate(0deg); }
    50% { transform: scale(1.5); opacity: 0.8; filter: hue-rotate(90deg); }
    100% { transform: scale(2.5); opacity: 0; filter: hue-rotate(180deg); }
  }
  @keyframes levelUpPop {
    0% { transform: scale(1); }
    30% { transform: scale(1.15) translateY(-20px); filter: brightness(1.5); }
    100% { transform: scale(1) translateY(0); filter: brightness(1); }
  }
  @keyframes levelUpText {
    0% { transform: translateY(0) scale(0.5); opacity: 0; }
    20% { transform: translateY(-40px) scale(1.2); opacity: 1; }
    80% { transform: translateY(-100px) scale(1); opacity: 1; }
    100% { transform: translateY(-120px) scale(0.8); opacity: 0; }
  }
  .upgrade-anim-glow {
    animation: levelUpGlow 1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
  .upgrade-anim-char {
    animation: levelUpPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .upgrade-anim-text {
    animation: levelUpText 1.5s ease-out forwards;
  }
`;

const UNIT_IMAGES = {
  Knight: knightImg,
  Mage: mageImg,
  Archer: archerImg,
  Ranger: arbaletImg,
  Barbarian: berserkImg,
};

const CARD_TROOP_STYLE_MAP = {
  Knight: { scale: 1.8, offsetY: '35%' },
  Mage: { scale: 1.85, offsetY: '45%' },
  Barbarian: { scale: 1.25, offsetY: '15%' },
  Archer: { scale: 1.25, offsetY: '15%' },
  Ranger: { scale: 1.25, offsetY: '15%' },
};

const RES_ICONS = {
  gold: goldIcon,
  wood: woodIcon,
  ore: stoneIcon,
};

const stopPropagation = (e) => e.stopPropagation();

const TROOP_STATS = {
  Knight: {
    display: "Knight",
    stats: {
      1: { hp: 1100, damage: 75, atk_speed: 1.667 },
      2: { hp: 1450, damage: 100, atk_speed: 1.538 },
      3: { hp: 1850, damage: 130, atk_speed: 1.429 },
    },
    maxStats: { hp: 2000, damage: 150, atk_speed: 2.0 }
  },
  Mage: {
    display: "Mage",
    stats: {
      1: { hp: 420, damage: 185, atk_speed: 1.25 },
      2: { hp: 560, damage: 245, atk_speed: 1.111 },
      3: { hp: 720, damage: 320, atk_speed: 1.0 },
    },
    maxStats: { hp: 800, damage: 350, atk_speed: 2.0 }
  },
  Barbarian: {
    display: "Barbarian",
    stats: {
      1: { hp: 520, damage: 90, atk_speed: 0.625 },
      2: { hp: 690, damage: 120, atk_speed: 0.571 },
      3: { hp: 880, damage: 158, atk_speed: 0.526 },
    },
    maxStats: { hp: 1000, damage: 200, atk_speed: 1.0 }
  },
  Archer: {
    display: "Archer",
    stats: {
      1: { hp: 580, damage: 130, atk_speed: 1.111 },
      2: { hp: 760, damage: 175, atk_speed: 1.0 },
      3: { hp: 970, damage: 228, atk_speed: 0.909 },
    },
    maxStats: { hp: 1100, damage: 250, atk_speed: 1.5 }
  },
  Ranger: {
    display: "Ranger",
    stats: {
      1: { hp: 680, damage: 110, atk_speed: 1.0 },
      2: { hp: 900, damage: 148, atk_speed: 0.909 },
      3: { hp: 1150, damage: 192, atk_speed: 0.833 },
    },
    maxStats: { hp: 1300, damage: 220, atk_speed: 1.0 }
  }
};

const ProgressBar = ({ label, value, max, gradient, showAsTime = false }) => {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <div style={styles.progressRow}>
      <div style={styles.progressHeader}>
        <span style={styles.progressLabel}>{label}</span>
        <span style={styles.progressValue}>{value}{showAsTime ? 's' : ''}</span>
      </div>
      <div style={styles.progressBarBg}>
        <div style={{...styles.progressBarFill, background: gradient, width: `${percentage}%`}} />
      </div>
    </div>
  );
};

function BarracksPanel({ building, onClose }) {
  const { sendToGodot } = useSend();
  const { buildingDefs, troopLevels } = useBuilding();
  const { isMobile: mobile } = useLayout();

  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch authoritative troop levels from server when panel opens
  useEffect(() => {
    sendToGodot('refresh_troops');
  }, [sendToGodot]);

  const handleUpgradeTroop = useCallback((name) => sendToGodot('upgrade_troop', { troop_name: name }), [sendToGodot]);

  if (!building || !building.is_barracks) return null;
  const troops = buildingDefs?.troops || {};
  const troopNames = Object.keys(troops);
  
  if (troopNames.length === 0) return null;
  
  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => (prev === 0 ? troopNames.length - 1 : prev - 1));
  }, [troopNames.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev === troopNames.length - 1 ? 0 : prev + 1));
  }, [troopNames.length]);

  const currentTroopName = troopNames[currentIndex];
  const tdef = troops[currentTroopName];
  const lvl = troopLevels[currentTroopName] || 1;
  const isMax = lvl >= 3;
  // costs key = current level (cost to upgrade FROM that level)
  const nextCost = !isMax && tdef?.costs?.[String(lvl)];
  const stats = TROOP_STATS[currentTroopName]?.stats?.[lvl];
  const maxStats = TROOP_STATS[currentTroopName]?.maxStats;
  const displayName = TROOP_STATS[currentTroopName]?.display || tdef?.display || currentTroopName;
  const hasImage = !!UNIT_IMAGES[currentTroopName];

  // Upgrading Logic & Animation
  const [isAnimatingUpgrade, setIsAnimatingUpgrade] = useState(false);
  const prevLvlRef = useRef(lvl);
  const prevTroopRef = useRef(currentTroopName);

  useEffect(() => {
    if (prevTroopRef.current === currentTroopName) {
      // If we are looking at the same troop and the level just went up
      if (lvl > prevLvlRef.current && prevLvlRef.current !== 0) {
        setIsAnimatingUpgrade(true);
        setTimeout(() => setIsAnimatingUpgrade(false), 2000);
      }
    }
    prevLvlRef.current = lvl;
    prevTroopRef.current = currentTroopName;
  }, [lvl, currentTroopName]);

  // Formatting cost string:
  let costStr = "Lvl Up & Get improved stats";
  if (nextCost) {
    const parts = [];
    if (nextCost.gold) parts.push(`${nextCost.gold} Coins`);
    if (nextCost.wood) parts.push(`${nextCost.wood} Wood`);
    if (nextCost.ore) parts.push(`${nextCost.ore} Ore`);
    costStr = "Lvl Up for " + parts.join(', ');
  }

  // Create a combined string for bottom pill (just to match layout of "SPX held")
  const totalCostVal = nextCost ? Object.values(nextCost).reduce((a, b) => a + b, 0) : 0;

  const sphereSize = mobile ? 100 : 200;
  const sliderW = mobile ? 32 : 48;
  const sliderH = mobile ? 52 : 72;
  const reqBoxSize = mobile ? 60 : 90;

  return (
    <div style={{...styles.overlay, ...(mobile ? { alignItems: 'stretch' } : {})}} onClick={onClose}>
      <style>{UPGRADE_ANIM_CSS}</style>

      <div style={{...styles.panel, ...(mobile ? { width: '100vw', maxWidth: '100vw', height: '100%', maxHeight: 'none', borderRadius: 0 } : {})}} onClick={stopPropagation}>

        <div style={styles.header}>
          <span style={{...styles.headerTitle, fontSize: mobile ? 18 : 24}}>{displayName}</span>
          <button style={styles.closeBtn} onClick={onClose}>✖</button>
        </div>

        <div style={{...styles.contentLayout, flexDirection: mobile ? 'column' : 'row', flexWrap: mobile ? 'nowrap' : 'wrap', padding: mobile ? '16px 16px' : '24px 20px', gap: mobile ? 16 : 24, overflowY: 'auto', minHeight: 0}}>

          {/* Character + Sliders — on mobile show FIRST (above stats) */}
          <div style={{...styles.rightColumn, ...(mobile ? { maxWidth: '100%', width: '100%', flex: 'none', order: -1 } : {})}}>
            <div style={styles.characterDisplayArea}>
              <button style={{...styles.sliderBtn, width: sliderW, height: sliderH, fontSize: mobile ? 24 : 32}} onClick={handlePrev}>❮</button>

              <div style={styles.characterWrapper}>
                <div style={{...styles.characterSphere, width: sphereSize, height: sphereSize}}>
                  <div style={{...styles.upgradeBadge, ...(mobile ? { padding: '2px 10px', top: -6, right: -14 } : {})}}>
                    <div style={styles.badgeBigPart}>
                      <span style={{...styles.badgeLvlText, fontSize: mobile ? 10 : 14}}>Lvl</span>
                      <span style={{...styles.badgeLvlNumber, fontSize: mobile ? 18 : 32}}>{lvl}</span>
                    </div>
                  </div>
                  {isAnimatingUpgrade && (
                    <div className="upgrade-anim-glow" style={{ position: 'absolute', width: sphereSize * 2, height: sphereSize * 2, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251, 192, 45, 0.6) 0%, transparent 70%)', zIndex: 4, pointerEvents: 'none' }} />
                  )}
                  {isAnimatingUpgrade && (
                    <div className="upgrade-anim-text" style={{ position: 'absolute', top: '20%', color: '#FBC02D', fontSize: mobile ? 36 : 56, fontWeight: 900, textShadow: '0 4px 20px rgba(251, 192, 45, 0.8), 0 4px 4px #000', zIndex: 20, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                      LEVEL UP!
                    </div>
                  )}
                  {troopNames.map(name => {
                    if (!UNIT_IMAGES[name]) return null;
                    const isActive = name === currentTroopName;
                    const charStyle = CARD_TROOP_STYLE_MAP[name] || { scale: 1.8, offsetY: '5%' };
                    return (
                      <img
                        key={name} src={UNIT_IMAGES[name]} alt={name} className={isActive && isAnimatingUpgrade ? "upgrade-anim-char" : ""}
                        style={{ ...styles.characterImg, transform: `translateY(${charStyle.offsetY}) scale(${charStyle.scale})`, opacity: isActive ? 1 : 0, pointerEvents: isActive ? 'auto' : 'none' }}
                      />
                    );
                  })}
                </div>
              </div>

              <button style={{...styles.sliderBtn, width: sliderW, height: sliderH, fontSize: mobile ? 24 : 32}} onClick={handleNext}>❯</button>
            </div>
          </div>

          {/* Stats & Resources */}
          <div style={{...styles.leftColumn, ...(mobile ? { maxWidth: '100%', width: '100%', flex: '1 1 100%' } : {})}}>
            <h3 style={{...styles.sectionTitle, fontSize: mobile ? 16 : 20}}>Stats</h3>
            {stats && maxStats && (
              <div style={styles.progressContainer}>
                <ProgressBar label="Health Points" value={stats.hp} max={maxStats.hp} gradient="linear-gradient(90deg, #f59e0b, #fbbf24)" />
                <ProgressBar label="Damage Output" value={stats.damage} max={maxStats.damage} gradient="linear-gradient(90deg, #10b981, #34d399)" />
                <ProgressBar label="Attack Speed" value={stats.atk_speed} max={maxStats.atk_speed} showAsTime={true} gradient="linear-gradient(90deg, #6366f1, #818cf8)" />
                <ProgressBar label="Level Progress" value={lvl} max={3} gradient="linear-gradient(90deg, #8b5cf6, #a78bfa)" />
              </div>
            )}

            <h3 style={{...styles.sectionTitle, marginTop: mobile ? 10 : 16, fontSize: mobile ? 16 : 20}}>Upgrade Resources</h3>
            <div style={{...styles.reqGrid, ...(mobile ? { flexWrap: 'nowrap', justifyContent: 'center', gap: 8 } : {})}}>
              {nextCost ? Object.entries(nextCost).map(([res, amt]) => {
                if (amt === 0) return null;
                return (
                  <div key={res} style={{...styles.reqBox, width: reqBoxSize, height: reqBoxSize}}>
                    <img src={RES_ICONS[res] || goldIcon} style={{...styles.reqIconImg, width: mobile ? 34 : 44, height: mobile ? 34 : 44}} alt={res} />
                    <span style={{...styles.reqAmt, fontSize: mobile ? 13 : 16}}>{amt}</span>
                  </div>
                );
              }) : (
                <div style={styles.reqBoxMax}>
                  <span style={{color: '#94a3b8', fontSize: 13, fontStyle: 'italic'}}>No Requirements</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Upgrade button — fixed at bottom, outside scroll area */}
        {!isMax && !building.is_enemy && (
          <div style={{ padding: mobile ? '8px 12px 12px' : '12px 20px 16px', display: 'flex', justifyContent: 'center' }}>
            <button style={{...styles.actionBtn, width: '100%', maxWidth: mobile ? '100%' : 240, padding: mobile ? '12px 16px' : '14px 20px', fontSize: mobile ? 14 : 14}} onClick={() => handleUpgradeTroop(currentTroopName)}>
              Upgrade to Lv {lvl + 1}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default memo(BarracksPanel);

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 20, pointerEvents: 'all',
  },
  panel: {
    width: 680, maxWidth: '96vw', maxHeight: '90vh',
    background: '#ebdaba',
    border: '4px solid #377d9f',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 0 0 4px #ebdaba',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
    position: 'relative', cursor: 'default',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    height: 54, background: '#4ca5d2',
    borderBottom: '4px solid #377d9f',
    width: '100%',
  },
  headerTitle: { 
    fontSize: 24, fontStyle: 'italic', fontWeight: 900, color: '#fff', 
    textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.6)', margin: 0,
  },
  closeBtn: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    width: 32, height: 32, background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: 4,
    color: '#1a3c4f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    fontSize: 20, fontWeight: 'bold'
  },
  contentLayout: {
    display: 'flex', width: '100%',
    padding: '24px 20px', justifyContent: 'center', alignItems: 'flex-start',
    flex: 1, overflowY: 'auto', overflowX: 'hidden', gap: 24, flexWrap: 'wrap',
  },
  leftColumn: {
    flex: '1 1 200px', maxWidth: 300,
    display: 'flex', flexDirection: 'column', gap: 16,
    position: 'relative', zIndex: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: '#377d9f',
    marginBottom: 0,
  },
  progressContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  progressRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: '#7692a1',
    textTransform: 'uppercase',
  },
  progressValue: {
    fontSize: 14,
    fontWeight: 900,
    color: '#1a3c4f',
  },
  progressBarBg: {
    height: 8,
    background: 'rgba(0,0,0,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.4s ease-out',
  },
  characterDisplayArea: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    gap: 8,
  },
  sliderBtn: {
    background: 'rgba(0,0,0,0.1)',
    border: 'none',
    borderRadius: 12,
    color: '#1a3c4f',
    fontSize: 32,
    fontWeight: 900,
    width: 48,
    height: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    zIndex: 30,
    flexShrink: 0,
  },
  characterWrapper: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  characterSphere: {
    width: 200,
    height: 200,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 30% 30%, #d4caa8 0%, #b8af8c 100%)',
    borderRadius: '50%',
    boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.3)',
    border: '2px solid rgba(0,0,0,0.1)'
  },
  characterImg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    zIndex: 5,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.4))',
    transformOrigin: 'bottom center',
    transition: 'opacity 0.35s ease-in-out',
  },
  upgradeBadge: {
    position: 'absolute',
    top: -10,
    right: -20,
    background: 'linear-gradient(135deg, #FBC02D 0%, #F57F17 100%)',
    borderRadius: 24,
    padding: '4px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 8px 16px rgba(245, 127, 23, 0.4), inset 0 2px 0 rgba(255,255,255,0.3)',
    zIndex: 10,
  },
  badgeTopText: {
    fontSize: 10,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  badgeBigPart: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 2,
  },
  badgeLvlText: {
    fontSize: 14,
    fontWeight: 800,
    color: '#fff',
  },
  badgeLvlNumber: {
    fontSize: 32,
    fontWeight: 900,
    color: '#cbd5e1',
  },
  rightColumn: {
    flex: '1 1 280px', maxWidth: 340,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    position: 'relative', zIndex: 10,
  },
  reqGrid: {
    display: 'flex',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  reqBox: {
    background: 'rgba(0, 0, 0, 0.05)',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    borderRadius: 20,
    width: 90,
    height: 90,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
    transition: 'transform 0.2s, background 0.2s',
  },
  reqBoxMax: {
    gridColumn: '1 / -1',
    display: 'flex',
    justifyContent: 'flex-start',
    padding: '10px 0',
  },
  reqIconImg: {
    width: 44,
    height: 44,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
    marginBottom: 4,
  },
  reqAmt: {
    fontSize: 16,
    fontWeight: 900,
    color: '#1a3c4f',
  },
  actionBtn: {
    background: 'linear-gradient(180deg, #FBC02D 0%, #F57F17 100%)',
    border: 'none',
    boxShadow: '0 8px 20px rgba(245, 127, 23, 0.3), inset 0 2px 0 rgba(255,255,255,0.4)',
    borderRadius: 20,
    padding: '14px 20px',
    color: '#fff',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textShadow: '0 2px 2px rgba(0,0,0,0.3)',
    transition: 'transform 0.1s',
  }
};
