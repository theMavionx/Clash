import fs from 'node:fs';
import path from 'node:path';
import bs58 from 'bs58';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { Keypair, PublicKey } from '@solana/web3.js';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const NFT_DIR = path.resolve(import.meta.dirname, '..');

export function readEnvFile(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

export function loadEnv() {
  return {
    ...readEnvFile(path.join(ROOT, '.env')),
    ...readEnvFile(path.join(ROOT, 'web', '.env')),
    ...process.env,
  };
}

export function publicBaseUrl(env) {
  return (env.NFT_PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || env.APP_PUBLIC_URL || 'https://clashofperps.fun').replace(/\/+$/, '');
}

export function baseTokenUri(env) {
  return env.NFT_BASE_TOKEN_URI || `${publicBaseUrl(env)}/api/nft/base/`;
}

export function evmTokenUri(env, chainKey = 'base') {
  const normalized = String(chainKey || 'base').toUpperCase();
  return env[`NFT_${normalized}_TOKEN_URI`]
    || env[`NFT_${normalized}_BASE_TOKEN_URI`]
    || (String(chainKey || 'base').toLowerCase() === 'base'
      ? baseTokenUri(env)
      : `${publicBaseUrl(env)}/api/nft/${String(chainKey).toLowerCase()}/`);
}

export function baseContractUri(env) {
  return env.NFT_BASE_CONTRACT_URI || `${publicBaseUrl(env)}/api/nft/base/contract`;
}

export function solanaItemUri(env, index) {
  return `${env.NFT_SOLANA_ITEM_URI_BASE || `${publicBaseUrl(env)}/api/nft/solana/`}${index}`;
}

export function solanaCollectionUri(env) {
  return env.NFT_SOLANA_COLLECTION_URI || `${publicBaseUrl(env)}/api/nft/solana/collection`;
}

export function solanaHiddenUri(env) {
  return env.NFT_SOLANA_HIDDEN_URI || `${publicBaseUrl(env)}/api/nft/solana/hidden`;
}

export function solanaPriceLamports(env) {
  if (env.NFT_SOLANA_PRICE_LAMPORTS) return BigInt(env.NFT_SOLANA_PRICE_LAMPORTS);
  const sol = env.NFT_SOLANA_PRICE_SOL || env.NFT_PRICE_SOL || '0';
  const [whole, frac = ''] = String(sol).split('.');
  return BigInt(whole || '0') * 1_000_000_000n + BigInt((frac + '000000000').slice(0, 9));
}

export function parseEthPrivateKey(env) {
  const parsed = parseEthAccount(env);
  if (!parsed.privateKey) {
    throw new Error(`${parsed.source} is a mnemonic-derived account and does not expose a raw private key. Use parseEthAccount instead.`);
  }
  return { privateKey: parsed.privateKey, source: parsed.source };
}

export function parseEthAccount(env) {
  const raw = env.NFT_EVM_KEY || env.NFT_BASE || env.BASE_NFT_KEY || env.NFT_KEY;
  const sourceName = env.NFT_EVM_KEY ? 'NFT_EVM_KEY' : env.NFT_BASE ? 'NFT_BASE' : env.BASE_NFT_KEY ? 'BASE_NFT_KEY' : 'NFT_KEY';
  if (!raw) throw new Error('Missing NFT_EVM_KEY / NFT_BASE / BASE_NFT_KEY / NFT_KEY');
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    const key = raw.startsWith('0x') ? raw : `0x${raw}`;
    return { account: privateKeyToAccount(key), privateKey: key, source: sourceName };
  }

  const words = raw.trim().split(/\s+/);
  if (words.length >= 12 && words.length <= 24 && words.every((word) => /^[a-z]+$/i.test(word))) {
    const path = env.NFT_BASE_MNEMONIC_PATH || "m/44'/60'/0'/0/0";
    return {
      account: mnemonicToAccount(raw.trim(), { path }),
      privateKey: null,
      source: `${sourceName} mnemonic (${path})`,
    };
  }

  let decoded = null;
  try {
    decoded = bs58.decode(raw);
  } catch {
    // ignored below
  }
  if (decoded && decoded.length === 32 && sourceName !== 'NFT_KEY') {
    const privateKey = `0x${Buffer.from(decoded).toString('hex')}`;
    return {
      account: privateKeyToAccount(privateKey),
      privateKey,
      source: `${sourceName} base58-encoded 32-byte EVM key`,
    };
  }
  if (decoded && decoded.length === 64 && sourceName === 'NFT_KEY') {
    throw new Error(
      'NFT_KEY looks like a 64-byte Solana secret key, not the MetaMask/Base private key. ' +
      'Put the MetaMask private key in NFT_EVM_KEY, NFT_BASE, or BASE_NFT_KEY.'
    );
  }
  throw new Error(`${sourceName} is not a usable EVM private key. Expected a 32-byte hex private key.`);
}

export function parseSolanaKeypair(env) {
  const raw = env.SOLANA_NFT_KEY || env.NFT_SOLANA_KEY || env.NFT_KEY;
  if (!raw) throw new Error('Missing NFT_KEY / SOLANA_NFT_KEY');

  if (/^\s*\[/.test(raw)) {
    const bytes = Uint8Array.from(JSON.parse(raw));
    if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
    if (bytes.length === 32) return Keypair.fromSeed(bytes);
  }

  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    return Keypair.fromSeed(Uint8Array.from(Buffer.from(hex, 'hex')));
  }

  const decoded = bs58.decode(raw);
  if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
  if (decoded.length === 32) return Keypair.fromSeed(decoded);
  throw new Error(`Unsupported Solana key length: ${decoded.length} bytes`);
}

export function requirePublicKey(value, label) {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a valid Solana public key`);
  }
}
