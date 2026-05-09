import { useCallback, useMemo, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider as SolWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  SolanaMobileWalletAdapter,
  createDefaultAuthorizationResultCache,
  createDefaultAddressSelector,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';
import { farcasterDetectPromise } from '../hooks/useFarcaster';
import { useSolanaMobile } from '../hooks/useSolanaMobile';

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
];

const USER_DISMISSED_WALLET_RE = /not authorized|authorized by the user|user rejected|user denied|declined|cancel/i;

function adapterName(adapter) {
  return adapter?.name || adapter?.adapter?.name || adapter?._wallet?.name || 'Solana wallet';
}

function forgetSelectedWallet(localStorageKey, adapter) {
  try {
    const selected = localStorage.getItem(localStorageKey);
    const name = adapterName(adapter);
    if (!selected || selected === name || selected.includes(name) || name.includes(selected)) {
      localStorage.removeItem(localStorageKey);
    }
  } catch { /* private mode / quota etc — non-fatal */ }
}

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
  // Solana Mobile (Saga/Seeker) detection — reads sync after first detect.
  // MWA must ONLY be registered on real Solana Mobile devices. On a regular
  // Android phone the adapter loads (state=Loadable) and deeplinks to a
  // wallet app that doesn't exist, so the picker shows MWA -> click ->
  // "We can't find a wallet" dialog. Hiding MWA on non-SM devices makes
  // the picker fall through to wallet-standard wallets (Phantom, Backpack)
  // that auto-register themselves.
  const { isSolanaMobile, ready: smReady } = useSolanaMobile();

  const wallets = useMemo(() => (
    isSolanaMobile ? [SEEKER_MWA_ADAPTER] : []
  ), [isSolanaMobile]);

  // Self-heal stale localStorage. If a non-Solana-Mobile user EVER picked
  // MWA in a buggy build, autoConnect={true} would try to revive that
  // selection on every page load — same wallet-not-found dialog forever
  // until the user clears site data. Wipe the selection key so the next
  // session starts clean.
  useEffect(() => {
    if (!smReady || isSolanaMobile) return;
    try {
      for (const key of ['walletName', 'fcWalletName']) {
        const v = localStorage.getItem(key);
        if (v && /Mobile Wallet Adapter/i.test(v)) {
          localStorage.removeItem(key);
        }
      }
    } catch { /* private mode / quota etc — non-fatal */ }
  }, [smReady, isSolanaMobile]);

  const rpc = useBestRpc();
  const { ready: fcReady, inFrame } = useFarcasterWalletReady();
  const localStorageKey = inFrame ? 'fcWalletName' : 'walletName';

  const handleWalletError = useCallback((error, adapter) => {
    const name = error?.name || '';
    const message = error?.message || String(error || '');
    const userDismissedConnect = name === 'WalletConnectionError' && USER_DISMISSED_WALLET_RE.test(message);
    if (userDismissedConnect) {
      forgetSelectedWallet(localStorageKey, adapter);
      return;
    }
    console.error('[solana-wallet] adapter error:', error, adapter);
  }, [localStorageKey]);

  // Wait for BOTH detections so we don't briefly mount the provider with
  // the wrong wallet list and trigger a bogus autoConnect.
  if (!fcReady || !smReady) return null;

  return (
    <ConnectionProvider endpoint={rpc}>
      <SolWalletProvider
        wallets={wallets}
        autoConnect={true}
        localStorageKey={localStorageKey}
        onError={handleWalletError}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolWalletProvider>
    </ConnectionProvider>
  );
}
