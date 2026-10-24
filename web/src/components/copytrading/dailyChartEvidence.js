/* Port of ClashBot src/dailyChartEvidence.ts (copy/main).
 * Presentation of observed evidence, never a replacement for server quality.
 * Unknown days break the accumulation: a later segment cannot turn an unknown
 * prefix into a full-window total or connect a line through missing history. */
export const CHART_DAY_MS = 86_400_000;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const count = (value) => finite(value) && Number.isSafeInteger(value) && value >= 0;

function validFor(metric, point) {
  if (metric === 'pnl') return finite(point.dailyPnlUsd);
  if (metric === 'volume') return finite(point.volumeUsd ?? null) && point.volumeUsd >= 0;
  if (metric === 'roi') {
    return finite(point.roiNetPnlUsd) && finite(point.closedEntryNotionalUsd)
      && point.closedEntryNotionalUsd >= 0
      && (point.closedEntryNotionalUsd > 0 || point.roiNetPnlUsd === 0);
  }
  return count(point.winsCount) && count(point.lossesCount) && count(point.breakevenCount);
}

/**
 * @param {{ points: object[], metric: 'pnl'|'volume'|'roi'|'winRate', quality: string,
 *   days: number, now: number, coverageStart: number|null, coverageEnd: number|null }} input
 */
export function dailyChartEvidence(input) {
  const today = Math.floor(input.now / CHART_DAY_MS) * CHART_DAY_MS;
  const rangeStart = today - (input.days - 1) * CHART_DAY_MS;
  const rangeEnd = input.now;
  const asOf = finite(input.coverageEnd) ? Math.min(input.coverageEnd, input.now) : null;
  // Daily aggregates cannot isolate the portion before a mid-day lower bound.
  const coveredStart = finite(input.coverageStart)
    ? Math.ceil(input.coverageStart / CHART_DAY_MS) * CHART_DAY_MS : rangeStart;
  const lower = Math.max(rangeStart, coveredStart);
  const segments = [];
  let segment = null;
  let sum = 0;
  let denominator = 0;
  let losses = 0;
  let previous = null;
  let knownDays = 0;
  // Duplicate days are ambiguous, not additive observations.
  const byDay = new Map();
  for (const point of input.points || []) {
    if (!point || !Number.isSafeInteger(point.timestamp) || point.timestamp % CHART_DAY_MS !== 0
      || point.timestamp < lower || point.timestamp > rangeEnd
      || (asOf != null && point.timestamp > asOf)) continue;
    byDay.set(point.timestamp, byDay.has(point.timestamp) ? null : point);
  }
  const reset = () => { segment = null; sum = 0; denominator = 0; losses = 0; };
  for (const [timestamp, point] of [...byDay].sort(([a], [b]) => a - b)) {
    if (previous == null || timestamp !== previous + CHART_DAY_MS) reset();
    previous = timestamp;
    if (!point || input.quality === 'unavailable') { reset(); continue; }
    if (!validFor(input.metric, point)) {
      // A covered day without a computable value (e.g. no closes, so no ROI
      // basis) changes nothing: carry the running value forward as a flat line.
      const last = segment?.at(-1);
      if (last) { knownDays += 1; segment.push({ ...point, value: last.value }); }
      continue;
    }
    knownDays += 1;
    if (input.metric === 'pnl') sum += point.dailyPnlUsd;
    else if (input.metric === 'volume') sum += point.volumeUsd;
    else if (input.metric === 'roi') {
      sum += point.roiNetPnlUsd;
      denominator += point.closedEntryNotionalUsd;
    } else {
      sum += point.winsCount;
      losses += point.lossesCount;
      denominator = sum + losses;
    }
    const value = input.metric === 'pnl' || input.metric === 'volume' ? sum
      : denominator > 0 ? sum / denominator * 100 : null;
    if (value == null) { // Proven zero closes: not a fabricated 0%, keep the line flat.
      const last = segment?.at(-1);
      if (last) segment.push({ ...point, value: last.value });
      continue;
    }
    if (!Number.isFinite(value)) { reset(); continue; }
    if (!segment) { segment = []; segments.push(segment); }
    segment.push({ ...point, value });
  }
  const historical = (input.quality !== 'native' && input.quality !== 'calculated')
    || knownDays !== input.days || lower !== rangeStart;
  return { segments, rangeStart, rangeEnd, asOf, historical };
}

export function dailyChartX(timestamp, start, end, left, width) {
  return left + Math.max(0, Math.min(1, (timestamp - start) / Math.max(1, end - start))) * width;
}
