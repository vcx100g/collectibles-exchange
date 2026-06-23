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

const $ = (s) => document.querySelector(s);
const NFT = COLLECTIBLE_ADDRESS;

let provider, signer, account;
let collectible, marketplace;
let currentCat = "All";
let currentView = "market";
const metaCache = new Map();

// ----------------------------- ui helpers -----------------------------
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
const isZero = (a) => /^0x0+$/.test(a);

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
    const uri = await collectible.tokenURI(tokenId);
    meta = await (await fetch(uri)).json();
  } catch {
    meta = { name: `Item #${key}`, image: "", attributes: [] };
  }
  metaCache.set(key, meta);
  return meta;
}
const catOf = (m) => (m.attributes || []).find((a) => a.trait_type === "Category")?.value || "Other";

// ------------------------------ connect ------------------------------
async function connect() {
  if (!window.ethereum) {
    toast("No wallet found. Install MetaMask to continue.", "danger");
    return;
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  await ensureNetwork();
  signer = await provider.getSigner();
  account = await signer.getAddress();
  collectible = new ethers.Contract(COLLECTIBLE_ADDRESS, COLLECTIBLE_ABI, signer);
  marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);

  $("#connect-btn").textContent = short(account);
  $("#connect-btn").classList.replace("btn-primary", "btn-outline-light");
  $("#connect-notice").classList.add("d-none");
  $("#app").classList.remove("d-none");
  const badge = $("#net-badge");
  badge.classList.remove("d-none");
  badge.textContent = `Local · ${CHAIN_ID}`;
  await refreshAll();
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
        params: [{
          chainId: hexId,
          chainName: "VaultX Local",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [RPC_URL],
        }],
      });
    } else throw e;
  }
  provider = new ethers.BrowserProvider(window.ethereum);
}

// --------------------------- data loading ----------------------------
async function activeListings() {
  const events = await marketplace.queryFilter(marketplace.filters.ItemListed(null, NFT), 0, "latest");
  const ids = [...new Set(events.map((e) => e.args.tokenId.toString()))].map((s) => BigInt(s));
  // fetch every listing in PARALLEL instead of one-at-a-time
  const rows = await Promise.all(ids.map((id) => marketplace.getListing(NFT, id).then((l) => ({ id, l }))));
  return rows.filter(({ l }) => l.price > 0n).map(({ id, l }) => ({ tokenId: id, price: l.price, seller: l.seller }));
}

async function loadMarket() {
  const grid = $("#market-grid");
  const listings = await activeListings();
  // fetch ALL metadata in parallel, then paint every card in one shot
  const metas = await Promise.all(listings.map((x) => fetchMeta(x.tokenId)));
  let html = "", shown = 0;
  listings.forEach((x, i) => {
    const meta = metas[i];
    if (currentCat !== "All" && catOf(meta) !== currentCat) return;
    shown++;
    const mine = account && x.seller.toLowerCase() === account.toLowerCase();
    const action = mine
      ? `<button class="btn btn-sm btn-outline-secondary w-100" disabled>Your listing</button>`
      : `<button class="btn btn-sm btn-primary w-100" data-buy="${x.tokenId}" data-price="${x.price}">Buy · ${ethers.formatEther(x.price)} ETH</button>`;
    html += cardHtml(x.tokenId, meta, action);
  });
  grid.innerHTML = html;
  $("#market-empty").classList.toggle("d-none", shown > 0);
  fadeInImages(grid);
}

