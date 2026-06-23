import { $, INDEXER, fetchMeta, fmt, short, wireGrid, initWallet } from "./shared.js";
import { COLLECTIBLE_ADDRESS, MARKETPLACE_ADDRESS, CHAIN_ID } from "./config.js";

const id = new URLSearchParams(location.search).get("id");
const row = (k, v) => `<tr><td class="text-secondary">${k}</td><td class="text-end text-break">${v}</td></tr>`;

async function load() {
  if (!id) { $("#loading").innerHTML = "No item id."; return; }
  let info;
  try {
    info = await (await fetch(`${INDEXER}/item/${id}`)).json();
  } catch {
    $("#loading").innerHTML = "Couldn't reach the indexer.";
    return;
  }
  if (info.error) { $("#loading").innerHTML = "Item not found."; return; }
  const meta = await fetchMeta(id);

  $("#img").src = meta.image;
  $("#name").textContent = meta.name || `Item #${id}`;
  $("#category").textContent = info.category || "";
  $("#description").textContent = meta.description || "";
  $("#owner").textContent = short(info.owner);
  $("#owner").title = info.owner || "";
  $("#creator").textContent = short(info.creator);
  $("#creator").title = info.creator || "";

  if (info.listing) {
    $("#price-box").innerHTML = `<div class="text-secondary small">Price</div>
      <div class="display-6 text-success">${fmt(info.listing.price)} ETH</div>
      <div class="small text-secondary">listed by <span class="mono">${short(info.listing.seller)}</span></div>`;
    const b = $("#buy-btn");
    b.classList.remove("d-none");
    b.textContent = `Buy · ${fmt(info.listing.price)} ETH`;
    b.dataset.buy = id;
    b.dataset.price = info.listing.price;
  } else {
    $("#price-box").innerHTML = `<div class="text-secondary">Not currently listed for sale</div>`;
  }

  const uriShort = info.tokenUri ? info.tokenUri.split("/").slice(-2).join("/") : "—";
  $("#chain-info").innerHTML = [
    row("Token ID", id),
    row("Token standard", "ERC-721 (+ ERC-2981, Enumerable, URIStorage)"),
    row("Collectible contract", `<span class="mono">${COLLECTIBLE_ADDRESS}</span>`),
    row("Marketplace contract", `<span class="mono">${MARKETPLACE_ADDRESS}</span>`),
    row("Chain", `${CHAIN_ID} — VaultX Local (test net)`),
    row("Token URI", `<a href="${info.tokenUri}" target="_blank" class="text-info">${uriShort}</a>`),
    row("Owner", `<span class="mono">${info.owner || "—"}</span>`),
    row("Creator", `<span class="mono">${info.creator || "—"}</span>`),
    row("Creator royalty (ERC-2981)", info.creator ? `5% → <span class="mono">${short(info.creator)}</span>` : "—"),
    row("Trades", info.tradeCount ?? 0),
    row("Total volume", `${fmt(info.volumeWei)} ETH`),
    info.lastSalePrice ? row("Last sale price", `${fmt(info.lastSalePrice)} ETH`) : "",
  ].join("");

  $("#attrs").innerHTML =
    (meta.attributes || []).map((a) => `<tr><td class="text-secondary">${a.trait_type}</td><td class="text-end">${a.value}</td></tr>`).join("") ||
    `<tr><td class="text-secondary">No attributes</td></tr>`;

  $("#activity").innerHTML =
    (info.activity || [])
      .map(
        (a) => `<tr>
        <td><span class="badge text-bg-dark">${a.type}</span></td>
        <td class="mono small" title="${a.from || ""}">${short(a.from)}</td>
        <td class="mono small" title="${a.to || ""}">${short(a.to)}</td>
        <td>${a.price ? fmt(a.price) + " ETH" : "—"}</td>
        <td class="small">${a.block}</td>
        <td class="mono small" title="${a.txHash || ""}">${a.txHash ? a.txHash.slice(0, 10) + "…" : "—"}</td>
        <td class="small text-secondary">${new Date(Number(a.timestamp) * 1000).toLocaleString()}</td>
      </tr>`,
      )
      .join("") || `<tr><td colspan="7" class="text-secondary">No activity yet.</td></tr>`;

  $("#loading").classList.add("d-none");
  $("#content").classList.remove("d-none");
}

initWallet();
wireGrid(load); // buy button -> reload after purchase
load();
