'use strict';

const assert = require('assert');
const {
  extractJson,
  generateTournamentDraft,
  normalizeDraft,
  systemPrompt,
} = require('./tournament_ai_builder');

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

async function main() {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-only-key';
  try {
    const calls = [];
    const result = await generateTournamentDraft({
      prompt: 'Create a two-day Ostium volume tournament with different daily rewards.',
      currentDraft: { name: 'Existing draft', status: 'draft' },
      models: ['broken/model', 'incomplete/model', 'working/model'],
      fetchImpl: async (_url, options) => {
        const request = JSON.parse(options.body);
        calls.push(request);
        if (request.model === 'broken/model') {
          return response(429, { error: { message: 'rate limited' } });
        }
        if (request.model === 'incomplete/model') {
          return response(200, {
            choices: [{
              message: {
                content: '{"summary":"Not enough fields","draft":{"sort_by":"volume_usd"}} trailing explanation',
              },
            }],
          });
        }
        return response(200, {
          choices: [{
            message: {
              content: JSON.stringify({
                summary: 'Two-day plan ready.',
                warnings: ['Daily payouts still require admin review.'],
                draft: {
                  status: 'active',
                  delete_all_tournaments: true,
                  name: 'Ostium Daily Sprint',
                  dex: 'ostium',
                  dex_scope: 'single',
                  eligible_dexes: ['ostium', 'not-a-dex'],
                  start_at: '2026-08-01T22:00:00Z',
                  end_at: '2026-08-03T22:00:00Z',
                  points_trophy_weight: 20,
                  points_volume_weight: 70,
                  points_pnl_weight: 10,
                  reward_config: {
                    daily_pools: [
                      {
                        day_utc: '2026-08-02',
                        label: 'Day 1',
                        volume_target_usd: 25000,
                        volume_target_scope: 'player',
                        top_n: 3,
                        rewards: [{
                          type: 'money',
                          label: 'Daily USDC',
                          currency: 'USDC',
                          pool_amount: 100,
                          winners: 3,
                          payouts: [
                            { rank: 1, amount: 50 },
                            { rank: 2, amount: 30 },
                            { rank: 3, amount: 20 },
                          ],
                        }],
                      },
                      {
                        day_utc: '2026-08-03',
                        label: 'Day 2',
                        volume_target_usd: 50000,
                        volume_target_scope: 'tournament',
                        top_n: 5,
                        rewards: [{
                          type: 'points',
                          label: 'COP points',
                          pool_amount: 500,
                          winners: 5,
                        }],
                      },
                    ],
                    final_pools: [],
                  },
                },
              }),
            },
          }],
        });
      },
    });

    assert.deepStrictEqual(calls.map((call) => call.model), ['broken/model', 'incomplete/model', 'working/model']);
    assert.strictEqual(result.model, 'working/model');
    assert.strictEqual(result.draft.name, 'Ostium Daily Sprint');
    assert.strictEqual(result.draft.status, undefined);
    assert.strictEqual(result.draft.delete_all_tournaments, undefined);
    assert.deepStrictEqual(result.draft.eligible_dexes, ['ostium']);
    assert.strictEqual(result.draft.reward_config.daily_pools.length, 2);
    assert.strictEqual(result.draft.reward_config.daily_pools[0].day_utc, '2026-08-02');
    assert.strictEqual(result.draft.reward_config.daily_pools[0].volume_target_usd, 25000);
    assert.strictEqual(result.draft.reward_config.daily_pools[1].volume_target_scope, 'tournament');
    assert.strictEqual(
      result.draft.points_trophy_weight
        + result.draft.points_volume_weight
        + result.draft.points_pnl_weight,
      100,
    );

    const normalized = normalizeDraft({
      reward_config: {
        daily_pools: [{
          day_utc: 'not-a-day',
          volume_target_usd: -50,
          volume_target_scope: 'invalid',
          rewards: [{ type: 'script', pool_amount: 20 }],
        }],
      },
    });
    assert.strictEqual(normalized.reward_config.daily_pools[0].day_utc, '');
    assert.strictEqual(normalized.reward_config.daily_pools[0].volume_target_usd, 0);
    assert.strictEqual(normalized.reward_config.daily_pools[0].volume_target_scope, 'player');
    assert.strictEqual(normalized.reward_config.daily_pools[0].rewards[0].type, 'money');
    assert.deepStrictEqual(
      extractJson('prefix {"draft":{"name":"First"}} suffix {"ignored":true}'),
      { draft: { name: 'First' } },
    );

    const prompt = systemPrompt(new Date('2026-07-29T12:00:00Z'));
    assert(prompt.includes('do not have tools, database access, payout permissions'));
    assert(prompt.includes('Do not set status'));
    assert(prompt.includes('volume_target_scope'));

    console.log('Tournament AI builder tests passed');
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
