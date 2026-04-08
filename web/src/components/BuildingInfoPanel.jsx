import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { useSend, useBuilding } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';

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

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import arbaletImg from '../assets/units/arbalet.png';
import archerImg from '../assets/units/archer.png';
import berserkImg from '../assets/units/berserk.png';

const ICONS = { gold: goldIcon, wood: woodIcon, ore: stoneIcon };

const UNIT_IMAGES = {
  Knight: knightImg,
  Mage: mageImg,
  Archer: archerImg,
  Ranger: arbaletImg,
  Barbarian: berserkImg,
};

const TROOP_STYLE_MAP = {
  Knight: { scale: 2.2, offsetY: '35%' },
  Mage: { scale: 2.5, offsetY: '50%' },
  Barbarian: { scale: 1.9, offsetY: '25%' },
  Archer: { scale: 1.9, offsetY: '25%' },
  Ranger: { scale: 1.9, offsetY: '25%' },
};

const CARD_TROOP_STYLE_MAP = {
  Knight: { scale: 1.35, offsetY: '0%' },
  Mage: { scale: 1.45, offsetY: '0%' },
  Barbarian: { scale: 1.05, offsetY: '0%' },
  Archer: { scale: 1.05, offsetY: '0%' },
  Ranger: { scale: 1.05, offsetY: '0%' },
};

