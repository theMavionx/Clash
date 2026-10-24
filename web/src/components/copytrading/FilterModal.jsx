import { useState } from 'react';
import { PUBLIC_LEADERBOARD_VENUES, SORT_LABELS, venueName } from './constants';
import {
  capitalCohortEvidenceNote,
  defaultLeaderboardFilters,
  describeAppliedLeaderboardFilters,
  validateLeaderboardFilters,
} from './leaderboardPreferences';
import { Btn, Icon, Modal, Notice, NumberField, Select, VenueLogo } from './ui';

function FilterSection({ title, description, activeCount, defaultOpen = false, children }) {
  return (
    <details className="ct-details" open={defaultOpen || activeCount > 0}>
      <summary>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
            {title}
            {activeCount > 0 && <span className="ct-chip ct-chip--brand">{activeCount} active</span>}
          </span>
          <span className="ct-field-hint" style={{ display: 'block', marginTop: 2 }}>{description}</span>
        </span>
        <Icon name="chevronDown" size={16} style={{ color: 'var(--terminal-text-muted)' }} />
      </summary>
      <div className="ct-details-body">{children}</div>
    </details>
  );
}

/**
 * Full ClashBot leaderboard filter set (CopyTradingPage.tsx FilterModal):
 * exchanges, volume, closed-trade sample, recency, capital cohort, position
 * bias, activity level, behaviour pattern, metric ranges, metric quality,
 * copyable-only, sort + direction and win-rate formula.
 */
