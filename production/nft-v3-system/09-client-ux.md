# 09 — Client UX

> ⚠ **Phase 1 vs Phase B scope.** In Phase 1, the upgrade UI shows level
> + price + "Upgrade" button only. **No win progress bars, no eligibility
> tooltips, no wins counter** — those land in Phase B. Wherever this
> document mentions wins display or eligibility-based disabling of the
> upgrade button, treat as Phase B copy/visuals.
>
> Tier labels are **numeric** (Level 1 / Level 2 / Level 3 + 1★/2★/3★).
> Bronze/Silver/Gold names below are legacy notation — replace with
> numeric/star versions in implementation.

## 1. Overview

UI surfaces for the V3 system. Adds three new panels and extends one
existing panel:

1. **NftMintPanel** (existing, extended) — shows level of each owned NFT.
2. **NftUpgradePanel** (new) — initiates L1→L2 and L2→L3 upgrades.
3. **NftBridgePanel** (new) — burns on source chain, mints on Base.
4. **NftMarketplacePanel** (new) — list, buy, cancel on Base.

All panels live under `web/src/components/` and follow the existing
patterns established by `NftMintPanel.jsx` (multi-chain support, wallet
adapter abstraction, server-quote → tx → confirmation state machine).

---

## 2. Player Fantasy

The flow feels native to the rest of the game UI. No external sites, no
"open in MetaMask" dance for things the game can handle inline. State is
optimistic (we show "upgrading" the moment payment confirms, even before
the on-chain level flips). Errors are explicit and recoverable.

---

## 3. Detailed Rules

### 3.1 NftMintPanel — extensions

Add a **Level badge** to each NFT card:

```
┌─────────────────────────────┐
│  [Demon King #42]           │
│  ┌──────┐                   │
│  │ Img  │  Level: Silver    │
│  └──────┘  Wins: 1,247      │
│  [Upgrade →]  [Bridge]      │
└─────────────────────────────┘
```

Existing mint flow unchanged. New buttons:

- **Upgrade** — opens `NftUpgradePanel` for that NFT. Disabled if already
  L3 OR if win count below threshold (tooltip explains).
- **Bridge** — opens `NftBridgePanel`. Disabled on Base (no bridge from
  Base).

### 3.2 NftUpgradePanel

States:

```
IDLE         — user just opened the panel
QUOTING      — POST /api/nft/upgrade/quote in flight
QUOTED       — show "Pay $8.9 USDC" / "Pay 5 CoP" buttons
PAYING       — wallet tx in flight
WAITING      — tx submitted, waiting for confirmation (EVM/Aptos) or attribute write (Solana)
UPGRADED     — show success animation, new art, "Close" button
FAILED       — show error, "Retry" and "Cancel" buttons
```

Wireframe:

```
┌────────────────────────────────────────┐
│  Upgrade Demon King #42                │
│  Bronze → Silver                       │
│                                        │
│  Current wins: 1,247                   │
│  Required: 1,000  ✓                    │
│                                        │
│  Price: $8.9 USDC  or  5 CoP           │
│                                        │
│  [ Pay with USDC ]   [ Pay with CoP ]  │
│                                        │
│  [Cancel]                              │
└────────────────────────────────────────┘
```

After payment confirms:

```
┌────────────────────────────────────────┐
│  ✓ Upgraded!                           │
│                                        │
│   [animation: bronze morphs into silver] │
│                                        │
│  Your Demon King is now Silver rank.   │
│                                        │
│  [Close]                               │
└────────────────────────────────────────┘
```

### 3.3 NftBridgePanel

States:

```
IDLE              — panel just opened
CONFIRMING       — user must confirm target Base address (defaults to their connected Base wallet)
BURNING          — burn tx in flight on source chain
INDEXING         — waiting for server to detect & sign receipt
READY_TO_CLAIM   — receipt ready, "Claim on Base" button enabled
CLAIMING         — claim tx in flight on Base
COMPLETE         — show "View on OpenSea Base" link
FAILED           — error, "Retry" or "Contact Support"
```

