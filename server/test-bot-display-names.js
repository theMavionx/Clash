'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-bot-names-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.TOURNAMENT_DAILY_POOL_SCHEDULER = '0';
process.env.LUCKY_RAIDER_PAYOUT_WORKER = '0';

const matchmaking = require('./matchmaking_defs');
const game = require('./db');

try {
  const templates = matchmaking.buildBotBaseTemplates();
  assert.ok(templates.length > 5000, 'the production-sized bot catalog must be exercised');
  assert.equal(
    templates.some((template) => /[0-9]/.test(template.name)),
    false,
    'template display names must never expose numeric bot suffixes',
  );
  assert.equal(
    new Set(templates.map((template) => template.name.toLowerCase())).size,
    templates.length,
    'template display names must be unique without relying on case',
  );
  for (const template of templates) {
    assert.ok(template.name.length >= 2 && template.name.length <= 30, template.name);
  }

  for (let index = 0; index < 1000; index += 37) {
    const candidate = matchmaking.playerLikeDisplayNameAt(4_000_000_000 + index);
    assert.equal(/[0-9]/.test(candidate), false, candidate);
    assert.ok(candidate.length >= 2 && candidate.length <= 30, candidate);
  }

  game.db.prepare(`
    INSERT INTO players (id, name, token, is_bot)
    VALUES ('real-natex', 'natex', 'real-natex-token', 0)
  `).run();
  const insertBot = game.db.prepare(`
    INSERT INTO players (id, name, token, is_bot)
    VALUES (?, ?, ?, 1)
  `);
  insertBot.run('bot-numeric-one', 'natex4463', 'bot-numeric-one-token');
  insertBot.run('bot-numeric-two', 'markpro2081', 'bot-numeric-two-token');
  insertBot.run('bot-clean', 'Purple Monk', 'bot-clean-token');

  const migration = game.normalizeRaidBotDisplayNames();
  assert.deepEqual(migration, { scanned: 2, updated: 2 });

  const real = game.db.prepare("SELECT name FROM players WHERE id = 'real-natex'").get();
  assert.equal(real.name, 'natex', 'real player names must never be rewritten');

  const bots = game.db.prepare(`
    SELECT id, name
      FROM players
     WHERE COALESCE(is_bot, 0) = 1
     ORDER BY id
  `).all();
  assert.equal(bots.some((bot) => /[0-9]/.test(bot.name)), false, JSON.stringify(bots));
  assert.equal(new Set(bots.map((bot) => bot.name.toLowerCase())).size, bots.length);
  assert.equal(bots.find((bot) => bot.id === 'bot-clean')?.name, 'Purple Monk');
  assert.notEqual(
    bots.find((bot) => bot.id === 'bot-numeric-one')?.name.toLowerCase(),
    'natex',
    'migration must avoid collisions with real players',
  );
  assert.deepEqual(game.normalizeRaidBotDisplayNames(), { scanned: 0, updated: 0 });

  console.log('raid bot display name tests: PASS');
} finally {
  game.db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
