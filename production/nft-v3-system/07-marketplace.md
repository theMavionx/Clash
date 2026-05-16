# 07 — Marketplace (Base only)

## 1. Overview

A simple fixed-price ERC-721 marketplace contract deployed on Base. Supports:

- **List**: owner approves marketplace, calls `list(tokenId, paymentToken, price)`.
- **Buy**: buyer calls `buy(tokenId)` sending the right payment; contract transfers NFT, pays seller minus royalty, pays royalty to treasury.
- **Cancel**: owner removes their listing.
- **UpdatePrice**: owner changes the asking price without re-listing.

Payment tokens: ETH (native), USDC (Circle Base), CoP (game token).

Royalty: 2.5% (EIP-2981) to treasury on every sale.

The contract is **non-custodial**: it never holds the NFT — it pulls the NFT
from the seller's wallet at sale time using `transferFrom`. Seller keeps
custody until the moment of sale.

---

## 2. Player Fantasy

"I have a Gold-rank Demon King with 12 000 battle wins. I list him on the
in-game marketplace for $50 USDC. Three days later someone buys him.
The USDC lands in my wallet minus 2.5% royalty. The NFT moves to the
buyer. The buyer sees the battle history I built up."

---

## 3. Detailed Rules

### 3.1 Contract: `DemonKingMarketplace.sol`

Storage:

```solidity
struct Listing {
    address seller;
    address paymentToken;   // address(0) = native ETH
    uint256 price;
    uint64  listedAt;
    uint64  expiresAt;      // 0 = no expiry
}

mapping(address => mapping(uint256 => Listing)) public listings;
//      nftContract       tokenId

mapping(address => bool) public allowedNftContracts;
mapping(address => bool) public allowedPaymentTokens;

address public treasury;
uint16  public platformFeeBps;   // 0 by default
uint16  public maxRoyaltyBps;    // 1000 (10%) hard cap
```

Three core events:

```solidity
event Listed(address indexed nft, uint256 indexed tokenId, address indexed seller, address paymentToken, uint256 price);
event Cancelled(address indexed nft, uint256 indexed tokenId, address indexed seller);
event Sold(address indexed nft, uint256 indexed tokenId, address indexed seller, address buyer, address paymentToken, uint256 price, uint256 royaltyPaid);
```

### 3.2 List function

```solidity
function list(
    address nft,
    uint256 tokenId,
    address paymentToken,
    uint256 price,
    uint64 expiresAt
) external nonReentrant {
    require(allowedNftContracts[nft], "NFT not allowed");
    require(allowedPaymentTokens[paymentToken], "Token not allowed");
    require(IERC721(nft).ownerOf(tokenId) == msg.sender, "Not owner");
    require(IERC721(nft).isApprovedForAll(msg.sender, address(this))
            || IERC721(nft).getApproved(tokenId) == address(this), "No approval");
    require(price > 0, "Zero price");

    listings[nft][tokenId] = Listing({
        seller: msg.sender,
        paymentToken: paymentToken,
        price: price,
        listedAt: uint64(block.timestamp),
        expiresAt: expiresAt
    });
    emit Listed(nft, tokenId, msg.sender, paymentToken, price);
}
```

The marketplace **never escrows** the NFT. Approval is required so the
marketplace can pull it at sale time. If the seller transfers the NFT
out, the listing becomes a phantom — buy attempt will revert at the
`transferFrom`.

### 3.3 Buy function

```solidity
function buy(address nft, uint256 tokenId) external payable nonReentrant {
    Listing memory L = listings[nft][tokenId];
    require(L.seller != address(0), "Not listed");
    require(L.expiresAt == 0 || block.timestamp <= L.expiresAt, "Expired");
    require(IERC721(nft).ownerOf(tokenId) == L.seller, "Seller no longer owns");

    delete listings[nft][tokenId];

    (address royaltyReceiver, uint256 royaltyAmount) =
        IERC2981(nft).royaltyInfo(tokenId, L.price);
    if (royaltyAmount > L.price) royaltyAmount = L.price;       // safety
    if (royaltyReceiver == address(0)) royaltyAmount = 0;

    uint256 platformFee = (L.price * platformFeeBps) / 10_000;
    uint256 sellerProceeds = L.price - royaltyAmount - platformFee;

    if (L.paymentToken == address(0)) {
        require(msg.value == L.price, "Wrong ETH");
        if (royaltyAmount > 0) {
            (bool r1, ) = royaltyReceiver.call{value: royaltyAmount}("");
            require(r1, "Royalty xfer failed");
        }
        if (platformFee > 0) {
            (bool r2, ) = treasury.call{value: platformFee}("");
            require(r2, "Platform fee failed");
        }
        (bool r3, ) = L.seller.call{value: sellerProceeds}("");
        require(r3, "Seller xfer failed");
    } else {
        require(msg.value == 0, "ETH not accepted");
        IERC20 token = IERC20(L.paymentToken);
        if (royaltyAmount > 0) {
            token.safeTransferFrom(msg.sender, royaltyReceiver, royaltyAmount);
        }
        if (platformFee > 0) {
            token.safeTransferFrom(msg.sender, treasury, platformFee);
        }
        token.safeTransferFrom(msg.sender, L.seller, sellerProceeds);
    }

    IERC721(nft).safeTransferFrom(L.seller, msg.sender, tokenId);
    emit Sold(nft, tokenId, L.seller, msg.sender, L.paymentToken, L.price, royaltyAmount);
}
```

Key properties:

