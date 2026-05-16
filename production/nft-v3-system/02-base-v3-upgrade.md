# 02 — Base V3 UUPS Upgrade

## 1. Overview

Upgrade the existing Base V2 proxy (`0x4048…6fec`) in place to a new
`DemonKingBaseV3` implementation. The upgrade adds:

- `level` tracking per token (Section 3.2 of [01-token-model.md](01-token-model.md))
- `upgradeToken(uint256 tokenId, ...)` entrypoint for L1→L2 and L2→L3
- `bridgeMint(...)` entrypoint for cross-chain bridge inflows
- EIP-2981 royalty info for marketplace integration
- EIP-4906 `MetadataUpdate` events for marketplace re-indexing

**The proxy address does not change.** All 43 existing NFTs, all OpenSea
listings, all tokenIds remain valid. Storage layout is appended-only.

This document specifies the contract source, storage layout reasoning, upgrade
procedure, and recovery plan.

---

## 2. Player Fantasy

Players see no change at all on launch day — their NFT is still in their
wallet, still has the same ID, still shows up on OpenSea. Then upgrade
features become available in our UI.

---

## 3. Storage Layout Compatibility

### 3.1 V2 current layout (from `DemonKingBaseV2.sol`)

| Slot | Variable | Type |
|------|----------|------|
| 0 | (ERC721Upgradeable: `_name`) | string |
| 1 | (ERC721Upgradeable: `_symbol`) | string |
| 2 | (ERC721Upgradeable: `_owners`) | mapping(uint256 => address) |
| 3 | (ERC721Upgradeable: `_balances`) | mapping(address => uint256) |
| 4 | (ERC721Upgradeable: `_tokenApprovals`) | mapping(uint256 => address) |
| 5 | (ERC721Upgradeable: `_operatorApprovals`) | mapping(address => mapping(address => bool)) |
| (OZ slots for Ownable, Pausable, ReentrancyGuard, UUPS) | | |
| N+0 | `maxSupply` | uint256 |
| N+1 | `maxPerTx` | uint256 |
| N+2 | `mintPrice` | uint256 |
| N+3 | `totalMinted` | uint256 |
| N+4 | `saleActive` | bool |
| N+5 | `baseTokenURI` | string |
| N+6 | `contractMetadataURI` | string |
| N+7 | `authorizedMinters` | mapping(address => bool) |
| N+8 .. N+49 | `__gap[42]` | uint256[42] |

The trailing **`__gap[42]`** is the upgrade buffer. We have 42 free slots to
introduce new state.

### 3.2 V3 appends (consumes from gap)

| New slot | Variable | Type | Purpose |
|----------|----------|------|---------|
| +1 | `_tokenLevelRaw` | mapping(uint256 => uint8) | Per-token level. 0 == L1. |
| +2 | `upgradePrice` | uint256 | Wei price for one upgrade step. 0 = upgrade disabled. |
| +3 | `upgradeQuoteSigner` | address | EIP-712 signer for upgrade quotes |
| +4 | `usedUpgradeNonces` | mapping(bytes32 => bool) | Replay protection |
| +5 | `bridgeQuoteSigner` | address | EIP-712 signer for bridge receipts (can differ from mint signer) |
| +6 | `usedBridgeReceipts` | mapping(bytes32 => bool) | Replay protection for bridge mints |
| +7 | `royaltyReceiver` | address | EIP-2981 receiver |
| +8 | `royaltyBps` | uint16 (packed) | EIP-2981 fee numerator out of 10000 |
| +9 | `imageBaseURI` | string | E.g. `https://clashofperps.fun/cdn/nft/`. Used in tokenURI override. |

That's 9 new slots, leaving `__gap[33]` for future upgrades. We shrink the gap
declaration to compensate:

```solidity
// Was: uint256[42] private __gap;
// Becomes:
uint256[33] private __gap;
```

> **CRITICAL:** The total contract storage footprint must equal V2's. V2 had 42
> gap slots. V3 uses 9, leaves 33. Total slots used = 42. ✓

### 3.3 Verification step before deploy

A test script `nft/scripts/check-storage-layout.mjs` will:
1. Run `forge inspect DemonKingBaseV2 storage-layout` (or solc equivalent).
2. Run the same for `DemonKingBaseV3`.
3. Assert every V2 slot/offset is preserved in V3.

Upgrade is **blocked** if this script fails.

