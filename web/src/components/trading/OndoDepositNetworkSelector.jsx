export default function OndoDepositNetworkSelector({
  networks,
  selectedNetworkId,
  onSelect,
  disabled = false,
}) {
  const rows = Array.isArray(networks) ? networks : [];
  if (!rows.length) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Ondo deposit network"
      style={{
        flex: '1 0 100%',
        display: 'grid',
        gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
        gap: 6,
        padding: 4,
        borderRadius: 10,
        border: '1px solid rgba(29, 166, 106, 0.30)',
        background: 'rgba(29, 166, 106, 0.08)',
      }}
    >
      {rows.map(network => {
        const selected = network.id === selectedNetworkId;
        return (
          <button
            key={network.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect?.(network.id)}
            disabled={disabled}
            style={{
              minWidth: 0,
              border: selected ? '2px solid #15803D' : '2px solid transparent',
              borderRadius: 8,
              padding: '7px 8px',
              background: selected ? '#fff8e6' : 'transparent',
              color: selected ? '#166534' : '#6B5A42',
              fontSize: 11,
              fontWeight: 900,
              cursor: disabled ? 'default' : 'pointer',
              boxShadow: selected ? '0 1px 3px rgba(21,128,61,0.16)' : 'none',
            }}
          >
            {network.label}
          </button>
        );
      })}
    </div>
  );
}
