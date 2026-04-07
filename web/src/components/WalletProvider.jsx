import { useMemo, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider as SolWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { FarcasterSolanaProvider } from '@farcaster/mini-app-solana';

import '@solana/wallet-adapter-react-ui/styles.css';

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

function isFarcasterFrame() {
  try { return window !== window.parent; } catch { return true; }
}

export default function WalletProvider({ children }) {
  const wallets = useMemo(() => [], []);
  const rpc = useBestRpc();
  const inFrame = useMemo(() => isFarcasterFrame(), []);

  // Inside Farcaster: use their provider (handles wallet registration + autoConnect)
  if (inFrame) {
    return (
      <FarcasterSolanaProvider endpoint={rpc}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </FarcasterSolanaProvider>
    );
  }

  // Regular browser: standard wallet adapter
  return (
    <ConnectionProvider endpoint={rpc}>
      <SolWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolWalletProvider>
    </ConnectionProvider>
  );
}
