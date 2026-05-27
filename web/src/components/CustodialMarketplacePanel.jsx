import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CUSTODIAL_EVM_CHAIN_IDS,
  cancelCustodialListing,
  createCustodialListing,
  depositNftToCustody,
  fetchCustodialListings,
  fetchCustodialMarketplaceConfig,
  fetchMyCustodialOrders,
  formatCustodialUsdc,
  payCustodialOrder,
} from '../lib/custodialMarketplace';
import { clearDemonKingNftCache, fetchOwnedNfts, nftLevelImageUrl } from '../lib/nftV3Client';
import { addClientBreadcrumb } from '../lib/clientLogger';

const PAGE_SIZE = 50;
const CHAIN_LABEL = { base: 'Base', arbitrum: 'Arbitrum', monad: 'Monad', solana: 'Solana', aptos: 'Aptos' };
const CHAIN_BADGE = { base: 'BASE', arbitrum: 'ARB', monad: 'MON', solana: 'SOL', aptos: 'APT' };

function shortAddr(value, head = 5, tail = 4) {
  const s = String(value || '');
  if (!s) return '';
  return s.length <= head + tail + 3 ? s : `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function orderImage(order) {
  return nftLevelImageUrl(order?.level || 1, order?.assetId || order?.asset_id || order?.assetChain || 'base');
}

function orderPrice(order) {
  return `${formatCustodialUsdc(order?.priceUsdcUnits || 0)} USDC`;
}

function usdcUnitsBigInt(value) {
  try { return BigInt(String(value || '0')); } catch { return 0n; }
}

function formatCompactUsdc(units) {
  const raw = usdcUnitsBigInt(units);
  const text = formatCustodialUsdc(raw);
  const value = Number(text);
  if (!Number.isFinite(value)) return `${text} USDC`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

function tokenAssetId(token) {
  return String(token?.tokenId || token?.tokenAddress || token?.asset || token?.mint || token?.id || '').trim();
}

function walletForChain(chain, { evmAddress, solAddress, aptosAddress }) {
  if (CUSTODIAL_EVM_CHAIN_IDS[chain]) return evmAddress || '';
  if (chain === 'solana') return solAddress || '';
  if (chain === 'aptos') return aptosAddress || '';
  return '';
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

  const ready = !!config?.ready;
  const supportedAssets = config?.supportedAssets || [];
  const supportedPayments = config?.supportedPaymentChains || [];
  const supportedDestinations = config?.supportedDestinationChains || [];
  const canUsePortal = typeof document !== 'undefined' && !!document.body;
  const selectedNft = useMemo(() => owned.find((nft) => `${nft.chain}:${tokenAssetId(nft)}` === selectedAsset) || null, [owned, selectedAsset]);
  const walletMap = useMemo(() => ({ evmAddress, solAddress, aptosAddress }), [aptosAddress, evmAddress, solAddress]);
  const stats = useMemo(() => {
    const volumeUnits = remoteStats?.volumeUsdcUnits != null
      ? usdcUnitsBigInt(remoteStats.volumeUsdcUnits)
      : listings.reduce((sum, order) => sum + usdcUnitsBigInt(order?.priceUsdcUnits), 0n);
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
      const json = await fetchCustodialListings({ status: 'active', limit: PAGE_SIZE });
      setListings(Array.isArray(json?.listings) ? json.listings : []);
      setRemoteStats(json?.stats || null);
    } catch (err) {
      setRemoteStats(null);
      setNotice(err?.message?.slice(0, 220) || 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, []);

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
          .map((token) => ({ ...token, chain: token.chain || chain }));
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
    if (buyTarget?.assetChain && supportedDestinations.includes(buyTarget.assetChain)) {
      setDeliveryChain(buyTarget.assetChain);
    }
  }, [buyTarget, supportedDestinations]);

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

  const handleCreateListing = useCallback(async () => {
    if (!sessionToken) { setNotice('Game session is not ready.'); return; }
    if (!ready) { setNotice('Marketplace vaults are not ready on the server.'); return; }
    if (!selectedNft) { setNotice('Pick a Demon King NFT.'); return; }
    const assetChain = selectedNft.chain;
    const assetId = tokenAssetId(selectedNft);
    const sellerWallet = walletForChain(assetChain, walletMap);
    if (!sellerWallet) { setNotice(`Connect ${CHAIN_LABEL[assetChain] || assetChain} wallet to sell.`); return; }
    const payoutChain = supportedPayments.includes(assetChain) ? assetChain : supportedPayments[0] || 'base';
    const payoutAddress = walletForChain(payoutChain, walletMap);
    if (!payoutAddress) { setNotice(`Connect ${CHAIN_LABEL[payoutChain] || payoutChain} wallet for payout.`); return; }
    setBusy('list');
    setNotice(null);
    try {
      const created = await createCustodialListing({
        token: sessionToken,
        assetChain,
        assetId,
        sellerWallet,
        sellerPayoutChain: payoutChain,
        sellerPayoutAddress: payoutAddress,
        priceUsdc: priceInput,
      });
      const order = created.order;
      if (order?.status === 'awaiting_deposit' && !created.resumed && !created.alreadyListed) {
        const deposited = await depositNftToCustody({
          evmWallet,
          solWallet,
          aptosWallet,
          token: sessionToken,
          order,
          nft: selectedNft,
          owner: sellerWallet,
        });
        setNotice(`Listed. Custody tx ${shortAddr(deposited.txHash, 8, 6)} confirmed.`);
      } else if (created.resumed) {
        setNotice('Listing resumed. NFT custody is already verified.');
      } else {
        setNotice('This NFT is already listed.');
      }
      addClientBreadcrumb('marketplace.custodial.list.success', { orderId: created.order?.id, assetChain, assetId });
      setPriceInput('');
      setView('orders');
      await Promise.all([loadListings(), loadOrders(), loadOwned()]);
    } catch (err) {
      const msg = err?.shortMessage || err?.message || String(err);
      setNotice(msg.slice(0, 240));
      addClientBreadcrumb('marketplace.custodial.list.failed', { message: msg }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [aptosWallet, evmWallet, loadListings, loadOrders, loadOwned, priceInput, ready, selectedNft, sessionToken, solWallet, supportedPayments, walletMap]);

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
      });
      const finalStatus = result?.confirmed?.order?.status || 'paid';
      setNotice(finalStatus === 'delivered'
        ? 'Purchase complete. NFT delivered.'
        : `Payment confirmed. Settlement status: ${finalStatus}.`);
      addClientBreadcrumb('marketplace.custodial.buy.success', { orderId: buyTarget.id, txHash: result?.txHash, status: finalStatus });
      setBuyTarget(null);
      await Promise.all([loadListings(), loadOrders()]);
    } catch (err) {
      const msg = err?.shortMessage || err?.message || String(err);
      setNotice(msg.slice(0, 240));
      addClientBreadcrumb('marketplace.custodial.buy.failed', { orderId: buyTarget?.id, message: msg }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [aptosWallet, buyTarget, connectForChain, deliveryChain, evmWallet, loadListings, loadOrders, paymentChain, sessionToken, solWallet, walletMap]);

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
          onBuy={(order) => {
            addClientBreadcrumb('marketplace.custodial.buy.open', { orderId: order?.id, assetChain: order?.assetChain });
            setBuyTarget(order);
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
        />
      )}
      {view === 'orders' && <OrdersView orders={orders} loading={loading} walletMap={walletMap} busy={busy} onCancel={handleCancel} />}

      {buyTarget && canUsePortal && createPortal((
        <div style={s.modalOverlay} onClick={busy === 'buy' ? undefined : () => setBuyTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>Buy Demon King</span>
              <button type="button" style={s.closeBtn} onClick={() => setBuyTarget(null)} disabled={busy === 'buy'}>x</button>
            </div>
            <img src={orderImage(buyTarget)} alt="" style={s.modalImg} />
            <div style={s.breakdown}>
              <span>Price</span><b>{orderPrice(buyTarget)}</b>
              <span>Listed on</span><b>{CHAIN_LABEL[buyTarget.assetChain] || buyTarget.assetChain}</b>
              <span>Pay chain</span>
              <ChipRow
                chains={supportedPayments}
                value={paymentChain}
                setValue={setPaymentChain}
                walletMap={walletMap}
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
              {busy === 'buy' ? 'Paying...' : 'Pay USDC'}
            </button>
          </div>
        </div>
      ), document.body)}

      {notice && <div style={/^(Listed|Payment|Purchase|Listing cancelled)/.test(notice) ? s.noticeOk : s.notice}>{notice}</div>}
    </div>
  );
}

function Tab({ label, active, onClick }) {
  return <button type="button" onClick={onClick} style={{ ...s.tab, ...(active ? s.tabActive : null) }}>{label}</button>;
}

function ChainBadge({ chain }) {
  return <span style={s.chainBadge}>{CHAIN_BADGE[chain] || String(chain || '').toUpperCase()}</span>;
}

function StandardLabel({ standard }) {
  const value = String(standard || '').toLowerCase();
  if (!value) return null;
  if (value.includes('mpl-core')) return <span style={s.standardLabel}>Core</span>;
  if (value.includes('token2022')) return <span style={s.standardLabel}>Token-2022</span>;
  if (value.includes('erc')) return <span style={s.standardLabel}>EVM</span>;
  return <span style={s.standardLabel}>{standard}</span>;
}

function ChipRow({ chains, value, setValue, walletMap, onConnectChain, busy }) {
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
            title={connected ? CHAIN_LABEL[chain] : `Connect ${CHAIN_LABEL[chain]} wallet`}
          >
            <span style={s.chipLabel}>{CHAIN_LABEL[chain] || chain}</span>
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

function BrowseView({ listings, loading, walletMap, onBuy, onOwnListing }) {
  return (
    <div style={s.stack}>
      {loading ? <div style={s.meta}>Loading listings...</div> : !listings.length ? <div style={s.empty}>No active listings yet.</div> : (
        <div style={s.grid}>
          {listings.map((order) => {
            const ownWallet = walletForChain(order.assetChain, walletMap);
            const isOwn = ownWallet && String(order.sellerWallet || '').toLowerCase() === String(ownWallet || '').toLowerCase();
            return (
              <div key={order.id} style={s.card}>
                <div style={s.imgWrap}>
                  <img src={orderImage(order)} alt="" style={s.img} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                  <span style={s.level}>L{order.level || 1}</span>
                  <span style={s.chainBadgeFloat}><ChainBadge chain={order.assetChain} /></span>
                </div>
                <div style={s.cardLine}><b>{shortAddr(order.assetId, 4, 4)}</b><span>{orderPrice(order)}</span></div>
                <div style={s.cardSub}>Seller {shortAddr(order.sellerWallet, 4, 4)}</div>
                <button type="button" onClick={() => (isOwn ? onOwnListing(order) : onBuy(order))} style={{ ...s.cardBtn, ...(isOwn ? s.manageBtn : null) }}>
                  {isOwn ? 'Manage' : 'Buy'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SellView({ ready, config, owned, loading, supportedAssets, walletMap, selectedAsset, setSelectedAsset, priceInput, setPriceInput, busy, onSubmit, onRefresh }) {
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
        <button type="button" style={s.smallBtn} onClick={onRefresh}>Reload</button>
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
                <span style={s.nftPickChain}><ChainBadge chain={nft.chain} /> <StandardLabel standard={nft.standard} /></span>
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
        Price in USDC
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

function OrdersView({ orders, loading, walletMap, busy, onCancel }) {
  if (loading) return <div style={s.meta}>Loading orders...</div>;
  if (!orders.length) return <div style={s.empty}>No marketplace orders yet.</div>;
  return (
    <div style={s.orderList}>
      {orders.map((order) => {
        const ownWallet = walletForChain(order.assetChain, walletMap);
        const isSeller = ownWallet && String(order.sellerWallet || '').toLowerCase() === String(ownWallet || '').toLowerCase();
        const canCancel = isSeller && ['awaiting_deposit', 'active', 'reserved'].includes(order.status);
        return (
          <div key={order.id} style={s.orderRow}>
            <img src={orderImage(order)} alt="" style={s.orderImg} />
            <div style={s.orderMain}>
              <b>{orderPrice(order)} <ChainBadge chain={order.assetChain} /></b>
              <span>{shortAddr(order.assetId, 6, 5)} - {order.status}</span>
              {order.paymentTxHash && <span>payment {shortAddr(order.paymentTxHash, 8, 6)}</span>}
              {order.deliveryTxHash && <span>delivery {shortAddr(order.deliveryTxHash, 8, 6)}</span>}
              {order.payoutTxHash && <span>payout {shortAddr(order.payoutTxHash, 8, 6)}</span>}
              {order.error && <span style={s.orderError}>{order.error}</span>}
            </div>
            {canCancel && (
              <button type="button" onClick={() => onCancel(order.id)} disabled={busy === `cancel:${order.id}`} style={s.smallBtn}>
                {busy === `cancel:${order.id}` ? 'Cancelling...' : 'Cancel'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 10 },
  stack: { display: 'flex', flexDirection: 'column', gap: 10 },
  readyBanner: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, background: '#e8f5e0', border: '2px solid #9cc98c', color: '#254d18' },
  warnBanner: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, background: '#fff0e0', border: '2px solid #e6b36a', color: '#67410f' },
  bannerTitle: { fontSize: 13, fontWeight: 900 },
  bannerSub: { fontSize: 11, fontWeight: 700, opacity: 0.9 },
  refreshBtn: { padding: '7px 10px', borderRadius: 8, border: '2px solid #9f8759', background: '#fff6dc', color: '#5C3A21', fontWeight: 900, cursor: 'pointer' },
  tabs: { display: 'flex', gap: 6 },
  tab: { flex: 1, padding: '8px 10px', borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff6dc', color: '#5C3A21', fontWeight: 900, cursor: 'pointer' },
  tabActive: { background: '#ffd97a', border: '2px solid #9f8759' },
  meta: { fontSize: 12, color: '#7a5a30', fontWeight: 800 },
  empty: { padding: 20, borderRadius: 10, border: '2px dashed #d4c8b0', background: '#fffaf0', color: '#5C3A21', textAlign: 'center', fontWeight: 800 },
  emptyInline: { padding: 12, color: '#7a5a30', fontWeight: 800, fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 },
  card: { display: 'flex', flexDirection: 'column', gap: 5, padding: 8, borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff6dc' },
  imgWrap: { position: 'relative', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', background: '#fff', border: '2px solid #d4c8b0' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  level: { position: 'absolute', top: 4, right: 4, padding: '2px 5px', borderRadius: 5, background: '#5C3A21', color: '#fff7df', fontSize: 10, fontWeight: 900 },
  chainBadgeFloat: { position: 'absolute', top: 4, left: 4 },
  chainBadge: { display: 'inline-flex', alignItems: 'center', padding: '2px 5px', borderRadius: 5, background: '#2d5a85', color: '#fff', fontSize: 9, fontWeight: 900 },
  standardLabel: { display: 'inline-flex', alignItems: 'center', padding: '2px 5px', borderRadius: 5, background: '#efe3c8', color: '#5C3A21', fontSize: 9, fontWeight: 900 },
  cardLine: { display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 12, color: '#5C3A21' },
  cardSub: { fontSize: 10, color: '#7a5a30', fontWeight: 700 },
  cardBtn: { padding: '7px 10px', borderRadius: 8, border: '2px solid #4a8f2c', background: '#7ce04a', color: '#1a3d0a', fontWeight: 900, cursor: 'pointer' },
  manageBtn: { border: '2px solid #9f8759', background: '#fff6dc', color: '#5C3A21' },
  disabledBtn: { opacity: 0.55, cursor: 'not-allowed' },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  formHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
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
  orderError: { color: '#a12a1e', fontWeight: 900 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  modal: { width: 380, maxWidth: '94vw', padding: 12, borderRadius: 14, border: '4px solid #d4c8b0', background: '#fdf8e7', display: 'flex', flexDirection: 'column', gap: 10 },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: 900, color: '#5C3A21' },
  closeBtn: { width: 24, height: 24, borderRadius: 12, border: '2px solid #fff', background: '#E53935', color: '#fff', fontWeight: 900, cursor: 'pointer' },
  modalImg: { width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, border: '2px solid #d4c8b0', background: '#fff' },
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
