import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useSend, useBuilding } from '../hooks/useGodot';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import arbaletImg from '../assets/units/arbalet.png';
import archerImg from '../assets/units/archer.png';
import berserkImg from '../assets/units/berserk.png';

const UNIT_IMAGES = {
  Knight: knightImg,
  Mage: mageImg,
  Archer: archerImg,
  Ranger: arbaletImg,
  Barbarian: berserkImg,
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
  
  const [currentIndex, setCurrentIndex] = useState(0);

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
  const nextCost = !isMax && tdef?.costs?.[String(lvl + 1)];
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

  return (
    <div style={styles.overlay} onClick={onClose}>
      <style>{`
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
      `}</style>
      
      {/* Top Nav inside overlay to match "Jason Mitch" dashboard feel */}
      <div style={styles.closeArea} onClick={onClose}>
         <div style={styles.navBottomBar}>
            <span style={styles.navIcons}>Close ✕</span>
         </div>
      </div>
      
      <div style={styles.panel} onClick={stopPropagation}>
        
        {/* Title Area ("Jason Mitch" style) */}
        <div style={styles.mainTitleArea}>
          <div style={styles.titleLines}>
            <div style={styles.horizontalLine}></div>
            <div style={styles.diamond}></div>
          </div>
          <h1 style={styles.mainTitle}>{displayName}</h1>
          <div style={styles.titleLines}>
            <div style={styles.diamond}></div>
            <div style={styles.horizontalLine}></div>
          </div>
        </div>

        <div style={{ ...styles.contentLayout, marginTop: 40 }}>
          
          {/* Left Column: Progress / Stats */}
          <div style={styles.leftColumn}>
            <h3 style={styles.sectionTitle}>Stats</h3>
            {stats && maxStats && (
              <div style={styles.progressContainer}>
                <ProgressBar 
                  label="Health Points" 
                  value={stats.hp} 
                  max={maxStats.hp} 
                  gradient="linear-gradient(90deg, #f59e0b, #fbbf24)" 
                />
                <ProgressBar 
                  label="Damage Output" 
                  value={stats.damage} 
                  max={maxStats.damage} 
                  gradient="linear-gradient(90deg, #10b981, #34d399)" 
                />
                <ProgressBar 
                  label="Attack Speed" 
                  value={stats.atk_speed} 
                  max={maxStats.atk_speed} 
                  showAsTime={true}
                  gradient="linear-gradient(90deg, #6366f1, #818cf8)" 
                />
                <ProgressBar 
                  label="Level Progress" 
                  value={lvl} 
                  max={3} 
                  gradient="linear-gradient(90deg, #8b5cf6, #a78bfa)" 
                />
              </div>
            )}
          </div>

          {/* Center Column: Character + Sliders */}
          <div style={styles.centerColumn}>
            <button style={styles.sliderBtnLeft} onClick={handlePrev}>❮</button>
            <button style={styles.sliderBtnRight} onClick={handleNext}>❯</button>
            
            <div style={styles.characterWrapper}>
              
              {/* Upgrade Badge floating like the reference img */}
              {!isMax && !building.is_enemy && (
                <div 
                  style={styles.upgradeBadge} 
                  onClick={() => handleUpgradeTroop(currentTroopName)}
                  title="Click to Upgrade!"
                >
                  <div style={styles.badgeBigPart}>
                    <span style={styles.badgeLvlText}>Lvl</span>
                    <span style={styles.badgeLvlNumber}>{lvl + 1}</span>
                  </div>
                </div>
              )}
              {isMax && (
                <div style={styles.upgradeBadge}>
                  <div style={styles.badgeBigPart}>
                    <span style={styles.badgeLvlText}>Lvl</span>
                    <span style={styles.badgeLvlNumber}>3</span>
                  </div>
                </div>
              )}

              {/* Character specific placement */}
              <div style={styles.characterSphere}>
                {!hasImage && (
                  <>
                    <div style={styles.sphereGlow}></div>
                    <div style={styles.sphereCore}></div>
                  </>
                )}
                {hasImage && <div style={styles.bigSoftGlow}></div>}

                {/* Level Up Effects */}
                {isAnimatingUpgrade && (
                  <div 
                    className="upgrade-anim-glow"
                    style={{
                      position: 'absolute',
                      width: 400,
                      height: 400,
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(251, 192, 45, 0.6) 0%, transparent 70%)',
                      zIndex: 4,
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {isAnimatingUpgrade && (
                  <div 
                    className="upgrade-anim-text"
                    style={{
                      position: 'absolute',
                      top: '20%',
                      color: '#FBC02D',
                      fontSize: 56,
                      fontWeight: 900,
                      textShadow: '0 4px 20px rgba(251, 192, 45, 0.8), 0 4px 4px #000',
                      zIndex: 20,
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    LEVEL UP!
                  </div>
                )}

                {/* Preload and crossfade all characters */}
                {troopNames.map(name => {
                  if (!UNIT_IMAGES[name]) return null;
                  const isActive = name === currentTroopName;
                  
                  let imgSize = 550;
                  if (name === 'Knight' || name === 'Mage') {
                    imgSize = 750;
                  } else if (name === 'Archer' || name === 'Barbarian') {
                    imgSize = 480;
                  }
                  
                  return (
                    <img 
                      key={name}
                      src={UNIT_IMAGES[name]} 
                      alt={name} 
                      className={isActive && isAnimatingUpgrade ? "upgrade-anim-char" : ""}
                      style={{
                        ...styles.characterImg,
                        width: imgSize,
                        height: imgSize,
                        opacity: isActive ? 1 : 0,
                        transition: 'opacity 0.35s ease-in-out',
                        pointerEvents: isActive ? 'auto' : 'none'
                      }} 
                    />
                  );
                })}
              </div>

              {/* Removed total cost pill per user request */}

            </div>
          </div>
          
          {/* Right Column: Matched to "NFTs Equipped" block */}
          <div style={styles.rightColumn}>
             <h3 style={styles.sectionTitle}>Upgrade Resources</h3>
             <div style={styles.reqGrid}>
                {nextCost ? Object.entries(nextCost).map(([res, amt]) => {
                  if (amt === 0) return null;
                  return (
                    <div key={res} style={styles.reqBox}>
                      <img src={RES_ICONS[res] || goldIcon} style={styles.reqIconImg} alt={res} />
                      <span style={styles.reqAmt}>{amt}</span>
                    </div>
                  );
                }) : (
                  <div style={styles.reqBoxMax}>
                    <span style={{color: '#94a3b8', fontSize: 13}}>No Requirements</span>
                  </div>
                )}
             </div>

             <div style={{ marginTop: 'auto', marginBottom: 20 }}>
               {!isMax && !building.is_enemy && (
                 <button 
                   style={styles.actionBtn}
                   onClick={() => handleUpgradeTroop(currentTroopName)}
                 >
                    Upgrade to Lv {lvl + 1}
                 </button>
               )}
             </div>
          </div>
          
        </div>

      </div>
    </div>
  );
}

export default memo(BarracksPanel);

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(12, 12, 28, 0.85)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    pointerEvents: 'all',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  closeArea: {
    position: 'absolute',
    top: 20,
    right: 40,
    cursor: 'pointer',
    color: '#64748b',
  },
  navBottomBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    paddingBottom: 8,
  },
  navIcons: {
    fontSize: 14,
    fontWeight: 600,
    color: '#94a3b8',
    transition: 'color 0.2s',
  },
  panel: {
    background: 'radial-gradient(ellipse at center top, #16223F 0%, #0B1121 60%, #03050B 100%)',
    borderRadius: 32,
    border: '1px solid rgba(255, 255, 255, 0.05)',
    width: 1000,
    height: 600,
    maxWidth: '95vw',
    maxHeight: '90vh',
    boxShadow: '0 40px 80px rgba(0,0,0,0.8), inset 0 2px 0 rgba(255,255,255,0.05)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 0',
    overflow: 'hidden',
    position: 'relative',
  },
  mainTitleArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    marginBottom: 12,
  },
  titleLines: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    opacity: 0.3,
  },
  horizontalLine: {
    width: 80,
    height: 1,
    background: 'rgba(70, 184, 232, 0.3)',
  },
  diamond: {
    width: 6,
    height: 6,
    background: 'rgba(70, 184, 232, 0.5)',
    transform: 'rotate(45deg)',
  },
  mainTitle: {
    margin: 0,
    fontSize: 48,
    fontWeight: 900,
    color: '#ffffff',
    letterSpacing: -1,
    textShadow: '0 4px 20px rgba(255,255,255,0.2)',
  },
  subTitleArea: {
    display: 'none',
  },
  contentLayout: {
    display: 'flex',
    width: '100%',
    padding: '0 40px',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    flex: 1,
  },
  leftColumn: {
    width: '280px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    marginTop: 20,
    position: 'relative',
    zIndex: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: '#e2e8f0',
    marginBottom: 8,
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
    fontWeight: 600,
    color: '#94a3b8',
  },
  progressValue: {
    fontSize: 14,
    fontWeight: 800,
    color: '#f8fafc',
  },
  progressBarBg: {
    height: 6,
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.4s ease-out',
  },
  centerColumn: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  sliderBtnLeft: {
    position: 'absolute',
    left: 20,
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 56,
    fontWeight: 300,
    fontFamily: 'monospace',
    cursor: 'pointer',
    transition: 'all 0.2s',
    zIndex: 10,
  },
  sliderBtnRight: {
    position: 'absolute',
    right: 20,
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 56,
    fontWeight: 300,
    fontFamily: 'monospace',
    cursor: 'pointer',
    transition: 'all 0.2s',
    zIndex: 10,
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
    width: 240,
    height: 240,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sphereCore: {
    width: 140,
    height: 140,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, #46b8e8 0%, #2a9ccb 40%, #15516b 100%)',
    boxShadow: 'inset 0 10px 30px rgba(255,255,255,0.2), 0 20px 40px rgba(0,0,0,0.5)',
    zIndex: 2,
  },
  sphereGlow: {
    position: 'absolute',
    inset: -60,
    borderRadius: '50%',
    background: 'conic-gradient(from 0deg, transparent, rgba(70, 184, 232, 0.3), transparent)',
    animation: 'spin 12s linear infinite',
    zIndex: 1,
  },
  bigSoftGlow: {
    position: 'absolute',
    width: 600,
    height: 600,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(70, 184, 232, 0.15) 0%, transparent 60%)',
    zIndex: 1,
  },
  characterImg: {
    position: 'absolute',
    width: 550,
    height: 550,
    objectFit: 'contain',
    zIndex: 5,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.6))',
  },
  upgradeBadge: {
    position: 'absolute',
    top: 20,
    right: 10,
    background: 'linear-gradient(135deg, #FBC02D 0%, #F57F17 100%)',
    borderRadius: 24,
    padding: '4px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(245, 127, 23, 0.4), inset 0 2px 0 rgba(255,255,255,0.3)',
    zIndex: 10,
    transition: 'transform 0.1s',
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
    width: '280px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    marginTop: 20,
    position: 'relative',
    zIndex: 10,
  },
  reqGrid: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  reqBox: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    width: 110,
    height: 110,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 8px 16px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.02)',
    transition: 'transform 0.2s, background 0.2s',
  },
  reqBoxMax: {
    gridColumn: '1 / -1',
    display: 'flex',
    justifyContent: 'flex-start',
    padding: '10px 0',
  },
  reqIconImg: {
    width: 56,
    height: 56,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.5))',
    marginBottom: 4,
  },
  reqAmt: {
    fontSize: 20,
    fontWeight: 900,
    color: '#f8fafc',
    textShadow: '0 2px 2px rgba(0,0,0,0.5)',
  },
  actionBtn: {
    background: 'linear-gradient(180deg, #FBC02D 0%, #F57F17 100%)',
    border: 'none',
    boxShadow: '0 8px 20px rgba(245, 127, 23, 0.3), inset 0 2px 0 rgba(255,255,255,0.4)',
    borderRadius: 20,
    padding: '16px 24px',
    color: '#fff',
    fontSize: 16,
    fontWeight: 900,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textShadow: '0 2px 2px rgba(0,0,0,0.3)',
    transition: 'transform 0.1s',
  }
};
