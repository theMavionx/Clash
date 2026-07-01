#!/usr/bin/env node

const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const mainDb = require(path.join(repoRoot, 'server', 'db'));

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function short(value, head = 8, tail = 4) {
  const s = String(value || '');
  if (s.length <= head + tail + 3) return s || '-';
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function pad(value, width) {
  const s = String(value ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

const limit = Math.max(1, Math.min(1000, Math.trunc(Number(argValue('limit', 120)) || 120)));
const includeClean = hasFlag('include-clean');
const rows = mainDb.getBattleRiskPlayers({ limit, includeClean });

if (hasFlag('json')) {
  console.log(JSON.stringify({
    thresholds: mainDb.BATTLE_RISK_THRESHOLDS,
    players: rows,
  }, null, 2));
  process.exit(rows.some((row) => row.captcha_required) ? 2 : 0);
}

console.log('Battle risk audit');
console.log(`Thresholds: >=${mainDb.BATTLE_RISK_THRESHOLDS.burstAttackStarts}/15m, >${mainDb.BATTLE_RISK_THRESHOLDS.dailyAttackStartsExclusive}/24h`);
console.log('');

if (!rows.length) {
  console.log('No battle risk flags right now.');
  process.exit(0);
}

console.log([
  pad('CAPTCHA', 8),
  pad('Player', 22),
  pad('DEX', 12),
  pad('15m', 6),
  pad('24h', 7),
  pad('Results', 8),
  pad('Wins', 6),
  pad('Rejected', 9),
  pad('IP players', 10),
  'Flags',
].join(' '));

for (const row of rows) {
  console.log([
    pad(row.captcha_required ? 'YES' : 'no', 8),
    pad(row.name || short(row.player_id), 22),
    pad(row.dex || '-', 12),
    pad(row.attack_starts_15m || 0, 6),
    pad(row.attack_starts_24h || 0, 7),
    pad(row.submitted_results_24h || 0, 8),
    pad(row.accepted_wins_24h || 0, 6),
    pad(row.rejected_results_24h || 0, 9),
    pad(row.ip_players_24h || 0, 10),
    (row.risk_flags || []).map((flag) => flag.code).join(',') || 'clean',
  ].join(' '));
}

process.exit(rows.some((row) => row.captcha_required) ? 2 : 0);
