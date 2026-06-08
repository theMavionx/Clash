import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { useSignTransaction as usePrivySolanaSignTransaction } from '@privy-io/react-auth/solana';
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { arbitrum, base } from 'viem/chains';
import EvmWalletModal from './EvmWalletModal';
import { useOptionalPrivy } from './PrivyAuthProvider';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useFarcaster } from '../hooks/useFarcaster';
import { usePlayer } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { BASE_CHAIN_ID, BASE_PRIMARY_RPC_URL, ensureBaseChain } from '../lib/avantisContract';
import { ARBITRUM_CHAIN_ID, ensureArbitrumChain } from '../lib/gmxConfig';
import { MONAD_CHAIN_ID, ensureMonadChain, monadChain } from '../lib/monadConfig';
import { INK_CHAIN_ID, ensureInkChain, inkChain } from '../lib/nadoConfig';
import { fetchGameShopConfig, buySolanaShopItem, buyEvmShopItem, buyAptosShopItem } from '../lib/gameShop';
import { flyResourcesToBars } from '../lib/resourceFlyFx';
import { fetchNftMintConfig, mintBaseNft, mintSolanaNft, mintEvmNft, mintAptosNft } from '../lib/nftMint';
import { executeUpgrade, fetchNftState, fetchUpgradeQuote, nftLevelImageUrl, resolveDemonKingConnectedSyncTarget, syncDemonKingNfts, upgradeAptosNft, upgradeNft } from '../lib/nftV3Client';
import { openSolanaWallet } from '../lib/solanaWalletUi';
import { addClientBreadcrumb } from '../lib/clientLogger';
import NftBridgePanel from './NftBridgePanel';
import NftMarketplacePanel from './CustodialMarketplacePanel';
import altarImg from '../assets/units/altar.png';

const demonKingImg = '/cdn/nft/1/default.jpg';
const SHOW_NFT_MINT_TAB = true;
const SALE_NFT_PUBLIC_REVEAL = true;
const SALE_NFT_NAME = 'Dragon';
const SALE_NFT_IMG = '/cdn/nft/dragon/1/default.jpg';
const SALE_NFT_DISPLAY_SUPPLY_CAP = 333;
const SALE_NFT_MINT_SOLD_OUT = false;
const SALE_NFT_MINT_LOCKED = !SALE_NFT_PUBLIC_REVEAL;
const nftBasePublicClient = createPublicClient({ chain: base, transport: http(BASE_PRIMARY_RPC_URL) });
const nftArbitrumPublicClient = createPublicClient({ chain: arbitrum, transport: http() });
const nftMonadPublicClient = createPublicClient({ chain: monadChain, transport: http() });
const nftInkPublicClient = createPublicClient({ chain: inkChain, transport: http() });
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;
const MAX_BATCH_QUANTITY = 10;

const EVM_CHAIN_ID_BY_NFT_CHAIN = {
  base: BASE_CHAIN_ID,
  arbitrum: ARBITRUM_CHAIN_ID,
  monad: MONAD_CHAIN_ID,
  ink: INK_CHAIN_ID,
};
const EVM_VIEM_CHAIN_BY_ID = {
  [BASE_CHAIN_ID]: base,
  [ARBITRUM_CHAIN_ID]: arbitrum,
  [MONAD_CHAIN_ID]: monadChain,
  [INK_CHAIN_ID]: inkChain,
};
const EVM_PUBLIC_CLIENT_BY_ID = {
  [BASE_CHAIN_ID]: nftBasePublicClient,
  [ARBITRUM_CHAIN_ID]: nftArbitrumPublicClient,
  [MONAD_CHAIN_ID]: nftMonadPublicClient,
  [INK_CHAIN_ID]: nftInkPublicClient,
};

function sameEvmAddress(a, b) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(a || ''))
    && /^0x[0-9a-fA-F]{40}$/.test(String(b || ''))
    && String(a).toLowerCase() === String(b).toLowerCase();
}

// Token asset URLs already shipped in /public/tokens.
// Unknown tokens fall back to a generic coin glyph in the renderer.
const TOKEN_LOGO_SRC = {
  ETH:  '/tokens/ETH.svg',
  USDC: '/tokens/USDC.svg',
  SOL:  '/tokens/SOL.svg',
  ARB:  '/tokens/ARB.svg',
  MON:  '/tokens/MON.svg',
  INK:  '/tokens/INK.png',
  CLASH: '/icons/icon-192.png',
  APT:  '/tokens/APT.png',
  SKR:  '/tokens/SKR.png',
};
function tokenLogo(token) { return TOKEN_LOGO_SRC[token] || null; }

const CHAIN_LOGO_SRC = {
  base: '/tokens/BASE.svg',
  arbitrum: '/tokens/ARB.svg',
  monad: '/tokens/MON.svg',
  ink: '/tokens/INK.png',
  solana: '/tokens/SOL.svg',
  aptos: '/tokens/APT.png',
};
function chainLogo(chain) { return CHAIN_LOGO_SRC[chain] || null; }

function ChainLogoBadge({ chain, fallback, small = false }) {
  const src = chainLogo(chain);
  return (
    <span style={small ? styles.chainLogoBadgeSmall : styles.chainLogoBadge}>
      {src ? (
        <img src={src} alt="" style={styles.chainLogoImg} />
      ) : (
        fallback
      )}
    </span>
  );
}

const SHOP_TABS = [
  { id: 'resources',   label: 'Game Resources', mobileLabel: 'Resources' },
  ...(SHOW_NFT_MINT_TAB ? [{ id: 'nft', label: 'NFT', mobileLabel: 'NFT' }] : []),
  { id: 'marketplace', label: 'Marketplace',    mobileLabel: 'Market' },
];

const GAME_RESOURCE_PRODUCT_PRIORITY = {
  altar: 0,
};

const CHAIN_OPTIONS = [
  { id: 'base', title: 'Base', subtitle: 'ETH / USDC', badge: 'EVM' },
  { id: 'arbitrum', title: 'Arbitrum', subtitle: 'ETH / USDC', badge: 'EVM' },
  { id: 'monad', title: 'Monad', subtitle: 'MON / USDC', badge: 'EVM' },
  { id: 'ink', title: 'Ink', subtitle: 'ETH / USDC', badge: 'EVM' },
  { id: 'solana', title: 'Solana', subtitle: 'SOL / USDC / SKR', badge: 'SOL' },
  { id: 'aptos', title: 'Aptos', subtitle: 'APT / USDC', badge: 'APT' },
];

const PAYMENT_OPTIONS = {
  base: [
    { id: 'base-eth', chain: 'base', method: 'ETH', price: '~$15.00', token: 'ETH' },
    { id: 'base-usdc', chain: 'base', method: 'USDC', price: '$15.00', token: 'USDC' },
  ],
  solana: [
    { id: 'sol-usdc', chain: 'solana', method: 'USDC', price: '$15.00', token: 'USDC' },
    { id: 'sol-sol', chain: 'solana', method: 'SOL', price: '~$15.00', token: 'SOL' },
    { id: 'sol-clash', chain: 'solana', method: 'CLASH', price: '$10.00', token: 'CLASH', dealLabel: 'Best deal', dealText: 'Save $5.00', requiresClash: true },
    { id: 'sol-skr', chain: 'solana', method: 'SKR', price: '$13.00', token: 'SKR', dealLabel: 'SKR discount', dealText: 'Save $2.00', requiresSkr: true },
  ],
  // Arbitrum + Monad shops are deployed and saleActive — direct mint with
  // USDC or the chain's native token works via the server's /nft/evm/quote
  // endpoint. Aptos mirrors that shape with USDC/APT quotes signed by the
  // server and submitted through the Aptos wallet adapter.
  arbitrum: [
    { id: 'arb-usdc', chain: 'arbitrum', method: 'USDC', price: '$15.00', token: 'USDC' },
    { id: 'arb-eth',  chain: 'arbitrum', method: 'ETH',  price: '~$15.00', token: 'ETH' },
  ],
  monad: [
    { id: 'monad-usdc', chain: 'monad', method: 'USDC', price: '$15.00', token: 'USDC' },
    { id: 'monad-mon',  chain: 'monad', method: 'MON',  price: '~$15.00', token: 'MON' },
  ],
  ink: [
    { id: 'ink-usdc', chain: 'ink', method: 'USDC', price: '$15.00', token: 'USDC' },
    { id: 'ink-eth',  chain: 'ink', method: 'ETH',  price: '~$15.00', token: 'ETH' },
  ],
  aptos: [
    { id: 'aptos-usdc', chain: 'aptos', method: 'USDC', price: '$15.00', token: 'USDC' },
    { id: 'aptos-apt',  chain: 'aptos', method: 'APT',  price: '~$15.00', token: 'APT' },
  ],
};

