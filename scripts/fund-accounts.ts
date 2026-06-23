// Give the test accounts fake ETH so they can trade between each other.
// Uses hardhat_setBalance (instant, no gas). The 1st account gets the most.
//   MAIN=100000 OTHERS=1000 hardhat run scripts/fund-accounts.ts --network localhost
import { network } from "hardhat";

const { ethers } = await network.connect();

const MAIN = process.env.MAIN || "100000"; // 1st account — the most
const OTHERS = process.env.OTHERS || "1000";

const ACCOUNTS = [
  ["1st", "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", process.env.A1 || MAIN],
  ["2nd", "0x00cf54d8C7618D976F6c2E887d84e83ffE4Fc251", process.env.A2 || OTHERS],
  ["3rd", "0xA00313ECBe6bE8e7139Dc94b9e537E4c063eA1D3", process.env.A3 || OTHERS],
  ["4th", "0xfEc61B3Aa6159D3598cb11f072B09779B177fdD0", process.env.A4 || OTHERS],
];

for (const [label, addr, eth] of ACCOUNTS) {
  const a = ethers.getAddress(addr);
  await ethers.provider.send("hardhat_setBalance", [a, ethers.toQuantity(ethers.parseEther(eth))]);
  const bal = ethers.formatEther(await ethers.provider.getBalance(a));
  console.log(`  ${label}  ${a}  -> ${bal} ETH`);
}
console.log("done");
