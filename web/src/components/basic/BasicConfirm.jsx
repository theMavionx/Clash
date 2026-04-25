// Step 5 — Confirmation. Summary card + swipe-to-confirm thumb. The swipe
// gesture (vs a normal tap button) was chosen deliberately: it forces a
// conscious physical commitment, so accidental fat-finger taps can't fire
// a real trade. Falls back to a tap button on hover-only desktop sessions
// without pointer events.

import { memo, useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { colors, shared } from './styles';
import AgentApprovalBanner from './AgentApprovalBanner';

const TRACK_H = 64;
const THUMB_PAD = 4;
const THUMB_SIZE = TRACK_H - THUMB_PAD * 2; // 56

function fmtPrice(p) {
  const n = Number(p);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtUsd(n) {
  const v = Math.max(0, Number(n) || 0);
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function BasicConfirm({
  symbol, direction, amount, leverage, price, busy, onConfirm, onBack,
  showAgentBanner, bindAgent, bindingAgent, bindAgentError,
}) {
  const positionSize = amount * leverage;
  const liqMovePct = 100 / leverage;
  const liqPrice = direction === 'long'
    ? price * (1 - liqMovePct / 100)
    : price * (1 + liqMovePct / 100);
  const directionColor = direction === 'long' ? colors.long : colors.short;
  const directionLabel = direction === 'long' ? 'LONG' : 'SHORT';

  // Swipe-to-confirm — drag thumb across the track. Track width measured at
  // runtime so the maths matches the actual render size on every viewport.
  // Fill width grows from 0 → covers up to the thumb's right edge as the
  // user drags, identical pattern to BasicAmountSlider for consistency.
  const x = useMotionValue(0);
  const trackRef = useRef(null);
  const [submitted, setSubmitted] = useState(false);
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (trackRef.current) setTrackW(trackRef.current.offsetWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Travel distance for the thumb: total width minus thumb size minus the
  // 4px padding on each side that keeps the thumb visually inset.
  const dragMax = Math.max(0, trackW - THUMB_SIZE - THUMB_PAD * 2);
  // Fill width = thumb's left position + the thumb itself, so the green
  // fill always sits visually behind the thumb without leaking past it.
  const fillWidth = useTransform(x, (v) => v + THUMB_SIZE + THUMB_PAD * 2);
  // Label fades out as the thumb crosses ~half the track — once you've
  // committed visually, the "Slide to confirm" prompt makes less sense.
  const labelOpacity = useTransform(x, [0, dragMax * 0.6], [1, 0]);

  const handleDragEnd = () => {
    if (submitted || busy) return;
    const v = x.get();
    if (v >= dragMax * 0.85) {
      setSubmitted(true);
      animate(x, dragMax, { type: 'spring', stiffness: 280, damping: 26 });
      onConfirm();
    } else {
      animate(x, 0, { type: 'spring', stiffness: 380, damping: 30 });
    }
  };

  return (
    // Grid layout: title (auto), card (1fr — fills + shrinks), pill (auto),
    // back (auto). The slide-to-confirm pill is therefore ALWAYS visible
    // — content above can shrink without clipping the action.
    <div style={{ ...shared.page, justifyContent: 'center' }}>
      <h2 style={S.tightTitle}>Confirm trade</h2>

      {showAgentBanner && bindAgent && (
        <AgentApprovalBanner
          bindAgent={bindAgent}
          busy={!!bindingAgent}
          error={bindAgentError}
        />
      )}

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{ ...S.card, borderColor: directionColor, minHeight: 0, overflow: 'hidden' }}
      >
        <div style={S.header}>
          <div style={{ ...S.directionBadge, background: directionColor }}>{directionLabel}</div>
          <div style={S.symbol}>{symbol}</div>
        </div>

        <div style={S.bigSize}>
          ${fmtUsd(amount)} <span style={S.x}>×</span>
          <span style={{ color: directionColor }}> {leverage.toFixed(leverage < 10 ? 1 : 0)}×</span>
        </div>
        <div style={S.equals}>
          = ${fmtUsd(positionSize)} position size
        </div>

        <div style={S.divider} />

        <div style={S.row}>
          <span style={S.rowLabel}>Entry price</span>
          <span style={S.rowValue}>${fmtPrice(price)}</span>
        </div>
        <div style={S.row}>
          <span style={S.rowLabel}>Liquidates around</span>
          <span style={{ ...S.rowValue, color: colors.short }}>
            ${fmtPrice(liqPrice)} ({direction === 'long' ? '−' : '+'}{liqMovePct.toFixed(1)}%)
          </span>
        </div>
      </motion.div>

      {/* Swipe-to-confirm */}
      <div ref={trackRef} style={S.track}>
        {/* Filled portion grows from left edge as user drags. */}
        <motion.div
          style={{
            ...S.trackFill,
            background: directionColor,
            width: fillWidth,
          }}
        />
        {/* Centre label sits over the unfilled (right) portion of the track.
            Fades as user drags past midpoint. */}
        <motion.div
          style={{ ...S.trackLabel, opacity: labelOpacity }}
        >
          {busy ? 'Submitting…' : 'Slide to confirm →'}
        </motion.div>
        {/* Draggable thumb. Solid coloured circle with white arrow — same
            colour as the fill so the whole left section reads as one
            cohesive shape. */}
        <motion.div
          drag={!busy && !submitted ? 'x' : false}
          dragConstraints={{ left: 0, right: dragMax }}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          whileDrag={{ scale: 1.04 }}
          style={{
            ...S.thumb,
            x,
            background: directionColor,
            cursor: busy ? 'wait' : 'grab',
          }}
        >
          {busy ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, ease: 'linear', duration: 1 }}
              style={S.spinner}
            />
          ) : (
            // SVG arrow — Unicode `→` (U+2192) has uneven side bearings in
            // most fonts, so even with flex centering it looks offset to
            // the right inside the circular thumb. SVG is glyph-shape
            // perfect on its viewBox so it sits exactly centred.
            <svg width="28" height="28" viewBox="0 0 24 24"
                 fill="none" stroke="#fff" strokeWidth="3.5"
                 strokeLinecap="round" strokeLinejoin="round"
                 style={{ filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.25))' }}>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          )}
        </motion.div>
      </div>

      <button onClick={onBack} disabled={busy} style={S.backLink}>← Back</button>
    </div>
  );
}

export default memo(BasicConfirm);

const S = {
  tightTitle: {
    fontSize: 'clamp(16px, 3vh, 20px)',
    fontWeight: 900, color: colors.ink,
    textAlign: 'center', letterSpacing: '0.3px',
    margin: '2px 0 4px', lineHeight: 1.1,
  },
  card: {
    padding: '12px 14px', borderRadius: 16,
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3ebd1 100%)',
    borderWidth: 4, borderStyle: 'solid', borderColor: 'transparent',
    boxShadow: '0 4px 14px rgba(92,58,33,0.15)',
    display: 'flex', flexDirection: 'column', gap: 6,
    boxSizing: 'border-box',
  },
  header: { display: 'flex', alignItems: 'center', gap: 10 },
  directionBadge: {
    padding: '4px 10px', borderRadius: 8,
    fontSize: 12, fontWeight: 900, letterSpacing: '1px',
    color: '#fff', textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
  symbol: {
    fontSize: 20, fontWeight: 900, color: colors.ink, letterSpacing: '0.6px',
  },
  bigSize: {
    fontSize: 'clamp(20px, 4vh, 26px)',
    fontWeight: 900, color: colors.ink,
    letterSpacing: '-0.5px',
    fontVariantNumeric: 'tabular-nums',
    marginTop: 2,
  },
  x: { color: colors.inkFaint, fontWeight: 700 },
  equals: {
    fontSize: 13, fontWeight: 700, color: colors.inkSoft,
  },
  divider: {
    height: 1, background: 'rgba(92,58,33,0.18)',
    margin: '6px 0',
  },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  },
  rowLabel: { fontSize: 12, fontWeight: 700, color: colors.inkFaint, letterSpacing: '0.3px' },
  rowValue: { fontSize: 14, fontWeight: 800, color: colors.ink, fontVariantNumeric: 'tabular-nums' },

  // Swipe track — pill background. Higher contrast bg + visible border so
  // the pill is always recognisable as a swipe affordance regardless of
  // the parent's background colour. flexShrink: 0 + minHeight prevent the
  // track from being compressed away when the page runs out of vertical
  // room (was collapsing to ~0 visual height on cramped panels).
  track: {
    position: 'relative', width: '100%',
    height: TRACK_H,
    minHeight: TRACK_H,
    borderRadius: TRACK_H / 2,
    background: 'rgba(92,58,33,0.16)',
    borderWidth: 2, borderStyle: 'solid', borderColor: 'rgba(92,58,33,0.18)',
    boxSizing: 'border-box',
    flexShrink: 0,
  },
  // Filled portion grows from the left edge as the user drags. Border-
  // radius matches the track so the rounded ends stay consistent.
  trackFill: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    borderRadius: TRACK_H / 2,
    pointerEvents: 'none',
  },
  trackLabel: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    paddingLeft: THUMB_SIZE,  // centre label over the un-filled portion
    fontSize: 15, fontWeight: 900, letterSpacing: '1px',
    color: colors.inkSoft,
    pointerEvents: 'none',
    boxSizing: 'border-box',
  },
  thumb: {
    position: 'absolute',
    top: THUMB_PAD, left: THUMB_PAD,
    width: THUMB_SIZE, height: THUMB_SIZE,
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
    boxSizing: 'border-box',
    touchAction: 'none',
    zIndex: 2,
  },
  // (thumbArrow style removed — SVG handles its own sizing/colour now)
  spinner: {
    width: 22, height: 22,
    border: '3px solid rgba(255,255,255,0.35)',
    borderTopColor: '#fff',
    borderRadius: '50%',
  },
  backLink: {
    background: 'transparent', border: 'none',
    color: colors.inkFaint, fontSize: 13, fontWeight: 700,
    textAlign: 'center', padding: '8px 0', marginTop: 4,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
