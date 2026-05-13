// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract DemonKingBase is ERC721, Ownable, Pausable, ReentrancyGuard {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 250;
    uint256 public constant MAX_PER_TX = 10;

    uint256 public mintPrice;
    uint256 public totalMinted;
    bool public saleActive;

    string private baseTokenURI;
    string public contractMetadataURI;

    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event BaseURIUpdated(string oldURI, string newURI);
    event ContractURIUpdated(string oldURI, string newURI);
    event SaleActiveUpdated(bool active);

    constructor(
        address initialOwner,
        string memory initialBaseURI,
        string memory initialContractURI,
        uint256 initialMintPrice
    ) ERC721("Demon King", "DMNK") Ownable(initialOwner) {
        baseTokenURI = initialBaseURI;
        contractMetadataURI = initialContractURI;
        mintPrice = initialMintPrice;
        saleActive = false;
        _pause();
    }

    function mint(uint256 quantity) external payable nonReentrant whenNotPaused {
        require(saleActive, "Sale inactive");
        require(quantity > 0 && quantity <= MAX_PER_TX, "Bad quantity");
        require(totalMinted + quantity <= MAX_SUPPLY, "Sold out");

        uint256 requiredValue = mintPrice * quantity;
        require(msg.value == requiredValue, "Wrong ETH value");

        _mintBatch(msg.sender, quantity);
    }

    function adminMint(address to, uint256 quantity) external onlyOwner {
        require(to != address(0), "Zero address");
        require(quantity > 0, "Bad quantity");
        require(totalMinted + quantity <= MAX_SUPPLY, "Sold out");
        _mintBatch(to, quantity);
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

    function withdraw(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "Zero address");
        uint256 amount = address(this).balance;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Withdraw failed");
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
}
