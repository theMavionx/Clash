import { memo, useState, useEffect, useCallback, useRef } from 'react';

// ── Tutorial flags (bitmask) ──────────────────────────────────────
const FLAG_BASE = 1;    // welcome, TH, buildings, resources
const FLAG_ARMY = 2;    // port, ship, barracks, load troops
const FLAG_ATTACK = 4;  // first attack guide (cannon, energy, ships)
const FLAG_TRADE = 8;   // trading intro

// ── Step definitions ──────────────────────────────────────────────
const BASE_STEPS = [
  { title: 'Welcome, Commander!', text: 'Welcome to Clash of Perps! Build your island, train troops, and raid enemies. Let\'s get started.', icon: '⚔️' },
  { title: 'Town Hall', text: 'This is your Town Hall — the heart of your base. Upgrade it to unlock new buildings and increase your power.', icon: '🏰' },
  { title: 'Build', text: 'Tap the Build button to construct new buildings. Start with a Mine and Sawmill to produce resources.', icon: '🔨', target: 'build-btn' },
  { title: 'Collect Resources', text: 'Your Mine produces Ore and Sawmill produces Wood. Tap the collect icons above buildings to gather resources.', icon: '💰' },
];

const ARMY_STEPS = [
  { title: 'Port & Ship', text: 'Build a Port and buy a Ship. Ships carry your troops into battle.', icon: '⛵', target: 'build-btn' },
  { title: 'Barracks', text: 'Open your Barracks (Barn) to view and upgrade your troops. Stronger troops = easier victories.', icon: '🛡️' },
  { title: 'Load Troops', text: 'Tap your Port → choose troops to load onto your ship. Each ship level adds a troop slot.', icon: '👥' },
];

const ATTACK_STEPS = [
  { title: 'Battle!', text: 'You\'re about to attack! Let\'s learn the basics.', icon: '⚔️' },
  { title: 'Place Ships', text: 'Tap the water near the enemy shore to deploy your ships. Troops will swim ashore and attack automatically.', icon: '⛵' },
  { title: 'Ship Cannon', text: 'You have a cannon with 10 energy. Fire it at buildings for massive damage! Each shot costs more energy.', icon: '💥' },
  { title: 'Destroy Town Hall', text: 'Destroy the enemy Town Hall to win! All remaining buildings will crumble after it falls.', icon: '🏆' },
  { title: 'Casualties', text: 'Troops lost in battle need to be reinforced. Tap the Reinforce button after returning home (50 gold per troop).', icon: '🩹' },
];

const TRADE_STEPS = [
  { title: 'Futures Trading', text: 'Trade crypto futures to earn Gold! Tap the Trade button to open the trading panel.', icon: '📈', target: 'trade-btn' },
  { title: 'Earn Gold', text: 'Trade volume earns Gold, with first-trade and daily bonuses paid automatically.', icon: '💰' },
];

