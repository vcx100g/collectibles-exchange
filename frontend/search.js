import { $, INDEXER, fetchMeta, cardHtml, fadeInImages, fmt, wireGrid, initWallet } from "./shared.js";

const PER_PAGE = 20;
const CATS = ["Card", "Painting", "Wine", "Farm", "Art", "Antique"];
let page = 1;
let debounce;

// which attributes are filterable per category
const FILTER_TRAITS = {
  Card: ["Rarity", "Type", "Set"],
  Wine: ["Region", "Vintage", "Producer"],
  Painting: ["Style", "Medium"],
  Farm: ["Type", "Season"],
  Art: ["Medium", "Style"],
  Antique: ["Era", "Origin", "Material"],
};

// render attribute dropdowns when exactly one category is selected
async function updateAttrFilters() {
  const box = $("#attr-filters");
  const checked = CATS.filter((c) => $(`#cat-${c}`).checked);
  if (checked.length !== 1) { box.innerHTML = ""; return; }
  const cat = checked[0];
  let facets = {};
  try { facets = await (await fetch(`${INDEXER}/facets?category=${encodeURIComponent(cat)}`)).json(); } catch {}
  box.innerHTML = (FILTER_TRAITS[cat] || [])
    .filter((t) => facets[t]?.length)
    .map((t) => `<div class="mb-2"><div class="small text-secondary mb-1">${t}</div>
      <select class="form-select form-select-sm attr-filter" data-trait="${t}">
        <option value="">Any</option>
        ${facets[t].map((v) => `<option value="${v}">${v}</option>`).join("")}
      </select></div>`)
    .join("");
  box.querySelectorAll(".attr-filter").forEach((s) => s.addEventListener("change", () => { page = 1; search(); }));
}

// Build the server-side query from the filter sidebar.
function criteria() {
  const p = new URLSearchParams();
  const text = $("#f-text").value.trim();
  const cats = CATS.filter((c) => $(`#cat-${c}`).checked);
  const min = $("#f-min").value;
  const max = $("#f-max").value;
  if (text) p.set("q", text);
  if (cats.length) p.set("category", cats.join(","));
  if (min) p.set("minPrice", min);
  if (max) p.set("maxPrice", max);
  $("#attr-filters").querySelectorAll(".attr-filter").forEach((s) => { if (s.value) p.set(`attr_${s.dataset.trait}`, s.value); });
  p.set("sort", $("#f-sort").value);
  p.set("page", String(page));
  p.set("perPage", String(PER_PAGE));
  return p;
}

async function search() {
  const grid = $("#results");
  grid.innerHTML = `<div class="col-12 text-center text-secondary py-5"><div class="spinner-border spinner-border-sm"></div></div>`;
  let d;
  try {
    d = await (await fetch(`${INDEXER}/search?${criteria()}`)).json();
  } catch {
    grid.innerHTML = `<div class="col-12"><p class="text-danger">Couldn't reach the indexer.</p></div>`;
    return;
  }
  const refs = d.results;
  // only the 20 results on this page need their images
  const metas = await Promise.all(refs.map((r) => fetchMeta(r.tokenId)));
  grid.innerHTML = refs
    .map((r, i) =>
      cardHtml(
        r.tokenId,
        metas[i],
        `<button class="btn btn-sm btn-primary w-100" data-buy="${r.tokenId}" data-price="${r.price}">Buy · ${fmt(r.price)} ETH</button>`,
      ),
    )
    .join("");
  fadeInImages(grid);

  const pages = Math.max(1, Math.ceil(d.total / PER_PAGE));
  $("#no-results").classList.toggle("d-none", d.total > 0);
  $("#result-count").textContent = `${d.total} item${d.total !== 1 ? "s" : ""}`;
  $("#page-info").textContent = `Page ${d.page} / ${pages}`;
  $("#prev-btn").disabled = d.page <= 1;
  $("#next-btn").disabled = d.page >= pages;
}

const refilter = () => { page = 1; search(); };
const refilterDebounced = () => { clearTimeout(debounce); debounce = setTimeout(refilter, 300); };

$("#f-text").addEventListener("input", refilterDebounced);
$("#f-min").addEventListener("input", refilterDebounced);
$("#f-max").addEventListener("input", refilterDebounced);
$("#f-sort").addEventListener("change", refilter);
CATS.forEach((c) => $(`#cat-${c}`).addEventListener("change", async () => { await updateAttrFilters(); refilter(); }));
$("#reset-btn").addEventListener("click", () => {
  $("#f-text").value = "";
  $("#f-min").value = "";
  $("#f-max").value = "";
  $("#f-sort").value = "newest";
  CATS.forEach((c) => ($(`#cat-${c}`).checked = false));
  $("#attr-filters").innerHTML = "";
  refilter();
});
$("#prev-btn").addEventListener("click", () => { if (page > 1) { page--; search(); window.scrollTo(0, 0); } });
$("#next-btn").addEventListener("click", () => { page++; search(); window.scrollTo(0, 0); });

// presets from URL (?sort=price-desc, ?cat=Wine)
const params = new URLSearchParams(location.search);
if (params.get("sort")) $("#f-sort").value = params.get("sort");
if (params.get("cat") && CATS.includes(params.get("cat"))) $(`#cat-${params.get("cat")}`).checked = true;

initWallet();
wireGrid(search); // after a buy, re-run the query (item is no longer listed)
await updateAttrFilters();
search();
