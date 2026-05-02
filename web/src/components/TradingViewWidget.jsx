import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';

const PACIFICA_API = 'https://api.pacifica.fi/api/v1';
// Pyth Benchmarks serves historical candles in TradingView UDF format for
// every Pyth feed — which is Avantis's pricing source. No CORS restrictions.
const PYTH_BENCHMARKS = 'https://benchmarks.pyth.network/v1/shims/tradingview';

const INTERVALS = [
  { label: '1m', value: '1m', ms: 2 * 60 * 60 * 1000, pyth: '1' },
  { label: '5m', value: '5m', ms: 12 * 60 * 60 * 1000, pyth: '5' },
  { label: '15m', value: '15m', ms: 24 * 60 * 60 * 1000, pyth: '15' },
  { label: '1H', value: '1h', ms: 7 * 24 * 60 * 60 * 1000, pyth: '60' },
  { label: '4H', value: '4h', ms: 30 * 24 * 60 * 60 * 1000, pyth: '240' },
  { label: '1D', value: '1d', ms: 180 * 24 * 60 * 60 * 1000, pyth: '1D' },
];

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
    
    // Clear old data and show loading spinner when symbol/interval changes
    setLoading(true);
    seriesRef.current.setData([]);

    async function fetchBenchmarks(sym, resolution, fromSec, toSec) {
      const url = `${PYTH_BENCHMARKS}/history?symbol=${encodeURIComponent(sym)}&resolution=${resolution}&from=${fromSec}&to=${toSec}`;
      const r = await fetch(url);
      return r.json();
    }

    async function load() {
      const now = Date.now();
      const tf = INTERVALS.find(i => i.value === interval) || INTERVALS[1];
      const start = now - tf.ms;
      try {
        let candles = [];
        if (dex === 'avantis' || dex === 'decibel') {
          // Avantis and Decibel both price off Pyth on-chain (per their
          // respective docs), so chart candles come from the same Pyth
          // benchmarks endpoint. Pacifica fetches its own REST kline.
          // Prefer the Pyth symbol from market data (authoritative); fall
          // back to heuristic mapping if parent didn't pass it.
          const primary = pythSymbol || toPythSymbol(symbol);
          const fallback = benchmarksFallback(primary);
          const toSec = Math.floor(now / 1000);
          let fromSec = Math.floor(start / 1000);

          let json = await fetchBenchmarks(primary, tf.pyth, fromSec, toSec);
          // Rolled-futures or missing symbol → retry on the spot equivalent.
          if (json.s === 'error' && fallback && fallback !== primary) {
            json = await fetchBenchmarks(fallback, tf.pyth, fromSec, toSec);
          }
          // Equities/FX/commodities close nights + weekends. When the requested
          // window spans only closed hours Pyth returns status=ok with <2 bars
          // — chart looks empty. Progressively widen the window so the user
          // sees at least last-session history. 30d caps the broadening; we
          // don't switch resolutions mid-flight (tf buttons stay truthful).
          const windowWidens = [3 * 86400, 14 * 86400, 30 * 86400];
          for (const span of windowWidens) {
            const bars = Array.isArray(json.t) ? json.t.length : 0;
            if (bars >= 2) break;
            fromSec = toSec - span;
            const sym = (fallback && json.s === 'error') ? fallback : primary;
            json = await fetchBenchmarks(sym, tf.pyth, fromSec, toSec);
          }

          if (cancelled || json.s !== 'ok' || !Array.isArray(json.t)) return;
          candles = json.t.map((t, i) => ({
            time: t,
            open: parseFloat(json.o[i]),
            high: parseFloat(json.h[i]),
            low: parseFloat(json.l[i]),
            close: parseFloat(json.c[i]),
          }));
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
        const pnl = mark ? ((mark - entry) * parseFloat(pos.amount) * (isLong ? 1 : -1)) : 0;
        const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
        const line = seriesRef.current.createPriceLine({
          price: entry,
          color: isLong ? '#4CAF50' : '#E53935',
          lineWidth: 2,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: `${isLong ? 'LONG' : 'SHORT'} ${pnlStr}`,
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
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
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
      <div style={{ flex: 1, position: 'relative' }}>
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
