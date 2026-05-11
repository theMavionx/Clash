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
import {
  forgetSelectedWallet,
  isPhantomInAppBrowser,
  isUserDismissedWalletError,
} from '../lib/solanaWalletUi';
import { addClientBreadcrumb } from '../lib/clientLogger';
import { DEFAULT_SOLANA_RPC_URL, SOLANA_RPC_URLS } from '../lib/solanaRpc';

import '@solana/wallet-adapter-react-ui/styles.css';

function rpcHost(url) {
  try { return new URL(url, window.location.origin).host; } catch { return String(url || 'unknown'); }
}

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

function useBestRpc() {
  const [rpc, setRpc] = useState(DEFAULT_SOLANA_RPC_URL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const url of SOLANA_RPC_URLS) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([
              { jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] },
              { jsonrpc: '2.0', id: 2, method: 'getBlockHeight', params: [{ commitment: 'confirmed' }] },
            ]),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const data = await res.json().catch(() => null);
          const rows = Array.isArray(data) ? data : [];
          const latest = rows.find(row => row?.id === 1)?.result?.value;
          const currentHeight = Number(rows.find(row => row?.id === 2)?.result);
          const lastValidBlockHeight = Number(latest?.lastValidBlockHeight);
          const usable = !!latest?.blockhash
            && Number.isFinite(currentHeight)
            && Number.isFinite(lastValidBlockHeight)
            && lastValidBlockHeight - currentHeight > 20;
          if (res.ok && usable && !cancelled) {
            setRpc(url);
            return;
          }
          addClientBreadcrumb('solana_rpc.rejected', {
            host: rpcHost(url),
            current_block_height: Number.isFinite(currentHeight) ? currentHeight : null,
            last_valid_block_height: Number.isFinite(lastValidBlockHeight) ? lastValidBlockHeight : null,
            remaining_blocks: Number.isFinite(currentHeight) && Number.isFinite(lastValidBlockHeight)
              ? lastValidBlockHeight - currentHeight
              : null,
          }, 'warn');
        } catch {
          addClientBreadcrumb('solana_rpc.probe_failed', { host: rpcHost(url) }, 'warn');
        }
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
  const solanaAutoConnect = !isPhantomInAppBrowser();

  const handleWalletError = useCallback((error, adapter) => {
    if (isUserDismissedWalletError(error)) {
      addClientBreadcrumb('wallet.connect_dismissed', {
        source: 'solana_adapter',
        adapter: adapter?.name || adapter?.adapter?.name || null,
      }, 'warn');
      forgetSelectedWallet(localStorageKey, adapter);
      return;
    }
    addClientBreadcrumb('wallet.connect_fail', {
      source: 'solana_adapter',
      adapter: adapter?.name || adapter?.adapter?.name || null,
      message: error?.message || String(error || ''),
    }, 'error');
    console.error('[solana-wallet] adapter error:', error, adapter);
  }, [localStorageKey]);

  // Wait for BOTH detections so we don't briefly mount the provider with
  // the wrong wallet list and trigger a bogus autoConnect.
  if (!fcReady || !smReady) return null;

  return (
    <ConnectionProvider endpoint={rpc}>
      <SolWalletProvider
        wallets={wallets}
        autoConnect={solanaAutoConnect}
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
