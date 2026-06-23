// Simulate the buyer (account #1) purchasing a listed token. Defaults to token 0
// (the Charizard). Run: hardhat run scripts/buy.ts --network localhost
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await network.connect();
const dep = JSON.parse(readFileSync(join(process.cwd(), "indexer", "deployment.json"), "utf8"));
const tokenId = BigInt(process.env.TOKEN_ID ?? "0");

const signers = await ethers.getSigners();
const buyer = signers[1]; // account #1
const market = new ethers.Contract(dep.marketplace.address, dep.marketplace.abi, buyer);
const collectible = new ethers.Contract(dep.collectible.address, dep.collectible.abi, buyer);

const listing = await market.getListing(dep.collectible.address, tokenId);
if (listing.price === 0n) {
  console.log(`token ${tokenId} is not listed; current owner = ${await collectible.ownerOf(tokenId)}`);
} else {
  console.log(`buying token ${tokenId} for ${ethers.formatEther(listing.price)} ETH as ${buyer.address}`);
  await (await market.buyItem(dep.collectible.address, tokenId, { value: listing.price })).wait();
  console.log(`done. new owner = ${await collectible.ownerOf(tokenId)}`);
}
