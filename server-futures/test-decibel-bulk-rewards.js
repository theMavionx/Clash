'use strict';

const assert = require('assert');
const {
  recordRecentBulkFills,
  resolvePhantomDecibelSubaccount,
  normalizeBulkFill,
  verifyBulkFillTransaction,
  __test,
} = require('./decibel-bulk-rewards');

const SUBACCOUNT = '0x3786fad68f7c802a8b6a0c8f11a8f8a639fb34151f0abed1d7f7a9fb295a5c90';
const MARKET = '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861';
const BUILDER = '0xfa4d46a481f5bc95de01a629ec95b7876e946ebe1e86374284d899ac4366984a';
const TRADE_ID = '128672976336714097245499056193542';

function normalizeAddress(value) {
  const raw = String(value || '').toLowerCase();
  if (!/^0x[0-9a-f]{1,64}$/.test(raw)) return '';
  return `0x${raw.slice(2).padStart(64, '0')}`;
}

function fixtureFill() {
  return {
    trade_id: TRADE_ID,
    transaction_version: '6579916484',
    transaction_unix_ms: '1785696262200',
    price: 63400,
    filled_size: 0.00788,
    is_bid: true,
    market: MARKET,
    user: SUBACCOUNT,
    sequence_number: '1785696255995',
  };
}

function fixtureTx(builder = BUILDER) {
  return {
    hash: '0xe155309cfc9a',
    events: [
      {
        type: '0x1::market_types::BulkOrderFilledEvent',
        data: {
          fill_id: TRADE_ID,
          user: SUBACCOUNT,
          market: MARKET,
        },
      },
      {
        type: '0x1::perp_positions::TradeEvent',
        data: {
          account: SUBACCOUNT,
          fill_id: TRADE_ID,
          is_taker: false,
          market: { inner: MARKET },
          fee: '104914',
          builder_code: { vec: [{ builder, fees: '100' }] },
          fee_distribution: {
            builder_or_referrer_fees: { vec: [{ address: builder, fees: '49959' }] },
          },
        },
      },
    ],
  };
}

(async () => {
  const normalized = normalizeBulkFill(fixtureFill(), { normalizeAptosAddress: normalizeAddress });
  assert.strictEqual(normalized.tradeId, TRADE_ID);
  assert.strictEqual(normalized.notionalUsd, 499.592);

  const proof = verifyBulkFillTransaction(fixtureTx(), normalized, {
    decibelClient: { normalizeAptosAddress: normalizeAddress },
    subaccount: SUBACCOUNT,
    allowedBuilders: new Set([BUILDER]),
  });
  assert.ok(proof);
  assert.strictEqual(proof.builderAddr, BUILDER);
  assert.strictEqual(proof.builderFeeBps, 1);
  assert.strictEqual(proof.feeUsd, 0.104914);

  const wrongBuilder = verifyBulkFillTransaction(
    fixtureTx('0x1111111111111111111111111111111111111111111111111111111111111111'),
    normalized,
    {
      decibelClient: { normalizeAptosAddress: normalizeAddress },
      subaccount: SUBACCOUNT,
      allowedBuilders: new Set([BUILDER]),
    },
  );
  assert.strictEqual(wrongBuilder, null);

  __test.transactionCache.clear();
  const stored = new Map();
  const proofs = [];
  const fakeDb = {
    getTradeByClientOrderId(playerId, dex, clientOrderId) {
      return stored.get(`${playerId}:${dex}:${clientOrderId}`) || null;
    },
    upsertVerifiedTrade(playerId, trade) {
      const key = `${playerId}:${trade.dex}:${trade.clientOrderId}`;
      if (stored.has(key)) return { inserted: 0, updated: 0, changes: 0 };
      stored.set(key, { id: stored.size + 1, trade });
      return { inserted: 1, updated: 0, changes: 1, id: stored.size };
    },
    recordDecibelOrderProof(input) {
      proofs.push(input);
      return { changes: 1 };
    },
  };
  const fakeClient = {
    normalizeAptosAddress: normalizeAddress,
    async fetchBulkOrderFills() { return [fixtureFill()]; },
    async fetchMarkets() { return [{ market: MARKET, market_name: 'BTC-USD' }]; },
    async fetchAptosJsonPath(path) {
      assert.strictEqual(path, 'transactions/by_version/6579916484');
      return fixtureTx();
    },
  };
  const first = await recordRecentBulkFills('player-a', SUBACCOUNT, {
    decibelClient: fakeClient,
    tradeDb: fakeDb,
    env: {},
  });
  assert.strictEqual(first.imported, 1);
  assert.strictEqual(first.verified, 1);
  assert.strictEqual(first.imported_volume_usd, 499.592);
  assert.strictEqual(stored.size, 1);
  assert.strictEqual(proofs.length, 1);
  const inserted = [...stored.values()][0].trade;
  assert.strictEqual(inserted.symbol, 'BTC');
  assert.strictEqual(inserted.verifiedSource, 'decibel_fill');
  assert.strictEqual(inserted.createdAt, '2026-08-02T18:44:22.200Z');
  assert.strictEqual(JSON.parse(inserted.proofJson).bulk_trade_id, TRADE_ID);

  const second = await recordRecentBulkFills('player-a', SUBACCOUNT, {
    decibelClient: fakeClient,
    tradeDb: fakeDb,
    env: {},
  });
  assert.strictEqual(second.imported, 0);
  assert.strictEqual(second.existing, 1);
  assert.strictEqual(stored.size, 1);

  __test.phantomSubaccountCache.clear();
  const resolved = await resolvePhantomDecibelSubaccount('player-a', {
    env: { CLASH_BOT_URL: 'http://bot.local', CLASH_BOT_PROXY_SECRET: 'test-secret' },
    decibelClient: { normalizeAptosAddress: normalizeAddress },
    fetchImpl: async (url, options) => {
      assert.strictEqual(url, 'http://bot.local/api/v1/accounts');
      assert.strictEqual(options.headers['x-tenant-id'], 'player-a');
      assert.strictEqual(options.headers['x-proxy-secret'], 'test-secret');
      return {
        ok: true,
        async json() {
          return { success: true, data: [{ exchange: 'decibel', status: 'active', sub_account: SUBACCOUNT }] };
        },
      };
    },
  });
  assert.strictEqual(resolved, SUBACCOUNT);

  console.log('decibel bulk rewards: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
