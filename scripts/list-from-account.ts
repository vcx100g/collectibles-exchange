// Fund an external account with test-ETH (sent from #0) and list a couple of its
// items for sale on its behalf via Hardhat account impersonation (local node only
// — no private key needed). One-time setApprovalForAll is done first.
//   TO=0x.. FUND=5 hardhat run scripts/list-from-account.ts --network localhost
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await network.connect();
const dep = JSON.parse(readFileSync(join(process.cwd(), "indexer", "deployment.json"), "utf8"));
const me = (await ethers.getSigners())[0];
const nft = dep.collectible.address;
const mkt = dep.marketplace.address;
const TO = ethers.getAddress(process.env.TO || "0x00cf54d8C7618D976F6c2E887d84e83ffE4Fc251");

// items (owned by TO) to list + their prices in ETH. Override with
// ITEMS="id:price,id:price" (e.g. ITEMS="4:0.9,60:0.35,72:0.2").
const TO_LIST = process.env.ITEMS
  ? process.env.ITEMS.split(",").map((p) => { const [id, price] = p.split(":"); return { id: Number(id), price }; })
  : [
      { id: 36, price: "0.42" }, // Gengar — Haunted (Card)
      { id: 24, price: "0.65" }, // Samurai Katana (Antique)
    ];

// 1) fund TO with test-ETH from #0 (only if it has less than FUND)
const FUND = ethers.parseEther(process.env.FUND || "5");
if ((await ethers.provider.getBalance(TO)) < FUND) {
  await (await me.sendTransaction({ to: TO, value: FUND })).wait();
}
console.log(`2nd account balance: ${ethers.formatEther(await ethers.provider.getBalance(TO))} ETH`);

// 2) act AS the 2nd account (impersonation)
const acct = await ethers.getImpersonatedSigner(TO);
const coll = new ethers.Contract(nft, dep.collectible.abi, acct);
const market = new ethers.Contract(mkt, dep.marketplace.abi, acct);

// one-time marketplace approval
if (!(await coll.isApprovedForAll(TO, mkt))) {
  await (await coll.setApprovalForAll(mkt, true)).wait();
  console.log("approved marketplace for the 2nd account");
}

// 3) list the chosen items (skip any not owned / already listed)
for (const it of TO_LIST) {
  const owner = (await coll.ownerOf(it.id)).toLowerCase();
  if (owner !== TO.toLowerCase()) { console.log(`skip #${it.id}: not owned by 2nd account`); continue; }
  const l = await market.getListing(nft, it.id);
  if (l.price > 0n) { console.log(`skip #${it.id}: already listed`); continue; }
  await (await market.listItem(nft, it.id, ethers.parseEther(it.price))).wait();
  console.log(`listed #${it.id} for ${it.price} ETH`);
}

await ethers.provider.send("hardhat_stopImpersonatingAccount", [TO]);
console.log("done");
