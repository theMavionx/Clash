import { memo, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useSend, useUI, useResources, useBuilding } from '../hooks/useGodot';
import buildIcon from '../assets/resources/Gemini_Generated_Image_dl9plxdl9plxdl9p-removebg-preview.png';
import attackIcon from '../assets/resources/file_000000006858720a8f860ee8da33335a.png';
import chartIcon from '../assets/resources/chart.png';
import buttonBg from '../assets/resources/file_00000000a6f87246844c6271b76cd436.png';

import knightImg  from '../assets/units/knight.png';
import mageImg    from '../assets/units/mage.png';
import archerImg  from '../assets/units/archer.png';
import arbaletImg from '../assets/units/arbalet.png';
import berserkImg from '../assets/units/berserk.png';

// Matches SHIP_TROOPS index order in attack_system.gd — must stay in sync!
// If SHIP_TROOPS order changes in attack_system.gd, update this array too.
// zoom/offsetY — per-portrait tweaks to normalize framing across different source images
const ATTACK_TROOPS = [
  { key: 'knight',    label: 'Knight',    img: knightImg,  zoom: 1.35, offsetY: '10%' },
  { key: 'mage',      label: 'Mage',      img: mageImg,    zoom: 1.45, offsetY: '15%' },
  { key: 'barbarian', label: 'Barbarian', img: berserkImg },
  { key: 'archer',    label: 'Ranger',    img: arbaletImg },
  { key: 'ranger',    label: 'Rogue',     img: archerImg  },
];

// ── Shared styled button (normal mode) ────────────────────────────────────
const CustomBtn = ({ children, onClick, width = 140, height = 140, style = {} }) => (
  <button
    onClick={onClick}
    style={{
      width, height, position: 'relative', background: 'none', border: 'none',
      padding: 0, cursor: 'pointer', transition: 'transform 0.1s ease-out, filter 0.1s', outline: 'none',
      ...style,
    }}
    onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.filter = 'brightness(1.1)'; }}
    onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'none'; }}
    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
    onMouseUp={e => e.currentTarget.style.transform = 'scale(1.08)'}
  >
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `url(${buttonBg})`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))',
      zIndex: 0,
    }} />
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', zIndex: 3, paddingBottom: 4,
    }}>
      {children}
    </div>
  </button>
);

// ── Cannonball SVG icon ────────────────────────────────────────────────────
const CannonBallIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 58 58">
    <circle cx="29" cy="29" r="23" fill="#1c1c1c" stroke="#555" strokeWidth="2.5"/>
    <ellipse cx="21" cy="19" rx="7" ry="5" fill="rgba(255,255,255,0.18)" transform="rotate(-20 21 19)"/>
    <circle cx="22" cy="20" r="2.5" fill="rgba(255,255,255,0.28)"/>
    <path d="M44 14 Q50 8 46 4" stroke="#c8a04a" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <circle cx="46" cy="4" r="2.5" fill="#ff6a00" opacity="0.9"/>
  </svg>
);

