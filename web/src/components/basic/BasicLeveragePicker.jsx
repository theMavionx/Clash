// Step 4 — Risk picker. Three cards (Safe / Balanced / Aggressive) instead
// of raw "1x / 2x / 5x / 10x" so beginners pick by FEEL not by number.
// Within each card a tiny slider lets advanced-curious users dial precise
// leverage if they want.

import { memo, useState } from 'react';
// eslint-disable-next-line no-unused-vars -- used as JSX namespace (`motion.button`), false positive
import { motion, AnimatePresence } from 'framer-motion';
import { colors, shared } from './styles';

const TIERS = [
  {
    id: 'safe',
    label: 'SAFE',
    icon: '🛡️',
    range: [1, 3],
    default: 2,
    color: colors.safe,
    desc: 'Slow and steady. Big price moves needed before liquidation.',
  },
  {
    id: 'balanced',
    label: 'BALANCED',
    icon: '⚖️',
    range: [4, 7],
    default: 5,
    color: colors.balanced,
    desc: 'Middle ground. Decent reward for moderate risk.',
  },
  {
    id: 'aggressive',
    label: 'AGGRESSIVE',
    icon: '🔥',
    range: [8, 20],
    default: 10,
    color: colors.aggressive,
    desc: 'High reward, high risk. Small price drops can wipe you out.',
  },
];

function tierForLev(lev) {
  if (lev <= 3) return 'safe';
  if (lev <= 7) return 'balanced';
  return 'aggressive';
}

