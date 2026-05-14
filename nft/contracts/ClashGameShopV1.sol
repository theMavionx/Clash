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

contract ClashGameShopV1 is
    Initializable,
    OwnableUpgradeable,
    UpgradeableReentrancyGuard,
    EIP712Upgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    struct PurchaseQuote {
        address buyer;
        address paymentToken;
        bytes32 sku;
        uint256 unitPrice;
        uint256 quantity;
        uint256 usdPriceE6;
        bytes32 account;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 public constant PURCHASE_QUOTE_TYPEHASH = keccak256(
        "PurchaseQuote(address buyer,address paymentToken,bytes32 sku,uint256 unitPrice,uint256 quantity,uint256 usdPriceE6,bytes32 account,uint256 nonce,uint256 deadline)"
    );

    address public quoteSigner;
    address public treasury;
    address public copToken;
    bool public saleActive;
    uint256 public maxQuantityPerPurchase;

    mapping(address => bool) public paymentTokenAllowed;
    mapping(bytes32 => bool) public usedQuote;

    event QuoteSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event CopTokenUpdated(address indexed oldToken, address indexed newToken);
    event PaymentTokenUpdated(address indexed token, bool allowed);
    event MaxQuantityUpdated(uint256 oldMaxQuantity, uint256 newMaxQuantity);
    event SaleActiveUpdated(bool active);
    event GamePurchase(
        address indexed buyer,
        address indexed paymentToken,
        bytes32 indexed sku,
        uint256 unitPrice,
        uint256 quantity,
        uint256 usdPriceE6,
        bytes32 account,
        uint256 nonce
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address initialQuoteSigner,
        address initialTreasury,
        address initialCopToken
    ) public initializer {
        require(initialOwner != address(0), "Zero owner");
        require(initialQuoteSigner != address(0), "Zero signer");
        require(initialTreasury != address(0), "Zero treasury");
        require(initialCopToken != address(0), "Zero CoP");

        __Ownable_init(initialOwner);
        __UpgradeableReentrancyGuard_init();
        __EIP712_init("ClashGameShop", "1");

        quoteSigner = initialQuoteSigner;
        treasury = initialTreasury;
        copToken = initialCopToken;
        maxQuantityPerPurchase = 10;
        paymentTokenAllowed[initialCopToken] = true;
    }

    function purchaseWithQuote(PurchaseQuote calldata quote, bytes calldata signature) external nonReentrant {
        require(saleActive, "Sale inactive");
        require(quote.buyer == msg.sender, "Wrong buyer");
        require(quote.paymentToken != address(0), "Native disabled");
        require(paymentTokenAllowed[quote.paymentToken], "Payment disabled");
        require(quote.quantity > 0 && quote.quantity <= maxQuantityPerPurchase, "Bad quantity");
        require(block.timestamp <= quote.deadline, "Quote expired");
        require(quote.sku != bytes32(0), "Bad SKU");
        require(quote.account != bytes32(0), "Bad account");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            PURCHASE_QUOTE_TYPEHASH,
            quote.buyer,
            quote.paymentToken,
            quote.sku,
            quote.unitPrice,
            quote.quantity,
            quote.usdPriceE6,
            quote.account,
            quote.nonce,
            quote.deadline
        )));
        require(!usedQuote[digest], "Quote used");
        address recovered = ECDSA.recover(digest, signature);
        require(recovered == quoteSigner || recovered == owner(), "Bad quote");
        usedQuote[digest] = true;

        uint256 total = quote.unitPrice * quote.quantity;
        IERC20(quote.paymentToken).safeTransferFrom(msg.sender, treasury, total);

        emit GamePurchase(
            msg.sender,
            quote.paymentToken,
            quote.sku,
            quote.unitPrice,
            quote.quantity,
            quote.usdPriceE6,
            quote.account,
            quote.nonce
        );
    }

    function setQuoteSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Zero signer");
        emit QuoteSignerUpdated(quoteSigner, newSigner);
        quoteSigner = newSigner;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Zero treasury");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setCopToken(address newCopToken) external onlyOwner {
        require(newCopToken != address(0), "Zero CoP");
        emit CopTokenUpdated(copToken, newCopToken);
        copToken = newCopToken;
    }

    function setPaymentToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "Zero token");
        paymentTokenAllowed[token] = allowed;
        emit PaymentTokenUpdated(token, allowed);
    }

    function setMaxQuantityPerPurchase(uint256 newMaxQuantity) external onlyOwner {
        require(newMaxQuantity > 0, "Bad max quantity");
        emit MaxQuantityUpdated(maxQuantityPerPurchase, newMaxQuantity);
        maxQuantityPerPurchase = newMaxQuantity;
    }

    function setSaleActive(bool active) external onlyOwner {
        saleActive = active;
        emit SaleActiveUpdated(active);
    }

    function rescueToken(address token) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner(), IERC20(token).balanceOf(address(this)));
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    uint256[42] private __gap;
}
