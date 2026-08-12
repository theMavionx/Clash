import { memo } from 'react';
import goldIcon from '../assets/resources/gold_bar.png';
import { uiIconButton } from '../styles/theme';

function GoldRewardToast({ amount, reason = 'Trading rewards', onClose, style }) {
  const value = Number(amount || 0);
  if (!(value > 0)) return null;

  return (
    <div style={{ ...S.toast, ...style }}>
      <img src={goldIcon} alt="" style={S.icon} draggable={false} />
      <span style={S.amount}>+{value.toLocaleString()} Gold</span>
      <span style={S.reason}>{reason}</span>
      {onClose && (
        <button type="button" style={S.closeBtn} onClick={onClose} aria-label="Close gold reward">
          x
        </button>
      )}
    </div>
  );
}

export default memo(GoldRewardToast);

const S = {
  toast: {
    position: 'fixed',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 34px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(440px, calc(100vw - 24px))',
    zIndex: 10000,
    background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 14,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    boxShadow: '0 16px 36px var(--terminal-shadow)',
    animation: 'fadeIn 0.3s ease-out',
    pointerEvents: 'auto',
    boxSizing: 'border-box',
  },
  icon: {
    width: 41,
    height: 41,
    objectFit: 'contain',
    flexShrink: 0,
    filter: 'none',
  },
  amount: {
    fontSize: 18,
    fontWeight: 750,
    color: 'var(--terminal-orange)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  reason: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--terminal-text-muted)',
    flex: 1,
    textAlign: 'right',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: uiIconButton('secondary', 26, {
    fontSize: 13,
    flexShrink: 0,
    marginLeft: 4,
    lineHeight: 1,
  }),
};
