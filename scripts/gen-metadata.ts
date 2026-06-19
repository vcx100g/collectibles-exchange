// Generates the demo collectibles: metadata/<id>.json (ERC-721 Metadata JSON
// Schema) + a placeholder SVG image per item. Run once with:
//   hardhat run scripts/gen-metadata.ts   (no network needed)
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.METADATA_BASE_URL ?? "http://localhost:8080/metadata";

type Item = {
  id: number;
  name: string;
  category: "Card" | "Art" | "Wine" | "Antique";
  description: string;
  color: string;
  emoji: string;
  attributes: Array<{ trait_type: string; value: string | number; display_type?: string }>;
};

const ITEMS: Item[] = [
  {
    id: 0, name: "Charizard — Base Set", category: "Card", color: "#e8552d", emoji: "🔥",
    description: "1st-edition Base Set holofoil. The crown jewel of any collection.",
    attributes: [
      { trait_type: "Type", value: "Fire" },
      { trait_type: "Rarity", value: "Holo Rare" },
      { trait_type: "HP", value: 120, display_type: "number" },
      { trait_type: "Set", value: "Base Set" },
    ],
  },
  {
    id: 1, name: "Pikachu — Yellow Cheeks", category: "Card", color: "#f2c14e", emoji: "⚡",
    description: "The mascot. Yellow-cheeks print, near-mint condition.",
    attributes: [
      { trait_type: "Type", value: "Electric" },
      { trait_type: "Rarity", value: "Rare" },
      { trait_type: "HP", value: 60, display_type: "number" },
      { trait_type: "Set", value: "Base Set" },
    ],
  },
  {
    id: 2, name: "Neon Genesis #1", category: "Art", color: "#7b2ff7", emoji: "🖼️",
    description: "A 1-of-1 generative digital artwork. Signed by the artist on-chain.",
    attributes: [
      { trait_type: "Artist", value: "A. Rivera" },
      { trait_type: "Edition", value: "1 of 1" },
      { trait_type: "Medium", value: "Generative / Digital" },
      { trait_type: "Year", value: 2026, display_type: "number" },
    ],
  },
  {
    id: 3, name: "Abstract Flow", category: "Art", color: "#2d9cdb", emoji: "🎨",
    description: "Hand-painted abstract, scanned and tokenised as a certificate of authenticity.",
    attributes: [
      { trait_type: "Artist", value: "M. Tan" },
      { trait_type: "Edition", value: "1 of 1" },
      { trait_type: "Medium", value: "Acrylic on canvas" },
      { trait_type: "Year", value: 2024, display_type: "number" },
    ],
  },
  {
    id: 4, name: "Château Margaux 1982", category: "Wine", color: "#7d1f2f", emoji: "🍷",
    description: "Legendary Bordeaux vintage. NFT acts as the title to the vaulted bottle.",
    attributes: [
      { trait_type: "Vintage", value: 1982, display_type: "number" },
      { trait_type: "Region", value: "Bordeaux" },
      { trait_type: "Producer", value: "Château Margaux" },
      { trait_type: "Bottle #", value: "042" },
    ],
  },
  {
    id: 5, name: "Opus One 2015", category: "Wine", color: "#9b2d3f", emoji: "🍇",
    description: "Napa Valley icon. Stored in a bonded, climate-controlled vault.",
    attributes: [
      { trait_type: "Vintage", value: 2015, display_type: "number" },
      { trait_type: "Region", value: "Napa Valley" },
      { trait_type: "Producer", value: "Opus One" },
      { trait_type: "Bottle #", value: "118" },
    ],
  },
  {
    id: 6, name: "Qing Porcelain Vase", category: "Antique", color: "#2e7d6b", emoji: "🏺",
    description: "Qing Dynasty blue-and-white porcelain. Authenticated and graded.",
    attributes: [
      { trait_type: "Era", value: "Qing Dynasty" },
      { trait_type: "Origin", value: "China" },
      { trait_type: "Material", value: "Porcelain" },
      { trait_type: "Grading", value: "Certified" },
    ],
  },
  {
    id: 7, name: "Ming Bronze Mirror", category: "Antique", color: "#8a6d3b", emoji: "🪞",
    description: "Ming Dynasty cast-bronze mirror with provenance documentation.",
    attributes: [
      { trait_type: "Era", value: "Ming Dynasty" },
      { trait_type: "Origin", value: "China" },
      { trait_type: "Material", value: "Bronze" },
      { trait_type: "Grading", value: "Certified" },
    ],
  },
];

function svg(item: Item): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${item.color}"/>
      <stop offset="1" stop-color="#11131a"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <text x="300" y="300" font-size="180" text-anchor="middle" dominant-baseline="central">${item.emoji}</text>
  <text x="300" y="470" font-size="34" fill="#fff" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700">${item.name}</text>
  <text x="300" y="520" font-size="22" fill="#ffffffcc" text-anchor="middle" font-family="system-ui,sans-serif" letter-spacing="3">${item.category.toUpperCase()}</text>
</svg>`;
}

for (const item of ITEMS) {
  const slug = `${item.id}`;
  writeFileSync(join("metadata", "images", `${slug}.svg`), svg(item));
  const metadata = {
    name: item.name,
    description: item.description,
    image: `${BASE}/images/${slug}.svg`,
    external_url: `${BASE}/${slug}.json`,
    attributes: [{ trait_type: "Category", value: item.category }, ...item.attributes],
  };
  writeFileSync(join("metadata", `${slug}.json`), JSON.stringify(metadata, null, 2));
}
console.log(`Generated ${ITEMS.length} metadata files + images in metadata/`);
