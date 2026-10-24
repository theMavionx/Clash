import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAPITAL_PROFILE_LABELS, WINDOW_LABELS, WINDOWS, venueName } from './constants';
import {
  fetchTraderDailyAnalytics,
  fetchTraderDetails,
  fetchTraderSourceSnapshot,
  fetchTraderTradeHistory,
  friendlyCopyError,
} from './copyTradingApi';
import {
  compactCurrency,
  decimal,
  exactTime,
  missingMetric,
  plainPercent,
  relativeTime,
  shortAccount,
  signedCurrency,
  signedPercent,
  tradePositionLabel,
} from './format';
import TraderProfileChips from './TraderChips';
import { copyScoreComponents } from './copyScoreModel';
import { Btn, Modal, Notice, Segmented, Spinner, StateBlock, VenueLogo } from './ui';

const SNAPSHOT_REFRESH_MS = 16_000;
const HISTORY_LOADING_NOTE = 'Detailed public trade history is loading in the background.';
const HISTORY_RETRY_DELAYS_MS = [750, 2_000, 5_000, 10_000];
const WINDOW_DAYS = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };

const num = (value) => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};
const arr = (value) => (Array.isArray(value) ? value : []);

function historyRetryDelay(detail, retries) {
  if (detail?.note !== HISTORY_LOADING_NOTE || arr(detail?.recentTrades).length > 0) return null;
  return HISTORY_RETRY_DELAYS_MS[retries] ?? null;
}

function MetricText({ value, kind, quality }) {
  if (value == null) return <span className="ct-faint">{missingMetric(quality)}</span>;
  const signed = kind === 'pnl' || kind === 'roi';
  const text = kind === 'pnl' ? signedCurrency(value)
    : kind === 'roi' ? signedPercent(value)
      : kind === 'rate' ? plainPercent(value)
        : compactCurrency(value);
  return <span className={`ct-num ${signed ? (value >= 0 ? 'ct-long' : 'ct-short') : ''}`} style={{ fontWeight: 600 }}>{text}</span>;
}

