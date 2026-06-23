import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { graphql, client } from "ponder";
import { and, eq, gte, lte, ilike, inArray, asc, desc, count, sql } from "drizzle-orm";
import { parseEther } from "viem";

const app = new Hono();

// Allow the dApp/admin page (served on a different port) to call this API.
app.use("*", cors());

// Auto-generated GraphQL API + GraphiQL explorer.
app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

// SQL over HTTP (for @ponder/client on the frontend, if desired later).
app.use("/sql/*", client({ db, schema }));

// bigint-safe JSON serializer.
const ser = (rows: any[]) =>
  rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
    ),
  );

// --- Custom REST endpoints powering the (future) admin dashboard + search ---

// Marketplace metrics: volume, fees collected, royalties, counts.
app.get("/stats", async (c) => {
  const sales = await db.select().from(schema.sale);
  const listings = await db.select().from(schema.listing);
  const items = await db.select().from(schema.item);
  let volume = 0n;
  let fees = 0n;
  let royalties = 0n;
  for (const s of sales) {
    volume += s.price;
    fees += s.platformFee;
    royalties += s.royalty;
  }
  return c.json({
    totalItems: items.length,
    activeListings: listings.filter((l) => l.active).length,
    sales: sales.length,
    volumeWei: volume.toString(),
    platformFeesWei: fees.toString(),
    royaltiesWei: royalties.toString(),
  });
});

// Active listings (marketplace feed).
app.get("/listings", async (c) => {
  const rows = await db.select().from(schema.listing);
  return c.json(ser(rows.filter((l) => l.active)));
});

// Full provenance / history for one token.
app.get("/activity/:tokenId", async (c) => {
  const tokenId = BigInt(c.req.param("tokenId"));
  const rows = await db.select().from(schema.activity);
  const filtered = rows
    .filter((r) => r.tokenId === tokenId)
    .sort((a, b) => Number(a.block - b.block));
  return c.json(ser(filtered));
});

// Recent activity across all tokens (newest first) — admin activity feed.
app.get("/recent", async (c) => {
  const rows = await db.select().from(schema.activity);
  const recent = rows.sort((a, b) => Number(b.block - a.block)).slice(0, 25);
  return c.json(ser(recent));
});

// Paginated, filterable site-wide activity feed — powers the public Activity page.
app.get("/feed", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const perPage = Math.min(50, Math.max(1, parseInt(c.req.query("perPage") || "25", 10)));
  const type = c.req.query("type");
  const addr = c.req.query("address")?.toLowerCase();
  let rows = await db.select().from(schema.activity);
  if (type) rows = rows.filter((r) => r.type === type);
  if (addr) rows = rows.filter((r) => String(r.from || "").toLowerCase() === addr || String(r.to || "").toLowerCase() === addr);
  rows.sort((a, b) => Number(b.block - a.block));
  const total = rows.length;
  const slice = rows.slice((page - 1) * perPage, (page - 1) * perPage + perPage);
  return c.json({ total, page, perPage, results: ser(slice) });
});

// Per-user summary — powers the user "My Account" dashboard.
app.get("/user/:address", async (c) => {
  const addr = c.req.param("address").toLowerCase();
  const lc = (v: any) => (v ? String(v).toLowerCase() : v);

  const items = (await db.select().from(schema.item)).filter((i) => lc(i.owner) === addr);
  const listings = (await db.select().from(schema.listing)).filter(
    (l) => l.active && lc(l.seller) === addr,
  );
  const sales = await db.select().from(schema.sale);
  const sold = sales.filter((s) => lc(s.seller) === addr);
  const bought = sales.filter((s) => lc(s.buyer) === addr);
  const activity = (await db.select().from(schema.activity))
    .filter((a) => lc(a.from) === addr || lc(a.to) === addr)
    .sort((x, y) => Number(y.block - x.block))
    .slice(0, 30);

  let grossSoldWei = 0n;
  for (const s of sold) grossSoldWei += s.price;
  let spentWei = 0n;
  for (const b of bought) spentWei += b.price;

  return c.json({
    address: addr,
    itemsOwned: items.length,
    activeListings: listings.length,
    sold: sold.length,
    bought: bought.length,
    grossSoldWei: grossSoldWei.toString(),
    spentWei: spentWei.toString(),
    ownedIds: items.map((i) => i.id.toString()),
    listings: ser(listings),
    activity: ser(activity),
  });
});

