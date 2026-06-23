// Chart.js helpers for price history, trade history, market overview + sparklines.
// Charts are derived entirely from the indexer's `activity` / `sale` data —
// no extra on-chain calls. x-axis is event-ordered (date-labelled) so it reads
// cleanly even when a local chain mines events seconds apart.
import Chart from "https://cdn.jsdelivr.net/npm/chart.js@4.5.0/auto/+esm";

// dark theme to match the Bootstrap dark UI
Chart.defaults.color = "#9aa3af";
Chart.defaults.borderColor = "rgba(255,255,255,.06)";
Chart.defaults.font.family = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.animation = { duration: 350 };

const PURPLE = "#9b6bff";
const GREEN = "#34d399";
const BLUE = "#38bdf8";

export const ethOf = (wei) => Number(BigInt(wei ?? 0)) / 1e18;
const when = (ts) => new Date(Number(ts) * 1000).toLocaleString();
const day = (ts) => new Date(Number(ts) * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fade = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

// one chart per <canvas>; replace on re-render
function mount(canvas, config) {
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, config);
  return canvas._chart;
}

// ---- price series derivation -------------------------------------------------
// Walk the ordered event log into an "asking price" step line + "sold" markers.
// A `list`/`update` sets the current asking price; a `cancel` (or post-`sale`
// delisting) breaks the line so off-market gaps are visible; a `sale` drops a
// green marker at the realized price (== the listing price the buyer paid).
export function priceSeries(activity) {
  const ev = (activity || [])
    .filter((a) => ["list", "update", "sale", "cancel"].includes(a.type))
    .slice()
    .sort((a, b) => Number(BigInt(a.block) - BigInt(b.block)));
  const labels = [], ask = [], sale = [], meta = [];
  let cur = null;
  for (const e of ev) {
    labels.push(day(e.timestamp));
    meta.push(e);
    if (e.type === "list" || e.type === "update") {
      cur = ethOf(e.price);
      ask.push(cur); sale.push(null);
    } else if (e.type === "sale") {
      ask.push(ethOf(e.price)); // the asking line meets the sale point
      sale.push(ethOf(e.price));
      cur = null; // item is delisted after a sale until re-listed
    } else { // cancel
      ask.push(null); sale.push(null); cur = null;
    }
  }
  return { labels, ask, sale, meta, points: ev.length };
}

// ---- price history (asking line + sold markers) -----------------------------
export function renderPriceHistory(canvas, activity) {
  const s = priceSeries(activity);
  if (!s.points) return false;
  mount(canvas, {
    type: "line",
    data: {
      labels: s.labels,
      datasets: [
        {
          label: "Asking price", data: s.ask, stepped: true, spanGaps: false,
          borderColor: PURPLE, backgroundColor: fade(PURPLE, 0.12), fill: true,
          borderWidth: 2, pointRadius: 3, pointBackgroundColor: PURPLE, tension: 0,
        },
        {
          label: "Sold", data: s.sale, showLine: false,
          pointRadius: 6, pointHoverRadius: 8, pointStyle: "rectRot",
          pointBackgroundColor: GREEN, pointBorderColor: "#0c0e14", pointBorderWidth: 1.5,
        },
      ],
    },
    options: {
      interaction: { intersect: false, mode: "index" },
      scales: {
        y: { ticks: { callback: (v) => v + " Ξ" }, grace: "8%" },
        x: { ticks: { maxRotation: 0, autoSkipPadding: 16 } },
      },
      plugins: {
        legend: { labels: { boxWidth: 10, usePointStyle: true } },
        tooltip: {
          callbacks: {
            title: (items) => when(s.meta[items[0].dataIndex].timestamp),
            label: (ctx) => {
              const e = s.meta[ctx.dataIndex];
              if (ctx.datasetIndex === 1) return ctx.raw == null ? null : `Sold for ${ctx.raw.toFixed(4)} Ξ`;
              if (ctx.raw == null) return "Off market";
              const verb = e.type === "list" ? "Listed" : "Price updated";
              return `${verb}: ${ctx.raw.toFixed(4)} Ξ`;
            },
          },
        },
      },
    },
  });
  return true;
}

// ---- trade history (realized sales as bars) ---------------------------------
export function renderTradeHistory(canvas, sales) {
  const rows = (sales || []).slice().sort((a, b) => Number(BigInt(a.timestamp) - BigInt(b.timestamp)));
  if (!rows.length) return false;
  mount(canvas, {
    type: "bar",
    data: {
      labels: rows.map((s) => day(s.timestamp)),
      datasets: [{
        label: "Sale price", data: rows.map((s) => ethOf(s.price)),
        backgroundColor: fade(GREEN, 0.5), borderColor: GREEN, borderWidth: 1, borderRadius: 4,
      }],
    },
    options: {
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + " Ξ" } }, x: { ticks: { maxRotation: 0 } } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => when(rows[items[0].dataIndex].timestamp),
            label: (ctx) => `${ctx.raw.toFixed(4)} Ξ`,
          },
        },
      },
    },
  });
  return true;
}

