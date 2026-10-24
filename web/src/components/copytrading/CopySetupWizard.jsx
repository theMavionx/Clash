import { useEffect, useMemo, useState } from 'react';
import { COPYABLE_SOURCE_VENUES, venueName } from './constants';
import { createCopyBot, savedCopyConnections, setCopyBotStatus, updateCopyBot } from './copyBotsApi';
import { fetchCopyServiceStatus, fetchTraderDailyAnalytics, fetchTraderSourceSnapshot, friendlyCopyError } from './copyTradingApi';
import { COPY_CONNECTORS, COPY_DESTINATION_IDS } from './connectors';
import { projectCopyOutcome, simpleCopyConfig } from './copySimpleMode';
import { shortAccount } from './format';
import { Btn, Icon, Modal, Notice, NumberField, Segmented, Spinner, VenueLogo } from './ui';

const BUDGET_PRESETS = [50, 100, 250, 500, 1000];
const WINDOWS = [{ value: 7, label: '7D' }, { value: 30, label: '30D' }, { value: 90, label: '90D' }];

function Sparkline({ series, positive }) {
  if (!series?.length) return null;
  const width = 320, height = 72, pad = 4;
  const values = [0, ...series.map((point) => point.value)];
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(1e-9, max - min);
  const x = (index) => pad + (series.length === 1 ? width - 2 * pad : (index / (series.length - 1)) * (width - 2 * pad));
  const y = (value) => pad + (1 - (value - min) / span) * (height - 2 * pad);
  const path = series.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const color = positive ? 'var(--terminal-long)' : 'var(--terminal-short)';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Projected copy result over time" preserveAspectRatio="none">
      <line x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} stroke="var(--terminal-border-strong)" strokeDasharray="3 3" strokeWidth="1" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function money(value) {
  const abs = Math.abs(value);
  return `${value < 0 ? '-' : '+'}$${abs.toLocaleString(undefined, { maximumFractionDigits: abs >= 100 ? 0 : 2 })}`;
}

/**
 * Simple in-game copy setup (ClashBot simple mode): choose where to copy and how
 * much margin to commit, see what that budget would have made following this
 * trader, then one "Start copying" button that authorises a trade-only
 * connection for ClashBot, creates the live bot and starts it. `editBot`
 * changes the budget of an existing bot.
 */
