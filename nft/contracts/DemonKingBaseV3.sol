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

/// @title DemonKingBaseV3
/// @notice UUPS upgrade of V2 adding: per-token level (1/2/3), upgrade entry,
///         cross-chain bridge mint/burn, EIP-2981 royalty, EIP-4906 metadata
///         updates. Storage layout strictly appends to V2; existing tokens
///         continue to work without any state migration.
contract DemonKingBaseV3 is
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

    // =====================================================================
    // V2 storage (MUST stay in this order — these are slot-position-locked).
    // =====================================================================
    uint256 public maxSupply;                          // slot N+0
    uint256 public maxPerTx;                           // slot N+1
    uint256 public mintPrice;                          // slot N+2
    uint256 public totalMinted;                        // slot N+3
    bool public saleActive;                            // slot N+4
    string private baseTokenURI;                       // slot N+5
    string public contractMetadataURI;                 // slot N+6
    mapping(address => bool) public authorizedMinters; // slot N+7

    // =====================================================================
    // V3 storage (appended — consumes V2's __gap[42]).
    //
    // Slot accounting (relative to V2's __gap base):
    //   gap[0]  → _tokenLevelRaw     (mapping pointer, 1 slot)
    //   gap[1]  → usedUpgradeNonces  (mapping pointer, 1 slot)
    //   gap[2]  → usedBridgeRefs     (mapping pointer, 1 slot)
    //   gap[3]  → quoteSigner        (address, 1 slot — pads to 32)
    //   gap[4]  → usdcToken          (address, 1 slot)
    //   gap[5]  → copToken           (address, 1 slot)
    //   gap[6]  → royaltyReceiver + royaltyBps (packed, 1 slot)
    //   gap[7]  -> totalBurned        (uint256, 1 slot)
    //   gap[8]  -> bridgeFeeWei       (uint256, 1 slot)
    //   gap[9..41] -> __gap_v3[33]    (remaining buffer for V4+)
    // =====================================================================
    mapping(uint256 => uint8) private _tokenLevelRaw;
    mapping(bytes32 => bool) public usedUpgradeNonces;
    mapping(bytes32 => bool) public usedBridgeRefs;
    address public quoteSigner;
    address public usdcToken;
    address public copToken;
    address public royaltyReceiver;
    uint16 public royaltyBps;
    // Tracks tokens removed via bridgeBurn so the off-chain global supply
    // counter (sum of `currentSupply()` across chains) stays net-zero on a
    // bridge round-trip. totalMinted intentionally never decrements — it's
    // the lifetime mint counter AND the next-tokenId source, so altering it
    // would let a future mint collide with a burned token's ID.
    uint256 public totalBurned;
    uint256 public bridgeFeeWei;
    uint256[33] private __gap_v3;

    // =====================================================================
    // Constants
    // =====================================================================
    uint8 public constant MAX_LEVEL = 3;
    uint256 public constant BASE_CHAIN_ID = 8453;

    bytes32 private constant UPGRADE_QUOTE_TYPEHASH = keccak256(
        "UpgradeQuote(address owner,uint256 tokenId,uint8 newLevel,address paymentToken,uint256 priceUnits,bytes32 nonce,uint256 deadline)"
    );
    bytes32 private constant BRIDGE_RECEIPT_TYPEHASH = keccak256(
        "BridgeReceipt(address to,uint8 level,bytes32 sourceRef,uint256 destinationChainId,uint256 deadline)"
    );

    // =====================================================================
    // Events (V2 carry-overs + V3 additions)
    // =====================================================================
    event MaxSupplyUpdated(uint256 oldSupply, uint256 newSupply);
    event MaxPerTxUpdated(uint256 oldMaxPerTx, uint256 newMaxPerTx);
    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event BaseURIUpdated(string oldURI, string newURI);
    event ContractURIUpdated(string oldURI, string newURI);
    event SaleActiveUpdated(bool active);
    event AuthorizedMinterUpdated(address indexed minter, bool allowed);

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
    event BridgeFeeUpdated(uint256 oldFeeWei, uint256 newFeeWei);
    event QuoteSignerUpdated(address oldSigner, address newSigner);
    event RoyaltyUpdated(address receiver, uint16 bps);
    event UsdcTokenUpdated(address oldToken, address newToken);
    event CopTokenUpdated(address oldToken, address newToken);

    // =====================================================================
    // Modifiers
    // =====================================================================
    modifier onlyOwnerOrMinter() {
        require(owner() == msg.sender || authorizedMinters[msg.sender], "Not minter");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // =====================================================================
    // Fresh-proxy initializer for new chains that did not have a V2 proxy.
    // Combines V2's initialize + reinitializeV3 in a single call, so the
    // standard deploy-and-init-via-proxy pattern works without two steps.
    // Locked to `initializer` (first-time), so it cannot run on a V2-upgraded
    // proxy — those go through reinitializeV3 instead.
    // =====================================================================
    function initializeV3Fresh(
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
        require(initialOwner != address(0), "Zero owner");
        require(initialMaxSupply > 0, "Bad supply");
        require(initialMaxPerTx > 0, "Bad max per tx");
        require(signer != address(0), "Zero signer");
        require(royaltyTo != address(0), "Zero royalty");
        require(royaltyBpsParam <= 1000, "Royalty cap 10%");

        __ERC721_init("Demon King", "DMNK");
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

    // =====================================================================
    // V3 one-shot reinitializer. Owner calls this once via the proxy after
    // upgradeToAndCall(newImpl, abi.encodeWithSelector(reinitializeV3.selector, ...)).
    // reinitializer(3) blocks any replay.
    // =====================================================================
    function reinitializeV3(
        address signer,
        address usdc,
        address cop,
        address royaltyTo,
        uint16 royaltyBpsParam,
        string memory eip712Name,
        string memory eip712Version
    ) external reinitializer(3) onlyOwner {
        require(signer != address(0), "Zero signer");
        require(royaltyTo != address(0), "Zero royalty");
        require(royaltyBpsParam <= 1000, "Royalty cap 10%");

        __EIP712_init(eip712Name, eip712Version);

        quoteSigner = signer;
        usdcToken = usdc;
        copToken = cop;
        royaltyReceiver = royaltyTo;
        royaltyBps = royaltyBpsParam;

        emit QuoteSignerUpdated(address(0), signer);
        emit UsdcTokenUpdated(address(0), usdc);
        emit CopTokenUpdated(address(0), cop);
        emit RoyaltyUpdated(royaltyTo, royaltyBpsParam);
    }

    // =====================================================================
    // Level view. Returns 1 for any minted token that has no explicit level
    // entry (covers all V2-minted tokens at zero storage cost).
    // =====================================================================
    function getLevel(uint256 tokenId) public view returns (uint8) {
        _requireOwned(tokenId);
        uint8 raw = _tokenLevelRaw[tokenId];
        return raw == 0 ? 1 : raw;
    }

    function tokenLevel(uint256 tokenId) external view returns (uint8) {
        return getLevel(tokenId);
    }

    // =====================================================================
    // Upgrade entry — owner pays + EIP-712 quote signed by quoteSigner.
    //
    // paymentToken = address(0) → pay in ETH, msg.value == priceUnits
    // paymentToken = usdcToken or copToken → pull priceUnits via transferFrom
    //
    // Phase 1: server signs after verifying ownership + freshness only.
    // Phase B: server also verifies battle-win threshold before signing.
    // =====================================================================
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

        if (paymentToken == address(0)) {
            require(msg.value == priceUnits, "Wrong ETH amount");
        } else {
            require(paymentToken == usdcToken || paymentToken == copToken, "Bad payment token");
            require(msg.value == 0, "No ETH for ERC-20 pay");
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), priceUnits);
        }

        _tokenLevelRaw[tokenId] = newLevel;
        emit LevelUpgraded(tokenId, current, newLevel, msg.sender, paymentToken, priceUnits);
        emit MetadataUpdate(tokenId);
    }

    // =====================================================================
    // Bridge mint (destination chain, e.g. Base).
    // This path deliberately does not enforce this chain's maxSupply. Base
    // can be the marketplace hub and temporarily hold every NFT from the
    // mesh even if its original sale cap was lower than the global cap.
    // Supply integrity comes from the trusted receipt signer verifying a
    // real source burn plus usedBridgeRefs replay protection; maxSupply
    // remains the primary sale/admin-mint ceiling only.
    // Mints a new tokenId for `to` at the receipt's level. sourceRef is the
    // replay nonce — keccak256 of (source chain, source contract, source id).
    // =====================================================================
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

        // BridgeReceipt is bound to THIS chain's chainId — receipts signed
        // for a different destination chain fail signature recovery here.
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

    // =====================================================================
    // Bridge burn (source chain → any destination chain — full mesh).
    // Owner burns their token here; the server's indexer picks up the
    // `BridgeBurn` event, signs a `BridgeReceipt` targeting
    // `destinationChainId`, and the owner calls `bridgeMint` on the dest
    // chain to mint a fresh NFT at the same level. Same-chain "bridges"
    // are rejected (just transfer instead).
    // =====================================================================
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

    // Live token count on THIS chain: lifetime mints minus tokens removed
    // via bridgeBurn. The server sums currentSupply() across all chains
    // for the displayed "X / 500 minted" so a bridged NFT contributes +1
    // on dest and -1 on source, leaving the global count stable.
    function currentSupply() external view returns (uint256) {
        return totalMinted - totalBurned;
    }

    // =====================================================================
    // V2 carry-over functions (UNCHANGED from V2)
    // =====================================================================
    function mint(uint256 quantity) external payable nonReentrant whenNotPaused {
        require(saleActive, "Sale inactive");
        require(quantity > 0 && quantity <= maxPerTx, "Bad quantity");
        require(totalMinted + quantity <= maxSupply, "Sold out");
        uint256 requiredValue = mintPrice * quantity;
        require(msg.value == requiredValue, "Wrong ETH value");
        _mintBatch(msg.sender, quantity);
    }

    function adminMint(address to, uint256 quantity) external onlyOwnerOrMinter {
        require(to != address(0), "Zero address");
        require(quantity > 0 && quantity <= maxPerTx, "Bad quantity");
        require(totalMinted + quantity <= maxSupply, "Sold out");
        _mintBatch(to, quantity);
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

    // =====================================================================
    // V3 admin setters
    // =====================================================================
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
        require(receiver != address(0), "Zero receiver");
        require(bps <= 1000, "Royalty cap 10%");
        royaltyReceiver = receiver;
        royaltyBps = bps;
        emit RoyaltyUpdated(receiver, bps);
    }

    function setBridgeFeeWei(uint256 newFeeWei) external onlyOwner {
        emit BridgeFeeUpdated(bridgeFeeWei, newFeeWei);
        bridgeFeeWei = newFeeWei;
    }

    // =====================================================================
    // EIP-2981 royalty
    // =====================================================================
    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        return (royaltyReceiver, (salePrice * royaltyBps) / 10_000);
    }

    // =====================================================================
    // Views
    // =====================================================================
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
        // EIP-4906's interfaceId is *defined by the EIP itself* as 0x49064906
        // (XOR of the two event selectors). Solidity's `type(I).interfaceId`
        // only XORs function selectors — IERC4906 has none — so it would
        // evaluate to 0x00000000. We hardcode the EIP's declared value.
        return
            interfaceId == type(IERC2981).interfaceId ||
            interfaceId == bytes4(0x49064906) ||
            super.supportsInterface(interfaceId);
    }

    // =====================================================================
    // Internals
    // =====================================================================
    function _mintBatch(address to, uint256 quantity) private {
        for (uint256 i = 0; i < quantity; i++) {
            totalMinted += 1;
            _safeMint(to, totalMinted);
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    receive() external payable {}
}
