import { $, INDEXER, fetchMeta, cardHtml, fadeInImages, fmt, wireGrid, initWallet } from "./shared.js";

const SHOW = 6; // cards per section

const buyAction = (tokenId, price) =>
  `<button class="btn btn-sm btn-primary w-100" data-buy="${tokenId}" data-price="${price}">Buy · ${fmt(price)} ETH</button>`;
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
      return cardHtml(r.tokenId, metas[i], action, extra);
    })
    .join("");
  fadeInImages(grid);
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
