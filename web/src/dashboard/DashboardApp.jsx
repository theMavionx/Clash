import { useCallback, useEffect, useRef, useState } from 'react'

const API_URL = '/api/public/dashboard'
const REFRESH_INTERVAL_MS = 60_000

const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function asFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function formatInteger(value) {
  const number = asFiniteNumber(value)
  return number === null ? '—' : integerFormatter.format(number)
}

function formatTokens(value) {
  const raw = String(value ?? '').trim()
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return '—'
  const [wholeRaw, fractionRaw = ''] = raw.split('.')
  let whole = wholeRaw
  try { whole = BigInt(wholeRaw).toLocaleString('en-US') } catch { /* keep raw */ }
  const fraction = fractionRaw.slice(0, 6).replace(/0+$/, '')
  return `${whole}${fraction ? `.${fraction}` : ''}`
}

function formatUsd(value) {
  const number = asFiniteNumber(value)
  return number === null ? '—' : usdFormatter.format(number)
}

function formatDate(value) {
  if (!value) return '—'
  const raw = String(value).trim()
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}

function formatSignature(value) {
  const signature = String(value || '').trim()
  if (!signature) return '—'
  if (signature.length <= 18) return signature
  return `${signature.slice(0, 8)}…${signature.slice(-8)}`
}

function safeExplorerUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

function eventLabel(value) {
  const type = String(value || '').trim().toLowerCase()
  if (type === 'buyback' || type === 'bought_back') return 'Buyback'
  if (type === 'burn' || type === 'burned') return 'Burn'
  return type ? type.replaceAll('_', ' ') : 'Transaction'
}

function eventClass(value) {
  const type = String(value || '').trim().toLowerCase()
  if (type === 'buyback' || type === 'bought_back') return 'is-buyback'
  if (type === 'burn' || type === 'burned') return 'is-burn'
  return 'is-neutral'
}

function clashSymbol(value) {
  return String(value || 'CLASH').trim().replace(/^\$+/, '') || 'CLASH'
}

function normalizeDashboard(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The dashboard returned an invalid response.')
  }

  return {
    generated_at: payload.generated_at || null,
    users: payload.users && typeof payload.users === 'object' ? payload.users : {},
    volume: payload.volume && typeof payload.volume === 'object' ? payload.volume : {},
    clash: payload.clash && typeof payload.clash === 'object' ? payload.clash : {},
    transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
  }
}

function MetricCard({ label, value, suffix = '', accent = 'blue', size = 'regular' }) {
  return (
    <article className={`metric-card metric-card--${accent} metric-card--${size}`}>
      <p className="metric-card__label">{label}</p>
      <p className="metric-card__value">
        <span>{value}</span>
        {suffix ? <span className="metric-card__suffix">{suffix}</span> : null}
      </p>
    </article>
  )
}

function SectionHeading({ eyebrow, title, note, id, accent = 'blue' }) {
  return (
    <div className={`section-heading section-heading--${accent}`}>
      <div>
        {eyebrow ? <p className="section-heading__eyebrow">{eyebrow}</p> : null}
        <h2 id={id}>{title}</h2>
      </div>
      {note ? <p className="section-heading__note">{note}</p> : null}
    </div>
  )
}

function TransactionLink({ transaction }) {
  const url = safeExplorerUrl(transaction.explorer_url)
  const signature = formatSignature(transaction.tx_signature)

  if (!url) {
    return <span className="transaction-signature" title={transaction.tx_signature || undefined}>{signature}</span>
  }

  return (
    <a
      className="transaction-link"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={transaction.tx_signature || 'View transaction in explorer'}
      aria-label={`View transaction ${signature} in explorer (opens in a new tab)`}
    >
      {signature}
      <span aria-hidden="true">↗</span>
    </a>
  )
}

function EventBadge({ type }) {
  return <span className={`event-badge ${eventClass(type)}`}>{eventLabel(type)}</span>
}

