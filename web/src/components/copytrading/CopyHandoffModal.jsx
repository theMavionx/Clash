import { useEffect, useMemo, useState } from 'react';
import {
  CLASHBOT_COPY_URL,
  COPYABLE_SOURCE_VENUES,
  COPY_DESTINATION_VENUES,
  clashbotTraderUrl,
  venueName,
} from './constants';
import { fetchCopyServiceStatus, fetchTraderSummary } from './copyTradingApi';
import { compactCurrency, plainPercent, shortAccount, signedCurrency, signedPercent } from './format';
import CopyScore from './CopyScore';
import { Btn, Icon, Modal, Notice, Spinner, VenueLogo } from './ui';

function destinationState(venue, controls, capabilities) {
  const control = controls.get(venue);
  const capability = capabilities.get(venue);
  if (control && (!control.supported || !control.enabled)) return { tone: 'muted', label: 'Paused' };
  if (capability?.state === 'ready') return { tone: 'long', label: 'Ready' };
  if (capability?.state === 'degraded') return { tone: 'warning', label: 'Degraded' };
  if (capability && capability.executionSupported === false) return { tone: 'muted', label: 'Unavailable' };
  if (capability?.state) return { tone: 'muted', label: capability.state };
  return { tone: 'muted', label: 'Unknown' };
}

/**
 * Copy hand-off. ClashBot creates and controls copy bots only behind a wallet
 * sign-in bound to its own origin (copy.clashbot.fun), and live trading access
 * is authorised in its venue-specific wallet flows. Rather than spoof that
 * origin or handle trading keys in the game, the in-game Copy action shows
 * the decision data and opens ClashBot on this exact trader.
 */
export default function CopyHandoffModal({ token, trader, onClose }) {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const sourceCopyable = COPYABLE_SOURCE_VENUES.has(trader.venue);

  useEffect(() => {
    const controller = new AbortController();
    fetchCopyServiceStatus(token, controller.signal).then(setStatus).catch(() => setStatus({}));
    fetchTraderSummary(token, trader.venue, trader.account, controller.signal).then(setSummary).catch(() => {});
    return () => controller.abort();
  }, [token, trader.venue, trader.account]);

  const controls = useMemo(
    () => new Map((status?.venueControls?.copyDestinations || []).map((item) => [item.venue, item])),
    [status],
  );
  const capabilities = useMemo(
    () => new Map((status?.capabilities || []).map((item) => [item.venue, item])),
    [status],
  );
  const sourceCapability = capabilities.get(trader.venue);
  const metric = summary?.metric || null;
  const minimumCopyBalance = trader.minimumCopyBalanceUsd ?? metric?.minimumCopyBalanceUsd ?? null;
  const score = trader.copyScore ?? metric?.copyScore ?? null;
  const scoreDetails = trader.copyScoreDetails ?? metric?.copyScoreDetails ?? null;
  const name = trader.displayName?.trim() || shortAccount(trader.account);
  const href = clashbotTraderUrl(trader.venue, trader.account);

  return (
    <Modal
      size="md"
      title={`Copy ${name}`}
      subtitle={(
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <VenueLogo venue={trader.venue} size={14} />
          {venueName(trader.venue)} · <span className="ct-mono" title={trader.account}>{shortAccount(trader.account, 8, 6)}</span>
        </span>
      )}
      closeLabel="Close copy"
      onClose={onClose}
      footer={(
        <>
          <Btn variant="ghost" onClick={onClose}>Not now</Btn>
          {sourceCopyable ? (
            <a className="ct-btn ct-btn--primary ct-btn--md" href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              Continue on ClashBot
              <Icon name="external" size={16} />
            </a>
          ) : (
            <Btn variant="primary" disabled>Copy unavailable</Btn>
          )}
        </>
      )}
    >
      {!sourceCopyable && (
        <Notice tone="warning">
          {venueName(trader.venue)} does not publish the live position stream ClashBot needs to copy a trader yet. You can still analyse this trader.
        </Notice>
      )}

      <section className="ct-card ct-card-pad">
        <div className="ct-stat-grid">
          <div className="ct-tile"><div className="ct-caption">Copy score</div><div className="ct-tile-value" style={{ fontSize: 16 }}><CopyScore value={score} details={scoreDetails} /></div></div>
          <div className="ct-tile">
            <div className="ct-caption">PnL</div>
            <div className={`ct-tile-value ${trader.pnlUsd == null ? '' : trader.pnlUsd >= 0 ? 'ct-long' : 'ct-short'}`} style={{ fontSize: 16 }}>{signedCurrency(trader.pnlUsd ?? metric?.pnlUsd)}</div>
          </div>
          <div className="ct-tile">
            <div className="ct-caption">ROI</div>
            <div className={`ct-tile-value ${trader.roiPercent == null ? '' : trader.roiPercent >= 0 ? 'ct-long' : 'ct-short'}`} style={{ fontSize: 16 }}>{signedPercent(trader.roiPercent ?? metric?.roiPercent)}</div>
          </div>
          <div className="ct-tile"><div className="ct-caption">Win rate</div><div className="ct-tile-value" style={{ fontSize: 16 }}>{plainPercent(trader.winRatePercent ?? metric?.winRatePercent)}</div></div>
        </div>
        <div className="ct-summary-row" style={{ marginTop: 8 }}>
          <span>Minimum copy balance</span>
          <span>{compactCurrency(minimumCopyBalance)}</span>
        </div>
        <div className="ct-summary-row">
          <span>Signal source</span>
          <span>{sourceCapability ? `${venueName(trader.venue)} · ${sourceCapability.transport || 'stream'} · ~${Math.round((sourceCapability.targetLatencyMs || 0) / 100) / 10}s target` : venueName(trader.venue)}</span>
        </div>
      </section>

      <section className="ct-card ct-card-pad">
        <h3 className="ct-section-title" style={{ fontSize: 14 }}>Where ClashBot can execute</h3>
        <p className="ct-field-hint" style={{ margin: '2px 0 10px' }}>Copies are mapped by base asset; markets missing on the destination are skipped.</p>
        {status == null ? (
          <span className="ct-field-hint"><Spinner size={12} /> Checking execution status…</span>
        ) : (
          <div className="ct-venue-grid">
            {COPY_DESTINATION_VENUES.filter((venue) => controls.has(venue) || capabilities.has(venue)).map((venue) => {
              const state = destinationState(venue, controls, capabilities);
              return (
                <div key={venue} className="ct-venue-option" style={{ cursor: 'default' }}>
                  <VenueLogo venue={venue} size={20} />
                  <span className="ct-grow">{venueName(venue)}</span>
                  <span className={`ct-chip ct-chip--${state.tone}`}>{state.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Notice tone="info">
        <strong>Copy bots are created on ClashBot.</strong> Sign in with your wallet there, choose practice (dry-run) or live mode,
        set your budget and risk limits, and authorise trading access for the destination exchange. ClashBot keeps running
        your bot after you close the game.
      </Notice>
      <p className="ct-field-hint" style={{ margin: 0 }}>
        Opens <span className="ct-mono">{new URL(CLASHBOT_COPY_URL).host}</span> in a new tab with this trader&apos;s analysis and Copy button ready.
      </p>
    </Modal>
  );
}
