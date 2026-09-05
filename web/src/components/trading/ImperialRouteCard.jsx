import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { imperialPopoverPosition } from '../../lib/imperialPopoverPosition';
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

const VENUE_KEYS_BY_ID = {
  0: 'jupiter',
  1: 'flash',
  2: 'phoenix',
  3: 'gmtrade',
  4: 'flash_v2',
  5: 'pairs',
  6: 'touch',
};

const VENUE_LOGOS = {
  phoenix: '/phoenix-mark-orange.svg',
  jupiter: '/tokens/JUP.svg',
  flash: '/flash-trade.png',
  flash_v2: '/flash-trade.png',
  gmtrade: '/gmtrade.svg',
  pairs: '/imperial-brand.png',
  touch: '/imperial-brand.png',
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function venueKey(value) {
  if (value !== '' && value !== null && value !== undefined
    && Number.isInteger(Number(value)) && VENUE_KEYS_BY_ID[Number(value)]) {
    return VENUE_KEYS_BY_ID[Number(value)];
  }
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

function VenueMark({ venue }) {
  const key = venueKey(venue);
  const src = VENUE_LOGOS[key];
  return (
    <span className={`imperial-venue-mark imperial-venue-mark--${key || 'unknown'}`} aria-hidden="true">
      {src ? (
        <img src={src} alt="" decoding="async" draggable="false" />
      ) : (
        <span>{VENUE_MARKS[key] || venueLabel(key).slice(0, 1)}</span>
      )}
    </span>
  );
}

function candidateRows(quote, availableVenues, pinnedVenue) {
  const selected = venueKey(quote?.venue ?? quote?.underwriter ?? quote?.selectedVenue);
  const rows = Array.isArray(quote?.candidates) ? quote.candidates : [];
  const quoted = rows.length ? rows : selected ? [{
    venue: selected,
    expectedCostUsd: quote?.expectedCostUsd,
    costBreakdown: quote?.costBreakdown,
    maxLeverage: quote?.maxLeverage,
    requiredDeposit: quote?.requiredDeposit,
    loanSplit: quote?.loanSplit,
  }] : [];
  const result = [...quoted];
  for (const value of [...availableVenues, ...(pinnedVenue ? [pinnedVenue] : [])]) {
    const key = venueKey(value?.venue ?? value);
    if (VENUE_LABELS[key] && !result.some(row => venueKey(row.venue) === key)) {
      result.push({ venue: key, awaitingQuote: true });
    }
  }
  return result;
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
  pinnedVenue = null,
  onVenueChange,
  excludedVenues = [],
  onExcludedVenuesChange,
  profileIndex = 0,
  onProfileChange,
  availableVenues = [],
}) {
  const selectedVenue = venueKey(quote?.venue ?? quote?.underwriter ?? quote?.selectedVenue);
  const candidates = useMemo(() => candidateRows(quote, availableVenues, pinnedVenue), [quote, availableVenues, pinnedVenue]);
  const [expandedVenue, setExpandedVenue] = useState('');
  const [view, setView] = useState(null);
  const dialogRef = useRef(null);
  const anchorRef = useRef(null);
  const auto = pinnedVenue === null || pinnedVenue === '';
  const displayVenue = auto ? selectedVenue : venueKey(pinnedVenue);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (view && !dialog.open) dialog.showModal();
    else if (!view && dialog.open) dialog.close();
    if (!view) return;
    const place = () => {
      const vv = window.visualViewport;
      const viewport = { left: vv?.offsetLeft || 0, top: vv?.offsetTop || 0,
        width: vv?.width || window.innerWidth, height: vv?.height || window.innerHeight };
      const rect = anchorRef.current.getBoundingClientRect();
      const desiredHeight = dialog.firstElementChild.getBoundingClientRect().height + 2;
      const position = imperialPopoverPosition(rect, viewport, desiredHeight);
      for (const [key, value] of Object.entries(position)) dialog.style[key] = `${value}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(dialog.firstElementChild);
    observer.observe(anchorRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [view]);

  function choose(venue) {
    onVenueChange?.(venue);
    setView(null);
    setExpandedVenue('');
  }

  return (
    <section ref={anchorRef} className="imperial-route-card" aria-label="Imperial route">
      <button type="button" className="imperial-route-trigger" aria-haspopup="dialog"
        aria-expanded={Boolean(view)} onClick={() => { setExpandedVenue(''); setView('venues'); }}>
        {displayVenue && <VenueMark venue={displayVenue} />}
        <strong>{displayVenue ? venueLabel(displayVenue) : 'Auto-route'}</strong>
        {requestedLeverage > 0 && <span className="imperial-route-muted">{leverage(requestedLeverage)}</span>}
        <span aria-hidden="true">⌄</span>
      </button>
      <button type="button" className="imperial-route-settings" aria-label="Route settings"
        onClick={() => setView('settings')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>
        </svg>
      </button>
      <dialog ref={dialogRef} className="imperial-route-dialog" aria-label={view === 'settings' ? 'Route settings' : 'Choose venue'}
        onCancel={() => setView(null)} onClose={() => setView(null)}
        onClick={event => { if (event.target === event.currentTarget) setView(null); }}>
        <div className="imperial-route-popup">
          <header className="imperial-route-popup__header">
            <span>{view === 'settings' ? 'Route settings' : 'Venue'}</span>
            <button type="button" aria-label="Close route dialog" onClick={() => setView(null)}>×</button>
          </header>
          {view === 'settings' ? (
            <>
              <p className="imperial-route-muted">Allowed venues for auto-route</p>
              {Object.keys(VENUE_LABELS).map(key => (
                <label className="imperial-route-allowed" key={key}>
                  <VenueMark venue={key} /><span>{venueLabel(key)}</span>
                  <input type="checkbox" checked={!excludedVenues.includes(key)}
                    disabled={!excludedVenues.includes(key) && excludedVenues.length >= Object.keys(VENUE_LABELS).length - 1}
                    onChange={event => onExcludedVenuesChange?.(event.target.checked
                      ? excludedVenues.filter(value => value !== key) : [...excludedVenues, key])} />
                </label>
              ))}
              <p className="imperial-route-muted">An existing position may keep its venue. Imperial reports any override in the quote.</p>
              <label className="imperial-route-profile">
                <span>Trading profile</span>
                <select value={profileIndex} onChange={event => onProfileChange?.(Number(event.target.value))}>
                  {[0, 1, 2, 3, 4, 5].map(index => <option key={index} value={index}>{index + 1}</option>)}
                </select>
              </label>
              <button type="button" className="imperial-route-manage" onClick={() => setView('venues')}>Back to venues</button>
            </>
          ) : (
            <>
              <button type="button" className="imperial-route-auto" role="switch" aria-checked={auto}
                disabled={auto && !selectedVenue}
                onClick={() => choose(auto ? selectedVenue : null)}>
                <span>Auto-route</span><span className={auto ? 'imperial-route-best' : 'imperial-route-muted'}>{auto ? 'on' : 'off'}</span>
              </button>
              {quote?.error && <p role="alert" className="imperial-route-error">{quote.error}</p>}
              {!candidates.length && !quote?.error && <p className="imperial-route-muted">{notional > 0 ? 'Comparing routes…' : 'Enter a position size to compare routes and fees.'}</p>}
              <div className="imperial-route-list">
                {candidates.map((candidate, index) => {
                  const key = venueKey(candidate?.venue) || `route-${index}`;
                  const costs = candidate?.costBreakdown || {};
                  const expanded = expandedVenue === key;
                  const chosen = key === displayVenue;
                  const loan = number(candidate?.loanSplit?.loanAmountUsd);
                  // The winner's top-level deposit accounts for its loan split.
                  const deposit = key === selectedVenue ? quote?.requiredDeposit : candidate?.requiredDeposit;
                  const total = costs?.total ?? candidate?.expectedCostUsd;
                  return (
                    <div key={key} className={`imperial-route-option${chosen ? ' is-selected' : ''}`}>
                      <div className="imperial-route-option__row">
                        <button type="button" className="imperial-route-option__select" aria-pressed={chosen}
                          disabled={Boolean(candidate.filteredReason)} onClick={() => choose(key)}>
                          <VenueMark venue={key} /><strong>{venueLabel(key)}</strong>
                          {candidate?.maxLeverage > 0 && <span className="imperial-route-muted">{leverage(candidate.maxLeverage)}</span>}
                          {auto && key === selectedVenue && <span className="imperial-route-best">best</span>}
                          {!auto && chosen && <span className="imperial-route-best" aria-label="Selected">✓</span>}
                        </button>
                        <button type="button" className="imperial-route-option__expand"
                          aria-label={`${venueLabel(key)} fee details`} aria-expanded={expanded}
                          onClick={() => setExpandedVenue(expanded ? '' : key)}>{expanded ? '⌃' : '⌄'}</button>
                      </div>
                      {candidate.filteredReason && <p className="imperial-route-muted">{candidate.filteredReason}</p>}
                      {expanded && candidate.awaitingQuote && <p className="imperial-route-muted">Enter a position size to calculate fees for this venue.</p>}
                      {expanded && !candidate.awaitingQuote && (
                        <div className="imperial-route-option__details">
                          <CostLine label="Open fee" value={costs.openFee} notional={notional} />
                          <CostLine label="Close fee" value={costs.closeFee} notional={notional} />
                          <CostLine label="Entry slippage" value={costs.openSlip} notional={notional} />
                          <CostLine label="Exit slippage" value={costs.closeSlip} notional={notional} />
                          <CostLine label={`Borrow (${holdHours}h)`} value={costs.borrow} notional={notional} />
                          <CostLine label="Liquidation risk" value={costs.expectedLiqCost} notional={notional}
                            suffix={`${(number(costs.pLiq) * 100).toFixed(1)}% prob.`} />
                          {number(costs.loanCost) > 0 && <CostLine label="Loan cost" value={costs.loanCost} notional={notional} />}
                          <div className="imperial-route-total"><span>Estimated total</span><strong>{usd(total)}</strong></div>
                          {deposit && <div className="imperial-route-capital"><span>Required deposit</span><strong>{usd(deposit.requiredDepositUsd)}</strong></div>}
                          {loan > 0 && <div className="imperial-route-capital"><span>Automatic loan</span><strong>{usd(loan)}</strong></div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {quote?.reason && <p className="imperial-route-muted imperial-route-reason">{auto ? quote.reason : `${venueLabel(displayVenue)} selected for this order.`}</p>}
              <button type="button" className="imperial-route-manage" onClick={() => setView('settings')}>Manage allowed venues</button>
            </>
          )}
        </div>
      </dialog>
    </section>
  );
}
