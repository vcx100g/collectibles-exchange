// Generate a varied batch of items -> scripts/ai-items-2.json
//   node scripts/make-items.mjs           (writes 90 items: 15 per category)
import { writeFileSync } from "node:fs";

const pick = (arr, i) => arr[i % arr.length];
const pad = (n) => String(1000 + n).slice(-4);
const N = Number(process.env.PER_CAT || "15");
const items = [];

// ---------------- Wine ----------------
const wineHouses = ["Margaux", "Latour", "Lafite", "Mouton", "Haut-Brion", "Cheval Blanc", "Pétrus", "Ausone", "Montrachet", "Chambertin", "Musigny", "Solaia", "Ornellaia", "Vega Sicilia", "Krug"];
const wineRegions = ["Bordeaux", "Burgundy", "Champagne", "Tuscany", "Napa Valley", "Rioja", "Piedmont", "Douro"];
const wineShots = [
  "a dusty vintage bottle of fine red wine with an elegant aged label on a dark oak cellar table, dramatic warm side lighting, product photography, highly detailed",
  "an old wine bottle with a wax seal beside a crystal glass of red wine, candlelit cellar, rich tones, product photography, highly detailed",
  "a premium wine bottle resting on slate with scattered grapes and a corkscrew, moody studio lighting, highly detailed",
];
for (let i = 0; i < N; i++) {
  const vintage = 1961 + ((i * 7) % 58);
  items.push({
    name: `Château ${pick(wineHouses, i)} ${vintage}`, category: "Wine",
    description: "A rare cellar-aged vintage with impeccable provenance.",
    attributes: [
      { trait_type: "Vintage", value: vintage, display_type: "number" },
      { trait_type: "Region", value: pick(wineRegions, i) },
      { trait_type: "Producer", value: pick(wineHouses, i) },
      { trait_type: "Bottle #", value: pad(i * 37) },
    ],
    prompt: pick(wineShots, i),
  });
}

// ---------------- Painting ----------------
const paintStyles = ["Impressionist", "Baroque", "Renaissance", "Romantic", "Post-Impressionist", "Surrealist", "Expressionist", "Realist"];
const paintSubjects = ["a tranquil harbor at dawn", "a vase of sunflowers", "a misty forest path", "a noble portrait", "a stormy seascape", "a quiet village square", "a moonlit river", "a still life with fruit"];
const paintArtists = ["E. Moreau", "L. Bianchi", "A. Sørensen", "H. Tanaka", "P. Laurent", "M. Costa", "R. Adler", "V. Petrov"];
for (let i = 0; i < N; i++) {
  const year = 1700 + ((i * 23) % 300);
  const style = pick(paintStyles, i), subject = pick(paintSubjects, i);
  items.push({
    name: `${subject.replace(/^a /, "").replace(/^an /, "").replace(/\b\w/, (c) => c.toUpperCase())}`, category: "Painting",
    description: `A ${style.toLowerCase()} masterwork in oils.`,
    attributes: [
      { trait_type: "Artist", value: pick(paintArtists, i) },
      { trait_type: "Medium", value: "Oil on canvas" },
      { trait_type: "Style", value: style },
      { trait_type: "Year", value: year, display_type: "number" },
    ],
    prompt: `a ${style} oil painting of ${subject}, visible brushstrokes, ornate gilded frame on a museum wall, masterpiece, highly detailed`,
  });
}

// ---------------- Farm ----------------
const farmScenes = [
  "a red barn in a golden autumn field at sunset", "a basket of fresh heirloom vegetables on a farmhouse table",
  "a vast wheat field under a dramatic sky", "a restored vintage tractor in a green meadow",
  "free-range hens in a sunny farmyard", "rows of grapevines in a vineyard at golden hour",
  "a rustic chicken coop beside a vegetable garden", "a flock of sheep grazing on rolling hills",
  "a sunflower field stretching to the horizon", "a wooden cart full of pumpkins at harvest",
  "a dairy cow in a lush green pasture", "a lavender field in bloom at dusk",
  "an orchard heavy with ripe apples", "a country farmhouse with a wraparound porch",
  "a barn cat sitting on a hay bale",
];
const farmTypes = ["Landmark", "Produce", "Cropland", "Equipment", "Livestock"];
for (let i = 0; i < N; i++) {
  items.push({
    name: pick(farmScenes, i).replace(/^a /, "").replace(/^an /, "").replace(/\b\w/, (c) => c.toUpperCase()), category: "Farm",
    description: "A slice of pastoral country life.",
    attributes: [
      { trait_type: "Type", value: pick(farmTypes, i) },
      { trait_type: "Origin", value: pick(["Vermont", "Tuscany", "Provence", "Iowa", "Kansas"], i) },
      { trait_type: "Season", value: pick(["Spring", "Summer", "Autumn", "Winter"], i) },
      { trait_type: "Grade", value: "Prime" },
    ],
    prompt: `${pick(farmScenes, i)}, warm golden hour sunlight, rustic countryside, rich colors, photographic, highly detailed, idyllic`,
  });
}

