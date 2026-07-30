#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-admin-troop-balance-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');
const { db, getGlobalMatchmakingStats, getTroopBalanceAnalytics } = gameDb;

function replayActions(sessionId, troopTypes, legacy = false) {
  const actions = [{ type: 'battle_start', battle_session_id: sessionId }];
  if (legacy) {
    actions.push({
      type: 'place_ship',
      troops: [...troopTypes, '_SLOT_FILLER_'],
      troopLevels: {},
    });
  } else {
    troopTypes.forEach((troopType, deployIndex) => actions.push({
      type: 'deploy_troop',
      troop: troopType,
      troopType,
      troopLevel: 5,
      deploy_index: deployIndex,
    }));
  }
  actions.push({ type: 'battle_end' });
  return { actions };
}

function insertBattle({
  index,
  troopTypes,
  result,
  townHall = 5,
  verifiedResult = 'accepted',
  claimedResult = result,
  replayData,
  legacy = false,
}) {
  const sessionId = `troop-balance-session-${index}`;
  db.prepare(`
    INSERT INTO raid_matchmaking (
      battle_session_id, attacker_id, defender_id,
      attacker_th, defender_th, attack_power, base_power, base_power_ratio,
      difficulty_bucket, result
    ) VALUES (?, 'attacker', 'defender', ?, ?, 100, 100, 1, 'normal', ?)
  `).run(sessionId, townHall, townHall, result);
  db.prepare(`
    INSERT INTO battle_replays (
      attacker_id, defender_id, claimed_result, verified_result, replay_data,
      sim_th_hp_pct, sim_buildings_destroyed, duration_sec
    ) VALUES ('attacker', 'defender', ?, ?, ?, ?, ?, ?)
  `).run(
    claimedResult,
    verifiedResult,
    typeof replayData === 'string'
      ? replayData
      : JSON.stringify(replayData || replayActions(sessionId, troopTypes, legacy)),
    result === 'victory' ? 0 : 0.5,
    result === 'victory' ? 8 : 3,
    60 + index,
  );
}

try {
  db.prepare(`
    INSERT INTO players (id, name, token, level)
    VALUES ('attacker', 'Attacker', 'token-attacker', 6),
           ('defender', 'Defender', 'token-defender', 6)
  `).run();

  for (let index = 0; index < 30; index += 1) {
    const result = index < 24 ? 'victory' : 'defeat';
    insertBattle({
      index,
      troopTypes: ['Knight', 'Mage', 'Mage'],
      result,
      claimedResult: index === 0 ? 'defeat' : result,
      legacy: index % 2 === 0,
    });
  }
  for (let index = 30; index < 40; index += 1) {
    insertBattle({
      index,
      troopTypes: ['Archer', 'Archer'],
      result: index < 32 ? 'victory' : 'defeat',
    });
  }
  insertBattle({
    index: 40,
    troopTypes: ['DemonKing:base:200:Rcommon'],
    result: 'victory',
    townHall: 6,
  });
  insertBattle({
    index: 41,
    troopTypes: ['Knight'],
    result: 'pending',
    claimedResult: 'draw',
  });
  insertBattle({
    index: 42,
    troopTypes: [],
    result: 'defeat',
    replayData: '{invalid-json',
  });
  insertBattle({
    index: 43,
    troopTypes: ['Knight'],
    result: 'abandoned',
    claimedResult: 'defeat',
  });
  insertBattle({
    index: 44,
    troopTypes: ['FireDragon'],
    result: 'victory',
    verifiedResult: 'rejected',
  });

  const analytics = getTroopBalanceAnalytics(30, { limit: 500 });
  assert.equal(analytics.accepted_replays, 44);
  assert.equal(analytics.loaded_replays, 44);
  assert.equal(analytics.invalid_replay_json, 1);
  assert.equal(analytics.skipped_undecided, 2);
  assert.equal(analytics.analyzed_battles, 41);
  assert.equal(analytics.wins, 27);
  assert.equal(analytics.losses, 14);

  const knight = analytics.by_unit.find((row) => row.troop_type === 'knight');
  const mage = analytics.by_unit.find((row) => row.troop_type === 'mage');
  const archer = analytics.by_unit.find((row) => row.troop_type === 'archer');
  const demonKing = analytics.by_unit.find((row) => row.troop_type === 'demon_king');
  assert.equal(knight.battles, 30);
  assert.equal(knight.units_deployed, 30);
  assert.equal(knight.win_rate, 0.8);
  assert.equal(knight.sample_status, 'reliable');
  assert.equal(knight.balance_signal, 'high_win');
  assert.equal(mage.battles, 30);
  assert.equal(mage.units_deployed, 60);
  assert.equal(mage.avg_deployed_per_battle, 2);
  assert.equal(archer.battles, 10);
  assert.equal(archer.units_deployed, 20);
  assert.equal(archer.win_rate, 0.2);
  assert.equal(archer.sample_status, 'directional');
  assert.equal(archer.balance_signal, 'low_win');
  assert.equal(demonKing.battles, 1);
  assert.equal(demonKing.balance_signal, 'insufficient_sample');
  assert.equal(analytics.by_unit.some((row) => row.troop_type === 'fire_dragon'), false);

  const knightMage = analytics.by_pair.find(
    (row) => row.troop_a === 'knight' && row.troop_b === 'mage',
  );
  assert.equal(knightMage.battles, 30);
  assert.equal(knightMage.win_rate, 0.8);
  assert.equal(knightMage.balance_signal, 'high_win');

  const roster = analytics.by_roster.find((row) => row.label === 'Knight + Mage');
  assert.equal(roster.battles, 30);
  assert.equal(roster.avg_deployed_per_battle, 3);

  const th5Knight = analytics.by_unit_town_hall.find(
    (row) => row.town_hall_level === 5 && row.troop_type === 'knight',
  );
  assert.equal(th5Knight.battles, 30);
  assert.equal(th5Knight.town_hall_win_rate, 0.65);
  assert.equal(th5Knight.win_rate_delta, 0.15);
  assert.equal(
    getGlobalMatchmakingStats(30).troop_balance.analyzed_battles,
    analytics.analyzed_battles,
    'the existing admin matchmaking payload must expose troop analytics',
  );

  console.log('Admin troop balance analytics test passed');
} finally {
  try { db.close(); } catch {}
  try { fs.rmSync(dbPath, { force: true }); } catch {}
  try { fs.rmSync(`${dbPath}-shm`, { force: true }); } catch {}
  try { fs.rmSync(`${dbPath}-wal`, { force: true }); } catch {}
}
