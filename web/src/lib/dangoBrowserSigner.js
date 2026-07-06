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

export async function signDangoTx({ evm, account, signDoc, keyHash = '' }) {
  const walletAddress = String(account || evm?.address || '').trim();
  if (!walletAddress) throw new Error('Connect a Dango/EVM wallet first');
  if (!signDoc?.domain || !signDoc?.types || !signDoc?.primaryType || !signDoc?.message) {
    throw new Error('Dango signer received an invalid EIP-712 document');
  }
  const walletClient = typeof evm?.getWalletClient === 'function'
    ? evm.getWalletClient()
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
