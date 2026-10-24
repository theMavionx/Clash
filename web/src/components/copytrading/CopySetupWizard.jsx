import { useEffect, useMemo, useState } from 'react';
import { COPYABLE_SOURCE_VENUES, venueName } from './constants';
import { createCopyBot, savedCopyConnections, setCopyBotStatus, updateCopyBot } from './copyBotsApi';
import { fetchCopyServiceStatus, friendlyCopyError } from './copyTradingApi';
import { GAME_COPY_DESTINATIONS, defaultDestinationAccount, obtainTradeOnlyCredential } from './copyConnections';
import { shortAccount } from './format';
import { Btn, Icon, Modal, Notice, NumberField, Select, Spinner, TextField, Toggle, VenueLogo } from './ui';

const STEPS = ['Mode & exchange', 'Budget & risk', 'Authorise & review'];

/** Wizard defaults mirror ClashBot's CopyTradingSetupModal (simple mode). */
const DEFAULTS = {
  allocationUsd: '500', smartScalePercent: '100', maxOpenPositions: '8', leverageMode: 'follow_capped', leverageCap: '10',
  fixedLeverage: '3', direction: 'both', takeProfitEnabled: false, takeProfitPercent: '30', stopLossEnabled: false,
  stopLossPercent: '15', traderStopEnabled: false, traderStopPercent: '20', dailyLossEnabled: false, dailyLossPercent: '7.5',
  maxSlippagePercent: '0.5', copyPositionAdds: true, copyPartialCloses: true, closeOnReverse: true, stopBehavior: 'manual',
};

function formFromConfig(config) {
  const text = (value, fallback) => (value == null ? fallback : String(value));
  return {
    allocationUsd: text(config.allocationUsd, DEFAULTS.allocationUsd),
    smartScalePercent: text(config.smartScalePercent, DEFAULTS.smartScalePercent),
    maxOpenPositions: text(config.maxOpenPositions, DEFAULTS.maxOpenPositions),
    leverageMode: config.leverageMode === 'fixed' ? 'fixed' : 'follow_capped',
    leverageCap: text(config.leverageCap, DEFAULTS.leverageCap),
    fixedLeverage: text(config.fixedLeverage, DEFAULTS.fixedLeverage),
    direction: config.direction || 'both',
    takeProfitEnabled: config.takeProfitEnabled === true,
    takeProfitPercent: text(config.takeProfitPercent, DEFAULTS.takeProfitPercent),
    stopLossEnabled: config.stopLossEnabled === true,
    stopLossPercent: text(config.stopLossPercent, DEFAULTS.stopLossPercent),
    traderStopEnabled: config.traderStopEnabled === true,
    traderStopPercent: text(config.traderStopPercent, DEFAULTS.traderStopPercent),
    dailyLossEnabled: config.dailyLossEnabled === true,
    dailyLossPercent: text(config.dailyLossPercent, DEFAULTS.dailyLossPercent),
    maxSlippagePercent: text(config.maxSlippagePercent, DEFAULTS.maxSlippagePercent),
    copyPositionAdds: config.copyPositionAdds !== false,
    copyPartialCloses: config.copyPartialCloses !== false,
    closeOnReverse: config.closeOnReverse !== false,
    stopBehavior: ['follow', 'market', 'manual'].includes(config.stopBehavior) ? config.stopBehavior : 'manual',
  };
}

const RULES = {
  allocationUsd: [1, 100_000_000, 'Budget'],
  smartScalePercent: [1, 500, 'Risk scale'],
  maxOpenPositions: [1, 100, 'Open positions', true],
  leverageCap: [1, 100, 'Leverage cap'],
  fixedLeverage: [1, 100, 'Fixed leverage'],
  takeProfitPercent: [0.1, 1000, 'Take profit'],
  stopLossPercent: [0.1, 100, 'Stop loss'],
  traderStopPercent: [0.1, 100, 'Trader stop'],
  dailyLossPercent: [0.1, 100, 'Daily loss stop'],
  maxSlippagePercent: [0.01, 10, 'Max slippage'],
};

function validate(form) {
  const errors = {};
  for (const [field, [min, max, label, integer]] of Object.entries(RULES)) {
    const value = Number(form[field]);
    if (form[field] === '' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      errors[field] = `${label} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max.toLocaleString()}`;
    }
  }
  return errors;
}

