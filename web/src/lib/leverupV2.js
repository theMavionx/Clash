import {
  encodeAbiParameters,
  keccak256,
  maxUint256,
  parseAbiParameter,
  stringToHex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  assertCredentialScope, captureCredentialScope, peekEncryptedCredential,
  removeEncryptedCredential, writeEncryptedCredential,
} from './encryptedCredentialStorage.js';

export const LEVERUP_CHAIN_ID = 143;
export const LEVERUP_DIAMOND = '0xea1b8E4aB7f14F7dCA68c5B214303B13078FC5ec';
export const LEVERUP_USDC = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
export const LEVERUP_LVUSD = '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1';
export const LEVERUP_APP_URL = 'https://app.leverup.xyz';
export const LEVERUP_AGENT_NAME = stringToHex('Clash 1CT v2', { size: 32 });
export const LEVERUP_REQUIRED_ACTION_MASK = (1n << 14n) - 1n;
// maxUint256 is LeverUp's wildcard permission and automatically covers newly
// appended V2 actions; an explicit bitmask is only a point-in-time snapshot.
export const LEVERUP_CURRENT_PERMISSION_MASK = maxUint256;
export const LEVERUP_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const OneClickAction = Object.freeze({
  MARKET_OPEN: 0,
  MARKET_CLOSE: 1,
  LIMIT_OPEN: 2,
  LIMIT_CANCEL: 3,
  LIMIT_UPDATE_TP_SL: 4,
  ADD_MARGIN: 5,
  REMOVE_MARGIN: 6,
  UPDATE_TP_SL: 7,
  BATCH_MARKET_CLOSE: 8,
  PARTIAL_CLOSE: 9,
  CANCEL_DECREASE_ORDER: 10,
  BATCH_CREATE_DECREASE_ORDERS: 11,
  BATCH_UPDATE_DECREASE_ORDERS: 12,
  CANCEL_ALL_DECREASE_ORDERS: 13,
});

export const LEVERUP_ACTION_TYPE_NAMES = Object.freeze({
  0: 'OneClickMarketOpen',
  1: 'OneClickMarketClose',
  2: 'OneClickLimitOpen',
  3: 'OneClickLimitCancel',
  4: 'OneClickLimitUpdateTpSl',
  5: 'OneClickAddMargin',
  6: 'OneClickRemoveMargin',
  7: 'OneClickUpdateTpSl',
  8: 'OneClickBatchMarketClose',
  9: 'OneClickPartialClose',
  10: 'OneClickCancelDecreaseOrder',
  11: 'OneClickBatchCreateDecreaseOrders',
  12: 'OneClickBatchUpdateDecreaseOrders',
  13: 'OneClickCancelAllDecreaseOrders',
});

export const LEVERUP_ACTION_DATA_TYPES = Object.freeze({
  0: ['address', 'bool', 'address', 'address', 'uint96', 'uint128', 'uint128', 'uint128', 'uint128', 'uint24', 'uint96'],
  1: ['bytes32', 'uint24'],
  2: ['address', 'bool', 'address', 'address', 'uint96', 'uint128', 'uint128', 'uint128', 'uint128', 'uint24', 'uint96'],
  3: ['bytes32'],
  4: ['bytes32', 'uint128', 'uint128'],
  5: ['bytes32', 'address', 'uint96'],
  6: ['bytes32', 'uint96'],
  7: ['bytes32', 'uint128', 'uint128'],
  8: ['bytes32[]', 'uint24'],
  9: ['bytes32', 'uint128', 'uint24'],
  10: ['bytes32'],
  11: ['bytes32', '(uint8,uint128,uint128,uint24)[]'],
  12: ['(bytes32,uint128,uint128,uint24)[]'],
  13: ['bytes32'],
});

export const LEVERUP_COMMON_EIP712_FIELDS = Object.freeze([
  { name: 'trader', type: 'address' },
  { name: 'action', type: 'uint8' },
  { name: 'nonce', type: 'uint64' },
  { name: 'deadline', type: 'uint48' },
  { name: 'feeToken', type: 'address' },
  { name: 'antiDdosFee', type: 'uint96' },
  { name: 'actionDataHash', type: 'bytes32' },
]);

export const LEVERUP_AUTH_ABI = [
  {
    type: 'function', name: 'authorizeAgent', stateMutability: 'nonpayable',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'permissions', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'revokeAgent', stateMutability: 'nonpayable',
    inputs: [{ name: 'agent', type: 'address' }], outputs: [],
  },
  {
    type: 'function', name: 'revokeAgentByName', stateMutability: 'nonpayable',
    inputs: [{ name: 'name', type: 'bytes32' }], outputs: [],
  },
  {
    type: 'function', name: 'getAgentByName', stateMutability: 'view',
    inputs: [{ name: 'trader', type: 'address' }, { name: 'name', type: 'bytes32' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'getAgentAuth', stateMutability: 'view',
    inputs: [{ name: 'trader', type: 'address' }, { name: 'agent', type: 'address' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'agent', type: 'address' },
        { name: 'name', type: 'bytes32' },
        { name: 'permissions', type: 'uint256' },
        { name: 'authorizedAt', type: 'uint32' },
      ],
    }],
  },
];

export const LEVERUP_ERC20_ABI = [
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
];

let lastNonce = 0n;

export function nextLeverupNonce() {
  const now = BigInt(Date.now());
  lastNonce = now > lastNonce ? now : lastNonce + 1n;
  return lastNonce;
}