// ---------------- Card ----------------
const creatures = [
  ["a fierce orange dragon breathing fire", "Fire", "Holo Rare", 120],
  ["a small electric yellow mouse creature", "Electric", "Rare", 60],
  ["a giant blue turtle with water cannons", "Water", "Holo Rare", 100],
  ["a psychic feline humanoid glowing purple", "Psychic", "Ultra Rare", 130],
  ["a mischievous purple ghost with a grin", "Ghost", "Rare", 80],
  ["a giant sleepy bear-like creature", "Normal", "Rare", 90],
  ["a blue serpentine sea dragon roaring", "Water", "Holo Rare", 100],
  ["a leafy green dinosaur with a plant bulb", "Grass", "Rare", 80],
  ["a fiery horse with a flaming mane", "Fire", "Rare", 90],
  ["a rock golem with crystal armor", "Rock", "Holo Rare", 110],
  ["a winged bird creature wreathed in flame", "Fire", "Ultra Rare", 120],
  ["an icy fox spirit with frost aura", "Ice", "Holo Rare", 90],
  ["a metallic steel scorpion creature", "Steel", "Rare", 100],
  ["a fairy creature glowing with pink light", "Fairy", "Ultra Rare", 110],
  ["a shadowy wolf with glowing red eyes", "Dark", "Holo Rare", 100],
];
const cardSets = ["Base Set", "Jungle", "Fossil", "Legendary", "Neo Genesis"];
for (let i = 0; i < N; i++) {
  const [desc, type, rarity, hp] = creatures[i % creatures.length];
  items.push({
    name: `${type} Beast #${100 + i}`, category: "Card",
    description: "A holographic collectible monster card.",
    attributes: [
      { trait_type: "Type", value: type },
      { trait_type: "Rarity", value: rarity },
      { trait_type: "HP", value: hp, display_type: "number" },
      { trait_type: "Set", value: pick(cardSets, i) },
    ],
    prompt: `a holographic collectible trading card illustration of ${desc}, dynamic action pose, vibrant fantasy art, foil shine, ornate card border, highly detailed`,
  });
}

// ---------------- Art (digital) ----------------
const artStyles = ["Cyberpunk", "Vaporwave", "Low-poly", "Abstract geometric", "Surreal dreamscape", "Glitch", "Neon noir", "Generative fractal"];
const artSubjects = ["a futuristic city skyline", "a lone astronaut", "a koi pond", "a mountain range", "an abstract portrait", "a cosmic nebula", "a samurai silhouette", "a blooming flower"];
for (let i = 0; i < N; i++) {
  items.push({
    name: `${pick(artStyles, i)} ${pick(artSubjects, i).replace(/^a /, "").replace(/^an /, "")}`, category: "Art",
    description: "A 1-of-1 digital artwork.",
    attributes: [
      { trait_type: "Artist", value: pick(["A. Rivera", "K. Devi", "Nø.7", "Studio Lumen"], i) },
      { trait_type: "Edition", value: "1 of 1" },
      { trait_type: "Medium", value: "Generative / Digital" },
      { trait_type: "Year", value: 2024 + (i % 3), display_type: "number" },
    ],
    prompt: `a ${pick(artStyles, i)} digital artwork of ${pick(artSubjects, i)}, vibrant colors, dramatic lighting, highly detailed, trending digital art`,
  });
}

// ---------------- Antique ----------------
const antiques = [
  ["porcelain vase", "Qing Dynasty", "China", "Porcelain"], ["bronze mirror", "Ming Dynasty", "China", "Bronze"],
  ["gold aureus coin", "Roman Empire", "Rome", "Gold"], ["jade pendant", "Han Dynasty", "China", "Jade"],
  ["silver brooch", "Viking Age", "Scandinavia", "Silver"], ["clay amphora", "Ancient Greece", "Greece", "Terracotta"],
  ["scarab amulet", "New Kingdom", "Egypt", "Faience"], ["iron katana", "Edo Period", "Japan", "Steel"],
  ["ivory netsuke", "Edo Period", "Japan", "Ivory"], ["bronze censer", "Ming Dynasty", "China", "Bronze"],
  ["marble bust", "Roman Empire", "Rome", "Marble"], ["enamel snuff box", "Georgian Era", "England", "Enamel"],
  ["lacquer box", "Heian Period", "Japan", "Lacquer"], ["silver chalice", "Medieval Europe", "France", "Silver"],
  ["terracotta figurine", "Tang Dynasty", "China", "Terracotta"],
];
for (let i = 0; i < N; i++) {
  const [obj, era, origin, mat] = antiques[i % antiques.length];
  items.push({
    name: `${era} ${obj.replace(/\b\w/, (c) => c.toUpperCase())}`, category: "Antique",
    description: "An authenticated antique with documented provenance.",
    attributes: [
      { trait_type: "Era", value: era },
      { trait_type: "Origin", value: origin },
      { trait_type: "Material", value: mat },
      { trait_type: "Grading", value: "Certified" },
    ],
    prompt: `an antique ${mat.toLowerCase()} ${obj}, ${era} ${origin} artifact, weathered patina, displayed on a museum pedestal with soft spotlight, dark background, highly detailed`,
  });
}

writeFileSync("scripts/ai-items-2.json", JSON.stringify(items, null, 2));
console.log(`wrote scripts/ai-items-2.json with ${items.length} items`);
