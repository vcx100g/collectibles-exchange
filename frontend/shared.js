// Shared wallet + rendering helpers for the Home / Search / Item / Profile /
// Watchlist / Activity pages. Browsing is READ-ONLY (indexer + metadata over
// HTTP, no wallet needed); connecting is only required to buy/list/withdraw.
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";
import * as cfg from "./config.js";
import { renderSparkline, priceStats } from "./charts.js";
import { attachWalletMenu, suppressAutoConnect, clearSuppress } from "./wallet-ui.js";
import { escapeHtml, addrLink, identiconSvg } from "./shell.js";

export { escapeHtml, addrLink, identiconSvg };

export const CHAIN_ID = cfg.CHAIN_ID;
export const RPC_URL = cfg.RPC_URL;
export const METADATA_BASE = cfg.METADATA_BASE;
export const INDEXER = (() => { const u = new URL(location.origin); u.port = "42069"; return u.origin; })();

export const $ = (s) => document.querySelector(s);
export const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
export const fmt = (wei) => (+ethers.formatEther(BigInt(wei ?? 0))).toFixed(4);

// Indicative ETH→USD for DISPLAY ONLY (there's no price oracle on a local
// testnet). Shown as "≈ $X" so collectibles buyers have a familiar anchor.
export const USD_PER_ETH = 3500;
export const usdOf = (wei) => {
  try {
    const usd = Number(ethers.formatEther(BigInt(wei ?? 0))) * USD_PER_ETH;
    if (!usd) return "";
    return `≈ $${usd >= 1000 ? Math.round(usd).toLocaleString() : usd.toFixed(2)}`;
  } catch { return ""; }
};

let provider, signer, account, marketplace;
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

// inline SVG placeholder used when an item image is missing or fails to load
const ph = (label) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#11131a'/><text x='50' y='47' fill='#5b6472' font-family='sans-serif' font-size='8' text-anchor='middle'>${(label || "No image").slice(0, 14)}</text><text x='50' y='60' fill='#3a4150' font-family='sans-serif' font-size='5' text-anchor='middle'>image unavailable</text></svg>`,
  )}`;

// ----------------------------- favourites ----------------------------------
// localStorage-backed watchlist, keyed by the connected account (or "anon").
const favKey = () => `vx:favs:${(getAccount() || "anon").toLowerCase()}`;
export const listFavs = () => { try { return JSON.parse(localStorage.getItem(favKey()) || "[]"); } catch { return []; } };
export const isFav = (id) => listFavs().includes(String(id));
export function toggleFav(id) {
  const s = String(id), arr = listFavs(), i = arr.indexOf(s);
  if (i >= 0) arr.splice(i, 1); else arr.unshift(s);
  localStorage.setItem(favKey(), JSON.stringify(arr.slice(0, 500)));
  return arr.includes(s);
}
const RECENT_KEY = "vx:recent";
export const listRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
export function pushRecent(id) {
  const s = String(id), arr = listRecent().filter((x) => x !== s);
  arr.unshift(s);
  localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 24)));
}

// ----------------------------- rendering -----------------------------------
export const emptyState = (icon, headline, help = "", actionHtml = "") =>
  `<div class="text-center text-secondary py-5">
     <div class="display-6 mb-2">${icon}</div>
     <div class="fw-semibold text-body">${escapeHtml(headline)}</div>
     ${help ? `<div class="small mb-3">${escapeHtml(help)}</div>` : ""}
     ${actionHtml}
   </div>`;

export function favBtn(tokenId) {
  const on = isFav(tokenId);
  return `<button class="fav-btn ${on ? "on" : ""}" data-fav="${tokenId}" aria-pressed="${on}" title="Save to watchlist" aria-label="Save to watchlist">${on ? "♥" : "♡"}</button>`;
}

export function cardHtml(tokenId, meta, actionHtml = "", extra = "", priceWei = null) {
  const g = gradeOf(meta);
  const cat = catOf(meta);
  const name = escapeHtml(meta.name || `Item #${tokenId}`);
  const price = priceWei != null
    ? `<div class="mb-1"><span class="fw-bold text-success" style="font-size:1.1rem">${fmt(priceWei)} ETH</span>
        <span class="usd-hint ms-1">${usdOf(priceWei)}</span>
        <div class="text-secondary" style="font-size:.66rem">incl. ${PLATFORM_FEE_PCT}% platform fee</div></div>`
    : "";
  const img = meta.image ? escapeHtml(meta.image) : ph(cat);
  return `<div class="col"><div class="card h-100 shadow-sm lift">
    <div class="art-wrap" data-detail="${tokenId}" role="button" tabindex="0" aria-label="View ${name}">
      ${favBtn(tokenId)}
      <img src="${img}" data-ph="${escapeHtml(cat)}" class="tile-img" loading="lazy" decoding="async" alt="${name}">
    </div>
    <div class="card-body d-flex flex-column">
      <div class="d-flex flex-wrap gap-1 mb-1">
        <span class="badge text-bg-dark trait">${escapeHtml(cat)}</span>
        ${g ? `<span class="badge text-bg-secondary trait" title="${escapeHtml(g.trait)}">${escapeHtml(g.value)}</span>` : ""}
      </div>
      <h6 class="card-title text-truncate mb-1" title="${name}">${name}</h6>
      ${price}${extra}
      <div class="mt-auto">${actionHtml}</div>
    </div></div></div>`;
}

