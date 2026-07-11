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
import { createPublicClient, createWalletClient, http, custom, fallback, encodeFunctionData } from 'viem';
import { base, arbitrum, mainnet } from 'viem/chains';
import { BASE_CHAIN_ID, BASE_RPC_URLS, ensureBaseChain } from '../lib/avantisContract';
import { ARBITRUM_CHAIN_ID, ARBITRUM_RPC_URLS, ensureArbitrumChain } from '../lib/gmxConfig';
import { MONAD_CHAIN_ID, MONAD_RPC_URLS, ensureMonadChain, monadChain } from '../lib/monadConfig';
import { HYPEREVM_CHAIN_ID, HYPEREVM_RPC_URLS, ensureHyperEvmChain, hyperEvmChain } from '../lib/hyperevmConfig';
import { RISE_CHAIN_ID, RISE_RPC_URLS, ensureRiseChain, riseChain } from '../lib/risexConfig';
import { INK_CHAIN_ID, INK_RPC_URLS, ensureInkChain, inkChain } from '../lib/nadoConfig';
import { ARC_CHAIN_ID, ARC_RPC_URLS, ensureArcChain, arcChain } from '../lib/arcConfig';
import { GRVT_CHAIN_ID, GRVT_RPC_URLS, ensureGrvtChain, grvtChain } from '../lib/grvtConfig';
import { KATANA_CHAIN_ID, KATANA_RPC_URLS, ensureKatanaChain, katanaChain } from '../lib/katanaConfig';
import { ETHEREUM_RPC_URLS } from '../lib/ethereumConfig';
import { useFarcaster, getFarcasterEthProvider } from '../hooks/useFarcaster';
import { useOptionalPrivy } from '../components/PrivyAuthProvider';

// Default public client stays on Base (back-compat for Avantis call sites).
// Arbitrum-aware callers grab the chain-specific client via getPublicClient(chainId).
//
// Arbitrum publicClient uses viem's `fallback()` over the rotation of
// same-origin proxies (see ARBITRUM_RPC_URLS in lib/gmxConfig). When any
// upstream returns a network error or 429/404 (free-tier rate limit), viem
// auto-retries the next URL. With Alchemy env override the list collapses
// to a single URL so fallback overhead is negligible.
//
// `batch.multicall.batchSize` is CRITICAL on Arbitrum: viem's default is
// 1024 BYTES of calldata per multicall HTTP request, NOT 1024 calls. GMX
// SDK's getMarketsInfo packs ~300 reads (~60KB calldata) per Multicall3
// aggregate3 — at 1024B/batch that explodes into ~30 separate eth_call
// requests, then ×4 inner Promise.all branches (= getMarketsValues +
// getMarketsConfigs + getClaimableFundingData + getMarketsConstants) means
// a single getMarketsInfo() fires 100-500 HTTP requests in parallel,
// instantly overwhelming any single RPC endpoint and tripping per-call
// timeouts that surface as `Cannot mix BigInt and other types` (the SDK
// reducer hits `undefined / bigint` when a sub-call returns no data).
//
// Bumping to 30_000 bytes coalesces the same 60KB into ~2 chunks, taking
// the per-refresh request count from ~500 to ~10. We also keep `wait: 50`
// so any code path that uses `readContract` (instead of `multicall`
// directly) still gets auto-batched into multicall3 within the 50ms window.
const publicClient = createPublicClient({
  chain: base,
  transport: fallback(
    BASE_RPC_URLS.map(u => http(u, { retryCount: 0, timeout: 10_000 })),
    { rank: false, retryCount: 0 },
  ),
});
const ethereumPublicClient = createPublicClient({
  chain: mainnet,
  transport: fallback(
    ETHEREUM_RPC_URLS.map(u => http(u, { retryCount: 0, timeout: 10_000 })),
    { rank: false, retryCount: 0 },
  ),
});
const arbitrumPublicClient = createPublicClient({
  chain: arbitrum,
  // Per-call HTTP timeout = 15s. Default is 10s (fine for Alchemy paid),
  // but the public-RPC fallbacks occasionally take 8-12s to respond under
  // multicall load; 15s leaves headroom without letting a hung request
  // cascade. retryCount: 1 means viem auto-retries the same URL once on
  // 429/network error before falling over to the next URL in fallback().
  transport: fallback(
    ARBITRUM_RPC_URLS.map(u => http(u, { retryCount: 1, retryDelay: 250, timeout: 15_000 })),
    { rank: false, retryCount: 0 },
  ),
  batch: { multicall: { wait: 50, batchSize: 30_000 } },
});
// Perpl runs on Monad mainnet (chain id 143). Public RPC fallback list
// mirrors the Arbitrum setup so a transient blip on rpc.monad.xyz doesn't
// kill reads. Monad doesn't have a Multicall3 deployment we trust yet, so
// we skip the multicall batch hint — getStorageAt / single eth_call paths
// the hook uses are the only reads here in Phase 2.
const monadPublicClient = createPublicClient({
  chain: monadChain,
  transport: fallback(
    MONAD_RPC_URLS.map(u => http(u, { retryCount: 1, retryDelay: 250, timeout: 15_000 })),
    { rank: false, retryCount: 0 },
  ),
});
const hyperEvmPublicClient = createPublicClient({
  chain: hyperEvmChain,
  transport: fallback(
    HYPEREVM_RPC_URLS.map(u => http(u, { retryCount: 1, retryDelay: 250, timeout: 15_000 })),
    { rank: false, retryCount: 0 },
  ),
});
const risePublicClient = createPublicClient({
  chain: riseChain,
  transport: fallback(
    RISE_RPC_URLS.map(u => http(u, { retryCount: 1, retryDelay: 250, timeout: 15_000 })),
    { rank: false, retryCount: 0 },
  ),
});
const inkPublicClient = createPublicClient({
  chain: inkChain,
  transport: fallback(
    INK_RPC_URLS.map(u => http(u, { retryCount: 1, retryDelay: 250, timeout: 15_000 })),
    { rank: false, retryCount: 0 },
  ),
});
const arcPublicClient = createPublicClient({
  chain: arcChain,
  transport: fallback(
    ARC_RPC_URLS.map(u => http(u, { retryCount: 1, retryDelay: 250, timeout: 15_000 })),
    { rank: false, retryCount: 0 },
  ),
});
const grvtPublicClient = createPublicClient({
  chain: grvtChain,
  transport: fallback(
    GRVT_RPC_URLS.map(u => http(u, { retryCount: 1, retryDelay: 250, timeout: 15_000 })),
    { rank: false, retryCount: 0 },
  ),
});
const katanaPublicClient = createPublicClient({
  chain: katanaChain,
  transport: fallback(
    KATANA_RPC_URLS.map(u => http(u, { retryCount: 1, retryDelay: 250, timeout: 15_000 })),
    { rank: false, retryCount: 0 },
  ),
});

