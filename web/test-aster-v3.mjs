import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  ASTER_FEE_RATE,
  ASTER_MANAGEMENT_DOMAIN,
  ASTER_MANAGEMENT_SIGNATURE_CHAIN_ID,
  ASTER_MESSAGE_DOMAIN,
  ASTER_MESSAGE_TYPES,
  buildAsterManagementTypedData,
  encodeAsterParams,
  floorToStep,
  roundToStep,
  signAsterAgentPayload,
  signAsterManagement,
} from './src/lib/asterV3.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const privateKey = `0x${'11'.repeat(32)}`;

assert.equal(ASTER_FEE_RATE, '0.00001', 'Aster client fallback must match the official Aster Code demo rate');
assert.deepEqual(ASTER_MESSAGE_DOMAIN, {
  name: 'AsterSignTransaction',
  version: '1',
  chainId: 1666,
  verifyingContract: '0x0000000000000000000000000000000000000000',
});
assert.equal(ASTER_MANAGEMENT_SIGNATURE_CHAIN_ID, 56);
assert.equal(ASTER_MANAGEMENT_DOMAIN.chainId, 56, 'owner management signatures use the Aster Code wallet chain domain');

const payload = encodeAsterParams([
  ['symbol', 'BTCUSDT'],
  ['type', 'LIMIT'],
  ['side', 'BUY'],
  ['quantity', '0.001'],
  ['price', '65000.0'],
  ['ipWhitelist', ''],
  ['builder', '0x2222222222222222222222222222222222222222'],
  ['feeRate', ASTER_FEE_RATE],
  ['nonce', '1786500000000000'],
  ['user', '0x3333333333333333333333333333333333333333'],
  ['signer', '0x4444444444444444444444444444444444444444'],
]);
assert.equal(
  payload,
  'symbol=BTCUSDT&type=LIMIT&side=BUY&quantity=0.001&price=65000.0&ipWhitelist=&builder=0x2222222222222222222222222222222222222222&feeRate=0.00001&nonce=1786500000000000&user=0x3333333333333333333333333333333333333333&signer=0x4444444444444444444444444444444444444444',
  'Aster signed query ordering and empty fields must be preserved byte-for-byte',
);

const signed = await signAsterAgentPayload(privateKey, payload);
const recovered = await recoverTypedDataAddress({
  domain: ASTER_MESSAGE_DOMAIN,
  types: ASTER_MESSAGE_TYPES,
  primaryType: 'Message',
  message: { msg: payload },
  signature: signed.signature,
});
assert.equal(recovered.toLowerCase(), signed.signer, 'Message(msg) signature must recover the local Agent');

const approval = buildAsterManagementTypedData('ApproveAgent', [
  ['agentName', 'Clash of Perps'],
  ['agentAddress', signed.signer],
  ['ipWhitelist', ''],
  ['expired', 1893456000000],
  ['canSpotTrade', false],
  ['canPerpTrade', true],
  ['canWithdraw', false],
  ['maxFeeRate', ASTER_FEE_RATE],
]);
assert.deepEqual(approval.types.ApproveAgent.map(row => row.name), [
  'AgentName', 'AgentAddress', 'IpWhitelist', 'Expired',
  'CanSpotTrade', 'CanPerpTrade', 'CanWithdraw', 'MaxFeeRate',
]);
assert.deepEqual(approval.types.ApproveAgent.map(row => row.type), [
  'string', 'string', 'string', 'uint256', 'bool', 'bool', 'bool', 'string',
]);
assert.equal(approval.message.IpWhitelist, '', 'empty IP whitelist must remain in signed management data');

const ownerAccount = privateKeyToAccount(privateKey);
const managementSignature = await signAsterManagement({
  walletClient: {
    signTypedData: ({ account: _account, ...typedData }) => ownerAccount.signTypedData(typedData),
  },
  owner: ownerAccount.address,
  primaryType: approval.primaryType,
  entries: [
    ['agentName', 'Clash of Perps'],
    ['agentAddress', signed.signer],
    ['ipWhitelist', ''],
    ['expired', 1893456000000],
    ['canSpotTrade', false],
    ['canPerpTrade', true],
    ['canWithdraw', false],
    ['maxFeeRate', ASTER_FEE_RATE],
  ],
});
const recoveredOwner = await recoverTypedDataAddress({
  domain: ASTER_MANAGEMENT_DOMAIN,
  types: approval.types,
  primaryType: approval.primaryType,
  message: approval.message,
  signature: managementSignature,
});
assert.equal(recoveredOwner.toLowerCase(), ownerAccount.address.toLowerCase(), 'management approval must recover on the chain 56 domain');

assert.equal(floorToStep(0.00199, 0.001, 3), '0.001');
assert.equal(roundToStep(63899.31, 1, 0), '63899');

const hookSource = fs.readFileSync(path.join(root, 'src/hooks/useAster.js'), 'utf8');
const panelSource = fs.readFileSync(path.join(root, 'src/components/FuturesPanel.jsx'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, '../server-futures/aster.js'), 'utf8');
assert.match(hookSource, /\/fapi\/v3\/approveAgent/u);
assert.match(hookSource, /\['signatureChainId', ASTER_MANAGEMENT_SIGNATURE_CHAIN_ID\]/u);
assert.match(hookSource, /\['builder', builder\.address\][\s\S]*\['feeRate', builder\.feeRate \|\| ASTER_FEE_RATE\]/u);
assert.match(hookSource, /\['canWithdraw', false\]/u, 'Aster Agent must never receive withdrawal permission');
assert.match(hookSource, /function asterCloseSide/u, 'close and TP\/SL must invert position direction explicitly');
assert.match(panelSource, /dex === 'aster'[\s\S]*hasAsterRiskToManage/u, 'builder setup gate must not trap existing Aster risk');
assert.match(serverSource, /opening trades are disabled/u, 'server must fail closed before builder configuration');
assert.match(serverSource, /ASTER_DEFAULT_BUILDER_FEE_RATE = '0\.00001'/u);

console.log('Aster V3 signing, builder routing, risk controls, and source invariants: PASS');
