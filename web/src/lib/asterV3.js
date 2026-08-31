import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  assertCredentialScope, captureCredentialScope, peekEncryptedCredential,
  removeEncryptedCredential, writeEncryptedCredential,
} from './encryptedCredentialStorage.js';

export const ASTER_API_VERSION = 'v3';
export const ASTER_SIGNING_CHAIN_ID = 1666;
export const ASTER_MANAGEMENT_SIGNATURE_CHAIN_ID = 56;
export const ASTER_APP_URL = 'https://www.asterdex.com/en/futures';
// Aster expresses builder fees as a decimal fraction: 0.0001 = 1 basis point.
export const ASTER_FEE_RATE = '0.0001';
export const ASTER_AGENT_NAME = 'Clash of Perps';
export const ASTER_AGENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const ASTER_STORAGE_PREFIX = 'clash_aster_agent_v1';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const EIP712_DOMAIN_TYPES = Object.freeze([
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
]);

async function signTypedDataCompat({ provider, walletClient, account, domain, types, primaryType, message }) {
  const owner = String(account || '').trim();
  if (provider?.request) {
    const payload = {
      domain,
      types: { EIP712Domain: EIP712_DOMAIN_TYPES, ...types },
      primaryType,
      message,
    };
    const wire = JSON.stringify(payload, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
    try {
      return await provider.request({ method: 'eth_signTypedData_v4', params: [owner, wire] });
    } catch (jsonError) {
      try {
        return await provider.request({ method: 'eth_signTypedData_v4', params: [owner, payload] });
      } catch {
        if (!walletClient?.signTypedData) throw jsonError;
      }
    }
  }
  if (walletClient?.signTypedData) {
    return walletClient.signTypedData({ account: owner, domain, types, primaryType, message });
  }
  throw new Error('Wallet signer is not ready');
}

export const ASTER_MESSAGE_DOMAIN = Object.freeze({
  name: 'AsterSignTransaction',
  version: '1',
  chainId: ASTER_SIGNING_CHAIN_ID,
  verifyingContract: ZERO_ADDRESS,
});

export const ASTER_MANAGEMENT_DOMAIN = Object.freeze({
  ...ASTER_MESSAGE_DOMAIN,
  chainId: ASTER_MANAGEMENT_SIGNATURE_CHAIN_ID,
});

export const ASTER_MESSAGE_TYPES = Object.freeze({
  Message: Object.freeze([{ name: 'msg', type: 'string' }]),
});

let lastMs = 0;
let nonceIndex = 0;

export function nextAsterNonce() {
  const nowMs = Date.now();
  if (nowMs === lastMs) nonceIndex += 1;
  else {
    lastMs = nowMs;
    nonceIndex = 0;
  }
  return String((BigInt(nowMs) * 1000n) + BigInt(nonceIndex));
}

function ownerKey(owner) {
  const address = String(owner || '').trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/u.test(address) ? `${ASTER_STORAGE_PREFIX}:${address}` : '';
}

export function readAsterAgent(owner) {
  const key = ownerKey(owner);
  if (!key || typeof window === 'undefined') return null;
  try {
    const parsed = peekEncryptedCredential(key);
    if (!/^0x[0-9a-fA-F]{64}$/u.test(String(parsed?.privateKey || ''))) return null;
    if (parsed.owner && String(parsed.owner).toLowerCase() !== String(owner).toLowerCase()) return null;
    const account = privateKeyToAccount(parsed.privateKey);
    return {
      owner: String(owner).toLowerCase(),
      privateKey: parsed.privateKey,
      address: account.address.toLowerCase(),
      createdAt: Number(parsed.createdAt || 0),
      expired: Number(parsed.expired || 0),
    };
  } catch {
    return null;
  }
}

export function createAndStoreAsterAgent(owner, options = {}) {
  const key = ownerKey(owner);
  if (!key || typeof window === 'undefined') throw new Error('Aster owner wallet is required');
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const record = {
    owner: String(owner).toLowerCase(),
    privateKey,
    address: account.address.toLowerCase(),
    createdAt: Date.now(),
    expired: Date.now() + ASTER_AGENT_TTL_MS,
  };
  writeEncryptedCredential(key, record, { scope }).catch(() => {});
  return record;
}

export function clearAsterAgent(owner, options = {}) {
  const key = ownerKey(owner);
  if (!key) return;
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const pending = removeEncryptedCredential(key, { scope });
  pending.catch(() => {});
  return pending;
}

export function encodeAsterParams(entries) {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    params.append(String(key), typeof value === 'boolean' ? String(value).toLowerCase() : String(value));
  }
  return params.toString();
}

export async function signAsterAgentPayload(privateKey, payload) {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData({
    domain: ASTER_MESSAGE_DOMAIN,
    types: ASTER_MESSAGE_TYPES,
    primaryType: 'Message',
    message: { msg: String(payload) },
  });
  return { signer: account.address.toLowerCase(), signature };
}

function managementType(value) {
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number' || typeof value === 'bigint') return 'uint256';
  return 'string';
}

export function buildAsterManagementTypedData(primaryType, entries) {
  const message = {};
  const fields = [];
  for (const [rawName, value] of entries) {
    if (value === undefined || value === null) continue;
    const name = `${String(rawName).slice(0, 1).toUpperCase()}${String(rawName).slice(1)}`;
    fields.push({ name, type: managementType(value) });
    message[name] = value;
  }
  return {
    domain: ASTER_MESSAGE_DOMAIN,
    types: { [primaryType]: fields },
    primaryType,
    message,
  };
}

export async function signAsterManagement({ provider, walletClient, owner, primaryType, entries }) {
  const typedData = buildAsterManagementTypedData(primaryType, entries);
  return signTypedDataCompat({
    provider,
    walletClient,
    account: owner,
    ...typedData,
    domain: ASTER_MANAGEMENT_DOMAIN,
  });
}

export function decimalsFromStep(step, fallback = 8) {
  const text = String(step || '');
  if (!text.includes('.')) return 0;
  return Math.min(fallback, text.replace(/0+$/u, '').split('.')[1]?.length || 0);
}

export function floorToStep(value, step, decimals = decimalsFromStep(step)) {
  const number = Number(value);
  const quantum = Number(step);
  if (!(number > 0) || !(quantum > 0)) return '';
  const units = Math.floor((number / quantum) + 1e-10);
  return (units * quantum).toFixed(Math.max(0, decimals));
}

export function roundToStep(value, step, decimals = decimalsFromStep(step)) {
  const number = Number(value);
  const quantum = Number(step);
  if (!(number > 0) || !(quantum > 0)) return '';
  const units = Math.round(number / quantum);
  return (units * quantum).toFixed(Math.max(0, decimals));
}
