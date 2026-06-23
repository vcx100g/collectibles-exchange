// Shared site chrome — one canonical navbar + footer injected into every page,
// plus small render helpers (escapeHtml, identicon, address→profile links) that
// every page can import. Loaded as its own <script type="module"> on each page.
import * as cfg from "./config.js";

const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");

// Escape user/metadata strings before they go into innerHTML. tokenURI + name +
// attributes are attacker-controllable (mintItem is open), so this is required.
export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Deterministic gradient identicon derived from an address (no library).
let icN = 0;
export function identiconSvg(address, size = 18) {
  const a = (address || "0x0").toLowerCase();
  let h = 0;
  for (let i = 2; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
  const id = `ic-${h}-${icN++}`;
  const hue1 = h % 360, hue2 = (Math.floor(h / 8)) % 360;
  return `<svg class="identicon" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue1} 70% 56%)"/><stop offset="1" stop-color="hsl(${hue2} 68% 44%)"/>
    </linearGradient></defs><rect width="16" height="16" rx="8" fill="url(#${id})"/></svg>`;
}

// Address rendered as identicon + short hex, linking to its public profile.
export function addrLink(address, label) {
  if (!address) return "—";
  return `<a href="/profile.html?address=${address}" class="text-reset text-decoration-none" title="${escapeHtml(address)}">${identiconSvg(address)} <span class="mono">${escapeHtml(label || short(address))}</span></a>`;
}

// ---------------------------- chrome injection -----------------------------
// Home is reachable via the brand logo, so it's intentionally not a nav pill.
const NAV = [
  { href: "/search.html", label: "Search", icon: "🔍", match: (p) => p.endsWith("/search.html") },
  { href: "/activity.html", label: "Activity", icon: "📈", match: (p) => p.endsWith("/activity.html") },
  { href: "/watchlist.html", label: "Watchlist", icon: "♥", match: (p) => p.endsWith("/watchlist.html") },
  { href: "/dashboard.html", label: "My Account", icon: "👤", match: (p) => p.endsWith("/dashboard.html") },
];

function renderNav() {
  const slot = document.querySelector("#nav-links");
  if (!slot) return;
  const p = location.pathname;
  slot.innerHTML = NAV.map((n) => {
    const active = n.match(p);
    return `<a href="${n.href}" class="vx-navlink${active ? " active" : ""}"${active ? ' aria-current="page"' : ""}><span class="vx-navicon" aria-hidden="true">${n.icon}</span>${n.label}</a>`;
  }).join("");
}

function renderFooter() {
  const slot = document.querySelector("#site-footer");
  if (!slot) return;
  slot.innerHTML = `<div class="container py-4">
    <div class="row gy-3 align-items-start">
      <div class="col-md-5">
        <div class="fs-5"><span class="brand-badge">VaultX</span></div>
        <p class="text-secondary small mb-2 mt-1">A non-custodial marketplace for 1-of-1 collectibles — cards, art, wine, farm goods &amp; antiques — settled on-chain with test ETH.</p>
        <span class="badge text-bg-secondary">Local testnet · chain ${cfg.CHAIN_ID}</span>
      </div>
      <div class="col-6 col-md-3">
        <div class="text-secondary text-uppercase small mb-2">Explore</div>
        <ul class="list-unstyled small mb-0 lh-lg">
          <li><a href="/search.html">Browse items</a></li>
          <li><a href="/activity.html">Activity feed</a></li>
          <li><a href="/watchlist.html">Watchlist</a></li>
          <li><a href="/dashboard.html">My account</a></li>
        </ul>
      </div>
      <div class="col-6 col-md-4">
        <div class="text-secondary text-uppercase small mb-2">Platform</div>
        <ul class="list-unstyled small mb-0 lh-lg">
          <li><a href="/about.html">About</a></li>
          <li><a href="/about.html#how">How it works</a></li>
          <li><a href="/about.html#faq">FAQ</a></li>
          <li><a href="/about.html#terms">Terms &amp; disclaimer</a></li>
        </ul>
        <div class="text-secondary mt-2" style="font-size:.7rem">
          NFT <span class="mono">${short(cfg.COLLECTIBLE_ADDRESS)}</span><br>
          Market <span class="mono">${short(cfg.MARKETPLACE_ADDRESS)}</span>
        </div>
      </div>
    </div>
    <div class="text-secondary small border-top border-secondary-subtle pt-3 mt-3 d-flex flex-wrap justify-content-between gap-2">
      <span>© 2026 VaultX · built on Ethereum (ERC-721 + ERC-2981)</span>
      <span>Prices in ETH · USD figures are indicative</span>
    </div>
  </div>`;
}

renderNav();
renderFooter();
