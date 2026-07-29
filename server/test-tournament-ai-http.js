'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-tournament-ai-http-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.ADMIN_KEY = 'tournament-ai-local-admin';
process.env.CLASH_ADMIN_KEY = process.env.ADMIN_KEY;
process.env.OPENROUTER_API_KEY = 'test-only-key';
process.env.CLASH_TOURNAMENT_AI_MODELS = 'test/tournament-model';
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

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function run() {
  let openRouterRequest = null;
  const openRouter = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      openRouterRequest = JSON.parse(body || '{}');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Three-day event configured.',
              warnings: ['Confirm payout funding.'],
              draft: {
                name: 'AI Pacifica Daily Volume',
                description: 'Three independent UTC daily plans.',
                dex: 'pacifica',
                dex_scope: 'single',
                eligible_dexes: ['pacifica'],
                start_at: '2026-08-01 22:00:00',
                end_at: '2026-08-04 22:00:00',
                sort_by: 'volume_usd',
                scoring_mode: 'daily_pool',
                daily_pool_points: 1000,
                daily_pool_award_time_utc: '22:00',
                points_trophy_weight: 0,
                points_volume_weight: 100,
                points_pnl_weight: 0,
                reward_config: {
                  daily_pools: [1, 2, 3].map((day) => ({
                    enabled: true,
                    label: `Day ${day}`,
                    day_utc: `2026-08-0${day + 1}`,
                    volume_target_usd: day * 10000,
                    volume_target_scope: day === 3 ? 'tournament' : 'player',
                    top_n: 3,
                    metric: 'volume_usd',
                    rewards: [{
                      type: 'money',
                      label: 'Daily USDC',
                      currency: 'USDC',
                      unit: 'USDC',
                      pool_amount: 100,
                      winners: 3,
                      payouts: [
                        { rank: 1, amount: 50 },
                        { rank: 2, amount: 30 },
                        { rank: 3, amount: 20 },
                      ],
                    }],
                  })),
                  final_pools: [],
                },
              },
            }),
          },
        }],
      }));
    });
  });
  await listen(openRouter);
  process.env.CLASH_TOURNAMENT_AI_URL = `http://127.0.0.1:${openRouter.address().port}/v1/chat/completions`;

  const { router } = require('./routes');
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const api = await listen(http.createServer(app));
  const baseUrl = `http://127.0.0.1:${api.address().port}/api`;
  const headers = {
    'content-type': 'application/json',
    'x-admin-key': process.env.ADMIN_KEY,
  };

  try {
    const unauthorized = await fetch(`${baseUrl}/admin/tournaments/ai/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Create a daily volume tournament' }),
    });
    if (![401, 403].includes(unauthorized.status)) {
      throw new Error(`AI endpoint accepted unauthenticated request: ${unauthorized.status}`);
    }

    const planResponse = await fetch(`${baseUrl}/admin/tournaments/ai/plan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: 'Create three Pacifica days with a separate reward and volume target per day.',
        current_draft: { name: 'Current draft', status: 'draft' },
      }),
    });
    const plan = await planResponse.json();
    if (!planResponse.ok || !plan.ok) throw new Error(`AI planning failed: ${JSON.stringify(plan)}`);
    if (openRouterRequest?.model !== 'test/tournament-model') {
      throw new Error(`Unexpected model request: ${JSON.stringify(openRouterRequest)}`);
    }
    if (!String(openRouterRequest?.messages?.[0]?.content || '').includes('Do not set status')) {
      throw new Error('Guarded tournament system prompt was not sent');
    }
    if (plan.draft?.reward_config?.daily_pools?.length !== 3) {
      throw new Error(`Daily plans missing from AI response: ${JSON.stringify(plan)}`);
    }

    const createResponse = await fetch(`${baseUrl}/admin/tournaments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...plan.draft,
        status: 'draft',
        prize_tiers: [],
        mega_config: {},
        rewards_in_cop: false,
      }),
    });
    const created = await createResponse.json();
    if (!createResponse.ok || !created.ok) throw new Error(`Tournament create failed: ${JSON.stringify(created)}`);
    const pools = created.tournament?.reward_config?.daily_pools || [];
    if (pools.length !== 3) throw new Error(`Daily plans were not persisted: ${JSON.stringify(created)}`);
    if (
      pools[0].day_utc !== '2026-08-02'
      || pools[0].volume_target_usd !== 10000
      || pools[2].volume_target_scope !== 'tournament'
    ) {
      throw new Error(`Daily plan fields changed during persistence: ${JSON.stringify(pools)}`);
    }

    console.log('Tournament AI admin HTTP tests passed');
  } finally {
    await close(api);
    await close(openRouter);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
