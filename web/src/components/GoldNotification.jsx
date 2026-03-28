import { memo, useEffect, useState } from 'react';

const notifications = [];
let listener = null;

// Global function — can be called from anywhere
export function showGoldNotification(amount, reason) {
  const id = Date.now();
  notifications.push({ id, amount, reason });
  if (listener) listener([...notifications]);
  setTimeout(() => {
    const idx = notifications.findIndex(n => n.id === id);
    if (idx !== -1) notifications.splice(idx, 1);
    if (listener) listener([...notifications]);
  }, 5000);
}

function GoldNotification() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    listener = setItems;
    return () => { listener = null; };
  }, []);

  if (!items.length) return null;

  return (
    <div style={S.container}>
      {items.map((n, i) => (
        <div key={n.id} style={{...S.toast, animationDelay: `${i * 0.1}s`}}>
          <span style={S.icon}>🪙</span>
          <div style={S.textCol}>
            <span style={S.amount}>+{n.amount.toLocaleString()} Gold</span>
            <span style={S.reason}>{n.reason}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(GoldNotification);

const S = {
  container: {
    position: 'fixed', top: 80, right: 20, zIndex: 500,
    display: 'flex', flexDirection: 'column', gap: 8,
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 18px',
    background: 'linear-gradient(135deg, #FFD700 0%, #FFA000 100%)',
    border: '3px solid #E65100', borderRadius: 16,
    boxShadow: '0 8px 24px rgba(255,160,0,0.5)',
    animation: 'goldSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
    pointerEvents: 'auto',
  },
  icon: { fontSize: 32, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' },
  textCol: { display: 'flex', flexDirection: 'column', gap: 2 },
  amount: {
    fontSize: 20, fontWeight: 900, color: '#5C3A21',
    textShadow: '0 1px 0 rgba(255,255,255,0.5)',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  reason: {
    fontSize: 12, fontWeight: 700, color: '#7B5B00',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
};
