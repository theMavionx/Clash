// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Fixed-price ERC-721 marketplace for the Demon King collection on Base.
// Non-custodial: the NFT stays with the seller until a buyer fills the
// listing — the marketplace pulls it via transferFrom at that moment.
//
// Payment tokens: native ETH (paymentToken == address(0)) plus any whitelisted
// ERC-20 (USDC, CoP). Royalty is read from the NFT contract via EIP-2981 on
// every fill so changes to the royalty config flow through automatically.
//
// Storage layout is UUPS-upgradeable from day 1 (proxy + V1 impl).

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UpgradeableReentrancyGuard} from "./UpgradeableReentrancyGuard.sol";

contract DemonKingMarketplace is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UpgradeableReentrancyGuard,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ---- Config state ----
    IERC721 public demonKing;
    address public treasury;                                  // fallback royalty receiver if NFT lacks EIP-2981
    uint16  public defaultRoyaltyBps;                          // fallback bps if NFT lacks EIP-2981
    mapping(address => bool) public acceptedPaymentToken;     // address(0) = ETH; ERC-20 addresses for token sales

    // ---- Listings (one active listing per tokenId at a time) ----
    struct Listing {
        address seller;
        address paymentToken;        // 0x0 = native ETH
        uint256 price;                // wei (ETH) or smallest unit (ERC-20)
        uint64  createdAt;
        uint64  expiresAt;            // 0 = no expiry
        bool    active;
    }
    mapping(uint256 => Listing) public listings;
    uint16 public platformFeeBps;                              // marketplace fee paid to treasury on every fill

    // ---- Future-proof gap ----
    uint256[39] private __gap;

    // ---- Events ----
    event Listed(uint256 indexed tokenId, address indexed seller, address paymentToken, uint256 price, uint64 expiresAt);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event Sold(
        uint256 indexed tokenId,
        address indexed buyer,
        address indexed seller,
        address paymentToken,
        uint256 price,
        address royaltyReceiver,
        uint256 royaltyAmount
    );
    event AcceptedPaymentTokenUpdated(address indexed token, bool accepted);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event DefaultRoyaltyBpsUpdated(uint16 oldBps, uint16 newBps);
    event PlatformFeeBpsUpdated(uint16 oldBps, uint16 newBps);
    event DemonKingUpdated(address oldAddr, address newAddr);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address nftAddress,
        address treasuryAddress,
        uint16  fallbackRoyaltyBps,
        uint16  initialPlatformFeeBps
    ) public initializer {
        require(initialOwner != address(0), "Zero owner");
        require(nftAddress != address(0), "Zero NFT");
        require(treasuryAddress != address(0), "Zero treasury");
        require(fallbackRoyaltyBps <= 1_000, "Royalty cap 10%");
        require(initialPlatformFeeBps <= 1_000, "Fee cap 10%");

        __Ownable_init(initialOwner);
        __Pausable_init();
        __UpgradeableReentrancyGuard_init();

        demonKing = IERC721(nftAddress);
        treasury = treasuryAddress;
        defaultRoyaltyBps = fallbackRoyaltyBps;
        platformFeeBps = initialPlatformFeeBps;

        // ETH always accepted by default.
        acceptedPaymentToken[address(0)] = true;
        emit AcceptedPaymentTokenUpdated(address(0), true);
    }

    // ============ Listing ============

    function list(
        uint256 tokenId,
        address paymentToken,
        uint256 price,
        uint64 expiresAt
    ) external whenNotPaused {
        require(demonKing.ownerOf(tokenId) == msg.sender, "Not owner");
        require(acceptedPaymentToken[paymentToken], "Bad payment token");
        require(price > 0, "Bad price");
        require(expiresAt == 0 || expiresAt > block.timestamp, "Bad expiry");
        require(
            demonKing.getApproved(tokenId) == address(this) || demonKing.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        listings[tokenId] = Listing({
            seller: msg.sender,
            paymentToken: paymentToken,
            price: price,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            active: true
        });
        emit Listed(tokenId, msg.sender, paymentToken, price, expiresAt);
    }

    function cancel(uint256 tokenId) external {
        Listing storage l = listings[tokenId];
        require(l.active, "Not listed");
        require(l.seller == msg.sender || owner() == msg.sender, "Not seller");
        l.active = false;
        emit Cancelled(tokenId, l.seller);
    }

    // ============ Buy ============

    function buyWithEth(uint256 tokenId) external payable nonReentrant whenNotPaused {
        Listing memory l = _validateActive(tokenId);
        require(l.paymentToken == address(0), "Not ETH listing");
        require(msg.value == l.price, "Wrong ETH amount");

        // Wipe storage before external calls (checks-effects-interactions).
        delete listings[tokenId];

        (address royaltyReceiver, uint256 royaltyAmount) = _royaltyOf(tokenId, l.price);
        uint256 platformFeeAmount = _platformFeeOf(l.price);
        uint256 sellerProceeds = l.price - royaltyAmount - platformFeeAmount;

        if (royaltyAmount > 0) {
            (bool ok, ) = payable(royaltyReceiver).call{value: royaltyAmount}("");
            require(ok, "Royalty xfer failed");
        }
        if (platformFeeAmount > 0) {
            (bool okFee, ) = payable(treasury).call{value: platformFeeAmount}("");
            require(okFee, "Fee xfer failed");
        }
        (bool okSeller, ) = payable(l.seller).call{value: sellerProceeds}("");
        require(okSeller, "Seller xfer failed");

        demonKing.safeTransferFrom(l.seller, msg.sender, tokenId);
        emit Sold(tokenId, msg.sender, l.seller, address(0), l.price, royaltyReceiver, royaltyAmount);
    }

    function buyWithToken(uint256 tokenId) external nonReentrant whenNotPaused {
        Listing memory l = _validateActive(tokenId);
        require(l.paymentToken != address(0), "Not token listing");

        delete listings[tokenId];

        (address royaltyReceiver, uint256 royaltyAmount) = _royaltyOf(tokenId, l.price);
        uint256 platformFeeAmount = _platformFeeOf(l.price);
        uint256 sellerProceeds = l.price - royaltyAmount - platformFeeAmount;

        IERC20 token = IERC20(l.paymentToken);
        if (royaltyAmount > 0) {
            token.safeTransferFrom(msg.sender, royaltyReceiver, royaltyAmount);
        }
        if (platformFeeAmount > 0) {
            token.safeTransferFrom(msg.sender, treasury, platformFeeAmount);
        }
        token.safeTransferFrom(msg.sender, l.seller, sellerProceeds);

        demonKing.safeTransferFrom(l.seller, msg.sender, tokenId);
        emit Sold(tokenId, msg.sender, l.seller, l.paymentToken, l.price, royaltyReceiver, royaltyAmount);
    }

    // ============ Admin ============

    function setAcceptedPaymentToken(address token, bool accepted) external onlyOwner {
        acceptedPaymentToken[token] = accepted;
        emit AcceptedPaymentTokenUpdated(token, accepted);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Zero treasury");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setDefaultRoyaltyBps(uint16 newBps) external onlyOwner {
        require(newBps <= 1_000, "Cap 10%");
        emit DefaultRoyaltyBpsUpdated(defaultRoyaltyBps, newBps);
        defaultRoyaltyBps = newBps;
    }

    function setPlatformFeeBps(uint16 newBps) external onlyOwner {
        require(newBps <= 1_000, "Cap 10%");
        emit PlatformFeeBpsUpdated(platformFeeBps, newBps);
        platformFeeBps = newBps;
    }

    function setDemonKing(address newAddr) external onlyOwner {
        require(newAddr != address(0), "Zero");
        emit DemonKingUpdated(address(demonKing), newAddr);
        demonKing = IERC721(newAddr);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Views ============

    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return listings[tokenId];
    }

    function isActive(uint256 tokenId) external view returns (bool) {
        Listing memory l = listings[tokenId];
        if (!l.active) return false;
        if (l.expiresAt != 0 && block.timestamp >= l.expiresAt) return false;
        // Marketplace approval may have been revoked; treat that as inactive too.
        if (!(demonKing.getApproved(tokenId) == address(this) || demonKing.isApprovedForAll(l.seller, address(this)))) {
            return false;
        }
        return demonKing.ownerOf(tokenId) == l.seller;
    }

    // ============ Internals ============

    function _validateActive(uint256 tokenId) internal view returns (Listing memory) {
        Listing memory l = listings[tokenId];
        require(l.active, "Not listed");
        require(l.expiresAt == 0 || block.timestamp < l.expiresAt, "Listing expired");
        require(demonKing.ownerOf(tokenId) == l.seller, "Seller no longer owns");
        return l;
    }

    function _royaltyOf(uint256 tokenId, uint256 salePrice) internal view returns (address receiver, uint256 amount) {
        // Try the NFT's EIP-2981 implementation first.
        try IERC2981(address(demonKing)).royaltyInfo(tokenId, salePrice) returns (address r, uint256 a) {
            if (r != address(0) && a > 0 && a <= salePrice) {
                return (r, a);
            }
        } catch {
            // fall through to fallback
        }
        // Fallback: marketplace's own treasury + defaultRoyaltyBps.
        receiver = treasury;
        amount = (salePrice * defaultRoyaltyBps) / 10_000;
        if (amount > salePrice) amount = 0;
    }

    function _platformFeeOf(uint256 salePrice) internal view returns (uint256) {
        return (salePrice * platformFeeBps) / 10_000;
    }

    receive() external payable {
        revert("Direct ETH not accepted");
    }
}
