import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";
import { CHAIN_ID, RPC_URL, MARKETPLACE_ADDRESS, MARKETPLACE_ABI } from "./config.js";

const $ = (s) => document.querySelector(s);
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
const eth = (wei) => (+ethers.formatEther(wei ?? 0n)).toFixed(4);
// The indexer runs on :42069 of the same host that serves this page.
const INDEXER = (() => {
  const u = new URL(location.origin);
  u.port = "42069";
  return u.origin;
})();

let provider, signer, account, marketplace;

function toast(msg, kind = "primary") {
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${kind} border-0 show`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  $("#toasts").appendChild(el);
  new bootstrap.Toast(el, { delay: 4000 }).show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

async function ensureNetwork() {
  const net = await provider.getNetwork();
  if (Number(net.chainId) === Number(CHAIN_ID)) return;
  const hexId = "0x" + Number(CHAIN_ID).toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: hexId, chainName: "VaultX Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [RPC_URL] }],
      });
    } else throw e;
  }
  provider = new ethers.BrowserProvider(window.ethereum);
}

async function connect() {
  if (!window.ethereum) return toast("No wallet found. Install MetaMask.", "danger");
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  await ensureNetwork();
  signer = await provider.getSigner();
  account = await signer.getAddress();
  marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
  $("#connect-btn").textContent = short(account);
  $("#connect-btn").classList.replace("btn-primary", "btn-outline-light");

  const owner = await marketplace.owner();
  const isOwner = owner.toLowerCase() === account.toLowerCase();
  $("#gate").classList.toggle("d-none", isOwner);
  $("#panel").classList.toggle("d-none", !isOwner);
  if (isOwner) await refreshAll();
  else {
    $("#gate-owner").textContent = `Owner: ${short(owner)}`;
    toast("This wallet is not the marketplace owner.", "warning");
  }
}

async function refreshAll() {
  await Promise.allSettled([loadStats(), loadContract(), loadRecent(), loadListings()]);
}

async function loadStats() {
  const s = await (await fetch(`${INDEXER}/stats`)).json();
  $("#m-volume").textContent = eth(BigInt(s.volumeWei));
  $("#m-fees").textContent = eth(BigInt(s.platformFeesWei));
  $("#m-royalties").textContent = eth(BigInt(s.royaltiesWei));
  $("#m-sales").textContent = s.sales;
  $("#m-active").textContent = s.activeListings;
  $("#m-items").textContent = s.totalItems;
}

async function loadContract() {
  const [feeBps, feeRecipient, paused, proceeds] = await Promise.all([
    marketplace.platformFeeBps(),
    marketplace.feeRecipient(),
    marketplace.paused(),
    marketplace.getProceeds(account),
  ]);
  $("#fee-current").textContent = `${(Number(feeBps) / 100).toFixed(2)}% → ${short(feeRecipient)}`;
  $("#fee-bps").value = Number(feeBps);
  $("#fee-recipient").value = feeRecipient;
  $("#pause-status").textContent = paused ? "PAUSED" : "Active";
  $("#pause-status").className = "badge " + (paused ? "text-bg-danger" : "text-bg-success");
  $("#pause-btn").textContent = paused ? "Unpause" : "Pause";
  $("#pause-btn").dataset.paused = String(paused);
  $("#proceeds").textContent = eth(proceeds);
}

async function loadRecent() {
  const rows = await (await fetch(`${INDEXER}/recent`)).json();
  $("#recent").innerHTML = rows
    .map(
      (r) =>
        `<tr><td><span class="badge text-bg-dark">${r.type}</span></td><td>#${r.tokenId}</td>
         <td class="mono small">${short(r.from)}</td><td class="mono small">${short(r.to)}</td>
         <td>${r.price ? eth(BigInt(r.price)) + " ETH" : "—"}</td></tr>`,
    )
    .join("");
}

async function loadListings() {
  const rows = await (await fetch(`${INDEXER}/listings`)).json();
  $("#listings").innerHTML = rows
    .map((r) => `<tr><td>#${r.tokenId}</td><td class="mono small">${short(r.seller)}</td><td>${eth(BigInt(r.price))} ETH</td></tr>`)
    .join("");
}

// ---- owner actions (all onlyOwner on-chain) ----
$("#fee-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const bps = BigInt($("#fee-bps").value || "0");
    const recipient = $("#fee-recipient").value.trim();
    toast("Confirm fee update in wallet…");
    await (await marketplace.setPlatformFee(bps, recipient)).wait();
    toast("Platform fee updated", "success");
    await loadContract();
  } catch (err) {
    toast(err.shortMessage || err.message, "danger");
  }
});

$("#pause-btn").addEventListener("click", async () => {
  try {
    const paused = $("#pause-btn").dataset.paused === "true";
    toast(paused ? "Unpausing…" : "Pausing…");
    await (await (paused ? marketplace.unpause() : marketplace.pause())).wait();
    toast(paused ? "Marketplace resumed" : "Marketplace paused", "success");
    await loadContract();
  } catch (err) {
    toast(err.shortMessage || err.message, "danger");
  }
});

$("#withdraw-btn").addEventListener("click", async () => {
  try {
    toast("Withdrawing platform fees…");
    await (await marketplace.withdrawProceeds()).wait();
    toast("Withdrawn to your wallet", "success");
    await loadContract();
  } catch (err) {
    toast(err.shortMessage || err.message, "danger");
  }
});

$("#refresh-btn").addEventListener("click", () => refreshAll().then(() => toast("Refreshed")));
$("#connect-btn").addEventListener("click", () => connect().catch((e) => toast(e.shortMessage || e.message, "danger")));

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}
