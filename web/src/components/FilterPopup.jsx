import { memo, useRef, useEffect } from 'react';

function FilterPopup({ visible, onClose, filters, onChange, symbols, showSide, sortOptions }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [visible, onClose]);

  if (!visible) return null;

  const set = (key, val) => onChange({ ...filters, [key]: val });

  return (
    <div style={S.backdrop}>
      <div ref={ref} style={S.modal} data-nodrag>
        <div style={S.header}>
          <span style={S.title}>Filters</span>
          <div style={{display: 'flex', gap: 8}}>
            <button style={S.resetBtn} onClick={() => onChange({ symbol: 'All', side: 'All', sortBy: sortOptions[0]?.value || 'time', sortDir: 'desc' })}>Reset</button>
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Symbol */}
        <div style={S.section}>
          <span style={S.label}>Symbol</span>
          <div style={S.chips}>
            {['All', ...symbols].map(s => (
              <button key={s} style={filters.symbol === s ? S.chipActive : S.chip} onClick={() => set('symbol', s)}>{s}</button>
            ))}
          </div>
        </div>

        {/* Side */}
        {showSide && (
          <div style={S.section}>
            <span style={S.label}>Side</span>
            <div style={S.chips}>
              {['All', 'Long', 'Short'].map(s => (
                <button key={s} style={filters.side === s ? S.chipActive : S.chip} onClick={() => set('side', s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Sort */}
        <div style={S.section}>
          <span style={S.label}>Sort by</span>
          <div style={S.chips}>
            {sortOptions.map(o => (
              <button key={o.value} style={filters.sortBy === o.value ? S.chipActive : S.chip} onClick={() => set('sortBy', o.value)}>{o.label}</button>
            ))}
          </div>
        </div>

        {/* Direction */}
        <div style={S.section}>
          <span style={S.label}>Order</span>
          <div style={S.chips}>
            <button style={filters.sortDir === 'desc' ? S.chipActive : S.chip} onClick={() => set('sortDir', 'desc')}>Newest first</button>
            <button style={filters.sortDir === 'asc' ? S.chipActive : S.chip} onClick={() => set('sortDir', 'asc')}>Oldest first</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(FilterPopup);

const S = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 500,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    width: 340, maxWidth: '90vw', background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 20,
    boxShadow: '0 15px 40px rgba(0,0,0,0.4)', padding: 20,
    display: 'flex', flexDirection: 'column', gap: 14,
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 900, color: '#5C3A21' },
  resetBtn: {
    padding: '5px 14px', background: '#d4c8b0', border: '2px solid #bba882', borderRadius: 8,
    fontSize: 12, fontWeight: 800, color: '#5C3A21', cursor: 'pointer',
  },
  closeBtn: {
    width: 28, height: 28, borderRadius: '50%', background: '#E53935', border: '2px solid #fff',
    color: '#fff', fontWeight: 900, fontSize: 14, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    padding: '6px 14px', background: '#e8dfc8', border: '2px solid #d4c8b0',
    borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#5C3A21',
  },
  chipActive: {
    padding: '6px 14px', background: '#4CAF50', border: '2px solid #2E7D32',
    borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#fff',
  },
};
