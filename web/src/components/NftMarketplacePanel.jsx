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
  fetchTokenLevels,
  formatPriceWei,
  isEthPayment,
  listNftOnMarketplace,
  marketplaceChainLabel,
  marketplacePaymentOptions,
  normalizeMarketplaceChain,
  nftImageUrl,
  parsePriceToWei,
  paymentAddressFromId,
  paymentTokenMeta,
} from '../lib/marketplace';
import { addClientBreadcrumb } from '../lib/clientLogger';
import { syncDemonKingNfts } from '../lib/nftV3Client';

const LISTINGS_PAGE_SIZE = 50;

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
  const [levelByTokenId, setLevelByTokenId] = useState({});

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
      const rows = Array.isArray(json?.listings) ? json.listings : [];
      setListings(rows);
      setListingsTotal(Number(json?.total) || rows.length);
      // Enrich with current levels for proper image URLs.
      const tokenIds = rows.map((r) => r.tokenId).filter(Boolean);
      if (tokenIds.length) {
        try {
          const lv = await fetchTokenLevels(tokenIds, chainKey);
          setLevelByTokenId((prev) => ({ ...prev, ...lv }));
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
          const lv = await fetchTokenLevels(tokenIds, chainKey);
          setLevelByTokenId((prev) => ({ ...prev, ...lv }));
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
      const ownedJson = await syncDemonKingNfts({ wallet: evmAddress, chains: [chainKey] });
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
          levelByTokenId={levelByTokenId}
          onBuy={(listing) => setBuyTarget(listing)}
          ownAddress={evmAddress?.toLowerCase()}
        />
      )}
      {view === 'mine' && (
        <MyListingsView
          listings={mine}
          loading={mineLoading}
          error={mineError}
          levelByTokenId={levelByTokenId}
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
          level={levelByTokenId[buyTarget.tokenId] || 1}
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

function BrowseView({ listings, total, loading, error, page, setPage, levelByTokenId, onBuy, ownAddress }) {
  const showPager = total > LISTINGS_PAGE_SIZE;
  const pages = Math.ceil(total / LISTINGS_PAGE_SIZE);
  return (
    <>
      <div style={s.gridMeta}>
        {loading ? 'Loading listings…' : error ? `Error: ${error}` : `${total} active listing${total === 1 ? '' : 's'}`}
      </div>
      {!loading && !error && listings.length === 0 && (
        <div style={s.emptyState}>
          <span style={{ fontSize: 28 }}>🛒</span>
          <span>No active listings right now.</span>
          <span style={s.emptyStateSub}>Be the first — list one of your Demon Kings.</span>
        </div>
      )}
      <div style={s.grid}>
        {listings.map((l) => (
          <ListingCard
            key={l.tokenId}
            listing={l}
            level={levelByTokenId[l.tokenId] || 1}
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

function ListingCard({ listing, level, onBuy, isOwn }) {
  const expiry = timeUntil(listing.expiresAt);
  return (
    <div style={s.card}>
      <div style={s.cardImgWrap}>
        <img
          src={nftImageUrl(level, listing.tokenId)}
          alt={`Demon King #${listing.tokenId}`}
          style={s.cardImg}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div style={s.cardLevelBadge}>L{level} {'★'.repeat(level)}</div>
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

function MyListingsView({ listings, loading, error, levelByTokenId, baseReady, chainLabel, busy, onCancel }) {
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
        const level = levelByTokenId[l.tokenId] || 1;
        return (
          <div key={l.tokenId} style={s.card}>
            <div style={s.cardImgWrap}>
              <img
                src={nftImageUrl(level, l.tokenId)} alt={`#${l.tokenId}`}
                style={s.cardImg}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div style={s.cardLevelBadge}>L{level} {'★'.repeat(level)}</div>
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
                      style={{ ...s.miniCard, ...(active ? s.miniCardActive : null) }}
                      title={id}
                    >
                      {t.imageUrl && (
                        <img src={t.imageUrl} alt={`#${id}`} style={s.miniImg}
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                      )}
                      <div style={s.miniMeta}>
                        <span style={s.miniId}>#{id}</span>
                        <span style={s.miniLevel}>L{t.level || 1}</span>
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

function BuyConfirmModal({ listing, level, baseReady, busy, onCancel, onConfirm, onConnectBase, baseLabel }) {
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
          <div style={s.modalImgWrap}>
            <img
              src={nftImageUrl(level, listing.tokenId)} alt=""
              style={s.modalImg}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div style={s.cardLevelBadge}>L{level} {'★'.repeat(level)}</div>
          </div>
          <div style={s.modalBreakdown}>
            <span>Price</span><span style={{ fontWeight: 800 }}>{formatPriceWei(listing.priceWei, tokenAddr)}</span>
            <span>Payment</span><span style={{ fontWeight: 800 }}>{meta.symbol} {isEthPayment(tokenAddr) ? '(native)' : '(ERC-20)'}</span>
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
    background: 'linear-gradient(135deg, #fff2c2 0%, #ffd76a 60%, #f0a335 100%)',
    border: '3px solid #c2851b',
    boxShadow: '0 6px 14px rgba(194,133,27,0.28), inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  connectBannerText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  connectBannerTitle: { fontSize: 13, fontWeight: 900, color: '#3a1f00', letterSpacing: 0.2 },
  connectBannerSub: { fontSize: 11, fontWeight: 800, color: '#5C3A21' },
  connectBannerBtn: {
    flexShrink: 0,
    padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 900,
    background: '#5C3A21', color: '#fff7df', border: '2px solid #3a1f00',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },

  subTabs: { display: 'flex', gap: 6, alignItems: 'center' },
  subTab: {
    flex: 1,
    padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 800,
    background: '#fff6dc', border: '2px solid #d4c8b0', color: '#5C3A21',
    cursor: 'pointer', letterSpacing: 0.3, textTransform: 'uppercase',
  },
  subTabActive: { background: '#ffd97a', border: '2px solid #9f8759', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' },
  listNewBtn: {
    padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 900,
    background: '#7ce04a', border: '2px solid #4a8f2c', color: '#1a3d0a',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },

  gridMeta: { fontSize: 12, fontWeight: 700, color: '#7a5a30', letterSpacing: 0.2 },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '24px 12px', borderRadius: 12,
    background: '#fffaf0', border: '2px dashed #d4c8b0', color: '#5C3A21',
    fontSize: 13, fontWeight: 700, textAlign: 'center',
  },
  emptyStateSub: { fontSize: 11, color: '#9f8759', fontWeight: 600, fontStyle: 'italic' },
  emptyStateInline: { fontSize: 12, color: '#7a5a30', fontStyle: 'italic' },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 10,
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: 8, borderRadius: 12,
    background: '#fff6dc', border: '2px solid #d4c8b0',
    boxShadow: '0 2px 6px rgba(95,58,33,0.08)',
  },
  cardImgWrap: {
    position: 'relative',
    width: '100%', aspectRatio: '1 / 1',
    borderRadius: 10, overflow: 'hidden',
    background: '#fff', border: '2px solid #d4c8b0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cardImg: { width: '100%', height: '100%', objectFit: 'cover' },
  cardLevelBadge: {
    position: 'absolute', top: 4, right: 4,
    padding: '2px 6px', borderRadius: 6,
    background: 'rgba(92,58,33,0.92)', color: '#fff7df',
    fontSize: 10, fontWeight: 900, letterSpacing: 0.2,
  },
  cardMeta: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 13, fontWeight: 900, color: '#5C3A21',
  },
  cardTitle: { fontFamily: 'monospace' },
  cardPrice: { color: '#2e7d32', fontSize: 12 },
  cardSubMeta: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 10, color: '#7a5a30', fontWeight: 700,
  },
  cardExpiry: { color: '#9f8759', fontStyle: 'italic' },
  cardBuyBtn: {
    padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 900,
    background: '#7ce04a', border: '2px solid #4a8f2c', color: '#1a3d0a',
    cursor: 'pointer', marginTop: 2,
  },
  cardBuyBtnDisabled: { opacity: 0.5, cursor: 'not-allowed', background: '#e8dfc8', border: '2px solid #9f8759', color: '#5C3A21' },
  cardCancelBtn: { background: '#ffb347', border: '2px solid #a86b1a', color: '#3a1f00' },

  pager: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
    marginTop: 4, paddingTop: 4,
  },
  pagerBtn: {
    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer',
  },
  pagerLabel: { fontSize: 12, fontWeight: 800, color: '#5C3A21' },

  // ── List-new form ─────────────────────────────────────────────────
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  formRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  formLabel: { fontSize: 12, fontWeight: 800, color: '#5C3A21', letterSpacing: 0.2, textTransform: 'uppercase' },
  input: {
    padding: '8px 10px', borderRadius: 8, border: '2px solid #d4c8b0',
    background: '#fff', color: '#3a2810', fontSize: 13, fontFamily: 'monospace', outline: 'none',
  },
  payPicker: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  payChip: {
    flex: 1, minWidth: 80,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    padding: '6px 10px', borderRadius: 10, cursor: 'pointer',
    background: '#fff6dc', border: '2px solid #d4c8b0', color: '#5C3A21',
  },
  payChipActive: { background: '#ffd97a', border: '2px solid #9f8759', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' },
  payChipLabel: { fontSize: 13, fontWeight: 900 },
  payChipSub: { fontSize: 10, fontWeight: 700, color: '#7a5a30' },
  previewBox: {
    display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 4,
    padding: '8px 10px', borderRadius: 8,
    background: '#fff8e6', border: '1px solid #d4c8b0',
    fontSize: 12, color: '#5C3A21',
  },
  formActions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  formCancelBtn: {
    padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21', cursor: 'pointer',
  },
  formSubmitBtn: {
    padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 900,
    background: '#7ce04a', border: '2px solid #4a8f2c', color: '#1a3d0a', cursor: 'pointer',
  },
  formSubmitBtnBusy: { opacity: 0.6, cursor: 'not-allowed' },

  // Mini owned-NFT carousel — mirrors the one in NftBridgePanel.
  nftCarouselRow: { display: 'flex', alignItems: 'center', gap: 6 },
  nftScroll: {
    display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden',
    padding: 6, flex: 1, minWidth: 0,
    background: '#fff8e6', border: '2px solid #d4c8b0', borderRadius: 10,
    scrollSnapType: 'x mandatory',
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fff8e6',
  },
  scrollBtn: {
    width: 26, height: 56, borderRadius: 8, padding: 0,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer', flexShrink: 0, fontWeight: 900, fontSize: 14,
  },
  miniCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: 4, gap: 4, borderRadius: 8, border: '2px solid transparent',
    background: '#fff', cursor: 'pointer', flexShrink: 0, width: 96,
    scrollSnapAlign: 'start',
  },
  miniCardActive: { border: '2px solid #9f8759', background: '#ffd97a', boxShadow: '0 1px 2px rgba(0,0,0,0.18)' },
  miniImg: { width: 72, height: 72, objectFit: 'cover', borderRadius: 6, background: '#e8dfc8' },
  miniMeta: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', fontSize: 11, fontWeight: 700, color: '#5C3A21',
  },
  miniId: { fontFamily: 'monospace', flex: 1, textAlign: 'left' },
  miniLevel: { color: '#7a5a30' },

  // ── Buy confirm modal ─────────────────────────────────────────────
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  modalPanel: {
    width: 360, maxWidth: '94vw', borderRadius: 14, overflow: 'hidden',
    background: '#fdf8e7', border: '4px solid #d4c8b0',
    boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', background: '#d4c8b0', borderBottom: '3px solid #bba882',
  },
  modalTitle: { fontSize: 15, fontWeight: 900, color: '#5C3A21' },
  modalCloseBtn: {
    width: 24, height: 24, borderRadius: '50%',
    background: '#E53935', border: '2px solid #fff', color: '#fff',
    cursor: 'pointer', fontWeight: 900, padding: 0, lineHeight: '20px',
  },
  modalBody: { padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  modalImgWrap: {
    position: 'relative',
    width: '100%', aspectRatio: '1 / 1',
    borderRadius: 12, overflow: 'hidden',
    background: '#fff', border: '2px solid #d4c8b0',
  },
  modalImg: { width: '100%', height: '100%', objectFit: 'cover' },
  modalBreakdown: {
    display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 4,
    padding: '8px 10px', borderRadius: 8,
    background: '#fff8e6', border: '1px solid #d4c8b0',
    fontSize: 12, color: '#5C3A21',
  },
  modalConfirmBtn: {
    width: '100%', padding: 12, borderRadius: 12, fontSize: 14, fontWeight: 900,
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    border: '3px solid #1f6d34', color: '#fff', cursor: 'pointer',
    textShadow: '0 1px 1px rgba(0,0,0,0.35)',
  },

  notice: {
    padding: '8px 10px', borderRadius: 8,
    background: '#fff0e0', color: '#7a4a1a', fontSize: 12,
    border: '1px solid #f0c4a0',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  noticeOk: { background: '#e8f5e0', color: '#2e6b1a', border: '1px solid #b0d4a0' },
  noticeLink: { color: 'inherit', fontWeight: 800, textDecoration: 'underline' },
};