// chainId → viem chain object map. Centralized so adding the next EVM DEX is
// a single-line edit instead of a hunt through the codebase.
const CHAIN_BY_ID = {
  [mainnet.id]: mainnet,
  [BASE_CHAIN_ID]: base,
  [ARBITRUM_CHAIN_ID]: arbitrum,
  [MONAD_CHAIN_ID]: monadChain,
  [HYPEREVM_CHAIN_ID]: hyperEvmChain,
  [RISE_CHAIN_ID]: riseChain,
  [INK_CHAIN_ID]: inkChain,
  [ARC_CHAIN_ID]: arcChain,
  [GRVT_CHAIN_ID]: grvtChain,
  [KATANA_CHAIN_ID]: katanaChain,
};

const PUBLIC_CLIENT_BY_ID = {
  [mainnet.id]: ethereumPublicClient,
  [BASE_CHAIN_ID]: publicClient,
  [ARBITRUM_CHAIN_ID]: arbitrumPublicClient,
  [MONAD_CHAIN_ID]: monadPublicClient,
  [HYPEREVM_CHAIN_ID]: hyperEvmPublicClient,
  [RISE_CHAIN_ID]: risePublicClient,
  [INK_CHAIN_ID]: inkPublicClient,
  [ARC_CHAIN_ID]: arcPublicClient,
  [GRVT_CHAIN_ID]: grvtPublicClient,
  [KATANA_CHAIN_ID]: katanaPublicClient,
};

const CHAIN_LABEL_BY_ID = {
  [mainnet.id]: 'Ethereum',
  [BASE_CHAIN_ID]: 'Base',
  [ARBITRUM_CHAIN_ID]: 'Arbitrum',
  [MONAD_CHAIN_ID]: 'Monad',
  [HYPEREVM_CHAIN_ID]: 'HyperEVM',
  [RISE_CHAIN_ID]: 'RISE',
  [INK_CHAIN_ID]: 'Ink',
  [ARC_CHAIN_ID]: 'Arc',
  [GRVT_CHAIN_ID]: 'GRVT Exchange',
  [KATANA_CHAIN_ID]: 'Katana',
};