export default function CopySetupWizard({ token, trader, editBot, player, walletCtx, onClose, onSaved }) {
  const editing = Boolean(editBot);
  const sourceVenue = editing ? editBot.sourceVenue : trader.venue;
  const sourceAccount = editing ? editBot.sourceAccount : trader.account;
  const [venue, setVenue] = useState(editing ? editBot.destinationVenue : '');
  const [budget, setBudget] = useState(String(editing ? editBot.config?.allocationUsd ?? 100 : 100));
  const [days, setDays] = useState(30);
  const [status, setStatus] = useState(null);
  const [saved, setSaved] = useState(null);
  const [history, setHistory] = useState({ loading: true, points: [], equityUsd: null });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const sourceCopyable = COPYABLE_SOURCE_VENUES.has(sourceVenue);
  const budgetValue = Number(budget);
  const budgetError = budget === '' || !Number.isFinite(budgetValue) || budgetValue < 1 || budgetValue > 100_000_000
    ? 'Enter a budget between $1 and $100,000,000' : '';

  useEffect(() => {
    const controller = new AbortController();
    fetchCopyServiceStatus(token, controller.signal).then(setStatus).catch(() => setStatus({}));
    Promise.all([
      fetchTraderDailyAnalytics(token, sourceVenue, sourceAccount, controller.signal).catch(() => null),
      fetchTraderSourceSnapshot(token, sourceVenue, sourceAccount, controller.signal).catch(() => null),
    ]).then(([daily, snapshot]) => {
      const equity = [snapshot?.sourceEquityUsd, trader?.accountValueUsd].map(Number).find((value) => Number.isFinite(value) && value > 0) ?? null;
      setHistory({ loading: false, points: Array.isArray(daily?.points) ? daily.points : [], equityUsd: equity, capturedAt: daily?.capturedAt });
    }).catch(() => setHistory({ loading: false, points: [], equityUsd: null }));
    return () => controller.abort();
  }, [token, sourceVenue, sourceAccount, trader?.accountValueUsd]);

  useEffect(() => {
    if (editing || !venue) { setSaved(null); return undefined; }
    let cancelled = false;
    setSaved(null);
    savedCopyConnections(token, venue)
      .then((payload) => { if (!cancelled) setSaved((payload?.items || []).filter((item) => item.reusableForNewBot !== false)); })
      .catch(() => { if (!cancelled) setSaved([]); });
    return () => { cancelled = true; };
  }, [token, venue, editing]);

  const paused = useMemo(() => {
    const controls = new Map((status?.venueControls?.copyDestinations || []).map((item) => [item.venue, item]));
    return new Set(COPY_DESTINATION_IDS.filter((id) => {
      const control = controls.get(id);
      return control ? (!control.supported || !control.enabled) : false;
    }));
  }, [status]);

  const projection = useMemo(() => projectCopyOutcome({
    points: history.points, equityUsd: history.equityUsd, budgetUsd: budgetValue, days,
    now: history.capturedAt || Date.now(),
  }), [history, budgetValue, days]);

  const connector = COPY_CONNECTORS[venue];
  const savedConnection = saved?.[0] || null;
  const canStart = sourceCopyable && !budgetError && (editing || (venue && connector && !paused.has(venue) && saved != null));

  async function start() {
    setBusy(true);
    setError('');
    try {
      if (editing) {
        const result = await updateCopyBot(token, editBot.id, {
          executionMode: 'live', config: simpleCopyConfig(budgetValue, editBot.config), expectedConfigRevision: editBot.configRevision,
        });
        onSaved?.(result?.item || null, 'updated');
        return;
      }
      const body = { sourceVenue, sourceAccount, destinationVenue: venue, executionMode: 'live', config: simpleCopyConfig(budgetValue) };
      let wallet = String(walletCtx?.evmWalletAddress || '').toLowerCase() || undefined;
      if (savedConnection) {
        body.destinationAccount = savedConnection.destinationAccount;
        body.connectionId = savedConnection.connectionId;
      } else {
        setProgress(`Connecting ${venueName(venue)}…`);
        const connection = await connector.connect({ token, player, walletCtx, onProgress: setProgress });
        body.destinationAccount = connection.destinationAccount;
        body.credential = connection.credential;
        if (connection.ownerWallet) wallet = connection.ownerWallet;
      }
      setProgress('Creating your copy bot on ClashBot…');
      const created = await createCopyBot(token, body, wallet);
      delete body.credential;
      let item = created?.item || null;
      if (item) {
        setProgress('Starting…');
        try {
          item = (await setCopyBotStatus(token, item.id, 'active'))?.item || item;
        } catch (startError) {
          onSaved?.(item, 'created', friendlyCopyError(startError, 'The bot was created but could not start.'));
          return;
        }
      }
      onSaved?.(item, 'created');
    } catch (startError) {
      setError(friendlyCopyError(startError, 'Copy bot could not be started.'));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const name = editing ? shortAccount(sourceAccount) : (trader.displayName?.trim() || shortAccount(trader.account));
  const positive = (projection?.pnlUsd ?? 0) >= 0;

  return (
    <Modal
      size="md"
      title={editing ? `Change budget of bot #${editBot.id}` : `Copy ${name}`}
      subtitle={(
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <VenueLogo venue={sourceVenue} size={14} />
          {venueName(sourceVenue)} · <span className="ct-mono" title={sourceAccount}>{shortAccount(sourceAccount, 8, 6)}</span>
        </span>
      )}
      closeLabel="Close copy setup"
      onClose={busy ? undefined : onClose}
      footer={(
        <>
          <Btn variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={busy || !canStart} onClick={start}>
            {busy ? <Spinner size={14} /> : <Icon name={editing ? 'check' : 'play'} size={16} />}
            {editing ? 'Save budget' : 'Start copying'}
          </Btn>
        </>
      )}
    >
      {!sourceCopyable && (
        <Notice tone="warning">{venueName(sourceVenue)} does not publish the live position stream ClashBot needs to copy this trader yet.</Notice>
      )}

      {!editing && (
        <section className="ct-card ct-card-pad">
          <h3 className="ct-section-title" style={{ fontSize: 14 }}>Copy into</h3>
          <div className="ct-venue-grid" role="radiogroup" aria-label="Destination exchange" style={{ marginTop: 8 }}>
            {COPY_DESTINATION_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={venue === id}
                className="ct-venue-option"
                disabled={busy || paused.has(id)}
                onClick={() => setVenue(id)}
              >
                <VenueLogo venue={id} size={20} />
                <span className="ct-grow">{venueName(id)}</span>
                {paused.has(id) ? <span className="ct-chip ct-chip--muted">Paused</span> : venue === id ? <Icon name="check" size={14} /> : null}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="ct-card ct-card-pad">
        <NumberField label="Margin to allocate" prefix="$" value={budget} onChange={setBudget} error={budgetError}
          hint="ClashBot sizes every copied position to this budget relative to the trader's account and never commits more than it." />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {BUDGET_PRESETS.map((value) => (
            <Btn key={value} size="sm" variant={budgetValue === value ? 'neutral' : 'secondary'} onClick={() => setBudget(String(value))}>${value.toLocaleString()}</Btn>
          ))}
        </div>
      </section>

      <section className="ct-card ct-card-pad">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 className="ct-section-title" style={{ fontSize: 14, margin: 0 }}>If you had copied</h3>
          <Segmented size="sm" label="Projection window" value={days} onChange={setDays} options={WINDOWS} />
        </div>
        {history.loading ? (
          <span className="ct-field-hint"><Spinner size={12} /> Loading the trader's history…</span>
        ) : projection ? (
          <>
            <div className={`ct-tile-value ${positive ? 'ct-long' : 'ct-short'}`} style={{ fontSize: 24, marginTop: 8 }}>
              {money(projection.pnlUsd)} <span style={{ fontSize: 14 }}>({projection.percent >= 0 ? '+' : ''}{projection.percent.toFixed(1)}%)</span>
            </div>
            <Sparkline series={projection.series} positive={positive} />
            <p className="ct-field-hint" style={{ margin: 0 }}>
              ${budgetValue.toLocaleString()} following this trader over the last {days} days, scaled to the trader&apos;s account
              {projection.partial ? ` (${projection.coveredDays} of ${days} days have published history)` : ''}. Past results do not predict future returns; fees and slippage are not included.
            </p>
          </>
        ) : (
          <p className="ct-field-hint" style={{ margin: '8px 0 0' }}>Not enough published daily history or account equity to project this trader yet.</p>
        )}
      </section>

      {!editing && venue && connector && (
        <Notice tone="info">
          {saved == null ? <><Spinner size={12} /> Checking your {venueName(venue)} connection…</>
            : savedConnection ? `Uses your saved ${venueName(venue)} connection (${shortAccount(savedConnection.destinationAccount)}).`
              : <>Start copying authorises ClashBot to trade on {venueName(venue)}: {connector.label}</>}
        </Notice>
      )}
      <Notice tone="warning">Copy bots place real orders and can lose money. You can pause, stop or close everything at any time in My bots.</Notice>
      {progress && <Notice tone="info"><Spinner size={12} /> {progress}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}
