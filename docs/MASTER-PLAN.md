# VaultX — Collectibles Exchange · Master Plan

A small NFT trading platform for **unique 1-of-1 collectibles** — trading cards,
digital art, wine, and antiques (古董). Pokémon cards are just one demo category;
the same contracts and UI handle every asset type because the *category* lives in
metadata, not in code.

> **Researched & current as of June 2026.** Every version number, testnet, faucet,
> provider, and fee below was verified against live 2026 sources (see
> [Sources](#sources)). The biggest risk in this space is following a 2020-era
> tutorial — almost all of them are now broken (see [2020-tutorial traps](#appendix-2020-tutorial-traps-we-avoided)).

---

## 1. Status snapshot

| Layer | What it is | Status |
|-------|-----------|--------|
| **Layer 1 — On-chain core** | ERC-721 collectible + non-custodial marketplace (list/buy/cancel + fee + royalty + provenance), Bootstrap/ethers UI, local chain | ✅ **Built & tested** (14/14 tests pass, deployed + seeded on local chain, UI served) |
| **Layer 2 — Fiat & accounts** | USD↔ETH on/off-ramp, embedded wallets for non-crypto buyers | 📋 Planned (this doc) |
| **Layer 3 — Complete platform** | Auth, indexer/backend, admin dashboard, upload pipeline, MVP hardening, physical-goods settlement | 📋 Planned (this doc) |

**Decisions locked with the user:** ERC-721 (unique items) · Hardhat 3 (in Docker) ·
local-first · Bootstrap 5 + vanilla JS (no React) · platform fee **+** creator royalty.

---

## 2. Architecture (the three layers)

```
                          ┌──────────────────────────────────────────┐
   LAYER 3                │  Indexer (Ponder → Postgres)  ·  Admin UI │
   complete platform      │  Auth (thirdweb)  ·  Upload→IPFS pipeline │
                          └───────────────┬──────────────────────────┘
                                          │ reads events / serves search+history
   LAYER 2                ┌───────────────┴──────────────┐
   fiat & accounts        │  Fiat on/off-ramp (Transak)  │  USD ⇄ ETH, KYC by provider
                          └───────────────┬──────────────┘
                                          │ delivers ETH / the NFT to the user's wallet
   LAYER 1   ┌──────────────────────┐     │     ┌──────────────────────────┐
   on-chain  │  Collectible.sol     │◄────┴─────│  Marketplace.sol         │
   CORE      │  ERC-721 + Enumerable│           │  non-custodial           │
   (BUILT)   │  + URIStorage + 2981 │           │  list/buy/cancel         │
             │  mintItem(uri)       │           │  + 2.5% platform fee     │
             └──────────┬───────────┘           │  + 5% royalty (ERC-2981) │
                        │ tokenURI →             │  + Pausable + Reentrancy │
              ┌─────────┴────────┐               │  events = provenance     │
              │ metadata + images│               └────────────┬─────────────┘
              │ (CDN / IPFS)     │                            │
              └──────────────────┘             ┌──────────────┴──────────────┐
                                               │ Frontend: Bootstrap 5 +      │
                                               │ ethers v6 + MetaMask         │
                                               └──────────────────────────────┘
```

---

## 3. Pinned stack (2026, verified)

| Layer | Choice | Version / note |
|-------|--------|----------------|
| Language | Solidity | `^0.8.24`, compiled with **0.8.28** (latest stable 0.8.35) |
| Contracts lib | OpenZeppelin Contracts | **5.6.x** (v4 patterns are broken — see appendix) |
| Toolchain | **Hardhat 3** (`hardhat-toolbox-mocha-ethers`) | runs in Docker; Ignition for deploy |
| Local chain | Hardhat node | chainId **31337**, RPC `:8545` |
| Public testnet | **Sepolia** | chainId 11155111 (Goerli & Holesky are dead) |
| Web3 JS | **ethers.js** | **6.17.0**, jsDelivr `+esm` CDN (web3.js is archived) |
| UI | **Bootstrap** | **5.3.8** CDN (Foundation is on life-support) |
| Fiat ramp (L2) | **Transak** | on+off-ramp, MoR, covers US **+ Malaysia**, sandbox |
| Auth (L3) | **thirdweb Connect** | embedded wallets, ~1,000 MAW free |
| Indexer (L3) | **Ponder** → Postgres | one Node service, ~$10–25/mo hosted |
| Storage (L3) | **Pinata** (IPFS) via backend | free tier; API key server-side only |

---

## 4. Layer 1 — On-chain core ✅ BUILT

### What exists
- **`contracts/Collectible.sol`** — ERC-721 + `Enumerable` (wallets can list owned
  tokens) + `URIStorage` (per-token metadata) + `ERC2981` (5% creator royalty to the
  minter) + `Ownable`. `mintItem(uri)` is open so any test account can create an item.
- **`contracts/Marketplace.sol`** — non-custodial: the seller keeps the NFT and grants
  `setApprovalForAll`; the contract moves it only on sale. Every sale splits
  **2.5% platform fee → 5% creator royalty → seller**, all pull-based
  (`withdrawProceeds`). `ReentrancyGuard` + checks-effects-interactions on `buyItem`,
  `Pausable` emergency stop, `Ownable` admin (`setPlatformFee`, capped at 10%).
  Buy/sell **history is emitted as events** (`ItemListed/ItemBought/...`).
- **`test/CollectiblesExchange.ts`** — 14 tests: mint/royalty/enumeration, listing
  rules, the 3-way fee split, overpayment refund, withdraw, pause, and a
  **reentrancy-attacker** contract that proves the guard + CEI block re-entry.
- **`frontend/`** — Bootstrap 5 + ethers v6 dApp: connect MetaMask (auto-adds the local
  network), browse marketplace by category, mint, list/cancel, buy, withdraw proceeds,
  and an item **detail view with the ownership + sale-price provenance timeline**.
- **Docker** — `compose.yml` runs everything (`hardhat` service = chain + tasks,
  `web` = nginx). `node_modules` is a named volume; nothing pollutes the host.

### How to run it
```bash
cd ~/collectibles-exchange
sudo docker compose run --rm hardhat npm install      # once
sudo docker compose run --rm hardhat npm test         # 14 passing
sudo docker compose up -d hardhat                      # local chain on :8545
sudo docker compose exec hardhat npx hardhat run scripts/gen-metadata.ts
sudo docker compose exec hardhat npx hardhat run scripts/deploy.ts --network localhost
sudo docker compose up -d web                          # dApp on http://localhost:8080
```
Then in the browser (with MetaMask): import a local account (key
`0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` = the deterministic
account #1 buyer; account #0 `0xf39F…2266` is the seeded seller), connect, and trade.

### What's verified vs. what needs a browser
- ✅ Contracts compile, **14/14 tests pass**, deploy + seed persist on the live node
  (`balanceOf(deployer) == 8`), all static assets + metadata serve over HTTP.
- ⏳ The MetaMask click-flow (connect/mint/list/buy) must be exercised by hand in a real
  browser — it can't be tested headlessly (no wallet extension).

---

## 5. Layer 2 — Fiat (USD ⇄ ETH) & accounts

**The hard truth:** a smart contract can never charge a card or send USD. Fiat means
embedding a **regulated third-party provider** that is the *merchant-of-record* and runs
KYC/AML — so **you do not need a money-transmitter / VASP license.** That offload is the
entire reason to use a ramp instead of touching fiat yourself.

### Recommended provider: **Transak**
Best single drop-in for *this* brief because it is the only top option that covers
**both on-ramp and off-ramp** AND **both the US and Malaysia** (you're MY-based):
- Integration: `npm i @transak/transak-sdk` → `new Transak({ apiKey, environment: 'STAGING', defaultCryptoCurrency: 'ETH', productsAvailed: 'BUY,SELL' }).init()`.
- **Sandbox** (STAGING) with test cards → build the whole flow with **zero real money**.
- Merchant-of-record; licenses: FCA, FinCEN MSB + US state MTLs, EU VASP/MiCA, FINTRAC, AUSTRAC, FIU-IND.
- Malaysia: 7+ local payment methods; US: most states (NY excluded almost everywhere).
- Off-ramp (sell ETH→bank) supported.

| Provider | On-ramp | Off-ramp | Malaysia | Sandbox | Card fee (all-in) | Note |
|----------|:------:|:-------:|:--------:|:------:|------------------|------|
| **Transak** ✅ | ✓ | ✓ | ✓ | ✓ | ~3.5–5.5% | **the pick** |
| MoonPay | ✓ | ✓ | ✓ | ✓ | ~4.5% + $3.99 min | widest footprint |
| Coinbase Onramp | ✓ | ✓* | partial | ✓ | ~3.99% (0% USDC) | off-ramp needs CB account |
| Stripe Onramp | ✓ | ✗ | ✗ | ✓ | ~1.5% + $0.30 | cheapest but US+EU, on-ramp only |
| Onramper (aggregator) | ✓ | ✓ | ✓ | ✓ | provider pass-through | one API → many ramps, auto-failover |

### "Pay with card → receive the NFT" (no-crypto buyer)
For a buyer with no wallet at all, **thirdweb Payments** can call your *custom* payable
`buyItem` directly from a card payment and deliver into an auto-created embedded wallet
(0% fiat fee on its tier). Transak One can also run arbitrary marketplace calldata. This
ties Layer 2 to Layer 3's auth (the same provider mints the wallet the NFT lands in).

### The full fee stack (USD-funded purchase) — your "after network fee, then our fee", corrected
```
Buyer pays  $100 USD
  1. On-ramp provider fee   ~1–5% (card) + FX spread   → Transak/MoonPay keeps
     └─ USD → ETH
  2. Network / gas fee       set by Ethereum            → validators (NOT us, NOT provider)
  3. OUR platform fee        2.5%                        → us (Marketplace feeRecipient)
  4. Creator royalty         5% (ERC-2981)               → original minter
  ──────────────────────────────────────────────────────
     Seller receives the remainder
```
Gas can later be **sponsored/abstracted** (ERC-4337 paymaster / smart accounts) so the
buyer never sees it — a Layer 3 nicety, not needed for the demo.

### Testnet reality
Real on-ramps deliver **real mainnet ETH for real money** — they will **not** fund your
local/Sepolia chain. So the fiat flow is demoed in the provider **sandbox**, separate
from the local chain. Plan: keep trading on local/Sepolia; show the Transak **sandbox
widget** as the "buy ETH with card" step.

---

## 6. Layer 3 — Completing the platform

### 6a. Auth (your "simple auth")
**thirdweb Connect** — one `ConnectButton` shows email/Google/Apple/passkey **and**
MetaMask/500+ external wallets in one modal; every user (social or crypto) ends up with a
real self-custodial address that can hold an NFT. Free to ~1,000 monthly active wallets.
- Under the hood it does SIWE (sign a message, no password) and issues a **verifiable
  JWT**; your backend verifies it (JWKS) and sets a session cookie.
- **Admin gating:** keep a small **allowlist of admin wallet addresses**; on every admin
  API call, check the authenticated address against it. Enforce on the **backend**, never
  by hiding UI. (Runner-up provider: Privy, now owned by Stripe.)

### 6b. Backend / indexer
Reading history/search straight from chain events gets slow. Run **Ponder** (TypeScript
indexer) → **Postgres**, one small Node service (~$10–25/mo on Railway/Render). Ponder
tails `ItemListed/Bought/Cancelled/Transfer`, upserts to Postgres, and **auto-serves
GraphQL + SQL-over-HTTP + custom REST (Hono)** — the same process powers the frontend
search/history *and* the admin dashboard. Stores: items, users, listings cache,
sale-history ledger, fee ledger. (Alternatives: The Graph subgraph; a hand-rolled
ethers event listener for the very simplest case.)

### 6c. Admin dashboard (your "admin dashboard")
**Don't add a framework** — build `/admin.html` as a wallet-gated route in the existing
Bootstrap app. Split the controls:
- **On-chain (owner-only contract calls via ethers):** `setPlatformFee`, `pause`/`unpause`,
  `withdrawProceeds` (platform fees). Use a **Safe multisig** as the owner in production,
  not a single EOA.
- **Off-chain (DB rows toggled via `fetch`):** categories, featured ordering, curation,
  moderation/delist flags, KYC flags, metrics (volume, sales, fees collected, active
  listings — read from the Ponder DB).
- Gate with two layers: UI gate (admin allowlist) **and** backend enforcement on every
  admin endpoint.

### 6d. Create-listing / upload pipeline
Seller uploads an image → **your backend** (`POST /api/upload`) pins it to **Pinata**
(IPFS) using `PINATA_JWT` kept **only in server env**, builds the metadata JSON
(`{name, description, image: ipfs://<cid>, attributes}` with the right per-category
attribute form), pins that, returns `tokenURI = ipfs://<metadataCid>` → client calls
`mintItem(tokenURI)`. **Never put the pinning key in the browser.** (Demo shortcut, used
in Layer 1: static metadata on the nginx host instead of IPFS.)

### 6e. MVP completeness checklist (demo → launchable)
- **Contracts:** AccessControl (roles, Safe multisig owner) · Pausable on mint/list/buy ·
  ReentrancyGuard + CEI everywhere funds move (✅ already in Layer 1) · a test/audit pass ·
  local → Sepolia → (audited) mainnet.
- **Legal:** Terms of Service, Privacy Policy, risk disclosures. Heavy KYC/AML is handled
  by the on-ramp provider, but you still need basic terms and must **not** market the ramp
  as your own regulated service (Malaysia's SC regulates digital-asset exchanges).
- **Ops:** error monitoring, rate-limiting/anti-spam, responsive UI (✅ Bootstrap), hosting
  for frontend + indexer + Postgres, CI.

### 6f. ⚠️ Physical goods (wine & 古董) — bigger than code
An NFT is only a **certificate**. For a real bottle or antique the platform must solve
**custody/vaulting, authentication/grading, shipping, and redemption** (burn or flag the
NFT when the physical item is claimed) + disputes. This is a **logistics + legal
business**, not a smart-contract feature. Real RWA platforms (BlockBar/Cult Wine for
wine, Courtyard for cards) operate bonded vaults and a `redeem` flow. **Minimum** for our
platform: a `redeem(tokenId)` that burns/flags the NFT, plus an off-chain
vault/authentication partner. *Digital art & cards sidestep all of this* — start there;
add physical-goods settlement only when there's a real vaulting partner.

---

## 7. Build roadmap

1. ✅ **Layer 1 core** — contracts, tests, local chain, Bootstrap/ethers UI. *(done)*
2. **Layer 1 polish** — manual MetaMask E2E pass; optional: deploy to **Sepolia** + verify
   on Etherscan (needs a faucet + Alchemy RPC + one Etherscan v2 key).
3. **L3 indexer first** — stand up Ponder + Postgres so history/search/admin have a fast
   backend (also unblocks the admin metrics).
4. **L3 auth** — drop in thirdweb Connect; add the admin allowlist + `/admin.html`.
5. **L3 upload pipeline** — backend `POST /api/upload` → Pinata → `mintItem`.
6. **L2 fiat** — embed Transak sandbox (buy ETH) + thirdweb Payments (card→NFT).
7. **MVP hardening** — Pausable/Safe owner, ToS/Privacy, monitoring, deploy.
8. **Physical goods** — only with a vault/authentication partner; add `redeem`.

---

## 8. Rough cost (small scale)
- Layer 1: **$0** (all local/Docker).
- Sepolia: **$0** (free testnet ETH + free RPC tier).
- Layer 3 hosting: **~$10–25/mo** (one Node service + managed Postgres).
- Auth: **$0** to ~1,000 monthly active wallets (thirdweb).
- Fiat: **$0** to integrate; fees are paid by end-users in the quote (~1–5%).
- Mainnet deploy + a light audit: the real spend when you go live.

---

## Appendix: 2020-tutorial traps we avoided
- **OpenZeppelin v5**: `Ownable(msg.sender)` is now **required** in the constructor;
  `Counters.sol` **deleted** (use `uint256`); `_beforeTokenTransfer` hooks **gone**
  (override `_update`); `ReentrancyGuard`/`Pausable` moved to `utils/`.
- **ethers v6 ≠ v5**: `BrowserProvider` (not `Web3Provider`), `await getSigner()` is async,
  `ethers.parseEther` (not `ethers.utils.*`), `BigInt` not `BigNumber`.
- **web3.js is archived** (Mar 2025) — don't use it.
- **Goerli & Holesky are dead** — use **Sepolia**.
- **Etherscan API v2** — one key for all chains; v1 deprecated Aug 2025.
- **Truffle is sunset; SafeMath unnecessary; `.transfer()` payouts are an anti-pattern**
  (use `.call` + pull payments — done in Layer 1).
- **Hardhat 3 ≠ 2** — `defineConfig` + a `plugins` array + `network.connect()`/`create()`;
  viem/mocha-ethers toolboxes; Ignition deploys.
- **Real fiat on-ramps won't fund a testnet** — demo fiat in the provider sandbox.

## Sources
Verified June 2026 across: soliditylang.org, docs.openzeppelin.com, hardhat.org,
getfoundry.sh, docs.ethers.org, getbootstrap.com, OpenSea metadata standard, Sepolia/
Etherscan/Alchemy docs, and 2026 provider/comparison pages for Transak, MoonPay,
Coinbase, Stripe, Ramp, Onramper, thirdweb, Privy, Ponder, The Graph, and Pinata.
(Full URL list captured in the research run.)
