import { memo, useCallback, useEffect, useRef } from 'react';
import { useFarcaster } from '../hooks/useFarcaster';
import { uiButton } from '../styles/theme';
import './BattleResultOverlay.css';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import archerImg from '../assets/units/archer.png';
import mimicImg from '../assets/units/mimic.png';
import necromancerImg from '../assets/units/necromancer.png';
import horrorImg from '../assets/units/horror.png';
import mechanicalDragonImg from '../assets/units/mechanical_dragon.png';
import iceGolemImg from '../assets/units/ice_golem.png';
import arbaletImg from '../assets/units/arbalet.png';
import berserkImg from '../assets/units/berserk.png';
import windMageImg from '../assets/units/wind_mage.png';
import peaShooterImg from '../assets/units/pea_shooter.png';

const UNIT_IMAGES = {
  Knight: knightImg,
  Mage: mageImg,
  Barbarian: berserkImg,
  Archer: archerImg,
  PeaShooter: peaShooterImg,
  Mimic: mimicImg,
  Necromancer: necromancerImg,
  WindMage: windMageImg,
  Horror: horrorImg,
  MechanicalDragon: mechanicalDragonImg,
  IceGolem: iceGolemImg,
  Ranger: arbaletImg,
};

const fmt = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const REINFORCE_COST_PER_SLOT = 50;
const REINFORCE_SLOT_COSTS = {
  knight: 1,
  archer: 1,
  peashooter: 5,
  mage: 6,
  mimic: 8,
  mechanicaldragon: 5,
  icegolem: 10,
  necromancer: 10,
  windmage: 10,
  horror: 10,
};

function normalizedTroopName(name) {
  return String(name || '')
    .split(':', 1)[0]
    .trim()
    .toLowerCase()
    .replace(/[_\s-]/g, '');
}

function isNftBackedTroopName(name) {
  const normalized = normalizedTroopName(name);
  return normalized === 'demonking' || normalized === 'firedragon';
}

function battleErrorMessage(result) {
  const raw = String(result?.message || result?.error || result?.reason || 'Battle result was not recorded.').trim();
  if (/already attacked this player recently/i.test(raw)) {
    return 'This opponent was already on cooldown. No rewards were applied. Find a new opponent and attack again.';
  }
  if (/battle session is no longer active|session/i.test(raw)) {
    return 'This battle session expired. No rewards were applied. Find a new opponent and attack again.';
  }
  return raw || 'Battle result was not recorded. Find a new opponent and attack again.';
}

function troopDisplayName(name) {
  if (name === 'Mimic') return 'Barrel';
  if (name === 'MechanicalDragon') return 'Mech Dragon';
  if (name === 'IceGolem') return 'Ice Golem';
  if (normalizedTroopName(name) === 'windmage') return 'Wind Mage';
  if (normalizedTroopName(name) === 'peashooter') return 'Pea Shooter';
  return name;
}

