import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { useSend, useBuilding } from '../hooks/useGodot';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

import imgMine from '../assets/buildings/mine.png';
import imgBarn from '../assets/buildings/barn.png';
import imgPort from '../assets/buildings/port.png';
import imgSawmill from '../assets/buildings/sawmill.png';
import imgTownHall from '../assets/buildings/townhall.png';
import imgTurret from '../assets/buildings/turret.png';
import imgTombstone from '../assets/buildings/tombstone.png';
import imgArcherTower from '../assets/buildings/archertower.png';
import imgStorage from '../assets/buildings/storage.png';
import imgShip from '../assets/buildings/shipsmall.png';

const ICONS = { gold: goldIcon, wood: woodIcon, ore: stoneIcon };

const THUMBNAIL_MAP = {
  mine: imgMine,
  barn: imgBarn,
  port: imgPort,
  sawmill: imgSawmill,
  town_hall: imgTownHall,
  turret: imgTurret,
  tombstone: imgTombstone,
  archtower: imgArcherTower,
  archer_tower: imgArcherTower,
  archertower: imgArcherTower,
  storage: imgStorage,
};

const DESC_MAP = {
  mine: 'Mines produce ore over time.',
  sawmill: 'Sawmills produce wood over time.',
  barn: 'Trains troops.',
  port: 'Deploy ships to attack.',
  town_hall: 'The heart of your village.',
  turret: 'Targets ground enemies.',
  tombstone: 'Spawns skeletons to defend.',
  archtower: 'Ranged defense against invaders.',
  archer_tower: 'Ranged defense against invaders.',
  archertower: 'Ranged defense against invaders.',
  residence: 'Residences produce gold.',
};

