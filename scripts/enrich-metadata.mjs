// Add richer, category-specific attributes to every item's metadata JSON.
// Deterministic (seeded by token id) and idempotent (skips traits already
// present). No re-mint / no image change — just the off-chain JSON.
//   node scripts/enrich-metadata.mjs   then re-index the indexer
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const pick = (arr, id, salt = 0) => arr[(Number(id) + salt) % arr.length];

const EXTRA = {
  Card: (id, a) => [
    { trait_type: "Illustrator", value: pick(["Mitsuhiro Arita", "Ken Sugimori", "5ban Graphics", "Naoyo Kimura", "Atsuko Nishida"], id, 1) },
    { trait_type: "Card Number", value: `${(Number(id) % 180) + 1}/180` },
    { trait_type: "Condition", value: pick(["PSA 10 Gem Mint", "PSA 9 Mint", "PSA 8 NM-Mint", "Near Mint", "Lightly Played"], id, 2) },
    { trait_type: "Language", value: pick(["English", "Japanese", "German", "French"], id, 3) },
    { trait_type: "Holofoil", value: /Holo|Ultra/.test(a.Rarity || "") ? "Yes" : pick(["Reverse Holo", "No"], id, 4) },
    { trait_type: "First Edition", value: pick(["Yes", "No"], id, 5) },
  ],
  Wine: (id, a) => {
    const grape = ({ Bordeaux: "Cabernet Sauvignon Blend", Burgundy: "Pinot Noir", Champagne: "Chardonnay / Pinot Noir", "Napa Valley": "Cabernet Sauvignon", "Barossa Valley": "Shiraz", Piedmont: "Nebbiolo", Douro: "Touriga Nacional", Tuscany: "Sangiovese", Rioja: "Tempranillo" })[a.Region] || "Red Blend";
    const v = Number(a.Vintage) || 2000;
    return [
      { trait_type: "Grape", value: grape },
      { trait_type: "ABV", value: pick(["12.5%", "13.0%", "13.5%", "14.0%", "14.5%", "15.0%"], id, 1) },
      { trait_type: "Bottle Size", value: pick(["750 ml", "750 ml", "1.5 L (Magnum)"], id, 2) },
      { trait_type: "Critic Score", value: `${92 + (Number(id) % 9)}/100` },
      { trait_type: "Drink By", value: String(v + 20 + (Number(id) % 25)) },
      { trait_type: "Closure", value: "Natural Cork" },
    ];
  },
  Painting: (id) => [
    { trait_type: "Dimensions", value: pick(["60 × 90 cm", "100 × 80 cm", "73 × 92 cm", "50 × 65 cm", "120 × 90 cm"], id, 1) },
    { trait_type: "Signed", value: "Yes — lower right" },
    { trait_type: "Provenance", value: pick(["Private Collection", "Estate of the Artist", "Gallery Acquisition", "Auction — Christie's"], id, 2) },
    { trait_type: "Condition", value: pick(["Excellent", "Very Good", "Restored", "Good"], id, 3) },
    { trait_type: "Framed", value: pick(["Yes — Gilded", "Yes — Modern", "Unframed"], id, 4) },
  ],
  Farm: (id) => [
    { trait_type: "Quantity", value: pick(["12 acres", "40 acres", "500 kg", "250 kg", "1 head", "20 head"], id, 1) },
    { trait_type: "Certification", value: pick(["USDA Organic", "Demeter Biodynamic", "Conventional", "Fair Trade"], id, 2) },
    { trait_type: "Harvest", value: String(2023 + (Number(id) % 3)) },
    { trait_type: "Coordinates", value: `${34 + (Number(id) % 12)}.${100 + (Number(id) % 800)}° N` },
  ],
  Art: (id) => [
    { trait_type: "Dimensions", value: pick(["4000 × 4000 px", "3840 × 2160 px", "2048 × 2048 px"], id, 1) },
    { trait_type: "Format", value: pick(["PNG", "WEBP", "MP4", "SVG"], id, 2) },
    { trait_type: "Blockchain", value: "Ethereum" },
    { trait_type: "License", value: pick(["CC BY-NC 4.0", "Personal Use", "Full Commercial"], id, 3) },
    { trait_type: "Collection", value: "VaultX Genesis" },
  ],
  Antique: (id) => [
    { trait_type: "Dimensions", value: pick(["H 24 cm", "H 18 × W 12 cm", "Ø 15 cm", "L 70 cm"], id, 1) },
    { trait_type: "Weight", value: pick(["1.2 kg", "0.4 kg", "3.5 kg", "0.8 kg"], id, 2) },
    { trait_type: "Condition", value: pick(["Excellent", "Good", "Fair", "Restored"], id, 3) },
    { trait_type: "Provenance", value: pick(["Private Collection", "Auction House", "Museum Deaccession", "Family Estate"], id, 4) },
    { trait_type: "Authentication", value: pick(["Certified — Sotheby's", "Thermoluminescence Tested", "Expert Appraised", "C14 Dated"], id, 5) },
  ],
};

let updated = 0;
for (const f of readdirSync("metadata")) {
  if (!f.endsWith(".json")) continue;
  const id = f.replace(".json", "");
  const p = "metadata/" + f;
  const m = JSON.parse(readFileSync(p, "utf8"));
  const a = {};
  for (const x of m.attributes || []) a[x.trait_type] = x.value;
  const fn = EXTRA[a.Category];
  if (!fn) continue;
  const have = new Set((m.attributes || []).map((x) => x.trait_type));
  const extra = fn(id, a).filter((x) => !have.has(x.trait_type));
  if (extra.length) {
    m.attributes.push(...extra);
    writeFileSync(p, JSON.stringify(m, null, 2));
    updated++;
  }
}
console.log(`enriched ${updated} items`);