function normalizeProviderChainId(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  const text = String(value).trim();
  if (!text) return null;
  if (/^0x/i.test(text)) return Number.parseInt(text, 16);
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

async function readProviderChainId(provider) {
  if (!provider?.request) return null;
  return normalizeProviderChainId(await provider.request({ method: 'eth_chainId' }));
}

async function waitForProviderChainId(provider, targetId) {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  let currentId = null;
  for (let i = 0; i < 5; i += 1) {
    currentId = await readProviderChainId(provider).catch(() => null);
    if (currentId === targetId) return currentId;
    if (i < 4) await delay(120);
  }
  return currentId;
}

function chainLabel(chainId) {
  return CHAIN_LABEL_BY_ID[Number(chainId)] || `chain ${chainId || 'unknown'}`;
}

const EvmWalletContext = createContext({
  address: null,
  walletClient: null,
  publicClient,
  provider: null,
  chainId: null,
  isReady: false,
  error: null,
  source: null,
  sendTransaction: null,
  setExternalProvider: () => {},
  reconnectStoredProvider: async () => false,
  switchChain: async () => {},
  disconnect: () => {},
});

const LAST_WALLET_KEY = 'clash_last_evm_wallet_rdns';
const MANUAL_DISCONNECT_KEY = 'clash_evm_manual_disconnect';

export function EvmWalletProvider({ children }) {
  const [externalProvider, setExternalProvider] = useState(null); // set by EvmWalletModal
  const [externalAddress, setExternalAddress] = useState(null);
  // Tracks where externalProvider came from so auth/useAuthFlow can attribute
  // registration to the right wallet type: 'external' (MetaMask-like via
  // EIP-6963), 'farcaster' (sdk.wallet.getEthereumProvider), etc.
  const [externalSource, setExternalSource] = useState(null);
  const [error, setError] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [manualDisconnectBlocked, setManualDisconnectBlocked] = useState(() => {
    try { return localStorage.getItem(MANUAL_DISCONNECT_KEY) === '1'; } catch { return false; }
  });

  const { isInFrame, loading: fcLoading } = useFarcaster();

  const setPersistedExternalProvider = useCallback((prov, addr, rdns = null, src = 'external') => {
    setManualDisconnectBlocked(false);
    try { localStorage.removeItem(MANUAL_DISCONNECT_KEY); } catch { /* storage disabled */ }
    setExternalProvider(prov);
    setExternalAddress(addr);
    setExternalSource(src);
    setError(null);
    if (rdns) {
      try { localStorage.setItem(LAST_WALLET_KEY, rdns); } catch { /* storage disabled */ }
    }
  }, []);

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
    if (manualDisconnectBlocked) return;
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
  }, [isInFrame, fcLoading, manualDisconnectBlocked, externalProvider]);

  // Silent reconnect: on mount, if we remember the rdns of the last-connected
  // wallet, listen for its EIP-6963 announcement and check if the user is
  // still authorised (eth_accounts, NOT eth_requestAccounts — no popup). This
  // keeps external-wallet sessions alive across page reloads, so the user
  // doesn't see the "Connect Wallet" screen on every refresh when their
  // wallet extension has already granted permission.
  useEffect(() => {
    if (manualDisconnectBlocked) return;
    let storedRdns = null;
    try { storedRdns = localStorage.getItem(LAST_WALLET_KEY); } catch { /* storage disabled */ }
    if (!storedRdns) return;

    let cancelled = false;
    const tryReconnect = async (provider) => {
      if (cancelled || manualDisconnectBlocked || externalAddress) return;
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
      if (cancelled || manualDisconnectBlocked || externalAddress) return;
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
  }, [manualDisconnectBlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual/retry entrypoint used by the session repair UI. Some EVM wallets
  // announce late on cold page loads, so this asks EIP-6963 again and falls
  // back to legacy window.ethereum without opening a popup.
  const reconnectStoredProvider = useCallback(async () => {
    if (manualDisconnectBlocked) return false;
    let storedRdns = null;
    try { storedRdns = localStorage.getItem(LAST_WALLET_KEY); } catch { /* storage disabled */ }
    if (!storedRdns || externalAddress) return false;

    const announced = [];
    const onAnnounce = (e) => {
      const d = e?.detail;
      if (!d?.provider || !d?.info) return;
      if ((d.info.rdns || d.info.name) === storedRdns) announced.push(d.provider);
    };

    const tryProvider = async (provider) => {
      if (!provider || manualDisconnectBlocked || externalAddress) return false;
      try {
        const accounts = await provider.request({ method: 'eth_accounts' });
        const addr = accounts && accounts[0];
        if (!addr) return false;
        setPersistedExternalProvider(provider, addr, storedRdns, 'external');
        return true;
      } catch {
        return false;
      }
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    await new Promise(resolve => setTimeout(resolve, 350));
    window.removeEventListener('eip6963:announceProvider', onAnnounce);

    for (const provider of announced) {
      // eslint-disable-next-line no-await-in-loop
      if (await tryProvider(provider)) return true;
    }

    const eth = typeof window !== 'undefined' ? window.ethereum : null;
    if (!eth) return false;
    const legacy = Array.isArray(eth.providers) ? eth.providers : [eth];
    for (const p of legacy) {
      const name = p.isMetaMask ? 'legacy.metamask'
        : p.isCoinbaseWallet ? 'legacy.coinbasewallet'
        : p.isRabby ? 'legacy.rabby'
        : p.isPhantom ? 'legacy.phantom'
        : p.isTrust ? 'legacy.trust'
        : p.isOkxWallet ? 'legacy.okxwallet'
        : null;
      if (!name || !storedRdns.startsWith(name)) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await tryProvider(p)) return true;
    }
    return false;
  }, [externalAddress, manualDisconnectBlocked, setPersistedExternalProvider]);

  useEffect(() => {
    if (manualDisconnectBlocked) return undefined;
    let stopped = false;
    const timers = [];
    const run = async () => {
      if (stopped || externalAddress) return;
      const ok = await reconnectStoredProvider();
      if (ok) stopped = true;
    };
    for (const delay of [700, 1600, 3200, 6000]) {
      timers.push(setTimeout(run, delay));
    }
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
  }, [externalAddress, manualDisconnectBlocked, reconnectStoredProvider]);

  // Privy embedded wallet is auto-picked when the user logs in via email.
  const { authenticated, evmWallets: privyWallets, evmSendTransaction } = useOptionalPrivy();
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

  useEffect(() => {
    if (!provider?.request) {
      setChainId(null);
      return undefined;
    }
    let cancelled = false;
    const syncChain = async () => {
      try {
        const next = await readProviderChainId(provider);
        if (!cancelled) setChainId(next);
      } catch {
        if (!cancelled) setChainId(null);
      }
    };
    const onChainChanged = (value) => {
      setChainId(normalizeProviderChainId(value));
      setError(null);
    };
    syncChain();
    if (typeof provider.on === 'function') provider.on('chainChanged', onChainChanged);
    return () => {
      cancelled = true;
      if (typeof provider.removeListener === 'function') {
        provider.removeListener('chainChanged', onChainChanged);
      }
    };
  }, [provider]);

  // Chain-switch helper — defaults to Base for back-compat with existing
  // Avantis call sites. New callers should pass the chainId they need.
  const ensureChain = useCallback(async (targetChainId = BASE_CHAIN_ID) => {
    if (!provider) throw new Error('No EVM wallet connected');
    const id = Number(targetChainId);
    if (id === mainnet.id) {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }],
      });
    } else if (id === ARBITRUM_CHAIN_ID) {
      await ensureArbitrumChain(provider);
    } else if (id === MONAD_CHAIN_ID) {
      await ensureMonadChain(provider);
    } else if (id === HYPEREVM_CHAIN_ID) {
      await ensureHyperEvmChain(provider);
    } else if (id === RISE_CHAIN_ID) {
      await ensureRiseChain(provider);
    } else if (id === INK_CHAIN_ID) {
      await ensureInkChain(provider);
    } else if (id === ARC_CHAIN_ID) {
      await ensureArcChain(provider);
    } else if (id === GRVT_CHAIN_ID) {
      await ensureGrvtChain(provider);
    } else if (id === KATANA_CHAIN_ID) {
      await ensureKatanaChain(provider);
    } else {
      await ensureBaseChain(provider);
    }

    let currentId = await waitForProviderChainId(provider, id);
    if (currentId !== id && provider?.request) {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${id.toString(16)}` }],
        });
        currentId = await waitForProviderChainId(provider, id);
      } catch {
        currentId = await waitForProviderChainId(provider, id);
      }
    }

    if (currentId !== id) {
      const err = new Error(
        `Wallet is still on ${chainLabel(currentId)}. Switch to ${chainLabel(id)} and retry.`,
      );
      err.code = 'WRONG_EVM_CHAIN';
      err.currentChainId = currentId;
      err.targetChainId = id;
      throw err;
    }
    setChainId(currentId);
  }, [provider]);

  const getPublicClient = useCallback((targetChainId = BASE_CHAIN_ID) => {
    return PUBLIC_CLIENT_BY_ID[Number(targetChainId)] || publicClient;
  }, []);

  const sendTransaction = useCallback(async (tx, options = {}) => {
    if (source !== 'privy' || !privyAddress || typeof evmSendTransaction !== 'function') {
      throw new Error('Privy embedded wallet transaction sender is not available');
    }
    const targetChainId = Number(
      tx?.chainId
      || tx?.chain?.id
      || options?.chainId
      || BASE_CHAIN_ID,
    );
    await ensureChain(targetChainId);
    const { account: _account, chain: _chain, chainId: _chainId, ...txForPrivy } = tx || {};
    return evmSendTransaction({
      ...txForPrivy,
      chainId: targetChainId,
    }, {
      address: privyAddress,
      ...options,
    });
  }, [source, privyAddress, evmSendTransaction, ensureChain]);

  const createPrivyWalletClient = useCallback((targetChainId = BASE_CHAIN_ID) => {
    if (!provider || !address || source !== 'privy') return null;
    const chain = CHAIN_BY_ID[Number(targetChainId)] || base;
    const baseClient = createWalletClient({
      account: address,
      chain,
      transport: custom(provider),
    });
    const resolveHash = (result) => result?.hash || result?.txHash || result;
    return {
      ...baseClient,
      account: address,
      chain,
      sendTransaction: async (request = {}) => {
        const result = await sendTransaction({
          ...request,
          chainId: Number(chain.id),
        }, {
          uiOptions: { showWalletUIs: false },
        });
        return resolveHash(result);
      },
      writeContract: async (request = {}) => {
        const contractAddress = request.address;
        if (!contractAddress) throw new Error('Contract address is required');
        const data = encodeFunctionData({
          abi: request.abi,
          functionName: request.functionName,
          args: request.args || [],
        });
        const result = await sendTransaction({
          to: contractAddress,
          data,
          value: request.value,
          gas: request.gas,
          chainId: Number(chain.id),
        }, {
          uiOptions: { showWalletUIs: false },
        });
        return resolveHash(result);
      },
    };
  }, [address, provider, sendTransaction, source]);

  // viem walletClient bound to the selected provider. For Privy embedded
  // wallets, writes are routed through Privy's sender instead of raw
  // provider eth_sendTransaction, which can hang for email-created wallets.
  const walletClient = useMemo(() => {
    if (!provider || !address) return null;
    if (source === 'privy') return createPrivyWalletClient(BASE_CHAIN_ID);
    return createWalletClient({
      account: address,
      chain: base,
      transport: custom(provider),
    });
  }, [provider, address, source, createPrivyWalletClient]);

  // Build a viem walletClient bound to a specific chain. For Privy, the
  // returned client preserves the viem surface but routes writes through Privy.
  const getWalletClient = useCallback((targetChainId = BASE_CHAIN_ID) => {
    if (!provider || !address) return null;
    const chain = CHAIN_BY_ID[Number(targetChainId)] || base;
    if (source === 'privy') return createPrivyWalletClient(chain.id);
    return createWalletClient({
      account: address,
      chain,
      transport: custom(provider),
    });
  }, [provider, address, source, createPrivyWalletClient]);

  // Disconnect for the custom modal path. Privy disconnect is managed by
  // Privy itself (logout button in RegisterPanel).
  const disconnect = useCallback(() => {
    setManualDisconnectBlocked(true);
    setExternalProvider(null);
    setExternalAddress(null);
    setExternalSource(null);
    setError(null);
    try {
      localStorage.removeItem(LAST_WALLET_KEY);
      localStorage.setItem(MANUAL_DISCONNECT_KEY, '1');
    } catch { /* storage disabled */ }
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
    provider.on('accountsChanged', onAccountsChanged);
    return () => {
      if (typeof provider.removeListener === 'function') {
        provider.removeListener('accountsChanged', onAccountsChanged);
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
    chainId,
    ensureChain,
    switchChain: ensureChain,
    // Chain-specific factories — GMX (Arbitrum) and any future EVM DEX
    // grab their own chain-bound clients without disturbing Avantis.
    getWalletClient,
    getPublicClient,
    source,
    sendTransaction: source === 'privy' ? sendTransaction : null,
    setExternalProvider: setPersistedExternalProvider,
    reconnectStoredProvider,
    disconnect,
  }), [address, walletClient, provider, isReady, error, chainId, source, ensureChain, getWalletClient, getPublicClient, sendTransaction, setPersistedExternalProvider, reconnectStoredProvider, disconnect]);

  return <EvmWalletContext.Provider value={value}>{children}</EvmWalletContext.Provider>;
}

export function useEvmWallet() {
  return useContext(EvmWalletContext);
}
