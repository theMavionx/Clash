import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { base } from 'viem/chains';

const solanaConnectors = toSolanaWalletConnectors();
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
        // Email + external wallet. 'wallet' enables the MetaMask / Coinbase /
        // WalletConnect / Phantom chooser inside the Privy modal — covers
        // both EVM (Avantis) and Solana (Pacifica) identities.
        loginMethods: ['email', 'wallet'],
        appearance: {
          theme: 'light',
          accentColor: '#e8b830',
          logo: '/icons/icon.jpg',
          walletChainType: 'ethereum-and-solana',
        },
        // Auto-create BOTH embedded wallets on sign-up. Pacifica reads the
        // Solana one, Avantis reads the Ethereum (Base) one.
        embeddedWallets: {
          solana:   { createOnLogin: 'users-without-wallets' },
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
        // External wallet connectors. Solana → wallet-adapter. EVM auto-
        // detected by Privy (MetaMask/Rabby/Coinbase/WalletConnect).
        externalWallets: {
          solana: { connectors: solanaConnectors },
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
