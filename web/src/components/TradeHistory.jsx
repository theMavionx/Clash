import { memo, useEffect, useState } from 'react';
import { getReadClient } from '../lib/decibel';
import { fetchPerplFills } from '../lib/perplClient';
import { phoenixFetch, phoenixSymbol } from '../lib/phoenixClient';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
} from '../lib/encryptedCredentialStorage';

const PACIFICA_API = 'https://api.pacifica.fi/api/v1';
const HYPERLIQUID_API = import.meta.env.VITE_HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz';
const READ_TIMEOUT_MS = 8000;
const GRVT_STORAGE_KEY = 'clash_grvt_credentials_v1';

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

function normalizeHyperliquidTrade(fill) {
  const symbol = String(fill?.coin || fill?.symbol || '').toUpperCase();
  if (!symbol) return null;
  const dir = String(fill?.dir || '');
  const isClose = /close/i.test(dir);
  const isLong = /long/i.test(dir) || fill?.side === 'B';
  const side = isClose
    ? (isLong ? 'close_long' : 'close_short')
    : (isLong ? 'open_long' : 'open_short');
  const id = fill?.tid || fill?.hash || fill?.oid || `${symbol}:${fill?.time}:${fill?.px}:${fill?.sz}`;
  return {
    ...fill,
    _dex: 'hyperliquid',
    id,
    symbol,
    side,
    action: dir || side,
    amount: fill?.sz,
    price: fill?.px,
    fee: Math.abs(Number(fill?.fee || 0)),
    created_at: fill?.time,
    realized_pnl_amount: fill?.closedPnl,
  };
}

function normalizeRisexTrade(fill, markets) {
  const marketId = Number(fill?.market_id ?? fill?.marketId ?? fill?.market);
  const m = (markets || []).find(x => Number(x.market_id ?? x.pair_index) === marketId)
    || (markets || []).find(x => String(x.symbol || '').toUpperCase() === String(fill?.symbol || '').toUpperCase());
  const symbol = String(fill?.symbol || fill?.market_symbol || m?.symbol || '').toUpperCase().replace(/-PERP$/u, '');
  if (!symbol) return null;
  const stepSize = Number(m?._risex?.stepSize || m?.lot_size || 1);
  const stepPrice = Number(m?._risex?.stepPrice || m?.tick_size || 1);
  const amount = fill?.size_steps != null
    ? Math.abs(Number(fill.size_steps || 0) * stepSize)
    : Math.abs(Number(fill?.size ?? fill?.quantity ?? fill?.base_size ?? 0));
  const price = fill?.price_ticks != null
    ? Number(fill.price_ticks || 0) * stepPrice
    : Number(fill?.price ?? fill?.fill_price ?? fill?.execution_price ?? 0);
  const sideRaw = String(fill?.side || '').toLowerCase();
  const isAsk = sideRaw === 'ask' || sideRaw === 'sell' || sideRaw === 'short' || sideRaw === '1';
  const isClose = fill?.reduce_only === true || fill?.reduceOnly === true || /close/i.test(String(fill?.direction || fill?.type || ''));
  const side = isClose
    ? (isAsk ? 'close_long' : 'close_short')
    : (isAsk ? 'open_short' : 'open_long');
  const ts = fill?.timestamp ?? fill?.time ?? fill?.created_at ?? fill?.createdAt;
  return {
    ...fill,
    _dex: 'risex',
    id: fill?.fill_id || fill?.trade_id || fill?.order_id || `${symbol}:${ts}:${price}:${amount}`,
    symbol,
    side,
    action: side,
    amount,
    price,
    fee: Math.abs(Number(fill?.fee ?? fill?.fee_amount ?? 0)),
    created_at: ts,
    realized_pnl_amount: fill?.realized_pnl ?? fill?.realizedPnl ?? fill?.closed_pnl,
  };
}

