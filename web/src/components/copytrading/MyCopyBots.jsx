import { useCallback, useEffect, useRef, useState } from 'react';
import { venueName } from './constants';
import { copyBotStats, deleteCopyBot, flattenCopyBot, listCopyBots, revokeCopyConnections, setCopyBotStatus } from './copyBotsApi';
import { friendlyCopyError } from './copyTradingApi';
import { relativeTime, shortAccount, x18Usd } from './format';
import { Btn, Icon, Modal, Notice, Spinner, StateBlock, VenueLogo } from './ui';

const REFRESH_MS = 10_000;

function statusChip(bot) {
  if (bot.adminStoppedAt) return { tone: 'short', label: 'Locked' };
  if (bot.config?.windDown) return { tone: 'warning', label: 'Closing' };
  if (bot.status === 'active') return { tone: 'long', label: 'Running' };
  if (bot.status === 'paused') return { tone: 'muted', label: 'Paused' };
  return { tone: 'muted', label: 'Stopped' };
}

function BotStats({ stats }) {
  if (!stats) return <span className="ct-field-hint"><Spinner size={12} /> Loading stats…</span>;
  const pnl = stats.economics?.netRealizedPnlUsdX18;
  const pnlText = x18Usd(pnl);
  const negative = typeof pnl === 'string' && pnl.startsWith('-');
  const winRate = stats.outcomes?.winRateBps == null ? null : `${(stats.outcomes.winRateBps / 100).toFixed(1)}%`;
  return (
    <div className="ct-stat-grid ct-stat-grid--3">
      <div className="ct-tile">
        <div className="ct-caption">Realized PnL</div>
        <div className={`ct-tile-value ${pnlText == null ? '' : negative ? 'ct-short' : 'ct-long'}`} style={{ fontSize: 15 }}>{pnlText ?? 'N/A'}</div>
      </div>
      <div className="ct-tile">
        <div className="ct-caption">Copied</div>
        <div className="ct-tile-value" style={{ fontSize: 15 }}>{stats.executions?.successful ?? 0}/{stats.executions?.total ?? 0}</div>
      </div>
      <div className="ct-tile">
        <div className="ct-caption">Win rate</div>
        <div className="ct-tile-value" style={{ fontSize: 15 }}>{winRate ?? 'N/A'}</div>
      </div>
    </div>
  );
}

function Confirm({ title, children, confirmLabel, tone = 'danger', busy, onConfirm, onCancel }) {
  return (
    <Modal size="sm" title={title} onClose={busy ? undefined : onCancel} footer={(
      <>
        <Btn variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Cancel</Btn>
        <Btn variant={tone} size="sm" disabled={busy} onClick={onConfirm}>{busy && <Spinner size={12} />}{confirmLabel}</Btn>
      </>
    )}
    >
      <p className="ct-field-hint" style={{ margin: 0, fontSize: 12, lineHeight: '20px' }}>{children}</p>
    </Modal>
  );
}

/**
 * The player's ClashBot copy bots, controlled in-game through the Clash
 * server's partner channel: live status and PnL (auto refresh), start / pause /
 * stop, close all, edit and delete.
 */
