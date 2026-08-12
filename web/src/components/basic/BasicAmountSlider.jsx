// Step 3 — Amount picker. Custom slider built on framer-motion drag because
// the native `<input type="range">` thumb-vs-fill alignment was off (thumb
// stopped short of the right edge even at value=max — browsers compute
// thumb position with thumb-width offset, which doesn't match a `%` linear
// gradient fill). The custom version positions the thumb deterministically
// against a known track width measured at runtime, so MAX visually
// matches.

import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, animate as fmAnimate } from 'framer-motion';
import { colors, shared } from './styles';
import { uiButton } from '../../styles/theme';

function fmtUsd(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v < 100) return v.toFixed(2);
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function parseAmountInput(value) {
  const normalized = String(value || '')
    .trim()
    .replace(',', '.')
    .replace(/[^\d.]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// Cash-counter ticker — animates between values rather than snapping. Uses
// requestAnimationFrame so dragging feels buttery.
function MoneyTicker({ value }) {
  const [display, setDisplay] = useState(value);
  const targetRef = useRef(value);
  const rafRef = useRef(0);
  useEffect(() => {
    targetRef.current = value;
    const tick = () => {
      const target = targetRef.current;
      setDisplay(prev => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.01) return target;
        return prev + diff * 0.25;
      });
      if (Math.abs(targetRef.current - display) > 0.01) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, display]);
  return <span>${fmtUsd(display)}</span>;
}

const THUMB = 28; // visual diameter of the draggable thumb in px

function BasicAmountSlider({ direction, balance, onPick, onBack }) {
  const max = Math.max(0, Number(balance) || 0);
  const [amount, setAmount] = useState(() => Math.min(max, 10));
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState('');
  const amountInputRef = useRef(null);
  const pct = max > 0 ? Math.min(1, amount / max) : 0;
  const directionColor = direction === 'long' ? colors.long : colors.short;

  // Track geometry — measured via ResizeObserver so the drag math stays
  // accurate when the parent reflows (e.g. a vertical scrollbar appears
  // and trims ~17px of inner width). Plain `window.resize` fires only on
  // window-edge resizes, not on internal scrollbar appearance, which used
  // to leave trackW stale and the thumb visibly overflowing the track.
  const trackRef = useRef(null);
  const [trackW, setTrackW] = useState(0);
  useEffect(() => {
    if (!trackRef.current) return;
    const measure = () => {
      if (trackRef.current) {
        setTrackW(Math.round(trackRef.current.getBoundingClientRect().width));
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);

  // Thumb x position in pixels (0 = far left, trackW - THUMB = far right
  // edge of thumb flush with track edge).
  const x = useMotionValue(0);
  const dragMax = Math.max(0, trackW - THUMB);

  // Sync `x` whenever amount or trackW changes due to non-drag updates
  // (chip click, initial load, resize).
  useEffect(() => {
    x.set(pct * dragMax);
  }, [pct, dragMax, x]);

  const handleDrag = useCallback(() => {
    if (!dragMax) return;
    const clamped = Math.max(0, Math.min(dragMax, x.get()));
    const ratio = clamped / dragMax;
    const next = Math.round((max * ratio) * 100) / 100;
    setAmount(next);
  }, [dragMax, x, max]);

  const setPct = useCallback((p) => {
    const next = Math.round((max * p) * 100) / 100;
    setAmount(next);
    setIsEditingAmount(false);
    setAmountDraft('');
    // Smoothly animate the thumb to the new position so chip-clicks feel
    // alive instead of snapping jerkily.
    fmAnimate(x, p * dragMax, { type: 'spring', stiffness: 400, damping: 32 });
  }, [max, dragMax, x]);

  useEffect(() => {
    if (!isEditingAmount) return;
    const id = requestAnimationFrame(() => {
      amountInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isEditingAmount]);

  const commitAmountDraft = useCallback(() => {
    const parsed = parseAmountInput(amountDraft);
    if (parsed !== null) {
      const next = Math.round(Math.max(0, Math.min(max, parsed)) * 100) / 100;
      setAmount(next);
    }
    setIsEditingAmount(false);
    setAmountDraft('');
  }, [amountDraft, max]);

  const cancelAmountDraft = useCallback(() => {
    setIsEditingAmount(false);
    setAmountDraft('');
  }, []);

  // Track click: jump thumb to the clicked position. Touch + mouse via
  // pointer events.
  const handleTrackPointerDown = useCallback((e) => {
    if (!trackRef.current || dragMax === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = Math.min(1, px / Math.max(1, rect.width));
    setPct(ratio);
  }, [dragMax, setPct]);

  return (
    // Centre everything vertically — content + action sit as one block in
    // the middle of the panel. On tall screens dead air distributes top
    // and bottom equally; on short screens content compresses naturally
    // around its centre.
    <div style={{ ...shared.page, justifyContent: 'center' }}>
      <h2 style={S.tightTitle}>How much?</h2>

      <motion.div
        key={direction}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ ...S.bigUsd, color: directionColor }}
      >
        {isEditingAmount ? (
          <span style={S.amountEditWrap}>
            <span style={S.amountPrefix}>$</span>
            <input
              ref={amountInputRef}
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              onBlur={commitAmountDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitAmountDraft();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelAmountDraft();
                }
              }}
              inputMode="decimal"
              type="text"
              placeholder="0"
              aria-label="Trade amount in US dollars"
              style={{ ...S.amountInput, color: directionColor }}
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAmountDraft('');
              setIsEditingAmount(true);
            }}
            aria-label={`Edit trade amount, current amount $${fmtUsd(amount)}`}
            style={{ ...S.amountButton, color: directionColor }}
          >
            <MoneyTicker value={amount} />
          </button>
        )}
      </motion.div>
      <div style={S.pctLabel}>
        {Math.round(pct * 100)}% of ${fmtUsd(max)} balance
      </div>

      {/* Custom slider — flex row vertically centred. Thumb is a flex
          item (not absolute-positioned), so its vertical alignment is
          handled by `align-items: center` and never drifts. The bar
          background + coloured fill sit absolutely behind the thumb. */}
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        style={S.trackOuter}
      >
        <div style={S.trackBg} />
        <div
          style={{
            ...S.trackFill,
            background: directionColor,
            // Fill ends under the thumb's centre (left edge of thumb +
            // half-thumb). pct*dragMax is the thumb's left position in px.
            width: `${(pct * dragMax) + (THUMB / 2)}px`,
          }}
        />
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: dragMax }}
          dragElastic={0}
          dragMomentum={false}
          onDrag={handleDrag}
          whileDrag={{ scale: 1.15 }}
          style={{
            ...S.thumb,
            x,
            background: directionColor,
          }}
        />
      </div>

      <div style={S.chipRow}>
        {[0.25, 0.5, 0.75, 1].map(p => (
          <motion.button
            key={p}
            onClick={() => setPct(p)}
            whileTap={{ scale: 0.92 }}
            style={{
              ...S.chip,
              ...(Math.abs(pct - p) < 0.005 ? { background: directionColor, color: 'var(--terminal-on-accent)', borderColor: directionColor } : {}),
            }}
          >
            {p === 1 ? 'MAX' : `${p * 100}%`}
          </motion.button>
        ))}
      </div>

      <motion.button
        onClick={() => onPick(amount)}
        disabled={amount <= 0 || max <= 0}
        whileTap={{ scale: 0.97 }}
        style={{
          ...S.continueBtn,
          ...(amount <= 0 || max <= 0 ? S.continueBtnDisabled : { background: directionColor }),
        }}
      >
        {max <= 0 ? 'No balance — deposit first' : amount <= 0 ? 'Pick an amount' : 'Continue →'}
      </motion.button>
      <button onClick={onBack} style={S.backLink}>← Back</button>
    </div>
  );
}

