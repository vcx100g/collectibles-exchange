import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/// Deploys the Layer 1 on-chain core:
///   - Collectible : the ERC-721 collectible contract
///   - Marketplace : non-custodial list/buy/cancel with a 2.5% platform fee
///
/// The deployer (account #0) is set as the owner of both contracts and as the
/// initial platform fee recipient.
export default buildModule("CollectiblesExchange", (m) => {
  const deployer = m.getAccount(0);

  // 250 bps = 2.5% platform fee.
  const platformFeeBps = 250n;

  const collectible = m.contract("Collectible", [deployer]);
  const marketplace = m.contract("Marketplace", [deployer, deployer, platformFeeBps]);

  return { collectible, marketplace };
});
