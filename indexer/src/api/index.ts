import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { graphql, client } from "ponder";

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
    listings: ser(listings),
    activity: ser(activity),
  });
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

export default app;
