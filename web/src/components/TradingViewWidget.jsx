import { memo, useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { getReadClient } from '../lib/decibel';
import { phoenixCandlesRoute, phoenixFetch } from '../lib/phoenixClient';

const PACIFICA_API = 'https://api.pacifica.fi/api/v1';
// Pyth Benchmarks serves historical candles in TradingView UDF format for
// every Pyth feed. Route through our futures backend so browser CORS / 429s
// do not blank Avantis charts, and repeated requests can be cached server-side.
const PYTH_HISTORY_API = '/api/futures/pyth/history';

const INTERVALS = [
  { label: '1m', value: '1m', ms: 2 * 60 * 60 * 1000, pyth: '1' },
  { label: '5m', value: '5m', ms: 12 * 60 * 60 * 1000, pyth: '5' },
  { label: '15m', value: '15m', ms: 24 * 60 * 60 * 1000, pyth: '15' },
  { label: '1H', value: '1h', ms: 7 * 24 * 60 * 60 * 1000, pyth: '60' },
  { label: '4H', value: '4h', ms: 30 * 24 * 60 * 60 * 1000, pyth: '240' },
  { label: '1D', value: '1d', ms: 180 * 24 * 60 * 60 * 1000, pyth: '1D' },
];

const DECIBEL_INTERVALS = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

// Avantis trades a mix of crypto, equities, FX, and commodities — all via
// Pyth. Pyth identifies symbols as e.g. "Crypto.BTC/USD", "Equity.US.AAPL/USD",
// "FX.USD/JPY" (NOTE: FX pairs keep USD as BASE, not quote, in Pyth), and
// "Metal.XAU/USD". Our internal `symbol` key for FX is the concatenated
// "USDJPY" to avoid colliding with USD crypto rows.
//
// PREFER passing `pythSymbol` directly from Avantis market data —
// feed.attributes.symbol is authoritative. This fallback mapper is only used
// when the exact Pyth symbol isn't available (e.g. Pacifica DEX path).
// NOTE: REZ/AVNT/GOAT/MON/XPL are CRYPTO on Avantis (Crypto.REZ/USD etc),
// not equities. Previously misclassified here → chart 404'd.
const EQUITIES = new Set([
  'AAPL','AMZN','MSFT','NVDA','TSLA','GOOGL','GOOG','META','NFLX','AMD',
  'COIN','HOOD','MSTR','INTC','SPY','QQQ','DIS','IBM','ORCL','PYPL',
  'PLTR','SMCI','GME','BA','WMT','MCD','SBUX','BABA','KO','PEP',
  'JPM','BAC','GS','WFC','V','MA','CRCL',
]);
// FX non-USD quotes (Avantis has USD/JPY, USD/CAD, …). When the symbol arrives
// as e.g. "USDJPY" we split it into USD/JPY and build "FX.USD/JPY".
const FX_NON_USD = new Set([
  'EUR','GBP','JPY','AUD','CAD','CHF','NZD','CNH','CNY','INR','KRW',
  'MXN','SEK','SGD','TRY','BRL','IDR','TWD','ZAR',
]);
// Metals: Avantis uses XAU/XAG directly (Pyth's convention). Also keep GOLD
// / SILVER aliases in case the UI sends those.
const METALS = new Set(['XAU','XAG','XPT','XPD','GOLD','SILVER']);
const METAL_ALIAS = { GOLD: 'XAU', SILVER: 'XAG', PLATINUM: 'XPT', PALLADIUM: 'XPD' };
// Commodities: Pyth no longer has "Crude Oil.*" symbols on benchmarks — the
// working ones are "Commodities.USOILSPOT" (WTI spot) and
// "Commodities.UKOILSPOT" (Brent spot). Rolled-futures contracts like
// BRENTM6/WTIK6 are missing from benchmarks too, so we always fall through
// to the spot symbol for charting oil.
const COMMODITIES = new Set(['CL','NATGAS','COPPER']);

function toPythSymbol(sym) {
  const raw = String(sym || '').toUpperCase().trim();
  // Strip optional quote suffix first ("APT/USD" → "APT"). But NOT for FX
  // pairs stored as "USD/JPY" — those shouldn't be split naively.
  const s = raw.includes('/') ? raw.split('/')[0].trim() : raw;

  // FX: symbols stored as "USDJPY" → "FX.USD/JPY"
  if (s.length === 6 && s.startsWith('USD') && FX_NON_USD.has(s.slice(3))) {
    return `FX.USD/${s.slice(3)}`;
  }
  // Cross FX where non-USD is base, USD implicit quote
  if (FX_NON_USD.has(s)) return `FX.${s}/USD`;

  if (EQUITIES.has(s)) return `Equity.US.${s}/USD`;
  if (METALS.has(s)) return `Metal.${METAL_ALIAS[s] || s}/USD`;
  if (s === 'BRENT') return 'Commodities.UKOILSPOT';
  if (s === 'WTI' || s === 'USOILSPOT') return 'Commodities.USOILSPOT';
  if (COMMODITIES.has(s)) return `Commodities.${s}/USD`;
  return `Crypto.${s}/USD`;
}

// Some Avantis Pyth symbols charge on-chain via expiring futures contracts
// (BRENTM6, WTIK6, WTIM6) that Pyth Benchmarks doesn't serve historically.
// Map them to the spot equivalent for charting only; pricing stays on the
// real futures contract.
function benchmarksFallback(pythSymbol) {
  if (!pythSymbol) return null;
  const s = String(pythSymbol);
  if (/^Commodities\.BRENT/i.test(s) || /UKOIL/i.test(s)) return 'Commodities.UKOILSPOT';
  if (/^Commodities\.WTI/i.test(s) || /USOIL/i.test(s)) return 'Commodities.USOILSPOT';
  return null;
}

function shouldWidenPythWindow(pythSymbol) {
  return !String(pythSymbol || '').startsWith('Crypto.');
}

function pythWindowWidens(resolution) {
  if (resolution === '1') return [12 * 60 * 60];
  if (resolution === '5') return [3 * 86400];
  if (resolution === '15') return [3 * 86400, 7 * 86400];
  if (resolution === '60') return [14 * 86400, 30 * 86400];
  if (resolution === '240') return [30 * 86400, 90 * 86400];
  return [365 * 86400];
}

function candlesFromPythResponse(json) {
  if (json?.s !== 'ok' || !Array.isArray(json.t)) return [];
  return json.t.map((t, i) => ({
    time: t,
    open: parseFloat(json.o[i]),
    high: parseFloat(json.h[i]),
    low: parseFloat(json.l[i]),
    close: parseFloat(json.c[i]),
  })).filter(c => (
    c.time &&
    Number.isFinite(c.open) &&
    Number.isFinite(c.high) &&
    Number.isFinite(c.low) &&
    Number.isFinite(c.close)
  ));
}

function flatCandlesFromPrice(price, nowMs, tf) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return [];
  const toSec = Math.floor(nowMs / 1000);
  const spanMs = Math.min(tf?.ms || 60 * 60 * 1000, 60 * 60 * 1000);
  const fromSec = Math.max(1, Math.floor((nowMs - spanMs) / 1000));
  return [
    { time: fromSec, open: value, high: value, low: value, close: value },
    { time: toSec, open: value, high: value, low: value, close: value },
  ];
}