function BuildingInfoPanel({ onOpenTroops }) {
  const { sendToGodot } = useSend();
  const { selectedBuilding: building } = useBuilding();
  
  const [view, setView] = useState('ACTIONS'); // ACTIONS, INFO, UPGRADE, BUY_SHIP, LOAD_TROOPS

  useEffect(() => {
    setView('ACTIONS');
  }, [building?.id]);

  const handleDeselect = useCallback(() => sendToGodot('deselect_building'), [sendToGodot]);
  const handleUpgrade = useCallback(() => {
    sendToGodot('upgrade_building');
    setView('ACTIONS'); // Close after upgrading
  }, [sendToGodot]);

  const handleBuyShip = useCallback(() => {
    sendToGodot('buy_ship');
    setView('ACTIONS'); // Close after upgrading
  }, [sendToGodot]);

  if (!building) return null;

  const isMaxLevel = building.level >= building.max_level;
  const upgHealth = Math.floor(building.max_hp * 0.2);

  const renderActions = () => (
    <div style={styles.actionsWrap}>
      <div style={styles.actionLabel}>
        <span style={styles.actionName}>{building.name}</span>
        <span style={styles.actionLevel}>Level {building.level}</span>
      </div>
      {(building.is_enemy || isMaxLevel) && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnInfo }}
          onClick={() => setView('INFO')}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <span style={styles.iconLarge}>i</span>
        </button>
      )}

      {(building.id === 'barn' || building.is_barracks) && !building.is_enemy && (
        <button 
          style={{ ...styles.circleBtn, ...styles.btnTroops }} 
          onClick={onOpenTroops}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </button>
      )}

      {building.id === 'port' && !building.is_enemy && !building.has_ship && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnTroops }}
          onClick={() => setView('BUY_SHIP')}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="3"></circle>
            <line x1="12" y1="22" x2="12" y2="8"></line>
            <path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>
          </svg>
        </button>
      )}

      {building.id === 'port' && !building.is_enemy && building.has_ship && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnTroops }}
          onClick={() => setView('LOAD_TROOPS')}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <line x1="19" y1="8" x2="19" y2="14"></line>
            <line x1="22" y1="11" x2="16" y2="11"></line>
          </svg>
        </button>
      )}

      {!building.is_enemy && !isMaxLevel && (
        <button 
          style={{ ...styles.circleBtn, ...styles.btnUpgrade }} 
          onClick={() => setView('UPGRADE')}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      )}
    </div>
  );

  const renderModal = (title, level, leftContent, centerImg, rightContent, mainActionText, onMainAction) => (
    <div style={styles.overlay} onClick={handleDeselect}>
       <div style={styles.closeArea} onClick={handleDeselect}>
         <div style={styles.navBottomBar}>
            <span style={styles.navIcons}>Close ✕</span>
         </div>
      </div>
      
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.mainTitleArea}>
            <div style={styles.titleLines}>
              <div style={styles.horizontalLine}></div>
              <div style={styles.diamond}></div>
            </div>
            <h1 style={styles.mainTitle}>{title}</h1>
            <div style={styles.titleLines}>
              <div style={styles.diamond}></div>
              <div style={styles.horizontalLine}></div>
            </div>
        </div>
        
        <div style={{ ...styles.contentLayout, marginTop: 40 }}>
          
          {/* Left Column */}
          <div style={styles.leftColumn}>
             <h3 style={styles.sectionTitle}>Stats</h3>
             <div style={styles.statsContainer}>
                {leftContent}
             </div>
             
             {/* Description */}
             <div style={{marginTop: 'auto', padding: 16, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.15)', boxShadow: '0 4px 8px rgba(0,0,0,0.15)'}}>
                <span style={{color: '#ffffff', fontSize: 13, lineHeight: 1.5, textShadow: '0 1px 2px rgba(0,0,0,0.4)'}}>
                  {DESC_MAP[building.id] || "A critical component of your island outposts."}
                </span>
             </div>
          </div>

          {/* Center Column */}
          <div style={styles.centerColumn}>
             <div style={styles.characterWrapper}>
               
               {level && (
                 <div style={styles.upgradeBadge}>
                   <div style={styles.badgeBigPart}>
                     <span style={styles.badgeLvlText}>Lvl</span>
                     <span style={styles.badgeLvlNumber}>{level}</span>
                   </div>
                 </div>
               )}

               <div style={styles.characterSphere}>
                  {centerImg}
               </div>
             </div>
          </div>

          {/* Right Column */}
          <div style={styles.rightColumn}>
             {rightContent}
             
             {mainActionText && (
               <div style={{ marginTop: 'auto', marginBottom: 20 }}>
                 <button 
                   style={styles.actionBtn}
                   onClick={onMainAction}
                   onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'}
                   onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                   onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                   onMouseUp={e => e.currentTarget.style.transform = 'scale(1.02)'}
                 >
                    {mainActionText}
                 </button>
               </div>
             )}
          </div>
        </div>
      
      </div>
    </div>
  );

  const StatBox = ({ label, current, upgradeTo }) => (
    <div style={styles.statBox}>
      <div style={styles.statBoxLabel}>{label}</div>
      <div style={styles.statBoxValues}>
        <span style={styles.statCurrent}>{current}</span>
        {upgradeTo && (
           <>
             <span style={styles.statArrow}>→</span>
             <span style={styles.statUpgraded}>{upgradeTo}</span>
           </>
        )}
      </div>
    </div>
  );

  const ResourceReqs = ({ costObj, title }) => (
    <>
      <h3 style={styles.sectionTitle}>{title || "Resource Cost"}</h3>
      <div style={styles.reqGrid}>
        {costObj && Object.keys(costObj).length > 0 ? Object.entries(costObj).map(([res, amt]) => {
          if (amt === 0) return null;
          return (
            <div key={res} style={styles.reqBox}>
              <img src={ICONS[res] || goldIcon} style={styles.reqIconImg} alt={res} />
              <span style={styles.reqAmt}>{amt.toLocaleString()}</span>
            </div>
          );
        }) : (
          <div style={styles.reqBoxMax}>
            <span style={{color: '#94a3b8', fontSize: 13}}>No Requirements</span>
          </div>
        )}
      </div>
    </>
  );

  const buildingImg = THUMBNAIL_MAP[building.id] ? (
    <img 
      src={THUMBNAIL_MAP[building.id]} 
      alt={building.name} 
      style={styles.characterImg} 
    />
  ) : (
    <div style={{...styles.characterImg, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 150}}>🏠</div>
  );

  const renderInfo = () => {
    const leftContent = (
      <>
        <StatBox label="Health" current={building.max_hp} />
        <StatBox label="Level" current={building.level} />
      </>
    );
    const rightContent = (
      <>
         <h3 style={styles.sectionTitle}>Status</h3>
         <div style={{...styles.reqBoxMax, padding: 16, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.15)', boxShadow: '0 4px 8px rgba(0,0,0,0.15)'}}>
           <span style={{color: '#fff', fontSize: 16, fontWeight: 800, textShadow: '0 2px 4px rgba(0,0,0,0.3)'}}>Functional</span>
         </div>
      </>
    );
    return renderModal(building.name.toUpperCase(), building.level, leftContent, buildingImg, rightContent, null, null);
  };

  const renderUpgrade = () => {
    const leftContent = (
      <>
        <StatBox label="Health" current={building.max_hp} upgradeTo={building.max_hp + upgHealth} />
        <StatBox label="Level" current={building.level} upgradeTo={building.level + 1} />
      </>
    );
    const rightContent = <ResourceReqs costObj={building.upgrade_cost} title="Upgrade Cost" />;

    return renderModal(
      `UPGRADE ${building.name.toUpperCase()}`, 
      building.level, 
      leftContent, 
      buildingImg, 
      rightContent, 
      "Upgrade Now", 
      handleUpgrade
    );
  };

  const renderBuyShip = () => {
    const shipCost = building.ship_cost || { gold: 1500, wood: 1000 };
    const leftContent = (
      <>
        <StatBox label="Troop Capacity" current={0} upgradeTo={10} />
        <StatBox label="Barrage / Artillery" current={"None"} upgradeTo={250} />
      </>
    );
    const rightContent = <ResourceReqs costObj={shipCost} title="Unlock Cost" />;
    
    const shipImg = <img src={imgShip} alt="Ship" style={styles.characterImg} />;

    return renderModal(
      "UNLOCK GUNBOAT", 
      null, 
      leftContent, 
      shipImg, 
      rightContent, 
      "Unlock Ship", 
      handleBuyShip
    );
  };

  const renderLoadTroops = () => {
    const shipLevel = building.ship_level || 1;
    const shipTroops = building.ship_troops || [];
    const capacity = building.ship_capacity || shipLevel;
    const isFull = shipTroops.length >= capacity;
    const troopLvls = building.troop_levels || {};
    // Godot sends PascalCase keys, ensure both cases work
    const getTroopLvl = (name) => troopLvls[name] || troopLvls[name.toLowerCase()] || 1;
    const allTroops = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger'];

    return (
      <div style={styles.loadTroopsPanel}>
        <div style={styles.loadTroopsHeader}>
          <button style={styles.backBtn} onClick={() => setView('ACTIONS')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={styles.loadTroopsTitle}>
            Ship Lv.{shipLevel} — {shipTroops.length}/{capacity}
          </span>
        </div>

        {/* Loaded troops */}
        {shipTroops.length > 0 && (
          <div style={styles.loadedList}>
            {shipTroops.map((t, i) => (
              <div key={i} style={styles.loadedItem}>
                <span style={styles.loadedName}>{t}</span>
                <span style={styles.loadedLvl}>Lv.{troopLvls[t] || 1}</span>
              </div>
            ))}
          </div>
        )}

        {/* Load buttons */}
        {!isFull && (
          <div style={styles.loadBtnList}>
            {allTroops.map(name => {
              const lvl = getTroopLvl(name);
              return (
                <button
                  key={name}
                  style={styles.loadTroopBtn}
                  onClick={() => {
                    sendToGodot('load_troop', { troop_name: name });
                  }}
                >
                  <span style={styles.loadTroopName}>{name}</span>
                  <span style={styles.loadTroopLvl}>Lv.{lvl}</span>
                </button>
              );
            })}
          </div>
        )}

        {isFull && (
          <div style={styles.shipFullMsg}>Ship is full!</div>
        )}
      </div>
    );
  };

  return (
    <>
      {view === 'ACTIONS' && renderActions()}
      {view === 'INFO' && renderInfo()}
      {view === 'UPGRADE' && renderUpgrade()}
      {view === 'BUY_SHIP' && renderBuyShip()}
      {view === 'LOAD_TROOPS' && renderLoadTroops()}
    </>
  );
}

export default memo(BuildingInfoPanel);

const styles = {
  // ACTIONS VIEW
  actionLabel: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  actionName: {
    fontSize: 18,
    fontWeight: 900,
    color: '#fff',
    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.8)',
    whiteSpace: 'nowrap',
  },
  actionLevel: {
    fontSize: 14,
    fontWeight: 800,
    color: '#FFD700',
    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
    whiteSpace: 'nowrap',
  },
  actionsWrap: {
    position: 'fixed',
    bottom: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 32,
    zIndex: 10,
    pointerEvents: 'none',
  },
  circleBtn: {
    width: 68,
    height: 68,
    borderRadius: '50%',
    border: '4px solid #fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    pointerEvents: 'all',
    boxShadow: '0 6px 0 rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.5)',
    color: '#fff',
    outline: 'none',
    transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  btnInfo: {
    background: 'linear-gradient(180deg, #4aa6ef, #1e70b9)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
  },
  btnUpgrade: {
    background: 'linear-gradient(180deg, #7ad23f, #479a1f)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
  },
  btnTroops: {
    background: 'linear-gradient(180deg, #ffca28, #f57f17)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
  },
  iconLarge: {
    fontSize: 48,
    fontWeight: 'bold',
    fontStyle: 'italic',
    lineHeight: 1,
  },

  // BARRACKS / DARK OVERLAY STYLE
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
  },
  closeArea: {
    position: 'absolute',
    top: 20,
    right: 40,
    cursor: 'pointer',
    color: '#64748b',
    zIndex: 30,
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
    background: 'linear-gradient(180deg, #4aa6ef 0%, #1e70b9 100%)',
    borderRadius: 28,
    border: '4px solid #AAB7B8',
    width: 840,
    height: 480,
    maxWidth: '95vw',
    maxHeight: '90vh',
    boxShadow: '0 24px 48px rgba(0,0,0,0.6), inset 0 8px 16px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '30px 0',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'default',
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
    fontSize: 32,
    fontWeight: 900,
    color: '#ffffff',
    letterSpacing: -1,
    textShadow: '0 4px 4px rgba(0,0,0,0.5), 0 8px 16px rgba(0,0,0,0.3)',
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
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 20,
    position: 'relative',
    zIndex: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: '#ffffff',
    textShadow: '0 2px 4px rgba(0,0,0,0.4)',
    marginBottom: 8,
  },
  statsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  statBox: {
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: '12px 16px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
  },
  statBoxLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#e2e8f0',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
  statBoxValues: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  statCurrent: {
    fontSize: 24,
    fontWeight: 800,
    color: '#ffffff',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
  },
  statArrow: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.7,
  },
  statUpgraded: {
    fontSize: 24,
    fontWeight: 900,
    color: '#7ad23f',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
  },

  centerColumn: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
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
  },
  sphereCore: {
    width: 120,
    height: 120,
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
    width: 280,
    height: 280,
    objectFit: 'contain',
    zIndex: 5,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.6))',
  },
  upgradeBadge: {
    position: 'absolute',
    top: 0,
    right: 20,
    background: 'linear-gradient(135deg, #FBC02D 0%, #F57F17 100%)',
    borderRadius: 24,
    padding: '4px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 8px 24px rgba(245, 127, 23, 0.4), inset 0 2px 0 rgba(255,255,255,0.3)',
    zIndex: 10,
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
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 20,
    position: 'relative',
    zIndex: 10,
  },
  reqGrid: {
    display: 'flex',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  reqBox: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    width: 90,
    height: 90,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
    transition: 'transform 0.2s, background 0.2s',
  },
  reqBoxMax: {
    gridColumn: '1 / -1',
    display: 'flex',
    justifyContent: 'flex-start',
  },
  reqIconImg: {
    width: 44,
    height: 44,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.5))',
    marginBottom: 4,
  },
  reqAmt: {
    fontSize: 16,
    fontWeight: 900,
    color: '#f8fafc',
    textShadow: '0 2px 2px rgba(0,0,0,0.5)',
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
  },
  // Load troops panel
  loadTroopsPanel: {
    position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
    width: 340, maxWidth: '95vw',
    background: 'linear-gradient(180deg, #3E2723 0%, #2C1B0E 100%)',
    border: '3px solid #6D4C2A', borderRadius: '16px 16px 0 0',
    padding: 16, zIndex: 30, pointerEvents: 'auto',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  loadTroopsHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  backBtn: {
    width: 32, height: 32, borderRadius: 8,
    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  loadTroopsTitle: {
    color: '#fff', fontSize: 16, fontWeight: 900,
    textShadow: '0 2px 2px rgba(0,0,0,0.5)',
  },
  loadedList: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  loadedItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 12px', background: 'rgba(255,255,255,0.08)',
    borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
  },
  loadedName: { color: '#fff', fontSize: 14, fontWeight: 700 },
  loadedLvl: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700 },
  loadBtnList: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
  },
  loadTroopBtn: {
    flex: '1 0 45%', padding: '10px 8px',
    background: 'linear-gradient(180deg, #2E7D32 0%, #1B5E20 100%)',
    border: '2px solid #4CAF50', borderRadius: 10,
    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  },
  loadTroopName: { color: '#fff', fontSize: 13, fontWeight: 900 },
  loadTroopLvl: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700 },
  shipFullMsg: {
    color: '#FFA726', fontSize: 14, fontWeight: 900, textAlign: 'center',
    padding: 12,
  },
};
