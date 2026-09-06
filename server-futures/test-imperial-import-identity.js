const test = require('node:test');
const assert = require('node:assert/strict');
process.env.CLASH_FUTURES_DB = ':memory:';
process.env.NODE_ENV = 'development';
const db = require('./db');
const imperial = require('./imperial');
const WALLET = '4Ze3bbJbmBjAUutV3LT1XUmqZG67fAR5PUr7vkXUgU2g';
const response = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const base = { playerId: 'identity-test', owner: WALLET, jwt: 'test-only', db };
const open = { id: 'open-id', status: 'converted', tx1Signature: 'open-submit', tx2Signature: 'open-fill', sizeDelta: '70', entryPrice: '79760.284249', tx2Timestamp: 1788637758 };
const close = { id: 'close-id', status: 'completed', tx1Signature: 'close-submit', tx2Signature: 'close-fill', sizeDelta: '-70', sizeDeltaTokens: '-0.00087763', entryPrice: '80023', tx2Timestamp: 1788690628 };
const proof = (signature, extra = {}) => db.recordImperialOrderProof({ playerId: base.playerId, wallet: WALLET, txSignature: signature, symbol: 'BTC', side: 'long', orderType: 'market', builderCode: 'CLASH', underwriter: 2, ...extra });
const trade = (clientOrderId, action) => ({ clientOrderId, symbol: 'BTC', side: 'long', orderType: 'market', amount: '0.00087763', price: '79760.284249', status: 'filled', dex: 'imperial', notional_usd: 70, verifiedSource: 'imperial_api', proofJson: JSON.stringify({ builderCode: 'CLASH', signature: action.tx1Signature, execution: action }) });
const rows = () => db.db.prepare("SELECT * FROM trade_history WHERE player_id = ? ORDER BY id").all(base.playerId);
const fetchTrades = actions => async url => {
  assert.ok(new URL(url).pathname.endsWith('/trades'));
  return response({ dataList: [{ profileIndex: 0, actions }] });
};

test('actual SQLite reimport preserves earliest legacy ID after close prepends; stable close never doubles', async () => {
  proof('open-submit'); proof('close-submit');
  const legacy = `imperial:${WALLET}:0:open-submit:0`;
  const first = db.upsertVerifiedTrade(base.playerId, trade(legacy, open));
  db.upsertVerifiedTrade(base.playerId, trade(`imperial:${WALLET}:0:open-submit:1`, open));
  const result = await imperial.importTradesForPlayer({ ...base, fetchImpl: fetchTrades([close, open]) });
  assert.deepEqual(result.errors, []);
  assert.equal(result.imported, 1);
  assert.equal(rows().length, 3, 'no third copy of legacy open');
  assert.equal(rows()[0].id, first.id);
  assert.equal(rows()[0].client_order_id, legacy);
  assert.equal(JSON.parse(rows()[0].proof_json).executionId, open.id);
  const closed = rows().find(row => JSON.parse(row.proof_json).executionId === close.id);
  assert.equal(closed.notional_usd, 70);
  assert.equal(closed.amount, '0.00087763');
  assert.match(closed.client_order_id, /:exec:id:close-id$/);
  assert.equal((await imperial.importTradesForPlayer({ ...base, fetchImpl: fetchTrades([open, close]) })).imported, 0);
  assert.equal(rows().length, 3);
});

test('completed actions need execution proof; profile mismatch and unrelated liquidation do not earn', () => {
  const p = { tx_signature: 'close-submit', profile_index: 0, wallet: WALLET };
  assert.equal(imperial.executionRowsFromActions([{ profileIndex: 1, actions: [close] }], p).length, 0);
  for (const changed of [{ tx2Signature: null }, { status: 'failed' }, { tx1Signature: 'unrelated', tx2Signature: 'unrelated-fill' }]) {
    assert.equal(imperial.executionRowsFromActions([{ actions: [{ ...close, ...changed }] }], p).length, 0);
  }
  const sameTx = [{ ...open, tx2Signature: 'shared' }, { ...open, id: 'other-id', tx2Signature: 'shared' }];
  assert.equal(imperial.executionRowsFromActions([{ actions: sameTx }], { tx_signature: 'open-submit' }).length, 2);
  assert.equal(imperial.executionRowsFromActions([{ actions: sameTx.map(row => ({ ...row, id: null })) }], { tx_signature: 'open-submit' }).length, 0);
});

