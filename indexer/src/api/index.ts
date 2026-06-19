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

export default app;
