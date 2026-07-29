'use strict';

const TROPHY_PROGRESS_BY_TOWN_HALL = Object.freeze({
  1: Object.freeze({ win: 6, loss: 3 }),
  2: Object.freeze({ win: 12, loss: 6 }),
  3: Object.freeze({ win: 18, loss: 9 }),
  4: Object.freeze({ win: 22, loss: 11 }),
  5: Object.freeze({ win: 30, loss: 15 }),
});

const MAX_TROPHY_TIER = 5;

function normalizeTownHallLevel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function trophyProfileForTownHall(townHallLevel) {
  const normalizedLevel = normalizeTownHallLevel(townHallLevel);
  const tier = Math.min(MAX_TROPHY_TIER, normalizedLevel);
  const values = TROPHY_PROGRESS_BY_TOWN_HALL[tier];
  return {
    town_hall_level: normalizedLevel,
    trophy_tier: tier,
    win_trophies: values.win,
    loss_trophies: values.loss,
  };
}

function playerTownHallLevel(db, playerId) {
  if (!db || !playerId) return 1;
  const row = db.prepare(`
    SELECT COALESCE(MAX(level), 1) AS level
      FROM buildings
     WHERE player_id = ? AND type = 'town_hall'
  `).get(playerId);
  return normalizeTownHallLevel(row?.level);
}

function trophyProfileForPlayer(db, playerId) {
  return trophyProfileForTownHall(playerTownHallLevel(db, playerId));
}

function trophyProfileForMatch(db, attackerId, defenderId) {
  const attacker = trophyProfileForPlayer(db, attackerId);
  const defender = trophyProfileForPlayer(db, defenderId);
  return {
    attacker,
    defender,
    attack_win_trophies: defender.win_trophies,
    attack_loss_trophies: attacker.loss_trophies,
    defense_win_trophies: defender.win_trophies,
    defense_loss_trophies: defender.loss_trophies,
  };
}

module.exports = {
  TROPHY_PROGRESS_BY_TOWN_HALL,
  MAX_TROPHY_TIER,
  normalizeTownHallLevel,
  trophyProfileForTownHall,
  playerTownHallLevel,
  trophyProfileForPlayer,
  trophyProfileForMatch,
};
