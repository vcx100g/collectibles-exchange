// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title Marketplace
/// @notice A minimal, NON-CUSTODIAL marketplace for ERC-721 collectibles.
///         The seller keeps the NFT in their own wallet and grants this
///         contract approval; the contract only moves the NFT at the moment of
///         sale. Every sale is split three ways: platform fee -> creator
///         royalty (ERC-2981) -> seller. All payouts are pull-based.
/// @dev    Security: ReentrancyGuard + checks-effects-interactions on buyItem,
///         pull-over-push proceeds, OpenZeppelin Pausable emergency stop,
///         Ownable admin. The full buy/sell HISTORY is emitted as events
///         (ItemListed / ItemBought / ...) for an indexer / the frontend to
///         reconstruct provenance.
contract Marketplace is ReentrancyGuard, Ownable, Pausable {
    struct Listing {
        uint256 price; // in wei; 0 means "not listed"
        address seller;
    }

    // nftContract => tokenId => Listing
    mapping(address => mapping(uint256 => Listing)) private _listings;
    // beneficiary => withdrawable wei (sellers, creators, platform, refunds)
    mapping(address => uint256) private _proceeds;

    /// @notice Platform trading fee in basis points (250 = 2.5%).
    uint96 public platformFeeBps;
    /// @notice Where the platform fee accrues (withdrawable via withdrawProceeds).
    address public feeRecipient;
    /// @notice Hard cap so the admin can never set an abusive fee.
    uint96 public constant MAX_FEE_BPS = 1000; // 10%

    event ItemListed(address indexed seller, address indexed nft, uint256 indexed tokenId, uint256 price);
    event ItemUpdated(address indexed seller, address indexed nft, uint256 indexed tokenId, uint256 newPrice);
    event ItemCanceled(address indexed seller, address indexed nft, uint256 indexed tokenId);
    event ItemBought(
        address indexed buyer,
        address indexed nft,
        uint256 indexed tokenId,
        uint256 price,
        address seller,
        uint256 platformFee,
        uint256 royalty,
        address royaltyReceiver
    );
    event ProceedsWithdrawn(address indexed who, uint256 amount);
    event PlatformFeeUpdated(uint96 newFeeBps, address newRecipient);

    error PriceMustBeAboveZero();
    error NotApprovedForMarketplace();
    error NotItemOwner();
    error AlreadyListed();
    error NotListed();
    error PriceNotMet(uint256 price, uint256 sent);
    error NoProceeds();
    error FeeTooHigh();
    error TransferFailed();

    constructor(address initialOwner, address _feeRecipient, uint96 _platformFeeBps)
        Ownable(initialOwner)
    {
        if (_platformFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeRecipient = _feeRecipient;
        platformFeeBps = _platformFeeBps;
    }

    modifier isItemOwner(address nft, uint256 tokenId) {
        if (IERC721(nft).ownerOf(tokenId) != msg.sender) revert NotItemOwner();
        _;
    }

    // ----------------------------- listing -----------------------------

    /// @notice List an owned NFT for sale. Requires the caller to have first
    ///         approved this marketplace on the NFT contract
    ///         (setApprovalForAll or per-token approve).
    function listItem(address nft, uint256 tokenId, uint256 price)
        external
        whenNotPaused
        isItemOwner(nft, tokenId)
    {
        if (price == 0) revert PriceMustBeAboveZero();
        if (_listings[nft][tokenId].price != 0) revert AlreadyListed();
        if (
            IERC721(nft).getApproved(tokenId) != address(this) &&
            !IERC721(nft).isApprovedForAll(msg.sender, address(this))
        ) revert NotApprovedForMarketplace();

        _listings[nft][tokenId] = Listing({price: price, seller: msg.sender});
        emit ItemListed(msg.sender, nft, tokenId, price);
    }

    function updateListing(address nft, uint256 tokenId, uint256 newPrice)
        external
        whenNotPaused
        isItemOwner(nft, tokenId)
    {
        if (newPrice == 0) revert PriceMustBeAboveZero();
        if (_listings[nft][tokenId].price == 0) revert NotListed();
        _listings[nft][tokenId].price = newPrice;
        emit ItemUpdated(msg.sender, nft, tokenId, newPrice);
    }

    function cancelListing(address nft, uint256 tokenId)
        external
        isItemOwner(nft, tokenId)
    {
        if (_listings[nft][tokenId].price == 0) revert NotListed();
        delete _listings[nft][tokenId];
        emit ItemCanceled(msg.sender, nft, tokenId);
    }

    // ------------------------------ buying ------------------------------

    /// @notice Buy a listed item. Splits the price into platform fee + creator
    ///         royalty + seller proceeds (all credited for pull withdrawal).
    ///         Any overpayment is credited back to the buyer's proceeds.
    function buyItem(address nft, uint256 tokenId)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        Listing memory item = _listings[nft][tokenId];
        if (item.price == 0) revert NotListed();
        if (msg.value < item.price) revert PriceNotMet(item.price, msg.value);

        // EFFECTS: clear the listing before any external interaction.
        delete _listings[nft][tokenId];

        uint256 price = item.price;
        uint256 platformFee = (price * platformFeeBps) / 10_000;

        // Read creator royalty via ERC-2981, defensively (NFT may not support it).
        uint256 royaltyAmount;
        address royaltyReceiver;
        try IERC2981(nft).royaltyInfo(tokenId, price) returns (address rcv, uint256 amt) {
            if (rcv != address(0) && amt > 0 && (amt + platformFee) <= price) {
                royaltyReceiver = rcv;
                royaltyAmount = amt;
            }
        } catch {}

        uint256 sellerProceeds = price - platformFee - royaltyAmount;

        if (platformFee > 0) _proceeds[feeRecipient] += platformFee;
        if (royaltyAmount > 0) _proceeds[royaltyReceiver] += royaltyAmount;
        _proceeds[item.seller] += sellerProceeds;

        // Credit any overpayment back to the buyer (pull-based, no extra call).
        if (msg.value > price) {
            _proceeds[msg.sender] += (msg.value - price);
        }

        emit ItemBought(
            msg.sender, nft, tokenId, price, item.seller, platformFee, royaltyAmount, royaltyReceiver
        );

        // INTERACTION: move the NFT last.
        IERC721(nft).safeTransferFrom(item.seller, msg.sender, tokenId);
    }

    /// @notice Withdraw everything owed to the caller (seller proceeds, royalty,
    ///         platform fees, or buyer refunds).
    function withdrawProceeds() external nonReentrant {
        uint256 amount = _proceeds[msg.sender];
        if (amount == 0) revert NoProceeds();
        _proceeds[msg.sender] = 0; // zero BEFORE sending
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit ProceedsWithdrawn(msg.sender, amount);
    }

    // ------------------------------ admin -------------------------------

    function setPlatformFee(uint96 _platformFeeBps, address _feeRecipient) external onlyOwner {
        if (_platformFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        platformFeeBps = _platformFeeBps;
        feeRecipient = _feeRecipient;
        emit PlatformFeeUpdated(_platformFeeBps, _feeRecipient);
    }

    /// @notice Emergency stop: blocks listing / updating / buying.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ------------------------------ views -------------------------------

    function getListing(address nft, uint256 tokenId) external view returns (Listing memory) {
        return _listings[nft][tokenId];
    }

    function getProceeds(address account) external view returns (uint256) {
        return _proceeds[account];
    }
}
