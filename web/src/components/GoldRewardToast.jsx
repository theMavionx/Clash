import { memo } from 'react';
import goldIcon from '../assets/resources/gold_bar.png';

function GoldRewardToast({ amount, reason = 'Trading rewards', onClose, style }) {
  const value = Number(amount || 0);
  if (!(value > 0)) return null;

  return (
    <div style={{ ...S.toast, ...style }}>
      <img src={goldIcon} alt="" style={S.icon} draggable={false} />
      <span style={S.amount}>+{value.toLocaleString()} Gold</span>
      <span style={S.reason}>{reason}</span>
      {onClose && (
        <button style={S.closeBtn} onClick={onClose} aria-label="Close gold reward">
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
    top: 'max(14px, env(safe-area-inset-top))',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(440px, calc(100vw - 24px))',
    zIndex: 10000,
    background: 'linear-gradient(135deg, #FFD700 0%, #FFA000 100%)',
    border: '3px solid #E65100',
    borderRadius: 14,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    boxShadow: '0 6px 20px rgba(255,160,0,0.4)',
    animation: 'fadeIn 0.3s ease-out',
    pointerEvents: 'auto',
    boxSizing: 'border-box',
  },
  icon: {
    width: 41,
    height: 41,
    objectFit: 'contain',
    flexShrink: 0,
    filter: 'drop-shadow(0 0 1px #fff) drop-shadow(0 0 3px #fff) drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
  },
  amount: {
    fontSize: 18,
    fontWeight: 900,
    color: '#5C3A21',
    textShadow: '0 1px 0 rgba(255,255,255,0.5)',
    whiteSpace: 'nowrap',
  },
  reason: {
    fontSize: 11,
    fontWeight: 700,
    color: '#7B5B00',
    flex: 1,
    textAlign: 'right',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.15)',
    border: 'none',
    color: '#5C3A21',
    fontWeight: 900,
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    padding: 0,
    lineHeight: 1,
  },
};
