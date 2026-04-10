import { memo, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useSend, useUI, useResources, useBuilding } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import buildIcon from '../assets/resources/Gemini_Generated_Image_dl9plxdl9plxdl9p-removebg-preview.png';
import attackIcon from '../assets/resources/file_000000006858720a8f860ee8da33335a.png';
import chartIcon from '../assets/resources/chart.png';
import buttonBg from '../assets/resources/file_00000000a6f87246844c6271b76cd436.png';
import shipImg from '../assets/buildings/shipsmall.png';

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
const CustomBtn = ({ children, onClick, width = 140, height = 140, style = {}, mobileScale = 0.7, ...rest }) => (
  <button
    onClick={onClick}
    {...rest}
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

// Map troop names to images/display info
const TROOP_IMG_MAP = {
  knight: { img: knightImg, label: 'Knight', zoom: 1.35, offsetY: '10%' },
  mage: { img: mageImg, label: 'Mage', zoom: 1.45, offsetY: '15%' },
  barbarian: { img: berserkImg, label: 'Barbarian' },
  archer: { img: arbaletImg, label: 'Ranger' },
  ranger: { img: archerImg, label: 'Rogue' },
};

// ── Attack HUD (shown during enemy mode) ──────────────────────────────────
function AttackHUD({ onReturnHome, onSurrender, onCannon, cannonMode, selectedTroopIdx, onSelectTroop, cannonEnergy, fleetInfo, battleTimer }) {
  const { isMobile: mobile } = useLayout();
  const [perf, setPerf] = useState({ troop_counts: {} });
  const perfRef = useRef(perf);
  const [expandedShip, setExpandedShip] = useState(null);

  useEffect(() => {
    const h = (e) => {
      const counts = e.detail.troop_counts || {};
      const prev = perfRef.current;
      const changed = Object.keys({ ...counts, ...prev.troop_counts }).some(k =>
        (counts[k] ?? 0) !== (prev.troop_counts[k] ?? 0)
      );
      if (changed) {
        const next = { troop_counts: counts };
        perfRef.current = next;
        setPerf(next);
      }
    };
    window.addEventListener('godot-perf', h);
    return () => window.removeEventListener('godot-perf', h);
  }, []);

  // Build ship cards from fleet info
  const ships = fleetInfo?.ships || [];
  const placed = fleetInfo?.placed || 0;

  return (
    <>
      {/* Return Home + Timer - Top Right */}
      <div style={hud.wrapTopRight}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {battleTimer != null && (
            <div style={{
              ...hud.timerPill,
              color: battleTimer <= 30 ? '#ff4444' : '#7df4ff',
              borderColor: battleTimer <= 30 ? 'rgba(255,68,68,0.55)' : 'rgba(40,130,195,0.55)',
            }}>
              {Math.floor(battleTimer / 60)}:{String(battleTimer % 60).padStart(2, '0')}
            </div>
          )}
          <button style={hud.homeBtn} onClick={onSurrender} title="Surrender"
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'}
            onMouseOut={e => e.currentTarget.style.filter = 'none'}
          >
            <span style={{ fontSize: 26, lineHeight: 1 }}>🏳️</span>
          </button>
        </div>
      </div>

      {/* Ships - Bottom Left: compact ship icons */}
      <div style={{ ...hud.wrapLeft, ...(mobile ? { bottom: 10, left: 10, gap: 4 } : {}) }}>
        {/* Fleet info button */}
        <button
          style={{ ...hud.card, width: mobile ? 28 : 34, height: mobile ? 28 : 34, padding: 0, borderColor: 'rgba(255,215,0,0.6)', cursor: 'pointer', flexDirection: 'column', gap: 0 }}
          onClick={(e) => { e.stopPropagation(); setExpandedShip(expandedShip !== null ? null : 0); }}
        >
          <span style={{ fontSize: mobile ? 10 : 12, fontWeight: 900, color: '#FFD700' }}>?</span>
        </button>
        {ships.map((ship, shipIdx) => {
          const isPlaced = !!ship.placed;
          const troops = ship.troops || [];
          const allDead = isPlaced && troops.reduce((sum, t) => sum + (perf.troop_counts[t.toLowerCase()] ?? 0), 0) === 0;
          const isSelected = !isPlaced && selectedTroopIdx === shipIdx;
          const sz = mobile ? 56 : 70;

          return (
            <button
              key={shipIdx}
              style={{
                ...hud.card,
                width: sz, height: sz,
                opacity: allDead ? 0.25 : isPlaced ? 0.5 : 1,
                borderColor: isSelected ? '#FFD700' : isPlaced ? 'rgba(25,85,130,0.45)' : 'rgba(35,120,185,0.55)',
                boxShadow: isSelected ? '0 0 12px rgba(255,215,0,0.6), inset 0 0 8px rgba(255,215,0,0.15)' : 'none',
                cursor: isPlaced ? 'default' : 'pointer',
                flexDirection: 'column', gap: 0, padding: 2, position: 'relative',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isPlaced && !allDead) onSelectTroop(shipIdx);
              }}
            >
              <img src={shipImg} alt="" style={{ width: '80%', height: '55%', objectFit: 'contain', filter: isPlaced ? 'grayscale(0.7) brightness(0.7)' : 'none' }} />
              <div style={{ fontSize: 7, fontWeight: 800, color: 'rgba(160,220,255,0.8)', textTransform: 'uppercase' }}>
                {isPlaced ? 'DEPLOYED' : `Lv.${ship.level}`}
              </div>
              {/* Troop count badge */}
              <div style={{ position: 'absolute', top: -4, right: -4, background: '#1a3050', color: '#7df4ff', fontSize: 9, fontWeight: 900, borderRadius: 6, padding: '1px 5px', border: '1px solid rgba(40,140,200,0.5)' }}>
                x{troops.length}
              </div>
            </button>
          );
        })}
      </div>

      {/* Fleet details modal */}
      {expandedShip !== null && (
        <div style={hud.shipModal} onClick={() => setExpandedShip(null)}>
          <div style={hud.shipModalPanel} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#FFD700', textAlign: 'center', marginBottom: 10 }}>
              Fleet — {ships.length} Ships
            </div>
            {ships.map((ship, si) => {
              const troops = ship.troops || [];
              const groups = {};
              for (const t of troops) groups[t.toLowerCase()] = (groups[t.toLowerCase()] || 0) + 1;
              return (
                <div key={si} style={{ width: '100%', marginBottom: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: ship.placed ? 'rgba(160,220,255,0.5)' : '#7df4ff', marginBottom: 4 }}>
                    Ship {si + 1} (Lv.{ship.level}) — {ship.placed ? 'DEPLOYED' : `${troops.length} troops`}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.entries(groups).map(([key, count]) => {
                      const info = TROOP_IMG_MAP[key] || {};
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 6px' }}>
                          <div style={{ width: 22, height: 22, borderRadius: 3, overflow: 'hidden' }}>
                            {info.img && <img src={info.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{info.label || key} x{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <button style={{ marginTop: 6, padding: '8px 20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }} onClick={() => setExpandedShip(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Cannon + Energy - Bottom Right */}
      <div style={{ ...hud.wrapRight, ...(mobile ? { bottom: 10, right: 10 } : {}) }}>
        <div style={hud.cannonGroup}>
          {cannonEnergy && (
            <div style={hud.energyPill}>
              <span style={hud.energyIcon}>⚡</span>
              <span style={hud.energyValue}>{cannonEnergy.energy}</span>
            </div>
          )}
          <button
            style={{ ...hud.cannonBtn, ...(cannonMode ? hud.cannonActive : {}), ...(cannonEnergy && cannonEnergy.energy < cannonEnergy.nextCost ? hud.cannonDisabled : {}) }}
            onClick={() => { if (!cannonEnergy || cannonEnergy.energy >= cannonEnergy.nextCost) onCannon(); }}
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

// ── Replay HUD (shown during replay mode) ────────────────────────────────
const REPLAY_SPEEDS = [1, 2, 4];

function ReplayHUD({ onReturnHome }) {
  const { sendToGodot } = useSend();
  const [speedIdx, setSpeedIdx] = useState(0);

  const handleSpeed = useCallback(() => {
    const next = (speedIdx + 1) % REPLAY_SPEEDS.length;
    setSpeedIdx(next);
    sendToGodot('replay_speed', { speed: REPLAY_SPEEDS[next] });
  }, [speedIdx, sendToGodot]);

  return (
    <div style={hud.wrapTopRight}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button style={hud.speedBtn} onClick={handleSpeed} title="Change speed"
          onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'}
          onMouseOut={e => e.currentTarget.style.filter = 'none'}
        >
          <span style={hud.speedText}>{REPLAY_SPEEDS[speedIdx]}x</span>
        </button>
        <div style={hud.replayBadge}>REPLAY</div>
        <button style={hud.homeBtn} onClick={onReturnHome} title="Return Home"
          onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'}
          onMouseOut={e => e.currentTarget.style.filter = 'none'}
        >
          <span style={{ fontSize: 26, lineHeight: 1 }}>🏳️</span>
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
// ── Shield icon for defense log ───────────────────────────────────────────
const ShieldIcon = ({ size = 60 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <path d="M32 6 L54 16 L54 32 Q54 50 32 58 Q10 50 10 32 L10 16 Z" fill="#3b7dd8" stroke="#1a3a6a" strokeWidth="2.5"/>
    <path d="M32 10 L50 18 L50 32 Q50 47 32 54 Q14 47 14 32 L14 18 Z" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
    <path d="M26 28 L30 32 L38 24" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M24 36 L40 36" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round"/>
    <path d="M27 41 L37 41" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

function ActionButtons({ onOpenBattleLog }) {
  const { sendToGodot, setFuturesOpen } = useSend();
  const { enemyMode, cannonMode, selectedTroopIdx, cannonEnergy, fleetInfo, pendingCasualties, setPendingCasualties, battleTimer } = useUI();
  const [showReinforce, setShowReinforce] = useState(false);
  const [serverCasualties, setServerCasualties] = useState(null);
  const [loadingCasualties, setLoadingCasualties] = useState(false);
  const resources = useResources();
  const { buildingDefs } = useBuilding();
  const { isMobile: mobile, isLandscape } = useLayout();

  // Count how many buildings the player can actually build right now
  const affordableCount = useMemo(() => {
    const defs = buildingDefs?.buildings || {};
    const placed = buildingDefs?.placed_counts || {};
    const thMaxCounts = buildingDefs?.th_max_counts || {};
    const thUnlock = buildingDefs?.th_unlock || {};
    const thLevel = buildingDefs?.th_level || 1;
    let count = 0;
    for (const [id, def] of Object.entries(defs)) {
      if (id === 'barracks' || id === 'flag') continue;
      // Check TH unlock
      const unlockAt = thUnlock[id];
      if (unlockAt && thLevel < unlockAt) continue;
      // Check TH-based max count
      const maxCount = thMaxCounts[id] ?? def.max_count ?? 99;
      if ((placed[id] || 0) >= maxCount) continue;
      // Check resources
      const cost = def.cost || {};
      if ((resources.gold || 0) >= (cost.gold || 0) &&
          (resources.wood || 0) >= (cost.wood || 0) &&
          (resources.ore || 0) >= (cost.ore || 0)) {
        count++;
      }
    }
    return count;
  }, [buildingDefs, resources]);

  const [showSurrender, setShowSurrender] = useState(false);
  const handleReturnHome  = useCallback(() => sendToGodot('return_home'),     [sendToGodot]);
  const handleFindEnemy   = useCallback(() => sendToGodot('find_enemy'),       [sendToGodot]);
  const handleOpenShop    = useCallback(() => sendToGodot('open_shop'),        [sendToGodot]);
  const handleOpenTrade   = useCallback(() => setFuturesOpen(true),            [setFuturesOpen]);
  const handleShipCannon  = useCallback(() => sendToGodot('ship_cannon_mode'), [sendToGodot]);
  const handleSelectTroop = useCallback((idx) => {
    console.log('[SELECT TROOP]', idx, 'cannonMode:', cannonMode);
    if (cannonMode) sendToGodot('ship_cannon_mode'); // toggle off cannon
    sendToGodot('select_troop', { idx });
  }, [sendToGodot, cannonMode]);

  if (enemyMode.active) {
    // Replay mode — only show return button, no attack controls
    if (enemyMode.is_replay) {
      return <ReplayHUD onReturnHome={handleReturnHome} />;
    }
    return (
      <>
      <AttackHUD
        onReturnHome={handleReturnHome}
        onSurrender={() => setShowSurrender(true)}
        onCannon={handleShipCannon}
        cannonMode={cannonMode}
        selectedTroopIdx={selectedTroopIdx ?? 0}
        onSelectTroop={handleSelectTroop}
        cannonEnergy={cannonEnergy}
        fleetInfo={fleetInfo}
        battleTimer={battleTimer}
      />
      {showSurrender && (
        <div style={rf.overlay} onClick={() => setShowSurrender(false)}>
          <div style={{...rf.panel, width: 360}} onClick={e => e.stopPropagation()}>
            <div style={rf.header}>
              <span style={rf.title}>Surrender?</span>
              <button style={rf.closeBtn} onClick={() => setShowSurrender(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={rf.body}>
              <div style={{fontSize: 42, textAlign: 'center'}}>🏳️</div>
              <div style={{fontSize: 15, fontWeight: 800, color: '#5C3A21', textAlign: 'center', lineHeight: 1.5}}>
                You will lose <span style={{color: '#E53935'}}>trophies</span> and retreat from battle. Dead troops will need reinforcing.
              </div>
              <div style={{display: 'flex', gap: 10, width: '100%'}}>
                <button style={{...rf.confirmBtn, background: 'linear-gradient(180deg, #9E9E9E 0%, #616161 100%)', border: '3px solid #424242', flex: 1}} onClick={() => setShowSurrender(false)}>
                  CANCEL
                </button>
                <button style={{...rf.confirmBtn, background: 'linear-gradient(180deg, #E53935 0%, #B71C1C 100%)', border: '3px solid #7f0000', flex: 1}} onClick={() => { setShowSurrender(false); handleReturnHome(); }}>
                  SURRENDER
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  const btnSize = mobile ? 110 : 140;
  const btnSmall = mobile ? 88 : 110;

  return (
    <>
      <div style={{ ...styles.wrapLeft, ...(mobile ? { bottom: 8, left: 8, gap: 4 } : {}) }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <CustomBtn onClick={onOpenBattleLog} width={btnSmall} height={btnSmall}>
            <ShieldIcon size={mobile ? 40 : 60} />
          </CustomBtn>
          <CustomBtn onClick={handleFindEnemy} width={btnSize} height={btnSize} data-tutorial="attack-btn">
            <img src={attackIcon} alt="attack" style={{ ...styles.attackIconImg, ...(mobile ? { width: 95, height: 95 } : {}) }} />
            <span style={styles.btnLabel}>ATTACK</span>
          </CustomBtn>
        </div>
        <CustomBtn onClick={handleOpenShop} width={btnSmall} height={btnSmall} data-tutorial="build-btn">
          {affordableCount > 0 && <div style={styles.notificationBadgeSmall}>{affordableCount}</div>}
          <img src={buildIcon} alt="build" style={{ ...styles.buildIconImgSmall, ...(mobile ? { width: 75, height: 75 } : {}) }} />
        </CustomBtn>
      </div>
      <div style={{ ...styles.wrapRight, ...(mobile ? { bottom: 8, right: 8 } : {}) }}>
        {pendingCasualties && (
          <CustomBtn onClick={() => {
            setLoadingCasualties(true);
            const token = window._playerToken;
            fetch('/api/casualties', { headers: { 'x-token': token } })
              .then(r => r.json())
              .then(data => {
                if (data.total > 0) {
                  setServerCasualties(data);
                  setShowReinforce(true);
                } else {
                  setPendingCasualties(null);
                }
              })
              .catch(() => setShowReinforce(true))
              .finally(() => setLoadingCasualties(false));
          }} width={btnSmall} height={btnSmall}>
            <div style={styles.notificationBadgeSmall}>!</div>
            <svg width={mobile ? 44 : 56} height={mobile ? 44 : 56} viewBox="0 0 64 64" fill="none">
              <path d="M32 8L40 20H24L32 8Z" fill="#e8b830" stroke="#5C3A21" strokeWidth="2"/>
              <rect x="28" y="20" width="8" height="28" rx="2" fill="#e8b830" stroke="#5C3A21" strokeWidth="2"/>
              <rect x="20" y="28" width="24" height="8" rx="2" fill="#e8b830" stroke="#5C3A21" strokeWidth="2"/>
              <circle cx="32" cy="52" r="6" fill="#4CAF50" stroke="#2E7D32" strokeWidth="2"/>
              <path d="M29 52L31 54L35 50" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{...styles.btnLabel, bottom: mobile ? 16 : 22, fontSize: mobile ? 9 : 11}}>REINFORCE</span>
          </CustomBtn>
        )}
        <CustomBtn onClick={handleOpenTrade} width={btnSize} height={btnSize} data-tutorial="trade-btn">
          {(window._openPositionsCount || 0) > 0 && <div style={styles.notificationBadge}>!</div>}
          <img src={chartIcon} alt="trade" style={{ ...styles.chartIconImg, ...(mobile ? { width: 90, height: 90 } : {}) }} />
          <span style={styles.btnLabel}>TRADE</span>
        </CustomBtn>
      </div>
      {showReinforce && (serverCasualties || pendingCasualties) && (
        <ReinforceModal
          casualties={serverCasualties?.casualties || pendingCasualties}
          cost={serverCasualties?.cost}
          onConfirm={() => {
            sendToGodot('reinforce');
            setShowReinforce(false);
            setServerCasualties(null);
            setPendingCasualties(null);
          }}
          onClose={() => { setShowReinforce(false); setServerCasualties(null); }}
        />
      )}
    </>
  );
}

const REINFORCE_COST = 50;
const UNIT_IMG_MAP = {
  Knight: knightImg, Mage: mageImg, Barbarian: berserkImg, Archer: archerImg, Ranger: arbaletImg,
};

function ReinforceModal({ casualties, cost: serverCost, onConfirm, onClose }) {
  const entries = Object.entries(casualties).filter(([, c]) => c > 0);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  const cost = serverCost ?? total * REINFORCE_COST;

  return (
    <div style={rf.overlay} onClick={onClose}>
      <div style={rf.panel} onClick={e => e.stopPropagation()}>
        <div style={rf.header}>
          <span style={rf.title}>Reinforce Troops</span>
          <button style={rf.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={rf.body}>
          <div style={rf.grid}>
            {entries.map(([name, count]) => (
              <div key={name} style={rf.card}>
                <div style={rf.imgWrap}>
                  {UNIT_IMG_MAP[name] && <img src={UNIT_IMG_MAP[name]} alt={name} style={rf.img} />}
                  <div style={rf.countBadge}>x{count}</div>
                </div>
                <span style={rf.name}>{name}</span>
              </div>
            ))}
          </div>
          <div style={rf.costRow}>
            <span style={rf.costLabel}>{total} troops to restore</span>
            <span style={rf.costVal}>{cost} gold</span>
          </div>
          <button style={rf.confirmBtn} onClick={onConfirm}>REINFORCE ALL</button>
        </div>
      </div>
    </div>
  );
}

const rf = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, pointerEvents: 'all',
  },
  panel: {
    width: 400, maxWidth: '95vw', background: '#fdf8e7',
    border: '6px solid #d4c8b0', borderRadius: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
  },
  title: { fontSize: 20, fontWeight: 900, color: '#5C3A21' },
  closeBtn: {
    width: 30, height: 30, borderRadius: '50%', background: '#E53935',
    border: '3px solid #fff', color: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  body: { padding: 20, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' },
  card: { width: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  imgWrap: {
    width: 80, height: 80, borderRadius: 14, background: '#e8dfc8',
    border: '3px solid #d4c8b0', position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  img: { width: '100%', height: '100%', objectFit: 'cover', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.4)) sepia(0.2)' },
  countBadge: {
    position: 'absolute', bottom: 2, right: 2,
    background: '#E53935', color: '#fff', fontSize: 12, fontWeight: 900,
    padding: '1px 7px', borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
  },
  name: { fontSize: 12, fontWeight: 900, color: '#5C3A21' },
  costRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: '10px 0', borderTop: '2px solid #e8dfc8',
  },
  costLabel: { fontSize: 14, fontWeight: 800, color: '#77573d' },
  costVal: { fontSize: 18, fontWeight: 900, color: '#e8b830' },
  confirmBtn: {
    width: '100%', padding: '14px',
    background: 'linear-gradient(180deg, #4CAF50 0%, #2E7D32 100%)',
    border: '3px solid #1B5E20', borderRadius: 14,
    color: '#fff', fontSize: 16, fontWeight: 900, cursor: 'pointer',
    textShadow: '0 2px 2px rgba(0,0,0,0.3)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
  },
};

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
  timerPill: {
    padding: '8px 16px',
    background: 'linear-gradient(180deg, rgba(15,55,95,0.9), rgba(8,30,58,0.95))',
    border: '2px solid rgba(40,130,195,0.55)',
    borderRadius: 10,
    fontSize: 20, fontWeight: 900,
    letterSpacing: '1px',
    textShadow: '0 0 8px rgba(60,220,255,0.5)',
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
  replayBadge: {
    padding: '8px 16px',
    background: 'linear-gradient(180deg, rgba(15,55,95,0.9), rgba(8,30,58,0.95))',
    border: '2px solid rgba(40,130,195,0.55)',
    borderRadius: 10,
    color: '#7df4ff', fontSize: 14, fontWeight: 900,
    letterSpacing: '1px',
    textShadow: '0 0 8px rgba(60,220,255,0.5)',
  },
  speedBtn: {
    width: 56, height: 56,
    background: 'linear-gradient(180deg, rgba(15,55,95,0.9), rgba(8,30,58,0.95))',
    border: '2px solid rgba(40,130,195,0.55)',
    borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
    transition: 'filter 0.15s',
    outline: 'none',
  },
  speedText: {
    color: '#7df4ff', fontSize: 18, fontWeight: 900,
    textShadow: '0 0 8px rgba(60,220,255,0.5)',
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
    textShadow: '-0.5px -0.5px 0 #003050, 0.5px -0.5px 0 #003050, -0.5px 0.5px 0 #003050, 0.5px 0.5px 0 #003050', lineHeight: 1.2,
  },
  selArrow: {
    position: 'absolute', bottom: 19, left: 4,
    color: '#7df4ff', fontSize: 9, lineHeight: 1,
    textShadow: '0 0 6px rgba(60,220,255,0.9)',
  },
  shipModal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, pointerEvents: 'all',
  },
  shipModalPanel: {
    background: 'linear-gradient(180deg, #1a2a3e 0%, #0d1926 100%)',
    border: '2px solid rgba(40,140,200,0.4)', borderRadius: 16,
    padding: '16px 20px', maxWidth: 320, width: 'calc(100% - 32px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
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
  cannonDisabled: {
    opacity: 0.35,
    filter: 'grayscale(1) brightness(0.5)',
    cursor: 'default',
  },
  cannonLabel: {
    color: '#7df4ff', fontSize: 10, fontWeight: 900,
    textShadow: '-0.5px -0.5px 0 #003050, 0.5px -0.5px 0 #003050, -0.5px 0.5px 0 #003050, 0.5px 0.5px 0 #003050',
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
    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.8)',
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
