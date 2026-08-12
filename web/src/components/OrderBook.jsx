import { memo, useState, useEffect, useMemo, useRef } from 'react';
import { createPhoenixPublicWsClient, phoenixSymbol } from '../lib/phoenixClient';
import { PACIFICA_WS_URL, pacificaFetch } from '../lib/pacificaClient';
import { startDecibelOrderBook } from '../lib/decibelOrderBook';
import { normalizeBulkOrderBook } from '../lib/bulkClient';
import { ONDO_WS_URL, buildOndoWsPing, ondoMarketName } from '../lib/ondoClient';

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
    if (dex === 'aster') {
      let cancelled = false;
      let controller = new AbortController();
      const load = async () => {
        controller.abort();
        controller = new AbortController();
        try {
          const params = new URLSearchParams({ dex: 'aster', symbol, limit: '100' });
          const response = await fetch(`${FUTURES_API}/orderbook?${params.toString()}`, { signal: controller.signal });
          const json = await response.json().catch(() => null);
          if (!response.ok) throw new Error(json?.detail || json?.error || `Aster order book ${response.status}`);
          if (!cancelled) setBook(normalizePhoenixBook(json));
        } catch (error) {
          if (!cancelled && error?.name !== 'AbortError') console.warn('[Aster] order book snapshot failed', error?.message || error);
        }
      };
      void load();
      const timer = window.setInterval(load, 2_000);
      return () => {
        cancelled = true;
        controller.abort();
        window.clearInterval(timer);
      };
    }

    if (dex === 'leverup') {
      setBook({ bids: [], asks: [] });
      return undefined;
    }

    if (dex === 'ondo') {
      let cancelled = false;
      let socket = null;
      let heartbeat = null;
      let reconnectTimer = null;
      let reconnectAttempts = 0;
      const controller = new AbortController();
      const selectedMarket = ondoMarketName(marketName || symbol);
      const loadSnapshot = async () => {
        try {
          const params = new URLSearchParams({ dex: 'ondo', symbol, limit: '25' });
          const response = await fetch(`${FUTURES_API}/orderbook?${params.toString()}`, { signal: controller.signal });
          const json = await response.json().catch(() => null);
          if (!response.ok) throw new Error(json?.detail || json?.error || `Ondo order book ${response.status}`);
          if (!cancelled) setBook(normalizePhoenixBook(json));
        } catch (error) {
          if (!cancelled && error?.name !== 'AbortError') console.warn('[Ondo] order book snapshot failed', error?.message || error);
        }
      };

      const connect = () => {
        if (cancelled) return;
        socket = new WebSocket(ONDO_WS_URL);
        wsRef.current = socket;
        socket.addEventListener('open', () => {
          reconnectAttempts = 0;
          socket.send(JSON.stringify({
            op: 'subscribe',
            channel: 'depthBooksPerps',
            markets: [selectedMarket],
            depthLevels: '0.01',
            limit: 25,
          }));
          const sendPing = () => {
            if (socket?.readyState !== WebSocket.OPEN) return;
            const id = globalThis.crypto?.randomUUID?.() || `clash-book-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            socket.send(JSON.stringify(buildOndoWsPing(id)));
          };
          sendPing();
          heartbeat = window.setInterval(sendPing, 1_000);
        });
        socket.addEventListener('message', (event) => {
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          if (message?.type !== 'update' || message?.channel !== 'depthBooksPerps' || !Array.isArray(message.data)) return;
          const update = message.data.find(row => ondoMarketName(row?.market) === selectedMarket);
          if (update && !cancelled) setBook(normalizePhoenixBook(update));
        });
        socket.addEventListener('close', () => {
          if (heartbeat) window.clearInterval(heartbeat);
          heartbeat = null;
          if (cancelled) return;
          void loadSnapshot();
          reconnectAttempts += 1;
          reconnectTimer = window.setTimeout(connect, Math.min(15_000, 1_000 * (2 ** Math.min(reconnectAttempts, 4))));
        });
        socket.addEventListener('error', () => socket?.close());
      };

      void loadSnapshot();
      connect();
      return () => {
        cancelled = true;
        controller.abort();
        if (heartbeat) window.clearInterval(heartbeat);
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        socket?.close();
        if (wsRef.current === socket) wsRef.current = null;
      };
    }

    if (dex === 'bulk') {
      let cancelled = false;
      const controller = new AbortController();
      const load = async () => {
        try {
          const params = new URLSearchParams({ dex: 'bulk', symbol, limit: '25' });
          const response = await fetch(`${FUTURES_API}/orderbook?${params.toString()}`, { signal: controller.signal });
          const json = await response.json().catch(() => null);
          if (!response.ok) throw new Error(json?.detail || json?.error || `Bulk order book ${response.status}`);
          if (!cancelled) setBook(normalizeBulkOrderBook(json));
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

  if (dex === 'leverup') {
    return (
      <section className="futures-order-book" style={S.container} aria-label={`${symbol} pricing model`}>
        <div style={S.header}>
          <span style={S.title}>Pricing</span>
        </div>
        <div style={S.oracleOnly}>
          <span style={S.oracleBadge}>ORACLE</span>
          <strong style={S.oracleTitle}>Oracle-priced market</strong>
          <span style={S.oracleCopy}>LeverUp V2 does not publish a public L2 order book. Orders use the live LeverUp oracle and on-chain slippage configuration.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="futures-order-book" style={S.container} aria-label={`${symbol} order book`}>
      <div style={S.header}>
        <span style={S.title}>Order Book</span>
        <div style={S.headerRight}>
          <span style={S.spread}>Spread: ${spreadDisplay || spread}</span>
          <select
            aria-label="Order book price step"
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
      <div style={S.columns} aria-hidden="true">
        <span>Price</span>
        <span>Size {String(symbol || '').replace(/-PERP$/u, '')}</span>
      </div>

      {/* Asks (reversed — lowest at bottom, pushed down) */}
      <div style={S.sideAsks}>
        {[...displayBook.asks].reverse().map((a) => (
          <div key={`${a.price}:${a.amount}`} style={S.row}>
            <div style={{...S.bar, ...S.barAsk, width: `${(a.amount / maxAskAmt) * 100}%`}} />
            <span style={{...S.price, color: 'var(--terminal-short)'}}>{formatBookPrice(a.price, priceStep)}</span>
            <span style={S.amount}>{a.amount.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* Spread line */}
      <div style={S.spreadLine}>
        <span style={{fontSize: 14, fontWeight: 750, color: 'var(--terminal-text)', fontVariantNumeric: 'tabular-nums'}}>
          {book.bids[0]?.price?.toLocaleString() || '—'}
        </span>
      </div>

      {/* Bids */}
      <div style={S.sideBids}>
        {displayBook.bids.map((b) => (
          <div key={`${b.price}:${b.amount}`} style={S.row}>
            <div style={{...S.bar, ...S.barBid, width: `${(b.amount / maxBidAmt) * 100}%`}} />
            <span style={{...S.price, color: 'var(--terminal-long)'}}>{formatBookPrice(b.price, priceStep)}</span>
            <span style={S.amount}>{b.amount.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default memo(OrderBook);

const S = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--terminal-surface)',
    fontSize: 11, overflow: 'hidden', fontVariantNumeric: 'tabular-nums',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    minHeight: 34, padding: '5px 8px', borderBottom: '1px solid var(--terminal-border)',
  },
  title: { fontSize: 11, fontWeight: 750, color: 'var(--terminal-text)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  spread: { fontSize: 10, fontWeight: 650, color: 'var(--terminal-text-faint)', whiteSpace: 'nowrap' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  columns: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
    padding: '4px 8px', borderBottom: '1px solid var(--terminal-surface-muted)',
    color: 'var(--terminal-text-faint)', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  stepSelect: {
    height: 24,
    minWidth: 54,
    background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border-strong)',
    borderRadius: 6,
    color: 'var(--terminal-text-control)',
    fontSize: 10,
    fontWeight: 700,
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
  barBid: { background: 'var(--terminal-long)' },
  barAsk: { background: 'var(--terminal-short)' },
  price: {
    flex: 1, fontWeight: 700, color: 'var(--terminal-short)', zIndex: 1,
    fontSize: 11, fontVariantNumeric: 'tabular-nums',
  },
  amount: {
    fontWeight: 600, color: 'var(--terminal-text-muted)', zIndex: 1, textAlign: 'right',
    fontSize: 11, fontVariantNumeric: 'tabular-nums',
  },
  spreadLine: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    padding: '4px 0', borderTop: '1px solid var(--terminal-border)', borderBottom: '1px solid var(--terminal-border)',
    background: 'var(--terminal-surface-subtle)', flexShrink: 0,
  },
  oracleOnly: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
    textAlign: 'center',
    background: 'var(--terminal-surface-subtle)',
  },
  oracleBadge: {
    border: '1px solid var(--terminal-brand)',
    borderRadius: 999,
    padding: '3px 8px',
    color: 'var(--terminal-brand-text)',
    background: 'var(--terminal-brand-soft)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
  oracleTitle: { color: 'var(--terminal-text)', fontSize: 13, fontWeight: 700 },
  oracleCopy: { color: 'var(--terminal-text-muted)', fontSize: 11, lineHeight: 1.45, maxWidth: 240 },
};