function decibelMarketName(sym) {
  const raw = String(sym || '').toUpperCase().trim();
  const [base, quote = 'USD'] = raw.split(/[-/]/);
  return `${(base || raw).trim()}/${(quote || 'USD').trim()}`;
}

function unixSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function normalizeDecibelCandles(rows) {
  return rows.map(c => ({
    time: unixSeconds(c.t ?? c.time ?? c.timestamp),
    open: Number(c.o ?? c.open),
    high: Number(c.h ?? c.high),
    low: Number(c.l ?? c.low),
    close: Number(c.c ?? c.close),
  }))
    .filter(c => c.time && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);
}

function fmtLineUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtBaseAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 100) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (n >= 0.01) return n.toFixed(4).replace(/0+$/u, '').replace(/\.$/u, '');
  return n.toFixed(6).replace(/0+$/u, '').replace(/\.$/u, '');
}

function displayPositionAmount(pos, mark, entry) {
  const raw = Math.abs(Number(pos?.amount || 0));
  const sizeUsd = Math.abs(Number(pos?.size_usd || pos?.notional || 0));
  const refPrice = Number(mark || entry || pos?.mark_price || pos?.entry_price || 0);
  if (sizeUsd > 0 && refPrice > 0) {
    const implied = sizeUsd / refPrice;
    if (!raw || Math.abs(raw * refPrice - sizeUsd) > Math.max(1, sizeUsd * 0.25)) {
      return implied;
    }
  }
  return raw;
}

async function fetchDecibelCandles(symbol, interval, startMs, endMs) {
  const read = await getReadClient();
  const rows = await read.candlesticks.getByName({
    marketName: decibelMarketName(symbol),
    interval: DECIBEL_INTERVALS[interval] || '5m',
    startTime: startMs,
    endTime: endMs,
    hideOutliers: true,
  });
  const candles = normalizeDecibelCandles(Array.isArray(rows) ? rows : []);
  if (!candles.length) throw new Error('No Decibel candles');
  return candles;
}