// Everything the indexer knows about one token — powers the detail page + modal.
app.get("/item/:tokenId", async (c) => {
  const id = BigInt(c.req.param("tokenId"));
  const [it] = await db.select().from(schema.item).where(eq(schema.item.id, id));
  if (!it) return c.json({ error: "not found" }, 404);
  const [listing] = await db.select().from(schema.listing).where(eq(schema.listing.id, id));
  const sales = (await db.select().from(schema.sale).where(eq(schema.sale.tokenId, id)))
    .sort((a, b) => Number(a.timestamp - b.timestamp));
  const activity = (await db.select().from(schema.activity).where(eq(schema.activity.tokenId, id)))
    .sort((a, b) => Number(a.block - b.block));
  let volume = 0n;
  for (const s of sales) volume += s.price;
  return c.json({
    tokenId: id.toString(),
    owner: it.owner,
    creator: it.creator,
    tokenUri: it.tokenUri,
    mintedAt: it.mintedAt ? Number(it.mintedAt) : null,
    category: it.category,
    name: it.name,
    attrs: it.attrs,
    // only an ACTIVE listing is "for sale"; a cancelled/sold listing row still
    // has its last price but must not surface as a live listing (no Buy button,
    // not treated as the current price by the charts).
    listing: listing && listing.active && listing.price > 0n
      ? { active: listing.active, price: listing.price.toString(), seller: listing.seller, listedAt: Number(listing.listedAt) }
      : null,
    tradeCount: sales.length,
    volumeWei: volume.toString(),
    lastSalePrice: sales.length ? sales[sales.length - 1].price.toString() : null,
    sales: ser(sales),
    activity: ser(activity),
  });
});

// Distinct attribute values among a category's active listings — powers the
// attribute filter dropdowns (Rarity, Region, Vintage, …).
app.get("/facets", async (c) => {
  const cat = c.req.query("category");
  const where = cat
    ? and(eq(schema.listing.active, true), eq(schema.item.category, cat))
    : eq(schema.listing.active, true);
  const rows = await db
    .select({ attrs: schema.item.attrs })
    .from(schema.listing)
    .innerJoin(schema.item, eq(schema.listing.tokenId, schema.item.id))
    .where(where);
  const facets: Record<string, Set<string>> = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries((r.attrs as any) || {})) {
      if (k === "Category") continue;
      (facets[k] ||= new Set()).add(String(v));
    }
  }
  const out: Record<string, string[]> = {};
  for (const [k, set] of Object.entries(facets)) {
    out[k] = [...set].sort((a, b) => {
      const na = Number(a), nb = Number(b);
      return !isNaN(na) && !isNaN(nb) ? nb - na : a.localeCompare(b);
    });
  }
  return c.json(out);
});

