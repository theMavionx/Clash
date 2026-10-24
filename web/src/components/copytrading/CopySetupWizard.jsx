import { useEffect, useMemo, useRef, useState } from 'react';
import { COPYABLE_SOURCE_VENUES, venueName } from './constants';
import { createCopyBot, savedCopyConnections, setCopyBotStatus, updateCopyBot } from './copyBotsApi';
import { fetchCopyServiceStatus, fetchTraderDailyAnalytics, fetchTraderSourceSnapshot, friendlyCopyError } from './copyTradingApi';
import { COPY_CONNECTORS, COPY_DESTINATION_IDS } from './connectors';
import { COPY_BOT_STEPS, copyStartSteps } from './connectors/steps';
import { projectCopyOutcome, simpleCopyConfig } from './copySimpleMode';
import { fetchCopyVenueBalance } from './copyVenueBalance';
import { shortAccount } from './format';
import { Btn, Icon, Modal, Notice, NumberField, Segmented, Spinner, VenueLogo } from './ui';
import { rangeProgress } from '../../styles/theme';

const PERCENT_PRESETS = [25, 50, 75, 100];
const DEFAULT_PERCENT = 50;
const MIN_BUDGET_USD = 1;
const MAX_BUDGET_USD = 100_000_000;
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

function usd(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** ClashBot CopyTradingSetupModal "Connection progress": done / in progress / error + retry / pending. */
function ConnectionSteps({ steps, stage, progress, busy, onRetry }) {
  const activeIndex = stage ? steps.findIndex((step) => step.id === stage.id) : -1;
  return (
    <section className="ct-conn" role="status" aria-live="polite" aria-label="Connection progress">
      <div className="ct-conn-title">Connection progress</div>
      <ol className="ct-conn-list">
        {steps.map((step, index) => {
          const done = stage?.id === 'done' || index < activeIndex;
          const active = index === activeIndex && !done;
          const failed = active && stage?.failed;
          const state = done ? 'is-done' : failed ? 'is-error' : active ? 'is-active' : '';
          return (
            <li key={step.id} className={`ct-conn-step ${state}`} aria-current={active ? 'step' : undefined}>
              <span className="ct-conn-mark" aria-hidden="true">
                {done ? <Icon name="check" size={12} strokeWidth={2.5} />
                  : failed ? <Icon name="alert" size={12} />
                    : active ? <Spinner size={12} />
                      : index + 1}
              </span>
              <span className="ct-conn-text">
                <span>{step.label}</span>
                {active && !failed && progress && <span className="ct-conn-detail">{progress}</span>}
              </span>
              <span className="ct-sr-only">{done ? 'done' : failed ? 'failed' : active ? 'in progress' : 'pending'}</span>
              {failed && !busy && (
                <Btn size="sm" variant="secondary" onClick={onRetry}><Icon name="refresh" size={12} /> Retry</Btn>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Simple in-game copy setup (ClashBot simple mode): choose where to copy, pick
 * what share of that venue's available margin to commit, see what that budget
 * would have made following this trader, then one "Start copying" button that
 * walks the venue's connection steps, creates the live bot and starts it.
 * `editBot` changes the budget of an existing bot.
 */
export default function CopySetupWizard({ token, trader, editBot, player, walletCtx, onClose, onSaved }) {
  const editing = Boolean(editBot);
  const sourceVenue = editing ? editBot.sourceVenue : trader.venue;
  const sourceAccount = editing ? editBot.sourceAccount : trader.account;
  const currentBudget = editing ? Number(editBot.config?.allocationUsd) || 0 : 0;
  const [venue, setVenue] = useState(editing ? editBot.destinationVenue : '');
  const [manualBudget, setManualBudget] = useState(String(editing ? editBot.config?.allocationUsd ?? 100 : 100));
  const [percent, setPercent] = useState(DEFAULT_PERCENT);
  const [balance, setBalance] = useState({ status: 'idle' });
  const [days, setDays] = useState(30);
  const [status, setStatus] = useState(null);
  const [saved, setSaved] = useState(null);
  const [history, setHistory] = useState({ loading: true, points: [], equityUsd: null });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [stage, setStage] = useState(null);
  const [error, setError] = useState('');
  const percentTouched = useRef(false);
  const sourceCopyable = COPYABLE_SOURCE_VENUES.has(sourceVenue);

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

  // The saved-connection lookup decides whether Start copying must connect the venue
  // first; it is not shown as text.
  useEffect(() => {
    if (editing || !venue) { setSaved(null); return undefined; }
    let cancelled = false;
    setSaved(null);
    savedCopyConnections(token, venue)
      .then((payload) => { if (!cancelled) setSaved((payload?.items || []).filter((item) => item.reusableForNewBot !== false)); })
      .catch(() => { if (!cancelled) setSaved([]); });
    return () => { cancelled = true; };
  }, [token, venue, editing]);

  const savedConnection = saved?.[0] || null;
  const balanceAccount = editing ? editBot.destinationAccount : savedConnection?.destinationAccount;
  const walletKey = [walletCtx?.evmWalletAddress, walletCtx?.walletAddress, walletCtx?.solanaWalletAddress,
    walletCtx?.solWallet?.publicKey?.toBase58?.(), walletCtx?.aptosWallet?.address, walletCtx?.aptosWalletAddress].map((value) => String(value || '')).join('|');
  const walletRef = useRef(walletCtx);
  walletRef.current = walletCtx;
  const playerRef = useRef(player);
  playerRef.current = player;

  // Available margin on the destination, from the same reads the game's Futures terminal uses.
  useEffect(() => {
    if (!venue || (!editing && saved == null)) { setBalance({ status: 'idle' }); return undefined; }
    const controller = new AbortController();
    setBalance({ status: 'loading' });
    fetchCopyVenueBalance({
      venue, token, player: playerRef.current, walletCtx: walletRef.current, account: balanceAccount, signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) setBalance({ status: 'ready', availableUsd: result.availableUsd, account: result.account });
    }).catch((readError) => {
      if (!controller.signal.aborted) setBalance({ status: 'error', error: readError?.message || 'Balance unavailable' });
    });
    return () => controller.abort();
  }, [venue, token, editing, saved, balanceAccount, walletKey]);

  // Slider base: the available margin (an edited bot may already commit more than is free now).
  const sliderBase = balance.status === 'ready' ? Math.max(balance.availableUsd, editing ? currentBudget : 0) : 0;
  const useSlider = balance.status === 'ready' && sliderBase > 0;
  const noMargin = balance.status === 'ready' && sliderBase <= 0;

  useEffect(() => {
    if (!editing || !useSlider || percentTouched.current) return;
    setPercent(Math.min(100, Math.max(1, Math.round((currentBudget / sliderBase) * 100))));
  }, [editing, useSlider, currentBudget, sliderBase]);

  const sliderBudget = Math.floor(sliderBase * percent) / 100;
  const budgetValue = useSlider ? sliderBudget : Number(manualBudget);
  const budgetError = noMargin || balance.status === 'loading' || balance.status === 'idle' ? ''
    : useSlider
      ? (budgetValue < MIN_BUDGET_USD ? `Allocate at least $${MIN_BUDGET_USD}` : '')
      : (manualBudget === '' || !Number.isFinite(budgetValue) || budgetValue < MIN_BUDGET_USD || budgetValue > MAX_BUDGET_USD
        ? `Enter a budget between $${MIN_BUDGET_USD} and $${MAX_BUDGET_USD.toLocaleString()}` : '');
  const budgetReady = !budgetError && !noMargin && (balance.status === 'ready' || balance.status === 'error');

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
  const canStart = sourceCopyable && budgetReady && (editing || (venue && connector && !paused.has(venue) && saved != null));
  const steps = useMemo(() => (editing || !venue || saved == null ? null
    : savedConnection ? COPY_BOT_STEPS : copyStartSteps(venue)), [editing, venue, saved, savedConnection]);

  function chooseVenue(id) {
    if (id === venue) return;
    setVenue(id);
    setStage(null);
    setError('');
    percentTouched.current = false;
    setPercent(DEFAULT_PERCENT);
  }

  function choosePercent(value) {
    percentTouched.current = true;
    setPercent(Math.min(100, Math.max(0, Math.round(Number(value) || 0))));
  }

  async function start() {
    setBusy(true);
    setError('');
    const enter = (id) => {
      setProgress('');
      setStage((current) => (steps?.some((step) => step.id === id) ? { id, failed: false } : current));
    };
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
        enter(steps?.[0]?.id || 'wallet');
        const connection = await connector.connect({
          token, player, walletCtx, onProgress: setProgress, onStage: enter, requiredAllocationUsd: budgetValue,
        });
        body.destinationAccount = connection.destinationAccount;
        body.credential = connection.credential;
        if (connection.ownerWallet) wallet = connection.ownerWallet;
      }
      enter('create');
      const created = await createCopyBot(token, body, wallet);
      delete body.credential;
      let item = created?.item || null;
      if (item) {
        enter('start');
        try {
          item = (await setCopyBotStatus(token, item.id, 'active'))?.item || item;
        } catch (startError) {
          onSaved?.(item, 'created', friendlyCopyError(startError, 'The bot was created but could not start.'));
          return;
        }
      }
      setStage({ id: 'done', failed: false });
      onSaved?.(item, 'created');
    } catch (startError) {
      setStage((current) => (current ? { ...current, failed: true } : current));
      setError(friendlyCopyError(startError, 'Copy bot could not be started.'));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const name = editing ? shortAccount(sourceAccount) : (trader.displayName?.trim() || shortAccount(trader.account));
  const positive = (projection?.pnlUsd ?? 0) >= 0;
  const retry = Boolean(stage?.failed);

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
            {busy ? <Spinner size={14} /> : <Icon name={editing ? 'check' : retry ? 'refresh' : 'play'} size={16} />}
            {editing ? 'Save budget' : retry ? 'Retry' : 'Start copying'}
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
                onClick={() => chooseVenue(id)}
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
        <h3 className="ct-section-title" style={{ fontSize: 14 }}>Margin to allocate</h3>
        {!venue ? (
          <p className="ct-field-hint" style={{ margin: '8px 0 0' }}>Choose an exchange to see your available margin.</p>
        ) : balance.status === 'loading' || balance.status === 'idle' ? (
          <p className="ct-field-hint" style={{ margin: '8px 0 0' }}><Spinner size={12} /> Reading your available margin on {venueName(venue)}…</p>
        ) : noMargin ? (
          <Notice tone="warning">No margin on {venueName(venue)} — deposit first.</Notice>
        ) : useSlider ? (
          <div className="ct-alloc">
            <div className="ct-alloc-head">
              <div className="ct-tile-value" style={{ fontSize: 24, margin: 0 }}>{usd(sliderBudget)}</div>
              <span className="ct-chip ct-chip--brand ct-num">{percent}%</span>
            </div>
            <input
              type="range" min="0" max="100" step="1" value={percent}
              aria-label={`Share of available ${venueName(venue)} margin`}
              aria-valuetext={`${percent}% · ${usd(sliderBudget)}`}
              style={rangeProgress(percent, 0, 100)}
              disabled={busy}
              onChange={(event) => choosePercent(event.target.value)}
            />
            <div className="ct-alloc-chips">
              {PERCENT_PRESETS.map((value) => (
                <Btn key={value} size="sm" variant={percent === value ? 'neutral' : 'secondary'} disabled={busy} onClick={() => choosePercent(value)}>{value}%</Btn>
              ))}
            </div>
            <div className="ct-alloc-meta">
              <span>Available on {venueName(venue)}</span>
              <span className="ct-num">{usd(balance.availableUsd)}</span>
            </div>
            {editing && currentBudget > 0 && (
              <div className="ct-alloc-meta">
                <span>Current budget</span>
                <span className="ct-num">{usd(currentBudget)}</span>
              </div>
            )}
            {budgetError && <span className="ct-field-error" role="alert">{budgetError}</span>}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <NumberField label={`Couldn't read your ${venueName(venue)} balance — enter a budget`} prefix="$" value={manualBudget}
              onChange={setManualBudget} error={budgetError} min={MIN_BUDGET_USD}
              hint="ClashBot sizes every copied position to this budget relative to the trader's account and never commits more than it." />
          </div>
        )}
      </section>

      <section className="ct-card ct-card-pad">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 className="ct-section-title" style={{ fontSize: 14, margin: 0 }}>If you had copied</h3>
          <Segmented size="sm" label="Projection window" value={days} onChange={setDays} options={WINDOWS} />
        </div>
        {history.loading ? (
          <span className="ct-field-hint"><Spinner size={12} /> Loading the trader&apos;s history…</span>
        ) : projection ? (
          <>
            <div className={`ct-tile-value ${positive ? 'ct-long' : 'ct-short'}`} style={{ fontSize: 24, marginTop: 8 }}>
              {money(projection.pnlUsd)} <span style={{ fontSize: 14 }}>({projection.percent >= 0 ? '+' : ''}{projection.percent.toFixed(1)}%)</span>
            </div>
            <Sparkline series={projection.series} positive={positive} />
            <p className="ct-field-hint" style={{ margin: 0 }}>
              {usd(budgetValue)} following this trader over the last {days} days, scaled to the trader&apos;s account
              {projection.partial ? ` (${projection.coveredDays} of ${days} days have published history)` : ''}. Past results do not predict future returns; fees and slippage are not included.
            </p>
          </>
        ) : (
          <p className="ct-field-hint" style={{ margin: '8px 0 0' }}>
            {budgetValue >= MIN_BUDGET_USD ? 'Not enough published daily history or account equity to project this trader yet.' : 'Choose a budget to see the projection.'}
          </p>
        )}
      </section>

      {steps && <ConnectionSteps steps={steps} stage={stage} progress={progress} busy={busy} onRetry={start} />}
      {!steps && progress && <Notice tone="info"><Spinner size={12} /> {progress}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}
