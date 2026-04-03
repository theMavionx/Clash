import { memo, useCallback } from 'react';
import { useSend, useUI } from '../hooks/useGodot';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const RES_ICONS = { gold: goldIcon, wood: woodIcon, ore: stoneIcon };
const RES_COLORS = {
  gold: '#FFD700',
  wood: '#8BC34A',
  ore: '#90A4AE',
};

const CollectButton = memo(function CollectButton({ serverId, x, y, resource, amount, onCollect }) {
  const color = RES_COLORS[resource] || '#FFD700';
  return (
    <div style={{ position: 'fixed', left: x - 24, top: y - 56, zIndex: 15, pointerEvents: 'all' }}>
      <button
        style={{ ...styles.btn, borderColor: color, boxShadow: `0 4px 12px ${color}66` }}
        onClick={() => onCollect(serverId)}
      >
        <img src={RES_ICONS[resource] || goldIcon} alt={resource} style={styles.icon} />
        <span style={styles.amount}>+{amount}</span>
      </button>
    </div>
  );
});

function CollectButtons() {
  const { sendToGodot } = useSend();
  const { collectibles } = useUI();

  const handleCollect = useCallback((serverId) => {
    sendToGodot('collect_resource', { server_id: serverId });
  }, [sendToGodot]);

  if (!collectibles || collectibles.length === 0) return null;

  return (
    <>
      {collectibles.map((c) => (
        <CollectButton
          key={c.server_id}
          serverId={c.server_id}
          x={c.position.x}
          y={c.position.y}
          resource={c.resource}
          amount={c.amount}
          onCollect={handleCollect}
        />
      ))}
    </>
  );
}

const styles = {
  btn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    background: 'rgba(0, 0, 0, 0.7)',
    border: '2px solid #FFD700',
    borderRadius: 14,
    padding: '6px 10px',
    cursor: 'pointer',
    transition: 'transform 0.1s',
    backdropFilter: 'blur(4px)',
  },
  icon: {
    width: 28,
    height: 28,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
  },
  amount: {
    fontSize: 12,
    fontWeight: 900,
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
  },
};

export default memo(CollectButtons);