export default memo(BasicAmountSlider);

const S = {
  tightTitle: {
    fontSize: 'clamp(16px, 3vh, 20px)',
    fontWeight: 700, color: colors.ink,
    textAlign: 'center', letterSpacing: '0.3px',
    margin: '2px 0 4px', lineHeight: 1.1,
  },
  bigUsd: {
    fontSize: 'clamp(32px, 6.5vh, 48px)',
    fontWeight: 700,
    textAlign: 'center', letterSpacing: '-1px',
    fontVariantNumeric: 'tabular-nums',
    margin: '2px 0 0',
    lineHeight: 1,
  },
  amountButton: {
    display: 'inline-flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 0,
    minWidth: 170,
    minHeight: 54,
    padding: '0 8px',
    border: 'none',
    background: 'transparent',
    font: 'inherit',
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'text',
    fontVariantNumeric: 'tabular-nums',
  },
  amountEditWrap: {
    display: 'inline-flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    minWidth: 170,
    minHeight: 54,
  },
  amountPrefix: {
    font: 'inherit',
    fontWeight: 700,
    color: 'inherit',
    lineHeight: 1,
  },
  amountInput: {
    width: 150,
    minWidth: 0,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    font: 'inherit',
    fontWeight: 700,
    lineHeight: 1,
    textAlign: 'left',
    fontVariantNumeric: 'tabular-nums',
    padding: 0,
    margin: 0,
  },
  pctLabel: {
    fontSize: 11, fontWeight: 700, color: colors.inkFaint,
    textAlign: 'center', marginBottom: 4,
  },
  // Flex row, vertically centred. Native `align-items: center` aligns the
  // thumb on the row's centre line, regardless of any container resize
  // or sub-pixel rounding. Bar bg/fill sit absolutely behind the thumb.
  trackOuter: {
    position: 'relative', width: '100%',
    height: THUMB,
    margin: '2px 0 8px',
    cursor: 'pointer',
    touchAction: 'none',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',  // vertical centring for the thumb
  },
  trackBg: {
    position: 'absolute',
    top: '50%', left: 0, right: 0,
    height: 8,
    transform: 'translateY(-50%)',
    borderRadius: 4,
    background: 'var(--terminal-border)',
    boxShadow: 'none',
    pointerEvents: 'none',
  },
  trackFill: {
    position: 'absolute',
    top: '50%', left: 0,
    height: 8,
    transform: 'translateY(-50%)',
    borderRadius: 4,
    pointerEvents: 'none',
    transition: 'width 0.05s linear',
    // Subtle inset shadow gives the fill a slightly recessed look — sits
    // visually "inside" the track instead of floating above it.
    boxShadow: 'none',
  },
  // Solid circle, no border — the dark-green ring on a green-on-parchment
  // setup created a cream "halo" optical illusion that looked broken.
  // Now: clean coloured disc with a tight inner highlight + outer shadow.
  thumb: {
    position: 'relative',
    zIndex: 2,
    width: THUMB, height: THUMB,
    borderRadius: '50%',
    boxSizing: 'border-box',
    boxShadow: '0 2px 6px var(--terminal-shadow)',
    cursor: 'grab',
    touchAction: 'none',
    flexShrink: 0,
  },
  chipRow: {
    display: 'flex', gap: 8, justifyContent: 'space-between',
  },
  chip: {
    flex: 1, padding: '8px 4px',
    fontSize: 12, fontWeight: 600,
    color: colors.ink,
    background: 'var(--terminal-surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: colors.border,
    borderRadius: 10, cursor: 'pointer',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'all 0.15s ease',
  },
  continueBtn: uiButton('primary', { width: '100%', minHeight: 44, padding: '12px', fontSize: 15, boxSizing: 'border-box' }),
  continueBtnDisabled: {
    background: 'var(--terminal-border-strong)',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  backLink: {
    background: 'transparent', border: 'none',
    color: colors.inkFaint, fontSize: 13, fontWeight: 700,
    textAlign: 'center', padding: '8px 0', marginTop: 4,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
