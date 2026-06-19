import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const ONE_ETH = ethers.parseEther("1");

// Deploy the on-chain core and hand back labelled signers.
//   owner   = deployer, contract owner, platform fee recipient
//   creator = mints the item (receives the 5% creator royalty)
//   seller  = current holder who lists the item
//   buyer   = purchases the item
async function deployFixture() {
  const [owner, creator, seller, buyer] = await ethers.getSigners();

  const collectible = await ethers.deployContract("Collectible", [owner.address]);
  const marketplace = await ethers.deployContract("Marketplace", [
    owner.address,
    owner.address, // fee recipient
    250n, // 2.5% platform fee
  ]);

  return { owner, creator, seller, buyer, collectible, marketplace };
}

// Mint an item from `creator`, move it to `seller`, and approve the marketplace.
async function listedItemFixture() {
  const base = await deployFixture();
  const { collectible, marketplace, creator, seller } = base;

  await collectible.connect(creator).mintItem("https://host/metadata/0.json");
  const tokenId = 0n;
  // creator hands the card to the seller (e.g. a prior private transfer)
  await collectible.connect(creator).transferFrom(creator.address, seller.address, tokenId);
  // seller approves the marketplace once, then lists at 1 ETH
  await collectible.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
  await marketplace.connect(seller).listItem(await collectible.getAddress(), tokenId, ONE_ETH);

  return { ...base, tokenId };
}

describe("Collectible (ERC-721)", () => {
  it("mints to the caller, stores the URI, creator and royalty", async () => {
    const { collectible, creator } = await networkHelpers.loadFixture(deployFixture);

    await expect(collectible.connect(creator).mintItem("ipfs://card1"))
      .to.emit(collectible, "ItemMinted")
      .withArgs(0n, creator.address, "ipfs://card1");

    expect(await collectible.ownerOf(0n)).to.equal(creator.address);
    expect(await collectible.tokenURI(0n)).to.equal("ipfs://card1");
    expect(await collectible.creatorOf(0n)).to.equal(creator.address);
    expect(await collectible.totalMinted()).to.equal(1n);

    // ERC-2981: 5% royalty to the creator
    const [receiver, amount] = await collectible.royaltyInfo(0n, ONE_ETH);
    expect(receiver).to.equal(creator.address);
    expect(amount).to.equal(ethers.parseEther("0.05"));
  });

  it("lets a wallet enumerate the tokens it owns", async () => {
    const { collectible, creator } = await networkHelpers.loadFixture(deployFixture);
    await collectible.connect(creator).mintItem("a");
    await collectible.connect(creator).mintItem("b");
    expect(await collectible.balanceOf(creator.address)).to.equal(2n);
    expect(await collectible.tokenOfOwnerByIndex(creator.address, 1n)).to.equal(1n);
  });

  it("advertises the ERC-721, Enumerable, URIStorage and ERC-2981 interfaces", async () => {
    const { collectible } = await networkHelpers.loadFixture(deployFixture);
    expect(await collectible.supportsInterface("0x80ac58cd")).to.equal(true); // ERC721
    expect(await collectible.supportsInterface("0x780e9d63")).to.equal(true); // Enumerable
    expect(await collectible.supportsInterface("0x2a55205a")).to.equal(true); // ERC2981
  });
});

describe("Marketplace — listing", () => {
  it("reverts when the seller has not approved the marketplace", async () => {
    const { collectible, marketplace, creator } = await networkHelpers.loadFixture(deployFixture);
    await collectible.connect(creator).mintItem("x");
    await expect(
      marketplace.connect(creator).listItem(await collectible.getAddress(), 0n, ONE_ETH),
    ).to.be.revertedWithCustomError(marketplace, "NotApprovedForMarketplace");
  });

  it("reverts when a non-owner tries to list", async () => {
    const { collectible, marketplace, creator, buyer } =
      await networkHelpers.loadFixture(deployFixture);
    await collectible.connect(creator).mintItem("x");
    await expect(
      marketplace.connect(buyer).listItem(await collectible.getAddress(), 0n, ONE_ETH),
    ).to.be.revertedWithCustomError(marketplace, "NotItemOwner");
  });

  it("reverts on a zero price", async () => {
    const { collectible, marketplace, creator } = await networkHelpers.loadFixture(deployFixture);
    await collectible.connect(creator).mintItem("x");
    await collectible.connect(creator).setApprovalForAll(await marketplace.getAddress(), true);
    await expect(
      marketplace.connect(creator).listItem(await collectible.getAddress(), 0n, 0n),
    ).to.be.revertedWithCustomError(marketplace, "PriceMustBeAboveZero");
  });

  it("lists, updates and cancels", async () => {
    const { collectible, marketplace, seller, tokenId } =
      await networkHelpers.loadFixture(listedItemFixture);
    const nft = await collectible.getAddress();

    let listing = await marketplace.getListing(nft, tokenId);
    expect(listing.price).to.equal(ONE_ETH);
    expect(listing.seller).to.equal(seller.address);

    await expect(marketplace.connect(seller).updateListing(nft, tokenId, ethers.parseEther("2")))
      .to.emit(marketplace, "ItemUpdated")
      .withArgs(seller.address, nft, tokenId, ethers.parseEther("2"));

    await expect(marketplace.connect(seller).cancelListing(nft, tokenId))
      .to.emit(marketplace, "ItemCanceled")
      .withArgs(seller.address, nft, tokenId);

    expect((await marketplace.getListing(nft, tokenId)).price).to.equal(0n);
  });
});