---

## 4. Contract Source Sketch — `DemonKingBaseV3.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DemonKingBaseV2} from "./DemonKingBaseV2.sol";  // inherits to preserve layout
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract DemonKingBaseV3 is DemonKingBaseV2, EIP712Upgradeable, IERC2981 {
    using ECDSA for bytes32;

    uint8 public constant MAX_LEVEL = 3;

    mapping(uint256 => uint8) private _tokenLevelRaw;
    uint256 public upgradePrice;
    address public upgradeQuoteSigner;
    mapping(bytes32 => bool) public usedUpgradeNonces;
    address public bridgeQuoteSigner;
    mapping(bytes32 => bool) public usedBridgeReceipts;
    address public royaltyReceiver;
    uint16 public royaltyBps;
    string public imageBaseURI;

    uint256[33] private __gap_v3;

    // ====== Events ======

    event TokenLevelUpgraded(uint256 indexed tokenId, uint8 oldLevel, uint8 newLevel, address indexed owner);
    event UpgradePriceUpdated(uint256 oldPrice, uint256 newPrice);
    event UpgradeQuoteSignerUpdated(address signer);
    event BridgeQuoteSignerUpdated(address signer);
    event BridgeMint(uint256 indexed tokenId, address indexed to, uint8 level, bytes32 receiptId);
    event RoyaltyUpdated(address receiver, uint16 bps);
    event MetadataUpdate(uint256 _tokenId);  // EIP-4906

    // ====== Initialize V3 (called once after upgradeToAndCall) ======

    function initializeV3(
        address _upgradeSigner,
        address _bridgeSigner,
        uint256 _upgradePrice,
        address _royaltyReceiver,
        uint16 _royaltyBps,
        string memory _imageBaseURI
    ) external reinitializer(2) {
        __EIP712_init("DemonKingBase", "3");
        upgradeQuoteSigner = _upgradeSigner;
        bridgeQuoteSigner = _bridgeSigner;
        upgradePrice = _upgradePrice;
        royaltyReceiver = _royaltyReceiver;
        royaltyBps = _royaltyBps;
        imageBaseURI = _imageBaseURI;
    }

    // ====== Level read ======

    function tokenLevel(uint256 tokenId) public view returns (uint8) {
        _requireOwned(tokenId);
        uint8 raw = _tokenLevelRaw[tokenId];
        return raw == 0 ? 1 : raw;
    }

    // ====== Upgrade entrypoint (paid + signed) ======

    /// Server signs an EIP-712 payload after verifying ownership + freshness.
    /// (Phase B will add a battle-win threshold check before signing.)
    /// Type hash: UpgradeQuote(uint256 tokenId,address owner,uint8 newLevel,uint256 priceWei,bytes32 nonce,uint256 deadline)
    bytes32 private constant UPGRADE_QUOTE_TYPEHASH =
        keccak256("UpgradeQuote(uint256 tokenId,address owner,uint8 newLevel,uint256 priceWei,bytes32 nonce,uint256 deadline)");

    function upgradeToken(
        uint256 tokenId,
        uint8 newLevel,
        uint256 priceWei,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        require(block.timestamp <= deadline, "Quote expired");
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        uint8 current = tokenLevel(tokenId);
        require(newLevel == current + 1 && newLevel <= MAX_LEVEL, "Bad target level");
        require(msg.value == priceWei, "Wrong value");
        require(!usedUpgradeNonces[nonce], "Nonce used");

        bytes32 structHash = keccak256(abi.encode(
            UPGRADE_QUOTE_TYPEHASH,
            tokenId, msg.sender, newLevel, priceWei, nonce, deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        require(digest.recover(signature) == upgradeQuoteSigner, "Bad signer");

        usedUpgradeNonces[nonce] = true;
        _tokenLevelRaw[tokenId] = newLevel;
        emit TokenLevelUpgraded(tokenId, current, newLevel, msg.sender);
        emit MetadataUpdate(tokenId);
    }

    // ====== Bridge mint (cross-chain inflow) ======

    /// Type hash: BridgeReceipt(uint16 sourceChainId,uint256 sourceTokenId,address to,uint8 level,bytes32 receiptId,uint256 deadline)
    bytes32 private constant BRIDGE_RECEIPT_TYPEHASH =
        keccak256("BridgeReceipt(uint16 sourceChainId,uint256 sourceTokenId,address to,uint8 level,bytes32 receiptId,uint256 deadline)");

    function bridgeMint(
        uint16 sourceChainId,
        uint256 sourceTokenId,
        address to,
        uint8 level,
        bytes32 receiptId,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant whenNotPaused returns (uint256 newTokenId) {
        require(block.timestamp <= deadline, "Receipt expired");
        require(level >= 1 && level <= MAX_LEVEL, "Bad level");
        require(!usedBridgeReceipts[receiptId], "Receipt used");

        bytes32 structHash = keccak256(abi.encode(
            BRIDGE_RECEIPT_TYPEHASH,
            sourceChainId, sourceTokenId, to, level, receiptId, deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        require(digest.recover(signature) == bridgeQuoteSigner, "Bad signer");

        usedBridgeReceipts[receiptId] = true;
        totalMinted += 1;
        newTokenId = totalMinted;
        _tokenLevelRaw[newTokenId] = level;
        _safeMint(to, newTokenId);
        emit BridgeMint(newTokenId, to, level, receiptId);
    }

    // ====== Metadata override (level-aware) ======

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        // Server reads tokenLevel(id) and resolves the right image.
        return string.concat(_baseURI(), Strings.toString(tokenId));
    }

    // ====== EIP-2981 royalty ======

    function royaltyInfo(uint256 /*tokenId*/, uint256 salePrice)
        external view override returns (address receiver, uint256 royaltyAmount)
    {
        receiver = royaltyReceiver;
        royaltyAmount = (salePrice * royaltyBps) / 10_000;
    }

    function supportsInterface(bytes4 iid) public view virtual override(ERC721Upgradeable, IERC165) returns (bool) {
        return iid == type(IERC2981).interfaceId
            || iid == bytes4(0x49064906)  // EIP-4906
            || super.supportsInterface(iid);
    }

    // ====== Admin ======

    function setUpgradePrice(uint256 newPrice) external onlyOwner {
        emit UpgradePriceUpdated(upgradePrice, newPrice);
        upgradePrice = newPrice;
    }
    function setUpgradeQuoteSigner(address s) external onlyOwner { upgradeQuoteSigner = s; emit UpgradeQuoteSignerUpdated(s); }
    function setBridgeQuoteSigner(address s) external onlyOwner { bridgeQuoteSigner = s; emit BridgeQuoteSignerUpdated(s); }
    function setRoyalty(address receiver, uint16 bps) external onlyOwner {
        require(bps <= 1000, "Royalty too high");  // hard cap 10%
        royaltyReceiver = receiver; royaltyBps = bps;
        emit RoyaltyUpdated(receiver, bps);
    }
    function setImageBaseURI(string calldata uri) external onlyOwner { imageBaseURI = uri; }
}
```

The code above is illustrative — the final implementation will pass linting,
have full natspec, and run through the storage-layout check.

---

## 5. Upgrade Procedure

Step-by-step:

1. **Compile & lint**: `npm run compile:base` (already in `nft/package.json`),
   plus `npm run lint:solidity` (slither + solhint).
2. **Storage layout check**: `node nft/scripts/check-storage-layout.mjs` — must
   pass before any tx is sent.
3. **Test on Base Sepolia first**: deploy a copy of V2 via local fork, mint
   3 NFTs, upgrade to V3, run `tokenLevel(id)` to confirm `=1`, run a paid
   upgrade tx, confirm `=2`. Run `bridgeMint`, confirm new token mints.
4. **Mainnet deploy of V3 implementation**:
   ```
   node nft/scripts/deploy-evm-v3-impl.mjs --chain=base
   ```
   This deploys a fresh implementation (no proxy). Outputs new impl address.
5. **Schedule upgrade tx** via the deployer wallet
   `0x1EC28C…7828` (still the proxy owner):
   ```solidity
   proxy.upgradeToAndCall(
     newImpl,
     abi.encodeWithSelector(
       DemonKingBaseV3.initializeV3.selector,
       UPGRADE_SIGNER, BRIDGE_SIGNER, 8_900_000 /*placeholder, see below*/,
       TREASURY, 250, "https://clashofperps.fun/cdn/nft/"
     )
   );
   ```
6. **Post-upgrade verification**:
   - Read `tokenLevel(1)`..`tokenLevel(43)` — all must return 1.
   - Read `ownerOf(1)` — must match V2 owner.
   - Try a paid upgrade with a server-signed quote — must succeed and emit
     `TokenLevelUpgraded`.
   - Read `supportsInterface(0x2a55205a)` (EIP-2981) → true.
   - Read `supportsInterface(0x49064906)` (EIP-4906) → true.
7. **Update server config** to expect V3 ABI (`server/routes.js` NFT_EVM_CHAIN_SPECS).
8. **Trigger a `MetadataUpdate(1..43)` batch** so OpenSea refetches existing
   tokens with the new metadata pipeline.

### Note on upgrade price

`upgradePrice` is the **wei value** required for one upgrade step. Since
$8.9 in USDC is collected off-chain through the existing shop flow (NOT
through ETH/native value), `upgradePrice` on the contract is **0** — payment
happens via USDC transfer in the same tx flow as the current shop. The
contract's `require(msg.value == priceWei)` check is then effectively
`require(msg.value == 0)`, and USDC handling happens in the same way as the
existing `DemonKingBaseShopV2` contract handles mint payments. See
[08-server-architecture.md](08-server-architecture.md) §5 for the full
payment flow.

---

## 6. Edge Cases

| Case | Handling |
|------|----------|
| Owner of proxy is no longer the deployer (e.g., compromised) | Block upgrade. Verify `proxy.owner()` matches expected deployer before scheduling. |
| Storage gap shrunk in V3 doesn't match math | Storage-layout check fails → blocked. |
| `initializeV3` called twice | `reinitializer(2)` guard prevents. |
| Player tries to upgrade L2→L2 or L1→L3 | `require(newLevel == current + 1)` reverts. |
| Player tries to upgrade after burning the token | `ownerOf(tokenId)` reverts with `ERC721NonexistentToken`. |
| Signature replay across chains | EIP-712 domain includes `chainId` — Arbitrum signatures invalid on Base. |
| Nonce reuse | `usedUpgradeNonces[nonce] = true` checked first. |
| Quote expired | `block.timestamp <= deadline` enforced. |
| Bridge receipt forged | Recovered signer must equal `bridgeQuoteSigner`; receipt nonce stored. |
| Marketplace lists a non-existent tokenId | Marketplace contract reverts on transfer attempt (ERC-721 standard). |

---

## 7. Dependencies

- **In:** [01-token-model.md](01-token-model.md) — level semantics
- **In:** [08-server-architecture.md](08-server-architecture.md) — signer flow
- **Out:** [03-evm-v3-deploy.md](03-evm-v3-deploy.md) — reuses this implementation
- **Out:** [07-marketplace.md](07-marketplace.md) — uses EIP-2981 royalty info

---

## 8. Tuning Knobs

| Knob | Default | Setter |
|------|---------|--------|
| `upgradePrice` | 0 wei (USDC paid off-chain) | `setUpgradePrice` (onlyOwner) |
| `upgradeQuoteSigner` | server signer wallet | `setUpgradeQuoteSigner` (onlyOwner) |
| `bridgeQuoteSigner` | server signer wallet | `setBridgeQuoteSigner` (onlyOwner) |
| `royaltyReceiver` | treasury | `setRoyalty` (onlyOwner) |
| `royaltyBps` | 250 (2.5%) | `setRoyalty` (onlyOwner) |
| `imageBaseURI` | `clashofperps.fun/cdn/nft/` | `setImageBaseURI` (onlyOwner) |

---

## 9. Acceptance Criteria

- [ ] V3 implementation compiles, passes slither with no high-severity findings.
- [ ] Storage layout script confirms V3 is forward-compatible with V2.
- [ ] After `upgradeToAndCall(V3, initData)`:
  - [ ] All 43 existing NFTs still owned by their original wallets.
  - [ ] `tokenLevel(id)` returns 1 for every existing NFT without storage write.
  - [ ] `supportsInterface(0x2a55205a)` returns true.
  - [ ] `supportsInterface(0x49064906)` returns true.
  - [ ] `royaltyInfo(1, 1 ether)` returns `(treasury, 0.025 ether)`.
- [ ] A server-signed upgrade quote successfully promotes an L1 → L2.
- [ ] A second use of the same nonce reverts.
- [ ] An expired deadline reverts.
- [ ] A signature from a non-signer wallet reverts.
- [ ] A bridge mint with a valid receipt creates a new tokenId at the
  receipt's level.
