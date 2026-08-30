import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('./src/components/PrivyAuthProvider.jsx', import.meta.url), 'utf8');
const { code } = await transformWithOxc(source.slice(source.indexOf('function PrivyStateBridge('))
  .replace('export default function', 'function')
  .replace('import.meta.env.VITE_PRIVY_APP_ID', "'fixture-app'"), 'privy-provider.jsx', { jsx: { runtime: 'classic' } });

function setup() {
  const state = { ready: true, authenticated: true, user: { id: 'user-a', linkedAccounts: [{ type: 'wallet', chainType: 'solana', address: 'existing-wallet' }] } };
  let solanaWallets = [];
  const context = vm.createContext({
    React, useMemo: fn => fn(),
    usePrivy: () => state,
    usePrivyEvmWallets: () => ({ wallets: [] }),
    usePrivySolanaWallets: () => ({ ready: true, wallets: solanaWallets }),
    useSendTransaction: () => ({}),
    usePrivySolanaSignTransaction: () => ({}),
    usePrivySolanaSignMessage: () => ({}),
    usePrivySolanaSignAndSendTransaction: () => ({}),
    // Any accidental reintroduction of the competing creation effect fails.
    useEffect: () => { throw new Error('Bridge must not run a competing creation effect'); },
    useRef: () => ({ current: false }),
    useCreateSolanaWallet: () => { throw new Error('SDK automatic creation owns this flow'); },
    OptionalPrivyContext: React.createContext({}),
    useFuturesTheme: () => ({ theme: 'dark' }), FUTURES_THEME_DARK: 'dark',
    PrivyProvider: 'mock-privy-provider',
    base: {}, arbitrum: {}, mainnet: {}, monadChain: {}, hyperEvmChain: {},
    riseChain: {}, inkChain: {}, grvtChain: {}, katanaChain: {},
    solanaWalletConnectors: [], SOLANA_RPC_HTTP: 'https://rpc.invalid', SOLANA_RPC_WS: 'wss://rpc.invalid',
    createSolanaRpc: () => ({}), createSolanaRpcSubscriptions: () => ({}),
  });
  const components = vm.runInContext(code + '\n({ PrivyStateBridge, PrivyAuthProvider });', context);
  return { ...components, state, wallets: value => { solanaWallets = value; } };
}

test('SDK remains the single wallet creator for both Solana and EVM email login', () => {
  const { PrivyAuthProvider } = setup();
  const element = PrivyAuthProvider({ children: 'game' });
  assert.equal(element.props.config.embeddedWallets.solana.createOnLogin, 'all-users');
  assert.equal(element.props.config.embeddedWallets.ethereum.createOnLogin, 'all-users');
  assert.deepEqual(Array.from(element.props.config.loginMethods), ['email']);
  assert.equal(element.props.children.props.children, 'game');
  assert.doesNotMatch(source, /useCreateWallet|createSolanaWallet/);
});

test('existing disconnected wallet is not recreated during hydration or repeated renders', () => {
  const { PrivyStateBridge, state, wallets } = setup();
  for (let i = 0; i < 3; i++) {
    const bridge = PrivyStateBridge({ children: 'game' });
    assert.equal(bridge.props.value.user, state.user);
    assert.equal(bridge.props.value.solanaWallets.length, 0);
  }
  const existing = { address: 'existing-wallet' };
  wallets([existing]);
  assert.equal(PrivyStateBridge({}).props.value.solanaWallets[0], existing);
});

test('new login and account switch expose current SDK identity without inventing wallets', () => {
  const { PrivyStateBridge, state } = setup();
  state.authenticated = false;
  state.user = null;
  assert.equal(PrivyStateBridge({}).props.value.authenticated, false);
  state.authenticated = true;
  state.user = { id: 'new-user', linkedAccounts: [] };
  assert.equal(PrivyStateBridge({}).props.value.user.id, 'new-user');
  state.user = { id: 'another-user', linkedAccounts: [] };
  assert.equal(PrivyStateBridge({}).props.value.user.id, 'another-user');
});