// ── Attack HUD (shown during enemy mode) ──────────────────────────────────
function AttackHUD({ onReturnHome, onCannon, cannonMode, selectedTroopIdx, onSelectTroop, cannonEnergy }) {
  const [perf, setPerf] = useState({ troop_counts: {}, deployed_types: {} });
  const perfRef = useRef(perf);

  useEffect(() => {
    const h = (e) => {
      const counts = e.detail.troop_counts || {};
      const types = e.detail.deployed_types || {};
      const prev = perfRef.current;
      const changed = ATTACK_TROOPS.some(t =>
        (counts[t.key] ?? 0) !== (prev.troop_counts[t.key] ?? 0) ||
        !!types[t.key] !== !!prev.deployed_types[t.key]
      );
      if (changed) {
        const next = { troop_counts: counts, deployed_types: types };
        perfRef.current = next;
        setPerf(next);
      }
    };
    window.addEventListener('godot-perf', h);
    return () => window.removeEventListener('godot-perf', h);
  }, []);

  return (
    <>
      {/* Return Home - Top Right */}
      <div style={hud.wrapTopRight}>
        <button style={hud.homeBtn} onClick={onReturnHome} title="Return Home"
          onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'}
          onMouseOut={e => e.currentTarget.style.filter = 'none'}
        >
          <span style={{ fontSize: 26, lineHeight: 1 }}>🏳️</span>
        </button>
      </div>

      {/* Troops - Bottom Left */}
      <div style={hud.wrapLeft}>
        {ATTACK_TROOPS.map((t, i) => {
          const deployed = !!perf.deployed_types[t.key];
          const live = perf.troop_counts[t.key] ?? 0;
          const count = deployed ? live : 3;
          const allDead = deployed && live === 0;
          const selected = i === selectedTroopIdx && !cannonMode;

          const imgFilter = allDead
            ? 'grayscale(1) brightness(0.45)'
            : deployed ? 'grayscale(0.7) brightness(0.75)' : 'none';

          return (
            <button
              key={t.key}
              style={{
                ...hud.card,
                opacity: allDead ? 0.25 : deployed ? 0.7 : 1,
                borderColor: selected
                  ? 'rgba(255,210,40,0.9)'
                  : allDead ? 'rgba(20,50,80,0.35)' : deployed ? 'rgba(25,85,130,0.45)' : 'rgba(35,120,185,0.55)',
                boxShadow: selected
                  ? '0 0 16px rgba(255,210,40,0.45), inset 0 0 8px rgba(255,210,40,0.1)'
                  : 'none',
                cursor: allDead ? 'default' : 'pointer',
              }}
              onClick={() => !allDead && onSelectTroop(i)}
            >
              <div style={{ ...hud.cardImgWrap, filter: imgFilter }}>
                <img
                  src={t.img} alt={t.label}
                  style={{
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                    objectPosition: `center ${t.offsetY || 'top'}`,
                    transform: t.zoom ? `scale(${t.zoom})` : 'none',
                    transformOrigin: 'center top',
                  }}
                />
              </div>

              {!allDead && (
                <div style={hud.countBadge}>
                  <span style={{ ...hud.countText, color: deployed ? '#8fc8e0' : '#7df4ff' }}>x{count}</span>
                </div>
              )}

              {selected && !allDead && (
                <div style={hud.selArrow}>▲</div>
              )}

              <span style={{ ...hud.cardLabel, color: selected ? '#7df4ff' : deployed ? 'rgba(130,185,215,0.75)' : 'rgba(160,220,255,0.85)' }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cannon + Energy - Bottom Right */}
      <div style={hud.wrapRight}>
        <div style={hud.cannonGroup}>
          {cannonEnergy && (
            <div style={hud.energyPill}>
              <span style={hud.energyIcon}>⚡</span>
              <span style={hud.energyValue}>{cannonEnergy.energy}</span>
            </div>
          )}
          <button
            style={{ ...hud.cannonBtn, ...(cannonMode ? hud.cannonActive : {}) }}
            onClick={onCannon}
            title="Ship Cannon"
            onMouseOver={e => !cannonMode && (e.currentTarget.style.filter = 'brightness(1.15)')}
            onMouseOut={e => !cannonMode && (e.currentTarget.style.filter = 'none')}
          >
            <CannonBallIcon size={46} />
            
            {/* Cost Badge on the Button */}
            {cannonEnergy && (
              <div style={hud.cannonCostBadge}>
                {cannonEnergy.nextCost}
                <span style={hud.cannonCostIcon}>⚡</span>
              </div>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────
function ActionButtons() {
  const { sendToGodot, setFuturesOpen } = useSend();
  const { enemyMode, cannonMode, selectedTroopIdx, cannonEnergy } = useUI();
  const resources = useResources();
  const { buildingDefs } = useBuilding();

  // Count how many building types the player can afford to build
  const affordableCount = useMemo(() => {
    const defs = buildingDefs?.buildings || {};
    const placed = buildingDefs?.placed_counts || {};
    let count = 0;
    for (const [id, def] of Object.entries(defs)) {
      if (id === 'barracks' || id === 'flag') continue;
      const maxCount = def.max_count || 0;
      if (maxCount > 0 && (placed[id] || 0) >= maxCount) continue;
      const cost = def.cost || {};
      if ((resources.gold || 0) >= (cost.gold || 0) &&
          (resources.wood || 0) >= (cost.wood || 0) &&
          (resources.ore || 0) >= (cost.ore || 0)) {
        count++;
      }
    }
    return count;
  }, [buildingDefs, resources]);

  const handleReturnHome  = useCallback(() => sendToGodot('return_home'),     [sendToGodot]);
  const handleFindEnemy   = useCallback(() => sendToGodot('find_enemy'),       [sendToGodot]);
  const handleOpenShop    = useCallback(() => sendToGodot('open_shop'),        [sendToGodot]);
  const handleOpenTrade   = useCallback(() => setFuturesOpen(true),            [setFuturesOpen]);
  const handleShipCannon  = useCallback(() => sendToGodot('ship_cannon_mode'), [sendToGodot]);
  const handleSelectTroop = useCallback((idx) => sendToGodot('select_troop', { idx }), [sendToGodot]);

  if (enemyMode.active) {
    return (
      <AttackHUD
        onReturnHome={handleReturnHome}
        onCannon={handleShipCannon}
        cannonMode={cannonMode}
        selectedTroopIdx={selectedTroopIdx ?? 0}
        onSelectTroop={handleSelectTroop}
        cannonEnergy={cannonEnergy}
      />
    );
  }

  return (
    <>
      <div style={styles.wrapLeft}>
        <CustomBtn onClick={handleFindEnemy}>
          <img src={attackIcon} alt="attack" style={styles.attackIconImg} />
          <span style={styles.btnLabel}>ATTACK</span>
        </CustomBtn>
        <CustomBtn onClick={handleOpenShop} width={110} height={110}>
          {affordableCount > 0 && <div style={styles.notificationBadgeSmall}>{affordableCount}</div>}
          <img src={buildIcon} alt="build" style={styles.buildIconImgSmall} />
        </CustomBtn>
      </div>
      <div style={styles.wrapRight}>
        <CustomBtn onClick={handleOpenTrade}>
          {(window._openPositionsCount || 0) > 0 && <div style={styles.notificationBadge}>!</div>}
          <img src={chartIcon} alt="trade" style={styles.chartIconImg} />
          <span style={styles.btnLabel}>TRADE</span>
        </CustomBtn>
      </div>
    </>
  );
}

export default memo(ActionButtons);

// ── Attack HUD styles ─────────────────────────────────────────────────────
const hud = {
  wrapLeft: {
    position: 'fixed',
    bottom: 20,
    left: 20,
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
    pointerEvents: 'all',
    zIndex: 10,
  },
  wrapRight: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    pointerEvents: 'all',
    zIndex: 10,
  },
  wrapTopRight: {
    position: 'fixed',
    top: 20,
    right: 20,
    pointerEvents: 'all',
    zIndex: 10,
  },
  homeBtn: {
    width: 56, height: 56,
    background: 'linear-gradient(180deg, rgba(15,55,95,0.9), rgba(8,30,58,0.95))',
    border: '2px solid rgba(40,130,195,0.55)',
    borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
    transition: 'filter 0.15s',
    outline: 'none',
  },
  sep: {
    width: 2, height: 68,
    background: 'linear-gradient(180deg, transparent, rgba(40,140,200,0.4), transparent)',
    borderRadius: 1, flexShrink: 0,
  },
  troopRow: {
    display: 'flex', flexDirection: 'row', gap: 7, alignItems: 'center',
  },
  card: {
    position: 'relative',
    width: 74, height: 88,
    background: 'linear-gradient(180deg, rgba(12,45,80,0.94), rgba(6,24,48,0.97))',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'rgba(35,120,185,0.55)',
    borderRadius: 14,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'flex-start',
    padding: '4px 3px 2px',
    overflow: 'hidden',
    transition: 'opacity 0.25s, border-color 0.2s, box-shadow 0.2s',
    outline: 'none',
  },
  cardImgWrap: {
    width: 64, height: 62,
    borderRadius: 9,
    flexShrink: 0,
    overflow: 'hidden',
  },
  countBadge: {
    position: 'absolute', bottom: 19, right: 3,
    background: 'rgba(0,10,25,0.82)',
    border: '1px solid rgba(40,140,200,0.3)',
    borderRadius: 6, padding: '1px 5px',
  },
  countText: {
    color: '#7df4ff', fontSize: 12, fontWeight: 900,
    WebkitTextStroke: '0.5px #003050', lineHeight: 1.2,
  },
  selArrow: {
    position: 'absolute', bottom: 19, left: 4,
    color: '#7df4ff', fontSize: 9, lineHeight: 1,
    textShadow: '0 0 6px rgba(60,220,255,0.9)',
  },
  cardLabel: {
    fontSize: 9, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.3px',
    marginTop: 2, lineHeight: 1,
    pointerEvents: 'none',
  },
  cannonBtn: {
    width: 82, height: 82,
    position: 'relative',
    background: 'linear-gradient(180deg, rgba(12,45,80,0.94), rgba(6,24,48,0.97))',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'rgba(35,120,185,0.55)',
    borderRadius: 18,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    cursor: 'pointer', flexShrink: 0,
    transition: 'border-color 0.2s, box-shadow 0.2s, filter 0.2s',
    outline: 'none',
  },
  cannonActive: {
    borderColor: 'rgba(255,155,0,0.88)',
    boxShadow: '0 0 22px rgba(255,155,0,0.5), inset 0 0 10px rgba(255,155,0,0.12)',
    filter: 'brightness(1.18)',
  },
  cannonLabel: {
    color: '#7df4ff', fontSize: 10, fontWeight: 900,
    WebkitTextStroke: '0.5px #003050',
    textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1,
  },
  cannonCostBadge: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    color: '#fff',
    fontSize: 14,
    fontWeight: 900,
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
  },
  cannonCostIcon: {
    background: '#d64817',
    borderRadius: '50%',
    width: 12, height: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 8,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
    color: '#fff',
  },
  cannonGroup: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
  },
  energyPill: {
    background: 'linear-gradient(180deg, #3a3a3a 0%, #1e1e1e 100%)',
    border: '2px solid #111',
    borderRadius: 8,
    padding: '6px 12px',
    display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
    boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
  },
  energyIcon: {
    fontSize: 16, lineHeight: 1,
    background: '#d64817',
    borderRadius: '50%',
    width: 24, height: 24,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.3)',
    color: '#fff',
  },
  energyValue: {
    fontSize: 22, fontWeight: 900, color: '#fff',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
  },
};

// ── Normal mode styles ─────────────────────────────────────────────────────
const base = { position: 'fixed', bottom: 12, display: 'flex', pointerEvents: 'all', zIndex: 10 };

const styles = {
  wrapLeft:  { ...base, left: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  wrapRight: { ...base, right: 12, flexDirection: 'column', alignItems: 'flex-end', gap: 12 },
  buildIconImgSmall: {
    width: 95, height: 95, objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transform: 'translate(-4px, -2px)',
  },
  attackIconImg: {
    width: 120, height: 120, objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))', marginBottom: 2,
  },
  chartIconImg: {
    width: 110, height: 110, objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transform: 'translateY(-10px)', marginBottom: 2,
  },
  btnLabel: {
    position: 'absolute', bottom: 28, left: 0, right: 0,
    color: '#fff', fontSize: 14, fontWeight: 900,
    WebkitTextStroke: '1px #000', textShadow: '0 2px 4px rgba(0,0,0,0.8)',
    textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', zIndex: 10,
  },
  notificationBadge: {
    position: 'absolute', top: 6, right: 6,
    background: '#E63946', color: '#fff', borderRadius: '50%',
    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 900, border: '3px solid #fff',
    boxShadow: '0 4px 8px rgba(0,0,0,0.5)', zIndex: 5,
  },
  notificationBadgeSmall: {
    position: 'absolute', top: 4, right: 4,
    background: '#E63946', color: '#fff', borderRadius: '50%',
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 900, border: '2px solid #fff',
    boxShadow: '0 4px 8px rgba(0,0,0,0.5)', zIndex: 5,
  },
};
