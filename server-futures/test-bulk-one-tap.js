const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
process.env.CLASH_FUTURES_DB = path.join(os.tmpdir(), `bulk-one-tap-${process.pid}-${Date.now()}.sqlite`);
process.env.BULK_BUILDER_ENABLED = '0';
const nacl = require('tweetnacl');
const b58 = require('bs58'); const bs58 = b58.default || b58;
const bulk = require('./bulk'); const wire = require('./bulk-wire'); const db = require('./db');
const owner = nacl.sign.keyPair(), agent = nacl.sign.keyPair(), stranger = nacl.sign.keyPair();
const address = key => bs58.encode(key.publicKey);
const account = address(owner), signer = address(agent);
const catalog = require('../server/trading_credential_catalog');
const storageName = `clash_bulk_agent_v1:mainnet:${account}`;
assert.equal(catalog.describe(storageName).dex, 'bulk');
assert.equal(catalog.validate(storageName, { secretKey: bs58.encode(agent.secretKey.slice(0, 32)), publicKey: signer, account, network: 'mainnet' }, 'fixture'), true);
assert.equal(catalog.validate(storageName, { secretKey: bs58.encode(owner.secretKey.slice(0, 32)), account }, 'fixture'), false, 'primary-wallet keys are forbidden in the vault');
const sign = (prepared, key) => ({ ...prepared.transaction, signature_mode: prepared.signature_mode,
  signature: bs58.encode(nacl.sign.detached(Buffer.from(prepared.message_base64, 'base64'), key.secretKey)) });
