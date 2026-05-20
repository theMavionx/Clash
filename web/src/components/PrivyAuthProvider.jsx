import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { PrivyProvider, usePrivy, useSendTransaction, useWallets as usePrivyEvmWallets } from '@privy-io/react-auth';
import { toSolanaWalletConnectors, useCreateWallet as useCreateSolanaWallet, useWallets as usePrivySolanaWallets } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { base, arbitrum } from 'viem/chains';
import { monadChain } from '../lib/monadConfig';
import { hyperEvmChain } from '../lib/hyperevmConfig';
import { riseChain } from '../lib/risexConfig';
import { DEFAULT_SOLANA_RPC_URL, solanaWsUrl } from '../lib/solanaRpc';
// Perpl (Monad mainnet) is too new to ship in viem/chains, so we define it
// locally in monadConfig and import the same object both here (Privy's
// supportedChains list) and in EvmWalletContext (chain switch helper).
// Without Monad in supportedChains, Privy's wagmi connector store can't
// resolve a Connector for chain id 143 — every later `wallet_switchEthereumChain`
// to Monad fires `Cannot read .connectors of null` from inside Privy.
//
// (The earlier "useWallets called outside PrivyProvider" warning that
// looked like THIS broke Privy was actually a missing VITE_PRIVY_APP_ID
// in the deployed .env: when appId is unset, PrivyAuthProvider returns
// children without wrapping them, so every Privy hook downstream warns.
// Adding Monad here is fine when appId is set.)

const SOLANA_RPC_HTTP = DEFAULT_SOLANA_RPC_URL;
const SOLANA_RPC_WS = solanaWsUrl(SOLANA_RPC_HTTP);
const solanaWalletConnectors = toSolanaWalletConnectors({ shouldAutoConnect: false });
const OPTIONAL_PRIVY_DEFAULT = {
  enabled: false,
  ready: true,
  authenticated: false,
  user: null,
  login: () => {},
  logout: () => {},
  evmWallets: [],
  solanaWallets: [],
  evmSendTransaction: null,
};
const OptionalPrivyContext = createContext(OPTIONAL_PRIVY_DEFAULT);

export function useOptionalPrivy() {
  return useContext(OptionalPrivyContext);
}

function PrivyStateBridge({ children }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets: evmWallets } = usePrivyEvmWallets();
  const { sendTransaction: evmSendTransaction } = useSendTransaction();
  const { ready: solanaReady, wallets: solanaWallets } = usePrivySolanaWallets();
  const { createWallet: createSolanaWallet } = useCreateSolanaWallet();
  const solanaCreateTriedRef = useRef(false);

  useEffect(() => {
    if (!authenticated) {
      solanaCreateTriedRef.current = false;
      return;
    }
    if (!ready || !solanaReady) return;
    const hasSolanaWallet = (solanaWallets || []).some(w => w?.address);
    if (hasSolanaWallet || solanaCreateTriedRef.current) return;
    solanaCreateTriedRef.current = true;
    Promise.resolve(createSolanaWallet()).catch(err => {
      console.warn('[privy] Solana embedded wallet create failed:', err?.message || err);
    });
  }, [ready, authenticated, solanaReady, solanaWallets, createSolanaWallet]);

  const value = useMemo(() => ({
    enabled: true,
    ready,
    authenticated,
    user,
    login,
    logout,
    evmWallets: evmWallets || [],
    solanaWallets: solanaWallets || [],
    evmSendTransaction,
  }), [ready, authenticated, user, login, logout, evmWallets, solanaWallets, evmSendTransaction]);
  return (
    <OptionalPrivyContext.Provider value={value}>
      {children}
    </OptionalPrivyContext.Provider>
  );
}

// Wraps children in PrivyProvider. When VITE_PRIVY_APP_ID is unset (e.g. local dev
// without a Privy project yet), renders children without Privy so the rest of the
// app keeps working and the "Login with Privy" button can simply be disabled.
export default function PrivyAuthProvider({ children }) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID;
  if (!appId) {
    return (
      <OptionalPrivyContext.Provider value={OPTIONAL_PRIVY_DEFAULT}>
        {children}
      </OptionalPrivyContext.Provider>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Email only. External wallet connections happen OUTSIDE Privy:
        //   Pacifica → Solana wallet-adapter modal (user's own wallet)
        //   Avantis  → custom EvmWalletModal (window.ethereum detection)
        // This gives us full UI control and avoids Privy's "unified" modal
        // that was hanging with ethereum-and-solana.
        loginMethods: ['email'],
        appearance: {
          theme: 'light',
          accentColor: '#e8b830',
          logo: '/icons/icon.jpg',
        },
        // Auto-create embedded wallets for email users even if an injected
        // wallet exists in the browser. Otherwise Privy email sessions can
        // authenticate successfully but still land in "connect wallet" on
        // Solana trading screens.
        embeddedWallets: {
          solana:   { createOnLogin: 'all-users' },
          ethereum: { createOnLogin: 'all-users' },
        },
        // Default EVM chain for trading = Base mainnet (Avantis runs there).
        // GMX V2 sits on Arbitrum, so the embedded wallet has to be allowed
        // to switch there too — without arbitrum in `supportedChains`, Privy
        // rejects `wallet_switchEthereumChain` with a non-EIP-3326 error
        // that our 4902 fallback in gmxConfig.ensureArbitrumChain doesn't
        // catch, so every email/social-login user's GMX trade aborts in
        // ensureChain() before the signing popup. Adding arbitrum unblocks
        // them; defaultChain stays Base so Avantis sessions don't change UX.
        defaultChain: base,
        supportedChains: [base, arbitrum, monadChain, hyperEvmChain, riseChain],
        externalWallets: {
          // Privy still reads dashboard wallet-login settings even though our
          // UI uses email-only auth. Passing Solana standard connectors keeps
          // the SDK quiet without letting it auto-pop wallets on page load.
          solana: { connectors: solanaWalletConnectors },
        },
        // Needed by Privy's embedded-wallet sign-and-send UI. Without this,
        // attempting a transaction throws "No RPC configuration found for chain solana:mainnet".
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc(SOLANA_RPC_HTTP),
              rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_RPC_WS),
            },
          },
        },
        // Legacy key — kept for older Privy code paths that still read it.
        solanaClusters: [{ name: 'mainnet-beta', rpcUrl: SOLANA_RPC_HTTP }],
      }}
    >
      <PrivyStateBridge>
        {children}
      </PrivyStateBridge>
    </PrivyProvider>
  );
}
