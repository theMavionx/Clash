import { memo, useEffect, useState } from 'react';
import { getReadClient } from '../lib/decibel';

const PACIFICA_API = 'https://api.pacifica.fi/api/v1';
const READ_TIMEOUT_MS = 8000;

function timeMs(value) {
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function findMarket(markets, identifier) {
  const id = String(identifier || '').toLowerCase();
  if (!id || !Array.isArray(markets)) return null;
  return markets.find(m =>
    String(m.market_addr || '').toLowerCase() === id ||
    String(m.market_name || '').toLowerCase() === id ||
    String(m.symbol || '').toLowerCase() === id
  ) || null;
}

function decibelSymbol(trade, markets) {
  const m = findMarket(markets, trade.market);
  if (m?.symbol) return m.symbol;
  const raw = String(trade.market_name || trade.market || '');
  return raw.includes('-') ? raw.split('-')[0].toUpperCase() : raw.slice(0, 8).toUpperCase();
}

function normalizeDecibelTrade(trade, markets) {
  const action = String(trade.action || '');
  return {
    ...trade,
    _dex: 'decibel',
    id: trade.trade_id || trade.order_id || `${trade.transaction_version || ''}:${trade.order_id || ''}`,
    symbol: decibelSymbol(trade, markets),
    side: action,
    action,
    amount: trade.size,
    price: trade.price,
    fee: trade.fee_amount,
    created_at: trade.transaction_unix_ms,
  };
}

function displayNumber(value, digits = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function signedUsd(value, digits = 4) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return '$0.0000';
  return `${n > 0 ? '+' : '-'}$${Math.abs(n).toFixed(digits)}`;
}

function TradeHistory({ walletAddr, accountAddr, dex = 'pacifica', markets = [], filters }) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const addr = dex === 'decibel' ? accountAddr : (accountAddr || walletAddr);
    if (!addr) {
      setTrades([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    let cancelled = false;

    setLoading(true);
    setError('');

    async function load() {
      try {
        if (dex === 'decibel') {
          const read = await getReadClient();
          const res = await read.userTradeHistory.getByAddr({
            subAddr: addr,
            limit: 100,
            offset: 0,
            fetchOptions: { signal: controller.signal },
          });
          if (!cancelled) setTrades((res?.items || []).map(t => normalizeDecibelTrade(t, markets)));
          return;
        }

        const r = await fetch(`${PACIFICA_API}/trades/history?account=${addr}`, {
          signal: controller.signal,
        });
        const d = await r.json();
        if (!cancelled) setTrades(Array.isArray(d.data) ? d.data : []);
      } catch (e) {
        if (!cancelled && e?.name !== 'AbortError') {
          setTrades([]);
          setError(e?.message || 'Could not load trade history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [walletAddr, accountAddr, dex, markets]);

  let filtered = trades;

  if (filters?.symbol && filters.symbol !== 'All') {
    filtered = filtered.filter(t => (t.symbol || '').toUpperCase().includes(filters.symbol.toUpperCase()));
  }

  if (filters?.side && filters.side !== 'All') {
    const isLong = filters.side === 'Long';
    filtered = filtered.filter(t => {
      const side = String(t.side || t.action || '').toLowerCase();
      return isLong
        ? side.includes('long') || side === 'bid'
        : side.includes('short') || side === 'ask';
    });
  }

  const sortBy = filters?.sortBy || 'time';
  const dir = filters?.sortDir === 'asc' ? 1 : -1;
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'time') return dir * (timeMs(b.created_at) - timeMs(a.created_at));
    if (sortBy === 'symbol') return dir * (a.symbol || '').localeCompare(b.symbol || '');
    if (sortBy === 'size') return dir * (Math.abs(parseFloat(b.amount || 0)) - Math.abs(parseFloat(a.amount || 0)));
    if (sortBy === 'price') return dir * (parseFloat(b.price || 0) - parseFloat(a.price || 0));
    return 0;
  });

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center', color: '#a3906a' }}>Loading...</div>;
  }
  if (error) {
    return <div style={{ padding: 20, textAlign: 'center', color: '#B71C1C', fontWeight: 800 }}>{error}</div>;
  }
  if (!filtered.length) {
    return <div style={{ padding: 20, textAlign: 'center', color: '#a3906a' }}>No {dex === 'decibel' ? 'Decibel ' : ''}trade history</div>;
  }

  const isDecibel = dex === 'decibel';

  return (
    <table style={S.table}>
      <thead><tr>
        <th style={S.th}>Time</th>
        <th style={S.th}>Symbol</th>
        <th style={S.th}>Side</th>
        <th style={S.th}>Price</th>
        <th style={S.th}>Amount</th>
        <th style={S.th}>Fee</th>
        {isDecibel && <th style={S.th}>PnL</th>}
        {isDecibel && <th style={S.th}>Funding</th>}
      </tr></thead>
      <tbody>
        {filtered.slice(0, 100).map((t, i) => {
          const side = String(t.side || t.action || '').toLowerCase();
          const isOpen = side.includes('open');
          const isLong = side.includes('long') || side === 'bid';
          const label = isOpen ? (isLong ? 'Open Long' : 'Open Short') : (isLong ? 'Close Long' : 'Close Short');
          const color = isLong ? '#4CAF50' : '#E53935';
          const ts = timeMs(t.created_at);
          const time = ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
          const pnl = Number(t.realized_pnl_amount || 0);
          const funding = Number(t.realized_funding_amount || 0);
          return (
            <tr key={t.id || i} style={S.tr}>
              <td style={S.td}>{time}</td>
              <td style={S.td}>{t.symbol || '-'}</td>
              <td style={{ ...S.td, color, fontWeight: 800 }}>{label}</td>
              <td style={S.td}>${displayNumber(t.price, 6)}</td>
              <td style={S.td}>{displayNumber(t.amount, 6)}</td>
              <td style={S.td}>${Number(t.fee || 0).toFixed(4)}</td>
              {isDecibel && (
                <td style={{ ...S.td, color: pnl >= 0 ? '#4CAF50' : '#E53935', fontWeight: 800 }}>
                  {signedUsd(pnl)}
                </td>
              )}
              {isDecibel && (
                <td style={{ ...S.td, color: funding >= 0 ? '#4CAF50' : '#E53935', fontWeight: 800 }}>
                  {signedUsd(funding)}
                </td>
              )}
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
