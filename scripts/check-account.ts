// Print an account's ETH balance, claimable marketplace proceeds, and item count.
//   ADDR=0x.. hardhat run scripts/check-account.ts --network localhost
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ethers } = await network.connect();
const dep = JSON.parse(readFileSync(join(process.cwd(), "indexer", "deployment.json"), "utf8"));
const me = (await ethers.getSigners())[0];
const market = new ethers.Contract(dep.marketplace.address, dep.marketplace.abi, me);
const coll = new ethers.Contract(dep.collectible.address, dep.collectible.abi, me);

const A = ethers.getAddress(process.env.ADDR || "0x00cf54d8C7618D976F6c2E887d84e83ffE4Fc251");
console.log("address:           ", A);
console.log("ETH balance:       ", ethers.formatEther(await ethers.provider.getBalance(A)), "ETH");
console.log("claimable proceeds:", ethers.formatEther(await market.getProceeds(A)), "ETH  <-- waiting to be withdrawn");
console.log("items owned:       ", Number(await coll.balanceOf(A)));