/* ---------- daily performance chart (inline SVG, no deps) ---------- */
function DailyChart({ analytics, loading, range, onRange, metric, onMetric }) {
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const points = arr(analytics?.points).slice(-days);
  const valueOf = (point) => num(metric === 'volume' ? point.volumeUsd : point.dailyPnlUsd) ?? 0;
  const values = points.map(valueOf);
  const total = values.reduce((sum, value) => sum + value, 0);
  const width = 640;
  const height = 180;
  const pad = { top: 12, right: 8, bottom: 22, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
  const hasNegative = values.some((value) => value < 0);
  const zeroY = pad.top + (hasNegative ? innerH / 2 : innerH);
  const scale = (hasNegative ? innerH / 2 : innerH) / maxAbs;
  const barW = points.length ? Math.max(1, innerW / points.length - 2) : 0;
  let cumulative = 0;
  const cumulativeValues = values.map((value) => { cumulative += value; return cumulative; });
  const cumMax = Math.max(1, ...cumulativeValues.map((value) => Math.abs(value)));
  const line = metric === 'pnl' && points.length > 1
    ? cumulativeValues.map((value, index) => {
      const x = pad.left + (index + 0.5) * (innerW / points.length);
      const y = zeroY - (value / cumMax) * (hasNegative ? innerH / 2 : innerH) * 0.95;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ')
    : '';
  const metricLabel = metric === 'volume' ? 'Daily volume' : 'Daily PnL';

  return (
    <section className="ct-card ct-card-pad" aria-label="Daily performance">
      <div className="ct-toolbar-row" style={{ marginBottom: 10 }}>
        <div>
          <h3 className="ct-section-title" style={{ fontSize: 14 }}>Daily performance</h3>
          <p className="ct-field-hint" style={{ margin: '2px 0 0' }}>
            {metricLabel} · {range.toUpperCase()} total{' '}
            <strong className={metric === 'pnl' ? (total >= 0 ? 'ct-long' : 'ct-short') : ''}>
              {metric === 'pnl' ? signedCurrency(total) : compactCurrency(total)}
            </strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Segmented size="sm" label="Chart metric" value={metric} onChange={onMetric} options={[{ value: 'pnl', label: 'PnL' }, { value: 'volume', label: 'Volume' }]} />
          <Segmented size="sm" label="Chart range" value={range} onChange={onRange} options={[{ value: '7d', label: '7D' }, { value: '30d', label: '30D' }, { value: '90d', label: '90D' }]} />
        </div>
      </div>
      {loading && points.length === 0 ? (
        <div className="ct-state" role="status"><Spinner /><span className="ct-state-text">Loading daily analytics…</span></div>
      ) : points.length === 0 ? (
        <p className="ct-field-hint" style={{ margin: 0 }}>{analytics?.note || 'Daily analytics are still collecting.'}</p>
      ) : (
        <>
          <svg className="ct-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metricLabel} bar chart for the last ${points.length} days, total ${metric === 'pnl' ? signedCurrency(total) : compactCurrency(total)}`}>
            <line className="ct-chart-axis" x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} />
            {points.map((point, index) => {
              const value = values[index];
              const h = Math.max(value === 0 ? 0 : 1, Math.abs(value) * scale);
              const x = pad.left + index * (innerW / points.length) + 1;
              const y = value >= 0 ? zeroY - h : zeroY;
              return (
                <rect
                  key={point.day || index}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={Math.min(2, barW / 2)}
                  className={metric === 'volume' ? 'ct-chart-bar-pos' : value >= 0 ? 'ct-chart-bar-pos' : 'ct-chart-bar-neg'}
                >
                  <title>{`${point.day}: ${metric === 'pnl' ? signedCurrency(value) : compactCurrency(value)}`}</title>
                </rect>
              );
            })}
            {line && <path className="ct-chart-line" d={line} />}
            <text className="ct-chart-label" x={pad.left} y={height - 6}>{points[0]?.day}</text>
            <text className="ct-chart-label" x={width - pad.right} y={height - 6} textAnchor="end">{points.at(-1)?.day}</text>
          </svg>
          {metric === 'pnl' && <p className="ct-field-hint" style={{ margin: '6px 0 0' }}>Bars show daily PnL; the line shows cumulative PnL over the range.</p>}
        </>
      )}
    </section>
  );
}

function PositionsTable({ snapshot, loading }) {
  const positions = arr(snapshot?.sourcePositions);
  const status = snapshot?.sourcePositionsStatus;
  if (loading && !snapshot) return <div className="ct-state" role="status"><Spinner /><span className="ct-state-text">Loading positions…</span></div>;
  if (status && status !== 'available') {
    const text = status === 'private' ? 'This trader keeps positions private.'
      : status === 'unsupported' ? 'This exchange does not publish live positions.'
        : 'Live positions are temporarily unavailable.';
    return <p className="ct-field-hint" style={{ margin: 0 }}>{text}</p>;
  }
  if (positions.length === 0) return <p className="ct-field-hint" style={{ margin: 0 }}>No open positions right now.</p>;
  return (
    <div>
      <div className="ct-list-row ct-list-head">
        <span>Market</span><span>Size</span><span className="ct-hide-sm">Entry / mark</span><span className="ct-hide-sm">Liq. price</span><span style={{ textAlign: 'right' }}>Unrealized PnL</span>
      </div>
      {positions.map((position) => {
        const pnl = num(position.unrealizedPnlUsd);
        const lev = position.leverage?.value ? `${position.leverage.value}× ${position.leverage.type || ''}`.trim() : null;
        return (
          <div key={position.key || position.symbol} className="ct-list-row">
            <span style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 13 }}>{position.symbol}</strong>{' '}
              <span className={`ct-chip ct-chip--${position.direction === 'long' ? 'long' : 'short'}`}>{position.direction === 'long' ? 'Long' : 'Short'}</span>
              {lev && <span className="ct-subline">{lev}</span>}
            </span>
            <span className="ct-num">{decimal(position.size)}<span className="ct-subline">{compactCurrency(num(position.positionValueUsd))}</span></span>
            <span className="ct-num ct-hide-sm">{decimal(position.entryPrice)}<span className="ct-subline">{decimal(position.markPrice)}</span></span>
            <span className="ct-num ct-hide-sm">{position.liquidationPrice == null ? '—' : decimal(position.liquidationPrice)}</span>
            <span className="ct-num" style={{ textAlign: 'right', fontWeight: 600 }}>
              <span className={pnl == null ? 'ct-faint' : pnl >= 0 ? 'ct-long' : 'ct-short'}>{signedCurrency(pnl)}</span>
            </span>
          </div>
        );
      })}
      {snapshot?.sourceSnapshotScopeNote && <p className="ct-field-hint" style={{ margin: '8px 0 0' }}>{snapshot.sourceSnapshotScopeNote}</p>}
    </div>
  );
}