function priceToNumber(price) {
  const n = parseFloat(String(price || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const DEX_LABELS = {
  decibel: 'Decibel / Aptos',
  gmx: 'GMX / Arbitrum',
  avantis: 'Avantis / Base',
  pacifica: 'Pacifica / Solana',
  phoenix: 'Phoenix / Solana',
  monad: 'Perpl / Monad',
  hyperliquid: 'Hyperliquid / Arbitrum',
  nado: 'Nado / Ink',
  hotstuff: 'Hotstuff L1',
  grvt: 'GRVT / GRVT Exchange',
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
    ensureChain: async (targetChainId = BASE_CHAIN_ID) => {
      const id = Number(targetChainId) || BASE_CHAIN_ID;
      if (id === ARBITRUM_CHAIN_ID) return ensureArbitrumChain(provider);
      if (id === MONAD_CHAIN_ID) return ensureMonadChain(provider);
      if (id === INK_CHAIN_ID) return ensureInkChain(provider);
      return ensureBaseChain(provider);
    },
    getPublicClient: (targetChainId = BASE_CHAIN_ID) => (
      EVM_PUBLIC_CLIENT_BY_ID[Number(targetChainId)] || nftBasePublicClient
    ),
    getWalletClient: (targetChainId = BASE_CHAIN_ID) => createWalletClient({
      account: address,
      chain: EVM_VIEM_CHAIN_BY_ID[Number(targetChainId)] || base,
      transport: custom(provider),
    }),
  };
}

// Map the player's DEX to their actual playing chain — the NFT shop
// reflects this so an Arbitrum trader sees "Arbitrum" not "Base".
// Chains where mint endpoints aren't deployed (arb/monad/aptos) render
// a "bridge from Base to mint here" path inside the payment view.
function makePrivySolanaWallet(privyWallet, signTransaction) {
  if (!privyWallet?.address || !signTransaction) return null;
  const publicKey = new PublicKey(privyWallet.address);
  const signOne = async (tx) => {
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const result = await signTransaction({
      transaction: new Uint8Array(serialized),
      wallet: privyWallet,
    });
    const raw = new Uint8Array(result?.signedTransaction || result);
    try {
      return Transaction.from(raw);
    } catch {
      return VersionedTransaction.deserialize(raw);
    }
  };
  return {
    publicKey,
    walletClientType: privyWallet.walletClientType || 'privy',
    source: 'privy',
    signTransaction: signOne,
    signAllTransactions: async (txs) => Promise.all(txs.map(signOne)),
    signMessage: async () => {
      throw new Error('Privy Solana wallet cannot sign messages in the shop flow');
    },
  };
}

const DEX_TO_NFT_CHAIN = {
  avantis:  'base',
  pacifica: 'solana',
  phoenix:  'solana',
  gmx:      'arbitrum',
  monad:    'monad',
  decibel:  'aptos',
  hyperliquid: 'arbitrum',
  nado:     'ink',
  hotstuff: 'base',
  grvt:     'base',
};
// All supported chains now have a direct NFT mint endpoint:
//   - base    /nft/base/quote   (ETH / USDC)
//   - solana  candy machine     (USDC / SOL / SKR)
//   - arbitrum/monad/ink /nft/evm/quote   (USDC / native)
//   - aptos   /nft/aptos/quote  (USDC/APT, ed25519-signed)
const NFT_MINT_SUPPORTED = new Set(['base', 'solana', 'arbitrum', 'monad', 'ink', 'aptos']);

function recommendedChain(dex) {
  return DEX_TO_NFT_CHAIN[dex] || 'base';
}

function defaultPaymentForChain(chain) {
  switch (chain) {
    case 'solana':   return 'sol-usdc';
    case 'arbitrum': return 'arb-usdc';
    case 'monad':    return 'monad-usdc';
    case 'ink':      return 'ink-usdc';
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

function clampQuantity(value, max = MAX_BATCH_QUANTITY) {
  const hardMax = Math.max(1, Math.floor(Number(max) || MAX_BATCH_QUANTITY));
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(hardMax, count));
}

function multiplyRewards(rewards, quantity) {
  if (!rewards) return null;
  const count = clampQuantity(quantity);
  return {
    gold: Math.max(0, Number(rewards.gold || 0) * count),
    wood: Math.max(0, Number(rewards.wood || 0) * count),
    ore: Math.max(0, Number(rewards.ore || 0) * count),
  };
}

function formatUsdAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function formatSaleUsdLabel(value, { approx = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${approx ? '~' : ''}$${n.toFixed(2)}`;
}

function e6ToUsd(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n / 1_000_000 : null;
}

function salePaymentUsd(option, config) {
  const chain = option?.chain;
  const method = String(option?.method || '').toLowerCase();
  if (!chain || !method || !config) return null;

  if (chain === 'solana') {
    const groups = config.solana?.paymentGroups || config.solana?.groups || {};
    const group = groups[method];
    return group?.usdPrice != null ? Number(group.usdPrice) : null;
  }

  if (chain === 'aptos') {
    return e6ToUsd(config.aptos?.mintUsdPriceE6);
  }

  const evm = config.evm?.[chain];
  if (!evm) return null;
  if (method === 'clash') return e6ToUsd(evm.clashUsdPriceE6);
  return e6ToUsd(evm.baseUsdPriceE6);
}

function salePaymentPriceLabel(option, config) {
  const usd = salePaymentUsd(option, config);
  const approx = ['eth', 'sol', 'apt', 'mon'].includes(String(option?.method || '').toLowerCase());
  return formatSaleUsdLabel(usd, { approx }) || option?.price || '';
}

function salePaymentDealText(option, config) {
  if (!option?.dealText) return '';
  const base = salePaymentUsd({ chain: option.chain, method: 'USDC' }, config);
  const discounted = salePaymentUsd(option, config);
  if (!Number.isFinite(base) || !Number.isFinite(discounted) || discounted >= base) return option.dealText;
  return `Save $${(base - discounted).toFixed(2)}`;
}

function shopUnitUsd(product, chain, payment) {
  const baseUsd = Number(product?.priceUsd || 0);
  if (chain === 'solana' && payment === 'clash') {
    const clashUsd = product?.clashPriceUsd != null ? Number(product.clashPriceUsd) : baseUsd * 0.8;
    return Number.isFinite(clashUsd) ? clashUsd : baseUsd;
  }
  return Number.isFinite(baseUsd) ? baseUsd : 0;
}

function isShopDiscounted(product, chain, payment) {
  const baseUsd = Number(product?.priceUsd || 0);
  return (chain === 'solana' && payment === 'clash')
    && shopUnitUsd(product, chain, payment) < baseUsd;
}

function formatBoosts(boosts) {
  if (!boosts) return '';
  const parts = [];
  if (boosts.resourcesPct) parts.push(`+${boosts.resourcesPct}% resources`);
  if (boosts.basePct) parts.push(`+${boosts.basePct}% base`);
  if (boosts.trophyPerAttack) parts.push(`up to +${boosts.trophyPerAttack} trophies/attack`);
  return parts.join(' / ');
}

function getSupplyInfo(config, chain) {
  const chainConfig = config?.[chain] || config?.evm?.[chain] || {};
  const globalSupply = config?.global || {};
  const supply = chainConfig.supply || {};
  const maxSupply = countOrNull(supply.maxSupply ?? chainConfig.maxSupply ?? globalSupply.cap) || SALE_NFT_DISPLAY_SUPPLY_CAP;
  const mintedFromRpc = countOrNull(supply.totalMinted ?? supply.total ?? globalSupply.perChain?.[chain]);
  const availableRemainingFromRpc = countOrNull(supply.remaining);
  const displayRemainingFromRpc = countOrNull(supply.confirmedRemaining) ?? availableRemainingFromRpc;
  const totalMinted = mintedFromRpc ?? (
    displayRemainingFromRpc == null ? null : Math.max(0, maxSupply - displayRemainingFromRpc)
  );
  const remaining = displayRemainingFromRpc ?? (
    totalMinted == null ? null : Math.max(0, maxSupply - totalMinted)
  );
  const progress = totalMinted == null || maxSupply <= 0
    ? 0
    : Math.min(100, Math.max(0, (totalMinted / maxSupply) * 100));
  return {
    chain,
    title: `${SHOP_CHAIN_LABEL[chain] || (chain === 'solana' ? 'Solana' : 'Base')} ${SALE_NFT_NAME}`,
    totalMinted,
    maxSupply,
    remaining,
    availableRemaining: availableRemainingFromRpc ?? remaining,
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
    const maxSupply = Number(globalSupply.cap) || SALE_NFT_DISPLAY_SUPPLY_CAP;
    const totalMinted = countOrNull(globalSupply.totalMinted ?? globalSupply.total);
    const availableRemaining = countOrNull(globalSupply.remaining);
    const remaining = countOrNull(globalSupply.confirmedRemaining) ?? availableRemaining
      ?? (totalMinted == null ? null : Math.max(0, maxSupply - totalMinted));
    const progress = totalMinted == null || maxSupply <= 0 ? 0
      : Math.min(100, Math.max(0, (totalMinted / maxSupply) * 100));
    return {
      title: `${SALE_NFT_NAME} Supply`,
      totalMinted, maxSupply, remaining, availableRemaining: availableRemaining ?? remaining, progress,
      loaded: totalMinted != null,
      perChain: globalSupply.perChain || null,
    };
  }
  // Legacy fallback — base + solana only.
  const maxSupply = SALE_NFT_DISPLAY_SUPPLY_CAP;
  const baseMinted = countOrNull(baseSupply?.totalMinted);
  const solanaMinted = countOrNull(solanaSupply?.totalMinted);
  const baseRemaining = countOrNull(baseSupply?.remaining);
  const solanaRemaining = countOrNull(solanaSupply?.remaining);
  const totalMinted = baseMinted == null && solanaMinted == null ? null : (baseMinted || 0) + (solanaMinted || 0);
  const remaining = baseRemaining == null && solanaRemaining == null ? null : (baseRemaining || 0) + (solanaRemaining || 0);
  const progress = totalMinted == null || maxSupply <= 0 ? 0 : Math.min(100, Math.max(0, (totalMinted / maxSupply) * 100));
  return {
    title: `${SALE_NFT_NAME} Supply`,
    totalMinted,
    maxSupply,
    remaining,
    progress,
    loaded: baseSupply?.loaded || solanaSupply?.loaded,
  };
}

function getSoldOutDisplaySupplyInfo(supply) {
  return {
    ...(supply || {}),
    title: supply?.title || `${SALE_NFT_NAME} Supply`,
    totalMinted: SALE_NFT_DISPLAY_SUPPLY_CAP,
    maxSupply: SALE_NFT_DISPLAY_SUPPLY_CAP,
    remaining: 0,
    progress: 100,
    loaded: true,
    fractionLabel: `${SALE_NFT_DISPLAY_SUPPLY_CAP}/${SALE_NFT_DISPLAY_SUPPLY_CAP}`,
  };
}

function getMysterySupplyInfo() {
  return {
    title: '???',
    totalMinted: null,
    maxSupply: null,
    remaining: null,
    progress: 0,
    loaded: true,
    masked: true,
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
  hyperliquid: 'arbitrum',
  nado:     'ink',
  hotstuff: 'base',
};

function shopChainForDex(dex) {
  return DEX_TO_SHOP_CHAIN[dex] || 'base';
}

const SHOP_CHAIN_STORAGE_KEY = 'clash_shop_chain';

function readStoredShopChain(fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(SHOP_CHAIN_STORAGE_KEY);
    return SHOP_PAYMENTS_BY_CHAIN[stored] ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredShopChain(chain) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(SHOP_CHAIN_STORAGE_KEY, chain); } catch { /* storage disabled */ }
}

function marketplaceChainForDex(dex) {
  void dex;
  return 'base';
}

const DEFAULT_MARKETPLACE_STATS = {
  listedLabel: '0',
  volumeLabel: '$0',
  floorLabel: '-',
};

function NftMintPanel({ onClose, initialView = 'shop', initialUpgradeRequest = null }) {
  const { dex } = useDex();
  const player = usePlayer();
  const tradingEvmWallet = useEvmWallet();
  const adapterSolWallet = useSolWallet();
  const optionalPrivy = useOptionalPrivy();
  let privySolanaSignTransaction = null;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signTransaction } = usePrivySolanaSignTransaction();
    privySolanaSignTransaction = signTransaction;
  }
  const aptosWallet = useAptosWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const { isInFrame } = useFarcaster();
  const { isMobile: panelMobile } = useLayout();

  const [activeShopTab, setActiveShopTab] = useState(SHOW_NFT_MINT_TAB ? 'nft' : 'resources');
  // Skip the legacy chain-picker step on open — the player's chain comes
  // from their chosen DEX (see [[shop-auto-chain]]). They can still re-pick
  // a chain via the top-right chip which calls handleBackToChains.
  const [step, setStep] = useState('payment');
  const [selectedChain, setSelectedChain] = useState(() => recommendedChain(dex));
  const [selectedPayment, setSelectedPayment] = useState(() => defaultPaymentForChain(recommendedChain(dex)));
  const [shopChain, setShopChain] = useState(() => readStoredShopChain(shopChainForDex(dex)));
  const [chainPickerOpen, setChainPickerOpen] = useState(false);
  // Top-level view inside the shop modal. 'shop' shows the NFT/Resources
  // tabs; 'bridge' replaces the body with the cross-chain bridge UI.
  const [view, setView] = useState(initialView === 'upgrade' ? 'upgrade' : 'shop');
  const [evmModalOpen, setEvmModalOpen] = useState(false);
  const [evmModalTargetOverride, setEvmModalTargetOverride] = useState(null);
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
  const [marketplaceStats, setMarketplaceStats] = useState(DEFAULT_MARKETPLACE_STATS);

  const localEvmWallet = useMemo(
    () => makeNftEvmWallet(nftEvmWallet?.provider, nftEvmWallet?.address),
    [nftEvmWallet?.provider, nftEvmWallet?.address],
  );
  const evmWallet = localEvmWallet || tradingEvmWallet;
  const usingLocalEvmWallet = !!localEvmWallet;
  const privySolanaWalletObj = optionalPrivy.authenticated
    ? (optionalPrivy.solanaWallets || []).find(w => w?.walletClientType === 'privy')
      || (optionalPrivy.solanaWallets || [])[0]
    : null;
  const privySolWallet = useMemo(
    () => makePrivySolanaWallet(privySolanaWalletObj, privySolanaSignTransaction),
    [privySolanaWalletObj, privySolanaSignTransaction],
  );
  const solWallet = adapterSolWallet?.publicKey ? adapterSolWallet : (privySolWallet || adapterSolWallet);
  const usingPrivySolWallet = !adapterSolWallet?.publicKey && !!privySolWallet;
  const solAddress = solWallet?.publicKey?.toBase58?.() || null;
  const aptosAddress = aptosWallet?.address || null;
  const preparingPrivySolWallet = !!optionalPrivy.enabled
    && !!optionalPrivy.authenticated
    && !adapterSolWallet?.publicKey
    && !privySolanaWalletObj?.address;
  const evmAddress = evmWallet?.address || null;
  const evmOnBase = evmChainId === BASE_CHAIN_ID;
  const sessionToken = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
  const gameProducts = (gameShopConfig?.products || []).filter((product) => (
    product.kind !== 'ai_messages' && product.kind !== 'ai_subscription'
  )).sort((a, b) => (
    (GAME_RESOURCE_PRODUCT_PRIORITY[a.id] ?? 10) - (GAME_RESOURCE_PRODUCT_PRIORITY[b.id] ?? 10)
  ));
  // Game resource purchases use their own chain selector. The player's DEX
  // only seeds the first choice; after that, the shop chain is independent.
  const shopEvmChainId = EVM_CHAIN_ID_BY_NFT_CHAIN[shopChain] || null;
  const evmOnShopChain = !!shopEvmChainId && evmChainId === shopEvmChainId;
  const marketplaceChain = marketplaceChainForDex(dex);
  const marketplaceEvmChainId = EVM_CHAIN_ID_BY_NFT_CHAIN[marketplaceChain] || BASE_CHAIN_ID;
  const evmOnMarketplaceChain = evmChainId === marketplaceEvmChainId;
  const shopReadiness = {
    base:     !!gameShopConfig?.base?.ready    && !!gameShopConfig?.base?.saleActive,
    solana:   !!gameShopConfig?.solana?.ready   && !!gameShopConfig?.solana?.saleActive,
    arbitrum: !!gameShopConfig?.arbitrum?.ready && !!gameShopConfig?.arbitrum?.saleActive,
    monad:    !!gameShopConfig?.monad?.ready    && !!gameShopConfig?.monad?.saleActive,
    ink:      !!gameShopConfig?.ink?.ready      && !!gameShopConfig?.ink?.saleActive,
    aptos:    !!gameShopConfig?.aptos?.ready    && !!gameShopConfig?.aptos?.saleActive,
  };
  const shopChainReady = !!shopReadiness[shopChain];
  const demonKingSyncTarget = useMemo(() => resolveDemonKingConnectedSyncTarget({
    dex,
    evmAddress,
    evmChainId,
    solAddress,
    aptosAddress,
  }), [aptosAddress, dex, evmAddress, evmChainId, solAddress]);
  // Multi-token chains (Solana, Aptos) expose a sub-toggle. EVM-USDC-only
  // chains don't need one. Default to USDC on multi-token chains since
  // most players already have it from the trading flow.
  const [shopPayment, setShopPayment] = useState('usdc');
  const [mintQuantity, setMintQuantity] = useState(1);
  const [shopQuantities, setShopQuantities] = useState({});

  useEffect(() => {
    if (!sessionToken || !demonKingSyncTarget) return undefined;
    let cancelled = false;
    syncDemonKingNfts(demonKingSyncTarget)
      .then((result) => {
        if (cancelled) return;
        addClientBreadcrumb('nft.demon_king_wallet_sync', {
          dex,
          chains: result?.chains || demonKingSyncTarget.chains,
          wallets: result?.wallets?.length || 0,
          total: Number(result?.total) || 0,
          cached: !!result?.cached,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        addClientBreadcrumb('nft.demon_king_wallet_sync_failed', {
          dex,
          message: err?.message || String(err),
        }, 'warn');
      });
    return () => { cancelled = true; };
  }, [demonKingSyncTarget, dex, sessionToken]);

  // Reset payment to USDC when the player switches to a chain that doesn't
  // offer the previously-chosen token. The chain-allowed sets here mirror
  // SHOP_PAYMENTS_BY_CHAIN below.
  useEffect(() => {
    const validPayments = {
      solana:   ['usdc', 'sol', 'clash', 'skr'],
      aptos:    ['usdc', 'apt'],
      arbitrum: ['usdc', 'eth'],
      monad:    ['usdc', 'mon'],
      ink:      ['usdc', 'eth'],
      base:     ['usdc', 'eth'],
    };
    const allowed = validPayments[shopChain] || ['usdc'];
    if (!allowed.includes(shopPayment)) {
      setShopPayment('usdc');
    }
  }, [shopChain, shopPayment]);
  const paymentOptions = useMemo(() => {
    const options = PAYMENT_OPTIONS[selectedChain] || PAYMENT_OPTIONS.base;
    if (selectedChain !== 'solana') return options;
    const groups = mintConfig?.solana?.paymentGroups || mintConfig?.solana?.groups || {};
    return options
      .filter((option) => !option.requiresSkr || !!groups.skr)
      .filter((option) => !option.requiresClash || !!groups.clash);
  }, [mintConfig?.solana?.groups, mintConfig?.solana?.paymentGroups, selectedChain]);
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
  const displayedTotalSupplyInfo = useMemo(
    () => SALE_NFT_MINT_LOCKED
      ? getMysterySupplyInfo()
      : SALE_NFT_MINT_SOLD_OUT
        ? getSoldOutDisplaySupplyInfo(totalSupplyInfo)
        : totalSupplyInfo,
    [totalSupplyInfo],
  );
  const supplyInfo = useMemo(() => getSupplyInfo(mintConfig, selectedChain), [mintConfig, selectedChain]);
  const solanaConfigured = !!mintConfig?.solana?.candyMachine;
  const solanaSaleActive = !!mintConfig?.solana?.saleActive;

  const refreshMintConfig = useCallback(async ({ apply = true, log = true } = {}) => {
    if (SALE_NFT_MINT_LOCKED) {
      if (apply) setMintConfig(null);
      return null;
    }
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

  const handleSelectShopChain = useCallback((chain) => {
    if (!SHOP_PAYMENTS_BY_CHAIN[chain]) return;
    setShopChain(chain);
    writeStoredShopChain(chain);
    setChainPickerOpen(false);
    setNotice(null);
    addClientBreadcrumb('shop.chain_selected', { chain, dex, source: 'manual' });
  }, [dex]);

  const handleShopQuantityChange = useCallback((productId, next, max = MAX_BATCH_QUANTITY) => {
    setShopQuantities((prev) => ({
      ...prev,
      [productId]: clampQuantity(next, max),
    }));
  }, []);

  const handleSwitchPanelChain = useCallback((chain) => {
    if (activeShopTab === 'resources') {
      handleSelectShopChain(chain);
      return;
    }
    if (activeShopTab === 'nft') {
      handleSelectChain(chain);
      setChainPickerOpen(false);
      return;
    }
    setChainPickerOpen(false);
  }, [activeShopTab, handleSelectChain, handleSelectShopChain]);

  const handleBackToChains = useCallback(() => {
    setStep('chain');
    setNotice(null);
  }, []);

  const handleEvmReady = useCallback(async (targetChain = 'base') => {
    if (!evmAddress) {
      setEvmModalOpen(true);
      return;
    }

    const chainKey = EVM_CHAIN_ID_BY_NFT_CHAIN[targetChain] ? targetChain : 'base';
    const chainId = EVM_CHAIN_ID_BY_NFT_CHAIN[chainKey];
    const label = SHOP_CHAIN_LABEL[chainKey] || 'Base';
    setBusy(chainKey);
    setNotice(null);
    try {
      await evmWallet.ensureChain(chainId);
      setEvmChainId(chainId);
      setNotice(`${label} wallet ready.`);
      addClientBreadcrumb('nft.payment_wallet_ready', { chain: chainKey, dex });
    } catch (err) {
      const message = err?.message || `${label} switch cancelled`;
      setNotice(message.slice(0, 120));
      addClientBreadcrumb('nft.evm_switch_failed', { dex, chain: chainKey, message }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [dex, evmAddress, evmWallet]);

  const handleBaseReady = useCallback(() => handleEvmReady('base'), [handleEvmReady]);
  const handleShopChainReady = useCallback(() => handleEvmReady(shopChain), [handleEvmReady, shopChain]);
  const handleMarketplaceReady = useCallback((chain = marketplaceChain) => handleEvmReady(chain || marketplaceChain), [handleEvmReady, marketplaceChain]);
  const handleBridgeEvmModal = useCallback((targetChain = 'base') => {
    const chainKey = EVM_CHAIN_ID_BY_NFT_CHAIN[targetChain] ? targetChain : 'base';
    setEvmModalTargetOverride(chainKey);
    setEvmModalOpen(true);
  }, []);

  const handleSolanaReady = useCallback(() => {
    if (solAddress) {
      setNotice('Solana wallet ready.');
      addClientBreadcrumb('nft.payment_wallet_ready', {
        chain: 'solana',
        dex,
        source: usingPrivySolWallet ? 'privy' : 'adapter',
      });
      return;
    }

    if (preparingPrivySolWallet) {
      setNotice('Privy Solana wallet is being prepared. Try again in a moment.');
      addClientBreadcrumb('nft.privy_solana_preparing', { dex });
      return;
    }

    addClientBreadcrumb('nft.connect_solana_start', { dex });
    openSolanaWallet({
      wallets: adapterSolWallet.wallets,
      select: adapterSolWallet.select,
      connect: adapterSolWallet.connect,
      openWalletModal: setSolanaModalVisible,
      inFrame: isInFrame,
    });
  }, [adapterSolWallet, dex, isInFrame, preparingPrivySolWallet, setSolanaModalVisible, solAddress, usingPrivySolWallet]);

  const handlePrimary = useCallback(() => {
    const quantity = clampQuantity(mintQuantity);
    if (SALE_NFT_MINT_LOCKED) {
      setNotice('???');
      return;
    }
    if (SALE_NFT_MINT_SOLD_OUT) {
      setNotice(`${SALE_NFT_NAME} fresh mint is sold out.`);
      return;
    }
    // Chains without a direct mint endpoint render
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
        afterMint: null,
        dex,
        quantity,
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
        afterMint: null,
        dex,
        quantity,
      });
      return;
    }
    // Arbitrum / Monad — same flow as Base but the wallet has to switch
    // chains first. handleEvmMint calls evmWallet.ensureChain internally.
    if ((selected.chain === 'arbitrum' || selected.chain === 'monad' || selected.chain === 'ink') && evmAddress) {
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
        afterMint: null,
        dex,
        quantity,
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
        afterMint: null,
        dex,
        quantity,
      });
      return;
    }
    if (selected.chain === 'base') {
      handleBaseReady();
    } else if (selected.chain === 'arbitrum' || selected.chain === 'monad' || selected.chain === 'ink') {
      // No EVM wallet yet — surface the EVM connect modal.
      setEvmModalOpen(true);
    } else if (selected.chain === 'aptos') {
      // Aptos wallet not connected yet — kick the standard adapter modal.
      try { aptosWallet?.connect?.(); } catch { /* user-cancel */ }
    } else {
      handleSolanaReady();
    }
  }, [aptosAddress, aptosWallet, dex, evmAddress, evmOnBase, evmWallet, handleBaseReady, handleSolanaReady, mintConfig?.solana, mintQuantity, refreshMintConfig, selected, solAddress, solWallet]);

  const handleBuyGameProduct = useCallback(async (product) => {
    if (!sessionToken) {
      setNotice('Game account is still loading. Try again in a moment.');
      return;
    }
    if (!shopChainReady) {
      setNotice(`${shopChain.charAt(0).toUpperCase() + shopChain.slice(1)} game shop is not live yet.`);
      return;
    }
    const quantity = clampQuantity(shopQuantities[product.id] || 1, product.maxQuantity || MAX_BATCH_QUANTITY);

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
      if (!evmAddress || !evmOnShopChain) { await handleShopChainReady(); return; }
    } else if (shopChain === 'arbitrum' || shopChain === 'monad' || shopChain === 'ink') {
      if (!evmAddress || !evmOnShopChain) { await handleShopChainReady(); return; }
    }

    setBusy(`shop:${product.id}`);
    setNotice(null);
    const pendingPaymentLabel = getShopPaymentLabel(shopChain, shopPayment);
    setShopPurchaseStatus('pending');
    setShopPurchaseResult({
      product,
      chain: shopChain,
      payment: shopPayment,
      paymentLabel: pendingPaymentLabel,
      quantity,
    });
    try {
      let result;
      if (shopChain === 'solana') {
        result = await buySolanaShopItem({
          solWallet,
          buyer: solAddress,
          token: sessionToken,
          sku: product.sku,
          payment: shopPayment,
          quantity,
        });
      } else if (shopChain === 'base') {
        result = await buyEvmShopItem({
          evmWallet,
          buyer: evmAddress,
          token: sessionToken,
          chain: shopChain,
          sku: product.sku,
          payment: shopPayment,
          quantity,
        });
      } else if (shopChain === 'arbitrum' || shopChain === 'monad' || shopChain === 'ink') {
        result = await buyEvmShopItem({
          evmWallet,
          buyer: evmAddress,
          token: sessionToken,
          chain: shopChain,
          sku: product.sku,
          payment: shopPayment,
          quantity,
        });
      } else if (shopChain === 'aptos') {
        result = await buyAptosShopItem({
          aptosWallet,
          buyer: aptosWallet?.address,
          token: sessionToken,
          sku: product.sku,
          payment: shopPayment,
          quantity,
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
      if (grant.building_unlocks || grant.shop_entitlements || grant.altar) {
        const entitlementPatch = {
          shop_entitlements: grant.shop_entitlements || {},
          building_unlocks: grant.building_unlocks || {},
          altar: grant.altar || null,
        };
        window.onGodotMessage?.({ action: 'state', data: entitlementPatch });
        try {
          window.godotBridge?.(JSON.stringify({ action: 'set_shop_unlocks', data: entitlementPatch }));
        } catch {}
      }
      // Stash the per-resource delta on the result so the success popup's
      // "Done" handler can fire the fly-to-bar animation. We deliberately
      // DON'T fly here — the burst would happen behind the success overlay
      // that's about to cover the screen, which the player wouldn't see.
      const flyRewards = multiplyRewards(product.rewards, quantity);
      // Each chain returns a different tx-ID field shape; normalize so the
      // success popup + analytics see a single string.
      const txId = result.signature || result.hash || result.txHash || '';
      const paymentLabel = getShopPaymentLabel(shopChain, shopPayment);
      setShopPurchaseResult({
        product,
        grant,
        tx: txId,
        flyRewards,
        chain: shopChain,
        payment: shopPayment,
        paymentLabel,
        quantity,
        explorer: getShopPurchaseExplorer(shopChain, txId),
      });
      setShopPurchaseStatus('success');
      addClientBreadcrumb('shop.purchase_success', {
        dex,
        chain: shopChain,
        payment: shopPayment,
        sku: product.sku,
        quantity,
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
  }, [aptosWallet, dex, evmAddress, evmOnShopChain, evmWallet, handleShopChainReady, handleSolanaReady, refreshGameShopConfig, sessionToken, shopChain, shopChainReady, shopPayment, shopQuantities, solAddress, solWallet]);

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
    soldOut: SALE_NFT_MINT_SOLD_OUT || SALE_NFT_MINT_LOCKED,
    evmAddress,
    evmOnBase,
    solAddress,
    aptosAddress: aptosWallet?.address || null,
    preparingPrivySolWallet,
    solanaConfigured,
    solanaSaleActive,
    busy,
  });

  const evmModalTargetChain = evmModalTargetOverride || (activeShopTab === 'marketplace'
    ? marketplaceChain
    : activeShopTab === 'resources'
      ? shopChain
      : selectedChain);
  const evmModalTargetEvmChain = EVM_CHAIN_ID_BY_NFT_CHAIN[evmModalTargetChain]
    ? evmModalTargetChain
    : 'base';
  const evmModalTargetChainId = EVM_CHAIN_ID_BY_NFT_CHAIN[evmModalTargetEvmChain] || BASE_CHAIN_ID;
  const evmModalTargetLabel = SHOP_CHAIN_LABEL[evmModalTargetEvmChain] || 'Base';

  const contextLine = getContextLine(dex);
  const saleMintSoldOut = SALE_NFT_MINT_SOLD_OUT;
  const saleMintLocked = SALE_NFT_MINT_LOCKED;
  const marketplaceFullScroll = view === 'shop' && activeShopTab === 'marketplace';
  const canSwitchPaymentChain = activeShopTab === 'resources' || (SHOW_NFT_MINT_TAB && activeShopTab === 'nft' && !saleMintLocked);
  const activePaymentChain = activeShopTab === 'resources'
    ? shopChain
    : activeShopTab === 'marketplace'
      ? marketplaceChain
      : selectedChain;
  const activePaymentChainLabel = SHOP_CHAIN_LABEL[activePaymentChain] || 'Base';
  const chainSwitchReadiness = activeShopTab === 'resources'
    ? shopReadiness
    : SHOW_NFT_MINT_TAB
      ? SHOP_CHAIN_CHOICES.reduce((acc, chain) => {
          acc[chain.id] = NFT_MINT_SUPPORTED.has(chain.id);
          return acc;
        }, {})
      : {};

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
      setNotice('EVM payment wallet disconnected.');
      addClientBreadcrumb('nft.disconnect_evm', { dex, scope: 'shop' });
      return;
    }
    setEvmModalOpen(true);
    setNotice('Choose an EVM wallet for this shop purchase.');
    addClientBreadcrumb('nft.change_evm_wallet', { dex, scope: 'shop' });
  }, [dex, usingLocalEvmWallet]);

  const handleDisconnectSolana = useCallback(async () => {
    if (usingPrivySolWallet) {
      setNotice('Privy Solana wallet is managed by your email session. Log out from Profile to disconnect it.');
      addClientBreadcrumb('nft.disconnect_solana_privy_hint', { dex });
      return;
    }
    try {
      await adapterSolWallet?.disconnect?.();
      setNotice('Solana wallet disconnected.');
      addClientBreadcrumb('nft.disconnect_solana', { dex });
    } catch (err) {
      const message = err?.message || 'Solana disconnect failed';
      setNotice(message.slice(0, 120));
      addClientBreadcrumb('nft.disconnect_solana_failed', { dex, message }, 'warn');
    }
  }, [adapterSolWallet, dex, usingPrivySolWallet]);

  return (
    <>
      <style>{MINT_ANIM_CSS}</style>
      <div
        style={styles.overlay}
        onClick={mintStatus === 'pending' ? undefined : onClose}
      >
        <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            {view !== 'shop' ? (
              <button style={styles.backBtn} onClick={() => setView('shop')} aria-label="Back to shop">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                  <path d="M15 18 9 12l6-6" />
                </svg>
              </button>
            ) : <span style={styles.headerSpacer} />}
            <span style={styles.title}>
              {view === 'bridge' ? 'Bridge NFT' : view === 'upgrade' ? 'Upgrade Demon King' : 'Battle Shop'}
            </span>
            <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div
            className={marketplaceFullScroll ? 'shop-scroll' : undefined}
            style={{
              ...styles.body,
              ...(marketplaceFullScroll ? styles.bodyMarketplaceScroll : null),
            }}
          >
            {view === 'upgrade' ? (
              <DemonKingUpgradePanel
                initialRequest={initialUpgradeRequest}
                dex={dex}
                evmWallet={evmWallet}
                evmAddress={evmAddress}
                solWallet={solWallet}
                solAddress={solAddress}
                aptosWallet={aptosWallet}
                aptosAddress={aptosAddress}
                evmChainId={evmChainId}
                onOpenEvmModal={() => setEvmModalOpen(true)}
                onConnectSolana={handleSolanaReady}
                onConnectAptos={() => {
                  try { aptosWallet?.connect?.(); } catch { /* user-cancel */ }
                }}
                setNotice={setNotice}
                setBusy={setBusy}
                busy={busy}
                onClose={onClose}
              />
            ) : view === 'bridge' ? (
              <NftBridgePanel
                styles={styles}
                evmWallet={evmWallet}
                evmAddress={evmAddress}
                onOpenEvmModal={handleBridgeEvmModal}
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
                    onClick={() => { setActiveShopTab(tab.id); setChainPickerOpen(false); setNotice(null); }}
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
            {/* Slider viewport — visible tab bodies sit side-by-side in a
                flex track and we slide via transform: translateX(). The
                viewport clips overflow so only the active tab is visible;
                each slide owns its own vertical scroll so the panel size
                stays stable across tabs. */}
            <div style={styles.shopActionRow}>
              {canSwitchPaymentChain && (
                <button
                  type="button"
                  onClick={() => setChainPickerOpen((open) => !open)}
                  style={styles.switchChainBtn}
                  title="Switch payment chain"
                >
                  <ChainLogoBadge chain={activePaymentChain} fallback={activePaymentChainLabel.slice(0, 3).toUpperCase()} small />
                  <span>{activePaymentChainLabel}</span>
                  <span style={styles.switchChainArrow}>{chainPickerOpen ? '^' : 'v'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => { setView('bridge'); setNotice(null); }}
                style={styles.bridgeMiniBtn}
                title="Bridge NFT between chains"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 7h12l-3-3" />
                  <path d="M17 17H5l3 3" />
                </svg>
                <span>Bridge</span>
              </button>
              <button
                type="button"
                onClick={() => { setView('upgrade'); setNotice(null); }}
                style={styles.bridgeMiniBtn}
                title="Upgrade Demon King NFT"
              >
                <span>Upgrade</span>
              </button>
            </div>
            {chainPickerOpen && (
              <ShopChainSwitcher
                activeChain={activePaymentChain}
                readiness={chainSwitchReadiness}
                onSelect={handleSwitchPanelChain}
              />
            )}
            <div style={{
              ...styles.sliderViewport,
              ...(marketplaceFullScroll ? styles.sliderViewportMarketplaceScroll : null),
            }}>
              <div
                style={{
                  ...styles.sliderTrack,
                  ...(marketplaceFullScroll ? styles.sliderTrackMarketplaceScroll : null),
                  transform: marketplaceFullScroll
                    ? 'none'
                    : `translateX(-${SHOP_TABS.findIndex((t) => t.id === activeShopTab) * 100}%)`,
                }}
              >
                {/* ─── Resources slide (index 0) ───────────────────── */}
                <div
                  className="shop-scroll"
                  style={{
                    ...styles.slide,
                    ...(marketplaceFullScroll ? styles.slideHiddenForMarketplaceScroll : null),
                  }}
                  aria-hidden={activeShopTab !== 'resources'}
                  inert={activeShopTab !== 'resources' ? true : undefined}
                >
                  <div style={{ ...styles.topRow, ...styles.topRowResources }}>
                    <div style={styles.summary}>
                      <span style={styles.heroName}>Game Resources</span>
                      <span style={styles.editionTag}>{SHOP_CHAIN_LABEL[shopChain] || 'Base'}: {shopChainChoice(shopChain)?.subtitle || 'USDC / native'}</span>
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
                    clashReady={!!gameShopConfig?.solana?.clashReady}
                    evmAddress={evmAddress}
                    evmOnChain={evmOnShopChain}
                    solAddress={solAddress}
                    preparingSolanaWallet={preparingPrivySolWallet}
                    aptosAddress={aptosWallet?.address || null}
                    busy={busy}
                    quantities={shopQuantities}
                    ownedProducts={{ ...(player?.shop_entitlements || {}), ...(player?.building_unlocks || {}) }}
                    onQuantityChange={handleShopQuantityChange}
                    onConnectBase={handleShopChainReady}
                    onConnectSolana={handleSolanaReady}
                    onConnectAptos={() => aptosWallet?.connect?.()}
                    onBuy={handleBuyGameProduct}
                  />
                </div>

                {/* ─── NFT slide (index 1) ─────────────────────────── */}
                {SHOW_NFT_MINT_TAB ? (
                <div
                  className="shop-scroll"
                  style={{
                    ...styles.slide,
                    ...(marketplaceFullScroll ? styles.slideHiddenForMarketplaceScroll : null),
                  }}
                  aria-hidden={activeShopTab !== 'nft'}
                  inert={activeShopTab !== 'nft' ? true : undefined}
                >
                  <div style={styles.topRow}>
                    <div style={styles.heroFrame}>
                      <div style={styles.heroGlow} />
                      {SALE_NFT_PUBLIC_REVEAL
                        ? <img src={SALE_NFT_IMG} alt={SALE_NFT_NAME} style={styles.heroImg} />
                        : <MysteryNftArt />}
                    </div>
                    <div style={styles.summary}>
                      <span style={styles.heroName}>{SALE_NFT_NAME}</span>
                      <span style={styles.editionTag}>
                        Genesis supply {saleMintLocked ? '???' : formatCount(displayedTotalSupplyInfo.maxSupply)}
                      </span>
                      {saleMintSoldOut && (
                        <span style={styles.soldOutPill}>SOLD OUT</span>
                      )}
                    </div>
                  </div>

                  <SupplyProgress supply={displayedTotalSupplyInfo} />
                  {saleMintSoldOut && (
                    <div style={styles.soldOutBox}>
                      {SALE_NFT_NAME} fresh mint is sold out.
                    </div>
                  )}

                  {saleMintLocked ? (
                    <div style={styles.mysteryLockedBox}>
                      <span style={styles.mysteryLockedMark}>???</span>
                    </div>
                  ) : NFT_MINT_SUPPORTED.has(selectedChain) ? (
                    <>
                      <div style={styles.options}>
                        {paymentOptions.map((option) => {
                          const active = option.id === selectedPayment;
                          const displayPrice = salePaymentPriceLabel(option, mintConfig);
                          const displayDealText = salePaymentDealText(option, mintConfig);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => { setSelectedPayment(option.id); setNotice(null); }}
                              disabled={saleMintSoldOut}
                              style={{
                                ...styles.optionBtn,
                                ...(active ? styles.optionBtnActive : null),
                                ...(saleMintSoldOut ? styles.optionBtnDisabled : null),
                              }}
                            >
                              <span style={styles.optionBadge}>
                                {tokenLogo(option.token)
                                  ? <img src={tokenLogo(option.token)} alt={option.token} style={styles.optionBadgeImg} />
                                  : <span>{option.token}</span>}
                              </span>
                              <span style={styles.optionMain}>
                                {option.method}
                                {option.dealLabel && <span style={styles.optionDiscountChip}>{option.dealLabel}</span>}
                              </span>
                              <span style={styles.optionPrice}>{displayPrice}</span>
                              {displayDealText && <span style={styles.optionDealText}>{displayDealText}</span>}
                              {saleMintSoldOut && <span style={styles.soonBadge}>SOLD OUT</span>}
                            </button>
                          );
                        })}
                      </div>

                      <QuantityStepper
                        label="Quantity"
                        value={mintQuantity}
                        onChange={setMintQuantity}
                        max={MAX_BATCH_QUANTITY}
                        disabled={saleMintSoldOut || !!busy}
                      />

                      <button
                        style={{
                          ...styles.mintBtn,
                          ...(primaryState.ready ? styles.mintBtnReady : null),
                          ...(saleMintSoldOut ? styles.mintBtnDisabled : null),
                          cursor: busy || saleMintSoldOut ? 'not-allowed' : 'pointer',
                        }}
                        onClick={handlePrimary}
                        disabled={!!busy || saleMintSoldOut}
                      >
                        <span style={styles.mintBtnGlyph}>
                          {!saleMintSoldOut && tokenLogo(selected.token)
                            ? <img src={tokenLogo(selected.token)} alt={selected.token} style={styles.mintBtnGlyphImg} />
                            : primaryState.glyph}
                        </span>
                        <span>
                          {primaryState.label}
                          {primaryState.ready && mintQuantity > 1 ? ` x${mintQuantity}` : ''}
                        </span>
                      </button>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 4px' }}>
                      <div style={{ fontSize: 13, color: '#5C3A21', lineHeight: 1.4 }}>
                        {SALE_NFT_NAME} mint isn't live on <b>{selectedChain.charAt(0).toUpperCase() + selectedChain.slice(1)}</b> yet.
                        Use Base, Solana, Arbitrum, or Monad for this drop.
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedChain('base');
                          setSelectedPayment(defaultPaymentForChain('base'));
                          setNotice(null);
                        }}
                        style={{
                          padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 800,
                          background: '#7ce04a', border: '2px solid #4a8f2c', color: '#1a3d0a',
                          cursor: 'pointer',
                        }}
                      >
                        Switch to Base
                      </button>
                    </div>
                  )}
                </div>
                ) : null}

                {/* ─── Marketplace slide ───────────────────────────────
                    Server-custodial marketplace: all-chain NFT escrow,
                    USDC payment, server settlement. */}
                <div
                  className="shop-scroll"
                  style={{
                    ...styles.slide,
                    ...(panelMobile ? styles.slideMobile : null),
                    ...(marketplaceFullScroll ? styles.marketplaceSlideFullScroll : null),
                    position: 'relative',
                  }}
                  aria-hidden={activeShopTab !== 'marketplace'}
                  inert={activeShopTab !== 'marketplace' ? true : undefined}
                >
                  <div style={{ ...styles.topRow, ...(panelMobile ? styles.topRowMarketplaceMobile : null) }}>
                    <div style={{ ...styles.heroFrame, ...(panelMobile ? styles.marketHeroFrameMobile : null) }}>
                      <div style={styles.heroGlow} />
                      <img
                        src={demonKingImg}
                        alt="Demon King"
                        style={styles.heroImg}
                      />
                    </div>
                    <div style={{ ...styles.summary, ...(panelMobile ? styles.marketSummaryMobile : null) }}>
                      <span style={{ ...styles.heroName, ...(panelMobile ? styles.marketHeroNameMobile : null) }}>Marketplace</span>
                      <span style={{ ...styles.editionTag, ...(panelMobile ? styles.marketEditionTagMobile : null) }}>List from any chain. Buy with USDC.</span>
                      <div style={{ ...styles.marketStats, ...(panelMobile ? styles.marketStatsMobile : null) }} aria-label="Marketplace stats">
                        <div style={{ ...styles.marketStat, ...(panelMobile ? styles.marketStatMobile : null) }}>
                          <span style={styles.marketStatLabel}>Listed</span>
                          <b style={{ ...styles.marketStatValue, ...(panelMobile ? styles.marketStatValueMobile : null) }}>{marketplaceStats.listedLabel}</b>
                        </div>
                        <div style={{ ...styles.marketStat, ...(panelMobile ? styles.marketStatMobile : null) }}>
                          <span style={styles.marketStatLabel}>Volume</span>
                          <b style={{ ...styles.marketStatValue, ...(panelMobile ? styles.marketStatValueMobile : null) }}>{marketplaceStats.volumeLabel}</b>
                        </div>
                        <div style={{ ...styles.marketStat, ...(panelMobile ? styles.marketStatMobile : null) }}>
                          <span style={styles.marketStatLabel}>Floor</span>
                          <b style={{ ...styles.marketStatValue, ...(panelMobile ? styles.marketStatValueMobile : null) }}>{marketplaceStats.floorLabel}</b>
                        </div>
                      </div>
                    </div>
                  </div>
                  <NftMarketplacePanel
                    chain={marketplaceChain}
                    evmAddress={evmAddress}
                    evmWallet={evmWallet}
                    evmOnBase={evmOnMarketplaceChain}
                    onConnectBase={handleMarketplaceReady}
                    onOpenEvmModal={handleBridgeEvmModal}
                    onConnectSolana={handleSolanaReady}
                    onConnectAptos={() => aptosWallet?.connect?.()}
                    solWallet={solWallet}
                    solAddress={solAddress}
                    aptosWallet={aptosWallet}
                    aptosAddress={aptosAddress}
                    sessionToken={sessionToken}
                    onStatsChange={setMarketplaceStats}
                  />
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
              chainLabel={SHOP_CHAIN_LABEL[selectedChain] || 'Base'}
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
        onClose={() => {
          setEvmModalOpen(false);
          setEvmModalTargetOverride(null);
        }}
        targetChain={evmModalTargetEvmChain}
        onConnected={({ provider, address, rdns }) => {
          setNftEvmWallet({ provider, address, rdns });
          setEvmChainId(evmModalTargetChainId);
          setEvmModalOpen(false);
          setEvmModalTargetOverride(null);
          setNotice(`${evmModalTargetLabel} wallet connected.`);
          addClientBreadcrumb('nft.connect_evm_success', { dex, scope: 'nft', chain: evmModalTargetEvmChain });
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
  base: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'eth',  label: 'ETH',  sub: 'Native' },
  ],
  arbitrum: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'eth',  label: 'ETH',  sub: 'Native' },
  ],
  monad: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'mon',  label: 'MON',  sub: 'Native' },
  ],
  ink: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'eth',  label: 'ETH',  sub: 'Native' },
  ],
  solana: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'sol',  label: 'SOL',  sub: 'Native' },
    { id: 'clash', label: 'CLASH', sub: '20% off' },
    { id: 'skr',  label: 'SKR',  sub: 'Seeker' },
  ],
  aptos: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'apt',  label: 'APT',  sub: 'Native' },
  ],
};

const SHOP_PAYMENT_TOKEN_ICONS = {
  usdc: '/tokens/USDC.svg',
  eth: '/tokens/ETH.svg',
  mon: '/tokens/MON.svg',
  sol: '/tokens/SOL.svg',
  clash: '/icons/icon-192.png',
  skr: '/tokens/SKR.png',
  apt: '/tokens/APT.png',
};

const SHOP_CHAIN_LABEL = {
  base:     'Base',
  arbitrum: 'Arbitrum',
  monad:    'Monad',
  ink:      'Ink',
  solana:   'Solana',
  aptos:    'Aptos',
};

const SHOP_CHAIN_CHOICES = [
  { id: 'base', title: 'Base', subtitle: 'USDC / ETH', badge: 'EVM' },
  { id: 'arbitrum', title: 'Arbitrum', subtitle: 'USDC / ETH', badge: 'EVM' },
  { id: 'monad', title: 'Monad', subtitle: 'USDC / MON', badge: 'EVM' },
  { id: 'ink', title: 'Ink', subtitle: 'USDC / ETH', badge: 'EVM' },
  { id: 'solana', title: 'Solana', subtitle: 'USDC / SOL / CLASH / SKR', badge: 'SOL' },
  { id: 'aptos', title: 'Aptos', subtitle: 'USDC / APT', badge: 'APT' },
];

function getShopPaymentOption(chain, payment) {
  const id = String(payment || '').toLowerCase();
  return (SHOP_PAYMENTS_BY_CHAIN[chain] || []).find((option) => option.id === id) || null;
}

function getShopPaymentLabel(chain, payment) {
  return getShopPaymentOption(chain, payment)?.label || String(payment || 'USDC').toUpperCase();
}

function getShopPurchaseExplorer(chain, tx) {
  if (!tx) return null;
  if (chain === 'base') return `https://basescan.org/tx/${tx}`;
  if (chain === 'arbitrum') return `https://arbiscan.io/tx/${tx}`;
  if (chain === 'monad') return `https://explorer.monad.xyz/tx/${tx}`;
  if (chain === 'ink') return `https://explorer.inkonchain.com/tx/${tx}`;
  if (chain === 'solana') return `https://solscan.io/tx/${tx}`;
  if (chain === 'aptos') return `https://explorer.aptoslabs.com/txn/${tx}`;
  return null;
}

function ShopChainSwitcher({ activeChain, readiness, onSelect }) {
  return (
    <div style={styles.chainSwitchPanel}>
      {SHOP_CHAIN_CHOICES.map((chain) => {
        const active = chain.id === activeChain;
        const ready = readiness?.[chain.id] !== false;
        return (
          <button
            key={chain.id}
            type="button"
            onClick={() => onSelect?.(chain.id)}
            style={{
              ...styles.chainSwitchBtn,
              ...(active ? styles.chainSwitchBtnActive : null),
              ...(!ready ? styles.chainSwitchBtnDisabled : null),
            }}
          >
            <ChainLogoBadge chain={chain.id} fallback={chain.badge} />
            <span style={styles.chainSwitchMain}>
              <span style={styles.chainSwitchName}>{chain.title}</span>
              <span style={styles.chainSwitchSub}>{ready ? chain.subtitle : 'Not live yet'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const DEMON_KING_EVM_UPGRADE_CHAINS = ['base', 'arbitrum', 'monad', 'ink'];
const DEMON_KING_UPGRADE_CHAINS = new Set([...DEMON_KING_EVM_UPGRADE_CHAINS, 'solana', 'aptos']);
const DEMON_KING_UPGRADE_PRICE_HINT = {
  usdc: '$8.90',
  eth: '~$8.90',
  mon: '~$8.90',
  sol: '~$8.90',
  skr: '~$8.90',
};

function shopChainChoice(chain) {
  return SHOP_CHAIN_CHOICES.find((choice) => choice.id === chain) || null;
}

function normalizeDemonKingUpgradeChain(chain) {
  const key = String(chain || '').toLowerCase();
  return DEMON_KING_UPGRADE_CHAINS.has(key) ? key : null;
}

function nftChainFromEvmChainId(chainId) {
  const id = Number(chainId);
  if (!Number.isFinite(id)) return null;
  return Object.entries(EVM_CHAIN_ID_BY_NFT_CHAIN)
    .find(([, value]) => Number(value) === id)?.[0] || null;
}

function resolveDemonKingUpgradeChain({
  initialRequest,
  dex,
  evmAddress,
  evmChainId,
  solAddress,
  aptosAddress,
}) {
  const explicit = normalizeDemonKingUpgradeChain(initialRequest?.chain || initialRequest?.nft?.chain);
  if (explicit) return explicit;

  const preferred = normalizeDemonKingUpgradeChain(DEX_TO_NFT_CHAIN[String(dex || '').toLowerCase()]);
  const activeEvm = evmAddress ? nftChainFromEvmChainId(evmChainId) : null;

  if (preferred) return preferred;
  if (activeEvm) return activeEvm;
  if (aptosAddress) return 'aptos';
  if (solAddress) return 'solana';
  return 'base';
}

function upgradePaymentForQuote(payment) {
  const value = String(payment || 'usdc').toLowerCase();
  if (value === 'mon') return 'native';
  return value;
}

function quotePaymentLabel(quote, fallbackLabel = '') {
  if (!quote?.priceFormatted) return '';
  const symbol = quote.priceSymbol || fallbackLabel || String(quote.payment || '').toUpperCase();
  return `${quote.priceFormatted} ${symbol}`.trim();
}

function DemonKingUpgradePanel({
  initialRequest,
  dex,
  evmWallet,
  evmAddress,
  solWallet,
  solAddress,
  aptosWallet,
  aptosAddress,
  evmChainId,
  onOpenEvmModal,
  onConnectSolana,
  onConnectAptos,
  setNotice,
  setBusy,
  busy,
  onClose,
}) {
  const chain = resolveDemonKingUpgradeChain({
    initialRequest,
    dex,
    evmAddress,
    evmChainId,
    solAddress,
    aptosAddress,
  });
  const [payment, setPayment] = useState('usdc');
  const [status, setStatus] = useState(initialRequest || null);
  const [owned, setOwned] = useState([]);
  const [selectedTokenId, setSelectedTokenId] = useState(() => String(initialRequest?.tokenId || initialRequest?.token_id || ''));
  const [manualTokenId, setManualTokenId] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);
  const [quotePreview, setQuotePreview] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const isEvmUpgradeChain = DEMON_KING_EVM_UPGRADE_CHAINS.includes(chain);
  const chainId = EVM_CHAIN_ID_BY_NFT_CHAIN[chain];
  const onCorrectChain = !isEvmUpgradeChain || (!!chainId && Number(evmChainId) === Number(chainId));
  const paymentOptions = useMemo(() => {
    if (isEvmUpgradeChain) {
      return (SHOP_PAYMENTS_BY_CHAIN[chain] || []).filter((option) => ['usdc', 'eth', 'mon'].includes(option.id));
    }
    if (chain === 'solana') {
      return (SHOP_PAYMENTS_BY_CHAIN.solana || []).filter((option) => ['usdc', 'sol', 'clash', 'skr'].includes(option.id));
    }
    if (chain === 'aptos') {
      return (SHOP_PAYMENTS_BY_CHAIN.aptos || []).filter((option) => option.id === 'usdc');
    }
    return [];
  }, [chain, isEvmUpgradeChain]);
  const selectedPaymentOption = paymentOptions.find((option) => option.id === payment) || null;
  const tokens = useMemo(() => (owned || []), [owned]);
  const tokenId = String(selectedTokenId || manualTokenId || '').trim();
  const selectedToken = useMemo(() => tokens.find((token) => String(token.tokenId) === tokenId) || null, [tokens, tokenId]);
  const statusNft = status?.nft || {};
  const statusMatchesToken = !!tokenId
    && String(statusNft.token_id ?? statusNft.tokenId ?? '') === tokenId
    && String(statusNft.chain || '').toLowerCase() === String(chain || '').toLowerCase();
  const troopNextLevel = Number(status?.next_level || status?.nextLevel || 0);
  const selectedTokenLevel = Number(selectedToken?.level || 0);
  const tokenAlreadyCoversTroopLevel = !!(troopNextLevel && selectedTokenLevel >= troopNextLevel);
  const nextLevel = tokenAlreadyCoversTroopLevel
    ? troopNextLevel
    : selectedTokenLevel > 0
      ? Math.min(3, selectedTokenLevel + 1)
      : (troopNextLevel || 2);
  const wins = Number(
    (statusMatchesToken ? (status?.battle_wins ?? status?.wins) : undefined)
    ?? selectedToken?.battleWins
    ?? selectedToken?.wins
    ?? 0
  );
  const statusRequiredWins = Number(status?.required_wins ?? status?.nextLevelRequiredWins ?? 0);
  const requiredWins = tokenAlreadyCoversTroopLevel
    ? 0
    : troopNextLevel === nextLevel && statusRequiredWins > 0
    ? statusRequiredWins
    : (nextLevel === 2 ? 1000 : 10000);
  const winsReady = requiredWins <= 0 || wins >= requiredWins;
  const quotePriceLabel = quotePaymentLabel(quotePreview, selectedPaymentOption?.label);
  const displayNextLevel = Number(quotePreview?.newLevel || nextLevel || 2);
  const ownerAddressForChain = chain === 'solana' ? solAddress : chain === 'aptos' ? aptosAddress : evmAddress;
  const chainWalletConnected = !!ownerAddressForChain;
  const actionReady = isEvmUpgradeChain
    ? !!(winsReady && evmAddress && tokenId)
    : !!(winsReady && chainWalletConnected && tokenId);
  const actionDisabled = !!busy || loading || (chainWalletConnected && !winsReady);

  const load = useCallback(async () => {
    const token = typeof window !== 'undefined' ? window._playerToken : null;
    setLoading(true);
    setNotice?.(null);
    try {
      const headers = token ? { 'x-token': token } : {};
      const statusRes = await fetch('/api/troops/demon_king/upgrade-status', { cache: 'no-store', headers });
      const statusJson = await statusRes.json().catch(() => ({}));
      if (statusRes.ok) setStatus(statusJson);
      if (ownerAddressForChain) {
        const ownedJson = await syncDemonKingNfts({ wallet: ownerAddressForChain, chains: [chain] });
        const nextTokens = ownedJson?.tokens || [];
        setOwned(nextTokens);
        setSelectedTokenId((prev) => {
          if (prev && nextTokens.some((tokenItem) => String(tokenItem.tokenId) === String(prev))) return prev;
          const firstUpgradeable = nextTokens.find((tokenItem) => Number(tokenItem.level || 1) < 3);
          return firstUpgradeable ? String(firstUpgradeable.tokenId) : '';
        });
      } else {
        setOwned([]);
        setSelectedTokenId('');
      }
    } catch (err) {
      setNotice?.((err?.message || 'Could not load Demon King NFTs').slice(0, 140));
    } finally {
      setLoading(false);
    }
  }, [chain, ownerAddressForChain, setNotice]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!chain || !tokenId) return () => { cancelled = true; };
    const playerToken = typeof window !== 'undefined' ? window._playerToken : null;
    if (!playerToken) return () => { cancelled = true; };

    async function loadTokenStatus() {
      try {
        const params = new URLSearchParams({ chain, tokenId });
        const res = await fetch(`/api/troops/demon_king/upgrade-status?${params.toString()}`, {
          cache: 'no-store',
          headers: { 'x-token': playerToken },
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setStatus(json);
      } catch {}
    }

    loadTokenStatus();
    return () => { cancelled = true; };
  }, [chain, tokenId]);

  useEffect(() => {
    if (paymentOptions.length && !paymentOptions.some((option) => option.id === payment)) {
      setPayment(paymentOptions[0].id);
    }
  }, [payment, paymentOptions]);

  useEffect(() => {
    let cancelled = false;
    setQuotePreview(null);
    setQuoteError('');
    if (!isEvmUpgradeChain) {
      if (!tokenId) {
        setQuoteLoading(false);
        return () => { cancelled = true; };
      }
      if (!winsReady) {
        setQuoteLoading(false);
        return () => { cancelled = true; };
      }
      const tokenLevel = Number(selectedToken?.level || 1);
      const contractNextLevel = Math.min(3, tokenLevel + 1);
      const requiredTroopLevel = Number(status?.next_level || status?.nextLevel || 0);
      const targetLevel = requiredTroopLevel && tokenLevel >= requiredTroopLevel
        ? tokenLevel
        : contractNextLevel;
      if (tokenLevel >= targetLevel) {
        setQuotePreview({
          alreadySynced: true,
          chain,
          tokenId,
          owner: ownerAddressForChain,
          newLevel: targetLevel,
        });
        setQuoteLoading(false);
        return () => { cancelled = true; };
      }
      if (chain === 'aptos' && ownerAddressForChain) {
        async function loadAptosQuotePreview() {
          setQuoteLoading(true);
          try {
            const quote = await fetchUpgradeQuote({
              chain: 'aptos',
              tokenId,
              owner: ownerAddressForChain,
              newLevel: targetLevel,
              payment: 'usdc',
            });
            if (!cancelled) setQuotePreview({ ...quote, stateLevel: tokenLevel });
          } catch (err) {
            if (!cancelled) setQuoteError((err?.shortMessage || err?.message || 'Aptos upgrade quote unavailable').slice(0, 140));
          } finally {
            if (!cancelled) setQuoteLoading(false);
          }
        }
        loadAptosQuotePreview();
        return () => { cancelled = true; };
      }
      setQuotePreview({
        chain,
        tokenId,
        owner: ownerAddressForChain,
        newLevel: targetLevel,
        payment,
        priceFormatted: DEMON_KING_UPGRADE_PRICE_HINT[payment] || '$8.90',
        priceSymbol: getShopPaymentLabel(chain, payment),
      });
      setQuoteLoading(false);
      return () => { cancelled = true; };
    }
    if (!evmAddress || !tokenId || !winsReady) {
      setQuoteLoading(false);
      return () => { cancelled = true; };
    }

    async function loadQuotePreview() {
      setQuoteLoading(true);
      try {
        const state = await fetchNftState(chain, tokenId, { evmWallet });
        if (!sameEvmAddress(state?.owner, evmAddress)) {
          throw new Error(`Demon King #${tokenId} is not owned by this wallet.`);
        }
        const levelBefore = Number(state?.level || selectedToken?.level || 1);
        const contractNextLevel = Math.min(3, levelBefore + 1);
        const requiredTroopLevel = Number(status?.next_level || status?.nextLevel || 0);
        const targetLevel = requiredTroopLevel && levelBefore >= requiredTroopLevel
          ? levelBefore
          : contractNextLevel;
        if (levelBefore >= targetLevel) {
          if (!cancelled) {
            setQuotePreview({ alreadySynced: true, chain, tokenId, owner: evmAddress, newLevel: targetLevel });
          }
          return;
        }
        const quote = await fetchUpgradeQuote({
          chain,
          tokenId,
          owner: evmAddress,
          newLevel: targetLevel,
          payment: upgradePaymentForQuote(payment),
        });
        if (!cancelled) setQuotePreview({ ...quote, stateLevel: levelBefore });
      } catch (err) {
        if (!cancelled) setQuoteError((err?.shortMessage || err?.message || 'Live quote unavailable').slice(0, 140));
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }

    loadQuotePreview();
    return () => { cancelled = true; };
  }, [chain, evmAddress, evmWallet, isEvmUpgradeChain, nextLevel, ownerAddressForChain, payment, selectedToken?.level, status?.nextLevel, status?.next_level, tokenId, winsReady]);

  const submitUpgrade = useCallback(async () => {
    if (!ownerAddressForChain) {
      if (chain === 'solana') onConnectSolana?.();
      else if (chain === 'aptos') onConnectAptos?.();
      else onOpenEvmModal?.();
      return;
    }
    if (isEvmUpgradeChain && (!evmAddress || !evmWallet)) {
      onOpenEvmModal?.();
      return;
    }
    if (!tokenId) {
      setNotice?.('Choose your Demon King NFT first.');
      return;
    }
    if (!winsReady) {
      setNotice?.(`Need ${requiredWins} battle wins for level ${nextLevel}.`);
      return;
    }
    setBusy?.('demon-king-upgrade');
    setNotice?.(isEvmUpgradeChain ? 'Signing Demon King upgrade...' : 'Preparing same-chain Demon King upgrade...');
    try {
      if (!isEvmUpgradeChain) {
        const levelBefore = Number(selectedToken?.level || quotePreview?.stateLevel || 1);
        const contractNextLevel = Math.min(3, levelBefore + 1);
        const requiredTroopLevel = Number(status?.next_level || status?.nextLevel || 0);
        const targetLevel = requiredTroopLevel && levelBefore >= requiredTroopLevel
          ? levelBefore
          : contractNextLevel;
        let upgradeTxHash = null;
        if (levelBefore < targetLevel) {
          if (chain === 'aptos') {
            setNotice?.('Signing Aptos Demon King upgrade...');
            const aptosResult = await upgradeAptosNft({
              aptosWallet,
              owner: ownerAddressForChain,
              tokenId,
              tokenAddress: tokenId,
              newLevel: targetLevel,
            });
            upgradeTxHash = aptosResult?.txHash || null;
          } else if (chain === 'solana') {
            if (!solWallet) throw new Error('Solana wallet is not connected');
            const sessionToken = typeof window !== 'undefined' ? window._playerToken : null;
            setNotice?.('Signing Solana Demon King upgrade payment...');
            const solResult = await buySolanaShopItem({
              solWallet,
              buyer: ownerAddressForChain,
              token: sessionToken,
              sku: 'demon_king_upgrade',
              payment,
              quantity: 1,
              redeemPath: '/api/nft/solana/upgrade/redeem',
              redeemExtra: { tokenId, newLevel: targetLevel },
            });
            upgradeTxHash = solResult?.grant?.metadataTxSignature || solResult?.signature || null;
          } else {
            throw new Error(`Unsupported upgrade chain: ${chain}`);
          }
        } else {
          setNotice?.('NFT is already upgraded. Syncing Demon King level...');
        }
        const synced = await syncDemonKingNfts({ wallet: ownerAddressForChain, chains: [chain], force: true }).catch(() => null);
        if (synced?.tokens) setOwned(synced.tokens);
        const levelAfter = Math.max(levelBefore, targetLevel);
        if (requiredTroopLevel && levelAfter < requiredTroopLevel) {
          setDone({ level: levelAfter, nftOnly: true });
          setNotice?.(`Demon King NFT upgraded to level ${levelAfter}. Upgrade once more to unlock level ${requiredTroopLevel}.`);
          return;
        }
        const res = await fetch('/api/troops/demon_king/upgrade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(typeof window !== 'undefined' && window._playerToken ? { 'x-token': window._playerToken } : {}),
          },
          body: JSON.stringify({ chain, tokenId, owner: ownerAddressForChain, txHash: upgradeTxHash }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) throw new Error(json?.error || `Upgrade sync failed (${res.status})`);
        setDone(json);
        setNotice?.(`Demon King upgraded to level ${json.level}.`);
        if (typeof window !== 'undefined' && window.godotBridge) {
          window.godotBridge(JSON.stringify({ action: 'refresh_troops', data: {} }));
        }
        return;
      }
      let state = null;
      try {
        state = await fetchNftState(chain, tokenId, { evmWallet });
      } catch (err) {
        if (err?.status === 404) {
          throw new Error(`Demon King #${tokenId} does not exist on ${SHOP_CHAIN_LABEL[chain] || chain}. Choose an NFT from your wallet list.`);
        }
        throw err;
      }
      if (!sameEvmAddress(state?.owner, evmAddress)) {
        throw new Error(`Demon King #${tokenId} is not owned by the connected wallet.`);
      }
      const levelBefore = Number(state?.level || selectedToken?.level || 1);
      const contractNextLevel = Math.min(3, levelBefore + 1);
      const requiredTroopLevel = Number(status?.next_level || status?.nextLevel || 0);
      const targetLevel = requiredTroopLevel && levelBefore >= requiredTroopLevel
        ? levelBefore
        : contractNextLevel;
      if (levelBefore >= targetLevel) {
        setNotice?.('NFT is already upgraded. Syncing Demon King level...');
      } else {
        const quotePayment = upgradePaymentForQuote(payment);
        const previewDeadline = Number(quotePreview?.deadline || 0);
        const previewUsable = quotePreview
          && !quotePreview.alreadySynced
          && String(quotePreview.chain) === String(chain)
          && String(quotePreview.tokenId) === String(tokenId)
          && sameEvmAddress(quotePreview.owner, evmAddress)
          && Number(quotePreview.newLevel) === Number(targetLevel)
          && String(quotePreview.payment) === String(quotePayment)
          && previewDeadline > Math.floor(Date.now() / 1000) + 30;
        if (previewUsable) {
          await executeUpgrade({ evmWallet, chainKey: chain, quoteResponse: quotePreview });
        } else {
          await upgradeNft({
            evmWallet,
            chainKey: chain,
            tokenId,
            owner: evmAddress,
            newLevel: targetLevel,
            payment: quotePayment,
          });
        }
      }
      const levelAfter = Math.max(levelBefore, targetLevel);
      const synced = await syncDemonKingNfts({ wallet: evmAddress, chains: [chain], force: true }).catch(() => null);
      if (synced?.tokens) setOwned(synced.tokens);
      if (requiredTroopLevel && levelAfter < requiredTroopLevel) {
        setDone({ level: levelAfter, nftOnly: true });
        setNotice?.(`Demon King NFT upgraded to level ${levelAfter}. Upgrade once more to unlock level ${requiredTroopLevel}.`);
        return;
      }
      const token = typeof window !== 'undefined' ? window._playerToken : null;
      const res = await fetch('/api/troops/demon_king/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-token': token } : {}),
        },
        body: JSON.stringify({ chain, tokenId, owner: evmAddress }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json?.error || `Upgrade sync failed (${res.status})`);
      setDone(json);
      setNotice?.(`Demon King upgraded to level ${json.level}.`);
      if (typeof window !== 'undefined' && window.godotBridge) {
        window.godotBridge(JSON.stringify({ action: 'refresh_troops', data: {} }));
      }
    } catch (err) {
      setNotice?.((err?.shortMessage || err?.message || 'Demon King upgrade failed').slice(0, 180));
    } finally {
      setBusy?.(null);
    }
  }, [aptosWallet, chain, evmAddress, evmWallet, isEvmUpgradeChain, nextLevel, onConnectAptos, onConnectSolana, onOpenEvmModal, ownerAddressForChain, payment, quotePreview, requiredWins, selectedToken?.level, setBusy, setNotice, solWallet, status?.nextLevel, status?.next_level, tokenId, winsReady]);

  return (
    <div className="shop-scroll" style={{ ...styles.slide, width: '100%', minWidth: 0 }}>
      <div style={styles.topRow}>
        <div style={styles.heroFrame}>
          <div style={styles.heroGlow} />
          <img src={demonKingImg} alt="Demon King" style={styles.heroImg} />
        </div>
        <div style={styles.summary}>
          <span style={styles.heroName}>Demon King Upgrade</span>
          <span style={styles.editionTag}>
            {requiredWins > 0
              ? `Level ${displayNextLevel}: ${wins} / ${requiredWins} wins`
              : `Level ${displayNextLevel}: NFT level verified`}
          </span>
          <span style={{ fontSize: 12, color: winsReady ? '#257a28' : '#9a5b0f', fontWeight: 900 }}>
            {winsReady ? 'Wins requirement complete' : 'Win more battles to unlock the NFT upgrade'}
          </span>
        </div>
      </div>

      {paymentOptions.length > 0 && (
        <div style={styles.options}>
          {paymentOptions.map((option) => {
            const active = payment === option.id;
            const livePrice = active && quotePriceLabel ? quotePriceLabel : '';
            const priceText = active
              ? (quoteLoading ? 'Loading quote...' : (livePrice || (quoteError ? 'Quote unavailable' : DEMON_KING_UPGRADE_PRICE_HINT[option.id] || option.sub)))
              : (DEMON_KING_UPGRADE_PRICE_HINT[option.id] || 'Live quote');
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setPayment(option.id)}
                style={{
                  ...styles.optionBtn,
                  ...(active ? styles.optionBtnActive : null),
                }}
              >
                <span style={styles.optionBadge}>
                  {tokenLogo(option.label) ? <img src={tokenLogo(option.label)} alt={option.label} style={styles.optionBadgeImg} /> : option.label}
                </span>
                <span style={styles.optionMain}>{option.label}</span>
                <span style={styles.optionPrice}>{priceText}</span>
              </button>
            );
          })}
        </div>
      )}

      {(quoteLoading || quoteError || quotePreview?.alreadySynced || quotePriceLabel) && (
        <div style={{ ...styles.quoteStrip, ...(quoteError ? styles.quoteStripWarn : null) }}>
          {quoteLoading
            ? 'Loading upgrade price...'
            : quotePreview?.alreadySynced
              ? 'NFT level already synced.'
              : quotePriceLabel
                ? `Upgrade price: ${quotePriceLabel}`
                : quoteError}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: '#5C3A21' }}>Your upgradeable NFTs</div>
        {tokens.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {tokens.map((tokenItem) => {
              const active = String(tokenItem.tokenId) === tokenId;
              return (
                <button
                  key={tokenItem.tokenId}
                  type="button"
                  onClick={() => { setSelectedTokenId(String(tokenItem.tokenId)); setManualTokenId(''); }}
                  style={{
                    ...styles.chainSwitchBtn,
                    ...(active ? styles.chainSwitchBtnActive : null),
                  }}
                >
                  <span style={styles.nftTokenBadge}>
                    <img
                      src={tokenItem.imageUrl || nftLevelImageUrl(tokenItem.level || 1, tokenItem.tokenId)}
                      alt={`Demon King #${tokenItem.tokenId}`}
                      style={styles.nftTokenImg}
                    />
                  </span>
                  <span style={styles.chainSwitchMain}>
                    <span style={styles.chainSwitchName}>#{tokenItem.tokenId}</span>
                    <span style={styles.chainSwitchSub}>
                      {Number(tokenItem.level || 1) >= 3 ? 'Sync L3' : `Upgrade to L${Math.min(3, Number(tokenItem.level || 1) + 1)}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#7c633e', lineHeight: 1.4 }}>
            {chainWalletConnected ? 'No upgradeable NFT auto-detected. Paste a token id if the indexer is behind.' : `Connect ${SHOP_CHAIN_LABEL[chain] || chain} wallet to load NFTs.`}
          </div>
        )}
        <input
          value={manualTokenId}
          onChange={(e) => {
            const nextValue = isEvmUpgradeChain
              ? e.target.value.replace(/[^0-9]/g, '')
              : e.target.value.replace(/\s/g, '');
            setManualTokenId(nextValue);
            setSelectedTokenId('');
          }}
          placeholder={isEvmUpgradeChain ? 'Token ID' : 'Token / asset ID'}
          style={styles.textInput}
        />
      </div>

      <button
        type="button"
        onClick={submitUpgrade}
        disabled={actionDisabled}
        style={{
          ...styles.mintBtn,
          ...(actionReady ? styles.mintBtnReady : null),
          ...(actionDisabled ? styles.mintBtnDisabled : null),
          cursor: actionDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={styles.mintBtnGlyph}>
          {isEvmUpgradeChain && evmAddress && onCorrectChain && tokenLogo(selectedPaymentOption?.label)
            ? <img src={tokenLogo(selectedPaymentOption.label)} alt={selectedPaymentOption.label} style={styles.mintBtnGlyphImg} />
            : isEvmUpgradeChain && evmAddress && !onCorrectChain && chainLogo(chain)
              ? <img src={chainLogo(chain)} alt={SHOP_CHAIN_LABEL[chain]} style={styles.mintBtnGlyphImg} />
              : chainLogo(chain)
                ? <img src={chainLogo(chain)} alt={SHOP_CHAIN_LABEL[chain]} style={styles.mintBtnGlyphImg} />
                : (chainWalletConnected ? 'UP' : 'W')}
        </span>
        <span>
          {!chainWalletConnected
            ? `Connect ${SHOP_CHAIN_LABEL[chain] || chain} wallet`
            : loading
              ? 'Loading...'
              : quoteLoading
                ? 'Loading price...'
                : !tokenId
                  ? 'Choose Demon King NFT'
                : quotePreview?.alreadySynced
                  ? 'Sync Demon King level'
                : quotePriceLabel
                  ? `Upgrade to Lv ${displayNextLevel} - ${quotePriceLabel}`
                  : `Upgrade to Lv ${displayNextLevel}`}
        </span>
      </button>

      {done && (
        <button type="button" onClick={onClose} style={styles.bridgeMiniBtn}>
          Done
        </button>
      )}
    </div>
  );
}

function GameResourcesTab({
  products,
  ready,
  loading,
  chain,
  payment,
  onPaymentChange,
  skrReady,
  clashReady,
  evmAddress,
  evmOnChain,
  solAddress,
  preparingSolanaWallet,
  aptosAddress,
  busy,
  quantities,
  ownedProducts,
  onQuantityChange,
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
                       : /* evm */              (!!evmAddress && evmOnChain);
  const walletPreparing = chain === 'solana' && !!preparingSolanaWallet;
  // Per-chain payment toggle. We filter project tokens off when the operator
  // hasn't configured their mint so the UI never
  // offers a payment path the server will reject with 503.
  const paymentOptions = (SHOP_PAYMENTS_BY_CHAIN[chain] || [])
    .filter((o) => o.id !== 'skr' || skrReady)
    .filter((o) => o.id !== 'clash' || clashReady);
  const paymentLabel = paymentOptions.length > 0
    ? (paymentOptions.find((o) => o.id === payment)?.label || 'USDC')
    : 'USDC';
  const needsEvmSwitch = chain !== 'solana' && chain !== 'aptos' && !!evmAddress && !evmOnChain;
  // Compact mobile labels — full-width "Connect Solana" / "Buy with USDC"
  // wraps on a 360px viewport. Strip the chain name on mobile.
  const connectLabel = walletPreparing
    ? (isMobile ? 'Preparing' : 'Preparing wallet...')
    : needsEvmSwitch
      ? (isMobile ? 'Switch' : `Switch ${chainLabel}`)
      : !walletConnected
        ? (isMobile ? 'Connect' : `Connect ${chainLabel}`)
        : (isMobile ? 'Connected' : `${chainLabel} connected`);

  function connectForChain() {
    if (chain === 'solana')  return onConnectSolana?.();
    if (chain === 'aptos')   return onConnectAptos?.();
    return onConnectBase?.(); // EVM chains all funnel through the shared wallet connect
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

      {/* Payment-token toggle for each chain's configured resource payments. */}
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
                {SHOP_PAYMENT_TOKEN_ICONS[opt.id] ? (
                  <img
                    src={SHOP_PAYMENT_TOKEN_ICONS[opt.id]}
                    alt=""
                    style={styles.shopPaymentIcon}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <span style={styles.shopPaymentFallbackIcon}>
                    {opt.label.slice(0, 3).toUpperCase()}
                  </span>
                )}
                <span style={styles.shopPaymentText}>
                  <span style={styles.shopPaymentLabel}>{opt.label}</span>
                  <span style={styles.shopPaymentSub}>{opt.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div style={styles.resourceGrid}>
        {products.map((product) => {
          const isBusy = busy === `shop:${product.id}`;
          const discounted = isShopDiscounted(product, chain, payment);
          const quantity = clampQuantity(quantities?.[product.id] || 1, product.maxQuantity || MAX_BATCH_QUANTITY);
          const owned = product.kind === 'altar' && !!(ownedProducts?.altar || ownedProducts?.[product.id] || ownedProducts?.[product.sku]);
          const unitUsd = shopUnitUsd(product, chain, payment);
          const priceUsd = formatUsdAmount(unitUsd * quantity);
          const displayRewards = multiplyRewards(product.rewards, quantity);
          const displayBoosts = formatBoosts(product.boosts);
          const canChangeQuantity = (product.maxQuantity || MAX_BATCH_QUANTITY) > 1;
          const actionLabel = walletPreparing
            ? (isMobile ? 'Preparing' : 'Preparing wallet...')
            : !walletConnected
            ? connectLabel
            : owned
              ? 'Owned'
            : isBusy
              ? (isMobile ? 'Buying' : 'Buying...')
              : (isMobile ? `Buy x${quantity}` : `Buy x${quantity} with ${paymentLabel}`);
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
            ...((ready && walletConnected && !owned) ? styles.resourceBuyBtnReady : null),
            ...((!ready || walletPreparing || owned) ? styles.resourceBuyBtnDisabled : null),
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
                  <span style={styles.resourcePrice}>
                    ${priceUsd}
                    {discounted && <span style={styles.resourceMeta}> 20% off</span>}
                  </span>
                  {product.durationHours && <span style={styles.resourceMeta}>{product.durationHours}h</span>}
                  {displayRewards && <span style={styles.resourceMeta}>{formatRewards(displayRewards)}</span>}
                  {displayBoosts && <span style={styles.resourceMeta}>{displayBoosts}</span>}
                </div>
                {canChangeQuantity && (
                  <QuantityStepper
                    value={quantity}
                    onChange={(next) => onQuantityChange?.(product.id, next, product.maxQuantity || MAX_BATCH_QUANTITY)}
                    max={product.maxQuantity || MAX_BATCH_QUANTITY}
                    disabled={!!busy}
                    compact
                  />
                )}
              </div>
              <button
                type="button"
                style={buyBtnStyle}
                disabled={!ready || !!busy || walletPreparing || owned}
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
  altar: altarImg,
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
  if (product.kind === 'altar') return <AltarGlyph size={78} />;
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

function AltarGlyph({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <ellipse cx="32" cy="51" rx="21" ry="7" fill="#6c4b82" opacity="0.35" />
      <path d="M18 43 L46 43 L50 51 L14 51 Z" fill="#7d5b8f" stroke="#3d244d" strokeWidth="3" strokeLinejoin="round" />
      <path d="M22 28 L42 28 L46 43 L18 43 Z" fill="#9b79ad" stroke="#3d244d" strokeWidth="3" strokeLinejoin="round" />
      <path d="M26 17 L38 17 L42 28 L22 28 Z" fill="#c4a0d7" stroke="#3d244d" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 7 C38 14 38 19 32 24 C26 19 26 14 32 7 Z" fill="#56d8ff" stroke="#126579" strokeWidth="3" />
      <path d="M32 13 C35 17 35 19 32 22" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 36 H43" stroke="rgba(255,255,255,0.4)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function QuantityStepper({ label = null, value, onChange, max = MAX_BATCH_QUANTITY, disabled = false, compact = false }) {
  const limit = Math.max(1, Math.floor(Number(max) || MAX_BATCH_QUANTITY));
  const count = clampQuantity(value, limit);
  const wrapperStyle = compact ? styles.quantityStepperCompact : styles.quantityStepper;
  const btnStyle = compact ? styles.quantityBtnCompact : styles.quantityBtn;
  return (
    <div style={wrapperStyle}>
      {label && <span style={styles.quantityLabel}>{label}</span>}
      <div style={styles.quantityControls}>
        <button
          type="button"
          style={btnStyle}
          disabled={disabled || count <= 1}
          onClick={() => onChange?.(clampQuantity(count - 1, limit))}
          aria-label="Decrease quantity"
        >
          -
        </button>
        <input
          type="number"
          min="1"
          max={limit}
          step="1"
          value={count}
          disabled={disabled}
          onChange={(e) => onChange?.(clampQuantity(e.target.value, limit))}
          style={compact ? styles.quantityInputCompact : styles.quantityInput}
          aria-label={label || 'Quantity'}
        />
        <button
          type="button"
          style={btnStyle}
          disabled={disabled || count >= limit}
          onClick={() => onChange?.(clampQuantity(count + 1, limit))}
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>
    </div>
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

async function handleBaseMint({ selected, evmAddress, evmWallet, setBusy, setNotice, setMintStatus, setMintResult, refreshMintConfig, afterMint, dex, quantity = 1 }) {
  const payment = selected.id === 'base-usdc' ? 'usdc' : 'eth';
  const count = clampQuantity(quantity);
  setBusy('mint');
  setMintStatus?.('pending');
  setMintResult?.({ quantity: count });
  setNotice(null);
  try {
    const result = await mintBaseNft({
      evmWallet,
      buyer: evmAddress,
      payment,
      quantity: count,
    });
    addClientBreadcrumb('nft.base_mint_submitted', {
      dex,
      payment,
      quantity: count,
      tx: result.hash,
    });
    setMintResult?.({
      chain: 'base',
      tx: result.hash,
      payment,
      quantity: count,
      explorer: result.hash ? `https://basescan.org/tx/${result.hash}` : null,
    });
    setMintStatus?.('success');
    void refreshMintConfig?.({ log: false });
    void afterMint?.().catch((err) => {
      addClientBreadcrumb('nft.sale_after_mint_failed', {
        dex,
        chain: 'base',
        message: err?.message || String(err),
      }, 'warn');
    });
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
async function handleEvmMint({ selected, chain, evmAddress, evmWallet, setBusy, setNotice, setMintStatus, setMintResult, refreshMintConfig, afterMint, dex, quantity = 1 }) {
  const payment = /usdc$/i.test(selected.id) ? 'usdc' : 'native';
  const count = clampQuantity(quantity);
  setBusy('mint');
  setMintStatus?.('pending');
  setMintResult?.({ quantity: count });
  setNotice(null);
  try {
    const result = await mintEvmNft({
      evmWallet, chain, buyer: evmAddress, payment, quantity: count,
    });
    addClientBreadcrumb('nft.evm_mint_submitted', { dex, chain, payment, quantity: count, tx: result.hash });
    const explorerBase = chain === 'arbitrum'
      ? 'https://arbiscan.io/tx/'
      : chain === 'ink'
        ? 'https://explorer.inkonchain.com/tx/'
        : 'https://explorer.monad.xyz/tx/';
    setMintResult?.({
      chain,
      tx: result.hash,
      payment,
      quantity: count,
      explorer: result.hash ? `${explorerBase}${result.hash}` : null,
    });
    setMintStatus?.('success');
    void refreshMintConfig?.({ log: false });
    void afterMint?.().catch((err) => {
      addClientBreadcrumb('nft.sale_after_mint_failed', {
        dex,
        chain,
        message: err?.message || String(err),
      }, 'warn');
    });
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
async function handleAptosMint({ selected, aptosWallet, setBusy, setNotice, setMintStatus, setMintResult, refreshMintConfig, afterMint, dex, quantity = 1 }) {
  const buyer = aptosWallet?.address;
  if (!buyer) { setNotice('Connect Aptos wallet first.'); return; }
  const payment = selected?.id === 'aptos-apt' ? 'apt' : 'usdc';
  const count = clampQuantity(quantity);
  setBusy('mint');
  setMintStatus?.('pending');
  setMintResult?.({ quantity: count });
  setNotice(null);
  try {
    const result = await mintAptosNft({ aptosWallet, buyer, quantity: count, payment });
    addClientBreadcrumb('nft.aptos_mint_submitted', { dex, payment, quantity: count, tx: result.hash });
    setMintResult?.({
      chain: 'aptos',
      tx: result.hash,
      payment,
      quantity: count,
      explorer: result.hash ? `https://explorer.aptoslabs.com/txn/${result.hash}` : null,
    });
    setMintStatus?.('success');
    void refreshMintConfig?.({ log: false });
    void afterMint?.().catch((err) => {
      addClientBreadcrumb('nft.sale_after_mint_failed', {
        dex,
        chain: 'aptos',
        message: err?.message || String(err),
      }, 'warn');
    });
  } catch (err) {
    const message = err?.shortMessage || err?.message || 'Aptos mint failed';
    setNotice(message.slice(0, 140));
    setMintStatus?.('idle');
    addClientBreadcrumb('nft.aptos_mint_failed', { dex, payment, message }, 'warn');
  } finally {
    setBusy(null);
  }
}

async function handleSolanaMint({ selected, solWallet, config, setBusy, setNotice, setMintStatus, setMintResult, refreshMintConfig, afterMint, dex, quantity = 1 }) {
  const payment = String(selected?.token || '').toLowerCase() === 'skr'
    ? 'skr'
    : String(selected?.token || '').toLowerCase() === 'clash'
      ? 'clash'
    : selected.id === 'sol-sol' ? 'sol' : 'usdc';
  const count = clampQuantity(quantity);
  setBusy('mint');
  setMintStatus?.('pending');
  setMintResult?.({ quantity: count, progressText: count > 1 ? `Minting 1 of ${count}` : null });
  setNotice(null);
  try {
    const minted = [];
    for (let i = 0; i < count; i += 1) {
      setMintResult?.({
        quantity: count,
        progressText: count > 1 ? `Minting ${i + 1} of ${count}` : null,
        minted: i,
      });
      const result = await mintSolanaNft({
        solWallet,
        config,
        payment,
      });
      minted.push(result);
      addClientBreadcrumb('nft.solana_mint_submitted', {
        dex,
        payment,
        quantity: count,
        index: i + 1,
        tx: result.signature,
        asset: result.asset,
      });
    }
    const result = minted[minted.length - 1] || {};
    setMintResult?.({
      chain: 'solana',
      tx: result.signature,
      payment,
      asset: result.asset,
      quantity: count,
      txs: minted.map((item) => item.signature).filter(Boolean),
      assets: minted.map((item) => item.asset).filter(Boolean),
      explorer: result.signature ? `https://solscan.io/tx/${result.signature}` : null,
    });
    setMintStatus?.('success');
    void refreshMintConfig?.({ log: false });
    void afterMint?.().catch((err) => {
      addClientBreadcrumb('nft.sale_after_mint_failed', {
        dex,
        chain: 'solana',
        message: err?.message || String(err),
      }, 'warn');
    });
  } catch (err) {
    const message = err?.shortMessage || err?.message || 'Solana mint failed';
    setNotice(message.slice(0, 140));
    setMintStatus?.('idle');
    addClientBreadcrumb('nft.solana_mint_failed', { dex, payment, message }, 'warn');
  } finally {
    setBusy(null);
  }
}

function getPrimaryState({ selected, soldOut = false, evmAddress, evmOnBase, solAddress, aptosAddress, preparingPrivySolWallet, solanaConfigured, solanaSaleActive, busy }) {
  if (soldOut) return { label: 'SOLD OUT', glyph: '!', ready: false };
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
  if (selected.chain === 'arbitrum' || selected.chain === 'monad' || selected.chain === 'ink') {
    const label = selected.chain === 'arbitrum' ? 'Arbitrum' : selected.chain === 'monad' ? 'Monad' : 'Ink';
    const glyph = selected.chain === 'arbitrum' ? 'A' : selected.chain === 'monad' ? 'M' : 'I';
    if (!evmAddress) return { label: `Connect ${label} wallet`, glyph, ready: false };
    return { label: `Mint with ${selected.token}`, glyph, ready: true };
  }
  if (selected.chain === 'aptos') {
    if (!aptosAddress) return { label: 'Connect Aptos wallet', glyph: 'A', ready: false };
    return { label: `Mint with ${selected.token}`, glyph: 'A', ready: true };
  }
  if (!solAddress && preparingPrivySolWallet) return { label: 'Preparing Privy wallet...', glyph: 'S', ready: false };
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

function MysteryNftArt() {
  return (
    <div style={styles.mysteryHeroArt} aria-label="???">
      <span style={styles.mysteryHeroMark}>?</span>
      <span style={{ ...styles.mysteryHeroMark, ...styles.mysteryHeroMarkSmall, left: 18, top: 20 }}>?</span>
      <span style={{ ...styles.mysteryHeroMark, ...styles.mysteryHeroMarkSmall, right: 18, bottom: 18 }}>?</span>
    </div>
  );
}

function SupplyProgress({ supply }) {
  if (supply?.masked) {
    return (
      <div style={styles.supplyBox}>
        <div style={styles.supplyTop}>
          <span style={styles.supplyTitle}>???</span>
          <span style={styles.supplyRemaining}>???</span>
        </div>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: '18%' }} />
        </div>
        <div style={styles.supplyMeta}>
          <span>???</span>
          <span>???</span>
        </div>
      </div>
    );
  }
  const loaded = !!supply?.loaded;
  const barWidth = loaded ? Math.max(2, Math.min(100, supply.progress)) : 12;
  const remainingText = loaded ? `${formatCount(supply.remaining)} left` : 'Checking chain';
  const mintedText = loaded
    ? (supply.fractionLabel || `${formatCount(supply.totalMinted)} minted`)
    : 'Syncing';
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
  const quantity = clampQuantity(result?.quantity || 1);
  const mintLabel = quantity > 1 ? `${quantity} ${SALE_NFT_NAME}s` : SALE_NFT_NAME;
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
            {SALE_NFT_PUBLIC_REVEAL
              ? <img src={SALE_NFT_IMG} alt={SALE_NFT_NAME} style={overlayStyles.cardImg} />
              : <div style={overlayStyles.cardQuestion}>?</div>}
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
                {result?.progressText || `Waiting for ${mintLabel} confirmation`}
                <span className="nft-mint-dots" />
              </span>
              <span style={overlayStyles.hint}>Keep this window open - the tx is propagating.</span>
            </>
          ) : (
            <>
              <span style={overlayStyles.titleSuccess}>{quantity > 1 ? 'Mints Complete' : 'Mint Complete'}</span>
              <span style={overlayStyles.subtitleSuccess}>
                {mintLabel} now {quantity > 1 ? 'live' : 'lives'} on {chainLabel}.
              </span>
              {result?.tx && (
                <span style={overlayStyles.txChip}>tx - {shortAddress(result.tx)}</span>
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
  const isAltar = product?.kind === 'altar';
  const chain = result?.chain || 'base';
  const chainLabel = SHOP_CHAIN_LABEL[chain] || chain;
  const paymentLabel = result?.paymentLabel || getShopPaymentLabel(chain, result?.payment);
  const quantity = clampQuantity(result?.quantity || 1, product?.maxQuantity || MAX_BATCH_QUANTITY);

  let successHeadline = 'Purchase Complete';
  let successDetail = null;
  if (success && product) {
    if (isShield) {
      const until = grant?.shield_until ? new Date(grant.shield_until + 'Z') : null;
      successHeadline = 'Shield Activated';
      successDetail = until
        ? `Base protected until ${until.toLocaleString()}`
        : `Your base is protected for ${(product.durationHours || 24) * quantity}h.`;
    } else if (isAltar) {
      successHeadline = 'Altar Activated';
      successDetail = product.subtitle || 'Resource and base boosts are now active.';
    } else if (grant?.resources) {
      const rewards = multiplyRewards(product.rewards, quantity) || {};
      const parts = [];
      if (rewards.gold) parts.push(`+${rewards.gold.toLocaleString()} gold`);
      if (rewards.wood) parts.push(`+${rewards.wood.toLocaleString()} wood`);
      if (rewards.ore) parts.push(`+${rewards.ore.toLocaleString()} ore`);
      successHeadline = quantity > 1 ? `${product.title} x${quantity} Delivered` : `${product.title} Delivered`;
      successDetail = parts.length ? parts.join('  ·  ') : 'Resources added to your stockpile.';
    } else {
      successHeadline = quantity > 1 ? `${product.title} x${quantity} Purchased` : `${product.title} Purchased`;
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
            ) : isAltar ? (
              <div style={overlayStyles.cardGlyph}>
                <AltarGlyph size={132} />
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
                Buying {product?.title || 'item'}{quantity > 1 ? ` x${quantity}` : ''}
              </span>
              <span style={overlayStyles.subtitle}>
                Confirm in wallet, then waiting for tx<span className="nft-mint-dots" />
              </span>
              <span style={overlayStyles.hint}>
                Keep this window open — paying with {paymentLabel} on {chainLabel}.
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
  cardQuestion: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#5C3A21',
    fontSize: 82,
    fontWeight: 900,
    lineHeight: 1,
    textShadow: '0 5px 0 rgba(255,255,255,0.45), 0 12px 18px rgba(0,0,0,0.32)',
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
    borderWidth: 4,
    borderStyle: 'solid',
    borderColor: 'transparent',
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
     scrollbar is just track + thumb. display:none collapses both
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
  // with icon + "Bridge" label. Sits right under the dynamic supply chip
  // so it's visually grouped with the NFT preview, not the modal chrome.
  heroBridgeBtn: {
    alignSelf: 'flex-start',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    marginTop: 4, padding: '5px 10px',
    borderRadius: 999, background: '#fff6dc',
    border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer', fontSize: 12, fontWeight: 700,
    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
  },
  shopActionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  switchChainBtn: {
    flex: '1 1 auto',
    minHeight: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: '2px solid #8c6a3c',
    borderRadius: 11,
    background: 'linear-gradient(180deg, #fff8df 0%, #dfc996 100%)',
    color: '#5C3A21',
    fontSize: 12,
    fontWeight: 900,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 5px rgba(0,0,0,0.16)',
  },
  switchChainArrow: {
    fontSize: 10,
    color: '#876033',
    lineHeight: 1,
  },
  bridgeMiniBtn: {
    flex: '0 0 auto',
    minHeight: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 12px',
    border: '2px solid #9f8759',
    borderRadius: 11,
    background: '#fffaf0',
    color: '#5C3A21',
    fontSize: 12,
    fontWeight: 900,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  textInput: {
    minHeight: 38,
    border: '2px solid #d4c8b0',
    borderRadius: 10,
    background: '#fffdf4',
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 800,
    fontFamily: 'inherit',
    padding: '0 10px',
    outline: 'none',
  },
  chainSwitchPanel: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
    marginBottom: 8,
    padding: 8,
    border: '2px solid #d4c8b0',
    borderRadius: 12,
    background: '#fff8df',
  },
  chainSwitchBtn: {
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    border: '2px solid #d4c8b0',
    borderRadius: 10,
    background: '#fffdf4',
    color: '#5C3A21',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '6px 8px',
    minWidth: 0,
  },
  chainSwitchBtnActive: {
    border: '2px solid #1d6fe0',
    background: 'linear-gradient(180deg, #e8f1ff 0%, #c5dbff 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 4px rgba(0,0,0,0.12)',
  },
  chainSwitchBtnDisabled: {
    opacity: 0.55,
  },
  chainSwitchBadge: {
    flex: '0 0 auto',
    minWidth: 28,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    background: '#5C3A21',
    color: '#fff6dc',
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 0.4,
  },
  chainLogoBadge: {
    flex: '0 0 auto',
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#fffaf0',
    border: '2px solid #d4c8b0',
    color: '#5C3A21',
    fontSize: 9,
    fontWeight: 900,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), 0 2px 4px rgba(0,0,0,0.12)',
  },
  chainLogoBadgeSmall: {
    flex: '0 0 auto',
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#fffaf0',
    border: '1px solid rgba(92,58,33,0.22)',
    color: '#5C3A21',
    fontSize: 8,
    fontWeight: 900,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
  },
  chainLogoImg: {
    width: '82%',
    height: '82%',
    objectFit: 'contain',
    display: 'block',
    borderRadius: '50%',
  },
  chainSwitchMain: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    lineHeight: 1.15,
  },
  chainSwitchName: {
    fontSize: 12,
    fontWeight: 900,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  chainSwitchSub: {
    fontSize: 10,
    fontWeight: 800,
    color: '#8b6b3f',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  body: {
    flex: 1, minHeight: 0,
    padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
    // The slider viewport handles overflow internally so each slide can
    // scroll independently — the body itself never scrolls.
    overflow: 'hidden',
  },
  bodyMarketplaceScroll: {
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fdf8e7',
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
  sliderViewportMarketplaceScroll: {
    flex: '0 0 auto',
    minHeight: 'auto',
    height: 'auto',
    overflow: 'visible',
  },
  sliderTrack: {
    display: 'flex',
    width: '100%', height: '100%',
    transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
    willChange: 'transform',
  },
  sliderTrackMarketplaceScroll: {
    display: 'block',
    height: 'auto',
    transition: 'none',
    willChange: 'auto',
  },
  slide: {
    flex: '0 0 100%',
    minWidth: 0,
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    padding: '0 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
    // Firefox-specific scrollbar tint — thumb/track colors. WebKit-based
    // browsers pick up the `.shop-scroll::-webkit-scrollbar*` rules in
    // MINT_ANIM_CSS so they match the parchment palette across engines.
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fdf8e7',
  },
  slideHiddenForMarketplaceScroll: {
    display: 'none',
  },
  marketplaceSlideFullScroll: {
    flex: '0 0 auto',
    height: 'auto',
    minHeight: 0,
    overflowY: 'visible',
    scrollbarWidth: 'auto',
  },
  slideMobile: {
    padding: '0 10px',
    overflowX: 'hidden',
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
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  topRowMarketplaceMobile: {
    gridTemplateColumns: '72px minmax(0, 1fr)',
    gap: 8,
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
    boxSizing: 'border-box',
    borderRadius: 18,
    background: 'radial-gradient(circle at 50% 35%, #f3e6c4 0%, #d8c190 60%, #b89a64 100%)',
    border: '5px solid #d4c8b0',
    boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.18), 0 8px 18px rgba(0,0,0,0.28)',
    overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  marketHeroFrameMobile: {
    width: 72,
    height: 72,
    boxSizing: 'border-box',
    borderRadius: 14,
    border: '3px solid #d4c8b0',
    boxShadow: 'inset 0 3px 7px rgba(0,0,0,0.18), 0 5px 12px rgba(0,0,0,0.24)',
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
  // Marketplace hero — same frame as the Demon King hero, but the icon
  // is a monochrome game-icons.net "shop" SVG painted in the parchment
  // brown so it reads as part of the panel rather than a stock image.
  // Inset padding keeps the line-art from kissing the frame border.
  mysteryHeroArt: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 50% 38%, #fff7df 0%, #d8c190 62%, #8b6b3f 100%)',
  },
  mysteryHeroMark: {
    position: 'relative',
    zIndex: 1,
    color: '#5C3A21',
    fontSize: 70,
    fontWeight: 900,
    lineHeight: 1,
    textShadow: '0 4px 0 rgba(255,255,255,0.45), 0 8px 12px rgba(0,0,0,0.28)',
  },
  mysteryHeroMarkSmall: {
    position: 'absolute',
    fontSize: 28,
    opacity: 0.72,
  },
  marketHeroImg: {
    position: 'relative',
    width: '76%', height: '76%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 8px rgba(92,58,33,0.35))',
  },
  summary: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  marketSummaryMobile: {
    minWidth: 0,
    gap: 4,
  },
  heroName: {
    fontSize: 22, fontWeight: 900, color: '#5C3A21',
    letterSpacing: 0,
    lineHeight: 1,
  },
  marketHeroNameMobile: {
    fontSize: 20,
    lineHeight: 1.05,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  editionTag: {
    fontSize: 11, fontWeight: 900, color: '#8b6b3f',
    textTransform: 'uppercase', letterSpacing: 0,
  },
  marketEditionTagMobile: {
    fontSize: 10,
    lineHeight: 1.1,
  },
  marketStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 7,
    maxWidth: 360,
    marginTop: 4,
  },
  marketStatsMobile: {
    width: '100%',
    maxWidth: 'none',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 5,
    marginTop: 2,
  },
  marketStat: {
    minWidth: 0,
    boxSizing: 'border-box',
    minHeight: 44,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 1,
    padding: '6px 8px',
    borderRadius: 9,
    border: '2px solid #d4c8b0',
    background: '#fff8df',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 5px rgba(92,58,33,0.12)',
  },
  marketStatMobile: {
    minHeight: 38,
    padding: '5px 6px',
    borderRadius: 8,
  },
  marketStatLabel: {
    fontSize: 9,
    fontWeight: 900,
    color: '#9b7c4a',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 1,
  },
  marketStatValue: {
    minWidth: 0,
    color: '#5C3A21',
    fontSize: 15,
    fontWeight: 900,
    lineHeight: 1.05,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  marketStatValueMobile: {
    fontSize: 14,
  },
  soldOutPill: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'fit-content',
    marginTop: 2,
    padding: '5px 10px',
    borderRadius: 8,
    background: '#5C3A21',
    color: '#fff7df',
    border: '2px solid #2d1706',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0,
    boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
  },
  soldOutBox: {
    borderRadius: 8,
    border: '2px solid #5C3A21',
    background: '#f2e0ba',
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1.35,
    textAlign: 'center',
    padding: '10px 12px',
  },
  mysteryLockedBox: {
    minHeight: 106,
    borderRadius: 8,
    border: '2px dashed #8b6b3f',
    background: 'linear-gradient(180deg, #fff8df 0%, #eadbb6 100%)',
    color: '#5C3A21',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
  },
  mysteryLockedMark: {
    fontSize: 30,
    fontWeight: 900,
    letterSpacing: 0,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: '2px solid #c2ae83',
    borderRadius: 9,
    background: '#fff',
    color: '#77573d',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '4px 8px',
  },
  shopPaymentBtnActive: {
    border: '2px solid #1d6fe0',
    background: 'linear-gradient(180deg, #e8f1ff 0%, #c5dbff 100%)',
    color: '#0e3a72',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.12)',
  },
  shopPaymentLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1.05,
  },
  shopPaymentSub: {
    display: 'block',
    fontSize: 9,
    fontWeight: 800,
    opacity: 0.7,
    lineHeight: 1.1,
  },
  shopPaymentText: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    textAlign: 'left',
  },
  shopPaymentIcon: {
    width: 20,
    height: 20,
    objectFit: 'contain',
    borderRadius: 6,
    overflow: 'hidden',
    flex: '0 0 auto',
    filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))',
  },
  shopPaymentFallbackIcon: {
    width: 24,
    height: 20,
    borderRadius: 6,
    background: '#5C3A21',
    color: '#fff7df',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: 0.2,
    flex: '0 0 auto',
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
    // `gap: 10` is inherited from resourceCard — don't redeclare it as
    // rowGap/columnGap here, that mixes shorthand + longhand and trips
    // React's "Removing rowGap when gap is set" warning on re-render.
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
  quantityStepper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    background: '#fff8df',
    padding: '8px 10px',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.55)',
  },
  quantityStepperCompact: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  quantityLabel: {
    color: '#5C3A21',
    fontSize: 12,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  quantityControls: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  quantityBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    border: '2px solid #9f8759',
    background: 'linear-gradient(180deg, #fff6dc 0%, #d7c69f 100%)',
    color: '#5C3A21',
    fontSize: 17,
    fontWeight: 900,
    lineHeight: 1,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  quantityBtnCompact: {
    width: 24,
    height: 24,
    borderRadius: 7,
    border: '2px solid #9f8759',
    background: '#fff6dc',
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  quantityInput: {
    width: 52,
    height: 30,
    borderRadius: 9,
    border: '2px solid #d4c8b0',
    background: '#fffaf0',
    color: '#5C3A21',
    fontSize: 14,
    fontWeight: 900,
    textAlign: 'center',
    fontFamily: 'inherit',
  },
  quantityInputCompact: {
    width: 42,
    height: 24,
    borderRadius: 7,
    border: '2px solid #d4c8b0',
    background: '#fffaf0',
    color: '#5C3A21',
    fontSize: 12,
    fontWeight: 900,
    textAlign: 'center',
    fontFamily: 'inherit',
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
  // Promotional banner highlighting the CLASH-token discount. Sits
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
    gridTemplateRows: 'auto auto auto',
    columnGap: 8,
    rowGap: 3,
    alignItems: 'center',
    color: '#5C3A21',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    minHeight: 74,
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
    gridRow: '1 / span 3',
    width: 40, height: 40,
    minWidth: 40,
    padding: 0,
    borderRadius: '50%',
    background: 'transparent',
    color: '#5C3A21',
    fontSize: 10,
    fontWeight: 900,
    textAlign: 'center',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  optionBadgeImg: {
    width: '100%', height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
  },
  // Small green chip pinned next to the discounted option label to mark the
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
  optionDealText: {
    minWidth: 0,
    fontSize: 10,
    fontWeight: 900,
    color: '#8a4a08',
    textTransform: 'uppercase',
    lineHeight: 1,
  },
  quoteStrip: {
    minHeight: 34,
    borderRadius: 11,
    border: '2px solid #d4c8b0',
    background: '#fff8df',
    color: '#5C3A21',
    fontSize: 12,
    fontWeight: 900,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    lineHeight: 1.2,
  },
  quoteStripWarn: {
    border: '2px solid #d69b2d',
    background: '#fff1cc',
    color: '#7d4c0f',
  },
  nftTokenBadge: {
    flex: '0 0 auto',
    width: 42,
    height: 42,
    borderRadius: 10,
    border: '2px solid #d4c8b0',
    background: '#fffaf0',
    overflow: 'hidden',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 5px rgba(0,0,0,0.16)',
  },
  nftTokenImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
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
    width: 26, height: 26,
    minWidth: 26,
    borderRadius: '50%',
    background: 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 900,
    overflow: 'hidden',
    padding: 0,
  },
  mintBtnGlyphImg: {
    width: '100%', height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
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
