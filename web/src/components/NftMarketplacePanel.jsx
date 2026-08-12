// Marketplace panel — secondary content area rendered inside NftMintPanel
// when `activeShopTab === 'marketplace'`.
//
// Marketplace works on Base only (see production/nft-v3-system/07). For
// players who arrived through Solana / Aptos / Arbitrum / Monad, the
// listings remain browsable (read-only) but the buy / list / cancel
// buttons surface a "Connect Base wallet" banner that hands off to the
// EvmWalletModal already mounted by NftMintPanel.
//
// Three internal views:
//   - 'browse'    — grid of all active listings + Buy
//   - 'mine'      — listings owned by the connected Base wallet + Cancel
//   - 'list-new'  — pick an owned NFT, choose token + price, sign list tx
//
// All write flows go through web/src/lib/marketplace.js which talks to
// the DemonKingMarketplace proxy on Base. Read data is pulled from
// /api/marketplace/listings (server indexer).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buyMarketplaceListing,
  cancelMarketplaceListing,
  fetchMarketplaceListings,
  fetchTokenRarities,
  formatPriceWei,
  isLegacyCopPaymentToken,
  isEthPayment,
  listNftOnMarketplace,
  marketplaceChainLabel,
  marketplacePaymentOptions,
  normalizeMarketplaceChain,
  nftImageUrl,
  nftRarityLabel,
  parsePriceToWei,
  paymentAddressFromId,
  paymentTokenMeta,
} from '../lib/marketplace';
import { fetchOwnedNfts, nftRarityBadgeStyle, nftRarityCardStyle, normalizeNftRarity, syncDemonKingNfts } from '../lib/nftV3Client';
import { addClientBreadcrumb } from '../lib/clientLogger';
import { uiButton, uiIconButton } from '../styles/theme';

const LISTINGS_PAGE_SIZE = 50;
const RARITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'common', label: 'Common' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' },
  { value: 'unrevealed', label: 'Unrevealed' },
];

