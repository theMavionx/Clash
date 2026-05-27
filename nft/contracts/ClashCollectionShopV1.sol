// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UpgradeableReentrancyGuard} from "./UpgradeableReentrancyGuard.sol";

interface IClashCollectionMintable {
    function adminMint(address to, uint256 quantity) external;
}

/// @title ClashCollectionShopV1
/// @notice Generic payment/quote layer for ClashCollectionNftV1. The shop
/// receives server-signed EIP-712 quotes, forwards payments to owner(), and
/// calls adminMint on the collection after being authorized as a minter.
contract ClashCollectionShopV1 is
    Initializable,
    OwnableUpgradeable,
    UpgradeableReentrancyGuard,
    EIP712Upgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    struct MintQuote {
        address buyer;
        address paymentToken;
        uint256 unitPrice;
        uint256 quantity;
        uint256 usdPriceE6;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 public constant MINT_QUOTE_TYPEHASH = keccak256(
        "MintQuote(address buyer,address paymentToken,uint256 unitPrice,uint256 quantity,uint256 usdPriceE6,uint256 nonce,uint256 deadline)"
    );

    IClashCollectionMintable public nft;
    address public quoteSigner;
    bool public saleActive;
    uint256 public maxPerTx;

    address public usdcToken;
    address public clashToken;
    uint256 public baseUsdPriceE6;
    uint256 public clashUsdPriceE6;

    mapping(address => bool) public paymentTokenAllowed;
    mapping(bytes32 => bool) public usedQuote;

    event NftUpdated(address indexed oldNft, address indexed newNft);
    event QuoteSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event PaymentTokenUpdated(address indexed token, bool allowed);
    event CorePaymentTokensUpdated(address indexed usdcToken, address indexed clashToken);
    event UsdPricesUpdated(uint256 baseUsdPriceE6, uint256 clashUsdPriceE6);
    event MaxPerTxUpdated(uint256 oldMaxPerTx, uint256 newMaxPerTx);
    event SaleActiveUpdated(bool active);
    event ShopMinted(
        address indexed buyer,
        address indexed paymentToken,
        uint256 unitPrice,
        uint256 quantity,
        uint256 usdPriceE6
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address nftAddress,
        address initialQuoteSigner,
        address initialUsdcToken,
        address initialClashToken,
        uint256 initialBaseUsdPriceE6,
        uint256 initialClashUsdPriceE6,
        string memory eip712Name,
        string memory eip712Version
    ) public initializer {
        require(initialOwner != address(0), "Zero owner");
        require(nftAddress != address(0), "Zero NFT");
        require(initialQuoteSigner != address(0), "Zero signer");
        require(initialBaseUsdPriceE6 > 0, "Bad base price");
        require(initialClashUsdPriceE6 > 0, "Bad clash price");

        __Ownable_init(initialOwner);
        __UpgradeableReentrancyGuard_init();
        __EIP712_init(eip712Name, eip712Version);

        nft = IClashCollectionMintable(nftAddress);
        quoteSigner = initialQuoteSigner;
        usdcToken = initialUsdcToken;
        clashToken = initialClashToken;
        baseUsdPriceE6 = initialBaseUsdPriceE6;
        clashUsdPriceE6 = initialClashUsdPriceE6;
        maxPerTx = 10;

        paymentTokenAllowed[address(0)] = true;
        if (initialUsdcToken != address(0)) paymentTokenAllowed[initialUsdcToken] = true;
        if (initialClashToken != address(0)) paymentTokenAllowed[initialClashToken] = true;
    }

    function mintWithQuote(MintQuote calldata quote, bytes calldata signature) external payable nonReentrant {
        require(saleActive, "Sale inactive");
        require(quote.buyer == msg.sender, "Wrong buyer");
        require(quote.quantity > 0 && quote.quantity <= maxPerTx, "Bad quantity");
        require(block.timestamp <= quote.deadline, "Quote expired");
        require(paymentTokenAllowed[quote.paymentToken], "Payment disabled");
        require(quote.usdPriceE6 == priceUsdForToken(quote.paymentToken), "Stale price");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            MINT_QUOTE_TYPEHASH,
            quote.buyer,
            quote.paymentToken,
            quote.unitPrice,
            quote.quantity,
            quote.usdPriceE6,
            quote.nonce,
            quote.deadline
        )));
        require(!usedQuote[digest], "Quote used");
        address recovered = ECDSA.recover(digest, signature);
        require(recovered == quoteSigner || recovered == owner(), "Bad quote");
        usedQuote[digest] = true;

        uint256 total = quote.unitPrice * quote.quantity;
        if (quote.paymentToken == address(0)) {
            require(msg.value == total, "Wrong ETH value");
            _sendNativeToOwner(total);
        } else {
            require(msg.value == 0, "No ETH expected");
            IERC20(quote.paymentToken).safeTransferFrom(msg.sender, owner(), total);
        }

        nft.adminMint(msg.sender, quote.quantity);
        emit ShopMinted(msg.sender, quote.paymentToken, quote.unitPrice, quote.quantity, quote.usdPriceE6);
    }

    function priceUsdForToken(address token) public view returns (uint256) {
        if (token == clashToken && clashToken != address(0)) return clashUsdPriceE6;
        return baseUsdPriceE6;
    }

    function setNft(address newNft) external onlyOwner {
        require(newNft != address(0), "Zero NFT");
        emit NftUpdated(address(nft), newNft);
        nft = IClashCollectionMintable(newNft);
    }

    function setQuoteSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Zero signer");
        emit QuoteSignerUpdated(quoteSigner, newSigner);
        quoteSigner = newSigner;
    }

    function setCorePaymentTokens(address newUsdcToken, address newClashToken) external onlyOwner {
        usdcToken = newUsdcToken;
        clashToken = newClashToken;
        emit CorePaymentTokensUpdated(newUsdcToken, newClashToken);
    }

    function setPaymentToken(address token, bool allowed) external onlyOwner {
        paymentTokenAllowed[token] = allowed;
        emit PaymentTokenUpdated(token, allowed);
    }

    function setUsdPrices(uint256 newBaseUsdPriceE6, uint256 newClashUsdPriceE6) external onlyOwner {
        require(newBaseUsdPriceE6 > 0, "Bad base price");
        require(newClashUsdPriceE6 > 0, "Bad clash price");
        baseUsdPriceE6 = newBaseUsdPriceE6;
        clashUsdPriceE6 = newClashUsdPriceE6;
        emit UsdPricesUpdated(newBaseUsdPriceE6, newClashUsdPriceE6);
    }

    function setMaxPerTx(uint256 newMaxPerTx) external onlyOwner {
        require(newMaxPerTx > 0, "Bad max per tx");
        emit MaxPerTxUpdated(maxPerTx, newMaxPerTx);
        maxPerTx = newMaxPerTx;
    }

    function setSaleActive(bool active) external onlyOwner {
        saleActive = active;
        emit SaleActiveUpdated(active);
    }

    function ownerAdminMint(address to, uint256 quantity) external onlyOwner {
        nft.adminMint(to, quantity);
    }

    function rescueNative() external onlyOwner nonReentrant {
        _sendNativeToOwner(address(this).balance);
    }

    function rescueToken(address token) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner(), IERC20(token).balanceOf(address(this)));
    }

    function _sendNativeToOwner(uint256 amount) private {
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "Native transfer failed");
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    receive() external payable {}

    uint256[40] private __gap;
}
