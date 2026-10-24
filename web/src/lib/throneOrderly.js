// Pure Throne / Orderly onboarding helpers (no browser storage), unit-tested in
// web/test-throne-client.mjs.
//
// Throne is an Orderly Network broker with broker_id "throne". An Orderly account is
// registered per (wallet, broker) with an EIP-712 `Registration`, then an ed25519
// "Orderly key" is bound to it with an EIP-712 `AddOrderlyKey` (scope read,trading).
// Typed data follows Orderly's docs exactly:
//   https://orderly.network/docs/build-on-omnichain/user-flows/accounts
//   https://orderly.network/docs/build-on-omnichain/user-flows/wallet-authentication
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import { encodeAbiParameters, getAddress, keccak256, toBytes } from 'viem';

export const THRONE_BROKER_ID = 'throne';
export const THRONE_APP_URL = 'https://throne.network';
// Throne's home chain. Orderly lists Robinhood Chain (4663) for broker throne in
// GET /v1/public/chain_info?broker_id=throne, so the EIP-712 domain uses it by default.
export const ROBINHOOD_CHAIN_ID = 4663;
export const ORDERLY_KEY_SCOPE = 'read,trading';
export const ORDERLY_KEY_MAX_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
// Off-chain domain used for Registration and AddOrderlyKey (wallet-authentication docs).
export const ORDERLY_OFFCHAIN_VERIFYING_CONTRACT = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC';

export const ORDERLY_EIP712_TYPES = Object.freeze({
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  Registration: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'registrationNonce', type: 'uint256' },
  ],
  AddOrderlyKey: [
    { name: 'brokerId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'orderlyKey', type: 'string' },
    { name: 'scope', type: 'string' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'expiration', type: 'uint64' },
  ],
});

export function orderlyDomain(chainId) {
  const id = Number(chainId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('A supported EVM chain is required for Throne signing.');
  return { name: 'Orderly', version: '1', chainId: id, verifyingContract: ORDERLY_OFFCHAIN_VERIFYING_CONTRACT };
}

/** Orderly account id = keccak256(abi.encode(address, keccak256(bytes(brokerId)))). */
export function computeThroneAccountId(address, brokerId = THRONE_BROKER_ID) {
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }],
    [getAddress(String(address).toLowerCase()), keccak256(toBytes(brokerId))])).toLowerCase();
}

/**
 * Registration typed data. `message` is the JSON body Orderly expects (nonce kept as the
 * decimal string it returned); `signingMessage` is the same values typed for viem.
 */
export function buildRegistrationTypedData({ chainId, registrationNonce, timestamp = Date.now() }) {
  const nonce = String(registrationNonce || '');
  if (!/^\d{1,40}$/u.test(nonce)) throw new Error('Invalid Orderly registration nonce.');
  const message = { brokerId: THRONE_BROKER_ID, chainId: Number(chainId), timestamp: Number(timestamp), registrationNonce: nonce };
  return { domain: orderlyDomain(chainId), types: { Registration: ORDERLY_EIP712_TYPES.Registration }, primaryType: 'Registration',
    message, signingMessage: { ...message, chainId: BigInt(message.chainId), timestamp: BigInt(message.timestamp), registrationNonce: BigInt(nonce) } };
}

/** AddOrderlyKey typed data (scope read,trading, expiration <= 365 days, Unix ms). */
export function buildAddOrderlyKeyTypedData({ chainId, orderlyKey, timestamp = Date.now(), lifetimeMs = ORDERLY_KEY_MAX_LIFETIME_MS - 60_000 }) {
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/u.test(String(orderlyKey || ''))) throw new Error('Invalid Orderly key.');
  const lifetime = Math.min(Number(lifetimeMs), ORDERLY_KEY_MAX_LIFETIME_MS);
  if (!(lifetime > 0)) throw new Error('Invalid Orderly key lifetime.');
  const message = { brokerId: THRONE_BROKER_ID, chainId: Number(chainId), orderlyKey, scope: ORDERLY_KEY_SCOPE,
    timestamp: Number(timestamp), expiration: Number(timestamp) + lifetime };
  return { domain: orderlyDomain(chainId), types: { AddOrderlyKey: ORDERLY_EIP712_TYPES.AddOrderlyKey }, primaryType: 'AddOrderlyKey',
    message, signingMessage: { ...message, chainId: BigInt(message.chainId), timestamp: BigInt(message.timestamp), expiration: BigInt(message.expiration) } };
}

