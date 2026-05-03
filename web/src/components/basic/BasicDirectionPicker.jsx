// Step 2 — UP / DOWN. Two huge buttons. Live price ticker animates between
// updates instead of jumping, so the user feels the market is "alive".

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { colors, shared } from './styles';
import TokenIcon from '../TokenIcon';

function fmtPrice(p) {
  const n = Number(p);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

// Live-ticker price: animates briefly when value changes, color-flashes
// green/red depending on direction. setState-in-effect is intentional —
// we're synchronising local "flash" state to an external (ws-driven)
// value stream; no derived-state alternative exists.
function LivePrice({ value }) {
  const [prev, setPrev] = useState(value);
  const [flash, setFlash] = useState('none');
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (Number.isFinite(value) && Number.isFinite(prev) && value !== prev) {
      setFlash(value > prev ? 'up' : 'down');
      const t = setTimeout(() => setFlash('none'), 350);
      setPrev(value);
      return () => clearTimeout(t);
    }
  }, [value, prev]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const color = flash === 'up' ? colors.long : flash === 'down' ? colors.short : colors.ink;
  return (
    <motion.div
      key={fmtPrice(value)}
      initial={{ scale: 1.04, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1, color }}
      transition={{ duration: 0.25 }}
      style={S.price}
    >
      ${fmtPrice(value)}
    </motion.div>
  );
}

function BasicDirectionPicker({ symbol, iconSym, price, onPick }) {
  return (
    // Flex column with `justifyContent: center` — content sits in the
    // visual centre of the panel, empty space distributes equally above
    // and below. Items keep their natural size (no stretching), so on
    // tall mobile screens UP/DOWN buttons stay compact instead of
    // ballooning, and on short panels nothing overflows.
    <div style={{ ...shared.page, justifyContent: 'center' }}>
      <h2 style={S.tightTitle}>Where will it go?</h2>

      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        style={S.symbolBlock}
      >
        <div style={S.symbolHeader}>
          <TokenIcon sym={iconSym || symbol} size={36} />
          <div style={S.symbol}>{symbol}</div>
        </div>
        <LivePrice value={price} />
      </motion.div>

      <div style={S.btnRow}>
        <motion.button
          onClick={() => onPick('long')}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.97 }}
          animate={{ boxShadow: ['0 5px 0 #2e7d32, 0 6px 14px rgba(67,160,71,0.4)', '0 5px 0 #2e7d32, 0 10px 22px rgba(67,160,71,0.55)', '0 5px 0 #2e7d32, 0 6px 14px rgba(67,160,71,0.4)'] }}
          transition={{ boxShadow: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
          style={{ ...S.bigBtn, ...S.upBtn }}
        >
          <span style={S.arrowUp}>▲</span>
          <span style={S.bigBtnLabel}>UP</span>
          <span style={S.bigBtnHint}>price rises</span>
        </motion.button>

        <motion.button
          onClick={() => onPick('short')}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.97 }}
          animate={{ boxShadow: ['0 5px 0 #c62828, 0 6px 14px rgba(229,57,53,0.4)', '0 5px 0 #c62828, 0 10px 22px rgba(229,57,53,0.55)', '0 5px 0 #c62828, 0 6px 14px rgba(229,57,53,0.4)'] }}
          transition={{ boxShadow: { duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 1.2 } }}
          style={{ ...S.bigBtn, ...S.downBtn }}
        >
          <span style={S.arrowDown}>▼</span>
          <span style={S.bigBtnLabel}>DOWN</span>
          <span style={S.bigBtnHint}>price drops</span>
        </motion.button>
      </div>
    </div>
  );
}

export default memo(BasicDirectionPicker);

const S = {
  tightTitle: {
    fontSize: 'clamp(16px, 3vh, 20px)',
    fontWeight: 900, color: colors.ink,
    textAlign: 'center', letterSpacing: '0.3px',
    margin: '2px 0 4px', lineHeight: 1.1,
  },
  symbolBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    // Compact paddings + clamp() font sizes so the symbol block doesn't
    // hog vertical space on short panels (~440px) but still looks bold on
    // a tall window. flexShrink: 0 keeps it from squishing to nothing
    // when the buttons compete for room.
    padding: '12px 14px',
    borderRadius: 16,
    background: 'linear-gradient(180deg, #ffffff 0%, #fdf8e7 100%)',
    border: `3px solid ${colors.border}`,
    boxShadow: '0 3px 0 rgba(92,58,33,0.10), 0 4px 10px rgba(92,58,33,0.10)',
    margin: '2px 0 6px',
    flexShrink: 0,
  },
  symbolHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  symbol: {
    fontSize: 14, fontWeight: 900,
    color: colors.inkSoft, letterSpacing: '1.2px',
    textTransform: 'uppercase',
  },
  price: {
    // Scales 22pt (cramped) → 32pt (full panel).
    fontSize: 'clamp(22px, 5.5vh, 32px)',
    fontWeight: 900, color: colors.ink,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.5px',
    lineHeight: 1.05,
  },
  // Natural size — buttons take their own height (controlled by padding +
  // content), don't stretch to fill the panel. Looks compact on tall
  // mobile screens instead of two giant slabs.
  btnRow: {
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  bigBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: '14px 16px',
    border: 'none', borderRadius: 16,
    cursor: 'pointer',
    color: '#fff',
    fontFamily: 'inherit',
    width: '100%',
    height: 76,  // Fixed compact height — same on phone, tablet, desktop.
    boxSizing: 'border-box',
  },
  upBtn: {
    background: 'linear-gradient(180deg, #4caf50 0%, #2e7d32 100%)',
    border: '4px solid #1b5e20',
  },
  downBtn: {
    background: 'linear-gradient(180deg, #ef5350 0%, #c62828 100%)',
    border: '4px solid #b71c1c',
  },
  arrowUp: { fontSize: 28, lineHeight: 1, textShadow: '0 2px 0 rgba(0,0,0,0.3)' },
  arrowDown: { fontSize: 28, lineHeight: 1, textShadow: '0 2px 0 rgba(0,0,0,0.3)' },
  bigBtnLabel: {
    fontSize: 26, fontWeight: 900, letterSpacing: '1.5px',
    textShadow: '0 2px 0 rgba(0,0,0,0.3)',
    marginRight: 'auto', // push hint to the right end
    marginLeft: 4,
  },
  bigBtnHint: {
    fontSize: 12, fontWeight: 700, opacity: 0.85,
    letterSpacing: '0.3px',
    fontStyle: 'italic',
  },
};
