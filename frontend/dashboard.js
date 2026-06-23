import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";
import {
  CHAIN_ID,
  RPC_URL,
  COLLECTIBLE_ADDRESS,
  MARKETPLACE_ADDRESS,
  COLLECTIBLE_ABI,
  MARKETPLACE_ABI,
  METADATA_BASE,
} from "./config.js";
import { attachWalletMenu, suppressAutoConnect, clearSuppress } from "./wallet-ui.js";
import { escapeHtml, addrLink } from "./shell.js";

const $ = (s) => document.querySelector(s);
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
const fmt = (wei) => (+ethers.formatEther(wei ?? 0n)).toFixed(4);
const USD_PER_ETH = 3500; // indicative display rate (matches shared.js)
const usd = (wei) => {
  try {
    const v = Number(ethers.formatEther(BigInt(wei ?? 0n))) * USD_PER_ETH;
    return v ? `≈ $${v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2)}` : "";
  } catch { return ""; }
};
const NFT = COLLECTIBLE_ADDRESS;
const INDEXER = (() => { const u = new URL(location.origin); u.port = "42069"; return u.origin; })();

let provider, signer, account, collectible, marketplace;
const metaCache = new Map();

function toast(msg, kind = "primary") {
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${kind} border-0 show`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  $("#toasts").appendChild(el);
  new bootstrap.Toast(el, { delay: 4000 }).show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

async function fetchMeta(tokenId) {
  const key = tokenId.toString();
  if (metaCache.has(key)) return metaCache.get(key);
  let meta;
  try {
    meta = await (await fetch(await collectible.tokenURI(tokenId), { cache: "no-cache" })).json();
  } catch {
    meta = { name: `Item #${key}`, image: "", attributes: [] };
  }
  metaCache.set(key, meta);
  return meta;
}
const catOf = (m) => (m.attributes || []).find((a) => a.trait_type === "Category")?.value || "Other";
const GRADE_PRIORITY = ["Condition", "Grade", "Grading", "Critic Score"];
const gradeOf = (m) => { const a = {}; for (const x of m.attributes || []) a[x.trait_type] = x.value; for (const t of GRADE_PRIORITY) if (a[t] != null) return String(a[t]); return null; };

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
  collectible = new ethers.Contract(COLLECTIBLE_ADDRESS, COLLECTIBLE_ABI, signer);
  marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
  clearSuppress();
  $("#connect-btn").textContent = short(account);
  $("#connect-btn").classList.replace("btn-primary", "btn-outline-light");
  attachWalletMenu($("#connect-btn"), account);
  $("#net-badge").classList.remove("d-none");
  $("#net-badge").textContent = `Local · ${CHAIN_ID}`;
  $("#connect-notice").classList.add("d-none");
  $("#panel").classList.remove("d-none");
  $("#u-addr").textContent = account;
  await refreshAll();
}

async function refreshAll() {
  await Promise.allSettled([loadHeader(), loadSummaryAndActivity(), loadItems()]);
}

async function loadHeader() {
  const [bal, proceeds] = await Promise.all([
    provider.getBalance(account),
    marketplace.getProceeds(account),
  ]);
  $("#u-balance").textContent = fmt(bal);
  $("#u-proceeds").textContent = fmt(proceeds);
  $("#u-balance-usd").textContent = usd(bal);
  $("#u-proceeds-usd").textContent = usd(proceeds);
  $("#withdraw-btn").disabled = proceeds === 0n;
}

async function loadSummaryAndActivity() {
  const u = await (await fetch(`${INDEXER}/user/${account}`)).json();
  $("#u-owned").textContent = u.itemsOwned;
  $("#u-listed").textContent = u.activeListings;
  $("#u-sold").textContent = u.sold;
  $("#u-bought").textContent = u.bought;
  $("#activity").innerHTML = (u.activity || [])
    .map(
      (r) =>
        `<tr><td><span class="badge text-bg-dark">${escapeHtml(r.type)}</span></td>
         <td><a href="item.html?id=${r.tokenId}" class="text-reset">#${r.tokenId}</a></td>
         <td class="mono small">${addrLink(r.from)}</td><td class="mono small">${addrLink(r.to)}</td>
         <td>${r.price ? fmt(BigInt(r.price)) + " ETH" : "—"}</td></tr>`,
    )
    .join("") || `<tr><td colspan="5" class="text-secondary">No activity yet.</td></tr>`;
}

