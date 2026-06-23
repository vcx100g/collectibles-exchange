import { ponder } from "ponder:registry";
import { item, listing, sale, activity } from "ponder:schema";

const ZERO = "0x0000000000000000000000000000000000000000";
const evId = (event: any, suffix = "") =>
  `${event.transaction.hash}-${event.log.logIndex}${suffix}`;

// ---- Collectible ----

// Transfer covers mint (from == 0x0) and every ownership change.
ponder.on("Collectible:Transfer", async ({ event, context }) => {
  const { from, to, tokenId } = event.args as any;
  const ts = event.block.timestamp;

  await context.db
    .insert(item)
    .values({ id: tokenId, owner: to, creator: from === ZERO ? to : null, mintedAt: ts })
    .onConflictDoUpdate({ owner: to });

  await context.db.insert(activity).values({
    id: evId(event),
    type: from === ZERO ? "mint" : "transfer",
    tokenId,
    from,
    to,
    price: null,
    timestamp: ts,
    block: event.block.number,
    txHash: event.transaction.hash,
  });
});

// ItemMinted enriches the item with creator, metadata URI, and the searchable
// category + name pulled from the off-chain metadata.
const META_BASE = process.env.METADATA_INTERNAL || "http://web/metadata";
ponder.on("Collectible:ItemMinted", async ({ event, context }) => {
  const { tokenId, creator, tokenURI } = event.args as any;
  let category: string | null = null;
  let name: string | null = null;
  try {
    const m = await (await fetch(`${META_BASE}/${tokenId}.json`)).json();
    name = m?.name ?? null;
    category = (m?.attributes || []).find((a: any) => a.trait_type === "Category")?.value ?? null;
  } catch {}
  await context.db
    .insert(item)
    .values({ id: tokenId, owner: creator, creator, tokenUri: tokenURI, mintedAt: event.block.timestamp, category, name })
    .onConflictDoUpdate({ creator, tokenUri: tokenURI, category, name });
});

// ---- Marketplace ----

ponder.on("Marketplace:ItemListed", async ({ event, context }) => {
  const { seller, nft, tokenId, price } = event.args as any;
  await context.db
    .insert(listing)
    .values({ id: tokenId, nft, tokenId, seller, price, active: true, listedAt: event.block.timestamp })
    .onConflictDoUpdate({ seller, price, active: true, listedAt: event.block.timestamp });
  await context.db.insert(activity).values({
    id: evId(event),
    type: "list",
    tokenId,
    from: seller,
    to: null,
    price,
    timestamp: event.block.timestamp,
    block: event.block.number,
    txHash: event.transaction.hash,
  });
});

ponder.on("Marketplace:ItemUpdated", async ({ event, context }) => {
  const { seller, tokenId, newPrice } = event.args as any;
  await context.db.update(listing, { id: tokenId }).set({ price: newPrice, active: true });
  await context.db.insert(activity).values({
    id: evId(event),
    type: "update",
    tokenId,
    from: seller,
    to: null,
    price: newPrice,
    timestamp: event.block.timestamp,
    block: event.block.number,
    txHash: event.transaction.hash,
  });
});

ponder.on("Marketplace:ItemCanceled", async ({ event, context }) => {
  const { seller, tokenId } = event.args as any;
  await context.db.update(listing, { id: tokenId }).set({ active: false });
  await context.db.insert(activity).values({
    id: evId(event),
    type: "cancel",
    tokenId,
    from: seller,
    to: null,
    price: null,
    timestamp: event.block.timestamp,
    block: event.block.number,
    txHash: event.transaction.hash,
  });
});

ponder.on("Marketplace:ItemBought", async ({ event, context }) => {
  const { buyer, tokenId, price, seller, platformFee, royalty, royaltyReceiver } = event.args as any;
  await context.db.update(listing, { id: tokenId }).set({ active: false });
  await context.db.insert(sale).values({
    id: evId(event),
    tokenId,
    buyer,
    seller,
    price,
    platformFee,
    royalty,
    royaltyReceiver,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
  await context.db.insert(activity).values({
    id: evId(event, "-sale"),
    type: "sale",
    tokenId,
    from: seller,
    to: buyer,
    price,
    timestamp: event.block.timestamp,
    block: event.block.number,
    txHash: event.transaction.hash,
  });
});