// Server-side search over active listings (joined with item category/name).
app.get("/search", async (c) => {
  const text = (c.req.query("q") || "").trim();
  const cats = (c.req.query("category") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const minP = c.req.query("minPrice");
  const maxP = c.req.query("maxPrice");
  const sort = c.req.query("sort") || "newest";
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const perPage = Math.min(50, Math.max(1, parseInt(c.req.query("perPage") || "20", 10)));

  const conds: any[] = [eq(schema.listing.active, true)];
  if (text) conds.push(ilike(schema.item.name, `%${text}%`));
  if (cats.length) conds.push(inArray(schema.item.category, cats));
  if (minP) { try { conds.push(gte(schema.listing.price, parseEther(minP))); } catch {} }
  if (maxP) { try { conds.push(lte(schema.listing.price, parseEther(maxP))); } catch {} }
  // attribute filters: any ?attr_<Trait>=<Value> (e.g. attr_Rarity, attr_Region, attr_Vintage)
  for (const [key, val] of new URL(c.req.url).searchParams.entries()) {
    if (key.startsWith("attr_") && val) {
      conds.push(sql`(${schema.item.attrs} ->> ${key.slice(5)}) = ${String(val)}`);
    }
  }
  const where = and(...conds);

  const order =
    sort === "price-asc" ? asc(schema.listing.price)
    : sort === "price-desc" ? desc(schema.listing.price)
    : desc(schema.listing.tokenId);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.listing)
    .innerJoin(schema.item, eq(schema.listing.tokenId, schema.item.id))
    .where(where);

  const rows = await db
    .select({
      tokenId: schema.listing.tokenId,
      price: schema.listing.price,
      seller: schema.listing.seller,
      category: schema.item.category,
      name: schema.item.name,
    })
    .from(schema.listing)
    .innerJoin(schema.item, eq(schema.listing.tokenId, schema.item.id))
    .where(where)
    .orderBy(order)
    .limit(perPage)
    .offset((page - 1) * perPage);

  return c.json({ total: Number(total), page, perPage, results: ser(rows) });
});

// Home sections: latest trades, most-valued listings, most-traded items.
app.get("/home", async (c) => {
  const sales = await db.select().from(schema.sale);
  const listings = (await db.select().from(schema.listing)).filter((l) => l.active);

  const latestTrades = [...sales]
    .sort((a, b) => Number(b.timestamp - a.timestamp))
    .slice(0, 12)
    .map((s) => ({
      tokenId: s.tokenId.toString(),
      price: s.price.toString(),
      buyer: s.buyer,
      seller: s.seller,
      timestamp: Number(s.timestamp),
    }));

  const mostValued = [...listings]
    .sort((a, b) => (a.price > b.price ? -1 : 1))
    .slice(0, 12)
    .map((l) => ({ tokenId: l.tokenId.toString(), price: l.price.toString(), seller: l.seller }));

  const counts = new Map();
  for (const s of sales) {
    const k = s.tokenId.toString();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const mostTraded = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tokenId, trades]) => {
      const l = listings.find((x) => x.tokenId.toString() === tokenId);
      return { tokenId, trades, price: l ? l.price.toString() : null, listed: !!l };
    });

  return c.json({ latestTrades, mostValued, mostTraded });
});

// Market overview: per-sale points (price + running cumulative volume) for the
// home chart, daily buckets, and headline totals.
app.get("/market", async (c) => {
  const sales = (await db.select().from(schema.sale)).sort((a, b) => Number(a.timestamp - b.timestamp));
  let cum = 0n, vol = 0n, fees = 0n, roy = 0n, high = 0n;
  const points = sales.map((s, i) => {
    cum += s.price; vol += s.price; fees += s.platformFee; roy += s.royalty;
    if (s.price > high) high = s.price;
    return {
      i,
      t: Number(s.timestamp),
      tokenId: s.tokenId.toString(),
      priceWei: s.price.toString(),
      cumVolWei: cum.toString(),
    };
  });
  const byDay = new Map<number, { count: number; vol: bigint }>();
  for (const s of sales) {
    const d = Math.floor(Number(s.timestamp) / 86400) * 86400;
    const e = byDay.get(d) || { count: 0, vol: 0n };
    e.count++; e.vol += s.price;
    byDay.set(d, e);
  }
  const daily = [...byDay.entries()].sort((a, b) => a[0] - b[0])
    .map(([day, e]) => ({ day, count: e.count, volumeWei: e.vol.toString() }));
  const avg = sales.length ? vol / BigInt(sales.length) : 0n;
  return c.json({
    points,
    daily,
    totals: {
      sales: sales.length,
      volumeWei: vol.toString(),
      platformFeesWei: fees.toString(),
      royaltiesWei: roy.toString(),
      avgWei: avg.toString(),
      highWei: high.toString(),
    },
  });
});

export default app;
