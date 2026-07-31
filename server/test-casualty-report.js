'use strict';

const assert = require('node:assert/strict');
const {
  canonicalCasualties,
  compareCasualties,
  parseFinalCasualtyReport,
  resolveFinalCasualties,
} = require('./casualty_report');

const known = new Set(['Knight', 'Mage', 'DemonKing']);
const normalize = name => ({
  knight: 'Knight',
  mage: 'Mage',
  demonking: 'DemonKing',
  demon_king: 'DemonKing',
}[String(name || '').toLowerCase()] || String(name || ''));
const options = {
  battleSessionId: 'battle-123',
  normalizeTroopName: normalize,
  isKnownTroop: name => known.has(name),
  isPersistentCasualty: name => name !== 'DemonKing',
  maxTotal: 45,
};

const parsed = parseFinalCasualtyReport({
  casualties: { knight: 6, Mage: 1, DemonKing: 1 },
  casualty_report: {
    version: 1,
    report_id: 'battle-123',
    battle_session_id: 'battle-123',
    casualties: { Knight: 6, mage: 1, demon_king: 1 },
  },
}, options);

assert.deepEqual(parsed.casualties, { Knight: 6, Mage: 1 });
assert.equal(parsed.source, 'client_match_end_v1');
assert.equal(parsed.canonical, '{"Knight":6,"Mage":1}');

const legacy = parseFinalCasualtyReport({
  casualties: { Knight: 5 },
}, options);
assert.deepEqual(legacy.casualties, { Knight: 5 });
assert.equal(legacy.source, 'client_match_end_legacy');

assert.throws(
  () => parseFinalCasualtyReport({
    casualties: { Knight: 6 },
    casualty_report: {
      version: 1,
      report_id: 'battle-123',
      battle_session_id: 'battle-123',
      casualties: { Knight: 20 },
    },
  }, options),
  error => error.code === 'CASUALTY_REPORT_CONFLICT' && error.status === 409,
);

assert.throws(
  () => parseFinalCasualtyReport({
    casualty_report: {
      version: 1,
      report_id: 'another-battle',
      battle_session_id: 'another-battle',
      casualties: { Knight: 1 },
    },
  }, options),
  error => error.code === 'CASUALTY_REPORT_SESSION_MISMATCH' && error.status === 409,
);

assert.throws(
  () => parseFinalCasualtyReport({ casualties: { Knight: 1.5 } }, options),
  error => error.code === 'CASUALTY_COUNT_INVALID',
);

assert.deepEqual(
  compareCasualties({ Knight: 6 }, { Knight: 20, Mage: 1 }),
  {
    Knight: { reported: 6, simulated: 20, delta: 14 },
    Mage: { reported: 0, simulated: 1, delta: 1 },
  },
);
assert.deepEqual(
  resolveFinalCasualties(parsed, { Knight: 20, Mage: 1 }).resolvedCasualties,
  { Knight: 6, Mage: 1 },
  'server simulation must never replace the sealed end-of-match report',
);
assert.equal(
  canonicalCasualties({ Mage: 1, Knight: 6 }),
  '{"Knight":6,"Mage":1}',
);

console.log('casualty report tests passed');
