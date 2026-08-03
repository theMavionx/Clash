#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APP_ROOT = process.env.CLASH_APP_ROOT || path.resolve(__dirname, '..');
const SOURCE = 'decibel_onchain_audit_v2';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function roundUsd(value) {
  return Number((Number(value) || 0).toFixed(6));
}

function loadAudit(filePath) {
  const raw = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const audit = JSON.parse(raw.toString('utf8'));
  if (audit?.audit !== 'decibel_tournament_volume' || audit?.mode !== 'read_only') {
    throw new Error('refusing to apply an unrecognized or non-read-only audit artifact');
  }
  const tournamentId = Number(audit?.tournament?.id);
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
    throw new Error('audit artifact has no valid tournament id');
  }
  return { audit, hash, tournamentId };
}

function correctionPlan(audit, auditHash) {
  const rows = [];
  for (const participant of Array.isArray(audit?.participants) ? audit.participants : []) {
    const proven = Number(participant?.upstream?.proven_volume_usd) || 0;
    const credited = Number(participant?.credited?.volume_usd) || 0;
    const delta = roundUsd(proven - credited);
    if (delta < 0.01) continue;
    const playerId = String(participant?.player_id || '').trim();
    const cutoffAt = String(participant?.cutoff_at || audit?.tournament?.cutoff_at || '').trim();
    if (!playerId || !Number.isFinite(Date.parse(cutoffAt))) {
      throw new Error(`invalid correction identity for ${participant?.player_name || playerId || 'unknown player'}`);
    }
    rows.push({
      player_id: playerId,
      player_name: String(participant?.player_name || playerId),
      cutoff_at: cutoffAt,
      proven_volume_usd: roundUsd(proven),
      credited_at_audit_usd: roundUsd(credited),
      delta_usd: delta,
      event_id: `${auditHash.slice(0, 20)}:${playerId}`,
      proven_fills: Number(participant?.upstream?.proven_fills) || 0,
      unresolved_fills_excluded: Number(participant?.upstream?.unresolved_fills) || 0,
    });
  }
  return rows;
}

function main() {
  const apply = process.argv.includes('--apply');
  const auditFile = path.resolve(argValue('--audit-file') || '');
  if (!auditFile || !fs.existsSync(auditFile)) throw new Error('--audit-file is required');
  const { audit, hash, tournamentId } = loadAudit(auditFile);
  const requestedTournamentId = Number(argValue('--tournament-id') || tournamentId);
  if (requestedTournamentId !== tournamentId) throw new Error('requested tournament does not match audit artifact');
  const plan = correctionPlan(audit, hash);
  if (!plan.length) throw new Error('audit contains no positive proven-volume corrections');

  const mainDb = require(path.join(APP_ROOT, 'server', 'db'));
  const tournament = mainDb.db.prepare(`
    SELECT id, name, dex, start_at, end_at FROM tournaments WHERE id = ?
  `).get(tournamentId);
  if (!tournament || String(tournament.dex || '').toLowerCase() !== 'decibel') {
    throw new Error('target is not a Decibel tournament');
  }
  const existingStmt = mainDb.db.prepare(`
    SELECT player_id, volume_usd, credited_at
    FROM tournament_trade_credits
    WHERE tournament_id = ? AND source = ? AND trade_id = ?
  `);
  const participantStmt = mainDb.db.prepare(`
    SELECT tp.*, p.name AS player_name
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = ? AND tp.player_id = ?
  `);
  const before = plan.map((row) => ({
    ...row,
    participant: participantStmt.get(tournamentId, row.player_id) || null,
    existing_credit: existingStmt.get(tournamentId, SOURCE, row.event_id) || null,
  }));
  for (const row of before) {
    if (!row.participant) throw new Error(`participant ${row.player_name} is no longer in tournament ${tournamentId}`);
  }

  const result = {
    mode: apply ? 'apply' : 'dry-run',
    source: SOURCE,
    audit_sha256: hash,
    tournament: {
      id: tournament.id,
      name: tournament.name,
    },
    planned_rows: plan.length,
    planned_volume_usd: roundUsd(plan.reduce((sum, row) => sum + row.delta_usd, 0)),
    backup_path: null,
    rows: before.map((row) => ({
      player_id: row.player_id,
      player_name: row.player_name,
      cutoff_at: row.cutoff_at,
      proven_fills: row.proven_fills,
      unresolved_fills_excluded: row.unresolved_fills_excluded,
      proven_volume_usd: row.proven_volume_usd,
      credited_at_audit_usd: row.credited_at_audit_usd,
      correction_volume_usd: row.delta_usd,
      already_applied: Boolean(row.existing_credit),
    })),
  };
  if (!apply) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const backupDir = process.env.CLASH_BACKUP_DIR || '/opt/clash/shared/backups';
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.TZ]/gu, '');
  const backupPath = path.join(backupDir, `decibel-tournament-${tournamentId}-volume-${stamp}-before.json`);
  const backup = {
    created_at: new Date().toISOString(),
    audit_sha256: hash,
    tournament,
    source: SOURCE,
    participants: before.map((row) => row.participant),
    existing_credits: before.map((row) => ({
      player_id: row.player_id,
      event_id: row.event_id,
      credit: row.existing_credit,
    })),
  };
  fs.writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  result.backup_path = backupPath;

  const applyTransaction = mainDb.db.transaction(() => before.map((row) => {
    if (row.existing_credit) {
      return { player_id: row.player_id, player_name: row.player_name, already_applied: true, credited_rows: 0, volume_usd: 0 };
    }
    const credit = mainDb.recordTournamentTradeRows(row.player_id, [{
      id: row.event_id,
      notional_usd: row.delta_usd,
      pnl: 0,
      created_at: row.cutoff_at,
      dex: 'decibel',
    }], {
      tournamentId,
      source: SOURCE,
      dex: 'decibel',
      count: false,
      volume: true,
      pnl: false,
    });
    if (Number(credit?.credited_rows || 0) !== 1 || Math.abs(Number(credit?.volume_usd || 0) - row.delta_usd) > 0.000001) {
      throw new Error(`failed to credit exact audited delta for ${row.player_name}`);
    }
    return { player_id: row.player_id, player_name: row.player_name, already_applied: false, ...credit };
  }));
  result.applied = applyTransaction();
  result.applied_volume_usd = roundUsd(result.applied.reduce((sum, row) => sum + Number(row.volume_usd || 0), 0));
  result.after = plan.map((row) => {
    const participant = participantStmt.get(tournamentId, row.player_id);
    const credit = existingStmt.get(tournamentId, SOURCE, row.event_id);
    return {
      player_id: row.player_id,
      player_name: row.player_name,
      tournament_volume_usd: roundUsd(participant?.volume_usd),
      audit_credit_volume_usd: roundUsd(credit?.volume_usd),
      credit_recorded: Boolean(credit),
    };
  });
  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[decibel-volume-apply] ${error.stack || error.message}`);
  process.exit(1);
}
