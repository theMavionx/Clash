import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { compactCurrency, signedCurrency } from './format';
import { dailyChartEvidence, dailyChartX } from './dailyChartEvidence';
import { Icon, Segmented, Spinner } from './ui';

/* Port of ClashBot's DailyPerformanceChart (src/TraderAnalysisModal.tsx on
 * copy/main): a custom SVG cumulative line + gradient/hatched area over
 * verified daily evidence, dashed horizontal gridlines with right-side value
 * axis, date ticks, hover crosshair + point + tooltip. Straight segments avoid
 * suggesting interpolated outcomes; gaps start new segments. Colours come
 * from --terminal-* tokens (already mapped to ClashBot's palette). */

const METRIC_OPTIONS = [
  { value: 'pnl', label: 'PnL' },
  { value: 'volume', label: 'Volume' },
  { value: 'roi', label: 'ROI' },
  { value: 'winRate', label: 'Win rate' },
];
const RANGE_OPTIONS = [{ value: '7d', label: '7D' }, { value: '30d', label: '30D' }, { value: '90d', label: '90D' }];
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const CHART_HEIGHT = 280;
const AXIS_CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

function metricName(metric) {
  return metric === 'pnl' ? 'PnL' : metric === 'volume' ? 'Volume' : metric === 'roi' ? 'ROI' : 'Win rate';
}

