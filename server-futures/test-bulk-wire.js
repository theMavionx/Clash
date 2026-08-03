const assert = require('assert');
const nacl = require('tweetnacl');
const bs58Module = require('bs58');
const wire = require('./bulk-wire');

const bs58 = bs58Module.default || bs58Module;
const ZERO_ACCOUNT = '11111111111111111111111111111111';
const BUILDER = 'Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9';

function run() {
  assert.equal(wire.decimalToFixed('0.000000005'), 1n, 'half rounds away from zero');
  assert.equal(wire.decimalToFixed('65000'), 6_500_000_000_000n);
  assert.equal(wire.decimalToFixed('0.5'), 50_000_000n);

  const officialV012Action = {
    l: { c: 'BTC-USD', b: true, px: '68000.0', sz: '0.001', tif: 'ALO', r: false, i: false },
  };
  assert.equal(
    wire.orderIdForAction(
      officialV012Action,
      0,
      1772569595613073n,
      '2bZfxVQtWdd8qAWJ4Xyq43cnej9zqMNyuh7HHxTNan8j',
    ),
    'E9J2xG99M5S8C3qoUVndQNF1y8jvjJTDSNwPx8KEUsXG',
    // v0.1.2 added `iso` to the canonical order hash. The Python source's
    // old self-test still expects 3FGB... (the pre-iso hash), while both its
    // implementation and the Rust implementation include the byte.
    'must match the actual Bulk v0.1.2 order-id implementation',
  );

  const actions = [
    { abc: { to: BUILDER, fee: 1 } },
    { m: { c: 'BTC-USD', b: true, sz: '0.5', r: false, i: false, builderCode: { to: BUILDER, fee: 1 } } },
    { tp: { c: 'BTC-USD', d: true, sz: '0.5', tr: '70000', lim: null } },
    { st: { c: 'BTC-USD', d: false, sz: '0.5', tr: '62000', lim: null } },
  ];
  const message = wire.serializeTransaction(actions, 42n, ZERO_ACCOUNT);
  const keypair = nacl.sign.keyPair.fromSeed(new Uint8Array(32));
  const signature = nacl.sign.detached(message, keypair.secretKey);
  assert(nacl.sign.detached.verify(message, signature, keypair.publicKey));
  assert.equal(bs58.encode(keypair.publicKey), '4zvwRjXUKGfvwnParsHAS3HuSVzV5cA4McphgmoCtajS');

  const tampered = wire.serializeTransaction([
    { ...actions[1], m: { ...actions[1].m, sz: '0.6' } },
  ], 42n, ZERO_ACCOUNT);
  assert(!nacl.sign.detached.verify(tampered, signature, keypair.publicKey));

  assert.throws(
    () => wire.serializeAction({ m: { c: 'BTC-USD', b: true, sz: '1', r: false, i: false, builderCode: null } }),
    /builderCode object required/,
  );
  assert.throws(() => wire.serializeAction({ abc: { to: BUILDER, fee: 16 } }), /1\.\.15/);

  console.log('Bulk v0.1.2 wire tests passed');
}

run();
