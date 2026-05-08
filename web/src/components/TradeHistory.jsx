import { memo, useEffect, useState } from 'react';
import { getReadClient } from '../lib/decibel';
import { fetchPerplFills } from '../lib/perplClient';
import { PHOENIX_API_URL, phoenixSymbol } from '../lib/phoenixClient';

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

function perplMarket(markets, id) {
  const n = Number(id);
  return (markets || []).find(m => Number(m.market_id) === n)
    || (markets || []).find(m => String(m.symbol || '').toUpperCase() === String(id || '').toUpperCase())
    || null;
}

function normalizePerplTrade(fill, markets) {
  const m = perplMarket(markets, fill?.mkt ?? fill?.market_id ?? fill?.market);
  if (!m) return null;
  const priceDecimals = Number(m.price_decimals ?? 1);
  const sizeDecimals = Number(m.size_decimals ?? 5);
  const price = Number(fill?.p ?? fill?.price ?? 0) / 10 ** priceDecimals;
  const rawSize = Number(fill?.s ?? fill?.size ?? fill?.fs ?? 0);
  const amount = Math.abs(rawSize) / 10 ** sizeDecimals;
  const type = Number(fill?.t ?? fill?.type ?? fill?.ot);
  const isClose = type === 3 || type === 4 || fill?.ro === true || fill?.reduce_only === true;
  const isLong = type === 1 || type === 4 || rawSize > 0;
  const side = isClose
    ? (isLong ? 'close_long' : 'close_short')
    : (isLong ? 'open_long' : 'open_short');
  const ts = fill?.at?.t ?? fill?.created_at ?? fill?.timestamp ?? fill?.time ?? fill?.ts;
  return {
    ...fill,
    _dex: 'monad',
    id: fill?.fid || fill?.id || fill?.oid || `${fill?.mkt}:${fill?.p}:${fill?.s}:${ts}`,
    symbol: m.symbol,
    side,
    action: side,
    amount,
    price,
    fee: Number(fill?.f ?? fill?.fee ?? 0) / 1e6,
    created_at: ts,
  };
}

function normalizePhoenixTrade(fill, markets) {
  const symbol = phoenixSymbol(fill?.marketSymbol || fill?.symbol || fill?.market);
  if (!symbol) return null;
  const m = (markets || []).find(x => String(x.symbol || '').toUpperCase() === symbol);
  const lotsDecimals = Number(m?._phoenixBaseLotsDecimals ?? 4);
  const baseDelta = Number(fill?.baseLotsDelta ?? fill?.baseQty ?? fill?.size ?? 0);
  const beforeLots = Number(fill?.baseLotsBefore ?? 0);
  const afterLots = Number(fill?.baseLotsAfter ?? 0);
  const amount = Math.abs(
    fill?.baseQty != null || fill?.size != null
      ? Number(fill?.baseQty ?? fill?.size)
      : baseDelta / 10 ** lotsDecimals
  );
  const instruction = String(fill?.instructionType || '').toLowerCase();
  const reduced = Number.isFinite(beforeLots)
    && Number.isFinite(afterLots)
    && Math.abs(afterLots) < Math.abs(beforeLots)
    && beforeLots !== 0;
  const isClose = reduced || instruction.includes('close') || fill?.isReduceOnly;
  const directionLots = isClose ? beforeLots : baseDelta;
  const isLong = directionLots >= 0;
  const side = isClose
    ? (isLong ? 'close_long' : 'close_short')
    : (isLong ? 'open_long' : 'open_short');
  const id = [
    fill?.fillId,
    fill?.signature,
    fill?.slot,
    fill?.slotIndex,
    fill?.instructionIndex,
    fill?.eventIndex,
    symbol,
  ].filter(v => v !== undefined && v !== null && v !== '').join(':');
  return {
    ...fill,
    _dex: 'phoenix',
    id,
    symbol,
    side,
    action: side,
    amount,
    price: fill?.price,
    fee: Math.abs(Number(fill?.fees || 0)),
    created_at: fill?.timestamp,
    realized_pnl_amount: fill?.realizedPnl,
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
        if (dex === 'monad') {
          const data = await fetchPerplFills({ limit: 100 });
          const rows = Array.isArray(data) ? data
            : Array.isArray(data?.data) ? data.data
            : Array.isArray(data?.fills) ? data.fills
            : Array.isArray(data?.items) ? data.items
            : [];
          if (!cancelled) setTrades(rows.map(t => normalizePerplTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'phoenix') {
          const r = await fetch(`${PHOENIX_API_URL}/v1/traders/${encodeURIComponent(addr)}/trades_v2?limit=100`, {
            signal: controller.signal,
          });
          if (!r.ok) throw new Error(`Phoenix history error ${r.status}`);
          const d = await r.json();
          const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
          if (!cancelled) setTrades(rows.map(t => normalizePhoenixTrade(t, markets)).filter(Boolean));
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
    const name = dex === 'decibel' ? 'Decibel ' : dex === 'monad' ? 'Perpl ' : dex === 'phoenix' ? 'Phoenix ' : '';
    return <div style={{ padding: 20, textAlign: 'center', color: '#a3906a' }}>No {name}trade history</div>;
  }

  const isDecibel = dex === 'decibel';
  const showPnl = dex === 'decibel' || dex === 'phoenix';

  return (
    <table style={S.table}>
      <thead><tr>
        <th style={S.th}>Time</th>
        <th style={S.th}>Symbol</th>
        <th style={S.th}>Side</th>
        <th style={S.th}>Price</th>
        <th style={S.th}>Amount</th>
        <th style={S.th}>Fee</th>
        {showPnl && <th style={S.th}>PnL</th>}
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
              {showPnl && (
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
