import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import {
  encodeAbiParameters,
  keccak256,
  recoverTypedDataAddress,
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

  const single = await risex.createRisexPermitSinglePayload({
    account: owner.address,
    operator: '0xf665aba90b6ac7515d50b12fcb4f350136726734',
    domain,
    nonceState: { nonce_anchor: '8', current_bitmap_index: 7 },
    walletClient,
  });
  assert.equal(single.budget, ((1n << 96n) - 1n).toString());
  assert.equal(single.nonce_anchor, '8');
  assert.equal(single.nonce_bitmap_index, 7);
  assert.equal(
    (await recoverTypedDataAddress({
      domain: risex.risexDomain(domain),
      types: risex.PERMIT_SINGLE_TYPES,
      primaryType: 'PermitSingle',
      message: {
        account: owner.address,
        operator: single.operator,
        budget: BigInt(single.budget),
        allowanceExpiry: single.allowance_expiry,
        nonceAnchor: 8,
        nonceBitmap: 7,
      },
      signature: single.signature,
    })).toLowerCase(),
    owner.address.toLowerCase(),
  );

  const tpsl = await risex.createRisexTpslOrderPayload({
    account: owner.address,
    signer,
    domain,
    params: {
      market_id: 1,
      side: 'ask',
      size: '0.0149',
      stop_type: 'TAKE_PROFIT',
      order_type: 'MARKET',
      stop_price: '64828',
      limit_price: '0',
      stop_price_option: 'MARK_PRICE',
      tif: 'FOK',
      size_percent_bps: 10_000,
    },
  });
  assert.equal(tpsl.side, 1);
  assert.equal(tpsl.stop_type, 'TAKE_PROFIT');
  assert.equal(tpsl.signature.length, 88);
  const tpslSignature = `0x${Buffer.from(tpsl.signature, 'base64').toString('hex')}`;
  assert.equal(
    (await recoverTypedDataAddress({
      domain: risex.risexDomain(domain),
      types: risex.PLACE_TPSL_ORDER_TYPES,
      primaryType: 'PlaceTpslOrder',
      message: {
        account: owner.address,
        marketId: 1n,
        side: 1,
        size: '0.0149',
        stopType: 0,
        stopPrice: '64828',
        limitPrice: '0',
        orderType: 0,
        stopPriceOption: 1,
        tif: 2,
        deadline: tpsl.deadline,
        sizePercentBps: 10_000,
      },
      signature: tpslSignature,
    })).toLowerCase(),
    signer.address.toLowerCase(),
  );

  const cancelTpsl = await risex.createRisexCancelTpslPayload({
    account: owner.address,
    signer,
    domain,
    orderId: 'test-tpsl-order-id',
  });
  const cancelTpslSignature = `0x${Buffer.from(cancelTpsl.signature, 'base64').toString('hex')}`;
  assert.equal(
    (await recoverTypedDataAddress({
      domain: risex.risexDomain(domain),
      types: risex.CANCEL_TPSL_ORDER_TYPES,
      primaryType: 'CancelTpslOrder',
      message: {
        account: owner.address,
        orderId: cancelTpsl.order_id,
        deadline: cancelTpsl.deadline,
      },
      signature: cancelTpslSignature,
    })).toLowerCase(),
    signer.address.toLowerCase(),
  );

  console.log('RISEx signing compatibility tests passed');
} finally {
  await vite.close();
}
