import { Keypair } from '@solana/web3.js';

// Explicit Ed25519 seed derivation, NOT an Ethereum-to-Solana account conversion.
// Never infer this mode for normal Solana imports. Preview callers retain only address.
function keypairFromHex(value) {
  if (typeof value !== 'string' || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(value.trim())) {
    throw new Error('Enter exactly 32 bytes: 64 hexadecimal characters, optionally prefixed with 0x.');
  }
  const hex = value.trim().replace(/^0x/, '');
  const seed = Uint8Array.from(hex.match(/../g), byte => parseInt(byte, 16));
  const keypair = Keypair.fromSeed(seed);
  seed.fill(0);
  return keypair;
}
export function previewSolanaHexAddress(value) {
  return keypairFromHex(value).publicKey.toBase58();
}
export function deriveSolanaHexKey(value) {
  const keypair = keypairFromHex(value);
  const secretBytes = keypair.secretKey;
  try {
    return { address: keypair.publicKey.toBase58(), secret: JSON.stringify([...secretBytes]) };
  } finally { secretBytes.fill(0); }
}
