import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  PUBLIC_LEADERBOARD_VENUES,
  SORT_LABELS,
  TRADER_DETAIL_RANK_LIMIT,
  WINDOWS,
  venueName,
} from './constants';
import { fetchLeaderboard, fetchVenueStatuses, friendlyCopyError } from './copyTradingApi';
import {
  capitalCohortEvidenceNote,
  clearLeaderboardFilter,
  defaultLeaderboardFilters,
  describeAppliedLeaderboardFilters,
  isExactAccountSearch,
  leaderboardQuery,
  readLeaderboardPreferences,
  relaxedLeaderboardFilters,
  writeLeaderboardPreferences,
} from './leaderboardPreferences';
import { compactCurrency, missingMetric, plainPercent, shortAccount, signedCurrency, signedPercent } from './format';
import { enforceMinimumWinRateSample, isRankedTrader, selectedVenueFreshness, traderKey } from './traderModel';
import { useTraderBookmarks } from './traderBookmarks';
import { Btn, Icon, Notice, Segmented, Spinner, StateBlock, VenueLogo } from './ui';
import TraderProfileChips from './TraderChips';
import CopyScore from './CopyScore';

const FilterModal = lazy(() => import('./FilterModal'));
const PAGE_SIZE = 25;
const STARRED = 'starred';

function MetricValue({ value, kind, quality }) {
  if (value == null) return <span className="ct-faint" style={{ fontSize: 12 }}>{missingMetric(quality)}</span>;
  const tone = kind === 'volume' || kind === 'rate' || kind === 'balance' ? '' : value >= 0 ? 'ct-long' : 'ct-short';
  const label = kind === 'percent' ? signedPercent(value)
    : kind === 'rate' ? plainPercent(value)
      : kind === 'pnl' ? signedCurrency(value)
        : compactCurrency(value);
  return <span className={`ct-num ${tone}`} style={{ fontWeight: 600 }}>{label}</span>;
}

function WinRateValue({ trader, mode }) {
  if (trader.winRatePercent == null) return <span className="ct-faint" style={{ fontSize: 12 }}>—</span>;
  const hasBreakdown = trader.winRateWinsCount != null && trader.winRateLossesCount != null;
  const hasPnl = trader.winRateGrossProfitUsd != null && trader.winRateGrossLossUsd != null;
  let detail = null;
  if (mode === 'pnlWeighted' && hasPnl) {
    detail = (
      <>
        <span className="ct-long">{signedCurrency(trader.winRateGrossProfitUsd)}</span>
        {' / '}
        <span className="ct-short">{signedCurrency(-trader.winRateGrossLossUsd)}</span>
      </>
    );
  } else if (hasBreakdown) {
    detail = (
      <>
        <span className="ct-long">{trader.winRateWinsCount.toLocaleString('en-US')}W</span>
        {' / '}
        <span className="ct-short">{trader.winRateLossesCount.toLocaleString('en-US')}L</span>
        {trader.winRateBreakevenCount ? ` / ${trader.winRateBreakevenCount} BE` : ''}
      </>
    );
  } else if (trader.winRateTradesCount != null) {
    detail = `${trader.winRateTradesCount.toLocaleString('en-US')} trades`;
  }
  return (
    <span>
      <MetricValue value={trader.winRatePercent} kind="rate" quality={trader.winRateQuality} />
      {detail && <span className="ct-subline ct-num">{detail}</span>}
    </span>
  );
}

function BalanceValue({ trader }) {
  const estimated = trader.balanceSource && trader.balanceSource !== 'live';
  return (
    <span title={trader.balanceBasis ? `Balance basis: ${String(trader.balanceBasis).replace(/[-_]/g, ' ')}` : undefined}>
      <MetricValue value={trader.accountValueUsd} kind="balance" quality={trader.quality} />
      {trader.minimumCopyBalanceUsd != null && (
        <span className="ct-subline">Copy from {compactCurrency(trader.minimumCopyBalanceUsd)}</span>
      )}
      {estimated && trader.accountValueUsd != null && <span className="ct-subline">Last known</span>}
    </span>
  );
}

