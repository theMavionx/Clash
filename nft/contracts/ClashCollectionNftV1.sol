// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {UpgradeableReentrancyGuard} from "./UpgradeableReentrancyGuard.sol";

/// @title ClashCollectionNftV1
/// @notice Configurable cross-chain ERC-721 collection using the
/// same model as DemonKingBaseV3: L1/L2/L3 upgrades, burn-and-mint bridge,
/// server-signed quotes, EIP-2981 royalties, and EIP-4906 metadata refresh.
contract ClashCollectionNftV1 is
    Initializable,
    ERC721Upgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UpgradeableReentrancyGuard,
    UUPSUpgradeable,
    EIP712Upgradeable,
    IERC2981,
    IERC4906
{
    using SafeERC20 for IERC20;
    using Strings for uint256;

    uint256 public maxSupply;
    uint256 public maxPerTx;
    uint256 public mintPrice;
    uint256 public totalMinted;
    uint256 public totalBurned;
    bool public saleActive;

    string private baseTokenURI;
    string public contractMetadataURI;

    mapping(address => bool) public authorizedMinters;
    mapping(uint256 => uint8) private _tokenLevelRaw;
    mapping(bytes32 => bool) public usedUpgradeNonces;
    mapping(bytes32 => bool) public usedBridgeRefs;

    address public quoteSigner;
    address public usdcToken;
    address public copToken;
    address public royaltyReceiver;
    uint16 public royaltyBps;
    uint256 public bridgeFeeWei;

    uint8 public constant MAX_LEVEL = 3;

    bytes32 private constant UPGRADE_QUOTE_TYPEHASH = keccak256(
        "UpgradeQuote(address owner,uint256 tokenId,uint8 newLevel,address paymentToken,uint256 priceUnits,bytes32 nonce,uint256 deadline)"
    );
    bytes32 private constant BRIDGE_RECEIPT_TYPEHASH = keccak256(
        "BridgeReceipt(address to,uint8 level,bytes32 sourceRef,uint256 destinationChainId,uint256 deadline)"
    );

    event MaxSupplyUpdated(uint256 oldSupply, uint256 newSupply);
    event MaxPerTxUpdated(uint256 oldMaxPerTx, uint256 newMaxPerTx);
    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event BaseURIUpdated(string oldURI, string newURI);
    event ContractURIUpdated(string oldURI, string newURI);
    event SaleActiveUpdated(bool active);
    event AuthorizedMinterUpdated(address indexed minter, bool allowed);
    event QuoteSignerUpdated(address oldSigner, address newSigner);
    event UsdcTokenUpdated(address oldToken, address newToken);
    event CopTokenUpdated(address oldToken, address newToken);
    event RoyaltyUpdated(address receiver, uint16 bps);
    event BridgeFeeUpdated(uint256 oldFeeWei, uint256 newFeeWei);
    event LevelUpgraded(
        uint256 indexed tokenId,
        uint8 oldLevel,
        uint8 newLevel,
        address indexed payer,
        address paymentToken,
        uint256 priceUnits
    );
    event BridgeMint(uint256 indexed tokenId, address indexed to, uint8 level, bytes32 indexed sourceRef);
    event BridgeBurn(uint256 indexed tokenId, address indexed owner, uint8 level, uint256 destinationChainId);
    event BridgeFeePaid(address indexed payer, uint256 indexed tokenId, uint256 destinationChainId, uint256 amount);

    modifier onlyOwnerOrMinter() {
        require(owner() == msg.sender || authorizedMinters[msg.sender], "Not minter");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory collectionName,
        string memory collectionSymbol,
        address initialOwner,
        string memory initialBaseURI,
        string memory initialContractURI,
        uint256 initialMaxSupply,
        uint256 initialMaxPerTx,
        uint256 initialMintPrice,
        address signer,
        address usdc,
        address cop,
        address royaltyTo,
        uint16 royaltyBpsParam,
        string memory eip712Name,
        string memory eip712Version
    ) public initializer {
        require(bytes(collectionName).length > 0, "Bad name");
        require(bytes(collectionSymbol).length > 0, "Bad symbol");
        require(initialOwner != address(0), "Zero owner");
        require(initialMaxSupply > 0, "Bad supply");
        require(initialMaxPerTx > 0, "Bad max per tx");
        require(signer != address(0), "Zero signer");
        require(royaltyTo != address(0), "Zero royalty");
        require(royaltyBpsParam <= 1000, "Royalty cap 10%");

        __ERC721_init(collectionName, collectionSymbol);
        __Ownable_init(initialOwner);
        __Pausable_init();
        __UpgradeableReentrancyGuard_init();
        __EIP712_init(eip712Name, eip712Version);

        baseTokenURI = initialBaseURI;
        contractMetadataURI = initialContractURI;
        maxSupply = initialMaxSupply;
        maxPerTx = initialMaxPerTx;
        mintPrice = initialMintPrice;
        saleActive = false;
        quoteSigner = signer;
        usdcToken = usdc;
        copToken = cop;
        royaltyReceiver = royaltyTo;
        royaltyBps = royaltyBpsParam;

        _pause();

        emit QuoteSignerUpdated(address(0), signer);
        emit UsdcTokenUpdated(address(0), usdc);
        emit CopTokenUpdated(address(0), cop);
        emit RoyaltyUpdated(royaltyTo, royaltyBpsParam);
    }

    function mint(uint256 quantity) external payable nonReentrant whenNotPaused {
        require(saleActive, "Sale inactive");
        require(quantity > 0 && quantity <= maxPerTx, "Bad quantity");
        require(totalMinted + quantity <= maxSupply, "Sold out");
        require(msg.value == mintPrice * quantity, "Wrong ETH value");
        _mintBatch(msg.sender, quantity);
    }

    function adminMint(address to, uint256 quantity) external onlyOwnerOrMinter {
        require(to != address(0), "Zero address");
        require(quantity > 0 && quantity <= maxPerTx, "Bad quantity");
        require(totalMinted + quantity <= maxSupply, "Sold out");
        _mintBatch(to, quantity);
    }

    function upgradeToken(
        uint256 tokenId,
        uint8 newLevel,
        address paymentToken,
        uint256 priceUnits,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        require(block.timestamp <= deadline, "Quote expired");
        require(!usedUpgradeNonces[nonce], "Nonce used");
        require(ownerOf(tokenId) == msg.sender, "Not owner");

        uint8 current = getLevel(tokenId);
        require(newLevel == current + 1, "Must upgrade by 1");
        require(newLevel <= MAX_LEVEL, "Max level");

        bytes32 structHash = keccak256(abi.encode(
            UPGRADE_QUOTE_TYPEHASH,
            msg.sender,
            tokenId,
            newLevel,
            paymentToken,
            priceUnits,
            nonce,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        require(ECDSA.recover(digest, signature) == quoteSigner, "Bad signer");

        usedUpgradeNonces[nonce] = true;
        _collectPayment(paymentToken, priceUnits);

        _tokenLevelRaw[tokenId] = newLevel;
        emit LevelUpgraded(tokenId, current, newLevel, msg.sender, paymentToken, priceUnits);
        emit MetadataUpdate(tokenId);
    }

    function bridgeMint(
        address to,
        uint8 level,
        bytes32 sourceRef,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        require(to != address(0), "Zero to");
        require(level >= 1 && level <= MAX_LEVEL, "Bad level");
        require(block.timestamp <= deadline, "Receipt expired");
        require(!usedBridgeRefs[sourceRef], "Already bridged");

        bytes32 structHash = keccak256(abi.encode(
            BRIDGE_RECEIPT_TYPEHASH,
            to,
            level,
            sourceRef,
            block.chainid,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        require(ECDSA.recover(digest, signature) == quoteSigner, "Bad signer");

        usedBridgeRefs[sourceRef] = true;
        totalMinted += 1;
        uint256 newId = totalMinted;
        _safeMint(to, newId);
        if (level > 1) _tokenLevelRaw[newId] = level;
        emit BridgeMint(newId, to, level, sourceRef);
    }

    function bridgeBurn(uint256 tokenId, uint256 destinationChainId) external payable nonReentrant whenNotPaused {
        require(destinationChainId != 0, "Bad dest chain");
        require(destinationChainId != block.chainid, "Same-chain bridge");
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(msg.value >= bridgeFeeWei, "Bridge fee too low");

        uint8 level = getLevel(tokenId);
        _burn(tokenId);
        totalBurned += 1;
        if (msg.value > 0) emit BridgeFeePaid(msg.sender, tokenId, destinationChainId, msg.value);
        emit BridgeBurn(tokenId, msg.sender, level, destinationChainId);
    }

    function getLevel(uint256 tokenId) public view returns (uint8) {
        _requireOwned(tokenId);
        uint8 raw = _tokenLevelRaw[tokenId];
        return raw == 0 ? 1 : raw;
    }

    function tokenLevel(uint256 tokenId) external view returns (uint8) {
        return getLevel(tokenId);
    }

    function currentSupply() external view returns (uint256) {
        return totalMinted - totalBurned;
    }

    function setAuthorizedMinter(address minter, bool allowed) external onlyOwner {
        require(minter != address(0), "Zero minter");
        authorizedMinters[minter] = allowed;
        emit AuthorizedMinterUpdated(minter, allowed);
    }

    function setMaxSupply(uint256 newMaxSupply) external onlyOwner {
        require(newMaxSupply >= totalMinted, "Below minted");
        require(newMaxSupply > 0, "Bad supply");
        emit MaxSupplyUpdated(maxSupply, newMaxSupply);
        maxSupply = newMaxSupply;
    }

    function setMaxPerTx(uint256 newMaxPerTx) external onlyOwner {
        require(newMaxPerTx > 0, "Bad max per tx");
        emit MaxPerTxUpdated(maxPerTx, newMaxPerTx);
        maxPerTx = newMaxPerTx;
    }

    function setMintPrice(uint256 newPrice) external onlyOwner {
        emit MintPriceUpdated(mintPrice, newPrice);
        mintPrice = newPrice;
    }

    function setSaleActive(bool active) external onlyOwner {
        saleActive = active;
        emit SaleActiveUpdated(active);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        emit BaseURIUpdated(baseTokenURI, newBaseURI);
        baseTokenURI = newBaseURI;
    }

    function setContractURI(string calldata newContractURI) external onlyOwner {
        emit ContractURIUpdated(contractMetadataURI, newContractURI);
        contractMetadataURI = newContractURI;
    }

    function setQuoteSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Zero signer");
        emit QuoteSignerUpdated(quoteSigner, newSigner);
        quoteSigner = newSigner;
    }

    function setUsdcToken(address newToken) external onlyOwner {
        emit UsdcTokenUpdated(usdcToken, newToken);
        usdcToken = newToken;
    }

    function setCopToken(address newToken) external onlyOwner {
        emit CopTokenUpdated(copToken, newToken);
        copToken = newToken;
    }

    function setRoyalty(address receiver, uint16 bps) external onlyOwner {
        require(receiver != address(0), "Zero royalty");
        require(bps <= 1000, "Royalty cap 10%");
        royaltyReceiver = receiver;
        royaltyBps = bps;
        emit RoyaltyUpdated(receiver, bps);
    }

    function setBridgeFeeWei(uint256 newFeeWei) external onlyOwner {
        emit BridgeFeeUpdated(bridgeFeeWei, newFeeWei);
        bridgeFeeWei = newFeeWei;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw() external onlyOwner nonReentrant {
        uint256 amount = address(this).balance;
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "Withdraw failed");
    }

    function rescueToken(address token) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner(), IERC20(token).balanceOf(address(this)));
    }

    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        return (royaltyReceiver, (salePrice * royaltyBps) / 10_000);
    }

    function contractURI() external view returns (string memory) {
        return contractMetadataURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(baseTokenURI, tokenId.toString());
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721Upgradeable, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IERC2981).interfaceId ||
            interfaceId == bytes4(0x49064906) ||
            super.supportsInterface(interfaceId);
    }

    function _mintBatch(address to, uint256 quantity) private {
        for (uint256 i = 0; i < quantity; i++) {
            totalMinted += 1;
            _safeMint(to, totalMinted);
        }
    }

    function _collectPayment(address paymentToken, uint256 priceUnits) private {
        if (paymentToken == address(0)) {
            require(msg.value == priceUnits, "Wrong ETH amount");
            return;
        }
        require(paymentToken == usdcToken || paymentToken == copToken, "Bad payment token");
        require(msg.value == 0, "No ETH for ERC-20 pay");
        IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), priceUnits);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    receive() external payable {}

    uint256[40] private __gap;
}
