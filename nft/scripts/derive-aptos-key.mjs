// Derive the Aptos account from `NFT_BASE` (BIP-39 mnemonic) via SLIP-44
// path `m/44'/637'/0'/0'/0'`. Prints address + ed25519 private key in hex.
//
// SECURITY: this prints the private key to stdout. Capture it ONLY long
// enough to set up `aptos init --profile mainnet --private-key <hex>`,
// then discard. Never commit, never log.
//
// Usage:
//   node scripts/derive-aptos-key.mjs            # prints addr + privkey
//   node scripts/derive-aptos-key.mjs --addr     # prints addr only (safe)

import { Account } from '@aptos-labs/ts-sdk';
import { loadEnv } from './lib-env.mjs';

const env = loadEnv();
const mnemonic = env.NFT_BASE;
if (!mnemonic || mnemonic.split(/\s+/).length < 12) {
  console.error('NFT_BASE mnemonic not found in env (expected ≥12 words).');
  process.exit(1);
}

const account = Account.fromDerivationPath({
  path: "m/44'/637'/0'/0'/0'",
  mnemonic: mnemonic.trim(),
});

const addr = account.accountAddress.toString();
const pubkey = account.publicKey.toString();
const privkey = account.privateKey.toString();

const addrOnly = process.argv.includes('--addr');
if (addrOnly) {
  console.log(addr);
} else {
  console.log('address  :', addr);
  console.log('pubkey   :', pubkey);
  console.log('privkey  :', privkey);
}