function TradingViewWidget({ symbol = 'BTC', pythSymbol = null, positions = [], orders = [], currentPrice, chartOverlay, dex = 'pacifica' }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const linesRef = useRef([]);
  const [interval, setInterval_] = useState('5m');
  const [loading, setLoading] = useState(false);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#fdf8e7' }, textColor: '#5C3A21', fontSize: 11 },
      grid: { vertLines: { color: '#e8dfc822' }, horzLines: { color: '#e8dfc844' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#d4c8b0', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#d4c8b0', timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#4CAF50', downColor: '#E53935',
      borderUpColor: '#2E7D32', borderDownColor: '#B71C1C',
      wickUpColor: '#4CAF50', wickDownColor: '#E53935',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load candles when symbol or interval changes
  useEffect(() => {
    if (!seriesRef.current) return;
    let cancelled = false;
    
    // Keep previous candles visible while the next range loads. Clearing here
    // made transient Pyth rate limits look like a permanently broken chart.
    setLoading(true);

    async function fetchBenchmarks(sym, resolution, fromSec, toSec) {
      const params = new URLSearchParams({
        symbol: sym,
        resolution: String(resolution),
        from: String(fromSec),
        to: String(toSec),
      });
      try {
        const r = await fetch(`${PYTH_HISTORY_API}?${params.toString()}`);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          return {
            s: 'error',
            errmsg: json?.errmsg || json?.error || `Pyth history ${r.status}`,
          };
        }
        return json || { s: 'error', errmsg: 'empty Pyth history response' };
      } catch (e) {
        return { s: 'error', errmsg: e?.message || 'Pyth history request failed' };
      }
    }

    async function loadPythCandles(tf, now, start) {
      const primary = pythSymbol || toPythSymbol(symbol);
      const fallback = benchmarksFallback(primary);
      const toSec = Math.floor(now / 1000);
      let fromSec = Math.floor(start / 1000);

      let json = await fetchBenchmarks(primary, tf.pyth, fromSec, toSec);
      if (json.s === 'error' && fallback && fallback !== primary) {
        json = await fetchBenchmarks(fallback, tf.pyth, fromSec, toSec);
      }

      for (const span of pythWindowWidens(tf.pyth)) {
        if (json.s !== 'ok' || !shouldWidenPythWindow(fallback || primary)) break;
        const bars = Array.isArray(json.t) ? json.t.length : 0;
        if (bars >= 2) break;
        fromSec = toSec - span;
        const sym = (fallback && json.s === 'error') ? fallback : primary;
        json = await fetchBenchmarks(sym, tf.pyth, fromSec, toSec);
      }

      return candlesFromPythResponse(json);
    }

    async function load() {
      const now = Date.now();
      const tf = INTERVALS.find(i => i.value === interval) || INTERVALS[1];
      const start = now - tf.ms;
      try {
        let candles = [];
        if (dex === 'phoenix') {
          const json = await phoenixFetch(phoenixCandlesRoute(symbol, { timeframe: interval, limit: 500 }));
          const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : Array.isArray(json?.value) ? json.value : [];
          if (cancelled) return;
          candles = rows.map(c => ({
            time: Math.floor(Number(c.time || c.t || 0) / 1000),
            open: Number(c.open ?? c.o),
            high: Number(c.high ?? c.h),
            low: Number(c.low ?? c.l),
            close: Number(c.close ?? c.c),
          })).filter(c => c.time && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
        } else if (dex === 'decibel') {
          try {
            candles = await fetchDecibelCandles(symbol, interval, start, now);
          } catch {
            candles = await loadPythCandles(tf, now, start);
          }
          if (cancelled) return;
        } else if (dex === 'avantis' || dex === 'gmx' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado') {
          // These DEXes use Pyth benchmarks for chart candles. The helper
          // keeps retries bounded so rate limits do not cascade.
          candles = await loadPythCandles(tf, now, start);
          if (cancelled) return;
        } else {
          const res = await fetch(`${PACIFICA_API}/kline?symbol=${symbol}&interval=${interval}&start_time=${start}&end_time=${now}`);
          const json = await res.json();
          if (cancelled || !json.data) return;
          candles = json.data.map(c => ({
            time: Math.floor(c.t / 1000),
            open: parseFloat(c.o),
            high: parseFloat(c.h),
            low: parseFloat(c.l),
            close: parseFloat(c.c),
          }));
        }

        if (!candles.length) candles = flatCandlesFromPrice(currentPriceRef.current, now, tf);
        if (!candles.length) return;
        seriesRef.current.setData(candles);
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
          chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        }
      } catch {} finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const iv = window.setInterval(load, 30000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [symbol, pythSymbol, interval, dex]);

  // Store currentPrice in a ref so price-line effect doesn't re-run on every tick
  const currentPriceRef = useRef(currentPrice);
  currentPriceRef.current = currentPrice;

  // Redraw price lines when positions/orders/symbol change, and periodically for PnL updates
  useEffect(() => {
    if (!seriesRef.current) return;

    function drawLines() {
      if (!seriesRef.current) return;
      // Remove old lines
      linesRef.current.forEach(l => {
        try { seriesRef.current.removePriceLine(l); } catch {}
      });
      linesRef.current = [];

      const mark = currentPriceRef.current ? parseFloat(currentPriceRef.current) : 0;

      // Position entry lines
      const symPositions = positions.filter(p => p.symbol === symbol);
      for (const pos of symPositions) {
        const entry = parseFloat(pos.entry_price);
        if (!entry) continue;
        const isLong = pos.side === 'bid';
        const amount = displayPositionAmount(pos, mark, entry);
        const pnl = mark ? ((mark - entry) * amount * (isLong ? 1 : -1)) : 0;
        const pnlStr = fmtLineUsd(pnl);
        const line = seriesRef.current.createPriceLine({
          price: entry,
          color: isLong ? '#4CAF50' : '#E53935',
          lineWidth: 2,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: `${isLong ? 'Long' : 'Short'} ${fmtBaseAmount(amount)} ${symbol} ${pnlStr}`,
        });
        linesRef.current.push(line);
      }

      // Order lines (limit, stop, TP/SL)
      const symOrders = orders.filter(o => (o.symbol || o.s) === symbol);
      for (const ord of symOrders) {
        const rawPrice = parseFloat(ord.price || ord.ip || 0);
        const stopPrice = parseFloat(ord.stop_price || ord.sp || 0);
        const price = rawPrice > 0 ? rawPrice : stopPrice;
        if (!price) continue;
        const side = ord.side || ord.d;
        const type = (ord.order_type || ord.ot || '').toUpperCase();
        const isBid = side === 'bid';
        const isTP = type.includes('TAKE') || type.includes('TP');
        const isSL = type.includes('STOP_LOSS') || type.includes('SL');
        const color = isTP ? '#4CAF50' : isSL ? '#E53935' : stopPrice > 0 ? '#FF9800' : (isBid ? '#2196F3' : '#9C27B0');
        const label = isTP ? 'TP' : isSL ? 'SL' : stopPrice > 0 ? 'STOP' : 'LIMIT';
        const line = seriesRef.current.createPriceLine({
          price,
          color,
          lineWidth: isTP || isSL ? 2 : 1,
          lineStyle: 1, // dotted
          axisLabelVisible: true,
          title: `${label} $${price.toLocaleString()}`,
        });
        linesRef.current.push(line);
      }
    }

    drawLines();
    // Update PnL labels every 3 seconds instead of every 250ms price tick
    const pnlInterval = window.setInterval(drawLines, 3000);
    return () => window.clearInterval(pnlInterval);
  }, [positions, orders, symbol]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Timeframe selector */}
      <div style={S.tfBar}>
        {INTERVALS.map(tf => (
          <button
            key={tf.value}
            style={interval === tf.value ? S.tfActive : S.tfBtn}
            onClick={() => setInterval_(tf.value)}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {loading && (
          <div style={{position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(253, 248, 231, 0.7)'}}>
            <div style={{width: 40, height: 40, border: '5px solid #d4c8b0', borderTopColor: '#5C3A21', borderRadius: '50%', animation: 'tv-spin 1s linear infinite'}}></div>
            <style dangerouslySetInnerHTML={{__html: `@keyframes tv-spin { to { transform: rotate(360deg); } }`}} />
          </div>
        )}
        {/* Overlay rendered inside the chart container — absolute positioning
            anchors to the actual price-chart area, not to the outer wrapper
            that also includes the timeframe tab bar. */}
        {chartOverlay}
      </div>
    </div>
  );
}

export default memo(TradingViewWidget);

const S = {
  tfBar: {
    display: 'flex', gap: 2, padding: '4px 6px', background: '#fdf8e7',
    borderBottom: '1px solid #e8dfc8',
  },
  tfBtn: {
    padding: '3px 8px', background: 'transparent', border: 'none',
    fontSize: 11, fontWeight: 700, color: '#a3906a', cursor: 'pointer',
    borderRadius: 4,
  },
  tfActive: {
    padding: '3px 8px', background: '#5C3A21', border: 'none',
    fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'default',
    borderRadius: 4,
  },
};
