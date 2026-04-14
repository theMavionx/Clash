import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

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
        // Only email login for now — no Twitter/Discord/wallet connectors
        loginMethods: ['email'],
        appearance: {
          theme: 'light',
          accentColor: '#e8b830',
          logo: '/icons/icon.jpg',
        },
        // Auto-create an embedded Solana wallet when a new user signs up via email
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
        },
        // Required by Privy even if we only expose email login, because the app
        // has Solana login enabled on the dashboard side. Empty-ish is fine —
        // the login method list controls what the UI actually offers.
        externalWallets: {
          solana: { connectors: solanaConnectors },
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
      {children}
    </PrivyProvider>
  );
}
