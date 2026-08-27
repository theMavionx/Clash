import { memo, useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { getReadClient } from '../lib/decibel';
import {
  aptosFetchOptionsForKey,
  runWithAptosBrowserKeys,
} from '../lib/aptosBrowserKeyPool';
import {
  createPhoenixPublicWsClient,
  phoenixCandlesRoute,
  phoenixFetch,
  phoenixSymbol as normalizePhoenixSymbol,
} from '../lib/phoenixClient';
import { pacificaFetch } from '../lib/pacificaClient';
import { OSTIUM_PRICE_STREAM_WS } from '../lib/ostiumConfig';
import { FUTURES_THEME_DARK, useFuturesTheme } from '../hooks/useFuturesTheme';

// Pyth Benchmarks serves historical candles in TradingView UDF format for
// every Pyth feed. Query it directly from the user's browser first so public
// rate limits are distributed per user/IP. The Clash endpoint is only a
// fallback for CORS/network failures or transient direct errors.
const PYTH_HISTORY_API = '/api/futures/pyth/history';
const PYTH_HISTORY_DIRECT_API = 'https://benchmarks.pyth.network/v1/shims/tradingview/history';
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

const INTERVAL_SECONDS = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
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
  if (raw.includes('/')) {
    const [baseRaw, quoteRaw = 'USD'] = raw.split('/');
    const base = baseRaw.trim();
    const quote = quoteRaw.trim();
    if (base === 'USD' && FX_NON_USD.has(quote)) return `FX.USD/${quote}`;
    if (quote === 'USD' && FX_NON_USD.has(base)) return `FX.${base}/USD`;
  }
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

function normalizePhoenixCandle(row) {
  if (!row) return null;
  const c = row.candle || row;
  const next = {
    time: unixSeconds(c.time ?? c.t ?? c.timestamp),
    open: Number(c.open ?? c.o),
    high: Number(c.high ?? c.h),
    low: Number(c.low ?? c.l),
    close: Number(c.close ?? c.c),
  };
  return next.time
    && Number.isFinite(next.open)
    && Number.isFinite(next.high)
    && Number.isFinite(next.low)
    && Number.isFinite(next.close)
    ? next
    : null;
}

function normalizeBulkCandle(row) {
  if (!row) return null;
  const next = {
    time: unixSeconds(row.time ?? row.t ?? row.openTime ?? row.open_time ?? row.timestamp),
    open: Number(row.open ?? row.o ?? row[1]),
    high: Number(row.high ?? row.h ?? row[2]),
    low: Number(row.low ?? row.l ?? row[3]),
    close: Number(row.close ?? row.c ?? row[4]),
  };
  return next.time
    && Number.isFinite(next.open)
    && Number.isFinite(next.high)
    && Number.isFinite(next.low)
    && Number.isFinite(next.close)
    ? next
    : null;
}

function ostiumStreamPair(symbol) {
  const raw = String(symbol || '').toUpperCase().trim();
  if (!raw) return '';
  if (raw.includes('-') || raw.includes('/')) {
    const [base, quote = 'USD'] = raw.split(/[-/]/u);
    return `${base.trim()}-${quote.trim() || 'USD'}`;
  }
  return `${raw}-USD`;
}

function ostiumTickPrice(tick) {
  const price = Number(tick?.mid ?? tick?.mark ?? tick?.price ?? tick?.bid ?? tick?.ask);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function ostiumTickMatchesSymbol(tick, symbol) {
  const expected = ostiumStreamPair(symbol);
  const pair = String(tick?.pair || '').toUpperCase();
  if (pair && pair === expected) return true;
  const from = String(tick?.from || '').toUpperCase();
  const to = String(tick?.to || 'USD').toUpperCase();
  return `${from}-${to}` === expected;
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

function finiteLineNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function priceLineKey(kind, price) {
  const n = finiteLineNumber(price);
  return n == null ? '' : `${kind}:${Math.round(n * 1e8) / 1e8}`;
}

function orderLimitLinePrice(order) {
  return finiteLineNumber(
    order?.price
      ?? order?.ip
      ?? order?.limit_price
      ?? order?.limitPrice
      ?? order?._raw?.limit_price
      ?? order?._raw?.limitPrice
  );
}

function orderTriggerLinePrice(order) {
  return finiteLineNumber(
    order?.stop_price
      ?? order?.sp
      ?? order?.trigger_price
      ?? order?.triggerPrice
      ?? order?.triggerPriceUi
      ?? order?.trigger_price_ui
      ?? order?.trigger_px
      ?? order?.triggerPx
      ?? order?._raw?.triggerPrice
      ?? order?._raw?.trigger_price
      ?? order?._raw?.triggerPriceUi
      ?? order?._raw?.trigger_price_ui
      ?? order?._raw?.trigger_px
      ?? order?._raw?.triggerPx
  );
}

function positionTpslLinePrice(pos, kind) {
  if (kind === 'tp') {
    return finiteLineNumber(
      pos?.take_profit_price
        ?? pos?.takeProfitPrice
        ?? pos?.take_profit
        ?? pos?.takeProfit
        ?? pos?.tp
        ?? pos?.tp_trigger_price
        ?? pos?.tpTriggerPrice
    );
  }
  return finiteLineNumber(
    pos?.stop_loss_price
      ?? pos?.stopLossPrice
      ?? pos?.stop_loss
      ?? pos?.stopLoss
      ?? pos?.sl
      ?? pos?.sl_trigger_price
      ?? pos?.slTriggerPrice
  );
}

function positionLineIsLong(pos) {
  const side = String(pos?.side || '').toLowerCase();
  if (side === 'bid' || side === 'long' || side === 'buy') return true;
  if (side === 'ask' || side === 'short' || side === 'sell') return false;
  const amount = finiteLineNumber(pos?.amount);
  return amount == null ? true : amount >= 0;
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

function positionLinePnl(pos, liveMark, entry, amount, isLong) {
  const provided = finiteLineNumber(pos?.pnl_usd);
  if (provided != null) return provided;
  const mark = finiteLineNumber(pos?.mark_price) ?? finiteLineNumber(liveMark);
  return mark ? (mark - entry) * amount * (isLong ? 1 : -1) : 0;
}

function classifyTriggerOrder(order, positionsForSymbol, triggerPrice) {
  const type = String(order?.order_type || order?.ot || order?.trigger_type || order?.triggerType || '').toUpperCase();
  if (type.includes('TAKE') || type.includes('TP')) return 'tp';
  if (type.includes('STOP_LOSS') || type.includes('SL')) return 'sl';

  const side = String(order?.side || order?.d || '').toLowerCase();
  const closesLong = side === 'ask' || side === 'short' || side === 'sell';
  const closesShort = side === 'bid' || side === 'long' || side === 'buy';
  const position = positionsForSymbol.find((pos) => {
    const isLong = positionLineIsLong(pos);
    return (isLong && closesLong) || (!isLong && closesShort);
  }) || positionsForSymbol[0];
  if (!position) return null;

  const isLong = positionLineIsLong(position);
  const reference = finiteLineNumber(position.entry_price)
    ?? finiteLineNumber(position.mark_price)
    ?? finiteLineNumber(triggerPrice);
  if (!(reference > 0) || !(triggerPrice > 0)) return null;
  if (isLong) return triggerPrice > reference ? 'tp' : 'sl';
  return triggerPrice < reference ? 'tp' : 'sl';
}

function explicitOrderTpslKind(order) {
  const type = String(
    order?.order_type
      || order?.ot
      || order?.trigger_type
      || order?.triggerType
      || order?._raw?.order_type
      || order?._raw?.orderType
      || order?._raw?.trigger_type
      || order?._raw?.triggerType
      || ''
  ).toUpperCase();
  if (type.includes('TAKE') || type.includes('TP')) return 'tp';
  if (type.includes('STOP_LOSS') || type.includes('SL')) return 'sl';
  return '';
}

function samePendingLineBadges(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].key !== b[i].key || Math.abs(a[i].top - b[i].top) > 0.5 || a[i].label !== b[i].label) {
      return false;
    }
  }
  return true;
}

function pendingOrderLineKey(order, price, label) {
  return [
    order?.order_id,
    order?.id,
    order?.client_order_id,
    order?.clientOrderId,
    order?._optimisticKey,
    order?._raw?.order_id,
    order?._raw?.id,
    order?._raw?.client_order_id,
    order?._raw?.clientOrderId,
    label,
    price,
  ].filter((value) => value != null && value !== '').join(':');
}

async function fetchDecibelCandles(symbol, interval, startMs, endMs) {
  return runWithAptosBrowserKeys(async apiKey => {
    const read = await getReadClient(apiKey);
    const rows = await read.candlesticks.getByName({
      marketName: decibelMarketName(symbol),
      interval: DECIBEL_INTERVALS[interval] || '5m',
      startTime: startMs,
      endTime: endMs,
      hideOutliers: true,
      fetchOptions: aptosFetchOptionsForKey({}, apiKey),
    });
    const candles = normalizeDecibelCandles(Array.isArray(rows) ? rows : []);
    if (!candles.length) throw new Error('No Decibel candles');
    return candles;
  }, { label: 'Decibel candlesticks' });
}

function TradingViewWidget({ symbol = 'BTC', pythSymbol = null, positions = [], orders = [], currentPrice, chartOverlay, dex = 'pacifica' }) {
  const { theme } = useFuturesTheme();
  const darkTheme = theme === FUTURES_THEME_DARK;
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const linesRef = useRef([]);
  const lastCandleRef = useRef(null);
  const [interval, setInterval_] = useState('5m');
  const [loading, setLoading] = useState(false);
  const [pendingLineBadges, setPendingLineBadges] = useState([]);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      // lightweight-charts paints to canvas, so it needs resolved color values;
      // CSS custom properties are only used by the surrounding DOM shell.
      layout: { background: { color: darkTheme ? '#111827' : '#FFFFFF' }, textColor: darkTheme ? '#AAB4C3' : '#6B7280', fontSize: 11, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
      grid: { vertLines: { color: darkTheme ? '#202A39' : '#F3F4F6' }, horzLines: { color: darkTheme ? '#202A39' : '#F3F4F6' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: darkTheme ? '#2C3748' : '#E5E7EB', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: darkTheme ? '#2C3748' : '#E5E7EB', timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: darkTheme ? '#34D399' : '#087A55', downColor: darkTheme ? '#F87171' : '#D14343',
      borderUpColor: darkTheme ? '#34D399' : '#087A55', borderDownColor: darkTheme ? '#F87171' : '#D14343',
      wickUpColor: darkTheme ? '#34D399' : '#087A55', wickDownColor: darkTheme ? '#F87171' : '#D14343',
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
  }, [darkTheme]);

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
      const read = async (url) => {
        const r = await fetch(url);
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          return {
            s: 'error',
            errmsg: json?.errmsg || json?.error || `Pyth history ${r.status}`,
            status: r.status,
          };
        }
        return json || { s: 'error', errmsg: 'empty Pyth history response' };
      };
      try {
        const direct = await read(`${PYTH_HISTORY_DIRECT_API}?${params.toString()}`);
        if (direct?.s !== 'error') return direct;
        const proxied = await read(`${PYTH_HISTORY_API}?${params.toString()}`);
        return proxied?.s === 'error' ? direct : proxied;
      } catch (e) {
        console.warn('[chart] direct Pyth history failed, trying Clash fallback:', e?.message || e);
        try {
          return await read(`${PYTH_HISTORY_API}?${params.toString()}`);
        } catch {
          return { s: 'error', errmsg: e?.message || 'Pyth history request failed' };
        }
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
        if (dex === 'domfi') {
          const params = new URLSearchParams({
            dex: 'domfi',
            symbol,
            interval,
            start_time: String(start),
            end_time: String(now),
          });
          const response = await fetch(`/api/futures/candles?${params.toString()}`);
          const json = await response.json().catch(() => null);
          if (!response.ok) throw new Error(json?.detail || json?.error || `DomFi candles ${response.status}`);
          candles = (Array.isArray(json) ? json : []).map(normalizeBulkCandle).filter(Boolean).sort((a, b) => a.time - b.time);
          if (cancelled) return;
        } else if (dex === 'ondo') {
          try {
            const params = new URLSearchParams({
              dex: 'ondo',
              symbol,
              resolution: tf.pyth,
              from: String(Math.floor(start / 1000)),
              to: String(Math.floor(now / 1000)),
            });
            const response = await fetch(`/api/futures/candles?${params.toString()}`);
            const json = await response.json().catch(() => null);
            if (!response.ok) throw new Error(json?.detail || json?.error || `Ondo candles ${response.status}`);
            candles = (Array.isArray(json) ? json : []).map(normalizeBulkCandle).filter(Boolean).sort((a, b) => a.time - b.time);
          } catch {
            candles = await loadPythCandles(tf, now, start).catch(() => []);
          }
          if (cancelled) return;
        } else if (dex === 'aster') {
          try {
            const params = new URLSearchParams({
              dex: 'aster',
              symbol,
              interval,
              limit: '500',
              start_time: String(start),
              end_time: String(now),
            });
            const response = await fetch(`/api/futures/candles?${params.toString()}`);
            const json = await response.json().catch(() => null);
            if (!response.ok) throw new Error(json?.detail || json?.error || `Aster candles ${response.status}`);
            const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
            candles = rows.map((row) => {
              if (!Array.isArray(row) || row.length < 5) return null;
              const candle = {
                time: Math.floor(Number(row[0]) / 1000),
                open: Number(row[1]),
                high: Number(row[2]),
                low: Number(row[3]),
                close: Number(row[4]),
              };
              return Object.values(candle).every(Number.isFinite) ? candle : null;
            }).filter(Boolean).sort((a, b) => a.time - b.time);
          } catch {
            candles = await loadPythCandles(tf, now, start).catch(() => []);
          }
          if (cancelled) return;
        } else if (dex === 'bulk') {
          try {
            const params = new URLSearchParams({ symbol, interval, limit: '500' });
            const response = await fetch(`/api/futures/bulk/candles?${params.toString()}`);
            const json = await response.json().catch(() => null);
            if (!response.ok) throw new Error(json?.detail || json?.error || `Bulk candles ${response.status}`);
            const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
            candles = rows.map(normalizeBulkCandle).filter(Boolean).sort((a, b) => a.time - b.time);
          } catch {
            candles = await loadPythCandles(tf, now, start).catch(() => []);
          }
          if (cancelled) return;
        } else if (dex === 'phoenix') {
          try {
            const json = await phoenixFetch(phoenixCandlesRoute(symbol, { timeframe: interval, limit: 500 }));
            const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : Array.isArray(json?.value) ? json.value : [];
            if (cancelled) return;
            candles = rows.map(normalizePhoenixCandle).filter(Boolean);
          } catch {
            candles = await loadPythCandles(tf, now, start).catch(() => []);
          }
        } else if (dex === 'decibel') {
          try {
            candles = await fetchDecibelCandles(symbol, interval, start, now);
          } catch {
            candles = await loadPythCandles(tf, now, start);
          }
          if (cancelled) return;
        } else if (dex === 'avantis' || dex === 'gmx' || dex === 'ostium' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'leverup' || dex === 'hotstuff' || dex === 'grvt' || dex === 'gmtrade' || dex === 'flash') {
          // These DEXes use Pyth benchmarks for chart candles. The helper
          // keeps retries bounded so rate limits do not cascade.
          candles = await loadPythCandles(tf, now, start);
          if (cancelled) return;
        } else {
          const json = await pacificaFetch(`/kline?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&start_time=${start}&end_time=${now}`);
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
        lastCandleRef.current = candles[candles.length - 1] || null;
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
          chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        }
      } catch {
        const fallback = flatCandlesFromPrice(currentPriceRef.current, now, tf);
        if (!cancelled && fallback.length && seriesRef.current) {
          seriesRef.current.setData(fallback);
          lastCandleRef.current = fallback[fallback.length - 1] || null;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    if (dex === 'phoenix') {
      return () => { cancelled = true; };
    }
    const reloadMs = dex === 'ostium'
      ? Math.max(60_000, Number(INTERVAL_SECONDS[interval] || 300) * 1000)
      : 30_000;
    const iv = window.setInterval(load, reloadMs);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [symbol, pythSymbol, interval, dex, darkTheme]);

  useEffect(() => {
    if (dex !== 'ostium' || !seriesRef.current || typeof WebSocket === 'undefined') return undefined;
    let cancelled = false;
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    let ws = null;
    const pair = ostiumStreamPair(symbol);
    const bucketSeconds = INTERVAL_SECONDS[interval] || 300;

    const applyTick = (tick) => {
      if (cancelled || !seriesRef.current || !ostiumTickMatchesSymbol(tick, symbol)) return;
      const price = ostiumTickPrice(tick);
      if (price == null) return;
      const tickSeconds = unixSeconds(tick?.timestampSeconds) || Math.floor(Date.now() / 1000);
      const bucket = Math.floor(tickSeconds / bucketSeconds) * bucketSeconds;
      const prev = lastCandleRef.current;
      const next = prev && Number(prev.time) === bucket
        ? {
          ...prev,
          high: Math.max(Number(prev.high), price),
          low: Math.min(Number(prev.low), price),
          close: price,
        }
        : {
          time: bucket,
          open: Number(prev?.close) > 0 ? Number(prev.close) : price,
          high: price,
          low: price,
          close: price,
        };
      lastCandleRef.current = next;
      seriesRef.current.update(next);
    };

    const handlePayload = (payload) => {
      reconnectAttempt = 0;
      if (payload?.type === 'snapshot' && Array.isArray(payload.data)) {
        for (const tick of payload.data) applyTick(tick);
        return;
      }
      if (payload?.type === 'tick') applyTick(payload.data);
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      const delay = Math.min(60_000, 2_500 * (2 ** Math.min(reconnectAttempt, 5)));
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled || !pair) return;
      try {
        ws = new WebSocket(OSTIUM_PRICE_STREAM_WS);
        ws.addEventListener('open', () => {
          if (!cancelled && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'subscribe', pairs: [pair] }));
          }
        });
        ws.addEventListener('message', (event) => {
          try {
            handlePayload(JSON.parse(event.data));
          } catch {}
        });
        ws.addEventListener('close', () => {
          scheduleReconnect();
        });
        ws.addEventListener('error', () => {
          try { ws?.close(); } catch {}
        });
      } catch {
        scheduleReconnect();
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'unsubscribe', pairs: [pair] }));
        ws?.close();
      } catch {}
    };
  }, [symbol, interval, dex]);

  useEffect(() => {
    if (dex !== 'phoenix' || !seriesRef.current) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    const streams = createPhoenixPublicWsClient();
    const phxSymbol = normalizePhoenixSymbol(symbol);

    (async () => {
      try {
        for await (const update of streams.candles(phxSymbol, interval, controller.signal)) {
          if (cancelled) break;
          const candle = normalizePhoenixCandle(update);
          if (!candle || !seriesRef.current) continue;
          seriesRef.current.update(candle);
        }
      } catch (error) {
        if (!cancelled && error?.name !== 'AbortError') {
          console.warn('[Phoenix] candle WS failed; static chart remains visible', error?.message || error);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, interval, dex]);

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
      const nextPendingLineBadges = [];

      // Position entry lines
      const symPositions = positions.filter(p => p.symbol === symbol);
      const positionTpslLineKeys = new Set();
      for (const pos of symPositions) {
        const entry = parseFloat(pos.entry_price);
        const isLong = positionLineIsLong(pos);
        if (entry) {
          const amount = displayPositionAmount(pos, mark, entry);
          const pnl = positionLinePnl(pos, mark, entry, amount, isLong);
          const pnlStr = fmtLineUsd(pnl);
          const line = seriesRef.current.createPriceLine({
            price: entry,
            color: isLong
              ? (darkTheme ? '#34D399' : '#087A55')
              : (darkTheme ? '#F87171' : '#D14343'),
            lineWidth: 2,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: `${isLong ? 'Long' : 'Short'} ${fmtBaseAmount(amount)} ${symbol} ${pnlStr}`,
          });
          linesRef.current.push(line);
        }

        for (const [kind, color, label] of [
          ['tp', darkTheme ? '#34D399' : '#087A55', 'TP'],
          ['sl', darkTheme ? '#F87171' : '#D14343', 'SL'],
        ]) {
          const price = positionTpslLinePrice(pos, kind);
          if (!(price > 0)) continue;
          positionTpslLineKeys.add(priceLineKey(kind, price));
          const line = seriesRef.current.createPriceLine({
            price,
            color,
            lineWidth: 2,
            lineStyle: 1, // dotted
            axisLabelVisible: true,
            title: `${label} $${price.toLocaleString()}`,
          });
          linesRef.current.push(line);
        }
      }

      // Order lines (limit, stop, TP/SL)
      const symOrders = orders.filter(o => (o.symbol || o.s) === symbol);
      for (const ord of symOrders) {
        const rawPrice = orderLimitLinePrice(ord);
        const stopPrice = orderTriggerLinePrice(ord);
        const side = ord.side || ord.d;
        const isBid = side === 'bid';
        const explicitTriggerKind = explicitOrderTpslKind(ord);
        const linePrice = stopPrice > 0 ? stopPrice : rawPrice;
        const triggerKind = explicitTriggerKind || (stopPrice > 0 ? classifyTriggerOrder(ord, symPositions, stopPrice) : null);
        const isTP = triggerKind === 'tp';
        const isSL = triggerKind === 'sl';
        const price = linePrice;
        if (!price) continue;
        if ((isTP || isSL) && positionTpslLineKeys.has(priceLineKey(triggerKind, price))) continue;
        const pending = !!(ord?._optimistic || ord?._raw?.optimistic);
        const color = pending
          ? (darkTheme ? '#FBBF24' : '#B7791F')
          : isTP
            ? (darkTheme ? '#34D399' : '#087A55')
            : isSL
              ? (darkTheme ? '#F87171' : '#D14343')
              : stopPrice > 0
                ? (darkTheme ? '#F47A3C' : '#F26522')
                : (isBid ? (darkTheme ? '#60A5FA' : '#2563EB') : (darkTheme ? '#C4B5FD' : '#7C3AED'));
        const label = isTP ? 'TP' : isSL ? 'SL' : stopPrice > 0 ? 'STOP' : 'LIMIT';
        const line = seriesRef.current.createPriceLine({
          price,
          color,
          lineWidth: pending ? 1 : (isTP || isSL ? 2 : 1),
          lineStyle: pending ? 2 : 1, // dashed while waiting, dotted once confirmed
          axisLabelVisible: true,
          title: `${label}${pending ? ' confirming' : ''} $${price.toLocaleString()}`,
        });
        linesRef.current.push(line);
        if (pending && typeof seriesRef.current.priceToCoordinate === 'function') {
          const y = seriesRef.current.priceToCoordinate(price);
          if (Number.isFinite(y)) {
            nextPendingLineBadges.push({
              key: pendingOrderLineKey(ord, price, label),
              top: Math.max(8, y - 12),
              label,
            });
          }
        }
      }

      setPendingLineBadges((prev) => (
        samePendingLineBadges(prev, nextPendingLineBadges) ? prev : nextPendingLineBadges
      ));
    }

    drawLines();
    // Update PnL labels every 3 seconds instead of every 250ms price tick
    const pnlInterval = window.setInterval(drawLines, 3000);
    return () => {
      window.clearInterval(pnlInterval);
      setPendingLineBadges([]);
    };
  }, [positions, orders, symbol, darkTheme]);

  return (
    <section className="futures-trading-chart" style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--terminal-surface)' }} aria-label={`${symbol} price chart`}>
      {/* Timeframe selector */}
      <div style={S.tfBar}>
        {INTERVALS.map(tf => (
          <button
            type="button"
            aria-pressed={interval === tf.value}
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
          <div style={{position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--terminal-loading-overlay)'}}>
            <div style={{width: 36, height: 36, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--terminal-border)', borderTopColor: 'var(--terminal-orange)', borderRadius: '50%', animation: 'tv-spin 1s linear infinite'}}></div>
            <style dangerouslySetInnerHTML={{__html: `@keyframes tv-spin { to { transform: rotate(360deg); } }`}} />
          </div>
        )}
        {/* Overlay rendered inside the chart container — absolute positioning
            anchors to the actual price-chart area, not to the outer wrapper
            that also includes the timeframe tab bar. */}
        {pendingLineBadges.map((badge) => (
          <div key={badge.key} style={{position: 'absolute', top: badge.top, right: 8, zIndex: 9, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 7, border: '1px solid var(--terminal-brand-border)', background: 'var(--terminal-brand-soft)', color: 'var(--terminal-brand-text)', fontSize: 10, fontWeight: 750, pointerEvents: 'none', boxShadow: '0 2px 6px var(--terminal-shadow-soft)'}}>
            <span style={{width: 9, height: 9, borderRadius: '50%', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--terminal-brand-border)', borderTopColor: 'var(--terminal-orange)', animation: 'tv-pending-spin 0.75s linear infinite', flexShrink: 0}} />
            {badge.label}
          </div>
        ))}
        {pendingLineBadges.length > 0 && (
          <style dangerouslySetInnerHTML={{__html: `@keyframes tv-pending-spin { to { transform: rotate(360deg); } }`}} />
        )}
        {chartOverlay}
      </div>
    </section>
  );
}

export default memo(TradingViewWidget);

const S = {
  tfBar: {
    display: 'flex', gap: 2, padding: '5px 8px', background: 'var(--terminal-surface)',
    borderBottom: '1px solid var(--terminal-border)',
  },
  tfBtn: {
    padding: '3px 8px', background: 'transparent', border: 'none',
    fontSize: 11, fontWeight: 650, color: 'var(--terminal-text-muted)', cursor: 'pointer',
    borderRadius: 6,
  },
  tfActive: {
    padding: '3px 8px', background: 'var(--terminal-brand-soft)', border: 'none',
    fontSize: 11, fontWeight: 750, color: 'var(--terminal-brand-strong)', cursor: 'default',
    borderRadius: 6,
  },
};
