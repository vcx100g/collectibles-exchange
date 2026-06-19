// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IMarketplace {
    function buyItem(address nft, uint256 tokenId) external payable;
}

/// @notice Test-only malicious buyer that tries to RE-ENTER buyItem from inside
///         the ERC-721 `onERC721Received` callback (which fires mid-purchase
///         during safeTransferFrom). Used to prove the ReentrancyGuard +
///         checks-effects-interactions ordering blocks the attack.
contract ReentrantBuyer is IERC721Receiver {
    IMarketplace public immutable market;
    address public nft;
    uint256 public tokenId;
    bool public reenteredOnce;
    bool public reentryWasBlocked;

    constructor(address _market) {
        market = IMarketplace(_market);
    }

    function attack(address _nft, uint256 _tokenId) external payable {
        nft = _nft;
        tokenId = _tokenId;
        market.buyItem{value: msg.value}(_nft, _tokenId);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        returns (bytes4)
    {
        if (!reenteredOnce) {
            reenteredOnce = true;
            // Attempt to buy the same item again, re-entering mid-transfer.
            try market.buyItem{value: 0}(nft, tokenId) {
                reentryWasBlocked = false; // attack succeeded (bad!)
            } catch {
                reentryWasBlocked = true; // guard / CEI rejected it (good)
            }
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}
