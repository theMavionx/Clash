import { memo, useEffect, useState } from 'react';
import GoldRewardToast from './GoldRewardToast';

const notifications = [];
let listener = null;

export function showGoldNotification(amount, reason) {
  const id = Date.now();
  notifications.push({ id, amount, reason });
  if (listener) listener([...notifications]);
}

function dismiss(id) {
  const idx = notifications.findIndex(n => n.id === id);
  if (idx !== -1) notifications.splice(idx, 1);
  if (listener) listener([...notifications]);
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
      {items.map((n) => (
        <GoldRewardToast
          key={n.id}
          amount={n.amount}
          reason={n.reason}
          onClose={() => dismiss(n.id)}
        />
      ))}
    </div>
  );
}

export default memo(GoldNotification);

const S = {
  container: {
    position: 'fixed',
    top: 80,
    right: 20,
    zIndex: 500,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    pointerEvents: 'none',
  },
};
