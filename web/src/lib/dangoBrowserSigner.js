import { hexToBytes } from 'viem';
import { signTypedDataCompat } from './risexClient';

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
