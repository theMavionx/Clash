import { useState, memo, useCallback, useMemo } from 'react';
import { useSend, useBuilding } from '../hooks/useGodot';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

import imgMine from '../assets/buildings/mine.png';
import imgBarn from '../assets/buildings/barn.png';
import imgPort from '../assets/buildings/port.png';
import imgSawmill from '../assets/buildings/sawmill.png';
import imgBarracks from '../assets/buildings/barracks.png';
import imgTownHall from '../assets/buildings/town_hall.png';
import imgTurret from '../assets/buildings/turret.png';

const TABS = [
  { id: 'Economy', label: 'Economy' },
  { id: 'Defense', label: 'Defense' },
  { id: 'Support', label: 'Support' },
];

const CATEGORY_MAP = {
  mine: 'Economy',
  sawmill: 'Economy',
  barn: 'Economy',
  turret: 'Defense',
  port: 'Support',
  barracks: 'Support',
  town_hall: 'Support',
};

const THUMBNAIL_MAP = {
  mine: imgMine,
  barn: imgBarn,
  port: imgPort,
  sawmill: imgSawmill,
  barracks: imgBarracks,
  town_hall: imgTownHall,
  turret: imgTurret,
};

const getCategory = (id) => CATEGORY_MAP[id] || 'Support';

const RES_ICONS = {
  gold: goldIcon,
  wood: woodIcon,
  ore: stoneIcon,
};

const tabBase = {
  padding: '0 24px',
  fontSize: 15,
  fontWeight: 900,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.1s',
  outline: 'none',
  border: 'none',
  borderBottom: 'none',
  borderRadius: '0 0 12px 12px',
  borderColor: '#d4c8b0',
  borderLeft: '2px solid',
  borderRight: '2px solid',
};

const TAB_STYLE_ACTIVE = {
  ...tabBase,
  background: '#fdf8e7',
  color: '#333',
  marginTop: -4,
  height: 56,
  zIndex: 20,
  boxShadow: '0 4px 4px rgba(0,0,0,0.2)',
};

const TAB_STYLE_INACTIVE = {
  ...tabBase,
  background: '#78909C',
  color: '#fff',
  marginTop: 0,
  height: 52,
  zIndex: 10,
  boxShadow: 'none',
};

const TAB_CONTENT_ACTIVE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  textShadow: 'none',
  WebkitTextStroke: 'none',
};

const TAB_CONTENT_INACTIVE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  textShadow: '0px 1px 2px rgba(0,0,0,0.6)',
  WebkitTextStroke: '0.5px #455A64',
};

const stopPropagation = (e) => e.stopPropagation();

function WoodIcon() {
  return (
    <div style={woodIconStyles.wrap}>
      <div style={woodIconStyles.log1} />
      <div style={woodIconStyles.log2} />
      <div style={woodIconStyles.log3} />
    </div>
  );
}
const MemoWoodIcon = memo(WoodIcon);

const woodIconStyles = {
  wrap: { position: 'relative', width: 28, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))' },
  log1: { position: 'absolute', width: 24, height: 6, background: '#a05a2c', borderRadius: 2, transform: 'rotate(-15deg) translateY(-4px)', border: '1.5px solid #5c3012' },
  log2: { position: 'absolute', width: 24, height: 6, background: '#b86b35', borderRadius: 2, transform: 'rotate(10deg) translateY(2px)', border: '1.5px solid #5c3012' },
  log3: { position: 'absolute', width: 24, height: 6, background: '#c97a3f', borderRadius: 2, border: '1.5px solid #5c3012', zIndex: 10 },
};

function ShopPanel({ onClose }) {
  const { sendToGodot } = useSend();
  const { buildingDefs } = useBuilding();

  const [activeTab, setActiveTab] = useState('Economy');
  const buildings = buildingDefs?.buildings || {};

  const filteredBuildings = useMemo(
    () => Object.entries(buildings).filter(([id]) => getCategory(id) === activeTab),
    [buildings, activeTab]
  );

  const handlePlacement = useCallback((id) => {
    sendToGodot('start_placement', { building_id: id });
  }, [sendToGodot]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={stopPropagation}>
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
                    <img src={THUMBNAIL_MAP[id]} style={styles.thumbnail} alt={def.name} />
                  ) : (
                    <div style={styles.placeholderBox}>🏠</div>
                  )}
                </div>

                <div style={styles.cardInfo}>
                  <div style={styles.cardName}>{def.name}</div>
                  <div style={styles.cardDesc}>{def.description || ''}</div>

                  <div style={styles.costContainer}>
                    <div style={styles.costRow}>
                      {Object.entries(def.cost || {}).map(([res, amount]) => (
                        amount > 0 && (
                          <div key={res} style={styles.costPill}>
                            {res === 'wood' ? <MemoWoodIcon /> : <img src={RES_ICONS[res] || goldIcon} style={styles.resIconSmall} alt={res} />}
                            <span style={styles.costValue}>{amount.toLocaleString()}</span>
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

        <button style={styles.closeBtn} onClick={onClose}>✕</button>
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
    maxWidth: 1200,
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
    padding: '30px 20px 10px 20px',
    minHeight: 350,
    overflowX: 'auto',
    display: 'flex',
    position: 'relative',
    zIndex: 10,
    boxShadow: '0 -10px 30px rgba(0,0,0,0.3)',
    borderRadius: '24px 24px 0 0',
  },
  cardScroll: {
    display: 'flex',
    gap: 12,
    paddingBottom: 20,
    position: 'relative',
    zIndex: 10,
  },
  card: {
    width: 170,
    height: 250,
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
    width: 100,
    height: 100,
    objectFit: 'contain',
    zIndex: 1,
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))',
  },
  placeholderBox: {
    fontSize: 56,
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
    fontSize: 18,
    fontWeight: 900,
    color: '#333',
    WebkitTextStroke: '1px white',
    textShadow: '0px 2px 2px rgba(0,0,0,0.2)',
    fontFamily: '"Arial Black", Impact, sans-serif',
    marginBottom: 2,
    lineHeight: 1.1,
  },
  cardDesc: {
    fontSize: 11,
    fontWeight: 700,
    color: '#444',
    lineHeight: 1.1,
    marginBottom: 8,
    minHeight: 24,
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
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  costPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  resIconSmall: {
    width: 24,
    height: 18,
    objectFit: 'contain',
  },
  costValue: {
    fontSize: 22,
    fontWeight: 900,
    color: '#333',
    textShadow: '0 1px 1px rgba(255,255,255,0.8)',
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
    marginTop: -4,
    position: 'relative',
    zIndex: 20,
    paddingBottom: 0,
  },
  tabContainer: {
    display: 'flex',
    gap: 4,
  },
  closeBtn: {
    position: 'absolute',
    top: -24,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    background: 'linear-gradient(180deg, #EC407A 0%, #D81B60 100%)',
    border: '4px solid #fff',
    color: '#fff',
    fontSize: 28,
    fontWeight: 900,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
    zIndex: 100,
  },
};
