import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { base } from 'viem/chains';
import EvmWalletModal from './EvmWalletModal';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useFarcaster } from '../hooks/useFarcaster';
import { usePlayer } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { BASE_CHAIN_ID, ensureBaseChain } from '../lib/avantisContract';
import { fetchGameShopConfig, buyGameShopItem, buySolanaShopItem, buyEvmShopItem, buyAptosShopItem } from '../lib/gameShop';
import { flyResourcesToBars } from '../lib/resourceFlyFx';
import { fetchNftMintConfig, mintBaseNft, mintSolanaNft, mintEvmNft, mintAptosNft } from '../lib/nftMint';
import { openSolanaWallet } from '../lib/solanaWalletUi';
import { addClientBreadcrumb } from '../lib/clientLogger';
import NftBridgePanel from './NftBridgePanel';
import NftMarketplacePanel from './NftMarketplacePanel';

const demonKingImg = '/cdn/nft/1/default.jpg';
const copLogoImg = '/icons/icon-192.png';
const nftBasePublicClient = createPublicClient({ chain: base, transport: http() });

const SHOP_TABS = [
  { id: 'resources',   label: 'Game Resources', mobileLabel: 'Resources' },
  { id: 'nft',         label: 'NFT',            mobileLabel: 'NFT' },
  { id: 'marketplace', label: 'Marketplace',    mobileLabel: 'Market' },
];

const CHAIN_OPTIONS = [
  { id: 'base', title: 'Base', subtitle: 'ETH / USDC / CoP', badge: 'EVM' },
  { id: 'solana', title: 'Solana', subtitle: 'SOL / USDC', badge: 'SOL' },
];

const PAYMENT_OPTIONS = {
  base: [
    { id: 'base-clash', chain: 'base', method: 'CoP', price: '$5.00', token: 'CoP', requiresClash: true },
    { id: 'base-eth', chain: 'base', method: 'ETH', price: '$8.90', token: 'ETH' },
    { id: 'base-usdc', chain: 'base', method: 'USDC', price: '$8.90', token: 'USDC' },
  ],
  solana: [
    { id: 'sol-usdc', chain: 'solana', method: 'USDC', price: '$8.90', token: 'USDC' },
    { id: 'sol-sol', chain: 'solana', method: 'SOL', price: '$8.90', token: 'SOL' },
  ],
  // Arbitrum + Monad shops are deployed and saleActive — direct mint with
  // USDC or the chain's native token works via the server's /nft/evm/quote
  // endpoint. Aptos mirrors that shape with USDC/APT quotes signed by the
  // server and submitted through the Aptos wallet adapter.
  arbitrum: [
    { id: 'arb-usdc', chain: 'arbitrum', method: 'USDC', price: '$8.90', token: 'USDC' },
    { id: 'arb-eth',  chain: 'arbitrum', method: 'ETH',  price: '$8.90', token: 'ETH' },
  ],
  monad: [
    { id: 'monad-usdc', chain: 'monad', method: 'USDC', price: '$8.90', token: 'USDC' },
    { id: 'monad-mon',  chain: 'monad', method: 'MON',  price: '$8.90', token: 'MON' },
  ],
  aptos: [
    { id: 'aptos-usdc', chain: 'aptos', method: 'USDC', price: '$8.90', token: 'USDC' },
    { id: 'aptos-apt',  chain: 'aptos', method: 'APT',  price: '$8.90', token: 'APT' },
  ],
};

