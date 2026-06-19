// One-off: mint -> list -> buy a fresh item to exercise the full event flow
// (and let the running indexer pick it up in real time). Leaves the 4 seeded
// listings untouched. Run: hardhat run scripts/demo-activity.ts --network localhost
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await network.connect();
const dep = JSON.parse(readFileSync(join(process.cwd(), "indexer", "deployment.json"), "utf8"));
const [seller, buyer] = await ethers.getSigners();

const collectible = new ethers.Contract(dep.collectible.address, dep.collectible.abi, seller);
const market = new ethers.Contract(dep.marketplace.address, dep.marketplace.abi, seller);

await (await collectible.mintItem("http://100.70.161.82:8080/metadata/1.json")).wait();
const tokenId = (await collectible.totalMinted()) - 1n;
console.log("minted token", tokenId.toString());

if (!(await collectible.isApprovedForAll(seller.address, dep.marketplace.address))) {
  await (await collectible.setApprovalForAll(dep.marketplace.address, true)).wait();
}
await (await market.listItem(dep.collectible.address, tokenId, ethers.parseEther("0.1"))).wait();
console.log("listed at 0.1 ETH");

await (await market.connect(buyer).buyItem(dep.collectible.address, tokenId, { value: ethers.parseEther("0.1") })).wait();
console.log("bought by", buyer.address);
