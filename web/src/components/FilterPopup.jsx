import { memo, useRef, useEffect, useState } from 'react';

// Token icons logic
const TOKEN_COLORS = {
  BTC:'#F7931A',ETH:'#627EEA',SOL:'#9945FF',DOGE:'#C2A633',XRP:'#23292F',
  SUI:'#4DA2FF',TRUMP:'#FFD700',BNB:'#F3BA2F',HYPE:'#00D4AA',ENA:'#7C3AED',
  PAXG:'#E4CE4F',ZEC:'#F4B728',XMR:'#FF6600',AVAX:'#E84142',ADA:'#0033AD',
  DOT:'#E6007A',LINK:'#2A5ADA',ARB:'#213147',OP:'#FF0420',NEAR:'#000',
  GOLD:'#FFD700',SILVER:'#C0C0C0',CL:'#1a1a1a',NATGAS:'#4CAF50',
};
const TokenIcon = ({sym, size = 20}) => {
  const bg = TOKEN_COLORS[sym] || '#a3906a';
  return (
    <div style={{width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden'}}>
      <img src={`/tokens/${sym}.svg`} alt="" width={size} height={size} style={{borderRadius: '50%'}}
        onError={e => {
          if (e.target.src.endsWith('.svg')) {
            e.target.src = `/tokens/${sym}.png`;
          } else {
            e.target.style.display='none';
            e.target.nextSibling.style.display='flex';
          }
        }} />
      <span style={{display: 'none', fontSize: size * 0.5, fontWeight: 900, color: '#fff', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%'}}>{sym.charAt(0)}</span>
    </div>
  );
};

function FilterPopup({ visible, onClose, filters, onChange, symbols, showSide, sortOptions }) {
  const ref = useRef(null);
  const [openDropdown, setOpenDropdown] = useState(false);

  useEffect(() => {
    if (!visible) {
      setOpenDropdown(false);
      return;
    }
    const handle = (e) => {
      // Close modal if clicking outside modal completely
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
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
            <button style={S.resetBtn} onClick={() => {
              onChange({ symbol: 'All', side: 'All', sortBy: sortOptions[0]?.value || 'time', sortDir: 'desc' });
              setOpenDropdown(false);
            }}>Reset</button>
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Symbol */}
        <div style={{...S.section, position: 'relative', zIndex: 10}}>
          <span style={S.label}>Market / Token</span>
          <div 
            tabIndex={0}
            style={S.selectWrap} 
            onClick={() => setOpenDropdown(!openDropdown)}
            onBlur={(e) => {
              // Close dropdown if focus moves outside of the wrap
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setOpenDropdown(false);
              }
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              {filters.symbol !== 'All' ? <TokenIcon sym={filters.symbol} size={18} /> : <div style={{width: 18, height: 18}}></div>}
              <span>{filters.symbol}</span>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5C3A21" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transform: openDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s'}}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            
            {openDropdown && (
              <div className="grad-scrollbar" style={S.dropdownList}>
                {['All', ...symbols].map(s => (
                  <div 
                    key={s} 
                    style={{...S.dropdownItem, background: filters.symbol === s ? '#e8dfc8' : 'transparent'}}
                    onMouseOver={(e) => e.currentTarget.style.background = filters.symbol === s ? '#e8dfc8' : 'rgba(187, 168, 130, 0.2)'}
                    onMouseOut={(e) => e.currentTarget.style.background = filters.symbol === s ? '#e8dfc8' : 'transparent'}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      set('symbol', s); 
                      setOpenDropdown(false); 
                    }}
                  >
                    {s !== 'All' ? <TokenIcon sym={s} size={18} /> : <div style={{width: 18, height: 18}}></div>}
                    {s}
                  </div>
                ))}
              </div>
            )}
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
  selectWrap: {
    position: 'relative',
    width: '100%',
    padding: '8px 12px',
    background: '#e8dfc8',
    border: '2px solid #bba882',
    borderRadius: 8,
    outline: 'none',
    fontSize: 14,
    fontWeight: 800,
    color: '#5C3A21',
    cursor: 'pointer',
    boxShadow: 'inset 0 2px 2px #fff, 0 2px 4px rgba(0,0,0,0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: -2,
    right: -2,
    marginTop: 4,
    background: '#fdf8e7',
    border: '3px solid #bba882',
    borderRadius: 12,
    maxHeight: 220,
    overflowY: 'auto',
    boxShadow: '0 8px 16px rgba(0,0,0,0.2), inset 0 0 0 1px #fff',
    display: 'flex',
    flexDirection: 'column',
    padding: 6,
    zIndex: 20,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
    color: '#5C3A21',
    transition: 'background 0.1s',
  },
};