/** New ed25519 Orderly key generated in the browser. The secret never leaves the vault/headers. */
export function generateOrderlyKeyPair(randomBytes = null) {
  const seed = randomBytes ? Uint8Array.from(randomBytes) : ed25519.utils.randomPrivateKey();
  if (seed.length !== 32) throw new Error('An ed25519 seed must be 32 bytes.');
  return { orderlyKey: `ed25519:${bs58.encode(ed25519.getPublicKey(seed))}`, orderlySecret: bs58.encode(seed) };
}

export function orderlyKeyFromSecret(orderlySecret) {
  const seed = bs58.decode(String(orderlySecret || '').replace(/^ed25519:/u, ''));
  if (seed.length !== 32) throw new Error('Invalid Orderly key secret.');
  return `ed25519:${bs58.encode(ed25519.getPublicKey(seed))}`;
}

/** Orderly request signature (api-authentication): base64url(ed25519(ts + METHOD + path + body)). */
export function signOrderlyRequest(orderlySecret, { timestamp, method, path, body = '' }) {
  const seed = bs58.decode(String(orderlySecret).replace(/^ed25519:/u, ''));
  const bytes = ed25519.sign(new TextEncoder().encode(`${timestamp}${String(method).toUpperCase()}${path}${body}`), seed);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

/** Pick the EIP-712 signing chain: Robinhood Chain when Orderly supports it for throne, else the wallet's chain if supported. */
export function chooseSigningChain(supportedChains = [], walletChainId = null) {
  const ids = supportedChains.map(row => Number(row?.chain_id ?? row)).filter(Number.isSafeInteger);
  if (ids.includes(ROBINHOOD_CHAIN_ID)) return ROBINHOOD_CHAIN_ID;
  if (ids.includes(Number(walletChainId))) return Number(walletChainId);
  if (ids.includes(42161)) return 42161;
  if (!ids.length) throw new Error('Orderly did not list a supported chain for Throne.');
  return ids[0];
}

/**
 * One-tap onboarding. `api` wraps our server relays; `signTypedData(typed)` asks the wallet.
 * Registers the (wallet, throne) account if needed, then binds a fresh read,trading key.
 */
export async function onboardThrone({ address, api, signTypedData, walletChainId = null, ensureChain = null, now = () => Date.now(), randomBytes = null }) {
  const wallet = getAddress(String(address || '').toLowerCase());
  const expected = computeThroneAccountId(wallet);
  const status = await api.onboarding(wallet);
  const { registration_nonce: nonce, chains } = await api.registrationNonce();
  const chainId = chooseSigningChain(chains, walletChainId);
  if (ensureChain) await ensureChain(chainId);
  let registered = status?.registered === true && String(status.account_id).toLowerCase() === expected;
  if (!registered) {
    const typed = buildRegistrationTypedData({ chainId, registrationNonce: nonce, timestamp: now() });
    const signature = await signTypedData(typed);
    const result = await api.register({ message: typed.message, signature, userAddress: wallet });
    if (String(result?.account_id || '').toLowerCase() !== expected) throw new Error('Orderly returned an unexpected Throne account.');
    registered = true;
  }
  const keys = generateOrderlyKeyPair(randomBytes);
  const typed = buildAddOrderlyKeyTypedData({ chainId, orderlyKey: keys.orderlyKey, timestamp: now() });
  const signature = await signTypedData(typed);
  await api.addKey({ message: typed.message, signature, userAddress: wallet });
  return { accountId: expected, orderlyKey: keys.orderlyKey, orderlySecret: keys.orderlySecret, address: wallet.toLowerCase(), chainId, expiresAt: typed.message.expiration };
}
