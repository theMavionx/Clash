import { PrivyProvider } from '@privy-io/react-auth';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { base } from 'viem/chains';

// publicnode has no SSL/cert issues and is open. api.mainnet-beta fails with
// ERR_CERT_AUTHORITY_INVALID on some networks, breaking Privy's send-TX flow.
const SOLANA_RPC_HTTP = 'https://solana-rpc.publicnode.com';
const SOLANA_RPC_WS = 'wss://solana-rpc.publicnode.com';

// Wraps children in PrivyProvider. When VITE_PRIVY_APP_ID is unset (e.g. local dev
// without a Privy project yet), renders children without Privy so the rest of the
// app keeps working and the "Login with Privy" button can simply be disabled.
export default function PrivyAuthProvider({ children }) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID;
  if (!appId) return children;

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
        // Auto-create BOTH embedded wallets on email sign-up. Pacifica reads
        // the Solana one, Avantis reads the Ethereum (Base) one.
        embeddedWallets: {
          solana:   { createOnLogin: 'users-without-wallets' },
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
        // Default EVM chain for trading = Base mainnet (Avantis runs there).
        defaultChain: base,
        supportedChains: [base],
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
      {children}
    </PrivyProvider>
  );
}