function ShareButton({ isVictory, isReplay, isAiOnlineBattle, result }) {
  const { isInFrame, shareCast } = useFarcaster();
  const handleShare = useCallback(() => {
    if (isReplay || isAiOnlineBattle) return;
    const loot = result?.loot;
    const text = isVictory
      ? `I raided a village in Clash of Perps and looted ${loot?.gold || 0} gold! ⚔️`
      : `My troops fell in battle on Clash of Perps! Time to upgrade. 💀`;
    if (isInFrame) {
      shareCast(text);
    } else {
      window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent('https://clashofperps.fun')}`, '_blank');
    }
  }, [isVictory, isReplay, isAiOnlineBattle, result, isInFrame, shareCast]);

  if (isReplay || isAiOnlineBattle) return null;
  return (
    <button
      type="button"
      className="battle-result__action battle-result__action--secondary"
      style={uiButton('secondary', { minHeight: 44 })}
      onClick={handleShare}
    >
      Share
    </button>
  );
}

function BattleResultOverlay({ result, onClose }) {
  const dialogRef = useRef(null);
  const returnButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const handleClose = useCallback(() => onClose?.(), [onClose]);

  const getDialogActions = useCallback(() => (
    dialogRef.current
      ? [...dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter(element => element.getClientRects().length > 0)
      : []
  ), []);

  const focusAdjacentAction = useCallback((direction) => {
    const actions = getDialogActions();
    if (actions.length === 0) return;
    const currentIndex = actions.indexOf(document.activeElement);
    const nextIndex = currentIndex < 0
      ? actions.length - 1
      : (currentIndex + direction + actions.length) % actions.length;
    actions[nextIndex]?.focus({ preventScroll: true });
  }, [getDialogActions]);

  useEffect(() => {
    if (!result) return undefined;

    restoreFocusRef.current = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => {
      returnButtonRef.current?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' || event.key === 'BrowserBack') {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        focusAdjacentAction(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (event.key !== 'Tab') return;

      const actions = getDialogActions();
      if (actions.length === 0) return;
      const first = actions[0];
      const last = actions[actions.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      if (restoreFocusRef.current instanceof HTMLElement && restoreFocusRef.current.isConnected) {
        restoreFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, [focusAdjacentAction, getDialogActions, handleClose, result]);

  useEffect(() => {
    if (!result || typeof navigator.getGamepads !== 'function') return undefined;

    let frame = 0;
    let stopped = false;
    let previous = { confirm: false, back: false, left: false, right: false };
    const pollGamepad = () => {
      if (stopped) return;
      const pad = [...(navigator.getGamepads() || [])].find(Boolean);
      const current = {
        confirm: Boolean(pad?.buttons?.[0]?.pressed),
        back: Boolean(pad?.buttons?.[1]?.pressed),
        left: Boolean(pad?.buttons?.[14]?.pressed),
        right: Boolean(pad?.buttons?.[15]?.pressed),
      };

      if (current.back && !previous.back) {
        handleClose();
        return;
      }
      if (current.left && !previous.left) focusAdjacentAction(-1);
      if (current.right && !previous.right) focusAdjacentAction(1);
      if (current.confirm && !previous.confirm) {
        const active = document.activeElement;
        if (active instanceof HTMLButtonElement && dialogRef.current?.contains(active) && !active.disabled) {
          active.click();
        }
      }

      previous = current;
      frame = window.requestAnimationFrame(pollGamepad);
    };

    frame = window.requestAnimationFrame(pollGamepad);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
    };
  }, [focusAdjacentAction, handleClose, result]);

  if (!result) return null;

  const isVictory = result.type === 'victory';
  const isReplay = result.type === 'replay_end';
  const isError = result.type === 'error' || !!result.error;
  const isAiOnlineBattle = !!result.ai_online_battle;
  const casualties = isError
    ? []
    : Object.entries(result.casualties || {}).filter(([name, count]) => !isNftBackedTroopName(name) && count > 0);
  const totalReinforceCost = casualties.reduce(
    (sum, [name, count]) => (
      sum + count * (REINFORCE_SLOT_COSTS[normalizedTroopName(name)] || 1) * REINFORCE_COST_PER_SLOT
    ),
    0,
  );
  const hasLootObject = !!result.loot && typeof result.loot === 'object';
  const hasLootValue = hasLootObject && ['gold', 'wood', 'ore'].some((key) => Number(result.loot?.[key] || 0) > 0);
  const showLootPanel = isVictory && hasLootObject && (hasLootValue || isAiOnlineBattle);
  const trophyDelta = Number(result.trophy_delta || 0);
  const trophyBase = Number(result.trophy_base || 0);
  const trophyBonus = Number(result.trophy_bonus || 0);
  const showTrophyPanel = isVictory && trophyDelta > 0 && !isReplay && !isAiOnlineBattle;
  const subtitle = isError
    ? battleErrorMessage(result)
    : isReplay
      ? (result.reason || 'Replay finished')
      : isAiOnlineBattle
        ? (isVictory ? 'Battle complete. Loot and losses are below.' : 'Battle ended. Losses are below.')
        : isVictory
          ? 'This village is free once again!'
          : 'All troops were lost!';

  return (
    <div className="battle-result-backdrop">
      <section
        ref={dialogRef}
        className="battle-result"
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-result-title"
        aria-describedby="battle-result-subtitle"
      >
        <header className="battle-result__header">
          <div className="battle-result__glow" aria-hidden="true" />
          <h2 id="battle-result-title" className="battle-result__title">
            {isError ? (result.title || 'BATTLE ERROR') : isReplay ? 'REPLAY END' : isVictory ? 'VICTORY' : 'DEFEAT'}
          </h2>
          <p id="battle-result-subtitle" className="battle-result__subtitle">{subtitle}</p>
        </header>

        <div className="battle-result__body clash-scroll">
          <div className="battle-result__grid">
            {isError && (
              <ResultPanel id="battle-result-error-title" title="No rewards were applied" wide error>
                <p className="battle-result__error-text">
                  Your battle was rejected by the server. Return home and start a fresh raid.
                </p>
              </ResultPanel>
            )}

            {!isError && showLootPanel && (
              <ResultPanel id="battle-result-loot-title" title="You received" wide={!showTrophyPanel}>
                <div className="battle-result__resource-row">
                  <LootItem icon={goldIcon} label="Gold" value={result.loot.gold} delay={0.7} />
                  <LootItem icon={woodIcon} label="Wood" value={result.loot.wood} delay={0.9} />
                  <LootItem icon={stoneIcon} label="Stone" value={result.loot.ore} delay={1.1} />
                </div>
              </ResultPanel>
            )}

            {!isError && showTrophyPanel && (
              <ResultPanel id="battle-result-trophies-title" title="Trophies won" wide={!showLootPanel}>
                <div className="battle-result__trophy-reward battle-result__pop" style={{ '--battle-result-delay': '1.15s' }}>
                  <img src={trophyIcon} alt="" className="battle-result__trophy-icon" />
                  <span className="battle-result__trophy-value">+{fmt(trophyDelta)}</span>
                </div>
                {trophyBonus > 0 && (
                  <div className="battle-result__trophy-breakdown">
                    Base +{trophyBase} · Altar +{trophyBonus}
                  </div>
                )}
              </ResultPanel>
            )}

            {!isError && !isVictory && !isReplay && !isAiOnlineBattle && (
              <ResultPanel id="battle-result-defeat-title" title="Better luck next time!" wide>
                <p className="battle-result__panel-copy">Upgrade your troops and try again.</p>
              </ResultPanel>
            )}

            {casualties.length > 0 && !isReplay && (
              <ResultPanel id="battle-result-casualties-title" title="Casualties" wide>
                <div className="battle-result__casualty-row">
                  {casualties.map(([name, count]) => (
                    <div key={name} className="battle-result__casualty-item battle-result__pop" style={{ '--battle-result-delay': '1.2s' }}>
                      <div className="battle-result__casualty-image-wrap">
                        {UNIT_IMAGES[name] && <img src={UNIT_IMAGES[name]} alt="" className="battle-result__casualty-image" />}
                        <div className="battle-result__casualty-count">x{count}</div>
                      </div>
                      <span className="battle-result__casualty-name">{troopDisplayName(name)}</span>
                    </div>
                  ))}
                </div>
                <div className="battle-result__reinforce-info">
                  <img src={goldIcon} alt="" className="battle-result__reinforce-icon" />
                  <span className="battle-result__reinforce-cost">{totalReinforceCost} gold to reinforce</span>
                </div>
              </ResultPanel>
            )}
          </div>
        </div>

        <footer className="battle-result__footer">
          {!isError && <ShareButton isVictory={isVictory} isReplay={isReplay} isAiOnlineBattle={isAiOnlineBattle} result={result} />}
          <button
            ref={returnButtonRef}
            type="button"
            className="battle-result__action battle-result__action--primary"
            style={uiButton('primary', { minHeight: 44 })}
            onClick={handleClose}
          >
            Return
          </button>
        </footer>
      </section>
    </div>
  );
}

function ResultPanel({ id, title, wide = false, error = false, children }) {
  const classes = [
    'battle-result__panel',
    wide ? 'battle-result__panel--wide' : '',
    error ? 'battle-result__panel--error' : '',
  ].filter(Boolean).join(' ');
  return (
    <section className={classes} aria-labelledby={id}>
      <h3 id={id} className="battle-result__panel-title">{title}</h3>
      {children}
    </section>
  );
}

function LootItem({ icon, label, value, delay }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="battle-result__loot-item battle-result__pop" style={{ '--battle-result-delay': `${delay}s` }}>
      <img src={icon} alt={label} className="battle-result__loot-icon" />
      <span className="battle-result__loot-value">{fmt(value)}</span>
    </div>
  );
}

export default memo(BattleResultOverlay);
