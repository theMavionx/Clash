import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';

const API = 'https://api.pacifica.fi/api/v1';

const INTERVALS = [
  { label: '1m', value: '1m', ms: 2 * 60 * 60 * 1000 },
  { label: '5m', value: '5m', ms: 12 * 60 * 60 * 1000 },
  { label: '15m', value: '15m', ms: 24 * 60 * 60 * 1000 },
  { label: '1H', value: '1h', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '4H', value: '4h', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '1D', value: '1d', ms: 180 * 24 * 60 * 60 * 1000 },
];

function TradingViewWidget({ symbol = 'BTC', positions = [], orders = [], currentPrice }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const linesRef = useRef([]);
  const [interval, setInterval_] = useState('5m');

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

    async function load() {
      const now = Date.now();
      const tf = INTERVALS.find(i => i.value === interval) || INTERVALS[1];
      const start = now - tf.ms;
      try {
        const res = await fetch(`${API}/kline?symbol=${symbol}&interval=${interval}&start_time=${start}&end_time=${now}`);
        const json = await res.json();
        if (cancelled || !json.data) return;

        const candles = json.data.map(c => ({
          time: Math.floor(c.t / 1000),
          open: parseFloat(c.o),
          high: parseFloat(c.h),
          low: parseFloat(c.l),
          close: parseFloat(c.c),
        }));

        seriesRef.current.setData(candles);
        if (chartRef.current) chartRef.current.timeScale().fitContent();
      } catch {}
    }

    load();
    const iv = window.setInterval(load, 30000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [symbol, interval]);

  // Draw entry price lines for open positions
  useEffect(() => {
    if (!seriesRef.current) return;

    // Remove old lines
    linesRef.current.forEach(l => {
      try { seriesRef.current.removePriceLine(l); } catch {}
    });
    linesRef.current = [];

    // Position entry lines
    const symPositions = positions.filter(p => p.symbol === symbol);
    for (const pos of symPositions) {
      const entry = parseFloat(pos.entry_price);
      if (!entry) continue;
      const isLong = pos.side === 'bid';
      const mark = currentPrice ? parseFloat(currentPrice) : 0;
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
  }, [positions, orders, symbol, currentPrice]);

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
      <div ref={containerRef} style={{ flex: 1 }} />
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
