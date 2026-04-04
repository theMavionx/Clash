import { memo, useCallback, useState, useEffect } from 'react';
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
  
  const [view, setView] = useState('ACTIONS'); // ACTIONS, INFO, UPGRADE

  useEffect(() => {
    setView('ACTIONS');
  }, [building?.id]);

  const handleDeselect = useCallback(() => sendToGodot('deselect_building'), [sendToGodot]);
  const handleUpgrade = useCallback(() => {
    sendToGodot('upgrade_building');
    setView('ACTIONS'); // Close after upgrading
  }, [sendToGodot]);

  if (!building || building.is_barracks) return null;

  const isMaxLevel = building.level >= building.max_level;
  
  // Calculate mock upgrade stats based on 20% increase
  const upgHealth = Math.floor(building.max_hp * 0.2);

  const renderActions = () => (
    <div style={styles.actionsWrap}>
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

      {building.id === 'barn' && !building.is_enemy && (
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
          onClick={() => { sendToGodot('buy_ship'); setView('ACTIONS'); }}
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

      {!building.is_enemy && !isMaxLevel && (
        <button 
          style={{ ...styles.circleBtn, ...styles.btnUpgrade }} 
          onClick={() => setView('UPGRADE')}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      )}
    </div>
  );

  const renderInfo = () => (
    <div style={styles.modalOverlay} onClick={handleDeselect}>
      <div style={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>{building.name}</div>
          <button style={styles.closeBtn} onClick={handleDeselect}>✕</button>
        </div>
        
        <div style={styles.body}>
          <div style={styles.bodyTop}>
            <div style={styles.imageContainer}>
              <div style={styles.imageBg} />
              {THUMBNAIL_MAP[building.id] ? (
                <img src={THUMBNAIL_MAP[building.id]} alt={building.name} style={styles.image} />
              ) : (
                <div style={styles.placeholderImage}>🏠</div>
              )}
            </div>

            <div style={styles.statsContainer}>
              <div style={styles.statLevel}>Level {building.level}</div>
              
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Health</span>
                <span style={styles.statIcon}>❤️</span>
                <span style={styles.statValue}>{building.max_hp}</span>
              </div>
            </div>
          </div>

          <div style={styles.description}>
            {DESC_MAP[building.id] || "This is a key building in your village."}
          </div>
        </div>
      </div>
    </div>
  );

  const renderUpgrade = () => (
    <div style={styles.modalOverlay} onClick={handleDeselect}>
      <div style={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>UPGRADE {building.name} TO LEVEL {building.level + 1}</div>
          <button style={styles.closeBtn} onClick={handleDeselect}>✕</button>
        </div>
        
        <div style={styles.body}>
          <div style={styles.bodyTop}>
            <div style={styles.imageContainer}>
              <div style={styles.imageBg} />
              {THUMBNAIL_MAP[building.id] ? (
                <img src={THUMBNAIL_MAP[building.id]} alt={building.name} style={styles.image} />
              ) : (
                <div style={styles.placeholderImage}>🏠</div>
              )}
            </div>

            <div style={styles.statsContainer}>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Health</span>
                <span style={styles.statIcon}>❤️</span>
                <span style={styles.statValue}>{building.max_hp}</span>
                <span style={styles.statArrow}>▶</span>
                <span style={styles.statUpgrade}>{building.max_hp + upgHealth}</span>
              </div>
              <div style={styles.statRow}>
                <span style={styles.statLabel}>Level</span>
                <span style={styles.statIcon}>⭐</span>
                <span style={styles.statValue}>{building.level}</span>
                <span style={styles.statArrow}>▶</span>
                <span style={styles.statUpgrade}>{building.level + 1}</span>
              </div>
            </div>
          </div>

          <div style={styles.upgradeBottom}>
            <div style={styles.costArea}>
              <div style={styles.costDesc}>Upgrade cost</div>
              <div style={styles.costButtons}>
                {Object.entries(building.upgrade_cost || {}).map(([res, amount]) => (
                  <div key={res} style={styles.costBadge}>
                    <img src={ICONS[res]} alt={res} style={styles.costIcon} />
                    <span style={styles.costAmount}>{amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <button 
                style={styles.bigUpgradeBtn} 
                onClick={handleUpgrade} 
                onMouseOver={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseOut={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
                onMouseDown={e => e.currentTarget.style.transform = 'translateY(4px)'}
                onMouseUp={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            >
              <div style={styles.bigUpgradeText}>Upgrade</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {view === 'ACTIONS' && renderActions()}
      {view === 'INFO' && renderInfo()}
      {view === 'UPGRADE' && renderUpgrade()}
    </>
  );
}

export default memo(BuildingInfoPanel);

const styles = {
  // ACTIONS VIEW
  actionsWrap: {
    position: 'fixed',
    bottom: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 32,
    zIndex: 10,
    pointerEvents: 'none', // letting clicks pass through the gap
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
    background: 'linear-gradient(180deg, #44a8ff, #1976d2)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
  },
  btnUpgrade: {
    background: 'linear-gradient(180deg, #6fdc73, #388e3c)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
  },
  btnTroops: {
    background: 'linear-gradient(180deg, #ffca28, #f57f17)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
  },
  iconLarge: {
    fontFamily: '"Times New Roman", Times, serif',
    fontSize: 48,
    fontWeight: 'bold',
    fontStyle: 'italic',
    lineHeight: 1,
  },

  // MODAL VIEW
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    pointerEvents: 'all',
  },
  modalContainer: {
    width: 440,
    maxWidth: '90%',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
    borderRadius: 8,
    border: '2px solid rgba(0,0,0,0.8)',
    overflow: 'hidden',
  },
  header: {
    background: 'linear-gradient(180deg, #5fb4d1, #2b6c8a)',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderBottom: '4px solid #1c4b63',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 900,
    fontFamily: '"Impact", "Arial Black", sans-serif',
    fontStyle: 'italic',
    letterSpacing: '1px',
    textShadow: '2px 2px 0 #1b495d, -1px -1px 0 #1b495d, 1px -1px 0 #1b495d, -1px 1px 0 #1b495d, 0 4px 4px rgba(0,0,0,0.6)',
    textTransform: 'uppercase',
  },
  closeBtn: {
    position: 'absolute',
    right: 12,
    fontSize: 28,
    fontWeight: 900,
    color: '#a1cce0',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textShadow: '0 -1px 0 rgba(0,0,0,0.4)',
    outline: 'none',
    lineHeight: 1,
  },
  body: {
    background: '#eedebe',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    borderTop: '2px solid #fff',
  },
  bodyTop: {
    display: 'flex',
    gap: 24,
    alignItems: 'center',
  },
  imageContainer: {
    position: 'relative',
    width: 140,
    height: 140,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBg: {
    position: 'absolute',
    inset: 10,
    background: 'rgba(0,0,0,0.1)',
    borderRadius: '50%',
    filter: 'blur(10px)',
  },
  image: {
    position: 'relative',
    zIndex: 2,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 10px 10px rgba(0,0,0,0.4))',
  },
  placeholderImage: {
    position: 'relative',
    zIndex: 2,
    fontSize: 64,
  },

  statsContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  statLevel: {
    fontSize: 18,
    fontWeight: 900,
    color: '#6e5436',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 17,
    fontWeight: 900,
    color: '#444',
  },
  statLabel: {
    width: 70,
    textAlign: 'left',
    color: '#8b7054',
  },
  statIcon: {
    width: 24,
    textAlign: 'center',
  },
  statValue: {
    color: '#5a4225',
  },
  statArrow: {
    color: '#8b7054',
    fontSize: 14,
    margin: '0 4px',
  },
  statUpgrade: {
    color: '#4CAF50',
    textShadow: '0 1px 1px rgba(255,255,255,0.8)',
  },

  description: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: 900,
    color: '#6e5436',
    paddingTop: 16,
    borderTop: '2px dashed rgba(110,84,54, 0.3)',
    textShadow: '0 1px 1px #fff',
  },

  upgradeBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTop: '2px dashed rgba(110,84,54, 0.3)',
    paddingTop: 20,
  },
  costArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  costDesc: {
    fontSize: 14,
    fontWeight: 900,
    color: '#6e5436',
    textTransform: 'uppercase',
  },
  costButtons: {
    display: 'flex',
    gap: 8,
  },
  costBadge: {
    background: '#8c8376',
    borderRadius: 6,
    padding: '6px 12px 6px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    border: '2px solid #5a544c',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  costIcon: {
    width: 20,
    height: 20,
    objectFit: 'contain',
  },
  costAmount: {
    color: '#fff',
    fontWeight: 900,
    fontSize: 16,
    textShadow: '0 1px 1px #000',
  },

  bigUpgradeBtn: {
    background: '#7bc944',
    border: '3px solid #f8f1de',
    borderRadius: 8,
    padding: '14px 28px',
    cursor: 'pointer',
    boxShadow: '0 6px 0 #4a8a25, 0 8px 12px rgba(0,0,0,0.4)',
    outline: 'none',
    minWidth: 150,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), filter 0.1s',
  },
  bigUpgradeText: {
    color: '#fff',
    fontWeight: 900,
    fontSize: 22,
    textTransform: 'uppercase',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
    letterSpacing: '1px',
    fontStyle: 'italic',
  },
};
