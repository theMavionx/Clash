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

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { createPublicClient, createWalletClient, http, custom } from 'viem';
import { base } from 'viem/chains';
import { useWallets as usePrivyEvmWallets, usePrivy } from '@privy-io/react-auth';
import { BASE_CHAIN_ID, ensureBaseChain } from '../lib/avantisContract';
import { useFarcaster, getFarcasterEthProvider } from '../hooks/useFarcaster';

const publicClient = createPublicClient({ chain: base, transport: http() });

const EvmWalletContext = createContext({
  address: null,
  walletClient: null,
  publicClient,
  provider: null,
  isReady: false,
  error: null,
  source: null,
  setExternalProvider: () => {},
  disconnect: () => {},
});

const LAST_WALLET_KEY = 'clash_last_evm_wallet_rdns';

export function EvmWalletProvider({ children }) {
  const [externalProvider, setExternalProvider] = useState(null); // set by EvmWalletModal
  const [externalAddress, setExternalAddress] = useState(null);
  // Tracks where externalProvider came from so auth/useAuthFlow can attribute
  // registration to the right wallet type: 'external' (MetaMask-like via
  // EIP-6963), 'farcaster' (sdk.wallet.getEthereumProvider), etc.
  const [externalSource, setExternalSource] = useState(null);
  const [error, setError] = useState(null);

  const { isInFrame, loading: fcLoading } = useFarcaster();

  // Farcaster auto-reconnect: inside a mini-app frame the EVM provider is
  // always available via sdk.wallet.getEthereumProvider(). On a page reload
  // where the Godot token is still valid, RegisterPanel (and therefore
  // useAuthFlow) never mounts — so nobody calls `setEvmProvider` with the
  // FC wallet. FuturesPanel then reads `walletAddr = undefined` from
  // useAvantis and paints "undefined…undefined". Do the FC provider pull
  // here so every in-frame session has a populated EvmWalletContext, even
  // without going through the auth flow.
  useEffect(() => {
    if (fcLoading) return;
    if (!isInFrame) return;
    if (externalProvider) return; // already have one (possibly set by auth flow)
    let cancelled = false;
    (async () => {
      const prov = await getFarcasterEthProvider();
      if (cancelled || !prov) return;
      try {
        // Use eth_accounts (silent) first — no popup on reload. If the FC
        // host hasn't pre-authorised this app we fall back to the explicit
        // request, which most Warpcast clients resolve silently anyway
        // because the app was granted EVM access on first login.
        let accounts = [];
        try {
          accounts = await prov.request({ method: 'eth_accounts' });
        } catch { /* some hosts only support eth_requestAccounts */ }
        if (!accounts || !accounts[0]) {
          accounts = await prov.request({ method: 'eth_requestAccounts' });
        }
        const addr = accounts && accounts[0];
        if (!cancelled && addr) {
          setExternalProvider(prov);
          setExternalAddress(addr);
          setExternalSource('farcaster');
        }
      } catch (e) {
        console.warn('[evm-ctx] FC auto-reconnect failed:', e?.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [isInFrame, fcLoading, externalProvider]);

  // Silent reconnect: on mount, if we remember the rdns of the last-connected
  // wallet, listen for its EIP-6963 announcement and check if the user is
  // still authorised (eth_accounts, NOT eth_requestAccounts — no popup). This
  // keeps external-wallet sessions alive across page reloads, so the user
  // doesn't see the "Connect Wallet" screen on every refresh when their
  // wallet extension has already granted permission.
  useEffect(() => {
    let storedRdns = null;
    try { storedRdns = localStorage.getItem(LAST_WALLET_KEY); } catch { /* storage disabled */ }
    if (!storedRdns) return;

    let cancelled = false;
    const tryReconnect = async (provider) => {
      if (cancelled || externalAddress) return;
      try {
        const accounts = await provider.request({ method: 'eth_accounts' });
        const addr = accounts && accounts[0];
        if (!cancelled && addr) {
          setExternalProvider(provider);
          setExternalAddress(addr);
          setExternalSource('external');
        }
      } catch { /* wallet rejected silent query */ }
    };

    const onAnnounce = (e) => {
      const d = e?.detail;
      if (!d?.provider || !d?.info) return;
      if ((d.info.rdns || d.info.name) === storedRdns) {
        tryReconnect(d.provider);
      }
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Legacy fallback: window.ethereum with matching name hint.
    const legacyTimer = setTimeout(() => {
      if (cancelled || externalAddress) return;
      const eth = typeof window !== 'undefined' ? window.ethereum : null;
      if (!eth) return;
      const legacy = Array.isArray(eth.providers) ? eth.providers : [eth];
      for (const p of legacy) {
        const name = p.isMetaMask ? 'legacy.metamask'
          : p.isCoinbaseWallet ? 'legacy.coinbasewallet'
          : p.isRabby ? 'legacy.rabby'
          : p.isPhantom ? 'legacy.phantom'
          : null;
        if (name && storedRdns.startsWith(name)) { tryReconnect(p); break; }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      clearTimeout(legacyTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Source is authoritative for downstream consumers (auth flow, analytics).
  // externalSource wins when both are present — matches provider/address logic.
  const source = externalAddress ? (externalSource || 'external') : (privyAddress ? 'privy' : null);
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
    setExternalSource(null);
    setError(null);
    try { localStorage.removeItem(LAST_WALLET_KEY); } catch { /* storage disabled */ }
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
        const next = accounts[0];
        // Case-insensitive compare; MM sometimes returns a different casing
        // across events and we don't want to storm re-renders.
        if (String(next).toLowerCase() !== String(externalAddress).toLowerCase()) {
          setExternalAddress(next);
        }
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

  // Visibility listener — when the tab/FC frame becomes visible again,
  // re-validate the active provider's current account. Backgrounded FC
  // frames can invalidate their injected provider; this catches the case
  // where the user returns to the tab and silently has a stale wallet.
  useEffect(() => {
    if (!provider || typeof provider.request !== 'function') return;
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!externalAddress) return;
      try {
        const accounts = await provider.request({ method: 'eth_accounts' });
        if (!accounts || !accounts.length) {
          if (externalAddress) disconnect();
          return;
        }
        const next = accounts[0];
        if (String(next).toLowerCase() !== String(externalAddress).toLowerCase()) {
          setExternalAddress(next);
        }
      } catch {
        // Provider torn down (FC frame backgrounded then resumed).
        if (externalAddress) disconnect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
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
    source,
    setExternalProvider: (prov, addr, rdns = null, src = 'external') => {
      setExternalProvider(prov);
      setExternalAddress(addr);
      setExternalSource(src);
      setError(null);
      // Remember the chosen wallet so the next page load can silently
      // reconnect via EIP-6963 (eth_accounts, no popup). Omit rdns for
      // Farcaster / non-persistent sources — we don't want to try to
      // reconnect them outside their original context.
      if (rdns) {
        try { localStorage.setItem(LAST_WALLET_KEY, rdns); } catch { /* storage disabled */ }
      }
    },
    disconnect,
  }), [address, walletClient, provider, isReady, error, source, ensureChain, disconnect]);

  return <EvmWalletContext.Provider value={value}>{children}</EvmWalletContext.Provider>;
}

export function useEvmWallet() {
  return useContext(EvmWalletContext);
}
