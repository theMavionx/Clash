import { validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from 'micro-key-producer/slip10.js';
import { Keypair } from '@solana/web3.js';

export function solanaMnemonicPath(account = '0') {
  if (!/^(0|[1-9][0-9]{0,3})$/.test(String(account))) throw new Error('Choose an account index from 0 to 9999.');
  return `m/44'/501'/${account}'/0'`;
}

function mnemonicKey(value, account) {
  const phrase = typeof value === 'string' ? value.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ') : '';
  if (phrase.split(' ').length !== 12 || !validateMnemonic(phrase, wordlist)) {
    throw new Error('Enter 12 valid English BIP39 words with a valid checksum. Nothing was saved.');
  }
  const path = solanaMnemonicPath(account);
  const seed = mnemonicToSeedSync(phrase, '');
  let root, child;
  try {
    root = HDKey.fromMasterSeed(seed);
    child = root.derive(path);
    return Keypair.fromSeed(child.privateKey);
  } finally {
    seed.fill(0);
    root?.privateKey.fill(0);
    root?.chainCode.fill(0);
    child?.privateKey.fill(0);
    child?.chainCode.fill(0);
  }
}

export function previewSolanaMnemonic(value, account = '0') {
  return mnemonicKey(value, account).publicKey.toBase58();
}

export function deriveSolanaMnemonic(value, account = '0') {
  const keypair = mnemonicKey(value, account);
  const bytes = keypair.secretKey;
  try { return { address: keypair.publicKey.toBase58(), secret: JSON.stringify([...bytes]) }; }
  finally { bytes.fill(0); }
}