// ---- market overview (home) -------------------------------------------------
// per-sale price bars + cumulative volume line (dual axis).
export function renderMarket(canvas, points) {
  const rows = points || [];
  if (!rows.length) return false;
  mount(canvas, {
    type: "bar", // base type for the mixed bar + line chart
    data: {
      labels: rows.map((p) => day(p.t)),
      datasets: [
        {
          type: "bar", label: "Sale price", yAxisID: "y",
          data: rows.map((p) => ethOf(p.priceWei)),
          backgroundColor: fade(BLUE, 0.45), borderColor: BLUE, borderWidth: 1, borderRadius: 3,
        },
        {
          type: "line", label: "Cumulative volume", yAxisID: "y1",
          data: rows.map((p) => ethOf(p.cumVolWei)),
          borderColor: PURPLE, backgroundColor: fade(PURPLE, 0.12), fill: true,
          borderWidth: 2, pointRadius: 0, tension: 0.3,
        },
      ],
    },
    options: {
      interaction: { intersect: false, mode: "index" },
      scales: {
        y: { position: "left", beginAtZero: true, ticks: { callback: (v) => v + " Ξ" }, title: { display: true, text: "Sale" } },
        y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: (v) => v + " Ξ" }, title: { display: true, text: "Volume" } },
        x: { ticks: { maxRotation: 0, autoSkipPadding: 24 } },
      },
      plugins: {
        legend: { labels: { boxWidth: 10, usePointStyle: true } },
        tooltip: {
          callbacks: {
            title: (items) => when(rows[items[0].dataIndex].t),
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(4)} Ξ`,
            afterBody: (items) => `Item #${rows[items[0].dataIndex].tokenId}`,
          },
        },
      },
    },
  });
  return true;
}

// ---- mini sparkline (modal) -------------------------------------------------
// returns the Chart instance (or null) so the caller can destroy it — the modal
// rebuilds its canvas via innerHTML, which bypasses the canvas._chart guard.
export function renderSparkline(canvas, activity) {
  const s = priceSeries(activity);
  const pts = s.ask.filter((v) => v != null);
  if (pts.length < 2) return null;
  const up = pts[pts.length - 1] >= pts[0];
  const col = up ? GREEN : "#f87171";
  return mount(canvas, {
    type: "line",
    data: { labels: s.ask.map((_, i) => i), datasets: [{ data: s.ask, borderColor: col, backgroundColor: fade(col, 0.12), fill: true, spanGaps: true, borderWidth: 1.5, pointRadius: 0, tension: 0.25 }] },
    options: {
      animation: false,
      scales: { x: { display: false }, y: { display: false, grace: "10%" } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  });
}

// ---- price stats (derived, shared by detail page + modal) -------------------
// first/last asking price, all-time high & low (sales, else listings), and the
// net change since the first listing — captures "seller dropped the price".
export function priceStats(info) {
  const acts = (info.activity || []).slice().sort((a, b) => Number(BigInt(a.block) - BigInt(b.block)));
  const asks = acts.filter((a) => a.type === "list" || a.type === "update").map((a) => BigInt(a.price));
  const sales = (info.sales || []).map((s) => BigInt(s.price));
  const max = (arr) => arr.reduce((m, v) => (v > m ? v : m), 0n);
  const min = (arr) => arr.reduce((m, v) => (m === 0n || v < m ? v : m), 0n);
  const firstAsk = asks[0] ?? null;
  // only an ACTIVE listing is the live price; otherwise fall back to the last
  // realized sale, else the last asking price (cancelled / sold items).
  const live = info.listing && info.listing.active ? BigInt(info.listing.price) : null;
  const current = live ?? (sales.length ? sales[sales.length - 1] : (asks.length ? asks[asks.length - 1] : null));
  // all-time high/low spans the whole price history (asking prices + realized
  // sales) so the high never reads below the current ask shown elsewhere.
  const priced = [...asks, ...sales];
  const high = max(priced);
  const low = min(priced);
  let changePct = null;
  if (firstAsk && current != null && firstAsk > 0n) {
    changePct = Number(((current - firstAsk) * 10000n) / firstAsk) / 100;
  }
  return {
    currentWei: current != null ? current.toString() : null,
    highWei: high ? high.toString() : null,
    lowWei: low ? low.toString() : null,
    lastSaleWei: sales.length ? sales[sales.length - 1].toString() : null,
    changePct,
    trades: sales.length,
  };
}
