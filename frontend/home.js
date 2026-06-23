import { $, INDEXER, fetchMeta, cardHtml, fadeInImages, fmt, usdOf, listRecent, wireGrid, initWallet } from "./shared.js";
import { renderMarket } from "./charts.js";

const SHOW = 6; // cards per section

const mTile = (label, val, sub = "") =>
  `<div class="col-6 col-md-3"><div class="card h-100"><div class="card-body py-2 px-3">
     <div class="text-secondary small">${label}</div><div class="fs-5 fw-semibold">${val}</div>
     ${sub ? `<div class="small text-secondary">${sub}</div>` : ""}</div></div></div>`;

async function loadMarket() {
  let m;
  try {
    m = await (await fetch(`${INDEXER}/market`)).json();
  } catch {
    $("#market-chart").classList.add("d-none");
    $("#market-empty").textContent = "Couldn't load market data — is the indexer running?";
    $("#market-empty").classList.remove("d-none");
    return;
  }
  const t = m.totals || {};
  $("#market-stats").innerHTML = [
    mTile("Volume", `${fmt(t.volumeWei)} ETH`, `${usdOf(t.volumeWei)} · ${t.sales || 0} sales`),
    mTile("Avg sale", `${fmt(t.avgWei)} ETH`, usdOf(t.avgWei)),
    mTile("Top sale", `${fmt(t.highWei)} ETH`, usdOf(t.highWei)),
    mTile("Platform fees", `${fmt(t.platformFeesWei)} ETH`, `+ ${fmt(t.royaltiesWei)} ETH royalties`),
  ].join("");
  if (!renderMarket($("#market-chart"), m.points)) {
    $("#market-chart").classList.add("d-none");
    $("#market-empty").classList.remove("d-none");
  }
}

const buyAction = (tokenId, price) =>
  `<button class="btn btn-sm btn-primary w-100" data-buy="${tokenId}" data-price="${price}">Buy</button>`;
const viewAction = (tokenId) =>
  `<button class="btn btn-sm btn-outline-light w-100" data-detail="${tokenId}">View</button>`;

async function render(elId, refs, opts) {
  const grid = $(elId);
  refs = (refs || []).slice(0, SHOW);
  if (!refs.length) {
    grid.innerHTML = `<div class="col-12"><p class="text-secondary small">Nothing yet — go make a trade.</p></div>`;
    return;
  }
  const metas = await Promise.all(refs.map((r) => fetchMeta(r.tokenId)));
  grid.innerHTML = refs
    .map((r, i) => {
      const action = opts.buyable && r.price ? buyAction(r.tokenId, r.price) : viewAction(r.tokenId);
      const extra = opts.label ? `<div class="small text-secondary mb-1">${opts.label(r)}</div>` : "";
      return cardHtml(r.tokenId, metas[i], action, extra, opts.buyable && r.price ? r.price : null);
    })
    .join("");
  fadeInImages(grid);
}

async function renderRecent() {
  const ids = listRecent().slice(0, SHOW);
  const wrap = $("#sec-recent-wrap");
  if (!ids.length) { wrap.classList.add("d-none"); return; }
  const metas = await Promise.all(ids.map((id) => fetchMeta(id)));
  $("#sec-recent").innerHTML = ids.map((id, i) => cardHtml(id, metas[i], viewAction(id))).join("");
  fadeInImages($("#sec-recent"));
  wrap.classList.remove("d-none");
}

async function load() {
  let d;
  try {
    d = await (await fetch(`${INDEXER}/home`)).json();
  } catch {
    $("#sec-latest").innerHTML = `<div class="col-12"><p class="text-danger small">Couldn't reach the indexer.</p></div>`;
    return;
  }
  await Promise.all([
    render("#sec-latest", d.latestTrades, { buyable: false, label: (r) => `sold · ${fmt(r.price)} ETH` }),
    render("#sec-valued", d.mostValued, { buyable: true }),
    render("#sec-traded", d.mostTraded, { buyable: true, label: (r) => `${r.trades} trade${r.trades > 1 ? "s" : ""}` }),
  ]);
}

initWallet();
wireGrid(load); // reload sections after a buy
load();
loadMarket();
renderRecent();
