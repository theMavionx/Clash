import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CUSTODIAL_EVM_CHAIN_IDS,
  cancelCustodialListing,
  createCustodialListing,
  depositNftToCustody,
  fetchCustodialOrder,
  fetchCustodialListings,
  fetchCustodialMarketplaceConfig,
  fetchMyCustodialOrders,
  formatCustodialUsdc,
  payCustodialOrder,
  releaseCustodialReservation,
} from '../lib/custodialMarketplace';
import { clearDemonKingNftCache, fetchOwnedNfts, nftLevelImageUrl } from '../lib/nftV3Client';
import { addClientBreadcrumb, reportClientEvent } from '../lib/clientLogger';
import {
  isSolanaMobileWalletAdapter,
  solanaWalletAdapterIdentity,
  solanaWalletAdapterName,
  solanaWalletAdapterUrl,
} from '../lib/solanaSeekerTx';

const PAGE_SIZE = 50;
const CHAIN_LABEL = { base: 'Base', arbitrum: 'Arbitrum', monad: 'Monad', solana: 'Solana', aptos: 'Aptos' };
const CHAIN_LOGO_SRC = {
  base: '/tokens/BASE.svg',
  arbitrum: '/tokens/ARB.svg',
  monad: '/tokens/MON.svg',
  solana: '/tokens/SOL.svg',
  aptos: '/tokens/APT.png',
};
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest', sub: 'Latest listings' },
  { value: 'oldest', label: 'Oldest', sub: 'Earliest first' },
  { value: 'price_asc', label: 'Lowest', sub: 'Floor first' },
  { value: 'price_desc', label: 'Highest', sub: 'Top price' },
];
const LEVEL_OPTIONS = [
  { value: 'all', label: 'All', sub: 'Any level' },
  { value: '1', label: 'L1', sub: 'Level 1' },
  { value: '2', label: 'L2', sub: 'Level 2' },
  { value: '3', label: 'L3', sub: 'Level 3' },
];
function shortAddr(value, head = 5, tail = 4) {
  const s = String(value || '');
  if (!s) return '';
  return s.length <= head + tail + 3 ? s : `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function listedNotice(deposited) {
  return deposited?.txHash
    ? `Listed. Custody tx ${shortAddr(deposited.txHash, 8, 6)} confirmed.`
    : 'Listed. Escrow custody is already verified.';
}

function rawErrorMessage(err) {
  return err?.shortMessage || err?.message || String(err || '');
}

function errorDebug(err) {
  const body = err?.body || {};
  return {
    name: err?.name || null,
    status: err?.status || body?.status || null,
    code: err?.code || err?.cause?.code || null,
    message: rawErrorMessage(err),
    bodyError: body?.error || null,
    causeName: err?.cause?.name || null,
    causeMessage: err?.cause?.message || null,
  };
}

function browserDebugSnapshot() {
  if (typeof window === 'undefined') return {};
  const nav = window.navigator || {};
  const doc = window.document || {};
  return {
    online: nav.onLine,
    platform: nav.platform || null,
    userAgent: nav.userAgent || null,
    visibility: doc.visibilityState || null,
    standalone: !!window.matchMedia?.('(display-mode: standalone)')?.matches,
    width: window.innerWidth || null,
    height: window.innerHeight || null,
    devicePixelRatio: window.devicePixelRatio || null,
  };
}

function solanaWalletDebugSnapshot(solWallet) {
  return {
    isMobileWalletAdapter: isSolanaMobileWalletAdapter(solWallet),
    adapterName: solanaWalletAdapterName(solWallet) || null,
    adapterUrl: solanaWalletAdapterUrl(solWallet) || null,
    adapterIdentity: solanaWalletAdapterIdentity(solWallet) || null,
    publicKey: solWallet?.publicKey?.toBase58?.() || null,
    connected: solWallet?.connected ?? null,
    connecting: solWallet?.connecting ?? null,
    readyState: solWallet?.readyState || solWallet?.wallet?.adapter?.readyState || null,
    walletClientType: solWallet?.walletClientType || null,
    source: solWallet?.source || null,
    supportedTransactionVersions: solWallet?.supportedTransactionVersions
      ? Array.from(solWallet.supportedTransactionVersions).map(String)
      : null,
  };
}

function nftDebugSnapshot(nft) {
  return {
    chain: nft?.chain || null,
    standard: nft?.standard || nft?.tokenStandard || null,
    assetId: tokenAssetId(nft) || null,
    tokenId: nft?.tokenId || null,
    mint: nft?.mint || null,
    tokenAddress: nft?.tokenAddress || null,
    tokenAccount: nft?.tokenAccount || null,
    ownerHint: tokenOwnerHint(nft) || null,
    collection: nft?.collection || nft?.collectionAddress || null,
    level: nft?.level || null,
    source: nft?.source || null,
    cached: nft?.cached ?? null,
  };
}

function reportSeekerListingEvent(type, data = {}, solWallet, level = 'info') {
  if (!isSolanaMobileWalletAdapter(solWallet)) return;
  reportClientEvent(`marketplace.seeker.list.${type}`, {
    ...data,
    solanaWallet: solanaWalletDebugSnapshot(solWallet),
    browser: browserDebugSnapshot(),
  }, {
    level,
    source: 'marketplace.seeker.list',
    message: `marketplace.seeker.list.${type}`,
    flush: true,
  });
}

function listingErrorMessage(err, solWallet) {
  const base = rawErrorMessage(err);
  const text = [
    base,
    err?.name,
    err?.code,
    err?.cause?.message,
  ].filter(Boolean).join('\n');
  if (!isSolanaMobileWalletAdapter(solWallet)) return base;
  if (/user rejected|rejected the request|denied|cancelled|canceled|declined/i.test(text)) return base;
  if (!/mobile wallet adapter|seeker|seed vault|local network|network access|wallet not found|browser not supported|unknown|simulate|simulation|signandsend|sign and send|authorization|association|signature verification failed|missing signature/i.test(text)) return base;
  return 'Seeker wallet could not finish this Solana listing. Use Android Chrome/PWA, allow Local Network Access, and if the wallet shows Unknown, enable "I trust this site" before confirming.';
}

function orderImage(order) {
  return nftLevelImageUrl(order?.level || 1, order?.assetId || order?.asset_id || order?.assetChain || 'base');
}

function orderPrice(order) {
  return `$${formatCustodialUsdc(order?.priceUsdcUnits || 0)}`;
}

function usdcUnitsBigInt(value) {
  try { return BigInt(String(value || '0')); } catch { return 0n; }
}

function formatCompactUsdc(units) {
  const raw = usdcUnitsBigInt(units);
  const text = formatCustodialUsdc(raw);
  const value = Number(text);
  if (!Number.isFinite(value)) return `$${text}`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

function paymentChainLabel(config, chain) {
  return CHAIN_LABEL[chain] || chain || '';
}

function tokenAssetId(token) {
  return String(token?.tokenId || token?.tokenAddress || token?.assetId || token?.asset || token?.mint || token?.id || '').trim();
}

function walletForChain(chain, { evmAddress, solAddress, aptosAddress }) {
  if (CUSTODIAL_EVM_CHAIN_IDS[chain]) return evmAddress || '';
  if (chain === 'solana') return solAddress || '';
  if (chain === 'aptos') return aptosAddress || '';
  return '';
}

function tokenOwnerHint(token) {
  return String(token?.owner || token?.ownerAddress || token?.wallet || token?.ownerWallet || '').trim();
}

function chainAddressEqual(chain, a, b) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left || !right) return false;
  return CUSTODIAL_EVM_CHAIN_IDS[chain] || chain === 'aptos'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function chainLogo(chain) {
  return CHAIN_LOGO_SRC[chain] || null;
}

function reservationDeadlineMs(order) {
  const value = Number(order?.reservation?.deadline || order?.payment?.deadline || 0);
  return Number.isFinite(value) && value > 0 ? value * 1000 : 0;
}

function formatReservationTime(order) {
  const ms = reservationDeadlineMs(order);
  if (!ms) return 'soon';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isPaymentPreSubmitError(message) {
  return /reject|denied|cancel|signature verification failed|missing signature|cannot sign|wallet cannot|not enough|insufficient|connect .*wallet|failed to sign|failed to fetch|networkerror|timeout|timed out|rpc.*unavailable|stale latest blockhash|wallet protocol|wallet not found|no installed wallet/i.test(String(message || ''));
}

const PURCHASE_STEPS = [
  { key: 'reservation', label: 'Reservation' },
  { key: 'payment', label: 'Payment' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'received', label: 'NFT received' },
];
const LISTING_STEPS = [
  { key: 'details', label: 'Listing details' },
  { key: 'transfer', label: 'Transfer to escrow' },
  { key: 'verify', label: 'Server verification' },
  { key: 'listed', label: 'Listed for sale' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deliveryAssetId(order) {
  return String(
    order?.deliveryAssetId
    || order?.deliveryAsset?.assetId
    || (order?.buyerDestChain && order?.assetChain === order?.buyerDestChain ? order?.assetId : '')
    || ''
  ).trim();
}

function ownedTokenMatchesOrder(token, order) {
  const wantedChain = String(order?.buyerDestChain || '').toLowerCase();
  const tokenChain = String(token?.chain || wantedChain || '').toLowerCase();
  if (wantedChain && tokenChain && wantedChain !== tokenChain) return false;
  const wanted = deliveryAssetId(order);
  if (!wanted) return false;
  return tokenAssetId(token).toLowerCase() === wanted.toLowerCase();
}

function mergePurchaseFlow(prev, patch) {
  return {
    ...(prev || {}),
    ...patch,
    steps: {
      ...(prev?.steps || {}),
      ...(patch.steps || {}),
    },
  };
}

function mergeListingFlow(prev, patch) {
  return {
    ...(prev || {}),
    ...patch,
    steps: {
      ...(prev?.steps || {}),
      ...(patch.steps || {}),
    },
  };
}

function useCompactMarketplaceLayout() {
  const read = () => (typeof window !== 'undefined' ? window.innerWidth <= 640 : false);
  const [compact, setCompact] = useState(read);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setCompact(read());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return compact;
}

export default function CustodialMarketplacePanel({
  evmAddress,
  evmWallet,
  onConnectBase,
  onOpenEvmModal,
  onConnectSolana,
  onConnectAptos,
  solWallet,
  solAddress,
  aptosWallet,
  aptosAddress,
  sessionToken,
  onStatsChange,
}) {
  const [view, setView] = useState('browse');
  const [config, setConfig] = useState(null);
  const [listings, setListings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [owned, setOwned] = useState([]);
  const [remoteStats, setRemoteStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ownedLoading, setOwnedLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [buyTarget, setBuyTarget] = useState(null);
  const [paymentChain, setPaymentChain] = useState('base');
  const [deliveryChain, setDeliveryChain] = useState('base');
  const [purchaseFlow, setPurchaseFlow] = useState(null);
  const [listingFlow, setListingFlow] = useState(null);
  const [browseSort, setBrowseSort] = useState('newest');
  const [browseLevel, setBrowseLevel] = useState('all');
  const [sellWalletModalOpen, setSellWalletModalOpen] = useState(false);

  const ready = !!config?.ready;
  const supportedAssets = config?.supportedAssets || [];
  const supportedPayments = config?.supportedPaymentChains || [];
  const supportedDestinations = config?.supportedDestinationChains || [];
  const canUsePortal = typeof document !== 'undefined' && !!document.body;
  const compact = useCompactMarketplaceLayout();
  const selectedNft = useMemo(() => owned.find((nft) => `${nft.chain}:${tokenAssetId(nft)}` === selectedAsset) || null, [owned, selectedAsset]);
  const walletMap = useMemo(() => ({ evmAddress, solAddress, aptosAddress }), [aptosAddress, evmAddress, solAddress]);
  const ownedNftForOrder = useCallback((order) => {
    const chain = String(order?.assetChain || '').toLowerCase();
    const assetId = tokenAssetId(order);
    if (!chain || !assetId) return null;
    return owned.find((nft) => String(nft.chain || '').toLowerCase() === chain && tokenAssetId(nft) === assetId) || null;
  }, [owned]);
  const stats = useMemo(() => {
    const volumeUnits = remoteStats?.volumeUsdcUnits != null
      ? usdcUnitsBigInt(remoteStats.volumeUsdcUnits)
      : 0n;
    const prices = listings.map((order) => usdcUnitsBigInt(order?.priceUsdcUnits)).filter((price) => price > 0n);
    const floorUnits = remoteStats?.floorUsdcUnits != null
      ? usdcUnitsBigInt(remoteStats.floorUsdcUnits)
      : prices.reduce((min, price) => (min == null || price < min ? price : min), null);
    const listedCount = Number.isFinite(Number(remoteStats?.listedCount))
      ? Math.max(0, Math.floor(Number(remoteStats.listedCount)))
      : listings.length;
    return {
      listedCount,
      listedLabel: listedCount.toLocaleString('en-US'),
      volumeUsdcUnits: volumeUnits.toString(),
      volumeLabel: formatCompactUsdc(volumeUnits),
      floorUsdcUnits: floorUnits == null ? null : floorUnits.toString(),
      floorLabel: floorUnits == null ? '-' : formatCompactUsdc(floorUnits),
    };
  }, [listings, remoteStats]);

  useEffect(() => {
    onStatsChange?.(stats);
  }, [onStatsChange, stats]);

  useEffect(() => {
    let cancelled = false;
    fetchCustodialMarketplaceConfig()
      .then((json) => {
        if (cancelled) return;
        setConfig(json);
        const firstPay = json?.supportedPaymentChains?.[0];
        const firstDest = json?.supportedDestinationChains?.[0];
        if (firstPay) setPaymentChain((prev) => json.supportedPaymentChains.includes(prev) ? prev : firstPay);
        if (firstDest) setDeliveryChain((prev) => json.supportedDestinationChains.includes(prev) ? prev : firstDest);
      })
      .catch((err) => { if (!cancelled) setNotice(err?.message || 'Marketplace config failed'); });
    return () => { cancelled = true; };
  }, []);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fetchCustodialListings({
        status: 'active',
        level: browseLevel,
        sort: browseSort,
        limit: PAGE_SIZE,
      });
      setListings(Array.isArray(json?.listings) ? json.listings : []);
      setRemoteStats(json?.stats || null);
    } catch (err) {
      setRemoteStats(null);
      setNotice(err?.message?.slice(0, 220) || 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, [browseLevel, browseSort]);

  const loadOrders = useCallback(async () => {
    if (!sessionToken) { setOrders([]); return; }
    setLoading(true);
    try {
      const json = await fetchMyCustodialOrders({ token: sessionToken });
      setOrders(Array.isArray(json?.orders) ? json.orders : []);
    } catch (err) {
      setNotice(err?.message?.slice(0, 220) || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  const loadOwned = useCallback(async () => {
    const chains = (supportedAssets.length ? supportedAssets : ['base', 'arbitrum', 'monad', 'solana', 'aptos'])
      .filter((chain) => walletForChain(chain, walletMap));
    if (!chains.length) { setOwned([]); return; }
    setOwnedLoading(true);
    try {
      chains.forEach((chain) => clearDemonKingNftCache(walletForChain(chain, walletMap)));
      const settled = await Promise.allSettled(chains.map(async (chain) => {
        const address = walletForChain(chain, walletMap);
        const json = await fetchOwnedNfts({ chain, address });
        return (Array.isArray(json?.tokens) ? json.tokens : [])
          .map((token) => ({
            ...token,
            chain: token.chain || chain,
            owner: tokenOwnerHint(token) || json?.owner || address,
          }));
      }));
      const tokensByKey = new Map();
      const errors = [];
      settled.forEach((row, index) => {
        if (row.status === 'rejected') {
          errors.push(row.reason?.message || String(row.reason));
          return;
        }
        row.value.forEach((token) => {
          const id = tokenAssetId(token);
          const chain = String(token.chain || chains[index] || '').toLowerCase();
          if (!id || !chain) return;
          tokensByKey.set(`${chain}:${id}`, { ...token, chain, tokenId: token.tokenId || id });
        });
      });
      const tokens = [...tokensByKey.values()];
      setOwned(tokens);
      setSelectedAsset((prev) => {
        if (prev && tokens.some((token) => `${token.chain}:${tokenAssetId(token)}` === prev)) return prev;
        return tokens[0] ? `${tokens[0].chain}:${tokenAssetId(tokens[0])}` : '';
      });
      if (!tokens.length && errors.length === settled.length) {
        setNotice(errors[0]?.slice?.(0, 220) || 'Failed to load NFTs');
      }
    } catch (err) {
      setNotice(err?.message?.slice(0, 220) || 'Failed to load NFTs');
    } finally {
      setOwnedLoading(false);
    }
  }, [supportedAssets, walletMap]);

  useEffect(() => { loadListings(); }, [loadListings]);
  useEffect(() => { if (view === 'orders') loadOrders(); }, [view, loadOrders]);
  useEffect(() => { if (view === 'sell') loadOwned(); }, [view, loadOwned]);
  useEffect(() => {
    if (!buyTarget || !supportedDestinations.length) return;
    const connected = supportedDestinations.find((chain) => walletForChain(chain, walletMap));
    const fallback = connected || supportedDestinations[0];
    setDeliveryChain((prev) => (
      supportedDestinations.includes(prev) && walletForChain(prev, walletMap)
        ? prev
        : fallback
    ));
  }, [buyTarget, supportedDestinations, walletMap]);

  const connectForChain = useCallback(async (chain) => {
    try {
      if (CUSTODIAL_EVM_CHAIN_IDS[chain]) {
        if (!evmAddress) onOpenEvmModal?.(chain);
        else onConnectBase?.(chain);
        return;
      }
      if (chain === 'aptos') {
        await (onConnectAptos ? onConnectAptos() : aptosWallet?.connect?.());
        return;
      }
      if (chain === 'solana') {
        if (onConnectSolana) await onConnectSolana();
        else setNotice('Connect Solana wallet from the wallet button.');
      }
    } catch (err) {
      setNotice((err?.message || `Connect ${CHAIN_LABEL[chain] || chain} wallet failed`).slice(0, 160));
    }
  }, [aptosWallet, evmAddress, onConnectAptos, onConnectBase, onConnectSolana, onOpenEvmModal]);

  const changeSellWalletForChain = useCallback(async (chain) => {
    try {
      if (CUSTODIAL_EVM_CHAIN_IDS[chain]) {
        onOpenEvmModal?.(chain);
        setSellWalletModalOpen(false);
        return;
      }
      await connectForChain(chain);
      setSellWalletModalOpen(false);
      setTimeout(() => loadOwned(), 500);
    } catch (err) {
      setNotice((err?.message || `Connect ${CHAIN_LABEL[chain] || chain} wallet failed`).slice(0, 160));
    }
  }, [connectForChain, loadOwned, onOpenEvmModal]);

  const updatePurchaseFlow = useCallback((patch) => {
    setPurchaseFlow((prev) => mergePurchaseFlow(prev, patch));
  }, []);

  const updateListingFlow = useCallback((patch) => {
    setListingFlow((prev) => mergeListingFlow(prev, patch));
  }, []);

  const failListingFlow = useCallback((message, order = null) => {
    setListingFlow((prev) => {
      const steps = prev?.steps || {};
      const failedStep = steps.verify === 'active'
        ? 'verify'
        : steps.transfer === 'active'
          ? 'transfer'
          : 'details';
      return mergeListingFlow(prev, {
        order: order || prev?.order,
        steps: { [failedStep]: 'error' },
        message: null,
        error: String(message || '').slice(0, 240),
      });
    });
  }, []);

  const waitForListingActive = useCallback(async ({ order, txHash }) => {
    let latestOrder = order;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (latestOrder?.status === 'active') return latestOrder;
      if (sessionToken && latestOrder?.id) {
        try {
          const json = await fetchCustodialOrder({ token: sessionToken, orderId: latestOrder.id });
          if (json?.order) latestOrder = json.order;
        } catch {
          // Listing verification can lag right after a wallet tx; keep polling.
        }
      }
      if (latestOrder?.status === 'active') return latestOrder;
      updateListingFlow({
        order: latestOrder,
        txHash,
        steps: { transfer: txHash ? 'complete' : 'active', verify: 'active' },
        message: 'Waiting for the server to verify escrow custody and publish the listing.',
      });
      await sleep(attempt < 5 ? 1500 : 3000);
    }
    const err = new Error('NFT transfer was submitted, but the listing is still waiting for server verification. Check My orders in a moment.');
    err.order = latestOrder;
    throw err;
  }, [sessionToken, updateListingFlow]);

  const waitForPurchasedNftReceipt = useCallback(async ({ order, destChain, destAddress }) => {
    let latestOrder = order;
    for (let attempt = 0; attempt < 36; attempt += 1) {
      if (sessionToken && latestOrder?.id && (!deliveryAssetId(latestOrder) || attempt % 4 === 0)) {
        try {
          const json = await fetchCustodialOrder({ token: sessionToken, orderId: latestOrder.id });
          if (json?.order) {
            latestOrder = json.order;
            updatePurchaseFlow({ order: latestOrder });
          }
        } catch {
          // Ownership polling below is the source of truth for the last step.
        }
      }
      const wantedAssetId = deliveryAssetId(latestOrder);
      if (wantedAssetId) {
        try {
          clearDemonKingNftCache(destAddress);
          const json = await fetchOwnedNfts({ chain: destChain, address: destAddress });
          const tokens = Array.isArray(json?.tokens) ? json.tokens : [];
          const token = tokens.find((row) => ownedTokenMatchesOrder({ ...row, chain: row.chain || destChain }, latestOrder));
          if (token) return { order: latestOrder, token };
        } catch {
          // Indexers can lag right after a Solana/Core mint. Keep polling.
        }
      }
      updatePurchaseFlow({
        order: latestOrder,
        steps: { received: 'active' },
        message: wantedAssetId
          ? 'Waiting for the NFT to appear in your wallet.'
          : 'Waiting for destination asset details.',
      });
      await sleep(attempt < 6 ? 2500 : 4000);
    }
    const err = new Error('NFT was delivered on-chain, but the wallet/indexer has not shown it yet. It should appear after indexing catches up.');
    err.order = latestOrder;
    throw err;
  }, [sessionToken, updatePurchaseFlow]);

  const openBuyModal = useCallback((order) => {
    if (!order) return;
    addClientBreadcrumb('marketplace.custodial.buy.open', { orderId: order?.id });
    setBuyTarget(order);
    if (order.status === 'reserved' && order.paymentChain && supportedPayments.includes(order.paymentChain)) {
      setPaymentChain(order.paymentChain);
    } else {
      const connectedPayment = supportedPayments.find((chain) => walletForChain(chain, walletMap));
      const fallbackPayment = connectedPayment || supportedPayments[0];
      if (fallbackPayment) setPaymentChain(fallbackPayment);
    }
    if (order.buyerDestChain && supportedDestinations.includes(order.buyerDestChain)) setDeliveryChain(order.buyerDestChain);
  }, [supportedDestinations, supportedPayments, walletMap]);

  const depositListingOrder = useCallback(async (order, nftOverride = null, { trackFlow = true } = {}) => {
    if (!sessionToken) throw new Error('Game session is not ready.');
    const assetChain = order?.assetChain || nftOverride?.chain;
    const sellerWallet = walletForChain(assetChain, walletMap);
    if (!sellerWallet) throw new Error(`Connect ${CHAIN_LABEL[assetChain] || assetChain} wallet to transfer this NFT.`);
    const nft = nftOverride || ownedNftForOrder(order) || null;
    reportSeekerListingEvent('deposit_start', {
      orderId: order?.id || null,
      orderStatus: order?.status || null,
      assetChain,
      assetId: order?.assetId || tokenAssetId(nft),
      assetStandard: order?.assetStandard || nft?.standard || null,
      vaultChain: order?.vaultChain || null,
      vaultAddress: order?.vaultAddress || null,
      sellerWallet,
      nft: nftDebugSnapshot(nft),
      trackFlow,
    }, solWallet);
    if (trackFlow) {
      updateListingFlow({
        open: true,
        order,
        nft,
        txHash: null,
        steps: { details: 'complete', transfer: 'active', verify: 'pending', listed: 'pending' },
        message: `Confirm the NFT transfer to marketplace escrow on ${CHAIN_LABEL[assetChain] || assetChain}.`,
        error: null,
      });
    }
    let deposited;
    try {
      deposited = await depositNftToCustody({
        evmWallet,
        solWallet,
        aptosWallet,
        token: sessionToken,
        order,
        nft,
        owner: sellerWallet,
      });
    } catch (err) {
      reportSeekerListingEvent('deposit_failed', {
        orderId: order?.id || null,
        assetChain,
        assetId: order?.assetId || tokenAssetId(nft),
        assetStandard: order?.assetStandard || nft?.standard || null,
        vaultAddress: order?.vaultAddress || null,
        sellerWallet,
        nft: nftDebugSnapshot(nft),
        error: errorDebug(err),
      }, solWallet, 'warn');
      throw err;
    }
    reportSeekerListingEvent('deposit_tx_ok', {
      orderId: order?.id || null,
      assetChain,
      assetId: order?.assetId || tokenAssetId(nft),
      txHash: deposited?.txHash || null,
      confirmedStatus: deposited?.confirmed?.order?.status || null,
      sellerWallet,
    }, solWallet);
    const confirmedOrder = deposited?.confirmed?.order || order;
    if (trackFlow) {
      updateListingFlow({
        order: confirmedOrder,
        txHash: deposited?.txHash,
        steps: { transfer: 'complete', verify: 'active' },
        message: 'Escrow transfer confirmed. Verifying the listing on the server.',
      });
    }
    const activeOrder = trackFlow
      ? await waitForListingActive({ order: confirmedOrder, txHash: deposited?.txHash })
      : confirmedOrder;
    if (trackFlow) {
      updateListingFlow({
        order: activeOrder,
        txHash: deposited?.txHash,
        steps: { details: 'complete', transfer: 'complete', verify: 'complete', listed: 'complete' },
        message: 'Your NFT is live in the marketplace.',
      });
    }
    reportSeekerListingEvent('active_ok', {
      orderId: activeOrder?.id || order?.id || null,
      assetChain,
      assetId: activeOrder?.assetId || order?.assetId || tokenAssetId(nft),
      txHash: deposited?.txHash || null,
      status: activeOrder?.status || null,
    }, solWallet);
    addClientBreadcrumb('marketplace.custodial.deposit.success', {
      orderId: order?.id,
      assetChain,
      txHash: deposited?.txHash,
    });
    return { ...deposited, order: activeOrder };
  }, [aptosWallet, evmWallet, ownedNftForOrder, sessionToken, solWallet, updateListingFlow, waitForListingActive, walletMap]);

  const handleDepositPending = useCallback(async (order) => {
    if (!order?.id) return;
    setBusy(`deposit:${order.id}`);
    setNotice(null);
    setListingFlow({
      open: true,
      order,
      nft: ownedNftForOrder(order) || null,
      txHash: null,
      steps: { details: 'complete', transfer: 'active', verify: 'pending', listed: 'pending' },
      message: 'Resume listing by transferring the NFT to marketplace escrow.',
      error: null,
    });
    try {
      const deposited = await depositListingOrder(order);
      setNotice(listedNotice(deposited));
      await Promise.all([loadListings(), loadOrders(), loadOwned()]);
    } catch (err) {
      const msg = listingErrorMessage(err, solWallet);
      failListingFlow(msg, err?.order || order);
      setNotice(msg.slice(0, 240));
      addClientBreadcrumb('marketplace.custodial.deposit.failed', { orderId: order?.id, message: rawErrorMessage(err), displayed: msg }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [depositListingOrder, failListingFlow, loadListings, loadOrders, loadOwned, ownedNftForOrder, solWallet]);

  const handleCreateListing = useCallback(async () => {
    if (!sessionToken) { setNotice('Game session is not ready.'); return; }
    if (!ready) { setNotice('Marketplace vaults are not ready on the server.'); return; }
    if (!selectedNft) { setNotice('Pick a Demon King NFT.'); return; }
    const assetChain = selectedNft.chain;
    const assetId = tokenAssetId(selectedNft);
    const connectedSellerWallet = walletForChain(assetChain, walletMap);
    if (!connectedSellerWallet) { setNotice(`Connect ${CHAIN_LABEL[assetChain] || assetChain} wallet to sell.`); return; }
    const ownerHint = tokenOwnerHint(selectedNft);
    reportSeekerListingEvent('start', {
      assetChain,
      assetId,
      connectedSellerWallet,
      ownerHint: ownerHint || null,
      nft: nftDebugSnapshot(selectedNft),
      priceUsdc: priceInput,
      supportedPayments,
    }, solWallet);
    if (ownerHint && !chainAddressEqual(assetChain, ownerHint, connectedSellerWallet)) {
      addClientBreadcrumb('marketplace.custodial.owner_hint_mismatch', {
        assetChain,
        assetId,
        connectedSellerWallet: shortAddr(connectedSellerWallet, 8, 6),
        ownerHint: shortAddr(ownerHint, 8, 6),
      }, 'warn');
      reportSeekerListingEvent('owner_hint_mismatch', {
        assetChain,
        assetId,
        connectedSellerWallet,
        ownerHint,
        nft: nftDebugSnapshot(selectedNft),
      }, solWallet, 'warn');
      if (assetChain !== 'solana') {
        setNotice(`Connected ${CHAIN_LABEL[assetChain] || assetChain} wallet ${shortAddr(connectedSellerWallet, 6, 4)} is not the NFT owner ${shortAddr(ownerHint, 6, 4)}.`);
        return;
      }
    }
    const sellerWallet = connectedSellerWallet;
    const payoutChain = supportedPayments.includes(assetChain) ? assetChain : supportedPayments[0] || 'base';
    const payoutAddress = walletForChain(payoutChain, walletMap);
    if (!payoutAddress) { setNotice(`Connect ${CHAIN_LABEL[payoutChain] || payoutChain} wallet for payout.`); return; }
    setBusy('list');
    setNotice(null);
    setListingFlow({
      open: true,
      order: null,
      nft: selectedNft,
      priceUsdc: priceInput,
      assetChain,
      sellerPayoutChain: payoutChain,
      txHash: null,
      steps: { details: 'active', transfer: 'pending', verify: 'pending', listed: 'pending' },
      message: 'Creating listing details on the server.',
      error: null,
    });
    try {
      let created;
      try {
        addClientBreadcrumb('marketplace.custodial.list.prepare', {
          assetChain,
          assetId: shortAddr(assetId, 8, 6),
          connectedSellerWallet: shortAddr(connectedSellerWallet, 8, 6),
          ownerHint: ownerHint ? shortAddr(ownerHint, 8, 6) : null,
          sellerWallet: shortAddr(sellerWallet, 8, 6),
          payoutChain,
        });
        reportSeekerListingEvent('server_create_start', {
          assetChain,
          assetId,
          connectedSellerWallet,
          ownerHint: ownerHint || null,
          sellerWallet,
          payoutChain,
          payoutAddress,
          priceUsdc: priceInput,
          nft: nftDebugSnapshot(selectedNft),
        }, solWallet);
        created = await createCustodialListing({
          token: sessionToken,
          assetChain,
          assetId,
          sellerWallet,
          connectedSellerWallet,
          sellerPayoutChain: payoutChain,
          sellerPayoutAddress: payoutAddress,
          priceUsdc: priceInput,
        });
        reportSeekerListingEvent('server_create_ok', {
          orderId: created?.order?.id || null,
          orderStatus: created?.order?.status || null,
          assetChain,
          assetId,
          sellerWallet,
          onServerSellerWallet: created?.order?.sellerWallet || null,
          vaultAddress: created?.order?.vaultAddress || null,
          assetStandard: created?.order?.assetStandard || null,
          level: created?.order?.level || null,
          resumed: !!created?.resumed,
          recovered: !!created?.recovered,
          alreadyListed: !!created?.alreadyListed,
        }, solWallet);
        updateListingFlow({
          order: created?.order || null,
          steps: { details: 'complete', transfer: 'active' },
          message: created?.order?.status === 'awaiting_deposit'
            ? 'Listing created. Confirm the NFT transfer to escrow.'
            : 'Listing details verified.',
        });
      } catch (err) {
        const pendingOrder = err?.body?.order;
        if (Number(err?.status) === 409 && pendingOrder?.status === 'awaiting_deposit') {
          const pendingSellerWallet = String(pendingOrder?.sellerWallet || '').trim();
          if (pendingSellerWallet && !chainAddressEqual(assetChain, pendingSellerWallet, sellerWallet)) {
            reportSeekerListingEvent('server_pending_stale_seller_wallet', {
              orderId: pendingOrder?.id || null,
              assetChain,
              assetId,
              requestedSellerWallet: sellerWallet,
              pendingSellerWallet,
              connectedSellerWallet,
            }, solWallet, 'warn');
            updateListingFlow({
              order: pendingOrder,
              steps: { details: 'active', transfer: 'pending', verify: 'pending', listed: 'pending' },
              message: 'Cleaning up an old pending listing for this NFT.',
            });
            await cancelCustodialListing({ token: sessionToken, orderId: pendingOrder.id });
            created = await createCustodialListing({
              token: sessionToken,
              assetChain,
              assetId,
              sellerWallet,
              connectedSellerWallet,
              sellerPayoutChain: payoutChain,
              sellerPayoutAddress: payoutAddress,
              priceUsdc: priceInput,
            });
            reportSeekerListingEvent('server_recreate_after_stale_pending_ok', {
              oldOrderId: pendingOrder?.id || null,
              orderId: created?.order?.id || null,
              assetChain,
              assetId,
              sellerWallet,
              onServerSellerWallet: created?.order?.sellerWallet || null,
            }, solWallet);
            updateListingFlow({
              order: created?.order || null,
              steps: { details: 'complete', transfer: 'active' },
              message: created?.order?.status === 'awaiting_deposit'
                ? 'Listing recreated. Confirm the NFT transfer to escrow.'
                : 'Listing details verified.',
            });
          } else {
            reportSeekerListingEvent('server_pending_listing', {
              orderId: pendingOrder?.id || null,
              assetChain,
              assetId,
              sellerWallet,
              orderStatus: pendingOrder?.status || null,
              error: errorDebug(err),
            }, solWallet, 'warn');
            updateListingFlow({
              order: pendingOrder,
              steps: { details: 'complete', transfer: 'active' },
              message: 'Existing listing found. Continue by transferring the NFT to escrow.',
            });
            const deposited = await depositListingOrder(pendingOrder, selectedNft);
            setNotice(listedNotice(deposited));
            setPriceInput('');
            setView('orders');
            await Promise.all([loadListings(), loadOrders(), loadOwned()]);
            return;
          }
        }
        if (!created) throw err;
      }
      const order = created.order;
      if (order?.status === 'awaiting_deposit' && !created.resumed) {
        const deposited = await depositListingOrder(order, selectedNft);
        setNotice(listedNotice(deposited));
      } else if (created.recovered) {
        updateListingFlow({
          order,
          steps: { details: 'complete', transfer: 'complete', verify: 'complete', listed: 'complete' },
          message: 'Listing recovered. Escrow custody is already verified.',
        });
        setNotice('Listing recovered. NFT custody is already verified.');
      } else if (created.resumed) {
        updateListingFlow({
          order,
          steps: { details: 'complete', transfer: 'complete', verify: 'complete', listed: 'complete' },
          message: 'Listing resumed. Escrow custody is already verified.',
        });
        setNotice('Listing resumed. NFT custody is already verified.');
      } else {
        updateListingFlow({
          order,
          steps: { details: 'complete', transfer: 'complete', verify: 'complete', listed: 'complete' },
          message: 'This NFT is already live in the marketplace.',
        });
        setNotice('This NFT is already listed.');
      }
      addClientBreadcrumb('marketplace.custodial.list.success', { orderId: created.order?.id, assetChain, assetId });
      setPriceInput('');
      setView('orders');
      await Promise.all([loadListings(), loadOrders(), loadOwned()]);
    } catch (err) {
      const msg = listingErrorMessage(err, solWallet);
      failListingFlow(msg, err?.order || null);
      setNotice(msg.slice(0, 240));
      addClientBreadcrumb('marketplace.custodial.list.failed', { message: rawErrorMessage(err), displayed: msg }, 'warn');
      reportSeekerListingEvent('failed', {
        assetChain: selectedNft?.chain || null,
        assetId: selectedNft ? tokenAssetId(selectedNft) : null,
        ownerHint: selectedNft ? tokenOwnerHint(selectedNft) || null : null,
        connectedSellerWallet: selectedNft ? walletForChain(selectedNft.chain, walletMap) : null,
        displayedMessage: msg,
        nft: nftDebugSnapshot(selectedNft),
        error: errorDebug(err),
      }, solWallet, 'warn');
    } finally {
      setBusy(null);
    }
  }, [depositListingOrder, failListingFlow, loadListings, loadOrders, loadOwned, priceInput, ready, selectedNft, sessionToken, solWallet, supportedPayments, updateListingFlow, walletMap]);

  const handleBuy = useCallback(async () => {
    if (!buyTarget) return;
    addClientBreadcrumb('marketplace.custodial.pay.click', {
      orderId: buyTarget.id,
      paymentChain,
      deliveryChain,
    });
    if (!sessionToken) { setNotice('Game session is not ready.'); return; }
    const buyerWallet = walletForChain(paymentChain, walletMap);
    const destAddress = walletForChain(deliveryChain, walletMap);
    if (!buyerWallet) { await connectForChain(paymentChain); setNotice(`Connect ${CHAIN_LABEL[paymentChain] || paymentChain} wallet to pay.`); return; }
    if (!destAddress) { await connectForChain(deliveryChain); setNotice(`Connect ${CHAIN_LABEL[deliveryChain] || deliveryChain} wallet for delivery.`); return; }
    setBusy('buy');
    setNotice(null);
    setPurchaseFlow({
      open: true,
      orderId: buyTarget.id,
      order: buyTarget,
      paymentChain,
      deliveryChain,
      destAddress,
      steps: { reservation: 'active', payment: 'pending', transfer: 'pending', received: 'pending' },
      message: 'Reserving this NFT for your wallet.',
      error: null,
    });
    const onProgress = ({ step, status, order, txHash }) => {
      const steps = {};
      if (step === 'reservation' && status === 'complete') {
        steps.reservation = 'complete';
        steps.payment = 'active';
      } else if (step === 'payment' && status === 'complete') {
        steps.payment = 'complete';
      } else if (step === 'transfer' && status === 'complete') {
        steps.transfer = 'complete';
        steps.received = 'active';
      } else {
        steps[step] = status === 'submitted' ? 'active' : status;
      }
      const messages = {
        reservation: status === 'complete' ? 'Reservation confirmed. Waiting for payment signature.' : 'Reserving this NFT for your wallet.',
        payment: status === 'submitted' ? 'Payment submitted. Waiting for confirmation.' : status === 'complete' ? 'Payment confirmed. Preparing NFT transfer.' : 'Waiting for wallet payment signature.',
        transfer: status === 'complete' ? 'NFT transfer confirmed on-chain. Checking your wallet.' : 'Transferring NFT to your selected wallet.',
      };
      updatePurchaseFlow({
        order: order || undefined,
        txHash,
        steps,
        message: messages[step] || 'Processing purchase.',
      });
    };
    try {
      const result = await payCustodialOrder({
        evmWallet,
        solWallet,
        aptosWallet,
        buyerWallet,
        token: sessionToken,
        orderId: buyTarget.id,
        paymentChain,
        destChain: deliveryChain,
        destAddress,
        onProgress,
      });
      let finalOrder = result?.confirmed?.order || result?.intent?.order || buyTarget;
      let finalStatus = finalOrder?.status || 'paid';
      for (let attempt = 0; finalStatus !== 'delivered' && attempt < 30; attempt += 1) {
        updatePurchaseFlow({
          order: finalOrder,
          steps: { transfer: 'active' },
          message: `Settlement status: ${finalStatus}. Waiting for NFT transfer.`,
        });
        await sleep(attempt < 5 ? 2000 : 4000);
        const json = await fetchCustodialOrder({ token: sessionToken, orderId: buyTarget.id });
        finalOrder = json?.order || finalOrder;
        finalStatus = finalOrder?.status || finalStatus;
      }
      if (finalStatus !== 'delivered') {
        throw Object.assign(new Error(`Payment confirmed, but NFT transfer is still ${finalStatus}. Keep this order open in My orders.`), { order: finalOrder });
      }
      updatePurchaseFlow({
        order: finalOrder,
        txHash: result?.txHash,
        steps: { reservation: 'complete', payment: 'complete', transfer: 'complete', received: 'active' },
        message: 'NFT transfer confirmed on-chain. Checking your wallet.',
      });
      const receipt = await waitForPurchasedNftReceipt({ order: finalOrder, destChain: deliveryChain, destAddress });
      updatePurchaseFlow({
        order: receipt.order || finalOrder,
        receivedToken: receipt.token,
        steps: { reservation: 'complete', payment: 'complete', transfer: 'complete', received: 'complete' },
        message: 'NFT received in your wallet.',
      });
      setNotice('Purchase complete. NFT received in your wallet.');
      addClientBreadcrumb('marketplace.custodial.buy.success', { orderId: buyTarget.id, txHash: result?.txHash, status: finalStatus });
      setBuyTarget(null);
      await Promise.all([loadListings(), loadOrders()]);
    } catch (err) {
      const msg = err?.shortMessage || err?.message || String(err);
      if (isPaymentPreSubmitError(msg)) {
        try {
          await releaseCustodialReservation({
            token: sessionToken,
            orderId: buyTarget.id,
            reason: msg.slice(0, 140),
          });
          await Promise.all([loadListings(), loadOrders()]);
          updatePurchaseFlow({
            steps: { reservation: 'complete', payment: 'error', transfer: 'pending', received: 'pending' },
            message: 'Payment was not submitted. Reservation released.',
            error: msg.slice(0, 180),
          });
          setNotice(`${msg.slice(0, 180)} Reservation released.`);
        } catch {
          updatePurchaseFlow({
            steps: { payment: 'error' },
            message: 'Payment failed.',
            error: msg.slice(0, 220),
          });
          setNotice(msg.slice(0, 240));
        }
      } else {
        const failedStep = /wallet\/indexer|NFT was delivered|appear after indexing/i.test(msg) ? 'received' : 'transfer';
        updatePurchaseFlow({
          order: err?.order || undefined,
          steps: { [failedStep]: 'error' },
          message: 'Purchase needs attention.',
          error: msg.slice(0, 220),
        });
        setNotice(msg.slice(0, 240));
      }
      addClientBreadcrumb('marketplace.custodial.buy.failed', { orderId: buyTarget?.id, message: msg }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [aptosWallet, buyTarget, connectForChain, deliveryChain, evmWallet, loadListings, loadOrders, paymentChain, sessionToken, solWallet, updatePurchaseFlow, waitForPurchasedNftReceipt, walletMap]);

  const handleReleaseReservation = useCallback(async (orderId) => {
    if (!sessionToken) return;
    setBusy(`release:${orderId}`);
    setNotice(null);
    try {
      await releaseCustodialReservation({ token: sessionToken, orderId, reason: 'buyer_released_from_orders' });
      setNotice('Reservation released.');
      await Promise.all([loadListings(), loadOrders()]);
    } catch (err) {
      setNotice((err?.message || 'Release failed').slice(0, 240));
    } finally {
      setBusy(null);
    }
  }, [loadListings, loadOrders, sessionToken]);

  const handleCancel = useCallback(async (orderId) => {
    if (!sessionToken) return;
    setBusy(`cancel:${orderId}`);
    setNotice(null);
    try {
      await cancelCustodialListing({ token: sessionToken, orderId });
      setNotice('Listing cancelled.');
      await Promise.all([loadListings(), loadOrders(), loadOwned()]);
    } catch (err) {
      setNotice((err?.message || 'Cancel failed').slice(0, 240));
    } finally {
      setBusy(null);
    }
  }, [loadListings, loadOrders, loadOwned, sessionToken]);

  return (
    <div style={s.root}>
      {!ready && (
      <div style={s.warnBanner}>
        <div>
          <div style={s.bannerTitle}>Marketplace vaults not ready</div>
          <div style={s.bannerSub}>
            Server needs custody vaults and treasury payment wallets before players can list NFTs.
          </div>
        </div>
      </div>
      )}

      <div style={s.tabs}>
        <Tab label="Browse" active={view === 'browse'} onClick={() => setView('browse')} />
        <Tab label="Sell" active={view === 'sell'} onClick={() => setView('sell')} />
        <Tab label="My orders" active={view === 'orders'} onClick={() => setView('orders')} />
      </div>

      {view === 'browse' && (
        <BrowseView
          listings={listings}
          loading={loading}
          walletMap={walletMap}
          compact={compact}
          sort={browseSort}
          setSort={setBrowseSort}
          level={browseLevel}
          setLevel={setBrowseLevel}
          onBuy={(order) => {
            addClientBreadcrumb('marketplace.custodial.buy.open', { orderId: order?.id });
            openBuyModal(order);
          }}
          onOwnListing={(order) => {
            addClientBreadcrumb('marketplace.custodial.buy.own_listing_click', { orderId: order?.id, assetChain: order?.assetChain }, 'info');
            setNotice('This is your own listing. Open My orders to cancel it, or test buying from another wallet/player.');
            setView('orders');
            loadOrders();
          }}
        />
      )}
      {view === 'sell' && (
        <SellView
          ready={ready}
          config={config}
          owned={owned}
          loading={ownedLoading}
          supportedAssets={supportedAssets}
          walletMap={walletMap}
          selectedAsset={selectedAsset}
          setSelectedAsset={setSelectedAsset}
          priceInput={priceInput}
          setPriceInput={setPriceInput}
          busy={busy === 'list'}
          onSubmit={handleCreateListing}
          onRefresh={loadOwned}
          onChangeWallet={() => setSellWalletModalOpen(true)}
        />
      )}
      {view === 'orders' && (
        <OrdersView
          orders={orders}
          loading={loading}
          walletMap={walletMap}
          busy={busy}
          onCancel={handleCancel}
          onResumeBuy={openBuyModal}
          onDeposit={handleDepositPending}
          onReleaseReservation={handleReleaseReservation}
        />
      )}

      {buyTarget && !purchaseFlow?.open && canUsePortal && createPortal((
        <div style={s.modalOverlay} onClick={busy === 'buy' ? undefined : () => setBuyTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>Buy Demon King</span>
              <button type="button" style={s.closeBtn} onClick={() => setBuyTarget(null)} disabled={busy === 'buy'}>x</button>
            </div>
            <img src={orderImage(buyTarget)} alt="" style={s.modalImg} />
            <div style={s.breakdown}>
              <span>Price</span><b>{orderPrice(buyTarget)}</b>
              <span>Pay chain</span>
              <ChipRow
                chains={supportedPayments}
                value={paymentChain}
                setValue={setPaymentChain}
                walletMap={walletMap}
                config={config}
                onConnectChain={connectForChain}
                busy={busy === 'buy'}
              />
              {!walletForChain(paymentChain, walletMap) && (
                <>
                  <span />
                  <ConnectChainPrompt chain={paymentChain} purpose="pay" onConnect={connectForChain} busy={busy === 'buy'} />
                </>
              )}
              <span>Receive on</span>
              <ChipRow
                chains={supportedDestinations}
                value={deliveryChain}
                setValue={setDeliveryChain}
                walletMap={walletMap}
                config={config}
                onConnectChain={connectForChain}
                busy={busy === 'buy'}
              />
              {!walletForChain(deliveryChain, walletMap) && (
                <>
                  <span />
                  <ConnectChainPrompt chain={deliveryChain} purpose="receive" onConnect={connectForChain} busy={busy === 'buy'} />
                </>
              )}
            </div>
            <button type="button" style={s.primaryBtn} disabled={busy === 'buy'} onClick={handleBuy}>
              {busy === 'buy' ? 'Paying...' : 'Pay'}
            </button>
          </div>
        </div>
      ), document.body)}

      {purchaseFlow?.open && canUsePortal && createPortal((
        <PurchaseProgressModal
          flow={purchaseFlow}
          busy={busy === 'buy'}
          onClose={() => {
            if (busy === 'buy') return;
            setPurchaseFlow(null);
            if (purchaseFlow?.steps?.received === 'complete') setBuyTarget(null);
          }}
        />
      ), document.body)}

      {listingFlow?.open && canUsePortal && createPortal((
        <ListingProgressModal
          flow={listingFlow}
          busy={busy === 'list' || String(busy || '').startsWith('deposit:')}
          onClose={() => {
            if (busy === 'list' || String(busy || '').startsWith('deposit:')) return;
            setListingFlow(null);
          }}
        />
      ), document.body)}

      {sellWalletModalOpen && canUsePortal && createPortal((
        <SellWalletModal
          chains={supportedAssets.length ? supportedAssets : ['base', 'arbitrum', 'monad', 'solana', 'aptos']}
          walletMap={walletMap}
          onChoose={changeSellWalletForChain}
          onClose={() => setSellWalletModalOpen(false)}
        />
      ), document.body)}

      {notice && <div style={/^(Listed|Payment|Purchase|Listing cancelled)/.test(notice) ? s.noticeOk : s.notice}>{notice}</div>}
    </div>
  );
}

function Tab({ label, active, onClick }) {
  return <button type="button" onClick={onClick} style={{ ...s.tab, ...(active ? s.tabActive : null) }}>{label}</button>;
}

function ChipRow({ chains, value, setValue, walletMap, config, onConnectChain, busy }) {
  return (
    <div style={s.deliveryChips}>
      {chains.map((chain) => {
        const connected = !!walletForChain(chain, walletMap);
        return (
          <button
            key={chain}
            type="button"
            onClick={() => {
              setValue(chain);
              if (!connected && !busy) void onConnectChain?.(chain);
            }}
            disabled={busy}
            style={{ ...s.chip, ...(value === chain ? s.chipActive : null), ...(!connected ? s.chipMuted : null) }}
            title={connected ? paymentChainLabel(config, chain) : `Connect ${CHAIN_LABEL[chain]} wallet`}
          >
            <span style={s.chipLabel}>{paymentChainLabel(config, chain)}</span>
            {!connected && <span style={s.chipStatus}>Connect</span>}
          </button>
        );
      })}
    </div>
  );
}

function ConnectChainPrompt({ chain, purpose, onConnect, busy }) {
  const label = CHAIN_LABEL[chain] || chain;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void onConnect?.(chain)}
      style={{ ...s.connectWalletBtn, ...(busy ? s.disabledBtn : null) }}
    >
      Connect {label} wallet to {purpose}
    </button>
  );
}

function stepGlyph(status) {
  if (status === 'complete') return 'OK';
  if (status === 'error') return '!';
  if (status === 'active') return '...';
  return '';
}

function PurchaseProgressModal({ flow, busy, onClose }) {
  const order = flow?.order || {};
  const assetId = deliveryAssetId(order);
  const paymentTx = order.paymentTxHash || flow?.txHash;
  const deliveryTx = order.deliveryTxHash;
  const payChain = order?.payment?.chain || order?.paymentChain || flow?.paymentChain;
  return (
    <div style={s.modalOverlay} onClick={busy ? undefined : onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Purchase progress</span>
          <button type="button" style={s.closeBtn} onClick={onClose} disabled={busy}>x</button>
        </div>
        <div style={s.progressHead}>
          <img src={orderImage(order)} alt="" style={s.progressImg} />
          <div style={s.progressMeta}>
            <b>{orderPrice(order)}</b>
            <span>Pay on {CHAIN_LABEL[payChain] || payChain || '-'}</span>
            <span>Receive on {CHAIN_LABEL[flow?.deliveryChain] || flow?.deliveryChain || '-'}</span>
          </div>
        </div>
        <div style={s.stepList}>
          {PURCHASE_STEPS.map((step) => {
            const status = flow?.steps?.[step.key] || 'pending';
            return (
              <div key={step.key} style={{ ...s.stepRow, ...(status === 'active' ? s.stepRowActive : null), ...(status === 'error' ? s.stepRowError : null) }}>
                <span style={{ ...s.stepDot, ...(status === 'complete' ? s.stepDotDone : null), ...(status === 'active' ? s.stepDotActive : null), ...(status === 'error' ? s.stepDotError : null) }}>
                  {stepGlyph(status)}
                </span>
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>
        {flow?.message && <div style={s.progressMessage}>{flow.message}</div>}
        {flow?.error && <div style={s.progressError}>{flow.error}</div>}
        <div style={s.progressLinks}>
          {paymentTx && <span>payment {shortAddr(paymentTx, 8, 6)}</span>}
          {deliveryTx && <span>delivery {shortAddr(deliveryTx, 8, 6)}</span>}
          {assetId && <span>NFT {shortAddr(assetId, 8, 6)}</span>}
        </div>
      </div>
    </div>
  );
}

function listingImage(flow) {
  const nft = flow?.nft || {};
  if (nft.imageUrl) return nft.imageUrl;
  return orderImage(flow?.order || nft);
}

function listingPrice(flow) {
  if (flow?.order?.priceUsdcUnits != null) return orderPrice(flow.order);
  const price = String(flow?.priceUsdc || '').trim();
  return price ? `$${price}` : 'USD price';
}

function ListingProgressModal({ flow, busy, onClose }) {
  const order = flow?.order || {};
  const txHash = flow?.txHash || order.depositTxHash;
  const assetChain = order.assetChain || flow?.assetChain || flow?.nft?.chain;
  const payoutChain = order.sellerPayoutChain || flow?.sellerPayoutChain;
  return (
    <div style={s.modalOverlay} onClick={busy ? undefined : onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Listing progress</span>
          <button type="button" style={s.closeBtn} onClick={onClose} disabled={busy}>x</button>
        </div>
        <div style={s.progressHead}>
          <img src={listingImage(flow)} alt="" style={s.progressImg} />
          <div style={s.progressMeta}>
            <b>{listingPrice(flow)}</b>
            <span>From {CHAIN_LABEL[assetChain] || assetChain || '-'}</span>
            <span>Payout on {CHAIN_LABEL[payoutChain] || payoutChain || '-'}</span>
          </div>
        </div>
        <div style={s.stepList}>
          {LISTING_STEPS.map((step) => {
            const status = flow?.steps?.[step.key] || 'pending';
            return (
              <div key={step.key} style={{ ...s.stepRow, ...(status === 'active' ? s.stepRowActive : null), ...(status === 'error' ? s.stepRowError : null) }}>
                <span style={{ ...s.stepDot, ...(status === 'complete' ? s.stepDotDone : null), ...(status === 'active' ? s.stepDotActive : null), ...(status === 'error' ? s.stepDotError : null) }}>
                  {stepGlyph(status)}
                </span>
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>
        {flow?.message && <div style={s.progressMessage}>{flow.message}</div>}
        {flow?.error && <div style={s.progressError}>{flow.error}</div>}
        <div style={s.progressLinks}>
          {order.id && <span>order {shortAddr(order.id, 8, 6)}</span>}
          {txHash && <span>escrow tx {shortAddr(txHash, 8, 6)}</span>}
          {(order.assetId || tokenAssetId(flow?.nft)) && <span>NFT {shortAddr(order.assetId || tokenAssetId(flow?.nft), 8, 6)}</span>}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, setValue, options, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];
  const selectOption = (nextValue) => {
    setValue(nextValue);
    setOpen(false);
  };
  return (
    <div
      style={{ ...s.filterControl, ...(open ? s.filterControlOpen : null) }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        style={{
          ...s.filterButton,
          ...(open ? s.filterButtonOpen : null),
          ...(disabled ? s.disabledBtn : null),
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={s.filterTextWrap}>
          <span style={s.filterLabel}>{label}</span>
          <span style={s.filterValue}>{selected?.label}</span>
        </span>
        <span style={{ ...s.filterChevron, ...(open ? s.filterChevronOpen : null) }} />
      </button>
      {open && !disabled && (
        <div style={s.filterMenu} role="listbox">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option.value)}
                style={{ ...s.filterOption, ...(active ? s.filterOptionActive : null) }}
              >
                <span style={s.filterOptionLabel}>{option.label}</span>
                <span style={s.filterOptionSub}>{option.sub}</span>
                {active && <span style={s.filterOptionMark} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BrowseFilters({ sort, setSort, level, setLevel, loading }) {
  return (
    <div style={s.filterPanel}>
      <FilterSelect label="Sort" value={sort} setValue={setSort} options={SORT_OPTIONS} disabled={loading} />
      <FilterSelect label="Level" value={level} setValue={setLevel} options={LEVEL_OPTIONS} disabled={loading} />
    </div>
  );
}

function BrowseView({ listings, loading, walletMap, compact, sort, setSort, level, setLevel, onBuy, onOwnListing }) {
  return (
    <div style={s.stack}>
      <BrowseFilters sort={sort} setSort={setSort} level={level} setLevel={setLevel} loading={loading} />
      {loading ? <div style={s.meta}>Loading listings...</div> : !listings.length ? <div style={s.empty}>No active listings yet.</div> : (
        <div style={compact ? s.gridMobile : s.grid}>
          {listings.map((order) => {
            const ownWallet = walletForChain(order.assetChain, walletMap);
            const isOwn = ownWallet && String(order.sellerWallet || '').toLowerCase() === String(ownWallet || '').toLowerCase();
            return (
              <div key={order.id} style={compact ? s.cardMobile : s.card}>
                <div style={compact ? s.imgWrapMobile : s.imgWrap}>
                  <img src={orderImage(order)} alt="" style={s.img} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                  <span style={s.level}>L{order.level || 1}</span>
                </div>
                <div style={s.cardBody}>
                  <div style={s.cardLine}>
                    <b style={s.cardAsset}>{shortAddr(order.assetId, compact ? 5 : 4, 4)}</b>
                    <span style={s.cardPrice}>{orderPrice(order)}</span>
                  </div>
                  <div style={s.cardSub}>Seller {shortAddr(order.sellerWallet, compact ? 6 : 4, 4)}</div>
                  <button type="button" onClick={() => (isOwn ? onOwnListing(order) : onBuy(order))} style={{ ...s.cardBtn, ...(compact ? s.cardBtnMobile : null), ...(isOwn ? s.manageBtn : null) }}>
                    {isOwn ? 'Manage' : 'Buy'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SellView({ ready, config, owned, loading, supportedAssets, walletMap, selectedAsset, setSelectedAsset, priceInput, setPriceInput, busy, onSubmit, onRefresh, onChangeWallet }) {
  const connectedChains = (supportedAssets || []).filter((chain) => walletForChain(chain, walletMap));
  const feeBps = Number(config?.feeBps || 0);
  const royaltyBps = Number(config?.royaltyBps || 0);
  const sellerBps = Math.max(0, 10000 - feeBps - royaltyBps);
  const percent = (bps) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
  if (!ready) return <div style={s.empty}>Marketplace vaults are not ready.</div>;
  return (
    <div style={s.form}>
      <div style={s.formHeader}>
        <span style={s.formLabel}>Your Demon King NFTs</span>
        <div style={s.formHeaderActions}>
          <button type="button" style={s.smallBtn} onClick={onChangeWallet}>Change wallet</button>
          <button type="button" style={s.smallBtn} onClick={onRefresh}>Reload</button>
        </div>
      </div>
      {loading ? <div style={s.meta}>Loading your NFTs...</div> : (
        <div style={s.nftRow}>
          {owned.map((nft) => {
            const id = tokenAssetId(nft);
            const key = `${nft.chain}:${id}`;
            const active = selectedAsset === key;
            return (
              <button key={key} type="button" onClick={() => setSelectedAsset(key)} style={{ ...s.nftPick, ...(active ? s.nftPickActive : null) }}>
                <img src={nft.imageUrl || nftLevelImageUrl(nft.level || 1, id)} alt="" style={s.nftPickImg} />
                <span style={s.nftPickChain}>Level {nft.level || 1}</span>
                <span>{shortAddr(id, 4, 4)}</span>
              </button>
            );
          })}
          {!owned.length && <div style={s.emptyInline}>No supported Demon King NFTs found in connected wallets.</div>}
        </div>
      )}
      <div style={s.connectedLine}>
        Connected: {connectedChains.length
          ? connectedChains.map((chain) => CHAIN_LABEL[chain] || chain).join(', ')
          : 'connect a wallet on the chain that holds your NFT'}
      </div>
      <label style={s.label}>
        List price in USD
        <input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="e.g. 50" style={s.input} />
      </label>
      <div style={s.feeLine}>
        Marketplace fee {percent(feeBps)} - Royalty {percent(royaltyBps)} - Seller receives {percent(sellerBps)}
      </div>
      <button type="button" onClick={onSubmit} disabled={busy || !selectedAsset || !priceInput} style={{ ...s.primaryBtn, ...(busy ? s.disabledBtn : null) }}>
        {busy ? 'Listing...' : 'List and transfer to escrow'}
      </button>
    </div>
  );
}

function SellWalletModal({ chains, walletMap, onChoose, onClose }) {
  const supported = (chains || []).filter(Boolean);
  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.walletModal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Choose NFT wallet</span>
          <button type="button" style={s.closeBtn} onClick={onClose}>x</button>
        </div>
        <div style={s.walletModalSub}>
          Select the network that holds the Demon King NFT you want to sell.
        </div>
        <div style={s.walletChoiceList}>
          {supported.map((chain) => {
            const connected = walletForChain(chain, walletMap);
            const logo = chainLogo(chain);
            return (
              <button
                key={chain}
                type="button"
                onClick={() => onChoose(chain)}
                style={s.walletChoiceBtn}
              >
                <span style={s.walletChoiceBadge}>
                  {logo ? (
                    <img
                      src={logo}
                      alt=""
                      style={s.walletChoiceLogo}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    String(CHAIN_LABEL[chain] || chain).slice(0, 3).toUpperCase()
                  )}
                </span>
                <span style={s.walletChoiceMain}>
                  <span style={s.walletChoiceName}>{CHAIN_LABEL[chain] || chain}</span>
                  <span style={s.walletChoiceStatus}>
                    {connected ? `Connected ${shortAddr(connected, 6, 4)}` : 'Connect wallet'}
                  </span>
                </span>
                <span style={s.walletChoiceAction}>{connected ? 'Change' : 'Connect'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OrdersView({ orders, loading, walletMap, busy, onCancel, onResumeBuy, onDeposit, onReleaseReservation }) {
  if (loading) return <div style={s.meta}>Loading orders...</div>;
  if (!orders.length) return <div style={s.empty}>No marketplace orders yet.</div>;
  return (
    <div style={s.orderList}>
      {orders.map((order) => {
        const ownWallet = walletForChain(order.assetChain, walletMap);
        const buyerPaymentWallet = walletForChain(order.paymentChain, walletMap);
        const isSeller = ownWallet && String(order.sellerWallet || '').toLowerCase() === String(ownWallet || '').toLowerCase();
        const isBuyer = buyerPaymentWallet && String(order.buyerWallet || '').toLowerCase() === String(buyerPaymentWallet || '').toLowerCase();
        const reservationExpired = order.status === 'reserved' && reservationDeadlineMs(order) > 0 && reservationDeadlineMs(order) <= Date.now();
        const canCancel = isSeller && (['awaiting_deposit', 'active'].includes(order.status) || reservationExpired);
        const canDeposit = isSeller && order.status === 'awaiting_deposit';
        const canResume = order.status === 'reserved' && isBuyer;
        const canRelease = canResume;
        const buyerLabel = order.buyerPlayerName
          || order.reservation?.buyerPlayerName
          || shortAddr(order.buyerWallet || order.reservation?.buyerWallet || order.buyerPlayerId, 5, 4);
        const reservedLine = order.status === 'reserved'
          ? (isBuyer
              ? `Reserved for you until ${formatReservationTime(order)}.`
              : `Purchase in progress${buyerLabel ? ` by ${buyerLabel}` : ''} until ${formatReservationTime(order)}.`)
          : null;
        return (
          <div key={order.id} style={s.orderRow}>
            <img src={orderImage(order)} alt="" style={s.orderImg} />
            <div style={s.orderMain}>
              <b>{orderPrice(order)}</b>
              <span>{shortAddr(order.assetId, 6, 5)} - {order.status}</span>
              {reservedLine && <span style={s.orderReserved}>{reservedLine}</span>}
              {order.paymentTxHash && <span>payment {shortAddr(order.paymentTxHash, 8, 6)}</span>}
              {order.deliveryTxHash && <span>delivery {shortAddr(order.deliveryTxHash, 8, 6)}</span>}
              {order.payoutTxHash && <span>payout {shortAddr(order.payoutTxHash, 8, 6)}</span>}
              {order.error && <span style={s.orderError}>{order.error}</span>}
            </div>
            <div style={s.orderActions}>
              {canDeposit && (
                <button type="button" onClick={() => onDeposit(order)} disabled={busy === `deposit:${order.id}`} style={s.smallBtn}>
                  {busy === `deposit:${order.id}` ? 'Opening...' : 'Transfer'}
                </button>
              )}
              {canResume && (
                <button type="button" onClick={() => onResumeBuy(order)} disabled={busy === 'buy'} style={s.smallBtn}>
                  Pay
                </button>
              )}
              {canRelease && (
                <button type="button" onClick={() => onReleaseReservation(order.id)} disabled={busy === `release:${order.id}`} style={s.smallBtn}>
                  {busy === `release:${order.id}` ? 'Releasing...' : 'Release'}
                </button>
              )}
              {canCancel && (
                <button type="button" onClick={() => onCancel(order.id)} disabled={busy === `cancel:${order.id}`} style={s.smallBtn}>
                  {busy === `cancel:${order.id}` ? 'Cancelling...' : 'Cancel'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const s = {
  root: { width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 },
  stack: { width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 },
  readyBanner: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, background: '#e8f5e0', border: '2px solid #9cc98c', color: '#254d18' },
  warnBanner: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, background: '#fff0e0', border: '2px solid #e6b36a', color: '#67410f' },
  bannerTitle: { fontSize: 13, fontWeight: 900 },
  bannerSub: { fontSize: 11, fontWeight: 700, opacity: 0.9 },
  refreshBtn: { padding: '7px 10px', borderRadius: 8, border: '2px solid #9f8759', background: '#fff6dc', color: '#5C3A21', fontWeight: 900, cursor: 'pointer' },
  tabs: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, width: '100%', minWidth: 0 },
  tab: { minWidth: 0, padding: '8px 8px', borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff6dc', color: '#5C3A21', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  tabActive: { background: '#ffd97a', border: '2px solid #9f8759' },
  meta: { fontSize: 12, color: '#7a5a30', fontWeight: 800 },
  empty: { padding: 20, borderRadius: 10, border: '2px dashed #d4c8b0', background: '#fffaf0', color: '#5C3A21', textAlign: 'center', fontWeight: 800 },
  emptyInline: { padding: 12, color: '#7a5a30', fontWeight: 800, fontSize: 12 },
  filterPanel: { width: '100%', minWidth: 0, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, padding: 7, borderRadius: 12, borderWidth: 2, borderStyle: 'solid', borderColor: '#d4c8b0', background: 'linear-gradient(180deg, #fffaf0 0%, #fff3d8 100%)', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.7)' },
  filterControl: { position: 'relative', minWidth: 0, zIndex: 1 },
  filterControlOpen: { zIndex: 25 },
  filterButton: { width: '100%', minWidth: 0, minHeight: 48, boxSizing: 'border-box', padding: '7px 34px 7px 10px', borderRadius: 10, borderWidth: 2, borderStyle: 'solid', borderColor: '#bba882', background: 'linear-gradient(180deg, #fff8e6 0%, #f7e8c4 100%)', color: '#5C3A21', fontFamily: 'inherit', cursor: 'pointer', outline: 'none', boxShadow: '0 2px 0 rgba(92,58,33,0.12), inset 0 1px 0 rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' },
  filterButtonOpen: { borderColor: '#9f8759', background: 'linear-gradient(180deg, #ffdf80 0%, #f4c84f 100%)' },
  filterTextWrap: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 },
  filterLabel: { color: '#8d6f43', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1, letterSpacing: 0 },
  filterValue: { minWidth: 0, color: '#5C3A21', fontSize: 14, fontWeight: 900, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  filterChevron: { position: 'absolute', right: 13, top: '50%', width: 8, height: 8, borderRightWidth: 2, borderRightStyle: 'solid', borderRightColor: '#5C3A21', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: '#5C3A21', transform: 'translateY(-65%) rotate(45deg)', transition: 'transform 0.14s ease' },
  filterChevronOpen: { transform: 'translateY(-35%) rotate(225deg)' },
  filterMenu: { position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, zIndex: 30, padding: 5, borderRadius: 10, borderWidth: 2, borderStyle: 'solid', borderColor: '#9f8759', background: '#fff8e6', boxShadow: '0 10px 18px rgba(65,42,20,0.24), inset 0 1px 0 rgba(255,255,255,0.75)', display: 'flex', flexDirection: 'column', gap: 4 },
  filterOption: { position: 'relative', width: '100%', minHeight: 40, padding: '6px 28px 6px 8px', borderRadius: 8, borderWidth: 0, background: 'transparent', color: '#5C3A21', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 },
  filterOptionActive: { background: '#ffdc75', boxShadow: 'inset 0 0 0 2px #d0a63f' },
  filterOptionLabel: { fontSize: 13, fontWeight: 900, lineHeight: 1 },
  filterOptionSub: { fontSize: 10, fontWeight: 800, color: '#8d6f43', lineHeight: 1.05 },
  filterOptionMark: { position: 'absolute', right: 9, top: '50%', width: 9, height: 5, borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: '#5C3A21', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: '#5C3A21', transform: 'translateY(-65%) rotate(-45deg)' },
  grid: { width: '100%', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 },
  gridMobile: { width: '100%', minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 },
  card: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, padding: 8, borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff6dc', boxSizing: 'border-box' },
  cardMobile: { width: '100%', minWidth: 0, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '86px minmax(0, 1fr)', alignItems: 'stretch', gap: 8, padding: 7, borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff6dc', minHeight: 104 },
  cardBody: { minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 5 },
  imgWrap: { position: 'relative', aspectRatio: '1 / 1', boxSizing: 'border-box', borderRadius: 8, overflow: 'hidden', background: '#fff', border: '2px solid #d4c8b0' },
  imgWrapMobile: { position: 'relative', width: 86, height: 86, boxSizing: 'border-box', borderRadius: 8, overflow: 'hidden', background: '#fff', border: '2px solid #d4c8b0' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  level: { position: 'absolute', top: 4, right: 4, padding: '2px 5px', borderRadius: 5, background: '#5C3A21', color: '#fff7df', fontSize: 10, fontWeight: 900 },
  cardLine: { minWidth: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#5C3A21' },
  cardAsset: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardPrice: { flex: '0 0 auto', whiteSpace: 'nowrap', textAlign: 'right' },
  cardSub: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: '#7a5a30', fontWeight: 700 },
  cardBtn: { padding: '7px 10px', borderRadius: 8, border: '2px solid #4a8f2c', background: '#7ce04a', color: '#1a3d0a', fontWeight: 900, cursor: 'pointer' },
  cardBtnMobile: { minHeight: 34, padding: '7px 8px' },
  manageBtn: { border: '2px solid #9f8759', background: '#fff6dc', color: '#5C3A21' },
  disabledBtn: { opacity: 0.55, cursor: 'not-allowed' },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  formHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  formHeaderActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  formLabel: { fontSize: 12, color: '#5C3A21', fontWeight: 900, textTransform: 'uppercase' },
  nftRow: { display: 'flex', gap: 8, overflowX: 'auto', padding: 6, borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff8e6' },
  nftPick: { width: 104, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', borderRadius: 8, border: '2px solid transparent', background: '#fff', padding: 5, color: '#5C3A21', fontSize: 10, fontWeight: 800, cursor: 'pointer' },
  nftPickActive: { border: '2px solid #9f8759', background: '#ffd97a' },
  nftPickImg: { width: 72, height: 72, objectFit: 'cover', borderRadius: 6 },
  nftPickChain: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap', minHeight: 18 },
  connectedLine: { fontSize: 11, color: '#7a5a30', fontWeight: 800 },
  feeLine: { fontSize: 11, color: '#7a5a30', fontWeight: 800, background: '#fff8e6', border: '1px solid #d4c8b0', borderRadius: 8, padding: '7px 9px' },
  label: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#5C3A21', fontWeight: 900 },
  input: { padding: '9px 10px', borderRadius: 8, border: '2px solid #d4c8b0', background: '#fff', color: '#3a2810', fontWeight: 800 },
  primaryBtn: { width: '100%', padding: 11, borderRadius: 10, border: '3px solid #1f6d34', background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  smallBtn: { padding: '6px 9px', borderRadius: 8, border: '2px solid #9f8759', background: '#fff6dc', color: '#5C3A21', fontWeight: 900, cursor: 'pointer' },
  orderList: { display: 'flex', flexDirection: 'column', gap: 8 },
  orderRow: { display: 'flex', alignItems: 'center', gap: 9, padding: 8, borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff6dc' },
  orderImg: { width: 54, height: 54, objectFit: 'cover', borderRadius: 8, border: '1px solid #d4c8b0' },
  orderMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#5C3A21', fontWeight: 700 },
  orderActions: { display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'stretch' },
  orderReserved: { color: '#7a5a30', fontWeight: 900 },
  orderError: { color: '#a12a1e', fontWeight: 900 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  modal: { width: 380, maxWidth: '94vw', padding: 12, borderRadius: 14, border: '4px solid #d4c8b0', background: '#fdf8e7', display: 'flex', flexDirection: 'column', gap: 10 },
  walletModal: { width: 360, maxWidth: '94vw', padding: 12, borderRadius: 14, border: '4px solid #d4c8b0', background: '#fdf8e7', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 18px 50px rgba(0,0,0,0.45)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: 900, color: '#5C3A21' },
  closeBtn: { width: 24, height: 24, borderRadius: 12, border: '2px solid #fff', background: '#E53935', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  walletModalSub: { fontSize: 12, fontWeight: 800, color: '#7a5a30', lineHeight: 1.35 },
  walletChoiceList: { display: 'flex', flexDirection: 'column', gap: 7 },
  walletChoiceBtn: { width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff6dc', color: '#5C3A21', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  walletChoiceBadge: { width: 38, height: 34, borderRadius: 9, background: '#fffaf0', border: '1px solid rgba(92,58,33,0.22)', color: '#5C3A21', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, letterSpacing: 0.4, flex: '0 0 auto', overflow: 'hidden', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)' },
  walletChoiceLogo: { width: '82%', height: '82%', objectFit: 'contain', display: 'block' },
  walletChoiceMain: { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  walletChoiceName: { fontSize: 13, fontWeight: 900, color: '#5C3A21' },
  walletChoiceStatus: { fontSize: 10, fontWeight: 800, color: '#7a5a30', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  walletChoiceAction: { flex: '0 0 auto', fontSize: 11, fontWeight: 900, color: '#1d6fe0', textTransform: 'uppercase' },
  modalImg: { width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff' },
  progressHead: { display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff8e6' },
  progressImg: { width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #d4c8b0', background: '#fff' },
  progressMeta: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, color: '#5C3A21', fontSize: 12, fontWeight: 800 },
  stepList: { display: 'flex', flexDirection: 'column', gap: 6 },
  stepRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, border: '1px solid #d4c8b0', background: '#fff6dc', color: '#7a5a30', fontSize: 12, fontWeight: 900 },
  stepRowActive: { background: '#fff0bd', color: '#5C3A21' },
  stepRowError: { background: '#ffe1d8', color: '#9b2d1c' },
  stepDot: { width: 28, height: 22, borderRadius: 7, border: '2px solid #d4c8b0', background: '#fff', color: '#7a5a30', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 },
  stepDotDone: { border: '2px solid #4a8f2c', background: '#7ce04a', color: '#1a3d0a' },
  stepDotActive: { border: '2px solid #9f8759', background: '#ffd97a', color: '#5C3A21' },
  stepDotError: { border: '2px solid #c5523c', background: '#f26d5b', color: '#fff' },
  progressMessage: { padding: '7px 8px', borderRadius: 8, background: '#fff8e6', color: '#5C3A21', fontSize: 12, fontWeight: 800 },
  progressError: { padding: '7px 8px', borderRadius: 8, background: '#ffe1d8', color: '#9b2d1c', fontSize: 12, fontWeight: 900 },
  progressLinks: { display: 'flex', flexDirection: 'column', gap: 2, color: '#7a5a30', fontSize: 11, fontWeight: 800 },
  breakdown: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, padding: 8, borderRadius: 8, border: '1px solid #d4c8b0', background: '#fff8e6', color: '#5C3A21', fontSize: 12 },
  deliveryChips: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  chip: { minWidth: 72, minHeight: 34, padding: '4px 8px', borderRadius: 7, border: '2px solid #d4c8b0', background: '#fff6dc', color: '#5C3A21', fontWeight: 900, cursor: 'pointer', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, lineHeight: 1.05 },
  chipLabel: { display: 'block', fontSize: 12, whiteSpace: 'nowrap' },
  chipStatus: { display: 'block', fontSize: 9, color: '#8d6f43', whiteSpace: 'nowrap' },
  chipActive: { background: '#ffd97a', border: '2px solid #9f8759' },
  chipMuted: { opacity: 0.65 },
  connectWalletBtn: { justifySelf: 'start', padding: '6px 9px', borderRadius: 8, border: '2px solid #9f8759', background: '#fff6dc', color: '#5C3A21', fontSize: 11, fontWeight: 900, cursor: 'pointer' },
  notice: { padding: 8, borderRadius: 8, border: '1px solid #f0c4a0', background: '#fff0e0', color: '#7a4a1a', fontSize: 12, fontWeight: 800 },
  noticeOk: { padding: 8, borderRadius: 8, border: '1px solid #b0d4a0', background: '#e8f5e0', color: '#2e6b1a', fontSize: 12, fontWeight: 800 },
};
