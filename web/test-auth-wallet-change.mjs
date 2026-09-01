import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  authWalletKindForDex,
  EVM_AUTH_DEX_IDS,
  SOLANA_AUTH_DEX_IDS,
} from './src/auth/walletSelection.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('auth wallet picker routing covers every venue family', () => {
  for (const dex of EVM_AUTH_DEX_IDS) assert.equal(authWalletKindForDex(dex), 'evm', dex);
  for (const dex of SOLANA_AUTH_DEX_IDS) assert.equal(authWalletKindForDex(dex), 'solana', dex);
  assert.equal(authWalletKindForDex('decibel'), 'aptos');
  assert.equal(authWalletKindForDex('DECIBEL'), 'aptos');
  assert.equal(authWalletKindForDex('unknown'), 'unknown');
});

test('changing wallet clears stale candidates without losing the selected DEX', () => {
  const source = read('src/auth/useAuthFlow.js');
  const start = source.indexOf('const changeWallet = useCallback');
  const end = source.indexOf('const submitName = useCallback', start);
  assert.ok(start >= 0 && end > start, 'changeWallet action is present');
  const action = source.slice(start, end);
  assert.match(action, /registerAttemptManagerRef\.current\?\.cancelCurrent/u);
  assert.match(action, /evmDisconnect\?\.\(\)/u);
  assert.match(action, /solWallet\?\.disconnect\?\.\(\)/u);
  assert.match(action, /aptosWallet\?\.disconnect\?\.\(\)/u);
  assert.match(action, /privyLogout\?\.\(\)/u);
  assert.match(action, /Promise\.allSettled/u);
  assert.doesNotMatch(action, /writeDexPicked\(false\)|setDexPickedState\(false\)/u);
});

test('Change and Back wait for reset, then open the chain-correct wallet picker', () => {
  const panel = read('src/components/RegisterPanel.jsx');
  const start = panel.indexOf('const chooseDifferentWallet = useCallback');
  const end = panel.indexOf('const backFromName = useCallback', start);
  assert.ok(start >= 0 && end > start, 'wallet chooser callback is present');
  const callback = panel.slice(start, end);
  assert.match(callback, /await actions\.changeWallet\?\.\(\)/u);
  assert.ok(callback.indexOf('await actions.changeWallet?.()') < callback.indexOf("kind === 'evm'"));
  assert.match(callback, /setEvmModalOpen\(true\)/u);
  assert.match(callback, /await aptos\.connect\?\.\(\)/u);
  assert.match(callback, /openSolanaWallet/u);
  assert.match(panel, /CHANGE WALLET/u);
  assert.match(panel, /BACK TO WALLETS/u);
  assert.match(panel, /onChangeDex=\{actions\.unpickDex\}/u);
});

test('explicit DEX unpick clears reconnect recovery and always reaches the picker', () => {
  const source = read('src/auth/useAuthFlow.js');
  const start = source.indexOf('const unpickDex = useCallback');
  const end = source.indexOf('const changeWallet = useCallback', start);
  assert.ok(start >= 0 && end > start, 'unpickDex action is present');
  const action = source.slice(start, end);
  assert.match(action, /writeDexPicked\(false\)/u);
  assert.match(action, /setDexPickedState\(false\)/u);
  assert.match(action, /clearManualReconnectRequired\(\)/u);
  assert.match(action, /\[clearManualReconnectRequired\]/u);
  assert.match(source, /if \(!dexPicked && !manualReconnectRequired\) return 'pick_dex'/u);
  assert.doesNotMatch(source, /if \(!dexPicked && !storedAuthWallet && !manualReconnectRequired\) return 'pick_dex'/u);
});
