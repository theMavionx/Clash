import { useMemo, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider as SolWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { farcasterDetectPromise } from '../hooks/useFarcaster';

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

/**
 * Wait for Farcaster detection + wallet registration before mounting wallet adapter.
 * On mobile Warpcast (WebView), iframe check fails — we need async SDK detection.
 */
function useFarcasterWalletReady() {
  const [inFrame, setInFrame] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;

    // Wait for SDK to determine if we're in a mini app
    farcasterDetectPromise.then((isMiniApp) => {
      if (done) return;
      setInFrame(isMiniApp);

      if (!isMiniApp) {
        done = true;
        setReady(true);
        return;
      }

      // In Farcaster — wait for wallet-standard registration
      const handler = () => {
        if (!done) { done = true; setReady(true); }
      };
      window.addEventListener('wallet-standard:register-wallet', handler);

      import('@farcaster/mini-app-solana').then(() => {
        setTimeout(() => {
          if (!done) { done = true; setReady(true); }
        }, 500);
      }).catch(() => {
        if (!done) { done = true; setReady(true); }
      });

      // Safety timeout
      setTimeout(() => {
        if (!done) { done = true; setReady(true); }
      }, 3000);
    });

    // Global safety timeout
    const timer = setTimeout(() => {
      if (!done) { done = true; setReady(true); }
    }, 5000);

    return () => { done = true; clearTimeout(timer); };
  }, []);

  return { ready, inFrame };
}

export default function WalletProvider({ children }) {
  const wallets = useMemo(() => [], []);
  const rpc = useBestRpc();
  const { ready, inFrame } = useFarcasterWalletReady();

  if (!ready) return null;

  return (
    <ConnectionProvider endpoint={rpc}>
      <SolWalletProvider
        wallets={wallets}
        autoConnect={true}
        localStorageKey={inFrame ? 'fcWalletName' : 'walletName'}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolWalletProvider>
    </ConnectionProvider>
  );
}