export default function FilterModal({ value, onClose, onApply }) {
  const [draft, setDraft] = useState(() => ({ ...value, venues: [...value.venues] }));
  const set = (key) => (next) => setDraft((current) => ({ ...current, [key]: next }));
  const applied = describeAppliedLeaderboardFilters(draft, PUBLIC_LEADERBOARD_VENUES, venueName);
  const errors = validateLeaderboardFilters(draft);
  const sectionCount = (section) => applied.filter((filter) => filter.section === section).length;
  const capitalNote = capitalCohortEvidenceNote(draft.venues, draft.capitalTier);

  const toggleVenue = (venue) => setDraft((current) => ({
    ...current,
    venues: current.venues.includes(venue)
      ? current.venues.filter((item) => item !== venue)
      : [...current.venues, venue],
  }));

  return (
    <Modal
      title="Leaderboard filters"
      subtitle="Use only metrics the selected window can prove."
      onClose={onClose}
      closeLabel="Close filters"
      size="md"
      footer={(
        <>
          <Btn
            variant="ghost"
            icon="refresh"
            onClick={() => setDraft({ ...defaultLeaderboardFilters(PUBLIC_LEADERBOARD_VENUES) })}
          >
            Reset
          </Btn>
          <Btn
            variant="neutral"
            disabled={errors.length > 0}
            onClick={() => { onApply(draft); onClose(); }}
          >
            Show results
          </Btn>
        </>
      )}
    >
      <FilterSection
        title="Markets and activity"
        description="Exchanges, verified trade recency, volume and sample size."
        activeCount={sectionCount('markets')}
        defaultOpen
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="ct-field-label">Exchanges</span>
          <span style={{ display: 'flex', gap: 4 }}>
            <Btn size="sm" variant="ghost" disabled={draft.venues.length === 0} onClick={() => set('venues')([])}>Deselect all</Btn>
            <Btn
              size="sm"
              variant="ghost"
              disabled={draft.venues.length === PUBLIC_LEADERBOARD_VENUES.length}
              onClick={() => set('venues')([...PUBLIC_LEADERBOARD_VENUES])}
            >
              Select all
            </Btn>
          </span>
        </div>
        <div className="ct-venue-grid" role="group" aria-label="Exchanges">
          {PUBLIC_LEADERBOARD_VENUES.map((venue) => {
            const selected = draft.venues.includes(venue);
            return (
              <button key={venue} type="button" className="ct-venue-option" aria-pressed={selected} onClick={() => toggleVenue(venue)}>
                <VenueLogo venue={venue} size={20} />
                <span className="ct-grow">{venueName(venue)}</span>
                {selected && <Icon name="check" size={14} style={{ color: 'var(--terminal-brand-text)' }} />}
              </button>
            );
          })}
        </div>
        <div className="ct-form-grid">
          <Select
            label="Minimum volume"
            value={draft.minVolume}
            onChange={set('minVolume')}
            options={[
              { value: '0', label: 'Any volume' },
              { value: '10000', label: '$10K+' },
              { value: '100000', label: '$100K+' },
              { value: '1000000', label: '$1M+' },
              { value: '10000000', label: '$10M+' },
            ]}
          />
          <Select
            label="Minimum closed trades"
            value={draft.minWinRateTrades}
            onChange={set('minWinRateTrades')}
            hint="Filters traders by the number of completed trades."
            options={[
              { value: '0', label: 'Any sample size' },
              { value: '5', label: '5+ closed trades' },
              { value: '10', label: '10+ closed trades' },
              { value: '25', label: '25+ closed trades' },
              { value: '50', label: '50+ closed trades' },
              { value: '100', label: '100+ closed trades' },
            ]}
          />
          <Select
            label="Last verified trade"
            value={draft.lastTradeAge}
            onChange={set('lastTradeAge')}
            wide
            hint="Uses the latest verified public trade. Traders without that evidence are excluded while this filter is active."
            options={[
              { value: 'any', label: 'Any time' },
              { value: '5m', label: 'Within 5 minutes' },
              { value: '30m', label: 'Within 30 minutes' },
              { value: '1h', label: 'Within 1 hour' },
              { value: '3h', label: 'Within 3 hours' },
              { value: '6h', label: 'Within 6 hours' },
              { value: '12h', label: 'Within 12 hours' },
              { value: '24h+', label: '24+ hours ago' },
            ]}
          />
        </div>
      </FilterSection>

      <FilterSection
        title="Trader profile"
        description="Capital cohort, current position bias and evidence-backed behaviour."
        activeCount={sectionCount('profile')}
      >
        <div className="ct-form-grid">
          <Select
            label="Capital cohort"
            value={draft.capitalTier}
            onChange={set('capitalTier')}
            options={[
              { value: 'any', label: 'Any capital cohort' },
              { value: 'whale', label: 'Whale · $1M+' },
              { value: 'shark', label: 'Shark · $250K-$1M' },
              { value: 'dolphin', label: 'Dolphin · $50K-$250K' },
              { value: 'fish', label: 'Fish · $10K-$50K' },
              { value: 'shrimp', label: 'Shrimp · below $10K' },
            ]}
          />
          <Select
            label="Position direction"
            value={draft.positionBias}
            onChange={set('positionBias')}
            options={[
              { value: 'any', label: 'Any current book' },
              { value: 'long', label: 'Long biased · 65%+' },
              { value: 'short', label: 'Short biased · 65%+' },
              { value: 'balanced', label: 'Balanced book' },
              { value: 'flat', label: 'Currently flat' },
            ]}
          />
          <Select
            label="Activity level"
            value={draft.activityLevel}
            onChange={set('activityLevel')}
            options={[
              { value: 'any', label: 'Any activity level' },
              { value: 'very_high', label: 'Very high · 50+/day' },
              { value: 'high', label: 'High · 10-50/day' },
              { value: 'active', label: 'Active · 2-10/day' },
              { value: 'regular', label: 'Regular · 0.25-2/day' },
              { value: 'occasional', label: 'Occasional · below 0.25/day' },
            ]}
          />
          <Select
            label="Behaviour pattern"
            value={draft.traderPattern}
            onChange={set('traderPattern')}
            options={[
              { value: 'any', label: 'Any behaviour pattern' },
              { value: 'automation_like', label: 'Automation-like' },
              { value: 'discretionary_like', label: 'Likely discretionary' },
              { value: 'mixed', label: 'Mixed pattern' },
            ]}
          />
        </div>
        {capitalNote && <Notice tone="warning">{capitalNote}</Notice>}
        <p className="ct-field-hint" style={{ margin: 0 }}>
          Direction uses a first-party position snapshot no older than five minutes. Behaviour is a multi-window
          activity estimate, never proof that a wallet is human- or bot-operated.
        </p>
      </FilterSection>

      <FilterSection
        title="Metrics and ordering"
        description="PnL, ROI, win rate, account value, evidence quality and sorting."
        activeCount={sectionCount('metrics')}
      >
        <div>
          <span className="ct-field-label">Metric ranges</span>
          <p className="ct-field-hint" style={{ margin: '2px 0 0' }}>Unknown values never pass an active range.</p>
        </div>
        <div className="ct-form-grid">
          <NumberField label="Account value min" value={draft.minAccountValue} prefix="$" placeholder="Any" onChange={set('minAccountValue')} />
          <NumberField label="Account value max" value={draft.maxAccountValue} prefix="$" placeholder="Any" onChange={set('maxAccountValue')} />
          <NumberField
            label="Maximum copy balance"
            value={draft.maxCopyBalance}
            prefix="$"
            placeholder="Any"
            onChange={set('maxCopyBalance')}
            hint="Only traders you can copy with this balance or less."
            wide
          />
          <NumberField label="PnL min" value={draft.minPnl} prefix="$" placeholder="Any" onChange={set('minPnl')} />
          <NumberField label="PnL max" value={draft.maxPnl} prefix="$" placeholder="Any" onChange={set('maxPnl')} />
          <NumberField label="ROI min" value={draft.minRoi} suffix="%" placeholder="Any" onChange={set('minRoi')} />
          <NumberField label="ROI max" value={draft.maxRoi} suffix="%" placeholder="Any" onChange={set('maxRoi')} />
          <NumberField label="Win rate min" value={draft.minWinRate} suffix="%" placeholder="Any" onChange={set('minWinRate')} />
          <NumberField label="Win rate max" value={draft.maxWinRate} suffix="%" placeholder="Any" onChange={set('maxWinRate')} />
        </div>
        <div className="ct-form-grid">
          <Select
            label="Metric quality"
            value={draft.metricQuality}
            onChange={set('metricQuality')}
            options={[
              { value: 'any', label: 'Any readiness' },
              { value: 'ready', label: 'Ready · native or calculated' },
              { value: 'native', label: 'Native exchange metric' },
              { value: 'calculated', label: 'Verified calculation' },
              { value: 'partial', label: 'Partial history' },
              { value: 'estimated', label: 'Estimated' },
              { value: 'collecting', label: 'Still collecting' },
              { value: 'unavailable', label: 'Unavailable upstream' },
            ]}
          />
          <Select
            label="Copy trading"
            value={draft.copyableOnly ? 'copyable' : 'any'}
            onChange={(mode) => set('copyableOnly')(mode === 'copyable')}
            options={[
              { value: 'any', label: 'All discovered identities' },
              { value: 'copyable', label: 'Copyable sources only' },
            ]}
          />
          <Select
            label="Sort by"
            value={draft.sort}
            onChange={set('sort')}
            options={Object.entries(SORT_LABELS).map(([optionValue, label]) => ({ value: optionValue, label }))}
          />
          <Select
            label="Sort direction"
            value={draft.direction}
            onChange={set('direction')}
            options={[
              { value: 'desc', label: 'Highest first' },
              { value: 'asc', label: 'Lowest first' },
            ]}
          />
          <Select
            label="Win-rate formula"
            value={draft.winRateMode}
            onChange={set('winRateMode')}
            wide
            hint="PnL-weighted uses gross profitable closed-order PnL divided by profit plus absolute loss. Example: +$100 / -$50 = 66.67%."
            options={[
              { value: 'standard', label: 'Standard · wins vs losses' },
              { value: 'pnlWeighted', label: 'PnL-weighted · profit vs loss amount' },
            ]}
          />
        </div>
      </FilterSection>

      {errors.length > 0 && <Notice tone="error">{errors[0]}</Notice>}
    </Modal>
  );
}