- Listing is cleared before external calls (CEI pattern).
- Royalty info is fetched from the NFT contract via EIP-2981.
- Royalty is capped at full sale price.
- Reentrancy guard around the whole function.
- Both native ETH and ERC-20 supported via the same code path.

### 3.4 Cancel & updatePrice

```solidity
function cancel(address nft, uint256 tokenId) external {
    require(listings[nft][tokenId].seller == msg.sender, "Not seller");
    delete listings[nft][tokenId];
    emit Cancelled(nft, tokenId, msg.sender);
}

function updatePrice(address nft, uint256 tokenId, uint256 newPrice) external {
    Listing storage L = listings[nft][tokenId];
    require(L.seller == msg.sender, "Not seller");
    require(newPrice > 0, "Zero price");
    L.price = newPrice;
    emit Listed(nft, tokenId, msg.sender, L.paymentToken, newPrice);  // re-uses Listed event
}
```

### 3.5 Admin & access control

Owner can:
- Set `treasury` address.
- Set `platformFeeBps` (capped at 500 = 5%).
- Add/remove `allowedNftContracts`.
- Add/remove `allowedPaymentTokens`.
- Pause the marketplace (emergency only).

Owner CANNOT:
- Cancel another user's listing.
- Take fees retroactively from a closed sale.
- Override the NFT's EIP-2981 royalty info.

### 3.6 Supported tokens at launch

```
ETH (native)
USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913   // Base USDC
CoP:  <CoP token address from deployment>
```

Adding new payment tokens requires `addAllowedPaymentToken(address)` by
owner.

### 3.7 Why "allowedNftContracts" rather than open?

The marketplace is purpose-built for Demon King NFTs. Restricting to our
own contract(s) eliminates a category of malicious-NFT exploits (fake
royalty receivers, reentry on transferFrom, etc.). If we ever want to host
other collections, we add them explicitly.

---

## 4. Formulas

### Royalty split

```
royalty = price * royaltyBps / 10000          // from EIP-2981 royaltyInfo()
platformFee = price * platformFeeBps / 10000  // marketplace contract config
sellerProceeds = price - royalty - platformFee
```

### Royalty cap

```
if (royalty > price) royalty = price
if (royalty + platformFee > price) {
    platformFee = price - royalty
}
```

The seller's proceeds can be zero (in extreme misconfiguration) but never
negative.

---

## 5. Edge Cases

| Case | Handling |
|------|----------|
| Seller transferred NFT to another wallet after listing | Buy reverts at `ownerOf(tokenId) == seller` check. Buyer gets gas refunded except for the failed tx fee. |
| Seller revoked approval after listing | Buy reverts at `safeTransferFrom`. Same as above. |
| Listing expired | Buy reverts on `block.timestamp <= expiresAt`. Listing remains in storage but unusable; seller can re-list with new expiry. |
| Buyer doesn't send enough ETH | `require(msg.value == L.price)` reverts. Buyer keeps their ETH. |
| Buyer overpays | Currently reverts on `msg.value != L.price` (exact match required). If we want to allow overpay + refund, that's a future feature. |
| Multiple buyers race for same listing | Only one tx wins, others revert at `seller != address(0)` because storage is cleared. |
| Royalty receiver is `address(0)` | Royalty is zero, full proceeds (minus platform fee) go to seller. |
| Royalty receiver is a contract that reverts on receive | ETH path: marketplace tx reverts (whole sale fails). ERC-20 path: `safeTransferFrom` reverts. Mitigation: we control royalty receiver = treasury (a normal EOA or simple proxy). |
| EIP-2981 not implemented on NFT | `royaltyInfo` call reverts; marketplace catches and treats royalty as zero. We add try/catch to allow this. |
| Listing's `expiresAt` in the past at time of listing | `require(expiresAt == 0 \|\| expiresAt > block.timestamp)`. |

---

## 6. Dependencies

- Base V3 NFT contract implements EIP-2981 (covered in [02-base-v3-upgrade.md](02-base-v3-upgrade.md)).
- USDC token on Base (Circle's canonical address, fixed).
- CoP token on Base (existing deployment).
- Royalty receiver = treasury wallet.

---

## 7. Tuning Knobs

| Knob | Default | Setter |
|------|---------|--------|
| `treasury` | `0xC024…3094` | `setTreasury` |
| `platformFeeBps` | 0 (no platform fee on top of royalty) | `setPlatformFee` (capped 500) |
| Allowed NFT contracts | `{Base V3 proxy}` | `addAllowedNft` / `removeAllowedNft` |
| Allowed payment tokens | `{ETH, USDC, CoP}` | `addAllowedPaymentToken` / `removeAllowedPaymentToken` |
| Listing expiry | optional, set per listing | n/a |
| Royalty rate | 2.5% (from EIP-2981 on NFT) | `setRoyalty` on Base V3 NFT contract |

---

## 8. Acceptance Criteria

- [ ] Contract deploys to Base mainnet.
- [ ] Listing requires marketplace approval; without approval, list reverts.
- [ ] A successful buy in ETH transfers NFT to buyer, sends royalty to treasury, sends remainder to seller, all in one tx.
- [ ] Same flow works for USDC and CoP.
- [ ] Cancel removes the listing; storage is zeroed.
- [ ] UpdatePrice changes only the price; expiry is unchanged.
- [ ] Buy reverts if seller transferred the NFT away.
- [ ] Buy reverts if listing expired.
- [ ] No reentrancy attack possible — verified by external auditor or slither clean.
- [ ] Platform fee + royalty never exceed sale price.
- [ ] Owner cannot cancel another user's listing.
- [ ] Pausing the marketplace blocks new listings and new buys; cancellation by sellers still allowed.
