import { useState, memo, useCallback, useMemo } from 'react';
import { useSend, useBuilding, usePlayer } from '../hooks/useGodot';

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

const TABS = [
  { id: 'Economy', label: 'Economy' },
  { id: 'Defense', label: 'Defense' },
];

const DESC_MAP = {
  mine: 'Produces ore',
  sawmill: 'Produces wood',
  barn: 'Trains troops',
  port: 'Deploy ships to attack',
  town_hall: 'Main building',
  turret: 'Shoots enemies',
  tombstone: 'Spawns skeletons',
  archtower: 'Ranged defense',
  archer_tower: 'Ranged defense',
  archertower: 'Ranged defense',
};

const CATEGORY_MAP = {
  mine: 'Economy',
  sawmill: 'Economy',
  barn: 'Economy',
  turret: 'Defense',
  tombstone: 'Defense',
  archtower: 'Defense',
  archer_tower: 'Defense',
  archertower: 'Defense',
  port: 'Economy',
  town_hall: 'Economy',
};

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

const THUMBNAIL_SCALE_MAP = {
  port: 1.5,
  tombstone: 1.4,
  archtower: 1.4,
  archer_tower: 1.4,
  archertower: 1.4,
};

const getCategory = (id) => CATEGORY_MAP[id] || 'Economy';

const RES_ICONS = {
  gold: goldIcon,
  wood: woodIcon,
  ore: stoneIcon,
};

const tabBase = {
  padding: '0 24px',
  fontSize: 16,
  fontWeight: 800,
  fontFamily: '"Inter", "Segoe UI", sans-serif',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.1s',
  outline: 'none',
  border: 'none',
  borderBottom: 'none',
  borderRadius: '12px 12px 0 0',
  borderLeft: '2px solid transparent',
  borderRight: '2px solid transparent',
  borderTop: '2px solid transparent',
};

const TAB_STYLE_ACTIVE = {
  ...tabBase,
  background: '#e8dfc8',
  color: '#222',
  borderColor: '#d4c8b0',
  marginBottom: -6,
  height: 56,
  zIndex: 20,
};

const TAB_STYLE_INACTIVE = {
  ...tabBase,
  background: '#a2b4bd',
  color: '#fff',
  borderColor: '#8a9ea8',
  marginBottom: 0,
  height: 52,
  zIndex: 10,
  boxShadow: 'inset 0 -4px 10px rgba(0,0,0,0.05)',
};

const TAB_CONTENT_ACTIVE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  textShadow: '0 1px 0 rgba(255,255,255,0.5)',
};

const TAB_CONTENT_INACTIVE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
};

const stopPropagation = (e) => e.stopPropagation();

