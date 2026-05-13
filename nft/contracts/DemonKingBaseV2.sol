// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {UpgradeableReentrancyGuard} from "./UpgradeableReentrancyGuard.sol";

contract DemonKingBaseV2 is
    Initializable,
    ERC721Upgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UpgradeableReentrancyGuard,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;
    using Strings for uint256;

    uint256 public maxSupply;
    uint256 public maxPerTx;
    uint256 public mintPrice;
    uint256 public totalMinted;
    bool public saleActive;

    string private baseTokenURI;
    string public contractMetadataURI;

    mapping(address => bool) public authorizedMinters;

    event MaxSupplyUpdated(uint256 oldSupply, uint256 newSupply);
    event MaxPerTxUpdated(uint256 oldMaxPerTx, uint256 newMaxPerTx);
    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event BaseURIUpdated(string oldURI, string newURI);
    event ContractURIUpdated(string oldURI, string newURI);
    event SaleActiveUpdated(bool active);
    event AuthorizedMinterUpdated(address indexed minter, bool allowed);

    modifier onlyOwnerOrMinter() {
        require(owner() == msg.sender || authorizedMinters[msg.sender], "Not minter");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        string memory initialBaseURI,
        string memory initialContractURI,
        uint256 initialMaxSupply,
        uint256 initialMaxPerTx,
        uint256 initialMintPrice
    ) public initializer {
        require(initialOwner != address(0), "Zero owner");
        require(initialMaxSupply > 0, "Bad supply");
        require(initialMaxPerTx > 0, "Bad max per tx");

        __ERC721_init("Demon King", "DMNK");
        __Ownable_init(initialOwner);
        __Pausable_init();
        __UpgradeableReentrancyGuard_init();
        baseTokenURI = initialBaseURI;
        contractMetadataURI = initialContractURI;
        maxSupply = initialMaxSupply;
        maxPerTx = initialMaxPerTx;
        mintPrice = initialMintPrice;
        saleActive = false;
        _pause();
    }

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

    function _mintBatch(address to, uint256 quantity) private {
        for (uint256 i = 0; i < quantity; i++) {
            totalMinted += 1;
            _safeMint(to, totalMinted);
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    receive() external payable {}

    uint256[42] private __gap;
}
