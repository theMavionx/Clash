'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-ranked-http-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.ADMIN_KEY = 'ranked-local-admin';
process.env.CLASH_ADMIN_KEY = process.env.ADMIN_KEY;
process.env.CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER = '0';
process.env.NFT_SUPPLY_REFRESH_DISABLE = '1';
process.env.NFT_OWNERSHIP_DAILY_SYNC = '0';
process.env.GAME_SHOP_SOLANA_RECONCILE_ENABLED = '0';
process.env.TOURNAMENT_DAILY_POOL_SCHEDULER = '0';
process.env.LUCKY_RAIDER_PAYOUT_WORKER = '0';

const nativeSetInterval = global.setInterval;
global.setInterval = (...args) => {
  const timer = nativeSetInterval(...args);
  timer.unref?.();
  return timer;
};

const { router } = require('./routes');
const clashDb = require('./db');

function sqlUtc(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

async function run() {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const adminHeaders = {
    'content-type': 'application/json',
    'x-admin-key': process.env.ADMIN_KEY,
  };
  const playerHeaders = {
    'content-type': 'application/json',
    'x-token': 'ranked-player-token',
  };

  try {
    clashDb.db.prepare(`
      INSERT INTO players (id, name, token, dex, gold, wood, ore)
      VALUES ('ranked-player', 'RankedPlayer', 'ranked-player-token', 'ostium', 10000, 10000, 10000)
    `).run();
    clashDb.db.prepare(`
      INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
      VALUES ('ranked-player', 'town_hall', 3, 2, 2, 0, 5000, 5000)
    `).run();

    const createResponse = await fetch(`${baseUrl}/admin/tournaments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Local Ranked Raid',
        description: 'HTTP smoke',
        dex: 'ostium',
        dex_scope: 'single',
        eligible_dexes: ['ostium'],
        mode: 'individual',
        status: 'active',
        battle_mode: 'ranked_raids',
        ranked_daily_attack_limit: 20,
        ranked_shield_hours: 1.5,
        ranked_max_defenses_per_day: 20,
        ranked_altar_bonus_enabled: false,
        prize_tiers: [],
        reward_config: {},
        mega_config: {},
        points_trophy_weight: 40,
        points_volume_weight: 40,
        points_pnl_weight: 20,
        daily_pool_award_time_utc: '21:59',
      }),
    });
    const created = await createResponse.json();
    if (!createResponse.ok) throw new Error(`create failed: ${JSON.stringify(created)}`);
    if (!created.ok || !created.tournament?.is_ranked_raid) {
      throw new Error(`invalid create response: ${JSON.stringify(created)}`);
    }

    const patchResponse = await fetch(`${baseUrl}/admin/tournaments/${created.tournament.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        ranked_daily_attack_limit: 17,
        ranked_shield_hours: 0,
        ranked_max_defenses_per_day: 17,
        ranked_altar_bonus_enabled: true,
      }),
    });
    const patched = await patchResponse.json();
    if (!patchResponse.ok) throw new Error(`patch failed: ${JSON.stringify(patched)}`);
    if (
      patched.tournament?.ranked_daily_attack_limit !== 17
      || patched.tournament?.ranked_shield_hours !== 0
      || patched.tournament?.ranked_max_defenses_per_day !== 17
      || patched.tournament?.ranked_altar_bonus_enabled !== true
    ) {
      throw new Error(`invalid patch response: ${JSON.stringify(patched)}`);
    }

    const joinLiveResponse = await fetch(`${baseUrl}/tournaments/${created.tournament.id}/join`, {
      method: 'POST',
      headers: playerHeaders,
      body: '{}',
    });
    const joinedLive = await joinLiveResponse.json();
    if (!joinLiveResponse.ok || !joinedLive.joined) {
      throw new Error(`live join failed: ${JSON.stringify(joinedLive)}`);
    }
    const disableRankedResponse = await fetch(`${baseUrl}/admin/tournaments/${created.tournament.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ battle_mode: 'casual' }),
    });
    const disableRanked = await disableRankedResponse.json();
    if (disableRankedResponse.status !== 409 || !/cannot be disabled/i.test(disableRanked.error || '')) {
      throw new Error(`live ranked mode was not locked: ${JSON.stringify(disableRanked)}`);
    }
    const changeCapResponse = await fetch(`${baseUrl}/admin/tournaments/${created.tournament.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ ranked_daily_attack_limit: 20 }),
    });
    const changeCap = await changeCapResponse.json();
    if (changeCapResponse.status !== 409 || !/locked at 17/i.test(changeCap.error || '')) {
      throw new Error(`live ranked cap was not locked: ${JSON.stringify(changeCap)}`);
    }
    const leaveLiveResponse = await fetch(`${baseUrl}/tournaments/${created.tournament.id}/leave`, {
      method: 'POST',
      headers: playerHeaders,
      body: '{}',
    });
    const leaveLive = await leaveLiveResponse.json();
    if (leaveLiveResponse.status !== 409 || leaveLive.reason !== 'ranked_tournament_locked') {
      throw new Error(`live ranked leave was not blocked: ${JSON.stringify(leaveLive)}`);
    }
    clashDb.db.prepare(`
      UPDATE tournament_participants
         SET gold = 99,
             trades_count = 4,
             volume_usd = 1234.5,
             pnl_usd = 12.5
       WHERE tournament_id = ? AND player_id = 'ranked-player'
    `).run(created.tournament.id);

    const startAt = sqlUtc(Date.now() + 24 * 60 * 60 * 1000);
    const registrationClose = sqlUtc(Date.now() + 12 * 60 * 60 * 1000);
    const preregResponse = await fetch(`${baseUrl}/admin/tournaments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Local Ranked Preregistration',
        description: 'HTTP preregistration smoke',
        dex: 'ostium',
        dex_scope: 'single',
        eligible_dexes: ['ostium'],
        mode: 'individual',
        status: 'active',
        start_at: startAt,
        end_at: sqlUtc(Date.now() + 4 * 24 * 60 * 60 * 1000),
        preregistration_enabled: true,
        registration_closes_at: registrationClose,
        registration_require_twitter: true,
        battle_mode: 'ranked_raids',
        ranked_daily_attack_limit: 20,
        ranked_shield_hours: 0,
        ranked_max_defenses_per_day: 20,
        ranked_altar_bonus_enabled: false,
        prize_tiers: [],
        reward_config: {},
        mega_config: {},
        points_trophy_weight: 40,
        points_volume_weight: 40,
        points_pnl_weight: 20,
      }),
    });
    const prereg = await preregResponse.json();
    if (!preregResponse.ok || prereg.tournament?.phase !== 'preregistration') {
      throw new Error(`prereg create failed: ${JSON.stringify(prereg)}`);
    }
    const joinPreregResponse = await fetch(`${baseUrl}/tournaments/${prereg.tournament.id}/join`, {
      method: 'POST',
      headers: playerHeaders,
      body: JSON.stringify({ twitter_handle: '@rankedplayer' }),
    });
    if (!joinPreregResponse.ok) {
      throw new Error(`prereg join failed: ${JSON.stringify(await joinPreregResponse.json())}`);
    }
    clashDb.db.prepare(`
      UPDATE tournament_participants
         SET trophies = -15
       WHERE tournament_id = ? AND player_id = 'ranked-player'
    `).run(prereg.tournament.id);
    const leavePreregResponse = await fetch(`${baseUrl}/tournaments/${prereg.tournament.id}/leave`, {
      method: 'POST',
      headers: playerHeaders,
      body: '{}',
    });
    if (!leavePreregResponse.ok) {
      throw new Error(`prereg leave failed: ${JSON.stringify(await leavePreregResponse.json())}`);
    }
    const rejoinPreregResponse = await fetch(`${baseUrl}/tournaments/${prereg.tournament.id}/join`, {
      method: 'POST',
      headers: playerHeaders,
      body: JSON.stringify({ twitter_handle: '@rankedplayer' }),
    });
    if (!rejoinPreregResponse.ok) {
      throw new Error(`prereg rejoin failed: ${JSON.stringify(await rejoinPreregResponse.json())}`);
    }
    const preserved = clashDb.db.prepare(`
      SELECT trophies, left_at
        FROM tournament_participants
       WHERE tournament_id = ? AND player_id = 'ranked-player'
    `).get(prereg.tournament.id);
    if (Number(preserved?.trophies) !== -15 || preserved?.left_at !== null) {
      throw new Error(`ranked rejoin reset score: ${JSON.stringify(preserved)}`);
    }

    clashDb.db.prepare("UPDATE players SET dex = 'phoenix' WHERE id = 'ranked-player'").run();
    const rankedListResponse = await fetch(`${baseUrl}/tournaments/ranked-raids`, {
      headers: { 'x-token': playerHeaders['x-token'] },
    });
    const rankedList = await rankedListResponse.json();
    if (!rankedListResponse.ok || rankedList.tournaments?.length !== 0) {
      throw new Error(`ranked list ignored the active DEX: ${JSON.stringify(rankedList)}`);
    }
    const ostiumRankedResponse = await fetch(`${baseUrl}/tournaments/ranked-raids?dex=ostium`, {
      headers: { 'x-token': playerHeaders['x-token'] },
    });
    const ostiumRanked = await ostiumRankedResponse.json();
    if (!ostiumRankedResponse.ok || ostiumRanked.tournaments?.length !== 2) {
      throw new Error(`active Ostium ranked tournaments missing: ${JSON.stringify(ostiumRanked)}`);
    }
    const liveRanked = ostiumRanked.tournaments.find(
      (tournament) => Number(tournament.id) === Number(created.tournament.id)
    );
    if (
      !liveRanked?.joined
      || Number(liveRanked.me?.volume_usd) !== 1234.5
      || Number(liveRanked.me?.pnl_usd) !== 12.5
      || Number(liveRanked.me?.gold) !== 99
    ) {
      throw new Error(`ranked selector did not expose shared trading metrics: ${JSON.stringify(liveRanked)}`);
    }
    const genericListResponse = await fetch(`${baseUrl}/tournaments`);
    const genericList = await genericListResponse.json();
    if (
      !genericListResponse.ok
      || !genericList.tournaments?.some((tournament) => Number(tournament.id) === Number(created.tournament.id))
      || !genericList.tournaments?.some((tournament) => Number(tournament.id) === Number(prereg.tournament.id))
    ) {
      throw new Error(`ranked-enabled events are missing from the tournament list: ${JSON.stringify(genericList)}`);
    }
    const competingResponse = await fetch(`${baseUrl}/admin/tournaments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Older Unjoined Ostium Event',
        description: 'Must not replace the joined event in the player panel',
        dex: 'ostium',
        dex_scope: 'single',
        eligible_dexes: ['ostium'],
        mode: 'individual',
        status: 'active',
        start_at: sqlUtc(Date.now() - 48 * 60 * 60 * 1000),
        end_at: sqlUtc(Date.now() + 48 * 60 * 60 * 1000),
        battle_mode: 'standard',
        prize_tiers: [],
        reward_config: {},
        mega_config: {},
        points_trophy_weight: 40,
        points_volume_weight: 40,
        points_pnl_weight: 20,
      }),
    });
    const competing = await competingResponse.json();
    if (!competingResponse.ok || !competing.tournament?.id) {
      throw new Error(`competing tournament create failed: ${JSON.stringify(competing)}`);
    }
    const genericMeResponse = await fetch(`${baseUrl}/tournaments/me?dex=ostium`, {
      headers: { 'x-token': playerHeaders['x-token'] },
    });
    const genericMe = await genericMeResponse.json();
    if (
      !genericMeResponse.ok
      || Number(genericMe.tournament?.id) !== Number(created.tournament.id)
      || !genericMe.joined
      || !genericMe.ranked_raid?.enabled
      || Number(genericMe.me?.volume_usd) !== 1234.5
      || Number(genericMe.me?.pnl_usd) !== 12.5
    ) {
      throw new Error(`ranked add-on is not part of the shared tournament panel: ${JSON.stringify(genericMe)}`);
    }

    clashDb.db.prepare(`
      UPDATE tournaments
         SET status = 'ended',
             end_at = datetime('now', '-1 minute')
       WHERE id = ?
    `).run(created.tournament.id);
    clashDb.db.prepare("UPDATE players SET dex = 'ostium' WHERE id = 'ranked-player'").run();
    const genericHistoryResponse = await fetch(`${baseUrl}/tournaments/history`, {
      headers: { 'x-token': playerHeaders['x-token'] },
    });
    const genericHistory = await genericHistoryResponse.json();
    if (
      !genericHistoryResponse.ok
      || !genericHistory.tournaments?.some((tournament) => Number(tournament.id) === Number(created.tournament.id))
    ) {
      throw new Error(`ranked-enabled tournament is missing from shared history: ${JSON.stringify(genericHistory)}`);
    }

    const listResponse = await fetch(`${baseUrl}/admin/tournaments`, {
      headers: { 'x-admin-key': process.env.ADMIN_KEY },
    });
    const listed = await listResponse.json();
    if (!listResponse.ok || listed.tournaments?.length !== 3) {
      throw new Error(`list failed: ${JSON.stringify(listed)}`);
    }
    console.log('ranked raid tournament HTTP tests: PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    // Route modules own background timers. Let process shutdown close SQLite;
    // closing it here races those timers and makes the smoke test flaky.
    void clashDb;
  }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
