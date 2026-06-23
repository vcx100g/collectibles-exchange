// Redistribute ownership so the OWNER (account #0 = "me") holds the first MINE
// items and a set of "random user" accounts (#4-#8) hold the rest. Others'
// items are all listed (so #0 can buy them); ~25% of #0's are left unlisted
// (so #0 can test the list/sell flow).
//   hardhat run scripts/redistribute.ts --network localhost
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await network.connect();
const dep = JSON.parse(readFileSync(join(process.cwd(), "indexer", "deployment.json"), "utf8"));
const signers = await ethers.getSigners();

const me = signers[0]; // the owner = "me"
const randoms = [signers[4], signers[5], signers[6], signers[7], signers[8]]; // random users
const nft = dep.collectible.address;
const mkt = dep.marketplace.address;

const coll = (s) => new ethers.Contract(nft, dep.collectible.abi, s);
const market = (s) => new ethers.Contract(mkt, dep.marketplace.abi, s);
const signerOf = (addr) => signers.find((s) => s.address.toLowerCase() === addr.toLowerCase());

const MINE = Number(process.env.MINE || "80");
const total = Number(await coll(me).totalMinted());
const prices = ["0.03", "0.05", "0.08", "0.12", "0.2", "0.35", "0.5", "0.8", "1.2"];

// one-time marketplace approval for every target owner
for (const s of [me, ...randoms]) {
  const c = coll(s);
  if (!(await c.isApprovedForAll(s.address, mkt))) await (await c.setApprovalForAll(mkt, true)).wait();
}

let mineN = 0, otherN = 0, listedN = 0;
for (let id = 0; id < total; id++) {
  const target = id < MINE ? me : randoms[id % randoms.length];
  const current = await coll(me).ownerOf(id);
  const listing = await market(me).getListing(nft, id);

  // move to target (cancel the current owner's listing first so the transfer is clean)
  if (current.toLowerCase() !== target.address.toLowerCase()) {
    if (listing.price > 0n) {
      const seller = signerOf(listing.seller);
      if (seller) await (await market(seller).cancelListing(nft, id)).wait();
    }
    await (await coll(signerOf(current)).transferFrom(current, target.address, id)).wait();
  }

  // desired listing state: mine -> ~75% listed; others -> all listed
  const wantList = id < MINE ? id % 4 !== 0 : true;
  const cur = await market(me).getListing(nft, id);
  const listedByTarget = cur.price > 0n && cur.seller.toLowerCase() === target.address.toLowerCase();

  if (wantList && !listedByTarget) {
    if (cur.price > 0n) await (await market(target).cancelListing(nft, id)).wait(); // clear stale
    await (await market(target).listItem(nft, id, ethers.parseEther(prices[id % prices.length]))).wait();
    listedN++;
  } else if (!wantList && cur.price > 0n) {
    await (await market(target).cancelListing(nft, id)).wait();
  } else if (listedByTarget) {
    listedN++;
  }

  if (id < MINE) mineN++; else otherN++;
}
console.log(`done: me(#0) owns ${mineN}, random users own ${otherN}, listed ${listedN}`);
