'use strict';

const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const raidTrophies = require('./raid_trophy_progression');

function run() {
  const expected = [
    [1, 6, 3],
    [2, 12, 6],
    [3, 18, 9],
    [4, 22, 11],
    [5, 30, 15],
    [6, 30, 15],
    [10, 30, 15],
  ];
  for (const [townHall, win, loss] of expected) {
    const profile = raidTrophies.trophyProfileForTownHall(townHall);
    assert.equal(profile.win_trophies, win, `TH${townHall} win trophies`);
    assert.equal(profile.loss_trophies, loss, `TH${townHall} loss trophies`);
  }

  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE buildings (
        player_id TEXT NOT NULL,
        type TEXT NOT NULL,
        level INTEGER NOT NULL
      );
      INSERT INTO buildings VALUES
        ('low', 'town_hall', 2),
        ('high', 'town_hall', 7);
    `);
    const highAttacksLow = raidTrophies.trophyProfileForMatch(db, 'high', 'low');
    assert.equal(highAttacksLow.attack_win_trophies, 12, 'reward follows target difficulty');
    assert.equal(highAttacksLow.attack_loss_trophies, 15, 'failed attack penalty follows attacker tier');
    assert.equal(highAttacksLow.defense_loss_trophies, 6, 'defense loss follows defender tier');

    const lowAttacksHigh = raidTrophies.trophyProfileForMatch(db, 'low', 'high');
    assert.equal(lowAttacksHigh.attack_win_trophies, 30, 'upset win earns the target tier reward');
    assert.equal(lowAttacksHigh.attack_loss_trophies, 6);
    assert.equal(lowAttacksHigh.defense_loss_trophies, 15);
  } finally {
    db.close();
  }

  console.log('raid trophy progression tests: PASS');
}

run();
