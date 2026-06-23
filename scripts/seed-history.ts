// Build realistic PRICE + TRADE history so the new charts have real signal.
//
//   1) For EVERY active listing, the seller issues a few price updates — a
//      biased random walk (more drops than rises) so the "seller lowered the
//      price → price went down" story shows up. Updates change NO ownership,
//      so the 109-mine / 20-others split is fully preserved.
//   2) For items listed by NON-owner accounts, a few extra buy → re-list
//      cycles among the other test accounts build multi-sale trade history.
//      Account #0 (you) never buys or sells here, so your 109 stay put and the
//      items stay among "others" (the 20 count is unchanged); each ends re-listed.
//
// Chain time is nudged forward between events so points get distinct timestamps.
// Safe to run once on top of the existing seed; the indexer (realtime) picks the
// new events up automatically — no re-index / schema drop needed.
//
//   docker compose exec hardhat npx hardhat run scripts/seed-history.ts --network localhost
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await network.connect();
const provider = ethers.provider;
const dep = JSON.parse(readFileSync(join(process.cwd(), "indexer", "deployment.json"), "utf8"));
const signers = await ethers.getSigners();
const me = signers[0].address.toLowerCase();
const byAddr = new Map(signers.map((s) => [s.address.toLowerCase(), s]));
const nft = dep.collectible.address;
const mkt = dep.marketplace.address;
const coll = (s) => new ethers.Contract(nft, dep.collectible.abi, s);
const market = (s) => new ethers.Contract(mkt, dep.marketplace.abi, s);

const MIN = ethers.parseEther("0.005");
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// nudge chain time forward (2–15 min) so successive events get distinct timestamps
async function tick() {
  await provider.send("evm_increaseTime", [Math.floor(rnd(120, 900))]);
}

// biased random-walk next price: ~40% down, ~35% up, ~25% roughly flat
function nextPrice(price) {
  const r = Math.random();
  const f = r < 0.4 ? rnd(0.6, 0.88) : r < 0.75 ? rnd(1.06, 1.3) : rnd(0.95, 1.05);
  let np = (price * BigInt(Math.round(f * 1000))) / 1000n;
  if (np < MIN) np = MIN;
  return np;
}

// snapshot current active listings
const total = Number(await coll(signers[0]).totalMinted());
const active = [];
for (let id = 0; id < total; id++) {
  const l = await market(signers[0]).getListing(nft, id);
  if (l.price > 0n) active.push({ id, price: l.price, seller: l.seller.toLowerCase() });
}
console.log(`active listings: ${active.length}`);

// every non-#0 account must approve the marketplace so it can re-list after buying
const buyers = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => signers[i]);
for (const s of buyers) {
  const c = coll(s);
  if (!(await c.isApprovedForAll(s.address, mkt))) await (await c.setApprovalForAll(mkt, true)).wait();
}

// 1) price-update walks — the seller of each listing re-prices it a few times
let updates = 0;
for (const L of active) {
  const s = byAddr.get(L.seller);
  if (!s) continue;
  let price = L.price;
  const n = 2 + Math.floor(Math.random() * 4); // 2..5 updates
  for (let k = 0; k < n; k++) {
    const np = nextPrice(price);
    if (np === price) continue;
    await tick();
    await (await market(s).updateListing(nft, L.id, np)).wait();
    price = np;
    updates++;
  }
}
console.log(`price updates: ${updates}`);

// 2) re-sale cycles on items listed by OTHERS → realized trade history (never #0)
const othersListed = active.filter((L) => L.seller !== me);
let trades = 0;
for (const L of othersListed) {
  const cur = await market(signers[0]).getListing(nft, L.id);
  if (cur.price === 0n) continue;
  let sellerAddr = cur.seller.toLowerCase();
  let price = cur.price;
  const cycles = 1 + Math.floor(Math.random() * 3); // 1..3 sales
  for (let k = 0; k < cycles; k++) {
    let buyer = pick(buyers);
    if (buyer.address.toLowerCase() === sellerAddr) buyer = buyers[(buyers.indexOf(buyer) + 1) % buyers.length];
    await tick();
    await (await market(buyer).buyItem(nft, L.id, { value: price })).wait();
    trades++;
    // re-list at a fresh (walked) price so it stays on the market / can trade again
    const np = nextPrice(price);
    await tick();
    await (await market(buyer).listItem(nft, L.id, np)).wait();
    sellerAddr = buyer.address.toLowerCase();
    price = np;
  }
}
console.log(`re-sale trades: ${trades}`);
console.log("history seeding done");
