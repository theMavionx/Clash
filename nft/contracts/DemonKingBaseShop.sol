// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IDemonKingBase {
    function adminMint(address to, uint256 quantity) external;
    function setSaleActive(bool active) external;
    function pause() external;
    function unpause() external;
    function setBaseURI(string calldata newBaseURI) external;
    function setContractURI(string calldata newContractURI) external;
    function withdraw(address payable to) external;
}

contract DemonKingBaseShop is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    struct MintQuote {
        address buyer;
        address paymentToken;
        uint256 unitPrice;
        uint256 quantity;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 public constant MINT_QUOTE_TYPEHASH = keccak256(
        "MintQuote(address buyer,address paymentToken,uint256 unitPrice,uint256 quantity,uint256 nonce,uint256 deadline)"
    );
    uint256 public constant MAX_PER_TX = 10;

    IDemonKingBase public immutable nft;
    address public quoteSigner;
    bool public saleActive;

    mapping(address => bool) public paymentTokenAllowed;
    mapping(bytes32 => bool) public usedQuote;

    event QuoteSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event PaymentTokenUpdated(address indexed token, bool allowed);
    event SaleActiveUpdated(bool active);
    event ShopMinted(address indexed buyer, address indexed paymentToken, uint256 unitPrice, uint256 quantity);

    constructor(address initialOwner, address nftAddress, address initialQuoteSigner)
        Ownable(initialOwner)
        EIP712("DemonKingBaseShop", "1")
    {
        require(nftAddress != address(0), "Zero NFT");
        require(initialQuoteSigner != address(0), "Zero signer");
        nft = IDemonKingBase(nftAddress);
        quoteSigner = initialQuoteSigner;
    }

    function mintWithQuote(MintQuote calldata quote, bytes calldata signature) external payable nonReentrant {
        require(saleActive, "Sale inactive");
        require(quote.buyer == msg.sender, "Wrong buyer");
        require(quote.quantity > 0 && quote.quantity <= MAX_PER_TX, "Bad quantity");
        require(block.timestamp <= quote.deadline, "Quote expired");
        require(paymentTokenAllowed[quote.paymentToken], "Payment disabled");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            MINT_QUOTE_TYPEHASH,
            quote.buyer,
            quote.paymentToken,
            quote.unitPrice,
            quote.quantity,
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
            (bool ok, ) = payable(owner()).call{value: total}("");
            require(ok, "ETH transfer failed");
        } else {
            require(msg.value == 0, "No ETH expected");
            IERC20(quote.paymentToken).safeTransferFrom(msg.sender, owner(), total);
        }

        nft.adminMint(msg.sender, quote.quantity);
        emit ShopMinted(msg.sender, quote.paymentToken, quote.unitPrice, quote.quantity);
    }

    function setQuoteSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Zero signer");
        emit QuoteSignerUpdated(quoteSigner, newSigner);
        quoteSigner = newSigner;
    }

    function setPaymentToken(address token, bool allowed) external onlyOwner {
        paymentTokenAllowed[token] = allowed;
        emit PaymentTokenUpdated(token, allowed);
    }

    function setSaleActive(bool active) external onlyOwner {
        saleActive = active;
        emit SaleActiveUpdated(active);
    }

    function ownerAdminMint(address to, uint256 quantity) external onlyOwner {
        nft.adminMint(to, quantity);
    }

    function ownerSetNftSaleActive(bool active) external onlyOwner {
        nft.setSaleActive(active);
    }

    function ownerPauseNft() external onlyOwner {
        nft.pause();
    }

    function ownerUnpauseNft() external onlyOwner {
        nft.unpause();
    }

    function ownerSetBaseURI(string calldata newBaseURI) external onlyOwner {
        nft.setBaseURI(newBaseURI);
    }

    function ownerSetContractURI(string calldata newContractURI) external onlyOwner {
        nft.setContractURI(newContractURI);
    }

    function ownerWithdrawNftNative() external onlyOwner nonReentrant {
        nft.withdraw(payable(owner()));
    }

    function rescueNative() external onlyOwner nonReentrant {
        uint256 amount = address(this).balance;
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "Rescue failed");
    }

    function rescueToken(address token) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner(), IERC20(token).balanceOf(address(this)));
    }

    receive() external payable {}
}
