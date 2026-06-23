// Shared wallet + rendering helpers for the Home and Search pages.
// Browsing is READ-ONLY (indexer + metadata over HTTP, no wallet needed);
// connecting is only required to buy.
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";
import * as cfg from "./config.js";
import { renderSparkline, priceStats } from "./charts.js";

export const CHAIN_ID = cfg.CHAIN_ID;
export const RPC_URL = cfg.RPC_URL;
export const METADATA_BASE = cfg.METADATA_BASE;
export const INDEXER = (() => { const u = new URL(location.origin); u.port = "42069"; return u.origin; })();

export const $ = (s) => document.querySelector(s);
export const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
export const fmt = (wei) => (+ethers.formatEther(BigInt(wei ?? 0))).toFixed(4);

let provider, signer, account, collectible, marketplace;
let sparkChart = null; // modal sparkline — tracked here because innerHTML swaps the canvas node
export const getAccount = () => account;

export function toast(msg, kind = "primary") {
  const box = $("#toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${kind} border-0 show`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  box.appendChild(el);
  new bootstrap.Toast(el, { delay: 4000 }).show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

// metadata URL is deterministic, so we read it over HTTP (no chain call needed)
const metaCache = new Map();
export async function fetchMeta(tokenId) {
  const key = String(tokenId);
  if (metaCache.has(key)) return metaCache.get(key);
  let meta;
  try {
    meta = await (await fetch(`${METADATA_BASE}/${key}.json`, { cache: "no-cache" })).json();
  } catch {
    meta = { name: `Item #${key}`, image: "", attributes: [] };
  }
  metaCache.set(key, meta);
  return meta;
}
export const catOf = (m) => (m.attributes || []).find((a) => a.trait_type === "Category")?.value || "Other";

// best "condition / grade" trait to surface on a tile (category-dependent)
const GRADE_PRIORITY = ["Condition", "Grade", "Grading", "Critic Score"];
export function gradeOf(meta) {
  const a = {};
  for (const x of meta.attributes || []) a[x.trait_type] = x.value;
  for (const t of GRADE_PRIORITY) if (a[t] != null) return { trait: t, value: String(a[t]) };
  return null;
}

export const PLATFORM_FEE_PCT = 2.5;

export function cardHtml(tokenId, meta, actionHtml = "", extra = "", priceWei = null) {
  const g = gradeOf(meta);
  const price = priceWei != null
    ? `<div class="mb-1"><span class="fw-bold text-success" style="font-size:1.1rem">${fmt(priceWei)} ETH</span>
        <div class="text-secondary" style="font-size:.66rem">incl. ${PLATFORM_FEE_PCT}% platform fee</div></div>`
    : "";
  return `<div class="col"><div class="card h-100 shadow-sm">
    <div class="art-wrap" data-detail="${tokenId}" role="button">
      <img src="${meta.image}" class="tile-img" loading="lazy" decoding="async" alt="${meta.name}">
    </div>
    <div class="card-body d-flex flex-column">
      <div class="d-flex flex-wrap gap-1 mb-1">
        <span class="badge text-bg-dark trait">${catOf(meta)}</span>
        ${g ? `<span class="badge text-bg-secondary trait" title="${g.trait}">${g.value}</span>` : ""}
      </div>
      <h6 class="card-title text-truncate mb-1" title="${meta.name}">${meta.name}</h6>
      ${price}${extra}
      <div class="mt-auto">${actionHtml}</div>
    </div></div></div>`;
}

export function fadeInImages(container) {
  container.querySelectorAll("img.tile-img").forEach((img) => {
    const reveal = () => img.classList.add("loaded");
    if (img.complete && img.naturalWidth) reveal();
    else {
      img.addEventListener("load", reveal, { once: true });
      img.addEventListener("error", reveal, { once: true });
    }
  });
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

export async function connect() {
  if (!window.ethereum) { toast("No wallet found. Install MetaMask.", "danger"); throw new Error("no wallet"); }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  await ensureNetwork();
  signer = await provider.getSigner();
  account = await signer.getAddress();
  collectible = new ethers.Contract(cfg.COLLECTIBLE_ADDRESS, cfg.COLLECTIBLE_ABI, signer);
  marketplace = new ethers.Contract(cfg.MARKETPLACE_ADDRESS, cfg.MARKETPLACE_ABI, signer);
  const b = $("#connect-btn");
  if (b) { b.textContent = short(account); b.classList.replace("btn-primary", "btn-outline-light"); }
  const nb = $("#net-badge");
  if (nb) { nb.classList.remove("d-none"); nb.textContent = `Local · ${CHAIN_ID}`; }
  return account;
}

export async function buy(tokenId, priceWei) {
  if (!account) await connect(); // lazy connect on first buy
  toast("Confirm the purchase in your wallet…");
  await (await marketplace.buyItem(cfg.COLLECTIBLE_ADDRESS, tokenId, { value: BigInt(priceWei) })).wait();
  toast("Purchased! 🎉", "success");
}

export function timelineHtml(acts) {
  if (!acts || !acts.length) return "<li>No history yet.</li>";
  return acts
    .map((a) => {
      const when = new Date(Number(a.timestamp) * 1000).toLocaleString();
      let label;
      if (a.type === "mint") label = `<strong>Minted</strong> by <span class="mono">${short(a.to)}</span>`;
      else if (a.type === "sale") label = `<strong>Sold</strong> to <span class="mono">${short(a.to)}</span> · <span class="text-success">${fmt(a.price)} ETH</span>`;
      else if (a.type === "list") label = `Listed · <span class="text-success">${fmt(a.price)} ETH</span>`;
      else if (a.type === "update") label = `Price updated · <span class="text-success">${fmt(a.price)} ETH</span>`;
      else if (a.type === "cancel") label = "Listing canceled";
      else label = `Transferred to <span class="mono">${short(a.to)}</span>`;
      return `<li><div>${label}</div><div class="small text-secondary">${when}</div></li>`;
    })
    .join("");
}

// item detail modal — price, owner, creator, provenance + link to the full page
export async function showDetail(tokenId) {
  const meta = await fetchMeta(tokenId);
  let info = {};
  try { info = await (await fetch(`${INDEXER}/item/${tokenId}`)).json(); } catch {}
  const attrs = (meta.attributes || [])
    .map((a) => `<tr><td class="text-secondary">${a.trait_type}</td><td class="text-end">${a.value}</td></tr>`)
    .join("");
  const st = priceStats(info);
  const badge = st.changePct != null
    ? `<span class="badge ${st.changePct >= 0 ? "text-bg-success" : "text-bg-danger"} align-middle ms-1" style="font-size:.7rem">${st.changePct >= 0 ? "▲" : "▼"} ${Math.abs(st.changePct).toFixed(1)}%</span>`
    : "";
  const priceBlock = info.listing
    ? `<div class="mb-1"><div class="text-secondary small">Price</div><div class="h4 m-0 text-success">${fmt(info.listing.price)} ETH ${badge}</div></div>`
    : `<div class="mb-1 text-secondary small">Not currently listed${st.lastSaleWei ? ` · last sold ${fmt(st.lastSaleWei)} ETH` : ""} ${badge}</div>`;
  const hasHistory = st.trades > 0 || (info.activity || []).some((a) => a.type === "update" || a.type === "list");
  const sparkBlock = hasHistory ? `<div class="mb-2" style="height:46px"><canvas id="spark"></canvas></div>` : "";
  const ownerLine = info.owner ? `<div class="small">Owner: <span class="mono">${short(info.owner)}</span></div>` : "";
  const creatorLine = info.creator ? `<div class="small text-secondary">Creator: <span class="mono">${short(info.creator)}</span> · 5% royalty</div>` : "";
  const tradeLine = info.tradeCount ? `<div class="small text-secondary">${info.tradeCount} trade${info.tradeCount > 1 ? "s" : ""}</div>` : "";
  if (sparkChart) { sparkChart.destroy(); sparkChart = null; } // before innerHTML drops the old canvas
  $("#detail-content").innerHTML = `
    <div class="modal-header"><h5 class="modal-title">${meta.name}</h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><div class="row g-3">
      <div class="col-md-5">
        <img src="${meta.image}" class="card-art rounded mb-2" alt="${meta.name}">
        ${priceBlock}${sparkBlock}${ownerLine}${creatorLine}${tradeLine}
      </div>
      <div class="col-md-7">
        ${info.category ? `<span class="badge text-bg-dark mb-2">${info.category}</span>` : ""}
        <p class="text-secondary">${meta.description || ""}</p>
        <table class="table table-sm table-borderless mb-3"><tbody>${attrs}</tbody></table>
        <h6 class="text-secondary text-uppercase small">Provenance / history</h6>
        <ul class="timeline">${timelineHtml(info.activity)}</ul>
      </div></div></div>
    <div class="modal-footer">
      ${info.listing ? `<button class="btn btn-primary" data-buy="${tokenId}" data-price="${info.listing.price}">Buy · ${fmt(info.listing.price)} ETH</button>` : ""}
      <a href="/item.html?id=${tokenId}" class="btn btn-outline-light">Full details →</a>
    </div>`;
  const modalEl = $("#detail-modal");
  if (modalEl && !modalEl._sparkBound) {
    modalEl._sparkBound = true;
    modalEl.addEventListener("hidden.bs.modal", () => { if (sparkChart) { sparkChart.destroy(); sparkChart = null; } });
  }
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
  const sc = $("#spark");
  if (sc) sparkChart = renderSparkline(sc, info.activity) || null;
}

// document-level click handling for grids: open detail, or buy (lazy-connects)
export function wireGrid(onChange) {
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-buy],[data-detail]");
    if (!t) return;
    try {
      if (t.dataset.buy) {
        await buy(t.dataset.buy, t.dataset.price);
        onChange?.();
      } else if (t.dataset.detail) {
        await showDetail(t.dataset.detail);
      }
    } catch (err) {
      toast(err.shortMessage || err.message || "Transaction failed", "danger");
    }
  });
}

export function initWallet() {
  const b = $("#connect-btn");
  if (b) b.addEventListener("click", () => connect().catch((e) => toast(e.shortMessage || e.message, "danger")));
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged", () => location.reload());
    window.ethereum.request({ method: "eth_accounts" }).then((a) => { if (a && a.length) connect().catch(() => {}); }).catch(() => {});
  }
}
