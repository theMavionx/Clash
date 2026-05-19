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
  isUserDismissedWalletError,
} from '../lib/solanaWalletUi';
import { addClientBreadcrumb } from '../lib/clientLogger';
import {
  DEFAULT_SOLANA_RPC_URL,
  SOLANA_RPC_URLS,
  selectFreshSolanaRpcUrl,
  solanaRpcHost,
} from '../lib/solanaRpc';

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

function useBestRpc() {
  const [rpc, setRpc] = useState(DEFAULT_SOLANA_RPC_URL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await selectFreshSolanaRpcUrl(SOLANA_RPC_URLS);
      if (cancelled) return;

      for (const probe of result.probes) {
        if (probe.usable) continue;
        const type = probe.ok ? 'solana_rpc.rejected' : 'solana_rpc.probe_failed';
        addClientBreadcrumb(type, {
          host: probe.host || solanaRpcHost(probe.url),
          current_block_height: probe.currentBlockHeight ?? null,
          cluster_block_height: probe.clusterBlockHeight ?? null,
          lag_blocks: probe.lagBlocks ?? null,
          last_valid_block_height: probe.lastValidBlockHeight ?? null,
          remaining_blocks: probe.remainingBlocks ?? null,
          remaining_cluster_blocks: probe.remainingClusterBlocks ?? null,
          error: probe.error || null,
        }, 'warn');
      }

      if (result.selected?.url) {
        setRpc(result.selected.url);
        addClientBreadcrumb('solana_rpc.selected', {
          host: result.selected.host || solanaRpcHost(result.selected.url),
          current_block_height: result.selected.currentBlockHeight ?? null,
          cluster_block_height: result.selected.clusterBlockHeight ?? null,
          lag_blocks: result.selected.lagBlocks ?? null,
          remaining_cluster_blocks: result.selected.remainingClusterBlocks ?? null,
        });
      } else {
        addClientBreadcrumb('solana_rpc.no_fresh_endpoint', {
          hosts: result.probes.map(p => p.host || solanaRpcHost(p.url)).slice(0, 8),
        }, 'error');
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
