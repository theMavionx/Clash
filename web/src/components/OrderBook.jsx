import { memo, useState, useEffect, useRef } from 'react';

const API = 'https://api.pacifica.fi/api/v1';

function OrderBook({ symbol = 'BTC' }) {
  const [book, setBook] = useState({ bids: [], asks: [] });
  const wsRef = useRef(null);

  useEffect(() => {
    let ws, reconnectTimer;

    function connect() {
      ws = new WebSocket('wss://ws.pacifica.fi/ws');
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'book', symbol, agg_level: 1 } }));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel === 'book' && msg.data?.l) {
            const [bids, asks] = msg.data.l;
            setBook({
              bids: (bids || []).slice(0, 12).map(b => ({ price: parseFloat(b.p), amount: parseFloat(b.a), count: b.n })),
              asks: (asks || []).slice(0, 12).map(a => ({ price: parseFloat(a.p), amount: parseFloat(a.a), count: a.n })),
            });
          }
        } catch {}
      };

      ws.onclose = () => { reconnectTimer = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [symbol]);

  const maxBidAmt = Math.max(...book.bids.map(b => b.amount), 1);
  const maxAskAmt = Math.max(...book.asks.map(a => a.amount), 1);
  const spread = book.asks[0] && book.bids[0] ? (book.asks[0].price - book.bids[0].price).toFixed(2) : '—';

  return (
    <div style={S.container}>
      <div style={S.header}>
        <span style={S.title}>Order Book</span>
        <span style={S.spread}>Spread: ${spread}</span>
      </div>

      {/* Asks (reversed — lowest at bottom, pushed down) */}
      <div style={S.sideAsks}>
        {[...book.asks].reverse().map((a, i) => (
          <div key={i} style={S.row}>
            <div style={{...S.bar, ...S.barAsk, width: `${(a.amount / maxAskAmt) * 100}%`}} />
            <span style={S.price}>{a.price.toLocaleString()}</span>
            <span style={S.amount}>{a.amount.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* Spread line */}
      <div style={S.spreadLine}>
        <span style={{fontSize: 14, fontWeight: 900, color: '#5C3A21'}}>
          {book.bids[0]?.price?.toLocaleString() || '—'}
        </span>
      </div>

      {/* Bids */}
      <div style={S.sideBids}>
        {book.bids.map((b, i) => (
          <div key={i} style={S.row}>
            <div style={{...S.bar, ...S.barBid, width: `${(b.amount / maxBidAmt) * 100}%`}} />
            <span style={{...S.price, color: '#4CAF50'}}>{b.price.toLocaleString()}</span>
            <span style={S.amount}>{b.amount.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(OrderBook);

const S = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: '#fdf8e7', fontFamily: '"Inter","Segoe UI",sans-serif',
    fontSize: 11, overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '4px 6px', borderBottom: '1px solid #e8dfc8',
  },
  title: { fontSize: 12, fontWeight: 800, color: '#5C3A21', textTransform: 'uppercase' },
  spread: { fontSize: 10, fontWeight: 700, color: '#a3906a' },
  sideAsks: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' },
  sideBids: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', overflow: 'hidden' },
  row: {
    display: 'flex', alignItems: 'center', padding: '1px 10px',
    position: 'relative', height: 20,
  },
  bar: {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    opacity: 0.15, transition: 'width 0.3s',
  },
  barBid: { background: '#4CAF50' },
  barAsk: { background: '#E53935' },
  price: {
    flex: 1, fontWeight: 700, color: '#E53935', zIndex: 1,
    fontFamily: 'monospace', fontSize: 11,
  },
  amount: {
    fontWeight: 600, color: '#77573d', zIndex: 1, textAlign: 'right',
    fontFamily: 'monospace', fontSize: 11,
  },
  spreadLine: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    padding: '2px 0', borderTop: '1px solid #e8dfc8', borderBottom: '1px solid #e8dfc8',
    background: '#e8dfc8', flexShrink: 0,
  },
};
