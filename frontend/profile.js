import { $, INDEXER, fetchMeta, cardHtml, fadeInImages, fmt, usdOf, addrLink, escapeHtml, identiconSvg, getAccount, emptyState, toast, wireGrid, initWallet } from "./shared.js";

const address = new URLSearchParams(location.search).get("address");

const sTile = (label, val, sub = "") =>
  `<div class="col"><div class="card h-100"><div class="card-body py-2 px-3">
     <div class="text-secondary small">${label}</div><div class="fs-5 fw-semibold">${val}</div>
     ${sub ? `<div class="small text-secondary">${sub}</div>` : ""}</div></div></div>`;

const buyAction = (id, price) => `<button class="btn btn-sm btn-primary w-100" data-buy="${id}" data-price="${price}">Buy</button>`;
const viewAction = (id) => `<button class="btn btn-sm btn-outline-light w-100" data-detail="${id}">View</button>`;

async function load() {
  if (!address) { $("#loading").textContent = "No address supplied."; return; }
  let u;
  try {
    u = await (await fetch(`${INDEXER}/user/${address}`)).json();
  } catch {
    $("#loading").innerHTML = emptyState("⚠️", "Couldn't reach the indexer", "The backend (:42069) may be starting up.");
    return;
  }

  $("#p-identicon").innerHTML = identiconSvg(address, 56);
  $("#p-addr").textContent = address;
  if (getAccount() && getAccount().toLowerCase() === address.toLowerCase()) $("#p-you").classList.remove("d-none");

  $("#p-stats").innerHTML = [
    sTile("Items owned", u.itemsOwned ?? 0),
    sTile("Active listings", u.activeListings ?? 0),
    sTile("Sold", u.sold ?? 0),
    sTile("Bought", u.bought ?? 0),
    sTile("Earned", `${fmt(u.grossSoldWei)} ETH`, usdOf(u.grossSoldWei)),
    sTile("Spent", `${fmt(u.spentWei)} ETH`, usdOf(u.spentWei)),
  ].join("");

  const listings = u.listings || [];
  if (listings.length) {
    const metas = await Promise.all(listings.map((l) => fetchMeta(l.tokenId)));
    $("#p-listed").innerHTML = listings.map((l, i) => cardHtml(l.tokenId, metas[i], buyAction(l.tokenId, l.price), "", l.price)).join("");
    fadeInImages($("#p-listed"));
  } else $("#p-listed-empty").classList.remove("d-none");

  const ownedIds = u.ownedIds || [];
  if (ownedIds.length) {
    const metas = await Promise.all(ownedIds.map((id) => fetchMeta(id)));
    $("#p-owned").innerHTML = ownedIds.map((id, i) => cardHtml(id, metas[i], viewAction(id))).join("");
    fadeInImages($("#p-owned"));
  } else $("#p-owned-empty").classList.remove("d-none");

  $("#p-activity").innerHTML =
    (u.activity || [])
      .map(
        (a) => `<tr>
        <td><span class="badge text-bg-dark">${escapeHtml(a.type)}</span></td>
        <td><a href="item.html?id=${a.tokenId}" class="text-reset">#${a.tokenId}</a></td>
        <td class="mono small">${addrLink(a.from)}</td>
        <td class="mono small">${addrLink(a.to)}</td>
        <td>${a.price ? fmt(a.price) + " ETH" : "—"}</td>
        <td class="small text-secondary">${new Date(Number(a.timestamp) * 1000).toLocaleString()}</td>
      </tr>`,
      )
      .join("") || `<tr><td colspan="6" class="text-secondary">No activity yet.</td></tr>`;

  $("#loading").classList.add("d-none");
  $("#content").classList.remove("d-none");
}

$("#copy-addr").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(address || ""); toast("Address copied", "success"); }
  catch { toast("Press Ctrl/⌘+C to copy", "secondary"); }
});

initWallet();
wireGrid(load); // a buy/fav from this page refreshes it
load();
