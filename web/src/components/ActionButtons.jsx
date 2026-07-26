import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useSend, useUI, useResources, useBuildingDefs, usePlayer } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import buildIcon from '../assets/resources/Gemini_Generated_Image_dl9plxdl9plxdl9p-removebg-preview.png';
import attackIcon from '../assets/resources/file_000000006858720a8f860ee8da33335a.png';
import chartIcon from '../assets/resources/chart.png';
import goldIcon from '../assets/resources/gold_bar.png';
import mmBotIcon from '../assets/resources/mm-bot-icon.png';
import tournamentIcon from '../assets/resources/tournament-icon.png';
import buttonBg from '../assets/resources/file_00000000a6f87246844c6271b76cd436.png';
import shipImg from '../assets/buildings/shipsmall.png';
import medkitAbilityImg from '../assets/ui/medkit-ability.png';
import freezeOrbAbilityImg from '../assets/ui/freeze-orb-ability.png';
import rageFieldAbilityImg from '../assets/ui/rage-field-ability.png';
import skeletonBarrelAbilityImg from '../assets/ui/skeleton-barrel-ability.png';
import TournamentPanel from './TournamentPanel';
import NftMintPanel from './NftMintPanel';

import knightImg  from '../assets/units/knight.png';
import mageImg    from '../assets/units/mage.png';
import archerImg  from '../assets/units/archer.png';
import mimicImg   from '../assets/units/mimic.png';
import necromancerImg from '../assets/units/necromancer.png';
import horrorImg from '../assets/units/horror.png';
import mechanicalDragonImg from '../assets/units/mechanical_dragon.png';
import iceGolemImg from '../assets/units/ice_golem.png';
import arbaletImg from '../assets/units/arbalet.png';
import berserkImg from '../assets/units/berserk.png';
import demonKingImg from '../assets/units/demonking.png';
import fireDragonImg from '../assets/units/fire_dragon.png';
import windMageImg from '../assets/units/wind_mage.png';
import peaShooterImg from '../assets/units/pea_shooter.png';

// Canonical player-facing roster. Combat messages carry troop keys, so this
// order controls presentation only and does not depend on the legacy index list.
// zoom/offsetY — per-portrait tweaks to normalize framing across different source images
const ATTACK_TROOPS = [
  { key: 'knight', label: 'Knight', img: knightImg },
  { key: 'mage', label: 'Mage', img: mageImg },
  { key: 'archer', label: 'Archer', img: archerImg },
  { key: 'peashooter', label: 'Pea Shooter', mobileLabel: 'Pea', img: peaShooterImg },
  { key: 'mimic', label: 'Barrel', img: mimicImg },
  { key: 'necromancer', label: 'Necromancer', mobileLabel: 'Necro', img: necromancerImg },
  { key: 'horror', label: 'Horror', img: horrorImg },
  { key: 'mechanicaldragon', label: 'Mech Dragon', mobileLabel: 'Mech', img: mechanicalDragonImg },
  { key: 'icegolem', label: 'Ice Golem', mobileLabel: 'Golem', img: iceGolemImg },
  { key: 'windmage', label: 'Wind Mage', mobileLabel: 'Wind', img: windMageImg, monogram: 'WM' },
  { key: 'demonking', label: 'Demon King', mobileLabel: 'Demon', img: demonKingImg },
  { key: 'firedragon', label: 'Dragon', img: fireDragonImg },
];

const RAID_ATTACK_COST_GOLD = 300;
const attackCostForTownHall = () => RAID_ATTACK_COST_GOLD;

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

const SurrenderFlagIcon = ({ size = 30 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M8 27V5m1 2h12.5l-2.6 4 2.6 4H9"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ── Rally pointer (red grenade) icon ───────────────────────────────────────
// Stylised cartoon grenade in the same line-art language as CannonBallIcon
// so the two abilities feel like a matched set on the HUD.
const RallyGrenadeIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 58 58">
    {/* lever / spoon */}
    <path d="M36 9 L46 5 L48 11 L40 14" fill="#c0c0c0" stroke="#1a1a1a" strokeWidth="1.6" strokeLinejoin="round"/>
    {/* pin ring */}
    <circle cx="48" cy="6" r="3" fill="none" stroke="#d8b54a" strokeWidth="1.6"/>
    {/* cap / fuse housing */}
    <rect x="22" y="10" width="14" height="7" rx="1.5" fill="#3a3a3a" stroke="#0d0d0d" strokeWidth="1.6"/>
    {/* main body — red */}
    <ellipse cx="29" cy="36" rx="17" ry="18" fill="#d72b1c" stroke="#5a0d05" strokeWidth="2.2"/>
    {/* segment lines (pineapple style) */}
    <path d="M14 26 L44 26 M14 36 L44 36 M14 46 L44 46" stroke="#7a160d" strokeWidth="1.4" opacity="0.8"/>
    <path d="M22 20 L22 53 M29 18 L29 54 M36 20 L36 53" stroke="#7a160d" strokeWidth="1.4" opacity="0.8"/>
    {/* highlight */}
    <ellipse cx="22" cy="28" rx="4" ry="5" fill="rgba(255,255,255,0.22)" transform="rotate(-25 22 28)"/>
  </svg>
);

const EnergyBoltIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    aria-hidden="true"
    focusable="false"
    style={{ display: 'block', flex: '0 0 auto' }}
  >
    <path d="M9.2 0.8 3.5 8.7h3.3L6 15.2l6.5-8.8H9.1L9.2 0.8Z" fill="currentColor" />
  </svg>
);

const ONE_USE_SHIP_ABILITIES = [
  {
    key: 'medkit',
    label: 'Healing Field',
    image: medkitAbilityImg,
    costKey: 'medkitCost',
    unlockedKey: 'medkitUnlocked',
    usedKey: 'medkitUsed',
    defaultCost: 6,
    activeStyle: 'medkitActive',
  },
  {
    key: 'freeze',
    label: 'Freeze Orb',
    image: freezeOrbAbilityImg,
    costKey: 'freezeCost',
    unlockedKey: 'freezeUnlocked',
    usedKey: 'freezeUsed',
    defaultCost: 5,
    activeStyle: 'freezeActive',
  },
  {
    key: 'rage',
    label: 'Rage Field',
    image: rageFieldAbilityImg,
    costKey: 'rageCost',
    unlockedKey: 'rageUnlocked',
    usedKey: 'rageUsed',
    defaultCost: 7,
    activeStyle: 'rageActive',
  },
  {
    key: 'skeletonBarrel',
    label: 'Skeleton Barrel',
    image: skeletonBarrelAbilityImg,
    costKey: 'skeletonBarrelCost',
    unlockedKey: 'skeletonBarrelUnlocked',
    usedKey: 'skeletonBarrelUsed',
    defaultCost: 8,
    activeStyle: 'skeletonBarrelActive',
  },
];

