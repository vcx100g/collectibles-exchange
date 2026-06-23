import { $, INDEXER, fetchMeta, catOf, cardHtml, fadeInImages, fmt, wireGrid, initWallet } from "./shared.js";

const PER_PAGE = 20;
const CATS = ["Card", "Painting", "Wine", "Farm", "Art", "Antique"];
let all = [];
let filtered = [];
let page = 1;

async function loadAll() {
  const grid = $("#results");
  grid.innerHTML = `<div class="col-12 text-center text-secondary py-5"><div class="spinner-border spinner-border-sm"></div> loading…</div>`;
  let rows;
  try {
    rows = await (await fetch(`${INDEXER}/listings`)).json();
  } catch {
    grid.innerHTML = `<div class="col-12"><p class="text-danger">Couldn't reach the indexer.</p></div>`;
    return;
  }
  const refs = rows.map((r) => ({ tokenId: r.tokenId, price: BigInt(r.price), seller: String(r.seller || "").toLowerCase() }));
  const metas = await Promise.all(refs.map((r) => fetchMeta(r.tokenId)));
  all = refs.map((r, i) => ({ ...r, meta: metas[i], cat: catOf(metas[i]), name: String(metas[i].name || "").toLowerCase() }));
  applyFilters();
}

function readCriteria() {
  return {
    text: $("#f-text").value.trim().toLowerCase(),
    cats: CATS.filter((c) => $(`#cat-${c}`).checked),
    min: parseFloat($("#f-min").value) || 0,
    max: parseFloat($("#f-max").value) || Infinity,
    sort: $("#f-sort").value,
  };
}

function applyFilters() {
  const { text, cats, min, max, sort } = readCriteria();
  filtered = all.filter((x) => {
    if (text && !x.name.includes(text)) return false;
    if (cats.length && !cats.includes(x.cat)) return false;
    const eth = +fmt(x.price);
    return eth >= min && eth <= max;
  });
  if (sort === "price-asc") filtered.sort((a, b) => (a.price > b.price ? 1 : -1));
  else if (sort === "price-desc") filtered.sort((a, b) => (a.price > b.price ? -1 : 1));
  else filtered.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
  page = 1;
  renderPage();
}

function renderPage() {
  const grid = $("#results");
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  page = Math.min(Math.max(1, page), pages);
  const slice = filtered.slice((page - 1) * PER_PAGE, (page - 1) * PER_PAGE + PER_PAGE);
  $("#no-results").classList.toggle("d-none", total > 0);
  grid.innerHTML = slice
    .map((x) =>
      cardHtml(
        x.tokenId,
        x.meta,
        `<button class="btn btn-sm btn-primary w-100" data-buy="${x.tokenId}" data-price="${x.price}">Buy · ${fmt(x.price)} ETH</button>`,
      ),
    )
    .join("");
  fadeInImages(grid);
  $("#result-count").textContent = `${total} item${total !== 1 ? "s" : ""}`;
  $("#page-info").textContent = `Page ${page} / ${pages}`;
  $("#prev-btn").disabled = page <= 1;
  $("#next-btn").disabled = page >= pages;
}

// wiring
$("#f-text").addEventListener("input", applyFilters);
$("#f-min").addEventListener("input", applyFilters);
$("#f-max").addEventListener("input", applyFilters);
$("#f-sort").addEventListener("change", applyFilters);
CATS.forEach((c) => $(`#cat-${c}`).addEventListener("change", applyFilters));
$("#reset-btn").addEventListener("click", () => {
  $("#f-text").value = "";
  $("#f-min").value = "";
  $("#f-max").value = "";
  $("#f-sort").value = "newest";
  CATS.forEach((c) => ($(`#cat-${c}`).checked = false));
  applyFilters();
});
$("#prev-btn").addEventListener("click", () => { if (page > 1) { page--; renderPage(); window.scrollTo(0, 0); } });
$("#next-btn").addEventListener("click", () => { page++; renderPage(); window.scrollTo(0, 0); });

// preset from URL (?sort=price-desc, ?cat=Wine)
const params = new URLSearchParams(location.search);
if (params.get("sort")) $("#f-sort").value = params.get("sort");
if (params.get("cat") && CATS.includes(params.get("cat"))) $(`#cat-${params.get("cat")}`).checked = true;

initWallet();
wireGrid(loadAll); // after a buy, the item is no longer listed -> reload
loadAll();
