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
  importActionsForRow,
} = require('./gmx-rewards-worker');

assert.equal(GMX_UI_FEE_RECEIVER, '0x412a02ba415e5969596e6f0a35f9439760a3468f');
assert.equal(GMX_UI_FEE_BPS, 1);
assert.equal(GMX_UI_FEE_FACTOR, 100000000000000000000000000n);
assert.equal(hasClashGmxUiFee({
  uiFeeReceiver: '0x412A02Ba415e5969596E6f0A35f9439760a3468F',
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

assertLegacyRowPreserved()
  .then(() => console.log('GMX_UI_FEE_ATTRIBUTION_TEST_PASS'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