export function fadeInImages(container) {
  container.querySelectorAll("img.tile-img").forEach((img) => {
    const reveal = () => img.classList.add("loaded");
    const fail = () => { if (img.dataset.ph != null) img.src = ph(img.dataset.ph); reveal(); };
    if (img.complete && img.naturalWidth) reveal();
    else {
      img.addEventListener("load", reveal, { once: true });
      img.addEventListener("error", fail, { once: true });
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
  marketplace = new ethers.Contract(cfg.MARKETPLACE_ADDRESS, cfg.MARKETPLACE_ABI, signer);
  clearSuppress(); // an explicit connect cancels any prior "stay disconnected"
  const b = $("#connect-btn");
  if (b) { b.textContent = short(account); b.classList.replace("btn-primary", "btn-outline-light"); attachWalletMenu(b, account); }
  const nb = $("#net-badge");
  if (nb) { nb.classList.remove("d-none"); nb.textContent = `Local · ${CHAIN_ID}`; }
  return account;
}

export async function buy(tokenId, priceWei) {
  // Pre-flight: confirm it's still listed at this exact price so a sold/repriced
  // item gives a friendly message instead of a raw "execution reverted" toast.
  try {
    const info = await (await fetch(`${INDEXER}/item/${tokenId}`)).json();
    if (!info.listing || String(info.listing.price) !== String(priceWei)) {
      toast("This item is no longer available at that price — refreshing.", "warning");
      const e = new Error("stale listing"); e.handled = true; throw e;
    }
  } catch (e) {
    if (e.handled) throw e; // genuine stale-listing signal
    // indexer unreachable: fall through and let the chain be the source of truth
  }
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
      if (a.type === "mint") label = `<strong>Minted</strong> by ${addrLink(a.to)}`;
      else if (a.type === "sale") label = `<strong>Sold</strong> to ${addrLink(a.to)} · <span class="text-success">${fmt(a.price)} ETH</span>`;
      else if (a.type === "list") label = `Listed · <span class="text-success">${fmt(a.price)} ETH</span>`;
      else if (a.type === "update") label = `Price updated · <span class="text-success">${fmt(a.price)} ETH</span>`;
      else if (a.type === "cancel") label = "Listing canceled";
      else label = `Transferred to ${addrLink(a.to)}`;
      return `<li><div>${label}</div><div class="small text-secondary">${when}</div></li>`;
    })
    .join("");
}

// item detail modal — price, owner, creator, provenance + link to the full page
export async function showDetail(tokenId) {
  pushRecent(tokenId);
  const meta = await fetchMeta(tokenId);
  let info = {};
  try { info = await (await fetch(`${INDEXER}/item/${tokenId}`)).json(); } catch {}
  const attrs = (meta.attributes || [])
    .map((a) => `<tr><td class="text-secondary">${escapeHtml(a.trait_type)}</td><td class="text-end">${escapeHtml(a.value)}</td></tr>`)
    .join("");
  const st = priceStats(info);
  const badge = st.changePct != null
    ? `<span class="badge ${st.changePct >= 0 ? "text-bg-success" : "text-bg-danger"} align-middle ms-1" style="font-size:.7rem">${st.changePct >= 0 ? "▲" : "▼"} ${Math.abs(st.changePct).toFixed(1)}%</span>`
    : "";
  const priceBlock = info.listing
    ? `<div class="mb-1"><div class="text-secondary small">Price</div><div class="h4 m-0 text-success">${fmt(info.listing.price)} ETH ${badge}</div><div class="usd-hint">${usdOf(info.listing.price)}</div></div>`
    : `<div class="mb-1 text-secondary small">Not currently listed${st.lastSaleWei ? ` · last sold ${fmt(st.lastSaleWei)} ETH` : ""} ${badge}</div>`;
  const hasHistory = st.trades > 0 || (info.activity || []).some((a) => a.type === "update" || a.type === "list");
  const sparkBlock = hasHistory ? `<div class="mb-2" style="height:46px"><canvas id="spark"></canvas></div>` : "";
  const ownerLine = info.owner ? `<div class="small">Owner: ${addrLink(info.owner)}</div>` : "";
  const creatorLine = info.creator ? `<div class="small text-secondary">Creator: ${addrLink(info.creator)} · 5% royalty</div>` : "";
  const tradeLine = info.tradeCount ? `<div class="small text-secondary">${info.tradeCount} trade${info.tradeCount > 1 ? "s" : ""}</div>` : "";
  const name = escapeHtml(meta.name || `Item #${tokenId}`);
  const favOn = isFav(tokenId);
  if (sparkChart) { sparkChart.destroy(); sparkChart = null; } // before innerHTML drops the old canvas
  $("#detail-content").innerHTML = `
    <div class="modal-header"><h5 class="modal-title">${name}</h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
    <div class="modal-body"><div class="row g-3">
      <div class="col-md-5">
        <img src="${meta.image ? escapeHtml(meta.image) : ph(catOf(meta))}" class="card-art rounded mb-2" alt="${name}">
        ${priceBlock}${sparkBlock}${ownerLine}${creatorLine}${tradeLine}
      </div>
      <div class="col-md-7">
        ${info.category ? `<span class="badge text-bg-dark mb-2">${escapeHtml(info.category)}</span>` : ""}
        <p class="text-secondary">${escapeHtml(meta.description || "")}</p>
        <table class="table table-sm table-borderless mb-3"><tbody>${attrs}</tbody></table>
        <h6 class="text-secondary text-uppercase small">Provenance / history</h6>
        <ul class="timeline">${timelineHtml(info.activity)}</ul>
      </div></div></div>
    <div class="modal-footer">
      <button class="btn ${favOn ? "btn-danger" : "btn-outline-danger"} me-auto" data-fav="${tokenId}">${favOn ? "♥ Saved" : "♡ Save"}</button>
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

// document-level interaction for grids: favourite toggle, open detail, or buy.
export function wireGrid(onChange) {
  const handleFav = (el) => {
    const on = toggleFav(el.dataset.fav);
    el.classList.toggle("on", on);
    if (el.classList.contains("fav-btn")) { el.textContent = on ? "♥" : "♡"; el.setAttribute("aria-pressed", String(on)); }
    else { el.textContent = on ? "♥ Saved" : "♡ Save"; el.classList.toggle("btn-danger", on); el.classList.toggle("btn-outline-danger", !on); }
    document.dispatchEvent(new CustomEvent("vx:fav-changed", { detail: { tokenId: el.dataset.fav, on } }));
  };

  document.addEventListener("click", async (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) { e.preventDefault(); e.stopPropagation(); handleFav(fav); return; }
    const t = e.target.closest("[data-buy],[data-detail]");
    if (!t) return;
    try {
      if (t.dataset.buy) {
        t.disabled = true;
        try { await buy(t.dataset.buy, t.dataset.price); }
        finally { t.disabled = false; }
        const modalEl = $("#detail-modal");
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
        onChange?.();
      } else if (t.dataset.detail) {
        await showDetail(t.dataset.detail);
      }
    } catch (err) {
      if (err?.handled) { onChange?.(); return; } // stale listing: already toasted, just refresh
      if (err?.code === 4001 || err?.code === "ACTION_REJECTED" || /user rejected|user denied/i.test(err?.message || "")) {
        toast("Transaction cancelled", "secondary");
        return;
      }
      toast(err.shortMessage || err.message || "Transaction failed", "danger");
    }
  });

  // keyboard access for the art-wrap detail trigger (buttons handle themselves)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target.closest?.("[data-detail]");
    if (t && t.tagName !== "BUTTON") { e.preventDefault(); showDetail(t.dataset.detail); }
  });
}

export function initWallet() {
  const b = $("#connect-btn");
  // when already connected the button is a dropdown toggle (Switch/Disconnect);
  // only an unconnected click should kick off connect().
  if (b) b.addEventListener("click", () => { if (getAccount()) return; connect().catch((e) => toast(e.shortMessage || e.message, "danger")); });
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged", () => location.reload());
    if (!suppressAutoConnect()) {
      window.ethereum.request({ method: "eth_accounts" }).then((a) => { if (a && a.length) connect().catch(() => {}); }).catch(() => {});
    }
  }
}