function TraderIdentity({ trader }) {
  const name = trader.displayName?.trim();
  return (
    <div className="ct-identity">
      {name && <span className="ct-identity-name">{name}</span>}
      <span className="ct-identity-row">
        <span className={`ct-mono ${name ? 'ct-identity-account' : ''}`} style={name ? undefined : { fontSize: 13, fontWeight: 600 }} title={trader.account}>
          {shortAccount(trader.account)}
        </span>
        <VenueLogo venue={trader.venue} size={16} />
        {trader.evidence === 'collecting' && <span className="ct-chip ct-chip--muted" title="Own verified data is still being collected; unranked, no copy score.">Collecting</span>}
        <TraderProfileChips trader={trader} />
      </span>
    </div>
  );
}

function RankLabel({ trader }) {
  if (!isRankedTrader(trader) || trader.evidence === 'collecting' || !trader.rank) {
    return <span className="ct-faint" style={{ fontSize: 11 }} aria-label="Unranked trader">Unranked</span>;
  }
  return <span aria-label={`Rank ${trader.rank}`}>#{trader.rank}</span>;
}

function SortHeader({ column, label, sort, direction, onSort, disabled }) {
  const active = column === sort;
  const next = active && direction === 'desc' ? 'ascending' : 'descending';
  return (
    <th aria-sort={active ? (direction === 'desc' ? 'descending' : 'ascending') : undefined}>
      <button
        type="button"
        className={`ct-sort-btn ${active ? 'is-active' : ''}`}
        disabled={disabled}
        onClick={() => onSort(column)}
        aria-label={`${label}, ${active ? (direction === 'desc' ? 'highest first' : 'lowest first') : 'not sorted'}. Sort ${next}.`}
      >
        {label}
        <Icon name={active ? (direction === 'desc' ? 'arrowDown' : 'arrowUp') : 'sort'} size={12} />
      </button>
    </th>
  );
}

function StarButton({ active, trader, onToggle }) {
  const name = trader.displayName || shortAccount(trader.account);
  return (
    <button
      type="button"
      className="ct-icon-btn ct-btn--ghost"
      style={{ width: 32, height: 32, color: active ? 'var(--terminal-warning)' : 'var(--terminal-text-faint)' }}
      aria-pressed={active}
      aria-label={`${active ? 'Remove' : 'Add'} ${name} ${active ? 'from' : 'to'} starred traders`}
      title={active ? 'Remove from starred' : 'Star trader'}
      onClick={onToggle}
    >
      <Icon name="star" size={15} filled={active} />
    </button>
  );
}

const MOBILE_SORTS = ['copyScore', 'pnlUsd', 'roi', 'winRate', 'volume', 'accountValue'];

function sortStarred(list, sort, direction) {
  const field = {
    copyScore: 'copyScore', pnlUsd: 'pnlUsd', roi: 'roiPercent', volume: 'volumeUsd',
    accountValue: 'accountValueUsd', trades: 'winRateTradesCount', winRate: 'winRatePercent',
  }[sort];
  const factor = direction === 'asc' ? 1 : -1;
  return [...list].sort((left, right) => {
    const a = left[field];
    const b = right[field];
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return (a - b) * factor;
  });
}

/**
 * ClashBot leaderboard: windows + starred scope, search (exact-account aware),
 * every ClashBot filter, sortable columns, include-collecting toggle,
 * pagination, freshness and empty-state recovery.
 */
