import { memo } from 'react';
import { createPortal } from 'react-dom';

function ErrorToast({ message }) {
  if (!message || typeof document === 'undefined') return null;

  return createPortal(
    <div style={styles.toast} role="alert" aria-live="assertive">
      <span style={styles.icon} aria-hidden="true">!</span>
      <span style={styles.message}>{message}</span>
    </div>,
    document.body,
  );
}

export default memo(ErrorToast);

const styles = {
  toast: {
    position: 'fixed',
    top: 'max(12px, env(safe-area-inset-top, 0px))',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(520px, calc(100vw - 24px))',
    background: 'linear-gradient(180deg, var(--terminal-short-strong), #8E0000)',
    border: '1px solid var(--terminal-short)',
    color: 'var(--terminal-on-accent)',
    padding: '9px 12px',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    fontSize: 14,
    fontWeight: 600,
    zIndex: 10000,
    pointerEvents: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    textShadow: 'none',
    boxSizing: 'border-box',
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'var(--terminal-surface)',
    color: 'var(--terminal-short-strong)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    fontSize: 16,
    fontWeight: 700,
    textShadow: 'none',
  },
  message: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'center',
  },
};
