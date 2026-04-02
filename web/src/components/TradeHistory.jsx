import { memo, useState, useEffect } from 'react';

const API = 'https://api.pacifica.fi/api/v1';

function TradeHistory({ walletAddr, filters }) {
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    if (!walletAddr) return;
    fetch(`${API}/trades/history?account=${walletAddr}`)
      .then(r => r.json())
      .then(d => { if (d.data) setTrades(d.data); })
      .catch(() => {});
  }, [walletAddr]);

  let filtered = trades;

  // Symbol filter
  if (filters?.symbol && filters.symbol !== 'All') {
    filtered = filtered.filter(t => (t.symbol || '').toUpperCase().includes(filters.symbol.toUpperCase()));
  }

  // Side filter
  if (filters?.side && filters.side !== 'All') {
    const isLong = filters.side === 'Long';
    filtered = filtered.filter(t => {
      const side = (t.side || '').toLowerCase();
      return isLong ? side.includes('long') : side.includes('short');
    });
  }

  // Sort
  const sortBy = filters?.sortBy || 'time';
  const dir = filters?.sortDir === 'asc' ? 1 : -1;
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'time') return dir * (new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (sortBy === 'symbol') return dir * (a.symbol || '').localeCompare(b.symbol || '');
    if (sortBy === 'size') return dir * (Math.abs(parseFloat(b.amount || 0)) - Math.abs(parseFloat(a.amount || 0)));
    if (sortBy === 'price') return dir * (parseFloat(b.price || 0) - parseFloat(a.price || 0));
    return 0;
  });

  if (!filtered.length) {
    return <div style={{padding: 20, textAlign: 'center', color: '#a3906a'}}>No trade history</div>;
  }

  return (
    <table style={S.table}>
      <thead><tr>
        <th style={S.th}>Time</th>
        <th style={S.th}>Symbol</th>
        <th style={S.th}>Side</th>
        <th style={S.th}>Price</th>
        <th style={S.th}>Amount</th>
        <th style={S.th}>Fee</th>
      </tr></thead>
      <tbody>
        {filtered.slice(0, 100).map((t, i) => {
          const side = t.side || '';
          const isOpen = side.includes('open');
          const isLong = side.includes('long');
          const label = isOpen ? (isLong ? 'Open Long' : 'Open Short') : (isLong ? 'Close Long' : 'Close Short');
          const color = isLong ? '#4CAF50' : '#E53935';
          const time = new Date(t.created_at).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
          return (
            <tr key={i} style={S.tr}>
              <td style={S.td}>{time}</td>
              <td style={S.td}>{t.symbol || '—'}</td>
              <td style={{...S.td, color, fontWeight: 800}}>{label}</td>
              <td style={S.td}>${parseFloat(t.price || 0).toLocaleString()}</td>
              <td style={S.td}>{t.amount}</td>
              <td style={S.td}>${parseFloat(t.fee || 0).toFixed(4)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default memo(TradeHistory);

const S = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' },
  th: { padding: '4px 12px', textAlign: 'left', color: '#a3906a', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', background: '#e8dfc8' },
  td: { padding: '4px 12px', color: '#5C3A21', fontSize: 12, borderBottom: '1px solid #d4c8b0' },
  tr: { background: '#fdf8e7' },
};
