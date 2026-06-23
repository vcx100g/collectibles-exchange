import { $, INDEXER, fetchMeta, fmt, usdOf, addrLink, escapeHtml, pushRecent, toast, wireGrid, initWallet } from "./shared.js";
import { COLLECTIBLE_ADDRESS, MARKETPLACE_ADDRESS, CHAIN_ID } from "./config.js";
import { renderPriceHistory, renderTradeHistory, priceStats } from "./charts.js";

const id = new URLSearchParams(location.search).get("id");
const row = (k, v) => `<tr><td class="text-secondary">${k}</td><td class="text-end text-break">${v}</td></tr>`;
// only let through web/ipfs schemes so a malicious tokenURI can't be javascript:
const safeUrl = (u) => (/^(https?:|ipfs:)/i.test(u || "") ? u : "#");

const tile = (label, value, sub = "", cls = "") =>
  `<div class="col-6 col-md-3"><div class="card h-100"><div class="card-body py-2 px-3">
     <div class="text-secondary small">${label}</div>
     <div class="fs-5 fw-semibold ${cls}">${value}</div>
     ${sub ? `<div class="small text-secondary">${sub}</div>` : ""}
   </div></div></div>`;

// price stat tiles + the price/trade charts (derived from the activity log)
function renderHistory(info) {
  const s = priceStats(info);
  let change = "—", changeCls = "";
  if (s.changePct != null) {
    const up = s.changePct >= 0;
    change = `${up ? "▲" : "▼"} ${Math.abs(s.changePct).toFixed(1)}%`;
    changeCls = up ? "text-success" : "text-danger";
  }
  $("#stats").innerHTML = [
    tile("Current / last price", s.currentWei ? `${fmt(s.currentWei)} ETH` : "—", s.currentWei ? usdOf(s.currentWei) : ""),
    tile("All-time high", s.highWei ? `${fmt(s.highWei)} ETH` : "—", s.lowWei ? `low ${fmt(s.lowWei)} ETH` : ""),
    tile("Price change", change, "since first listing", changeCls),
    tile("Trades", String(s.trades), s.lastSaleWei ? `last ${fmt(s.lastSaleWei)} ETH` : "no sales yet"),
  ].join("");

  if (!renderPriceHistory($("#price-chart"), info.activity)) {
    $("#price-chart").classList.add("d-none");
    $("#price-empty").classList.remove("d-none");
  }
  if (!renderTradeHistory($("#trade-chart"), info.sales)) {
    $("#trade-chart").classList.add("d-none");
    $("#trade-empty").classList.remove("d-none");
  }
}

async function load() {
  if (!id) { $("#loading").innerHTML = "No item id."; return; }
  pushRecent(id);
  let info;
  try {
    info = await (await fetch(`${INDEXER}/item/${id}`)).json();
  } catch {
    $("#loading").innerHTML = "Couldn't reach the indexer.";
    return;
  }
  if (info.error) { $("#loading").innerHTML = "Item not found."; return; }
  const meta = await fetchMeta(id);

  $("#img").src = meta.image || "";
  $("#img").alt = meta.name || `Item #${id}`;
  $("#name").textContent = meta.name || `Item #${id}`;
  $("#category").textContent = info.category || "";
  $("#description").textContent = meta.description || "";
  $("#owner").innerHTML = addrLink(info.owner);
  $("#creator").innerHTML = addrLink(info.creator);

  if (info.listing) {
    $("#price-box").innerHTML = `<div class="text-secondary small">Price</div>
      <div class="display-6 text-success">${fmt(info.listing.price)} ETH</div>
      <div class="usd-hint mb-1">${usdOf(info.listing.price)}</div>
      <div class="small text-secondary">listed by ${addrLink(info.listing.seller)}</div>`;
    const b = $("#buy-btn");
    b.classList.remove("d-none");
    b.textContent = `Buy · ${fmt(info.listing.price)} ETH`;
    b.dataset.buy = id;
    b.dataset.price = info.listing.price;
  } else {
    $("#price-box").innerHTML = `<div class="text-secondary">Not currently listed for sale</div>`;
  }

  renderHistory(info);

  const uriShort = info.tokenUri ? escapeHtml(info.tokenUri.split("/").slice(-2).join("/")) : "—";
  $("#chain-info").innerHTML = [
    row("Token ID", id),
    row("Token standard", "ERC-721 (+ ERC-2981, Enumerable, URIStorage)"),
    row("Collectible contract", `<span class="mono">${COLLECTIBLE_ADDRESS}</span>`),
    row("Marketplace contract", `<span class="mono">${MARKETPLACE_ADDRESS}</span>`),
    row("Chain", `${CHAIN_ID} — VaultX Local (test net)`),
    row("Token URI", `<a href="${escapeHtml(safeUrl(info.tokenUri))}" target="_blank" rel="noopener" class="text-info">${uriShort}</a>`),
    row("Owner", addrLink(info.owner)),
    row("Creator", addrLink(info.creator)),
    row("Creator royalty (ERC-2981)", info.creator ? `5% → ${addrLink(info.creator)}` : "—"),
    row("Trades", info.tradeCount ?? 0),
    row("Total volume", `${fmt(info.volumeWei)} ETH`),
    info.lastSalePrice ? row("Last sale price", `${fmt(info.lastSalePrice)} ETH`) : "",
  ].join("");

  $("#attrs").innerHTML =
    (meta.attributes || []).map((a) => `<tr><td class="text-secondary">${escapeHtml(a.trait_type)}</td><td class="text-end">${escapeHtml(a.value)}</td></tr>`).join("") ||
    `<tr><td class="text-secondary">No attributes</td></tr>`;

  $("#activity").innerHTML =
    (info.activity || [])
      .map(
        (a) => `<tr>
        <td><span class="badge text-bg-dark">${escapeHtml(a.type)}</span></td>
        <td class="mono small">${addrLink(a.from)}</td>
        <td class="mono small">${addrLink(a.to)}</td>
        <td>${a.price ? fmt(a.price) + " ETH" : "—"}</td>
        <td class="small">${a.block}</td>
        <td class="mono small" title="${escapeHtml(a.txHash || "")}">${a.txHash ? escapeHtml(a.txHash.slice(0, 10)) + "…" : "—"}</td>
        <td class="small text-secondary">${new Date(Number(a.timestamp) * 1000).toLocaleString()}</td>
      </tr>`,
      )
      .join("") || `<tr><td colspan="7" class="text-secondary">No activity yet.</td></tr>`;

  $("#loading").classList.add("d-none");
  $("#content").classList.remove("d-none");
}

$("#share-btn")?.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); toast("Link copied to clipboard", "success"); }
  catch { toast("Press Ctrl/⌘+C to copy the link", "secondary"); }
});

initWallet();
wireGrid(load); // buy button -> reload after purchase
load();
