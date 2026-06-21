import { useState, memo, useCallback, useMemo } from 'react';
import { useSend, useBuildingDefs, usePlayer, useResources } from '../hooks/useGodot';
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
import imgMageTower from '../assets/buildings/magetower.png';
import imgAltar from '../assets/units/altar.png';

const ALTAR_PRICE_LABEL = '$15.00';

const TABS = [
  { id: 'Economy', label: 'Economy' },
  { id: 'Military', label: 'Military' },
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
  mage_tower: 'Casts splash magic at enemies',
  mortar: 'Long-range splash defense',
  altar: 'Onchain base boost',
};

const CATEGORY_MAP = {
  mine: 'Economy',
  sawmill: 'Economy',
  barn: 'Military',
  turret: 'Defense',
  tombstone: 'Defense',
  archtower: 'Defense',
  archer_tower: 'Defense',
  archertower: 'Defense',
  mage_tower: 'Defense',
  mortar: 'Defense',
  altar: 'Economy',
  port: 'Military',
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
  mage_tower: imgMageTower,
  mortar: imgTurret,
  storage: imgStorage,
  altar: imgAltar,
};

const THUMBNAIL_SCALE_MAP = {
  port: 1.5,
  tombstone: 1.4,
  archtower: 1.4,
  archer_tower: 1.4,
  archertower: 1.4,
  mage_tower: 1.2,
  mortar: 1.25,
  altar: 1.28,
};

const getCategory = (id) => CATEGORY_MAP[id] || 'Economy';

const RES_ICONS = {
  gold: goldIcon,
  wood: woodIcon,
  ore: stoneIcon,
};

const tabBase = {
  padding: '0 28px',
  fontSize: 16,
  fontWeight: 900,
  fontFamily: '"Inter", "Segoe UI", sans-serif',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
  outline: 'none',
  borderStyle: 'solid',
  borderWidth: '4px 4px 0',
  borderColor: 'transparent',
  borderRadius: '16px 16px 0 0',
};

const TAB_STYLE_ACTIVE = {
  ...tabBase,
  background: '#fdf8e7',
  color: '#5C3A21',
  borderColor: '#d4c8b0',
  marginBottom: -6,
  height: 56,
  zIndex: 20,
};