// ── Component ─────────────────────────────────────────────────────
function TutorialOverlay({ tutorialFlags, phase, onComplete, onSkip }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState(null);
  const overlayRef = useRef(null);

  const steps = phase === 'base' ? BASE_STEPS
    : phase === 'army' ? ARMY_STEPS
    : phase === 'attack' ? ATTACK_STEPS
    : phase === 'trade' ? TRADE_STEPS
    : [];

  const flag = phase === 'base' ? FLAG_BASE
    : phase === 'army' ? FLAG_ARMY
    : phase === 'attack' ? FLAG_ATTACK
    : phase === 'trade' ? FLAG_TRADE
    : 0;

  // All hooks must be declared BEFORE any conditional return (Rules of Hooks).
  // The phase→flag→steps lookup above is cheap pure-derivation; the early
  // return that checks whether the phase is already complete is done AFTER
  // every hook has been registered so the hook count stays stable across
  // renders if flags update while this instance is still mounted.
  const skip = (tutorialFlags & flag) !== 0 || steps.length === 0;
  const step = skip ? null : steps[stepIdx];
  const isLast = !skip && stepIdx === steps.length - 1;

  // Find spotlight target. Clears when no step or no target.
  // setState inside is DOM→React layout sync (external-boundary read), not
  // derived state — acceptable use that ESLint's heuristic flags.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!step || !step.target) { setSpotlightRect(null); return; }
    const el = document.querySelector(`[data-tutorial="${step.target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setSpotlightRect({ x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 });
    } else {
      setSpotlightRect(null);
    }
  }, [stepIdx, step?.target, step]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete(flag);
    } else {
      setStepIdx(s => s + 1);
    }
  }, [isLast, flag, onComplete]);

  const handleSkip = useCallback(() => {
    onSkip(flag);
  }, [flag, onSkip]);

  // Skip after all hooks (prevents hook-count mismatch across renders).
  if (skip) return null;

  // Clip-path for spotlight hole
  const clipPath = spotlightRect
    ? `polygon(
        0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
        ${spotlightRect.x}px ${spotlightRect.y}px,
        ${spotlightRect.x}px ${spotlightRect.y + spotlightRect.h}px,
        ${spotlightRect.x + spotlightRect.w}px ${spotlightRect.y + spotlightRect.h}px,
        ${spotlightRect.x + spotlightRect.w}px ${spotlightRect.y}px,
        ${spotlightRect.x}px ${spotlightRect.y}px
      )`
    : undefined;

  return (
    <div ref={overlayRef} style={{...S.overlay, clipPath}}>
      {/* Step indicator */}
      <div style={S.stepDots}>
        {steps.map((_, i) => (
          <div key={i} style={{...S.dot, ...(i === stepIdx ? S.dotActive : {})}} />
        ))}
      </div>

      {/* Card */}
      <div style={S.card}>
        <div style={S.iconCircle}>
          <span style={S.icon}>{step.icon}</span>
        </div>
        <h2 style={S.title}>{step.title}</h2>
        <p style={S.text}>{step.text}</p>
        <div style={S.buttons}>
          <button 
            style={S.skipBtn} 
            onClick={handleSkip}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.05)'}
            onMouseOut={e => e.currentTarget.style.filter = 'none'}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            Skip
          </button>
          <button 
            style={S.nextBtn} 
            onClick={handleNext}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseOut={e => e.currentTarget.style.filter = 'none'}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {isLast ? 'Got it!' : 'Next'}
          </button>
        </div>
        <div style={S.counter}>{stepIdx + 1} / {steps.length}</div>
      </div>
    </div>
  );
}

export { FLAG_BASE, FLAG_ARMY, FLAG_ATTACK, FLAG_TRADE };
export default memo(TutorialOverlay);

// ── Styles ────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'flex-end',
    zIndex: 250, pointerEvents: 'all',
    paddingBottom: 24,
    animation: 'fadeIn 0.3s ease',
  },
  stepDots: {
    position: 'absolute', top: 20,
    display: 'flex', gap: 10, zIndex: 260,
  },
  dot: {
    width: 12, height: 12, borderRadius: '50%',
    background: 'rgba(255,255,255,0.4)',
    transition: 'all 0.2s',
  },
  dotActive: {
    background: '#4CAF50',
    boxShadow: '0 0 10px rgba(76, 175, 80, 0.8)',
    transform: 'scale(1.3)',
  },
  card: {
    background: '#fdf8e7',
    border: '6px solid #d4c8b0',
    borderRadius: 24,
    padding: '24px 24px 20px',
    maxWidth: 380, width: 'calc(100% - 32px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    animation: 'panelRise 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },
  iconCircle: {
    width: 64, height: 64, borderRadius: '50%',
    background: '#e8dfc8',
    border: '4px solid #d4c8b0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    marginTop: -52,
  },
  icon: { fontSize: 32, lineHeight: 1 },
  title: {
    margin: '16px 0 8px', fontSize: 22, fontWeight: 900,
    color: '#5C3A21', textAlign: 'center',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  text: {
    margin: '0 0 20px', fontSize: 15, fontWeight: 600,
    color: '#77573d', textAlign: 'center',
    lineHeight: 1.5, maxWidth: 300,
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  buttons: {
    display: 'flex', gap: 12, width: '100%',
  },
  skipBtn: {
    flex: 1, padding: '12px 14px', borderRadius: 14,
    border: '3px solid #d4c8b0', background: '#e8dfc8',
    color: '#77573d', fontSize: 15, fontWeight: 800,
    cursor: 'pointer', transition: 'all 0.1s',
  },
  nextBtn: {
    flex: 2, padding: '12px 14px', borderRadius: 14,
    background: 'linear-gradient(180deg, #4CAF50 0%, #2E7D32 100%)',
    border: '3px solid #1B5E20',
    color: '#fff', fontSize: 15, fontWeight: 900, textAlign: 'center',
    cursor: 'pointer', transition: 'all 0.1s',
    textShadow: '0 2px 2px rgba(0,0,0,0.3)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
  },
  counter: {
    marginTop: 12, fontSize: 12, fontWeight: 800,
    color: '#bba882',
  },
};
