# VaultX — Collectibles Exchange

A small NFT trading platform for **unique 1-of-1 collectibles** — trading cards, digital
art, wine, and antiques (古董). Each item is one ERC-721 NFT; the asset *category* lives in
metadata, so the same contracts and UI handle every type.

**Layer 1 (this repo, working today):** Solidity contracts + a non-custodial marketplace
(list / buy / cancel, 2.5% platform fee, 5% creator royalty, provenance history) + a
Bootstrap 5 / ethers.js dApp, all running on a local chain in Docker.

See [`docs/MASTER-PLAN.md`](docs/MASTER-PLAN.md) for the full three-layer plan
(adds fiat USD↔ETH, auth, an indexer, an admin dashboard, and physical-goods settlement).

## Stack
Solidity `^0.8.24` (OpenZeppelin 5.6) · Hardhat 3 (in Docker) · ethers v6 · Bootstrap 5.3 ·
local chain (chainId 31337). No npm/node on the host — everything runs in containers.

## Quick start

```bash
# 1. install deps (once)
sudo docker compose run --rm hardhat npm install

# 2. run the test suite (14 passing)
sudo docker compose run --rm hardhat npm test

# 3. start the local blockchain (chainId 31337, RPC on :8545)
sudo docker compose up -d hardhat

# 4. generate sample metadata, then deploy + seed the contracts
sudo docker compose exec hardhat npx hardhat run scripts/gen-metadata.ts
sudo docker compose exec hardhat npx hardhat run scripts/deploy.ts --network localhost

# 5. serve the dApp
sudo docker compose up -d web        # → http://localhost:8080
```

Re-running step 4 redeploys; it rewrites `frontend/config.js` with the new addresses+ABIs.
Restarting the `hardhat` container wipes chain state — redeploy (step 4) afterwards.

## Try it in the browser
1. Install **MetaMask** and add a network: RPC `http://localhost:8545`, **Chain ID 31337**,
   symbol `ETH` (the dApp also offers to add it automatically on connect).
2. **Import a test account** with one of the local private keys printed by the node, e.g.
   - Seller (owns the 8 seeded items): `0xf39F…2266`
   - Buyer: import key `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   ⚠️ These keys are public and for local testing only — never use them on a real network.
3. Open `http://localhost:8080`, **Connect**, then browse / buy / list / mint, and click an
   item image to see its **provenance timeline** (mint → each sale with prices).

## Layout
```
contracts/      Collectible.sol (ERC-721) + Marketplace.sol + test/ReentrantBuyer.sol
test/           Hardhat (mocha+ethers) test suite — 14 tests
ignition/       Ignition deploy module (canonical deploy)
scripts/        deploy.ts (deploy+seed+write config.js) · gen-metadata.ts
metadata/       generated sample items (8 across 4 categories) + SVG images
frontend/       index.html + app.js (Bootstrap 5 + ethers v6) + generated config.js
nginx/          static-serving config for the web container
compose.yml     hardhat (chain+tasks) + web (nginx) services
docs/           MASTER-PLAN.md
```

## Common commands
| Task | Command |
|------|---------|
| Compile | `sudo docker compose run --rm hardhat npm run compile` |
| Test | `sudo docker compose run --rm hardhat npm test` |
| Start chain | `sudo docker compose up -d hardhat` |
| Deploy + seed | `sudo docker compose exec hardhat npx hardhat run scripts/deploy.ts --network localhost` |
| Serve dApp | `sudo docker compose up -d web` |
| Stop everything | `sudo docker compose down` |

## Status
✅ Contracts compile · 14/14 tests pass · deploy+seed verified on the live node · dApp +
metadata serve over HTTP. The MetaMask click-flow is exercised manually in the browser
(can't be tested headlessly). Layers 2–3 are planned in `docs/MASTER-PLAN.md`.