function ShipAbilityRail({
  mobile,
  cannonEnergy,
  cannonMode,
  rallyMode,
  medkitMode,
  freezeMode,
  rageMode,
  skeletonBarrelMode,
  onCannon,
  onRally,
  onMedkit,
  onFreeze,
  onRage,
  onSkeletonBarrel,
}) {
  const energy = cannonEnergy?.energy ?? 0;
  const cannonCost = cannonEnergy?.nextCost ?? 1;
  const rallyCost = cannonEnergy?.rallyNextCost ?? 1;
  const cannonDisabled = !cannonMode && !!cannonEnergy && energy < cannonCost;
  const rallyDisabled = !rallyMode && !!cannonEnergy && energy < rallyCost;
  const abilityButtonStyle = mobile
    ? { ...hud.cannonBtn, width: 48, height: 48, borderRadius: 12 }
    : hud.cannonBtn;
  const abilityIconSize = mobile ? 32 : 46;
  const modes = { medkit: medkitMode, freeze: freezeMode, rage: rageMode, skeletonBarrel: skeletonBarrelMode };
  const handlers = { medkit: onMedkit, freeze: onFreeze, rage: onRage, skeletonBarrel: onSkeletonBarrel };

  const handleAbilityWheel = useCallback((event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.currentTarget.scrollLeft += event.deltaY;
  }, []);

  const cannonTip = cannonMode
    ? 'Cancel Ship Cannon'
    : cannonDisabled
    ? `Need ${cannonCost} energy for Ship Cannon`
    : 'Ship Cannon';
  const rallyTip = rallyMode
    ? 'Cancel Rally Pointer'
    : rallyDisabled
    ? `Need ${rallyCost} energy for Rally Pointer`
    : 'Rally Pointer';

  return (
    <div
      className="attack-troop-scroll"
      style={{
        ...hud.abilityRail,
        gap: mobile ? 4 : 8,
        width: mobile ? '100%' : 'min(540px, calc(55vw - 20px))',
      }}
      onWheel={handleAbilityWheel}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      aria-label="Main Ship abilities"
    >
      <button
        style={{ ...abilityButtonStyle, ...(cannonMode ? hud.cannonActive : {}), ...(cannonDisabled ? hud.cannonDisabled : {}) }}
        onClick={() => { if (!cannonDisabled) onCannon(); }}
        title={cannonTip}
        aria-label={cannonTip}
        aria-pressed={cannonMode}
        aria-disabled={cannonDisabled}
      >
        <CannonBallIcon size={abilityIconSize} />
        {cannonEnergy && <div style={{ ...hud.cannonCostBadge, ...(mobile ? hud.cannonCostBadgeMobile : {}) }}>{cannonCost}<span style={hud.cannonCostIcon}><EnergyBoltIcon size={9} /></span></div>}
      </button>
      <button
        style={{ ...abilityButtonStyle, ...(rallyMode ? hud.rallyActive : {}), ...(rallyDisabled ? hud.cannonDisabled : {}) }}
        onClick={() => { if (!rallyDisabled) onRally(); }}
        title={rallyTip}
        aria-label={rallyTip}
        aria-pressed={rallyMode}
        aria-disabled={rallyDisabled}
      >
        <RallyGrenadeIcon size={abilityIconSize} />
        {cannonEnergy && <div style={{ ...hud.cannonCostBadge, ...(mobile ? hud.cannonCostBadgeMobile : {}) }}>{rallyCost}<span style={hud.cannonCostIcon}><EnergyBoltIcon size={9} /></span></div>}
      </button>
      {ONE_USE_SHIP_ABILITIES.map((ability) => {
        if (!cannonEnergy?.[ability.unlockedKey]) return null;
        const active = !!modes[ability.key];
        const used = !!cannonEnergy[ability.usedKey];
        const cost = cannonEnergy[ability.costKey] ?? ability.defaultCost;
        const disabled = !active && (used || energy < cost);
        const tooltip = active
          ? `Cancel ${ability.label}`
          : used
          ? `${ability.label} already used`
          : energy < cost
          ? `Need ${cost} energy for ${ability.label}`
          : ability.label;
        return (
          <button
            key={ability.key}
            style={{
              ...abilityButtonStyle,
              ...(active ? hud[ability.activeStyle] : {}),
              ...(disabled ? hud.cannonDisabled : {}),
            }}
            onClick={() => { if (!disabled) handlers[ability.key]?.(); }}
            title={tooltip}
            aria-label={tooltip}
            aria-pressed={active}
            aria-disabled={disabled}
          >
            <img
              src={ability.image}
              alt=""
              style={{
                width: mobile ? 36 : 60,
                height: mobile ? 36 : 60,
                objectFit: 'contain',
                objectPosition: 'center',
                pointerEvents: 'none',
              }}
            />
            <div style={{ ...hud.cannonCostBadge, ...(mobile ? hud.cannonCostBadgeMobile : {}) }}>{cost}<span style={hud.cannonCostIcon}><EnergyBoltIcon size={9} /></span></div>
          </button>
        );
      })}
    </div>
  );
}

const ACTIVE_TROOP_IMG_MAP = Object.fromEntries(
  ATTACK_TROOPS.map((troop) => [troop.key, troop]),
);

// Map troop names to images/display info. Legacy aliases remain readable in
// old replays, while the active roster comes from one canonical definition.
const TROOP_IMG_MAP = {
  ...ACTIVE_TROOP_IMG_MAP,
  barbarian: { img: berserkImg, label: 'Barbarian' },
  ranger: { img: arbaletImg, label: 'Ranger' },
  skeletonmage: ACTIVE_TROOP_IMG_MAP.necromancer,
  skeleton_mage: ACTIVE_TROOP_IMG_MAP.necromancer,
  horrorevolution: ACTIVE_TROOP_IMG_MAP.horror,
  horror_evolution: ACTIVE_TROOP_IMG_MAP.horror,
  mechanical_dragon: ACTIVE_TROOP_IMG_MAP.mechanicaldragon,
  mechdragon: ACTIVE_TROOP_IMG_MAP.mechanicaldragon,
  ice_golem: ACTIVE_TROOP_IMG_MAP.icegolem,
  demon_king: ACTIVE_TROOP_IMG_MAP.demonking,
  fire_dragon: ACTIVE_TROOP_IMG_MAP.firedragon,
  wind_mage: ACTIVE_TROOP_IMG_MAP.windmage,
  pea_shooter: ACTIVE_TROOP_IMG_MAP.peashooter,
};

function normalizeTroopKey(name) {
  const base = String(name || '').split(':')[0].trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (base === 'necromancer' || base === 'skeletonmage' || base === 'skeleton_mage') return 'necromancer';
  if (base === 'mechanicaldragon' || base === 'mechanical_dragon' || base === 'mechdragon') return 'mechanicaldragon';
  if (base === 'icegolem' || base === 'ice_golem') return 'icegolem';
  if (base === 'horror' || base === 'horrorevolution' || base === 'horror_evolution') return 'horror';
  if (base === 'demonking' || base === 'demon_king') return 'demonking';
  if (base === 'firedragon' || base === 'fire_dragon') return 'firedragon';
  if (base === 'windmage' || base === 'wind_mage') return 'windmage';
  if (base === 'peashooter' || base === 'pea_shooter' || base === 'pea-shooter') return 'peashooter';
  return base;
}

function TroopPortrait({ info, style, fallbackStyle = null }) {
  if (info?.img) return <img src={info.img} alt="" style={style} />;
  if (!info?.monogram) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#2d6f7d',
        background: 'rgba(119, 218, 205, 0.22)',
        border: '1px solid rgba(45, 111, 125, 0.4)',
        borderRadius: 4,
        fontWeight: 900,
        lineHeight: 1,
        ...fallbackStyle,
      }}
    >
      {info.monogram}
    </span>
  );
}