const TROOP_COST = 100; // gold per unit

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
  const { isMobile } = useLayout();
  
  const [view, setView] = useState('ACTIONS');
  const [swapSlot, setSwapSlot] = useState(null);
  const [localTroops, setLocalTroops] = useState(null);

  useEffect(() => {
    if (building?.open_load_troops) {
      setView('LOAD_TROOPS');
    } else {
      setView('ACTIONS');
    }
  }, [building?.id, building?.open_load_troops]);

  // Reset optimistic troops when server data arrives
  useEffect(() => {
    setLocalTroops(null);
  }, [building?.ship_troops?.length]);

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
    <div style={{ ...styles.actionsWrap, ...isMobile && { bottom: 130, gap: 16 } }}>
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
          style={{ ...styles.circleBtn, ...styles.btnUpgrade, ...isMobile && { width: 56, height: 56 } }} 
          onClick={() => setView('UPGRADE')}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width={isMobile ? 32 : 40} height={isMobile ? 32 : 40} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      )}
    </div>
  );

  const renderModal = (title, level, leftContent, centerImg, rightContent, mainActionText, onMainAction) => (
    <div style={LT.overlay} onClick={handleDeselect}>
      <div style={LT.panel} onClick={e => e.stopPropagation()}>
        {/* Header matching Load Troops */}
        <div style={LT.header}>
          <span style={LT.headerTitle}>{title}</span>
          <button style={LT.closeBtn} onClick={handleDeselect}>
            ✖
          </button>
        </div>
        
        <div style={{ ...styles.contentLayout, marginTop: isMobile ? 10 : 12, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'nowrap', gap: 20 }}>
          
          {/* Left Column (Stats & Cost) */}
          <div style={{...styles.leftColumn, ...isMobile && { width: '100%', order: 2, marginTop: 10 }}}>
             <h3 style={{...styles.sectionTitle, marginTop: 0}}>Stats</h3>
             <div style={styles.statsContainer}>
                {leftContent}
             </div>
             
             {/* Cost moved to Left Column */}
             {rightContent && (
               <div style={{ marginTop: 20 }}>
                 {rightContent}
               </div>
             )}
          </div>

          {/* Right Column (Image + Action) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', ...isMobile && { order: 1 } }}>
             <div style={styles.characterWrapper}>
               
               {level && (
                 <div style={styles.upgradeBadge}>
                   <div style={styles.badgeBigPart}>
                     <span style={styles.badgeLvlText}>Lvl</span>
                     <span style={styles.badgeLvlNumber}>{level}</span>
                   </div>
                 </div>
               )}

               <div style={{ ...styles.characterSphere, ...isMobile && { width: 140, height: 140 }}}>
                  {centerImg}
               </div>
             </div>

             <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'auto', paddingBottom: 16 }}>
                 {mainActionText && (
                   <div style={{ width: '100%', maxWidth: 240, marginTop: 16 }}>
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
         <div style={{...styles.reqBoxMax, padding: 16, background: 'rgba(0, 0, 0, 0.05)', borderRadius: 16, border: '1px solid rgba(0, 0, 0, 0.1)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)'}}>
           <span style={{color: '#377d9f', fontSize: 16, fontWeight: 800}}>Functional</span>
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
    const shipTroops = localTroops || building.ship_troops || [];
    const capacity = building.ship_capacity || shipLevel;
    const isFull = shipTroops.length >= capacity;
    const troopLvls = building.troop_levels || {};
    const getTroopLvl = (name) => troopLvls[name] || troopLvls[name.toLowerCase()] || 1;
    const allTroops = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger'];

    const handleLoadTroop = (name) => {
      if (swapSlot !== null) {
        // Optimistic swap
        const updated = [...shipTroops];
        updated[swapSlot] = name;
        setLocalTroops(updated);
        sendToGodot('swap_troop', { slot: swapSlot, troop_name: name });
        setSwapSlot(null);
      } else {
        // Optimistic load
        setLocalTroops([...shipTroops, name]);
        sendToGodot('load_troop', { troop_name: name });
      }
    };

    const handleClose = () => { setSwapSlot(null); setView('ACTIONS'); };

    return (
      <div style={LT.overlay} onClick={handleClose}>
        <div style={LT.panel} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={LT.header}>
            <span style={LT.headerTitle}>Choose Troops</span>
            <button style={LT.closeBtn} onClick={handleClose}>
              ✖
            </button>
          </div>

          {/* Loaded troops slots */}
          <div style={LT.loadedBar}>
            {Array.from({ length: capacity }).map((_, i) => {
              const t = shipTroops[i];
              const isSwapping = swapSlot === i;
              if (t) {
                return (
                  <div
                    key={i}
                    style={{ ...LT.loadedSlot, ...(isSwapping ? LT.loadedSlotActive : {}) }}
                    onClick={() => setSwapSlot(isSwapping ? null : i)}
                    onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
                    onMouseOut={e => e.currentTarget.style.filter = isSwapping ? 'brightness(1.15)' : 'none'}
                  >
                    <div style={{ ...LT.troopImgWrap, paddingBottom: 0 }}>
                      {UNIT_IMAGES[t] && (
                        <div key={`${t}-${i}`} style={{ animation: 'swapFlash 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards', width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                          <img 
                            src={UNIT_IMAGES[t]} 
                            alt={t} 
                            style={{
                              ...LT.loadedSlotImg,
                              transform: `scale(${CARD_TROOP_STYLE_MAP[t]?.scale || 1}) translateY(${CARD_TROOP_STYLE_MAP[t]?.offsetY || '0%'})`
                            }}
                          />
                        </div>
                      )}
                    </div>
                    {isSwapping && <div style={LT.swapBadge}>SWAP</div>}
                  </div>
                );
              }
              return (
                <div 
                  key={`empty-${i}`} 
                  style={LT.emptySlot}
                  onClick={() => setSwapSlot(i)}
                  onMouseOver={e => e.currentTarget.style.filter = 'brightness(0.95)'}
                  onMouseOut={e => e.currentTarget.style.filter = 'none'}
                >
                  ?
                </div>
              );
            })}
          </div>

          {swapSlot !== null && (
            <div style={LT.swapHint}>Select a troop below for slot {swapSlot + 1}</div>
          )}

          {/* Troop selection grid */}
          <div style={LT.grid}>
            {allTroops.map(name => {
              const lvl = getTroopLvl(name);
              return (
                <button
                  key={name}
                  style={LT.troopCard}
                  onClick={() => {
                    if (isFull && swapSlot === null) {
                      // Auto-swap last slot directly
                      const updated = [...shipTroops];
                      updated[capacity - 1] = name;
                      setLocalTroops(updated);
                      sendToGodot('swap_troop', { slot: capacity - 1, troop_name: name });
                    } else {
                      handleLoadTroop(name);
                    }
                  }}
                  onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
                  onMouseOut={e => e.currentTarget.style.filter = 'none'}
                >
                  <div style={LT.troopLvlBadge}>Lvl {lvl}</div>
                  
                  <div style={LT.troopImgWrap}>
                    {UNIT_IMAGES[name] && (
                      <img 
                        src={UNIT_IMAGES[name]} 
                        alt={name} 
                        style={{
                          ...LT.troopImg,
                          transform: `scale(${CARD_TROOP_STYLE_MAP[name]?.scale || 1}) translateY(${CARD_TROOP_STYLE_MAP[name]?.offsetY || '0%'})`
                        }} 
                      />
                    )}
                  </div>

                  <div style={LT.bottomOverlay}>
                    <span style={LT.bottomLabel}>{name.toUpperCase()}</span>
                    <img src={goldIcon} alt="gold" style={LT.costIcon} />
                    <span style={LT.costText}>{TROOP_COST}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
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

  // MODAL / SHARED STYLE
  contentLayout: {
    display: 'flex',
    width: '100%',
    padding: '0 20px',
    justifyContent: 'center',
    alignItems: 'stretch',
    flex: 1,
    flexWrap: 'wrap',
    overflowY: 'auto',
  },
  leftColumn: {
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    position: 'relative',
    zIndex: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: '#377d9f',
    marginBottom: 8,
  },
  statsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  statBox: {
    background: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 16,
    padding: '12px 16px',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
  },
  statBoxLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: '#7692a1',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  statBoxValues: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  statCurrent: {
    fontSize: 24,
    fontWeight: 800,
    color: '#1a3c4f',
  },
  statArrow: {
    fontSize: 16,
    color: '#1a3c4f',
    opacity: 0.7,
  },
  statUpgraded: {
    fontSize: 24,
    fontWeight: 900,
    color: '#479a1f',
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
    background: 'radial-gradient(circle at 30% 30%, #d4caa8 0%, #b8af8c 100%)',
    borderRadius: '50%',
    boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.3)',
    border: '2px solid rgba(0,0,0,0.1)'
  },
  characterImg: {
    position: 'absolute',
    width: 280,
    height: 280,
    objectFit: 'contain',
    zIndex: 5,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.4))',
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
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  reqBox: {
    background: 'rgba(0, 0, 0, 0.05)',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
    borderRadius: 20,
    width: 90,
    height: 90,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    transition: 'transform 0.2s, background 0.2s',
  },
  reqBoxMax: {
    gridColumn: '1 / -1',
    display: 'flex',
    justifyContent: 'center',
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
  },
};

// Load troops modal styles
const LT = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 30, pointerEvents: 'all',
  },
  panel: {
    width: 680, maxWidth: '98vw', maxHeight: '90vh',
    background: '#ebdaba',
    border: '4px solid #377d9f',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 0 0 4px #ebdaba',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    height: 54, background: '#4ca5d2',
    borderBottom: '4px solid #377d9f',
  },
  headerTitle: { 
    fontSize: 24, fontStyle: 'italic', fontWeight: 900, color: '#fff', 
    textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.6)' 
  },
  closeBtn: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    width: 32, height: 32, background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: 4,
    color: '#1a3c4f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    fontSize: 20, fontWeight: 'bold'
  },
  loadedBar: {
    display: 'flex', gap: 6, padding: '12px 14px',
    justifyContent: 'center', background: 'rgba(0,0,0,0.06)', borderBottom: '2px solid rgba(0,0,0,0.06)',
  },
  loadedSlot: {
    width: 70, height: 90, borderRadius: 8,
    background: 'linear-gradient(180deg, #d4d2c8 0%, #a5a398 100%)', border: '1px solid #727068',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden', cursor: 'pointer',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.2)',
    transition: 'filter 0.1s',
  },
  loadedSlotImg: { 
    width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transformOrigin: 'top center',
  },
  loadedSlotActive: { border: '2px solid #E53935', filter: 'brightness(1.15)', transform: 'scale(1.05)', zIndex: 10 },
  emptySlot: {
    width: 70, height: 90, background: 'rgba(0,0,0,0.05)', border: '2px dashed #928d81', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#928d81', fontSize: 24, fontWeight: 900, cursor: 'pointer',
    transition: 'filter 0.1s',
  },
  grid: {
    display: 'flex', flexWrap: 'wrap', gap: 10,
    padding: '16px 20px', justifyContent: 'center',
    overflowY: 'auto', flex: 1,
  },
  troopCard: {
    width: 108, flexShrink: 0, aspectRatio: '3/4', borderRadius: 8,
    background: 'linear-gradient(180deg, #d4d2c8 0%, #a5a398 100%)', border: '1px solid #727068',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', position: 'relative', overflow: 'hidden',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.15)',
    transition: 'filter 0.1s', padding: 0,
  },
  troopLvlBadge: {
    position: 'absolute', top: 6, right: 8, zIndex: 10,
    fontSize: 16, fontStyle: 'italic', fontWeight: 900, color: '#fff', 
    textShadow: '0 2px 3px rgba(0,0,0,0.9), 0 -1px 2px rgba(0,0,0,1), 1px 0 2px rgba(0,0,0,1), -1px 0 2px rgba(0,0,0,1)',
  },
  troopImgWrap: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 16,
  },
  troopImg: {
    width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transformOrigin: 'top center',
  },
  bottomOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 34, background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.8) 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, zIndex: 10,
    padding: '0 4px',
  },
  bottomLabel: { 
    fontSize: 10, fontWeight: 900, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: 0.5,
  },
  costIcon: { width: 14, height: 14, objectFit: 'contain', filter: 'drop-shadow(0 1px 1px black)' },
  costText: { fontSize: 13, fontWeight: 900, color: '#FFD700', textShadow: '0 1px 2px rgba(0,0,0,0.8)' },
  swapBadge: {
    position: 'absolute', top: -2, right: -2,
    background: '#E53935', color: '#fff', fontSize: 10, fontWeight: 900,
    padding: '2px 5px', borderRadius: 4, lineHeight: 1, boxShadow: '0 2px 4px rgba(0,0,0,0.4)', zIndex: 20
  },
  swapHint: {
    textAlign: 'center', padding: '10px 16px', fontSize: 14, fontWeight: 900, color: '#E53935',
    background: 'transparent',
  },
};