function PeriodTable({ metrics }) {
  if (!metrics.length) return <p className="ct-field-hint" style={{ margin: 0 }}>Period metrics are still collecting.</p>;
  return (
    <div>
      <div className="ct-list-row ct-list-head">
        <span>Period</span><span>PnL</span><span className="ct-hide-sm">ROI</span><span className="ct-hide-sm">Win rate · W/L</span><span style={{ textAlign: 'right' }}>Volume</span>
      </div>
      {metrics.map((metric) => (
        <div key={metric.window} className="ct-list-row">
          <strong>{WINDOW_LABELS[metric.window] || metric.window}</strong>
          <span><MetricText value={num(metric.pnlUsd)} kind="pnl" quality={metric.quality} /></span>
          <span className="ct-hide-sm"><MetricText value={num(metric.roiPercent)} kind="roi" quality={metric.roiQuality} /></span>
          <span className="ct-hide-sm">
            <MetricText value={num(metric.winRatePercent)} kind="rate" quality={metric.quality} />
            {metric.winsCount != null && metric.lossesCount != null && (
              <span className="ct-subline"><span className="ct-long">{metric.winsCount}W</span> / <span className="ct-short">{metric.lossesCount}L</span>{metric.tradesCount != null ? ` · ${metric.tradesCount} trades` : ''}</span>
            )}
          </span>
          <span style={{ textAlign: 'right' }}><MetricText value={num(metric.volumeUsd)} kind="volume" quality={metric.quality} /></span>
        </div>
      ))}
    </div>
  );
}