async function loadMine() {
  const grid = $("#mine-grid");
  const bal = Number(await collectible.balanceOf(account));
  // all token ids, then all metadata + listings — in parallel
  const tokenIds = await Promise.all(
    Array.from({ length: bal }, (_, i) => collectible.tokenOfOwnerByIndex(account, i)),
  );
  const [metas, listings] = await Promise.all([
    Promise.all(tokenIds.map((id) => fetchMeta(id))),
    Promise.all(tokenIds.map((id) => marketplace.getListing(NFT, id))),
  ]);
  let html = "", shown = 0;
  tokenIds.forEach((tokenId, i) => {
    const meta = metas[i];
    if (currentCat !== "All" && catOf(meta) !== currentCat) return;
    shown++;
    const l = listings[i];
    const action = l.price > 0n
      ? `<div class="mb-2 mono small text-success">Listed · ${ethers.formatEther(l.price)} ETH</div>
         <button class="btn btn-sm btn-outline-danger w-100" data-cancel="${tokenId}">Cancel listing</button>`
      : `<div class="input-group input-group-sm mb-2">
           <input type="number" step="0.001" min="0" class="form-control" placeholder="Price" id="price-${tokenId}">
           <span class="input-group-text">ETH</span>
         </div>
         <button class="btn btn-sm btn-primary w-100" data-list="${tokenId}">List for sale</button>`;
    html += cardHtml(tokenId, meta, action);
  });
  grid.innerHTML = html;
  $("#mine-empty").classList.toggle("d-none", shown > 0);
  fadeInImages(grid);
}

function cardHtml(tokenId, meta, actionHtml) {
  return `<div class="col"><div class="card h-100 shadow-sm">
    <div class="art-wrap" data-detail="${tokenId}" role="button">
      <img src="${meta.image}" class="tile-img" loading="lazy" decoding="async" alt="${meta.name}">
    </div>
    <div class="card-body d-flex flex-column">
      <span class="badge text-bg-dark align-self-start mb-1 trait">${catOf(meta)}</span>
      <h6 class="card-title text-truncate" title="${meta.name}">${meta.name}</h6>
      <div class="mt-auto">${actionHtml}</div>
    </div></div></div>`;
}

// Reveal each tile image with a fade once it loads (a shimmer skeleton shows meanwhile).
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

// ------------------------------ actions ------------------------------
async function buy(tokenId, price) {
  toast("Confirm the purchase in your wallet…");
  const tx = await marketplace.buyItem(NFT, tokenId, { value: BigInt(price) });
  await tx.wait();
  toast("Purchased! 🎉", "success");
  metaCache.clear();
  await refreshAll();
}

async function list(tokenId) {
  const input = $("#price-" + tokenId);
  const eth = input?.value;
  if (!eth || Number(eth) <= 0) return toast("Enter a price first", "warning");
  if (!(await collectible.isApprovedForAll(account, MARKETPLACE_ADDRESS))) {
    toast("One-time: approve the marketplace…");
    await (await collectible.setApprovalForAll(MARKETPLACE_ADDRESS, true)).wait();
  }
  toast("Listing…");
  await (await marketplace.listItem(NFT, tokenId, ethers.parseEther(eth))).wait();
  toast("Listed for sale!", "success");
  await refreshAll();
}

async function cancel(tokenId) {
  await (await marketplace.cancelListing(NFT, tokenId)).wait();
  toast("Listing canceled", "success");
  await refreshAll();
}

async function mintSample() {
  const id = Math.floor(Math.random() * 8);
  toast("Minting a sample item…");
  await (await collectible.mintItem(`${METADATA_BASE}/${id}.json`)).wait();
  toast("Minted! It's in My Items.", "success");
  await refreshAll();
}

async function withdraw() {
  await (await marketplace.withdrawProceeds()).wait();
  toast("Withdrawn to your wallet", "success");
  await refreshProceeds();
}

async function refreshProceeds() {
  const p = await marketplace.getProceeds(account);
  $("#proceeds-bar").classList.toggle("d-none", p === 0n);
  $("#proceeds-amt").textContent = ethers.formatEther(p);
}

