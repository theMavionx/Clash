import { memo, useEffect, useState } from 'react';
import { getReadClient } from '../lib/decibel';
import { fetchPerplPositionHistory } from '../lib/perplClient';
import { phoenixFetch, phoenixSymbol } from '../lib/phoenixClient';
import { pacificaFetch } from '../lib/pacificaClient';
import { readOndoSession } from '../lib/ondoClient';

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

function decibelSymbol(row, markets) {
  const m = findMarket(markets, row.market);
  if (m?.symbol) return m.symbol;
  const raw = String(row.market_name || row.market || '');
  return raw.includes('-') ? raw.split('-')[0].toUpperCase() : raw.slice(0, 8).toUpperCase();
}

function normalizeDecibelFunding(row, markets) {
  const rawFunding = Number(row.realized_funding_amount || 0);
  const signedFunding = row.is_rebate ? Math.abs(rawFunding) : -Math.abs(rawFunding);
  const action = String(row.action || '');
  return {
    ...row,
    _dex: 'decibel',
    id: `${row.transaction_unix_ms || ''}:${row.market || ''}:${row.action || ''}:${row.size || ''}`,
    symbol: decibelSymbol(row, markets),
    side: action.toLowerCase().includes('long') ? 'bid' : 'ask',
    payout: signedFunding,
    rate: null,
    amount: row.size,
    fee: row.fee_amount,
    created_at: row.transaction_unix_ms,
  };
}

function perplMarket(markets, id) {
  const n = Number(id);
  return (markets || []).find(m => Number(m.market_id) === n)
    || (markets || []).find(m => String(m.symbol || '').toUpperCase() === String(id || '').toUpperCase())
    || null;
}

function normalizePerplFunding(row, markets) {
  const rawFunding = row?.funding ?? row?.funding_payment ?? row?.fp ?? row?.f;
  const n = Number(rawFunding);
  if (!Number.isFinite(n) || n === 0) return null;
  const m = perplMarket(markets, row?.mkt ?? row?.market_id ?? row?.market);
  const sizeDecimals = Number(m?.size_decimals ?? 5);
  const rawSize = Number(row?.s ?? row?.size ?? 0);
  const amount = Math.abs(rawSize) / 10 ** sizeDecimals;
  const ts = row?.at?.t ?? row?.created_at ?? row?.timestamp ?? row?.time ?? row?.ts;
  return {
    ...row,
    _dex: 'monad',
    id: row?.id || row?.pid || `${row?.mkt}:${ts}:${rawFunding}`,
    symbol: m?.symbol || String(row?.symbol || '').toUpperCase(),
    side: rawSize >= 0 ? 'bid' : 'ask',
    payout: n / 1e6,
    rate: null,
    amount,
    fee: 0,
    created_at: ts,
  };
}

function normalizePhoenixFunding(row) {
  const payout = Number(row?.fundingPayment ?? row?.funding_payment ?? 0);
  const ratePct = Number(row?.fundingRatePercentage ?? row?.funding_rate_percentage);
  const positionSize = Number(row?.positionSize ?? row?.position_size ?? 0);
  const positionSide = String(row?.positionSide ?? row?.position_side ?? '').toLowerCase();
  const ts = row?.timestamp ?? row?.created_at ?? row?.time;
  return {
    ...row,
    _dex: 'phoenix',
    id: row?.id || `${row?.symbol || ''}:${ts || ''}:${row?.fundingPayment || row?.funding_payment || ''}`,
    symbol: phoenixSymbol(row?.symbol),
    side: positionSide.includes('short') || positionSize < 0 ? 'ask' : 'bid',
    payout,
    rate: Number.isFinite(ratePct) ? ratePct / 100 : null,
    amount: Math.abs(positionSize),
    fee: 0,
    created_at: ts,
  };
}