function TransactionsTable({ transactions, symbol }) {
  return (
    <>
      <div className="transaction-table-wrap">
        <table className="transaction-table">
          <caption className="sr-only">Public {symbol} buyback and burn transactions</caption>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Date</th>
              <th scope="col" className="numeric-cell">Amount</th>
              <th scope="col" className="numeric-cell">USD value</th>
              <th scope="col">Note</th>
              <th scope="col">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction, index) => (
              <tr key={transaction.id ?? transaction.tx_signature ?? `${transaction.occurred_at}-${index}`}>
                <td><EventBadge type={transaction.event_type} /></td>
                <td>{formatDate(transaction.occurred_at)}</td>
                <td className="numeric-cell transaction-amount">
                  {formatTokens(transaction.amount_clash)} <span>{symbol}</span>
                </td>
                <td className="numeric-cell">{formatUsd(transaction.usd_value_usd)}</td>
                <td className="transaction-note">{transaction.public_note || '—'}</td>
                <td><TransactionLink transaction={transaction} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="transaction-list" aria-label={`Public ${symbol} transactions`}>
        {transactions.map((transaction, index) => (
          <li
            className="transaction-card"
            key={transaction.id ?? transaction.tx_signature ?? `${transaction.occurred_at}-${index}`}
          >
            <div className="transaction-card__header">
              <EventBadge type={transaction.event_type} />
              <time dateTime={transaction.occurred_at || undefined}>{formatDate(transaction.occurred_at)}</time>
            </div>
            <div className="transaction-card__amount">
              <strong>{formatTokens(transaction.amount_clash)} {symbol}</strong>
              <span><span className="sr-only">USD value: </span>{formatUsd(transaction.usd_value_usd)}</span>
            </div>
            {transaction.public_note ? <p>{transaction.public_note}</p> : null}
            <TransactionLink transaction={transaction} />
          </li>
        ))}
      </ul>
    </>
  )
}

function SkeletonCard() {
  return (
    <div className="metric-card skeleton-card" aria-hidden="true">
      <span className="skeleton skeleton--label" />
      <span className="skeleton skeleton--value" />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-content" aria-busy="true" aria-label="Loading dashboard metrics">
      <section className="overview-grid" aria-hidden="true">
        <div className="metric-column">
          <div className="skeleton skeleton--heading" />
          <SkeletonCard />
          <div className="metric-subgrid">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
        <div className="metric-column">
          <div className="skeleton skeleton--heading" />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="metric-column">
          <div className="skeleton skeleton--heading" />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>
      <section className="dashboard-section">
        <div className="skeleton skeleton--heading" aria-hidden="true" />
        <div className="skeleton-table" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => <span className="skeleton skeleton--row" key={index} />)}
        </div>
      </section>
      <p className="sr-only" role="status">Loading dashboard metrics.</p>
    </div>
  )
}

function DashboardHeader() {
  return (
    <header className="dashboard-header">
      <div className="dashboard-shell dashboard-header__inner">
        <a className="brand" href="/" aria-label="Clash of Perps home">
          <img src="/icons/icon-192.png" alt="" width="32" height="32" />
          <span><strong>$CLASH</strong> Dashboard</span>
        </a>
        <a className="play-link" href="/">Play Clash</a>
      </div>
    </header>
  )
}