The CONFIRMING step is intentional **friction** — bridging is irreversible
and bound to a target address. We require the user to type the last 4
characters of their target Base address as confirmation, or check a "Yes,
I understand" box. UI shows BOTH the source chain (where the NFT is now)
and target chain (Base) prominently.

Wireframe:

```
┌────────────────────────────────────────┐
│  Bridge Demon King #5 (Arbitrum)       │
│  ┌──┐ Arbitrum     ──→   Base    ┌──┐  │
│  └──┘                            └──┘  │
│                                        │
│  Target Base address:                  │
│  0xC024…3094  ✓ (your connected wallet) │
│                                        │
│  Level preserved: Silver               │
│  Battle wins migrated: 1,247           │
│                                        │
│  ⚠ This burns the NFT on Arbitrum.     │
│     There is no way back.              │
│                                        │
│  [ I understand → Burn on Arbitrum ]   │
│  [ Cancel ]                            │
└────────────────────────────────────────┘
```

Real-time progress visible:

```
✓ Burn confirmed on Arbitrum (1/3)
⟳ Server signing receipt (2/3)…
○ Mint on Base (3/3)
```

### 3.4 NftMarketplacePanel

Two views: **Browse** and **My Listings**.

Browse view:

```
┌────────────────────────────────────────┐
│  Marketplace — Demon King NFTs         │
│  Filter: [Level ▾] [Sort: Price ↑ ▾]    │
│                                        │
│  ┌──────┐  ┌──────┐  ┌──────┐         │
│  │ #42  │  │ #51  │  │ #87  │         │
│  │ Gold │  │ Silver│  │Bronze│         │
│  │$420  │  │$180  │  │$45   │         │
│  │ Buy  │  │ Buy  │  │ Buy  │         │
│  └──────┘  └──────┘  └──────┘         │
└────────────────────────────────────────┘
```

My Listings view:

```
┌────────────────────────────────────────┐
│  Your Listings                         │
│                                        │
│  ┌──────┐ Demon King #42 (Gold)        │
│  │ Img  │ Listed for $420 USDC         │
│  │      │ Expires: 3d 12h              │
│  │      │ [Edit Price] [Cancel]        │
│  └──────┘                              │
│                                        │
│  [+ List a new NFT]                    │
└────────────────────────────────────────┘
```

List-new-NFT flow:

```
1. Choose NFT (dropdown of owned Base NFTs)
2. Choose payment token (ETH / USDC / CoP)
3. Set price
4. (Optional) Set expiry date
5. Confirm approval tx (if marketplace doesn't have approval yet)
6. Confirm list tx
7. Listing appears in "Your Listings"
```

Buy flow:

```
1. Click "Buy" on a card
2. Confirmation modal:
   - NFT preview (large)
   - Price breakdown:
     - $420.00 total
     - $10.50 royalty (2.5% to creators)
     - $409.50 to seller
   - Connected wallet preview
3. Confirm buy tx
4. NFT appears in wallet within 30s
```

### 3.5 Data fetching

All panels use a shared hook `useNftLevel(chain, tokenId)` and
`useNftWins(chain, tokenId)`:

```javascript
function useNftLevel(chain, tokenId) {
  // Reads level + caches 60 s, invalidates on TokenLevelUpgraded event subscribe
}

function useNftWins(chain, tokenId) {
  // Polls /api/nft/wins/:chain/:tokenId every 10 s while panel open
}
```

Polling stops when the panel closes. The marketplace browse uses a single
batched endpoint `GET /api/marketplace/listings` instead of per-token
polling.

### 3.6 Error UX

Every error message includes:
- **What happened** (in plain language).
- **What the player can do** (retry, contact support, etc.).
- **Reference ID** for support (the bridge job ID or upgrade nonce).

Examples:

