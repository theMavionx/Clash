import { memo, useState, useEffect } from 'react';

const API = 'https://api.pacifica.fi/api/v1';

function FundingHistory({ walletAddr, filters }) {
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    if (!walletAddr) return;
    fetch(`${API}/funding/history?account=${walletAddr}`)
      .then(r => r.json())
      .then(d => { if (d.data) setPayments(d.data); })
      .catch(() => {});
  }, [walletAddr]);

  let filtered = payments;

  // Symbol filter
  if (filters?.symbol && filters.symbol !== 'All') {
    filtered = filtered.filter(p => (p.symbol || '').toUpperCase().includes(filters.symbol.toUpperCase()));
  }

  // Side filter
  if (filters?.side && filters.side !== 'All') {
    const isLong = filters.side === 'Long';
    filtered = filtered.filter(p => {
      const side = (p.side || '').toLowerCase();
      return isLong ? side === 'bid' || side.includes('long') : side === 'ask' || side.includes('short');
    });
  }

  // Sort
  const sortBy = filters?.sortBy || 'time';
  const dir = filters?.sortDir === 'asc' ? 1 : -1;
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'time') return dir * (new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (sortBy === 'symbol') return dir * (a.symbol || '').localeCompare(b.symbol || '');
    if (sortBy === 'amount') return dir * (Math.abs(parseFloat(b.payment || 0)) - Math.abs(parseFloat(a.payment || 0)));
    return 0;
  });

  if (!filtered.length) {
    return <div style={{padding: 20, textAlign: 'center', color: '#a3906a'}}>No funding payments</div>;
  }

  return (
    <table style={S.table}>
      <thead><tr>
        <th style={S.th}>Time</th>
        <th style={S.th}>Symbol</th>
        <th style={S.th}>Side</th>
        <th style={S.th}>Rate</th>
        <th style={S.th}>Payment</th>
        <th style={S.th}>Position</th>
      </tr></thead>
      <tbody>
        {filtered.slice(0, 100).map((p, i) => {
          const payment = parseFloat(p.payment || 0);
          const rate = parseFloat(p.funding_rate || 0);
          const color = payment >= 0 ? '#4CAF50' : '#E53935';
          const side = (p.side || '').toLowerCase();
          const isLong = side === 'bid' || side.includes('long');
          const time = new Date(p.created_at).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
          return (
            <tr key={i} style={S.tr}>
              <td style={S.td}>{time}</td>
              <td style={S.td}>{p.symbol || '—'}</td>
              <td style={{...S.td, color: isLong ? '#4CAF50' : '#E53935', fontWeight: 800}}>{isLong ? 'LONG' : 'SHORT'}</td>
              <td style={{...S.td, color}}>{rate >= 0 ? '+' : ''}{(rate * 100).toFixed(4)}%</td>
              <td style={{...S.td, color, fontWeight: 800}}>{payment >= 0 ? '+' : ''}${payment.toFixed(4)}</td>
              <td style={S.td}>{p.position_size || p.amount || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default memo(FundingHistory);

const S = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' },
  th: { padding: '4px 12px', textAlign: 'left', color: '#a3906a', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', background: '#e8dfc8' },
  td: { padding: '4px 12px', color: '#5C3A21', fontSize: 12, borderBottom: '1px solid #d4c8b0' },
  tr: { background: '#fdf8e7' },
};