function stripTraderWord(encoded) {
  return `0x${encoded.slice(2 + 64)}`;
}

export function buildLeverupActionData(action, trader, values) {
  if (action === OneClickAction.BATCH_CREATE_DECREASE_ORDERS) {
    return stripTraderWord(encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes32' }, parseAbiParameter('(uint8,uint128,uint128,uint24)[]')],
      [trader, values[0], values[1]],
    ));
  }
  if (action === OneClickAction.BATCH_UPDATE_DECREASE_ORDERS) {
    return stripTraderWord(encodeAbiParameters(
      [{ type: 'address' }, parseAbiParameter('(bytes32,uint128,uint128,uint24)[]')],
      [trader, values[0]],
    ));
  }
  const types = LEVERUP_ACTION_DATA_TYPES[action];
  if (!types) throw new Error(`Unsupported LeverUp V2 action ${action}`);
  return stripTraderWord(encodeAbiParameters(
    ['address', ...types].map(type => ({ type })),
    [trader, ...values],
  ));
}

export function leverupStorageKey(trader) {
  const owner = String(trader || '').trim().toLowerCase();
  return `clash:leverup:v2:${LEVERUP_CHAIN_ID}:${LEVERUP_DIAMOND.toLowerCase()}:${owner}`;
}

export function readLeverupAgent(trader) {
  if (typeof window === 'undefined' || !trader) return null;
  try {
    const parsed = peekEncryptedCredential(leverupStorageKey(trader));
    if (!/^0x[0-9a-fA-F]{64}$/u.test(String(parsed?.privateKey || ''))) return null;
    const account = privateKeyToAccount(parsed.privateKey);
    if (parsed.address && String(parsed.address).toLowerCase() !== account.address.toLowerCase()) return null;
    return { privateKey: parsed.privateKey, address: account.address };
  } catch {
    return null;
  }
}

export function createAndStoreLeverupAgent(trader, options = {}) {
  if (typeof window === 'undefined') throw new Error('Browser storage is unavailable');
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const record = { version: 2, privateKey, address: account.address, createdAt: Date.now() };
  writeEncryptedCredential(leverupStorageKey(trader), record, { scope }).catch(() => {});
  return { privateKey, address: account.address };
}

export function clearLeverupAgent(trader, options = {}) {
  if (typeof window === 'undefined' || !trader) return;
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const pending = removeEncryptedCredential(leverupStorageKey(trader), { scope });
  pending.catch(() => {});
  return pending;
}

export function isLeverupAgentAuthorized(auth, agentAddress) {
  const agent = String(auth?.agent || '').toLowerCase();
  const expected = String(agentAddress || '').toLowerCase();
  const permissions = BigInt(auth?.permissions || 0);
  return !!expected
    && agent === expected
    && agent !== LEVERUP_ZERO_ADDRESS
    && (permissions === maxUint256
      || (permissions & LEVERUP_REQUIRED_ACTION_MASK) === LEVERUP_REQUIRED_ACTION_MASK);
}

export function selectLeverupFeeToken(action, configs, tokenStates, additionalSpends = []) {
  const options = (Array.isArray(configs) ? configs : [])
    .filter(row => Number(row?.action) === Number(action) && row?.enabled === true)
    .sort((a, b) => Number(a?.priority || 0) - Number(b?.priority || 0));
  if (!options.length) return { feeToken: LEVERUP_ZERO_ADDRESS, antiDdosFee: 0n };
  for (const option of options) {
    const address = String(option?.feeToken || '').toLowerCase();
    const state = tokenStates.get(address);
    if (!state) continue;
    const spend = additionalSpends
      .filter(row => String(row?.token || '').toLowerCase() === address)
      .reduce((sum, row) => sum + BigInt(row.amount || 0), 0n);
    const fee = BigInt(option?.antiDdosFee || 0);
    const required = fee + spend;
    if (state.balance >= required && state.allowance >= required) {
      return { feeToken: option.feeToken, antiDdosFee: fee };
    }
  }
  throw new Error('No LeverUp fee token has sufficient balance and allowance');
}

export async function signLeverupIntent({
  trader,
  privateKey,
  action,
  actionValues,
  feeToken,
  antiDdosFee,
  deadlineSeconds = 300,
}) {
  const typeName = LEVERUP_ACTION_TYPE_NAMES[action];
  if (!typeName) throw new Error(`Unsupported LeverUp V2 action ${action}`);
  const account = privateKeyToAccount(privateKey);
  const nonce = nextLeverupNonce();
  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const actionData = buildLeverupActionData(action, trader, actionValues);
  const signature = await account.signTypedData({
    domain: {
      name: 'LeverupOneClickV2',
      version: '1',
      chainId: LEVERUP_CHAIN_ID,
      verifyingContract: LEVERUP_DIAMOND,
    },
    types: { [typeName]: LEVERUP_COMMON_EIP712_FIELDS },
    primaryType: typeName,
    message: {
      trader,
      action,
      nonce,
      deadline,
      feeToken,
      antiDdosFee,
      actionDataHash: keccak256(actionData),
    },
  });
  return {
    trader,
    action,
    nonce: nonce.toString(),
    deadline,
    feeToken,
    antiDdosFee: antiDdosFee.toString(),
    actionData,
    signature,
  };
}

export function maxLeverupApproval() {
  return maxUint256;
}
