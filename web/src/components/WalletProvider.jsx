import { useMemo, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider as SolWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  SolanaMobileWalletAdapter,
  createDefaultAuthorizationResultCache,
  createDefaultAddressSelector,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';
import { farcasterDetectPromise } from '../hooks/useFarcaster';

import '@solana/wallet-adapter-react-ui/styles.css';

// Mobile Wallet Adapter — registered for every session but only resolves
// to "Installed" on Saga/Seeker (devices with the Solana Mobile Stack
// intent handler). On every other host the adapter sits in NotDetected
// state and never appears in the wallet picker, so plain Android / iOS /
// desktop users see no behaviour change.
//
// `appIdentity` is what shows up in the Seed Vault confirmation popup
// when the user first authorises the dapp — name + icon + uri.
const SEEKER_MWA_ADAPTER = new SolanaMobileWalletAdapter({
  addressSelector: createDefaultAddressSelector(),
  appIdentity: {
    name: 'Clash of Perps',
    uri: 'https://clashofperps.fun',
    icon: '/icons/icon-512.png',
  },
  authorizationResultCache: createDefaultAuthorizationResultCache(),
  chain: 'solana:mainnet',
  onWalletNotFound: createDefaultWalletNotFoundHandler(),
});

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
  // Single state object to avoid double-render from two separate setStates in promise callbacks
  const [status, setStatus] = useState({ inFrame: false, ready: false });

  useEffect(() => {
    let done = false;
    const finish = (inFrame) => {
      if (done) return;
      done = true;
      setStatus({ inFrame, ready: true });
    };

    farcasterDetectPromise.then((isMiniApp) => {
      if (done) return;

      if (!isMiniApp) {
        finish(false);
        return;
      }

      // Show "waiting for wallet" state — single render
      setStatus({ inFrame: true, ready: false });

      const handler = () => finish(true);
      window.addEventListener('wallet-standard:register-wallet', handler);

      import('@farcaster/mini-app-solana').then(() => {
        setTimeout(() => finish(true), 500);
      }).catch(() => finish(true));

      setTimeout(() => finish(true), 3000);
    });

    const timer = setTimeout(() => finish(false), 5000);

    return () => { done = true; clearTimeout(timer); };
  }, []);

  return status;
}

export default function WalletProvider({ children }) {
  // Always include the MWA adapter. Standard Solana wallets (Phantom,
  // Solflare, Backpack) auto-register themselves via the Wallet Standard
  // dispatch event so we don't list them statically. MWA doesn't follow
  // the wallet-standard discovery path on every device, so we pass it in
  // explicitly — harmless on non-Solana-Mobile devices because its
  // readyState stays NotDetected.
  const wallets = useMemo(() => [SEEKER_MWA_ADAPTER], []);
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