function TradeRows({ trades, emptyText, pnlKey = 'pnlUsdCents' }) {
  if (!trades.length) return <p className="ct-field-hint" style={{ margin: 0 }}>{emptyText}</p>;
  return (
    <div>
      <div className="ct-list-row ct-list-head">
        <span>Market</span><span>Action</span><span className="ct-hide-sm">Price</span><span className="ct-hide-sm">Size</span><span style={{ textAlign: 'right' }}>Realized PnL</span>
      </div>
      {trades.map((trade, index) => {
        const pnl = pnlKey === 'pnlUsdCents'
          ? (num(trade.pnlUsdCents) == null ? null : num(trade.pnlUsdCents) / 100)
          : num(trade[pnlKey]);
        return (
          <div key={trade.id || trade.sourceId || `${trade.occurredAt}:${index}`} className="ct-list-row">
            <span style={{ minWidth: 0 }}>
              <strong>{trade.market || '—'}</strong>
              <span className="ct-subline" title={exactTime(trade.occurredAt)}>{relativeTime(trade.occurredAt)}</span>
            </span>
            <span>
              <span className={`ct-chip ct-chip--${trade.positionSide === 'long' ? 'long' : trade.positionSide === 'short' ? 'short' : 'muted'}`}>
                {tradePositionLabel(trade)}
              </span>
            </span>
            <span className="ct-num ct-hide-sm">{decimal(trade.price, 8)}</span>
            <span className="ct-num ct-hide-sm">{decimal(trade.size, 8)}</span>
            <span className="ct-num" style={{ textAlign: 'right', fontWeight: 600 }}>
              <span className={pnl == null ? 'ct-faint' : pnl >= 0 ? 'ct-long' : 'ct-short'}>{signedCurrency(pnl)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ClosedTradesTab({ token, trader }) {
  const [range, setRange] = useState('30d');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: '' }));
    fetchTraderTradeHistory(token, { venue: trader.venue, account: trader.account, range, page, limit: 50 }, controller.signal)
      .then((data) => setState({ loading: false, error: '', data }))
      .catch((cause) => {
        if (cause?.name === 'AbortError') return;
        setState({ loading: false, error: friendlyCopyError(cause, 'Trade history is unavailable.'), data: null });
      });
    return () => controller.abort();
  }, [token, trader.venue, trader.account, range, page]);

  const data = state.data;
  const totalPages = Math.max(1, Number(data?.totalPages) || 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="ct-toolbar-row">
        <Segmented size="sm" label="History range" value={range} onChange={(value) => { setRange(value); setPage(1); }} options={[{ value: '7d', label: '7D' }, { value: '30d', label: '30D' }, { value: '90d', label: '90D' }]} />
        {data && <span className="ct-field-hint">{Number(data.total || 0).toLocaleString('en-US')} verified closes{data.complete === false ? ' · partial' : ''}</span>}
      </div>
      {state.error ? <Notice tone="error">{state.error}</Notice>
        : state.loading && !data ? <div className="ct-state" role="status"><Spinner /></div>
          : (
            <div className={state.loading ? 'ct-loading-dim' : ''}>
              {data?.status && data.status !== 'available' && <Notice tone="info">{data.note || 'Trade history is still collecting.'}</Notice>}
              <TradeRows trades={arr(data?.items).map((item) => ({ ...item, positionEffect: item.positionEffect || 'closed' }))} emptyText="No verified closes in this range." pnlKey="pnlUsd" />
            </div>
          )}
      {totalPages > 1 && (
        <div className="ct-pager" style={{ padding: '10px 0 0' }}>
          <span>Page {page} of {totalPages}</span>
          <span className="ct-pager-buttons">
            <Btn size="sm" variant="secondary" icon="chevronLeft" disabled={page <= 1 || state.loading} onClick={() => setPage((current) => current - 1)}>Previous</Btn>
            <Btn size="sm" variant="secondary" iconRight="chevronRight" disabled={page >= totalPages || state.loading} onClick={() => setPage((current) => current + 1)}>Next</Btn>
          </span>
        </div>
      )}
    </div>
  );
}

function copySignals(data, selectedMetric, windowLabel) {
  if (!data) return [];
  const metrics = arr(data.metrics).filter((metric) => metric.activityQuality === 'native' || metric.activityQuality === 'calculated');
  const rates = metrics.flatMap((metric) => {
    const days = WINDOW_DAYS[metric.window];
    return days && metric.tradesCount != null ? [metric.tradesCount / days] : [];
  });
  const rate = rates.length ? Math.max(...rates) : null;
  const result = [];
  const verified = selectedMetric && (selectedMetric.quality === 'native' || selectedMetric.quality === 'calculated');
  if (verified && num(selectedMetric.pnlUsd) != null && selectedMetric.pnlUsd < 0) {
    result.push({ tone: 'warning', text: `Negative verified ${windowLabel} returns (${signedCurrency(selectedMetric.pnlUsd)}).` });
  }
  if (rate != null && rate >= 20) {
    result.push({ tone: 'warning', text: `High observed activity (${rate.toLocaleString('en-US', { maximumFractionDigits: 1 })} events/day) may increase copy delay and slippage.` });
  }
  if ((data.sourceOpenPositionCount ?? 0) > 10) {
    result.push({ tone: 'info', text: `${data.sourceOpenPositionCount} simultaneous positions may require a larger copy budget.` });
  }
  if (result.length === 0 && verified && rate != null) {
    result.push({ tone: 'success', text: `No high-activity or negative-return warning in the verified ${windowLabel} evidence.` });
  } else if (result.length === 0) {
    result.push({ tone: 'info', text: 'Not enough verified history is available to classify this trader’s copy risk yet.' });
  }
  return result;
}

function RhythmChips({ rhythm }) {
  if (!rhythm || rhythm.status === 'collecting') return null;
  const chips = [];
  if (rhythm.observedDays != null) chips.push(`${rhythm.observedDays} observed days`);
  if (rhythm.activeHoursUtc != null) chips.push(`${rhythm.activeHoursUtc}/24 active UTC hours`);
  if (rhythm.activeMinutesPerDay != null) chips.push(`${Number(rhythm.activeMinutesPerDay).toLocaleString('en-US', { maximumFractionDigits: 1 })} active min/day`);
  if (rhythm.sessionsPerActiveDay != null) chips.push(`${rhythm.sessionsPerActiveDay} sessions/active day`);
  if (rhythm.medianGapMinutes != null) chips.push(`Median gap ${rhythm.medianGapMinutes}m`);
  if (rhythm.recurringBreakDetected && rhythm.recurringBreakMedianHours != null) chips.push(`Recurring ${Number(rhythm.recurringBreakMedianHours).toFixed(1)}h break`);
  if (rhythm.periodicGapSharePercent >= 45 && rhythm.periodicIntervalMinutes != null) chips.push(`${Math.round(rhythm.periodicGapSharePercent)}% near ${rhythm.periodicIntervalMinutes}m cadence`);
  if (!chips.length) return null;
  return (
    <section className="ct-card ct-card-pad" aria-label="Activity rhythm">
      <h3 className="ct-section-title" style={{ fontSize: 14 }}>Activity rhythm</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {chips.map((chip) => <span key={chip} className="ct-chip ct-chip--muted">{chip}</span>)}
      </div>
      <p className="ct-field-hint" style={{ margin: '8px 0 0' }}>Behaviour estimate from verified activity, not proof that a wallet is operated by a human or a bot.</p>
    </section>
  );
}

/**
 * Trader analysis (ClashBot TraderAnalysisModal): copy decision rail, period
 * stats, daily chart, activity rhythm, live positions, all periods, recent
 * and closed trades. Live positions refresh every 16s while visible.
 */
export default function TraderAnalysis({ token, trader, context, onClose, onCopy }) {
  const [window, setWindow] = useState(context?.window && context.window !== 'all' ? context.window : '7d');
  const [detail, setDetail] = useState({ loading: true, error: '', data: null });
  const [snapshot, setSnapshot] = useState({ loading: true, data: null });
  const [daily, setDaily] = useState({ loading: true, data: null });
  const [tab, setTab] = useState('positions');
  const [chartRange, setChartRange] = useState('30d');
  const [chartMetric, setChartMetric] = useState('pnl');
  const snapshotInFlight = useRef(false);
  const contextQuery = context?.query;

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const controller = new AbortController();
    const params = {
      ...(contextQuery || {}),
      venue: trader.venue,
      account: trader.account,
      includeSourceSnapshot: '0',
    };
    delete params.page;
    delete params.limit;
    const load = (retries) => {
      fetchTraderDetails(token, params, controller.signal)
        .then((data) => {
          if (cancelled) return;
          const delay = historyRetryDelay(data, retries);
          setDetail({ loading: delay != null, error: '', data });
          if (delay != null) timer = setTimeout(() => load(retries + 1), delay);
        })
        .catch((cause) => {
          if (cancelled || cause?.name === 'AbortError') return;
          setDetail((current) => ({ loading: false, error: friendlyCopyError(cause, 'Trader analysis is unavailable.'), data: current.data }));
        });
    };
    setDetail({ loading: true, error: '', data: null });
    load(0);
    fetchTraderDailyAnalytics(token, trader.venue, trader.account, controller.signal)
      .then((data) => { if (!cancelled) setDaily({ loading: false, data }); })
      .catch((cause) => { if (!cancelled && cause?.name !== 'AbortError') setDaily({ loading: false, data: null }); });
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [token, trader.venue, trader.account, contextQuery]);

  const refreshSnapshot = useCallback((signal) => {
    if (snapshotInFlight.current) return;
    snapshotInFlight.current = true;
    fetchTraderSourceSnapshot(token, trader.venue, trader.account, signal)
      .then((data) => setSnapshot({ loading: false, data }))
      // Keep the last proven snapshot on transient failures (ClashBot behaviour).
      .catch((cause) => { if (cause?.name !== 'AbortError') setSnapshot((current) => ({ ...current, loading: false })); })
      .finally(() => { snapshotInFlight.current = false; });
  }, [token, trader.venue, trader.account]);

  useEffect(() => {
    const controller = new AbortController();
    snapshotInFlight.current = false;
    setSnapshot({ loading: true, data: null });
    refreshSnapshot(controller.signal);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshSnapshot(controller.signal);
    }, SNAPSHOT_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [refreshSnapshot]);

  const data = detail.data;
  const source = snapshot.data || data;
  const metrics = arr(data?.metrics);
  const selectedMetric = metrics.find((metric) => metric.window === window) || null;
  const windowLabel = WINDOW_LABELS[window] || window;
  const equity = num(source?.sourceEquityUsd) ?? num(trader.accountValueUsd);
  const marginUsed = num(source?.sourceMarginUsedUsd);
  const freeCollateral = num(source?.sourceAvailableUsd);
  const copyBalance = data?.copyBalance || source?.copyBalance || null;
  const minimumCopyBalance = num(copyBalance?.minimumCopyBalanceUsd ?? trader.minimumCopyBalanceUsd);
  const score = trader.copyScoreDetails || null;
  const scoreValue = num(score?.value ?? trader.copyScore);
  const signals = useMemo(() => copySignals(data, selectedMetric, windowLabel), [data, selectedMetric, windowLabel]);
  const name = trader.displayName?.trim() || shortAccount(trader.account, 8, 6);
  const capital = trader.capitalTier && CAPITAL_PROFILE_LABELS[trader.capitalTier];
  const openCount = num(source?.sourceOpenPositionCount);
  const tabs = [
    { value: 'positions', label: `Positions${openCount != null ? ` (${openCount})` : ''}` },
    { value: 'periods', label: 'All periods' },
    { value: 'recent', label: 'Recent trades' },
    { value: 'closed', label: 'Closed trades' },
  ];

  return (
    <Modal
      size="xl"
      title={name}
      subtitle={(
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <VenueLogo venue={trader.venue} size={14} />
          <span>{venueName(trader.venue)}</span>
          <span>·</span>
          <span className="ct-mono" title={trader.account}>{shortAccount(trader.account, 10, 6)}</span>
          {trader.rank > 0 && <><span>·</span><span>Rank #{trader.rank}</span></>}
        </span>
      )}
      closeLabel="Close trader analysis"
      onClose={onClose}
      headerExtra={<Btn variant="primary" iconRight="copy" onClick={onCopy}>Copy trader</Btn>}
    >
      {detail.loading && !data && (
        <div className="ct-state" role="status"><Spinner size={20} /><span className="ct-state-text">Loading performance history…</span></div>
      )}
      {detail.error && !data && (
        <StateBlock tone="error" icon="alert" title="Trader analysis is temporarily unavailable">{detail.error}</StateBlock>
      )}

      {data && (
        <div className="ct-analysis-grid">
          <aside className="ct-card ct-card-pad" aria-label="Copy decision" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h3 className="ct-section-title" style={{ fontSize: 14 }}>Copy decision</h3>
              <p className="ct-field-hint" style={{ margin: '2px 0 0' }}>Sizing, capital and verified warnings in one place.</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {capital ? <span className="ct-chip ct-chip--muted" title={capital[1]}>{capital[0]}</span> : null}
              <TraderProfileChips trader={{ ...trader, capitalTier: null }} />
            </div>
            <dl className="ct-dl">
              <div><dt>Account equity</dt><dd>{compactCurrency(equity)}</dd></div>
              <div><dt>Margin in use</dt><dd>{compactCurrency(marginUsed)}</dd></div>
              <div><dt>Free collateral</dt><dd>{compactCurrency(freeCollateral)}</dd></div>
              <div><dt>Open positions</dt><dd>{openCount ?? '—'}</dd></div>
              <div><dt>Last trade</dt><dd title={exactTime(data.lastTradeAt)}>{relativeTime(data.lastTradeAt, 'No recent trades')}</dd></div>
            </dl>
            <div className="ct-tile">
              <div className="ct-caption">Minimum copy balance</div>
              <div className="ct-tile-value">{compactCurrency(minimumCopyBalance)}</div>
              <div className="ct-tile-detail">
                {copyBalance?.copyBalanceBasis === 'median_order'
                  ? `Based on the median opening order over ${copyBalance.orderWindow || '30d'}.`
                  : copyBalance?.copyBalanceBasis
                    ? `Basis: ${String(copyBalance.copyBalanceBasis).replace(/_/g, ' ')}.`
                    : 'Estimated by ClashBot from verified order sizes.'}
              </div>
            </div>
            {scoreValue != null && (
              <div className="ct-tile">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="ct-caption">Copy score</span>
                  {score?.confidence && <span className="ct-chip ct-chip--muted">{String(score.confidence)} confidence</span>}
                </div>
                <div className="ct-tile-value">{scoreValue}/100</div>
                <div className="ct-progress" style={{ marginTop: 6 }}>
                  <span style={{ width: `${Math.min(100, Math.max(0, scoreValue))}%`, background: 'var(--terminal-text-muted)' }} />
                </div>
                {copyScoreComponents(score).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {copyScoreComponents(score).map(([label, value]) => (
                      <span key={label} className="ct-chip ct-chip--muted">{label} {value}</span>
                    ))}
                  </div>
                )}
                {arr(score?.reasons).slice(0, 3).map((reason) => (
                  <p key={reason} className="ct-field-hint" style={{ margin: '6px 0 0' }}>{reason}</p>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {signals.map((signal) => <Notice key={signal.text} tone={signal.tone}>{signal.text}</Notice>)}
            </div>
            {source?.sourceSnapshotFreshness === 'stale' && (
              <p className="ct-field-hint" style={{ margin: 0 }}>Current-position inputs are stale; no fresh affordability claim is made.</p>
            )}
          </aside>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <section className="ct-card ct-card-pad" aria-label="Period performance">
              <div className="ct-toolbar-row" style={{ marginBottom: 10 }}>
                <h3 className="ct-section-title" style={{ fontSize: 14 }}>Performance</h3>
                <Segmented size="sm" label="Analysis window" value={window} onChange={setWindow} options={WINDOWS.filter((item) => item.value !== 'all').map((item) => ({ value: item.value, label: item.short }))} />
              </div>
              <div className="ct-stat-grid">
                <div className="ct-tile"><div className="ct-caption">PnL</div><div className="ct-tile-value"><MetricText value={num(selectedMetric?.pnlUsd)} kind="pnl" quality={selectedMetric?.quality} /></div></div>
                <div className="ct-tile"><div className="ct-caption">ROI</div><div className="ct-tile-value"><MetricText value={num(selectedMetric?.roiPercent)} kind="roi" quality={selectedMetric?.roiQuality} /></div></div>
                <div className="ct-tile">
                  <div className="ct-caption">Win rate</div>
                  <div className="ct-tile-value"><MetricText value={num(selectedMetric?.winRatePercent)} kind="rate" quality={selectedMetric?.quality} /></div>
                  {selectedMetric?.winsCount != null && <div className="ct-tile-detail"><span className="ct-long">{selectedMetric.winsCount}W</span> / <span className="ct-short">{selectedMetric.lossesCount}L</span></div>}
                </div>
                <div className="ct-tile">
                  <div className="ct-caption">Volume</div>
                  <div className="ct-tile-value"><MetricText value={num(selectedMetric?.volumeUsd)} kind="volume" quality={selectedMetric?.quality} /></div>
                  {selectedMetric?.tradesCount != null && <div className="ct-tile-detail">{selectedMetric.tradesCount.toLocaleString('en-US')} trades</div>}
                </div>
              </div>
              {data.note && <p className="ct-field-hint" style={{ margin: '8px 0 0' }}>{data.note}</p>}
            </section>
            <DailyChart analytics={daily.data} loading={daily.loading} range={chartRange} onRange={setChartRange} metric={chartMetric} onMetric={setChartMetric} />
            <RhythmChips rhythm={daily.data?.activityRhythm} />
          </div>
        </div>
      )}

      {(data || snapshot.data) && (
        <section className="ct-card ct-card-pad" aria-label="Trader detail">
          <div style={{ marginBottom: 12 }}>
            <Segmented size="sm" label="Trader detail" value={tab} onChange={setTab} options={tabs} />
          </div>
          {tab === 'positions' && <PositionsTable snapshot={source} loading={snapshot.loading} />}
          {tab === 'periods' && <PeriodTable metrics={metrics} />}
          {tab === 'recent' && (
            data?.status === 'unavailable'
              ? <p className="ct-field-hint" style={{ margin: 0 }}>Recent trades are not available for this account.</p>
              : <TradeRows trades={arr(data?.recentTrades)} emptyText="No recent trades were found." />
          )}
          {tab === 'closed' && <ClosedTradesTab token={token} trader={trader} />}
        </section>
      )}
    </Modal>
  );
}