function normalizeNadoTrade(fill, markets) {
  const productId = Number(fill?.market_id ?? fill?.pair_index ?? fill?.productId ?? fill?.product_id);
  const m = (markets || []).find(x => Number(x.market_id ?? x.pair_index) === productId)
    || (markets || []).find(x => String(x.symbol || '').toUpperCase() === String(fill?.symbol || '').toUpperCase());
  const symbol = String(fill?.symbol || fill?.market_symbol || m?.symbol || '').toUpperCase().replace(/-PERP$/u, '');
  if (!symbol) return null;
  const amount = Math.abs(Number(fill?.amount ?? fill?.size ?? fill?.base_size ?? 0));
  const price = Number(fill?.price ?? fill?.fill_price ?? fill?.execution_price ?? 0);
  const sideRaw = String(fill?.side || fill?.action || '').toLowerCase();
  const side = sideRaw.includes('close_long') ? 'close_long'
    : sideRaw.includes('close_short') ? 'close_short'
    : sideRaw.includes('open_long') || sideRaw === 'long' || sideRaw === 'bid' || sideRaw === 'buy' ? 'open_long'
    : sideRaw.includes('open_short') || sideRaw === 'short' || sideRaw === 'ask' || sideRaw === 'sell' ? 'open_short'
    : 'open_long';
  const ts = fill?.created_at ?? fill?.timestamp ?? fill?.time ?? fill?.createdAt;
  return {
    ...fill,
    _dex: 'nado',
    id: fill?.id || fill?.fill_id || fill?.trade_id || fill?.order_id || `${symbol}:${ts}:${price}:${amount}`,
    symbol,
    side,
    action: side,
    amount,
    price,
    fee: Math.abs(Number(fill?.fee ?? fill?.fee_amount ?? 0)),
    created_at: ts,
    realized_pnl_amount: fill?.realized_pnl ?? fill?.realizedPnl ?? fill?.closed_pnl ?? fill?.realized_pnl_amount,
  };
}

function normalizeHotstuffTrade(fill, markets) {
  const instrumentId = Number(fill?.pair_index ?? fill?.instrument_id ?? fill?.instrumentId);
  const m = (markets || []).find(x => Number(x.pair_index ?? x.market_id) === instrumentId)
    || (markets || []).find(x => String(x.symbol || '').toUpperCase() === String(fill?.symbol || '').toUpperCase());
  const symbol = String(fill?.symbol || fill?.instrument || m?.symbol || '').toUpperCase().replace(/-PERP$/u, '');
  if (!symbol) return null;
  const amount = Math.abs(Number(fill?.amount ?? fill?.size ?? 0));
  const price = Number(fill?.price ?? fill?.fill_price ?? 0);
  const sideRaw = String(fill?.side || fill?.direction || fill?.action || '').toLowerCase();
  const isClose = sideRaw.includes('close') || fill?.reduce_only === true || fill?.reduceOnly === true;
  const isShort = sideRaw.includes('short') || sideRaw === 's' || sideRaw === 'sell' || sideRaw === 'ask';
  const side = isClose
    ? (isShort ? 'close_short' : 'close_long')
    : (isShort ? 'open_short' : 'open_long');
  const ts = fill?.created_at ?? fill?.timestamp ?? fill?.block_timestamp ?? fill?.time;
  return {
    ...fill,
    _dex: 'hotstuff',
    id: fill?.id || fill?.trade_id || fill?.order_id || fill?.client_order_id || `${symbol}:${ts}:${price}:${amount}`,
    symbol,
    side,
    action: side,
    amount,
    price,
    fee: Math.abs(Number(fill?.fee ?? fill?.broker_fee ?? 0)),
    created_at: ts,
    realized_pnl_amount: fill?.realized_pnl ?? fill?.realizedPnl ?? fill?.closed_pnl ?? fill?.realized_pnl_amount,
  };
}

function normalizeGrvtCredentials(value) {
  if (!value?.subAccountId) return null;
  if (!value?.apiKey && (!value?.cookie || !value?.accountId)) return null;
  return value;
}

async function readGrvtCredentials() {
  const migrated = await migratePlainLocalStorageCredential(GRVT_STORAGE_KEY, GRVT_STORAGE_KEY, normalizeGrvtCredentials);
  return migrated || await readEncryptedCredential(GRVT_STORAGE_KEY);
}