const TAB_STYLE_INACTIVE = {
  ...tabBase,
  background: '#d4c8b0',
  color: '#77573d',
  borderColor: '#bba882',
  marginBottom: 0,
  height: 50,
  zIndex: 10,
  boxShadow: 'inset 0 -4px 10px rgba(0,0,0,0.08)',
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
  const { buildingDefs } = useBuildingDefs();
  const playerState = usePlayer() || {};
  const resources = useResources();
  const { isMobile } = useLayout();

  const [activeTab, setActiveTab] = useState('Economy');
  const buildings = buildingDefs?.buildings || {};
  const placedCounts = buildingDefs?.placed_counts || {};
  const thLevel = buildingDefs?.th_level || 1;
  const thUnlock = buildingDefs?.th_unlock || {};
  const thMaxCounts = buildingDefs?.th_max_counts || {};
  const hasTownHall = (placedCounts.town_hall || 0) > 0;
  const buildingUnlocks = playerState?.building_unlocks || {};
  const shopEntitlements = playerState?.shop_entitlements || {};
  const isAltarUnlocked = !!(buildingUnlocks.altar || shopEntitlements.altar || playerState?.altar?.active);

  // Build list with status: available, maxed, locked, unaffordable
  const filteredBuildings = useMemo(
    () => Object.entries(buildings)
      .filter(([id]) => id !== 'flag' && id !== 'ruins' && getCategory(id) === activeTab)
      .map(([id, def]) => {
        const placed = placedCounts[id] || 0;
        const maxCount = thMaxCounts[id] ?? (def.max_count > 0 ? def.max_count : 99);
        const unlockAt = thUnlock[id];
        const needsTownHall = id !== 'town_hall' && !hasTownHall;
        // Require Town Hall first, then mine + sawmill before anything else.
        const hasMine = (placedCounts['mine'] || 0) > 0;
        const hasSawmill = (placedCounts['sawmill'] || 0) > 0;
        const needsBasics = !needsTownHall && id !== 'mine' && id !== 'sawmill' && id !== 'town_hall' && (!hasMine || !hasSawmill);
        const locked = needsTownHall || needsBasics || (unlockAt && thLevel < unlockAt);
        const maxed = maxCount < 99 && placed >= maxCount;
        const cost = def.cost || {};
        const canAfford = (resources.gold || 0) >= (cost.gold || 0) &&
                          (resources.wood || 0) >= (cost.wood || 0) &&
                          (resources.ore || 0) >= (cost.ore || 0);
        const requiresOnchain = id === 'altar' || !!def.requires_purchase;
        const onchainUnlocked = !requiresOnchain || isAltarUnlocked;
        const onchainLocked = requiresOnchain && !onchainUnlocked;
        const lockReason = onchainLocked
          ? 'Buy onchain first'
          : needsTownHall
            ? 'Build Town Hall first'
            : needsBasics
              ? 'Build Mine & Sawmill first'
              : (locked ? `Unlocks at TH ${unlockAt}` : null);
        return [id, def, { placed, maxCount, locked, maxed, canAfford, unlockAt, lockReason, requiresOnchain, onchainUnlocked, onchainLocked }];
      })
      .sort((a, b) => {
        if (a[0] === 'town_hall') return -1;
        if (b[0] === 'town_hall') return 1;
        // Available first, then maxed, then locked
        const sa = a[2].locked ? 2 : a[2].maxed ? 1 : 0;
        const sb = b[2].locked ? 2 : b[2].maxed ? 1 : 0;
        return sa - sb;
      }),
    [buildings, activeTab, placedCounts, thLevel, thUnlock, thMaxCounts, resources, hasTownHall, isAltarUnlocked]
  );

  const handleOpenOnchainShop = useCallback(() => {
    window.dispatchEvent(new CustomEvent('clash-open-nft-shop', {
      detail: { view: 'shop', product: 'altar' },
    }));
    onClose?.();
  }, [onClose]);

  const handlePlacement = useCallback((id) => {
    sendToGodot('start_placement', { building_id: id });
  }, [sendToGodot]);

  return (
    <>
      <style>{animCSS}</style>
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.container} onClick={stopPropagation}>
        <button
          style={{
            ...styles.closeBtn,
            top: isMobile ? 48 : 58,
            right: isMobile ? 10 : 18,
          }}
          onClick={onClose}
          aria-label="Close shop"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div style={styles.tabArea}>
          <div style={{ ...styles.tabContainer, gap: isMobile ? 2 : 4 }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              
              // Responsive tab adjustments
              const activeStyle = {
                ...TAB_STYLE_ACTIVE,
                padding: isMobile ? '0 12px' : '0 28px',
                fontSize: isMobile ? 14 : 16,
              };
              const inactiveStyle = {
                ...TAB_STYLE_INACTIVE,
                padding: isMobile ? '0 12px' : '0 28px',
                fontSize: isMobile ? 14 : 16,
              };

              return (
                <button
                  key={tab.id}
                  style={isActive ? activeStyle : inactiveStyle}
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

        <div style={styles.cardArea} className="grad-scrollbar">
          <div style={{ ...styles.cardScroll, padding: isMobile ? '16px' : '20px 24px' }}>
            {filteredBuildings.map(([id, def, status]) => {
              const disabled = !status.onchainLocked && (status.locked || status.maxed || !status.canAfford);
              const thumbnail = THUMBNAIL_MAP[id];
              return (
              <div
                key={id}
                style={{
                  ...styles.card,
                  ...(status.locked && !status.onchainLocked ? styles.cardLocked : {}),
                  ...(status.onchainLocked ? styles.cardOnchainLocked : {}),
                  ...(status.maxed ? styles.cardMaxed : {}),
                  ...(!status.canAfford && !status.locked && !status.maxed ? styles.cardUnaffordable : {}),
                }}
                onClick={() => {
                  if (status.onchainLocked) handleOpenOnchainShop();
                  else if (!disabled) handlePlacement(id);
                }}
              >
                {/* Count badge */}
                {!status.locked && status.maxCount < 99 && (
                  <div style={styles.countBadge}>
                    {status.placed}/{status.maxCount}
                  </div>
                )}

                {status.onchainLocked ? (
                  <>
                    <div style={{ ...styles.cardImgTop, ...styles.onchainCardImgTop }}>
                      <div style={styles.iconHighlight} />
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          style={{
                            ...styles.thumbnail,
                            ...styles.onchainThumbnail,
                            transform: `scale(${THUMBNAIL_SCALE_MAP[id] || 1})`,
                          }}
                          alt={def.name}
                        />
                      ) : (
                        <div style={styles.placeholderBox}>?</div>
                      )}
                    </div>

                    <div style={styles.cardInfo}>
                      <div style={styles.cardName}>{def.name}</div>
                      <div style={styles.cardDesc}>{DESC_MAP[id] || 'Unlock in Game Resources'}</div>
                      <div style={styles.onchainPrice}>{id === 'altar' ? ALTAR_PRICE_LABEL : 'Onchain'}</div>
                      <div style={styles.onchainCta}>Buy onchain</div>
                    </div>
                  </>
                ) : status.locked ? (
                  <div style={styles.lockOverlay}>
                    <span style={styles.lockIcon}>🔒</span>
                    <span style={styles.lockName}>{def.name}</span>
                    <span style={styles.lockText}>{status.lockReason || `Unlocks at TH ${status.unlockAt}`}</span>
                  </div>
                ) : (
                <>
                <div style={styles.cardImgTop}>
                  <div style={styles.iconHighlight} />
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      style={{
                        ...styles.thumbnail,
                        transform: `scale(${THUMBNAIL_SCALE_MAP[id] || 1})`,
                      }}
                      alt={def.name}
                    />
                  ) : (
                    <div style={styles.placeholderBox}>🏠</div>
                  )}
                </div>

                <div style={styles.cardInfo}>
                  <div style={styles.cardName}>{def.name}</div>
                  <div style={styles.cardDesc}>{status.maxed ? 'Max built' : DESC_MAP[id] || ''}</div>

                  <div style={styles.costContainer}>
                    <div style={styles.costRow}>
                      {Object.entries(def.cost || {}).map(([res, amount]) => (
                        amount > 0 && (
                          <div key={res} style={{
                            ...styles.costPill,
                            ...((resources[res] || 0) < amount ? { color: '#E53935' } : {}),
                          }}>
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
                </>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>
    </>
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
    padding: '16px 8px 10px 8px',
    minHeight: 'auto',
    overflowY: 'auto',
    maxHeight: '55vh',
    display: 'flex',
    position: 'relative',
    zIndex: 10,
    boxShadow: '0 -10px 30px rgba(0,0,0,0.3), inset 0 6px 10px rgba(0,0,0,0.05)',
    borderRadius: '24px 24px 0 0',
  },
  cardScroll: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    margin: '0 auto',
    gap: 12,
    paddingBottom: 20,
    position: 'relative',
    zIndex: 10,
    width: '100%',
  },
  card: {
    position: 'relative',
    width: 'clamp(110px, 40vw, 160px)',
    height: 'clamp(180px, 52vw, 240px)',
    background: '#fdf8e7',
    borderRadius: 14,
    border: '3px solid #d4c8b0',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'pointer',
    overflow: 'hidden',
    boxShadow: '0 6px 12px rgba(0,0,0,0.15), inset 0 -4px 0 rgba(0,0,0,0.05)',
    transition: 'transform 0.15s cubic-bezier(0.18, 0.89, 0.32, 1.28), box-shadow 0.1s',
    flexShrink: 0,
  },
  cardImgTop: {
    height: 'clamp(80px, 25vw, 110px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 6,
  },
  iconHighlight: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    background: 'radial-gradient(circle at center, rgba(255,255,255,0.6) 0%, transparent 60%)',
    zIndex: 0,
  },
  thumbnail: {
    width: 'clamp(70px, 22vw, 110px)',
    height: 'clamp(70px, 22vw, 110px)',
    objectFit: 'contain',
    zIndex: 1,
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))',
  },
  onchainCardImgTop: {
    height: 'clamp(104px, 30vw, 132px)',
    marginTop: 8,
  },
  onchainThumbnail: {
    width: 'clamp(88px, 27vw, 130px)',
    height: 'clamp(88px, 27vw, 130px)',
  },
  placeholderBox: {
    fontSize: 44,
    zIndex: 1,
    filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.3))',
  },
  cardLocked: {
    opacity: 0.4,
    filter: 'grayscale(1)',
    cursor: 'default',
    pointerEvents: 'none',
  },
  cardOnchainLocked: {
    opacity: 0.82,
    border: '3px solid #58b9d8',
    boxShadow: '0 0 0 2px rgba(86,216,255,0.22), 0 6px 12px rgba(0,0,0,0.15)',
    cursor: 'pointer',
  },
  cardMaxed: {
    opacity: 0.5,
    cursor: 'default',
    pointerEvents: 'none',
  },
  cardUnaffordable: {
    opacity: 0.6,
    filter: 'grayscale(0.5)',
    cursor: 'default',
    pointerEvents: 'none',
  },
  countBadge: {
    position: 'absolute', top: 6, right: 8, zIndex: 10,
    fontSize: 13, fontWeight: 900, color: '#5C3A21',
  },
  lockOverlay: {
    position: 'absolute', inset: 0, zIndex: 10,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 4, borderRadius: 14,
  },
  lockIcon: { fontSize: 32 },
  lockName: {
    fontSize: 14, fontWeight: 900, color: '#5C3A21', marginTop: 4,
  },
  lockText: {
    fontSize: 11, fontWeight: 700, color: '#a3906a',
  },
  onchainPrice: {
    marginTop: 'auto',
    fontSize: 'clamp(15px, 4vw, 18px)',
    fontWeight: 900,
    color: '#5C3A21',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    lineHeight: 1.1,
  },
  onchainCta: {
    margin: '5px auto 0',
    padding: '4px 10px',
    borderRadius: 8,
    background: '#58b9d8',
    color: '#fdf8e7',
    fontSize: 10,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0,
    boxShadow: '0 2px 0 #2f7f98',
  },
  cardInfo: {
    padding: '4px 8px 8px 8px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    textAlign: 'center',
  },
  cardName: {
    fontSize: 'clamp(13px, 3.5vw, 15px)',
    fontWeight: 800,
    color: '#333',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    marginBottom: 1,
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
    gap: 8,
    marginBottom: 2,
  },
  costPill: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  resIconSmall: {
    width: 'clamp(22px, 7vw, 32px)',
    height: 'clamp(22px, 7vw, 32px)',
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
  },
  costValue: {
    fontSize: 'clamp(12px, 3.5vw, 16px)',
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
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#E53935',
    border: '3px solid #fff',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 0 #a92826, 0 8px 14px rgba(0,0,0,0.28)',
    zIndex: 40,
    padding: 0,
  },
};

const animCSS = `
  /* Gradient Scrollbar Horizontal */
  .grad-scrollbar::-webkit-scrollbar { height: 10px; width: 10px; }
  .grad-scrollbar::-webkit-scrollbar-track { background: #fdf8e7; border-radius: 5px; margin: 10px; }
  .grad-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(90deg, #d4c8b0 0%, #bba882 100%); border-radius: 5px; border: 2px solid #fdf8e7; }
  .grad-scrollbar::-webkit-scrollbar-thumb:hover { background: linear-gradient(90deg, #bba882 0%, #a3906a 100%); }
  
  /* Hover active state for building card */
  .grad-scrollbar > div > div:hover {
    transform: translateY(-4px) scale(1.02);
    box-shadow: 0 10px 20px rgba(0,0,0,0.2), inset 0 -4px 0 rgba(0,0,0,0.05);
  }
  
  .grad-scrollbar > div > div:active {
    transform: translateY(2px) scale(0.98);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1), inset 0 -2px 0 rgba(0,0,0,0.05);
  }
`;
