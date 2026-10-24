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
    // ClashBot alert toast: surface card, red hairline, red-50 icon disc.
    background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-short-border)',
    color: 'var(--terminal-text)',
    padding: '12px 16px',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    fontSize: 12,
    fontWeight: 500,
    zIndex: 10000,
    pointerEvents: 'none',
    boxShadow: 'var(--cb-shadow-lg)',
    textShadow: 'none',
    boxSizing: 'border-box',
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'var(--terminal-short-soft)',
    color: 'var(--terminal-short)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    fontSize: 13,
    fontWeight: 600,
    textShadow: 'none',
  },
  message: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'center',
  },
};
