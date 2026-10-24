import { copyScoreBreakdown, validCopyScore } from './copyScoreModel';

/** Copy Score cell (ClashBot copy/main src/CopyScoreValue.tsx). */
export default function CopyScore({ value, details }) {
  const valid = validCopyScore(value);
  const breakdown = copyScoreBreakdown(details);
  const limited = details?.confidence === 'limited';
  const title = valid
    ? `Copy score ${details?.version ?? ''} · ${details?.coveragePercent ?? 'unknown'}% data coverage.${breakdown ? `\n${breakdown}` : ''}`
    : 'Insufficient data for a copy score.';
  return (
    <span
      title={title}
      aria-label={valid ? `Copy score ${value} out of 100${limited ? ', limited evidence' : ''}` : 'Copy score unavailable'}
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}
    >
      <span className="ct-num" style={{ fontWeight: 600 }}>{valid ? value : '—'}</span>
      {valid && <span className="ct-faint" style={{ fontSize: 11 }}>/100</span>}
      {valid && limited && <span className="ct-warning" style={{ fontSize: 11 }}>Limited</span>}
    </span>
  );
}
