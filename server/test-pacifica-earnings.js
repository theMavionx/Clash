'use strict';

const assert = require('node:assert/strict');

const originalFetch = global.fetch;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

async function main() {
  try {
    const primaryUrls = [];
    global.fetch = async (url) => {
      primaryUrls.push(String(url));
      if (String(url).includes('/leaderboard/builder_code?')) {
        return jsonResponse(200, {
          success: true,
          data: [
            { fees_all_time: '1.25', volume_all_time: '100.5' },
            { fees_all_time: '2.75', volume_all_time: '199.5' },
          ],
          has_more: false,
        });
      }
      throw new Error(`Unexpected primary Pacifica URL: ${url}`);
    };

    const { fetchEarningsDex } = require('./earnings');
    const primary = await fetchEarningsDex('pacifica', { force: true });
    assert.equal(primary.row.ok, true);
    assert.equal(primary.row.earned_usd, 4);
    assert.equal(primary.row.volume_usd, 300);
    assert.equal(primary.row.traded_referrals, 2);
    assert.equal(primary.row.model, 'pacifica_builder_leaderboard_fee_sum');
    assert.equal(primaryUrls.length, 1, 'healthy aggregate must need one Pacifica request');
    assert.match(primaryUrls[0], /\/leaderboard\/builder_code\?builder_code=clashofperps/);

    const fallbackUrls = [];
    global.fetch = async (url) => {
      const value = String(url);
      fallbackUrls.push(value);
      if (value.includes('/leaderboard/builder_code?')) {
        return jsonResponse(503, { error: 'aggregate unavailable' });
      }
      if (value.includes('/builder/trades?') && !value.includes('cursor=')) {
        return jsonResponse(200, {
          data: [{ builder_fee: '0.10' }],
          has_more: true,
          next_cursor: 'next-page',
        });
      }
      if (value.includes('/builder/trades?') && value.includes('cursor=next-page')) {
        return jsonResponse(200, {
          data: [{ builder_fee: '0.20' }],
          has_more: false,
          next_cursor: null,
        });
      }
      throw new Error(`Unexpected fallback Pacifica URL: ${url}`);
    };

    const fallback = await fetchEarningsDex('pacifica', { force: true });
    assert.equal(fallback.row.ok, true);
    assert.ok(Math.abs(fallback.row.earned_usd - 0.30) < 1e-12);
    assert.equal(fallback.row.trades, 2);
    assert.equal(fallback.row.model, 'pacifica_builder_trades_sum');
    assert.match(fallback.row.aggregate_fallback_reason, /HTTP 503/);
    assert.equal(fallbackUrls.length, 3, 'fallback must read the complete cursor history');

    console.log('pacifica admin earnings aggregate and fallback: ok');
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
