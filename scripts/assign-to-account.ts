// Transfer N of account #0's (your main) UNLISTED items to another address so
// they "belong to" that account. Defaults: the given 2nd account, 5 items,
// spread across categories for variety. Only items that are NOT currently
// listed are moved, so no marketplace listing is left pointing at a non-owner.
//   TO=0x.. COUNT=5 hardhat run scripts/assign-to-account.ts --network localhost
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await network.connect();
const dep = JSON.parse(readFileSync(join(process.cwd(), "indexer", "deployment.json"), "utf8"));
const signers = await ethers.getSigners();
const me = signers[0];
const nft = dep.collectible.address;
const mkt = dep.marketplace.address;
const coll = (s) => new ethers.Contract(nft, dep.collectible.abi, s);
const market = (s) => new ethers.Contract(mkt, dep.marketplace.abi, s);

const raw = process.env.TO || "0x00cf54d8C7618D976F6c2E887d84e83ffE4Fc251";
let TO;
try { TO = ethers.getAddress(raw); } catch { TO = ethers.getAddress(raw.toLowerCase()); }
const COUNT = Number(process.env.COUNT || "5");
if (TO.toLowerCase() === me.address.toLowerCase()) throw new Error("TO must differ from account #0");

// gather #0's UNLISTED items (so we never strand a marketplace listing)
const bal = Number(await coll(me).balanceOf(me.address));
const owned = [];
for (let i = 0; i < bal; i++) owned.push(Number(await coll(me).tokenOfOwnerByIndex(me.address, i)));
const unlisted = [];
for (const id of owned) {
  const l = await market(me).getListing(nft, id);
  if (l.price === 0n) unlisted.push(id);
}
console.log(`#0 owns ${bal}, of which ${unlisted.length} are unlisted`);

// read category/name from local metadata and prefer a varied set
const readMeta = (id) => { try { return JSON.parse(readFileSync(join(process.cwd(), "metadata", `${id}.json`), "utf8")); } catch { return {}; } };
const catOf = (m) => (m.attributes || []).find((a) => a.trait_type === "Category")?.value || "Other";
const enriched = unlisted.map((id) => { const m = readMeta(id); return { id, name: m.name || `#${id}`, cat: catOf(m) }; });

const chosen = [];
const seenCat = new Set();
for (const it of enriched) { if (chosen.length >= COUNT) break; if (!seenCat.has(it.cat)) { seenCat.add(it.cat); chosen.push(it); } }
for (const it of enriched) { if (chosen.length >= COUNT) break; if (!chosen.includes(it)) chosen.push(it); }
if (chosen.length < COUNT) throw new Error(`only ${chosen.length} unlisted items available (need ${COUNT})`);

console.log(`transferring ${chosen.length} items #0 -> ${TO}`);
for (const it of chosen) {
  await (await coll(me).transferFrom(me.address, TO, it.id)).wait();
  console.log(`  #${it.id}  ${String(it.cat).padEnd(8)}  ${it.name}`);
}
console.log("done");