/** Full ClashBot risk config: defaults of the simple preset, overridden by the wizard (and the saved bot on edit). */
function buildConfig(form, base = {}) {
  const n = (field) => Number(form[field]);
  const allocation = n('allocationUsd');
  return {
    sizeMode: 'smart', proportionalMultiplier: 0.1, fixedMarginUsd: 50, portfolioPercent: 2,
    reservePercent: 0, minMarginUsd: 0, maxDailyMarginEnabled: false, maxOpenPositionsEnabled: true,
    consecutiveLossLimit: 4, cooldownHours: 12, assetMode: 'all', assets: [], processingWindowEnabled: true,
    maxSignalAgeSeconds: 60, skipExistingPositions: true, skipUnsupportedMarkets: true, minimumOrderPolicy: 'skip',
    maxMinimumOrderOversizePercent: 0, allowLateEntryIfPriceUnchanged: false, orderStyle: 'always_taker',
    makerFallbackPolicy: 'taker', makerRestSeconds: 120,
    ...base,
    editorPreferences: { setupMode: 'simple', simpleBalancePercent: 100, simpleRiskScaleOverrideEnabled: true, simplePositionLimitOverrideEnabled: true },
    smartScalePercent: n('smartScalePercent'),
    allocationUsd: allocation,
    maxMarginUsd: Math.min(allocation, 10_000_000),
    maxDailyMarginUsd: allocation,
    maxAssetMarginUsd: allocation,
    maxOpenPositions: n('maxOpenPositions'),
    leverageMode: form.leverageMode,
    leverageCap: n('leverageCap'),
    fixedLeverage: n('fixedLeverage'),
    direction: form.direction,
    takeProfitEnabled: form.takeProfitEnabled,
    takeProfitPercent: n('takeProfitPercent'),
    stopLossEnabled: form.stopLossEnabled,
    stopLossPercent: n('stopLossPercent'),
    traderStopEnabled: form.traderStopEnabled,
    traderStopPercent: n('traderStopPercent'),
    dailyLossEnabled: form.dailyLossEnabled,
    dailyLossPercent: n('dailyLossPercent'),
    maxSlippagePercent: n('maxSlippagePercent'),
    maxWorseEntryPercent: n('maxSlippagePercent'),
    copyPositionAdds: form.copyPositionAdds,
    copyPartialCloses: form.copyPartialCloses,
    closeOnReverse: form.closeOnReverse,
    stopBehavior: form.stopBehavior,
  };
}

/**
 * Native in-game copy bot setup (replaces the ClashBot hand-off). The trader is
 * preselected; the player picks practice or live, the destination exchange,
 * budget, leverage cap and risk limits, then authorises a trade-only key for
 * ClashBot. `editBot` switches the wizard to editing an existing bot.
 */