function shortAddr(s, head = 6, tail = 4) {
  if (!s) return '';
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function timeUntil(expiresAt) {
  if (!expiresAt) return null;
  const sec = Number(expiresAt) - Math.floor(Date.now() / 1000);
  if (sec <= 0) return 'expired';
  const days = Math.floor(sec / 86400);
  if (days >= 1) return `${days}d`;
  const hrs = Math.floor(sec / 3600);
  if (hrs >= 1) return `${hrs}h`;
  return `${Math.max(1, Math.floor(sec / 60))}m`;
}

function listingRarityKey(listing, rarity) {
  const key = normalizeNftRarity(rarity || listing?.rarity);
  if (key) return key;
  return Number(listing?.level || 1) > 1 ? 'legendary' : 'unrevealed';
}

export default function NftMarketplacePanel({
  chain = 'base',
  evmAddress,
  evmWallet,
  evmOnBase,
  onConnectBase,
  onOpenEvmModal,
}) {
  // Sub-view inside marketplace. Defaults to browse; the Cancel/Buy/List
  // confirm screens overlay this view but don't replace it.
  const [view, setView] = useState('browse');

  // ── Browse listings ────────────────────────────────────────────────
  const [listings, setListings] = useState([]);
  const [listingsTotal, setListingsTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState(null);
  const [rarityByTokenId, setRarityByTokenId] = useState({});
  const [rarityFilter, setRarityFilter] = useState('all');

  // ── My listings ────────────────────────────────────────────────────
  const [mine, setMine] = useState([]);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState(null);

  // ── List new ───────────────────────────────────────────────────────
  const [ownedNfts, setOwnedNfts] = useState([]);
  const [ownedLoading, setOwnedLoading] = useState(false);
  const [ownedError, setOwnedError] = useState(null);
  const [pickTokenId, setPickTokenId] = useState('');
  const [payId, setPayId] = useState('usdc');
  const [priceInput, setPriceInput] = useState('');
  const [expiryDays, setExpiryDays] = useState(7);

  // ── In-flight tx state ─────────────────────────────────────────────
  const [busy, setBusy] = useState(null);   // 'buy' | 'list' | 'cancel' | null
  const [notice, setNotice] = useState(null);
  const [lastTxHash, setLastTxHash] = useState(null);
  const [buyTarget, setBuyTarget] = useState(null); // listing object

  const chainKey = normalizeMarketplaceChain(chain);
  const chainLabel = marketplaceChainLabel(chainKey);
  const chainWalletLabel = evmAddress
    ? (evmOnBase ? `${chainLabel} - ${shortAddr(evmAddress)}` : `Switch to ${chainLabel} (${shortAddr(evmAddress)})`)
    : `Connect ${chainLabel} wallet`;
  const paymentOptions = useMemo(() => marketplacePaymentOptions(chainKey), [chainKey]);
  const txExplorerBase = chainKey === 'arbitrum' ? 'https://arbiscan.io/tx/' : 'https://basescan.org/tx/';

  useEffect(() => {
    if (!paymentOptions.some((p) => p.id === payId)) {
      setPayId(paymentOptions[0]?.id || 'usdc');
    }
  }, [payId, paymentOptions]);

  const baseReady = !!evmAddress && !!evmOnBase;

  // ── Fetch listings whenever page / view changes ────────────────────
  const loadListings = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    if (!silent) setBrowseLoading(true);
    setBrowseError(null);
    try {
      const offset = page * LISTINGS_PAGE_SIZE;
      const json = await fetchMarketplaceListings({
        chain: chainKey, activeOnly: true, limit: LISTINGS_PAGE_SIZE, offset,
      });
      const rows = (Array.isArray(json?.listings) ? json.listings : [])
        .filter((row) => !isLegacyCopPaymentToken(row.paymentToken, chainKey));
      setListings(rows);
      setListingsTotal(rows.length);
      // Enrich with revealed rarity. Legacy L2/L3 tokens fall back to Legendary.
      const tokenIds = rows.map((r) => r.tokenId).filter(Boolean);
      if (tokenIds.length) {
        try {
          const legacyLevels = Object.fromEntries(rows.map((row) => [String(row.tokenId), Number(row.level || 1)]));
          const rarities = await fetchTokenRarities(tokenIds, chainKey, legacyLevels);
          setRarityByTokenId((prev) => ({ ...prev, ...rarities }));
        } catch { /* image will fall back to L1 */ }
      }
    } catch (err) {
      setBrowseError(err?.message?.slice(0, 200) || 'Failed to load listings');
    } finally {
      setBrowseLoading(false);
    }
  }, [chainKey, page]);

  useEffect(() => { loadListings(); }, [loadListings]);

  // ── My listings whenever wallet changes ────────────────────────────
  const loadMine = useCallback(async () => {
    if (!evmAddress) { setMine([]); return; }
    setMineLoading(true);
    setMineError(null);
    try {
      const json = await fetchMarketplaceListings({
        chain: chainKey, seller: evmAddress, activeOnly: true, limit: 100,
      });
      const rows = Array.isArray(json?.listings) ? json.listings : [];
      setMine(rows);
      const tokenIds = rows.map((r) => r.tokenId).filter(Boolean);
      if (tokenIds.length) {
        try {
          const legacyLevels = Object.fromEntries(rows.map((row) => [String(row.tokenId), Number(row.level || 1)]));
          const rarities = await fetchTokenRarities(tokenIds, chainKey, legacyLevels);
          setRarityByTokenId((prev) => ({ ...prev, ...rarities }));
        } catch {}
      }
    } catch (err) {
      setMineError(err?.message?.slice(0, 200) || 'Failed to load your listings');
    } finally {
      setMineLoading(false);
    }
  }, [chainKey, evmAddress]);

  useEffect(() => { if (view === 'mine') loadMine(); }, [view, loadMine]);

  // ── Owned NFTs for List-new flow ───────────────────────────────────
  const loadOwned = useCallback(async () => {
    if (!evmAddress) { setOwnedNfts([]); return; }
    setOwnedLoading(true);
    setOwnedError(null);
    try {
      const ownedJson = await fetchOwnedNfts({ chain: chainKey, address: evmAddress });
      const tokens = Array.isArray(ownedJson?.tokens) ? ownedJson.tokens : [];
      setOwnedNfts(tokens);
      if (tokens.length === 1 && !pickTokenId) setPickTokenId(tokens[0].tokenId);
    } catch (err) {
      setOwnedError(err?.message?.slice(0, 200) || 'Failed to load your NFTs');
    } finally {
      setOwnedLoading(false);
    }
  }, [chainKey, evmAddress, pickTokenId]);

  useEffect(() => { if (view === 'list-new') loadOwned(); }, [view, loadOwned]);

  // ── Actions ────────────────────────────────────────────────────────
  const ensureBaseGate = useCallback(() => {
    if (!evmAddress) {
      onOpenEvmModal?.();
      setNotice(`Connect a ${chainLabel} wallet to continue.`);
      return false;
    }
    if (!evmOnBase) {
      onConnectBase?.();
      setNotice(`Switching wallet to ${chainLabel}...`);
      return false;
    }
    return true;
  }, [chainLabel, evmAddress, evmOnBase, onConnectBase, onOpenEvmModal]);

  const handleBuy = useCallback(async () => {
    if (!buyTarget) return;
    if (isLegacyCopPaymentToken(buyTarget.paymentToken, chainKey)) {
      setNotice('Legacy CoP listings are no longer available on the marketplace.');
      setBuyTarget(null);
      return;
    }
    if (!ensureBaseGate()) return;
    setBusy('buy');
    setNotice(null);
    try {
      const { hash } = await buyMarketplaceListing({
        evmWallet,
        buyerAddress: evmAddress,
        tokenId: buyTarget.tokenId,
        paymentToken: buyTarget.paymentToken,
        priceWei: buyTarget.priceWei,
        chain: chainKey,
      });
      setLastTxHash(hash);
      setNotice('✓ Purchase confirmed. NFT will appear in your wallet shortly.');
      addClientBreadcrumb('marketplace.buy.success', { chain: chainKey, tokenId: buyTarget.tokenId, hash });
      void syncDemonKingNfts({ wallet: evmAddress, chains: [chainKey], force: true }).catch((err) => {
        addClientBreadcrumb('marketplace.demon_king_sync_after_buy_failed', {
          chain: chainKey,
          tokenId: buyTarget.tokenId,
          message: err?.message || String(err),
        }, 'warn');
      });
      setBuyTarget(null);
      // Indexer needs a couple of blocks; small delay before refresh.
      setTimeout(() => loadListings({ silent: true }), 4000);
    } catch (err) {
      const msg = err?.shortMessage || err?.message || String(err);
      setNotice(msg.slice(0, 200));
      addClientBreadcrumb('marketplace.buy.failed', { chain: chainKey, tokenId: buyTarget?.tokenId, message: msg }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [buyTarget, chainKey, ensureBaseGate, evmAddress, evmWallet, loadListings]);

  const handleList = useCallback(async () => {
    if (!ensureBaseGate()) return;
    if (!pickTokenId) { setNotice('Pick an NFT to list.'); return; }
    let priceWei;
    const paymentToken = paymentAddressFromId(payId, chainKey);
    if (!paymentToken) { setNotice('Pick a valid payment token.'); return; }
    try {
      priceWei = parsePriceToWei(priceInput, paymentToken);
    } catch (err) {
      setNotice(err?.message || 'Invalid price');
      return;
    }
    const expiresAt = expiryDays > 0
      ? Math.floor(Date.now() / 1000) + expiryDays * 86400
      : 0;
    setBusy('list');
    setNotice(null);
    try {
      const { hash } = await listNftOnMarketplace({
        evmWallet,
        ownerAddress: evmAddress,
        tokenId: pickTokenId,
        paymentToken,
        priceWei,
        expiresAt,
        chain: chainKey,
      });
      setLastTxHash(hash);
      setNotice('✓ Listed. Indexer will pick it up in a few seconds.');
      addClientBreadcrumb('marketplace.list.success', { chain: chainKey, tokenId: pickTokenId, hash });
      setView('mine');
      setPriceInput('');
      setTimeout(() => { loadMine(); loadListings({ silent: true }); }, 4000);
    } catch (err) {
      const msg = err?.shortMessage || err?.message || String(err);
      setNotice(msg.slice(0, 200));
      addClientBreadcrumb('marketplace.list.failed', { chain: chainKey, tokenId: pickTokenId, message: msg }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [chainKey, ensureBaseGate, pickTokenId, priceInput, payId, expiryDays, evmWallet, evmAddress, loadMine, loadListings]);

  const handleCancel = useCallback(async (tokenId) => {
    if (!ensureBaseGate()) return;
    setBusy('cancel');
    setNotice(null);
    try {
      const { hash } = await cancelMarketplaceListing({
        evmWallet, ownerAddress: evmAddress, tokenId, chain: chainKey,
      });
      setLastTxHash(hash);
      setNotice('✓ Listing cancelled.');
      addClientBreadcrumb('marketplace.cancel.success', { chain: chainKey, tokenId, hash });
      setTimeout(() => { loadMine(); loadListings({ silent: true }); }, 4000);
    } catch (err) {
      const msg = err?.shortMessage || err?.message || String(err);
      setNotice(msg.slice(0, 200));
      addClientBreadcrumb('marketplace.cancel.failed', { chain: chainKey, tokenId, message: msg }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [chainKey, ensureBaseGate, evmWallet, evmAddress, loadMine, loadListings]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={s.root}>
      {/* Base-wallet banner. Hidden when fully ready. Listings remain
          browsable even when this banner is visible — only buy/list/cancel
          are gated. */}
      {!baseReady && (
        <div style={s.connectBanner}>
          <div style={s.connectBannerText}>
            <span style={s.connectBannerTitle}>Marketplace runs on {chainLabel}</span>
            <span style={s.connectBannerSub}>
              {evmAddress
                ? `Your wallet is connected to a different network. Switch to ${chainLabel} to trade.`
                : `Buying and selling needs a ${chainLabel} wallet. Browsing works without one.`}
            </span>
          </div>
          <button
            type="button"
            onClick={evmAddress ? onConnectBase : onOpenEvmModal}
            style={s.connectBannerBtn}
          >
            {chainWalletLabel}
          </button>
        </div>
      )}

      {/* Sub-view pills */}
      <div style={s.subTabs}>
        <SubTab label="Browse" active={view === 'browse'} onClick={() => setView('browse')} />
        <SubTab label="My listings" active={view === 'mine'} onClick={() => setView('mine')} />
        <button
          type="button"
          onClick={() => { if (ensureBaseGate()) setView('list-new'); }}
          style={s.listNewBtn}
        >
          + List a new NFT
        </button>
      </div>

      {/* Body */}
      {view === 'browse' && (
        <BrowseView
          listings={listings}
          total={listingsTotal}
          loading={browseLoading}
          error={browseError}
          page={page}
          setPage={setPage}
          rarityByTokenId={rarityByTokenId}
          rarityFilter={rarityFilter}
          setRarityFilter={setRarityFilter}
          onBuy={(listing) => setBuyTarget(listing)}
          ownAddress={evmAddress?.toLowerCase()}
        />
      )}
      {view === 'mine' && (
        <MyListingsView
          listings={mine}
          loading={mineLoading}
          error={mineError}
          rarityByTokenId={rarityByTokenId}
          baseReady={baseReady}
          chainLabel={chainLabel}
          busy={busy}
          onCancel={handleCancel}
        />
      )}
      {view === 'list-new' && (
        <ListNewView
          owned={ownedNfts}
          loading={ownedLoading}
          error={ownedError}
          pickTokenId={pickTokenId}
          setPickTokenId={setPickTokenId}
          payId={payId}
          setPayId={setPayId}
          priceInput={priceInput}
          setPriceInput={setPriceInput}
          expiryDays={expiryDays}
          setExpiryDays={setExpiryDays}
          baseReady={baseReady}
          chainLabel={chainLabel}
          paymentOptions={paymentOptions}
          busy={busy}
          onSubmit={handleList}
          onCancel={() => setView('browse')}
        />
      )}

      {/* Buy confirm overlay */}
      {buyTarget && (
        <BuyConfirmModal
          listing={buyTarget}
          rarity={rarityByTokenId[buyTarget.tokenId] || buyTarget.rarity || null}
          legacyLevel={buyTarget.level || 1}
          baseReady={baseReady}
          busy={busy === 'buy'}
          onCancel={() => { if (busy !== 'buy') setBuyTarget(null); }}
          onConfirm={handleBuy}
          onConnectBase={evmAddress ? onConnectBase : onOpenEvmModal}
          baseLabel={chainWalletLabel}
        />
      )}

      {notice && (
        <div style={notice.startsWith('✓') ? { ...s.notice, ...s.noticeOk } : s.notice}>
          {notice}
          {lastTxHash && notice.startsWith('✓') && (
            <a
              href={`${txExplorerBase}${lastTxHash}`}
              target="_blank" rel="noreferrer"
              style={s.noticeLink}
            >view tx ↗</a>
          )}
        </div>
      )}
    </div>
  );
}

function SubTab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...s.subTab, ...(active ? s.subTabActive : null) }}
    >{label}</button>
  );
}

function RarityFilter({ value, setValue, disabled }) {
  return (
    <div style={s.rarityFilterRow}>
      {RARITY_FILTER_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => setValue(option.value)}
            style={{
              ...s.rarityFilterChip,
              ...(active ? s.rarityFilterChipActive : null),
              ...(option.value !== 'all' && option.value !== 'unrevealed' ? nftRarityBadgeStyle(option.value, 1, { compact: true }) : null),
              ...(option.value === 'unrevealed' ? s.rarityFilterChipUnrevealed : null),
              ...(disabled ? s.rarityFilterChipDisabled : null),
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function BrowseView({ listings, total, loading, error, page, setPage, rarityByTokenId, rarityFilter, setRarityFilter, onBuy, ownAddress }) {
  const showPager = total > LISTINGS_PAGE_SIZE;
  const pages = Math.ceil(total / LISTINGS_PAGE_SIZE);
  const filteredListings = useMemo(
    () => rarityFilter === 'all'
      ? listings
      : listings.filter((listing) => listingRarityKey(listing, rarityByTokenId[listing.tokenId]) === rarityFilter),
    [listings, rarityByTokenId, rarityFilter],
  );
  return (
    <>
      <RarityFilter value={rarityFilter} setValue={setRarityFilter} disabled={loading} />
      <div style={s.gridMeta}>
        {loading ? 'Loading listings…' : error ? `Error: ${error}` : `${filteredListings.length} of ${total} listing${total === 1 ? '' : 's'}`}
      </div>
      {!loading && !error && listings.length === 0 && (
        <div style={s.emptyState}>
          <span style={{ fontSize: 28 }}>🛒</span>
          <span>No active listings right now.</span>
          <span style={s.emptyStateSub}>Be the first — list one of your Demon Kings.</span>
        </div>
      )}
      {!loading && !error && listings.length > 0 && filteredListings.length === 0 && (
        <div style={s.emptyState}>
          <span>No listings match this rarity.</span>
        </div>
      )}
      <div style={s.grid}>
        {filteredListings.map((l) => (
          <ListingCard
            key={l.tokenId}
            listing={l}
            rarity={rarityByTokenId[l.tokenId] || l.rarity || null}
            onBuy={() => onBuy(l)}
            isOwn={l.seller?.toLowerCase() === ownAddress}
          />
        ))}
      </div>
      {showPager && (
        <div style={s.pager}>
          <button type="button" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))} style={s.pagerBtn}>‹ Prev</button>
          <span style={s.pagerLabel}>Page {page + 1} of {pages}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} style={s.pagerBtn}>Next ›</button>
        </div>
      )}
    </>
  );
}

function ListingCard({ listing, rarity, onBuy, isOwn }) {
  const expiry = timeUntil(listing.expiresAt);
  return (
    <div style={{ ...s.card, ...nftRarityCardStyle(rarity, listing.level || 1) }}>
      <div style={s.cardImgWrap}>
        <img
          src={nftImageUrl(1, listing.tokenId)}
          alt={`Demon King #${listing.tokenId}`}
          style={s.cardImg}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div style={{ ...s.cardLevelBadge, ...nftRarityBadgeStyle(rarity, listing.level || 1) }}>{nftRarityLabel(rarity, listing.level || 1)}</div>
      </div>
      <div style={s.cardMeta}>
        <span style={s.cardTitle}>#{listing.tokenId}</span>
        <span style={s.cardPrice}>{formatPriceWei(listing.priceWei, listing.paymentToken)}</span>
      </div>
      <div style={s.cardSubMeta}>
        <span>Seller {shortAddr(listing.seller, 4, 3)}</span>
        {expiry && <span style={s.cardExpiry}>{expiry}</span>}
      </div>
      <button
        type="button"
        onClick={onBuy}
        disabled={isOwn}
        style={{ ...s.cardBuyBtn, ...(isOwn ? s.cardBuyBtnDisabled : null) }}
      >
        {isOwn ? 'Your listing' : 'Buy'}
      </button>
    </div>
  );
}

function MyListingsView({ listings, loading, error, rarityByTokenId, baseReady, chainLabel, busy, onCancel }) {
  if (!baseReady) {
    return (
      <div style={s.emptyState}>
        <span>Connect your {chainLabel} wallet to see your listings.</span>
      </div>
    );
  }
  if (loading) return <div style={s.gridMeta}>Loading your listings…</div>;
  if (error)   return <div style={s.notice}>Error: {error}</div>;
  if (!listings.length) {
    return (
      <div style={s.emptyState}>
        <span style={{ fontSize: 28 }}>📭</span>
        <span>You don't have any active listings yet.</span>
      </div>
    );
  }
  return (
    <div style={s.grid}>
      {listings.map((l) => {
        const rarity = rarityByTokenId[l.tokenId] || l.rarity || null;
        return (
          <div key={l.tokenId} style={{ ...s.card, ...nftRarityCardStyle(rarity, l.level || 1) }}>
            <div style={s.cardImgWrap}>
              <img
                src={nftImageUrl(1, l.tokenId)} alt={`#${l.tokenId}`}
                style={s.cardImg}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div style={{ ...s.cardLevelBadge, ...nftRarityBadgeStyle(rarity, l.level || 1) }}>{nftRarityLabel(rarity, l.level || 1)}</div>
            </div>
            <div style={s.cardMeta}>
              <span style={s.cardTitle}>#{l.tokenId}</span>
              <span style={s.cardPrice}>{formatPriceWei(l.priceWei, l.paymentToken)}</span>
            </div>
            <div style={s.cardSubMeta}>
              {timeUntil(l.expiresAt) && <span style={s.cardExpiry}>{timeUntil(l.expiresAt)}</span>}
            </div>
            <button
              type="button"
              onClick={() => onCancel(l.tokenId)}
              disabled={!!busy}
              style={{ ...s.cardBuyBtn, ...s.cardCancelBtn, ...(busy ? s.cardBuyBtnDisabled : null) }}
            >
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel listing'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ListNewView({
  owned, loading, error,
  pickTokenId, setPickTokenId,
  payId, setPayId,
  priceInput, setPriceInput,
  expiryDays, setExpiryDays,
  baseReady, chainLabel, paymentOptions, busy, onSubmit, onCancel,
}) {
  const scrollRef = useRef(null);
  const scroll = (dir) => scrollRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });

  if (!baseReady) {
    return (
      <div style={s.emptyState}>
        <span>Connect your {chainLabel} wallet to list an NFT.</span>
      </div>
    );
  }

  return (
    <div style={s.form}>
      <div style={s.formRow}>
        <span style={s.formLabel}>1. Pick an NFT</span>
        {loading ? <div style={s.gridMeta}>Loading your NFTs…</div>
          : error ? <div style={s.notice}>Error: {error}</div>
          : owned.length === 0 ? <div style={s.emptyStateInline}>You don't own any Demon King NFTs on {chainLabel}.</div>
          : (
            <div style={s.nftCarouselRow}>
              {owned.length > 4 && <button type="button" onClick={() => scroll(-1)} style={s.scrollBtn}>‹</button>}
              <div ref={scrollRef} className="shop-scroll" style={s.nftScroll}>
                {owned.map((t) => {
                  const id = String(t.tokenId);
                  const active = pickTokenId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPickTokenId(id)}
                      style={{
                        ...s.miniCard,
                        ...(active ? s.miniCardActive : null),
                        ...nftRarityCardStyle(t.rarity, t.level || 1, { active }),
                      }}
                      title={id}
                    >
                      {t.imageUrl && (
                        <img src={t.imageUrl} alt={`#${id}`} style={s.miniImg}
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                      )}
                      <div style={s.miniMeta}>
                        <span style={s.miniId}>#{id}</span>
                        <span style={{ ...s.miniLevel, ...nftRarityBadgeStyle(t.rarity, t.level || 1, { compact: true }) }}>{nftRarityLabel(t.rarity, t.level || 1)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {owned.length > 4 && <button type="button" onClick={() => scroll(1)} style={s.scrollBtn}>›</button>}
            </div>
          )
        }
      </div>

      <div style={s.formRow}>
        <span style={s.formLabel}>2. Payment token</span>
        <div style={s.payPicker}>
          {paymentOptions.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPayId(p.id)}
              style={{ ...s.payChip, ...(payId === p.id ? s.payChipActive : null) }}
            >
              <span style={s.payChipLabel}>{p.label}</span>
              <span style={s.payChipSub}>{p.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={s.formRow}>
        <span style={s.formLabel}>3. Price</span>
        <input
          type="text"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          placeholder={`e.g. 50 ${paymentOptions.find((p) => p.id === payId)?.label || 'USDC'}`}
          style={s.input}
        />
      </div>

      <div style={s.formRow}>
        <span style={s.formLabel}>4. Expiry</span>
        <div style={s.payPicker}>
          {[0, 1, 3, 7, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setExpiryDays(d)}
              style={{ ...s.payChip, ...(expiryDays === d ? s.payChipActive : null) }}
            >
              <span style={s.payChipLabel}>{d === 0 ? 'No expiry' : `${d}d`}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={s.formActions}>
        <button type="button" onClick={onCancel} disabled={!!busy} style={s.formCancelBtn}>Cancel</button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!!busy || !pickTokenId || !priceInput}
          style={{ ...s.formSubmitBtn, ...(busy ? s.formSubmitBtnBusy : null) }}
        >
          {busy === 'list' ? 'Listing…' : 'Sign list tx →'}
        </button>
      </div>
    </div>
  );
}

function BuyConfirmModal({ listing, rarity, legacyLevel = 1, baseReady, busy, onCancel, onConfirm, onConnectBase, baseLabel }) {
  const meta = paymentTokenMeta(listing.paymentToken);
  const tokenAddr = listing.paymentToken;
  return (
    <div style={s.modalOverlay} onClick={busy ? undefined : onCancel}>
      <div style={s.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Buy Demon King #{listing.tokenId}</span>
          <button type="button" onClick={busy ? undefined : onCancel} style={s.modalCloseBtn}>×</button>
        </div>
        <div style={s.modalBody}>
          <div style={{ ...s.modalImgWrap, ...nftRarityCardStyle(rarity, legacyLevel) }}>
            <img
              src={nftImageUrl(1, listing.tokenId)} alt=""
              style={s.modalImg}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div style={{ ...s.cardLevelBadge, ...nftRarityBadgeStyle(rarity, legacyLevel) }}>{nftRarityLabel(rarity, legacyLevel)}</div>
          </div>
          <div style={s.modalBreakdown}>
            <span>Price</span><span style={{ fontWeight: 600 }}>{formatPriceWei(listing.priceWei, tokenAddr)}</span>
            <span>Payment</span><span style={{ fontWeight: 600 }}>{meta.symbol} {isEthPayment(tokenAddr) ? '(native)' : '(ERC-20)'}</span>
            <span>Seller</span><span>{shortAddr(listing.seller, 6, 4)}</span>
          </div>
          {!baseReady ? (
            <button type="button" onClick={onConnectBase} style={s.modalConfirmBtn}>{baseLabel}</button>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              style={{ ...s.modalConfirmBtn, ...(busy ? s.formSubmitBtnBusy : null) }}
            >
              {busy ? 'Confirming…' : `Confirm purchase`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────── Styles ─────────────────────────────────────────────
//
// Same parchment palette as NftMintPanel so the marketplace doesn't feel
// like a different app. Brown borders, cream backgrounds, gold accents.
const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 10 },

  connectBanner: {
    display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
    padding: '10px 12px', borderRadius: 12,
    background: 'linear-gradient(135deg, var(--terminal-brand-soft) 0%, var(--terminal-brand-border) 60%, var(--terminal-orange) 100%)',
    border: '1px solid var(--terminal-brand-strong)',
    boxShadow: '0 6px 14px rgba(194,133,27,0.28), inset 0 1px 0 var(--terminal-chip-overlay)',
  },
  connectBannerText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  connectBannerTitle: { fontSize: 13, fontWeight: 700, color: 'var(--terminal-text)', letterSpacing: 0.2 },
  connectBannerSub: { fontSize: 11, fontWeight: 600, color: 'var(--terminal-text)' },
  connectBannerBtn: uiButton('primary', { flexShrink: 0, minHeight: 38, padding: '8px 14px', whiteSpace: 'nowrap' }),

  subTabs: { display: 'flex', gap: 6, alignItems: 'center' },
  subTab: uiButton('secondary', { flex: 1, minHeight: 36, padding: '8px 10px', fontSize: 12, textTransform: 'uppercase' }),
  subTabActive: { background: 'var(--terminal-brand-soft)', border: '1px solid var(--terminal-orange)', color: 'var(--terminal-brand-text)', boxShadow: 'none' },
  listNewBtn: uiButton('primary', { minHeight: 36, padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }),

  rarityFilterRow: {
    display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
    padding: 6, borderRadius: 12, background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)',
  },
  rarityFilterChip: uiButton('secondary', { minHeight: 30, padding: '5px 10px', fontSize: 11 }),
  rarityFilterChipActive: { background: 'var(--terminal-brand-border)', border: '1px solid var(--terminal-text-muted)' },
  rarityFilterChipUnrevealed: { background: 'var(--terminal-surface-subtle)', color: 'var(--terminal-text-secondary)', border: '1px solid var(--terminal-border-strong)' },
  rarityFilterChipDisabled: { opacity: 0.55, cursor: 'not-allowed' },

  gridMeta: { fontSize: 12, fontWeight: 700, color: 'var(--terminal-text-secondary)', letterSpacing: 0.2 },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '24px 12px', borderRadius: 12,
    background: 'var(--terminal-surface)', border: '1px dashed var(--terminal-border)', color: 'var(--terminal-text)',
    fontSize: 13, fontWeight: 700, textAlign: 'center',
  },
  emptyStateSub: { fontSize: 11, color: 'var(--terminal-text-muted)', fontWeight: 600, fontStyle: 'italic' },
  emptyStateInline: { fontSize: 12, color: 'var(--terminal-text-secondary)', fontStyle: 'italic' },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 10,
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: 8, borderRadius: 12,
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)',
    boxShadow: '0 2px 6px rgba(95,58,33,0.08)',
  },
  cardImgWrap: {
    position: 'relative',
    width: '100%', aspectRatio: '1 / 1',
    borderRadius: 10, overflow: 'hidden',
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cardImg: { width: '100%', height: '100%', objectFit: 'cover' },
  cardLevelBadge: {
    position: 'absolute', top: 4, right: 4,
    padding: '2px 6px', borderRadius: 6,
    background: 'rgba(92,58,33,0.92)', color: 'var(--terminal-surface)',
    fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
  },
  cardMeta: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 13, fontWeight: 700, color: 'var(--terminal-text)',
  },
  cardTitle: { fontFamily: 'monospace' },
  cardPrice: { color: 'var(--terminal-long-strong)', fontSize: 12 },
  cardSubMeta: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 10, color: 'var(--terminal-text-secondary)', fontWeight: 700,
  },
  cardExpiry: { color: 'var(--terminal-text-muted)', fontStyle: 'italic' },
  cardBuyBtn: uiButton('primary', { width: '100%', minHeight: 34, padding: '7px 10px', fontSize: 12, marginTop: 2 }),
  cardBuyBtnDisabled: { opacity: 0.5, cursor: 'not-allowed', background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-text-muted)', color: 'var(--terminal-text)' },
  cardCancelBtn: uiButton('danger', { width: '100%', minHeight: 34, padding: '7px 10px', fontSize: 12, marginTop: 2 }),

  pager: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
    marginTop: 4, paddingTop: 4,
  },
  pagerBtn: uiButton('secondary', { minHeight: 34, padding: '6px 12px', fontSize: 12 }),
  pagerLabel: { fontSize: 12, fontWeight: 600, color: 'var(--terminal-text)' },

  // ── List-new form ─────────────────────────────────────────────────
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  formRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  formLabel: { fontSize: 12, fontWeight: 600, color: 'var(--terminal-text)', letterSpacing: 0.2, textTransform: 'uppercase' },
  input: {
    padding: '8px 10px', borderRadius: 8, border: '1px solid var(--terminal-border)',
    background: 'var(--terminal-surface)', color: 'var(--terminal-text)', fontSize: 13, fontFamily: 'monospace', outline: 'none',
  },
  payPicker: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  payChip: {
    flex: 1, minWidth: 80,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    padding: '6px 10px', borderRadius: 10, cursor: 'pointer',
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)',
  },
  payChipActive: { background: 'var(--terminal-brand-soft)', border: '1px solid var(--terminal-orange)', color: 'var(--terminal-brand-text)', boxShadow: 'none' },
  payChipLabel: { fontSize: 13, fontWeight: 700 },
  payChipSub: { fontSize: 10, fontWeight: 700, color: 'var(--terminal-text-secondary)' },
  previewBox: {
    display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 4,
    padding: '8px 10px', borderRadius: 8,
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)',
    fontSize: 12, color: 'var(--terminal-text)',
  },
  formActions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  formCancelBtn: uiButton('secondary', { minHeight: 38, padding: '8px 14px', fontSize: 13 }),
  formSubmitBtn: uiButton('primary', { minHeight: 40, padding: '10px 16px', fontSize: 14 }),
  formSubmitBtnBusy: { opacity: 0.6, cursor: 'not-allowed' },

  // Mini owned-NFT carousel — mirrors the one in NftBridgePanel.
  nftCarouselRow: { display: 'flex', alignItems: 'center', gap: 6 },
  nftScroll: {
    display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden',
    padding: 6, flex: 1, minWidth: 0,
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 10,
    scrollSnapType: 'x mandatory',
  },
  scrollBtn: uiIconButton('secondary', 32, { height: 56, fontSize: 14 }),
  miniCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: 4, gap: 4, borderRadius: 8, border: '1px solid transparent',
    background: 'var(--terminal-surface)', cursor: 'pointer', flexShrink: 0, width: 96,
    scrollSnapAlign: 'start',
  },
  miniCardActive: { border: '1px solid var(--terminal-text-muted)', background: 'var(--terminal-brand-border)', boxShadow: '0 1px 2px rgba(0,0,0,0.18)' },
  miniImg: { width: 72, height: 72, objectFit: 'cover', borderRadius: 6, background: 'var(--terminal-surface-subtle)' },
  miniMeta: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', fontSize: 11, fontWeight: 700, color: 'var(--terminal-text)',
  },
  miniId: { fontFamily: 'monospace', flex: 1, textAlign: 'left' },
  miniLevel: { color: 'var(--terminal-text-secondary)' },

  // ── Buy confirm modal ─────────────────────────────────────────────
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    padding: 10, overflowY: 'auto', boxSizing: 'border-box', WebkitOverflowScrolling: 'touch',
  },
  modalPanel: {
    width: 360, maxWidth: 'calc(100vw - 20px)', maxHeight: 'calc(100dvh - 20px)', borderRadius: 14, overflowY: 'auto',
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)',
    boxShadow: '0 18px 50px rgba(0,0,0,0.45)', boxSizing: 'border-box', WebkitOverflowScrolling: 'touch',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', background: 'var(--terminal-border)', borderBottom: '1px solid var(--terminal-border-strong)',
  },
  modalTitle: { fontSize: 15, fontWeight: 700, color: 'var(--terminal-text)' },
  modalCloseBtn: uiIconButton('danger', 28, { lineHeight: 1 }),
  modalBody: { padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  modalImgWrap: {
    position: 'relative',
    width: 'min(100%, 310px)', aspectRatio: '1 / 1', maxHeight: '42dvh', alignSelf: 'center',
    borderRadius: 12, overflow: 'hidden',
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)',
  },
  modalImg: { width: '100%', height: '100%', objectFit: 'cover' },
  modalBreakdown: {
    display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 4,
    padding: '8px 10px', borderRadius: 8,
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)',
    fontSize: 12, color: 'var(--terminal-text)',
  },
  modalConfirmBtn: {
    ...uiButton('primary', { width: '100%', minHeight: 44, padding: 12, fontSize: 14 }),
  },

  notice: {
    padding: '8px 10px', borderRadius: 8,
    background: 'var(--terminal-warning-soft)', color: 'var(--terminal-warning)', fontSize: 12,
    border: '1px solid var(--terminal-warning-border)',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  noticeOk: { background: 'var(--terminal-long-soft)', color: 'var(--terminal-long-strong)', border: '1px solid var(--terminal-long-border)' },
  noticeLink: { color: 'inherit', fontWeight: 600, textDecoration: 'underline' },
};
