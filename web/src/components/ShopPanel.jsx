import React, { useState } from 'react';
import { colors } from '../styles/theme';

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
            {filteredBuildings.map(([id, def]) => (
              <div key={id} style={styles.card} onClick={() => sendToGodot('start_placement', { building_id: id })}>
                {/* Image Placeholder */}
                <div style={styles.cardImgPlaceholder}>
                  <div style={styles.placeholderBox}>
                    {id.includes('cannon') ? '💣' : id.includes('mine') ? '⛏️' : '🏠'}
                  </div>
                </div>

                {/* Info Area */}
                <div style={styles.cardInfo}>
                  <div style={styles.cardName}>{def.name}</div>
                  <div style={styles.cardDesc}>
                    {def.description || (id.includes('mine') ? 'Produces resources' : 'Essential building')}
                  </div>
                  
                  {/* Cost */}
                  <div style={styles.costRow}>
                    {Object.entries(def.cost || {}).map(([res, amount]) => (
                      amount > 0 && (
                        <div key={res} style={styles.costPill}>
                          <img src={RES_ICONS[res] || goldIcon} style={styles.resIconSmall} alt={res} />
                          <span style={styles.costValue}>{amount.toLocaleString()}</span>
                        </div>
                      )
                    ))}
                    {Object.keys(def.cost || {}).length === 0 && (
                      <span style={{ color: '#4CAF50', fontWeight: 900, textShadow: '0 1px 0 #fff' }}>FREE</span>
                    )}
                  </div>

                  {/* Footer stats */}
                  <div style={styles.cardFooter}>
                    <div style={styles.cardStat}>Build time: <span>3s</span></div>
                    <div style={styles.cardStat}>Built: <span>0 / 1</span></div>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Locked Placeholders to match reference style */}
            {activeTab === 'Economy' && filteredBuildings.length < 5 && [3, 4].map(level => (
              <div key={`locked-${level}`} style={{ ...styles.card, opacity: 0.8, filter: 'grayscale(0.4)', background: '#E0E0E0' }}>
                <div style={{ ...styles.cardImgPlaceholder, filter: 'grayscale(1)' }}>
                  <div style={{ ...styles.placeholderBox, opacity: 0.2 }}>🔒</div>
                </div>
                <div style={styles.cardInfo}>
                  <div style={{ ...styles.cardName, color: '#757575' }}>Locked</div>
                  <div style={{ ...styles.cardDesc, color: '#9E9E9E' }}>Upgrade Headquarters to unlock more!</div>
                  <div style={styles.lockedHint}>Upgrade HQ to Level {level}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Tabs at the Bottom */}
        <div style={styles.tabBar}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                style={{
                  ...styles.tab,
                  background: isActive 
                    ? 'linear-gradient(180deg, #64B5F6 0%, #1E88E5 100%)' 
                    : 'linear-gradient(180deg, #78909C 0%, #546E7A 100%)',
                  boxShadow: isActive 
                    ? 'inset 0 4px 0 rgba(255,255,255,0.2), inset 0 -4px 0 rgba(0,0,0,0.2), 0 4px 0 #0D47A1' 
                    : 'inset 0 4px 0 rgba(255,255,255,0.1), inset 0 -4px 0 rgba(0,0,0,0.1), 0 4px 0 #263238',
                  zIndex: isActive ? 2 : 1,
                }}
                onClick={() => setActiveTab(tab.id)}
              >
                <div style={{ ...styles.tabLabel, textShadow: isActive ? '0 2px 2px rgba(0,0,0,0.6)' : '0 1px 2px rgba(0,0,0,0.4)' }}>
                  {tab.label}
                </div>
                {tab.badge && (
                  <div style={styles.tabBadge}>{tab.badge}</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Close Button on top right of container */}
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)', // Slightly darker
    display: 'flex',
    alignItems: 'flex-end', // Anchor to bottom
    justifyContent: 'center',
    zIndex: 100,
    pointerEvents: 'all',
  },
  container: {
    width: '98vw',
    maxWidth: 1200,
    background: '#F2F2F2', // Clean off-white
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    border: '4px solid #DFDFDF',
    borderBottom: 'none',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    boxShadow: '0 -15px 50px rgba(0,0,0,0.3)',
    marginBottom: 0,
    overflow: 'visible',
  },
  cardArea: {
    padding: '40px 30px 50px 30px',
    minHeight: 340,
    overflowX: 'auto',
    display: 'flex',
  },
  cardScroll: {
    display: 'flex',
    gap: 20,
    paddingRight: 50,
  },
  card: {
    minWidth: 210,
    width: 210,
    background: '#FFFEEF', // Warm white
    borderRadius: 20,
    border: '3px solid #E0DBC5',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'pointer',
    overflow: 'hidden',
    boxShadow: '0 8px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.05)',
    transition: 'transform 0.1s, box-shadow 0.1s',
  },
  cardImgPlaceholder: {
    height: 130,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.05))',
  },
  placeholderBox: {
    width: 90,
    height: 90,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 48,
    filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.15))',
  },
  cardInfo: {
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  cardName: {
    fontSize: 19,
    fontWeight: 900,
    textAlign: 'center',
    color: '#3E2723',
    marginBottom: 6,
    letterSpacing: '-0.3px',
  },
  cardDesc: {
    fontSize: 14,
    color: '#6D4C41',
    textAlign: 'center',
    minHeight: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1.15,
    marginBottom: 16,
    fontWeight: 600,
  },
  costRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  costPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#FFF9C4', // Pill background like reference
    padding: '4px 12px',
    borderRadius: 20,
    border: '1px solid #FFF176',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  resIconSmall: {
    width: 22,
    height: 22,
    objectFit: 'contain',
  },
  costValue: {
    fontSize: 15,
    fontWeight: 800,
    color: '#3E2723',
  },
  cardFooter: {
    marginTop: 'auto',
    borderTop: '1.5px solid rgba(0,0,0,0.06)',
    paddingTop: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  cardStat: {
    fontSize: 12,
    color: '#8D6E63',
    display: 'flex',
    justifyContent: 'space-between',
    fontWeight: 700,
  },
  lockedHint: {
    marginTop: 'auto',
    background: 'rgba(0,0,0,0.1)',
    padding: '8px',
    borderRadius: 12,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: 800,
    color: '#757575',
  },
  tabBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: 2,
    background: '#455A64',
    height: 64,
  },
  tab: {
    flex: 1,
    maxWidth: 220,
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    cursor: 'pointer',
    color: '#fff',
    transition: 'transform 0.1s',
    outline: 'none',
  },
  tabLabel: {
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: '0.5px',
  },
  tabBadge: {
    position: 'absolute',
    top: 12,
    right: '15%',
    width: 24,
    height: 24,
    borderRadius: 12,
    background: '#F44336',
    border: '2px solid #fff',
    color: '#fff',
    fontSize: 13,
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
  },
  closeBtn: {
    position: 'absolute',
    top: -24,
    right: 12,
    width: 54,
    height: 54,
    borderRadius: 27,
    background: 'linear-gradient(180deg, #F06292 0%, #D81B60 100%)',
    border: '4px solid #fff',
    color: '#fff',
    fontSize: 26,
    fontWeight: 900,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
    zIndex: 110,
  },
};
