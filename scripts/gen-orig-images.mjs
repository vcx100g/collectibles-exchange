// Generate AI art for the original placeholder items (ids 0-7), replacing their
// emoji-gradient SVGs. Saves metadata/images/<id>.jpg and repoints the metadata
// image field to <id>.webp (the file optimize step produces). Does NOT touch
// names/attributes.
//   docker compose exec -e CF_TOKEN=... hardhat node scripts/gen-orig-images.mjs
import { readFileSync, writeFileSync } from "node:fs";

const TOKEN = process.env.CF_TOKEN;
const ACCOUNT = process.env.CF_ACCOUNT || "381c5ac90625f62d6a143f7e27e9ba34";
const MODEL = "@cf/black-forest-labs/flux-1-schnell";
if (!TOKEN) { console.error("CF_TOKEN required"); process.exit(1); }

const PROMPTS = {
  0: "a holographic collectible trading card illustration of a fierce orange dragon creature breathing fire, dynamic action pose, vibrant fantasy art, foil shine, ornate card border, highly detailed",
  1: "a holographic collectible trading card illustration of a cute yellow electric mouse creature with red cheeks crackling with lightning, dynamic pose, vibrant fantasy art, foil shine, ornate card border, highly detailed",
  2: "a 1-of-1 generative digital artwork, neon cyberpunk abstract composition with glowing geometric forms, vibrant magenta and cyan, highly detailed digital art",
  3: "an abstract acrylic painting with flowing organic shapes and bold vivid colors, gallery wall, framed, highly detailed",
  4: "a dusty vintage bottle of Château Margaux Bordeaux red wine with an elegant aged label on a dark oak cellar table, dramatic warm side lighting, product photography, highly detailed",
  5: "a premium bottle of Opus One Napa Valley red wine on a slate surface with grapes, moody studio lighting, product photography, highly detailed",
  6: "an antique Qing dynasty blue-and-white porcelain vase with intricate dragon motifs, weathered glaze, displayed on a museum pedestal with soft spotlight, dark background, highly detailed",
  7: "an antique Ming dynasty bronze mirror with aged green patina and intricate relief carving, museum display, dramatic lighting, dark background, highly detailed",
};

async function genImage(prompt) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt, steps: 6 }),
  });
  const j = await r.json();
  if (!j.success || !j.result?.image) throw new Error(JSON.stringify(j.errors || j).slice(0, 200));
  return Buffer.from(j.result.image, "base64");
}

for (const [id, prompt] of Object.entries(PROMPTS)) {
  let buf;
  for (let a = 0; a < 3; a++) {
    try { buf = await genImage(prompt); break; }
    catch (e) { if (a === 2) throw e; await new Promise((r) => setTimeout(r, 1500)); }
  }
  writeFileSync(`metadata/images/${id}.jpg`, buf);
  // repoint metadata image -> <id>.webp (produced by the cwebp optimize step)
  const p = `metadata/${id}.json`;
  const m = JSON.parse(readFileSync(p, "utf8"));
  m.image = m.image.replace(/\/images\/[^/]*$/, `/images/${id}.webp`);
  writeFileSync(p, JSON.stringify(m, null, 2));
  console.log(`✓ ${id}  (${Math.round(buf.length / 1024)}KB jpg) -> metadata repointed`);
}
console.log("done: 0-7");