test('order-history units and strict final-execution provenance match observed limit fill', () => {
  const p = { order_pda: 'limit', profile_index: 0, tx_signature: 'creation' };
  const detail = { orderPda: 'limit', profileIndex: 0, creationSignature: 'creation', status: 'executed', fillCount: 1,
    fills: [{ time: 1788677913, sizeUsd: '846040100', price: '79815103773000', feesUsd: '300555', txSignature: 'limit-fill', status: 'completed' }] };
  const [row] = imperial.executionRowsFromOrder(detail, p);
  assert.equal(row.notional, 846.0401); assert.equal(row.price, '79815.103773'); assert.equal(row.fee, 0.300555);
  assert.ok(Math.abs(Number(row.amount) - 846.0401 / 79815.103773) < 1e-12);
  for (const changed of [{ orderPda: 'wrong' }, { profileIndex: 1 }, { creationSignature: 'wrong' }, { fills: [{ ...detail.fills[0], txSignature: null }] }, { fills: [detail.fills[0], detail.fills[0]] }]) {
    assert.equal(imperial.executionRowsFromOrder({ ...detail, ...changed }, p).length, 0);
  }
  assert.equal(imperial.executionRowsFromOrder({ ...detail, fills: [], executionSignature: null, filledSizeUsd: '846040100', avgFillPrice: '79815103773000' }, p).length, 0);
});

test('shared final transaction cannot attach another order execution to a Clash proof', () => {
  const actions = [
    { ...open, id: 'clash-fill', tx1Signature: 'clash-order-create', tx2Signature: 'shared-execution' },
    { ...open, id: 'external-fill', tx1Signature: 'external-order-create', tx2Signature: 'shared-execution', sizeDelta: '900' },
  ];
  const own = imperial.executionRowsFromActions([{ actions }], { tx_signature: 'clash-order-create' }, ['shared-execution']);
  assert.deepEqual(own.map(row => row.executionId), ['clash-fill']);
  assert.equal(own[0].notional, 70);
  assert.equal(imperial.executionRowsFromActions([{ actions }], { tx_signature: 'limit-creation' }, ['shared-execution']).length, 0);
  assert.equal(imperial.executionRowsFromActions([{ actions }], { tx_signature: 'shared-execution' }).length, 0);
});

test('limit detail joins final signature to human-unit action ID and reuses stable row', async () => {
  const playerId = 'limit-test';
  db.recordImperialOrderProof({ playerId, wallet: WALLET, orderPda: 'limit-pda', txSignature: 'creation', symbol: 'BTC', side: 'long', orderType: 'limit', builderCode: 'CLASH', underwriter: 2 });
  const detail = { orderPda: 'limit-pda', profileIndex: 0, creationSignature: 'creation', fills: [{ time: 1788677913, sizeUsd: '846040100', price: '79815103773000', txSignature: 'limit-fill', status: 'completed' }] };
  const action = { id: 'limit-action', status: 'completed', tx1Signature: 'limit-fill', tx2Signature: 'limit-fill', sizeDelta: '846.0401', entryPrice: '79815.103773' };
  let actions = [];
  const fetchImpl = async url => response(new URL(url).pathname.endsWith('/trades') ? { dataList: [{ profileIndex: 0, actions }] } : detail);
  assert.equal((await imperial.importTradesForPlayer({ ...base, playerId, fetchImpl })).imported, 1);
  const before = db.db.prepare('SELECT * FROM trade_history WHERE player_id = ?').get(playerId);
  assert.match(before.client_order_id, /:exec:sig:limit-fill$/);
  actions = [action];
  assert.equal((await imperial.importTradesForPlayer({ ...base, playerId, fetchImpl })).imported, 0);
  const after = db.db.prepare('SELECT * FROM trade_history WHERE player_id = ?').all(playerId);
  assert.equal(after.length, 1); assert.equal(after[0].id, before.id);
  assert.equal(after[0].notional_usd, 846.0401);
  assert.equal(JSON.parse(after[0].proof_json).executionId, 'limit-action');
});

test.after(() => db.db.close());
