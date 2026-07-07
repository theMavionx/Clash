import { hexToBytes } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signTypedDataCompat } from './risexClient';

const DANGO_ARBITRARY_DOMAIN = Object.freeze({
  name: 'DangoArbitraryMessage',
  chainId: 1,
  verifyingContract: '0x0000000000000000000000000000000000000000',
});
const DANGO_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === 'function') return btoa(binary);
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor?.from) return BufferCtor.from(bytes).toString('base64');
  throw new Error('Base64 encoder is not available');
}

function utf8ToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(String(text || '')));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToHex0x(bytes) {
  return `0x${bytesToHex(bytes)}`;
}

function camelToSnake(key) {
  return String(key || '').replace(/[A-Z]/g, ch => `_${ch.toLowerCase()}`);
}

function snakeCaseJson(value) {
  if (Array.isArray(value)) return value.map(snakeCaseJson);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[camelToSnake(key)] = snakeCaseJson(item);
  }
  return out;
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortedObject(value[key]);
  }
  return out;
}

function canonicalJsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(sortedObject(snakeCaseJson(value))));
}

async function sha256Bytes(value) {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return new Uint8Array(digest);
}

function compactSecp256k1Signature(signature) {
  const bytes = hexToBytes(signature);
  if (bytes.length === 64) return bytes;
  if (bytes.length !== 65) throw new Error('Dango session signature must be 64 or 65 bytes');
  return bytes.slice(0, 64);
}

function compressedPublicKeyFromAccount(account) {
  const bytes = hexToBytes(String(account?.publicKey || '').trim());
  if (bytes.length === 33) return bytes;
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error('Dango session public key is invalid');
  }
  const x = bytes.slice(1, 33);
  const y = bytes.slice(33, 65);
  return new Uint8Array([(y[31] & 1) ? 3 : 2, ...x]);
}

export async function dangoEthereumKeyHash(address) {
  const clean = String(address || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{1,64}$/u.test(clean)) throw new Error('Connect a Dango/EVM wallet first');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean));
  return bytesToHex(new Uint8Array(digest)).toUpperCase();
}

export function dangoNormalizeSignature(signature) {
  const bytes = hexToBytes(signature);
  if (bytes.length !== 65) throw new Error('Dango EIP-712 signature must be 65 bytes');
  const out = new Uint8Array(bytes);
  if (out[64] >= 27) out[64] -= 27;
  if (out[64] > 1) throw new Error('Dango EIP-712 signature has an invalid recovery id');
  return out;
}

function composeDangoSessionAuthorizationTypedData(sessionInfo) {
  return {
    domain: DANGO_ARBITRARY_DOMAIN,
    primaryType: 'Message',
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Message: [
        { name: 'chain_id', type: 'string' },
        { name: 'expire_at', type: 'string' },
        { name: 'session_key', type: 'string' },
      ],
    },
    message: snakeCaseJson(sessionInfo),
  };
}

export function dangoSessionIsUsable(session, nowMs = Date.now()) {
  if (!session || typeof session !== 'object') return false;
  if (!session.privateKey || !session.sessionInfo?.sessionKey || !session.authorization) return false;
  const expireAt = Number(session.sessionInfo.expireAt || session.sessionInfo.expire_at || 0);
  return Number.isFinite(expireAt) && expireAt * 1000 > nowMs + 60_000;
}

export async function createDangoSession({ evm, account, chainId = 'dango-1', ttlMs = DANGO_SESSION_TTL_MS } = {}) {
  const walletAddress = String(account || evm?.address || '').trim();
  if (!walletAddress) throw new Error('Connect a Dango/EVM wallet first');
  if (typeof crypto?.subtle?.digest !== 'function') throw new Error('Browser crypto is not available');
  if (typeof evm?.ensureChain === 'function') await evm.ensureChain(DANGO_ARBITRARY_DOMAIN.chainId);
  const walletClient = typeof evm?.getWalletClient === 'function'
    ? evm.getWalletClient(DANGO_ARBITRARY_DOMAIN.chainId)
    : evm?.walletClient;
  const privateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(privateKey);
  const sessionKey = bytesToBase64(compressedPublicKeyFromAccount(sessionAccount));
  const sessionInfo = {
    chainId: String(chainId || 'dango-1'),
    sessionKey,
    expireAt: String(Math.floor((Date.now() + Math.max(60_000, Number(ttlMs) || DANGO_SESSION_TTL_MS)) / 1000)),
  };
  const typedData = composeDangoSessionAuthorizationTypedData(sessionInfo);
  const rawSignature = await signTypedDataCompat({
    provider: evm?.provider,
    walletClient,
    account: walletAddress,
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });
  const authorization = {
    keyHash: await dangoEthereumKeyHash(walletAddress),
    signature: {
      eip712: {
        sig: bytesToBase64(dangoNormalizeSignature(rawSignature)),
        typed_data: utf8ToBase64(JSON.stringify(typedData)),
      },
    },
  };
  return {
    version: 1,
    privateKey,
    publicKey: sessionKey,
    keyHash: authorization.keyHash,
    sessionInfo,
    authorization,
    createdAt: Date.now(),
  };
}

export async function signDangoSessionTx({ session, signDoc } = {}) {
  if (!dangoSessionIsUsable(session)) throw new Error('Dango one tap session expired. Enable it again.');
  if (!signDoc?.message) throw new Error('Dango session signer received an invalid SignDoc');
  const signer = privateKeyToAccount(session.privateKey);
  const hash = await sha256Bytes(canonicalJsonBytes(signDoc.message));
  const rawSignature = await signer.sign({ hash: bytesToHex0x(hash) });
  return {
    session: {
      sessionInfo: session.sessionInfo,
      sessionSignature: bytesToBase64(compactSecp256k1Signature(rawSignature)),
      authorization: session.authorization,
    },
  };
}

function normalizeChainId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = /^0x/i.test(text) ? Number.parseInt(text, 16) : Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function signDangoTx({ evm, account, signDoc, keyHash = '' }) {
  const walletAddress = String(account || evm?.address || '').trim();
  if (!walletAddress) throw new Error('Connect a Dango/EVM wallet first');
  if (!signDoc?.domain || !signDoc?.types || !signDoc?.primaryType || !signDoc?.message) {
    throw new Error('Dango signer received an invalid EIP-712 document');
  }
  const signingChainId = normalizeChainId(signDoc.domain.chainId);
  if (signingChainId && typeof evm?.ensureChain === 'function') {
    await evm.ensureChain(signingChainId);
  }
  const walletClient = typeof evm?.getWalletClient === 'function'
    ? evm.getWalletClient(signingChainId || undefined)
    : evm?.walletClient;
  const rawSignature = await signTypedDataCompat({
    provider: evm?.provider,
    walletClient,
    account: walletAddress,
    domain: signDoc.domain,
    types: signDoc.types,
    primaryType: signDoc.primaryType,
    message: signDoc.message,
  });
  const normalizedSignature = dangoNormalizeSignature(rawSignature);
  const resolvedKeyHash = keyHash || await dangoEthereumKeyHash(walletAddress);
  return {
    standard: {
      keyHash: resolvedKeyHash,
      signature: {
        eip712: {
          sig: bytesToBase64(normalizedSignature),
          typed_data: utf8ToBase64(JSON.stringify(signDoc)),
        },
      },
    },
  };
}