export default function DashboardApp() {
  const [dashboard, setDashboard] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const dashboardRef = useRef(null)
  const mountedRef = useRef(true)

  const loadDashboard = useCallback(async ({ background = false, signal } = {}) => {
    if (background) setIsRefreshing(true)
    else if (!dashboardRef.current) setStatus('loading')

    try {
      const response = await fetch(API_URL, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
      })

      if (!response.ok) {
        throw new Error(`Dashboard request failed (${response.status}).`)
      }

      const nextDashboard = normalizeDashboard(await response.json())
      if (!mountedRef.current) return

      dashboardRef.current = nextDashboard
      setDashboard(nextDashboard)
      setStatus('ready')
      setError('')
      setIsStale(false)
    } catch (requestError) {
      if (requestError?.name === 'AbortError' || !mountedRef.current) return

      setError(requestError?.message || 'The dashboard could not be loaded.')
      if (dashboardRef.current) {
        setStatus('ready')
        setIsStale(true)
      } else {
        setStatus('error')
      }
    } finally {
      if (mountedRef.current) setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const controller = new AbortController()
    loadDashboard({ signal: controller.signal })
    const refreshTimer = window.setInterval(() => {
      loadDashboard({ background: true })
    }, REFRESH_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      controller.abort()
      window.clearInterval(refreshTimer)
    }
  }, [loadDashboard])

  const retry = () => loadDashboard({ background: Boolean(dashboardRef.current) })
  const symbol = clashSymbol(dashboard?.clash?.symbol)
  const chain = String(dashboard?.clash?.chain || '').trim()
  const liveStatus = status === 'loading'
    ? 'Loading dashboard data.'
    : status === 'error'
      ? 'Dashboard data is unavailable.'
      : isRefreshing
        ? 'Refreshing dashboard data.'
        : isStale
          ? 'Showing the last available dashboard snapshot.'
          : 'Dashboard data loaded and current.'

  return (
    <div className="dashboard-app">
      <a className="skip-link" href="#dashboard-main">Skip to dashboard</a>
      <DashboardHeader />

      <main id="dashboard-main" className="dashboard-shell dashboard-main">
        <div className="dashboard-intro">
          <div>
            <h1><span>${symbol}</span> Dashboard</h1>
            <p>Network metrics and tokenomics overview</p>
          </div>
          {dashboard ? (
            <div className="dashboard-updated">
              <span className={isStale ? 'status-dot status-dot--stale' : 'status-dot'} aria-hidden="true" />
              <span>
                {isRefreshing ? 'Refreshing…' : isStale ? 'Last successful update' : 'Updated'}
                <time dateTime={dashboard.generated_at || undefined}>{formatDate(dashboard.generated_at)}</time>
              </span>
            </div>
          ) : null}
        </div>

        {isStale ? (
          <div className="status-banner status-banner--warning" role="status">
            <div>
              <strong>Live refresh is temporarily unavailable.</strong>
              <span>Showing the last successfully loaded snapshot. {error}</span>
            </div>
            <button type="button" onClick={retry} disabled={isRefreshing}>
              {isRefreshing ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : null}

        {status === 'loading' ? <DashboardSkeleton /> : null}

        {status === 'error' ? (
          <section className="load-error" role="alert">
            <p className="load-error__eyebrow">Data unavailable</p>
            <h2>We couldn’t load the dashboard.</h2>
            <p>{error || 'Please check your connection and try again.'}</p>
            <button type="button" onClick={retry}>Try again</button>
          </section>
        ) : null}

        {status === 'ready' && dashboard ? (
          <div className="dashboard-content">
            <section className="overview-grid" aria-label="Dashboard overview">
              <div className="metric-column" aria-labelledby="users-heading">
                <SectionHeading id="users-heading" title="Users" />
                <MetricCard
                  label="Total users (all time)"
                  value={formatInteger(dashboard.users.total)}
                  size="hero"
                />
                <div className="metric-subgrid">
                  <MetricCard
                    label="Active today (24h)"
                    value={formatInteger(dashboard.users.active_24h)}
                    size="compact"
                  />
                  <MetricCard
                    label="Active (7 days)"
                    value={formatInteger(dashboard.users.active_7d)}
                    size="compact"
                  />
                </div>
              </div>

              <div className="metric-column" aria-labelledby="volume-heading">
                <SectionHeading
                  id="volume-heading"
                  title="Volume"
                  accent="green"
                />
                <MetricCard
                  label="Total volume (all time)"
                  value={formatUsd(dashboard.volume.all_time_usd)}
                  accent="green"
                  size="hero"
                />
                <MetricCard
                  label="30-day volume"
                  value={formatUsd(dashboard.volume.last_30d_usd)}
                  accent="green"
                  size="compact"
                />
                {dashboard.volume.coverage_note ? (
                  <p className="metric-column__note">{dashboard.volume.coverage_note}</p>
                ) : null}
              </div>

              <div className="metric-column" aria-labelledby="clash-heading">
                <SectionHeading
                  id="clash-heading"
                  eyebrow={chain || undefined}
                  title={`$${symbol} Tokenomics`}
                  accent="gold"
                />
                <MetricCard
                  label="Tokens bought back"
                  value={formatTokens(dashboard.clash.bought_back_tokens)}
                  suffix={symbol}
                  accent="gold"
                  size="hero"
                />
                <MetricCard
                  label="Tokens burned"
                  value={formatTokens(dashboard.clash.burned_tokens)}
                  suffix={symbol}
                  accent="red"
                  size="compact"
                />
              </div>
            </section>

            <section className="dashboard-section transactions-section" aria-labelledby="transactions-heading">
              <SectionHeading
                id="transactions-heading"
                title="Buyback & Burn Transactions"
                accent="gold"
                note="Admin-published treasury records with public Solscan references."
              />
              {dashboard.transactions.length > 0 ? (
                <TransactionsTable transactions={dashboard.transactions} symbol={symbol} />
              ) : (
                <div className="empty-state">
                  <h3>No transactions published yet</h3>
                  <p>Published buyback and burn activity will appear here.</p>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveStatus}</p>

      <footer className="dashboard-footer">
        <div className="dashboard-shell">
          <div className="dashboard-footer__meta">
            <span>Public treasury records</span>
            {chain ? <span>Network: {chain}</span> : null}
          </div>
          <span className={status !== 'ready'
            ? 'footer-status footer-status--unknown'
            : isStale ? 'footer-status footer-status--stale' : 'footer-status'}>
            <i aria-hidden="true" />
            {status === 'ready' ? (isStale ? 'Snapshot data' : 'Data live') : 'Dashboard status unavailable'}
          </span>
        </div>
      </footer>
    </div>
  )
}
