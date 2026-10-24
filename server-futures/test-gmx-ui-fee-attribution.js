const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  GMX_UI_FEE_BPS,
  GMX_UI_FEE_FACTOR,
  GMX_UI_FEE_RECEIVER,
  hasClashGmxUiFee,
} = require('./gmx-ui-fee');
const {
  GMX_UI_FEE_ATTRIBUTION_CUTOVER_TS,
  applyUiFeeAttributionCutover,
  classifyOrderAction,
  importActionsForRow,
  sqlDateFromUnixSeconds,
} = require('./gmx-rewards-worker');

assert.equal(GMX_UI_FEE_RECEIVER, '0x39b36f1edf2ef5a6f2e02991b3a85fb356eb5005');
assert.equal(GMX_UI_FEE_BPS, 1);
assert.equal(GMX_UI_FEE_FACTOR, 100000000000000000000000000n);
assert.equal(hasClashGmxUiFee({
  uiFeeReceiver: '0x39B36f1EDF2eF5a6f2e02991b3a85Fb356eB5005',
  uiFeeFactor: GMX_UI_FEE_FACTOR.toString(),
}), true);
assert.equal(hasClashGmxUiFee({
  uiFeeReceiver: GMX_UI_FEE_RECEIVER,
  uiFeeFactor: '0',
}), false, 'zero-factor orders must not receive tournament/gold attribution');
assert.equal(hasClashGmxUiFee({
  uiFeeReceiver: '0x0000000000000000000000000000000000000001',
  uiFeeFactor: GMX_UI_FEE_FACTOR.toString(),
}), false);
assert.equal(hasClashGmxUiFee({
  uiFeeReceiver: GMX_UI_FEE_RECEIVER,
  uiFeeFactor: 'not-a-number',
}), false);

const expectedCutover = Math.floor(Date.parse('2026-08-14T00:00:00.000Z') / 1000);
assert.equal(GMX_UI_FEE_ATTRIBUTION_CUTOVER_TS, expectedCutover);
assert.equal(applyUiFeeAttributionCutover(expectedCutover - 86400), expectedCutover,
  'worker restart lookback must not cross the exact-attribution cutover');
assert.equal(applyUiFeeAttributionCutover(expectedCutover + 60), expectedCutover + 60,
  'recent cursors must remain monotonic after cutover');

const workerSource = require('node:fs').readFileSync(
  require.resolve('./gmx-rewards-worker'),
  'utf8'
);
assert.doesNotMatch(workerSource, /UPDATE\s+trade_history[\s\S]*SET\s+status\s*=\s*['"]ignored['"]/i,
  'exact-attribution rollout must not rewrite historical referral-only rows');

async function assertLegacyRowPreserved() {
  const legacyDb = new Database(':memory:');
  legacyDb.exec(`
    CREATE TABLE trade_history (
      client_order_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      verified_source TEXT NOT NULL
    );
    INSERT INTO trade_history (client_order_id, status, verified_source)
    VALUES ('gmx:open:0x0000000000000000000000000000000000000002:legacy-order', 'filled', 'worker');
  `);

  const invalidProofAction = {
    id: 'legacy-action',
    account: '0x0000000000000000000000000000000000000002',
    timestamp: expectedCutover + 60,
    eventName: 'OrderExecuted',
    orderType: 2,
    isLong: true,
    sizeDeltaUsd: (1000n * (10n ** 30n)).toString(),
    marketAddress: '0x0000000000000000000000000000000000000003',
    orderKey: 'legacy-order',
    transactionHash: '0xlegacy',
    uiFeeReceiver: GMX_UI_FEE_RECEIVER,
    uiFeeFactor: '0',
  };

  const result = await importActionsForRow(
    { id: 1, wallet: invalidProofAction.account },
    { [invalidProofAction.marketAddress.toLowerCase()]: { symbol: 'BTC' } },
    {
      since: expectedCutover,
      updateCursor: false,
      queryActions: async () => [invalidProofAction],
      tradeStore: {
        addTrade() {
          throw new Error('invalid proof must not insert or rewrite a trade');
        },
      },
    }
  );

  assert.equal(result.imported, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(
    legacyDb.prepare('SELECT status, verified_source FROM trade_history').get(),
    { status: 'filled', verified_source: 'worker' },
    'legacy referral-only trade must survive exact-attribution cutover unchanged'
  );
  legacyDb.close();
}

assert.equal(sqlDateFromUnixSeconds(expectedCutover + 61), '2026-08-14 00:01:01');
assert.equal(sqlDateFromUnixSeconds(null), null);
assert.equal(sqlDateFromUnixSeconds('garbage'), null);
assert.deepEqual(classifyOrderAction({ orderType: 8 }), { isOpen: true, orderType: 'stop-market' },
  'GMX StopIncrease (8) is an executed open and must be credited');
assert.equal(classifyOrderAction({ orderType: 7 }), null, 'liquidations are never credited');
assert.equal(classifyOrderAction({ orderType: 0 }), null, 'swaps are never credited');

async function assertAttributedRowUsesExecutionTime() {
  const inserted = [];
  const action = {
    id: 'exec-action',
    account: '0x0000000000000000000000000000000000000002',
    timestamp: expectedCutover + 3600,
    eventName: 'OrderExecuted',
    orderType: 2,
    isLong: false,
    sizeDeltaUsd: (250n * (10n ** 30n)).toString(),
    marketAddress: '0x0000000000000000000000000000000000000003',
    orderKey: '0xorder',
    transactionHash: '0xtx',
    uiFeeReceiver: GMX_UI_FEE_RECEIVER,
    uiFeeFactor: GMX_UI_FEE_FACTOR.toString(),
  };
  const result = await importActionsForRow(
    { id: 7, wallet: action.account },
    { [action.marketAddress]: { symbol: 'ETH' } },
    {
      since: expectedCutover,
      updateCursor: false,
      queryActions: async () => [action],
      tradeStore: { addTrade(playerId, trade) { inserted.push({ playerId, trade }); return { id: 1 }; } },
    }
  );
  assert.equal(result.imported, 1);
  assert.equal(inserted.length, 1);
  const { trade } = inserted[0];
  // Tournament windows and quest days filter on created_at, so a trade
  // imported late (worker restart, Subsquid lag) must keep its on-chain time.
  assert.equal(trade.createdAt, '2026-08-14 01:00:00');
  assert.equal(trade.side, 'short');
  assert.equal(trade.notional_usd, 250);
  assert.equal(trade.clientOrderId, 'gmx:open:0x0000000000000000000000000000000000000002:0xorder');
}

assertLegacyRowPreserved()
  .then(assertAttributedRowUsesExecutionTime)
  .then(() => console.log('GMX_UI_FEE_ATTRIBUTION_TEST_PASS'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
