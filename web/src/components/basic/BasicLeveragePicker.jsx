// Step 4 — Risk picker. One continuous slider from 1× to maxLeverage.
// The risk *label* (Safe / Balanced / Aggressive) updates live above
// the slider as the player drags, so they still pick by feel without
// needing to make a separate "which tier?" choice up-front.

import { memo, useMemo, useState } from 'react';
// eslint-disable-next-line no-unused-vars -- used as JSX namespace (`motion.button`), false positive
import { motion } from 'framer-motion';
import { colors, shared } from './styles';
import { uiButton } from '../../styles/theme';

// Risk tiers used purely for the live label + accent color. Ranges
// stay the same as the previous 3-card picker so the existing copy
// keeps reading correctly.
const TIER_BANDS = [
  { id: 'safe',       label: 'SAFE',       icon: '🛡️', color: colors.safe,       max: 3,   blurb: 'Slow and steady. Big price moves needed before liquidation.' },
  { id: 'balanced',   label: 'BALANCED',   icon: '⚖️',  color: colors.balanced,   max: 7,   blurb: 'Middle ground. Decent reward for moderate risk.' },
  { id: 'aggressive', label: 'AGGRESSIVE', icon: '🔥', color: colors.aggressive, max: 9999, blurb: 'High reward, high risk. Small price drops can wipe you out.' },
];

function tierForLev(lev) {
  if (lev <= 3) return 'safe';
  if (lev <= 7) return 'balanced';
  return 'aggressive';
}

function bandFor(lev) {
  return TIER_BANDS.find((b) => lev <= b.max) || TIER_BANDS[TIER_BANDS.length - 1];
}

function fmtUsd(n) {
  const v = Math.max(0, Number(n) || 0);
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function BasicLeveragePicker({ amount, direction, maxLeverage = 20, onPick, onBack }) {
  // Sensible starting point: middle of the available range, rounded to
  // a whole number. Picks "5×" on a 20× venue, "3×" on a 10× venue.
  const initialLev = Math.max(1, Math.round(maxLeverage / 4));
  const [lev, setLev] = useState(initialLev);

  const band = bandFor(lev);
  const positionSize = amount * lev;
  // Liquidation rough estimate — for an isolated position, you blow up when
  // your loss equals your collateral, i.e. price moves -1/leverage on a
  // long. (Ignores fees & maintenance margin; this is a "feel" hint, not a
  // contract-accurate value.)
  const liqMovePct = 100 / lev;
  const directionColor = direction === 'long' ? colors.long : colors.short;

  // Painted slider fill — same hue as the active tier so the bar visually
  // shifts color from green → yellow → red as the player drags right.
  const pct = useMemo(() => {
    const min = 1;
    return Math.max(0, Math.min(100, ((lev - min) / Math.max(1, maxLeverage - min)) * 100));
  }, [lev, maxLeverage]);
  const sliderBg = `linear-gradient(90deg, ${band.color} 0%, ${band.color} ${pct}%, ${colors.border} ${pct}%, ${colors.border} 100%)`;

  return (
    // Centre everything as one block — same pattern as the other steps.
    <div style={{ ...shared.page, justifyContent: 'center' }}>
      <h2 style={S.tightTitle}>Risk multiplier</h2>

      {/* Live risk-tier banner — replaces the 3-card picker. Icon +
          label + blurb all swap as the slider crosses tier thresholds,
          so the player keeps the "pick by feel" affordance without a
          separate up-front choice. */}
      <motion.div
        key={band.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        style={{
          ...S.banner,
          borderColor: band.color,
          boxShadow: '0 4px 12px rgba(17,24,39,0.06)',
        }}
      >
        <div style={S.bannerLeft}>
          <span style={S.bannerIcon}>{band.icon}</span>
          <span style={{ ...S.bannerLabel, color: band.color }}>{band.label}</span>
        </div>
        <span style={{ ...S.bannerValue, color: band.color }}>
          {lev.toFixed(lev < 10 ? 1 : 0)}×
        </span>
      </motion.div>

      <p style={S.bannerBlurb}>{band.blurb}</p>

      <div style={S.sliderCard}>
        <input
          type="range"
          min={1}
          max={maxLeverage}
          step={lev < 10 ? 0.5 : 1}
          value={lev}
          onChange={(e) => setLev(Number(e.target.value))}
          style={{
            ...S.fineSlider,
            background: sliderBg,
            accentColor: band.color,
          }}
          aria-label="Risk multiplier"
        />
        <div style={S.scaleRow}>
          <span>1×</span>
          <span style={{ color: colors.balanced }}>·</span>
          <span style={{ color: colors.aggressive }}>{maxLeverage}×</span>
        </div>

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
      </div>

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
  tightTitle: {
    fontSize: 'clamp(16px, 3vh, 20px)',
    fontWeight: 700, color: colors.ink,
    textAlign: 'center', letterSpacing: '0.3px',
    margin: '2px 0 6px', lineHeight: 1.1,
  },

  // Live risk-tier banner — sits where the 3-card picker used to.
  // Drop-shadow color follows the active tier so the whole card pulses
  // with the chosen risk level.
  banner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, padding: '10px 14px',
    background: 'var(--terminal-surface)',
    borderWidth: 1, borderStyle: 'solid', borderRadius: 12,
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  },
  bannerLeft: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  bannerIcon: { fontSize: 22, lineHeight: 1 },
  bannerLabel: {
    fontSize: 14, fontWeight: 700, letterSpacing: '0.6px',
  },
  bannerValue: {
    fontSize: 'clamp(20px, 4vh, 26px)', fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  bannerBlurb: {
    margin: '2px 4px 4px',
    fontSize: 12, fontWeight: 700, color: colors.inkFaint,
    textAlign: 'center', lineHeight: 1.35,
  },

  // Slider + stats container — kept in one card so the multiplier
  // control reads as a single object rather than three loose rows.
  sliderCard: {
    padding: '12px 12px 10px', borderRadius: 12,
    background: 'var(--terminal-surface-subtle)',
    borderWidth: 1, borderStyle: 'solid', borderColor: colors.border,
    display: 'flex', flexDirection: 'column', gap: 8,
    boxSizing: 'border-box',
  },
  // Thicker bar than the previous tier sub-slider so it reads as the
  // primary control of the step. Background gradient is set inline
  // (painted fill that tracks the current value).
  fineSlider: {
    width: '100%', height: 10,
    borderRadius: 6,
    cursor: 'pointer',
    margin: 0,
    appearance: 'none',
    WebkitAppearance: 'none',
    outline: 'none',
  },
  scaleRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 10, fontWeight: 600, color: colors.inkFaint,
    letterSpacing: '0.3px',
    margin: '-2px 2px 0',
  },

  statsRow: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
    marginTop: 2,
  },
  stat: {
    padding: '6px 8px', borderRadius: 8,
    background: 'var(--terminal-surface)',
  },
  statLabel: {
    fontSize: 9, fontWeight: 600, color: colors.inkFaint,
    letterSpacing: '0.3px', marginBottom: 2,
  },
  statValue: {
    fontSize: 14, fontWeight: 700, color: colors.ink,
    fontVariantNumeric: 'tabular-nums',
  },
  continueBtn: uiButton('primary', { width: '100%', minHeight: 44, padding: 12, fontSize: 15, boxSizing: 'border-box' }),
  backLink: {
    background: 'transparent', border: 'none',
    color: colors.inkFaint, fontSize: 12, fontWeight: 700,
    textAlign: 'center', padding: '4px 0', marginTop: 2,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