function normalizeAsterFunding(row) {
  const rawSymbol = String(row?.symbol || '').toUpperCase();
  return {
    ...row,
    _dex: 'aster',
    id: row?.tranId || row?.id || `${rawSymbol}:${row?.time}:${row?.income}`,
    symbol: rawSymbol.replace(/USDT$/u, ''),
    side: '',
    payout: Number(row?.income ?? 0),
    rate: null,
    amount: null,
    fee: 0,
    created_at: row?.time ?? row?.timestamp,
  };
}

function displayNumber(value, digits = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function FundingHistory({ walletAddr, accountAddr, dex = 'pacifica', markets = [], filters, fetchFundingHistory }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const addr = dex === 'decibel' ? accountAddr : (accountAddr || walletAddr);
    if (!addr) {
      setPayments([]);
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
          const res = await read.userFundingHistory.getByAddr({
            subAddr: addr,
            limit: 100,
            offset: 0,
            fetchOptions: { signal: controller.signal },
          });
          if (!cancelled) setPayments((res?.items || []).map(p => normalizeDecibelFunding(p, markets)));
          return;
        }
        if (dex === 'monad') {
          const data = await fetchPerplPositionHistory({ limit: 100 });
          const rows = Array.isArray(data) ? data
            : Array.isArray(data?.data) ? data.data
            : Array.isArray(data?.positions) ? data.positions
            : Array.isArray(data?.items) ? data.items
            : [];
          if (!cancelled) setPayments(rows.map(p => normalizePerplFunding(p, markets)).filter(Boolean));
          return;
        }
        if (dex === 'phoenix') {
          const qs = new URLSearchParams({ traderPdaIndex: '0', limit: '100' });
          const d = await phoenixFetch(`/trader/${encodeURIComponent(addr)}/funding-history?${qs}`, {
            signal: controller.signal,
          });
          const rows = Array.isArray(d?.events) ? d.events
            : Array.isArray(d?.data) ? d.data
            : Array.isArray(d) ? d
            : [];
          if (!cancelled) setPayments(rows.map(normalizePhoenixFunding).filter(p => p.symbol));
          return;
        }
        if (dex === 'ondo') {
          const session = readOndoSession(addr);
          if (!session?.token) throw new Error('Sign in to Ondo Perps to view funding history');
          const token = typeof window !== 'undefined' ? window._playerToken : '';
          const response = await fetch(`/api/futures/ondo/funding?dex=ondo&account=${encodeURIComponent(addr)}&limit=100`, {
            headers: {
              ...(token ? { 'x-token': token } : {}),
              'x-dex': 'ondo',
              'x-ondo-wallet': addr,
              'x-ondo-token': session.token,
            },
            signal: controller.signal,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data?.detail || data?.error || `Ondo funding history ${response.status}`);
          if (!cancelled) setPayments(Array.isArray(data?.result) ? data.result : []);
          return;
        }
        if (dex === 'aster') {
          if (typeof fetchFundingHistory !== 'function') throw new Error('Aster one-tap signer is not ready');
          const rows = await fetchFundingHistory({ limit: 500 });
          if (!cancelled) setPayments((Array.isArray(rows) ? rows : []).map(normalizeAsterFunding).filter(row => row.symbol));
          return;
        }
        if (dex === 'domfi' || dex === 'hyperliquid' || dex === 'nado' || dex === 'leverup' || dex === 'ostium') {
          if (!cancelled) setPayments([]);
          return;
        }

        const d = await pacificaFetch(`/funding/history?account=${encodeURIComponent(addr)}`, {
          signal: controller.signal,
        });
        if (!cancelled) setPayments(Array.isArray(d.data) ? d.data : []);
      } catch (e) {
        if (!cancelled && e?.name !== 'AbortError') {
          setPayments([]);
          setError(e?.message || 'Could not load funding history');
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
  }, [walletAddr, accountAddr, dex, markets, fetchFundingHistory]);

  let filtered = payments;

  if (filters?.symbol && filters.symbol !== 'All') {
    filtered = filtered.filter(p => (p.symbol || '').toUpperCase().includes(filters.symbol.toUpperCase()));
  }

  if (filters?.side && filters.side !== 'All') {
    const wantBid = filters.side === 'Long';
    filtered = filtered.filter(p => {
      const side = String(p.side || p.action || '').toLowerCase();
      return wantBid
        ? side === 'bid' || side.includes('long')
        : side === 'ask' || side.includes('short');
    });
  }

  const sortBy = filters?.sortBy || 'time';
  const dir = filters?.sortDir === 'asc' ? 1 : -1;
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'time') return dir * (timeMs(b.created_at) - timeMs(a.created_at));
    if (sortBy === 'symbol') return dir * (a.symbol || '').localeCompare(b.symbol || '');
    if (sortBy === 'amount') return dir * (Math.abs(parseFloat(b.payout || 0)) - Math.abs(parseFloat(a.payout || 0)));
    return 0;
  });

  if (loading) {
    return <div style={S.state}>Loading...</div>;
  }
  if (error) {
    return <div style={{ ...S.state, color: 'var(--terminal-short)', fontWeight: 700 }}>{error}</div>;
  }
  if (!filtered.length) {
    const name = dex === 'decibel' ? 'Decibel ' : dex === 'ostium' ? 'Ostium rollover ' : dex === 'monad' ? 'Perpl ' : dex === 'phoenix' ? 'Phoenix ' : dex === 'hyperliquid' ? 'Hyperliquid ' : dex === 'nado' ? 'Nado ' : dex === 'ondo' ? 'Ondo ' : dex === 'leverup' ? 'LeverUp ' : dex === 'aster' ? 'Aster ' : '';
    return <div style={S.state}>No {name}funding payments</div>;
  }

  return (
    <div style={S.scroller}>
    <table style={S.table}>
      <thead><tr>
        <th style={S.th}>Time</th>
        <th style={S.th}>Symbol</th>
        <th style={S.th}>Side</th>
        <th style={S.th}>Rate</th>
        <th style={S.th}>Payment</th>
        <th style={S.th}>Position</th>
        {dex === 'decibel' && <th style={S.th}>Fee</th>}
      </tr></thead>
      <tbody>
        {filtered.slice(0, 100).map((p, i) => {
          const payout = Number(p.payout || 0);
          const rate = Number(p.rate);
          const color = payout >= 0 ? 'var(--terminal-long)' : 'var(--terminal-short)';
          const side = String(p.side || p.action || '').toLowerCase();
          const isLong = side === 'bid' || side.includes('long');
          const ts = timeMs(p.created_at);
          const time = ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
          return (
            <tr key={p.id || i} style={S.tr}>
              <td style={S.td}>{time}</td>
              <td style={S.td}>{p.symbol || '-'}</td>
              <td style={{ ...S.td, color: isLong ? 'var(--terminal-long)' : 'var(--terminal-short)', fontWeight: 700 }}>{isLong ? 'LONG' : 'SHORT'}</td>
              <td style={{ ...S.td, color: Number.isFinite(rate) ? (rate >= 0 ? 'var(--terminal-long)' : 'var(--terminal-short)') : 'var(--terminal-text-muted)' }}>
                {Number.isFinite(rate) ? `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(4)}%` : '-'}
              </td>
              <td style={{ ...S.td, color, fontWeight: 600 }}>{payout >= 0 ? '+' : '-'}${Math.abs(payout).toFixed(6)}</td>
              <td style={S.td}>{displayNumber(p.amount, 6)}</td>
              {dex === 'decibel' && <td style={S.td}>${Number(p.fee || 0).toFixed(4)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

export default memo(FundingHistory);

const S = {
  state: { padding: 20, textAlign: 'center', color: 'var(--terminal-text-muted)' },
  scroller: { width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', minWidth: 620, borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' },
  th: { padding: '6px 12px', textAlign: 'left', color: 'var(--terminal-text-muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', background: 'var(--terminal-surface-subtle)', whiteSpace: 'nowrap' },
  td: { padding: '6px 12px', color: 'var(--terminal-text)', fontSize: 12, borderBottom: '1px solid var(--terminal-border)', whiteSpace: 'nowrap' },
  tr: { background: 'var(--terminal-surface)' },
};
