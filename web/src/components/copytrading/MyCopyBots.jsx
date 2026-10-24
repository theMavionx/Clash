import { useCallback, useEffect, useRef, useState } from 'react';
import { venueName } from './constants';
import { copyBotStats, deleteCopyBot, flattenCopyBot, listCopyBots, revokeCopyConnections, setCopyBotStatus } from './copyBotsApi';
import { friendlyCopyError } from './copyTradingApi';
import { formatDuration, relativeTime, shortAccount, tradePositionLabel, x18Usd } from './format';
import { Btn, Icon, Modal, Notice, Spinner, VenueLogo } from './ui';

const REFRESH_MS = 10_000;

function money(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
}

/** ClashBot CopyBotsView statusStyle: running = long, paused = warning, otherwise muted. */
function statusPill(bot) {
  if (bot.adminStoppedAt) return { tone: 'short', label: 'Locked' };
  if (bot.status === 'active') return { tone: 'long', label: 'Running' };
  if (bot.status === 'paused') return { tone: 'warning', label: 'Paused' };
  return { tone: 'muted', label: bot.status || 'Stopped' };
}

/** ClashBot copySpeedText: latest verified source -> first fill timing. */
function copySpeedText(latency) {
  const fill = latency?.sourceToFirstFill;
  if (fill?.latestMs == null) return '—';
  const parts = [`first fill ${formatDuration(fill.latestMs)}`];
  const stages = latency?.latestStages;
  if (stages) {
    const duration = (value) => (value == null ? '—' : formatDuration(value));
    parts.push(`detect ${duration(stages.sourceToDetectMs)} + dispatch ${duration(stages.detectedToDispatchMs)} + to fill ${duration(stages.dispatchToFirstFillMs)}`);
    if (stages.orderKind === 'resting_limit') parts.push('limit wait included');
  }
  if (fill.p95Ms != null && fill.sampleCount > 1) parts.push(`fill p95 ${formatDuration(fill.p95Ms)}`);
  if (fill.sampleCount > 0) parts.push(`last ${fill.sampleCount} verified`);
  return parts.join(' · ');
}

function Tile({ label, children, detail, muted = false, className = '' }) {
  return (
    <div className={`ct-bot-tile ${muted ? 'is-muted' : ''}`}>
      <p className="ct-bot-tile-label">{label}</p>
      <p className={`ct-bot-tile-value ${className}`}>{children}</p>
      {detail && <p className="ct-bot-tile-detail">{detail}</p>}
    </div>
  );
}

