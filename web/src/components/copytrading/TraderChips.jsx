import { CAPITAL_PROFILE_LABELS } from './constants';
import { plainPercent } from './format';

/** Capital cohort, position bias and behaviour chips (ClashBot TraderProfileIcons). */
export default function TraderProfileChips({ trader }) {
  const chips = [];
  if (trader.capitalTier && CAPITAL_PROFILE_LABELS[trader.capitalTier]) {
    const [label, description] = CAPITAL_PROFILE_LABELS[trader.capitalTier];
    chips.push(<span key="capital" className="ct-chip ct-chip--muted" title={description}>{label}</span>);
  }
  if (trader.positionBias) {
    const label = trader.positionBias === 'long' ? 'Long bias'
      : trader.positionBias === 'short' ? 'Short bias'
        : trader.positionBias === 'balanced' ? 'Balanced' : 'Flat';
    const tone = trader.positionBias === 'long' ? 'long' : trader.positionBias === 'short' ? 'short' : 'muted';
    const mix = trader.positionLongSharePercent == null
      ? `${trader.positionLongCount ?? 0} long / ${trader.positionShortCount ?? 0} short positions`
      : `${plainPercent(trader.positionLongSharePercent, 1)} long`;
    chips.push(<span key="bias" className={`ct-chip ct-chip--${tone}`} title={`Fresh first-party position snapshot. ${mix}.`}>{label}</span>);
  }
  if (trader.traderPattern === 'automation_like' || trader.traderPattern === 'discretionary_like') {
    chips.push(
      <span
        key="pattern"
        className="ct-chip ct-chip--muted"
        title={`${trader.traderPatternConfidence || 'low'} confidence behavioural estimate; not proof of operator identity.`}
      >
        {trader.traderPattern === 'automation_like' ? 'Automation-like' : 'Discretionary'}
      </span>,
    );
  }
  return chips.length ? <>{chips}</> : null;
}