// ------------------------ detail + provenance ------------------------
async function showDetail(tokenId) {
  const meta = await fetchMeta(tokenId);
  const owner = await collectible.ownerOf(tokenId);
  const [royReceiver, royAmt] = await collectible.royaltyInfo(tokenId, ethers.parseEther("1"));

  const transfers = await collectible.queryFilter(collectible.filters.Transfer(null, null, tokenId), 0, "latest");
  const buys = await marketplace.queryFilter(marketplace.filters.ItemBought(null, NFT, tokenId), 0, "latest");
  const priceByTx = new Map(buys.map((b) => [b.transactionHash, b.args.price]));

  const rows = [];
  for (const tr of transfers) {
    const blk = await tr.getBlock();
    const when = blk ? new Date(Number(blk.timestamp) * 1000).toLocaleString() : `block ${tr.blockNumber}`;
    const price = priceByTx.get(tr.transactionHash);
    let label;
    if (isZero(tr.args.from)) label = `<strong>Minted</strong> by <span class="mono">${short(tr.args.to)}</span>`;
    else if (price) label = `<strong>Sold</strong> to <span class="mono">${short(tr.args.to)}</span> · <span class="text-success">${ethers.formatEther(price)} ETH</span>`;
    else label = `Transferred to <span class="mono">${short(tr.args.to)}</span>`;
    rows.push(`<li><div>${label}</div><div class="small text-secondary">${when}</div></li>`);
  }

  const attrs = (meta.attributes || [])
    .map((a) => `<tr><td class="text-secondary">${a.trait_type}</td><td class="text-end">${a.value}</td></tr>`)
    .join("");

  const youOwn = account && owner.toLowerCase() === account.toLowerCase();
  $("#detail-content").innerHTML = `
    <div class="modal-header">
      <h5 class="modal-title">${meta.name}</h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <div class="row g-3">
        <div class="col-md-5">
          <img src="${meta.image}" class="card-art rounded" alt="${meta.name}">
          <div class="mt-2 small">
            Owner: <span class="mono">${short(owner)}</span>
            ${youOwn ? '<span class="badge text-bg-success ms-1">✓ You own this</span>' : ""}
          </div>
          <div class="small text-secondary">Creator royalty: ${ethers.formatEther(royAmt * 100n)}% → <span class="mono">${short(royReceiver)}</span></div>
        </div>
        <div class="col-md-7">
          <p class="text-secondary">${meta.description || ""}</p>
          <table class="table table-sm table-borderless mb-3"><tbody>${attrs}</tbody></table>
          <h6 class="text-secondary text-uppercase small">Provenance / history</h6>
          <ul class="timeline">${rows.join("") || "<li>No history yet.</li>"}</ul>
        </div>
      </div>
    </div>`;
  bootstrap.Modal.getOrCreateInstance($("#detail-modal")).show();
}

// ------------------------------ refresh ------------------------------
async function refreshAll() {
  await Promise.all([loadMarket(), loadMine(), refreshProceeds()]);
}

function setView(view) {
  currentView = view;
  $("#market-view").classList.toggle("d-none", view !== "market");
  $("#mine-view").classList.toggle("d-none", view !== "mine");
  document.querySelectorAll("#tabs .nav-link").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view),
  );
}

// ------------------------------ wiring -------------------------------
$("#connect-btn").addEventListener("click", () => connect().catch((e) => toast(e.shortMessage || e.message, "danger")));
$("#withdraw-btn").addEventListener("click", () => withdraw().catch((e) => toast(e.shortMessage || e.message, "danger")));
$("#mint-btn").addEventListener("click", () => mintSample().catch((e) => toast(e.shortMessage || e.message, "danger")));

document.querySelectorAll("#tabs .nav-link").forEach((b) =>
  b.addEventListener("click", () => setView(b.dataset.view)),
);
document.querySelectorAll("#cat-filter button").forEach((b) =>
  b.addEventListener("click", () => {
    currentCat = b.dataset.cat;
    document.querySelectorAll("#cat-filter button").forEach((x) => x.classList.toggle("active", x === b));
    if (currentView === "market") loadMarket();
    else loadMine();
  }),
);

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-buy],[data-list],[data-cancel],[data-detail]");
  if (!t) return;
  try {
    if (t.dataset.buy) await buy(t.dataset.buy, t.dataset.price);
    else if (t.dataset.list) await list(t.dataset.list);
    else if (t.dataset.cancel) await cancel(t.dataset.cancel);
    else if (t.dataset.detail) await showDetail(t.dataset.detail);
  } catch (err) {
    toast(err.shortMessage || err.message || "Transaction failed", "danger");
  }
});

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
  // Auto-reconnect if the wallet is already authorized — restores the UI after
  // the chainChanged reload (the cause of "back to Connect after logging in").
  window.ethereum
    .request({ method: "eth_accounts" })
    .then((accs) => { if (accs && accs.length) connect().catch(() => {}); })
    .catch(() => {});
}