export default function MyCopyBots({ token, onEdit, onBrowse, refreshKey = 0 }) {
  const [bots, setBots] = useState(null);
  const [stats, setStats] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState({});
  const [confirm, setConfirm] = useState(null);
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
      if (mounted.current) setStats(Object.fromEntries(entries));
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

  if (bots == null) {
    return <section className="ct-card"><StateBlock icon="bot" title="Loading your copy bots…"><Spinner size={14} /></StateBlock></section>;
  }

  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}
      {bots.length === 0 && !error ? (
        <section className="ct-card">
          <StateBlock tone="brand" icon="bot" title="No copy bots yet" action={<Btn variant="neutral" icon="trophy" onClick={onBrowse}>Find a trader</Btn>}>
            Pick a trader on the leaderboard and press Copy. Start in practice mode to see how they fit your account before going live.
          </StateBlock>
        </section>
      ) : (
        <div className="ct-bot-grid">
          {bots.map((bot) => {
            const chip = statusChip(bot);
            const busyLabel = pending[bot.id];
            const locked = Boolean(bot.adminStoppedAt);
            return (
              <article key={bot.id} className="ct-card ct-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>Bot #{bot.id}</strong>
                  <span className={`ct-chip ct-chip--${chip.tone}`}>{chip.label}</span>
                  <span className={`ct-chip ct-chip--${bot.executionMode === 'live' ? 'brand' : 'info'}`}>{bot.executionMode === 'live' ? 'Live' : 'Practice'}</span>
                  <span className="ct-grow" />
                  {busyLabel && <Spinner size={14} />}
                </header>
                <div className="ct-route">
                  <div className="ct-route-side">
                    <VenueLogo venue={bot.sourceVenue} size={20} />
                    <div style={{ minWidth: 0 }}>
                      <div className="ct-route-name">{venueName(bot.sourceVenue)}</div>
                      <div className="ct-mono ct-field-hint" title={bot.sourceAccount}>{shortAccount(bot.sourceAccount)}</div>
                    </div>
                  </div>
                  <Icon name="chevronRight" size={16} />
                  <div className="ct-route-side is-end">
                    <div style={{ minWidth: 0 }}>
                      <div className="ct-route-name">{venueName(bot.destinationVenue)}</div>
                      <div className="ct-mono ct-field-hint" title={bot.destinationAccount}>{shortAccount(bot.destinationAccount)}</div>
                    </div>
                    <VenueLogo venue={bot.destinationVenue} size={20} />
                  </div>
                </div>
                <BotStats stats={stats[bot.id]} />
                <div className="ct-summary-row"><span>Budget</span><span>${Number(bot.config?.allocationUsd || 0).toLocaleString()} · max {bot.config?.leverageMode === 'fixed' ? `${bot.config?.fixedLeverage}x fixed` : `${bot.config?.leverageCap}x`}</span></div>
                <div className="ct-summary-row"><span>Last signal</span><span>{relativeTime(bot.lastSignalAt)}</span></div>
                {bot.executionMode === 'live' && !bot.credentialConfigured && <Notice tone="warning">Exchange connection missing or expired. Edit the bot or create it again to reconnect.</Notice>}
                {locked && <Notice tone="error">{bot.adminStopReason || 'This bot was stopped by ClashBot.'}</Notice>}
                {bot.lastError && <Notice tone="warning">{bot.lastError}</Notice>}
                {stats[bot.id]?.lastSkip?.message && <p className="ct-field-hint" style={{ margin: 0 }}>Last skip: {stats[bot.id].lastSkip.message}</p>}
                <div className="ct-bot-actions">
                  {bot.status === 'active' ? (
                    <Btn size="sm" icon="pause" disabled={Boolean(busyLabel)} onClick={() => act(bot, 'Pause', () => setCopyBotStatus(token, bot.id, 'paused'))}>Pause</Btn>
                  ) : (
                    <Btn size="sm" variant="primary" icon="play" disabled={Boolean(busyLabel) || locked} onClick={() => act(bot, 'Start', () => setCopyBotStatus(token, bot.id, 'active'))}>Start</Btn>
                  )}
                  {bot.status !== 'stopped' && <Btn size="sm" icon="stop" disabled={Boolean(busyLabel)} onClick={() => setConfirm({ bot, kind: 'stop' })}>Stop</Btn>}
                  {bot.executionMode === 'live' && <Btn size="sm" icon="close" disabled={Boolean(busyLabel)} onClick={() => setConfirm({ bot, kind: 'flatten' })}>Close all</Btn>}
                  <Btn size="sm" icon="edit" disabled={Boolean(busyLabel) || locked} onClick={() => onEdit?.(bot)}>Budget</Btn>
                  <Btn size="sm" variant="ghost" icon="trash" disabled={Boolean(busyLabel)} onClick={() => setConfirm({ bot, kind: 'delete' })}>Delete</Btn>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="ct-field-hint" style={{ margin: 0, textAlign: 'center' }}>
        Bots run on ClashBot's servers and keep trading after you close the game. Updates every 10 seconds.{' '}
        <button type="button" className="ct-link-btn" onClick={() => setConfirm({ kind: 'disconnect' })}>Remove unused exchange connections</button>
      </p>

      {confirm && (
        <Confirm
          busy={confirm.busy}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
          tone={confirm.kind === 'disconnect' ? 'primary' : 'danger'}
          title={{
            stop: `Stop copy bot #${confirm.bot?.id}?`,
            flatten: `Close all positions of bot #${confirm.bot?.id}?`,
            delete: `Delete copy bot #${confirm.bot?.id}?`,
            disconnect: 'Remove unused exchange connections?',
          }[confirm.kind]}
          confirmLabel={{ stop: 'Stop bot', flatten: 'Close all', delete: 'Delete bot', disconnect: 'Remove' }[confirm.kind]}
        >
          {{
            stop: 'The bot stops copying new trades. What happens to open positions follows the bot\'s stop setting.',
            flatten: 'ClashBot closes every copied position with reduce-only market orders, then pauses the bot.',
            delete: 'The bot is removed from ClashBot. Its exchange connection is deleted when no other bot uses it. Open positions on the exchange stay as they are.',
            disconnect: 'ClashBot deletes every saved trade-only key of your game account that no bot uses any more.',
          }[confirm.kind]}
        </Confirm>
      )}
    </>
  );
}
