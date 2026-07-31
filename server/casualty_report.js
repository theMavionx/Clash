'use strict';

const FINAL_CASUALTY_REPORT_VERSION = 1;

class CasualtyReportError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'CasualtyReportError';
    this.code = code;
    this.status = status;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function canonicalCasualties(casualties) {
  const sorted = {};
  for (const name of Object.keys(casualties || {}).sort()) {
    sorted[name] = casualties[name];
  }
  return JSON.stringify(sorted);
}

function normalizeCasualties(rawCasualties, {
  normalizeTroopName = value => String(value || ''),
  isKnownTroop = () => true,
  isPersistentCasualty = () => true,
  maxTotal = Number.MAX_SAFE_INTEGER,
} = {}) {
  if (!isPlainObject(rawCasualties)) {
    throw new CasualtyReportError(
      'Final casualty report must contain a casualties object',
      'CASUALTY_REPORT_INVALID',
    );
  }

  const normalized = {};
  let total = 0;
  for (const [rawName, rawCount] of Object.entries(rawCasualties)) {
    if (!Number.isSafeInteger(rawCount) || rawCount < 0) {
      throw new CasualtyReportError(
        `Invalid casualty count for ${String(rawName || 'unknown troop')}`,
        'CASUALTY_COUNT_INVALID',
      );
    }
    if (rawCount === 0) continue;

    const troopName = normalizeTroopName(rawName);
    if (!troopName || !isKnownTroop(troopName)) {
      throw new CasualtyReportError(
        `Unknown troop in casualty report: ${String(rawName || '')}`,
        'CASUALTY_TROOP_INVALID',
      );
    }
    if (!isPersistentCasualty(troopName)) continue;

    normalized[troopName] = (normalized[troopName] || 0) + rawCount;
    total += rawCount;
    if (total > maxTotal) {
      throw new CasualtyReportError(
        `Final casualty report exceeds the ${maxTotal}-troop battle limit`,
        'CASUALTY_TOTAL_INVALID',
      );
    }
  }

  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function parseFinalCasualtyReport(body, {
  battleSessionId = '',
  normalizeTroopName,
  isKnownTroop,
  isPersistentCasualty,
  maxTotal,
} = {}) {
  const payload = isPlainObject(body) ? body : {};
  const envelope = payload.casualty_report;
  const hasEnvelope = envelope !== undefined && envelope !== null;

  if (hasEnvelope && !isPlainObject(envelope)) {
    throw new CasualtyReportError(
      'casualty_report must be an object',
      'CASUALTY_REPORT_INVALID',
    );
  }

  let rawCasualties = payload.casualties;
  let version = 0;
  let source = 'client_match_end_legacy';
  let reportSessionId = String(battleSessionId || '').trim();
  let reportId = reportSessionId;

  if (hasEnvelope) {
    version = Number(envelope.version);
    if (version !== FINAL_CASUALTY_REPORT_VERSION) {
      throw new CasualtyReportError(
        `Unsupported casualty report version: ${String(envelope.version ?? '')}`,
        'CASUALTY_REPORT_VERSION_UNSUPPORTED',
      );
    }
    source = 'client_match_end_v1';
    rawCasualties = envelope.casualties;
    reportSessionId = String(envelope.battle_session_id || '').trim();
    reportId = String(envelope.report_id || reportSessionId).trim();

    if (battleSessionId && reportSessionId !== battleSessionId) {
      throw new CasualtyReportError(
        'Casualty report does not match this battle session',
        'CASUALTY_REPORT_SESSION_MISMATCH',
        409,
      );
    }
    if (battleSessionId && reportId !== battleSessionId) {
      throw new CasualtyReportError(
        'Casualty report ID does not match this battle session',
        'CASUALTY_REPORT_ID_MISMATCH',
        409,
      );
    }
  }

  if (!isPlainObject(rawCasualties)) {
    throw new CasualtyReportError(
      'A final casualty report is required at the end of the match',
      'CASUALTY_REPORT_REQUIRED',
    );
  }

  const options = {
    normalizeTroopName,
    isKnownTroop,
    isPersistentCasualty,
    maxTotal,
  };
  const casualties = normalizeCasualties(rawCasualties, options);

  // New clients keep the legacy top-level field for one release so cached
  // servers can still understand the request. They must carry identical data;
  // accepting two different values would recreate the multi-source ambiguity.
  if (hasEnvelope && payload.casualties !== undefined) {
    const legacyCasualties = normalizeCasualties(payload.casualties, options);
    if (canonicalCasualties(legacyCasualties) !== canonicalCasualties(casualties)) {
      throw new CasualtyReportError(
        'Conflicting casualty totals were submitted for the same match',
        'CASUALTY_REPORT_CONFLICT',
        409,
      );
    }
  }

  return {
    version,
    report_id: reportId,
    battle_session_id: reportSessionId,
    source,
    casualties,
    canonical: canonicalCasualties(casualties),
  };
}

function compareCasualties(reported, simulated) {
  const names = new Set([
    ...Object.keys(reported || {}),
    ...Object.keys(simulated || {}),
  ]);
  const differences = {};
  for (const name of [...names].sort()) {
    const clientCount = Number(reported?.[name] || 0);
    const simulatedCount = Number(simulated?.[name] || 0);
    if (clientCount === simulatedCount) continue;
    differences[name] = {
      reported: clientCount,
      simulated: simulatedCount,
      delta: simulatedCount - clientCount,
    };
  }
  return differences;
}

function resolveFinalCasualties(finalReport, simulatedCasualties = {}) {
  const reported = { ...(finalReport?.casualties || {}) };
  return {
    clientCasualties: reported,
    resolvedCasualties: reported,
    casualtySource: finalReport?.source || 'client_match_end_unknown',
    casualtyDifferences: compareCasualties(reported, simulatedCasualties),
  };
}

module.exports = {
  FINAL_CASUALTY_REPORT_VERSION,
  CasualtyReportError,
  canonicalCasualties,
  normalizeCasualties,
  parseFinalCasualtyReport,
  compareCasualties,
  resolveFinalCasualties,
};
