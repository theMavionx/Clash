import { memo, useState, useEffect, useRef } from 'react';

function FilterPopup({ visible, onClose, filters, onChange, symbols, showSide, sortOptions }) {
  const ref = useRef(null);

  // Close on click outside
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
    <div ref={ref} style={S.popup}>
      <div style={S.header}>
        <span style={S.title}>Filters</span>
        <button style={S.resetBtn} onClick={() => onChange({ symbol: 'All', side: 'All', sortBy: sortOptions[0]?.value || 'time', sortDir: 'desc' })}>Reset</button>
      </div>

      {/* Symbol filter */}
      <div style={S.section}>
        <span style={S.label}>Symbol</span>
        <div style={S.chips}>
          {['All', ...symbols].map(s => (
            <button key={s} style={filters.symbol === s ? S.chipActive : S.chip} onClick={() => set('symbol', s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* Side filter */}
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
  );
}

export default memo(FilterPopup);

const S = {
  popup: {
    position: 'absolute', top: 32, right: 8, zIndex: 400,
    width: 280, background: '#fdf8e7', border: '4px solid #d4c8b0', borderRadius: 14,
    boxShadow: '0 10px 30px rgba(0,0,0,0.3)', padding: 12,
    display: 'flex', flexDirection: 'column', gap: 10,
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: 900, color: '#5C3A21' },
  resetBtn: {
    padding: '3px 10px', background: '#d4c8b0', border: '2px solid #bba882', borderRadius: 6,
    fontSize: 11, fontWeight: 800, color: '#5C3A21', cursor: 'pointer',
  },
  section: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 10, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip: {
    padding: '4px 10px', background: '#e8dfc8', border: '2px solid #d4c8b0',
    borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: '#5C3A21',
  },
  chipActive: {
    padding: '4px 10px', background: '#4CAF50', border: '2px solid #2E7D32',
    borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: '#fff',
  },
};