describe("Marketplace — buying & the fee split", () => {
  it("transfers the NFT and splits price into platform fee, royalty and seller proceeds", async () => {
    const { collectible, marketplace, owner, creator, seller, buyer, tokenId } =
      await networkHelpers.loadFixture(listedItemFixture);
    const nft = await collectible.getAddress();

    await expect(marketplace.connect(buyer).buyItem(nft, tokenId, { value: ONE_ETH }))
      .to.emit(marketplace, "ItemBought")
      .withArgs(
        buyer.address,
        nft,
        tokenId,
        ONE_ETH,
        seller.address,
        ethers.parseEther("0.025"), // 2.5% platform fee
        ethers.parseEther("0.05"), // 5% creator royalty
        creator.address,
      );

    // ownership moved to the buyer
    expect(await collectible.ownerOf(tokenId)).to.equal(buyer.address);

    // proceeds credited (pull-based)
    expect(await marketplace.getProceeds(owner.address)).to.equal(ethers.parseEther("0.025"));
    expect(await marketplace.getProceeds(creator.address)).to.equal(ethers.parseEther("0.05"));
    expect(await marketplace.getProceeds(seller.address)).to.equal(ethers.parseEther("0.925"));

    // listing cleared
    expect((await marketplace.getListing(nft, tokenId)).price).to.equal(0n);
  });

  it("reverts when payment is below the price", async () => {
    const { collectible, marketplace, buyer, tokenId } =
      await networkHelpers.loadFixture(listedItemFixture);
    await expect(
      marketplace
        .connect(buyer)
        .buyItem(await collectible.getAddress(), tokenId, { value: ethers.parseEther("0.5") }),
    ).to.be.revertedWithCustomError(marketplace, "PriceNotMet");
  });

  it("credits overpayment back to the buyer", async () => {
    const { collectible, marketplace, buyer, tokenId } =
      await networkHelpers.loadFixture(listedItemFixture);
    await marketplace
      .connect(buyer)
      .buyItem(await collectible.getAddress(), tokenId, { value: ethers.parseEther("1.2") });
    expect(await marketplace.getProceeds(buyer.address)).to.equal(ethers.parseEther("0.2"));
  });

  it("pays out proceeds on withdraw", async () => {
    const { collectible, marketplace, seller, buyer, tokenId } =
      await networkHelpers.loadFixture(listedItemFixture);
    await marketplace
      .connect(buyer)
      .buyItem(await collectible.getAddress(), tokenId, { value: ONE_ETH });

    await expect(marketplace.connect(seller).withdrawProceeds()).to.changeEtherBalance(
      ethers,
      seller,
      ethers.parseEther("0.925"),
    );
    await expect(marketplace.connect(seller).withdrawProceeds()).to.be.revertedWithCustomError(
      marketplace,
      "NoProceeds",
    );
  });
});

describe("Marketplace — admin & safety", () => {
  it("only the owner can change the platform fee, and the fee is capped", async () => {
    const { marketplace, owner, buyer } = await networkHelpers.loadFixture(deployFixture);
    await expect(
      marketplace.connect(buyer).setPlatformFee(300n, buyer.address),
    ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    await expect(marketplace.connect(owner).setPlatformFee(1100n, owner.address))
      .to.be.revertedWithCustomError(marketplace, "FeeTooHigh");
    await marketplace.connect(owner).setPlatformFee(500n, owner.address);
    expect(await marketplace.platformFeeBps()).to.equal(500n);
  });

  it("pause() blocks listing and buying", async () => {
    const { collectible, marketplace, owner, buyer, tokenId } =
      await networkHelpers.loadFixture(listedItemFixture);
    await marketplace.connect(owner).pause();
    await expect(
      marketplace.connect(buyer).buyItem(await collectible.getAddress(), tokenId, { value: ONE_ETH }),
    ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
  });

  it("blocks a re-entrant buyer (ReentrancyGuard + checks-effects-interactions)", async () => {
    const { collectible, marketplace, seller } =
      await networkHelpers.loadFixture(deployFixture);
    const nft = await collectible.getAddress();

    // seller mints and lists an item
    await collectible.connect(seller).mintItem("reentrancy");
    await collectible.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    await marketplace.connect(seller).listItem(nft, 0n, ONE_ETH);

    // deploy the malicious buyer and fund it
    const attacker = await ethers.deployContract("ReentrantBuyer", [
      await marketplace.getAddress(),
    ]);

    // the purchase itself succeeds, but the re-entrant call inside the
    // onERC721Received callback is rejected
    await attacker.attack(nft, 0n, { value: ONE_ETH });

    expect(await attacker.reenteredOnce()).to.equal(true);
    expect(await attacker.reentryWasBlocked()).to.equal(true);
    expect(await collectible.ownerOf(0n)).to.equal(await attacker.getAddress());
  });
});