function RecentActivity({ stats }) {
  const orders = Array.isArray(stats.recentOrders) ? stats.recentOrders : [];
  const trades = Array.isArray(stats.recentTrades) ? stats.recentTrades : [];
  const statusTone = (status) => (['confirmed', 'filled'].includes(status) ? 'ct-long'
    : ['rejected', 'failed', 'abandoned', 'expired'].includes(status) ? 'ct-short' : 'ct-warning');
  return (
    <div className="ct-bot-activity">
      {orders.length > 0 && (
        <>
          <p className="ct-bot-activity-head">Order lifecycle</p>
          {orders.map((order) => (
            <div key={order.historyId || `order:${order.executionId}:${order.legIndex}`} className="ct-bot-activity-row is-outlined">
              <div style={{ minWidth: 0 }}>
                <p className="ct-bot-activity-title">
                  {order.symbol || order.marketKey} · {order.orderType === 'limit' ? 'Limit' : order.orderType === 'maker' ? 'Maker' : order.orderType === 'taker' ? 'Taker' : 'Order'}
                </p>
                <p className="ct-bot-activity-meta">{order.action || (order.reduceOnly ? 'reduce' : 'trade')} · {relativeTime(order.occurredAt)}</p>
                {order.lastError && <p className="ct-bot-activity-meta ct-short">{order.lastError}</p>}
              </div>
              <span className={`ct-bot-activity-status ${statusTone(order.status)}`}>{order.status}</span>
            </div>
          ))}
          <p className="ct-bot-activity-head">Verified fills</p>
        </>
      )}
      {trades.length === 0 ? (
        <p className="ct-bot-activity-row ct-faint">No verified fills yet.</p>
      ) : trades.map((trade) => {
        const pnl = x18Usd(trade.netRealizedPnlUsdX18);
        return (
          <div key={`${trade.executionId}:${trade.orderId}`} className="ct-bot-activity-row">
            <div style={{ minWidth: 0 }}>
              <p className="ct-bot-activity-title">{trade.marketKey} · {tradePositionLabel({ positionSide: trade.positionSide || (trade.side === 'buy' ? 'long' : trade.side === 'sell' ? 'short' : trade.side), positionEffect: trade.positionEffect })}</p>
              <p className="ct-bot-activity-meta">{relativeTime(trade.occurredAt)}</p>
            </div>
            {pnl && <span className={`ct-bot-activity-status ct-num ${pnl.startsWith('-') ? 'ct-short' : 'ct-long'}`}>{pnl}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Confirm({ title, icon, tone = 'danger', children, confirmLabel, busy, onConfirm, onCancel }) {
  return (
    <Modal size="sm" title={title} onClose={busy ? undefined : onCancel} footer={(
      <>
        <Btn variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Cancel</Btn>
        <Btn variant={tone} size="sm" disabled={busy} onClick={onConfirm}>{busy && <Spinner size={12} />}{confirmLabel}</Btn>
      </>
    )}
    >
      {icon && <span className={`ct-bot-confirm-icon ct-bot-confirm-icon--${tone}`}><Icon name={icon} size={17} /></span>}
      <p className="ct-field-hint" style={{ margin: 0, fontSize: 12, lineHeight: '20px' }}>{children}</p>
    </Modal>
  );
}

/**
 * The player's ClashBot copy bots, laid out like ClashBot's own My bots view
 * (copy.clashbot.fun, src/CopyBotsView.tsx) and controlled in-game through the
 * Clash server's partner channel: live status and PnL (auto refresh),
 * start / pause / stop, close all, edit budget and delete.
 */
export default function MyCopyBots({ token, onEdit, onBrowse, refreshKey = 0 }) {
  const [bots, setBots] = useState(null);
  const [stats, setStats] = useState({});
  const [statsFailed, setStatsFailed] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async (signal) => {
    try {
      const payload = await listCopyBots(token, signal);
      if (!mounted.current) return;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setBots(items);
      setError('');
      const entries = await Promise.all(items.map(async (bot) => {
        try { return [bot.id, (await copyBotStats(token, bot.id, signal))?.stats || null]; } catch { return [bot.id, null]; }
      }));
      if (!mounted.current) return;
      setStats((current) => {
        const next = {};
        for (const [id, value] of entries) next[id] = value ?? current[id] ?? null;
        return next;
      });
      setStatsFailed(Object.fromEntries(entries.map(([id, value]) => [id, value == null])));
    } catch (loadError) {
      if (loadError?.name === 'AbortError' || !mounted.current) return;
      setError(loadError.code === 'COPY_BOTS_NOT_CONFIGURED'
        ? 'In-game copy bots are being set up. Try again shortly.'
        : friendlyCopyError(loadError, 'Copy bots could not be loaded.'));
      setBots((current) => current ?? []);
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => { if (!document.hidden) load(controller.signal); }, REFRESH_MS);
    return () => { controller.abort(); clearInterval(timer); };
  }, [load, refreshKey]);

  async function act(bot, label, run) {
    setPending((current) => ({ ...current, [bot.id]: label }));
    setNotice('');
    try {
      await run();
      await load();
    } catch (actionError) {
      setNotice(friendlyCopyError(actionError, `Could not ${label.toLowerCase()} bot #${bot.id}.`));
    } finally {
      if (mounted.current) setPending((current) => { const next = { ...current }; delete next[bot.id]; return next; });
    }
  }

  async function runConfirm() {
    const { bot, kind } = confirm;
    setConfirm({ ...confirm, busy: true });
    if (kind === 'stop') await act(bot, 'Stop', () => setCopyBotStatus(token, bot.id, 'stopped'));
    if (kind === 'flatten') await act(bot, 'Close', () => flattenCopyBot(token, bot.id, 'paused'));
    if (kind === 'delete') await act(bot, 'Delete', () => deleteCopyBot(token, bot.id));
    if (kind === 'disconnect') {
      try {
        const result = await revokeCopyConnections(token);
        setNotice(`Removed ${result?.revoked ?? 0} unused exchange connection(s) from ClashBot.`);
      } catch (revokeError) {
        setNotice(friendlyCopyError(revokeError, 'Connections could not be removed.'));
      }
    }
    if (mounted.current) setConfirm(null);
  }

  const known = bots != null;
  const summary = [
    ['My bots', bots?.length ?? 0, 'bot'],
    ['Active', bots?.filter((bot) => bot.status === 'active').length ?? 0, 'activity'],
    ['Live mode', bots?.filter((bot) => bot.executionMode === 'live').length ?? 0, 'wallet'],
    ['Paused', bots?.filter((bot) => bot.status === 'paused').length ?? 0, 'pause'],
  ];

  return (
    <>
      <section className="ct-bot-summary">
        {summary.map(([label, value, icon]) => (
          <div key={label} className="ct-bot-summary-tile">
            <span className="ct-bot-summary-icon"><Icon name={icon} size={16} /></span>
            <p className="ct-bot-summary-label">{label}</p>
            <p className="ct-bot-summary-value">{known ? value : '—'}</p>
          </div>
        ))}
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}

      {bots == null ? (
        <section className="ct-card ct-bot-empty" aria-busy="true">
          <span className="ct-bot-empty-icon"><Spinner size={22} /></span>
          <h2 className="ct-bot-empty-title">Loading your copy bots…</h2>
          <p className="ct-bot-empty-text">Bot cards appear here as soon as ClashBot answers.</p>
        </section>
      ) : bots.length === 0 && !error ? (
        <section className="ct-card ct-bot-empty">
          <span className="ct-bot-empty-icon is-brand"><Icon name="bot" size={24} /></span>
          <h2 className="ct-bot-empty-title">No copy bots yet</h2>
          <p className="ct-bot-empty-text">Choose a trader from the leaderboard and finish setup. The new bot will appear here automatically.</p>
          <Btn variant="primary" onClick={onBrowse}>Browse traders</Btn>
        </section>
      ) : bots.length === 0 ? (
        <section className="ct-card ct-bot-empty">
          <span className="ct-bot-empty-icon is-warning"><Icon name="refresh" size={23} /></span>
          <h2 className="ct-bot-empty-title">Bot list is not confirmed</h2>
          <p className="ct-bot-empty-text">The bot list request failed, so this screen will not report zero bots. It retries automatically.</p>
        </section>
      ) : (
        <div className="ct-bot-grid">
          {bots.map((bot) => {
            const pill = statusPill(bot);
            const busyLabel = pending[bot.id];
            const busy = Boolean(busyLabel);
            const locked = Boolean(bot.adminStoppedAt);
            const live = bot.executionMode === 'live';
            const windDown = bot.config?.windDown;
            const botStats = stats[bot.id];
            const reconnect = live && !bot.credentialConfigured;
            const netPnl = x18Usd(botStats?.economics?.netRealizedPnlUsdX18 ?? null);
            const fees = x18Usd(botStats?.economics?.feesUsdX18 ?? null);
            const volume = x18Usd(botStats?.economics?.volumeUsdX18 ?? null);
            const executions = botStats?.executions || {};
            const outcomes = botStats?.outcomes || {};
            const lastSkip = botStats?.lastSkip;
            const showSkip = lastSkip?.message && (botStats?.lastTrade == null || lastSkip.occurredAt >= botStats.lastTrade.occurredAt);
            const isExpanded = expanded === bot.id;
            const config = bot.config || {};
            return (
              <article key={bot.id} className="ct-card ct-bot-card" aria-busy={busy || undefined}>
                <header className="ct-bot-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="ct-bot-title-row">
                      <h2 className="ct-bot-title">Copy Bot #{bot.id}</h2>
                      <span className={`ct-bot-pill ct-bot-pill--${pill.tone}`}>{pill.label}</span>
                      <span className={`ct-bot-pill ct-bot-pill--${live ? 'short' : 'info'}`}>{live ? 'Live' : 'Practice'}</span>
                      {reconnect && <span className="ct-bot-pill ct-bot-pill--warning">Reconnect</span>}
                      {busy && <Spinner size={12} />}
                    </div>
                    {bot.followerWallet && <p className="ct-bot-wallet ct-mono" title={bot.followerWallet}>{shortAccount(bot.followerWallet, 8, 6)}</p>}
                  </div>
                  <span className="ct-bot-signal" title="Last signal"><Icon name="clock" size={13} /> {relativeTime(bot.lastSignalAt, 'No signals yet')}</span>
                </header>

                <div className="ct-bot-route">
                  <div className="ct-bot-route-side">
                    <VenueLogo venue={bot.sourceVenue} size={26} />
                    <div style={{ minWidth: 0 }}>
                      <p className="ct-bot-route-name">{venueName(bot.sourceVenue)}</p>
                      <p className="ct-bot-route-account ct-mono" title={bot.sourceAccount}>{shortAccount(bot.sourceAccount, 8, 6)}</p>
                    </div>
                  </div>
                  <span className="ct-faint" aria-hidden="true">→</span>
                  <div className="ct-bot-route-side is-end">
                    <div style={{ minWidth: 0 }}>
                      <p className="ct-bot-route-name">{venueName(bot.destinationVenue)}</p>
                      <p className="ct-bot-route-account ct-mono" title={bot.destinationAccount}>{shortAccount(bot.destinationAccount, 8, 6)}</p>
                    </div>
                    <VenueLogo venue={bot.destinationVenue} size={26} />
                  </div>
                </div>

                <div className="ct-bot-tiles">
                  <Tile label="Allocation">{money(config.allocationUsd)}</Tile>
                  <Tile label="Max margin">{money(config.maxMarginUsd)}</Tile>
                  <Tile label="Reserve">{config.reservePercent == null ? '—' : `${config.reservePercent}%`}</Tile>
                  <Tile label="Markets">{config.assetMode === 'all' || !Array.isArray(config.assets) ? 'All' : config.assets.join(', ')}</Tile>
                </div>

                <div className="ct-bot-tiles">
                  <Tile muted label="Completed orders">{botStats?.executedOrders ?? executions.successful ?? '—'}</Tile>
                  <Tile muted label="Net PnL" className={netPnl ? (netPnl.startsWith('-') ? 'ct-short' : 'ct-long') : ''}>{netPnl ?? '—'}</Tile>
                  <Tile muted label="Fees / volume">{fees && volume ? `${fees} / ${volume}` : '—'}</Tile>
                  <Tile
                    muted
                    label="Bot status"
                    detail={botStats ? `${executions.pending ?? '—'} processing · ${executions.skipped ?? '—'} no trade` : null}
                  >
                    {botStats ? `${executions.successful ?? 0} completed · ${executions.needsAttention ?? executions.failed ?? 0} need attention`
                      : statsFailed[bot.id] ? 'Refresh to update' : 'Loading…'}
                  </Tile>
                </div>

                {botStats && (
                  <div className="ct-bot-strip">
                    <span>W/L: {outcomes.wins == null ? '—' : `${outcomes.wins}/${outcomes.losses} · ${((outcomes.winRateBps || 0) / 100).toFixed(2)}%`}</span>
                    <span title="Latest verified order: detect is source event to detection; dispatch is detection to the durable submission start; to fill includes submission processing and limit-order waiting.">Copy timing: {copySpeedText(botStats.latency)}</span>
                    <span>{botStats.lastTrade ? `Last trade ${botStats.lastTrade.marketKey} · ${relativeTime(botStats.lastTrade.occurredAt)}` : 'No completed trades yet'}</span>
                  </div>
                )}

                {reconnect && (
                  <div className="ct-bot-alert is-warning"><Icon name="alert" size={13} /> Reconnect {venueName(bot.destinationVenue)}: the exchange connection is missing or expired. Create the bot again to reconnect.</div>
                )}
                {showSkip && <p className="ct-bot-skip"><strong>No trade.</strong> {lastSkip.message} · {relativeTime(lastSkip.occurredAt)}</p>}
                {locked && (
                  <div className="ct-bot-alert is-error is-large"><Icon name="shield" size={15} /> <span><strong>Admin locked.</strong> {bot.adminStopReason || 'Contact an administrator before this bot can run again.'}</span></div>
                )}
                {bot.lastError && !locked && <div className="ct-bot-alert is-error">{bot.lastError}</div>}

                {botStats && (
                  <div className="ct-bot-expand">
                    <button type="button" className="ct-bot-expand-btn" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : bot.id)}>
                      <span>Recent activity</span>
                      <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={14} />
                    </button>
                    {isExpanded && <RecentActivity stats={botStats} />}
                  </div>
                )}

                {windDown ? (
                  <p className="ct-bot-winddown">
                    {windDown.mode === 'flatten'
                      ? `Closing all positions at market, then the bot will ${windDown.then === 'stopped' ? 'stop' : 'pause'}.`
                      : `Waiting for the trader to close positions, then the bot will ${windDown.then === 'stopped' ? 'stop' : 'pause'}.`}
                  </p>
                ) : config.closeOnly ? (
                  <p style={{ margin: 0 }}><span className="ct-bot-pill ct-bot-pill--warning">Close-only</span></p>
                ) : null}

                <footer className="ct-bot-actions">
                  <button type="button" className="ct-bot-action" disabled={busy || locked} onClick={() => onEdit?.(bot)}><Icon name="edit" size={13} /> Edit</button>
                  {bot.status === 'active' ? (
                    <button type="button" className="ct-bot-action is-warning-soft" disabled={busy || locked}
                      onClick={() => act(bot, 'Pause', () => setCopyBotStatus(token, bot.id, 'paused', windDown ? true : undefined))}>
                      <Icon name="pause" size={14} /> {windDown ? 'Pause now (keep positions)' : 'Pause'}
                    </button>
                  ) : (
                    <button type="button" className="ct-bot-action is-long-soft" disabled={busy || locked || reconnect || Boolean(windDown)}
                      title={reconnect ? `Reconnect ${venueName(bot.destinationVenue)} first` : undefined}
                      onClick={() => act(bot, 'Start', () => setCopyBotStatus(token, bot.id, 'active'))}>
                      <Icon name="play" size={14} /> Start
                    </button>
                  )}
                  {live && !locked && (
                    <button type="button" className="ct-bot-action is-warning-outline" disabled={busy} onClick={() => setConfirm({ bot, kind: 'flatten' })}>
                      <Icon name="layers" size={13} /> Close all positions
                    </button>
                  )}
                  {bot.status !== 'stopped' && (
                    <button type="button" className="ct-bot-action is-short-soft" disabled={busy || locked} onClick={() => setConfirm({ bot, kind: 'stop' })}>
                      <Icon name="stop" size={12} filled /> Stop
                    </button>
                  )}
                  <button type="button" className="ct-bot-action is-short-outline" disabled={busy} onClick={() => setConfirm({ bot, kind: 'delete' })}>
                    <Icon name="trash" size={13} /> Delete
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
      <p className="ct-field-hint" style={{ margin: 0, textAlign: 'center' }}>
        Bots run on ClashBot&apos;s servers and keep trading after you close the game. Updates every 10 seconds.{' '}
        <button type="button" className="ct-link-btn" style={{ display: 'inline', textDecoration: 'underline' }} onClick={() => setConfirm({ kind: 'disconnect' })}>Remove unused exchange connections</button>
      </p>

      {confirm && (
        <Confirm
          busy={confirm.busy}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
          tone={confirm.kind === 'disconnect' ? 'primary' : 'danger'}
          icon={{ stop: 'stop', flatten: 'layers', delete: 'trash' }[confirm.kind]}
          title={{
            stop: `Stop Copy Bot #${confirm.bot?.id}?`,
            flatten: `Close all positions of Copy Bot #${confirm.bot?.id}?`,
            delete: `Delete Copy Bot #${confirm.bot?.id}?`,
            disconnect: 'Remove unused exchange connections?',
          }[confirm.kind]}
          confirmLabel={{ stop: 'Confirm stop', flatten: 'Close all and pause', delete: 'Delete permanently', disconnect: 'Remove' }[confirm.kind]}
        >
          {{
            stop: confirm.bot?.config?.stopBehavior === 'market'
              ? 'All positions of this bot will be closed at market before it stops.'
              : confirm.bot?.config?.stopBehavior === 'follow'
                ? 'The bot stops opening positions and waits for the trader\'s closes, then stops.'
                : 'No new signals will be queued. Existing positions stay open for manual management. You can start the bot again later.',
            flatten: 'This sends reduce-only market orders for every open position of this bot, then pauses it. Market orders may fill at a worse price than the current mark.',
            delete: 'This stops the bot and removes its trading connection when no other bot uses it. Existing exchange positions stay open and must be managed separately.',
            disconnect: 'ClashBot deletes every saved trade-only key of your game account that no bot uses any more.',
          }[confirm.kind]}
        </Confirm>
      )}
    </>
  );
}
