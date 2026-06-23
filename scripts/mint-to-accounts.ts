// "Add" items to accounts by MINTING new tokens (you can't meaningfully transfer
// into #0, which already owns most items). New tokens reuse a spread of existing
// metadata (so they render with real art), tagged "(Reissue)", and are left
// UNLISTED — so they show in each account's My Account but don't appear in the
// public Search/Home feeds (those only list active listings).
//   N1 -> minted to #0 (1st account);  N3 -> minted then transferred to TO3.
//   N1=10 N3=3 TO3=0x.. hardhat run scripts/mint-to-accounts.ts --network localhost
import { network } from "hardhat";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await network.connect();
const dep = JSON.parse(readFileSync(join(process.cwd(), "indexer", "deployment.json"), "utf8"));
const me = (await ethers.getSigners())[0];
const coll = new ethers.Contract(dep.collectible.address, dep.collectible.abi, me);

const META_BASE = process.env.METADATA_BASE || "http://100.70.161.82:8080/metadata";
const TO3 = ethers.getAddress(process.env.TO3 || "0xA00313ECBe6bE8e7139Dc94b9e537E4c063eA1D3");
const N1 = Number(process.env.N1 || "10"); // kept by #0
const N3 = Number(process.env.N3 || "3");  // transferred to account 3
const total = N1 + N3;

const nextId = Number(await coll.totalMinted()); // ids are sequential & 0-indexed
const metaPath = (id) => join(process.cwd(), "metadata", `${id}.json`);

// prepare metadata for the new ids by copying a spread of existing items
const newIds = [];
for (let k = 0; k < total; k++) {
  const newId = nextId + k;
  const srcId = Math.floor((k * nextId) / total); // spread 0..nextId-1 → varied categories
  const m = JSON.parse(readFileSync(metaPath(srcId), "utf8"));
  m.name = `${m.name} (Reissue)`;
  m.external_url = `${META_BASE}/${newId}.json`;
  writeFileSync(metaPath(newId), JSON.stringify(m, null, 2));
  newIds.push(newId);
}
console.log(`prepared metadata for new ids ${newIds[0]}..${newIds[newIds.length - 1]} (sources spread across the catalog)`);

// mint all to #0
for (const id of newIds) await (await coll.mintItem(`${META_BASE}/${id}.json`)).wait();
console.log(`minted ${newIds.length} tokens to #0`);

// move the last N3 to account 3
const toAcct3 = newIds.slice(N1);
for (const id of toAcct3) await (await coll.transferFrom(me.address, TO3, id)).wait();
console.log(`transferred ${toAcct3.length} to account 3 (${TO3}): #${toAcct3.join(", #")}`);
console.log(`#0 keeps ${N1}: #${newIds.slice(0, N1).join(", #")}`);
console.log("done");
