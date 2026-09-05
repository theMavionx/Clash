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
    { tp: { c: 'BTC-USD', d: true, sz: '0.5', tr: '70000', lim: null, i: false } },
    { st: { c: 'BTC-USD', d: false, sz: '0.5', tr: '62000', lim: null, i: false } },
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

  const officialAccount = '4Ze3bbJbmBjAUutV3LT1XUmqZG67fAR5PUr7vkXUgU2g';
  const officialNonce = 1788619000000000000n;
  assert.equal(
    wire.serializeTransaction([{ abc: { to: BUILDER, fee: 1 } }], officialNonce, officialAccount, 'mainnet').toString('base64'),
    'AQAAAAAAAAAoAAAAvxbBm7Vq7N/m/gytVTW+09+F5bOHR0z590F5QpJs+u4BALCDBYFz0hg074iHn4oDnet2DXKJlq9flChSjDRT3Mt9get63FUd9QE=',
    'must match bulk-keychain 0.1.26 mainnet builder approval bytes',
  );
  const officialMarket = {
    m: { c: 'BTC-USD', b: true, sz: '0.001', r: false, i: false, builderCode: { to: BUILDER, fee: 1 } },
  };
  assert.equal(
    wire.serializeTransaction([officialMarket], officialNonce, officialAccount, 'mainnet').toString('base64'),
    'AQAAAAAAAAAAAAAABwAAAAAAAABCVEMtVVNEAaCGAQAAAAAAAAABvxbBm7Vq7N/m/gytVTW+09+F5bOHR0z590F5QpJs+u4BALCDBYFz0hg074iHn4oDnet2DXKJlq9flChSjDRT3Mt9get63FUd9QE=',
    'must match bulk-keychain 0.1.26 mainnet market bytes',
  );
  assert.equal(
    wire.orderIdForAction(officialMarket, 0, officialNonce, officialAccount),
    '834QMdcacus849YhJJbuWXJy4zXWhCf33obuMyarMf8x',
    'order IDs use the commission-free canonical order hash',
  );

  const clear = wire.clearSignPayload([officialMarket], officialNonce, officialAccount, 'mainnet');
  assert.match(clear, /^Bulk Exchange Transaction\nNetwork: mainnet\n/);
  assert.match(clear, /\[0\] Market BTC-USD Buy sz=0\.00100000 ro=false iso=false\n$/);
  const offchain = wire.offchainMessage([officialMarket], officialNonce, officialAccount, officialAccount, 'mainnet');
  assert.equal(offchain.subarray(0, 16).toString('hex'), `ff${Buffer.from('solana offchain').toString('hex')}`);
  assert.equal(offchain[16], 0, 'Solana offchain envelope version');
  assert.equal(offchain[17], 1, 'mainnet application domain');
  assert.equal(offchain[49], 1, 'payload is UTF-8 because canonical text contains newlines');
  const base58Message = wire.base58Message([officialMarket], officialNonce, officialAccount, 'mainnet');
  assert.equal(base58Message.toString('utf8'), bs58.encode(wire.serializeTransaction(
    [officialMarket], officialNonce, officialAccount, 'mainnet',
  )));
  assert.match(base58Message.toString('utf8'), /^[1-9A-HJ-NP-Za-km-z]+$/);

  console.log('Bulk mainnet wire and wallet-compatible offchain signing tests passed');
}

run();
