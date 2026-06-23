// Simulate trades AMONG the non-owner accounts so the home sections (latest /
// most-traded) have content. Never buys the owner's (#0) items, so the
// "you own 109 / others own 20" split is preserved. Some items get re-listed
// and bought again to create trade-count leaders.
//   TRADES=16 hardhat run scripts/seed-trades.ts --network localhost
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await network.connect();
const dep = JSON.parse(readFileSync(join(process.cwd(), "indexer", "deployment.json"), "utf8"));
const signers = await ethers.getSigners();
const me = signers[0].address.toLowerCase();
const nft = dep.collectible.address;
const mkt = dep.marketplace.address;
const coll = (s) => new ethers.Contract(nft, dep.collectible.abi, s);
const market = (s) => new ethers.Contract(mkt, dep.marketplace.abi, s);

const buyers = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => signers[i]); // never #0
const TRADES = Number(process.env.TRADES || "16");
const prices = ["0.05", "0.08", "0.12", "0.2", "0.35", "0.5", "0.8"];
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

// approvals so any buyer can re-list later
for (const s of buyers) {
  const c = coll(s);
  if (!(await c.isApprovedForAll(s.address, mkt))) await (await c.setApprovalForAll(mkt, true)).wait();
}

// pool of active listings NOT owned by the owner
const total = Number(await coll(signers[0]).totalMinted());
let pool = [];
for (let id = 0; id < total; id++) {
  const l = await market(signers[0]).getListing(nft, id);
  if (l.price > 0n && l.seller.toLowerCase() !== me) pool.push({ id, price: l.price, seller: l.seller.toLowerCase() });
}

let done = 0;
while (done < TRADES && pool.length) {
  const k = Math.floor(Math.random() * pool.length);
  const item = pool.splice(k, 1)[0];
  let buyer = rand(buyers);
  if (buyer.address.toLowerCase() === item.seller) buyer = buyers[(buyers.indexOf(buyer) + 1) % buyers.length];

  await (await market(buyer).buyItem(nft, item.id, { value: item.price })).wait();
  done++;

  // ~60% of the time, the buyer re-lists it so it can trade again
  if (Math.random() < 0.6) {
    const np = ethers.parseEther(rand(prices));
    await (await market(buyer).listItem(nft, item.id, np)).wait();
    pool.push({ id: item.id, price: np, seller: buyer.address.toLowerCase() });
  }
  console.log(`  trade ${done}: #${item.id} -> ${buyer.address.slice(0, 8)}…`);
}
console.log(`seeded ${done} trades`);