function fmtUsd(n) {
  const v = Math.max(0, Number(n) || 0);
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function BasicLeveragePicker({ amount, direction, maxLeverage = 20, onPick, onBack }) {
  const [tierId, setTierId] = useState('safe');
  const [lev, setLev] = useState(2);

  // Selecting a tier snaps leverage to that tier's default. Doing this in
  // a click handler instead of an effect avoids an unnecessary re-render
  // and the React-rules-of-hooks "set-state-in-effect" warning.
  const pickTier = (t) => {
    setTierId(t.id);
    setLev(Math.min(maxLeverage, t.default));
  };

  const positionSize = amount * lev;
  // Liquidation rough estimate — for an isolated position, you blow up when
  // your loss equals your collateral, i.e. price moves -1/leverage on a
  // long. (Ignores fees & maintenance margin; this is a "feel" hint, not a
  // contract-accurate value.)
  const liqMovePct = 100 / lev;
  const directionColor = direction === 'long' ? colors.long : colors.short;
  const tier = TIERS.find(x => x.id === tierId);

  return (
    // Centre everything as one block — same pattern as the other steps.
    <div style={{ ...shared.page, justifyContent: 'center' }}>
      <h2 style={S.tightTitle}>Risk multiplier</h2>

      <div style={S.tierRow}>
        {TIERS.map((t, i) => {
          const active = t.id === tierId;
          return (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 280, damping: 22 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => pickTier(t)}
              style={{
                ...S.tierCard,
                ...(active
                  ? { borderColor: t.color, boxShadow: `0 4px 0 ${t.color}, 0 8px 20px rgba(0,0,0,0.18)`, opacity: 1 }
                  : { opacity: 0.55 }),
              }}
            >
              <div style={S.tierIcon}>{t.icon}</div>
              <div style={{ ...S.tierLabel, color: t.color }}>{t.label}</div>
              <div style={S.tierRange}>{t.range[0]}–{t.range[1]}×</div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tierId}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          style={S.detailCard}
        >
          {/* Compact: multiplier + value in one row, slider, stats inline.
              Removed the standalone description and the warn box (the
              tier label + multiplier already convey the risk level). */}
          <div style={S.fineRow}>
            <span style={S.fineLabel}>Multiplier</span>
            <span style={{ ...S.fineValue, color: tier.color }}>{lev.toFixed(lev < 10 ? 1 : 0)}×</span>
          </div>
          <input
            type="range"
            min={tier.range[0]}
            max={Math.min(tier.range[1], maxLeverage)}
            step={lev < 10 ? 0.5 : 1}
            value={lev}
            onChange={e => setLev(Number(e.target.value))}
            style={{ ...S.fineSlider, accentColor: tier.color }}
          />

          <div style={S.statsRow}>
            <div style={S.stat}>
              <div style={S.statLabel}>Position size</div>
              <div style={S.statValue}>${fmtUsd(positionSize)}</div>
            </div>
            <div style={S.stat}>
              <div style={S.statLabel}>Liquidates at</div>
              <div style={{ ...S.statValue, color: colors.short }}>
                {direction === 'long' ? '−' : '+'}{liqMovePct.toFixed(1)}%
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <motion.button
        onClick={() => onPick(lev)}
        whileTap={{ scale: 0.97 }}
        style={{ ...S.continueBtn, background: directionColor }}
      >
        Review trade →
      </motion.button>
      <button onClick={onBack} style={S.backLink}>← Back</button>
    </div>
  );
}

export default memo(BasicLeveragePicker);
export { tierForLev };

const S = {
  // Tight title — replaces the title+subtitle stack to save ~50px of
  // vertical real estate on cramped panels. Single bold line, no margin.
  tightTitle: {
    fontSize: 'clamp(16px, 3vh, 20px)',
    fontWeight: 900, color: colors.ink,
    textAlign: 'center', letterSpacing: '0.3px',
    margin: '2px 0 4px', lineHeight: 1.1,
  },
  tierRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
  },
  tierCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '8px 6px',
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3ebd1 100%)',
    borderWidth: 3, borderStyle: 'solid', borderColor: colors.border,
    borderRadius: 12, cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  tierIcon: { fontSize: 20, lineHeight: 1 },
  tierLabel: {
    fontSize: 11, fontWeight: 900, letterSpacing: '0.5px',
  },
  tierRange: {
    fontSize: 10, fontWeight: 700, color: colors.inkFaint,
  },
  detailCard: {
    padding: 10, borderRadius: 12,
    background: 'rgba(255,255,255,0.5)',
    borderWidth: 2, borderStyle: 'solid', borderColor: colors.border,
    display: 'flex', flexDirection: 'column', gap: 6,
    boxSizing: 'border-box',
  },
  fineRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  },
  fineLabel: { fontSize: 11, fontWeight: 800, color: colors.inkFaint, letterSpacing: '0.3px' },
  fineValue: {
    fontSize: 'clamp(18px, 3.5vh, 22px)', fontWeight: 900,
    fontVariantNumeric: 'tabular-nums',
  },
  fineSlider: {
    width: '100%', height: 6, borderRadius: 3,
    cursor: 'pointer',
    margin: '0 0 2px',
  },
  statsRow: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
  },
  stat: {
    padding: '6px 8px', borderRadius: 8,
    background: 'rgba(92,58,33,0.05)',
  },
  statLabel: {
    fontSize: 9, fontWeight: 800, color: colors.inkFaint,
    letterSpacing: '0.3px', marginBottom: 2,
  },
  statValue: {
    fontSize: 14, fontWeight: 900, color: colors.ink,
    fontVariantNumeric: 'tabular-nums',
  },
  continueBtn: {
    width: '100%', padding: 12,
    fontSize: 15, fontWeight: 900, color: '#fff',
    borderWidth: 4, borderStyle: 'solid', borderColor: 'rgba(0,0,0,0.25)',
    borderRadius: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.5px',
    boxSizing: 'border-box',
    boxShadow: '0 4px 0 rgba(0,0,0,0.25), 0 6px 16px rgba(0,0,0,0.2)',
    textShadow: '0 2px 0 rgba(0,0,0,0.3)',
  },
  backLink: {
    background: 'transparent', border: 'none',
    color: colors.inkFaint, fontSize: 12, fontWeight: 700,
    textAlign: 'center', padding: '4px 0', marginTop: 2,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
