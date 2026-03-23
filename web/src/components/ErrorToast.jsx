import { memo } from 'react';

function ErrorToast({ message }) {
  if (!message) return null;

  return (
    <div style={styles.toast}>⚠️ {message}</div>
  );
}

export default memo(ErrorToast);

const styles = {
  toast: {
    position: 'fixed',
    top: 60,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'linear-gradient(180deg, #C62828, #8E0000)',
    border: '3px solid #E53935',
    color: '#fff',
    padding: '10px 24px',
    borderRadius: 16,
    fontSize: 15,
    fontWeight: 800,
    zIndex: 25,
    pointerEvents: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
};
