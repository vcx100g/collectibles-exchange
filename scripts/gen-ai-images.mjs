// Generate AI art + metadata for the items in scripts/ai-items.json using
// Cloudflare Workers AI (flux-1-schnell). Writes metadata/<id>.{jpg|png} and
// metadata/<id>.json for ids START..START+N-1.
//
// Run in the hardhat container (has node + fetch, no chain needed):
//   docker compose exec -e CF_TOKEN=... -e START_ID=9 hardhat node scripts/gen-ai-images.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TOKEN = process.env.CF_TOKEN;
const ACCOUNT = process.env.CF_ACCOUNT || "381c5ac90625f62d6a143f7e27e9ba34";
const BASE = process.env.METADATA_BASE_URL || "http://100.70.161.82:8080/metadata";
const START = Number(process.env.START_ID || "9");
const MODEL = "@cf/black-forest-labs/flux-1-schnell";

if (!TOKEN) { console.error("CF_TOKEN env required"); process.exit(1); }

const items = JSON.parse(readFileSync(join("scripts", "ai-items.json"), "utf8"));

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

const extOf = (buf) =>
  buf[0] === 0xff ? "jpg" : buf.slice(0, 4).toString("latin1") === "\x89PNG" ? "png" : "jpg";

let ok = 0, fail = 0;
for (let i = 0; i < items.length; i++) {
  const id = START + i;
  const it = items[i];
  try {
    let buf;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { buf = await genImage(it.prompt); break; }
      catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 1500)); }
    }
    const ext = extOf(buf);
    writeFileSync(join("metadata", "images", `${id}.${ext}`), buf);
    const metadata = {
      name: it.name,
      description: it.description,
      image: `${BASE}/images/${id}.${ext}`,
      external_url: `${BASE}/${id}.json`,
      attributes: [{ trait_type: "Category", value: it.category }, ...it.attributes],
    };
    writeFileSync(join("metadata", `${id}.json`), JSON.stringify(metadata, null, 2));
    ok++;
    console.log(`✓ ${id}  ${it.category.padEnd(10)} ${it.name}  (${Math.round(buf.length / 1024)}KB ${ext})`);
  } catch (e) {
    fail++;
    console.log(`✗ ${id}  ${it.name}: ${e.message}`);
  }
}
console.log(`\ndone: ${ok} ok, ${fail} failed (ids ${START}..${START + items.length - 1})`);
