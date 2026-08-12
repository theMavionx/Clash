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
        gap: 4,
        padding: 4,
        borderRadius: 10,
        border: '1px solid var(--terminal-border)',
        background: 'var(--terminal-surface-subtle)',
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
              border: selected ? '1px solid var(--terminal-orange)' : '1px solid transparent',
              borderRadius: 8,
              minHeight: 36,
              padding: '7px 8px',
              background: selected ? 'var(--terminal-brand-soft)' : 'transparent',
              color: selected ? 'var(--terminal-brand-strong)' : 'var(--terminal-text-muted)',
              fontSize: 11,
              fontWeight: 700,
              cursor: disabled ? 'default' : 'pointer',
              boxShadow: 'none',
            }}
          >
            {network.label}
          </button>
        );
      })}
    </div>
  );
}
