import { memo, useState, useEffect, useMemo, useRef } from 'react';
import { createPhoenixPublicWsClient, phoenixSymbol } from '../lib/phoenixClient';
import { PACIFICA_WS_URL, pacificaFetch } from '../lib/pacificaClient';
import { startDecibelOrderBook } from '../lib/decibelOrderBook';

const PRICE_STEPS = [0.01, 0.02, 0.1, 1];
const FUTURES_API = import.meta.env.VITE_FUTURES_API || '/api/futures';

function decimalsForStep(step) {
  const n = Number(step);
  if (!Number.isFinite(n) || n <= 0) return 2;
  const text = String(n);
  if (text.includes('e-')) return Number(text.split('e-')[1] || 2);
  const [, decimals = ''] = text.split('.');
  return decimals.length;
}

function formatStep(step) {
  return Number(step).toFixed(decimalsForStep(step));
}

function formatBookPrice(price, step) {
  const n = Number(price);
  if (!Number.isFinite(n)) return '-';
  const decimals = decimalsForStep(step);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function aggregateLevels(levels, side, step) {
  const numericStep = Number(step);
  if (!Number.isFinite(numericStep) || numericStep <= 0) return levels;
  const decimals = decimalsForStep(numericStep);
  const grouped = new Map();
  for (const level of Array.isArray(levels) ? levels : []) {
    const price = Number(level.price);
    const amount = Number(level.amount);
    if (!Number.isFinite(price) || !Number.isFinite(amount)) continue;
    const bucket = Math.round(price / numericStep) * numericStep;
    const key = bucket.toFixed(decimals + 2);
    const prev = grouped.get(key) || { price: bucket, amount: 0, count: 0 };
    prev.amount += amount;
    prev.count += Number(level.count || 1);
    grouped.set(key, prev);
  }
  return Array.from(grouped.values())
    .sort((a, b) => side === 'ask' ? a.price - b.price : b.price - a.price)
    .slice(0, 12);
}

function normalizePhoenixLevel(level, index) {
  const price = Array.isArray(level) ? level[0] : level?.price ?? level?.p;
  const amount = Array.isArray(level) ? level[1] : level?.size ?? level?.amount ?? level?.a;
  return {
    price: Number(price),
    amount: Number(amount),
    count: Array.isArray(level) ? index + 1 : level?.count ?? level?.n ?? index + 1,
  };
}

function normalizePhoenixLevels(levels) {
  return (Array.isArray(levels) ? levels : [])
    .slice(0, 12)
    .map(normalizePhoenixLevel)
    .filter(level => Number.isFinite(level.price) && Number.isFinite(level.amount));
}

function normalizePhoenixBook(update) {
  return {
    bids: normalizePhoenixLevels(update?.bids),
    asks: normalizePhoenixLevels(update?.asks),
  };
}

function normalizeBulkBook(payload) {
  const data = payload?.data || payload;
  return {
    bids: normalizePhoenixLevels(data?.bids),
    asks: normalizePhoenixLevels(data?.asks),
  };
}

function normalizePacificaBookPayload(payload) {
  const levels = payload?.data?.l || payload?.l;
  if (!Array.isArray(levels)) return null;
  const [bids = [], asks = []] = levels;
  return {
    bids: (bids || []).slice(0, 12).map(b => ({ price: parseFloat(b.p), amount: parseFloat(b.a), count: b.n })),
    asks: (asks || []).slice(0, 12).map(a => ({ price: parseFloat(a.p), amount: parseFloat(a.a), count: a.n })),
  };
}

function OrderBook({
  symbol = 'BTC',
  dex = 'pacifica',
  marketName = '',
  marketAddr = '',
  priceStep = 0.01,
  onPriceStepChange,
  onTopOfBookChange,
}) {
  const [book, setBook] = useState({ bids: [], asks: [] });
  const wsRef = useRef(null);

  useEffect(() => {
    if (dex === 'bulk') {
      let cancelled = false;
      const controller = new AbortController();
      const load = async () => {
        try {
          const params = new URLSearchParams({ dex: 'bulk', symbol, limit: '25' });
          const response = await fetch(`${FUTURES_API}/orderbook?${params.toString()}`, { signal: controller.signal });
          const json = await response.json().catch(() => null);
          if (!response.ok) throw new Error(json?.detail || json?.error || `Bulk order book ${response.status}`);
          if (!cancelled) setBook(normalizeBulkBook(json));
        } catch (error) {
          if (!cancelled && error?.name !== 'AbortError') console.warn('[Bulk] order book snapshot failed', error?.message || error);
        }
      };
      load();
      const timer = window.setInterval(load, 3_000);
      return () => {
        cancelled = true;
        controller.abort();
        window.clearInterval(timer);
      };
    }

    if (dex === 'decibel') {
      const stop = startDecibelOrderBook({
        symbol,
        marketName,
        marketAddr,
        onData: setBook,
        onError: error => console.warn('[Decibel] order book stream failed', error?.message || error),
      });
      wsRef.current = stop;
      return () => {
        stop();
        if (wsRef.current === stop) wsRef.current = null;
      };
    }

    if (dex === 'phoenix') {
      let cancelled = false;
      let flushTimer = null;
      let latestBook = null;
      const controller = new AbortController();
      const streams = createPhoenixPublicWsClient();
      wsRef.current = streams;
      const market = phoenixSymbol(symbol);

      function flushBook() {
        if (latestBook && !cancelled) {
          setBook(latestBook);
          latestBook = null;
        }
        flushTimer = null;
      }

      async function streamOrderBook() {
        try {
          for await (const update of streams.l2Book(market, controller.signal)) {
            if (cancelled) break;
            latestBook = normalizePhoenixBook(update);
            if (!flushTimer) flushTimer = setTimeout(flushBook, 100);
          }
        } catch (e) {
          if (!cancelled && !controller.signal.aborted) {
            console.warn('[Phoenix] orderbook stream failed', e?.message || e);
          }
        }
      }

      streamOrderBook();
      return () => {
        cancelled = true;
        controller.abort();
        clearTimeout(flushTimer);
        if (wsRef.current === streams) wsRef.current = null;
      };
    }

    let ws, reconnectTimer, throttleTimer = null, latestBook = null, cancelled = false;

    function flushBook() {
      if (latestBook && !cancelled) { setBook(latestBook); latestBook = null; }
      throttleTimer = null;
    }

    async function fetchBookSnapshot() {
      try {
        const data = await pacificaFetch(`/book?symbol=${encodeURIComponent(symbol)}&agg_level=1`);
        const snapshot = normalizePacificaBookPayload(data);
        if (snapshot && !cancelled) setBook(snapshot);
      } catch (error) {
        if (!cancelled) console.warn('[Pacifica] orderbook REST fallback failed', error?.message || error);
      }
    }

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(PACIFICA_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'book', symbol, agg_level: 1 } }));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel === 'book' && msg.data?.l) {
            latestBook = normalizePacificaBookPayload(msg);
            if (!throttleTimer) throttleTimer = setTimeout(flushBook, 100);
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!cancelled) {
          fetchBookSnapshot();
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
      ws.onerror = () => {
        if (!cancelled) {
          fetchBookSnapshot();
          ws.close();
        }
      };
    }

    fetchBookSnapshot();
    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      clearTimeout(throttleTimer);
      if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); }
    };
  }, [symbol, dex, marketName, marketAddr]);

  useEffect(() => {
    if (typeof onTopOfBookChange !== 'function') return;
    onTopOfBookChange({
      bid: book.bids[0]?.price ?? null,
      ask: book.asks[0]?.price ?? null,
    });
  }, [book, onTopOfBookChange]);

  const displayBook = useMemo(() => ({
    bids: aggregateLevels(book.bids, 'bid', priceStep),
    asks: aggregateLevels(book.asks, 'ask', priceStep),
  }), [book, priceStep]);

  const maxBidAmt = Math.max(...displayBook.bids.map(b => b.amount), 1);
  const maxAskAmt = Math.max(...displayBook.asks.map(a => a.amount), 1);
  const spreadDisplay = book.asks[0] && book.bids[0]
    ? formatBookPrice(book.asks[0].price - book.bids[0].price, priceStep)
    : '-';
  const spread = book.asks[0] && book.bids[0] ? (book.asks[0].price - book.bids[0].price).toFixed(2) : '—';

  return (
    <div style={S.container}>
      <div style={S.header}>
        <span style={S.title}>Order Book</span>
        <div style={S.headerRight}>
          <span style={S.spread}>Spread: ${spreadDisplay || spread}</span>
          <select
            value={String(priceStep)}
            onChange={(event) => onPriceStepChange?.(Number(event.target.value))}
            style={S.stepSelect}
            title="Order book price step"
          >
            {PRICE_STEPS.map(step => (
              <option key={step} value={step}>{formatStep(step)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Asks (reversed — lowest at bottom, pushed down) */}
      <div style={S.sideAsks}>
        {[...displayBook.asks].reverse().map((a) => (
          <div key={`${a.price}:${a.amount}`} style={S.row}>
            <div style={{...S.bar, ...S.barAsk, width: `${(a.amount / maxAskAmt) * 100}%`}} />
            <span style={S.price}>{formatBookPrice(a.price, priceStep)}</span>
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
        {displayBook.bids.map((b) => (
          <div key={`${b.price}:${b.amount}`} style={S.row}>
            <div style={{...S.bar, ...S.barBid, width: `${(b.amount / maxBidAmt) * 100}%`}} />
            <span style={{...S.price, color: '#4CAF50'}}>{formatBookPrice(b.price, priceStep)}</span>
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
    background: '#fdf8e7',
    fontSize: 11, overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '4px 6px', borderBottom: '1px solid #e8dfc8',
  },
  title: { fontSize: 12, fontWeight: 800, color: '#5C3A21', textTransform: 'uppercase' },
  spread: { fontSize: 10, fontWeight: 700, color: '#a3906a' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  stepSelect: {
    height: 24,
    minWidth: 54,
    background: '#fdf8e7',
    border: '2px solid #d4c8b0',
    borderRadius: 6,
    color: '#5C3A21',
    fontSize: 10,
    fontWeight: 900,
    outline: 'none',
    cursor: 'pointer',
  },
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
