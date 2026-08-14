import { encodeAbiParameters, getAddress, keccak256 } from 'viem';

const DEFAULT_GMX_UI_FEE_RECEIVER = '0x412A02Ba415e5969596E6f0A35f9439760a3468F';
const DEFAULT_GMX_UI_FEE_BPS = 1;

function readViteEnv(name) {
  if (typeof import.meta === 'undefined' || !import.meta.env) return '';
  return String(import.meta.env[name] || '').trim();
}

function parseFeeBps(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10) return DEFAULT_GMX_UI_FEE_BPS;
  return parsed;
}

export const GMX_UI_FEE_RECEIVER = getAddress(
  readViteEnv('VITE_GMX_UI_FEE_RECEIVER') || DEFAULT_GMX_UI_FEE_RECEIVER,
);
export const GMX_UI_FEE_BPS = parseFeeBps(readViteEnv('VITE_GMX_UI_FEE_BPS'));

// GMX percentages use 30 decimals. One basis point is 0.0001, therefore
// 1 bps = 10^26 in GMX factor units.
export const GMX_UI_FEE_FACTOR = BigInt(Math.round(GMX_UI_FEE_BPS * 1_000_000)) * (10n ** 20n);

export const GMX_DATA_STORE = '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8';
export const GMX_UI_FEE_FACTOR_NAMESPACE = keccak256(encodeAbiParameters(
  [{ type: 'string' }],
  ['UI_FEE_FACTOR'],
));

export const GMX_DATA_STORE_ABI = [
  {
    type: 'function',
    name: 'getUint',
    stateMutability: 'view',
    inputs: [{ name: 'key', type: 'bytes32' }],
    outputs: [{ type: 'uint256' }],
  },
];

export const GMX_UI_FEE_ROUTER_ABI = [
  {
    type: 'function',
    name: 'setUiFeeFactor',
    stateMutability: 'payable',
    inputs: [{ name: 'uiFeeFactor', type: 'uint256' }],
    outputs: [],
  },
];

export function gmxUiFeeFactorKey(receiver = GMX_UI_FEE_RECEIVER) {
  return keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }],
    [GMX_UI_FEE_FACTOR_NAMESPACE, getAddress(receiver)],
  ));
}

// Central attribution boundary. Callers cannot accidentally omit the
// receiver or override it with a user-controlled value.
export function withGmxUiFee(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('GMX order request must be an object');
  }
  return { ...request, uiFeeReceiver: GMX_UI_FEE_RECEIVER };
}

export function gmxUiFeeFactorToBps(factor) {
  try {
    return Number(BigInt(factor)) / 1e26;
  } catch {
    return 0;
  }
}

export function isGmxUiFeeOwner(address) {
  return String(address || '').toLowerCase() === GMX_UI_FEE_RECEIVER.toLowerCase();
}