async function loadItems() {
  const grid = $("#items");
  const bal = Number(await collectible.balanceOf(account));
  const tokenIds = await Promise.all(
    Array.from({ length: bal }, (_, i) => collectible.tokenOfOwnerByIndex(account, i)),
  );
  const [metas, listings] = await Promise.all([
    Promise.all(tokenIds.map((id) => fetchMeta(id))),
    Promise.all(tokenIds.map((id) => marketplace.getListing(NFT, id))),
  ]);
  grid.innerHTML = tokenIds
    .map((tokenId, i) => {
      const meta = metas[i];
      const l = listings[i];
      const body =
        l.price > 0n
          ? `<div class="mb-1 mono small text-success">Listed · ${fmt(l.price)} ETH <span class="usd-hint">${usd(l.price)}</span></div>
             <div class="input-group input-group-sm mb-2">
               <input type="number" step="0.001" min="0" class="form-control" placeholder="New price" id="edit-${tokenId}" value="${fmt(l.price)}">
               <span class="input-group-text">ETH</span>
               <button class="btn btn-outline-primary" data-update="${tokenId}">Update</button>
             </div>
             <button class="btn btn-sm btn-outline-danger w-100" data-cancel="${tokenId}">Cancel listing</button>`
          : `<div class="input-group input-group-sm mb-2">
               <input type="number" step="0.001" min="0" class="form-control" placeholder="Price" id="price-${tokenId}">
               <span class="input-group-text">ETH</span>
             </div>
             <button class="btn btn-sm btn-primary w-100" data-list="${tokenId}">List for sale</button>`;
      const nm = escapeHtml(meta.name || `Item #${tokenId}`);
      const cat = escapeHtml(catOf(meta));
      const grade = gradeOf(meta);
      return `<div class="col"><div class="card h-100 lift">
         <a href="item.html?id=${tokenId}" class="art-wrap d-block" title="View details">
           <img src="${escapeHtml(meta.image || "")}" class="tile-img" loading="lazy" decoding="async" alt="${nm}"></a>
         <div class="card-body d-flex flex-column">
           <div class="d-flex flex-wrap gap-1 mb-1"><span class="badge text-bg-dark trait">${cat}</span>${grade ? `<span class="badge text-bg-secondary trait">${escapeHtml(grade)}</span>` : ""}</div>
           <h6 class="card-title text-truncate mb-1" title="${nm}"><a href="item.html?id=${tokenId}" class="text-reset text-decoration-none">${nm}</a></h6>
           <div class="mt-auto">${body}</div>
         </div></div></div>`;
    })
    .join("");
  $("#items-empty").classList.toggle("d-none", bal > 0);
  fadeInImages(grid);
}

function fadeInImages(container) {
  container.querySelectorAll("img.tile-img").forEach((img) => {
    const reveal = () => img.classList.add("loaded");
    if (img.complete && img.naturalWidth) reveal();
    else {
      img.addEventListener("load", reveal, { once: true });
      img.addEventListener("error", reveal, { once: true });
    }
  });
}

// ---- actions ----
async function list(tokenId) {
  const eth = $("#price-" + tokenId)?.value;
  if (!eth || Number(eth) <= 0) return toast("Enter a price first", "warning");
  if (!(await collectible.isApprovedForAll(account, MARKETPLACE_ADDRESS))) {
    toast("One-time: approve the marketplace…");
    await (await collectible.setApprovalForAll(MARKETPLACE_ADDRESS, true)).wait();
  }
  toast("Listing…");
  await (await marketplace.listItem(NFT, tokenId, ethers.parseEther(eth))).wait();
  toast("Listed!", "success");
  await refreshAll();
}

async function cancel(tokenId) {
  await (await marketplace.cancelListing(NFT, tokenId)).wait();
  toast("Listing canceled", "success");
  await refreshAll();
}

async function updatePrice(tokenId) {
  const eth = $("#edit-" + tokenId)?.value;
  if (!eth || Number(eth) <= 0) return toast("Enter a new price first", "warning");
  toast("Updating price…");
  await (await marketplace.updateListing(NFT, tokenId, ethers.parseEther(eth))).wait();
  toast("Price updated!", "success");
  await refreshAll();
}

async function withdraw() {
  toast("Withdrawing…");
  await (await marketplace.withdrawProceeds()).wait();
  toast("Withdrawn to your wallet", "success");
  await loadHeader();
}

async function mintSample() {
  const id = Math.floor(Math.random() * 8);
  toast("Minting a sample item…");
  await (await collectible.mintItem(`${METADATA_BASE}/${id}.json`)).wait();
  toast("Minted!", "success");
  metaCache.clear();
  await refreshAll();
}

// ---- wiring ----
$("#connect-btn").addEventListener("click", () => { if (account) return; connect().catch((e) => toast(e.shortMessage || e.message, "danger")); });
$("#withdraw-btn").addEventListener("click", () => withdraw().catch((e) => toast(e.shortMessage || e.message, "danger")));
$("#mint-btn").addEventListener("click", () => mintSample().catch((e) => toast(e.shortMessage || e.message, "danger")));

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-list],[data-cancel],[data-update]");
  if (!t) return;
  try {
    if (t.dataset.list) await list(t.dataset.list);
    else if (t.dataset.cancel) await cancel(t.dataset.cancel);
    else if (t.dataset.update) await updatePrice(t.dataset.update);
  } catch (err) {
    if (err?.code === 4001 || err?.code === "ACTION_REJECTED" || /user rejected|user denied/i.test(err?.message || "")) {
      return toast("Transaction cancelled", "secondary");
    }
    toast(err.shortMessage || err.message || "Transaction failed", "danger");
  }
});

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
  // Auto-reconnect if already authorized (restores the page after a chainChanged reload).
  if (!suppressAutoConnect()) {
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accs) => { if (accs && accs.length) connect().catch(() => {}); })
      .catch(() => {});
  }
}