function normalizeGrvtTrade(fill) {
  const rawSymbol = String(fill?.symbol || fill?.instrument || '').toUpperCase();
  const symbol = rawSymbol
    .replace(/_USDT?_PERP$/u, '')
    .replace(/_USD_PERP$/u, '')
    .replace(/-PERP$/u, '')
    .replace(/\/USD[TC]?$/u, '');
  if (!symbol) return null;
  const isBuyer = fill?.is_buyer === true || fill?.side === 'buy';
  return {
    ...fill,
    _dex: 'grvt',
    id: fill?.id || fill?.trade_id || `${fill?.event_time || fill?.created_at}:${rawSymbol}:${fill?.price}:${fill?.size}`,
    symbol,
    side: fill?.side || (isBuyer ? 'open_long' : 'open_short'),
    action: fill?.action || (isBuyer ? 'open_long' : 'open_short'),
    amount: Math.abs(Number(fill?.amount ?? fill?.size ?? 0)),
    price: fill?.price,
    fee: Math.abs(Number(fill?.fee ?? 0)),
    created_at: fill?.created_at ?? fill?.event_time,
    realized_pnl_amount: fill?.realized_pnl_amount ?? fill?.realized_pnl,
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
          const d = await phoenixFetch(`/trader/${encodeURIComponent(addr)}/trades-history?limit=100`, {
            signal: controller.signal,
          });
          const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
          if (!cancelled) setTrades(rows.map(t => normalizePhoenixTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'hyperliquid') {
          const r = await fetch(`${HYPERLIQUID_API}/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'userFills', user: addr }),
            signal: controller.signal,
          });
          if (!r.ok) throw new Error(`Hyperliquid history error ${r.status}`);
          const d = await r.json();
          const rows = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
          if (!cancelled) setTrades(rows.map(normalizeHyperliquidTrade).filter(Boolean));
          return;
        }
        if (dex === 'risex') {
          const token = typeof window !== 'undefined' ? window._playerToken : null;
          const r = await fetch(`/api/futures/risex/trade-history?dex=risex&account=${encodeURIComponent(addr)}&limit=100`, {
            headers: {
              ...(token ? { 'x-token': token } : {}),
              'x-dex': 'risex',
            },
            signal: controller.signal,
          });
          if (!r.ok) throw new Error(`RISEx history error ${r.status}`);
          const d = await r.json();
          const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : Array.isArray(d?.fills) ? d.fills : [];
          if (!cancelled) setTrades(rows.map(t => normalizeRisexTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'nado') {
          const token = typeof window !== 'undefined' ? window._playerToken : null;
          const r = await fetch(`/api/futures/nado/trade-history?dex=nado&account=${encodeURIComponent(addr)}&limit=100`, {
            headers: {
              ...(token ? { 'x-token': token } : {}),
              'x-dex': 'nado',
            },
            signal: controller.signal,
          });
          if (!r.ok) throw new Error(`Nado history error ${r.status}`);
          const d = await r.json();
          const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : Array.isArray(d?.fills) ? d.fills : [];
          if (!cancelled) setTrades(rows.map(t => normalizeNadoTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'hotstuff') {
          const token = typeof window !== 'undefined' ? window._playerToken : null;
          const r = await fetch(`/api/futures/hotstuff/trade-history?dex=hotstuff&account=${encodeURIComponent(addr)}&limit=100`, {
            headers: {
              ...(token ? { 'x-token': token } : {}),
              'x-dex': 'hotstuff',
            },
            signal: controller.signal,
          });
          if (!r.ok) throw new Error(`Hotstuff history error ${r.status}`);
          const d = await r.json();
          const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : Array.isArray(d?.fills) ? d.fills : [];
          if (!cancelled) setTrades(rows.map(t => normalizeHotstuffTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'grvt') {
          const token = typeof window !== 'undefined' ? window._playerToken : null;
          const creds = await readGrvtCredentials();
          if (!creds) {
            if (!cancelled) setTrades([]);
            return;
          }
          const r = await fetch('/api/futures/grvt/trade-history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'x-token': token } : {}),
              'x-dex': 'grvt',
            },
            body: JSON.stringify({
              api_key: creds.apiKey,
              cookie: creds.cookie,
              account_id: creds.accountId,
              sub_account_id: accountAddr || creds.subAccountId,
              limit: 100,
            }),
            signal: controller.signal,
          });
          if (!r.ok) throw new Error(`GRVT history error ${r.status}`);
          const d = await r.json();
          const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : Array.isArray(d?.result) ? d.result : [];
          if (!cancelled) setTrades(rows.map(normalizeGrvtTrade).filter(Boolean));
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
    const name = dex === 'decibel' ? 'Decibel ' : dex === 'monad' ? 'Perpl ' : dex === 'phoenix' ? 'Phoenix ' : dex === 'hyperliquid' ? 'Hyperliquid ' : dex === 'risex' ? 'RISEx ' : dex === 'nado' ? 'Nado ' : dex === 'hotstuff' ? 'Hotstuff ' : dex === 'grvt' ? 'GRVT ' : dex === 'gmtrade' ? 'GMTrade ' : dex === 'flash' ? 'Flash Trade ' : '';
    return <div style={{ padding: 20, textAlign: 'center', color: '#a3906a' }}>No {name}trade history</div>;
  }

  const isDecibel = dex === 'decibel';
  const showPnl = dex === 'decibel' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hotstuff' || dex === 'grvt' || dex === 'gmtrade' || dex === 'flash';

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