function metricValue(metric, value) {
  return metric === 'pnl' ? signedCurrency(value) : metric === 'volume' ? compactCurrency(value)
    : `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

function axisValue(metric, value) {
  if (metric !== 'pnl' && metric !== 'volume') return `${value.toFixed(1)}%`;
  return Math.abs(value) >= 1_000 ? AXIS_CURRENCY.format(value) : compactCurrency(value);
}

function qualityIsUsable(value) {
  return value === 'native' || value === 'calculated' || value === 'partial';
}

function qualityLabel(value) {
  return value === 'native' ? 'Native' : value === 'calculated' ? 'Verified calculation'
    : value === 'partial' ? 'Partial coverage' : value === 'unavailable' ? 'Unavailable upstream' : 'Collecting';
}

function shortDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Native rolling ROI is shown as a snapshot when no daily ROI points exist. */
function nativeRollingRoiFallback(metric, rangeMetric, plottedPoints) {
  return metric === 'roi' && plottedPoints === 0 && rangeMetric?.roiPercent != null && rangeMetric.roiQuality === 'native'
    ? rangeMetric.roiPercent : null;
}

function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    setWidth(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export default function DailyPerformanceChart({ analytics, loading, range, onRange, metric, onMetric, rangeMetric }) {
  const gradientId = useId().replace(/:/g, '');
  const frameRef = useRef(null);
  const measured = useElementWidth(frameRef);
  const [activeIndex, setActiveIndex] = useState(null);
  // Range anchor: when the analysis opened (or the newer server capture time).
  const [openedAt] = useState(() => Date.now());
  const days = RANGE_DAYS[range] || 30;
  const dailyQuality = analytics?.rangeQualities?.[range]?.[metric] || 'collecting';
  const evidence = useMemo(() => {
    const coverage = analytics?.metricCoverage?.[metric];
    return dailyChartEvidence({
      points: Array.isArray(analytics?.points) ? analytics.points : [],
      metric,
      quality: dailyQuality,
      days,
      now: analytics?.capturedAt > openedAt ? analytics.capturedAt : openedAt,
      coverageStart: coverage ? coverage.start : analytics?.coverageStart ?? null,
      coverageEnd: coverage ? coverage.end : analytics?.coverageEnd ?? null,
    });
  }, [analytics, days, metric, dailyQuality, openedAt]);

  useEffect(() => setActiveIndex(null), [analytics?.capturedAt, metric, range]);

  const chart = useMemo(() => {
    // Pixel-true viewBox: text and strokes keep their size at any width.
    const width = Math.max(300, Math.round(measured || 640));
    const compact = width < 520;
    const height = CHART_HEIGHT;
    const left = 14;
    const right = compact ? 64 : 84;
    const top = 16;
    const bottom = 34;
    const values = evidence.segments.flat().map((point) => point.value);
    const rawMin = values.length ? Math.min(...values) : 0;
    const rawMax = values.length ? Math.max(...values) : 1;
    const padding = Math.max((rawMax - rawMin) * 0.16, metric === 'pnl' ? 1 : 0.5);
    const min = rawMin - padding;
    const max = rawMax + padding;
    const span = Math.max(0.000001, max - min);
    const segments = evidence.segments.map((segment) => segment.map((point) => ({
      ...point,
      x: dailyChartX(point.timestamp, evidence.rangeStart, evidence.rangeEnd, left, width - left - right),
      y: top + (max - point.value) / span * (height - top - bottom),
    })));
    const plotted = segments.flat();
    const baseline = height - bottom;
    const paths = segments.map((segment) => {
      const path = segment.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
      return {
        path,
        points: segment,
        area: segment.length > 1 ? `${path} L ${segment.at(-1).x.toFixed(1)} ${baseline} L ${segment[0].x.toFixed(1)} ${baseline} Z` : '',
      };
    });
    const ticks = Array.from({ length: 4 }, (_, index) => max - index / 3 * span);
    const zeroY = min < 0 && max > 0 ? top + max / span * (height - top - bottom) : null;
    const labelCount = compact ? 3 : 5;
    const labelIndexes = new Set();
    if (plotted.length) {
      for (let i = 0; i < labelCount; i += 1) labelIndexes.add(Math.round(i / (labelCount - 1) * (plotted.length - 1)));
    }
    const labels = [...labelIndexes].map((index) => plotted[index]);
    return { width, height, left, right, top, bottom, baseline, plotted, paths, ticks, zeroY, labels };
  }, [metric, evidence, measured]);

  const hovered = activeIndex == null ? null : chart.plotted[activeIndex] || null;
  const selected = hovered ?? chart.plotted.at(-1) ?? null;
  const nativeRoi = nativeRollingRoiFallback(metric, rangeMetric, chart.plotted.length);
  const quality = nativeRoi == null ? dailyQuality : 'native';
  const dailyAvailable = chart.plotted.length > 0;
  const historical = dailyAvailable && evidence.historical;
  const asOfLabel = evidence.asOf == null ? 'cutoff unavailable'
    : `${new Date(evidence.asOf).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const displayedValue = selected?.value ?? nativeRoi;
  const positive = (displayedValue ?? 0) >= 0;
  const tone = positive ? 'long' : 'short';
  const lineColor = `var(--terminal-${tone})`;
  const rangeLabel = range.toUpperCase();
  const winRateDescription = analytics?.winRateBasis === 'closed_orders' ? 'closed-order outcomes' : 'verified close events';
  const lowSampleWinRate = metric === 'winRate' && rangeMetric?.winRateTradesCount === 1 && quality === 'partial';
  const badgeTone = !historical && qualityIsUsable(quality) ? 'long' : 'warning';
  const badgeText = historical ? 'Historical / partial evidence' : lowSampleWinRate ? 'Low sample' : qualityLabel(quality);

  const onPointerMove = (event) => {
    if (!chart.plotted.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(1, bounds.width) * chart.width;
    let closest = 0;
    chart.plotted.forEach((point, index) => {
      if (Math.abs(point.x - x) < Math.abs(chart.plotted[closest].x - x)) closest = index;
    });
    setActiveIndex(closest);
  };

  const onKeyDown = (event) => {
    if (!chart.plotted.length) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const last = chart.plotted.length - 1;
    const current = activeIndex ?? last;
    setActiveIndex(Math.max(0, Math.min(last, current + (event.key === 'ArrowRight' ? 1 : -1))));
  };

  // Tooltip sits on the side away from the crosshair so it never hides the point.
  const tooltipOnLeft = hovered ? hovered.x > chart.width / 2 : false;
  const tooltipX = hovered ? (hovered.x / chart.width) * 100 : 0;

  return (
    <section className="ct-card ct-dchart" aria-label="Daily performance">
      <div className="ct-dchart-head">
        <div>
          <div className="ct-dchart-title-row">
            <h3 className="ct-section-title" style={{ fontSize: 14 }}>Daily performance</h3>
            {(analytics || !loading) && <span className={`ct-dchart-badge ct-dchart-badge--${badgeTone}`}>{badgeText}</span>}
          </div>
          <p className="ct-field-hint" style={{ margin: '2px 0 0' }}>
            {historical ? 'Observed segments only; gaps are unknown and totals restart after each gap.'
              : lowSampleWinRate ? 'Exact result from 1 verified close; excluded from confident ranking and filters'
                : `Cumulative ${metricName(metric)} from verified daily evidence`}
          </p>
          {historical && (
            <p className="ct-field-hint ct-dchart-cutoff" style={{ margin: '2px 0 0' }}>
              As of {asOfLabel}. Not a complete current {days}-day {metric === 'volume' ? 'total' : 'return'}.
            </p>
          )}
        </div>
        <div className="ct-dchart-controls">
          <Segmented size="sm" label="Daily chart metric" value={metric} onChange={onMetric} options={METRIC_OPTIONS} />
          <Segmented size="sm" label="Daily chart range" value={range} onChange={onRange} options={RANGE_OPTIONS} />
        </div>
      </div>

      <div className="ct-dchart-value">
        <div className={`ct-dchart-big ${displayedValue == null ? '' : metric === 'volume' ? '' : `ct-${tone}`}`}>
          {displayedValue == null ? '—' : metricValue(metric, displayedValue)}
        </div>
        <div className="ct-caption">
          {nativeRoi != null ? `${rangeLabel} exchange-native ROI`
            : historical ? `Observed segment ${metricName(metric)}` : `${rangeLabel} cumulative ${metricName(metric)}`}
        </div>
      </div>

      <div ref={frameRef} className="ct-dchart-frame">
        {nativeRoi != null && !dailyAvailable ? (
          <div className="ct-dchart-empty">
            <Icon name="chart" size={22} />
            <div className="ct-dchart-empty-title">Current official {rangeLabel} ROI</div>
            <p className="ct-state-text">The exchange publishes this rolling return ratio directly. A historical curve is not invented from account-balance changes; daily observations will appear as verified history accumulates.</p>
          </div>
        ) : !dailyAvailable ? (
          <div className="ct-dchart-empty" role={loading ? 'status' : undefined}>
            {loading ? <Spinner size={20} /> : <Icon name="chart" size={22} />}
            <div className="ct-dchart-empty-title">
              {loading ? 'Loading daily evidence…' : quality === 'unavailable' ? `${metricName(metric)} is unavailable from this exchange` : `${metricName(metric)} history is still collecting`}
            </div>
            <p className="ct-state-text">{analytics?.note || 'The chart appears only when daily points can be proven. No estimated curve is shown.'}</p>
          </div>
        ) : (
          <div className="ct-dchart-plot" onPointerLeave={() => setActiveIndex(null)}>
            <svg
              className="ct-dchart-svg"
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              style={{ height: chart.height }}
              role="img"
              tabIndex={0}
              aria-label={`${rangeLabel} daily ${metricName(metric)} chart, latest ${metricValue(metric, chart.plotted.at(-1).value)}. Use arrow keys to inspect days.`}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerMove}
              onKeyDown={onKeyDown}
              onBlur={() => setActiveIndex(null)}
            >
              <defs>
                <linearGradient id={`${gradientId}-fill`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" style={{ stopColor: lineColor, stopOpacity: 0.25 }} />
                  <stop offset="100%" style={{ stopColor: lineColor, stopOpacity: 0.015 }} />
                </linearGradient>
                <pattern id={`${gradientId}-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: lineColor }} strokeOpacity="0.12" strokeWidth="2" />
                </pattern>
              </defs>
              {chart.ticks.map((tick, index) => {
                const y = chart.top + index / 3 * (chart.height - chart.top - chart.bottom);
                return (
                  <g key={index}>
                    <line className="ct-dchart-grid" x1={chart.left} x2={chart.width - chart.right + 4} y1={y} y2={y} />
                    <text className="ct-dchart-tick" x={chart.width - chart.right + 12} y={y + 4}>{axisValue(metric, tick)}</text>
                  </g>
                );
              })}
              {chart.zeroY != null && (metric === 'pnl' || metric === 'roi') && (
                <line className="ct-dchart-zero" x1={chart.left} x2={chart.width - chart.right + 4} y1={chart.zeroY} y2={chart.zeroY} />
              )}
              <text className="ct-dchart-watermark" x={(chart.width - chart.right + chart.left) / 2} y={chart.height / 2 + 2} textAnchor="middle">CLASHBOT</text>
              {chart.paths.map((segment, index) => (
                <g key={index}>
                  {segment.area && (
                    <>
                      <path d={segment.area} fill={`url(#${gradientId}-fill)`} />
                      <path d={segment.area} fill={`url(#${gradientId}-hatch)`} />
                    </>
                  )}
                  {segment.points.length > 1
                    ? <path d={segment.path} fill="none" style={{ stroke: lineColor }} strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
                    : <circle cx={segment.points[0].x} cy={segment.points[0].y} r="4" style={{ fill: lineColor }} />}
                </g>
              ))}
              {hovered && (
                <>
                  <line className="ct-dchart-crosshair" x1={hovered.x} x2={hovered.x} y1={chart.top} y2={chart.baseline} />
                  <circle cx={hovered.x} cy={hovered.y} r="5" style={{ fill: lineColor }} className="ct-dchart-dot" strokeWidth="2" />
                </>
              )}
              {chart.labels.map((point) => (
                <text
                  key={point.timestamp}
                  className="ct-dchart-tick"
                  x={point.x}
                  y={chart.height - 8}
                  textAnchor={point.x < 40 ? 'start' : point.x > chart.width - chart.right - 30 ? 'end' : 'middle'}
                >
                  {shortDate(point.timestamp)}
                </text>
              ))}
            </svg>
            {hovered && (
              <div
                className="ct-dchart-tooltip"
                style={tooltipOnLeft
                  ? { right: `calc(${100 - tooltipX}% + 14px)` }
                  : { left: `calc(${tooltipX}% + 14px)` }}
              >
                <div className="ct-caption">
                  {new Date(hovered.timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                </div>
                <div className="ct-dchart-tooltip-value">{metricValue(metric, hovered.value)}</div>
                {metric === 'pnl' && Number.isFinite(hovered.dailyPnlUsd) && (
                  <div className="ct-dchart-tooltip-row"><span>Day</span><span className={hovered.dailyPnlUsd >= 0 ? 'ct-long' : 'ct-short'}>{signedCurrency(hovered.dailyPnlUsd)}</span></div>
                )}
                {metric === 'volume' && Number.isFinite(hovered.volumeUsd) && (
                  <div className="ct-dchart-tooltip-row"><span>Day</span><span>{compactCurrency(hovered.volumeUsd)}</span></div>
                )}
                {Number.isFinite(hovered.tradesCount) && (
                  <div className="ct-dchart-tooltip-row"><span>Trades</span><span>{hovered.tradesCount.toLocaleString('en-US')}</span></div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ct-dchart-foot">
        <span>{dailyAvailable ? analytics?.note || 'Daily evidence is still collecting.' : ''}</span>
        <span>
          {metric === 'winRate' ? `Basis: ${winRateDescription}`
            : metric === 'roi' ? nativeRoi == null ? 'Fee-net lifecycle ROI only' : 'Official exchange-native rolling ROI'
              : metric === 'volume' ? 'First-party fill notional' : 'Daily realized contribution'}
        </span>
      </div>
    </section>
  );
}
