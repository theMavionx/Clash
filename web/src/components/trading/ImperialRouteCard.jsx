import { useEffect, useMemo, useState } from 'react';
import './ImperialRouteCard.css';

const VENUE_LABELS = {
  phoenix: 'Phoenix',
  jupiter: 'Jupiter',
  flash: 'Flash Trade',
  flash_v2: 'Flash V2',
  gmtrade: 'GMTrade',
  pairs: 'Pairs',
  touch: 'Touch',
};

const VENUE_MARKS = {
  phoenix: 'X',
  jupiter: 'J',
  flash: 'F',
  flash_v2: 'F2',
  gmtrade: 'G',
  pairs: 'P',
  touch: 'T',
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function venueKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[ -]+/g, '_');
}

function venueLabel(value) {
  const key = venueKey(value);
  return VENUE_LABELS[key] || String(value || 'Route');
}

function usd(value) {
  const amount = number(value);
  if (Math.abs(amount) >= 1000) return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (Math.abs(amount) >= 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(4)}`;
}

function bps(value, notional) {
  const base = number(notional);
  if (!(base > 0)) return '—';
  return `${(number(value) / base * 10_000).toFixed(2)} bps`;
}

function leverage(value) {
  const amount = number(value);
  if (!(amount > 0)) return '—';
  return `${amount >= 100 ? amount.toFixed(0) : amount.toFixed(1)}x`;
}

function candidateRows(quote) {
  const selected = venueKey(quote?.venue || quote?.underwriter || quote?.selectedVenue);
  const rows = Array.isArray(quote?.candidates) ? quote.candidates : [];
  if (rows.length) return rows;
  return selected ? [{
    venue: selected,
    expectedCostUsd: quote?.expectedCostUsd,
    costBreakdown: quote?.costBreakdown,
    maxLeverage: quote?.maxLeverage,
    requiredDeposit: quote?.requiredDeposit,
    loanSplit: quote?.loanSplit,
  }] : [];
}

function CostLine({ label, value, notional, suffix }) {
  return (
    <div className="imperial-route-cost-line">
      <span>{label}</span>
      <span className="imperial-route-cost-rate">{suffix || bps(value, notional)}</span>
      <strong>{usd(value)}</strong>
    </div>
  );
}

export default function ImperialRouteCard({
  quote,
  notional,
  requestedLeverage,
  holdHours = 24,
  boostEnabled,
  onBoostChange,
  profileIndex = 0,
  onProfileChange,
}) {
  const selectedVenue = venueKey(quote?.venue || quote?.underwriter || quote?.selectedVenue);
  const candidates = useMemo(() => candidateRows(quote), [quote]);
  const [expandedVenue, setExpandedVenue] = useState(selectedVenue);

  useEffect(() => {
    if (selectedVenue) setExpandedVenue(selectedVenue);
  }, [selectedVenue]);

  const selected = candidates.find(candidate => venueKey(candidate?.venue) === selectedVenue) || candidates[0] || null;
  const underlyingLeverage = number(selected?.loanSplit?.venueLeverage || selected?.maxLeverage || quote?.maxLeverage);
  const boostedLeverage = number(requestedLeverage);
  const showBoostArrow = boostEnabled && number(selected?.loanSplit?.loanAmountUsd || quote?.loanSplit?.loanAmountUsd) > 0
    && boostedLeverage > underlyingLeverage;

  return (
    <section className="imperial-route-card" aria-label="Imperial route comparison">
      <div className="imperial-route-card__header">
        <div className="imperial-route-card__title-wrap">
          <span className="imperial-route-card__eyebrow">IMPERIAL ROUTER</span>
          <div className="imperial-route-card__title">
            {selected ? (
              <>
                <span className={`imperial-venue-mark imperial-venue-mark--${selectedVenue}`} aria-hidden="true">
                  {VENUE_MARKS[selectedVenue] || venueLabel(selectedVenue).slice(0, 1)}
                </span>
                <strong>{venueLabel(selectedVenue)}</strong>
                <span className="imperial-route-card__leverage">
                  {leverage(underlyingLeverage)}{showBoostArrow ? ` → ${leverage(boostedLeverage)}` : ''}
                </span>
                <span className="imperial-route-best">BEST</span>
              </>
            ) : <strong>Finding the best venue…</strong>}
          </div>
        </div>
        <span className="imperial-auto-route"><i />Auto-route&nbsp; ON</span>
      </div>

      {quote?.error ? (
        <div className="imperial-route-card__error">{quote.error}</div>
      ) : selected ? (
        <>
          <p className="imperial-route-card__reason">
            {quote?.reason || `${venueLabel(selectedVenue)} has the best estimated all-in cost for this order.`}
          </p>

          <div className="imperial-route-list">
            {candidates.map((candidate, index) => {
              const key = venueKey(candidate?.venue) || `route-${index}`;
              const costs = candidate?.costBreakdown || {};
              const expanded = expandedVenue === key;
              const isBest = key === selectedVenue || (!selectedVenue && index === 0);
              const loan = number(candidate?.loanSplit?.loanAmountUsd);
              const deposit = number(candidate?.requiredDeposit?.requiredDepositUsd);
              const total = number(costs?.total ?? candidate?.expectedCostUsd);
              return (
                <div key={key} className={`imperial-route-option${isBest ? ' imperial-route-option--best' : ''}`}>
                  <button
                    type="button"
                    className="imperial-route-option__toggle"
                    aria-expanded={expanded}
                    onClick={() => setExpandedVenue(current => current === key ? '' : key)}
                  >
                    <span className={`imperial-venue-mark imperial-venue-mark--${key}`} aria-hidden="true">
                      {VENUE_MARKS[key] || venueLabel(key).slice(0, 1)}
                    </span>
                    <span className="imperial-route-option__name">{venueLabel(key)}</span>
                    <span className="imperial-route-option__leverage">{leverage(candidate?.maxLeverage)}</span>
                    {isBest && <span className="imperial-route-option__best">best</span>}
                    <span className="imperial-route-option__total">{usd(total)}</span>
                    <svg className={expanded ? 'is-open' : ''} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {expanded && (
                    <div className="imperial-route-option__details">
                      <CostLine label="Open fee" value={costs?.openFee} notional={notional} />
                      <CostLine label="Close fee" value={costs?.closeFee} notional={notional} />
                      <CostLine label="Entry slippage" value={costs?.openSlip} notional={notional} />
                      <CostLine label="Exit slippage" value={costs?.closeSlip} notional={notional} />
                      <CostLine label={`Borrow (${holdHours}h)`} value={costs?.borrow} notional={notional} />
                      <CostLine
                        label="Liquidation risk"
                        value={costs?.expectedLiqCost}
                        notional={notional}
                        suffix={`${(number(costs?.pLiq) * 100).toFixed(1)}% prob.`}
                      />
                      {number(costs?.loanCost) > 0 && <CostLine label="Boost loan" value={costs.loanCost} notional={notional} />}
                      <div className="imperial-route-total">
                        <span>Estimated total</span>
                        <strong>{usd(total)}</strong>
                      </div>
                      <div className="imperial-route-capital">
                        <span>Deposit <strong>{usd(deposit)}</strong></span>
                        <span>Boost loan <strong>{usd(loan)}</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="imperial-route-card__empty">Enter a position size to compare live routes and fees.</p>
      )}

      <div className="imperial-route-card__controls">
        <button
          type="button"
          className={`imperial-route-boost${boostEnabled ? ' is-on' : ''}`}
          aria-pressed={Boolean(boostEnabled)}
          onClick={() => onBoostChange?.(!boostEnabled)}
        >
          <span>Leverage boost</span>
          <i>{boostEnabled ? 'ON' : 'OFF'}</i>
        </button>
        <label className="imperial-route-profile">
          <span>Profile</span>
          <select value={profileIndex} onChange={event => onProfileChange?.(Number(event.target.value))}>
            {[0, 1, 2, 3, 4, 5].map(index => <option key={index} value={index}>{index + 1}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}
