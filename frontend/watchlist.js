import { $, INDEXER, fetchMeta, cardHtml, fadeInImages, listFavs, wireGrid, initWallet } from "./shared.js";

const buyAction = (id, price) => `<button class="btn btn-sm btn-primary w-100" data-buy="${id}" data-price="${price}">Buy</button>`;
const viewAction = (id) => `<button class="btn btn-sm btn-outline-light w-100" data-detail="${id}">View</button>`;

async function load() {
  const grid = $("#wl-grid");
  const ids = listFavs();
  if (!ids.length) { grid.innerHTML = ""; $("#wl-empty").classList.remove("d-none"); return; }
  $("#wl-empty").classList.add("d-none");
  grid.innerHTML = `<div class="col-12 text-center text-secondary py-5"><div class="spinner-border spinner-border-sm"></div></div>`;
  const [metas, infos] = await Promise.all([
    Promise.all(ids.map((id) => fetchMeta(id))),
    Promise.all(ids.map((id) => fetch(`${INDEXER}/item/${id}`).then((r) => r.json()).catch(() => ({})))),
  ]);
  grid.innerHTML = ids
    .map((id, i) => {
      const info = infos[i] || {};
      const listed = info.listing && info.listing.price;
      const action = listed ? buyAction(id, info.listing.price) : viewAction(id);
      return cardHtml(id, metas[i], action, "", listed ? info.listing.price : null);
    })
    .join("");
  fadeInImages(grid);
}

initWallet();
wireGrid(load); // buy refreshes the list
document.addEventListener("vx:fav-changed", load); // un-favouriting removes it live
load();
