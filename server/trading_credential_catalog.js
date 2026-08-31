'use strict';
const definitions = require('../shared/trading_credential_catalog.json');
const compiled = definitions.map(row => ({ ...row, regex: new RegExp(row.pattern) }));
const forbiddenFields = /^(?:mnemonic(?:phrase)?|seed(?:phrase)?|master(?:key|privatekey|secretkey)|wallet(?:privatekey|secretkey)|recoveryphrase|authtokenforclash)$/u;
const ownerFields = new Set(['owner', 'wallet', 'master', 'onboardingowner', 'ownerwallet', 'masterwallet', 'fundingaccountaddress']);
const secretFields = /^(?:(?:api|apikey|agent|signer|delegate|delegated|secret)?privatekey|(?:agent|signer)?secretkey|agentsecretb58|apisecret)$/u;

/** Describe only supported exchange API or delegated-key storage records. */
function describe(storageKey) {
  if (typeof storageKey !== 'string' || storageKey.length > 400) return null;
  for (const row of compiled) {
    const match = row.regex.exec(storageKey);
    if (match) return { dex: row.dex, storageType: row.storageType,
      scope: { ...(row.ownerGroup ? { owner: match[row.ownerGroup] } : {}),
        ...(row.playerGroup ? { playerId: match[row.playerGroup] } : {}) } };
  }
  return null;
}
function normalizedField(key) { return String(key).replace(/[_\s-]/gu, '').toLowerCase(); }

function addOwner(owners, value) {
  if (typeof value !== 'string') return;
  if (/^0x[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(value)) owners.add(value.toLowerCase());
  else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(value)) owners.add(value);
}

function decodedSecretCandidates(value) {
  const found = new Map();
  const add = bytes => {
    if (bytes && [32, 64].includes(bytes.length)) found.set(Buffer.from(bytes).toString('hex'), Buffer.from(bytes));
  };
  if (Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) add(value);
  if (value?.type === 'Buffer' && Array.isArray(value.data)) return decodedSecretCandidates(value.data);
  if (typeof value !== 'string' || value.length > 256) return [...found.values()];
  const raw = value.trim();
  if (/^(?:0x)?(?:[0-9a-f]{64}|[0-9a-f]{128})$/iu.test(raw)) add(Buffer.from(raw.replace(/^0x/iu, ''), 'hex'));
  if (/^[A-Za-z0-9+/_-]+={0,2}$/u.test(raw)) add(Buffer.from(raw, 'base64'));
  if (/^[1-9A-HJ-NP-Za-km-z]+$/u.test(raw)) {
    try { const bs58 = require('bs58'); add((bs58.default || bs58).decode(raw)); } catch { /* not a Base58 secret */ }
  }
  return [...found.values()];
}

function inspectValue(node, state, depth = 0) {
  if (depth > 12) return false;
  if (!node || typeof node !== 'object') return typeof node !== 'function';
  return Object.entries(node).every(([key, child]) => {
    const field = normalizedField(key);
    if (forbiddenFields.test(field)) return false;
    if (field === 'onboardingplayerid' && child && child !== state.playerId) return false;
    if (ownerFields.has(field)) addOwner(state.owners, child);
    if (secretFields.test(field)) {
      for (const bytes of decodedSecretCandidates(child)) state.secrets.set(bytes.toString('hex'), bytes);
    }
    return inspectValue(child, state, depth + 1);
  });
}

function isPrimaryWalletSecret(bytes, owners) {
  if (bytes.length === 32) {
    try {
      const account = require('viem/accounts').privateKeyToAccount(`0x${bytes.toString('hex')}`);
      if (owners.has(account.address.toLowerCase())) return true;
    } catch { /* not a secp256k1 private key */ }
  }
  try {
    const { Keypair } = require('@solana/web3.js');
    const signer = bytes.length === 32 ? Keypair.fromSeed(bytes) : Keypair.fromSecretKey(bytes);
    if (owners.has(signer.publicKey.toBase58())) return true;
    // Native Ed25519 Aptos owners are also derivable from a 32-byte signer seed.
    const aptosOwner = `0x${require('node:crypto').createHash('sha3-256')
      .update(signer.publicKey.toBytes()).update(Buffer.from([0])).digest('hex')}`;
    return owners.has(aptosOwner);
  } catch { return false; }
}

/** Reject primary-wallet material; owner metadata is an exclusion, never proof of authorization. */
function validate(storageKey, value, playerId, { ownerWallets = [] } = {}) {
  const descriptor = describe(storageKey);
  if (!descriptor || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (descriptor.scope.playerId && descriptor.scope.playerId !== playerId) return false;
  if (value.onboardingPlayerId && value.onboardingPlayerId !== playerId) return false;
  if (descriptor.dex === 'etoro' && value.environment !== 'real') return false;
  const state = { playerId, owners: new Set(), secrets: new Map() };
  addOwner(state.owners, descriptor.scope.owner);
  for (const owner of ownerWallets) addOwner(state.owners, owner);
  if (!inspectValue(value, state)) return false;
  return [...state.secrets.values()].every(bytes => !isPrimaryWalletSecret(bytes, state.owners));
}
module.exports = { describe, validate };
