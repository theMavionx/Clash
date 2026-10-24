// Copy Score helpers (ClashBot copy/main src/CopyScoreValue.tsx).
const COMPONENT_LABELS = [
  ['riskAdjusted', 'Gain vs pain'], ['consistency', 'Consistency'], ['scale', 'Profit at size'],
  ['returns', 'ROI'], ['drawdown', 'Drawdown'], ['recency', 'Last 7 days'], ['sample', 'Sample'],
  ['leverage', 'Leverage'], ['volatility', 'Volatility'], ['size', 'Size'],
];

export function copyScoreComponents(details) {
  if (!details?.components) return [];
  return COMPONENT_LABELS
    .map(([key, label]) => [label, details.components[key]])
    .filter(([, value]) => typeof value === 'number');
}

export function copyScoreBreakdown(details) {
  if (!details) return '';
  const parts = copyScoreComponents(details).map(([label, value]) => `${label} ${value}`);
  const lines = parts.length ? [parts.join(' · ')] : [];
  for (const reason of details.reasons ?? []) lines.push(`• ${reason}`);
  return lines.join('\n');
}

export function validCopyScore(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}
