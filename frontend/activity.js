import { $, INDEXER, fmt, addrLink, escapeHtml, emptyState, wireGrid, initWallet } from "./shared.js";

const PER = 25;
let page = 1;
let type = "";

const rowHtml = (a) => `<tr>
  <td><span class="badge text-bg-dark">${escapeHtml(a.type)}</span></td>
  <td><a href="item.html?id=${a.tokenId}" class="text-reset">#${a.tokenId}</a></td>
  <td class="mono small">${addrLink(a.from)}</td>
  <td class="mono small">${addrLink(a.to)}</td>
  <td>${a.price ? fmt(a.price) + " ETH" : "—"}</td>
  <td class="small text-secondary">${new Date(Number(a.timestamp) * 1000).toLocaleString()}</td>
</tr>`;

async function load() {
  const tbody = $("#feed");
  tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary py-4"><div class="spinner-border spinner-border-sm"></div></td></tr>`;
  const p = new URLSearchParams({ page: String(page), perPage: String(PER) });
  if (type) p.set("type", type);
  let d;
  try {
    d = await (await fetch(`${INDEXER}/feed?${p}`)).json();
  } catch {
    tbody.innerHTML = `<tr><td colspan="6">${emptyState("⚠️", "Couldn't reach the indexer", "The backend (:42069) may be starting up.")}</td></tr>`;
    return;
  }
  const rows = d.results || [];
  tbody.innerHTML = rows.length
    ? rows.map(rowHtml).join("")
    : `<tr><td colspan="6" class="text-secondary py-4 text-center">No activity for this filter.</td></tr>`;
  const pages = Math.max(1, Math.ceil((d.total || 0) / PER));
  $("#page-info").textContent = `Page ${d.page} / ${pages}`;
  $("#prev-btn").disabled = d.page <= 1;
  $("#next-btn").disabled = d.page >= pages;
}

$("#chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll("#chips .chip").forEach((c) => c.classList.toggle("active", c === chip));
  type = chip.dataset.type;
  page = 1;
  load();
});
$("#prev-btn").addEventListener("click", () => { if (page > 1) { page--; load(); window.scrollTo(0, 0); } });
$("#next-btn").addEventListener("click", () => { page++; load(); window.scrollTo(0, 0); });

initWallet();
wireGrid(load); // a buy from the detail modal refreshes the feed
load();