// Derive the CoP discount from the payment options so the banner
// updates automatically if pricing ever changes. We compare CoP on
// Base against the cheapest non-CoP option across both chains.
function priceToNumber(price) {
  const n = parseFloat(String(price || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
const COP_DISCOUNT = (() => {
  const clash = PAYMENT_OPTIONS.base.find((o) => o.requiresClash);
  const regulars = [
    ...PAYMENT_OPTIONS.base.filter((o) => !o.requiresClash),
    ...PAYMENT_OPTIONS.solana.filter((o) => !o.requiresClash),
  ];
  const clashUsd = priceToNumber(clash?.price);
  const baselineUsd = regulars
    .map((o) => priceToNumber(o.price))
    .filter((n) => n != null)
    .reduce((min, n) => (min == null ? n : Math.min(min, n)), null);
  if (!clashUsd || !baselineUsd || clashUsd >= baselineUsd) return null;
  const savedUsd = baselineUsd - clashUsd;
  const percent = Math.round((1 - clashUsd / baselineUsd) * 100);
  return { clashUsd, baselineUsd, savedUsd, percent };
})();

const DEX_LABELS = {
  decibel: 'Decibel / Aptos',
  gmx: 'GMX / Arbitrum',
  avantis: 'Avantis / Base',
  pacifica: 'Pacifica / Solana',
  phoenix: 'Phoenix / Solana',
  monad: 'Perpl / Monad',
};

function shortAddress(address) {
  if (!address) return '';
  const value = String(address);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function chainIdFromHex(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const raw = String(value);
  return raw.startsWith('0x') ? Number.parseInt(raw, 16) : Number(raw);
}

function makeNftEvmWallet(provider, address) {
  if (!provider || !address) return null;
  return {
    address,
    provider,
    source: 'nft',
    isReady: true,
    ensureChain: async () => ensureBaseChain(provider),
    getPublicClient: () => nftBasePublicClient,
    getWalletClient: () => createWalletClient({
      account: address,
      chain: base,
      transport: custom(provider),
    }),
  };
}

// Map the player's DEX to their actual playing chain — the NFT shop
// reflects this so an Arbitrum trader sees "Arbitrum" not "Base".
// Chains where mint endpoints aren't deployed (arb/monad/aptos) render
// a "bridge from Base to mint here" path inside the payment view.
const DEX_TO_NFT_CHAIN = {
  avantis:  'base',
  pacifica: 'solana',
  phoenix:  'solana',
  gmx:      'arbitrum',
  monad:    'monad',
  decibel:  'aptos',
};
// All five chains now have a direct NFT mint endpoint:
//   - base    /nft/base/quote   (CoP / ETH / USDC)
//   - solana  candy machine     (USDC / SOL)
//   - arbitrum/monad /nft/evm/quote   (USDC / native)
//   - aptos   /nft/aptos/quote  (USDC/APT, ed25519-signed)
const NFT_MINT_SUPPORTED = new Set(['base', 'solana', 'arbitrum', 'monad', 'aptos']);

function recommendedChain(dex) {
  return DEX_TO_NFT_CHAIN[dex] || 'base';
}

function defaultPaymentForChain(chain) {
  switch (chain) {
    case 'solana':   return 'sol-usdc';
    case 'arbitrum': return 'arb-usdc';
    case 'monad':    return 'monad-usdc';
    case 'aptos':    return 'aptos-usdc';
    case 'base':
    default:         return 'base-eth';
  }
}

function countOrNull(value) {
  if (value == null || value === '') return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
}

function formatCount(value) {
  const count = countOrNull(value);
  return count == null ? '-' : count.toLocaleString('en-US');
}

function getSupplyInfo(config, chain) {
  const chainConfig = config?.[chain] || {};
  const supply = chainConfig.supply || {};
  const maxSupply = countOrNull(supply.maxSupply ?? chainConfig.maxSupply) || 250;
  const mintedFromRpc = countOrNull(supply.totalMinted);
  const remainingFromRpc = countOrNull(supply.remaining);
  const totalMinted = mintedFromRpc ?? (
    remainingFromRpc == null ? null : Math.max(0, maxSupply - remainingFromRpc)
  );
  const remaining = remainingFromRpc ?? (
    totalMinted == null ? null : Math.max(0, maxSupply - totalMinted)
  );
  const progress = totalMinted == null || maxSupply <= 0
    ? 0
    : Math.min(100, Math.max(0, (totalMinted / maxSupply) * 100));
  return {
    chain,
    title: chain === 'solana' ? 'Solana Genesis' : 'Base Genesis',
    totalMinted,
    maxSupply,
    remaining,
    progress,
    loaded: totalMinted != null || remaining != null,
  };
}

// Total Genesis supply across ALL chains (Base + Solana + Arbitrum + Monad
// + Aptos). The server returns `config.global` with the authoritative
// totals counted from each chain's contract; we prefer that over a local
// base+solana sum so the counter stays accurate when users mint or bridge
// onto Arb/Monad/Aptos. Falls back to base+solana sum if the server didn't
// populate global (older server build / RPC degraded).
function getTotalSupplyInfo(globalSupply, baseSupply, solanaSupply) {
  // Server-side global: authoritative — sums minted across all 5 chains.
  if (globalSupply && Number.isFinite(globalSupply.cap)) {
    const maxSupply = Number(globalSupply.cap) || 500;
    const totalMinted = countOrNull(globalSupply.totalMinted);
    const remaining = countOrNull(globalSupply.remaining)
      ?? (totalMinted == null ? null : Math.max(0, maxSupply - totalMinted));
    const progress = totalMinted == null || maxSupply <= 0 ? 0
      : Math.min(100, Math.max(0, (totalMinted / maxSupply) * 100));
    return {
      title: 'Total Genesis',
      totalMinted, maxSupply, remaining, progress,
      loaded: totalMinted != null,
      perChain: globalSupply.perChain || null,
    };
  }
  // Legacy fallback — base + solana only.
  const maxSupply = (countOrNull(baseSupply?.maxSupply) || 0) + (countOrNull(solanaSupply?.maxSupply) || 0);
  const baseMinted = countOrNull(baseSupply?.totalMinted);
  const solanaMinted = countOrNull(solanaSupply?.totalMinted);
  const baseRemaining = countOrNull(baseSupply?.remaining);
  const solanaRemaining = countOrNull(solanaSupply?.remaining);
  const totalMinted = baseMinted == null && solanaMinted == null ? null : (baseMinted || 0) + (solanaMinted || 0);
  const remaining = baseRemaining == null && solanaRemaining == null ? null : (baseRemaining || 0) + (solanaRemaining || 0);
  const progress = totalMinted == null || maxSupply <= 0 ? 0 : Math.min(100, Math.max(0, (totalMinted / maxSupply) * 100));
  return {
    title: 'Total Genesis',
    totalMinted,
    maxSupply: maxSupply || 500,
    remaining,
    progress,
    loaded: baseSupply?.loaded || solanaSupply?.loaded,
  };
}

// Map the player's chosen DEX (set at register time, drives the trading
// flow) to the chain we'll route their shop purchases through. One DEX
// per chain — players don't pick the shop chain explicitly; they pay on
// whatever chain they're already trading on, with the wallet already
// connected for that DEX.
const DEX_TO_SHOP_CHAIN = {
  avantis:  'base',
  pacifica: 'solana',
  phoenix:  'solana',
  gmx:      'arbitrum',
  monad:    'monad',
  decibel:  'aptos',
};

function shopChainForDex(dex) {
  return DEX_TO_SHOP_CHAIN[dex] || 'base';
}

function NftMintPanel({ onClose }) {
  const { dex } = useDex();
  const player = usePlayer();
  const tradingEvmWallet = useEvmWallet();
  const solWallet = useSolWallet();
  const aptosWallet = useAptosWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const { isInFrame } = useFarcaster();
  const { isMobile: panelMobile } = useLayout();

  const [activeShopTab, setActiveShopTab] = useState('nft');
  // Skip the legacy chain-picker step on open — the player's chain comes
  // from their chosen DEX (see [[shop-auto-chain]]). They can still re-pick
  // a chain via the top-right chip which calls handleBackToChains.
  const [step, setStep] = useState('payment');
  const [selectedChain, setSelectedChain] = useState(() => recommendedChain(dex));
  const [selectedPayment, setSelectedPayment] = useState(() => defaultPaymentForChain(recommendedChain(dex)));
  // Top-level view inside the shop modal. 'shop' shows the NFT/Resources
  // tabs; 'bridge' replaces the body with the cross-chain bridge UI.
  const [view, setView] = useState('shop');
  const [evmModalOpen, setEvmModalOpen] = useState(false);
  const [nftEvmWallet, setNftEvmWallet] = useState(null);
  const [evmChainId, setEvmChainId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [mintConfig, setMintConfig] = useState(null);
  const [gameShopConfig, setGameShopConfig] = useState(null);
  // Overlay state machine: idle = normal panel, pending = signing/waiting
  // for tx confirmation, success = celebration animation. Failure resets
  // to idle and surfaces the message through `notice` like before so the
  // user can retry without reopening the modal.
  const [mintStatus, setMintStatus] = useState('idle');
  const [mintResult, setMintResult] = useState(null);
  const [shopPurchaseStatus, setShopPurchaseStatus] = useState('idle');
  const [shopPurchaseResult, setShopPurchaseResult] = useState(null);

  const localEvmWallet = useMemo(
    () => makeNftEvmWallet(nftEvmWallet?.provider, nftEvmWallet?.address),
    [nftEvmWallet?.provider, nftEvmWallet?.address],
  );
  const evmWallet = localEvmWallet || tradingEvmWallet;
  const usingLocalEvmWallet = !!localEvmWallet;
  const solAddress = solWallet?.publicKey?.toBase58?.() || null;
  const evmAddress = evmWallet?.address || null;
  const evmOnBase = evmChainId === BASE_CHAIN_ID;
  const sessionToken = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
  const gameProducts = gameShopConfig?.products || [];
  // Shop chain is derived from the player's DEX choice — no manual
  // selector. Every DEX maps 1:1 to a chain (see DEX_TO_SHOP_CHAIN). Per-
  // chain readiness gates the buy button when the operator hasn't funded
  // that chain's treasury yet.
  const shopChain = shopChainForDex(dex);
  const shopReadiness = {
    base:     !!gameShopConfig?.base?.shop && !!gameShopConfig?.base?.copReady && !!gameShopConfig?.base?.saleActive,
    solana:   !!gameShopConfig?.solana?.ready   && !!gameShopConfig?.solana?.saleActive,
    arbitrum: !!gameShopConfig?.arbitrum?.ready && !!gameShopConfig?.arbitrum?.saleActive,
    monad:    !!gameShopConfig?.monad?.ready    && !!gameShopConfig?.monad?.saleActive,
    aptos:    !!gameShopConfig?.aptos?.ready    && !!gameShopConfig?.aptos?.saleActive,
  };
  const shopChainReady = !!shopReadiness[shopChain];
  // Multi-token chains (Solana, Aptos) expose a sub-toggle. EVM-USDC-only
  // chains don't need one. Default to USDC on multi-token chains since
  // most players already have it from the trading flow.
  const [shopPayment, setShopPayment] = useState('usdc');
  // Reset payment to usdc when the player switches to a chain that doesn't
  // offer the previously-chosen token (e.g. they were on Solana with SOL
  // selected, then changed DEX to Arbitrum which doesn't have SOL). The
  // chain-allowed sets here mirror SHOP_PAYMENTS_BY_CHAIN below. Base is
  // pinned to CoP via the deployed contract — it has no payment toggle,
  // so any leftover shopPayment value is harmless.
  useEffect(() => {
    const validPayments = {
      solana:   ['usdc', 'sol', 'skr'],
      aptos:    ['usdc', 'apt'],
      arbitrum: ['usdc', 'eth'],
      monad:    ['usdc', 'mon'],
      base:     ['usdc'], // unused, Base uses CoP via contract
    };
    const allowed = validPayments[shopChain] || ['usdc'];
    if (!allowed.includes(shopPayment)) {
      setShopPayment('usdc');
    }
  }, [shopChain, shopPayment]);
  const paymentOptions = useMemo(() => {
    const baseOptions = PAYMENT_OPTIONS[selectedChain] || PAYMENT_OPTIONS.base;
    return baseOptions.map((option) => ({
      ...option,
      soon: option.requiresClash ? !mintConfig?.base?.clashReady : !!option.soon,
    }));
  }, [mintConfig?.base?.clashReady, selectedChain]);
  const selected = useMemo(
    () => paymentOptions.find((option) => option.id === selectedPayment) || paymentOptions[0],
    [paymentOptions, selectedPayment],
  );
  const baseSupplyInfo = useMemo(() => getSupplyInfo(mintConfig, 'base'), [mintConfig]);
  const solanaSupplyInfo = useMemo(() => getSupplyInfo(mintConfig, 'solana'), [mintConfig]);
  const totalSupplyInfo = useMemo(
    () => getTotalSupplyInfo(mintConfig?.global, baseSupplyInfo, solanaSupplyInfo),
    [mintConfig?.global, baseSupplyInfo, solanaSupplyInfo],
  );
  const supplyInfo = selectedChain === 'solana' ? solanaSupplyInfo : baseSupplyInfo;
  const solanaConfigured = !!mintConfig?.solana?.candyMachine;
  const solanaSaleActive = !!mintConfig?.solana?.saleActive;

  const refreshMintConfig = useCallback(async ({ apply = true, log = true } = {}) => {
    try {
      const config = await fetchNftMintConfig();
      if (apply) setMintConfig(config);
      return config;
    } catch (err) {
      if (log) {
        addClientBreadcrumb('nft.config_failed', { message: err?.message || String(err) }, 'warn');
      }
      return null;
    }
  }, []);

  const refreshGameShopConfig = useCallback(async ({ apply = true, log = true } = {}) => {
    try {
      const config = await fetchGameShopConfig();
      if (apply) setGameShopConfig(config);
      return config;
    } catch (err) {
      if (log) {
        addClientBreadcrumb('shop.config_failed', { message: err?.message || String(err) }, 'warn');
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshMintConfig({ apply: false }).then((config) => {
      if (!cancelled && config) setMintConfig(config);
    });
    return () => { cancelled = true; };
  }, [refreshMintConfig]);

  useEffect(() => {
    let cancelled = false;
    refreshGameShopConfig({ apply: false }).then((config) => {
      if (!cancelled && config) setGameShopConfig(config);
    });
    return () => { cancelled = true; };
  }, [refreshGameShopConfig]);

  // Re-sync NFT chain to the player's DEX whenever it changes, but only
  // when they're sitting on the chain picker. We don't want to clobber
  // a manual override (e.g. user is on Avantis/Base but switched to
  // Solana to mint cheaper) while they're mid-flow on the payment step.
  // The exception: on initial open (step==='payment' from skip-chain),
  // also seed the chain once so the payment options match the DEX.
  const dexInitialised = useMemo(() => recommendedChain(dex), [dex]);
  useEffect(() => {
    if (step === 'chain') {
      setSelectedChain(dexInitialised);
      setSelectedPayment(defaultPaymentForChain(dexInitialised));
    }
  }, [dexInitialised, step]);

  useEffect(() => {
    const provider = evmWallet?.provider;
    if (!provider?.request) {
      setEvmChainId(null);
      return undefined;
    }

    let cancelled = false;
    const readChain = async () => {
      try {
        const chainHex = await provider.request({ method: 'eth_chainId' });
        if (!cancelled) setEvmChainId(chainIdFromHex(chainHex));
      } catch {
        if (!cancelled) setEvmChainId(null);
      }
    };
    const onChainChanged = (chainHex) => setEvmChainId(chainIdFromHex(chainHex));

    readChain();
    if (typeof provider.on === 'function') provider.on('chainChanged', onChainChanged);
    return () => {
      cancelled = true;
      if (typeof provider.removeListener === 'function') {
        provider.removeListener('chainChanged', onChainChanged);
      }
    };
  }, [evmWallet?.provider]);

  useEffect(() => {
    const provider = nftEvmWallet?.provider;
    if (!provider || typeof provider.on !== 'function') return undefined;
    const onAccountsChanged = (accounts) => {
      const next = accounts?.[0] || null;
      if (!next) {
        setNftEvmWallet(null);
        setEvmChainId(null);
        return;
      }
      setNftEvmWallet((prev) => (
        prev?.provider === provider && prev.address !== next
          ? { ...prev, address: next }
          : prev
      ));
    };
    provider.on('accountsChanged', onAccountsChanged);
    return () => {
      if (typeof provider.removeListener === 'function') {
        provider.removeListener('accountsChanged', onAccountsChanged);
      }
    };
  }, [nftEvmWallet?.provider]);

  const handleSelectChain = useCallback((chain) => {
    setSelectedChain(chain);
    setSelectedPayment(defaultPaymentForChain(chain));
    setStep('payment');
    setNotice(null);
    addClientBreadcrumb('nft.chain_selected', { chain, dex });
  }, [dex]);

  const handleSelectCop = useCallback(() => {
    setSelectedChain('base');
    setSelectedPayment('base-clash');
    setStep('payment');
    setNotice(null);
    addClientBreadcrumb('nft.cop_discount_selected', { dex });
  }, [dex]);

  const handleBackToChains = useCallback(() => {
    setStep('chain');
    setNotice(null);
  }, []);

  const handleBaseReady = useCallback(async () => {
    if (!evmAddress) {
      setEvmModalOpen(true);
      return;
    }

    setBusy('base');
    setNotice(null);
    try {
      await evmWallet.ensureChain(BASE_CHAIN_ID);
      setEvmChainId(BASE_CHAIN_ID);
      setNotice('Base wallet ready.');
      addClientBreadcrumb('nft.payment_wallet_ready', { chain: 'base', dex });
    } catch (err) {
      const message = err?.message || 'Base switch cancelled';
      setNotice(message.slice(0, 120));
      addClientBreadcrumb('nft.base_switch_failed', { dex, message }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [dex, evmAddress, evmWallet]);

  const handleSolanaReady = useCallback(() => {
    if (solAddress) {
      setNotice('Solana wallet ready.');
      addClientBreadcrumb('nft.payment_wallet_ready', { chain: 'solana', dex });
      return;
    }

    addClientBreadcrumb('nft.connect_solana_start', { dex });
    openSolanaWallet({
      wallets: solWallet.wallets,
      select: solWallet.select,
      connect: solWallet.connect,
      openWalletModal: setSolanaModalVisible,
      inFrame: isInFrame,
    });
  }, [dex, isInFrame, setSolanaModalVisible, solAddress, solWallet]);

  const handlePrimary = useCallback(() => {
    if (selected.soon) {
      setNotice('CoP mint opens after token launch.');
      return;
    }
    // Chains without a direct mint endpoint (Arbitrum/Monad/Aptos) render
    // a single bridge-placeholder payment option. Mint button just opens
    // the bridge view so the player can pull an NFT in from Base/Solana.
    if (selected.bridgeOnly) {
      setView('bridge');
      setNotice(null);
      return;
    }
    if (selected.chain === 'base' && evmAddress && evmOnBase) {
      handleBaseMint({
        selected,
        evmAddress,
        evmWallet,
        setBusy,
        setNotice,
        setMintStatus,
        setMintResult,
        refreshMintConfig,
        dex,
      });
      return;
    }
    if (selected.chain === 'solana' && solAddress) {
      handleSolanaMint({
        selected,
        solWallet,
        config: mintConfig?.solana,
        setBusy,
        setNotice,
        setMintStatus,
        setMintResult,
        refreshMintConfig,
        dex,
      });
      return;
    }
    // Arbitrum / Monad — same flow as Base but the wallet has to switch
    // chains first. handleEvmMint calls evmWallet.ensureChain internally.
    if ((selected.chain === 'arbitrum' || selected.chain === 'monad') && evmAddress) {
      handleEvmMint({
        selected,
        chain: selected.chain,
        evmAddress,
        evmWallet,
        setBusy,
        setNotice,
        setMintStatus,
        setMintResult,
        refreshMintConfig,
        dex,
      });
      return;
    }
    // Aptos — different adapter shape (signAndSubmitTransaction). USDC/APT.
    if (selected.chain === 'aptos' && aptosWallet?.address) {
      handleAptosMint({
        selected,
        aptosWallet,
        setBusy,
        setNotice,
        setMintStatus,
        setMintResult,
        refreshMintConfig,
        dex,
      });
      return;
    }
    if (selected.chain === 'base') {
      handleBaseReady();
    } else if (selected.chain === 'arbitrum' || selected.chain === 'monad') {
      // No EVM wallet yet — surface the EVM connect modal.
      setEvmModalOpen(true);
    } else if (selected.chain === 'aptos') {
      // Aptos wallet not connected yet — kick the standard adapter modal.
      try { aptosWallet?.connect?.(); } catch { /* user-cancel */ }
    } else {
      handleSolanaReady();
    }
  }, [aptosWallet, dex, evmAddress, evmOnBase, evmWallet, handleBaseReady, handleSolanaReady, mintConfig?.solana, refreshMintConfig, selected, solAddress, solWallet]);

  const handleBuyGameProduct = useCallback(async (product) => {
    if (!sessionToken) {
      setNotice('Game account is still loading. Try again in a moment.');
      return;
    }
    if (!shopChainReady) {
      setNotice(`${shopChain.charAt(0).toUpperCase() + shopChain.slice(1)} game shop is not live yet.`);
      return;
    }

    // Wallet-readiness gating per chain. We avoid prompting the buy flow
    // until the right wallet is connected — every DEX comes with its own
    // wallet adapter already (Base/Arbitrum/Monad → EvmWallet, Solana →
    // SolWallet, Aptos → AptosWallet) so we just verify the one in scope.
    if (shopChain === 'solana') {
      if (!solAddress) { handleSolanaReady(); return; }
    } else if (shopChain === 'aptos') {
      if (!aptosWallet?.address) {
        try { await aptosWallet.connect(); } catch { /* user-cancel */ }
        return;
      }
    } else if (shopChain === 'base') {
      if (!evmAddress || !evmOnBase) { await handleBaseReady(); return; }
    } else if (shopChain === 'arbitrum' || shopChain === 'monad') {
      if (!evmAddress) { await handleBaseReady(); return; }
    }

    setBusy(`shop:${product.id}`);
    setNotice(null);
    setShopPurchaseStatus('pending');
    setShopPurchaseResult({ product });
    try {
      let result;
      if (shopChain === 'solana') {
        result = await buySolanaShopItem({
          solWallet,
          buyer: solAddress,
          token: sessionToken,
          sku: product.sku,
          payment: shopPayment,
          quantity: 1,
        });
      } else if (shopChain === 'base') {
        result = await buyGameShopItem({
          evmWallet,
          buyer: evmAddress,
          token: sessionToken,
          sku: product.sku,
          quantity: 1,
        });
      } else if (shopChain === 'arbitrum' || shopChain === 'monad') {
        result = await buyEvmShopItem({
          evmWallet,
          buyer: evmAddress,
          token: sessionToken,
          chain: shopChain,
          sku: product.sku,
          payment: shopPayment,
          quantity: 1,
        });
      } else if (shopChain === 'aptos') {
        result = await buyAptosShopItem({
          aptosWallet,
          buyer: aptosWallet?.address,
          token: sessionToken,
          sku: product.sku,
          payment: shopPayment,
          quantity: 1,
        });
      } else {
        throw new Error(`Unsupported chain: ${shopChain}`);
      }
      const grant = result.grant || {};
      if (grant.resources) {
        // Update React HUD immediately + push the new totals into Godot so
        // its local resource counters don't drift and clobber React on the
        // next sync. Without the godotBridge call, Godot would re-broadcast
        // the stale gold/wood/ore the next time _update_resource_ui ran.
        window.onGodotMessage?.({ action: 'resources', data: grant.resources });
        try {
          window.godotBridge?.(JSON.stringify({ action: 'set_resources', data: grant.resources }));
        } catch {}
      }
      if (grant.shield_until) {
        window.onGodotMessage?.({ action: 'state', data: { shield_until: grant.shield_until } });
      }
      // Stash the per-resource delta on the result so the success popup's
      // "Done" handler can fire the fly-to-bar animation. We deliberately
      // DON'T fly here — the burst would happen behind the success overlay
      // that's about to cover the screen, which the player wouldn't see.
      const flyRewards = product.rewards
        ? {
            gold: product.rewards.gold || 0,
            wood: product.rewards.wood || 0,
            ore:  product.rewards.ore  || 0,
          }
        : null;
      // Each chain returns a different tx-ID field shape; normalize so the
      // success popup + analytics see a single string.
      const txId = result.signature || result.hash || result.txHash || '';
      const paymentLabel = shopChain === 'base'
        ? 'cop'
        : (shopChain === 'solana' || shopChain === 'aptos') ? shopPayment : 'usdc';
      setShopPurchaseResult({ product, grant, tx: txId, flyRewards, chain: shopChain });
      setShopPurchaseStatus('success');
      addClientBreadcrumb('shop.purchase_success', {
        dex,
        chain: shopChain,
        payment: paymentLabel,
        sku: product.sku,
        tx: txId,
      });
      void refreshGameShopConfig({ log: false });
    } catch (err) {
      const message = err?.shortMessage || err?.message || 'Purchase failed';
      setShopPurchaseStatus('idle');
      setShopPurchaseResult(null);
      setNotice(message.slice(0, 160));
      addClientBreadcrumb('shop.purchase_failed', { dex, chain: shopChain, sku: product.sku, message }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [aptosWallet, dex, evmAddress, evmOnBase, evmWallet, handleBaseReady, handleSolanaReady, refreshGameShopConfig, sessionToken, shopChain, shopChainReady, shopPayment, solAddress, solWallet]);

  const handleDismissShopPurchase = useCallback(() => {
    // Fire the fly-to-bar burst when the user dismisses the success popup.
    // Doing it here (instead of right after grant) means the icons travel
    // across the now-uncovered screen and the user actually sees them land.
    const fly = shopPurchaseResult?.flyRewards;
    if (fly && (fly.gold || fly.wood || fly.ore)) {
      flyResourcesToBars(fly);
    }
    setShopPurchaseStatus('idle');
    setShopPurchaseResult(null);
  }, [shopPurchaseResult]);

  const primaryState = getPrimaryState({
    selected,
    evmAddress,
    evmOnBase,
    solAddress,
    aptosAddress: aptosWallet?.address || null,
    solanaConfigured,
    solanaSaleActive,
    busy,
  });

  const contextLine = getContextLine(dex);

  const handleDismissSuccess = useCallback(() => {
    setMintStatus('idle');
    setMintResult(null);
    setNotice(null);
    onClose?.();
  }, [onClose]);

  const handleDisconnectEvm = useCallback(() => {
    if (usingLocalEvmWallet) {
      setNftEvmWallet(null);
      setEvmChainId(null);
      setNotice('Base payment wallet disconnected.');
      addClientBreadcrumb('nft.disconnect_evm', { dex, scope: 'shop' });
      return;
    }
    setEvmModalOpen(true);
    setNotice('Choose a Base wallet for this shop purchase.');
    addClientBreadcrumb('nft.change_evm_wallet', { dex, scope: 'shop' });
  }, [dex, usingLocalEvmWallet]);

  const handleDisconnectSolana = useCallback(async () => {
    try {
      await solWallet?.disconnect?.();
      setNotice('Solana wallet disconnected.');
      addClientBreadcrumb('nft.disconnect_solana', { dex });
    } catch (err) {
      const message = err?.message || 'Solana disconnect failed';
      setNotice(message.slice(0, 120));
      addClientBreadcrumb('nft.disconnect_solana_failed', { dex, message }, 'warn');
    }
  }, [dex, solWallet]);

  return (
    <>
      <style>{MINT_ANIM_CSS}</style>
      <div
        style={styles.overlay}
        onClick={mintStatus === 'pending' ? undefined : onClose}
      >
        <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            {view === 'bridge' ? (
              <button style={styles.backBtn} onClick={() => setView('shop')} aria-label="Back to shop">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                  <path d="M15 18 9 12l6-6" />
                </svg>
              </button>
            ) : <span style={styles.headerSpacer} />}
            <span style={styles.title}>{view === 'bridge' ? 'Bridge NFT' : 'Battle Shop'}</span>
            <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={styles.body}>
            {view === 'bridge' ? (
              <NftBridgePanel
                styles={styles}
                onBack={() => setView('shop')}
                onClose={onClose}
              />
            ) : (
            <>
            <div
              style={{
                ...styles.shopTabs,
                gridTemplateColumns: `repeat(${SHOP_TABS.length}, minmax(0, 1fr))`,
              }}
            >
              {SHOP_TABS.map((tab) => {
                const active = activeShopTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setActiveShopTab(tab.id); setNotice(null); }}
                    style={{
                      ...styles.shopTabBtn,
                      ...(active ? styles.shopTabBtnActive : null),
                    }}
                  >
                    {panelMobile ? (tab.mobileLabel || tab.label) : tab.label}
                  </button>
                );
              })}
            </div>
            {/* Slider viewport — three tab bodies sit side-by-side in a
                flex track and we slide via transform: translateX(). The
                viewport clips overflow so only the active tab is visible;
                each slide owns its own vertical scroll so the panel size
                stays stable across tabs. */}
            <div style={styles.sliderViewport}>
              <div
                style={{
                  ...styles.sliderTrack,
                  transform: `translateX(-${SHOP_TABS.findIndex((t) => t.id === activeShopTab) * 100}%)`,
                }}
              >
                {/* ─── Resources slide (index 0) ───────────────────── */}
                <div
                  className="shop-scroll"
                  style={styles.slide}
                  aria-hidden={activeShopTab !== 'resources'}
                  inert={activeShopTab !== 'resources' ? '' : undefined}
                >
                  <div style={{ ...styles.topRow, ...styles.topRowResources }}>
                    <div style={styles.summary}>
                      <span style={styles.heroName}>Game Resources</span>
                      <span style={styles.editionTag}>Pay with CoP on Base</span>
                    </div>
                  </div>
                  <GameResourcesTab
                    products={gameProducts}
                    ready={shopChainReady}
                    loading={gameShopConfig === null}
                    chain={shopChain}
                    payment={shopPayment}
                    onPaymentChange={setShopPayment}
                    skrReady={!!gameShopConfig?.solana?.skrReady}
                    evmAddress={evmAddress}
                    evmOnBase={evmOnBase}
                    solAddress={solAddress}
                    aptosAddress={aptosWallet?.address || null}
                    busy={busy}
                    onConnectBase={handleBaseReady}
                    onConnectSolana={handleSolanaReady}
                    onConnectAptos={() => aptosWallet?.connect?.()}
                    onBuy={handleBuyGameProduct}
                  />
                </div>

                {/* ─── NFT slide (index 1) ─────────────────────────── */}
                <div
                  className="shop-scroll"
                  style={styles.slide}
                  aria-hidden={activeShopTab !== 'nft'}
                  inert={activeShopTab !== 'nft' ? '' : undefined}
                >
                  <div style={styles.topRow}>
                    <div style={styles.heroFrame}>
                      <div style={styles.heroGlow} />
                      <img src={demonKingImg} alt="Demon King" style={styles.heroImg} />
                    </div>
                    <div style={styles.summary}>
                      <span style={styles.heroName}>Demon King</span>
                      <span style={styles.editionTag}>
                        Genesis supply {formatCount(totalSupplyInfo.maxSupply)}
                      </span>
                      {view === 'shop' && (
                        <button
                          type="button"
                          onClick={() => { setView('bridge'); setNotice(null); }}
                          style={styles.heroBridgeBtn}
                          title="Bridge NFT between chains"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 7h12l-3-3" />
                            <path d="M17 17H5l3 3" />
                          </svg>
                          <span>Bridge</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <SupplyProgress supply={totalSupplyInfo} />

                  {NFT_MINT_SUPPORTED.has(selectedChain) ? (
                    <>
                      <div style={styles.options}>
                        {paymentOptions.map((option) => {
                          const active = option.id === selectedPayment;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => { setSelectedPayment(option.id); setNotice(null); }}
                              disabled={option.soon}
                              style={{
                                ...styles.optionBtn,
                                ...(active ? styles.optionBtnActive : null),
                                ...(option.soon ? styles.optionBtnDisabled : null),
                              }}
                            >
                              <span style={styles.optionBadge}>{option.token}</span>
                              <span style={styles.optionMain}>
                                {option.method}
                                {option.requiresClash && COP_DISCOUNT && (
                                  <span style={styles.optionDiscountChip}>
                                    -{COP_DISCOUNT.percent}%
                                  </span>
                                )}
                              </span>
                              <span style={styles.optionPrice}>{option.price}</span>
                              {option.soon && <span style={styles.soonBadge}>SOON</span>}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        style={{
                          ...styles.mintBtn,
                          ...(primaryState.ready ? styles.mintBtnReady : null),
                          ...(selected.soon ? styles.mintBtnDisabled : null),
                          cursor: busy || selected.soon ? 'not-allowed' : 'pointer',
                        }}
                        onClick={handlePrimary}
                        disabled={!!busy || selected.soon}
                      >
                        <span style={styles.mintBtnGlyph}>{primaryState.glyph}</span>
                        <span>{primaryState.label}</span>
                      </button>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 4px' }}>
                      <div style={{ fontSize: 13, color: '#5C3A21', lineHeight: 1.4 }}>
                        Fresh mint isn't live on <b>{selectedChain.charAt(0).toUpperCase() + selectedChain.slice(1)}</b> yet.
                        Mint on Base or Solana, then use the bridge to move the NFT to your chain — the level is preserved.
                      </div>
                      <button
                        type="button"
                        onClick={() => setView('bridge')}
                        style={{
                          padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 800,
                          background: '#7ce04a', border: '2px solid #4a8f2c', color: '#1a3d0a',
                          cursor: 'pointer',
                        }}
                      >
                        Open bridge →
                      </button>
                    </div>
                  )}
                </div>

                {/* ─── Marketplace slide (index 2) ─────────────────────
                    Marketplace UI is built and contracts are deployed but
                    we're still verifying flows on mainnet. The full panel
                    renders behind a dim overlay so the player can preview
                    what's coming while interactions are blocked. Remove the
                    `comingSoonOverlay` block when the marketplace ships. */}
                <div
                  className="shop-scroll"
                  style={{ ...styles.slide, position: 'relative' }}
                  aria-hidden={activeShopTab !== 'marketplace'}
                  inert={activeShopTab !== 'marketplace' ? '' : undefined}
                >
                  <div style={{ ...styles.topRow, ...styles.topRowResources }}>
                    <div style={styles.summary}>
                      <span style={styles.heroName}>Marketplace</span>
                      <span style={styles.editionTag}>Player-to-player trading on Base</span>
                    </div>
                  </div>
                  <NftMarketplacePanel
                    evmAddress={evmAddress}
                    evmWallet={evmWallet}
                    evmOnBase={evmOnBase}
                    onConnectBase={handleBaseReady}
                    onOpenEvmModal={() => setEvmModalOpen(true)}
                  />

                  {/* Coming-soon dim layer. Position is sticky-via-absolute
                      to the slide root (`position: relative` above) so the
                      overlay covers all scrolled content. */}
                  <div style={styles.comingSoonOverlay} aria-hidden>
                    <div style={styles.comingSoonBadge}>IN TESTING</div>
                    <div style={styles.comingSoonTitle}>Marketplace coming soon</div>
                    <div style={styles.comingSoonSub}>
                      We're still verifying flows on mainnet. List / buy will
                      open once mainnet testing wraps up.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {notice && <div style={activeShopTab === 'nft' && primaryState.ready ? styles.noticeReady : styles.notice}>{notice}</div>}
            </>
            )}
          </div>

          {mintStatus !== 'idle' && (
            <MintProgressOverlay
              status={mintStatus}
              result={mintResult}
              chainLabel={selectedChain === 'solana' ? 'Solana' : 'Base'}
              onDismiss={handleDismissSuccess}
            />
          )}

          {shopPurchaseStatus !== 'idle' && (
            <ShopPurchaseOverlay
              status={shopPurchaseStatus}
              result={shopPurchaseResult}
              onDismiss={handleDismissShopPurchase}
            />
          )}
        </div>
      </div>

      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        onConnected={({ provider, address, rdns }) => {
          setNftEvmWallet({ provider, address, rdns });
          setEvmChainId(BASE_CHAIN_ID);
          setEvmModalOpen(false);
          setNotice('Base wallet connected.');
          addClientBreadcrumb('nft.connect_base_success', { dex, scope: 'nft' });
        }}
      />
    </>
  );
}

// Per-chain payment toggles. The "stable" entry is always USDC; the
// "native" entry is whatever fee/governance token each chain uses. SKR
// on Solana is gated on `solana.skrReady` server-side — the option is
// pruned at render time if the operator hasn't configured the mint.
const SHOP_PAYMENTS_BY_CHAIN = {
  arbitrum: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'eth',  label: 'ETH',  sub: 'Native' },
  ],
  monad: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'mon',  label: 'MON',  sub: 'Native' },
  ],
  solana: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'sol',  label: 'SOL',  sub: 'Native' },
    { id: 'skr',  label: 'SKR',  sub: 'Seeker' },
  ],
  aptos: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'apt',  label: 'APT',  sub: 'Native' },
  ],
};

const SHOP_CHAIN_LABEL = {
  base:     'Base',
  arbitrum: 'Arbitrum',
  monad:    'Monad',
  solana:   'Solana',
  aptos:    'Aptos',
};

function GameResourcesTab({
  products,
  ready,
  loading,
  chain,
  payment,
  onPaymentChange,
  skrReady,
  evmAddress,
  evmOnBase,
  solAddress,
  aptosAddress,
  busy,
  onConnectBase,
  onConnectSolana,
  onConnectAptos,
  onBuy,
}) {
  const { isMobile } = useLayout();
  const chainLabel = SHOP_CHAIN_LABEL[chain] || chain;
  // Wallet-readiness is chain-specific. Each DEX brings its own wallet
  // adapter, so we just check the right one for the chain in scope.
  const walletConnected = chain === 'solana'   ? !!solAddress
                       : chain === 'aptos'    ? !!aptosAddress
                       : chain === 'base'     ? (!!evmAddress && evmOnBase)
                       : /* arbitrum/monad */   !!evmAddress;
  // Per-chain payment toggle. We filter SKR off when the operator hasn't
  // configured GAME_SHOP_SOLANA_SKR_MINT (skrReady=false) so the UI never
  // offers a payment path the server will reject with 503.
  const paymentOptions = (SHOP_PAYMENTS_BY_CHAIN[chain] || [])
    .filter((o) => o.id !== 'skr' || skrReady);
  const paymentLabel = chain === 'base' ? 'CoP'
    : (paymentOptions.length > 0 ? (paymentOptions.find((o) => o.id === payment)?.label || 'USDC') : 'USDC');
  // Compact mobile labels — full-width "Connect Solana" / "Buy with USDC"
  // wraps on a 360px viewport. Strip the chain name on mobile.
  const connectLabel = !walletConnected
    ? (isMobile ? 'Connect' : `Connect ${chainLabel}`)
    : (chain === 'base' && evmAddress && !evmOnBase
        ? (isMobile ? 'Switch' : 'Switch Base')
        : (isMobile ? 'Connected' : `${chainLabel} connected`));

  function connectForChain() {
    if (chain === 'solana')  return onConnectSolana?.();
    if (chain === 'aptos')   return onConnectAptos?.();
    return onConnectBase?.(); // base + arbitrum + monad all funnel through the EVM connect
  }

  // Skeleton while /api/shop/config is in flight.
  if (loading) {
    return (
      <>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionHeaderText}>Game resources</span>
          <span style={styles.sectionHeaderHint}>Loading…</span>
        </div>
        <div style={styles.resourceGrid}>
          {[0, 1, 2].map((i) => (
            <ResourceCardSkeleton key={i} isMobile={isMobile} />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionHeaderText}>Game resources</span>
        <span style={styles.sectionHeaderHint}>{paymentLabel} utility</span>
      </div>

      {/* Payment-token toggle — only on chains with multiple options
          (Solana: USDC/SOL, Aptos: USDC/APT). Base/Arbitrum/Monad are
          single-token so we skip the toggle and just label the buy
          button with the fixed payment token. */}
      {paymentOptions.length > 0 && (
        <div style={styles.shopPaymentRow}>
          {paymentOptions.map((opt) => {
            const active = opt.id === payment;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onPaymentChange?.(opt.id)}
                style={{
                  ...styles.shopPaymentBtn,
                  ...(active ? styles.shopPaymentBtnActive : null),
                }}
              >
                <span style={styles.shopPaymentLabel}>{opt.label}</span>
                <span style={styles.shopPaymentSub}>{opt.sub}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={styles.resourceGrid}>
        {products.map((product) => {
          const isBusy = busy === `shop:${product.id}`;
          const actionLabel = !walletConnected
            ? connectLabel
            : isBusy
              ? (isMobile ? 'Buying' : 'Buying...')
              : (isMobile ? 'Buy' : `Buy with ${paymentLabel}`);
          const cardStyle = {
            ...styles.resourceCard,
            ...(isMobile ? styles.resourceCardMobile : null),
          };
          const iconWrapStyle = {
            ...styles.resourceIconWrap,
            ...(isMobile ? styles.resourceIconWrapMobile : null),
          };
          const buyBtnStyle = {
            ...styles.resourceBuyBtn,
            ...(isMobile ? styles.resourceBuyBtnMobile : null),
            ...((ready && walletConnected) ? styles.resourceBuyBtnReady : null),
            ...(!ready ? styles.resourceBuyBtnDisabled : null),
          };
          const infoStyle = isMobile
            ? { ...styles.resourceInfo, ...styles.resourceInfoMobile }
            : styles.resourceInfo;
          return (
            <div key={product.id} style={cardStyle}>
              <div style={iconWrapStyle}>
                <ResourceProductIcon product={product} />
              </div>
              <div style={infoStyle}>
                <span style={styles.resourceTitle}>{product.title}</span>
                <span style={styles.resourceSubtitle}>{product.subtitle}</span>
                <div style={styles.resourceMetaRow}>
                  <span style={styles.resourcePrice}>${product.priceUsd}</span>
                  {product.durationHours && <span style={styles.resourceMeta}>{product.durationHours}h</span>}
                  {product.rewards && <span style={styles.resourceMeta}>{formatRewards(product.rewards)}</span>}
                </div>
              </div>
              <button
                type="button"
                style={buyBtnStyle}
                disabled={!ready || !!busy}
                onClick={() => {
                  if (!walletConnected) connectForChain();
                  else onBuy(product);
                }}
              >
                {actionLabel}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

const RESOURCE_PRODUCT_ICONS = {
  resource_pack_s: '/icons/resource-pack.png',
  resource_pack_m: '/icons/war-chest.png',
};

function ResourceProductIcon({ product }) {
  const customIcon = RESOURCE_PRODUCT_ICONS[product.id];
  if (customIcon) {
    return <img src={customIcon} alt="" style={styles.resourceIconImg} />;
  }
  // SVG glyphs render at their nominal size, so push the shield closer to
  // the visual weight of the chest/pack PNGs which fill the 92px wrap at
  // 128% — a 76px shield reads roughly the same on the row.
  if (product.kind === 'shield') return <ShieldGlyph size={76} />;
  return <ResourceGlyph size={76} />;
}

function ResourceCardSkeleton({ isMobile }) {
  const cardStyle = {
    ...styles.resourceCard,
    ...(isMobile ? styles.resourceCardMobile : null),
  };
  const iconWrapStyle = {
    ...styles.resourceIconWrap,
    ...(isMobile ? styles.resourceIconWrapMobile : null),
  };
  const btnStyle = {
    ...styles.resourceBuyBtn,
    ...(isMobile ? styles.resourceBuyBtnMobile : null),
    background: 'linear-gradient(90deg, #e6d9b7 0%, #f0e4c4 50%, #e6d9b7 100%)',
    backgroundSize: '200% 100%',
    color: 'transparent',
    border: '3px solid #d4c8b0',
  };
  return (
    <div style={cardStyle}>
      <div style={iconWrapStyle}>
        <div style={styles.resourceSkeletonBlock} className="nft-shop-shimmer" />
      </div>
      <div style={{ ...styles.resourceInfo, ...(isMobile ? styles.resourceInfoMobile : null) }}>
        <div style={{ ...styles.resourceSkeletonLine, width: '60%' }} className="nft-shop-shimmer" />
        <div style={{ ...styles.resourceSkeletonLine, width: '85%', height: 10 }} className="nft-shop-shimmer" />
        <div style={{ ...styles.resourceSkeletonLine, width: '40%', height: 10, marginTop: 4 }} className="nft-shop-shimmer" />
      </div>
      <button type="button" disabled style={btnStyle} className="nft-shop-shimmer">…</button>
    </div>
  );
}

function ShieldGlyph({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 6 L52 15 L52 31 C52 45 43 54 32 59 C21 54 12 45 12 31 L12 15 Z" fill="#3b7dd8" stroke="#173d73" strokeWidth="3" />
      <path d="M25 31 L30 36 L40 24" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 11 L47 18 L47 31 C47 42 40 49 32 53" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ResourceGlyph({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M15 24 L32 14 L49 24 V44 L32 54 L15 44 Z" fill="#d59a2f" stroke="#6b3d12" strokeWidth="3" strokeLinejoin="round" />
      <path d="M15 24 L32 34 L49 24" stroke="#6b3d12" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 34 V54" stroke="#6b3d12" strokeWidth="3" />
      <path d="M25 20 L41 29" stroke="rgba(255,255,255,0.45)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function formatRewards(rewards) {
  const values = [rewards.gold, rewards.wood, rewards.ore].filter(Boolean);
  if (!values.length) return '';
  const first = values[0] || 0;
  return `${first.toLocaleString()} each`;
}

function getContextLine(dex) {
  const label = DEX_LABELS[dex] || 'Game account';
  return `${label} active`;
}

async function handleBaseMint({ selected, evmAddress, evmWallet, setBusy, setNotice, setMintStatus, setMintResult, refreshMintConfig, dex }) {
  const payment = selected.id === 'base-usdc' ? 'usdc'
    : selected.id === 'base-clash' ? 'cop'
      : 'eth';
  setBusy('mint');
  setMintStatus?.('pending');
  setMintResult?.(null);
  setNotice(null);
  try {
    const result = await mintBaseNft({
      evmWallet,
      buyer: evmAddress,
      payment,
      quantity: 1,
    });
    addClientBreadcrumb('nft.base_mint_submitted', {
      dex,
      payment,
      tx: result.hash,
    });
    setMintResult?.({
      chain: 'base',
      tx: result.hash,
      payment,
      explorer: result.hash ? `https://basescan.org/tx/${result.hash}` : null,
    });
    setMintStatus?.('success');
    void refreshMintConfig?.({ log: false });
  } catch (err) {
    const message = err?.shortMessage || err?.message || 'Mint failed';
    setNotice(message.slice(0, 140));
    setMintStatus?.('idle');
    addClientBreadcrumb('nft.base_mint_failed', { dex, payment, message }, 'warn');
  } finally {
    setBusy(null);
  }
}

// Arbitrum + Monad share /nft/evm/quote on the server and mintEvmNft on
// the client. The flow mirrors handleBaseMint but switches the chain on
// the connected EVM wallet first. Payment id format: `<chain>-<token>` →
// USDC or the chain's native (eth/mon).
async function handleEvmMint({ selected, chain, evmAddress, evmWallet, setBusy, setNotice, setMintStatus, setMintResult, refreshMintConfig, dex }) {
  const payment = /usdc$/i.test(selected.id) ? 'usdc' : 'native';
  setBusy('mint');
  setMintStatus?.('pending');
  setMintResult?.(null);
  setNotice(null);
  try {
    const result = await mintEvmNft({
      evmWallet, chain, buyer: evmAddress, payment, quantity: 1,
    });
    addClientBreadcrumb('nft.evm_mint_submitted', { dex, chain, payment, tx: result.hash });
    const explorerBase = chain === 'arbitrum' ? 'https://arbiscan.io/tx/' : `https://explorer.monad.xyz/tx/`;
    setMintResult?.({
      chain,
      tx: result.hash,
      payment,
      explorer: result.hash ? `${explorerBase}${result.hash}` : null,
    });
    setMintStatus?.('success');
    void refreshMintConfig?.({ log: false });
  } catch (err) {
    const message = err?.shortMessage || err?.message || `${chain} mint failed`;
    setNotice(message.slice(0, 140));
    setMintStatus?.('idle');
    addClientBreadcrumb('nft.evm_mint_failed', { dex, chain, payment, message }, 'warn');
  } finally {
    setBusy(null);
  }
}

// Aptos — server signs a MintQuote, client calls mint_with_quote on the
// Move module via the connected wallet (Petra/Pontem/Martian). USDC only.
async function handleAptosMint({ selected, aptosWallet, setBusy, setNotice, setMintStatus, setMintResult, refreshMintConfig, dex }) {
  const buyer = aptosWallet?.address;
  if (!buyer) { setNotice('Connect Aptos wallet first.'); return; }
  const payment = selected?.id === 'aptos-apt' ? 'apt' : 'usdc';
  setBusy('mint');
  setMintStatus?.('pending');
  setMintResult?.(null);
  setNotice(null);
  try {
    const result = await mintAptosNft({ aptosWallet, buyer, quantity: 1, payment });
    addClientBreadcrumb('nft.aptos_mint_submitted', { dex, payment, tx: result.hash });
    setMintResult?.({
      chain: 'aptos',
      tx: result.hash,
      payment,
      explorer: result.hash ? `https://explorer.aptoslabs.com/txn/${result.hash}` : null,
    });
    setMintStatus?.('success');
    void refreshMintConfig?.({ log: false });
  } catch (err) {
    const message = err?.shortMessage || err?.message || 'Aptos mint failed';
    setNotice(message.slice(0, 140));
    setMintStatus?.('idle');
    addClientBreadcrumb('nft.aptos_mint_failed', { dex, payment, message }, 'warn');
  } finally {
    setBusy(null);
  }
}

async function handleSolanaMint({ selected, solWallet, config, setBusy, setNotice, setMintStatus, setMintResult, refreshMintConfig, dex }) {
  const payment = selected.id === 'sol-sol' ? 'sol' : 'usdc';
  setBusy('mint');
  setMintStatus?.('pending');
  setMintResult?.(null);
  setNotice(null);
  try {
    const result = await mintSolanaNft({
      solWallet,
      config,
      payment,
    });
    addClientBreadcrumb('nft.solana_mint_submitted', {
      dex,
      payment,
      tx: result.signature,
      asset: result.asset,
    });
    setMintResult?.({
      chain: 'solana',
      tx: result.signature,
      payment,
      asset: result.asset,
      explorer: result.signature ? `https://solscan.io/tx/${result.signature}` : null,
    });
    setMintStatus?.('success');
    void refreshMintConfig?.({ log: false });
  } catch (err) {
    const message = err?.shortMessage || err?.message || 'Solana mint failed';
    setNotice(message.slice(0, 140));
    setMintStatus?.('idle');
    addClientBreadcrumb('nft.solana_mint_failed', { dex, payment, message }, 'warn');
  } finally {
    setBusy(null);
  }
}

function getPrimaryState({ selected, evmAddress, evmOnBase, solAddress, aptosAddress, solanaConfigured, solanaSaleActive, busy }) {
  if (selected?.soon) return { label: 'CoP soon', glyph: 'C', ready: false };
  if (busy === 'mint') return { label: 'Minting...', glyph: '...', ready: false };
  if (busy === selected.chain) return { label: 'Preparing...', glyph: '...', ready: false };
  // Bridge-only fallback (no direct mint endpoint on this chain). Used if
  // an operator disables a chain's PAYMENT_OPTIONS in the future.
  if (selected.bridgeOnly) {
    return { label: 'Bridge from Base / Solana', glyph: '⇄', ready: true };
  }
  if (selected.chain === 'base') {
    if (!evmAddress) return { label: 'Connect Base wallet', glyph: 'B', ready: false };
    if (!evmOnBase) return { label: 'Switch to Base', glyph: 'B', ready: false };
    return { label: `Mint with ${selected.token}`, glyph: 'B', ready: true };
  }
  if (selected.chain === 'arbitrum' || selected.chain === 'monad') {
    if (!evmAddress) return { label: `Connect ${selected.chain === 'arbitrum' ? 'Arbitrum' : 'Monad'} wallet`, glyph: selected.chain === 'arbitrum' ? 'A' : 'M', ready: false };
    return { label: `Mint with ${selected.token}`, glyph: selected.chain === 'arbitrum' ? 'A' : 'M', ready: true };
  }
  if (selected.chain === 'aptos') {
    if (!aptosAddress) return { label: 'Connect Aptos wallet', glyph: 'A', ready: false };
    return { label: `Mint with ${selected.token}`, glyph: 'A', ready: true };
  }
  if (!solAddress) return { label: 'Connect Solana wallet', glyph: 'S', ready: false };
  if (!solanaConfigured) return { label: 'Solana mint soon', glyph: 'S', ready: false };
  if (!solanaSaleActive) return { label: 'Solana sale closed', glyph: 'S', ready: false };
  return { label: `Mint with ${selected.token}`, glyph: 'S', ready: true };
}

function WalletStatus({ label, value, hint, tone, onDisconnect }) {
  const toneStyle = tone === 'ready' ? styles.walletReady
    : tone === 'warn' ? styles.walletWarn
      : styles.walletIdle;
  return (
    <div style={{ ...styles.walletStatus, ...toneStyle }}>
      <div style={styles.walletInfo}>
        <span style={styles.walletLabel}>{label}</span>
        <span style={styles.walletValue}>{value}</span>
        <span style={styles.walletHint}>{hint}</span>
      </div>
      {onDisconnect && (
        <button
          type="button"
          onClick={onDisconnect}
          style={styles.walletDisconnectBtn}
          title="Disconnect wallet"
          aria-label="Disconnect wallet"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {/* unplug-style glyph: a small circle + line away from it */}
            <path d="M9 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3" />
            <path d="M14 7h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4" />
            <line x1="9" y1="12" x2="14" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function SupplyProgress({ supply }) {
  const loaded = !!supply?.loaded;
  const barWidth = loaded ? Math.max(2, Math.min(100, supply.progress)) : 12;
  const remainingText = loaded ? `${formatCount(supply.remaining)} left` : 'Checking chain';
  const mintedText = loaded ? `${formatCount(supply.totalMinted)} minted` : 'Syncing';
  return (
    <div style={styles.supplyBox}>
      <div style={styles.supplyTop}>
        <span style={styles.supplyTitle}>{supply.title}</span>
        <span style={styles.supplyRemaining}>{remainingText}</span>
      </div>
      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressFill, width: `${barWidth}%` }} />
      </div>
      <div style={styles.supplyMeta}>
        <span>{mintedText}</span>
        <span>{formatCount(supply.maxSupply)} total</span>
      </div>
    </div>
  );
}

function SupplyOverview({ total, base, solana }) {
  return (
    <div style={styles.supplyOverview}>
      <ChainSupplySide label="Base" supply={base} align="left" />
      <div style={styles.totalSupply}>
        <span style={styles.totalSupplyLabel}>Genesis Supply</span>
        <span style={styles.totalSupplyValue}>{formatCount(total.maxSupply)}</span>
        <span style={styles.totalSupplyMeta}>{total.loaded ? `${formatCount(total.remaining)} left` : 'Checking chain'}</span>
      </div>
      <ChainSupplySide label="Solana" supply={solana} align="right" />
    </div>
  );
}

function ChainSupplySide({ label, supply, align }) {
  const loaded = !!supply?.loaded;
  return (
    <div style={{ ...styles.chainSupplySide, textAlign: align }}>
      <span style={styles.chainSupplyLabel}>{label}</span>
      <span style={styles.chainSupplyValue}>{loaded ? `${formatCount(supply.remaining)} left` : 'Checking'}</span>
      <span style={styles.chainSupplyMeta}>{loaded ? `${formatCount(supply.totalMinted)} minted` : 'syncing'}</span>
    </div>
  );
}

// Confetti placement: a small handful of gold/orange/red shards burst out
// from the centre on success. Positions/delays are deterministic so the
// motion reads as designed rather than random noise.
const CONFETTI = [
  { x: -130, y: -80, hue: '#ffd76a', size: 12, delay: 0 },
  { x: 120, y: -100, hue: '#ff7a3a', size: 9, delay: 60 },
  { x: -90, y: 110, hue: '#e53935', size: 11, delay: 120 },
  { x: 140, y: 90, hue: '#ffe88a', size: 8, delay: 30 },
  { x: -160, y: 30, hue: '#ff9a35', size: 10, delay: 90 },
  { x: 160, y: 10, hue: '#ffd76a', size: 9, delay: 150 },
  { x: -40, y: -130, hue: '#ffe88a', size: 7, delay: 180 },
  { x: 50, y: 130, hue: '#e53935', size: 8, delay: 210 },
  { x: -110, y: -20, hue: '#ff7a3a', size: 6, delay: 240 },
  { x: 90, y: -40, hue: '#ffd76a', size: 7, delay: 270 },
];

function MintProgressOverlay({ status, result, chainLabel, onDismiss }) {
  const pending = status === 'pending';
  const success = status === 'success';
  return (
    <div style={overlayStyles.root}>
      {/* Backdrop вЂ” soft cream wash with a moving radial sheen so it feels
          "alive" during the wait instead of a flat grey curtain. */}
      <div style={overlayStyles.backdrop} className="nft-mint-backdrop" />

      {success && (
        <>
          {/* Rotating sunburst behind the card. CSS gradient does the
              heavy lifting вЂ” no PNG / no extra layer. */}
          <div style={overlayStyles.rays} className="nft-mint-rays" />
          {/* Soft ambient pulse that breathes in and out under the rays. */}
          <div style={overlayStyles.successHalo} className="nft-mint-halo" />
          {CONFETTI.map((bit, i) => (
            <span
              key={i}
              style={{
                ...overlayStyles.confetti,
                background: bit.hue,
                width: bit.size,
                height: bit.size,
                '--tx': `${bit.x}px`,
                '--ty': `${bit.y}px`,
                animationDelay: `${bit.delay}ms`,
              }}
              className="nft-mint-confetti"
            />
          ))}
        </>
      )}

      <div style={overlayStyles.content}>
        <div
          style={{
            ...overlayStyles.cardStage,
            ...(success ? overlayStyles.cardStageSuccess : null),
          }}
        >
          <div
            style={overlayStyles.card}
            className={success ? 'nft-mint-card-spin' : 'nft-mint-card-pulse'}
          >
            <img src={demonKingImg} alt="Demon King" style={overlayStyles.cardImg} />
            {success && <div style={overlayStyles.cardShine} className="nft-mint-card-shine" />}
          </div>

          {pending && (
            <>
              <div style={overlayStyles.ring} className="nft-mint-ring" />
              <div style={overlayStyles.ringInner} className="nft-mint-ring-inner" />
            </>
          )}
        </div>

        <div style={overlayStyles.copy}>
          {pending ? (
            <>
              <span style={overlayStyles.titleSpinner}>Forging on {chainLabel}</span>
              <span style={overlayStyles.subtitle}>
                Waiting for confirmation<span className="nft-mint-dots" />
              </span>
              <span style={overlayStyles.hint}>Keep this window open вЂ” the tx is propagating.</span>
            </>
          ) : (
            <>
              <span style={overlayStyles.titleSuccess}>Mint Complete</span>
              <span style={overlayStyles.subtitleSuccess}>Demon King now lives on {chainLabel}.</span>
              {result?.tx && (
                <span style={overlayStyles.txChip}>tx В· {shortAddress(result.tx)}</span>
              )}
              <div style={overlayStyles.actionRow}>
                {result?.explorer && (
                  <a
                    href={result.explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={overlayStyles.linkBtn}
                  >
                    View on explorer
                  </a>
                )}
                <button type="button" style={overlayStyles.doneBtn} onClick={onDismiss}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ShopPurchaseOverlay({ status, result, onDismiss }) {
  const pending = status === 'pending';
  const success = status === 'success';
  const product = result?.product;
  const grant = result?.grant;
  const customIcon = product ? RESOURCE_PRODUCT_ICONS[product.id] : null;
  const isShield = product?.kind === 'shield';

  let successHeadline = 'Purchase Complete';
  let successDetail = null;
  if (success && product) {
    if (isShield) {
      const until = grant?.shield_until ? new Date(grant.shield_until + 'Z') : null;
      successHeadline = 'Shield Activated';
      successDetail = until
        ? `Base protected until ${until.toLocaleString()}`
        : `Your base is protected for ${product.durationHours || 24}h.`;
    } else if (grant?.resources) {
      const rewards = product.rewards || {};
      const parts = [];
      if (rewards.gold) parts.push(`+${rewards.gold.toLocaleString()} gold`);
      if (rewards.wood) parts.push(`+${rewards.wood.toLocaleString()} wood`);
      if (rewards.ore) parts.push(`+${rewards.ore.toLocaleString()} ore`);
      successHeadline = `${product.title} Delivered`;
      successDetail = parts.length ? parts.join('  ·  ') : 'Resources added to your stockpile.';
    } else {
      successHeadline = `${product.title} Purchased`;
      successDetail = 'The item is now active on your base.';
    }
  }

  return (
    <div style={overlayStyles.root}>
      <div style={overlayStyles.backdrop} className="nft-mint-backdrop" />

      {success && (
        <>
          <div style={overlayStyles.rays} className="nft-mint-rays" />
          <div style={overlayStyles.successHalo} className="nft-mint-halo" />
          {CONFETTI.map((bit, i) => (
            <span
              key={i}
              style={{
                ...overlayStyles.confetti,
                background: bit.hue,
                width: bit.size,
                height: bit.size,
                '--tx': `${bit.x}px`,
                '--ty': `${bit.y}px`,
                animationDelay: `${bit.delay}ms`,
              }}
              className="nft-mint-confetti"
            />
          ))}
        </>
      )}

      <div style={overlayStyles.content}>
        <div
          style={{
            ...overlayStyles.cardStage,
            ...(success ? overlayStyles.cardStageSuccess : null),
          }}
        >
          <div
            style={{ ...overlayStyles.card, ...overlayStyles.cardBare }}
            className={success ? 'nft-mint-card-spin-bare' : 'nft-mint-card-pulse-bare'}
          >
            {customIcon ? (
              <img src={customIcon} alt="" style={overlayStyles.cardImgBare} />
            ) : isShield ? (
              <div style={overlayStyles.cardGlyph}>
                <ShieldGlyph size={130} />
              </div>
            ) : (
              <div style={overlayStyles.cardGlyph}>
                <ResourceGlyph size={130} />
              </div>
            )}
          </div>

          {pending && (
            <>
              <div style={overlayStyles.ring} className="nft-mint-ring" />
              <div style={overlayStyles.ringInner} className="nft-mint-ring-inner" />
            </>
          )}
        </div>

        <div style={overlayStyles.copy}>
          {pending ? (
            <>
              <span style={overlayStyles.titleSpinner}>
                Buying {product?.title || 'item'}
              </span>
              <span style={overlayStyles.subtitle}>
                Confirm in wallet, then waiting for tx<span className="nft-mint-dots" />
              </span>
              <span style={overlayStyles.hint}>
                Keep this window open — paying with $CoP on Base.
              </span>
            </>
          ) : (
            <>
              <span style={overlayStyles.titleSuccess}>{successHeadline}</span>
              {successDetail && (
                <span style={overlayStyles.subtitleSuccess}>{successDetail}</span>
              )}
              {result?.tx && (
                <span style={overlayStyles.txChip}>tx · {shortAddress(result.tx)}</span>
              )}
              <div style={overlayStyles.actionRow}>
                {result?.tx && (
                  <a
                    href={`https://basescan.org/tx/${result.tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={overlayStyles.linkBtn}
                  >
                    View on BaseScan
                  </a>
                )}
                <button type="button" style={overlayStyles.doneBtn} onClick={onDismiss}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyles = {
  root: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    pointerEvents: 'auto',
    zIndex: 5,
  },
  backdrop: {
    position: 'absolute', inset: 0,
    background:
      'radial-gradient(circle at 50% 45%, rgba(255,228,160,0.85) 0%, rgba(253,248,231,0.92) 55%, rgba(212,200,176,0.96) 100%)',
  },
  rays: {
    position: 'absolute',
    width: 720, height: 720,
    background:
      'conic-gradient(from 0deg, rgba(255,217,120,0.55) 0deg 12deg, transparent 12deg 30deg, rgba(255,200,90,0.45) 30deg 42deg, transparent 42deg 60deg, rgba(255,217,120,0.55) 60deg 72deg, transparent 72deg 90deg, rgba(255,200,90,0.45) 90deg 102deg, transparent 102deg 120deg, rgba(255,217,120,0.55) 120deg 132deg, transparent 132deg 150deg, rgba(255,200,90,0.45) 150deg 162deg, transparent 162deg 180deg, rgba(255,217,120,0.55) 180deg 192deg, transparent 192deg 210deg, rgba(255,200,90,0.45) 210deg 222deg, transparent 222deg 240deg, rgba(255,217,120,0.55) 240deg 252deg, transparent 252deg 270deg, rgba(255,200,90,0.45) 270deg 282deg, transparent 282deg 300deg, rgba(255,217,120,0.55) 300deg 312deg, transparent 312deg 330deg, rgba(255,200,90,0.45) 330deg 342deg, transparent 342deg 360deg)',
    filter: 'blur(2px)',
    opacity: 0.85,
  },
  successHalo: {
    position: 'absolute',
    width: 360, height: 360,
    borderRadius: '50%',
    background:
      'radial-gradient(circle, rgba(255,235,150,0.95) 0%, rgba(255,210,90,0.55) 35%, rgba(255,210,90,0) 70%)',
    mixBlendMode: 'screen',
  },
  content: {
    position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 14,
    padding: '12px 18px',
    zIndex: 2,
  },
  cardStage: {
    position: 'relative',
    width: 168, height: 168,
    perspective: '900px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cardStageSuccess: {
    transform: 'scale(1.04)',
  },
  card: {
    position: 'relative',
    width: 140, height: 140,
    borderRadius: 18,
    border: '5px solid #d4c8b0',
    background: 'radial-gradient(circle at 50% 35%, #f3e6c4 0%, #d8c190 60%, #b89a64 100%)',
    boxShadow:
      'inset 0 4px 10px rgba(0,0,0,0.2), 0 12px 26px rgba(0,0,0,0.35), 0 0 32px rgba(255,210,90,0.5)',
    overflow: 'hidden',
    transformStyle: 'preserve-3d',
    willChange: 'transform',
  },
  cardImg: {
    width: '100%', height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))',
  },
  cardBare: {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    overflow: 'visible',
  },
  cardImgBare: {
    width: '120%', height: '120%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.55))',
  },
  cardGlyph: {
    width: '100%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))',
  },
  cardShine: {
    position: 'absolute',
    top: 0, left: '-60%',
    width: '50%', height: '100%',
    background:
      'linear-gradient(115deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0) 100%)',
    transform: 'skewX(-18deg)',
    pointerEvents: 'none',
  },
  ring: {
    position: 'absolute',
    width: 178, height: 178,
    borderRadius: '50%',
    border: '4px solid transparent',
    borderTopColor: '#5C3A21',
    borderRightColor: '#5C3A21',
    boxShadow: '0 0 18px rgba(92,58,33,0.35)',
  },
  ringInner: {
    position: 'absolute',
    width: 200, height: 200,
    borderRadius: '50%',
    border: '3px dashed rgba(92,58,33,0.35)',
    opacity: 0.7,
  },
  copy: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    textAlign: 'center',
    maxWidth: 360,
  },
  titleSpinner: {
    fontSize: 18, fontWeight: 900, color: '#5C3A21',
    textShadow: '0 1px 0 rgba(255,255,255,0.55)',
    letterSpacing: 0,
  },
  titleSuccess: {
    fontSize: 26, fontWeight: 900, color: '#5C3A21',
    textShadow: '0 2px 0 rgba(255,255,255,0.55), 0 0 14px rgba(255,210,90,0.7)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 13, fontWeight: 800, color: '#70522b',
  },
  subtitleSuccess: {
    fontSize: 13, fontWeight: 800, color: '#70522b',
  },
  hint: {
    fontSize: 11, fontWeight: 700, color: '#9b7c4a',
    marginTop: 2,
    maxWidth: 280,
  },
  txChip: {
    marginTop: 4,
    padding: '4px 10px',
    borderRadius: 9,
    background: '#fff6dc',
    border: '2px solid #d4c8b0',
    color: '#5C3A21',
    fontSize: 11, fontWeight: 900,
    letterSpacing: 0.5,
  },
  actionRow: {
    display: 'flex', gap: 8, marginTop: 10,
  },
  linkBtn: {
    padding: '8px 14px',
    borderRadius: 12,
    border: '3px solid #9f8759',
    background: '#fff6dc',
    color: '#5C3A21', fontSize: 12, fontWeight: 900,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  doneBtn: {
    padding: '8px 18px',
    borderRadius: 12,
    border: '3px solid #5C3A21',
    background: 'linear-gradient(180deg, #ffd76a 0%, #c2851b 100%)',
    color: '#3a1f00', fontSize: 13, fontWeight: 900,
    cursor: 'pointer',
    textShadow: '0 1px 0 rgba(255,255,255,0.5)',
    boxShadow: '0 4px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  confetti: {
    position: 'absolute',
    top: '50%', left: '50%',
    borderRadius: 3,
    transform: 'translate(-50%, -50%)',
    boxShadow: '0 0 6px rgba(0,0,0,0.25)',
    opacity: 0,
    zIndex: 3,
  },
};

const MINT_ANIM_CSS = `
  @keyframes nft-mint-backdrop-sheen {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.05); }
  }
  .nft-mint-backdrop { animation: nft-mint-backdrop-sheen 3.4s ease-in-out infinite; }

  @keyframes nft-mint-card-pulse {
    0%, 100% { transform: scale(1) rotateY(0deg); box-shadow: inset 0 4px 10px rgba(0,0,0,0.2), 0 12px 26px rgba(0,0,0,0.35), 0 0 22px rgba(255,210,90,0.45); }
    50%      { transform: scale(1.04) rotateY(6deg); box-shadow: inset 0 4px 10px rgba(0,0,0,0.2), 0 12px 26px rgba(0,0,0,0.4), 0 0 36px rgba(255,210,90,0.7); }
  }
  .nft-mint-card-pulse { animation: nft-mint-card-pulse 1.9s ease-in-out infinite; }

  @keyframes nft-mint-ring-spin { to { transform: rotate(360deg); } }
  .nft-mint-ring { animation: nft-mint-ring-spin 1.2s linear infinite; }
  .nft-mint-ring-inner { animation: nft-mint-ring-spin 4.2s linear infinite reverse; }

  @keyframes nft-mint-dots {
    0%   { content: ''; }
    25%  { content: '.'; }
    50%  { content: '..'; }
    75%  { content: '...'; }
    100% { content: ''; }
  }
  .nft-mint-dots::after { content: ''; display: inline-block; min-width: 18px; text-align: left; animation: nft-mint-dots 1.4s steps(4, end) infinite; }

  /* Success: card flips and lands with a small bounce, then keeps a slow
     idle hover so it doesn't feel frozen. */
  @keyframes nft-mint-card-spin {
    0%   { transform: rotateY(0deg)   scale(1); }
    35%  { transform: rotateY(540deg) scale(1.1); }
    55%  { transform: rotateY(720deg) scale(0.96); }
    75%  { transform: rotateY(720deg) scale(1.04); }
    100% { transform: rotateY(720deg) scale(1); }
  }
  .nft-mint-card-spin {
    animation:
      nft-mint-card-spin 1.4s cubic-bezier(0.22, 1.1, 0.36, 1) 1 forwards,
      nft-mint-card-pulse 3.6s ease-in-out 1.4s infinite;
  }

  /* Bare variants for the shop overlay — transform only, no card chrome
     (background / border / box-shadow) baked into the animation, so the
     icon floats freely without the golden frame the NFT card uses. */
  /* Shop loading skeleton — moves a soft highlight across the placeholder
     blocks so the user sees the panel is alive, not stalled. Used while
     /api/shop/config is in flight (initial mount, before products land). */
  @keyframes nft-shop-shimmer {
    0%   { background-position: -150% 0; }
    100% { background-position: 250% 0; }
  }
  .nft-shop-shimmer {
    background-image: linear-gradient(
      90deg,
      rgba(212, 200, 176, 0.55) 0%,
      rgba(255, 248, 223, 0.95) 50%,
      rgba(212, 200, 176, 0.55) 100%
    );
    background-size: 200% 100%;
    animation: nft-shop-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes nft-mint-bare-pulse {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.06); }
  }
  .nft-mint-bare-pulse { animation: nft-mint-bare-pulse 1.9s ease-in-out infinite; }

  @keyframes nft-mint-bare-spin {
    0%   { transform: scale(1); }
    35%  { transform: scale(1.18) rotate(8deg); }
    65%  { transform: scale(0.96) rotate(-4deg); }
    100% { transform: scale(1); }
  }
  .nft-mint-bare-spin {
    animation:
      nft-mint-bare-spin 1.0s cubic-bezier(0.22, 1.1, 0.36, 1) 1 forwards,
      nft-mint-bare-pulse 3.2s ease-in-out 1.0s infinite;
  }

  /* Light sheen that wipes across the card right after the flip lands. */
  @keyframes nft-mint-card-shine {
    0%   { left: -60%; opacity: 0; }
    25%  { opacity: 0.9; }
    100% { left: 110%; opacity: 0; }
  }
  .nft-mint-card-shine { animation: nft-mint-card-shine 1.6s ease-out 1.0s 1 forwards; }

  /* Sunburst behind the card slowly rotates and breathes. */
  @keyframes nft-mint-rays-spin { to { transform: rotate(360deg); } }
  @keyframes nft-mint-rays-glow { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.95; } }
  .nft-mint-rays {
    animation:
      nft-mint-rays-spin 14s linear infinite,
      nft-mint-rays-glow 3.2s ease-in-out infinite;
  }

  @keyframes nft-mint-halo-pulse {
    0%, 100% { transform: scale(1); opacity: 0.85; }
    50%      { transform: scale(1.12); opacity: 1; }
  }
  .nft-mint-halo { animation: nft-mint-halo-pulse 2.4s ease-in-out infinite; }

  /* Confetti shards fly out from centre with a small downward tail. */
  @keyframes nft-mint-confetti-fly {
    0%   { transform: translate(-50%, -50%) scale(0.4) rotate(0deg);                    opacity: 0; }
    10%  { opacity: 1; }
    100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1) rotate(540deg); opacity: 0; }
  }
  .nft-mint-confetti { animation: nft-mint-confetti-fly 1.6s cubic-bezier(0.22, 0.8, 0.4, 1) forwards; }

  /* Bare variants — same motion as the framed card animations but without the
     glowing brown box-shadow keyframes that would otherwise re-introduce the
     card frame on the shop purchase overlay (which renders just an icon). */
  @keyframes nft-mint-card-pulse-bare {
    0%, 100% { transform: scale(1) rotateY(0deg); }
    50%      { transform: scale(1.04) rotateY(6deg); }
  }
  .nft-mint-card-pulse-bare { animation: nft-mint-card-pulse-bare 1.9s ease-in-out infinite; }

  @keyframes nft-mint-card-spin-bare {
    0%   { transform: rotateY(0deg)   scale(1); }
    35%  { transform: rotateY(540deg) scale(1.1); }
    55%  { transform: rotateY(720deg) scale(0.96); }
    75%  { transform: rotateY(720deg) scale(1.04); }
    100% { transform: rotateY(720deg) scale(1); }
  }
  .nft-mint-card-spin-bare {
    animation:
      nft-mint-card-spin-bare 1.4s cubic-bezier(0.22, 1.1, 0.36, 1) 1 forwards,
      nft-mint-card-pulse-bare 3.6s ease-in-out 1.4s infinite;
  }

  /* Chain-card halo: thin ring made by a rotating conic-gradient that
     extends past the card so corners stay smooth. Wrapper crops it with
     overflow:hidden + matching border-radius, inner button covers the
     centre so only the ring shows. Per-chain colour variants below. */
  .nft-chain-glow {
    position: relative;
    border-radius: 12px;
    padding: 2px;
    overflow: hidden;
    box-shadow: 0 3px 9px rgba(0,0,0,0.16);
  }
  .nft-chain-glow::before {
    content: '';
    position: absolute;
    inset: -60%;
    z-index: 0;
    pointer-events: none;
    animation: nft-chain-glow-spin 9s linear infinite;
  }
  .nft-chain-glow > * {
    position: relative;
    z-index: 1;
  }
  @keyframes nft-chain-glow-spin { to { transform: rotate(360deg); } }

  /* Base brand blue, dimmed a notch so the ring sits on cream cards
     without glowing too hot. */
  .nft-chain-glow-base::before {
    background: conic-gradient(
      from 0deg,
      rgba(0,48,160,0) 0deg,
      rgba(0,48,160,0.95) 70deg,
      rgba(40,100,210,1) 90deg,
      rgba(0,48,160,0.95) 110deg,
      rgba(0,48,160,0) 180deg,
      rgba(0,48,160,0.85) 250deg,
      rgba(40,100,210,1) 270deg,
      rgba(0,48,160,0.85) 290deg,
      rgba(0,48,160,0) 360deg
    );
  }

  /* Solana's brand gradient pushed darker (deeper purple в†’ forest green)
     so the ring reads as branded rather than neon. */
  .nft-chain-glow-solana::before {
    background: conic-gradient(
      from 0deg,
      rgba(108,40,200,0) 0deg,
      rgba(108,40,200,1) 60deg,
      rgba(20,170,110,1) 130deg,
      rgba(108,40,200,0) 200deg,
      rgba(108,40,200,1) 260deg,
      rgba(20,170,110,1) 320deg,
      rgba(108,40,200,0) 360deg
    );
  }

  /* ── Parchment scrollbar — shared with the rest of the shop UI ──
     Used on the tab slides + any scrollable container in the marketplace.
     Slim, brown-on-cream, matches the borders/buttons rather than the
     OS default. WebKit (Chrome/Safari/Edge) styles via these rules;
     Firefox uses scrollbar-width/-color set inline on the elements. */
  .shop-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
  .shop-scroll::-webkit-scrollbar-track {
    background: #fdf8e7;
    border-radius: 4px;
  }
  .shop-scroll::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #d4c8b0 0%, #bba882 100%);
    border-radius: 4px;
    border: 1px solid #fdf8e7;
  }
  .shop-scroll::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, #bba882 0%, #a3906a 100%);
  }
  .shop-scroll::-webkit-scrollbar-corner { background: transparent; }
  /* Windows Chrome/Edge render up/down increment buttons on the track
     by default — they break the soft parchment look. Hide them so the
     scrollbar is just track + thumb. `display: none` collapses both
     single and double-button variants. */
  .shop-scroll::-webkit-scrollbar-button,
  .shop-scroll::-webkit-scrollbar-button:start,
  .shop-scroll::-webkit-scrollbar-button:end,
  .shop-scroll::-webkit-scrollbar-button:vertical:start,
  .shop-scroll::-webkit-scrollbar-button:vertical:end,
  .shop-scroll::-webkit-scrollbar-button:horizontal:start,
  .shop-scroll::-webkit-scrollbar-button:horizontal:end {
    display: none;
    height: 0;
    width: 0;
  }
`;

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 250, pointerEvents: 'all',
    padding: 12,
  },
  panel: {
    width: 500, maxWidth: '96vw',
    // Stable height — sized to comfortably fit the NFT tab (the shortest
    // of the three) with a small margin, so neither does the panel jerk
    // between tabs nor look half-empty on NFT. Taller tabs (marketplace
    // listings) scroll inside their own slide instead of growing the
    // panel. Capped at 92vh for short viewports.
    height: 'min(600px, 92vh)',
    background: '#fdf8e7',
    border: '6px solid #d4c8b0', borderRadius: 22,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
    display: 'flex', flexDirection: 'column',
    // Required so the absolute-positioned MintProgressOverlay covers the
    // whole panel including the header without leaking outside the rounded
    // border. Combined with `overflow: hidden` above the rounded corners
    // clip the animations cleanly.
    position: 'relative',
  },
  header: {
    display: 'grid', gridTemplateColumns: '34px 1fr 34px', alignItems: 'center',
    padding: '12px 14px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
    flex: '0 0 auto',
  },
  headerSpacer: { width: 34, height: 34 },
  title: {
    fontSize: 20, fontWeight: 900, color: '#5C3A21',
    letterSpacing: 0, textAlign: 'center',
    textShadow: '0 1px 0 rgba(255,255,255,0.4)',
  },
  backBtn: {
    width: 32, height: 32, borderRadius: 12, background: '#fff6dc',
    border: '3px solid #9f8759', color: '#5C3A21', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: '50%', background: '#E53935',
    border: '3px solid #fff', color: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  bridgeBtn: {
    width: 32, height: 32, borderRadius: 12, background: '#fff6dc',
    border: '3px solid #9f8759', color: '#5C3A21', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
  },
  // Bridge entry button rendered inside the hero summary row — small pill
  // with icon + "Bridge" label. Sits right under the "Genesis supply 500"
  // chip so it's visually grouped with the NFT preview, not the modal chrome.
  heroBridgeBtn: {
    alignSelf: 'flex-start',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    marginTop: 4, padding: '5px 10px',
    borderRadius: 999, background: '#fff6dc',
    border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer', fontSize: 12, fontWeight: 700,
    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
  },
  body: {
    flex: 1, minHeight: 0,
    padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
    // The slider viewport handles overflow internally so each slide can
    // scroll independently — the body itself never scrolls.
    overflow: 'hidden',
  },
  // ── Tab slider ────────────────────────────────────────────────────
  // Viewport clips the wider track; the track holds all three slides
  // side-by-side and translates between them. Each slide scrolls its
  // own content vertically so the modal height stays constant.
  sliderViewport: {
    flex: 1, minHeight: 0,
    overflow: 'hidden',
    // Negative side margin cancels the body's 16px horizontal padding so
    // slides reach the panel edges; each slide adds the padding back via
    // its own paddingLeft/Right. This keeps the carousel motion edge-to-
    // edge instead of a narrow strip in the middle.
    margin: '0 -16px',
  },
  sliderTrack: {
    display: 'flex',
    width: '100%', height: '100%',
    transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
    willChange: 'transform',
  },
  slide: {
    flex: '0 0 100%',
    minWidth: 0,
    height: '100%',
    overflowY: 'auto',
    padding: '0 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
    // Firefox-specific scrollbar tint — thumb/track colors. WebKit-based
    // browsers pick up the `.shop-scroll::-webkit-scrollbar*` rules in
    // MINT_ANIM_CSS so they match the parchment palette across engines.
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fdf8e7',
  },
  // ── Marketplace "coming soon" overlay ─────────────────────────────
  // Fixed (relative to the slide) dim layer that covers the entire
  // marketplace preview while we finish mainnet testing. Catches all
  // pointer events so the underlying form is non-interactive even
  // though it stays visible behind the dim wash.
  comingSoonOverlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(20, 12, 4, 0.62)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: '20px 28px',
    textAlign: 'center',
    pointerEvents: 'auto',
    zIndex: 5,
  },
  comingSoonBadge: {
    padding: '5px 12px', borderRadius: 999,
    background: 'linear-gradient(180deg, #ffd76a 0%, #c2851b 100%)',
    border: '2px solid #5C3A21', color: '#3a1f00',
    fontSize: 11, fontWeight: 900, letterSpacing: 1.2,
    boxShadow: '0 4px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  comingSoonTitle: {
    color: '#fff7df', fontSize: 22, fontWeight: 900,
    textShadow: '0 2px 6px rgba(0,0,0,0.6)',
    lineHeight: 1.1,
  },
  comingSoonSub: {
    color: 'rgba(255,247,223,0.85)', fontSize: 13, fontWeight: 700,
    maxWidth: 320, lineHeight: 1.45,
    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
  },
  shopTabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
    padding: 4,
    borderRadius: 12,
    background: '#e8dfc8',
    border: '2px solid #d4c8b0',
  },
  shopTabBtn: {
    minHeight: 34,
    minWidth: 0,
    padding: '0 6px',
    border: '2px solid transparent',
    borderRadius: 9,
    background: 'transparent',
    color: '#77573d',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'center',
  },
  shopTabBtnActive: {
    background: '#fff8df',
    border: '2px solid #bba882',
    color: '#5C3A21',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.12)',
  },
  topRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: 12,
    alignItems: 'center',
  },
  topRowResources: {
    display: 'flex',
    gridTemplateColumns: 'unset',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  heroFrame: {
    position: 'relative',
    width: 120, height: 120,
    borderRadius: 18,
    background: 'radial-gradient(circle at 50% 35%, #f3e6c4 0%, #d8c190 60%, #b89a64 100%)',
    border: '5px solid #d4c8b0',
    boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.18), 0 8px 18px rgba(0,0,0,0.28)',
    overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  heroGlow: {
    position: 'absolute', inset: -4,
    background: 'radial-gradient(circle at 50% 40%, rgba(255,225,140,0.55) 0%, rgba(255,225,140,0) 60%)',
    pointerEvents: 'none',
  },
  heroImg: {
    position: 'relative',
    width: '100%', height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))',
  },
  summary: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  heroName: {
    fontSize: 22, fontWeight: 900, color: '#5C3A21',
    letterSpacing: 0,
    lineHeight: 1,
  },
  editionTag: {
    fontSize: 11, fontWeight: 900, color: '#8b6b3f',
    textTransform: 'uppercase', letterSpacing: 0,
  },
  contextChip: {
    alignSelf: 'flex-start',
    padding: '4px 8px',
    borderRadius: 8,
    background: '#e8dfc8',
    border: '2px solid #d4c8b0',
    color: '#70522b',
    fontSize: 10,
    fontWeight: 900,
  },
  // Wrapper that pairs the chain-switcher pill with a separate
  // disconnect button so each interactive zone has a single, obvious
  // action (no overloaded "click on the chip means two things").
  chainChipGroup: {
    alignSelf: 'flex-start',
    display: 'inline-flex', alignItems: 'stretch', gap: 4,
  },
  // Compact chip that doubles as a chain switcher on the payment step.
  // Visually echoes the chain badge from CHAIN_OPTIONS so the user reads
  // it as "currently minting on <chain>, click to change".
  chainChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 8px 4px 4px',
    borderRadius: 9,
    background: 'linear-gradient(180deg, #fff6dc 0%, #ead9b2 100%)',
    border: '2px solid #d4c8b0',
    color: '#5C3A21',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.12)',
    transition: 'filter 0.12s',
  },
  chainChipBadge: {
    background: '#5C3A21',
    color: '#fff7df',
    fontSize: 9, fontWeight: 900,
    padding: '2px 6px',
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  chainChipName: {
    fontSize: 12, fontWeight: 900,
    letterSpacing: 0.3,
  },
  chainChipArrow: {
    fontSize: 10,
    color: '#9b7c4a',
    lineHeight: 1,
    marginLeft: 2,
  },
  chainChipDisconnect: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 26, padding: 0,
    borderRadius: 9,
    background: '#fff6dc',
    border: '2px solid #d4c8b0',
    color: '#5C3A21',
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.12)',
    transition: 'filter 0.12s, background 0.12s',
  },
  // Chain + payment toggles for the Game Resources tab.
  shopChainRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
    marginBottom: 10,
  },
  shopChainBtn: {
    minHeight: 42,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    border: '2px solid #d4c8b0',
    borderRadius: 11,
    background: '#fff8df',
    color: '#77573d',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '4px 8px',
  },
  shopChainBtnActive: {
    border: '2px solid #8c6a3c',
    background: 'linear-gradient(180deg, #fff6dc 0%, #d7c69f 100%)',
    color: '#5C3A21',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.55), 0 2px 4px rgba(0,0,0,0.18)',
  },
  shopChainLabel: {
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.3,
  },
  shopChainSub: {
    fontSize: 10,
    fontWeight: 800,
    opacity: 0.75,
  },
  shopPaymentRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
    marginBottom: 10,
  },
  shopPaymentBtn: {
    minHeight: 36,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #c2ae83',
    borderRadius: 9,
    background: '#fff',
    color: '#77573d',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '2px 6px',
  },
  shopPaymentBtnActive: {
    border: '2px solid #1d6fe0',
    background: 'linear-gradient(180deg, #e8f1ff 0%, #c5dbff 100%)',
    color: '#0e3a72',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.12)',
  },
  shopPaymentLabel: {
    fontSize: 12,
    fontWeight: 900,
  },
  shopPaymentSub: {
    fontSize: 9,
    fontWeight: 800,
    opacity: 0.7,
  },
  resourceGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 9,
  },
  resourceCard: {
    display: 'grid',
    gridTemplateColumns: '92px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 10,
    border: '3px solid #d4c8b0',
    borderRadius: 13,
    background: 'linear-gradient(180deg, #fff8df 0%, #ead9b2 100%)',
    padding: 10,
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.55), 0 4px 10px rgba(0,0,0,0.12)',
  },
  // Mobile: icon + text on one row, full-width button on a row below. The
  // 3-column desktop layout collapses to 2 columns + a wrapping button so
  // the title doesn't fall to four lines on a 360-wide phone.
  resourceCardMobile: {
    gridTemplateColumns: '72px minmax(0, 1fr)',
    gridTemplateAreas: '"icon info" "btn btn"',
    rowGap: 10,
    columnGap: 10,
    padding: 12,
  },
  resourceIconWrap: {
    width: 92,
    height: 92,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceIconWrapMobile: {
    width: 72,
    height: 72,
    gridArea: 'icon',
  },
  resourceSkeletonBlock: {
    width: '80%',
    height: '80%',
    borderRadius: 12,
    background: 'rgba(212, 200, 176, 0.55)',
  },
  resourceSkeletonLine: {
    height: 12,
    borderRadius: 6,
    background: 'rgba(212, 200, 176, 0.55)',
    marginBottom: 4,
  },
  resourceIconImg: {
    width: '128%',
    height: '128%',
    objectFit: 'contain',
    display: 'block',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.25))',
  },
  resourceInfo: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  resourceInfoMobile: {
    gridArea: 'info',
  },
  resourceTitle: {
    color: '#5C3A21',
    fontSize: 14,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  resourceSubtitle: {
    color: '#77573d',
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.2,
  },
  resourceMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 3,
  },
  resourcePrice: {
    color: '#1f6d34',
    fontSize: 12,
    fontWeight: 900,
  },
  resourceMeta: {
    padding: '2px 6px',
    borderRadius: 7,
    background: '#e8dfc8',
    color: '#6b502d',
    fontSize: 10,
    fontWeight: 900,
  },
  resourceBuyBtn: {
    minWidth: 104,
    minHeight: 38,
    borderRadius: 11,
    border: '3px solid #9f8759',
    background: 'linear-gradient(180deg, #fff6dc 0%, #d7c69f 100%)',
    color: '#5C3A21',
    fontSize: 11,
    fontWeight: 900,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 8px rgba(0,0,0,0.18), inset 0 2px 0 rgba(255,255,255,0.5)',
  },
  resourceBuyBtnMobile: {
    width: '100%',
    minWidth: 0,
    minHeight: 42,
    fontSize: 13,
    gridArea: 'btn',
    padding: '0 12px',
  },
  resourceBuyBtnReady: {
    border: '3px solid #1f6d34',
    background: 'linear-gradient(180deg, #87d95f 0%, #3d9b42 100%)',
    color: '#fff',
    textShadow: '0 1px 1px rgba(0,0,0,0.35)',
  },
  resourceBuyBtnDisabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
    filter: 'grayscale(0.35)',
  },
  supplyBox: {
    border: '3px solid #d4c8b0',
    borderRadius: 13,
    background: 'linear-gradient(180deg, #fff8df 0%, #ead9b2 100%)',
    padding: '10px 11px',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.55), 0 4px 10px rgba(0,0,0,0.12)',
  },
  supplyTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  supplyTitle: {
    minWidth: 0,
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  supplyRemaining: {
    flex: '0 0 auto',
    borderRadius: 10,
    background: '#5C3A21',
    color: '#fff7df',
    padding: '4px 8px',
    fontSize: 11,
    fontWeight: 900,
  },
  progressTrack: {
    position: 'relative',
    height: 16,
    borderRadius: 9,
    border: '2px solid #9f8759',
    background: '#d7c69f',
    overflow: 'hidden',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.25)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 7,
    background: 'linear-gradient(90deg, #4aa64f 0%, #f5cf57 58%, #f2a72b 100%)',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.4), 0 0 8px rgba(245,207,87,0.55)',
    transition: 'width 280ms ease',
  },
  supplyMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 7,
    color: '#7a5b31',
    fontSize: 11,
    fontWeight: 900,
  },
  supplyOverview: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 128px minmax(0, 1fr)',
    alignItems: 'center',
    gap: 8,
    border: '3px solid #d4c8b0',
    borderRadius: 13,
    background: 'linear-gradient(180deg, #fff8df 0%, #ead9b2 100%)',
    padding: '10px 11px',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.55), 0 4px 10px rgba(0,0,0,0.12)',
  },
  chainSupplySide: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    color: '#5C3A21',
  },
  chainSupplyLabel: {
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
    color: '#8b6b3f',
  },
  chainSupplyValue: {
    fontSize: 15,
    fontWeight: 900,
    lineHeight: 1,
  },
  chainSupplyMeta: {
    fontSize: 10,
    fontWeight: 900,
    color: '#8b6b3f',
  },
  totalSupply: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 8px',
    borderRadius: 12,
    background: '#5C3A21',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.18), 0 3px 8px rgba(0,0,0,0.18)',
    color: '#fff7df',
  },
  totalSupplyLabel: {
    fontSize: 9,
    fontWeight: 900,
    textTransform: 'uppercase',
    color: '#f5cf57',
  },
  totalSupplyValue: {
    fontSize: 32,
    lineHeight: 0.95,
    fontWeight: 900,
    letterSpacing: 0,
    textShadow: '0 2px 0 rgba(0,0,0,0.25)',
  },
  totalSupplyMeta: {
    fontSize: 10,
    fontWeight: 900,
    color: '#f8e1a0',
  },
  // Promotional banner highlighting the CoP-token discount. Sits
  // between the supply box and the chain picker so the saving is the
  // first thing the user reads when deciding which network to mint on.
  clashBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 12px',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #fff2c2 0%, #ffd76a 50%, #f0a335 100%)',
    border: '3px solid #c2851b',
    boxShadow: '0 6px 14px rgba(194,133,27,0.28), inset 0 1px 0 rgba(255,255,255,0.5)',
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
  clashBannerLogo: {
    flex: '0 0 auto',
    width: 42,
    height: 42,
    borderRadius: '50%',
    overflow: 'hidden',
    background: '#1f1b16',
    border: '3px solid #fff2c2',
    boxShadow: '0 3px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.25)',
  },
  clashBannerLogoImg: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  clashBannerCopy: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  clashBannerTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: '#3a1f00',
    letterSpacing: 0.2,
    textShadow: '0 1px 0 rgba(255,255,255,0.4)',
  },
  clashBannerSub: {
    fontSize: 11,
    fontWeight: 800,
    color: '#5C3A21',
  },
  clashBannerSubAccent: {
    color: '#1B5E20',
    fontWeight: 900,
  },
  // Small section heading used above the chain grid (and reusable for
  // any future "pick something" rows). Matches the brown medieval tone
  // and stays restrained so it doesn't compete with the cards.
  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
    padding: '0 2px',
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: 900,
    color: '#5C3A21',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionHeaderHint: {
    fontSize: 10,
    fontWeight: 800,
    color: '#9b7c4a',
    letterSpacing: 0.3,
  },
  chainGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
  },
  chainBtn: {
    width: '100%',
    border: 'none',
    borderRadius: 9,
    // Same parchment colour as the panel so the inner card visually
    // melts into the background вЂ” only the rotating gradient ring
    // remains visible. Padding is dialled down so the ring hugs the
    // text instead of framing a tall empty block.
    background: '#fdf8e7',
    padding: '8px 12px',
    color: '#5C3A21',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 2,
    textAlign: 'left',
  },
  chainBtnActive: {
    border: '3px solid #c2851b',
    background: '#fff1c4',
  },
  chainBadge: {
    justifySelf: 'start',
    padding: '5px 8px',
    borderRadius: 9,
    background: '#5C3A21',
    color: '#fff7df',
    fontSize: 10,
    fontWeight: 900,
  },
  chainTitle: {
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: 0,
    lineHeight: 1,
  },
  chainSubtitle: {
    fontSize: 11,
    fontWeight: 900,
    color: '#8b6b3f',
    letterSpacing: 0.3,
  },
  chainReady: {
    fontSize: 11,
    fontWeight: 900,
    color: '#2e7d32',
  },
  chainConnect: {
    fontSize: 11,
    fontWeight: 900,
    color: '#9a6a18',
  },
  selectedChainBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    background: '#efe6d0',
    padding: '8px 10px',
  },
  selectedChainText: {
    color: '#5C3A21',
    fontSize: 15,
    fontWeight: 900,
  },
  changeBtn: {
    border: '2px solid #9f8759',
    borderRadius: 9,
    background: '#fffaf0',
    color: '#5C3A21',
    fontSize: 11,
    fontWeight: 900,
    padding: '5px 8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  walletGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 8,
  },
  walletStatus: {
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '7px 10px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  walletInfo: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  walletReady: { background: '#e5f4d8', border: '3px solid #7db85a' },
  walletWarn: { background: '#fff1cc', border: '3px solid #d9a928' },
  walletIdle: { background: '#efe6d0' },
  walletLabel: {
    fontSize: 10,
    color: '#8b6b3f',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  walletValue: {
    fontSize: 14,
    color: '#5C3A21',
    fontWeight: 900,
    lineHeight: 1,
  },
  walletHint: {
    fontSize: 10,
    color: '#8b6b3f',
    fontWeight: 800,
  },
  walletDisconnectBtn: {
    flex: '0 0 auto',
    width: 30, height: 30,
    borderRadius: 9,
    background: '#fff6dc',
    border: '2px solid #9f8759',
    color: '#5C3A21',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
    transition: 'filter 0.12s, background 0.12s',
  },
  options: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  optionBtn: {
    position: 'relative',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    background: '#fffaf0',
    padding: '10px',
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gridTemplateRows: 'auto auto',
    columnGap: 8,
    rowGap: 3,
    alignItems: 'center',
    color: '#5C3A21',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    minHeight: 66,
  },
  optionBtnActive: {
    border: '3px solid #c2851b',
    background: '#fff1c4',
    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.65)',
  },
  optionBtnDisabled: {
    opacity: 0.68,
    cursor: 'not-allowed',
  },
  optionBadge: {
    gridRow: '1 / span 2',
    minWidth: 54,
    padding: '5px 6px',
    borderRadius: 8,
    background: '#5C3A21',
    color: '#fff7df',
    fontSize: 10,
    fontWeight: 900,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  // Small green chip pinned next to the CoP option label to mark the
  // discount inline. Matches the green PnL/savings tone used elsewhere
  // (e.g. clashBannerSubAccent) so the savings cue is consistent.
  optionDiscountChip: {
    display: 'inline-block',
    marginLeft: 6,
    padding: '1px 6px',
    borderRadius: 6,
    background: '#1B5E20',
    color: '#fff7df',
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 0.4,
    verticalAlign: '1px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
  },
  optionMain: {
    minWidth: 0,
    fontSize: 15,
    fontWeight: 900,
    lineHeight: 1,
  },
  optionPrice: {
    fontSize: 12,
    fontWeight: 900,
    color: '#2e7d32',
  },
  soonBadge: {
    position: 'absolute',
    top: 6,
    right: 7,
    borderRadius: 8,
    background: '#5C3A21',
    color: '#fff7df',
    padding: '3px 6px',
    fontSize: 9,
    fontWeight: 900,
  },
  mintBtn: {
    width: '100%',
    padding: '13px',
    background: 'linear-gradient(180deg, #ffd76a 0%, #c2851b 100%)',
    border: '3px solid #5C3A21',
    borderRadius: 14,
    color: '#3a1f00',
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0,
    textShadow: '0 1px 0 rgba(255,255,255,0.5)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    fontFamily: 'inherit',
  },
  mintBtnReady: {
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    color: '#12330f',
  },
  mintBtnDisabled: {
    opacity: 0.7,
  },
  mintBtnGlyph: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.45)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 900,
  },
  notice: {
    borderRadius: 10,
    border: '2px solid #d4c8b0',
    background: '#fff5d6',
    color: '#6b4f25',
    fontSize: 12,
    fontWeight: 800,
    padding: '8px 10px',
    textAlign: 'center',
  },
  noticeReady: {
    borderRadius: 10,
    border: '2px solid #7db85a',
    background: '#e5f4d8',
    color: '#2c6b25',
    fontSize: 12,
    fontWeight: 900,
    padding: '8px 10px',
    textAlign: 'center',
  },
};

export default memo(NftMintPanel);
