// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Collectible
/// @notice A generic 1-of-1 collectible NFT. Each token represents one unique
///         item (a trading card, a piece of digital art, a wine bottle, an
///         antique, ...). The item *category* and all attributes live in the
///         off-chain metadata JSON pointed to by the token URI, so the SAME
///         contract works for every asset type with no code change.
/// @dev    OpenZeppelin Contracts v5. Combines ERC721 + Enumerable (so a wallet
///         can list the tokens it owns) + URIStorage (per-token metadata) +
///         ERC2981 (creator royalty). The multi-inheritance overrides at the
///         bottom are mandatory in v5 and are exactly what old (v4/2020)
///         tutorials get wrong.
contract Collectible is ERC721, ERC721Enumerable, ERC721URIStorage, ERC2981, Ownable {
    uint256 private _nextTokenId;

    /// @notice The original minter of each token (its "creator"), kept for
    ///         provenance display and royalty attribution.
    mapping(uint256 => address) public creatorOf;

    /// @notice Royalty charged to the creator on secondary sales, in basis
    ///         points (500 = 5%). ERC-2981 is advisory: marketplaces read it,
    ///         our Marketplace honours it.
    uint96 public constant CREATOR_ROYALTY_BPS = 500;

    event ItemMinted(uint256 indexed tokenId, address indexed creator, string tokenURI);

    constructor(address initialOwner)
        ERC721("Collectible", "COLL")
        Ownable(initialOwner)
    {
        // A sensible default; every minted token also gets a per-token royalty
        // pointing at its own creator (see mintItem).
        _setDefaultRoyalty(initialOwner, CREATOR_ROYALTY_BPS);
    }

    /// @notice Mint a new collectible to the caller. Open to anyone for the
    ///         demo so any test account can create and then trade an item.
    /// @param uri The token metadata URI (e.g. https://host/metadata/1.json).
    /// @return tokenId The id of the freshly minted token.
    function mintItem(string memory uri) public returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);
        creatorOf[tokenId] = msg.sender;
        // Royalty on every future sale goes to whoever first minted this item.
        _setTokenRoyalty(tokenId, msg.sender, CREATOR_ROYALTY_BPS);
        emit ItemMinted(tokenId, msg.sender, uri);
        return tokenId;
    }

    /// @notice Total number of items ever minted (also the next token id).
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    // ------------------------------------------------------------------
    // Required overrides for OZ v5 multiple inheritance.
    // ------------------------------------------------------------------

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