// ── Attack HUD (shown during enemy mode) ──────────────────────────────────
function ManualAttackHUD({
  onSurrender,
  onCannon,
  onRally,
  onMedkit,
  onFreeze,
  onRage,
  onSkeletonBarrel,
  cannonMode,
  rallyMode,
  medkitMode,
  freezeMode,
  rageMode,
  skeletonBarrelMode,
  selectedTroopIdx,
  onSelectTroop,
  cannonEnergy,
  fleetInfo,
  battleTimer,
}) {
  const { isMobile: mobile } = useLayout();
  const [showDetails, setShowDetails] = useState(false);
  const troopScrollRef = useRef(null);
  const groups = fleetInfo?.troop_groups || [];
  const ship = fleetInfo?.ship || {};
  const ready = !!fleetInfo?.ready;

  useLayoutEffect(() => {
    const scroller = troopScrollRef.current;
    const selectedCard = scroller?.querySelector(`[data-troop-index="${selectedTroopIdx}"]`);
    if (!scroller || !selectedCard) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const cardRect = selectedCard.getBoundingClientRect();
    if (cardRect.left < scrollerRect.left) {
      scroller.scrollBy({ left: cardRect.left - scrollerRect.left, behavior: 'auto' });
    } else if (cardRect.right > scrollerRect.right) {
      scroller.scrollBy({ left: cardRect.right - scrollerRect.right, behavior: 'auto' });
    }
  }, [selectedTroopIdx, groups.length]);

  const handleTroopWheel = useCallback((event) => {
    const scroller = event.currentTarget;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    scroller.scrollLeft += event.deltaY;
  }, []);

  return (
    <>
      <div style={{ ...hud.wrapTopRight, ...(mobile ? { top: 'calc(env(safe-area-inset-top, 0px) + 8px)', right: 'calc(env(safe-area-inset-right, 0px) + 8px)' } : {}) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {battleTimer != null && <div style={{ ...hud.timerPill, ...(mobile ? hud.timerPillMobile : {}), color: battleTimer <= 30 ? '#E53935' : '#5C3A21', border: `2px solid ${battleTimer <= 30 ? '#7f0000' : '#9f8759'}` }}>{Math.floor(battleTimer / 60)}:{String(battleTimer % 60).padStart(2, '0')}</div>}
          <button style={{ ...hud.homeBtn, ...(mobile ? hud.homeBtnMobile : {}) }} onClick={onSurrender} title="Surrender" aria-label="Surrender">
            <SurrenderFlagIcon size={mobile ? 24 : 30} />
          </button>
        </div>
      </div>
      <div style={{
        ...hud.wrapLeft,
        right: mobile
          ? 'calc(env(safe-area-inset-right, 0px) + 8px)'
          : 'calc(min(540px, 55vw) + 40px)',
        maxWidth: 'none',
        minWidth: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',
        alignItems: 'flex-end',
        ...(mobile ? {
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 108px)',
          left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
          gap: 4,
        } : {}),
      }}>
        <button style={{ ...hud.card, width: mobile ? 32 : 36, height: mobile ? 32 : 36, padding: 0, borderColor: 'rgba(255,215,0,0.7)', cursor: 'pointer', flexShrink: 0, position: 'relative', overflow: 'visible' }} onClick={(event) => { event.stopPropagation(); setShowDetails(true); }} title={ready ? 'Main ship and army' : 'Main ship approaching'}>
          <img src={shipImg} alt="" style={{ width: '90%', height: '90%', objectFit: 'contain' }} />
          {!ready && mobile && <span aria-hidden="true" style={{ position: 'absolute', right: -3, bottom: -3, width: 10, height: 10, borderRadius: '50%', background: '#2c83ba', border: '2px solid #fff7df', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }} />}
        </button>
        {!ready && !mobile && <div style={{ ...hud.card, width: 116, height: 58, padding: '4px 8px', borderColor: '#2c83ba', color: '#5C3A21', fontSize: 11, fontWeight: 900, textAlign: 'center', flexShrink: 0 }}>MAIN SHIP<br/>APPROACHING...</div>}
        <div
          ref={troopScrollRef}
          className="attack-troop-scroll"
          style={{ ...hud.troopScroller, gap: mobile ? 5 : 7 }}
          onWheel={handleTroopWheel}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          aria-label="Troops available to deploy"
        >
          {groups.map((group, groupIdx) => {
            const info = TROOP_IMG_MAP[normalizeTroopKey(group.key)] || {};
            const selected = selectedTroopIdx === groupIdx;
            const size = mobile ? 56 : 70;
            const displayLabel = (mobile && info.mobileLabel) || info.label || group.label || group.key;
            return (
              <button
                key={group.key || groupIdx}
                data-troop-index={groupIdx}
                style={{ ...hud.card, width: size, minWidth: size, height: size, padding: 2, position: 'relative', flexDirection: 'column', gap: 1, opacity: ready ? 1 : 0.55, borderColor: selected ? '#FFD700' : '#9f8759', boxShadow: selected ? '0 0 12px rgba(255,215,0,0.6), inset 0 0 8px rgba(255,215,0,0.15)' : 'none', cursor: ready ? 'pointer' : 'wait' }}
                onClick={(event) => { event.stopPropagation(); if (ready) onSelectTroop(groupIdx); }}
                disabled={!ready}
                title={`Deploy ${info.label || group.label || group.key}`}
                aria-label={`Deploy ${info.label || group.label || group.key}, ${group.count || 0} remaining`}
                aria-pressed={selected}
              >
                <TroopPortrait
                  info={info}
                  style={{ width: '76%', height: '67%', objectFit: 'contain' }}
                  fallbackStyle={{ fontSize: mobile ? 13 : 16 }}
                />
                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: mobile ? 8 : 9, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase', lineHeight: 1 }}>{displayLabel}</span>
                <span style={{ position: 'absolute', top: -4, right: -4, background: '#5C3A21', color: '#fff7df', fontSize: 9, fontWeight: 900, borderRadius: 6, padding: '1px 5px', border: '1px solid #3d1f00' }}>x{group.count || 0}</span>
              </button>
            );
          })}
        </div>
      </div>
      {showDetails && <div style={hud.shipModal} onClick={() => setShowDetails(false)}><div style={hud.shipModalPanel} onClick={(event) => event.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#5C3A21' }}>Main Ship Lv.{ship.level || 1}</div>
        <img src={shipImg} alt="Main ship" style={{ width: 150, height: 90, objectFit: 'contain' }} />
        <div style={{ fontSize: 12, fontWeight: 800, color: '#5C3A21' }}>{fleetInfo?.remaining ?? 0} units remaining · {ship.capacity || 0} capacity</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 5, width: '100%' }}>{groups.map((group) => { const info = TROOP_IMG_MAP[normalizeTroopKey(group.key)] || {}; return <div key={group.key} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fffaf0', border: '1px solid #d4c8b0', borderRadius: 6, padding: '3px 7px' }}><TroopPortrait info={info} style={{ width: 24, height: 24, objectFit: 'contain' }} fallbackStyle={{ fontSize: 8 }} /><span style={{ fontSize: 10, fontWeight: 800, color: '#5C3A21' }}>{info.label || group.label || group.key} x{group.count || 0}</span></div>; })}</div>
        <button style={{ marginTop: 6, padding: '8px 20px', background: '#fff6dc', border: '2px solid #9f8759', borderRadius: 8, color: '#5C3A21', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setShowDetails(false)}>Close</button>
      </div></div>}
      <div style={{
        ...hud.wrapRight,
        ...(mobile ? {
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
          left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
        } : {}),
      }}><div style={{ ...hud.cannonGroup, width: '100%', ...(mobile ? { gap: 5 } : {}) }}>
        {cannonEnergy && <div style={{ ...hud.energyPill, ...(mobile ? hud.energyPillMobile : {}) }}><span style={{ ...hud.energyIcon, ...(mobile ? hud.energyIconMobile : {}) }}><EnergyBoltIcon size={mobile ? 11 : 15} /></span><span style={{ ...hud.energyValue, ...(mobile ? hud.energyValueMobile : {}) }}>{cannonEnergy.energy}</span></div>}
        <ShipAbilityRail {...{
          mobile,
          cannonEnergy,
          cannonMode,
          rallyMode,
          medkitMode,
          freezeMode,
          rageMode,
          skeletonBarrelMode,
          onCannon,
          onRally,
          onMedkit,
          onFreeze,
          onRage,
          onSkeletonBarrel,
        }} />
      </div></div>
    </>
  );
}

function AttackHUD({
  onReturnHome,
  onSurrender,
  onCannon,
  onRally,
  onMedkit,
  onFreeze,
  onRage,
  onSkeletonBarrel,
  cannonMode,
  rallyMode,
  medkitMode,
  freezeMode,
  rageMode,
  skeletonBarrelMode,
  selectedTroopIdx,
  onSelectTroop,
  cannonEnergy,
  fleetInfo,
  battleTimer,
}) {
  const { isMobile: mobile } = useLayout();
  const [expandedShip, setExpandedShip] = useState(null);

  if (fleetInfo?.mode === 'manual_troops') {
    return <ManualAttackHUD {...{
      onSurrender,
      onCannon,
      onRally,
      onMedkit,
      onFreeze,
      onRage,
      onSkeletonBarrel,
      cannonMode,
      rallyMode,
      medkitMode,
      freezeMode,
      rageMode,
      skeletonBarrelMode,
      selectedTroopIdx,
      onSelectTroop,
      cannonEnergy,
      fleetInfo,
      battleTimer,
    }} />;
  }

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
              color: battleTimer <= 30 ? '#E53935' : '#5C3A21',
              border: `2px solid ${battleTimer <= 30 ? '#7f0000' : '#9f8759'}`,
            }}>
              {Math.floor(battleTimer / 60)}:{String(battleTimer % 60).padStart(2, '0')}
            </div>
          )}
          <button style={hud.homeBtn} onClick={onSurrender} title="Surrender"
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'}
            onMouseOut={e => e.currentTarget.style.filter = 'none'}
          >
            <SurrenderFlagIcon />
          </button>
        </div>
      </div>

      {/* Ships - Bottom Left: compact ship icons */}
      <div
        className="attack-troop-scroll"
        style={{
          ...hud.wrapLeft,
          right: mobile
            ? 'calc(env(safe-area-inset-right, 0px) + 8px)'
            : 'calc(min(540px, 55vw) + 40px)',
          minWidth: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          ...(mobile ? {
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 108px)',
            left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
            gap: 4,
            flexWrap: 'nowrap',
            maxWidth: 'none',
          } : {}),
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        aria-label="Fleet deployment controls"
      >
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
          const realTroops = troops.filter((troop) => String(troop || '') !== '_SLOT_FILLER_');
          const isSelected = !isPlaced && selectedTroopIdx === shipIdx;
          const sz = mobile ? 56 : 70;
          const portNumber = Number(ship.port_number || shipIdx + 1);
          const previewTroops = realTroops.slice(0, mobile ? 2 : 3);
          const remainingTroops = Math.max(0, realTroops.length - previewTroops.length);

          return (
            <button
              key={shipIdx}
              style={{
                ...hud.card,
                width: sz, height: sz,
                opacity: isPlaced ? 0.5 : 1,
                borderColor: isSelected ? '#FFD700' : isPlaced ? 'rgba(159,135,89,0.4)' : '#9f8759',
                boxShadow: isSelected ? '0 0 12px rgba(255,215,0,0.6), inset 0 0 8px rgba(255,215,0,0.15)' : 'none',
                cursor: isPlaced ? 'default' : 'pointer',
                flexDirection: 'column', gap: 0, padding: 2, position: 'relative',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isPlaced) onSelectTroop(shipIdx);
              }}
            >
              <img src={shipImg} alt="" style={{ width: '80%', height: '55%', objectFit: 'contain', filter: isPlaced ? 'grayscale(0.7) brightness(0.7)' : 'none' }} />
              <div style={{ fontSize: 7, fontWeight: 800, color: '#8b6b3f', textTransform: 'uppercase', lineHeight: 1 }}>
                {isPlaced ? 'DEPLOYED' : `Lv.${ship.level}`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, height: mobile ? 13 : 15, marginTop: 1 }}>
                {previewTroops.map((troop, index) => {
                  const info = TROOP_IMG_MAP[normalizeTroopKey(troop)] || {};
                  return (
                    <span key={`${troop}-${index}`} style={{ width: mobile ? 11 : 13, height: mobile ? 11 : 13, borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(92,58,33,0.45)', background: '#fff6dc' }}>
                      <TroopPortrait info={info} style={{ width: '100%', height: '100%', objectFit: 'cover' }} fallbackStyle={{ fontSize: 6, border: 'none', borderRadius: 0 }} />
                    </span>
                  );
                })}
                {remainingTroops > 0 && <span style={{ fontSize: mobile ? 7 : 8, fontWeight: 900, color: '#5C3A21' }}>+{remainingTroops}</span>}
              </div>
              <div style={{ position: 'absolute', top: -4, left: -4, background: '#2c83ba', color: '#fff7df', fontSize: mobile ? 9 : 10, fontWeight: 900, borderRadius: 6, padding: '1px 5px', border: '1px solid #15567f', boxShadow: '0 2px 3px rgba(0,0,0,0.25)' }}>
                P{portNumber}
              </div>
              {/* Troop count badge */}
              <div style={{ position: 'absolute', top: -4, right: -4, background: '#5C3A21', color: '#fff7df', fontSize: 9, fontWeight: 900, borderRadius: 6, padding: '1px 5px', border: '1px solid #3d1f00' }}>
                x{realTroops.length}
              </div>
            </button>
          );
        })}
      </div>

      {/* Fleet details modal */}
      {expandedShip !== null && (
        <div style={hud.shipModal} onClick={() => setExpandedShip(null)}>
          <div style={hud.shipModalPanel} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#5C3A21', textAlign: 'center', marginBottom: 10, letterSpacing: 0.3 }}>
              Fleet — {ships.length} Ships
            </div>
            {ships.map((ship, si) => {
              const troops = ship.troops || [];
              const portNumber = Number(ship.port_number || si + 1);
              const groups = {};
              for (const t of troops) {
                if (String(t || '') === '_SLOT_FILLER_') continue;
                const key = normalizeTroopKey(t);
                groups[key] = (groups[key] || 0) + 1;
              }
              return (
                <div key={si} style={{ width: '100%', marginBottom: 8, padding: '8px 10px', background: '#fff6dc', borderRadius: 10, border: '2px solid #d4c8b0' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', marginBottom: 4, padding: '2px 7px', borderRadius: 7, background: '#2c83ba', color: '#fff7df', border: '1px solid #15567f', fontSize: 11, fontWeight: 900 }}>
                    Port P{portNumber}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: ship.placed ? '#9f8759' : '#5C3A21', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    Ship {si + 1} (Lv.{ship.level}) — {ship.placed ? 'DEPLOYED' : `${troops.length} troops`}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.entries(groups).map(([key, count]) => {
                      const info = TROOP_IMG_MAP[key] || {};
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#fffaf0', border: '1px solid #d4c8b0', borderRadius: 6, padding: '2px 6px' }}>
                          <div style={{ width: 22, height: 22, borderRadius: 3, overflow: 'hidden' }}>
                            <TroopPortrait info={info} style={{ width: '100%', height: '100%', objectFit: 'cover' }} fallbackStyle={{ fontSize: 7, border: 'none' }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#5C3A21' }}>{info.label || key} x{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <button style={{ marginTop: 6, padding: '8px 20px', background: '#fff6dc', border: '2px solid #9f8759', borderRadius: 10, color: '#5C3A21', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setExpandedShip(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Cannon + Energy - Bottom Right */}
      <div style={{
        ...hud.wrapRight,
        ...(mobile ? {
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
          left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
        } : {}),
      }}>
        <div style={{ ...hud.cannonGroup, width: '100%', ...(mobile ? { gap: 5 } : {}) }}>
          {cannonEnergy && (
            <div style={{ ...hud.energyPill, ...(mobile ? hud.energyPillMobile : {}) }}>
              <span style={{ ...hud.energyIcon, ...(mobile ? hud.energyIconMobile : {}) }}><EnergyBoltIcon size={mobile ? 11 : 15} /></span>
              <span style={{ ...hud.energyValue, ...(mobile ? hud.energyValueMobile : {}) }}>{cannonEnergy.energy}</span>
            </div>
          )}
          <ShipAbilityRail {...{
            mobile,
            cannonEnergy,
            cannonMode,
            rallyMode,
            medkitMode,
            freezeMode,
            rageMode,
            skeletonBarrelMode,
            onCannon,
            onRally,
            onMedkit,
            onFreeze,
            onRage,
            onSkeletonBarrel,
          }} />
        </div>
      </div>
    </>
  );
}

// ── Replay HUD (shown during replay mode) ────────────────────────────────
const REPLAY_SPEEDS = [1];

const formatReplayTime = (seconds) => {
  const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

function ReplayHUD({ onReturnHome, battleTimer, replayDuration = 0, replayLabel = 'REPLAY', liveAgentBattle = false }) {
  const { sendToGodot } = useSend();
  const { isMobile: mobile } = useLayout();
  const [speedIdx, setSpeedIdx] = useState(0);
  const [fallbackRemaining, setFallbackRemaining] = useState(null);
  const fallbackRef = useRef({ remaining: null, lastTick: 0, speed: 1 });
  const replayDurationSec = Number.isFinite(Number(replayDuration)) ? Math.max(0, Number(replayDuration)) : 0;
  const isLiveAgentBattle = liveAgentBattle || String(replayLabel || '').toUpperCase().includes('AI ONLINE');

  useEffect(() => {
    const remaining = replayDurationSec > 0 ? Math.ceil(replayDurationSec) : null;
    fallbackRef.current = {
      remaining,
      lastTick: performance.now(),
      speed: 1,
    };
    setFallbackRemaining(remaining);
  }, [replayDurationSec]);

  useEffect(() => {
    fallbackRef.current.speed = REPLAY_SPEEDS[speedIdx] || 1;
    fallbackRef.current.lastTick = performance.now();
  }, [speedIdx]);

  useEffect(() => {
    const id = setInterval(() => {
      const state = fallbackRef.current;
      if (state.remaining == null) return;
      const now = performance.now();
      const elapsed = Math.max(0, (now - state.lastTick) / 1000) * state.speed;
      state.lastTick = now;
      state.remaining = Math.max(0, state.remaining - elapsed);
      setFallbackRemaining(Math.ceil(state.remaining));
    }, 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const next = Number(battleTimer);
    if (!Number.isFinite(next) || next <= 0) return;
    fallbackRef.current.remaining = next;
    fallbackRef.current.lastTick = performance.now();
    setFallbackRemaining(Math.ceil(next));
  }, [battleTimer]);

  const godotRemaining = Number.isFinite(Number(battleTimer)) ? Math.max(0, Math.ceil(Number(battleTimer))) : null;
  const remaining = godotRemaining != null ? godotRemaining : fallbackRemaining;

  const handleSpeed = useCallback(() => {
    const next = (speedIdx + 1) % REPLAY_SPEEDS.length;
    setSpeedIdx(next);
    sendToGodot('replay_speed', { speed: REPLAY_SPEEDS[next] });
  }, [speedIdx, sendToGodot]);

  const topRightStyle = mobile
    ? { ...hud.wrapTopRight, top: 'calc(env(safe-area-inset-top, 0px) + 10px)', right: 10 }
    : hud.wrapTopRight;
  const controlRowStyle = mobile
    ? { display: 'flex', alignItems: 'center', gap: 8 }
    : { display: 'flex', alignItems: 'center', gap: 10 };
  const speedBtnStyle = mobile ? { ...hud.speedBtn, ...hud.replayControlMobile } : hud.speedBtn;
  const homeBtnStyle = mobile ? { ...hud.homeBtn, ...hud.replayControlMobile } : hud.homeBtn;
  const replayCountdownStyle = mobile ? { ...hud.replayCountdownWrap, ...hud.replayCountdownMobile } : hud.replayCountdownWrap;
  const replayCountdownLabelStyle = mobile ? { ...hud.replayCountdownLabel, fontSize: 8, marginBottom: 2 } : hud.replayCountdownLabel;
  const replayCountdownTimeStyle = mobile ? { ...hud.replayCountdownTime, fontSize: 24 } : hud.replayCountdownTime;
  const badgeLabel = isLiveAgentBattle ? 'AI ONLINE' : replayLabel;

  return (
    <>
      {/* Center banner is reserved for the replay countdown only. The
          AI-ONLINE state used to render a second big "LIVE BATTLE"
          banner here — that duplicated the same "AI ONLINE" label
          already shown in the small right-side badge next to the
          surrender flag, so we drop it. */}
      {!isLiveAgentBattle && remaining != null && (
        <div style={replayCountdownStyle} aria-live="polite">
          <div style={replayCountdownLabelStyle}>REPLAY ENDS IN</div>
          <div style={replayCountdownTimeStyle}>{formatReplayTime(remaining)}</div>
        </div>
      )}
      <div style={topRightStyle}>
      <div style={controlRowStyle}>
        {REPLAY_SPEEDS.length > 1 && (
          <button style={speedBtnStyle} onClick={handleSpeed} title="Change speed"
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'}
            onMouseOut={e => e.currentTarget.style.filter = 'none'}
          >
            <span style={hud.speedText}>{REPLAY_SPEEDS[speedIdx]}x</span>
          </button>
        )}
        <div style={mobile ? { ...hud.replayBadge, ...hud.replayBadgeMobile } : hud.replayBadge}>{badgeLabel}</div>
        <button style={homeBtnStyle} onClick={onReturnHome} title="Return Home"
          onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'}
          onMouseOut={e => e.currentTarget.style.filter = 'none'}
        >
          <SurrenderFlagIcon size={mobile ? 26 : 30} />
        </button>
      </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────
// ── NFT shop icon — cartoon storefront with striped awning + windows
// showing the valuables on offer (coin + gem). Sits in the action bar
// next to the tournament/battle-log buttons; line weights and palette
// match the rest of the HUD (~2-2.5px strokes, brown #5C3A21 outlines,
// cream/red/gold accents).
const NftMintIcon = ({ size = 50 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }}>
    {/* Ground shadow */}
    <ellipse cx="32" cy="60" rx="26" ry="2.5" fill="rgba(0,0,0,0.25)" />

    {/* Roof banner — small gold pennant on a pole */}
    <line x1="32" y1="12" x2="32" y2="4" stroke="#5C3A21" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M32 4 L41 6.5 L32 9 Z" fill="#FFD700" stroke="#3d1f00" strokeWidth="1.2" strokeLinejoin="round" />

    {/* Building body */}
    <rect x="6" y="20" width="52" height="38" fill="#e6c894" stroke="#5C3A21" strokeWidth="2.5" />
    {/* Wooden floorboards hint */}
    <line x1="6" y1="52" x2="58" y2="52" stroke="#5C3A21" strokeWidth="1.2" opacity="0.5" />

    {/* Striped awning — red + cream alternating */}
    <path d="M3 20 L61 20 L55 11 L9 11 Z" fill="#d72b1c" stroke="#5a0d05" strokeWidth="2" strokeLinejoin="round" />
    <path d="M16 20 L19 11" stroke="#fff2c2" strokeWidth="3" />
    <path d="M27 20 L29 11" stroke="#fff2c2" strokeWidth="3" />
    <path d="M37 20 L36 11" stroke="#fff2c2" strokeWidth="3" />
    <path d="M48 20 L46 11" stroke="#fff2c2" strokeWidth="3" />
    {/* Awning scalloped bottom edge */}
    <path d="M3 20 Q 9 24 15 20 T 27 20 T 39 20 T 51 20 T 61 20"
          fill="none" stroke="#5a0d05" strokeWidth="1.5" strokeLinejoin="round" />

    {/* Arched door, centered */}
    <path d="M26 58 L26 41 Q26 35 32 35 Q38 35 38 41 L38 58 Z"
          fill="#8b5a2b" stroke="#3d1f00" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="35" cy="47" r="1.3" fill="#FFD700" stroke="#3d1f00" strokeWidth="0.6" />

    {/* Left window — coin on display */}
    <rect x="9" y="27" width="13" height="10" fill="#a8d0e8" stroke="#3d1f00" strokeWidth="1.5" />
    <line x1="15.5" y1="27" x2="15.5" y2="37" stroke="#3d1f00" strokeWidth="1" opacity="0.6" />
    <circle cx="15.5" cy="32" r="3" fill="#FFD700" stroke="#3d1f00" strokeWidth="1" />

    {/* Right window — gem on display (echoes the NFT theme) */}
    <rect x="42" y="27" width="13" height="10" fill="#a8d0e8" stroke="#3d1f00" strokeWidth="1.5" />
    <line x1="48.5" y1="27" x2="48.5" y2="37" stroke="#3d1f00" strokeWidth="1" opacity="0.6" />
    <path d="M48.5 28 L52 32 L48.5 36 L45 32 Z" fill="#d72b9c" stroke="#5a0d4a" strokeWidth="1" strokeLinejoin="round" />
  </svg>
);

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

function ActionButtons({ onOpenBattleLog, onOpenBots }) {
  const { sendToGodot, setFuturesOpen } = useSend();
  const {
    enemyMode,
    cannonMode,
    rallyMode,
    medkitMode,
    freezeMode,
    rageMode,
    skeletonBarrelMode,
    selectedTroopIdx,
    cannonEnergy,
    fleetInfo,
    pendingCasualties,
    setPendingCasualties,
    battleTimer,
  } = useUI();
  const player = usePlayer();
  const token = player?.token || null;
  const [showReinforce, setShowReinforce] = useState(false);
  const [serverCasualties, setServerCasualties] = useState(null);
  const [loadingCasualties, setLoadingCasualties] = useState(false);
  const [showTournament, setShowTournament] = useState(false);
  const [showNftMint, setShowNftMint] = useState(false);
  const [nftMintInitial, setNftMintInitial] = useState(null);
  const resources = useResources();
  const { buildingDefs } = useBuildingDefs();
  const { isMobile: mobile, isLandscape, actionScale } = useLayout();
  const townHallLevel = buildingDefs?.th_level || 1;
  const attackCost = useMemo(() => attackCostForTownHall(townHallLevel), [townHallLevel]);
  const canAffordAttack = (resources.gold || 0) >= attackCost;

  // Count how many buildings the player can actually build right now
  const affordableCount = useMemo(() => {
    const defs = buildingDefs?.buildings || {};
    const placed = buildingDefs?.placed_counts || {};
    const thMaxCounts = buildingDefs?.th_max_counts || {};
    const thUnlock = buildingDefs?.th_unlock || {};
    const thLevel = buildingDefs?.th_level || 1;
    const hasTownHall = (placed.town_hall || 0) > 0;
    const altarUnlocked = !!(player?.building_unlocks?.altar || player?.shop_entitlements?.altar || player?.altar?.active);
    let count = 0;
    for (const [id, def] of Object.entries(defs)) {
      if (id === 'flag' || def?.no_shop) continue;
      if (id === 'altar' && !altarUnlocked) continue;
      if (!hasTownHall && id !== 'town_hall') continue;
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
  }, [buildingDefs, resources, player?.altar?.active, player?.building_unlocks?.altar, player?.shop_entitlements?.altar]);

  const [showSurrender, setShowSurrender] = useState(false);
  useEffect(() => {
    const onOpenNftShop = (event) => {
      setNftMintInitial(event?.detail || null);
      setShowNftMint(true);
    };
    window.addEventListener('clash-open-nft-shop', onOpenNftShop);
    return () => window.removeEventListener('clash-open-nft-shop', onOpenNftShop);
  }, []);

  const handleReturnHome  = useCallback(() => sendToGodot('return_home'),     [sendToGodot]);
  const handleFindEnemy   = useCallback(() => {
    if (!canAffordAttack) {
      window.onGodotMessage?.({
        action: 'error',
        data: { message: `Need ${attackCost} gold to attack` },
      });
      return;
    }
    sendToGodot('find_enemy');
  }, [sendToGodot, canAffordAttack, attackCost]);
  const handleOpenShop    = useCallback(() => sendToGodot('open_shop'),        [sendToGodot]);
  const handleOpenTrade   = useCallback(() => setFuturesOpen(true),            [setFuturesOpen]);
  const handleShipCannon  = useCallback(() => sendToGodot('ship_cannon_mode'), [sendToGodot]);
  const handleShipRally   = useCallback(() => sendToGodot('ship_rally_mode'), [sendToGodot]);
  const handleShipMedkit  = useCallback(() => sendToGodot('ship_medkit_mode'), [sendToGodot]);
  const handleShipFreeze  = useCallback(() => sendToGodot('ship_freeze_mode'), [sendToGodot]);
  const handleShipRage    = useCallback(() => sendToGodot('ship_rage_mode'), [sendToGodot]);
  const handleSkeletonBarrel = useCallback(() => sendToGodot('ship_skeleton_barrel_mode'), [sendToGodot]);
  const handleSelectTroop = useCallback((idx) => {
    console.log('[SELECT TROOP]', idx, 'cannonMode:', cannonMode);
    if (cannonMode) sendToGodot('ship_cannon_mode'); // toggle off cannon
    if (rallyMode) sendToGodot('ship_rally_mode');   // toggle off rally so a stale click doesn't drop a marker mid-troop-select
    if (medkitMode) sendToGodot('ship_medkit_mode');
    if (freezeMode) sendToGodot('ship_freeze_mode');
    if (rageMode) sendToGodot('ship_rage_mode');
    if (skeletonBarrelMode) sendToGodot('ship_skeleton_barrel_mode');
    sendToGodot('select_troop', { idx });
  }, [sendToGodot, cannonMode, rallyMode, medkitMode, freezeMode, rageMode, skeletonBarrelMode]);

  if (enemyMode.active) {
    // Replay mode — only show return button, no attack controls
    if (enemyMode.is_replay) {
      return (
        <ReplayHUD
          onReturnHome={handleReturnHome}
          battleTimer={battleTimer}
          replayDuration={enemyMode.duration}
          replayLabel={enemyMode.replay_label || 'REPLAY'}
          liveAgentBattle={!!enemyMode.live_agent_battle}
        />
      );
    }
    return (
      <>
      <AttackHUD
        onReturnHome={handleReturnHome}
        onSurrender={() => setShowSurrender(true)}
        onCannon={handleShipCannon}
        onRally={handleShipRally}
        onMedkit={handleShipMedkit}
        onFreeze={handleShipFreeze}
        onRage={handleShipRage}
        onSkeletonBarrel={handleSkeletonBarrel}
        cannonMode={cannonMode}
        rallyMode={rallyMode}
        medkitMode={medkitMode}
        freezeMode={freezeMode}
        rageMode={rageMode}
        skeletonBarrelMode={skeletonBarrelMode}
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
              <div style={{ display: 'flex', justifyContent: 'center', color: '#B71C1C' }}>
                <SurrenderFlagIcon size={42} />
              </div>
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

  // Action bar sizing — base values target a comfortable ~400px-wide
  // phone. Narrower devices receive an actionScale (<1) from useLayout
  // so the SHOP / ATTACK / TRADE / AI cluster keeps fitting on 360 and
  // even 320 px screens without the buttons clipping each other.
  const btnSize = Math.round((mobile ? 110 : 140) * actionScale);
  const btnSmall = Math.round((mobile ? 88 : 110) * actionScale);
  const replayBtnSize = mobile ? Math.round(btnSmall / 1.5) : btnSmall;
  const battleLogButton = (
    <CustomBtn onClick={onOpenBattleLog} width={replayBtnSize} height={replayBtnSize}>
      <ShieldIcon size={mobile ? 27 : 60} />
    </CustomBtn>
  );
  const shopButton = (
    <CustomBtn onClick={handleOpenShop} width={btnSmall} height={btnSmall} data-tutorial="build-btn">
      {affordableCount > 0 && <div style={styles.notificationBadgeSmall}>{affordableCount}</div>}
      <img src={buildIcon} alt="build" style={{ ...styles.buildIconImgSmall, ...(mobile ? { width: 75, height: 75 } : {}) }} />
    </CustomBtn>
  );
  const nftMintButton = (
    <CustomBtn
      onClick={() => {
        setNftMintInitial(null);
        setShowNftMint(true);
      }}
      width={btnSmall}
      height={btnSmall}
      data-tutorial="nft-mint-btn"
    >
      <NftMintIcon size={mobile ? 38 : 50} />
    </CustomBtn>
  );
  const botsButton = (
    <CustomBtn
      onClick={onOpenBots}
      width={btnSmall}
      height={btnSmall}
      data-tutorial="bots-btn"
      title="Open trading bots"
      aria-label="Open trading bots"
    >
      <img
        src={mmBotIcon}
        alt=""
        aria-hidden="true"
        style={{ ...styles.botIconImg, ...(mobile ? styles.botIconImgMobile : {}) }}
      />
      <span style={{ ...styles.btnLabel, bottom: mobile ? 16 : 22, fontSize: mobile ? 9 : 11 }}>BOT</span>
    </CustomBtn>
  );

  return (
    <>
      {mobile && (
        <div style={styles.mobileBattleLogWrap}>
          {battleLogButton}
        </div>
      )}
      <div style={{ ...styles.wrapLeft, ...(mobile ? { bottom: 8, left: 8, gap: 4 } : {}) }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          {mobile ? nftMintButton : battleLogButton}
          <CustomBtn onClick={handleFindEnemy} width={btnSize} height={btnSize} data-tutorial="attack-btn">
            <img src={attackIcon} alt="attack" style={{ ...styles.attackIconImg, ...(mobile ? { width: 95, height: 95 } : {}) }} />
            <div style={{ ...styles.attackCostBadge, ...(canAffordAttack ? {} : styles.attackCostBadgeLocked), ...(mobile ? styles.attackCostBadgeMobile : {}) }}>
              <img src={goldIcon} alt="" style={styles.attackCostIcon} />
              <span>{attackCost}</span>
            </div>
            <span style={styles.btnLabel}>ATTACK</span>
          </CustomBtn>
        </div>
        {shopButton}
      </div>
      <div style={{ ...styles.wrapRight, ...(mobile ? { bottom: 8, right: 8 } : {}) }}>
        <div style={styles.rightUtilityStack}>
          {pendingCasualties && (
            <CustomBtn onClick={() => {
              // Snapshot the token value at click time AND the player_id so a
              // stale response (user switched account mid-flight) is dropped
              // before it can paint another player's casualty list into the
              // REINFORCE modal. Without this, clicking Reinforce then rapidly
              // switching account left the callback free to set Bob's
              // serverCasualties from Alice's data.
              const fetchToken = token;
              const fetchPlayerId = player?.player_id;
              if (!fetchToken) { setLoadingCasualties(false); return; }
              setLoadingCasualties(true);
              fetch('/api/casualties', { headers: { 'x-token': fetchToken } })
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (!data) return;
                  // Stale-response guard: if the player_id changed while this
                  // fetch was in flight, drop the result rather than show
                  // the old account's data to the new one.
                  if (player?.player_id !== fetchPlayerId) return;
                  if (data.total > 0) {
                    setServerCasualties(data);
                    setShowReinforce(true);
                  } else {
                    setPendingCasualties(null);
                  }
                })
                .catch(() => { /* don't show modal on network error */ })
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
          {/* NFT mint stays in the right-side stack on desktop; mobile uses
              the old battle-log slot above ATTACK. */}
          {!mobile && nftMintButton}
          <CustomBtn onClick={() => setShowTournament(true)} width={btnSmall} height={btnSmall} data-tutorial="tournament-btn">
            <img
              src={tournamentIcon}
              alt="Tournament"
              style={mobile ? styles.tournamentIconImgMobile : styles.tournamentIconImg}
            />
          </CustomBtn>
        </div>
        <div style={styles.tradeButtonRow}>
          {onOpenBots && botsButton}
          <CustomBtn onClick={handleOpenTrade} width={btnSize} height={btnSize} data-tutorial="trade-btn">
            {(window._openPositionsCount || 0) > 0 && <div style={styles.notificationBadge}>!</div>}
            <img src={chartIcon} alt="trade" style={{ ...styles.chartIconImg, ...(mobile ? { width: 90, height: 90 } : {}) }} />
            <span style={styles.btnLabel}>TRADE</span>
          </CustomBtn>
        </div>
      </div>
      {showTournament && <TournamentPanel onClose={() => setShowTournament(false)} />}
      {showNftMint && (
        <NftMintPanel
          initialView={nftMintInitial?.view}
          initialUpgradeRequest={nftMintInitial?.request}
          onClose={() => {
            setShowNftMint(false);
            setNftMintInitial(null);
          }}
        />
      )}
      {showReinforce && (serverCasualties || pendingCasualties) && (
        <ReinforceModal
          casualties={serverCasualties?.casualties || pendingCasualties}
          cost={serverCasualties?.cost}
          onConfirm={() => {
            sendToGodot('reinforce');
            setShowReinforce(false);
            setServerCasualties(null);
            // Don't clear pendingCasualties here — wait for server 'reinforced' event
          }}
          onClose={() => { setShowReinforce(false); setServerCasualties(null); }}
        />
      )}
    </>
  );
}

const REINFORCE_COST_PER_SLOT = 50;
const REINFORCE_SLOT_COSTS = {
  Knight: 1,
  Archer: 1,
  PeaShooter: 5,
  Mage: 4,
  Mimic: 6,
  MechanicalDragon: 4,
  IceGolem: 10,
  Necromancer: 15,
  windmage: 15,
  Horror: 20,
};
const UNIT_IMG_MAP = {
  Knight: knightImg, Mage: mageImg, Barbarian: berserkImg, Archer: archerImg,
  Mimic: mimicImg, Necromancer: necromancerImg, Horror: horrorImg,
  MechanicalDragon: mechanicalDragonImg, IceGolem: iceGolemImg, Ranger: arbaletImg,
  WindMage: windMageImg,
  PeaShooter: peaShooterImg,
};

function ReinforceModal({ casualties, cost: serverCost, onConfirm, onClose }) {
  const entries = Object.entries(casualties).filter(([, c]) => c > 0);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  const totalSlots = entries.reduce(
    (sum, [name, count]) => sum + count * (
      REINFORCE_SLOT_COSTS[name] || REINFORCE_SLOT_COSTS[normalizeTroopKey(name)] || 1
    ),
    0,
  );
  const cost = serverCost ?? totalSlots * REINFORCE_COST_PER_SLOT;

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
                  {UNIT_IMG_MAP[name]
                    ? <img src={UNIT_IMG_MAP[name]} alt={name} style={rf.img} />
                    : normalizeTroopKey(name) === 'windmage'
                    ? <span aria-hidden="true" style={{ ...rf.img, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#2d6f7d', background: 'rgba(119, 218, 205, 0.22)', border: '1px solid rgba(45, 111, 125, 0.4)', borderRadius: 4, fontSize: 12, fontWeight: 900 }}>WM</span>
                    : null}
                  <div style={rf.countBadge}>x{count}</div>
                </div>
                <span style={rf.name}>
                  {name === 'Mimic' ? 'Barrel' : name === 'MechanicalDragon' ? 'Mech Dragon' : name === 'IceGolem' ? 'Ice Golem' : normalizeTroopKey(name) === 'windmage' ? 'Wind Mage' : name}
                </span>
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
    background: 'linear-gradient(180deg, #fff6dc 0%, #ead9b2 100%)',
    border: '2px solid #9f8759',
    borderRadius: 10,
    fontSize: 20, fontWeight: 900,
    letterSpacing: 0,
    color: '#5C3A21',
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
    boxShadow: '0 4px 10px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.5)',
    fontVariantNumeric: 'tabular-nums',
  },
  timerPillMobile: {
    padding: '5px 9px',
    borderRadius: 8,
    fontSize: 15,
  },
  homeBtn: {
    width: 56, height: 56,
    padding: 0,
    background: 'linear-gradient(180deg, #E53935 0%, #b71c1c 100%)',
    border: '3px solid #7f0000',
    borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0, overflow: 'hidden',
    transition: 'filter 0.15s',
    outline: 'none',
    color: '#fff',
    boxShadow: '0 4px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.25)',
  },
  homeBtnMobile: {
    width: 44,
    height: 44,
    borderRadius: 11,
  },
  replayBadge: {
    padding: '8px 16px',
    background: 'linear-gradient(180deg, #ffd76a 0%, #c2851b 100%)',
    border: '2px solid #5C3A21',
    borderRadius: 10,
    color: '#3a1f00', fontSize: 14, fontWeight: 900,
    letterSpacing: '1px',
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
    boxShadow: '0 4px 10px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  replayBadgeMobile: {
    padding: '7px 9px',
    borderRadius: 9,
    fontSize: 10,
    letterSpacing: 0,
    maxWidth: 112,
    textAlign: 'center',
    whiteSpace: 'normal',
    lineHeight: 1.1,
  },
  replayCountdownWrap: {
    position: 'fixed',
    top: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 11,
    pointerEvents: 'none',
    minWidth: 128,
    padding: '8px 16px 10px',
    background: 'linear-gradient(180deg, #fff6dc 0%, #ead9b2 100%)',
    border: '3px solid #9f8759',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.55)',
    color: '#5C3A21',
    textAlign: 'center',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  replayCountdownMobile: {
    top: 'calc(env(safe-area-inset-top, 0px) + 66px)',
    right: 10,
    left: 'auto',
    transform: 'none',
    minWidth: 92,
    padding: '5px 10px 7px',
    borderRadius: 10,
    zIndex: 101,
  },
  replayCountdownLabel: {
    color: '#8b6b3f',
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.5,
    lineHeight: 1.1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  replayCountdownTime: {
    color: '#5C3A21',
    fontSize: 30,
    fontWeight: 900,
    lineHeight: 1,
    textShadow: '0 1px 0 rgba(255,255,255,0.55)',
    fontVariantNumeric: 'tabular-nums',
  },
  speedBtn: {
    width: 56, height: 56,
    background: 'linear-gradient(180deg, #fff6dc 0%, #ead9b2 100%)',
    border: '2px solid #9f8759',
    borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
    transition: 'filter 0.15s',
    outline: 'none',
    boxShadow: '0 4px 10px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  replayControlMobile: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  speedText: {
    color: '#5C3A21', fontSize: 18, fontWeight: 900,
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
  },
  sep: {
    width: 2, height: 68,
    background: 'linear-gradient(180deg, transparent, #9f8759, transparent)',
    borderRadius: 1, flexShrink: 0,
  },
  troopRow: {
    display: 'flex', flexDirection: 'row', gap: 7, alignItems: 'center',
  },
  troopScroller: {
    display: 'flex',
    flex: '1 1 auto',
    width: 'auto',
    maxWidth: '100%',
    minWidth: 0,
    alignItems: 'flex-end',
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '5px 5px 4px',
    margin: '-5px -5px -4px 0',
    overscrollBehaviorX: 'contain',
    touchAction: 'pan-x',
    WebkitOverflowScrolling: 'touch',
  },
  card: {
    position: 'relative',
    width: 74, height: 88,
    background: 'linear-gradient(180deg, #fff6dc 0%, #ead9b2 100%)',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#9f8759',
    borderRadius: 14,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'flex-start',
    padding: '4px 3px 2px',
    overflow: 'hidden',
    transition: 'opacity 0.25s, border-color 0.2s, box-shadow 0.2s',
    outline: 'none',
    boxShadow: '0 4px 10px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.45)',
  },
  cardImgWrap: {
    width: 64, height: 62,
    borderRadius: 9,
    flexShrink: 0,
    overflow: 'hidden',
  },
  countBadge: {
    position: 'absolute', bottom: 19, right: 3,
    background: '#5C3A21',
    border: '1px solid #3d1f00',
    borderRadius: 6, padding: '1px 5px',
  },
  countText: {
    color: '#fff7df', fontSize: 12, fontWeight: 900,
    lineHeight: 1.2,
  },
  selArrow: {
    position: 'absolute', bottom: 19, left: 4,
    color: '#c2851b', fontSize: 9, lineHeight: 1,
    textShadow: '0 0 6px rgba(194,133,27,0.7)',
  },
  shipModal: {
    position: 'fixed', inset: 0, background: 'rgba(20,12,4,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, pointerEvents: 'all',
  },
  shipModalPanel: {
    background: '#fdf8e7',
    border: '6px solid #d4c8b0', borderRadius: 18,
    padding: '16px 20px', maxWidth: 320, width: 'calc(100% - 32px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    color: '#5C3A21',
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
    background: 'linear-gradient(180deg, #fff6dc 0%, #ead9b2 100%)',
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: '#9f8759',
    borderRadius: 18,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    cursor: 'pointer', flexShrink: 0,
    transition: 'border-color 0.2s, box-shadow 0.2s, filter 0.2s',
    outline: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  cannonActive: {
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: 'rgba(255,155,0,0.88)',
    boxShadow: '0 0 22px rgba(255,155,0,0.5), inset 0 0 10px rgba(255,155,0,0.12)',
    filter: 'brightness(1.18)',
  },
  rallyActive: {
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: 'rgba(255,55,40,0.95)',
    boxShadow: '0 0 22px rgba(255,55,40,0.55), inset 0 0 10px rgba(255,55,40,0.18)',
    filter: 'brightness(1.18)',
  },
  medkitActive: {
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: 'rgba(32,184,101,0.95)',
    boxShadow: '0 0 22px rgba(32,184,101,0.55), inset 0 0 10px rgba(32,184,101,0.18)',
    filter: 'brightness(1.12)',
  },
  freezeActive: {
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: 'rgba(70,203,255,0.95)',
    boxShadow: '0 0 22px rgba(70,203,255,0.55), inset 0 0 10px rgba(70,203,255,0.18)',
    filter: 'brightness(1.14)',
  },
  rageActive: {
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: 'rgba(197,65,222,0.95)',
    boxShadow: '0 0 22px rgba(197,65,222,0.55), inset 0 0 10px rgba(197,65,222,0.18)',
    filter: 'brightness(1.14)',
  },
  skeletonBarrelActive: {
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: 'rgba(223,139,45,0.95)',
    boxShadow: '0 0 22px rgba(223,139,45,0.55), inset 0 0 10px rgba(223,139,45,0.18)',
    filter: 'brightness(1.14)',
  },
  abilityRail: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexShrink: 0,
    minWidth: 0,
    maxWidth: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '4px 2px 5px',
    boxSizing: 'border-box',
    overscrollBehaviorX: 'contain',
    touchAction: 'pan-x',
    WebkitOverflowScrolling: 'touch',
  },
  cannonDisabled: {
    opacity: 0.35,
    filter: 'grayscale(1) brightness(0.5)',
    cursor: 'default',
  },
  cannonLabel: {
    color: '#5C3A21', fontSize: 10, fontWeight: 900,
    textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1,
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
  },
  cannonCostBadge: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    color: '#3a1f00',
    fontSize: 14,
    fontWeight: 900,
    textShadow: '0 1px 0 rgba(255,255,255,0.55)',
  },
  cannonCostBadgeMobile: {
    bottom: 1,
    right: 3,
    fontSize: 11,
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
    background: 'linear-gradient(180deg, #fff6dc 0%, #ead9b2 100%)',
    border: '2px solid #9f8759',
    borderRadius: 10,
    padding: '6px 12px',
    display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
    boxShadow: '0 4px 10px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  energyPillMobile: {
    borderRadius: 8,
    padding: '3px 7px',
    gap: 4,
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
  energyIconMobile: {
    width: 18,
    height: 18,
  },
  energyValue: {
    fontSize: 22, fontWeight: 900, color: '#5C3A21',
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
  },
  energyValueMobile: {
    fontSize: 16,
  },
};

// ── Normal mode styles ─────────────────────────────────────────────────────
const base = { position: 'fixed', bottom: 12, display: 'flex', pointerEvents: 'all', zIndex: 10 };

const styles = {
  wrapLeft:  { ...base, left: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  wrapRight: { ...base, right: 12, flexDirection: 'column', alignItems: 'flex-end', gap: 12 },
  rightUtilityStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 12,
  },
  tradeButtonRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 10,
  },
  mobileBattleLogWrap: {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 86px)',
    left: 8,
    display: 'flex',
    pointerEvents: 'all',
    zIndex: 11,
  },
  buildIconImgSmall: {
    width: 95, height: 95, objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transform: 'translate(-4px, -2px)',
  },
  attackIconImg: {
    width: 120, height: 120, objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))', marginBottom: 2,
  },
  attackCostBadge: {
    position: 'absolute',
    top: 20,
    left: 24,
    minWidth: 50,
    height: 26,
    padding: '0 8px 0 5px',
    borderRadius: 13,
    background: 'linear-gradient(180deg, #fff2a8 0%, #d79d15 100%)',
    border: '2px solid #5C3A21',
    boxShadow: '0 3px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    color: '#5C3A21',
    fontSize: 14,
    fontWeight: 950,
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
    zIndex: 12,
  },
  attackCostBadgeMobile: {
    top: 18,
    left: 18,
    minWidth: 46,
    height: 24,
    fontSize: 13,
  },
  attackCostBadgeLocked: {
    background: 'linear-gradient(180deg, #ffd1d1 0%, #d94a3b 100%)',
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.55)',
  },
  attackCostIcon: {
    width: 15,
    height: 15,
    objectFit: 'contain',
    filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
  },
  chartIconImg: {
    width: 110, height: 110, objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transform: 'translateY(-10px)', marginBottom: 2,
  },
  botIconImg: {
    width: 58,
    height: 58,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transform: 'translateY(-7px)',
    pointerEvents: 'none',
  },
  botIconImgMobile: {
    width: 44,
    height: 44,
    transform: 'translateY(-5px)',
  },
  tournamentIconImg: {
    width: 112,
    height: 83,
    objectFit: 'contain',
    filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.55))',
    pointerEvents: 'none',
  },
  tournamentIconImgMobile: {
    width: 86,
    height: 65,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))',
    pointerEvents: 'none',
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
