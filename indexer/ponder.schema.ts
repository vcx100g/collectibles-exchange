import { onchainTable, index } from "ponder";

// One row per collectible. owner is kept current via Transfer; creator/tokenUri
// are filled in from ItemMinted.
export const item = onchainTable("item", (t) => ({
  id: t.bigint().primaryKey(), // tokenId
  creator: t.hex(),
  owner: t.hex().notNull(),
  tokenUri: t.text(),
  mintedAt: t.bigint(),
  category: t.text(), // from metadata (for server-side search)
  name: t.text(),
}));

// Current marketplace listing per token (active flips false on cancel/sale).
export const listing = onchainTable("listing", (t) => ({
  id: t.bigint().primaryKey(), // tokenId (single collectible contract)
  nft: t.hex().notNull(),
  tokenId: t.bigint().notNull(),
  seller: t.hex().notNull(),
  price: t.bigint().notNull(),
  active: t.boolean().notNull().default(false),
  listedAt: t.bigint().notNull(),
}));

// Completed sales — the fee ledger powering admin metrics.
export const sale = onchainTable("sale", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  tokenId: t.bigint().notNull(),
  buyer: t.hex().notNull(),
  seller: t.hex().notNull(),
  price: t.bigint().notNull(),
  platformFee: t.bigint().notNull(),
  royalty: t.bigint().notNull(),
  royaltyReceiver: t.hex(),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
}));

// Full event log = provenance / buy-sell history per token.
export const activity = onchainTable(
  "activity",
  (t) => ({
    id: t.text().primaryKey(), // txHash-logIndex(-suffix)
    type: t.text().notNull(), // mint | transfer | list | update | cancel | sale
    tokenId: t.bigint().notNull(),
    from: t.hex(),
    to: t.hex(),
    price: t.bigint(),
    timestamp: t.bigint().notNull(),
    block: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    tokenIdx: index().on(table.tokenId),
  }),
);