```
✗ Upgrade failed.
The on-chain transaction reverted: "Nonce already used".
This usually means the upgrade was already applied successfully.
Refresh the page to see your new level.
[ Refresh ]   Reference: nonce-3f2a91b8
```

```
✗ Bridge stuck.
We detected your burn on Arbitrum but the bridge signer is unreachable.
Your NFT will mint on Base once the signer comes back online (usually < 5 min).
[ Check Status ]   Job ID: bridge-7c81df-arb-42
```

---

## 4. Formulas

(No client-side math beyond display formatting; all gating happens
server-side.)

### Price display

```
display_price = price_wei / 10^decimals
formatted = `${display_price.toFixed(2)} ${symbol}`
```

### Royalty preview

```
royalty_preview = sale_price * 0.025
seller_receives = sale_price - royalty_preview
```

---

## 5. Edge Cases

| Case | UI handling |
|------|-------------|
| User disconnects wallet mid-upgrade | Show "Wallet disconnected. Reconnect to resume." Resume state from URL params if possible. |
| User clicks Upgrade twice quickly | Button disabled while in non-IDLE state. |
| Browser refresh during BURNING | URL contains `?bridgeJobId=…` so the panel re-opens at INDEXING state. |
| Browser refresh during PAYING | Wallet adapter typically restores pending txs; we restore from sessionStorage. |
| Upgrade tx pending for > 5 min | Show "Taking longer than expected" with link to chain explorer for the tx. |
| Marketplace listing seller approves but tx fails to broadcast | Approval is a separate tx, so user keeps the approval and just retries the list step. |
| User tries to bridge an L3 NFT to Base | Allowed — bridge preserves level. UI shows "You'll receive a Gold NFT on Base." |
| User has zero ETH on Base for the bridgeMint claim tx | UI warns at READY_TO_CLAIM state: "You need ~0.0001 ETH on Base for the claim tx." Links to a fund option. |
| Player tries to upgrade with wallet not matching NFT owner | Quote endpoint returns 403 — UI shows "Switch wallet to <owner address> first". |
| OpenSea cached image not updated post-upgrade | UI shows our authoritative image immediately (we own the metadata endpoint). OpenSea catches up async. |

---

## 6. Dependencies

- Existing wallet adapters: EVM (wagmi/viem), Solana (@solana/wallet-adapter), Aptos (@aptos-labs/wallet-adapter).
- Existing `web/src/lib/gameShop.js` for shop flows; extend with `upgradeQuote` / `bridgeInit` calls.
- New `web/src/lib/marketplace.js` for listing/buy/cancel ABI calls.
- Existing `web/src/components/NftMintPanel.jsx` provides the visual style baseline.

---

## 7. Tuning Knobs

| Knob | Default | Where |
|------|---------|-------|
| Status poll interval | 5 s | `useBridgeStatus` hook |
| Wins poll interval | 10 s | `useNftWins` hook |
| Toast duration | 5 s | shared `useToast` hook |
| Confirmation text required for bridge | last 4 chars of target | `BridgeConfirmation.jsx` |

---

## 8. Acceptance Criteria

- [ ] Owner-of-NFT player sees Level badge on all their NFTs.
- [ ] Upgrade button disabled (with tooltip) when win threshold not met.
- [ ] Successful upgrade animates and shows new art within 60 s.
- [ ] Bridge requires explicit confirmation step (typed / checkbox).
- [ ] Bridge UI shows real-time progress (3 stages).
- [ ] Bridge job survives browser refresh (URL params or sessionStorage).
- [ ] Marketplace browse loads ≤ 1 s for first 50 listings.
- [ ] Listing flow handles missing approval transparently (one extra tx, no confusion).
- [ ] Buy flow shows clear price breakdown including royalty before confirmation.
- [ ] All error states have actionable recovery (retry / explorer link / support).
- [ ] No console errors during full happy path of mint + upgrade + bridge + list + buy on testnet.