function ShopPanel({ onClose }) {
  const { sendToGodot } = useSend();
  const { buildingDefs } = useBuilding();
  const { playerState } = usePlayer();

  const [activeTab, setActiveTab] = useState('Economy');
  const buildings = buildingDefs?.buildings || {};
  const placedCounts = buildingDefs?.placed_counts || {};

  const filteredBuildings = useMemo(
    () => Object.entries(buildings).filter(([id, def]) => {
      if (id === 'barracks') return false;
      // Hide buildings that reached max_count (e.g. town_hall max 1)
      const maxCount = def.max_count || 0;
      if (maxCount > 0 && (placedCounts[id] || 0) >= maxCount) return false;
      return getCategory(id) === activeTab;
    }),
    [buildings, activeTab, placedCounts]
  );

  const handlePlacement = useCallback((id) => {
    sendToGodot('start_placement', { building_id: id });
  }, [sendToGodot]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={stopPropagation}>
        <div style={styles.tabArea}>
          <div style={styles.tabContainer}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  style={isActive ? TAB_STYLE_ACTIVE : TAB_STYLE_INACTIVE}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <div style={isActive ? TAB_CONTENT_ACTIVE : TAB_CONTENT_INACTIVE}>
                    {tab.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.cardArea}>
          <div style={styles.cardScroll}>
            {filteredBuildings.map(([id, def]) => (
              <div
                key={id}
                style={styles.card}
                onClick={() => handlePlacement(id)}
              >
                <div style={styles.cardImgTop}>
                  <div style={styles.iconHighlight} />
                  {THUMBNAIL_MAP[id] ? (
                    <img 
                      src={THUMBNAIL_MAP[id]} 
                      style={{
                        ...styles.thumbnail,
                        transform: `scale(${THUMBNAIL_SCALE_MAP[id] || 1})`
                      }} 
                      alt={def.name} 
                    />
                  ) : (
                    <div style={styles.placeholderBox}>🏠</div>
                  )}
                </div>

                <div style={styles.cardInfo}>
                  <div style={styles.cardName}>{def.name}</div>
                  <div style={styles.cardDesc}>{DESC_MAP[id] || ''}</div>

                  <div style={styles.costContainer}>
                    <div style={styles.costRow}>
                      {Object.entries(def.cost || {}).map(([res, amount]) => (
                        amount > 0 && (
                          <div key={res} style={styles.costPill}>
                            <span style={styles.costValue}>{amount.toLocaleString()}</span>
                            <img src={RES_ICONS[res] || goldIcon} style={styles.resIconSmall} alt={res} />
                          </div>
                        )
                      ))}
                      {Object.keys(def.cost || {}).length === 0 && (
                        <span style={styles.freeText}>FREE</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button style={styles.closeBtn} onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>
  );
}

export default memo(ShopPanel);

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 1000,
    pointerEvents: 'all',
  },
  container: {
    width: '100%',
    maxWidth: 750,
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'visible',
    borderRadius: '24px 24px 0 0',
  },
  cardArea: {
    background: '#e8dfc8',
    borderTop: '6px solid #d4c8b0',
    padding: '20px 20px 10px 20px',
    minHeight: 'auto',
    overflowX: 'auto',
    display: 'flex',
    position: 'relative',
    zIndex: 10,
    boxShadow: '0 -10px 30px rgba(0,0,0,0.3)',
    borderRadius: '24px 24px 0 0',
  },
  cardScroll: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0 auto',
    gap: 12,
    paddingBottom: 20,
    position: 'relative',
    zIndex: 10,
  },
  card: {
    width: 160,
    height: 240,
    background: '#fdf8e7',
    borderRadius: 12,
    border: '3px solid #d4c8b0',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'pointer',
    overflow: 'hidden',
    boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
    transition: 'transform 0.1s',
  },
  cardImgTop: {
    height: 110,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 8,
  },
  iconHighlight: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    background: 'radial-gradient(circle at center, rgba(255,255,255,0.6) 0%, transparent 60%)',
    zIndex: 0,
  },
  thumbnail: {
    width: 110,
    height: 110,
    objectFit: 'contain',
    zIndex: 1,
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))',
  },
  placeholderBox: {
    fontSize: 44,
    zIndex: 1,
    filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.3))',
  },
  cardInfo: {
    padding: '4px 8px 8px 8px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    textAlign: 'center',
  },
  cardName: {
    fontSize: 15,
    fontWeight: 800,
    color: '#333',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    marginBottom: 2,
    lineHeight: 1.1,
  },
  cardDesc: {
    fontSize: 11,
    color: '#777',
    fontWeight: 600,
    lineHeight: 1.2,
  },
  costContainer: {
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  costRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 4,
  },
  costPill: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  resIconSmall: {
    width: 32,
    height: 32,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
  },
  costValue: {
    fontSize: 16,
    fontWeight: 800,
    color: '#333',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  freeText: {
    fontSize: 20,
    fontWeight: 900,
    color: '#4CAF50',
    textShadow: '0 1px 1px #fff',
  },
  tabArea: {
    background: 'transparent',
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 0,
    position: 'relative',
    zIndex: 20,
    paddingBottom: 0,
    paddingTop: 16,
  },
  tabContainer: {
    display: 'flex',
    gap: 4,
  },
  closeBtn: {
    position: 'absolute',
    top: -14,
    right: -14,
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#E53935',
    border: '3px solid #fff',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    zIndex: 100,
    padding: 0,
  },
};
