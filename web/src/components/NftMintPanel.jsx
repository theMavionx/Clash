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
import { BASE_CHAIN_ID, ensureBaseChain } from '../lib/avantisContract';
import { fetchGameShopConfig, buyGameShopItem } from '../lib/gameShop';
import { flyResourcesToBars } from '../lib/resourceFlyFx';
import { fetchNftMintConfig, mintBaseNft, mintSolanaNft } from '../lib/nftMint';
import { openSolanaWallet } from '../lib/solanaWalletUi';
import { addClientBreadcrumb } from '../lib/clientLogger';

const demonKingImg = '/api/nft/image';
const copLogoImg = '/icons/icon-192.png';
const nftBasePublicClient = createPublicClient({ chain: base, transport: http() });

const SHOP_TABS = [
  { id: 'nft', label: 'NFT' },
  { id: 'resources', label: 'Game Resources' },
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

function recommendedChain(dex) {
  return dex === 'pacifica' || dex === 'phoenix' ? 'solana' : 'base';
}

function defaultPaymentForChain(chain) {
  return chain === 'solana' ? 'sol-usdc' : 'base-eth';
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

function getTotalSupplyInfo(baseSupply, solanaSupply) {
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

function NftMintPanel({ onClose }) {
  const { dex } = useDex();
  const player = usePlayer();
  const tradingEvmWallet = useEvmWallet();
  const solWallet = useSolWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const { isInFrame } = useFarcaster();

  const [activeShopTab, setActiveShopTab] = useState('nft');
  const [step, setStep] = useState('chain');
  const [selectedChain, setSelectedChain] = useState(() => recommendedChain(dex));
  const [selectedPayment, setSelectedPayment] = useState(() => defaultPaymentForChain(recommendedChain(dex)));
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
  const gameShopReady = !!gameShopConfig?.base?.shop && !!gameShopConfig?.base?.copReady && !!gameShopConfig?.base?.saleActive;
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
    () => getTotalSupplyInfo(baseSupplyInfo, solanaSupplyInfo),
    [baseSupplyInfo, solanaSupplyInfo],
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

  useEffect(() => {
    if (step !== 'chain') return;
    const nextChain = recommendedChain(dex);
    setSelectedChain(nextChain);
    setSelectedPayment(defaultPaymentForChain(nextChain));
  }, [dex, step]);

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
    if (selected.chain === 'base') {
      handleBaseReady();
    } else {
      handleSolanaReady();
    }
  }, [dex, evmAddress, evmOnBase, evmWallet, handleBaseReady, handleSolanaReady, mintConfig?.solana, refreshMintConfig, selected, solAddress, solWallet]);

  const handleBuyGameProduct = useCallback(async (product) => {
    if (!sessionToken) {
      setNotice('Game account is still loading. Try again in a moment.');
      return;
    }
    if (!gameShopReady) {
      setNotice('CoP game shop is not live yet.');
      return;
    }
    if (!evmAddress || !evmOnBase) {
      await handleBaseReady();
      return;
    }

    setBusy(`shop:${product.id}`);
    setNotice(null);
    setShopPurchaseStatus('pending');
    setShopPurchaseResult({ product });
    try {
      const result = await buyGameShopItem({
        evmWallet,
        buyer: evmAddress,
        token: sessionToken,
        sku: product.sku,
        quantity: 1,
      });
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
      setShopPurchaseResult({ product, grant, tx: result.hash, flyRewards });
      setShopPurchaseStatus('success');
      addClientBreadcrumb('shop.purchase_success', {
        dex,
        sku: product.sku,
        tx: result.hash,
      });
      void refreshGameShopConfig({ log: false });
    } catch (err) {
      const message = err?.shortMessage || err?.message || 'Purchase failed';
      setShopPurchaseStatus('idle');
      setShopPurchaseResult(null);
      setNotice(message.slice(0, 160));
      addClientBreadcrumb('shop.purchase_failed', { dex, sku: product.sku, message }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [dex, evmAddress, evmOnBase, evmWallet, gameShopReady, handleBaseReady, refreshGameShopConfig, sessionToken]);

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
            {activeShopTab === 'nft' && step === 'payment' ? (
              <button style={styles.backBtn} onClick={handleBackToChains} aria-label="Back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                  <path d="M15 18 9 12l6-6" />
                </svg>
              </button>
            ) : <span style={styles.headerSpacer} />}
            <span style={styles.title}>Battle Shop</span>
            <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={styles.body}>
            <div style={styles.shopTabs}>
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
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                ...styles.topRow,
                ...(activeShopTab === 'resources' ? styles.topRowResources : null),
              }}
            >
              {activeShopTab === 'nft' && (
                <div style={styles.heroFrame}>
                  <div style={styles.heroGlow} />
                  <img src={demonKingImg} alt="Demon King" style={styles.heroImg} />
                </div>
              )}

              <div style={styles.summary}>
                <span style={styles.heroName}>{activeShopTab === 'nft' ? 'Demon King' : 'Game Resources'}</span>
                <span style={styles.editionTag}>
                  {activeShopTab === 'nft'
                    ? `Genesis supply ${formatCount(step === 'chain' ? totalSupplyInfo.maxSupply : supplyInfo.maxSupply)}`
                    : 'Pay with CoP on Base'}
                </span>
                {activeShopTab === 'resources' ? null
                  : step === 'payment' ? (
                  // Connection chip вЂ” doubles as chain-switcher + wallet
                  // disconnect. When a wallet is connected we display the
                  // short address; otherwise the chain name as a hint.
                  // Two interactive zones so one click doesn't ambiguously
                  // mean both "switch chain" and "disconnect".
                  (() => {
                    const isSol = selectedChain === 'solana';
                    const addr = isSol ? solAddress : evmAddress;
                    const onDisc = addr
                      ? (isSol ? handleDisconnectSolana : handleDisconnectEvm)
                      : null;
                    return (
                      <div style={styles.chainChipGroup}>
                        <button
                          type="button"
                          onClick={handleBackToChains}
                          style={styles.chainChip}
                          title="Switch chain"
                        >
                          <span style={styles.chainChipBadge}>
                            {isSol ? 'SOL' : 'EVM'}
                          </span>
                          <span style={styles.chainChipName}>
                            {addr ? shortAddress(addr) : (isSol ? 'Solana' : 'Base')}
                          </span>
                          <span style={styles.chainChipArrow}>{'▾'}</span>
                        </button>
                        {onDisc && (
                          <button
                            type="button"
                            onClick={onDisc}
                            style={styles.chainChipDisconnect}
                            title="Disconnect / change wallet"
                            aria-label="Disconnect wallet"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3" />
                              <path d="M14 7h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4" />
                              <line x1="9" y1="12" x2="14" y2="12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <span style={styles.contextChip}>{contextLine}</span>
                )}
              </div>

              {activeShopTab === 'resources' && (
                <div style={styles.chainChipGroup}>
                  <button
                    type="button"
                    onClick={evmAddress ? handleBaseReady : () => setEvmModalOpen(true)}
                    style={styles.chainChip}
                    title={evmAddress ? 'Switch to Base' : 'Connect Base wallet'}
                  >
                    <span style={styles.chainChipBadge}>EVM</span>
                    <span style={styles.chainChipName}>
                      {evmAddress ? shortAddress(evmAddress) : 'Base wallet'}
                    </span>
                    <span style={styles.chainChipArrow}>{'▾'}</span>
                  </button>
                  {evmAddress && (
                    <button
                      type="button"
                      onClick={handleDisconnectEvm}
                      style={styles.chainChipDisconnect}
                      title="Disconnect / change wallet"
                      aria-label="Disconnect wallet"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3" />
                        <path d="M14 7h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4" />
                        <line x1="9" y1="12" x2="14" y2="12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>

            {activeShopTab === 'nft' ? (
              <>
                {step === 'chain' ? (
                  <SupplyOverview total={totalSupplyInfo} base={baseSupplyInfo} solana={solanaSupplyInfo} />
                ) : (
                  <SupplyProgress supply={supplyInfo} />
                )}

                {step === 'chain' ? (
                  <>
                    {COP_DISCOUNT && (
                      <button type="button" onClick={handleSelectCop} style={styles.clashBanner}>
                        <span style={styles.clashBannerLogo}>
                          <img src={copLogoImg} alt="" style={styles.clashBannerLogoImg} />
                        </span>
                        <div style={styles.clashBannerCopy}>
                          <span style={styles.clashBannerTitle}>
                            Save {COP_DISCOUNT.percent}% - pay with $CoP on Base
                          </span>
                          <span style={styles.clashBannerSub}>
                            ${COP_DISCOUNT.clashUsd.toFixed(2)} CoP vs ${COP_DISCOUNT.baselineUsd.toFixed(2)} ETH/USDC/SOL
                            <span style={styles.clashBannerSubAccent}>
                              {' '} - you keep ${COP_DISCOUNT.savedUsd.toFixed(2)}
                            </span>
                          </span>
                        </div>
                      </button>
                    )}
                    <div style={styles.sectionHeader}>
                      <span style={styles.sectionHeaderText}>Choose network</span>
                      <span style={styles.sectionHeaderHint}>Where to mint</span>
                    </div>
                    <div style={styles.chainGrid}>
                    {CHAIN_OPTIONS.map((chain) => (
                      <div
                        key={chain.id}
                        className={`nft-chain-glow nft-chain-glow-${chain.id}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectChain(chain.id)}
                          style={styles.chainBtn}
                        >
                          <span style={styles.chainTitle}>{chain.title}</span>
                          <span style={styles.chainSubtitle}>{chain.subtitle}</span>
                        </button>
                      </div>
                    ))}
                    </div>
                  </>
                ) : (
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
                )}
              </>
            ) : (
              <GameResourcesTab
                products={gameProducts}
                ready={gameShopReady}
                loading={gameShopConfig === null}
                evmAddress={evmAddress}
                evmOnBase={evmOnBase}
                busy={busy}
                onConnectBase={handleBaseReady}
                onBuy={handleBuyGameProduct}
              />
            )}

            {notice && <div style={activeShopTab === 'nft' && primaryState.ready ? styles.noticeReady : styles.notice}>{notice}</div>}
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

function GameResourcesTab({ products, ready, loading, evmAddress, evmOnBase, busy, onConnectBase, onBuy }) {
  const { isMobile } = useLayout();
  // On mobile keep the labels short — "Connect Base" + "Buy with CoP" wrap
  // onto two lines inside the chrome-y green pill and the card looks
  // squashed. Compact wording reads "this is the action" without wrapping.
  const connectLabel = evmAddress && !evmOnBase
    ? (isMobile ? 'Switch' : 'Switch Base')
    : (isMobile ? 'Connect' : 'Connect Base');

  // Skeleton while /api/shop/config is in flight (initial mount, ~500ms-2s
  // depending on network). Without this the user sees only the "Game
  // resources" header for the duration and has no signal that anything
  // is happening — easy to mistake for an empty/broken panel.
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
        <span style={styles.sectionHeaderHint}>CoP utility</span>
      </div>
      <div style={styles.resourceGrid}>
        {products.map((product) => {
          const isBusy = busy === `shop:${product.id}`;
          const actionLabel = !evmAddress || !evmOnBase
            ? connectLabel
            : isBusy
              ? (isMobile ? 'Buying' : 'Buying...')
              : (isMobile ? 'Buy' : 'Buy with CoP');
          // Mobile layout: icon+text on one row, full-width button below.
          // Avoids the 3-column squeeze where a 92px icon + 100px button
          // leaves only ~60px for the title and "24h Shield" wraps to four
          // lines on a 360-wide phone.
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
            ...((ready && evmAddress && evmOnBase) ? styles.resourceBuyBtnReady : null),
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
                  if (!evmAddress || !evmOnBase) onConnectBase();
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

function getPrimaryState({ selected, evmAddress, evmOnBase, solAddress, solanaConfigured, solanaSaleActive, busy }) {
  if (selected?.soon) return { label: 'CoP soon', glyph: 'C', ready: false };
  if (busy === 'mint') return { label: 'Minting...', glyph: '...', ready: false };
  if (busy === selected.chain) return { label: 'Preparing...', glyph: '...', ready: false };
  if (selected.chain === 'base') {
    if (!evmAddress) return { label: 'Connect Base wallet', glyph: 'B', ready: false };
    if (!evmOnBase) return { label: 'Switch to Base', glyph: 'B', ready: false };
    return { label: `Mint with ${selected.token}`, glyph: 'B', ready: true };
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
`;

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 250, pointerEvents: 'all',
    padding: 12,
  },
  panel: {
    width: 500, maxWidth: '96vw', maxHeight: '92vh', background: '#fdf8e7',
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
  body: {
    padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
    overflowY: 'auto',
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
    border: '2px solid transparent',
    borderRadius: 9,
    background: 'transparent',
    color: '#77573d',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    fontFamily: 'inherit',
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