export default function Leaderboard({ token, playerId, onCopy, onAnalyze, onContextChange }) {
  const [restored] = useState(() => readLeaderboardPreferences(PUBLIC_LEADERBOARD_VENUES));
  const [window, setWindow] = useState(restored?.window ?? '7d');
  const [starredScope, setStarredScope] = useState(false);
  const [filters, setFilters] = useState(() => {
    const base = defaultLeaderboardFilters(PUBLIC_LEADERBOARD_VENUES);
    if (!restored) return base;
    const next = { ...base };
    for (const key of Object.keys(base)) if (restored[key] !== undefined) next[key] = restored[key];
    return next;
  });
  const [includeCollecting, setIncludeCollecting] = useState(restored?.includeCollecting ?? false);
  const [search, setSearch] = useState(restored?.search ?? '');
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [statusState, setStatusState] = useState('loading');
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const lastRefreshAt = useRef(0);
  const { bookmarks, isBookmarked, toggle } = useTraderBookmarks(playerId);

  const applied = useMemo(
    () => describeAppliedLeaderboardFilters(filters, PUBLIC_LEADERBOARD_VENUES, venueName),
    [filters],
  );
  const query = useMemo(
    () => leaderboardQuery(filters, { window, search: deferredSearch, page, limit: PAGE_SIZE, includeCollecting }),
    [filters, window, deferredSearch, page, includeCollecting],
  );
  const queryKey = JSON.stringify(query);
  const exactSearch = isExactAccountSearch(deferredSearch);

  useEffect(() => {
    writeLeaderboardPreferences({ view: 'leaderboard', window, search, includeCollecting, ...filters });
  }, [filters, window, search, includeCollecting]);

  useEffect(() => {
    onContextChange?.({ window, query });
  }, [onContextChange, window, query]);

  // Reset to page 1 whenever anything except the page changes.
  const resetKey = JSON.stringify({ ...query, page: 0 });
  const previousResetKey = useRef(resetKey);
  useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchLeaderboard(token, JSON.parse(queryKey), controller.signal)
      .then((payload) => {
        setData({
          ...payload,
          items: Array.isArray(payload?.items) ? payload.items.map(enforceMinimumWinRateSample) : [],
          total: Number(payload?.total) || 0,
          totalPages: Math.max(1, Number(payload?.totalPages) || 1),
          page: Number(payload?.page) || 1,
        });
      })
      .catch((cause) => {
        if (cause?.name === 'AbortError') return;
        setError(friendlyCopyError(cause, "We couldn't load the leaderboard."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, queryKey, refreshRevision]);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    fetchVenueStatuses(token, controller.signal)
      .then((payload) => {
        setStatuses(Array.isArray(payload?.items) ? payload.items : []);
        setStatusState('ready');
      })
      .catch((cause) => {
        if (cause?.name !== 'AbortError') setStatusState('error');
      });
    return () => controller.abort();
  }, [token, refreshRevision]);

  // ClashBot cadence: refresh on focus/visibility (max every 5s) and every 5 min.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefreshAt.current < 5_000) return;
      lastRefreshAt.current = now;
      setRefreshRevision((current) => current + 1);
    };
    const interval = setInterval(refresh, 5 * 60_000);
    globalThis.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(interval);
      globalThis.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    if (loading || !data) return;
    if (page > data.totalPages) setPage(data.totalPages);
  }, [data, loading, page]);

  const handleSort = useCallback((column) => {
    setFilters((current) => (current.sort === column
      ? { ...current, direction: current.direction === 'desc' ? 'asc' : 'desc' }
      : { ...current, sort: column, direction: 'desc' }));
  }, []);

  const winRateLabel = filters.winRateMode === 'pnlWeighted' ? 'PnL-weighted' : 'Win rate';
  const items = useMemo(() => {
    if (!starredScope) return data?.items || [];
    const needle = deferredSearch.toLowerCase();
    const matches = needle
      ? bookmarks.filter((item) => item.account.toLowerCase().includes(needle) || String(item.displayName || '').toLowerCase().includes(needle))
      : bookmarks;
    return sortStarred(matches, filters.sort, filters.direction);
  }, [starredScope, data, bookmarks, deferredSearch, filters.sort, filters.direction]);
  const busy = loading && !starredScope;
  const capitalNote = capitalCohortEvidenceNote(filters.venues, filters.capitalTier);
  const selectedStatus = filters.venues.length === 1 ? statuses.find((status) => status.venue === filters.venues[0]) : null;
  const indexedCount = statuses.reduce((total, status) => (
    filters.venues.includes(status.venue) ? total + Math.max(0, Number(status.trader_count) || 0) : total
  ), 0);
  const hasExcludingCriteria = applied.some((filter) => filter.key !== 'venues') || deferredSearch.length > 0;
  const freshnessText = statuses.length === 0
    ? (statusState === 'error' ? 'Exchange freshness is temporarily unavailable' : 'Loading exchange freshness…')
    : selectedVenueFreshness(statuses, filters.venues, venueName);
  const scopeValue = starredScope ? STARRED : window;
  const scopeOptions = [
    ...WINDOWS.map((item) => ({ value: item.value, label: item.label })),
    { value: STARRED, label: `Starred${bookmarks.length ? ` (${bookmarks.length})` : ''}`, icon: 'star' },
  ];

  const canAnalyze = (trader) => trader.rank <= TRADER_DETAIL_RANK_LIMIT || starredScope;
  // Whole row/card opens the analysis; clicks on its own buttons/links keep their action.
  const rowProps = (trader) => (canAnalyze(trader) ? {
    tabIndex: 0,
    'aria-label': `Open analysis for ${trader.displayName || shortAccount(trader.account)}`,
    onClick: (event) => { if (!event.target.closest('button, a, input, label, [role="button"]')) onAnalyze(trader); },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      onAnalyze(trader);
    },
  } : {});

  const renderActions = (trader, compact = false) => (
    <span className="ct-row-actions">
      <StarButton active={isBookmarked(trader)} trader={trader} onToggle={() => toggle(trader, window)} />
      {!compact && canAnalyze(trader) && (
        <Btn size="sm" variant="secondary" icon="chart" onClick={() => onAnalyze(trader)} aria-label={`Open analysis for ${trader.displayName || shortAccount(trader.account)}`}>
          Analysis
        </Btn>
      )}
      <Btn size="sm" variant="primary" iconRight="copy" onClick={() => onCopy(trader)} aria-label={`Copy ${trader.displayName || shortAccount(trader.account)} on ${venueName(trader.venue)}`}>
        Copy
      </Btn>
    </span>
  );

  return (
    <>
      <div className="ct-stat-grid ct-stat-grid--3" aria-label="Leaderboard summary">
        <div className="ct-tile">
          <div className="ct-caption">Traders</div>
          <div className="ct-tile-value">{starredScope ? bookmarks.length : data ? data.total.toLocaleString('en-US') : '—'}</div>
        </div>
        <div className="ct-tile">
          <div className="ct-caption">Exchanges</div>
          <div className="ct-tile-value">{filters.venues.length}</div>
        </div>
        <div className="ct-tile">
          <div className="ct-caption">Refresh</div>
          <div className="ct-tile-value" style={{ fontSize: 14 }}>Hourly</div>
        </div>
      </div>

      <section className="ct-card ct-toolbar" aria-label="Leaderboard controls">
        <div className="ct-toolbar-row">
          <Segmented
            label="Time window"
            size="sm"
            value={scopeValue}
            options={scopeOptions}
            onChange={(value) => {
              if (value === STARRED) {
                setStarredScope(true);
              } else {
                setStarredScope(false);
                setWindow(value);
              }
            }}
          />
          <div className="ct-toolbar-actions">
            <label className="ct-search">
              <Icon name="search" size={15} />
              <span className="ct-sr-only">Search trader or address</span>
              <input
                type="search"
                value={search}
                placeholder="Search trader or address"
                onChange={(event) => setSearch(event.target.value.slice(0, 200))}
              />
            </label>
            <Btn variant="secondary" icon="sliders" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
              Filters
              {applied.length > 0 && <span className="ct-filter-count">{applied.length}</span>}
            </Btn>
          </div>
        </div>
        <div className="ct-toolbar-row">
          <span className="ct-freshness" aria-live="polite">
            {starredScope ? 'Starred traders show the snapshot saved when you starred them.' : freshnessText}
          </span>
          <label className="ct-field-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} title="Also list traders whose own verified data is still being collected (unranked, no copy score)">
            <input type="checkbox" checked={includeCollecting} onChange={(event) => setIncludeCollecting(event.target.checked)} style={{ accentColor: 'var(--terminal-orange)', width: 16, height: 16 }} />
            Include data collecting
          </label>
        </div>
        {exactSearch && !starredScope && (
          <span className="ct-field-hint">Exact account lookup: filters are ignored so the trader cannot be hidden.</span>
        )}
        {applied.length > 0 && (
          <div className="ct-applied" aria-label="Applied filters">
            <span className="ct-caption" style={{ flexShrink: 0 }}>Applied</span>
            {applied.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className="ct-chip ct-chip--brand"
                aria-label={`Remove filter: ${filter.label}`}
                onClick={() => setFilters((current) => clearLeaderboardFilter(current, filter.key, PUBLIC_LEADERBOARD_VENUES))}
              >
                {filter.label}
                <Icon name="close" size={11} />
              </button>
            ))}
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => setFilters((current) => ({
                ...defaultLeaderboardFilters(PUBLIC_LEADERBOARD_VENUES),
                sort: current.sort,
                direction: current.direction,
              }))}
            >
              Clear all
            </Btn>
          </div>
        )}
      </section>

      {capitalNote && <Notice tone="warning"><strong>Why only some exchanges match.</strong> {capitalNote}</Notice>}
      {selectedStatus?.coverage_complete === 0 && selectedStatus.coverage_note && (
        <Notice tone="info"><strong>Indexing in progress.</strong> {selectedStatus.coverage_note}</Notice>
      )}

      {error && !starredScope ? (
        <section className="ct-card">
          <StateBlock
            tone="error"
            icon="alert"
            title="We couldn't load the leaderboard"
            action={<Btn variant="neutral" onClick={() => setRefreshRevision((current) => current + 1)}>Try again</Btn>}
          >
            {error}
          </StateBlock>
        </section>
      ) : (
        <section className="ct-card" style={{ overflow: 'hidden' }} aria-busy={busy}>
          <div className="ct-table-wrap">
            <table className={`ct-table ${busy ? 'ct-loading-dim' : ''}`}>
              <caption className="ct-sr-only">Trader leaderboard. Select a metric column header to change sorting.</caption>
              <thead>
                <tr>
                  <th style={{ width: 64 }}>Rank</th>
                  <th className="ct-left">Trader</th>
                  <SortHeader column="copyScore" label="Copy score" sort={filters.sort} direction={filters.direction} onSort={handleSort} />
                  <SortHeader column="pnlUsd" label="PnL $" sort={filters.sort} direction={filters.direction} onSort={handleSort} />
                  <SortHeader column="roi" label="ROI" sort={filters.sort} direction={filters.direction} onSort={handleSort} />
                  <SortHeader column="winRate" label={winRateLabel} sort={filters.sort} direction={filters.direction} onSort={handleSort} />
                  <SortHeader column="volume" label="Volume $" sort={filters.sort} direction={filters.direction} onSort={handleSort} />
                  <SortHeader column="accountValue" label="Balance" sort={filters.sort} direction={filters.direction} onSort={handleSort} />
                  <th><span className="ct-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((trader) => (
                  <tr key={traderKey(trader)} className={canAnalyze(trader) ? 'ct-clickable' : undefined} {...rowProps(trader)}>
                    <td className="ct-rank"><RankLabel trader={trader} /></td>
                    <td className="ct-left"><TraderIdentity trader={trader} /></td>
                    <td><CopyScore value={trader.copyScore} details={trader.copyScoreDetails} /></td>
                    <td><MetricValue value={trader.pnlUsd} kind="pnl" quality={trader.pnlQuality} /></td>
                    <td><MetricValue value={trader.roiPercent} kind="percent" quality={trader.roiQuality} /></td>
                    <td><WinRateValue trader={trader} mode={filters.winRateMode} /></td>
                    <td><MetricValue value={trader.volumeUsd} kind="volume" quality={trader.quality} /></td>
                    <td><BalanceValue trader={trader} /></td>
                    <td>{renderActions(trader)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ct-mobile-sort">
            <Segmented
              label="Sort leaderboard"
              size="sm"
              value={filters.sort}
              onChange={handleSort}
              options={MOBILE_SORTS.map((column) => ({
                value: column,
                label: `${column === 'winRate' ? winRateLabel : SORT_LABELS[column]}${filters.sort === column ? (filters.direction === 'desc' ? ' ↓' : ' ↑') : ''}`,
              }))}
            />
          </div>
          <div className={`ct-cards ${busy ? 'ct-loading-dim' : ''}`}>
            {items.map((trader) => (
              <article key={traderKey(trader)} className={`ct-trader-card ${canAnalyze(trader) ? 'ct-clickable' : ''}`} {...rowProps(trader)}>
                <div className="ct-trader-card-head">
                  <span className="ct-rank-pill">{isRankedTrader(trader) && trader.rank ? `#${trader.rank}` : '—'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><TraderIdentity trader={trader} /></div>
                  {renderActions(trader, true)}
                </div>
                <div className="ct-metric-grid">
                  <div><div className="ct-caption">Copy score</div><CopyScore value={trader.copyScore} details={trader.copyScoreDetails} /></div>
                  <div><div className="ct-caption">PnL $</div><MetricValue value={trader.pnlUsd} kind="pnl" quality={trader.pnlQuality} /></div>
                  <div><div className="ct-caption">ROI</div><MetricValue value={trader.roiPercent} kind="percent" quality={trader.roiQuality} /></div>
                  <div><div className="ct-caption">{winRateLabel}</div><WinRateValue trader={trader} mode={filters.winRateMode} /></div>
                  <div><div className="ct-caption">Volume $</div><MetricValue value={trader.volumeUsd} kind="volume" quality={trader.quality} /></div>
                  <div><div className="ct-caption">Balance</div><BalanceValue trader={trader} /></div>
                </div>
                {canAnalyze(trader) && (
                  <Btn variant="secondary" icon="chart" onClick={() => onAnalyze(trader)} style={{ width: '100%', marginTop: 10 }}>
                    Trader analysis
                  </Btn>
                )}
              </article>
            ))}
          </div>

          {busy && !data && (
            <div className="ct-state" role="status"><Spinner size={20} /><span className="ct-state-text">Loading leaderboard…</span></div>
          )}

          {starredScope && items.length === 0 && (
            <StateBlock icon="star" title={bookmarks.length ? 'No starred trader matches this search' : 'No starred traders yet'}>
              Star traders from the leaderboard to keep them here.
            </StateBlock>
          )}

          {!starredScope && !loading && data && items.length === 0 && (
            <StateBlock
              icon="search"
              title="No traders match these filters"
              action={indexedCount > 0 && hasExcludingCriteria ? (
                <Btn
                  variant="neutral"
                  icon="refresh"
                  onClick={() => { setFilters((current) => relaxedLeaderboardFilters(current)); setSearch(''); }}
                >
                  Show indexed traders
                </Btn>
              ) : null}
            >
              {indexedCount > 0
                ? `${indexedCount.toLocaleString('en-US')} traders are indexed for the selected exchange${filters.venues.length === 1 ? '' : 's'}, but the current search or filters exclude them.`
                : 'This exchange has not produced an indexed trader for the selected period yet.'}
            </StateBlock>
          )}

          {!starredScope && (
            <footer className="ct-pager">
              <span aria-live="polite">
                {data ? `${data.total.toLocaleString('en-US')} traders · Page ${data.page} of ${data.totalPages}` : 'Loading leaderboard…'}
              </span>
              <span className="ct-pager-buttons">
                <Btn size="sm" variant="secondary" icon="chevronLeft" disabled={!data || data.page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Btn>
                <Btn size="sm" variant="secondary" iconRight="chevronRight" disabled={!data || data.page >= data.totalPages || loading} onClick={() => setPage((current) => current + 1)}>
                  Next
                </Btn>
              </span>
            </footer>
          )}
        </section>
      )}

      {filtersOpen && (
        <Suspense fallback={null}>
          <FilterModal value={filters} onClose={() => setFiltersOpen(false)} onApply={(next) => setFilters(next)} />
        </Suspense>
      )}
    </>
  );
}
