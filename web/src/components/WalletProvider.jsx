import { useMemo, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider as SolWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

import '@solana/wallet-adapter-react-ui/styles.css';

// Detect if running inside Farcaster frame
function isInFarcasterFrame() {
  try { return window !== window.parent; } catch { return true; }
}

const RPC_LIST = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
  'https://solana.drpc.org',
  'https://rpc.ankr.com/solana',
];

function useBestRpc() {
  const [rpc, setRpc] = useState(RPC_LIST[0]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const url of RPC_LIST) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.ok && !cancelled) {
            console.log('RPC selected:', url);
            setRpc(url);
            return;
          }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return rpc;
}

// Lazy-load FarcasterSolanaProvider only inside Farcaster (avoids buffer polyfill issues on localhost)
let FarcasterSolanaProvider = null;

export default function WalletProvider({ children }) {
  const wallets = useMemo(() => [], []);
  const rpc = useBestRpc();
  const [FcProvider, setFcProvider] = useState(null);

  useEffect(() => {
    if (isInFarcasterFrame() && !FarcasterSolanaProvider) {
      import('@farcaster/mini-app-solana').then(mod => {
        FarcasterSolanaProvider = mod.FarcasterSolanaProvider;
        setFcProvider(() => mod.FarcasterSolanaProvider);
      }).catch(() => {});
    }
  }, []);

  const core = (
    <ConnectionProvider endpoint={rpc}>
      <SolWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolWalletProvider>
    </ConnectionProvider>
  );

  // Wrap with FarcasterSolanaProvider only inside Farcaster frame
  if (FcProvider) {
    return <FcProvider>{core}</FcProvider>;
  }
  return core;
}
