// Unified EVM wallet access for Avantis (non-custodial). Holds the active
// EIP-1193 provider + address from whichever source the user connected with:
//   • `window.ethereum` via our custom EvmWalletModal (MetaMask / Rabby / …)
//   • Privy embedded EVM wallet (email login → auto-created Base wallet)
//   • Farcaster frame's sdk.wallet.ethProvider (future)
//
// Components that need to sign txs call `useEvmWallet()` and receive
// `{ address, walletClient, publicClient, isReady, error }`. `walletClient`
// is a viem wallet client bound to the user's provider — callers can
// walletClient.writeContract(...) and a signing popup appears.

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPublicClient, createWalletClient, http, custom } from 'viem';
import { base } from 'viem/chains';
import { useWallets as usePrivyEvmWallets, usePrivy } from '@privy-io/react-auth';
import { BASE_CHAIN_ID, ensureBaseChain } from '../lib/avantisContract';

const publicClient = createPublicClient({ chain: base, transport: http() });

const EvmWalletContext = createContext({
  address: null,
  walletClient: null,
  publicClient,
  provider: null,
  isReady: false,
  error: null,
  setExternalProvider: () => {},
  disconnect: () => {},
});

export function EvmWalletProvider({ children }) {
  const [externalProvider, setExternalProvider] = useState(null); // set by EvmWalletModal
  const [externalAddress, setExternalAddress] = useState(null);
  const [error, setError] = useState(null);

  // Privy embedded wallet — auto-picked when user logs in via email.
  // `usePrivyEvmWallets()` returns ONLY Ethereum wallets (no chainType filter needed).
  const { authenticated } = usePrivy();
  const { wallets: privyWallets } = usePrivyEvmWallets();
  const privyWallet = authenticated
    ? (privyWallets || []).find(w => w?.walletClientType === 'privy')
      || (privyWallets || [])[0]
    : null;

  // Cache the Privy provider once resolved to avoid re-awaiting on every render.
  const [privyProvider, setPrivyProvider] = useState(null);
  const [privyAddress, setPrivyAddress] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!privyWallet) {
        setPrivyProvider(null);
        setPrivyAddress(null);
        return;
      }
      try {
        const p = await privyWallet.getEthereumProvider();
        if (cancelled) return;
        setPrivyProvider(p);
        setPrivyAddress(privyWallet.address);
      } catch (e) {
        if (!cancelled) setError(`Privy provider error: ${e.message}`);
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [privyWallet]);

  // External provider (MetaMask etc.) wins over Privy embedded when both
  // exist — user explicitly connected their own wallet, honour that.
  const provider = externalProvider || privyProvider;
  const address = externalAddress || privyAddress;
  const isReady = !!provider && !!address;

  // viem walletClient bound to the selected provider. Recreated whenever the
  // provider swaps. Caller uses walletClient.writeContract({...}).
  const walletClient = useMemo(() => {
    if (!provider || !address) return null;
    return createWalletClient({
      account: address,
      chain: base,
      transport: custom(provider),
    });
  }, [provider, address]);

  // Chain-switch helper — ensures the wallet is on Base before a write.
  // Idempotent; safe to call before every tx. Exposed via context.
  const ensureChain = useCallback(async () => {
    if (!provider) throw new Error('No EVM wallet connected');
    await ensureBaseChain(provider);
  }, [provider]);

  // Disconnect for the custom modal path. Privy disconnect is managed by
  // Privy itself (logout button in RegisterPanel).
  const disconnect = useCallback(() => {
    setExternalProvider(null);
    setExternalAddress(null);
    setError(null);
  }, []);

  // Listen for account / chain changes on the active provider so UI reacts
  // if the user flips accounts in MetaMask.
  useEffect(() => {
    if (!provider || typeof provider.on !== 'function') return;
    const onAccountsChanged = (accounts) => {
      if (!accounts || !accounts.length) {
        // User disconnected. Clear external only — Privy lifecycle separate.
        if (externalAddress) disconnect();
      } else if (externalAddress) {
        setExternalAddress(accounts[0]);
      }
    };
    const onChainChanged = () => {
      // Trigger re-render; walletClient memo re-creates automatically.
      setError(null);
    };
    provider.on('accountsChanged', onAccountsChanged);
    provider.on('chainChanged', onChainChanged);
    return () => {
      if (typeof provider.removeListener === 'function') {
        provider.removeListener('accountsChanged', onAccountsChanged);
        provider.removeListener('chainChanged', onChainChanged);
      }
    };
  }, [provider, externalAddress, disconnect]);

  const value = useMemo(() => ({
    address,
    walletClient,
    publicClient,
    provider,
    isReady,
    error,
    chainId: BASE_CHAIN_ID,
    ensureChain,
    setExternalProvider: (prov, addr) => {
      setExternalProvider(prov);
      setExternalAddress(addr);
      setError(null);
    },
    disconnect,
  }), [address, walletClient, provider, isReady, error, ensureChain, disconnect]);

  return <EvmWalletContext.Provider value={value}>{children}</EvmWalletContext.Provider>;
}

export function useEvmWallet() {
  return useContext(EvmWalletContext);
}
