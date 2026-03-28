import { memo, useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';

const API = 'https://api.pacifica.fi/api/v1';

function TradingViewWidget({ symbol = 'BTC' }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#fdf8e7' }, textColor: '#5C3A21' },
      grid: { vertLines: { color: '#e8dfc8' }, horzLines: { color: '#e8dfc8' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#d4c8b0' },
      timeScale: { borderColor: '#d4c8b0', timeVisible: true },
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

  // Load candles when symbol changes
  useEffect(() => {
    if (!seriesRef.current) return;
    let cancelled = false;

    async function load() {
      const now = Date.now();
      const start = now - 24 * 60 * 60 * 1000; // 24h
      try {
        const res = await fetch(`${API}/kline?symbol=${symbol}&interval=5m&start_time=${start}&end_time=${now}`);
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

    // Refresh every 30s
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [symbol]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

export default memo(TradingViewWidget);