let authorized = [], builderApprovals = [], writes = 0, submittedBody = null;
let response = { status: 'ok', response: { data: { statuses: [] } } };
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (String(url).endsWith('/account')) {
    assert.equal(body.user, account);
    return Response.json([{ fullAccount: { authorizedAgentWallets: authorized, builderCodeApprovals: builderApprovals } }]);
  }
  assert.equal(String(url).endsWith('/order'), true); writes++; submittedBody = body;
  return Response.json(response);
};
(async () => {
  const registration = bulk.prepareTransaction(account, { kind: 'register_agent', agent: signer, nonce: '100' });
  assert.equal(registration.signature_mode, 'base58');
  assert.deepEqual(registration.transaction.actions, [{ agentWalletCreation: { a: signer, d: false } }]);
  const expected = Buffer.concat([Buffer.from([17, 0, 0, 0]), Buffer.from(agent.publicKey), Buffer.from([0])]);
  assert.deepEqual(wire.serializeAction(registration.transaction.actions[0]), expected);
  assert.equal(bulk.verifyTransaction(sign(registration, owner)).signer, account);
  const removal = bulk.prepareTransaction(account, { kind: 'revoke_agent', agent: signer, nonce: '101' });
  assert.equal(removal.transaction.actions[0].agentWalletCreation.d, true);
  assert.throws(() => bulk.prepareTransaction(account, { kind: 'register_agent', agent: signer, signer }), /owner/);
  assert.throws(() => bulk.prepareTransaction(account, { kind: 'register_agent', agent: account }), /differ/);
  // Even a valid agent signature cannot administer permissions.
  const forbidden = { ...registration.transaction, signer, signature_mode: 'raw' };
  forbidden.signature = bs58.encode(nacl.sign.detached(wire.serializeTransaction(forbidden.actions, forbidden.nonce, account, 'mainnet'), agent.secretKey));
  assert.throws(() => bulk.verifyTransaction(forbidden), /owner/);
  const payloads = [
    { kind: 'market', symbol: 'BTC', side: 'ask', size: '0.000609', reduce_only: true, isolated: true },
    { kind: 'limit', symbol: 'BTC', side: 'bid', size: '0.001', price: 79000 },
    { kind: 'cancel', symbol: 'BTC', order_id: address(stranger) },
    { kind: 'leverage', symbol: 'BTC', leverage: 20 },
    { kind: 'tpsl', symbol: 'BTC', side: 'bid', size: '0.001', take_profit: 82000, stop_loss: 77000 },
  ];
  for (const [index, payload] of payloads.entries()) {
    const prepared = bulk.prepareTransaction(account, { ...payload, signer, nonce: String(200 + index) });
    assert.equal(prepared.signature_mode, 'raw');
    const signed = sign(prepared, agent);
    assert.equal(bulk.verifyTransaction(signed).signer, signer);
    authorized = [];
    const before = writes;
    await assert.rejects(bulk.submitTransaction('fixture', account, signed), /not authorized/);
    assert.equal(writes, before, 'unauthorized agent must never reach the exchange write');
    authorized = [signer];
    await bulk.submitTransaction('fixture', account, signed);
    assert.equal(writes, before + 1);
    assert.throws(() => bulk.verifyTransaction({ ...signed, nonce: '999' }), /signature verification/);
    await assert.rejects(bulk.submitTransaction('fixture', address(stranger), signed), /linked/);
  }
  const prepared = bulk.prepareTransaction(account, { kind: 'market', symbol: 'BTC', side: 'bid', size: '0.000609', signer, nonce: '500' });
  response = { response: { data: { statuses: [
    { working: { oid: address(stranger) } }, { filled: { oid: prepared.order_ids[0] } },
  ] } } };
  await bulk.submitTransaction('fixture', account, sign(prepared, agent));
  const proof = db.db.prepare('SELECT * FROM bulk_order_builder_proofs WHERE order_id=?').get(prepared.order_ids[0]);
  assert.equal(proof.status, 'filled');
  assert.equal(proof.builder_fee_bps, 0);
  assert.equal(JSON.parse(proof.response_json).clash_verified_signer, signer);
  assert.equal(db.db.prepare('SELECT * FROM bulk_order_builder_proofs WHERE order_id=?').get(address(stranger)), undefined);
  await checkEnabledBuilder();
  console.log('BULK one-tap: owner management, raw delegate signatures, fresh grants, revocation, five action types and canonical proof correlation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.db.close());

/** Load a separate test-only configuration without changing the disabled adapter. */
function enabledBuilderFixture() {
  const modulePath = require.resolve('./bulk');
  const cached = require.cache[modulePath], previous = process.env.BULK_BUILDER_ENABLED;
  try {
    process.env.BULK_BUILDER_ENABLED = '1';
    delete require.cache[modulePath];
    return require('./bulk');
  } finally {
    require.cache[modulePath] = cached;
    process.env.BULK_BUILDER_ENABLED = previous;
  }
}

async function rejectBuilderTampering(enabled, signed, builderCode) {
  const modified = structuredClone(signed);
  const kind = Object.keys(modified.actions[0])[0];
  if (builderCode === undefined) delete modified.actions[0][kind].builderCode;
  else modified.actions[0][kind].builderCode = builderCode;
  const before = writes;
  await assert.rejects(enabled.submitTransaction('fixture', account, modified), /signature verification/);
  modified.signature = bs58.encode(nacl.sign.detached(
    wire.serializeTransaction(modified.actions, modified.nonce, account, enabled.BULK_NETWORK), agent.secretKey));
  await assert.rejects(enabled.submitTransaction('fixture', account, modified), /builderCode object required|builder attribution mismatch/);
  assert.equal(writes, before, 'even a valid agent signature cannot omit or redirect builder attribution');
}

async function checkEnabledBuilder() {
  const enabled = enabledBuilderFixture();
  const builder = { to: enabled.BULK_BUILDER_ADDRESS, fee: enabled.BULK_BUILDER_FEE_BPS };
  authorized = [signer];
  response = { status: 'ok', response: { data: { statuses: [] } } };
  for (const [index, kind] of ['market', 'limit'].entries()) {
    const prepared = enabled.prepareTransaction(account, { kind, symbol: 'BTC', side: 'ask',
      size: '0.000609', price: '79000', reduce_only: true, signer, nonce: String(700 + index),
      builderCode: { to: address(stranger), fee: 15 } });
    assert.equal(prepared.signature_mode, 'raw');
    assert.deepEqual(Object.values(prepared.transaction.actions[0])[0].builderCode, builder);
    const signed = sign(prepared, agent), before = writes;
    builderApprovals = [];
    await assert.rejects(enabled.submitTransaction('fixture', account, signed), /Approve the Clash builder code/);
    assert.equal(writes, before, 'agent authority cannot replace native builder approval');
    builderApprovals = [{ recipient: builder.to, maxFee: builder.fee }];
    await enabled.submitTransaction('fixture', account, signed);
    assert.equal(writes, before + 1);
    assert.equal(submittedBody.signer, signer);
    assert.deepEqual(Object.values(submittedBody.actions[0])[0].builderCode, builder);
    const stored = db.db.prepare('SELECT * FROM bulk_order_builder_proofs WHERE order_id=?').get(prepared.order_ids[0]);
    assert.equal(stored.builder_address, builder.to);
    assert.equal(stored.builder_fee_bps, builder.fee);
    await assert.rejects(enabled.submitTransaction('fixture', account, { ...signed, signer: address(stranger) }), /signature verification/);
    for (const changed of [undefined, { ...builder, to: address(stranger) }, { ...builder, fee: builder.fee === 15 ? 14 : builder.fee + 1 }]) {
      await rejectBuilderTampering(enabled, signed, changed);
    }
  }
  assert.equal(bulk.config().builder_enabled, false);
  assert.equal(bulk.config().builder_fee_bps, 0);
  assert.equal(process.env.BULK_BUILDER_ENABLED, '0');
  console.log('BULK builder-enabled fixture: exact delegated builder tuple, persisted proof, native approval and signer/body tampering checks passed; default remains fee zero.');
}
