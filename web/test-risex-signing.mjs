import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import {
  encodeAbiParameters,
  keccak256,
  stringToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const root = dirname(fileURLToPath(import.meta.url));
const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const risex = await vite.ssrLoadModule('/src/lib/risexClient.js');
  const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`);
  const signer = risex.getOrCreateRisexSigner(owner.address);
  const domain = {
    name: 'RISEx',
    version: '1',
    chain_id: 4153,
    verifying_contract: '0x0d919daa3f12ae715744eb648c00066c5dbd66f0',
  };
  const walletClient = {
    signTypedData: ({ account: _account, ...args }) => owner.signTypedData(args),
  };

  const registration = await risex.createRisexRegisterPayload({
    account: owner.address,
    signer,
    domain,
    nonceState: { nonce_anchor: '8', current_bitmap_index: 7 },
    walletClient,
  });
  assert.equal(registration.nonce_anchor, '8');
  assert.equal(registration.nonce_bitmap_index, 7);
  assert.equal('nonce_bitmap' in registration, false);
  assert.ok(
    Number(registration.expiration) > Math.floor(Date.now() / 1000) + 360 * 86_400,
    'RISEx browser signer should use the current one-year registration lifetime',
  );

  const approvalExpected = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint16' }, { type: 'uint16' }],
    [keccak256(stringToHex('RISE_APPROVE_BUILDER_FEE_V1')), 10, 100],
  ));
  assert.equal(
    risex.encodeRisexBuilderFeeApproval({ builderId: 10, maxFeeBps: 100 }),
    approvalExpected,
  );

  const order = {
    market_id: 1,
    size_steps: 100,
    price_ticks: 50_000,
    side: 0,
    post_only: false,
    reduce_only: false,
    stp_mode: 0,
    order_type: 1,
    time_in_force: 0,
    builder_id: 10,
    builder_fee_bps: 100,
    client_order_id: '1',
    ttl_units: 0,
  };
  const orderFlags = 1 | 2 | 4;
  const packedOrder = (1n << 70n)
    | (100n << 38n)
    | (50_000n << 14n)
    | (32n << 6n)
    | (1n << 1n);
  const orderExpected = keccak256(encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'uint8' },
      { type: 'uint88' },
      { type: 'uint16' },
      { type: 'uint16' },
      { type: 'uint64' },
      { type: 'uint16' },
    ],
    [
      keccak256(stringToHex('RISE_PERPS_PLACE_ORDER_V1')),
      orderFlags,
      packedOrder,
      10,
      100,
      1n,
      0,
    ],
  ));
  assert.equal(risex.encodeRisexOrder(order), orderExpected);

  const cancelExpected = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint16' }, { type: 'uint40' }],
    [keccak256(stringToHex('RISE_PERPS_CANCEL_ORDER_V1')), 1, 10_836n],
  ));
  assert.equal(
    risex.encodeRisexCancelOrder({ market_id: 1, resting_order_id: '10836' }),
    cancelExpected,
  );

  const permit = await risex.createRisexPermit({
    account: owner.address,
    signer,
    domain,
    nonceState: { nonce_anchor: '8', current_bitmap_index: 7 },
    hash: approvalExpected,
  });
  assert.equal(permit.nonce_anchor, '8');
  assert.equal(permit.nonce_bitmap_index, 7);
  assert.equal(typeof permit.deadline, 'number');
  assert.equal('nonce_bitmap' in permit, false);

  console.log('RISEx signing compatibility tests passed');
} finally {
  await vite.close();
}
