import { memo, useState, useEffect } from 'react';

const API = 'https://api.pacifica.fi/api/v1';

function TradeHistory({ walletAddr }) {
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    if (!walletAddr) return;
    fetch(`${API}/trades/history?account=${walletAddr}`)
      .then(r => r.json())
      .then(d => { if (d.data) setTrades(d.data); })
      .catch(() => {});
  }, [walletAddr]);

  if (!trades.length) {
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
        {trades.slice(0, 50).map((t, i) => {
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
