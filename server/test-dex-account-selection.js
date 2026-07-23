'use strict';

const assert = require('assert');
const { planDexAccountWalletUpdate } = require('./dex_account_selection');

const solanaWallet = 'BPwh3wMpnjnJvDSVePZKBwKUuXd4kLD334wiqtu5ztPL';
const evmWallet = '0x6d3c73d2ee1179b0b03d1b398bb2461dd0a7e2c0';

const preserved = planDexAccountWalletUpdate({
  existingVenueWallet: evmWallet,
  loginWallet: solanaWallet,
  loginChainType: 'solana',
  metadata: { source: 'select-dex' },
});
assert.strictEqual(preserved.wallet, evmWallet);
assert.strictEqual(preserved.status, 'ready');
assert.deepStrictEqual(preserved.metadata, {
  source: 'select-dex',
  ignored_wallet: solanaWallet,
  ignored_chain_type: 'solana',
  preserved_wallet: evmWallet,
  preserved_because: 'login_wallet_chain_mismatch',
});

const disconnected = planDexAccountWalletUpdate({
  loginWallet: solanaWallet,
  loginChainType: 'solana',
  metadata: { source: 'select-dex' },
});
assert.strictEqual(disconnected.wallet, '');
assert.strictEqual(disconnected.status, 'disconnected');
assert.strictEqual(disconnected.metadata.__clear_wallet, true);

const linked = planDexAccountWalletUpdate({
  venueWallet: evmWallet,
  loginWallet: solanaWallet,
  loginChainType: 'solana',
  metadata: { source: 'select-dex' },
});
assert.strictEqual(linked.wallet, evmWallet);
assert.strictEqual(linked.status, 'ready');
assert.deepStrictEqual(linked.metadata, { source: 'select-dex' });

console.log('dex account selection planning: ok');
