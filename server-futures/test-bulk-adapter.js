const assert = require('assert');
const nacl = require('tweetnacl');
const bs58Module = require('bs58');
const bulk = require('./bulk');

const bs58 = bs58Module.default || bs58Module;

function signedTransaction(prepared, secretKey) {
  return {
    ...prepared.transaction,
    signature: bs58.encode(nacl.sign.detached(Buffer.from(prepared.message_base64, 'base64'), secretKey)),
  };
}

function run() {
  const keypair = nacl.sign.keyPair.fromSeed(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const account = bs58.encode(keypair.publicKey);

  const approval = bulk.prepareTransaction(account, { kind: 'approve_builder', nonce: '1001' });
  assert.deepEqual(approval.transaction.actions, [{
    abc: { to: bulk.BULK_BUILDER_ADDRESS, fee: bulk.BULK_BUILDER_FEE_BPS },
  }]);
  assert.equal(bulk.verifyTransaction(signedTransaction(approval, keypair.secretKey)).account, account);

  const order = bulk.prepareTransaction(account, {
    kind: 'market',
    symbol: 'BTC',
    side: 'buy',
    size: '0.01',
    take_profit: '70000',
    stop_loss: '60000',
    nonce: '1002',
  });
  assert.equal(order.transaction.actions.length, 3);
  assert.deepEqual(order.transaction.actions[0].m.builderCode, {
    to: bulk.BULK_BUILDER_ADDRESS,
    fee: bulk.BULK_BUILDER_FEE_BPS,
  });
  assert.equal(order.transaction.actions[1].tp.d, true, 'long TP triggers above');
  assert.equal(order.transaction.actions[2].st.d, false, 'long stop triggers below');
  assert.doesNotThrow(() => bulk.verifyTransaction(signedTransaction(order, keypair.secretKey)));

  const wrongBuilder = JSON.parse(JSON.stringify(order.transaction));
  wrongBuilder.actions[0].m.builderCode.to = account;
  const wrongBuilderPrepared = {
    transaction: wrongBuilder,
    message_base64: require('./bulk-wire').serializeTransaction(
      wrongBuilder.actions,
      wrongBuilder.nonce,
      wrongBuilder.account,
    ).toString('base64'),
  };
  assert.throws(
    () => bulk.verifyTransaction(signedTransaction(wrongBuilderPrepared, keypair.secretKey)),
    /builder attribution mismatch/,
  );

  const tampered = signedTransaction(order, keypair.secretKey);
  tampered.actions[0].m.sz = '1';
  assert.throws(() => bulk.verifyTransaction(tampered), /signature verification failed/);

  assert.throws(
    () => bulk.buildActions({ kind: 'market', symbol: 'BTC', side: 'sideways', size: '1' }),
    /side must be bid or ask/,
  );

  console.log('Bulk adapter signing and builder-routing tests passed');
}

run();
