import React, { useState } from 'react';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const TABS = [
  { id: 'Economy', label: 'Economy', color: '#FFD600', badge: 3 },
  { id: 'Defense', label: 'Defense', color: '#D50000' },
  { id: 'Support', label: 'Support', color: '#01579B', badge: 1 },
];

const CATEGORY_MAP = {
  gold_mine: 'Economy',
  sawmill: 'Economy',
  quarry: 'Economy',
  storage_gold: 'Economy',
  storage_wood: 'Economy',
  storage_stone: 'Economy',
  vault: 'Economy',
  cannon: 'Defense',
  sniper_tower: 'Defense',
  mortar: 'Defense',
  machine_gun: 'Defense',
  rocket_launcher: 'Defense',
  headquarters: 'Support',
  hq: 'Support',
  landing_craft: 'Support',
  radar: 'Support',
  armory: 'Support',
};

const getCategory = (id) => {
  if (CATEGORY_MAP[id]) return CATEGORY_MAP[id];
  if (id.includes('mine') || id.includes('storage') || id.includes('quarry') || id.includes('sawmill')) return 'Economy';
  if (id.includes('tower') || id.includes('cannon') || id.includes('mortar') || id.includes('gun')) return 'Defense';
  return 'Support';
};

const RES_ICONS = {
  gold: goldIcon,
  wood: woodIcon,
  ore: stoneIcon,
};

const WoodIcon = () => (
  <div style={{ position: 'relative', width: 28, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))' }}>
    <div style={{ position: 'absolute', width: 24, height: 6, background: '#a05a2c', borderRadius: 2, transform: 'rotate(-15deg) translateY(-4px)', border: '1.5px solid #5c3012' }}></div>
    <div style={{ position: 'absolute', width: 24, height: 6, background: '#b86b35', borderRadius: 2, transform: 'rotate(10deg) translateY(2px)', border: '1.5px solid #5c3012' }}></div>
    <div style={{ position: 'absolute', width: 24, height: 6, background: '#c97a3f', borderRadius: 2, border: '1.5px solid #5c3012', zIndex: 10 }}></div>
  </div>
);

export default function ShopPanel({ buildingDefs, sendToGodot, onClose }) {
  const [activeTab, setActiveTab] = useState('Economy');
  const buildings = buildingDefs?.buildings || {};

  const filteredBuildings = Object.entries(buildings).filter(([id]) => getCategory(id) === activeTab);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={e => e.stopPropagation()}>
        {/* Buildings Grid / Scroll Area */}
        <div style={styles.cardArea}>
          <div style={styles.cardScroll}>
            {filteredBuildings.map(([id, def]) => {
              const isLocked = false; 
              return (
                <div 
                  key={id} 
                  style={styles.card} 
                  onClick={() => !isLocked && sendToGodot('start_placement', { building_id: id })}
                >
                  <div style={styles.cardImgTop}>
                    <div style={styles.iconHighlight}></div>
                    <div style={styles.placeholderBox}>
                      {id.includes('cannon') ? '💣' : id.includes('mine') ? '⛏️' : '🏠'}
                    </div>
                  </div>

                  <div style={styles.cardInfo}>
                    <div style={styles.cardName}>{def.name}</div>
                    <div style={styles.cardDesc}>
                      {def.description || (id.includes('mine') ? 'Produces resources' : 'Essential building')}
                    </div>
                    
                    <div style={styles.costContainer}>
                      <div style={styles.costRow}>
                        {Object.entries(def.cost || {}).map(([res, amount]) => (
                          amount > 0 && (
                            <div key={res} style={styles.costPill}>
                              {res === 'wood' ? <WoodIcon /> : <img src={RES_ICONS[res] || goldIcon} style={styles.resIconSmall} alt={res} />}
                              <span style={styles.costValue}>{amount.toLocaleString()}</span>
                            </div>
                          )
                        ))}
                        {Object.keys(def.cost || {}).length === 0 && (
                          <span style={styles.freeText}>FREE</span>
                        )}
                      </div>
                      
                      <div style={styles.cardFooter}>
                        <div style={styles.cardStat}>
                          <div style={styles.statLabel}>Build time:</div>
                          <div style={styles.statVal}>3s</div>
                        </div>
                        <div style={{ ...styles.cardStat, textAlign: 'right' }}>
                          <div style={styles.statLabel}>Built:</div>
                          <div style={styles.statVal}>0/1</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {activeTab === 'Economy' && filteredBuildings.length < 5 && [3, 4].map(level => (
              <div key={`locked-${level}`} style={styles.lockedCard}>
                <div style={{ ...styles.cardImgTop, opacity: 0.5, filter: 'grayscale(1)' }}>
                  <div style={styles.placeholderBox}>🔒</div>
                </div>
                <div style={styles.cardInfo}>
                  <div style={{ ...styles.cardName, color: '#757575', WebkitTextStroke: '0.5px #999' }}>Locked</div>
                  <div style={{ ...styles.cardDesc, color: '#9E9E9E' }}>Upgrade HQ level {level} to unlock more!</div>
                  <div style={styles.lockMessage}>
                    Upgrade Headquarters to level {level} to build more!
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Tabs area */}
        <div style={styles.tabArea}>
          <div style={styles.tabContainer}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  style={{
                    ...styles.tab,
                    background: isActive ? '#fdf8e7' : '#78909C',
                    color: isActive ? '#333' : '#fff',
                    marginTop: isActive ? -4 : 0,
                    height: isActive ? 56 : 52,
                    zIndex: isActive ? 20 : 10,
                    borderBottom: 'none',
                    boxShadow: isActive ? '0 4px 4px rgba(0,0,0,0.2)' : 'none',
                    borderRadius: '0 0 12px 12px',
                    borderColor: '#d4c8b0',
                    borderLeft: '2px solid',
                    borderRight: '2px solid',
                  }}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <div style={{ 
                    ...styles.tabContent,
                    textShadow: isActive ? 'none' : '0px 1px 2px rgba(0,0,0,0.6)',
                    WebkitTextStroke: isActive ? 'none' : '0.5px #455A64',
                  }}>
                    {tab.label}
                    {tab.badge && (
                      <div style={styles.tabBadge}>{tab.badge}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Close Button */}
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

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
    background: 'transparent', // NO BACKGROUND for container
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
  lockedCard: {
    width: 170,
    height: 250,
    background: '#e6e1d6',
    borderRadius: 12,
    border: '3px solid #a39e93',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
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
  cardFooter: {
    borderTop: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0 4px',
  },
  cardStat: {
    display: 'flex',
    flexDirection: 'column',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: 800,
    color: '#666',
    textTransform: 'uppercase',
  },
  statVal: {
    fontSize: 10,
    fontWeight: 900,
    color: '#333',
  },
  lockMessage: {
    background: '#8b8276',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    padding: '8px 4px',
    height: 70,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 3px 5px rgba(0,0,0,0.15)',
    borderTop: '3px solid #7a7266',
    marginTop: 'auto',
    margin: '0 -8px -8px -8px',
  },
  tabArea: {
    background: 'transparent', // Transparent background
    display: 'flex',
    justifyContent: 'center',
    marginTop: -4,
    position: 'relative',
    zIndex: 20,
    paddingBottom: 0, // NO PADDING at all
  },
  tabContainer: {
    display: 'flex',
    gap: 4,
  },
  tab: {
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
  },
  tabContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  tabBadge: {
    background: '#e33b2e',
    color: '#fff',
    fontSize: 10,
    fontWeight: 900,
    width: 18,
    height: 18,
    borderRadius: 9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #8a1c14',
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