export default function CopySetupWizard({ token, trader, editBot, player, walletCtx, onClose, onSaved }) {
  const editing = Boolean(editBot);
  const sourceVenue = editing ? editBot.sourceVenue : trader.venue;
  const sourceAccount = editing ? editBot.sourceAccount : trader.account;
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState(editing ? editBot.executionMode : 'dry_run');
  const [venue, setVenue] = useState(editing ? editBot.destinationVenue : '');
  const [account, setAccount] = useState(editing ? editBot.destinationAccount : '');
  const [form, setForm] = useState(() => formFromConfig(editing ? editBot.config || {} : {}));
  const [startNow, setStartNow] = useState(true);
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(null);
  const [useSaved, setUseSaved] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const errors = useMemo(() => validate(form), [form]);
  const sourceCopyable = COPYABLE_SOURCE_VENUES.has(sourceVenue);

  useEffect(() => {
    const controller = new AbortController();
    fetchCopyServiceStatus(token, controller.signal).then(setStatus).catch(() => setStatus({}));
    return () => controller.abort();
  }, [token]);

  const destinations = useMemo(() => {
    const controls = new Map((status?.venueControls?.copyDestinations || []).map((item) => [item.venue, item]));
    return Object.keys(GAME_COPY_DESTINATIONS).map((id) => {
      const control = controls.get(id);
      const paused = control ? (!control.supported || !control.enabled) : false;
      return { id, paused };
    });
  }, [status]);

  useEffect(() => {
    if (editing || !venue) return;
    setAccount(defaultDestinationAccount(venue, player, walletCtx));
  }, [venue, editing, player, walletCtx]);

  useEffect(() => {
    if (editing || !venue) { setSaved(null); return undefined; }
    let cancelled = false;
    setSaved(null);
    setUseSaved('');
    savedCopyConnections(token, venue)
      .then((payload) => { if (!cancelled) setSaved(Array.isArray(payload?.items) ? payload.items : []); })
      .catch(() => { if (!cancelled) setSaved([]); });
    return () => { cancelled = true; };
  }, [token, venue, editing]);

  const savedForAccount = (saved || []).filter((item) => !account || String(item.destinationAccount).toLowerCase() === account.toLowerCase());
  const set = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));
  const stepValid = [
    Boolean(venue && account && sourceCopyable),
    Object.keys(errors).length === 0,
    editing || Boolean(useSaved) || consent,
  ];

  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (editing) {
        const result = await updateCopyBot(token, editBot.id, {
          executionMode: mode, config: buildConfig(form, editBot.config), expectedConfigRevision: editBot.configRevision,
        });
        onSaved?.(result?.item || null, 'updated');
        return;
      }
      const body = {
        sourceVenue, sourceAccount, destinationVenue: venue, destinationAccount: account,
        executionMode: mode, config: buildConfig(form),
      };
      if (useSaved) {
        body.connectionId = useSaved;
      } else {
        setProgress('Preparing the trade-only connection…');
        body.credential = await obtainTradeOnlyCredential({ venue, owner: account, walletCtx, onProgress: setProgress });
      }
      setProgress('Creating your copy bot on ClashBot…');
      const created = await createCopyBot(token, body);
      delete body.credential;
      let item = created?.item || null;
      if (item && startNow) {
        setProgress('Starting…');
        try {
          item = (await setCopyBotStatus(token, item.id, 'active'))?.item || item;
        } catch (startError) {
          onSaved?.(item, 'created', friendlyCopyError(startError, 'The bot was created but could not start.'));
          return;
        }
      }
      onSaved?.(item, 'created');
    } catch (submitError) {
      setError(friendlyCopyError(submitError, 'Copy bot could not be saved.'));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const name = editing ? shortAccount(sourceAccount) : (trader.displayName?.trim() || shortAccount(trader.account));
  const destinationInfo = GAME_COPY_DESTINATIONS[venue];

  return (
    <Modal
      size="lg"
      title={editing ? `Edit copy bot #${editBot.id}` : `Copy ${name}`}
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
          {step > 0 ? <Btn variant="ghost" disabled={busy} onClick={() => setStep(step - 1)}>Back</Btn> : <Btn variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn>}
          {step < STEPS.length - 1 ? (
            <Btn variant="primary" disabled={!stepValid[step]} onClick={() => setStep(step + 1)}>Continue</Btn>
          ) : (
            <Btn variant="primary" disabled={busy || !stepValid.every(Boolean)} onClick={submit}>
              {busy ? <Spinner size={14} /> : <Icon name={editing ? 'check' : 'bot'} size={16} />}
              {editing ? 'Save changes' : useSaved ? 'Create copy bot' : 'Authorise ClashBot & create'}
            </Btn>
          )}
        </>
      )}
    >
      <div className="ct-steps" role="tablist" aria-label="Copy setup steps">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={step === index}
            className={`ct-step ${step === index ? 'is-current' : ''} ${index < step ? 'is-done' : ''}`}
            disabled={busy || index > step && !stepValid.slice(0, index).every(Boolean)}
            onClick={() => setStep(index)}
          >
            <span className="ct-step-num">{index < step ? <Icon name="check" size={11} /> : index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {!sourceCopyable && (
        <Notice tone="warning">{venueName(sourceVenue)} does not publish the live position stream ClashBot needs to copy this trader yet.</Notice>
      )}

      {step === 0 && (
        <>
          <section className="ct-card ct-card-pad">
            <h3 className="ct-section-title" style={{ fontSize: 14 }}>Mode</h3>
            <div className="ct-choice-grid" role="radiogroup" aria-label="Copy mode" style={{ marginTop: 8 }}>
              <button type="button" role="radio" aria-checked={mode === 'dry_run'} className="ct-choice" onClick={() => setMode('dry_run')}>
                <strong>Practice</strong>
                <span>ClashBot follows every trade and sizes it against your real balance, but never sends an order. Use it to see how the trader fits your account.</span>
              </button>
              <button type="button" role="radio" aria-checked={mode === 'live'} className="ct-choice" onClick={() => setMode('live')}>
                <strong>Live</strong>
                <span>ClashBot places real orders on your exchange account with your limits. You can pause, stop or close everything at any time.</span>
              </button>
            </div>
          </section>
          <section className="ct-card ct-card-pad">
            <h3 className="ct-section-title" style={{ fontSize: 14 }}>Copy into</h3>
            <p className="ct-field-hint" style={{ margin: '2px 0 10px' }}>Copies are mapped by base asset; markets missing on the destination are skipped.</p>
            <div className="ct-venue-grid" role="radiogroup" aria-label="Destination exchange">
              {destinations.map(({ id, paused }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={venue === id}
                  className="ct-venue-option"
                  disabled={editing || paused}
                  onClick={() => setVenue(id)}
                >
                  <VenueLogo venue={id} size={20} />
                  <span className="ct-grow">{venueName(id)}</span>
                  {paused ? <span className="ct-chip ct-chip--muted">Paused</span> : venue === id ? <Icon name="check" size={14} /> : null}
                </button>
              ))}
            </div>
            {venue && (
              <div style={{ marginTop: 12 }}>
                <TextField
                  label={destinationInfo?.chain === 'solana' ? 'Your BULK (Solana) wallet' : `Your ${venueName(venue)} wallet`}
                  value={account}
                  onChange={editing ? () => {} : setAccount}
                  mono
                  hint="The account ClashBot trades on. It must be the wallet connected to this exchange in the game."
                />
              </div>
            )}
            <p className="ct-field-hint" style={{ margin: '10px 0 0' }}>
              Lighter, GRVT, Decibel, Ondo, GMX, Phoenix and the other ClashBot venues still need their exchange-specific
              onboarding and are not available in the game yet.
            </p>
          </section>
        </>
      )}

      {step === 1 && (
        <section className="ct-card ct-card-pad">
          <div className="ct-form-grid">
            <NumberField label="Copy budget" prefix="$" value={form.allocationUsd} onChange={set('allocationUsd')} error={errors.allocationUsd}
              hint="Capital this bot may use. Each copied position is scaled to the trader's position size relative to their account." />
            <NumberField label="Risk scale" suffix="%" value={form.smartScalePercent} onChange={set('smartScalePercent')} error={errors.smartScalePercent}
              hint="100% copies at the trader's proportion; 50% halves every position." />
            <NumberField label="Max open positions" step="1" value={form.maxOpenPositions} onChange={set('maxOpenPositions')} error={errors.maxOpenPositions} />
            <Select label="Direction" value={form.direction} onChange={set('direction')}
              options={[{ value: 'both', label: 'Long and short' }, { value: 'long', label: 'Long only' }, { value: 'short', label: 'Short only' }]} />
            <Select label="Leverage" value={form.leverageMode} onChange={set('leverageMode')}
              options={[{ value: 'follow_capped', label: 'Follow trader, capped' }, { value: 'fixed', label: 'Fixed leverage' }]} />
            {form.leverageMode === 'fixed' ? (
              <NumberField label="Fixed leverage" suffix="x" value={form.fixedLeverage} onChange={set('fixedLeverage')} error={errors.fixedLeverage} />
            ) : (
              <NumberField label="Leverage cap" suffix="x" value={form.leverageCap} onChange={set('leverageCap')} error={errors.leverageCap} />
            )}
            <NumberField label="Max slippage" suffix="%" value={form.maxSlippagePercent} onChange={set('maxSlippagePercent')} error={errors.maxSlippagePercent}
              hint="Openings are skipped when the price moved further than this from the trader's fill." />
            <Select label="When you stop the bot" value={form.stopBehavior} onChange={set('stopBehavior')}
              options={[
                { value: 'manual', label: 'Keep positions open' },
                { value: 'follow', label: "Follow the trader's closes" },
                { value: 'market', label: 'Close everything at market' },
              ]} />
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <Toggle label="Take profit" description={`Close a copied position at +${form.takeProfitPercent || '?'}% ROE.`} checked={form.takeProfitEnabled} onChange={set('takeProfitEnabled')} />
            {form.takeProfitEnabled && <NumberField label="Take profit" suffix="%" value={form.takeProfitPercent} onChange={set('takeProfitPercent')} error={errors.takeProfitPercent} />}
            <Toggle label="Stop loss" description={`Close a copied position at -${form.stopLossPercent || '?'}% ROE.`} checked={form.stopLossEnabled} onChange={set('stopLossEnabled')} />
            {form.stopLossEnabled && <NumberField label="Stop loss" suffix="%" value={form.stopLossPercent} onChange={set('stopLossPercent')} error={errors.stopLossPercent} />}
            <Toggle label="Daily loss stop" description="Pause the bot after this loss of the budget in one day." checked={form.dailyLossEnabled} onChange={set('dailyLossEnabled')} />
            {form.dailyLossEnabled && <NumberField label="Daily loss stop" suffix="%" value={form.dailyLossPercent} onChange={set('dailyLossPercent')} error={errors.dailyLossPercent} />}
            <Toggle label="Trader drawdown stop" description="Pause when the trader's own account drops by this much." checked={form.traderStopEnabled} onChange={set('traderStopEnabled')} />
            {form.traderStopEnabled && <NumberField label="Trader drawdown stop" suffix="%" value={form.traderStopPercent} onChange={set('traderStopPercent')} error={errors.traderStopPercent} />}
            <Toggle label="Copy position adds" checked={form.copyPositionAdds} onChange={set('copyPositionAdds')} />
            <Toggle label="Copy partial closes" checked={form.copyPartialCloses} onChange={set('copyPartialCloses')} />
            <Toggle label="Follow reversals" checked={form.closeOnReverse} onChange={set('closeOnReverse')} />
          </div>
        </section>
      )}

      {step === 2 && (
        <>
          <section className="ct-card ct-card-pad">
            <div className="ct-summary-row"><span>Trader</span><span>{venueName(sourceVenue)} · {shortAccount(sourceAccount)}</span></div>
            <div className="ct-summary-row"><span>Mode</span><span>{mode === 'live' ? 'Live' : 'Practice (no orders)'}</span></div>
            <div className="ct-summary-row"><span>Copy into</span><span>{venueName(venue)} · {shortAccount(account)}</span></div>
            <div className="ct-summary-row"><span>Budget</span><span>${Number(form.allocationUsd).toLocaleString()}</span></div>
            <div className="ct-summary-row"><span>Risk scale</span><span>{form.smartScalePercent}%</span></div>
            <div className="ct-summary-row"><span>Leverage</span><span>{form.leverageMode === 'fixed' ? `${form.fixedLeverage}x fixed` : `Follow, max ${form.leverageCap}x`}</span></div>
            <div className="ct-summary-row"><span>Limits</span><span>{[
              form.takeProfitEnabled && `TP ${form.takeProfitPercent}%`, form.stopLossEnabled && `SL ${form.stopLossPercent}%`,
              form.dailyLossEnabled && `Daily ${form.dailyLossPercent}%`, `${form.maxOpenPositions} positions`,
            ].filter(Boolean).join(' · ')}</span></div>
          </section>

          {!editing && (
            <section className="ct-card ct-card-pad">
              <h3 className="ct-section-title" style={{ fontSize: 14 }}>Trading access for ClashBot</h3>
              {saved == null ? (
                <span className="ct-field-hint"><Spinner size={12} /> Checking saved connections…</span>
              ) : savedForAccount.length > 0 && (
                <Select
                  label="Connection"
                  value={useSaved}
                  onChange={setUseSaved}
                  options={[
                    { value: '', label: 'Authorise a new connection' },
                    ...savedForAccount.filter((item) => item.reusableForNewBot !== false).map((item) => ({
                      value: item.connectionId, label: `Saved ${venueName(item.destinationVenue || venue)} connection · ${shortAccount(item.destinationAccount)}`,
                    })),
                  ]}
                />
              )}
              {!useSaved && (
                <>
                  <p className="ct-field-hint" style={{ margin: '8px 0' }}>{destinationInfo?.authorize}</p>
                  <Toggle
                    label="Authorise ClashBot to trade this account"
                    description="The trade-only key is sent once from the game server to ClashBot over an authenticated channel and stored encrypted for your game account only. It can never withdraw. Deleting the bot removes it."
                    checked={consent}
                    onChange={setConsent}
                  />
                </>
              )}
              <div style={{ marginTop: 8 }}>
                <Toggle label="Start immediately" description="Otherwise the bot is created paused." checked={startNow} onChange={setStartNow} />
              </div>
            </section>
          )}

          {mode === 'live' && (
            <Notice tone="warning">Live copy trading places real orders and can lose money. Past performance of a trader does not predict future results.</Notice>
          )}
          {progress && <Notice tone="info"><Spinner size={12} /> {progress}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </>
      )}
    </Modal>
  );
}
